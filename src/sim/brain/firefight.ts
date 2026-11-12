import type { Gait, Stance } from '../body';
import { turnTowards, wrapAngle, yawFromDirection } from '../kernel/core/math';
import type { Percept } from '../perception';
import type { ActName } from './brain';
import type { GuardMind } from './mind';
import { walk } from './moves';
import type { Order } from './orders';
import { dangerOf, exposedAt, fightingSpot, lineFrom, type FightingSpot } from './positions';
import type { Report } from './reports';
import type { Option } from './utility';
import { openingNear, openingThrough, outsideWalls, type Opening } from './walls';

/**
 * The firefight (Lab F, step 2; docs/camp-engine.md, section 9): how a trained man fights
 * someone close whose place he knows.
 *
 * Before this a man who lost sight of an intruder ran to the nearest thing that hid him and
 * stayed there, and one who could see him stood in the open to shoot. The owner, who walked
 * into a camp and out again: "they wouldn't even attempt to follow", and "I'm not targeted
 * or under pressure even at close quarters". What a soldier is taught is phases:
 *
 *   cover     Out of his line first, to a position: somewhere that hides him down, with a
 *             place to look and fire from up (positions.ts).
 *   find      Up to look at where the intruder is believed to be, down again, in a rhythm.
 *             A head that comes up at a place you can learn is what makes this a fight.
 *   fight     In sight: a few aimed rounds, then down. Rounds landing close keep him down.
 *   follow    Lost: he holds the angle a moment, then one man says he's moving and goes, a
 *             bound at a time, to where he can see the place; whoever heard him keeps
 *             watching it. If it's empty he goes on the way the intruder was heading, a few
 *             bounds and no farther than his leash, then calls it lost.
 *
 *   chase     Gone out of the camp's walls, with this man watching him go (he saw him inside
 *             them, and then outside by an opening or going out through one): no holding the
 *             angle and no covered way, because a man who is leaving isn't waiting for
 *             anyone. One or two go after him at a run, to the opening and a step out of
 *             it, and look each way along the wall. The owner, Nov 12: leaving by a gate
 *             and following the wall "gives a slight impression of 'he walked out that
 *             door, must be gone forever'", and what they'd expect is "a guard or two maybe
 *             continue pursuit to fire from behind me as I escape, but if I can shoot them
 *             down as they expose themselves outside of the camp... the rest are still
 *             defending within". So no more than a few go in one fight, and none past the
 *             camp's own ground: the target is what the rest are there for.
 *
 * Nobody runs across the camp. A man's position is within a short run of where he stands,
 * so the camp fights from where it is, and only the one who said so closes in. That's the
 * owner's other half: "once an attacker position is known, the whole enemy camp doesn't just
 * converge into one location as a ring".
 *
 * Everything here is decided from a mind (rule 13): where the intruder is comes from his own
 * eyes, a flash or a close report, or a contact someone called, and who's moving comes from
 * hearing him say so. Two men who say it at once settle it by who heard whom (the lower id
 * keeps going), as two claims on anything do. Cut the radio and the men in earshot still
 * fight as one; the rest never hear of it.
 */

/** A position, the place it was chosen against, when, and whether he's going to it by a way that keeps out of the intruder's view. */
export interface Position extends FightingSpot {
  tx: number;
  tz: number;
  tick: number;
  careful: boolean;
}

/** What a man remembers of a firefight: absent until he's in one, and gone when it's over for him. */
export interface Firefight {
  /** Where he believes the intruder is, how sure (metres), and the tick of the news it rests on. */
  x: number;
  y: number;
  z: number;
  r: number;
  news: number;
  /** His own senses', or only what he was told. */
  own: boolean;
  /** The tick he came into this fight. */
  since: number;
  /** The last tick he had him in sight, or −1; where that was; and the way the intruder was going then, m/s. */
  seen: number;
  sx: number;
  sz: number;
  vx: number;
  vz: number;
  /** The last tick he had him in sight inside the camp's walls, or −1 (the chase): a man can watch someone go out only if he saw him in. */
  inside: number;
  /** An older sighting to tell that from: where and when, or −1. */
  ox: number;
  oz: number;
  ot: number;
  /** His position: null until he has one. */
  spot: Position | null;
  /** He's reached it. */
  there: boolean;
  /** Up at its firing place, or down behind it, and until when. */
  up: boolean;
  until: number;
  /** Rounds fired this time up. */
  rounds: number;
  /** Head down until this tick: rounds are striking close. */
  pinned: number;
  /** When he last shouted where the intruder is, or −1. */
  shouted: number;
  /** The radio call he's making from behind cover: the tick it ends, or −1. */
  calling: number;
  /** How many times he's moved for a better view of the place. */
  improved: number;
  /** Whether he could be seen from the intruder's place when he last checked. */
  exposed: boolean;
  /** Following: bounds made since he last saw him, the tick he first had eyes on the place with nobody there (or −1), and whether he's called it lost. */
  bounds: number;
  clear: number;
  lost: boolean;
  /** The bound he's found a covered way to and means to make: he goes once he has one, and says so. Null otherwise. */
  bound: Position | null;
  /** The chase: the men he's heard say they're going out of the walls after the intruder, himself among them once he has, and the tick each said it. A camp sends only so many in one fight, and the first to say so are the ones who go. */
  out: number[];
  outAt: number[];
  /** Chasing: the opening he's going out by. Null when he isn't. */
  gate: Opening | null;
  /** The sighting (its tick) after which he last called out that the intruder had gone out of the walls, or −1: said once for each time he watches him go. */
  cried: number;
  /** Out of it: which way he's looking (0 one way along the wall, 1 the other, 2 out across the ground), and the tick he began to, or −1. */
  sweep: number;
  swept: number;
  /** The last word he had that the intruder had gone out of the walls: when he heard it and the place it named, or −1. Word of where he was a moment before, arriving later, doesn't unsay it. */
  heardOut: number;
  outX: number;
  outZ: number;
}

function createFirefight(): Firefight {
  return { x: 0, y: 0, z: 0, r: 0, news: -1, own: false, since: -1, seen: -1, sx: 0, sz: 0, vx: 0, vz: 0, inside: -1, ox: 0, oz: 0, ot: -1, spot: null, there: false, up: false, until: -1, rounds: 0, pinned: -1, shouted: -1, calling: -1, improved: 0, exposed: true, bounds: 0, clear: -1, lost: false, bound: null, out: [], outAt: [], gate: null, cried: -1, sweep: 0, swept: -1, heardOut: -1, outX: 0, outZ: 0 };
}

/**
 * The intruder in his sight now, from this tick or the last: a sighting he's sure of, or a
 * figure where he already believes the intruder to be. His eyes alone take seconds to be
 * sure of a man at a distance, which is right for someone who isn't expecting one. A man
 * who has just seen the flash there, or been told, is: what he glimpses there is the man.
 */
function sightOf(m: GuardMind): Percept | null {
  let sight: Percept | null = null;
  for (const p of m.percepts) if (p.kind === 'sight' && m.tick - p.tick <= 2) sight = p;
  if (!sight) return null;
  if (m.belief && (m.belief.seen || m.awareness.state === 'combat')) return sight;
  const ff = m.brain!.ff;
  if (!ff) return null;
  const E = m.tuning.brain.firefight.expect;
  const age = (m.tick - ff.news) / m.tuning.sim.tickHz;
  if (age > E.fresh) return null;
  const within = ff.r + E.within + m.tuning.perception.awareness.believedSpeed * age;
  return (sight.x - ff.x) * (sight.x - ff.x) + (sight.z - ff.z) * (sight.z - ff.z) <= within * within ? sight : null;
}

/** True if he has the intruder in his sights as he starts to fight: it's why he's fighting, whatever else he's just heard. */
export function seesHim(m: GuardMind): boolean {
  return sightOf(m) !== null;
}

/** True if this man fights at all: his camp is drilled for it, he has a rifle's role, and he isn't stuck on a tower (who answers from it, as before). */
function fighter(m: GuardMind): boolean {
  return m.firefight && !m.post.elevated && m.tuning.brain.roles[m.post.role].fight > 0;
}

/**
 * What this tick's senses do to what he remembers of the fight, once a tick before he
 * thinks: where the intruder is by the newest thing that says, which way he was going,
 * whether rounds are landing close, and whether it's over.
 */
export function noteFirefight(m: GuardMind): void {
  const b = m.brain!;
  if (!fighter(m)) return;
  const F = m.tuning.brain.firefight;
  const hz = m.tuning.sim.tickHz;
  const self = m.self;
  let ff = b.ff;
  const sight = sightOf(m);
  if (sight) {
    if (!ff) ff = b.ff = createFirefight();
    // Seen again after a gap: he may follow again, and the way he was going is anyone's guess.
    if (ff.seen < 0 || sight.tick - ff.seen > hz) {
      ff.ox = sight.x;
      ff.oz = sight.z;
      ff.ot = sight.tick;
      ff.vx = 0;
      ff.vz = 0;
    } else if (sight.tick - ff.ot >= hz / 2) {
      const dt = (sight.tick - ff.ot) / hz;
      ff.vx = (sight.x - ff.ox) / dt;
      ff.vz = (sight.z - ff.oz) / dt;
      ff.ox = sight.x;
      ff.oz = sight.z;
      ff.ot = sight.tick;
    }
    ff.x = sight.x;
    ff.y = sight.y;
    ff.z = sight.z;
    ff.r = sight.radius;
    ff.news = sight.tick;
    ff.own = true;
    ff.seen = sight.tick;
    ff.sx = sight.x;
    ff.sz = sight.z;
    if (m.chases && !outsideWalls(m.world, sight.x, sight.z)) ff.inside = sight.tick;
    ff.bounds = 0;
    ff.clear = -1;
    ff.lost = false;
    ff.bound = null;
    // In his sights again: whatever he was going out to look for, it's a fight now.
    ff.gate = null;
  } else {
    // Otherwise the newest thing that says where: a flash, a report close by, or a contact someone called.
    let news = ff ? ff.news : -1;
    let from: { x: number; y: number; z: number; radius: number } | null = null;
    let own = false;
    for (const p of m.percepts) {
      if (p.kind !== 'muzzle' && !(p.kind === 'shot' && p.sound === 'report')) continue;
      if (p.tick > news && p.radius <= F.fix) {
        news = p.tick;
        from = p;
        own = true;
      }
    }
    for (const t of b.told) {
      if (t.kind !== 'contact' || t.from === m.id) continue;
      if (t.heard > news && t.radius <= F.fix) {
        news = t.heard;
        from = t;
        own = false;
      }
    }
    if (from && (from.x - self.x) * (from.x - self.x) + (from.z - self.z) * (from.z - self.z) <= F.reach * F.reach) {
      if (!ff) ff = b.ff = createFirefight();
      // The same place said again changes nothing but how fresh it is. A new place, and whoever had given up may go again.
      const keep = F.spot.keep;
      if (ff.news < 0 || (from.x - ff.x) * (from.x - ff.x) + (from.z - ff.z) * (from.z - ff.z) > keep * keep) {
        ff.vx = 0;
        ff.vz = 0;
        ff.bounds = 0;
        ff.clear = -1;
        ff.lost = false;
        ff.bound = null;
      }
      ff.x = from.x;
      ff.y = from.y;
      ff.z = from.z;
      ff.r = from.radius;
      ff.news = news;
      ff.own = own;
    }
  }
  if (!ff) return;
  if (ff.since < 0) ff.since = m.tick;
  // He watched him go out of the walls: he says so, once, aloud and on the net, whatever he's doing about it himself. The
  // men nearest the opening may not have seen, and the man with a box in reach is on his way to it.
  if (m.chases && !sight && ff.seen >= 0 && ff.cried !== ff.seen) {
    const went = wentOut(m, ff);
    if (went && went.at === ff.seen) {
      ff.cried = ff.seen;
      const C = m.tuning.brain.comms;
      const step = F.chase.step;
      const x = went.gate.x + went.gate.nx * step;
      const z = went.gate.z + went.gate.nz * step;
      const report: Report = { kind: 'contact', x, y: m.world.terrain.heightAt(x, z) + F.spot.eye, z, radius: C.radius.contact, tick: m.tick, from: m.id, fromX: self.x, fromZ: self.z, cause: b.cause, sure: true, out: true };
      b.say = { report, radius: C.shoutRadius, radio: false };
      if (m.tuning.brain.roles[m.post.role].report > 0) b.radio = { ...report };
    }
  }
  // Word that he's gone out of the walls, from a man who watched him go: kept apart from where he's believed to be, which the net's older news may overwrite.
  if (m.chases) {
    for (const t of b.told) {
      if (t.kind !== 'contact' || t.out !== true || t.from === m.id || t.heard <= ff.heardOut) continue;
      ff.heardOut = t.heard;
      ff.outX = t.x;
      ff.outZ = t.z;
    }
    // In his own sight, inside them: whatever he heard, he's back.
    if (sight && !outsideWalls(m.world, sight.x, sight.z)) ff.heardOut = -1;
  }
  // Who has said he's going out of the walls after him: heard aloud or on the net, and counted for as long as this fight
  // lasts (the chase). Only a man who says so: one going after somebody who was outside all along says "moving" too, and
  // that's the firefight's business, which this leaves as it was.
  if (m.chases) {
    for (const t of b.told) {
      if (t.kind !== 'moving' || t.out !== true || t.from === m.id || ff.out.includes(t.from)) continue;
      ff.out.push(t.from);
      ff.outAt.push(t.tick);
    }
  }
  // Rounds striking close, or cracking past: his head stays down a while.
  for (const p of m.percepts) {
    if (p.kind !== 'shot' || (p.sound !== 'impact' && p.sound !== 'crack') || m.tick - p.tick > 1) continue;
    const dx = p.x - self.x;
    const dz = p.z - self.z;
    if (dx * dx + dz * dz > F.pin.within * F.pin.within) continue;
    const until = m.tick + Math.round((F.pin.min + (F.pin.max - F.pin.min) * m.draw()) * hz);
    if (until > ff.pinned) ff.pinned = until;
  }
  // No news for long enough: it's over for him, and what he does next is the brain's old business.
  if ((m.tick - ff.news) / hz > F.forget) {
    delete b.ff;
    if (b.act === 'fight' || b.act === 'push') b.done = true;
  }
}

/** True while he's in a firefight: he remembers one, and the place is still within reach of him. */
function inFirefight(m: GuardMind): boolean {
  const ff = m.brain!.ff;
  if (!ff || !fighter(m)) return false;
  const reach = m.tuning.brain.firefight.reach * 1.2;
  return (ff.x - m.self.x) * (ff.x - m.self.x) + (ff.z - m.self.z) * (ff.z - m.self.z) <= reach * reach;
}

/** Someone else has said he's moving on this place, lately, and it's his to do: this man watches instead. */
function someoneMoving(m: GuardMind): boolean {
  const b = m.brain!;
  const ff = b.ff!;
  const P = m.tuning.brain.firefight.push;
  const hz = m.tuning.sim.tickHz;
  for (const t of b.told) {
    if (t.kind !== 'moving' || t.from === m.id) continue;
    if ((m.tick - t.heard) / hz > P.claimFor) continue;
    if ((t.x - ff.x) * (t.x - ff.x) + (t.z - ff.z) * (t.z - ff.z) > P.claimWithin * P.claimWithin) continue;
    // Two who said it at once: the one already going with the lower id keeps going.
    if (b.act === 'push' && m.id < t.from) continue;
    return true;
  }
  return false;
}

/**
 * Whether it's his turn to think of going after him: nobody else has said they are, he's
 * held the angle long enough, and he's near enough and willing. The likeliest man's turn
 * comes first (the keener his role and the nearer he is, the sooner), so that he's said so
 * before the next man's comes.
 */
function dueToGo(m: GuardMind): boolean {
  const b = m.brain!;
  const ff = b.ff!;
  const P = m.tuning.brain.firefight.push;
  const hz = m.tuning.sim.tickHz;
  const keen = m.tuning.brain.roles[m.post.role].flank;
  // A man holding the target's door with the alarm up doesn't go after anyone: he's what stands between them and the target (protect.ts).
  if (ff.lost || ff.bounds >= P.bounds || keen <= 0 || m.tick < ff.pinned || someoneMoving(m) || onTheDoor(m)) return false;
  const dx = ff.x - m.self.x;
  const dz = ff.z - m.self.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > P.reach) return false;
  // Counted from when he last had the man in his own sights, or came into the fight: while someone else has him fixed,
  // a man with no view of his own doesn't sit behind a wall. He works round for one.
  if ((m.tick - Math.max(ff.seen, ff.since)) / hz < P.after + (1 - keen) * P.reluctant + d / P.perSecond) return false;
  const lx = m.self.x - m.post.x;
  const lz = m.self.z - m.post.z;
  return lx * lx + lz * lz <= P.leash * P.leash;
}

/**
 * The opening the intruder has just gone out of the camp's walls by, as this man knows it,
 * and the tick he knew. Either he watched him go, or someone who did has just said so.
 *
 * Watching him go takes having seen him inside the walls: a man at the gate on his way in
 * was outside them when he was last seen too, and he hasn't gone anywhere. Then it's where
 * he had him last, a moment ago: outside, near an opening, or inside and going out through
 * one (a second more of the way he was going is through it, and not into a wall beside it).
 *
 * Null if he hasn't gone out, or not by a way this man could follow him at once: someone
 * seen far out in the open is no business of the chase's.
 */
function wentOut(m: GuardMind, ff: Firefight): { gate: Opening; at: number } | null {
  const C = m.tuning.brain.firefight.chase;
  const hz = m.tuning.sim.tickHz;
  const near = (g: Opening | null, x: number, z: number): Opening | null => (g && (g.x - x) * (g.x - x) + (g.z - z) * (g.z - z) <= C.near * C.near ? g : null);
  if (ff.inside >= 0 && ff.seen >= 0 && (m.tick - ff.seen) / hz <= C.fresh) {
    const gate = outsideWalls(m.world, ff.sx, ff.sz) ? near(openingNear(m.world, ff.sx, ff.sz), ff.sx, ff.sz) : openingThrough(m.world, ff.sx, ff.sz, ff.sx + ff.vx, ff.sz + ff.vz, C.jamb);
    if (gate) return { gate, at: ff.seen };
  }
  if (ff.heardOut >= 0 && ff.heardOut > ff.seen && (m.tick - ff.heardOut) / hz <= C.fresh) {
    const gate = near(openingNear(m.world, ff.outX, ff.outZ), ff.outX, ff.outZ);
    if (gate) return { gate, at: ff.heardOut };
  }
  return null;
}

/**
 * Whether enough men are out after him already: a camp sends a few, and the rest hold. A man
 * who has said he's going gives it up only to those who said so before him (or at the same
 * moment, with the lower id, as two who say anything at once settle it): the first to go are
 * the ones who go.
 */
function chaseFull(m: GuardMind): boolean {
  const ff = m.brain!.ff!;
  const mine = ff.out.indexOf(m.id);
  const said = mine < 0 ? Infinity : ff.outAt[mine]!;
  let ahead = 0;
  for (let k = 0; k < ff.out.length; k++) {
    const id = ff.out[k]!;
    if (id === m.id) continue;
    const at = ff.outAt[k]!;
    if (at < said || (at === said && id < m.id)) ahead++;
  }
  return ahead >= m.tuning.brain.firefight.chase.men;
}

/**
 * The opening he'd go out by, if the chase is his: his camp chases, he watched the intruder
 * leave its walls, too few have gone already, and he's the nearest who hasn't said so (the
 * nearer and the keener, the sooner his turn). Null otherwise. A man who holds the target's
 * door never goes, alarm or none: he's what stands between them and the target.
 */
function dueToChase(m: GuardMind): Opening | null {
  const b = m.brain!;
  const ff = b.ff!;
  const C = m.tuning.brain.firefight.chase;
  const keen = m.tuning.brain.roles[m.post.role].flank;
  if (!m.chases || ff.lost || ff.gate !== null || keen <= 0 || m.tick < ff.pinned || m.post.holdsDoor === true) return null;
  // One chase a man, in one fight: once he's been out, he fights from where that got him, by the ordinary rules, and doesn't run out again each time he loses sight of him behind his own cover.
  if (ff.out.includes(m.id) || chaseFull(m)) return null;
  const went = wentOut(m, ff);
  if (!went) return null;
  const g = went.gate;
  const dx = g.x - m.self.x;
  const dz = g.z - m.self.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > C.reach) return null;
  if ((m.tick - went.at) / m.tuning.sim.tickHz < C.after + (1 - keen) * C.reluctant + d / C.perSecond) return null;
  return g;
}

/**
 * Where a man keeps to once someone has gone out of the walls after the intruder. Whoever
 * went keeps to the camp's own ground: he steps out, looks and shoots, and doesn't run off
 * into the valley, which is a section's business (hunt.ts). Everyone else keeps inside the
 * walls, because the target is what they're there for. Nothing, before anyone has gone, or
 * for a man who was outside already: his beat is out there.
 */
function keepsTo(m: GuardMind, ff: Firefight): 'walls' | 'ground' | undefined {
  if (!m.chases || ff.out.length === 0) return undefined;
  if (ff.out.includes(m.id)) return 'ground';
  return outsideWalls(m.world, m.self.x, m.self.z) ? undefined : 'walls';
}

/** Where a man who chases goes: a step out of the opening, on a knee, with the ground beyond it in front of him. */
function chaseSpot(m: GuardMind, g: Opening): Position {
  const C = m.tuning.brain.firefight.chase;
  const x = g.x + g.nx * C.step;
  const z = g.z + g.nz * C.step;
  return { hx: x, hz: z, hs: 'crouch', fx: x, fz: z, fs: 'crouch', line: true, tx: x, tz: z, tick: m.tick, careful: false };
}

/** True for a man posted on the target's door, once the siren has sounded: from then on the door is his whole job. */
function onTheDoor(m: GuardMind): boolean {
  return m.post.holdsDoor === true && m.brain!.sirenAt >= 0;
}

/** Whether someone has the intruder in his sights now: this man himself, or someone he's heard say so in the last few seconds. Then the intruder has other things to look at, and ground in his view can be crossed farther. */
function fixed(m: GuardMind): boolean {
  const b = m.brain!;
  const ff = b.ff!;
  const D = m.tuning.brain.firefight.danger;
  const hz = m.tuning.sim.tickHz;
  if (ff.seen >= 0 && (m.tick - ff.seen) / hz <= D.fixedFor) return true;
  for (const t of b.told) if (t.kind === 'contact' && t.from !== m.id && (m.tick - t.heard) / hz <= D.fixedFor) return true;
  return false;
}

/** How far he'll cross ground in the intruder's view at a stretch, now. */
function dashOf(m: GuardMind): number {
  const D = m.tuning.brain.firefight.danger;
  return fixed(m) ? D.fixedDash : D.dash;
}

/** Whether he's the one going after him: he has a covered bound in hand (performFight finds it when it's his turn), or he's on his way, and nobody with a better claim has said they're going. */
function wantsPush(m: GuardMind): boolean {
  const b = m.brain!;
  const ff = b.ff!;
  if (ff.lost) return false;
  // Chasing: a few go at once, where one man follows.
  if (ff.gate ? chaseFull(m) : someoneMoving(m)) return false;
  return (b.act === 'push' && !b.done) || ff.bound !== null;
}

/**
 * What a man in a firefight is offered, ahead of the old answers to the same trouble:
 * fighting from a position, or going after him. Returns false if he isn't in one.
 */
export function offerFirefight(m: GuardMind, out: Array<Option<ActName>>, rank: number): boolean {
  if (!inFirefight(m)) return false;
  out.push({ act: wantsPush(m) ? 'push' : 'fight', rank, weight: 1 });
  return true;
}

/** What he says about where the intruder is: a contact, as sure as he is of it. */
function contact(m: GuardMind): Report {
  const b = m.brain!;
  const ff = b.ff!;
  const C = m.tuning.brain.comms;
  return { kind: 'contact', x: ff.x, y: ff.y, z: ff.z, radius: Math.max(ff.r, C.radius.contact), tick: ff.news, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: b.cause, sure: true };
}

/** "Moving": said aloud, about the place he's going to look at. */
function sayMoving(m: GuardMind): void {
  const b = m.brain!;
  const ff = b.ff!;
  const C = m.tuning.brain.comms;
  // Going out of the walls, he says where: outside the opening. Whoever hears it knows one more has gone.
  const g = ff.gate;
  const step = m.tuning.brain.firefight.chase.step;
  const x = g ? g.x + g.nx * step : ff.x;
  const z = g ? g.z + g.nz * step : ff.z;
  if (g && !ff.out.includes(m.id)) {
    ff.out.push(m.id);
    ff.outAt.push(m.tick);
  }
  const report: Report = { kind: 'moving', x, y: ff.y, z, radius: C.radius.moving, tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: b.cause };
  if (g) report.out = true;
  b.say = { report, radius: C.shoutRadius, radio: false };
  // And on the net, a word as he goes: a shout doesn't carry across a camp, and the men at the far end of it are counting who has gone out.
  if (g) b.radio = { ...report };
}

/** Starting to fight or to follow: where the act points, and what he says as he starts. */
export function beginFirefight(m: GuardMind, act: 'fight' | 'push'): void {
  const b = m.brain!;
  const ff = b.ff;
  if (!ff) return;
  const F = m.tuning.brain.firefight;
  b.x = ff.x;
  b.z = ff.z;
  ff.calling = -1;
  if (act === 'push') {
    // A bound at a time: the first is the one he found a covered way to, to where he can see the place he lost him. He says he's going.
    ff.spot = ff.bound;
    ff.bound = null;
    ff.there = false;
    ff.up = false;
    ff.clear = -1;
    if (ff.spot) sayMoving(m);
    return;
  }
  ff.bound = null;
  ff.gate = null;
  const s = ff.spot;
  ff.there = s !== null && (s.hx - m.self.x) * (s.hx - m.self.x) + (s.hz - m.self.z) * (s.hz - m.self.z) <= F.near * F.near;
  ff.up = false;
  ff.until = m.tick;
}

/** How much nearer a bound has to bring him: from a distance, a real step forward; close in, nothing, because it's the angle he's after. */
function gainOf(m: GuardMind): number {
  const ff = m.brain!.ff!;
  const P = m.tuning.brain.firefight.push;
  const dx = ff.x - m.self.x;
  const dz = ff.z - m.self.z;
  return dx * dx + dz * dz > P.closeIn * P.closeIn ? P.gain : 0;
}

/** True if this tick still has a look around to spend (rule 18): they wait their turn with the tick's route searches, and stop once the tick's looks have cast their share of rays. */
function mayLook(m: GuardMind): boolean {
  if (m.nav.searches.left <= 0 || (m.nav.work?.rays ?? 0) - m.nav.raysAtStart >= m.tuning.brain.fight.drill.raysPerTick) return false;
  m.nav.searches.left--;
  return true;
}

/** Writes the order: where to go and how, the place to face, and how low to be. */
export function steer(m: GuardMind, out: Order, wishX: number, wishZ: number, gait: Gait, lookX: number, lookZ: number, stance: Stance): void {
  const A = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  const dx = lookX - m.self.x;
  const dz = lookZ - m.self.z;
  const toward = dx * dx + dz * dz > 1e-6 ? yawFromDirection(dx, dz) : m.self.yaw;
  out.kind = 'move';
  out.tick = m.tick;
  out.wishX = wishX;
  out.wishZ = wishZ;
  out.gait = gait;
  out.yaw = turnTowards(m.self.yaw, toward, A.turnRate * dt);
  out.pitch = 0;
  out.headYaw = turnTowards(m.head, 0, A.headRate * dt);
  if (stance === 'stand') delete out.stance;
  else out.stance = stance;
}

/** Keeps him on a spot, in a stance, facing a place, with a step back onto it if he's off it. True once he's on it, in the stance, and facing. */
export function stayAt(m: GuardMind, out: Order, x: number, z: number, stance: Stance, lookX: number, lookZ: number): boolean {
  const F = m.tuning.brain.firefight;
  const dx = x - m.self.x;
  const dz = z - m.self.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > F.near) {
    // A short step, kept low: he doesn't stand up to cross a metre of open ground.
    const speed = Math.min(F.paces.shift, d * 6);
    steer(m, out, (dx / d) * speed, (dz / d) * speed, stance === 'stand' ? 'walk' : 'crouch', lookX, lookZ, stance === 'stand' ? 'stand' : 'crouch');
    return false;
  }
  steer(m, out, 0, 0, 'idle', lookX, lookZ, stance);
  const lx = lookX - m.self.x;
  const lz = lookZ - m.self.z;
  const facing = lx * lx + lz * lz < 1e-6 || Math.abs(wrapAngle(yawFromDirection(lx, lz) - m.self.yaw)) < 0.3;
  return m.self.stance === stance && facing;
}

/** Whether he can be seen from the intruder's place, looked at every few ticks: it's what makes him run. */
function exposure(m: GuardMind): boolean {
  const ff = m.brain!.ff!;
  if ((m.tick + m.id) % 3 === 0) ff.exposed = exposedAt(m.world, m.tuning, m.self.x, m.self.z, m.self.stance, ff.x, ff.z, m.nav.work, ff.y, m.self.y);
  return ff.exposed;
}

/** A position where he stands, when there's nothing better in reach: flat on the ground, up on a knee to fire. */
function whereHeIs(m: GuardMind, ff: Firefight, hs: Stance, fs: Stance): Position {
  return { hx: m.self.x, hz: m.self.z, hs, fx: m.self.x, fz: m.self.z, fs, line: true, tx: ff.x, tz: ff.z, tick: m.tick, careful: false };
}

/**
 * His position against where the intruder is believed to be now: the first, a new one when
 * the old one no longer hides him, and a better one when he's been long enough somewhere
 * with no view. Null only while this tick has no look left to spend.
 */
function position(m: GuardMind, ff: Firefight, seen: boolean): Position | null {
  const F = m.tuning.brain.firefight;
  const S = F.spot;
  const hz = m.tuning.sim.tickHz;
  // Seen, shot at or in the open: the nearest thing that hides him, and a view from it if one's close. Out of sight already,
  // he has time to be useful: he'll go farther, for somewhere he can see the place from, and the more so the more it's his job.
  const urgent = seen || m.tick < ff.pinned || ff.exposed;
  // A man holding the target's door fights from beside it: a few metres of path, whatever the view from farther off.
  const door = onTheDoor(m);
  const near = door ? S.doorRun : S.maxRun;
  const far = door ? S.doorRun : S.maxRun * (1 + m.tuning.brain.roles[m.post.role].flank);
  const here = { x: m.self.x, z: m.self.z, tx: ff.x, tz: ff.z, ty: ff.y, gain: 0 };
  let s = ff.spot;
  if (s) {
    const moved = (s.tx - ff.x) * (s.tx - ff.x) + (s.tz - ff.z) * (s.tz - ff.z) > S.keep * S.keep;
    // The place has moved: does this still hide him, and can he still see it from here? He doesn't break off a string of rounds to ask.
    if (moved && !(seen && ff.up)) {
      if (!mayLook(m)) return s;
      s.tx = ff.x;
      s.tz = ff.z;
      if (exposedAt(m.world, m.tuning, s.hx, s.hz, s.hs, ff.x, ff.z, m.nav.work, ff.y)) {
        s = ff.spot = null;
        ff.there = false;
        ff.up = false;
      } else s.line = lineFrom(m.world, m.tuning, s.fx, s.fz, s.fs, ff.x, ff.z, m.nav.work, ff.y);
    }
  }
  if (s) {
    // Somewhere with no view for long enough: once or twice he'll move for a better one, a short way.
    if (ff.there && !s.line && !seen && ff.improved < F.improve.times && (m.tick - s.tick) / hz >= F.improve.after && m.tick >= ff.pinned && mayLook(m)) {
      ff.improved++;
      s.tick = m.tick;
      const better = fightingSpot(m.world, m.tuning, { ...here, maxRun: door ? far : Math.max(F.improve.run, far), needLine: true, dash: dashOf(m), within: keepsTo(m, ff) }, m.nav.work);
      if (better) {
        s = ff.spot = { ...better, tx: ff.x, tz: ff.z, tick: m.tick, careful: true };
        ff.there = false;
        ff.up = false;
      }
    }
    return s;
  }
  if (!mayLook(m)) return null;
  ff.exposed = exposedAt(m.world, m.tuning, m.self.x, m.self.z, m.self.stance, ff.x, ff.z, m.nav.work, ff.y, m.self.y);
  const hurry = urgent || ff.exposed;
  const found = fightingSpot(m.world, m.tuning, { ...here, maxRun: hurry ? near : far, needLine: !hurry, dash: hurry ? 0 : dashOf(m), within: keepsTo(m, ff) }, m.nav.work);
  if (found) ff.spot = { ...found, tx: ff.x, tz: ff.z, tick: m.tick, careful: !hurry };
  // Nothing in reach. In the open, he gets flat and fires from a knee. Out of sight, he stays where he is, low, with no view.
  else if (hurry) ff.spot = whereHeIs(m, ff, 'prone', 'crouch');
  else ff.spot = { ...whereHeIs(m, ff, 'crouch', 'crouch'), line: false };
  ff.there = false;
  ff.up = false;
  return ff.spot;
}

/**
 * Whether he fires back at the place without a man in his sights: he saw the flash there, or
 * the man himself, a moment ago, so he knows it to a few metres, and nobody's said they're
 * moving on it. It's what makes a shot from somewhere cost something: rounds come back at
 * where it was fired from, for as long as that's news. A place he was only told of, or took
 * by ear, isn't sure enough to shoot at.
 */
function answers(m: GuardMind, ff: Firefight): boolean {
  const A = m.tuning.brain.firefight.answer;
  return ff.own && ff.r <= A.sure && (m.tick - ff.news) / m.tuning.sim.tickHz <= A.fresh && !someoneMoving(m);
}

/** Down behind it again, for a moment drawn from his own stream. */
function getDown(m: GuardMind, ff: Firefight): void {
  const D = m.tuning.brain.firefight.down;
  ff.up = false;
  ff.rounds = 0;
  m.brain!.fireAt = -1;
  ff.until = m.tick + Math.round((D.min + (D.max - D.min) * m.draw()) * m.tuning.sim.tickHz);
}

/**
 * Fighting from a position: to it by the quickest way, down behind it, up to look at where
 * the intruder is believed to be, a few rounds if he's there, and down again.
 */
export function performFight(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const ff = b.ff;
  const self = m.self;
  if (!ff) {
    b.done = true;
    steer(m, out, 0, 0, 'idle', self.x, self.z, 'crouch');
    return;
  }
  const T = m.tuning;
  const F = T.brain.firefight;
  const C = T.brain.comms;
  const hz = T.sim.tickHz;
  const sight = sightOf(m);
  const seen = sight !== null;
  b.x = ff.x;
  b.z = ff.z;
  // In sight: he says where, for whoever's in earshot, now and every so often.
  if (seen && (ff.shouted < 0 || (m.tick - ff.shouted) / hz >= F.contactEvery)) {
    ff.shouted = m.tick;
    b.say = { report: contact(m), radius: C.shoutRadius, radio: false };
  }
  // Rounds landing on him: down, whatever he was doing.
  const pinned = m.tick < ff.pinned;
  if (ff.up && pinned) getDown(m, ff);
  // He went out of the walls, and it's this man's turn: after him, to the opening (the chase). The next think takes it up.
  if (!seen && !pinned && ff.bound === null) {
    const g = dueToChase(m);
    if (g) {
      ff.gate = g;
      ff.bound = chaseSpot(m, g);
      b.thinkAt = m.tick;
      steer(m, out, 0, 0, 'idle', g.x, g.z, self.stance);
      return;
    }
  }
  let s = position(m, ff, seen);
  if (!s) {
    steer(m, out, 0, 0, 'idle', ff.x, ff.z, 'crouch');
    return;
  }
  if (!ff.there) {
    const dx = s.hx - self.x;
    const dz = s.hz - self.z;
    // He's in front of him and cover is a run away: down where he stands, and fire first.
    if (seen && !pinned && dx * dx + dz * dz > F.spot.snapRun * F.spot.snapRun) {
      s = ff.spot = whereHeIs(m, ff, 'crouch', 'crouch');
      ff.there = true;
      ff.up = true;
      ff.rounds = 0;
      ff.until = m.tick;
    } else {
      const open = exposure(m);
      const w = walk(m, out, s.hx, s.hz, open ? F.paces.bound : F.paces.careful, open ? 'sprint' : 'walk', ff.x, ff.z, undefined, s.careful ? dangerOf(m.world, T, ff.x, ff.z, ff.y).cost : undefined);
      if (w === 'walking') return;
      // Stuck short of it: someone or something is on it, and he makes do with where he's got to.
      if (w === 'stuck') {
        if (s.fx === s.hx && s.fz === s.hz) {
          s.fx = self.x;
          s.fz = self.z;
        }
        s.hx = self.x;
        s.hz = self.z;
      }
      ff.there = true;
      ff.up = false;
      ff.until = m.tick;
    }
  }
  if (!ff.up) {
    stayAt(m, out, s.hx, s.hz, s.hs, ff.x, ff.z);
    // Down, and what he's down behind doesn't hide him from where the intruder is now: somewhere better, or flat.
    if ((m.tick + m.id) % 6 === 0 && !pinned && !seen && s.hs !== 'prone' && self.stance === s.hs && exposedAt(m.world, T, self.x, self.z, s.hs, ff.x, ff.z, m.nav.work, ff.y, self.y)) {
      ff.spot = null;
      ff.there = false;
      return;
    }
    // From behind cover, with a moment to spare: the camp hears where he is, from the man who saw.
    if (ff.calling >= 0) {
      if (seen || pinned) ff.calling = -1;
      else if (m.tick >= ff.calling) {
        ff.calling = -1;
        b.radio = contact(m);
        b.ended.report = m.tick;
      }
      return;
    }
    const called = b.ended.report;
    if (ff.own && !seen && !pinned && T.brain.roles[m.post.role].report > 0 && (m.tick - ff.news) / hz >= F.call && (called === undefined || (m.tick - called) / hz >= C.reportEvery)) {
      ff.calling = m.tick + Math.round(C.talk * hz);
      b.say = { report: contact(m), radius: C.talkRadius, radio: true };
      return;
    }
    // His turn to go after him: is there a way nearer that keeps out of the intruder's view? If there is, he's going (the
    // next think takes it up); if not, he doesn't run at a man who's waiting for him, and it's the camp's to hunt.
    if (!seen && ff.bound === null && dueToGo(m) && mayLook(m)) {
      const P = F.push;
      const found = fightingSpot(m.world, T, { x: self.x, z: self.z, tx: ff.x, tz: ff.z, ty: ff.y, maxRun: P.maxRun, needLine: true, gain: gainOf(m), dash: dashOf(m), within: keepsTo(m, ff) }, m.nav.work);
      if (found) {
        ff.bound = { ...found, tx: ff.x, tz: ff.z, tick: m.tick, careful: true };
        b.thinkAt = m.tick;
      } else ff.lost = true;
    }
    if (!pinned && m.tick >= ff.until && (s.line || seen)) {
      ff.up = true;
      ff.rounds = 0;
      b.fireAt = -1;
      const L = F.look;
      ff.until = m.tick + Math.round((L.min + (L.max - L.min) * m.draw()) * hz);
    }
    return;
  }
  // Up, at the firing place: at the man if he's in sight, and otherwise back at the flash, while it's fresh.
  const ready = stayAt(m, out, s.fx, s.fz, s.fs, ff.x, ff.z);
  const at = sight ?? (answers(m, ff) && s.line ? ff : null);
  if (at) {
    const dx = at.x - self.x;
    const dz = at.z - self.z;
    const range = Math.max(F.range, T.brain.combat.range[m.post.role]);
    if (dx * dx + dz * dz <= range * range) {
      if (b.fireAt < 0) b.fireAt = m.tick + Math.round(F.react * hz);
      if (ready && m.tick >= b.fireAt) {
        b.fire = { x: at.x, y: at.y, z: at.z };
        b.fireAt = m.tick + Math.round(F.every * hz);
        ff.rounds++;
        if (ff.rounds >= F.burst) getDown(m, ff);
      }
      return;
    }
  }
  b.fireAt = -1;
  // Nothing to shoot at: down again when he's looked long enough, unless someone's moving and it's his to watch.
  if (m.tick >= ff.until && !someoneMoving(m)) getDown(m, ff);
}

/**
 * Following: a bound to where he can see the place he's going to look at, a look, and if
 * there's nobody there, on along the way the intruder was heading. A sight of him ends it:
 * the fight is on again, from wherever he's got to.
 */
export function performPush(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const ff = b.ff;
  const self = m.self;
  if (!ff) {
    b.done = true;
    steer(m, out, 0, 0, 'idle', self.x, self.z, 'crouch');
    return;
  }
  const T = m.tuning;
  const F = T.brain.firefight;
  const P = F.push;
  const hz = T.sim.tickHz;
  b.x = ff.x;
  b.z = ff.z;
  if (sightOf(m)) {
    b.done = true;
    steer(m, out, 0, 0, 'idle', ff.x, ff.z, 'crouch');
    return;
  }
  if (ff.gate) {
    performChase(m, out, ff, ff.gate);
    return;
  }
  let s = ff.spot;
  if (!s) {
    if (!mayLook(m)) {
      steer(m, out, 0, 0, 'idle', ff.x, ff.z, 'crouch');
      return;
    }
    const found = fightingSpot(m.world, T, { x: self.x, z: self.z, tx: ff.x, tz: ff.z, ty: ff.y, maxRun: P.maxRun, needLine: true, gain: gainOf(m), dash: dashOf(m), within: keepsTo(m, ff) }, m.nav.work);
    if (!found) {
      // No way nearer that keeps out of his view: he doesn't run at a man who's waiting for him. It's the camp's to hunt.
      ff.lost = true;
      b.done = true;
      steer(m, out, 0, 0, 'idle', ff.x, ff.z, 'crouch');
      return;
    }
    s = ff.spot = { ...found, tx: ff.x, tz: ff.z, tick: m.tick, careful: true };
    ff.there = false;
    ff.up = false;
    ff.clear = -1;
    b.routed = -1;
    // Still going: whoever's watching keeps watching, and nobody else sets off.
    sayMoving(m);
  }
  if (!ff.there) {
    const open = exposure(m);
    const w = walk(m, out, s.hx, s.hz, open ? F.paces.bound : F.paces.careful, open ? 'sprint' : 'walk', ff.x, ff.z, undefined, dangerOf(m.world, T, ff.x, ff.z, ff.y).cost);
    if (w === 'walking') return;
    if (w === 'stuck') {
      s.hx = s.fx = self.x;
      s.hz = s.fz = self.z;
    }
    ff.there = true;
    ff.up = false;
    ff.until = m.tick + Math.round(P.pause * hz);
  }
  if (!ff.up) {
    stayAt(m, out, s.hx, s.hz, s.hs, ff.x, ff.z);
    if (m.tick >= ff.until && m.tick >= ff.pinned) ff.up = true;
    return;
  }
  if (m.tick < ff.pinned) {
    ff.up = false;
    ff.until = ff.pinned;
    ff.clear = -1;
    stayAt(m, out, s.hx, s.hz, s.hs, ff.x, ff.z);
    return;
  }
  // Up, with eyes on the place.
  if (!stayAt(m, out, s.fx, s.fz, s.fs, ff.x, ff.z)) return;
  if (ff.clear < 0) ff.clear = m.tick;
  if ((m.tick - ff.clear) / hz < P.clear) return;
  // Nobody there. On, the way he was going; or, if nobody saw which way, past it.
  ff.bounds++;
  ff.news = m.tick;
  const speed = Math.sqrt(ff.vx * ff.vx + ff.vz * ff.vz);
  let ux = ff.vx / (speed || 1);
  let uz = ff.vz / (speed || 1);
  if (speed < 0.4) {
    const dx = ff.x - self.x;
    const dz = ff.z - self.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    ux = dx / d;
    uz = dz / d;
  }
  const lx = self.x - m.post.x;
  const lz = self.z - m.post.z;
  if (ff.bounds >= P.bounds || lx * lx + lz * lz > P.leash * P.leash) {
    // That's as far as he follows. The camp hears the place is empty, and the hunt is its business.
    ff.lost = true;
    b.radio = { kind: 'clear', x: ff.x, y: self.y, z: ff.z, radius: T.brain.comms.clearRadius, tick: m.tick, from: m.id, fromX: self.x, fromZ: self.z, cause: b.cause };
    b.done = true;
    return;
  }
  ff.x += ux * P.lead;
  ff.z += uz * P.lead;
  ff.y = m.world.terrain.heightAt(ff.x, ff.z) + F.spot.eye;
  ff.r += P.lead / 2;
  ff.own = false;
  ff.spot = null;
  ff.there = false;
  ff.up = false;
  ff.clear = -1;
}

/**
 * The chase: at a run to a step outside the opening, by the quickest way, then a look each
 * way along the wall and out across the ground. A sight of him ends it (performPush): the
 * fight is on again, from where he's got to. With nobody to see, he gives it up and the
 * place is the camp's to hunt.
 */
function performChase(m: GuardMind, out: Order, ff: Firefight, g: Opening): void {
  const b = m.brain!;
  const self = m.self;
  const T = m.tuning;
  const F = T.brain.firefight;
  const C = F.chase;
  const hz = T.sim.tickHz;
  const px = g.x + g.nx * C.step;
  const pz = g.z + g.nz * C.step;
  if (!ff.there) {
    const w = walk(m, out, px, pz, F.paces.bound, 'sprint', px + g.nx * C.along, pz + g.nz * C.along);
    if (w === 'walking') return;
    ff.there = true;
    ff.sweep = 0;
    ff.swept = -1;
  }
  // Where he's got to is where he looks from: on the spot, or short of it if something stopped him.
  const near = (px - self.x) * (px - self.x) + (pz - self.z) * (pz - self.z) <= 4;
  const hx = near ? px : self.x;
  const hz2 = near ? pz : self.z;
  // Rounds landing on him: flat, and the look begins again when they stop.
  if (m.tick < ff.pinned) {
    stayAt(m, out, hx, hz2, 'prone', hx + g.nx * C.along, hz2 + g.nz * C.along);
    ff.swept = -1;
    return;
  }
  // Along the wall is across the way out. Which way first is his own habit.
  const side = m.id % 2 === 0 ? 1 : -1;
  const ax = -g.nz * side;
  const az = g.nx * side;
  const lx = ff.sweep === 0 ? hx + ax * C.along : ff.sweep === 1 ? hx - ax * C.along : hx + g.nx * C.along;
  const lz = ff.sweep === 0 ? hz2 + az * C.along : ff.sweep === 1 ? hz2 - az * C.along : hz2 + g.nz * C.along;
  if (!stayAt(m, out, hx, hz2, 'crouch', lx, lz)) return;
  if (ff.swept < 0) ff.swept = m.tick;
  if ((m.tick - ff.swept) / hz < (ff.sweep < 2 ? C.look : C.hold)) return;
  if (ff.sweep < 2) {
    ff.sweep++;
    ff.swept = -1;
    return;
  }
  // Nobody. That's as far as he goes: the camp hears the place is empty, and he goes back in.
  ff.lost = true;
  ff.gate = null;
  b.radio = { kind: 'clear', x: hx, y: self.y, z: hz2, radius: T.brain.comms.clearRadius, tick: m.tick, from: m.id, fromX: self.x, fromZ: self.z, cause: b.cause };
  b.done = true;
}

/** What the debug view says of a man in a firefight: which phase he's in. */
export function firefightPhase(m: { act: ActName; ff?: Firefight }, tick: number): string | null {
  const ff = m.ff;
  if (!ff || (m.act !== 'fight' && m.act !== 'push')) return null;
  // The chase: out of the walls after him, and what he's doing about it.
  if (ff.gate && m.act === 'push') return tick < ff.pinned ? 'pinned' : !ff.there ? 'chasing' : ff.sweep < 2 ? 'looking along the wall' : 'watching the ground';
  if (!ff.spot) return 'choosing';
  if (!ff.there) return m.act === 'push' ? 'bounding' : 'to cover';
  if (tick < ff.pinned) return 'pinned';
  if (ff.calling >= 0) return 'on the radio';
  return ff.up ? (m.act === 'push' ? 'looking' : ff.rounds > 0 ? 'firing' : 'up') : 'down';
}
