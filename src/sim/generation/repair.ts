import type { GenTuning } from '../../config/tuning';
import { DEG, dcos, dsin } from '../kernel/core/detmath';
import { wrapAngle } from '../kernel/core/math';
import type { Rng } from '../kernel/core/rng';
import type { ColliderSet } from '../kernel/world/colliders';
import type { SpatialGrid } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Camp, GuardSpawn } from './camp';
import { analyzeCamp, type AnalysisParts, type CampAnalysis } from './campAnalysis';
import { nearestWalkable } from './patrols';
import { perchViewshed, type PerchSpot } from './perches';
import { centreOf, type Raster } from './raster';
import { routinePose, type Routine, type RoutinePose } from './routine';
import { validateCamp, type RuleName, type Validation } from './validate';

/**
 * Repair (D8): a bounded greedy search over a fixed list of local operators, as the research
 * proposed. A camp that fails validation tries a change, re-analyses, and keeps it only if
 * the camp comes closer to valid (fewer rules broken, then by how much). Each attempt draws
 * from its own labelled fork, and the search stops after `repairAttempts` re-analyses (rule
 * 18), so a seed's camp and its repairs are deterministic.
 *
 * The operators here are the ones that touch only guards' timetables and posts, so a repair
 * never moves a wall: shift a patrol's phase, turn a post, move a sentry along its arc. (The
 * plan's others: a light circuit changes nothing under D's daylight sight law; swapping a
 * module and adding cover are left for when these prove too weak.)
 */
export interface Repaired {
  analysis: CampAnalysis;
  parts: AnalysisParts;
  validation: Validation;
  /** The operators kept, in order: the camp as generated was valid if empty and validation passed. */
  repairs: string[];
  /** Re-analyses spent, of the budget. */
  attempts: number;
  /** The rules the camp broke as first built: what repair had to fix. */
  firstFailed: RuleName[];
}

interface Attempt {
  name: string;
  /** Applies the change; returns how to take it back. */
  apply(): () => void;
}

export function validateAndRepair(camp: Camp, hf: Heightfield, colliders: ColliderSet, grid: SpatialGrid, raster: Raster, gen: GenTuning, rng: Rng): Repaired {
  const analyse = () => analyzeCamp(camp, hf, colliders, grid, gen, raster);
  let { analysis, parts } = analyse();
  let validation = validateCamp(camp, analysis, parts, hf, grid, gen);
  const firstFailed = [...validation.failed];
  const repairs: string[] = [];
  let attempts = 0;
  const budget = gen.validation.repairAttempts;
  while (!validation.ok && attempts < budget) {
    const fork = rng.fork(`repair-${repairs.length}`);
    // Getting a post out of an offending perch's sight is the likeliest fix, so those go first.
    const all = fork.shuffle(attemptsFor(camp, validation, raster, parts, hf, grid, gen));
    const tries = [...all.filter((t) => t.name.startsWith('hide')), ...all.filter((t) => !t.name.startsWith('hide'))];
    let kept = false;
    for (const t of tries) {
      if (attempts >= budget) break;
      attempts++;
      const undo = t.apply();
      const next = analyse();
      const v = validateCamp(camp, next.analysis, next.parts, hf, grid, gen);
      if (v.score < validation.score - 1e-9) {
        analysis = next.analysis;
        parts = next.parts;
        validation = v;
        repairs.push(t.name);
        kept = true;
        break;
      }
      undo();
    }
    if (!kept) break;
  }
  return { analysis, parts, validation, repairs, attempts, firstFailed };
}

/** Every change that might help the rules that failed. */
function attemptsFor(camp: Camp, validation: Validation, raster: Raster, parts: AnalysisParts, hf: Heightfield, grid: SpatialGrid, gen: GenTuning): Attempt[] {
  const V = gen.validation;
  const failed = validation.failed;
  // The perches behind any broken perch rule: a post can be moved out of their sight.
  const offending = [...new Set(validation.rules.filter((r) => !r.ok).flatMap((r) => r.perches))];
  const out: Attempt[] = [];
  const timing = failed.some((r) => r === 'two ways out' || r === 'infiltration' || r === 'systems' || r === 'clusters' || r === 'perch witnessed' || r === 'crux');
  const posting = failed.some((r) => r === 'perch coverage' || r === 'perch witnessed' || r === 'two ways out' || r === 'infiltration' || r === 'clusters' || r === 'systems');
  camp.guards.forEach((g, index) => {
    if (timing && g.routine.offset !== undefined) {
      for (let k = 1; k < V.repairShifts; k++) {
        const delta = (g.routine.period * k) / V.repairShifts;
        out.push({ name: `shift ${g.role} ${index} by ${Math.round(delta)} s`, apply: () => shift(g, delta, hf) });
      }
    }
    if (posting && !g.elevated && isPost(g.routine)) {
      for (const deg of V.repairTurns) {
        out.push({ name: `turn ${g.role} ${index} by ${deg}°`, apply: () => turn(g, deg * DEG, hf) });
      }
      for (const metres of V.repairMoves) {
        out.push({ name: `move ${g.role} ${index} ${metres} m along his arc`, apply: () => move(g, metres, hf, grid) });
      }
      if (offending.length > 0) out.push({ name: `hide ${g.role} ${index}`, apply: () => hide(g, offending, raster, parts.perches, gen, hf, grid) });
    }
  });
  return out;
}

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

function isPost(r: Routine): boolean {
  return r.offset === undefined && r.legs.every((l) => l.kind === 'hold');
}

/** Where a guard's spawn says he starts, from his routine. */
function respawn(g: GuardSpawn, hf: Heightfield): void {
  routinePose(g.routine, 0, pose);
  g.x = pose.x;
  g.z = pose.z;
  g.faceX = -dsin(pose.yaw);
  g.faceZ = -dcos(pose.yaw);
  if (!g.elevated) g.y = hf.heightAt(pose.x, pose.z);
}

function shift(g: GuardSpawn, delta: number, hf: Heightfield): () => void {
  const before = g.routine;
  g.routine = { ...before, offset: (before.offset! + delta) % before.period };
  respawn(g, hf);
  return () => {
    g.routine = before;
    respawn(g, hf);
  };
}

function turn(g: GuardSpawn, by: number, hf: Heightfield): () => void {
  const before = g.routine;
  g.routine = { ...before, legs: before.legs.map((l) => (l.kind === 'hold' ? { ...l, yawFrom: wrapAngle(l.yawFrom + by), yawTo: wrapAngle(l.yawTo + by) } : l)) };
  respawn(g, hf);
  return () => {
    g.routine = before;
    respawn(g, hf);
  };
}

/** Moves a post to the nearest walkable cell, within `hideReach`, that the given perches can't see his chest in. */
function hide(g: GuardSpawn, offending: readonly number[], R: Raster, perches: readonly PerchSpot[], gen: GenTuning, hf: Heightfield, grid: SpatialGrid): () => void {
  const before = g.routine;
  const first = before.legs[0]!;
  if (first.kind !== 'hold') return () => undefined;
  const views = offending.map((p) => perchViewshed(R, hf, perches[p]!));
  const reach = gen.validation.hideReach;
  let best: { x: number; z: number; d: number } | null = null;
  for (let c = 0; c < R.na * R.nb; c++) {
    if (!R.walk[c]) continue;
    const m = centreOf(R, c);
    const d = (m.x - first.x) * (m.x - first.x) + (m.z - first.z) * (m.z - first.z);
    if (d > reach * reach || (best && d >= best.d)) continue;
    const chest = m.y + gen.sight.chest;
    if (views.some((v) => chest >= v[c]!)) continue;
    const cell = nearestWalkable(grid.site, m.x, m.z);
    if (cell < 0) continue;
    best = { x: grid.site.x0 + ((cell % grid.site.nx) + 0.5) * grid.site.cell, z: grid.site.z0 + (Math.floor(cell / grid.site.nx) + 0.5) * grid.site.cell, d };
  }
  if (!best) return () => undefined;
  const { x, z } = best;
  g.routine = { ...before, legs: before.legs.map((l) => (l.kind === 'hold' ? { ...l, x, z } : l)) };
  respawn(g, hf);
  return () => {
    g.routine = before;
    respawn(g, hf);
  };
}

/** Moves a post sideways to where he looks (along his arc), onto the nearest walkable cell. */
function move(g: GuardSpawn, metres: number, hf: Heightfield, grid: SpatialGrid): () => void {
  const before = g.routine;
  const first = before.legs[0]!;
  if (first.kind !== 'hold') return () => undefined;
  // Yaw 0 faces −z, so his right hand points +x there.
  const c = nearestWalkable(grid.site, first.x + dcos(first.yawTo) * metres, first.z - dsin(first.yawTo) * metres);
  if (c < 0) return () => undefined;
  const L = grid.site;
  const x = L.x0 + ((c % L.nx) + 0.5) * L.cell;
  const z = L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell;
  g.routine = { ...before, legs: before.legs.map((l) => (l.kind === 'hold' ? { ...l, x, z } : l)) };
  respawn(g, hf);
  return () => {
    g.routine = before;
    respawn(g, hf);
  };
}
