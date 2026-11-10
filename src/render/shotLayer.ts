import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import { flightAt, vec3 } from '../sim/ballistics';
import type { SimEvent } from '../sim/kernel/events';
import { remainsShape } from '../sim/game/remains';
import type { Snapshot } from '../sim/game/sim';
import { emptyShape, type Capsule } from '../sim/kernel/world/shape';
import { Surface } from '../sim/kernel/world/surfaces';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

/**
 * What a shot leaves for the eye (lab B, B4 and B10), drawn from the simulation and
 * adding no motion of its own (rule 14):
 *   - the body a killed guard leaves, shaped at every frame by the same pure function the
 *     simulation's sight lines and bullets see (game/remains.ts);
 *   - each bullet's trace: a short streak along its simulated path, ending where the
 *     bullet is at the frame's instant (ballistics lane, flightAt);
 *   - dust where a bullet strikes the ground, a splash on water, a flash on steel, shown
 *     from the instant of the strike: the miss a spotter reads to correct the next shot.
 *
 * Nothing here is made or thrown away while a fight is on. A material thrown away takes its
 * shader program with it when it was the last to use it, and the next strike then waits
 * for the program to be built again: most of a second on some machines, at the moment of
 * every shot. The puffs are a fixed set, made with the layer and kept until it goes.
 */

interface Fallen {
  root: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  legs: THREE.Mesh;
}

interface Puff {
  mesh: THREE.Mesh;
  /** Simulation time of the strike, seconds; how long it lasts, and how big it grows. */
  at: number;
  life: number;
  size: number;
  /** In use: struck, and not yet gone. */
  live: boolean;
}

/** Puffs on show at once: one more strike than that takes over the oldest. */
const PUFFS = 32;

const TRACE_SECONDS = 0.012;
const TRACE_POINTS = 6;

export class ShotLayer {
  readonly group = new THREE.Group();
  private readonly fallen = new Map<number, Fallen>();
  private readonly material: THREE.ShaderMaterial;
  private readonly sphere: THREE.SphereGeometry;
  private readonly cylinder: THREE.CylinderGeometry;
  private readonly cap: THREE.SphereGeometry;
  private readonly shape = emptyShape();
  private readonly traces: THREE.LineSegments;
  private readonly tracePositions: Float32Array;
  private readonly puffs: Puff[] = [];
  private readonly puffGroup = new THREE.Group();
  private readonly puffGeometry = new THREE.IcosahedronGeometry(1, 1);
  private readonly p = vec3();
  private readonly q = vec3();
  private readonly rocks = new Map<number, THREE.Mesh>();
  private readonly rockGeometry = new THREE.IcosahedronGeometry(1, 0);

  constructor(
    look: LookUniforms,
    private tuning: Tuning,
  ) {
    this.group.name = 'shots';
    this.material = createFlatMaterial(look, { color: palette.guard });
    this.sphere = new THREE.SphereGeometry(1, 12, 8);
    // Capsules are drawn as a cylinder and two caps, scaled to each part's length.
    this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.cap = new THREE.SphereGeometry(1, 10, 6);
    const max = 16;
    this.tracePositions = new Float32Array(max * (TRACE_POINTS - 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3));
    this.traces = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#f8f4e8', transparent: true, opacity: 0.85, depthWrite: false }));
    this.traces.frustumCulled = false;
    this.traces.name = 'traces';
    this.group.add(this.traces);
    this.puffGroup.name = 'puffs';
    for (let k = 0; k < PUFFS; k++) {
      const mesh = new THREE.Mesh(this.puffGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, fog: true }));
      mesh.visible = false;
      this.puffGroup.add(mesh);
      this.puffs.push({ mesh, at: 0, life: 0, size: 0, live: false });
    }
    // A body on the ground and a thrown stone are drawn with this material, and neither is there until a fight is on.
    const first = new THREE.Mesh(this.sphere, this.material);
    first.visible = false;
    first.name = 'first-use';
    this.group.add(this.puffGroup, first);
  }

  setTuning(t: Tuning): void {
    this.tuning = t;
  }

  /** Strikes from a tick's events: a puff at each, shown from its instant. */
  addEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'impact') continue;
      const water = e.surface === Surface.Water && e.what === 'terrain';
      const steel = e.surface === Surface.Metal && e.what !== 'body';
      // Darker than the ground it rises from, so it reads against it at 500 m; steel flashes.
      const color = e.what === 'body' ? '#4a403a' : water ? '#f4f7f9' : steel ? '#fffbe0' : e.surface === Surface.Rock ? '#8d8a82' : e.surface === Surface.Grass ? '#7b7558' : '#8a7154';
      // One that's free, or else the one that has been up longest.
      let p = this.puffs[0]!;
      for (const q of this.puffs) {
        if (!q.live) {
          p = q;
          break;
        }
        if (q.at < p.at) p = q;
      }
      (p.mesh.material as THREE.MeshBasicMaterial).color.set(color);
      p.mesh.position.set(e.x, e.y, e.z);
      p.mesh.visible = false;
      p.live = true;
      p.at = e.t;
      p.life = steel ? 0.3 : e.what === 'body' ? 0.6 : 2.2;
      p.size = steel ? 0.45 : e.what === 'body' ? 0.25 : water ? 1.1 : 1.2;
    }
  }

  update(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const hz = this.tuning.sim.tickHz;
    // The frame shows the simulation between the last two ticks.
    const t = (prev.tick + (curr.tick - prev.tick) * alpha) / hz;
    this.updateFallen(curr, t);
    this.updateTraces(curr, t);
    this.updatePuffs(t);
    this.updateRocks(prev, curr, alpha);
  }

  /** Thrown things, between their last two positions. */
  private updateRocks(prev: Snapshot, curr: Snapshot, alpha: number): void {
    const seen = new Set<number>();
    for (const o of curr.thrown) {
      seen.add(o.id);
      let m = this.rocks.get(o.id);
      if (!m) {
        m = new THREE.Mesh(this.rockGeometry, this.material);
        m.scale.setScalar(this.tuning.ballistics.throwable.radius);
        this.group.add(m);
        this.rocks.set(o.id, m);
      }
      const a = prev.thrown.find((p) => p.id === o.id) ?? o;
      m.position.set(a.x + (o.x - a.x) * alpha, a.y + (o.y - a.y) * alpha, a.z + (o.z - a.z) * alpha);
    }
    for (const [id, m] of this.rocks) {
      if (seen.has(id)) continue;
      this.group.remove(m);
      this.rocks.delete(id);
    }
  }

  private updateFallen(curr: Snapshot, t: number): void {
    const seen = new Set<number>();
    for (const r of curr.remains) {
      seen.add(r.id);
      let f = this.fallen.get(r.id);
      if (!f) {
        f = this.make();
        this.fallen.set(r.id, f);
      }
      remainsShape(r, t, this.tuning, this.shape);
      const h = this.shape.head;
      f.head.position.set(h.x, h.y, h.z);
      f.head.scale.setScalar(h.r);
      placeCapsule(f.torso, this.shape.torso);
      placeCapsule(f.legs, this.shape.legs);
    }
    for (const [id, f] of this.fallen) {
      if (seen.has(id)) continue;
      this.group.remove(f.root);
      this.fallen.delete(id);
    }
  }

  private make(): Fallen {
    const root = new THREE.Group();
    const head = new THREE.Mesh(this.sphere, this.material);
    const torso = this.capsuleMesh();
    const legs = this.capsuleMesh();
    root.add(head, torso, legs);
    this.group.add(root);
    return { root, head, torso, legs };
  }

  /** A capsule as a group: a unit cylinder along its local y, and two caps, placed by placeCapsule. */
  private capsuleMesh(): THREE.Mesh {
    const body = new THREE.Mesh(this.cylinder, this.material);
    const a = new THREE.Mesh(this.cap, this.material);
    const b = new THREE.Mesh(this.cap, this.material);
    a.name = 'cap-a';
    b.name = 'cap-b';
    body.add(a, b);
    return body;
  }

  private updateTraces(curr: Snapshot, t: number): void {
    const out = this.tracePositions;
    let n = 0;
    for (const b of curr.bullets) {
      if (n + (TRACE_POINTS - 1) * 6 > out.length) break;
      const f = b.flight;
      if (t <= f.t) continue;
      // The last few milliseconds of its path, ending where it is now.
      for (let k = 0; k < TRACE_POINTS - 1; k++) {
        const t0 = Math.max(f.t, t - TRACE_SECONDS * (1 - k / (TRACE_POINTS - 1)));
        const t1 = Math.max(f.t, t - TRACE_SECONDS * (1 - (k + 1) / (TRACE_POINTS - 1)));
        flightAt(f, t0, this.p);
        flightAt(f, t1, this.q);
        out[n++] = this.p.x;
        out[n++] = this.p.y;
        out[n++] = this.p.z;
        out[n++] = this.q.x;
        out[n++] = this.q.y;
        out[n++] = this.q.z;
      }
    }
    const geo = this.traces.geometry;
    geo.setDrawRange(0, n / 3);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updatePuffs(t: number): void {
    for (const p of this.puffs) {
      if (!p.live) continue;
      const age = t - p.at;
      if (age > p.life || age < -2) {
        p.live = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = age >= 0;
      if (age < 0) continue;
      const f = age / p.life;
      // Out fast, then hanging and thinning.
      p.mesh.scale.setScalar(p.size * (0.25 + 0.75 * Math.sqrt(f)));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - f) * (1 - f);
    }
  }

  dispose(): void {
    for (const p of this.puffs) (p.mesh.material as THREE.Material).dispose();
    this.puffs.length = 0;
    this.material.dispose();
    this.sphere.dispose();
    this.cylinder.dispose();
    this.cap.dispose();
    this.puffGeometry.dispose();
    this.rockGeometry.dispose();
    this.rocks.clear();
    this.traces.geometry.dispose();
    (this.traces.material as THREE.Material).dispose();
    this.fallen.clear();
  }
}

const up = new THREE.Vector3(0, 1, 0);
const axis = new THREE.Vector3();

/** Places a capsule mesh (capsuleMesh) on a capsule: its cylinder between the ends, its caps at them. */
function placeCapsule(mesh: THREE.Mesh, c: Capsule): void {
  axis.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az);
  const len = axis.length();
  mesh.position.set((c.ax + c.bx) / 2, (c.ay + c.by) / 2, (c.az + c.bz) / 2);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(up, axis.divideScalar(len));
  else mesh.quaternion.identity();
  mesh.scale.set(c.r, Math.max(len, 1e-4), c.r);
  // The caps sit at the ends, round whatever the cylinder's length.
  const half = 0.5;
  for (const child of mesh.children) {
    child.position.set(0, child.name === 'cap-a' ? -half : half, 0);
    child.scale.set(1, c.r / Math.max(len, 1e-4), 1);
  }
}
