import type { Rng } from '../core/rng';

/**
 * Seeded 2D gradient noise with fractal helpers. Deterministic in every engine:
 * floor, + - * / and literal gradient constants only.
 */

const R = 0.7071067811865476;
// Eight gradient directions (axes and diagonals) as literal constants.
const GX = [1, -1, 0, 0, R, -R, R, -R];
const GZ = [0, 0, 1, -1, R, R, -R, -R];

export class Noise2D {
  private readonly perm = new Uint8Array(512);

  constructor(rng: Rng) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p.push(i);
    rng.shuffle(p);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  /** Gradient noise in roughly [-1, 1]. */
  noise(x: number, z: number): number {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const X = xi & 255;
    const Z = zi & 255;
    const p = this.perm;
    const aa = p[p[X]! + Z]! & 7;
    const ab = p[p[X]! + Z + 1]! & 7;
    const ba = p[p[X + 1]! + Z]! & 7;
    const bb = p[p[X + 1]! + Z + 1]! & 7;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
    const n00 = GX[aa]! * xf + GZ[aa]! * zf;
    const n10 = GX[ba]! * (xf - 1) + GZ[ba]! * zf;
    const n01 = GX[ab]! * xf + GZ[ab]! * (zf - 1);
    const n11 = GX[bb]! * (xf - 1) + GZ[bb]! * (zf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.4142135623730951;
  }

  /** Fractal sum, normalised to roughly [-1, 1]. */
  fbm(x: number, z: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * f + o * 17.31, z * f - o * 9.73);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero. */
  ridged(x: number, z: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let r = 1 - Math.abs(this.noise(x * f + o * 31.7, z * f + o * 5.9));
      r *= r;
      r *= weight;
      weight = r * 2 > 1 ? 1 : r * 2;
      sum += r * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  }
}
