import { intentFor, motorSystem, poseAt, type PoseSample } from '../body';
import { carryOut } from '../brain';
import { dcos, dsin } from '../kernel/core/detmath';
import { scheduleSystem, type ScheduleHandler, type System } from '../kernel/systems';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, raycast } from '../kernel/world/query';
import { Surface } from '../kernel/world/surfaces';
import { player } from './entities';
import { think } from './guards';
import { playerIntent } from './player';

/**
 * Sightline's tick: which lanes' systems run, in which phase (kernel/systems.ts, PHASES).
 * Each system declares what it reads, writes and emits, and the kernel refuses two systems
 * in a phase that touch the same data with no declared order between them.
 */

/** Handlers for scheduled entries. Empty until a lab schedules its first effect. */
export const SCHEDULE_HANDLERS: Readonly<Record<string, ScheduleHandler>> = {};

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0 };

/** The player's commands, resolved against what was on screen when they were given. */
const playerCommands: System = {
  name: 'player-commands',
  phase: 'commands',
  reads: ['input', 'player.body'],
  writes: [],
  emits: ['shot'],
  run(ctx) {
    const p = player(ctx.index);
    for (const c of ctx.input.commands) {
      if (c.kind === 'fire') {
        // The moment the player saw: `lag` ticks before this tick's start state.
        poseAt(p.body, c.lag, pose);
        const cp = dcos(c.pitch);
        ctx.emit({
          type: 'shot',
          source: p.id,
          t: (ctx.tick - 1 - c.lag) / ctx.tuning.sim.tickHz,
          x: pose.x,
          y: pose.y + pose.eyeHeight,
          z: pose.z,
          dx: -dsin(c.yaw) * cp,
          dy: dsin(c.pitch),
          dz: -dcos(c.yaw) * cp,
        });
      }
    }
  },
};

const look = emptyHit();

/**
 * Sandbox drops (A10): a noise dropped from the debug view lands where the player looked
 * when they pressed the key, along their view from the eye at that moment, and is heard by
 * the law of sound like any other. A command in the input, so a recording replays it.
 */
const sandboxDrops: System = {
  name: 'sandbox-drops',
  phase: 'commands',
  after: ['player-commands'],
  reads: ['input', 'player.body', '*.body', 'solid.solid'],
  writes: [],
  emits: ['noise'],
  run(ctx) {
    const p = player(ctx.index);
    const S = ctx.tuning.perception.sandbox;
    for (const c of ctx.input.commands) {
      if (c.kind !== 'noise') continue;
      poseAt(p.body, c.lag, pose);
      const cp = dcos(c.pitch);
      const dx = -dsin(c.yaw) * cp;
      const dy = dsin(c.pitch);
      const dz = -dcos(c.yaw) * cp;
      const hit = raycast(ctx.query(), pose.x, pose.y + pose.eyeHeight, pose.z, dx, dy, dz, S.reach, Blocks.Sight, look, p.id);
      if (hit.what === 'none') continue;
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
    const motor = { world: ctx.world, solids: ctx.solids, tick: ctx.tick, source: p.id, emit: ctx.emit };
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

export const SYSTEMS: readonly System[] = [scheduleSystem(SCHEDULE_HANDLERS), playerCommands, sandboxDrops, playerIntentSystem, guardOrders, motorSystem, guardBrains];
