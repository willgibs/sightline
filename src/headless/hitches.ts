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
 *     --tick 3257       profile that one tick, in the first run and in a warm one: the functions it spent its time in, side by side
 *     --deopts          list the functions the engine threw its fast code away for during the first run, by hundred ticks
 *
 * The last two are for a tick that is slow the first time only. Usually that is code running
 * for the first time. Sometimes it is code that was fast, met something it hadn't seen (a
 * route of a new kind, a body of a new shape), and runs slowly until the engine has compiled
 * it again: `--tick` shows which function, and `--deopts` what happened to it and when. The
 * cure for both is the rehearsal (game/rehearsal.ts): have it happen at load.
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
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { parseArgs } from './args';
import { HITCH_MARK } from './hitchMark';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--') && !argv[i - 1]!.includes('=') && !['--no-rehearsal', '--deopts'].includes(argv[i - 1]!)));
const STANDING: ReadonlyArray<readonly [string, string]> = [
  ['compound', 'seed=LEB-2534&attack=sniper'],
  ['compound', 'seed=LEB-2534&attack=sniper&ready=alert'],
  ['compound', 'seed=HOT-7106&attack=relocating'],
  ['compound', 'seed=HOT-7106&attack=relocating&ready=alert'],
];
const scenes: ReadonlyArray<readonly [string, string]> = named.length > 0 ? [[named[0]!, named[1] ?? '']] : STANDING;

/** Ticks to a line of the `--deopts` list. */
const WINDOW = 100;

/**
 * A traced run's output: its own lines as they were, then the functions whose fast code the
 * engine threw away during the first run, by window of ticks. Each is named with the
 * engine's reason, which says what the code met that it wasn't compiled for.
 */
function report(text: string): void {
  const windows = new Map<number, Map<string, number>>();
  let at = -1;
  let before = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith(HITCH_MARK)) {
      const tick = /tick (\d+)/.exec(line);
      at = tick ? Number(tick[1]) : -2;
      continue;
    }
    // The engine's own lines: a function deoptimized where it stood, or marked to be because something it relied on changed.
    const thrown = /^\[bailout \(kind: [^,]+, reason: (.*?)\): begin\. deoptimizing [^<]*<JSFunction ([^ >(]*)/.exec(line);
    const dependent = thrown ? null : /^\[marking dependent code [^<]*<Code [^>]*> \([^<]*<SharedFunctionInfo ?([^>]*)>\).*reason: ([^\]]+)\]/.exec(line);
    if (thrown || dependent) {
      if (at === -1) before++;
      if (at < 0) continue;
      const what = thrown ? `${thrown[2] || '(no name)'} (${thrown[1]})` : `${dependent![1] || '(no name)'} (${dependent![2]})`;
      const w = windows.get(at) ?? new Map<string, number>();
      w.set(what, (w.get(what) ?? 0) + 1);
      windows.set(at, w);
    } else if (!line.startsWith('[') && line !== '') console.log(line);
  }
  console.log(`  fast code the engine threw away (the trace itself slows a run a little): ${before} times in the rehearsal, and in the first run, by ${WINDOW} ticks:`);
  for (const [tick, w] of [...windows.entries()].sort((a, b) => a[0] - b[0])) {
    const names = [...w.entries()].map(([what, n]) => (n > 1 ? `${what} ×${n}` : what));
    // Wrapped: the tick a relief arrives throws away thirty at once.
    const lines: string[] = [];
    for (const name of names) {
      const last = lines.length - 1;
      if (last >= 0 && lines[last]!.length + name.length < 130) lines[last] += ` · ${name}`;
      else lines.push(name);
    }
    lines.forEach((l, k) => console.log(`    ${(k === 0 ? `${tick}–${tick + WINDOW - 1}` : '').padEnd(11)} ${l}`));
  }
  if (windows.size === 0) console.log('    none');
}

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
  const deopts = args.has('deopts');
  const env = { ...process.env, HITCH_TICK: args.get('tick') ?? '', HITCH_MARK: deopts ? String(WINDOW) : '' };
  for (const [name, params] of scenes) {
    const run = [path.join(out, 'hitchRun.mjs'), name, params, args.get('runs') ?? '3', args.get('over') ?? '4', args.has('no-rehearsal') ? '0' : '1'];
    if (!deopts) {
      if (spawnSync(process.execPath, run, { stdio: 'inherit', env }).status !== 0) failed = true;
    } else {
      // The engine writes its trace to the run's own output, between the run's lines: to a file, where both land in the order they were written.
      const log = path.join(out, 'trace.txt');
      const fd = openSync(log, 'w');
      const r = spawnSync(process.execPath, ['--trace-deopt', ...run], { stdio: ['ignore', fd, 'inherit'], env });
      closeSync(fd);
      if (r.status !== 0) failed = true;
      report(readFileSync(log, 'utf8'));
    }
    console.log('');
  }
  if (failed) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
