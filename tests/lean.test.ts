import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { bodyShape, createBody, eyeOf, stepMotor, type BodyState, type MotorContext, type MoveIntent } from '../src/sim/body';
import { leanReach } from '../src/sim/body/lean';
import { buildWorld } from '../src/sim/generation';
import type { Simulation as GameSim } from '../src/sim/game/sim';
import { Simulation } from '../src/sim/game/sim';
import { neutralInput, Optic } from '../src/sim/kernel/input';
import { Rng } from '../src/sim/kernel/core/rng';
import { Blocks, circleOverlaps, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { emptyShape } from '../src/sim/kernel/world/shape';
import { sightLine, type QueryView } from '../src/sim/kernel/world/query';
import { Solids } from '../src/sim/kernel/world/solids';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';

/**
 * Lean (C3): the eye is the centre of the simulated head, and the head moves with it;
 * rate-limited, held clear of walls and bodies. A lean hides nothing.
 */

const spec = T.bodies.player;
const dt = 1 / T.sim.tickHz;

function wall(x: number, z: number, hx: number, hz: number, y1 = 3): ColliderInput {
  return { kind: 'box', x, z, y0: -0.3, y1, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
}

/** A wall running along z from the origin northwards, ending at z = 0, and a flat world round it. */
function cornerWorld(extra: ColliderInput[] = []): World {
  return buildWorld({ name: 'corner', size: 60, cell: 1, colliders: [wall(0, -10, 0.2, 10), ...extra], spawn: { x: -2, z: 2, faceX: 0, faceZ: -1 } }, T.gen);
}

function ctxOf(world: World): MotorContext {
  return { world, solids: new Solids(world.colliders), tuning: T, dt, tick: 1, source: 1, others: [], emit: () => 0 };
}

function intentAt(b: BodyState, tick: number, lean: number, raised = false, wishX = 0, wishZ = 0): MoveIntent {
  return { tick, wishX, wishZ, gait: wishX === 0 && wishZ === 0 ? 'idle' : 'walk', yaw: b.yaw, pitch: 0, lean, raised };
}

describe('a lean', () => {
  it('moves the head aside by exactly the lean, and at no more than its rate', () => {
    const world = cornerWorld();
    const ctx = ctxOf(world);
    const b = createBody(world, ctx.solids, spec, 5, 5, 0, -1);
    const s0 = bodyShape(b, spec, emptyShape());
    const steps: number[] = [];
    for (let t = 1; t <= 30; t++) {
      const before = b.lean;
      ctx.tick = t;
      stepMotor(b, intentAt(b, t, 1), spec, ctx);
      steps.push(b.lean - before);
    }
    expect(Math.max(...steps)).toBeLessThanOrEqual(spec.lean.rate * dt + 1e-12);
    expect(b.lean).toBeCloseTo(spec.lean.peek, 10);
    const s = bodyShape(b, spec, emptyShape());
    // Facing north (yaw 0), right is east (+x).
    expect(s.head.x - b.x).toBeCloseTo(spec.lean.peek, 10);
    expect(s.head.y).toBeLessThan(s0.head.y); // down the arc
    expect(s0.head.y - s.head.y).toBeLessThan(0.03);
    expect(s.torso.bx - b.x).toBeGreaterThan(0);
    expect(s.torso.bx - b.x).toBeLessThan(spec.lean.peek);
    expect(s.legs.bx).toBe(b.x); // the legs stay where they are
  });

  it('peeks with nothing raised, and goes all the way with an optic up', () => {
    const world = cornerWorld();
    const ctx = ctxOf(world);
    const b = createBody(world, ctx.solids, spec, 5, 5, 0, -1);
    expect(leanReach(b, spec, false)).toBe(spec.lean.peek);
    expect(leanReach(b, spec, true)).toBe(spec.lean.weapon);
    for (let t = 1; t <= 30; t++) {
      ctx.tick = t;
      stepMotor(b, intentAt(b, t, -1, true), spec, ctx);
    }
    expect(b.lean).toBeCloseTo(-spec.lean.weapon, 10);
    // Never so far that a head on a turning body could pass through a wall the body is clear of.
    expect(spec.lean.weapon).toBeLessThan(spec.radius + spec.parts.headRadius);
  });

  it('is shorter crouched than standing, and shortest lying down', () => {
    const world = cornerWorld();
    const ctx = ctxOf(world);
    const b = createBody(world, ctx.solids, spec, 5, 5, 0, -1);
    b.eyeHeight = spec.eyeHeight.crouch;
    b.stance = 'crouch';
    const crouched = leanReach(b, spec, true);
    expect(crouched).toBeLessThan(spec.lean.weapon);
    b.eyeHeight = spec.eyeHeight.prone;
    b.stance = 'prone';
    expect(leanReach(b, spec, true)).toBe(spec.lean.prone);
    expect(spec.lean.prone).toBeLessThan(crouched);
  });

  it('stops short of a wall, and of another body', () => {
    // Standing beside a wall to the east, leaning into it.
    const world = buildWorld({ name: 'beside', size: 40, cell: 1, colliders: [wall(0.55, 0, 0.25, 8)], spawn: { x: 0, z: 0 } }, T.gen);
    const ctx = ctxOf(world);
    const b = createBody(world, ctx.solids, spec, 0, 0, 0, -1);
    for (let t = 1; t <= 40; t++) {
      ctx.tick = t;
      stepMotor(b, intentAt(b, t, 1, true), spec, ctx);
    }
    const s = bodyShape(b, spec, emptyShape());
    const c = ctx.solids.get(0);
    expect(circleOverlaps(c, s.head.x, s.head.z, s.head.r)).toBe(false);
    expect(circleOverlaps(c, s.torso.bx, s.torso.bz, s.torso.r)).toBe(false);
    expect(b.lean).toBeGreaterThan(0);
    expect(b.lean).toBeLessThan(spec.lean.weapon);
    // Another body beside us stops it as well.
    const open = buildWorld({ name: 'open', size: 40, cell: 1, spawn: { x: 0, z: 0 } }, T.gen);
    const ctx2 = ctxOf(open);
    (ctx2 as { others: MotorContext['others'] }).others = [{ x: 0.75, y: 0, z: 0, radius: 0.3, height: 1.85 }];
    const b2 = createBody(open, ctx2.solids, spec, 0, 0, 0, -1);
    for (let t = 1; t <= 40; t++) {
      ctx2.tick = t;
      stepMotor(b2, intentAt(b2, t, 1, true), spec, ctx2);
    }
    expect(b2.lean).toBeGreaterThan(0);
    const s2 = bodyShape(b2, spec, emptyShape());
    expect(Math.hypot(s2.head.x - 0.75, s2.head.z)).toBeGreaterThanOrEqual(0.3 + s2.head.r - 1e-9);
  });

  it('gives way at once when the body turns or walks it into a wall', () => {
    const world = buildWorld({ name: 'beside', size: 40, cell: 1, colliders: [wall(0.55, 0, 0.25, 8)], spawn: { x: 0, z: 0 } }, T.gen);
    const ctx = ctxOf(world);
    // Lean west, away from the wall to the east.
    const b = createBody(world, ctx.solids, spec, -1.2, 0, 0, -1);
    for (let t = 1; t <= 40; t++) {
      ctx.tick = t;
      stepMotor(b, intentAt(b, t, -1, true), spec, ctx);
    }
    expect(b.lean).toBeCloseTo(-spec.lean.weapon, 10);
    // Turn right round: the lean now points east, at the wall, in one tick.
    b.yaw += Math.PI;
    ctx.tick = 41;
    stepMotor(b, { ...intentAt(b, 41, -1, true), yaw: b.yaw }, spec, ctx);
    const s = bodyShape(b, spec, emptyShape());
    expect(circleOverlaps(ctx.solids.get(0), s.head.x, s.head.z, s.head.r)).toBe(false);
  });

  it('goes when the body sprints', () => {
    const world = cornerWorld();
    const ctx = ctxOf(world);
    const b = createBody(world, ctx.solids, spec, 5, 5, 0, -1);
    for (let t = 1; t <= 20; t++) {
      ctx.tick = t;
      stepMotor(b, intentAt(b, t, 1, true), spec, ctx);
    }
    expect(b.lean).toBeGreaterThan(0.2);
    for (let t = 21; t <= 60; t++) {
      ctx.tick = t;
      stepMotor(b, { ...intentAt(b, t, 1, true, 0, -5.5), gait: 'sprint' }, spec, ctx);
    }
    expect(b.lean).toBe(0);
  });

  it('keeps the eye at the centre of the head, for a shot too', () => {
    const world = cornerWorld();
    const sim = new Simulation(world, T) as GameSim;
    const input = neutralInput(sim.player.yaw);
    input.lean = 1;
    input.optic = Optic.Binoculars;
    for (let t = 0; t < 15; t++) sim.step(input);
    expect(sim.player.lean).toBeGreaterThan(0.3);
    const s = bodyShape(sim.player, spec, emptyShape());
    const eye = eyeOf(sim.player, spec, { x: 0, y: 0, z: 0 });
    expect(eye).toEqual({ x: s.head.x, y: s.head.y, z: s.head.z });
    // A shot leaves from the eye the player saw.
    input.commands = [{ kind: 'fire', lag: 0, yaw: sim.player.yaw, pitch: 0 }];
    const events = sim.step(input);
    input.commands = [];
    const shot = events.find((e) => e.type === 'shot')!;
    expect(shot).toBeDefined();
    if (shot.type === 'shot') {
      expect(shot.x).toBeCloseTo(eye.x, 1);
      expect(shot.x).not.toBeCloseTo(sim.player.x, 1);
    }
    // And the snapshot places the camera there.
    const snap = sim.snapshot();
    expect(snap.eyeX).toBeCloseTo(s.head.x - sim.player.x, 1);
    expect(snap.lean).toBe(sim.player.lean);
  });
});

/** Random guards and lean poses around a corner: the line from the eye to a head, both ways. */
describe('eye to head', () => {
  it('whenever the player can see a guard past a corner, the guard has a line to the eye (and back)', () => {
    const colliders: ColliderInput[] = [wall(0, -10, 0.2, 10), wall(-12, 3, 8, 0.2), wall(10, 6, 0.15, 4)];
    const world = buildWorld({ name: 'corners', size: 60, cell: 1, colliders, spawn: { x: -2, z: 2 } }, T.gen);
    const solids = new Solids(world.colliders);
    const view: QueryView = { world, solids, bodies: [] };
    const rng = new Rng('EYE-HEAD', 'poses');
    const guardSpec = T.bodies.guard;
    let pairs = 0;
    let seen = 0;
    let cleared = 0;
    for (let k = 0; k < 2000; k++) {
      const x = rng.range(-4, 2);
      const z = rng.range(-1, 4);
      const b = createBody(world, solids, spec, x, z, 0, -1);
      b.yaw = rng.range(-3.1, 3.1);
      const side = rng.chance(0.5) ? 1 : -1;
      b.lean = side * rng.range(0, spec.lean.weapon);
      const head = bodyShape(b, spec, emptyShape()).head;
      const g = createBody(world, solids, guardSpec, rng.range(1, 20), rng.range(-20, -2), 0, 1);
      const gEye = eyeOf(g, guardSpec, { x: 0, y: 0, z: 0 });
      // Eye to head, both ways, through the same world with no bodies in the way.
      const seesHim = sightLine(view, head.x, head.y, head.z, gEye.x, gEye.y, gEye.z, Blocks.Sight);
      const seesYou = sightLine(view, gEye.x, gEye.y, gEye.z, head.x, head.y, head.z, Blocks.Sight);
      pairs++;
      expect(seesYou).toBe(seesHim);
      if (seesHim) seen++;
      const withoutLean = createBody(world, solids, spec, x, z, 0, -1);
      withoutLean.yaw = b.yaw;
      const still = bodyShape(withoutLean, spec, emptyShape()).head;
      if (seesHim && !sightLine(view, still.x, still.y, still.z, gEye.x, gEye.y, gEye.z, Blocks.Sight)) cleared++;
    }
    expect(pairs).toBe(2000);
    // The corner really matters: some pairs are in view, some not, and leaning changed some of them.
    expect(seen).toBeGreaterThan(100);
    expect(seen).toBeLessThan(1900);
    expect(cleared).toBeGreaterThan(20);
  });
});
