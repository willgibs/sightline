import type { Tuning } from '../../config/tuning';
import { ViewDriver } from '../../sim/game/bots/playerView';
import { player } from '../../sim/game/entities';
import { circleOf, contactOf, ladder } from '../../sim/game/scenes/ladder';
import type { Simulation } from '../../sim/game/sim';
import { sceneOver, sceneTicks, startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { CampGauges } from '../gauges';
import { keptWorld } from '../worlds';

/**
 * The firefight (brain/firefight.ts), held against the two things the owner found by playing
 * (Nov 10). Walking into a camp: "when enemy defender saw me, it was easy to run away behind
 * cover when they stopped and they wouldn't even attempt to follow". And circling one: "I'm
 * not targeted or under pressure even at close quarters". With the other half of the brief:
 * "the whole enemy camp doesn't just converge into one location as a ring".
 *
 * The same camps, the takedown's alert ones, before and after, played by two bots limited to
 * what a person can do (bots/person.ts):
 *
 * - **Contact, and break it.** He walks the outside until a stop shows him someone, shoots,
 *   runs on four stops round the outside, gets down and watches the way he came for a
 *   minute. Twice. Does anyone come after him, do they find him, how near do they get, and
 *   how many of the camp left their own ground to do it.
 * - **Circling.** The lap from `npm run experiment -- circling`: what the walk hands him,
 *   and what it costs him.
 */

const ARMS: readonly Arm[] = [{ name: 'before', off: 'firefight' }, { name: 'the firefight' }];

/** How many of this tick's deaths were a guard's doing: a man shot by his own side. */
function ownGoals(sim: Simulation, events: ReturnType<Simulation['step']>): number {
  let n = 0;
  for (const e of events) if (e.type === 'death' && e.source !== sim.playerId && sim.index.get(e.source)?.kind === 'guard') n++;
  return n;
}

/** Metres: a man this near him has come after him. */
const NEAR = 40;
/** Metres from where he stood at the first shot: a man who's gone farther has left his own ground. */
const LEFT = 45;

function breakContact(seed: string, arm: Arm, t: Tuning): Record<string, number> {
  const sc = { ...(ladder(`seed=${seed}&plan=contact${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>), playOn: true };
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  const bot = contactOf(sim);
  const driver = new ViewDriver(bot);
  const raw = sc.game.still(sim);
  const ticks = sceneTicks(sc, t);
  const gauges = new CampGauges(sim);
  const killed = t.brain.combat.playerHits;
  const hits = (): number => player(sim.index).health?.hits ?? 0;
  const began = new Map<number, { x: number; z: number }>();
  const came = new Set<number>();
  const left = new Set<number>();
  let found = 0;
  let closest = Infinity;
  let incoming = 0;
  let firstBreak = -1;
  let friendly = 0;
  while (!sceneOver(sc, sim, ticks) && !bot.done && hits() < killed) {
    const events = sim.step(driver.next(sim, raw));
    gauges.observe(sim, events);
    friendly += ownGoals(sim, events);
    if (bot.breaks === 0) continue;
    if (firstBreak < 0) {
      firstBreak = sim.tick;
      for (const g of sim.guards) began.set(g.id, { x: g.body.x, z: g.body.z });
    }
    // Once he's away: who comes, how near, and whether anyone sets eyes on him again.
    const you = player(sim.index).body;
    for (const g of sim.guards) {
      const d = Math.sqrt((g.body.x - you.x) * (g.body.x - you.x) + (g.body.z - you.z) * (g.body.z - you.z));
      if (bot.phase === 'watch') {
        if (d < closest) closest = d;
        if (d <= NEAR) came.add(g.id);
      }
      const b = began.get(g.id);
      if (b && (g.body.x - b.x) * (g.body.x - b.x) + (g.body.z - b.z) * (g.body.z - b.z) > LEFT * LEFT) left.add(g.id);
    }
    for (const e of events) {
      if (bot.phase !== 'watch') continue;
      if (e.type === 'detected' && e.target === sim.playerId) found = 1;
      if (e.type === 'shot' && e.source !== sim.playerId) incoming++;
    }
  }
  const r = gauges.read(sim);
  const made = bot.breaks > 0;
  return {
    friendly,
    contact: made ? 1 : 0,
    followed: made ? (came.size > 0 || found ? 1 : 0) : NaN,
    found: made ? found : NaN,
    closest: made && closest < Infinity ? closest : NaN,
    came: made ? came.size : NaN,
    left: made ? left.size : NaN,
    incoming: made ? incoming : NaN,
    hits: made ? hits() : NaN,
    dead: made ? (hits() >= killed ? 1 : 0) : NaN,
    down: made ? r.guardsDown : NaN,
  };
}

function circle(seed: string, arm: Arm, t: Tuning): Record<string, number> {
  const sc = { ...(ladder(`seed=${seed}&plan=circle${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>), playOn: true };
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  const bot = circleOf(sim);
  const driver = new ViewDriver(bot);
  const raw = sc.game.still(sim);
  const ticks = sceneTicks(sc, t);
  const gauges = new CampGauges(sim);
  const killed = t.brain.combat.playerHits;
  const hits = (): number => player(sim.index).health?.hits ?? 0;
  let fromPerch = NaN;
  let friendly = 0;
  while (!sceneOver(sc, sim, ticks) && !bot.lapped && hits() < killed) {
    const events = sim.step(driver.next(sim, raw));
    gauges.observe(sim, events);
    friendly += ownGoals(sim, events);
    if (Number.isNaN(fromPerch) && bot.walking) fromPerch = gauges.read(sim).guardsDown;
  }
  const r = gauges.read(sim);
  return {
    'c.friendly': friendly,
    'c.walk': r.guardsDown - (Number.isNaN(fromPerch) ? r.guardsDown : fromPerch),
    'c.dead': hits() >= killed ? 1 : 0,
    'c.lapped': bot.lapped ? 1 : 0,
    'c.incoming': r.roundsAtYou,
  };
}

export const firefight: Experiment = {
  name: 'firefight',
  about: 'whether a camp comes after someone who breaks contact, and what circling it costs: before the firefight and with it',
  series: 'lab-firefight',
  camps: 12,
  arms: ARMS,
  measures: [
    { key: 'contact', label: 'he found someone to shoot at', kind: 'rate' },
    { key: 'followed', label: 'someone came after him', kind: 'rate' },
    { key: 'found', label: 'they set eyes on him again', kind: 'rate' },
    { key: 'closest', label: 'the nearest anyone came (m)', kind: 'mean' },
    { key: 'came', label: `men who came within ${NEAR} m`, kind: 'mean' },
    { key: 'left', label: `men who left their own ground (over ${LEFT} m)`, kind: 'mean' },
    { key: 'incoming', label: 'rounds at him while he watched', kind: 'mean' },
    { key: 'hits', label: 'hits on him', kind: 'mean' },
    { key: 'dead', label: 'shot dead', kind: 'rate' },
    { key: 'down', label: 'men he put down', kind: 'mean' },
    { key: 'c.walk', label: 'circling: men down from the walk', kind: 'mean' },
    { key: 'c.dead', label: 'circling: shot dead on the walk', kind: 'rate' },
    { key: 'c.lapped', label: 'circling: got all the way round', kind: 'rate' },
    { key: 'c.incoming', label: 'circling: rounds at him', kind: 'mean' },
    { key: 'friendly', label: 'men shot by their own side', kind: 'mean' },
  ],
  run(seed, arm, tuning) {
    const a = breakContact(seed, arm, tuning);
    const b = circle(seed, arm, tuning);
    return { ...a, ...b, friendly: a.friendly! + b['c.friendly']! };
  },
};
