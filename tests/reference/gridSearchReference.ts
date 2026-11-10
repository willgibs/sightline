import { Edge, type GridLayer } from '../../src/sim/kernel/world/grid';
import type { PathResult, SearchOptions, SearchResult } from '../../src/sim/kernel/world/search';

/**
 * The grid search as it was first written (Wave 0), kept as the plain statement of what a
 * search does: one closure a move, one array a bucket, a heap of triples. The search the
 * game runs (src/sim/kernel/world/search.ts) is written for speed, and tests/search.test.ts
 * holds it to this one: the same costs, parents, paths and expansion counts, cell for cell.
 */

export const COST_PER_METRE = 100;

const NEIGHBOURS: ReadonlyArray<readonly [di: number, dj: number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

const NOT_REACHED = -1;

/**
 * Searches one layer. It holds the scratch every search on the layer rewrites, so keep one
 * for the world's life: nothing carries over from one search to the next. Results (costs
 * and parents) are valid until the next search on the same GridSearch.
 */
export class ReferenceSearch {
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
  private readonly touched: number[] = [];

  constructor(readonly layer: GridLayer) {
    const n = layer.nx * layer.nz;
    this.cost = new Int32Array(n).fill(NOT_REACHED);
    this.parent = new Int32Array(n).fill(NOT_REACHED);
    this.closed = new Uint8Array(n);
    this.side = Math.round(layer.cell * COST_PER_METRE);
    this.corner = Math.round(layer.cell * COST_PER_METRE * Math.SQRT2);
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
    const nx = this.layer.nx;
    const di = Math.abs((a % nx) - (b % nx));
    const dj = Math.abs(Math.floor(a / nx) - Math.floor(b / nx));
    if (!corners) return (di + dj) * this.side;
    const lo = Math.min(di, dj);
    return (di + dj - 2 * lo) * this.side + lo * this.corner;
  }

  /** Calls `relax` for every open move out of `c`, in NEIGHBOURS order, with its cost. */
  private visit(c: number, opts: SearchOptions, relax: (to: number, cost: number) => void): void {
    const L = this.layer;
    const nx = L.nx;
    const i = c % nx;
    const j = (c - i) / nx;
    const count = (opts.neighbours ?? 8) === 8 ? 8 : 4;
    const price = opts.cost;
    for (let k = 0; k < count; k++) {
      const [di, dj] = NEIGHBOURS[k]!;
      const ti = i + di;
      const tj = j + dj;
      if (ti < 0 || tj < 0 || ti >= nx || tj >= L.nz) continue;
      const to = tj * nx + ti;
      const corner = di !== 0 && dj !== 0;
      if (corner ? !this.cornerOpen(i, j, di, dj) : !this.sideOpen(i, j, di, dj)) continue;
      const length = corner ? this.corner : this.side;
      const cost = price ? price(c, to, length) : length;
      if (cost === -1) continue;
      if (!Number.isInteger(cost) || cost < 0) throw new Error(`A grid move costs ${cost}: costs are whole numbers, or −1 for no move`);
      relax(to, cost);
    }
  }

  /** The walk edge between (i, j) and its side neighbour (i + di, j + dj). */
  private sideOpen(i: number, j: number, di: number, dj: number): boolean {
    const L = this.layer;
    if (di === 1) return (L.edges[j * L.nx + i]! & Edge.East) !== 0;
    if (di === -1) return (L.edges[j * L.nx + i - 1]! & Edge.East) !== 0;
    if (dj === 1) return (L.edges[j * L.nx + i]! & Edge.North) !== 0;
    return (L.edges[(j - 1) * L.nx + i]! & Edge.North) !== 0;
  }

  /** A diagonal is open only if both two-step paths around it are. */
  private cornerOpen(i: number, j: number, di: number, dj: number): boolean {
    return this.sideOpen(i, j, di, 0) && this.sideOpen(i + di, j, 0, dj) && this.sideOpen(i, j, 0, dj) && this.sideOpen(i, j + dj, di, 0);
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
    if (!Number.isInteger(c) || c < 0 || c >= this.cost.length) throw new Error(`No cell ${c} in a ${this.layer.nx} × ${this.layer.nz} layer`);
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
