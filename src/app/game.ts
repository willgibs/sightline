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
import type { SimEvent } from '../sim/events';
import { normalizeSeed } from '../sim/core/seed';
import { Blocks, type Collider } from '../sim/world/colliders';
import { emptyHit, raycast } from '../sim/world/query';
import { entityOfCollider } from '../sim/world/solids';
import { Surface, surfaceName } from '../sim/world/surfaces';
import { GameRenderer, type CameraPose } from '../render/renderer';
import { palette } from '../render/palette';
import { Hud } from './hud';
import { InputController } from './input';
import { Overlay } from './overlay';
import { FrameStats, percentile } from './perf';
import { missionSpec } from '../sim/mission';
import { startScene, type Scene } from '../sim/scene';
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
  /** The ratio follows the screen the window is on (no ?dpr given). */
  pixelRatioFollowsScreen: boolean;
  /** A scene to play (?scene=), instead of a valley from the seed; undefined if the name matched none. */
  scene: Scene | null | undefined;
  sceneName: string | null;
}

const TIME_SCALES = [0.25, 0.5, 1, 2, 4, 8];
/** Seconds of unsaved play after which closing the tab asks first (in the deployed game). */
const UNSAVED_WARNING_SECONDS = 60;

/** What went wrong, once something has: the run stops there until the player tries again. */
interface Failure {
  where: 'generate' | 'tick' | 'frame' | 'page' | 'context';
  message: string;
}
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
  private gridShown = false;
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
  /** Game seconds per real second over the last window: what the time scale actually delivered. */
  private deliveredScale = 1;
  /** Time per system, measured in the debug view only. */
  private readonly profile = new SystemProfile(() => performance.now());
  private systemCosts: ReturnType<SystemProfile['report']> = [];
  private bench: Bench | null = null;
  private benchRequested: boolean;
  private failure: Failure | null = null;
  /** What "try again" does after the failure on screen. */
  private retry: () => void = () => undefined;
  /** The tick of the last saved recording, so leaving with unsaved play can ask first. */
  private savedTick = 0;
  /** The seed being generated or last generated. */
  private seed = '';
  /** The rules decided the run during the last ticks: show the outcome once they're drawn. */
  private decided = false;
  private readonly drawnLabels: Array<{ x: number; y: number; text: string; color: string }> = [];
  /** The scene being played, if any (sim/scene.ts): its world, systems and setup. */
  private scene: Scene | null;
  /** What the last drawn frame showed, so a paused screen isn't drawn again unchanged. */
  private readonly drawnPose: CameraPose = { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0, fov: 0 };
  private drawnKey = '';
  private redraws = 0;

  constructor(private readonly opts: GameOptions) {
    this.tuning = opts.tuning;
    this.debug = opts.debug;
    this.spawnKind = opts.spawn;
    this.benchRequested = opts.bench;
    this.scene = opts.scene ?? null;
    this.clock = new FixedStepClock(this.tuning.sim.tickHz);
    this.renderer = new GameRenderer(opts.canvas, this.tuning, opts.pixelRatio);
    this.input = new InputController(opts.canvas);
    this.hud = new Hud(opts.hud);
    this.overlay = new Overlay(opts.overlay, {
      onResume: () => this.resume(),
      onGenerate: (seed) => {
        // Generating a valley leaves the scene.
        this.scene = null;
        this.generate(seed);
      },
      onSaveRecording: () => this.saveRecording(),
      onRetry: () => {
        const retry = this.retry;
        this.failure = null;
        this.retry = () => undefined;
        retry();
      },
    });
    this.input.onAction = (code) => this.action(code);
    this.input.onLockChange = (locked) => (locked ? this.onLocked() : this.onUnlocked());
    this.input.onLockRefused = () => {
      if (!this.overlay.visible || this.failure) return;
      this.overlay.setStatus(
        window.top !== window
          ? 'The browser refused to capture the mouse in this frame · open the game in its own tab'
          : 'The browser refused to capture the mouse · wait a moment after Esc, then click again',
      );
    };
    this.renderer.setDebug(this.debug);
    this.hud.setDebug(this.debug);
    this.hud.setVisible(false);
  }

  start(): void {
    this.input.attach();
    window.addEventListener('resize', () => this.resize());
    this.watchPixelRatio();
    this.resize();
    // Errors anywhere in the game stop the run and say so, instead of failing silently.
    window.addEventListener('error', (e) => {
      if (e.filename && !e.filename.startsWith(window.location.origin)) return; // an extension's, not ours
      this.fail('page', e.error ?? e.message);
    });
    window.addEventListener('unhandledrejection', (e) => this.fail('page', e.reason));
    // The GPU can take the context away (a driver reset, too many tabs): pause, and come back when it returns.
    this.opts.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.fail('context', 'The browser took the graphics context away');
    });
    this.opts.canvas.addEventListener('webglcontextrestored', () => {
      if (this.failure?.where !== 'context') return;
      this.failure = null;
      this.redraws++;
      this.overlay.show('paused');
    });
    // Closing the tab with a minute or more of unsaved play asks first, in the deployed game
    // (in development, Vite reloads the page after code changes and must not be stopped).
    window.addEventListener('beforeunload', (e) => {
      if (!import.meta.env.PROD || !this.sim || this.bench) return;
      if ((this.sim.tick - this.savedTick) / this.tuning.sim.tickHz < UNSAVED_WARNING_SECONDS) return;
      e.preventDefault();
    });
    this.generate(this.opts.seed);
    requestAnimationFrame(this.frame);
  }

  /**
   * Something failed: stop where it happened, say what and why, and keep what can still
   * be saved. Only the first failure is shown; trying again clears it.
   */
  private fail(where: Failure['where'], error: unknown): void {
    if (this.failure) return;
    const message = error instanceof Error ? error.message : String(error);
    this.failure = { where, message };
    if (where !== 'context') console.error(`Sightline: ${where} failed`, error);
    this.paused = true;
    this.input.releaseLock();
    this.hud.setVisible(false);
    const stack = error instanceof Error && error.stack ? `\n\n${error.stack.split('\n').slice(1, 7).join('\n')}` : '';
    if (where === 'generate') {
      const seed = this.seed;
      this.retry = () => this.generate(seed);
      this.overlay.showMessage('error', `The valley ${seed} could not be generated`, `${message}${stack}`, 'Try again');
    } else if (where === 'tick') {
      const f = this.sim.fault;
      this.retry = () => this.restartRunFromStart();
      this.overlay.showMessage('error', 
        `The simulation failed at tick ${f?.tick ?? this.sim.tick + 1}`,
        `${f ? `${f.system}: ` : ''}${message}${stack}\n\nThe run stopped there. Save the recording to reproduce it with npm run sim -- --replay.`,
        'Restart the run',
      );
    } else if (where === 'context') {
      this.retry = () => window.location.reload();
      this.overlay.showMessage('error', 
        'The screen was lost',
        'The browser took the graphics context away (a driver reset, or too many tabs using the GPU). The run is kept; it carries on when the browser gives the context back. Save the recording first if you reload.',
        'Reload the page',
      );
    } else {
      // Drawing or the page failed, not the simulation: the run itself is intact and can go on.
      this.retry = () => {
        this.redraws++;
        this.overlay.show('paused');
      };
      this.overlay.showMessage('error', 'Something went wrong', `${message}${stack}\n\nThe run is paused and intact.`, 'Carry on');
    }
  }

  /**
   * The rules decided the run (a scene's, or later the mission's): stop, and say how it
   * went. The recording can still be saved; playing again starts a fresh run.
   */
  private showOutcome(): void {
    const o = this.sim.state.outcome;
    this.paused = true;
    this.hud.setVisible(false);
    this.retry = () => {
      this.restartRun();
      this.resume();
    };
    const when = clock(o.tick / this.tuning.sim.tickHz);
    this.overlay.showMessage(
      'outcome',
      o.status === 'succeeded' ? `Done · ${when}` : `Failed · ${when}`,
      `${o.reason.charAt(0).toUpperCase()}${o.reason.slice(1)}.`,
      'Play again',
    );
    this.input.releaseLock();
  }

  /** A fresh run in the same valley, from the start screen. */
  private restartRunFromStart(): void {
    if (!this.world) {
      this.generate(this.seed);
      return;
    }
    this.restartRun();
    this.overlay.show('start');
  }

  /** Tells the player something: in the HUD while playing, in the overlay's status line while it is up. */
  private notify(text: string): void {
    if (this.overlay.visible) this.overlay.setStatus(text);
    else this.hud.toast(text);
  }

  // --- World and runs. ---------------------------------------------------------------

  private generate(seed: string): void {
    this.seed = seed;
    this.failure = null;
    // Hand the mouse back while the valley is rebuilt; the overlay invites the player back in.
    this.input.releaseLock();
    this.paused = true;
    this.hud.setVisible(false);
    this.overlay.setSeed(seed);
    this.overlay.show('loading');
    this.overlay.setStatus('');
    // Let the loading state paint before the main thread is busy generating.
    window.setTimeout(() => {
      let world: World;
      try {
        if (this.opts.sceneName && this.opts.scene === undefined) throw new Error(`There is no scene called '${this.opts.sceneName}'`);
        const t0 = performance.now();
        world = this.scene ? this.scene.world(this.tuning) : generateWorld(missionSpec(seed, this.spawnKind), this.tuning, () => performance.now());
        if (this.scene) world.genMs = performance.now() - t0;
      } catch (e) {
        this.fail('generate', e);
        return;
      }
      this.world = world;
      this.renderer.setWorld(world, this.tuning);
      this.restartRun();
      const url = new URL(window.location.href);
      if (this.scene) {
        url.searchParams.delete('seed');
        url.searchParams.set('scene', this.scene.name);
      } else {
        url.searchParams.delete('scene');
        url.searchParams.set('seed', seed);
      }
      window.history.replaceState(null, '', url);
      this.overlay.setStartTitle(this.scene ? `Scene · ${this.scene.title}` : 'Phase 0 · Foundations');
      this.overlay.setStatus(
        this.scene
          ? this.scene.description
          : `${seed} · generated in ${Math.round(world.genMs)} ms${world.attempt ? ` after ${world.attempt} re-roll${world.attempt > 1 ? 's' : ''}` : ''}`,
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
    this.sim = this.scene ? startScene(this.scene, this.tuning, this.world) : new Simulation(this.world, this.tuning);
    this.recorder = new Recorder(this.sim, BUILD);
    this.savedTick = 0;
    this.failure = null;
    this.sim.drawDebug = this.debug;
    this.redraws++;
    // From the tuning in force: a save can change the tick rate and the world together.
    this.clock = new FixedStepClock(this.tuning.sim.tickHz);
    this.prev = this.sim.snapshot();
    this.curr = this.sim.snapshot();
    this.input.yaw = this.sim.player.yaw;
    // Start looking at the camp so the first frame frames the valley.
    const p = this.sim.player;
    const site = this.world.camp.site;
    const dist = Math.hypot(p.x - site.x, p.z - site.z);
    const drop = site.height + 1 - (p.y + p.eyeHeight);
    this.input.pitch = dist > 1 ? Math.max(-0.35, Math.min(0.1, Math.atan2(drop, dist))) : 0;
    this.bobPhase = 0;
    if (this.detached) this.setDetached(false);
  }

  /** Hot-reloaded tuning (dev only). */
  applyTuning(next: Tuning): void {
    const problems = tuningProblems(next);
    if (problems.length > 0) {
      // Keep playing on the last good numbers rather than handing bad ones to the simulation.
      const shape = problems.some((p) => / is (missing|not a tuning value)$/.test(p) || / should be /.test(p));
      this.notify(`Tuning not applied: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}${shape ? ' · its shape changed: reload the page' : ''}`);
      console.warn('Tuning not applied:', problems);
      return;
    }
    const worldChanged = worldTuningKey(next) !== worldTuningKey(this.tuning);
    const simChanged = simTuningKey(next) !== simTuningKey(this.tuning);
    const tickChanged = next.sim.tickHz !== this.tuning.sim.tickHz || next.sim.recordHz !== this.tuning.sim.recordHz;
    this.tuning = next;
    this.renderer.setTuning(next);
    if (worldChanged) {
      this.notify('World tuning changed · regenerating the valley');
      this.generate(this.world.seed);
    } else if (tickChanged) {
      this.restartRun();
      this.notify(`Tick rate ${next.sim.tickHz} Hz · run restarted`);
    } else if (simChanged) {
      if (!this.sim.fault) {
        this.sim.setTuning(next);
        this.recorder.tuningChanged(this.sim);
      }
      this.notify('Tuning reloaded');
    } else {
      this.notify('View tuning reloaded');
    }
  }

  // --- Pausing and input. --------------------------------------------------------------

  private resume(): void {
    if (this.overlay.currentMode === 'loading' || this.failure) return;
    this.input.requestLock();
  }

  private onLocked(): void {
    this.paused = false;
    this.overlay.hide();
    this.hud.setVisible(true);
    this.lastNow = 0;
  }

  private onUnlocked(): void {
    if (this.bench || this.failure || (this.overlay.visible && this.overlay.currentMode === 'outcome')) return;
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
      case 'KeyG':
        if (!this.debug) return;
        this.gridShown = !this.gridShown;
        this.renderer.setGrid(this.gridShown);
        this.hud.toast(this.gridShown ? 'Grid on · orange no body fits, purple stops sound, blue roofed' : 'Grid off');
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
    if (this.sim) this.sim.drawDebug = on;
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
    this.redraws++;
  }

  /** Everything besides the pose that changes the picture. */
  private viewKey(): string {
    return `${this.redraws}|${this.debug}|${this.colliders}|${this.perches}|${this.gridShown}|${this.sim.tick}|${this.world.seed}|${this.tuning.view.fogDensity}`;
  }

  /**
   * Moving the window to a screen with another pixel density changes the ratio without a
   * resize event; a media query on the current ratio fires when it changes.
   */
  private watchPixelRatio(): void {
    const ratio = window.devicePixelRatio || 1;
    window.matchMedia(`(resolution: ${ratio}dppx)`).addEventListener(
      'change',
      () => {
        if (this.opts.pixelRatioFollowsScreen) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.resize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  // --- The frame. ----------------------------------------------------------------------

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    // After a failure nothing more runs or draws: the last frame stays under the message.
    if (!this.sim || this.failure) return;
    try {
      this.drawFrame(now);
    } catch (e) {
      this.fail('frame', e);
    }
  };

  private drawFrame(now: number): void {
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.25) : 0;
    this.lastNow = now;
    const cpuStart = performance.now();
    // Paused means still: animation time and the head bob stop with the simulation.
    if (!this.paused) this.time += dt;

    const V = this.tuning.view;
    this.zoom = moveTowards(this.zoom, this.input.zoomHeld && !this.paused ? 1 : 0, dt / Math.max(V.zoomTime, 1e-3));
    const eased = this.zoom * this.zoom * (3 - 2 * this.zoom);
    // The window's shape sets the view, within limits; zooming keeps its magnification.
    const base = fitFov(V.fov, window.innerWidth / Math.max(1, window.innerHeight));
    const fov = zoomFov(base, scaleFov(V.zoomFov, Math.tan((base * Math.PI) / 360) / Math.tan((V.fov * Math.PI) / 360)), eased);
    this.input.sensitivity = V.lookSensitivity;
    this.input.sensitivityScale = Math.tan((fov * Math.PI) / 360) / Math.tan((base * Math.PI) / 360);
    this.input.pitchLimit = this.tuning.bodies.player.pitchLimit;

    if (!this.paused) {
      const ticks = this.clock.advance(dt, this.debug ? TIME_SCALES[this.timeScaleIndex]! : 1);
      if (ticks > 0) {
        this.sim.profiler = this.debug ? this.profile : null;
        const t0 = performance.now();
        for (let i = 0; i < ticks && !this.failure && !this.decided; i++) this.tick();
        if (this.failure) return;
        if (this.decided) {
          this.decided = false;
          this.showOutcome();
        }
        this.tickTimeSum += performance.now() - t0;
        this.tickCount += ticks;
      }
    }

    let pose: CameraPose;
    if (this.bench) pose = this.benchPose(now, fov);
    else if (this.detached) pose = this.flyPose(dt, fov);
    else pose = this.bodyPose(dt, fov);

    if (this.debug) {
      this.updateAim(pose);
      this.showDrawn();
    }
    // While paused, draw only when the picture would change: a view toggled, a new valley, the window resized.
    const still = this.paused && !this.bench && samePose(pose, this.drawnPose) && this.drawnKey === this.viewKey();
    if (!still) {
      this.renderer.render(this.prev, this.curr, this.clock.alpha, this.time, pose, this.debug ? this.aim : null);
      Object.assign(this.drawnPose, pose);
      this.drawnKey = this.viewKey();
    }
    // A click from now on is about this frame.
    this.input.latch.frameShown(this.sim.tick, this.clock.alpha, pose.yaw, pose.pitch);
    this.hud.updateCompass(pose.yaw);
    this.hud.setRange(this.debug ? this.aimText : null);

    if (!this.paused) this.tickWindow += dt;
    if (this.tickWindow >= 1 && this.tickCount > 0) {
      this.tickMs = this.tickTimeSum / this.tickCount;
      this.deliveredScale = this.tickCount / this.tuning.sim.tickHz / this.tickWindow;
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
  }

  private tick(): void {
    const frozen = this.detached || this.bench !== null;
    this.input.sampleTick(this.raw, frozen, this.sim.tick);
    if (frozen) {
      this.raw.yaw = this.detached ? this.heldYaw : this.sim.player.yaw;
      this.raw.pitch = this.detached ? this.heldPitch : this.sim.player.pitch;
    }
    let events: readonly SimEvent[];
    try {
      events = this.sim.step(this.raw);
    } catch (e) {
      // The state is partway through the tick: keep the failing input, and stop.
      this.recorder.recordFault(this.sim);
      this.fail('tick', e);
      return;
    }
    const swap = this.prev;
    this.prev = this.curr;
    this.curr = swap;
    this.recorder.record(this.sim, events);
    this.sim.snapshot(this.curr);
    for (const e of events) if (e.type === 'outcome') this.decided = true;
    if (events.length > 0) this.renderer.addEvents(events, this.time);
  }

  private bodyPose(dt: number, fov: number): CameraPose {
    const a = this.prev;
    const b = this.curr;
    const t = this.clock.alpha;
    const speed = lerp(a.speed, b.speed, t);
    const stride = b.gait === 'idle' ? 1 : this.tuning.bodies.player.stride[b.gait];
    if (!this.paused) this.bobPhase += (speed / stride) * Math.PI * dt;
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

  /** What systems drew in their last tick: lines in the world, labels in the HUD. */
  private showDrawn(): void {
    const shapes = this.sim.debugCanvas.shapes;
    this.renderer.setDrawn(shapes, this.sim.tick);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.drawnLabels.length = 0;
    for (const s of shapes) {
      if (s.kind !== 'label') continue;
      const at = this.renderer.project(s.x, s.y, s.z, w, h);
      if (at) this.drawnLabels.push({ x: at.x, y: at.y, text: s.text, color: palette.debug.tones[s.tone] });
    }
    this.hud.setLabels(this.drawnLabels);
  }

  /** Rangefinder for the debug view: what's under the crosshair, and how far. */
  private updateAim(pose: CameraPose): void {
    if (![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) {
      this.aim = null;
      this.aimText = null;
      return;
    }
    const cp = Math.cos(pose.pitch);
    const dx = -Math.sin(pose.yaw) * cp;
    const dy = Math.sin(pose.pitch);
    const dz = -Math.cos(pose.yaw) * cp;
    // The same query sight and shots use, ignoring the player's own body.
    const hit = raycast(this.sim.queryView(), pose.x, pose.y, pose.z, dx, dy, dz, 2000, Blocks.Bullet, this.hit, this.sim.playerId);
    if (hit.what !== 'none') {
      const t = hit.dist;
      const what =
        hit.what === 'body'
          ? `guard ${hit.id} · ${hit.part}`
          : hit.what === 'collider'
            ? entityOfCollider(hit.id) >= 0
              ? `solid ${entityOfCollider(hit.id)}`
              : colliderLabel(this.sim.solids.get(hit.id))
            : 'terrain';
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
    const light = lightAt(w, this.sim.solids, w.spec.env, this.sim.tick / T.sim.tickHz, p.x, p.y + p.eyeHeight * 0.75, p.z, T.visibility);
    const lightName = light === T.visibility.light.lit ? 'sun' : light === T.visibility.light.shade ? 'shade' : light === T.visibility.light.dusk ? 'dusk' : 'dark';
    const exp = exposure(p, T.bodies.player, T, light);
    const V = T.visibility;
    const moveFactor = p.gait === 'idle' ? V.movement.still : p.gait === 'sprint' ? V.movement.sprinting : V.movement.moving;
    const sizes = this.recorder.sizes;
    const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const scale = TIME_SCALES[this.timeScaleIndex]!;
    // A slow machine can't always run the ticks fast-forward asks for (8 a frame at most, times the scale).
    const short = Math.abs(this.deliveredScale - scale) > 0.05 * scale ? ` (${this.deliveredScale.toFixed(1)}× delivered)` : '';
    const mode = this.detached ? 'fly camera' : `${scale}× speed${short}`;
    const lines = [
      `SIGHTLINE · PHASE 0 · DEBUG VIEW · build ${BUILD}${this.scene ? ` · scene ${this.scene.name} v${this.scene.version}` : ''}`,
      `seed ${w.seed} · tick ${this.sim.tick.toLocaleString('en-US')} · ${clock(played)} played · ${mode}`,
      `${s.fps.toFixed(0)} fps · frame ${s.frameMs.toFixed(1)} ms (p95 ${s.p95Ms.toFixed(1)}) · cpu ${s.cpuMs.toFixed(1)} ms · sim ${(this.tickMs * 1000).toFixed(0)} µs/tick`,
      `${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris · ${(r.lines / 1000).toFixed(0)}k lines`,
      `systems ${this.systemCosts.map((c) => `${c.name} ${c.usPerTick.toFixed(0)}`).join(' · ') || '—'} µs`,
      ``,
      `PLAYER`,
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · heading ${headingDegrees(p.yaw).toFixed(0)}° · pitch ${((p.pitch * 180) / Math.PI).toFixed(0)}°`,
      `${p.stance}${p.proneTransition ? ' (changing)' : ''} · ${p.gait} ${p.speed.toFixed(2)} m/s · ${surfaceName(p.surface)}${p.standingOn >= 0 ? ' (object)' : `, slope ${slopeDeg.toFixed(0)}°`}`,
      `noise ${p.loudness.toFixed(2)} → heard within ${(p.loudness * T.noise.radiusPerUnit).toFixed(1)} m`,
      `outcome ${this.sim.state.outcome.status}${this.sim.state.outcome.reason ? ` · ${this.sim.state.outcome.reason}` : ''}`,
      `seen ×${exp.toFixed(2)} = ${p.stance} ${V.stance[p.stance]} × ${p.gait === 'idle' ? 'still' : 'moving'} ${moveFactor} × ${lightName} ${light}`,
      `aim ${this.aimText ?? '—'}`,
      ``,
      `WORLD`,
      `relief ${w.terrain.minHeight.toFixed(0)} to ${w.terrain.maxHeight.toFixed(0)} m · ${w.features.saddles.length} passes · generated in ${Math.round(w.genMs)} ms`,
      `overwatch ${w.report.overwatchSectors}/8 directions · ${w.report.perches.length} perches · reachable from ${w.report.accessSectors}/16`,
      `${w.props.trees.length.toLocaleString('en-US')} trees · ${w.props.rocks.length.toLocaleString('en-US')} rocks · ${w.props.bushes.length.toLocaleString('en-US')} bushes · ${w.camp.guards.length} guards${this.sim.solids.count ? ` · ${this.sim.solids.count} solid entities` : ''}`,
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
    this.savedTick = this.sim.tick;
    this.overlay.setStatus(`Saved ${a.download} · to re-simulate it: npm run sim -- --replay <folder>/${a.download}`);
  }

  // --- Automation (window.sightline). ----------------------------------------------------

  /**
   * Hooks for scripted screenshots, visual checks and future bot playtests. Available in
   * the browser console as `sightline`.
   */
  automation() {
    const rad = Math.PI / 180;
    const ready = (what: string): void => {
      if (!this.sim) throw new Error(`sightline.${what}() needs the valley first: wait until state().overlay is 'start'`);
    };
    const finite = (what: string, ...xs: unknown[]): void => {
      if (!xs.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new TypeError(`sightline.${what}() takes finite numbers, got ${xs.map(String).join(', ')}`);
    };
    return {
      play: () => {
        ready('play');
        this.paused = false;
        this.overlay.hide();
        this.hud.setVisible(true);
        this.lastNow = 0;
      },
      pause: () => {
        this.paused = true;
      },
      debug: (on: boolean) => this.setDebugView(on === true),
      colliders: (on: boolean) => {
        this.colliders = on;
        this.renderer.setColliders(on);
      },
      grid: (on: boolean) => {
        this.gridShown = on;
        this.renderer.setGrid(on);
      },
      overwatch: (on: boolean) => {
        this.perches = on;
        this.renderer.setPerches(on);
      },
      look: (headingDeg: number, pitchDeg = 0) => {
        finite('look', headingDeg, pitchDeg);
        this.input.yaw = -headingDeg * rad;
        this.input.pitch = pitchDeg * rad;
      },
      fly: (x: number, y: number, z: number, headingDeg = 0, pitchDeg = 0) => {
        ready('fly');
        finite('fly', x, y, z, headingDeg, pitchDeg);
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
      generate: (seed: string) => {
        if (typeof seed !== 'string') throw new TypeError('sightline.generate() takes a seed, such as "TAL-4471"');
        this.generate(normalizeSeed(seed));
      },
      /** Full simulation state and its hash, for determinism checks. */
      dump: () => {
        ready('dump');
        return { tick: this.sim.tick, hash: this.sim.hash(), player: { ...this.sim.player }, guards: this.sim.guards.map((g) => ({ ...g })) };
      },
      /** The current run's recording as base64, for re-simulating it outside the browser. */
      recording: () => {
        ready('recording');
        const bytes = this.recorder.finish(this.sim, new Date().toISOString()).toBytes();
        // In slices: one character at a time takes half a second an hour of play.
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      fog: (density: number) => {
        finite('fog', density);
        this.renderer.setTuning({ ...this.tuning, view: { ...this.tuning.view, fogDensity: Math.max(0, density) } });
      },
      state: () => ({
        seed: this.world?.seed,
        scene: this.scene?.name ?? null,
        tick: this.sim?.tick,
        player: this.sim ? { ...this.sim.player } : null,
        perf: this.stats.summary(),
        render: this.renderer.stats(),
        aim: this.aimText,
        overlay: this.overlay.currentMode,
        overlayVisible: this.overlay.visible,
        spawn: this.world?.spawn,
        camp: this.world ? { site: this.world.camp.site, perches: this.world.report.perches.length } : null,
      }),
    };
  }

  // --- Benchmark (?bench). ---------------------------------------------------------------

  private startBench(): void {
    // From the spawn, over the camp, to the perch across from it: all relative to the camp's site.
    const c = this.world.camp.site;
    const s = { x: this.world.spawn.x - c.x, z: this.world.spawn.z - c.z };
    const sy = this.world.terrain.heightAt(this.world.spawn.x, this.world.spawn.z);
    const far = this.world.report.perches.reduce(
      (best, p) => ((p.x - c.x) * s.x + (p.z - c.z) * s.z < (best.x - c.x) * s.x + (best.z - c.z) * s.z ? p : best),
      this.world.report.perches[0] ?? { x: c.x - s.x, y: sy, z: c.z - s.z },
    );
    const o = { x: far.x - c.x, z: far.z - c.z };
    const at = (x: number, y: number, z: number) => new THREE.Vector3(c.x + x, c.height + y, c.z + z);
    const pts = [
      new THREE.Vector3(c.x + s.x, sy + 1.7, c.z + s.z),
      new THREE.Vector3(c.x + s.x * 0.55, sy + 25, c.z + s.z * 0.55),
      at(s.x * 0.15, 11.5, s.z * 0.15),
      at(-s.x * 0.05 + 8, 1.7, -s.z * 0.05),
      at(o.x * 0.5, 17.5, o.z * 0.5),
      new THREE.Vector3(far.x, far.y + 2, far.z),
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
    const site = this.world.camp.site;
    const camp = new THREE.Vector3(site.x, site.height + 1.5, site.z);
    const target = t < 0.55 || t > 0.9 ? camp : ahead;
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

const HFOV_MAX = Math.tan((110 * Math.PI) / 360);
const HFOV_MIN = Math.tan((60 * Math.PI) / 360);
const VFOV_MAX = Math.tan((100 * Math.PI) / 360);

/**
 * The vertical field of view for a window of this shape: the tuned one, unless that
 * would make the horizontal view wider than 110° (an ultra-wide window) or narrower
 * than 60° (a phone held upright).
 */
function fitFov(vfov: number, aspect: number): number {
  const t = Math.tan((vfov * Math.PI) / 360);
  const h = t * aspect;
  const fitted = h > HFOV_MAX ? HFOV_MAX / aspect : h < HFOV_MIN ? Math.min(HFOV_MIN / aspect, VFOV_MAX) : t;
  return (Math.atan(fitted) * 360) / Math.PI;
}

/** A field of view with its half-angle's tangent scaled by k: the same magnification relative to a scaled base view. */
function scaleFov(fov: number, k: number): number {
  return k === 1 ? fov : (Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 360) / Math.PI;
}

function zoomFov(base: number, zoomed: number, t: number): number {
  // Interpolate in tan space so the zoom feels linear in magnification.
  const a = Math.tan((base * Math.PI) / 360);
  const b = Math.tan((zoomed * Math.PI) / 360);
  return (Math.atan(lerp(a, b, t)) * 360) / Math.PI;
}

function samePose(a: CameraPose, b: CameraPose): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch && a.fov === b.fov;
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
