import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { dtanDeg } from '../src/sim/kernel/core/detmath';
import { generateWorld } from '../src/sim/generation/world';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { Simulation } from '../src/sim/game/sim';
import { Blocks, circleOverlaps } from '../src/sim/kernel/world/colliders';
import { makeTerrainSample } from '../src/sim/kernel/world/heightfield';
import { InvariantWatch, STEEP_TOLERANCE } from '../src/sim/body';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { testWorld } from './fixtures';

/**
 * Ground too steep to stand on is a barrier from every angle, on real valleys. Before the
 * controller audit, walking across a cliff at a shallow angle climbed it: 545 m of height
 * gained on 33 faces of three valleys, while validation counted those faces as barriers.
 */

const tanMax = dtanDeg(T.bodies.player.maxSlopeDeg);

interface Face {
  x: number;
  z: number;
  ux: number;
  uz: number;
}

/** The steepest faces in a valley, steepest first, at least 15 m apart. */
function steepFaces(world: World, count: number): Face[] {
  const hf = world.terrain;
  const s = makeTerrainSample();
  const all: Array<Face & { tan: number }> = [];
  for (let j = 0; j < hf.cells; j++) {
    for (let i = 0; i < hf.cells; i++) {
      const x = hf.coord(i) + 0.66 * hf.cell;
      const z = hf.coord(j) + 0.33 * hf.cell;
      if (Math.abs(x) > world.playHalf - 10 || Math.abs(z) > world.playHalf - 10) continue;
      hf.sample(x, z, s);
      if (s.slopeTan > tanMax * 1.1) all.push({ x, z, tan: s.slopeTan, ux: s.gx / s.slopeTan, uz: s.gz / s.slopeTan });
    }
  }
  all.sort((a, b) => b.tan - a.tan);
  const picked: Face[] = [];
  for (const f of all) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.hypot(p.x - f.x, p.z - f.z) > 15)) picked.push(f);
  }
  return picked;
}

/** Height gained while standing on too-steep ground, trying to climb a face at a heading off its fall line. */
function climb(world: World, f: Face, offDeg: number): number | null {
  const sim = new Simulation(world, T);
  const p = sim.player;
  p.x = f.x - f.ux * 3;
  p.z = f.z - f.uz * 3;
  p.y = world.terrain.heightAt(p.x, p.z);
  p.vx = p.vz = 0;
  p.standingOn = -1;
  const ids: number[] = [];
  world.colliders.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1, ids);
  for (const id of ids) {
    const c = world.colliders.list[id]!;
    if (c.flags & Blocks.Move && circleOverlaps(c, p.x, p.z, 0.35)) return null; // a tree in the way: skip this start
  }
  // Heading: uphill, turned offDeg toward the contour.
  const a = (offDeg * Math.PI) / 180;
  const dx = f.ux * Math.cos(a) - f.uz * Math.sin(a);
  const dz = f.uz * Math.cos(a) + f.ux * Math.sin(a);
  const yaw = Math.atan2(-dx, -dz);
  const s = makeTerrainSample();
  let gained = 0;
  for (let i = 0; i < 12 * T.sim.tickHz; i++) {
    world.terrain.sample(p.x, p.z, s);
    const steep = p.standingOn < 0 && s.slopeTan > tanMax;
    const y0 = p.y;
    sim.step({ ...neutralInput(yaw), moveZ: 1, sprint: i % 90 < 60 });
    if (steep && p.standingOn < 0) gained += Math.max(0, p.y - y0);
  }
  return gained;
}

describe('steep ground on real valleys', () => {
  it('cannot be climbed straight up or by traversing at any angle', () => {
    let tried = 0;
    let worst = 0;
    for (const seed of ['TAL-4471', 'MUD-9031', 'ELK-1618']) {
      const world = generateWorld(missionSpec(seed), T);
      for (const face of steepFaces(world, 5)) {
        for (const off of [0, 40, -40, 60, -60, 75, -75, 85, -85]) {
          const g = climb(world, face, off);
          if (g === null) continue;
          tried++;
          worst = Math.max(worst, g);
        }
      }
    }
    expect(tried).toBeGreaterThan(80);
    expect(worst).toBeLessThan(0.05);
  });
});

describe('momentum on steep ground', () => {
  /**
   * The fuzz run's NEM-4083 (Nov 8): crawling prone off a low rock onto terrain a hair
   * steeper than the limit, the player slid, but kept the uphill speed he arrived with,
   * and it carried him onto gentler ground 8 mm higher. On ground too steep to stand on,
   * no part of the body's own speed may go uphill either.
   */
  const steep = tanMax * 1.01;
  const gentle = tanMax * 0.98;
  // Too steep below x = 0, walkable above it: a seam a body coasting uphill crosses.
  const seam = testWorld({ cell: 0.5, height: (x) => (x < 0 ? x * steep : x * gentle), spawn: { x: -20, z: 0 } });

  it('carries no body up across the seam to walkable ground, at any speed or angle', () => {
    let worst = 0;
    let tried = 0;
    for (const speed of [0.5, 0.7, 1.4, 3, 5.5]) {
      for (const offDeg of [0, 30, 60, 80]) {
        for (const start of [0.005, 0.01, 0.03]) {
          const sim = new Simulation(seam, T);
          const p = sim.player;
          p.x = -start;
          p.z = 0;
          p.y = seam.terrain.heightAt(p.x, p.z);
          p.standingOn = -1;
          p.motor = 'ground';
          const a = (offDeg * Math.PI) / 180;
          p.vx = speed * Math.cos(a);
          p.vz = speed * Math.sin(a);
          const y0 = p.y;
          sim.step(neutralInput(p.yaw));
          tried++;
          worst = Math.max(worst, p.y - y0);
        }
      }
    }
    expect(tried).toBe(60);
    expect(worst).toBeLessThan(STEEP_TOLERANCE);
  });

  it('holds in the valley where the fuzz run found it', () => {
    const world = generateWorld(missionSpec('NEM-4083'), T);
    const sim = new Simulation(world, T);
    const watch = new InvariantWatch(sim);
    const bot = new ChaosBot('NEM-4083');
    const raw = neutralInput();
    for (let i = 0; i < 68_100; i++) {
      watch.beforeTick();
      sim.step(bot.next(sim, raw));
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
  });
});

describe('height gained on steep ground, measured where it is gained', () => {
  /**
   * The long bot runs of Nov 9: about one in five stopped on "gained N m on ground too steep
   * to stand on", in fresh valleys with scarps and gorges (HOL-1699, GOL-5605, NUK-1016,
   * BUD-7023, VOD-7220). In every one the body had slid off a steep triangle, across or down
   * it, onto a walkable one that rose the way it was going, and every millimetre was gained
   * on the walkable one. The watch charged the whole tick's rise to where the tick began.
   * These hold it to what the promise says: height gained on the steep ground itself.
   */
  const steep = tanMax * 1.01;
  const gentle = 0.5;
  const s = makeTerrainSample();
  // A gully: a face too steep to stand on falls to x = 0, and walkable ground rises beyond it.
  const gully = testWorld({ cell: 0.5, height: (x) => (x < 0 ? -x * steep : x * gentle), spawn: { x: -20, z: 0 } });
  // A walkable apron below x = 0, and a face too steep to stand on above it.
  const face = testWorld({ cell: 0.5, height: (x) => (x < 0 ? x * gentle : x * steep), spawn: { x: -20, z: 0 } });

  it('counts only what a line rises on triangles too steep to stand on', () => {
    const g = gully.terrain;
    // Down the last of the face and up the far side: nothing gained on the face, whatever the net.
    expect(g.heightAt(0.1, 0.2) - g.heightAt(-0.02, 0.2)).toBeGreaterThan(0.03);
    expect(g.gainOnSteep(-0.02, 0.2, 0.1, 0.2, tanMax)).toBe(0);
    // Back up the face: all of it.
    expect(g.gainOnSteep(-0.02, 0.2, -0.3, 0.2, tanMax)).toBeCloseTo(0.28 * steep, 5);
    // From the far side over the bottom and up the face: only the part on the face.
    expect(g.gainOnSteep(0.1, 0.2, -0.3, 0.2, tanMax)).toBeCloseTo(0.3 * steep, 5);
    // Along the face, level: nothing, across every grid line and diagonal on the way.
    expect(g.gainOnSteep(-1.3, -2.2, -1.3, 2.4, tanMax)).toBeCloseTo(0, 6);
    // Up the apron and onto the face: the face's share, however the line is cut on the way.
    const f = face.terrain;
    expect(f.gainOnSteep(-0.4, 0.1, 0.25, 0.9, tanMax)).toBeCloseTo(0.25 * steep, 5);
    // Wholly on walkable ground: nothing, uphill or not.
    expect(f.gainOnSteep(-3, 0.1, -0.2, 1.7, tanMax)).toBe(0);
    // A line of any length adds up to the terrain's own rise, when all of it is steep and uphill.
    expect(f.gainOnSteep(0.3, -1.1, 4.7, 2.9, tanMax)).toBeCloseTo(f.heightAt(4.7, 2.9) - f.heightAt(0.3, -1.1), 4);
  });

  it('lets a body slide off a steep face and carry on up walkable ground', () => {
    let worstRise = 0;
    let tried = 0;
    for (const speed of [1.4, 3, 5.5]) {
      for (const offDeg of [0, 30, 60]) {
        // Near enough the bottom that the slowest of them is across it within the tick.
        for (const start of [0.005, 0.01, 0.02]) {
          const sim = new Simulation(gully, T);
          const watch = new InvariantWatch(sim);
          const p = sim.player;
          p.x = -start;
          p.z = 0.2;
          p.y = gully.terrain.heightAt(p.x, p.z);
          p.standingOn = -1;
          p.motor = 'ground';
          const a = (offDeg * Math.PI) / 180;
          p.vx = speed * Math.cos(a);
          p.vz = speed * Math.sin(a);
          const y0 = p.y;
          gully.terrain.sample(p.x, p.z, s);
          expect(s.slopeTan).toBeGreaterThan(tanMax);
          watch.beforeTick();
          sim.step(neutralInput(p.yaw));
          watch.afterTick();
          tried++;
          worstRise = Math.max(worstRise, p.y - y0);
          // It ends on the far side, and the motor has kept its promise.
          expect(p.x).toBeGreaterThan(0);
          expect(watch.report.first).toBeNull();
          expect(watch.report.steepGain).toBeLessThan(STEEP_TOLERANCE);
        }
      }
    }
    expect(tried).toBe(27);
    // The case is real: it rose, by far more than the tolerance, and all of it on walkable ground.
    expect(worstRise).toBeGreaterThan(4 * STEEP_TOLERANCE);
  });

  it('still catches a body that goes up a steep face, wherever its tick began', () => {
    // A motor that broke its promise, stood in for by moving the body after the tick.
    const lifted = (world: World, fromX: number, toX: number): InvariantWatch => {
      const sim = new Simulation(world, T);
      const watch = new InvariantWatch(sim);
      const p = sim.player;
      p.x = fromX;
      p.z = 0.2;
      p.y = world.terrain.heightAt(p.x, p.z);
      p.vx = p.vz = 0;
      p.standingOn = -1;
      p.motor = 'ground';
      watch.beforeTick();
      sim.step(neutralInput(p.yaw));
      p.x = toX;
      p.y = world.terrain.heightAt(p.x, p.z);
      p.motor = 'ground';
      p.standingOn = -1;
      watch.afterTick();
      return watch;
    };
    // Up the face from on it.
    expect(lifted(face, 0.5, 0.52).report.first?.what).toMatch(/ended 0\.01\d+ m higher, on ground too steep/);
    // Onto the face from the walkable apron below it: the check that charged a tick's rise to where it began never saw this.
    expect(lifted(face, -0.01, 0.02).report.first?.what).toMatch(/ended 0\.02\d+ m higher, on ground too steep/);
    // Up the last of a face and over its brow onto walkable ground (the fuzz run's NEM-4083): what it gained on the face counts.
    const brow = testWorld({ cell: 0.5, height: (x) => (x < 0 ? x * steep : x * gentle), spawn: { x: -20, z: 0 } });
    expect(lifted(brow, -0.03, 0.01).report.first?.what).toMatch(/gained 0\.02\d+ m on ground too steep/);
    // Down one face of a notch and a little way up the other, ending no higher: a slide, and no promise broken.
    const notch = testWorld({ cell: 0.5, height: (x) => Math.abs(x) * steep, spawn: { x: -20, z: 0 } });
    const slid = lifted(notch, -0.06, 0.02);
    expect(slid.report.first).toBeNull();
    expect(slid.report.seamGain).toBeCloseTo(0.02 * steep, 4);
    // And the same distances on walkable ground break nothing.
    expect(lifted(face, -0.52, -0.5).report.first).toBeNull();
  });
});

describe('the foot of a low ledge', () => {
  /**
   * The fuzz run's ROK-8470 (Nov 9): a body sliding down the last of a near-vertical face,
   * with the top of it less than a step above its feet's reach and narrower than its own
   * radius away. The terrain inside its rim was the top of the ledge, not the face, and that
   * ground fell away from the edge, so "back off downhill" pointed onto it: the body was
   * carried 1.2 m sideways and 0.43 m up in one tick, onto ground it had no way to climb to.
   */
  // A top that falls gently away from its edge at x = 0, a face 0.2 m wide and 1 m high, low ground beyond.
  const ledge = testWorld({ size: 24, cell: 0.2, height: (x) => (x <= 0 ? 1 + x * 0.06 : x >= 0.2 ? 0 : 1 - x * 5), spawn: { x: 8, z: 0.1 } });

  it('is not a way up onto it', () => {
    let tried = 0;
    for (const below of [0.46, 0.48, 0.52, 0.6]) {
      for (const z of [0.05, 0.1, 0.15]) {
        const sim = new Simulation(ledge, T);
        const watch = new InvariantWatch(sim);
        const p = sim.player;
        // On the face, with the top `below` metres above its feet: within its rim, and more than a step up.
        p.x = below / 5;
        p.z = z;
        p.y = ledge.terrain.heightAt(p.x, p.z);
        expect(1 - p.y).toBeCloseTo(below, 3);
        p.vx = p.vz = 0;
        p.standingOn = -1;
        p.motor = 'ground';
        for (let i = 0; i < 20; i++) {
          watch.beforeTick();
          sim.step(neutralInput(p.yaw));
          watch.afterTick();
          // Never onto the top, and never up.
          expect(p.x).toBeGreaterThan(0);
          expect(p.y).toBeLessThanOrEqual(1 - below + 1e-6);
        }
        tried++;
        expect(watch.report.first).toBeNull();
      }
    }
    expect(tried).toBe(12);
  });
});
