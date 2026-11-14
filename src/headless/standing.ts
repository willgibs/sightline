/**
 * The standing benches (src/lab/standing.ts), run on a build and compared run by run with
 * another: does every other bench of the camp still read as it did?
 *
 *   npm run standing -- --base origin/main            this checkout against a ref (cached by tree)
 *   npm run standing -- --out <dir>                    runs the set into <dir>
 *        [--root <dir>]                                another checkout's experiments, with this tool
 *        [--only a,b] [--shard k/n] [--jobs N]
 *   npm run standing -- --diff <dirA> <dirB> [--summary <file>]
 *
 * `--out` writes `<bench>.json` (every run's values, src/lab/results.ts) and `<bench>.txt`
 * (the report as the build's own lab prints it) for each bench, and `build.json` (the
 * root's commit, its tree, and whether its working tree was clean). A bench the root
 * doesn't have is written as `{ "missing": why }`, and the comparison says so.
 *
 * `--root` loads that checkout's lab by dynamic import (labRunner.ts), so a base that
 * predates this tool, or has an older one, is run the same way as the head. The results
 * don't depend on `--jobs` or `--shard`.
 *
 * `--base` keeps results under .cache/standing/<tree>/: a ref's tree is run once, in a
 * temporary worktree beside this checkout, and this checkout's own is cached only when its
 * working tree is clean. `--diff` exits 0 whatever differs: it informs, it doesn't judge.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { RESULTS_FORMAT, parseResults, stringifyResults } from '../lab/results';
import { choose, formatComparison, shard, type BenchResults, type Side, type StandingBench } from '../lab/standing';
import { parseArgs } from './args';
import { REPO } from './builds';
import { loadLab, runLab } from './labRunner';

interface Build {
  format: number;
  commit: string;
  tree: string;
  clean: boolean;
}

const args = parseArgs(process.argv.slice(2));
const jobs = args.has('jobs') ? Number(args.get('jobs')) : undefined;
const only = args.get('only')?.split(',').filter(Boolean);

const gitIn = (dir: string, ...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();

function buildOf(root: string): Build {
  return { format: RESULTS_FORMAT, commit: gitIn(root, 'rev-parse', 'HEAD'), tree: gitIn(root, 'rev-parse', 'HEAD^{tree}'), clean: gitIn(root, 'status', '--porcelain') === '' };
}

/** Runs `benches` of `root`'s lab into `out`, skipping any already there when `resume`. */
async function runSet(root: string, out: string, benches: readonly StandingBench[], build: Build, resume = false): Promise<void> {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'build.json'), JSON.stringify(build, null, 1) + '\n');
  const lab = await loadLab(root);
  for (const b of benches) {
    const json = join(out, `${b.name}.json`);
    if (resume && existsSync(json)) continue;
    if (!lab.experiments[b.experiment]) {
      console.log(`${b.name}: not in this build`);
      writeFileSync(json, JSON.stringify({ missing: `it has no experiment called '${b.experiment}'` }) + '\n');
      rmSync(join(out, `${b.name}.txt`), { force: true });
      continue;
    }
    process.stdout.write(`${b.name} `);
    const run = await runLab({ root, name: b.experiment, camps: b.camps, rolls: b.dice, jobs, tick: () => process.stdout.write('.') });
    const took = `${run.runs} runs on ${run.processes} processes, in ${run.seconds.toFixed(0)} s.`;
    console.log(` ${took}`);
    writeFileSync(join(out, `${b.name}.txt`), `${run.text}\n${took}\n`);
    writeFileSync(json, stringifyResults(run.file));
  }
}

/** One side of a comparison, from a results folder. Throws if it isn't one. */
function readSide(dir: string, names?: readonly string[]): Side {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`There's no results folder at ${dir}`);
  const buildPath = join(dir, 'build.json');
  const build = existsSync(buildPath) ? (JSON.parse(readFileSync(buildPath, 'utf8')) as Build) : null;
  const benches = new Map<string, BenchResults>();
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f === 'build.json') continue;
    const name = f.slice(0, -'.json'.length);
    if (names && !names.includes(name)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    const raw = JSON.parse(text) as { missing?: string };
    benches.set(name, typeof raw.missing === 'string' ? { missing: raw.missing } : parseResults(text));
  }
  const label = build ? `${basename(resolve(dir))} (${build.commit.slice(0, 7)}${build.clean ? '' : ', with uncommitted changes'})` : basename(resolve(dir));
  return { label, benches };
}

function diff(a: string, b: string, names?: readonly string[], labels?: [string, string]): void {
  let text: string;
  try {
    const [before, after] = [readSide(a, names), readSide(b, names)];
    if (labels) [before.label, after.label] = labels;
    text = formatComparison(before, after);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  console.log(text);
  const summary = args.get('summary');
  if (summary) appendFileSync(summary, text + '\n');
}

/** A ref's results, from the cache or run now in a temporary worktree of it. */
async function resultsOfRef(ref: string, benches: readonly StandingBench[]): Promise<string> {
  const commit = gitIn(REPO, 'rev-parse', '--verify', `${ref}^{commit}`);
  const tree = gitIn(REPO, 'rev-parse', `${commit}^{tree}`);
  const cache = join(REPO, '.cache/standing', tree);
  const todo = benches.filter((b) => !existsSync(join(cache, `${b.name}.json`)));
  if (todo.length === 0 && cached(cache)) {
    console.log(`${ref}: cached (${tree.slice(0, 7)}).`);
    return cache;
  }
  if (!cached(cache)) rmSync(cache, { recursive: true, force: true });
  const dir = join(REPO, '.cache/standing', `worktree-${tree.slice(0, 12)}`);
  rmSync(dir, { recursive: true, force: true });
  gitIn(REPO, 'worktree', 'prune');
  console.log(`${ref} (${commit.slice(0, 7)}): running ${todo.map((b) => b.name).join(', ')} in a temporary worktree.`);
  try {
    gitIn(REPO, 'worktree', 'add', '--detach', '--quiet', dir, commit);
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await runSet(dir, cache, benches, { format: RESULTS_FORMAT, commit, tree, clean: true }, true);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO, stdio: 'ignore' });
    } catch {
      // Already gone; prune below.
    }
    rmSync(dir, { recursive: true, force: true });
    gitIn(REPO, 'worktree', 'prune');
  }
  return cache;
}

/** A cache folder written by this format of results. */
function cached(dir: string): boolean {
  try {
    return (JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8')) as Build).format === RESULTS_FORMAT;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (args.has('diff')) {
    const at = process.argv.indexOf('--diff');
    const [a, b] = process.argv.slice(at + 1, at + 3);
    if (!a || !b || a.startsWith('--') || b.startsWith('--')) throw new Error('--diff takes two results folders');
    diff(a, b);
    return;
  }
  let benches = choose(only);
  const shardArg = args.get('shard');
  if (shardArg) {
    const [k, n] = shardArg.split('/').map(Number);
    benches = shard(benches, k!, n!);
  }
  if (args.has('base')) {
    const ref = args.get('base')!;
    const base = await resultsOfRef(ref, benches);
    const here = buildOf(REPO);
    const mine = here.clean ? join(REPO, '.cache/standing', here.tree) : join(REPO, '.cache/standing/working');
    if (!here.clean || !cached(mine)) rmSync(mine, { recursive: true, force: true });
    if (here.clean && benches.every((b) => existsSync(join(mine, `${b.name}.json`)))) console.log(`This checkout: cached (${here.tree.slice(0, 7)}).`);
    else {
      console.log(`This checkout (${here.commit.slice(0, 7)}${here.clean ? '' : ', with uncommitted changes'}):`);
      await runSet(REPO, mine, benches, here, here.clean);
    }
    console.log();
    const names = benches.map((b) => b.name);
    diff(base, mine, names, [`${ref} (${gitIn(REPO, 'rev-parse', '--short', `${ref}^{commit}`)})`, `this checkout (${here.commit.slice(0, 7)}${here.clean ? '' : ', with uncommitted changes'})`]);
    return;
  }
  const out = args.get('out');
  if (!out) {
    console.log('npm run standing -- --base <ref> | --out <dir> [--root <dir>] [--only a,b] [--shard k/n] [--jobs N] | --diff <dirA> <dirB> [--summary <file>]');
    console.log(`The set: ${choose().map((b) => b.name).join(', ')}.`);
    return;
  }
  const root = resolve(args.get('root') ?? REPO);
  const started = performance.now();
  await runSet(root, resolve(out), benches, buildOf(root));
  console.log(`${benches.length} benches in ${((performance.now() - started) / 1000).toFixed(0)} s.`);
}

await main();
