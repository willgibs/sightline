import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/kernel/core/rng';
import { Blocks, ColliderSet, pushOutCircle, rayCollider, type RayHit } from '../src/sim/kernel/world/colliders';
import { Heightfield, makeTerrainSample } from '../src/sim/kernel/world/heightfield';
import { Surface } from '../src/sim/kernel/world/surfaces';

function plane(size: number, cell: number, f: (x: number, z: number) => number): Heightfield {
  const hf = new Heightfield(size, cell);
  for (let j = 0; j < hf.n; j++) for (let i = 0; i < hf.n; i++) hf.heights[j * hf.n + i] = f(hf.coord(i), hf.coord(j));
  hf.finalize();
  return hf;
}

describe('Heightfield', () => {
  it('samples a tilted plane exactly, with its gradient', () => {
    const hf = plane(100, 2.5, (x, z) => 0.2 * x - 0.1 * z + 3);
    const s = makeTerrainSample();
    for (const [x, z] of [
      [0, 0],
      [12.3, -7.7],
      [-31.1, 40.2],
    ] as const) {
      hf.sample(x, z, s);
      expect(s.height).toBeCloseTo(0.2 * x - 0.1 * z + 3, 5);
      expect(s.gx).toBeCloseTo(0.2, 5);
      expect(s.gz).toBeCloseTo(-0.1, 5);
    }
  });

  it('interpolates on the same triangles the renderer draws', () => {
    // One raised vertex: its cell's two triangles meet along the (i, j)–(i+1, j+1) diagonal.
    const hf = plane(10, 1, () => 0);
    const i = 5;
    const j = 5;
    hf.heights[(j + 1) * hf.n + (i + 1)] = 4;
    hf.finalize();
    const x0 = hf.coord(i);
    const z0 = hf.coord(j);
    // Off the diagonal, on the upper triangle (u > v): h = v * h11.
    expect(hf.heightAt(x0 + 0.75, z0 + 0.25)).toBeCloseTo(1, 6);
    // On the lower triangle (u < v): h = u * h11.
    expect(hf.heightAt(x0 + 0.25, z0 + 0.75)).toBeCloseTo(1, 6);
    expect(hf.heightAt(x0 + 0.5, z0 + 0.5)).toBeCloseTo(2, 6);
  });

  it('raycasts a plane exactly', () => {
    const hf = plane(200, 2.5, () => 5);
    const d = Math.SQRT1_2;
    const t = hf.raycast(0, 15, 0, d, -d, 0, 100);
    expect(t).toBeCloseTo(10 * Math.SQRT2, 6);
    expect(hf.raycast(0, 15, 0, 1, 0, 0, 500)).toBe(Infinity);
  });

  it('agrees with brute-force marching on rough terrain', () => {
    const hf = plane(300, 2.5, (x, z) => 8 * Math.sin(x / 13) * Math.cos(z / 9) + 0.05 * x);
    const r = new Rng('rays');
    let compared = 0;
    for (let k = 0; k < 200; k++) {
      const ox = r.range(-120, 120);
      const oz = r.range(-120, 120);
      const oy = hf.heightAt(ox, oz) + r.range(1, 20);
      const dir = r.unit2();
      const dy = r.range(-0.4, 0.05);
      const len = Math.sqrt(dir.x * dir.x + dy * dy + dir.z * dir.z);
      const dx = dir.x / len;
      const dz = dir.z / len;
      const ndy = dy / len;
      const t = hf.raycast(ox, oy, oz, dx, ndy, dz, 200);
      // March in 1 cm steps and find the first point under the surface.
      let march = Infinity;
      for (let s = 0; s <= 200; s += 0.01) {
        const x = ox + dx * s;
        const z = oz + dz * s;
        if (!hf.inside(x, z)) break;
        if (oy + ndy * s <= hf.heightAt(x, z)) {
          march = s;
          break;
        }
      }
      if (march === Infinity) {
        expect(t).toBe(Infinity);
      } else {
        expect(Math.abs(t - march)).toBeLessThan(0.02);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(50);
  });
});

describe('Colliders', () => {
  const rotated = (ux: number, uz: number) => ({
    kind: 'box' as const,
    x: 10,
    z: 0,
    y0: 0,
    y1: 3,
    hx: 2,
    hz: 1,
    ux,
    uz,
    flags: Blocks.All,
    surface: Surface.Wood,
  });

  it('hits an axis-aligned box face on', () => {
    const t = rayCollider({ ...rotated(1, 0), id: 0 }, 0, 1, 0, 1, 0, 0);
    expect(t).toBeCloseTo(8, 9);
  });

  it('hits a rotated box', () => {
    // Rotated 90°: the box's long side now runs along z, so its near face is 1 m from centre.
    const t = rayCollider({ ...rotated(0, 1), id: 0 }, 0, 1, 0, 1, 0, 0);
    expect(t).toBeCloseTo(9, 9);
  });

  it('misses over the top and hits a cylinder', () => {
    expect(rayCollider({ ...rotated(1, 0), id: 0 }, 0, 4, 0, 1, 0, 0)).toBe(-1);
    const cyl = { kind: 'cyl' as const, id: 0, x: 5, z: 0, y0: 0, y1: 2, r: 0.5, flags: Blocks.All, surface: Surface.Wood };
    expect(rayCollider(cyl, 0, 1, 0, 1, 0, 0)).toBeCloseTo(4.5, 9);
  });

  it('pushes a circle out of a box along the shortest way', () => {
    const box = { ...rotated(1, 0), id: 0 };
    const out = { x: 0, z: 0 };
    expect(pushOutCircle(box, 12.2, 0, 0.3, out)).toBe(true); // overlapping the +x face
    expect(out.x).toBeCloseTo(0.1, 9);
    expect(out.z).toBeCloseTo(0, 9);
    expect(pushOutCircle(box, 10.5, 0.9, 0.3, out)).toBe(true); // centre inside, near the +z face
    expect(out.z).toBeCloseTo(0.4, 9);
    expect(pushOutCircle(box, 15, 0, 0.3, out)).toBe(false);
  });

  it('finds the nearest collider through the grid and respects masks', () => {
    const set = new ColliderSet(200);
    set.add({ kind: 'cyl', x: 30, z: 0, y0: 0, y1: 3, r: 0.5, flags: Blocks.Sight, surface: Surface.Grass }); // a bush
    set.add({ kind: 'box', x: 50, z: 0, y0: 0, y1: 3, hx: 1, hz: 1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
    set.add({ kind: 'box', x: 80, z: 0, y0: 0, y1: 3, hx: 1, hz: 1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
    set.build();
    const hit: RayHit = { dist: 0, id: -1 };
    set.raycast(0, 1, 0, 1, 0, 0, 100, Blocks.Bullet, hit);
    expect(hit.id).toBe(1);
    expect(hit.dist).toBeCloseTo(49, 9);
    set.raycast(0, 1, 0, 1, 0, 0, 100, Blocks.Sight, hit);
    expect(hit.id).toBe(0);
    set.raycast(0, 1, 0, 1, 0, 0, 40, Blocks.Bullet, hit);
    expect(hit.id).toBe(-1);
    const ids: number[] = [];
    set.query(45, -5, 55, 5, ids);
    expect(ids).toEqual([1]);
  });
});
