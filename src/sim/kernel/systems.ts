import type { Tuning } from '../../config/tuning';
import type { DebugDraw } from './debugDraw';
import type { Rng } from './core/rng';
import { EVENTS, type EventDraft, type EventType } from './events';
import type { TickInput } from './input';
import { popDue, scheduleAt, ticksAfter, type Scheduled } from './schedule';
import type { EntityId, EntityIndex, SimState } from './state';
import type { Solids } from './world/solids';
import type { World } from './world/world';

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
 * Within a phase, systems run in the order they are listed, and that order is checked
 * rather than assumed: every system declares what it reads, writes and emits (Access,
 * below), and planSystems refuses two systems in one phase that touch the same data
 * unless the later one names the earlier in `after`.
 *
 * Add a system to the game's list (game/systems.ts) in its phase, never by calling it
 * from step().
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
  /** The entities by kind and id, kept current with the state (state.ts). */
  readonly index: EntityIndex;
  /** This tick's input, already quantized. */
  readonly input: TickInput;

  /** Records an event and returns its id, for the events it causes. A system emits only the types it declares. */
  emit(e: EventDraft): number;
  /** Schedules `kind` to run in the 'schedule' phase `seconds` from now (at least one tick). */
  schedule(seconds: number, kind: string, a?: number, b?: number): void;
  /**
   * Draws from an entity's own random stream for a purpose, kept in the state tree. A
   * stream belongs to one entity, so what one guard draws never shifts another's
   * numbers. Use the Rng only inside `use`.
   */
  draw<T>(id: EntityId, purpose: string, use: (rng: Rng) => T): T;
  /**
   * Shows something in the debug view (debugDraw.ts). `paint` runs only while the debug
   * view is on, so it must never change what the system does.
   */
  debug(paint: (draw: DebugDraw) => void): void;
  /**
   * A value that systems hand on to later systems within this tick, made by `make` the
   * first time it is asked for: the bodies' intents, say, from 'intent' to 'motor'. Every
   * tick starts with no channels, so nothing outside the state tree lasts from one tick to
   * the next. Declare it in a system's access as `@name`.
   */
  channel<T>(name: string, make: () => T): T;
}

/**
 * What a system reads and writes, as paths into the state tree and the tick's channels:
 *
 *   schedule, outcome          top-level parts of the state
 *   rng.<purpose>              entities' random streams for a purpose (TickContext.draw)
 *   entities                   which entities exist: spawning and despawning
 *   <kind>.<field>[.<field>…]  a field of every entity of a kind, such as guard.guard.headYaw
 *   *.<field>[.<field>…]       that field of every kind that has it, such as *.body
 *   @<channel>[.<kind>]        a channel (TickContext.channel), or one kind's entries in it
 *   input                      this tick's input, read only
 *
 * Two paths overlap when one is a prefix of the other, with `*` and `entities` standing for
 * any kind. Two systems in a phase conflict when one writes what the other reads or
 * writes, or both emit events (event ids follow the order they run in).
 */
export interface Access {
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  /** The event types it may emit; emitting any other throws. */
  readonly emits: readonly EventType[];
}

export interface System extends Access {
  readonly name: string;
  readonly phase: Phase;
  /** Runs this many times a second; the tick rate must be a multiple of it. Default: every tick. */
  readonly hz?: number;
  /** Systems earlier in its phase that it must run after: the declared order a conflict needs. */
  readonly after?: readonly string[];
  /** `dt` is the time since this system last ran: the tick's, or longer for a slower system. */
  run(ctx: TickContext, dt: number): void;
}

/** What a scheduled entry does when it falls due, by kind. */
export type ScheduleHandler = (ctx: TickContext, entry: Scheduled) => void;

const NOTHING: Access = { reads: [], writes: [], emits: [] };

/**
 * The 'schedule' phase: runs every entry due this tick, in order, through its kind's
 * handler. `access` declares what the handlers read, write and emit, beyond the schedule itself.
 */
export function scheduleSystem(handlers: Readonly<Record<string, ScheduleHandler>>, access: Access = NOTHING): System {
  const table: Readonly<Record<string, ScheduleHandler | undefined>> = handlers;
  return {
    name: 'schedule',
    phase: 'schedule',
    reads: ['schedule', ...access.reads],
    writes: ['schedule', ...access.writes],
    emits: access.emits,
    run(ctx) {
      for (let e = popDue(ctx.state.schedule, ctx.tick); e; e = popDue(ctx.state.schedule, ctx.tick)) {
        const handler = table[e.kind];
        if (!handler) throw new Error(`No handler for scheduled '${e.kind}'`);
        handler(ctx, e);
      }
    },
  };
}

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
 * names, rates that divide the tick rate, well-formed access, and no conflict within a
 * phase without a declared order (accessConflicts). Returns ticks between runs, per system.
 */
export function planSystems(systems: readonly System[], tickHz: number): number[] {
  const names = new Set<string>();
  let last = 0;
  const every = systems.map((s) => {
    const phase = PHASES.indexOf(s.phase);
    if (phase < 0) throw new Error(`System '${s.name}' is in unknown phase '${s.phase}'`);
    if (phase < last) throw new Error(`System '${s.name}' (${s.phase}) is listed after a later phase`);
    if (names.has(s.name)) throw new Error(`Two systems are named '${s.name}'`);
    names.add(s.name);
    last = phase;
    checkAccess(s);
    const every = s.hz === undefined ? 1 : tickHz / s.hz;
    if (!Number.isInteger(every) || every < 1) throw new Error(`System '${s.name}' runs at ${s.hz} Hz, which doesn't divide ${tickHz} Hz`);
    return every;
  });
  const conflicts = accessConflicts(systems);
  if (conflicts.length > 0) throw new Error(`Systems conflict with no declared order: ${conflicts.join('; ')}`);
  return every;
}

/** State roots that aren't entity kinds. */
const ROOTS = new Set(['schedule', 'outcome', 'rng', 'entities', 'input']);
const SEGMENT = /^(\*|[A-Za-z_][A-Za-z0-9_]*)$/;

function checkAccess(s: System): void {
  for (const key of ['reads', 'writes', 'emits'] as const) {
    if (!Array.isArray(s[key])) throw new Error(`System '${s.name}' doesn't declare what it ${key}`);
  }
  for (const path of [...s.reads, ...s.writes]) {
    const parts = (path.startsWith('@') ? path.slice(1) : path).split('.');
    if (!parts.every((p, i) => SEGMENT.test(p) && (p !== '*' || (i === 0 && !path.startsWith('@'))))) {
      throw new Error(`System '${s.name}' declares a malformed path '${path}'`);
    }
  }
  for (const path of s.writes) if (path === 'input' || path.startsWith('input.')) throw new Error(`System '${s.name}' writes the input, which is read only`);
  for (const type of s.emits) if (!(type in EVENTS)) throw new Error(`System '${s.name}' emits '${type}', which is no event type`);
}

/** True if two access paths name overlapping parts of the state or the same channel. */
export function overlaps(a: string, b: string): boolean {
  const x = a.split('.');
  const y = b.split('.');
  const entity = (r: string): boolean => !r.startsWith('@') && !ROOTS.has(r);
  const ra = x[0]!;
  const rb = y[0]!;
  if (ra === 'entities' || rb === 'entities') return (ra === rb) || entity(ra) || entity(rb);
  if (ra !== rb && !(entity(ra) && entity(rb) && (ra === '*' || rb === '*'))) return false;
  for (let i = 1; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * Pairs of systems in one phase that touch the same data with no declared order between
 * them: one writes what the other reads or writes, or both emit. The later system's
 * `after`, directly or through others, orders them. Also reports an `after` that names no
 * earlier system in the phase.
 */
export function accessConflicts(systems: readonly System[]): string[] {
  const out: string[] = [];
  const touches = (w: readonly string[], other: readonly string[]): string | null => {
    for (const p of w) for (const q of other) if (overlaps(p, q)) return p === q ? p : `${p} and ${q}`;
    return null;
  };
  for (let k = 0; k < systems.length; k++) {
    const b = systems[k]!;
    // Everything b is declared to run after, directly or through others.
    const earlier = new Map<string, System>();
    for (let j = 0; j < k; j++) if (systems[j]!.phase === b.phase) earlier.set(systems[j]!.name, systems[j]!);
    const ordered = new Set<string>();
    const pending = [...(b.after ?? [])];
    for (const name of b.after ?? []) if (!earlier.has(name)) out.push(`'${b.name}' runs after '${name}', which isn't earlier in its phase`);
    while (pending.length > 0) {
      const name = pending.pop()!;
      if (ordered.has(name) || !earlier.has(name)) continue;
      ordered.add(name);
      pending.push(...(earlier.get(name)!.after ?? []));
    }
    for (const a of earlier.values()) {
      if (ordered.has(a.name)) continue;
      const why =
        touches(a.writes, [...b.reads, ...b.writes]) ??
        touches(b.writes, a.reads) ??
        (a.emits.length > 0 && b.emits.length > 0 ? 'both emit events' : null);
      if (why) out.push(`'${a.name}' and '${b.name}' in '${b.phase}' (${why})`);
    }
  }
  return out;
}

/**
 * The rules decide the run: succeeded or failed, and why. Called by a ruleset, a system
 * in the 'mission' phase, which declares that it writes `outcome` and emits 'outcome'. The
 * first decision stands; later ones are ignored. `source` is the entity that decided it
 * (the player who reached the end, the guard who saw him); `cause` the event that did.
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
