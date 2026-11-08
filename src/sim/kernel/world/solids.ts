import { finiteRay } from '../core/math';
import type { EntityId } from '../state';
import { footprintExtent, rayCollider, type Collider, type ColliderSet, type RayHit } from './colliders';

/**
 * Everything solid at this moment: the world's colliders, which never move, and the
 * solid shapes of entities (a gate, a parked truck, a scene's moving wall), which are
 * simulation state and can appear, move and vanish. The motor and the world query read
 * colliders only through here, so a gate stops a body, a shot and a sight line exactly
 * as a wall does, and stands in the same place in a replay.
 *
 * An entity's shape is a collider in the world frame, kept in the state tree as the
 * entity's `solid`; its id is ENTITY_SOLID + the entity's id, the same for the whole
 * run, so a body standing on a crate knows what it stands on across ticks and restores.
 *
 * Rules for whatever moves a solid:
 * - Never move it into a body (check with `overlapsBody` first, and wait or stop): the
 *   motor's invariant that no body ends a tick inside anything solid depends on it.
 * - Bodies don't ride what they stand on yet: a solid moving under a body slides out
 *   from under it.
 * - The spatial grid (grid.ts) is built from the world's colliders only; a door that
 *   closes a passage says so to whoever paths through it (labs A and E).
 */

/** Entities' solid shapes have ids from here up; the world's colliders stay below it. */
export const ENTITY_SOLID = 1 << 24;

/** The collider id of an entity's solid shape. */
export function solidId(entity: EntityId): number {
  return ENTITY_SOLID + entity;
}

/** The entity a collider id belongs to, or −1 for one of the world's own colliders. */
export function entityOfCollider(id: number): EntityId {
  return id >= ENTITY_SOLID ? id - ENTITY_SOLID : -1;
}

export class Solids {
  /** The entities' shapes, in entity order: live references into the state tree. */
  private moving: readonly Collider[] = [];
  private readonly byId = new Map<number, Collider>();
  private readonly hit: RayHit = { dist: Infinity, id: -1 };

  constructor(readonly fixed: ColliderSet) {}

  /**
   * Sees these shapes from now on, read live: moving one is seen at once. Call when
   * entities appear or vanish, or the state is restored.
   */
  track(shapes: readonly Collider[]): void {
    this.moving = shapes;
    this.byId.clear();
    for (const c of shapes) this.byId.set(c.id, c);
  }

  /** How many entities' shapes are in play. */
  get count(): number {
    return this.moving.length;
  }

  /** The entities' shapes, in entity order. */
  get shapes(): readonly Collider[] {
    return this.moving;
  }

  /** A collider by id: the world's, or an entity's. */
  get(id: number): Collider {
    const c = id >= ENTITY_SOLID ? this.byId.get(id) : this.fixed.list[id];
    if (!c) throw new Error(`No collider ${id}`);
    return c;
  }

  /**
   * Ids of colliders whose footprint may overlap the box [minX, maxX] × [minZ, maxZ]:
   * the world's first, in the order its grid gives them, then the entities', in entity order.
   */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[] {
    this.fixed.query(minX, minZ, maxX, maxZ, out);
    for (let k = 0; k < this.moving.length; k++) {
      const c = this.moving[k]!;
      const { ex, ez } = footprintExtent(c);
      if (c.x + ex < minX || c.x - ex > maxX || c.z + ez < minZ || c.z - ez > maxZ) continue;
      out.push(c.id);
    }
    return out;
  }

  /** Nearest collider hit by a normalised ray among those whose flags match `mask`. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, mask: number, out: RayHit): RayHit {
    this.fixed.raycast(ox, oy, oz, dx, dy, dz, maxDist, mask, out);
    if (!finiteRay(ox, oy, oz, dx, dy, dz) || !(maxDist >= 0)) return out;
    for (let k = 0; k < this.moving.length; k++) {
      const c = this.moving[k]!;
      if ((c.flags & mask) === 0) continue;
      const t = rayCollider(c, ox, oy, oz, dx, dy, dz);
      // A world collider at the same distance keeps the hit: the order is fixed, so is the answer.
      if (t >= 0 && t <= maxDist && t < out.dist) {
        out.dist = t;
        out.id = c.id;
      }
    }
    return out;
  }

  /** The nearest hit as a distance only (scratch result, for callers that don't need the id). */
  distance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, mask: number): number {
    return this.raycast(ox, oy, oz, dx, dy, dz, maxDist, mask, this.hit).dist;
  }
}
