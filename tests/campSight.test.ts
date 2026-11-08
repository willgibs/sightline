import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { sightScenario } from '../src/sim/game/scenes/sightScenario';
import { contactRate, secondsToFill, sightRate } from '../src/sim/generation/sight';
import { runScene } from '../src/sim/kernel/scene';

/**
 * Lab D's sight law (D7, generation/sight.ts) held to lab A's detection, through A's scenario
 * runner (game/scenes/sightScenario.ts) at sampled points: a crouched intruder in the open, on
 * the move and still, at distances and angles across every zone and its edges. Generation
 * reads only `tuning.gen`, so a retune of A never changes a valley; this is where the two
 * models are kept together.
 *
 * D must be on the safe side: wherever A sees the intruder, D sees him no later (a sample's
 * grace), so a way in that D certifies is one A's guards don't see. And D must stay close:
 * well inside A's zones, no more than twice as quick, so certified ways in aren't lost to
 * caution. The scenario's intruder circles his spot, 1.5 m about it, so D is asked about the
 * circle's most exposed point.
 */

const SECS = 40;
const L = T.gen.analysis.meterLevels;
const DT = T.gen.analysis.dt;

/** A's time to 100%, seconds, or Infinity if never within the run. */
function seenByA(d: number, off: number, move: 'walk' | 'still'): number {
  const run = runScene(sightScenario(`spot=open&d=${d}&off=${off}&stance=crouch&move=${move}&secs=${SECS}`), T);
  const e = run.recording.readEvents().find((x) => x.type === 'detected');
  return e ? e.t : Infinity;
}

/** D's time to full at the circle's most exposed point. */
function seenByD(d: number, off: number, move: 'walk' | 'still'): number {
  const near = Math.max(0.5, d - 1.5);
  const side = (Math.asin(Math.min(1, 1.5 / d)) * 180) / Math.PI;
  const angle = Math.max(0, off - side);
  const S = T.gen.sight;
  const rate = Math.max(sightRate(near, angle, 1, false, S), contactRate(near, 1, S));
  return secondsToFill(rate, move === 'still', L, DT, S);
}

const POINTS: Array<[number, number, 'walk' | 'still']> = [];
for (const move of ['walk', 'still'] as const) {
  for (const off of [0, 25, 31, 45, 61, 90, 180]) for (const d of [2, 8, 15, 20, 50, 85, 92, 100]) POINTS.push([d, off, move]);
}

describe("lab D's sight law", () => {
  it("is on the safe side of lab A's detection, and close to it, at sampled points", () => {
    const later: string[] = [];
    const cautious: string[] = [];
    let compared = 0;
    for (const [d, off, move] of POINTS) {
      const a = seenByA(d, off, move);
      const dd = seenByD(d, off, move);
      if (a === Infinity) continue;
      compared++;
      if (dd > a + DT) later.push(`${move} ${d} m ${off}°: A ${a.toFixed(2)} s, D ${dd} s`);
      // Where the whole circle lies inside one zone, clear of its edges (where A's ramps slow
      // it): within a factor of two.
      const side = (Math.asin(Math.min(1, 1.5 / d)) * 180) / Math.PI;
      const S = T.gen.sight;
      const flat = (half: number) => half - S.cone.edge / 2;
      const inside =
        (off + side <= flat(S.cone.core) && d + 1.5 <= S.intruder.core * (1 - S.edge.share / 2)) ||
        (off - side >= S.cone.core + S.cone.edge / 2 && off + side <= flat(S.cone.peripheral) && d + 1.5 <= S.intruder.peripheral - S.edge.min / 2);
      if (inside && dd < a / 2) cautious.push(`${move} ${d} m ${off}°: A ${a.toFixed(2)} s, D ${dd} s`);
    }
    expect(compared).toBeGreaterThan(25);
    expect(later).toEqual([]);
    expect(cautious).toEqual([]);
  });

  it('copies the numbers A detects a crouched intruder by', () => {
    const S = T.gen.sight;
    const P = T.perception.sight;
    const crouch = T.visibility.stance.crouch;
    expect(S.intruder.core).toBeCloseTo(P.core.range * crouch, 9);
    expect(S.intruder.peripheral).toBeCloseTo(P.peripheral.range * crouch, 9);
    expect(S.intruder.far).toBeCloseTo(P.far.range * crouch, 9);
    expect([S.cone.core, S.cone.peripheral, S.cone.far, S.cone.edge]).toEqual([P.core.halfDeg, P.peripheral.halfDeg, P.far.halfDeg, P.edgeDeg]);
    expect(S.edge).toEqual({ share: P.edgeShare, min: P.edgeMin, max: P.edgeMax });
    expect(S.fill).toEqual({ near: P.fill.near, edge: P.fill.edge });
    expect(S.contact).toEqual(P.contact);
    expect(S.still).toBe(T.visibility.movement.still);
    // The telegraph's cap, rounded up: D never caps lower than A does.
    expect(S.cap).toBeGreaterThanOrEqual((1 - P.cue) / P.minCueSeconds);
    expect(S.cap - (1 - P.cue) / P.minCueSeconds).toBeLessThan(0.01);
    // The meter falls no faster than A's.
    expect(T.gen.analysis.meterDecay).toBeLessThanOrEqual(P.decay);
  });
});
