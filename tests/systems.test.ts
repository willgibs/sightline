import { Solids } from '../src/sim/kernel/world/solids';
import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { createBody, type BodySpec } from '../src/sim/body/body';
import { stepMotor, type MotorContext, type MoveIntent } from '../src/sim/body/motor';
import { emptySchedule, popDue, scheduleAt, ticksAfter, type Scheduled } from '../src/sim/kernel/schedule';
import { Simulation } from '../src/sim/game/sim';
import { Faction, assertPlain, type SimState, type SolidEntity } from '../src/sim/kernel/state';
import { SYSTEMS } from '../src/sim/game/systems';
import { accessConflicts, overlaps, planSystems, scheduleSystem, withSystem, type ScheduleHandler, type System } from '../src/sim/kernel/systems';
import type { Simulation as KernelSimulation } from '../src/sim/kernel/sim';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { WanderBot } from '../src/sim/game/bots/wander';
import { SCENES } from '../src/sim/game/scenes';
import { generateWorld } from '../src/sim/generation';
import { missionSpec } from '../src/sim/kernel/mission';
import { kernelAloneScene } from '../src/sim/kernel/alone';
import { runScene, type Scene } from '../src/sim/kernel/scene';
import { boardingPoint } from '../src/sim/game/camp';
import { commanderOf } from '../src/sim/game/comms';
import type { GuardEntity } from '../src/sim/game/entities';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld, tuningCopy } from './fixtures';
import { shooterScene } from './live';

const noop = (): void => {};
/** A system's access when it touches nothing. */
const NONE = { reads: [], writes: [], emits: [] } as const;

describe('the system list', () => {
  it('runs in phase order, with unique names and rates that divide the tick rate', () => {
    expect(() => planSystems(SYSTEMS, 30)).not.toThrow();
    const a: System = { name: 'a', phase: 'motor', ...NONE, run: noop };
    const b: System = { name: 'b', phase: 'intent', ...NONE, run: noop };
    expect(() => planSystems([a, b], 30)).toThrow(/after a later phase/);
    expect(() => planSystems([a, { ...a }], 30)).toThrow(/Two systems/);
    expect(() => planSystems([{ name: 'x', phase: 'nowhere' as never, ...NONE, run: noop }], 30)).toThrow(/unknown phase/);
    expect(() => planSystems([{ name: 'slow', phase: 'awareness', hz: 7, ...NONE, run: noop }], 30)).toThrow(/doesn't divide/);
    expect(planSystems([{ name: 'slow', phase: 'awareness', hz: 10, ...NONE, run: noop }], 30)).toEqual([3]);
  });

  it('runs a slower system on a fixed rhythm, with the time since its last run', () => {
    const runs: Array<{ tick: number; dt: number }> = [];
    const slow: System = { name: 'slow', phase: 'awareness', hz: 10, ...NONE, run: (ctx, dt) => runs.push({ tick: ctx.tick, dt }) };
    const sim = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, slow));
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
      reads: [],
      writes: ['schedule'],
      emits: [],
      run: (ctx) => {
        if (ctx.tick === 1) ctx.schedule(0.2, 'ping', 4);
      },
    };
    const systems = withSystem([scheduleSystem({ ping }), ...SYSTEMS.slice(1)], kick);
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
    const kick: System = { name: 'kick', phase: 'intent', reads: [], writes: ['schedule'], emits: [], run: (ctx) => ctx.tick === 1 && ctx.schedule(0.1, 'nobody') };
    const sim = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, kick));
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
    const solids = new Solids(world.colliders);
    const b = createBody(world, solids, spec, x, 0, 1, 0);
    const events: SimEvent[] = [];
    const ctx: MotorContext = {
      world,
      solids,
      tuning: defaultTuning,
      dt: 1 / 30,
      tick: 0,
      source: 42,
      others: [],
      emit: (e) => events.push({ ...e, id: events.length + 1, tick: ctx.tick, t: ctx.tick / 30, cause: 0 } as SimEvent),
    };
    const intent: MoveIntent = { tick: 0, wishX, wishZ: 0, gait: 'walk', yaw: b.yaw, pitch: 0, lean: 0, raised: false, climb: false, climbAxis: 0, load: 1, scrape: false };
    for (let t = 1; t <= seconds * 30; t++) {
      ctx.tick = intent.tick = t;
      stepMotor(b, intent, spec, ctx);
    }
    return { x: b.x, y: b.y, events };
  }

  it('stops each body at a wall by its own radius', () => {
    const player = defaultTuning.bodies.player;
    const wide = { ...player, radius: 0.6 };
    expect(walk(player, 0, 3, 5).x).toBeCloseTo(10 - 0.5 - 0.3, 2);
    expect(walk(wide, 0, 3, 5).x).toBeCloseTo(10 - 0.5 - 0.6, 2);
  });

  it('lets any body fall and land, making the sound itself', () => {
    const r = walk(defaultTuning.bodies.player, -10, 3, 3);
    expect(r.y).toBeCloseTo(0, 6);
    const land = r.events.find((e) => e.type === 'land');
    expect(land && land.type === 'land' && land.source).toBe(42);
    expect(r.events.filter((e) => e.type === 'footstep').every((e) => e.type === 'footstep' && e.source === 42)).toBe(true);
  });
});

describe('declared data access', () => {
  const sys = (name: string, phase: System['phase'], access: Partial<Pick<System, 'reads' | 'writes' | 'emits' | 'after'>>): System => ({
    name,
    phase,
    reads: [],
    writes: [],
    emits: [],
    ...access,
    run: noop,
  });

  it('says which paths overlap: a prefix, any kind for *, every entity for entities', () => {
    expect(overlaps('*.body', 'guard.body.x')).toBe(true);
    expect(overlaps('player.body.stance', 'player.body')).toBe(true);
    expect(overlaps('player.body.stance', 'player.body.x')).toBe(false);
    expect(overlaps('player.control', 'guard.control')).toBe(false);
    expect(overlaps('*.body', 'schedule')).toBe(false);
    expect(overlaps('entities', 'guard.guard.headYaw')).toBe(true);
    expect(overlaps('entities', 'outcome')).toBe(false);
    expect(overlaps('@intents', '@intents.guard')).toBe(true);
    expect(overlaps('@intents.player', '@intents.guard')).toBe(false);
    expect(overlaps('rng.wander', 'rng')).toBe(true);
    expect(overlaps('rng.wander', 'rng.aim')).toBe(false);
  });

  it('refuses two systems in a phase that touch the same data with no declared order', () => {
    const writer = sys('writer', 'awareness', { writes: ['guard.guard.alert'] });
    const reader = sys('reader', 'awareness', { reads: ['guard.guard'] });
    expect(accessConflicts([writer, reader])).toEqual(["'writer' and 'reader' in 'awareness' (guard.guard.alert and guard.guard)"]);
    expect(() => planSystems([writer, reader], 30)).toThrow(/no declared order/);
    // Declaring the order resolves it, directly or through another system.
    expect(accessConflicts([writer, { ...reader, after: ['writer'] }])).toEqual([]);
    const middle = sys('middle', 'awareness', { after: ['writer'] });
    expect(accessConflicts([writer, middle, { ...reader, after: ['middle'] }])).toEqual([]);
    // Two writers of one subtree, and two emitters, conflict too.
    expect(accessConflicts([writer, sys('other', 'awareness', { writes: ['*.guard'] })])).toHaveLength(1);
    expect(accessConflicts([sys('a', 'camp', { emits: ['stance'] }), sys('b', 'camp', { emits: ['shot'] })])).toEqual(["'a' and 'b' in 'camp' (both emit events)"]);
    // Different phases, or different kinds, or only reads: no conflict.
    expect(accessConflicts([writer, { ...reader, phase: 'camp' }])).toEqual([]);
    expect(accessConflicts([writer, sys('player', 'awareness', { writes: ['player.control'] })])).toEqual([]);
    expect(accessConflicts([sys('a', 'camp', { reads: ['*.body'] }), sys('b', 'camp', { reads: ['*.body'] })])).toEqual([]);
    // An order must name a system earlier in the phase.
    expect(accessConflicts([{ ...reader, after: ['writer'] }, writer])).toContain("'reader' runs after 'writer', which isn't earlier in its phase");
  });

  it('refuses malformed access: missing declarations, bad paths, unknown events, writing the input', () => {
    expect(() => planSystems([{ name: 'x', phase: 'camp', run: noop } as unknown as System], 30)).toThrow(/doesn't declare/);
    expect(() => planSystems([sys('x', 'camp', { writes: ['guard..body'] })], 30)).toThrow(/malformed/);
    expect(() => planSystems([sys('x', 'camp', { reads: ['guard.*'] })], 30)).toThrow(/malformed/);
    expect(() => planSystems([sys('x', 'camp', { emits: ['explosion' as never] })], 30)).toThrow(/no event type/);
    expect(() => planSystems([sys('x', 'camp', { writes: ['input'] })], 30)).toThrow(/read only/);
  });

  it('stops a system that emits an event it does not declare', () => {
    const liar: System = { ...sys('liar', 'camp', {}), run: (ctx) => void ctx.emit({ type: 'outcome', source: 1, status: 'failed' }) };
    const sim = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, liar));
    expect(() => sim.step(neutralInput())).toThrow(/emitted 'outcome', which it doesn't declare/);
    expect(sim.fault?.system).toBe('liar');
  });

  it('lets only a system that declares it spawn or despawn inside a tick', () => {
    const crate = (id: number): SolidEntity => ({ id, kind: 'solid', faction: Faction.None, solid: { kind: 'box', id: 0, x: 30, z: 30, y0: 0, y1: 1, hx: 0.5, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood } });
    const sneak: System = { ...sys('sneak', 'world', {}), run: (ctx) => void ctx.spawn(crate) };
    const sim = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, sneak));
    expect(() => sim.step(neutralInput())).toThrow(/spawned an entity, which it doesn't declare/);
    // Declared, it spawns: the crate is in the index and the solids at once, and gone again when despawned.
    const seen: string[] = [];
    const maker: System = {
      ...sys('maker', 'world', { writes: ['entities'] }),
      // After the camp's power, which shares the phase (game/camp.ts).
      after: ['camp-power'],
      run(ctx) {
        if (ctx.tick === 1) {
          const c = ctx.spawn(crate);
          seen.push(`spawned ${c.id}: indexed ${ctx.index.get(c.id) === c}, solid ${ctx.solids.shapes.some((s) => s.id === c.solid.id)}`);
        } else if (ctx.tick === 2) {
          const c = ctx.index.of('solid')[0]!;
          seen.push(`despawned ${ctx.despawn(c.id)}: indexed ${ctx.index.get(c.id) !== undefined}, solids ${ctx.solids.count}`);
        }
      },
    };
    const ok = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, maker));
    ok.step(neutralInput());
    ok.step(neutralInput());
    expect(seen).toEqual([`spawned 2: indexed true, solid true`, `despawned true: indexed false, solids 0`]);
  });

  it('lets systems query every body as it stands, mid-tick', () => {
    // After the motor, a query sees the player where the motor just put him.
    const at: number[] = [];
    const look: System = { ...sys('look', 'motor', { reads: ['*.body'] }), after: ['motor'], run: (ctx) => void at.push(ctx.query().bodies[0]!.shape.head.x) };
    const sim = new Simulation(testWorld(), tuningCopy(), withSystem(SYSTEMS, look));
    for (let i = 0; i < 30; i++) {
      sim.step({ ...neutralInput(-Math.PI / 2), moveZ: 1 });
      expect(at[i]).toBe(sim.player.x);
    }
    expect(sim.player.x).toBeGreaterThan(0.5);
  });

  /** The access path of a changed leaf of the state tree: entities by their kind, random streams by their purpose. */
  function accessPath(path: readonly (string | number)[], after: SimState): string {
    const [root, k, ...rest] = path;
    if (root === 'entities') {
      const e = typeof k === 'number' ? after.entities[k] : undefined;
      return e && rest.length > 0 ? [e.kind, ...rest].join('.') : 'entities';
    }
    if (root === 'nextId') return 'entities';
    if (root === 'rng' && typeof k === 'string') return `rng.${k.slice(k.indexOf('.') + 1)}`;
    return String(root);
  }

  /** Every leaf that differs between two plain trees, as a path; a key added or removed is a change at that key, a changed length a change of the whole array. */
  function changes(a: unknown, b: unknown, path: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
    if (a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b))) return out;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      out.push(path);
      return out;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      // Entities are matched by id: a despawn shifts the rest along, and mustn't hide what else changed.
      if (path.length === 1 && path[0] === 'entities') {
        const now = new Map((b as Array<{ id: number }>).map((e, j) => [e.id, j]));
        if (a.length !== b.length || (a as Array<{ id: number }>).some((e) => !now.has(e.id))) out.push(path);
        for (const e of a as Array<{ id: number }>) {
          const j = now.get(e.id);
          if (j !== undefined) changes(e, b[j], [...path, j], out);
        }
        return out;
      }
      if (a.length !== b.length) out.push(path);
      else a.forEach((x, i) => changes(x, b[i], [...path, i], out));
      return out;
    }
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!(k in x) || !(k in y)) out.push([...path, k]);
      else changes(x[k], y[k], [...path, k], out);
    }
    return out;
  }

  /** True if a declared write covers a changed path: it is a prefix of it, with * standing for any kind. */
  function covers(write: string, path: string): boolean {
    const w = write.split('.');
    const p = path.split('.');
    if (w.length > p.length) return false;
    const isKind = (r: string): boolean => !['schedule', 'outcome', 'rng', 'entities', 'input', 'nextEventId', 'tick'].includes(r);
    // Spawning and despawning, not every field of every entity: a new entity shows up as itself, with no field named.
    if (w[0] === 'entities') return p[0] === 'entities' || p.length === 1;
    if (w[0] !== p[0] && !(w[0] === '*' && isKind(p[0]!))) return false;
    return w.every((x, i) => i === 0 || x === p[i]);
  }

  /** Watches every system of a run: whatever it changes in the state tree must be covered by what it declares. */
  function watchWrites(sim: KernelSimulation, found: Set<string>): void {
    let before: SimState | null = null;
    sim.profiler = {
      begin: () => {
        before = structuredClone(sim.state);
      },
      end: (system) => {
        for (const path of changes(before, sim.state)) {
          const p = accessPath(path, sim.state);
          if (p === 'nextEventId' ? system.emits.length === 0 : !system.writes.some((w) => covers(w, p))) found.add(`${system.name} wrote ${p}, which it doesn't declare`);
        }
      },
    };
  }

  it('lets every system write only what it declares, with the camp brain under fire', () => {
    const found = new Set<string>();
    const base = shooterScene('LEB-2534', 24, 2, 2);
    const scene = { ...base, setup: (sim: Simulation) => (base.setup!(sim), watchWrites(sim, found)) };
    runScene(scene, defaultTuning);
    expect([...found]).toEqual([]);
  }, 180_000);

  it('lets every system write only what it declares, when the target boards or finds his vehicle dead', () => {
    for (const disabled of [false, true]) {
      const found = new Set<string>();
      // A camp that protects nobody: at the siren its target goes for his vehicle at once.
      const base = liveCamp('seed=LEB-2534&off=protect') as Scene<Simulation>;
      const scene: Scene<Simulation> = {
        ...base,
        seconds: 6,
        expect: [],
        setup: (sim) => {
          base.setup!(sim);
          const c = commanderOf(sim)!;
          const spec = sim.world.camp.vehicles!.find((x) => x.escape)!;
          sim.index.of('vehicle').find((v) => v.vehicle.escape)!.vehicle.disabled = disabled;
          const at = boardingPoint(sim.world, spec, defaultTuning);
          const target = sim.index.get(c.camp.objective!.target) as GuardEntity;
          target.body.x = at.x;
          target.body.z = at.z;
          target.body.y = sim.world.terrain.heightAt(at.x, at.z);
          target.brain!.sirenAt = 0;
          c.camp.level = 'lockdown';
          watchWrites(sim, found);
        },
      };
      const run = runScene(scene, defaultTuning);
      const status = commanderOf(run.sim as Simulation)!.camp.objective!.status;
      expect(status).toBe(disabled ? 'open' : 'escaping');
      expect([...found]).toEqual([]);
    }
  }, 180_000);

  it('lets every system write only what it declares, in valleys', () => {
    const found = new Set<string>();
    const world = generateWorld(missionSpec('TAL-4471'), defaultTuning);
    for (const bot of [new ChaosBot('TAL-4471'), new WanderBot('TAL-4471')]) {
      const sim = new Simulation(world, defaultTuning);
      watchWrites(sim, found);
      const raw = neutralInput();
      for (let i = 0; i < 900; i++) sim.step({ ...bot.next(sim, raw), commands: i % 100 === 50 ? [{ kind: 'fire', lag: 0.5, yaw: 0, pitch: 0 }] : [] });
    }
    expect([...found]).toEqual([]);
  }, 120_000);

  // One test per scene: cloning the state around every system is slow, and one time limit over all of them stopped fitting on Windows' runner.
  const scenes: Array<[string, () => Scene]> = [...(Object.entries(SCENES) as Array<[string, () => Scene]>), ['kernel-alone', () => kernelAloneScene()]];
  it.each(scenes)('lets every system write only what it declares, in the scene %s', (_name, make) => {
    const found = new Set<string>();
    const scene = make();
    // Long scenes run shortened, without their expectations.
    const long = (scene.seconds ?? 10) > 20;
    const run = runScene(
      { ...scene, ...(long ? { expect: [] } : {}), setup: (sim) => (scene.setup?.(sim as never), watchWrites(sim, found)) } as typeof scene,
      defaultTuning,
      long ? { seconds: 20 } : {},
    );
    expect(run.failures).toEqual([]);
    expect([...found]).toEqual([]);
  }, 180_000);
});
