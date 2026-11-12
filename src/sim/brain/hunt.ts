import type { Stance } from '../body';
import { dcos, dsin } from '../kernel/core/detmath';
import { approachOf, emptyWay } from './approach';
import type { ActName } from './brain';
import type { HuntOrder } from './camp';
import { stayAt, steer } from './firefight';
import type { GuardMind } from './mind';
import { walk } from './moves';
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
 *   out      To where it gathers, and on. Out of his view they keep going, one behind the
 *            other. Where the way crosses ground he can see they go by bounds, in turn: a
 *            man dashes to the next stop, gets down, and says "Set!"; the other half goes
 *            when it hears him, one stop past where he is.
 *   watch    No way reaches a firing point unseen: the last of it is the ground the firing
 *            point looks down on. So they stop short of that, at the last cover within
 *            rifle range, and watch the place: up to look, down again. A shot from there
 *            now, or a man getting up to leave, is under two rifles.
 *   close    Nothing seen: the leader's half goes on to the place by short dashes, saying so,
 *            and the half behind covers it, with fire on the place while a man is up.
 *   sweep    On the place: he looks all round it.
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
  /** The farthest stop he's heard the other half say it's down on (−1 for none); the ticks he last heard the other half say it's moving, and anyone call this place clear (−1 for never). Taken from what he's told as it comes, since a busy net pushes it out of mind. */
  theirs: number;
  theirMove: number;
  heardClear: number;
  /** The tick up to which he's taken in what he's been told. */
  mark: number;
  /** On his way to it. Otherwise he's down on it, since `since`, and has said so or not. */
  going: boolean;
  since: number;
  said: boolean;
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
  /** The tick he first had the place under his eyes with nobody there, or −1. */
  clear: number;
  /** Holding because the place is clear (true), or at the rally because the rest of his section never came. */
  cleared: boolean;
  /** The newest body he's taken note of out here: its percept's tick, or −1. */
  body: number;
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
    if (h.phase === 'out' || h.phase === 'close') h.going = true;
    else if (h.phase === 'watch' || h.phase === 'sweep') h.since = m.tick;
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
    heardClear: -1,
    mark: m.tick - 1,
    going: true,
    since: m.tick,
    said: false,
    stance: 'crouch',
    up: 'stand',
    looking: false,
    until: -1,
    line: false,
    unheard: 0,
    pinned: -1,
    clear: -1,
    cleared: false,
    body: -1,
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
  h.heardClear = -1;
  h.going = true;
  h.said = false;
  h.unheard = 0;
  h.clear = -1;
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
    if (t.kind === 'moving') {
      h.theirMove = t.heard;
      continue;
    }
    // He said which stop he's on: the one nearest what he named.
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
    if (at > h.theirs) h.theirs = at;
  }
  h.mark = mark;
}

/** True if the ground between the stop he left and the one he's on is all out of the shooter's view. */
function cameCovered(h: Hunt): boolean {
  for (let k = h.from + 1; k <= h.at; k++) if (h.lit[k] === 1) return false;
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

/** Leaves the stop he's on for another. */
function setOff(m: GuardMind, h: Hunt, to: number): void {
  h.from = h.at;
  h.at = to;
  h.going = true;
  m.brain!.routed = -1;
  if (h.lit[to] === 1 || h.phase === 'close') say(m, 'moving', h.ox, h.oz);
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
      h.clear = -1;
      return;
    }
    // On the place: up on a knee, turning to look all round it. Anyone here comes under his eyes, and that's a fight.
    if (h.clear < 0) h.clear = m.tick;
    const turned = (2 * Math.PI * (m.tick - h.clear)) / (H.look * hz);
    stayAt(m, out, self.x, self.z, 'crouch', self.x + 10 * dsin(turned), self.z - 10 * dcos(turned));
    if ((m.tick - h.clear) / hz < H.look) return;
    const report = say(m, 'clear', h.ox, h.oz);
    report.radius = T.brain.comms.clearRadius;
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
    const covering = !leads(m) && h.theirMove >= 0 && (m.tick - h.theirMove) / hz <= W.cover.hold;
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
      say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
      return;
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
      // Watched long enough, and the other half is up beside him (or isn't coming): on to the place.
      if (waited < W.for || pinned) return;
      if (h.theirs < h.at && waited < W.for + H.bound.wait) return;
      if (h.at >= last) {
        h.phase = 'sweep';
        h.clear = -1;
        return;
      }
      h.phase = 'close';
      setOff(m, h, h.at + 1);
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
      const there = h.at === last && dx * dx + dz * dz <= H.arrive * H.arrive;
      if (w === 'walking' && !there) return;
      getDown(m, h);
      if (h.at === last) {
        h.phase = 'sweep';
        h.clear = -1;
        return;
      }
    }
    stayAt(m, out, self.x, self.z, h.stance, h.ox, h.oz);
    if (pinned || (m.tick - h.since) / hz < H.watch.pause) return;
    setOff(m, h, h.at + 1);
    return;
  }

  // Out: to where they gather, and on to where they watch from.
  if (h.going) {
    if (pinned) {
      steer(m, out, 0, 0, 'idle', h.ox, h.oz, 'prone');
      return;
    }
    const lit = !cameCovered(h);
    const w = walk(m, out, spot.x, spot.z, lit ? H.paces.lit : H.paces.covered, 'sprint', h.ox, h.oz);
    if (w === 'walking') return;
    // There, or as near as he can get.
    getDown(m, h);
    if (h.at >= h.post) {
      h.phase = 'watch';
      return;
    }
    // Out of his view all the way here, and for the next stretch too: on, without a word. Bounds are for ground he can see.
    if (h.at > 0 && h.at + 1 <= h.post && cameCovered(h) && h.lit[h.at + 1] === 0) {
      h.from = h.at;
      h.at++;
      h.going = true;
      b.routed = -1;
      spotAt(m, h, h.at, spot);
      walk(m, out, spot.x, spot.z, H.paces.covered, 'sprint', h.ox, h.oz);
      return;
    }
  }
  stayAt(m, out, self.x, self.z, h.stance, h.ox, h.oz);
  if (!h.said && (m.tick - h.since) / hz >= H.bound.settle) {
    h.said = true;
    say(m, 'set', h.stops[2 * h.at]!, h.stops[2 * h.at + 1]!);
    return;
  }
  if (!h.said || pinned) return;
  // His turn: the other half is down, on his stop or past it if he's of the half that goes first, and past it if he isn't.
  const theirs = h.theirs;
  const due = theirs >= h.at + (leads(m) ? 0 : 1);
  const waited = (m.tick - h.since) / hz >= (h.at === 0 ? H.rally.wait : H.bound.wait);
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
  setOff(m, h, Math.min(h.post, Math.max(h.at + 1, theirs + 1)));
}

/** What the debug view says of a man on the hunt: what he's doing, and how far along. */
export function huntPhase(b: { act: ActName; hunt?: Hunt }, tick: number): string | null {
  const h = b.hunt;
  if (!h || b.act !== 'hunt') return null;
  if (tick < h.pinned) return 'pinned';
  if (h.phase === 'home') return 'coming home';
  if (h.phase === 'hold') return h.cleared ? 'place clear' : 'nobody came';
  if (h.phase === 'sweep') return 'on the place';
  if (h.phase === 'watch') return h.looking ? 'watching, up' : 'watching, down';
  if (h.phase === 'close') return h.going ? 'closing in' : 'closing in, down';
  const of = `${h.at}/${h.post}`;
  if (h.going) return h.at === 0 ? 'to the rally' : h.lit[h.at] === 1 ? `dashing ${of}` : `going ${of}`;
  return h.said ? `set ${of}` : `down ${of}`;
}
