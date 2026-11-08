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
}

/**
 * Walks a list of waypoints in order, taking each one's stance before setting off for it
 * with the same keys a player would press (C and Z toggle). Deterministic, so a scene
 * driven by it records and replays the same run. Stops at the last waypoint.
 */
export class WaypointDriver {
  private next_ = 0;
  private yaw: number | null = null;

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
    while (this.next_ < this.points.length) {
      const w = this.points[this.next_]!;
      if (Math.sqrt((w.x - p.x) * (w.x - p.x) + (w.z - p.z) * (w.z - p.z)) > this.reach) break;
      this.next_++;
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
