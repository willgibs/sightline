import { describe, expect, it } from 'vitest';
import { SoundEngine } from '../../src/audio/engine';
import { defaultTuning as T } from '../../src/config/tuning';
import type { EngineEvent, SimEvent } from '../../src/sim/kernel/events';

/**
 * A vehicle's engine (game/escape.ts, audio/shotVoices.ts `motor`), rendered offline and
 * measured. The simulation says an engine is running every couple of seconds, and each time
 * is a stretch of sound: what has to be true is that they join into one, with no gap to hear
 * between them, that a start can be told from a run, and that it fades with distance like
 * anything else.
 */

const RATE = 48000;
const AT = 0.3;
const C = 343;
const EVERY = T.brain.engine.every;
const canSuspend = typeof OfflineAudioContext !== 'undefined' && 'suspend' in OfflineAudioContext.prototype;

const engine = (load: EngineEvent['load'], x: number, t: number): EngineEvent => ({
  type: 'engine',
  id: 1,
  tick: Math.round(t * T.sim.tickHz),
  t,
  source: 9,
  cause: 0,
  x,
  y: 1,
  z: 0,
  surface: 0,
  loudness: T.brain.engine[load] / T.noise.radiusPerUnit,
  radius: T.brain.engine[load],
  load,
});

/** Renders events played at given seconds after AT, and returns the level in each 50 ms from AT on (root mean square of the louder channel). */
async function levels(plays: Array<[seconds: number, events: SimEvent[]]>, seconds: number): Promise<number[]> {
  const ctx = new OfflineAudioContext(2, Math.round(RATE * (AT + seconds)), RATE);
  const sound = new SoundEngine(ctx, { tuning: T, seed: 7, speedOfSound: C });
  sound.setListener({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 });
  for (const [at, events] of plays) {
    void ctx.suspend(Math.round(((AT + at) * RATE) / 128) * (128 / RATE)).then(() => {
      sound.play(events, 1.6);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const out: number[] = [];
  const step = Math.round(0.05 * RATE);
  for (let i = Math.round(AT * RATE); i + step <= L.length; i += step) {
    let sum = 0;
    for (let k = i; k < i + step; k++) sum += Math.max(L[k]! * L[k]!, R[k]! * R[k]!);
    out.push(Math.sqrt(sum / step));
  }
  return out;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe.runIf(canSuspend)('an engine', () => {
  it('is one unbroken sound while the simulation keeps saying it runs', async () => {
    // Twenty metres off, so it arrives in a twentieth of a second: three stretches, each `every` after the last.
    const l = await levels(
      [0, 1, 2].map((k) => [k * EVERY, [engine('idle', 20, k * EVERY)]]),
      3 * EVERY + 1.5,
    );
    const from = Math.ceil(0.8 / 0.05);
    const to = Math.floor((3 * EVERY - 0.2) / 0.05);
    const running = l.slice(from, to);
    const usual = mean(running);
    expect(usual).toBeGreaterThan(1e-3);
    // Nowhere in the middle does it drop to a third of its usual level: the joins don't show.
    expect(Math.min(...running)).toBeGreaterThan(usual / 3);
    // And it stops: a second after the last stretch ends there's nothing.
    expect(mean(l.slice(Math.ceil((3 * EVERY + 1.2) / 0.05)))).toBeLessThan(usual / 50);
  });

  it('starts with the starter, louder than it runs', async () => {
    const start = await levels([[0, [engine('start', 20, 0)]]], EVERY + 1);
    const idle = await levels([[0, [engine('idle', 20, 0)]]], EVERY + 1);
    // The first second is the starter turning it over: there from the first instant, where a run fades in.
    expect(mean(start.slice(1, 6))).toBeGreaterThan(mean(idle.slice(1, 6)) * 2);
    // Then it catches and revs.
    expect(mean(start.slice(24, 36))).toBeGreaterThan(mean(idle.slice(24, 36)));
  });

  it('fades with distance, and is gone past how far the simulation says it carries', async () => {
    const near = await levels([[0, [engine('idle', 40, 0)]]], EVERY + 1);
    const far = await levels([[0, [engine('idle', 160, 0)]]], EVERY + 1.2);
    // Well past its radius: a sound fades out over the stretch just beyond it.
    const beyond = await levels([[0, [engine('idle', T.brain.engine.idle * 1.6, 0)]]], EVERY + 3);
    const loud = (l: number[]): number => Math.max(...l);
    expect(loud(far)).toBeLessThan(loud(near) / 2);
    expect(loud(far)).toBeGreaterThan(0);
    expect(loud(beyond)).toBe(0);
  });
});
