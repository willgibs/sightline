import type { Tuning } from '../config/tuning';
import type { Rng } from './core/rng';
import { stepGuards } from './entities/guards';
import { playerIntent } from './entities/player';
import type { SimEvent } from './events';
import type { World } from './gen/world';
import type { InputFrame } from './input';
import { idleIntent, stepMotor, type Cylinder, type MoveIntent } from './motor/motor';
import { popDue, scheduleAt, ticksAfter, type Scheduled } from './schedule';
import { PLAYER_SOURCE } from './events';
import type { EntityId, GuardEntity, PlayerEntity, SimState } from './state';

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
  readonly tuning: Tuning;
  /** Seconds per tick. */
  readonly dt: number;
  /** The tick being computed: 1 for the first. */
  readonly tick: number;
  readonly state: SimState;
  readonly index: EntityIndex;
  /** This tick's input, already quantized. */
  readonly input: InputFrame;
  /** The shared random stream, until M5 gives each entity its own. */
  readonly rng: Rng;
  /** What each body wants this tick, by entity id: written in 'intent', read in 'motor'. */
  readonly intents: Map<EntityId, MoveIntent>;
  emit(e: SimEvent): void;
  /** Schedules `kind` to run in the 'schedule' phase `seconds` from now (at least one tick). */
  schedule(seconds: number, kind: string, a?: number, b?: number): void;
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

/** Scratch: the other bodies the moving one collides with, rewritten for each body. */
const others: Cylinder[] = [];
const cylinders: Cylinder[] = [];

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
    name: 'player-intent',
    phase: 'intent',
    run(ctx) {
      const p = ctx.index.player;
      playerIntent(p.body, p.control, ctx.input, ctx.tuning.player, ctx, intentFor(ctx, p.id));
    },
  },
  {
    // Phase 0's guard dummies walk their routes on their own. M5 splits them into a
    // routine (intent) and the shared motor, like the player.
    name: 'guards',
    phase: 'motor',
    run(ctx, dt) {
      stepGuards(ctx.index.guards, ctx.world, ctx.tuning, dt, ctx.tick, ctx.rng, ctx.emit);
    },
  },
  {
    name: 'motor',
    phase: 'motor',
    run(ctx, dt) {
      const p = ctx.index.player;
      const G = ctx.tuning.guards;
      others.length = 0;
      ctx.index.guards.forEach((e, k) => {
        const c = (cylinders[k] ??= { x: 0, y: 0, z: 0, radius: 0, height: 0 });
        c.x = e.guard.x;
        c.y = e.guard.y;
        c.z = e.guard.z;
        c.radius = G.radius;
        c.height = G.height;
        others.push(c);
      });
      let intent = intentFor(ctx, p.id);
      if (intent.tick !== ctx.tick) intent = idleIntent(p.body, ctx.tick, intent);
      stepMotor(p.body, intent, ctx.tuning.player, { world: ctx.world, tuning: ctx.tuning, dt, tick: ctx.tick, source: PLAYER_SOURCE, others, emit: ctx.emit });
    },
  },
];

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

/** Schedules from inside a tick: `seconds` from `tick`, rounded to whole ticks. */
export function scheduleIn(state: SimState, tick: number, dt: number, seconds: number, kind: string, a = 0, b = 0): void {
  scheduleAt(state.schedule, tick, tick + ticksAfter(seconds, dt), kind, a, b);
}
