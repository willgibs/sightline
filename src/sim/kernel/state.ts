import { Hasher } from './core/hash';
import type { Collider } from './world/colliders';
import { emptySchedule, type ScheduleState } from './schedule';

/**
 * All of the simulation's dynamic state, in one tree of plain data: numbers, booleans,
 * strings, null, arrays and plain objects. No class instances, no closures, no
 * references between entities except numeric ids.
 *
 * Everything else comes from it: the hash (determinism checks, recording checkpoints),
 * save-states (structuredClone), restore, seeking in a recording, and the renderer's
 * snapshot. Derived caches (the index of entities by kind and id, systems.ts) live
 * outside the tree and are rebuilt from it.
 *
 * Rule: new simulation state goes into this tree, nowhere else. The hash covers the
 * whole tree by construction, and a test checks that changing any leaf changes it.
 */

/**
 * Bumped when the tree's layout changes, so an old save-state is refused rather than
 * misread. 2: the player is a body and its controls; the schedule. 3: event ids.
 * 4: bodies keep their last two poses. 5: guards are bodies; random streams per entity.
 * (Solid entities are a new kind, not a change of layout: existing states read the same.)
 * 6: the outcome. 7: guards keep the order their brain last gave. 8: bodies keep a lean and a
 * mantle; the player's controls keep a climb press (lab C, Nov 8). 9: the valley's guards
 * carry their senses (A13). 10: a vehicle on its way out keeps who is in its cab, so that he
 * can get out again. 11: a camp says whether its men are drilled for a firefight, and a man
 * in one keeps what he knows of it and his position (brain/firefight.ts). 12: a camp keeps
 * who it's hunting, its sections, the places they've found empty and the bodies it has
 * named, and a man on the hunt keeps the way out and where he is on it (brain/hunt.ts).
 * 13: a vehicle keeps when its engine was started; a camp keeps how it answers for its
 * target, which of its relief it has posted on his doors, and how he left; and a man keeps
 * the engine he hears and his part in the drill (brain/protect.ts).
 * 14: a body percept keeps whether it was seen going down or only from afar, and a man's
 * senses the bodies he has seen only from afar; a brain keeps the fire it has counted, when
 * it last knew the camp was under attack, the alarm boxes it has found dead and when it last
 * went to look at something; a camp keeps the bodies reported to it, the word of a man who
 * knew, and the men who didn't answer its order to the siren; a report can carry that word;
 * and a generator and an alarm box keep the rounds that have struck them.
 */
export const STATE_SCHEMA = 14;

export type EntityId = number;

/** Which side an entity is on. Perception and AI target factions, never specific entities. None: an object, no one's. */
export const Faction = { Player: 0, Camp: 1, None: 2 } as const;

/** Four 32-bit words of a random stream's state. */
export type RngWords = [number, number, number, number];

/** What every entity has: an id, never reused within a run, its kind, and its side. */
export interface EntityBase {
  id: EntityId;
  kind: string;
  faction: number;
}

/**
 * An entity that is only a solid shape: a gate, a crate, a scene's moving wall. The motor
 * and every query see it as they see the world's colliders (world/solids.ts). Doors and
 * vehicles will be kinds of their own with a `solid` as well.
 */
export interface SolidEntity extends EntityBase {
  kind: 'solid';
  /** Its shape in the world frame. Its id is solidId(id), set on spawning. */
  solid: Collider;
}

/**
 * Every kind of entity, by its `kind`. The kernel's own is the solid shape. The game and
 * the lanes add theirs by module augmentation (the game's player and guards:
 * game/entities.ts), so the kernel never names them; a new kind is added there, never
 * here.
 */
export interface EntityKinds {
  solid: SolidEntity;
}

export type EntityKind = keyof EntityKinds;
export type Entity = EntityKinds[EntityKind];
export type EntityOf<K extends EntityKind> = EntityKinds[K];

export function hasSolid(e: Entity): e is Extract<Entity, { solid: Collider }> {
  return 'solid' in e;
}

/**
 * How the run stands: playing until its rules decide (a ruleset is a system in the
 * 'mission' phase, systems.ts `decide`), then decided for good. A scene's rules decide
 * its lab's outcome; Phase 2's mission rules decide the mission's.
 */
export interface Outcome {
  status: 'playing' | 'succeeded' | 'failed';
  /** Why, in a few words: "reached the end of the course", "spotted by a sentry". */
  reason: string;
  /** The tick it was decided; 0 while playing. */
  tick: number;
}

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
  outcome: Outcome;
}

export function emptyState(): SimState {
  return {
    schema: STATE_SCHEMA,
    tick: 0,
    nextId: 1,
    nextEventId: 1,
    entities: [],
    rng: {},
    schedule: emptySchedule(),
    outcome: { status: 'playing', reason: '', tick: 0 },
  };
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

const NONE: readonly never[] = Object.freeze([]);

/**
 * The entities by kind and by id: a cache derived from the state tree, never part of it.
 * The simulation rebuilds it whenever entities appear or vanish and after a restore, so
 * systems find the guards, say, without filtering every entity on every tick. Each kind's
 * list is in ascending id order, as the tree keeps them.
 */
export class EntityIndex {
  private readonly kinds = new Map<string, Entity[]>();
  private readonly ids = new Map<EntityId, Entity>();

  /** Rebuilds from the state's entities. */
  rebuild(entities: readonly Entity[]): void {
    this.kinds.clear();
    this.ids.clear();
    for (const e of entities) {
      let list = this.kinds.get(e.kind);
      if (!list) this.kinds.set(e.kind, (list = []));
      list.push(e);
      this.ids.set(e.id, e);
    }
  }

  /** Every entity of a kind, in id order: live references into the state tree. */
  of<K extends EntityKind>(kind: K): readonly EntityOf<K>[] {
    return (this.kinds.get(kind) as EntityOf<K>[] | undefined) ?? NONE;
  }

  /** The entity with this id, if there is one now. */
  get(id: EntityId): Entity | undefined {
    return this.ids.get(id);
  }
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
