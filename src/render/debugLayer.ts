import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import { lerp } from '../sim/core/math';
import { isSound, type SimEvent } from '../sim/events';
import { PLAYER_ID } from '../sim/state';
import type { World } from '../sim/gen/world';
import { GUARD_FIELDS, type Snapshot } from '../sim/sim';
import { Blocks } from '../sim/world/colliders';
import { palette } from './palette';

/**
 * Everything the debug view adds to the world: guard sight cones laid on the ground,
 * facing lines, patrol routes, footstep sound rings sized to their hearing radius, the
 * aim point, the play-area boundary, and on demand every collider and the overwatch
 * analysis. None of it exists in the honest view.
 */

const CONE_RANGE = 30; // display radius only; Phase 1 replaces it with real detection ranges
const CONE_SEGMENTS = 20;
const CONE_RINGS = 6;
const RING_POINTS = 48;
const RING_POOL = 64;
const RING_LIFE = 0.9;
const SHOT_POOL = 8;
const SHOT_LIFE = 8;
const SHOT_RANGE = 1500;

interface SoundRing {
  line: THREE.LineLoop;
  material: THREE.LineBasicMaterial;
  x: number;
  y: number;
  z: number;
  radius: number;
  start: number;
  active: boolean;
}

export class DebugLayer {
  readonly group = new THREE.Group();
  private readonly world: World;
  /** Sight cones by guard entity id, made when a guard first appears. */
  private readonly cones = new Map<number, { core: THREE.Mesh; wide: THREE.Mesh }>();
  private readonly coneIndex: number[];
  private readonly prevIndex = new Map<number, number>();
  private facingCapacity: number;
  private readonly facing: THREE.LineSegments;
  private readonly rings: SoundRing[] = [];
  private nextRing = 0;
  private readonly shots: Array<{ line: THREE.LineSegments; material: THREE.LineBasicMaterial; start: number; active: boolean }> = [];
  private nextShot = 0;
  private readonly hit = { dist: Infinity, id: -1 };
  private readonly aim: THREE.LineSegments;
  private colliders: THREE.LineSegments | null = null;
  private perches: THREE.Group | null = null;
  private readonly coreHalf: number;
  private readonly wideHalf: number;

  constructor(world: World, tuning: Tuning) {
    this.world = world;
    this.group.name = 'debug';
    this.coreHalf = (tuning.visibility.coneCoreDeg * Math.PI) / 360;
    this.wideHalf = (tuning.visibility.conePeripheralDeg * Math.PI) / 360;

    this.coneIndex = fanIndex();
    this.facingCapacity = Math.max(8, world.camp.guards.length);
    const facingGeo = new THREE.BufferGeometry();
    facingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.facingCapacity * 6), 3));
    this.facing = new THREE.LineSegments(facingGeo, new THREE.LineBasicMaterial({ color: palette.debug.facing }));
    this.facing.frustumCulled = false;
    this.group.add(this.facing);

    // Patrol routes, dashed along the ground.
    for (const g of world.camp.guards) {
      if (!g.route) continue;
      const pts = [...g.route, g.route[0]!].map((p) => new THREE.Vector3(p.x, world.terrain.heightAt(p.x, p.z) + 0.2, p.z));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: palette.debug.route, dashSize: 1.2, gapSize: 0.8 }));
      line.computeLineDistances();
      this.group.add(line);
    }

    // Footstep rings.
    for (let i = 0; i < RING_POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
      const material = new THREE.LineBasicMaterial({ color: palette.debug.stepPlayer, transparent: true, depthWrite: false });
      const line = new THREE.LineLoop(geo, material);
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.rings.push({ line, material, x: 0, y: 0, z: 0, radius: 1, start: 0, active: false });
    }

    // Shots: straight from the muzzle to whatever stops them, with a cross where they
    // stop (lab B adds the drop and what was hit).
    for (let i = 0; i < SHOT_POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const material = new THREE.LineBasicMaterial({ color: palette.debug.shot, transparent: true, depthWrite: false });
      const line = new THREE.LineSegments(geo, material);
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.shots.push({ line, material, start: 0, active: false });
    }

    // Aim marker: a small 3D cross.
    const aimGeo = new THREE.BufferGeometry();
    aimGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1]), 3),
    );
    this.aim = new THREE.LineSegments(aimGeo, new THREE.LineBasicMaterial({ color: palette.debug.aim, depthTest: false }));
    this.aim.renderOrder = 10;
    this.aim.visible = false;
    this.group.add(this.aim);

    // Play-area boundary.
    const half = world.playHalf;
    const bounds: THREE.Vector3[] = [];
    const corners = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [-half, -half],
    ] as const;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]!;
      const [bx, bz] = corners[c + 1]!;
      const steps = Math.ceil((2 * half) / 8);
      for (let s = 0; s < steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const z = az + ((bz - az) * s) / steps;
        bounds.push(new THREE.Vector3(x, world.terrain.heightAt(x, z) + 1, z));
      }
    }
    const boundsLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(bounds), new THREE.LineBasicMaterial({ color: palette.debug.bounds }));
    this.group.add(boundsLine);
  }

  /** Every collider as an outline, coloured by what it blocks. Built on first use. */
  setCollidersVisible(on: boolean): void {
    if (on && !this.colliders) this.colliders = buildColliderLines(this.world);
    if (this.colliders) {
      if (on && !this.colliders.parent) this.group.add(this.colliders);
      if (!on && this.colliders.parent) this.group.remove(this.colliders);
    }
  }

  /** Overwatch perches with their sightlines to the camp, coloured by ridge. */
  setPerchesVisible(on: boolean): void {
    if (on && !this.perches) this.perches = buildPerches(this.world);
    if (this.perches) {
      if (on && !this.perches.parent) this.group.add(this.perches);
      if (!on && this.perches.parent) this.group.remove(this.perches);
    }
  }

  addEvents(events: readonly SimEvent[], time: number): void {
    for (const e of events) {
      if (e.type === 'shot') {
        this.addShot(e.x, e.y, e.z, e.dx, e.dy, e.dz, time);
        continue;
      }
      if (!isSound(e)) continue;
      const ring = this.rings[this.nextRing]!;
      this.nextRing = (this.nextRing + 1) % RING_POOL;
      ring.x = e.x;
      ring.y = e.y;
      ring.z = e.z;
      ring.radius = e.radius;
      ring.start = time;
      ring.active = true;
      ring.material.color.set(e.source === PLAYER_ID ? palette.debug.stepPlayer : palette.debug.stepGuard);
    }
  }

  private addShot(x: number, y: number, z: number, dx: number, dy: number, dz: number, time: number): void {
    const shot = this.shots[this.nextShot]!;
    this.nextShot = (this.nextShot + 1) % SHOT_POOL;
    const w = this.world;
    const terrain = w.terrain.raycast(x, y, z, dx, dy, dz, SHOT_RANGE);
    const object = w.colliders.raycast(x, y, z, dx, dy, dz, SHOT_RANGE, Blocks.Bullet, this.hit).dist;
    const d = Math.min(terrain, object, SHOT_RANGE);
    const pos = shot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const hx = x + dx * d;
    const hy = y + dy * d;
    const hz = z + dz * d;
    const c = Math.max(0.4, d * 0.004); // the cross stays visible from the muzzle
    pos.setXYZ(0, x, y, z);
    pos.setXYZ(1, hx, hy, hz);
    pos.setXYZ(2, hx - c, hy, hz);
    pos.setXYZ(3, hx + c, hy, hz);
    pos.setXYZ(4, hx, hy - c, hz);
    pos.setXYZ(5, hx, hy + c, hz);
    pos.setXYZ(6, hx, hy, hz - c);
    pos.setXYZ(7, hx, hy, hz + c);
    pos.needsUpdate = true;
    shot.start = time;
    shot.active = true;
    shot.line.visible = true;
  }

  update(prev: Snapshot, curr: Snapshot, alpha: number, time: number, aim: THREE.Vector3 | null, cameraPos: THREE.Vector3): void {
    const hf = this.world.terrain;

    // Cones and facing lines follow each guard's head, matched by entity id.
    const n = curr.guardIds.length;
    if (n > this.facingCapacity) {
      this.facingCapacity = n * 2;
      this.facing.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.facingCapacity * 6), 3));
    }
    this.facing.geometry.setDrawRange(0, n * 2);
    const facing = this.facing.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.prevIndex.clear();
    prev.guardIds.forEach((id, i) => this.prevIndex.set(id, i));
    for (let i = 0; i < n; i++) {
      const id = curr.guardIds[i]!;
      const o = i * GUARD_FIELDS;
      const j = this.prevIndex.get(id);
      const a = j === undefined ? curr.guards : prev.guards;
      const oa = (j ?? i) * GUARD_FIELDS;
      const x = lerp(a[oa]!, curr.guards[o]!, alpha);
      const y = lerp(a[oa + 1]!, curr.guards[o + 1]!, alpha);
      const z = lerp(a[oa + 2]!, curr.guards[o + 2]!, alpha);
      const look = curr.guards[o + 3]! + curr.guards[o + 4]!;
      let cone = this.cones.get(id);
      if (!cone) {
        cone = { core: coneMesh(this.coneIndex, palette.debug.coneCore, 0.22), wide: coneMesh(this.coneIndex, palette.debug.cone, 0.09) };
        cone.core.renderOrder = 2;
        cone.wide.renderOrder = 1;
        this.cones.set(id, cone);
        this.group.add(cone.wide, cone.core);
      }
      layCone(cone.core, hf, x, z, look, this.coreHalf);
      layCone(cone.wide, hf, x, z, look, this.wideHalf);
      const fx = -Math.sin(look);
      const fz = -Math.cos(look);
      facing.setXYZ(i * 2, x, y + 1.7, z);
      facing.setXYZ(i * 2 + 1, x + fx * 6, y + 1.7, z + fz * 6);
    }
    facing.needsUpdate = true;
    this.facing.geometry.computeBoundingSphere();
    if (this.cones.size > n) {
      for (const [id, cone] of this.cones) {
        if (curr.guardIds.includes(id)) continue;
        for (const m of [cone.core, cone.wide]) {
          this.group.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
        this.cones.delete(id);
      }
    }

    for (const shot of this.shots) {
      if (!shot.active) continue;
      const t = (time - shot.start) / SHOT_LIFE;
      if (t >= 1) {
        shot.active = false;
        shot.line.visible = false;
        continue;
      }
      shot.material.opacity = t < 0.5 ? 1 : 2 * (1 - t);
    }

    // Sound rings expand to their hearing radius and fade.
    for (const ring of this.rings) {
      if (!ring.active) continue;
      const t = (time - ring.start) / RING_LIFE;
      if (t >= 1 || t < 0) {
        ring.active = false;
        ring.line.visible = false;
        continue;
      }
      const r = ring.radius * (1 - (1 - t) * (1 - t));
      const pos = ring.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < RING_POINTS; k++) {
        const a = (k / RING_POINTS) * Math.PI * 2;
        const px = ring.x + Math.cos(a) * r;
        const pz = ring.z + Math.sin(a) * r;
        pos.setXYZ(k, px, Math.max(hf.heightAt(px, pz), ring.y - 0.5) + 0.12, pz);
      }
      pos.needsUpdate = true;
      ring.material.opacity = 0.85 * (1 - t);
      ring.line.visible = true;
    }

    if (aim) {
      this.aim.visible = true;
      this.aim.position.copy(aim);
      this.aim.scale.setScalar(Math.max(0.15, aim.distanceTo(cameraPos) * 0.012));
    } else {
      this.aim.visible = false;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Triangle indices for a fan of CONE_SEGMENTS × CONE_RINGS around a centre vertex. */
function fanIndex(): number[] {
  const idx: number[] = [];
  const row = CONE_SEGMENTS + 1;
  const v = (r: number, a: number) => 1 + (r - 1) * row + a;
  for (let a = 0; a < CONE_SEGMENTS; a++) idx.push(0, v(1, a), v(1, a + 1));
  for (let r = 1; r < CONE_RINGS; r++) {
    for (let a = 0; a < CONE_SEGMENTS; a++) {
      idx.push(v(r, a), v(r + 1, a), v(r + 1, a + 1), v(r, a), v(r + 1, a + 1), v(r, a + 1));
    }
  }
  return idx;
}

function coneMesh(index: number[], color: string, opacity: number): THREE.Mesh {
  const count = 1 + CONE_RINGS * (CONE_SEGMENTS + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const colors = new Float32Array(count * 4);
  const c = new THREE.Color(color);
  for (let k = 0; k < count; k++) {
    const ring = k === 0 ? 0 : Math.floor((k - 1) / (CONE_SEGMENTS + 1)) + 1;
    colors.set([c.r, c.g, c.b, opacity * (1 - (ring / CONE_RINGS) * 0.85)], k * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

function layCone(
  mesh: THREE.Mesh,
  hf: World['terrain'],
  x: number,
  z: number,
  look: number,
  half: number,
): void {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, x, hf.heightAt(x, z) + 0.15, z);
  let k = 1;
  for (let r = 1; r <= CONE_RINGS; r++) {
    const dist = (CONE_RANGE * r) / CONE_RINGS;
    for (let a = 0; a <= CONE_SEGMENTS; a++) {
      const ang = look - half + (2 * half * a) / CONE_SEGMENTS;
      const px = x - Math.sin(ang) * dist;
      const pz = z - Math.cos(ang) * dist;
      pos.setXYZ(k++, px, hf.heightAt(px, pz) + 0.15, pz);
    }
  }
  pos.needsUpdate = true;
}

function buildColliderLines(world: World): THREE.LineSegments {
  const pos: number[] = [];
  const col: number[] = [];
  const colors = {
    all: new THREE.Color(palette.debug.collider),
    move: new THREE.Color('#1971c2'),
    sight: new THREE.Color('#2f9e44'),
  };
  for (const c of world.colliders.list) {
    const color = c.flags === Blocks.Sight ? colors.sight : c.flags & Blocks.Sight ? colors.all : colors.move;
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      pos.push(ax, ay, az, bx, by, bz);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };
    if (c.kind === 'box') {
      const vx = -c.uz;
      const vz = c.ux;
      const pts = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [c.x + a! * c.hx * c.ux + b! * c.hz * vx, c.z + a! * c.hx * c.uz + b! * c.hz * vz] as const);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = pts[k]!;
        const [bx, bz] = pts[(k + 1) % 4]!;
        seg(ax, c.y0, az, bx, c.y0, bz);
        seg(ax, c.y1, az, bx, c.y1, bz);
        seg(ax, c.y0, az, ax, c.y1, az);
      }
    } else {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        const ax = c.x + Math.cos(a0) * c.r;
        const az = c.z + Math.sin(a0) * c.r;
        const bx = c.x + Math.cos(a1) * c.r;
        const bz = c.z + Math.sin(a1) * c.r;
        seg(ax, c.y1, az, bx, c.y1, bz);
        seg(ax, c.y0, az, bx, c.y0, bz);
        if (k % 2 === 0) seg(ax, c.y0, az, ax, c.y1, az);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, fog: true }));
}

function buildPerches(world: World): THREE.Group {
  const group = new THREE.Group();
  const target = new THREE.Vector3(0, 0.5 + 1.4, 0);
  for (const p of world.report.perches) {
    const color = palette.debug.ridges[p.ridge % palette.debug.ridges.length]!;
    const top = new THREE.Vector3(p.x, p.y + 6, p.z);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, p.y, p.z), top, new THREE.Vector3(p.x, p.y + 0.6, p.z), target]);
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, fog: true })));
  }
  return group;
}
