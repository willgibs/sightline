import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { analyzeCamp, campMission, generateWorld, type CampAnalysis } from '../src/sim/generation';
import type { AnalysisParts } from '../src/sim/generation/campAnalysis';
import { buildRaster } from '../src/sim/generation/raster';
import { RULES, validateCamp, type RuleName, type Validation } from '../src/sim/generation/validate';
import type { World } from '../src/sim/kernel/world/world';

/**
 * Validation and repair (D8, generation/validate.ts and repair.ts): every rule fails when
 * what it asks for is taken away and says which perches broke it; a repaired camp passes,
 * within its budget, the same way every time.
 */

// A camp whose crux is the way in, so that every rule below has something to ask of it.
const TI = structuredClone(T);
TI.gen.crux.kinds = { walk: 0, inside: 1, flush: 0, escort: 0 };
const G = TI.gen;
const SEEDS = ['KAL-1320', 'ZUV-2081', 'KEP-9923', 'LOT-9009', 'DEH-8489', 'FIT-3642'];
let world: World;
let analysis: CampAnalysis;
let parts: AnalysisParts;

beforeAll(() => {
  for (const seed of SEEDS) {
    const w = generateWorld(campMission(seed), TI);
    if (w.report.validation!.ok && (w.report.repairs ?? []).length === 0) {
      world = w;
      break;
    }
  }
  expect(world, 'a seed that passes at its first attempt').toBeDefined();
  const R = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, G, world.props.trees, world.grid);
  ({ analysis, parts } = analyzeCamp(world.camp, world.terrain, world.colliders, world.grid, G, R));
}, 180_000);

/** Validates a variant of the camp's analysis. */
function check(change: (a: CampAnalysis) => CampAnalysis, p: AnalysisParts = parts, camp = world.camp): Validation {
  return validateCamp(camp, change(analysis), p, world.terrain, world.grid, G);
}

const copyPerches = (a: CampAnalysis): CampAnalysis => ({ ...a, perches: a.perches.map((p) => ({ ...p })) });
const failed = (v: Validation, rule: RuleName): boolean => v.failed.includes(rule);

describe('a camp that passes validation', () => {
  it('passes every rule, in the order the rules are listed', () => {
    const v = check((a) => a);
    expect(v.ok).toBe(true);
    expect(v.failed).toEqual([]);
    expect(v.rules.map((r) => r.rule)).toEqual([...RULES]);
    expect(v.score).toBe(0);
  });
});

describe('each rule', () => {
  it('the crux: a way to succeed at it must exist, and nothing else is promised', () => {
    // No camp here is asked for a shot at the target: its perches can all be blind to him.
    const blind = check((a) => ({ ...copyPerches(a), perches: a.perches.map((p) => ({ ...p, target: 0 })) }));
    const crux = world.camp.crux!;
    if (crux !== 'escort') expect(failed(blind, 'crux')).toBe(false);
    // A buried target's camp has to have the way through that its crux needs.
    if (crux === 'inside') expect(failed(check((a) => ({ ...a, infiltration: { ...a.infiltration, found: false } })), 'crux')).toBe(true);
    if (crux === 'flush') {
      const noWayToStopHim = check((a) => {
        const b = copyPerches(a);
        for (const p of b.perches) p.run = 0;
        return { ...b, vehicle: { ...b.vehicle, found: false } };
      });
      expect(failed(noWayToStopHim, 'crux')).toBe(true);
    }
    if (crux === 'escort') {
      const unseen = check((a) => ({ ...copyPerches(a), perches: a.perches.map((p) => ({ ...p, target: 0 })) }));
      expect(failed(unseen, 'crux')).toBe(true);
    }
  });

  it('infiltration, systems and the ways out: each needs its way', () => {
    expect(failed(check((a) => ({ ...a, infiltration: { ...a.infiltration, found: false } })), 'infiltration')).toBe(true);
    expect(failed(check((a) => ({ ...a, sabotage: { ...a.sabotage, found: false } })), 'systems')).toBe(true);
    expect(failed(check((a) => ({ ...a, exfil: { ...a.exfil, found: false } })), 'two ways out')).toBe(true);
    expect(failed(check((a) => ({ ...a, exfil2: { ...a.exfil2, found: false } })), 'two ways out')).toBe(true);
  });

  it('systems: the generator must power an alarm or a radio', () => {
    const camp = { ...world.camp, devices: (world.camp.devices ?? []).filter((d) => d.kind !== 'alarm' && d.kind !== 'radio') };
    expect(failed(check((a) => a, parts, camp), 'systems')).toBe(true);
  });

  it('clusters: none may be left unsolved', () => {
    const v = check((a) => ({ ...a, clusters: [...a.clusters, { members: [0], certified: 'unsolved', kills: [], expanded: 0 }] }));
    expect(failed(v, 'clusters')).toBe(true);
  });

  it('no single perch: coverage and the target, and which perch broke them', () => {
    const over = check((a) => {
      const b = copyPerches(a);
      b.perches[3]!.coverage = G.compound.types[world.camp.layout!.type].maxCoverage + 0.05;
      return b;
    });
    expect(failed(over, 'perch coverage')).toBe(true);
    expect(over.rules.find((r) => r.rule === 'perch coverage')!.perches).toEqual([3]);
    const target = check((a) => {
      const b = copyPerches(a);
      b.perches[5]!.target = G.validation.maxTarget + 0.05;
      return b;
    });
    expect(failed(target, 'perch target')).toBe(true);
    expect(target.rules.find((r) => r.rule === 'perch target')!.perches).toEqual([5]);
  });

  it('witnessed: with no witnesses at all, a perch that sees two guards breaks it', () => {
    const none = { ...parts, witnesses: { ...parts.witnesses, edge: new Uint8Array(parts.witnesses.edge.length) } };
    expect(failed(check((a) => a, none), 'perch witnessed')).toBe(true);
  });

  it('alarms in fire: a perch that sees many guards can reach neither an alarm box nor the antenna', () => {
    const box = check((a) => {
      const b = copyPerches(a);
      b.perches[2]!.coverage = G.validation.manyGuards;
      b.perches[2]!.alarms = 1;
      return b;
    });
    expect(failed(box, 'alarms in fire')).toBe(true);
    const mast = check((a) => {
      const b = copyPerches(a);
      b.perches[2]!.coverage = G.validation.manyGuards;
      b.perches[2]!.antenna = true;
      return b;
    });
    expect(failed(mast, 'alarms in fire')).toBe(true);
  });

  it('escape: the best overview must not be able to stop his run, and something else must', () => {
    const best = analysis.perches.reduce((b, p, i) => (p.ground > analysis.perches[b]!.ground ? i : b), 0);
    const seen = check((a) => {
      const b = copyPerches(a);
      b.perches[best]!.run = G.validation.interceptSeconds + 1;
      return b;
    });
    expect(failed(seen, 'escape')).toBe(true);
    expect(seen.rules.find((r) => r.rule === 'escape')!.perches).toEqual([best]);
    const none = check((a) => ({ ...a, vehicle: { ...a.vehicle, found: false }, perches: a.perches.map((p) => ({ ...p, run: 0 })) }));
    expect(failed(none, 'escape')).toBe(true);
  });

  it('guards: at most the cap', () => {
    const many = { ...world.camp, guards: Array.from({ length: G.staffing.cap + 1 }, () => world.camp.guards[0]!) };
    // More guards than the analysis has: only the count matters to this rule.
    expect(failed(validateCamp(many, analysis, parts, world.terrain, world.grid, G), 'guards')).toBe(true);
  });
});

describe('repair', () => {
  it('stays within its budget, and repairs the same way every time', () => {
    const seed = 'FIG-8670';
    const a = generateWorld(campMission(seed), T);
    const b = generateWorld(campMission(seed), T);
    expect(a.report.repairAttempts!).toBeLessThanOrEqual(G.validation.repairAttempts);
    expect(a.report.repairs).toEqual(b.report.repairs);
    expect(a.camp.guards.map((g) => [g.x, g.z])).toEqual(b.camp.guards.map((g) => [g.x, g.z]));
  }, 120_000);
});
