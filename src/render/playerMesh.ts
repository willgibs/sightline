import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import { lerp, wrapAngle } from '../sim/kernel/core/math';
import { bodyShape, type BodyState } from '../sim/body';
import { emptyShape, type Capsule } from '../sim/kernel/world/shape';
import type { Snapshot } from '../sim/game/sim';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

/**
 * The player's own body, drawn whenever the camera is out of it: the fly camera, or a
 * replay watched from outside. Its parts are the body's shape (sim/body/shape.ts) in its
 * stance, the same head, torso and legs that sight and hits use, so a replay shows
 * exactly how much of you a guard had to see. From your own eyes it isn't drawn.
 */
export class PlayerMesh {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly sphere = new THREE.SphereGeometry(1, 14, 10);
  private readonly cylinder = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  private readonly head: THREE.Mesh;
  private readonly torso: CapsuleMesh;
  private readonly legs: CapsuleMesh;
  private readonly shape = emptyShape();
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0, eyeHeight: 0, lean: 0, axis: 0, lying: 0, riseHead: 0, risePelvis: 0, riseFeet: 0 };

  constructor(
    look: LookUniforms,
    private spec: Tuning['bodies']['player'],
  ) {
    this.group.name = 'player';
    this.material = createFlatMaterial(look, { color: palette.player });
    this.head = new THREE.Mesh(this.sphere, this.material);
    this.torso = new CapsuleMesh(this.sphere, this.cylinder, this.material);
    this.legs = new CapsuleMesh(this.sphere, this.cylinder, this.material);
    this.group.add(this.head, this.torso.group, this.legs.group);
    this.group.visible = false;
  }

  setSpec(spec: Tuning['bodies']['player']): void {
    this.spec = spec;
  }

  /** The body between the last two ticks; hidden while the camera is inside it. */
  update(prev: Snapshot, curr: Snapshot, alpha: number, eye: THREE.Vector3): void {
    const p = this.pose;
    p.x = lerp(prev.px, curr.px, alpha);
    p.y = lerp(prev.py, curr.py, alpha);
    p.z = lerp(prev.pz, curr.pz, alpha);
    p.yaw = curr.yaw;
    p.eyeHeight = lerp(prev.eye, curr.eye, alpha);
    p.lean = lerp(prev.lean, curr.lean, alpha);
    p.axis = lerpAngle(prev.axis, curr.axis, alpha);
    p.lying = lerp(prev.lying, curr.lying, alpha);
    p.riseHead = lerp(prev.riseHead, curr.riseHead, alpha);
    p.risePelvis = lerp(prev.risePelvis, curr.risePelvis, alpha);
    p.riseFeet = lerp(prev.riseFeet, curr.riseFeet, alpha);
    const s = bodyShape(p as unknown as BodyState, this.spec, this.shape);
    // Inside its head or within a near plane of its body, the camera is the player's eyes.
    const dx = eye.x - p.x;
    const dz = eye.z - p.z;
    const inside = dx * dx + dz * dz < (this.spec.radius + 0.12) ** 2 && eye.y > p.y - 0.12 && eye.y < p.y + p.eyeHeight + s.head.r + 0.12;
    this.group.visible = !inside;
    if (inside) return;
    this.head.position.set(s.head.x, s.head.y, s.head.z);
    this.head.scale.setScalar(s.head.r);
    this.torso.set(s.torso);
    this.legs.set(s.legs);
  }

  dispose(): void {
    this.sphere.dispose();
    this.cylinder.dispose();
    this.material.dispose();
  }
}

/** A capsule of any length and direction: an open cylinder between two spheres. */
class CapsuleMesh {
  readonly group = new THREE.Group();
  private readonly a: THREE.Mesh;
  private readonly b: THREE.Mesh;
  private readonly body: THREE.Mesh;
  private readonly dir = new THREE.Vector3();

  constructor(sphere: THREE.BufferGeometry, cylinder: THREE.BufferGeometry, material: THREE.Material) {
    this.a = new THREE.Mesh(sphere, material);
    this.b = new THREE.Mesh(sphere, material);
    this.body = new THREE.Mesh(cylinder, material);
    this.group.add(this.a, this.b, this.body);
  }

  set(c: Capsule): void {
    this.a.position.set(c.ax, c.ay, c.az);
    this.b.position.set(c.bx, c.by, c.bz);
    this.a.scale.setScalar(c.r);
    this.b.scale.setScalar(c.r);
    this.dir.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az);
    const length = this.dir.length();
    this.body.visible = length > 1e-6;
    if (!this.body.visible) return;
    this.body.position.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2);
    this.body.quaternion.setFromUnitVectors(UP, this.dir.divideScalar(length));
    this.body.scale.set(c.r, length, c.r);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
