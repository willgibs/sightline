import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ACTS, choose, type ActName, type GuardMind } from '../src/sim/brain';
import { emptyMind, guardMind } from '../src/sim/game/guards';
import { giveBrains } from '../src/sim/game/brains';
import { PERCEPTION, giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { Hasher } from '../src/sim/kernel/core/hash';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { campWorld } from '../src/sim/game/scenes/campBrain';
import { testGuard, testWorld } from './fixtures';

/**
 * The guard's brain (E3): the machine of awareness states with utility inside each,
 * rank-then-weight choice from his own stream, a reason on every change, and the
 * no-omniscience boundary over the whole brain.
 */

function worldWith(...guards: Parameters<typeof testGuard>[0][]): World {
  return testWorld({ size: 120, spawn: { x: -55, z: 55 }, camp: { structures: [], guards: guards.map((g) => testGuard(g)), fenceHalf: 0 } });
}

const SENTRY = { id: 0, role: 'sentry' as const, x: 0, y: 0, z: 0, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };

/** A noise of a given reach at a place, at a given tick. */
function noiseAt(tick: number, x: number, z: number, radius: number): System {
  return {
    name: 'test-noise',
    phase: 'commands',
    after: ['player-commands', 'rifle'],
    reads: [],
    writes: [],
    emits: ['noise'],
    run(ctx) {
      if (ctx.tick === tick) ctx.emit({ type: 'noise', source: 1, x, y: 0.3, z, surface: Surface.Dirt, loudness: 2, radius });
    },
  };
}

function brainy(world: World, extra: System[] = []): Simulation {
  let systems = SYSTEMS;
  for (const s of [...PERCEPTION, ...extra]) systems = withSystem(systems, s);
  const sim = new Simulation(world, T, systems);
  giveSenses(sim);
  giveBrains(sim);
  return sim;
}

function run(sim: Simulation, seconds: number): SimEvent[] {
  const raw = neutralInput();
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds * 30; i++) out.push(...sim.step(raw).map((e) => ({ ...e })));
  return out;
}

function acts(events: SimEvent[], guard: number): Array<{ from: ActName; to: ActName; why: string; t: number }> {
  return events.filter((e): e is Extract<SimEvent, { type: 'act' }> => e.type === 'act' && e.source === guard).map((e) => ({ from: e.from, to: e.to, why: e.why, t: e.t }));
}

describe('rank, then weight', () => {
  const draws = (...xs: number[]) => {
    let i = 0;
    return () => xs[i++] ?? 0;
  };
  it('takes the highest rank with any weight, ignoring lower ranks', () => {
    const c = choose([{ act: 'a', rank: 1, weight: 0.9 }, { act: 'b', rank: 2, weight: 0.1 }], 0.5, draws(0.99));
    expect(c?.act).toBe('b');
  });

  it('draws among those within the share of the best, by weight, in a fixed order', () => {
    const opts = [
      { act: 'a', rank: 1, weight: 1 },
      { act: 'b', rank: 1, weight: 0.5 },
      { act: 'c', rank: 1, weight: 0.8 },
    ];
    // With share 0.7, b (0.5) drops; a and c compete: the roll picks by cumulative weight.
    expect(choose(opts, 0.7, draws(0.2))!.act).toBe('a');
    expect(choose(opts, 0.7, draws(0.9))!.act).toBe('c');
  });

  it('does not draw when there is no choice, and returns null with nothing to do', () => {
    const noDraw = (): number => {
      throw new Error('drew');
    };
    expect(choose([{ act: 'a', rank: 1, weight: 1 }], 0.7, noDraw)?.act).toBe('a');
    expect(choose([{ act: 'a', rank: 1, weight: 0 }], 0.7, noDraw)).toBeNull();
  });
});

describe('a guard with a brain', () => {
  it('runs a suspicion episode: hears, looks, goes to see, finds nothing, goes back', () => {
    const sim = brainy(worldWith(SENTRY), [noiseAt(30, 8, 0, 40)]);
    const ev = run(sim, 45);
    const a = acts(ev, sim.guards[0]!.id);
    const seq = a.map((x) => x.to);
    expect(seq[0]).toBe('look');
    expect(seq).toContain('investigate');
    expect(seq[seq.length - 1]).toBe('routine');
    expect(seq.indexOf('look')).toBeLessThan(seq.indexOf('investigate'));
    // The reason names what caused it, and every reaction traces back to the noise.
    expect(a[0]!.why).toBe('heard');
    const g = sim.guards[0]!;
    expect(Math.hypot(g.body.x, g.body.z)).toBeLessThan(T.brain.backAt + 0.5);
    const byId = new Map(ev.map((e) => [e.id, e]));
    for (const e of ev) {
      if (e.type !== 'act' || e.to === 'routine' || e.to === 'return') continue;
      let at: SimEvent | undefined = e;
      for (let hops = 0; at && at.type !== 'noise' && hops < 16; hops++) at = byId.get(at.cause);
      expect(at?.type, `act ${e.to} at ${e.t}`).toBe('noise');
    }
  });

  it('never walks off a raised post, and looks from it', () => {
    const tower = { ...SENTRY, role: 'marksman' as const, elevated: true, y: 0 };
    const sim = brainy(worldWith(tower), [noiseAt(30, 8, 0, 40)]);
    run(sim, 20);
    const g = sim.guards[0]!;
    expect(Math.hypot(g.body.x, g.body.z)).toBeLessThan(0.3);
  });

  it('chooses from his own stream: removing another guard changes nothing about his choices', () => {
    const near = { ...SENTRY, id: 0, x: 0, z: 0 };
    const farOther = { ...SENTRY, id: 1, x: -55, z: -55 };
    const one = brainy(worldWith(near), [noiseAt(30, 9, 0, 40)]);
    const two = brainy(worldWith(near, farOther), [noiseAt(30, 9, 0, 40)]);
    const a = acts(run(one, 25), one.guards[0]!.id);
    const b = acts(run(two, 25), two.guards[0]!.id);
    expect(b).toEqual(a);
  });

  it('every act it can take is one the events can record', () => {
    expect([...ACTS]).toEqual(['routine', 'return', 'look', 'investigate', 'search', 'hold', 'report', 'task']);
  });
});

/**
 * No omniscience, over the whole brain (rule 13): whatever a guard's brain decides from,
 * the same mind decides the same, wherever the unsensed player is. The hash covers
 * every field of the mind, the brain's memory and the stream it draws from.
 */
function hashMind(m: GuardMind, rngWords: readonly number[] | undefined): string {
  const h = new Hasher().u32(m.id).f64(m.self.x).f64(m.self.y).f64(m.self.z).f64(m.self.yaw).f64(m.self.pitch).str(m.self.stance).f64(m.self.speed).str(m.self.motor).f64(m.head);
  h.u32(m.tick).f64(m.time).u32(m.percepts.length);
  for (const p of m.percepts) h.str(p.kind).f64(p.x).f64(p.y).f64(p.z).f64(p.radius).f64(p.strength).u32(p.tick).u32(p.expires).u32(p.cause);
  const a = m.awareness;
  h.str(a.state).u32(a.since).u32(a.focus ? 1 : 0).f64(a.fx).f64(a.fy).f64(a.fz).u32(a.cause).str(a.reason);
  const b = m.belief;
  if (b) h.f64(b.x).f64(b.y).f64(b.z).f64(b.radius).u32(b.tick).u32(b.seen ? 1 : 0).u32(b.cause);
  else h.u32(0);
  const br = m.brain!;
  h.str(br.act).u32(br.since).f64(br.x).f64(br.z).u32(br.cause).u32(br.event).u32(br.done ? 1 : 0).u32(br.thinkAt).str(br.state).f64(br.percept);
  h.u32(br.route.points.length);
  for (const p of br.route.points) h.f64(p);
  h.u32(br.route.next).f64(br.route.best).u32(br.route.progressTick).f64(br.route.sideX).f64(br.route.sideZ).f64(br.route.sideUntil).u32(br.route.stalls);
  h.f64(br.goalX).f64(br.goalZ).f64(br.routed).u32(br.routeOk ? 1 : 0).f64(br.linger).u32(br.points).f64(br.angle);
  for (const k of ACTS) h.f64(br.ended[k] ?? -1);
  h.u32(br.told.length);
  for (const t of br.told) h.str(t.kind).f64(t.x).f64(t.z).f64(t.radius).u32(t.tick).u32(t.from).u32(t.cause).str(t.via).u32(t.heard);
  h.f64(br.until).f64(br.toldHeard);
  const t = br.task;
  if (t) h.u32(t.id).str(t.kind).f64(t.x).f64(t.z).u32(t.issued).u32(t.cause);
  else h.u32(0);
  if (rngWords) for (const w of rngWords) h.u32(w);
  return h.digest();
}

type Trace = Array<Map<number, { mind: string; decision: string }>> & { closest?: number };

function probeRun(world: World, place: { x: number; z: number }, extra: System[] = [], seconds = 30, tuning = T): Trace {
  const trace: Trace = [];
  const mind = emptyMind();
  const probe: System = {
    name: 'test-probe',
    phase: 'decide',
    reads: ['guard.body', 'guard.guard'],
    writes: [],
    emits: [],
    after: ['guard-brains', ...extra.map((s) => s.name)],
    run(ctx) {
      const tick = new Map<number, { mind: string; decision: string }>();
      for (const g of ctx.index.of('guard')) {
        const m = guardMind(g, ctx.world, ctx.tuning, ctx.tick + 1, mind, () => 0, { work: undefined, searches: { left: 0 } });
        const o = g.guard.order;
        const d = new Hasher().str(o.kind).u32(o.tick).f64(o.wishX).f64(o.wishZ).str(o.gait).f64(o.yaw).f64(o.pitch).f64(o.headYaw);
        tick.set(g.id, { mind: hashMind(m, ctx.state.rng[`${g.id}.brain`]), decision: d.digest() });
      }
      trace.push(tick);
    },
  };
  let systems = SYSTEMS;
  for (const s of PERCEPTION) systems = withSystem(systems, s);
  for (const s of extra) systems = withSystem(systems, s);
  systems = withSystem(systems, probe);
  const sim = new Simulation(world, tuning, systems);
  placePlayer(sim, place.x, place.z);
  giveSenses(sim);
  giveBrains(sim);
  let closest = Infinity;
  const raw = neutralInput();
  for (let i = 0; i < seconds * 30; i++) {
    sim.step(raw);
    for (const g of sim.guards) closest = Math.min(closest, Math.hypot(g.body.x - sim.player.x, g.body.z - sim.player.z));
  }
  trace.closest = closest;
  return trace;
}

function leaks(a: Trace, b: Trace): string[] {
  const out: string[] = [];
  a.forEach((tick, k) => {
    for (const [id, x] of tick) {
      const y = b[k]!.get(id)!;
      if (x.mind === y.mind && x.decision !== y.decision) out.push(`guard ${id} at tick ${k + 1}`);
    }
  });
  return out;
}

function sameMinds(a: Trace, b: Trace): number {
  let n = 0;
  a.forEach((tick, k) => {
    for (const [id, x] of tick) if (b[k]!.get(id)!.mind === x.mind) n++;
  });
  return n;
}

describe('no omniscience, over the guard brain', () => {
  const world = campWorld(T);
  // The marksman's far zone reaches farther than this lab's corners allow; shortened here
  // so every guard is truly beyond seeing the player at either corner (the rule itself
  // doesn't depend on it: minds that match must decide alike).
  const shortSight = structuredClone(T);
  shortSight.perception.sight.far.range = 300;
  const S = shortSight.perception.sight;
  const reach = S.far.range * shortSight.visibility.skyline + S.edgeMax;
  const far1 = { x: 372, z: 372 };
  const far2 = { x: -372, z: 372 };

  it('the same minds decide the same, wherever the unsensed player is', () => {
    const a = probeRun(world, far1, [], 30, shortSight);
    const b = probeRun(world, far2, [], 30, shortSight);
    expect(a.closest).toBeGreaterThan(reach);
    expect(b.closest).toBeGreaterThan(reach);
    expect(leaks(a, b)).toEqual([]);
    expect(sameMinds(a, b)).toBe(30 * 30 * world.camp.guards.length);
  });

  it('lets only perception bring the player in, and catches a brain that peeks', () => {
    const near = probeRun(world, { x: 40, z: 6 });
    const away = probeRun(world, far1);
    expect(leaks(near, away)).toEqual([]);
    expect(sameMinds(near, away)).toBeLessThan(30 * 30 * world.camp.guards.length);
    const peek: System = {
      name: 'test-peek',
      phase: 'decide',
      after: ['guard-brains'],
      reads: ['player.body', 'guard.body'],
      writes: ['guard.guard.order.headYaw'],
      emits: [],
      run(ctx) {
        const p = ctx.index.of('player')[0]!.body;
        const g = ctx.index.of('guard')[0]!;
        g.guard.order.headYaw = Math.atan2(p.x - g.body.x, p.z - g.body.z);
      },
    };
    const x = probeRun(world, far1, [peek]);
    const y = probeRun(world, far2, [peek]);
    expect(leaks(x, y).length).toBeGreaterThan(0);
  });
});
