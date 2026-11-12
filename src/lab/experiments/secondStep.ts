import type { Tuning } from '../../config/tuning';
import { commanderOf } from '../../sim/game/comms';
import { stimulus } from '../../sim/game/drops';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import type { StimulusCommand } from '../../sim/kernel/commands';
import { sceneTuning, startScene, type Scene } from '../../sim/kernel/scene';
import { rung } from '../../sim/perception';
import type { Arm, Experiment } from '../experiment';
import { clearLine, clearShot, closeTo, overviewEye, type Point } from '../vantage';
import { keptWorld } from '../worlds';

/**
 * A player's opening move, and whether there's a second (the owner, Nov 12): "If I take a
 * shot at the siren, everyone hears it and panics. If I take a shot at the generator,
 * everyone hears it and panics. If I shoot a guard first, the siren goes off. How do I win
 * here without the target escaping the second everyone knows I'm attacking."
 *
 * One round, into one thing, and what the camp makes of it over the four minutes after:
 * whether it whistles, how much of it is up, whether the siren sounds and on what the man
 * who threw it had to go on, and whether the target is gone. The openings are the ones a
 * person tries first: a man on a raised post nobody stands beside, with the suppressor
 * fitted, from the camp's best overview; the same loud; the same with the subsonic load
 * from 90 m; a man on the ground; the generator; an alarm box.
 *
 * It is the compound simulator's camp (no player, no rules to end it), so a run says what
 * the camp does and not how the mission scores it. A round into a man is through the head,
 * so he never cries out: the quietest it can be done.
 */

interface OpeningArm extends Arm {
  at: 'tower' | 'ground' | 'generator' | 'siren';
  loud?: true;
  /** A subsonic round, from this many metres. */
  subsonicFrom?: number;
  /** More of the scene's parameters: how the camp is set up. */
  params?: string;
}

const OPENINGS: readonly OpeningArm[] = [
  { name: 'suppressed, at a man on a raised post', at: 'tower' },
  { name: 'loud, at a man on a raised post', at: 'tower', loud: true },
  { name: 'subsonic from 90 m, at a man on a raised post', at: 'tower', subsonicFrom: 90 },
  { name: 'suppressed, at a man on the ground', at: 'ground' },
  { name: 'suppressed, at the generator', at: 'generator' },
  { name: 'suppressed, at an alarm box', at: 'siren' },
];

/** Seconds into the run before the round is fired, how long it waits for a line, and how long it watches after. */
const FIRST = 12;
const GIVE_UP = 70;
const WATCH = 240;

const withSubsonic = (tuning: Tuning): Tuning => ({
  ...tuning,
  // The kit has to carry the load it starts with (config/validate.ts).
  ballistics: { ...tuning.ballistics, rifle: { ...tuning.ballistics.rifle, load: 'subsonic', carries: { ...tuning.ballistics.rifle.carries, subsonic: true } } },
});

interface Mark {
  /** Where the round is aimed. */
  at: Point;
  /** The guard it's meant for, or −1 for equipment. */
  victim: number;
  /** The colliders of the thing aimed at, which the round may meet. */
  own: readonly number[];
}

/** What there is to fire at now: the first man of the kind asked for standing still, or the equipment. */
function marks(sim: Simulation, arm: OpeningArm): Mark[] {
  const camp = sim.world.camp;
  if (arm.at === 'generator' || arm.at === 'siren') {
    const kind = arm.at === 'siren' ? 'alarm' : 'generator';
    return (camp.devices ?? []).filter((d) => d.kind === kind).map((d) => ({ at: { x: d.x, y: d.y, z: d.z }, victim: -1, own: camp.structures[d.structure]?.colliders ?? [] }));
  }
  const out: Mark[] = [];
  for (const g of sim.guards) {
    const post = camp.guards[g.guard.spawn];
    if (!post || post.role === 'target' || post.elevated !== (arm.at === 'tower')) continue;
    if (g.body.vx * g.body.vx + g.body.vz * g.body.vz > 0.0025 || g.body.stance !== 'stand') continue;
    out.push({ at: { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z }, victim: g.id, own: [] });
  }
  return out;
}

/** Where a round at a mark is fired from: the best overview if it has the line, or as far away on the nearest bearing that does. */
function firingPoint(sim: Simulation, m: Mark, arm: OpeningArm): Point | null {
  const over = overviewEye(sim);
  if (arm.subsonicFrom !== undefined) return closeTo(sim, m.at, over, arm.subsonicFrom, m.own);
  if (m.own.length > 0 ? clearShot(sim, over, m.at, m.own) : clearLine(sim, over, m.at)) return over;
  const dx = over.x - m.at.x;
  const dz = over.z - m.at.z;
  return closeTo(sim, m.at, over, Math.sqrt(dx * dx + dz * dz), m.own);
}

function run(seed: string, arm: Arm, tuning: Tuning): Record<string, number> {
  const a = arm as OpeningArm;
  const scene = compound(`seed=${seed}&attack=quiet${a.params ?? ''}`) as Scene<Simulation>;
  const T = sceneTuning(scene, a.subsonicFrom !== undefined ? withSubsonic(tuning) : tuning);
  const sim = startScene(scene, T, keptWorld(`live-camp:${seed}`, T, scene.world));
  const raw = scene.game.still(sim);
  const hz = T.sim.tickHz;
  const out: Record<string, number> = { done: 0, whistle: NaN, up5: NaN, up20: NaN, siren: NaN, sirenAt: NaN, blind: NaN, gone: NaN, goneAt: NaN, dead: NaN };
  let fired = -1;
  let victim = -1;
  let landed = -1;
  /** What each man who ran for the alarm had seen for himself when he set off: a person, or a body. */
  const witness = new Map<number, boolean>();
  const share = (least: number): number => {
    const rest = sim.guards.filter((g) => sim.world.camp.guards[g.guard.spawn]?.role !== 'target');
    return rest.length === 0 ? NaN : rest.filter((g) => g.senses !== undefined && rung(g.senses.awareness.state) >= least).length / rest.length;
  };
  for (let i = 0; i < (GIVE_UP + WATCH) * hz; i++) {
    const now = sim.tick / hz;
    const commands: StimulusCommand[] = [];
    // One go at it: at the first moment there's a line to something of the kind, and never again.
    if (fired < 0 && now >= FIRST && now < GIVE_UP) {
      for (const m of marks(sim, a)) {
        const from = firingPoint(sim, m, a);
        if (!from) continue;
        fired = sim.tick;
        victim = m.victim;
        commands.push(stimulus(a.loud ? 'shot' : 'suppressed-shot', m.at, from));
        break;
      }
    }
    const events = sim.step({ ...raw, commands });
    for (const e of events) {
      if (e.type === 'death' && e.victim === victim && landed < 0) landed = sim.tick;
      if (e.type === 'impact' && victim < 0 && fired >= 0 && landed < 0) landed = sim.tick;
      if (landed < 0) continue;
      if (e.type === 'whistle') out.whistle = 1;
      if (e.type === 'act' && e.to === 'alarm' && !witness.has(e.source)) {
        const g = sim.guards.find((x) => x.id === e.source);
        witness.set(e.source, g?.senses?.percepts.some((p) => p.kind === 'sight' || p.kind === 'body') ?? false);
      }
      if (e.type === 'alarm' && e.stage === 'raised' && Number.isNaN(out.sirenAt!)) {
        out.sirenAt = (sim.tick - landed) / hz;
        out.blind = witness.get(e.source) ? 0 : 1;
      }
    }
    if (fired >= 0 && landed < 0 && sim.tick > fired + 4 * hz) break; // the round didn't land where it was sent: nothing to measure
    if (landed < 0) continue;
    const since = sim.tick - landed;
    if (since === 5 * hz) out.up5 = share(rung('searching'));
    if (since === 20 * hz) out.up20 = share(rung('searching'));
    if (Number.isNaN(out.goneAt!) && commanderOf(sim)?.camp.objective?.status === 'escaped') out.goneAt = since / hz;
    if (since >= WATCH * hz) break;
  }
  if (landed < 0) return out;
  out.done = 1;
  if (Number.isNaN(out.whistle!)) out.whistle = 0;
  out.siren = Number.isNaN(out.sirenAt!) ? 0 : 1;
  out.gone = Number.isNaN(out.goneAt!) ? 0 : 1;
  if (a.at === 'generator') out.dead = sim.index.of('generator').some((g) => !g.generator.running) ? 1 : 0;
  if (a.at === 'siren') out.dead = sim.index.of('alarm').some((x) => !x.alarm.powered) ? 1 : 0;
  return out;
}

const MEASURES: Experiment['measures'] = [
  { key: 'done', label: 'the round landed', kind: 'rate' },
  { key: 'whistle', label: 'the camp whistled', kind: 'rate' },
  { key: 'up5', label: 'of the rest, searching at +5 s', kind: 'mean' },
  { key: 'up20', label: 'searching at +20 s', kind: 'mean' },
  { key: 'siren', label: 'siren within 240 s', kind: 'rate' },
  { key: 'sirenAt', label: 'siren after (s)', kind: 'median' },
  { key: 'blind', label: 'thrown by a man who had seen nobody and no body', kind: 'rate' },
  { key: 'gone', label: 'target gone within 240 s', kind: 'rate' },
  { key: 'goneAt', label: 'target gone after (s)', kind: 'median' },
  { key: 'dead', label: 'what it struck is out of action', kind: 'rate' },
];

export const secondStep: Experiment = {
  name: 'second-step',
  about: 'one round into a man, the generator or an alarm box: what the camp makes of it, and whether the mission is still there to be played',
  series: 'lab-second-step',
  camps: 24,
  arms: OPENINGS,
  measures: MEASURES,
  run,
};

/** The same openings on a camp that isn't ready for trouble and on one that is: how the game was until Nov 12, when the two were made one. */
export const secondStepBefore: Experiment = {
  ...secondStep,
  name: 'second-step-before',
  about: 'the same openings on a camp marked ready for trouble (the takedown): for the record of how the two differed',
  arms: OPENINGS.map((o) => ({ ...o, name: `${o.name}, a camp ready for trouble`, params: '&ready=alert' })),
};
