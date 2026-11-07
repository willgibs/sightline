import * as THREE from 'three';
import type { World } from '../sim/gen/world';
import type { Bush, Tree } from '../sim/gen/props';
import type { BoxCollider, Collider } from '../sim/world/colliders';
import { SURFACE_NAMES } from '../sim/world/surfaces';
import { createFlatMaterial, createLineMaterial, type LookUniforms } from './materials';
import { palette } from './palette';
import { createTerrainMaterial } from './terrainMaterial';

/**
 * Static meshes for a generated world. Everything here is built once per seed from the
 * simulation's own data (heights, props, colliders), so the picture always matches the
 * physics.
 */

const linearColor = (hex: string) => new THREE.Color(hex);

/** Tiles per side for terrain and props; each tile is frustum-culled on its own. */
const TILES = 4;

/** The detailed terrain: the heightfield's own triangles, tinted by surface, in tiles. */
export function buildTerrain(world: World, look: LookUniforms): THREE.Group {
  const hf = world.terrain;
  const { n, cells, heights, surfaces } = hf;
  const surfaceColors = SURFACE_NAMES.map((s) => linearColor(palette.surface[s]));
  const material = createTerrainMaterial(look, true);
  const group = new THREE.Group();
  group.name = 'terrain';
  const per = Math.ceil(cells / TILES);
  for (let tj = 0; tj < TILES; tj++) {
    for (let ti = 0; ti < TILES; ti++) {
      const i0 = ti * per;
      const j0 = tj * per;
      const i1 = Math.min(cells, i0 + per);
      const j1 = Math.min(cells, j0 + per);
      const w = i1 - i0 + 1;
      const h = j1 - j0 + 1;
      const positions = new Float32Array(w * h * 3);
      const tints = new Float32Array(w * h * 3);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * n + i;
          const o = ((j - j0) * w + (i - i0)) * 3;
          positions[o] = hf.coord(i);
          positions[o + 1] = heights[k]!;
          positions[o + 2] = hf.coord(j);
          const c = surfaceColors[surfaces[k]!]!;
          tints[o] = c.r;
          tints[o + 1] = c.g;
          tints[o + 2] = c.b;
        }
      }
      // Same split as Heightfield: each cell's diagonal runs from (i, j) to (i+1, j+1).
      const index = new Uint32Array((w - 1) * (h - 1) * 6);
      let o = 0;
      for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i;
          index[o++] = a;
          index[o++] = a + w + 1;
          index[o++] = a + 1;
          index[o++] = a;
          index[o++] = a + w;
          index[o++] = a + w + 1;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `terrain-${ti}-${tj}`;
      group.add(mesh);
    }
  }
  return group;
}

/** The landscape continuing to the horizon: coarse, unlined, tucked under the detailed terrain. */
export function buildBackdrop(world: World, look: LookUniforms): THREE.Mesh {
  const b = world.backdrop;
  const positions = new Float32Array(b.n * b.n * 3);
  const tints = new Float32Array(b.n * b.n * 3);
  const grass = linearColor(palette.surface.grass);
  const rock = linearColor(palette.surface.rock);
  for (let j = 0; j < b.n; j++) {
    for (let i = 0; i < b.n; i++) {
      const k = j * b.n + i;
      const h = b.heights[k]!;
      positions[k * 3] = -b.size / 2 + i * b.cell;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = -b.size / 2 + j * b.cell;
      const c = h > 60 ? rock : grass;
      tints[k * 3] = c.r;
      tints[k * 3 + 1] = c.g;
      tints[k * 3 + 2] = c.b;
    }
  }
  const cells = b.n - 1;
  const index = new Uint32Array(cells * cells * 6);
  let o = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * b.n + i;
      index[o++] = a;
      index[o++] = a + b.n + 1;
      index[o++] = a + 1;
      index[o++] = a;
      index[o++] = a + b.n;
      index[o++] = a + b.n + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, createTerrainMaterial(look, false));
  mesh.name = 'backdrop';
  return mesh;
}

const Y = new THREE.Vector3(0, 1, 0);

export function yRotation(ux: number, uz: number, q: THREE.Quaternion): THREE.Quaternion {
  // Local +x maps to (ux, 0, uz).
  return q.setFromAxisAngle(Y, Math.atan2(-uz, ux));
}

/** A conifer's canopy: a seven-sided cone standing on its base (scaled per tree by canopyMatrix). */
export function canopyGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 7, 1);
  g.translate(0, 0.5, 0);
  return g;
}

export function bushGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(1, 0);
}

const placeQ = new THREE.Quaternion();
const placeP = new THREE.Vector3();
const placeS = new THREE.Vector3();

export function canopyMatrix(t: Tree, out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(placeP.set(t.x, t.y + t.trunkH, t.z), yRotation(t.ux, t.uz, placeQ), placeS.set(t.canopyR, t.canopyH, t.canopyR));
}

export function bushMatrix(b: Bush, out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(placeP.set(b.x, b.y + b.h * 0.4, b.z), placeQ.identity(), placeS.set(b.r, b.h * 0.6, b.r));
}

/** Conifers, rocks and bushes as instanced meshes plus edge lines, one set per tile. */
export function buildProps(world: World, look: LookUniforms): THREE.Group {
  const group = new THREE.Group();
  group.name = 'props';
  const size = world.terrain.size;
  const tileOf = (x: number, z: number) => {
    const i = Math.min(TILES - 1, Math.max(0, Math.floor(((x + size / 2) / size) * TILES)));
    const j = Math.min(TILES - 1, Math.max(0, Math.floor(((z + size / 2) / size) * TILES)));
    return j * TILES + i;
  };
  const bucket = <T extends { x: number; z: number }>(items: T[]): T[][] => {
    const out: T[][] = Array.from({ length: TILES * TILES }, () => []);
    for (const it of items) out[tileOf(it.x, it.z)]!.push(it);
    return out;
  };

  const canopyGeo = canopyGeometry();
  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockEdgeTemplate = new THREE.EdgesGeometry(rockGeo, 1).getAttribute('position') as THREE.BufferAttribute;
  const bushGeo = bushGeometry();
  const canopyMat = createFlatMaterial(look, { color: palette.canopy });
  const trunkMat = createFlatMaterial(look, { color: palette.trunk });
  const rockMat = createFlatMaterial(look, { color: palette.rock });
  const bushMat = createFlatMaterial(look, { color: palette.bush });
  const treeLines = createLineMaterial(palette.edge, 0.55);
  const rockLines = createLineMaterial(palette.edge, 0.6);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const ring = 7;
  const treesByTile = bucket(world.props.trees);
  const rocksByTile = bucket(world.props.rocks);
  const bushesByTile = bucket(world.props.bushes);

  for (let tile = 0; tile < TILES * TILES; tile++) {
    const trees = treesByTile[tile]!;
    if (trees.length > 0) {
      const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
      const edges = new Float32Array(trees.length * ring * 12);
      let e = 0;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i]!;
        yRotation(t.ux, t.uz, q);
        canopyMatrix(t, m);
        canopies.setMatrixAt(i, m);
        m.compose(p.set(t.x, t.y - 0.3, t.z), q, s.set(t.trunkR, t.trunkH + 0.6, t.trunkR));
        trunks.setMatrixAt(i, m);
        // Edges: slant lines from the apex, and the base ring, matching ConeGeometry's vertices.
        const baseY = t.y + t.trunkH;
        const apexY = baseY + t.canopyH;
        for (let k = 0; k < ring; k++) {
          const a0 = (k / ring) * Math.PI * 2;
          const a1 = ((k + 1) / ring) * Math.PI * 2;
          const v0 = v.set(Math.sin(a0) * t.canopyR, 0, Math.cos(a0) * t.canopyR).applyQuaternion(q);
          const x0 = t.x + v0.x;
          const z0 = t.z + v0.z;
          const v1 = v.set(Math.sin(a1) * t.canopyR, 0, Math.cos(a1) * t.canopyR).applyQuaternion(q);
          const x1 = t.x + v1.x;
          const z1 = t.z + v1.z;
          edges.set([t.x, apexY, t.z, x0, baseY, z0, x0, baseY, z0, x1, baseY, z1], e);
          e += 12;
        }
      }
      for (const im of [canopies, trunks]) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
      group.add(lineSegments(edges, treeLines, `tree-edges-${tile}`));
    }

    const rocks = rocksByTile[tile]!;
    if (rocks.length > 0) {
      const mesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
      const edges = new Float32Array(rocks.length * rockEdgeTemplate.count * 3);
      let e = 0;
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i]!;
        yRotation(r.ux, r.uz, q);
        m.compose(p.set(r.x, r.y + r.sy * 0.2, r.z), q, s.set(r.sx, r.sy, r.sz));
        mesh.setMatrixAt(i, m);
        for (let k = 0; k < rockEdgeTemplate.count; k++) {
          v.fromBufferAttribute(rockEdgeTemplate, k).applyMatrix4(m);
          edges[e++] = v.x;
          edges[e++] = v.y;
          edges[e++] = v.z;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh, lineSegments(edges, rockLines, `rock-edges-${tile}`));
    }

    const bushes = bushesByTile[tile]!;
    if (bushes.length > 0) {
      const mesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
      for (let i = 0; i < bushes.length; i++) {
        const b = bushes[i]!;
        bushMatrix(b, m);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}

/** The camp: every box and cylinder collider drawn as a solid with crisp edges; fences as chain link. */
export function buildCamp(world: World, look: LookUniforms): THREE.Group {
  const group = new THREE.Group();
  group.name = 'camp';
  const solid = new GeometrySink();
  const edges: number[] = [];
  const fence = new GeometrySink(true);
  const kindColor: Record<string, string> = {
    building: palette.structure,
    tower: palette.structure,
    container: palette.container,
    vehicle: palette.vehicle,
    sandbags: palette.sandbags,
    crate: palette.sandbags,
    generator: palette.container,
    post: palette.vehicle,
    pole: palette.vehicle,
    mast: palette.vehicle,
    block: palette.structure,
  };
  for (const st of world.camp.structures) {
    for (const id of st.colliders) {
      const c = world.colliders.list[id]!;
      if (st.kind === 'fence' && c.kind === 'box') {
        fencePanel(c, fence, edges);
        continue;
      }
      const color = new THREE.Color(kindColor[st.kind] ?? palette.structure);
      if (c.kind === 'box') solidBox(c, color, solid, edges);
      else solidCylinder(c, color, solid, edges);
    }
  }
  const solidMesh = new THREE.Mesh(solid.geometry(), createFlatMaterial(look, { color: '#ffffff', vertexTint: true }));
  solidMesh.name = 'camp-solids';
  const fenceMesh = new THREE.Mesh(
    fence.geometry(),
    new THREE.MeshBasicMaterial({
      map: chainLinkTexture(),
      color: palette.fence,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Flat, so one pass draws both sides; two would rebuild the program lookup every frame.
      forceSinglePass: true,
      fog: true,
    }),
  );
  fenceMesh.name = 'camp-fence';
  group.add(solidMesh, fenceMesh, lineSegments(new Float32Array(edges), createLineMaterial(palette.edge), 'camp-edges'));
  return group;
}

function lineSegments(positions: Float32Array, material: THREE.LineBasicMaterial, name: string): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeBoundingSphere();
  const l = new THREE.LineSegments(geo, material);
  l.name = name;
  return l;
}

/** Accumulates triangles (with tints, and optionally UVs) into one geometry. */
class GeometrySink {
  readonly pos: number[] = [];
  readonly tint: number[] = [];
  readonly uv: number[] = [];
  constructor(private readonly withUv = false) {}

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, outward?: THREE.Vector3): void {
    // Wind counter-clockwise as seen from outside.
    if (outward) {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.dot(outward) < 0) [b, c] = [c, b];
    }
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.tint.push(color.r, color.g, color.b);
    }
  }

  quadUv(corners: THREE.Vector3[], uvs: number[]): void {
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      const v = corners[k]!;
      this.pos.push(v.x, v.y, v.z);
      this.tint.push(1, 1, 1);
      this.uv.push(uvs[k * 2]!, uvs[k * 2 + 1]!);
    }
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    if (this.withUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

function boxCorners(c: BoxCollider): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const vx = -c.uz;
  const vz = c.ux;
  for (const y of [c.y0, c.y1]) {
    for (const [sa, sb] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      out.push(new THREE.Vector3(c.x + sa * c.hx * c.ux + sb * c.hz * vx, y, c.z + sa * c.hx * c.uz + sb * c.hz * vz));
    }
  }
  return out; // 0-3 bottom ring, 4-7 top ring
}

function solidBox(c: BoxCollider, color: THREE.Color, sink: GeometrySink, edges: number[]): void {
  const v = boxCorners(c);
  const centre = new THREE.Vector3(c.x, (c.y0 + c.y1) / 2, c.z);
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  for (const f of faces) {
    const fc = new THREE.Vector3();
    for (const k of f) fc.add(v[k]!);
    fc.multiplyScalar(0.25);
    const outward = fc.clone().sub(centre);
    sink.tri(v[f[0]!]!, v[f[1]!]!, v[f[2]!]!, color, outward);
    sink.tri(v[f[0]!]!, v[f[2]!]!, v[f[3]!]!, color, outward);
  }
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of pairs) edges.push(v[a!]!.x, v[a!]!.y, v[a!]!.z, v[b!]!.x, v[b!]!.y, v[b!]!.z);
}

function solidCylinder(c: Collider, color: THREE.Color, sink: GeometrySink, edges: number[]): void {
  if (c.kind !== 'cyl') return;
  const seg = 8;
  const ring = (y: number) =>
    Array.from({ length: seg }, (_, k) => {
      const a = (k / seg) * Math.PI * 2;
      return new THREE.Vector3(c.x + Math.cos(a) * c.r, y, c.z + Math.sin(a) * c.r);
    });
  const bottom = ring(c.y0);
  const top = ring(c.y1);
  const topCentre = new THREE.Vector3(c.x, c.y1, c.z);
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg;
    const outward = new THREE.Vector3().addVectors(bottom[k]!, bottom[k1]!).multiplyScalar(0.5).sub(new THREE.Vector3(c.x, c.y0, c.z));
    sink.tri(bottom[k]!, bottom[k1]!, top[k1]!, color, outward);
    sink.tri(bottom[k]!, top[k1]!, top[k]!, color, outward);
    sink.tri(topCentre, top[k]!, top[k1]!, color, new THREE.Vector3(0, 1, 0));
    edges.push(top[k]!.x, top[k]!.y, top[k]!.z, top[k1]!.x, top[k1]!.y, top[k1]!.z);
  }
}

/** A fence segment: two-sided chain-link panel with a top rail line. */
function fencePanel(c: BoxCollider, sink: GeometrySink, edges: number[]): void {
  // The panel runs along the box's longer horizontal axis, through its centre.
  const alongU = c.hx >= c.hz;
  const len = alongU ? c.hx : c.hz;
  const dx = alongU ? c.ux : -c.uz;
  const dz = alongU ? c.uz : c.ux;
  const a = new THREE.Vector3(c.x - dx * len, 0, c.z - dz * len);
  const b = new THREE.Vector3(c.x + dx * len, 0, c.z + dz * len);
  const y0 = c.y0 + 0.25;
  const y1 = c.y1;
  const corners = [
    new THREE.Vector3(a.x, y0, a.z),
    new THREE.Vector3(b.x, y0, b.z),
    new THREE.Vector3(b.x, y1, b.z),
    new THREE.Vector3(a.x, y1, a.z),
  ];
  const period = 0.12; // chain-link diamonds every 12 cm, as texture repeats
  const u1 = (len * 2) / period;
  const v1 = (y1 - y0) / period;
  sink.quadUv(corners, [0, 0, u1, 0, u1, v1, 0, v1]);
  edges.push(a.x, y1, a.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y0, b.z);
}

let chainLink: THREE.Texture | null = null;

/** A tiny diamond-lattice texture, generated once. Mipmaps blend it to a grey haze at range. */
function chainLinkTexture(): THREE.Texture {
  if (chainLink) return chainLink;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d1 = Math.abs(((x + y) % size) - size / 2);
      const d2 = Math.abs(((x - y + size) % size) - size / 2);
      const wire = Math.min(Math.abs(d1 - size / 2), Math.abs(d2 - size / 2)) < 2 || d1 < 2 || d2 < 2;
      const k = (y * size + x) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = wire ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  chainLink = tex;
  return tex;
}
