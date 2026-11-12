import { MarksmanDriver, type Step, type Target } from '../bots/marksman';
import { commanderOf } from '../comms';
import { player } from '../entities';
import type { Simulation } from '../sim';
import { parseSwitches, switchedOff, type CampSwitch } from '../switches';
import type { World } from '../../kernel/world/world';
import type { Scene } from '.';
import { bestOverview, liveCamp } from './liveCamp';
import { takedownTuning } from './takedown';

/**
 * The hunt (brain/hunt.ts, brain/commander.ts; docs/camp-engine.md, section 9): someone on
 * the camp's best overview fires, loudly, and then lies where he is. What comes for him?
 *
 * Before this nothing did. A camp that hunts places him from what its men heard, sends two
 * of them out by the way that keeps most out of his view, and they watch his firing point
 * from the last cover short of it before one goes on to walk round it while the other
 * covers him. `off=hunt` plays it against the camp as it was. `shots` is how many he fires,
 * twelve seconds apart, each at a man he can see: the more he fires, the better the camp's
 * fix on him. He can't be hurt here: the question is whether they come, and how.
 *
 * `?scene=hunt&lab`, or `?scene=hunt&params=seed=KAZ-5125&lab`.
 */

export interface HuntParams {
  seed: string;
  shots: number;
  off: CampSwitch[];
}

export function parseHunt(text: string | undefined): HuntParams {
  const p: HuntParams = { seed: 'LEB-2534', shots: 1, off: [] };
  if (!text) return p;
  for (const part of text.split('&')) {
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'shots') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error(`The hunt's shooter fires 1 to 12 shots, not '${value}'`);
      p.shots = n;
    } else if (key === 'off') p.off = parseSwitches(value ?? '');
    else throw new Error(`The hunt doesn't know '${part}'`);
  }
  return p;
}

/** Seconds from the start to his first shot, and between shots. */
const FIRST = 8;
const BETWEEN = 12;

/** His script: down, the scope up, and his shots, each at the man the overview shows him best, in turn; or at the middle of the camp if it shows him nobody. */
export function huntSteps(world: World, shots: number): Step[] {
  const perch = world.report.camp!.perches.find((p) => p.x === bestOverview(world).x && p.z === bestOverview(world).z)!;
  const posts = perch.guards
    .map((share, post) => ({ share, post }))
    .filter((g) => g.share > 0.2)
    .sort((a, b) => b.share - a.share || a.post - b.post) // the post breaks a tie
    .map((g) => g.post);
  const site = world.camp.site;
  const steps: Step[] = [
    { at: 0.2, act: 'prone' },
    { at: 3, act: 'scope' },
  ];
  for (let k = 0; k < shots; k++) {
    const target: Target = posts.length > 0 ? { post: posts[k % posts.length]! } : { x: site.x, y: world.terrain.heightAt(site.x, site.z) + 1.5, z: site.z };
    steps.push({ at: FIRST + BETWEEN * k, act: 'fire', target, breath: 1.5 });
  }
  return steps;
}

/** What a run of the scene has shown, for its expectations and for whoever measures it (lab/experiments/hunt.ts): ticks, or −1 for never. */
export interface HuntSeen {
  /** His first shot; the camp's first fix on him, and how far off it was, metres; the first section's orders. */
  shot: number;
  placed: number;
  off: number;
  ordered: number;
  /** A man of a section first watching the place, first closing in on it, first walking round it; its first call that it's clear; and the first time one of them had him in sight. */
  watching: number;
  closing: number;
  sweeping: number;
  cleared: number;
  found: number;
  /** Sections sent, and men who were ever in one. */
  sections: number;
  men: Set<number>;
  /** Men of the garrison, not in a section, who went past the wire while the camp had him placed; and the fewest fighting men left on the camp's own ground while a section was out. */
  strays: Set<number>;
  home: number;
  /** "Set!" and "Moving!" said out past the wire. */
  calls: number;
}

export function emptyHuntSeen(): HuntSeen {
  return { shot: -1, placed: -1, off: NaN, ordered: -1, watching: -1, closing: -1, sweeping: -1, cleared: -1, found: -1, sections: 0, men: new Set(), strays: new Set(), home: Infinity, calls: 0 };
}

/** Metres past the camp's pad that count as out past the wire, for a man who has no business there. */
const PAST = 25;

/** Takes one tick's events and state into what the run has shown. */
export function watchHunt(sim: Simulation, events: ReturnType<Simulation['step']>, seen: HuntSeen): void {
  const camp = commanderOf(sim)!.camp;
  const world = sim.world;
  const site = world.camp.site;
  const roles = sim.tuning.brain.roles;
  const beyond = (x: number, z: number, by: number): boolean => (x - site.x) * (x - site.x) + (z - site.z) * (z - site.z) > (site.radius + by) * (site.radius + by);
  if (camp.threat && seen.placed < 0) {
    seen.placed = sim.tick;
    const you = player(sim.index).body;
    seen.off = Math.sqrt((camp.threat.x - you.x) * (camp.threat.x - you.x) + (camp.threat.z - you.z) * (camp.threat.z - you.z));
  }
  for (const s of camp.sections) for (const id of s.men) seen.men.add(id);
  seen.sections = Math.max(seen.sections, camp.nextSection - 1);
  for (const e of events) {
    if (e.type === 'shot' && e.source === sim.playerId && seen.shot < 0) seen.shot = sim.tick;
    if (e.type === 'order' && e.task === 'hunt' && seen.ordered < 0) seen.ordered = sim.tick;
    if (e.type === 'call' && seen.men.has(e.source)) {
      if (e.say === 'clear' && seen.cleared < 0) seen.cleared = sim.tick;
      if ((e.say === 'set' || e.say === 'moving') && beyond(e.x, e.z, 0)) seen.calls++;
    }
    if (e.type === 'detected' && e.target === sim.playerId && seen.men.has(e.source) && seen.found < 0) seen.found = sim.tick;
  }
  let home = 0;
  for (const g of sim.guards) {
    const post = world.camp.guards[g.guard.spawn]!;
    const h = g.brain?.hunt;
    if (h && g.brain!.act === 'hunt') {
      if (h.phase === 'watch' && seen.watching < 0) seen.watching = sim.tick;
      if (h.phase === 'close' && seen.closing < 0) seen.closing = sim.tick;
      if (h.phase === 'sweep' && seen.sweeping < 0) seen.sweeping = sim.tick;
    }
    const out = beyond(g.body.x, g.body.z, PAST);
    // The relief comes up the road from outside, and a man whose rounds take him past the wire is where he should be.
    if (out && camp.threat && !seen.men.has(g.id) && !g.guard.reserve && g.brain && g.brain.act !== 'routine' && g.brain.act !== 'return') seen.strays.add(g.id);
    if (!out && !post.elevated && roles[post.role].fight > 0) home++;
  }
  if (camp.sections.length > 0 && home < seen.home) seen.home = home;
}

export function hunt(params?: string): Scene {
  const p = parseHunt(params);
  const base = liveCamp(`seed=${p.seed}&perch=1&ready=alert`);
  const seen = emptyHuntSeen();
  return switchedOff(
    {
      ...base,
      name: 'hunt',
      version: 1,
      params: `seed=${p.seed}${p.shots !== 1 ? `&shots=${p.shots}` : ''}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}`,
      tune: takedownTuning,
      title: `The hunt (${p.seed})`,
      description: 'Someone on the best overview fires, loudly, and then lies where he is. The camp places him by what its men heard, and sends two of them out after him: by cover, watching the place before one goes on to it.',
      setup: (sim) => {
        base.setup!(sim);
        Object.assign(seen, emptyHuntSeen());
        // The question is whether they come, and how: he can't be hurt here.
        delete player(sim.index).health;
      },
      driver: () => {
        let driver: MarksmanDriver | null = null;
        return { next: (sim: Simulation, out) => (driver ??= new MarksmanDriver(huntSteps(sim.world, p.shots))).next(sim, out) };
      },
      seconds: 420,
      playOn: true,
      expect: [
        {
          name: 'the camp places him, and sends a section',
          during: (sim, events) => watchHunt(sim, events, seen),
          after: () => (seen.shot < 0 ? 'he never fired' : seen.placed < 0 ? 'the camp never placed him' : seen.ordered < 0 ? 'nobody was sent' : undefined),
        },
        {
          name: 'it goes out as a section, saying so, and nobody else walks off the camp\'s ground',
          after: () => (seen.ordered < 0 ? undefined : seen.calls === 0 ? 'nobody past the wire said he was set or moving' : seen.strays.size > 0 ? `${seen.strays.size} men who weren't sent went out past the wire` : undefined),
        },
        {
          name: 'the camp keeps men at home',
          after: (sim) => (seen.ordered < 0 || seen.home >= sim.tuning.brain.hunt.keep ? undefined : `only ${seen.home} fighting men were left on the camp's ground`),
        },
        {
          name: 'they watch the place before one of them goes on to it',
          after: () => (seen.ordered < 0 ? undefined : seen.watching < 0 ? 'nobody got to where they watch from' : seen.closing >= 0 && seen.closing < seen.watching ? 'someone closed in before anyone had watched' : undefined),
        },
        {
          name: 'he\'s found, or the place is looked over and called clear',
          after: () => (seen.ordered < 0 || seen.found >= 0 || seen.cleared >= 0 ? undefined : 'neither'),
        },
      ],
    },
    p.off,
  );
}
