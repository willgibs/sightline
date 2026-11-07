import { describe, expect, it } from 'vitest';
import { SoundEngine, type MuffleFn } from '../../src/audio/engine';
import { footstep, makeNoiseBuffers, makeRand } from '../../src/audio/voices';
import { defaultTuning } from '../../src/config/tuning';
import type { FootstepEvent } from '../../src/sim/events';
import { SURFACE_NAMES, type Surface } from '../../src/sim/world/surfaces';

/**
 * The sound engine, measured. Everything renders offline, so these are numbers, not
 * opinions: the distance law, the speed of sound, left and right, muffling, and whether a
 * footstep's level carries the simulation's loudness and nothing else.
 */

const RATE = 48000;
/** Sounds start after the limiter has settled (it ramps in when a context starts). */
const AT = 0.5;
const canSuspend = typeof OfflineAudioContext !== 'undefined' && 'suspend' in OfflineAudioContext.prototype;

interface Measure {
  /** Overall energy in dB. */
  rms: number;
  /** K-weighted momentary loudness: the loudest 100 ms, roughly how loud it seems. */
  loudness: number;
  /** Energy of the first difference: a crude high-frequency measure. */
  bright: number;
  /** Seconds from scheduling to the first audible sample. */
  onset: number;
  /** Left energy over right energy in dB. */
  leftRight: number;
}

async function render(play: (e: SoundEngine) => void, muffle?: MuffleFn, seconds = 1.6): Promise<Measure> {
  const ctx = new OfflineAudioContext(2, Math.round(RATE * seconds), RATE);
  const engine = new SoundEngine(ctx, { tuning: defaultTuning, seed: 7, muffle });
  engine.setListener({ x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 });
  void ctx.suspend(AT).then(() => {
    play(engine);
    void ctx.resume();
  });
  const buf = await ctx.startRendering();
  return measure(buf, AT);
}

function measure(buf: AudioBuffer, from: number): Measure {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
  // K-weighting, approximately: +4 dB above 1.7 kHz, applied with a one-pole shelf.
  const k = weightK(L, R);
  const window = Math.round(RATE * 0.1);
  let e = 0;
  let eL = 0;
  let eR = 0;
  let bright = 0;
  let prev = 0;
  let onset = -1;
  let kw = 0;
  let best = 0;
  for (let i = 0; i < L.length; i++) {
    const m = (L[i]! + R[i]!) / 2;
    e += m * m;
    eL += L[i]! * L[i]!;
    eR += R[i]! * R[i]!;
    const d = m - prev;
    bright += d * d;
    prev = m;
    if (onset < 0 && Math.max(Math.abs(L[i]!), Math.abs(R[i]!)) > 1e-5) onset = i / RATE - from;
    kw += k[i]! * k[i]!;
    if (i >= window) kw -= k[i - window]! * k[i - window]!;
    if (kw > best) best = kw;
  }
  const db = (x: number) => 10 * Math.log10(Math.max(x, 1e-30));
  return { rms: db(e / L.length), loudness: db(best / window), bright: db(bright / L.length), onset, leftRight: db(eL / Math.max(eR, 1e-30)) };
}

function weightK(L: Float32Array, R: Float32Array): Float32Array {
  const out = new Float32Array(L.length);
  // High-shelf of +4 dB at about 1.7 kHz: y = x + g·(x − lowpass(x)).
  const a = Math.exp((-2 * Math.PI * 1700) / RATE);
  const g = Math.pow(10, 4 / 20) - 1;
  let lp = 0;
  for (let i = 0; i < L.length; i++) {
    const x = (L[i]! + R[i]!) / 2;
    lp = a * lp + (1 - a) * x;
    out[i] = x + g * (x - lp);
  }
  return out;
}

function step(x: number, z: number, radius: number, surface: Surface = 2, loudness = 1.15, source = 0, y = 1.65): FootstepEvent {
  return { type: 'footstep', tick: 1, source, x, y, z, surface, loudness, radius };
}

describe.runIf(canSuspend)('the sound engine', () => {
  it('follows the hearing law: 6 dB quieter per doubling of distance', async () => {
    const levels: number[] = [];
    for (const d of [3, 6, 12, 24]) levels.push((await render((e) => e.play([step(0, -d, 40)], 1.65))).rms);
    for (let i = 1; i < levels.length; i++) expect(levels[i - 1]! - levels[i]!).toBeCloseTo(6.02, 0);
  });

  it('is silent beyond its radius, with a short fade', async () => {
    const atRadius = await render((e) => e.play([step(0, -12, 12)], 1.65));
    const beyond = await render((e) => e.play([step(0, -16, 12)], 1.65));
    expect(atRadius.onset).toBeGreaterThan(0);
    expect(beyond.onset).toBe(-1);
  });

  it('arrives at the speed of sound', async () => {
    const near = await render((e) => e.play([step(0, -3, 200)], 1.65));
    const far = await render((e) => e.play([step(0, -71.6, 200)], 1.65));
    // 68.6 m further at 343 m/s is 0.2 s later.
    expect(far.onset - near.onset).toBeCloseTo(0.2, 2);
  });

  it('places sounds left and right', async () => {
    const left = await render((e) => e.play([step(-10, 0, 40)], 1.65));
    const right = await render((e) => e.play([step(10, 0, 40)], 1.65));
    expect(left.leftRight).toBeGreaterThan(3);
    expect(right.leftRight).toBeLessThan(-3);
  });

  it('muffles a sound when something solid is in the way', async () => {
    const clear = await render((e) => e.play([step(0, -8, 40)], 1.65));
    const blocked = await render((e) => e.play([step(0, -8, 40)], 1.65), () => ({ gain: 0.45, cutoff: 900 }));
    expect(clear.rms - blocked.rms).toBeGreaterThan(6);
    expect(clear.bright - blocked.bright).toBeGreaterThan(15);
  });

  it('plays your own footsteps as loud as the simulation says they are', async () => {
    // Movement × surface from the tuning table: sprint on gravel vs crouch on grass.
    const N = defaultTuning.noise;
    const loud = N.movement.sprint * N.surface.gravel;
    const soft = N.movement.crouch * N.surface.grass;
    const ear = 1.65;
    const sprint = await render((e) => e.play([step(0, 0, loud * N.radiusPerUnit, 2, loud, -1, 0)], ear));
    const crouch = await render((e) => e.play([step(0, 0, soft * N.radiusPerUnit, 0, soft, -1, 0)], ear));
    expect(sprint.loudness - crouch.loudness).toBeCloseTo(20 * Math.log10(loud / soft), -0.5);
  });
});

describe('footstep voices', () => {
  it('are equally loud on every surface and at every gait at the same amplitude', async () => {
    const levels: number[] = [];
    for (let s = 0; s < SURFACE_NAMES.length; s++) {
      for (const gait of [0.3, 0.6, 1, 1.5]) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const ctx = new OfflineAudioContext(1, Math.round(RATE * 0.8), RATE);
          const noise = makeNoiseBuffers(ctx, makeRand(1));
          footstep(ctx, ctx.destination, noise, makeRand(100 + k), 0.05, SURFACE_NAMES[s]!, gait, 1);
          sum += Math.pow(10, measure(await ctx.startRendering(), 0.05).loudness / 10);
        }
        levels.push(10 * Math.log10(sum / 4));
      }
    }
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(spread).toBeLessThan(2.5);
  });
});
