import type { Tuning } from '../../config/tuning';
import { emptyExposure, exposureRate, type Exposure } from './sight';

/**
 * The factor-grid sweep (A3, the scenario runner's first table): the sight rate law run
 * over every combination of the design's factors, so its promises are checked everywhere,
 * not at a few points.
 *
 * - **The design's ranges:** how far a standing, walking body in the open is seen; how
 *   far a still, prone body in cover is seen at all; how long a crouched, walking body in
 *   shade takes at 30 m; how far a marksman's far zone reaches.
 * - **Monotone:** a step up in any factor (closer, nearer the gaze, taller, faster,
 *   lighter, more in view, more sky behind, sharper eyes) never fills the meter slower.
 * - **Telegraphed:** outside contact, the least time from the cue to 100%.
 * - **No cliffs:** the largest change of rate between neighbouring metres and degrees.
 *
 * It runs any rate law, so the bench can show the seed's (seed.ts) beside ours.
 */

/** A rate law: from what exposure measures, the rate (and zone) written into `x`. */
export type RateLaw = (x: Exposure, far: boolean, sharp: number, tuning: Tuning) => Exposure;

/** Sightline's rate law (sight.ts), with one ray enough to start. */
export const SIGHT_LAW: RateLaw = (x, far, sharp, tuning) => exposureRate(x, far, sharp, 1, tuning);

export interface SweepReport {
  /** Rates evaluated. */
  points: number;
  /** Neighbouring pairs checked for monotonicity, and how many filled slower with more exposure. */
  pairs: number;
  violations: number;
  /** The first few violations, in words. */
  examples: string[];
  /** The farthest a standing, walking body in the open, lit, fills a core cone (m). */
  standingReach: number;
  /** The farthest a still, prone body in cover (a third in view) fills a guard's zones at all, a marksman's far zone aside (m). */
  proneCoverReach: number;
  /** Seconds to fill, crouched and walking in shade at 30 m, in the core. */
  crouchShade30: number;
  /** The farthest a marksman's far zone fills, for a standing, walking body in the open (m). */
  farReach: number;
  /** The least time from the cue to 100% at steady exposure, outside contact (s). */
  minCueSeconds: number;
  /** The largest change of rate between neighbouring metres of distance, outside contact (1/s). */
  steepestMetre: number;
  /** The largest change of rate between neighbouring degrees off the gaze (1/s). */
  steepestDegree: number;
}

interface Cover {
  name: string;
  /** Clear, and what foliage lets through, per ray: head, chest, feet. */
  clear: readonly [boolean, boolean, boolean];
  through: number;
}

const COVERS: readonly Cover[] = [
  { name: 'head only', clear: [true, false, false], through: 1 },
  { name: 'head and chest', clear: [true, true, false], through: 1 },
  { name: 'all, through a bush', clear: [true, true, true], through: 0.3 },
  { name: 'all', clear: [true, true, true], through: 1 },
];
/** Pairs of covers where the second shows at least as much of every part as the first. */
const COVER_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 3],
  [2, 3],
];

const STANCES = [0.3, 0.6, 1] as const;
const MOVES = [0.4, 0.7, 1, 1.3, 1.6] as const;
const LIGHTS = [0.25, 0.6, 1] as const;
const SKIES = [0, 0.5, 1] as const;

function setRays(x: Exposure, c: Cover, sky: number, tuning: Tuning): void {
  const P = tuning.perception.sight.parts;
  const w = [P.head, P.chest, P.feet];
  x.clear = 0;
  x.cover = 0;
  for (let k = 0; k < 3; k++) {
    const r = x.rays[k]!;
    r.clear = c.clear[k]!;
    r.through = r.clear ? c.through : 0;
    r.sky = r.clear ? sky : 0;
    if (r.clear) {
      x.clear++;
      x.cover += w[k]! * r.through;
    }
  }
}

/** Sweeps a rate law over the factor grid. `fine` takes distance in 0.25 m steps (the bench) rather than 1 m (the tests). */
export function sweepSight(tuning: Tuning, law: RateLaw = SIGHT_LAW, fine = false): SweepReport {
  const S = tuning.perception.sight;
  const x = emptyExposure();
  const r: SweepReport = {
    points: 0,
    pairs: 0,
    violations: 0,
    examples: [],
    standingReach: 0,
    proneCoverReach: 0,
    crouchShade30: 0,
    farReach: 0,
    minCueSeconds: Infinity,
    steepestMetre: 0,
    steepestDegree: 0,
  };
  const rate = (d: number, angle: number, stance: number, move: number, light: number, cover: Cover, sky: number, far: boolean, sharp: number): number => {
    x.distance = d;
    x.angleDeg = angle;
    x.stance = stance;
    x.movement = move;
    x.light = light;
    setRays(x, cover, sky, tuning);
    r.points++;
    law(x, far, sharp, tuning);
    if (x.rate > 0 && x.zone !== 'contact') {
      const cue = (1 - S.cue) / x.rate;
      if (cue < r.minCueSeconds) r.minCueSeconds = cue;
    }
    return x.rate;
  };
  const fail = (what: string): void => {
    r.violations++;
    if (r.examples.length < 5) r.examples.push(what);
  };
  const outside = S.contact.range + S.contact.ramp;
  const step = fine ? 0.25 : 1;
  const maxD = S.far.range * tuning.visibility.skyline + S.edgeMax;

  // Along distance: every factor at a few values, distance finely.
  const angles = [0, 20, 29, 31, 45, 59, 61, 120];
  for (const angle of angles)
    for (const stance of STANCES)
      for (const move of [0.4, 1, 1.6])
        for (const light of [0.6, 1])
          for (const cover of COVERS)
            for (const sky of [0, 1])
              for (const far of [false, true]) {
                let before = rate(0.25, angle, stance, move, light, cover, sky, far, 1);
                for (let d = 0.25 + step; d <= maxD; d += step) {
                  const now = rate(d, angle, stance, move, light, cover, sky, far, 1);
                  r.pairs++;
                  if (now > before + 1e-12) fail(`farther filled faster: ${d} m, ${angle}°, stance ${stance}, move ${move}, light ${light}, ${cover.name}, sky ${sky}${far ? ', far' : ''}`);
                  if (d - step > outside) {
                    const jump = Math.abs(now - before) / step;
                    if (jump > r.steepestMetre) r.steepestMetre = jump;
                  }
                  before = now;
                }
              }

  // Along the angle off the gaze: every distance band, the angle finely.
  for (const d of [1, 5, 10, 20, 24, 26, 40, 50, 80, 120, 140, 150, 155, 200, 300, 390, 405])
    for (const stance of STANCES)
      for (const cover of [COVERS[1]!, COVERS[3]!])
        for (const sky of [0, 1])
          for (const far of [false, true]) {
            let before = rate(d, 0, stance, 1, 1, cover, sky, far, 1);
            for (let a = 0.5; a <= 180; a += 0.5) {
              const now = rate(d, a, stance, 1, 1, cover, sky, far, 1);
              r.pairs++;
              if (now > before + 1e-12) fail(`farther off the gaze filled faster: ${a}°, ${d} m, stance ${stance}, ${cover.name}, sky ${sky}${far ? ', far' : ''}`);
              if (d > outside) {
                const jump = Math.abs(now - before) / 0.5;
                if (jump > r.steepestDegree) r.steepestDegree = jump;
              }
              before = now;
            }
          }

  // Every other factor, a step at a time, over a grid of distances and angles.
  const angles2 = fine ? [0, 15, 29, 30, 31, 45, 59, 60, 61, 90, 180] : [0, 29, 31, 59, 61, 120];
  const moves = fine ? MOVES : ([0.4, 1, 1.6] as const);
  for (let d = 0.5; d <= maxD; d += fine ? 2.5 : 10)
    for (const angle of angles2)
      for (const far of [false, true])
        for (let si = 0; si < STANCES.length; si++)
          for (let mi = 0; mi < moves.length; mi++)
            for (let li = 0; li < LIGHTS.length; li++)
              for (let ci = 0; ci < COVERS.length; ci++)
                for (let ki = 0; ki < SKIES.length; ki++) {
                  const base = rate(d, angle, STANCES[si]!, moves[mi]!, LIGHTS[li]!, COVERS[ci]!, SKIES[ki]!, far, 1);
                  const up = (what: string, v: number): void => {
                    r.pairs++;
                    if (v + 1e-12 < base) fail(`more ${what} filled slower: ${d} m, ${angle}°${far ? ', far' : ''}`);
                  };
                  const m = moves[mi]!;
                  if (si + 1 < STANCES.length) up('stance', rate(d, angle, STANCES[si + 1]!, m, LIGHTS[li]!, COVERS[ci]!, SKIES[ki]!, far, 1));
                  if (mi + 1 < moves.length) up('movement', rate(d, angle, STANCES[si]!, moves[mi + 1]!, LIGHTS[li]!, COVERS[ci]!, SKIES[ki]!, far, 1));
                  if (li + 1 < LIGHTS.length) up('light', rate(d, angle, STANCES[si]!, m, LIGHTS[li + 1]!, COVERS[ci]!, SKIES[ki]!, far, 1));
                  if (ki + 1 < SKIES.length) up('sky', rate(d, angle, STANCES[si]!, m, LIGHTS[li]!, COVERS[ci]!, SKIES[ki + 1]!, far, 1));
                  for (const [a, b] of COVER_STEPS) if (a === ci) up('of the body in view', rate(d, angle, STANCES[si]!, m, LIGHTS[li]!, COVERS[b]!, SKIES[ki]!, far, 1));
                  up('sharpness', rate(d, angle, STANCES[si]!, m, LIGHTS[li]!, COVERS[ci]!, SKIES[ki]!, far, 1.25));
                  if (!far) up('zones (a far zone)', rate(d, angle, STANCES[si]!, m, LIGHTS[li]!, COVERS[ci]!, SKIES[ki]!, true, 1));
                }

  // The design's fixed points.
  const reach = (stance: number, move: number, light: number, cover: Cover, far: boolean): number => {
    let last = 0;
    for (let d = 0.25; d <= maxD; d += 0.25) if (rate(d, 0, stance, move, light, cover, 0, far, 1) > 0) last = d;
    return last;
  };
  r.standingReach = reach(1, 1, 1, COVERS[3]!, false);
  r.proneCoverReach = reach(0.3, 0.4, 1, { name: 'a third in view', clear: [true, true, true], through: 1 / 3 }, false);
  const crouched = rate(30, 0, 0.6, 1, 0.6, COVERS[3]!, 0, false, 1);
  r.crouchShade30 = crouched > 0 ? 1 / crouched : Infinity;
  r.farReach = reach(1, 1, 1, COVERS[3]!, true);
  return r;
}
