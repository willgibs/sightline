import type { Tuning } from '../../config/tuning';
import { analyzeCamp, buildRaster, campMission, campPlans, generateWorld, pointAt, type CampAnalysis, type Plan } from '../../sim/generation';
import type { World } from '../../sim/kernel/world/world';
import type { Arm, Experiment, Measure } from '../experiment';

/**
 * Expressive-range analysis of the camps (Smith and Whitehead, 2010): generate many, measure
 * a handful of things that bear on how a mission plays, and see how widely they spread and
 * where they clump. Everything is measured from the camp's own site, so it asks the same
 * question wherever a camp stands (rule 15).
 *
 * The bench reports one number per measure, so a distribution is laid out as bands: each
 * band is a measure, and a camp either falls in it or doesn't. A row of a table is then a
 * histogram, and a clump is a band holding nearly every camp.
 *
 * An instrument: it reads worlds and never changes them, so ordinary floating point is fine.
 */

export interface Descriptors {
  /** The pad, against the mean ground in the ring 120–320 m out: negative is a camp in a hole. */
  prominence: number;
  /** The skyline seen from the camp, degrees above level: its mean round the horizon, and how uneven it is. */
  skyline: number;
  skylineSpread: number;
  /** Share of bearings where the ground 60–200 m out falls at least 5 m below the pad. */
  fallsAway: number;
  /** Share of bearings where a crest at least 25 m above the pad stands within 300 m. */
  walled: number;
  /** Metres from the fence to the nearest water. */
  water: number;
  perchNear: number;
  perchMedian: number;
  perchHeight: number;
  /** Degrees a perch looks down into the camp (median over perches). */
  perchAngle: number;
  /** Share of the perches on the gate's side of the camp. */
  perchFront: number;
  /** The share of the camp's ground the best perch sees, and the median perch. */
  groundBest: number;
  groundMedian: number;
  /** Share of perches that have the target in view 10 s a cycle or more. */
  targetShare: number;
  area: number;
  aspect: number;
  /** Share of the fenced ground under a roof. */
  builtUp: number;
  /** Degrees between the gate's axis and where the road is 200 m out. */
  roadOff: number;
  /** Share of the road's first 400 m a prone shooter on the best overview can see. */
  roadSeen: number;
  /** The farthest the target goes from the middle of his building, and his seconds out of doors a cycle. */
  targetWalk: number;
  targetOut: number;
  /** The nearest perch that has him 10 s a cycle, and the longest unbroken view of him any perch gets. */
  targetRange: number;
  targetWindow: number;
  /** The longest of those views with nobody who'd see him drop, seconds. */
  targetClean: number;
  /** Plan risks (0 to 1): the long-range bot's, the way-in bot's. */
  riskLong: number;
  riskIn: number;
  /** Which approach is the bots' best. */
  bestLong: number;
  /** The kinds of good plan the camp offers, as bits: 1 a shot on the target, 2 a way in, 4 the generator first, 8 his vehicle. */
  goodPlans: number;
}

const percentile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const medianOf = (xs: readonly number[]): number => (xs.length === 0 ? NaN : percentile([...xs].sort((a, b) => a - b), 0.5));
const DEGREES = 180 / Math.PI;

/** A way in, or to something, that a careful person could walk: found, and not a close call. */
const CLOSE_CALL = 0.6;

/** A camp's descriptors. The analysis's working isn't kept in the world, so it's run again here. */
export function describe(world: World, tuning: Tuning): Descriptors {
  const G = tuning.gen;
  const hf = world.terrain;
  const camp = world.camp;
  const site = camp.site;
  const layout = camp.layout!;
  const analysis: CampAnalysis = world.report.camp!;
  const raster = buildRaster(camp, hf, world.colliders, world.grid.site, G.analysis.cell, G.analysis.margin);
  const { parts } = analyzeCamp(camp, hf, world.colliders, world.grid, G, raster);
  const eye = site.height + 1.6;

  // --- The ground round the site. ------------------------------------------------------
  const BEARINGS = 180;
  const skylines: number[] = [];
  let drops = 0;
  let walls = 0;
  let ring = 0;
  let ringN = 0;
  for (let k = 0; k < BEARINGS; k++) {
    const angle = (k * 2 * Math.PI) / BEARINGS;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let sky = -Math.PI / 2;
    let lowest = Infinity;
    let high = -Infinity;
    for (let r = 20; r <= 560; r += 5) {
      const x = site.x + dx * r;
      const z = site.z + dz * r;
      if (Math.abs(x) > world.playHalf || Math.abs(z) > world.playHalf) break;
      const h = hf.heightAt(x, z);
      sky = Math.max(sky, Math.atan2(h - eye, r));
      if (r >= 60 && r <= 200) lowest = Math.min(lowest, h);
      if (r <= 300) high = Math.max(high, h);
      if (r >= 120 && r <= 320) {
        ring += h;
        ringN++;
      }
    }
    skylines.push(sky * DEGREES);
    if (lowest <= site.height - 5) drops++;
    if (high >= site.height + 25) walls++;
  }
  const skyMean = skylines.reduce((a, b) => a + b, 0) / BEARINGS;
  const skyVar = skylines.reduce((a, b) => a + (b - skyMean) * (b - skyMean), 0) / BEARINGS;
  let water = Infinity;
  for (const p of world.features.creek.points) {
    const dx = p.x - site.x;
    const dz = p.z - site.z;
    const a = Math.max(0, Math.abs(dx * layout.ux + dz * layout.uz) - layout.halfA);
    const b = Math.max(0, Math.abs(dx * layout.vx + dz * layout.vz) - layout.halfB);
    water = Math.min(water, Math.sqrt(a * a + b * b));
  }

  // --- The perches, and what each sees. -------------------------------------------------
  const P = analysis.perches;
  const dists = P.map((p) => p.dist).sort((a, b) => a - b);
  const angleOf = (dist: number, height: number): number => Math.atan2(height + G.sight.proneEye - 1.6, dist) * DEGREES;
  const front = P.filter((p) => (p.x - site.x) * layout.ux + (p.z - site.z) * layout.uz > 0).length;
  const best = P.reduce<(typeof P)[number] | null>((m, p) => (!m || p.ground > m.ground ? p : m), null);
  const onTarget = P.filter((p) => p.target * analysis.cycle >= G.validation.targetSeconds);
  const nearest = onTarget.reduce<(typeof P)[number] | null>((m, p) => (!m || p.dist < m.dist ? p : m), null);

  // --- The road. -------------------------------------------------------------------------
  const road = world.features.road;
  const at200 = pointAt(road, Math.min(road.total, 200));
  const offRoad = Math.atan2((at200.x - site.x) * layout.vx + (at200.z - site.z) * layout.vz, (at200.x - site.x) * layout.ux + (at200.z - site.z) * layout.uz);
  let seenRoad = 0;
  let road400 = 0;
  for (let s = 0; s < Math.min(400, road.total); s += 10) {
    road400++;
    if (!best) continue;
    const p = pointAt(road, s);
    const dx = p.x - best.x;
    const dz = p.z - best.z;
    const ey = best.y + G.sight.proneEye;
    const ty = hf.heightAt(p.x, p.z) + 1.2;
    const d = Math.sqrt(dx * dx + (ty - ey) * (ty - ey) + dz * dz);
    if (hf.raycast(best.x, ey, best.z, dx / d, (ty - ey) / d, dz / d, d - 0.5) >= d - 0.5) seenRoad++;
  }

  // --- The target's day. -----------------------------------------------------------------
  const target = camp.objective!.target;
  const T = parts.timeline.guards[target]!;
  const K = parts.timeline.samples;
  const dt = parts.timeline.dt;
  const hq = layout.buildings[camp.objective!.building]!;
  let walk = 0;
  let out = 0;
  for (let k = 0; k < K; k++) {
    const dx = T.x[k]! - hq.x;
    const dz = T.z[k]! - hq.z;
    walk = Math.max(walk, Math.sqrt(dx * dx + dz * dz));
    if (Math.abs(dx * hq.ux + dz * hq.uz) > hq.length / 2 || Math.abs(-dx * hq.uz + dz * hq.ux) > hq.depth / 2) out++;
  }
  const n = camp.guards.length;
  const { sight, lines } = parts;
  const longest = (test: (k: number) => boolean): number => {
    let run = 0;
    let top = 0;
    for (let k = 0; k < 2 * K; k++) {
      if (test(k % K)) top = Math.max(top, Math.min(K, ++run));
      else run = 0;
    }
    return top * dt;
  };
  const inView = (p: number, k: number): boolean => sight.seen[(p * n + target) * K + k] === 1;
  const unwatched = (k: number): boolean => (lines.masks[target * K + k]! & ~(1 << target)) === 0;
  let window = 0;
  let clean = 0;
  P.forEach((_, p) => {
    window = Math.max(window, longest((k) => inView(p, k)));
    clean = Math.max(clean, longest((k) => inView(p, k) && unwatched(k)));
  });

  // --- The plans. ------------------------------------------------------------------------
  const { plans, best: bestPlan } = campPlans(camp, analysis, parts, G);
  const riskOf = (a: Plan['approach']): number => plans.find((p) => p.approach === a)!.risk;
  const walkable = (p: { found: boolean; peak: number }): boolean => p.found && p.peak <= CLOSE_CALL;
  const goodPlans = (clean >= 3 ? 1 : 0) + (walkable(analysis.infiltration) ? 2 : 0) + (walkable(analysis.sabotage) ? 4 : 0) + (walkable(analysis.vehicle) ? 8 : 0);

  return {
    prominence: site.height - ring / ringN,
    skyline: skyMean,
    skylineSpread: Math.sqrt(skyVar),
    fallsAway: drops / BEARINGS,
    walled: walls / BEARINGS,
    water,
    perchNear: dists[0] ?? NaN,
    perchMedian: medianOf(dists),
    perchHeight: medianOf(P.map((p) => p.heightAbovePad)),
    perchAngle: medianOf(P.map((p) => angleOf(p.dist, p.heightAbovePad))),
    perchFront: P.length > 0 ? front / P.length : NaN,
    groundBest: Math.max(0, ...P.map((p) => p.ground)),
    groundMedian: medianOf(P.map((p) => p.ground)),
    targetShare: P.length > 0 ? onTarget.length / P.length : NaN,
    area: 4 * layout.halfA * layout.halfB,
    aspect: Math.max(layout.halfA, layout.halfB) / Math.min(layout.halfA, layout.halfB),
    builtUp: layout.buildings.reduce((sum, b) => sum + b.length * b.depth, 0) / (4 * layout.halfA * layout.halfB),
    roadOff: Math.abs(offRoad) * DEGREES,
    roadSeen: road400 > 0 ? seenRoad / road400 : NaN,
    targetWalk: walk,
    targetOut: out * dt,
    targetRange: nearest ? nearest.dist : NaN,
    targetWindow: window,
    targetClean: clean,
    riskLong: riskOf('long range'),
    riskIn: riskOf('infiltration'),
    bestLong: bestPlan.approach === 'long range' ? 1 : 0,
    goodPlans,
  };
}

/** A column of a table: a camp is in this band of a descriptor, or it isn't. */
interface Band {
  label: string;
  has(d: Descriptors): boolean;
}

/** The bands between successive edges of a descriptor: the first open below, the last above. */
function bands(of: keyof Descriptors, unit: string, edges: readonly number[], scale = 1): Band[] {
  const show = (x: number): string => `${Math.round(x * scale)}`;
  const out: Band[] = [{ label: `<${show(edges[0]!)}${unit}`, has: (d) => d[of] < edges[0]! }];
  for (let k = 0; k + 1 < edges.length; k++) out.push({ label: `${show(edges[k]!)}–${show(edges[k + 1]!)}${unit}`, has: (d) => d[of] >= edges[k]! && d[of] < edges[k + 1]! });
  out.push({ label: `${show(edges[edges.length - 1]!)}+${unit}`, has: (d) => d[of] >= edges[edges.length - 1]! });
  return out;
}

const SERIES = 'lab-world-variety';
const CAMPS = 120;

/** One table: bands of a few descriptors, run on the same camps. */
function table(name: string, about: string, columns: ReadonlyArray<readonly [string, Band[]]>, arms: readonly Arm[] = [{ name: 'as built' }]): Experiment {
  const all = columns.flatMap(([title, list]) => list.map((b, k) => ({ key: `${title}:${k}`, label: k === 0 ? `${title} ${b.label}` : b.label, band: b })));
  return {
    name,
    about,
    series: SERIES,
    camps: CAMPS,
    arms,
    measures: all.map((c): Measure => ({ key: c.key, label: c.label, kind: 'rate' })),
    run(seed, _arm, tuning) {
      const d = describe(generateWorld(campMission(seed), tuning), tuning);
      return Object.fromEntries(all.map((c) => [c.key, c.band.has(d) ? 1 : 0]));
    },
  };
}

export const varietyGround = table('variety-ground', 'how the ground stands round the camp', [
  ['pad against ring', bands('prominence', 'm', [-2, 8, 20])],
  ['skyline', bands('skyline', '°', [4, 8])],
  ['falls away', bands('fallsAway', '%', [0.01, 0.5], 100)],
  ['walled', bands('walled', '%', [0.1, 0.3], 100)],
  ['to water', bands('water', 'm', [40, 80])],
]);

export const varietyPerches = table('variety-perches', 'where the shooting positions are, and how they look into the camp', [
  ['nearest', bands('perchNear', 'm', [180, 260, 340])],
  ['look down', bands('perchAngle', '°', [4, 7, 10])],
  ['height', bands('perchHeight', 'm', [20, 40])],
  ['gate side', bands('perchFront', '%', [0.1, 0.4], 100)],
]);

export const varietyViews = table('variety-views', 'how much of the camp the perches see', [
  ['median perch', bands('groundMedian', '%', [0.4, 0.65], 100)],
  ['best perch', bands('groundBest', '%', [0.6, 0.8], 100)],
  ['have target', bands('targetShare', '%', [0.25, 0.5, 0.8], 100)],
  ['road seen', bands('roadSeen', '%', [0.5, 0.9], 100)],
]);

export const varietyCompound = table('variety-compound', 'the compound, and how the road meets it', [
  ['area', bands('area', 'm²', [7500, 9500])],
  ['aspect', bands('aspect', '', [1.2, 1.6], 10)],
  ['built up', bands('builtUp', '%', [0.06, 0.1], 100)],
  ['road off axis', bands('roadOff', '°', [15, 45])],
]);

export const varietyTarget = table('variety-target', "the target's day: where he goes, and what can be seen of him", [
  ['walks', bands('targetWalk', 'm', [15, 35])],
  ['outdoors', bands('targetOut', 's', [20, 50])],
  ['nearest perch', bands('targetRange', 'm', [220, 320])],
  ['longest view', bands('targetWindow', 's', [15, 40])],
  ['unwatched', bands('targetClean', 's', [3, 10])],
]);

/** A kind of good plan a camp can offer, in words. */
const PLAN_BITS: ReadonlyArray<readonly [number, string]> = [
  [1, 'shot'],
  [2, 'way in'],
  [4, 'power'],
  [8, 'his ride'],
];
const planBand = (bits: number): Band => ({
  label: PLAN_BITS.filter(([b]) => bits & b).map(([, w]) => w).join('+') || 'none',
  has: (d) => d.goodPlans === bits,
});
/** The sets of plans that occur, the commonest first in practice. */
const PLAN_SETS = [1, 3, 5, 7, 9, 11, 13, 15, 2, 6, 10, 14, 0];

export const varietyPlans = table('variety-plans', 'which approaches are good, and which is best', [
  ['best', [{ label: 'long range', has: (d) => d.bestLong === 1 }, { label: 'way in', has: (d) => d.bestLong === 0 }]],
  ['way-in risk', bands('riskIn', '', [0.3, 0.6], 10)],
  ['long risk', bands('riskLong', '', [0.3, 0.45], 10)],
  ['good plans', PLAN_SETS.map(planBand)],
]);

export const VARIETY = [varietyGround, varietyPerches, varietyViews, varietyCompound, varietyTarget, varietyPlans];
