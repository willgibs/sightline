import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import { Solids } from '../src/sim/kernel/world/solids';
import { drawnLit, groundLight, shadeMap } from '../src/sim/perception';
import { labWorld } from '../src/sim/game/scenes/perceptionLab';

/**
 * Shade, drawn as simulated (A4): the renderer draws the ground's shade from a map of
 * `groundLight` at texel centres, read the way the terrain shader reads it. At sampled
 * points the drawing agrees with the simulation 99.5% of the time across the area, and
 * in the band round every shadow, where a texel's reach is all that can differ.
 */
describe('the drawn shade', () => {
  const world = labWorld(T);
  const solids = new Solids(world.colliders);
  const env = world.spec.env;
  const area = world.shadeArea!;
  const map = shadeMap(world, solids, env, 0, area, T);
  const simLit = (x: number, z: number): boolean => groundLight(world, solids, env, 0, x, world.terrain.heightAt(x, z), z, T) === T.visibility.light.lit;

  it('agrees with the simulation at 99.5% of points over the area', () => {
    const rng = new Rng('SHADE-0001', 'points');
    let agree = 0;
    const n = 20000;
    for (let k = 0; k < n; k++) {
      const x = rng.range(area.x0, area.x1);
      const z = rng.range(area.z0, area.z1);
      if (drawnLit(map, x, z) === simLit(x, z)) agree++;
    }
    expect(agree / n).toBeGreaterThanOrEqual(0.995);
  });

  it('agrees round every shadow, where the drawing and the simulation could part', () => {
    // Points within 1.5 m of a shaded texel: the edges, where a texel's size is all that differs.
    const shaded: number[] = [];
    for (let k = 0; k < map.lit.length; k++) if (map.lit[k] === 0) shaded.push(k);
    expect(shaded.length).toBeGreaterThan(500);
    const rng = new Rng('SHADE-0002', 'edges');
    let agree = 0;
    let inShade = 0;
    const n = 6000;
    for (let k = 0; k < n; k++) {
      const c = shaded[rng.int(0, shaded.length - 1)]!;
      const x = map.x0 + ((c % map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
      const z = map.z0 + (Math.floor(c / map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
      const sim = simLit(x, z);
      if (!sim) inShade++;
      if (drawnLit(map, x, z) === sim) agree++;
    }
    expect(inShade).toBeGreaterThan(n / 3);
    expect(agree / n).toBeGreaterThanOrEqual(0.95);
  });
});

describe('fog', () => {
  it("grows with distance from the eye, not depth along the view, so a guard's contrast holds as you turn", async () => {
    const THREE = await import('three');
    await import('../src/render/materials');
    expect(THREE.ShaderChunk.fog_vertex).toContain('length( mvPosition.xyz )');
    expect(THREE.ShaderChunk.fog_vertex).not.toContain('- mvPosition.z');
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/render/materials.ts', 'src/render/terrainMaterial.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/=\s*-mv\.z/);
  });
});
