/**
 * Goldens that explain themselves: compares every pinned run (src/sim/game/runs.ts)
 * between this checkout and another build, by default origin/main, and for each run that
 * moved says the first tick it diverged, the state paths that differ there, and its
 * lane's work and metrics before and after (src/sim/game/benches.ts). CI prints it for
 * every pull request, beside the golden values the pull request rebaselined.
 *
 *   npm run explain                         against origin/main
 *   npm run explain -- --base <ref>         against any commit
 *   npm run explain -- --summary <file>     also append it as Markdown (CI's job summary)
 *
 * The other build runs from a temporary git worktree, with this checkout's node_modules.
 */
import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { diffStates, show } from '../sim/kernel/diff';
import type { SimState } from '../sim/kernel/state';
import { parseArgs } from './args';

const run = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const repo = fileURLToPath(new URL('../..', import.meta.url));
const tsx = join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const baseRef = args.get('base') ?? 'origin/main';
const lines: string[] = [];
const say = (s = ''): void => {
  lines.push(s);
  console.log(s);
};

interface TickLine {
  tick: number;
  behaviour: string;
  state: string;
}
interface Bench {
  report: Record<string, { runs: Record<string, { behaviour: string; state: string; work: Record<string, Record<string, number>> }>; metrics: Record<string, number> }>;
}

const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();

/** Runs one of a build's headless tools and returns what it printed. */
async function tool(dir: string, script: string, ...a: string[]): Promise<string> {
  const { stdout } = await run(tsx, [join('src/headless', script), ...a], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

const trace = async (dir: string, name: string): Promise<TickLine[]> =>
  (await tool(dir, 'trace.ts', '--run', name))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TickLine);
const dump = async (dir: string, name: string, tick: number): Promise<SimState> => JSON.parse(await tool(dir, 'trace.ts', '--run', name, '--dump', String(tick))) as SimState;

const baseSha = git('rev-parse', '--verify', `${baseRef}^{commit}`);
const headSha = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';
say(`## Goldens, explained: ${baseRef} (${baseSha.slice(0, 7)}) → this checkout (${headSha.slice(0, 7)}${dirty ? ', with uncommitted changes' : ''})`);
say();
if (baseSha === headSha && !dirty) {
  say('Nothing to compare: this checkout is the base.');
  finish();
}

const base = mkdtempSync(join(tmpdir(), 'sightline-base-'));
try {
  git('worktree', 'add', '--detach', '--quiet', base, baseSha);
  symlinkSync(join(repo, 'node_modules'), join(base, 'node_modules'), 'dir');
  if (!existsSync(join(base, 'src/headless/trace.ts'))) {
    say(`The base predates \`npm run trace\` (W0.7), so there is nothing to compare its runs with.`);
  } else {
    await explain();
  }
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', base], { cwd: repo });
  rmSync(base, { recursive: true, force: true });
}
finish();

async function explain(): Promise<void> {
  const [baseRuns, headRuns] = await Promise.all([base, repo].map(async (dir) => JSON.parse(await tool(dir, 'trace.ts', '--list')) as Array<{ name: string; lane: string }>));
  const benches = await Promise.all([base, repo].map(async (dir) => (existsSync(join(dir, 'src/headless/bench.ts')) ? (JSON.parse(await tool(dir, 'bench.ts', '--json')) as Bench) : null)));
  const [baseBench, headBench] = benches;
  const names = [...new Set([...baseRuns, ...headRuns].map((r) => r.name))];
  const lanesMoved = new Set<string>();
  for (const name of names) {
    const lane = (headRuns.find((r) => r.name === name) ?? baseRuns.find((r) => r.name === name))!.lane;
    if (!baseRuns.some((r) => r.name === name)) {
      say(`- **${name}** (${lane}): new in this checkout.`);
      lanesMoved.add(lane);
      continue;
    }
    if (!headRuns.some((r) => r.name === name)) {
      say(`- **${name}** (${lane}): retired in this checkout.`);
      lanesMoved.add(lane);
      continue;
    }
    const [a, b] = await Promise.all([trace(base, name), trace(repo, name)]);
    let k = 0;
    while (k < a.length && k < b.length && a[k]!.behaviour === b[k]!.behaviour && a[k]!.state === b[k]!.state) k++;
    if (k === a.length && k === b.length) {
      say(`- **${name}** (${lane}): unchanged, ${a.length} ticks.`);
      continue;
    }
    lanesMoved.add(lane);
    if (k === a.length || k === b.length) {
      say(`- **${name}** (${lane}): the same for ${k} ticks, then it ends ${a.length < b.length ? 'later' : 'sooner'} (${a.length} → ${b.length} ticks).`);
      continue;
    }
    const tick = b[k]!.tick;
    const what = a[k]!.behaviour !== b[k]!.behaviour ? 'behaviour' : 'state, not behaviour';
    say(`- **${name}** (${lane}): first diverges at tick ${tick}, in ${what}.`);
    const [sa, sb] = await Promise.all([dump(base, name, tick), dump(repo, name, tick)]);
    for (const d of diffStates(sa, sb, 12)) say(`  - \`${d.path}\`: ${show(d.from)} → ${show(d.to)}`);
  }
  say();
  if (!baseBench || !headBench) {
    say('The base has no benches (`npm run bench`), so there are no work counts or metrics to compare.');
    return;
  }
  say('### Benches');
  let any = false;
  for (const lane of Object.keys(headBench.report)) {
    const was = baseBench.report[lane];
    const now = headBench.report[lane]!;
    const changes: string[] = [];
    for (const [run, r] of Object.entries(now.runs)) {
      for (const [system, w] of Object.entries(r.work)) {
        const old = was?.runs[run]?.work[system];
        for (const kind of Object.keys(w)) if (old?.[kind] !== w[kind]) changes.push(`${run} · ${system} · ${kind}: ${old?.[kind] ?? '–'} → ${w[kind]}`);
      }
    }
    for (const [m, v] of Object.entries(now.metrics)) if (was?.metrics[m] !== v) changes.push(`${m}: ${was?.metrics[m] ?? '–'} → ${v}`);
    if (changes.length === 0 && !lanesMoved.has(lane)) continue;
    any = true;
    say(`- **${lane}**${changes.length === 0 ? ': runs moved, but its work and metrics held.' : ''}`);
    for (const c of changes) say(`  - ${c}`);
    if (changes.length > 0 || Object.keys(now.metrics).length > 0) for (const [m, v] of Object.entries(now.metrics)) if (was?.metrics[m] === v) say(`  - ${m}: ${v} (held)`);
  }
  if (!any) say('Every lane held its work and metrics.');
}

function finish(): never {
  const out = args.get('summary');
  if (out) appendFileSync(out, lines.join('\n') + '\n');
  process.exit(0);
}
