/**
 * Runs one experiment of the lab bench on worker processes, from any checkout's source
 * (`npm run experiment`, `npm run standing`).
 *
 * `root` is the checkout whose experiments, tuning and seeds are run: its
 * src/lab/experiments/index.ts, src/lab/experiment.ts and src/config/tuning.ts are loaded
 * by dynamic import, in the parent and in every worker. So this checkout's tools can run
 * another build's camps, a build that may not have these tools or has older ones; only
 * plain data crosses between the two.
 *
 * Each run is independent, so the work is shared among processes and the results are the
 * same however it's divided. A process is handed all of one camp's runs together, so an
 * experiment that keeps its world between runs (src/lab/worlds.ts) builds each camp once.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Tuning } from '../config/tuning';
import type { Experiment, Results, RunResult } from '../lab/experiment';
import { formatReport, report } from '../lab/experiment';
import { toResultsFile, type ResultsFile } from '../lab/results';

interface Job {
  id: number;
  seed: string;
  arm: number;
  dice: number;
}

interface Done {
  id: number;
  result: RunResult;
}

/** What a checkout's lab offers, as loaded from its source. */
interface Lab {
  experiments: Readonly<Record<string, Experiment>>;
  tuning: Tuning;
  seedsOf(series: string, count: number): string[];
  withDice(tuning: Tuning, dice: number): Tuning;
  report?: typeof report;
  formatReport?: typeof formatReport;
  tournament?: (exp: Experiment, results: Results, rolls: number) => unknown;
}

const labs = new Map<string, Promise<Lab>>();

/** Loads a checkout's lab: its experiments, its tuning and its seeds. */
export function loadLab(root: string): Promise<Lab> {
  const dir = resolve(root);
  let lab = labs.get(dir);
  if (!lab) {
    const load = (path: string): Promise<Record<string, unknown>> => import(pathToFileURL(join(dir, path)).href) as Promise<Record<string, unknown>>;
    lab = Promise.all([load('src/lab/experiments/index.ts'), load('src/lab/experiment.ts'), load('src/config/tuning.ts')]).then(([index, experiment, tuning]) => ({
      experiments: index.EXPERIMENTS as Lab['experiments'],
      tuning: tuning.defaultTuning as Tuning,
      seedsOf: experiment.seedsOf as Lab['seedsOf'],
      withDice: experiment.withDice as Lab['withDice'],
      report: experiment.report as Lab['report'],
      formatReport: experiment.formatReport as Lab['formatReport'],
      tournament: experiment.tournament as Lab['tournament'],
    }));
    labs.set(dir, lab);
  }
  return lab;
}

export interface LabRun {
  file: ResultsFile;
  /** The report as the root's own lab prints it (this checkout's, if the root's can't). */
  text: string;
  runs: number;
  processes: number;
  seconds: number;
}

export interface LabOptions {
  root: string;
  name: string;
  camps?: number;
  rolls?: number;
  jobs?: number;
  /** Called as each run finishes. */
  tick?: () => void;
  /**
   * Only part of the camps: those whose place in the list leaves `index` when divided by
   * `count` (a dear bench split across CI's machines, src/lab/standing.ts, `shard`). Every
   * run is independent, so the parts together are the whole run for run (`mergeParts`).
   */
  part?: { index: number; count: number };
}

/** Runs one experiment of `root`'s lab. Throws if there's no such experiment there. */
export async function runLab(o: LabOptions): Promise<LabRun> {
  const lab = await loadLab(o.root);
  const exp = lab.experiments[o.name];
  if (!exp) throw new Error(`There's no experiment called '${o.name}': there's ${Object.keys(lab.experiments).join(', ')}`);
  const count = o.camps ?? exp.camps;
  const rolls = o.rolls ?? 1;
  if (!Number.isInteger(rolls) || rolls < 1) throw new Error(`--dice takes how many rolls, not '${rolls}'`);
  const part = o.part;
  if (part && !(Number.isInteger(part.count) && part.count >= 1 && Number.isInteger(part.index) && part.index >= 0 && part.index < part.count)) throw new Error(`a part is index/count with 0 ≤ index < count, not ${part.index}/${part.count}`);
  const seeds = lab.seedsOf(exp.series, count).filter((_, i) => !part || i % part.count === part.index);
  const dice = Array.from({ length: rolls }, (_, k) => k);
  // Camp by camp: each camp's runs are one block, which one process takes whole.
  const jobs: Job[] = seeds.flatMap((seed) => exp.arms.flatMap((_, arm) => dice.map((d) => ({ seed, arm, dice: d })))).map((j, id) => ({ ...j, id }));
  const blocks = seeds.map((seed) => jobs.filter((j) => j.seed === seed));
  const size = Math.max(1, Math.min(o.jobs ?? Math.max(1, availableParallelism() - 2), blocks.length));
  const started = performance.now();
  const results = new Array<RunResult>(jobs.length);
  // A part can hold no camps at all; with nothing to share out, no process would ever report back.
  if (jobs.length > 0) await share(resolve(o.root), o.name, blocks, size, results, o.tick ?? (() => {}));
  // Back to arms, each in the order of the seeds and their rolls, whichever process finished what first.
  const byArm: Results = new Map(exp.arms.map((arm, a) => [arm.name, jobs.filter((j) => j.arm === a).map((j) => results[j.id]!)]));
  let text: string;
  if (jobs.length === 0) text = 'No camps fell in this part.';
  else try {
    const best = lab.tournament ? lab.tournament(exp, byArm, rolls) : null;
    text = (lab.formatReport ?? formatReport)(exp, (lab.report ?? report)(exp, byArm, rolls), seeds.length, rolls, best as never);
  } catch {
    text = formatReport(exp, report(exp, byArm, rolls), seeds.length, rolls);
  }
  if (part) text = `Part ${part.index + 1} of ${part.count} of the camps.\n${text}`;
  return { file: toResultsFile(exp, seeds, rolls, byArm), text, runs: jobs.length, processes: size, seconds: (performance.now() - started) / 1000 };
}

/** Hands the blocks of jobs out to `size` processes: each works through a block a job at a time, then takes the next block. */
function share(root: string, name: string, blocks: ReadonlyArray<readonly Job[]>, size: number, results: RunResult[], tick: () => void): Promise<void> {
  const total = blocks.reduce((n, b) => n + b.length, 0);
  return new Promise((done, reject) => {
    let next = 0;
    let finished = 0;
    let failed = false;
    const children: ChildProcess[] = [];
    const mine = new Map<ChildProcess, Job[]>();
    const fail = (e: Error): void => {
      if (failed) return;
      failed = true;
      for (const c of children) c.kill();
      reject(e);
    };
    const give = (child: ChildProcess): void => {
      let queue = mine.get(child);
      if (!queue || queue.length === 0) {
        if (next >= blocks.length) return;
        queue = [...blocks[next++]!];
        mine.set(child, queue);
      }
      child.send(queue.shift()!);
    };
    for (let k = 0; k < size; k++) {
      const child = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, LAB_WORKER: '1', LAB_ROOT: root, LAB_EXPERIMENT: name } });
      children.push(child);
      child.on('message', (d: Done | { error: string }) => {
        if ('error' in d) return fail(new Error(`A run failed in ${name}: ${d.error}`));
        results[d.id] = d.result;
        tick();
        if (++finished === total) {
          for (const c of children) c.kill();
          done();
        } else give(child);
      });
      child.on('error', fail);
      child.on('exit', (code) => {
        if (code && finished < total) fail(new Error(`A worker stopped with code ${code}`));
      });
      give(child);
    }
  });
}

/** A worker: takes one job at a time from the parent, and runs it in the root's lab. */
function worker(): void {
  const lab = loadLab(process.env.LAB_ROOT!);
  const name = process.env.LAB_EXPERIMENT!;
  process.on('message', (job: Job) => {
    void lab
      .then((l) => {
        const exp = l.experiments[name]!;
        process.send!({ id: job.id, result: exp.run(job.seed, exp.arms[job.arm]!, l.withDice(l.tuning, job.dice)) } satisfies Done);
      })
      .catch((e: unknown) => process.send!({ error: e instanceof Error ? (e.stack ?? e.message) : String(e) }));
  });
}

// The parent never has LAB_WORKER set; the processes it forks from this file do.
if (process.env.LAB_WORKER) worker();
