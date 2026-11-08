import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Hasher } from '../src/sim/kernel/core/hash';
import { WanderBot } from '../src/sim/game/bots/wander';
import { emptyMind, guardMind } from '../src/sim/game/guards';
import { generateWorld } from '../src/sim/generation/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { intents } from '../src/sim/body';
import { player } from '../src/sim/game/entities';

/**
 * The perception boundary (brain/mind.ts): a guard decides from his mind alone. Run the
 * same valley twice with the player in two places no guard can perceive; wherever the
 * two runs give a guard the same mind, his decisions must match bit for bit. A brain
 * that peeks at the player's true position fails this.
 */

const world = generateWorld(missionSpec('TAL-4471'), T);

/** Per tick, per guard: a hash of his mind and of what he decided. */
type Trace = Array<Map<number, { mind: string; decision: string }>>;

function run(place: { x: number; z: number }, extra: System[] = []): Trace {
  const trace: Trace = [];
  const mind = emptyMind();
  const probe: System = {
    name: 'test-probe',
    phase: 'intent',
    reads: ['guard.body', 'guard.guard', '@intents.guard'],
    writes: [],
    emits: [],
    after: ['guard-routines', ...extra.map((s) => s.name)],
    run(ctx) {
      const tick = new Map<number, { mind: string; decision: string }>();
      for (const g of ctx.index.of('guard')) {
        const m = guardMind(g, ctx.world, ctx.tuning, ctx.tick, mind);
        const h = new Hasher().u32(m.id).f64(m.self.x).f64(m.self.y).f64(m.self.z).f64(m.self.yaw).f64(m.self.pitch).str(m.self.stance).f64(m.self.speed);
        h.u32(ctx.world.camp.guards.indexOf(m.post)).u32(m.tick).f64(m.time).u32(m.percepts.length);
        for (const p of m.percepts) h.str(p.kind).f64(p.x).f64(p.y).f64(p.z).f64(p.strength).u32(p.cause);
        const i = intents(ctx).get(g.id)!;
        const d = new Hasher().f64(i.wishX).f64(i.wishZ).str(i.gait).f64(i.yaw).f64(i.pitch).f64(g.guard.headYaw);
        tick.set(g.id, { mind: h.digest(), decision: d.digest() });
      }
      trace.push(tick);
    },
  };
  // The probe goes last in its phase, after the brains it watches.
  let systems = SYSTEMS;
  for (const s of extra) systems = withSystem(systems, s);
  systems = withSystem(systems, probe);
  const sim = new Simulation(world, T, systems);
  placePlayer(sim, place.x, place.z);
  const bot = new WanderBot('TAL-4471');
  const raw = neutralInput();
  for (let i = 0; i < 1200; i++) sim.step(bot.next(sim, raw));
  return trace;
}

/** Ticks at which a guard with the same mind in both runs decided differently. */
function leaks(a: Trace, b: Trace): string[] {
  const out: string[] = [];
  a.forEach((tick, k) => {
    for (const [id, x] of tick) {
      const y = b[k]!.get(id)!;
      if (x.mind === y.mind && x.decision !== y.decision) out.push(`guard ${id} at tick ${k + 1}`);
    }
  });
  return out;
}

/** How many guard-ticks saw the same mind in both runs. */
function sameMinds(a: Trace, b: Trace): number {
  let n = 0;
  a.forEach((tick, k) => {
    for (const [id, x] of tick) if (b[k]!.get(id)!.mind === x.mind) n++;
  });
  return n;
}

// Two places far from the camp and from each other (well beyond any guard's senses, once they have them).
const here = { x: world.spawn.x, z: world.spawn.z };
const there = { x: -world.spawn.x * 0.9, z: -world.spawn.z * 0.9 };

describe('the perception boundary', () => {
  it('gives guards the same decisions wherever the unseen player is', () => {
    const a = run(here);
    const b = run(there);
    expect(Math.hypot(here.x - there.x, here.z - there.z)).toBeGreaterThan(300);
    expect(leaks(a, b)).toEqual([]);
    // Nothing reached them: every guard had the same mind on every tick.
    expect(sameMinds(a, b)).toBe(1200 * world.camp.guards.length);
  });

  it('catches a brain that peeks at the player', () => {
    // A leaky brain, outside the boundary: the first guard turns his head toward the player's true position.
    const peek: System = {
      name: 'test-peek',
      phase: 'intent',
      reads: ['player.body', 'guard.body'],
      writes: ['guard.guard.headYaw'],
      emits: [],
      after: ['player-intent', 'guard-routines'],
      run(ctx) {
        const g = ctx.index.of('guard')[0]!;
        const p = player(ctx.index).body;
        g.guard.headYaw = Math.atan2(-(p.x - g.body.x), -(p.z - g.body.z)) - g.body.yaw;
      },
    };
    const a = run(here, [peek]);
    const b = run(there, [peek]);
    expect(leaks(a, b).length).toBeGreaterThan(1000);
  });
});
