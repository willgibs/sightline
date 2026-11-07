import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/events';
import { PLAYER_ID } from '../sim/state';
import { audibility, travelTime } from '../sim/sound';
import { surfaceName } from '../sim/world/surfaces';
import { footstep, humLoop, makeNoiseBuffers, makeRand, rustle, waterLoop, windBed, type Loop, type NoiseBuffers, type Rand } from './voices';

/**
 * The sound engine: plays what the simulation reports, the way the simulation says it
 * behaves. It reads events and never writes simulation state (like the renderer).
 *
 * What "behaves correctly" means here (design doc · Audio direction):
 *   - Level follows the simulation's own hearing law (sim/sound.ts): every sound is at the
 *     threshold of hearing at its radius and fades out just beyond it, so if you can hear
 *     it, a guard where you stand could too.
 *   - Distant sounds arrive late, at the speed of sound.
 *   - Sounds are placed in 3D (HRTF), and muffled when something solid is in the way.
 *   - Your own body (footsteps, cloth) plays close and centred, at the level the
 *     simulation gives it, so you can learn your noise by ear.
 *
 * The context is injected, so tests render through an OfflineAudioContext and measure.
 */

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** How a blocked path changes a sound: a level multiplier and a low-pass cutoff in Hz. */
export interface Muffle {
  gain: number;
  cutoff: number;
}

/** Returns how the path from a source to the listener is muffled, or null if it's clear. */
export type MuffleFn = (sx: number, sy: number, sz: number, lx: number, ly: number, lz: number) => Muffle | null;

export type AmbientKind = 'water' | 'hum';

/** A fixed sound source in the world: a stretch of creek, a generator. */
export interface AmbientSource {
  kind: AmbientKind;
  x: number;
  y: number;
  z: number;
  /** Threshold radius, as for any sound. */
  radius: number;
}

export interface SoundOptions {
  tuning: Tuning;
  muffle?: MuffleFn;
  seed?: number;
}

/**
 * Linear level of a sound heard exactly at its radius: a guard's footstep at the edge of
 * hearing peaks around -40 dBFS, under the wind. Everything else scales from it with the
 * hearing law: your own walking footsteps peak near -28 dBFS, a sprint on gravel near -19.
 */
export const THRESHOLD = 0.018;
/** Sounds fade to nothing between 1× and FADE_END× their radius. */
export const FADE_END = 1.25;
/** Scheduling headroom so a sound never starts in the past. */
export const LOOKAHEAD = 0.02;
const MAX_VOICES = 40;
const MAX_AMBIENT = 8;
const AMBIENT_REFRESH = 0.2;
/** The wind bed's level (about -38 dBFS RMS): a quiet floor that the simulation will later use for masking. */
const WIND_LEVEL = 0.065;

export class SoundEngine {
  readonly ctx: BaseAudioContext;
  private readonly tuning: Tuning;
  private readonly muffle: MuffleFn | null;
  private readonly rand: Rand;
  private readonly noise: NoiseBuffers;
  private readonly master: GainNode;
  private readonly world: GainNode;
  private readonly body: GainNode;
  private readonly bed: GainNode;
  private readonly listenerPose: ListenerPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly voiceEnds: number[] = [];
  private wind: Loop | null = null;
  private sources: AmbientSource[] = [];
  private readonly ambient = new Map<AmbientSource, { loop: Loop; panner: PannerNode; filter: BiquadFilterNode }>();
  private ambientTimer = 0;
  private volume = 1;
  private ducked = false;

  constructor(ctx: BaseAudioContext, opts: SoundOptions) {
    this.ctx = ctx;
    this.tuning = opts.tuning;
    this.muffle = opts.muffle ?? null;
    this.rand = makeRand(opts.seed ?? 0x5167);
    this.noise = makeNoiseBuffers(ctx, this.rand);

    // A limiter at the end: nothing the game does should ever clip.
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 0, ratio: 20, attack: 0.002, release: 0.12 });
    limiter.connect(ctx.destination);
    this.master = new GainNode(ctx, { gain: 1 });
    this.master.connect(limiter);
    this.world = new GainNode(ctx, { gain: 1 });
    this.body = new GainNode(ctx, { gain: 1 });
    this.bed = new GainNode(ctx, { gain: 1 });
    this.world.connect(this.master);
    this.body.connect(this.master);
    this.bed.connect(this.master);
  }

  /** Starts the wind bed. Separate from the constructor so silent tests can skip it. */
  startAmbience(): void {
    if (this.wind) return;
    this.wind = windBed(this.ctx, this.bed, this.noise, this.rand);
    this.wind.setLevel(WIND_LEVEL, 2);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, v);
    this.applyMaster();
  }

  /** Pausing ducks everything rather than cutting it, so the pause screen isn't dead air. */
  setPaused(paused: boolean): void {
    this.ducked = paused;
    this.applyMaster();
  }

  private applyMaster(): void {
    const target = this.volume * (this.ducked ? 0.25 : 1);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setListener(p: ListenerPose): void {
    const l = this.listenerPose;
    l.x = p.x;
    l.y = p.y;
    l.z = p.z;
    l.yaw = p.yaw;
    l.pitch = p.pitch;
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp;
    const fy = Math.sin(p.pitch);
    const fz = -Math.cos(p.yaw) * cp;
    // up = right × forward, with right = (cos yaw, 0, -sin yaw)
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    const ux = -rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy;
    const listener = this.ctx.listener;
    if (listener.positionX) {
      const t = this.ctx.currentTime;
      listener.positionX.setValueAtTime(p.x, t);
      listener.positionY.setValueAtTime(p.y, t);
      listener.positionZ.setValueAtTime(p.z, t);
      listener.forwardX.setValueAtTime(fx, t);
      listener.forwardY.setValueAtTime(fy, t);
      listener.forwardZ.setValueAtTime(fz, t);
      listener.upX.setValueAtTime(ux, t);
      listener.upY.setValueAtTime(uy, t);
      listener.upZ.setValueAtTime(uz, t);
    } else {
      // Older WebKit: the deprecated setters.
      const legacy = listener as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(p.x, p.y, p.z);
      legacy.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /**
   * Plays one tick's events. `earToFeet` is how far your ears are above your feet, which
   * sets how loud your own footsteps are under the same hearing law as everything else.
   */
  play(events: readonly SimEvent[], earToFeet: number): void {
    for (const e of events) {
      if (e.type === 'footstep') {
        // The step's kind of sound comes from its gait; how loud it is, from its radius.
        const gait = this.tuning.noise.movement[e.gait];
        if (e.source === PLAYER_ID) {
          const amp = THRESHOLD * audibility(e.radius, earToFeet);
          this.voice(amp, (when) => footstep(this.ctx, this.body, this.noise, this.rand, when, surfaceName(e.surface), gait, amp));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) =>
            footstep(this.ctx, out, this.noise, this.rand, when, surfaceName(e.surface), gait, amp),
          );
        }
      } else if (e.type === 'land') {
        // A landing is a heavy footfall: the sprint voice at the landing's own loudness.
        const gait = 1.5;
        if (e.source === PLAYER_ID) {
          const amp = THRESHOLD * audibility(e.radius, earToFeet);
          this.voice(amp, (when) => footstep(this.ctx, this.body, this.noise, this.rand, when, surfaceName(e.surface), gait, amp));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) =>
            footstep(this.ctx, out, this.noise, this.rand, when, surfaceName(e.surface), gait, amp),
          );
        }
      } else if (e.type === 'stance') {
        const length = e.to === 'prone' || e.from === 'prone' ? 0.5 : 0.22;
        const amp = THRESHOLD * 2.5;
        this.voice(amp, (when) => rustle(this.ctx, this.body, this.noise, this.rand, when, length, amp));
      }
    }
  }

  /** Schedules a non-positional voice, within the voice budget. */
  private voice(amp: number, start: (when: number) => number): void {
    if (amp <= 0 || !this.claimVoice()) return;
    this.voiceEnds.push(start(this.ctx.currentTime + LOOKAHEAD));
  }

  /**
   * Schedules a sound at a point in the world: level from the hearing law, a delay for
   * the distance travelled, a 3D position, and muffling if the path is blocked.
   * Returns false if the sound is out of earshot.
   */
  spatial(x: number, y: number, z: number, radius: number, start: (out: AudioNode, when: number, amp: number) => number): boolean {
    const l = this.listenerPose;
    const dx = x - l.x;
    const dy = y - l.y;
    const dz = z - l.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const fade = fadeOut(d, radius);
    if (fade <= 0) return false;
    let amp = THRESHOLD * audibility(radius, d) * fade;
    const m = this.muffle ? this.muffle(x, y, z, l.x, l.y, l.z) : null;
    if (m) amp *= m.gain;
    if (!this.claimVoice()) return false;
    const when = this.ctx.currentTime + LOOKAHEAD + travelTime(d, this.tuning.noise.speedOfSound);
    const panner = this.panner(x, y, z);
    let out: AudioNode = panner;
    if (m) {
      const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: m.cutoff, Q: 0.7 });
      lp.connect(panner);
      out = lp;
    }
    panner.connect(this.world);
    this.voiceEnds.push(start(out, when, amp));
    return true;
  }

  private panner(x: number, y: number, z: number): PannerNode {
    // Distance attenuation is ours (the hearing law); the panner only places the sound.
    return new PannerNode(this.ctx, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      rolloffFactor: 0,
      refDistance: 1,
      maxDistance: 100000,
      positionX: x,
      positionY: y,
      positionZ: z,
    });
  }

  private claimVoice(): boolean {
    const now = this.ctx.currentTime;
    let n = 0;
    for (let i = 0; i < this.voiceEnds.length; i++) if (this.voiceEnds[i]! > now) this.voiceEnds[n++] = this.voiceEnds[i]!;
    this.voiceEnds.length = n;
    return n < MAX_VOICES;
  }

  /** Replaces the fixed sources (creek stretches, generators) for a new world. */
  setAmbientSources(sources: readonly AmbientSource[]): void {
    for (const a of this.ambient.values()) a.loop.stop();
    this.ambient.clear();
    this.sources = [...sources];
    this.ambientTimer = 0;
  }

  /** Per-frame upkeep: gusts and babble, and which fixed sources are in earshot. */
  update(dt: number): void {
    const now = this.ctx.currentTime;
    this.wind?.tick(now);
    for (const a of this.ambient.values()) a.loop.tick(now);
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = AMBIENT_REFRESH;

    const l = this.listenerPose;
    const near: { s: AmbientSource; d: number }[] = [];
    for (const s of this.sources) {
      const dx = s.x - l.x;
      const dy = s.y - l.y;
      const dz = s.z - l.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < s.radius * FADE_END) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    const keep = new Set(near.slice(0, MAX_AMBIENT).map((n) => n.s));
    for (const [s, a] of this.ambient) {
      if (!keep.has(s)) {
        a.loop.setLevel(0, 0.3);
        const loop = a.loop;
        setTimeout(() => loop.stop(), 600);
        this.ambient.delete(s);
      }
    }
    for (const { s, d } of near.slice(0, MAX_AMBIENT)) {
      let a = this.ambient.get(s);
      if (!a) {
        const panner = this.panner(s.x, s.y, s.z);
        const filter = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 20000, Q: 0.7 });
        filter.connect(panner).connect(this.world);
        const make = s.kind === 'water' ? waterLoop : humLoop;
        a = { loop: make(this.ctx, filter, this.noise, this.rand), panner, filter };
        this.ambient.set(s, a);
      }
      const m = this.muffle ? this.muffle(s.x, s.y, s.z, l.x, l.y, l.z) : null;
      a.filter.frequency.setTargetAtTime(m ? m.cutoff : 20000, now, 0.1);
      a.loop.setLevel(THRESHOLD * audibility(s.radius, d) * fadeOut(d, s.radius) * (m ? m.gain : 1), AMBIENT_REFRESH);
    }
  }

  /** How many one-shot voices are sounding now (for the debug panel). */
  get activeVoices(): number {
    const now = this.ctx.currentTime;
    return this.voiceEnds.filter((t) => t > now).length;
  }

  get activeAmbient(): number {
    return this.ambient.size;
  }

  dispose(): void {
    this.setAmbientSources([]);
    this.wind?.stop();
    this.wind = null;
    this.master.disconnect();
  }
}

/** 1 inside the radius, easing to 0 at FADE_END × radius. */
export function fadeOut(distance: number, radius: number): number {
  if (distance <= radius) return 1;
  const t = (distance - radius) / (radius * (FADE_END - 1));
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}
