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
 * Nothing here knows more than a mind holds (rule 13): the target acts on the whistle and
 * the siren he heard and on what he was told at his door; the men sent act on an order.
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
  if (m.post.role === 'target' && b.sirenAt >= 0 && b.releasedAt === undefined) {
    if (toldToCome(b) || (m.tick - b.sirenAt) / hz >= m.tuning.brain.protect.giveUp) b.releasedAt = m.tick;
  }
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
  if (task.kind !== 'fetch' && task.kind !== 'escort') return false;
  const b = m.brain!;
  const T = m.tuning.brain;
  const P = T.protect;
  const hz = m.tuning.sim.tickHz;
  b.x = task.x;
  b.z = task.z;
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
