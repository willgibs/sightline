import { emptyRoute, navigatorOf } from '../../sim/brain';
import { campMission, generateWorld } from '../../sim/generation';
import type { Experiment } from '../experiment';
import { median } from '../stats';

/**
 * Whether the camp can send a man to the ground that overlooks it, and back. A camp that
 * can't route to a ridge can't hunt on it, whatever it believes, so this is the number under
 * every sweep and cut-off.
 */

interface Perch {
  x: number;
  z: number;
}

export const routes: Experiment = {
  name: 'routes',
  about: 'from every post on the ground to every listed perch, and back: how often a man can be routed there',
  series: 'lab-f-routes',
  camps: 16,
  arms: [{ name: 'post to perch' }, { name: 'perch to post' }],
  measures: [
    { key: 'found', label: 'found', kind: 'mean' },
    { key: 'noRoute', label: 'no route', kind: 'mean' },
    { key: 'budget', label: 'out of budget', kind: 'mean' },
    { key: 'metres', label: 'route (m)', kind: 'median' },
  ],
  run(seed, arm, tuning) {
    const world = generateWorld(campMission(seed), tuning);
    const nav = navigatorOf(world, tuning);
    const route = emptyRoute();
    const perches = world.report.camp!.perches as readonly Perch[];
    const posts = world.camp.guards.filter((g) => !g.elevated);
    const counts = { found: 0, noRoute: 0, budget: 0 };
    const metres: number[] = [];
    let tried = 0;
    for (const g of posts) {
      for (const p of perches) {
        tried++;
        const r = arm.name === 'post to perch' ? nav.find(g.x, g.z, p.x, p.z, {}, route) : nav.find(p.x, p.z, g.x, g.z, {}, route);
        if (r === 'found') {
          counts.found++;
          let m = 0;
          for (let k = 2; k < route.points.length; k += 2) m += Math.sqrt((route.points[k]! - route.points[k - 2]!) ** 2 + (route.points[k + 1]! - route.points[k - 1]!) ** 2);
          metres.push(m);
        } else if (r === 'no-route') counts.noRoute++;
        else counts.budget++;
      }
    }
    return { found: counts.found / tried, noRoute: counts.noRoute / tried, budget: counts.budget / tried, metres: median(metres) };
  },
};
