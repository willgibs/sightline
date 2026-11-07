import type { Site } from './site';
import type { GenTuning } from '../../config/tuning';
import { DEG, dcos, dcosDeg, dsin, dtanDeg } from '../core/detmath';
import { clamp, lerp, smoothstep } from '../core/math';
import type { Rng } from '../core/rng';
import { Heightfield } from '../world/heightfield';
import { Surface } from '../world/surfaces';
import { Noise2D } from './noise';
import { catmullRom, makePolyline, pointAt, PolylineIndex, type PathHit, type Point2, type Polyline } from './paths';

/**
 * The valley.
 *
 * A camp pad sits at the centre of a bowl. Ridges ring it at 215–430 m, varying in
 * distance and height around the circle, broken by three or four saddles (low passes).
 * A creek enters through one pass, curls past the camp and leaves through another,
 * cutting gorges where it crosses the ridges. A dirt road leaves the camp through a
 * third pass. Rolling hills, crags and fine relief sit on top, and a domain warp keeps
 * the bowl from looking like a crater.
 *
 * Everything is a deterministic function of the seed (see detmath.ts).
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

export function generateTerrain(rng: Rng, gen: GenTuning): TerrainResult {
  const W = gen.world;
  const shape = new Noise2D(rng.fork('shape'));
  const warp = new Noise2D(rng.fork('warp'));
  const relief = new Noise2D(rng.fork('relief'));
  const fine = new Noise2D(rng.fork('detail'));
  const patches = new Noise2D(rng.fork('patches'));

  const padR = W.padRadius;
  const padEdge = padR + W.padBlend * 0.5;

  // --- Saddles: directions at least 60° apart. -------------------------------------
  const srng = rng.fork('saddles');
  const saddleCount = srng.int(W.saddleCount[0]!, W.saddleCount[1]!);
  const saddles: Saddle[] = [];
  for (let attempt = 0; saddles.length < saddleCount && attempt < 1000; attempt++) {
    const d = srng.unit2();
    if (saddles.every((s) => s.x * d.x + s.z * d.z < 0.5)) {
      saddles.push({ x: d.x, z: d.z, cos: dcosDeg(srng.between(W.saddleHalfWidthDeg)), depth: srng.between(W.saddleDepth) });
    }
  }

  const ringRadius = (dx: number, dz: number): number =>
    lerp(W.ridgeRadius[0]!, W.ridgeRadius[1]!, clamp(0.5 + 0.85 * shape.fbm(dx * 1.25 + 3.1, dz * 1.25 - 7.7, 2), 0, 1));

  const crestHeight = (dx: number, dz: number): number => {
    let h = lerp(W.ridgeHeight[0]!, W.ridgeHeight[1]!, clamp(0.5 + 0.85 * shape.fbm(dx * 1.6 - 11.3, dz * 1.6 + 2.9, 2), 0, 1));
    for (const s of saddles) {
      const k = smoothstep(s.cos, 1, dx * s.x + dz * s.z);
      h *= 1 - s.depth * k;
    }
    return h;
  };

  /** Height before the creek, road and pad are cut in. Also drives the distant backdrop. */
  const baseHeight = (x: number, z: number): number => {
    const r0 = Math.sqrt(x * x + z * z);
    const ws = smoothstep(padR, padR + 160, r0) * W.warpAmplitude;
    const wf = 1 / 420;
    const wx = x + ws * warp.fbm(x * wf + 11.3, z * wf - 7.1, 3);
    const wz = z + ws * warp.fbm(x * wf - 3.7, z * wf + 19.9, 3);
    const r = Math.sqrt(wx * wx + wz * wz);
    const dx = r > 1e-6 ? wx / r : 1;
    const dz = r > 1e-6 ? wz / r : 0;
    const ringR = ringRadius(dx, dz);
    const crestH = crestHeight(dx, dz);
    const t = clamp((r - padEdge) / (ringR - padEdge), 0, 1.6);
    let base: number;
    if (t <= 1) {
      base = crestH * t * t * (3 - 2 * t);
    } else {
      base = crestH * (1 - 0.45 * smoothstep(0, 1, (r - ringR) / 190));
    }
    const reliefMask = smoothstep(padR, padR + 70, r0);
    const hills = relief.fbm(x / 380, z / 380, 4) * W.hills;
    const crags = (relief.ridged(x / 160 + 40.2, z / 160 - 13.4, 4) - 0.35) * W.crags * smoothstep(0.35, 0.9, t);
    const detail = fine.fbm(x / 45, z / 45, 3) * W.detail;
    return W.padHeight + base + reliefMask * (hills + crags + detail);
  };

  // --- Passes: the real low point of the ridge near each saddle. --------------------
  const passes = saddles.map((s) => findPass(s, baseHeight, W.ridgeRadius[0]! * 0.75, W.ridgeRadius[1]! * 1.25));

  // The creek takes the two passes farthest apart; the road takes another.
  let creekA = 0;
  let creekB = 1;
  let widest = Infinity;
  for (let a = 0; a < passes.length; a++) {
    for (let b = a + 1; b < passes.length; b++) {
      const dot = passes[a]!.dirX * passes[b]!.dirX + passes[a]!.dirZ * passes[b]!.dirZ;
      if (dot < widest) {
        widest = dot;
        creekA = a;
        creekB = b;
      }
    }
  }
  const crng = rng.fork('creek');
  if (crng.chance(0.5)) [creekA, creekB] = [creekB, creekA];
  const remaining = passes.map((_, i) => i).filter((i) => i !== creekA && i !== creekB);
  const roadPass = crng.pick(remaining);
  const road = passes[roadPass]!;
  const campAxis = { x: road.dirX, z: road.dirZ };

  const hf = new Heightfield(W.size, W.cellSize);
  const { n } = hf;
  const heights = hf.heights;
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) heights[j * n + i] = baseHeight(hf.coord(i), z);
  }

  // --- Creek. ------------------------------------------------------------------------
  const inlet = passes[creekA]!;
  const outlet = passes[creekB]!;
  let midX = inlet.dirX + outlet.dirX;
  let midZ = inlet.dirZ + outlet.dirZ;
  let midLen = Math.sqrt(midX * midX + midZ * midZ);
  if (midLen < 0.35) {
    // Nearly opposite passes: swing round one side of the camp.
    const side = crng.chance(0.5) ? 1 : -1;
    midX = -inlet.dirZ * side;
    midZ = inlet.dirX * side;
    midLen = 1;
  }
  midX /= midLen;
  midZ /= midLen;
  const passBy = padR + 50 + crng.range(0, 40);
  const edge = W.size * 0.6;
  const creekCtrl: Point2[] = [
    { x: inlet.dirX * edge, z: inlet.dirZ * edge },
    { x: inlet.dirX * (inlet.radius + 70), z: inlet.dirZ * (inlet.radius + 70) },
    { x: inlet.x, z: inlet.z },
    { x: inlet.dirX * inlet.radius * 0.6, z: inlet.dirZ * inlet.radius * 0.6 },
    { x: midX * passBy, z: midZ * passBy },
    { x: outlet.dirX * outlet.radius * 0.6, z: outlet.dirZ * outlet.radius * 0.6 },
    { x: outlet.x, z: outlet.z },
    { x: outlet.dirX * (outlet.radius + 70), z: outlet.dirZ * (outlet.radius + 70) },
    { x: outlet.dirX * edge, z: outlet.dirZ * edge },
  ];
  const per = 12;
  const creekPts = wiggle(catmullRom(creekCtrl, per), new Noise2D(crng.fork('wiggle')), 13, [
    { x: inlet.x, z: inlet.z },
    { x: outlet.x, z: outlet.z },
  ]);
  keepOffPad(creekPts, padR + 28);
  const creek = makePolyline(creekPts);

  // Bed elevation falls monotonically from inlet to outlet.
  const knotS = [0, 2, 4, 6, 8].map((k) => creek.lengths[k * per]!);
  const knotH = [inlet.height + 2, inlet.height - 6, W.padHeight - 1.6, Math.min(outlet.height, W.padHeight) - 4, W.padHeight - 7];
  for (let k = 1; k < knotH.length; k++) knotH[k] = Math.min(knotH[k]!, knotH[k - 1]! - 0.5);
  const bedAt = (s: number): number => {
    for (let k = 1; k < knotS.length; k++) {
      if (s <= knotS[k]!) return lerp(knotH[k - 1]!, knotH[k]!, (s - knotS[k - 1]!) / Math.max(knotS[k]! - knotS[k - 1]!, 1e-6));
    }
    return knotH[knotH.length - 1]!;
  };

  const halfBed = W.creekWidth / 2;
  const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
  const creekReach = 80;
  const creekDist = new Float32Array(n * n).fill(Infinity);
  const creekIndex = new PolylineIndex(creek, creekReach);
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      creekIndex.closest(x, z, hit);
      if (hit.dist === Infinity) continue;
      const k = j * n + i;
      creekDist[k] = hit.dist;
      const target = bedAt(hit.s) + Math.max(0, hit.dist - halfBed) * W.creekBankSlope;
      heights[k] = smin(heights[k]!, target, 1.5);
    }
  }

  // --- Road: from the pad out through its pass, graded flat across its width. --------
  const rrng = rng.fork('road');
  const roadCtrl: Point2[] = [
    { x: campAxis.x * (padR - 12), z: campAxis.z * (padR - 12) },
    { x: campAxis.x * (padR + 40), z: campAxis.z * (padR + 40) },
    { x: road.dirX * road.radius * 0.7, z: road.dirZ * road.radius * 0.7 },
    { x: road.x, z: road.z },
    { x: road.dirX * (road.radius + 90), z: road.dirZ * (road.radius + 90) },
    { x: road.dirX * edge, z: road.dirZ * edge },
  ];
  const roadPts = wiggle(catmullRom(roadCtrl, 10), new Noise2D(rrng.fork('wiggle')), 7, [
    { x: road.x, z: road.z },
    { x: roadCtrl[0]!.x, z: roadCtrl[0]!.z },
  ]);
  const roadLine = makePolyline(roadPts);
  // Road profile: terrain heights along the centreline, smoothed so the grade stays gentle.
  const step = 4;
  const samples = Math.max(2, Math.ceil(roadLine.total / step) + 1);
  let profile = new Float64Array(samples);
  for (let k = 0; k < samples; k++) {
    const p = pointAt(roadLine, (k / (samples - 1)) * roadLine.total);
    profile[k] = hf.heightAt(p.x, p.z);
  }
  for (let pass = 0; pass < 6; pass++) {
    const next = new Float64Array(samples);
    for (let k = 0; k < samples; k++) {
      let sum = 0;
      let cnt = 0;
      for (let o = -4; o <= 4; o++) {
        const q = k + o < 0 ? 0 : k + o >= samples ? samples - 1 : k + o;
        sum += profile[q]!;
        cnt++;
      }
      next[k] = sum / cnt;
    }
    profile = next;
  }
  const roadAt = (s: number): number => {
    const f = (s / roadLine.total) * (samples - 1);
    const k = Math.floor(f);
    if (k >= samples - 1) return profile[samples - 1]!;
    if (k < 0) return profile[0]!;
    return lerp(profile[k]!, profile[k + 1]!, f - k);
  };
  const halfRoad = W.roadWidth / 2;
  const roadDist = new Float32Array(n * n).fill(Infinity);
  const roadIndex = new PolylineIndex(roadLine, halfRoad + 8);
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      if (x * x + z * z < padR * padR) continue;
      roadIndex.closest(x, z, hit);
      if (hit.dist === Infinity) continue;
      const k = j * n + i;
      roadDist[k] = hit.dist;
      const m = 1 - smoothstep(halfRoad, halfRoad + 6, hit.dist);
      heights[k] = lerp(heights[k]!, roadAt(hit.s), m);
    }
  }

  // --- Pad: flat ground for the camp. ------------------------------------------------
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      const r0 = Math.sqrt(x * x + z * z);
      const m = 1 - smoothstep(padR, padR + W.padBlend, r0);
      if (m <= 0) continue;
      const k = j * n + i;
      heights[k] = lerp(heights[k]!, W.padHeight, m);
    }
  }
  hf.finalize();

  // --- Surfaces. ---------------------------------------------------------------------
  const rockTan = dtanDeg(34);
  const surfaces = hf.surfaces;
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      const k = j * n + i;
      const r0 = Math.sqrt(x * x + z * z);
      let s: Surface = Surface.Grass;
      const i0 = i > 0 ? i - 1 : i;
      const i1 = i < n - 1 ? i + 1 : i;
      const j0 = j > 0 ? j - 1 : j;
      const j1 = j < n - 1 ? j + 1 : j;
      const gx = (heights[j * n + i1]! - heights[j * n + i0]!) / ((i1 - i0) * hf.cell);
      const gz = (heights[j1 * n + i]! - heights[j0 * n + i]!) / ((j1 - j0) * hf.cell);
      const slope = Math.sqrt(gx * gx + gz * gz);
      if (slope > rockTan) s = Surface.Rock;
      else if (patches.fbm(x / 60, z / 60, 2) > 0.32 && r0 < 300) s = Surface.Dirt;
      if (r0 < padR + 2) s = Surface.Gravel;
      if (roadDist[k]! <= halfRoad) s = Surface.Dirt;
      const cd = creekDist[k]!;
      if (cd <= halfBed) s = Surface.Water;
      else if (cd <= halfBed + 2.5) s = Surface.Gravel;
      surfaces[k] = s;
    }
  }

  // --- Backdrop: the same landscape continuing to the horizon, coarse. --------------
  const bSize = 6400;
  const bCell = 40;
  const bn = bSize / bCell + 1;
  const bHeights = new Float32Array(bn * bn);
  const inner = W.size / 2;
  for (let j = 0; j < bn; j++) {
    const z = -bSize / 2 + j * bCell;
    for (let i = 0; i < bn; i++) {
      const x = -bSize / 2 + i * bCell;
      const d = Math.max(Math.abs(x), Math.abs(z));
      // Tucked under the detailed terrain inside its square, so the two never fight.
      const tuck = 8 * (1 - smoothstep(inner - 90, inner - 10, d));
      bHeights[j * bn + i] = baseHeight(x, z) - tuck;
    }
  }

  return {
    heightfield: hf,
    features: {
      saddles,
      passes,
      creek,
      road: roadLine,
      creekPasses: [creekA, creekB],
      roadPass,
      site: { x: 0, z: 0, ux: campAxis.x, uz: campAxis.z, radius: padR, height: W.padHeight },
    },
    backdrop: { size: bSize, cell: bCell, n: bn, heights: bHeights },
  };
}

/** Polynomial smooth minimum: like min(a, b) but rounds the crease over width k. */
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Searches ±30° around a saddle for the lowest ridge crossing. */
function findPass(s: Saddle, height: (x: number, z: number) => number, rMin: number, rMax: number): Pass {
  let best: Pass | null = null;
  for (let a = -30; a <= 30; a += 3) {
    const c = dcos(a * DEG);
    const sn = dsin(a * DEG);
    const dx = s.x * c - s.z * sn;
    const dz = s.x * sn + s.z * c;
    // The crest along this ray is its highest point.
    let crestH = -Infinity;
    let crestR = rMin;
    for (let r = rMin; r <= rMax; r += 8) {
      const h = height(dx * r, dz * r);
      if (h > crestH) {
        crestH = h;
        crestR = r;
      }
    }
    if (!best || crestH < best.height) {
      best = { x: dx * crestR, z: dz * crestR, dirX: dx, dirZ: dz, radius: crestR, height: crestH };
    }
  }
  return best!;
}

/** Bends a path sideways with noise, holding it still near the given anchor points. */
function wiggle(points: Point2[], noise: Noise2D, amplitude: number, anchors: Point2[]): Point2[] {
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

/** Pushes path points radially out of a circle around the camp. */
function keepOffPad(points: Point2[], radius: number): void {
  for (const p of points) {
    const r = Math.sqrt(p.x * p.x + p.z * p.z);
    if (r < radius && r > 1e-6) {
      p.x *= radius / r;
      p.z *= radius / r;
    }
  }
}
