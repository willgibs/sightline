import type { SurfaceName } from '../sim/kernel/world/surfaces';

/**
 * Procedural placeholder sounds. There are no audio files in the wireframe phases: every
 * sound is synthesized from noise, oscillators and filters, so it can carry exactly the
 * information the simulation gives it (surface, gait, distance) and nothing more.
 * Production sound replaces these voices in the Sound track; the engine around them stays.
 *
 * Randomness here is presentation only and never touches the simulation. It comes from a
 * seeded generator so offline renders in tests are repeatable.
 */

export type Rand = () => number;

/** mulberry32: small, fast, seeded. */
export function makeRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NoiseBuffers {
  /** 2 s of mono white noise, for bursts. */
  white: AudioBuffer;
  /** 6 s of stereo pink noise with decorrelated channels, looping seamlessly. */
  pink: AudioBuffer;
  /** 4 s of mono brown noise, looping seamlessly. */
  brown: AudioBuffer;
}

export function makeNoiseBuffers(ctx: BaseAudioContext, rand: Rand): NoiseBuffers {
  const rate = ctx.sampleRate;
  const white = ctx.createBuffer(1, Math.round(rate * 2), rate);
  fillWhite(white.getChannelData(0), rand);

  const pink = ctx.createBuffer(2, Math.round(rate * 6), rate);
  for (let c = 0; c < 2; c++) {
    const d = pink.getChannelData(c);
    fillPink(d, rand);
    loopSeam(d, Math.round(rate * 0.25));
  }

  const brown = ctx.createBuffer(1, Math.round(rate * 4), rate);
  const b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < b.length; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    b[i] = last * 3.5;
  }
  loopSeam(b, Math.round(rate * 0.25));
  return { white, pink, brown };
}

function fillWhite(d: Float32Array, rand: Rand): void {
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
}

/** Paul Kellet's refined pink filter. */
function fillPink(d: Float32Array, rand: Rand): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

/** Crossfades the tail into the head so the buffer loops without a click. */
function loopSeam(d: Float32Array, fade: number): void {
  const n = d.length;
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const head = d[i]!;
    const tail = d[n - fade + i]!;
    d[i] = tail * Math.cos(t * Math.PI * 0.5) + head * Math.sin(t * Math.PI * 0.5);
  }
}

// ── Building blocks ──────────────────────────────────────────────────────────────────────

const SILENT = 1e-4;

/** A filtered noise burst with a fast attack and an exponential decay. Returns its end time. */
export function burst(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  rand: Rand,
  when: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  attack: number,
  decay: number,
  gain: number,
): number {
  if (gain <= 0) return when;
  const end = when + attack + decay + 0.01;
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  const filter = new BiquadFilterNode(ctx, { type, frequency: freq, Q: q });
  const env = new GainNode(ctx, { gain: 0 });
  src.connect(filter).connect(env).connect(out);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + attack);
  env.gain.exponentialRampToValueAtTime(SILENT, when + attack + decay);
  const room = Math.max(0, noise.duration - (end - when) - 0.01);
  src.start(when, rand() * room);
  src.stop(end);
  return end;
}

/** A heel strike: a sine that drops in pitch, gone in tens of milliseconds. */
export function thump(ctx: BaseAudioContext, out: AudioNode, when: number, freq: number, decay: number, gain: number): number {
  if (gain <= 0) return when;
  const end = when + decay + 0.02;
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: freq * 1.7 });
  const env = new GainNode(ctx, { gain: 0 });
  osc.connect(env).connect(out);
  osc.frequency.setValueAtTime(freq * 1.7, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + 0.025);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.003);
  env.gain.exponentialRampToValueAtTime(SILENT, when + 0.003 + decay);
  osc.start(when);
  osc.stop(end);
  return end;
}

/** A struck resonant body (metal sheet, plank): a click exciting high-Q band-passes. */
export function ring(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  rand: Rand,
  when: number,
  freqs: readonly number[],
  q: number,
  decay: number,
  gain: number,
): number {
  if (gain <= 0) return when;
  const end = when + decay + 0.05;
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  const click = new GainNode(ctx, { gain: 0 });
  src.connect(click);
  click.gain.setValueAtTime(0, when);
  click.gain.linearRampToValueAtTime(1, when + 0.001);
  click.gain.exponentialRampToValueAtTime(SILENT, when + 0.008);
  const env = new GainNode(ctx, { gain: 0 });
  env.connect(out);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.002);
  env.gain.exponentialRampToValueAtTime(SILENT, when + decay);
  for (const f of freqs) {
    // A high-Q band-pass passes little energy, so its gain makes up for the narrow band.
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: f * (0.97 + rand() * 0.06), Q: q });
    const g = new GainNode(ctx, { gain: Math.sqrt(q) * 1.4 });
    click.connect(bp).connect(g).connect(env);
  }
  src.start(when, rand() * Math.max(0, noise.duration - 0.1));
  src.stop(end);
  return end;
}

// ── Footsteps ────────────────────────────────────────────────────────────────────────────

interface Band {
  type: BiquadFilterType;
  freq: number;
  q: number;
  attack: number;
  decay: number;
  gain: number;
}

interface SurfaceVoice {
  heel: { freq: number; decay: number; gain: number };
  body: Band;
  /** Several tiny bursts spread over the step: gravel crunch, grass brushing, splashes. */
  grains?: Band & { count: number; spread: number };
  ring?: { freqs: readonly number[]; q: number; decay: number; gain: number };
}

/** What each surface sounds like under a walking boot. Gravel and metal are loud, grass soft. */
export const SURFACE_VOICES: Readonly<Record<SurfaceName, SurfaceVoice>> = {
  grass: {
    heel: { freq: 70, decay: 0.035, gain: 0.25 },
    // A wide band-pass, not a high-pass: WebKit's high-pass passes 1–2 dB less than other
    // engines', and the band-pass's Q means the same everywhere.
    body: { type: 'bandpass', freq: 4200, q: 0.45, attack: 0.006, decay: 0.09, gain: 0.55 },
    grains: { type: 'bandpass', freq: 3200, q: 0.8, attack: 0.002, decay: 0.025, gain: 0.3, count: 3, spread: 0.06 },
  },
  dirt: {
    heel: { freq: 85, decay: 0.05, gain: 0.5 },
    body: { type: 'lowpass', freq: 1100, q: 0.7, attack: 0.002, decay: 0.07, gain: 0.75 },
  },
  gravel: {
    heel: { freq: 90, decay: 0.04, gain: 0.35 },
    body: { type: 'bandpass', freq: 3200, q: 0.9, attack: 0.002, decay: 0.035, gain: 0.45 },
    grains: { type: 'bandpass', freq: 4300, q: 1.2, attack: 0.001, decay: 0.018, gain: 0.6, count: 7, spread: 0.11 },
  },
  rock: {
    heel: { freq: 110, decay: 0.03, gain: 0.45 },
    body: { type: 'bandpass', freq: 2400, q: 1.4, attack: 0.001, decay: 0.035, gain: 0.75 },
  },
  water: {
    heel: { freq: 60, decay: 0.06, gain: 0.2 },
    body: { type: 'lowpass', freq: 900, q: 0.6, attack: 0.012, decay: 0.2, gain: 0.8 },
    grains: { type: 'bandpass', freq: 1500, q: 4, attack: 0.004, decay: 0.035, gain: 0.35, count: 4, spread: 0.16 },
  },
  metal: {
    heel: { freq: 140, decay: 0.06, gain: 0.4 },
    body: { type: 'bandpass', freq: 4000, q: 1, attack: 0.001, decay: 0.025, gain: 0.4 },
    ring: { freqs: [1150, 2730, 4130], q: 28, decay: 0.35, gain: 0.45 },
  },
  wood: {
    heel: { freq: 120, decay: 0.07, gain: 0.6 },
    body: { type: 'bandpass', freq: 900, q: 2, attack: 0.002, decay: 0.06, gain: 0.55 },
    ring: { freqs: [215, 470], q: 9, decay: 0.12, gain: 0.4 },
  },
};

export type GaitBand = 'crawl' | 'crouch' | 'walk' | 'sprint';

export function gaitBand(gait: number): GaitBand {
  return gait < 0.45 ? 'crawl' : gait < 0.8 ? 'crouch' : gait <= 1.25 ? 'walk' : 'sprint';
}

/**
 * Loudness trims in dB, measured by tests/browser/calibrate.test.ts (K-weighted momentary
 * loudness, averaged over renders). They make every surface and gait equally loud at the
 * same amplitude, so a footstep's level carries only the simulation's loudness and its
 * timbre carries the surface. Without them a crouch on grass measured louder than a walk on
 * dirt, which would teach players the wrong thing. Re-run the calibration after changing a
 * voice: VITE_CALIBRATE=1 npm run test:browser -- calibrate.
 */
export const LOUDNESS_TRIM_DB: Readonly<Record<SurfaceName, Readonly<Record<GaitBand, number>>>> = {
  grass: { crawl: -4.2, crouch: -3.0, walk: -2.6, sprint: -3.2 },
  dirt: { crawl: -3.4, crouch: 2.9, walk: 0, sprint: -4.2 },
  gravel: { crawl: -4.4, crouch: -0.5, walk: -1.8, sprint: -3.6 },
  rock: { crawl: -3.4, crouch: 3.9, walk: 1.9, sprint: -1.9 },
  water: { crawl: -3.9, crouch: 0.8, walk: 1.0, sprint: -0.6 },
  metal: { crawl: -3.3, crouch: 5.0, walk: 1.0, sprint: -3.8 },
  wood: { crawl: -3.3, crouch: 3.6, walk: -1.7, sprint: -6.6 },
};

/**
 * One footstep. `gait` is the simulation's movement factor (0.3 crawl, 0.6 crouch, 1 walk,
 * 1.5 sprint): it lengthens or sharpens the step and sets how hard the heel lands. A crawl
 * has no heel strike at all, only cloth and ground brushing. Returns when the sound ends.
 * Set `trim` false only to measure the raw voice.
 */
export function footstep(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: NoiseBuffers,
  rand: Rand,
  when: number,
  surface: SurfaceName,
  gait: number,
  amp: number,
  trim = true,
): number {
  const v = SURFACE_VOICES[surface];
  const crawl = gait < 0.45;
  const level = trim ? amp * Math.pow(10, LOUDNESS_TRIM_DB[surface][gaitBand(gait)] / 20) : amp;
  const length = crawl ? 2.2 : gait < 0.8 ? 1.3 : gait > 1.25 ? 0.85 : 1;
  const heel = crawl ? 0 : Math.min(1.5, (gait * gait) / 1.5 + 0.1);
  const vary = (): number => 0.92 + rand() * 0.16;
  const voice = new GainNode(ctx, { gain: level * (0.85 + rand() * 0.3) });
  voice.connect(out);

  let end = thump(ctx, voice, when, v.heel.freq * vary(), v.heel.decay * length, v.heel.gain * heel);
  const b = v.body;
  end = Math.max(
    end,
    burst(ctx, voice, noise.white, rand, when, b.type, b.freq * vary(), b.q, b.attack, b.decay * length, b.gain * (crawl ? 0.4 : 1)),
  );
  if (v.grains) {
    const g = v.grains;
    for (let i = 0; i < g.count; i++) {
      const t = when + rand() * g.spread * length;
      end = Math.max(end, burst(ctx, voice, noise.white, rand, t, g.type, g.freq * vary(), g.q, g.attack, g.decay, g.gain * vary()));
    }
  }
  if (v.ring && !crawl) {
    end = Math.max(end, ring(ctx, voice, noise.white, rand, when, v.ring.freqs, v.ring.q, v.ring.decay * length, v.ring.gain * heel));
  }
  if (crawl) {
    end = Math.max(end, burst(ctx, voice, noise.white, rand, when, 'bandpass', 1400 * vary(), 0.6, 0.04, 0.26, 0.6));
  }
  return end;
}

/** Cloth and kit shifting as you change stance. Quiet: the simulation makes no noise for it. */
export function rustle(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, length: number, amp: number): number {
  const voice = new GainNode(ctx, { gain: amp });
  voice.connect(out);
  let end = burst(ctx, voice, noise.white, rand, when, 'bandpass', 1300, 0.5, 0.05, length, 0.7);
  end = Math.max(end, burst(ctx, voice, noise.white, rand, when + length * 0.3, 'bandpass', 2600, 0.7, 0.03, length * 0.6, 0.35));
  return end;
}

// ── Loops ────────────────────────────────────────────────────────────────────────────────

export interface Loop {
  /** Linear output level, ramped over `time` seconds. */
  setLevel(level: number, time?: number): void;
  /** Called every engine update so loops can wander (gusts, babble, engine load). */
  tick(now: number): void;
  stop(): void;
}

/** The valley's wind: decorrelated stereo pink noise, low-passed, with slow gusts. */
export function windBed(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand): Loop {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise.pink, loop: true });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 650, Q: 0.5 });
  const gust = new GainNode(ctx, { gain: 1 });
  const level = new GainNode(ctx, { gain: 0 });
  src.connect(lp).connect(gust).connect(level).connect(out);
  src.start(ctx.currentTime, rand() * noise.pink.duration);
  let next = 0;
  return {
    setLevel(l, time = 0.5) {
      level.gain.setTargetAtTime(l, ctx.currentTime, time / 3);
    },
    tick(now) {
      if (now < next) return;
      const span = 1.5 + rand() * 3;
      next = now + span;
      gust.gain.setTargetAtTime(0.55 + rand() * 0.9, now, span / 3);
      lp.frequency.setTargetAtTime(450 + rand() * 500, now, span / 3);
    },
    stop() {
      src.stop();
      src.disconnect();
      level.disconnect();
    },
  };
}

/** Running water: band-passed noise with a babbling upper band. */
export function waterLoop(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand): Loop {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise.pink, loop: true });
  const body = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 0.45 });
  const babble = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 2400, Q: 3, gain: 8 });
  const level = new GainNode(ctx, { gain: 0 });
  const mono = new GainNode(ctx, { gain: 2.5, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  src.connect(mono).connect(body).connect(babble).connect(level).connect(out);
  src.start(ctx.currentTime, rand() * noise.pink.duration);
  let next = 0;
  return {
    setLevel(l, time = 0.3) {
      level.gain.setTargetAtTime(l, ctx.currentTime, time / 3);
    },
    tick(now) {
      if (now < next) return;
      next = now + 0.08 + rand() * 0.25;
      babble.frequency.setTargetAtTime(1600 + rand() * 1800, now, 0.05);
    },
    stop() {
      src.stop();
      src.disconnect();
      level.disconnect();
    },
  };
}

/** A diesel generator: a 50 Hz fundamental, harmonics, a firing-rate wobble and some rattle. */
export function humLoop(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand): Loop {
  const level = new GainNode(ctx, { gain: 0 });
  const mix = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.7 });
  mix.connect(lp).connect(level).connect(out);
  const base = 48 + rand() * 6;
  const oscs = [
    new OscillatorNode(ctx, { type: 'sawtooth', frequency: base }),
    new OscillatorNode(ctx, { type: 'sine', frequency: base * 2 }),
    new OscillatorNode(ctx, { type: 'square', frequency: base * 3 }),
  ];
  const gains = [0.35, 0.3, 0.06];
  oscs.forEach((o, i) => o.connect(new GainNode(ctx, { gain: gains[i]! })).connect(mix));
  // Firing pulses: an LFO on the mix level.
  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: base / 8 });
  const lfoDepth = new GainNode(ctx, { gain: 0.25 });
  lfo.connect(lfoDepth).connect(mix.gain);
  const rattle = new AudioBufferSourceNode(ctx, { buffer: noise.brown, loop: true });
  const rattleBand = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 300, Q: 1.2 });
  rattle.connect(rattleBand).connect(new GainNode(ctx, { gain: 0.5 })).connect(mix);
  const t = ctx.currentTime;
  for (const o of oscs) o.start(t);
  lfo.start(t);
  rattle.start(t, rand() * noise.brown.duration);
  let next = 0;
  return {
    setLevel(l, time = 0.3) {
      level.gain.setTargetAtTime(l, ctx.currentTime, time / 3);
    },
    tick(now) {
      if (now < next) return;
      next = now + 2 + rand() * 4;
      const load = 1 + (rand() - 0.5) * 0.04;
      for (let i = 0; i < oscs.length; i++) oscs[i]!.frequency.setTargetAtTime(base * (i + 1) * load, now, 0.6);
    },
    stop() {
      for (const o of oscs) o.stop();
      lfo.stop();
      rattle.stop();
      level.disconnect();
    },
  };
}

/**
 * A guard's bark, before voiced lines exist (Phase 3's Sound track): a murmur of syllables
 * at a voice's pitch, one per word, a shout louder and higher. Its words are captioned
 * (app/cues.ts); its loudness and place are the hearing law's, like any sound.
 */
export function murmur(ctx: BaseAudioContext, out: AudioNode, noise: NoiseBuffers, rand: Rand, when: number, words: number, shout: boolean, amp: number): number {
  const voice = new GainNode(ctx, { gain: amp });
  voice.connect(out);
  let t = when;
  let end = when;
  const base = shout ? 900 : 650;
  for (let k = 0; k < words; k++) {
    const length = 0.09 + 0.08 * rand();
    end = Math.max(end, burst(ctx, voice, noise.white, rand, t, 'bandpass', base * (0.85 + 0.3 * rand()), 6, 0.015, length, 1));
    end = Math.max(end, burst(ctx, voice, noise.white, rand, t, 'bandpass', base * 2.6 * (0.9 + 0.2 * rand()), 9, 0.015, length * 0.8, 0.35));
    t += length + 0.05 + 0.04 * rand();
  }
  return end;
}
