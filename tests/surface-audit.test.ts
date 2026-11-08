import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { buildTerrain } from '../src/render/worldMeshes';
import { palette } from '../src/render/palette';
import { arenaWorld } from '../src/sim/game/scenes/movementLab';
import { generateWorld } from '../src/sim/generation';
import { missionSpec } from '../src/sim/kernel/mission';
import { SURFACE_NAMES } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';

/**
 * C7: every terrain cell's surface tag matches what's drawn there, the bug Hunt: Showdown
 * shipped as silent footsteps from mis-tagged surfaces. Every surface has its own colour,
 * every vertex wears the colour of its tag.
 */

const noLook = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSkyAmbient: { value: new THREE.Color() }, uGroundAmbient: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 } } as never;

/** How many of a world's terrain vertices are drawn in anything but their tag's colour. */
function audit(world: World): { vertices: number; wrong: number } {
  const hf = world.terrain;
  const group = buildTerrain(world, noLook);
  let vertices = 0;
  let wrong = 0;
  const colors = SURFACE_NAMES.map((s) => new THREE.Color(palette.surface[s]));
  group.traverse((m) => {
    const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    const pos = g.getAttribute('position');
    const tint = g.getAttribute('aTint');
    if (!pos || !tint) return;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const i = Math.round((x - hf.coord(0)) / hf.cell);
      const j = Math.round((z - hf.coord(0)) / hf.cell);
      const tag = hf.surfaces[j * hf.n + i]!;
      const want = colors[tag]!;
      vertices++;
      if (Math.abs(tint.getX(v) - want.r) > 1e-6 || Math.abs(tint.getY(v) - want.g) > 1e-6 || Math.abs(tint.getZ(v) - want.b) > 1e-6) wrong++;
    }
  });
  return { vertices, wrong };
}

describe('the surface audit (C7)', () => {
  it('gives every surface a colour of its own', () => {
    const seen = new Set<string>();
    for (const s of SURFACE_NAMES) {
      expect(palette.surface[s]).toBeDefined();
      expect(seen.has(palette.surface[s])).toBe(false);
      seen.add(palette.surface[s]);
    }
  });

  it('draws every cell in the colour of its tag', () => {
    for (const world of [arenaWorld(T), generateWorld(missionSpec('TAL-4471'), T)]) {
      const r = audit(world);
      expect(r.vertices).toBeGreaterThan(1000);
      expect(r.wrong).toBe(0);
    }
  });
});
