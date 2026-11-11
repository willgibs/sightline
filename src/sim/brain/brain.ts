import { dcos, dlog, dsin } from '../kernel/core/detmath';
import type { AwarenessName } from '../kernel/events';
import { routinePose, type RoutinePose } from '../generation';
import type { TaskKind } from './camp';
import { beginFirefight, noteFirefight, offerFirefight, performFight, performPush, seesHim, type Firefight } from './firefight';
import { groundSpot } from './ground';
import type { GuardMind } from './mind';
import { focusOf, lookAround, sameGoal, stand, standToward, walk } from './moves';
import { emptyRoute, navigatorOf, type Route } from './nav';
import type { Order } from './orders';
import { noteProtection, offerProtection, performFetch, performShelter, performStandTo, standingTo } from './protect';
import { keepRoutine } from './routine';
import type { Percept } from '../perception';
import type { Report, ReportKind, Told } from './reports';
import { choose, response, type Option } from './utility';

/**
 * A guard's brain (E3): a prioritized machine of the awareness ladder's states (lab A),
 * and inside each, what to do chosen by utility (utility.ts): the options the state
 * offers, each scored by multiplied 0–1 considerations, rank then weight, cooldowns
 * against dithering, the draw from his own stream through the mind (rule 13).
 *
 * The brain decides in the 'decide' phase from its mind alone (mind.ts), and steers its
 * body only through orders (orders.ts). It walks by the navigator's routes (nav.ts), so
 * a guard goes around buildings and through doorways by the motor, like anyone.
 *
 * Every change of act is reported with a reason code and the event that caused it, so
 * any reaction can be explained, back to a percept (the `act` event, kernel/events.ts).
 * No act reads anything but the mind: where the player really is reaches him only as a
 * percept, an awareness, a belief.
 */

export const ACTS = ['routine', 'return', 'look', 'investigate', 'search', 'hold', 'report', 'task', 'engage', 'cover', 'alarm', 'flank', 'flee', 'suppress', 'shelter', 'stand-to', 'fight', 'push'] as const;
export type ActName = (typeof ACTS)[number];

/** Why a guard changed what he's doing: A's reasons for a change of state, and the brain's own. */
export const ACT_WHYS = ['start', 'seen', 'glimpse', 'heard', 'shot', 'voice', 'repeat', 'contact', 'calm', 'arrived', 'nothing', 'stalled', 'no-route', 'lost', 'told', 'report', 'ordered', 'body', 'glint', 'siren', 'outage', 'door', 'muzzle'] as const;
export type ActWhy = (typeof ACT_WHYS)[number];

/** A change of what a guard is doing, for its system to emit as an 'act' event. */
export interface ActChange {
  from: ActName;
  to: ActName;
  why: ActWhy;
  /** Where the new act points: on the ground. */
  x: number;
  z: number;
  /** The event behind it: the percept, or the act that led to it. */
  cause: number;
  /** The utility the winning option scored: 0–1. */
  weight: number;
}

/** A guard's brain: what he's doing and why, plain data in his state. */
export interface BrainState {
  act: ActName;
  /** The tick this act began. */
  since: number;
  /** Where it points, if anywhere. */
  x: number;
  z: number;
  /** The event behind it, or 0. */
  cause: number;
  /** The act's event, once its system has emitted one. */
  event: number;
  /** The act is over: the next think chooses another. */
  done: boolean;
  /** When to think again, at the latest. */
  thinkAt: number;
  /** What he last thought about: the awareness state and newest percept. */
  state: AwarenessName;
  percept: number;
  /** The route he's walking, its goal, when it was last searched, and whether one was found. */
  route: Route;
  goalX: number;
  goalZ: number;
  routed: number;
  routeOk: boolean;
  /** He has arrived and is looking around until this tick. */
  linger: number;
  /** A search: how many points it has been to, and which way it goes next. */
  points: number;
  angle: number;
  /** The tick each act last ended, for its cooldown. */
  ended: Partial<Record<ActName, number>>;
  /** What he's been told, by voice or radio (E4), oldest first. */
  told: Told[];
  /** A timed act runs until this tick. */
  until: number;
  /** He has finished a radio call: the report for the net (E4), for its system to take. */
  radio: Report | null;
  /** In a camp that fights (Lab F): how long he stays down after the last shot, until when, and whether he has blown his whistle or is about to. */
  standHold?: number;
  /** How low he has to get where he's going, and whether he's got there and got down. */
  coverStance?: 'crouch' | 'prone';
  down?: 'crouch' | 'prone';
  standTo?: number;
  blown?: true;
  whistle?: boolean;
  /** He says something aloud this tick: the report, its reach and whether he's on the radio, for its system to take. */
  say: { report: Report; radius: number; radio: boolean } | null;
  /** The newest report he's acted on: to start one reaction per report. */
  toldHeard: number;
  /** The order he's been given (E5), once it has reached him. */
  task: Tasking | null;
  /** Combat (E10): the next tick he may fire, his aim for this tick's shot if any, and the cover he's using. */
  fireAt: number;
  fire: { x: number; y: number; z: number } | null;
  coverX: number;
  coverZ: number;
  covered: boolean;
  /** Alarm (E7): the box he's running for, and his hand on it when he gets there. */
  box: number;
  useUntil: number;
  /** He's reached the box this tick: its index, for its system to raise. */
  raise: number;
  /** The target (E7): he has reached his vehicle, for its system to take him off. */
  aboard: boolean;
  /** The target reached a vehicle that wouldn't start, and has said so (E7). */
  stranded?: boolean;
  /** The radio call he's in the middle of (E4): what he said when he picked up the handset, delivered as said. */
  calling: Report | null;
  /** The tick he first heard the siren, or −1: he knows the alarm is up (E7). */
  sirenAt: number;
  /** In a camp that protects its target (protect.ts): the whistle he last took note of, and how long it has him standing to. Absent until he hears one. */
  whistledAt?: number;
  standToUntil?: number;
  /** The target, in such a camp: the tick he was told to come out, or lost his nerve waiting. */
  releasedAt?: number;
  /** The firefight he's in (firefight.ts): where he believes the intruder is, his position, and what he's doing at it. Absent until he's in one. */
  ff?: Firefight;
}

/** An order as it reached a guard: what to do, where, when it was given, and the event behind it. */
export interface Tasking {
  id: number;
  kind: TaskKind;
  x: number;
  z: number;
  /** How high the place is, where the order said: which floor. */
  y?: number;
  issued: number;
  cause: number;
}

export function createBrain(): BrainState {
  return {
    act: 'routine',
    since: 0,
    x: 0,
    z: 0,
    cause: 0,
    event: 0,
    done: false,
    thinkAt: 0,
    state: 'unaware',
    percept: -1,
    route: emptyRoute(),
    goalX: 0,
    goalZ: 0,
    routed: -1,
    routeOk: false,
    linger: -1,
    points: 0,
    angle: 0,
    ended: {},
    told: [],
    until: -1,
    radio: null,
    say: null,
    toldHeard: -1,
    task: null,
    fireAt: -1,
    fire: null,
    coverX: 0,
    coverZ: 0,
    covered: false,
    box: -1,
    useUntil: -1,
    raise: -1,
    aboard: false,
    calling: null,
    sirenAt: -1,
  };
}

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
const options: Array<Option<ActName>> = [];

/**
 * One tick of a guard's brain: reconsiders what he's doing if the world gives him reason,
 * then carries out his act for the next tick into `out`. Returns the change of act, if
 * any, for its system to emit.
 */
export function decide(m: GuardMind, out: Order): ActChange | null {
  const b = m.brain!;
  const T = m.tuning.brain;
  const a = m.awareness;
  let change: ActChange | null = null;
  const newest = Math.max(newestPercept(m), newestTold(b));
  if (b.sirenAt < 0 && heardSiren(m)) b.sirenAt = m.tick;
  noteProtection(m);
  noteFirefight(m);
  if (b.done || m.tick >= b.thinkAt || a.state !== b.state || newest !== b.percept) {
    b.state = a.state;
    b.percept = newest;
    b.thinkAt = m.tick + Math.max(1, Math.round(T.think * m.tuning.sim.tickHz));
    const running = b.done ? null : b.act;
    if (b.done) b.ended[b.act] = m.tick;
    // An order that was never taken up lapses; one he's carrying out lasts as long as the walk does.
    if (b.task && b.act !== 'task' && (m.tick - b.task.issued) / m.tuning.sim.tickHz >= T.camp.keepOrder) b.task = null;
    fillOptions(m, options);
    const best = running && !outranked(options, running, T.switchRatio) ? running : (choose(options, T.pickShare, m.draw)?.act ?? 'routine');
    if (best !== b.act || b.done) change = begin(m, best, b.done);
    b.done = false;
  }
  perform(m, out);
  return change;
}

/** The newest percept's tick, or −1. */
/** True if he has sensed something himself: a percept that isn't just a voice telling him. */
function ownEvidence(m: GuardMind): boolean {
  for (const p of m.percepts) if (p.kind !== 'voice') return true;
  return false;
}

function newestPercept(m: GuardMind): number {
  let tick = -1;
  for (const p of m.percepts) if (p.tick > tick) tick = p.tick;
  return tick;
}

/** The tick of the newest thing he's been told, or −1. */
function newestTold(b: BrainState): number {
  let tick = -1;
  for (const r of b.told) if (r.heard > tick) tick = r.heard;
  return tick;
}

/** True if something better than the running act is on offer: a higher rank, or the running act's weight beaten by `ratio`. */
function outranked(opts: readonly Option<ActName>[], running: ActName, ratio: number): boolean {
  let rank = -Infinity;
  let weight = 0;
  for (const o of opts) {
    if (o.act === running) {
      rank = o.rank;
      weight = o.weight;
    }
  }
  if (weight <= 0) return true;
  for (const o of opts) {
    if (o.act === running || o.weight <= 0) continue;
    if (o.rank > rank) return true;
    if (o.rank === rank && o.weight > weight * ratio) return true;
  }
  return false;
}

/** Starts an act: where it points, why, and because of what. Writes the change for its system. */
function begin(m: GuardMind, act: ActName, ended: boolean): ActChange {
  const b = m.brain!;
  const prev = b.act;
  b.act = act;
  b.since = m.tick;
  b.linger = -1;
  b.routed = -1;
  b.points = 0;
  b.until = -1;
  b.fireAt = -1;
  b.covered = false;
  delete b.coverStance;
  delete b.down;
  b.useUntil = -1;
  b.calling = null;
  b.route.points.length = 0;
  b.route.next = 0;
  const focus = focusOf(m);
  if (act === 'routine' || act === 'return') {
    routinePose(m.post.routine, m.time, pose);
    b.x = pose.x;
    b.z = pose.z;
  } else {
    b.x = focus.x;
    b.z = focus.z;
  }
  // Why: what his senses gave him, while something drives him; calm or nothing when it doesn't.
  const reacting = act !== 'routine' && act !== 'return';
  const ordered = act === 'task' && b.task !== null;
  const reason: ActWhy = ordered ? 'ordered' : act === 'flee' || (act === 'shelter' && b.sirenAt >= 0) ? 'siren' : act === 'push' ? 'lost' : act === 'fight' && seesHim(m) ? 'seen' : reacting ? perceptWhy(m) : ended ? 'nothing' : 'calm';
  // A reaction traces to what he sensed; if that memory is gone, to the act that led here.
  const cause = ordered ? b.task!.cause : reacting ? perceptCause(m) || b.event : b.event;
  b.cause = cause;
  if (ordered) {
    b.x = b.task!.x;
    b.z = b.task!.z;
  }
  if (act === 'fight' || act === 'push') beginFirefight(m, act);
  // Going to look, or running for the alarm: he says so, and whoever hears it leaves it to him.
  if (act === 'investigate') {
    // He says so aloud, and calls it in unverified: the camp knows, and he has it.
    b.say = { report: { ...currentReport(m), kind: 'claim' }, radius: m.tuning.brain.comms.talkRadius, radio: false };
    if (b.ended.investigate === undefined || m.tick - b.ended.investigate > m.tuning.brain.comms.reportEvery * m.tuning.sim.tickHz) {
      b.radio = { ...currentReport(m), kind: 'heard', checking: true };
    }
  }
  if (act === 'alarm' && m.alarms.length > 0) {
    const box = m.alarms[nearestAlarm(m)]!;
    b.box = nearestAlarm(m);
    b.useUntil = -1;
    b.say = { report: { ...currentReport(m), kind: 'claim', x: box.x, z: box.z }, radius: m.tuning.brain.comms.shoutRadius, radio: false };
  }
  return { from: prev, to: act, why: reason, x: b.x, z: b.z, cause, weight: 1 };
}

/** The freshest percept's kind, as the reason for a reaction; the awareness's own reason if there is none. */
function perceptWhy(m: GuardMind): ActWhy {
  let tick = -1;
  let why: ActWhy = m.awareness.reason as ActWhy;
  for (const p of m.percepts) {
    if (p.tick < tick) continue;
    tick = p.tick;
    why = p.kind === 'sight' ? 'seen' : p.kind === 'shot' ? 'shot' : p.kind === 'voice' ? 'voice' : p.kind === 'body' ? 'body' : p.kind === 'glint' ? 'glint' : p.kind === 'muzzle' ? 'muzzle' : p.kind === 'outage' ? 'outage' : p.kind === 'door' ? 'door' : 'heard';
  }
  return why;
}

/** The cause of the freshest percept, or of the awareness itself: what a reaction is a reaction to. */
function perceptCause(m: GuardMind): number {
  let tick = -1;
  let cause = m.awareness.cause;
  for (const p of m.percepts) {
    if (p.tick >= tick) {
      tick = p.tick;
      cause = p.cause;
    }
  }
  return cause;
}

/**
 * The options his state offers, in a fixed order, each with its rank and its weight: the
 * multiplied considerations. A state with nothing to do falls back on rank 0, the routine.
 */
function fillOptions(m: GuardMind, out: Array<Option<ActName>>): void {
  out.length = 0;
  const T = m.tuning.brain;
  const W = T.weights;
  const b = m.brain!;
  const hz = m.tuning.sim.tickHz;
  const role = T.roles[m.post.role];
  const state = m.awareness.state;
  const elevated = m.post.elevated;
  const focus = focusOf(m);
  const dx = focus.x - m.self.x;
  const dz = focus.z - m.self.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const near = response(T.curves.near, dist);
  const age = m.belief ? (m.tick - m.belief.tick) / hz : 1e6;
  const fresh = response(T.curves.fresh, age);
  const cool = (act: 'investigate' | 'search' | 'report'): number => {
    const ended = b.ended[act];
    if (ended === undefined) return 1;
    const c = act === 'report' ? T.comms.reportEvery : T.cooldown[act];
    const t = (m.tick - ended) / hz;
    return t < c ? 0 : 1;
  };
  // Worth calling in: something to report, a radio in his hands, and he hasn't just called it in.
  const task = b.task;
  const fetching = task !== null && (task.kind === 'fetch' || task.kind === 'escort');
  const order =
    task && (!elevated || task.kind === 'sweep') && (b.act === 'task' || (m.tick - task.issued) / hz < T.camp.keepOrder) ? (task.kind === 'sweep' || task.kind === 'cover' || fetching ? 1 : task.kind === 'search' ? role.search : role.investigate) * T.taskWeight : 0;
  // At a whistle, in a camp that protects its target, a man with nothing better to do gets down and watches (protect.ts).
  const standing = standingTo(m) && !elevated && m.post.role !== 'target';
  // Worth calling in: something he sensed himself (what he was only told is already on the
  // net), a radio in his hands, and he hasn't just called it in.
  // (Once he's on his way, he finishes: a percept lapsing doesn't call him back mid-walk.)
  const own = ownEvidence(m) || b.act === 'investigate' || b.act === 'search';
  const callable = own ? role.report * cool('report') : 0;
  out.push({ act: 'routine', rank: 0, weight: 1 });
  // The target, at lockdown: for the vehicle, ahead of everything (design doc: he flees first),
  // unless his camp protects him: then to his room, and out of it when he's sent for.
  if (!offerProtection(m, out) && m.post.role === 'target' && m.escape && b.sirenAt >= 0) out.push({ act: 'flee', rank: 7, weight: 1 });
  // Sent to bring him out: ahead of anything but a fight in front of him.
  if (order && fetching && state !== 'combat') out.push({ act: 'task', rank: 4.8, weight: 1 });
  const off = offRoutine(m);
  // Someone close, and he knows where: a trained man's fight, ahead of the answers below (firefight.ts).
  // It has its own clock: he doesn't wander off because his alarm has worn down to unease.
  offerFirefight(m, out, state === 'combat' ? 5.2 : 4.9);
  switch (state) {
    case 'unaware':
      if (off && !elevated) out.push({ act: 'return', rank: 1, weight: 1 });
      if (standing) out.push({ act: 'stand-to', rank: 1.5, weight: 1 });
      if (order) out.push({ act: 'task', rank: 2, weight: order });
      break;
    case 'curious':
      out.push({ act: standing ? 'stand-to' : 'look', rank: 2, weight: 1 });
      if (order) out.push({ act: 'task', rank: 2, weight: order * W.orderCurious });
      break;
    case 'suspicious':
      if (order) out.push({ act: 'task', rank: 3, weight: order });
      out.push({ act: 'report', rank: 3, weight: callable * W.reportSuspicious });
      out.push({ act: standing ? 'stand-to' : 'look', rank: 3, weight: T.lookWeight });
      if (!elevated && own) out.push({ act: 'investigate', rank: 3, weight: role.investigate * near * fresh * cool('investigate') * claimed(m, focus) });
      break;
    case 'searching': {
      // Rounds landing near him: he gets behind something first (design doc: uses cover).
      if (!elevated && underFire(m)) out.push({ act: 'cover', rank: 4.5, weight: role.fight > 0 ? 1 : W.coverNoFight });
      if (m.fights) fightOptions(m, out);
      // A worker runs for the alarm when he has seen something (design doc: still raises the alarm).
      if (m.post.role === 'worker' && own) out.push({ act: 'alarm', rank: 4, weight: alarmWeight(m) * W.workerAlarm });
      if (order) out.push({ act: 'task', rank: 4, weight: order });
      out.push({ act: 'report', rank: 4, weight: callable });
      out.push({ act: 'hold', rank: 4, weight: W.holdSearching });
      if (!elevated && own) {
        out.push({ act: 'investigate', rank: 4, weight: role.investigate * near * fresh * cool('investigate') * claimed(m, focus) });
        out.push({ act: 'search', rank: 4, weight: role.search * (W.searchStale + (1 - W.searchStale) * fresh) * near * cool('search') });
      }
      break;
    }
    case 'combat': {
      const sees = seesTarget(m);
      const alarmW = alarmWeight(m);
      out.push({ act: 'alarm', rank: 6, weight: alarmW });
      if (m.fights) fightOptions(m, out);
      out.push({ act: 'report', rank: 5, weight: callable > 0 ? 1 : 0 });
      out.push({ act: 'engage', rank: 5, weight: sees && dist <= m.tuning.brain.combat.range[m.post.role] ? role.fight : 0 });
      out.push({ act: 'cover', rank: 5, weight: sees || elevated ? 0 : role.fight });
      // Having held cover without a sight of him, he works round to where he can.
      out.push({ act: 'flank', rank: 5, weight: !sees && !elevated && b.ended.cover !== undefined ? role.flank : 0 });
      out.push({ act: 'hold', rank: 5, weight: W.holdCombat });
      break;
    }
  }
}

/** How long ago the freshest shot or flash reached him, in seconds; Infinity if none is in mind. */
function newsAge(m: GuardMind): number {
  let tick = -1;
  for (const p of m.percepts) if ((p.kind === 'shot' || p.kind === 'muzzle') && p.tick > tick) tick = p.tick;
  return tick < 0 ? Infinity : (m.tick - tick) / m.tuning.sim.tickHz;
}

/**
 * The first fight (Lab F): what a shot means to a man in a camp that fights. A man on the
 * ground gets out of the line; a runner keeps running. A man on a tower can't leave, so he
 * stays and answers it. This only offers: his act is still chosen by rank and weight.
 */
function fightOptions(m: GuardMind, out: Array<Option<ActName>>): void {
  const T = m.tuning.brain;
  const F = T.fight;
  const age = newsAge(m);
  if (m.post.elevated) {
    if (T.roles[m.post.role].fight > 0 && age <= F.suppress.forget && m.belief) {
      const dx = m.belief.x - m.self.x;
      const dz = m.belief.z - m.self.z;
      if (dx * dx + dz * dz <= F.suppress.range * F.suppress.range) out.push({ act: 'suppress', rank: 5.5, weight: 1 });
    }
    return;
  }
  // Once he's gone to ground he stays until the stand-to ends: only a fresh shot starts it, but it outlasts the news.
  const down = m.brain!.act === 'cover' && !m.brain!.done;
  if (age > F.drill.within && !down) return;
  // Whoever can raise the alarm goes for it first: what stopped alarm runs is what lost us the last attempt at this.
  if (m.post.role === 'worker' && alarmWeight(m) > 0) out.push({ act: 'alarm', rank: 4.6, weight: alarmWeight(m) });
  // And the operator stays on the net: somebody has to tell the camp.
  if (m.post.role === 'radio-operator') out.push({ act: 'report', rank: 4.7, weight: T.roles[m.post.role].report > 0 && (m.brain!.ended.report === undefined || (m.tick - m.brain!.ended.report) / m.tuning.sim.tickHz >= T.comms.reportEvery) ? 1 : 0 });
  out.push({ act: 'cover', rank: 4.5, weight: 1 });
}

/** Someone he's heard has claimed the spot he'd go to: he's not the one going (Blacklist's claiming). */
function claimed(m: GuardMind, at: { x: number; z: number }): number {
  const b = m.brain!;
  const C = m.tuning.brain.comms;
  const hz = m.tuning.sim.tickHz;
  for (const t of b.told) {
    if (t.kind !== 'claim' || t.from === m.id) continue;
    if (yields(m, t.from, 'investigate')) continue;
    if ((m.tick - t.heard) / hz > C.claimFor) continue;
    const dx = t.x - at.x;
    const dz = t.z - at.z;
    if (dx * dx + dz * dz <= C.claimWithin * C.claimWithin) return C.claimedWeight;
  }
  return 1;
}

/** Two guards claiming one thing at once mustn't both back off: whichever is on his way with the lower id keeps it (true: this claim doesn't count against him). */
function yields(m: GuardMind, claimer: number, act: ActName): boolean {
  return m.brain!.act === act && m.id < claimer;
}

/** True if a round has just struck near him: a shot percept that's a strike, close by. */
function underFire(m: GuardMind): boolean {
  const hz = m.tuning.sim.tickHz;
  const C = m.tuning.brain.combat;
  for (const p of m.percepts) {
    if (p.kind !== 'shot' || p.sound !== 'impact') continue;
    if ((m.tick - p.tick) / hz > C.underFireFor) continue;
    const dx = p.x - m.self.x;
    const dz = p.z - m.self.z;
    if (dx * dx + dz * dz < C.underFireWithin * C.underFireWithin) return true;
  }
  return false;
}

/** How much he wants the alarm: near enough to run to, unclaimed by someone he's heard, and a role that does it. */
function alarmWeight(m: GuardMind): number {
  const b = m.brain!;
  // The siren is going: the alarm is up, and there's nothing to run for.
  if (m.post.elevated || m.alarms.length === 0 || b.sirenAt >= 0) return 0;
  const A = m.tuning.brain.alarm;
  const role = A.role[m.post.role];
  if (role <= 0) return 0;
  const near = nearestAlarm(m);
  if (near < 0) return 0;
  const box = m.alarms[near]!;
  const dx = box.x - m.self.x;
  const dz = box.z - m.self.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > A.reach || (b.ended.alarm !== undefined && m.tick - b.ended.alarm < A.retry * m.tuning.sim.tickHz)) return 0;
  // Someone he's heard already running for it? Leave it to him.
  for (const t of b.told) if (t.kind === 'claim' && t.from !== m.id && !yields(m, t.from, 'alarm') && (t.x - box.x) * (t.x - box.x) + (t.z - box.z) * (t.z - box.z) < A.claimWithin * A.claimWithin) return 0;
  return role;
}

/** The index of the nearest alarm box, or −1. */
function nearestAlarm(m: GuardMind): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < m.alarms.length; i++) {
    const a = m.alarms[i]!;
    const dx = a.x - m.self.x;
    const dz = a.z - m.self.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** True if he's far from where his routine says he should be. */
function offRoutine(m: GuardMind): boolean {
  routinePose(m.post.routine, m.time, pose);
  const dx = pose.x - m.self.x;
  const dz = pose.z - m.self.z;
  return dx * dx + dz * dz > m.tuning.brain.backAt * m.tuning.brain.backAt;
}

/** Carries out the current act for the next tick. */
function perform(m: GuardMind, out: Order): void {
  const b = m.brain!;
  switch (b.act) {
    case 'routine':
      keepRoutine(m, out);
      break;
    case 'return':
      performReturn(m, out);
      break;
    case 'look':
      stand(m, out, true);
      break;
    case 'hold':
      stand(m, out, false);
      break;
    case 'investigate':
      performInvestigate(m, out);
      break;
    case 'search':
      performSearch(m, out);
      break;
    case 'report':
      performReport(m, out);
      break;
    case 'task':
      performTask(m, out);
      break;
    case 'suppress':
      performSuppress(m, out);
      break;
    case 'engage':
      performEngage(m, out);
      break;
    case 'cover':
      performCover(m, out);
      break;
    case 'alarm':
      performAlarm(m, out);
      break;
    case 'flank':
      performFlank(m, out);
      break;
    case 'flee':
      performFlee(m, out);
      break;
    case 'shelter':
      performShelter(m, out);
      break;
    case 'stand-to':
      performStandTo(m, out);
      break;
    case 'fight':
      performFight(m, out);
      break;
    case 'push':
      performPush(m, out);
      break;
  }
}

function performReturn(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const T = m.tuning.brain;
  // Rejoin the routine where it will be, about when he gets there.
  routinePose(m.post.routine, m.time, pose);
  const dx = pose.x - m.self.x;
  const dz = pose.z - m.self.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < T.backAt) {
    b.done = true;
    keepRoutine(m, out);
    return;
  }
  routinePose(m.post.routine, m.time + d / T.paces.hurry, pose);
  const look = focusOf(m);
  const w = walk(m, out, pose.x, pose.z, T.paces.hurry, 'walk', look.x, look.z);
  if (w === 'arrived') b.done = true;
  else if (w === 'stuck') keepRoutine(m, out); // no way back by the grid: his routine knows the way
}

/** A radio call: he stands and talks, facing the trouble, and the net gets it when he's done. Killed mid-call, nothing is delivered. */
function performReport(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const C = m.tuning.brain.comms;
  const hz = m.tuning.sim.tickHz;
  if (b.until < 0) {
    b.until = m.tick + Math.round(C.talk * hz);
    // What he says when he picks up the handset is what the net carries when he's done.
    b.calling = currentReport(m);
    b.say = { report: { ...b.calling }, radius: C.talkRadius, radio: true };
  }
  stand(m, out, false);
  if (m.tick >= b.until) {
    b.radio = b.calling ?? currentReport(m);
    b.calling = null;
    b.until = -1;
    b.done = true;
  }
}

/** What he'd say about what he's sensed: the kind it was and where he believes it is. */
function currentReport(m: GuardMind): Report {
  const a = m.awareness;
  const C = m.tuning.brain.comms;
  // What he has sensed himself, best first; a voice he's only heard says the least. A
  // report says where HIS senses put it, not where someone else told him it was.
  let kind: ReportKind = 'heard';
  let rank = -1;
  let own: Percept | null = null;
  for (const p of m.percepts) {
    // A body beats a shot, a muzzle's report beats a crack or a strike, and a voice says the
    // least. Equipment found dead is worth saying only with nothing fresher: he remembers it
    // for minutes, and someone in front of him is news.
    const r = p.kind === 'body' ? 6 : p.kind === 'muzzle' ? 5.5 : p.kind === 'outage' ? 0.5 : p.kind === 'shot' ? (p.sound === 'report' ? 5 : p.sound === 'crack' ? 4 : 3) : p.kind === 'sight' ? 2 : p.kind === 'sound' || p.kind === 'glint' ? 1 : 0;
    if (r <= rank) continue;
    rank = r;
    own = p;
    kind = p.kind === 'body' ? 'body' : p.kind === 'outage' ? 'outage' : p.kind === 'sight' || p.kind === 'muzzle' ? 'contact' : p.kind === 'shot' ? 'shot' : 'heard';
  }
  const f = own && rank > 0 ? own : focusOf(m);
  const y = own && rank > 0 ? own.y : m.belief ? m.belief.y : a.focus ? a.fy : m.self.y;
  const base = own && rank > 0 ? own.radius : m.belief ? m.belief.radius : C.radius[kind];
  const radius = Math.max(base, C.radius[kind]);
  const out: Report = { kind, x: f.x, y, z: f.z, radius, tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: own?.cause ?? perceptCause(m) };
  // A bearing comes from a report at the muzzle; a crack points the wrong way and says so.
  if (kind === 'shot' && own?.sound === 'report') bearingError(m, out, false);
  else if (kind === 'shot' && own?.sound === 'crack') bearingError(m, out, true);
  return out;
}

/**
 * A bearing by ear (E8): where it seemed to come from, turned by an error drawn from
 * his own stream, and the error he states: both the ear's and what he's unsure of.
 */
function bearingError(m: GuardMind, r: Report, crack: boolean): void {
  const S = m.tuning.brain.sniper;
  const dx = r.x - r.fromX;
  const dz = r.z - r.fromZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1) return;
  // A crack comes from where the shock left the bullet, not from the shooter: a guard says
  // as much, by how unsure he is of it, and the commander weighs it accordingly.
  if (crack) {
    r.sigma = (S.maxSigmaDeg * Math.PI) / 180;
    return;
  }
  const ear = (S.earSigmaDeg * Math.PI) / 180;
  const err = ear * gaussian(m.draw);
  const c = dcos(err);
  const s = dsin(err);
  r.x = r.fromX + dx * c - dz * s;
  r.z = r.fromZ + dx * s + dz * c;
  const blur = r.radius / (2 * d);
  r.sigma = Math.sqrt(ear * ear + blur * blur);
}

/** A standard normal draw from his own stream (Box–Muller, with exact math). */
function gaussian(draw: () => number): number {
  const u = Math.max(1e-12, draw());
  const v = draw();
  return Math.sqrt(-2 * dlog(u)) * dcos(2 * Math.PI * v);
}

/** An order from the commander: go there, look around, and call it clear. */
function performTask(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  const task = b.task;
  if (!task) {
    b.done = true;
    stand(m, out, false);
    return;
  }
  if (performFetch(m, out, task)) return;
  if (b.linger >= 0) {
    lookAround(m, out);
    if (m.tick >= b.linger) {
      b.radio = { kind: 'clear', x: task.x, y: m.self.y, z: task.z, radius: T.comms.clearRadius, tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: task.cause };
      b.task = null;
      b.done = true;
    }
    return;
  }
  b.x = task.x;
  b.z = task.z;
  // Told to get off exposed ground (a body in the open, E9): behind the nearest cover from there, for a while.
  if (task.kind === 'cover') {
    if (!b.covered) {
      const spot = findCover(m, task.x, task.z);
      b.covered = true;
      b.coverX = spot.x;
      b.coverZ = spot.z;
      b.routed = -1;
    }
    const w = walk(m, out, b.coverX, b.coverZ, T.paces.hurry, 'walk', task.x, task.z);
    if (w === 'arrived' || w === 'stuck') stand(m, out, false);
    if ((m.tick - task.issued) / hz > T.camp.coverSeconds) {
      b.task = null;
      b.covered = false;
      b.done = true;
    }
    return;
  }
  // A sweep (a marksman on his tower): he stays and looks over the place, then calls it.
  if (task.kind === 'sweep') {
    standToward(m, out, task.x, task.z, true);
    if (b.until < 0) b.until = m.tick + Math.round(T.sniper.sweepSeconds * hz);
    if (m.tick >= b.until) {
      b.until = -1;
      b.task = null;
      b.done = true;
    }
    return;
  }
  const w = walk(m, out, task.x, task.z, task.kind === 'search' ? T.paces.search : T.paces.investigate, 'walk', task.x, task.z, task.y);
  if (w === 'arrived') {
    b.linger = m.tick + Math.round(T.linger.search * hz);
    lookAround(m, out);
  } else if (w === 'stuck') {
    b.task = null;
    b.done = true;
    stand(m, out, false);
  }
}

/** Whether he can see his target now: a sight percept fresh enough to shoot at. */
function seesTarget(m: GuardMind): boolean {
  const within = Math.round(m.tuning.brain.combat.seenFor * m.tuning.sim.tickHz);
  for (const p of m.percepts) if (p.kind === 'sight' && m.tick - p.tick <= within) return true;
  return false;
}

/** Stands and shoots at where he sees his target: a shot every little while. */
function performEngage(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const C = m.tuning.brain.combat;
  const hz = m.tuning.sim.tickHz;
  stand(m, out, false);
  if (b.fireAt < 0) b.fireAt = m.tick + Math.round(C.react * hz);
  if (m.tick >= b.fireAt && seesTarget(m)) {
    const f = m.belief ?? focusOf3(m);
    b.fire = { x: f.x, y: f.y, z: f.z };
    b.fireAt = m.tick + Math.round(C.every * hz);
  }
}

function focusOf3(m: GuardMind): { x: number; y: number; z: number } {
  const a = m.awareness;
  return { x: a.fx, y: a.fy, z: a.fz };
}

/** True if the siren is among what he's hearing now. */
function heardSiren(m: GuardMind): boolean {
  for (const p of m.percepts) if (p.kind === 'voice' && p.sound === 'siren') return true;
  return false;
}

/** The target's run for his vehicle at lockdown: a journey through the motor, interruptible. */
function performFlee(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const e = m.escape;
  if (!e) {
    b.done = true;
    stand(m, out, false);
    return;
  }
  const F = m.tuning.brain.alarm.flee;
  const w = walk(m, out, e.x, e.z, F.pace, 'sprint', e.x, e.z);
  const dx = e.x - m.self.x;
  const dz = e.z - m.self.z;
  if (w === 'arrived' || dx * dx + dz * dz < F.arrive * F.arrive) b.aboard = true;
  if (w !== 'walking') stand(m, out, false); // 'stuck': he stands and tries again after routeRetry; he doesn't give up on his way out
}

/** Works round to one side of where he believes the target is, then stands to see. */
function performFlank(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const C = m.tuning.brain.combat;
  const hz = m.tuning.sim.tickHz;
  if (b.linger >= 0) {
    stand(m, out, true);
    if (m.tick >= b.linger) b.done = true;
    return;
  }
  if (!b.covered) {
    const f = focusOf(m);
    const dx = f.x - m.self.x;
    const dz = f.z - m.self.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    // A point to the side of the target, on his own side of it, by who he is: left or right.
    const side = m.id % 2 === 0 ? 1 : -1;
    b.coverX = f.x + (-dz / d) * C.flankDistance * side;
    b.coverZ = f.z + (dx / d) * C.flankDistance * side;
    b.covered = true;
    b.routed = -1;
  }
  const w = walk(m, out, b.coverX, b.coverZ, m.tuning.brain.paces.search, 'walk', b.x, b.z);
  if (w === 'arrived' || w === 'stuck') {
    b.linger = m.tick + Math.round(C.flankLinger * hz);
    stand(m, out, true);
  }
}

/** Runs for the alarm box and throws the switch: an interruptible journey through the motor. */
function performAlarm(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const A = m.tuning.brain.alarm;
  const hz = m.tuning.sim.tickHz;
  if (b.box < 0 || b.box >= m.alarms.length) b.box = nearestAlarm(m);
  if (b.box < 0) {
    b.done = true;
    stand(m, out, false);
    return;
  }
  const box = m.alarms[b.box]!;
  if (b.useUntil >= 0) {
    stand(m, out, false);
    if (m.tick >= b.useUntil) {
      b.raise = b.box;
      b.useUntil = -1;
      b.done = true;
    }
    return;
  }
  const w = walk(m, out, box.x, box.z, m.tuning.brain.paces.run, 'sprint', box.x, box.z);
  if (w === 'arrived') {
    b.useUntil = m.tick + Math.round(A.use * hz);
    stand(m, out, false);
  } else if (w === 'stuck') {
    b.done = true;
    stand(m, out, false);
  }
}

/** Moves to the nearest spot that breaks the line from the threat, and holds it, watching. */
function performCover(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const C = m.tuning.brain.combat;
  const hz = m.tuning.sim.tickHz;
  if (!b.covered) {
    let threat = focusOf(m);
    let spot: { x: number; z: number } | null = null;
    if (m.fights) {
      const from = shotFrom(m);
      // A crack points along the bullet and a strike is where it landed. He waits a moment for the
      // report, as a soldier is taught to; if none comes (a suppressed shot) he goes on what he has.
      if (!from && newsAge(m) < m.tuning.brain.fight.drill.listen) {
        stand(m, out, false);
        return;
      }
      if (from) threat = from;
      // One man's look around costs rays: it waits its turn with the tick's route searches, and
      // once the tick's looks have cast their share of rays the rest wait for the next.
      if (m.nav.searches.left <= 0 || (m.nav.work?.rays ?? 0) - m.nav.raysAtStart >= m.tuning.brain.fight.drill.raysPerTick) {
        stand(m, out, false);
        return;
      }
      m.nav.searches.left--;
      const found = groundSpot(m.world, m.tuning, m.self.x, m.self.z, threat.x, threat.z, !from, m.nav.work);
      if (found) {
        spot = found;
        b.coverStance = found.stance;
      }
      const D = m.tuning.brain.fight.drill;
      b.standHold = D.standTo.min + (D.standTo.max - D.standTo.min) * m.draw();
      if (!b.blown) {
        b.blown = true;
        b.whistle = true;
      }
    }
    if (!spot) {
      spot = findCover(m, threat.x, threat.z);
      // Something solid breaks the line at chest height, so he crouches behind it. With nothing at all, he gets down where he is.
      if (m.fights) b.coverStance = spot.x === m.self.x && spot.z === m.self.z ? 'prone' : 'crouch';
    }
    b.covered = true;
    b.coverX = spot.x;
    b.coverZ = spot.z;
    b.routed = -1;
  }
  const w = walk(m, out, b.coverX, b.coverZ, m.tuning.brain.paces.run, 'sprint', b.x, b.z);
  if (w === 'arrived' || w === 'stuck') {
    if (b.coverStance) b.down = b.coverStance;
    stand(m, out, false);
    if (m.fights) {
      // Down until it's been quiet a while, then back out: hiding doesn't win a fight.
      const age = newsAge(m);
      const hold = Math.round((b.standHold ?? 0) * hz);
      if (age !== Infinity) b.standTo = m.tick + hold - Math.round(age * hz);
      if (m.tick >= (b.standTo ?? b.since + hold)) b.done = true;
      return;
    }
    if ((m.tick - b.since) / hz > C.holdAfter) b.done = true;
  }
}

/** Where he has evidence the shots are coming from: a flash he saw, or else a report he heard. A crack and a strike don't say. */
function shotFrom(m: GuardMind): { x: number; y: number; z: number } | null {
  let best: Percept | null = null;
  for (const p of m.percepts) {
    const report = p.kind === 'shot' && p.sound === 'report';
    if (!report && p.kind !== 'muzzle') continue;
    // A flash outranks a report, and within a kind the newest wins.
    if (!best || (p.kind === 'muzzle' && best.kind !== 'muzzle') || (p.kind === best.kind && p.tick >= best.tick)) best = p;
  }
  return best;
}

/** A tower man answers: rounds at where he believes the shooter is, whether or not he can see him (Lab F). */
function performSuppress(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const F = m.tuning.brain.fight.suppress;
  const hz = m.tuning.sim.tickHz;
  stand(m, out, false);
  if (!b.blown) {
    b.blown = true;
    b.whistle = true;
  }
  if (b.fireAt < 0) b.fireAt = m.tick + Math.round(F.react * hz);
  const at = shotFrom(m) ?? m.belief;
  if (m.tick >= b.fireAt && at) {
    b.fire = { x: at.x, y: at.y, z: at.z };
    b.fireAt = m.tick + Math.round(F.every * hz);
  }
  if (newsAge(m) > F.forget) b.done = true;
}

/** The nearest spot around him where the line from the threat, at chest height, is broken by something solid. */
function findCover(m: GuardMind, tx: number, tz: number): { x: number; z: number } {
  const C = m.tuning.brain.combat;
  const self = m.self;
  const nav = navigatorOf(m.world, m.tuning);
  let best = { x: self.x, z: self.z };
  let bestD = Infinity;
  for (let ring = 1; ring <= C.coverRings; ring++) {
    const r = (C.coverRange * ring) / C.coverRings;
    for (let k = 0; k < C.coverPoints; k++) {
      const a = (2 * Math.PI * k) / C.coverPoints;
      const x = self.x + r * dcos(a);
      const z = self.z + r * dsin(a);
      if (!nav.standable(x, z)) continue;
      const toThreatX = tx - x;
      const toThreatZ = tz - z;
      // Further from the threat than where he stands, or not much closer.
      const nearer = Math.sqrt(toThreatX * toThreatX + toThreatZ * toThreatZ) - Math.sqrt((tx - self.x) * (tx - self.x) + (tz - self.z) * (tz - self.z));
      if (nearer < -C.coverCloser) continue;
      if (!nav.blockedFrom(tx, tz, x, z, C.chest)) continue;
      const d = (x - self.x) * (x - self.x) + (z - self.z) * (z - self.z) + (nearer < 0 ? C.coverCloserCost : 0);
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return best;
}

function performInvestigate(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  if (b.linger >= 0) {
    lookAround(m, out);
    if (m.tick >= b.linger) b.done = true;
    return;
  }
  // He goes to where he believes it was; a fresher belief moves the goal.
  const focus = focusOf(m);
  if (!sameGoal(b.x, b.z, focus.x, focus.z, T.goalMoved)) {
    b.x = focus.x;
    b.z = focus.z;
  }
  // Where it was has a height: a sound or a sighting upstairs is gone up to.
  const a = m.awareness;
  const goalY = a.state === 'combat' && m.belief ? m.belief.y : a.focus ? a.fy : m.belief ? m.belief.y : undefined;
  const w = walk(m, out, b.x, b.z, T.paces.investigate, 'walk', b.x, b.z, goalY);
  if (w === 'arrived') {
    b.linger = m.tick + Math.round(T.linger.investigate * hz);
    lookAround(m, out);
  } else if (w === 'stuck') {
    b.done = true;
    stand(m, out, false);
  }
}

function performSearch(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  if (b.linger >= 0) {
    lookAround(m, out);
    if (m.tick >= b.linger) {
      b.linger = -1;
      b.points++;
      b.routed = -1;
      if (b.points >= T.search.points) b.done = true;
      else nextSearchPoint(m);
    }
    return;
  }
  if (b.points === 0 && b.routed < 0) nextSearchPoint(m);
  const w = walk(m, out, b.x, b.z, T.paces.search, 'walk', b.x, b.z);
  if (w === 'arrived') {
    b.linger = m.tick + Math.round(T.linger.search * hz);
    lookAround(m, out);
  } else if (w === 'stuck') {
    b.points++;
    b.routed = -1;
    if (b.points >= T.search.points) b.done = true;
    else nextSearchPoint(m);
    stand(m, out, false);
  }
}

/** The next point of a search: around where he believes the intruder is, on a ring that grows as the belief ages. */
function nextSearchPoint(m: GuardMind): void {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  const focus = focusOf(m);
  const age = m.belief ? (m.tick - m.belief.tick) / hz : 0;
  const r = T.search.radius + T.search.growth * age;
  b.angle = m.draw() * 2 * Math.PI;
  b.x = focus.x + r * dsin(b.angle + Math.PI / 2);
  b.z = focus.z + r * dsin(b.angle);
}

