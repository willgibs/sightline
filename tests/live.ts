import { defaultTuning as T } from '../src/config/tuning';
import { yardOnly } from '../src/lab/experiments/variety';
import { MarksmanDriver, type Step } from '../src/sim/game/bots/marksman';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { placePlayer } from '../src/sim/game/setup';
import type { Simulation } from '../src/sim/game/sim';
import { generateWorld, campMission } from '../src/sim/generation';
import type { Scene } from '../src/sim/kernel/scene';
import type { World } from '../src/sim/kernel/world/world';

const worlds = new Map<string, World>();

/**
 * A generated camp, built once per test file: the plain yard these were written against, so a
 * test of the camp's brain doesn't move when a seed comes up as another kind of place.
 */
export function worldOf(seed: string): World {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(campMission(seed), yardOnly(T))));
  return w;
}

/** A live camp with a marksman on its best overview, firing every `every` seconds from `from` at what he sees best. */
export function shooterScene(seed: string, seconds: number, from = 8, every = 6): Scene<Simulation> {
  const world = worldOf(seed);
  const perch = [...world.report.camp!.perches].sort((x, y) => y.coverage - x.coverage || x.x - y.x)[0]!;
  const order = perch.guards
    .map((v, i) => [v, i] as const)
    .sort((p, q) => q[0] - p[0] || p[1] - q[1])
    .filter(([v]) => v > 0.2)
    .map(([, i]) => i);
  const steps: Step[] = [{ at: 0.2, act: 'prone' }, { at: 3, act: 'scope' }];
  order.slice(0, 8).forEach((post, i) => steps.push({ at: from + i * every, act: 'fire', target: { post }, breath: 1.5 }));
  const base = liveCamp(`seed=${seed}`) as Scene<Simulation>;
  return {
    ...base,
    world: () => world,
    setup: (sim) => {
      base.setup!(sim);
      placePlayer(sim, perch.x, perch.z, world.camp.site.x - perch.x, world.camp.site.z - perch.z);
    },
    driver: () => new MarksmanDriver(steps),
    seconds,
    expect: [],
  };
}
