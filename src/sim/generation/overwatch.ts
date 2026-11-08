import type { GenTuning } from '../../config/tuning';
import { TWO_PI, circleDirections, datan2, dtanDeg } from '../kernel/core/detmath';
import { ColliderSet } from '../kernel/world/colliders';
import { buildGrid, Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import { GridSearch } from '../kernel/world/search';
import type { Perch } from './analysis';
import { closestOnPolyline, type PathHit } from './paths';
import type { TerrainFeatures } from './terrain';

/**
 * What D3 checks a valley for, before any camp is placed on it: that overwatch comes from
 * the ridges it placed and from a few sectors only, never a ring, and that the ways in and
 * out are real choices.
 *
 * Overwatch is found with a viewshed from the camp, by radial sweep (Haverkort, Toma and
 * Zhuang's sweep, as GRASS's r.viewshed computes it, reduced to rays): rays fan out from
 * an eye over the camp's centre, and along each the steepest slope to the ground so far is
 * the horizon. A prone shooter's eye beyond it is seen, and sees back. A perch is such a
 * point 150–560 m out that looks down into the camp at least `perchAngleDeg`: low ground
 * that only sees the fence doesn't count.
 *
 * Ways in and out are searched on the spatial grid's map layer (kernel/world/grid.ts), the
 * same cells and walk edges the simulation and lab E's navigation use, with no colliders
 * yet: the camp must be reachable on foot from several octants of the play area's edge,
 * and two routes out must stay apart (no shared chokepoint) beyond the camp's surroundings.
 */
export interface Overwatch {
  /** Perch samples in each of 16 sectors of the horizon (22.5° each, from +x toward +z). */
  sectors: number[];
  /** Sectors with perches. */
  perchSectors: number;
  /** How much of the horizon has a perch, in degrees. */
  perchArcDeg: number;
  /** Separate runs of sectors with perches, round the horizon. */
  runs: number;
  /** The widest stretch of horizon with no perch, in degrees. */
  openGapDeg: number;
  /** Placed ridges that a perch stands on. */
  ridgesSeen: number;
  ridges: number;
  /** The highest perch in each of 32 directions that has one. */
  perches: Perch[];
  /** Octants of the play area's edge from which the camp is reachable on foot. */
  access: number;
  /** Sixteenths of the edge, for the older report's field. */
  access16: number;
  /** Routes out that stay apart: 0, 1 or 2. */
  exfil: number;
  /** Share of the play area too steep to stand on. */
  steepShare: number;
  ok: boolean;
  problems: string[];
}

const RAYS = 720;
const STEP = 2.5;
const EYE = 1.6; // over the camp's centre
const PRONE = 0.6; // a prone shooter's rifle over grass

export function checkValley(hf: Heightfield, features: TerrainFeatures, gen: GenTuning): Overwatch {
  const O = gen.overwatch;
  const site = features.site;
  const ridges = features.ridges ?? [];
  const problems: string[] = [];
  const eyeY = site.height + EYE;
  const minSlope = dtanDeg(O.perchAngleDeg);
  const [near, far] = [O.perchRange[0]!, O.perchRange[1]!];
  const playHalf = hf.size / 2 - gen.world.playMargin;
  const dirs = circleDirections(RAYS);
  const sectors = new Array<number>(16).fill(0);
  const rayHas = new Uint8Array(RAYS);
  const best: Array<Perch | null> = new Array<Perch | null>(32).fill(null);
  const seenRidge = new Uint8Array(ridges.length);
  const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
  for (let k = 0; k < RAYS; k++) {
    const d = dirs[k]!;
    let horizon = -Infinity;
    for (let r = STEP; r <= far; r += STEP) {
      const x = site.x + d.x * r;
      const z = site.z + d.z * r;
      if (Math.abs(x) > playHalf || Math.abs(z) > playHalf) break;
      const ground = hf.heightAt(x, z);
      const toEye = (ground + PRONE - eyeY) / r;
      if (r >= near && toEye >= horizon && toEye >= minSlope) {
        rayHas[k] = 1;
        sectors[Math.floor((k * 16) / RAYS)]!++;
        const dir = Math.floor((k * 32) / RAYS);
        const above = ground - site.height;
        let ridge = ridges.length;
        let nearest = 160;
        for (let q = 0; q < ridges.length; q++) {
          closestOnPolyline(ridges[q]!.crest, x, z, nearest, hit);
          if (hit.dist < nearest) {
            nearest = hit.dist;
            ridge = q;
          }
        }
        if (ridge < ridges.length) seenRidge[ridge] = 1;
        const b = best[dir];
        if (!b || above > b.heightAbovePad) best[dir] = { x, y: ground, z, dir, dist: r, heightAbovePad: above, ridge };
      }
      horizon = Math.max(horizon, (ground - eyeY) / r);
    }
  }
  const perches = best.filter((p): p is Perch => p !== null);
  const perchSectors = sectors.filter((c) => c > 0).length;
  const perchArcDeg = (rayHas.reduce((a, b) => a + b, 0) * 360) / RAYS;
  let runs = 0;
  for (let s = 0; s < 16; s++) if (sectors[s]! > 0 && sectors[(s + 15) % 16]! === 0) runs++;
  if (perchSectors === 16) runs = 1;
  let gap = 0;
  let longest = 0;
  for (let k = 0; k < 2 * RAYS; k++) {
    if (rayHas[k % RAYS]) gap = 0;
    else longest = Math.max(longest, Math.min(RAYS, ++gap));
  }
  const openGapDeg = (longest * 360) / RAYS;
  const ridgesSeen = seenRidge.reduce((a, b) => a + b, 0);

  // --- Ways in and out, on the map layer of the spatial grid (no colliders yet). ------
  const empty = new ColliderSet(hf.size);
  empty.build();
  const map = buildGrid(hf, empty, { minX: site.x - 1, minZ: site.z - 1, maxX: site.x + 1, maxZ: site.z + 1 }, gen).map;
  const { access, access16, exfil, steepShare } = waysInAndOut(map, site, playHalf, gen);

  if (ridges.length > 0 && ridgesSeen < ridges.length) problems.push(`only ${ridgesSeen} of ${ridges.length} ridges overlook the camp`);
  if (perchArcDeg > O.maxPerchArcDeg) problems.push(`perches over ${Math.round(perchArcDeg)}° of the horizon (at most ${O.maxPerchArcDeg}°)`);
  if (openGapDeg < O.minOpenGapDeg) problems.push(`the widest open horizon is ${Math.round(openGapDeg)}° (at least ${O.minOpenGapDeg}°)`);
  if (perchSectors === 0) problems.push('no perch overlooks the camp');
  if (access < O.minAccess) problems.push(`the camp is reachable on foot from ${access} of 8 directions (at least ${O.minAccess})`);
  if (exfil < 2) problems.push(exfil === 0 ? 'no way out of the camp on foot' : 'the ways out share a chokepoint');
  return {
    sectors,
    perchSectors,
    perchArcDeg,
    runs,
    openGapDeg,
    ridgesSeen,
    ridges: ridges.length,
    perches,
    access,
    access16,
    exfil,
    steepShare,
    ok: problems.length === 0,
    problems,
  };
}

/**
 * From the camp out to the play area's edge on foot: which octants (and sixteenths) are
 * reached, and whether a second route out exists that keeps `exfilSeparation` metres from
 * the first once both are `exfilFree` from the camp, so no single chokepoint closes both.
 */
function waysInAndOut(map: GridLayer, site: { x: number; z: number }, playHalf: number, gen: GenTuning): { access: number; access16: number; exfil: number; steepShare: number } {
  const O = gen.overwatch;
  const search = new GridSearch(map);
  const start = cellIndex(map, site.x, site.z);
  const centre = (c: number): { x: number; z: number } => ({ x: map.x0 + ((c % map.nx) + 0.5) * map.cell, z: map.z0 + (Math.floor(c / map.nx) + 0.5) * map.cell });
  const inside = (c: number): boolean => {
    const p = centre(c);
    return Math.abs(p.x) <= playHalf && Math.abs(p.z) <= playHalf;
  };
  /** A cell in the outermost band of the play area: where approaches start and routes out end. */
  const isEdgeCell = (c: number): boolean => {
    const p = centre(c);
    return inside(c) && (Math.abs(p.x) >= playHalf - map.cell || Math.abs(p.z) >= playHalf - map.cell);
  };
  // Within the play area only: the edge is where approaches start.
  const bounded = (_from: number, to: number, length: number): number => (inside(to) ? length : -1);
  let steep = 0;
  let total = 0;
  for (let c = 0; c < map.flags.length; c++) {
    if (!inside(c)) continue;
    total++;
    if ((map.flags[c]! & Cell.Walkable) === 0) steep++;
  }
  const budget = map.nx * map.nz;
  search.flood([start], { maxExpansions: budget, cost: bounded });
  const octants = new Uint8Array(8);
  const sixteenths = new Uint8Array(16);
  let first = -1;
  let firstCost = Infinity;
  for (let c = 0; c < map.flags.length; c++) {
    const cost = search.cost[c]!;
    if (cost < 0 || !isEdgeCell(c)) continue;
    const p = centre(c);
    const a = datan2(p.z - site.z, p.x - site.x);
    const t = (a < 0 ? a + TWO_PI : a) / TWO_PI;
    octants[Math.min(7, Math.floor(t * 8))] = 1;
    sixteenths[Math.min(15, Math.floor(t * 16))] = 1;
    if (cost < firstCost) {
      firstCost = cost;
      first = c;
    }
  }
  const access = octants.reduce((a, b) => a + b, 0);
  const access16 = sixteenths.reduce((a, b) => a + b, 0);
  if (first < 0) return { access, access16, exfil: 0, steepShare: total > 0 ? steep / total : 0 };
  // The first route out, and the cells near it beyond the camp's surroundings.
  const route: number[] = [];
  for (let c = first; c >= 0; c = search.parent[c]!) route.push(c);
  const closed = new Uint8Array(map.flags.length);
  const reach = Math.ceil(O.exfilSeparation / map.cell);
  for (const c of route) {
    const p = centre(c);
    if ((p.x - site.x) * (p.x - site.x) + (p.z - site.z) * (p.z - site.z) < O.exfilFree * O.exfilFree) continue;
    const ci = c % map.nx;
    const cj = Math.floor(c / map.nx);
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        if (di * di + dj * dj > reach * reach) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < map.nx && j < map.nz) closed[j * map.nx + i] = 1;
      }
    }
  }
  search.flood([start], { maxExpansions: budget, cost: (_from, to, length) => (closed[to] || !inside(to) ? -1 : length) });
  let second = false;
  for (let c = 0; c < map.flags.length && !second; c++) if (search.cost[c]! >= 0 && isEdgeCell(c)) second = true;
  return { access, access16, exfil: second ? 2 : 1, steepShare: total > 0 ? steep / total : 0 };
}
