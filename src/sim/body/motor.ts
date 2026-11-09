import type { Tuning } from '../../config/tuning';
import { DEG, datan, dtanDeg } from '../kernel/core/detmath';
import { clamp, smoothstep, wrapAngle } from '../kernel/core/math';
import type { EventDraft } from '../kernel/events';
import type { World } from '../kernel/world/world';
import { Blocks, pushOutCircle } from '../kernel/world/colliders';
import { makeTerrainSample } from '../kernel/world/heightfield';
import type { Solids } from '../kernel/world/solids';
import { surfaceLoudness, surfaceName, type Surface } from '../kernel/world/surfaces';
import { RIM, bodyHeight, groundBelow, pushHistory, restBelow, rimExcess, type BodySpec, type BodyState, type Gait, type MotorModeName } from './body';
import { footprint, restRadius, type FootCircle } from './chain';
import { footfall } from './footfall';
import { stepLean } from './lean';
import { ladderInReach, startLadder, stepLadder } from './ladder';
import { drawMantle, startMantle, stepMantle } from './mantle';
import { eyeOf } from './shape';
import type { DebugDraw } from '../kernel/debugDraw';

/**
 * The shared motor: how any body moves. An intent says what the body wants (a velocity,
 * a gait, a facing); the motor decides what it gets, under one set of rules for slopes,
 * steps, collision, falls and footsteps. The player's intent comes from input
 * (game/player.ts); the guards' will come from their routines and brains.
 *
 * Movement is deliberately weighty: speed builds over a few tenths of a second, climbing
 * slows you, and changing into or out of prone takes three quarters of a second during
 * which you can only crawl.
 *
 * Modes. A body is in one motor mode at a time. Each mode drives the body's velocity its
 * own way: on the ground with traction (or sliding, on ground too steep to stand on), in
 * the air not at all. Moving and settling are shared: collision, finding the ground,
 * following it or falling, landing, footsteps. Settling picks the next mode. A mode that
 * moves along a path of its own, such as lab C's mantle or ladder, replaces both.
 *
 * Invariants (tests/invariants.test.ts, tests/steep.test.ts, tests/solids.test.ts):
 * - in every mode, the body never ends a tick inside anything solid or under the terrain,
 *   and never rises more than stepHeight in one tick; solid geometry (the world's
 *   colliders and entities' shapes, world/solids.ts) always beats other bodies, which can
 *   shove it but never through a wall. Entities' shapes hold this only because whatever
 *   moves one never moves it into a body;
 * - on the ground, the body never gains height on ground steeper than maxSlopeDeg, from
 *   any angle of approach;
 * - a lean (lean.ts) keeps the head and shoulders clear of anything solid, of the terrain and of
 *   other bodies, and grows by no more than its rate. (The world can force it back faster.)
 * - a lying body (chain.ts) is a chain of circles along its axis, every one of which keeps
 *   every promise above; it grows out of the standing circle over the stance change and
 *   turns by the largest step that keeps every part clear, found with a fixed number of
 *   bisections. It gets up only with headroom along its whole length, and draws in only
 *   as far as it ends the tick clear, waiting (and able to crawl) where there's no room.
 *   No end of it rises more than stepHeight in a tick, and only colliders within a step
 *   of its feet or the terrain under it count as what it rests on (body.ts, restBelow).
 *   Its head, torso and legs are inside the chain, so they are clear too;
 * - in a mantle (mantle.ts) the body follows a path whose every pose is re-checked every
 *   tick: never inside anything solid, with no allowance for steps, and never inside
 *   another body; it waits for what's in the way, and gives up if it stays. Only colliders can be
 *   mantled, never the terrain, and never onto ground too steep to stand on;
 * - on a ladder (ladder.ts) the same: every pose re-checked every tick, the rise no
 *   faster than the ladder's rate, and getting off only by a way checked pose by pose.
 * A new mode states its own invariants here and adds them to the invariant run.
 *
 * Ground steeper than maxSlopeDeg is not ground you can stand on: you can't climb it, and
 * on it you slide, the way scree or a rock face would carry you down. Walking off an edge
 * steeper than gravity can follow is a fall, and every fall or slide ends in a landing
 * that makes a sound.
 */

/** What a body wants to do this tick. */
export interface MoveIntent {
  /** The tick this intent is for. The motor treats a stale intent as standing still. */
  tick: number;
  /** Wished horizontal velocity in the world frame, m/s, before terrain: the motor applies slopes. */
  wishX: number;
  wishZ: number;
  gait: Gait;
  /** Facing and view pitch to take. */
  yaw: number;
  pitch: number;
  /** Leaning left (−1), right (1) or not at all (0). */
  lean: number;
  /** With a weapon or optic up, a lean goes all the way rather than peeking. */
  raised: boolean;
  /** Mantle what's in front or take a ladder, if there is one. */
  climb: boolean;
  /** Up (1) or down (−1) a ladder, while on one. */
  climbAxis: number;
  /** How much louder its steps are: 1, or more with a load (game/use.ts). */
  load: number;
  /** It's dragging something: a scrape with each step (game/use.ts). */
  scrape: boolean;
}

export function idleIntent(b: BodyState, tick: number, out: MoveIntent): MoveIntent {
  out.tick = tick;
  out.wishX = 0;
  out.wishZ = 0;
  out.gait = 'idle';
  out.yaw = b.yaw;
  out.pitch = b.pitch;
  out.lean = 0;
  out.raised = false;
  out.climb = false;
  out.climbAxis = 0;
  out.load = 1;
  out.scrape = false;
  return out;
}

/** Another body, as the motor sees it: an upright cylinder that can shove and be shoved. */
export interface Cylinder {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface MotorContext {
  world: World;
  /** The world's colliders and entities' solid shapes (kernel/world/solids.ts). */
  solids: Solids;
  tuning: Tuning;
  dt: number;
  tick: number;
  /** Who this body is, for the events it makes. */
  source: number;
  /** Every other body this one can collide with. */
  others: ReadonlyArray<Cylinder>;
  emit: (e: EventDraft) => number;
  /**
   * The controller overlay (debug view only): draws this body's rim probes, slope and
   * every push of its resolve passes. Drawing only: the motor does the same with or without.
   */
  draw?: DebugDraw | null;
}

interface MotorMode {
  /** Sets this tick's velocity from the intent. */
  drive(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext, tanMax: number): void;
}

const MODES: Record<Exclude<MotorModeName, 'mantle' | 'ladder'>, MotorMode> = {
  ground: { drive: driveGround },
  air: { drive: driveAir },
};

const sample = makeTerrainSample();
const ids: number[] = [];
const push = { x: 0, z: 0 };
const tmpPush = { x: 0, z: 0 };
const dest = { x: 0, z: 0 };
const leanEye = { x: 0, y: 0, z: 0 };
const feetCircles: FootCircle[] = [];
const turnCircles: FootCircle[] = [];

/** Moves a body one tick toward what it intends. */
export function stepMotor(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext): void {
  const tanMax = dtanDeg(spec.maxSlopeDeg);

  pushHistory(b);
  b.yaw = i.yaw;
  b.pitch = clamp(i.pitch, -spec.pitchLimit, spec.pitchLimit);
  const eye = b.eyeHeight;
  const timer = b.stanceTimer;
  const changing = b.proneTransition;
  easeStance(b, spec, ctx.dt);
  if (i.climb && b.motor === 'ground' && !(b.lying > 0)) {
    // A ladder in reach takes the press; otherwise whatever can be mantled.
    const ladder = ladderInReach(b, spec, ctx);
    if (ladder < 0 || !startLadder(b, spec, ctx, ladder)) startMantle(b, spec, ctx);
  }
  // On a path of their own the legs are climbing, not running, whatever the body arrived at.
  if (b.motor === 'mantle' || b.motor === 'ladder') b.gait = i.gait === 'sprint' ? 'walk' : i.gait;
  if (b.motor === 'mantle') stepMantle(b, spec, ctx);
  else if (b.motor === 'ladder') stepLadder(b, i, spec, ctx);
  else if (moveBody(b, i, spec, ctx, tanMax)) {
    // No room yet to draw the body in: it gets up when there is, not before.
    b.eyeHeight = eye;
    b.stanceTimer = timer;
    b.proneTransition = changing;
  }
  stepLean(b, i, spec, ctx);
  if (ctx.draw) {
    drawController(ctx.draw, b, spec, ctx.world, tanMax);
    drawMantle(ctx.draw, b, spec, ctx);
  }
}

/**
 * A tick of the modes that drive a velocity (on the ground, in the air): move and collide,
 * settle, footsteps and landing. Returns true if a body getting up couldn't draw in this tick.
 */
function moveBody(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext, tanMax: number): boolean {
  const { world, tuning, dt } = ctx;
  MODES[b.motor as 'ground' | 'air'].drive(b, i, spec, ctx, tanMax);

  // --- Move and collide, the body as long as it will be this tick. ---------------------
  const feet = b.y;
  const was = b.lying;
  // Where it starts: a lying body that can't end the tick clear goes back to here.
  const startX = b.x;
  const startZ = b.z;
  const startAxis = b.axis;
  const startLying = b.lying;
  const startSurface = b.surface;
  const startOn = b.standingOn;
  const startSlope = b.slopeTan;
  const grew = growLying(b, spec, ctx.dt);
  const vx = b.vx;
  const vz = b.vz;
  const toX = b.x + vx * dt;
  const toZ = b.z + vz * dt;
  if (!resolveMove(b, toX, toZ, spec, ctx, dest)) {
    if (grew) {
      // No room to grow into: it stays as long as it was.
      b.lying = was;
      resolveMove(b, b.x, b.z, spec, ctx, dest);
    } else if (b.lying < was) {
      // No room at the shorter length. If the move works at the length it has, it keeps
      // that length, so a body held down in a tight place can still crawl out of it.
      const shorter = b.lying;
      b.lying = was;
      b.vx = vx;
      b.vz = vz;
      if (!resolveMove(b, toX, toZ, spec, ctx, dest)) b.lying = shorter;
    }
  }
  const nx = dest.x;
  const nz = dest.z;
  const mdx = nx - b.x;
  const mdz = nz - b.z;
  const movedDist = Math.sqrt(mdx * mdx + mdz * mdz);

  // --- Settle: follow the ground, fall or land. ----------------------------------
  const under = groundBelow(world, ctx.solids, nx, nz, feet + spec.stepHeight, restRadius(b, spec));
  const ground = { height: under.height, surface: under.surface, collider: under.collider };
  // Lying, the pivot steps down off a ledge only once the circles still on it could rest
  // where they are from the lower height: until then it comes down only as far as they allow.
  if (b.lying > 0 && ground.height < feet) ground.height = Math.max(ground.height, restFloor(b, nx, nz, spec, ctx));
  const destSlope = ground.collider >= 0 ? 0 : world.terrain.sample(nx, nz, sample).slopeTan;
  const drop = feet - ground.height;
  const wasFalling = b.motor !== 'ground' || b.sliding;
  const fallSpeed = -b.vy;
  // How far the ground may fall away and still be followed: on walkable ground, a step
  // down (groundSnap); on ground too steep to stand on, only as far as gravity could
  // carry the body this tick. Steeper than that, and the body leaves the ground.
  const follow =
    destSlope > tanMax ? Math.max(0, -b.vy) * dt + 0.5 * tuning.sim.gravity * dt * dt + 0.005 : tanMax * movedDist + spec.groundSnap;
  let landed = false;
  /** Speed at the moment of touching down from a fall, m/s. */
  let contact = 0;
  if (b.motor === 'ground' && b.vy <= 0 && drop <= follow) {
    b.y = ground.height;
    // Sliding keeps its descent rate, so gravity keeps building it; walkable ground stops it.
    b.vy = destSlope > tanMax ? -drop / dt : 0;
    b.motor = 'ground';
    landed = b.sliding && destSlope <= tanMax;
  } else if (feet > ground.height) {
    // Exact under constant gravity, so a fall from h takes √(2h/g) and lands at √(2gh)
    // at any tick rate; the speed at touchdown is the speed when the ground is reached
    // within the tick, not at its start.
    const g = tuning.sim.gravity;
    const v0 = b.vy;
    b.vy = v0 - g * dt;
    b.y = feet + v0 * dt - 0.5 * g * dt * dt;
    if (b.y <= ground.height) {
      contact = Math.sqrt(Math.max(0, v0 * v0 + 2 * g * (feet - ground.height)));
      b.y = ground.height;
      landed = true;
      b.vy = destSlope > tanMax ? b.vy : 0;
      b.motor = 'ground';
    } else {
      b.motor = 'air';
    }
  } else {
    b.y = ground.height;
    landed = wasFalling && destSlope <= tanMax;
    b.vy = 0;
    b.motor = 'ground';
  }
  const impact = landed ? Math.max(fallSpeed, -b.vy, contact) : 0;
  if (landed && destSlope <= tanMax) b.vy = 0;

  // --- Footsteps. --------------------------------------------------------------------
  // Noise and stride follow how fast the body actually moves, not the requested gait:
  // diving prone from a sprint is loud until you've stopped. Shoves from others move the
  // body but aren't steps.
  const x0 = b.x;
  const z0 = b.z;
  b.x = nx;
  b.z = nz;
  b.speed = movedDist / dt;
  b.gait = i.gait;
  b.surface = ground.surface;
  b.standingOn = ground.collider;
  b.slopeTan = destSlope;
  const step = footfall(b.speed, spec, tuning.noise);
  b.loudness = b.speed < 0.05 ? 0 : step.loudness * surfaceLoudness(ground.surface, tuning) * i.load;
  // Steps are what the legs did: the body's own speed over the tick, never more than it
  // actually moved. Another body shoving a still one moves it without a single step.
  const walked = Math.min(movedDist, Math.sqrt(b.vx * b.vx + b.vz * b.vz) * dt);
  if (b.motor === 'ground' && !b.sliding && walked > 0 && b.loudness > 0) {
    const before = b.stride;
    b.stride += walked;
    if (b.stride >= step.stride) {
      // The foot comes down part way through the tick, where the stride runs out: the step
      // happens at that moment and place, not at the tick's end, so steps keep an even
      // rhythm whatever the tick rate (a sprint's 9.3 ticks a step would otherwise beat 9,
      // 9, 10), and the camera's dip (headBob) lands on the sound.
      const f = clamp((step.stride - before) / walked, 1e-6, 1);
      // Keep less than a stride of carry-over, so a sudden slow-down never fires twice.
      b.stride = Math.min(b.stride - step.stride, 0.5 * step.stride);
      ctx.emit({
        type: 'footstep',
        source: ctx.source,
        t: ctx.tick / tuning.sim.tickHz - (1 - f) * dt,
        x: x0 + (b.x - x0) * f,
        y: feet + (b.y - feet) * f,
        z: z0 + (b.z - z0) * f,
        surface: ground.surface,
        loudness: b.loudness,
        radius: b.loudness * tuning.noise.radiusPerUnit,
        gait: soundGait(b, spec),
      });
      if (i.scrape) {
        // Dragging something, a scrape with every step: loudest on gravel and metal.
        const loudness = dragLoudness(ground.surface, tuning);
        ctx.emit({ type: 'drag', source: ctx.source, x: b.x, y: b.y, z: b.z, surface: ground.surface, loudness, radius: loudness * tuning.noise.radiusPerUnit });
      }
    }
  }
  // Lying: the body turns, by what it can, and settles along the ground under it. The
  // final pose is checked exactly as the invariant watch will check it: the circles were
  // cleared against heights the settling may since have changed, and a promise that holds
  // only most of the time isn't one. Getting up, the last step to a standing circle is
  // checked too. A body that can't draw in stays as long as it was and tries again next
  // tick; anything else goes back to where it started, unless it's falling or sliding,
  // when the fall goes on.
  if (b.lying > 0) {
    turnAxis(b, spec, ctx, tanMax);
    lieAlongGround(b, spec, ctx, feet);
  }
  if ((b.lying > 0 || startLying > 0) && !chainEndClear(b, spec, ctx)) {
    if (b.lying < startLying) {
      b.lying = startLying;
      lieAlongGround(b, spec, ctx, feet);
    }
    if (b.motor === 'ground' && !b.sliding && !chainEndClear(b, spec, ctx)) {
      b.x = startX;
      b.z = startZ;
      b.y = feet;
      b.axis = startAxis;
      b.lying = startLying;
      b.vx = 0;
      b.vz = 0;
      b.vy = 0;
      b.surface = startSurface;
      b.standingOn = startOn;
      b.slopeTan = startSlope;
      if (b.lying > 0) lieAlongGround(b, spec, ctx, feet);
    }
  }
  const L = tuning.noise.landing;
  if (impact >= L.minSpeed) {
    const loudness = Math.min(L.max, impact * L.perSpeed) * surfaceLoudness(ground.surface, tuning);
    ctx.emit({
      type: 'land',
      source: ctx.source,
      x: b.x,
      y: b.y,
      z: b.z,
      surface: ground.surface,
      speed: impact,
      loudness,
      radius: loudness * tuning.noise.radiusPerUnit,
    });
    b.stride = 0;
  }
  return b.stance !== 'prone' && startLying > 0 && b.lying === startLying;
}

/**
 * The controller overlay: the body's circle, its rim probes (red where the terrain
 * inside the rim rises more than a step), where it is heading, and a label with the
 * slope against the limit, sliding, what it stands on and its motor mode.
 */
function drawController(d: DebugDraw, b: BodyState, spec: BodySpec, world: World, tanMax: number): void {
  const r = spec.radius;
  const y = b.y + 0.04;
  if (b.lying > 0) {
    // The chain of circles the body is, lying down, and the axis it pivots on.
    const circles = footprint(b, spec, feetCircles);
    for (let k = 0; k < circles.length; k++) {
      const C = circles[k]!;
      d.circle(b.x + C.x, b.y + C.rise + 0.04, b.z + C.z, C.r, 'info');
    }
    const head = circles[0]!;
    const heel = circles[circles.length - 1]!;
    d.line(b.x + head.x, y, b.z + head.z, b.x + heel.x, y, b.z + heel.z, 'info');
  } else {
    d.circle(b.x, y, b.z, r, b.sliding ? 'bad' : 'info');
  }
  for (let k = 0; k < RIM.length; k++) {
    const px = b.x + RIM[k]![0] * r;
    const pz = b.z + RIM[k]![1] * r;
    const h = world.terrain.heightAt(px, pz);
    d.point(px, h + 0.04, pz, 0.08, h - b.y > spec.stepHeight ? 'bad' : 'good');
  }
  if (b.speed > 0.05) d.line(b.x, y, b.z, b.x + b.vx * 0.5, y, b.z + b.vz * 0.5, 'info');
  const slope = datan(b.slopeTan) / DEG;
  const tone = b.sliding ? 'bad' : b.slopeTan > tanMax * 0.8 ? 'warn' : 'muted';
  const on = b.standingOn >= 0 ? ' · on an object' : '';
  const lean = b.lean !== 0 ? ` · lean ${b.lean > 0 ? 'right' : 'left'} ${Math.abs(b.lean).toFixed(2)} m` : '';
  const lying = b.lying > 0 && b.lying < 1 ? ` · lying ${(b.lying * 100).toFixed(0)}%` : '';
  d.label(b.x, b.y + bodyHeight(b, spec) + 0.35, b.z, `slope ${slope.toFixed(0)}° of ${spec.maxSlopeDeg}°${b.sliding ? ' · sliding' : ''}${on} · ${b.motor}${lean}${lying}`, tone);
  if (b.lean !== 0) {
    // The eye, where the lean has put it: the head guards target.
    const eye = eyeOf(b, spec, leanEye);
    d.line(b.x, eye.y, b.z, eye.x, eye.y, eye.z, 'info');
    d.circle(eye.x, eye.y, eye.z, spec.parts.headRadius, 'info');
  }
}

/** How loud dragging something over this surface is, each step. */
function dragLoudness(surface: Surface, tuning: Tuning): number {
  return tuning.noise.drag[surfaceName(surface)];
}

/**
 * What the legs are doing, for the sound of a step: the gait the body moves in, or, while
 * it coasts to a stop with no gait asked for, what its stance and speed say. Loudness
 * says how hard the step is; this says what kind of step it is, so a slow walk uphill
 * still sounds like walking.
 */
function soundGait(b: BodyState, spec: BodySpec): Exclude<Gait, 'idle'> {
  if (b.gait !== 'idle') return b.gait;
  if (b.stance === 'prone') return 'crawl';
  if (b.stance === 'crouch') return 'crouch';
  return b.speed > spec.speed.walk + 0.25 ? 'sprint' : 'walk';
}

/** The eye eases toward the stance's height; a prone change ends when its timer does. */
function easeStance(b: BodyState, spec: BodySpec, dt: number): void {
  if (b.stanceTimer > 0) {
    b.stanceTimer = Math.max(0, b.stanceTimer - dt);
    const t = b.stanceDuration > 0 ? 1 - b.stanceTimer / b.stanceDuration : 1;
    b.eyeHeight = b.eyeFrom + (spec.eyeHeight[b.stance] - b.eyeFrom) * smoothstep(0, 1, t);
    if (b.stanceTimer === 0) b.proneTransition = false;
  } else {
    b.eyeHeight = spec.eyeHeight[b.stance];
    b.proneTransition = false;
  }
}

/**
 * On the ground: speed builds toward the wish, which slopes bend. Uphill slows the body,
 * and on ground too steep to stand on no part of the wish may go uphill, whatever the
 * angle; there the body has no traction and slides down instead.
 */
function driveGround(b: BodyState, i: MoveIntent, spec: BodySpec, ctx: MotorContext, tanMax: number): void {
  const dt = ctx.dt;
  let wishX = i.wishX;
  let wishZ = i.wishZ;
  ctx.world.terrain.sample(b.x, b.z, sample);
  if (b.standingOn < 0 && (wishX !== 0 || wishZ !== 0)) {
    const up = wishX * sample.gx + wishZ * sample.gz; // metres up per second, along the wish
    if (sample.slopeTan > tanMax) {
      if (up > 0) {
        const k = up / (sample.slopeTan * sample.slopeTan);
        wishX -= sample.gx * k;
        wishZ -= sample.gz * k;
      }
    } else if (up > 0) {
      const ws = Math.sqrt(wishX * wishX + wishZ * wishZ);
      const f = 1 - (1 - spec.uphillSlowdown) * (up / ws / tanMax);
      wishX *= f;
      wishZ *= f;
    }
  }

  b.sliding = b.standingOn < 0 && sample.slopeTan > tanMax;
  if (b.sliding) {
    const s = sample.slopeTan;
    // Nor may the speed the body arrived with carry it uphill: keep only what goes across
    // the slope and down it. A body that arrives moving uphill (crawling off a rock onto
    // ground a hair too steep, or sprinting onto a steep band) would otherwise coast up
    // and over onto walkable ground; the fuzz run found it in NEM-4083.
    const up = b.vx * sample.gx + b.vz * sample.gz;
    if (up > 0) {
      const k = up / (s * s);
      b.vx -= sample.gx * k;
      b.vz -= sample.gz * k;
    }
    // Gravity along the slope, projected onto the ground plane: g·sinθ·cosθ downhill.
    const a = (ctx.tuning.sim.gravity * s) / (1 + s * s);
    b.vx -= (sample.gx / s) * a * dt;
    b.vz -= (sample.gz / s) * a * dt;
  } else {
    const dvx = wishX - b.vx;
    const dvz = wishZ - b.vz;
    const dvl = Math.sqrt(dvx * dvx + dvz * dvz);
    if (dvl > 0) {
      const speedingUp = wishX * wishX + wishZ * wishZ > b.vx * b.vx + b.vz * b.vz;
      const rate = (speedingUp ? spec.accel : spec.decel) * dt;
      const k = dvl > rate ? rate / dvl : 1;
      b.vx += dvx * k;
      b.vz += dvz * k;
    }
  }
}

/** In the air there is nothing to push against: the body keeps its velocity and falls. */
function driveAir(b: BodyState): void {
  b.sliding = false;
}

/**
 * Moves the body toward (tx, tz) and writes where it can actually end the tick to `out`.
 *
 * Each pass resolves, in order: other bodies (soft, may shove), terrain (no gaining
 * height on ground too steep to stand on, and no rising faster than a walkable slope
 * allows), and colliders, the world's and entities' (hard, always win). A ceiling the body is deep under but
 * no longer fits beneath (the ground rose) is never pushed out of sideways; a shallow
 * overlap at its edge is. If anything still overlaps after the passes, the body stays
 * where it was. That keeps every tick's end position clear, by induction from a clear
 * spawn.
 */
export function resolveMove(b: BodyState, tx: number, tz: number, spec: BodySpec, ctx: MotorContext, out: { x: number; z: number }): boolean {
  const { world, solids } = ctx;
  const height = bodyHeight(b, spec);
  const feet = b.y;
  const tanMax = dtanDeg(spec.maxSlopeDeg);
  const circles = footprint(b, spec, feetCircles);
  const lying = circles.length > 1;
  // A lying body that's falling must be clear at the height it falls to, which isn't known
  // yet: its circles are taken as low as the tick can take it (the pivot is what the body
  // rests on, not its ends, so a leg resting on a rock doesn't hold it up).
  const low = lying ? fallFloor(b, spec, ctx) : feet;
  let nx = tx;
  let nz = tz;

  for (let iter = 0; iter < 4; iter++) {
    let moved = false;

    for (const o of ctx.others) {
      if (o.y > feet + height || o.y + o.height < feet) continue;
      for (let c = 0; c < circles.length; c++) {
        const C = circles[c]!;
        const dx = nx + C.x - o.x;
        const dz = nz + C.z - o.z;
        const rr = C.r + o.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const k = Math.min(rr - d, spec.shoveMax) / d;
          ctx.draw?.line(nx, feet + 0.1, nz, nx + dx * k, feet + 0.1, nz + dz * k, 'warn');
          nx += dx * k;
          nz += dz * k;
          cancelInto(b, dx * k, dz * k);
          moved = true;
        }
      }
    }

    if (terrainBlocks(world, b, nx, nz, feet, tanMax, spec.stepHeight)) {
      // Slide along the contour of the slope at the destination: keep no uphill part.
      world.terrain.sample(nx, nz, sample);
      const g2 = sample.gx * sample.gx + sample.gz * sample.gz;
      if (g2 > 1e-12) {
        let dx = nx - b.x;
        let dz = nz - b.z;
        const k = (dx * sample.gx + dz * sample.gz) / g2;
        if (k > 0) {
          dx -= sample.gx * k;
          dz -= sample.gz * k;
          ctx.draw?.line(nx, feet + 0.1, nz, b.x + dx, feet + 0.1, b.z + dz, 'info');
          nx = b.x + dx;
          nz = b.z + dz;
          const kv = (b.vx * sample.gx + b.vz * sample.gz) / g2;
          if (kv > 0) {
            b.vx -= sample.gx * kv;
            b.vz -= sample.gz * kv;
          }
          moved = true;
        }
      }
    }

    for (let c = 0; c < circles.length; c++) {
      const C = circles[c]!;
      if (rimPush(world, nx + C.x, nz + C.z, feet + C.allow, C.r, spec.stepHeight, push)) {
        // Terrain rising too high inside the body's circle (the foot of a steep face): back off.
        ctx.draw?.line(nx, feet + 0.1, nz, nx + push.x, feet + 0.1, nz + push.z, 'bad');
        nx += push.x;
        nz += push.z;
        cancelInto(b, push.x, push.z);
        moved = true;
      }
    }

    for (let k = 0; k < circles.length; k++) {
      const C = circles[k]!;
      const r = C.r;
      const g = restBelow(world, solids, nx + C.x, nz + C.z, low, C.allow, spec.stepHeight, r).height;
      const base = Math.max(low - C.allow, g);
      const reach = lying ? base : feet;
      // The band's top from as high as this tick can leave it, so what's overhead now still will be.
      const top = lying ? highFeet(b, nx, nz, spec, ctx) : 0;
      const head = (lying ? Math.max(top - C.allow, restBelow(world, solids, nx + C.x, nz + C.z, top, C.allow, spec.stepHeight, r).height) : base) + height;
      solids.query(nx + C.x - r - 0.1, nz + C.z - r - 0.1, nx + C.x + r + 0.1, nz + C.z + r + 0.1, ids);
      for (let q = 0; q < ids.length; q++) {
        const c = solids.get(ids[q]!);
        if ((c.flags & Blocks.Move) === 0) continue;
        if (c.y1 <= reach + spec.stepHeight) continue; // low enough to step onto
        if (c.y0 >= head) continue; // overhead
        if (!pushOutCircle(c, nx + C.x, nz + C.z, r, push)) continue;
        // It was above our head and over us at the start, and the ground has risen: a
        // ceiling we no longer fit beneath. If the body's centre is under it, that's not a
        // wall to slide off (pushing out could throw the body metres): leave it to isClear.
        // If only the rim is under its edge, slide out like from a wall.
        if (c.y0 >= reach + height && pushOutCircle(c, b.x + C.x, b.z + C.z, r, tmpPush)) {
          const depth = Math.sqrt(push.x * push.x + push.z * push.z);
          if (depth > r) continue;
        }
        if (push.x * push.x + push.z * push.z < 1e-18) continue; // float dust, not a contact
        ctx.draw?.line(nx + C.x, feet + 0.1, nz + C.z, nx + C.x + push.x, feet + 0.1, nz + C.z + push.z, 'muted');
        nx += push.x;
        nz += push.z;
        cancelInto(b, push.x, push.z);
        moved = true;
      }
    }

    if (!moved) break;
  }

  const lim = world.playHalf;
  if (nx < -lim || nx > lim) {
    nx = clamp(nx, -lim, lim);
    b.vx = 0;
  }
  if (nz < -lim || nz > lim) {
    nz = clamp(nz, -lim, lim);
    b.vz = 0;
  }

  if (!isClear(b, nx, nz, spec, world, solids, tanMax, circles, false, low)) {
    b.vx = 0;
    b.vz = 0;
    out.x = b.x;
    out.z = b.z;
    return false;
  }
  out.x = nx;
  out.z = nz;
  return true;
}

/**
 * True if ending at (x, z) would gain height the terrain doesn't allow: climbing onto
 * ground too steep to stand on (from any angle), or rising faster than a walkable slope
 * over this move.
 */
function terrainBlocks(world: World, b: BodyState, x: number, z: number, feet: number, tanMax: number, stepHeight: number): boolean {
  world.terrain.sample(x, z, sample);
  const rise = sample.height - feet;
  if (sample.slopeTan > tanMax && rise > 0.002) return true;
  // Nor out of it: from ground too steep to stand on, across a seam to a higher, gentler
  // triangle, is still gaining height on ground you can't climb.
  if (b.standingOn < 0 && b.slopeTan > tanMax && rise > 0.002) return true;
  const dx = x - b.x;
  const dz = z - b.z;
  // 2 cm of slack absorbs the kink where two walkable triangles meet.
  return rise > Math.min(stepHeight, tanMax * Math.sqrt(dx * dx + dz * dz) + 0.02);
}

/**
 * The body is a circle, not a point: terrain rising more than a step inside its rim (the
 * foot of a steep face) pushes it back, so the face stays outside the body and away from
 * the camera. Writes the correction into `out`; returns false if the rim is clear.
 */
function rimPush(world: World, x: number, z: number, feet: number, r: number, stepHeight: number, out: { x: number; z: number }): boolean {
  let px = 0;
  let pz = 0;
  for (let k = 0; k < RIM.length; k++) {
    const ux = RIM[k]![0];
    const uz = RIM[k]![1];
    const excess = world.terrain.heightAt(x + ux * r, z + uz * r) - (feet + stepHeight);
    if (excess <= 0) continue;
    world.terrain.sample(x + ux * r, z + uz * r, sample);
    // Back off along the downhill direction far enough to drop the rim point below a step.
    const s = Math.max(sample.slopeTan, 1e-6);
    const back = Math.min(r, excess / s + 1e-4);
    px -= (sample.gx / s) * back;
    pz -= (sample.gz / s) * back;
  }
  const l2 = px * px + pz * pz;
  if (l2 < 1e-16) return false;
  const l = Math.sqrt(l2);
  const cap = Math.min(l, r) / l;
  out.x = px * cap;
  out.z = pz * cap;
  return true;
}

/**
 * True if the body can end the tick at (x, z): nothing solid inside it, no cliff under
 * it. `strict` asks for a pose it isn't already in (a turn, growth): that may not lean any
 * part further into a face.
 */
function isClear(b: BodyState, x: number, z: number, spec: BodySpec, world: World, solids: Solids, tanMax: number, circles: readonly FootCircle[], strict: boolean, low: number): boolean {
  const feet = b.y;
  const height = bodyHeight(b, spec);
  if (terrainBlocks(world, b, x, z, feet, tanMax, spec.stepHeight)) return false;
  const lying = circles.length > 1;
  for (let k = 0; k < circles.length; k++) {
    const C = circles[k]!;
    const r = C.r;
    const cx = x + C.x;
    const cz = z + C.z;
    // Never press further into a face than the body already is. (A body falling or sliding
    // beside a face is already overlapping it with its rim; moving away or along is fine.)
    const allowed = strict ? 0 : Math.max(0, rimExcess(world, b.x + C.x, b.z + C.z, feet + C.allow, r, spec.stepHeight));
    if (rimExcess(world, cx, cz, feet + C.allow, r, spec.stepHeight) > allowed + 1e-3) return false;
    const g = restBelow(world, solids, cx, cz, low, C.allow, spec.stepHeight, r).height;
    const base = Math.max(low - C.allow, g);
    const reach = lying ? base : feet;
    const high = lying ? Math.max(feet, groundBelow(world, solids, x, z, feet + spec.stepHeight, spec.radius).height) : feet;
    const head = (lying ? Math.max(high - C.allow, restBelow(world, solids, cx, cz, high, C.allow, spec.stepHeight, r).height) : base) + height;
    solids.query(cx - r, cz - r, cx + r, cz + r, ids);
    for (let q = 0; q < ids.length; q++) {
      const c = solids.get(ids[q]!);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= reach + spec.stepHeight || c.y0 >= head) continue;
      if (pushOutCircle(c, cx, cz, r, tmpPush) && tmpPush.x * tmpPush.x + tmpPush.z * tmpPush.z > 1e-8) return false;
    }
  }
  return true;
}

/**
 * The lowest a lying body's feet can be at the end of this tick: its height, less what
 * this tick can drop it (falling, or following a walkable slope down at its speed). A
 * lying body's circles are taken as low as that: the pivot is what the body rests on, not
 * its ends, so a leg resting on a rock doesn't hold it up, and a circle counted as standing
 * on something this tick mustn't find itself inside it at the tick's end.
 */
function fallFloor(b: BodyState, spec: BodySpec, ctx: MotorContext): number {
  const dt = ctx.dt;
  if (b.motor === 'ground' && !b.sliding && b.vy >= 0) {
    const v = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    return b.y - dtanDeg(spec.maxSlopeDeg) * v * dt - 0.002;
  }
  return b.y - Math.max(0, -b.vy) * dt - 0.5 * ctx.tuning.sim.gravity * dt * dt - 0.002;
}

/** The highest a lying body's pivot can be standing at (x, z) at the end of this tick. */
function highFeet(b: BodyState, x: number, z: number, spec: BodySpec, ctx: MotorContext): number {
  return Math.max(b.y, groundBelow(ctx.world, ctx.solids, x, z, b.y + spec.stepHeight, spec.radius).height);
}

/** Where a lying body is growing toward (1 down, 0 up), and the step it takes this tick. Returns whether it grew. */
function growLying(b: BodyState, spec: BodySpec, dt: number): boolean {
  const target = b.stance === 'prone' ? 1 : 0;
  if (b.lying === target) return false;
  const T = spec.stanceTime.prone;
  const step = T > 0 ? dt / T : 1;
  if (target === 1) {
    if (b.lying === 0) b.axis = b.yaw;
    b.lying = b.lying + step < 1 ? b.lying + step : 1;
    return true;
  }
  b.lying = b.lying - step > 0 ? b.lying - step : 0;
  return false;
}

/** The chain as it stands, turned to `axis`: every circle clear of what's solid and other bodies. */
function chainClear(b: BodyState, axis: number, spec: BodySpec, ctx: MotorContext, tanMax: number): boolean {
  const circles = footprint(b, spec, turnCircles, axis);
  if (!isClear(b, b.x, b.z, spec, ctx.world, ctx.solids, tanMax, circles, true, fallFloor(b, spec, ctx))) return false;
  const height = bodyHeight(b, spec);
  for (let k = 0; k < ctx.others.length; k++) {
    const o = ctx.others[k]!;
    if (o.y > b.y + height || o.y + o.height < b.y) continue;
    for (let c = 0; c < circles.length; c++) {
      const C = circles[c]!;
      const dx = b.x + C.x - o.x;
      const dz = b.z + C.z - o.z;
      const rr = C.r + o.radius;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
  }
  return true;
}

const TURN_BISECTIONS = 6;

/**
 * A lying body turns toward where it looks, at its turn rate, by the largest step that
 * keeps every part clear, found with a fixed number of bisections. The pivot is near the
 * chest, so the legs swing and the view stays steady.
 */
function turnAxis(b: BodyState, spec: BodySpec, ctx: MotorContext, tanMax: number): void {
  const d = wrapAngle(b.yaw - b.axis);
  if (d === 0) return;
  const max = spec.prone.turnRate * ctx.dt;
  const step = d > max ? max : d < -max ? -max : d;
  if (chainClear(b, b.axis + step, spec, ctx, tanMax)) {
    b.axis = wrapAngle(b.axis + step);
    return;
  }
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < TURN_BISECTIONS; k++) {
    const mid = (lo + hi) / 2;
    if (chainClear(b, b.axis + step * mid, spec, ctx, tanMax)) lo = mid;
    else hi = mid;
  }
  b.axis = wrapAngle(b.axis + step * lo);
}

/** The lowest the pivot can go at (x, z): low enough that every circle still rests within its reach of what's under it. */
function restFloor(b: BodyState, x: number, z: number, spec: BodySpec, ctx: MotorContext): number {
  const circles = footprint(b, spec, feetCircles);
  let floor = -Infinity;
  for (let k = 0; k < circles.length; k++) {
    const C = circles[k]!;
    const g = restBelow(ctx.world, ctx.solids, x + C.x, z + C.z, b.y, C.allow, spec.stepHeight, C.r).height;
    const needed = g - C.allow - spec.stepHeight;
    if (needed > floor) floor = needed;
  }
  return floor;
}

/** True if every circle of a lying body is clear at this very pose, judged as the invariant watch judges it. */
function chainEndClear(b: BodyState, spec: BodySpec, ctx: MotorContext): boolean {
  const height = bodyHeight(b, spec);
  const circles = footprint(b, spec, feetCircles);
  for (let k = 0; k < circles.length; k++) {
    const C = circles[k]!;
    const cx = b.x + C.x;
    const cz = b.z + C.z;
    const base = Math.max(b.y - C.allow, restBelow(ctx.world, ctx.solids, cx, cz, b.y, C.allow, spec.stepHeight, C.r).height);
    ctx.solids.query(cx - C.r, cz - C.r, cx + C.r, cz + C.r, ids);
    for (let q = 0; q < ids.length; q++) {
      const c = ctx.solids.get(ids[q]!);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= base + spec.stepHeight || c.y0 >= base + height) continue;
      if (pushOutCircle(c, cx, cz, C.r, tmpPush) && tmpPush.x * tmpPush.x + tmpPush.z * tmpPush.z > 1e-8) return false;
    }
  }
  return true;
}

/**
 * A lying body settles along the ground under its head and feet, within what its slope
 * limit allows, and no end of it rises more than a step in a tick from where it was
 * (`feet`, the body's height at the tick's start): swinging from over a drop onto a rock,
 * a leg gets there over a tick or two.
 */
function lieAlongGround(b: BodyState, spec: BodySpec, ctx: MotorContext, feet: number): void {
  const circles = footprint(b, spec, feetCircles);
  const first = circles[0]!;
  const last = circles[circles.length - 1]!;
  // The chain's seam: the pelvis, the node where the torso meets the legs.
  const at = spec.parts.pivot - spec.parts.proneLength / 2;
  let pelvis = circles[0]!;
  for (let k = 1; k < circles.length; k++) if (Math.abs(circles[k]!.at - at * b.lying) < Math.abs(pelvis.at - at * b.lying)) pelvis = circles[k]!;
  const groundAt = (C: FootCircle): number => {
    const g = restBelow(ctx.world, ctx.solids, b.x + C.x, b.z + C.z, b.y, C.allow, spec.stepHeight, C.r).height - b.y;
    const up = C.allow + spec.stepHeight;
    return g > up ? up : g < -C.allow ? -C.allow : g;
  };
  const rising = (was: number, to: number): number => Math.min(to, feet + was + spec.stepHeight - b.y);
  b.riseHead = rising(b.riseHead, groundAt(first));
  b.risePelvis = rising(b.risePelvis, groundAt(pelvis));
  b.riseFeet = rising(b.riseFeet, groundAt(last));
}

/** Removes the part of the velocity pointing into a surface we were pushed out of. */
function cancelInto(b: BodyState, px: number, pz: number): void {
  const l = Math.sqrt(px * px + pz * pz);
  if (l < 1e-9) return;
  const nx = px / l;
  const nz = pz / l;
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    b.vx -= vn * nx;
    b.vz -= vn * nz;
  }
}
