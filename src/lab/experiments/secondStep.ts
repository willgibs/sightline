import type { Tuning } from '../../config/tuning';
import { commanderOf } from '../../sim/game/comms';
import { stimulus } from '../../sim/game/drops';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import type { StimulusCommand } from '../../sim/kernel/commands';
import { dcos, dsin } from '../../sim/kernel/core/detmath';
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
 * person tries first: a man on a watchtower, with the suppressor fitted, from the camp's
 * best overview; the same loud; the same with the subsonic load from 90 m; a man on the
 * ground; the generator; an alarm box. The first is fired twice over: at whoever is on a
 * tower the moment there's a line to him, as someone who hasn't looked would, and at a man
 * nobody would see fall, when the round's path comes near nobody, as someone who has. A
 * camp is built so that its men watch each other (generation/clusters.ts), so the
 * difference between those two is the game.
 *
 * And no round is free (the owner, Nov 12: "it shouldn't be so easy to go suppressor plus
 * subsonic camo and be deadly quiet for every single kill, regardless of distance"). So the
 * careful shot is fired from nearer too, with each load, where the suppressor does less;
 * and five times over, half a minute apart, to say how many quiet kills a camp takes
 * before it counts its dead and sounds the siren.
 *
 * It is the compound simulator's camp (no player, no rules to end it), so a run says what
 * the camp does and not how the mission scores it. A round into a man is through the head,
 * so he never cries out: the quietest it can be done.
 */

interface OpeningArm extends Arm {
  at: 'tower' | 'ground' | 'anyone' | 'generator' | 'siren';
  /** Only a man nobody would see fall, and only when the round's path comes near nobody: the shot of someone who has watched the camp first. */
  careful?: true;
  loud?: true;
  /** The subsonic load. */
  subsonic?: true;
  /** Fired from this many metres off, and not from the overview. */
  from?: number;
  /** More than one round: this many, this many seconds apart, each at a new mark. */
  rounds?: number;
  every?: number;
}

const OPENINGS: readonly OpeningArm[] = [
  { name: 'suppressed, at a man on a watchtower', at: 'tower' },
  { name: 'suppressed, at a man nobody is watching', at: 'anyone', careful: true },
  { name: 'the same, from 80 m', at: 'anyone', careful: true, from: 80 },
  { name: 'subsonic from 90 m, at a man nobody is watching', at: 'anyone', careful: true, subsonic: true, from: 90 },
  { name: 'the same, from 40 m', at: 'anyone', careful: true, subsonic: true, from: 40 },
  { name: 'five suppressed rounds half a minute apart, each at a man nobody is watching', at: 'anyone', careful: true, rounds: 5, every: 30 },
  { name: 'loud, at a man on a watchtower', at: 'tower', loud: true },
  { name: 'suppressed, at a man on the ground', at: 'ground' },
  { name: 'suppressed, at the generator', at: 'generator' },
  { name: 'suppressed, at an alarm box', at: 'siren' },
];

/** Seconds into the run before the round is fired, how long it waits for a line, and how long it watches after. */
const FIRST = 12;
const GIVE_UP = 70;
const WATCH = 240;
/** Metres a careful shot's path keeps from every other man: outside the distance at which a crack is a near miss, with room to spare. */
const CLEAR_OF = 12;
/** Seconds a man has to have gone unwatched before a careful shot is taken at him: longer than a sentry's sweep of his sector, so a head on its way round isn't missed. */
const UNWATCHED = 10;

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
function marks(sim: Simulation, arm: OpeningArm, lastWatched: ReadonlyMap<number, number>): Mark[] {
  const camp = sim.world.camp;
  if (arm.at === 'generator' || arm.at === 'siren') {
    const kind = arm.at === 'siren' ? 'alarm' : 'generator';
    return (camp.devices ?? []).filter((d) => d.kind === kind).map((d) => ({ at: { x: d.x, y: d.y, z: d.z }, victim: -1, own: camp.structures[d.structure]?.colliders ?? [] }));
  }
  const out: Mark[] = [];
  for (const g of sim.guards) {
    const post = camp.guards[g.guard.spawn];
    if (!post || post.role === 'target') continue;
    if (arm.at === 'tower' && !onTower(sim, g.body.x, g.body.z, post.elevated)) continue;
    if (arm.at === 'ground' && post.elevated) continue;
    if (g.body.vx * g.body.vx + g.body.vz * g.body.vz > 0.0025 || g.body.stance !== 'stand') continue;
    if (arm.careful && sim.tick - (lastWatched.get(g.id) ?? -Infinity) < UNWATCHED * sim.tuning.sim.tickHz) continue;
    out.push({ at: { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z }, victim: g.id, own: [] });
  }
  return out;
}

/** True if a raised post is a watchtower's deck, and not an upper window of a building full of people. */
function onTower(sim: Simulation, x: number, z: number, elevated: boolean): boolean {
  if (!elevated) return false;
  return (sim.world.camp.layout?.towers ?? []).some((t) => t.corner !== 'window' && (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) < 4);
}

const DEG = Math.PI / 180;

/** True if some other man would see this one go down now: he's within the witness ranges, in that man's gaze, with a clear line from his eye (generation/field.ts, seesDrop, by the run's own truth). */
function watched(sim: Simulation, victim: number): boolean {
  const v = sim.guards.find((g) => g.id === victim);
  if (!v) return false;
  const S = sim.tuning.perception.sight;
  const chest = { x: v.body.x, y: v.body.y + sim.tuning.gen.sight.chest, z: v.body.z };
  for (const g of sim.guards) {
    if (g.id === victim) continue;
    const dx = chest.x - g.body.x;
    const dz = chest.z - g.body.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > S.fall.core || d < 1e-6) continue;
    const yaw = g.body.yaw + g.guard.headYaw;
    const cos = (dx * -dsin(yaw) + dz * -dcos(yaw)) / d;
    // A little past each cone's edge and each range, so a man on the edge of someone's view isn't called unwatched.
    if (cos < dcos((S.peripheral.halfDeg + 10) * DEG) || (cos < dcos((S.core.halfDeg + 10) * DEG) && d > S.fall.peripheral + 5)) continue;
    if (clearLine(sim, { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z }, chest)) return true;
  }
  return false;
}

/** How near a round's path from one point to another comes to anyone but the man it's meant for, metres. */
function nearestToPath(sim: Simulation, from: Point, to: Point, victim: number): number {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const vz = to.z - from.z;
  const len2 = vx * vx + vy * vy + vz * vz || 1;
  let best = Infinity;
  for (const g of sim.guards) {
    if (g.id === victim) continue;
    const px = g.body.x - from.x;
    const py = g.body.y + g.body.eyeHeight - from.y;
    const pz = g.body.z - from.z;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy + pz * vz) / len2));
    const d = Math.sqrt((px - vx * t) * (px - vx * t) + (py - vy * t) * (py - vy * t) + (pz - vz * t) * (pz - vz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Where a round at a mark is fired from: the best overview if it has the line, or as far away on the nearest bearing that does. */
function firingPoint(sim: Simulation, m: Mark, arm: OpeningArm): Point | null {
  const over = overviewEye(sim);
  if (arm.from !== undefined) return closeTo(sim, m.at, over, arm.from, m.own);
  if (m.own.length > 0 ? clearShot(sim, over, m.at, m.own) : clearLine(sim, over, m.at)) return over;
  const dx = over.x - m.at.x;
  const dz = over.z - m.at.z;
  return closeTo(sim, m.at, over, Math.sqrt(dx * dx + dz * dz), m.own);
}

function run(seed: string, arm: Arm, tuning: Tuning): Record<string, number> {
  const a = arm as OpeningArm;
  const scene = compound(`seed=${seed}&attack=quiet${a.off ? `&off=${a.off}` : ''}`) as Scene<Simulation>;
  const T = sceneTuning(scene, a.subsonic ? withSubsonic(tuning) : tuning);
  const sim = startScene(scene, T, keptWorld(`live-camp:${seed}`, T, scene.world));
  const raw = scene.game.still(sim);
  const hz = T.sim.tickHz;
  const out: Record<string, number> = { done: 0, whistle: NaN, up5: NaN, up20: NaN, siren: NaN, sirenAt: NaN, blind: NaN, down: NaN, gone: NaN, goneAt: NaN, dead: NaN };
  const rounds = a.rounds ?? 1;
  /** Rounds fired, the tick of the last, and the men they were meant for. */
  let fired = 0;
  let last = -1;
  const victims = new Set<number>();
  /** The tick the first round landed, and how many of its marks are down. */
  let landed = -1;
  let down = 0;
  /** The tick each man was last in someone's sight, as a falling man would be (`watched`). */
  const lastWatched = new Map<number, number>();
  /** What each man who ran for the alarm had seen for himself when he set off: a person, or a body. */
  const witness = new Map<number, boolean>();
  const share = (least: number): number => {
    const rest = sim.guards.filter((g) => sim.world.camp.guards[g.guard.spawn]?.role !== 'target');
    return rest.length === 0 ? NaN : rest.filter((g) => g.senses !== undefined && rung(g.senses.awareness.state) >= least).length / rest.length;
  };
  for (let i = 0; i < (GIVE_UP + WATCH) * hz; i++) {
    const now = sim.tick / hz;
    const commands: StimulusCommand[] = [];
    // Who is being watched, kept up from the start: someone who has looked first knows it of the last few seconds, not of this instant.
    if (a.careful && fired < rounds) for (const g of sim.guards) if (watched(sim, g.id)) lastWatched.set(g.id, sim.tick);
    // Each round has one go at it: at the first moment there's a line to something of the kind, once the last has had its time.
    const due = fired === 0 ? now >= FIRST && now < GIVE_UP : fired < rounds && landed >= 0 && sim.tick - last >= (a.every ?? 0) * hz;
    if (due) {
      for (const m of marks(sim, a, lastWatched)) {
        if (victims.has(m.victim)) continue;
        const from = firingPoint(sim, m, a);
        if (!from) continue;
        // Someone who has looked first doesn't send a round past another man's head: a snap that close is a shot to him.
        if (a.careful && !a.subsonic && nearestToPath(sim, from, m.at, m.victim) < CLEAR_OF) continue;
        fired++;
        last = sim.tick;
        if (m.victim >= 0) victims.add(m.victim);
        commands.push(stimulus(a.loud ? 'shot' : 'suppressed-shot', m.at, from));
        break;
      }
    }
    const events = sim.step({ ...raw, commands });
    for (const e of events) {
      if (e.type === 'death' && victims.has(e.victim)) {
        down++;
        if (landed < 0) landed = sim.tick;
      }
      if (e.type === 'impact' && victims.size === 0 && fired > 0 && landed < 0) landed = sim.tick;
      if (landed < 0) continue;
      if (e.type === 'whistle') out.whistle = 1;
      if (e.type === 'act' && e.to === 'alarm' && !witness.has(e.source)) {
        const g = sim.guards.find((x) => x.id === e.source);
        // A man the camp sent has its count behind him, and that isn't blind either.
        witness.set(e.source, e.why === 'ordered' || (g?.senses?.percepts.some((p) => p.kind === 'sight' || p.kind === 'body') ?? false));
      }
      if (e.type === 'alarm' && e.stage === 'raised' && Number.isNaN(out.sirenAt!)) {
        out.sirenAt = (sim.tick - landed) / hz;
        out.blind = witness.get(e.source) ? 0 : 1;
        out.down = down;
      }
    }
    if (fired > 0 && landed < 0 && sim.tick > last + 4 * hz) break; // the first round didn't land where it was sent: nothing to measure
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
  if (Number.isNaN(out.down!)) out.down = down;
  out.gone = Number.isNaN(out.goneAt!) ? 0 : 1;
  if (a.at === 'generator') out.dead = sim.index.of('generator').some((g) => !g.generator.running) ? 1 : 0;
  if (a.at === 'siren') out.dead = sim.index.of('alarm').some((x) => x.alarm.broken) ? 1 : 0;
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
  { key: 'down', label: 'men down by then', kind: 'mean' },
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
