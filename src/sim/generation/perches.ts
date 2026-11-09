import type { GenTuning } from '../../config/tuning';
import { circleDirections, datan2, dcos, dsin, dtanDeg } from '../kernel/core/detmath';
import { cellIndex, type GridLayer } from '../kernel/world/grid';
import { makeTerrainSample, type Heightfield } from '../kernel/world/heightfield';
import { GridSearch } from '../kernel/world/search';
import type { Site } from './site';
import { canopyTop, type Canopy } from './props';
import { frameOf, lineOfSight, type Raster } from './raster';

/**
 * Perches (D7): the places a sniper might lie and look down into the camp, as a finite
 * list, so a rule like "no single perch wins" can be checked over every one of them.
 *
 * The list comes from a radial sweep from the camp's eye (as D3's checks do): every prone
 * shooter's eye 150–560 m out that clears the terrain's horizon, looks down into the camp,
 * and can be walked to from it is a candidate (tree crowns count as ground here, a shooter's
 * view being stopped by them: props.ts, Canopy), and candidates are thinned to one per
 * `perchSpacing` metres, the steepest view kept. Up to `perches` of them, the steepest
 * first, wherever they are.
 *
 * Each perch then gets a viewshed over the analysis raster: rays fanned from its eye across
 * the camp, marched over the terrain and into the raster, where everything that stops sight
 * counts as a solid column (a ray from a ridge comes down onto a roof, never under it). A
 * cell's value is the lowest height that perch can see there: a guard whose chest is above
 * it is in the perch's view.
 */
export interface PerchSpot {
  x: number;
  y: number;
  z: number;
  /** The shooter's eye: prone on the ground. */
  eye: number;
  dist: number;
  heightAbovePad: number;
}

export function findPerches(hf: Heightfield, site: Site, gen: GenTuning, map: GridLayer, canopy: Canopy, start: { x: number; z: number } = site): PerchSpot[] {
  const O = gen.overwatch;
  const A = gen.analysis;
  const eyeY = site.height + 1.6;
  const minSlope = dtanDeg(O.perchAngleDeg);
  // A body lies only where the motor will hold it, and where it can walk to: on a wall's
  // crest there's a cell or two flat enough to lie on and no way up to them.
  const maxTan = dtanDeg(A.perchSlopeDeg);
  const under = makeTerrainSample();
  const walk = new GridSearch(map);
  walk.flood([cellIndex(map, start.x, start.z)], { maxExpansions: map.nx * map.nz });
  const reachable = (x: number, z: number): boolean => {
    const c = cellIndex(map, x, z);
    return c >= 0 && walk.cost[c]! >= 0;
  };
  const [near, far] = [O.perchRange[0]!, O.perchRange[1]!];
  const playHalf = hf.size / 2 - gen.world.playMargin;
  const rays = 720;
  const dirs = circleDirections(rays);
  const buckets = new Map<number, PerchSpot>();
  const bucketSize = A.perchSpacing;
  for (let k = 0; k < rays; k++) {
    const d = dirs[k]!;
    let horizon = -Infinity;
    for (let r = 2.5; r <= far; r += 2.5) {
      const x = site.x + d.x * r;
      const z = site.z + d.z * r;
      if (Math.abs(x) > playHalf || Math.abs(z) > playHalf) break;
      const ground = hf.heightAt(x, z);
      const toEye = (ground + gen.sight.proneEye - eyeY) / r;
      if (r >= near && toEye >= horizon && toEye >= minSlope && hf.sample(x, z, under).slopeTan <= maxTan && reachable(x, z)) {
        const key = Math.floor(x / bucketSize) * 4096 + Math.floor(z / bucketSize);
        const spot = { x, y: ground, z, eye: ground + gen.sight.proneEye, dist: r, heightAbovePad: ground - site.height };
        const old = buckets.get(key);
        if (!old || toEye > (old.eye - eyeY) / old.dist) buckets.set(key, spot);
      }
      horizon = Math.max(horizon, (ground - eyeY) / r);
      // Crowns are narrow: they're read more often than the ground.
      for (let s = r; s < r + 2.5; s += canopy.cell / 2) {
        const stops = canopyTop(canopy, site.x + d.x * s, site.z + d.z * s);
        if (stops !== -Infinity) horizon = Math.max(horizon, (stops - eyeY) / s);
      }
    }
  }
  // The steepest views first; ties by place, so the order is the same everywhere.
  const all = [...buckets.values()].sort((p, q) => (q.eye - eyeY) / q.dist - (p.eye - eyeY) / p.dist || p.x - q.x || p.z - q.z);
  const kept: PerchSpot[] = [];
  for (const p of all) {
    if (kept.length >= A.perches) break;
    if (kept.some((q) => (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z) < bucketSize * bucketSize)) continue;
    kept.push(p);
  }
  return kept;
}

/**
 * A perch's viewshed over the raster: for each cell, the lowest height (absolute) its eye
 * sees there, or Infinity where it sees nothing.
 */
export function perchViewshed(R: Raster, hf: Heightfield, p: PerchSpot): Float32Array {
  const cells = R.na * R.nb;
  const minVis = new Float32Array(cells).fill(Infinity);
  const e = frameOf(R, p.x, p.z);
  // The raster's corners as angles from the perch, in the camp's frame.
  const corners = [
    [R.a0, R.b0],
    [R.a0 + R.na * R.cell, R.b0],
    [R.a0, R.b0 + R.nb * R.cell],
    [R.a0 + R.na * R.cell, R.b0 + R.nb * R.cell],
  ];
  const centre = datan2(-e.b, -e.a);
  let lo = 0;
  let hi = 0;
  let farthest = 0;
  for (const [a, b] of corners) {
    let off = datan2(b! - e.b, a! - e.a) - centre;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off < -Math.PI) off += 2 * Math.PI;
    lo = Math.min(lo, off);
    hi = Math.max(hi, off);
    farthest = Math.max(farthest, Math.sqrt((a! - e.a) * (a! - e.a) + (b! - e.b) * (b! - e.b)));
  }
  const rays = Math.ceil(((hi - lo) * farthest) / R.cell);
  const minA = R.a0;
  const maxA = R.a0 + R.na * R.cell;
  const minB = R.b0;
  const maxB = R.b0 + R.nb * R.cell;
  for (let r = 0; r <= rays; r++) {
    const angle = centre + lo + ((hi - lo) * r) / rays;
    const ca = dcos(angle);
    const cb = dsin(angle);
    // World direction of this ray, for the terrain outside the raster.
    const wx = ca * R.ux + cb * R.vx;
    const wz = ca * R.uz + cb * R.vz;
    let horizon = -Infinity;
    let d = 2.5;
    let last = -1;
    while (d <= farthest + 2) {
      const a = e.a + ca * d;
      const b = e.b + cb * d;
      const inside = a >= minA && a < maxA && b >= minB && b < maxB;
      if (!inside) {
        horizon = Math.max(horizon, (hf.heightAt(p.x + wx * d, p.z + wz * d) - p.eye) / d);
        // Crowns are narrow: they're read more often than the ground.
        const stride = R.cell * 2.5;
        for (let s = d; s < d + stride; s += R.canopy.cell / 2) {
          const stops = canopyTop(R.canopy, p.x + wx * s, p.z + wz * s);
          if (stops !== -Infinity) horizon = Math.max(horizon, (stops - p.eye) / s);
        }
        d += stride;
        continue;
      }
      const i = Math.floor((a - R.a0) / R.cell);
      const j = Math.floor((b - R.b0) / R.cell);
      const c = j * R.na + i;
      if (c !== last) {
        last = c;
        const vis = p.eye + horizon * d;
        if (vis < minVis[c]!) minVis[c] = vis;
        const block = R.lo[c]! <= R.hi[c]! ? Math.max(R.top[c]!, R.hi[c]!) : R.top[c]!;
        horizon = Math.max(horizon, (block - p.eye) / d);
      }
      d += R.cell * 0.5;
    }
  }
  return minVis;
}

/** The perches and each one's viewshed: what's known of a camp's overlooks before it has guards. */
export interface PerchViews {
  spots: PerchSpot[];
  views: Float32Array[];
}

export function perchViews(R: Raster, hf: Heightfield, site: Site, gen: GenTuning, map: GridLayer, start: { x: number; z: number } = site): PerchViews {
  const spots = findPerches(hf, site, gen, map, R.canopy, start);
  return { spots, views: spots.map((p) => perchViewshed(R, hf, p)) };
}

/**
 * Which perches are overviews: those that see at least `overviewShare` of the camp's ground
 * inside the fence, at chest height. These are the perches that will see many guards, so
 * the things a shooter shouldn't be able to reach, and the target's walk, are placed against
 * them (compound.ts, staffing.ts).
 */
export function overviewPerches(R: Raster, views: readonly Float32Array[], halfA: number, halfB: number, gen: GenTuning): boolean[] {
  const inside: number[] = [];
  for (let c = 0; c < R.na * R.nb; c++) {
    if (!R.walk[c]) continue;
    const i = c % R.na;
    const j = (c - i) / R.na;
    const a = R.a0 + (i + 0.5) * R.cell;
    const b = R.b0 + (j + 0.5) * R.cell;
    if (Math.abs(a) <= halfA - 1 && Math.abs(b) <= halfB - 1) inside.push(c);
  }
  return views.map((v) => {
    let n = 0;
    for (const c of inside) if (R.ground[c]! + gen.sight.chest >= v[c]!) n++;
    return inside.length > 0 && n >= gen.compound.overviewShare * inside.length;
  });
}

/**
 * Whether a perch sees a point on a tower's deck. The viewshed counts a roof as hiding what's
 * under it, which is right for a building but not for a tower's open sides, so this takes
 * the line itself: clear through the raster (its slabs and tops), and over the ground all
 * the way from the perch.
 */
export function perchSeesDeck(R: Raster, hf: Heightfield, p: PerchSpot, x: number, y: number, z: number): boolean {
  if (!lineOfSight(R, p.x, p.eye, p.z, x, y, z)) return false;
  const dx = x - p.x;
  const dy = y - p.eye;
  const dz = z - p.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (hf.raycast(p.x, p.eye, p.z, dx / d, dy / d, dz / d, d) < d - 0.5) return false;
  // The crowns on the way: most of the line is high above them, so a walk along it is cheap.
  for (let s = 0; s < d; s += R.canopy.cell / 2) if (p.eye + (dy * s) / d < canopyTop(R.canopy, p.x + (dx * s) / d, p.z + (dz * s) / d)) return false;
  return true;
}
