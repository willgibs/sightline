import type { Tuning } from '../config/tuning';
import { dcos, dsin } from './core/detmath';
import type { Rng } from './core/rng';
import type { BodySpec, BodyState } from './motor/body';
import { guardIntent } from './entities/guards';
import { playerIntent } from './entities/player';
import type { EventDraft } from './events';
import type { World } from './gen/world';
import type { TickInput } from './input';
import { bodyHeight, poseAt, type PoseSample } from './motor/body';
import { idleIntent, stepMotor, type Cylinder, type MoveIntent } from './motor/motor';
import { popDue, scheduleAt, ticksAfter, type Scheduled } from './schedule';
import { hasBody, type EntityId, type GuardEntity, type PlayerEntity, type SimState } from './state';
import type { Solids } from './world/solids';

/**
 * The order of a tick.
 *
 * Every system belongs to one phase, and the phases run in this order on every tick.
 * The order is a contract between the labs: perception sees the world after everything
 * has moved this tick, brains decide after perceiving, and what they decide moves bodies
 * from the next tick, one tick (33 ms) after the stimulus. Reordering changes every
 * recording and every tuned reaction time, so it happens only deliberately, with a
 * SIM_VERSION bump and a line in docs/decisions.md.
 *
 * Add a system by adding it to SYSTEMS in its phase, never by calling it from step().
 */
export const PHASES = [
  'schedule', // delayed effects that fall due this tick: radio calls, reinforcements, timers
  'commands', // the player's timed commands, resolved against what they saw (M4)
  'intent', // what every body wants to do: the player's from input, guards' from their orders
  'motor', // every body moves
  'projectiles', // shots fly and hit (lab B)
  'world', // doors, vehicles, the clock and the wind (M6)
  'perception', // guards sense the world as it now is (lab A)
  'awareness', // what they sensed becomes suspicion and belief (lab A)
  'camp', // alarms, the radio net, the camp acting together (lab E)
  'decide', // brains choose orders, which move bodies from the next tick (lab E)
  'mission', // the ruleset: objectives, outcome, score (Phase 2)
] as const;

export type Phase = (typeof PHASES)[number];

/** The entities systems work on, by kind, in id order. Rebuilt from the state tree. */
export interface EntityIndex {
  player: PlayerEntity;
  guards: GuardEntity[];
}

/** What every system sees while a tick runs. */
export interface TickContext {
  readonly world: World;
  /** Everything solid now: the world's colliders and entities' shapes (world/solids.ts). */
  readonly solids: Solids;
  readonly tuning: Tuning;
  /** Seconds per tick. */
  readonly dt: number;
  /** The tick being computed: 1 for the first. */
  readonly tick: number;
  readonly state: SimState;
  readonly index: EntityIndex;
  /** This tick's input, already quantized. */
  readonly input: TickInput;

  /** What each body wants this tick, by entity id: written in 'intent', read in 'motor'. */
  readonly intents: Map<EntityId, MoveIntent>;
  /** Records an event and returns its id, for the events it causes. */
  emit(e: EventDraft): number;
  /** Schedules `kind` to run in the 'schedule' phase `seconds` from now (at least one tick). */
  schedule(seconds: number, kind: string, a?: number, b?: number): void;
  /**
   * Draws from an entity's own random stream for a purpose, kept in the state tree. A
   * stream belongs to one entity, so what one guard draws never shifts another's
   * numbers. Use the Rng only inside `use`.
   */
  draw<T>(id: EntityId, purpose: string, use: (rng: Rng) => T): T;
}

export interface System {
  readonly name: string;
  readonly phase: Phase;
  /** Runs this many times a second; the tick rate must be a multiple of it. Default: every tick. */
  readonly hz?: number;
  /** `dt` is the time since this system last ran: the tick's, or longer for a slower system. */
  run(ctx: TickContext, dt: number): void;
}

/** What a scheduled entry does when it falls due, by kind. */
export type ScheduleHandler = (ctx: TickContext, entry: Scheduled) => void;

/** Handlers for scheduled entries. Empty until a lab schedules its first effect. */
export const SCHEDULE_HANDLERS: Readonly<Record<string, ScheduleHandler>> = {};

const intentFor = (ctx: TickContext, id: EntityId): MoveIntent => {
  let i = ctx.intents.get(id);
  if (!i) ctx.intents.set(id, (i = { tick: 0, wishX: 0, wishZ: 0, gait: 'idle', yaw: 0, pitch: 0 }));
  return i;
};

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0 };

/** Scratch: the other bodies the moving one collides with, rewritten for each body. */
const others: Cylinder[] = [];
const cylinders: Cylinder[] = [];
const bodies: Array<{ id: EntityId; body: BodyState; spec: BodySpec }> = [];

/** Every body in entity order, with its kind's spec. */
function bodiesOf(ctx: TickContext): typeof bodies {
  bodies.length = 0;
  for (const e of ctx.state.entities) if (hasBody(e)) bodies.push({ id: e.id, body: e.body, spec: ctx.tuning.bodies[e.kind] });
  return bodies;
}

/** The 'schedule' phase: runs every entry due this tick, in order, through its kind's handler. */
export function scheduleSystem(handlers: Readonly<Record<string, ScheduleHandler>>): System {
  const table: Readonly<Record<string, ScheduleHandler | undefined>> = handlers;
  return {
    name: 'schedule',
    phase: 'schedule',
    run(ctx) {
      for (let e = popDue(ctx.state.schedule, ctx.tick); e; e = popDue(ctx.state.schedule, ctx.tick)) {
        const handler = table[e.kind];
        if (!handler) throw new Error(`No handler for scheduled '${e.kind}'`);
        handler(ctx, e);
      }
    },
  };
}

export const SYSTEMS: readonly System[] = [
  scheduleSystem(SCHEDULE_HANDLERS),
  {
    // The player's commands, resolved against what was on screen when they were given.
    name: 'player-commands',
    phase: 'commands',
    run(ctx) {
      const p = ctx.index.player;
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
  },
  {
    name: 'player-intent',
    phase: 'intent',
    run(ctx) {
      const p = ctx.index.player;
      const motor = { world: ctx.world, solids: ctx.solids, tick: ctx.tick, source: p.id, emit: ctx.emit };
      playerIntent(p.body, p.control, ctx.input, ctx.tuning.bodies.player, motor, intentFor(ctx, p.id));
    },
  },
  {
    // Guards keep to their routines (gen/routine.ts) until a brain says otherwise (lab E).
    name: 'guard-routines',
    phase: 'intent',
    run(ctx) {
      for (const g of ctx.index.guards) guardIntent(g.body, g.guard, ctx.world, ctx.tuning, ctx.tick, intentFor(ctx, g.id));
    },
  },
  {
    // Every body, in entity order, each against where the others are at that moment.
    name: 'motor',
    phase: 'motor',
    run(ctx, dt) {
      const bodies = bodiesOf(ctx);
      for (let k = 0; k < bodies.length; k++) {
        const { id, body, spec } = bodies[k]!;
        others.length = 0;
        for (let j = 0; j < bodies.length; j++) {
          if (j === k) continue;
          const o = bodies[j]!;
          const c = (cylinders[j] ??= { x: 0, y: 0, z: 0, radius: 0, height: 0 });
          c.x = o.body.x;
          c.y = o.body.y;
          c.z = o.body.z;
          c.radius = o.spec.radius;
          c.height = bodyHeight(o.body, o.spec);
          others.push(c);
        }
        let intent = intentFor(ctx, id);
        if (intent.tick !== ctx.tick) intent = idleIntent(body, ctx.tick, intent);
        stepMotor(body, intent, spec, { world: ctx.world, solids: ctx.solids, tuning: ctx.tuning, dt, tick: ctx.tick, source: id, others, emit: ctx.emit });
      }
    },
  },
];

/** A copy of `systems` with `extra` added at the end of its phase (for tests and scenes). */
export function withSystem(systems: readonly System[], extra: System): System[] {
  const at = PHASES.indexOf(extra.phase);
  const k = systems.findIndex((s) => PHASES.indexOf(s.phase) > at);
  const out = [...systems];
  out.splice(k < 0 ? out.length : k, 0, extra);
  return out;
}

/**
 * Checks a list of systems and works out how often each runs: in phase order, unique
 * names, and rates that divide the tick rate. Returns ticks between runs, per system.
 */
export function planSystems(systems: readonly System[], tickHz: number): number[] {
  const names = new Set<string>();
  let last = 0;
  return systems.map((s) => {
    const phase = PHASES.indexOf(s.phase);
    if (phase < 0) throw new Error(`System '${s.name}' is in unknown phase '${s.phase}'`);
    if (phase < last) throw new Error(`System '${s.name}' (${s.phase}) is listed after a later phase`);
    if (names.has(s.name)) throw new Error(`Two systems are named '${s.name}'`);
    names.add(s.name);
    last = phase;
    const every = s.hz === undefined ? 1 : tickHz / s.hz;
    if (!Number.isInteger(every) || every < 1) throw new Error(`System '${s.name}' runs at ${s.hz} Hz, which doesn't divide ${tickHz} Hz`);
    return every;
  });
}

/**
 * The rules decide the run: succeeded or failed, and why. Called by a ruleset, a system
 * in the 'mission' phase. The first decision stands; later ones are ignored. `source`
 * is the entity that decided it (the player who reached the end, the guard who saw
 * him); `cause` the event that did.
 */
export function decide(ctx: TickContext, status: 'succeeded' | 'failed', reason: string, source: EntityId, cause = 0): void {
  const o = ctx.state.outcome;
  if (o.status !== 'playing') return;
  o.status = status;
  o.reason = reason;
  o.tick = ctx.tick;
  ctx.emit({ type: 'outcome', source, status, cause });
}

/** Schedules from inside a tick: `seconds` from `tick`, rounded to whole ticks. */
export function scheduleIn(state: SimState, tick: number, dt: number, seconds: number, kind: string, a = 0, b = 0): void {
  scheduleAt(state.schedule, tick, tick + ticksAfter(seconds, dt), kind, a, b);
}
