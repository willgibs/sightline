import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/kernel/events';
import { PLAYER_ID } from '../sim/game/entities';
import { audibility, travelTime } from '../sim/kernel/sound';
import type { AmbientSource } from '../sim/generation';
import { emptyRoute, type RouteFn, type SteadyFn } from './hearing';
import { footstep, humLoop, makeNoiseBuffers, makeRand, rustle, waterLoop, windBed, type Loop, type NoiseBuffers, type Rand } from './voices';
import { bolt, clatter, crack, cry, impact, report } from './shotVoices';
import { crackAt, type Crack, type Flight } from '../sim/ballistics';
import { Surface, surfaceName } from '../sim/kernel/world/surfaces';

/**
 * The sound engine: plays what the simulation reports, the way the simulation says it
 * behaves. It reads events and never writes simulation state (like the renderer).
 *
 * What "behaves correctly" means here (design doc · Audio direction):
 *   - Level follows the simulation's own hearing law (sim/kernel/sound.ts): every sound is at the
 *     threshold of hearing at its radius and fades out just beyond it, so if you can hear
 *     it, a guard where you stand could too.
 *   - Distant sounds arrive late, at the speed of sound.
 *   - Sounds are placed in 3D (HRTF) where they seem to come from: round a corner, from
 *     the doorway; through a wall, muffled (audio/hearing.ts, the guards' own law).
 *   - Your own body (footsteps, cloth) plays close and centred, at the level the
 *     simulation gives it, so you can learn your noise by ear.
 *   - A sound plays when the picture shows its moment (`SoundTiming`), not when the tick
 *     that made it happened to run, so steps keep the simulation's rhythm at any frame rate.
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

/**
 * Where the picture is on the simulation's timeline. The frame on screen shows simulation
 * time `shown` (seconds; interpolated between the last two ticks, so a tick behind the
 * newest one), and simulation time runs `scale` times as fast as real time (the debug
 * view's fast-forward). An event at time t plays (t − shown) / scale + hold seconds from
 * now: when the picture reaches it, plus `hold`.
 *
 * `hold` is about a frame. A tick is computed in the first frame after it ends, up to a
 * frame late, so without it a step early in its tick could already be due and play late
 * by up to a frame; with it, every sound keeps its distance from the next, at any frame
 * rate, and the frame it adds roughly matches the screen's own latency.
 */
export interface SoundTiming {
  shown: number;
  scale: number;
  hold: number;
}

/** No event is held back longer than this, whatever the timing says. */
export const MAX_LEAD = 0.25;

/** How a fixed source sounds from where the listener is (the debug panel). */
export interface AmbientHeard {
  kind: AmbientSource['kind'];
  distance: number;
  muffled: boolean;
}

export interface SoundOptions {
  tuning: Tuning;
  /** The mission air's speed of sound (sim/kernel/env.ts, air), m/s. Default 343. */
  speedOfSound?: number;
  /** The old straight-line muffling, for tests; `route` replaces it. */
  muffle?: MuffleFn;
  /**
   * How sound reaches the listener by the guards' own law (audio/hearing.ts): level, the
   * place it seems to come from, the route's length and whether walls muffle it. With it,
   * the speakers hear exactly what a guard where the camera is would.
   */
  route?: RouteFn;
  /** The same law for the steady sources, by their index in the world's list. */
  steady?: SteadyFn;
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
/** The low-pass on a sound that came through a wall, Hz. */
const MUFFLED_CUTOFF = 900;
/** Scheduling headroom so a sound never starts in the past. */
export const LOOKAHEAD = 0.02;
const MAX_VOICES = 40;
const MAX_AMBIENT = 8;
const AMBIENT_REFRESH = 0.2;
/** The wind bed's level (about -38 dBFS RMS): a quiet floor that the simulation will later use for masking. */
const WIND_LEVEL = 0.065;

export class SoundEngine {
  readonly ctx: BaseAudioContext;
  private tuning: Tuning;
  private speedOfSound: number;
  private readonly muffle: MuffleFn | null;
  private readonly route: RouteFn | null;
  private readonly steady: SteadyFn | null;
  private readonly heard = emptyRoute();
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
  private readonly ambient = new Map<AmbientSource, { loop: Loop; panner: PannerNode; filter: BiquadFilterNode; distance: number; muffled: boolean }>();
  private ambientTimer = 0;
  /** Scratch for a shot's path and its crack. */
  private readonly flight: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 };
  private readonly crackOut: Crack = { t: 0, emitted: 0, x: 0, y: 0, z: 0, distance: 0 };
  private volume = 1;
  private ducked = false;

  constructor(ctx: BaseAudioContext, opts: SoundOptions) {
    this.ctx = ctx;
    this.tuning = opts.tuning;
    this.speedOfSound = opts.speedOfSound ?? 343;
    this.muffle = opts.muffle ?? null;
    this.route = opts.route ?? null;
    this.steady = opts.steady ?? null;
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

  /** Hot-reloaded tuning: footstep voices follow its gaits. */
  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
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
   * Without `timing`, everything plays at once. With the listener out of the player's body
   * (`inBody` false: the fly camera, a replay watched from outside), the player's steps are
   * heard from where they happen, like anyone's, and their clothes not at all.
   */
  play(events: readonly SimEvent[], earToFeet: number, timing?: SoundTiming, inBody = true): void {
    for (const e of events) {
      const lead = timing ? leadOf(e.t, timing) : 0;
      const own = e.source === PLAYER_ID && inBody;
      if (e.type === 'footstep') {
        // The step's kind of sound comes from its gait; how loud it is, from its radius.
        const gait = this.tuning.noise.movement[e.gait];
        if (own) {
          const amp = THRESHOLD * audibility(e.radius, earToFeet);
          this.voice(amp, lead, (when) => footstep(this.ctx, this.body, this.noise, this.rand, when, surfaceName(e.surface), gait, amp));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) =>
            footstep(this.ctx, out, this.noise, this.rand, when, surfaceName(e.surface), gait, amp), lead,
          );
        }
      } else if (e.type === 'land' || e.type === 'mantle') {
        // A landing is a heavy footfall: the sprint voice at its own loudness. Hands taking
        // hold of a ledge are lighter, a walking step's voice.
        const gait = e.type === 'land' ? 1.5 : 1;
        if (own) {
          const amp = THRESHOLD * audibility(e.radius, earToFeet);
          this.voice(amp, lead, (when) => footstep(this.ctx, this.body, this.noise, this.rand, when, surfaceName(e.surface), gait, amp));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) =>
            footstep(this.ctx, out, this.noise, this.rand, when, surfaceName(e.surface), gait, amp), lead,
          );
        }
      } else if (e.type === 'report') {
        // A shot's blast: at your own ears, loud (the suppressor makes it a cough); anyone else's, placed and late.
        const suppressed = e.suppressed === 1;
        if (own) {
          const amp = suppressed ? 0.3 : 0.9;
          this.voice(amp, lead, (when) => report(this.ctx, this.body, this.noise, this.rand, when, amp, suppressed));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) => report(this.ctx, out, this.noise, this.rand, when, amp, suppressed), lead);
        }
      } else if (e.type === 'shot' && e.speed > 0) {
        // The crack: from where the bullet's shock cone leaves its path toward the listener,
        // when it gets there (sim/ballistics/crack.ts). Behind the muzzle there is none.
        const f = this.flight;
        f.x = e.x;
        f.y = e.y;
        f.z = e.z;
        f.dx = e.dx;
        f.dy = e.dy;
        f.dz = e.dz;
        f.t = e.t;
        f.v0 = e.speed;
        f.k = e.drag;
        f.g = this.tuning.sim.gravity;
        f.wx = e.wx;
        f.wz = e.wz;
        const c = crackAt(f, e.t + this.tuning.ballistics.maxFlight, this.listenerPose, this.speedOfSound, this.crackOut);
        if (c) this.spatial(c.x, c.y, c.z, this.tuning.ballistics.sound.crack, (out, when, amp) => crack(this.ctx, out, this.noise, this.rand, when, amp), lead + (c.emitted - e.t));
      } else if (e.type === 'impact') {
        // Heard where it struck, after the way back: about 1.28 s after the trigger at 300 m.
        const kind = e.what === 'body' ? 'body' : e.surface === Surface.Metal ? 'metal' : e.surface === Surface.Water ? 'water' : 'ground';
        this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) => impact(this.ctx, out, this.noise, this.rand, when, amp, kind), lead);
      } else if (e.type === 'clatter') {
        this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) => clatter(this.ctx, out, this.noise, this.rand, when, amp), lead);
      } else if (e.type === 'cry') {
        this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) => cry(this.ctx, out, this.noise, this.rand, when, amp), lead);
      } else if (e.type === 'bolt') {
        if (own) {
          const amp = THRESHOLD * audibility(e.radius, 0.6);
          this.voice(amp, lead, (when) => bolt(this.ctx, this.body, this.noise, this.rand, when, amp));
        } else {
          this.spatial(e.x, e.y, e.z, e.radius, (out, when, amp) => bolt(this.ctx, out, this.noise, this.rand, when, amp), lead);
        }
      } else if (e.type === 'stance' && own) {
        // Your own clothes, at your ears. Not a sound in the simulation (nobody else hears
        // it), so another body's change of stance is silent.
        const length = e.to === 'prone' || e.from === 'prone' ? 0.5 : 0.22;
        const amp = THRESHOLD * 2.5;
        this.voice(amp, lead, (when) => rustle(this.ctx, this.body, this.noise, this.rand, when, length, amp));
      }
    }
  }

  /** Schedules a non-positional voice, within the voice budget, `lead` seconds from now. */
  private voice(amp: number, lead: number, start: (when: number) => number): void {
    if (amp <= 0 || !this.claimVoice()) return;
    this.voiceEnds.push(start(this.ctx.currentTime + LOOKAHEAD + lead));
  }

  /**
   * Schedules a sound at a point in the world: level from the hearing law, a delay for
   * the distance travelled, a 3D position, and muffling if the path is blocked.
   * Returns false if the sound is out of earshot. `lead` holds it back until the picture
   * shows its moment (SoundTiming); the distance's delay comes on top.
   */
  spatial(x: number, y: number, z: number, radius: number, start: (out: AudioNode, when: number, amp: number) => number, lead = 0): boolean {
    const l = this.listenerPose;
    if (this.route) {
      // The guards' law: level along the louder route, placed where it seems to come from.
      const r = this.route(x, y, z, radius, l.x, l.y, l.z, this.heard);
      if (!r) return false;
      const fade = fadeOut(radius / r.level, radius);
      if (fade <= 0 || !this.claimVoice()) return false;
      const when = this.ctx.currentTime + LOOKAHEAD + lead + travelTime(r.length, this.speedOfSound);
      const panner = this.panner(r.x, r.y, r.z);
      let out: AudioNode = panner;
      if (r.muffled) {
        const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: MUFFLED_CUTOFF, Q: 0.7 });
        lp.connect(panner);
        out = lp;
      }
      panner.connect(this.world);
      this.voiceEnds.push(start(out, when, THRESHOLD * r.level * fade));
      return true;
    }
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
    const when = this.ctx.currentTime + LOOKAHEAD + lead + travelTime(d, this.speedOfSound);
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

  /** A new world: its fixed sources (sim/generation/ambient.ts) and its air's speed of sound (sim/kernel/env.ts, air). */
  setWorld(sources: readonly AmbientSource[], speedOfSound: number): void {
    this.speedOfSound = speedOfSound > 0 ? speedOfSound : 343;
    this.setAmbientSources(sources);
  }

  /** Replaces the fixed sources (creek stretches, generators). */
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
        a = { loop: make(this.ctx, filter, this.noise, this.rand), panner, filter, distance: d, muffled: false };
        this.ambient.set(s, a);
      }
      a.distance = d;
      if (this.steady) {
        // The guards' law, as for any sound: the masking a guard there would hear.
        const r = this.steady(this.sources.indexOf(s), l.x, l.y, l.z, this.heard);
        a.muffled = r?.muffled ?? false;
        a.filter.frequency.setTargetAtTime(a.muffled ? MUFFLED_CUTOFF : 20000, now, 0.1);
        a.loop.setLevel(r ? THRESHOLD * r.level * fadeOut(s.radius / r.level, s.radius) : 0, AMBIENT_REFRESH);
        continue;
      }
      const m = this.muffle ? this.muffle(s.x, s.y, s.z, l.x, l.y, l.z) : null;
      a.muffled = m !== null;
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

  /** The fixed sources in earshot, nearest first: how far, and whether something is in the way. */
  ambientHeard(): AmbientHeard[] {
    return [...this.ambient.entries()].map(([s, a]) => ({ kind: s.kind, distance: a.distance, muffled: a.muffled })).sort((a, b) => a.distance - b.distance);
  }

  dispose(): void {
    this.setAmbientSources([]);
    this.wind?.stop();
    this.wind = null;
    this.master.disconnect();
  }
}

/** Seconds to hold an event at simulation time `t` back, so it plays when the picture shows it. */
export function leadOf(t: number, timing: SoundTiming): number {
  const lead = (t - timing.shown) / (timing.scale > 0 ? timing.scale : 1) + (timing.hold > 0 ? timing.hold : 0);
  // NaN fails the comparison and plays at once.
  return lead > 0 ? Math.min(lead, MAX_LEAD) : 0;
}

/**
 * A running estimate of how long a frame takes, for SoundTiming's hold: it jumps to any
 * longer frame at once and eases back over about a second of frames, so one slow frame
 * holds sounds a little longer for a while instead of making the next ones late.
 */
export function frameSpan(span: number, dt: number): number {
  if (!(dt > 0)) return span;
  return dt > span ? dt : span + (dt - span) * 0.02;
}

/** 1 inside the radius, easing to 0 at FADE_END × radius. */
export function fadeOut(distance: number, radius: number): number {
  if (distance <= radius) return 1;
  const t = (distance - radius) / (radius * (FADE_END - 1));
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}
