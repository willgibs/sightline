import * as THREE from 'three';
import type { GuardRole } from '../sim/generation';
import { GUARD_FIELDS, type Snapshot } from '../sim/game/sim';
import { lerp } from '../sim/kernel/core/math';
import type { Tuning } from '../config/tuning';
import { bodyShape, type BodyState } from '../sim/body';
import { emptyShape } from '../sim/kernel/world/shape';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

interface GuardMesh {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Mesh;
}

/**
 * Guards as the design doc's wireframe stand-ins: a torso and legs as capsules, a head
 * sphere, a pale visor showing where the head points, and a rifle. Facing has to read at
 * 300 m through a scope, so the visor and rifle carry it. The capsules and the sphere are
 * the body's shape (sim/body/shape.ts), built from the same numbers sight and hits use,
 * and drawn exactly where the body is, so what is drawn is what can be hit. (They don't
 * bob as they walk: the body's shape doesn't. Whether walking bodies bob in the
 * simulation, with sim/motor/bob.ts, is lab B's call for its moving targets.)
 *
 * A guard whose body holds the camera isn't drawn: from inside, its faces would show as
 * holes and slivers. That happens with the fly camera, or when a guard is shoved into
 * you against a wall.
 */
export class GuardMeshes {
  readonly group = new THREE.Group();
  /** Meshes by guard entity id: guards can appear and disappear mid-run. */
  private readonly guards = new Map<number, GuardMesh>();
  private readonly honestMaterial: THREE.ShaderMaterial;
  private readonly roleMaterials: Record<GuardRole, THREE.ShaderMaterial>;
  private readonly visorMaterial: THREE.ShaderMaterial;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly legsGeo: THREE.BufferGeometry;
  private readonly headGeo: THREE.BufferGeometry;
  private readonly headY: number;
  private readonly rifleY: number;
  private readonly visorGeo: THREE.BufferGeometry;
  private readonly rifleGeo: THREE.BufferGeometry;
  private readonly prevIndex = new Map<number, number>();
  private debugTint = false;
  /** How near the body's axis, and its height, within which the camera is inside it. */
  private readonly reach: number;
  private readonly height: number;

  constructor(
    private readonly roleOf: (spawn: number) => GuardRole,
    private readonly look: LookUniforms,
    tuning: Tuning,
  ) {
    this.group.name = 'guards';
    // A standing guard's shape at the origin.
    const spec = tuning.bodies.guard;
    const standing = { x: 0, y: 0, z: 0, yaw: 0, stance: 'stand', eyeHeight: spec.eyeHeight.stand } as BodyState;
    const s = bodyShape(standing, spec, emptyShape());
    const capsule = (c: typeof s.torso, segments: number): THREE.BufferGeometry => {
      const g = new THREE.CapsuleGeometry(c.r, c.by - c.ay, 3, segments);
      g.translate(0, (c.ay + c.by) / 2, 0);
      return g;
    };
    this.bodyGeo = capsule(s.torso, 10);
    this.legsGeo = capsule(s.legs, 8);
    this.headY = s.head.y;
    this.rifleY = (s.torso.ay + s.torso.by) / 2 + 0.1;
    this.headGeo = new THREE.SphereGeometry(s.head.r, 12, 8);
    this.visorGeo = new THREE.BoxGeometry(0.17, 0.05, 0.07);
    this.visorGeo.translate(0, 0.015, -0.1);
    this.rifleGeo = new THREE.BoxGeometry(0.05, 0.06, 0.95);
    this.honestMaterial = createFlatMaterial(look, { color: palette.guard });
    this.roleMaterials = {
      sentry: createFlatMaterial(look, { color: palette.debug.roles.sentry }),
      patrol: createFlatMaterial(look, { color: palette.debug.roles.patrol }),
      worker: createFlatMaterial(look, { color: palette.debug.roles.worker }),
    };
    this.visorMaterial = createFlatMaterial(look, { color: palette.guardVisor });
    // The body's radius covers its capsules; the camera's near plane (0.08 m) cuts into anything closer.
    this.reach = spec.radius + 0.12;
    this.height = spec.height.stand + 0.12;
  }

  private make(role: GuardRole): GuardMesh {
    const root = new THREE.Group();
    const material = this.debugTint ? this.roleMaterials[role] : this.honestMaterial;
    const body = new THREE.Mesh(this.bodyGeo, material);
    body.userData.role = role;
    const legs = new THREE.Mesh(this.legsGeo, material);
    const head = new THREE.Group();
    head.position.set(0, this.headY, 0);
    head.add(new THREE.Mesh(this.headGeo, this.honestMaterial), new THREE.Mesh(this.visorGeo, this.visorMaterial));
    const rifle = new THREE.Mesh(this.rifleGeo, this.honestMaterial);
    rifle.position.set(0.2, this.rifleY, -0.18);
    rifle.rotation.set(-0.35, 0.25, 0.2);
    root.add(legs, body, head, rifle);
    this.group.add(root);
    return { root, head, body, legs };
  }

  /** Debug view tints guards by role; the honest view keeps them uniform. */
  setDebugTint(on: boolean): void {
    if (on === this.debugTint) return;
    this.debugTint = on;
    for (const g of this.guards.values()) {
      const role = g.body.userData.role as GuardRole;
      g.body.material = on ? this.roleMaterials[role] : this.honestMaterial;
      g.legs.material = g.body.material;
    }
  }

  /**
   * Places every guard between its last two ticks. A guard new this tick appears where
   * it is; a guard gone this tick is removed. One with the camera inside it is hidden.
   */
  update(prev: Snapshot, curr: Snapshot, alpha: number, eye: THREE.Vector3): void {
    this.prevIndex.clear();
    prev.guardIds.forEach((id, i) => this.prevIndex.set(id, i));
    const b = curr.guards;
    for (let i = 0; i < curr.guardIds.length; i++) {
      const id = curr.guardIds[i]!;
      let g = this.guards.get(id);
      if (!g) {
        g = this.make(this.roleOf(curr.guardSpawns[i]!));
        this.guards.set(id, g);
      }
      const j = this.prevIndex.get(id);
      const a = j === undefined ? b : prev.guards;
      const oa = (j ?? i) * GUARD_FIELDS;
      const o = i * GUARD_FIELDS;
      const x = lerp(a[oa]!, b[o]!, alpha);
      const y = lerp(a[oa + 1]!, b[o + 1]!, alpha);
      const z = lerp(a[oa + 2]!, b[o + 2]!, alpha);
      const yaw = lerpAngle(a[oa + 3]!, b[o + 3]!, alpha);
      const head = lerp(a[oa + 4]!, b[o + 4]!, alpha);
      g.root.position.set(x, y, z);
      g.root.rotation.y = yaw;
      g.head.rotation.y = head;
      const dx = eye.x - x;
      const dz = eye.z - z;
      g.root.visible = !(dx * dx + dz * dz < this.reach * this.reach && eye.y > y - 0.12 && eye.y < y + this.height);
    }
    if (this.guards.size > curr.guardIds.length) {
      for (const [id, g] of this.guards) {
        if (curr.guardIds.includes(id)) continue;
        this.group.remove(g.root);
        this.guards.delete(id);
      }
    }
  }

  /** How many guards are hidden because the camera is inside them (for tests). */
  get hidden(): number {
    let n = 0;
    for (const g of this.guards.values()) if (!g.root.visible) n++;
    return n;
  }

  dispose(): void {
    for (const geo of [this.bodyGeo, this.legsGeo, this.headGeo, this.visorGeo, this.rifleGeo]) geo.dispose();
    this.honestMaterial.dispose();
    this.visorMaterial.dispose();
    for (const m of Object.values(this.roleMaterials)) m.dispose();
    this.guards.clear();
    void this.look;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
