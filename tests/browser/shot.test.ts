import { describe, expect, it } from 'vitest';
import { SoundEngine } from '../../src/audio/engine';
import { defaultTuning as T } from '../../src/config/tuning';
import { PLAYER_ID } from '../../src/sim/game/entities';
import type { ImpactEvent, ReportEvent, ShotEvent, SimEvent } from '../../src/sim/kernel/events';

/**
 * The shot's sounds (lab B, B8), rendered offline and measured: the strike of a 300 m shot
 * comes back to the shooter after the flight and the way back, about 1.28 s; a listener
 * beside the path hears the crack from the path, long before the report; the shooter hears
 * no crack of his own; the suppressor cuts the report.
 */

const RATE = 48000;
const AT = 0.5;
const C = 343;
const canSuspend = typeof OfflineAudioContext !== 'undefined' && 'suspend' in OfflineAudioContext.prototype;

/** Renders events played at given seconds after AT (as ticks would bring them), and finds each burst's onset. */
async function render(listener: { x: number; y: number; z: number }, plays: Array<[seconds: number, events: SimEvent[]]>, seconds = 2.6): Promise<{ onsets: number[]; energy: number }> {
  const ctx = new OfflineAudioContext(2, Math.round(RATE * seconds), RATE);
  const engine = new SoundEngine(ctx, { tuning: T, seed: 7, speedOfSound: C });
  engine.setListener({ ...listener, yaw: 0, pitch: 0 });
  for (const [at, events] of plays) {
    // Suspend times are quantized to render quanta of 128 frames.
    void ctx.suspend(Math.round(((AT + at) * RATE) / 128) * (128 / RATE)).then(() => {
      engine.play(events, 1.65);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  // Onsets: where the signal rises out of 30 ms of quiet.
  const onsets: number[] = [];
  let quiet = 0;
  let energy = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]!), Math.abs(R[i]!));
    energy += a * a;
    if (a > 2e-4) {
      if (quiet > 0.03 * RATE || onsets.length === 0) onsets.push(i / RATE - AT);
      quiet = 0;
    } else quiet++;
  }
  return { onsets, energy };
}

const shot = (x: number, y: number, z: number, t = 1 / 30): ShotEvent => ({ type: 'shot', id: 1, tick: 1, t, source: PLAYER_ID, cause: 0, x, y, z, dx: 0, dy: 0, dz: -1, speed: 823, drag: 0.000756, wx: 0, wz: 0 });
const report = (x: number, y: number, z: number, radius: number, suppressed: number, source = PLAYER_ID): ReportEvent => ({
  type: 'report',
  id: 2,
  tick: 1,
  t: 1 / 30,
  source,
  cause: 1,
  x,
  y,
  z,
  surface: 0,
  loudness: radius / T.noise.radiusPerUnit,
  radius,
  suppressed,
});

describe.runIf(canSuspend)('the shot', () => {
  it("comes back to the shooter from 300 m after the flight and the way back: about 1.28 s", async () => {
    const eye = { x: 0, y: 1.65, z: 0 };
    const strike: ImpactEvent = {
      type: 'impact',
      id: 3,
      tick: 13,
      t: 1 / 30 + 0.4081,
      source: PLAYER_ID,
      cause: 1,
      x: 0,
      y: 1.65,
      z: -300,
      surface: 1,
      loudness: T.ballistics.sound.impact.body / T.noise.radiusPerUnit,
      radius: T.ballistics.sound.impact.body,
      what: 'body',
      target: 7,
      part: 'head',
      speed: 657,
      nx: 0,
      ny: 0,
      nz: 1,
    };
    // The report at once; the strike in the tick it happens, 0.41 s on.
    const r = await render(eye, [
      [0, [shot(0, 1.65, 0), report(0, 1.65, 0, T.ballistics.sound.report, 0)]],
      [0.4081, [strike]],
    ]);
    expect(r.onsets.length).toBeGreaterThanOrEqual(2);
    const back = r.onsets[r.onsets.length - 1]! - r.onsets[0]!;
    expect(back).toBeGreaterThan(1.24);
    expect(back).toBeLessThan(1.33);
  });

  it('cracks beside the path long before the report arrives, and never at the shooter', async () => {
    // A listener 10 m off the path, 300 m downrange.
    const beside = await render({ x: 10, y: 1.65, z: -300 }, [[0, [shot(0, 1.65, 0), report(0, 1.65, 0, T.ballistics.sound.report, 0, PLAYER_ID + 1)]]]);
    expect(beside.onsets.length).toBeGreaterThanOrEqual(2);
    // The crack: the bullet near 0.40 s, then about 11.5 m of air. The report: 300 m of air.
    expect(beside.onsets[0]!).toBeGreaterThan(0.38);
    expect(beside.onsets[0]!).toBeLessThan(0.48);
    expect(beside.onsets[1]!).toBeGreaterThan(0.8);
    // The shooter: only his own report.
    const shooter = await render({ x: 0, y: 1.65, z: 0 }, [[0, [shot(0, 1.65, 0)]]]);
    expect(shooter.onsets).toHaveLength(0);
  });

  it('is cut sharply by the suppressor', async () => {
    const at50 = (radius: number, suppressed: number) => render({ x: 0, y: 1.65, z: 0 }, [[0, [report(0, 1.65, -50, radius, suppressed, PLAYER_ID + 1)]]]);
    const open = await at50(T.ballistics.sound.report, 0);
    const quiet = await at50(T.ballistics.sound.suppressedReport, 1);
    expect(10 * Math.log10(open.energy / quiet.energy)).toBeGreaterThan(12);
  });
});
