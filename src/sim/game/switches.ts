import type { Scene } from '../kernel/scene';
import { commanderOf } from './comms';
import type { Simulation } from './sim';

/**
 * Engine switches (Lab F, docs/camp-engine.md): a live camp with parts of it switched off,
 * to measure and to feel what each part adds. A scene takes them as a parameter, so a
 * recording names them and re-simulates them.
 *
 * A switch makes a part absent, as if the camp had never had it: nobody finds a dead set or
 * a stopped generator, because there's nothing to find. (`power` is the one exception, and
 * says so.) It never takes a system out, because the others are ordered against it: it
 * leaves it in place doing nothing. Random streams belong to entities (rule 3), so no
 * guard's numbers shift because another part is off, though a guard who then behaves
 * differently draws differently, as he should.
 */

export const CAMP_SWITCHES = ['commander', 'radio', 'alarm', 'truck', 'reinforce', 'fight', 'power'] as const;

export type CampSwitch = (typeof CAMP_SWITCHES)[number];

/** Reads a scene parameter, `off=radio,power`: which parts are off, in a fixed order, so equal lists write equal parameters. */
export function parseSwitches(text: string): CampSwitch[] {
  if (text === '') return [];
  const asked = text.split(',');
  for (const s of asked) if (!(CAMP_SWITCHES as readonly string[]).includes(s)) throw new Error(`There's no switch called '${s}': there's ${CAMP_SWITCHES.join(', ')}`);
  return CAMP_SWITCHES.filter((s) => asked.includes(s));
}

/** A scene with these parts of its camp switched off. */
export function switchedOff(scene: Scene<Simulation>, off: readonly CampSwitch[]): Scene<Simulation> {
  if (off.length === 0) return scene;
  const setup = scene.setup;
  const has = (s: CampSwitch): boolean => off.includes(s);
  return {
    ...scene,
    systems: (scene.systems ?? []).map((s) => ((has('commander') && s.name === 'camp-commander') || (has('radio') && s.name === 'camp-checkins') ? { ...s, run() {} } : s)),
    setup: (sim) => {
      setup?.(sim);
      const camp = commanderOf(sim)!.camp;
      // No set, no net, no check-ins. The commander's the one who calls reinforcements, so `commander` takes them too.
      if (has('radio')) {
        for (const r of [...sim.index.of('radio')]) sim.despawn(r.id);
        camp.netWorking = false;
      }
      if (has('alarm')) {
        for (const a of [...sim.index.of('alarm')]) sim.despawn(a.id);
        camp.devices.alarms.length = 0;
      }
      // Nothing to run for: the vehicle stays parked, and the target stays where he is.
      if (has('truck')) camp.devices.escape = null;
      // The first fight (Lab F): a camp that only does what lab E built.
      if (has('fight')) delete camp.fights;
      // Already called, as far as the commander knows: it never calls them again.
      if (has('reinforce')) camp.reinforceCalled = 0;
      // Not an absence: the generator is cut before the run starts, as sabotage would, and whoever passes it notices.
      if (has('power')) for (const g of sim.index.of('generator')) g.generator.running = false;
    },
  };
}
