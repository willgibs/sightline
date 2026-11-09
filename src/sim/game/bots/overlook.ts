import { bodyShape, eyeOf } from '../../body';
import type { InputFrame } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import { Blocks } from '../../kernel/world/colliders';
import { emptyHit, raycast, type Hit } from '../../kernel/world/query';
import { emptyShape, type BodyShape } from '../../kernel/world/shape';
import type { Simulation } from '../sim';
import { MarksmanDriver, type Step } from './marksman';

/**
 * A perfect shooter who never leaves his perch (E12): the hardest test of "one overlook
 * doesn't clear the camp". He sees what the simulation sees, takes whoever is in a clear
 * line the moment the bolt allows, those who could end it for him first, and never misses
 * for want of skill. The target comes last: the point is whether one place can take
 * everyone.
 */
const ORDER: Readonly<Record<string, number>> = { marksman: 0, worker: 1, officer: 2, 'radio-operator': 3, patrol: 4, sentry: 5, target: 6 };

/** Whether the line from the player's eye to a guard's head is clear this tick, as a bullet would find it. */
function clearLine(sim: Simulation, g: Simulation['guards'][number], shape: BodyShape, hit: Hit): boolean {
  eyeOf(sim.player, sim.tuning.bodies.player, eye);
  bodyShape(g.body, sim.tuning.bodies.guard, shape);
  const dx = shape.head.x - eye.x;
  const dy = shape.head.y - eye.y;
  const dz = shape.head.z - eye.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  raycast({ world: sim.world, solids: sim.solids, bodies: sim.queryBodies() }, eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, d + 1, Blocks.Bullet, hit, sim.playerId);
  return hit.what === 'body' && hit.id === g.id;
}

const eye = { x: 0, y: 0, z: 0 };

export class OverlookShooter implements Driver<Simulation> {
  private readonly steps: Step[] = [
    { at: 0.2, act: 'prone' },
    { at: 1.5, act: 'scope' },
  ];
  private readonly marksman = new MarksmanDriver(this.steps);
  private readonly shape = emptyShape();
  private readonly hit = emptyHit();
  private next_: number;

  /**
   * `pace`: seconds between his shots. A person needs several to range, hold and press; the bolt alone allows about 1.5.
   * `firstAt`: when he may first fire, seconds into the run.
   */
  constructor(
    private readonly pace: number,
    firstAt = 3,
  ) {
    this.next_ = firstAt;
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const now = sim.tick / sim.tuning.sim.tickHz;
    if (now >= this.next_ && this.marksman.idle) {
      const post = this.pick(sim);
      if (post >= 0) {
        this.steps.push({ at: now, act: 'fire', target: { post }, breath: 0.5 });
        this.next_ = now + this.pace;
      }
    }
    return this.marksman.next(sim, out);
  }

  /** The camp post of the guard to take next, or −1 if nobody is in a clear line. */
  private pick(sim: Simulation): number {
    const p = sim.player;
    let best = -1;
    let bestRank = Infinity;
    for (const g of sim.guards) {
      if (!clearLine(sim, g, this.shape, this.hit)) continue;
      const role = sim.world.camp.guards[g.guard.spawn]?.role ?? 'sentry';
      const rank = (ORDER[role] ?? 5) * 10000 + Math.sqrt((g.body.x - p.x) * (g.body.x - p.x) + (g.body.z - p.z) * (g.body.z - p.z));
      if (rank < bestRank) {
        bestRank = rank;
        best = g.guard.spawn;
      }
    }
    return best;
  }
}

/**
 * The shooter who times it (E12): waits on his perch, and fires once, the first moment the
 * line to the target's head is clear and the camp's analysis says nobody is watching him.
 * The analysis works on 1 m cells and a thin wall can stand in its way; he looks. If a
 * shot misses he tries again, while he can see him.
 */
export class TimedShooter implements Driver<Simulation> {
  private readonly steps: Step[] = [
    { at: 0.2, act: 'prone' },
    { at: 1.5, act: 'scope' },
  ];
  private readonly marksman = new MarksmanDriver(this.steps);
  private readonly shape = emptyShape();
  private readonly hit = emptyHit();
  private shots = 0;
  private next_ = 8;

  constructor(
    private readonly post: number,
    private readonly unwatched: readonly boolean[],
    private readonly dt: number,
  ) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    const now = sim.tick / sim.tuning.sim.tickHz;
    if (this.shots < 3 && now >= this.next_ && this.marksman.idle) {
      const sample = Math.floor(now / this.dt) % this.unwatched.length;
      const g = sim.guards.find((e) => e.guard.spawn === this.post);
      // The first shot waits for an unwatched moment. After that the camp is awake, and it's now or never.
      if ((this.unwatched[sample] || this.shots > 0) && g && clearLine(sim, g, this.shape, this.hit)) {
        this.shots++;
        this.next_ = now + 3;
        this.steps.push({ at: now, act: 'fire', target: { post: this.post }, breath: 0.5 });
      }
    }
    return this.marksman.next(sim, out);
  }
}
