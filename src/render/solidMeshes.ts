import * as THREE from 'three';
import { lerp } from '../sim/kernel/core/math';
import type { Snapshot } from '../sim/game/sim';
import { Blocks, type Collider } from '../sim/kernel/world/colliders';
import { createFlatMaterial, createLineMaterial, type LookUniforms } from './materials';
import { palette } from './palette';

/**
 * Entities' solid shapes (sim/kernel/world/solids.ts) drawn as what they are, until a kind of
 * entity gets a mesh of its own: a box or a cylinder with crisp edges, like the camp's
 * structures, or just its edges if it doesn't block sight (a chain-link gate). Drawn in
 * both views, so nothing solid is ever invisible. Matched by collider id between
 * snapshots, and moved smoothly between ticks.
 */
export class SolidMeshes {
  readonly group = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  private readonly boxEdges = new THREE.EdgesGeometry(this.box);
  private readonly cylinderEdges = new THREE.EdgesGeometry(this.cylinder, 30);
  private readonly faces: THREE.ShaderMaterial;
  private readonly lines = createLineMaterial(palette.edge);
  private readonly items = new Map<number, { object: THREE.Group; kind: Collider['kind']; opaque: boolean }>();
  private readonly prevIndex = new Map<number, number>();
  private readonly seen = new Set<number>();

  constructor(look: LookUniforms) {
    this.group.name = 'solids';
    this.faces = createFlatMaterial(look, { color: palette.structure });
  }

  update(prev: Snapshot, curr: Snapshot, alpha: number): void {
    this.prevIndex.clear();
    prev.solids.forEach((c, i) => this.prevIndex.set(c.id, i));
    this.seen.clear();
    for (const c of curr.solids) {
      this.seen.add(c.id);
      const opaque = (c.flags & Blocks.Sight) !== 0;
      let item = this.items.get(c.id);
      if (item && (item.kind !== c.kind || item.opaque !== opaque)) {
        this.group.remove(item.object);
        item = undefined;
      }
      if (!item) {
        item = { object: this.make(c.kind, opaque), kind: c.kind, opaque };
        this.items.set(c.id, item);
        this.group.add(item.object);
      }
      const j = this.prevIndex.get(c.id);
      place(item.object, j === undefined ? c : prev.solids[j]!, c, alpha);
    }
    for (const [id, item] of this.items) {
      if (this.seen.has(id)) continue;
      this.group.remove(item.object);
      this.items.delete(id);
    }
  }

  private make(kind: Collider['kind'], opaque: boolean): THREE.Group {
    const g = new THREE.Group();
    if (opaque) g.add(new THREE.Mesh(kind === 'box' ? this.box : this.cylinder, this.faces));
    g.add(new THREE.LineSegments(kind === 'box' ? this.boxEdges : this.cylinderEdges, this.lines));
    return g;
  }
}

/** Places a unit box or cylinder where a collider is, between two ticks' poses. */
function place(o: THREE.Object3D, a: Collider, b: Collider, t: number): void {
  const y0 = lerp(a.y0, b.y0, t);
  const y1 = lerp(a.y1, b.y1, t);
  o.position.set(lerp(a.x, b.x, t), (y0 + y1) / 2, lerp(a.z, b.z, t));
  if (b.kind === 'cyl') {
    const r = a.kind === 'cyl' ? lerp(a.r, b.r, t) : b.r;
    o.rotation.set(0, 0, 0);
    o.scale.set(r, Math.max(y1 - y0, 1e-3), r);
    return;
  }
  const ux = a.kind === 'box' ? lerp(a.ux, b.ux, t) : b.ux;
  const uz = a.kind === 'box' ? lerp(a.uz, b.uz, t) : b.uz;
  // The box's local x axis is (ux, uz); turning about y by θ takes (1, 0, 0) to (cos θ, 0, −sin θ).
  o.rotation.set(0, Math.atan2(-uz, ux), 0);
  o.scale.set(2 * b.hx, Math.max(y1 - y0, 1e-3), 2 * b.hz);
}
