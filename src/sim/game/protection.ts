import type { GuardSpawn } from '../generation';
import { Cell, cellIndex } from '../kernel/world/grid';
import type { World } from '../kernel/world/world';
import { commanderOf } from './comms';
import type { Simulation } from './sim';

/**
 * A camp that protects its target (brain/protect.ts): the game's side of it. The camp's
 * memory gets the one fact the brains need, where his hard room is, and from then on the
 * whistle, the siren, the relief and the men sent for him do the rest.
 */

/** How far from his post his room is looked for, metres. */
const REACH = 40;

/**
 * The target's hard room: somewhere under a roof that he already goes. The first place his
 * day has him standing indoors; failing that his post, if it's indoors; failing that the
 * nearest floor under a roof. A camp with no roof within reach has him stay at his post.
 */
export function hardRoom(world: World, post: GuardSpawn): { x: number; z: number; y?: number } {
  const L = world.grid.site;
  const indoors = (x: number, z: number): boolean => {
    const c = cellIndex(L, x, z);
    return c >= 0 && (L.flags[c]! & Cell.Roofed) !== 0 && (L.flags[c]! & Cell.Walkable) !== 0;
  };
  // Upstairs, if that's where he keeps: the floor he's on is part of the place.
  const floor = post.elevated ? { y: post.y } : {};
  for (const leg of post.routine.legs) if (leg.kind === 'hold' && indoors(leg.x, leg.z)) return { x: leg.x, z: leg.z, ...floor };
  if (indoors(post.x, post.z)) return { x: post.x, z: post.z };
  // Outward from his post, a ring of cells at a time, each ring in a fixed order: the nearest floor under a roof.
  const ci = Math.floor((post.x - L.x0) / L.cell);
  const cj = Math.floor((post.z - L.z0) / L.cell);
  const rings = Math.ceil(REACH / L.cell);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= rings && !best; r++) {
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
        const x = L.x0 + (i + 0.5) * L.cell;
        const z = L.z0 + (j + 0.5) * L.cell;
        if (!indoors(x, z)) continue;
        const d = (x - post.x) * (x - post.x) + (z - post.z) * (z - post.z);
        if (d < bestD) {
          bestD = d;
          best = { x, z };
        }
      }
    }
  }
  return best ?? { x: post.x, z: post.z };
}

/** Makes a camp one that protects its target, before a run starts: it learns where his room is. A camp with no target stays as it is. */
export function giveProtection(sim: Simulation): void {
  const camp = commanderOf(sim)?.camp;
  const target = camp?.objective ? sim.index.get(camp.objective.target) : undefined;
  if (!camp || !target || target.kind !== 'guard') return;
  camp.protects = hardRoom(sim.world, sim.world.camp.guards[target.guard.spawn]!);
}
