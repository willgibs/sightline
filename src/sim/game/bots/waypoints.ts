import { datan2 } from '../../kernel/core/detmath';
import { turnTowards } from '../../kernel/core/math';
import type { InputFrame } from '../../kernel/input';
import type { Stance } from '../../body';
import type { Simulation } from '../sim';

/** A point to walk to, and the stance to take before setting off for it. */
export interface Waypoint {
  x: number;
  z: number;
  stance: Stance;
  sprint?: boolean;
  /** On reaching it, face the next waypoint and mantle what's between (lab C). */
  climb?: boolean;
}

/**
 * Walks a list of waypoints in order, taking each one's stance before setting off for it
 * with the same keys a player would press (C and Z toggle). Deterministic, so a scene
 * driven by it records and replays the same run. Stops at the last waypoint.
 */
export class WaypointDriver {
  private next_ = 0;
  private yaw: number | null = null;
  /** Mantling at the current waypoint: whether climb has been pressed, and whether the mantle has begun. */
  private pressed = false;
  private began = false;

  constructor(
    private readonly points: readonly Waypoint[],
    /** How close counts as there. */
    private readonly reach = 0.5,
  ) {}

  /** Index of the waypoint being walked to; points.length once finished. */
  get index(): number {
    return this.next_;
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const p = sim.player;
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.pitch = 0;
    if (this.yaw === null) this.yaw = p.yaw;
    out.commands = [];
    if (p.motor === 'mantle') {
      this.began = true;
      out.yaw = this.yaw;
      return out;
    }
    while (this.next_ < this.points.length) {
      const w = this.points[this.next_]!;
      if (w.climb && this.began) {
        // The mantle has been and gone.
        this.pressed = false;
        this.began = false;
        this.next_++;
        continue;
      }
      // A mantle starts from close by: this far from where it should start.
      const near = w.climb ? Math.min(this.reach, 0.25) : this.reach;
      if (Math.sqrt((w.x - p.x) * (w.x - p.x) + (w.z - p.z) * (w.z - p.z)) > near) break;
      if (!w.climb || this.next_ + 1 >= this.points.length) {
        this.next_++;
        continue;
      }
      // Face the next waypoint, press climb, and wait until the mantle has been and gone.
      const to = this.points[this.next_ + 1]!;
      const face = datan2(-(to.x - p.x), -(to.z - p.z));
      this.yaw = turnTowards(this.yaw, face, 4 * sim.dt);
      out.yaw = this.yaw;
      // Pressed, and pressed again every half second until the mantle begins.
      if (!this.began && (this.pressed === false || sim.tick % 15 === 0) && Math.abs(this.yaw - face) < 1e-3) {
        out.commands = [{ kind: 'climb' }];
        this.pressed = true;
      }
      return out;
    }
    const w = this.points[this.next_];
    out.yaw = this.yaw;
    if (!w) return out;
    // The stance first: one key per change, waiting for each change to finish.
    if (p.stance !== w.stance) {
      if (p.stanceTimer <= 0) {
        if (w.stance === 'prone') out.prone = true;
        else if (p.stance === 'prone' || w.stance === 'crouch' || p.stance === 'crouch') out.crouch = true;
      }
      return out;
    }
    if (p.stanceTimer > 0) return out;
    const want = datan2(-(w.x - p.x), -(w.z - p.z));
    this.yaw = turnTowards(this.yaw, want, 4 * sim.dt);
    out.yaw = this.yaw;
    out.moveZ = 1;
    out.sprint = w.sprint === true;
    return out;
  }
}
