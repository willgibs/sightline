import type { Tuning } from '../config/tuning';
import { Rng } from '../sim/kernel/core/rng';
import { randomSeed } from '../sim/kernel/core/seed';
import { excludesZero, mean, median, pairedDifference, wilson, type Interval } from './stats';

/**
 * Experiments (Lab F, docs/camp-engine.md): the same camps, run several ways, compared.
 * The numbers an owner's call rests on should be one command away, not in a script that
 * was thrown out.
 *
 * Each arm of an experiment runs on the same seeds, and the simulation is deterministic
 * with a random stream per entity (rule 3). So a difference between two arms is the arm's
 * doing, and comparing them seed by seed removes the variation between camps.
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
  /** One camp, one arm: each measure's value. */
  run(seed: string, arm: Arm, tuning: Tuning): Record<string, number>;
}

/** The camps of a series, always the same ones. */
export function seedsOf(series: string, count: number): string[] {
  const list = new Rng(series, 'list');
  return Array.from({ length: count }, () => randomSeed(() => list.next()));
}

export type RunResult = Record<string, number>;

/** Every arm's results, in the order of the seeds. */
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
}

export interface ArmReport {
  arm: string;
  measures: MeasureReport[];
}

/** Turns the results into what's reported: a value with its interval for each measure, and the change from the first arm. */
export function report(exp: Experiment, results: Results): ArmReport[] {
  const base = results.get(exp.arms[0]!.name)!;
  return exp.arms.map((arm, index) => {
    const runs = results.get(arm.name)!;
    const measures = exp.measures.map((m): MeasureReport => {
      const xs = runs.map((r) => r[m.key] ?? NaN);
      const applies = xs.filter((x) => !Number.isNaN(x));
      const value =
        m.kind === 'rate'
          ? wilson(applies.reduce((a, b) => a + b, 0), applies.length)
          : m.kind === 'mean'
            ? mean(xs)
            : { value: median(xs), low: NaN, high: NaN };
      const change = index === 0 || m.kind === 'median' ? null : pairedDifference(base.map((r) => r[m.key] ?? NaN), xs);
      return { key: m.key, label: m.label, kind: m.kind, n: applies.length, value, change, clear: change !== null && excludesZero(change) };
    });
    return { arm: arm.name, measures };
  });
}

const number = (x: number): string => (Number.isNaN(x) ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) < 1 ? x.toFixed(2) : x.toFixed(1));

/** A measure's value, in words a table can hold. */
function cell(m: MeasureReport): string {
  if (m.kind === 'rate') return Number.isNaN(m.value.value) ? '–' : `${Math.round(m.value.value * m.n)}/${m.n}`;
  if (m.kind === 'median') return number(m.value.value);
  return `${number(m.value.value)} ±${number((m.value.high - m.value.low) / 2)}`;
}

/** The whole report, as plain text: a table, and below it each change that's more than the camps' own variation. */
export function formatReport(exp: Experiment, reports: readonly ArmReport[], count: number): string {
  const headers = ['', ...exp.measures.map((m) => m.label)];
  const rows = reports.map((r) => [r.arm, ...r.measures.map(cell)]);
  const widths = headers.map((h, k) => Math.max(h.length, ...rows.map((row) => row[k]!.length)));
  const line = (row: readonly string[]): string => row.map((c, k) => (k === 0 ? c.padEnd(widths[k]!) : c.padStart(widths[k]!))).join('  ');
  const out = [`${exp.name}: ${exp.about}`, `${count} camps, series ${exp.series}.`, '', line(headers), ...rows.map(line), ''];
  const clear = reports.flatMap((r) => r.measures.filter((m) => m.clear).map((m) => `  ${r.arm}: ${m.label} ${m.change!.value >= 0 ? '+' : ''}${m.kind === 'rate' ? `${(m.change!.value * 100).toFixed(0)} points` : number(m.change!.value)}`));
  out.push(clear.length ? 'Clearly different from the first arm, seed by seed:' : 'Nothing is clearly different from the first arm.', ...clear, '');
  return out.join('\n');
}
