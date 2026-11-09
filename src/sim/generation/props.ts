import type { GenTuning } from '../../config/tuning';
import { dtanDeg } from '../kernel/core/detmath';
import { smoothstep } from '../kernel/core/math';
import type { Rng } from '../kernel/core/rng';
import { Blocks, type ColliderSet } from '../kernel/world/colliders';
import { makeTerrainSample, type Heightfield } from '../kernel/world/heightfield';
import { Surface } from '../kernel/world/surfaces';
import { Noise2D } from './noise';
import { closestOnPolyline, type PathHit } from './paths';
import { CellStreams } from './scatter';
import type { TerrainFeatures } from './terrain';

/**
 * Natural cover: conifers, rocks and bushes, scattered on jittered grids by masks for
 * forest, slope and distance from the camp, road and creek.
 *
 * Every cell of a grid draws from its own stream (scatter.ts), so a prop depends only on
 * the seed, its kind and its cell: its `cell` is its id, stable whatever happens to the
 * cells around it.
 *
 * Trunks block everything. Rocks block everything, and low ones can be stepped onto.
 * Bushes block sight only, so they hide a prone player without stopping anyone.
 */

export interface Tree {
  /** The cell of the tree grid it grew from: its id among the trees. */
  cell: number;
  x: number;
  y: number;
  z: number;
  trunkR: number;
  /** Height of the bare trunk below the canopy. */
  trunkH: number;
  canopyR: number;
  /** Height of the canopy cone. */
  canopyH: number;
  /** Rotation about the vertical axis, as a unit vector. */
  ux: number;
  uz: number;
}

export interface Rock {
  /** The cell of the rock grid it lies in: its id among the rocks. */
  cell: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ux: number;
  uz: number;
}

export interface Bush {
  /** The cell of the bush grid it grows from: its id among the bushes. */
  cell: number;
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
}

export interface Props {
  trees: Tree[];
  rocks: Rock[];
  bushes: Bush[];
}

export function scatterProps(
  rng: Rng,
  hf: Heightfield,
  features: TerrainFeatures,
  colliders: ColliderSet,
  gen: GenTuning,
): Props {
  const P = gen.props;
  const W = gen.world;
  const forest = new Noise2D(rng.fork('forest'));
  const sample = makeTerrainSample();
  const hit: PathHit = { dist: 0, s: 0, x: 0, z: 0 };
  const half = hf.size / 2;
  const tan38 = dtanDeg(38);
  const tan18 = dtanDeg(18);
  const tan40 = dtanDeg(40);
  // Clear of the camp's pad: distances below are from the site's centre.
  const site = features.site;
  const keepClear = site.radius + 14;

  const nearPath = (x: number, z: number, roadPad: number, creekPad: number): boolean => {
    closestOnPolyline(features.road, x, z, W.roadWidth / 2 + roadPad, hit);
    if (hit.dist !== Infinity) return true;
    closestOnPolyline(features.creek, x, z, (features.creekWidth ?? W.creekWidth) / 2 + creekPad, hit);
    return hit.dist !== Infinity;
  };

  // --- Trees. ------------------------------------------------------------------------
  const trees: Tree[] = [];
  const treeCells = new CellStreams(rng, 'trees');
  const tc = P.treeSpacing;
  const treeCols = Math.ceil(hf.size / tc);
  for (let cj = 0; cj < treeCols; cj++) {
    const gz = -half + cj * tc;
    for (let ci = 0; ci < treeCols; ci++) {
      const gx = -half + ci * tc;
      const trng = treeCells.at(ci, cj);
      const x = gx + tc * trng.range(0.15, 0.85);
      const z = gz + tc * trng.range(0.15, 0.85);
      const roll = trng.next();
      const r0 = Math.sqrt((x - site.x) * (x - site.x) + (z - site.z) * (z - site.z));
      if (r0 < keepClear) continue;
      hf.sample(x, z, sample);
      if (sample.slopeTan > tan38 || sample.surface === Surface.Water || sample.surface === Surface.Rock) continue;
      // Forest patches, a little denser on moderate slopes, thinning toward the camp.
      const f = forest.fbm(x / 170, z / 170, 3);
      const density = smoothstep(-0.12, 0.18, f) * (0.75 + 0.5 * smoothstep(0, tan18, sample.slopeTan)) * smoothstep(keepClear, keepClear + 60, r0);
      if (roll > P.treeCover * density) continue;
      if (nearPath(x, z, 3, 3)) continue;
      const scale = trng.range(0.75, 1.25);
      const rot = trng.unit2();
      const tree: Tree = {
        cell: cj * treeCols + ci,
        x,
        y: sample.height,
        z,
        trunkR: 0.22 * scale,
        trunkH: trng.range(1.6, 2.6) * scale,
        canopyR: trng.range(1.7, 2.6) * scale,
        canopyH: trng.range(6.5, 9.5) * scale,
        ux: rot.x,
        uz: rot.z,
      };
      trees.push(tree);
      colliders.add({
        kind: 'cyl',
        x,
        z,
        y0: tree.y - 0.5,
        y1: tree.y + tree.trunkH + tree.canopyH * 0.6,
        r: tree.trunkR + 0.06,
        flags: Blocks.All,
        surface: Surface.Wood,
      });
    }
  }

  // --- Rocks: more on steep ground and crests. ---------------------------------------
  const rocks: Rock[] = [];
  const rockCells = new CellStreams(rng, 'rocks');
  const rc = P.rockSpacing;
  const rockCols = Math.ceil(hf.size / rc);
  for (let cj = 0; cj < rockCols; cj++) {
    const gz = -half + cj * rc;
    for (let ci = 0; ci < rockCols; ci++) {
      const gx = -half + ci * rc;
      const rrng = rockCells.at(ci, cj);
      const x = gx + rc * rrng.range(0.1, 0.9);
      const z = gz + rc * rrng.range(0.1, 0.9);
      const roll = rrng.next();
      const r0 = Math.sqrt((x - site.x) * (x - site.x) + (z - site.z) * (z - site.z));
      if (r0 < keepClear - 6) continue;
      hf.sample(x, z, sample);
      if (sample.surface === Surface.Water) continue;
      const p = 0.07 + 0.45 * smoothstep(tan18, tan40, sample.slopeTan) + (sample.surface === Surface.Rock ? 0.2 : 0);
      if (roll > p) continue;
      if (nearPath(x, z, 1.5, 0.5)) continue;
      const big = rrng.chance(0.25);
      const s = big ? rrng.range(1.2, 2.4) : rrng.range(0.35, 1.0);
      const rot = rrng.unit2();
      const rock: Rock = {
        cell: cj * rockCols + ci,
        x,
        y: sample.height,
        z,
        sx: s * rrng.range(0.8, 1.4),
        sy: s * rrng.range(0.45, 0.8),
        sz: s * rrng.range(0.8, 1.3),
        ux: rot.x,
        uz: rot.z,
      };
      rocks.push(rock);
      colliders.add({
        kind: 'box',
        x,
        z,
        y0: rock.y - 1,
        y1: rock.y + rock.sy * 0.8,
        hx: rock.sx * 0.75,
        hz: rock.sz * 0.75,
        ux: rock.ux,
        uz: rock.uz,
        flags: Blocks.All,
        surface: Surface.Rock,
      });
    }
  }

  // --- Bushes: forest edges and the open valley floor. -------------------------------
  const bushes: Bush[] = [];
  const bushCells = new CellStreams(rng, 'bushes');
  const bc = P.bushSpacing;
  const bushCols = Math.ceil(hf.size / bc);
  for (let cj = 0; cj < bushCols; cj++) {
    const gz = -half + cj * bc;
    for (let ci = 0; ci < bushCols; ci++) {
      const gx = -half + ci * bc;
      const brng = bushCells.at(ci, cj);
      const x = gx + bc * brng.range(0.1, 0.9);
      const z = gz + bc * brng.range(0.1, 0.9);
      const roll = brng.next();
      const r0 = Math.sqrt((x - site.x) * (x - site.x) + (z - site.z) * (z - site.z));
      if (r0 < keepClear - 4) continue;
      hf.sample(x, z, sample);
      if (sample.slopeTan > tan38 || sample.surface === Surface.Water || sample.surface === Surface.Rock) continue;
      const f = forest.fbm(x / 170, z / 170, 3);
      const edge = 1 - Math.abs(smoothstep(-0.3, 0.3, f) * 2 - 1); // peaks at forest edges
      const p = 0.05 + 0.22 * edge + 0.06 * (1 - smoothstep(150, 320, r0));
      if (roll > p) continue;
      if (nearPath(x, z, 1, 1)) continue;
      const bush: Bush = { cell: cj * bushCols + ci, x, y: sample.height, z, r: brng.range(0.7, 1.5), h: brng.range(0.7, 1.3) };
      bushes.push(bush);
      colliders.add({
        kind: 'cyl',
        x,
        z,
        y0: bush.y - 0.3,
        y1: bush.y + bush.h,
        r: bush.r * 0.8,
        flags: Blocks.Sight,
        surface: Surface.Grass,
      });
    }
  }

  return { trees, rocks, bushes };
}
