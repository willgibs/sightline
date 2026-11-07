import * as THREE from 'three';
import type { World } from '../sim/gen/world';
import type { Bush, Tree } from '../sim/gen/props';
import { createFlatMaterial, type LookUniforms } from './materials';
import { palette } from './palette';
import { bushGeometry, bushMatrix, canopyGeometry, canopyMatrix } from './worldMeshes';

/**
 * The inside of foliage. Canopies and bushes are closed shapes drawn facing outward, so
 * an eye inside one (your head in a low canopy on a slope, prone in a bush, the fly
 * camera) would see straight out as if it weren't there, and see it pop back on leaving.
 * Instead, the one the eye is in shows its inner faces, translucent: you can tell you're
 * in it, and you still see out.
 *
 * Seeing out is what the simulation says today: a canopy blocks no sight, and a bush hides
 * you from a guard's eyes but nothing hides a guard from yours. Lab A decides what
 * foliage does to sight in both directions, and this follows.
 */

/** Grid cell for finding the foliage near the eye, metres. */
const CELL = 8;
/** How close to a shape's surface counts as in it: the camera's near plane (0.08 m) cuts into anything nearer. */
const MARGIN = 0.15;
/** Shapes shown at once, of each kind: overlapping canopies or bushes. */
const POOL = 3;
const OPACITY = 0.5;

export class FoliageInteriors {
  readonly group = new THREE.Group();
  private readonly trees: readonly Tree[];
  private readonly bushes: readonly Bush[];
  /** Indices into trees (≥ 0) and bushes (−1 − index) by grid cell. */
  private readonly cells = new Map<number, number[]>();
  private readonly canopies: THREE.Mesh[] = [];
  private readonly bushMeshes: THREE.Mesh[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(world: World, look: LookUniforms) {
    this.group.name = 'foliage-interiors';
    this.trees = world.props.trees;
    this.bushes = world.props.bushes;
    this.trees.forEach((t, i) => this.insert(i, t.x, t.z, t.canopyR + MARGIN));
    this.bushes.forEach((b, i) => this.insert(-1 - i, b.x, b.z, b.r + MARGIN));
    const make = (geo: THREE.BufferGeometry, color: string, into: THREE.Mesh[]) => {
      const material = createFlatMaterial(look, { color, opacity: OPACITY, side: THREE.BackSide });
      material.depthWrite = false;
      this.materials.push(material);
      this.geometries.push(geo);
      for (let k = 0; k < POOL; k++) {
        const mesh = new THREE.Mesh(geo, material);
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        // Drawn after everything else it surrounds.
        mesh.renderOrder = 10;
        into.push(mesh);
        this.group.add(mesh);
      }
    };
    make(canopyGeometry(), palette.canopy, this.canopies);
    make(bushGeometry(), palette.bush, this.bushMeshes);
  }

  /** Shows the inside of whatever foliage the eye is in, and hides the rest. */
  update(x: number, y: number, z: number): void {
    let nc = 0;
    let nb = 0;
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list) {
      for (const k of list) {
        if (k >= 0) {
          const t = this.trees[k]!;
          if (nc < POOL && inCanopy(t, x, y, z)) canopyMatrix(t, this.canopies[nc++]!.matrix);
        } else {
          const b = this.bushes[-1 - k]!;
          if (nb < POOL && inBush(b, x, y, z)) bushMatrix(b, this.bushMeshes[nb++]!.matrix);
        }
      }
    }
    for (let k = 0; k < POOL; k++) {
      const c = this.canopies[k]!;
      c.visible = k < nc;
      if (c.visible) c.matrixWorldNeedsUpdate = true;
      const b = this.bushMeshes[k]!;
      b.visible = k < nb;
      if (b.visible) b.matrixWorldNeedsUpdate = true;
    }
  }

  /** How many insides are showing (for tests and the debug view). */
  get showing(): number {
    return [...this.canopies, ...this.bushMeshes].filter((m) => m.visible).length;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.cells.clear();
  }

  private insert(index: number, x: number, z: number, r: number): void {
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const k = key(i, j);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(index);
      }
    }
  }
}

function key(i: number, j: number): number {
  return (i + 32768) * 65536 + (j + 32768);
}

/** Inside a canopy's cone (or within the margin of it): the cone's circumscribed circle at that height. */
export function inCanopy(t: Tree, x: number, y: number, z: number): boolean {
  const h = y - (t.y + t.trunkH);
  if (h < -MARGIN || h > t.canopyH + MARGIN) return false;
  const r = t.canopyR * (1 - Math.max(0, Math.min(1, h / t.canopyH))) + MARGIN;
  const dx = x - t.x;
  const dz = z - t.z;
  return dx * dx + dz * dz <= r * r;
}

/** Inside a bush (or within the margin of it): its circumscribed ellipsoid. */
export function inBush(b: Bush, x: number, y: number, z: number): boolean {
  const rx = b.r + MARGIN;
  const ry = b.h * 0.6 + MARGIN;
  const dx = (x - b.x) / rx;
  const dy = (y - (b.y + b.h * 0.4)) / ry;
  const dz = (z - b.z) / rx;
  return dx * dx + dy * dy + dz * dz <= 1;
}
