import { defaultTuning } from '../config/tuning';
import { ChaosBot } from './bots/chaos';
import { WanderBot } from './bots/wander';
import { datan, datan2, dcos, dexp, dlog, dpow, dsin, dtanDeg } from './core/detmath';
import { Hasher } from './core/hash';
import { generateWorld, worldFingerprint, type World } from './gen/world';

export { worldFingerprint };
import { EVENTS, type FieldCodec, type SimEvent } from './events';
import { neutralInput } from './input';
import { Simulation } from './sim';
import { missionSpec } from './mission';
import { startScene, type Scene } from './scene';
import { SCENES } from './scenes';

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
  world: '589085a8b5ce974d',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: '0f49c7a0561251a9', state: 'e869f4a79a68f34b' },
    'MUD-9031 wander': { behaviour: '8af56c8be1ff3f42', state: 'e8a332c9746cce3c' },
    'TAL-4471 chaos': { behaviour: '100a20f7d94cbf02', state: '29887fc4e9583be7' },
  },
  /** Scenes run by their own drivers: the movement course covers stairs, drops, ramps, ceilings, crawling and surfaces. */
  scenes: {
    'movement-course': { behaviour: '07e02ecbd76f16bd', state: '9cf502b40c31b615' },
  },
} as const;

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

/** Both fingerprints of a scene run by its own driver, for its own length. */
export function sceneFingerprint(scene: Scene): { behaviour: string; state: string } {
  const sim = startScene(scene, defaultTuning);
  const driver = scene.driver?.();
  const raw = neutralInput(sim.player.yaw);
  const h = new Hasher();
  const ticks = Math.round((scene.seconds ?? 10) * defaultTuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) behaviourInto(h, sim, sim.step(driver ? driver.next(sim, raw) : raw));
  return { behaviour: h.digest(), state: sim.hash() };
}

const order: number[] = [];

/** One tick of observable behaviour: every body's pose, then every entity's events in order. */
function behaviourInto(h: Hasher, sim: Simulation, events: readonly SimEvent[]): void {
  const p = sim.player;
  h.u32(sim.tick);
  h.f64(p.x).f64(p.y).f64(p.z).f64(p.yaw).f64(p.pitch).f64(p.eyeHeight).f64(p.speed).str(p.stance).str(p.gait);
  for (const g of sim.guards) {
    const b = g.body;
    h.u32(g.id).f64(b.x).f64(b.y).f64(b.z).f64(b.yaw).f64(g.guard.headYaw).f64(b.speed).str(b.stance).str(b.gait);
  }
  // Solid things where they are (only when there are any, so runs without them keep their values).
  if (sim.solids.count > 0) {
    h.u32(sim.solids.count);
    for (const c of sim.solids.shapes) {
      h.u32(c.id).f64(c.x).f64(c.z).f64(c.y0).f64(c.y1).u32(c.flags);
      if (c.kind === 'box') h.f64(c.ux).f64(c.uz).f64(c.hx).f64(c.hz);
      else h.f64(c.r);
    }
  }
  // Events grouped by source, keeping each source's own order: which entity acted first
  // within a tick is a detail of how systems are scheduled, not behaviour. Every field
  // the registry stores is covered, so a new event type is covered too.
  order.length = 0;
  for (let k = 0; k < events.length; k++) order.push(k);
  order.sort((a, b) => events[a]!.source - events[b]!.source || a - b);
  h.u32(events.length);
  for (const k of order) {
    const e = events[k]!;
    h.str(e.type).u32(e.id).u32(e.tick).f64(e.t).f64(e.source).u32(e.cause);
    const fields = EVENTS[e.type].fields as Readonly<Record<string, FieldCodec>>;
    const values = e as unknown as Readonly<Record<string, number | string>>;
    for (const name in fields) {
      const v = values[name]!;
      if (typeof v === 'string') h.str(v);
      else h.f64(v);
    }
  }
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
  for (const [name, golden] of Object.entries(GOLDEN.scenes)) {
    const t0 = now();
    const got = sceneFingerprint(SCENES[name]!());
    const ms = now() - t0;
    results.push({ name: `${name} · behaviour`, got: got.behaviour, expected: golden.behaviour, ok: got.behaviour === golden.behaviour, ms });
    results.push({ name: `${name} · state`, got: got.state, expected: golden.state, ok: got.state === golden.state, ms: 0 });
  }
  return results;
}
