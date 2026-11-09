import { campMission, defaultCampSpec, generateWorld } from '../../generation';
import { giveBrains } from '../brains';
import { campRules } from '../combat';
import { campCheckins, campCommander, campDevices, commanderOf, commsVoice, giveCampDevices, giveCommander } from '../comms';
import { player } from '../entities';
import { truckRoute } from '../camp';
import { vehicleDrive } from '../escape';
import { arm } from '../shooting';
import { parseSwitches, switchedOff, type CampSwitch } from '../switches';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * A live camp (E13): a generated camp, from any seed, with everything lab E built awake in
 * it: the guards' brains, the commander, the radio and its check-ins, the alarm boxes, the
 * target's run for his vehicle, and the rules of the mission. The player has the rifle.
 *
 * The valley's own guards only perceive (A13). Everything here stays in this scene, so the
 * default valley's behaviour doesn't move until Phase 2 joins the labs.
 *
 * Parameters (`?scene=live-camp&params=seed=LEB-2534`, with `&difficulty=0.5` inside params
 * as `seed=LEB-2534%26difficulty=0.7`): which camp, and how hard.
 */

export interface LiveCampParams {
  seed: string;
  difficulty: number;
  /** Parts of the camp switched off, for measuring what they add (game/switches.ts). */
  off: CampSwitch[];
}

const DEFAULTS: LiveCampParams = { seed: 'LEB-2534', difficulty: defaultCampSpec().difficulty, off: [] };

export function parseLiveCamp(text: string | undefined): LiveCampParams {
  const p: LiveCampParams = { ...DEFAULTS };
  if (!text) return p;
  for (const part of text.split('&')) {
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'difficulty') {
      const d = Number(value);
      if (!Number.isFinite(d) || d < 0 || d > 1) throw new Error(`A live camp's difficulty is between 0 and 1, not '${value}'`);
      p.difficulty = d;
    } else if (key === 'off') p.off = parseSwitches(value ?? '');
    else throw new Error(`A live camp doesn't know '${part}'`);
  }
  return p;
}

export function formatLiveCamp(p: LiveCampParams): string {
  return `seed=${p.seed}&difficulty=${p.difficulty}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}`;
}

export function liveCamp(params?: string): Scene {
  const p = parseLiveCamp(params);
  return switchedOff({
    name: 'live-camp',
    version: 2,
    params: formatLiveCamp(p),
    title: `A live camp (${p.seed})`,
    description: `A generated camp with the whole camp brain awake: guards who see, hear, talk and search, a commander, radio check-ins, alarm boxes that can be cut off at the generator, and a target who runs for his vehicle at lockdown. You have the rifle.`,
    game: SIGHTLINE,
    world: (tuning) => generateWorld(campMission(p.seed, { ...defaultCampSpec(), difficulty: p.difficulty }), tuning),
    systems: [commsVoice, campCommander, campCheckins, campRules, campDevices, vehicleDrive],
    setup: (sim) => {
      giveBrains(sim);
      giveCommander(sim);
      giveCampDevices(sim);
      // Here, as in the missions to come, the job isn't done until you're out: at the end of the road.
      const road = truckRoute(sim.world, sim.tuning);
      if (road) commanderOf(sim)!.camp.objective!.getOut = { x: road[0]!.x, z: road[0]!.z };
      const you = player(sim.index);
      arm(you, sim.tuning);
      you.health = { hits: 0 };
    },
    seconds: 30,
    expect: [
      {
        name: 'the whole camp is awake: every guard has a brain, and the camp has a commander, its alarm boxes, its target and his way out',
        after(sim) {
          if (sim.guards.some((g) => !g.brain)) return 'a guard has no brain';
          const c = commanderOf(sim);
          if (!c) return 'no commander';
          if (c.camp.devices.alarms.length === 0) return 'no alarm boxes';
          if (!c.camp.devices.escape) return 'no way out for the target';
          if (!c.camp.objective) return 'no objective';
        },
      },
      {
        name: 'left alone, the camp stays calm: nobody raises anything',
        after(sim) {
          const c = commanderOf(sim)!;
          if (c.camp.level !== 'calm') return `the camp is ${c.camp.level}`;
          if (sim.state.outcome.status !== 'playing') return `the run ended: ${sim.state.outcome.status}`;
        },
      },
    ],
  }, p.off);
}
