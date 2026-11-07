import { Optic, type InputFrame } from '../sim/input';
import type { Command } from '../sim/commands';
import { CommandLatch } from './commandLatch';
import { wrapAngle } from '../sim/core/math';

/**
 * Keyboard and mouse. Mouse look updates the view angles every frame for responsiveness;
 * movement keys and stance toggles are sampled once per simulation tick. Stance keys are
 * latched between ticks so a quick tap is never lost, and clicks are latched against the
 * frame on screen (commandLatch.ts), so a shot goes where the crosshair was.
 */

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyQ', 'KeyE']);

/** A single mouse event further than this is a browser glitch (a jump on locking), not a flick. */
const MAX_MOUSE_STEP = 400;

export class InputController {
  yaw = 0;
  pitch = 0;
  locked = false;
  /** Zoom held by the key (F) or by the right button; either keeps it, so each is tracked. */
  zoomKey = false;
  zoomButton = false;
  /** Radians per pixel; the game scales it while zoomed. */
  sensitivity = 0.0022;
  sensitivityScale = 1;
  /** How far the view can tilt up or down (tuning.bodies.player.pitchLimit, set by the game). */
  pitchLimit = 1.45;
  onAction: ((code: string) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** Clicks waiting for the next tick, each remembering its frame. The game reports frames to it. */
  readonly latch = new CommandLatch();
  private readonly commands: Command[] = [];
  private readonly keys = new Set<string>();
  private crouchLatched = false;
  private proneLatched = false;
  /** Browsers can report one huge jump right after the lock changes: the next event is skipped. */
  private skipMove = false;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {}

  attach(): void {
    const on = <K extends keyof WindowEventMap>(target: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => this.keyDown(e));
    on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyF') this.zoomKey = false;
    });
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
      this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch - my * k));
    });
    on(document, 'mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 2) this.zoomButton = true;
      else if (e.button === 0) this.latch.latch('fire');
    });
    on(document, 'mouseup', (e) => {
      if (e.button === 2) this.zoomButton = false;
    });
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

  /** Called when the browser refuses the pointer lock (a frame without permission, a re-lock right after Esc). */
  onLockRefused: (() => void) | null = null;

  get zoomHeld(): boolean {
    return this.zoomKey || this.zoomButton;
  }

  /** Automation: hold or release the zoom. */
  set zoomHeld(on: boolean) {
    this.zoomKey = on;
    this.zoomButton = false;
  }

  private releaseAll(): void {
    this.keys.clear();
    this.zoomKey = false;
    this.zoomButton = false;
  }

  detach(): void {
    for (const fn of this.cleanup.splice(0)) fn();
  }

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => this.onLockRefused?.());
    } catch {
      // Browsers refuse a re-lock for about a second after Esc; the overlay stays up and says so.
      this.onLockRefused?.();
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Automation: hold exactly these keys (KeyboardEvent.code values), no pointer lock needed. */
  holdKeys(codes: readonly string[]): void {
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) throw new TypeError('hold() takes a list of key codes, such as ["KeyW"]');
    this.keys.clear();
    for (const c of codes) this.keys.add(c);
  }

  /** Automation: request a stance toggle as if C or Z were tapped. */
  tap(code: 'KeyC' | 'KeyZ'): void {
    if (code === 'KeyC') this.crouchLatched = true;
    else if (code === 'KeyZ') this.proneLatched = true;
    else throw new TypeError(`tap() takes 'KeyC' or 'KeyZ', not ${String(code)}`);
  }

  private keyDown(e: KeyboardEvent): void {
    // F3 and the backquote toggle views even while paused.
    if (e.code === 'F3' || e.code === 'Backquote') {
      e.preventDefault();
      if (!e.repeat) this.onAction?.(e.code);
      return;
    }
    if (!this.locked) {
      // A movement key pressed before the lock is still held when play resumes.
      if (MOVE_KEYS.has(e.code) && !e.repeat) this.keys.add(e.code);
      return;
    }
    // While playing, keys are the game's: Tab would move the focus, and browser shortcuts
    // (reload, find, print, save) would take the window away mid-run. Ctrl+Shift stays the
    // browser's, for its developer tools.
    if (MOVE_KEYS.has(e.code) || e.code.startsWith('F') || e.code === 'Tab' || ((e.ctrlKey || e.metaKey) && !e.shiftKey)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyF') this.zoomKey = true; // binoculars, for trackpads without an easy right button
    else if (e.code === 'KeyC') this.crouchLatched = true;
    else if (e.code === 'KeyZ') this.proneLatched = true;
    else if (!MOVE_KEYS.has(e.code)) this.onAction?.(e.code);
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
    const k = this.keys;
    out.moveX = frozen ? 0 : (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    out.moveZ = frozen ? 0 : (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    out.sprint = !frozen && (k.has('ShiftLeft') || k.has('ShiftRight'));
    out.crouch = !frozen && this.crouchLatched;
    out.prone = !frozen && this.proneLatched;
    this.crouchLatched = false;
    this.proneLatched = false;
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.optic = !frozen && this.zoomHeld ? Optic.Binoculars : Optic.None;
    if (frozen) {
      this.latch.clear();
      this.commands.length = 0;
    } else {
      this.latch.drain(startTick, this.commands);
    }
    out.commands = this.commands;
    return out;
  }

  /** Free-flight axes for the detached debug camera. */
  flyAxes(): { x: number; y: number; z: number; fast: boolean } {
    const k = this.keys;
    return {
      x: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      y: (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0),
      z: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      fast: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }
}
