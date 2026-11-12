import type { Tuning } from '../../config/tuning';
import { commanderOf } from '../../sim/game/comms';
import { compound } from '../../sim/game/scenes/compound';
import { bestOverview } from '../../sim/game/scenes/liveCamp';
import type { Simulation } from '../../sim/game/sim';
import { startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * What a camp does about its target under attack (brain/protect.ts), by the problem it's
 * built round, held against the owner's two conditions for it (Nov 10): play mustn't reduce
 * to one trick on every camp, and a player who loses him must have been able to tell.
 *
 * The same camps, protecting their targets, under a sniper on the best overview for five
 * minutes: once with every camp answering the one way they all did (it waits for its relief
 * to bring him out), and once by its problem. And once more not ready for trouble, when a
 * camp protects nobody and runs him at the siren: the answer every camp had before either. For each kind of camp, what became of him and
 * when; and for every camp he left, how long before he was in his vehicle the thing that
 * gives it away could be heard from that overview, which is where a player most likely is:
 * his own vehicle's engine, or the relief's truck on the road.
 *
 * Whether a person does hear it, and reads it, is a sitting's to say. This says it's there
 * to be heard.
 */

/** A camp that isn't ready for trouble protects nobody: it runs him to his vehicle at the siren, which is what every camp did before the takedown. */
const RELAXED = 'not ready for trouble';
const ARMS: readonly Arm[] = [{ name: 'one answer for every camp', off: 'answer' }, { name: 'by the camp’s problem' }, { name: RELAXED }];

/** Seconds of each run. */
const SECONDS = 300;

function run(seed: string, arm: Arm, t: Tuning): Record<string, number> {
  const sc = compound(`seed=${seed}&attack=sniper${arm.name === RELAXED ? '' : '&ready=alert'}${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  const driver = sc.driver!();
  const raw = sc.game.still(sim);
  const hz = t.sim.tickHz;
  const camp = commanderOf(sim)!.camp;
  const target = camp.objective!.target;
  const crux = sim.world.camp.crux;
  const vehicle = sim.index.of('vehicle').find((v) => v.vehicle.escape);
  const perch = bestOverview(sim.world);
  /** Ticks, or −1 for what hasn't happened. */
  const at = { siren: -1, engine: -1, relief: -1, aboard: -1, down: -1, heard: -1, truck: -1 };
  let told = false;
  /** The men on his doors, and whether one of them was killed before the target was in his vehicle. */
  const doorMen = new Set(sim.guards.filter((g) => sim.world.camp.guards[g.guard.spawn]!.holdsDoor).map((g) => g.id));
  let doorManDown = false;
  for (let k = 0; k < SECONDS * hz; k++) {
    for (const e of sim.step(driver.next(sim, raw))) {
      if (e.type === 'siren' && at.siren < 0) at.siren = sim.tick;
      else if (e.type === 'reinforce' && at.relief < 0) at.relief = sim.tick;
      else if (e.type === 'death' && e.victim === target) at.down = sim.tick;
      else if (e.type === 'death' && doorMen.has(e.victim)) doorManDown = true;
      else if (e.type === 'engine' && at.aboard < 0) {
        const own = vehicle !== undefined && e.source === vehicle.id;
        if (own && at.engine < 0) at.engine = sim.tick;
        // Heard on the overview: within how far the simulation says it carries. His own vehicle's, or a truck's on its way in.
        const carries = (e.x - perch.x) * (e.x - perch.x) + (e.z - perch.z) * (e.z - perch.z) <= e.radius * e.radius;
        if (carries && at.heard < 0) at.heard = sim.tick;
        if (carries && !own && at.truck < 0) at.truck = sim.tick;
      }
    }
    const him = sim.index.get(target);
    if (him?.kind === 'guard' && him.brain?.told.some((r) => r.kind === 'escort')) told = true;
    if (at.aboard < 0 && (camp.objective?.status === 'escaping' || camp.objective?.status === 'escaped')) at.aboard = sim.tick;
    if (at.aboard >= 0 || at.down >= 0) break;
  }
  const left = at.aboard >= 0;
  const alarmed = at.siren >= 0 && at.down < 0;
  const seconds = (from: number, to: number): number => (from < 0 || to < 0 ? NaN : (to - from) / hz);
  const only = (kind: string, value: number): number => (crux === kind && alarmed ? value : NaN);
  const keepers = camp.roster.filter((g) => g.keeps && g.status === 'ok').length;
  return {
    inside: crux === 'inside' ? 1 : 0,
    flush: crux === 'flush' ? 1 : 0,
    escort: crux === 'escort' ? 1 : 0,
    alarmed: at.siren >= 0 ? 1 : 0,
    down: at.down >= 0 ? 1 : 0,
    left: alarmed ? (left ? 1 : 0) : NaN,
    insideLeft: only('inside', left ? 1 : 0),
    insideAboard: only('inside', seconds(at.siren, at.aboard)),
    insideKeepers: only('inside', keepers),
    flushLeft: only('flush', left ? 1 : 0),
    flushAboard: only('flush', seconds(at.siren, at.aboard)),
    flushEngine: only('flush', left ? seconds(at.engine, at.aboard) : NaN),
    flushAlone: only('flush', left ? (told ? 0 : 1) : NaN),
    flushShot: only('flush', left && !told ? (doorManDown ? 1 : 0) : NaN),
    escortLeft: only('escort', left ? 1 : 0),
    escortAboard: only('escort', seconds(at.siren, at.aboard)),
    // Of the camps he left: was anything to be heard on the overview before he was in his vehicle, and for how long?
    heard: alarmed && left ? (at.heard >= 0 && at.heard < at.aboard ? 1 : 0) : NaN,
    warning: alarmed && left ? (at.heard >= 0 ? Math.max(0, seconds(at.heard, at.aboard)) : 0) : NaN,
    truckHeard: alarmed && at.relief >= 0 ? seconds(at.truck, at.relief) : NaN,
  };
}

export const answerExperiment: Experiment = {
  name: 'answer',
  about: 'what a camp does about its target under attack, and what there is to hear of it first: one answer for every camp, and by the camp’s problem',
  series: 'lab-answer',
  camps: 18,
  arms: ARMS,
  measures: [
    { key: 'inside', label: 'camps built to be gone into', kind: 'rate' },
    { key: 'flush', label: 'camps built to be flushed', kind: 'rate' },
    { key: 'escort', label: 'an escort’s camps', kind: 'rate' },
    { key: 'alarmed', label: 'the siren sounded', kind: 'rate' },
    { key: 'down', label: 'the sniper got him first', kind: 'rate' },
    { key: 'left', label: 'he left, of camps where it sounded and he lived', kind: 'rate' },
    { key: 'insideLeft', label: 'gone into: he left', kind: 'rate' },
    { key: 'insideAboard', label: 'gone into: in his vehicle after the siren (s)', kind: 'median' },
    { key: 'insideKeepers', label: 'gone into: relief on his doors at the end', kind: 'mean' },
    { key: 'flushLeft', label: 'flushed: he left', kind: 'rate' },
    { key: 'flushAboard', label: 'flushed: in his vehicle after the siren (s)', kind: 'median' },
    { key: 'flushEngine', label: 'flushed: its engine ran before he was in it (s)', kind: 'median' },
    { key: 'flushAlone', label: 'flushed: he came out with nobody telling him', kind: 'rate' },
    { key: 'flushShot', label: 'flushed: of those, the man on his door had been shot', kind: 'rate' },
    { key: 'escortLeft', label: 'an escort’s: he left', kind: 'rate' },
    { key: 'escortAboard', label: 'an escort’s: in his vehicle after the siren (s)', kind: 'median' },
    { key: 'heard', label: 'he left: something to hear of it on the overview first', kind: 'rate' },
    { key: 'warning', label: 'he left: for how long before he was in his vehicle (s)', kind: 'median' },
    { key: 'truckHeard', label: 'the relief’s truck is heard on the overview before it’s at the gate (s)', kind: 'median' },
  ],
  run,
};
