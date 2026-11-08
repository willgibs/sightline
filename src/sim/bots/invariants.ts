import { dtanDeg } from '../core/detmath';
import { bodyHeight, type BodySpec, type BodyState } from '../motor/body';
import type { Simulation } from '../sim';
import { hasBody, type EntityId } from '../state';
import { Blocks, pushOutCircle } from '../world/colliders';
import { makeTerrainSample } from '../world/heightfield';

/**
 * What the motor promises every body, checked after every tick (CLAUDE.md rule 10):
 * never under the terrain, never inside anything solid (the world's colliders and
 * entities' shapes), never more than one step up in a tick, never any height gained on
 * ground too steep to stand on, and never a NaN. The invariant tests and the long fuzz
 * run (`npm run fuzz`) both watch with this, so they check the same promises.
 *
 * The audit that hardened the controller showed an older check passing two deliberately
 * broken controllers, so the tolerances are tight (0.1 mm).
 */

export interface InvariantReport {
  ticks: number;
  /** Ticks × bodies checked. */
  checks: number;
  below: number;
  inside: number;
  worstOverlap: number;
  worstRise: number;
  steepGain: number;
  nan: number;
  /** The first broken promise: when, which body, and what. */
  first: { tick: number; entity: EntityId; what: string } | null;
}

/** Overlap deeper than this is inside. */
export const OVERLAP_TOLERANCE = 1e-4;
/** Height gained on too-steep ground, allowing a hair for triangle seams. */
export const STEEP_TOLERANCE = 0.005;

interface Before {
  y: number;
  onSteep: boolean;
}

export class InvariantWatch {
  readonly report: InvariantReport = { ticks: 0, checks: 0, below: 0, inside: 0, worstOverlap: 0, worstRise: 0, steepGain: 0, nan: 0, first: null };
  private readonly before = new Map<EntityId, Before>();
  private readonly sample = makeTerrainSample();
  private readonly push = { x: 0, z: 0 };
  private readonly ids: number[] = [];

  constructor(private readonly sim: Simulation) {}

  /** Call before each tick: notes where every body starts. */
  beforeTick(): void {
    const { world, tuning } = this.sim;
    this.before.clear();
    for (const e of this.sim.state.entities) {
      if (!hasBody(e)) continue;
      const b = e.body;
      world.terrain.sample(b.x, b.z, this.sample);
      const tanMax = dtanDeg(tuning.bodies[e.kind].maxSlopeDeg);
      this.before.set(e.id, { y: b.y, onSteep: b.motor === 'ground' && b.standingOn < 0 && this.sample.slopeTan > tanMax });
    }
  }

  /** Call after each tick: checks every body against its promises. */
  afterTick(): void {
    const r = this.report;
    r.ticks++;
    for (const e of this.sim.state.entities) {
      if (!hasBody(e)) continue;
      const was = this.before.get(e.id);
      if (!was) continue;
      r.checks++;
      this.check(e.id, e.body, this.sim.tuning.bodies[e.kind], was);
    }
  }

  /** True while every promise has held: each broken one is noted as `first`, by its own body's limits. */
  get sound(): boolean {
    return this.report.first === null;
  }

  private check(id: EntityId, b: BodyState, spec: BodySpec, was: Before): void {
    const r = this.report;
    const { world, solids } = this.sim;
    const broke = (what: string) => {
      r.first ??= { tick: this.sim.tick, entity: id, what };
    };
    if ([b.x, b.y, b.z, b.vx, b.vy, b.vz, b.yaw, b.pitch, b.eyeHeight].some((v) => v !== v)) {
      r.nan++;
      broke('a NaN in the body');
      return;
    }
    if (b.y < world.terrain.heightAt(b.x, b.z) - 1e-6) {
      r.below++;
      broke(`under the terrain by ${(world.terrain.heightAt(b.x, b.z) - b.y).toFixed(4)} m`);
    }
    // In every motor mode.
    const rise = b.y - was.y;
    r.worstRise = Math.max(r.worstRise, rise);
    if (rise > spec.stepHeight + 1e-9) broke(`rose ${rise.toFixed(4)} m in a tick`);
    if (was.onSteep && b.standingOn < 0) {
      r.steepGain = Math.max(r.steepGain, rise);
      if (rise >= STEEP_TOLERANCE) broke(`gained ${rise.toFixed(4)} m on ground too steep to stand on`);
    }
    const height = bodyHeight(b, spec);
    solids.query(b.x - 1, b.z - 1, b.x + 1, b.z + 1, this.ids);
    for (const cid of this.ids) {
      const c = solids.get(cid);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= b.y + spec.stepHeight || c.y0 >= b.y + height) continue;
      if (!pushOutCircle(c, b.x, b.z, spec.radius, this.push)) continue;
      const depth = Math.sqrt(this.push.x * this.push.x + this.push.z * this.push.z);
      r.worstOverlap = Math.max(r.worstOverlap, depth);
      if (depth > OVERLAP_TOLERANCE) {
        r.inside++;
        broke(`inside collider ${cid} by ${depth.toFixed(4)} m`);
      }
    }
  }
}
