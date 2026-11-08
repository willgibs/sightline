import { datan2, dtanDeg } from '../../kernel/core/detmath';
import { wrapAngle } from '../../kernel/core/math';
import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import type { Simulation } from '../sim';
import { Blocks } from '../../kernel/world/colliders';

/**
 * An adversarial player for invariant runs. Where the wander bot plays like a person,
 * this one plays like a fuzzer: it spams stance toggles, jitters and reverses, sprints
 * in bursts, pushes into walls and corners, crawls for long stretches, and seeks out
 * ground too steep to stand on and tries to climb it at every angle. It only produces
 * input, so everything it does a player could do.
 */

type Behaviour = 'toggles' | 'jitter' | 'reverse' | 'sprint' | 'wall' | 'crawl' | 'steep' | 'wander' | 'leanWall' | 'mantle' | 'proneTurn' | 'rungs';
const BEHAVIOURS: readonly Behaviour[] = ['toggles', 'jitter', 'reverse', 'sprint', 'wall', 'crawl', 'steep', 'wander', 'leanWall', 'mantle', 'proneTurn', 'rungs'];

export class ChaosBot {
  private readonly rng: Rng;
  private behaviour: Behaviour = 'wander';
  private left = 0;
  private yaw: number | null = null;
  private target: { x: number; z: number } | null = null;
  private phase = 0;
  private readonly ids: number[] = [];
  /** Ticks spent in each behaviour, for reporting. */
  readonly ticks: Record<Behaviour, number> = { toggles: 0, jitter: 0, reverse: 0, sprint: 0, wall: 0, crawl: 0, steep: 0, wander: 0, leanWall: 0, mantle: 0, proneTurn: 0, rungs: 0 };

  constructor(seed: string, label = 'chaos') {
    this.rng = new Rng(seed, `bot/${label}`);
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const p = sim.player;
    let yaw = this.yaw ?? p.yaw;
    if (--this.left <= 0) this.pick(sim);
    this.ticks[this.behaviour]++;
    this.phase++;
    out.moveX = 0;
    out.moveZ = 0;
    out.sprint = false;
    out.crouch = false;
    out.prone = false;
    out.pitch = 0;
    out.lean = 0;
    out.optic = 0;
    out.commands = [];

    switch (this.behaviour) {
      case 'toggles':
        out.moveZ = this.rng.chance(0.7) ? 1 : 0;
        out.sprint = this.rng.chance(0.5);
        out.crouch = this.rng.chance(0.15);
        out.prone = !out.crouch && this.rng.chance(0.1);
        yaw += this.rng.range(-0.2, 0.2);
        break;
      case 'jitter':
        out.moveX = this.rng.range(-1, 1);
        out.moveZ = this.rng.range(-1, 1);
        out.sprint = this.rng.chance(0.3);
        yaw += this.rng.range(-0.6, 0.6);
        break;
      case 'reverse':
        out.moveZ = this.phase % 10 < 5 ? 1 : -1;
        out.moveX = this.phase % 14 < 7 ? 0.6 : -0.6;
        out.sprint = true;
        break;
      case 'sprint':
        out.moveZ = 1;
        out.sprint = this.phase % 40 < 30;
        yaw += this.rng.range(-0.05, 0.05);
        break;
      case 'wall':
      case 'steep':
      case 'wander': {
        const t = this.target ?? { x: p.x, z: p.z };
        const want = datan2(-(t.x - p.x), -(t.z - p.z));
        // Steep: approach at a shallow, drifting angle to the slope; others: straight in.
        const offset = this.behaviour === 'steep' ? (this.phase % 120 < 60 ? 1 : -1) * this.rng.range(0.6, 1.4) : 0;
        yaw = want + offset;
        out.moveZ = 1;
        out.sprint = this.behaviour !== 'wander' && this.rng.chance(0.6);
        if (this.behaviour === 'wall') out.moveX = this.phase % 60 < 30 ? 0.5 : -0.5;
        break;
      }
      case 'crawl':
        if (p.stance !== 'prone' && this.phase % 30 === 1) out.prone = true;
        out.moveZ = 1;
        yaw += this.rng.range(-0.08, 0.08);
        break;
      case 'leanWall': {
        // Up against something solid, leaning hard into it, the weapon up half the time.
        const t = this.target ?? { x: p.x, z: p.z };
        yaw = datan2(-(t.x - p.x), -(t.z - p.z)) + (this.phase % 90 < 45 ? 0.3 : -0.3);
        out.moveZ = 1;
        out.moveX = this.phase % 70 < 35 ? 0.4 : -0.4;
        out.lean = this.phase % 25 < 12 ? 1 : -1;
        out.optic = this.phase % 110 < 55 ? 2 : 0;
        break;
      }
      case 'mantle': {
        // At the nearest wall, pressing climb again and again, into whoever walks there.
        const t = this.target ?? { x: p.x, z: p.z };
        yaw = datan2(-(t.x - p.x), -(t.z - p.z));
        out.moveZ = 1;
        if (this.phase % 10 === 0) out.commands = [{ kind: 'climb' }];
        break;
      }
      case 'proneTurn': {
        // Prone, crawling at a wall, the body swung about as fast as a mouse can whip it.
        if (p.stance !== 'prone' && this.phase % 30 === 1) out.prone = true;
        const t = this.target ?? { x: p.x, z: p.z };
        out.moveZ = this.phase % 80 < 40 ? 1 : -0.6;
        out.moveX = this.phase % 50 < 25 ? 0.5 : -0.5;
        yaw = datan2(-(t.x - p.x), -(t.z - p.z)) + this.rng.range(-1.6, 1.6);
        break;
      }
      case 'rungs': {
        // At a ladder if there is one: on, up, down, letting go, over and over.
        const t = this.ladderTarget(sim) ?? this.target ?? { x: p.x, z: p.z };
        yaw = datan2(-(t.x - p.x), -(t.z - p.z));
        out.moveZ = this.phase % 90 < 60 ? 1 : -1;
        if (this.phase % 40 === 0) out.commands = [{ kind: 'climb' }];
        break;
      }
    }
    this.yaw = wrapAngle(yaw);
    out.yaw = this.yaw;
    return out;
  }

  private pick(sim: Simulation): void {
    this.behaviour = this.rng.pick(BEHAVIOURS);
    this.left = Math.round(this.rng.range(2, 10) / sim.dt);
    this.phase = 0;
    const p = sim.player;
    this.target = null;
    if (this.behaviour === 'wall' || this.behaviour === 'leanWall' || this.behaviour === 'mantle' || this.behaviour === 'proneTurn') this.target = this.nearestCollider(sim);
    if (this.behaviour === 'steep') this.target = this.nearestSteep(sim);
    if (this.behaviour === 'wander' || !this.target) {
      const d = this.rng.unit2();
      const r = this.rng.range(10, 60);
      const half = sim.world.playHalf - 5;
      this.target = { x: Math.max(-half, Math.min(half, p.x + d.x * r)), z: Math.max(-half, Math.min(half, p.z + d.z * r)) };
    }
  }

  /** The foot of the world's nearest ladder, if it has one. */
  private ladderTarget(sim: Simulation): { x: number; z: number } | null {
    const ladders = sim.world.ladders;
    if (!ladders || ladders.length === 0) return null;
    const p = sim.player;
    let best = ladders[0]!;
    let bestD = Infinity;
    for (const l of ladders) {
      const d = (l.x - p.x) * (l.x - p.x) + (l.z - p.z) * (l.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return { x: best.x, z: best.z };
  }

  private nearestCollider(sim: Simulation): { x: number; z: number } | null {
    const p = sim.player;
    const w = sim.world;
    w.colliders.query(p.x - 25, p.z - 25, p.x + 25, p.z + 25, this.ids);
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const id of this.ids) {
      const c = w.colliders.list[id]!;
      if ((c.flags & Blocks.Move) === 0 || c.y1 - c.y0 < 0.6) continue;
      const d = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = { x: c.x, z: c.z };
      }
    }
    return best;
  }

  /** Ground too steep to stand on in this world, found once: every tenth such cell. */
  private steepCells: Array<{ x: number; z: number }> | null = null;

  /** The nearest ground too steep to stand on, within 400 m. */
  private nearestSteep(sim: Simulation): { x: number; z: number } | null {
    if (!this.steepCells) {
      this.steepCells = [];
      const hf = sim.world.terrain;
      const tanMax = dtanDeg(sim.tuning.bodies.player.maxSlopeDeg);
      let k = 0;
      for (let j = 0; j < hf.cells; j++) {
        for (let i = 0; i < hf.cells; i++) {
          const h = hf.heights;
          const a = h[hf.index(i, j)]!;
          const gx = (h[hf.index(i + 1, j)]! - a) / hf.cell;
          const gz = (h[hf.index(i, j + 1)]! - a) / hf.cell;
          const x = hf.coord(i) + hf.cell / 2;
          const z = hf.coord(j) + hf.cell / 2;
          if (gx * gx + gz * gz > tanMax * tanMax && Math.abs(x) < sim.world.playHalf && Math.abs(z) < sim.world.playHalf && k++ % 10 === 0) {
            this.steepCells.push({ x, z });
          }
        }
      }
    }
    const p = sim.player;
    let best: { x: number; z: number } | null = null;
    let bestD = 400 * 400;
    for (const c of this.steepCells) {
      const d = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}
