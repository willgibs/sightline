/**
 * Where two builds part ways, down to the system and the state path: the first tick a run
 * differs, then the first system within that tick, then what that system left different
 * ("guard:4.body.x: 12.5 → 12.75"). For a recording that won't re-simulate here, or a
 * pinned run whose golden moved.
 *
 *   npm run bisect -- --recording <file.slrec>            against the build that made it
 *   npm run bisect -- --recording <file> --base <ref>      against any commit
 *   npm run bisect -- --run "TAL-4471 wander"              a pinned run, against origin/main
 *
 * The other build runs from a temporary git worktree (builds.ts); this checkout is the
 * one being judged, uncommitted changes included.
 */
import { resolve } from 'node:path';
import { diffStates, show } from '../sim/kernel/diff';
import type { SimState } from '../sim/kernel/state';
import { parseArgs } from './args';
import { REPO, git, hasTool, tool, withBuild } from './builds';
import { Recording } from '../sim/kernel/record/recording';
import { readFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const file = args.get('recording');
const name = args.get('run');
if (!file === !name) {
  console.error('Usage: npm run bisect -- (--recording <file> | --run <pinned run>) [--base <ref>]');
  process.exit(2);
}
const source = file ? ['--recording', resolve(file)] : ['--run', name!];

let ref = args.get('base');
if (!ref && file) {
  // The build stamp is a commit, marked +local when it had uncommitted changes (headless/build.ts).
  const build = Recording.fromBytes(new Uint8Array(readFileSync(file))).header.build;
  const sha = /^([0-9a-f]{7,40})(\+local)?$/.exec(build);
  if (!sha) {
    console.error(`The recording was made by '${build || 'an unknown build'}', not a commit: pass --base <ref>`);
    process.exit(2);
  }
  if (sha[2]) console.log(`The recording was made with uncommitted changes on ${sha[1]}; comparing with ${sha[1]} itself.`);
  ref = sha[1]!;
}
ref ??= 'origin/main';
const baseSha = git('rev-parse', '--verify', `${ref}^{commit}`);
console.log(`Bisecting ${file ? `the recording ${file}` : `the pinned run '${name}'`}: ${ref} (${baseSha.slice(0, 7)}) → this checkout.\n`);

interface TickLine {
  tick: number;
  behaviour: string;
  state: string;
}
interface PhaseLine {
  system: string;
  phase: string;
  state: string;
}
const lines = <T>(text: string): T[] =>
  text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

await withBuild(baseSha, async (base) => {
  if (!hasTool(base, 'trace.ts', '--phases')) {
    console.log('That build predates `npm run trace -- --phases` (W0.8): it can be explained by tick (`npm run explain`), not bisected.');
    return;
  }
  const both = <T>(...a: string[]): Promise<[T, T]> => Promise.all([tool(base, 'trace.ts', ...source, ...a), tool(REPO, 'trace.ts', ...source, ...a)]).then(([x, y]) => [JSON.parse(x) as T, JSON.parse(y) as T]);
  const [start0, start1] = await both<SimState>('--dump', '0');
  const startDiff = diffStates(start0, start1, 12);
  if (startDiff.length > 0) {
    console.log('The runs differ before the first tick: the world or the setup moved.');
    for (const d of startDiff) console.log(`  ${d.path}: ${show(d.from)} → ${show(d.to)}`);
    return;
  }
  const [a, b] = await Promise.all([base, REPO].map(async (dir) => lines<TickLine>(await tool(dir, 'trace.ts', ...source))));
  let k = 0;
  while (k < a!.length && k < b!.length && a![k]!.state === b![k]!.state) k++;
  if (k === a!.length && k === b!.length) {
    console.log(`No difference: ${a!.length} ticks, every state the same.`);
    return;
  }
  if (k === a!.length || k === b!.length) {
    console.log(`The same for ${k} ticks; then one run ends (${a!.length} ticks against ${b!.length}).`);
    return;
  }
  const tick = b![k]!.tick;
  console.log(`First differs at tick ${tick}${a![k]!.behaviour !== b![k]!.behaviour ? ', in behaviour' : ', in state only'}.`);
  const [pa, pb] = await Promise.all([base, REPO].map(async (dir) => lines<PhaseLine>(await tool(dir, 'trace.ts', ...source, '--phases', String(tick)))));
  let s = 0;
  while (s < pa!.length && s < pb!.length && pa![s]!.system === pb![s]!.system && pa![s]!.state === pb![s]!.state) s++;
  const was = pa![s];
  const now = pb![s];
  if (!was || !now || was.system !== now.system) {
    console.log(`The systems differ at position ${s + 1} of the tick: ${was ? `'${was.system}' (${was.phase})` : 'nothing'} → ${now ? `'${now.system}' (${now.phase})` : 'nothing'}.`);
    const prior = s > 0 ? pb![s - 1]!.system : null;
    if (prior) console.log(`Up to '${prior}', the state is the same.`);
    return;
  }
  console.log(`Within it, the first system to leave a different state is '${now.system}' (${now.phase}).`);
  const [sa, sb] = await both<SimState>('--dump', String(tick), '--after', now.system);
  for (const d of diffStates(sa, sb, 16)) console.log(`  ${d.path}: ${show(d.from)} → ${show(d.to)}`);
});
