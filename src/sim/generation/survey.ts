import type { World } from '../kernel/world/world';
import type { GuardRole, StructureKind } from './camp';
import { pointAt, type Point2 } from './paths';
import type { Site } from './site';

/**
 * A survey of a generated world: what the seed explorer draws (app/explore.ts) and the
 * seed report reads. Plain data, small enough to post from a worker: the terrain
 * downsampled, the camp's structures as footprints, its guards and their routes, the
 * perches and the validation results. Each of lab D's milestones adds its layer here, so
 * the explorer shows every analysis the generator runs: the ridges' viewsheds (D3), the
 * camp's modules and systems (D4, D5), coverage and idleness, the sightline graph, perch
 * scores and approach paths (D7), and what repair did (D8).
 */
export interface Survey {
  seed: string;
  /** Whole-world re-rolls before the camp passed (Phase 0's valley); D counts camp attempts and repairs on top. */
  attempt: number;
  ok: boolean;
  problems: string[];
  /** Named numbers from validation, for the card and for sorting: overwatch sectors, access, and so on. */
  stats: Record<string, number>;
  terrain: SurveyTerrain;
  road: Point2[];
  creek: Point2[];
  site: Site;
  structures: SurveyStructure[];
  guards: SurveyGuard[];
  perches: SurveyPerch[];
  /** The play area's half-size: the square a player can walk in. */
  playHalf: number;
  /** Terrain with teeth only (D3): each ridge's crest and gullies, and the creek's fords. */
  ridges?: Array<{ crest: Point2[]; gullies: Point2[] }>;
  fords?: Point2[];
  /** Generated camps only (D4): doors, vehicles, and the skeleton laid before the fill. */
  doors?: Array<{ x: number; z: number; ux: number; uz: number; width: number }>;
  vehicles?: Array<{ corners: Point2[]; escape: boolean }>;
  skeleton?: { corridor: Point2[]; escape: Point2[]; exfil: Point2[][]; sabotage: Point2; target: Point2 };
}

export interface SurveyTerrain {
  /** Side of the square the samples cover, metres, centred on the origin. */
  size: number;
  /** Samples per side. */
  n: number;
  /** Heights above the camp's pad, row by row (z, then x). */
  heights: Float32Array;
}

/** A structure's footprint: each collider as a polygon in the ground plane, with its top. */
export interface SurveyStructure {
  kind: StructureKind;
  /** Boxes as their four corners; cylinders as a centre and radius. */
  shapes: Array<{ corners: Point2[]; top: number } | { x: number; z: number; r: number; top: number }>;
}

export interface SurveyGuard {
  id: number;
  role: GuardRole;
  x: number;
  z: number;
  elevated: boolean;
  route: Point2[] | null;
}

export interface SurveyPerch {
  x: number;
  z: number;
  dist: number;
  heightAbovePad: number;
  ridge: number;
}

/** Surveys a world, with the terrain resampled to `n` × `n`. */
export function surveyWorld(w: World, n = 160): Survey {
  const site = w.camp.site;
  const size = w.terrain.size;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -size / 2 + ((j + 0.5) * size) / n;
    for (let i = 0; i < n; i++) {
      const x = -size / 2 + ((i + 0.5) * size) / n;
      heights[j * n + i] = w.terrain.heightAt(x, z) - site.height;
    }
  }
  const structures: SurveyStructure[] = w.camp.structures.map((st) => ({
    kind: st.kind,
    shapes: st.colliders.map((id) => {
      const c = w.colliders.list[id]!;
      if (c.kind === 'cyl') return { x: c.x, z: c.z, r: c.r, top: c.y1 - site.height };
      const ax = { x: c.ux * c.hx, z: c.uz * c.hx };
      const az = { x: -c.uz * c.hz, z: c.ux * c.hz };
      return {
        corners: [
          { x: c.x - ax.x - az.x, z: c.z - ax.z - az.z },
          { x: c.x + ax.x - az.x, z: c.z + ax.z - az.z },
          { x: c.x + ax.x + az.x, z: c.z + ax.z + az.z },
          { x: c.x - ax.x + az.x, z: c.z - ax.z + az.z },
        ],
        top: c.y1 - site.height,
      };
    }),
  }));
  const r = w.report;
  const v = r.valley;
  const stats: Record<string, number> = v
    ? {
        'overwatched horizon (°)': Math.round(v.perchArcDeg),
        'open horizon (°)': Math.round(v.openGapDeg),
        'ridges overlooking': v.ridgesSeen,
        'access (of 8)': v.access,
        'ways out': v.exfil,
        'steep (%)': Math.round(v.steepShare * 1000) / 10,
      }
    : { 'overwatch sectors (of 8)': r.overwatchSectors, 'access sectors (of 16)': r.accessSectors, ridges: r.ridges, 'steep (%)': Math.round(r.steepShare * 1000) / 10 };
  const extra: Pick<Survey, 'ridges' | 'fords' | 'doors' | 'vehicles' | 'skeleton'> = {};
  if (w.features.ridges) {
    extra.ridges = w.features.ridges.map((rd) => ({
      crest: rd.crest.points.map((p) => ({ x: p.x, z: p.z })),
      gullies: rd.gullies.map((s) => pointAt(rd.crest, s)),
    }));
  }
  if (w.features.fords) extra.fords = w.features.fords.map((f) => ({ x: f.x, z: f.z }));
  if (w.camp.doors) extra.doors = w.camp.doors.map((d) => ({ x: d.x, z: d.z, ux: d.ux, uz: d.uz, width: d.width }));
  if (w.camp.vehicles) {
    extra.vehicles = w.camp.vehicles.map((ve) => {
      const lx = ve.fx * (ve.length / 2);
      const lz = ve.fz * (ve.length / 2);
      const wx = -ve.fz * (ve.width / 2);
      const wz = ve.fx * (ve.width / 2);
      return {
        corners: [
          { x: ve.x - lx - wx, z: ve.z - lz - wz },
          { x: ve.x + lx - wx, z: ve.z + lz - wz },
          { x: ve.x + lx + wx, z: ve.z + lz + wz },
          { x: ve.x - lx + wx, z: ve.z - lz + wz },
        ],
        escape: ve.escape,
      };
    });
  }
  const sk = w.camp.layout?.skeleton;
  if (sk) extra.skeleton = structuredClone(sk);
  return {
    ...extra,
    seed: w.seed,
    attempt: w.attempt,
    ok: r.ok,
    problems: [...r.problems],
    stats,
    terrain: { size, n, heights },
    road: w.features.road.points.map((p) => ({ x: p.x, z: p.z })),
    creek: w.features.creek.points.map((p) => ({ x: p.x, z: p.z })),
    site: { ...site },
    structures,
    guards: w.camp.guards.map((g) => ({ id: g.id, role: g.role, x: g.x, z: g.z, elevated: g.elevated, route: g.route ? g.route.map((p) => ({ x: p.x, z: p.z })) : null })),
    perches: r.perches.map((p) => ({ x: p.x, z: p.z, dist: p.dist, heightAbovePad: p.heightAbovePad, ridge: p.ridge })),
    playHalf: w.playHalf,
  };
}
