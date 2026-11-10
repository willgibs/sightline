import type { WorkCounts } from '../work';
import { Edge, type GridLayer } from './grid';

/**
 * Search over a layer of the spatial grid (grid.ts), the map layer or the site layer: one
 * answer for lab A's hearing (a bounded flood from each sound), lab D's analysis (who can
 * reach what) and lab E's navigation (A* between two cells). Generation and the
 * simulation use the same code.
 *
 * Every search is exact and the same in every engine:
 * - Costs are whole numbers, in COST_PER_METRE units, so no rounding ever reorders a queue.
 * - Neighbours are visited in one fixed order (NEIGHBOURS), and ties break by fixed rules.
 * - A search stops after a fixed number of expansions (rule 18), never after a time, and
 *   says whether it ran out. Its expansions are the work count a lane's bench pins.
 *
 * A move is the layer's own: a body walks from a cell to its neighbour where the walk
 * edge between them is open (grid.ts, Edge). With eight neighbours, a diagonal is open
 * only where both of its two-step paths are, so no path cuts a corner. A cost function
 * can price or close any move: walls for sound, roofs for a search, danger for a route.
 */

/** Cost units per metre: costs are whole numbers of centimetres. */
export const COST_PER_METRE = 100;

/**
 * Neighbours in the order every search visits them: the four sides, then the four
 * corners, as cell offsets (di, dj).
 */
export const NEIGHBOURS: ReadonlyArray<readonly [di: number, dj: number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/**
 * The cost of the move from cell `from` to its neighbour `to` (cell indices in the layer),
 * given the move's plain length cost: a whole number, or −1 where the move is impossible.
 * Called only for moves the layer's walk edges allow.
 */
export type MoveCost = (from: number, to: number, length: number) => number;

export interface SearchOptions {
  /** Four neighbours or eight. Default eight. */
  neighbours?: 4 | 8;
  /** What each move costs. Default: its length. A* needs every move to cost at least its length. */
  cost?: MoveCost;
  /** Stop after expanding this many cells (rule 18). */
  maxExpansions: number;
  /** A flood goes no further than this cost. Default: no limit. */
  maxCost?: number;
  /** Where to count the cells expanded: a system passes its tick's (TickContext.work). */
  work?: WorkCounts;
  /**
   * For a path: distance tables over this layer (`landmarkTables`). They sharpen A*'s
   * estimate (remaining), so it expands far fewer cells round a wall: the path it finds
   * costs the same, and may be a different one of the equally cheap. A cost function may
   * only add to a move's length, as A* already asks, so the tables stay true.
   */
  bounds?: Bounds;
}

/**
 * Distance tables for A* to aim by: for each of `count` fixed cells (landmarks), every
 * cell's cost from it by the layer's own moves, −1 where it can't be reached. A row a
 * cell, the landmarks side by side, so that reading a cell's bounds is one place in memory.
 */
export interface Bounds {
  readonly count: number;
  /** cells × count numbers: cell c's cost from landmark t is at c × count + t. */
  readonly table: Int32Array;
}

export interface SearchResult {
  /** Cells expanded: the work this search did. */
  expanded: number;
  /** It stopped because it reached maxExpansions, before it finished. */
  exhausted: boolean;
}

export interface PathResult extends SearchResult {
  found: boolean;
  /** The path's cost, in COST_PER_METRE units; −1 if none was found. */
  cost: number;
}

const NOT_REACHED = -1;

/** Each neighbour's bit in a cell's open moves, in NEIGHBOURS order: the four sides, then the four corners. */
const EAST = 1;
const NORTH = 2;
const WEST = 4;
const SOUTH = 8;
const SIDES = 4;

/**
 * Searches one layer. It holds the scratch every search on the layer rewrites, so keep one
 * for the world's life: nothing carries over from one search to the next. Results (costs
 * and parents) are valid until the next search on the same GridSearch.
 *
 * Written for speed, since a fight asks for a dozen routes and floods a tick: typed arrays
 * throughout, no closure or array made per cell, and a cell's open moves read from the
 * layer's edges once as eight bits. What it does is the plain search's, cell for cell
 * (tests/reference/gridSearchReference.ts, which tests/search.test.ts holds it to): the
 * order cells expand in is fixed by their costs and the tie-breaks, never by how the queue
 * is laid out.
 */
export class GridSearch {
  /** Each cell's cost from the nearest source, after a search; −1 where it wasn't reached. */
  readonly cost: Int32Array;
  /** Each cell's parent on its cheapest path, after a search; −1 for a source or a cell not reached. */
  readonly parent: Int32Array;
  /** The length cost of a move to a side and to a corner, in COST_PER_METRE units. */
  readonly side: number;
  readonly corner: number;
  private readonly closed: Uint8Array;
  private readonly buckets = new BucketQueue();
  private readonly heap = new MinHeap();
  /** The cells the last search reached: all it has to undo. */
  private touched = new Int32Array(1024);
  private touchedCount = 0;
  /** Each neighbour's offset in cell indices, and in columns and rows, in NEIGHBOURS order. */
  private readonly offset: Int32Array;
  /** The goal's row of a search's bounds, read once. */
  private goalBounds = new Int32Array(8);

  constructor(readonly layer: GridLayer) {
    const n = layer.nx * layer.nz;
    this.cost = new Int32Array(n).fill(NOT_REACHED);
    this.parent = new Int32Array(n).fill(NOT_REACHED);
    this.closed = new Uint8Array(n);
    this.side = Math.round(layer.cell * COST_PER_METRE);
    this.corner = Math.round(layer.cell * COST_PER_METRE * Math.SQRT2);
    this.offset = Int32Array.from(NEIGHBOURS, ([di, dj]) => dj * layer.nx + di);
  }

  /** The cell index of (i, j). */
  index(i: number, j: number): number {
    return j * this.layer.nx + i;
  }

  /**
   * Dijkstra from every source at once, with a bucket queue: every cell's cost from its
   * nearest source and its parent toward it, up to maxCost. Cells at equal cost expand in
   * the order they were reached, last first.
   */
  flood(sources: readonly number[], opts: SearchOptions): SearchResult {
    const r = this.runFlood(sources, opts);
    if (opts.work) opts.work.nodes += r.expanded;
    return r;
  }

  private runFlood(sources: readonly number[], opts: SearchOptions): SearchResult {
    this.clear();
    const q = this.buckets;
    q.clear();
    const cost = this.cost;
    const parent = this.parent;
    const closed = this.closed;
    for (const s of sources) {
      this.check(s);
      if (cost[s] === 0) continue;
      this.touch(s);
      cost[s] = 0;
      parent[s] = NOT_REACHED;
      q.push(s, 0);
    }
    const limit = opts.maxCost ?? Infinity;
    const max = opts.maxExpansions;
    const nx = this.layer.nx;
    const corners = (opts.neighbours ?? 8) === 8;
    const count = corners ? 8 : SIDES;
    const price = opts.cost;
    const side = this.side;
    const diagonal = this.corner;
    const offset = this.offset;
    let expanded = 0;
    for (let c = q.pop(); c >= 0; c = q.pop()) {
      const g = q.popped;
      if (closed[c] !== 0 || g !== cost[c]) continue;
      if (expanded >= max) return { expanded, exhausted: true };
      closed[c] = 1;
      expanded++;
      const i = c % nx;
      const open = this.openMoves(c, i, (c - i) / nx, corners);
      for (let k = 0; k < count; k++) {
        if ((open & (1 << k)) === 0) continue;
        const to = c + offset[k]!;
        const length = k < SIDES ? side : diagonal;
        let move = length;
        if (price) {
          move = price(c, to, length);
          if (move === -1) continue;
          if (!Number.isInteger(move) || move < 0) throw new Error(`A grid move costs ${move}: costs are whole numbers, or −1 for no move`);
        }
        const ng = g + move;
        if (ng > limit) continue;
        const old = cost[to]!;
        if (old !== NOT_REACHED) {
          if (old <= ng) continue;
        } else this.touch(to);
        cost[to] = ng;
        parent[to] = c;
        q.push(to, ng);
      }
    }
    return { expanded, exhausted: false };
  }

  /**
   * A* from `start` to `goal`, with the octile distance as its estimate, or the better of
   * that and the layer's distance tables (`bounds`). Ties break by the lower estimate of
   * what remains, then by the lower cell index. Writes the path, start to goal, to `out`.
   */
  path(start: number, goal: number, opts: SearchOptions, out: number[] = []): PathResult {
    const r = this.runPath(start, goal, opts, out);
    if (opts.work) opts.work.nodes += r.expanded;
    return r;
  }

  private runPath(start: number, goal: number, opts: SearchOptions, out: number[]): PathResult {
    this.check(start);
    this.check(goal);
    out.length = 0;
    this.clear();
    const heap = this.heap;
    heap.clear();
    const cost = this.cost;
    const parent = this.parent;
    const closed = this.closed;
    const nx = this.layer.nx;
    const corners = (opts.neighbours ?? 8) === 8;
    const count = corners ? 8 : SIDES;
    const price = opts.cost;
    const side = this.side;
    const diagonal = this.corner;
    const offset = this.offset;
    const max = opts.maxExpansions;
    const bounds = opts.bounds;
    const tables = bounds ? bounds.count : 0;
    if (bounds) {
      if (this.goalBounds.length < tables) this.goalBounds = new Int32Array(tables);
      for (let t = 0; t < tables; t++) this.goalBounds[t] = bounds.table[goal * tables + t]!;
    }
    const gi = goal % nx;
    const gj = (goal - gi) / nx;
    this.touch(start);
    cost[start] = 0;
    parent[start] = NOT_REACHED;
    const h0 = this.remaining(start, start % nx, (start - (start % nx)) / nx, gi, gj, corners, bounds, tables);
    heap.push(h0, h0, start);
    let expanded = 0;
    while (heap.size > 0) {
      const c = heap.pop();
      if (closed[c] !== 0) continue;
      if (c === goal) {
        for (let k = goal; k !== NOT_REACHED; k = parent[k]!) out.push(k);
        out.reverse();
        return { expanded, exhausted: false, found: true, cost: cost[goal]! };
      }
      if (expanded >= max) return { expanded, exhausted: true, found: false, cost: -1 };
      closed[c] = 1;
      expanded++;
      const g = cost[c]!;
      const i = c % nx;
      const j = (c - i) / nx;
      const open = this.openMoves(c, i, j, corners);
      for (let k = 0; k < count; k++) {
        if ((open & (1 << k)) === 0) continue;
        const to = c + offset[k]!;
        const length = k < SIDES ? side : diagonal;
        let move = length;
        if (price) {
          move = price(c, to, length);
          if (move === -1) continue;
          if (!Number.isInteger(move) || move < 0) throw new Error(`A grid move costs ${move}: costs are whole numbers, or −1 for no move`);
        }
        if (closed[to] !== 0) continue;
        const ng = g + move;
        const old = cost[to]!;
        if (old !== NOT_REACHED) {
          if (old <= ng) continue;
        } else this.touch(to);
        cost[to] = ng;
        parent[to] = c;
        const ti = to % nx;
        const h = this.remaining(to, ti, (to - ti) / nx, gi, gj, corners, bounds, tables);
        heap.push(ng + h, h, to);
      }
    }
    return { expanded, exhausted: false, found: false, cost: -1 };
  }

  /** The cheapest cost of a path from `a` to `b` on an open layer: what A* aims by. */
  estimate(a: number, b: number, corners = true): number {
    const nx = this.layer.nx;
    const di = Math.abs((a % nx) - (b % nx));
    const dj = Math.abs(Math.floor(a / nx) - Math.floor(b / nx));
    if (!corners) return (di + dj) * this.side;
    const lo = Math.min(di, dj);
    return (di + dj - 2 * lo) * this.side + lo * this.corner;
  }

  /**
   * What A* takes the rest of the way from cell `c` at (i, j) to the goal at (gi, gj) to
   * cost, at least: the octile distance, or more where a distance table says so. A table
   * gives every cell's cost from one fixed cell over the layer's own moves, so by the
   * triangle inequality the difference of two cells' entries is the least any path between
   * them can cost.
   */
  private remaining(c: number, i: number, j: number, gi: number, gj: number, corners: boolean, bounds: Bounds | undefined, tables: number): number {
    const di = i > gi ? i - gi : gi - i;
    const dj = j > gj ? j - gj : gj - j;
    let h: number;
    if (corners) {
      const lo = di < dj ? di : dj;
      h = (di + dj - 2 * lo) * this.side + lo * this.corner;
    } else h = (di + dj) * this.side;
    if (tables > 0) {
      const table = bounds!.table;
      const row = c * tables;
      const goal = this.goalBounds;
      for (let t = 0; t < tables; t++) {
        const a = table[row + t]!;
        const b = goal[t]!;
        // A cell the landmark can't reach says nothing about this pair.
        if (a < 0 || b < 0) continue;
        const d = a > b ? a - b : b - a;
        if (d > h) h = d;
      }
    }
    return h;
  }

  /**
   * The open moves out of cell `c` at (i, j), as bits in NEIGHBOURS order. A side is open
   * where the walk edge between the two cells is; a corner, only where both two-step paths
   * around it are, so no path cuts one.
   */
  private openMoves(c: number, i: number, j: number, corners: boolean): number {
    const L = this.layer;
    const nx = L.nx;
    const e = L.edges;
    const here = e[c]!;
    let open = 0;
    if (i + 1 < nx && (here & Edge.East) !== 0) open |= EAST;
    if (j + 1 < L.nz && (here & Edge.North) !== 0) open |= NORTH;
    if (i > 0 && (e[c - 1]! & Edge.East) !== 0) open |= WEST;
    if (j > 0 && (e[c - nx]! & Edge.North) !== 0) open |= SOUTH;
    if (!corners) return open;
    if ((open & (EAST | NORTH)) === (EAST | NORTH) && (e[c + 1]! & Edge.North) !== 0 && (e[c + nx]! & Edge.East) !== 0) open |= 16;
    if ((open & (WEST | NORTH)) === (WEST | NORTH) && (e[c - 1]! & Edge.North) !== 0 && (e[c + nx - 1]! & Edge.East) !== 0) open |= 32;
    if ((open & (WEST | SOUTH)) === (WEST | SOUTH) && (e[c - nx - 1]! & Edge.North) !== 0 && (e[c - nx - 1]! & Edge.East) !== 0) open |= 64;
    if ((open & (EAST | SOUTH)) === (EAST | SOUTH) && (e[c - nx + 1]! & Edge.North) !== 0 && (e[c - nx]! & Edge.East) !== 0) open |= 128;
    return open;
  }

  /** Writes `value` into `into` at every cell the last search reached. */
  mark(into: Int32Array, value: number): number {
    for (let k = 0; k < this.touchedCount; k++) into[this.touched[k]!] = value;
    return this.touchedCount;
  }

  /** True if any move leads out of cell `c`. */
  connected(c: number): boolean {
    const i = c % this.layer.nx;
    return this.openMoves(c, i, (c - i) / this.layer.nx, false) !== 0;
  }

  /** Notes a cell the search has reached for the first time. */
  private touch(c: number): void {
    if (this.touchedCount === this.touched.length) {
      const wider = new Int32Array(this.touched.length * 2);
      wider.set(this.touched);
      this.touched = wider;
    }
    this.touched[this.touchedCount++] = c;
  }

  /** Undoes the last search's marks: only the cells it touched. */
  private clear(): void {
    const { touched, cost, parent, closed } = this;
    for (let k = 0; k < this.touchedCount; k++) {
      const c = touched[k]!;
      cost[c] = NOT_REACHED;
      parent[c] = NOT_REACHED;
      closed[c] = 0;
    }
    this.touchedCount = 0;
  }

  private check(c: number): void {
    if (!Number.isInteger(c) || c < 0 || c >= this.cost.length) throw new Error(`No cell ${c} in a ${this.layer.nx} × ${this.layer.nz} layer`);
  }
}

/** Every cell's cost from `from` by the layer's own moves, −1 where it can't be reached. */
export function distanceTable(search: GridSearch, from: number): Int32Array {
  search.flood([from], { maxExpansions: search.cost.length });
  return search.cost.slice();
}

/** A layer's ground, by what can be walked to from what. */
export interface Components {
  /** Each cell's piece of ground, numbered from 0 in the order of their lowest cells; −1 for a cell no move leads out of. */
  label: Int32Array;
  /** How many cells each piece has. */
  sizes: number[];
}

/**
 * Which cells can reach which, by the layer's own moves: moves are open both ways, so two
 * cells have a path between them exactly when they share a label. A search between two that
 * don't would expand everything the start can reach before it could say so.
 */
export function components(search: GridSearch): Components {
  const n = search.cost.length;
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  for (let c = 0; c < n; c++) {
    if (label[c] !== -1 || !search.connected(c)) continue;
    search.flood([c], { maxExpansions: n });
    sizes.push(search.mark(label, sizes.length));
  }
  return { label, sizes };
}

/**
 * Distance tables from `count` cells of one piece of ground, spread as far apart as it
 * allows (ALT: A*, landmarks and the triangle inequality; Goldberg and Harrelson, 2005).
 * The first is the cell farthest from `seed`, and each one after is the cell farthest from
 * all those chosen so far, the lowest cell winning a tie: far-apart cells give the sharpest
 * bounds, since a path that runs toward one or away from it is measured exactly. Fewer than
 * `count` where the ground runs out of cells.
 */
export function landmarkTables(search: GridSearch, seed: number, count: number): Bounds {
  const tables: Int32Array[] = [];
  if (count > 0) chooseLandmarks(search, seed, count, tables);
  // A row a cell: a search reads all of a cell's bounds together.
  const cells = search.cost.length;
  const table = new Int32Array(cells * tables.length);
  for (let t = 0; t < tables.length; t++) {
    const from = tables[t]!;
    for (let c = 0; c < cells; c++) table[c * tables.length + t] = from[c]!;
  }
  return { count: tables.length, table };
}

function chooseLandmarks(search: GridSearch, seed: number, count: number, tables: Int32Array[]): void {
  // The least cost to each cell from any cell chosen so far: to begin with, from the seed.
  const nearest = distanceTable(search, seed);
  for (let k = 0; k < count; k++) {
    let far = -1;
    let most = 0;
    for (let c = 0; c < nearest.length; c++) {
      if (nearest[c]! > most) {
        most = nearest[c]!;
        far = c;
      }
    }
    if (far < 0) break;
    const table = distanceTable(search, far);
    tables.push(table);
    // The seed was only somewhere to start from: once a real one is chosen, it stops counting.
    if (k === 0) nearest.set(table);
    else for (let c = 0; c < nearest.length; c++) if (table[c]! >= 0 && table[c]! < nearest[c]!) nearest[c] = table[c]!;
  }
}

/**
 * A bucket queue for whole-number costs (Dial's): a ring of stacks, one per cost, long
 * enough for the dearest move, which doubles when a dearer one arrives. Pops the cheapest;
 * within a cost, the last pushed. Costs never decrease below the last popped.
 *
 * Every cost still queued lies within one turn of the ring from the cheapest, so a stack
 * holds one cost only. The stacks are linked through one pool of entries.
 */
class BucketQueue {
  /** The top entry of each stack, or −1. */
  private head = new Int32Array(1).fill(-1);
  private mask = 0;
  private base = 0;
  private count = 0;
  /** The pool: each entry's cell, its cost, and the entry beneath it in its stack. */
  private cells = new Int32Array(1024);
  private costs = new Int32Array(1024);
  private below = new Int32Array(1024);
  private used = 0;
  /** The cost of the cell the last pop returned. */
  popped = 0;

  clear(): void {
    this.head.fill(-1);
    this.base = 0;
    this.count = 0;
    this.used = 0;
  }

  push(cell: number, cost: number): void {
    if (cost < this.base) throw new Error(`A bucket queue can't take cost ${cost} after ${this.base}`);
    while (cost - this.base > this.mask) this.grow();
    if (this.used === this.cells.length) this.widen();
    const k = cost & this.mask;
    const e = this.used++;
    this.cells[e] = cell;
    this.costs[e] = cost;
    this.below[e] = this.head[k]!;
    this.head[k] = e;
    this.count++;
  }

  /** The cheapest cell, or −1 when empty. */
  pop(): number {
    if (this.count === 0) return -1;
    const head = this.head;
    const mask = this.mask;
    for (;;) {
      const k = this.base & mask;
      const e = head[k]!;
      if (e >= 0) {
        head[k] = this.below[e]!;
        this.count--;
        this.popped = this.costs[e]!;
        return this.cells[e]!;
      }
      this.base++;
    }
  }

  /** Doubles the ring: each stack moves whole to its cost's new place, so growing never changes what pops first. */
  private grow(): void {
    const size = (this.mask + 1) * 2;
    const head = new Int32Array(size).fill(-1);
    for (let k = 0; k <= this.mask; k++) {
      const e = this.head[k]!;
      if (e >= 0) head[this.costs[e]! & (size - 1)] = e;
    }
    this.head = head;
    this.mask = size - 1;
  }

  /** Doubles the pool. */
  private widen(): void {
    const n = this.cells.length * 2;
    const cells = new Int32Array(n);
    const costs = new Int32Array(n);
    const below = new Int32Array(n);
    cells.set(this.cells);
    costs.set(this.costs);
    below.set(this.below);
    this.cells = cells;
    this.costs = costs;
    this.below = below;
  }
}

/**
 * A binary min-heap of (f, h, cell), ordered by f, then h, then cell. No two entries are
 * equal in all three (a cell is pushed again only at a lower cost), so the order they come
 * off in is the order of their keys, whatever the heap's shape.
 */
class MinHeap {
  private f = new Float64Array(1024);
  private h = new Int32Array(1024);
  private cell = new Int32Array(1024);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(f: number, h: number, cell: number): void {
    if (this.size === this.cell.length) this.widen();
    const F = this.f;
    const H = this.h;
    const C = this.cell;
    let i = this.size++;
    // Up from the last place, moving each greater parent down into the gap.
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pf = F[p]!;
      if (pf < f || (pf === f && (H[p]! < h || (H[p]! === h && C[p]! < cell)))) break;
      F[i] = pf;
      H[i] = H[p]!;
      C[i] = C[p]!;
      i = p;
    }
    F[i] = f;
    H[i] = h;
    C[i] = cell;
  }

  /** Removes the least item, returning its cell. */
  pop(): number {
    const F = this.f;
    const H = this.h;
    const C = this.cell;
    const top = C[0]!;
    const n = --this.size;
    if (n === 0) return top;
    // The last item goes down from the top, each lesser child moving up into the gap.
    const f = F[n]!;
    const h = H[n]!;
    const cell = C[n]!;
    let i = 0;
    for (;;) {
      let l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      if (r < n) {
        const lf = F[l]!;
        const rf = F[r]!;
        if (rf < lf || (rf === lf && (H[r]! < H[l]! || (H[r]! === H[l]! && C[r]! < C[l]!)))) l = r;
      }
      const lf = F[l]!;
      if (!(lf < f || (lf === f && (H[l]! < h || (H[l]! === h && C[l]! < cell))))) break;
      F[i] = lf;
      H[i] = H[l]!;
      C[i] = C[l]!;
      i = l;
    }
    F[i] = f;
    H[i] = h;
    C[i] = cell;
    return top;
  }

  private widen(): void {
    const n = this.cell.length * 2;
    const f = new Float64Array(n);
    const h = new Int32Array(n);
    const cell = new Int32Array(n);
    f.set(this.f);
    h.set(this.h);
    cell.set(this.cell);
    this.f = f;
    this.h = h;
    this.cell = cell;
  }
}
