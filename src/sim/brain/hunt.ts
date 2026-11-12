import type { Stance } from '../body';
import { approachOf, emptyWay } from './approach';
import type { ActName } from './brain';
import type { HuntOrder } from './camp';
import { stayAt, steer } from './firefight';
import type { GuardMind } from './mind';
import { walk } from './moves';
import { navigatorOf } from './nav';
import type { Order } from './orders';
import { exposedAt, lineFrom } from './positions';
import type { Report } from './reports';
import type { Option } from './utility';

/**
 * The hunt (Lab F, step 2b; docs/camp-engine.md, section 9): a section that goes out after
 * someone the camp has placed, and how each of its men does his part.
 *
 * A camp that fights from where it is (firefight.ts) can be shot at from past its men's
 * reach for as long as the shooter likes: a ridge, or the field beyond the wire. Nobody
 * crosses open ground alone to stop him, and nobody should. What goes is a section, by the
 * way that keeps most out of his view (approach.ts):
 *
 *   out      To where it gathers, and on. Out of his view they run on together: one says
 *            he's moving and how far, and the rest go with him. Where the way crosses
 *            ground he can see they go by bounds, in turn: a man dashes to the next stop,
 *            gets down, and says "Set!"; the other half goes when it hears him, one stop
 *            past where he is.
 *   watch    No way reaches a firing point unseen: the last of it is the ground the firing
 *            point looks down on. So they stop short of that, at the last cover within
 *            rifle range, and watch the place: up to look, down again. A shot from there
 *            now, or a man getting up to leave, is under two rifles.
 *   close    Nothing seen: the leader's half goes on to the place by short dashes, saying so,
 *            and the half behind covers it, with fire on the place while a man is up.
 *
 * Fix him with fire, finish him with men. Before a section steps out onto ground he can see,
 * its man says so on the net, and the camp's marksmen put rounds on the place for as long
 * as the crossing should take (brain.ts, covering). He can still shoot a man in the open,
 * with rounds landing round him as he does it.
 *   sweep    On the place: he walks a box round it, looking in, and then round each listed
 *            firing point close beside it. A man lying up a few metres off the believed
 *            spot is still found.
 *   hold     Nobody there: he says so, on the net and aloud, and they wait for orders.
 *   home     None come, or the orders have run out: back to their posts.
 *
 * A section is a drill, not a puppet. The order names its men, where they gather, the place
 * and where the shooter may be watching from; each man works the way out for himself from
 * that and the ground he knows, so they all have the same one. What one of them is doing
 * reaches the others only by his saying it: a mind doesn't know where its own side is (rule
 * 13). So a man who hears nothing goes on anyway after a wait, and one who has gone
 * unheard three bounds running turns for home: a man alone doesn't hunt. One whose section
 * never comes to the rally says who's missing, on the net, and waits there for the camp to
 * send someone else. One who sees a body out there gets flat, calls it in, and gives the
 * rest one more chance to answer him.
 *
 * Seeing the intruder, or his flash, ends the drill for whoever sees it: that's a firefight
 * (firefight.ts), which outranks this, and the hunt is taken up again when it's over.
 */

/** What a man remembers of the hunt he's on: absent until he's ordered out, and gone when he's home. */
export interface Hunt {
  /** The order it's carrying out, and the place that order named when he last worked the way out. */
  task: number;
  ox: number;
  oz: number;
  phase: 'out' | 'watch' | 'close' | 'sweep' | 'hold' | 'home';
  /** The way out as bounds (approach.ts): the stops' x, z, flattened, the first where the section gathers; and whether the bound to each crosses ground in view. */
  stops: number[];
  lit: number[];
  /** The stop they watch the place from: the last one short of it. */
  post: number;
  /** The stop he's on, or making for, and the one he left for it. */
  at: number;
  from: number;
  /** The farthest stop he's heard the other half say it's down on (−1 for none); the tick he last heard the other half say it's moving (−1 for never), the stop it named, and how far that is from the place; and the tick he last heard anyone call this place clear. Taken from what he's told as it comes, since a busy net pushes it out of mind. */
  theirs: number;
  theirMove: number;
  theirMoveTo: number;
  theirReach: number;
  heardClear: number;
  /** The tick up to which he's taken in what he's been told. */
  mark: number;
  /** On his way to it, since `left`. Otherwise he's down on it, since `since`, and has said so or not, and when he last did. */
  going: boolean;
  left: number;
  since: number;
  said: boolean;
  saidAt: number;
  /** How low he is at the stop he's on when he's down, and how he comes up to look. */
  stance: Stance;
  up: Stance;
  /** Watching: up to look until this tick, or down until it; and whether he has a line to the place from here when he's up. */
  looking: boolean;
  until: number;
  line: boolean;
  /** Bounds he's made running without hearing the other half. */
  unheard: number;
  /** Head down until this tick: rounds are striking close. */
  pinned: number;
  /** Looking it over: the points he walks round (x, z, flattened: the place, then the listed firing points close beside it), the one he's on, the corner of its box he's making for (the last is its middle), and whether he's got to any corner of this one. */
  sweep: number[];
  swept: number;
  corner: number;
  walked: boolean;
  /** The tick he started on the point he's looking over; the way across to it from the last one, as stops, and the next of them (past the end once he's across); and how near the place the nearest point he couldn't get round is, metres. */
  began: number;
  hop: number[];
  hopAt: number;
  missed: number;
  /** Holding because the place is clear (true), or at the rally because the rest of his section never came. */
  cleared: boolean;
  /** The newest body he's taken note of out here: its percept's tick, or −1. */
  body: number;
  /** The tick of the last shot he heard fired, or flash he saw, or −1: he doesn't cross ground in view while the rifle is still speaking. */
  shotAt: number;
}

const way = emptyWay();
const watch: Array<{ x: number; z: number }> = [];
const spot = { x: 0, z: 0 };

/** The order he's hunting on, if he has one and is a man who goes: not on a tower, and a rifle's role. */
function orderOf(m: GuardMind): HuntOrder | null {
  const task = m.brain!.task;
  if (!task || task.kind !== 'hunt' || !task.hunt) return null;
  if (m.post.elevated || m.tuning.brain.roles[m.post.role].fight <= 0) return null;
  return task.hunt;
}

/** What a man with a section's order is offered: the hunt. Returns false if he has none. */
export function offerHunt(m: GuardMind, out: Array<Option<ActName>>, rank: number): boolean {
  if (!orderOf(m)) return false;
  out.push({ act: 'hunt', rank, weight: 1 });
  return true;
}

/**
 * Works the way out, from where the section gathers to the place, against everywhere the
 * order says the shooter may be watching from; and which stop to watch the place from.
 * Every man of the section gets the same from the same order. False if there's no way.
 */
function findWay(m: GuardMind, h: Hunt): boolean {
  const task = m.brain!.task!;
  const o = task.hunt!;
  const W = m.tuning.brain.hunt.watch;
  watch.length = 0;
  for (let k = 0; k + 1 < o.watch.length; k += 2) watch.push({ x: o.watch[k]!, z: o.watch[k + 1]! });
  if (!approachOf(m.world, m.tuning).aim(watch).way(o.rx, o.rz, task.x, task.z, way)) return false;
  h.task = task.id;
  h.ox = task.x;
  h.oz = task.z;
  h.stops = way.stops.slice();
  h.lit = way.lit.slice();
  // Where they watch from: the stop nearest the place that's out of its view and no nearer than a rifle wants; failing
  // that, the first stop within range, in view or not. A place already that near is watched from where they gather.
  const last = h.lit.length - 1;
  const range = (k: number): number => Math.sqrt((h.stops[2 * k]! - h.ox) * (h.stops[2 * k]! - h.ox) + (h.stops[2 * k + 1]! - h.oz) * (h.stops[2 * k + 1]! - h.oz));
  let post = -1;
  for (let k = last - 1; k >= 0 && post < 0; k--) {
    const d = range(k);
    if (d > W.far) break;
    if (d >= W.near && (k === 0 || h.lit[k] === 0)) post = k;
  }
  for (let k = 0; k < last && post < 0; k++) if (range(k) <= W.far) post = k;
  h.post = post < 0 ? Math.max(0, last - 1) : post;
  return true;
}

/** The stop nearest where he stands, no farther on than where they watch from: where a man takes up a way he's already some of the way along. */
function nearestStop(m: GuardMind, h: Hunt): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k <= h.post; k++) {
    const dx = h.stops[2 * k]! - m.self.x;
    const dz = h.stops[2 * k + 1]! - m.self.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Starting, or taking up again, the hunt: the way out if he hasn't one for this order, and on to the stop he was making for. */
export function beginHunt(m: GuardMind): void {
  const b = m.brain!;
  const task = b.task;
  if (!task || !orderOf(m)) return;
  b.x = task.x;
  b.z = task.z;
  const h = b.hunt;
  if (h && h.task === task.id) {
    // Back from a fight, or from getting out of the line: he may be anywhere. On to his stop again.
    if (h.phase === 'out' || h.phase === 'close') {
      h.going = true;
      h.left = m.tick;
    } else if (h.phase === 'watch' || h.phase === 'sweep') h.since = m.tick;
    return;
  }
  renew(m);
}

/** A new order, or the first: the way out for it, from the start if he's fresh to it, or from the stop nearest him if he's already out. */
function renew(m: GuardMind): void {
  const b = m.brain!;
  const fresh = b.hunt === undefined;
  const h: Hunt = b.hunt ?? {
    task: -1,
    ox: 0,
    oz: 0,
    phase: 'out',
    stops: [],
    lit: [],
    post: 0,
    at: 0,
    from: 0,
    theirs: -1,
    theirMove: -1,
    theirMoveTo: -1,
    theirReach: 0,
    heardClear: -1,
    mark: m.tick - 1,
    going: true,
    left: m.tick,
    since: m.tick,
    said: false,
    saidAt: -1,
    stance: 'crouch',
    up: 'stand',
    looking: false,
    until: -1,
    line: false,
    unheard: 0,
    pinned: -1,
    sweep: [],
    swept: 0,
    corner: 0,
    walked: false,
    began: -1,
    hop: [],
    hopAt: 0,
    missed: 1e9,
    cleared: false,
    body: -1,
    shotAt: -1,
  };
  if (!findWay(m, h)) {
    // No way there on foot: nothing for him to do about it.
    b.task = null;
    delete b.hunt;
    b.done = true;
    return;
  }
  b.hunt = h;
  h.phase = 'out';
  h.at = fresh ? 0 : nearestStop(m, h);
  h.from = h.at;
  h.theirs = -1;
  h.theirMove = -1;
  h.theirMoveTo = -1;
  h.heardClear = -1;
  h.going = true;
  h.left = m.tick;
  h.said = false;
  h.unheard = 0;
  b.routed = -1;
}

/** Where he stands at a stop: a little to one side of it, by his place in the section, so two men don't make for one spot. */
function spotAt(m: GuardMind, h: Hunt, k: number, out: { x: number; z: number }): void {
  const o = m.brain!.task!.hunt!;
  const B = m.tuning.brain.hunt.bound;
  const x = h.stops[2 * k]!;
  const z = h.stops[2 * k + 1]!;
  const place = o.men.indexOf(m.id);
  const dx = h.ox - x;
  const dz = h.oz - z;
  const d = Math.sqrt(dx * dx + dz * dz);
  // Apart, across the way they're going; farther apart where they watch from, for two angles on the place. On the place itself, and for the leader, the stop is the spot.
  const side = d < 1 || place <= 0 || k === h.lit.length - 1 ? 0 : (place % 2 === 0 ? 1 : -1) * Math.floor((place + 1) / 2) * (k === h.post ? B.apart : B.spread);
  out.x = x + (d < 1 ? 0 : (-dz / d) * side);
  out.z = z + (d < 1 ? 0 : (dx / d) * side);
}

/** Whether this man is of the half that goes first: the leader's, every other man from him. */
function leads(m: GuardMind): boolean {
  return m.brain!.task!.hunt!.men.indexOf(m.id) % 2 === 0;
}

/**
 * Takes in what he's been told since he last did: the other half's "Set!", which names the
 * stop it's down on, its "Moving!", and anyone's word that the place is clear.
 */
function listen(m: GuardMind, h: Hunt): void {
  const b = m.brain!;
  const men = b.task!.hunt!.men;
  const mine = men.indexOf(m.id) % 2;
  const R = m.tuning.brain.comms.clearRadius;
  let mark = h.mark;
  for (const t of b.told) {
    if (t.heard <= h.mark) continue;
    if (t.heard > mark) mark = t.heard;
    if (t.kind === 'clear' && (t.x - h.ox) * (t.x - h.ox) + (t.z - h.oz) * (t.z - h.oz) <= R * R) h.heardClear = t.heard;
    if (t.kind !== 'set' && t.kind !== 'moving') continue;
    const who = men.indexOf(t.from);
    if (who < 0 || who % 2 === mine) continue;
    // He named a stop: the one he's down on, or the one he's going to. The nearest to what he named.
    let at = -1;
    let bestD = Infinity;
    for (let k = 0; k < h.lit.length; k++) {
      const dx = h.stops[2 * k]! - t.x;
      const dz = h.stops[2 * k + 1]! - t.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        at = k;
      }
    }
    if (t.kind === 'moving') {
      // How far that is from the place says whether fire on the place is still safe.
      h.theirMove = t.heard;
      h.theirMoveTo = at;
      h.theirReach = Math.sqrt((t.x - h.ox) * (t.x - h.ox) + (t.z - h.oz) * (t.z - h.oz));
    } else if (at > h.theirs) h.theirs = at;
  }
  h.mark = mark;
}

/** True if the ground from one stop on to another is all out of the shooter's view. */
function covered(h: Hunt, from: number, to: number): boolean {
  for (let k = from + 1; k <= to; k++) if (h.lit[k] === 1) return false;
  return true;
}

/** True if a place is off the camp's own ground: past its pad. */
function beyondTheWire(m: GuardMind, x: number, z: number): boolean {
  const site = m.world.camp.site;
  return (x - site.x) * (x - site.x) + (z - site.z) * (z - site.z) > site.radius * site.radius;
}

function say(m: GuardMind, kind: 'set' | 'moving' | 'clear', x: number, z: number): Report {
  const b = m.brain!;
  const C = m.tuning.brain.comms;
  const report: Report = { kind, x, y: m.self.y, z, radius: C.radius[kind], tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: b.cause };
  b.say = { report, radius: C.shoutRadius, radio: false };
  return report;
}

/** Turns for home: back to his post, and the order is done with when he's there. */
function goHome(m: GuardMind, h: Hunt): void {
  h.phase = 'home';
  h.going = true;
  m.brain!.routed = -1;
}

/** Down where he's got to: flat, if what he's behind doesn't hide a kneeling man from the place, and up from that to look. */
function getDown(m: GuardMind, h: Hunt): void {
  const self = m.self;
  h.going = false;
  h.since = m.tick;
  h.said = false;
  h.looking = false;
  h.until = m.tick;
  const open = exposedAt(m.world, m.tuning, self.x, self.z, 'crouch', h.ox, h.oz, m.nav.work, undefined, self.y);
  h.stance = open ? 'prone' : 'crouch';
  h.up = open ? 'crouch' : 'stand';
}

/** Leaves the stop he's on for another, saying so if it's for him to say: which stop, for whoever is covering him or coming with him. */
function setOff(m: GuardMind, h: Hunt, to: number, announce: boolean): void {
  const b = m.brain!;
  // Out onto ground the shooter can see, from ground he can't, or the start of the last stretch: the net hears it, and the
  // camp's marksmen put fire on the place while they cross. On the net it's the place that's named, not the stop.
  if (announce && !covered(h, h.at, to) && (h.at === h.post || h.lit[h.at] === 0)) {
    const C = m.tuning.brain.comms;
    b.radio = { kind: 'moving', x: h.ox, y: m.world.terrain.heightAt(h.ox, h.oz) + m.tuning.brain.hunt.watch.cover.height, z: h.oz, radius: C.radius.moving, tick: m.tick, from: m.id, fromX: m.self.x, fromZ: m.self.z, cause: b.cause };
  }
  h.from = h.at;
  h.at = to;
  h.going = true;
  h.left = m.tick;
  b.routed = -1;
  if (announce) say(m, 'moving', h.stops[2 * to]!, h.stops[2 * to + 1]!);
}

/** The corners of the box a man walks round a point, as offsets in units of its half-diagonal; the fifth is its middle. */
const BOX: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
  [0, 0],
];

/** Starts looking the place over: the place, and the listed firing points the order names that are close beside it, the nearest next each time. */
function startSweep(m: GuardMind, h: Hunt): void {
  const o = m.brain!.task!.hunt!;
  const S = m.tuning.brain.hunt.sweep;
  h.phase = 'sweep';
  h.sweep = [h.ox, h.oz];
  h.swept = 0;
  h.corner = 0;
  h.walked = false;
  h.began = m.tick;
  h.hop = [];
  h.hopAt = 0;
  h.missed = 1e9;
  const left: number[] = [];
  for (let k = 0; k + 1 < o.watch.length; k += 2) {
    const dx = o.watch[k]! - h.ox;
    const dz = o.watch[k + 1]! - h.oz;
    const d = dx * dx + dz * dz;
    if (d > 1 && d <= S.reach * S.reach) left.push(o.watch[k]!, o.watch[k + 1]!);
  }
  let x = h.ox;
  let z = h.oz;
  while (left.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < left.length; k += 2) {
      const d = (left[k]! - x) * (left[k]! - x) + (left[k + 1]! - z) * (left[k + 1]! - z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    x = left[best]!;
    z = left[best + 1]!;
    h.sweep.push(x, z);
    left.splice(best, 2);
  }
  m.brain!.routed = -1;
}

/** One tick of the hunt for one man. */
export function performHunt(m: GuardMind, out: Order): void {
  const b = m.brain!;
  const self = m.self;
  const task = b.task;
  if (!task || !orderOf(m)) {
    delete b.hunt;
    b.done = true;
    steer(m, out, 0, 0, 'idle', self.x, self.z, 'crouch');
    return;
  }
  const T = m.tuning;
  const H = T.brain.hunt;
  const hz = T.sim.tickHz;
  // New orders, or the same order moved: the way out again.
  if (!b.hunt || b.hunt.task !== task.id || (b.hunt.ox - task.x) * (b.hunt.ox - task.x) + (b.hunt.oz - task.z) * (b.hunt.oz - task.z) > 1) {
    renew(m);
    if (!b.hunt) {
      steer(m, out, 0, 0, 'idle', self.x, self.z, 'crouch');
      return;
    }
  }
  const h = b.hunt;
  b.x = h.ox;
  b.z = h.oz;
  listen(m, h);
  // Rounds striking close, or cracking past: down, wherever he is.
  for (const p of m.percepts) {
    if (p.kind !== 'shot' || (p.sound !== 'impact' && p.sound !== 'crack') || m.tick - p.tick > 1) continue;
    if ((p.x - self.x) * (p.x - self.x) + (p.z - self.z) * (p.z - self.z) > H.pin.within * H.pin.within) continue;
    const until = m.tick + Math.round((H.pin.min + (H.pin.max - H.pin.min) * m.draw()) * hz);
    if (until > h.pinned) h.pinned = until;
  }
  // One of his own, down, out here: flat, the camp hears of it, and one more silence from the rest sends him home.
  for (const p of m.percepts) {
    if (p.kind !== 'body' || p.tick <= h.body || h.phase === 'home') continue;
    h.body = p.tick;
    if (!beyondTheWire(m, p.x, p.z)) continue;
    const until = m.tick + Math.round(H.body.down * hz);
    if (until > h.pinned) h.pinned = until;
    h.unheard = Math.max(h.unheard, H.bound.giveUp - 1);
    const C = T.brain.comms;
    const report: Report = { kind: 'body', x: p.x, y: p.y, z: p.z, radius: Math.max(p.radius, C.radius.body), tick: p.tick, from: m.id, fromX: self.x, fromZ: self.z, cause: p.cause };
    b.say = { report, radius: C.shoutRadius, radio: false };
    b.radio = { ...report };
  }
  // A shot heard, or a flash seen: the rifle's still speaking.
  for (const p of m.percepts) if ((p.kind === 'muzzle' || (p.kind === 'shot' && p.sound === 'report')) && p.tick > h.shotAt) h.shotAt = p.tick;
  const hot = h.shotAt >= 0 && (m.tick - h.shotAt) / hz < H.quiet;
  const pinned = m.tick < h.pinned;
  const last = h.lit.length - 1;
  // Orders don't stand for ever.
  if (h.phase !== 'home' && (m.tick - task.issued) / hz > H.lifetime) goHome(m, h);

  if (h.phase === 'home') {
    if (pinned) {
      steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'prone');
      return;
    }
    const w = walk(m, out, m.post.x, m.post.z, H.paces.home, 'walk', m.post.x, m.post.z);
    if (w === 'walking') return;
    b.task = null;
    delete b.hunt;
    b.done = true;
    return;
  }

  if (h.phase === 'hold') {
    // The place is clear, and the camp knows; or nobody came, and it knows that. New orders come over the net, or none do.
    stayAt(m, out, self.x, self.z, 'crouch', 2 * self.x - m.post.x, 2 * self.z - m.post.z);
    if ((m.tick - h.since) / hz >= H.hold) goHome(m, h);
    return;
  }

  if (h.phase === 'sweep') {
    if (pinned) {
      steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'prone');
      return;
    }
    // On the place: round it in a box, looking in, and then round each firing point close beside it. Anyone lying up here
    // comes under his eyes or his feet, and that's a fight. A corner he can't stand on, or can't get to, he leaves out.
    const S = H.sweep;
    while (2 * h.swept < h.sweep.length) {
      const cx = h.sweep[2 * h.swept]!;
      const cz = h.sweep[2 * h.swept + 1]!;
      // Across to it first, by a way a man can climb (approach.ts): the straight line between two firing points is often a face.
      if (2 * h.hopAt < h.hop.length) {
        const late = (m.tick - h.began) / hz > S.per;
        const w = late ? 'stuck' : walk(m, out, h.hop[2 * h.hopAt]!, h.hop[2 * h.hopAt + 1]!, H.paces.covered, 'sprint', cx, cz);
        if (w === 'walking') return;
        b.routed = -1;
        h.hopAt = late ? h.hop.length : h.hopAt + 1;
        continue;
      }
      const [ox, oz] = BOX[h.corner]!;
      const x = cx + ox * S.radius * Math.SQRT1_2;
      const z = cz + oz * S.radius * Math.SQRT1_2;
      // A point he can't get round in the time it's worth is left: the far side of a face, say.
      const late = (m.tick - h.began) / hz > S.per;
      const w = late || !navigatorOf(m.world, T).standable(x, z) ? 'stuck' : walk(m, out, x, z, h.corner === 0 && h.swept > 0 ? H.paces.covered : S.pace, h.corner === 0 && h.swept > 0 ? 'sprint' : 'walk', cx, cz);
      if (w === 'walking') return;
      b.routed = -1;
      if ((x - self.x) * (x - self.x) + (z - self.z) * (z - self.z) <= S.near * S.near) h.walked = true;
      if (!late && ++h.corner < BOX.length) continue;
      // The place itself, and he never got onto it: he can't call it. Back, and the camp leaves it be for a while.
      if (h.swept === 0 && !h.walked) {
        goHome(m, h);
        steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'crouch');
        return;
      }
      // One he couldn't get round isn't looked over: his call says how far out from the place he can speak for.
      if (!h.walked) h.missed = Math.min(h.missed, Math.sqrt((cx - h.ox) * (cx - h.ox) + (cz - h.oz) * (cz - h.oz)));
      h.corner = 0;
      h.walked = false;
      h.began = m.tick;
      h.swept++;
      h.hop = [];
      h.hopAt = 0;
      if (2 * h.swept < h.sweep.length) {
        watch.length = 0;
        const o = task.hunt!;
        for (let k = 0; k + 1 < o.watch.length; k += 2) watch.push({ x: o.watch[k]!, z: o.watch[k + 1]! });
        if (approachOf(m.world, T).aim(watch).way(self.x, self.z, h.sweep[2 * h.swept]!, h.sweep[2 * h.swept + 1]!, way)) h.hop = way.stops.slice(2);
      }
    }
    steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'crouch');
    // Clear, and how far out from the place that holds: short of the nearest point he couldn't get round.
    const report = say(m, 'clear', h.ox, h.oz);
    report.radius = Math.max(1, Math.min(S.reach, h.missed - 1));
    b.radio = { ...report };
    h.phase = 'hold';
    h.cleared = true;
    h.since = m.tick;
    return;
  }

  if (h.phase === 'watch') {
    if (h.heardClear >= 0) {
      h.phase = 'hold';
      h.cleared = true;
      h.since = m.tick;
      return;
    }
    const W = H.watch;
    // Up to look at the place, down again, in a rhythm of his own; and down while rounds are landing on him.
    if (pinned && h.looking) {
      h.looking = false;
      h.until = h.pinned;
    }
    // Covering a man who's said he's moving on the place, until he's near enough to it that the fire has to lift.
    const covering = !leads(m) && h.theirMove >= 0 && (m.tick - h.theirMove) / hz <= W.cover.hold && h.theirReach > W.cover.lift;
    if (m.tick >= h.until && !pinned) {
      h.looking = !h.looking || covering;
      const span = h.looking ? W.look : W.down;
      h.until = m.tick + Math.round((span.min + (span.max - span.min) * m.draw()) * hz);
      // Whether he can see the place from here, up: asked as he comes up, a ray a look.
      if (h.looking) h.line = lineFrom(m.world, T, self.x, self.z, h.up, h.ox, h.oz, m.nav.work);
    }
    const ready = stayAt(m, out, self.x, self.z, h.looking ? h.up : h.stance, h.ox, h.oz);
    if (!h.said && (m.tick - h.since) / hz >= H.bound.settle) {
      h.said = true;
      h.saidAt = m.tick;
      say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
      return;
    }
    // Until the other half has come up beside him he says it again now and then: they may not have been in earshot the first time.
    if (h.theirs < h.at && h.theirMove < h.since && (m.tick - h.saidAt) / hz >= H.bound.again && !b.say) {
      h.saidAt = m.tick;
      say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
    }
    // The half behind covers a man who's said he's moving on the place: rounds at it, while he has a line to it and it's in reach.
    if (covering && h.looking && ready && h.line && m.tick >= b.fireAt) {
      const dx = h.ox - self.x;
      const dz = h.oz - self.z;
      if (dx * dx + dz * dz <= W.cover.range * W.cover.range) {
        b.fire = { x: h.ox, y: m.world.terrain.heightAt(h.ox, h.oz) + W.cover.height, z: h.oz };
        b.fireAt = m.tick + Math.round(W.cover.every * hz);
      }
    }
    const waited = (m.tick - h.since) / hz;
    if (leads(m)) {
      // Watched long enough, and the other half is up beside him (or isn't coming): on to the place. Not while he's firing.
      if (waited < W.for || pinned || hot) return;
      if (h.theirs < h.at && waited < W.for + H.bound.wait) return;
      if (h.at >= last) {
        startSweep(m, h);
        return;
      }
      h.phase = 'close';
      setOff(m, h, h.at + 1, true);
      return;
    }
    // The half behind: there until the place is called, or until it's plain nobody's going to.
    if (waited >= W.for + H.bound.wait * H.bound.giveUp && h.theirMove < h.since) goHome(m, h);
    return;
  }

  spotAt(m, h, h.at, spot);

  if (h.phase === 'close') {
    // The last of it, in his view all the way: short dashes, down between them, and he says so each time.
    if (h.going) {
      if (pinned) {
        steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'prone');
        return;
      }
      const w = walk(m, out, spot.x, spot.z, H.paces.lit, 'sprint', h.ox, h.oz);
      const dx = h.ox - self.x;
      const dz = h.oz - self.z;
      const there = h.at === last && dx * dx + dz * dz <= H.sweep.near * H.sweep.near;
      if (w === 'walking' && !there) return;
      // No way found, or something in it: he tries again for a while before he makes do with where he's got to.
      if (w === 'stuck' && !there && (m.tick - h.left) / hz < H.sweep.stuck) {
        steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'crouch');
        return;
      }
      getDown(m, h);
      if (h.at === last) {
        // On it, or near enough to walk round it. Stopped short of that, he can't call it: back, and the camp leaves the place be for a while.
        if (dx * dx + dz * dz <= H.sweep.from * H.sweep.from) startSweep(m, h);
        else goHome(m, h);
        return;
      }
    }
    stayAt(m, out, self.x, self.z, h.stance, h.ox, h.oz);
    if (pinned || hot || (m.tick - h.since) / hz < H.watch.pause) return;
    setOff(m, h, h.at + 1, true);
    return;
  }

  // Out: to where they gather, and on to where they watch from.
  if (h.going) {
    if (pinned) {
      steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'prone');
      return;
    }
    const w = walk(m, out, spot.x, spot.z, covered(h, h.from, h.at) ? H.paces.covered : H.paces.lit, 'sprint', h.ox, h.oz);
    if (w === 'walking') return;
    // No way found, or something in it: he tries again for a while before he makes do with where he's got to.
    if (w === 'stuck' && (spot.x - self.x) * (spot.x - self.x) + (spot.z - self.z) * (spot.z - self.z) > H.sweep.near * H.sweep.near && (m.tick - h.left) / hz < H.sweep.stuck) {
      steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'crouch');
      return;
    }
    // There, or as near as he can get.
    getDown(m, h);
    if (h.at >= h.post) {
      h.phase = 'watch';
      return;
    }
  }
  stayAt(m, out, self.x, self.z, h.stance, h.ox, h.oz);
  if (!h.said && (m.tick - h.since) / hz >= H.bound.settle) {
    h.said = true;
    h.saidAt = m.tick;
    say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
    return;
  }
  if (!h.said || pinned) return;
  // The other half has said it's running on, over ground out of the shooter's view all the way from here: with it, at once.
  if (h.theirMoveTo > h.at && h.theirMove >= h.since - Math.round(H.bound.wait * hz) && covered(h, h.at, h.theirMoveTo)) {
    h.unheard = 0;
    setOff(m, h, Math.min(h.post, h.theirMoveTo), false);
    return;
  }
  // Still waiting: he says it again now and then. Whoever he's waiting for may not have been in earshot the first time.
  if ((m.tick - h.saidAt) / hz >= H.bound.again && !b.say) {
    h.saidAt = m.tick;
    say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
  }
  // His turn: the other half is down, on his stop or past it if he's of the half that goes first, and past it if he isn't.
  const theirs = h.theirs;
  const due = theirs >= h.at + (leads(m) ? 0 : 1);
  // Where they gather, the wait runs from the order: the camp said how long the farthest man should take to come.
  const waited = h.at === 0 ? (m.tick - task.issued) / hz >= task.hunt!.eta + H.rally.wait && (m.tick - h.since) / hz >= H.bound.settle : (m.tick - h.since) / hz >= H.bound.wait;
  if (!due && !waited) return;
  if (!due && h.at === 0 && theirs < 0) {
    // Where they gather, and the rest never came: the camp hears who, and he waits here for whoever it sends instead.
    const o = task.hunt!;
    const mine = o.men.indexOf(m.id) % 2;
    const absent = o.men.find((id, i) => i % 2 !== mine && !b.told.some((t) => t.from === id && t.heard >= task.issued));
    if (absent !== undefined) b.radio = { kind: 'missing', x: self.x, y: self.y, z: self.z, radius: T.brain.comms.radius.missing, tick: m.tick, from: m.id, fromX: self.x, fromZ: self.z, cause: b.cause, about: absent };
    h.phase = 'hold';
    h.cleared = false;
    h.since = m.tick;
    return;
  }
  if (due) h.unheard = 0;
  else if (++h.unheard >= H.bound.giveUp) {
    // Nobody's answered him for three bounds: he's on his own out here, and that's no way to hunt.
    goHome(m, h);
    return;
  }
  // One stop past the other half; and if that's all out of the shooter's view, on to the end of the cover, which they run together.
  let to = Math.min(h.post, Math.max(h.at + 1, theirs + 1));
  if (covered(h, h.at, to)) while (to < h.post && h.lit[to + 1] === 0) to++;
  else if (hot) {
    // Ground he can see, and he's just fired: not yet. The wait starts again when he's been quiet.
    h.since = m.tick;
    if (!due) h.unheard--;
    return;
  }
  setOff(m, h, to, true);
}

/** What the debug view says of a man on the hunt: what he's doing, and how far along. */
export function huntPhase(b: { act: ActName; hunt?: Hunt }, tick: number): string | null {
  const h = b.hunt;
  if (!h || b.act !== 'hunt') return null;
  if (tick < h.pinned) return 'pinned';
  if (h.phase === 'home') return 'coming home';
  if (h.phase === 'hold') return h.cleared ? 'place clear' : 'nobody came';
  if (h.phase === 'sweep') return `looking it over ${h.swept + 1}/${h.sweep.length / 2}`;
  if (h.phase === 'watch') return h.looking ? 'watching, up' : 'watching, down';
  if (h.phase === 'close') return h.going ? 'closing in' : 'closing in, down';
  const of = `${h.at}/${h.post}`;
  if (h.going) return h.at === 0 ? 'to the rally' : h.lit[h.at] === 1 ? `dashing ${of}` : `going ${of}`;
  return h.said ? `set ${of}` : `down ${of}`;
}
