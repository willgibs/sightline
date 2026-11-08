import type { Tuning } from '../../config/tuning';
import type { MissionSpec } from '../kernel/mission';
import { Hasher, hashValue } from '../kernel/core/hash';
import type { World } from '../kernel/world/world';
import type { TerrainReport } from './analysis';
import type { Camp } from './camp';
import { defaultCampSpec } from './campSpec';
import { siteBounds } from './site';
import type { Spawn } from './spawn';
import { generateCampWorld } from './campWorld';
import type { Props } from './props';
import type { Backdrop, TerrainFeatures } from './terrain';

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
  // A mission that names no camp gets the default compound, and its spec says so from here
  // on (world.spec), so a recording names the camp it was played in.
  return generateCampWorld(spec.camp ? spec : { ...spec, camp: defaultCampSpec() }, tuning, clock);
}
