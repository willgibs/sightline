import type { Arm, Experiment, Measure, Results, RunResult } from './experiment';

/**
 * One experiment's results as plain data (`npm run experiment -- <name> --json <file>`,
 * `npm run standing`): what was run, and every run's values, so two builds' results can be
 * compared run by run long after they ran, on another machine, by another build's tools.
 *
 * JSON has no NaN, so a value that didn't apply is written as null and read back as NaN.
 * Nothing in the file depends on how many processes shared the work or how long it took.
 */

/** Bumped when the file's shape changes, so a cache of an older shape is run again. */
export const RESULTS_FORMAT = 1;

export interface RunRecord {
  seed: string;
  /** Which roll of the dice: 0 is the game's own. */
  roll: number;
  values: Record<string, number>;
}

export interface ArmRecord {
  name: string;
  off?: string;
  /** In the order of the seeds, and within a seed in the order of its rolls. */
  runs: RunRecord[];
}

export interface ResultsFile {
  format: number;
  experiment: string;
  about: string;
  series: string;
  camps: number;
  rolls: number;
  measures: Measure[];
  arms: ArmRecord[];
}

/** The plain form of an experiment's results: `results` holds each arm's runs in the order of `seeds` and their rolls. */
export function toResultsFile(exp: Pick<Experiment, 'name' | 'about' | 'series' | 'arms' | 'measures'>, seeds: readonly string[], rolls: number, results: Results): ResultsFile {
  return {
    format: RESULTS_FORMAT,
    experiment: exp.name,
    about: exp.about,
    series: exp.series,
    camps: seeds.length,
    rolls,
    measures: exp.measures.map((m) => ({ key: m.key, label: m.label, kind: m.kind })),
    arms: exp.arms.map((arm: Arm) => {
      const runs = results.get(arm.name) ?? [];
      return {
        name: arm.name,
        ...(arm.off !== undefined ? { off: arm.off } : {}),
        runs: runs.map((values, k) => ({ seed: seeds[Math.floor(k / rolls)]!, roll: k % rolls, values: { ...values } })),
      };
    }),
  };
}

/** As text: NaN written as null. */
export function stringifyResults(file: ResultsFile): string {
  const json = (v: unknown): string => JSON.stringify(v, (_, x: unknown) => (typeof x === 'number' && Number.isNaN(x) ? null : x));
  // One line per measure and per run, so two files read side by side.
  const { measures, arms, ...head } = file;
  const lines = Object.entries(head).map(([k, v]) => `  ${json(k)}: ${json(v)},`);
  lines.push(`  "measures": [\n${measures.map((m) => `    ${json(m)}`).join(',\n')}\n  ],`);
  const arm = (a: ArmRecord): string => {
    const { runs, ...rest } = a;
    const fields = Object.entries(rest).map(([k, v]) => `${json(k)}: ${json(v)}`);
    return `    { ${fields.join(', ')}, "runs": [\n${runs.map((r) => `      ${json(r)}`).join(',\n')}\n    ] }`;
  };
  lines.push(`  "arms": [\n${arms.map(arm).join(',\n')}\n  ]`);
  return `{\n${lines.join('\n')}\n}\n`;
}

/** From text: null read back as NaN. Throws on a file that isn't one. */
export function parseResults(text: string): ResultsFile {
  const file = JSON.parse(text) as ResultsFile;
  if (typeof file.experiment !== 'string' || !Array.isArray(file.arms) || !Array.isArray(file.measures)) throw new Error('not an experiment results file');
  for (const arm of file.arms) for (const run of arm.runs) for (const k of Object.keys(run.values)) if (run.values[k] === null) run.values[k] = NaN;
  return file;
}

/** Back to what `report` takes: an experiment's shape (it never runs) and each arm's runs. */
export function fromResultsFile(file: ResultsFile): { exp: Experiment; results: Results } {
  const exp: Experiment = {
    name: file.experiment,
    about: file.about,
    series: file.series,
    camps: file.camps,
    arms: file.arms.map((a) => ({ name: a.name, ...(a.off !== undefined ? { off: a.off } : {}) })),
    measures: file.measures,
    run: () => {
      throw new Error('a results file is read, never run');
    },
  };
  return { exp, results: new Map(file.arms.map((a) => [a.name, a.runs.map((r): RunResult => r.values)])) };
}
