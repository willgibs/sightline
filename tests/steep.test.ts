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
