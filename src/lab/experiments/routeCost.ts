import { Navigator, emptyRoute, routeLength } from '../../sim/brain';
import { campMission, generateWorld } from '../../sim/generation';
import { Rng } from '../../sim/kernel/core/rng';
import { Cell, cellIndex } from '../../sim/kernel/world/grid';
import type { Arm, Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * What a route inside a camp costs to find (docs/performance.md): the same camps and the
 * same pairs of places, with the straight-line estimate alone and with landmarks to aim by
 * (kernel/world/search.ts, landmarkTables).
 *
 * The pairs are the routes a fight asks for: from a post on the ground to somewhere a body
 * can stand within 70 m of the camp's middle, where a search, a spot out of the line of
 * fire or the target's room would be. Each is asked alone, so what's counted is the search
 * and never the tick's budget. Cells are the unit: they're the same on every machine, and
 * a tick's time follows them.
 */

interface RouteArm extends Arm {
  landmarks: number;
}

const ARMS: readonly RouteArm[] = [
  { name: 'straight-line estimate alone', landmarks: 0 },
  { name: '4 landmarks', landmarks: 4 },
  { name: '8 landmarks', landmarks: 8 },
  { name: '16 landmarks (the game’s)', landmarks: 16 },
];

const PAIRS = 240;
const REACH = 70;

export const routeCost: Experiment = {
  name: 'route-cost',
  about: 'what a route inside a camp costs to find, with the straight-line estimate alone and with landmarks to aim by',
  series: 'lab-route-cost',
  camps: 16,
  arms: ARMS,
  measures: [
    { key: 'cells', label: 'cells a search looks at', kind: 'mean' },
    { key: 'worst', label: 'the most one search looked at', kind: 'mean' },
    { key: 'overTick', label: 'searches over a tick’s share (%)', kind: 'mean' },
    { key: 'gaveUp', label: 'fine search ran out of budget (%)', kind: 'mean' },
    { key: 'found', label: 'routes found (%)', kind: 'mean' },
    { key: 'metres', label: 'route (m)', kind: 'mean' },
  ],
  run(seed, arm, tuning) {
    const a = arm as RouteArm;
    const world = keptWorld(`camp:${seed}`, tuning, (t) => generateWorld(campMission(seed), t));
    const nav = new Navigator(world, { ...tuning, brain: { ...tuning.brain, nav: { ...tuning.brain.nav, landmarks: a.landmarks } } });
    nav.prepare();
    const L = world.grid.site;
    const site = world.camp.site;
    // Somewhere to go: a cell a body can stand in, near the camp. The same places for every arm.
    const rng = new Rng(seed, 'route-cost');
    const posts = world.camp.guards.filter((g) => !g.elevated && cellIndex(L, g.x, g.z) >= 0);
    const share = tuning.brain.nav.nodesPerTick;
    const budget = tuning.brain.nav.siteExpansions;
    const route = emptyRoute();
    let cells = 0;
    let worst = 0;
    let overTick = 0;
    let gaveUp = 0;
    let found = 0;
    let metres = 0;
    let asked = 0;
    for (let tries = 0; asked < PAIRS && tries < PAIRS * 40 && posts.length > 0; tries++) {
      const angle = rng.next() * 2 * Math.PI;
      const far = REACH * Math.sqrt(rng.next());
      const x = site.x + far * Math.cos(angle);
      const z = site.z + far * Math.sin(angle);
      const c = cellIndex(L, x, z);
      if (c < 0 || (L.flags[c]! & Cell.Walkable) === 0) continue;
      const from = posts[asked % posts.length]!;
      const work = { rays: 0, nodes: 0, bodies: 0 };
      const r = nav.find(from.x, from.z, x, z, { work }, route);
      asked++;
      cells += work.nodes;
      worst = Math.max(worst, work.nodes);
      if (work.nodes > share) overTick++;
      // The fine search gave up if it spent its whole budget: what follows is the coarse layer's guess.
      if (work.nodes >= budget) gaveUp++;
      if (r === 'found') {
        found++;
        metres += routeLength(route, from.x, from.z);
      }
    }
    if (asked === 0) return { cells: NaN, worst: NaN, overTick: NaN, gaveUp: NaN, found: NaN, metres: NaN };
    return { cells: cells / asked, worst, overTick: (100 * overTick) / asked, gaveUp: (100 * gaveUp) / asked, found: (100 * found) / asked, metres: found > 0 ? metres / found : NaN };
  },
};
