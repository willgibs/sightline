import type { ActName, BrainState, Tasking } from './brain';
import type { GuardMind } from './mind';
import { stand, walk } from './moves';
import type { Order } from './orders';
import type { Option } from './utility';

/**
 * A camp that protects what it's guarding (docs/foundation-review.md, section 3).
 *
 * A camp that runs its target to his vehicle the moment a siren sounds has one answer to
 * everything, and it takes about 27 seconds: whatever the player does after the first loud
 * moment, the mission is decided before he can do anything else. A camp that protects him
 * answers in stages, each of which someone can see or hear, and each of which can be worked
 * against:
 *
 *   stand-to    The whistle. Men with nothing of their own to go on get down where they are
 *               and watch; the target goes to his hard room. With no more trouble it ends,
 *               and everyone goes back to what they were doing.
 *   lockdown    The siren. He stays in his room. The radio, if it works, has called the relief.
 *   fetch       The relief is at the gate. Two men are sent to his door, and tell him aloud
 *               that it's time. Without them he doesn't know it is.
 *   extraction  He runs for his vehicle, and they see him to it. Only now can he leave.
 *
 * Every step is carried by something in the world. Cut the radio and no relief is called,
 * and no order reaches anyone. Drop the men sent for him and nobody tells him. Disable the
 * vehicle and he gets to it and is stranded. A man left waiting long enough loses his nerve
 * and runs for it alone: the last step, and the only one nobody carries.
 *
 * **Which of those happen depends on the camp** (the owner's call, Nov 10: "it doesn't
 * always make sense to make a vehicle exfil into the unknown over hunker down and defend",
 * and "there needs to be a clear method to the madness"). A camp is built round one problem
 * (generation/crux.ts), and its answer for its target follows from it:
 *
 *   holds    A camp he's buried in, with a way in kept open. He goes to his room and stays
 *            there to the end. Its relief comes to his doors, not for him. Someone has to
 *            go in.
 *   bolts    A camp built to be flushed. At the siren one of the men on his doors goes to
 *            his vehicle and starts it, and that engine is the warning: when it has run a
 *            while the other goes in for him, and he runs for it. Nobody needs the radio.
 *   neither  The stages above: he waits for the relief to bring him out.
 *
 * The method is one sentence: he leaves only by a way the camp has ready. What it has
 * ready can be seen before a shot (who stands on his doors, where his vehicle is, whether
 * he walks out) and heard after one (an engine in the camp, or on the road).
 *
 * The bolt is a drill, so every step of it is something a man does on what he himself
 * hears. The siren sends the man on the target's door to the vehicle, to start it. If no
 * engine is running a while later, the nearest man left goes: each counts for himself, the
 * longer the farther off he is, so nobody has to be told. An engine heard for long enough
 * sends the man who started it in for the target, and the target comes out when he's told,
 * or by himself once he has heard it for longer still. Kill the man on the door and it
 * starts later. Kill whoever started it, and the target comes out late, alone. Kill every
 * man who goes to it, and it's a camp that waits for its relief. Kill the vehicle and
 * nothing starts, nobody is sent, and he stays.
 *
 * Nothing here knows more than a mind holds (rule 13): the target acts on the whistle and
 * the siren he heard and on what he was told at his door; the men sent act on an order; and
 * a camp's drill is something each of its men knows, like where its alarm boxes are.
 */

/** The tick a whistle last reached him, or −1: it's what he's hearing now, so it lasts only as long as he remembers a sound. */
function whistleHeard(m: GuardMind): number {
  let tick = -1;
  for (const p of m.percepts) if (p.kind === 'voice' && p.sound === 'whistle' && p.tick > tick) tick = p.tick;
  return tick;
}

/** True if someone at his door has told him it's time, since the siren. */
function toldToCome(b: BrainState): boolean {
  for (const t of b.told) if (t.kind === 'escort' && t.heard >= b.sirenAt) return true;
  return false;
}

/**
 * What a protecting camp's whistle and siren leave in a man's memory, once a tick before he
 * thinks: how long he stands to, and, for the target, whether he's been released. Both have
 * to outlast the sound or the words that caused them, which he forgets in seconds.
 */
export function noteProtection(m: GuardMind): void {
  const b = m.brain!;
  if (!m.protects) return;
  const hz = m.tuning.sim.tickHz;
  const heard = whistleHeard(m);
  if (heard >= 0 && heard !== b.whistledAt) {
    b.whistledAt = heard;
    const S = m.tuning.brain.fight.drill.standTo;
    b.standToUntil = heard + Math.round((S.min + (S.max - S.min) * m.draw()) * hz);
  }
  if (m.answer === 'bolt') noteEngine(m);
  if (m.post.role === 'target' && b.sirenAt >= 0 && b.releasedAt === undefined) {
    const P = m.tuning.brain.protect;
    // He knows the drill too: an engine that has run this long with nobody come for him means nobody is going to.
    const heardEnough = b.engine !== undefined && (m.tick - b.engine.since) / hz >= P.answer.prep + P.answer.own;
    // In a camp that holds there's nothing to wait for and nowhere to go: he stays.
    if (m.answer !== 'hold' && (toldToCome(b) || heardEnough || (m.tick - b.sirenAt) / hz >= P.giveUp)) {
      b.releasedAt = m.tick;
      b.releasedBy = toldToCome(b) ? 'told' : heardEnough ? 'engine' : 'nerve';
    }
  }
  // The drill is for the alarm's first minutes: after that, whatever it came to, he's a man on a door again.
  if (m.answer === 'bolt' && drilled(m) && b.sirenAt >= 0 && (m.tick - b.sirenAt) / hz < m.tuning.brain.protect.giveUp) drill(m);
}

/** Whether a camp's drill for getting its target out is this man's business: the man on the door, and anyone who fights on the ground. Not the target, and not a man on a tower. */
function drilled(m: GuardMind): boolean {
  if (m.post.role === 'target' || m.post.elevated) return false;
  return m.post.holdsDoor === true || m.tuning.brain.roles[m.post.role].fight > 0;
}

/**
 * The engine a man hears running where his camp's vehicle stands: since when, and when
 * last. A sound is forgotten in seconds, and a drill has to count a minute of it.
 */
function noteEngine(m: GuardMind): void {
  const b = m.brain!;
  const A = m.tuning.brain.protect.answer;
  const at = m.escape;
  let last = -1;
  if (at) {
    for (const p of m.percepts) {
      if (p.kind !== 'voice' || p.sound !== 'engine' || p.tick <= last) continue;
      if ((p.x - at.x) * (p.x - at.x) + (p.z - at.z) * (p.z - at.z) <= A.near * A.near) last = p.tick;
    }
  }
  const lapse = Math.round(A.lapse * m.tuning.sim.tickHz);
  if (last >= 0) {
    if (!b.engine || last - b.engine.last > lapse) b.engine = { since: last, last };
    else b.engine.last = last;
  } else if (b.engine && m.tick - b.engine.last > lapse) delete b.engine;
}

/**
 * A camp that bolts, for one of its men who has heard the siren: his part of the drill, as
 * an order he gives himself.
 *
 * - No engine running, and it's his turn: he goes and starts it. The man on the target's
 *   door goes at once. Anyone else who fights on the ground counts first, the longer the
 *   farther he is from the vehicle, so the nearest man left is the one who goes, and nobody
 *   has to be told who that is.
 * - An engine running that he didn't start, while he's on his way to it: someone has it,
 *   and he leaves it to him.
 * - An engine that has run long enough: the man on the door, and whoever started it, go in
 *   for the target.
 */
function drill(m: GuardMind): void {
  const b = m.brain!;
  const at = m.escape;
  const room = m.protects;
  if (!at || !room || b.stranded) return;
  const A = m.tuning.brain.protect.answer;
  const hz = m.tuning.sim.tickHz;
  const holds = m.post.holdsDoor === true;
  const mine = (kind: 'start' | 'fetch', x: number, z: number, y?: number): void => {
    b.task = { id: 0, kind, x, z, ...(y === undefined ? {} : { y }), issued: m.tick, cause: m.awareness.cause };
  };
  if (b.engine) {
    if (b.task?.kind === 'start' && b.drilled !== 'start' && !holds) {
      b.task = null;
      b.done = true;
    } else if ((holds || b.drilled === 'start') && (m.tick - b.engine.since) / hz >= A.prep && b.task?.kind !== 'fetch' && b.task?.kind !== 'escort') {
      b.drilled = 'fetch';
      mine('fetch', room.x, room.z, room.y);
    }
    return;
  }
  // Not a man who's already on it, or has been in for the target, or has been sent on another errand about him.
  const errand = b.task?.kind;
  if (b.drilled === 'fetch' || errand === 'start' || errand === 'fetch' || errand === 'escort' || errand === 'post') return;
  const dx = at.x - m.self.x;
  const dz = at.z - m.self.z;
  const turn = holds ? 0 : A.takeOver + Math.sqrt(dx * dx + dz * dz) * A.perMetre;
  if ((m.tick - b.sirenAt) / hz >= turn) mine('start', at.x, at.z);
}

/** True while a whistle has him standing to. */
export function standingTo(m: GuardMind): boolean {
  const until = m.brain!.standToUntil;
  return m.protects !== null && until !== undefined && m.tick < until;
}

/**
 * What the target does about trouble, in a camp that protects him, ahead of everything else
 * he might do: to his room at a whistle or a siren, and out of it only when released. Returns
 * false if this camp doesn't protect him, and the old answer stands.
 */
export function offerProtection(m: GuardMind, out: Array<Option<ActName>>): boolean {
  if (!m.protects || m.post.role !== 'target') return false;
  const b = m.brain!;
  if (b.sirenAt >= 0) {
    // Out only when he's been released, and only if there's a vehicle to run to that hasn't already let him down.
    if (b.releasedAt !== undefined && m.escape && !b.stranded) out.push({ act: 'flee', rank: 7, weight: 1 });
    else out.push({ act: 'shelter', rank: 7, weight: 1 });
  } else if (standingTo(m)) out.push({ act: 'shelter', rank: 6, weight: 1 });
  return true;
}

/** The target in his hard room: he gets there as fast as he can, and keeps low until someone comes or it's over. */
export function performShelter(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const at = m.protects!;
  const dx = at.x - m.self.x;
  const dz = at.z - m.self.z;
  const P = m.tuning.brain.protect;
  if (dx * dx + dz * dz > P.near * P.near * 0.25 || (at.y !== undefined && Math.abs(at.y - m.self.y) > m.tuning.gen.compound.storey / 2)) {
    const w = walk(m, out, at.x, at.z, m.tuning.brain.alarm.flee.pace, 'sprint', at.x, at.z, at.y);
    if (w === 'walking') return;
  }
  b.down = 'crouch';
  stand(m, out, false);
  // A stand-to that came to nothing: back to his day.
  if (b.sirenAt < 0 && !standingTo(m)) b.done = true;
}

/** A man with nothing of his own to go on, at the whistle: down where he is, looking about, until it's been quiet a while. */
export function performStandTo(m: GuardMind, out: Order): void {
  const b = m.brain!;
  b.down = 'crouch';
  stand(m, out, true);
  if (!standingTo(m)) b.done = true;
}

/**
 * The first half of bringing him out: to his door at a run, then telling him, aloud and
 * more than once, that it's time. Then the order becomes its second half. Returns false if
 * the order isn't one of these.
 */
export function performFetch(m: GuardMind, out: Order, task: Tasking): boolean {
  if (task.kind !== 'fetch' && task.kind !== 'escort' && task.kind !== 'start' && task.kind !== 'post') return false;
  const b = m.brain!;
  const T = m.tuning.brain;
  const P = T.protect;
  const hz = m.tuning.sim.tickHz;
  b.x = task.x;
  b.z = task.z;
  if (task.kind === 'post') {
    // A camp that holds: to a door of the target's building at a run. It's his post from then on, and he keeps it as any man keeps his.
    const w = walk(m, out, task.x, task.z, T.paces.run, 'sprint', task.x, task.z);
    if (w !== 'walking') {
      stand(m, out, true);
      b.task = null;
      b.done = true;
    }
    return true;
  }
  if (task.kind === 'start' && !m.escape) {
    // It's gone from where it stood: there's nothing to start.
    b.task = null;
    b.done = true;
    stand(m, out, false);
    return true;
  }
  if (task.kind === 'start') {
    // To the vehicle at a run, a hand on the starter (its system starts it, or finds it dead), and then by it, watching, until the drill sends him in.
    const dx = task.x - m.self.x;
    const dz = task.z - m.self.z;
    const F = T.alarm.flee;
    const there = dx * dx + dz * dz < F.arrive * F.arrive;
    const w = there ? 'arrived' : walk(m, out, task.x, task.z, T.paces.run, 'sprint', task.x, task.z);
    if (w === 'arrived') {
      if (!b.engine) {
        b.start = true;
        b.drilled = 'start';
      }
      b.down = 'crouch';
      stand(m, out, true);
    } else if (w === 'stuck') stand(m, out, false);
    // It won't start, or he has waited by it long enough for the others to have acted: back to his own business.
    if (b.stranded || (m.tick - task.issued) / hz > P.answer.prep + P.answer.own + T.camp.keepOrder) {
      b.task = null;
      b.done = true;
    }
    return true;
  }
  if (task.kind === 'escort') {
    // To his vehicle, and stay by it while he gets away: the order lapses with the commander's.
    const w = walk(m, out, task.x, task.z, T.paces.run, 'sprint', task.x, task.z);
    if (w !== 'walking') stand(m, out, true);
    if ((m.tick - task.issued) / hz > T.camp.keepOrder) {
      b.task = null;
      b.done = true;
    }
    return true;
  }
  if (b.linger >= 0) {
    stand(m, out, false);
    if (m.tick >= b.until) call(m, task);
    if (m.tick >= b.linger) {
      // He's had his chance to hear it: on to the vehicle, if the camp has one, to cover his way.
      b.linger = -1;
      b.until = -1;
      b.routed = -1;
      if (m.escape) b.task = { ...task, kind: 'escort', x: m.escape.x, z: m.escape.z, issued: m.tick };
      else {
        b.task = null;
        b.done = true;
      }
    }
    return true;
  }
  const dx = task.x - m.self.x;
  const dz = task.z - m.self.z;
  // On the same floor as him, if he's upstairs: under his feet isn't at his door.
  const near = dx * dx + dz * dz <= P.near * P.near && (task.y === undefined || Math.abs(task.y - m.self.y) < m.tuning.gen.compound.storey / 2);
  const w = near ? 'arrived' : walk(m, out, task.x, task.z, T.paces.run, 'sprint', task.x, task.z, task.y);
  if (w === 'arrived' || near) {
    b.linger = m.tick + Math.round(P.wait * hz);
    call(m, task);
    stand(m, out, false);
  } else if (w === 'stuck') {
    b.task = null;
    b.done = true;
    stand(m, out, false);
  }
  return true;
}

/** "Time to go": said aloud at his door, for whoever is in earshot, and again in a moment. */
function call(m: GuardMind, task: Tasking): void {
  const b = m.brain!;
  const C = m.tuning.brain.comms;
  const to = m.escape ?? { x: task.x, z: task.z };
  b.say = { report: { kind: 'escort', x: to.x, y: m.self.y, z: to.z, radius: C.radius.escort, tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: task.cause }, radius: C.talkRadius, radio: false };
  b.until = m.tick + Math.round(m.tuning.brain.protect.call * m.tuning.sim.tickHz);
}
