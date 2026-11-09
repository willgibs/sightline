import { ATTACKS, AttackDriver } from '../../sim/game/attacks';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import { sceneOver, sceneTicks, startScene, type Scene } from '../../sim/kernel/scene';
import type { Experiment } from '../experiment';
import { FLAW_KINDS, FlawWatch, type Flaw } from '../flaws';

/**
 * Every attack script against the same camps, with no player: how many times does the camp
 * do something a defender plainly wouldn't? The number to drive to zero.
 */

/** One camp under one attack: the flaws found, each with its moment. */
export function attackRun(seed: string, attack: string, tuning: Parameters<Experiment['run']>[2], off = ''): { flaws: Flaw[]; watch: FlawWatch; sim: Simulation } {
  const scene = compound(`seed=${seed}&attack=${attack}${off ? `&off=${off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(scene, tuning);
  const driver = scene.driver!() as AttackDriver;
  const raw = scene.game.still(sim);
  const ticks = sceneTicks(scene, tuning);
  const watch = new FlawWatch(driver.truth);
  while (!sceneOver(scene, sim, ticks)) watch.observe(sim, sim.step(driver.next(sim, raw)));
  return { flaws: watch.flaws, watch, sim };
}

export const flaws: Experiment = {
  name: 'flaws',
  about: 'every attack script against the same camps, with no player: how often the camp does something a defender plainly would not',
  series: 'lab-f-flaws',
  camps: 8,
  arms: Object.keys(ATTACKS).map((name) => ({ name })),
  measures: FLAW_KINDS.map((k) => ({ key: k, label: k, kind: 'mean' as const })),
  run(seed, arm, tuning) {
    return { ...attackRun(seed, arm.name, tuning).watch.counts() };
  },
};
