import { describe, expect, it } from 'vitest';
import { bruteForce, infiltrate, rimCells, spaceTimeSearch, type Exposure, type Infiltration, type Meter, type Search, type Space } from '../src/sim/generation/infiltrate';
import { MOVE_BITS, MOVE_DIRS } from '../src/sim/generation/raster';
import { Rng } from '../src/sim/kernel/core/rng';

/**
 * Infiltration (D7, generation/infiltrate.ts): safe-interval search with an exposure meter,
 * held to the brute-force answer (every cell at every time) on small camps, as the plan
 * asks, and to the plain space-time search it replaces.
 */

/** A small random camp: walls, and guards' gaze as bands of exposure that sweep across it. */
function camp(seed: string): { S: Space; E: Exposure; goal: (c: number, t: number) => boolean; goalCells: number[]; from?: Search['from'] } {
  const r = new Rng(seed);
  const na = r.int(6, 14);
  const nb = r.int(5, 12);
  const n = na * nb;
  const walk = new Uint8Array(n);
  for (let c = 0; c < n; c++) walk[c] = r.chance(0.82) ? 1 : 0;
  const moves = new Uint8Array(n);
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < na; i++) {
      const c = j * na + i;
      if (!walk[c]) continue;
      for (let d = 0; d < 4; d++) {
        const [di, dj] = MOVE_DIRS[d]!;
        const ni = i + di;
        const nj = j + dj;
        if (ni >= 0 && nj >= 0 && ni < na && nj < nb && walk[nj * na + ni]) moves[c] = moves[c]! | MOVE_BITS[d]!;
      }
    }
  }
  const samples = r.int(8, 30);
  const rate = new Uint8Array(samples * n);
  // A few watchers whose gaze sweeps a band of columns or rows round the cycle.
  const watchers = r.int(1, 4);
  for (let w = 0; w < watchers; w++) {
    const byRow = r.chance(0.5);
    const strength = r.int(1, 18);
    const phase = r.int(0, samples - 1);
    const width = r.int(1, 3);
    for (let k = 0; k < samples; k++) {
      const at = (k + phase) % (byRow ? nb : na);
      for (let c = 0; c < n; c++) {
        const i = c % na;
        const j = (c - i) / na;
        const pos = byRow ? j : i;
        if (Math.abs(pos - at) < width) rate[c * samples + k] = Math.min(255, rate[c * samples + k]! + strength);
      }
    }
  }
  const walkable = [...walk.keys()].filter((c) => walk[c]);
  const goalCell = r.pick(walkable);
  const moving = r.chance(0.3);
  const other = r.pick(walkable);
  const goal = moving ? (c: number, t: number) => c === (t % samples < samples / 2 ? goalCell : other) : (c: number) => c === goalCell;
  const goalCells = moving ? [goalCell, other] : [goalCell];
  const from = r.chance(0.3) ? { cell: r.pick(walkable), time: r.int(0, samples - 1), meter: r.int(0, 6) } : undefined;
  const extra = new Map<number, number>();
  if (r.chance(0.3)) for (let q = 0; q < 10; q++) extra.set(r.int(0, samples * n - 1), r.int(1, 8));
  return { S: { na, nb, walk, moves }, E: { samples, cells: n, rate, extra }, goal, goalCells, from };
}

/** Replays a path: legal moves, a meter that never fills, a goal at the end. */
function replay(S: Space, E: Exposure, M: Meter, Q: Search, r: Infiltration): string | null {
  if (!r.found) return null;
  let m = Q.from ? Q.from.meter : 0;
  for (let q = 0; q < r.cells.length; q++) {
    const c = r.cells[q]!;
    const t = r.start + q;
    if (q === 0) {
      if (Q.from) {
        if (c !== Q.from.cell || t !== Q.from.time) return 'starts elsewhere';
        continue;
      }
      if (!rimCells(S).includes(c)) return 'enters away from the rim';
    } else {
      const p = r.cells[q - 1]!;
      if (p !== c) {
        const i = p % S.na;
        const d = MOVE_DIRS.findIndex(([di, dj]) => (Math.floor(p / S.na) + dj) * S.na + (i + di) === c);
        if (d < 0 || (S.moves[p]! & MOVE_BITS[d]!) === 0) return `an illegal move at ${t}`;
      }
    }
    const k = c * E.samples + (t % E.samples);
    const rate = E.rate[k]! + (E.extra?.get(k) ?? 0);
    const stayed = q > 0 && r.cells[q - 1] === c;
    m = rate === 0 ? Math.max(0, m - M.decay) : m + (stayed ? Math.ceil(rate * M.still - 1e-9) : rate);
    if (m >= M.levels) return `detected at ${t}`;
  }
  const end = r.start + r.cells.length - 1;
  if (end !== r.time) return `the path ends at ${end}, not ${r.time}`;
  if (!Q.goal(r.cells[r.cells.length - 1]!, r.time)) return 'it ends off the goal';
  return null;
}

describe('infiltration', () => {
  it('agrees with brute force on 400 small camps: whether a way exists, and how soon', () => {
    const M: Meter = { levels: 16, decay: 1, still: 0.4 };
    let found = 0;
    let sipp = 0;
    let plain = 0;
    for (let s = 0; s < 400; s++) {
      const { S, E, goal, goalCells, from } = camp(`INF-${s}`);
      const Q: Search = { goal, goalCells, horizon: 2 * E.samples + 10, maxExpansions: 1_000_000, ...(from ? { from } : {}) };
      const exact = bruteForce(S, E, M, Q);
      const a = infiltrate(S, E, M, Q);
      const b = spaceTimeSearch(S, E, M, Q);
      expect(a.exhausted || b.exhausted).toBe(false);
      expect({ found: a.found, time: a.time }, `camp ${s}`).toEqual(exact);
      expect({ found: b.found, time: b.time }, `camp ${s}`).toEqual(exact);
      expect(replay(S, E, M, Q, a), `camp ${s}`).toBeNull();
      expect(replay(S, E, M, Q, b), `camp ${s}`).toBeNull();
      if (exact.found) found++;
      sipp += a.expanded;
      plain += b.expanded;
    }
    // Most have a way in. (On camps this small and this busy, safe intervals save little;
    // on real camps, where the way in means waiting for a window, the bench shows the gain.)
    expect(found).toBeGreaterThan(150);
    expect(sipp).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(0);
  });
});
