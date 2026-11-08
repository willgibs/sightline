import { MAX_LAG, type Command } from '../sim/kernel/commands';

/**
 * Turns clicks into commands that remember what was on screen.
 *
 * The renderer draws between the last two simulation states, at fraction α, so the screen
 * runs a little behind the newest state. A click is about the frame the player was
 * looking at: its α, the tick it was drawn after, and its view angles (mouse look runs
 * at frame rate). When the next tick samples input, each latched action becomes a
 * command whose lag says how far before that tick's start state the frame was: 1 − α,
 * plus a tick for every tick that ran in between, at most MAX_LAG.
 *
 * No DOM here, so tests can drive it exactly like the game does.
 */

/** The frame on screen: set by the game after every render. */
export interface FrameShown {
  /** The newest simulation tick when the frame was drawn. */
  tick: number;
  /** How far between the previous tick and that one the frame was drawn, in [0, 1). */
  alpha: number;
  yaw: number;
  pitch: number;
}

interface Latched {
  /** The timed commands: firing, ranging and throwing all happen along the frame's line of sight. */
  kind: 'fire' | 'range' | 'throw';
  frame: FrameShown;
}

export class CommandLatch {
  /** The frame currently on screen. */
  readonly shown: FrameShown = { tick: 0, alpha: 0, yaw: 0, pitch: 0 };
  private readonly pending: Latched[] = [];

  /** Records the frame just drawn. */
  frameShown(tick: number, alpha: number, yaw: number, pitch: number): void {
    this.shown.tick = tick;
    this.shown.alpha = alpha;
    this.shown.yaw = yaw;
    this.shown.pitch = pitch;
  }

  /** An action happened now, about the frame on screen. */
  latch(kind: Latched['kind']): void {
    this.pending.push({ kind, frame: { ...this.shown } });
  }

  /** Moves latched actions into a tick's commands. `startTick` is the simulation's tick before it steps. */
  drain(startTick: number, out: Command[]): Command[] {
    out.length = 0;
    for (const p of this.pending) {
      const lag = Math.min(MAX_LAG, Math.max(0, startTick - p.frame.tick + 1 - p.frame.alpha));
      out.push({ kind: p.kind, lag, yaw: p.frame.yaw, pitch: p.frame.pitch });
    }
    this.pending.length = 0;
    return out;
  }

  clear(): void {
    this.pending.length = 0;
  }
}
