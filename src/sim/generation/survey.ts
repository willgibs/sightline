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
  /** Whole-world re-rolls before the camp passed: Phase 0's valley's, or the terrain's for lab D's. */
  attempt: number;
  /** Generated camps: the repairs it took (none if the camp as first built passed validation). */
  repairs: number;
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
  /** Generated camps only (D7): the analysis, as the explorer draws it. */
  analysis?: SurveyAnalysis;
}

export interface SurveyAnalysis {
  /** Coverage over the camp's cycle, every `cell` metres in its frame from (a0, b0), na × nb. */
  heat: { a0: number; b0: number; cell: number; na: number; nb: number; coverage: Float32Array; idleness: Float32Array };
  /** The camp's frame, to place the heatmap. */
  frame: { ox: number; oz: number; ux: number; uz: number; vx: number; vz: number };
  perches: Array<{ x: number; z: number; coverage: number; target: number }>;
  /** Sightline edges that hold long enough to join a cluster, between guards (by index), with their duty. */
  edges: Array<{ a: number; b: number; duty: number }>;
  clusters: Array<{ members: number[]; certified: string }>;
  infiltration: Point2[] | null;
  sabotage: Point2[] | null;
  exfil: Point2[] | null;
  cycle: number;
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
  if (r.camp) {
    const c = r.camp;
    stats['best perch (%)'] = Math.round(100 * Math.max(0, ...c.perches.map((p) => p.coverage)));
    stats['target in view (%)'] = Math.round(100 * Math.max(0, ...c.perches.map((p) => p.target)));
    stats['clusters'] = c.clusters.filter((x) => x.members.length > 1).length;
    stats['unsolved'] = c.clusters.filter((x) => x.certified === 'unsolved').length;
    stats['way in (s)'] = c.infiltration.found ? Math.round(c.infiltration.arrive) : -1;
    stats['cycle (s)'] = c.cycle;
    if (r.validation) stats['rules failed'] = r.validation.failed.length;
    if (r.repairs) stats['repairs'] = r.repairs.length;
  }
  // What kind of ground and camp this is, one stat each, so the explorer's card shows it.
  if (w.features.kind) stats[`site: ${w.features.kind}`] = 1;
  const plan = w.camp.layout?.plan;
  if (plan) {
    stats[`plot: ${plan.plot}`] = 1;
    stats[`perimeter: ${plan.perimeter}`] = 1;
    stats[`fill: ${plan.fill}`] = 1;
  }
  if (w.camp.crux) stats[`crux: ${w.camp.crux}`] = 1;
  const extra: Pick<Survey, 'ridges' | 'fords' | 'doors' | 'vehicles' | 'skeleton' | 'analysis'> = {};
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
  const a = r.camp;
  if (a) {
    // The heatmaps at twice the raster's cell, each the mean of its four.
    const f = a.frame;
    const na = Math.ceil(f.na / 2);
    const nb = Math.ceil(f.nb / 2);
    const coverage = new Float32Array(na * nb);
    const idleness = new Float32Array(na * nb);
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        let c = 0;
        let q = 0;
        let n = 0;
        for (const [di, dj] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const ii = 2 * i + di;
          const jj = 2 * j + dj;
          if (ii >= f.na || jj >= f.nb) continue;
          c += a.coverage[jj * f.na + ii]!;
          q += a.idleness[jj * f.na + ii]!;
          n++;
        }
        coverage[j * na + i] = c / n;
        idleness[j * na + i] = q / n;
      }
    }
    const g = w.camp.guards.length;
    const edges: SurveyAnalysis['edges'] = [];
    for (let x = 0; x < g; x++) for (let y = 0; y < g; y++) if (x !== y && a.duty[x * g + y]! >= 0.1) edges.push({ a: x, b: y, duty: a.duty[x * g + y]! });
    const path = (p: { found: boolean; path: Point2[] }) => (p.found ? p.path.filter((_, k) => k % 2 === 0 || k === p.path.length - 1) : null);
    extra.analysis = {
      heat: { a0: f.a0, b0: f.b0, cell: f.cell * 2, na, nb, coverage, idleness },
      frame: { ox: f.ox, oz: f.oz, ux: f.ux, uz: f.uz, vx: f.vx, vz: f.vz },
      perches: a.perches.map((p) => ({ x: p.x, z: p.z, coverage: p.coverage, target: p.target })),
      edges,
      clusters: a.clusters.map((c) => ({ members: [...c.members], certified: c.certified })),
      infiltration: path(a.infiltration),
      sabotage: path(a.sabotage),
      exfil: path(a.exfil),
      cycle: a.cycle,
    };
  }
  return {
    ...extra,
    seed: w.seed,
    attempt: w.attempt,
    repairs: (r.repairs?.length ?? 0) + (r.campAttempt ?? 0),
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
