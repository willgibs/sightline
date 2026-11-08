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
export type ShapePose = Pick<BodyState, 'x' | 'y' | 'z' | 'yaw' | 'eyeHeight' | 'lean'>;

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
  if (b.lean) applyLean(b, out);
  return out;
}

/**
 * A lean rotates the spine about the hips: the head moves aside by exactly the lean, and
 * down the arc that takes, and the shoulders follow part way. The eye is the centre of
 * the head, wherever the head is: what you can see around a corner is what can see you.
 */
function applyLean(b: ShapePose, out: BodyShape): void {
  const rx = dcos(b.yaw);
  const rz = -dsin(b.yaw);
  const t = out.torso;
  const spine = out.head.y - t.ay;
  const share = spine > 1e-6 ? (t.by - t.ay) / spine : 0;
  const drop = leanDrop(spine, b.lean);
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
 * Where a body's eye is: where its head is, as far as a lean has put it aside and down the
 * arc. The camera, a shot and anything an eye sees from use this, so what you can see
 * around a corner is what can see you.
 */
export function eyeOf(b: ShapePose, spec: BodySpec, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const lean = b.lean;
  if (!lean) {
    out.x = b.x;
    out.y = b.y + b.eyeHeight;
    out.z = b.z;
    return out;
  }
  const upright = b.eyeHeight >= spec.eyeHeight.crouch;
  const drop = upright ? leanDrop(b.eyeHeight - hipHeight(b.eyeHeight, spec), lean) : 0;
  out.x = b.x + dcos(b.yaw) * lean;
  out.y = b.y + b.eyeHeight - drop;
  out.z = b.z - dsin(b.yaw) * lean;
  return out;
}

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
  // Along the facing, centred on the body: head at the front, heels at the back.
  const fx = -dsin(b.yaw);
  const fz = -dcos(b.yaw);
  const half = B.proneLength / 2;
  const at = (s: number): [number, number] => [b.x + fx * s, b.z + fz * s];
  const [hx, hz] = at(half - B.headRadius);
  out.head.x = hx;
  out.head.y = b.y + eye;
  out.head.z = hz;
  out.head.r = B.headRadius;
  const [sx, sz] = at(half - 2 * B.headRadius - B.torsoRadius);
  const [px, pz] = at(0);
  setCapsule(out.torso, px, b.y + B.torsoRadius, pz, sx, b.y + B.torsoRadius, sz, B.torsoRadius);
  const [fx2, fz2] = at(-half + B.legRadius);
  setCapsule(out.legs, fx2, b.y + B.legRadius, fz2, px, b.y + B.legRadius, pz, B.legRadius);
  return out;
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

const posed: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0, lean: 0 };

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
