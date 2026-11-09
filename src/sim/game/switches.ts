import type { Scene } from '../kernel/scene';
import { commanderOf } from './comms';
import type { Simulation } from './sim';

/**
 * Engine switches (Lab F, docs/camp-engine.md): a live camp with parts of it switched off,
 * to measure and to feel what each part adds. A scene takes them as a parameter, so a
 * recording names them and re-simulates them.
 *
 * A switch never takes a system out: the others are ordered against it, and leaving it in
 * place doing nothing keeps every other system's order and random draws (rule 3). What
 * differs between two runs is then the switched part's doing, and nothing else.
 */

export const CAMP_SWITCHES = ['commander', 'radio', 'power', 'truck', 'reinforce'] as const;

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
    systems: (scene.systems ?? []).map((s) => (has('commander') && s.name === 'camp-commander' ? { ...s, run() {} } : s)),
    setup: (sim) => {
      setup?.(sim);
      if (has('power')) for (const g of sim.index.of('generator')) g.generator.running = false;
      if (has('radio')) for (const r of sim.index.of('radio')) r.radio.working = false;
      if (has('truck')) for (const v of sim.index.of('vehicle')) if (v.vehicle.escape) v.vehicle.disabled = true;
      // Already called, as far as the commander knows: it never calls them again.
      if (has('reinforce')) commanderOf(sim)!.camp.reinforceCalled = 0;
    },
  };
}
