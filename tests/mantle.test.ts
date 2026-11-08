import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { InvariantWatch, bodyHeight, createBody, stepMotor, type BodyState, type Cylinder, type MotorContext, type MoveIntent } from '../src/sim/body';
import { canMantle } from '../src/sim/body/mantle';
import { buildWorld } from '../src/sim/generation';
import { Simulation } from '../src/sim/game/sim';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { Blocks, circleOverlaps, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Solids } from '../src/sim/kernel/world/solids';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';

/**
 * The mantle (C4): up onto, over and through, by a path checked pose by pose every tick.
 */

const spec = T.bodies.player;
const dt = 1 / T.sim.tickHz;

function box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, surface: Surface = Surface.Rock, flags: number = Blocks.All): ColliderInput {
  return { kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ux: 1, uz: 0, flags, surface };
}

function world(colliders: ColliderInput[], height?: (x: number, z: number) => number): World {
  return buildWorld({ name: 'mantle', size: 40, cell: 0.5, colliders, height, spawn: { x: 0, z: 2, faceX: 0, faceZ: -1 } }, T.gen);
}

/** A wall to the north, its south face on z = 0, the body 0.4 m south of it, facing it. */
function facing(colliders: ColliderInput[], height?: (x: number, z: number) => number): { b: BodyState; ctx: MotorContext } {
  const w = world(colliders, height);
  const ctx: MotorContext = { world: w, solids: new Solids(w.colliders), tuning: T, dt, tick: 1, source: 1, others: [], emit: () => 0 };
  const b = createBody(w, ctx.solids, spec, 0, 0.4, 0, -1);
  return { b, ctx };
}

function intentOf(b: BodyState, tick: number, climb: boolean): MoveIntent {
  return { tick, wishX: 0, wishZ: 0, gait: 'idle', yaw: b.yaw, pitch: 0, lean: 0, raised: false, climb, climbAxis: 0 };
}

/** Presses climb, then plays until the mantle's done (or `ticks` runs out). Returns every pose on the way. */
function play(b: BodyState, ctx: MotorContext, ticks = 90): BodyState[] {
  const poses: BodyState[] = [];
  for (let t = 1; t <= ticks; t++) {
    ctx.tick = t;
    stepMotor(b, intentOf(b, t, t === 1), spec, ctx);
    poses.push(structuredClone(b));
  }
  return poses;
}

describe('the mantle', () => {
  it('climbs up onto something deep, and ends standing on it', () => {
    const { b, ctx } = facing([box(-3, 3, -3, 0, -0.3, 1.2, Surface.Wood)]);
    expect(canMantle(b, spec, ctx)).toBe(true);
    const poses = play(b, ctx);
    expect(poses[0]!.motor).toBe('mantle');
    expect(b.motor).toBe('ground');
    expect(b.y).toBeCloseTo(1.2, 6);
    expect(b.z).toBeLessThan(-spec.radius); // well onto it
    expect(b.stance).toBe('stand'); // it stood back up
    expect(b.standingOn).toBeGreaterThanOrEqual(0);
    expect(b.mantle).toBeNull();
    // The plan: about 0.6 s for 1.2 m, rising gently every tick.
    const moving = poses.filter((p) => p.motor === 'mantle').length * dt;
    expect(moving).toBeGreaterThan(0.45);
    expect(moving).toBeLessThan(0.85);
    for (let k = 1; k < poses.length; k++) expect(poses[k]!.y - poses[k - 1]!.y).toBeLessThanOrEqual(spec.stepHeight);
  });

  it('goes over something thin, and lands on the far side', () => {
    const { b, ctx } = facing([box(-3, 3, -0.3, 0, -0.3, 1.0)]);
    const poses = play(b, ctx);
    expect(b.motor).toBe('ground');
    expect(b.y).toBeCloseTo(0, 6);
    expect(b.z).toBeLessThan(-0.3 - spec.radius + 1e-6);
    expect(poses.some((p) => p.y > 1.0)).toBe(true); // up and over the top
  });

  it('goes through a window a body fits', () => {
    // A wall 3 m tall with a 1.3 m tall, 1.1 m wide opening.
    const walls = [box(-4, -0.55, -0.25, 0, -0.3, 3), box(0.55, 4, -0.25, 0, -0.3, 3), box(-0.55, 0.55, -0.25, 0, -0.3, 0.95), box(-0.55, 0.55, -0.25, 0, 2.3, 3)];
    const { b, ctx } = facing(walls);
    expect(canMantle(b, spec, ctx)).toBe(true);
    play(b, ctx);
    expect(b.z).toBeLessThan(-0.25);
    expect(b.y).toBeCloseTo(0, 6);
    expect(b.motor).toBe('ground');
  });

  it('refuses what can not be done', () => {
    // Too tall.
    expect(canMantle(...args(facing([box(-3, 3, -0.3, 0, -0.3, 1.9)])))).toBe(false);
    // A step, not a mantle: it walks onto that.
    expect(canMantle(...args(facing([box(-3, 3, -3, 0, -0.3, 0.4)])))).toBe(false);
    // Nothing there.
    expect(canMantle(...args(facing([])))).toBe(false);
    // A window too narrow for the body, and one too low for it to pass.
    const narrow = [box(-4, -0.24, -0.25, 0, -0.3, 3), box(0.24, 4, -0.25, 0, -0.3, 3), box(-0.24, 0.24, -0.25, 0, -0.3, 0.95), box(-0.24, 0.24, -0.25, 0, 2.3, 3)];
    expect(canMantle(...args(facing(narrow)))).toBe(false);
    const low = [box(-4, -0.55, -0.25, 0, -0.3, 3), box(0.55, 4, -0.25, 0, -0.3, 3), box(-0.55, 0.55, -0.25, 0, -0.3, 1.05), box(-0.55, 0.55, -0.25, 0, 1.75, 3)];
    expect(canMantle(...args(facing(low)))).toBe(false);
    // A far side too far down: it won't go over. (It can still stand on top, a wall is something to stand on.)
    const drop = facing([box(-3, 3, -0.3, 0, -0.3, 1.2)], (_x, z) => (z < -0.3 ? -3 : 0));
    expect(canMantle(...args(drop))).toBe(true);
    play(drop.b, drop.ctx);
    expect(drop.b.y).toBeCloseTo(1.2, 6);
    // Facing away from the wall, or lying down.
    const away = facing([box(-3, 3, -3, 0, -0.3, 1.2)]);
    away.b.yaw += Math.PI;
    expect(canMantle(...args(away))).toBe(false);
    const prone = facing([box(-3, 3, -3, 0, -0.3, 1.2)]);
    prone.b.stance = 'prone';
    expect(canMantle(...args(prone))).toBe(false);
  });

  it('squares up to a wall it faces at an angle', () => {
    const { b, ctx } = facing([box(-3, 3, -3, 0, -0.3, 1.2)]);
    b.yaw = 0.6; // about 34° off square
    b.x = 0.1;
    expect(canMantle(b, spec, ctx)).toBe(true);
    play(b, ctx);
    expect(b.y).toBeCloseTo(1.2, 6);
    // Straight over, not along the wall.
    expect(Math.abs(b.x - 0.1)).toBeLessThan(0.05);
  });

  it('never mantles the terrain', () => {
    // A steep bank, no colliders: the terrain rises 1.2 m over a metre.
    const { b, ctx } = facing([], (_x, z) => (z < -0.2 ? Math.min(1.2, (-0.2 - z) * 1.2) : 0));
    expect(canMantle(b, spec, ctx)).toBe(false);
  });

  it('makes a sound when the hands take hold, by what they take hold of', () => {
    const metal = facing([box(-3, 3, -0.3, 0, -0.3, 1.0, Surface.Metal)]);
    const grass = facing([box(-3, 3, -0.3, 0, -0.3, 1.0, Surface.Grass)]);
    const heard = (f: { b: BodyState; ctx: MotorContext }): SimEvent[] => {
      const events: SimEvent[] = [];
      f.ctx.emit = (e) => {
        events.push({ ...e, id: events.length + 1, tick: f.ctx.tick, t: f.ctx.tick * dt, cause: 0 } as SimEvent);
        return events.length;
      };
      play(f.b, f.ctx);
      return events;
    };
    const m = heard(metal).find((e) => e.type === 'mantle')!;
    const g = heard(grass).find((e) => e.type === 'mantle')!;
    expect(m).toBeDefined();
    expect(g).toBeDefined();
    if (m.type === 'mantle' && g.type === 'mantle') {
      expect(m.radius).toBeCloseTo(0.7 * T.noise.surface.metal * T.noise.radiusPerUnit, 4);
      expect(m.radius).toBeGreaterThan(g.radius);
    }
  });

  it('waits for what walks into its landing, and never goes inside it', () => {
    const { b, ctx } = facing([box(-3, 3, -0.3, 0, -0.3, 1.0)]);
    // Starts clear; after a few ticks someone stands where it would land.
    const other: Cylinder = { x: 0, y: 0, z: -2, radius: 0.3, height: 1.85 };
    (ctx as unknown as { others: Cylinder[] }).others = [other];
    let waited = 0;
    for (let t = 1; t <= 120; t++) {
      if (t === 6) {
        other.x = 0;
        other.z = -0.65;
      }
      ctx.tick = t;
      const was = b.z;
      stepMotor(b, intentOf(b, t, t === 1), spec, ctx);
      if (t >= 6) {
        const dx = b.x - other.x;
        const dz = b.z - other.z;
        const inside = dx * dx + dz * dz < (spec.radius + other.radius - 1e-3) ** 2 && b.y < other.y + other.height && other.y < b.y + bodyHeight(b, spec);
        expect(inside).toBe(false);
        if (b.motor === 'mantle' && b.z === was) waited++;
      }
    }
    expect(waited).toBeGreaterThan(5);
    // It gave up and the body dropped where it was: on the wall, or back on the ground.
    expect(b.motor).toBe('ground');
  });

  it('holds its promises under the invariant watch, in a run', () => {
    const w = world([box(-3, 3, -0.3, 0, -0.3, 1.0), box(5, 8, -3, 0, -0.3, 1.2), box(-8, -5, -0.25, 0, -0.3, 0.95)]);
    const sim = new Simulation(w, T);
    const watch = new InvariantWatch(sim);
    const input = neutralInput(sim.player.yaw);
    // Walk to the wall, press, walk on through.
    for (let t = 0; t < 240; t++) {
      input.moveZ = t < 30 ? 1 : 0;
      input.commands = t === 30 ? [{ kind: 'climb' }] : [];
      watch.beforeTick();
      sim.step(input);
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
  });

  it('a press just before reaching the wall still counts', () => {
    const w = world([box(-3, 3, -0.3, 0, -0.3, 1.0)]);
    const sim = new Simulation(w, T);
    const input = neutralInput(sim.player.yaw);
    // Start beyond reach, walking at the wall, and press early.
    Object.assign(sim.player, createBody(w, sim.solids, spec, 0, 1.0, 0, -1));
    input.moveZ = 1;
    input.commands = [{ kind: 'climb' }];
    sim.step(input);
    input.commands = [];
    let mantled = false;
    for (let t = 0; t < 20; t++) {
      sim.step(input);
      mantled ||= sim.player.motor === 'mantle';
    }
    expect(mantled).toBe(true);
  });
});

function args(f: { b: BodyState; ctx: MotorContext }): [BodyState, typeof spec, MotorContext] {
  return [f.b, spec, f.ctx];
}

// A body in the way of the lean etc is another test; the circle check stays exact.
void circleOverlaps;
