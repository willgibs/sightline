import * as THREE from 'three';
import type { GuardRole } from '../sim/gen/camp';
import { GUARD_FIELDS, type Snapshot } from '../sim/sim';
import { lerp } from '../sim/core/math';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

/**
 * Guards as the design doc's wireframe stand-ins: a capsule body, a head sphere (a real
 * headshot target), a pale visor showing where the head points, and a rifle. Facing has
 * to read at 300 m through a scope, so the visor and rifle carry it.
 */
export class GuardMeshes {
  readonly group = new THREE.Group();
  private readonly guards: Array<{ root: THREE.Group; head: THREE.Group; body: THREE.Mesh }> = [];
  private readonly honestMaterial: THREE.ShaderMaterial;
  private readonly roleMaterials: Record<GuardRole, THREE.ShaderMaterial>;
  private debugTint = false;

  constructor(
    roles: GuardRole[],
    private readonly look: LookUniforms,
  ) {
    this.group.name = 'guards';
    const bodyGeo = new THREE.CapsuleGeometry(0.27, 1.06, 3, 10);
    bodyGeo.translate(0, 0.27 + 0.53, 0); // stand on the ground
    const headGeo = new THREE.SphereGeometry(0.115, 12, 8);
    const visorGeo = new THREE.BoxGeometry(0.17, 0.05, 0.07);
    visorGeo.translate(0, 0.015, -0.1);
    const rifleGeo = new THREE.BoxGeometry(0.05, 0.06, 0.95);
    this.honestMaterial = createFlatMaterial(look, { color: palette.guard });
    this.roleMaterials = {
      sentry: createFlatMaterial(look, { color: palette.debug.roles.sentry }),
      patrol: createFlatMaterial(look, { color: palette.debug.roles.patrol }),
      worker: createFlatMaterial(look, { color: palette.debug.roles.worker }),
    };
    const visorMat = createFlatMaterial(look, { color: palette.guardVisor });
    for (const role of roles) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, this.honestMaterial);
      body.userData.role = role;
      const head = new THREE.Group();
      head.position.set(0, 1.71, 0);
      head.add(new THREE.Mesh(headGeo, this.honestMaterial), new THREE.Mesh(visorGeo, visorMat));
      const rifle = new THREE.Mesh(rifleGeo, this.honestMaterial);
      rifle.position.set(0.2, 1.22, -0.18);
      rifle.rotation.set(-0.35, 0.25, 0.2);
      root.add(body, head, rifle);
      this.group.add(root);
      this.guards.push({ root, head, body });
    }
  }

  /** Debug view tints guards by role; the honest view keeps them uniform. */
  setDebugTint(on: boolean): void {
    if (on === this.debugTint) return;
    this.debugTint = on;
    for (const g of this.guards) {
      const role = g.body.userData.role as GuardRole;
      g.body.material = on ? this.roleMaterials[role] : this.honestMaterial;
    }
  }

  update(prev: Snapshot, curr: Snapshot, alpha: number, time: number): void {
    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i]!;
      const o = i * GUARD_FIELDS;
      const a = prev.guards;
      const b = curr.guards;
      const x = lerp(a[o]!, b[o]!, alpha);
      const y = lerp(a[o + 1]!, b[o + 1]!, alpha);
      const z = lerp(a[o + 2]!, b[o + 2]!, alpha);
      const yaw = lerpAngle(a[o + 3]!, b[o + 3]!, alpha);
      const head = lerp(a[o + 4]!, b[o + 4]!, alpha);
      const moving = b[o + 5]! > 0.5;
      const bob = moving ? Math.abs(Math.sin(time * 5.6 + i)) * 0.035 : 0;
      g.root.position.set(x, y + bob, z);
      g.root.rotation.y = yaw;
      g.head.rotation.y = head;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.honestMaterial.dispose();
    for (const m of Object.values(this.roleMaterials)) m.dispose();
    void this.look;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
