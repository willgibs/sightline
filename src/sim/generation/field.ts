import type { GenTuning } from '../../config/tuning';
import { DEG, dcos, dsin, datan2 } from '../kernel/core/detmath';
import type { Camp } from './camp';
import { lineOfSight, type Raster } from './raster';
import { routinePose, type Routine, type RoutinePose } from './routine';
import { coneRamp, contactRate, fillSeconds, rangeRamp, reachOf } from './sight';

/**
 * One cycle of the camp, as lab D's analysis sees it (D7). Every routine divides the
 * camp's cycle (staffing.ts), so one cycle sampled every `dt` seconds is the whole of its
 * rhythm, and everything here is exact over it, then repeats.
 *
 * - **The timeline:** where each guard is at each sample, his eye, and where he looks
 *   (his body's yaw plus his head's sweep), from his routine.
 * - **The exposure field:** for each cell of the raster and each sample, how fast a
 *   crouched intruder standing there fills a guard's detection meter, in whole meter levels
 *   per sample, summed over guards. It comes from sweeping each guard's view cone at each
 *   sample, by lab D's sight law (sight.ts: lab A's, for a crouched intruder on the move).
 * - **The witness edges:** at each sample, which guards would see which others drop: the
 *   sightline graph's raw material.
 */
export interface GuardTrack {
  /** Index in camp.guards. */
  index: number;
  x: Float32Array;
  z: Float32Array;
  /** Height of his eye, and of his chest (where he is seen and shot). */
  eye: Float32Array;
  chest: Float32Array;
  /** Where he looks, in the camp's frame: a unit vector. */
  ga: Float32Array;
  gb: Float32Array;
  /** A marksman, with binoculars: a narrow cone that sees far. */
  far: boolean;
}

export interface Timeline {
  cycle: number;
  dt: number;
  samples: number;
  guards: GuardTrack[];
}

export function buildTimeline(camp: Camp, R: Raster, gen: GenTuning): Timeline {
  const dt = gen.analysis.dt;
  const cycle = camp.cycle!;
  const samples = Math.round(cycle / dt);
  const guards = camp.guards.map((g, index) => trackOf(g.routine, g.elevated ? g.y : null, R, gen, samples, dt, index, g.role === 'marksman'));
  return { cycle, dt, samples, guards };
}

/** One guard's track over the cycle: from his routine, standing on the ground or on his deck at `deck`. */
export function trackOf(routine: Routine, deck: number | null, R: Raster, gen: GenTuning, samples: number, dt: number, index = -1, far = false): GuardTrack {
  const S = gen.sight;
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  const t: GuardTrack = { index, x: new Float32Array(samples), z: new Float32Array(samples), eye: new Float32Array(samples), chest: new Float32Array(samples), ga: new Float32Array(samples), gb: new Float32Array(samples), far };
  for (let k = 0; k < samples; k++) {
    routinePose(routine, k * dt, pose);
    const base = deck ?? groundAt(R, pose.x, pose.z);
    t.x[k] = pose.x;
    t.z[k] = pose.z;
    t.eye[k] = base + S.eye;
    t.chest[k] = base + S.chest;
    const look = pose.yaw + pose.headYaw;
    // Yaw 0 faces −z; turned into the camp's frame.
    const wx = -dsin(look);
    const wz = -dcos(look);
    t.ga[k] = wx * R.ux + wz * R.uz;
    t.gb[k] = wx * R.vx + wz * R.vz;
  }
  return t;
}

/** Whether guard a would see guard b drop at sample k: the witness ranges in a's cone, and a clear line from his eye to b's chest. */
export function seesDrop(R: Raster, A: GuardTrack, B: GuardTrack, k: number, gen: GenTuning): boolean {
  const S = gen.sight;
  const dx = B.x[k]! - A.x[k]!;
  const dz = B.z[k]! - A.z[k]!;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > S.witness.core || d < 1e-6) return false;
  const cos = ((dx * R.ux + dz * R.uz) * A.ga[k]! + (dx * R.vx + dz * R.vz) * A.gb[k]!) / d;
  const cosCore = dcos(S.cone.core * DEG);
  const cosPer = dcos(S.cone.peripheral * DEG);
  if (cos < cosPer || (cos < cosCore && d > S.witness.peripheral)) return false;
  return lineOfSight(R, A.x[k]!, A.eye[k]!, A.z[k]!, B.x[k]!, B.chest[k]!, B.z[k]!);
}

/** The share of the cycle guard a would see guard b drop. */
export function dropDuty(R: Raster, A: GuardTrack, B: GuardTrack, samples: number, gen: GenTuning): number {
  let n = 0;
  for (let k = 0; k < samples; k++) if (seesDrop(R, A, B, k, gen)) n++;
  return n / samples;
}

function groundAt(R: Raster, x: number, z: number): number {
  const dx = x - R.ox;
  const dz = z - R.oz;
  const i = Math.floor((dx * R.ux + dz * R.uz - R.a0) / R.cell);
  const j = Math.floor((dx * R.vx + dz * R.vz - R.b0) / R.cell);
  if (i < 0 || j < 0 || i >= R.na || j >= R.nb) return 0;
  return R.ground[j * R.na + i]!;
}

/**
 * The intruder's exposure: meter levels per sample, by cell then sample (rate[c·samples + k]),
 * so a search reads one cell's whole cycle in a run. `only` limits it to some guards (the
 * target's own view is kept apart, for after he's dead).
 */
export interface Field {
  samples: number;
  cells: number;
  rate: Uint8Array;
}

/**
 * Sweeps every guard's view at every sample, by lab D's sight law (sight.ts). Each sweep fans
 * rays across the guard's cones, spaced to land a cell apart at each zone's reach, and
 * marches them a cell at a time: the steepest top so far is the horizon, and a slab the line
 * would pass through blocks it. A cell takes the fastest rate any ray gives it, from the
 * share of the intruder's head and chest in view, once per guard; the contact zone round
 * each guard is stamped apart, in every direction. Rates add over guards.
 */
export function exposureField(R: Raster, T: Timeline, gen: GenTuning, only?: (guard: number) => boolean): Field {
  const S = gen.sight;
  const A = gen.analysis;
  const cells = R.na * R.nb;
  const K = T.samples;
  const rate = new Uint8Array(K * cells);
  const sum = new Float32Array(cells);
  const touched: number[] = [];
  const best = new Float32Array(cells);
  const seen: number[] = [];
  const perLevel = A.meterLevels * T.dt;
  const coreReach = reachOf(S.intruder.core, S);
  const sideReach = reachOf(S.intruder.peripheral, S);
  const farReach = reachOf(S.intruder.far, S);
  const coreBand = (S.cone.core + S.cone.edge / 2) * DEG;
  const sideBand = (S.cone.peripheral + S.cone.edge / 2) * DEG;
  const farBand = (S.cone.far + S.cone.edge / 2) * DEG;
  // Each zone's rate at each whole step along a ray (rays march a cell a step), before its cone.
  const steps = Math.ceil(farReach / R.cell) + 2;
  const byStep = (range: number): Float32Array => {
    const g = new Float32Array(steps);
    for (let s = 0; s < steps; s++) g[s] = rangeRamp(s * R.cell, range, S) / fillSeconds(s * R.cell, range, S);
    return g;
  };
  const gCore = byStep(S.intruder.core);
  const gSide = byStep(S.intruder.peripheral);
  const gFar = byStep(S.intruder.far);
  const view = new ViewMarcher(R, S.crouchHead, S.crouchChest);
  /** Takes one ray's visible cells into this guard's view, with its cones' factors at its angle off his gaze. */
  const take = (cs: Int32Array, halves: Uint8Array, dists: Float32Array, from: number, to: number, cCore: number, cSide: number, cFar: number, reach: number) => {
    for (let e = from; e < to; e++) {
      const d = dists[e]!;
      if (d > reach) break;
      const s = Math.round(d / R.cell);
      let r = cCore * gCore[s]!;
      const side = cSide * gSide[s]!;
      if (side > r) r = side;
      if (cFar > 0) {
        const f = cFar * gFar[s]!;
        if (f > r) r = f;
      }
      r *= halves[e]! * 0.5;
      if (r > S.cap) r = S.cap;
      if (r <= 0) continue;
      const c = cs[e]!;
      if (best[c] === 0) seen.push(c);
      if (r > best[c]!) best[c] = r;
    }
  };
  /** A ray off his gaze by `off` radians, marched now. */
  const ray = (ea: number, eb: number, eye: number, gaze: number, off: number, far: boolean) => {
    const deg = Math.abs(off) / DEG;
    const cCore = coneRamp(deg, S.cone.core, S.cone.edge);
    const cSide = coneRamp(deg, S.cone.peripheral, S.cone.edge);
    const cFar = far ? coneRamp(deg, S.cone.far, S.cone.edge) : 0;
    const reach = cFar > 0 ? farReach : cCore > 0 ? coreReach : sideReach;
    const n = view.march(ea, eb, eye, dcos(gaze + off), dsin(gaze + off), reach);
    take(view.rayCells, view.rayHalves, view.rayDists, 0, n, cCore, cSide, cFar, reach);
  };
  const contactReach = S.contact.range + S.contact.ramp;
  /** The contact zone round a guard: every walkable cell near enough, by a clear line to the intruder's head or chest. */
  const contact = (g: GuardTrack, k: number, ea: number, eb: number) => {
    const i0 = Math.max(0, Math.floor((ea - contactReach - R.a0) / R.cell));
    const i1 = Math.min(R.na - 1, Math.floor((ea + contactReach - R.a0) / R.cell));
    const j0 = Math.max(0, Math.floor((eb - contactReach - R.b0) / R.cell));
    const j1 = Math.min(R.nb - 1, Math.floor((eb + contactReach - R.b0) / R.cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * R.na + i;
        if (!R.walk[c]) continue;
        const ca = R.a0 + (i + 0.5) * R.cell - ea;
        const cb = R.b0 + (j + 0.5) * R.cell - eb;
        const d = Math.sqrt(ca * ca + cb * cb);
        if (d >= contactReach) continue;
        const x = R.ox + R.ux * (R.a0 + (i + 0.5) * R.cell) + R.vx * (R.b0 + (j + 0.5) * R.cell);
        const z = R.oz + R.uz * (R.a0 + (i + 0.5) * R.cell) + R.vz * (R.b0 + (j + 0.5) * R.cell);
        const gr = R.ground[c]!;
        let share = 0;
        if (lineOfSight(R, g.x[k]!, g.eye[k]!, g.z[k]!, x, gr + S.crouchHead, z)) share += 0.5;
        if (lineOfSight(R, g.x[k]!, g.eye[k]!, g.z[k]!, x, gr + S.crouchChest, z)) share += 0.5;
        const r = contactRate(d, share, S);
        if (r <= 0) continue;
        if (best[c] === 0) seen.push(c);
        if (r > best[c]!) best[c] = r;
      }
    }
  };
  // A guard who holds still sees the same all round: his view is marched once per stay.
  const STAY = 4;
  const stays = T.guards.map((g) => {
    const run = new Int32Array(K);
    const length = new Int32Array(K);
    let id = 0;
    for (let k = 1; k < K; k++) {
      if (g.x[k] !== g.x[k - 1] || g.z[k] !== g.z[k - 1] || g.eye[k] !== g.eye[k - 1]) id++;
      run[k] = id;
    }
    const counts = new Int32Array(id + 1);
    for (let k = 0; k < K; k++) counts[run[k]!] = counts[run[k]!]! + 1;
    for (let k = 0; k < K; k++) length[k] = counts[run[k]!]!;
    return { run, length, cached: -1, table: null as AllRound | null };
  });
  const ring = Math.ceil((2 * Math.PI * coreReach) / R.cell);
  const step = (2 * Math.PI) / ring;
  const coreRays = Math.ceil((2 * coreBand * coreReach) / R.cell);
  const sideRays = Math.ceil(((sideBand - coreBand) * sideReach) / R.cell);
  const farRays = Math.ceil((2 * farBand * farReach) / R.cell);
  for (let k = 0; k < K; k++) {
    for (let gi = 0; gi < T.guards.length; gi++) {
      if (only && !only(gi)) continue;
      const g = T.guards[gi]!;
      const eye = g.eye[k]!;
      const ea = (g.x[k]! - R.ox) * R.ux + (g.z[k]! - R.oz) * R.uz;
      const eb = (g.x[k]! - R.ox) * R.vx + (g.z[k]! - R.oz) * R.vz;
      const gaze = datan2(g.gb[k]!, g.ga[k]!);
      const stay = stays[gi]!;
      if (stay.length[k]! >= STAY) {
        if (stay.cached !== stay.run[k]) {
          stay.table = view.allRound(ea, eb, eye, ring, coreReach);
          stay.cached = stay.run[k]!;
        }
        const t = stay.table!;
        // The rays of the ring within his cones, either side of where he looks.
        const r0 = Math.ceil((gaze - sideBand) / step);
        const r1 = Math.floor((gaze + sideBand) / step);
        for (let r = r0; r <= r1; r++) {
          const ri = ((r % ring) + ring) % ring;
          const deg = Math.abs(r * step - gaze) / DEG;
          const cCore = coneRamp(deg, S.cone.core, S.cone.edge);
          const cSide = coneRamp(deg, S.cone.peripheral, S.cone.edge);
          take(t.cells, t.halves, t.dists, t.start[ri]!, t.start[ri + 1]!, cCore, cSide, 0, cCore > 0 ? coreReach : sideReach);
        }
      } else {
        // On the move: march his cones afresh, the core's rays a cell apart at its reach, the sides' at theirs.
        for (let r = 0; r <= coreRays; r++) ray(ea, eb, eye, gaze, -coreBand + (2 * coreBand * r) / coreRays, false);
        for (let r = 1; r <= sideRays; r++) {
          const off = coreBand + ((sideBand - coreBand) * r) / sideRays;
          ray(ea, eb, eye, gaze, off, false);
          ray(ea, eb, eye, gaze, -off, false);
        }
      }
      // A marksman's binoculars: a narrow cone, far out, marched every sample.
      if (g.far) for (let r = 0; r <= farRays; r++) ray(ea, eb, eye, gaze, -farBand + (2 * farBand * r) / farRays, true);
      contact(g, k, ea, eb);
      // This guard's view, once per cell: levels per sample.
      for (const c of seen) {
        if (sum[c] === 0) touched.push(c);
        sum[c] = sum[c]! + best[c]! * perLevel;
        best[c] = 0;
      }
      seen.length = 0;
    }
    for (const c of touched) {
      rate[c * K + k] = Math.min(255, Math.ceil(sum[c]! - 1e-9));
      sum[c] = 0;
    }
    touched.length = 0;
  }
  return { samples: K, cells, rate };
}

/** A view all round from one eye: each ray's visible cells, nearest first. */
interface AllRound {
  start: Int32Array;
  cells: Int32Array;
  halves: Uint8Array;
  dists: Float32Array;
}

/**
 * Marches rays through the raster from an eye, keeping the steepest top as the horizon
 * and every slab the line would pass through, and records the cells where a crouched
 * intruder's head and chest (each a half of him) show above it. A ray stops once its
 * horizon is steeper than anything further out could show above.
 */
class ViewMarcher {
  readonly rayCells = new Int32Array(1024);
  readonly rayHalves = new Uint8Array(1024);
  readonly rayDists = new Float32Array(1024);
  private readonly slabD = new Float32Array(1024);
  private readonly slabLo = new Float32Array(1024);
  private readonly slabHi = new Float32Array(1024);
  private readonly groundMax: number;

  constructor(
    private readonly R: Raster,
    private readonly head: number,
    private readonly chest: number,
  ) {
    let m = -Infinity;
    for (let c = 0; c < R.ground.length; c++) m = Math.max(m, R.ground[c]!);
    this.groundMax = m;
  }

  /** One ray; returns how many cells it recorded in rayCells, rayHalves and rayDists. */
  march(ea: number, eb: number, eye: number, ca: number, cb: number, range: number): number {
    const { na, nb, cell, a0, b0, walk, ground, top, lo, hi } = this.R;
    const reachUp = this.groundMax + this.head - eye;
    let horizon = -Infinity;
    let slabs = 0;
    let last = -1;
    let n = 0;
    for (let s = 1; s * cell <= range; s++) {
      const d = s * cell;
      const i = Math.floor((ea + ca * d - a0) / cell);
      const j = Math.floor((eb + cb * d - b0) / cell);
      if (i < 0 || j < 0 || i >= na || j >= nb) break;
      if (horizon > (reachUp > 0 ? reachUp / d : 0)) break;
      const c = j * na + i;
      if (c === last) continue;
      last = c;
      if (walk[c]) {
        const gr = ground[c]!;
        let v = 0;
        const sh = (gr + this.head - eye) / d;
        if (sh >= horizon && this.clear(eye, sh, slabs)) v++;
        const sc = (gr + this.chest - eye) / d;
        if (sc >= horizon && this.clear(eye, sc, slabs)) v++;
        if (v > 0 && n < 1024) {
          this.rayCells[n] = c;
          this.rayHalves[n] = v;
          this.rayDists[n] = d;
          n++;
        }
      }
      const t = (top[c]! - eye) / d;
      if (t > horizon) horizon = t;
      if (lo[c]! <= hi[c]! && slabs < 1024) {
        this.slabD[slabs] = d;
        this.slabLo[slabs] = lo[c]!;
        this.slabHi[slabs] = hi[c]!;
        slabs++;
      }
    }
    return n;
  }

  /** Every ray of a ring of `ring` rays round the eye, out to `range`. */
  allRound(ea: number, eb: number, eye: number, ring: number, range: number): AllRound {
    const start = new Int32Array(ring + 1);
    const cells: number[] = [];
    const halves: number[] = [];
    const dists: number[] = [];
    const step = (2 * Math.PI) / ring;
    for (let r = 0; r < ring; r++) {
      start[r] = cells.length;
      const n = this.march(ea, eb, eye, dcos(r * step), dsin(r * step), range);
      for (let e = 0; e < n; e++) {
        cells.push(this.rayCells[e]!);
        halves.push(this.rayHalves[e]!);
        dists.push(this.rayDists[e]!);
      }
    }
    start[ring] = cells.length;
    return { start, cells: Int32Array.from(cells), halves: Uint8Array.from(halves), dists: Float32Array.from(dists) };
  }

  private clear(eye: number, slope: number, slabs: number): boolean {
    for (let q = 0; q < slabs; q++) {
      const y = eye + slope * this.slabD[q]!;
      if (y >= this.slabLo[q]! && y <= this.slabHi[q]!) return false;
    }
    return true;
  }
}

/**
 * Witness edges (the sightline graph's raw material): at each sample, whether guard a would
 * see guard b drop, by the witness ranges and a line from a's eye to b's chest. Stored as
 * one byte per sample and ordered pair.
 */
export interface Witnesses {
  guards: number;
  samples: number;
  /** edge[(k·guards + a)·guards + b]: a sees b at sample k. */
  edge: Uint8Array;
}

export function witnessEdges(R: Raster, T: Timeline, gen: GenTuning): Witnesses {
  const n = T.guards.length;
  const edge = new Uint8Array(T.samples * n * n);
  for (let k = 0; k < T.samples; k++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) if (a !== b && seesDrop(R, T.guards[a]!, T.guards[b]!, k, gen)) edge[(k * n + a) * n + b] = 1;
    }
  }
  return { guards: n, samples: T.samples, edge };
}

/** The share of the cycle each ordered pair's edge holds: duty[a·guards + b]. */
export function witnessDuty(W: Witnesses): Float32Array {
  const n = W.guards;
  const duty = new Float32Array(n * n);
  for (let k = 0; k < W.samples; k++) for (let p = 0; p < n * n; p++) duty[p] = duty[p]! + W.edge[k * n * n + p]!;
  for (let p = 0; p < n * n; p++) duty[p] = duty[p]! / W.samples;
  return duty;
}

/**
 * Coverage and idleness, per cell (D7's heatmaps): the share of the cycle some guard sees
 * the cell, and the longest stretch, round the cycle's end, that none does, in seconds.
 */
export function heatmaps(F: Field, dt: number): { coverage: Float32Array; idleness: Float32Array } {
  const coverage = new Float32Array(F.cells);
  const idleness = new Float32Array(F.cells);
  for (let c = 0; c < F.cells; c++) {
    let seen = 0;
    let run = 0;
    let best = 0;
    let leading = -1;
    const base = c * F.samples;
    for (let k = 0; k < F.samples; k++) {
      if (F.rate[base + k]! > 0) {
        seen++;
        if (leading < 0) leading = run;
        run = 0;
      } else {
        run++;
        if (run > best) best = run;
      }
    }
    // A quiet stretch can run over the end of the cycle into its start.
    if (leading >= 0) best = Math.max(best, run + leading);
    else best = F.samples;
    coverage[c] = seen / F.samples;
    idleness[c] = best * dt;
  }
  return { coverage, idleness };
}
