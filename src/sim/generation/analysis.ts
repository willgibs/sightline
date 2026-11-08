import type { Site } from './site';
import type { GenTuning } from '../../config/tuning';
import { circleDirections, dtanDeg } from '../kernel/core/detmath';
import { Blocks, type ColliderSet, type RayHit } from '../kernel/world/colliders';
import type { Heightfield } from '../kernel/world/heightfield';

/**
 * Reads a generated valley the way a sniper would: where are the overwatch perches, and
 * can the camp be reached on foot from enough directions? The results drive validation
 * (re-roll a valley that fails) and the debug overlay. This grows into the seed explorer
 * and the full camp analysis in Phase 1 (lab D).
 */

export interface Perch {
  x: number;
  y: number;
  z: number;
  /** Direction index out of DIRECTIONS. */
  dir: number;
  /** Horizontal distance to the camp centre. */
  dist: number;
  heightAbovePad: number;
  /** Which overwatch ridge (contiguous run of directions) this perch belongs to. */
  ridge: number;
}

export interface TerrainReport {
  perches: Perch[];
  /** Contiguous runs of directions with a valid perch. */
  ridges: number;
  /** Of 8 compass sectors (45° each), how many hold at least one perch. */
  overwatchSectors: number;
  /** Of 16 compass sectors, how many reach the camp on foot from the play-area edge. */
  accessSectors: number;
  /** Share of the play area too steep to walk. */
  steepShare: number;
  ok: boolean;
  problems: string[];
}

export const DIRECTIONS = 32;
const PERCH_MIN_HEIGHT = 12;
const PERCH_RANGE: [number, number] = [150, 500];
const EYE = 0.6; // a prone shooter's rifle over grass

/** Checks a valley for its camp at `site`: perches that overlook it, and approaches to it on foot. */
export function analyzeTerrain(hf: Heightfield, colliders: ColliderSet, gen: GenTuning, site: Site): TerrainReport {
  const padH = site.height;
  const problems: string[] = [];
  const dirs = circleDirections(DIRECTIONS);
  const target = { x: site.x, y: padH + 1.4, z: site.z }; // chest height at the camp centre
  const hit: RayHit = { dist: Infinity, id: -1 };

  // --- Perches: the highest point along each direction that can see the camp. -------
  const best: Array<Perch | null> = [];
  for (let d = 0; d < DIRECTIONS; d++) {
    const dir = dirs[d]!;
    let found: Perch | null = null;
    for (let r = PERCH_RANGE[0]; r <= PERCH_RANGE[1]; r += 10) {
      const x = site.x + dir.x * r;
      const z = site.z + dir.z * r;
      const ground = hf.heightAt(x, z);
      const above = ground - padH;
      if (above < PERCH_MIN_HEIGHT || (found && above <= found.heightAbovePad)) continue;
      const ey = ground + EYE;
      const vx = target.x - x;
      const vy = target.y - ey;
      const vz = target.z - z;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const dx = vx / len;
      const dy = vy / len;
      const dz = vz / len;
      // Start a little forward so the shooter's own patch of ground doesn't count.
      const t0 = 1.5;
      const ox = x + dx * t0;
      const oy = ey + dy * t0;
      const oz = z + dz * t0;
      const reach = len - t0 - 1;
      if (hf.raycast(ox, oy, oz, dx, dy, dz, reach) < reach) continue;
      colliders.raycast(ox, oy, oz, dx, dy, dz, reach, Blocks.Sight, hit);
      if (hit.id >= 0) continue;
      found = { x, y: ground, z, dir: d, dist: r, heightAbovePad: above, ridge: -1 };
    }
    best.push(found);
  }

  // Group neighbouring directions into ridges.
  let ridges = 0;
  const start = best.findIndex((p) => p === null);
  if (start === -1) {
    ridges = 1;
    for (const p of best) p!.ridge = 0;
  } else {
    let inRun = false;
    for (let k = 1; k <= DIRECTIONS; k++) {
      const p = best[(start + k) % DIRECTIONS];
      if (p) {
        if (!inRun) {
          ridges++;
          inRun = true;
        }
        p.ridge = ridges - 1;
      } else {
        inRun = false;
      }
    }
  }
  const perches = best.filter((p): p is Perch => p !== null);
  const sectorHasPerch = new Uint8Array(8);
  for (const p of perches) sectorHasPerch[Math.floor(p.dir / (DIRECTIONS / 8))] = 1;
  const overwatchSectors = sectorHasPerch.reduce((a, b) => a + b, 0);

  // --- Access: flood the walkable cells outward from the camp. -----------------------
  const { cells, n, heights, cell } = hf;
  const maxTan = dtanDeg(gen.walkableSlopeDeg);
  const walk = new Uint8Array(cells * cells);
  const playHalf = hf.size / 2 - gen.world.playMargin;
  let steep = 0;
  let inPlay = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const k = j * n + i;
      const h00 = heights[k]!;
      const h10 = heights[k + 1]!;
      const h01 = heights[k + n]!;
      const h11 = heights[k + n + 1]!;
      const a = Math.sqrt((h10 - h00) * (h10 - h00) + (h11 - h10) * (h11 - h10)) / cell;
      const b = Math.sqrt((h11 - h01) * (h11 - h01) + (h01 - h00) * (h01 - h00)) / cell;
      const ok = a <= maxTan && b <= maxTan;
      walk[j * cells + i] = ok ? 1 : 0;
      const cx = hf.coord(i) + cell / 2;
      const cz = hf.coord(j) + cell / 2;
      if (Math.abs(cx) <= playHalf && Math.abs(cz) <= playHalf) {
        inPlay++;
        if (!ok) steep++;
      }
    }
  }
  const seen = new Uint8Array(cells * cells);
  const queue = new Int32Array(cells * cells);
  let head = 0;
  let tail = 0;
  // From the cell under the site's centre.
  const i0 = Math.max(0, Math.min(cells - 1, Math.floor((site.x - hf.min) / cell)));
  const j0 = Math.max(0, Math.min(cells - 1, Math.floor((site.z - hf.min) / cell)));
  queue[tail++] = j0 * cells + i0;
  seen[j0 * cells + i0] = 1;
  const sectorDirs = circleDirections(16);
  const sectors = new Uint8Array(16);
  while (head < tail) {
    const idx = queue[head++]!;
    const i = idx % cells;
    const j = (idx - i) / cells;
    const cx = hf.coord(i) + cell / 2;
    const cz = hf.coord(j) + cell / 2;
    if (Math.abs(cx) >= playHalf || Math.abs(cz) >= playHalf) {
      let bestDot = -2;
      let bestS = 0;
      for (let s = 0; s < 16; s++) {
        const dot = (cx - site.x) * sectorDirs[s]!.x + (cz - site.z) * sectorDirs[s]!.z;
        if (dot > bestDot) {
          bestDot = dot;
          bestS = s;
        }
      }
      sectors[bestS] = 1;
      continue; // the edge of the play area is where approaches start
    }
    const nbrs = [idx - 1, idx + 1, idx - cells, idx + cells];
    const ok = [i > 0, i < cells - 1, j > 0, j < cells - 1];
    for (let q = 0; q < 4; q++) {
      if (!ok[q]) continue;
      const m = nbrs[q]!;
      if (seen[m] || !walk[m]) continue;
      seen[m] = 1;
      queue[tail++] = m;
    }
  }
  const accessSectors = sectors.reduce((a, b) => a + b, 0);

  if (overwatchSectors < 3) problems.push(`overwatch from only ${overwatchSectors} of 8 directions (need 3)`);
  if (accessSectors < 4) problems.push(`camp reachable from only ${accessSectors} of 16 directions (need 4)`);

  return {
    perches,
    ridges,
    overwatchSectors,
    accessSectors,
    steepShare: inPlay > 0 ? steep / inPlay : 0,
    ok: problems.length === 0,
    problems,
  };
}
