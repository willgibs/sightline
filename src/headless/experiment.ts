/**
 * Runs an experiment from the lab bench (src/lab): the same camps, several ways, compared
 * seed by seed.
 *
 *   npm run experiment                              lists them
 *   npm run experiment -- <name>                    runs one
 *   npm run experiment -- <name> --camps 60         over more camps
 *   npm run experiment -- <name> --dice 5           each camp five times, with other luck
 *   npm run experiment -- <name> --jobs 4           on this many processes
 *
 * Each run is independent, so the work is shared among processes and the results are the
 * same however it's divided.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defaultTuning } from '../config/tuning';
import { formatReport, report, seedsOf, tournament, withDice, type RunResult } from '../lab/experiment';
import { EXPERIMENTS } from '../lab/experiments';
import { parseArgs } from './args';

interface Job {
  id: number;
  experiment: string;
  seed: string;
  arm: number;
  dice: number;
}

interface Done {
  id: number;
  result: RunResult;
}

if (process.env.LAB_WORKER) worker();
else await main();

/** A worker: takes one job at a time from the parent. */
function worker(): void {
  process.on('message', (job: Job) => {
    const exp = EXPERIMENTS[job.experiment]!;
    process.send!({ id: job.id, result: exp.run(job.seed, exp.arms[job.arm]!, withDice(defaultTuning, job.dice)) } satisfies Done);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const name = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
  if (!name) {
    console.log('\nExperiments:\n');
    for (const e of Object.values(EXPERIMENTS)) console.log(`  ${e.name.padEnd(16)} ${e.about} (${e.camps} camps)`);
    console.log('\nnpm run experiment -- <name> [--camps N] [--dice N] [--jobs N]\n');
    return;
  }
  const exp = EXPERIMENTS[name];
  if (!exp) throw new Error(`There's no experiment called '${name}': there's ${Object.keys(EXPERIMENTS).join(', ')}`);
  const count = Number(args.get('camps') ?? exp.camps);
  const rolls = Number(args.get('dice') ?? 1);
  if (!Number.isInteger(rolls) || rolls < 1) throw new Error(`--dice takes how many rolls, not '${args.get('dice')}'`);
  const seeds = seedsOf(exp.series, count);
  const dice = Array.from({ length: rolls }, (_, k) => k);
  const jobs: Job[] = exp.arms.flatMap((_, arm) => seeds.flatMap((seed) => dice.map((d) => ({ experiment: name, seed, arm, dice: d })))).map((j, id) => ({ ...j, id }));
  const size = Math.max(1, Math.min(Number(args.get('jobs') ?? Math.max(1, availableParallelism() - 2)), jobs.length));
  const started = performance.now();
  const results = new Array<RunResult>(jobs.length);
  await share(jobs, size, results);
  // Back to arms, each in the order of the seeds and their rolls, whichever process finished what first.
  const byArm = new Map(exp.arms.map((arm, a) => [arm.name, jobs.filter((j) => j.arm === a).map((j) => results[j.id]!)]));
  console.log(`\n${formatReport(exp, report(exp, byArm, rolls), count, rolls, tournament(exp, byArm, rolls))}`);
  console.log(`${jobs.length} runs on ${size} processes, in ${((performance.now() - started) / 1000).toFixed(0)} s.\n`);
}

/** Hands the jobs out to `size` processes, each taking the next as it finishes. */
function share(jobs: readonly Job[], size: number, results: RunResult[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let next = 0;
    let finished = 0;
    const children: ChildProcess[] = [];
    const give = (child: ChildProcess): void => {
      if (next < jobs.length) child.send(jobs[next++]!);
    };
    for (let k = 0; k < size; k++) {
      const child = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, LAB_WORKER: '1' } });
      children.push(child);
      child.on('message', (d: Done) => {
        results[d.id] = d.result;
        process.stdout.write('.');
        if (++finished === jobs.length) {
          for (const c of children) c.kill();
          process.stdout.write('\n');
          resolve();
        } else give(child);
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code && finished < jobs.length) reject(new Error(`A worker stopped with code ${code}`));
      });
      give(child);
    }
  });
}
