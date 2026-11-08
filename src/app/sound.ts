import type { Tuning } from '../config/tuning';
import { SoundEngine, type ListenerPose, type SoundTiming } from '../audio/engine';
import { Ears, emptyRoute } from '../audio/hearing';
import { air } from '../sim/kernel/env';
import type { SimEvent } from '../sim/kernel/events';
import type { World } from '../sim/kernel/world/world';
import type { Simulation } from '../sim/game/sim';
import { ambientSources } from '../sim/generation';

/**
 * The game's sound: the engine (audio/engine.ts) wired to the run.
 *
 * - Browsers start audio only from a click or a key, so the context is made on the first
 *   "Click to begin" and woken on every later one (Safari can interrupt it).
 * - The listener is the camera: in your body, at your eyes; in the fly camera, wherever
 *   it is, so you can go and listen to a guard.
 * - Pausing ducks everything; a hidden tab suspends sound altogether.
 * - Sound is never essential: without Web Audio, or if anything in it fails, the game
 *   plays on silently and the debug panel says why.
 */

export class GameSound {
  private ctx: AudioContext | null = null;
  private engine: SoundEngine | null = null;
  private world: World | null = null;
  private volume = 0.8;
  private paused = true;
  private failure: string | null = null;
  /** The player's ears, by the guards' law of sound (audio/hearing.ts). */
  private readonly ears = new Ears();
  private readonly route = emptyRoute();

  constructor(private tuning: Tuning) {
    document.addEventListener('visibilitychange', () => this.visibility());
  }

  /** Call from a click or key handler: starts sound the first time, wakes it after that. */
  unlock(): void {
    if (this.failure) return;
    this.guard(() => {
      if (!this.ctx) {
        const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) {
          this.failure = 'this browser has no Web Audio';
          return;
        }
        this.ctx = new Context({ latencyHint: 'interactive' });
        this.engine = new SoundEngine(this.ctx, { tuning: this.tuning, route: this.ears.route, steady: this.ears.steady });
        this.engine.startAmbience();
        this.applyWorld();
        this.engine.setVolume(gainOf(this.volume));
        this.engine.setPaused(this.paused);
      }
      if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume().catch(() => undefined);
    });
  }

  setTuning(tuning: Tuning): void {
    const radii = JSON.stringify(this.tuning.noise.ambient) !== JSON.stringify(tuning.noise.ambient);
    this.tuning = tuning;
    this.ears.setTuning(tuning);
    this.guard(() => this.engine?.setTuning(tuning));
    // The steady sources' radii are tuning; anything else leaves them playing.
    if (radii) this.applyWorld();
  }

  /** A new valley or scene: its steady sources and its air. */
  setWorld(world: World): void {
    this.world = world;
    this.ears.setWorld(world, this.tuning);
    this.applyWorld();
  }

  /** A new run: what stops sound is the solids of this simulation. */
  setSimulation(sim: Simulation): void {
    if (sim.world !== this.world) this.setWorld(sim.world);
    this.ears.setSolids(sim.solids);
  }

  /** The volume setting, 0 to 1, heard on a square law: half way is a quarter of the power. */
  setVolume(v: number): void {
    this.volume = v;
    this.guard(() => this.engine?.setVolume(gainOf(v)));
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.guard(() => this.engine?.setPaused(paused));
  }

  /** Once a frame, with the camera as drawn. */
  frame(dt: number, pose: ListenerPose): void {
    const e = this.engine;
    if (!e || this.ctx?.state !== 'running') return;
    this.guard(() => {
      e.setListener(pose);
      e.update(dt);
    });
  }

  /**
   * One tick's events, timed against the picture (audio/engine.ts, SoundTiming). `inBody`:
   * the listener is the player's own eyes, so their steps and clothes sound at the ears.
   */
  play(events: readonly SimEvent[], earToFeet: number, timing: SoundTiming, inBody = true): void {
    const e = this.engine;
    if (!e || events.length === 0 || this.ctx?.state !== 'running') return;
    this.guard(() => e.play(events, earToFeet, timing, inBody));
  }

  /** How loud a sound would be at the listener by the law of sound (audio/hearing.ts): 0 out of earshot. */
  levelAt(x: number, y: number, z: number, radius: number, lx: number, ly: number, lz: number): number {
    return this.ears.route(x, y, z, radius, lx, ly, lz, this.route)?.clarity ?? 0;
  }

  /** For the debug panel: two lines. */
  report(): string {
    if (this.failure) return `off · ${this.failure}`;
    const ctx = this.ctx;
    const e = this.engine;
    if (!ctx || !e) return 'waiting for the first click';
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    const heard = e
      .ambientHeard()
      .slice(0, 3)
      .map((a) => `${a.kind === 'water' ? 'creek' : 'generator'} ${a.distance.toFixed(0)} m${a.muffled ? ' muffled' : ''}`);
    return [
      `${ctx.state}${this.paused ? ' (ducked)' : ''} · ${(ctx.sampleRate / 1000).toFixed(1)} kHz · latency ${(latency * 1000).toFixed(0)} ms · ${e.activeVoices} voices`,
      heard.length ? `steady ${heard.join(' · ')}` : 'no steady sound in earshot',
    ].join('\n');
  }

  /** For automation: whether sound runs, and how many voices are sounding. */
  status(): { state: string; voices: number; ambient: number; failure: string | null } {
    return { state: this.ctx?.state ?? 'none', voices: this.engine?.activeVoices ?? 0, ambient: this.engine?.activeAmbient ?? 0, failure: this.failure };
  }

  private applyWorld(): void {
    const w = this.world;
    if (!w) return;
    this.guard(() => this.engine?.setWorld(ambientSources(w, this.tuning), air(w.spec.env).speedOfSound));
  }

  /** A hidden tab is silent; it carries on, ducked or not, when it comes back. */
  private visibility(): void {
    const ctx = this.ctx;
    if (!ctx || this.failure) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  }

  /** Runs audio work; a failure turns sound off with a reason instead of stopping the game. */
  private guard(work: () => void): void {
    if (this.failure) return;
    try {
      work();
    } catch (e) {
      this.failure = e instanceof Error ? e.message : String(e);
      console.warn('Sightline: sound turned off after an error', e);
      try {
        this.engine?.dispose();
        void this.ctx?.close();
      } catch {
        // Already broken; nothing more to do.
      }
      this.engine = null;
      this.ctx = null;
    }
  }
}

/** Slider position to gain: a square law, so the slider's middle sounds like its middle. */
export function gainOf(volume: number): number {
  const v = Math.max(0, Math.min(1, volume));
  return v * v;
}
