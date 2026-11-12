import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { InvariantWatch, climbPrompt, createBody, ladderLine, ladderLinks, ladderTop, laddersOf, stepMotor, type Cylinder, type Ladder, type MotorContext, type MoveIntent } from '../src/sim/body';
import { buildRoutine, buildWorld, campMission, generateWorld, type GuardSpawn, type Routine } from '../src/sim/generation';
import { TOWER_FINDS, ladderTower } from '../src/sim/game/scenes/ladderTower';
import { placePlayer } from '../src/sim/game/setup';
import { Rng } from '../src/sim/kernel/core/rng';
import { runScene } from '../src/sim/kernel/scene';
import { Solids } from '../src/sim/kernel/world/solids';
import { Simulation } from '../src/sim/game/sim';
import { neutralInput } from '../src/sim/kernel/input';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';

/** Ladders (C5): a motor mode, every pose checked, on and off by validated poses. */

const spec = T.bodies.player;

function box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): ColliderInput {
  return { kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
}

/** A tower 3 m square with a deck at 5 m and its ladder on the south face, at (0, z=1.58). */
const LADDER: Ladder = { x: 0, z: 1.58, y0: 0, y1: 5, ox: 0, oz: 1 };

function towerWorld(extra: ColliderInput[] = [], guards: GuardSpawn[] = []): World {
  const colliders = [box(-1.5, 1.5, -1.5, 1.5, 4.75, 5), box(-1.4, 1.4, 1.4, 1.5, -0.3, 4.75), box(-0.3, 0.3, 1.5, 1.58, -0.3, 5), ...extra];
  const w = buildWorld({ name: 'ladder', size: 40, cell: 0.5, colliders, spawn: { x: 0, z: 2.4, faceX: 0, faceZ: -1 }, ...(guards.length > 0 ? { camp: { structures: [], guards, fenceHalf: 0 } } : {}) }, T.gen);
  w.ladders = [LADDER];
  return w;
}

/** A guard with a post and nowhere to go: a test walks him by his orders. */
function guardAt(x: number, z: number): GuardSpawn {
  const g: GuardSpawn = { id: 0, role: 'patrol', x, y: 0, z, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 1, routine: null as unknown as Routine };
  g.routine = buildRoutine(g, T.gen.routines, new Rng('ladder-test', 'routines'));
  return g;
}

function run(extra: ColliderInput[] = []): { sim: Simulation; watch: InvariantWatch } {
  const sim = new Simulation(towerWorld(extra), T);
  return { sim, watch: new InvariantWatch(sim) };
}

function step(sim: Simulation, watch: InvariantWatch, t: number, moveZ: number, climb: boolean): void {
  const input = neutralInput(sim.player.yaw);
  input.moveZ = moveZ;
  input.commands = climb ? [{ kind: 'climb' }] : [];
  watch.beforeTick();
  sim.step(input);
  watch.afterTick();
  void t;
}

describe('a ladder', () => {
  it('climbs from its foot to the deck, and steps off over the top', () => {
    const { sim, watch } = run();
    expect(climbPrompt(sim.player, spec, ctxOf(sim))).toBe('ladder');
    step(sim, watch, 0, 0, true);
    expect(sim.player.motor).toBe('ladder');
    const before = sim.player.y;
    for (let t = 1; t < 15; t++) step(sim, watch, t, 0, false);
    expect(sim.player.y).toBe(before); // holding on, not climbing
    for (let t = 15; t < 120 && sim.player.motor === 'ladder'; t++) step(sim, watch, t, 1, false);
    expect(sim.player.y).toBeCloseTo(ladderTop(LADDER, spec), 6);
    // Over the top: a mantle across the deck edge, ending on the deck.
    for (let t = 120; t < 200 && sim.player.motor !== 'ground'; t++) step(sim, watch, t, 1, false);
    expect(sim.player.motor).toBe('ground');
    expect(sim.player.y).toBeCloseTo(5, 6);
    expect(sim.player.z).toBeLessThan(1.4);
    expect(watch.report.first).toBeNull();
  });

  it('goes on from the top and down to the foot', () => {
    const { sim, watch } = run();
    // On the deck, near the top of the ladder, facing it (south).
    Object.assign(sim.player, createBody(sim.world, sim.solids, spec, 0, 0.3, 0, 1, 5));
    expect(sim.player.y).toBeCloseTo(5, 6);
    expect(climbPrompt(sim.player, spec, ctxOf(sim))).toBe('ladder');
    step(sim, watch, 0, 0, true);
    expect(sim.player.motor).toBe('mantle'); // over the edge, onto the rungs
    for (let t = 1; t < 60 && sim.player.motor === 'mantle'; t++) step(sim, watch, t, 0, false);
    expect(sim.player.motor).toBe('ladder');
    expect(sim.player.y).toBeCloseTo(ladderTop(LADDER, spec), 3);
    for (let t = 60; t < 200 && sim.player.motor === 'ladder'; t++) step(sim, watch, t, -1, false);
    expect(sim.player.motor).toBe('ground');
    expect(sim.player.y).toBeCloseTo(0, 6);
    expect(watch.report.first).toBeNull();
  });

  it('lets go at a press, and falls', () => {
    const { sim, watch } = run();
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 60 && sim.player.y < 2.5; t++) step(sim, watch, t, 1, false);
    expect(sim.player.y).toBeGreaterThan(2);
    step(sim, watch, 61, 1, true);
    expect(sim.player.motor).toBe('air');
    for (let t = 62; t < 120 && sim.player.motor !== 'ground'; t++) step(sim, watch, t, 0, false);
    expect(sim.player.motor).toBe('ground');
    expect(sim.player.y).toBeCloseTo(0, 3);
    expect(watch.report.first).toBeNull();
  });

  it('lets go near its foot without the same press taking it again', () => {
    const { sim, watch } = run();
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 12; t++) step(sim, watch, t, 0, false);
    // A hand's breadth up: a press drops it to the ground within the press's buffer.
    for (let t = 12; t < 14; t++) step(sim, watch, t, 1, false);
    expect(sim.player.motor).toBe('ladder');
    step(sim, watch, 14, 0, true);
    expect(sim.player.motor).toBe('air');
    for (let t = 15; t < 40; t++) step(sim, watch, t, 0, false);
    expect(sim.player.motor).toBe('ground');
    expect(watch.report.first).toBeNull();
  });

  it('goes over the top crouched, as it was checked, under a roof a standing body would not fit', () => {
    // A roof 1.5 m over the deck: room for a crouch, none to stand.
    const { sim, watch } = run([box(-1.5, 1.5, -1.5, 1.2, 6.5, 6.7)]);
    expect(sim.player.stance).toBe('stand');
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 160 && sim.player.motor === 'ladder'; t++) step(sim, watch, t, 1, false);
    for (let t = 160; t < 260 && sim.player.motor !== 'ground'; t++) step(sim, watch, t, 1, false);
    expect(sim.player.y).toBeCloseTo(5, 6);
    expect(sim.player.z).toBeLessThan(1.4);
    expect(watch.report.first).toBeNull();
  });

  it('climbs from where the body is when the foot is above it, without a jump to the foot', () => {
    const L: Ladder = { ...LADDER, y0: 0.5 };
    const w = towerWorld();
    w.ladders = [L];
    const sim = new Simulation(w, T);
    const watch = new InvariantWatch(sim);
    step(sim, watch, 0, 0, true);
    expect(sim.player.motor).toBe('ladder');
    for (let t = 1; t < 16; t++) step(sim, watch, t, 0, false);
    expect(sim.player.y).toBe(0);
    expect(watch.report.first).toBeNull();
  });

  it('steps off where the ground at its line is, above its foot or not, and drops from a foot in the air', () => {
    const rising = buildWorld({ name: 'ladder-rise', size: 40, cell: 0.5, height: (_x, z) => Math.max(0, z - 1.58) * 0.36, colliders: [box(-1.5, 1.5, -1.5, 1.5, 4.75, 5), box(-1.4, 1.4, 1.4, 1.5, -0.3, 4.75)], spawn: { x: 0, z: 2.2, faceX: 0, faceZ: -1 } }, T.gen);
    rising.ladders = [LADDER];
    const sim = new Simulation(rising, T);
    const watch = new InvariantWatch(sim);
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 12; t++) step(sim, watch, t, 0, false);
    for (let t = 12; t < 42; t++) step(sim, watch, t, 1, false);
    expect(sim.player.motor).toBe('ladder');
    for (let t = 42; t < 200 && sim.player.motor === 'ladder'; t++) step(sim, watch, t, -1, false);
    expect(sim.player.motor).toBe('ground');
    expect(watch.report.first).toBeNull();
  });

  it('climbs at a climbing gait, whatever the body came at', () => {
    const { sim, watch } = run();
    sim.player.gait = 'sprint';
    step(sim, watch, 0, 0, true);
    expect(sim.player.motor).toBe('ladder');
    step(sim, watch, 1, 1, false);
    expect(sim.player.gait).not.toBe('sprint');
  });

  it('climbs lab D’s towers: up the ladder, through the rail’s gap, and onto the deck', () => {
    const world = generateWorld(campMission('TAL-4471'), T);
    const ladders = laddersOf(world);
    expect(ladders.length).toBeGreaterThan(0);
    const links = ladderLinks(world, new Solids(world.colliders), spec, T);
    expect(links).toHaveLength(ladders.length);
    for (const l of ladders) {
      const sim = new Simulation(world, T);
      const line = ladderLine(l, spec, { x: 0, z: 0 });
      placePlayer(sim, line.x + l.ox * 0.3, line.z + l.oz * 0.3, -l.ox, -l.oz);
      const watch = new InvariantWatch(sim);
      step(sim, watch, 0, 0, true);
      expect(sim.player.motor).toBe('ladder');
      for (let t = 1; t < 400 && sim.player.motor !== 'ground'; t++) step(sim, watch, t, 1, false);
      expect(sim.player.motor).toBe('ground');
      expect(sim.player.y).toBeCloseTo(l.y1, 3);
      // On the deck, on the tower's side of the ladder.
      expect((sim.player.x - l.x) * l.ox + (sim.player.z - l.z) * l.oz).toBeLessThan(-0.1);
      expect(watch.report.first).toBeNull();
    }
  });

  it('waits for what is in its way, and never goes into it', () => {
    // A low slab across the ladder's line at 2 m: the climber's head meets it.
    const { sim, watch } = run([box(-0.6, 0.6, 1.55, 2.6, 2.0, 2.2)]);
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 90; t++) step(sim, watch, t, 1, false);
    expect(sim.player.motor).toBe('ladder');
    expect(sim.player.y).toBeLessThan(2.0 - 1.2 + 0.1); // stopped short of the slab
    expect(watch.report.first).toBeNull();
  });

  it('is not offered from too far off, or facing away', () => {
    const { sim } = run();
    expect(climbPrompt(sim.player, spec, ctxOf(sim))).toBe('ladder');
    sim.player.yaw += Math.PI;
    expect(climbPrompt(sim.player, spec, ctxOf(sim))).toBe('');
    sim.player.yaw -= Math.PI;
    sim.player.z += 2;
    expect(climbPrompt(sim.player, spec, ctxOf(sim))).toBe('');
  });
});

/**
 * A path can't give way, so it is the last thing to move (body/system.ts): the pose a
 * body on a ladder takes is clear of every other body where the tick has left them, and
 * whoever walks under it is shoved from under its feet before he steps up into them.
 */
describe('a ladder and whoever is under it', () => {
  const guard = T.bodies.guard;
  const line = ladderLine(LADDER, spec, { x: 0, z: 0 });
  /** How far apart two standing bodies' circles have to be, less a hair. */
  const apart = spec.radius + guard.radius - 1e-3;

  /** The player on the ladder, holding on above head height, and a guard off to the west of its line, on the ground. */
  function climberAndGuard(extra: ColliderInput[] = []): { sim: Simulation; watch: InvariantWatch } {
    const sim = new Simulation(towerWorld(extra, [guardAt(-3, line.z)]), T);
    const watch = new InvariantWatch(sim);
    step(sim, watch, 0, 0, true);
    for (let t = 1; t < 60 && sim.player.y < 2.6; t++) step(sim, watch, t, 1, false);
    expect(sim.player.motor).toBe('ladder');
    return { sim, watch };
  }

  /** The guard's order for the next tick: east along the ladder's line at a walk, or standing where he is. */
  function order(sim: Simulation, walking: boolean): void {
    sim.guards[0]!.guard.order = { kind: 'move', tick: sim.tick + 1, wishX: walking ? guard.speed.walk : 0, wishZ: 0, gait: walking ? 'walk' : 'idle', yaw: -Math.PI / 2, pitch: 0, headYaw: 0 };
  }

  it('holds still over a guard who walks under it in the same tick, and comes down once he has gone by', () => {
    const { sim, watch } = climberAndGuard();
    const g = sim.guards[0]!.body;
    const top = guard.height.stand;
    // He walks up to the ladder: the player waits on it, feet just over where his head will be.
    for (let t = 0; t < 200 && g.x + g.vx / T.sim.tickHz <= line.x - apart - 0.02; t++) {
      order(sim, true);
      step(sim, watch, t, 0, false);
    }
    expect(g.x).toBeLessThan(line.x - apart);
    sim.player.y = g.y + top + 0.03;
    // The tick he walks in under the ladder is the tick the player starts down it: he goes first, and the player holds.
    const before = { y: sim.player.y, x: g.x };
    order(sim, true);
    step(sim, watch, 0, -1, false);
    expect(g.x).toBeGreaterThan(line.x - apart); // under the player's feet now
    expect(g.x - before.x).toBeCloseTo(guard.speed.walk / T.sim.tickHz, 3); // and not shoved back out
    expect(sim.player.y).toBe(before.y);
    // He walks on under and out the far side, never shoved off his line: the player holds until he's clear, then comes down.
    let held = 0;
    for (let t = 0; t < 400 && sim.player.motor === 'ladder'; t++) {
      const x = g.x;
      order(sim, true);
      step(sim, watch, t, -1, false);
      expect(g.x).toBeGreaterThan(x);
      expect(g.z).toBeCloseTo(line.z, 9);
      const under = Math.abs(g.x - sim.player.x) < apart;
      if (under) expect(sim.player.y).toBeGreaterThanOrEqual(g.y + top);
      if (sim.player.y === before.y) held++;
    }
    expect(held).toBeGreaterThan(20);
    expect(sim.player.motor).toBe('ground');
    expect(g.x).toBeGreaterThan(line.x + apart);
    expect(watch.report.first).toBeNull();
  });

  it('is not walked up into: a body stepping onto a box under feet just over its head is shoved from under them first', () => {
    // The feet of someone on a ladder, 10 cm over a guard's head, above the near edge of a box a step high.
    const feet: Cylinder = { x: 1.15, y: guard.height.stand + 0.1, z: 0.35, radius: spec.radius, height: spec.height.stand };
    const crate = box(1, 3, -1, 1, -0.3, 0.25);
    const world = buildWorld({ name: 'under-feet', size: 30, cell: 0.5, colliders: [crate], spawn: { x: 0, z: 0 } }, T.gen);
    const solids = new Solids(world.colliders);
    const walk = (others: Cylinder[]): { stepped: boolean; deepest: number } => {
      const b = createBody(world, solids, guard, 0, 0, 1, 0);
      const ctx: MotorContext = { world, solids, tuning: T, dt: 1 / T.sim.tickHz, tick: 0, source: 2, others, emit: () => 0 };
      const intent: MoveIntent = { tick: 0, wishX: guard.speed.walk, wishZ: 0, gait: 'walk', yaw: b.yaw, pitch: 0, lean: 0, raised: false, climb: false, climbAxis: 0, load: 1, scrape: false };
      let deepest = 0;
      for (let t = 1; t <= 45; t++) {
        ctx.tick = intent.tick = t;
        stepMotor(b, intent, guard, ctx);
        // How far into those feet he ends the tick, if his head is as high as they are.
        const d = Math.sqrt((b.x - feet.x) * (b.x - feet.x) + (b.z - feet.z) * (b.z - feet.z));
        if (b.y + guard.height.stand > feet.y) deepest = Math.max(deepest, guard.radius + feet.radius - d);
      }
      return { stepped: b.y === 0.25, deepest };
    };
    // With nobody there he walks straight onto the box, through where the feet would be.
    expect(walk([])).toMatchObject({ stepped: true });
    expect(walk([]).deepest).toBeGreaterThan(0.02);
    // With them there he steps up beside them, never into them.
    const met = walk([feet]);
    expect(met.stepped).toBe(true);
    expect(met.deepest).toBeLessThan(1e-3);
  });

  it('is watched: a ladder that takes a body into another is a broken promise, and one that holds still while he walks in is not', () => {
    const { sim, watch } = climberAndGuard();
    const g = sim.guards[0]!.body;
    // The guard stands under the ladder with the player's feet just over his head, and the
    // player is lowered into him by hand, no faster than a ladder goes, as no motor would.
    g.x = line.x;
    sim.player.y = g.y + guard.height.stand + 0.03;
    order(sim, false);
    watch.beforeTick();
    sim.step(neutralInput(sim.player.yaw));
    sim.player.y -= 0.06;
    watch.afterTick();
    expect(watch.report.first).toMatchObject({ entity: sim.playerId });
    expect(watch.report.first!.what).toMatch(/^ladder inside body \d+ by 0\.6/);
    // The same overlap with the player holding still is the guard's doing, or nobody's: the watch holds a path to its own moves.
    // Settling onto the ladder's line by the last bit of a float, as the end of the reach for it can leave a body, is not a move.
    sim.player.z = line.z * (1 + Number.EPSILON);
    expect(sim.player.z).not.toBe(line.z);
    const still = new InvariantWatch(sim);
    for (let t = 0; t < 5; t++) {
      order(sim, false);
      step(sim, still, t, 0, false);
    }
    expect(sim.player.motor).toBe('ladder');
    expect(sim.player.z).toBe(line.z);
    expect(still.report.first).toBeNull();
  });
});

/** Towers the long invariant run broke a promise on, each that run again (scenes/ladderTower.ts). */
describe('the ladder towers the long run found', () => {
  for (const params of TOWER_FINDS) {
    it(`${params}: every body keeps the motor's promises`, () => {
      expect(runScene(ladderTower(params), T).failures).toEqual([]);
    });
  }
});

function ctxOf(sim: Simulation): Parameters<typeof climbPrompt>[2] {
  return { world: sim.world, solids: sim.solids, tuning: T, dt: 1 / T.sim.tickHz, tick: 0, source: 1, others: [], emit: () => 0 };
}
