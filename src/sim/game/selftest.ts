import { defaultTuning } from '../../config/tuning';
import { generateWorld, worldFingerprint } from '../generation';
import { datan, datan2, dcos, dexp, dlog, dpow, dsin, dtanDeg } from '../kernel/core/detmath';
import { Hasher } from '../kernel/core/hash';
import { knownAnswerProblems } from '../kernel/core/known';
import { missionSpec } from '../kernel/mission';
import type { World } from '../kernel/world/world';
import { GOLDEN } from './golden';
import { PINNED_RUNS, runFingerprint } from './runs';

export { GOLDEN, worldFingerprint };

/**
 * A determinism self-test that runs anywhere the simulation runs: Node, Bun, and inside
 * each browser's own JavaScript engine. It checks the exact bits of the deterministic
 * math, of a generated valley, and of every pinned run (runs.ts) against the golden
 * values (golden.ts). A recording made on one machine replays on another only if all of
 * these agree.
 */

export interface SelfTestResult {
  name: string;
  got: string;
  expected: string;
  ok: boolean;
  ms: number;
}

/** Bits of the deterministic trigonometry over a fixed spread of inputs. */
export function detmathFingerprint(): string {
  const h = new Hasher();
  for (let i = 0; i < 4000; i++) {
    // Spans several turns either side of zero, with irrational steps so no input repeats.
    const x = (i - 2000) * 0.0071234567;
    const y = (i % 97) * 0.731 - 35;
    h.f64(dsin(x)).f64(dcos(x)).f64(datan(x * 3.1)).f64(datan2(y, x)).f64(dtanDeg((i % 179) - 89.5));
    h.f64(dexp(x * 50)).f64(dlog(Math.abs(x) * 1e3 + 1e-9)).f64(dpow(Math.abs(y) + 0.5, x));
  }
  return h.digest();
}

/** Runs every check. `now` is a clock in milliseconds, used only to report timings. */
export function runSelfTest(now: () => number = () => 0): SelfTestResult[] {
  const results: SelfTestResult[] = [];
  const check = (name: string, expected: string, run: () => string): void => {
    const t0 = now();
    const got = run();
    results.push({ name, got, expected, ok: got === expected, ms: now() - t0 });
  };
  check('known answers', 'all right', () => knownAnswerProblems()[0] ?? 'all right');
  check('deterministic math', GOLDEN.detmath, detmathFingerprint);
  let tal: World | null = null;
  check('valley TAL-4471', GOLDEN.world, () => worldFingerprint((tal = generateWorld(missionSpec('TAL-4471'), defaultTuning))));
  const golden: Readonly<Record<string, { behaviour: string; state: string }>> = { ...GOLDEN.play, ...GOLDEN.scenes };
  for (const run of PINNED_RUNS) {
    const t0 = now();
    const got = runFingerprint(run, run.name.startsWith('TAL-4471 ') && tal ? tal : undefined);
    const ms = now() - t0;
    const g = golden[run.name]!;
    results.push({ name: `${run.name} · behaviour`, got: got.behaviour, expected: g.behaviour, ok: got.behaviour === g.behaviour, ms });
    results.push({ name: `${run.name} · state`, got: got.state, expected: g.state, ok: got.state === g.state, ms: 0 });
  }
  return results;
}
