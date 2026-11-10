/**
 * Where a fight's ticks go, and which of them a player would feel.
 *
 * A tick has 33 ms and takes a tenth of one on average, so the average says nothing: what a
 * player feels is the one tick in a thousand that takes fifty. This runs scenes with their
 * own drivers and reports the slow ticks: how many, which, in which system, and the work
 * that system did there (grid cells, rays), which is the same on every machine.
 *
 *   npm run hitches                                    the standing fights: a sniper on two camps, relaxed and alert
 *   npm run hitches -- compound 'seed=LEB-2534&attack=relocating'
 *   npm run hitches -- takedown
 *     --runs 3          warm runs after the first; a tick's time is the least of them
 *     --over 4          list the ticks slower than this, ms
 *     --no-rehearsal    time the first run as a tab would find it without the rehearsal the game runs at load
 *
 * Two things make its times worth reading:
 * - Each scene runs in a process of its own, so its first run is as cold as a tab's.
 * - The code is built the way the game's is. Run straight from source, every function is
 *   wrapped to keep its name, which makes code that builds closures look far slower than it
 *   is in a browser.
 * Times are still this machine's, on this day. The work counts are not, and
 * `npm run bench` pins the ones that matter.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { parseArgs } from './args';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--') && !argv[i - 1]!.includes('=') && !['--no-rehearsal'].includes(argv[i - 1]!)));
const STANDING: ReadonlyArray<readonly [string, string]> = [
  ['compound', 'seed=LEB-2534&attack=sniper'],
  ['compound', 'seed=LEB-2534&attack=sniper&ready=alert'],
  ['compound', 'seed=HOT-7106&attack=relocating'],
  ['compound', 'seed=HOT-7106&attack=relocating&ready=alert'],
];
const scenes: ReadonlyArray<readonly [string, string]> = named.length > 0 ? [[named[0]!, named[1] ?? '']] : STANDING;

const root = path.resolve(import.meta.dirname, '../..');
const out = mkdtempSync(path.join(tmpdir(), 'sightline-hitches-'));
try {
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    build: { ssr: path.join(root, 'src/headless/hitchRun.ts'), outDir: out, minify: false, target: 'node22', emptyOutDir: true, rollupOptions: { output: { format: 'esm', entryFileNames: 'hitchRun.mjs' } } },
  });
  let failed = false;
  for (const [name, params] of scenes) {
    const r = spawnSync(process.execPath, [path.join(out, 'hitchRun.mjs'), name, params, args.get('runs') ?? '3', args.get('over') ?? '4', args.has('no-rehearsal') ? '0' : '1'], { stdio: 'inherit' });
    if (r.status !== 0) failed = true;
    console.log('');
  }
  if (failed) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
