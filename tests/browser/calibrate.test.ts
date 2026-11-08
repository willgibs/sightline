import { describe, expect, it } from 'vitest';
import { LOUDNESS_TRIM_DB, footstep, gaitBand, makeNoiseBuffers, makeRand, type GaitBand } from '../../src/audio/voices';
import { SURFACE_NAMES } from '../../src/sim/kernel/world/surfaces';

/**
 * Footstep voice calibration (not a test): measures how loud every surface and gait comes
 * out at the same amplitude, and prints the loudness trims that make them all equal, ready
 * to paste over LOUDNESS_TRIM_DB in src/audio/voices.ts. Run it after changing a voice:
 *
 *   VITE_CALIBRATE=1 npm run test:browser -- calibrate
 *
 * It measures in the browser it runs in (Chromium by default). The browser tests then hold
 * every engine to the result within 2.5 dB (audio.test.ts, footstep voices).
 */

const RATE = 48000;
const RENDERS = 8;
const GAITS: ReadonlyArray<[GaitBand, number]> = [
  ['crawl', 0.3],
  ['crouch', 0.6],
  ['walk', 1],
  ['sprint', 1.5],
];

/** K-weighted momentary loudness, dB: the loudest 100 ms (the measure audio.test.ts uses). */
function loudness(buf: AudioBuffer): number {
  const x = buf.getChannelData(0);
  const a = Math.exp((-2 * Math.PI * 1700) / RATE);
  const g = Math.pow(10, 4 / 20) - 1;
  const window = Math.round(RATE * 0.1);
  const k = new Float32Array(x.length);
  let lp = 0;
  let sum = 0;
  let best = 0;
  for (let i = 0; i < x.length; i++) {
    lp = a * lp + (1 - a) * x[i]!;
    k[i] = x[i]! + g * (x[i]! - lp);
    sum += k[i]! * k[i]!;
    if (i >= window) sum -= k[i - window]! * k[i - window]!;
    if (sum > best) best = sum;
  }
  return 10 * Math.log10(Math.max(best / window, 1e-30));
}

describe.runIf(import.meta.env.VITE_CALIBRATE)('footstep voice calibration', () => {
  it('prints the trims that make every voice equally loud', async () => {
    const raw: Record<string, Record<string, number>> = {};
    let total = 0;
    let cells = 0;
    for (const surface of SURFACE_NAMES) {
      raw[surface] = {};
      for (const [band, gait] of GAITS) {
        expect(gaitBand(gait)).toBe(band);
        let power = 0;
        for (let k = 0; k < RENDERS; k++) {
          const ctx = new OfflineAudioContext(1, Math.round(RATE * 0.8), RATE);
          // Untrimmed, so the measurement doesn't depend on the trims being replaced.
          footstep(ctx, ctx.destination, makeNoiseBuffers(ctx, makeRand(1)), makeRand(100 + k), 0.05, surface, gait, 1, false);
          power += Math.pow(10, loudness(await ctx.startRendering()) / 10);
        }
        const db = 10 * Math.log10(power / RENDERS);
        raw[surface]![band] = db;
        total += db + LOUDNESS_TRIM_DB[surface][band];
        cells++;
      }
    }
    // Keep today's overall level: the target is the trimmed voices' mean.
    const target = total / cells;
    const lines = SURFACE_NAMES.map(
      (s) => `  ${s}: { ${GAITS.map(([b]) => `${b}: ${(Math.round((target - raw[s]![b]!) * 10) / 10).toFixed(1)}`).join(', ')} },`,
    );
    console.log(`Calibrated in ${navigator.userAgent}\nexport const LOUDNESS_TRIM_DB = {\n${lines.join('\n')}\n};`);
  });
});
