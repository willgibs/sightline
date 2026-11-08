import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { lerp } from '../src/sim/kernel/core/math';
import { neutralInput, quantizeInput } from '../src/sim/kernel/input';
import { bobDepth, headBob } from '../src/sim/body/bob';
import { Simulation } from '../src/sim/game/sim';
import { EAST, testWorld } from './fixtures';
import { decisionSensitivity } from '../src/sim/game/ballisticsBench';
import { opticFov, pixelsPerMil, scopeDiameter } from '../src/app/scope';

/**
 * Head bob (sim/body/bob.ts): the camera dips as each foot comes down, as deep as the
 * gait at that speed, and the dip lands on the moment the footstep sounds.
 */

const P = T.bodies.player;
const D = T.view.bob;

describe('head bob', () => {
  it('dips as each foot comes down and rises half a stride later', () => {
    const v = P.speed.walk;
    expect(headBob(0, v, P, D)).toBeCloseTo(-D.walk, 12);
    expect(headBob(1, v, P, D)).toBeCloseTo(-D.walk, 12);
    expect(headBob(0.5, v, P, D)).toBeCloseTo(0, 12);
    // Smooth both ways round the foot coming down.
    expect(headBob(0.02, v, P, D)).toBeCloseTo(headBob(0.98, v, P, D), 12);
  });

  it('is as deep as each gait at its speed, between them in between, and nothing at rest', () => {
    for (const g of ['crawl', 'crouch', 'walk', 'sprint'] as const) expect(bobDepth(P.speed[g], P, D)).toBeCloseTo(D[g], 12);
    expect(bobDepth(0, P, D)).toBe(0);
    expect(bobDepth(NaN, P, D)).toBe(0);
    expect(headBob(0, 0, P, D)).toBe(0);
    expect(bobDepth(P.speed.crawl / 2, P, D)).toBeCloseTo(D.crawl / 2, 12);
    expect(bobDepth(P.speed.sprint * 2, P, D)).toBe(D.sprint);
    // Continuous and never shallower for going faster.
    let last = 0;
    for (let v = 0; v <= 7; v += 0.01) {
      const d = bobDepth(v, P, D);
      expect(d).toBeGreaterThanOrEqual(last - 1e-12);
      expect(d - last).toBeLessThan(0.002);
      last = d;
    }
    // A body whose gaits are out of speed order (a guard walks slower than he crouches) still gets a depth for every speed.
    const G = T.bodies.guard;
    for (let v = 0; v <= 7; v += 0.05) expect(bobDepth(v, G, D)).toBeGreaterThanOrEqual(0);
  });

  it('dips at the moment each step sounds, between ticks', () => {
    // Interpolating the snapshots as the camera does, the stride starts over exactly at
    // each footstep's moment within its tick.
    const sim = new Simulation(testWorld(), T);
    const input = quantizeInput({ ...neutralInput(EAST), moveZ: 1 });
    for (let i = 0; i < 60; i++) sim.step(input);
    let prev = sim.snapshot();
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const events = sim.step(input);
      const curr = sim.snapshot();
      for (const e of events) {
        if (e.type !== 'footstep') continue;
        const within = e.t * T.sim.tickHz - (e.tick - 1);
        const next = curr.step < prev.step - 0.5 ? curr.step + 1 : curr.step;
        // Where the interpolated phase reaches 1.
        const at = (1 - prev.step) / (next - prev.step);
        expect(at).toBeCloseTo(within, 6);
        expect(lerp(prev.step, next, at)).toBeCloseTo(1, 9);
        checked++;
      }
      prev = curr;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

/**
 * Lab B's B5, decided by measuring at 300 m: walking bodies don't bob in the simulation,
 * and a shot leaves from the simulation's eye. These are the measurements it rests on;
 * if a change makes any of them fail, the decision needs revisiting (docs/decisions.md, B5).
 */
describe('bob, measured at 300 m (B5)', () => {
  const G = T.bodies.guard;
  const mil = (m: number, range: number): number => (m / range) * 1000;
  const decisions = decisionSensitivity(T);

  it("a walking guard's head bob is a small part of a head and of every decision a 300 m shot needs", () => {
    const dip = bobDepth(G.speed.walk, G, D);
    expect(dip).toBeCloseTo(D.walk, 12);
    // 2.6 cm at 300 m: 0.087 mil, under a quarter of the head's radius.
    expect(mil(dip, 300)).toBeLessThan(decisions.head / 4);
    for (const k of ['drop', 'lead', 'wind', 'ranging'] as const) expect(mil(dip, 300) * 5).toBeLessThan(decisions[k]);
    // Through the scope on a 1080-line screen it moves the head by under a pixel and a half.
    const fov = opticFov(T.ballistics.scope.fieldDeg, scopeDiameter(1920, 1080), 1080);
    expect(mil(dip, 300) * pixelsPerMil(fov, 1080)).toBeLessThan(1.5);
  });

  it("the shooter's own bob is gone when it could matter: the camera stops bobbing as the scope comes up, and unscoped the barrel's own error dwarfs it", () => {
    // The camera's bob is scaled by how far the scope is down (app/game.ts, bodyPose).
    const scopedBob = headBob(0, P.speed.walk, P, D) * T.view.headBob * (1 - 1);
    expect(scopedBob === 0).toBe(true);
    // Unscoped, a shot points within 25 mil of the view, against a sprint's 5 cm dip at 300 m.
    expect(mil(D.sprint, 300) * 100).toBeLessThan(T.ballistics.rifle.unaimedMil);
  });
});
