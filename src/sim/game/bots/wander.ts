import { TWO_PI, datan2 } from '../../kernel/core/detmath';
import { turnTowards } from '../../kernel/core/math';
import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import type { Simulation } from '../sim';

/**
 * A scripted player for headless runs: walks to random points (mostly around the
 * camp), changes stance now and then, sprints sometimes, and gives up on targets it
 * can't reach. It exercises movement, slopes, collision and the recorder; it is not
 * trying to be good at the game.
 */
export class WanderBot {
  private readonly rng: Rng;
  private target: { x: number; z: number } | null = null;
  private yaw: number | null = null;
  private checkTimer = 0;
  private lastDist = Infinity;
  private stalls = 0;
  private stanceTimer = 0;
  private sprinting = false;
  /** Targets reached and abandoned, for reporting. */
  reached = 0;
  abandoned = 0;

  constructor(seed: string, label = 'wander') {
    this.rng = new Rng(seed, `bot/${label}`);
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const p = sim.player;
    const dt = sim.dt;
    const half = sim.world.playHalf;
    if (this.yaw === null) this.yaw = p.yaw;

    if (!this.target) this.pickTarget(half);
    const t = this.target!;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3) {
      this.reached++;
      this.pickTarget(half);
    }

    // Every two seconds, check we're getting closer; give up after three stalls.
    this.checkTimer += dt;
    if (this.checkTimer >= 2) {
      this.checkTimer = 0;
      if (this.lastDist - dist < 0.5) this.stalls++;
      else this.stalls = 0;
      this.lastDist = dist;
      if (this.stalls >= 3) {
        this.abandoned++;
        this.pickTarget(half);
      }
    }

    out.crouch = false;
    out.prone = false;
    this.stanceTimer -= dt;
    if (this.stanceTimer <= 0) {
      this.stanceTimer = this.rng.range(5, 22);
      const roll = this.rng.next();
      if (p.stance === 'prone') out.prone = roll < 0.6; // back up to crouch most of the time
      else if (roll < 0.15) out.prone = true;
      else if (roll < 0.45) out.crouch = true;
      this.sprinting = this.rng.chance(0.25);
    }

    const want = datan2(-dx, -dz);
    this.yaw = turnTowards(this.yaw, want, 2.5 * dt);
    const err = Math.abs(want - this.yaw);
    out.moveX = 0;
    out.moveZ = err < 0.5 || err > TWO_PI - 0.5 ? 1 : 0.25;
    out.sprint = this.sprinting && p.stance !== 'prone';
    out.yaw = this.yaw;
    out.pitch = 0;
    return out;
  }

  private pickTarget(half: number): void {
    this.checkTimer = 0;
    this.lastDist = Infinity;
    this.stalls = 0;
    if (this.rng.chance(0.6)) {
      const d = this.rng.unit2();
      const r = this.rng.range(60, 260);
      this.target = { x: d.x * r, z: d.z * r };
    } else {
      this.target = { x: this.rng.range(-half + 20, half - 20), z: this.rng.range(-half + 20, half - 20) };
    }
  }
}
