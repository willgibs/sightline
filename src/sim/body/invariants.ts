import { dcos, dsin, dtanDeg } from '../kernel/core/detmath';
import { bodyHeight, hasBody, restBelow, type BodySpec, type BodyState } from './body';
import type { Simulation } from '../kernel/sim';
import type { EntityId } from '../kernel/state';
import { Blocks, pushOutCircle } from '../kernel/world/colliders';
import { makeTerrainSample } from '../kernel/world/heightfield';
import { emptyShape } from '../kernel/world/shape';
import { footprint, type FootCircle } from './chain';
import { bodyShape } from './shape';

/**
 * What the motor promises every body, checked after every tick (CLAUDE.md rule 10):
 * never under the terrain, never inside anything solid (the world's colliders and
 * entities' shapes), never more than one step up in a tick, never any height gained on
 * ground too steep to stand on, a lean that never grows faster than its rate with the
 * head and shoulders always clear, no end of a lying body rising more than a step in a
 * tick, no mantle or ladder moving into another body, and never a NaN. The invariant tests and the long fuzz
 * run (`npm run fuzz`) both watch with this, so they check the same promises.
 *
 * The audit that hardened the controller showed an older check passing two deliberately
 * broken controllers, so the tolerances are tight (0.1 mm).
 *
 * Height gained on steep ground is measured where it is gained: along the line the body
 * moved over this tick, triangle by triangle, counting only what the terrain rises on the
 * triangles too steep to stand on (Heightfield.gainOnSteep). The check used to charge the
 * whole tick's rise to where the tick began. A body that slides off a steep face and
 * carries on up walkable ground in the same tick has gained nothing on the face, and that
 * case stopped about one long bot run in five once the valleys got scarps and gorges, with
 * the motor doing nothing wrong. What a body on the terrain at both ends of a tick is held to:
 * - it never ends a tick on steep ground higher than it began it, wherever it began. Steep
 *   ground is a barrier from walkable ground too, which the old check never looked at;
 * - it gains no height on the steep ground it began the tick on, wherever it ends: no part
 *   of its own speed goes uphill there (motor.ts, driveGround).
 * `seamGain` is reported and held to no limit: the most the terrain rose on steep triangles
 * under one tick's move with neither promise broken. That is a corner of a steep triangle
 * clipped on the way to walkable ground, or the far side of a notch ridden up after sliding
 * down into it and ending no higher. The motor judges a move by where it ends (motor.ts,
 * terrainBlocks), so it allows these: a few centimetres in a tick, never more than a
 * walkable grade over the move, and nothing a body can climb by.
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
  /** The most gained in one tick on a sliver of steep ground crossed from walkable ground: reported, not a broken promise (see above). */
  seamGain: number;
  /** The most a lean grew in one tick, m. */
  worstLeanStep: number;
  /** Lying poses whose head, torso and legs were checked, part by part. */
  partChecks: number;
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
  /** On the ground, on the terrain itself: where its height is the terrain's. */
  onTerrain: boolean;
  onSteep: boolean;
  lean: number;
  x: number;
  z: number;
  /** Lying: how high its head, pelvis and feet rest; NaN if it isn't. */
  head: number;
  pelvis: number;
  feet: number;
}

export class InvariantWatch {
  readonly report: InvariantReport = { ticks: 0, checks: 0, below: 0, inside: 0, worstOverlap: 0, worstRise: 0, steepGain: 0, seamGain: 0, worstLeanStep: 0, partChecks: 0, nan: 0, first: null };
  private readonly before = new Map<EntityId, Before>();
  private readonly sample = makeTerrainSample();
  private readonly piece = { first: 0 };
  private readonly push = { x: 0, z: 0 };
  private readonly ids: number[] = [];
  private readonly shape = emptyShape();
  private readonly circles: FootCircle[] = [];
  private readonly others: FootCircle[] = [];

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
      const lying = b.lying > 0;
      const onTerrain = b.motor === 'ground' && b.standingOn < 0;
      this.before.set(e.id, { y: b.y, onTerrain, onSteep: onTerrain && this.sample.slopeTan > tanMax, lean: b.lean, x: b.x, z: b.z, head: lying ? b.y + b.riseHead : NaN, pelvis: lying ? b.y + b.risePelvis : NaN, feet: lying ? b.y + b.riseFeet : NaN });
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
    if ([b.x, b.y, b.z, b.vx, b.vy, b.vz, b.yaw, b.pitch, b.eyeHeight, b.lean].some((v) => v !== v)) {
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
    // On a ladder, its own rate, up or down (a fall begins only by letting go).
    if (b.motor === 'ladder' && b.ladder!.t >= spec.ladder.reachTime && Math.abs(rise) > spec.ladder.downRate * this.sim.dt + 1e-9) broke(`moved ${rise.toFixed(4)} m on a ladder in a tick`);
    if (was.onTerrain && b.motor === 'ground' && b.standingOn < 0) {
      // On the terrain at both ends of the tick: what it climbed on steep triangles on the way.
      const tanMax = dtanDeg(spec.maxSlopeDeg);
      const gain = world.terrain.gainOnSteep(was.x, was.z, b.x, b.z, tanMax, this.piece);
      const endsSteep = world.terrain.sample(b.x, b.z, this.sample).slopeTan > tanMax;
      // What it climbed on steep ground: the whole tick's rise if it ends there, and otherwise
      // whatever it gained on the triangle it began on.
      const climbed = endsSteep ? Math.max(rise, this.piece.first) : this.piece.first;
      r.steepGain = Math.max(r.steepGain, climbed);
      if (climbed >= STEEP_TOLERANCE) broke(endsSteep && rise >= STEEP_TOLERANCE ? `ended ${rise.toFixed(4)} m higher, on ground too steep to stand on` : `gained ${climbed.toFixed(4)} m on ground too steep to stand on`);
      else r.seamGain = Math.max(r.seamGain, gain);
    } else if (was.onSteep && b.standingOn < 0) {
      // It left steep ground some other way (into the air, onto a path of its own): it may not have gone up doing so.
      r.steepGain = Math.max(r.steepGain, rise);
      if (rise >= STEEP_TOLERANCE) broke(`rose ${rise.toFixed(4)} m off ground too steep to stand on`);
    }
    const height = bodyHeight(b, spec);
    // Standing, the body is its circle; lying down, the chain below takes its place.
    solids.query(b.x - 1, b.z - 1, b.x + 1, b.z + 1, this.ids);
    for (const cid of b.lying > 0 ? [] : this.ids) {
      const c = solids.get(cid);
      // On the ground a body may overlap what it could step onto; a mantle follows its own path, with no such allowance.
      const low = b.motor === 'mantle' || b.motor === 'ladder' ? b.y + 1e-3 : b.y + spec.stepHeight;
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= low || c.y0 >= b.y + height) continue;
      if (!pushOutCircle(c, b.x, b.z, spec.radius, this.push)) continue;
      const depth = Math.sqrt(this.push.x * this.push.x + this.push.z * this.push.z);
      r.worstOverlap = Math.max(r.worstOverlap, depth);
      if (depth > OVERLAP_TOLERANCE) {
        r.inside++;
        broke(`inside collider ${cid} by ${depth.toFixed(4)} m`);
      }
    }
    // In a mode with a path of its own, every pose is clear of every other body too.
    if ((b.motor === 'mantle' || b.motor === 'ladder') && (b.x !== was.x || b.y !== was.y || b.z !== was.z)) this.apart(id, b, spec, height, broke);
    // Lying down: every circle of the chain, and every part of the shape along it (chain.ts).
    if (b.lying > 0) {
      // Each end rises no more in a tick than a body may: nothing lifts it onto a wall.
      for (const [name, before, now] of [
        ['head', was.head, b.y + b.riseHead],
        ['pelvis', was.pelvis, b.y + b.risePelvis],
        ['feet', was.feet, b.y + b.riseFeet],
      ] as const) {
        if (now - before > spec.stepHeight + 1e-6) broke(`lying, the ${name} rose ${(now - before).toFixed(4)} m in a tick`);
      }
      const foot = footprint(b, spec, this.circles);
      for (let k = 0; k < foot.length; k++) {
        const C = foot[k]!;
        const cx = b.x + C.x;
        const cz = b.z + C.z;
        solids.query(cx - C.r, cz - C.r, cx + C.r, cz + C.r, this.ids);
        const g = this.restUnder(cx, cz, b.y, C.allow, spec.stepHeight, C.r);
        const base = Math.max(b.y - C.allow, g);
        for (const cid of this.ids) {
          const c = solids.get(cid);
          if ((c.flags & Blocks.Move) === 0 || c.y1 <= base + spec.stepHeight || c.y0 >= base + height) continue;
          if (!pushOutCircle(c, cx, cz, C.r, this.push)) continue;
          const depth = Math.sqrt(this.push.x * this.push.x + this.push.z * this.push.z);
          r.worstOverlap = Math.max(r.worstOverlap, depth);
          if (depth > OVERLAP_TOLERANCE) {
            r.inside++;
            broke(`lying, circle ${k} inside collider ${cid} by ${depth.toFixed(4)} m`);
          }
        }
      }
      // And the parts of the shape everything sees: the head, the torso and the legs. What the
      // chain stands on the body lies over, so each point along the body is judged as the
      // circle nearest it is: any overlap left would be something the chain doesn't cover.
      const shape = bodyShape(b, spec, this.shape);
      r.partChecks++;
      const fx = -dsin(b.axis);
      const fz = -dcos(b.axis);
      const part = (x: number, y: number, z: number, rad: number, name: string): void => {
        const at = (x - b.x) * fx + (z - b.z) * fz;
        // The two circles around this point: whatever either rests on, the body lies over here.
        let aft = foot[0]!;
        let fore = foot[0]!;
        for (let k = 0; k < foot.length; k++) {
          fore = foot[k]!;
          if (fore.at <= at) break;
          aft = fore;
        }
        let over = -Infinity;
        for (const N of [aft, fore]) {
          const base = Math.max(b.y - N.allow, this.restUnder(b.x + N.x, b.z + N.z, b.y, N.allow, spec.stepHeight, N.r));
          over = Math.max(over, base + spec.stepHeight);
        }
        // A body going over an edge is dragged across it: only the terrain's rise under its rest counts.
        this.part(name, id, x, y, z, rad, broke, b.motor === 'ground' ? 0.45 : Infinity, over);
      };
      part(shape.head.x, shape.head.y, shape.head.z, shape.head.r, 'head');
      for (const [name, cap] of [
        ['torso', shape.torso],
        ['legs', shape.legs],
      ] as const) {
        for (let i = 0; i <= 6; i++) {
          const f = i / 6;
          part(cap.ax + (cap.bx - cap.ax) * f, cap.ay + (cap.by - cap.ay) * f, cap.az + (cap.bz - cap.az) * f, cap.r, name);
        }
      }
    }
    // A lean: its rate, and the head and shoulders it carries out past the body's circle.
    const grew = Math.abs(b.lean) - Math.abs(was.lean);
    r.worstLeanStep = Math.max(r.worstLeanStep, grew);
    if (grew > spec.lean.rate * this.sim.dt + 1e-9) broke(`lean grew ${grew.toFixed(4)} m in a tick`);
    if (b.lean !== 0 && !(b.lying > 0)) {
      const s = bodyShape(b, spec, this.shape);
      this.part('head', id, s.head.x, s.head.y, s.head.z, s.head.r, broke);
      // Below a crouch a lean moves only the head (shape.ts).
      if (b.eyeHeight >= spec.eyeHeight.crouch) this.part('shoulders', id, s.torso.bx, s.torso.by, s.torso.bz, s.torso.r, broke);
    }
  }

  /**
   * Whether a body on a path of its own has moved clear of every other body, lying ones
   * along their chains: where each was as the tick began, which is what the path was
   * checked against, for a body that moved. (Walking into one holding still on a ladder is the walker's move.)
   */
  private apart(id: EntityId, b: BodyState, spec: BodySpec, height: number, broke: (what: string) => void): void {
    for (const e of this.sim.state.entities) {
      if (e.id === id || !hasBody(e)) continue;
      const o = e.body;
      const before = this.before.get(e.id);
      if (!before) continue;
      const ospec = this.sim.tuning.bodies[e.kind];
      if (o.y >= b.y + height || o.y + bodyHeight(o, ospec) <= b.y) continue;
      const foot = footprint(o, ospec, this.others);
      for (let k = 0; k < foot.length; k++) {
        const C = foot[k]!;
        const dx = b.x - (before.x + C.x);
        const dz = b.z - (before.z + C.z);
        const depth = spec.radius + C.r - Math.sqrt(dx * dx + dz * dz);
        if (depth > OVERLAP_TOLERANCE * 10) broke(`${b.motor} inside body ${e.id} by ${depth.toFixed(4)} m`);
      }
    }
  }

  /** What a circle rests on, as the motor finds it. */
  private restUnder(x: number, z: number, feet: number, allow: number, step: number, radius: number): number {
    return restBelow(this.sim.world, this.sim.solids, x, z, feet, allow, step, radius).height;
  }

  /**
   * One part of a body's shape, a sphere: clear of the terrain (within a lying body's give
   * on uneven ground: `give`) and anything solid.
   */
  private part(name: string, _id: EntityId, x: number, y: number, z: number, radius: number, broke: (what: string) => void, give = 1e-6, over = -Infinity): void {
    const r = this.report;
    const { world, solids } = this.sim;
    const under = world.terrain.heightAt(x, z) - (y - radius);
    if (under > give) {
      r.below++;
      broke(`${name} under the terrain by ${under.toFixed(4)} m`);
    }
    solids.query(x - radius, z - radius, x + radius, z + radius, this.ids);
    for (const cid of this.ids) {
      const c = solids.get(cid);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= Math.max(y - radius, over) || c.y0 >= y + radius) continue;
      if (!pushOutCircle(c, x, z, radius, this.push)) continue;
      const depth = Math.sqrt(this.push.x * this.push.x + this.push.z * this.push.z);
      r.worstOverlap = Math.max(r.worstOverlap, depth);
      if (depth > OVERLAP_TOLERANCE) {
        r.inside++;
        broke(`${name} inside collider ${cid} by ${depth.toFixed(4)} m`);
      }
    }
  }
}
