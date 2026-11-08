import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { InvariantWatch, climbPrompt, createBody, ladderTop, type Ladder } from '../src/sim/body';
import { buildWorld } from '../src/sim/generation';
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

function towerWorld(extra: ColliderInput[] = []): World {
  const colliders = [box(-1.5, 1.5, -1.5, 1.5, 4.75, 5), box(-1.4, 1.4, 1.4, 1.5, -0.3, 4.75), box(-0.3, 0.3, 1.5, 1.58, -0.3, 5), ...extra];
  const w = buildWorld({ name: 'ladder', size: 40, cell: 0.5, colliders, spawn: { x: 0, z: 2.4, faceX: 0, faceZ: -1 } }, T.gen);
  w.ladders = [LADDER];
  return w;
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

function ctxOf(sim: Simulation): Parameters<typeof climbPrompt>[2] {
  return { world: sim.world, solids: sim.solids, tuning: T, dt: 1 / T.sim.tickHz, tick: 0, source: 1, others: [], emit: () => 0 };
}
