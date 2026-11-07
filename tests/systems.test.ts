import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { Rng } from '../src/sim/core/rng';
import type { SimEvent } from '../src/sim/events';
import { neutralInput } from '../src/sim/input';
import { createBody, type BodySpec } from '../src/sim/motor/body';
import { stepMotor, type MotorContext, type MoveIntent } from '../src/sim/motor/motor';
import { emptySchedule, popDue, scheduleAt, ticksAfter, type Scheduled } from '../src/sim/schedule';
import { Simulation } from '../src/sim/sim';
import { assertPlain } from '../src/sim/state';
import { SYSTEMS, planSystems, scheduleSystem, type ScheduleHandler, type System } from '../src/sim/systems';
import { Blocks } from '../src/sim/world/colliders';
import { Surface } from '../src/sim/world/surfaces';
import { testWorld, tuningCopy } from './fixtures';

const noop = (): void => {};

describe('the system list', () => {
  it('runs in phase order, with unique names and rates that divide the tick rate', () => {
    expect(() => planSystems(SYSTEMS, 30)).not.toThrow();
    const a: System = { name: 'a', phase: 'motor', run: noop };
    const b: System = { name: 'b', phase: 'intent', run: noop };
    expect(() => planSystems([a, b], 30)).toThrow(/after a later phase/);
    expect(() => planSystems([a, { ...a }], 30)).toThrow(/Two systems/);
    expect(() => planSystems([{ name: 'x', phase: 'nowhere' as never, run: noop }], 30)).toThrow(/unknown phase/);
    expect(() => planSystems([{ name: 'slow', phase: 'awareness', hz: 7, run: noop }], 30)).toThrow(/doesn't divide/);
    expect(planSystems([{ name: 'slow', phase: 'awareness', hz: 10, run: noop }], 30)).toEqual([3]);
  });

  it('runs a slower system on a fixed rhythm, with the time since its last run', () => {
    const runs: Array<{ tick: number; dt: number }> = [];
    const slow: System = { name: 'slow', phase: 'awareness', hz: 10, run: (ctx, dt) => runs.push({ tick: ctx.tick, dt }) };
    const sim = new Simulation(testWorld(), tuningCopy(), [...SYSTEMS, slow]);
    for (let i = 0; i < 9; i++) sim.step(neutralInput());
    expect(runs.map((r) => r.tick)).toEqual([3, 6, 9]);
    for (const r of runs) expect(r.dt).toBeCloseTo(0.1, 12);
  });

  it('reports every system to a profiler, in order, every tick', () => {
    const seen: string[] = [];
    const sim = new Simulation(testWorld(), tuningCopy());
    sim.profiler = { begin: (s) => seen.push(`+${s.name}`), end: (s) => seen.push(`-${s.name}`) };
    sim.step(neutralInput());
    expect(seen).toEqual(SYSTEMS.flatMap((s) => [`+${s.name}`, `-${s.name}`]));
  });
});

describe('the schedule', () => {
  it('falls due in tick order, and in scheduling order within a tick', () => {
    const s = emptySchedule();
    const rng = new Rng('SCHED-0001', 'test');
    for (let k = 0; k < 400; k++) scheduleAt(s, 0, 1 + Math.floor(rng.next() * 50), 'k', k);
    const out: Scheduled[] = [];
    for (let tick = 1; tick <= 50; tick++) {
      for (let e = popDue(s, tick); e; e = popDue(s, tick)) {
        expect(e.tick).toBe(tick);
        out.push(e);
      }
    }
    expect(out).toHaveLength(400);
    for (let k = 1; k < out.length; k++) {
      const a = out[k - 1]!;
      const b = out[k]!;
      expect(a.tick < b.tick || (a.tick === b.tick && a.seq < b.seq)).toBe(true);
    }
    expect(s.queue).toHaveLength(0);
  });

  it('never schedules into the current tick or the past', () => {
    const s = emptySchedule();
    expect(() => scheduleAt(s, 10, 10, 'now')).toThrow();
    expect(() => scheduleAt(s, 10, 9, 'past')).toThrow();
    expect(() => scheduleAt(s, 10, 11.5, 'between')).toThrow();
    expect(ticksAfter(0, 1 / 30)).toBe(1);
    expect(ticksAfter(1, 1 / 30)).toBe(30);
  });

  /** A simulation where 'ping' entries emit a stance event (any event will do) and reschedule. */
  function pingSim(): { sim: Simulation; pings: number[] } {
    const pings: number[] = [];
    const ping: ScheduleHandler = (ctx, e) => {
      pings.push(ctx.tick);
      if (e.a > 1) ctx.schedule(0.5, 'ping', e.a - 1);
    };
    const kick: System = {
      name: 'kick',
      phase: 'intent',
      run: (ctx) => {
        if (ctx.tick === 1) ctx.schedule(0.2, 'ping', 4);
      },
    };
    const systems = [scheduleSystem({ ping }), kick, ...SYSTEMS.slice(1)];
    return { sim: new Simulation(testWorld(), tuningCopy(), systems), pings };
  }

  it('runs effects on their tick, before anything moves', () => {
    const { sim, pings } = pingSim();
    for (let i = 0; i < 80; i++) sim.step(neutralInput());
    // Scheduled at tick 1 for 0.2 s (6 ticks) later, then every 0.5 s (15 ticks), four in all.
    expect(pings).toEqual([7, 22, 37, 52]);
  });

  it('is part of the state: hashed, saved and restored', () => {
    const { sim, pings } = pingSim();
    for (let i = 0; i < 10; i++) sim.step(neutralInput());
    expect(sim.state.schedule.queue).toHaveLength(1);
    assertPlain(sim.state);
    const saved = sim.saveState();
    const hash = sim.hash();
    sim.state.schedule.queue[0]!.a++;
    expect(sim.hash()).not.toBe(hash);
    sim.restore(saved);
    expect(sim.hash()).toBe(hash);
    for (let i = 0; i < 70; i++) sim.step(neutralInput());
    expect(pings).toEqual([7, 22, 37, 52]);
  });

  it('refuses an entry nothing handles', () => {
    const kick: System = { name: 'kick', phase: 'intent', run: (ctx) => ctx.tick === 1 && ctx.schedule(0.1, 'nobody') };
    const sim = new Simulation(testWorld(), tuningCopy(), [SYSTEMS[0]!, kick, ...SYSTEMS.slice(1)]);
    expect(() => {
      for (let i = 0; i < 10; i++) sim.step(neutralInput());
    }).toThrow(/No handler/);
  });
});

describe('the shared motor', () => {
  // The motor moves any body by its own spec, not just the player's.
  const wall = { kind: 'box' as const, x: 10, z: 0, y0: -1, y1: 2, hx: 0.5, hz: 20, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
  const ledge = { kind: 'box' as const, x: -10, z: 0, y0: -1, y1: 3, hx: 3, hz: 3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };

  function walk(spec: BodySpec, x: number, wishX: number, seconds: number): { x: number; y: number; events: SimEvent[] } {
    const world = testWorld({ colliders: [wall, ledge] });
    const b = createBody(world, spec, x, 0, 1, 0);
    const events: SimEvent[] = [];
    const ctx: MotorContext = {
      world,
      tuning: defaultTuning,
      dt: 1 / 30,
      tick: 0,
      source: 42,
      others: [],
      emit: (e) => events.push({ ...e, id: events.length + 1, tick: ctx.tick, t: ctx.tick / 30, cause: 0 } as SimEvent),
    };
    const intent: MoveIntent = { tick: 0, wishX, wishZ: 0, gait: 'walk', yaw: b.yaw, pitch: 0 };
    for (let t = 1; t <= seconds * 30; t++) {
      ctx.tick = intent.tick = t;
      stepMotor(b, intent, spec, ctx);
    }
    return { x: b.x, y: b.y, events };
  }

  it('stops each body at a wall by its own radius', () => {
    const player = defaultTuning.player;
    const wide = { ...player, radius: 0.6 };
    expect(walk(player, 0, 3, 5).x).toBeCloseTo(10 - 0.5 - 0.3, 2);
    expect(walk(wide, 0, 3, 5).x).toBeCloseTo(10 - 0.5 - 0.6, 2);
  });

  it('lets any body fall and land, making the sound itself', () => {
    const r = walk(defaultTuning.player, -10, 3, 3);
    expect(r.y).toBeCloseTo(0, 6);
    const land = r.events.find((e) => e.type === 'land');
    expect(land && land.type === 'land' && land.source).toBe(42);
    expect(r.events.filter((e) => e.type === 'footstep').every((e) => e.type === 'footstep' && e.source === 42)).toBe(true);
  });
});
