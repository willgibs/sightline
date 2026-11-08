import { Optic, type InputFrame } from '../sim/kernel/input';
import type { Command } from '../sim/kernel/commands';
import { CommandLatch } from './commandLatch';
import { wrapAngle } from '../sim/kernel/core/math';
import { ActionMap, type Action, type Context } from './actions';

/**
 * Keyboard and mouse, through the action map (actions.ts): code asks for actions, never
 * keys. Mouse look updates the view angles every frame for responsiveness; held actions
 * (moving, sprint, zoom) are sampled once per simulation tick. Stance toggles are latched
 * between ticks so a quick tap is never lost, and clicks are latched against the frame
 * on screen (commandLatch.ts), so a shot goes where the crosshair was.
 */

/** A single mouse event further than this is a browser glitch (a jump on locking), not a flick. */
const MAX_MOUSE_STEP = 400;

export class InputController {
  yaw = 0;
  pitch = 0;
  locked = false;
  /** Radians per pixel; the game scales it while zoomed. */
  sensitivity = 0.0022;
  sensitivityScale = 1;
  /** Mouse up looks down (a setting). */
  invertY = false;
  /** Ask the browser for raw mouse movement, without the system's acceleration (a setting, where supported). */
  rawMouse = false;
  /** How far the view can tilt up or down (tuning.bodies.player.pitchLimit, set by the game). */
  pitchLimit = 1.45;
  /** Actions that happen once per press, outside the tick: the debug keys, the marker. */
  onAction: ((action: Action) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Called when the browser refuses the pointer lock (a frame without permission, a re-lock right after Esc). */
  onLockRefused: (() => void) | null = null;
  /** Clicks waiting for the next tick, each remembering its frame. The game reports frames to it. */
  readonly latch = new CommandLatch();
  /** The contexts whose bindings count now (actions.ts); the game keeps it current. */
  readonly contexts = new Set<Context>(['play', 'always']);
  /**
   * Keys act without the pointer lock (watching a replay: nothing is being played, and the
   * mouse is for the timeline).
   */
  freeKeys = false;
  private readonly commands: Command[] = [];
  /** Inputs held down: key codes, and Mouse0 to Mouse4. */
  private readonly down = new Set<string>();
  /** Pressed-kind actions since the last tick sampled them (stance toggles). */
  private readonly pressed = new Set<Action>();
  /** Browsers can report one huge jump right after the lock changes: the next event is skipped. */
  private skipMove = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly map = new ActionMap(),
  ) {}

  attach(): void {
    const on = <K extends keyof WindowEventMap>(target: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => this.inputDown(e.code, e));
    on(window, 'keyup', (e) => this.down.delete(e.code));
    on(window, 'blur', () => this.releaseAll());
    on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      if (this.skipMove) {
        this.skipMove = false;
        return;
      }
      const mx = e.movementX;
      const my = e.movementY;
      if (!Number.isFinite(mx) || !Number.isFinite(my) || Math.abs(mx) > MAX_MOUSE_STEP || Math.abs(my) > MAX_MOUSE_STEP) return;
      const k = this.sensitivity * this.sensitivityScale;
      if (!Number.isFinite(k)) return;
      this.yaw = wrapAngle(this.yaw - mx * k);
      this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch - (this.invertY ? -my : my) * k));
    });
    on(document, 'mousedown', (e) => {
      if (this.locked) this.inputDown(`Mouse${e.button}`, null);
    });
    on(document, 'mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    on(document, 'contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    const lockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.skipMove = true;
      if (this.locked) {
        // Keys go to the game now, not to whatever button or field had the focus.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      } else {
        this.releaseAll();
      }
      this.onLockChange?.(this.locked);
    };
    document.addEventListener('pointerlockchange', lockChange);
    this.cleanup.push(() => document.removeEventListener('pointerlockchange', lockChange));
    const lockError = () => this.onLockRefused?.();
    document.addEventListener('pointerlockerror', lockError);
    this.cleanup.push(() => document.removeEventListener('pointerlockerror', lockError));
  }

  detach(): void {
    for (const fn of this.cleanup.splice(0)) fn();
  }

  /** Whether any input bound to a held action is down, in the active contexts. */
  held(action: Action): boolean {
    if (!this.contexts.has(this.map.actions[action].context)) return false;
    for (const input of this.map.actions[action].inputs) if (this.down.has(input)) return true;
    return false;
  }

  /** Zoom (binoculars) is held: the right button or F. */
  get zoomHeld(): boolean {
    return this.held('zoom');
  }

  /** Automation: hold or release the zoom. */
  set zoomHeld(on: boolean) {
    const input = this.map.actions.zoom.inputs[0]!;
    if (on) this.down.add(input);
    else for (const i of this.map.actions.zoom.inputs) this.down.delete(i);
  }

  private releaseAll(): void {
    this.down.clear();
  }

  requestLock(): void {
    try {
      // Raw movement where the browser offers it and the player asked; otherwise the system's.
      const options = this.rawMouse ? ({ unadjustedMovement: true } as const) : undefined;
      const p = (this.canvas.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined).call(this.canvas, options);
      p?.catch?.(() => {
        if (options) {
          // Not supported here (or refused with it): try once more without.
          this.rawMouse = false;
          this.requestLock();
        } else {
          this.onLockRefused?.();
        }
      });
    } catch {
      // Browsers refuse a re-lock for about a second after Esc; the overlay stays up and says so.
      this.onLockRefused?.();
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Automation: hold exactly these keys (KeyboardEvent.code values), no pointer lock needed. */
  holdKeys(codes: readonly string[]): void {
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) throw new TypeError('hold() takes a list of key codes, such as ["KeyW"]');
    this.down.clear();
    for (const c of codes) this.down.add(c);
  }

  /** Automation: request a stance toggle as if C or Z were tapped. */
  tap(code: 'KeyC' | 'KeyZ'): void {
    if (code === 'KeyC') this.pressed.add('crouch');
    else if (code === 'KeyZ') this.pressed.add('prone');
    else throw new TypeError(`tap() takes 'KeyC' or 'KeyZ', not ${String(code)}`);
  }

  /** A key or button went down: hold it, and trigger what it is bound to in the active contexts. */
  private inputDown(input: string, e: KeyboardEvent | null): void {
    const repeat = e?.repeat ?? false;
    const actions = this.map.actionsOf(input, this.contexts);
    // The debug view toggles even while paused.
    if (actions.includes('debugView')) {
      e?.preventDefault();
      if (!repeat) this.onAction?.('debugView');
      return;
    }
    if (!this.locked && !this.freeKeys) {
      // A held action's key pressed before the lock still counts when play resumes.
      if (!repeat && actions.some((a) => this.map.actions[a].kind === 'held')) this.down.add(input);
      return;
    }
    if (!this.locked) {
      // Free keys: the page keeps its own (Tab, shortcuts), except the ones bound here
      // in a context that's on (an arrow would scroll it).
      if (e && actions.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
      else if (e && actions.length > 0) return;
    } else if (e && (this.map.isBound(input) || input.startsWith('F') || input === 'Tab' || ((e.ctrlKey || e.metaKey) && !e.shiftKey))) {
      // While playing, keys are the game's: Tab would move the focus, and browser shortcuts
      // (reload, find, print, save) would take the window away mid-run. Ctrl+Shift stays the
      // browser's, for its developer tools.
      e.preventDefault();
    }
    if (repeat) return;
    this.down.add(input);
    for (const a of actions) {
      if (this.map.actions[a].kind !== 'pressed') continue;
      if (a === 'fire') this.latch.latch('fire');
      else if (a === 'crouch' || a === 'prone') this.pressed.add(a);
      else this.onAction?.(a);
    }
  }

  /** Automation: click, as if the left button were pressed now. */
  click(): void {
    this.latch.latch('fire');
  }

  /**
   * Fills one tick of player input. `frozen` sends a neutral frame (detached camera).
   * `startTick` is the simulation's tick before this one runs, which dates the clicks.
   */
  sampleTick(out: InputFrame, frozen: boolean, startTick: number): InputFrame {
    out.moveX = frozen ? 0 : (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    out.moveZ = frozen ? 0 : (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    out.sprint = !frozen && this.held('sprint');
    out.crouch = !frozen && this.pressed.has('crouch');
    out.prone = !frozen && this.pressed.has('prone');
    this.pressed.clear();
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.optic = !frozen && this.zoomHeld ? Optic.Binoculars : Optic.None;
    out.lean = frozen ? 0 : (this.held('leanRight') ? 1 : 0) - (this.held('leanLeft') ? 1 : 0);
    if (frozen) {
      this.latch.clear();
      this.commands.length = 0;
    } else {
      this.latch.drain(startTick, this.commands);
    }
    out.commands = this.commands;
    return out;
  }

  /**
   * Free-flight axes for the detached camera: the movement keys, up and down, sprint for
   * speed. The camera flies on the movement keys' bindings whatever the context (watching
   * a replay, on-foot actions are off, but the keys still fly).
   */
  flyAxes(): { x: number; y: number; z: number; fast: boolean } {
    const down = (a: Action): boolean => this.map.actions[a].inputs.some((i) => this.down.has(i));
    return {
      x: (down('right') ? 1 : 0) - (down('left') ? 1 : 0),
      y: (down('flyUp') ? 1 : 0) - (down('flyDown') ? 1 : 0),
      z: (down('forward') ? 1 : 0) - (down('back') ? 1 : 0),
      fast: down('sprint'),
    };
  }
}
