import type { WorkCounts } from '../work';
import { Edge, type GridLayer, type Stair, type Storey } from './grid';

/**
 * Search over a layer of the spatial grid (grid.ts), the map layer or the site layer, and
 * the storeys above it, joined by stairs: one answer for lab A's hearing (a bounded flood
 * from each sound), lab D's analysis (who can reach what) and lab E's navigation (A* between
 * two cells). Generation and the simulation use the same code. With storeys the cells are
 * one index space: the base layer's first, then each storey's, so a stair is a move like any
 * other. With none it is the base layer alone, bit for bit.
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

/**
 * Searches one layer. It holds the scratch every search on the layer rewrites, so keep one
 * for the world's life: nothing carries over from one search to the next. Results (costs
 * and parents) are valid until the next search on the same GridSearch.
 */
export class GridSearch {
  /** Each cell's cost from the nearest source, after a search; −1 where it wasn't reached. */
  readonly cost: Int32Array;
  /** Each cell's parent on its cheapest path, after a search; −1 for a source or a cell not reached. */
  readonly parent: Int32Array;
  /** The length cost of a move to a side and to a corner, in COST_PER_METRE units. */
  readonly side: number;
  readonly corner: number;
  /** The storeys above the base layer, and the first index of each one's cells. */
  readonly levels: ReadonlyArray<{ layer: GridLayer; base: number }>;
  private readonly ground: { layer: GridLayer; base: number };
  /** Moves between levels: the stairs, both ways, by the cell they leave. */
  private readonly links: ReadonlyMap<number, ReadonlyArray<{ to: number; cost: number }>> | null;
  private readonly closed: Uint8Array;
  private readonly buckets = new BucketQueue();
  private readonly heap = new MinHeap();
  private readonly touched: number[] = [];
  /** The grid-wide (i, j) of the last cell `place` was given. */
  private pi = 0;
  private pj = 0;

  constructor(readonly layer: GridLayer, storeys: readonly Storey[] = [], stairs: readonly Stair[] = []) {
    const n0 = layer.nx * layer.nz;
    let n = n0;
    this.levels = storeys.map((s) => {
      const base = n;
      n += s.layer.nx * s.layer.nz;
      return { layer: s.layer, base };
    });
    this.cost = new Int32Array(n).fill(NOT_REACHED);
    this.parent = new Int32Array(n).fill(NOT_REACHED);
    this.closed = new Uint8Array(n);
    this.side = Math.round(layer.cell * COST_PER_METRE);
    this.corner = Math.round(layer.cell * COST_PER_METRE * Math.SQRT2);
    this.ground = { layer, base: 0 };
    if (stairs.length === 0) {
      this.links = null;
    } else {
      const links = new Map<number, Array<{ to: number; cost: number }>>();
      const add = (a: number, b: number, cost: number): void => {
        const out = links.get(a);
        if (out) out.push({ to: b, cost });
        else links.set(a, [{ to: b, cost }]);
      };
      for (const st of stairs) {
        const head = this.levels[st.storey]!.base + st.head;
        add(st.foot, head, st.cost);
        add(head, st.foot, st.cost);
      }
      this.links = links;
    }
  }

  /** The grid-wide cell (the storey layers line up with the base layer's cells) of a cell index, as (i, j). */
  private place(c: number): void {
    const L = this.layer;
    if (c < L.nx * L.nz) {
      this.pi = c % L.nx;
      this.pj = (c - this.pi) / L.nx;
      return;
    }
    for (const lv of this.levels) {
      const m = lv.layer.nx * lv.layer.nz;
      if (c < lv.base + m) {
        const local = c - lv.base;
        const i = local % lv.layer.nx;
        this.pi = i + Math.round((lv.layer.x0 - L.x0) / L.cell);
        this.pj = (local - i) / lv.layer.nx + Math.round((lv.layer.z0 - L.z0) / L.cell);
        return;
      }
    }
    throw new Error(`No cell ${c} in this search`);
  }

  /** The layer a cell index belongs to, and the first index of its cells. */
  levelOf(c: number): { layer: GridLayer; base: number } {
    if (c < this.layer.nx * this.layer.nz) return this.ground;
    for (const lv of this.levels) if (c < lv.base + lv.layer.nx * lv.layer.nz) return lv;
    throw new Error(`No cell ${c} in this search`);
  }

  /** The cell index of (i, j). */
  index(i: number, j: number): number {
    return j * this.layer.nx + i;
  }

  /**
   * Dijkstra from every source at once, with a bucket queue: every cell's cost from its
   * nearest source and its parent toward it, up to maxCost. Cells at equal cost expand in
   * the order they were reached.
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
    for (const s of sources) {
      this.check(s);
      if (this.cost[s] === 0) continue;
      this.reach(s, 0, NOT_REACHED);
      q.push(s, 0);
    }
    const limit = opts.maxCost ?? Infinity;
    let expanded = 0;
    for (let c = q.pop(); c >= 0; c = q.pop()) {
      const g = q.popped;
      if (this.closed[c] || g !== this.cost[c]) continue;
      if (expanded >= opts.maxExpansions) return { expanded, exhausted: true };
      this.closed[c] = 1;
      expanded++;
      this.visit(c, opts, (to, cost) => {
        const ng = g + cost;
        if (ng > limit) return;
        const old = this.cost[to]!;
        if (old !== NOT_REACHED && old <= ng) return;
        this.reach(to, ng, c);
        q.push(to, ng);
      });
    }
    return { expanded, exhausted: false };
  }

  /**
   * A* from `start` to `goal`, with the octile distance as its estimate. Ties break by the
   * lower estimate of what remains, then by the lower cell index. Writes the path, start
   * to goal, to `out`.
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
    const corners = (opts.neighbours ?? 8) === 8;
    const estimate = (c: number): number => this.estimate(c, goal, corners);
    this.reach(start, 0, NOT_REACHED);
    heap.push(estimate(start), estimate(start), start);
    let expanded = 0;
    while (heap.size > 0) {
      const c = heap.pop();
      if (this.closed[c]) continue;
      if (c === goal) {
        for (let k = goal; k !== NOT_REACHED; k = this.parent[k]!) out.push(k);
        out.reverse();
        return { expanded, exhausted: false, found: true, cost: this.cost[goal]! };
      }
      if (expanded >= opts.maxExpansions) return { expanded, exhausted: true, found: false, cost: -1 };
      this.closed[c] = 1;
      expanded++;
      const g = this.cost[c]!;
      this.visit(c, opts, (to, cost) => {
        if (this.closed[to]) return;
        const ng = g + cost;
        const old = this.cost[to]!;
        if (old !== NOT_REACHED && old <= ng) return;
        this.reach(to, ng, c);
        const h = estimate(to);
        heap.push(ng + h, h, to);
      });
    }
    return { expanded, exhausted: false, found: false, cost: -1 };
  }

  /** The cheapest cost of a path from `a` to `b` on an open layer: what A* aims by. */
  estimate(a: number, b: number, corners = true): number {
    let di: number;
    let dj: number;
    if (this.levels.length === 0) {
      const nx = this.layer.nx;
      di = Math.abs((a % nx) - (b % nx));
      dj = Math.abs(Math.floor(a / nx) - Math.floor(b / nx));
    } else {
      this.place(a);
      const ai = this.pi;
      const aj = this.pj;
      this.place(b);
      di = Math.abs(ai - this.pi);
      dj = Math.abs(aj - this.pj);
    }
    if (!corners) return (di + dj) * this.side;
    const lo = Math.min(di, dj);
    return (di + dj - 2 * lo) * this.side + lo * this.corner;
  }

  /** Calls `relax` for every open move out of `c`, in NEIGHBOURS order, with its cost. */
  private visit(c: number, opts: SearchOptions, relax: (to: number, cost: number) => void): void {
    let L = this.layer;
    let base = 0;
    if (c >= L.nx * L.nz) {
      const lv = this.levelOf(c);
      L = lv.layer;
      base = lv.base;
    }
    const nx = L.nx;
    const local = c - base;
    const i = local % nx;
    const j = (local - i) / nx;
    const count = (opts.neighbours ?? 8) === 8 ? 8 : 4;
    const price = opts.cost;
    for (let k = 0; k < count; k++) {
      const [di, dj] = NEIGHBOURS[k]!;
      const ti = i + di;
      const tj = j + dj;
      if (ti < 0 || tj < 0 || ti >= nx || tj >= L.nz) continue;
      const to = base + tj * nx + ti;
      const corner = di !== 0 && dj !== 0;
      if (corner ? !this.cornerOpen(L, i, j, di, dj) : !this.sideOpen(L, i, j, di, dj)) continue;
      const length = corner ? this.corner : this.side;
      const cost = price ? price(c, to, length) : length;
      if (cost === -1) continue;
      if (!Number.isInteger(cost) || cost < 0) throw new Error(`A grid move costs ${cost}: costs are whole numbers, or −1 for no move`);
      relax(to, cost);
    }
    // The stairs out of this cell, if any: a move between levels.
    const out = this.links?.get(c);
    if (out) {
      for (const link of out) {
        const cost = price ? price(c, link.to, link.cost) : link.cost;
        if (cost === -1) continue;
        relax(link.to, cost);
      }
    }
  }

  /** The walk edge between (i, j) and its side neighbour (i + di, j + dj), on layer L. */
  private sideOpen(L: GridLayer, i: number, j: number, di: number, dj: number): boolean {
    if (di === 1) return (L.edges[j * L.nx + i]! & Edge.East) !== 0;
    if (di === -1) return (L.edges[j * L.nx + i - 1]! & Edge.East) !== 0;
    if (dj === 1) return (L.edges[j * L.nx + i]! & Edge.North) !== 0;
    return (L.edges[(j - 1) * L.nx + i]! & Edge.North) !== 0;
  }

  /** A diagonal is open only if both two-step paths around it are. */
  private cornerOpen(L: GridLayer, i: number, j: number, di: number, dj: number): boolean {
    return this.sideOpen(L, i, j, di, 0) && this.sideOpen(L, i + di, j, 0, dj) && this.sideOpen(L, i, j, 0, dj) && this.sideOpen(L, i, j + dj, di, 0);
  }

  private reach(c: number, cost: number, from: number): void {
    if (this.cost[c] === NOT_REACHED) this.touched.push(c);
    this.cost[c] = cost;
    this.parent[c] = from;
  }

  /** Undoes the last search's marks: only the cells it touched. */
  private clear(): void {
    for (const c of this.touched) {
      this.cost[c] = NOT_REACHED;
      this.parent[c] = NOT_REACHED;
      this.closed[c] = 0;
    }
    this.touched.length = 0;
  }

  private check(c: number): void {
    if (!Number.isInteger(c) || c < 0 || c >= this.cost.length) throw new Error(`No cell ${c} in this search of ${this.cost.length} cells`);
  }
}

/**
 * A bucket queue for whole-number costs (Dial's): a ring of buckets, one per cost, long
 * enough for the dearest move, which doubles when a dearer one arrives. Pops the cheapest;
 * within a bucket, the last pushed. Costs never decrease below the last popped.
 */
class BucketQueue {
  private ring: number[][] = [[]];
  private costs: number[][] = [[]];
  private mask = 0;
  private base = 0;
  private count = 0;
  /** The cost of the cell the last pop returned. */
  popped = 0;

  clear(): void {
    for (const b of this.ring) b.length = 0;
    for (const b of this.costs) b.length = 0;
    this.base = 0;
    this.count = 0;
  }

  push(cell: number, cost: number): void {
    if (cost < this.base) throw new Error(`A bucket queue can't take cost ${cost} after ${this.base}`);
    while (cost - this.base > this.mask) this.grow();
    const k = cost & this.mask;
    this.ring[k]!.push(cell);
    this.costs[k]!.push(cost);
    this.count++;
  }

  /** The cheapest cell, or −1 when empty. */
  pop(): number {
    if (this.count === 0) return -1;
    for (;;) {
      const k = this.base & this.mask;
      const b = this.ring[k]!;
      if (b.length > 0) {
        this.count--;
        this.popped = this.costs[k]!.pop()!;
        return b.pop()!;
      }
      this.base++;
    }
  }

  /** Doubles the ring, putting every queued cell back in its bucket. */
  private grow(): void {
    const size = (this.mask + 1) * 2;
    const ring: number[][] = Array.from({ length: size }, () => []);
    const costs: number[][] = Array.from({ length: size }, () => []);
    // Re-queue in cost order, keeping each bucket's order, so growing never changes what pops first.
    for (let c = this.base; c <= this.base + this.mask; c++) {
      const from = c & this.mask;
      const cells = this.ring[from]!;
      const cs = this.costs[from]!;
      for (let k = 0; k < cells.length; k++) {
        if (cs[k] !== c) continue;
        ring[c & (size - 1)]!.push(cells[k]!);
        costs[c & (size - 1)]!.push(c);
      }
    }
    this.ring = ring;
    this.costs = costs;
    this.mask = size - 1;
  }
}

/** A binary min-heap of (f, h, cell), ordered by f, then h, then cell: every tie broken the same way. */
class MinHeap {
  private readonly items: number[] = [];

  get size(): number {
    return this.items.length / 3;
  }

  clear(): void {
    this.items.length = 0;
  }

  push(f: number, h: number, cell: number): void {
    const a = this.items;
    a.push(f, h, cell);
    let i = a.length / 3 - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Removes the least item, returning its cell. */
  pop(): number {
    const a = this.items;
    const cell = a[2]!;
    const n = a.length / 3 - 1;
    if (n > 0) {
      a[0] = a[n * 3]!;
      a[1] = a[n * 3 + 1]!;
      a[2] = a[n * 3 + 2]!;
    }
    a.length = n * 3;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const c = r < n && this.less(r, l) ? r : l;
      if (!this.less(c, i)) break;
      this.swap(c, i);
      i = c;
    }
    return cell;
  }

  private less(x: number, y: number): boolean {
    const a = this.items;
    const fx = a[x * 3]!;
    const fy = a[y * 3]!;
    if (fx !== fy) return fx < fy;
    const hx = a[x * 3 + 1]!;
    const hy = a[y * 3 + 1]!;
    if (hx !== hy) return hx < hy;
    return a[x * 3 + 2]! < a[y * 3 + 2]!;
  }

  private swap(x: number, y: number): void {
    const a = this.items;
    for (let k = 0; k < 3; k++) {
      const t = a[x * 3 + k]!;
      a[x * 3 + k] = a[y * 3 + k]!;
      a[y * 3 + k] = t;
    }
  }
}
