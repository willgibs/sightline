import { intentFor, motorSystem, poseAt, type PoseSample } from '../body';
import { carryOut, type NavAllowance } from '../brain';
import { dcos, dsin } from '../kernel/core/detmath';
import { scheduleSystem, type Access, type ScheduleHandler, type System, type TickContext } from '../kernel/systems';
import { player } from './entities';
import { drawBrain } from './brains';
import { orderDeliver, radioDeliver, speak } from './comms';
import { think } from './guards';
import { playerIntent } from './player';
import { SHOOTING_SYSTEMS } from './shooting';

/**
 * Sightline's tick: which lanes' systems run, in which phase (kernel/systems.ts, PHASES).
 * Each system declares what it reads, writes and emits, and the kernel refuses two systems
 * in a phase that touch the same data with no declared order between them.
 */

/** Handlers for scheduled entries, by kind (kernel/schedule.ts): a radio call's delivery, and what later labs schedule. */
export const SCHEDULE_HANDLERS: Readonly<Record<string, ScheduleHandler>> = {
  'radio-deliver': radioDeliver,
  'order-deliver': orderDeliver,
};

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0 };

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
 * been perceived: lab E's brain where the camp brain runs (a guard with `brain`), lab A's
 * minimal reactions where only perception does, otherwise the routine (brain lane). Each
 * decides from his mind alone: the perception boundary (brain/mind.ts). A change of what
 * he's doing is an 'act', with its reason and its cause.
 */
const guardBrains: System = {
  name: 'guard-brains',
  phase: 'decide',
  reads: ['guard.body', 'guard.guard.spawn', 'guard.guard.headYaw', 'guard.senses', 'guard.brain'],
  writes: ['guard.guard.order', 'guard.brain', 'rng.brain', 'rng.hearing', 'guard.senses.heard', 'commander.camp.voices', 'commander.camp.airwaves', 'commander.camp.nextAir', 'schedule'],
  emits: ['act', 'call'],
  run(ctx) {
    const nav = navAllowance(ctx);
    for (const g of ctx.index.of('guard')) {
      const change = think(g, ctx.world, ctx.tuning, ctx.tick + 1, () => ctx.draw(g.id, 'brain', (rng) => rng.next()), nav);
      if (change) {
        g.brain!.event = ctx.emit({ type: 'act', source: g.id, cause: change.cause, from: change.from, to: change.to, why: change.why, x: change.x, z: change.z, weight: change.weight });
      }
      if (g.brain) {
        speak(ctx, g);
        ctx.debug((draw) => drawBrain(draw, ctx, g));
      }
    }
  },
};

/** What the tick's guards may spend on routes (rule 18): a fresh allowance every tick, shared in id order. */
function navAllowance(ctx: TickContext): NavAllowance {
  return ctx.channel('nav', () => ({ work: ctx.work, searches: { left: ctx.tuning.brain.nav.searchesPerTick } }));
}

/** What the schedule's handlers touch beyond the schedule (kernel/systems.ts, scheduleSystem). */
const SCHEDULED_ACCESS = {
  reads: ['commander.camp', 'guard.senses', 'guard.brain', 'guard.guard.spawn'],
  writes: ['commander.camp', 'guard.brain.told', 'guard.brain.task', 'guard.brain.thinkAt', 'guard.senses.awareness', 'guard.senses.belief', 'rng.awareness'],
  emits: ['radio'],
} as const satisfies Access;

export const SYSTEMS: readonly System[] = [
  scheduleSystem(SCHEDULE_HANDLERS, SCHEDULED_ACCESS),
  playerCommands,
  SHOOTING_SYSTEMS.rifle,
  playerIntentSystem,
  guardOrders,
  motorSystem,
  SHOOTING_SYSTEMS.bullets,
  SHOOTING_SYSTEMS.thrown,
  SHOOTING_SYSTEMS.aim,
  guardBrains,
];
