import { Surface } from '../../kernel/world/surfaces';
import type { System } from '../../kernel/systems';
import { WaypointDriver, type Waypoint } from '../bots/waypoints';
import { campRules } from '../combat';
import { campCheckins, campCommander, commanderOf, commsVoice, giveCommander } from '../comms';
import { giveBrains } from '../brains';
import { player } from '../entities';
import { PERCEPTION, giveSenses } from '../perception';
import { arm } from '../shooting';
import { placePlayer } from '../setup';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';
import { campWorld } from './campBrain';

/**
 * The exit test's scripted scenarios (E12), run in the scenario runner: scenes with
 * parameters in the lab's camp, each with its driver and what it must show. A recording
 * names its parameters, and re-simulates through them.
 *
 *   script  suspicion   a noise inside the camp: a guard goes to see, finds nothing, and
 *                       everyone goes back to routine, with no one in combat.
 *           search      the player is spotted, breaks contact and lies still: the camp
 *                       searches and settles again, ended by belief, in 30–45 s.
 *   seed    which variant of the script's place and timing (a small fixed table)
 *
 * The scenarios "alarm" and "overlook" join them with E7 and E12.
 */

export interface CampScenarioParams {
  script: 'suspicion' | 'search';
  seed: number;
}

const DEFAULTS: CampScenarioParams = { script: 'suspicion', seed: 0 };

export function parseCampScenario(text: string | undefined): CampScenarioParams {
  const p: CampScenarioParams = { ...DEFAULTS };
  if (!text) return p;
  for (const part of text.split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    const key = at < 0 ? part : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    if (key === 'script') {
      if (v !== 'suspicion' && v !== 'search') throw new Error(`Camp scenario: script must be suspicion or search; got '${v}'`);
      p.script = v;
    } else if (key === 'seed') {
      const n = Number(v);
      if (v === '' || !Number.isInteger(n) || n < 0 || n > 999) throw new Error(`Camp scenario: seed must be a whole number 0–999; got '${v}'`);
      p.seed = n;
    } else throw new Error(`Camp scenario: no parameter '${key}'`);
  }
  return p;
}

export function formatCampScenario(p: CampScenarioParams): string {
  return `script=${p.script}&seed=${p.seed}`;
}

/** Places, in order: each seed takes the next. */
const NOISES = [
  { x: 18, z: 12 },
  { x: -6, z: 16 },
  { x: 22, z: -10 },
  { x: -18, z: -8 },
];
/** Where a searched-for player runs to and lies still: open ground beyond the fire of the gate. */
const HIDES = [
  { x: 170, z: 64 },
  { x: 176, z: -58 },
  { x: 186, z: 22 },
];

function noiseAt(tick: number, x: number, z: number, radius: number): System {
  return {
    name: 'scenario-noise',
    phase: 'commands',
    after: ['player-commands', 'rifle'],
    reads: [],
    writes: [],
    emits: ['noise'],
    run(ctx) {
      if (ctx.tick === tick) ctx.emit({ type: 'noise', source: 1, x, y: 0.3, z, surface: Surface.Dirt, loudness: radius / ctx.tuning.noise.radiusPerUnit, radius });
    },
  };
}

/** A camp scenario, from its parameters. */
export function campScenario(params?: string): Scene {
  const p = parseCampScenario(params);
  const canonical = formatCampScenario(p);
  const tuningSystems: System[] = [...PERCEPTION, commsVoice, campCommander, campCheckins, campRules];
  const name = 'camp-scenario';
  if (p.script === 'suspicion') {
    const noise = NOISES[p.seed % NOISES.length]!;
    const seen = { investigators: 0, combat: 0, firstAct: -1 };
    return {
      name,
      version: 1,
      params: canonical,
      title: `Camp: a suspicion episode (${p.seed})`,
      description: `A noise inside the camp, heard by nearby guards. Someone goes to look, finds nothing, and the camp settles back.`,
      game: SIGHTLINE,
      world: campWorld,
      systems: [...tuningSystems, noiseAt(90, noise.x, noise.z, 60)],
      setup: (sim) => {
        // Out of sight and earshot of the whole camp: the noise is all that happens.
        placePlayer(sim, 372, 372, -1, 0);
        giveSenses(sim);
        giveBrains(sim);
        giveCommander(sim);
        const pl = player(sim.index);
        arm(pl, sim.tuning);
        pl.health = { hits: 0 };
      },
      driver: () => new WaypointDriver([]),
      seconds: 100,
      expect: [
        {
          name: 'a guard goes to see what it was, and they do not all go',
          during: (_sim, events) => {
            for (const e of events) if (e.type === 'act' && (e.to === 'investigate' || e.to === 'search')) seen.investigators++;
          },
          after: () => (seen.investigators < 1 ? 'nobody went to look' : seen.investigators > 3 ? `${seen.investigators} went to look` : undefined),
        },
        {
          name: 'nobody enters combat: nothing was there to fight',
          during: (_sim, events) => {
            for (const e of events) if (e.type === 'alert' && e.to === 'combat') return `guard ${e.source} entered combat`;
          },
        },
        {
          name: 'the camp recovers: back on routine, the search over',
          after: (sim) => {
            const c = commanderOf(sim);
            if (c?.camp.search) return `still searching at the end`;
            for (const g of sim.guards) if (g.brain!.act !== 'routine' && g.brain!.act !== 'return') return `guard ${g.id} still ${g.brain!.act}`;
          },
        },
      ],
    };
  }
  // A search, evaded.
  const hide = HIDES[p.seed % HIDES.length]!;
  const route: Waypoint[] = [
    { x: 142, z: 12, stance: 'stand' },
    { x: 130, z: 8, stance: 'stand' },
    { x: 126, z: 14, stance: 'stand' },
    { x: hide.x, z: hide.z, stance: 'stand', sprint: true },
    { x: hide.x + 2, z: hide.z + 2, stance: 'prone' },
  ];
  const cycle = { ended: -1, lastPercept: -1, seconds: -1 };
  return {
    name,
    version: 1,
    params: canonical,
    title: `Camp: a search, evaded (${p.seed})`,
    description: `The player is spotted near the gate, runs and lies still in the open. The camp searches, finds nothing, and settles one level up: ended by belief.`,
    game: SIGHTLINE,
    world: campWorld,
    systems: tuningSystems,
    setup: (sim) => {
      giveSenses(sim);
      giveBrains(sim);
      giveCommander(sim);
      const pl = player(sim.index);
      arm(pl, sim.tuning);
      pl.health = { hits: 0 };
    },
    driver: () => new WaypointDriver(route),
    seconds: 150,
    expect: [
      {
        name: 'the player is seen and the camp comes up by radio',
        after: (sim) => {
          const c = commanderOf(sim)!;
          if (c.camp.lastPercept < 0) return 'no report ever reached the camp';
        },
      },
      {
        name: 'the search ends, by belief, 30–45 s after the last report',
        during: (sim, events) => {
          const c = commanderOf(sim)!;
          for (const e of events) {
            if (e.type === 'level' && cycle.seconds < 0 && e.to === 'uneasy' && c.camp.search === null) {
              cycle.seconds = (e.tick - c.camp.lastPercept) / sim.tuning.sim.tickHz;
              cycle.ended = e.t;
            }
          }
        },
        after: () => {
          if (cycle.seconds < 0) return 'the search never ended';
          if (cycle.seconds < 29 || cycle.seconds > 46) return `its cycle was ${cycle.seconds.toFixed(1)} s`;
        },
      },
      {
        name: 'the camp settles one level up, and the player is not found',
        after: (sim) => {
          const c = commanderOf(sim)!;
          if (c.camp.floor === 'calm') return 'it settled no higher than it started';
          const pl = player(sim.index);
          if (pl.health && pl.health.hits >= sim.tuning.brain.combat.playerHits) return 'the player was killed';
        },
      },
    ],
  };
}

/** The exit test's scripted scenarios, by params (E12): every validated script. */
export const CAMP_SCENARIOS: readonly string[] = ['script=suspicion&seed=0', 'script=suspicion&seed=1', 'script=search&seed=0', 'script=search&seed=1'];
