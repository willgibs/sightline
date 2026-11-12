import { burst, ring, thump, type NoiseBuffers, type Rand } from './voices';

/**
 * The shot's voices (lab B, B8): procedural placeholders like the footsteps, carrying what
 * the simulation says and nothing more. The engine places them, times them by the speed
 * of sound and scales them by the law of sound (engine.ts); each returns when it ends.
 *
 *   report   the muzzle blast: a hard crack of broadband noise, a low thump, and a long
 *            rolling tail; suppressed, a short dull cough with the action's click.
 *   crack    the bullet's shock wave passing: a one-millisecond snap, no body.
 *   impact   by what was struck: a body's heavy thwack, steel's ring, the ground's thud,
 *            water's splash.
 *   bolt     the action worked: two clacks a beat apart.
 *   cry      a hit guard's cry: a falling, throaty shout.
 *   motor    a vehicle's engine: the simulation says it's running every couple of seconds,
 *            and each time is a stretch of it long enough to join the next.
 */

/** A level that a voice can't exceed, whatever the hearing law says up close. */
function capped(amp: number): number {
  return Math.min(amp, 1);
}

/** The camp's siren: a two-tone wail that climbs and falls, for a few seconds. */
export function siren(ctx: BaseAudioContext, out: AudioNode, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: 0 });
  voice.connect(out);
  const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 420 });
  osc.connect(voice);
  const gain = voice.gain;
  const peak = capped(amp) * 0.5;
  gain.setValueAtTime(0, when);
  gain.linearRampToValueAtTime(peak, when + 0.4);
  const end = when + 6;
  for (let k = 0; k < 4; k++) {
    osc.frequency.linearRampToValueAtTime(520, when + 0.75 + k * 1.5);
    osc.frequency.linearRampToValueAtTime(420, when + 1.5 + k * 1.5);
  }
  gain.setValueAtTime(peak, end - 0.4);
  gain.linearRampToValueAtTime(0, end);
  osc.start(when);
  osc.stop(end);
  return end;
}

export function report(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number, suppressed: boolean): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  if (suppressed) {
    let end = burst(ctx, voice, noise.white, rand, when, 'lowpass', 1600, 0.7, 0.002, 0.07, 0.9);
    end = Math.max(end, thump(ctx, voice, when, 95, 0.09, 0.5));
    // The action, now audible over the muffled blast.
    end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.004, 'highpass', 3800, 0.8, 0.001, 0.025, 0.35));
    return end;
  }
  let end = burst(ctx, voice, noise.white, rand, when, 'highpass', 900, 0.5, 0.001, 0.05, 1.1);
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when, 'lowpass', 2400, 0.6, 0.002, 0.16, 1));
  end = Math.max(end, thump(ctx, voice, when, 62, 0.28, 0.9));
  // The valley answers: a low rolling tail.
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.03, 'lowpass', 420, 0.5, 0.08, 1.4, 0.45));
  return end;
}

export function crack(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  let end = burst(ctx, voice, noise.white, rand, when, 'highpass', 2500, 0.7, 0.0005, 0.008, 1.2);
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when, 'bandpass', 5200, 1.2, 0.0005, 0.004, 0.8));
  return end;
}

export type ImpactVoice = 'body' | 'metal' | 'ground' | 'water';

export function impact(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number, kind: ImpactVoice): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  switch (kind) {
    case 'body': {
      // The thwack that carries back: dull, heavy, short.
      let end = thump(ctx, voice, when, 140, 0.12, 1);
      end = Math.max(end, burst(ctx, voice, noise.white, rand, when, 'lowpass', 900, 0.8, 0.002, 0.07, 0.8));
      return end;
    }
    case 'metal':
      return Math.max(
        ring(ctx, voice, noise.white, rand, when, [1180, 2870, 4610], 30, 0.9, 0.7),
        burst(ctx, voice, noise.white, rand, when, 'highpass', 3000, 0.7, 0.001, 0.02, 0.6),
      );
    case 'water':
      return burst(ctx, voice, noise.white, rand, when, 'bandpass', 1500, 0.6, 0.004, 0.22, 0.9);
    default:
      return Math.max(thump(ctx, voice, when, 90, 0.08, 0.6), burst(ctx, voice, noise.white, rand, when, 'lowpass', 700, 0.6, 0.003, 0.11, 0.8));
  }
}

export function bolt(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  let end = burst(ctx, voice, noise.white, rand, when, 'bandpass', 2600, 1.5, 0.001, 0.03, 1);
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.05, 'bandpass', 1800, 0.8, 0.01, 0.08, 0.4));
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.21, 'bandpass', 3100, 1.5, 0.001, 0.035, 1.1));
  return end;
}

export function cry(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: capped(amp) * 0.6 });
  voice.connect(out);
  const length = 0.45 + rand() * 0.2;
  const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 260 });
  osc.frequency.setValueAtTime(240 + rand() * 60, when);
  osc.frequency.exponentialRampToValueAtTime(130 + rand() * 30, when + length);
  // Two formants, so it reads as a voice and not a horn.
  const f1 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 700, Q: 4 });
  const f2 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1150, Q: 5 });
  const env = new GainNode(ctx, { gain: 0 });
  osc.connect(f1).connect(env);
  osc.connect(f2).connect(env);
  env.connect(voice);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(1.2, when + 0.04);
  env.gain.setValueAtTime(1.2, when + length * 0.6);
  env.gain.exponentialRampToValueAtTime(1e-4, when + length);
  osc.start(when);
  osc.stop(when + length + 0.02);
  return Math.max(when + length + 0.02, burst(ctx, voice, noise.white, rand, when, 'bandpass', 1800, 0.8, 0.02, length * 0.7, 0.25));
}

/** A thrown stone touching down: a sharp knock and a short scuff, by how hard. */
export function clatter(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  let end = burst(ctx, voice, noise.white, rand, when, 'bandpass', 2200 + rand() * 600, 2, 0.001, 0.025, 1);
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.004, 'lowpass', 900, 0.7, 0.003, 0.06, 0.5));
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.03, 'bandpass', 1600, 1, 0.01, 0.07, 0.25));
  return end;
}

/** A door: the latch, then, opened, a short creak of the hinge, or, shut, the leaf meeting its frame. */
export function door(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number, open: boolean): number {
  const voice = new GainNode(ctx, { gain: capped(amp) });
  voice.connect(out);
  let end = burst(ctx, voice, noise.white, rand, when, 'bandpass', 2600 + rand() * 400, 3, 0.001, 0.02, 0.7);
  if (open) return Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.03, 'bandpass', 900 + rand() * 200, 9, 0.06, 0.28, 0.35));
  end = Math.max(end, thump(ctx, voice, when + 0.01, 110, 0.12, 0.9));
  return Math.max(end, burst(ctx, voice, noise.white, rand, when + 0.012, 'lowpass', 500, 0.7, 0.003, 0.09, 0.6));
}

/**
 * A vehicle's engine, for one of the simulation's 'engine' events: a stretch of it that
 * fades in as the one before fades out, so a running engine is one unbroken sound that
 * follows the vehicle. `every` is the seconds between events.
 *
 *   start   the starter turning over, then it catches and revs
 *   idle    a low, lumpy beat
 *   drive   higher and harder, under load
 */
export function motor(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, amp: number, load: 'start' | 'idle' | 'drive', every: number): number {
  const fade = 0.6;
  const end = when + every + fade;
  const level = capped(amp) * (load === 'idle' ? 0.3 : 0.42);
  const voice = new GainNode(ctx, { gain: 0 });
  voice.connect(out);
  // In with the last stretch's way out, so the two add up to a steady level.
  voice.gain.setValueAtTime(0, when);
  voice.gain.linearRampToValueAtTime(level, when + (load === 'start' ? 0.05 : fade));
  voice.gain.setValueAtTime(level, end - fade);
  voice.gain.linearRampToValueAtTime(0, end);
  const body = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: load === 'idle' ? 260 : 420, Q: 0.7 });
  body.connect(voice);
  // The firing beat: two low tones a fifth apart, their level beaten by the engine's turning.
  const base = load === 'idle' ? 38 : 58;
  const low = new OscillatorNode(ctx, { type: 'sawtooth', frequency: base });
  const high = new OscillatorNode(ctx, { type: 'square', frequency: base * 1.5 });
  const beat = new OscillatorNode(ctx, { type: 'sine', frequency: load === 'idle' ? 11 : 17 });
  const lump = new GainNode(ctx, { gain: 0.35 });
  const mix = new GainNode(ctx, { gain: 0.65 });
  beat.connect(lump).connect(mix.gain);
  low.connect(mix);
  const thin = new GainNode(ctx, { gain: 0.3 });
  high.connect(thin).connect(mix);
  mix.connect(body);
  if (load === 'start') {
    // The starter: a second of a thin, grinding whirr, and then it catches: up through a rev and back down to a run.
    const whirr = new OscillatorNode(ctx, { type: 'square', frequency: 190 });
    const grind = new OscillatorNode(ctx, { type: 'sine', frequency: 23 });
    const depth = new GainNode(ctx, { gain: 40 });
    const env = new GainNode(ctx, { gain: 0 });
    grind.connect(depth).connect(whirr.frequency);
    whirr.connect(env).connect(voice);
    env.gain.setValueAtTime(0.5, when);
    env.gain.setValueAtTime(0.5, when + 0.85);
    env.gain.linearRampToValueAtTime(0, when + 1);
    whirr.start(when);
    grind.start(when);
    whirr.stop(when + 1.05);
    grind.stop(when + 1.05);
    mix.gain.setValueAtTime(0, when);
    mix.gain.setValueAtTime(0, when + 0.8);
    mix.gain.linearRampToValueAtTime(0.65, when + 1);
    for (const o of [low, high]) {
      const f = o === low ? base : base * 1.5;
      o.frequency.setValueAtTime(f * 0.7, when + 0.8);
      o.frequency.linearRampToValueAtTime(f * 1.9, when + 1.5);
      o.frequency.linearRampToValueAtTime(f * 0.66, end);
    }
  } else if (load === 'drive') {
    // Under way: it works a little harder and easier as it goes.
    const wander = base * (0.94 + 0.12 * rand());
    low.frequency.linearRampToValueAtTime(wander, end);
    high.frequency.linearRampToValueAtTime(wander * 1.5, end);
  }
  for (const o of [low, high, beat]) {
    o.start(when);
    o.stop(end + 0.02);
  }
  // The exhaust: low noise under it, for as long as this stretch lasts.
  const exhaust = new AudioBufferSourceNode(ctx, { buffer: noise.brown });
  const breath = new GainNode(ctx, { gain: load === 'idle' ? 0.5 : 0.7 });
  exhaust.connect(breath).connect(body);
  exhaust.start(when, rand() * Math.max(0, noise.brown.duration - (end - when) - 0.05));
  exhaust.stop(end + 0.02);
  return end + 0.02;
}

/** The camp's whistle: three hard blasts, a trilled high note, carrying across the valley. */
export function whistle(ctx: BaseAudioContext, out: AudioNode, when: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: capped(amp) * 0.5 });
  voice.connect(out);
  const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3100, Q: 6 });
  band.connect(voice);
  const osc = new OscillatorNode(ctx, { type: 'square', frequency: 3100 });
  const trill = new OscillatorNode(ctx, { type: 'sine', frequency: 31 });
  const depth = new GainNode(ctx, { gain: 90 });
  trill.connect(depth).connect(osc.frequency);
  const env = new GainNode(ctx, { gain: 0 });
  osc.connect(env).connect(band);
  const end = when + 1.05;
  for (const [start, stop] of [[0, 0.3], [0.38, 0.68], [0.76, 1.05]] as const) {
    env.gain.setValueAtTime(0, when + start);
    env.gain.linearRampToValueAtTime(1, when + start + 0.015);
    env.gain.setValueAtTime(1, when + stop - 0.02);
    env.gain.linearRampToValueAtTime(0, when + stop);
  }
  osc.start(when);
  trill.start(when);
  osc.stop(end + 0.02);
  trill.stop(end + 0.02);
  return end + 0.02;
}
