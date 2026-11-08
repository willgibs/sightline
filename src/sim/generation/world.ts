import type { Tuning } from '../../config/tuning';
import type { MissionSpec, SpawnKind } from '../kernel/mission';
import { dtanDeg } from '../kernel/core/detmath';
import { Hasher, hashValue } from '../kernel/core/hash';
import { Rng } from '../kernel/core/rng';
import { Blocks, ColliderSet, footprintContains } from '../kernel/world/colliders';
import { makeTerrainSample, type Heightfield } from '../kernel/world/heightfield';
import type { World } from '../kernel/world/world';
import { analyzeTerrain, type TerrainReport } from './analysis';
import { buildTestCamp, type Camp } from './camp';
import type { Site } from './site';
import { scatterProps, type Props } from './props';
import { generateTerrain, type Backdrop, type TerrainFeatures } from './terrain';
import { assertTuning } from '../../config/validate';
import { buildGrid } from '../kernel/world/grid';

declare module '../kernel/world/world' {
  /**
   * What generation adds to every world it builds, procedural or by hand: the terrain's
   * features, the props, the camp with its guard posts and routes, the analysis report and
   * the player's spawn.
   */
  interface World {
    /** Re-rolls needed before the valley passed validation (0 = first try). */
    attempt: number;
    features: TerrainFeatures;
    backdrop: Backdrop;
    props: Props;
    camp: Camp;
    report: TerrainReport;
    spawn: Spawn;
    /** Generation time in milliseconds, if a clock was given (informational, not deterministic). */
    genMs: number;
  }
}

export interface Spawn {
  x: number;
  z: number;
  /** Initial facing as a unit vector. */
  faceX: number;
  faceZ: number;
  kind: SpawnKind;
}

/** Everything generation reads from tuning. If this changes, the valley must be rebuilt. */
export function worldTuningKey(t: Tuning): string {
  return hashValue(t.gen);
}

/** Everything the running simulation reads from tuning: all of it except generation and view. */
export function simTuningKey(t: Tuning): string {
  const { gen: _gen, view: _view, ...simulation } = t;
  return hashValue(simulation);
}

/**
 * A fingerprint of everything generation decides, by construction: every field of the
 * world but what it was built from (`spec`, `seed`) and how long it took (`genMs`), so a
 * field any lane adds to World is covered the day it is added. The terrain counts by its
 * heights and surfaces, the colliders by their list. Recordings carry it, so a valley
 * generated differently is caught before re-simulating.
 */
export function worldFingerprint(w: World): string {
  const h = new Hasher();
  const { spec: _spec, seed: _seed, genMs: _genMs, terrain, colliders, ...rest } = w;
  hashGenerated(h, { ...rest, terrain: { size: terrain.size, cell: terrain.cell, heights: terrain.heights, surfaces: terrain.surfaces }, colliders: colliders.list }, 'world');
  return h.digest();
}

/**
 * Feeds generated data to a hash: numbers by their bits, strings, booleans, arrays, typed
 * arrays by their bytes, and plain objects with their keys sorted. Anything else (a class
 * instance, a function, a Map) is refused by name, since its insides wouldn't be covered.
 */
function hashGenerated(h: Hasher, v: unknown, path: string): void {
  switch (typeof v) {
    case 'number':
      h.u32(1).f64(v);
      return;
    case 'boolean':
      h.u32(v ? 3 : 2);
      return;
    case 'string':
      h.u32(4).str(v);
      return;
    case 'undefined':
      h.u32(8);
      return;
    case 'object': {
      if (v === null) {
        h.u32(5);
        return;
      }
      if (ArrayBuffer.isView(v)) {
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        h.u32(9).u32(bytes.length).bytes(bytes);
        return;
      }
      if (Array.isArray(v)) {
        h.u32(6).u32(v.length);
        for (let k = 0; k < v.length; k++) hashGenerated(h, v[k], path);
        return;
      }
      const proto = Object.getPrototypeOf(v) as unknown;
      if (proto !== Object.prototype && proto !== null) throw new Error(`The world holds a ${(v as object).constructor?.name ?? 'class instance'} at ${path}; its fingerprint covers plain data and typed arrays only`);
      const keys = Object.keys(v).sort();
      h.u32(7).u32(keys.length);
      for (const k of keys) {
        h.str(k);
        hashGenerated(h, (v as Record<string, unknown>)[k], `${path}.${k}`);
      }
      return;
    }
    default:
      throw new Error(`The world holds a ${typeof v} at ${path}; its fingerprint covers plain data and typed arrays only`);
  }
}

/**
 * Builds a mission's world from its spec. Generation reads only `tuning.gen`. Pass a
 * clock (milliseconds) to have the generation time reported in `genMs`.
 */

export function generateWorld(spec: MissionSpec, tuning: Tuning, clock?: () => number): World {
  if (spec.terrain.kind !== 'procedural') throw new Error(`The world '${spec.terrain.name}' is built by hand; its scene builds it (kernel/scene.ts)`);
  // Bounds on sizes, spacings and attempts, so bad tuning fails here instead of hanging.
  assertTuning(tuning);
  const started = clock ? clock() : 0;
  const G = tuning.gen;
  const seed = spec.seed;
  const attempts = Math.max(1, G.world.maxGenAttempts);
  for (let attempt = 0; ; attempt++) {
    const rng = new Rng(seed, attempt === 0 ? 'world' : `world#${attempt}`);
    const terrain = generateTerrain(rng.fork('terrain'), G);
    const colliders = new ColliderSet(G.world.size);
    const camp = buildTestCamp(rng.fork('camp'), terrain.heightfield, terrain.features, colliders, G, rng.fork('routines'));
    const props = scatterProps(rng.fork('props'), terrain.heightfield, terrain.features, colliders, G);
    colliders.build();
    const report = analyzeTerrain(terrain.heightfield, colliders, G, camp.site);
    if (!report.ok && attempt < attempts - 1) continue;
    const playHalf = terrain.heightfield.size / 2 - G.world.playMargin;
    const spawn = chooseSpawn(spec.insertion, terrain.heightfield, terrain.features, colliders, report, playHalf, camp.site);
    const grid = buildGrid(terrain.heightfield, colliders, siteBounds(camp, colliders, G.grid.siteMargin), G);
    return {
      grid,
      spec,
      seed,
      attempt,
      terrain: terrain.heightfield,
      features: terrain.features,
      backdrop: terrain.backdrop,
      colliders,
      props,
      camp,
      report,
      spawn,
      playHalf,
      genMs: clock ? clock() - started : 0,
    };
  }
}

/**
 * Overlook: just behind the best perch, facing the camp, so the first view is the
 * valley. Edge: at the end of the road where it leaves the play area. Either way facing
 * the camp's site.
 */
function chooseSpawn(
  kind: SpawnKind,
  hf: Heightfield,
  features: TerrainFeatures,
  colliders: ColliderSet,
  report: TerrainReport,
  playHalf: number,
  site: Site,
): Spawn {
  const sample = makeTerrainSample();
  const maxTan = dtanDeg(28);
  const ids: number[] = [];
  const clear = (x: number, z: number): boolean => {
    if (Math.abs(x) > playHalf - 2 || Math.abs(z) > playHalf - 2) return false;
    hf.sample(x, z, sample);
    if (sample.slopeTan > maxTan) return false;
    colliders.query(x - 1.5, z - 1.5, x + 1.5, z + 1.5, ids);
    for (const id of ids) {
      const c = colliders.list[id]!;
      if (c.flags & Blocks.Move && footprintContains(c, x, z, 0.9)) return false;
    }
    return true;
  };
  /** Nearest clear spot to (x, z), searching outward in rings. */
  const settle = (x: number, z: number): { x: number; z: number } => {
    if (clear(x, z)) return { x, z };
    for (let r = 1; r <= 24; r += 1) {
      for (let k = 0; k < 16; k++) {
        const px = x + r * RING16[k]!.x;
        const pz = z + r * RING16[k]!.z;
        if (clear(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };
  const facing = (x: number, z: number) => {
    const dx = x - site.x;
    const dz = z - site.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    return { faceX: -dx / l, faceZ: -dz / l };
  };

  if (kind === 'overlook' && report.perches.length > 0) {
    // Prefer a high perch at a classic engagement distance.
    let best = report.perches[0]!;
    let bestScore = -Infinity;
    for (const p of report.perches) {
      const range = p.dist >= 200 && p.dist <= 400 ? 1 : 0.6;
      const score = p.heightAbovePad * range;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const ox = best.x - site.x;
    const oz = best.z - site.z;
    const l = Math.sqrt(ox * ox + oz * oz);
    const back = 5;
    const spot = settle(best.x + (ox / l) * back, best.z + (oz / l) * back);
    return { ...spot, ...facing(spot.x, spot.z), kind: 'overlook' };
  }

  // Edge: where the road crosses into the play area.
  const pts = features.road.points;
  let entry = pts[pts.length - 1]!;
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k]!;
    if (Math.abs(p.x) < playHalf - 8 && Math.abs(p.z) < playHalf - 8) {
      entry = p;
      break;
    }
  }
  const spot = settle(entry.x, entry.z);
  return { ...spot, ...facing(spot.x, spot.z), kind: 'edge' };
}

const RING16 = [
  { x: 1, z: 0 },
  { x: 0.9238795325112867, z: 0.3826834323650898 },
  { x: 0.7071067811865476, z: 0.7071067811865476 },
  { x: 0.3826834323650898, z: 0.9238795325112867 },
  { x: 0, z: 1 },
  { x: -0.3826834323650898, z: 0.9238795325112867 },
  { x: -0.7071067811865476, z: 0.7071067811865476 },
  { x: -0.9238795325112867, z: 0.3826834323650898 },
  { x: -1, z: 0 },
  { x: -0.9238795325112867, z: -0.3826834323650898 },
  { x: -0.7071067811865476, z: -0.7071067811865476 },
  { x: -0.3826834323650898, z: -0.9238795325112867 },
  { x: 0, z: -1 },
  { x: 0.3826834323650898, z: -0.9238795325112867 },
  { x: 0.7071067811865476, z: -0.7071067811865476 },
  { x: 0.9238795325112867, z: -0.3826834323650898 },
];

/** The area the fine grid covers: every camp structure's footprint and a margin. Nothing assumes where the camp is. */
export function siteBounds(camp: Camp, colliders: ColliderSet, margin: number): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const st of camp.structures) {
    for (const id of st.colliders) {
      const c = colliders.list[id]!;
      const e = c.kind === 'cyl' ? c.r : Math.abs(c.ux) * c.hx + Math.abs(c.uz) * c.hz + Math.abs(c.uz) * c.hx + Math.abs(c.ux) * c.hz;
      minX = Math.min(minX, c.x - e);
      maxX = Math.max(maxX, c.x + e);
      minZ = Math.min(minZ, c.z - e);
      maxZ = Math.max(maxZ, c.z + e);
    }
  }
  if (minX > maxX) return { minX: -margin, minZ: -margin, maxX: margin, maxZ: margin };
  return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
}
