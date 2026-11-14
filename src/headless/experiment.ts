/**
 * Runs an experiment from the lab bench (src/lab): the same camps, several ways, compared
 * seed by seed.
 *
 *   npm run experiment                              lists them
 *   npm run experiment -- <name>                    runs one
 *   npm run experiment -- <name> --camps 60         over more camps
 *   npm run experiment -- <name> --dice 5           each camp five times, with other luck
 *   npm run experiment -- <name> --jobs 4           on this many processes
 *   npm run experiment -- <name> --json <file>      also every run's values, as data (src/lab/results.ts)
 *
 * The work is shared among processes by labRunner.ts, and the results are the same however
 * it's divided.
 */
import { writeFileSync } from 'node:fs';
import { EXPERIMENTS } from '../lab/experiments';
import { stringifyResults } from '../lab/results';
import { parseArgs } from './args';
import { REPO } from './builds';
import { runLab } from './labRunner';

const args = parseArgs(process.argv.slice(2));
const name = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
if (!name) {
  console.log('\nExperiments:\n');
  for (const e of Object.values(EXPERIMENTS)) console.log(`  ${e.name.padEnd(16)} ${e.about} (${e.camps} camps)`);
  console.log('\nnpm run experiment -- <name> [--camps N] [--dice N] [--jobs N] [--json <file>]\n');
} else {
  const number = (key: string): number | undefined => (args.has(key) ? Number(args.get(key)) : undefined);
  const run = await runLab({ root: REPO, name, camps: number('camps'), rolls: number('dice'), jobs: number('jobs'), tick: () => process.stdout.write('.') });
  process.stdout.write('\n');
  console.log(`\n${run.text}`);
  console.log(`${run.runs} runs on ${run.processes} processes, in ${run.seconds.toFixed(0)} s.\n`);
  const json = args.get('json');
  if (json) writeFileSync(json, stringifyResults(run.file));
}
