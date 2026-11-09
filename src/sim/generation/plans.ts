import type { GenTuning } from '../../config/tuning';
import type { Camp } from './camp';
import type { AnalysisParts, CampAnalysis, PathReport } from './campAnalysis';
import { certify, nextSightings, type PerchSight, type Sightlines } from './clusters';
import { infiltrate, rimCells, type Exposure, type Meter } from './infiltrate';
import { cellOf, centreOf, clearShot, lineOfSight, type Raster } from './raster';

/**
 * Restricted-play bots (lab D's exit test): for each approach alone (long range, infiltration,
 * systems), the best plan the camp's analysis can certify, summarized as a signature in a
 * closed vocabulary (docs/research/foundations.md): the opening perch or approach, the first
 * target, how the first cluster is split, and the tool. Their signatures, clustered over many
 * camps, show the camps ask for different plans before any reviewer looks. A plan can also be
 * asked of another camp (`planOn`), which is the regret matrix: a camp's best plan should do
 * clearly worse elsewhere.
 *
 * The bots stand in for players only as far as D's own model does: they read the routines
 * and the sightlines, and take the certified answers as given. Nothing here fires a shot.
 */
export const SECTORS = ['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'] as const;
export type Sector = (typeof SECTORS)[number];
export type Approach = 'long range' | 'infiltration' | 'systems';
export type Split = 'isolated' | 'window' | 'chain' | 'distraction' | 'out of sight' | 'unseen' | 'timed' | 'close call' | 'power cut' | 'none';
export type Tool = 'rifle any time' | 'rifle window' | 'rifle brief' | 'close shot walking in' | 'close shot waiting' | 'sabotage walking in' | 'sabotage waiting';

export interface PlanSignature {
  /**
   * Where it opens. A perch: its bearing from the camp, in the camp's own frame (the gate is
   * the front), and whether it's near (under 340 m, say) or far. A way in: which opening in
   * the fence it goes through (the breach, the gate), then the side it comes from.
   */
  opening: string;
  /** The first target and where he stands, role@sector (for the ways in, the guard first passed): 'generator', 'none'. */
  first: string;
  split: Split;
  /** What does it and how it's timed: for a shot, how much of the cycle its first target can be dropped unseen; for a way in, whether it has to wait for a gap. */
  tool: Tool;
}

const NEAR = 340;
const SPLIT_RISK: Record<string, number> = { isolated: 0.2, ['window']: 0.35, chain: 0.6, distraction: 0.7 };

/** Which opening in the fence a way in goes through: the one its path comes nearest. */
function openingOf(camp: Camp, path: ReadonlyArray<{ x: number; z: number }>): string {
  const L = camp.layout!;
  let best = 'wire';
  let bestD = Infinity;
  for (const o of L.openings) {
    const x = camp.site.x + L.ux * o.a + L.vx * o.b;
    const z = camp.site.z + L.uz * o.a + L.vz * o.b;
    for (const p of path) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) {
        bestD = d;
        best = o.kind;
      }
    }
  }
  return bestD < 64 ? best : 'wire';
}

export interface Plan {
  approach: Approach;
  signature: PlanSignature;
  /** Seconds into the camp's cycle at which it reaches the target (or the generator), or Infinity if it doesn't. */
  seconds: number;
  /** Guards it takes (long range), or 0. */
  guards: number;
  /** How risky, from 0 (nothing can go wrong) to 1 (it can't be done): what makes it a camp's best plan. */
  risk: number;
  /** In a sentence, for the report. */
  detail: string;
}

/** How many of the signature's four fields two plans share: three or more is the same plan (foundations.md). */
export function sharedFields(a: PlanSignature, b: PlanSignature): number {
  return (a.opening === b.opening ? 1 : 0) + (a.first === b.first ? 1 : 0) + (a.split === b.split ? 1 : 0) + (a.tool === b.tool ? 1 : 0);
}

export function sameSignature(a: PlanSignature, b: PlanSignature): boolean {
  return sharedFields(a, b) >= 3;
}

/** The sector of a point round the camp, in the camp's frame. */
export function sectorOf(camp: Camp, x: number, z: number): Sector {
  const L = camp.layout!;
  const dx = x - camp.site.x;
  const dz = z - camp.site.z;
  const a = dx * L.ux + dz * L.uz;
  const b = dx * L.vx + dz * L.vz;
  // Eight sectors by the sign and the larger of |a| and |b|, without trigonometry.
  const ra = Math.abs(a);
  const rb = Math.abs(b);
  const diagonal = rb > ra * 0.414 && ra > rb * 0.414;
  if (diagonal) return a >= 0 ? (b >= 0 ? 'front-right' : 'front-left') : b >= 0 ? 'back-right' : 'back-left';
  if (ra >= rb) return a >= 0 ? 'front' : 'back';
  return b >= 0 ? 'right' : 'left';
}

/** The long-range bot's plan: the perch alone that can take the most, and what it takes first. */
/** What one perch alone can do: the guards it can take, its opener (the first kill of most value), and when the target falls. */
function fromPerch(i: number, camp: Camp, a: CampAnalysis, parts: AnalysisParts, gen: GenTuning): { taken: number; first: { guard: number; sample: number } | null; split: Split; targetAt: number } {
  const { witnesses: W, sight: P, lines } = parts;
  const K = W.samples;
  const n = W.guards;
  const target = camp.objective?.target ?? -1;
  const one: PerchSight = { perches: 1, guards: n, samples: K, seen: P.seen.subarray(i * n * K, (i + 1) * n * K), distance: new Float32Array(1) };
  const S: Sightlines = { W, P: one, next: nextSightings(one), masks: lines.masks };
  let dead = 0;
  let taken = 0;
  let first: { guard: number; sample: number } | null = null;
  let split: Split = 'none';
  let targetAt = Infinity;
  let firstValue = -1;
  for (const c of a.clusters) {
    const r = certify(c.members, S, gen, dead);
    if (r.certified === 'unsolved' || r.certified === 'out of sight') continue;
    for (const k of r.kills) {
      dead |= 1 << k.guard;
      taken++;
      if (k.guard === target) targetAt = Math.min(targetAt, k.sample * a.dt);
    }
    // The opening a player would pick: of the first kills on offer, the guard who watches
    // the most others (a marksman counts double: he's the one who can answer back).
    const opener = r.kills[0];
    if (opener) {
      let value = camp.guards[opener.guard]!.role === 'marksman' ? 2 : 0;
      for (let v = 0; v < n; v++) if (v !== opener.guard && a.duty[opener.guard * n + v]! >= gen.analysis.clusterDuty) value++;
      if (value > firstValue) {
        firstValue = value;
        first = opener;
        split = r.certified;
      }
    }
  }
  return { taken, first, split, targetAt };
}

/** The long-range bot's plan: the perch alone that can take the most, and what it takes first. */
export function longRangePlan(camp: Camp, a: CampAnalysis, parts: AnalysisParts, gen: GenTuning): Plan {
  // Each perch alone, the most-watching first, within reason.
  const order = a.perches.map((p, i) => ({ i, coverage: p.coverage })).sort((x, y) => y.coverage - x.coverage || x.i - y.i); // unique: perch indices
  let best: { perch: number; taken: number; first: { guard: number; sample: number } | null; split: Split; targetAt: number } | null = null;
  for (const { i } of order.slice(0, gen.validation.botPerches)) {
    const r = fromPerch(i, camp, a, parts, gen);
    if (!best || r.taken > best.taken || (r.taken === best.taken && r.targetAt < best.targetAt)) best = { perch: i, ...r };
  }
  const b = best ?? { perch: 0, taken: 0, first: null, split: 'none' as Split, targetAt: Infinity };
  const p = a.perches[b.perch];
  // Riskier the harder the first cluster is to split, and the farther the shot; impossible if the target can't be reached.
  const risk = b.targetAt === Infinity ? 1 : Math.min(0.99, (SPLIT_RISK[b.split] ?? 0.8) + (p ? p.dist / 2000 : 0));
  return {
    approach: 'long range',
    signature: {
      opening: p ? `${sectorOf(camp, p.x, p.z)} ${p.dist < NEAR ? 'near' : 'far'}` : 'none',
      first: b.first ? guardAt(camp, parts, b.first.guard, b.first.sample) : 'none',
      split: b.split,
      tool: `rifle ${b.first ? cleanWindow(b.first.guard, b.perch, parts) : 'brief'}`,
    },
    seconds: b.targetAt,
    guards: b.taken,
    risk,
    detail: p ? `from a perch ${Math.round(p.dist)} m out, ${b.taken} guards${b.first ? `, opening on the ${camp.guards[b.first.guard]!.role} ${(b.first.sample * a.dt).toFixed(0)} s into the cycle` : ''}` : 'no perch',
  };
}

/** The way-in bot's plan: the certified path to a close shot at the target. */
export function infiltrationPlan(camp: Camp, a: CampAnalysis, parts: AnalysisParts): Plan {
  const path = a.infiltration;
  return {
    approach: 'infiltration',
    signature: {
      opening: path.found ? `${openingOf(camp, path.path)} ${sectorOf(camp, path.path[0]!.x, path.path[0]!.z)}` : 'none',
      first: path.found ? firstPassed(camp, a, parts, path.path, path.start) : 'none',
      split: path.found ? (path.peak === 0 ? 'unseen' : path.peak >= 0.75 ? 'close call' : 'timed') : 'none',
      tool: `close shot ${waited(a, path)}`,
    },
    seconds: path.found ? path.arrive : Infinity,
    guards: 0,
    risk: path.found ? Math.min(0.99, 0.15 + 0.7 * path.peak) : 1,
    detail: path.found ? `in by the ${sectorOf(camp, path.path[0]!.x, path.path[0]!.z)}, there ${path.arrive.toFixed(0)} s into the cycle, its meter never past ${Math.round(path.peak * 100)}%` : 'no way in',
  };
}

/** The systems bot's plan: the certified path to the generator. */
export function systemsPlan(camp: Camp, a: CampAnalysis): Plan {
  const path = a.sabotage;
  return {
    approach: 'systems',
    signature: { opening: path.found ? `${openingOf(camp, path.path)} ${sectorOf(camp, path.path[0]!.x, path.path[0]!.z)}` : 'none', first: 'generator', split: path.found ? 'power cut' : 'none', tool: `sabotage ${waited(a, path)}` },
    seconds: path.found ? path.arrive : Infinity,
    guards: 0,
    risk: path.found ? Math.min(0.99, 0.15 + 0.7 * path.peak) : 1,
    detail: path.found ? `to the generator from the ${sectorOf(camp, path.path[0]!.x, path.path[0]!.z)}, ${path.arrive.toFixed(0)} s into the cycle` : 'no way to the generator',
  };
}

/** The role of the guard nearest the way in at the first moment its meter rises; 'none' if it never does. */
function firstPassed(camp: Camp, a: CampAnalysis, parts: AnalysisParts, path: ReadonlyArray<{ x: number; z: number }>, start: number): string {
  const T = parts.timeline;
  const R = parts.raster;
  const F = parts.field;
  const k0 = Math.round(start / a.dt);
  for (let q = 0; q < path.length; q++) {
    const c = cellOf(R, path[q]!.x, path[q]!.z);
    if (c < 0) continue;
    const k = (k0 + q) % T.samples;
    if (F.rate[c * T.samples + k]! === 0) continue;
    // Nearest guard with a clear line to him then: the one who saw him.
    let best = -1;
    let bestD = Infinity;
    T.guards.forEach((g, i) => {
      const m = centreOf(R, c);
      const d = (g.x[k]! - m.x) * (g.x[k]! - m.x) + (g.z[k]! - m.z) * (g.z[k]! - m.z);
      if (d < bestD && lineOfSight(R, g.x[k]!, g.eye[k]!, g.z[k]!, m.x, m.y + 1.05, m.z)) {
        best = i;
        bestD = d;
      }
    });
    if (best >= 0) return guardAt(camp, parts, best, k);
  }
  return 'none';
}

/** Whether a way in has to wait for a gap (more than a few seconds beyond its walking). */
function waited(a: CampAnalysis, path: PathReport): 'walking in' | 'waiting' {
  return path.found && path.arrive - path.start - path.path.length * a.dt > 5 ? 'waiting' : 'walking in';
}

/** How much of the cycle a perch can drop a guard with nobody seeing it: nearly any time, a window, or a brief one. */
function cleanWindow(guard: number, perch: number, parts: AnalysisParts): 'any time' | 'window' | 'brief' {
  const { sight: P, witnesses: W, lines } = parts;
  const K = W.samples;
  const n = W.guards;
  let clean = 0;
  for (let k = 0; k < K; k++) if (P.seen[(perch * n + guard) * K + k] && lines.masks[guard * K + k] === 0) clean++;
  const share = clean / K;
  return share >= 0.6 ? 'any time' : share >= 0.15 ? 'window' : 'brief';
}

/** A guard, by role and where he stands at a sample: the signature's first target. */
function guardAt(camp: Camp, parts: AnalysisParts, guard: number, sample: number): string {
  const g = parts.timeline.guards[guard]!;
  return `${camp.guards[guard]!.role}@${sectorOf(camp, g.x[sample % parts.timeline.samples]!, g.z[sample % parts.timeline.samples]!)}`;
}

/** A camp's three bots, and the best: the least risky way to the target (long range or infiltration; systems only prepares). */
export function campPlans(camp: Camp, a: CampAnalysis, parts: AnalysisParts, gen: GenTuning): { plans: Plan[]; best: Plan } {
  const lr = longRangePlan(camp, a, parts, gen);
  const inf = infiltrationPlan(camp, a, parts);
  const sys = systemsPlan(camp, a);
  const reaching = [lr, inf].filter((p) => p.seconds < Infinity).sort((x, y) => x.risk - y.risk || (x.approach < y.approach ? -1 : 1)); // unique: the two approaches differ
  return { plans: [lr, inf, sys], best: reaching[0] ?? (lr.guards > 0 ? lr : inf) };
}

/**
 * What another camp makes of this plan: its signature asked of camp j, the risk of it there
 * (1 if the plan can't be carried out: no such perch or opening, or its first target isn't
 * there to take). A long-range plan opens from the perches in its sector and range band and
 * must open on a guard of its role; a way in may only enter by its side.
 */
export function planOn(sig: PlanSignature, camp: Camp, a: CampAnalysis, parts: AnalysisParts, gen: GenTuning): number {
  const target = camp.objective?.target ?? -1;
  if (sig.tool.startsWith('rifle')) {
    let best = 1;
    const [sector, band] = sig.opening.split(' ');
    a.perches.forEach((p, i) => {
      if (sectorOf(camp, p.x, p.z) !== sector || (p.dist < NEAR ? 'near' : 'far') !== band) return;
      const r = fromPerch(i, camp, a, parts, gen);
      if (r.targetAt === Infinity || !r.first || camp.guards[r.first.guard]!.role !== sig.first.split('@')[0]) return;
      best = Math.min(best, Math.min(0.99, (SPLIT_RISK[r.split] ?? 0.8) + p.dist / 2000));
    });
    return best;
  }
  // A way in by that side only.
  const R: Raster = parts.raster;
  const meter: Meter = { levels: Math.round(gen.analysis.meterLevels * gen.analysis.meterLimit), decay: Math.max(1, Math.round(gen.analysis.meterDecay * gen.analysis.meterLevels * gen.analysis.dt)), still: gen.sight.still };
  const side = sig.opening.split(' ')[1];
  const rim = rimCells(R).filter((c) => {
    const m = centreOf(R, c);
    return sectorOf(camp, m.x, m.z) === side;
  });
  if (rim.length === 0) return 1;
  const T = parts.timeline;
  const K = T.samples;
  const E: Exposure = parts.field;
  if (sig.tool.startsWith('sabotage')) {
    const gen0 = (camp.devices ?? []).find((d) => d.kind === 'generator');
    if (!gen0) return 1;
    const near: number[] = [];
    for (let c = 0; c < R.na * R.nb; c++) {
      if (!R.walk[c]) continue;
      const m = centreOf(R, c);
      if ((m.x - gen0.x) * (m.x - gen0.x) + (m.z - gen0.z) * (m.z - gen0.z) <= 2.2 * 2.2) near.push(c);
    }
    const set = new Set(near);
    return bySector(R, E, meter, rim, near, (c) => set.has(c), 2 * K, gen);
  }
  const { goal, goalCells } = closeShotGoal(target, parts, gen);
  return bySector(R, E, meter, rim, goalCells, goal, 2 * K, gen);
}

/** Where a way in ends: near enough for a close shot at the target, with a clear line to him and outside his contact zone. */
function closeShotGoal(target: number, parts: AnalysisParts, gen: GenTuning): { goal: (c: number, time: number) => boolean; goalCells: number[] } {
  const R = parts.raster;
  const T = parts.timeline;
  const K = T.samples;
  const t = T.guards[target]!;
  const close = gen.analysis.closeShot;
  const touch = gen.sight.contact.range + gen.sight.contact.ramp;
  const goalCells: number[] = [];
  for (let c = 0; c < R.na * R.nb; c++) {
    if (!R.walk[c]) continue;
    const m = centreOf(R, c);
    for (let k = 0; k < K; k += 10) {
      if ((m.x - t.x[k]!) * (m.x - t.x[k]!) + (m.z - t.z[k]!) * (m.z - t.z[k]!) <= close * close) {
        goalCells.push(c);
        break;
      }
    }
  }
  const goal = (c: number, time: number): boolean => {
    const k = time % K;
    const m = centreOf(R, c);
    const d2 = (m.x - t.x[k]!) * (m.x - t.x[k]!) + (m.z - t.z[k]!) * (m.z - t.z[k]!);
    return d2 <= close * close && d2 >= touch * touch && clearShot(R, parts.colliders, m.x, m.y + gen.sight.crouchHead, m.z, t.x[k]!, t.chest[k]!, t.z[k]!);
  };
  return { goal, goalCells };
}

/**
 * The way in, as carefully as can be certified: the lowest of `limits` (shares of a full meter,
 * ascending) under which a way in exists, or null. The analysis's own way in is the first a
 * greedy search finds, which is often a close call when a safer one exists, so its peak says
 * little about what a careful person could do. Each limit is one bounded search (rule 18).
 */
export function carefulWayIn(camp: Camp, parts: AnalysisParts, gen: GenTuning, limits: readonly number[]): number | null {
  const target = camp.objective?.target ?? -1;
  if (target < 0) return null;
  const A = gen.analysis;
  const { goal, goalCells } = closeShotGoal(target, parts, gen);
  const space = parts.raster;
  for (const limit of limits) {
    const meter: Meter = { levels: Math.round(A.meterLevels * limit), decay: Math.max(1, Math.round(A.meterDecay * A.meterLevels * A.dt)), still: gen.sight.still };
    const r = infiltrate(space, parts.field, meter, { goal, goalCells, horizon: 2 * parts.timeline.samples, maxExpansions: A.maxExpansions / 4, weight: A.searchWeight });
    if (r.found) return r.peak / A.meterLevels;
  }
  return null;
}

/** What a rifle plan written by hand comes to on a camp: the perch, the shots (guard, sample of the cycle), and how risky it is. */
export interface WrittenShots {
  perch: number;
  kills: Array<{ guard: number; sample: number }>;
  /** For a single clean shot, other moments of its run of clean samples, best first (a shooter takes whichever his scope shows clear). */
  moments: number[];
  risk: number;
}

/**
 * A rifle plan a person wrote, taken at its word (the exit test's reviewers): from a perch in
 * its sector and band, the guard it names (by role, and only where it says he stands) can be
 * shot as its split says. 'isolated' or 'window': nobody sees him fall. 'chain': whoever does
 * is shot inside the reaction time. 'distraction': one witness's eyes are turned away. Unlike
 * `planOn`, it needn't take the camp apart, and its first target needn't be the one a bot
 * would open on: a reviewer's plan only has to do what it says. Null if the camp won't allow it.
 */
export function writtenShots(sig: PlanSignature, camp: Camp, a: CampAnalysis, parts: AnalysisParts, gen: GenTuning): WrittenShots | null {
  const { witnesses: W, sight: P, lines, timeline: T } = parts;
  const K = W.samples;
  const n = W.guards;
  const [sector, band] = sig.opening.split(' ');
  const [role, where] = sig.first.split('@');
  const clean = sig.split === 'isolated' || sig.split === 'window';
  let best: WrittenShots | null = null;
  a.perches.forEach((p, i) => {
    if (sectorOf(camp, p.x, p.z) !== sector || (p.dist < NEAR ? 'near' : 'far') !== band) return;
    for (let g = 0; g < n; g++) {
      if (camp.guards[g]!.role !== role) continue;
      const seen = P.seen.slice(i * n * K, (i + 1) * n * K);
      const t = T.guards[g]!;
      if (where) for (let k = 0; k < K; k++) if (sectorOf(camp, t.x[k]!, t.z[k]!) !== where) seen[g * K + k] = 0;
      const one: PerchSight = { perches: 1, guards: n, samples: K, seen, distance: new Float32Array(1) };
      const r = certify([g], { W, P: one, next: nextSightings(one), masks: lines.masks }, gen);
      if (r.certified === 'unsolved' || r.certified === 'out of sight') continue;
      if (r.certified === 'distraction' ? sig.split !== 'distraction' : clean && r.kills.length > 1) continue;
      const others = (q: number): number => lines.masks[g * K + (q % K)]! & ~(1 << g);
      let how: string = r.certified === 'distraction' ? 'distraction' : r.kills.length > 1 ? 'chain' : 'window';
      let kills = r.kills.map((k) => ({ guard: k.guard, sample: k.sample }));
      let moments: number[] = [];
      if (how === 'window') {
        // Nobody ever watches him while this perch can: isolated. And the shot goes in the
        // middle of its run of clean moments, so the bullet's flight stays inside it.
        let watched = false;
        for (let k = 0; k < K && !watched; k++) watched = seen[g * K + k] === 1 && others(k) !== 0;
        if (!watched) how = 'isolated';
        const first = r.kills[0]!.sample;
        let last = first;
        while (last + 1 < first + K && seen[g * K + ((last + 1) % K)] === 1 && others(last + 1) === 0) last++;
        const at = (share: number): number => first + Math.floor((last - first) * share);
        kills = [{ guard: g, sample: at(0.5) }];
        moments = [at(0.25), at(0.75), first, last];
      }
      const risk = Math.min(0.99, SPLIT_RISK[how]! + p.dist / 2000);
      if (!best || risk < best.risk) best = { perch: i, kills, moments, risk };
    }
  });
  return best;
}

/** The risk of a way in entering only by the given rim cells, or 1 if there is none. */
function bySector(R: Raster, E: Exposure, meter: Meter, rim: number[], goalCells: number[], goal: (c: number, t: number) => boolean, horizon: number, gen: GenTuning): number {
  const allowed = new Set(rim);
  // The raster's rim is its outer ring: block the rim cells outside the sector.
  const moves = Uint8Array.from(R.moves);
  const walk = Uint8Array.from(R.walk);
  for (const c of rimCells(R)) if (!allowed.has(c)) walk[c] = 0;
  const space = { na: R.na, nb: R.nb, walk, moves };
  const r = infiltrate(space, E, meter, { goal, goalCells, horizon, maxExpansions: gen.analysis.maxExpansions });
  return r.found ? Math.min(0.99, 0.15 + (0.7 * r.peak) / gen.analysis.meterLevels) : 1;
}
