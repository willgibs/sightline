import { defaultTuning } from '../config/tuning';
import { WanderBot } from './bots/wander';
import { datan, datan2, dcos, dexp, dlog, dpow, dsin, dtanDeg } from './core/detmath';
import { Hasher } from './core/hash';
import { generateWorld, type World } from './gen/world';
import { neutralInput } from './input';
import { Simulation } from './sim';
import { missionSpec } from './mission';

/**
 * A determinism self-test that runs anywhere the simulation runs: Node, Bun, and inside
 * each browser's own JavaScript engine. It checks the exact bits of the deterministic
 * math, of a generated valley, and of two minutes of bot play against golden values.
 * A recording made on one machine replays on another only if all of these agree.
 *
 * The golden values are the simulation's behavioural fingerprint. If a change alters
 * them on purpose, update them here and add a line to docs/decisions.md; if it alters
 * them by accident, the change has a bug.
 */

export const GOLDEN = {
  /** Bits of every deterministic math function over 4,000 inputs each. */
  detmath: '8d55144e8e74968f',
  /** Everything generation decides for TAL-4471 (also pinned in tests/world.test.ts). */
  world: '2ea333d491d7568c',
  /** State hash after 60 s of bot play on TAL-4471, and on MUD-9031. */
  playTAL: 'd3551b835fbdb532',
  playMUD: '9c4b1f6ada6b5647',
} as const;

export interface SelfTestResult {
  name: string;
  got: string;
  expected: string;
  ok: boolean;
  ms: number;
}

/** A fingerprint of everything generation decides: terrain, surfaces, props, camp, spawn. */
export function worldFingerprint(w: World): string {
  const h = new Hasher();
  h.bytes(new Uint8Array(w.terrain.heights.buffer));
  h.bytes(w.terrain.surfaces);
  for (const t of w.props.trees) h.f64(t.x).f64(t.z).f64(t.canopyH);
  for (const r of w.props.rocks) h.f64(r.x).f64(r.z).f64(r.sy);
  for (const b of w.props.bushes) h.f64(b.x).f64(b.z);
  for (const g of w.camp.guards) h.f64(g.x).f64(g.y).f64(g.z);
  h.f64(w.spawn.x).f64(w.spawn.z).u32(w.colliders.list.length);
  return h.digest();
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

/** The state hash after `seconds` of wander-bot play in a valley. */
export function playFingerprint(world: World, seconds: number): string {
  const sim = new Simulation(world, defaultTuning);
  const bot = new WanderBot(world.seed);
  const raw = neutralInput();
  const ticks = Math.round(seconds * defaultTuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) sim.step(bot.next(sim, raw));
  return sim.hash();
}

/** Runs every check. `now` is a clock in milliseconds, used only to report timings. */
export function runSelfTest(now: () => number = () => 0): SelfTestResult[] {
  const results: SelfTestResult[] = [];
  const check = (name: string, expected: string, run: () => string): void => {
    const t0 = now();
    const got = run();
    results.push({ name, got, expected, ok: got === expected, ms: now() - t0 });
  };
  check('deterministic math', GOLDEN.detmath, detmathFingerprint);
  let tal: World | null = null;
  check('valley TAL-4471', GOLDEN.world, () => worldFingerprint((tal = generateWorld(missionSpec('TAL-4471'), defaultTuning))));
  check('60 s of play on TAL-4471', GOLDEN.playTAL, () => playFingerprint(tal!, 60));
  check('60 s of play on MUD-9031', GOLDEN.playMUD, () => playFingerprint(generateWorld(missionSpec('MUD-9031'), defaultTuning), 60));
  return results;
}
