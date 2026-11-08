import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { opticFov, pixelsPerMil, scopeDiameter } from '../src/app/scope';
import { defaultTuning as T } from '../src/config/tuning';
import { SWAY_RUNGS, decisionSensitivity, sweepCases, sweepShot, sweepWorld, swayRadius } from '../src/sim/game/ballisticsBench';
import type { World } from '../src/sim/kernel/world/world';

/**
 * The reticle tells the truth (B6). The hold the instruments name for a point, drawn on
 * the scope's reticle in the camera's own projection, is where the simulation's bullet
 * goes: fired through the whole simulation (a press on the swaying line of sight, the
 * 'rifle' and 'bullets' systems, the swept strike) at a board, over both loads, 100–500 m,
 * winds from still to 8 m/s from four sides, and slopes to ±30°, within 1 cm. A field of
 * view that bent the reticle (Tarkov's 100 m zero acting like 200–300 m) would fail here.
 *
 * And the shot is earned (the exit test's supporting check): at 300 m, skipping any one
 * decision moves a centred head shot off the head, while the steadiest stance's sway
 * keeps it well on.
 */

describe('the reticle', () => {
  const worlds = new Map<string, World>();
  const shots = sweepCases().map((c) => {
    const key = `${c.wind.speed}/${c.wind.fromDeg}`;
    let world = worlds.get(key);
    if (!world) worlds.set(key, (world = sweepWorld(c.wind, T)));
    return { c, shot: sweepShot(world, c, T) };
  });

  it('puts the simulated bullet within 1 cm of the point its hold names, over the whole sweep', () => {
    expect(shots).toHaveLength(160);
    let worst = 0;
    for (const { c, shot } of shots) {
      expect(shot.miss, JSON.stringify(c)).toBeLessThan(0.01);
      worst = Math.max(worst, shot.miss);
    }
    // The chord between ticks bends from the path by under 1.4 mm: that's all there is.
    expect(worst).toBeLessThan(0.002);
  });

  it('draws each hold where the camera shows the point, on any screen', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 800],
      [900, 1200],
    ] as const) {
      const fov = opticFov(T.ballistics.scope.fieldDeg, scopeDiameter(w, h), h);
      const ppm = pixelsPerMil(fov, h);
      const camera = new THREE.PerspectiveCamera(fov, w / h, 0.08, 7000);
      camera.rotation.order = 'YXZ';
      for (const { c, shot } of shots) {
        const { sight, eye, target, hold } = shot;
        camera.position.set(eye.x, eye.y, eye.z);
        camera.rotation.set(Math.asin(sight.y), Math.atan2(-sight.x, -sight.z), 0, 'YXZ');
        camera.updateMatrixWorld();
        const v = new THREE.Vector3(target.x, target.y, target.z).project(camera);
        const sx = ((v.x + 1) / 2) * w;
        const sy = ((1 - v.y) / 2) * h;
        // The mark a hold names: hold.up below the centre, hold.right to the left.
        const mx = w / 2 - hold.right * ppm;
        const my = h / 2 + hold.up * ppm;
        const offMil = Math.hypot(sx - mx, sy - my) / ppm;
        // A thousandth of a mil: 0.05 mm at 500 m.
        expect(offMil, `${w}×${h} ${JSON.stringify(c)}`).toBeLessThan(1e-3);
      }
    }
  });
});

describe('decision sensitivity at 300 m', () => {
  const s = decisionSensitivity(T);

  it('moves a centred head shot off the head when any one decision is skipped', () => {
    expect(s.centred).toBeLessThan(1e-6);
    for (const k of ['drop', 'lead', 'wind', 'ranging'] as const) expect(s[k], k).toBeGreaterThan(s.head);
    // The research's figures for the decisions, in mils (docs/research/labs.md, Lab B), at the range's 4 m/s.
    expect(s.drop).toBeGreaterThan(1.5);
    expect(s.lead).toBeGreaterThan(1.7);
  });

  it('keeps the earned stance well on the head: prone, rested, breath held', () => {
    const held = SWAY_RUNGS.find((r) => r.breath)!;
    expect(swayRadius(held, T)).toBeLessThan(s.head / 3);
    // Free-standing, the sway alone can take it off.
    expect(swayRadius(SWAY_RUNGS[0]!, T)).toBeGreaterThan(s.head);
  });
});
