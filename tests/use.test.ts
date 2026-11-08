import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { bodyHeight, bodyShape, createBody } from '../src/sim/body';
import { buildWorld } from '../src/sim/generation';
import { Simulation } from '../src/sim/game/sim';
import { Faction } from '../src/sim/kernel/state';
import { neutralInput, type TickInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { emptyShape } from '../src/sim/kernel/world/shape';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import type { RemainsEntity } from '../src/sim/game/entities';
import type { FoliageVolume } from '../src/sim/perception';
import { usePrompt } from '../src/sim/game/use';
import { startScene } from '../src/sim/kernel/scene';
import { SCENES } from '../src/sim/game/scenes';

/** The use action (C6): carrying and dragging a body, and hiding it. */

const spec = T.bodies.player;

function world(surface?: (x: number, z: number) => Surface, foliage: FoliageVolume[] = [], colliders: ColliderInput[] = []): World {
  const w = buildWorld({ name: 'use', size: 40, cell: 0.5, surface, colliders, spawn: { x: 0, z: 0, faceX: 0, faceZ: -1 } }, T.gen);
  if (foliage.length) w.foliage = foliage;
  return w;
}

function withBody(w: World, x = 0, z = -1.2): { sim: Simulation; body: RemainsEntity } {
  const sim = new Simulation(w, T);
  const body = sim.spawn(
    (id): RemainsEntity => ({
      id,
      kind: 'remains',
      faction: Faction.Camp,
      remains: { of: 0, post: -1, x, y: w.terrain.heightAt(x, z), z, yaw: 0, eye: 1.71, vx: 0, vz: 0, fell: -5, part: 'torso', carriedBy: 0, hidden: false },
    }),
  );
  return { sim, body };
}

function press(input: TickInput, kind: 'use' | 'climb'): void {
  input.commands = [{ kind }];
}

describe('the use action', () => {
  it('picks a body up, carries it on the shoulder at a walk, and puts it down', () => {
    const { sim, body } = withBody(world());
    const input = neutralInput(sim.player.yaw);
    expect(usePrompt(sim.index.get(sim.playerId) as never, sim.index, T)).toBe('carry');
    press(input, 'use');
    sim.step(input);
    input.commands = [];
    expect(body.remains.carriedBy).toBe(sim.playerId);
    // On the shoulder, at the carrier.
    sim.step(input);
    expect(body.remains.x).toBeCloseTo(sim.player.x, 9);
    expect(body.remains.y).toBeCloseTo(sim.player.y + spec.carry.shoulder, 9);
    // Slow: a carried body keeps you to the carry speed.
    input.moveZ = 1;
    input.sprint = true;
    for (let t = 0; t < 45; t++) sim.step(input);
    expect(sim.player.speed).toBeCloseTo(spec.carry.speed, 3);
    expect(sim.player.gait).toBe('walk');
    // Put down, lying the way the carrier faces.
    input.moveZ = 0;
    input.sprint = false;
    press(input, 'use');
    sim.step(input);
    input.commands = [];
    for (let t = 0; t < 30; t++) sim.step(input);
    expect(body.remains.carriedBy).toBe(0);
    expect(body.remains.x).toBeCloseTo(sim.player.x, 3);
    expect(body.remains.y).toBe(0);
    // It's in the world, lying down, again.
    const heads = bodyShape({ x: body.remains.x, y: 0, z: body.remains.z, yaw: body.remains.yaw, eyeHeight: spec.eyeHeight.prone, lean: 0, axis: body.remains.yaw, lying: 1, riseHead: 0, risePelvis: 0, riseFeet: 0 }, T.bodies.guard, emptyShape());
    expect(heads.head.y).toBeLessThan(0.5);
  });

  it('drags it when crouched, scraping, loudest on gravel', () => {
    const scrapes = (surface: Surface): SimEvent[] => {
      const { sim } = withBody(world(() => surface));
      const input = neutralInput(sim.player.yaw);
      press(input, 'use');
      sim.step(input);
      input.commands = [];
      input.crouch = true;
      sim.step(input);
      input.crouch = false;
      input.moveZ = 1;
      const events: SimEvent[] = [];
      for (let t = 0; t < 90; t++) for (const e of sim.step(input)) events.push({ ...e });
      return events.filter((e) => e.type === 'drag');
    };
    const gravel = scrapes(Surface.Gravel);
    const grass = scrapes(Surface.Grass);
    expect(gravel.length).toBeGreaterThan(0);
    const loud = (es: SimEvent[]): number => Math.max(...es.map((e) => (e.type === 'drag' ? e.radius : 0)));
    expect(loud(gravel)).toBeGreaterThan(loud(grass));
    expect(loud(gravel)).toBeCloseTo(T.noise.drag.gravel * T.noise.radiusPerUnit, 6);
  });

  it('is louder underfoot with a load', () => {
    const { sim } = withBody(world(() => Surface.Gravel), 0, -1);
    const input = neutralInput(sim.player.yaw);
    input.moveZ = 1;
    for (let t = 0; t < 20; t++) sim.step(input);
    const light = sim.player.loudness;
    const s2 = withBody(world(() => Surface.Gravel), 0, -1);
    press(input, 'use');
    input.moveZ = 0;
    s2.sim.step(input);
    input.commands = [];
    input.moveZ = 1;
    for (let t = 0; t < 40; t++) s2.sim.step(input);
    // At carrying pace, about as loud as a walk.
    expect(s2.sim.player.speed).toBeCloseTo(spec.carry.speed, 3);
    expect(Math.abs(s2.sim.player.loudness / light - 1)).toBeLessThan(0.15);
  });

  it('hides a body put down in foliage, and it is gone from every eye', () => {
    const bush: FoliageVolume = { kind: 'cyl', x: 0, z: 0, y0: -0.1, y1: 1.2, r: 1.2, density: 1.3 };
    const { sim, body } = withBody(world(undefined, [bush]));
    const input = neutralInput(sim.player.yaw);
    press(input, 'use');
    sim.step(input);
    input.commands = [];
    sim.step(input);
    press(input, 'use');
    sim.step(input);
    expect(body.remains.hidden).toBe(true);
    const bodies = sim.game.bodies(sim.state, T, []);
    expect(bodies.find((q) => q.id === body.id)).toBeUndefined();
  });

  it('can pick a hidden body up again, and comes out of hiding', () => {
    const bush: FoliageVolume = { kind: 'cyl', x: 0, z: 0, y0: -0.1, y1: 1.2, r: 1.2, density: 1.3 };
    const { sim, body } = withBody(world(undefined, [bush]));
    const input = neutralInput(sim.player.yaw);
    for (const hidden of [false, true, false]) {
      press(input, 'use');
      sim.step(input);
      input.commands = [];
      sim.step(input);
      expect(body.remains.carriedBy !== 0).toBe(!hidden);
      if (hidden) expect(body.remains.hidden).toBe(true);
    }
  });

  it('puts a body down on what the carrier stands on, not the terrain beneath it', () => {
    const deck: ColliderInput = { kind: 'box', x: 0, z: 0, y0: -0.3, y1: 0.3, hx: 6, hz: 6, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const { sim, body } = withBody(world(undefined, [], [deck]));
    const input = neutralInput(sim.player.yaw);
    press(input, 'use');
    sim.step(input);
    input.commands = [];
    sim.step(input);
    press(input, 'use');
    sim.step(input);
    expect(sim.player.y).toBeCloseTo(0.3, 3);
    expect(body.remains.y).toBeCloseTo(0.3, 3);
  });

  it('keeps the hands free for it: nothing is picked up while lying down', () => {
    const { sim, body } = withBody(world());
    sim.player.stance = 'prone';
    const input = neutralInput(sim.player.yaw);
    press(input, 'use');
    sim.step(input);
    expect(body.remains.carriedBy).toBe(0);
    expect(sim.playerControl.carrying).toBe(0);
  });

  it('keeps the hands full: no mantling while carrying', () => {
    const wall: ColliderInput = { kind: 'box', x: 0, z: -2.5, y0: -0.3, y1: 1, hx: 3, hz: 0.15, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
    const { sim } = withBody(world(undefined, [], [wall]));
    const input = neutralInput(sim.player.yaw);
    press(input, 'use');
    sim.step(input);
    input.commands = [];
    input.moveZ = 1;
    for (let t = 0; t < 30; t++) sim.step(input);
    press(input, 'climb');
    for (let t = 0; t < 30; t++) sim.step(input);
    expect(sim.player.motor).not.toBe('mantle');
    expect(bodyHeight(sim.player, spec)).toBeGreaterThan(1);
  });

  it('is in the lab: a body to carry', () => {
    const sim = startScene(SCENES['movement-lab']!(), T) as Simulation;
    expect(sim.index.of('remains')).toHaveLength(1);
    void createBody;
  });
});
