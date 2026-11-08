import { dcos, dsin } from '../kernel/core/detmath';
import { smoothstep } from '../kernel/core/math';
import { makeTerrainSample } from '../kernel/world/heightfield';
import { surfaceLoudness } from '../kernel/world/surfaces';
import { bodyHeight, groundBelow, type BodySpec, type BodyState } from './body';
import { canMantle, keepOnGround, planMantleFrom, poseClear, type MantlePose } from './mantle';
import { requestStance } from './stance';
import type { MotorContext, MoveIntent } from './motor';
import type { Solids } from '../kernel/world/solids';
import type { World } from '../kernel/world/world';
import type { Tuning } from '../../config/tuning';

/**
 * A ladder (lab C, C5; the motor mode Source's ladders are, with Half-Life 2's dismount
 * poses checked before use). A body takes one with the climb press, from its foot or its
 * top, and moves up and down it with the forward and back keys, at the ladder's own rate,
 * on the ladder's own line. Getting off the top is a mantle over the edge (checked pose by
 * pose before it starts, and again every tick); getting off the bottom is stepping off.
 *
 * Promises (motor.ts, and the invariant run): every pose on the ladder is re-checked
 * every tick against everything solid and every other body, with no step allowance; the
 * body rises no faster than the ladder's rate, and leaves only by a checked way off.
 */

/** A ladder in the world: its foot, the height it reaches, and the direction away from what it's fixed to. */
export interface Ladder {
  x: number;
  z: number;
  y0: number;
  y1: number;
  ox: number;
  oz: number;
}

declare module '../kernel/world/world' {
  interface World {
    /** Ladders a body can climb (body/ladder.ts); set where a world has some. Absent means none. */
    ladders?: readonly Ladder[];
  }
}

const NONE: readonly Ladder[] = [];

/** The ladders a world has: its own (a scene's), or those on its camp's towers (lab D). */
export function laddersOf(world: World): readonly Ladder[] {
  return world.ladders ?? world.camp?.ladders ?? NONE;
}

/**
 * A ladder as navigation sees it (lab E): the two places it joins, and how long the climb
 * takes: from the spot at its foot up to the landing on the deck (checked here as a
 * mantle, the same way off the top a body takes).
 */
export interface LadderLink {
  index: number;
  footX: number;
  footY: number;
  footZ: number;
  topX: number;
  topY: number;
  topZ: number;
  seconds: number;
}

/** Every ladder's link in `world`, for a body of `spec`. Empty where a world has none. */
export function ladderLinks(world: World, solids: Solids, spec: BodySpec, tuning: Tuning): LadderLink[] {
  const ladders = laddersOf(world);
  const links: LadderLink[] = [];
  const ctx: MotorContext = { world, solids, tuning, dt: 1 / tuning.sim.tickHz, tick: 0, source: 0, others: [], emit: () => 0 };
  ladders.forEach((l, index) => {
    ladderLine(l, spec, line);
    const top = ladderTop(l, spec);
    const off = planMantleFrom(null, line.x, top, line.z, -l.ox, -l.oz, spec, ctx, false);
    if (!off) return;
    const P = off.points;
    const n = P.length;
    links.push({ index, footX: line.x, footY: l.y0, footZ: line.z, topX: P[n - 3]!, topY: P[n - 2]!, topZ: P[n - 1]!, seconds: (top - l.y0) / spec.ladder.upRate + off.legs.reduce((a, b) => a + b, 0) });
  });
  return links;
}

/** A ladder under way: plain data in the state tree. */
export interface LadderState {
  /** Which of the world's ladders. */
  index: number;
  /** Getting onto it: where it started from, and how far through the reach for it. */
  fromX: number;
  fromZ: number;
  t: number;
  /** Metres climbed since the last rung, for its sound. */
  stride: number;
}

/** Where a body stands on a ladder: the foot, out along the ladder's facing by the body's radius. */
export function ladderLine(l: Ladder, spec: BodySpec, out: { x: number; z: number }): { x: number; z: number } {
  const d = spec.radius + spec.ladder.standoff;
  out.x = l.x + l.ox * d;
  out.z = l.z + l.oz * d;
  return out;
}

const line = { x: 0, z: 0 };

/** What a press would do right now: climb onto a ladder, mantle what's in front, or nothing. Reads the world and changes nothing. */
export function climbPrompt(b: BodyState, spec: BodySpec, ctx: MotorContext): '' | 'ladder' | 'mantle' {
  if (ladderInReach(b, spec, ctx) >= 0) return 'ladder';
  return canMantle(b, spec, ctx) ? 'mantle' : '';
}
const pose: MantlePose = { x: 0, y: 0, z: 0 };

/** The highest a body climbs on a ladder, feet: the rest of the way is the mantle over the top. */
export function ladderTop(l: Ladder, spec: BodySpec): number {
  return l.y1 - spec.ladder.topGap;
}

/**
 * The ladder a press would take, from the body's foot or its top, or −1. From the foot
 * facing it, within reach of its line, its feet near the ladder's foot; or from the deck
 * near its top.
 */
export function ladderInReach(b: BodyState, spec: BodySpec, ctx: MotorContext): number {
  const ladders = laddersOf(ctx.world);
  if (ladders.length === 0) return -1;
  if (b.motor !== 'ground' || b.sliding || b.proneTransition || b.stance === 'prone' || b.lying > 0) return -1;
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < ladders.length; k++) {
    const l = ladders[k]!;
    ladderLine(l, spec, line);
    const dx = line.x - b.x;
    const dz = line.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const footing = Math.abs(b.y - l.y0) < spec.ladder.footing;
    const onTop = Math.abs(b.y - l.y1) < spec.ladder.footing;
    if (!footing && !onTop) continue;
    // On the deck, the ladder's top is further from where a body can stand.
    if (d >= (onTop ? spec.ladder.topReach : spec.ladder.reach) || d >= bestD) continue;
    // Facing it: at its foot looking at the ladder; on top, looking at it, the way down.
    const along = d > 1e-6 ? (fx * dx + fz * dz) / d : 1;
    if (along < spec.ladder.facingCos && d > 0.05) continue;
    best = k;
    bestD = d;
  }
  return best;
}

/** Takes the ladder: from the foot or from the top. True if it did. */
export function startLadder(b: BodyState, spec: BodySpec, ctx: MotorContext, index: number): boolean {
  const l = laddersOf(ctx.world)[index]!;
  ladderLine(l, spec, line);
  const fromTop = Math.abs(b.y - l.y1) < spec.ladder.footing && b.y > l.y0 + spec.ladder.footing;
  if (fromTop) return startFromTop(b, spec, ctx, index, l);
  b.ladder = { index, fromX: b.x, fromZ: b.z, t: 0, stride: 0 };
  b.motor = 'ladder';
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.sliding = false;
  b.standingOn = -1;
  return true;
}

/** Getting on from the top: the way off, run backwards (checked pose by pose, every tick). */
function startFromTop(b: BodyState, spec: BodySpec, ctx: MotorContext, index: number, l: Ladder): boolean {
  ladderLine(l, spec, line);
  const top = ladderTop(l, spec);
  // The same way off the top, from the ladder's pose, facing the deck, run backwards.
  const out = planMantleFrom(b, line.x, top, line.z, -l.ox, -l.oz, spec, ctx, true);
  if (!out) return false;
  out.then = index;
  if (b.stance !== 'crouch') requestStance(b, 'crouch', spec, ctx);
  b.mantle = out;
  b.motor = 'mantle';
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.sliding = false;
  return true;
}

/** One tick on a ladder: up or down it, off at either end, or letting go. */
export function stepLadder(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext): void {
  const s = b.ladder!;
  const l = laddersOf(ctx.world)[s.index]!;
  ladderLine(l, spec, line);
  const L = spec.ladder;
  const dt = ctx.dt;
  // Reaching for the rungs first.
  if (s.t < L.reachTime) {
    s.t = Math.min(L.reachTime, s.t + dt);
    const f = smoothstep(0, 1, s.t / L.reachTime);
    pose.x = s.fromX + (line.x - s.fromX) * f;
    pose.z = s.fromZ + (line.z - s.fromZ) * f;
    pose.y = b.y;
    keepOnGround(ctx.world, pose); // uneven ground under the reach stays under the feet
    if (poseClear(pose.x, pose.y, pose.z, bodyHeight(b, spec), spec, ctx)) {
      b.speed = Math.sqrt((pose.x - b.x) * (pose.x - b.x) + (pose.z - b.z) * (pose.z - b.z)) / dt;
      b.y = pose.y;
      b.x = pose.x;
      b.z = pose.z;
    } else {
      b.ladder = null;
      b.motor = 'ground';
    }
    return;
  }
  b.x = line.x;
  b.z = line.z;
  // A press lets go: it falls from here.
  if (i.climb) {
    b.ladder = null;
    b.motor = 'air';
    b.speed = 0;
    return;
  }
  const up = i.climbAxis;
  const rate = up > 0 ? L.upRate : L.downRate;
  const next = b.y + up * rate * dt;
  const top = ladderTop(l, spec);
  if (up > 0 && b.y >= top - 1e-6) {
    // At the top: over the edge, if there's a way.
    const out = planMantleFrom(b, b.x, b.y, b.z, -l.ox, -l.oz, spec, ctx, false);
    if (out) {
      // Over the edge crouched, as it was checked, and upright again on the far side.
      out.stand = b.stance === 'stand';
      if (out.stand) requestStance(b, 'crouch', spec, ctx);
      b.mantle = out;
      b.motor = 'mantle';
      b.ladder = null;
    }
    b.speed = 0;
    return;
  }
  // The bottom is the ladder's foot, or the ground at its line if that's higher.
  if (up < 0 && next <= Math.max(l.y0, groundBelow(ctx.world, ctx.solids, b.x, b.z, b.y, spec.radius).height)) {
    // Stepping off onto whatever is there; from a foot that hangs above the ground, dropping to it.
    const g = groundBelow(ctx.world, ctx.solids, b.x, b.z, b.y + spec.stepHeight, spec.radius);
    b.ladder = null;
    b.speed = 0;
    if (b.y - g.height > spec.groundSnap) {
      b.motor = 'air';
      return;
    }
    b.y = g.height;
    b.surface = g.surface;
    b.standingOn = g.collider;
    b.slopeTan = g.collider >= 0 ? 0 : ctx.world.terrain.sample(b.x, b.z, sample).slopeTan;
    b.motor = 'ground';
    return;
  }
  // A body that took it from below its foot climbs from where it is, not from the foot in one tick.
  const y = Math.min(top, Math.max(Math.min(b.y, l.y0), next));
  if (y !== b.y && poseClear(b.x, y, b.z, bodyHeight(b, spec), spec, ctx)) {
    const moved = Math.abs(y - b.y);
    b.y = y;
    b.speed = moved / dt;
    s.stride += moved;
    // A rung under each step: a footstep, as loud as its pace.
    if (s.stride >= L.rung) {
      s.stride -= L.rung;
      const T = ctx.tuning;
      const loudness = T.noise.ladder * surfaceLoudness(b.surface, T);
      ctx.emit({ type: 'footstep', source: ctx.source, x: b.x, y: b.y, z: b.z, surface: b.surface, loudness, radius: loudness * T.noise.radiusPerUnit, gait: 'crouch' });
    }
  } else {
    b.speed = 0;
  }
}

const sample = makeTerrainSample();
