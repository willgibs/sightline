import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { GuardMeshes } from '../src/render/guardMeshes';
import { createLook } from '../src/render/materials';
import { bodyShape, type BodyState } from '../src/sim/body';
import { GUARD_FIELDS, type Snapshot } from '../src/sim/game/sim';
import { emptyShape } from '../src/sim/kernel/world/shape';

/** Rule 14: a man is drawn where his shape is, whether he's standing, crouched or flat on the ground. */
describe('a guard as drawn', () => {
  const spec = T.bodies.guard;

  function draw(pose: { eyeHeight: number; lying: number }): { root: THREE.Object3D; meshes: GuardMeshes; shape: ReturnType<typeof emptyShape> } {
    const at = { x: 12, y: 3, z: -7, yaw: 1.2, lean: 0, axis: 1.2, riseHead: 0, risePelvis: 0, riseFeet: 0, ...pose };
    const meshes = new GuardMeshes(() => 'sentry', createLook(new THREE.Vector3(0, 1, 0), 0), T);
    const guards = new Float32Array(GUARD_FIELDS);
    guards.set([at.x, at.y, at.z, at.yaw, 0, 0, 1, 0, 0, 0, at.eyeHeight, at.lying, at.axis, 0, 0, 0]);
    const snap = { guardIds: [7], guardSpawns: [0], guards } as unknown as Snapshot;
    meshes.update(snap, snap, 1, new THREE.Vector3(500, 500, 500));
    meshes.group.updateMatrixWorld(true);
    return { root: meshes.group.children[0]!, meshes, shape: bodyShape(at as unknown as BodyState, spec, emptyShape()) };
  }

  const near = (p: THREE.Vector3, x: number, y: number, z: number): void => {
    expect(p.x).toBeCloseTo(x, 5);
    expect(p.y).toBeCloseTo(y, 5);
    expect(p.z).toBeCloseTo(z, 5);
  };

  it.each([
    ['standing', { eyeHeight: spec.eyeHeight.stand, lying: 0 }],
    ['crouched', { eyeHeight: spec.eyeHeight.crouch, lying: 0 }],
    ['prone', { eyeHeight: spec.eyeHeight.prone, lying: 1 }],
  ])('puts head, torso and legs where his shape says, %s', (_, pose) => {
    const { root, shape } = draw(pose);
    const [legs, body, head] = root.children as [THREE.Mesh, THREE.Mesh, THREE.Object3D];
    near(head.getWorldPosition(new THREE.Vector3()), shape.head.x, shape.head.y, shape.head.z);
    const middle = (c: typeof shape.torso): [number, number, number] => [(c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2];
    near(body.getWorldPosition(new THREE.Vector3()), ...middle(shape.torso));
    near(legs.getWorldPosition(new THREE.Vector3()), ...middle(shape.legs));
  });

  it('stands back up when he does', () => {
    const { root, meshes } = draw({ eyeHeight: spec.eyeHeight.prone, lying: 1 });
    const guards = new Float32Array(GUARD_FIELDS);
    guards.set([12, 3, -7, 1.2, 0, 0, 1, 0, 0, 0, spec.eyeHeight.stand, 0, 1.2, 0, 0, 0]);
    const snap = { guardIds: [7], guardSpawns: [0], guards } as unknown as Snapshot;
    meshes.update(snap, snap, 1, new THREE.Vector3(500, 500, 500));
    const body = root.children[1] as THREE.Mesh;
    expect(body.quaternion.w).toBeCloseTo(1, 5);
    expect(body.scale.y).toBeCloseTo(1, 5);
  });
});
