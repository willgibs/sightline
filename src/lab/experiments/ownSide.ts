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
 */

const ARMS: readonly Arm[] = [{ name: 'as it was', off: 'mates' }, { name: 'looks out for its own' }];

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
  for (let k = 0; k < LENGTH * t.sim.tickHz; k++) {
    const events = sim.step(d.next(sim, raw));
    watchGate(sim, events, seen);
    gauges.observe(sim, events);
    // Hits before he was out of the walls are the fight inside's.
    if (seen.left < 0) before = player(sim.index).health?.hits ?? 0;
  }
  if (seen.left < 0 || seen.astray) return null;
  const r = gauges.read(sim);
  const hits = (player(sim.index).health?.hits ?? 0) - before;
  return { own: r.ownSide, any: r.ownSide > 0 ? 1 : 0, fired: r.roundsAtYou, held: r.held, hits, killed: hits >= t.brain.combat.playerHits ? 1 : 0 };
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
    { key: 'r.own', label: 'runs for the trees: men shot by their own side', kind: 'mean' },
    { key: 'r.any', label: 'runs for the trees: runs where one was', kind: 'rate' },
    { key: 'r.fired', label: 'runs for the trees: rounds the camp fired', kind: 'mean' },
    { key: 'r.held', label: 'runs for the trees: rounds held for one of its own', kind: 'mean' },
    { key: 'r.hits', label: 'runs for the trees: rounds that hit him once he was out', kind: 'mean' },
    { key: 'r.killed', label: 'runs for the trees: enough of them to kill', kind: 'rate' },
  ],
  run(seed, arm, t) {
    const out: Record<string, number> = { done: 0, own: NaN, any: NaN, fired: NaN, held: NaN, 'r.own': NaN, 'r.any': NaN, 'r.fired': NaN, 'r.held': NaN, 'r.hits': NaN, 'r.killed': NaN };
    const wall = play(seed, arm, t, 'wall');
    if (wall) {
      out.done = 1;
      out.own = wall.own!;
      out.any = wall.any!;
      out.fired = wall.fired!;
      out.held = wall.held!;
    }
    const ran = play(seed, arm, t, 'run');
    if (ran) for (const k of ['own', 'any', 'fired', 'held', 'hits', 'killed']) out[`r.${k}`] = ran[k]!;
    return out;
  },
};
