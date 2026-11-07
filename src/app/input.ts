import { Optic, type InputFrame } from '../sim/input';
import type { Command } from '../sim/commands';
import { CommandLatch } from './commandLatch';

/**
 * Keyboard and mouse. Mouse look updates the view angles every frame for responsiveness;
 * movement keys and stance toggles are sampled once per simulation tick. Stance keys are
 * latched between ticks so a quick tap is never lost, and clicks are latched against the
 * frame on screen (commandLatch.ts), so a shot goes where the crosshair was.
 */

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyQ', 'KeyE']);

export class InputController {
  yaw = 0;
  pitch = 0;
  locked = false;
  zoomHeld = false;
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
      if (e.code === 'KeyF') this.zoomHeld = false;
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.zoomHeld = false;
    });
    on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      const k = this.sensitivity * this.sensitivityScale;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.pitch - e.movementY * k));
    });
    on(document, 'mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 2) this.zoomHeld = true;
      else if (e.button === 0) this.latch.latch('fire');
    });
    on(document, 'mouseup', (e) => {
      if (e.button === 2) this.zoomHeld = false;
    });
    on(document, 'contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    const lockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.zoomHeld = false;
      }
      this.onLockChange?.(this.locked);
    };
    document.addEventListener('pointerlockchange', lockChange);
    this.cleanup.push(() => document.removeEventListener('pointerlockchange', lockChange));
  }

  detach(): void {
    for (const fn of this.cleanup.splice(0)) fn();
  }

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      // Browsers refuse a re-lock for about a second after Esc; the overlay stays up.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Automation: hold exactly these keys (KeyboardEvent.code values), no pointer lock needed. */
  holdKeys(codes: string[]): void {
    this.keys.clear();
    for (const c of codes) this.keys.add(c);
  }

  /** Automation: request a stance toggle as if C or Z were tapped. */
  tap(code: 'KeyC' | 'KeyZ'): void {
    if (code === 'KeyC') this.crouchLatched = true;
    else this.proneLatched = true;
  }

  private keyDown(e: KeyboardEvent): void {
    // F3 and the backquote toggle views even while paused.
    if (e.code === 'F3' || e.code === 'Backquote') {
      e.preventDefault();
      if (!e.repeat) this.onAction?.(e.code);
      return;
    }
    if (!this.locked) return;
    if (MOVE_KEYS.has(e.code) || e.code.startsWith('F')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyF') this.zoomHeld = true; // binoculars, for trackpads without an easy right button
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
