import type { Tuning } from '../../config/tuning';
import { DEG, dcos, dsin } from '../kernel/core/detmath';
import { turnTowards, wrapAngle, yawFromDirection } from '../kernel/core/math';
import type { AwarenessName } from '../kernel/events';
import { routinePose, type RoutinePose } from '../generation';
import type { Gait } from '../body';
import type { TaskKind } from './camp';
import type { GuardMind } from './mind';
import { emptyRoute, emptySteering, followRoute, navigatorOf, type Route, type Steering } from './nav';
import type { Order } from './orders';
import { keepRoutine } from './routine';
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

export const ACTS = ['routine', 'return', 'look', 'investigate', 'search', 'hold', 'report', 'task', 'engage', 'cover'] as const;
export type ActName = (typeof ACTS)[number];

/** Why a guard changed what he's doing: A's reasons for a change of state, and the brain's own. */
export const ACT_WHYS = ['start', 'seen', 'glimpse', 'heard', 'shot', 'voice', 'repeat', 'contact', 'calm', 'arrived', 'nothing', 'stalled', 'no-route', 'lost', 'told', 'report', 'ordered'] as const;
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
}

/** An order as it reached a guard: what to do, where, when it was given, and the event behind it. */
export interface Tasking {
  id: number;
  kind: TaskKind;
  x: number;
  z: number;
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
  };
}

const steer: Steering = emptySteering();
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
  if (b.done || m.tick >= b.thinkAt || a.state !== b.state || newest !== b.percept) {
    b.state = a.state;
    b.percept = newest;
    b.thinkAt = m.tick + Math.max(1, Math.round(T.think * m.tuning.sim.tickHz));
    const running = b.done ? null : b.act;
    if (b.done) b.ended[b.act] = m.tick;
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
  const reason: ActWhy = ordered ? 'ordered' : reacting ? perceptWhy(m) : ended ? 'nothing' : 'calm';
  const cause = ordered ? b.task!.cause : reacting ? perceptCause(m) : b.event;
  b.cause = cause;
  if (ordered) {
    b.x = b.task!.x;
    b.z = b.task!.z;
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
    why = p.kind === 'sight' ? 'seen' : p.kind === 'shot' ? 'shot' : p.kind === 'voice' ? 'voice' : 'heard';
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

/** Where his attention is: his focus, or where he believes the intruder is. */
function focusOf(m: GuardMind): { x: number; z: number } {
  const a = m.awareness;
  if (a.state === 'combat' && m.belief) return m.belief;
  if (a.focus) return { x: a.fx, z: a.fz };
  if (m.belief) return m.belief;
  return { x: m.self.x, z: m.self.z };
}

/**
 * The options his state offers, in a fixed order, each with its rank and its weight: the
 * multiplied considerations. A state with nothing to do falls back on rank 0, the routine.
 */
function fillOptions(m: GuardMind, out: Array<Option<ActName>>): void {
  out.length = 0;
  const T = m.tuning.brain;
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
  const order =
    task && !elevated && (m.tick - task.issued) / hz < m.tuning.brain.camp.keepOrder ? (task.kind === 'search' ? role.search : role.investigate) * T.taskWeight : 0;
  // Worth calling in: something he sensed himself (what he was only told is already on the
  // net), a radio in his hands, and he hasn't just called it in.
  const own = ownEvidence(m);
  const callable = own ? role.report * cool('report') : 0;
  out.push({ act: 'routine', rank: 0, weight: 1 });
  const off = offRoutine(m);
  switch (state) {
    case 'unaware':
      if (off && !elevated) out.push({ act: 'return', rank: 1, weight: 1 });
      if (order) out.push({ act: 'task', rank: 2, weight: order });
      break;
    case 'curious':
      out.push({ act: 'look', rank: 2, weight: 1 });
      if (order) out.push({ act: 'task', rank: 2, weight: order * 0.9 });
      break;
    case 'suspicious':
      if (order) out.push({ act: 'task', rank: 3, weight: order });
      out.push({ act: 'report', rank: 3, weight: callable * 0.2 });
      out.push({ act: 'look', rank: 3, weight: T.lookWeight });
      if (!elevated && own) out.push({ act: 'investigate', rank: 3, weight: role.investigate * near * fresh * cool('investigate') });
      break;
    case 'searching':
      if (order) out.push({ act: 'task', rank: 4, weight: order });
      out.push({ act: 'report', rank: 4, weight: callable });
      out.push({ act: 'hold', rank: 4, weight: 0.2 });
      if (!elevated && own) {
        out.push({ act: 'investigate', rank: 4, weight: role.investigate * near * fresh * cool('investigate') });
        out.push({ act: 'search', rank: 4, weight: role.search * (0.25 + 0.75 * fresh) * cool('search') });
      }
      break;
    case 'combat': {
      const sees = seesTarget(m);
      out.push({ act: 'report', rank: 5, weight: callable > 0 ? 1 : 0 });
      out.push({ act: 'engage', rank: 5, weight: sees ? role.fight : 0 });
      out.push({ act: 'cover', rank: 5, weight: sees || elevated ? 0 : role.fight });
      out.push({ act: 'hold', rank: 5, weight: 0.25 });
      break;
    }
  }
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
    case 'engage':
      performEngage(m, out);
      break;
    case 'cover':
      performCover(m, out);
      break;
  }
}

/** Stands where he is and faces his focus: the head first, then the body, looking around if `scan`. */
function stand(m: GuardMind, out: Order, scan: boolean): void {
  const A = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  const focus = focusOf(m);
  const self = m.self;
  const dx = focus.x - self.x;
  const dz = focus.z - self.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const toward = dist > 1e-6 ? yawFromDirection(dx, dz) : self.yaw;
  const limit = A.headLimitDeg * DEG;
  const combat = m.awareness.state === 'combat';
  let yaw = self.yaw;
  if (Math.abs(wrapAngle(toward - self.yaw)) > limit || combat) yaw = turnTowards(self.yaw, toward, A.turnRate * dt);
  let head = combat ? 0 : clamp(wrapAngle(toward - yaw), limit);
  if (scan) {
    const t = (m.tick - m.brain!.since) / m.tuning.sim.tickHz;
    head = clamp(head + A.scanDeg * DEG * dsin((2 * Math.PI * t) / A.scanPeriod), limit);
  }
  writeOrder(m, out, 0, 0, 'idle', yaw, head);
}

/** Stands where he is and looks around, while he lingers at a spot. */
function lookAround(m: GuardMind, out: Order): void {
  stand(m, out, true);
}

/** Walks toward a goal by the navigator, then says whether he's there. */
function walk(m: GuardMind, out: Order, x: number, z: number, pace: number, gait: Gait, lookX: number, lookZ: number): 'walking' | 'arrived' | 'stuck' {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  const moved = (x - b.goalX) * (x - b.goalX) + (z - b.goalZ) * (z - b.goalZ) > T.goalMoved * T.goalMoved;
  const retry = b.routed >= 0 && (m.tick - b.routed) / hz >= (b.routeOk ? T.routeEvery : T.routeRetry);
  if (b.routed < 0 || (moved && retry) || (!b.routeOk && retry)) {
    if (m.nav.searches.left <= 0) {
      stand(m, out, false);
      return 'walking';
    }
    m.nav.searches.left--;
    const r = navigatorOf(m.world, m.tuning).find(m.self.x, m.self.z, x, z, { work: m.nav.work }, b.route);
    b.routed = m.tick;
    b.routeOk = r === 'found';
    b.goalX = x;
    b.goalZ = z;
    if (!b.routeOk) return 'stuck';
  }
  if (!b.routeOk) return 'stuck';
  const w = followRoute(b.route, m.self.x, m.self.z, pace, m.id, m.tick, m.tuning, steer);
  if (w === 'arrived') return 'arrived';
  if (w === 'stalled') {
    // Something the grid doesn't know is in the way, and sidestepping hasn't cleared it.
    b.routed = -1;
    return 'stuck';
  }
  const A = m.tuning.perception.awareness;
  const dt = 1 / hz;
  const toward = yawFromDirection(steer.dirX, steer.dirZ);
  const yaw = turnTowards(m.self.yaw, toward, A.turnRate * dt);
  const lx = lookX - m.self.x;
  const lz = lookZ - m.self.z;
  const see = lx * lx + lz * lz > 1e-6 ? yawFromDirection(lx, lz) : yaw;
  const head = clamp(wrapAngle(see - yaw), A.headLimitDeg * DEG);
  writeOrder(m, out, steer.wishX, steer.wishZ, gait, yaw, head);
  return 'walking';
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
    b.say = { report: currentReport(m), radius: C.talkRadius, radio: true };
  }
  stand(m, out, false);
  if (m.tick >= b.until) {
    b.radio = b.say?.report ?? currentReport(m);
    b.until = -1;
    b.done = true;
  }
}

/** What he'd say about what he's sensed: the kind it was and where he believes it is. */
function currentReport(m: GuardMind): Report {
  const a = m.awareness;
  const C = m.tuning.brain.comms;
  let kind: ReportKind = 'heard';
  let tick = -1;
  for (const p of m.percepts) {
    if (p.tick < tick) continue;
    tick = p.tick;
    kind = p.kind === 'sight' ? 'contact' : p.kind === 'shot' ? 'shot' : p.kind === 'voice' ? 'heard' : 'heard';
  }
  const f = focusOf(m);
  const y = m.belief ? m.belief.y : a.focus ? a.fy : m.self.y;
  const base = m.belief ? m.belief.radius : C.radius[kind];
  return { kind, x: f.x, y, z: f.z, radius: Math.max(base, C.radius[kind]), tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: perceptCause(m) };
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
  const w = walk(m, out, task.x, task.z, task.kind === 'search' ? T.paces.search : T.paces.investigate, 'walk', task.x, task.z);
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

/** Moves to the nearest spot that breaks the line from the threat, and holds it, watching. */
function performCover(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const C = m.tuning.brain.combat;
  if (!b.covered) {
    const threat = focusOf(m);
    const spot = findCover(m, threat.x, threat.z);
    b.covered = true;
    b.coverX = spot.x;
    b.coverZ = spot.z;
    b.routed = -1;
  }
  const w = walk(m, out, b.coverX, b.coverZ, m.tuning.brain.paces.run, 'sprint', b.x, b.z);
  if (w === 'arrived' || w === 'stuck') {
    stand(m, out, false);
    if ((m.tick - b.since) / m.tuning.sim.tickHz > C.holdAfter) b.done = true;
  }
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
      if (nearer < -2) continue;
      if (!nav.blockedFrom(tx, tz, x, z, C.chest)) continue;
      const d = (x - self.x) * (x - self.x) + (z - self.z) * (z - self.z) + (nearer < 0 ? 4 : 0);
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
  const w = walk(m, out, b.x, b.z, T.paces.investigate, 'walk', b.x, b.z);
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

function sameGoal(ax: number, az: number, bx: number, bz: number, within: number): boolean {
  return (ax - bx) * (ax - bx) + (az - bz) * (az - bz) <= within * within;
}

function writeOrder(m: GuardMind, out: Order, wishX: number, wishZ: number, gait: Gait, yaw: number, head: number): void {
  const A: Tuning['perception']['awareness'] = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  out.kind = 'move';
  out.tick = m.tick;
  out.wishX = wishX;
  out.wishZ = wishZ;
  out.gait = gait;
  out.yaw = yaw;
  out.pitch = 0;
  out.headYaw = turnTowards(m.head, head, A.headRate * dt);
}

function clamp(v: number, limit: number): number {
  return v > limit ? limit : v < -limit ? -limit : v;
}
