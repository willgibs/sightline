import { placePlayer } from '../setup';
import { AttackDriver, ATTACKS } from '../attacks';
import { compoundDrops } from '../drops';
import { parseSwitches, type CampSwitch } from '../switches';
import type { Scene } from '.';
import { liveCamp, READINESS, type Readiness } from './liveCamp';
import { takedownTuning } from './takedown';

/**
 * The compound simulator (Lab F): a live camp with no player in it. Drop a sound, a body or
 * a shot from anywhere on the map and watch how the defence answers it, or run an attack
 * script. The owner's idea (Nov 8): the camp in its core form, which should stand up to
 * every kind of attack before a player ever becomes the source of those inputs.
 *
 * The player's body is parked in a corner, out of everyone's senses, because a simulation
 * has one; nothing about it reaches the camp. There are no rules: nothing ends the run.
 *
 * `?scene=compound&params=seed=LEB-2534&lab`, with `attack=sniper` (game/attacks.ts) to run
 * a script while you watch, and `off=` for the engine switches.
 */

export interface CompoundParams {
  seed: string;
  attack: string;
  off: CampSwitch[];
  /** How ready the camp is (scenes/liveCamp.ts): an alert one protects its target, and goes by the takedown's numbers. */
  ready: Readiness;
}

export function parseCompound(text: string | undefined): CompoundParams {
  const p: CompoundParams = { seed: 'LEB-2534', attack: 'quiet', off: [], ready: 'relaxed' };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'attack' && value && ATTACKS[value]) p.attack = value;
    else if (key === 'off') p.off = parseSwitches(value ?? '');
    else if (key === 'ready' && (READINESS as readonly string[]).includes(value ?? '')) p.ready = value as Readiness;
    else throw new Error(`The compound simulator doesn't know '${part}'`);
  }
  return p;
}

export function compound(params?: string): Scene {
  const p = parseCompound(params);
  const off = p.off.length > 0 ? `&off=${p.off.join(',')}` : '';
  const ready = p.ready !== 'relaxed' ? `&ready=${p.ready}` : '';
  const base = liveCamp(`seed=${p.seed}${off}${ready}`);
  return {
    ...base,
    name: 'compound',
    version: 1,
    params: `seed=${p.seed}&attack=${p.attack}${off}${ready}`,
    ...(p.ready === 'alert' ? { tune: takedownTuning } : {}),
    title: `The compound simulator (${p.seed})`,
    description: 'A live camp with no player. Fly around, drop a shot, a noise or a body anywhere, and watch how the defence answers.',
    systems: [...(base.systems ?? []).map((s) => (s.name === 'camp-rules' ? { ...s, run() {} } : s)), compoundDrops],
    setup: (sim) => {
      base.setup!(sim);
      const half = sim.world.playHalf - 4;
      placePlayer(sim, -half, -half, 1, 1);
    },
    driver: () => new AttackDriver(p.attack),
    seconds: 240,
    playOn: true,
    expect: [],
  };
}
