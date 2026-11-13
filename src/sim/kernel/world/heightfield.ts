import type { Hasher } from '../core/hash';
import { finiteRay } from '../core/math';
import { Surface } from './surfaces';

/**
 * The terrain: a square grid of heights with one surface type per vertex.
 *
 * Each cell is split into two triangles along the diagonal from its (i, j) corner to its
 * (i+1, j+1) corner. Height sampling, gradients and raycasts all use those exact
 * triangles, and the renderer builds its mesh from the same triangles, so what you see
 * is exactly what you stand on and shoot over.
 */
export class Heightfield {
  /** Cells per side. */
  readonly cells: number;
  /** Vertices per side (cells + 1). */
  readonly n: number;
  /** Cell edge length in metres. */
  readonly cell: number;
  /** Total edge length in metres. */
  readonly size: number;
  /** World x and z of vertex 0 (the grid is centred on the origin). */
  readonly min: number;
  readonly heights: Float32Array;
  readonly surfaces: Uint8Array;
  /** Highest vertex of each cell, for skipping cells during raycasts. */
  readonly cellMax: Float32Array;
  minHeight = 0;
  maxHeight = 0;
  /** Scratch for gainOnSteep: where a line is cut, and the triangle under one piece of it. Never read between calls. */
  private readonly cuts: number[] = [];
  private readonly piece: TerrainSample = { height: 0, gx: 0, gz: 0, slopeTan: 0, surface: Surface.Grass };

  constructor(size: number, cell: number) {
    this.cells = Math.round(size / cell);
    this.n = this.cells + 1;
    this.cell = cell;
    this.size = this.cells * cell;
    this.min = -this.size / 2;
    this.heights = new Float32Array(this.n * this.n);
    this.surfaces = new Uint8Array(this.n * this.n);
    this.cellMax = new Float32Array(this.cells * this.cells);
  }

  /** World x (or z) of vertex column i (or row j). */
  coord(i: number): number {
    return this.min + i * this.cell;
  }

  index(i: number, j: number): number {
    return j * this.n + i;
  }

  /** Feeds every height and surface, bit for bit, to a hash: what a world's fingerprint covers of its terrain. */
  hashInto(h: Hasher): Hasher {
    return h.bytes(new Uint8Array(this.heights.buffer)).bytes(this.surfaces);
  }

  /** Call after writing heights: refreshes the cell maxima and height range. */
  finalize(): void {
    const { n, cells, heights } = this;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < heights.length; k++) {
      const h = heights[k]!;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    this.minHeight = lo;
    this.maxHeight = hi;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const k = j * n + i;
        this.cellMax[j * cells + i] = Math.max(heights[k]!, heights[k + 1]!, heights[k + n]!, heights[k + n + 1]!);
      }
    }
  }

  inside(x: number, z: number): boolean {
    const hi = this.min + this.size;
    return x >= this.min && x <= hi && z >= this.min && z <= hi;
  }

  /** Height of the rendered surface at (x, z); positions outside the grid are clamped. */
  heightAt(x: number, z: number): number {
    const { cell, cells, n, heights } = this;
    const fx = (x - this.min) / cell;
    const fz = (z - this.min) / cell;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i < 0) i = 0;
    else if (i > cells - 1) i = cells - 1;
    if (j < 0) j = 0;
    else if (j > cells - 1) j = cells - 1;
    let u = fx - i;
    let v = fz - j;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const k = j * n + i;
    const h00 = heights[k]!;
    const h10 = heights[k + 1]!;
    const h01 = heights[k + n]!;
    const h11 = heights[k + n + 1]!;
    return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
  }

  /** Height plus the surface gradient (dh/dx, dh/dz) at (x, z). */
  sample(x: number, z: number, out: TerrainSample): TerrainSample {
    const { cell, cells, n, heights } = this;
    const fx = (x - this.min) / cell;
    const fz = (z - this.min) / cell;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i < 0) i = 0;
    else if (i > cells - 1) i = cells - 1;
    if (j < 0) j = 0;
    else if (j > cells - 1) j = cells - 1;
    let u = fx - i;
    let v = fz - j;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const k = j * n + i;
    const h00 = heights[k]!;
    const h10 = heights[k + 1]!;
    const h01 = heights[k + n]!;
    const h11 = heights[k + n + 1]!;
    if (u >= v) {
      out.height = h00 + u * (h10 - h00) + v * (h11 - h10);
      out.gx = (h10 - h00) / cell;
      out.gz = (h11 - h10) / cell;
    } else {
      out.height = h00 + v * (h01 - h00) + u * (h11 - h01);
      out.gx = (h11 - h01) / cell;
      out.gz = (h01 - h00) / cell;
    }
    out.slopeTan = Math.sqrt(out.gx * out.gx + out.gz * out.gz);
    out.surface = this.surfaceAt(x, z);
    return out;
  }

  /**
   * The steepest slope (rise over run, as `sample` gives it) among the triangles that have
   * any of their area inside the rectangle from (x0, z0) to (x1, z1). A point says what one
   * triangle does, and a square of ground lies on two or more: whoever asks whether the
   * whole square can be stood on has to ask this, because the motor judges the triangle a
   * body is on (CLAUDE.md rule 7). A triangle that only touches the rectangle along an edge
   * or at a corner doesn't count.
   */
  steepestIn(x0: number, z0: number, x1: number, z1: number): number {
    const { cell, cells, n, heights } = this;
    const a0 = (x0 - this.min) / cell;
    const a1 = (x1 - this.min) / cell;
    const b0 = (z0 - this.min) / cell;
    const b1 = (z1 - this.min) / cell;
    const last = cells - 1;
    // The cells with area inside: a rectangle that ends exactly on a cell line stops there.
    const i0 = Math.max(0, Math.min(last, Math.floor(a0)));
    const i1 = Math.max(i0, Math.min(last, Math.ceil(a1) - 1));
    const j0 = Math.max(0, Math.min(last, Math.floor(b0)));
    const j1 = Math.max(j0, Math.min(last, Math.ceil(b1) - 1));
    let worst = -1;
    for (let j = j0; j <= j1; j++) {
      // The rectangle's part of this cell, in the cell's own 0 to 1.
      const v0 = Math.max(0, Math.min(1, b0 - j));
      const v1 = Math.max(0, Math.min(1, b1 - j));
      for (let i = i0; i <= i1; i++) {
        const u0 = Math.max(0, Math.min(1, a0 - i));
        const u1 = Math.max(0, Math.min(1, a1 - i));
        const k = j * n + i;
        const h00 = heights[k]!;
        const h10 = heights[k + 1]!;
        const h01 = heights[k + n]!;
        const h11 = heights[k + n + 1]!;
        // The triangle where u >= v has area in the part if the part reaches a u over its least v.
        if (u1 > v0) {
          const gx = (h10 - h00) / cell;
          const gz = (h11 - h10) / cell;
          const s = gx * gx + gz * gz;
          if (s > worst) worst = s;
        }
        // And the other, where u < v, if it reaches a v over its least u.
        if (v1 > u0) {
          const gx = (h11 - h01) / cell;
          const gz = (h01 - h00) / cell;
          const s = gx * gx + gz * gz;
          if (s > worst) worst = s;
        }
      }
    }
    // A rectangle with no area on the terrain (off its edge, or a point): what the point under its middle says.
    if (worst < 0) return this.sample((x0 + x1) / 2, (z0 + z1) / 2, this.piece).slopeTan;
    return Math.sqrt(worst);
  }

  /**
   * Height gained on ground steeper than `tanMax` along the straight line from (x0, z0) to
   * (x1, z1). The line is cut wherever it crosses a triangle's edge (a grid line, or a
   * cell's diagonal), and each piece that lies on a triangle steeper than the limit adds
   * what it rises; a piece that descends adds nothing. So this is what something moving
   * along the line climbed on such ground, whatever it did on the rest: a line that leaves
   * a steep face downhill and goes on up walkable ground has gained nothing on the face.
   * Exact on the triangles everything else uses (CLAUDE.md rule 7). `out.first`, if asked
   * for, is the share of it gained on the triangle the line starts on.
   */
  gainOnSteep(x0: number, z0: number, x1: number, z1: number, tanMax: number, out?: { first: number }): number {
    const dx = x1 - x0;
    const dz = z1 - z0;
    if (out) out.first = 0;
    if (dx === 0 && dz === 0) return 0;
    const cuts = this.cuts;
    cuts.length = 0;
    const { min, cell } = this;
    addCuts(cuts, (x0 - min) / cell, dx / cell);
    addCuts(cuts, (z0 - min) / cell, dz / cell);
    addCuts(cuts, (x0 - z0) / cell, (dx - dz) / cell); // the diagonals: u = v in each cell
    // In order along the line. A handful at most for a tick's move: an insertion sort.
    for (let i = 1; i < cuts.length; i++) {
      const t = cuts[i]!;
      let j = i - 1;
      for (; j >= 0 && cuts[j]! > t; j--) cuts[j + 1] = cuts[j]!;
      cuts[j + 1] = t;
    }
    const s = this.piece;
    let gain = 0;
    let a = 0;
    for (let k = 0; k <= cuts.length; k++) {
      const b = k < cuts.length ? cuts[k]! : 1;
      if (b <= a) continue;
      // One triangle holds the whole piece, so its gradient at the middle is the piece's.
      const m = (a + b) * 0.5;
      this.sample(x0 + dx * m, z0 + dz * m, s);
      if (s.slopeTan > tanMax) {
        const rise = (s.gx * dx + s.gz * dz) * (b - a);
        if (rise > 0) {
          gain += rise;
          if (out && a === 0) out.first = rise;
        }
      }
      a = b;
    }
    return gain;
  }

  /** Surface of the nearest vertex. */
  surfaceAt(x: number, z: number): Surface {
    let i = Math.round((x - this.min) / this.cell);
    let j = Math.round((z - this.min) / this.cell);
    if (i < 0) i = 0;
    else if (i > this.cells) i = this.cells;
    if (j < 0) j = 0;
    else if (j > this.cells) j = this.cells;
    return this.surfaces[j * this.n + i] as Surface;
  }

  /**
   * Distance along a normalised ray to its first intersection with the terrain, or
   * Infinity. Walks the grid cell by cell (Amanatides–Woo) and intersects the two exact
   * triangles of each cell the ray could touch.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    // A ray that isn't a number hits nothing; walking the grid with it would never end.
    if (!finiteRay(ox, oy, oz, dx, dy, dz) || !(maxDist >= 0)) return Infinity;
    const lo = this.min;
    const hi = this.min + this.size;
    let t0 = 0;
    let t1 = maxDist;
    if (Math.abs(dx) < 1e-12) {
      if (ox < lo || ox > hi) return Infinity;
    } else {
      let ta = (lo - ox) / dx;
      let tb = (hi - ox) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (Math.abs(dz) < 1e-12) {
      if (oz < lo || oz > hi) return Infinity;
    } else {
      let ta = (lo - oz) / dz;
      let tb = (hi - oz) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (t0 > t1) return Infinity;

    const { cell, cells } = this;
    const sx = ox + dx * t0;
    const sz = oz + dz * t0;
    let i = Math.floor((sx - lo) / cell);
    let j = Math.floor((sz - lo) / cell);
    if (i < 0) i = 0;
    else if (i > cells - 1) i = cells - 1;
    if (j < 0) j = 0;
    else if (j > cells - 1) j = cells - 1;

    const stepI = dx > 0 ? 1 : -1;
    const stepJ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) < 1e-12 ? Infinity : cell / Math.abs(dx);
    const tDeltaZ = Math.abs(dz) < 1e-12 ? Infinity : cell / Math.abs(dz);
    let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : (lo + (dx > 0 ? i + 1 : i) * cell - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-12 ? Infinity : (lo + (dz > 0 ? j + 1 : j) * cell - oz) / dz;

    let tEnter = t0;
    for (;;) {
      const tExit = Math.min(tMaxX, tMaxZ, t1);
      const yA = oy + dy * tEnter;
      const yB = oy + dy * tExit;
      if ((yA < yB ? yA : yB) <= this.cellMax[j * cells + i]!) {
        const hit = this.intersectCell(i, j, ox, oy, oz, dx, dy, dz, tEnter, tExit);
        if (hit >= 0) return hit;
      }
      if (tExit >= t1) return Infinity;
      if (tMaxX < tMaxZ) {
        i += stepI;
        if (i < 0 || i >= cells) return Infinity;
        tEnter = tMaxX;
        tMaxX += tDeltaX;
      } else {
        j += stepJ;
        if (j < 0 || j >= cells) return Infinity;
        tEnter = tMaxZ;
        tMaxZ += tDeltaZ;
      }
    }
  }

  /**
   * Ray against the two triangles of cell (i, j) for t in [ta, tb]. Inside one triangle
   * both the ray height and the surface height are linear in t, so the crossing is exact.
   */
  private intersectCell(
    i: number,
    j: number,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    ta: number,
    tb: number,
  ): number {
    const { cell, n, heights } = this;
    const x0 = this.min + i * cell;
    const z0 = this.min + j * cell;
    const u0 = (ox - x0) / cell;
    const v0 = (oz - z0) / cell;
    const du = dx / cell;
    const dv = dz / cell;
    const k = j * n + i;
    const h00 = heights[k]!;
    const h10 = heights[k + 1]!;
    const h01 = heights[k + n]!;
    const h11 = heights[k + n + 1]!;

    // The diagonal u = v splits the ray's span through the cell into at most two pieces.
    let split = NaN;
    const denom = du - dv;
    if (Math.abs(denom) > 1e-12) {
      const td = (v0 - u0) / denom;
      if (td > ta && td < tb) split = td;
    }
    const pieces = Number.isNaN(split) ? 1 : 2;
    for (let p = 0; p < pieces; p++) {
      const a = pieces === 1 ? ta : p === 0 ? ta : split;
      const b = pieces === 1 ? tb : p === 0 ? split : tb;
      const tm = (a + b) * 0.5;
      const upper = u0 + du * tm >= v0 + dv * tm;
      const ua = u0 + du * a;
      const va = v0 + dv * a;
      const ub = u0 + du * b;
      const vb = v0 + dv * b;
      const ha = upper ? h00 + ua * (h10 - h00) + va * (h11 - h10) : h00 + va * (h01 - h00) + ua * (h11 - h01);
      const hb = upper ? h00 + ub * (h10 - h00) + vb * (h11 - h10) : h00 + vb * (h01 - h00) + ub * (h11 - h01);
      const fa = oy + dy * a - ha;
      const fb = oy + dy * b - hb;
      if (fa < 0) return a; // the ray is already under the surface here
      if (fb < 0) return a + (b - a) * (fa / (fa - fb));
    }
    return -1;
  }
}

/**
 * Where a line crosses the whole numbers of one coordinate that runs from `a0` to
 * `a0 + da` along it, as shares of the line strictly inside it, added to `out`.
 */
function addCuts(out: number[], a0: number, da: number): void {
  if (da > 0) {
    for (let k = Math.floor(a0) + 1; k < a0 + da; k++) {
      const t = (k - a0) / da;
      if (t > 0 && t < 1) out.push(t);
    }
  } else if (da < 0) {
    for (let k = Math.ceil(a0) - 1; k > a0 + da; k--) {
      const t = (k - a0) / da;
      if (t > 0 && t < 1) out.push(t);
    }
  }
}

export interface TerrainSample {
  height: number;
  gx: number;
  gz: number;
  slopeTan: number;
  surface: Surface;
}

export function makeTerrainSample(): TerrainSample {
  return { height: 0, gx: 0, gz: 0, slopeTan: 0, surface: Surface.Grass };
}
