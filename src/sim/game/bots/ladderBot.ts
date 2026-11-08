import { datan2 } from '../../kernel/core/detmath';
import { Rng } from '../../kernel/core/rng';
import type { Command } from '../../kernel/commands';
import type { InputFrame } from '../../kernel/input';
import { Optic } from '../../kernel/input';
import { ladderLine } from '../../body';
import type { Simulation } from '../sim';

/**
 * Goes up and down the world's first ladder and makes trouble on it (the movement lab's
 * fuzzing, C5): to its foot or onto its top and press, up and down the rungs at random,
 * letting go, pressing climb early and often, crouching, lying down, leaning, and picking
 * up what lies about. The chaos bot rarely finds a ladder, and a valley has none.
 * Deterministic: everything it does comes from its seed and what it sees.
 */
export class LadderBot {
  private readonly rng: Rng;
  private goal: 'foot' | 'deck' = 'foot';
  private axis = 1;
  private axisLeft = 0;
  private drift = 0;
  private tick = 0;

  constructor(seed: string) {
    this.rng = new Rng(seed, 'ladder-bot');
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const r = this.rng;
    const b = sim.player;
    const ladder = sim.world.ladders![0]!;
    const line = ladderLine(ladder, sim.tuning.bodies.player, { x: 0, z: 0 });
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.pitch = 0;
    out.lean = 0;
    out.optic = Optic.None;
    out.yaw = b.yaw;
    const commands: Command[] = [];
    out.commands = commands;
    if (this.tick++ % 300 === 0) this.goal = r.chance(0.5) ? 'foot' : 'deck';
    if (--this.axisLeft <= 0) {
      this.axis = r.pick([1, 1, 1, -1, -1, 0]);
      this.axisLeft = r.int(10, 90);
      this.drift = r.range(-0.6, 0.6);
    }
    if (b.motor === 'ladder') {
      // Meaning to reach the deck it mostly keeps climbing, so it gets over the top; else up and down at random.
      out.moveZ = this.goal === 'deck' && r.chance(0.9) ? 1 : this.axis;
      out.yaw = b.yaw + this.drift * 0.05;
      if (r.chance(0.004)) commands.push({ kind: 'climb' });
      return out;
    }
    if (b.motor === 'mantle') {
      out.moveZ = r.chance(0.5) ? 1 : 0;
      out.yaw = b.yaw + this.drift * 0.1;
      return out;
    }
    if (b.motor !== 'ground') return out;
    const dx = line.x - b.x;
    const dz = line.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const onDeck = Math.abs(b.y - ladder.y1) < 0.7;
    const towards = datan2(-dx, -dz) + this.drift * 0.3;
    if (onDeck && this.goal === 'deck') {
      // Wandering the deck.
      out.yaw = b.yaw + this.drift * 0.2;
      out.moveZ = this.axis;
      out.moveX = r.range(-1, 1);
    } else {
      out.yaw = towards;
      out.moveZ = d > (onDeck ? 1.2 : 0.5) ? 1 : 0;
      if (r.chance(0.05)) commands.push({ kind: 'climb' });
    }
    if (r.chance(0.03)) commands.push({ kind: 'use' });
    if (r.chance(0.01)) out.crouch = true;
    if (r.chance(0.003)) out.prone = true;
    if (r.chance(0.3)) out.lean = r.pick([-1, 1]);
    if (r.chance(0.1)) out.optic = Optic.Scope;
    return out;
  }
}
