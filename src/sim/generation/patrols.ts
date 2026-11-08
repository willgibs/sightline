import type { GenTuning } from '../../config/tuning';
import { datan2 } from '../kernel/core/detmath';
import { wrapAngle } from '../kernel/core/math';
import type { Rng } from '../kernel/core/rng';
import { Cell, cellIndex, type GridLayer } from '../kernel/world/grid';
import { GridSearch } from '../kernel/world/search';
import type { Point2 } from './paths';
import type { Leg, Routine } from './routine';

/**
 * Patrols for a generated camp (D6), after Xu, Tremblay and Verbrugge's generated guard
 * behaviour: routes along the camp's free lanes (the roadmap a patrol walks between its
 * stops, found on the spatial grid so it never cuts through a building), and a grammar
 * that turns each stop into something a player can learn: a glance, a scan of a quarter
 * or a half turn, a full turn, a sweep back and forth.
 *
 * Every routine in a camp is timed to one cycle (`cycle`): a patrol's period divides it,
 * a post's hold lasts it, and each head sweep fits a whole number of times into it. The
 * camp then repeats exactly every cycle, so its windows open and close at the same moments
 * every time, which recon can learn and analysis (D7) can certify over one cycle. Routines
 * stay pure functions of time (routine.ts).
 */

/** A stop on a route, and what the guard does there. */
export interface Stop {
  x: number;
  z: number;
  /** The grammar's word for the stop. */
  scan: ScanKind;
  /** The way the stop looks out over, as a yaw (radians), centre of any scan. */
  look: number;
  /** Seconds held still at the stop, besides turning. */
  dwell: number;
  /** This stop's share of any time the routine is stretched by to fit the camp's cycle (default 1). */
  weight?: number;
}

export type ScanKind = 'glance' | 'quarter' | 'half' | 'full' | 'sweep';

/** The yaws a scan turns through, from facing `look`. */
export function scanYaws(kind: ScanKind, look: number): number[] {
  const q = Math.PI / 4;
  switch (kind) {
    case 'glance':
      return [look];
    case 'quarter':
      return [look - q, look + q, look];
    case 'half':
      return [look - 2 * q, look + 2 * q, look];
    case 'full':
      return [look + 2 * q, look + 4 * q, look + 6 * q, look + 8 * q];
    case 'sweep':
      return [look - q, look + q, look - q, look];
  }
}

/** Picks a stop's scan by the grammar's weights. */
export function pickScan(rng: Rng): ScanKind {
  const roll = rng.next();
  return roll < 0.3 ? 'glance' : roll < 0.6 ? 'quarter' : roll < 0.8 ? 'half' : roll < 0.9 ? 'sweep' : 'full';
}

/**
 * The way a body walks from one point to another on the site layer: a grid path, pulled
 * taut to its turning points by a walkable line of sight. Null if there is none within the
 * search budget (rule 18).
 */
export function walkPath(layer: GridLayer, search: GridSearch, from: Point2, to: Point2): Point2[] | null {
  const a = nearestWalkable(layer, from.x, from.z);
  const b = nearestWalkable(layer, to.x, to.z);
  if (a < 0 || b < 0) return null;
  const cells: number[] = [];
  if (!search.path(a, b, { maxExpansions: layer.nx * layer.nz }, cells).found) return null;
  const centre = (c: number): Point2 => ({ x: layer.x0 + ((c % layer.nx) + 0.5) * layer.cell, z: layer.z0 + (Math.floor(c / layer.nx) + 0.5) * layer.cell });
  const pts: Point2[] = [from];
  let anchor = from;
  for (let k = 1; k < cells.length; k++) {
    const next = k + 1 < cells.length ? centre(cells[k + 1]!) : to;
    if (!clearLine(layer, anchor, next)) {
      anchor = centre(cells[k]!);
      pts.push(anchor);
    }
  }
  pts.push(to);
  return pts;
}

/** A body walks the straight line from p to q on walkable cells all the way. */
export function clearLine(layer: GridLayer, p: Point2, q: Point2): boolean {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / (layer.cell * 0.5)));
  for (let s = 0; s <= n; s++) {
    const c = cellIndex(layer, p.x + (dx * s) / n, p.z + (dz * s) / n);
    if (c < 0 || (layer.flags[c]! & Cell.Walkable) === 0) return false;
  }
  return true;
}

/** The walkable cell nearest (x, z), within two metres, or −1. */
export function nearestWalkable(layer: GridLayer, x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  const r = Math.ceil(2 / layer.cell);
  const ci = Math.floor((x - layer.x0) / layer.cell);
  const cj = Math.floor((z - layer.z0) / layer.cell);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= layer.nx || j >= layer.nz) continue;
      const c = j * layer.nx + i;
      if ((layer.flags[c]! & Cell.Walkable) === 0) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

/** How long a route takes at its natural pace: walking, turning and dwelling. */
export function naturalPeriod(legs: readonly Point2[][], stops: readonly Stop[], R: GenTuning['routines']): number {
  return buildLegs(legs, stops, R, 0).period;
}

/**
 * A patrol's routine: walk each leg's path, and at each stop turn through its scan and
 * dwell. Its period is stretched to exactly `period` (at least its natural one) by
 * lengthening its stops' dwells by their weights, and it starts `offset` seconds into its
 * cycle.
 * `legs[k]` runs from stop k to stop k + 1 (the last back to the first).
 */
export function patrolRoutine(legs: readonly Point2[][], stops: readonly Stop[], R: GenTuning['routines'], period: number, offset: number, scan: { scanAmp: number; scanPeriod: number; scanPhase: number }): Routine {
  const natural = buildLegs(legs, stops, R, 0).period;
  const weights = stops.reduce((sum, st) => sum + (st.weight ?? 1), 0);
  const extra = weights > 0 ? Math.max(0, period - natural) / weights : 0;
  const built = buildLegs(legs, stops, R, extra);
  // The sum of the parts lands within a rounding of `period`: the last leg ends exactly on it.
  built.legs[built.legs.length - 1]!.t1 = period;
  return { period, offset, legs: built.legs, turnRate: R.turnRate, ...scan };
}

/** A post: holding one place for the whole cycle, turning through a scan if it has one. */
export function postRoutine(at: Point2, look: number, kind: ScanKind, R: GenTuning['routines'], period: number, scan: { scanAmp: number; scanPeriod: number; scanPhase: number }): Routine {
  const yaws = scanYaws(kind, look);
  const legs: Leg[] = [];
  let t = 0;
  let yaw = yaws[yaws.length - 1]!;
  const share = period / yaws.length;
  for (const y of yaws) {
    const t1 = legs.length === yaws.length - 1 ? period : t + share;
    legs.push({ kind: 'hold', t0: t, t1, x: at.x, z: at.z, yawFrom: wrapAngle(yaw), yawTo: wrapAngle(y) });
    t = t1;
    yaw = y;
  }
  return { period, legs, turnRate: R.turnRate, ...scan };
}

function buildLegs(paths: readonly Point2[][], stops: readonly Stop[], R: GenTuning['routines'], extra: number): { legs: Leg[]; period: number } {
  const legs: Leg[] = [];
  let t = 0;
  let yaw = stops.length > 1 ? heading(stops[0]!, paths[0]![1] ?? stops[1]!) : stops[0]!.look;
  const hold = (x: number, z: number, from: number, to: number, dwell: number) => {
    const turn = Math.abs(wrapAngle(to - from)) / R.turnRate;
    const span = turn + dwell;
    if (span <= 0) return;
    legs.push({ kind: 'hold', t0: t, t1: t + span, x, z, yawFrom: wrapAngle(from), yawTo: wrapAngle(to) });
    t += span;
  };
  for (let k = 0; k < stops.length; k++) {
    const s = stops[k]!;
    // The scan at the stop: each look in turn, the dwell shared among them.
    const yaws = scanYaws(s.scan, s.look);
    const dwell = (s.dwell + extra * (s.weight ?? 1)) / yaws.length;
    for (const y of yaws) {
      hold(s.x, s.z, yaw, y, dwell);
      yaw = y;
    }
    // Then the walk to the next stop, turning at each corner of the path.
    const path = paths[k]!;
    for (let p = 0; p + 1 < path.length; p++) {
      const a = path[p]!;
      const b = path[p + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 1e-6) continue;
      const walkYaw = datan2(-dx, -dz);
      hold(a.x, a.z, yaw, walkYaw, 0);
      legs.push({ kind: 'walk', t0: t, t1: t + length / R.pace, x0: a.x, z0: a.z, x1: b.x, z1: b.z, yaw: walkYaw });
      t += length / R.pace;
      yaw = walkYaw;
    }
  }
  return { legs, period: t };
}

function heading(a: Point2, b: Point2): number {
  return datan2(-(b.x - a.x), -(b.z - a.z));
}
