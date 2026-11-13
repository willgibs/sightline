import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { guardFire } from '../src/sim/game/combat';
import { commanderOf, giveCommander } from '../src/sim/game/comms';
import { Simulation } from '../src/sim/game/sim';
import { parseSwitches } from '../src/sim/game/switches';
import { SYSTEMS } from '../src/sim/game/systems';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testGuard, testWorld } from './fixtures';

/**
 * Looking out for his own (game/combat.ts, `ownInTheWay`): a man holds his fire for one of
 * the camp's own anywhere his round could go. A round goes anywhere inside its error
 * radius, so that's the cone he keeps clear, out to what he's shooting at, of every man a
 * round could reach, where that man stands and where he'd be on his feet.
 *
 * A flat world, a man with a rifle at the origin, and something to shoot at 40 m east of
 * him at the height of his eye.
 */

const G = T.bodies.guard;
const RANGE = 40;

interface Mate {
  x: number;
  z: number;
  crouched?: boolean;
}

function fire(mate: Mate, opts: { mates?: boolean; role?: 'sentry' | 'marksman'; walls?: ColliderInput[] } = {}): { events: SimEvent[]; mate: number } {
  const post = { y: 0, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };
  const world = testWorld({
    size: 160,
    spawn: { x: -70, z: 70 },
    colliders: opts.walls ?? [],
    camp: { structures: [], guards: [testGuard({ id: 0, role: opts.role ?? 'sentry', x: 0, z: 0, ...post }), testGuard({ id: 1, role: 'sentry', x: mate.x, z: mate.z, ...post })], fenceHalf: 0 },
  });
  const shoot: System = {
    name: 'test-fire',
    phase: 'commands',
    // After everything else that makes or moves anything this early in a tick.
    after: SYSTEMS.filter((s) => s.phase === 'commands').map((s) => s.name),
    reads: [],
    writes: ['entities', 'rng.aim', 'bullet.bullet'],
    emits: ['shot', 'report', 'held'],
    run: (ctx) => {
      if (ctx.tick !== 1) return;
      const g = ctx.index.of('guard')[0]!;
      guardFire(ctx, g, { x: RANGE, y: g.body.y + g.body.eyeHeight, z: 0 });
    },
  };
  const sim = new Simulation(world, T, withSystem(SYSTEMS, shoot));
  giveCommander(sim);
  const camp = commanderOf(sim)!.camp;
  camp.fights = true;
  if (opts.mates !== false) camp.mates = true;
  const other = sim.guards[1]!;
  if (mate.crouched) {
    other.body.stance = 'crouch';
    other.body.eyeHeight = G.eyeHeight.crouch;
  }
  const events: SimEvent[] = [];
  for (let i = 0; i < 3; i++) events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
  return { events, mate: other.id };
}

const fired = (events: SimEvent[]): boolean => events.some((e) => e.type === 'shot');
const held = (events: SimEvent[]): Extract<SimEvent, { type: 'held' }> | undefined => events.find((e): e is Extract<SimEvent, { type: 'held' }> => e.type === 'held');

/** A wall taller than a man, across the way east at `x`, from `z0` to `z1`. */
function wall(x: number, z0: number, z1: number): ColliderInput {
  return { kind: 'box', x, z: (z0 + z1) / 2, y0: -0.3, y1: 2.4, hx: 0.15, hz: (z1 - z0) / 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
}

describe('a man holds his fire for one of his own where his round could go', () => {
  it('fires with nobody in the way', () => {
    const { events } = fire({ x: 20, z: 6 });
    expect(fired(events)).toBe(true);
    expect(held(events)).toBeUndefined();
  });

  it('holds for a man standing beside his line, and says who and how far', () => {
    const { events, mate } = fire({ x: 20, z: 0.6 });
    expect(fired(events)).toBe(false);
    const h = held(events)!;
    expect(h.mate).toBe(mate);
    expect(h.distance).toBeGreaterThan(19);
    expect(h.distance).toBeLessThan(21);
  });

  it('as every camp once did, fires past that man: he was never on the line itself', () => {
    const { events } = fire({ x: 20, z: 0.6 }, { mates: false });
    expect(fired(events)).toBe(true);
    expect(held(events)).toBeUndefined();
  });

  it('holds wider the farther off the man is, as the round goes wider', () => {
    // Its error radius is 1.1°: 0.19 m at 10 m, 0.67 m at 35 m. A man 1.1 m to the side is clear at the first and not at the second.
    expect(fired(fire({ x: 10, z: 1.1 }).events)).toBe(true);
    expect(fired(fire({ x: 35, z: 1.1 }).events)).toBe(false);
  });

  it('holds for a man crouched under his line', () => {
    expect(fired(fire({ x: 20, z: 0, crouched: true }).events)).toBe(false);
  });

  it('holds for a man down under a steadier rifle’s line, who would be in it on his feet', () => {
    // A marksman's round goes 0.3° wide: 0.1 m at 20 m. The line passes 0.6 m over a crouched man's head, which is clear of
    // that and the margin, and through where his head is when he stands. In a fight he's about to.
    const crouched = fire({ x: 20, z: 0, crouched: true }, { role: 'marksman' });
    expect(fired(crouched.events)).toBe(false);
    expect(held(crouched.events)!.mate).toBe(crouched.mate);
  });

  it('fires past a man behind a wall, who is nobody a round could reach', () => {
    // The wall's end is a hand's breadth from the line, and the man behind it is wholly in its shadow.
    const { events } = fire({ x: 20, z: 0.8 }, { walls: [wall(15, 0.1, 3)] });
    expect(fired(events)).toBe(true);
  });

  it('holds for a man with a shoulder showing past the end of that wall', () => {
    const { events } = fire({ x: 20, z: 0.8 }, { walls: [wall(15, 0.55, 3)] });
    expect(fired(events)).toBe(false);
  });

  it('fires with a man past what he is shooting at, and with one at his shoulder', () => {
    expect(fired(fire({ x: RANGE + 6, z: 0 }).events)).toBe(true);
    expect(fired(fire({ x: 0.2, z: 0.7 }).events)).toBe(true);
  });
});

describe('a camp that looks out for its own', () => {
  it('is every live camp, and `off=mates` is one that doesn’t', () => {
    const on = liveCamp('seed=LEB-2534') as Scene<Simulation>;
    const world = on.world(T);
    expect(commanderOf(startScene(on, T, world))!.camp.mates).toBe(true);
    expect(commanderOf(startScene(liveCamp('seed=LEB-2534&off=mates') as Scene<Simulation>, T, world))!.camp.mates).toBeUndefined();
    // A camp that doesn't fight has nobody firing past anyone.
    expect(commanderOf(startScene(liveCamp('seed=LEB-2534&off=fight') as Scene<Simulation>, T, world))!.camp.mates).toBeUndefined();
    expect(parseSwitches('mates')).toEqual(['mates']);
  }, 120_000);
});
