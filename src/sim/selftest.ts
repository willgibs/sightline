import { defaultTuning } from '../config/tuning';
import { ChaosBot } from './bots/chaos';
import { WanderBot } from './bots/wander';
import { datan, datan2, dcos, dexp, dlog, dpow, dsin, dtanDeg } from './core/detmath';
import { Hasher } from './core/hash';
import { generateWorld, type World } from './gen/world';
import type { SimEvent } from './events';
import { neutralInput } from './input';
import { Simulation } from './sim';
import { missionSpec } from './mission';

/**
 * A determinism self-test that runs anywhere the simulation runs: Node, Bun, and inside
 * each browser's own JavaScript engine. It checks the exact bits of the deterministic
 * math, of a generated valley, and of a minute of play by two bots against golden values.
 * A recording made on one machine replays on another only if all of these agree.
 *
 * Each run of play has two fingerprints:
 *   behaviour  what can be observed, every tick: where every body is and how it stands,
 *              and every event, each entity's in order. Internal bookkeeping doesn't
 *              count, so restructuring that changes nothing observable keeps it.
 *   state      the hash of the whole state tree at the end, which also pins its layout.
 *
 * If a change moves `behaviour`, it changed what the game does: bump SIM_VERSION, update
 * the values and add a line to docs/decisions.md. If it moves only `state`, it changed
 * how state is stored: bump STATE_SCHEMA instead. If either moves by accident, the
 * change has a bug.
 */

export const GOLDEN = {
  /** Bits of every deterministic math function over 4,000 inputs each. */
  detmath: '8d55144e8e74968f',
  /** Everything generation decides for TAL-4471 (also pinned in tests/world.test.ts). */
  world: '2ea333d491d7568c',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: '75b9eeaa336e22c6', state: 'e91ac773a9b739f3' },
    'MUD-9031 wander': { behaviour: '25a6f124f085e264', state: '3edac392fb5b520d' },
    'TAL-4471 chaos': { behaviour: '3362a328634e2343', state: '0e778c2a4dee7d61' },
  },
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

export type BotKind = 'wander' | 'chaos';

/** Both fingerprints of `seconds` of play by a bot in a valley. */
export function playFingerprint(world: World, bot: BotKind, seconds: number): { behaviour: string; state: string } {
  const sim = new Simulation(world, defaultTuning);
  const player = bot === 'wander' ? new WanderBot(world.seed) : new ChaosBot(world.seed);
  const raw = neutralInput();
  const h = new Hasher();
  const ticks = Math.round(seconds * defaultTuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) behaviourInto(h, sim, sim.step(player.next(sim, raw)));
  return { behaviour: h.digest(), state: sim.hash() };
}

const order: number[] = [];

/** One tick of observable behaviour: every body's pose, then every entity's events in order. */
function behaviourInto(h: Hasher, sim: Simulation, events: readonly SimEvent[]): void {
  const p = sim.player;
  h.u32(sim.tick);
  h.f64(p.x).f64(p.y).f64(p.z).f64(p.yaw).f64(p.pitch).f64(p.eyeHeight).f64(p.speed).str(p.stance).str(p.gait);
  const ids = sim.snapshot().guardIds;
  sim.guards.forEach((g, i) => {
    h.u32(ids[i]!).f64(g.x).f64(g.y).f64(g.z).f64(g.yaw).f64(g.headYaw).u32(g.moving ? 1 : 0);
  });
  // Events grouped by source, keeping each source's own order: which entity acted first
  // within a tick is a detail of how systems are scheduled, not behaviour.
  order.length = 0;
  for (let k = 0; k < events.length; k++) order.push(k);
  order.sort((a, b) => sourceOf(events[a]!) - sourceOf(events[b]!) || a - b);
  h.u32(events.length);
  for (const k of order) {
    const e = events[k]!;
    h.str(e.type).u32(e.tick);
    if (e.type === 'stance') {
      h.str(e.from).str(e.to);
    } else {
      h.f64(e.source).f64(e.x).f64(e.y).f64(e.z).u32(e.surface).f64(e.loudness).f64(e.radius);
      if (e.type === 'land') h.f64(e.speed);
    }
  }
}

/** Stance events don't carry a source yet; only the player changes stance. */
function sourceOf(e: SimEvent): number {
  return e.type === 'stance' ? -1 : e.source;
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
  for (const [name, golden] of Object.entries(GOLDEN.play)) {
    const [seed, bot] = name.split(' ') as [string, BotKind];
    const t0 = now();
    const world = seed === 'TAL-4471' && tal ? tal : generateWorld(missionSpec(seed), defaultTuning);
    const got = playFingerprint(world, bot, 60);
    const ms = now() - t0;
    results.push({ name: `${name} · behaviour`, got: got.behaviour, expected: golden.behaviour, ok: got.behaviour === golden.behaviour, ms });
    results.push({ name: `${name} · state`, got: got.state, expected: golden.state, ok: got.state === golden.state, ms: 0 });
  }
  return results;
}
