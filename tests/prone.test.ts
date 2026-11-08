import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { InvariantWatch, bodyShape, createBody, eyeOf, requestStance, stepMotor, type BodyState, type Cylinder, type MotorContext, type MoveIntent } from '../src/sim/body';
import { chainOf, footprint } from '../src/sim/body/chain';
import { buildWorld } from '../src/sim/generation';
import { Simulation } from '../src/sim/game/sim';
import { neutralInput } from '../src/sim/kernel/input';
import { Blocks, pushOutCircle, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { emptyShape } from '../src/sim/kernel/world/shape';
import { Solids } from '../src/sim/kernel/world/solids';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';

/**
 * The prone body (C2): a chain of circles along its axis, grown over the transition,
 * turning by the largest yaw that keeps every part clear, pivoting near the chest, and
 * lying along the ground under it. Nothing about its shape is hidden.
 */

const spec = T.bodies.player;
const dt = 1 / T.sim.tickHz;

function box(x0: number, x1: number, z0: number, z1: number, y0 = -0.3, y1 = 3, surface: Surface = Surface.Rock): ColliderInput {
  return { kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ux: 1, uz: 0, flags: Blocks.All, surface };
}

function world(colliders: ColliderInput[], height?: (x: number, z: number) => number): World {
  return buildWorld({ name: 'prone', size: 40, cell: 0.5, colliders, height, spawn: { x: 0, z: 0 } }, T.gen);
}

function setup(colliders: ColliderInput[] = [], height?: (x: number, z: number) => number, x = 0, z = 0): { b: BodyState; ctx: MotorContext } {
  const w = world(colliders, height);
  const ctx: MotorContext = { world: w, solids: new Solids(w.colliders), tuning: T, dt, tick: 1, source: 1, others: [], emit: () => 0 };
  const b = createBody(w, ctx.solids, spec, x, z, 0, -1);
  return { b, ctx };
}

function down(b: BodyState, ctx: MotorContext): void {
  requestStance(b, 'prone', spec, ctx);
  for (let t = 1; t <= 30; t++) step(b, ctx, t);
}

function step(b: BodyState, ctx: MotorContext, t: number, wishX = 0, wishZ = 0, yaw = b.yaw): void {
  ctx.tick = t;
  const i: MoveIntent = { tick: t, wishX, wishZ, gait: wishX || wishZ ? 'crawl' : 'idle', yaw, pitch: 0, lean: 0, raised: false, climb: false, climbAxis: 0, load: 1, scrape: false };
  stepMotor(b, i, spec, ctx);
}

/** How deep any part of the shape, or any circle of the chain, is inside the world's colliders. */
function deepest(b: BodyState, ctx: MotorContext): number {
  let worst = 0;
  const push = { x: 0, z: 0 };
  const check = (x: number, y: number, z: number, r: number, y0 = y - r, y1 = y + r): void => {
    for (const c of ctx.world.colliders.list) {
      if (c.y1 <= y0 || c.y0 >= y1) continue;
      if (pushOutCircle(c, x, z, r, push)) worst = Math.max(worst, Math.hypot(push.x, push.z));
    }
  };
  const s = bodyShape(b, spec, emptyShape());
  check(s.head.x, s.head.y, s.head.z, s.head.r);
  for (const cap of [s.torso, s.legs]) {
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      check(cap.ax + (cap.bx - cap.ax) * f, cap.ay + (cap.by - cap.ay) * f, cap.az + (cap.bz - cap.az) * f, cap.r);
    }
  }
  for (const C of footprint(b, spec, [])) check(b.x + C.x, b.y + C.rise + 0.25, b.z + C.z, C.r, b.y, b.y + 0.5);
  return worst;
}

describe('the prone chain', () => {
  it('runs from the head to the heels, and covers the capsules it stands for', () => {
    const chain = chainOf(spec);
    expect(chain[0]!.r).toBe(spec.parts.headRadius);
    expect(chain[0]!.at).toBeCloseTo(spec.parts.pivot - spec.parts.headRadius, 10);
    // Nothing behind the heels, and the pivot is near the chest.
    const last = chain[chain.length - 1]!;
    expect(last.at).toBeCloseTo(spec.parts.pivot - (spec.parts.proneLength - spec.parts.legRadius), 10);
    expect(chain.some((n) => Math.abs(n.at) < 0.13)).toBe(true);
    // Spaced to cover the capsules: consecutive circles overlap by enough.
    for (let k = 1; k < chain.length; k++) {
      const gap = chain[k - 1]!.at - chain[k]!.at;
      expect(gap).toBeLessThanOrEqual(chain[k - 1]!.r + chain[k]!.r);
    }
  });

  it('grows out of the standing circle over the transition, never inside anything', () => {
    // Backed up against a wall: the legs have to push the body forward, or stop short.
    const { b, ctx } = setup([box(-3, 3, 0.45, 1)]);
    const w = ctx.world;
    const sim = new Simulation(w, T);
    Object.assign(sim.player, b);
    const watch = new InvariantWatch(sim);
    const input = neutralInput(sim.player.yaw);
    for (let t = 0; t < 40; t++) {
      input.prone = t === 0;
      watch.beforeTick();
      sim.step(input);
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
    expect(sim.player.stance).toBe('prone');
    expect(sim.player.lying).toBeGreaterThan(0);
    // It lies along its facing, pushed clear of the wall behind it.
    expect(sim.player.lying).toBe(1);
    expect(sim.player.z).toBeLessThan(0);
  });

  it('turns by the largest yaw that keeps every part clear, between walls a metre apart', () => {
    // A corridor along x, 1 m wide. A body lying across it can't turn all the way.
    const { b, ctx } = setup([box(-6, 6, -0.6, -0.5), box(-6, 6, 0.5, 0.6)]);
    b.yaw = Math.PI / 2; // facing west, along the corridor
    b.axis = b.yaw;
    down(b, ctx);
    expect(b.lying).toBe(1);
    const a0 = b.axis;
    // Look north, across the corridor: the axis follows only as far as it can.
    let worst = 0;
    for (let t = 31; t < 200; t++) {
      step(b, ctx, t, 0, 0, a0 - Math.PI / 2);
      worst = Math.max(worst, deepest(b, ctx));
    }
    expect(worst).toBeLessThan(1e-3);
    const turned = Math.abs(b.axis - a0);
    expect(turned).toBeGreaterThan(0.05);
    expect(turned).toBeLessThan(Math.PI / 2 - 0.2);
    // The eye is at the head, ahead of the pivot.
    const eye = eyeOf(b, spec, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(eye.x - b.x, eye.z - b.z)).toBeCloseTo(spec.parts.pivot - spec.parts.headRadius, 6);
  });

  it('crawls without any part entering a wall it scrapes along, and into which it turns', () => {
    const { b, ctx } = setup([box(-6, 6, -1.0, -0.9)], undefined, 0, 0);
    down(b, ctx);
    let worst = 0;
    for (let t = 31; t < 400; t++) {
      const yaw = b.yaw + 0.04;
      // Crawl forward along the view, a little into the wall as the body rotates against it.
      step(b, ctx, t, -Math.sin(yaw) * 0.7, -Math.cos(yaw) * 0.7, yaw);
      worst = Math.max(worst, deepest(b, ctx));
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('lies along the ground under its head and feet', () => {
    // A slope rising to the north at 20°.
    const tan20 = 0.364;
    const { b, ctx } = setup([], (_x, z) => -z * tan20);
    down(b, ctx);
    expect(b.riseHead).toBeGreaterThan(0.05);
    expect(b.riseFeet).toBeLessThan(-0.05);
    const s = bodyShape(b, spec, emptyShape());
    // The head higher than the pivot, the legs lower, and none of it under the ground.
    expect(s.head.y).toBeGreaterThan(b.y + spec.eyeHeight.prone);
    expect(s.legs.ay).toBeLessThan(b.y);
    expect(ctx.world.terrain.heightAt(s.head.x, s.head.z)).toBeLessThan(s.head.y);
  });

  it('gets up as it went down, and only if there is room', () => {
    const { b, ctx } = setup([box(-3, 3, -3, 3, 1.3, 1.6)], undefined, 0, 6);
    // Lying under a low slab, no way to have walked there: only the getting up matters here.
    b.z = 0;
    b.stance = 'prone';
    b.eyeHeight = b.eyeFrom = spec.eyeHeight.prone;
    b.lying = 1;
    expect(requestStance(b, 'stand', spec, ctx)).toBe(false);
    expect(requestStance(b, 'crouch', spec, ctx)).toBe(true);
    for (let t = 31; t < 70; t++) step(b, ctx, t);
    expect(b.lying).toBe(0);
    expect(b.stance).toBe('crouch');
  });

  it('keeps what a leg rests on under it as it draws in', () => {
    // A rock just within reach of the fourth circle at full length, and out of its reach
    // a moment into getting up if that reach shrank with the chain (PIF-1492, in the fuzz).
    const circle = chainOf(spec)[3]!;
    const reach = (Math.abs(circle.at) - spec.radius) * Math.tan((spec.maxSlopeDeg * Math.PI) / 180);
    const { b, ctx } = setup([box(-2, 2, 0.45, 2, -0.3, spec.stepHeight + reach - 0.004)]);
    b.stance = 'prone';
    b.eyeHeight = b.eyeFrom = spec.eyeHeight.prone;
    b.lying = 1;
    const sim = new Simulation(ctx.world, T);
    Object.assign(sim.player, b);
    const watch = new InvariantWatch(sim);
    const input = neutralInput(sim.player.yaw);
    for (let t = 0; t < 60; t++) {
      input.crouch = t === 1;
      watch.beforeTick();
      sim.step(input);
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
    expect(sim.player.stance).toBe('crouch');
    expect(sim.player.lying).toBe(0);
  });

  it('waits for room to get up in a slot too narrow to stand in, and can crawl out of it', () => {
    // Walls 0.55 m apart: room to lie in (0.5 m), none to stand in (0.6 m).
    const { b, ctx } = setup([box(-1.5, 3, -0.375, -0.275), box(-1.5, 3, 0.275, 0.375)], undefined, 0, 8);
    b.z = 0; // no way to have walked in standing: only the getting up matters here
    b.yaw = Math.PI / 2; // facing west, along the slot
    b.axis = b.yaw;
    b.stance = 'prone';
    b.eyeHeight = b.eyeFrom = spec.eyeHeight.prone;
    b.lying = 1;
    expect(requestStance(b, 'crouch', spec, ctx)).toBe(true);
    let worst = 0;
    for (let t = 1; t < 90; t++) {
      step(b, ctx, t);
      worst = Math.max(worst, deepest(b, ctx));
    }
    // It has drawn in as far as the walls allow, and the eye waits with it.
    expect(worst).toBeLessThan(1e-3);
    expect(b.lying).toBeGreaterThan(0.3);
    expect(b.lying).toBeLessThan(0.7);
    expect(b.proneTransition).toBe(true);
    expect(b.stanceTimer).toBeGreaterThan(0);
    expect(b.eyeHeight).toBeLessThan(spec.eyeHeight.crouch - 0.05);
    // Crawl out of the end of the slot, and it finishes getting up.
    const x = b.x;
    for (let t = 90; t < 600; t++) {
      step(b, ctx, t, -0.7, 0);
      worst = Math.max(worst, deepest(b, ctx));
    }
    expect(worst).toBeLessThan(1e-3);
    expect(b.x).toBeLessThan(x - 1);
    expect(b.lying).toBe(0);
    expect(b.proneTransition).toBe(false);
    expect(b.eyeHeight).toBe(spec.eyeHeight.crouch);
  });

  it('does not get up with its legs under a shelf, and does once they are out', () => {
    const { b, ctx } = setup([box(-2, 2, 0.6, 3, 0.8, 1)]);
    b.stance = 'prone';
    b.eyeHeight = b.eyeFrom = spec.eyeHeight.prone;
    b.lying = 1;
    step(b, ctx, 1);
    expect(requestStance(b, 'crouch', spec, ctx)).toBe(false);
    expect(b.stance).toBe('prone');
    for (let t = 2; t < 150; t++) step(b, ctx, t, 0, -0.7);
    expect(requestStance(b, 'crouch', spec, ctx)).toBe(true);
  });

  it('takes a bank for a wall: no end of it lifts onto something waist-high', () => {
    // Backing into a 0.8 m bank: its heels stop against it, on the ground.
    const { b, ctx } = setup([box(-6, 6, -1.6, -1, -0.3, 0.8)], undefined, 0, 1);
    b.yaw = Math.PI; // facing south, so its heels are toward the bank to the north
    b.axis = b.yaw;
    down(b, ctx);
    let worst = 0;
    for (let t = 31; t < 200; t++) {
      step(b, ctx, t, 0, -0.7);
      worst = Math.max(worst, b.riseFeet, b.riseHead);
    }
    expect(b.z).toBeLessThan(1);
    expect(worst).toBeLessThan(1e-6);
  });

  it('takes no mantle until it has finished getting up', () => {
    const wall = box(-5, 5, -1.3, -1, -0.3, 1);
    for (let pressAt = 14; pressAt <= 26; pressAt++) {
      const { b, ctx } = setup([wall], undefined, 0, -0.35);
      const sim = new Simulation(ctx.world, T);
      Object.assign(sim.player, b);
      const watch = new InvariantWatch(sim);
      const input = neutralInput(sim.player.yaw);
      const tick = (over: Partial<typeof input>): void => {
        watch.beforeTick();
        sim.step({ ...input, ...over });
        watch.afterTick();
      };
      tick({ prone: true });
      for (let t = 0; t < 30; t++) tick({});
      tick({ crouch: true });
      for (let t = 0; t < 40; t++) {
        tick(t === pressAt ? { commands: [{ kind: 'climb' }] } : {});
        if (sim.player.motor === 'mantle') expect(sim.player.lying, `press ${pressAt}`).toBe(0);
      }
      expect(watch.report.first, `press ${pressAt}`).toBeNull();
    }
  });

  it('raises no end of itself more than a step in a tick', () => {
    // Crawling over a lip: the ground falls away, then a rock is under the heels.
    const { b, ctx } = setup([box(-4, 4, -8, -2, -0.3, 0.44)], undefined, 0, 0);
    down(b, ctx);
    let prev = b.y + b.riseFeet;
    for (let t = 31; t < 400; t++) {
      step(b, ctx, t, 0, -0.7);
      const now = b.y + b.riseFeet;
      expect(now - prev).toBeLessThanOrEqual(spec.stepHeight + 1e-6);
      prev = now;
    }
  });

  it('stands in the way of other bodies along its whole length', () => {
    const { b, ctx } = setup();
    down(b, ctx);
    // The footprint reaches the heels, and they keep a guard off.
    const heels = footprint(b, spec, []).at(-1)!;
    expect(Math.hypot(heels.x, heels.z)).toBeGreaterThan(0.95);
    const other: Cylinder = { x: b.x + heels.x + 0.1, y: 0, z: b.z + heels.z + 0.1, radius: 0.3, height: 1.85 };
    (ctx as unknown as { others: Cylinder[] }).others = [other];
    const before = { x: b.x, z: b.z };
    step(b, ctx, 31);
    // Pushed away from the guard who is standing on its heels.
    expect(Math.hypot(b.x - before.x, b.z - before.z)).toBeGreaterThan(0);
  });

  it('keeps a body from ending inside a wall when it goes prone against one (the head end)', () => {
    const { b, ctx } = setup([box(-3, 3, -0.8, -0.5)], undefined, 0, 0);
    let worst = 0;
    requestStance(b, 'prone', spec, ctx);
    for (let t = 1; t <= 40; t++) {
      step(b, ctx, t);
      worst = Math.max(worst, deepest(b, ctx));
    }
    expect(worst).toBeLessThan(1e-3);
    // It got down: pushed back from the wall, not into it.
    expect(b.lying).toBe(1);
    expect(b.z).toBeGreaterThan(0);
  });
});
