import type { Tuning } from '../../config/tuning';
import { analyzeCamp, buildRaster, campMission, campPlans, carefulWayIn, generateWorld, pointAt, SITE_KINDS, type CampAnalysis } from '../../sim/generation';
import { cellIndex } from '../../sim/kernel/world/grid';
import { GridSearch } from '../../sim/kernel/world/search';
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
 * histogram, and a clump is a band holding nearly every camp. The arms: the generator as it
 * is, and with every kind of variety switched off, which is the generator these were first
 * measured on, but for the perch list keeping to ground a body can walk to.
 *
 * Layout descriptors can call two camps different when both are solved the same way
 * (Beukman et al. 2022), so `variety-families` scores families of plan against each camp and
 * reports which is best, and what it costs to hold to any one of them regardless.
 *
 * An instrument: it reads worlds and never changes them, so ordinary floating point is fine.
 */

export interface Descriptors {
  /** The pad, against the mean ground in the ring 120–320 m out: negative is a camp in a hole. */
  prominence: number;
  /** The skyline seen from the camp, degrees above level: its mean round the horizon. */
  skyline: number;
  /** Share of bearings where the ground 60–200 m out falls at least 5 m below the pad. */
  fallsAway: number;
  /** Share of bearings where a crest at least 25 m above the pad stands within 300 m. */
  walled: number;
  /** Metres from the fence to the nearest water. */
  water: number;
  /** Share of the ring 100–300 m out that no tower's deck can see a crouched body in, terrain alone: ground the camp can't watch. */
  deadGround: number;
  perchNear: number;
  perchHeight: number;
  /** Degrees a perch looks down into the camp (median over perches). */
  perchAngle: number;
  /** Share of the perches on the gate's side of the camp. */
  perchFront: number;
  /** Metres on foot from the end of the road to the nearest perch that has the target 10 s a cycle. */
  perchWalk: number;
  /** The share of the camp's ground the best perch sees, and the median perch. */
  groundBest: number;
  groundMedian: number;
  /** Share of perches that have the target in view 10 s a cycle or more. */
  targetShare: number;
  area: number;
  aspect: number;
  /** Share of the fenced ground a standing man can't see over. */
  blocked: number;
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
  /** Risks (0 to 1, 1 if it can't be done), by family of plan. */
  risks: Readonly<Record<Family, number>>;
  /** The way in's risk by the path the analysis first found: often a close call when a careful one exists. */
  riskFirstIn: number;
  /** Whether the best shot at the target comes from the high ground. */
  shotHigh: number;
  /** The camp's kind of site, its plan's plot and perimeter, and its crux. */
  kind: string;
  plot: string;
  perimeter: string;
  fill: string;
  crux: string;
}

/**
 * The families of plan a player can make a habit of. `shot` is the one the reviewers wrote for
 * 29 of 30 camps: the target, from a perch, while nobody is watching him. `flush` is making
 * him run and having him on the run: the alarm, then a perch that sees his door and his vehicle.
 * `take apart` is the long-range bot's, a perch's guards one by one; `way in` is the walk to a
 * close shot.
 */
export const FAMILIES = ['shot', 'flush', 'take apart', 'way in'] as const;
export type Family = (typeof FAMILIES)[number];

/** A perch looking down this far or more is the high ground. */
const HIGH_DEGREES = 5;
/** Plans.ts's own figures for a clean shot: nobody ever sees him, or a window when nobody does; and for one somebody sees. */
const ISOLATED = 0.2;
const WINDOW = 0.35;
const WITNESSED = 0.7;
/** Lab D's figure for a shot on the run in a camp already alarmed: the highest of its other shot risks. */
const ON_THE_RUN = 0.6;
/** Stopping his vehicle unseen first, then having him stranded: a way in by another name, with a shot to find after it. */
const SABOTAGE_FIRST = 0.25;
/** What the way back out of the camp adds to a close shot's risk, per whole meter its certified way out fills. */
const OUT_AGAIN = 0.2;
/** A clean moment shorter than this can't be used, seconds. */
const LONG_ENOUGH = 1.5;
/** The way in, done as carefully as can be certified: the lowest of these shares of the meter it can be done under. */
const CAREFUL_LIMITS = [0.35, 0.5, 0.65];

const percentile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const medianOf = (xs: readonly number[]): number => (xs.length === 0 ? NaN : percentile([...xs].sort((a, b) => a - b), 0.5));
const DEGREES = 180 / Math.PI;

/** A camp's descriptors. The analysis's working isn't kept in the world, so it's run again here. */
export function describe(world: World, tuning: Tuning): Descriptors {
  const G = tuning.gen;
  const hf = world.terrain;
  const camp = world.camp;
  const site = camp.site;
  const layout = camp.layout!;
  const analysis: CampAnalysis = world.report.camp!;
  const raster = buildRaster(camp, hf, world.colliders, world.grid.site, G, world.props.trees);
  const { parts } = analyzeCamp(camp, hf, world.colliders, world.grid, G, raster);
  const eye = site.height + 1.6;

  // --- The ground round the site. ------------------------------------------------------
  const BEARINGS = 180;
  let skySum = 0;
  let drops = 0;
  let walls = 0;
  let ring = 0;
  let ringN = 0;
  let dead = 0;
  let deadN = 0;
  const towers = layout.towers.map((t) => ({ x: t.x, y: t.deck + G.sight.eye, z: t.z }));
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
      if (r >= 100 && r <= 300 && r % 10 === 0) {
        deadN++;
        const ty = h + G.sight.crouchHead;
        const seen = towers.some((t) => {
          const tx = x - t.x;
          const ty2 = ty - t.y;
          const tz = z - t.z;
          const d = Math.sqrt(tx * tx + ty2 * ty2 + tz * tz);
          return hf.raycast(t.x, t.y, t.z, tx / d, ty2 / d, tz / d, d - 0.5) >= d - 0.5;
        });
        if (!seen) dead++;
      }
    }
    skySum += sky * DEGREES;
    if (lowest <= site.height - 5) drops++;
    if (high >= site.height + 25) walls++;
  }
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

  // Walking to them: from the end of the road, the way a mission comes in.
  const L = world.grid.map;
  const search = new GridSearch(L);
  const road = world.features.road;
  const inside = road.points.filter((q) => Math.max(Math.abs(q.x), Math.abs(q.z)) < world.playHalf - 4);
  const end = inside[inside.length - 1] ?? road.points[road.points.length - 1]!;
  const cost = (_f: number, _to: number, l: number): number => l;
  search.flood([cellIndex(L, end.x, end.z)], { maxExpansions: L.nx * L.nz, cost });
  let perchWalk = Infinity;
  for (const p of onTarget) {
    const c = cellIndex(L, p.x, p.z);
    if (c >= 0 && search.cost[c]! >= 0) perchWalk = Math.min(perchWalk, search.cost[c]! / 100);
  }

  // --- The road. -------------------------------------------------------------------------
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

  // --- The fenced ground. ----------------------------------------------------------------
  let fenced = 0;
  let cannotSeeOver = 0;
  for (let c = 0; c < raster.na * raster.nb; c++) {
    const i = c % raster.na;
    const j = (c - i) / raster.na;
    const a = raster.a0 + (i + 0.5) * raster.cell;
    const b = raster.b0 + (j + 0.5) * raster.cell;
    if (Math.abs(a) > layout.halfA || Math.abs(b) > layout.halfB) continue;
    fenced++;
    if (raster.top[c]! >= raster.ground[c]! + 1.7 || raster.lo[c]! <= raster.hi[c]!) cannotSeeOver++;
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
  let shotRisk = 1;
  let shotAngle = 0;
  P.forEach((perch, p) => {
    const seenFor = longest((k) => inView(p, k));
    const cleanFor = longest((k) => inView(p, k) && unwatched(k));
    window = Math.max(window, seenFor);
    clean = Math.max(clean, cleanFor);
    let watched = false;
    for (let k = 0; k < K && !watched; k++) watched = inView(p, k) && !unwatched(k);
    const risk = seenFor < LONG_ENOUGH ? 1 : Math.min(0.99, cleanFor >= LONG_ENOUGH ? (watched ? WINDOW : ISOLATED) + perch.dist / 2000 : WITNESSED + perch.dist / 2000);
    if (risk < shotRisk) {
      shotRisk = risk;
      shotAngle = angleOf(perch.dist, perch.heightAbovePad);
    }
  });

  // --- The other plans, the bots'. -------------------------------------------------------
  const { plans } = campPlans(camp, analysis, parts, G);
  const lr = plans.find((p) => p.approach === 'long range')!;
  const inf = plans.find((p) => p.approach === 'infiltration')!;
  const careful = carefulWayIn(camp, parts, G, CAREFUL_LIMITS);
  // Flushing him: raise the alarm and have him on his run from a perch, or stop his vehicle first and have him stranded.
  let flushRisk = analysis.vehicle.found ? Math.min(0.99, SABOTAGE_FIRST + 0.7 * analysis.vehicle.peak) : 1;
  for (const p of P) if (p.run >= G.validation.interceptSeconds) flushRisk = Math.min(flushRisk, Math.min(0.99, ON_THE_RUN + p.dist / 2000));

  return {
    prominence: site.height - ring / ringN,
    skyline: skySum / BEARINGS,
    fallsAway: drops / BEARINGS,
    walled: walls / BEARINGS,
    water,
    deadGround: deadN > 0 ? dead / deadN : NaN,
    perchNear: dists[0] ?? NaN,
    perchHeight: medianOf(P.map((p) => p.heightAbovePad)),
    perchAngle: medianOf(P.map((p) => angleOf(p.dist, p.heightAbovePad))),
    perchFront: P.length > 0 ? front / P.length : NaN,
    perchWalk: Number.isFinite(perchWalk) ? perchWalk : NaN,
    groundBest: Math.max(0, ...P.map((p) => p.ground)),
    groundMedian: medianOf(P.map((p) => p.ground)),
    targetShare: P.length > 0 ? onTarget.length / P.length : NaN,
    area: 4 * layout.halfA * layout.halfB,
    aspect: Math.max(layout.halfA, layout.halfB) / Math.min(layout.halfA, layout.halfB),
    blocked: fenced > 0 ? cannotSeeOver / fenced : NaN,
    roadOff: Math.abs(offRoad) * DEGREES,
    roadSeen: road400 > 0 ? seenRoad / road400 : NaN,
    targetWalk: walk,
    targetOut: out * dt,
    targetRange: nearest ? nearest.dist : NaN,
    targetWindow: window,
    targetClean: clean,
    risks: {
      shot: shotRisk,
      flush: flushRisk,
      'take apart': lr.seconds < Infinity ? lr.risk : 1,
      // A way in is only half the plan: the close shot then has to get out of the camp again.
      'way in': careful !== null ? 0.15 + 0.7 * careful + OUT_AGAIN * (analysis.exfil.found ? analysis.exfil.peak : 1) : inf.seconds < Infinity ? Math.min(0.99, inf.risk + OUT_AGAIN * (analysis.exfil.found ? analysis.exfil.peak : 1)) : 1,
    },
    riskFirstIn: inf.seconds < Infinity ? inf.risk : 1,
    shotHigh: shotAngle >= HIGH_DEGREES ? 1 : 0,
    kind: world.features.kind ?? 'none',
    plot: layout.plan.plot,
    perimeter: layout.plan.perimeter,
    fill: layout.plan.fill,
    crux: camp.crux ?? 'none',
  };
}

/** The family a camp's plan-bots score best, first in FAMILIES order on a tie. */
export function bestFamily(d: Descriptors): Family {
  let top: Family = FAMILIES[0]!;
  for (const f of FAMILIES) if (d.risks[f] < d.risks[top]) top = f;
  return top;
}

/** Holding to family f on this camp: how much worse than the camp's own best, in risk. */
export function regretOf(d: Descriptors, f: Family): number {
  return d.risks[f] - d.risks[bestFamily(d)];
}

/** The generator with every kind of variety switched off: what the descriptors were first measured on. */
export function plainTuning(t: Tuning): Tuning {
  const out = structuredClone(t);
  const L = out.gen.landform;
  for (const k of Object.keys(L.sites) as Array<keyof typeof L.sites>) L.sites[k] = 0;
  L.sites.hollow = 1;
  const C = out.gen.compound;
  C.plots = { yard: 1, long: 0, wide: 0, tight: 0 };
  C.perimeters = { chain: 1, screen: 0, fort: 0 };
  C.fills = { open: 1, packed: 0 };
  L.roads = { straight: 1, dogleg: 0 };
  out.gen.crux.kinds = { walk: 1, inside: 0, flush: 0, escort: 0 };
  return out;
}

/** The generator with its cruxes switched off: new ground and plans, and every camp the old promise. */
function withoutCruxes(t: Tuning): Tuning {
  const out = structuredClone(t);
  out.gen.crux.kinds = { walk: 1, inside: 0, flush: 0, escort: 0 };
  return out;
}

const AS_BUILT: Arm = { name: 'as built' };
const PLAIN: Arm = { name: 'plain' };
/** The new ground and plans, with every camp still promising the target to the ridges: what variety of layout does on its own. */
const NO_CRUX: Arm = { name: 'layout only' };
const ARMS = [PLAIN, AS_BUILT];

/** The camps of the arm: the generator as it is, with its cruxes switched off, or with every kind of variety switched off. */
function camp(seed: string, arm: Arm, tuning: Tuning): { world: World; t: Tuning } {
  const t = arm.name === PLAIN.name ? plainTuning(tuning) : arm.name === NO_CRUX.name ? withoutCruxes(tuning) : tuning;
  return { world: generateWorld(campMission(seed), t), t };
}

/** A column of a table: a camp is in this band of a descriptor, or it isn't. */
interface Band {
  label: string;
  has(d: Descriptors): boolean;
}

type Numeric = { [K in keyof Descriptors]: Descriptors[K] extends number ? K : never }[keyof Descriptors];

/** The bands between successive edges of a descriptor: the first open below, the last above. */
function bands(of: Numeric, unit: string, edges: readonly number[], scale = 1, digits = 0): Band[] {
  const show = (x: number): string => (x * scale).toFixed(digits);
  const out: Band[] = [{ label: `<${show(edges[0]!)}${unit}`, has: (d) => d[of] < edges[0]! }];
  for (let k = 0; k + 1 < edges.length; k++) out.push({ label: `${show(edges[k]!)}–${show(edges[k + 1]!)}${unit}`, has: (d) => d[of] >= edges[k]! && d[of] < edges[k + 1]! });
  out.push({ label: `${show(edges[edges.length - 1]!)}+${unit}`, has: (d) => d[of] >= edges[edges.length - 1]! });
  return out;
}

/** The bands of a categorical descriptor: one per value. */
function kinds(of: 'kind' | 'plot' | 'perimeter' | 'fill' | 'crux', values: readonly string[]): Band[] {
  return values.map((v) => ({ label: v, has: (d) => d[of] === v }));
}

const SERIES = 'lab-world-variety';
const CAMPS = 100;

/** One table: bands of a few descriptors, run on the same camps. */
function table(name: string, about: string, columns: ReadonlyArray<readonly [string, Band[]]>, arms: readonly Arm[] = ARMS): Experiment {
  const all = columns.flatMap(([title, list]) => list.map((b, k) => ({ key: `${title}:${k}`, label: k === 0 ? `${title} ${b.label}` : b.label, band: b })));
  return {
    name,
    about,
    series: SERIES,
    camps: CAMPS,
    arms,
    measures: all.map((c): Measure => ({ key: c.key, label: c.label, kind: 'rate' })),
    run(seed, arm, tuning) {
      const { world, t } = camp(seed, arm, tuning);
      const d = describe(world, t);
      return Object.fromEntries(all.map((c) => [c.key, c.band.has(d) ? 1 : 0]));
    },
  };
}

export const varietyGround = table('variety-ground', 'how the ground stands round the camp', [
  ['site', kinds('kind', SITE_KINDS)],
  ['pad against ring', bands('prominence', 'm', [-2, 8, 20])],
  ['skyline', bands('skyline', '°', [2, 4, 8])],
  ['falls away', bands('fallsAway', '%', [0.01, 0.5], 100)],
  ['walled', bands('walled', '%', [0.1, 0.3], 100)],
  ['to water', bands('water', 'm', [40, 80])],
  ['dead ground', bands('deadGround', '%', [0.1, 0.3, 0.6], 100)],
]);

export const varietyPerches = table('variety-perches', 'where the shooting positions are, and how they look into the camp', [
  ['nearest', bands('perchNear', 'm', [180, 260, 340])],
  ['look down', bands('perchAngle', '°', [4, 7, 10])],
  ['height', bands('perchHeight', 'm', [20, 40])],
  ['gate side', bands('perchFront', '%', [0.1, 0.4], 100)],
  ['walk to one', bands('perchWalk', 'm', [400, 700, 1000])],
]);

export const varietyViews = table('variety-views', 'how much of the camp the perches see', [
  ['median perch', bands('groundMedian', '%', [0.4, 0.65], 100)],
  ['best perch', bands('groundBest', '%', [0.6, 0.8], 100)],
  ['have target', bands('targetShare', '%', [0.25, 0.5, 0.8], 100)],
  ['road seen', bands('roadSeen', '%', [0.5, 0.9], 100)],
]);

export const varietyCompound = table('variety-compound', 'the compound, and how the road meets it', [
  ['area', bands('area', 'm²', [7500, 9500])],
  ['aspect', bands('aspect', '', [1.2, 1.6], 1, 1)],
  ['blocked', bands('blocked', '%', [0.08, 0.15], 100)],
  ['road off axis', bands('roadOff', '°', [15, 45])],
  ['plot', kinds('plot', ['yard', 'long', 'wide', 'tight'])],
  ['perimeter', kinds('perimeter', ['chain', 'screen', 'fort'])],
  ['yard', kinds('fill', ['open', 'packed'])],
]);

export const varietyTarget = table('variety-target', "the target's day: where he goes, and what can be seen of him", [
  ['walks', bands('targetWalk', 'm', [15, 35])],
  ['outdoors', bands('targetOut', 's', [20, 50])],
  ['nearest perch', bands('targetRange', 'm', [220, 320])],
  ['longest view', bands('targetWindow', 's', [15, 40])],
  ['unwatched', bands('targetClean', 's', [3, 10])],
  ['crux', kinds('crux', ['walk', 'inside', 'flush', 'escort'])],
]);

/** Which family of plan is best on each camp, and what holding to each regardless costs. */
export const varietyFamilies: Experiment = {
  name: 'variety-families',
  about: 'which family of plan is best on a camp, and how much worse it is to hold to one regardless',
  series: SERIES,
  camps: CAMPS,
  arms: [PLAIN, NO_CRUX, AS_BUILT],
  measures: [
    ...FAMILIES.map((f): Measure => ({ key: `best ${f}`, label: `best: ${f}`, kind: 'rate' })),
    ...FAMILIES.map((f): Measure => ({ key: `regret ${f}`, label: `regret: ${f}`, kind: 'mean' })),
    { key: 'answers', label: 'within 0.1 of best', kind: 'mean' },
    // How much the answer leans on how the way in is scored: with the path first found, not a careful one.
    { key: 'shot possible', label: 'a shot at all', kind: 'rate' },
    { key: 'shot first', label: 'shot best, first-found way in', kind: 'rate' },
    { key: 'shot high', label: 'best shot from high ground', kind: 'rate' },
  ],
  run(seed, arm, tuning) {
    const { world, t } = camp(seed, arm, tuning);
    const d = describe(world, t);
    const best = bestFamily(d);
    const out: Record<string, number> = {};
    for (const f of FAMILIES) {
      out[`best ${f}`] = f === best ? 1 : 0;
      out[`regret ${f}`] = regretOf(d, f);
    }
    out.answers = FAMILIES.filter((f) => d.risks[f] <= d.risks[best] + 0.1).length;
    out['shot possible'] = d.risks.shot < 0.99 ? 1 : 0;
    out['shot first'] = d.risks.shot <= Math.min(d.risks.flush, d.risks['take apart'], d.riskFirstIn) ? 1 : 0;
    out['shot high'] = d.shotHigh;
    return out;
  },
};

/** The same, crux by crux: a camp is one cell of this table, its crux and the family that's best on it. */
export const varietyCruxes = table(
  'variety-cruxes',
  'which family of plan is best on a camp, crux by crux',
  (['inside', 'flush', 'escort'] as const).map((crux): readonly [string, Band[]] => [crux, FAMILIES.map((f) => ({ label: f, has: (d) => d.crux === crux && bestFamily(d) === f }))]),
  [AS_BUILT],
);

export const VARIETY = [varietyGround, varietyPerches, varietyViews, varietyCompound, varietyTarget, varietyFamilies, varietyCruxes];
