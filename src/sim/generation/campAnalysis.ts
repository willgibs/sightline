import type { GenTuning } from '../../config/tuning';
import type { ColliderSet } from '../kernel/world/colliders';
import type { SpatialGrid } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Camp } from './camp';
import { sightlines, takeApart, type Cluster, type PerchSight, type Sightlines } from './clusters';
import { buildTimeline, exposureField, heatmaps, witnessDuty, witnessEdges, type Field, type Timeline, type Witnesses } from './field';
import { infiltrate, rimCells, type Exposure, type Infiltration, type Meter, type Search, type Space } from './infiltrate';
import type { Point2 } from './paths';
import { findPerches, perchSeesDeck, perchViewshed, type PerchSpot } from './perches';
import { buildRaster, cellOf, centreOf, clearShot, frameOf, type Raster } from './raster';

/**
 * Lab D's analysis of a generated camp (D7): who sees whom over its cycle, what each perch
 * sees, where an intruder can go unseen, and the clusters a plan must take apart.
 * Validation (D8) reads it; the seed explorer draws it. Everything is computed over one
 * cycle of the camp, which its routines all divide (staffing.ts), so it holds for the whole
 * mission. Every search is budgeted by iterations (rule 18) and reports its work.
 *
 * The parts: the analysis raster (raster.ts), the timeline, exposure field and witness
 * edges (field.ts), the perches and their viewsheds (perches.ts), clusters and their
 * certification (clusters.ts), and infiltration (infiltrate.ts).
 */
export interface CampAnalysis {
  cycle: number;
  dt: number;
  samples: number;
  /** The raster's frame and size, so its heatmaps can be drawn. */
  frame: { ox: number; oz: number; ux: number; uz: number; vx: number; vz: number; a0: number; b0: number; cell: number; na: number; nb: number };
  /** Per raster cell: the share of the cycle some guard watches it, and its longest quiet stretch, seconds. */
  coverage: Float32Array;
  idleness: Float32Array;
  perches: PerchReport[];
  /** Witness edges' duty: duty[a·guards + b], the share of the cycle guard a would see guard b drop. */
  duty: number[];
  /** The sightline graph's clusters, certified, in the order to take them apart (watchers first). */
  clusters: Cluster[];
  /** From outside to a close shot at the target, unseen; to the generator; and from the shot back out. */
  infiltration: PathReport;
  sabotage: PathReport;
  exfil: PathReport;
  /** A second way out, leaving the raster at least `exitApart` from the first. */
  exfil2: PathReport;
  /** An unseen way to his escape vehicle, to sabotage it. */
  vehicle: PathReport;
}

export interface PerchReport {
  x: number;
  y: number;
  z: number;
  dist: number;
  heightAbovePad: number;
  /** The share of the cycle each guard (camp.guards order) is in this perch's view. */
  guards: number[];
  /** Their mean: the perch's coverage of the camp, counted by time in view (pinned before D8). */
  coverage: number;
  /** The share of the cycle the target is in view. */
  target: number;
  /** Alarm boxes in its line of fire, and whether the radio's antenna is. */
  alarms: number;
  antenna: boolean;
  /** Seconds of the target's run from his door to his vehicle in its view: what it would have to shoot him in. */
  run: number;
  /** The share of the camp's ground (inside the fence, at chest height) in its view: what makes an overview. */
  ground: number;
}

export interface PathReport {
  found: boolean;
  /** Seconds: when it arrives (on the camp's clock), and when it set out. */
  arrive: number;
  start: number;
  /** The way, as world points (every cell's middle). */
  path: Point2[];
  /** The highest the intruder's meter rose, as a share of full. */
  peak: number;
  expanded: number;
  exhausted: boolean;
}

/** What the analysis keeps for the searches that come after it: validation's and the plans'. */
export interface AnalysisParts {
  raster: Raster;
  /** What actually stops sight and bullets, for the checks the raster's resolution can't answer. */
  colliders: ColliderSet;
  timeline: Timeline;
  field: Field;
  witnesses: Witnesses;
  perches: PerchSpot[];
  sight: PerchSight;
  lines: Sightlines;
}

/** `search` answers the ways in and out: safe intervals by default; the bench also runs the plain space-time search, to show the gain. */
export function analyzeCamp(
  camp: Camp,
  hf: Heightfield,
  colliders: ColliderSet,
  grid: SpatialGrid,
  gen: GenTuning,
  raster?: Raster,
  search: (S: Space, E: Exposure, M: Meter, Q: Search) => Infiltration = infiltrate,
): { analysis: CampAnalysis; parts: AnalysisParts } {
  const A = gen.analysis;
  const R = raster ?? buildRaster(camp, hf, colliders, grid.site, A.cell, A.margin);
  const T = buildTimeline(camp, R, gen);
  const target = camp.objective?.target ?? -1;
  // Everyone's view but the target's (for the way out, once he's dead), and with his.
  const F = exposureField(R, T, gen, (g) => g !== target);
  const all: Field = target >= 0 ? withView(F, exposureField(R, T, gen, (g) => g === target)) : F;
  const { coverage, idleness } = heatmaps(all, T.dt);
  const W = witnessEdges(R, T, gen);
  const duty = witnessDuty(W);

  // --- Perches: what each sees of the guards, the target, the alarms and the escape. ---
  const spots = findPerches(hf, camp.site, gen, grid.map);
  const n = T.guards.length;
  const K = T.samples;
  const seen = new Uint8Array(spots.length * n * K);
  const distance = new Float32Array(spots.length * spots.length);
  const alarmBoxes = (camp.devices ?? []).filter((d) => d.kind === 'alarm');
  const mast = camp.structures.find((s) => s.kind === 'mast');
  const mastTop = mast ? colliders.list[mast.colliders[0]!]! : null;
  const esc = camp.layout?.skeleton.escape ?? [];
  const runLen = esc.length >= 3 ? Math.sqrt((esc[2]!.x - esc[1]!.x) * (esc[2]!.x - esc[1]!.x) + (esc[2]!.z - esc[1]!.z) * (esc[2]!.z - esc[1]!.z)) : 0;
  const runPts = esc.length >= 3 ? sampleRoute([esc[1]!, esc[2]!], 1).filter((p) => cellOf(R, p.x, p.z) >= 0) : [];
  const halfA = (camp.layout?.halfA ?? 0) - 1;
  const halfB = (camp.layout?.halfB ?? 0) - 1;
  const inside: number[] = [];
  for (let c = 0; c < R.na * R.nb; c++) {
    if (!R.walk[c]) continue;
    const i = c % R.na;
    const j = (c - i) / R.na;
    const a = R.a0 + (i + 0.5) * R.cell;
    const b = R.b0 + (j + 0.5) * R.cell;
    if (Math.abs(a) <= halfA && Math.abs(b) <= halfB) inside.push(c);
  }
  const perches: PerchReport[] = spots.map((spot, p) => {
    const view = perchViewshed(R, hf, spot);
    const share: number[] = [];
    for (let g = 0; g < n; g++) {
      const t = T.guards[g]!;
      let count = 0;
      if (t.onDeck) {
        // He holds one spot all cycle, under an open-sided roof: one line says it.
        if (perchSeesDeck(R, hf, spot, t.x[0]!, t.chest[0]!, t.z[0]!)) {
          count = K;
          seen.fill(1, (p * n + g) * K, (p * n + g) * K + K);
        }
      } else {
        for (let k = 0; k < K; k++) {
          const c = cellOf(R, t.x[k]!, t.z[k]!);
          if (c >= 0 && t.chest[k]! >= view[c]!) {
            seen[(p * n + g) * K + k] = 1;
            count++;
          }
        }
      }
      share.push(count / K);
    }
    const visibleAt = (x: number, y: number, z: number): boolean => {
      const c = cellOf(R, x, z);
      return c >= 0 && y >= view[c]!;
    };
    return {
      x: spot.x,
      y: spot.y,
      z: spot.z,
      dist: spot.dist,
      heightAbovePad: spot.heightAbovePad,
      guards: share,
      coverage: n > 0 ? share.reduce((a, b) => a + b, 0) / n : 0,
      target: target >= 0 ? share[target]! : 0,
      alarms: alarmBoxes.filter((d) => visibleAt(d.x, d.y, d.z)).length,
      antenna: mastTop ? visibleAt(mastTop.x, mastTop.y1, mastTop.z) : false,
      run: runPts.length > 0 ? ((runPts.filter((q) => visibleAt(q.x, hf.heightAt(q.x, q.z) + gen.sight.chest, q.z)).length / runPts.length) * runLen) / gen.validation.runSpeed : 0,
      ground: inside.length > 0 ? inside.filter((c) => R.ground[c]! + gen.sight.chest >= view[c]!).length / inside.length : 0,
    };
  });
  for (let p = 0; p < spots.length; p++) {
    for (let q = 0; q < spots.length; q++) {
      const dx = spots[p]!.x - spots[q]!.x;
      const dz = spots[p]!.z - spots[q]!.z;
      distance[p * spots.length + q] = Math.sqrt(dx * dx + dz * dz);
    }
  }
  const sight: PerchSight = { perches: spots.length, guards: n, samples: K, seen, distance };
  const lines = sightlines(W, sight);
  const certified = takeApart(W, duty, lines, gen);

  // --- Infiltration: to the target, to the generator, and back out. -------------------
  // The ways in keep a margin: lab A's law isn't quite D's (a patrol's gaze, how fast a meter falls), so a certified way never fills the meter past `meterLimit`.
  const meter = { levels: Math.round(A.meterLevels * A.meterLimit), decay: Math.max(1, Math.round(A.meterDecay * A.meterLevels * A.dt)), still: gen.sight.still };
  const horizon = 2 * K;
  /** Is there a way? Validation asks only that, so a greedy search goes first; if it runs out of budget, the exact one. */
  const find = (E: Exposure, Q: Search): Infiltration => {
    const greedy = search(R, E, meter, { ...Q, weight: A.searchWeight });
    return greedy.found || !greedy.exhausted ? greedy : search(R, E, meter, Q);
  };
  /** Walkable cells whose middles lie within `radius` of any of the points. */
  const near = (points: Array<{ x: number; z: number }>, radius: number): number[] => {
    const set = new Set<number>();
    const done = new Set<string>();
    for (const p of points) {
      const at = `${p.x},${p.z}`;
      if (done.has(at)) continue; // a guard standing still is one point for many samples
      done.add(at);
      const f = frameOf(R, p.x, p.z);
      const i0 = Math.max(0, Math.floor((f.a - radius - R.a0) / R.cell));
      const i1 = Math.min(R.na - 1, Math.floor((f.a + radius - R.a0) / R.cell));
      const j0 = Math.max(0, Math.floor((f.b - radius - R.b0) / R.cell));
      const j1 = Math.min(R.nb - 1, Math.floor((f.b + radius - R.b0) / R.cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * R.na + i;
          if (!R.walk[c] || set.has(c)) continue;
          const m = centreOf(R, c);
          if ((m.x - p.x) * (m.x - p.x) + (m.z - p.z) * (m.z - p.z) <= radius * radius) set.add(c);
        }
      }
    }
    return [...set].sort((a, b) => a - b); // unique: cell indices
  };
  const report = (r: Infiltration): PathReport => ({
    found: r.found,
    arrive: r.time * T.dt,
    start: r.start * T.dt,
    path: r.cells.map((c) => {
      const m = centreOf(R, c);
      return { x: m.x, z: m.z };
    }),
    peak: r.peak / A.meterLevels,
    expanded: r.expanded,
    exhausted: r.exhausted,
  });
  let infiltration: Infiltration = { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded: 0, exhausted: false };
  if (target >= 0) {
    // The way to a close shot: near enough to see him indoors, with a clear line to his
    // chest, and no nearer than his contact zone.
    const t = T.guards[target]!;
    const close = A.closeShot;
    const touch = gen.sight.contact.range + gen.sight.contact.ramp;
    const goalCells = near(Array.from({ length: K }, (_, k) => ({ x: t.x[k]!, z: t.z[k]! })), close);
    const goal = (c: number, time: number): boolean => {
      const k = time % K;
      const m = centreOf(R, c);
      const d2 = (m.x - t.x[k]!) * (m.x - t.x[k]!) + (m.z - t.z[k]!) * (m.z - t.z[k]!);
      if (d2 > close * close || d2 < touch * touch) return false;
      return clearShot(R, colliders, m.x, m.y + gen.sight.crouchHead, m.z, t.x[k]!, t.chest[k]!, t.z[k]!);
    };
    infiltration = find(all, { goal, goalCells, horizon, maxExpansions: A.maxExpansions });
  }
  const gen0 = (camp.devices ?? []).find((d) => d.kind === 'generator');
  let sabotage: Infiltration = { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded: 0, exhausted: false };
  if (gen0) {
    const goalCells = near([gen0], 2.2);
    const set = new Set(goalCells);
    sabotage = find(all, { goal: (c) => set.has(c), goalCells, horizon, maxExpansions: A.maxExpansions });
  }
  // A way to the escape vehicle, to sabotage it: the other way to stop his escape.
  const jeep = (camp.vehicles ?? []).find((v) => v.escape);
  let vehicle: Infiltration = { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded: 0, exhausted: false };
  if (jeep) {
    const goalCells = near([jeep], 3.5);
    const set = new Set(goalCells);
    if (goalCells.length > 0) vehicle = find(all, { goal: (c) => set.has(c), goalCells, horizon, maxExpansions: A.maxExpansions });
  }
  // The ways out, from the shot: to the rim, then to the rim again at least `exitApart` from
  // where the first left it, so one guarded side never traps him.
  let exfil: Infiltration = { found: false, time: -1, cells: [], start: -1, peak: 0, meter: 0, expanded: 0, exhausted: false };
  let second: Infiltration = { ...exfil };
  if (infiltration.found) {
    // From the shot, with his meter at rest: by the time he leaves it has fallen, or the camp knows anyway.
    const from = { cell: infiltration.cells[infiltration.cells.length - 1]!, time: infiltration.time, meter: 0 };
    const out = (rim: number[]): Infiltration => {
      const set = new Set(rim);
      return find(F, { from, goal: (c) => set.has(c), goalCells: rim, horizon: infiltration.time + horizon, maxExpansions: A.maxExpansions });
    };
    const rim = rimCells(R);
    exfil = out(rim);
    if (exfil.found) {
      const exit = centreOf(R, exfil.cells[exfil.cells.length - 1]!);
      const apart = rim.filter((c) => {
        const m = centreOf(R, c);
        return (m.x - exit.x) * (m.x - exit.x) + (m.z - exit.z) * (m.z - exit.z) >= A.exitApart * A.exitApart;
      });
      second = out(apart);
    }
  }

  const analysis: CampAnalysis = {
    cycle: T.cycle,
    dt: T.dt,
    samples: K,
    frame: { ox: R.ox, oz: R.oz, ux: R.ux, uz: R.uz, vx: R.vx, vz: R.vz, a0: R.a0, b0: R.b0, cell: R.cell, na: R.na, nb: R.nb },
    coverage,
    idleness,
    perches,
    duty: [...duty],
    clusters: certified,
    infiltration: report(infiltration),
    sabotage: report(sabotage),
    exfil: report(exfil),
    exfil2: report(second),
    vehicle: report(vehicle),
  };
  return { analysis, parts: { raster: R, timeline: T, field: F, witnesses: W, perches: spots, sight, lines, colliders } };
}

/** Two guards' views together: levels add, up to the most a sample holds. */
function withView(F: Field, own: Field): Field {
  const rate = new Uint8Array(F.rate.length);
  for (let k = 0; k < rate.length; k++) {
    const r = F.rate[k]! + own.rate[k]!;
    rate[k] = r > 255 ? 255 : r;
  }
  return { samples: F.samples, cells: F.cells, rate };
}

/** Points every `step` metres along a route. */
function sampleRoute(route: readonly Point2[], step: number): Point2[] {
  const out: Point2[] = [];
  for (let k = 0; k + 1 < route.length; k++) {
    const a = route[k]!;
    const b = route[k + 1]!;
    const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
    const parts = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < parts; s++) out.push({ x: a.x + ((b.x - a.x) * s) / parts, z: a.z + ((b.z - a.z) * s) / parts });
  }
  return out;
}
