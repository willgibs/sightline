import type { GenTuning } from '../../config/tuning';
import { DEG, TWO_PI, datan2, dcos, dsin, dtanDeg } from '../kernel/core/detmath';
import { clamp, lerp, smoothstep } from '../kernel/core/math';
import type { Rng } from '../kernel/core/rng';
import { Heightfield } from '../kernel/world/heightfield';
import { Surface } from '../kernel/world/surfaces';
import { Noise2D } from './noise';
import { catmullRom, makePolyline, pointAt, PolylineIndex, type PathHit, type Point2, type Polyline } from './paths';
import { smin, wiggle, type TerrainResult } from './terrain';

/**
 * Terrain with teeth (lab D, D3): the valley a generated camp stands in.
 *
 * The features the design needs are placed first, then relief goes around them (the
 * research's feature-first terrain). The camp's pad sits on a low valley floor. Two or
 * three ridge spines stand on chosen bearings 240–420 m out, around one side of the
 * horizon only, so overwatch comes from a few sectors and the other side stays open and
 * low: the owner found a ring of ridges made one overlook too strong (phase-1-plan.md,
 * D3). Each spine's camp face is a cliff band, broken by one or two walkable gullies, so
 * getting from a perch down to the camp is a choice of gully. A creek comes in across the
 * open side, passes the camp and leaves through a gap between spines; its banks are too
 * steep to climb except at a few fords and where the road crosses, so the far side is
 * reached through chokepoints.
 *
 * Every feature draws from its own labelled fork (rule 3), and everything is a
 * deterministic function of the seed (detmath.ts). overwatch.ts checks the result with
 * viewsheds; generateCampWorld re-rolls a valley that fails.
 */

/** A ridge spine placed around the camp. Plain data: the crest is a polyline. */
export interface Ridge {
  /** Unit vector from the camp toward the middle of the crest. */
  bx: number;
  bz: number;
  /** Bearing of the middle of the crest, radians from +x toward +z, and the share of horizon it spans. */
  angle: number;
  span: number;
  /** The crest from end to end. */
  crest: Polyline;
  /** Crest height above the pad at its middle. */
  height: number;
  /** Horizontal run of the camp face, of a gully, and of the far slope. */
  front: number;
  gullyRun: number;
  back: number;
  /** Arc lengths along the crest of the walkable gullies down the camp face. */
  gullies: number[];
}

/** A place the creek can be crossed on foot. */
export interface Ford {
  x: number;
  z: number;
  /** Arc length along the creek. */
  s: number;
  /** Where the road crosses, rather than a ford of its own. */
  road: boolean;
}

/** Builds a valley around the camp's site at the origin, its gate facing the road. */
export function generateLandform(rng: Rng, gen: GenTuning): TerrainResult {
  const W = gen.world;
  const L = gen.landform;
  const padR = W.padRadius;
  const relief = new Noise2D(rng.fork('relief'));
  const fine = new Noise2D(rng.fork('detail'));
  const patches = new Noise2D(rng.fork('patches'));
  const wobble = new Noise2D(rng.fork('wobble'));

  // --- The spines: an open side, and two or three ridges around the rest. --------------
  const brng = rng.fork('bearings');
  const open = brng.unit2();
  const openAngle = datan2(open.z, open.x);
  const openArc = brng.between(L.openArcDeg) * DEG;
  const count = brng.int(L.ridges[0]!, L.ridges[1]!);
  const closed = TWO_PI - openArc;
  const slot = closed / count;
  const ridges: Ridge[] = [];
  const indices: PolylineIndex[] = [];
  for (let k = 0; k < count; k++) {
    const r = rng.fork(`ridge${k}`);
    const span = Math.min(r.between(L.ridgeSpanDeg) * DEG, slot * 0.78);
    const angle = openAngle + openArc / 2 + slot * (k + 0.5) + r.range(-1, 1) * (slot - span) * 0.3;
    const bx = dcos(angle);
    const bz = dsin(angle);
    const dist = r.between(L.ridgeDistance);
    const length = 2 * dist * (dsin(span / 2) / dcos(span / 2));
    const front = clamp(dist - 150, 70, 120);
    // A gully's slope peaks at 1.5 × height / run (smoothstep); keep it well under the walkable 42°.
    const gullyRun = Math.max(front, Math.min(2.2 * r.between(L.ridgeHeight), dist - 140));
    const height = Math.min(r.between(L.ridgeHeight), 0.5 * gullyRun);
    const back = r.between(L.ridgeBack);
    const bend = r.between(L.ridgeBend);
    const tx = -bz;
    const tz = bx;
    const steps = Math.max(8, Math.ceil(length / 10));
    const pts: Point2[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = -length / 2 + (length * i) / steps;
      const w = -bend * ((s * s) / dist) + wobble.fbm(s / 140, k * 7.31 + 2.2, 2) * 14;
      pts.push({ x: bx * (dist + w) + tx * s, z: bz * (dist + w) + tz * s });
    }
    const crest = makePolyline(pts);
    const g = r.int(L.gullies[0]!, L.gullies[1]!);
    const gullies: number[] = [];
    for (let attempt = 0; gullies.length < g && attempt < 40; attempt++) {
      const s = r.range(0.22, 0.78) * crest.total;
      if (gullies.every((o) => Math.abs(o - s) > 70)) gullies.push(s);
    }
    gullies.sort((a, b) => a - b); // unique: no two are within 70 m
    ridges.push({ bx, bz, angle, span, crest, height, front, gullyRun, back, gullies });
    indices.push(new PolylineIndex(crest, Math.max(back, gullyRun) + 10));
  }

  const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
  /** How far into a gully the last ridgeHeight call's point was: 0 on a face, 1 down its middle. */
  let inGully = 0;
  /** One spine's height above the floor at (x, z). */
  const ridgeHeight = (k: number, x: number, z: number): number => {
    inGully = 0;
    const rd = ridges[k]!;
    indices[k]!.closest(x, z, hit);
    if (hit.dist === Infinity) return 0;
    const s = hit.s;
    const total = rd.crest.total;
    let crestH = rd.height * smoothstep(0, 70, Math.min(s, total - s)) * (1 + 0.12 * wobble.fbm(s / 110, 3.3 + k, 2));
    let gully = 0;
    for (const sg of rd.gullies) gully = Math.max(gully, 1 - smoothstep(L.gullyWidth * 0.5, L.gullyWidth, Math.abs(s - sg)));
    crestH *= 1 - 0.12 * gully;
    inGully = gully;
    const side = (x - hit.x) * rd.bx + (z - hit.z) * rd.bz;
    if (side > 0) return crestH * (1 - smoothstep(0, 1, hit.dist / rd.back));
    const f = hit.dist / rd.front;
    const face = lerp(1 - smoothstep(0, 1, f), cliffed(f), L.cliffs);
    const down = 1 - smoothstep(0, 1, hit.dist / rd.gullyRun);
    return crestH * lerp(face, down, gully);
  };

  /** Height before the creek, the road and the pad are cut in. Also drives the backdrop. */
  const baseHeight = (x: number, z: number): number => {
    const r0 = Math.sqrt(x * x + z * z);
    let spine = 0;
    let rel = 0;
    let gully = 0;
    for (let k = 0; k < ridges.length; k++) {
      const h = ridgeHeight(k, x, z);
      if (h > 0) {
        rel = Math.max(rel, h / ridges[k]!.height);
        gully = Math.max(gully, inGully);
        spine = spine === 0 ? h : smax(spine, h, 4);
      }
    }
    const floor = L.floorRise * smoothstep(180, 700, r0) + L.floorHills * relief.fbm(x / 320, z / 320, 3) * smoothstep(padR, padR + 80, r0);
    // Broken relief on the spines, but not down the gullies, which stay walkable.
    const crags = (relief.ridged(x / 160 + 40.2, z / 160 - 13.4, 4) - 0.35) * L.crags * smoothstep(0.15, 0.6, rel) * (1 - gully);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const rim = L.rim * smoothstep(W.size / 2 - 40, W.size / 2 + 600, edge) * (0.75 + 0.5 * relief.fbm(x / 700, z / 700, 2));
    const detail = fine.fbm(x / 45, z / 45, 3) * W.detail * smoothstep(padR, padR + 40, r0);
    return W.padHeight + floor + spine + crags + rim + detail;
  };

  // --- The road: out through the open side, the way the camp's gate faces. ------------
  const rrng = rng.fork('road');
  const roadAngle = openAngle + rrng.range(-0.3, 0.3) * openArc;
  const road = { x: dcos(roadAngle), z: dsin(roadAngle) };
  const edge = W.size * 0.6;
  const roadCtrl: Point2[] = [
    { x: road.x * (padR - 12), z: road.z * (padR - 12) },
    { x: road.x * (padR + 40), z: road.z * (padR + 40) },
  ];
  const bendA = roadAngle + rrng.range(-0.25, 0.25);
  roadCtrl.push({ x: dcos(bendA) * 300, z: dsin(bendA) * 300 });
  const bendB = bendA + rrng.range(-0.2, 0.2);
  roadCtrl.push({ x: dcos(bendB) * 520, z: dsin(bendB) * 520 }, { x: dcos(bendB) * edge, z: dsin(bendB) * edge });
  const roadPts = wiggle(catmullRom(roadCtrl, 10), new Noise2D(rrng.fork('wiggle')), 6, [roadCtrl[0]!]);
  const roadLine = makePolyline(roadPts);

  // --- The creek: in across the open side, past the camp, out through a gap. ----------
  const crng = rng.fork('creek');
  const sorted = ridges.map((rd, k) => ({ k, a: wrapPositive(rd.angle - openAngle) })).sort((a, b) => a.a - b.a || a.k - b.k);
  let gapAngle = openAngle + openArc / 2 + closed / 2;
  let widest = -Infinity;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = ridges[sorted[i]!.k]!;
    const b = ridges[sorted[i + 1]!.k]!;
    const from = sorted[i]!.a + a.span / 2;
    const to = sorted[i + 1]!.a - b.span / 2;
    if (to - from > widest) {
      widest = to - from;
      gapAngle = openAngle + (from + to) / 2;
    }
  }
  // Enter across the open side, on the far side of the road from the gap's way round.
  const side = wrapSigned(gapAngle - roadAngle) > 0 ? -1 : 1;
  const inAngle = roadAngle + side * crng.range(0.18, 0.4) * openArc;
  const passAngle = inAngle + wrapSigned(gapAngle - inAngle) * crng.range(0.4, 0.6);
  const passBy = padR + 52 + crng.range(0, 40);
  const at = (angle: number, r: number): Point2 => ({ x: dcos(angle) * r, z: dsin(angle) * r });
  const creekCtrl: Point2[] = [at(inAngle, edge), at(inAngle, 430), at(inAngle + (passAngle - inAngle) * 0.4, 240), at(passAngle, passBy), at(gapAngle, 250), at(gapAngle, 480), at(gapAngle, edge)];
  const creekPts = wiggle(catmullRom(creekCtrl, 12), new Noise2D(crng.fork('wiggle')), 12, [at(passAngle, passBy)]);
  keepOff(creekPts, padR + 30);
  const creek = makePolyline(creekPts);

  // Fords: where the road crosses, and a few of its own near the camp.
  const fords: Ford[] = [];
  const crossing = crossings(creek, roadLine);
  for (const s of crossing) {
    const p = pointAt(creek, s);
    fords.push({ x: p.x, z: p.z, s, road: true });
  }
  const frng = crng.fork('fords');
  const nearS: number[] = [];
  for (let s = 0; s < creek.total; s += 8) {
    const p = pointAt(creek, s);
    if (p.x * p.x + p.z * p.z < 340 * 340) nearS.push(s);
  }
  const fordCount = frng.int(L.fords[0]!, L.fords[1]!);
  for (let attempt = 0; fords.filter((f) => !f.road).length < fordCount && attempt < 60 && nearS.length > 0; attempt++) {
    const s = frng.pick(nearS);
    if (fords.every((f) => Math.abs(f.s - s) > 60)) {
      const p = pointAt(creek, s);
      fords.push({ x: p.x, z: p.z, s, road: false });
    }
  }
  fords.sort((a, b) => a.s - b.s); // unique: fords are at least 60 m apart along the creek

  // --- Heights. -------------------------------------------------------------------------
  const hf = new Heightfield(W.size, W.cellSize);
  const { n } = hf;
  const heights = hf.heights;
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) heights[j * n + i] = baseHeight(hf.coord(i), z);
  }

  // The creek's bed falls all the way from where it enters to where it leaves.
  // Deep enough that its banks, two or three cells of the heightfield, are a real barrier.
  const inH = baseHeight(creekCtrl[0]!.x, creekCtrl[0]!.z) - 4;
  const knotS = [0, creek.total * 0.3, creek.total * 0.5, creek.total * 0.75, creek.total];
  const knotH = [inH, Math.min(inH - 2, W.padHeight - 1), W.padHeight - 4, W.padHeight - 5.5, W.padHeight - 8];
  for (let k = 1; k < knotH.length; k++) knotH[k] = Math.min(knotH[k]!, knotH[k - 1]! - 0.5);
  const bedAt = (s: number): number => {
    for (let k = 1; k < knotS.length; k++) {
      if (s <= knotS[k]!) return lerp(knotH[k - 1]!, knotH[k]!, (s - knotS[k - 1]!) / Math.max(knotS[k]! - knotS[k - 1]!, 1e-6));
    }
    return knotH[knotH.length - 1]!;
  };
  const bankAt = (s: number): number => {
    let ford = 0;
    for (const f of fords) ford = Math.max(ford, 1 - smoothstep(7, 16, Math.abs(s - f.s)));
    return lerp(L.creekBank, L.fordBank, ford);
  };
  const halfBed = W.creekWidth / 2;
  const creekDist = new Float32Array(n * n).fill(Infinity);
  const creekIndex = new PolylineIndex(creek, 60);
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      creekIndex.closest(x, z, hit);
      if (hit.dist === Infinity) continue;
      const k = j * n + i;
      creekDist[k] = hit.dist;
      const target = bedAt(hit.s) + Math.max(0, hit.dist - halfBed) * bankAt(hit.s);
      heights[k] = smin(heights[k]!, target, 1.2);
    }
  }

  // The road, graded flat across its width and gently along it.
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

  // The pad: flat ground for the camp.
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      const m = 1 - smoothstep(padR, padR + W.padBlend, Math.sqrt(x * x + z * z));
      if (m <= 0) continue;
      const k = j * n + i;
      heights[k] = lerp(heights[k]!, W.padHeight, m);
    }
  }
  hf.finalize();

  // --- Surfaces. ------------------------------------------------------------------------
  const rockTan = dtanDeg(34);
  const surfaces = hf.surfaces;
  for (let j = 0; j < n; j++) {
    const z = hf.coord(j);
    for (let i = 0; i < n; i++) {
      const x = hf.coord(i);
      const k = j * n + i;
      const r0 = Math.sqrt(x * x + z * z);
      const i0 = i > 0 ? i - 1 : i;
      const i1 = i < n - 1 ? i + 1 : i;
      const j0 = j > 0 ? j - 1 : j;
      const j1 = j < n - 1 ? j + 1 : j;
      const gx = (heights[j * n + i1]! - heights[j * n + i0]!) / ((i1 - i0) * hf.cell);
      const gz = (heights[j1 * n + i]! - heights[j0 * n + i]!) / ((j1 - j0) * hf.cell);
      const slope = Math.sqrt(gx * gx + gz * gz);
      let s: Surface = Surface.Grass;
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

  // --- Backdrop: the same land to the horizon, coarse. ----------------------------------
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
      const tuck = 8 * (1 - smoothstep(inner - 90, inner - 10, d));
      bHeights[j * bn + i] = baseHeight(x, z) - tuck;
    }
  }

  return {
    heightfield: hf,
    features: {
      saddles: [],
      passes: [],
      creek,
      road: roadLine,
      creekPasses: [0, 0],
      roadPass: 0,
      site: { x: 0, z: 0, ux: road.x, uz: road.z, radius: padR, height: W.padHeight },
      ridges,
      fords,
      openAngle,
      openArc,
    },
    backdrop: { size: bSize, cell: bCell, n: bn, heights: bHeights },
  };
}

/**
 * A camp face's profile, x from the crest (0) to the toe (1): a shoulder, a cliff band too
 * steep to climb, and a toe that runs out onto the floor.
 */
function cliffed(x: number): number {
  if (x >= 1) return 0;
  if (x < 0.2) return 1 - 0.08 * smoothstep(0, 0.2, x);
  if (x < 0.38) return 0.92 - 0.6 * smoothstep(0.2, 0.38, x);
  return 0.32 * (1 - smoothstep(0.38, 1, x));
}

/** Like max(a, b), but rounds the crease over width k. */
function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

function wrapPositive(a: number): number {
  return a - TWO_PI * Math.floor(a / TWO_PI);
}

/** An angle into [−π, π). */
function wrapSigned(a: number): number {
  return wrapPositive(a + TWO_PI / 2) - TWO_PI / 2;
}

/** Pushes path points radially out of a circle around the camp. */
function keepOff(points: Point2[], radius: number): void {
  for (const p of points) {
    const r = Math.sqrt(p.x * p.x + p.z * p.z);
    if (r < radius && r > 1e-6) {
      p.x *= radius / r;
      p.z *= radius / r;
    }
  }
}

/** Arc lengths along `a` where it crosses `b`, in order along `a`. */
function crossings(a: Polyline, b: Polyline): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < a.points.length; i++) {
    const p = a.points[i]!;
    const q = a.points[i + 1]!;
    for (let j = 0; j + 1 < b.points.length; j++) {
      const r = b.points[j]!;
      const s = b.points[j + 1]!;
      const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
      if (d === 0) continue;
      const t = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d;
      const u = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push(a.lengths[i]! + (a.lengths[i + 1]! - a.lengths[i]!) * t);
    }
  }
  return out;
}
