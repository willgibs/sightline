import { commanderOf } from '../../sim/game/comms';
import { ladder, LADDER_PLANS, type LadderPlan } from '../../sim/game/scenes/ladder';
import type { Simulation } from '../../sim/game/sim';
import { sceneOver, sceneTicks, startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { CampGauges } from '../gauges';

/**
 * The ladder of plans against today's camp (docs/camp-engine.md, section 4): who wins, by
 * the mission's own rule: the target down, and you out. Every plan but the perfect shooter
 * is limited to what a person can do (sim/game/bots/person.ts).
 */

const NAMES: Readonly<Record<LadderPlan, string>> = {
  careless: 'careless',
  leave: 'shoot once and leave',
  static: 'perfect and static',
  relocate: 'shoot and relocate',
};

const ARMS: ReadonlyArray<Arm & { plan: LadderPlan }> = LADDER_PLANS.map((plan) => ({ name: NAMES[plan], plan }));

export const ladderOfPlans: Experiment = {
  name: 'ladder',
  about: 'who wins against the camp: the target down, and you out',
  series: 'lab-f-ladder',
  camps: 16,
  arms: ARMS,
  score: 'won',
  measures: [
    { key: 'won', label: 'won', kind: 'rate' },
    { key: 'shot', label: 'target shot', kind: 'rate' },
    { key: 'away', label: 'target away', kind: 'rate' },
    { key: 'dead', label: 'shot dead', kind: 'rate' },
    { key: 'seconds', label: 'time to win (s)', kind: 'median' },
    { key: 'down', label: 'guards down', kind: 'mean' },
    { key: 'fired', label: 'rounds fired', kind: 'mean' },
    { key: 'found', label: 'detected', kind: 'rate' },
    { key: 'incoming', label: 'rounds at him', kind: 'mean' },
    { key: 'nearest', label: 'nearest guard (m)', kind: 'median' },
  ],
  run(seed, arm, tuning) {
    const sc = ladder(`seed=${seed}&plan=${(arm as Arm & { plan: LadderPlan }).plan}`) as Scene<Simulation>;
    const sim = startScene(sc, tuning);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, tuning);
    const gauges = new CampGauges(sim);
    while (!sceneOver(sc, sim, ticks)) gauges.observe(sim, sim.step(driver.next(sim, raw)));
    const r = gauges.read(sim);
    const o = sim.state.outcome;
    const c = commanderOf(sim)!.camp;
    const won = o.status === 'succeeded';
    return {
      won: won ? 1 : 0,
      shot: c.objective?.status === 'done' ? 1 : 0,
      away: r.targetStatus === 'escaped' ? 1 : 0,
      dead: o.status === 'failed' && o.reason === 'shot dead by the camp' ? 1 : 0,
      seconds: won ? o.tick / tuning.sim.tickHz : NaN,
      down: r.guardsDown,
      fired: r.shotsFired,
      found: r.detected ? 1 : 0,
      incoming: r.roundsAtYou,
      nearest: r.nearestEver,
    };
  },
};
