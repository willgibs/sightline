import { REPORT_KINDS, alertRung, createCamp, digest, mapMass, plan, spreadCamp, type CampMind, type CampOrder, type CampState, type Report, type Task, type Told, type Via } from '../brain';
import type { DebugDraw } from '../kernel/debugDraw';
import type { SimEvent } from '../kernel/events';
import { Faction, type EntityBase } from '../kernel/state';
import type { ScheduleHandler, System, TickContext } from '../kernel/systems';
import { Surface } from '../kernel/world/surfaces';
import { believe, stimulate, type Percept } from '../perception';
import type { GuardEntity } from './entities';
import { deliverSound } from './perception';
import type { Simulation } from './sim';

/**
 * How reports travel (E4): by voice, through lab A's hearing, and by radio across the camp
 * after a delay. Plain mechanics, no decisions; the brain decides what to say (brain.ts,
 * the 'report' act), and the commander what to do with it (commander.ts, E5).
 *
 * The chain of causes: a percept → an act (he calls it in) → a voice event (he talks) →
 * a 'heard' voice for whoever is in earshot, or a 'radio' event when the net delivers it →
 * the listener's act. A guard shot mid-call never finishes, so the net never carries it.
 */

export interface CommanderEntity extends EntityBase {
  kind: 'commander';
  /** The camp's memory: everything the camp knows. Fed only by reports. */
  camp: CampState;
}

declare module '../kernel/state' {
  interface EntityKinds {
    commander: CommanderEntity;
  }
}

/** Puts a commander in a run: the camp's single memory (E4, E5). */
export function giveCommander(sim: Simulation): CommanderEntity {
  const site = sim.world.camp.site;
  const camp = createCamp(site.x, site.z, sim.tuning);
  for (const g of sim.guards) {
    const post = sim.world.camp.guards[g.guard.spawn]!;
    camp.roster.push({ id: g.id, post: g.guard.spawn, x: post.x, z: post.z, tick: 0, status: 'ok' });
  }
  return sim.spawn((id): CommanderEntity => ({ id, kind: 'commander', faction: Faction.Camp, camp }));
}

/** The run's commander, if the camp brain runs. */
export function commanderOf(ctx: Pick<TickContext, 'index'>): CommanderEntity | undefined {
  return ctx.index.of('commander')[0];
}

/** Tells a guard a report: it joins his memory, raises his awareness to the report's level and his belief, if it's the surest he has. */
export function tell(ctx: TickContext, g: GuardEntity, r: Report, via: Via, cause: number): void {
  const b = g.brain;
  const s = g.senses;
  if (!b || !s) return;
  const T = ctx.tuning.brain.comms;
  const hz = ctx.tuning.sim.tickHz;
  const told: Told = { ...r, via, heard: ctx.tick };
  b.told.push(told);
  const cutoff = ctx.tick - Math.round(T.keep * hz);
  let w = 0;
  for (const x of b.told) if (x.heard >= cutoff) b.told[w++] = x;
  b.told.length = w;
  if (b.told.length > T.maxTold) b.told.splice(0, b.told.length - T.maxTold);
  const level = T.level[r.kind];
  if (level > 0) {
    const draw = (): number => ctx.draw(g.id, 'awareness', (rng) => rng.next());
    stimulate(s.awareness, { kind: 'voice', level, x: r.x, y: r.y, z: r.z, cause, reason: 'voice' }, ctx.tick, ctx.tuning, draw);
  }
  if (r.kind !== 'clear') {
    const p: Percept = { kind: 'voice', x: r.x, y: r.y, z: r.z, radius: r.radius, strength: level, tick: ctx.tick, expires: ctx.tick + Math.round(T.keep * hz), cause };
    believe(s, p, false, ctx.tick, ctx.tuning);
  }
}

/**
 * Comms: a voice heard this tick tells whoever heard it what was said. A voice carries
 * what was said for as long as anyone could still be hearing it, then is forgotten.
 */
export const commsVoice: System = {
  name: 'comms-voice',
  phase: 'camp',
  reads: ['events', 'commander.camp', 'guard.senses', 'guard.brain'],
  writes: ['commander.camp.voices', 'guard.brain.told', 'guard.senses.awareness', 'guard.senses.belief', 'rng.awareness'],
  emits: [],
  run(ctx) {
    const c = commanderOf(ctx);
    if (!c) return;
    for (const e of ctx.events) {
      if (e.type !== 'heard' || e.kind !== 'voice') continue;
      const v = c.camp.voices.find((x) => x.event === e.cause);
      if (!v) continue;
      const g = ctx.index.get(e.source);
      if (g && g.kind === 'guard' && g.id !== v.report.from) tell(ctx, g, v.report, 'voice', e.id);
    }
    const tick = ctx.tick;
    let w = 0;
    for (const v of c.camp.voices) if (v.heardUntil >= tick) c.camp.voices[w++] = v;
    c.camp.voices.length = w;
  },
};

/**
 * The radio: when a call is finished, the net delivers it after its delay, if the set is
 * working and an operator is alive to hear it. Delivered to the camp and every guard
 * with a radio; a worker has none. An interrupted call never gets here.
 */
export const radioDeliver: ScheduleHandler = (ctx, entry) => {
  const c = commanderOf(ctx);
  if (!c) return;
  const at = c.camp.airwaves.findIndex((a) => a.id === entry.a);
  if (at < 0) return;
  const { report, speaker } = c.camp.airwaves[at]!;
  c.camp.airwaves.splice(at, 1);
  // The net needs a working set and a live operator: otherwise the call goes nowhere.
  if (!radioUp(ctx, c)) return;
  const event = ctx.emit({ type: 'radio', source: speaker, cause: report.cause, kind: report.kind, x: report.x, z: report.z, radius: report.radius });
  for (const g of ctx.index.of('guard')) {
    if (g.id === speaker) continue;
    if (ctx.world.camp.guards[g.guard.spawn]?.role === 'worker') continue;
    tell(ctx, g, report, 'radio', event);
  }
  // The camp hears everything on the net.
  c.camp.inbox.push(report);
};

/**
 * Radio check-ins (E6): the operator calls each post in turn, a scheduled pair: the
 * reply after a delay from the post's own stream, the deadline after its time limit. A
 * post that answers carries on; one that doesn't (killed, or too busy fighting) is
 * reported silent, and the commander sends someone to look. No operator or no set: the
 * calls stop.
 */
export const campCheckins: System = {
  name: 'camp-checkins',
  phase: 'camp',
  after: ['camp-commander'],
  reads: ['commander.camp', 'guard.guard.spawn', 'guard.senses'],
  writes: ['commander.camp', 'schedule', 'rng.checkin'],
  emits: ['checkin'],
  run(ctx) {
    const c = commanderOf(ctx);
    if (!c) return;
    const camp = c.camp;
    const ch = camp.checkins;
    const T = ctx.tuning.brain.camp.checkins;
    const hz = ctx.tuning.sim.tickHz;
    if (ctx.tick < ch.next || ch.pending) return;
    if (!radioUp(ctx, c)) {
      ch.next = ctx.tick + Math.round(5 * hz);
      return;
    }
    // Round-robin over the camp's posts, skipping anyone it has already given up on.
    const n = camp.roster.length;
    let man = camp.roster[0];
    for (let k = 0; k < n; k++) {
      man = camp.roster[(ch.cursor + k) % n]!;
      if (man.status === 'ok') {
        ch.cursor = (ch.cursor + k + 1) % n;
        break;
      }
    }
    if (!man || man.status !== 'ok') return;
    const operator = ctx.index.of('guard').find((g) => ctx.world.camp.guards[g.guard.spawn]?.role === 'radio-operator')!;
    const seq = ch.seq++;
    ch.pending = { post: man.post, guard: man.id, seq, answered: false };
    const call = ctx.emit({ type: 'checkin', source: operator.id, post: man.post, stage: 'call' });
    const reply = ctx.draw(man.id, 'checkin', (rng) => rng.range(T.reply.min, T.reply.max));
    ctx.schedule(reply, 'checkin-reply', seq, man.id);
    ctx.schedule(T.deadline, 'checkin-deadline', seq, call);
    const every = camp.level === 'calm' ? T.every : T.uneasyEvery;
    ch.next = ctx.tick + Math.round((every / n) * hz);
  },
};

/** A post answers its call, if the man is there to answer it. */
export const checkinReply: ScheduleHandler = (ctx, entry) => {
  const c = commanderOf(ctx);
  if (!c) return;
  const pending = c.camp.checkins.pending;
  if (!pending || pending.seq !== entry.a) return;
  const g = ctx.index.get(entry.b);
  // A dead man can't answer; one in a fight doesn't.
  if (!g || g.kind !== 'guard' || g.senses?.awareness.state === 'combat') return;
  pending.answered = true;
  ctx.emit({ type: 'checkin', source: g.id, post: g.guard.spawn, stage: 'answer' });
};

/** The deadline: no answer, and the camp is told that post has gone quiet (a report of its own). */
export const checkinDeadline: ScheduleHandler = (ctx, entry) => {
  const c = commanderOf(ctx);
  if (!c) return;
  const pending = c.camp.checkins.pending;
  if (!pending || pending.seq !== entry.a) return;
  c.camp.checkins.pending = null;
  if (pending.answered) return;
  const post = ctx.world.camp.guards[pending.post];
  if (!post) return;
  const silence = ctx.emit({ type: 'checkin', source: c.id, cause: entry.b, post: pending.post, stage: 'silence' });
  c.camp.inbox.push({ kind: 'missing', x: post.x, y: post.y, z: post.z, radius: ctx.tuning.brain.comms.radius.missing, tick: ctx.tick, from: pending.guard, fromX: post.x, fromZ: post.z, cause: silence });
};

const orders: CampOrder[] = [];

/**
 * The commander, once a tick: digests its inbox and spreads its map; and on its own
 * rhythm, plans (ends a search if belief says so, fills the tasks its level calls for)
 * and sends its orders down the net (delivered after the net's delay, if it works).
 */
export const campCommander: System = {
  name: 'camp-commander',
  phase: 'camp',
  after: ['comms-voice'],
  reads: ['commander.camp', 'guard.guard.spawn', 'guard.brain'],
  writes: ['commander.camp', 'schedule'],
  emits: ['level', 'order'],
  run(ctx) {
    const c = commanderOf(ctx);
    if (!c) return;
    const camp = c.camp;
    const before = camp.level;
    for (const r of camp.inbox) digest(camp, r, ctx.tick, ctx.tuning, ctx.world);
    camp.inbox.length = 0;
    spreadCamp(camp, ctx.tick, ctx.tuning, ctx.world);
    const T = ctx.tuning.brain.camp;
    const hz = ctx.tuning.sim.tickHz;
    const officer = campHasOfficer(ctx);
    const every = Math.max(1, Math.round((officer ? T.planEvery : T.noOfficerEvery) * hz));
    if (ctx.tick - camp.planned >= every) {
      camp.planned = ctx.tick;
      const mind: CampMind = { camp, world: ctx.world, tuning: ctx.tuning, tick: ctx.tick, time: ctx.tick / hz, officer };
      plan(mind, orders);
      for (const o of orders) sendOrder(ctx, c, o.guard, o.task);
    }
    if (camp.level !== before) ctx.emit({ type: 'level', source: c.id, cause: camp.lastCause, from: before, to: camp.level });
    ctx.debug((draw) => drawCamp(draw, ctx, camp));
  },
};

/** True if the camp's officer is on his feet: a fact about the commander's own body (commander.ts, CampMind). */
function campHasOfficer(ctx: TickContext): boolean {
  for (const g of ctx.index.of('guard')) if (ctx.world.camp.guards[g.guard.spawn]?.role === 'officer') return true;
  return false;
}

/** The net's delivery of an order: after the delay, if the set and the operator are there. */
function sendOrder(ctx: TickContext, c: CommanderEntity, guard: number, task: Task): void {
  const event = ctx.emit({ type: 'order', source: c.id, cause: task.cause, to: guard, task: task.kind, x: task.x, z: task.z });
  c.camp.tasks.find((t) => t.id === task.id)!.cause = event;
  ctx.schedule(ctx.tuning.brain.comms.netDelay, 'order-deliver', guard, task.id);
}

/** An order arrives over the radio, if the net can carry it. */
export const orderDeliver: ScheduleHandler = (ctx, entry) => {
  const c = commanderOf(ctx);
  if (!c || !radioUp(ctx, c)) return;
  const g = ctx.index.get(entry.a);
  if (!g || g.kind !== 'guard' || !g.brain) return;
  const task = c.camp.tasks.find((t) => t.id === entry.b);
  if (!task) return;
  g.brain.task = { id: task.id, kind: task.kind, x: task.x, z: task.z, issued: ctx.tick, cause: task.cause };
  // The order is news to him: he reconsiders now.
  g.brain.thinkAt = ctx.tick;
};

function radioUp(ctx: TickContext, c: CommanderEntity): boolean {
  if (!c.camp.netWorking) return false;
  for (const g of ctx.index.of('guard')) if (ctx.world.camp.guards[g.guard.spawn]?.role === 'radio-operator') return true;
  return false;
}

/** The camp in the debug view: its search map as points over the ground, and its alert level. */
function drawCamp(draw: DebugDraw, ctx: TickContext, camp: CampState): void {
  const m = camp.map;
  const mass = mapMass(m);
  draw.label(camp.map.x0 + (m.n * m.cell) / 2, 6, camp.map.z0 + (m.n * m.cell) / 2, `camp: ${camp.level} · belief ${(mass * 100).toFixed(0)}%`, alertRung(camp.level) > 1 ? 'bad' : alertRung(camp.level) === 1 ? 'warn' : 'muted');
  let max = 0;
  for (const v of m.p) if (v > max) max = v;
  if (max <= 0) return;
  for (let j = 0; j < m.n; j++) {
    for (let i = 0; i < m.n; i++) {
      const v = m.p[j * m.n + i]!;
      if (v <= 0) continue;
      const x = m.x0 + (i + 0.5) * m.cell;
      const z = m.z0 + (j + 0.5) * m.cell;
      const y = ctx.world.terrain.heightAt(x, z) + 0.25;
      draw.point(x, y, z, 0.05 + 0.5 * (v / max), v / max > 0.5 ? 'bad' : 'warn');
    }
  }
}

/**
 * The speech a guard's brain asks for this tick (brain.ts): his voice as a sound (a 'call',
 * heard through lab A's hearing), what it said, and, when he finishes a radio call, the
 * net's delivery, scheduled at its delay. Called from the brains' system.
 */
export function speak(ctx: TickContext, g: GuardEntity): void {
  const b = g.brain;
  if (!b) return;
  const C = ctx.tuning.brain.comms;
  if (b.say) {
    const { report, radius, radio } = b.say;
    b.say = null;
    const body = g.body;
    const y = body.y + body.eyeHeight - ctx.tuning.perception.hearing.lift;
    const id = ctx.emit({ type: 'call', source: g.id, cause: report.cause, x: body.x, y, z: body.z, surface: Surface.Grass, loudness: radius / ctx.tuning.noise.radiusPerUnit, radius, radio: radio ? 1 : 0 });
    const c = commanderOf(ctx);
    if (c) c.camp.voices.push({ event: id, report, heardUntil: ctx.tick + Math.round((radius / 300 + 1) * ctx.tuning.sim.tickHz) });
    // The event lands after 'perception' this tick, so it is delivered by hand (perception.ts).
    const call = ctx.events[ctx.events.length - 1] as Extract<SimEvent, { type: 'call' }>;
    deliverSound(ctx, call);
  }
  if (b.radio) {
    const report = b.radio;
    b.radio = null;
    const c = commanderOf(ctx);
    if (!c) return;
    const id = c.camp.nextAir++;
    c.camp.airwaves.push({ id, report, speaker: g.id });
    ctx.schedule(C.netDelay, 'radio-deliver', id);
  }
}

export { REPORT_KINDS };
