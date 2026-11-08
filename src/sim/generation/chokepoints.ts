import { Cell, Edge, type GridLayer } from '../kernel/world/grid';
import type { Point2 } from './paths';

/**
 * The camp's real chokepoints (D6), where sentries stand. Brogue finds chokepoints by
 * blocking each cell of a one-cell-wide corridor and counting what it cuts off; a camp's
 * passages are metres wide, so this asks the general question instead: the narrowest set
 * of cells that separates two places, the minimum vertex cut between them (Menger), found
 * by maximum flow. A passage between two buildings, a gap in a fence, a doorway: whatever
 * every way from one place to the other must cross, and how wide it is.
 *
 * It works on a coarse copy of the site layer (`COARSE` site cells a side), connected
 * wherever the site layer's own walk edges connect the cells inside, so the coarse graph is
 * a contraction of the fine one: connected exactly when it is. Augmenting paths are found
 * by breadth-first search in a fixed neighbour order, so the cut found is the same in every
 * engine, and the flow stops at `maxWidth` (rule 18): a passage wider than that is no
 * chokepoint.
 */
export interface Choke {
  /** The middle of the cut. */
  x: number;
  z: number;
  /** Its cells, and how wide it is, in metres. */
  cells: Point2[];
  width: number;
}

const COARSE = 2;

export function minimumCut(layer: GridLayer, from: Point2, fromRadius: number, to: Point2, toRadius: number, maxWidth: number): Choke | null {
  const g = coarse(layer);
  const N = g.nx * g.nz;
  const source = new Uint8Array(N);
  const sink = new Uint8Array(N);
  const centre = (v: number): Point2 => ({ x: g.x0 + ((v % g.nx) + 0.5) * g.cell, z: g.z0 + (Math.floor(v / g.nx) + 0.5) * g.cell });
  for (let v = 0; v < N; v++) {
    if (!g.walk[v]) continue;
    const p = centre(v);
    if ((p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z) <= fromRadius * fromRadius) source[v] = 1;
    else if ((p.x - to.x) * (p.x - to.x) + (p.z - to.z) * (p.z - to.z) <= toRadius * toRadius) sink[v] = 1;
  }
  // Flow: through each cell (in → out, capacity 1 unless it's a source or sink), and along
  // each open edge between neighbours (out → in, unbounded).
  const through = new Int32Array(N);
  const along = new Int32Array(N * 4); // flow from v_out to its k-th neighbour's in
  const maxFlow = Math.ceil(maxWidth / g.cell);
  const prevNode = new Int32Array(2 * N + 2);
  const queue = new Int32Array(2 * N + 2);
  const S = 2 * N;
  const T = 2 * N + 1;
  const neighbour = (v: number, k: number): number => {
    const i = v % g.nx;
    const j = (v - i) / g.nx;
    const [di, dj] = DIRS[k]!;
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) return -1;
    const w = nj * g.nx + ni;
    return g.open(v, k) ? w : -1;
  };
  const reverse = (k: number): number => (k + 2) % 4;
  let flow = 0;
  for (; flow <= maxFlow; flow++) {
    // Breadth-first search over the residual graph; nodes 2v (in), 2v + 1 (out), S, T.
    prevNode.fill(-1);
    let head = 0;
    let tail = 0;
    prevNode[S] = S;
    queue[tail++] = S;
    let found = false;
    while (head < tail && !found) {
      const u = queue[head++]!;
      const visit = (w: number) => {
        if (prevNode[w] !== -1) return;
        prevNode[w] = u;
        queue[tail++] = w;
        if (w === T) found = true;
      };
      if (u === S) {
        for (let v = 0; v < N; v++) if (source[v]) visit(2 * v);
        continue;
      }
      const v = u >> 1;
      if ((u & 1) === 0) {
        // In-node: through the cell, or back along an edge that carries flow into it.
        if (source[v] || sink[v] || through[v]! < 1) visit(2 * v + 1);
        for (let k = 0; k < 4; k++) {
          const w = neighbour(v, k);
          if (w >= 0 && along[w * 4 + reverse(k)]! > 0) visit(2 * w + 1);
        }
      } else {
        // Out-node: to a neighbour's in-node, to the sink, or back through the cell.
        if (sink[v]) visit(T);
        for (let k = 0; k < 4; k++) {
          const w = neighbour(v, k);
          if (w >= 0) visit(2 * w);
        }
        if (through[v]! > 0) visit(2 * v);
      }
    }
    if (!found) break;
    // Push one unit back along the path.
    for (let w = T; w !== S; ) {
      const u = prevNode[w]!;
      if (u !== S && w !== T) {
        const a = u >> 1;
        const b = w >> 1;
        if (a === b) through[a] = through[a]! + ((u & 1) === 0 ? 1 : -1);
        else {
          const k = dirTo(g.nx, a, b);
          if ((u & 1) === 1) along[a * 4 + k] = along[a * 4 + k]! + 1;
          else along[b * 4 + reverse(k)] = along[b * 4 + reverse(k)]! - 1;
        }
      }
      w = u;
    }
  }
  if (flow === 0 || flow > maxFlow) return null;
  // The cut: cells whose in-node the source still reaches but whose out-node it doesn't.
  const cut: Point2[] = [];
  for (let v = 0; v < N; v++) if (prevNode[2 * v] !== -1 && prevNode[2 * v + 1] === -1 && !source[v] && !sink[v]) cut.push(centre(v));
  if (cut.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const p of cut) {
    x += p.x;
    z += p.z;
  }
  return { x: x / cut.length, z: z / cut.length, cells: cut, width: cut.length * g.cell };
}

/** Right, up, left, down: k and (k + 2) % 4 are opposite. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function dirTo(nx: number, a: number, b: number): number {
  const d = b - a;
  return d === 1 ? 0 : d === nx ? 1 : d === -1 ? 2 : 3;
}

interface Coarse {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  walk: Uint8Array;
  /** Whether a body can cross from coarse cell v to its k-th neighbour. */
  open(v: number, k: number): boolean;
}

/** The site layer contracted by COARSE a side: a coarse cell is walkable if any cell inside is. */
function coarse(L: GridLayer): Coarse {
  const nx = Math.ceil(L.nx / COARSE);
  const nz = Math.ceil(L.nz / COARSE);
  const walk = new Uint8Array(nx * nz);
  for (let j = 0; j < L.nz; j++) for (let i = 0; i < L.nx; i++) if (L.flags[j * L.nx + i]! & Cell.Walkable) walk[Math.floor(j / COARSE) * nx + Math.floor(i / COARSE)] = 1;
  // Crossings between coarse cells: any fine walk edge across their shared side.
  const east = new Uint8Array(nx * nz);
  const north = new Uint8Array(nx * nz);
  for (let j = 0; j < L.nz; j++) {
    for (let i = 0; i < L.nx; i++) {
      const e = L.edges[j * L.nx + i]!;
      const ci = Math.floor(i / COARSE);
      const cj = Math.floor(j / COARSE);
      if (e & Edge.East && Math.floor((i + 1) / COARSE) !== ci) east[cj * nx + ci] = 1;
      if (e & Edge.North && Math.floor((j + 1) / COARSE) !== cj) north[cj * nx + ci] = 1;
    }
  }
  return {
    x0: L.x0,
    z0: L.z0,
    cell: L.cell * COARSE,
    nx,
    nz,
    walk,
    open(v, k) {
      if (k === 0) return east[v] === 1;
      if (k === 1) return north[v] === 1;
      if (k === 2) return v % nx > 0 && east[v - 1] === 1;
      return v >= nx && north[v - nx] === 1;
    },
  };
}
