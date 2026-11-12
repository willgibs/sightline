import { REPORT_KINDS, alertRung, createBrain, createCamp, digest, fuseShots, mapMass, navigatorOf, plan, spreadCamp, standStill, type CampMind, type CampOrder, type CampState, type Report, type Task, type Told, type Via } from '../brain';
import type { DebugDraw } from '../kernel/debugDraw';
import type { SimEvent } from '../kernel/events';
import { createBody } from '../body';
import { yawFromDirection } from '../kernel/core/math';
import { air } from '../kernel/env';
import { Faction, type EntityBase } from '../kernel/state';
import type { ScheduleHandler, System, TickContext } from '../kernel/systems';
import { Surface } from '../kernel/world/surfaces';
import { believe, createSenses, stimulate, type Percept } from '../perception';
import { boardingPoint, escapeRoute, yardRoute, routeSeconds, spawnTruck, truckRoute } from './camp';
import type { GuardEntity } from './entities';
import { startEngine } from './escape';
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
  // Ahead of the first tick: the first man sent up a ridge mustn't be what makes a frame late.
  navigatorOf(sim.world, sim.tuning).prepare();
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
  // An unverified report only stirs a guard if it's near him; farther ones just know of it.
  const near = (r.x - g.body.x) * (r.x - g.body.x) + (r.z - g.body.z) * (r.z - g.body.z) <= T.heardReach * T.heardReach;
  const full = r.kind === 'heard' && !near ? 0 : T.level[r.kind];
  // Someone else's word, weighed by how he knows it: a man who is only asking has a listener wary at most, whatever it's about.
  const level = r.sure ? full : Math.min(full, T.asking);
  if (level > 0) {
    const draw = (): number => ctx.draw(g.id, 'awareness', (rng) => rng.next());
    // And it bears out what the listener has noticed himself, as something plain does if the man saying it is sure (awareness.ts).
    stimulate(s.awareness, { kind: 'voice', level, x: r.x, y: r.y, z: r.z, cause, reason: 'voice', cue: 'voice', plain: r.sure === true }, ctx.tick, ctx.tuning, draw);
  }
  // Being told it's clear, that it's time to go, or that someone's moving or set, says nothing new about where an intruder is.
  if (r.kind !== 'clear' && r.kind !== 'escort' && r.kind !== 'moving' && r.kind !== 'set') {
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
      ch.next = ctx.tick + Math.round(T.retry * hz);
      // The operator needs the set and finds it dead (E7): once, until it's working again.
      const operator = ctx.index.of('guard').find((g) => ctx.world.camp.guards[g.guard.spawn]?.role === 'radio-operator');
      const device = (ctx.world.camp.devices ?? []).find((d) => d.kind === 'radio');
      if (operator && device && !camp.netWorking && !ch.deadReported) {
        ch.deadReported = true;
        const event = ctx.emit({ type: 'checkin', source: operator.id, post: operator.guard.spawn, stage: 'dead' });
        reportOutage(ctx, c, operator, device.x, device.y, device.z, event);
      }
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
  // A reinforcement has his own place: that's where someone goes to see.
  const reserve = c.camp.roster.find((m) => m.id === pending.guard)?.reserve;
  const x = reserve?.x ?? post.x;
  const z = reserve?.z ?? post.z;
  c.camp.inbox.push({ kind: 'missing', x, y: post.y, z, radius: ctx.tuning.brain.comms.radius.missing, tick: ctx.tick, from: pending.guard, fromX: x, fromZ: z, cause: silence });
};

const orders: CampOrder[] = [];

/**
 * Lockdown calls reinforcements (E8): a squad arrives up the camp's road after a delay, as
 * guards with senses and brains who hunt what the camp believes. Called once, by the
 * commander's system, at the first lockdown.
 */
export const reinforceArrive: ScheduleHandler = (ctx, entry) => {
  const c = commanderOf(ctx);
  if (!c) return;
  const route = truckRoute(ctx.world, ctx.tuning);
  if (route) {
    // A generated camp's come by truck, up its road (game/escape.ts).
    if (!spawnTruck(ctx, route, entry.b)) ctx.schedule(ctx.tuning.brain.reinforce.truck.holdOff, 'reinforce-arrive', 0, entry.b);
    return;
  }
  // A handmade camp has no road laid out: on foot, from the edge of the map.
  const T = ctx.tuning.brain.reinforce;
  const site = ctx.world.camp.site;
  const reach = Math.max(10, ctx.world.playHalf - T.edgeMargin);
  squadArrives(ctx, c, site.x + site.ux * reach, site.z + site.uz * reach, -site.ux, -site.uz, entry.b);
};

/** A reinforcement squad arrives at (x, z), facing (faceX, faceZ), and goes to hunt what the camp believes (E8). */
export function squadArrives(ctx: TickContext, c: CommanderEntity, x: number, z: number, faceX: number, faceZ: number, cause: number): void {
  const T = ctx.tuning.brain.reinforce;
  const site = ctx.world.camp.site;
  const post = ctx.world.camp.guards.findIndex((g) => g.role === 'patrol');
  for (let k = 0; k < T.count; k++) {
    const px = x + -faceZ * (k - (T.count - 1) / 2) * T.spread;
    const pz = z + faceX * (k - (T.count - 1) / 2) * T.spread;
    ctx.spawn((id): GuardEntity => {
      const body = createBody(ctx.world, ctx.solids, ctx.tuning.bodies.guard, px, pz, faceX, faceZ);
      const senses = createSenses(false);
      const brain = createBrain();
      // They were sent for because the alarm is up, and know it: the siren itself was over before they came in earshot.
      brain.sirenAt = ctx.tick;
      return { id, kind: 'guard', faction: Faction.Camp, body, guard: { spawn: post >= 0 ? post : 0, headYaw: 0, order: standStill(), reserve: { x: px, z: pz, yaw: yawFromDirection(faceX, faceZ) } }, senses, brain };
    });
  }
  const event = ctx.emit({ type: 'reinforce', source: c.id, cause, count: T.count, x, z });
  // They hunt: the camp's latest belief, by radio, as an order to go and search there. In a
  // camp that protects its target (brain/protect.ts), the first of them are what they were
  // called for: they go to his door to bring him out, and need no further order to.
  // With no vehicle for him there is nowhere to bring him out to, and he's safest where he is.
  // A camp that holds isn't bringing him out at all: its relief goes to his doors, and those are their posts from then on.
  const holds = c.camp.answer === 'hold';
  // Nor is there anyone to bring out once he's in his vehicle and away.
  const going = c.camp.objective?.status === 'escaping' || c.camp.objective?.status === 'escaped';
  const room = c.camp.devices.escape && !holds && !going ? c.camp.protects : undefined;
  const doors = holds ? keepDoors(ctx) : [];
  let fetchers = 0;
  let keepers = 0;
  for (const g of ctx.index.of('guard')) {
    if (!g.brain || g.guard.order.tick !== 0 || g.brain.act !== 'routine' || c.camp.roster.some((m) => m.id === g.id)) continue;
    const door = !c.camp.relief && keepers < ctx.tuning.brain.protect.answer.keepers ? doors[keepers] : undefined;
    if (door && g.guard.reserve) {
      keepers++;
      g.guard.reserve = door;
      c.camp.roster.push({ id: g.id, post: g.guard.spawn, x: g.body.x, z: g.body.z, tick: ctx.tick, status: 'ok', reserve: { x: door.x, z: door.z }, keeps: true });
      g.brain.task = { id: c.camp.nextTask++, kind: 'post', x: door.x, z: door.z, issued: ctx.tick, cause: event };
      continue;
    }
    c.camp.roster.push({ id: g.id, post: g.guard.spawn, x: g.body.x, z: g.body.z, tick: ctx.tick, status: 'ok', ...(g.guard.reserve ? { reserve: { x: g.guard.reserve.x, z: g.guard.reserve.z } } : {}) });
    if (room && !c.camp.relief && fetchers < ctx.tuning.brain.protect.fetchers) {
      fetchers++;
      g.brain.task = { id: c.camp.nextTask++, kind: 'fetch', x: room.x, z: room.z, ...(room.y === undefined ? {} : { y: room.y }), issued: ctx.tick, cause: event };
      continue;
    }
    // In a camp that hunts, with someone placed outside: they're men for a section, and the commander forms it (brain/commander.ts).
    if (c.camp.hunts && c.camp.threat) continue;
    const target = c.camp.search ?? (c.camp.shots.estimate ? { x: c.camp.shots.estimate.x, z: c.camp.shots.estimate.z } : { x: site.x, z: site.z });
    g.brain.task = { id: c.camp.nextTask++, kind: 'search', x: target.x, z: target.z, issued: ctx.tick, cause: event };
  }
  if (c.camp.protects && !c.camp.relief) c.camp.relief = { at: ctx.tick, fetches: fetchers > 0 ? 1 : 0, last: ctx.tick };
}

/** Where a man stands to hold each door of the target's building, facing out from it: a camp that holds posts its relief there. */
function keepDoors(ctx: TickContext): Array<{ x: number; z: number; yaw: number; door: true }> {
  const camp = ctx.world.camp;
  const hq = camp.layout?.buildings.find((b) => b.module === 'hq');
  if (!hq || !camp.doors) return [];
  const out = ctx.tuning.brain.protect.answer.doorPost;
  return hq.doors.map((k) => {
    const d = camp.doors![k]!;
    return { x: d.x - d.nx * out, z: d.z - d.nz * out, yaw: yawFromDirection(-d.nx, -d.nz), door: true as const };
  });
}

/**
 * The target reaches his vehicle at lockdown (E7). If it's been sabotaged he stays by it and
 * says so; otherwise he's in the cab, it drives out (game/escape.ts), and once it's away the
 * mission is lost. A camp with no vehicle entity (a handmade scene's) has him gone at once.
 */
export function targetEscapes(ctx: TickContext, g: GuardEntity): void {
  const c = commanderOf(ctx);
  if (!c?.camp.objective || c.camp.objective.target !== g.id) return;
  const vehicle = ctx.index.of('vehicle').find((v) => v.vehicle.escape);
  // A vehicle that can't get out of the yard is as much use as one that won't start.
  const spec = vehicle ? ctx.world.camp.vehicles?.[vehicle.vehicle.index] : undefined;
  const yard = vehicle && !vehicle.vehicle.disabled && !g.brain!.stranded ? (spec && ctx.world.camp.layout ? yardRoute(ctx.world, ctx.tuning, spec, ctx.work) : []) : null;
  if (vehicle && !yard) {
    if (!g.brain!.stranded) {
      g.brain!.stranded = true;
      reportOutage(ctx, c, g, vehicle.solid.x, g.body.y, vehicle.solid.z);
    }
    return;
  }
  const status = vehicle ? 'escaping' : 'escaped';
  c.camp.objective.status = status;
  const running = vehicle?.vehicle.running;
  c.camp.objective.left = { tick: ctx.tick, engine: running !== undefined && running <= ctx.tick ? running : -1, relief: c.camp.relief?.at ?? -1, siren: g.brain!.sirenAt };
  for (const o of ctx.index.of('objective')) if (o.objective.target === g.id) o.objective.status = status;
  if (vehicle) {
    vehicle.vehicle.driving = { route: [{ x: vehicle.solid.x, z: vehicle.solid.z }, ...yard!, ...escapeRoute(ctx.world, ctx.tuning)], leg: 1, waited: 0, then: 'escape', cause: 0 };
    vehicle.vehicle.rider = { spawn: g.guard.spawn };
    // It has left its place, and the camp's men can see that: there's nothing standing there to start, or to run to.
    c.camp.devices.escape = null;
  }
  ctx.despawn(g.id);
}

/**
 * A man of a camp that bolts has reached its vehicle and has his hand on the starter
 * (brain/protect.ts). It starts, and is heard from the next tick (game/escape.ts); or it's
 * been sabotaged, and he says so, as the target does when he finds it dead.
 */
export function startsVehicle(ctx: TickContext, g: GuardEntity): void {
  const c = commanderOf(ctx);
  const vehicle = ctx.index.of('vehicle').find((v) => v.vehicle.escape);
  // It has to be there to be started: one that has driven off isn't.
  const box = vehicle?.solid as { hx?: number; hz?: number } | undefined;
  const reach = ctx.tuning.brain.alarm.flee.arrive + Math.sqrt((box?.hx ?? 0) * (box?.hx ?? 0) + (box?.hz ?? 0) * (box?.hz ?? 0)) + ctx.tuning.bodies.guard.radius;
  if (!c || !vehicle || vehicle.vehicle.driving || (vehicle.solid.x - g.body.x) * (vehicle.solid.x - g.body.x) + (vehicle.solid.z - g.body.z) * (vehicle.solid.z - g.body.z) > reach * reach) return;
  if (startEngine(ctx, vehicle) || g.brain!.stranded) return;
  g.brain!.stranded = true;
  reportOutage(ctx, c, g, vehicle.solid.x, g.body.y, vehicle.solid.z);
  // Word of it gets round: the camp has no vehicle, so nobody else runs to it, and nobody is sent to bring him out to it.
  c.camp.devices.escape = null;
}

/** Someone found the camp's equipment dead and says so: it reaches the camp whether or not the radio works, because the set is what's dead. */
function reportOutage(ctx: TickContext, c: CommanderEntity, g: GuardEntity, x: number, y: number, z: number, cause = 0): void {
  c.camp.inbox.push({ kind: 'outage', x, y, z, radius: ctx.tuning.brain.comms.radius.outage, tick: ctx.tick, from: g.id, fromX: g.body.x, fromZ: g.body.z, cause });
}

/** Gives the camp its devices, from where they stand: the lab's handmade camp; lab D's camps give them by world.camp.devices. */
export function giveDevices(sim: Simulation, alarms: ReadonlyArray<{ x: number; z: number }>, escape?: { x: number; z: number }): void {
  const c = sim.index.of('commander')[0];
  if (!c) return;
  for (const a of alarms) c.camp.devices.alarms.push({ x: a.x, z: a.z, raised: false, powered: true });
  if (escape) c.camp.devices.escape = { x: escape.x, z: escape.z };
}

/**
 * Gives the camp the equipment a generated camp came with (lab D, D5): its alarm boxes, in
 * the order of world.camp.devices, the place the target gets into his vehicle, and the
 * objective's target. `campDevices` keeps the camp's record current from then on.
 */
export function giveCampDevices(sim: Simulation): void {
  const c = sim.index.of('commander')[0];
  if (!c) return;
  const camp = sim.world.camp;
  (camp.devices ?? []).forEach((d, device) => {
    if (d.kind === 'alarm') c.camp.devices.alarms.push({ x: d.x, z: d.z, raised: false, powered: true, device });
  });
  const o = camp.objective;
  const vehicle = o ? camp.vehicles?.[o.vehicle] : undefined;
  if (vehicle) c.camp.devices.escape = boardingPoint(sim.world, vehicle, sim.tuning);
  // His way across the yard is found now, ahead of the first tick: the moment he gets in mustn't be a late frame.
  if (vehicle && camp.layout) yardRoute(sim.world, sim.tuning, vehicle);
  const objective = sim.index.of('objective')[0];
  if (objective) giveObjective(sim, objective.objective.target);
}

/**
 * The camp's equipment as it stands (lab D's entities, game/camp.ts): whether each alarm box
 * has power, whether the generator runs, whether the radio works. Lab D's entities hold the
 * one answer; this keeps the commander's copy of it, so a cut is felt in the tick it happens.
 * A camp with no such entities (a handmade scene's) keeps what its scene gave it.
 */
export const campDevices: System = {
  name: 'camp-devices',
  phase: 'world',
  after: ['camp-power'],
  reads: ['alarm.alarm', 'radio.radio', 'generator.generator', 'commander.camp'],
  writes: ['commander.camp.devices', 'commander.camp.netWorking'],
  emits: [],
  run(ctx) {
    const c = commanderOf(ctx);
    if (!c) return;
    const camp = c.camp;
    for (const a of ctx.index.of('alarm')) {
      const box = camp.devices.alarms.find((x) => x.device === a.alarm.device);
      if (box) box.powered = a.alarm.powered;
    }
    const generators = ctx.index.of('generator');
    if (generators.length > 0) camp.devices.generatorRunning = generators.some((g) => g.generator.running);
    const radios = ctx.index.of('radio');
    if (radios.length > 0) camp.netWorking = radios.some((r) => r.radio.powered && r.radio.working);
  },
};

/** Names the mission's target (E7): the entity whose death is the objective, and who runs for the vehicle at lockdown. */
export function giveObjective(sim: Simulation, target: number): void {
  const c = sim.index.of('commander')[0];
  if (c) c.camp.objective = { target, status: 'open' };
}

/** Cuts the camp's power, from a script: a generated camp's generator stops, and a handmade camp's alarm boxes go dead. */
export function cutPower(sim: Simulation): void {
  const generators = sim.index.of('generator');
  if (generators.length > 0) {
    for (const g of generators) g.generator.running = false;
    return;
  }
  const c = sim.index.of('commander')[0];
  if (!c) return;
  c.camp.devices.generatorRunning = false;
  for (const a of c.camp.devices.alarms) a.powered = false;
}

/**
 * A guard reaches an alarm box and throws the switch: raised if it has power and isn't
 * already (lockdown is set by the box's change, E7), or found dead (the power is off).
 * Either way it is a physical event, interruptible by dropping the runner or cutting
 * the power before he arrives.
 */
export function raiseAlarm(ctx: TickContext, g: GuardEntity): void {
  const c = commanderOf(ctx);
  const b = g.brain;
  if (!c || !b) return;
  const box = c.camp.devices.alarms[b.box];
  if (!box) return;
  // The siren is going: a second box adds nothing to it. A man who gets to one and finds the alarm already up knows it now,
  // whether or not he heard it: through enough walls he may not have.
  if (c.camp.devices.alarms.some((a) => a.raised)) {
    if (b.sirenAt < 0) b.sirenAt = ctx.tick;
    return;
  }
  if (!box.powered) {
    const dead = ctx.emit({ type: 'alarm', source: g.id, cause: b.event, box: b.box, stage: 'dead' });
    reportOutage(ctx, c, g, box.x, g.body.y, box.z, dead);
    // He knows now, and knows where the others are: the next run is for one of those.
    if (!b.deadBoxes?.includes(b.box)) (b.deadBoxes ??= []).push(b.box);
    return;
  }
  box.raised = true;
  for (const a of ctx.index.of('alarm')) if (a.alarm.device === box.device) a.alarm.raised = true;
  const raised = ctx.emit({ type: 'alarm', source: g.id, cause: b.event, box: b.box, stage: 'raised' });
  const was = c.camp.level;
  c.camp.level = 'lockdown';
  c.camp.since = ctx.tick;
  if (was !== 'lockdown') ctx.emit({ type: 'level', source: c.id, cause: raised, from: was, to: 'lockdown' });
  const R = ctx.tuning.brain.alarm.sirenRadius;
  const y = ctx.world.terrain.heightAt(box.x, box.z) + ctx.tuning.brain.alarm.sirenHeight;
  ctx.emit({ type: 'siren', source: c.id, cause: raised, x: box.x, y, z: box.z, surface: Surface.Metal, loudness: R / ctx.tuning.noise.radiusPerUnit, radius: R });
  deliverSound(ctx, ctx.events[ctx.events.length - 1] as Extract<SimEvent, { type: 'siren' }>);
}

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
    fuseShots(camp, ctx.tick, ctx.tuning);
    spreadCamp(camp, ctx.tick, ctx.tuning, ctx.world);
    const T = ctx.tuning.brain.camp;
    const hz = ctx.tuning.sim.tickHz;
    const officer = campHasOfficer(ctx);
    const every = Math.max(1, Math.round((officer ? T.planEvery : T.noOfficerEvery) * hz));
    if (ctx.tick - camp.planned >= every) {
      camp.planned = ctx.tick;
      const mind: CampMind = { camp, world: ctx.world, tuning: ctx.tuning, tick: ctx.tick, time: ctx.tick / hz, officer, work: ctx.work };
      plan(mind, orders);
      for (const o of orders) sendOrder(ctx, c, o.guard, o.task);
    }
    if (camp.level !== before) ctx.emit({ type: 'level', source: c.id, cause: camp.lastCause, from: before, to: camp.level });
    // Lockdown calls reinforcements, once. A camp that protects its target calls them to bring
    // him out, and that call is the radio's: with no set or nobody on it, it waits until there is.
    if (camp.level === 'lockdown' && camp.reinforceCalled < 0 && (!camp.protects || radioUp(ctx, c))) {
      camp.reinforceCalled = ctx.tick;
      // They're due at the gate after the delay, so a truck sets off that much sooner than its drive.
      const route = truckRoute(ctx.world, ctx.tuning);
      ctx.schedule(Math.max(1, ctx.tuning.brain.reinforce.delay - (route ? routeSeconds(route, ctx.tuning) : 0)), 'reinforce-arrive', 0, camp.lastCause);
    }
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
  const b = g.brain;
  // A man bringing the target out, readying his way out or on his way to hold his door finishes that: a lesser order isn't taken.
  if (b.task && forTheTarget(b.task.kind) && !forTheTarget(task.kind)) return;
  b.task = { id: task.id, kind: task.kind, x: task.x, z: task.z, ...(task.y === undefined ? {} : { y: task.y }), issued: ctx.tick, cause: task.cause, ...(task.hunt ? { hunt: { ...task.hunt, men: [...task.hunt.men], watch: [...task.hunt.watch] } } : {}) };
  // A new order starts afresh, even mid-task: not the old one's linger, its sweep or its cover.
  b.linger = -1;
  b.until = -1;
  b.covered = false;
  b.routed = -1;
  // The order is news to him: he reconsiders now.
  b.thinkAt = ctx.tick;
};

/** The orders that are about the target himself (brain/protect.ts), which nothing else displaces. */
function forTheTarget(kind: Task['kind']): boolean {
  return kind === 'fetch' || kind === 'escort' || kind === 'start' || kind === 'post';
}

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
  if (b.whistle) {
    // The first man who gets moving blows it. It needs no power and no radio, and it carries.
    b.whistle = false;
    const camp = commanderOf(ctx)?.camp;
    const W = ctx.tuning.brain.fight.whistle;
    if (camp && (camp.whistled === undefined || ctx.tick - camp.whistled >= Math.round(W.every * ctx.tuning.sim.tickHz))) {
      camp.whistled = ctx.tick;
      const body = g.body;
      ctx.emit({ type: 'whistle', source: g.id, x: body.x, y: body.y + body.eyeHeight - ctx.tuning.perception.hearing.lift, z: body.z, surface: Surface.Grass, loudness: W.radius / ctx.tuning.noise.radiusPerUnit, radius: W.radius });
      deliverSound(ctx, ctx.events[ctx.events.length - 1] as Extract<SimEvent, { type: 'whistle' }>);
    }
  }
  if (b.say) {
    const { report, radius, radio } = b.say;
    b.say = null;
    const body = g.body;
    const y = body.y + body.eyeHeight - ctx.tuning.perception.hearing.lift;
    const id = ctx.emit({ type: 'call', source: g.id, cause: report.cause, x: body.x, y, z: body.z, surface: Surface.Grass, loudness: radius / ctx.tuning.noise.radiusPerUnit, radius, radio: radio ? 1 : 0, say: report.kind });
    const c = commanderOf(ctx);
    if (c) c.camp.voices.push({ event: id, report, heardUntil: ctx.tick + Math.round((radius / air(ctx.world.spec.env).speedOfSound + 1) * ctx.tuning.sim.tickHz) });
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
