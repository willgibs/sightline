import type { Tuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { Entity } from '../kernel/state';
import type { QueryBody } from '../kernel/world/query';
import { emptyShape, type BodyShape, type Capsule, type Sphere } from '../kernel/world/shape';
import { hasBody, poseAt, type BodySpec, type BodyState, type PoseSample } from './body';

/**
 * A body's shape, for everything that asks what can be seen or hit (kernel/world/shape.ts):
 * a head sphere at the eye, a torso capsule and a legs capsule. Standing and crouched it
 * is upright; prone it lies along the facing, head first. Between stances it follows the
 * eye, so a guard half-way down is half-way down for sight and hits alike. The guards'
 * meshes are built from the same numbers, so what is drawn is what is hit.
 *
 * The motor still collides with a circle (radius) up to the body's height; lab C decides
 * whether a prone body collides as long as it is.
 */

/** The sizes of a body's parts (each body kind's `parts`). */
type Parts = BodySpec['parts'];

const upright = emptyShape();
const lying = emptyShape();

/** What a body's shape follows: where its feet are, its facing, its eye height and its lean (a body's state, or a pose from its history). */
export type ShapePose = Pick<BodyState, 'x' | 'y' | 'z' | 'yaw' | 'eyeHeight' | 'lean' | 'axis' | 'lying' | 'riseHead' | 'risePelvis' | 'riseFeet'>;

/** Upright, how high the hips are for an eye at height `e`: they follow the eye between crouching and standing. */
export function hipHeight(e: number, spec: BodySpec): number {
  const E = spec.eyeHeight;
  const t = E.stand > E.crouch ? Math.min(1, (e - E.crouch) / (E.stand - E.crouch)) : 1;
  return spec.parts.hip * (spec.height.crouch + (spec.height.stand - spec.height.crouch) * t);
}

/** The shape of a body as it stands now, or in any pose, written to `out`. */
export function bodyShape(b: ShapePose, spec: BodySpec, out: BodyShape): BodyShape {
  const B = spec.parts;
  const E = spec.eyeHeight;
  const e = b.eyeHeight;
  if (e >= E.crouch) {
    // Upright, between crouching and standing: hips follow the eye.
    uprightShape(b.x, b.y, b.z, e, hipHeight(e, spec), B, out);
  } else {
    // Between prone and crouching: from lying down to the crouch, by the eye.
    const t = E.crouch > E.prone ? Math.max(0, (e - E.prone) / (E.crouch - E.prone)) : 0;
    uprightShape(b.x, b.y, b.z, E.crouch, B.hip * spec.height.crouch, B, upright);
    lyingShape(b, E.prone, B, lying);
    mixSphere(lying.head, upright.head, t, out.head);
    mixCapsule(lying.torso, upright.torso, t, out.torso);
    mixCapsule(lying.legs, upright.legs, t, out.legs);
  }
  if (b.lean) applyLean(b, out, e >= E.crouch);
  return out;
}

/**
 * A lean rotates the spine about the hips: the head moves aside by exactly the lean, and
 * down the arc that takes, and the shoulders follow part way. The eye is the centre of
 * the head, wherever the head is: what you can see around a corner is what can see you.
 */
function applyLean(b: ShapePose, out: BodyShape, upright: boolean): void {
  // Lying, the axis decides which way the head can roll, and the body stays on its chain.
  const axis = upright ? b.yaw : (b.axis ?? b.yaw);
  const rx = dcos(axis);
  const rz = -dsin(axis);
  const t = out.torso;
  const spine = out.head.y - t.ay;
  const share = upright && spine > 1e-6 ? (t.by - t.ay) / spine : 0;
  const drop = upright ? leanDrop(spine, b.lean) : 0;
  out.head.x += rx * b.lean;
  out.head.z += rz * b.lean;
  out.head.y -= drop;
  t.bx += rx * b.lean * share;
  t.bz += rz * b.lean * share;
  t.by -= drop * share;
}

/** How far down the arc a spine of this length takes the head, leaned this far. */
function leanDrop(spine: number, lean: number): number {
  return spine > Math.abs(lean) ? spine - Math.sqrt(spine * spine - lean * lean) : 0;
}

/**
 * Where a body's eye is: the centre of its head (bodyShape), wherever a lean or lying
 * down has put it. The camera, a shot and anything an eye sees from use this, so what
 * you can see around a corner is what can see you.
 */
export function eyeOf(b: ShapePose, spec: BodySpec, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  if (!b.lean && b.eyeHeight >= spec.eyeHeight.crouch) {
    // Upright with no lean: over the feet.
    out.x = b.x;
    out.y = b.y + b.eyeHeight;
    out.z = b.z;
    return out;
  }
  const s = bodyShape(b, spec, eyeShape);
  out.x = s.head.x;
  out.y = s.head.y;
  out.z = s.head.z;
  return out;
}

const eyeShape = emptyShape();

function uprightShape(x: number, y: number, z: number, eye: number, hip: number, B: Parts, out: BodyShape): BodyShape {
  const shoulders = Math.max(hip, eye - B.neck);
  out.head.x = x;
  out.head.y = y + eye;
  out.head.z = z;
  out.head.r = B.headRadius;
  setCapsule(out.torso, x, y + hip, z, x, y + shoulders, z, B.torsoRadius);
  setCapsule(out.legs, x, y + B.legRadius, z, x, y + Math.max(B.legRadius, hip), z, B.legRadius);
  return out;
}

function lyingShape(b: ShapePose, eye: number, B: Parts, out: BodyShape): BodyShape {
  // Along the axis, turning on a pivot near the chest (chain.ts): the head at the front, the
  // heels at the back, grown out from standing as it goes down, along the ground under it.
  const axis = b.axis ?? b.yaw; // a body drawn from a bare pose has no axis yet
  const fx = -dsin(axis);
  const fz = -dcos(axis);
  const f = b.lying ?? 1;
  const place = (below: number, lift: number, target: Point): void => {
    const s = (B.pivot - below) * f;
    target.x = b.x + fx * s;
    target.y = b.y + lift + groundRise(b, B, below);
    target.z = b.z + fz * s;
  };
  place(B.headRadius, eye, head);
  place(2 * B.headRadius + B.torsoRadius, B.torsoRadius, shoulder);
  place(B.proneLength / 2, B.torsoRadius, pelvis);
  place(B.proneLength - B.legRadius, B.legRadius, heel);
  out.head.x = head.x;
  out.head.y = head.y;
  out.head.z = head.z;
  out.head.r = B.headRadius;
  setCapsule(out.torso, pelvis.x, pelvis.y, pelvis.z, shoulder.x, shoulder.y, shoulder.z, B.torsoRadius);
  pelvis2.x = pelvis.x;
  place(B.proneLength / 2, B.legRadius, pelvis2);
  setCapsule(out.legs, heel.x, heel.y, heel.z, pelvis2.x, pelvis2.y, pelvis2.z, B.legRadius);
  return out;
}

interface Point {
  x: number;
  y: number;
  z: number;
}
const head: Point = { x: 0, y: 0, z: 0 };
const shoulder: Point = { x: 0, y: 0, z: 0 };
const pelvis: Point = { x: 0, y: 0, z: 0 };
const pelvis2: Point = { x: 0, y: 0, z: 0 };
const heel: Point = { x: 0, y: 0, z: 0 };

/**
 * How far the ground rises under a part `below` metres back from the top of the head:
 * straight from the pivot out to the head, and from the pivot through the pelvis to the feet.
 */
function groundRise(b: ShapePose, B: Parts, below: number): number {
  const at = B.pivot - below;
  if (at > 0) return ((b.riseHead ?? 0) * at) / (B.pivot - B.headRadius);
  const pelvis = B.pivot - B.proneLength / 2;
  const heel = B.pivot - (B.proneLength - B.legRadius);
  const p = b.risePelvis ?? 0;
  if (at >= pelvis) return pelvis < 0 ? (p * at) / pelvis : 0;
  const f = b.riseFeet ?? 0;
  return p + ((f - p) * (at - pelvis)) / (heel - pelvis);
}

function setCapsule(c: Capsule, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): void {
  c.ax = ax;
  c.ay = ay;
  c.az = az;
  c.bx = bx;
  c.by = by;
  c.bz = bz;
  c.r = r;
}

function mixSphere(a: Sphere, b: Sphere, t: number, out: Sphere): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.r = a.r + (b.r - a.r) * t;
}

function mixCapsule(a: Capsule, b: Capsule, t: number, out: Capsule): void {
  setCapsule(
    out,
    a.ax + (b.ax - a.ax) * t,
    a.ay + (b.ay - a.ay) * t,
    a.az + (b.az - a.az) * t,
    a.bx + (b.bx - a.bx) * t,
    a.by + (b.by - a.by) * t,
    a.bz + (b.bz - a.bz) * t,
    a.r + (b.r - a.r) * t,
  );
}

const posed: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0, lean: 0, axis: 0, lying: 0, riseHead: 0, risePelvis: 0, riseFeet: 0 };

/**
 * A body's shape `lag` ticks before now (0 to 2), between its samples (body.ts, poseAt):
 * where a shot resolved against what the player saw finds it.
 */
export function bodyShapeAt(b: BodyState, spec: BodySpec, lag: number, out: BodyShape): BodyShape {
  return bodyShape(poseAt(b, lag, posed), spec, out);
}

/** Every body's shape as it stands now, in entity order, for queries (kernel/world/query.ts). Reuses `out` and its shapes. */
export function queryBodies(entities: readonly Entity[], tuning: Tuning, out: QueryBody[] = []): QueryBody[] {
  let n = 0;
  for (const e of entities) {
    if (!hasBody(e)) continue;
    const q = (out[n++] ??= { id: 0, shape: emptyShape() });
    q.id = e.id;
    bodyShape(e.body, tuning.bodies[e.kind], q.shape);
  }
  out.length = n;
  return out;
}
