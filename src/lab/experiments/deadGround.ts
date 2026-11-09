import type { Tuning } from '../../config/tuning';
import { campMission, generateWorld, routinePose, type RoutinePose } from '../../sim/generation';
import { Rng } from '../../sim/kernel/core/rng';
import { Blocks } from '../../sim/kernel/world/colliders';
import { Cell, Edge, cellIndex, type GridLayer } from '../../sim/kernel/world/grid';
import { emptyHit, raycast, type QueryView } from '../../sim/kernel/world/query';
import { Solids } from '../../sim/kernel/world/solids';
import type { World } from '../../sim/kernel/world/world';
import type { Arm, Experiment } from '../experiment';
import { median } from '../stats';

/**
 * Is there anywhere to go? For guards a perch can see: how far is the nearest ground it
 * can't, and does hiding from what the camp believes also hide you from where the shooter
 * is? Each arm is a way of choosing where to hide. Geometry only: nothing is simulated,
 * and no guard moves. (Why this matters: docs/camp-engine.md, the gallery.)
 */

interface Perch {
  x: number;
  z: number;
  coverage: number;
}

/** How a man chooses where to go. */
type Policy =
  | { kind: 'exact' }
  | { kind: 'one-point'; off: number }
  | { kind: 'listed-near'; off: number; skipTrue: boolean }
  | { kind: 'listed-bearing'; deg: number; skipTrue: boolean }
  | { kind: 'roof' };

const POLICIES: ReadonlyArray<Arm & { policy: Policy }> = [
  { name: 'knows the exact perch', policy: { kind: 'exact' } },
  { name: 'one point, 30 m off', policy: { kind: 'one-point', off: 30 } },
  { name: 'one point, 60 m off', policy: { kind: 'one-point', off: 60 } },
  { name: 'listed perches, 60 m off', policy: { kind: 'listed-near', off: 60, skipTrue: false } },
  { name: 'listed perches, bearing', policy: { kind: 'listed-bearing', deg: 15, skipTrue: false } },
  { name: 'he is off the list, 60 m', policy: { kind: 'listed-near', off: 60, skipTrue: true } },
  { name: 'he is off the list, bearing', policy: { kind: 'listed-bearing', deg: 15, skipTrue: true } },
  { name: 'nearest roof', policy: { kind: 'roof' } },
];

const hit = emptyHit();

function sees(view: QueryView, ex: number, ey: number, ez: number, x: number, y: number, z: number): boolean {
  const dx = x - ex;
  const dy = y - ey;
  const dz = z - ez;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  raycast(view, ex, ey, ez, dx / d, dy / d, dz / d, d, Blocks.Sight | Blocks.Bullet, hit, -1);
  return hit.what === 'none';
}

/** Metres of walkable path, breadth first, to the first cell `done` accepts: the cell, or −1 within `limit` metres. */
function nearest(L: GridLayer, start: number, limit: number, done: (cell: number, x: number, z: number) => boolean): { cell: number; metres: number } {
  const seen = new Set<number>([start]);
  let frontier = [start];
  const steps = Math.floor(limit / L.cell);
  for (let step = 0; step <= steps && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const c of frontier) {
      const i = c % L.nx;
      const j = Math.floor(c / L.nx);
      if (done(c, L.x0 + (i + 0.5) * L.cell, L.z0 + (j + 0.5) * L.cell)) return { cell: c, metres: step * L.cell };
      const go = (k: number): void => {
        if (!seen.has(k) && (L.flags[k]! & Cell.Walkable) !== 0) {
          seen.add(k);
          next.push(k);
        }
      };
      if (i + 1 < L.nx && (L.edges[c]! & Edge.East) !== 0) go(c + 1);
      if (j + 1 < L.nz && (L.edges[c]! & Edge.North) !== 0) go(c + L.nx);
      if (i > 0 && (L.edges[c - 1]! & Edge.East) !== 0) go(c - 1);
      if (j > 0 && (L.edges[c - L.nx]! & Edge.North) !== 0) go(c - L.nx);
    }
    frontier = next;
  }
  return { cell: -1, metres: Infinity };
}

function perchesToBlock(p: Policy, truth: Perch, all: readonly Perch[], g: { x: number; z: number }, dice: Rng): Perch[] {
  if (p.kind === 'exact') return [truth];
  if (p.kind === 'one-point') {
    const a = dice.next() * 2 * Math.PI;
    return [{ x: truth.x + Math.cos(a) * p.off, z: truth.z + Math.sin(a) * p.off, coverage: 0 }];
  }
  if (p.kind === 'listed-near') {
    const a = dice.next() * 2 * Math.PI;
    const bx = truth.x + Math.cos(a) * p.off;
    const bz = truth.z + Math.sin(a) * p.off;
    return all.filter((q) => (q.x - bx) * (q.x - bx) + (q.z - bz) * (q.z - bz) <= 100 * 100 && !(p.skipTrue && q === truth));
  }
  if (p.kind === 'listed-bearing') {
    const bearing = Math.atan2(truth.z - g.z, truth.x - g.x) + ((dice.next() * 2 - 1) * p.deg * Math.PI) / 180;
    return all.filter((q) => {
      const d = Math.atan2(q.z - g.z, q.x - g.x) - bearing;
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) <= (20 * Math.PI) / 180 && !(p.skipTrue && q === truth);
    });
  }
  return [];
}

function runCamp(world: World, tuning: Tuning, seed: string, arm: Arm & { policy: Policy }): Record<string, number> {
  const view: QueryView = { world, solids: new Solids(world.colliders), bodies: [] };
  const L = world.grid.site;
  const run = tuning.bodies.guard.speed.sprint;
  const crouch = tuning.bodies.guard.eyeHeight.crouch;
  const prone = tuning.bodies.player.eyeHeight.prone;
  const eye = (p: { x: number; z: number }): number => world.terrain.heightAt(p.x, p.z) + prone;
  const perches = [...(world.report.camp!.perches as readonly Perch[])].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z);
  const chosen = [perches[0]!, perches[Math.floor(perches.length / 3)]!, perches[Math.floor((2 * perches.length) / 3)]!];
  const dice = new Rng(seed, `dead-ground-${arm.name}`);
  const pose = {} as RoutinePose;
  const distances: number[] = [];
  let hidden = 0;
  let total = 0;
  let inView = 0;
  let samples = 0;
  for (const truth of chosen) {
    for (const t of [10, 80, 150, 220]) {
      for (const g of world.camp.guards) {
        if (g.elevated) continue;
        routinePose(g.routine, t, pose);
        samples++;
        const ground = world.terrain.heightAt(pose.x, pose.z);
        if (!sees(view, truth.x, eye(truth), truth.z, pose.x, ground + tuning.bodies.guard.eyeHeight.stand, pose.z)) continue;
        inView++;
        const start = cellIndex(L, pose.x, pose.z);
        if (start < 0) continue;
        const block = perchesToBlock(arm.policy, truth, perches, pose, dice);
        const found = nearest(L, start, 40, (c, x, z) => {
          if (arm.policy.kind === 'roof') return (L.flags[c]! & Cell.Roofed) !== 0;
          if (block.length === 0) return false;
          const y = world.terrain.heightAt(x, z) + crouch;
          return !block.some((q) => sees(view, q.x, eye(q), q.z, x, y, z));
        });
        total++;
        if (found.cell < 0) continue;
        distances.push(found.metres);
        const x = L.x0 + ((found.cell % L.nx) + 0.5) * L.cell;
        const z = L.z0 + (Math.floor(found.cell / L.nx) + 0.5) * L.cell;
        if (!sees(view, truth.x, eye(truth), truth.z, x, world.terrain.heightAt(x, z) + crouch, z)) hidden++;
      }
    }
  }
  return {
    view: samples > 0 ? inView / samples : NaN,
    twoSeconds: total > 0 ? distances.filter((d) => d <= 2 * run).length / total : NaN,
    fiveSeconds: total > 0 ? distances.filter((d) => d <= 5 * run).length / total : NaN,
    metres: median(distances),
    hidden: distances.length > 0 ? hidden / distances.length : NaN,
  };
}

export const deadGround: Experiment = {
  name: 'dead-ground',
  about: "how far guards in a perch's view are from ground it can't see, by how they choose it",
  series: 'lab-f-dead-ground',
  camps: 12,
  arms: POLICIES,
  measures: [
    { key: 'view', label: 'in view', kind: 'mean' },
    { key: 'twoSeconds', label: 'reached in 2 s', kind: 'mean' },
    { key: 'fiveSeconds', label: 'reached in 5 s', kind: 'mean' },
    { key: 'metres', label: 'run (m)', kind: 'mean' },
    { key: 'hidden', label: 'really hidden', kind: 'mean' },
  ],
  run(seed, arm, tuning) {
    return runCamp(generateWorld(campMission(seed), tuning), tuning, seed, arm as Arm & { policy: Policy });
  },
};
