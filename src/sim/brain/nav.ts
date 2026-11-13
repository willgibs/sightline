import type { Tuning } from '../../config/tuning';
import { datan2, dtanDeg } from '../kernel/core/detmath';
import { Blocks, footprintContains, type Collider } from '../kernel/world/colliders';
import { CLIMB_SLACK, Cell, Edge, cellIndex, storeyAt, type GridLayer, type Stair } from '../kernel/world/grid';
import { sightLine, type QueryView } from '../kernel/world/query';
import { Solids } from '../kernel/world/solids';
import { COST_PER_METRE, GridSearch, components, landmarkTables, type Bounds, type MoveCost, type SearchOptions } from '../kernel/world/search';
import type { Ground } from './mind';

/**
 * Navigation (E1): where a guard walks, on the one grid search (kernel/world/search.ts).
 * The Last of Us's two tiers, on Sightline's two layers: coarse routes over the 2.5 m map
 * layer, and the 0.5 m site layer over the camp, where a coarse cell can't represent a
 * doorway. Inside the site a route is found on the fine layer alone. A route with one end
 * inside comes out by a field flooded over the fine layer toward the side of the site the
 * far end lies on, and reaches the far end by one flooded over the map layer, each once for
 * the world's life; a short search over the map layer joins them outside the camp. The coarse layer can't see out of a
 * building, where its cells are a sealed pocket, and a ridge a kilometre away is beyond what
 * one search can afford. A route with neither end inside is coarse.
 *
 * A route is found by A* with the search's fixed tie-breaks and an iteration budget (rule
 * 18): it says when it ran out, and finding no route is an answer, never a stall. Inside
 * the site it aims by landmarks (below): a camp is walls with a few ways through them, where
 * the straight-line estimate sends a search into every corner of the wrong side first. The
 * cells are string-pulled into a few waypoints, checked against the same clearance the
 * grid was built with, and the motor walks them (followRoute): no second authority over
 * where bodies go, and no state outside the guard who walks.
 *
 * A route keeps off ground too steep to climb, as the motor will hold a body to it: out in
 * the valley it takes no walk the map has marked (grid.ts, Edge.EastSteep), and no stretch
 * of it is pulled straight across such ground (`clear`). The map's cells answer for the
 * ground under their middles only, and a route that went by them alone ran a man at a face
 * he couldn't get up, to stall there and be sent the same way again.
 *
 * Everything here reads the static world the mind holds: the grid, the ground and the
 * colliders. A route knows nothing of bodies; a guard who is stalled by one steps around it
 * (below).
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
  /** While stepping around something in the way (a body, a fence's post): the way he goes, and until when at the latest. -1 when he isn't. */
  sideX: number;
  sideZ: number;
  sideUntil: number;
  /** How many times the walk has stalled and stepped aside. */
  stalls: number;
}

/** Farther than any route: 'nothing yet', as a plain finite number, so a route survives the state's codec. */
const FAR = 1e30;

export function emptyRoute(): Route {
  return { points: [], next: 0, best: FAR, progressTick: 0, sideX: 0, sideZ: 0, sideUntil: -1, stalls: 0 };
}

/** Adds a leg's waypoints to a route's, without repeating the one the two meet at. */
function appendPoints(points: number[], leg: readonly number[]): void {
  const n = points.length;
  let k = n >= 2 && leg.length >= 2 && points[n - 2] === leg[0] && points[n - 1] === leg[1] ? 2 : 0;
  for (; k < leg.length; k++) points.push(leg[k]!);
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
  /** The site layer and the storeys above it, one index space: a route that has an end upstairs. The site's own search where there are no storeys. */
  private readonly stacked: GridSearch;
  private readonly map: GridSearch;
  /** The way to the site's rim from anywhere on the map, and the way out to each side of it from anywhere in the site: flooded the first time something asks. */
  private rim: GridSearch | null = null;
  private exits: Int32Array[] | null = null;
  private readonly rimCells: number[] = [];
  private readonly exitCells: number[] = [];
  private readonly siteCells: number[] = [];
  private readonly mapCells: number[] = [];
  private readonly raw: number[] = [];
  private readonly ids: number[] = [];
  /** The legs of a route with an end upstairs (findLevels), while it is put together: down a flight, over the ground, up a flight. */
  private readonly legs: readonly [Route, Route, Route] = [emptyRoute(), emptyRoute(), emptyRoute()];
  /** What the fine layer's searches aim by (siteAid): made once for the world, or again if the tuning asks for more or fewer. */
  private aid: SiteAid | null = null;
  /** The static world, as a view for sight lines: no bodies, no entities' shapes. */
  private readonly view: QueryView;

  constructor(
    private readonly world: Ground,
    private tuning: Tuning,
  ) {
    this.site = new GridSearch(world.grid.site);
    this.stacked = world.grid.storeys.length > 0 ? new GridSearch(world.grid.site, world.grid.storeys, world.grid.stairs) : this.site;
    this.map = new GridSearch(world.grid.map);
    // The kernel's queries read the terrain and the tree crowns of a world and nothing more, which is ground.
    this.view = { world: world as QueryView['world'], solids: new Solids(world.colliders), bodies: [] };
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
  }

  /**
   * Finds a route for a body at (ax, az) to (bx, bz), written to `out`. With `route`
   * possibly left empty: 'no-route' or 'out-of-budget' write nothing but an empty route.
   * `ay` and `by` are the heights of the ends' feet where one may be on an upper floor: a
   * body upstairs, or a goal upstairs. A route is still points in the plane: walking toward
   * the head of a flight is what takes a body up it.
   */
  find(ax: number, az: number, bx: number, bz: number, opts: FindOptions, out: Route, ay?: number, by?: number): RouteResult {
    out.points.length = 0;
    out.next = 0;
    out.best = FAR;
    out.progressTick = 0;
    out.sideUntil = -1;
    out.stalls = 0;
    // An end on an upper floor: the levels' own search.
    const aLevel = ay === undefined ? -1 : storeyAt(this.world.grid, ax, ay, az);
    const bLevel = by === undefined ? -1 : storeyAt(this.world.grid, bx, by, bz);
    if (aLevel >= 0 || bLevel >= 0) return this.findLevels(ax, az, aLevel, bx, bz, bLevel, opts, out);
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
    // A priced or closed door isn't in the fields: they're the open camp's.
    if (inA !== inB && !opts.cost) {
      const via = this.viaRim(ax, az, bx, bz, inA, opts);
      return via === 'found' ? this.finish(ax, az, bx, bz, out) : via;
    }
    // Coarse: over the map layer, refined at either end inside the site.
    const r = this.searchLayer(this.map, ax, az, bx, bz, N.mapExpansions, opts, this.mapCells);
    if (r !== 'found') return r;
    this.stitch(ax, az, bx, bz, inA, inB, opts);
    return this.finish(ax, az, bx, bz, out);
  }

  /**
   * A route with an end on an upper floor. A floor is joined to the ground by its flight and
   * by nothing else, so the route is three legs at most, and each is found as cheaply as its
   * kind allows:
   * - between an end upstairs and the foot of its floor's flight, a search of that storey
   *   alone (flightLeg), a few hundred cells;
   * - the ground between, from a foot to the other end or to the other end's own flight, as
   *   any route on the ground: by landmarks inside the site, by the fields and the coarse
   *   layer where an end lies beyond it.
   * Two ends on one floor are a search of that floor.
   *
   * One search over the whole stacked space finds the same way and costs far more. It aims
   * straight at an end that has walls and a floor between, where the landmarks' tables don't
   * reach: tens of thousands of cells from across a camp, and out of budget for the relief
   * coming to the target's door from the road.
   */
  private findLevels(ax: number, az: number, aLevel: number, bx: number, bz: number, bLevel: number, opts: FindOptions, out: Route): RouteResult {
    const N = this.tuning.brain.nav;
    if (aLevel === bLevel) {
      const start = this.cellOn(aLevel, ax, az);
      const goal = this.cellOn(bLevel, bx, bz);
      if (start < 0 || goal < 0) return 'no-route';
      const r = this.stacked.path(start, goal, { maxExpansions: N.siteExpansions, work: opts.work, cost: this.onOneLevel }, this.siteCells);
      if (!r.found) return r.exhausted ? 'out-of-budget' : 'no-route';
      this.pullLevels(ax, az, bx, bz, out);
      return 'found';
    }
    const stairs = this.world.grid.stairs;
    const [first, ground, last] = this.legs;
    first.points.length = 0;
    last.points.length = 0;
    // Where the ground leg runs between: an end on the ground, or the foot of an upstairs end's flight.
    let gx = ax;
    let gz = az;
    let hx = bx;
    let hz = bz;
    if (aLevel >= 0) {
      const stair = stairs.find((st) => st.storey === aLevel);
      if (!stair) return 'no-route';
      const r = this.flightLeg(stair, ax, az, true, opts, first);
      if (r !== 'found') return r;
      gx = stair.footX;
      gz = stair.footZ;
    }
    if (bLevel >= 0) {
      const stair = stairs.find((st) => st.storey === bLevel);
      if (!stair) return 'no-route';
      const r = this.flightLeg(stair, bx, bz, false, opts, last);
      if (r !== 'found') return r;
      hx = stair.footX;
      hz = stair.footZ;
    }
    const r = this.find(gx, gz, hx, hz, opts, ground);
    if (r !== 'found') return r;
    appendPoints(out.points, first.points);
    appendPoints(out.points, ground.points);
    appendPoints(out.points, last.points);
    return 'found';
  }

  /**
   * The leg of a route between a point on an upper floor and the foot of that floor's flight:
   * down it (`toFoot`), or up it. Searched from the floor either way: from up there a search
   * reaches nothing but the floor's own cells until it comes to the foot, which ends it.
   */
  private flightLeg(stair: Stair, x: number, z: number, toFoot: boolean, opts: FindOptions, out: Route): RouteResult {
    const from = this.cellOn(stair.storey, x, z);
    if (from < 0) return 'no-route';
    const r = this.stacked.path(from, stair.foot, { maxExpansions: this.tuning.brain.nav.siteExpansions, work: opts.work }, this.siteCells);
    if (!r.found) return r.exhausted ? 'out-of-budget' : 'no-route';
    if (toFoot) {
      this.pullLevels(x, z, stair.footX, stair.footZ, out);
    } else {
      this.siteCells.reverse();
      this.pullLevels(stair.footX, stair.footZ, x, z, out);
    }
    return 'found';
  }

  /** Closes the flights to a search: one between two ends on a floor has no business off it. */
  private readonly onOneLevel: MoveCost = (from, to, length) => {
    const n = this.stacked.layer.nx * this.stacked.layer.nz;
    return (from < n) !== (to < n) ? -1 : length;
  };

  /** The walkable cell nearest a point on a level: −1 is the site layer, in this search's index space. */
  private cellOn(level: number, x: number, z: number): number {
    if (level < 0) return this.nearestWalkable(this.world.grid.site, x, z);
    const lv = this.stacked.levels[level]!;
    const c = this.nearestWalkable(lv.layer, x, z);
    return c < 0 ? -1 : lv.base + c;
  }

  /**
   * Waypoints from a cell path that crosses levels: pulled taut within each level (each
   * level's `clear`), and the two ends of each stair kept, so nothing is pulled across one.
   * The goal itself last, if the last cell can reach it.
   */
  private pullLevels(ax: number, az: number, bx: number, bz: number, out: Route): void {
    const cells = this.siteCells;
    const pts = out.points;
    pts.length = 0;
    const raw: Array<{ x: number; z: number; level: number }> = cells.map((c) => {
      const lv = this.stacked.levelOf(c);
      const local = c - lv.base;
      const level = lv.base === 0 ? -1 : this.stacked.levels.indexOf(lv);
      return { x: cellX(lv.layer, local), z: cellZ(lv.layer, local), level };
    });
    // Where the path takes a flight, its waypoints are the flight's own two ends, on its middle
    // line (grid.ts), not the middles of the cells nearest them: those lie up to half a cell to
    // one side, and the line between them runs a body into the flight's wall or its rail.
    for (let t = 0; t + 1 < raw.length; t++) {
      if (raw[t]!.level === raw[t + 1]!.level) continue;
      const lower = raw[t]!.level < 0 ? t : t + 1;
      const upper = lower === t ? t + 1 : t;
      const flight = this.world.grid.stairs.find((s) => s.foot === cells[lower] && this.stacked.levels[s.storey]!.base + s.head === cells[upper]);
      if (!flight) continue;
      raw[lower]!.x = flight.footX;
      raw[lower]!.z = flight.footZ;
      raw[upper]!.x = flight.headX;
      raw[upper]!.z = flight.headZ;
    }
    const N = this.tuning.brain.nav;
    let px = ax;
    let pz = az;
    let i = 0;
    while (i < raw.length) {
      const level = raw[i]!.level;
      let end = i;
      while (end + 1 < raw.length && raw[end + 1]!.level === level) end++;
      let k = i;
      // The far end of a flight is a waypoint of its own. A line from the near end to a cell
      // beyond it is clear on the new level (under the floor, or over the landing) and isn't
      // a way a body can go: it would walk past the stairs and never take them.
      if (i > 0) {
        pts.push(raw[i]!.x, raw[i]!.z);
        px = raw[i]!.x;
        pz = raw[i]!.z;
        k = i + 1;
      }
      while (k <= end) {
        let far = k;
        for (let j = k + 1; j <= end && j - k <= N.pullAhead; j++) {
          if (this.clearAt(level, px, pz, raw[j]!.x, raw[j]!.z)) far = j;
        }
        pts.push(raw[far]!.x, raw[far]!.z);
        px = raw[far]!.x;
        pz = raw[far]!.z;
        k = far + 1;
      }
      i = end + 1;
    }
    const last = raw[raw.length - 1]!;
    // The goal itself, unless the last waypoint is it already (a leg that ends at a flight's foot).
    if ((px !== bx || pz !== bz) && this.clearAt(last.level, px, pz, bx, bz)) pts.push(bx, bz);
  }

  /** As `clear`, on a level: −1 is the ground; a storey is walked at its floor's height, on its own layer. */
  private clearAt(level: number, ax: number, az: number, bx: number, bz: number): boolean {
    if (level < 0) return this.clear(ax, az, bx, bz);
    const { world } = this;
    const storey = world.grid.storeys[level]!;
    const G = this.tuning.gen.grid;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return true;
    const step = this.tuning.brain.nav.sampleStep;
    const n = Math.max(1, Math.ceil(len / step));
    const r = G.bodyRadius;
    const ids = this.ids;
    world.colliders.query(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r, ids);
    // Only what stands at this floor's height can be in the way, and the lookup's box holds the
    // whole building under it as well: a hundred shapes and more, asked about at every sample. The
    // ones a body here could walk into are sorted out once. A pulled leg asks this for every cell
    // of it, and with every shape asked at every sample two such routes were 2 ms of one tick.
    const lo = storey.y + G.stepHeight;
    const hi = storey.y + G.bodyHeight;
    let kept = 0;
    for (let q = 0; q < ids.length; q++) {
      const col = world.colliders.list[ids[q]!]!;
      if ((col.flags & Blocks.Move) !== 0 && col.y1 > lo && col.y0 < hi) ids[kept++] = ids[q]!;
    }
    for (let s = 1; s <= n; s++) {
      const px = ax + (dx * s) / n;
      const pz = az + (dz * s) / n;
      const c = cellIndex(storey.layer, px, pz);
      if (c < 0 || (storey.layer.flags[c]! & Cell.Walkable) === 0) return false;
      for (let q = 0; q < kept; q++) if (footprintContains(world.colliders.list[ids[q]!]!, px, pz, r)) return false;
    }
    return true;
  }

  /**
   * Builds what routes need, ahead of the first tick: the fields are the one slow thing here.
   * Where the fine layer covers the whole map (a camp built by hand) no route has an end outside it.
   */
  prepare(): void {
    this.siteAid();
    const s = this.site.layer;
    const m = this.map.layer;
    if (s.x0 <= m.x0 && s.z0 <= m.z0 && s.x0 + s.nx * s.cell >= m.x0 + m.nx * m.cell && s.z0 + s.nz * s.cell >= m.z0 + m.nz * m.cell) return;
    this.rimField();
    this.exitFields();
  }

  /**
   * A route with one end inside the site: out by the fine field to the site's edge, by the
   * coarse field between the rim and the far end, and joined by a search round the camp.
   */
  private viaRim(ax: number, az: number, bx: number, bz: number, inA: boolean, opts: FindOptions): RouteResult {
    const site = this.site.layer;
    const field = this.rimField();
    const map = field.layer;
    const outer = this.nearestWalkable(map, inA ? bx : ax, inA ? bz : az, true);
    if (outer < 0 || field.cost[outer]! < 0) return 'no-route';
    const coarse = this.rimCells;
    coarse.length = 0;
    for (let c = outer; c !== -1; c = field.parent[c]!) coarse.push(c);
    const rim = coarse[coarse.length - 1]!;
    const inner = this.nearestWalkable(site, inA ? ax : bx, inA ? az : bz);
    if (inner < 0) return 'no-route';
    // Out on the side he's going to, or the nearest side he can get out on.
    const exits = this.exitFields();
    const side = sideOf(site, cellX(map, rim), cellZ(map, rim));
    let way: Int32Array | null = null;
    for (let k = 0; k < SIDES && !way; k++) {
      const turn = k % 2 === 1 ? (k + 1) / 2 : -k / 2;
      const steps = exits[(side + turn + SIDES) % SIDES]!;
      if (steps[inner] !== UNREACHED) way = steps;
    }
    if (!way) return 'no-route';
    const fine = this.exitCells;
    fine.length = 0;
    for (let c = inner; c !== -1; c = way[c]!) fine.push(c);
    const door = fine[fine.length - 1]!;
    const r = this.searchLayer(this.map, cellX(site, door), cellZ(site, door), cellX(map, rim), cellZ(map, rim), this.tuning.brain.nav.mapExpansions, opts, this.mapCells);
    if (r !== 'found') return r;
    if (inA) {
      this.appendCells(site, fine);
      this.appendCells(map, this.mapCells);
      for (let k = coarse.length - 1; k >= 0; k--) this.pushRaw(cellX(map, coarse[k]!), cellZ(map, coarse[k]!));
    } else {
      this.appendCells(map, coarse);
      for (let k = this.mapCells.length - 1; k >= 0; k--) this.pushRaw(cellX(map, this.mapCells[k]!), cellZ(map, this.mapCells[k]!));
      for (let k = fine.length - 1; k >= 0; k--) this.pushRaw(cellX(site, fine[k]!), cellZ(site, fine[k]!));
    }
    return 'found';
  }

  /** Every walkable map cell's way to the nearest walkable cell just inside the site's edge. */
  private rimField(): GridSearch {
    if (this.rim) return this.rim;
    const field = new GridSearch(this.world.grid.map);
    const map = field.layer;
    const site = this.site.layer;
    const inside = (x: number, z: number): boolean => cellIndex(site, x, z) >= 0;
    const sources: number[] = [];
    for (let c = 0; c < map.nx * map.nz; c++) {
      if ((map.flags[c]! & Cell.Walkable) === 0) continue;
      const x = cellX(map, c);
      const z = cellZ(map, c);
      if (inside(x, z) && !(inside(x + map.cell, z) && inside(x - map.cell, z) && inside(x, z + map.cell) && inside(x, z - map.cell))) sources.push(c);
    }
    field.flood(sources, { maxExpansions: map.nx * map.nz, cost: this.offSteep });
    this.rim = field;
    return field;
  }

  /**
   * For each of the site's sides, every walkable site cell's next step toward the nearest
   * walkable cell on that side's edge: out of a building, through the camp's gate, and round
   * toward where he's going. Only the steps are kept: −1 at the edge, UNREACHED where it can't get there.
   */
  private exitFields(): readonly Int32Array[] {
    if (this.exits) return this.exits;
    const L = this.site.layer;
    const sources: number[][] = Array.from({ length: SIDES }, () => []);
    for (let j = 0; j < L.nz; j++) {
      for (let i = 0; i < L.nx; i++) {
        const c = j * L.nx + i;
        if ((i === 0 || j === 0 || i === L.nx - 1 || j === L.nz - 1) && (L.flags[c]! & Cell.Walkable) !== 0) sources[sideOf(L, cellX(L, c), cellZ(L, c))]!.push(c);
      }
    }
    const n = L.nx * L.nz;
    const search = new GridSearch(L);
    this.exits = sources.map((edge) => {
      search.flood(edge, { maxExpansions: n });
      const steps = new Int32Array(n);
      for (let c = 0; c < n; c++) steps[c] = search.cost[c]! < 0 ? UNREACHED : search.parent[c]!;
      return steps;
    });
    return this.exits;
  }

  /**
   * What a search of the fine layer aims by, made once: which ground each cell stands on,
   * and distance tables from a few cells spread across the largest piece of it (the camp
   * and the ground around it). Null with `landmarks` at 0, and for a fine layer too large to
   * be a camp's (a hand-built scene's covers its whole map: tables for millions of cells
   * would cost more to make and to hold than they save): the straight-line estimate alone.
   *
   * Without them the commonest route in a fight is the dearest: a man a few metres from
   * where he's going with a wall between, and the way round through the gate. A search
   * aiming straight at him looks at every cell nearer than the gate first, tens of
   * thousands of them, and at a place that can't be reached at all it looks at everything.
   */
  private siteAid(): SiteAid | null {
    const N = this.tuning.brain.nav;
    const count = N.landmarks;
    if (count <= 0 || this.site.layer.nx * this.site.layer.nz > N.landmarkCells) return null;
    if (this.aid && this.aid.count === count) return this.aid;
    // A search of its own: the tables are flooded while the layer's search may be holding a route.
    const search = new GridSearch(this.site.layer);
    const ground = components(search);
    let largest = -1;
    for (let k = 0; k < ground.sizes.length; k++) if (largest < 0 || ground.sizes[k]! > ground.sizes[largest]!) largest = k;
    this.aid = { count, label: ground.label, bounds: largest < 0 ? null : landmarkTables(search, ground.label.indexOf(largest), count) };
    return this.aid;
  }

  /** Searches one layer between the nearest walkable cells to two points. */
  private searchLayer(search: GridSearch, ax: number, az: number, bx: number, bz: number, maxExpansions: number, opts: FindOptions, out: number[]): RouteResult {
    const L = search.layer;
    const coarse = search === this.map;
    const start = this.nearestWalkable(L, ax, az, coarse);
    const goal = this.nearestWalkable(L, bx, bz, coarse);
    if (start < 0 || goal < 0) return 'no-route';
    const aid = search === this.site ? this.siteAid() : null;
    // Different ground: there is no way, and a search would look at all of his before saying so.
    if (aid && start !== goal && (aid.label[start]! < 0 || aid.label[start] !== aid.label[goal])) {
      out.length = 0;
      return 'no-route';
    }
    const r = search.path(start, goal, { maxExpansions, work: opts.work, cost: search === this.site ? opts.cost : coarse ? this.offSteep : undefined, bounds: aid?.bounds ?? undefined }, out);
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
   * Closes the walks the map has marked (grid.ts, Edge.EastSteep): middle to middle, they
   * gain height on ground too steep to climb. A corner move goes where both of its two-step
   * paths do, as in the search itself: it is closed by a mark on any side of the square the
   * two cells share.
   */
  private readonly offSteep: MoveCost = (from, to, length) => {
    const e = this.map.layer.edges;
    const nx = this.map.layer.nx;
    const a = from < to ? from : to;
    const d = (from < to ? to : from) - a;
    if (d === 1) return (e[a]! & Edge.EastSteep) !== 0 ? -1 : length;
    if (d === nx) return (e[a]! & Edge.NorthSteep) !== 0 ? -1 : length;
    // North-east of `a`, or north-west of it: the square's south-west cell is `a`, or the one west of it.
    const sw = d === nx + 1 ? a : a - 1;
    return (e[sw]! & (Edge.EastSteep | Edge.NorthSteep)) !== 0 || (e[sw + 1]! & Edge.NorthSteep) !== 0 || (e[sw + nx]! & Edge.EastSteep) !== 0 ? -1 : length;
  };

  /** True if a map cell has ways out of it for a body that fits, and every one of them is marked steep: a ledge no route leaves or reaches. */
  private cutOff(c: number): boolean {
    const L = this.map.layer;
    const e = L.edges;
    const i = c % L.nx;
    let ways = 0;
    let open = 0;
    const side = (bits: number, fits: number, steep: number): void => {
      if ((bits & fits) === 0) return;
      ways++;
      if ((bits & steep) === 0) open++;
    };
    side(e[c]!, Edge.East, Edge.EastSteep);
    side(e[c]!, Edge.North, Edge.NorthSteep);
    if (i > 0) side(e[c - 1]!, Edge.East, Edge.EastSteep);
    if (c >= L.nx) side(e[c - L.nx]!, Edge.North, Edge.NorthSteep);
    return ways > 0 && open === 0;
  }

  /**
   * The nearest walkable cell to a point, by the grid: its own cell, or the first in
   * widening rings (nearest first, in a fixed order). −1 if none is near. `reachable`, on
   * the map layer: not a cell the steep marks have cut off, which would end a search before
   * it began; the route ends beside it.
   */
  private nearestWalkable(L: GridLayer, x: number, z: number, reachable = false): number {
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
          if (reachable && this.cutOff(c)) continue;
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
  /** True if nothing that stops sight lies between two points in the world. */
  seesPoint(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    return sightLine(this.view, ax, ay, az, bx, by, bz, Blocks.Sight);
  }

  blockedFrom(ax: number, az: number, bx: number, bz: number, h: number): boolean {
    const w = this.world;
    const ay = w.terrain.heightAt(ax, az) + h;
    const by = w.terrain.heightAt(bx, bz) + h;
    return !sightLine(this.view, ax, ay, az, bx, by, bz, Blocks.Sight);
  }

  /** `clear`, as something to hand on (followRoute's `feel.open`): the same function for the navigator's life. */
  readonly open = (ax: number, az: number, bx: number, bz: number): boolean => this.clear(ax, az, bx, bz);

  /**
   * True if a body can walk the straight segment, to its end: every sample stands on a walkable cell
   * (the finest layer there) and fits among the colliders, by the test the grid was built
   * with (kernel/world/grid.ts), so a pulled route never cuts what the search went around.
   * And it gains no height on ground too steep to climb, going that way: the cells it crosses
   * answer for their middles, and a straight line across one can run up the triangle its
   * middle isn't on.
   */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const { world } = this;
    const G = this.tuning.gen.grid;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return true;
    if (world.terrain.gainOnSteep(ax, az, bx, bz, dtanDeg(this.tuning.gen.walkableSlopeDeg)) > CLIMB_SLACK) return false;
    const site = world.grid.site;
    const map = world.grid.map;
    const r = G.bodyRadius;
    const ids = this.ids;
    const step = this.tuning.brain.nav.sampleStep;
    const n = Math.max(1, Math.ceil(len / step));
    // Colliders are looked up a stretch at a time: the whole of a long segment's box holds most of a forest.
    const stretch = Math.max(1, Math.ceil(CLEAR_STRETCH / step));
    for (let s = 1; s <= n; s++) {
      const px = ax + (dx * s) / n;
      const pz = az + (dz * s) / n;
      if ((s - 1) % stretch === 0) {
        const e = Math.min(n, s + stretch - 1);
        const qx = ax + (dx * e) / n;
        const qz = az + (dz * e) / n;
        world.colliders.query(Math.min(px, qx) - r, Math.min(pz, qz) - r, Math.max(px, qx) + r, Math.max(pz, qz) + r, ids);
      }
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

/** What the fine layer's searches aim by: the ground each cell stands on, and its landmarks' distance tables (kernel/world/search.ts). */
interface SiteAid {
  /** How many landmarks were asked for. */
  count: number;
  label: Int32Array;
  bounds: Bounds | null;
}

/** How many sides of the site a route can leave by. */
const SIDES = 8;
/** In an exit field: this cell can't reach that side. */
const UNREACHED = -2;

/** Which side of the layer's middle a point is on, as an eighth of a turn. */
function sideOf(L: GridLayer, x: number, z: number): number {
  const a = datan2(z - (L.z0 + (L.nz * L.cell) / 2), x - (L.x0 + (L.nx * L.cell) / 2));
  return Math.floor(((a + Math.PI) / (2 * Math.PI)) * SIDES) % SIDES;
}

/** Metres of a segment checked against one lookup of the colliders. */
const CLEAR_STRETCH = 8;

function cellX(L: GridLayer, c: number): number {
  return L.x0 + ((c % L.nx) + 0.5) * L.cell;
}

function cellZ(L: GridLayer, c: number): number {
  return L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell;
}

const worlds = new WeakMap<Ground, Navigator>();

/** The world's navigator, made once: its scratch is rewritten by every search, and nothing is kept between them. */
export function navigatorOf(world: Ground, tuning: Tuning): Navigator {
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

/** What a walker can tell of his own going, and of the ground he's on: without it, a walk is judged by the route and his place alone. */
export interface Feel {
  /** He asked his legs for a pace and got less than `creep` of it: a man pressed against something gains a centimetre now and then, and isn't getting anywhere. Sliding round a shoulder is quicker than that, and feeds itself. */
  pressed?: boolean;
  /** Whether a body can walk straight from one place to another over the ground he knows (Navigator.clear): a step aside goes where there's room for it. */
  open?: (ax: number, az: number, bx: number, bz: number) => boolean;
}

/**
 * One tick of walking a route: steers `self` at `speed` toward the next waypoint, moving
 * on as each is reached. A walk that stops gaining on its waypoint for `stallSeconds` is
 * stalled: something the grid doesn't know is in the way (a mate, the camp's own truck, a
 * fence's post). He then steps aside and comes back to the route, and after `stallsMax`
 * stalls it says so, and the brain decides what to do (find another route, give up).
 *
 * - The first step on a leg comes as soon as he's pressed against something (`feel.pressed`,
 *   `creep`). Pressed against a mate he slides a centimetre nearer every half second, which
 *   by the distance alone kept him "walking" for four seconds before he stepped aside at
 *   all. After that one step, sliding counts again (`creepSteps`): where there's no room to
 *   step round, pushing slowly through is how he gets there, and stepping from side to side
 *   behind what's in his way isn't.
 * - The step is no longer than it takes to get round a truck (`sideStep`), however fast
 *   he's going: he stops stepping once it has taken him that far off his line, or after
 *   `sideSeconds`. Up to a hurry the time runs out first, and the step is what it always
 *   was. At a run, a step that lasted `sideSeconds` threw him three metres and more off his
 *   route, and into the next wall.
 * - It goes to the side the ground makes the better (`feel.open`): first one he can walk
 *   straight on to his waypoint from, then one he can step to. A man wedged between a mate
 *   and a wall has one way round, and a man at the end of a wall mustn't step behind it.
 *   Where the ground doesn't choose: right first, then left, by a rule that depends only
 *   on who he is and how many times this walk has stalled.
 * - Once it's over (`sideUntil` back at -1) he has `stallSeconds` again to gain on his
 *   waypoint from where it left him. The time used to run from when the step began, which
 *   left him a fifth of a second to show for it before he was stepping the other way.
 *
 * He keeps the route he had. A new one from where the step leaves him was tried and is
 * worse: its first waypoint is farther off, past whoever is in his way, where the old
 * one's was a step from him and reached by sliding round a shoulder (docs/decisions.md).
 *
 * Doesn't draw: a pure function of the route, the body, the tuning and the static ground.
 */
export function followRoute(route: Route, x: number, z: number, speed: number, id: number, tick: number, tuning: Tuning, out: Steering, feel?: Feel): Walk {
  const N = tuning.brain.nav;
  out.wishX = 0;
  out.wishZ = 0;
  out.dirX = 0;
  out.dirZ = 0;
  if (route.next * 2 >= route.points.length) return 'arrived';
  const hz = tuning.sim.tickHz;
  let px = route.points[route.next * 2]!;
  let pz = route.points[route.next * 2 + 1]!;
  if (route.sideUntil >= 0) {
    // Stepping aside: straight to the side, until he's far enough off the line he was on.
    // The step began on the line from him to his waypoint, so how far he is from that line is how far it has taken him.
    const off = (x - px) * route.sideX + (z - pz) * route.sideZ;
    if (tick < route.sideUntil && off < N.sideStep) {
      out.wishX = route.sideX * speed;
      out.wishZ = route.sideZ * speed;
      out.dirX = route.sideX;
      out.dirZ = route.sideZ;
      return 'walking';
    }
    route.sideUntil = -1;
    route.best = FAR;
    route.progressTick = tick;
  }
  let dx = px - x;
  let dz = pz - z;
  let d = Math.sqrt(dx * dx + dz * dz);
  // On to the next waypoint once this one is reached.
  while (d < N.arrive && route.next * 2 + 2 < route.points.length) {
    route.next++;
    route.best = FAR;
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
  const ux = dx / d;
  const uz = dz / d;
  // Slow into the last waypoint so a guard doesn't overrun where he was going.
  const last = route.next * 2 + 2 >= route.points.length;
  const v = last && d < N.slowDown ? Math.max(N.minSpeed, (speed * d) / N.slowDown) : speed;
  // Sliding along whatever he's pressed against isn't gaining on the waypoint, until he has tried a step round it.
  // A leg's first measure always counts.
  const creeping = route.best < FAR && route.stalls < N.creepSteps && feel?.pressed === true;
  if (d < route.best - N.progress && !creeping) {
    route.best = d;
    route.progressTick = tick;
  } else if ((tick - route.progressTick) / hz >= N.stallSeconds) {
    route.stalls++;
    route.best = d;
    route.progressTick = tick;
    if (route.stalls > N.stallsMax) return 'stalled';
    // Step aside, perpendicular to the way he was going: to the better side by the ground, or by his own rule.
    let side = (id + route.stalls) % 2 === 0 ? 1 : -1;
    const open = feel?.open;
    if (open) {
      // How far the step will take him, and what each side is worth. Most, that he can walk straight on to his waypoint
      // from the end of it: a step round the end of a wall mustn't leave him behind it. Then, that the step itself is
      // clear, which says less: pressed against a wall's corner, no step from where he stands looks clear.
      const reach = Math.min(N.sideStep, speed * N.sideSeconds);
      const worth = (s: number): number => {
        const sx = x - uz * s * reach;
        const sz = z + ux * s * reach;
        return (open(sx, sz, px, pz) ? 2 : 0) + (open(x, z, sx, sz) ? 1 : 0);
      };
      if (worth(-side) > worth(side)) side = -side;
    }
    route.sideX = -uz * side;
    route.sideZ = ux * side;
    route.sideUntil = tick + Math.round(N.sideSeconds * hz);
    out.wishX = route.sideX * speed;
    out.wishZ = route.sideZ * speed;
    out.dirX = route.sideX;
    out.dirZ = route.sideZ;
    return 'walking';
  }
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
