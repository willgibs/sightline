import { MOVE_BITS, MOVE_DIRS } from './raster';

/**
 * Infiltration, certified (D7): is there a way from outside the camp to a goal (a close shot
 * at the target, the generator, a way out) on which a crouched intruder is never detected?
 *
 * The question is asked over space and time at once, because the guards move: the camp's
 * exposure field (field.ts) says, for each cell and each sample of its cycle, how many
 * levels of a detection meter a sample there adds. The intruder moves a cell a sample, or
 * waits; while unseen his meter falls `decay` levels a sample; seen, it rises by the field's
 * rate (a still one by `still` of it); at `levels` he is detected. So exposure is allowed,
 * as long as it stays below what lab A's fill rates would complete (sight.ts is A's law,
 * held to it), and safety is a path, not a place. One meter takes every guard's view, so it
 * fills at least as fast as any one guard's would.
 *
 * The search is A* over (cell, time): time is what it minimizes (the earliest arrival), and
 * a state reached at the same cell and time with a lower meter dominates (from a lower meter,
 * every future is at least as safe). Its estimate is the walking distance to the nearest
 * goal, which never overestimates, so the first goal it reaches is the earliest. Entering
 * from outside is a move from any cell on the raster's rim, at any time, with an empty
 * meter. It stops after `maxExpansions` (rule 18) and says so.
 *
 * `bruteForce` answers the same question by sweeping every cell at every time, which tests
 * use to hold the search to the exact answer on small camps.
 */
export interface Space {
  na: number;
  nb: number;
  walk: Uint8Array;
  moves: Uint8Array;
  /** Moves besides the grid's: to and from cells after na·nb (an upper floor, a stair), and any extra links of a grid cell. */
  links?: ReadonlyMap<number, readonly number[]> | null;
}

/** All the cells of a space: its grid and any upper floor's beyond it. */
function cellCount(S: Space): number {
  return S.walk.length;
}

export interface Exposure {
  samples: number;
  cells: number;
  /** Levels per sample, by cell then sample: rate[c·samples + k]. */
  rate: Uint8Array;
  /** More exposure on top, sparse, by the same index (c·samples + k → levels). */
  extra?: ReadonlyMap<number, number>;
}

function rateOf(E: Exposure, c: number, t: number): number {
  const k = c * E.samples + (t % E.samples);
  return E.extra === undefined ? E.rate[k]! : E.rate[k]! + (E.extra.get(k) ?? 0);
}

export interface Meter {
  levels: number;
  /** Levels shed per sample unseen. */
  decay: number;
  /**
   * How much of the rate a still intruder takes (design doc: still 0.4 of moving): one who
   * stays put in a cell rather than moving into it freezes, and fills a guard's meter slower.
   */
  still: number;
}

export interface Search {
  /** Where the intruder may start: a cell and a time, with a meter; or anywhere on the rim, any time, if absent. */
  from?: { cell: number; time: number; meter: number };
  /** Whether (cell, time) is a goal. */
  goal: (cell: number, time: number) => boolean;
  /** The cells the goal can be at (some time): the estimate aims at the nearest. */
  goalCells: readonly number[];
  /** Search no later than this time (samples from 0). */
  horizon: number;
  maxExpansions: number;
  /** Greedier than A* when above 1: f = arrival + weight × distance. It still finds a way if one exists, just not the earliest; 1 (the default) is exact. */
  weight?: number;
}

export interface Infiltration {
  found: boolean;
  /** Arrival time (samples), or −1. */
  time: number;
  /** The path: cells by sample, from entry to goal; empty if none. */
  cells: number[];
  /** When the path entered the raster (or left `from`). */
  start: number;
  /** The highest the meter rose on the way, and where it stood on arrival, in levels. */
  peak: number;
  meter: number;
  expanded: number;
  exhausted: boolean;
}

const OUTSIDE = -1;

/** Moves and waits from a cell, in a fixed order: the four sides, then staying put. */
function neighbours(S: Space, c: number, out: number[]): number[] {
  out.length = 0;
  if (c < S.na * S.nb) {
    const i = c % S.na;
    const j = (c - i) / S.na;
    const m = S.moves[c]!;
    for (let d = 0; d < 4; d++) {
      if ((m & MOVE_BITS[d]!) === 0) continue;
      const [di, dj] = MOVE_DIRS[d]!;
      out.push((j + dj) * S.na + (i + di));
    }
  }
  const more = S.links?.get(c);
  if (more) out.push(...more);
  out.push(c);
  return out;
}

/** The raster's walkable rim: where an intruder from outside first sets foot. */
export function rimCells(S: Space): number[] {
  const out: number[] = [];
  for (let j = 0; j < S.nb; j++) {
    for (let i = 0; i < S.na; i++) {
      if (i !== 0 && j !== 0 && i !== S.na - 1 && j !== S.nb - 1) continue;
      const c = j * S.na + i;
      if (S.walk[c]) out.push(c);
    }
  }
  return out;
}

/** Steps from every cell to the nearest of `goals`, over the moves (−1 where none). */
export function stepsTo(S: Space, goals: readonly number[]): Int32Array {
  const n = cellCount(S);
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const g of goals) {
    if (dist[g] !== -1) continue;
    dist[g] = 0;
    queue[tail++] = g;
  }
  const nb: number[] = [];
  while (head < tail) {
    const c = queue[head++]!;
    for (const o of neighbours(S, c, nb)) {
      if (o === c || dist[o] !== -1) continue;
      dist[o] = dist[c]! + 1;
      queue[tail++] = o;
    }
  }
  return dist;
}

function nextMeter(m: number, rate: number, M: Meter, stayed = false): number {
  if (rate === 0) return Math.max(0, m - M.decay);
  return m + (stayed ? Math.ceil(rate * M.still - 1e-9) : rate);
}

/**
 * The plain space-time search: A* over (cell, time), one sample at a time. Exact, but a long
 * wait for a window costs a state per cell per sample; `infiltrate` is the same search over
 * safe intervals, and tests hold both to the brute-force answer.
 */
export function spaceTimeSearch(S: Space, E: Exposure, M: Meter, Q: Search): Infiltration {
  const cells = cellCount(S);
  const h = stepsTo(S, Q.goalCells);
  const rim = Q.from ? [] : rimCells(S).filter((c) => h[c]! >= 0);
  const rimH = rim.length > 0 ? Math.min(...rim.map((c) => h[c]!)) : Infinity;
  const rateAt = (c: number, t: number): number => rateOf(E, c, t);
  // Best meter seen at (time, cell): a state no better than one already seen is dropped.
  const best = new Map<number, number>();
  const parent = new Map<number, number>();
  const heap = new StateHeap();
  const key = (t: number, c: number): number => t * (cells + 1) + (c + 1);
  const push = (t: number, c: number, m: number, from: number) => {
    const k = key(t, c);
    const old = best.get(k);
    if (old !== undefined && old <= m) return;
    best.set(k, m);
    parent.set(k, from);
    heap.push(t + (c === OUTSIDE ? rimH + 1 : h[c]!), t, c, m);
  };
  if (Q.from) {
    if (h[Q.from.cell]! < 0) return { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded: 0, exhausted: false };
    push(Q.from.time, Q.from.cell, Q.from.meter, -1);
  } else if (rim.length > 0) push(0, OUTSIDE, 0, -1);
  let expanded = 0;
  const nb: number[] = [];
  while (heap.size > 0) {
    const { t, c, m } = heap.pop();
    if (best.get(key(t, c)) !== m) continue;
    if (c !== OUTSIDE && Q.goal(c, t)) return finish(t, c);
    if (expanded >= Q.maxExpansions) return { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded, exhausted: true };
    expanded++;
    if (t + 1 > Q.horizon) continue;
    const k = key(t, c);
    if (c === OUTSIDE) {
      // Waiting outside is free; stepping onto the rim brings whatever is watching it.
      push(t + 1, OUTSIDE, 0, k);
      for (const r of rim) {
        const nm = nextMeter(0, rateAt(r, t + 1), M);
        if (nm < M.levels) push(t + 1, r, nm, k);
      }
      continue;
    }
    for (const o of neighbours(S, c, nb)) {
      if (h[o]! < 0) continue;
      const nm = nextMeter(m, rateAt(o, t + 1), M, o === c);
      if (nm < M.levels) push(t + 1, o, nm, k);
    }
  }
  return { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded, exhausted: false };

  function finish(t: number, c: number): Infiltration {
    const path: number[] = [];
    let peak = 0;
    let start = t;
    for (let k = key(t, c); k !== -1; k = parent.get(k)!) {
      const cell = (k % (cells + 1)) - 1;
      const time = Math.floor(k / (cells + 1));
      if (cell === OUTSIDE) break;
      path.push(cell);
      peak = Math.max(peak, best.get(k)!);
      start = time;
    }
    path.reverse();
    return { found: true, time: t, cells: path, start, peak, meter: best.get(key(t, c))!, expanded, exhausted: false };
  }
}

/**
 * Safe Interval Path Planning with an exposure meter (D7): the search the camp is certified
 * by. Phillips and Likhachev's SIPP collapses a cell's time into safe intervals, the runs of
 * samples no guard watches it, and searches (cell, interval) instead of (cell, time): the
 * earliest arrival in an interval dominates every later one, because waiting there costs
 * nothing. Exposure that stays below the meter's limit is allowed, so the intervals here are
 * of two kinds: a safe run, where waiting lowers the meter, and a single watched sample,
 * whose rate the meter takes on arrival. A watched sample at or past the limit is a wall in
 * time. Labels are (cell, interval, meter level, arrival), and each interval keeps the
 * Pareto front of its labels: one dominates another that arrived no earlier if waiting
 * brings its meter down to no fuller (in a safe run), or with no fuller a meter (at a watched
 * sample). The labels live in a pool, so the meter can be fine (128 levels) at no cost in
 * memory. A* orders them by arrival plus the walking distance to the goal.
 *
 * It answers exactly what `spaceTimeSearch` and `bruteForce` answer, on the same model,
 * which tests check, while expanding far fewer states when the way in means waiting.
 */
export function infiltrate(S: Space, E: Exposure, M: Meter, Q: Search): Infiltration {
  const cells = cellCount(S);
  const H = Q.horizon;
  const h = stepsTo(S, Q.goalCells);
  const rim = Q.from ? [] : rimCells(S).filter((c) => h[c]! >= 0);
  const rimH = rim.length > 0 ? Math.min(...rim.map((c) => h[c]!)) : Infinity;
  const none = (expanded: number, exhausted: boolean): Infiltration => ({ found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded, exhausted });
  const weight = Q.weight ?? 1;
  // Per cell, made the first time the search reaches it: its intervals over [0, H] (starts,
  // ends inclusive, and rates: 0 for a safe run), and the first label of each interval's
  // list, with one slot past the intervals for a given start.
  const OUT = cells; // the outside, a cell of its own with one safe interval
  const ivStart: Array<Int32Array | undefined> = new Array(cells + 1);
  const ivEnd: Array<Int32Array | undefined> = new Array(cells + 1);
  const ivRate: Array<Uint8Array | undefined> = new Array(cells + 1);
  const heads: Array<Int32Array | undefined> = new Array(cells + 1);
  const make = (c: number): number => {
    const known = ivStart[c];
    if (known) return known.length;
    const st: number[] = [];
    const en: number[] = [];
    const ra: number[] = [];
    if (c === OUT) {
      st.push(0);
      en.push(H);
      ra.push(0);
    } else {
      let open = -1;
      for (let t = 0; t <= H; t++) {
        const r = rateOf(E, c, t);
        if (r === 0) {
          if (open < 0) open = t;
          continue;
        }
        if (open >= 0) {
          st.push(open);
          en.push(t - 1);
          ra.push(0);
          open = -1;
        }
        // A wall in time only if even a still intruder, already there, couldn't take it.
        if (Math.ceil(r * M.still - 1e-9) < M.levels) {
          st.push(t);
          en.push(t);
          ra.push(r);
        }
      }
      if (open >= 0) {
        st.push(open);
        en.push(H);
        ra.push(0);
      }
    }
    ivStart[c] = Int32Array.from(st);
    ivEnd[c] = Int32Array.from(en);
    ivRate[c] = Uint8Array.from(ra);
    heads[c] = new Int32Array(st.length + 1).fill(-1);
    return st.length;
  };
  /** The interval of cell c holding time t, or −1 (watched past the limit, or out of the horizon). */
  const intervalAt = (c: number, t: number): number => {
    const n = make(c);
    const st = ivStart[c]!;
    const en = ivEnd[c]!;
    let lo = 0;
    let hi = n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (en[mid]! < t) lo = mid + 1;
      else if (st[mid]! > t) hi = mid - 1;
      else return mid;
    }
    return -1;
  };
  // Labels, in a pool: arrival, meter, cell, slot, the label it came from, and the next in its
  // slot's list. Within a safe interval, a label that arrived no later dominates another if
  // waiting brings its meter down to no fuller, so it also covers every move the other
  // makes; a watched sample is a single moment, where a label dominates only with no fuller
  // a meter. A new label no better than one in its list is dropped, and a label is skipped
  // when it comes off the heap if another in its list has since beaten it (never mutually).
  // So the lists hold Pareto fronts of (arrival, meter), and the meter's resolution costs no
  // memory.
  let cap = 1 << 14;
  let lT = new Float64Array(cap);
  let lM = new Int32Array(cap);
  let lC = new Int32Array(cap);
  let lS = new Int32Array(cap);
  let lP = new Int32Array(cap);
  let lN = new Int32Array(cap);
  let count = 0;
  const alloc = (): number => {
    if (count === cap) {
      cap *= 2;
      const grow = <A extends Float64Array | Int32Array>(old: A, make: (n: number) => A): A => {
        const a = make(cap);
        a.set(old);
        return a;
      };
      lT = grow(lT, (n) => new Float64Array(n));
      lM = grow(lM, (n) => new Int32Array(n));
      lC = grow(lC, (n) => new Int32Array(n));
      lS = grow(lS, (n) => new Int32Array(n));
      lP = grow(lP, (n) => new Int32Array(n));
      lN = grow(lN, (n) => new Int32Array(n));
    }
    return count++;
  };
  /** The meter label y would have at time t, waiting in its interval (`safe`), or its own if it can't wait. */
  const settled = (y: number, t: number, safe: boolean): number => (safe && lT[y]! < t ? Math.max(0, lM[y]! - M.decay * (t - lT[y]!)) : lM[y]!);
  const heap = new LabelHeap();
  const push = (c: number, s: number, m: number, t: number, from: number, safe: boolean) => {
    const list = heads[c]!;
    for (let y = list[s]!; y >= 0; y = lN[y]!) if (lT[y]! <= t && settled(y, t, safe) <= m) return;
    const x = alloc();
    lT[x] = t;
    lM[x] = m;
    lC[x] = c;
    lS[x] = s;
    lP[x] = from;
    lN[x] = list[s]!;
    list[s] = x;
    heap.push(t + weight * (c === OUT ? rimH + 1 : h[c]!), t, c, s, m, x);
  };
  /** Whether another label in x's list has beaten it. */
  const beaten = (x: number, safe: boolean): boolean => {
    const t = lT[x]!;
    const m = lM[x]!;
    for (let y = heads[lC[x]!]![lS[x]!]!; y >= 0; y = lN[y]!) {
      if (y === x || lT[y]! > t) continue;
      const left = settled(y, t, safe);
      if (left < m || (left === m && lT[y]! < t)) return true;
    }
    return false;
  };
  /** Arrive in cell o at time t with meter m before its exposure there (`stayed`: he was already in it, still). */
  const arrive = (o: number, t: number, m: number, from: number, stayed = false) => {
    if (t > H || h[o]! < 0) return;
    const j = intervalAt(o, t);
    if (j < 0) return;
    const r = ivRate[o]![j]!;
    const nm = nextMeter(m, r, M, stayed);
    if (nm >= M.levels) return;
    push(o, j, nm, t, from, r === 0);
  };
  // A given start is taken as it is, whatever watches it then: a moment of its own, with no waiting.
  if (Q.from) {
    if (h[Q.from.cell]! < 0) return none(0, false);
    push(Q.from.cell, make(Q.from.cell), Q.from.meter, Q.from.time, -1, false);
  } else if (rim.length > 0) {
    make(OUT);
    push(OUT, 0, 0, 0, -1, true);
  }
  let expanded = 0;
  const nb: number[] = [];
  const goalSet = new Set(Q.goalCells);
  // A goal reached by waiting in a safe interval for it to open: it wins once nothing left
  // in the heap could arrive sooner.
  let waiting: { x: number; w: number } | null = null;
  while (heap.size > 0) {
    if (waiting && heap.topF() >= waiting.w) return finish(waiting.x, waiting.w);
    const x = heap.pop();
    const t = lT[x]!;
    const c = lC[x]!;
    const s = lS[x]!;
    const m = lM[x]!;
    const given = s === ivStart[c]!.length; // the given start's slot
    const rate = given ? 1 : ivRate[c]![s]!;
    if (beaten(x, rate === 0)) continue;
    if (c !== OUT && Q.goal(c, t)) return finish(x, t);
    if (c !== OUT && rate === 0 && goalSet.has(c)) {
      const end = ivEnd[c]![s]!;
      for (let w = t + 1; w <= end; w++) {
        if (!Q.goal(c, w)) continue;
        if (!waiting || w < waiting.w) waiting = { x, w };
        break;
      }
    }
    if (expanded >= Q.maxExpansions) return none(expanded, true);
    expanded++;
    if (c === OUT) {
      // Waiting outside is free; each rim cell is entered as early as each of its intervals
      // allows: at once into the one under way, at their starts into the rest.
      for (const r of rim) {
        const nr = make(r);
        const st = ivStart[r]!;
        const en = ivEnd[r]!;
        for (let j = 0; j < nr; j++) {
          const at = Math.max(t + 1, st[j]!);
          if (at <= en[j]!) arrive(r, at, 0, x);
        }
      }
      continue;
    }
    const end = rate === 0 ? ivEnd[c]![s]! : t; // how long he can stay
    for (const o of neighbours(S, c, nb)) {
      if (o === c) {
        // Staying put past this interval: into whatever holds the next sample, if anything does.
        if (end + 1 <= H) arrive(c, end + 1, Math.max(0, m - (rate === 0 ? M.decay * (end - t) : 0)), x, true);
        continue;
      }
      if (h[o]! < 0) continue;
      // Every interval of the neighbour he can step into while he can still be here.
      const no = make(o);
      const st = ivStart[o]!;
      const en = ivEnd[o]!;
      const first = intervalAt(o, t + 1);
      for (let j = first >= 0 ? first : firstAfter(st, no, t + 1); j < no; j++) {
        const at = Math.max(t + 1, st[j]!);
        if (at > end + 1) break;
        if (at > en[j]!) continue;
        const left = rate === 0 ? Math.max(0, m - M.decay * (at - 1 - t)) : m;
        arrive(o, at, left, x);
      }
    }
  }
  if (waiting) return finish(waiting.x, waiting.w);
  return none(expanded, false);

  /** The path to label x, then waiting in its cell until time t. */
  function finish(x: number, t: number): Infiltration {
    // Walk the labels back, filling the waits in each interval with its cell.
    const labels: Array<{ c: number; t: number; m: number }> = [];
    for (let y = x; y !== -1; y = lP[y]!) labels.push({ c: lC[y]!, t: lT[y]!, m: lM[y]! });
    labels.reverse();
    const path: number[] = [];
    let start = t;
    let peak = 0;
    for (let q = 0; q < labels.length; q++) {
      const a = labels[q]!;
      if (a.c === OUT) continue;
      if (path.length === 0) start = a.t;
      peak = Math.max(peak, a.m);
      const until = q + 1 < labels.length ? labels[q + 1]!.t - 1 : t;
      for (let w = a.t; w <= until; w++) path.push(a.c);
    }
    const last = labels[labels.length - 1]!;
    // A wait at the end, in a safe interval, lowers the meter.
    const meter = Math.max(0, last.m - M.decay * (t - last.t));
    return { found: true, time: t, cells: path, start, peak, meter, expanded, exhausted: false };
  }
}

function firstAfter(st: Int32Array, n: number, t: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (st[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A binary min-heap of labels by (f, then later time, then cell, slot, meter): every tie broken the same way. */
class LabelHeap {
  private readonly items: number[] = [];
  get size(): number {
    return this.items.length / 6;
  }
  /** The least f in the heap. */
  topF(): number {
    return this.items[0]!;
  }
  push(f: number, t: number, c: number, s: number, m: number, label: number): void {
    const a = this.items;
    a.push(f, t, c, s, m, label);
    let x = a.length / 6 - 1;
    while (x > 0) {
      const p = (x - 1) >> 1;
      if (!this.less(x, p)) break;
      this.swap(x, p);
      x = p;
    }
  }
  /** Takes the least label off the heap, and returns it. */
  pop(): number {
    const a = this.items;
    const out = a[5]!;
    const last = a.length / 6 - 1;
    this.swap(0, last);
    a.length = last * 6;
    let x = 0;
    for (;;) {
      const l = 2 * x + 1;
      if (l >= last) break;
      const r = l + 1;
      const s = r < last && this.less(r, l) ? r : l;
      if (!this.less(s, x)) break;
      this.swap(s, x);
      x = s;
    }
    return out;
  }
  private less(x: number, y: number): boolean {
    const a = this.items;
    const X = x * 6;
    const Y = y * 6;
    if (a[X] !== a[Y]) return a[X]! < a[Y]!;
    if (a[X + 1] !== a[Y + 1]) return a[X + 1]! > a[Y + 1]!; // the later arrival first: it's nearer the goal
    if (a[X + 2] !== a[Y + 2]) return a[X + 2]! < a[Y + 2]!;
    if (a[X + 3] !== a[Y + 3]) return a[X + 3]! < a[Y + 3]!;
    return a[X + 4]! < a[Y + 4]!; // unique: a list never holds two labels with one arrival and one meter
  }
  private swap(x: number, y: number): void {
    const a = this.items;
    const X = x * 6;
    const Y = y * 6;
    for (let o = 0; o < 6; o++) {
      const t = a[X + o]!;
      a[X + o] = a[Y + o]!;
      a[Y + o] = t;
    }
  }
}

/**
 * The same question answered exhaustively: the lowest meter at every cell at every time, a
 * sample at a time, until a goal is reached or the horizon passes. The earliest arrival is
 * exact; the search must agree with it.
 */
export function bruteForce(S: Space, E: Exposure, M: Meter, Q: Search): { found: boolean; time: number } {
  const cells = cellCount(S);
  const NONE = 255;
  let now = new Uint8Array(cells).fill(NONE);
  let next = new Uint8Array(cells);
  const rim = Q.from ? [] : rimCells(S);
  const rateAt = (c: number, t: number): number => rateOf(E, c, t);
  if (Q.from) {
    now[Q.from.cell] = Q.from.meter;
    if (Q.goal(Q.from.cell, Q.from.time)) return { found: true, time: Q.from.time };
  }
  const nb: number[] = [];
  for (let t = Q.from ? Q.from.time : 0; t < Q.horizon; t++) {
    next.fill(NONE);
    for (let c = 0; c < cells; c++) {
      const m = now[c]!;
      if (m === NONE) continue;
      for (const o of neighbours(S, c, nb)) {
        const nm = nextMeter(m, rateAt(o, t + 1), M, o === c);
        if (nm < M.levels && nm < next[o]!) next[o] = nm;
      }
    }
    for (const r of rim) {
      const nm = nextMeter(0, rateAt(r, t + 1), M);
      if (nm < M.levels && nm < next[r]!) next[r] = nm;
    }
    [now, next] = [next, now];
    for (let c = 0; c < cells; c++) if (now[c] !== NONE && Q.goal(c, t + 1)) return { found: true, time: t + 1 };
  }
  return { found: false, time: -1 };
}

/** A binary min-heap of states by (f, then later time, then cell, then meter): every tie broken the same way. */
class StateHeap {
  private readonly f: number[] = [];
  private readonly t: number[] = [];
  private readonly c: number[] = [];
  private readonly m: number[] = [];
  get size(): number {
    return this.f.length;
  }
  push(f: number, t: number, c: number, m: number): void {
    this.f.push(f);
    this.t.push(t);
    this.c.push(c);
    this.m.push(m);
    let i = this.f.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): { t: number; c: number; m: number } {
    const out = { t: this.t[0]!, c: this.c[0]!, m: this.m[0]! };
    const last = this.f.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.t.pop();
    this.c.pop();
    this.m.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= this.f.length) break;
      const r = l + 1;
      const s = r < this.f.length && this.less(r, l) ? r : l;
      if (!this.less(s, i)) break;
      this.swap(s, i);
      i = s;
    }
    return out;
  }
  private less(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a]! < this.f[b]!;
    if (this.t[a] !== this.t[b]) return this.t[a]! > this.t[b]!;
    if (this.c[a] !== this.c[b]) return this.c[a]! < this.c[b]!;
    return this.m[a]! < this.m[b]!;
  }
  private swap(a: number, b: number): void {
    for (const arr of [this.f, this.t, this.c, this.m]) {
      const x = arr[a]!;
      arr[a] = arr[b]!;
      arr[b] = x;
    }
  }
}
