import type { Tuning } from '../../config/tuning';
import { player } from '../../sim/game/entities';
import { leavingOf } from '../../sim/game/leaving';
import { emptyGateSeen, outTheGate, watchGate } from '../../sim/game/scenes/outTheGate';
import type { Simulation } from '../../sim/game/sim';
import { startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { CampGauges } from '../gauges';
import { keptWorld } from '../worlds';

/**
 * How often a camp shoots its own men, and what not doing it costs (game/combat.ts,
 * `ownInTheWay`). A fight round a gate is where it shows: someone seen inside leaves by an
 * opening and stays by the wall, or runs on for the trees, and for three minutes the camp
 * fights him through that opening, firing past each other.
 *
 * As it was (`off=mates`), a man held his fire only for one of his own dead on his line,
 * and a round goes up to a degree wide of it. With other luck than the game's own
 * (`--dice 3`), about one such fight in five ended with a man shot by his own side.
 *
 * Step 2e: a man whose round is held shifts a pace for a clear line (brain/firefight.ts),
 * where `off=shift` holds and waits. Every hold is counted by the brain's own record of it,
 * silent ones (a man dead on the line) included, with how long until that man's next round.
 */

const ARMS: readonly Arm[] = [{ name: 'as it was', off: 'mates' }, { name: 'holds and waits', off: 'shift' }, { name: 'shifts for a clear line' }];

/** Seconds from a hold to that man's next round that count as soon. */
const SOON = 3;

/** Seconds a run is played for, from its start: the fight goes on long after he's out, and that's when men are in each other's way. */
const LENGTH = 180;

function play(seed: string, arm: Arm, t: Tuning, plan: 'wall' | 'run'): Record<string, number> | null {
  const sc = outTheGate(`seed=${seed}${plan === 'wall' ? '' : `&plan=${plan}`}${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  if (!leavingOf(sim.world, t)) return null;
  const d = sc.driver!();
  const raw = sc.game.still(sim);
  const seen = emptyGateSeen();
  const gauges = new CampGauges(sim);
  let before = 0;
  // Every round held, silent or not, by the brain's own record of it (BrainState.held), and the tick of each man's held round still waiting for his next.
  const lastHeld = new Map<number, number>();
  const waiting = new Map<number, number>();
  const waits: number[] = [];
  let holds = 0;
  let shifts = 0;
  let again = 0;
  for (let k = 0; k < LENGTH * t.sim.tickHz; k++) {
    const events = sim.step(d.next(sim, raw));
    watchGate(sim, events, seen);
    gauges.observe(sim, events);
    for (const e of events) {
      if (e.type === 'shift') shifts++;
      else if (e.type === 'shot' && waiting.has(e.source)) {
        waits.push((e.tick - waiting.get(e.source)!) / t.sim.tickHz);
        waiting.delete(e.source);
      }
    }
    for (const g of sim.guards) {
      const h = g.brain?.held;
      if (h === undefined || h === lastHeld.get(g.id)) continue;
      lastHeld.set(g.id, h);
      holds++;
      // Held again from the place he shifted to: someone else in the way there, or the same man.
      if (g.brain?.ff?.shift) again++;
      if (!waiting.has(g.id)) waiting.set(g.id, h);
    }
    // Hits before he was out of the walls are the fight inside's.
    if (seen.left < 0) before = player(sim.index).health?.hits ?? 0;
  }
  if (seen.left < 0 || seen.astray) return null;
  const r = gauges.read(sim);
  const hits = (player(sim.index).health?.hits ?? 0) - before;
  // A hold never followed by a round in the run waits forever.
  for (const _ of waiting) waits.push(Infinity);
  waits.sort((a, b) => a - b); // unique: plain numbers, and equal ones are interchangeable
  const wait = waits.length === 0 ? NaN : waits.length % 2 === 1 ? waits[(waits.length - 1) / 2]! : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2;
  const soon = waits.length === 0 ? NaN : waits.filter((w) => w <= SOON).length / waits.length;
  return { own: r.ownSide, any: r.ownSide > 0 ? 1 : 0, fired: r.roundsAtYou, held: holds, shifted: shifts, again, wait, soon, hits, killed: hits >= t.brain.combat.playerHits ? 1 : 0 };
}

export const ownSideExperiment: Experiment = {
  name: 'own-side',
  about: 'a fight round a gate: how often the camp shoots its own men, and what holding fire for them costs',
  series: 'lab-takedown',
  camps: 24,
  arms: ARMS,
  measures: [
    { key: 'done', label: 'he was seen, and got out by the opening', kind: 'rate' },
    { key: 'own', label: 'by the wall: men shot by their own side', kind: 'mean' },
    { key: 'any', label: 'by the wall: runs where one was', kind: 'rate' },
    { key: 'fired', label: 'by the wall: rounds the camp fired', kind: 'mean' },
    { key: 'held', label: 'by the wall: rounds held for one of its own', kind: 'mean' },
    { key: 'shifted', label: 'by the wall: holds that ended in a shift', kind: 'mean' },
    { key: 'again', label: 'by the wall: rounds held again from the place he shifted to', kind: 'mean' },
    { key: 'wait', label: 'by the wall: seconds from a hold to that man\'s next round (median of a run\'s)', kind: 'median' },
    { key: 'soon', label: `by the wall: share of holds followed by a round within ${SOON} s`, kind: 'mean' },
    { key: 'r.own', label: 'runs for the trees: men shot by their own side', kind: 'mean' },
    { key: 'r.any', label: 'runs for the trees: runs where one was', kind: 'rate' },
    { key: 'r.fired', label: 'runs for the trees: rounds the camp fired', kind: 'mean' },
    { key: 'r.held', label: 'runs for the trees: rounds held for one of its own', kind: 'mean' },
    { key: 'r.shifted', label: 'runs for the trees: holds that ended in a shift', kind: 'mean' },
    { key: 'r.again', label: 'runs for the trees: rounds held again from the place he shifted to', kind: 'mean' },
    { key: 'r.wait', label: 'runs for the trees: seconds from a hold to that man\'s next round (median of a run\'s)', kind: 'median' },
    { key: 'r.soon', label: `runs for the trees: share of holds followed by a round within ${SOON} s`, kind: 'mean' },
    { key: 'r.hits', label: 'runs for the trees: rounds that hit him once he was out', kind: 'mean' },
    { key: 'r.killed', label: 'runs for the trees: enough of them to kill', kind: 'rate' },
  ],
  run(seed, arm, t) {
    const out: Record<string, number> = { done: 0, own: NaN, any: NaN, fired: NaN, held: NaN, shifted: NaN, again: NaN, wait: NaN, soon: NaN, 'r.own': NaN, 'r.any': NaN, 'r.fired': NaN, 'r.held': NaN, 'r.shifted': NaN, 'r.again': NaN, 'r.wait': NaN, 'r.soon': NaN, 'r.hits': NaN, 'r.killed': NaN };
    const wall = play(seed, arm, t, 'wall');
    if (wall) {
      out.done = 1;
      for (const k of ['own', 'any', 'fired', 'held', 'shifted', 'again', 'wait', 'soon']) out[k] = wall[k]!;
    }
    const ran = play(seed, arm, t, 'run');
    if (ran) for (const k of ['own', 'any', 'fired', 'held', 'shifted', 'again', 'wait', 'soon', 'hits', 'killed']) out[`r.${k}`] = ran[k]!;
    return out;
  },
};
