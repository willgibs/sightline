import type { Tuning } from '../../config/tuning';
import { Blocks, footprintContains, type Collider } from '../kernel/world/colliders';
import { Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import { sightLine, type QueryView } from '../kernel/world/query';
import { Solids } from '../kernel/world/solids';
import { COST_PER_METRE, GridSearch, type MoveCost, type SearchOptions } from '../kernel/world/search';
import type { World } from '../kernel/world/world';

/**
 * Navigation (E1): where a guard walks, on the one grid search (kernel/world/search.ts).
 * The Last of Us's two tiers, on Sightline's two layers: coarse routes over the 2.5 m map
 * layer, and the 0.5 m site layer over the camp, where a coarse cell can't represent a
 * doorway. Inside the site a route is found on the fine layer alone; a route that leaves
 * the site is coarse, with its ends refined from the site's edge to the start or the goal.
 *
 * A route is found by A* with the search's fixed tie-breaks and an iteration budget (rule
 * 18): it says when it ran out, and finding no route is an answer, never a stall. The
 * cells are string-pulled into a few waypoints, checked against the same clearance the
 * grid was built with, and the motor walks them (followRoute): no second authority over
 * where bodies go, and no state outside the guard who walks.
 *
 * Everything here reads the static world the mind holds: the grid and the colliders.
 * A route knows nothing of bodies; a guard who is stalled by one steps around it (below).
 */

/** A route: the waypoints left to walk, in order, and how the walk is going. Plain data, in the guard's state. */
export interface Route {
  /** x, z of each waypoint, flattened; the last is where the route ends. */
  points: number[];
  /** The next waypoint, as an index into `points` / 2. */
  next: number;
  /** The best distance to the next waypoint so far, and the tick it was reached. */
  best: number;
  progressTick: number;
  /** While stepping around something in the way (a body, a fence's post): the way he goes, and until when. */
  sideX: number;
  sideZ: number;
  sideUntil: number;
  /** How many times the walk has stalled and stepped aside. */
  stalls: number;
}

export function emptyRoute(): Route {
  return { points: [], next: 0, best: Infinity, progressTick: 0, sideX: 0, sideZ: 0, sideUntil: -1, stalls: 0 };
}

/** Why a route was or wasn't found, for the reason a brain reports and the bench counts. */
export type RouteResult = 'found' | 'no-route' | 'out-of-budget';

export interface FindOptions {
  /** Where to count the cells expanded (TickContext.work): the search's own contract. */
  work?: SearchOptions['work'];
  /** Prices or closes moves on the fine layer: a door, a dangerous lane (the coarse layer has its own). */
  cost?: MoveCost;
}

/** The navigator for a world: the two layers' searches, kept for the world's life. Nothing carries over between calls. */
export class Navigator {
  private readonly site: GridSearch;
  private readonly map: GridSearch;
  private readonly siteCells: number[] = [];
  private readonly mapCells: number[] = [];
  private readonly raw: number[] = [];
  private readonly ids: number[] = [];
  /** The static world, as a view for sight lines: no bodies, no entities' shapes. */
  private readonly view: QueryView;

  constructor(
    private readonly world: World,
    private tuning: Tuning,
  ) {
    this.site = new GridSearch(world.grid.site);
    this.map = new GridSearch(world.grid.map);
    this.view = { world, solids: new Solids(world.colliders), bodies: [] };
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
  }

  /**
   * Finds a route for a body at (ax, az) to (bx, bz), written to `out`. With `route`
   * possibly left empty: 'no-route' or 'out-of-budget' write nothing but an empty route.
   */
  find(ax: number, az: number, bx: number, bz: number, opts: FindOptions, out: Route): RouteResult {
    out.points.length = 0;
    out.next = 0;
    out.best = Infinity;
    out.progressTick = 0;
    out.sideUntil = -1;
    out.stalls = 0;
    const N = this.tuning.brain.nav;
    const raw = this.raw;
    raw.length = 0;
    const site = this.site.layer;
    const inA = cellIndex(site, ax, az) >= 0;
    const inB = cellIndex(site, bx, bz) >= 0;
    if (inA && inB) {
      const r = this.searchLayer(this.site, ax, az, bx, bz, N.siteExpansions, opts, this.siteCells);
      if (r === 'found') {
        this.appendCells(site, this.siteCells);
        return this.finish(ax, az, bx, bz, out);
      }
      // A fine search that ran out of budget falls back on the coarse layer.
      if (r === 'no-route') return 'no-route';
    }
    // Coarse: over the map layer, refined at either end inside the site.
    const r = this.searchLayer(this.map, ax, az, bx, bz, N.mapExpansions, opts, this.mapCells);
    if (r !== 'found') return r;
    this.stitch(ax, az, bx, bz, inA, inB, opts);
    return this.finish(ax, az, bx, bz, out);
  }

  /** Searches one layer between the nearest walkable cells to two points. */
  private searchLayer(search: GridSearch, ax: number, az: number, bx: number, bz: number, maxExpansions: number, opts: FindOptions, out: number[]): RouteResult {
    const L = search.layer;
    const start = this.nearestWalkable(L, ax, az);
    const goal = this.nearestWalkable(L, bx, bz);
    if (start < 0 || goal < 0) return 'no-route';
    const r = search.path(start, goal, { maxExpansions, work: opts.work, cost: search === this.site ? opts.cost : undefined }, out);
    if (r.found) return 'found';
    return r.exhausted ? 'out-of-budget' : 'no-route';
  }

  /**
   * The route's cells, in order: the coarse path, with the part inside the site replaced by
   * fine cells to the point where the coarse path crosses the site's edge.
   */
  private stitch(ax: number, az: number, bx: number, bz: number, inA: boolean, inB: boolean, opts: FindOptions): void {
    const site = this.site.layer;
    const map = this.map.layer;
    const coarse = this.mapCells;
    const N = this.tuning.brain.nav;
    let first = 0;
    let last = coarse.length - 1;
    // Leaving the site: fine cells from the start to the last coarse cell still inside it.
    if (inA) {
      let k = 0;
      while (k + 1 < coarse.length && cellIndex(site, cellX(map, coarse[k + 1]!), cellZ(map, coarse[k + 1]!)) >= 0) k++;
      if (this.searchLayer(this.site, ax, az, cellX(map, coarse[k]!), cellZ(map, coarse[k]!), N.siteExpansions, opts, this.siteCells) === 'found') {
        this.appendCells(site, this.siteCells);
        first = k + 1;
      }
    }
    // Entering the site: fine cells from the first coarse cell inside it to the goal.
    let tail = false;
    if (inB && last >= first) {
      let k = last;
      while (k - 1 >= first && cellIndex(site, cellX(map, coarse[k - 1]!), cellZ(map, coarse[k - 1]!)) >= 0) k--;
      if (this.searchLayer(this.site, cellX(map, coarse[k]!), cellZ(map, coarse[k]!), bx, bz, N.siteExpansions, opts, this.siteCells) === 'found') {
        last = k - 1;
        tail = true;
      }
    }
    for (let k = first; k <= last; k++) this.pushRaw(cellX(map, coarse[k]!), cellZ(map, coarse[k]!));
    if (tail) this.appendCells(site, this.siteCells);
  }

  private appendCells(L: GridLayer, cells: readonly number[]): void {
    for (const c of cells) this.pushRaw(cellX(L, c), cellZ(L, c));
  }

  private pushRaw(x: number, z: number): void {
    const r = this.raw;
    const n = r.length;
    if (n >= 2 && r[n - 2] === x && r[n - 1] === z) return;
    r.push(x, z);
  }

  /** The route's waypoints from its raw cells: string-pulled, and ending as near the goal as a body can stand. */
  private finish(ax: number, az: number, bx: number, bz: number, out: Route): RouteResult {
    const raw = this.raw;
    const pts = out.points;
    pts.length = 0;
    const N = this.tuning.brain.nav;
    // The goal itself, if the last cell's centre can reach it.
    const m = raw.length;
    if (m >= 2 && this.clear(raw[m - 2]!, raw[m - 1]!, bx, bz)) {
      raw.push(bx, bz);
    }
    // String-pull: from each anchor, walk as far as a straight clear segment reaches, by
    // doubling then bisecting the look-ahead over the raw cells. Bounded by the raw count.
    let px = ax;
    let pz = az;
    let i = 0;
    const count = raw.length / 2;
    while (i < count) {
      // A look-ahead no further than maxAhead cells at a time: long routes are pulled in steps.
      let lo = i;
      let hi = i;
      let step = 1;
      while (hi + step < count && hi + step - i <= N.pullAhead && this.clear(px, pz, raw[(hi + step) * 2]!, raw[(hi + step) * 2 + 1]!)) {
        lo = hi + step;
        hi = lo;
        step *= 2;
      }
      // Bisect between the last clear and the first that wasn't.
      let top = Math.min(count - 1, hi + step);
      while (top - lo > 1) {
        const mid = (lo + top) >> 1;
        if (mid - i <= N.pullAhead && this.clear(px, pz, raw[mid * 2]!, raw[mid * 2 + 1]!)) lo = mid;
        else top = mid;
      }
      const wx = raw[lo * 2]!;
      const wz = raw[lo * 2 + 1]!;
      pts.push(wx, wz);
      px = wx;
      pz = wz;
      i = lo + 1;
    }
    return 'found';
  }

  /**
   * The nearest walkable cell to a point, by the grid: its own cell, or the first in
   * widening rings (nearest first, in a fixed order). −1 if none is near.
   */
  private nearestWalkable(L: GridLayer, x: number, z: number): number {
    const R = this.tuning.brain.nav.snapRadius;
    const i0 = Math.max(0, Math.min(L.nx - 1, Math.floor((x - L.x0) / L.cell)));
    const j0 = Math.max(0, Math.min(L.nz - 1, Math.floor((z - L.z0) / L.cell)));
    const cells = Math.ceil(R / L.cell);
    let best = -1;
    let bestD = Infinity;
    for (let d = 0; d <= cells; d++) {
      for (let dj = -d; dj <= d; dj++) {
        for (let di = -d; di <= d; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== d) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
          const c = j * L.nx + i;
          if ((L.flags[c]! & Cell.Walkable) === 0) continue;
          const cx = L.x0 + (i + 0.5) * L.cell - x;
          const cz = L.z0 + (j + 0.5) * L.cell - z;
          const dd = cx * cx + cz * cz;
          if (dd < bestD) {
            bestD = dd;
            best = c;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** True if a body can stand at (x, z). */
  standable(x: number, z: number): boolean {
    const site = cellIndex(this.world.grid.site, x, z);
    if (site >= 0) return (this.world.grid.site.flags[site]! & Cell.Walkable) !== 0;
    const m = cellIndex(this.world.grid.map, x, z);
    return m >= 0 && (this.world.grid.map.flags[m]! & Cell.Walkable) !== 0;
  }

  /** True if something solid breaks the line from (ax, az) to (bx, bz) at height `h` above the ground, at both ends. */
  blockedFrom(ax: number, az: number, bx: number, bz: number, h: number): boolean {
    const w = this.world;
    const ay = w.terrain.heightAt(ax, az) + h;
    const by = w.terrain.heightAt(bx, bz) + h;
    return !sightLine(this.view, ax, ay, az, bx, by, bz, Blocks.Sight);
  }

  /**
   * True if a body can walk the straight segment: every sample stands on a walkable cell
   * (the finest layer there) and fits among the colliders, by the test the grid was built
   * with (kernel/world/grid.ts), so a pulled route never cuts what the search went around.
   */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const { world } = this;
    const G = this.tuning.gen.grid;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return true;
    const site = world.grid.site;
    const map = world.grid.map;
    const r = G.bodyRadius;
    const ids = this.ids;
    world.colliders.query(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r, ids);
    const step = this.tuning.brain.nav.sampleStep;
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 1; s < n; s++) {
      const px = ax + (dx * s) / n;
      const pz = az + (dz * s) / n;
      const fine = cellIndex(site, px, pz);
      const flags = fine >= 0 ? site.flags[fine]! : map.flags[cellIndex(map, px, pz)] ?? 0;
      if ((flags & Cell.Walkable) === 0) return false;
      const ground = world.terrain.heightAt(px, pz);
      for (let q = 0; q < ids.length; q++) {
        const c: Collider = world.colliders.list[ids[q]!]!;
        if ((c.flags & Blocks.Move) !== 0 && c.y1 > ground + G.stepHeight && c.y0 < ground + G.bodyHeight && footprintContains(c, px, pz, r)) return false;
      }
    }
    return true;
  }
}

function cellX(L: GridLayer, c: number): number {
  return L.x0 + ((c % L.nx) + 0.5) * L.cell;
}

function cellZ(L: GridLayer, c: number): number {
  return L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell;
}

const worlds = new WeakMap<World, Navigator>();

/** The world's navigator, made once: its scratch is rewritten by every search, and nothing is kept between them. */
export function navigatorOf(world: World, tuning: Tuning): Navigator {
  let n = worlds.get(world);
  if (!n) worlds.set(world, (n = new Navigator(world, tuning)));
  n.setTuning(tuning);
  return n;
}

/** A walk's next step, as the motor takes it. */
export interface Steering {
  wishX: number;
  wishZ: number;
  /** Which way to face: along the walk. */
  dirX: number;
  dirZ: number;
}

export function emptySteering(): Steering {
  return { wishX: 0, wishZ: 0, dirX: 0, dirZ: 0 };
}

/** What a walk is doing now. */
export type Walk = 'walking' | 'arrived' | 'stalled';

/**
 * One tick of walking a route: steers `self` at `speed` toward the next waypoint, moving
 * on as each is reached. A walk that stops gaining on its waypoint for `stallSeconds` is
 * stalled: something the grid doesn't know is in the way. It then steps aside for a moment,
 * alternating sides each time, and comes back to the route; after `stallsMax` stalls
 * it says so, and the brain decides what to do (find another route, give up).
 *
 * Doesn't draw: a pure function of the route, the body and the tuning.
 */
export function followRoute(route: Route, x: number, z: number, speed: number, id: number, tick: number, tuning: Tuning, out: Steering): Walk {
  const N = tuning.brain.nav;
  out.wishX = 0;
  out.wishZ = 0;
  out.dirX = 0;
  out.dirZ = 0;
  if (route.next * 2 >= route.points.length) return 'arrived';
  const hz = tuning.sim.tickHz;
  // Stepping aside: straight toward the side point until it's over.
  if (tick < route.sideUntil) {
    out.wishX = route.sideX * speed;
    out.wishZ = route.sideZ * speed;
    out.dirX = route.sideX;
    out.dirZ = route.sideZ;
    return 'walking';
  }
  let px = route.points[route.next * 2]!;
  let pz = route.points[route.next * 2 + 1]!;
  let dx = px - x;
  let dz = pz - z;
  let d = Math.sqrt(dx * dx + dz * dz);
  // On to the next waypoint once this one is reached.
  while (d < N.arrive && route.next * 2 + 2 < route.points.length) {
    route.next++;
    route.best = Infinity;
    route.stalls = 0;
    px = route.points[route.next * 2]!;
    pz = route.points[route.next * 2 + 1]!;
    dx = px - x;
    dz = pz - z;
    d = Math.sqrt(dx * dx + dz * dz);
  }
  if (d < N.arrive) {
    route.next++;
    return 'arrived';
  }
  if (d < route.best - N.progress) {
    route.best = d;
    route.progressTick = tick;
  } else if ((tick - route.progressTick) / hz >= N.stallSeconds) {
    route.stalls++;
    route.best = d;
    route.progressTick = tick;
    if (route.stalls > N.stallsMax) return 'stalled';
    // Step aside, perpendicular to the way he was going: right first, then left, by a
    // rule that depends only on who he is and how many times this walk has stalled.
    const side = (id + route.stalls) % 2 === 0 ? 1 : -1;
    const ux = dx / d;
    const uz = dz / d;
    route.sideX = -uz * side;
    route.sideZ = ux * side;
    route.sideUntil = tick + Math.round(N.sideSeconds * hz);
    out.wishX = route.sideX * speed;
    out.wishZ = route.sideZ * speed;
    out.dirX = route.sideX;
    out.dirZ = route.sideZ;
    return 'walking';
  }
  const ux = dx / d;
  const uz = dz / d;
  // Slow into the last waypoint so a guard doesn't overrun where he was going.
  const last = route.next * 2 + 2 >= route.points.length;
  const v = last && d < N.slowDown ? Math.max(N.minSpeed, (speed * d) / N.slowDown) : speed;
  out.wishX = ux * v;
  out.wishZ = uz * v;
  out.dirX = ux;
  out.dirZ = uz;
  return 'walking';
}

/** The length of a route, metres, from (x, z): over what's left of it. */
export function routeLength(route: Route, x: number, z: number): number {
  let len = 0;
  let px = x;
  let pz = z;
  for (let i = route.next * 2; i + 1 < route.points.length; i += 2) {
    const dx = route.points[i]! - px;
    const dz = route.points[i + 1]! - pz;
    len += Math.sqrt(dx * dx + dz * dz);
    px = route.points[i]!;
    pz = route.points[i + 1]!;
  }
  return len;
}

/** Search cost units per metre, for moves a cost function prices. */
export const NAV_COST_PER_METRE = COST_PER_METRE;
