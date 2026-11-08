import type { GenTuning } from '../../config/tuning';

/**
 * Lab D's sight law (D7): how fast a crouched intruder on the move, lit and in the open, fills
 * a guard's detection meter, as a share of full per second. Generation reads only
 * `tuning.gen`, so this is its own copy of lab A's law (perception/sight.ts, exposureRate) for
 * that one body: three zones, each a half-angle off the gaze and a range, every edge ramped;
 * a fill time linear in distance; the telegraph's cap; and the contact zone, in any
 * direction. A retune of perception never changes a valley; a deliberate one is copied here,
 * and tests/campSight.test.ts holds the two together through A's scenario runner.
 *
 * What it leaves out makes it quicker than A, never slower: light (the intruder is always
 * lit), foliage, the share of the body A's three rays see (D's two halves, head and chest,
 * give at least as much), and per-guard meters (D sums them). One thing would make A
 * quicker, the open sky behind a body; on the camp's pad guards see an intruder against the
 * ground.
 */
export type SightTuning = GenTuning['sight'];

/** A cone's edge: 1 inside, falling to 0 across `edge` degrees centred on the half-angle. */
export function coneRamp(offDeg: number, halfDeg: number, edgeDeg: number): number {
  const v = (halfDeg + edgeDeg / 2 - offDeg) / edgeDeg;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** The width of a range's edge, metres. */
function edgeWidth(range: number, S: SightTuning): number {
  const w = S.edge.share * range;
  return w < S.edge.min ? S.edge.min : w > S.edge.max ? S.edge.max : w;
}

/** A range's edge: 1 inside, falling to 0 across its width, centred on the range. */
export function rangeRamp(d: number, range: number, S: SightTuning): number {
  const w = edgeWidth(range, S);
  const v = (range + w / 2 - d) / w;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** How far a zone of this range sees anything at all. */
export function reachOf(range: number, S: SightTuning): number {
  return range + edgeWidth(range, S) / 2;
}

/** Seconds to fill the meter at distance d inside a range: linear from `fill.near` to `fill.edge`. */
export function fillSeconds(d: number, range: number, S: SightTuning): number {
  const f = d < range ? d / range : 1;
  return S.fill.near + (S.fill.edge - S.fill.near) * f;
}

/**
 * The rate for a moving intruder with `share` of him in view, d metres away and `offDeg` off
 * the guard's gaze; `far` for a marksman's binoculars. The zone that fills fastest sets it,
 * up to the telegraph's cap. Contact is apart (contactRate).
 */
export function sightRate(d: number, offDeg: number, share: number, far: boolean, S: SightTuning): number {
  if (share <= 0) return 0;
  let best = zoneRate(d, offDeg, S.cone.core, S.intruder.core, S);
  const side = zoneRate(d, offDeg, S.cone.peripheral, S.intruder.peripheral, S);
  if (side > best) best = side;
  if (far) {
    const scope = zoneRate(d, offDeg, S.cone.far, S.intruder.far, S);
    if (scope > best) best = scope;
  }
  best *= share;
  return best > S.cap ? S.cap : best;
}

function zoneRate(d: number, offDeg: number, half: number, range: number, S: SightTuning): number {
  const cone = coneRamp(offDeg, half, S.cone.edge);
  if (cone <= 0) return 0;
  const e = rangeRamp(d, range, S);
  if (e <= 0) return 0;
  return (cone * e) / fillSeconds(d, range, S);
}

/** Close enough to touch, in any direction: the rate for a moving intruder with `share` of him in view. */
export function contactRate(d: number, share: number, S: SightTuning): number {
  const C = S.contact;
  const touch = d <= C.range ? 1 : d < C.range + C.ramp ? (C.range + C.ramp - d) / C.ramp : 0;
  return (touch * share) / C.seconds;
}

/**
 * Seconds until the meter fills, as the analysis counts it, for an intruder held at one rate
 * (share of full per second, moving): each sample adds the rate in whole meter levels,
 * rounded up, a still intruder `still` of them, rounded up again.
 */
export function secondsToFill(rate: number, still: boolean, levels: number, dt: number, S: SightTuning): number {
  if (rate <= 0) return Infinity;
  const moving = Math.min(255, Math.ceil(rate * levels * dt - 1e-9));
  const step = still ? Math.ceil(moving * S.still - 1e-9) : moving;
  return Math.ceil(levels / step) * dt;
}
