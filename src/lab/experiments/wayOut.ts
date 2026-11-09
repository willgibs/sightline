import type { Tuning } from '../../config/tuning';
import { campMission, generateWorld } from '../../sim/generation';
import { Cell, cellIndex, type GridLayer } from '../../sim/kernel/world/grid';
import { GridSearch } from '../../sim/kernel/world/search';
import type { World } from '../../sim/kernel/world/world';
import type { Arm, Experiment } from '../experiment';
import { median } from '../stats';

/**
 * How long a shooter takes to get away, by where "away" is. If it's a short walk from the
 * perch he took his shot from, nothing the camp does afterwards can matter, so the place
 * has to be chosen with this in mind. Paths only: nobody is chasing anyone here.
 */

type Way = 'nearest edge' | "the road's end" | 'across the valley';

interface Perch {
  x: number;
  z: number;
  coverage: number;
  target: number;
}

const WAYS: ReadonlyArray<Arm & { way: Way }> = [
  { name: 'nearest edge', way: 'nearest edge' },
  { name: "the road's end", way: "the road's end" },
  { name: 'across the valley', way: 'across the valley' },
];

const centre = (L: GridLayer, c: number): { x: number; z: number } => ({ x: L.x0 + ((c % L.nx) + 0.5) * L.cell, z: L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell });

/** The reachable cell nearest a point, or −1. */
function nearReachable(L: GridLayer, cost: Int32Array, x: number, z: number): number {
  const c = cellIndex(L, x, z);
  if (c < 0) return -1;
  const ii = c % L.nx;
  const jj = Math.floor(c / L.nx);
  let best = -1;
  let bestD = Infinity;
  for (let dj = -8; dj <= 8; dj++) {
    for (let di = -8; di <= 8; di++) {
      const i = ii + di;
      const j = jj + dj;
      if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
      const k = j * L.nx + i;
      if (cost[k]! < 0) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

function goal(world: World, way: Way, p: Perch): { x: number; z: number } | null {
  const half = world.playHalf;
  if (way === "the road's end") {
    const road = world.features.road.points.filter((q) => Math.max(Math.abs(q.x), Math.abs(q.z)) < half - 4);
    return road.length > 0 ? road[road.length - 1]! : null;
  }
  if (way === 'across the valley') {
    const s = world.camp.site;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const scale = (half - 6) / Math.max(Math.abs(dx / len), Math.abs(dz / len));
    return { x: (dx / len) * scale, z: (dz / len) * scale };
  }
  return null;
}

function runCamp(world: World, tuning: Tuning, arm: Arm & { way: Way }): Record<string, number> {
  const L = world.grid.map;
  const search = new GridSearch(L);
  const half = world.playHalf;
  const inside = (c: number): boolean => {
    const q = centre(L, c);
    return Math.abs(q.x) <= half && Math.abs(q.z) <= half;
  };
  const opts = { maxExpansions: L.nx * L.nz, cost: (_f: number, to: number, l: number) => ((L.flags[to]! & Cell.Walkable) !== 0 && inside(to) ? l : -1) };
  const cycle = world.camp.guards[0]!.routine.period;
  const perches = (world.report.camp!.perches as readonly Perch[]).filter((p) => p.target * cycle >= tuning.gen.validation.targetSeconds);
  const metres: number[] = [];
  for (const p of perches) {
    const start = cellIndex(L, p.x, p.z);
    if (start < 0) continue;
    search.flood([start], opts);
    if (arm.way === 'nearest edge') {
      let best = Infinity;
      for (let k = 0; k < L.nx * L.nz; k++) {
        const q = centre(L, k);
        if (search.cost[k]! >= 0 && inside(k) && Math.max(Math.abs(q.x), Math.abs(q.z)) >= half - 12) best = Math.min(best, search.cost[k]! / 100);
      }
      metres.push(best);
    } else {
      const g = goal(world, arm.way, p);
      if (!g) continue;
      const k = nearReachable(L, search.cost, g.x, g.z);
      if (k >= 0) metres.push(search.cost[k]! / 100);
    }
  }
  const walk = tuning.bodies.player.speed.walk;
  const m = median(metres);
  return { perches: perches.length, metres: m, walk: m / walk, sprint: m / tuning.bodies.player.speed.sprint };
}

export const wayOut: Experiment = {
  name: 'way-out',
  about: 'how long getting away takes from the perches that can see the target, by where away is',
  series: 'lab-f-way-out',
  camps: 24,
  arms: WAYS,
  measures: [
    { key: 'perches', label: 'perches on the target', kind: 'mean' },
    { key: 'metres', label: 'route (m)', kind: 'median' },
    { key: 'walk', label: 'walking (s)', kind: 'median' },
    { key: 'sprint', label: 'sprinting (s)', kind: 'median' },
  ],
  run(seed, arm, tuning) {
    return runCamp(generateWorld(campMission(seed), tuning), tuning, arm as Arm & { way: Way });
  },
};
