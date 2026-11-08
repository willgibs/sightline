import type { Tuning } from '../../config/tuning';
import type { MissionSpec } from '../kernel/mission';
import { Hasher, hashValue } from '../kernel/core/hash';
import { Rng } from '../kernel/core/rng';
import { ColliderSet } from '../kernel/world/colliders';
import type { World } from '../kernel/world/world';
import { analyzeTerrain, type TerrainReport } from './analysis';
import { buildTestCamp, type Camp } from './camp';
import { siteBounds } from './site';
import { chooseSpawn, type Spawn } from './spawn';
import { generateCampWorld } from './campWorld';
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

export type { Spawn } from './spawn';
export { siteBounds };

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
  // A mission that asks for a camp gets lab D's generator; until D9, one that doesn't gets Phase 0's valley.
  if (spec.camp) return generateCampWorld(spec, tuning, clock);
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

