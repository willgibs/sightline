import type { GenTuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { Heightfield } from '../kernel/world/heightfield';
import type { SpatialGrid } from '../kernel/world/grid';
import { cellIndex } from '../kernel/world/grid';
import { GridSearch } from '../kernel/world/search';
import type { Camp } from './camp';
import { campWalkStart } from './site';
import type { AnalysisParts, CampAnalysis } from './campAnalysis';
import { cruxExcess, needsWayIn } from './crux';

/**
 * Validation (D8): the design doc's rules for a camp (Maps and procedural camps · Validation
 * rules), the plan's no-single-perch rules and their three companions, read off the camp's
 * analysis (D7). Every perch rule is checked exhaustively over the finite list of perches.
 * Coverage is counted as the plan pinned before D8: the share of each guard's time in view
 * over the cycle, or a minimum time in view (`seenSeconds`), never "ever in view".
 *
 * Each rule says how far it is from passing (`excess`, 0 when it passes), so a repair can be
 * judged by whether it brings a camp closer (repair.ts).
 */
export type RuleName =
  | 'crux'
  | 'infiltration'
  | 'systems'
  | 'clusters'
  | 'perch coverage'
  | 'perch target'
  | 'perch witnessed'
  | 'counter-perch'
  | 'alarms in fire'
  | 'escape'
  | 'two ways out'
  | 'guards';

export const RULES: readonly RuleName[] = [
  'crux',
  'infiltration',
  'systems',
  'clusters',
  'perch coverage',
  'perch target',
  'perch witnessed',
  'counter-perch',
  'alarms in fire',
  'escape',
  'two ways out',
  'guards',
];

export interface RuleResult {
  rule: RuleName;
  ok: boolean;
  /** How far from passing, in the rule's own units (0 when it passes). */
  excess: number;
  /** What failed, for the explorer and the seeds report; empty when it passes. */
  detail: string;
  /** The perches (analysis.perches indices) that broke it, where a perch did. */
  perches: number[];
}

export interface Validation {
  ok: boolean;
  rules: RuleResult[];
  failed: RuleName[];
  /** Failed rules first, then their summed excess: lower is closer to valid. */
  score: number;
}

export function validateCamp(camp: Camp, a: CampAnalysis, parts: AnalysisParts, hf: Heightfield, grid: SpatialGrid, gen: GenTuning): Validation {
  const V = gen.validation;
  const n = camp.guards.length;
  const seenShare = V.seenSeconds / a.cycle;
  const sees = a.perches.map((p) => p.guards.map((s) => s >= seenShare - 1e-9));
  const out: RuleResult[] = [];
  const rule = (name: RuleName, excess: number, detail: string, perches: number[] = []): void => {
    const ok = excess <= 1e-9;
    out.push({ rule: name, ok, excess: ok ? 0 : excess, detail: ok ? '' : detail, perches: ok ? [] : perches });
  };

  // The crux: what this camp is built around, and that a way to succeed at it exists. No other
  // way is promised: `infiltration`, `systems` and the ways out are asked only of the cruxes
  // that depend on them.
  const crux = camp.crux ?? 'walk';
  const wayIn = needsWayIn(crux);
  {
    const { excess, detail } = cruxExcess(camp, a, gen);
    rule('crux', excess, detail);
  }
  rule('infiltration', !wayIn || a.infiltration.found ? 0 : 1, a.infiltration.exhausted ? 'no way in within the search budget' : 'no way in');
  {
    const feeds = (camp.devices ?? []).filter((d) => d.kind === 'alarm' || d.kind === 'radio').length;
    rule('systems', !wayIn || (a.sabotage.found && feeds > 0) ? 0 : (a.sabotage.found ? 0 : 1) + (feeds > 0 ? 0 : 1), !a.sabotage.found ? 'no unseen way to the generator' : 'the generator powers no alarm and no radio');
  }
  {
    const unsolved = a.clusters.filter((c) => c.certified === 'unsolved');
    rule('clusters', unsolved.length, `unsolved: ${unsolved.map((c) => c.members.join('+')).join(', ')}`);
  }
  // No single perch wins.
  {
    const over: number[] = [];
    let excess = 0;
    a.perches.forEach((p, i) => {
      if (p.coverage > V.maxCoverage + 1e-9) {
        over.push(i);
        excess += p.coverage - V.maxCoverage;
      }
    });
    rule('perch coverage', excess, `${over.length} perch(es) see more than ${Math.round(V.maxCoverage * 100)}% of guard time (most ${Math.round(Math.max(0, ...a.perches.map((p) => p.coverage)) * 100)}%)`, over);
  }
  {
    const over: number[] = [];
    let excess = 0;
    a.perches.forEach((p, i) => {
      if (p.target > V.maxTarget + 1e-9) {
        over.push(i);
        excess += p.target - V.maxTarget;
      }
    });
    rule('perch target', excess, `${over.length} perch(es) see the target more than ${Math.round(V.maxTarget * 100)}% of the cycle (most ${Math.round(Math.max(0, ...a.perches.map((p) => p.target)) * 100)}%)`, over);
  }
  {
    // A perch that sees two guards or more must see one who, for a part of the cycle, would
    // be seen dropping by a guard it can't see at that moment: a shot there is witnessed
    // unless it's timed.
    const { witnesses: W, sight: P } = parts;
    const K = W.samples;
    const bad: number[] = [];
    a.perches.forEach((_, i) => {
      const inView = sees[i]!.map((v, g) => (v ? g : -1)).filter((g) => g >= 0);
      if (inView.length < 2) return;
      const seenAt = (g: number, k: number): boolean => P.seen[(i * n + g) * K + k] === 1;
      const watched = inView.some((v) => {
        for (let u = 0; u < n; u++) {
          if (u === v) continue;
          let count = 0;
          for (let k = 0; k < K; k++) if (W.edge[(k * n + u) * n + v] && seenAt(v, k) && !seenAt(u, k)) count++;
          if (count / K >= V.watchedDuty) return true;
        }
        return false;
      });
      if (!watched) bad.push(i);
    });
    rule('perch witnessed', bad.length, `${bad.length} perch(es) see guards none of whom is watched from out of their view`, bad);
  }
  // The companions.
  {
    const bad = unanswered(camp, a, hf, grid, gen);
    rule('counter-perch', bad.length, `${bad.length} perch(es) overlooked by no marksman post and no counter-perch the camp can reach`, bad);
  }
  {
    const bad: number[] = [];
    a.perches.forEach((p, i) => {
      if (p.coverage >= V.manyGuards && (p.alarms > 0 || p.antenna)) bad.push(i);
    });
    rule('alarms in fire', bad.length, `${bad.length} perch(es) that see many guards have an alarm box or the antenna in their fire`, bad);
  }
  {
    // The best overview is the perch that sees the most of the camp's ground; it mustn't be able to stop the target's run.
    let best = -1;
    a.perches.forEach((p, i) => {
      if (best < 0 || p.ground > a.perches[best]!.ground) best = i;
    });
    const others = a.perches.filter((p, i) => i !== best && p.run >= V.interceptSeconds).length;
    const fromBest = best >= 0 ? a.perches[best]!.run : 0;
    // Stopped by another perch, or by his vehicle sabotaged first (design doc: "crosses a perch's sightline or passes a sabotage point").
    const excess = (others > 0 || a.vehicle.found ? 0 : 1) + (fromBest >= V.interceptSeconds ? fromBest - V.interceptSeconds + 1e-6 : 0);
    rule('escape', excess, others === 0 && !a.vehicle.found ? 'nothing but the best overview can stop the target on his run' : `the best overview has the target on his run for ${fromBest.toFixed(1)} s`, best >= 0 && fromBest >= V.interceptSeconds ? [best] : []);
  }
  // The ways out are found from the end of the way in, so only a camp whose crux is the way in is asked for them.
  rule('two ways out', !wayIn ? 0 : (a.exfil.found ? 0 : 1) + (a.exfil2.found ? 0 : 1), !a.exfil.found ? 'no way out' : 'only one way out');
  rule('guards', Math.max(0, n - gen.staffing.cap), `${n} guards, more than ${gen.staffing.cap}`);

  const failed = out.filter((r) => !r.ok).map((r) => r.rule);
  const score = failed.length + out.reduce((s, r) => s + Math.min(0.99, r.excess / 10), 0);
  return { ok: failed.length === 0, rules: out, failed, score };
}

/**
 * Perches no marksman post overlooks and no counter-perch covers. A marksman's eye on his
 * post, or a perch the camp's guards can walk to, must have a clear line over the terrain to
 * the perch's eye within `counterRange`.
 */
function unanswered(camp: Camp, a: CampAnalysis, hf: Heightfield, grid: SpatialGrid, gen: GenTuning): number[] {
  const V = gen.validation;
  const S = gen.sight;
  const eyes = a.perches.map((p) => ({ x: p.x, y: p.y + S.proneEye, z: p.z }));
  const posts = camp.guards.filter((g) => g.role === 'marksman').map((g) => ({ x: g.x, y: (g.elevated ? g.y : hf.heightAt(g.x, g.z)) + S.eye, z: g.z }));
  // Where the camp can walk: a flood over the map's grid from the camp.
  const search = new GridSearch(grid.map);
  const from = campWalkStart(camp);
  const start = cellIndex(grid.map, from.x, from.z);
  const reachable = new Uint8Array(eyes.length);
  if (start >= 0) {
    search.flood([start], { maxExpansions: grid.map.nx * grid.map.nz });
    eyes.forEach((e, i) => {
      const c = cellIndex(grid.map, e.x, e.z);
      if (c >= 0 && search.cost[c]! >= 0) reachable[i] = 1;
    });
  }
  const clear = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }): boolean => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dz = q.z - p.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > V.counterRange || d < 1e-6) return false;
    return hf.raycast(p.x, p.y, p.z, dx / d, dy / d, dz / d, d - 0.5) >= d - 0.5;
  };
  /** Ground the camp can walk to, near a perch, with a clear line to it: a counter-sniper's position (the research's reading). */
  const groundAnswers = (e: { x: number; y: number; z: number }): boolean => {
    if (start < 0) return false;
    for (const radius of V.counterRings) {
      for (let k = 0; k < V.counterBearings; k++) {
        const angle = (k * 2 * Math.PI) / V.counterBearings;
        const x = e.x + radius * dcos(angle);
        const z = e.z + radius * dsin(angle);
        const c = cellIndex(grid.map, x, z);
        if (c < 0 || search.cost[c]! < 0) continue;
        if (clear({ x, y: hf.heightAt(x, z) + S.eye, z }, e)) return true;
      }
    }
    return false;
  };
  const bad: number[] = [];
  eyes.forEach((e, i) => {
    if (posts.some((m) => clear(m, e))) return;
    if (eyes.some((q, j) => j !== i && reachable[j] && clear(q, e))) return;
    if (groundAnswers(e)) return;
    bad.push(i);
  });
  return bad;
}
