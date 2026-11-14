import type { Tuning } from '../config/tuning';
import { Rng } from '../sim/kernel/core/rng';
import { randomSeed } from '../sim/kernel/core/seed';
import { clusteredRate, excludesZero, mean, median, pairedDifference, splitVariance, type Interval, type VarianceSplit } from './stats';

/**
 * Experiments (Lab F, docs/camp-engine.md): the same camps, run several ways, compared.
 * The numbers an owner's call rests on should be one command away, not in a script that
 * was thrown out.
 *
 * Each arm of an experiment runs on the same seeds, and the simulation is deterministic
 * with a random stream per entity (rule 3). So a difference between two arms is the arm's
 * doing, and comparing them seed by seed removes the variation between camps.
 *
 * One run of a camp is one roll of its dice, so a number can be luck. `--dice N` runs every
 * camp N times with other luck (the tuning's `sim.dice`), and the report says how much of
 * each number is the camp and how much is the dice. The camps stay the unit a number is
 * sure about: N rolls of 12 camps are not 12 × N independent camps.
 *
 * An experiment reads a simulation and never writes one. Runs are independent, so the
 * results don't depend on how many processes share the work or in what order.
 */

/** One way of running the camps: `off` names the engines switched off, as a scene takes them (game/switches.ts). */
export interface Arm {
  name: string;
  off?: string;
}

export interface Measure {
  key: string;
  label: string;
  /** `rate`: each run gives 1 or 0, reported as k of n. `mean`: each run gives a number, or NaN where it doesn't apply. `median`: the same, for skewed numbers. */
  kind: 'rate' | 'mean' | 'median';
}

export interface Experiment {
  name: string;
  about: string;
  /** Names the list of camps, so that a figure can be reproduced. */
  series: string;
  /** How many camps, unless the command line says otherwise. */
  camps: number;
  arms: readonly Arm[];
  measures: readonly Measure[];
  /** The measure that says which arm did best on a camp, for a tournament between arms: the report counts each arm's best camps, and by how far. */
  score?: string;
  /** One camp, one arm: each measure's value. */
  run(seed: string, arm: Arm, tuning: Tuning): Record<string, number>;
}

/** The camps of a series, always the same ones. */
export function seedsOf(series: string, count: number): string[] {
  const list = new Rng(series, 'list');
  return Array.from({ length: count }, () => randomSeed(() => list.next()));
}

/** The tuning for a roll of the dice on the same camps: roll 0 is the game's own. */
export function withDice(tuning: Tuning, dice: number): Tuning {
  return dice === 0 ? tuning : { ...tuning, sim: { ...tuning.sim, dice } };
}

export type RunResult = Record<string, number>;

/** Every arm's results, in the order of the seeds, and within each seed in the order of its rolls of the dice. */
export type Results = ReadonlyMap<string, readonly RunResult[]>;

export interface MeasureReport {
  key: string;
  label: string;
  kind: Measure['kind'];
  /** How many runs it applied to. */
  n: number;
  value: Interval;
  /** Against the first arm, seed by seed; null for the first arm itself and for medians. */
  change: Interval | null;
  /** The change is more than the camps' own variation. */
  clear: boolean;
  /** With several rolls of the dice: how much of the spread between runs is the camp's. */
  split: VarianceSplit | null;
}

export interface ArmReport {
  arm: string;
  measures: MeasureReport[];
}

/** A flat list cut into groups of `size`, in order. */
function groupsOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size));
  return out;
}

/**
 * Turns the results into what's reported: a value with its interval for each measure, and
 * the change from the first arm. `rolls` is how many rolls of the dice each camp had:
 * each camp counts once, by its mean over them.
 */
export function report(exp: Experiment, results: Results, rolls = 1): ArmReport[] {
  const camps = (runs: readonly RunResult[], key: string): number[] => groupsOf(runs, rolls).map((g) => mean(g.map((r) => r[key] ?? NaN)).value);
  const base = results.get(exp.arms[0]!.name)!;
  return exp.arms.map((arm, index) => {
    const runs = results.get(arm.name)!;
    const measures = exp.measures.map((m): MeasureReport => {
      const xs = runs.map((r) => r[m.key] ?? NaN);
      const applies = xs.filter((x) => !Number.isNaN(x));
      const split = rolls > 1 ? splitVariance(groupsOf(xs, rolls)) : null;
      const value =
        m.kind === 'rate'
          ? clusteredRate(applies.reduce((a, b) => a + b, 0), applies.length, rolls, split)
          : m.kind === 'mean'
            ? mean(camps(runs, m.key))
            : { value: median(xs), low: NaN, high: NaN };
      const change = index === 0 || m.kind === 'median' ? null : pairedDifference(camps(base, m.key), camps(runs, m.key));
      return { key: m.key, label: m.label, kind: m.kind, n: applies.length, value, change, clear: change !== null && excludesZero(change), split };
    });
    return { arm: arm.name, measures };
  });
}

const number = (x: number): string => (Number.isNaN(x) ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) < 1 ? x.toFixed(2) : x.toFixed(1));

/** A measure's value, in words a table can hold. */
export function cell(m: MeasureReport): string {
  if (m.kind === 'rate') return Number.isNaN(m.value.value) ? '–' : `${Math.round(m.value.value * m.n)}/${m.n}`;
  if (m.kind === 'median') return number(m.value.value);
  return `${number(m.value.value)} ±${number((m.value.high - m.value.low) / 2)}`;
}

/** Who does best on each camp, by an experiment's score, and how far ahead of the next arm: the design's "dominance". */
export interface Tournament {
  key: string;
  /** Each arm: the camps it's alone at the top of. */
  best: Array<{ arm: string; camps: number }>;
  /** Camps where the top is shared. */
  tied: number;
  /** The mean gap between the best arm and the next, over the camps. */
  margin: number;
}

export function tournament(exp: Experiment, results: Results, rolls = 1): Tournament | null {
  const key = exp.score;
  if (!key) return null;
  const scores = exp.arms.map((arm) => groupsOf(results.get(arm.name)!, rolls).map((g) => mean(g.map((r) => r[key] ?? NaN)).value));
  const camps = scores[0]!.length;
  const best = exp.arms.map((arm) => ({ arm: arm.name, camps: 0 }));
  let tied = 0;
  let margin = 0;
  for (let c = 0; c < camps; c++) {
    const here = scores.map((s) => s[c]!);
    const sorted = [...here].sort((a, b) => b - a);
    const top = sorted[0]!;
    margin += top - (sorted[1] ?? top);
    const leaders = here.flatMap((v, k) => (v === top ? [k] : []));
    if (leaders.length === 1) best[leaders[0]!]!.camps++;
    else tied++;
  }
  return { key, best, tied, margin: camps > 0 ? margin / camps : NaN };
}

/** How much of a measure is the camp's, with the spread of each. */
function splitCell(m: MeasureReport): string {
  const s = m.split;
  if (!s || Number.isNaN(s.campShare)) return '–';
  return `${(s.campShare * 100).toFixed(0)}% (${number(s.camp)} · ${number(s.dice)})`;
}

function table(rows: ReadonlyArray<readonly string[]>): string[] {
  const widths = rows[0]!.map((_, k) => Math.max(...rows.map((row) => row[k]!.length)));
  return rows.map((row) => row.map((c, k) => (k === 0 ? c.padEnd(widths[k]!) : c.padStart(widths[k]!))).join('  '));
}

/** The whole report, as plain text: a table, each change that's more than the camps' own variation, and with several rolls of the dice, what's the camp and what's the dice. */
export function formatReport(exp: Experiment, reports: readonly ArmReport[], count: number, rolls = 1, best: Tournament | null = null): string {
  const headers = ['', ...exp.measures.map((m) => m.label)];
  const out = [`${exp.name}: ${exp.about}`, `${count} camps${rolls > 1 ? `, ${rolls} rolls of the dice on each` : ''}, series ${exp.series}.`, '', ...table([headers, ...reports.map((r) => [r.arm, ...r.measures.map(cell)])]), ''];
  const clear = reports.flatMap((r) => r.measures.filter((m) => m.clear).map((m) => `  ${r.arm}: ${m.label} ${m.change!.value >= 0 ? '+' : ''}${m.kind === 'rate' ? `${(m.change!.value * 100).toFixed(0)} points` : number(m.change!.value)}`));
  out.push(clear.length ? 'Clearly different from the first arm, seed by seed:' : 'Nothing is clearly different from the first arm.', ...clear, '');
  if (best) {
    out.push(`Best on each camp, by ${best.key}:`);
    for (const b of best.best) out.push(`  ${b.arm}: ${b.camps} of ${count}`);
    out.push(`  tied at the top: ${best.tied} of ${count}`, `  the best ahead of the next by ${number(best.margin)} on average`, '');
  }
  if (rolls > 1) {
    out.push("The camp or the dice? The camp's share of the spread between runs (the rest is luck), with the standard deviation between camps · between rolls on one camp:", '');
    out.push(...table([headers, ...reports.map((r) => [r.arm, ...r.measures.map(splitCell)])]), '');
  }
  return out.join('\n');
}
