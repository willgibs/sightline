import { Hasher } from './core/hash';
import type { GuardState } from './entities/guards';
import type { PlayerControl } from './entities/player';
import type { BodyState } from './motor/body';
import { emptySchedule, type ScheduleState } from './schedule';

/**
 * All of the simulation's dynamic state, in one tree of plain data: numbers, booleans,
 * strings, null, arrays and plain objects. No class instances, no closures, no
 * references between entities except numeric ids.
 *
 * Everything else comes from it: the hash (determinism checks, recording checkpoints),
 * save-states (structuredClone), restore, seeking in a recording, and the renderer's
 * snapshot. Derived caches (an index by id, the list of guards) live outside the tree
 * and are rebuilt from it.
 *
 * Rule: new simulation state goes into this tree, nowhere else. The hash covers the
 * whole tree by construction, and a test checks that changing any leaf changes it.
 */

/**
 * Bumped when the tree's layout changes, so an old save-state is refused rather than
 * misread. 2: the player is a body and its controls; the schedule. 3: event ids.
 * 4: bodies keep their last two poses. 5: guards are bodies; random streams per entity.
 */
export const STATE_SCHEMA = 5;

export type EntityId = number;

/** The player is always the first entity spawned. */
export const PLAYER_ID: EntityId = 1;

/** Which side an entity is on. Perception and AI target factions, never specific entities. */
export const Faction = { Player: 0, Camp: 1 } as const;

/** Four 32-bit words of a random stream's state. */
export type RngWords = [number, number, number, number];

export interface PlayerEntity {
  id: EntityId;
  kind: 'player';
  faction: number;
  /** The physical body, moved by the shared motor. */
  body: BodyState;
  /** What the controls remember between ticks. */
  control: PlayerControl;
}

export interface GuardEntity {
  id: EntityId;
  kind: 'guard';
  faction: number;
  /** The physical body, moved by the shared motor. */
  body: BodyState;
  guard: GuardState;
}

export type Entity = PlayerEntity | GuardEntity;
export type EntityKind = Entity['kind'];

export interface SimState {
  schema: number;
  tick: number;
  /** The next entity id. Ids are never reused within a run, so events stay unambiguous. */
  nextId: EntityId;
  /** The next event id: events are numbered from 1 in the order they happen. */
  nextEventId: number;
  /** In ascending id order; systems iterate in this order. */
  entities: Entity[];
  /**
   * Random streams, one per entity and purpose ("4.wander"), made on first use. A stream
   * belongs to one entity, so removing a guard never shifts another's numbers.
   */
  rng: Record<string, RngWords>;
  /** Delayed effects, in the order they fall due (schedule.ts). */
  schedule: ScheduleState;
}

export function emptyState(): SimState {
  return { schema: STATE_SCHEMA, tick: 0, nextId: 1, nextEventId: 1, entities: [], rng: {}, schedule: emptySchedule() };
}

/** Adds an entity with the next id. Entities stay in ascending id order. */
export function spawn<E extends Entity>(s: SimState, make: (id: EntityId) => E): E {
  const e = make(s.nextId++);
  s.entities.push(e);
  return e;
}

/** Removes an entity. Returns false if there was none with that id. */
export function despawn(s: SimState, id: EntityId): boolean {
  const i = s.entities.findIndex((e) => e.id === id);
  if (i < 0) return false;
  s.entities.splice(i, 1);
  return true;
}

/** A deep copy: a save-state that shares nothing with the running simulation. */
export function cloneState(s: SimState): SimState {
  return structuredClone(s);
}

/**
 * Hashes the whole tree: object keys in sorted order, so construction order never
 * matters; numbers by their exact bits (every NaN alike); arrays with their lengths.
 */
export function hashState(s: SimState): string {
  const h = new Hasher();
  hashValueInto(h, s);
  return h.digest();
}

/**
 * The tree's parts, each hashed on its own: every top-level field, and every entity. When
 * two runs disagree, comparing parts says where: a guard, the player, the random streams.
 */
export function stateParts(s: SimState): Array<[name: string, hash: string]> {
  const out: Array<[string, string]> = [];
  const tree = s as unknown as Record<string, unknown>;
  for (const key of Object.keys(tree).sort()) {
    if (key === 'entities') continue;
    const h = new Hasher();
    hashValueInto(h, tree[key]);
    out.push([key, h.digest()]);
  }
  for (const e of s.entities) {
    const h = new Hasher();
    hashValueInto(h, e);
    out.push([`${e.kind}:${e.id}`, h.digest()]);
  }
  return out;
}

function hashValueInto(h: Hasher, v: unknown): void {
  switch (typeof v) {
    case 'number':
      h.u32(1).f64(v);
      return;
    case 'boolean':
      h.u32(v ? 3 : 2);
      return;
    case 'string':
      h.u32(4).str(v);
      return;
    case 'object':
      if (v === null) {
        h.u32(5);
        return;
      }
      if (Array.isArray(v)) {
        h.u32(6).u32(v.length);
        for (const x of v) hashValueInto(h, x);
        return;
      }
      {
        const keys = Object.keys(v as object).sort();
        h.u32(7).u32(keys.length);
        for (const k of keys) {
          h.str(k);
          hashValueInto(h, (v as Record<string, unknown>)[k]);
        }
      }
      return;
    default:
      throw new Error(`Simulation state holds a ${typeof v}; only plain data belongs there`);
  }
}

/**
 * Throws unless a value is plain data: what structuredClone copies faithfully and the
 * hash covers. Run by tests over live states, so a class instance, a Map, a function or
 * an undefined field can't slip in.
 */
export function assertPlain(v: unknown, path = 'state'): void {
  if (v === null) return;
  const t = typeof v;
  if (t === 'number' || t === 'boolean' || t === 'string') return;
  if (t !== 'object') throw new Error(`${path} is a ${t}`);
  if (Array.isArray(v)) {
    v.forEach((x, i) => assertPlain(x, `${path}[${i}]`));
    return;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${path} is a ${proto?.constructor?.name ?? 'class instance'}`);
  for (const [k, x] of Object.entries(v as object)) {
    if (x === undefined) throw new Error(`${path}.${k} is undefined`);
    assertPlain(x, `${path}.${k}`);
  }
}
