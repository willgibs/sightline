import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { startScene } from '../src/sim/kernel/scene';
import { Recorder } from '../src/sim/kernel/record/recording';
import { sightScenario } from '../src/sim/game/scenes/sightScenario';
import { SITTING, generateSitting, type Trial } from '../src/sim/game/trials';
import { answersIn, reportSittings, type KeptAnswer } from '../src/headless/sittings';

/**
 * `npm run playtest` scores sittings of trial mode (A12) from what a playtest kept: each
 * trial's recording with its answer, or the sitting's file. Here two sittings are played
 * the way the browser plays them, each trial recorded with its answer as an annotation;
 * other readers' answers are the same recordings with the answer changed.
 */
const made = new Map<string, Trial[]>();
/** A sitting from its seed, made once (the tests' tuning is always the default). */
const sitting = (seed: string, _tuning: Tuning = T): Trial[] => {
  if (!made.has(seed)) made.set(seed, generateSitting(seed, T));
  return structuredClone(made.get(seed)!);
};

const played = new Map<string, KeptAnswer[]>();
/** Each trial of a sitting run and recorded once, answered from the key. */
function play(seed: string): KeptAnswer[] {
  if (played.has(seed)) return played.get(seed)!;
  const kept: KeptAnswer[] = [];
  for (const t of sitting(seed)) {
    const scene = sightScenario(t.params);
    const sim = startScene(scene, T);
    const recorder = new Recorder(sim, 'test');
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    recorder.annotate('trial-answer', JSON.stringify({ sitting: seed, k: t.k, warmup: t.warmup, freeze: t.freeze, answer: t.seen, params: t.params }));
    for (let i = 0, seen = false; i < SITTING.seconds * T.sim.tickHz && !seen; i++) {
      const events = sim.step(driver.next(sim, raw));
      recorder.record(sim, events);
      seen = events.some((e) => e.type === 'detected');
    }
    const rec = recorder.finish(sim);
    kept.push(...answersIn(`trial-${t.k}.slrec`, rec.annotations(), rec.readEvents(), rec.header.tuning));
  }
  played.set(seed, kept);
  return kept;
}

/** The same recordings, answered by another reader. */
const answeredBy = (seed: string, f: (t: Trial) => boolean): KeptAnswer[] => play(seed).map((a) => ({ ...a, answer: f(sitting(seed)[a.k]!) }));

/** What reportSittings prints, and what it returns. */
function report(kept: readonly KeptAnswer[], files: { name: string; text: string }[] = []): { ok: boolean; text: string } {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
  const ok = reportSittings(kept, files, T, sitting);
  vi.restoreAllMocks();
  return { ok, text: lines.join('\n') };
}

describe('sittings scored from their recordings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('score each sitting, and give the verdict over two', () => {
    const a = play('PLAYTEST-A');
    // Each recording shows what the key says.
    expect(a.every((x) => x.seen === sitting('PLAYTEST-A')[x.k]!.seen)).toBe(true);
    const r = report([...a, ...play('PLAYTEST-B')]);
    expect(r.ok, r.text).toBe(true);
    expect(r.text).toMatch(/Sitting PLAYTEST-A · from 35 recordings · 30 of 30 scored trials answered\n {2}score {5}100% balanced \(30 of 30 right\) · borderline 15 of 15, the table alone 7/);
    expect(r.text).toMatch(/The exit test over sittings PLAYTEST-A and PLAYTEST-B: ✓ passes/);
  });

  it('fail a reader who answers by the sight table', () => {
    const r = report([...answeredBy('PLAYTEST-A', (t) => t.rules), ...answeredBy('PLAYTEST-B', (t) => t.rules)]);
    expect(r.text).toMatch(/✗ doesn’t pass/);
    expect(r.text).toMatch(/14 of 30 borderline right, under 70%/);
  });

  it('say so when a recording is of a different trial than its seed makes', () => {
    const kept = play('PLAYTEST-A').map((a) => (a.k === 7 ? { ...a, params: a.params.replace(/d=(\d+)/, (_, d: string) => `d=${Number(d) + 1}`) } : a));
    const r = report(kept);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/trial 7 \(trial-7\.slrec\): this build makes a different trial from the seed/);
    expect(r.text).toMatch(/29 of 30 scored trials answered \(incomplete\)/);
  });

  it('score a sitting file the same way, checked against its seed', () => {
    const trials = sitting('PLAYTEST-A');
    const file = { format: 'sightline-sitting', version: 1, seed: 'PLAYTEST-A', trials, answers: Object.fromEntries(trials.map((t) => [t.k, t.seen])), tuning: T };
    const r = report([], [{ name: 'sitting-PLAYTEST-A.json', text: JSON.stringify(file) }]);
    expect(r.ok, r.text).toBe(true);
    expect(r.text).toMatch(/Sitting PLAYTEST-A · from sitting-PLAYTEST-A\.json · 30 of 30 scored trials answered\n {2}score {5}100% balanced/);
    // A file whose key was changed after the fact doesn't check out.
    trials[9]!.seen = !trials[9]!.seen;
    const bad = report([], [{ name: 'sitting-PLAYTEST-A.json', text: JSON.stringify({ ...file, trials }) }]);
    expect(bad.ok).toBe(false);
    expect(bad.text).toMatch(/1 of 35 trials differ from the seed's/);
  });
});
