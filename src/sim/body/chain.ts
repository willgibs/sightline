import { dcos, dsin, dtanDeg } from '../kernel/core/detmath';
import type { BodySpec, BodyState } from './body';

/**
 * The prone body's real shape, for collision: a chain of circles along its axis, from
 * the head at one end to the feet at the other, in place of the single circle a standing
 * body is. The axis pivots near the chest (the body's position), so turning swings the
 * legs and steadies the view. The chain grows out of the single circle as a body goes
 * down and draws back as it gets up.
 *
 * It covers the shape everything else sees (shape.ts): a circle of radius √(ρ² + (s/2)²),
 * centred on a capsule's axis every s metres, covers a capsule of radius ρ between them,
 * so nothing that keeps clear of the chain can be inside the body's head, torso or legs.
 */

/** One circle of the chain: how far along the axis from the pivot, forward positive, and its radius. */
export interface ChainNode {
  at: number;
  r: number;
}

const chains = new WeakMap<object, readonly ChainNode[]>();

/** A lying body's chain, from the head to the feet. Derived from its parts, so changing a part changes the chain. */
export function chainOf(spec: BodySpec): readonly ChainNode[] {
  let c = chains.get(spec);
  if (!c) {
    c = buildChain(spec);
    chains.set(spec, c);
  }
  return c;
}

function buildChain(spec: BodySpec): ChainNode[] {
  const P = spec.parts;
  // A kind with no chain lies as it stands, one circle (the bench keeps today's prone body this way).
  if (!(P.chainSpacing > 0)) return [{ at: 0, r: spec.radius }];
  const at = (below: number): number => P.pivot - below;
  const out: ChainNode[] = [{ at: at(P.headRadius), r: P.headRadius }];
  const add = (from: number, to: number, rho: number): void => {
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / P.chainSpacing));
    const seg = Math.abs(to - from) / n;
    const r = Math.sqrt(rho * rho + (seg * seg) / 4);
    for (let k = 0; k <= n; k++) out.push({ at: from + ((to - from) * k) / n, r });
  };
  const shoulders = at(2 * P.headRadius + P.torsoRadius);
  const pelvis = at(P.proneLength / 2);
  const heels = at(P.proneLength - P.legRadius);
  add(shoulders, pelvis, P.torsoRadius);
  out.pop(); // the pelvis joins the legs' first circle, the torso's radius
  const seam = out.length;
  add(pelvis, heels, P.legRadius);
  out[seam]!.r = Math.sqrt(P.torsoRadius * P.torsoRadius + (P.chainSpacing * P.chainSpacing) / 4); // the pelvis keeps the torso's width
  return out;
}

/**
 * How far from the pivot a lying body rests on what's under it: as far as the circles
 * that can't rise above the pivot reach. The pivot can't step off a ledge while they're
 * still on it, so nothing near the chest is left inside what the pivot stepped down from.
 */
export function restRadius(b: Lying, spec: BodySpec): number {
  if (!(b.lying > 0)) return spec.radius;
  let reach = spec.radius;
  const chain = chainOf(spec);
  for (let k = 0; k < chain.length; k++) {
    const n = chain[k]!;
    const at = Math.abs(n.at * b.lying);
    if (at <= spec.radius && at + n.r > reach) reach = at + n.r;
  }
  return reach;
}

/** One circle of a body's footprint on the ground: offset from the body's position, its radius, how far up the ground rises under it, and how far along the axis it is. */
export interface FootCircle {
  x: number;
  z: number;
  r: number;
  rise: number;
  at: number;
  /** How far the ground may rise under it, beyond a step, before that's a wall, not a slope. */
  allow: number;
}

/** A body's position's offsets, as far as lying down has grown it: `lying` 0, one circle; 1, the whole chain. */
export type Lying = Pick<BodyState, 'axis' | 'lying' | 'riseHead' | 'risePelvis' | 'riseFeet'>;

/**
 * A body's footprint, offset from its position: for a standing body one circle at its
 * centre; lying, the chain along its axis, each circle grown out from the standing
 * circle by how far down it is. Writes into `out` and returns it; `out`'s objects are
 * reused, so copy what you keep.
 */
export function footprint(b: Lying, spec: BodySpec, out: FootCircle[], axis: number = b.axis): FootCircle[] {
  const set = (k: number, x: number, z: number, r: number, rise: number, at: number, allow: number): void => {
    const c = (out[k] ??= { x: 0, z: 0, r: 0, rise: 0, at: 0, allow: 0 });
    c.x = x;
    c.z = z;
    c.r = r;
    c.rise = rise;
    c.at = at;
    c.allow = allow;
  };
  const f = b.lying;
  if (!(f > 0)) {
    set(0, 0, 0, spec.radius, 0, 0, 0);
    out.length = 1;
    return out;
  }
  const chain = chainOf(spec);
  const first = chain[0]!.at;
  const last = chain[chain.length - 1]!.at;
  const P = spec.parts;
  const pelvis = P.pivot - P.proneLength / 2;
  const fx = -dsin(axis);
  const fz = -dcos(axis);
  const tan = dtanDeg(spec.maxSlopeDeg);
  for (let k = 0; k < chain.length; k++) {
    const n = chain[k]!;
    const at = n.at * f;
    let rise: number;
    if (n.at > 0) rise = (b.riseHead * n.at) / first;
    else if (n.at >= pelvis) rise = pelvis < 0 ? (b.risePelvis * n.at) / pelvis : 0;
    else rise = b.risePelvis + ((b.riseFeet - b.risePelvis) * (n.at - pelvis)) / (last - pelvis);
    // Within the pivot's own circle a part can't rise more than the pivot can step: past
    // it, the body can pitch up onto what's under it, as far as a walkable slope allows.
    const beyond = Math.abs(at) - spec.radius;
    set(k, fx * at, fz * at, spec.radius + (n.r - spec.radius) * f, rise, at, beyond > 0 ? tan * beyond : 0);
  }
  out.length = chain.length;
  return out;
}
