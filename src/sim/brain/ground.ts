import type { Tuning } from '../../config/tuning';
import { dcos } from '../kernel/core/detmath';
import { Cell, Edge, cellIndex } from '../kernel/world/grid';
import type { World } from '../kernel/world/world';
import { navigatorOf } from './nav';

/**
 * Getting out of the line of fire (Lab F, docs/camp-engine.md): the nearest place, on foot,
 * that no likely firing point in the direction of the threat can see.
 *
 * A man who hides from one point he's guessed at is usually still in view of the real one
 * (`npm run experiment -- dead-ground`: 30 m wrong, really hidden 30% of the time). A camp
 * knows its own ground, though: which ridges overlook it is a static fact a prepared
 * defender has, so a man can hide from every listed perch that way, and he's safe a few
 * metres off. It reads only the static world (rule 13). A shooter somewhere the list
 * doesn't have is the counter: he catches about one man in five still in the open.
 *
 * Breadth first over the grid's fine layer, with a budget on the cells it looks at (rule
 * 18). Each candidate is checked with real rays, because the analysis's coarse raster
 * disagrees with the truth about a quarter of the time.
 */

interface Point {
  x: number;
  z: number;
}

/** The spot to go to, or null if there's none within reach: he's outside the fine layer, or nothing hides him. */
export function groundSpot(world: World, tuning: Tuning, x: number, z: number, threatX: number, threatZ: number): Point | null {
  const F = tuning.brain.fight.drill;
  const L = world.grid.site;
  const start = cellIndex(L, x, z);
  if (start < 0) return null;
  const nav = navigatorOf(world, tuning);
  const blockers = perchesToward(world, tuning, x, z, threatX, threatZ);
  const eye = tuning.bodies.player.eyeHeight.prone;
  const head = tuning.bodies.guard.eyeHeight.stand;
  const heightAt = (p: Point): number => world.terrain.heightAt(p.x, p.z);
  const seen = new Set<number>([start]);
  let frontier = [start];
  let looked = 0;
  const steps = Math.floor(F.maxRun / L.cell);
  for (let step = 0; step <= steps && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const c of frontier) {
      if (++looked > F.cells) return null;
      const i = c % L.nx;
      const j = Math.floor(c / L.nx);
      const here = { x: L.x0 + (i + 0.5) * L.cell, z: L.z0 + (j + 0.5) * L.cell };
      const y = heightAt(here) + head;
      if (!blockers.some((p) => nav.seesPoint(p.x, heightAt(p) + eye, p.z, here.x, y, here.z))) return here;
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
  return null;
}

/** The listed perches near the bearing he believes it came from, or the believed point itself if there are none. */
function perchesToward(world: World, tuning: Tuning, x: number, z: number, threatX: number, threatZ: number): Point[] {
  const dx = threatX - x;
  const dz = threatZ - z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const cosLimit = dcos((tuning.brain.fight.drill.bearingDeg * Math.PI) / 180);
  const out: Point[] = [];
  for (const p of world.report.camp?.perches ?? []) {
    const px = p.x - x;
    const pz = p.z - z;
    const d = Math.sqrt(px * px + pz * pz) || 1;
    if ((dx * px + dz * pz) / (len * d) >= cosLimit) out.push({ x: p.x, z: p.z });
  }
  return out.length > 0 ? out : [{ x: threatX, z: threatZ }];
}
