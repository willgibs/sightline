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
 */

/** A level that a voice can't exceed, whatever the hearing law says up close. */
function capped(amp: number): number {
  return Math.min(amp, 1);
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
