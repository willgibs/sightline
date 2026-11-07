import * as THREE from 'three';
import type { GuardRole } from '../sim/gen/camp';
import { GUARD_FIELDS, type Snapshot } from '../sim/sim';
import { lerp } from '../sim/core/math';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

interface GuardMesh {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
}

/**
 * Guards as the design doc's wireframe stand-ins: a capsule body, a head sphere (a real
 * headshot target), a pale visor showing where the head points, and a rifle. Facing has
 * to read at 300 m through a scope, so the visor and rifle carry it.
 */
export class GuardMeshes {
  readonly group = new THREE.Group();
  /** Meshes by guard entity id: guards can appear and disappear mid-run. */
  private readonly guards = new Map<number, GuardMesh>();
  private readonly honestMaterial: THREE.ShaderMaterial;
  private readonly roleMaterials: Record<GuardRole, THREE.ShaderMaterial>;
  private readonly visorMaterial: THREE.ShaderMaterial;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly headGeo: THREE.BufferGeometry;
  private readonly visorGeo: THREE.BufferGeometry;
  private readonly rifleGeo: THREE.BufferGeometry;
  private readonly prevIndex = new Map<number, number>();
  private debugTint = false;

  constructor(
    private readonly roleOf: (spawn: number) => GuardRole,
    private readonly look: LookUniforms,
  ) {
    this.group.name = 'guards';
    this.bodyGeo = new THREE.CapsuleGeometry(0.27, 1.06, 3, 10);
    this.bodyGeo.translate(0, 0.27 + 0.53, 0); // stand on the ground
    this.headGeo = new THREE.SphereGeometry(0.115, 12, 8);
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
  }

  private make(role: GuardRole): GuardMesh {
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.debugTint ? this.roleMaterials[role] : this.honestMaterial);
    body.userData.role = role;
    const head = new THREE.Group();
    head.position.set(0, 1.71, 0);
    head.add(new THREE.Mesh(this.headGeo, this.honestMaterial), new THREE.Mesh(this.visorGeo, this.visorMaterial));
    const rifle = new THREE.Mesh(this.rifleGeo, this.honestMaterial);
    rifle.position.set(0.2, 1.22, -0.18);
    rifle.rotation.set(-0.35, 0.25, 0.2);
    root.add(body, head, rifle);
    this.group.add(root);
    return { root, head, body };
  }

  /** Debug view tints guards by role; the honest view keeps them uniform. */
  setDebugTint(on: boolean): void {
    if (on === this.debugTint) return;
    this.debugTint = on;
    for (const g of this.guards.values()) {
      const role = g.body.userData.role as GuardRole;
      g.body.material = on ? this.roleMaterials[role] : this.honestMaterial;
    }
  }

  /**
   * Places every guard between its last two ticks. A guard new this tick appears where
   * it is; a guard gone this tick is removed.
   */
  update(prev: Snapshot, curr: Snapshot, alpha: number, time: number): void {
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
      const moving = b[o + 5]! > 0.5;
      const bob = moving ? Math.abs(Math.sin(time * 5.6 + id)) * 0.035 : 0;
      g.root.position.set(x, y + bob, z);
      g.root.rotation.y = yaw;
      g.head.rotation.y = head;
    }
    if (this.guards.size > curr.guardIds.length) {
      for (const [id, g] of this.guards) {
        if (curr.guardIds.includes(id)) continue;
        this.group.remove(g.root);
        this.guards.delete(id);
      }
    }
  }

  dispose(): void {
    for (const geo of [this.bodyGeo, this.headGeo, this.visorGeo, this.rifleGeo]) geo.dispose();
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
