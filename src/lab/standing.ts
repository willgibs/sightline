import { cell, report, type ArmReport } from './experiment';
import { fromResultsFile, type ResultsFile, type RunRecord } from './results';

/**
 * The standing benches: the experiments every change to how a camp behaves is held to.
 * A behaviour change has to show that the camp's other benches still read as they did
 * on main, run by run and not only in their summaries, since a fault often shows first as
 * a few camps that read differently while the tables hold. `npm run standing` runs the set
 * on two builds and compares them (src/headless/standing.ts), and CI does so for every
 * pull request (.github/workflows/standing.yml).
 *
 * When a new behaviour lands with its own bench, that bench joins the set here.
 *
 * Everything below the set is pure: comparing two builds' results (src/lab/results.ts)
 * and saying what differs, as Markdown that also reads in a terminal.
 */

export interface StandingBench {
  /** The bench's name, and the name of its results files. */
  name: string;
  /** The experiment it runs (src/lab/experiments). */
  experiment: string;
  camps?: number;
  /** Rolls of the dice on each camp. */
  dice?: number;
  /** How long it takes: seconds on one of CI's machines (four processes), as last measured. Shards are dealt by it. */
  cost: number;
}

export const STANDING: readonly StandingBench[] = [
  // A bench that only runs the game's own dice can hide a fault about who gets shot (CLAUDE.md).
  { name: 'own-side', experiment: 'own-side', dice: 3, cost: 957 },
  { name: 'circling', experiment: 'circling', cost: 644 },
  { name: 'hunt', experiment: 'hunt', cost: 288 },
  { name: 'second-step', experiment: 'second-step', cost: 230 },
  { name: 'out-the-gate', experiment: 'out-the-gate', cost: 178 },
  { name: 'takedown', experiment: 'takedown', cost: 142 },
  { name: 'ladder', experiment: 'ladder', cost: 127 },
  { name: 'flaws', experiment: 'flaws', cost: 116 },
  // Estimated, until CI measures it: here it took 406 s beside answer's 288 (75 on CI), and 1.5 times answer's CPU.
  { name: 'sittings', experiment: 'sittings', cost: 110 },
  { name: 'firefight', experiment: 'firefight', cost: 89 },
  { name: 'answer', experiment: 'answer', cost: 75 },
];

/** The benches named (all if none), in order of cost, the dearest first; throws on a name that isn't in the set. */
export function choose(only?: readonly string[]): StandingBench[] {
  for (const n of only ?? []) if (!STANDING.some((b) => b.name === n)) throw new Error(`'${n}' isn't a standing bench: there's ${STANDING.map((b) => b.name).join(', ')}`);
  return STANDING.filter((b) => !only || only.includes(b.name)).sort((a, b) => b.cost - a.cost || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * A piece of a shard's work: a whole bench (one part of one), or one part of a dear bench
 * split by its camps. Part `part` of `parts` (from 0) holds the camps whose place in the
 * bench's list leaves `part` when divided by `parts`. Every run is independent, so a
 * bench's parts together are the bench, run for run (`mergeParts`).
 */
export interface Piece {
  bench: StandingBench;
  part: number;
  parts: number;
  /** Its share of the bench's cost. */
  cost: number;
}

/** A bench as one piece. */
export const whole = (bench: StandingBench): Piece => ({ bench, part: 0, parts: 1, cost: bench.cost });

/**
 * Shard `k` of `n` (k from 1). A bench dearer than an even share of the whole set is split
 * by its camps into as many parts as it takes for each to fit in one, so no single bench
 * sets how long the set takes. Then the pieces are dealt out dearest first, each to
 * whichever shard is lightest so far (the lowest-numbered of equals).
 */
export function shard(benches: readonly StandingBench[], k: number, n: number): Piece[] {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(k) || k < 1 || k > n) throw new Error(`a shard is k/n with 1 ≤ k ≤ n, not ${k}/${n}`);
  const share = benches.reduce((s, b) => s + b.cost, 0) / n;
  const pieces = benches.flatMap((bench): Piece[] => {
    const parts = n > 1 && share > 0 ? Math.max(1, Math.ceil(bench.cost / share)) : 1;
    return Array.from({ length: parts }, (_, part) => ({ bench, part, parts, cost: bench.cost / parts }));
  });
  pieces.sort((a, b) => b.cost - a.cost || (a.bench.name < b.bench.name ? -1 : a.bench.name > b.bench.name ? 1 : a.part - b.part));
  const shards = Array.from({ length: n }, () => ({ cost: 0, pieces: [] as Piece[] }));
  for (const p of pieces) {
    let lightest = shards[0]!;
    for (const s of shards) if (s.cost < lightest.cost) lightest = s;
    lightest.cost += p.cost;
    lightest.pieces.push(p);
  }
  return shards[k - 1]!.pieces;
}

/** The name of a piece's results files: the bench's own when it's whole, `<bench>.part-<p>-of-<n>` (p from 1) when it's split. */
export function pieceName(p: Pick<Piece, 'bench' | 'part' | 'parts'>): string {
  return p.parts === 1 ? p.bench.name : `${p.bench.name}.part-${p.part + 1}-of-${p.parts}`;
}

/** A results file's name back to its bench and part (from 0), or null for a whole bench's. */
export function partOf(name: string): { bench: string; part: number; parts: number } | null {
  const m = /^(.+)\.part-(\d+)-of-(\d+)$/.exec(name);
  return m ? { bench: m[1]!, part: Number(m[2]) - 1, parts: Number(m[3]) } : null;
}

/**
 * A split bench's parts, in order, back into the bench, run for run. Part p of n holds the
 * camps at p, p + n, p + 2n... of the bench's list, so they're dealt back in that order and
 * the file is the one a whole run would have written. Throws unless the parts are of one
 * experiment, with the same arms and rolls.
 */
export function mergeParts(parts: readonly ResultsFile[]): ResultsFile {
  const first = parts[0];
  if (!first) throw new Error('there are no parts to merge');
  const shape = (f: ResultsFile): string => JSON.stringify([f.experiment, f.rolls, f.arms.map((a) => a.name)]);
  for (const p of parts) if (shape(p) !== shape(first)) throw new Error(`the parts of '${first.experiment}' aren't of one run: ${shape(p)} against ${shape(first)}`);
  const n = parts.length;
  const camps = parts.reduce((s, p) => s + p.camps, 0);
  return {
    ...first,
    camps,
    arms: first.arms.map((arm, a) => {
      const runs: RunRecord[] = [];
      for (let i = 0; i < camps; i++) {
        const part = parts[i % n]!;
        const j = Math.floor(i / n);
        runs.push(...part.arms[a]!.runs.slice(j * part.rolls, (j + 1) * part.rolls));
      }
      return { ...arm, runs };
    }),
  };
}

/** A bench a build didn't have: why. */
export interface Missing {
  missing: string;
}

export type BenchResults = ResultsFile | Missing;

export const isMissing = (r: BenchResults | undefined): r is Missing => r !== undefined && 'missing' in r;

export interface FigureMoved {
  arm: string;
  measure: string;
  before: string;
  after: string;
}

export interface ValueChange {
  measure: string;
  before: number;
  after: number;
}

export interface RunDiff {
  seed: string;
  roll: number;
  /** The largest change among its measures; Infinity where a value appeared or went. */
  size: number;
  changes: ValueChange[];
}

export interface ArmRuns {
  arm: string;
  /** Runs on both sides. */
  shared: number;
  differ: RunDiff[];
  onlyBefore: number;
  onlyAfter: number;
}

export interface BenchDiff {
  name: string;
  /** Rolls of the dice on each camp, after. */
  rolls: number;
  armsOnlyBefore: string[];
  armsOnlyAfter: string[];
  measuresOnlyBefore: string[];
  measuresOnlyAfter: string[];
  figures: FigureMoved[];
  arms: ArmRuns[];
}

const same = (a: number, b: number): boolean => a === b || (Number.isNaN(a) && Number.isNaN(b));

const gap = (a: number, b: number): number => (Number.isNaN(a) !== Number.isNaN(b) ? Infinity : Math.abs(a - b));

/** Compares one bench's results on two builds: arms and measures matched by name and key, runs by seed and roll. */
export function compareBench(name: string, before: ResultsFile, after: ResultsFile): BenchDiff {
  const armNames = (f: ResultsFile): string[] => f.arms.map((a) => a.name);
  const keys = (f: ResultsFile): string[] => f.measures.map((m) => m.key);
  const sharedArms = armNames(after).filter((a) => armNames(before).includes(a));
  const sharedKeys = keys(after).filter((k) => keys(before).includes(k));
  const label = (key: string): string => (after.measures.find((m) => m.key === key) ?? before.measures.find((m) => m.key === key))!.label;

  // The figures each side's report gives, as its table prints them.
  // Each arm alone: a table's cells don't depend on the first arm, and arms may differ in their runs.
  const reportOf = (f: ResultsFile, arm: string): ArmReport => {
    const { exp, results } = fromResultsFile(f);
    return report({ ...exp, arms: exp.arms.filter((a) => a.name === arm) }, results, f.rolls)[0]!;
  };
  const figures: FigureMoved[] = [];
  for (const arm of sharedArms) {
    const [b, a] = [reportOf(before, arm), reportOf(after, arm)];
    for (const key of sharedKeys) {
      const mb = b!.measures.find((m) => m.key === key)!;
      const ma = a!.measures.find((m) => m.key === key)!;
      const [cb, ca] = [cell(mb), cell(ma)];
      if (cb !== ca) figures.push({ arm, measure: label(key), before: cb, after: ca });
    }
  }

  const arms = sharedArms.map((arm): ArmRuns => {
    const runsOf = (f: ResultsFile): Map<string, { seed: string; roll: number; values: Record<string, number> }> => new Map(f.arms.find((a) => a.name === arm)!.runs.map((r) => [`${r.seed}#${r.roll}`, r]));
    const [rb, ra] = [runsOf(before), runsOf(after)];
    const differ: RunDiff[] = [];
    let shared = 0;
    for (const [id, r] of ra) {
      const was = rb.get(id);
      if (!was) continue;
      shared++;
      const changes = sharedKeys.flatMap((key): ValueChange[] => {
        const [x, y] = [was.values[key] ?? NaN, r.values[key] ?? NaN];
        return same(x, y) ? [] : [{ measure: label(key), before: x, after: y }];
      });
      if (changes.length) differ.push({ seed: r.seed, roll: r.roll, size: Math.max(...changes.map((c) => gap(c.before, c.after))), changes });
    }
    // Largest first; then by seed and roll, which are unique within an arm.
    differ.sort((p, q) => q.size - p.size || (p.seed < q.seed ? -1 : p.seed > q.seed ? 1 : p.roll - q.roll));
    return { arm, shared, differ, onlyBefore: [...rb.keys()].filter((id) => !ra.has(id)).length, onlyAfter: [...ra.keys()].filter((id) => !rb.has(id)).length };
  });

  return {
    name,
    rolls: after.rolls,
    armsOnlyBefore: armNames(before).filter((a) => !sharedArms.includes(a)),
    armsOnlyAfter: armNames(after).filter((a) => !armNames(before).includes(a)),
    measuresOnlyBefore: keys(before).filter((k) => !sharedKeys.includes(k)).map((k) => before.measures.find((m) => m.key === k)!.label),
    measuresOnlyAfter: keys(after).filter((k) => !keys(before).includes(k)).map((k) => after.measures.find((m) => m.key === k)!.label),
    figures,
    arms,
  };
}

/** True when the two builds read the same on this bench in every way the comparison looks. */
export function unchanged(d: BenchDiff): boolean {
  return d.figures.length === 0 && d.armsOnlyBefore.length + d.armsOnlyAfter.length + d.measuresOnlyBefore.length + d.measuresOnlyAfter.length === 0 && d.arms.every((a) => a.differ.length === 0 && a.onlyBefore === 0 && a.onlyAfter === 0);
}

/** A value as a run gave it: '–' where it didn't apply. */
export function showValue(x: number): string {
  if (Number.isNaN(x)) return '–';
  if (Number.isInteger(x)) return String(x);
  return String(Number(x.toPrecision(4)));
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export interface Side {
  /** What the build was, in a few words: a commit, a ref. */
  label: string;
  benches: ReadonlyMap<string, BenchResults>;
}

/**
 * The whole comparison, as Markdown: a verdict per bench first, then the details only of
 * the benches that differ. `perArm` caps the runs listed for each arm, largest first.
 */
export function formatComparison(before: Side, after: Side, perArm = 5): string {
  const names = [...new Set([...STANDING.map((b) => b.name), ...before.benches.keys(), ...after.benches.keys()])].filter((n) => before.benches.has(n) || after.benches.has(n));
  const out = [`## Standing benches: ${before.label} → ${after.label}`, ''];
  const details: string[] = [];
  for (const name of names) {
    const [b, a] = [before.benches.get(name), after.benches.get(name)];
    if (!b || !a || isMissing(b) || isMissing(a)) {
      const why = (r: BenchResults | undefined, side: string): string => (r === undefined ? `not run ${side}` : isMissing(r) ? `not in the build ${side} (${r.missing})` : `ran ${side}`);
      out.push(`- **${name}**: ${why(b, 'before')}; ${why(a, 'after')}.`);
      continue;
    }
    const d = compareBench(name, b, a);
    const runs = d.arms.reduce((n, x) => n + x.shared, 0);
    const differ = d.arms.reduce((n, x) => n + x.differ.length, 0);
    if (unchanged(d)) {
      out.push(`- **${name}**: same, all ${plural(runs, 'run')}.`);
      continue;
    }
    const verdict = [`${plural(d.figures.length, 'figure')} moved`, `${differ} of ${plural(runs, 'run')} differ`];
    const oneSided = d.armsOnlyBefore.length + d.armsOnlyAfter.length + d.measuresOnlyBefore.length + d.measuresOnlyAfter.length;
    if (oneSided) verdict.push(`${oneSided} ${oneSided === 1 ? 'arm or measure' : 'arms or measures'} on one side only`);
    out.push(`- **${name}**: ${verdict.join(', ')}.`);
    details.push(...formatBench(d, perArm));
  }
  return [...out, '', ...details].join('\n').trimEnd() + '\n';
}

function formatBench(d: BenchDiff, perArm: number): string[] {
  const out = [`### ${d.name}`, ''];
  const only = (what: string, list: string[], side: string): void => {
    if (list.length) out.push(`${what} only ${side}: ${list.map((x) => `*${x}*`).join(', ')}.`, '');
  };
  only('Arms', d.armsOnlyBefore, 'before');
  only('Arms', d.armsOnlyAfter, 'after');
  only('Measures', d.measuresOnlyBefore, 'before');
  only('Measures', d.measuresOnlyAfter, 'after');
  if (d.figures.length) {
    out.push('Figures that moved:', '');
    for (const f of d.figures) out.push(`- ${f.arm} · ${f.measure}: ${f.before} → ${f.after}`);
    out.push('');
  }
  const arms = d.arms.filter((a) => a.differ.length || a.onlyBefore || a.onlyAfter);
  if (arms.length) {
    out.push('Runs that read differently:', '');
    for (const a of arms) {
      const extra = [a.onlyBefore ? `${a.onlyBefore} only before` : '', a.onlyAfter ? `${a.onlyAfter} only after` : ''].filter(Boolean);
      out.push(`- ${a.arm}: ${a.differ.length} of ${plural(a.shared, 'run')}${extra.length ? ` (and ${extra.join(', ')})` : ''}`);
      for (const r of a.differ.slice(0, perArm)) out.push(`  - ${r.seed}${d.rolls > 1 ? ` roll ${r.roll}` : ''}: ${r.changes.map((c) => `${c.measure} ${showValue(c.before)} → ${showValue(c.after)}`).join('; ')}`);
      if (a.differ.length > perArm) out.push(`  - and ${a.differ.length - perArm} more`);
    }
    out.push('');
  }
  return out;
}
