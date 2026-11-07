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
