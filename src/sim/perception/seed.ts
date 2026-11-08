import type { Exposure } from './sight';
import type { RateLaw } from './sweep';

/**
 * The seed (docs/phase-1-plan.md, A · the seed): the strongest prior art the research
 * found, kept as a rate law of its own so the bench can sweep it on the same grid as
 * Sightline's and show where each stands. Nothing in the game uses it.
 *
 * Blacklist's structure (Walsh, Game AI Pro 2, chapter 28) with the design doc's table:
 * - nested zones, each with a hard range: the core cone and the periphery both to 150 m,
 *   a marksman's far zone to 400 m (the periphery's 0.3 is a rate, as the table reads);
 * - time linear in distance inside a zone, from `fill.near` to `fill.edge`;
 * - every factor of the table as one product of rates: zone, stance, movement, light, the
 *   share in view, and 1.5 against the sky;
 * - no caps, no ramps, no cap on how fast a guard can go from the first cue to 100%.
 */
export const SEED_LAW: RateLaw = (x: Exposure, far, sharp, tuning) => {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  x.zone = 'none';
  x.cone = 0;
  x.range = 0;
  x.edge = 0;
  x.seconds = 0;
  x.rate = 0;
  x.capped = false;
  if (x.clear < 1 || x.cover <= 0) return x;
  let zone: Exposure['zone'] = 'none';
  let factor = 0;
  let range = 0;
  if (far && x.angleDeg <= S.far.halfDeg) {
    zone = 'far';
    factor = 1;
    range = S.far.range;
  } else if (x.angleDeg <= S.core.halfDeg) {
    zone = 'core';
    factor = 1;
    range = S.core.range;
  } else if (x.angleDeg <= S.peripheral.halfDeg) {
    zone = 'peripheral';
    factor = 0.3;
    range = S.core.range;
  }
  const d = x.distance;
  if (factor === 0 || d > range) return x;
  // The sky's share of what's in view.
  const P = S.parts;
  const w = [P.head, P.chest, P.feet];
  let sky = 0;
  for (let k = 0; k < 3; k++) {
    const r = x.rays[k]!;
    if (r.clear) sky += w[k]! * r.through * r.sky;
  }
  const skyline = 1 + (V.skyline - 1) * (sky / x.cover);
  const seconds = S.fill.near + ((S.fill.edge - S.fill.near) * d) / range;
  x.zone = zone;
  x.cone = factor;
  x.range = range;
  x.edge = 1;
  x.seconds = seconds;
  x.rate = (factor * x.stance * x.light * x.movement * x.cover * skyline * sharp) / seconds;
  return x;
};
