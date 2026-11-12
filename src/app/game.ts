import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import { FixedStepClock } from '../sim/kernel/core/clock';
import { headingDegrees, lerp, moveTowards, yawFromDirection } from '../sim/kernel/core/math';
import { headBob } from '../sim/body';
import type { ReportCode } from '../sim/kernel/events';
import { BARKS, beliefRadius, explainChain, groundLight, lightName, movementVisibility, stanceVisibility } from '../sim/perception';
import { EventLog } from '../sim/kernel/eventlog';
import { Cues } from './cues';
import { MOVEMENT_SITTING } from '../sim/game/movementTrials';
import { MOVEMENT_PLAN, SIGHT_PLAN, TrialSitting, type TrialHost } from './trials';
import { campMission, generateWorld, simTuningKey, worldTuningKey, type CampSpec } from '../sim/generation';
import type { World } from '../sim/kernel/world/world';
import { neutralInput } from '../sim/kernel/input';
import { Recorder, Recording } from '../sim/kernel/record/recording';
import { Simulation, type Snapshot } from '../sim/game/sim';
import type { UsePrompt } from '../sim/game/use';
import type { SimEvent } from '../sim/kernel/events';
import { normalizeSeed } from '../sim/kernel/core/seed';
import { Blocks, type Collider } from '../sim/kernel/world/colliders';
import { emptyHit, raycast, IGNORE_CROWNS } from '../sim/kernel/world/query';
import { entityOfCollider } from '../sim/kernel/world/solids';
import { Surface, surfaceName } from '../sim/kernel/world/surfaces';
import { GameRenderer, type CameraPose } from '../render/renderer';
import type { Action } from './actions';
import { loadSettings, saveSettings, type Settings } from './settings';
import { palette } from '../render/palette';
import { Hud, showsPlayerHud } from './hud';
import { kitFields } from './kit';
import type { MapMode } from './minimap';
import { InputController } from './input';
import { Overlay } from './overlay';
import { GameSound } from './sound';
import { BrowserStore, DevInbox, PlaytestCapture, type StoredRun } from './playtest';
import { DROP_KEYS, LabPanel, SHOOTER_VIEW_KEY } from './labPanel';
import { CampGauges } from '../lab/gauges';
import { rehearse, rehearseFirefight, rehearseHunt } from '../sim/game/rehearsal';
import { commanderOf } from '../sim/game/comms';
import { stimulus, type StimulusName } from '../sim/game/drops';
import type { Command } from '../sim/kernel/commands';
import type { Driver } from '../sim/kernel/scene';
import { Replay, REPLAY_SOUND_SPEED } from './replay';
import { Timeline } from './timeline';
import { frameSpan, type SoundTiming } from '../audio/engine';
import { FrameStats, percentile } from './perf';
import type { SpawnKind } from '../sim/kernel/mission';
import { sceneTuning, startScene } from '../sim/kernel/scene';
import type { Scene } from '../sim/game/scenes';
import { SystemProfile } from '../sim/kernel/profile';
import { BUILD } from './build';
import { tuningProblems } from '../config/validate';
import { Instruments, ASSISTS, ASSIST_NAMES, opticFov, scopeDiameter, type DopeRow, type InstrumentState } from './scope';
import { ballisticOf, holdBetween, landing, lineOfSight, solveAim, unit, vec3, viewLine, zeroOf, type Hold } from '../sim/ballistics';
import { air, windAt } from '../sim/kernel/env';
import { Optic } from '../sim/kernel/input';
import { player as playerOf } from '../sim/game/entities';
import type { RifleView } from '../sim/game/sim';
import { SHOT_COLUMNS, analyzeShot, shotRow, type ShotReport } from '../sim/game/telemetry';

/**
 * The browser game loop: real time in, fixed simulation ticks out, interpolated frames
 * drawn in between. Owns the simulation, the recorder, the renderer, the sound, input,
 * the HUD and the overlay, and the debug tools (views, fly camera, time scale, benchmark).
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
  /** A recording to watch (?replay=<url>), instead of a valley to play. */
  replayUrl: string | null;
  /** The generated camp to play (lab D). */
  camp: CampSpec;
  /** Trial mode (A12): a sitting of the perception lab's exit test, from this seed; null for none. */
  trials?: string | null;
  /** Start that sitting over, forgetting any answers kept in this browser. */
  trialsFresh?: boolean;
  /** Show the lab panel in a camp scene (&lab): the gauges and the engine switches. */
  lab?: boolean;
}

const TIME_SCALES = [0.25, 0.5, 1, 2, 4, 8];
/** Ticks between updates of the lab panel: a ray per guard each time. */
const LAB_PANEL_EVERY = 15;
/** Degrees across the view from the shooter's eye: about what a scope shows. */
const SHOOTER_VIEW_FOV = 14;
/** Seconds of unsaved play after which closing the tab asks first (in the deployed game). */
const UNSAVED_WARNING_SECONDS = 60;

/** What went wrong, once something has: the run stops there until the player tries again. */
interface Failure {
  where: 'generate' | 'tick' | 'frame' | 'page' | 'context' | 'replay';
  message: string;
}
const BENCH_SECONDS = 20;

interface Bench {
  start: number;
  path: THREE.CatmullRomCurve3;
  frames: number[];
  cpu: number[];
  calls: number[];
  triangles: number[];
}

/** What a guard's radio or voice report says aloud (the captions you hear, by the law of sound). */
const CALL_LINES: Readonly<Record<ReportCode, string>> = {
  contact: 'Contact! Calling it in.',
  heard: 'Heard something. Going to check.',
  shot: 'Shots fired. Anybody see from where?',
  body: 'Man down! Man down!',
  missing: "Post isn't answering.",
  clear: 'Clear here.',
  claim: "I'll take a look.",
  escort: 'Time to go. Move!',
  moving: 'Moving! Cover me!',
  set: 'Set!',
  outage: "Something's dead over here.",
};

/** What the use key would do, in words (sim/game/use.ts). */
const USE_LINES: Readonly<Record<Exclude<UsePrompt, ''>, string>> = {
  carry: 'carry',
  drop: 'put down',
  open: 'open',
  shut: 'shut',
  generator: 'hold: cut the generator',
  radio: 'hold: cut the radio',
  vehicle: 'hold: disable the vehicle',
};

export class Game {
  private tuning: Tuning;
  private world!: World;
  private sim!: Simulation;
  /** The live run's recorder; null before the first run (a page opened on a replay) and never the replay's. */
  private recorder: Recorder | null = null;
  private prev!: Snapshot;
  private curr!: Snapshot;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly hud: Hud;
  /** The honest view's cues that a guard is noticing you (A8): the edge indicator, and what guards say. */
  private readonly cues: Cues;
  /** The run's events, kept for explaining what guards did (sim/kernel/eventlog.ts); not simulation state. */
  private readonly log = new EventLog();
  /** A sitting of trial mode (A12), when the page was opened for one. */
  private trial: TrialSitting | null = null;
  /** The scope and the binoculars in the honest view (scope.ts). */
  private readonly instruments: Instruments;
  /** The rangefinder's last reading, and when (performance time, seconds). */
  private ranged: { range: number; at: number } | null = null;
  /** Every rifle shot of the run, broken down (sim/game/telemetry.ts), for the end of the run. */
  private shotLog: Array<{ report: ShotReport; result: string; impact: number; hit: boolean }> = [];
  /** The dope card for the dialled zero, load and air, computed when they change. */
  private dope: { key: string; rows: DopeRow[] } = { key: '', rows: [] };
  private readonly rifleNow: RifleView = { up: 0, right: 0, raise: 0, rest: 0, rounds: 0, zero: 0, bolt: 0, fitting: 0, swapping: false, suppressed: false, load: '', heartRate: 0, held: 0, air: 0, glint: 0, steady: 1 };
  private readonly overlay: Overlay;
  private readonly sound: GameSound;
  /** Every run kept as it goes: in playtests/ in development, in this browser when deployed (playtest.ts). */
  private readonly capture: PlaytestCapture;
  /** When the current pause began (performance.now()), or 0 while playing. */
  private pausedAt = 0;
  /** A recording being watched (replay.ts), or null in a live run. */
  private replay: Replay | null = null;
  private readonly timeline: Timeline;
  /** Where this frame's picture is on the simulation's timeline: sounds wait for it (audio/engine.ts). */
  private readonly soundTiming: SoundTiming = { shown: 0, scale: 1, hold: 0 };
  /** About how long a frame takes: jumps to a long frame, eases back over a second or so. */
  private frameSpan = 0;
  /** With &lab in a camp scene: what the camp is doing to you, and the switches (labPanel.ts). */
  private gauges: CampGauges | null = null;
  /** The mouse has let go of the view, for clicking the panels, with the world still running (toggleMouse). */
  private mouseFree = false;
  /** Where the camera was before looking along the last shot (toggleShooterView). */
  private shooterView: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;
  private labPanel: LabPanel | null = null;
  /** The attack script a compound simulator is running, if any. */
  private attack: Driver<Simulation> | null = null;
  /** Stimuli waiting for the next tick (the compound simulator). */
  private readonly drops: Command[] = [];
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
  /** The player's own settings (settings.ts): kept in this browser. */
  private settings: Settings = loadSettings();
  /** The rules decided the run during the last ticks: show the outcome once they're drawn. */
  private decided = false;
  private readonly drawnLabels: Array<{ x: number; y: number; text: string; color: string; detail?: string }> = [];
  /** The scene being played, if any (sim/kernel/scene.ts): its world, systems and setup. */
  private scene: Scene | null;
  /** What the last drawn frame showed, so a paused screen isn't drawn again unchanged. */
  private readonly drawnPose: CameraPose = { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 };
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
    this.sound = new GameSound(this.tuning);
    this.capture = new PlaytestCapture(opts.bench ? null : import.meta.env.DEV ? new DevInbox() : typeof indexedDB !== 'undefined' ? new BrowserStore() : null, {
      build: BUILD,
      machine: () => this.machine(),
      settings: () => ({ ...this.settings }),
    });
    this.input = new InputController(opts.canvas);
    if (this.debug) this.input.contexts.add('debug');
    this.devKeys();
    this.timeline = new Timeline(
      {
        onToggle: () => this.action('replayPlay'),
        onSeek: (tick, done) => {
          if (!this.replay) return;
          this.seekReplay(tick);
          if (done) this.redraws++;
        },
        onSpeed: () => this.replay && this.hud.toast(`Replay ×${this.replay.changeSpeed(0)}`),
        onLeave: () => this.leaveReplay(),
      },
      this.input.map,
    );
    this.hud = new Hud(opts.hud, this.input.map);
    this.cues = new Cues(opts.hud, this.tuning.perception.sight.cue);
    if (opts.trials) {
      this.trial = new TrialSitting(opts.hud, this.trialHost(), opts.trials, this.tuning, opts.trialsFresh ?? false, opts.trials.startsWith(MOVEMENT_SITTING) ? MOVEMENT_PLAN : SIGHT_PLAN);
      // Every trial's run is kept, however short: each holds an answer.
      this.capture.minSeconds = 0;
    }
    this.instruments = new Instruments(opts.hud);
    this.overlay = new Overlay(opts.overlay, {
      onResume: () => this.resume(),
      onGenerate: (seed) => {
        // Generating a valley leaves the scene.
        this.scene = null;
        this.generate(seed);
      },
      onSaveRecording: () => this.saveRecording(),
      onWatch: (file) => this.openReplayFile(file),
      onSettings: (s) => this.applySettings(s),
      onRetry: () => {
        const retry = this.retry;
        this.failure = null;
        this.retry = () => undefined;
        retry();
      },
    }, this.input.map);
    this.overlay.showSettings(this.settings, this.tuning.view.fov);
    this.applySettings(this.settings);
    // A sitting is as it always was: nothing new on screen, and no key for it (the exit test's rule).
    if (opts.trials) this.overlay.setKey('minimap', false);
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
    // A hidden tab may never come back (closed, discarded): keep the run first.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.capture.save('hidden');
    });
    window.addEventListener('beforeunload', (e) => {
      if (!import.meta.env.PROD || !this.sim || this.bench || this.replay) return;
      // A sitting's answers aren't safe until its file is saved.
      if (this.trial?.unsaved) {
        e.preventDefault();
        return;
      }
      // Kept by hand, or by the autosave in this browser (playtest.ts).
      const saved = Math.max(this.savedTick, this.capture.savedTick);
      if ((this.sim.tick - saved) / this.tuning.sim.tickHz < UNSAVED_WARNING_SECONDS) return;
      e.preventDefault();
    });
    // A recording dropped on the page opens for watching (between runs, not during one).
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      if (this.input.locked && !this.replay) return;
      this.openReplayFile(file);
    });
    // Watching a replay, a click on the view takes the mouse for looking (the fly camera).
    this.opts.canvas.addEventListener('click', () => {
      if (!this.replay && !this.mouseFree) return;
      this.sound.unlock();
      if (!this.input.locked) this.input.requestLock();
    });
    // With the mouse free there's no capture for Esc to end, so it pauses here.
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.mouseFree) return;
      this.endMouseFree();
      this.onUnlocked();
    });
    // A replay opened from a link or a dropped file starts silent: browsers start sound only
    // on a click or a key, and while watching, any will do.
    window.addEventListener('keydown', () => this.replay && this.sound.unlock());
    window.addEventListener('pointerdown', () => this.replay && this.sound.unlock());
    if (this.opts.replayUrl) this.openReplayUrl(this.opts.replayUrl);
    else this.generate(this.opts.seed);
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
    // Frames stop drawing after a failure, so the sound ducks here rather than in the next frame.
    this.sound.setPaused(true);
    this.input.releaseLock();
    this.hud.setVisible(false);
    const stack = error instanceof Error && error.stack ? `\n\n${error.stack.split('\n').slice(1, 7).join('\n')}` : '';
    if (where === 'generate') {
      const seed = this.seed;
      this.retry = () => this.generate(seed);
      this.overlay.showMessage('error', `The valley ${seed} could not be generated`, `${message}${stack}`, 'Try again');
    } else if (where === 'tick') {
      this.capture.save('fault');
      const f = this.sim.fault;
      this.retry = () => this.restartRunFromStart();
      this.overlay.showMessage('error', 
        `The simulation failed at tick ${f?.tick ?? this.sim.tick + 1}`,
        `${f ? `${f.system}: ` : ''}${message}${stack}\n\nThe run stopped there. Save the recording to reproduce it with npm run sim -- --replay.`,
        'Restart the run',
      );
    } else if (where === 'replay') {
      this.retry = () => (this.world ? this.generate(this.seed) : this.generate(this.opts.seed));
      this.overlay.showMessage('error', "This recording can't be watched here", `${message}${stack}`, 'Back to the valley');
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
    this.capture.save('outcome');
    this.hud.setVisible(false);
    this.retry = () => {
      this.restartRun();
      this.resume();
    };
    const when = clock(o.tick / this.tuning.sim.tickHz);
    // A run with rifle shots ends with what decided each (sim/game/telemetry.ts).
    const shots = this.shotLog.map((s, k) => shotRow(s.report, s.result, k + 1));
    this.overlay.showMessage(
      'outcome',
      o.status === 'succeeded' ? `Done · ${when}` : `Failed · ${when}`,
      `${o.reason.charAt(0).toUpperCase()}${o.reason.slice(1)}.${shots.length ? `\n\nWhat decided each shot, in mils (+ is high or right):\n${SHOT_COLUMNS}\n${shots.join('\n')}` : ''}`,
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

  /** A setting changed in the overlay: it applies now and is kept for next time. */
  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.input.invertY = s.invertY;
    this.input.rawMouse = s.rawMouse;
    this.sound.setVolume(s.volume);
    this.redraws++;
  }

  /** Tells the player something: in the HUD while playing, in the overlay's status line while it is up. */
  private notify(text: string): void {
    if (this.overlay.visible) this.overlay.setStatus(text);
    else this.hud.toast(text);
  }

  // --- World and runs. ---------------------------------------------------------------

  private generate(seed: string): void {
    this.exitReplayMode();
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
        const spec = campMission(seed, this.opts.camp, this.spawnKind);
        world = this.scene ? this.scene.world(this.tuning) : generateWorld(spec, this.tuning, () => performance.now());
        if (this.scene) world.genMs = performance.now() - t0;
      } catch (e) {
        this.fail('generate', e);
        return;
      }
      this.world = world;
      this.renderer.setWorld(world, this.tuning);
      this.sound.setWorld(world);
      this.hud.map.setWorld(world);
      if (!this.trial) this.overlay.setKey('minimap', this.hud.map.applies);
      // The camp's fight, once, out of sight: the first shot of the real one then costs what the tenth does.
      if (!this.opts.bench) {
        rehearse(world, this.tuning);
        rehearseFirefight(world, this.tuning);
        rehearseHunt(world, this.tuning);
      }
      this.restartRun();
      const url = new URL(window.location.href);
      url.searchParams.delete('replay');
      if (this.scene) {
        url.searchParams.delete('seed');
        url.searchParams.set('scene', this.scene.name);
        if (this.scene.params) url.searchParams.set('params', this.scene.params);
        else url.searchParams.delete('params');
      } else {
        url.searchParams.delete('scene');
        url.searchParams.delete('params');
        url.searchParams.set('seed', seed);
      }
      window.history.replaceState(null, '', url);
      this.overlay.setStartTitle(this.scene ? `Scene · ${this.scene.title}` : 'Phase 1 · The valley');
      this.overlay.setKey('load', Object.values((this.scene ? sceneTuning(this.scene, this.tuning) : this.tuning).ballistics.rifle.carries).filter(Boolean).length > 1);
      this.overlay.setStatus(
        this.scene
          ? this.scene.description
          : `${seed} · generated in ${Math.round(world.genMs)} ms${world.attempt ? ` after ${world.attempt} re-roll${world.attempt > 1 ? 's' : ''}` : ''}`,
      );
      if (this.benchRequested) {
        this.benchRequested = false;
        this.startBench();
      } else if (this.trial) {
        // Trial mode: the lab behind the overlay while the sitting is prepared.
        this.overlay.setStartTitle(`Trial mode · the ${this.opts.trials?.startsWith(MOVEMENT_SITTING) ? 'movement' : 'perception'} lab`);
        this.overlay.show('loading');
        this.trial.prepare();
      } else {
        this.overlay.show('start');
        this.showKept();
      }
    }, 30);
  }

  /** What a sitting of trial mode needs from the game (app/trials.ts). */
  private trialHost(): TrialHost {
    const game = this;
    return {
      loadTrial: (scene) => {
        const world = scene.world(this.tuning);
        // Trials share the lab's ground and shade: its meshes are kept.
        const same = this.world !== undefined && this.world.terrain === world.terrain;
        this.scene = scene;
        this.world = world;
        if (!same) {
          this.renderer.setWorld(world, this.tuning);
          this.sound.setWorld(world);
        }
        this.restartRun();
        // Looking at the guard's chest.
        const g = this.sim.guards[0];
        const p = this.sim.player;
        if (g) {
          const dx = g.body.x - p.x;
          const dz = g.body.z - p.z;
          this.input.yaw = Math.atan2(-dx, -dz);
          this.input.pitch = Math.atan2(g.body.y + 1.2 - (p.y + p.eyeHeight), Math.max(1, Math.hypot(dx, dz)));
        }
      },
      get sim() {
        return game.sim;
      },
      annotate: (kind, text) => this.recorder?.annotate(kind, text),
      runOut: (ticks, done) => {
        for (let i = 0; i < ticks; i++) {
          this.trial?.input(this.sim, this.raw);
          const events = this.sim.step(this.raw);
          this.recorder?.record(this.sim, events);
          this.log.add(events);
          if (done(events)) break;
        }
        this.prev = this.sim.snapshot();
        this.curr = this.sim.snapshot();
      },
      status: (text) => this.overlay.setStatus(text),
      ready: () => this.overlay.show('start'),
      results: (text, save) => {
        // The last trial's run, with the sitting's score in it.
        this.capture.save('sitting');
        this.input.releaseLock();
        this.paused = true;
        this.hud.setVisible(false);
        // The button works every time: a saved file can be lost too.
        const saveAgain = (): void => {
          save();
          this.retry = saveAgain;
        };
        this.retry = saveAgain;
        this.overlay.showMessage('outcome', 'The sitting is done', text, 'Save the sitting');
      },
      resume: () => {
        // A review of the misses: nothing played from here is kept.
        this.capture.minSeconds = Infinity;
        this.paused = false;
        this.overlay.hide();
        this.hud.setVisible(true);
        this.lastNow = 0;
      },
      download: (name, text) => this.download(new Blob([text], { type: 'application/json' }), name),
    };
  }

  private restartRun(): void {
    this.log.clear();
    this.cues.clear();
    this.exitReplayMode();
    this.sim = this.scene ? startScene(this.scene, this.tuning, this.world) : new Simulation(this.world, this.tuning);
    if (this.scene && commanderOf(this.sim) && (this.opts.lab || this.scene.name === 'compound')) {
      this.gauges = new CampGauges(this.sim);
      this.labPanel ??= new LabPanel(this.hud.dock, this.scene.params ?? '', this.scene.name === 'compound' ? (what) => this.dropWherePointing(what) : null, this.scene.name === 'compound' ? () => this.toggleShooterView() : null);
      this.hud.setLab(true);
      if (this.scene.name === 'compound') this.hud.setExtraKeys([...DROP_KEYS.map(([code, , text]) => [code.slice(5), text] as const), [SHOOTER_VIEW_KEY.slice(5), "shooter's view"]]);
      this.devKeys();
    }
    const recorder = new Recorder(this.sim, BUILD);
    this.recorder = recorder;
    this.sound.setSimulation(this.sim);
    this.capture.startRun(this.sim, recorder, this.world.seed, this.scene?.name ?? null);
    this.savedTick = 0;
    this.failure = null;
    this.sim.drawDebug = this.debug;
    this.redraws++;
    // From the tuning in force: a save can change the tick rate and the world together.
    this.clock = new FixedStepClock(this.tuning.sim.tickHz);
    this.prev = this.sim.snapshot();
    this.curr = this.sim.snapshot();
    this.input.armed = playerOf(this.sim.index).rifle !== undefined;
    this.ranged = null;
    this.shotLog = [];
    this.input.yaw = this.sim.player.yaw;
    // Start looking at the camp so the first frame frames the valley.
    const p = this.sim.player;
    const site = this.world.camp.site;
    const dist = Math.hypot(p.x - site.x, p.z - site.z);
    const drop = site.height + 1 - (p.y + p.eyeHeight);
    this.input.pitch = dist > 1 ? Math.max(-0.35, Math.min(0.1, Math.atan2(drop, dist))) : 0;
    if (this.detached) this.setDetached(false);
    this.attack = null;
    if (this.scene?.name === 'compound') {
      this.overTheCamp();
      this.attack = this.scene.driver?.() ?? null;
    }
  }

  /** Hot-reloaded tuning (dev only). */
  applyTuning(next: Tuning): void {
    this.cues.setCue(next.perception.sight.cue);
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
    if (this.replay) {
      // A replay shows its recording, numbers and all: only the view takes the new tuning.
      this.renderer.setTuning(this.replayTuning(this.replay));
      this.notify('Tuning reloaded · the replay keeps its recording’s numbers');
      return;
    }
    this.renderer.setTuning(next);
    this.sound.setTuning(next);
    if (worldChanged) {
      this.notify('World tuning changed · regenerating the valley');
      this.generate(this.world.seed);
    } else if (tickChanged) {
      this.restartRun();
      this.notify(`Tick rate ${next.sim.tickHz} Hz · run restarted`);
    } else if (simChanged) {
      if (!this.sim.fault) {
        // A scene that is a mode keeps its own numbers over the reloaded ones.
        this.sim.setTuning(this.scene ? sceneTuning(this.scene, next) : next);
        this.recorder?.tuningChanged(this.sim);
      }
      this.notify('Tuning reloaded');
    } else {
      this.notify('View tuning reloaded');
    }
  }

  // --- Pausing and input. --------------------------------------------------------------

  private resume(): void {
    if (this.overlay.currentMode === 'loading' || this.failure) return;
    // A click or a key: the moment browsers allow sound to start.
    this.sound.unlock();
    this.input.requestLock();
  }

  private onLocked(): void {
    this.endMouseFree();
    this.paused = false;
    this.trial?.begin();
    if (this.pausedAt) this.capture.paused(performance.now() - this.pausedAt);
    this.pausedAt = 0;
    this.overlay.hide();
    this.hud.setVisible(true);
    this.lastNow = 0;
  }

  private onUnlocked(): void {
    if (this.mouseFree) return;
    // Watching a replay, letting go of the mouse just frees it for the timeline.
    if (this.replay) return;
    if (this.bench || this.failure || (this.overlay.visible && this.overlay.currentMode === 'outcome')) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.recorder?.annotate('pause');
    this.capture.pauseStarted();
    this.capture.save('pause');
    this.showKept();
    this.hud.setVisible(false);
    if (this.overlay.currentMode !== 'loading' || !this.overlay.visible) this.overlay.show('paused');
  }

  /** A pressed action outside the tick (actions.ts); the input controller only passes those of active contexts. */
  private action(action: Action): void {
    switch (action) {
      case 'debugView':
        // A sitting is in the honest view only (the exit test's rule).
        if (!this.trial) this.setDebugView(!this.debug);
        break;
      case 'colliders':
        this.colliders = !this.colliders;
        this.renderer.setColliders(this.colliders);
        this.hud.toast(this.colliders ? 'Colliders on · purple blocks all, blue movement, green sight' : 'Colliders off');
        break;
      case 'overwatch':
        this.perches = !this.perches;
        this.renderer.setPerches(this.perches);
        this.hud.toast(this.perches ? `Overwatch on · ${this.world.report.perches.length} perches` : 'Overwatch off');
        break;
      case 'grid':
        this.gridShown = !this.gridShown;
        this.renderer.setGrid(this.gridShown);
        this.hud.toast(this.gridShown ? 'Grid on · orange no body fits, purple stops sound, blue roofed' : 'Grid off');
        break;
      case 'flyCamera':
        this.setDetached(!this.detached);
        break;
      case 'dockHide':
        this.hud.dock.toggleHidden();
        break;
      case 'mouseFree':
        this.toggleMouse();
        break;
      case 'slower':
      case 'faster': {
        const d = action === 'slower' ? -1 : 1;
        if (this.replay) {
          this.hud.toast(`Replay ×${this.replay.changeSpeed(d)}`);
          break;
        }
        this.timeScaleIndex = Math.max(0, Math.min(TIME_SCALES.length - 1, this.timeScaleIndex + d));
        this.hud.toast(`Time ×${TIME_SCALES[this.timeScaleIndex]}`);
        break;
      }
      case 'restart':
        if (this.replay) {
          this.seekReplay(0);
          break;
        }
        this.restartRun();
        this.hud.toast('Run restarted');
        break;
      case 'replayPlay': {
        const r = this.replay;
        if (!r) break;
        // At the end, playing starts it over.
        if (!r.playing && this.sim.tick >= r.ticks) this.seekReplay(0);
        r.playing = !r.playing;
        this.holdReplayPicture();
        break;
      }
      case 'replayBack':
      case 'replayForward':
        if (this.replay) this.seekReplay(this.sim.tick + (action === 'replayBack' ? -5 : 5) * this.replay.hz);
        break;
      case 'replayStepBack':
      case 'replayStepForward':
        if (!this.replay) break;
        this.replay.playing = false;
        this.seekReplay(this.sim.tick + (action === 'replayStepBack' ? -1 : 1));
        break;
      case 'assists': {
        const next = ASSISTS[(ASSISTS.indexOf(this.settings.assists) + 1) % ASSISTS.length]!;
        this.applySettings({ ...this.settings, assists: next });
        this.overlay.showSettings(this.settings, this.tuning.view.fov);
        this.hud.toast(`Instruments: ${ASSIST_NAMES[next]}`);
        break;
      }
      case 'minimap':
        if (this.playerHud() && this.hud.map.applies) this.hud.map.cycle();
        break;
      case 'mark': {
        // A marker in the recording: "look at this moment" for a playtest or a bug report.
        if (!this.recorder) break;
        this.recorder.annotate('marker');
        this.hud.toast(`Marked ${clock(this.sim.tick / this.tuning.sim.tickHz)} in the recording`);
        break;
      }
    }
  }

  /** The panels' own keys work wherever the panels show. */
  private devKeys(): void {
    if (this.debug || this.replay || this.gauges) this.input.contexts.add('dev');
    else this.input.contexts.delete('dev');
  }

  /**
   * Tab: the mouse lets go of the view so the panels can be clicked, with the world still
   * running and every key still working. Tab again, or a click on the world, takes it back.
   */
  private toggleMouse(): void {
    if (!this.input.locked) {
      this.input.requestLock();
      return;
    }
    if (!this.replay) {
      this.mouseFree = true;
      this.input.freeKeys = true;
    }
    this.input.releaseLock();
    this.hud.toast('Mouse free · click a panel, or point and drop · Tab or a click on the world to look again');
  }

  private endMouseFree(): void {
    if (!this.mouseFree) return;
    this.mouseFree = false;
    if (!this.replay) this.input.freeKeys = false;
  }

  private setDebugView(on: boolean): void {
    this.debug = on;
    // Watching a replay, the debug keys work in either view.
    if (on || this.replay) this.input.contexts.add('debug');
    else this.input.contexts.delete('debug');
    this.devKeys();
    if (this.sim) this.sim.drawDebug = on;
    this.renderer.setDebug(on);
    this.hud.setDebug(on);
    if (!on) {
      // The compound simulator's player is only parked somewhere: there's nobody's eyes to go back to.
      if (this.detached && this.scene?.name !== 'compound') this.setDetached(false);
      this.timeScaleIndex = 2;
    }
    this.hud.toast(on ? 'Debug view · everything the simulation knows' : 'Honest view · only what the game will show');
  }

  /** Whether the kit and the map belong on screen now: this is someone playing, in their own eyes. */
  private playerHud(): boolean {
    return showsPlayerHud({ replay: this.replay !== null, trial: this.trial !== null, bench: this.bench !== null, detached: this.detached, scene: this.scene?.name ?? null });
  }

  private setDetached(on: boolean): void {
    if (on === this.detached) return;
    this.detached = on;
    if (on) this.input.contexts.add('fly');
    else this.input.contexts.delete('fly');
    if (on) {
      // In a replay, from where the player was looking.
      if (this.replay) {
        this.input.yaw = this.curr.yaw;
        this.input.pitch = this.curr.pitch;
      }
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
    // Something else took the screen (the run ended, a failure): the panels aren't what's in front.
    if (this.mouseFree && this.overlay.visible) this.endMouseFree();
    // The frame as it really was (for the playtest report), and as the game takes it: a
    // frame longer than a quarter second (a hitch, a debugger) doesn't jump the world.
    const frameMs = this.lastNow ? now - this.lastNow : 0;
    const dt = Math.min(frameMs / 1000, 0.25);
    this.lastNow = now;
    const cpuStart = performance.now();
    // Paused means still: animation time and the head bob stop with the simulation.
    if (!this.paused) this.time += dt;
    this.frameSpan = frameSpan(this.frameSpan, dt);

    const V = this.tuning.view;
    let frameTicks = 0;
    let frameTickMs = 0;
    if (this.replay) this.replayTicks(dt);
    else if (!this.paused && (!this.trial || this.trial.stepping)) {
      const scale = this.debug ? TIME_SCALES[this.timeScaleIndex]! : 1;
      const ticks = this.clock.advance(dt, scale);
      if (ticks > 0) {
        // This frame will show the state `alpha` of the way into the last of these ticks:
        // each tick's sounds wait until the picture reaches their moment.
        this.soundTiming.shown = (this.sim.tick + ticks - 1 + this.clock.alpha) / this.tuning.sim.tickHz;
        this.soundTiming.scale = scale;
        this.soundTiming.hold = Math.min(this.frameSpan, 0.05);
        this.sim.profiler = this.debug ? this.profile : null;
        const t0 = performance.now();
        for (let i = 0; i < ticks && !this.failure && !this.decided; i++) this.tick();
        if (this.failure) return;
        if (this.decided) {
          this.decided = false;
          this.showOutcome();
        }
        frameTicks = ticks;
        frameTickMs = performance.now() - t0;
        this.tickTimeSum += frameTickMs;
        this.tickCount += ticks;
      }
    }

    // The optics: the scope comes up as the simulation raises it; the binoculars (and, with
    // no rifle, the zoom) ease here. A replay looks through what the player did.
    // The fly camera and the benchmark aren't anyone's eyes: no optic, no sway.
    const ownEyes = !this.detached && !this.bench;
    const optic = !ownEyes ? Optic.None : this.replay ? this.replay.opticAt(this.sim.tick) : this.paused ? Optic.None : this.input.opticHeld;
    const rifle = ownEyes ? this.interpolatedRifle() : null;
    this.zoom = moveTowards(this.zoom, optic === Optic.Binoculars || (optic === Optic.Scope && !rifle) ? 1 : 0, dt / Math.max(V.zoomTime, 1e-3));
    const eased = this.zoom * this.zoom * (3 - 2 * this.zoom);
    const scoped = rifle ? rifle.raise * rifle.raise * (3 - 2 * rifle.raise) : 0;
    // The window's shape sets the view, within limits; zooming keeps its magnification.
    const chosen = this.settings.fov || V.fov;
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    const base = fitFov(chosen, w / h);
    const B = this.tuning.ballistics;
    const glass = scopeDiameter(w, h);
    const zoomed = rifle ? opticFov(B.binoculars.fieldDeg, glass, h) : scaleFov(V.zoomFov, Math.tan((base * Math.PI) / 360) / Math.tan((V.fov * Math.PI) / 360));
    const fov = zoomFov(zoomFov(base, opticFov(B.scope.fieldDeg, glass, h), scoped), zoomed, eased);
    this.input.sensitivity = V.lookSensitivity * this.settings.sensitivity;
    this.input.sensitivityScale = Math.tan((fov * Math.PI) / 360) / Math.tan((base * Math.PI) / 360);
    this.input.pitchLimit = this.tuning.bodies.player.pitchLimit;

    let pose: CameraPose;
    if (this.bench) pose = this.benchPose(now, fov);
    else if (this.detached) pose = this.flyPose(dt, fov);
    else pose = this.bodyPose(fov, Math.max(eased, scoped));
    // Through the scope the view sways with the rifle (sim/ballistics/sway.ts): the camera
    // looks where a shot would go. The click is about the line of sight the player steered.
    const view = this.detached || this.bench || !rifle ? pose : this.swayed(pose, rifle);
    // The listener is the camera: your eyes, or the fly camera wherever it is.
    this.sound.setPaused(this.paused);
    this.sound.setHumming(this.curr.humming);
    this.sound.frame(dt, view);

    if (this.debug) {
      this.updateAim(view);
      this.showDrawn();
    }
    // While paused, draw only when the picture would change: a view toggled, a new valley, the window resized.
    const still = this.paused && !this.bench && samePose(view, this.drawnPose) && this.drawnKey === this.viewKey();
    if (!still) {
      this.renderer.render(this.prev, this.curr, this.clock.alpha, this.time, view, this.debug ? this.aim : null);
      Object.assign(this.drawnPose, view);
      this.drawnKey = this.viewKey();
    }
    // The instruments come with the rifle: with none (the valley, until Phase 2) the zoom stays a bare zoom.
    this.instruments.draw(this.instrumentState(view, scoped, optic === Optic.Binoculars && rifle ? eased : 0, rifle));
    // A click from now on is about this frame: the line of sight the player steered, before any sway.
    this.input.latch.frameShown(this.sim.tick, this.clock.alpha, pose.yaw, pose.pitch);
    this.hud.updateCompass(view.yaw, this.wayOutHeading());
    this.hud.setPrompt(this.detached || this.replay ? null : this.curr.use ? `${this.input.map.describe('use')} · ${USE_LINES[this.curr.use]}${this.curr.useProgress > 0 ? ` ${Math.round(this.curr.useProgress * 100)}%` : ''}` : this.curr.climb ? `${this.input.map.describe('climb')} · ${this.curr.climb === 'ladder' ? 'climb' : 'mantle'}` : null);
    this.cues.draw(this.curr, view, this.time);
    this.hud.setRange(this.debug ? this.aimText : null);
    const yours = this.playerHud();
    const opticUp = Math.max(scoped, optic === Optic.Binoculars && rifle ? eased : 0) > 0.5;
    this.hud.setOptic(yours && opticUp);
    this.hud.kit.show(yours ? kitFields(this.curr.stance, this.prev.eye !== this.curr.eye, this.curr.rifle) : null);
    this.hud.map.update(yours ? { x: this.curr.px, z: this.curr.pz, yaw: view.yaw } : null, opticUp);

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
    if (!this.paused && !this.bench && !this.replay && frameMs > 0) this.capture.frame(frameMs, cpu, frameTickMs, frameTicks);
    if (this.replay) this.timeline.update(this.sim.tick, this.replay.playing, this.replay.speed);
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
    if (this.attack) {
      // An attack script plays alongside whatever you drop by hand.
      const scripted = this.attack.next(this.sim, { ...this.raw });
      this.drops.push(...(scripted.commands ?? []));
    }
    if (this.drops.length > 0) {
      this.raw.commands = [...this.raw.commands, ...this.drops];
      this.drops.length = 0;
    }
    // In trial mode the trial moves the player; the mouse only looks.
    if (this.trial) {
      this.trial.input(this.sim, this.raw);
      // A noise trial moves round the guard, and the view stays on him.
      if (this.trial.followsDriver) this.input.yaw = this.raw.yaw;
    }
    if (frozen) {
      this.raw.yaw = this.detached ? this.heldYaw : this.sim.player.yaw;
      this.raw.pitch = this.detached ? this.heldPitch : this.sim.player.pitch;
    }
    let events: readonly SimEvent[];
    try {
      events = this.sim.step(this.raw);
    } catch (e) {
      // The state is partway through the tick: keep the failing input, and stop.
      this.recorder?.recordFault(this.sim);
      this.fail('tick', e);
      return;
    }
    if (this.gauges) {
      this.gauges.observe(this.sim, events);
      if (this.sim.tick % LAB_PANEL_EVERY === 0) {
        this.labPanel!.update(this.gauges.read(this.sim));
        // The compound simulator's shooter has no body of its own: this marks where it's firing from.
        if (this.scene?.name === 'compound') this.renderer.setShooterMark(this.gauges.lastShot);
      }
    }
    const swap = this.prev;
    this.prev = this.curr;
    this.recorder?.record(this.sim, events);
    // A fresh snapshot when guards came or went (snapshot() reuses `swap` only when they match).
    this.curr = this.sim.snapshot(swap);
    for (const e of events) {
      if (e.type === 'outcome') this.decided = true;
      if (e.type === 'objective') this.hud.toast('Target down. Get out: follow the road out of the valley.');
      else if (e.type === 'ranged') this.ranged = { range: e.range, at: performance.now() / 1000 };
      else if (e.type === 'shot' && e.speed > 0 && e.source === this.sim.playerId) {
        const fire = this.sim.lastInput.commands.find((c) => c.kind === 'fire');
        if (fire?.kind === 'fire') this.shotLog.push({ report: analyzeShot(this.sim, e, fire), result: 'no strike', impact: -1, hit: false });
      } else if (e.type === 'impact') {
        const s = this.shotLog.find((x) => x.report.shot === e.cause);
        if (s) {
          s.impact = e.id;
          s.result = e.what === 'body' ? `struck the ${e.part}` : e.what === 'collider' && e.surface === Surface.Metal ? 'rang the steel' : `missed, into the ${e.what === 'terrain' ? surfaceName(e.surface) : 'cover'}`;
        }
      } else if (e.type === 'death') {
        const s = this.shotLog.find((x) => x.impact === e.cause);
        if (s) {
          s.result = `${e.part}, down`;
          s.hit = s.report.target?.id === e.victim;
        }
      }
    }
    this.log.add(events);
    this.trial?.onTick(this.sim, events);
    if (events.length > 0) {
      this.renderer.addEvents(events, this.time);
      this.sound.play(events, this.sim.player.eyeHeight, this.soundTiming, !this.detached);
      this.caption(events);
    }
  }

  /** Captions what guards say that reaches the player's ears by the law of sound (A8). */
  private caption(events: readonly SimEvent[]): void {
    const p = this.sim.player;
    const ear = { x: p.x, y: p.y + p.eyeHeight, z: p.z };
    const view = { x: ear.x, z: ear.z, yaw: this.replay ? p.yaw : this.input.yaw };
    for (const e of events) {
      if (e.type === 'call') {
        if (this.sound.levelAt(e.x, e.y, e.z, e.radius, ear.x, ear.y, ear.z) < 1) continue;
        // A contact shouted across the yard isn't a call on the radio, and shouldn't read as one.
        this.cues.say(e.say === 'contact' && e.radio === 0 ? 'Contact! Over there!' : CALL_LINES[e.say], e.radio === 0, e.x, e.z, view, this.time);
        continue;
      }
      if (e.type !== 'bark') continue;
      const line = BARKS[e.line];
      if (!line || this.sound.levelAt(e.x, e.y, e.z, e.radius, ear.x, ear.y, ear.z) < 1) continue;
      this.cues.say(line.text, line.shout, e.x, e.z, view, this.time);
    }
  }

  /**
   * The camera in your body: interpolated between the last two ticks, with the head bob
   * of the body's own stride (sim/body/bob.ts), so the view dips as each step sounds.
   * The bob fades out as an optic comes up: through one, the camera is exactly where the
   * simulation's eye is, which is where a shot leaves from.
   */
  private bodyPose(fov: number, optic: number): CameraPose {
    const a = this.prev;
    const b = this.curr;
    const t = this.clock.alpha;
    const speed = lerp(a.speed, b.speed, t);
    // A foot came down between the two ticks when the phase starts over.
    const next = b.step < a.step - 0.5 ? b.step + 1 : b.step;
    const phase = lerp(a.step, next, t);
    const V = this.tuning.view;
    const bob = headBob(phase, speed, this.sim.tuning.bodies.player, V.bob) * V.headBob * (1 - optic);
    return {
      // The eye is the centre of the head (sim/body/shape.ts), wherever a lean has put it.
      x: lerp(a.px + a.eyeX, b.px + b.eyeX, t),
      y: lerp(a.py + a.eyeY, b.py + b.eyeY, t) + bob,
      z: lerp(a.pz + a.eyeZ, b.pz + b.eyeZ, t),
      // A replay looks where the player looked.
      yaw: this.replay ? lerpAngle(a.yaw, b.yaw, t) : this.input.yaw,
      pitch: this.replay ? lerp(a.pitch, b.pitch, t) : this.input.pitch,
      roll: -lerp(a.lean, b.lean, t) * V.leanRollDeg * (Math.PI / 180),
      fov,
    };
  }

  /** The load last shown in the rifle, so a change of it can be told. */
  private shownLoad = '';

  /** The player's rifle as the frame shows it: between the last two ticks, like the body. Null without one. */
  private interpolatedRifle(): RifleView | null {
    const a = this.prev?.rifle;
    const b = this.curr?.rifle;
    if (!b) return null;
    const r = Object.assign(this.rifleNow, b);
    // A change of load is felt in the hands, not read off a scope that's down for it: say which went in.
    if (b.load !== this.shownLoad) {
      if (this.shownLoad !== '') this.hud.toast(b.load === 'subsonic' ? 'Subsonic load · quiet, slow, heavy drop: good to about 100 m' : `${b.load[0]!.toUpperCase()}${b.load.slice(1)} load`);
      this.shownLoad = b.load;
    }
    if (!a) return r;
    const t = this.clock.alpha;
    r.up = lerp(a.up, b.up, t);
    r.right = lerp(a.right, b.right, t);
    r.raise = lerp(a.raise, b.raise, t);
    r.rest = lerp(a.rest, b.rest, t);
    r.air = lerp(a.air, b.air, t);
    return r;
  }

  private readonly viewDir = vec3();
  private readonly viewPose: CameraPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 };

  /** The camera moved by the rifle's sway, as far as the scope is up (sim/ballistics/aim.ts, viewLine). */
  private swayed(pose: CameraPose, rifle: RifleView): CameraPose {
    const d = viewLine(pose.yaw, pose.pitch, rifle, this.viewDir);
    const v = Object.assign(this.viewPose, pose);
    v.yaw = Math.atan2(-d.x, -d.z);
    v.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    return v;
  }

  private readonly instrumentScratch: InstrumentState = { scope: 0, binoculars: 0, fovDeg: 0, rifle: null, ranged: null, assists: 'lite', dope: [], dot: null, readout: null };
  private readonly eyeAt = vec3();
  private readonly landed = vec3();
  private readonly toLanding = vec3();
  private readonly hold: Hold = { up: 0, right: 0 };

  /** What the scope and the binoculars show this frame: the reticle, the rifle, the range, and the assists' numbers. */
  private instrumentState(view: CameraPose, scope: number, binoculars: number, rifle: RifleView | null): InstrumentState {
    const s = this.instrumentScratch;
    s.scope = rifle ? scope : 0;
    s.binoculars = binoculars;
    s.fovDeg = view.fov;
    s.rifle = rifle;
    s.assists = this.settings.assists;
    s.ranged = this.ranged ? { range: this.ranged.range, age: performance.now() / 1000 - this.ranged.at } : null;
    s.dot = null;
    s.readout = null;
    s.dope = [];
    if (!rifle || (scope <= 0 && binoculars <= 0) || s.assists === 'sim') return s;
    const T = this.tuning;
    const env = this.world.spec.env;
    const density = air(env).density;
    const t = this.sim.tick / T.sim.tickHz;
    const wind = windAt(env, t, { x: 0, z: 0 });
    const zero = zeroOf(rifle, T, density);
    const still = ballisticOf(rifle, T, density, { x: 0, z: 0 });
    const key = `${rifle.zero}|${rifle.load}|${density}`;
    if (this.dope.key !== key) {
      const rows: DopeRow[] = [];
      const eye = vec3();
      const sight = vec3();
      for (let range = 100; range <= 600; range += 100) {
        const target = { x: 0, y: 0, z: -range };
        solveAimInto(eye, target, zero, still, T.ballistics.maxFlight, sight);
        const up = holdBetween(sight, unit(0, 0, -1, vec3()), { up: 0, right: 0 }).up;
        solveAimInto(eye, target, zero, { ...still, wx: 1 }, T.ballistics.maxFlight, sight);
        const windPerMs = Math.abs(holdBetween(sight, unit(0, 0, -1, vec3()), { up: 0, right: 0 }).right);
        rows.push({ range, up, windPerMs });
      }
      this.dope = { key, rows };
    }
    s.dope = this.dope.rows;
    if (s.assists !== 'arcade' || !this.ranged || this.ranged.range < 0) return s;
    // Arcade: where a shot along the view lands at the ranged distance, wind and all.
    const cam = lineOfSight(view.yaw, view.pitch, this.viewDir);
    const eye = this.eyeAt;
    eye.x = view.x;
    eye.y = view.y;
    eye.z = view.z;
    const windy = ballisticOf(rifle, T, density, wind);
    if (Number.isFinite(landing(eye, cam, cam, this.ranged.range, zero, windy, T.ballistics.maxFlight, this.landed))) {
      unit(this.landed.x - eye.x, this.landed.y - eye.y, this.landed.z - eye.z, this.toLanding);
      holdBetween(cam, this.toLanding, this.hold);
      s.dot = { up: -this.hold.up, right: -this.hold.right };
      // The binoculars read the hold out: the drop at this range, and the wind's push across the view.
      const r = this.ranged.range;
      const k = Math.min(this.dope.rows.length - 1, Math.max(0, Math.floor(r / 100) - 1));
      const lo = this.dope.rows[k]!;
      const hi = this.dope.rows[Math.min(this.dope.rows.length - 1, k + 1)]!;
      const f = hi.range > lo.range ? Math.min(1, Math.max(0, (r - lo.range) / (hi.range - lo.range))) : 0;
      const across = wind.x * Math.cos(view.yaw) - wind.z * Math.sin(view.yaw);
      s.readout = { hold: lo.up + (hi.up - lo.up) * f, wind: -across * (lo.windPerMs + (hi.windPerMs - lo.windPerMs) * f), windFrom: compass(env.wind.fromDeg) };
    }
    return s;
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
    return { x: this.fly.x, y: this.fly.y, z: this.fly.z, yaw, pitch, roll: 0, fov: this.shooterView ? SHOOTER_VIEW_FOV : fov };
  }

  /** What systems drew in their last tick: lines in the world, labels in the HUD. */
  private showDrawn(): void {
    const shapes = this.sim.debugCanvas.shapes;
    this.renderer.setDrawn(shapes, this.sim.tick);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.drawnLabels.length = 0;
    // What you're looking right at, or pointing at, says everything it has; the rest stay short.
    const cx = this.input.locked ? w / 2 : this.input.mouseX;
    const cy = this.input.locked ? h / 2 : this.input.mouseY;
    let closest = -1;
    let bestD = 80 * 80;
    for (const s of shapes) {
      if (s.kind !== 'label') continue;
      const at = this.renderer.project(s.x, s.y, s.z, w, h);
      // Off the edge of the view, or behind a panel, it's only in the way.
      if (!at || at.x < 4 || at.y < 4 || at.x > w - 4 || at.y > h - 4 || this.hud.dock.covers(at.x, at.y)) continue;
      if (s.detail !== undefined) {
        const d = (at.x - cx) * (at.x - cx) + (at.y - cy) * (at.y - cy);
        if (d < bestD) {
          bestD = d;
          closest = this.drawnLabels.length;
        }
      }
      this.drawnLabels.push({ x: at.x, y: at.y, text: s.text, color: palette.debug.tones[s.tone], detail: s.detail });
    }
    // The compound simulator's shots come from wherever the script is, and the panel can only say so in numbers.
    const shot = this.scene?.name === 'compound' ? this.gauges?.lastShot : null;
    if (shot) {
      const at = this.renderer.project(shot.x, shot.y + 1.2, shot.z, w, h);
      if (at) this.drawnLabels.push({ x: at.x, y: at.y, text: 'shooter', color: palette.debug.tones.bad });
    }
    // The target, findable among the labels; once he's aboard, what he's aboard.
    const objective = this.sim.index.of('objective')[0]?.objective;
    if (objective) {
      const him = this.sim.index.get(objective.target);
      const carrying = objective.status === 'escaping' ? this.sim.index.of('vehicle').find((v) => v.vehicle.escape) : undefined;
      const where = him && 'body' in him ? { x: him.body.x, y: him.body.y + him.body.eyeHeight + 1.4, z: him.body.z } : carrying ? { x: carrying.solid.x, y: carrying.solid.y1 + 1.2, z: carrying.solid.z } : null;
      const at = where && this.renderer.project(where.x, where.y, where.z, w, h);
      if (at) this.drawnLabels.push({ x: at.x, y: at.y, text: him ? 'TARGET' : 'TARGET aboard', color: palette.debug.tones.warn });
    }
    if (closest >= 0) this.drawnLabels[closest]!.text = this.drawnLabels[closest]!.detail!;
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
            : hit.what === 'crown'
              ? 'tree crown'
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
    // The player as guards see them (sim/perception/sight.ts): the light at the ground beneath, the caps and the rates.
    const light = groundLight(w, this.sim.solids, w.spec.env, this.sim.tick / T.sim.tickHz, p.x, p.y, p.z, T);
    const stanceCap = stanceVisibility(p, T.bodies.player, T);
    const moveFactor = movementVisibility(p, T.bodies.player, T);
    const sizes = this.replay ? null : (this.recorder?.sizes ?? null);
    const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const scale = TIME_SCALES[this.timeScaleIndex]!;
    // A slow machine can't always run the ticks fast-forward asks for (8 a frame at most, times the scale).
    const short = Math.abs(this.deliveredScale - scale) > 0.05 * scale ? ` (${this.deliveredScale.toFixed(1)}× delivered)` : '';
    const mode = this.replay
      ? `replay ${this.replay.playing ? 'playing' : 'paused'} ×${this.replay.speed} · ${clock(this.sim.tick / this.replay.hz)} of ${clock(this.replay.ticks / this.replay.hz)}${this.detached ? ' · fly camera' : ''}`
      : this.detached
        ? 'fly camera'
        : `${scale}× speed${short}`;
    const lines = [
      `${s.fps.toFixed(0)} fps · seed ${w.seed} · tick ${this.sim.tick.toLocaleString('en-US')} · ${clock(played)} played · ${mode}`,
      `build ${BUILD}${this.scene ? ` · scene ${this.scene.name} v${this.scene.version}` : ''}`,
      `${this.tuning.sim.tickHz} Hz · frame ${s.frameMs.toFixed(1)} ms (p95 ${s.p95Ms.toFixed(1)}) · cpu ${s.cpuMs.toFixed(1)} ms · sim ${(this.tickMs * 1000).toFixed(0)} µs/tick`,
      `${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris · ${(r.lines / 1000).toFixed(0)}k lines`,
      `systems ${this.systemCosts.map((c) => `${c.name} ${c.usPerTick.toFixed(0)}`).join(' · ') || '—'} µs`,
      ``,
      `PLAYER`,
      `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · heading ${headingDegrees(p.yaw).toFixed(0)}° · pitch ${((p.pitch * 180) / Math.PI).toFixed(0)}°`,
      `${p.stance}${p.proneTransition ? ' (changing)' : ''} · ${p.gait} ${p.speed.toFixed(2)} m/s · ${surfaceName(p.surface)}${p.standingOn >= 0 ? ' (object)' : `, slope ${slopeDeg.toFixed(0)}°`}`,
      `noise ${p.loudness.toFixed(2)} → heard within ${(p.loudness * T.noise.radiusPerUnit).toFixed(1)} m`,
      `outcome ${this.sim.state.outcome.status}${this.sim.state.outcome.reason ? ` · ${this.sim.state.outcome.reason}` : ''}`,
      `seen: ranges ×${(stanceCap * light).toFixed(2)} (stance ×${stanceCap.toFixed(2)}, ${lightName(light, T)} ×${light}) · fills ×${moveFactor.toFixed(2)} moving`,
      ...this.rifleLines(),
      `aim ${this.aimText ?? '—'}`,
      ``,
      `WORLD`,
      `relief ${w.terrain.minHeight.toFixed(0)} to ${w.terrain.maxHeight.toFixed(0)} m · ${w.features.ridges?.length ?? 0} ridges · generated in ${Math.round(w.genMs)} ms`,
      `overwatch ${w.report.overwatchSectors}/8 directions · ${w.report.perches.length} perches · reachable from ${w.report.accessSectors}/16`,
      ...(w.camp.layout ? [`compound: ${w.camp.layout.type} · ${w.camp.layout.plan.perimeter} · crux ${w.camp.crux ?? 'none'}`] : []),
      `${w.props.trees.length.toLocaleString('en-US')} trees · ${w.props.rocks.length.toLocaleString('en-US')} rocks · ${w.props.bushes.length.toLocaleString('en-US')} bushes · ${w.camp.guards.length} guards${this.sim.solids.count ? ` · ${this.sim.solids.count} solid entities` : ''}`,
      sizes
        ? `recording ${kb(sizes.inputs)} inputs · ${kb(sizes.states)} states · ${kb(sizes.events)} events`
        : this.replay
          ? `watching ${this.replay.label} · recorded by build ${this.replay.rec.header.build || '?'}`
          : 'recording —',
      ``,
      ...this.perceptionLines(),
      ...this.campLines(),
      ...this.whyLines(),
      ``,
      `SOUND`,
      this.sound.report(),
      ``,
      `PLAYTEST · ${this.capture.status}`,
    ];
    return lines.join('\n');
  }

  /**
   * The debug panel's perception section: each guard who perceives, on one line: what he's
   * doing, where he stands on the awareness ladder, his meter and where he believes you are.
   */
  private perceptionLines(): string[] {
    const guards = this.sim.guards.filter((g) => g.senses);
    if (guards.length === 0) return [];
    const T = this.tuning;
    const aware = guards.filter((g) => g.senses!.awareness.state !== 'unaware').length;
    const lines = ['', `PERCEPTION · ${guards.length} guards · ${aware} aware`];
    const name = (g: (typeof guards)[number]): string => `${(this.world.camp.guards[g.guard.spawn]?.role ?? 'guard').replace('-operator', '')} ${g.id}`;
    const wide = Math.max(...guards.map((g) => name(g).length));
    const acts = Math.max(...guards.map((g) => g.brain?.act.length ?? 0));
    for (const g of guards) {
      const s = g.senses!;
      const b = s.belief;
      const believes = b ? ` ${b.x.toFixed(0)},${b.z.toFixed(0)}±${beliefRadius(b, this.sim.tick, T.sim.tickHz, T.perception.awareness.believedSpeed).toFixed(0)}${b.seen ? ' seen' : ''}` : '';
      lines.push(`${name(g).padEnd(wide)} ${(g.brain?.act ?? '').padEnd(acts)} ${s.awareness.state} ${Math.round(s.sight.meter * 100)}%${believes}`);
    }
    return lines;
  }

  /** The debug panel's why: the last change of awareness and the last reaction, each explained back to what caused it (design doc · Fairness rules). */
  private whyLines(): string[] {
    const all = [...this.log.all].reverse();
    const chain = (e: (typeof all)[number] | undefined): string[] => (e ? explainChain(this.log.explain(e.id), (id) => this.who(id)) : []);
    const noticed = chain(all.find((e) => e.type === 'alert'));
    const reacted = chain(all.find((e) => e.type === 'act' && e.to !== 'routine' && e.to !== 'return'));
    if (noticed.length + reacted.length === 0) return [];
    // The newest thing explained, on the line that shows while it's closed.
    const latest = reacted[reacted.length - 1] ?? noticed[noticed.length - 1]!;
    return ['', `WHY · ${latest}`, ...(noticed.length ? ['Last alert:', ...noticed] : []), ...(reacted.length ? ['Last reaction:', ...reacted] : [])];
  }

  /**
   * The debug panel's camp section (lab E): the camp's level and what it settles to, the
   * search under way, its belief map, its estimate of a shooter and its orders.
   * Each guard's act is on his perception line, and what caused the last reaction under why.
   */
  private campLines(): string[] {
    const commander = this.sim.index.of('commander')[0];
    if (!commander) return [];
    const T = this.tuning;
    const hz = T.sim.tickHz;
    const c = commander.camp;
    const tick = this.sim.tick;
    const quiet = c.lastPercept >= 0 ? (tick - c.lastPercept) / hz : -1;
    const search = c.search ? ` · search, ${quiet.toFixed(0)} s since the last report (${T.brain.camp.search.minSeconds}–${T.brain.camp.search.maxSeconds} s)` : '';
    const mass = c.map.p.reduce((a, b) => a + b, 0);
    const lines = ['', `CAMP · ${c.level} (settles ${c.floor})${search} · belief ${(mass * 100).toFixed(0)}%`];
    const est = c.shots.estimate;
    if (est) lines.push(`shooter believed at ${est.x.toFixed(0)}, ${est.z.toFixed(0)} · ${c.shots.bearings.length} bearings${c.reinforceCalled >= 0 ? ` · reinforcements called ${((tick - c.reinforceCalled) / hz).toFixed(0)} s ago` : ''}`);
    if (c.tasks.length) lines.push(`orders: ${c.tasks.map((t) => `${t.kind} (${t.assigned.length}/${t.capacity})`).join(', ')}`);
    return lines;
  }

  /** Who an entity is, for explanations: you, the camp, or a guard by role. */
  private who(id: number): string {
    if (id === this.sim.playerId) return 'you';
    if (id === this.sim.index.of('commander')[0]?.id) return 'the camp';
    const g = this.sim.guards.find((x) => x.id === id);
    return g ? `${this.world.camp.guards[g.guard.spawn]?.role ?? 'guard'} ${id}` : `entity ${id}`;
  }

  /** The compound simulator opens with the camera already up above the camp, looking down on it. */
  private overTheCamp(): void {
    this.setDetached(true);
    const s = this.world.camp.site;
    this.fly.set(s.x, this.world.terrain.heightAt(s.x, s.z) + 70, s.z + 110);
    this.input.yaw = 0;
    this.input.pitch = -0.55;
  }

  /** The compound simulator: look along the last shot from where it was fired, close up, to judge the line for yourself. The same key again comes back. */
  private toggleShooterView(): void {
    if (this.shooterView) {
      const v = this.shooterView;
      this.fly.set(v.x, v.y, v.z);
      this.input.yaw = v.yaw;
      this.input.pitch = v.pitch;
      this.shooterView = null;
      return;
    }
    const s = this.gauges?.lastShot;
    if (!s) {
      this.hud.toast('No shot yet');
      return;
    }
    if (!this.detached) this.setDetached(true);
    this.shooterView = { x: this.fly.x, y: this.fly.y, z: this.fly.z, yaw: this.input.yaw, pitch: this.input.pitch };
    this.fly.set(s.x, s.y, s.z);
    this.input.yaw = yawFromDirection(s.dx, s.dz);
    this.input.pitch = Math.asin(Math.max(-1, Math.min(1, s.dy)));
    this.hud.toast("From the shooter's eye, along the last shot · press 7 to come back");
  }

  /** The compound simulator: something happens where you're pointing, the free mouse or the crosshair, and a shot comes from the camera itself. */
  private dropWherePointing(what: StimulusName): void {
    if (!this.sim) return;
    if (!this.detached) this.setDetached(true);
    const yaw = this.input.yaw;
    const pitch = this.input.pitch;
    const d = this.mouseFree ? this.renderer.rayThrough(this.input.mouseX, this.input.mouseY, window.innerWidth, window.innerHeight) : { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const hit = raycast({ world: this.world, solids: this.sim.solids, bodies: this.sim.queryBodies() }, this.fly.x, this.fly.y, this.fly.z, d.x, d.y, d.z, 2000, Blocks.All, emptyHit(), -1, IGNORE_CROWNS);
    if (hit.what === 'none') {
      this.hud.toast('Nothing there to drop it on');
      return;
    }
    this.drops.push(stimulus(what, { x: hit.x, y: hit.y, z: hit.z }, { x: this.fly.x, y: this.fly.y, z: this.fly.z }));
    this.hud.toast(`${what}, at ${hit.x.toFixed(0)}, ${hit.z.toFixed(0)}`);
  }

  /** The heading of the way out, once the target is down and there's somewhere to go; null otherwise. */
  private wayOutHeading(): number | null {
    if (!this.sim) return null;
    const o = commanderOf(this.sim)?.camp.objective;
    if (!o?.getOut || o.status !== 'done') return null;
    return headingDegrees(yawFromDirection(o.getOut.x - this.sim.player.x, o.getOut.z - this.sim.player.z));
  }

  /** The rifle and the vitals in the debug panel (sim/ballistics, sim/body/vitals.ts). */
  private rifleLines(): string[] {
    const r = this.curr?.rifle;
    if (!r) return [];
    return [
      `rifle ${r.load}${r.suppressed ? ' suppressed' : ''} · zero ${r.zero} m · ${r.rounds} rounds · bolt ${r.bolt.toFixed(1)} s · scope ${r.raise.toFixed(2)}`,
      `sway ${r.up.toFixed(2)} up ${r.right.toFixed(2)} right mil · rest ${r.rest.toFixed(2)} · steady ${r.steady.toFixed(2)} · glint ${r.glint.toFixed(2)}`,
      `heart ${r.heartRate.toFixed(0)} bpm · breath ${r.held > 0 ? `held ${r.held.toFixed(1)} s` : 'breathing'} · air ${r.air.toFixed(2)}${this.ranged ? ` · ranged ${this.ranged.range} m` : ''}`,
    ];
  }

  // --- Replays. ------------------------------------------------------------------------

  /** Opens a recording file (dropped on the page, or picked) for watching. */
  openReplayFile(file: Blob & { name?: string }): void {
    // In the gesture that chose it: browsers let sound start only then.
    this.sound.unlock();
    void file
      .arrayBuffer()
      .then((buf) => this.openReplay(new Uint8Array(buf), file.name ?? 'recording'))
      .catch((e) => this.fail('replay', e));
  }

  /** ?replay=<url>: a recording to fetch and watch (in development, playtests/<name>.slrec). */
  private openReplayUrl(url: string): void {
    this.overlay.show('loading');
    void fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then((buf) => this.openReplay(new Uint8Array(buf), url.split('/').pop() ?? url))
      .catch((e) => this.fail('replay', e));
  }

  /**
   * Watches a recording: builds its world, re-simulates it once to keep save-states for
   * seeking, and shows it from the start, playing. Says why if this build can't.
   */
  openReplay(bytes: Uint8Array, label: string): void {
    this.exitReplayMode();
    this.input.releaseLock();
    this.paused = true;
    this.failure = null;
    this.hud.setVisible(false);
    this.overlay.show('loading');
    this.overlay.setStatus(`Preparing ${label}…`);
    // Let the loading state paint before the main thread is busy re-simulating.
    window.setTimeout(() => {
      let replay: Replay;
      try {
        replay = new Replay(Recording.fromBytes(bytes), label);
      } catch (e) {
        this.fail('replay', e);
        return;
      }
      this.enterReplay(replay);
    }, 30);
  }

  private enterReplay(r: Replay): void {
    this.log.clear();
    this.cues.clear();
    this.replay = r;
    this.devKeys();
    this.world = r.world;
    this.scene = r.scene;
    this.seed = r.rec.header.mission.seed;
    this.sim = r.sim;
    // Bodies drawn, and steady sounds heard, by the recording's numbers; the view by the viewer's.
    const recorded = this.replayTuning(r);
    this.renderer.setWorld(r.world, recorded);
    this.renderer.setTuning(recorded);
    this.sound.setTuning(r.sim.tuning);
    this.sound.setWorld(r.world);
    this.sound.setSimulation(this.sim);
    this.sim.drawDebug = this.debug;
    this.clock = new FixedStepClock(r.hz);
    this.seekReplay(0);
    if (this.detached) this.setDetached(false);
    this.input.freeKeys = true;
    this.input.contexts.delete('play');
    this.input.contexts.add('replay');
    this.input.contexts.add('debug');
    this.paused = false;
    this.lastNow = 0;
    this.overlay.hide();
    this.hud.setVisible(true);
    const h = r.rec.header;
    const when = h.createdAt ? new Date(h.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date';
    this.timeline.show(`${h.scene ? `scene ${h.scene.name}` : h.mission.seed} · ${when} · build ${h.build || '?'}`, r.ticks, r.hz, r.marks);
    document.body.classList.add('replaying');
    const url = new URL(window.location.href);
    if (!url.searchParams.has('replay')) {
      url.searchParams.delete('seed');
      url.searchParams.delete('scene');
      url.searchParams.delete('params');
      window.history.replaceState(null, '', url);
    }
    this.hud.toast(`Replay · ${this.input.map.describe('replayPlay')} plays or pauses, ← → jump 5 s, N flies`);
  }

  /** A stopped replay shows exactly the tick it stopped on, not the one before (alpha restarts at 0). */
  private holdReplayPicture(): void {
    this.prev = this.sim.snapshot(this.prev);
    this.curr = this.sim.snapshot(this.curr);
    this.clock.reset();
    this.redraws++;
  }

  /** Puts the replay at a tick, exactly (from the nearest save-state). */
  private seekReplay(tick: number): void {
    const r = this.replay;
    if (!r) return;
    r.seeker.seek(tick);
    this.prev = this.sim.snapshot();
    this.curr = this.sim.snapshot();
    this.clock.reset();
    this.redraws++;
  }

  /** A frame of a playing replay: the recorded ticks the clock asks for, with their sounds. */
  private replayTicks(dt: number): void {
    const r = this.replay!;
    if (!r.playing) {
      this.clock.reset();
      return;
    }
    const ticks = this.clock.advance(dt, r.speed);
    if (ticks === 0) return;
    this.soundTiming.shown = (this.sim.tick + ticks - 1 + this.clock.alpha) / r.hz;
    this.soundTiming.scale = r.speed;
    this.soundTiming.hold = Math.min(this.frameSpan, 0.05);
    for (let i = 0; i < ticks; i++) {
      if (this.sim.tick >= r.ticks) {
        r.playing = false;
        this.holdReplayPicture();
        this.hud.toast('End of the recording');
        break;
      }
      const events = r.seeker.step();
      this.log.add(events);
      const swap = this.prev;
      this.prev = this.curr;
      this.curr = this.sim.snapshot(swap);
      if (events.length === 0) continue;
      this.renderer.addEvents(events, this.time);
      if (r.speed <= REPLAY_SOUND_SPEED) this.sound.play(events, this.sim.player.eyeHeight, this.soundTiming, !this.detached);
      this.caption(events);
      for (const e of events) if (e.type === 'outcome') this.hud.toast(`The run ${e.status} here`);
    }
  }

  /** Back to the valley (or scene) the replay was in, from its start screen. */
  private leaveReplay(): void {
    const r = this.replay;
    if (!r) return;
    this.generate(r.rec.header.mission.seed);
  }

  /**
   * Undoes everything watching set up: the timeline, the keys, the recording's numbers.
   * Whatever ends a replay (Leave, a new valley, another recording, a failed open) comes
   * through here first.
   */
  private exitReplayMode(): void {
    if (!this.replay) return;
    this.replay = null;
    this.devKeys();
    this.timeline.hide();
    document.body.classList.remove('replaying');
    if (this.detached) this.setDetached(false);
    this.input.releaseLock();
    this.input.freeKeys = false;
    this.input.contexts.delete('replay');
    this.input.contexts.add('play');
    if (!this.debug) this.input.contexts.delete('debug');
    this.renderer.setTuning(this.tuning);
    this.sound.setTuning(this.tuning);
  }

  /** The tuning a replay is drawn and heard with: the recording's bodies and noise, the viewer's view. */
  private replayTuning(r: Replay): Tuning {
    return { ...this.tuning, bodies: r.sim.tuning.bodies, noise: r.sim.tuning.noise };
  }

  /** The deployed game's kept runs, on the start and pause screens, for saving as files. */
  private showKept(): void {
    const store = this.capture.store;
    if (!(store instanceof BrowserStore)) return;
    // After any save under way, so the list includes it.
    void this.capture
      .settled()
      .then(() => store.list())
      .then((runs) =>
        this.overlay.setKept(
          runs.slice(0, 5).map((r) => ({
            text: keptLabel(r),
            save: () => this.download(r.recording, `sightline-${r.name}.slrec`),
            watch: () => this.openReplayFile(Object.assign(r.recording, { name: r.name })),
            forget: () => void store.remove(r.name).then(() => this.showKept()),
          })),
          () => {
            if (window.confirm(`Delete all ${runs.length} runs kept in this browser?`)) void Promise.all(runs.map((r) => store.remove(r.name))).then(() => this.showKept());
          },
        ),
      )
      .catch(() => undefined);
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** The machine and browser, for the playtest report: what only the browser knows. */
  private machine(): Record<string, unknown> {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return {
      userAgent: nav.userAgent,
      language: nav.language,
      cores: nav.hardwareConcurrency,
      memoryGB: nav.deviceMemory ?? null,
      gpu: this.renderer.gpuName(),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      pixelRatio: this.renderer.gl.getPixelRatio(),
      screen: `${screen.width}×${screen.height} @${window.devicePixelRatio || 1}`,
      sound: this.sound.status(),
    };
  }

  private saveRecording(): void {
    if (!this.sim) return;
    if (this.replay) {
      // Watching a recording: saving gives that recording, as it was opened.
      this.download(new Blob(this.replay.rec.toParts() as BlobPart[], { type: 'application/octet-stream' }), `sightline-${this.replay.label.replace(/\.slrec$/, '')}.slrec`);
      return;
    }
    if (!this.recorder) return;
    const rec = this.recorder.finish(this.sim, new Date().toISOString());
    const name = `sightline-${this.world.seed}-${this.sim.tick}.slrec`;
    this.download(new Blob(rec.toParts() as BlobPart[], { type: 'application/octet-stream' }), name);
    this.savedTick = this.sim.tick;
    this.overlay.setStatus(`Saved ${name} · to re-simulate it: npm run sim -- --replay <folder>/${name}`);
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
      /** The compound simulator: drops a stimulus at a world point, from another (`what`: game/drops.ts). */
      drop: (what: StimulusName, x: number, y: number, z: number, fromX = x, fromY = y, fromZ = z) => {
        ready('drop');
        finite('drop', x, y, z, fromX, fromY, fromZ);
        this.drops.push(stimulus(what, { x, y, z }, { x: fromX, y: fromY, z: fromZ }));
      },
      play: () => {
        ready('play');
        this.sound.unlock();
        this.paused = false;
        this.overlay.hide();
        this.hud.setVisible(true);
        this.lastNow = 0;
        this.trial?.begin();
      },
      /** Trial mode (A12): where the sitting stands, or null outside one. */
      trial: () => this.trial?.state() ?? null,
      /** Where a world point is drawn, in CSS pixels, or null off screen (the agents' pre-screen, A12). */
      onScreen: (x: number, y: number, z: number) => this.renderer.project(x, y, z, window.innerWidth, window.innerHeight),
      /** Trial mode: answers the frozen trial, as Y or N does. */
      answer: (yes: boolean) => this.trial?.press(yes ? 'KeyY' : 'KeyN'),
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
      /** The map's size, as its key cycles it; the one to show if given ('small', 'large' or 'hidden'). */
      minimap: (mode?: MapMode): MapMode => {
        if (mode !== undefined && !['small', 'large', 'hidden'].includes(mode)) throw new TypeError(`sightline.minimap() takes 'small', 'large' or 'hidden', not ${String(mode)}`);
        while (mode !== undefined && this.hud.map.mode !== mode) this.hud.map.cycle();
        return this.hud.map.mode;
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
      tap: (code: 'KeyC' | 'KeyZ' | 'KeyT' | 'KeyY') => this.input.tap(code),
      /** Click as if the left button were pressed now: a shot from the frame on screen. */
      click: () => this.input.click(),
      /** Sandbox (A10): drop a noise where the view points, as the debug view's key does. */
      noise: () => this.input.dropNoise(),
      /** Drops a body where the view points, as the sandbox key does (A9). */
      dropBody: () => this.input.dropBody(),
      /**
       * Sandbox (A10): the debug view's time scale, to the nearest step (0.25× to 8×); the
       * scale now. Fast-forward runs only in the debug view.
       */
      timeScale: (scale?: number) => {
        if (scale !== undefined && Number.isFinite(scale)) {
          let best = 0;
          for (let k = 1; k < TIME_SCALES.length; k++) if (Math.abs(TIME_SCALES[k]! - scale) < Math.abs(TIME_SCALES[best]! - scale)) best = k;
          this.timeScaleIndex = best;
        }
        return TIME_SCALES[this.timeScaleIndex]!;
      },
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
        if (!this.replay && !this.recorder) throw new Error('sightline.recording() needs a run: wait until state().overlay is \'start\'');
        const bytes = this.replay ? this.replay.rec.toBytes() : this.recorder!.finish(this.sim, new Date().toISOString()).toBytes();
        // In slices: one character at a time takes half a second an hour of play.
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      fog: (density: number) => {
        finite('fog', density);
        this.renderer.setTuning({ ...this.tuning, view: { ...this.tuning.view, fogDensity: Math.max(0, density) } });
      },
      /** Whether sound runs and how many voices are sounding (a browser started without a gesture keeps it suspended). */
      sound: () => this.sound.status(),
      /** Guards hidden with the camera inside them, and foliage drawn from inside, in the last frame. */
      insides: () => this.renderer.insides(),
      /** Watch a recording (base64, as recording() gives it). */
      replay: (base64: string) => {
        if (typeof base64 !== 'string') throw new TypeError('sightline.replay() takes a recording as base64, as sightline.recording() gives it');
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        this.openReplay(bytes, 'automation');
      },
      /** Where the replay is, or null outside one. */
      replayState: () => (this.replay ? { tick: this.sim.tick, ticks: this.replay.ticks, playing: this.replay.playing, speed: this.replay.speed } : null),
      /** Each guard who perceives: his state on the awareness ladder, meter and belief, and where his eyes are (lab A). */
      perception: () =>
        this.sim.guards
          .filter((g) => g.senses)
          .map((g) => ({
            id: g.id,
            role: this.world.camp.guards[g.guard.spawn]?.role ?? null,
            state: g.senses!.awareness.state,
            meter: g.senses!.sight.meter,
            belief: g.senses!.belief ? { ...g.senses!.belief } : null,
            eye: { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z },
          })),
      /** An event explained back to what caused it, in words (sim/perception/explain.ts); the latest change of awareness if no id. */
      explain: (id?: number) => {
        const target = id ?? [...this.log.all].reverse().find((e) => e.type === 'alert')?.id;
        return target === undefined ? [] : explainChain(this.log.explain(target), (x) => this.who(x));
      },
      seek: (tick: number) => {
        finite('seek', tick);
        if (!this.replay) throw new Error('sightline.seek() needs a replay: open one with sightline.replay()');
        this.seekReplay(tick);
      },
      /** The last playtest save, and whether one is under way. */
      playtest: () => ({ status: this.capture.status, busy: this.capture.busy, where: this.capture.store?.where ?? null }),
      state: () => ({
        seed: this.world?.seed,
        scene: this.scene?.name ?? null,
        tick: this.sim?.tick,
        player: this.sim ? { ...this.sim.player } : null,
        perf: this.stats.summary(),
        render: this.renderer.stats(),
        aim: this.aimText,
        /** The camera as last drawn. */
        camera: { x: this.drawnPose.x, y: this.drawnPose.y, z: this.drawnPose.z, yaw: this.drawnPose.yaw, pitch: this.drawnPose.pitch },
        timeline: this.timeline.visible,
        contexts: [...this.input.contexts],
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
    return { x: p.x, y: p.y, z: p.z, yaw, pitch, roll: 0, fov };
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

/** Between two angles the short way round. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** A kept run as a button: what was played, for how long, and when. */
function keptLabel(r: StoredRun): string {
  const when = new Date(r.savedAt);
  const today = new Date().toDateString() === when.toDateString();
  const at = today ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : when.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${r.label} · ${clock(r.ticks / (r.tickHz || 30))} · ${at}`;
}

function samePose(a: CameraPose, b: CameraPose): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch && a.roll === b.roll && a.fov === b.fov;
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

/** The line of sight that puts a still shot from `eye` on `target`, for the dope card. */
function solveAimInto(eye: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, zero: ReturnType<typeof zeroOf>, b: ReturnType<typeof ballisticOf>, maxFlight: number, out: { x: number; y: number; z: number }): void {
  solveAim(eye, target, 0, 0, zero, b, maxFlight, out);
}

/** A compass point for a bearing, degrees. */
function compass(deg: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}
