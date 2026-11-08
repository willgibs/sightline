import type { Tuning } from '../../config/tuning';
import type { BodySpec } from './body';

/**
 * Footfall: how loud a body's steps are and how far apart, for the speed it actually
 * moves at. Interpolated between the design doc's gaits (crawl, crouch, walk, sprint),
 * so noise always matches what the legs are doing, not the gait that was asked for.
 */

type Row = readonly [speed: number, loudness: number, stride: number, order: number];

/** One table per body spec and noise model, built once (tuning is replaced, never mutated). */
const tables = new WeakMap<BodySpec, WeakMap<Tuning['noise'], readonly Row[]>>();

function table(spec: BodySpec, noise: Tuning['noise']): readonly Row[] {
  let bySpec = tables.get(spec);
  if (!bySpec) tables.set(spec, (bySpec = new WeakMap()));
  let rows = bySpec.get(noise);
  if (!rows) {
    const N = noise.movement;
    const list: Row[] = [
      [spec.speed.crawl, N.crawl, spec.stride.crawl, 0],
      [spec.speed.crouch, N.crouch, spec.stride.crouch, 1],
      [spec.speed.walk, N.walk, spec.stride.walk, 2],
      [spec.speed.sprint, N.sprint, spec.stride.sprint, 3],
    ];
    // By speed; two gaits as fast as each other keep the gaits' order.
    list.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
    rows = list;
    bySpec.set(noise, rows);
  }
  return rows;
}

/** Loudness factor and stride length for a body moving at `speed`. */
export function footfall(speed: number, spec: BodySpec, noise: Tuning['noise']): { loudness: number; stride: number } {
  const rows = table(spec, noise);
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (!(speed > first[0])) return { loudness: first[1], stride: first[2] };
  if (speed >= last[0]) return { loudness: last[1], stride: last[2] };
  for (let k = 1; k < rows.length; k++) {
    const b = rows[k]!;
    if (speed <= b[0]) {
      const a = rows[k - 1]!;
      const t = (speed - a[0]) / (b[0] - a[0]);
      return { loudness: a[1] + (b[1] - a[1]) * t, stride: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { loudness: last[1], stride: last[2] };
}
