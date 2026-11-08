import { eyeOf, intentFor, motorSystem, poseAt, type PoseSample } from '../body';
import { carryOut } from '../brain';
import { dcos, dsin } from '../kernel/core/detmath';
import { scheduleSystem, type ScheduleHandler, type System } from '../kernel/systems';
import { player } from './entities';
import { think } from './guards';
import { playerIntent } from './player';
import { SHOOTING_SYSTEMS } from './shooting';
import { carriedSystem, useSystem } from './use';

/**
 * Sightline's tick: which lanes' systems run, in which phase (kernel/systems.ts, PHASES).
 * Each system declares what it reads, writes and emits, and the kernel refuses two systems
 * in a phase that touch the same data with no declared order between them.
 */

/** Handlers for scheduled entries. Empty until a lab schedules its first effect. */
export const SCHEDULE_HANDLERS: Readonly<Record<string, ScheduleHandler>> = {};

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

/** Every guard carries out his current order: what his body intends this tick, and where he turns his head. */
const guardOrders: System = {
  name: 'guard-orders',
  phase: 'intent',
  reads: ['guard.guard.order'],
  writes: ['guard.guard.headYaw', '@intents.guard'],
  emits: [],
  run(ctx) {
    for (const g of ctx.index.of('guard')) g.guard.headYaw = carryOut(g.guard.order, ctx.tick, intentFor(ctx, g.id));
  },
};

/**
 * Every guard's brain decides his order for the next tick, after the world has moved and
 * been perceived: today, keep to the routine (brain lane), until lab E's brain can pull
 * him off it. Each decides from his mind alone: the perception boundary (brain/mind.ts).
 */
const guardBrains: System = {
  name: 'guard-brains',
  phase: 'decide',
  reads: ['guard.body', 'guard.guard.spawn', 'guard.guard.headYaw', 'guard.senses'],
  writes: ['guard.guard.order'],
  emits: [],
  run(ctx) {
    for (const g of ctx.index.of('guard')) think(g, ctx.world, ctx.tuning, ctx.tick + 1);
  },
};

export const SYSTEMS: readonly System[] = [
  scheduleSystem(SCHEDULE_HANDLERS),
  playerCommands,
  SHOOTING_SYSTEMS.rifle,
  useSystem,
  playerIntentSystem,
  guardOrders,
  motorSystem,
  carriedSystem,
  SHOOTING_SYSTEMS.bullets,
  SHOOTING_SYSTEMS.thrown,
  SHOOTING_SYSTEMS.aim,
  guardBrains,
];
