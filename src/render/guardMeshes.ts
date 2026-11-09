import * as THREE from 'three';
import { GUARD_ROLES, type GuardRole } from '../sim/generation';
import { GUARD_FIELDS, type Snapshot } from '../sim/game/sim';
import { lerp } from '../sim/kernel/core/math';
import type { Tuning } from '../config/tuning';
import { bodyShape, type BodyState } from '../sim/body';
import { emptyShape, type Capsule } from '../sim/kernel/world/shape';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

interface GuardMesh {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Mesh;
  /** The head sphere and the rifle, drawn in the guard's plain colour. */
  plain: THREE.Mesh[];
  visor: THREE.Mesh;
  rifle: THREE.Mesh;
  role: GuardRole;
  /** In the sun as last drawn (A4). */
  lit: boolean;
  /** How his rifle is held (A8): 0 slung, 1 at the ready, 2 shouldered. */
  hold: number;
  /** His scope's flash (E8): one point of constant size at his head, so it reads at any range and any zoom. */
  flash: THREE.Points;
  /** Where the rifle sits on a man standing; down, it moves with his head. */
  rifleAt: THREE.Vector3;
  /** He's down, and his parts have been moved to where his shape says. */
  posed: boolean;
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
  /** The same, in shade: a guard is drawn lit or shaded as the simulation finds the ground beneath him (A4). */
  private readonly honestShaded: THREE.ShaderMaterial;
  private readonly roleShaded: Record<GuardRole, THREE.ShaderMaterial>;
  private readonly visorShaded: THREE.ShaderMaterial;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly legsGeo: THREE.BufferGeometry;
  private readonly headGeo: THREE.BufferGeometry;
  private readonly headY: number;
  private readonly rifleY: number;
  private readonly visorGeo: THREE.BufferGeometry;
  private readonly rifleGeo: THREE.BufferGeometry;
  /** One point a little in front of the head, shared by every guard's scope flash. */
  private readonly flashGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.16], 3));
  private readonly prevIndex = new Map<number, number>();
  private debugTint = false;
  /** How near the body's axis, and its height, within which the camera is inside it. */
  private readonly reach: number;
  private readonly height: number;
  private readonly spec: Tuning['bodies']['guard'];
  /** A standing man's torso and legs: where each is centred, and its length between the spheres at its ends. */
  private readonly torsoRest: { y: number; length: number };
  private readonly legsRest: { y: number; length: number };
  private readonly shape = emptyShape();
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0, eyeHeight: 0, lean: 0, axis: 0, lying: 0, riseHead: 0, risePelvis: 0, riseFeet: 0 };
  private readonly at = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

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
    this.spec = spec;
    this.torsoRest = { y: (s.torso.ay + s.torso.by) / 2, length: s.torso.by - s.torso.ay };
    this.legsRest = { y: (s.legs.ay + s.legs.by) / 2, length: s.legs.by - s.legs.ay };
    // Centred on the origin, so a part can be stretched and turned about its middle.
    const capsule = (c: typeof s.torso, segments: number): THREE.BufferGeometry => new THREE.CapsuleGeometry(c.r, c.by - c.ay, 3, segments);
    this.bodyGeo = capsule(s.torso, 10);
    this.legsGeo = capsule(s.legs, 8);
    this.headY = s.head.y;
    this.rifleY = (s.torso.ay + s.torso.by) / 2 + 0.1;
    this.headGeo = new THREE.SphereGeometry(s.head.r, 12, 8);
    this.visorGeo = new THREE.BoxGeometry(0.17, 0.05, 0.07);
    this.visorGeo.translate(0, 0.015, -0.1);
    this.rifleGeo = new THREE.BoxGeometry(0.05, 0.06, 0.95);
    this.honestMaterial = createFlatMaterial(look, { color: palette.guard });
    this.roleMaterials = Object.fromEntries(GUARD_ROLES.map((role) => [role, createFlatMaterial(look, { color: palette.debug.roles[role] })])) as Record<GuardRole, THREE.ShaderMaterial>;
    this.visorMaterial = createFlatMaterial(look, { color: palette.guardVisor });
    this.honestShaded = createFlatMaterial(look, { color: palette.guard, shaded: true });
    this.roleShaded = Object.fromEntries(GUARD_ROLES.map((role) => [role, createFlatMaterial(look, { color: palette.debug.roles[role], shaded: true })])) as Record<GuardRole, THREE.ShaderMaterial>;
    this.visorShaded = createFlatMaterial(look, { color: palette.guardVisor, shaded: true });
    // The body's radius covers its capsules; the camera's near plane (0.08 m) cuts into anything closer.
    this.reach = spec.radius + 0.12;
    this.height = spec.height.stand + 0.12;
  }

  private make(role: GuardRole): GuardMesh {
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.honestMaterial);
    body.userData.role = role;
    const legs = new THREE.Mesh(this.legsGeo, this.honestMaterial);
    body.position.y = this.torsoRest.y;
    legs.position.y = this.legsRest.y;
    const head = new THREE.Group();
    head.position.set(0, this.headY, 0);
    const skull = new THREE.Mesh(this.headGeo, this.honestMaterial);
    const visor = new THREE.Mesh(this.visorGeo, this.visorMaterial);
    const flash = new THREE.Points(this.flashGeo, new THREE.PointsMaterial({ color: 0xfff1cf, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false }));
    flash.visible = false;
    head.add(skull, visor, flash);
    const rifle = new THREE.Mesh(this.rifleGeo, this.honestMaterial);
    root.add(legs, body, head, rifle);
    this.group.add(root);
    const g: GuardMesh = { root, head, body, legs, plain: [skull, rifle], visor, rifle, role, lit: true, hold: -1, flash, rifleAt: new THREE.Vector3(), posed: false };
    this.holdRifle(g, 0);
    this.paint(g);
    return g;
  }

  /**
   * How he holds his rifle, by his awareness (A8): slung while unaware or curious, at the
   * ready while suspicious or searching, shouldered at his eye in combat. Read at 300 m
   * through a scope, the rifle carries what the ladder says.
   */
  private holdRifle(g: GuardMesh, hold: number): void {
    if (hold === g.hold) return;
    g.hold = hold;
    const r = g.rifle;
    if (hold === 0) {
      g.rifleAt.set(0.2, this.rifleY, -0.18);
      r.rotation.set(-0.35, 0.25, 0.2);
    } else if (hold === 1) {
      g.rifleAt.set(0.17, this.rifleY + 0.14, -0.34);
      r.rotation.set(-0.12, 0.06, 0.04);
    } else {
      g.rifleAt.set(0.1, this.headY - 0.07, -0.42);
      r.rotation.set(0, 0, 0);
    }
    r.position.copy(g.rifleAt);
  }

  /**
   * A man who's down is drawn where his shape says, from the same numbers sight and hits use
   * (rule 14). A man standing costs nothing: his parts are already where he stands.
   */
  private posture(g: GuardMesh, x: number, y: number, z: number, yaw: number, b: Float32Array, a: Float32Array, o: number, oa: number, alpha: number): void {
    const eye = lerp(a[oa + 10]!, b[o + 10]!, alpha);
    if (eye >= this.spec.eyeHeight.stand - 1e-3) {
      if (!g.posed) return;
      g.posed = false;
      g.body.position.set(0, this.torsoRest.y, 0);
      g.legs.position.set(0, this.legsRest.y, 0);
      g.body.quaternion.identity();
      g.legs.quaternion.identity();
      g.body.scale.set(1, 1, 1);
      g.legs.scale.set(1, 1, 1);
      g.head.position.set(0, this.headY, 0);
      g.rifle.position.copy(g.rifleAt);
      return;
    }
    g.posed = true;
    const p = this.pose;
    p.x = x;
    p.y = y;
    p.z = z;
    p.yaw = yaw;
    p.eyeHeight = eye;
    p.lying = lerp(a[oa + 11]!, b[o + 11]!, alpha);
    p.axis = lerpAngle(a[oa + 12]!, b[o + 12]!, alpha);
    p.riseHead = lerp(a[oa + 13]!, b[o + 13]!, alpha);
    p.risePelvis = lerp(a[oa + 14]!, b[o + 14]!, alpha);
    p.riseFeet = lerp(a[oa + 15]!, b[o + 15]!, alpha);
    const s = bodyShape(p as unknown as BodyState, this.spec, this.shape);
    // The parts hang off a root at his feet, turned with him.
    const c = Math.cos(yaw);
    const n = Math.sin(yaw);
    const local = (wx: number, wy: number, wz: number, out: THREE.Vector3): void => {
      const dx = wx - x;
      const dz = wz - z;
      out.set(dx * c - dz * n, wy - y, dx * n + dz * c);
    };
    const fit = (m: THREE.Mesh, part: Capsule, rest: { length: number }): void => {
      local(part.ax, part.ay, part.az, this.at);
      local(part.bx, part.by, part.bz, this.to);
      m.position.addVectors(this.at, this.to).multiplyScalar(0.5);
      this.to.sub(this.at);
      const length = this.to.length();
      if (length < 1e-6) return;
      m.quaternion.setFromUnitVectors(UP, this.to.divideScalar(length));
      m.scale.set(1, rest.length > 1e-6 ? length / rest.length : 1, 1);
    };
    fit(g.body, s.torso, this.torsoRest);
    fit(g.legs, s.legs, this.legsRest);
    local(s.head.x, s.head.y, s.head.z, g.head.position);
    g.rifle.position.set(g.rifleAt.x + g.head.position.x, g.rifleAt.y + g.head.position.y - this.headY, g.rifleAt.z + g.head.position.z);
  }

  /** Puts a guard's materials on: by role in the debug view, plain in the honest one; lit or in shade. */
  private paint(g: GuardMesh): void {
    const plain = g.lit ? this.honestMaterial : this.honestShaded;
    g.body.material = this.debugTint ? (g.lit ? this.roleMaterials : this.roleShaded)[g.role] : plain;
    g.legs.material = g.body.material;
    for (const m of g.plain) m.material = plain;
    g.visor.material = g.lit ? this.visorMaterial : this.visorShaded;
  }

  /** Debug view tints guards by role; the honest view keeps them uniform. */
  setDebugTint(on: boolean): void {
    if (on === this.debugTint) return;
    this.debugTint = on;
    for (const g of this.guards.values()) this.paint(g);
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
      const lit = b[o + 6]! >= 1;
      if (lit !== g.lit) {
        g.lit = lit;
        this.paint(g);
      }
      const rung = b[o + 8]!;
      this.holdRifle(g, rung >= 4 ? 2 : rung >= 2 ? 1 : 0);
      this.posture(g, x, y, z, yaw, b, a, o, oa, alpha);
      this.shine(g, b[o + 9]!);
      const dx = eye.x - x;
      const dz = eye.z - z;
      g.root.visible = !(dx * dx + dz * dz < this.reach * this.reach && eye.y > y - 0.12 && eye.y < y + this.height);
    }
    if (this.guards.size > curr.guardIds.length) {
      for (const [id, g] of this.guards) {
        if (curr.guardIds.includes(id)) continue;
        this.group.remove(g.root);
        (g.flash.material as THREE.Material).dispose();
        this.guards.delete(id);
      }
    }
  }

  /** The scope's flash at its strength: it hides at nothing, and it's as bright as the glint says. */
  private shine(g: GuardMesh, flash: number): void {
    g.flash.visible = flash > 0.02;
    if (!g.flash.visible) return;
    const m = g.flash.material as THREE.PointsMaterial;
    m.opacity = Math.min(1, 0.35 + 0.65 * flash);
    m.size = 3 + 7 * flash;
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
    this.honestShaded.dispose();
    this.visorShaded.dispose();
    for (const m of Object.values(this.roleMaterials)) m.dispose();
    for (const m of Object.values(this.roleShaded)) m.dispose();
    this.flashGeo.dispose();
    for (const g of this.guards.values()) (g.flash.material as THREE.Material).dispose();
    this.guards.clear();
    void this.look;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
