import type { Site } from './site';
import { clamp, lerp, smoothstep } from '../kernel/core/math';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Noise2D } from './noise';
import type { Point2, Polyline } from './paths';
import type { Ford, Ridge, SiteKind } from './landform';

/**
 * What a valley's terrain is, as generation hands it on: its heights, its features and its
 * backdrop. The terrain itself comes from landform.ts.
 */

export interface Saddle {
  /** Unit direction from the camp. */
  x: number;
  z: number;
  /** Cosine of the saddle's angular half-width. */
  cos: number;
  /** Share of the crest height removed at the saddle's centre. */
  depth: number;
}

/** The lowest crossing of the ridge near a saddle. */
export interface Pass {
  x: number;
  z: number;
  /** Unit direction from the camp. */
  dirX: number;
  dirZ: number;
  /** Distance from the camp to the crossing. */
  radius: number;
  /** Ground height at the crossing. */
  height: number;
}

export interface TerrainFeatures {
  saddles: Saddle[];
  passes: Pass[];
  creek: Polyline;
  road: Polyline;
  creekPasses: [number, number];
  roadPass: number;
  /** Where the valley's camp stands: the pad at the origin, its gate facing the road pass. */
  site: Site;
  /**
   * Terrain with teeth (landform.ts) only, absent from Phase 0's valley: the ridge spines,
   * the creek's fords, and the open side of the horizon (its middle bearing and width,
   * radians), where no spine stands.
   */
  ridges?: Ridge[];
  fords?: Ford[];
  openAngle?: number;
  openArc?: number;
  /** The kind of site the camp stands on, and the width of its water's bed (landform.ts). */
  kind?: SiteKind;
  creekWidth?: number;
}

export interface Backdrop {
  size: number;
  cell: number;
  n: number;
  heights: Float32Array;
}

export interface TerrainResult {
  heightfield: Heightfield;
  features: TerrainFeatures;
  backdrop: Backdrop;
}

/** Polynomial smooth minimum: like min(a, b) but rounds the crease over width k. */
export function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Bends a path sideways with noise, holding it still near the given anchor points. */
export function wiggle(points: Point2[], noise: Noise2D, amplitude: number, anchors: Point2[]): Point2[] {
  const out: Point2[] = [];
  let s = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k]!;
    if (k > 0) {
      const q = points[k - 1]!;
      s += Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.z - q.z) * (p.z - q.z));
    }
    const a = points[k > 0 ? k - 1 : k]!;
    const b = points[k < points.length - 1 ? k + 1 : k]!;
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const tl = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= tl;
    tz /= tl;
    let hold = 1;
    for (const an of anchors) {
      const d = Math.sqrt((p.x - an.x) * (p.x - an.x) + (p.z - an.z) * (p.z - an.z));
      hold = Math.min(hold, smoothstep(10, 70, d));
    }
    const off = noise.fbm(s / 90, 0.5, 2) * amplitude * hold;
    out.push({ x: p.x - tz * off, z: p.z + tx * off });
  }
  return out;
}
