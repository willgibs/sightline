import type { Tuning } from '../../config/tuning';
import { ambientSources } from '../generation';
import { dpow } from '../kernel/core/detmath';
import { audibility } from '../kernel/sound';
import { Blocks, type Collider, type RayHit } from '../kernel/world/colliders';
import { Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import { COST_PER_METRE, GridSearch, NEIGHBOURS } from '../kernel/world/search';
import type { WorkCounts } from '../kernel/work';
import { Solids } from '../kernel/world/solids';
import type { World } from '../kernel/world/world';

/**
 * Hearing (design doc · Enemy perception · Hearing), one law for every listener: the
 * guards and the player's speakers ask the same question here, so if you can hear a
 * sound, a guard where you stand would hear it exactly as well (owner, Nov 7).
 *
 * A sound reaches a listener by the louder of two routes:
 * - **around:** a bounded flood over the site grid from the sound (kernel/world/search.ts),
 *   along where a body can walk, once per sound; every listener reads it at their cell.
 *   Sound goes round buildings and through doorways, not through walls.
 * - **through:** the straight line, losing `wallLossDb` for every wall it passes (as
 *   Rainbow Six Siege's does) and `terrainLossDb` where the ground is in the way.
 *
 * Level follows the inverse-distance law along the route (kernel/sound.ts): 1 at the
 * sound's radius. The steady sources (generation/ambient.ts) mask it: their levels at the
 * listener, by the same law, summed as power, set a threshold `maskDb` below them. A
 * sound is heard when its level over that threshold, its clarity, reaches 1.
 *
 * Where it seems to come from is the last cell on its route the listener can see: a
 * doorway, a corner (Thief's rule). Through a wall, it comes from where it was. Its
 * arrival waits for the speed of sound along the route.
 *
 * Costs are exact and bounded: integer path costs, a fixed neighbour order, and a budget
 * of expansions (rule 18). One flood per sound, whatever the number of listeners.
 */

/** A sound as hearing takes it: where, how far it carries unmasked, and which kind. */
export interface SoundSource {
  x: number;
  y: number;
  z: number;
  /** Metres an unmasked listener hears it along an open route (kernel/events.ts, SoundFields). */
  radius: number;
}

/** What one listener hears of a sound. */
export interface Heard {
  /** Level over the threshold of hearing, unmasked, by the louder route (1 at the edge). */
  level: number;
  /** The masked threshold where the listener is (1 where nothing steady is near). */
  threshold: number;
  /** level / threshold: heard at 1 or more. */
  clarity: number;
  /** Which route carried it: around (the flood), through (the straight line), or none. */
  route: 'around' | 'through' | 'none';
  /** Its length along the route that carried it, and the straight distance, metres. */
  length: number;
  straight: number;
  /** Walls on the straight line. */
  walls: number;
  /** Where it seems to come from. */
  fromX: number;
  fromY: number;
  fromZ: number;
}

export function emptyHeard(): Heard {
  return { level: 0, threshold: 1, clarity: 0, route: 'none', length: 0, straight: 0, walls: 0, fromX: 0, fromY: 0, fromZ: 0 };
}

/**
 * A world's acoustics: the site layer's search, kept for the world's life, and the steady
 * sources' floods, made once. One per listener family: the simulation keeps one, the
 * player's speakers another, so neither disturbs the other's last flood.
 */
export class Acoustics {
  readonly layer: GridLayer;
  private readonly search: GridSearch;
  private tuning: Tuning;
  /** What stops sound on a straight line: the world's colliders, and entities' shapes when a run's solids are given. */
  private solids: Solids;
  private readonly hit: RayHit = { dist: Infinity, id: -1 };
  /** The flooded sound, and the cell its flood started from, with the metres to it. */
  private source: SoundSource = { x: 0, y: 0, z: 0, radius: 0 };
  private start = -1;
  private offset = 0;
  /** Each steady source and the costs of its flood, by cell. */
  private steady: Array<{ s: SoundSource; costs: Map<number, number>; start: number; offset: number }> | null = null;

  constructor(
    readonly world: World,
    tuning: Tuning,
  ) {
    this.layer = world.grid.site;
    this.search = new GridSearch(this.layer);
    this.tuning = tuning;
    this.solids = new Solids(world.colliders);
  }

  /** Hears through a run's solids (the world's colliders and entities' shapes: a closed gate) from now on. */
  setSolids(solids: Solids): void {
    this.solids = solids;
  }

  /** Swaps in new tuning (hot reload): the steady sources' radii may have changed. */
  setTuning(tuning: Tuning): void {
    if (tuning === this.tuning) return;
    this.tuning = tuning;
    this.steady = null;
  }

  /** Floods one sound over the site grid, for `hear` to read at every listener's cell. */
  spread(s: SoundSource, work?: WorkCounts): void {
    // The steady sources' floods use the same search: made first, once.
    this.steadySources();
    this.source = s;
    this.start = -1;
    const at = this.startCell(s.x, s.z);
    if (at < 0) return;
    this.start = at;
    this.offset = this.cellDistance(at, s.x, s.z);
    const H = this.tuning.perception.hearing;
    this.search.flood([at], { maxExpansions: H.maxExpansions, maxCost: Math.ceil(s.radius * COST_PER_METRE), work });
  }

  /** What a listener with ears at (x, y, z) hears of the last sound spread, written to `out`. */
  hear(x: number, y: number, z: number, out: Heard): Heard {
    const s = this.source;
    const H = this.tuning.perception.hearing;
    this.listen(s, this.start, this.offset, (cell) => this.search.cost[cell]!, x, y, z, out);
    out.threshold = this.threshold(x, y, z);
    out.clarity = out.level / out.threshold;
    // Where it seems to come from: through a wall, from where it was; around, from the last
    // cell of its route the listener can see.
    out.fromX = s.x;
    out.fromY = s.y + H.lift;
    out.fromZ = s.z;
    if (out.route === 'around') this.apparent(x, y, z, out);
    return out;
  }

  /** How many steady sources the world has (generation/ambient.ts's list, in its order). */
  get steadyCount(): number {
    return this.steadySources().length;
  }

  /** What a listener at (x, y, z) hears of steady source `i` (in ambientSources' order), unmasked: for the speakers. */
  hearSteady(i: number, x: number, y: number, z: number, out: Heard): Heard {
    const a = this.steadySources()[i]!;
    this.listen(a.s, a.start, a.offset, (cell) => a.costs.get(cell) ?? -1, x, y, z, out);
    out.threshold = 1;
    out.clarity = out.level;
    out.fromX = a.s.x;
    out.fromY = a.s.y + this.tuning.perception.hearing.lift;
    out.fromZ = a.s.z;
    return out;
  }

  /** The steady sources' level at a point, by the same law, summed as power. */
  ambientLevel(x: number, y: number, z: number): number {
    const steady = this.steadySources();
    let power = 0;
    for (const a of steady) {
      this.listen(a.s, a.start, a.offset, (cell) => a.costs.get(cell) ?? -1, x, y, z, scratch);
      power += scratch.level * scratch.level;
    }
    return Math.sqrt(power);
  }

  /** The masked threshold at a point: 1, or `maskDb` below the steady sound there. */
  threshold(x: number, y: number, z: number): number {
    const H = this.tuning.perception.hearing;
    const masked = this.ambientLevel(x, y, z) * dpow(10, -H.maskDb / 20);
    return masked > 1 ? masked : 1;
  }

  /**
   * The level of a sound at a listener by the louder route, into `out` (level, route,
   * length, straight, walls). `costOf` reads the sound's flood.
   */
  private listen(s: SoundSource, start: number, offset: number, costOf: (cell: number) => number, x: number, y: number, z: number, out: Heard): void {
    const H = this.tuning.perception.hearing;
    const sy = s.y + H.lift;
    const dx = x - s.x;
    const dy = y - sy;
    const dz = z - s.z;
    const straight = Math.sqrt(dx * dx + dy * dy + dz * dz);
    out.straight = straight;
    out.level = 0;
    out.route = 'none';
    out.length = 0;
    // Through: walls and ground cost decibels.
    const walls = this.wallsOnLine(s.x, sy, s.z, x, y, z, H.maxWalls + 1);
    out.walls = walls;
    if (walls <= H.maxWalls) {
      let loss = walls * H.wallLossDb;
      if (straight > 1e-6 && this.world.terrain.raycast(s.x, sy, s.z, dx / straight, dy / straight, dz / straight, straight) < straight - 0.05) loss += H.terrainLossDb;
      const level = audibility(s.radius, straight) * (loss > 0 ? dpow(10, -loss / 20) : 1);
      if (level > 0) {
        out.level = level;
        out.route = 'through';
        out.length = straight;
      }
    }
    // Around: the flood's path to the listener's cell, never shorter than the straight line.
    if (start < 0) return;
    const cell = cellIndex(this.layer, x, z);
    if (cell < 0) return;
    const cost = costOf(cell);
    if (cost < 0) return;
    const flat = cost / COST_PER_METRE + offset;
    let length = Math.sqrt(flat * flat + dy * dy);
    if (length < straight) length = straight;
    const level = audibility(s.radius, length);
    if (level > out.level) {
      out.level = level;
      out.route = 'around';
      out.length = length;
    }
  }

  /** Walks the last flood's path back from the listener toward the sound, to the last cell the listener can see. */
  private apparent(x: number, y: number, z: number, out: Heard): void {
    const L = this.layer;
    const from = cellIndex(L, x, z);
    if (from < 0) return;
    const lift = this.tuning.perception.hearing.lift;
    // Thief's doorway: follow parents while no wall stands between the listener and the cell.
    let visible = from;
    for (let c = this.search.parent[from]!, k = 0; c >= 0 && k < 4096; c = this.search.parent[c]!, k++) {
      const cx = this.centreX(c);
      const cz = this.centreZ(c);
      if (this.wallsOnLine(x, y, z, cx, this.world.terrain.heightAt(cx, cz) + lift, cz, 1) > 0) break;
      visible = c;
    }
    // Back to the sound's own cell with nothing in the way: it comes from the sound itself.
    if (visible === this.start) return;
    out.fromX = this.centreX(visible);
    out.fromZ = this.centreZ(visible);
    out.fromY = this.world.terrain.heightAt(out.fromX, out.fromZ) + lift;
  }

  private centreX(cell: number): number {
    const L = this.layer;
    return L.x0 + ((cell % L.nx) + 0.5) * L.cell;
  }

  private centreZ(cell: number): number {
    const L = this.layer;
    const i = cell % L.nx;
    return L.z0 + ((cell - i) / L.nx + 0.5) * L.cell;
  }

  /**
   * Walls on the straight line from a to b, up to `max`: everything solid that stops sound
   * and stands as a wall where the line meets it, from below 0.5 m to above 2 m over the
   * ground there (the grid's own rule, grid.ts), so sound passes over a crate or sandbags.
   * Counted against the colliders themselves, so a wall thinner than a grid cell counts.
   */
  wallsOnLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number, max: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return 0;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    let t = 0;
    let walls = 0;
    for (let k = 0; k < 64 && walls < max; k++) {
      this.solids.raycast(ax + ux * t, ay + uy * t, az + uz * t, ux, uy, uz, len - t, Blocks.Sound, this.hit);
      if (this.hit.id < 0) break;
      const c = this.solids.get(this.hit.id);
      const at = t + this.hit.dist;
      const ground = this.world.terrain.heightAt(ax + ux * at, az + uz * at);
      if (c.y0 < ground + 0.5 && c.y1 > ground + 2) walls++;
      // On past it, from where the line leaves it.
      t = at + exitDistance(c, ax + ux * at, ay + uy * at, az + uz * at, ux, uy, uz) + 1e-4;
      if (t >= len) break;
    }
    return walls;
  }

  /** The cell a flood starts from: the sound's own, or the nearest walkable neighbour (in the search's fixed order). */
  private startCell(x: number, z: number): number {
    const L = this.layer;
    const c = cellIndex(L, x, z);
    if (c < 0) return -1;
    if ((L.flags[c]! & Cell.Walkable) !== 0) return c;
    const i = c % L.nx;
    const j = (c - i) / L.nx;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= L.nx || nj >= L.nz) continue;
      const n = nj * L.nx + ni;
      if ((L.flags[n]! & Cell.Walkable) !== 0) return n;
    }
    return -1;
  }

  /** Metres from a point to a cell's centre, along the ground. */
  private cellDistance(cell: number, x: number, z: number): number {
    const L = this.layer;
    const i = cell % L.nx;
    const cx = L.x0 + (i + 0.5) * L.cell;
    const cz = L.z0 + ((cell - i) / L.nx + 0.5) * L.cell;
    return Math.sqrt((cx - x) * (cx - x) + (cz - z) * (cz - z));
  }

  /** The steady sources, each flooded once and kept as the costs of the cells it reached. */
  private steadySources(): NonNullable<Acoustics['steady']> {
    if (this.steady) return this.steady;
    const H = this.tuning.perception.hearing;
    this.steady = [];
    for (const a of ambientSources(this.world, this.tuning)) {
      const s: SoundSource = { x: a.x, y: a.y - H.lift, z: a.z, radius: a.radius };
      const start = this.startCell(s.x, s.z);
      const costs = new Map<number, number>();
      let offset = 0;
      if (start >= 0) {
        offset = this.cellDistance(start, s.x, s.z);
        this.search.flood([start], { maxExpansions: H.maxExpansions, maxCost: Math.ceil(s.radius * COST_PER_METRE) });
        const n = this.layer.nx * this.layer.nz;
        for (let c = 0; c < n; c++) if (this.search.cost[c]! >= 0) costs.set(c, this.search.cost[c]!);
      }
      this.steady.push({ s, costs, start, offset });
    }
    return this.steady;
  }
}

const scratch = emptyHeard();

/** How far a ray starting on or in a collider runs before it leaves it (0 if it doesn't enter). */
function exitDistance(c: Collider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  let tOut = Infinity;
  if (Math.abs(dy) > 1e-12) {
    const ta = (c.y0 - oy) / dy;
    const tb = (c.y1 - oy) / dy;
    tOut = Math.min(tOut, ta > tb ? ta : tb);
  }
  const px = ox - c.x;
  const pz = oz - c.z;
  if (c.kind === 'cyl') {
    const a = dx * dx + dz * dz;
    if (a > 1e-12) {
      const b = px * dx + pz * dz;
      const disc = b * b - a * (px * px + pz * pz - c.r * c.r);
      if (disc > 0) tOut = Math.min(tOut, (-b + Math.sqrt(disc)) / a);
      else return 0;
    }
  } else {
    const lx = px * c.ux + pz * c.uz;
    const lz = -px * c.uz + pz * c.ux;
    const ldx = dx * c.ux + dz * c.uz;
    const ldz = -dx * c.uz + dz * c.ux;
    if (Math.abs(ldx) > 1e-12) tOut = Math.min(tOut, Math.max((-c.hx - lx) / ldx, (c.hx - lx) / ldx));
    if (Math.abs(ldz) > 1e-12) tOut = Math.min(tOut, Math.max((-c.hz - lz) / ldz, (c.hz - lz) / ldz));
  }
  return tOut > 0 && Number.isFinite(tOut) ? tOut : 0;
}

const worlds = new WeakMap<World, Acoustics>();

/**
 * The simulation's acoustics for a world: one per world, kept with it (a cache of static
 * floods and scratch, never state: no flood outlives the sound it's read for).
 */
export function acousticsOf(world: World, tuning: Tuning): Acoustics {
  let a = worlds.get(world);
  if (!a) worlds.set(world, (a = new Acoustics(world, tuning)));
  a.setTuning(tuning);
  return a;
}
