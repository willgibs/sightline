import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import { FixedStepClock } from '../sim/core/clock';
import { headingDegrees, lerp, moveTowards } from '../sim/core/math';
import { exposure } from '../sim/perception/visibility';
import { lightAt } from '../sim/env';
import { generateWorld, simTuningKey, worldTuningKey, type SpawnKind, type World } from '../sim/gen/world';
import { neutralInput } from '../sim/input';
import { Recorder } from '../sim/record/recording';
import { Simulation, type Snapshot } from '../sim/sim';
import { Blocks, type Collider } from '../sim/world/colliders';
import { emptyHit, raycast, type QueryBody } from '../sim/world/query';
import { Surface, surfaceName } from '../sim/world/surfaces';
import { GameRenderer, type CameraPose } from '../render/renderer';
import { Hud } from './hud';
import { InputController } from './input';
import { Overlay } from './overlay';
import { FrameStats, percentile } from './perf';
import { missionSpec } from '../sim/mission';
import { SystemProfile } from '../sim/profile';
import { BUILD } from './build';
import { tuningProblems } from '../config/validate';

/**
 * The browser game loop: real time in, fixed simulation ticks out, interpolated frames
 * drawn in between. Owns the simulation, the recorder, the renderer, input, the HUD and
 * the overlay, and the debug tools (views, fly camera, time scale, benchmark).
 */

export interface GameOptions {
  canvas: HTMLCanvasElement;
  hud: HTMLElement;
  overlay: HTMLElement;
  seed: string;
  tuning: Tuning;
  debug: boolean;
  spawn: SpawnKind;
  bench: boolean;
  pixelRatio: number;
}

const TIME_SCALES = [0.25, 0.5, 1, 2, 4, 8];
const BOB: Record<string, number> = { sprint: 0.05, walk: 0.026, crouch: 0.016, crawl: 0.01, idle: 0 };
const BENCH_SECONDS = 20;

interface Bench {
  start: number;
  path: THREE.CatmullRomCurve3;
  frames: number[];
  cpu: number[];
  calls: number[];
  triangles: number[];
}

export class Game {
  private tuning: Tuning;
  private world!: World;
  private sim!: Simulation;
  private recorder!: Recorder;
  private prev!: Snapshot;
  private curr!: Snapshot;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly hud: Hud;
  private readonly overlay: Overlay;
  private clock: FixedStepClock;
  private readonly stats = new FrameStats();
  private readonly raw = neutralInput();
  private readonly hit = emptyHit();
  private readonly queryBodies: QueryBody[] = [];
  private readonly spawnKind: SpawnKind;
  private debug: boolean;
  private colliders = false;
  private perches = false;
  private detached = false;
  private heldYaw = 0;
  private heldPitch = 0;
  private readonly fly = new THREE.Vector3();
  private timeScaleIndex = 2;
  private paused = true;
  private time = 0;
  private lastNow = 0;
  private panelTimer = 0;
  private zoom = 0;
  private bobPhase = 0;
  private aim: THREE.Vector3 | null = null;
  private aimText: string | null = null;
  /**
   * Average simulation cost per tick. Browsers coarsen performance.now() (to 0.1 ms in
   * Chrome), far coarser than a ~10 µs tick, so time is summed over a second of ticks.
   */
  private tickMs = 0;
  private tickTimeSum = 0;
  private tickCount = 0;
  private tickWindow = 0;
  /** Time per system, measured in the debug view only. */
  private readonly profile = new SystemProfile(() => performance.now());
  private systemCosts: ReturnType<SystemProfile['report']> = [];
  private bench: Bench | null = null;
  private benchRequested: boolean;

  constructor(private readonly opts: GameOptions) {
    this.tuning = opts.tuning;
    this.debug = opts.debug;
    this.spawnKind = opts.spawn;
    this.benchRequested = opts.bench;
    this.clock = new FixedStepClock(this.tuning.sim.tickHz);
    this.renderer = new GameRenderer(opts.canvas, this.tuning, opts.pixelRatio);
    this.input = new InputController(opts.canvas);
    this.hud = new Hud(opts.hud);
    this.overlay = new Overlay(opts.overlay, {
      onResume: () => this.resume(),
      onGenerate: (seed) => this.generate(seed),
      onSaveRecording: () => this.saveRecording(),
    });
    this.input.onAction = (code) => this.action(code);
    this.input.onLockChange = (locked) => (locked ? this.onLocked() : this.onUnlocked());
    this.renderer.setDebug(this.debug);
    this.hud.setDebug(this.debug);
    this.hud.setVisible(false);
  }

  start(): void {
    this.input.attach();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.generate(this.opts.seed);
    requestAnimationFrame(this.frame);
  }

  // --- World and runs. ---------------------------------------------------------------

  private generate(seed: string): void {
    // Hand the mouse back while the valley is rebuilt; the overlay invites the player back in.
    this.input.releaseLock();
    this.paused = true;
    this.hud.setVisible(false);
    this.overlay.setSeed(seed);
    this.overlay.show('loading');
    this.overlay.setStatus('');
    // Let the loading state paint before the main thread is busy generating.
    window.setTimeout(() => {
      const world = generateWorld(missionSpec(seed, this.spawnKind), this.tuning, () => performance.now());
      this.world = world;
      this.renderer.setWorld(world, this.tuning);
      this.restartRun();
      const url = new URL(window.location.href);
      url.searchParams.set('seed', seed);
      window.history.replaceState(null, '', url);
      this.overlay.setStatus(
        `${seed} · generated in ${Math.round(world.genMs)} ms${world.attempt ? ` after ${world.attempt} re-roll${world.attempt > 1 ? 's' : ''}` : ''}`,
      );
      if (this.benchRequested) {
        this.benchRequested = false;
        this.startBench();
      } else {
        this.overlay.show('start');
      }
    }, 30);
  }

  private restartRun(): void {
    this.sim = new Simulation(this.world, this.tuning);
    this.recorder = new Recorder(this.sim, BUILD);
    this.prev = this.sim.snapshot();
    this.curr = this.sim.snapshot();
    this.input.yaw = this.sim.player.yaw;
    // Start looking at the camp so the first frame frames the valley.
    const p = this.sim.player;
    const dist = Math.hypot(p.x, p.z);
    const drop = this.tuning.gen.world.padHeight + 1 - (p.y + p.eyeHeight);
    this.input.pitch = dist > 1 ? Math.max(-0.35, Math.min(0.1, Math.atan2(drop, dist))) : 0;
    this.clock.reset();
    this.bobPhase = 0;
    if (this.detached) this.setDetached(false);
  }

  /** Hot-reloaded tuning (dev only). */
  applyTuning(next: Tuning): void {
    const problems = tuningProblems(next);
    if (problems.length > 0) {
      // Keep playing on the last good numbers rather than handing bad ones to the simulation.
      this.hud.toast(`Tuning not applied: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
      console.warn('Tuning not applied:', problems);
      return;
    }
    const worldChanged = worldTuningKey(next) !== worldTuningKey(this.tuning);
    const simChanged = simTuningKey(next) !== simTuningKey(this.tuning);
    const tickChanged = next.sim.tickHz !== this.tuning.sim.tickHz || next.sim.recordHz !== this.tuning.sim.recordHz;
    this.tuning = next;
    this.renderer.setTuning(next);
    if (worldChanged) {
      this.hud.toast('World tuning changed · regenerating the valley');
      this.generate(this.world.seed);
    } else if (tickChanged) {
      this.clock = new FixedStepClock(next.sim.tickHz);
      this.restartRun();
      this.hud.toast(`Tick rate ${next.sim.tickHz} Hz · run restarted`);
    } else if (simChanged) {
      this.sim.setTuning(next);
      this.recorder.tuningChanged(this.sim);
      this.hud.toast('Tuning reloaded');
    } else {
      this.hud.toast('View tuning reloaded');
    }
  }

  // --- Pausing and input. --------------------------------------------------------------

  private resume(): void {
    if (this.overlay.currentMode === 'loading') return;
    this.input.requestLock();
  }

  private onLocked(): void {
    this.paused = false;
    this.overlay.hide();
    this.hud.setVisible(true);
    this.lastNow = 0;
  }

  private onUnlocked(): void {
    if (this.bench) return;
    this.paused = true;
    this.hud.setVisible(false);
    if (this.overlay.currentMode !== 'loading' || !this.overlay.visible) this.overlay.show('paused');
  }

  private action(code: string): void {
    switch (code) {
      case 'F3':
      case 'Backquote':
        this.setDebugView(!this.debug);
        break;
      case 'KeyB':
        if (!this.debug) return;
        this.colliders = !this.colliders;
        this.renderer.setColliders(this.colliders);
        this.hud.toast(this.colliders ? 'Colliders on · purple blocks all, blue movement, green sight' : 'Colliders off');
        break;
      case 'KeyO':
        if (!this.debug) return;
        this.perches = !this.perches;
        this.renderer.setPerches(this.perches);
        this.hud.toast(this.perches ? `Overwatch on · ${this.world.report.perches.length} perches` : 'Overwatch off');
        break;
      case 'KeyN':
        if (!this.debug) return;
        this.setDetached(!this.detached);
        break;
      case 'BracketLeft':
      case 'BracketRight': {
        if (!this.debug) return;
        const d = code === 'BracketLeft' ? -1 : 1;
        this.timeScaleIndex = Math.max(0, Math.min(TIME_SCALES.length - 1, this.timeScaleIndex + d));
        this.hud.toast(`Time ×${TIME_SCALES[this.timeScaleIndex]}`);
        break;
      }
      case 'KeyR':
        if (!this.debug) return;
        this.restartRun();
        this.hud.toast('Run restarted');
        break;
      case 'KeyM': {
        // A marker in the recording: "look at this moment" for a playtest or a bug report.
        this.recorder.annotate('marker');
        this.hud.toast(`Marked ${clock(this.sim.tick / this.tuning.sim.tickHz)} in the recording`);
        break;
      }
    }
  }

  private setDebugView(on: boolean): void {
    this.debug = on;
    this.renderer.setDebug(on);
    this.hud.setDebug(on);
    if (!on) {
      if (this.detached) this.setDetached(false);
      this.timeScaleIndex = 2;
    }
    this.hud.toast(on ? 'Debug view · everything the simulation knows' : 'Honest view · only what the game will show');
  }

  private setDetached(on: boolean): void {
    if (on === this.detached) return;
    this.detached = on;
    if (on) {
      this.heldYaw = this.input.yaw;
      this.heldPitch = this.input.pitch;
      const p = this.curr;
      this.fly.set(p.px, p.py + p.eye, p.pz);
      this.hud.toast('Fly camera · WASD, Space/E up, Q down, Shift fast · N to return');
    } else {
      this.input.yaw = this.heldYaw;
      this.input.pitch = this.heldPitch;
      this.hud.toast('Back in your body');
    }
  }

  private resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.hud.resizeCompass();
  }

  // --- The frame. ----------------------------------------------------------------------

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (!this.sim) return;
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.25) : 0;
    this.lastNow = now;
    const cpuStart = performance.now();
    this.time += dt;

    const V = this.tuning.view;
    this.zoom = moveTowards(this.zoom, this.input.zoomHeld && !this.paused ? 1 : 0, dt / Math.max(V.zoomTime, 1e-3));
    const eased = this.zoom * this.zoom * (3 - 2 * this.zoom);
    const fov = zoomFov(V.fov, V.zoomFov, eased);
    this.input.sensitivity = V.lookSensitivity;
    this.input.sensitivityScale = Math.tan((fov * Math.PI) / 360) / Math.tan((V.fov * Math.PI) / 360);
    this.input.pitchLimit = this.tuning.player.pitchLimit;

    if (!this.paused) {
      const ticks = this.clock.advance(dt * (this.debug ? TIME_SCALES[this.timeScaleIndex]! : 1));
      if (ticks > 0) {
        this.sim.profiler = this.debug ? this.profile : null;
        const t0 = performance.now();
        for (let i = 0; i < ticks; i++) this.tick();
        this.tickTimeSum += performance.now() - t0;
        this.tickCount += ticks;
      }
    }

    let pose: CameraPose;
    if (this.bench) pose = this.benchPose(now, fov);
    else if (this.detached) pose = this.flyPose(dt, fov);
    else pose = this.bodyPose(dt, fov);

    if (this.debug) this.updateAim(pose);
    this.renderer.render(this.prev, this.curr, this.clock.alpha, this.time, pose, this.debug ? this.aim : null);
    // A click from now on is about this frame.
    this.input.latch.frameShown(this.sim.tick, this.clock.alpha, pose.yaw, pose.pitch);
    this.hud.updateCompass(pose.yaw);
    this.hud.setRange(this.debug ? this.aimText : null);

    this.tickWindow += dt;
    if (this.tickWindow >= 1 && this.tickCount > 0) {
      this.tickMs = this.tickTimeSum / this.tickCount;
      this.systemCosts = this.profile.report(this.tickCount);
      this.profile.reset();
      this.tickTimeSum = 0;
      this.tickCount = 0;
      this.tickWindow = 0;
    }
    const cpu = performance.now() - cpuStart;
    this.stats.push(dt * 1000, cpu, this.tickMs);
    if (this.bench) this.benchFrame(now, dt, cpu);
    this.panelTimer -= dt;
    if (this.debug && this.panelTimer <= 0) {
      this.panelTimer = 0.125;
      this.hud.setPanel(this.panelText());
    }
  };

  private tick(): void {
    const frozen = this.detached || this.bench !== null;
    this.input.sampleTick(this.raw, frozen, this.sim.tick);
    if (frozen) {
      this.raw.yaw = this.detached ? this.heldYaw : this.sim.player.yaw;
      this.raw.pitch = this.detached ? this.heldPitch : this.sim.player.pitch;
    }
    const swap = this.prev;
    this.prev = this.curr;
    this.curr = swap;
    const events = this.sim.step(this.raw);
    this.recorder.record(this.sim, events);
    this.sim.snapshot(this.curr);
    if (events.length > 0) this.renderer.addEvents(events, this.time);
  }

  private bodyPose(dt: number, fov: number): CameraPose {
    const a = this.prev;
    const b = this.curr;
    const t = this.clock.alpha;
    const speed = lerp(a.speed, b.speed, t);
    const stride = b.gait === 'idle' ? 1 : this.tuning.player.stride[b.gait];
    this.bobPhase += (speed / stride) * Math.PI * dt;
    const bob = -(BOB[b.gait] ?? 0) * this.tuning.view.headBob * Math.abs(Math.sin(this.bobPhase));
    return {
      x: lerp(a.px, b.px, t),
      y: lerp(a.py, b.py, t) + lerp(a.eye, b.eye, t) + bob,
      z: lerp(a.pz, b.pz, t),
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      fov,
    };
  }

  private flyPose(dt: number, fov: number): CameraPose {
    const ax = this.input.flyAxes();
    const speed = (ax.fast ? 80 : 20) * dt;
    const yaw = this.input.yaw;
    const pitch = this.input.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.fly.x += (fx * ax.z + rx * ax.x) * speed;
    this.fly.y += (fy * ax.z + ax.y) * speed;
    this.fly.z += (fz * ax.z + rz * ax.x) * speed;
    const ground = this.world.terrain.heightAt(this.fly.x, this.fly.z) + 0.3;
    if (this.fly.y < ground) this.fly.y = ground;
    return { x: this.fly.x, y: this.fly.y, z: this.fly.z, yaw, pitch, fov };
  }

  /** Rangefinder for the debug view: what's under the crosshair, and how far. */
  private updateAim(pose: CameraPose): void {
    const cp = Math.cos(pose.pitch);
    const dx = -Math.sin(pose.yaw) * cp;
    const dy = Math.sin(pose.pitch);
    const dz = -Math.cos(pose.yaw) * cp;
    // The same query sight and shots use, ignoring the player's own body.
    const hit = raycast(this.world, this.sim.queryBodies(this.queryBodies), pose.x, pose.y, pose.z, dx, dy, dz, 2000, Blocks.Bullet, this.hit, this.sim.playerId);
    if (hit.what !== 'none') {
      const t = hit.dist;
      const what =
        hit.what === 'body' ? `guard ${hit.id} · ${hit.part}` : hit.what === 'collider' ? colliderLabel(this.world.colliders.list[hit.id]!) : 'terrain';
      this.aim = (this.aim ?? new THREE.Vector3()).set(hit.x, hit.y, hit.z);
      this.aimText = `${t < 10 ? t.toFixed(1) : Math.round(t)} m · ${what}`;
    } else {
      this.aim = null;
      this.aimText = null;
    }
  }

  private panelText(): string {
    const s = this.stats.summary();
    const r = this.renderer.stats();
    const p = this.sim.player;
    const w = this.world;
    const T = this.tuning;
    const played = this.sim.tick / T.sim.tickHz;
    const slopeDeg = (Math.atan(p.slopeTan) * 180) / Math.PI;
    // The light where the player's chest is: in the sun, or shaded by terrain or something solid.
    const light = lightAt(w, w.spec.env, this.sim.tick / T.sim.tickHz, p.x, p.y + p.eyeHeight * 0.75, p.z, T.visibility);
    const lightName = light === T.visibility.light.lit ? 'sun' : light === T.visibility.light.shade ? 'shade' : light === T.visibility.light.dusk ? 'dusk' : 'dark';
    const exp = exposure(p, T, light);
    const V = T.visibility;
    const moveFactor = p.gait === 'idle' ? V.movement.still : p.gait === 'sprint' ? V.movement.sprinting : V.movement.moving;
    const sizes = this.recorder.sizes;
    const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const mode = this.detached ? 'fly camera' : `${TIME_SCALES[this.timeScaleIndex]}× speed`;
    const lines = [
      `SIGHTLINE · PHASE 0 · DEBUG VIEW · build ${BUILD}`,
      `seed ${w.seed} · tick ${this.sim.tick.toLocaleString('en-US')} · ${clock(played)} played · ${mode}`,
      `${s.fps.toFixed(0)} fps · frame ${s.frameMs.toFixed(1)} ms (p95 ${s.p95Ms.toFixed(1)}) · cpu ${s.cpuMs.toFixed(1)} ms · sim ${(this.tickMs * 1000).toFixed(0)} µs/tick`,
      `${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris · ${(r.lines / 1000).toFixed(0)}k lines`,
      `systems ${this.systemCosts.map((c) => `${c.name} ${c.usPerTick.toFixed(0)}`).join(' · ') || '—'} µs`,
      ``,
      `PLAYER`,
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · heading ${headingDegrees(p.yaw).toFixed(0)}° · pitch ${((p.pitch * 180) / Math.PI).toFixed(0)}°`,
      `${p.stance}${p.proneTransition ? ' (changing)' : ''} · ${p.gait} ${p.speed.toFixed(2)} m/s · ${surfaceName(p.surface)}${p.standingOn >= 0 ? ' (object)' : `, slope ${slopeDeg.toFixed(0)}°`}`,
      `noise ${p.loudness.toFixed(2)} → heard within ${(p.loudness * T.noise.radiusPerUnit).toFixed(1)} m`,
      `seen ×${exp.toFixed(2)} = ${p.stance} ${V.stance[p.stance]} × ${p.gait === 'idle' ? 'still' : 'moving'} ${moveFactor} × ${lightName} ${light}`,
      `aim ${this.aimText ?? '—'}`,
      ``,
      `WORLD`,
      `relief ${w.terrain.minHeight.toFixed(0)} to ${w.terrain.maxHeight.toFixed(0)} m · ${w.features.saddles.length} passes · generated in ${Math.round(w.genMs)} ms`,
      `overwatch ${w.report.overwatchSectors}/8 directions · ${w.report.perches.length} perches · reachable from ${w.report.accessSectors}/16`,
      `${w.props.trees.length.toLocaleString('en-US')} trees · ${w.props.rocks.length.toLocaleString('en-US')} rocks · ${w.props.bushes.length.toLocaleString('en-US')} bushes · ${w.camp.guards.length} guards`,
      `recording ${kb(sizes.inputs)} inputs · ${kb(sizes.states)} states · ${kb(sizes.events)} events`,
    ];
    return lines.join('\n');
  }

  private saveRecording(): void {
    if (!this.sim) return;
    const rec = this.recorder.finish(this.sim, new Date().toISOString());
    const blob = new Blob(rec.toParts() as BlobPart[], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sightline-${this.world.seed}-${this.sim.tick}.slrec`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.overlay.setStatus(`Saved ${a.download} · replay it with npm run sim -- --replay ${a.download}`);
  }

  // --- Automation (window.sightline). ----------------------------------------------------

  /**
   * Hooks for scripted screenshots, visual checks and future bot playtests. Available in
   * the browser console as `sightline`.
   */
  automation() {
    const rad = Math.PI / 180;
    return {
      play: () => {
        this.paused = false;
        this.overlay.hide();
        this.hud.setVisible(true);
        this.lastNow = 0;
      },
      pause: () => {
        this.paused = true;
      },
      debug: (on: boolean) => this.setDebugView(on),
      colliders: (on: boolean) => {
        this.colliders = on;
        this.renderer.setColliders(on);
      },
      overwatch: (on: boolean) => {
        this.perches = on;
        this.renderer.setPerches(on);
      },
      look: (headingDeg: number, pitchDeg = 0) => {
        this.input.yaw = -headingDeg * rad;
        this.input.pitch = pitchDeg * rad;
      },
      fly: (x: number, y: number, z: number, headingDeg: number, pitchDeg: number) => {
        this.setDetached(true);
        this.fly.set(x, y, z);
        this.input.yaw = -headingDeg * rad;
        this.input.pitch = pitchDeg * rad;
      },
      body: () => this.setDetached(false),
      hold: (codes: string[]) => this.input.holdKeys(codes),
      tap: (code: 'KeyC' | 'KeyZ') => this.input.tap(code),
      /** Click as if the left button were pressed now: a shot from the frame on screen. */
      click: () => this.input.click(),
      zoom: (on: boolean) => {
        this.input.zoomHeld = on;
      },
      generate: (seed: string) => this.generate(seed),
      /** Full simulation state and its hash, for determinism checks. */
      dump: () => ({ tick: this.sim.tick, hash: this.sim.hash(), player: { ...this.sim.player }, guards: this.sim.guards.map((g) => ({ ...g })) }),
      /** The current run's recording as base64, for re-simulating it outside the browser. */
      recording: () => {
        const bytes = this.recorder.finish(this.sim, new Date().toISOString()).toBytes();
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
        return btoa(bin);
      },
      fog: (density: number) => this.renderer.setTuning({ ...this.tuning, view: { ...this.tuning.view, fogDensity: density } }),
      state: () => ({
        seed: this.world?.seed,
        tick: this.sim?.tick,
        player: this.sim ? { ...this.sim.player } : null,
        perf: this.stats.summary(),
        render: this.renderer.stats(),
        aim: this.aimText,
        overlay: this.overlay.currentMode,
        overlayVisible: this.overlay.visible,
        spawn: this.world?.spawn,
        camp: this.world ? { axis: this.world.features.campAxis, perches: this.world.report.perches.length } : null,
      }),
    };
  }

  // --- Benchmark (?bench). ---------------------------------------------------------------

  private startBench(): void {
    const s = this.world.spawn;
    const sy = this.world.terrain.heightAt(s.x, s.z);
    const opposite = this.world.report.perches.reduce(
      (best, p) => (p.x * s.x + p.z * s.z < best.x * s.x + best.z * s.z ? p : best),
      this.world.report.perches[0] ?? { x: -s.x, y: sy, z: -s.z },
    );
    const pts = [
      new THREE.Vector3(s.x, sy + 1.7, s.z),
      new THREE.Vector3(s.x * 0.55, sy + 25, s.z * 0.55),
      new THREE.Vector3(s.x * 0.15, 12, s.z * 0.15),
      new THREE.Vector3(-s.x * 0.05 + 8, 2.2, -s.z * 0.05),
      new THREE.Vector3(opposite.x * 0.5, 18, opposite.z * 0.5),
      new THREE.Vector3(opposite.x, opposite.y + 2, opposite.z),
    ];
    this.bench = { start: 0, path: new THREE.CatmullRomCurve3(pts), frames: [], cpu: [], calls: [], triangles: [] };
    this.paused = false;
    this.overlay.hide();
    this.hud.setVisible(true);
    this.setDebugView(false);
  }

  private benchPose(now: number, fov: number): CameraPose {
    const b = this.bench!;
    if (b.start === 0) b.start = now;
    const t = Math.min(1, (now - b.start) / 1000 / BENCH_SECONDS);
    const p = b.path.getPointAt(t);
    const ahead = b.path.getPointAt(Math.min(1, t + 0.02));
    const target = t < 0.55 ? new THREE.Vector3(0, 2, 0) : t > 0.9 ? new THREE.Vector3(0, 2, 0) : ahead;
    const d = target.clone().sub(p);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    return { x: p.x, y: p.y, z: p.z, yaw, pitch, fov };
  }

  private benchFrame(now: number, dt: number, cpu: number): void {
    const b = this.bench!;
    if (b.start === 0 || dt === 0) return;
    const r = this.renderer.stats();
    b.frames.push(dt * 1000);
    b.cpu.push(cpu);
    b.calls.push(r.calls);
    b.triangles.push(r.triangles);
    if ((now - b.start) / 1000 < BENCH_SECONDS) return;
    const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const canvas = this.opts.canvas;
    const result = {
      seed: this.world.seed,
      gpu: this.renderer.gpuName(),
      resolution: `${canvas.width}×${canvas.height} (pixel ratio ${this.renderer.gl.getPixelRatio()})`,
      frames: b.frames.length,
      fps: 1000 / mean(b.frames),
      p50Ms: percentile(b.frames, 0.5),
      p95Ms: percentile(b.frames, 0.95),
      p99Ms: percentile(b.frames, 0.99),
      cpuMs: mean(b.cpu),
      drawCalls: Math.round(mean(b.calls)),
      triangles: Math.round(mean(b.triangles)),
      generationMs: Math.round(this.world.genMs),
    };
    (window as unknown as { __SIGHTLINE_BENCH__: unknown }).__SIGHTLINE_BENCH__ = result;
    console.log('[sightline] benchmark', JSON.stringify(result));
    this.bench = null;
    this.paused = true;
    this.hud.setVisible(false);
    this.overlay.setReport(
      [
        `${result.fps.toFixed(1)} fps average over ${result.frames} frames (${BENCH_SECONDS} s flythrough)`,
        `frame time p50 ${result.p50Ms.toFixed(1)} ms · p95 ${result.p95Ms.toFixed(1)} ms · p99 ${result.p99Ms.toFixed(1)} ms`,
        `cpu per frame ${result.cpuMs.toFixed(2)} ms · ${result.drawCalls} draw calls · ${(result.triangles / 1000).toFixed(0)}k triangles`,
        `${result.resolution}`,
        `${result.gpu}`,
        `budget: 60 fps (16.7 ms) on a mid-range laptop at 1080p`,
      ].join('\n'),
    );
    this.overlay.show('report');
    this.restartRun();
  }
}

function zoomFov(base: number, zoomed: number, t: number): number {
  // Interpolate in tan space so the zoom feels linear in magnification.
  const a = Math.tan((base * Math.PI) / 360);
  const b = Math.tan((zoomed * Math.PI) / 360);
  return (Math.atan(lerp(a, b, t)) * 360) / Math.PI;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function colliderLabel(c: Collider): string {
  if (c.kind === 'cyl' && c.surface === Surface.Wood) return 'tree';
  if (c.surface === Surface.Rock) return 'rock';
  if (c.surface === Surface.Metal) return 'metal';
  return 'structure';
}

/** Ray against an upright cylinder standing at (x, y, z). */
