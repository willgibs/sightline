import type { Tuning } from '../../config/tuning';
import { dcos } from '../kernel/core/detmath';
import { Cell, Edge, cellIndex, type GridLayer } from '../kernel/world/grid';
import { navigatorOf } from './nav';
import type { Ground } from './mind';

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
 * Crouched is what it looks for, because from there he can fight. A fold of the ground that
 * only hides a man lying flat is taken when it's clearly nearer. With neither in reach
 * there's nothing for it but to get down where he is.
 *
 * Breadth first over the grid's fine layer, with budgets on the cells it walks and the rays
 * it casts (rule 18). Each candidate is checked with real rays, because the analysis's
 * coarse raster disagrees with the truth about a quarter of the time.
 */

interface Point {
  x: number;
  z: number;
}

/** Where to go, and how low he has to be there for it to hide him. */
export interface GroundSpot extends Point {
  stance: 'crouch' | 'prone';
}

/** Which cells a search has been to, by generation, so a search costs nothing to start. Working memory: nothing carries over between calls. */
const visits = new WeakMap<GridLayer, { seen: Uint32Array; now: number }>();

function visited(L: GridLayer): { seen: Uint32Array; now: number } {
  let v = visits.get(L);
  if (!v) {
    v = { seen: new Uint32Array(L.nx * L.nz), now: 0 };
    visits.set(L, v);
  }
  v.now++;
  return v;
}

/**
 * The spot to go to, or null if there's none within reach: he's outside the fine layer, or
 * nothing hides him. `wide`: he only has a crack or a strike to go on, so the bearing is rough.
 */
export function groundSpot(world: Ground, tuning: Tuning, x: number, z: number, threatX: number, threatZ: number, wide = false): GroundSpot | null {
  const F = tuning.brain.fight.drill;
  const L = world.grid.site;
  const start = cellIndex(L, x, z);
  if (start < 0) return null;
  const nav = navigatorOf(world, tuning);
  const eye = tuning.bodies.player.eyeHeight.prone;
  const eyes = perchesToward(world, tuning, x, z, threatX, threatZ, wide).map((p) => ({ x: p.x, y: world.terrain.heightAt(p.x, p.z) + eye, z: p.z }));
  const heads = tuning.bodies.guard.eyeHeight;
  let rays = 0;
  const hidden = (px: number, py: number, pz: number): boolean => {
    for (const e of eyes) {
      rays++;
      if (nav.seesPoint(e.x, e.y, e.z, px, py, pz)) return false;
    }
    return true;
  };
  const v = visited(L);
  v.seen[start] = v.now;
  let frontier = [start];
  let walked = 0;
  let lying: GroundSpot | null = null;
  let lyingAt = 0;
  const steps = Math.floor(F.maxRun / L.cell);
  const near = Math.max(1, Math.round(F.spacing / L.cell));
  const longer = Math.round(F.preferUpright / L.cell);
  for (let step = 0; step <= steps && frontier.length > 0; step++) {
    if (lying && step > lyingAt + longer) return lying;
    const run = step * L.cell;
    const k = near * (run < F.nearRun ? 1 : run < 2 * F.nearRun ? 2 : 4);
    const next: number[] = [];
    for (const c of frontier) {
      if (++walked > F.cells || rays > F.rays) return lying;
      const i = c % L.nx;
      const j = Math.floor(c / L.nx);
      if (step === 0 || (i % k === 0 && j % k === 0)) {
        const px = L.x0 + (i + 0.5) * L.cell;
        const pz = L.z0 + (j + 0.5) * L.cell;
        const ground = world.terrain.heightAt(px, pz);
        if (hidden(px, ground + heads.crouch, pz)) return { x: px, z: pz, stance: 'crouch' };
        if (!lying && hidden(px, ground + heads.prone, pz)) {
          lying = { x: px, z: pz, stance: 'prone' };
          lyingAt = step;
        }
      }
      const go = (n: number): void => {
        if (v.seen[n] !== v.now && (L.flags[n]! & Cell.Walkable) !== 0) {
          v.seen[n] = v.now;
          next.push(n);
        }
      };
      if (i + 1 < L.nx && (L.edges[c]! & Edge.East) !== 0) go(c + 1);
      if (j + 1 < L.nz && (L.edges[c]! & Edge.North) !== 0) go(c + L.nx);
      if (i > 0 && (L.edges[c - 1]! & Edge.East) !== 0) go(c - 1);
      if (j > 0 && (L.edges[c - L.nx]! & Edge.North) !== 0) go(c - L.nx);
    }
    frontier = next;
  }
  return lying;
}

/** The listed perches near the bearing he believes it came from, or the believed point itself if there are none. */
function perchesToward(world: Ground, tuning: Tuning, x: number, z: number, threatX: number, threatZ: number, wide: boolean): Point[] {
  const dx = threatX - x;
  const dz = threatZ - z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const D = tuning.brain.fight.drill;
  const cosLimit = dcos(((wide ? D.wideDeg : D.bearingDeg) * Math.PI) / 180);
  const out: Point[] = [];
  for (const p of world.report.camp?.perches ?? []) {
    const px = p.x - x;
    const pz = p.z - z;
    const d = Math.sqrt(px * px + pz * pz) || 1;
    if ((dx * px + dz * pz) / (len * d) >= cosLimit) out.push({ x: p.x, z: p.z });
  }
  return out.length > 0 ? out : [{ x: threatX, z: threatZ }];
}
