import { eyeOf, intentFor, motorSystem, poseAt, requestStance, type PoseSample } from '../body';
import { carryOut, type NavAllowance } from '../brain';
import { dcos, dsin } from '../kernel/core/detmath';
import { Faction } from '../kernel/state';
import { scheduleSystem, type Access, type ScheduleHandler, type System, type TickContext } from '../kernel/systems';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, IGNORE_CROWNS, raycast } from '../kernel/world/query';
import { Surface } from '../kernel/world/surfaces';
import { campPower, objectiveStatus } from './camp';
import { player } from './entities';
import { drawBrain } from './brains';
import { guardFire } from './combat';
import { checkinDeadline, checkinReply, commanderOf, orderDeliver, radioDeliver, raiseAlarm, reinforceArrive, speak, startsVehicle, targetEscapes } from './comms';
import { think } from './guards';
import { playerIntent } from './player';
import { PERCEPTION } from './perception';
import { SHOOTING_SYSTEMS } from './shooting';
import { guardDoors } from './doors';
import { carriedSystem, useSystem } from './use';

/**
 * Sightline's tick: which lanes' systems run, in which phase (kernel/systems.ts, PHASES).
 * Each system declares what it reads, writes and emits, and the kernel refuses two systems
 * in a phase that touch the same data with no declared order between them.
 */

/** Handlers for scheduled entries, by kind (kernel/schedule.ts): a radio call's delivery, and what later labs schedule. */
export const SCHEDULE_HANDLERS: Readonly<Record<string, ScheduleHandler>> = {
  'radio-deliver': radioDeliver,
  'order-deliver': orderDeliver,
  'checkin-reply': checkinReply,
  'checkin-deadline': checkinDeadline,
  'reinforce-arrive': reinforceArrive,
};

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0, lean: 0, axis: 0, lying: 0, riseHead: 0, risePelvis: 0, riseFeet: 0 };
const eye = { x: 0, y: 0, z: 0 };

/**
 * The player's commands, resolved against what was on screen when they were given. A
 * player with no rifle (the valley, until Phase 2) fires a bare shot, a line with no
 * bullet; a rifle's commands are the 'rifle' system's (shooting.ts).
 */
const playerCommands: System = {
  name: 'player-commands',
  phase: 'commands',
  reads: ['input', 'player.body', 'player.rifle'],
  writes: [],
  emits: ['shot'],
  run(ctx) {
    const p = player(ctx.index);
    if (p.rifle) return;
    for (const c of ctx.input.commands) {
      if (c.kind === 'fire') {
        // The moment the player saw: `lag` ticks before this tick's start state.
        poseAt(p.body, c.lag, pose);
        pose.yaw = c.yaw; // a lean is to the side of the facing the player saw
        eyeOf(pose, ctx.tuning.bodies.player, eye);
        const cp = dcos(c.pitch);
        ctx.emit({
          type: 'shot',
          source: p.id,
          t: (ctx.tick - 1 - c.lag) / ctx.tuning.sim.tickHz,
          x: eye.x,
          y: eye.y,
          z: eye.z,
          dx: -dsin(c.yaw) * cp,
          dy: dsin(c.pitch),
          dz: -dcos(c.yaw) * cp,
          speed: 0,
          drag: 0,
          wx: 0,
          wz: 0,
        });
      }
    }
  },
};

const look = emptyHit();

/**
 * Sandbox drops (A10, A9): a noise or a body dropped from the debug view lands where the
 * player looked when they pressed the key, along their view from the eye at that moment.
 * The noise is heard by the law of sound like any other; the body lies there already down,
 * for a guard to find. Commands in the input, so a recording replays them.
 */
const sandboxDrops: System = {
  name: 'sandbox-drops',
  phase: 'commands',
  after: ['player-commands', 'rifle'],
  reads: ['input', 'player.body', '*.body', 'solid.solid'],
  writes: ['entities'],
  emits: ['noise'],
  run(ctx) {
    const p = player(ctx.index);
    const S = ctx.tuning.perception.sandbox;
    for (const c of ctx.input.commands) {
      if (c.kind !== 'noise' && c.kind !== 'bodyDrop') continue;
      poseAt(p.body, c.lag, pose);
      const cp = dcos(c.pitch);
      const dx = -dsin(c.yaw) * cp;
      const dy = dsin(c.pitch);
      const dz = -dcos(c.yaw) * cp;
      const hit = raycast(ctx.query(), pose.x, pose.y + pose.eyeHeight, pose.z, dx, dy, dz, S.reach, Blocks.Sight, look, p.id, IGNORE_CROWNS); // a tool that drops something on the ground, through the branches
      if (hit.what === 'none') continue;
      if (c.kind === 'bodyDrop') {
        const t = ctx.tick / ctx.tuning.sim.tickHz;
        const eye = ctx.tuning.bodies.guard.eyeHeight.prone;
        ctx.spawn((id) => ({ id, kind: 'remains' as const, faction: Faction.Camp, remains: { of: 0, post: -1, x: hit.x, y: hit.y, z: hit.z, yaw: c.yaw, eye, vx: 0, vz: 0, fell: t - ctx.tuning.ballistics.hits.collapseTime, part: 'torso' as const, carriedBy: 0, hidden: false } }));
        continue;
      }
      ctx.emit({
        type: 'noise',
        source: p.id,
        t: (ctx.tick - 1 - c.lag) / ctx.tuning.sim.tickHz,
        x: hit.x,
        y: hit.y,
        z: hit.z,
        surface: hit.surface ?? Surface.Gravel,
        loudness: S.noise / ctx.tuning.noise.radiusPerUnit,
        radius: S.noise,
      });
    }
  },
};

/** The player's controls: input becomes the body's intent, and starts any stance change it asks for. */
const playerIntentSystem: System = {
  name: 'player-intent',
  phase: 'intent',
  reads: ['input', 'player.body', 'solid.solid'],
  writes: ['player.control', 'player.body.stance', 'player.body.stanceTimer', 'player.body.stanceDuration', 'player.body.proneTransition', 'player.body.eyeFrom', '@intents.player'],
  emits: ['stance'],
  run(ctx) {
    const p = player(ctx.index);
    const motor = { world: ctx.world, solids: ctx.solids, tick: ctx.tick, source: p.id, emit: ctx.emit, dt: ctx.dt, tuning: ctx.tuning };
    playerIntent(p.body, p.control, ctx.input, ctx.tuning.bodies.player, motor, intentFor(ctx, p.id));
  },
};

/** Every guard carries out his current order: what his body intends this tick, where he turns his head, and whether he gets down or up. */
const guardOrders: System = {
  name: 'guard-orders',
  phase: 'intent',
  after: ['player-intent'],
  reads: ['guard.guard.order', 'guard.guard.aside', 'guard.body', 'solid.solid'],
  writes: ['guard.guard.headYaw', 'guard.guard.aside', '@intents.guard', 'guard.body'],
  emits: ['stance'],
  run(ctx) {
    const speed = ctx.tuning.bodies.guard.speed;
    for (const g of ctx.index.of('guard')) {
      const intent = intentFor(ctx, g.id);
      g.guard.headYaw = carryOut(g.guard.order, ctx.tick, intent);
      // In the way of the camp's own vehicle: on his feet and off its line, whatever he was doing.
      const aside = g.guard.aside;
      if (aside && ctx.tick >= aside.until) delete g.guard.aside;
      else if (aside) {
        intent.wishX = aside.x * speed.walk * 2;
        intent.wishZ = aside.z * speed.walk * 2;
        intent.gait = 'walk';
      }
      const want = g.guard.aside ? 'stand' : (g.guard.order.stance ?? 'stand');
      if (g.body.stance !== want && !g.body.proneTransition) requestStance(g.body, want, ctx.tuning.bodies.guard, { world: ctx.world, solids: ctx.solids, source: g.id, emit: ctx.emit });
      // An order says how fast he'd like to go. His legs say how fast he can, down or getting up.
      const limit = g.body.proneTransition ? 0 : g.body.stance === 'prone' ? speed.crawl : g.body.stance === 'crouch' ? speed.crouch : Infinity;
      const wish = Math.sqrt(intent.wishX * intent.wishX + intent.wishZ * intent.wishZ);
      if (wish > limit) {
        intent.wishX *= limit / wish;
        intent.wishZ *= limit / wish;
      }
    }
  },
};

/**
 * Every guard's brain decides his order for the next tick, after the world has moved and
 * been perceived: lab E's brain where the camp brain runs (a guard with `brain`), lab A's
 * minimal reactions where only perception does, otherwise the routine (brain lane). Each
 * decides from his mind alone: the perception boundary (brain/mind.ts). A change of what
 * he's doing is an 'act', with its reason and its cause.
 */
const guardBrains: System = {
  name: 'guard-brains',
  phase: 'decide',
  reads: ['guard.body', 'guard.guard.spawn', 'guard.guard.headYaw', 'guard.guard.reserve', 'guard.senses', 'guard.brain'],
  writes: ['guard.guard.order', 'guard.brain', 'rng.brain', 'rng.hearing', 'rng.aim', 'guard.senses.heard', 'commander.camp.voices', 'commander.camp.airwaves', 'commander.camp.nextAir', 'commander.camp.devices', 'commander.camp.level', 'commander.camp.since', 'commander.camp.objective', 'commander.camp.inbox', 'commander.camp.whistled', 'alarm.alarm.raised', 'objective.objective.status', 'vehicle.vehicle', 'schedule', 'entities', 'bullet.bullet'],
  emits: ['act', 'call', 'shot', 'report', 'held', 'shift', 'alarm', 'siren', 'level', 'whistle'],
  run(ctx) {
    const nav = navAllowance(ctx);
    const devices = commanderOf(ctx)?.camp.devices;
    // Where the boxes stand, and nothing of their state: a guard learns the alarm is up from the siren.
    const facts = devices ? { alarms: devices.alarms.map((a) => ({ x: a.x, z: a.z })), escape: devices.escape, fights: commanderOf(ctx)?.camp.fights === true, firefight: commanderOf(ctx)?.camp.firefight === true, hunts: commanderOf(ctx)?.camp.hunts === true, chases: commanderOf(ctx)?.camp.chases === true, places: commanderOf(ctx)?.camp.places === true, shifts: commanderOf(ctx)?.camp.shifts === true, protects: commanderOf(ctx)?.camp.protects ?? null, answer: commanderOf(ctx)?.camp.answer ?? null } : undefined;
    for (const g of [...ctx.index.of('guard')]) {
      const change = think(g, ctx.world, ctx.tuning, ctx.tick + 1, () => ctx.draw(g.id, 'brain', (rng) => rng.next()), nav, facts);
      if (change) {
        g.brain!.event = ctx.emit({ type: 'act', source: g.id, cause: change.cause, from: change.from, to: change.to, why: change.why, x: change.x, z: change.z, weight: change.weight });
      }
      if (g.brain) {
        // A pace he has just decided on, for a clear line past one of his own (brain/firefight.ts): which way, and how far.
        const shift = g.brain.ff?.shift;
        if (shift && shift.at === ctx.tick + 1) ctx.emit({ type: 'shift', source: g.id, cause: g.brain.event, mate: shift.mate, side: shift.side, pace: shift.pace });
        if (g.brain.fire) {
          // What a man knows of his own trigger: that he didn't pull it, because one of his own was in front of his rifle. In a camp
          // whose men shift for a clear line, what he saw of that man over his sights, too (brain.ts, `HeldLine`).
          const camp = commanderOf(ctx)?.camp;
          const line = camp?.shifts ? { tick: 0, mate: 0, side: 1, off: 0, along: 0 } : undefined;
          if (!guardFire(ctx, g, g.brain.fire, line) && camp?.mates) {
            g.brain.held = ctx.tick;
            if (line) g.brain.heldLine = line;
          }
          g.brain.fire = null;
        }
        if (g.brain.raise >= 0) {
          raiseAlarm(ctx, g);
          g.brain.raise = -1;
        }
        if (g.brain.start) {
          g.brain.start = false;
          startsVehicle(ctx, g);
        }
        if (g.brain.aboard) targetEscapes(ctx, g);
        speak(ctx, g);
        ctx.debug((draw) => drawBrain(draw, ctx, g));
      }
    }
  },
};

/** What the tick's guards may spend on routes (rule 18): a fresh allowance every tick, shared in id order. */
function navAllowance(ctx: TickContext): NavAllowance {
  return ctx.channel('nav', () => ({ work: ctx.work, searches: { left: ctx.tuning.brain.nav.searchesPerTick }, nodesAtStart: ctx.work.nodes, raysAtStart: ctx.work.rays }));
}

/** What the schedule's handlers touch beyond the schedule (kernel/systems.ts, scheduleSystem). */
const SCHEDULED_ACCESS = {
  reads: ['commander.camp', 'guard', 'solid.solid'],
  writes: ['commander.camp', 'guard.brain', 'guard.senses.awareness', 'guard.senses.belief', 'rng.awareness', 'entities', 'guard.body', 'vehicle.vehicle'],
  emits: ['radio', 'checkin', 'reinforce'],
} as const satisfies Access;

export const SYSTEMS: readonly System[] = [
  scheduleSystem(SCHEDULE_HANDLERS, SCHEDULED_ACCESS),
  playerCommands,
  SHOOTING_SYSTEMS.rifle,
  sandboxDrops,
  useSystem,
  playerIntentSystem,
  guardOrders,
  motorSystem,
  carriedSystem,
  SHOOTING_SYSTEMS.bullets,
  SHOOTING_SYSTEMS.thrown,
  SHOOTING_SYSTEMS.aim,
  campPower,
  // Perception (lab A, in the valley since A13): after everything has moved, before anyone decides.
  ...PERCEPTION,
  guardBrains,
  guardDoors,
  objectiveStatus,
];
