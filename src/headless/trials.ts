/**
 * A sitting of trial mode (A12), printed, and pictured for the agents' pre-screen.
 *
 *   npm run trials -- <seed>             each trial: its brief, freeze, cell, key, the factors
 *                                        that flip it, and the cues the simulation says show
 *   npm run trials -- <seed> --shots     and every trial's freeze frame, drawn by the honest
 *                                        view, in shots/trials/<seed>/, with manifest.json
 *
 * The pre-screen (docs/phase-1-plan.md, Exit tests · A) is an agent looking at those frames
 * for cues the simulation shows to be missing. It starts with a perception check: the
 * manifest holds what the simulation recorded for each frame (whether the indicator shows,
 * where the guard's eyes are drawn, whether his head can be read), and the agent's
 * findings count only once it reads a handful of frames right. Even then they never count
 * toward the pass, and a trial is dropped only where the simulation itself shows a cue
 * absent, hidden or under the pixel threshold: the generator does that (Trial.legible in
 * sim/game/trials.ts). What the agent can add is a frame where the view and the simulation
 * disagree: a cue drawn where it shouldn't be, or hidden where the simulation says it shows.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultTuning } from '../config/tuning';
import { CELL_NAMES, cellOfTrial, generateSitting, type Trial } from '../sim/game/trials';
import { openGame } from './browser';

const args = process.argv.slice(2);
const seed = args.find((a) => !a.startsWith('--'));
if (!seed) {
  console.error('\nnpm run trials -- <seed> [--shots]\n');
  process.exit(2);
}
const shots = args.includes('--shots');

const t0 = performance.now();
const trials = generateSitting(seed, defaultTuning);
console.log(`\nSitting ${seed} · ${trials.length} trials, generated in ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);
for (const t of trials) console.log(row(t));

if (shots) await picture(seed, trials);

function row(t: Trial): string {
  const label = t.warmup ? `warm-up ${t.k + 1}` : `trial ${t.k - trials.filter((x) => x.warmup).length + 1}`;
  const cues = Object.entries(t.legible)
    .filter(([, on]) => on)
    .map(([c]) => c);
  const key = t.seen ? `seen at ${t.seenAt.toFixed(1)} s` : 'not seen';
  return [
    `${label.padEnd(11)} ${t.brief}`,
    `            ${t.freeze === 'cue' ? `frozen at the first cue (${t.cueAt.toFixed(1)} s)` : 'frozen at the start'} · ${key} · ${CELL_NAMES[cellOfTrial(t)]}` +
      (t.flips.length ? ` · flips with ${t.flips.join(', ')}` : '') +
      ` · cues: ${cues.join(', ') || 'none'} · ${t.params}`,
  ].join('\n');
}

/** Plays the sitting in a headless browser, answering from the key, and keeps each freeze frame. */
async function picture(seed: string, trials: readonly Trial[]): Promise<void> {
  const dir = join('shots', 'trials', seed);
  mkdirSync(dir, { recursive: true });
  const g = await openGame({ query: `trials=${encodeURIComponent(seed)}`, width: 1280, height: 720 });
  const manifest: unknown[] = [];
  try {
    await g.until(`sightline.trial()?.phase === 'ready'`, 120_000);
    await g.run('sightline.play()');
    for (let step = 0; step < 4000; step++) {
      const st = await g.run<{ phase: string; trial: number }>('sightline.trial()');
      if (st.phase === 'done') break;
      if (st.phase === 'asking') {
        const t = trials[st.trial]!;
        const file = `${String(t.k).padStart(2, '0')}-${t.freeze}.png`;
        await g.page.screenshot({ path: join(dir, file) });
        // What the simulation records at the freeze, for the perception check.
        const sim = await g.run<{ meter: number; state: string; eye: { x: number; y: number; z: number } } | undefined>('sightline.perception()[0]');
        const eye = sim ? await g.run<{ x: number; y: number } | null>(`sightline.onScreen(${sim.eye.x}, ${sim.eye.y}, ${sim.eye.z})`) : null;
        manifest.push({
          file,
          k: t.k,
          warmup: t.warmup,
          brief: t.brief,
          freeze: t.freeze,
          // The indicator shows once his meter reaches the cue (30%).
          indicator: (sim?.meter ?? 0) >= defaultTuning.perception.sight.cue,
          meter: sim ? Math.round(sim.meter * 100) / 100 : null,
          awareness: sim?.state ?? null,
          guardEyesOnScreen: eye ? { x: Math.round(eye.x), y: Math.round(eye.y) } : null,
          legible: t.legible,
          seen: t.seen,
        });
        await g.run(`sightline.answer(${t.seen})`);
      } else if (st.phase === 'outcome') await g.run(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))`);
      else await g.page.waitForTimeout(200);
    }
    await g.page.screenshot({ path: join(dir, 'results.png') });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ seed, frames: manifest }, null, 2));
    console.log(`\n${manifest.length} freeze frames and the results in ${dir}${g.errors.length ? ` · page errors: ${g.errors.join(' | ')}` : ''}\n`);
  } finally {
    await g.close();
  }
}
