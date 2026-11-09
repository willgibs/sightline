import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { digest, inEllipse, injectBelief, plan, type CampMind, type CampOrder, type CampState, type Report } from '../src/sim/brain';
import { giveBrains } from '../src/sim/game/brains';
import { campCheckins, campCommander, commanderOf, commsVoice, giveCommander } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import { Hasher } from '../src/sim/kernel/core/hash';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem, type System } from '../src/sim/kernel/systems';
import type { World } from '../src/sim/kernel/world/world';
import { campHeight, campWorld } from '../src/sim/game/scenes/campBrain';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { Faction } from '../src/sim/kernel/state';
import { sunDirection } from '../src/sim/kernel/env';
import { yawFromDirection } from '../src/sim/kernel/core/math';
import { testGuard, testWorld } from './fixtures';

/**
 * The commander (E5): alert levels; tasks with a priority, condition and capacity,
 * assigned greedily over guards with fixed tie-breaks; pacing's role slots; searches ended
 * by belief, not truth, in 30–45 s, the camp settling one level up.
 */

const POST = { role: 'patrol' as const, y: 0, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };

function guards(...at: Array<[number, number, string?]>): Array<Parameters<typeof testGuard>[0]> {
  return at.map(([x, z, role], id) => ({ ...POST, id, x, z, role: (role ?? 'patrol') as 'patrol' }));
}

function worldWith(g: Array<Parameters<typeof testGuard>[0]>): World {
  return testWorld({ size: 200, spawn: { x: -90, z: 90 }, camp: { structures: [], guards: g.map((x) => testGuard(x)), fenceHalf: 0 } });
}

function campMind(camp: CampState, world: World, tick: number): CampMind {
  return { camp, world, tuning: T, tick, time: tick / 30, officer: true };
}

function campOf(world: World): CampState {
  const sim = new Simulation(world, T, SYSTEMS);
  giveCommander(sim);
  return commanderOf(sim)!.camp;
}

const report = (kind: Report['kind'], x: number, z: number, from = 2, tick = 100): Report => ({ kind, x, y: 0, z, radius: 5, tick, from, fromX: x, fromZ: z, cause: 77 });

describe('alert levels', () => {
  const world = worldWith(guards([0, 0], [20, 0], [-20, 0], [0, 20, 'marksman']));

  it('an unverified sound makes the camp uneasy, and one guard goes to look', () => {
    const camp = campOf(world);
    digest(camp, report('heard', 30, 30), 100, T, world);
    expect(camp.level).toBe('uneasy');
    const out: CampOrder[] = [];
    plan(campMind(camp, world, 110), out);
    expect(out.length).toBe(1);
    expect(out[0]!.task.kind).toBe('investigate');
    expect(out[0]!.task.capacity).toBe(1);
  });

  it('evidence puts the camp on alert: search teams up to its slots', () => {
    const camp = campOf(world);
    digest(camp, report('shot', 30, 30), 100, T, world);
    expect(camp.level).toBe('alert');
    const out: CampOrder[] = [];
    plan(campMind(camp, world, 110), out);
    expect(out.length).toBeLessThanOrEqual(T.brain.camp.slots.alert.search + T.brain.camp.slots.alert.investigate);
    expect(out.every((o) => o.task.kind === 'search')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('never sends a marksman off his tower, and assigns the nearest suited guard first', () => {
    const w = worldWith(guards([0, 0], [5, 0], [-40, 0], [1, 1, 'marksman']));
    const camp = campOf(w);
    camp.roster.find((m) => m.post === 3)!.status = 'ok';
    // The marksman's post is elevated in the world? It's not: mark it so here.
    w.camp.guards[3]!.elevated = true;
    digest(camp, report('heard', 10, 0, 99), 100, T, w);
    const out: CampOrder[] = [];
    plan(campMind(camp, w, 110), out);
    expect(out.length).toBe(1);
    // Guard 1 (post 1, at (5, 0)) is nearest to (10, 0).
    expect(out[0]!.guard).toBe(camp.roster.find((m) => m.post === 1)!.id);
  });

  it('breaks ties by task index, then guard id', () => {
    const w = worldWith(guards([-5, 0], [5, 0]));
    const a = campOf(w);
    digest(a, report('heard', 0, 0), 100, T, w);
    const out1: CampOrder[] = [];
    plan(campMind(a, w, 110), out1);
    const b = campOf(w);
    digest(b, report('heard', 0, 0), 100, T, w);
    const out2: CampOrder[] = [];
    plan(campMind(b, w, 110), out2);
    expect(out1).toEqual(out2);
    expect(out1[0]!.guard).toBeLessThan(a.roster[1]!.id);
  });
});

describe('a search', () => {
  const world = worldWith(guards([0, 0], [10, 0]));
  const hz = T.sim.tickHz;
  const S = T.brain.camp.search;

  function search(reportTick: number): CampState {
    const camp = campOf(world);
    digest(camp, report('shot', 10, 10), reportTick, T, world);
    return camp;
  }

  it('ends on belief: no sooner than the minimum, no later than the maximum, wherever anyone is', () => {
    const start = 100;
    // Nobody reports again; only time and the map decide.
    for (const clearMap of [false, true]) {
      const camp = search(start);
      const out: CampOrder[] = [];
      let ended = -1;
      for (let tick = start + 1; tick < start + 60 * hz; tick++) {
        if (clearMap && tick === start + 20 * hz) camp.map.p.fill(0);
        plan(campMind(camp, world, tick), out);
        if (!camp.search && ended < 0) ended = tick;
      }
      expect(ended).toBeGreaterThan(0);
      const secs = (ended - start) / hz;
      expect(secs).toBeGreaterThanOrEqual(S.minSeconds - 1e-6);
      expect(secs).toBeLessThanOrEqual(S.maxSeconds + 1 / hz);
    }
  });

  it('a new report keeps the search alive', () => {
    const start = 100;
    const camp = search(start);
    const out: CampOrder[] = [];
    for (let tick = start + 1; tick < start + 60 * hz; tick++) {
      if (tick === start + 25 * hz) digest(camp, report('heard', 12, 12, 2, tick), tick, T, world);
      plan(campMind(camp, world, tick), out);
    }
    expect(camp.search).not.toBeNull();
  });

  it('settles one level above where it started, and stays up', () => {
    const start = 100;
    const camp = search(start);
    const out: CampOrder[] = [];
    for (let tick = start + 1; tick < start + 50 * hz; tick++) plan(campMind(camp, world, tick), out);
    expect(camp.search).toBeNull();
    expect(camp.level).toBe('uneasy');
    expect(camp.floor).toBe('uneasy');
    // Another incident from uneasy: settles at alert.
    digest(camp, report('shot', 5, 5, 2, 2000), 2000, T, world);
    for (let tick = 2001; tick < 2000 + 50 * hz; tick++) plan(campMind(camp, world, tick), out);
    expect(camp.level).toBe('alert');
  });

  it('the pacing layer caps how many are sent, whatever the map', () => {
    const w = worldWith(guards([0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0], [60, 0]));
    const camp = campOf(w);
    digest(camp, report('shot', 30, 30), 100, T, w);
    // Plant belief all over the map: more spots than slots.
    for (let k = 0; k < 30; k++) injectBelief(camp.map, -60 + k * 4, 40, 3, 0.03);
    const out: CampOrder[] = [];
    plan(campMind(camp, w, 110), out);
    expect(out.length).toBeLessThanOrEqual(T.brain.camp.slots.alert.search);
    expect(camp.tasks.length).toBeLessThanOrEqual(T.brain.camp.slots.alert.search);
  });
});

describe('a spot called clear', () => {
  const world = worldWith(guards([0, 0], [20, 0], [-20, 0]));

  it('is not sent another guard, until a new report names it', () => {
    const camp = campOf(world);
    digest(camp, report('heard', 30, 30), 100, T, world);
    const out: CampOrder[] = [];
    plan(campMind(camp, world, 110), out);
    expect(out.map((o) => o.task.kind)).toEqual(['investigate']);
    digest(camp, report('clear', 30, 30, out[0]!.guard, 200), 200, T, world);
    plan(campMind(camp, world, 210), out);
    expect(out).toEqual([]);
    // Something new from about there: back to looking.
    digest(camp, report('heard', 32, 30, 2, 220), 220, T, world);
    plan(campMind(camp, world, 230), out);
    expect(out.map((o) => o.task.kind)).toEqual(['investigate']);
  });
});

describe('lockdown', () => {
  const world = worldWith(guards([0, 0], [20, 0], [-20, 0], [0, 20]));

  it('outlasts a search: a raised alarm keeps the camp hunting, and the level never drops', () => {
    const camp = campOf(world);
    camp.devices.alarms.push({ x: 5, z: 5, raised: true, powered: true });
    digest(camp, report('contact', 30, 30), 100, T, world);
    const out: CampOrder[] = [];
    plan(campMind(camp, world, 110), out);
    expect(camp.level).toBe('lockdown');
    const since = camp.since;
    // Long past the time any search would have ended.
    plan(campMind(camp, world, 100 + (T.brain.camp.search.maxSeconds + 10) * 30), out);
    expect(camp.level).toBe('lockdown');
    expect(camp.since).toBe(since);
    expect(camp.search).not.toBeNull();
  });

  it('hunts even if nothing had been reported when the alarm went', () => {
    const camp = campOf(world);
    camp.devices.alarms.push({ x: 5, z: 5, raised: true, powered: true });
    plan(campMind(camp, world, 10), []);
    expect(camp.level).toBe('lockdown');
    expect(camp.search).not.toBeNull();
    expect(camp.search!.x).toBe(5);
  });
});

describe('in the camp', () => {
  function campRun(place: { x: number; z: number }, seconds: number): { sim: Simulation; events: SimEvent[]; levels: Array<{ t: number; to: string }> } {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, place.x, place.z);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    const raw = neutralInput();
    const events: SimEvent[] = [];
    const levels: Array<{ t: number; to: string }> = [];
    for (let i = 0; i < seconds * 30; i++) {
      for (const e of sim.step(raw)) {
        events.push({ ...e });
        if (e.type === 'level') levels.push({ t: e.t, to: e.to });
      }
    }
    return { sim, events, levels };
  }

  it('a guard who sees the player brings the camp up by radio', () => {
    // Standing in the open by the sentry at the gate.
    const { events, levels } = campRun({ x: 44, z: 6 }, 40);
    expect(events.some((e) => e.type === 'radio')).toBe(true);
    expect(levels.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'order')).toBe(true);
  });
});


/**
 * No omniscience, over the commander and the pacing layer (rule 13): the commander's whole
 * memory is hashed before it decides, and what it decided after. Two runs with the player
 * at two places no one can sense must give the same decisions from the same memory.
 */
describe('no omniscience, over the commander', () => {
  type Trace = Array<{ before: string; after: string }>;

  function hashCamp(camp: CampState): string {
    return new Hasher().str(JSON.stringify(camp)).digest();
  }

  function run(place: { x: number; z: number }, extra: System[] = [], seconds = 25): Trace {
    const trace: Trace = [];
    const world = campWorld(T);
    let before = '';
    const probeBefore: System = {
      name: 'test-camp-before',
      phase: 'camp',
      after: ['comms-voice'],
      reads: ['commander.camp'],
      writes: [],
      emits: [],
      run(ctx) {
        const c = commanderOf(ctx);
        before = c ? hashCamp(c.camp) : '';
      },
    };
    const probeAfter: System = {
      name: 'test-camp-after',
      phase: 'camp',
      after: ['camp-commander'],
      reads: ['commander.camp'],
      writes: [],
      emits: [],
      run(ctx) {
        const c = commanderOf(ctx);
        trace.push({ before, after: c ? hashCamp(c.camp) : '' });
      },
    };
    const commander: System = { ...campCommander, after: ['comms-voice', 'test-camp-before', ...extra.map((s) => s.name)] };
    let systems = SYSTEMS;
    for (const s of [commsVoice, probeBefore, ...extra, commander, probeAfter]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, place.x, place.z);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    const raw = neutralInput();
    for (let i = 0; i < seconds * 30; i++) sim.step(raw);
    return trace;
  }

  const far1 = { x: 372, z: 372 };
  const far2 = { x: -372, z: 372 };

  it('the same memory decides the same, wherever the unsensed player is', () => {
    const a = run(far1);
    const b = run(far2);
    expect(a.length).toBe(b.length);
    a.forEach((x, k) => {
      if (x.before === b[k]!.before) expect(x.after).toBe(b[k]!.after);
    });
  });

  it('a commander that peeks at the player is caught', () => {
    const peek: System = {
      name: 'test-commander-peek',
      phase: 'camp',
      after: ['test-camp-before'],
      reads: ['player.body', 'commander.camp'],
      writes: ['commander.camp'],
      emits: [],
      run(ctx) {
        const c = commanderOf(ctx);
        const p = ctx.index.of('player')[0]!.body;
        // A leak: the camp's search map learns where the player truly is.
        if (c && ctx.tick === 30) c.camp.map.p[(Math.floor((p.x - c.camp.map.x0) / c.camp.map.cell) % c.camp.map.n + c.camp.map.n) % c.camp.map.n] = 0.5;
      },
    };
    const a = run(far1, [peek]);
    const b = run(far2, [peek]);
    let caught = false;
    a.forEach((x, k) => {
      if (x.before === b[k]!.before && x.after !== b[k]!.after) caught = true;
    });
    expect(caught).toBe(true);
  });
});

describe('adaptation within a mission (E9)', () => {
  const world = worldWith(guards([0, 0], [10, 0], [-10, 0]));

  it('a repeated trick draws more: the third rock at one spot sends two guards', () => {
    const camp = campOf(world);
    const out: CampOrder[] = [];
    digest(camp, report('heard', 20, 20), 100, T, world);
    plan(campMind(camp, world, 110), out);
    expect(camp.tasks.find((t) => t.kind === 'investigate')!.capacity).toBe(1);
    // Later, the same trick twice more at the same spot.
    digest(camp, report('heard', 21, 19), 400, T, world);
    digest(camp, report('heard', 19, 21), 700, T, world);
    camp.tasks.length = 0;
    plan(campMind(camp, world, 710), out);
    expect(camp.tasks.find((t) => t.kind === 'investigate')!.capacity).toBe(2);
  });

  it('remembers where shots and bodies were reported', () => {
    const camp = campOf(world);
    digest(camp, report('shot', 200, 40), 100, T, world);
    digest(camp, report('shot', 205, 45), 130, T, world);
    digest(camp, report('body', 12, 8), 300, T, world);
    expect(camp.incidents.find((i) => i.kind === 'shots')!.count).toBe(2);
    expect(camp.incidents.find((i) => i.kind === 'body')!.count).toBe(1);
  });
});

describe('radio check-ins', () => {
  // Every few seconds, for a test that can't wait minutes.
  const fast = structuredClone(T);
  fast.brain.camp.checkins.every = 8;
  fast.brain.camp.checkins.uneasyEvery = 8;
  fast.brain.camp.checkins.deadline = 3;

  function checkins(world: World, seconds: number, despawnPost?: number, removeOperator = false): { sim: Simulation; events: SimEvent[] } {
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins]) systems = withSystem(systems, s);
    const sim = new Simulation(world, fast, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    if (despawnPost !== undefined) sim.despawn(sim.guards.find((g) => g.guard.spawn === despawnPost)!.id);
    if (removeOperator) sim.despawn(sim.guards.find((g) => sim.world.camp.guards[g.guard.spawn]!.role === 'radio-operator')!.id);
    const raw = neutralInput();
    const events: SimEvent[] = [];
    for (let i = 0; i < seconds * 30; i++) for (const e of sim.step(raw)) events.push({ ...e });
    return { sim, events };
  }

  const G = (x: number, z: number, role?: string): [number, number, string?] => [x, z, role];

  it('a live post answers its call and the camp stays calm', () => {
    const world = worldWith(guards(G(0, 0), G(10, 0), G(-10, 0, 'radio-operator')));
    const { sim, events } = checkins(world, 30);
    expect(events.filter((e) => e.type === 'checkin' && e.stage === 'call').length).toBeGreaterThan(2);
    expect(events.some((e) => e.type === 'checkin' && e.stage === 'silence')).toBe(false);
    expect(commanderOf(sim)!.camp.level).toBe('calm');
  });

  it('a dead post does not answer: the camp goes uneasy and someone walks over', () => {
    const world = worldWith(guards(G(0, 0), G(10, 0), G(-10, 0, 'radio-operator')));
    const { sim, events } = checkins(world, 20, 0);
    expect(events.some((e) => e.type === 'checkin' && e.stage === 'silence')).toBe(true);
    const camp = commanderOf(sim)!.camp;
    expect(camp.level).toBe('uneasy');
    // An order went out to walk to the silent post.
    const order = events.find((e): e is Extract<SimEvent, { type: 'order' }> => e.type === 'order' && e.task === 'check');
    expect(order).toBeDefined();
    expect(Math.hypot(order!.x - 0, order!.z - 0)).toBeLessThan(2);
  });

  it('with no operator, the calls stop', () => {
    const world = worldWith(guards(G(0, 0), G(10, 0), G(-10, 0, 'radio-operator')));
    const { events } = checkins(world, 20, undefined, true);
    expect(events.some((e) => e.type === 'checkin')).toBe(false);
  });
});

describe("a marksman's scope (E8)", () => {
  function flash(role: 'marksman' | 'patrol', sweeping: boolean, away: boolean): number {
    const sim = new Simulation(worldWith(guards([0, 0, role])), T, SYSTEMS);
    giveSenses(sim);
    giveBrains(sim);
    const sun = sunDirection(sim.world.spec.env, 0, { x: 0, y: 0, z: 0 });
    expect(sun.y).toBeGreaterThan(0);
    const l = Math.hypot(sun.x, sun.z);
    const [ux, uz] = [sun.x / l, sun.z / l];
    placePlayer(sim, ux * 60, uz * 60);
    const g = sim.guards[0]!;
    g.body.yaw = away ? yawFromDirection(-ux, -uz) : yawFromDirection(ux, uz);
    g.guard.headYaw = 0;
    if (sweeping) {
      g.brain!.act = 'task';
      g.brain!.task = { id: 1, kind: 'sweep', x: ux * 60, z: uz * 60, issued: 0, cause: 0 };
    }
    return sim.snapshot().guards[9]!;
  }

  it('flashes at the player when he sweeps toward him with the sun behind the player', () => {
    expect(flash('marksman', true, false)).toBeGreaterThan(0);
  });

  it('shows nothing when he looks away, or when he is not glassing, or is not a marksman', () => {
    expect(flash('marksman', true, true)).toBe(0);
    expect(flash('marksman', false, false)).toBe(0);
    expect(flash('patrol', true, false)).toBe(0);
  });
});

describe('counter-sniper (E8)', () => {
  // A shot from the ridge, 300 m out: a report, heard by the camp.
  const PERCH = { x: 295, z: -118 };
  function reportAt(tick: number): System {
    return {
      name: 'test-shot',
      phase: 'commands',
      after: ['player-commands', 'rifle', 'sandbox-drops', 'use'],
      reads: [],
      writes: [],
      emits: ['report'],
      run(ctx) {
        if (ctx.tick !== tick) return;
        ctx.emit({ type: 'report', source: 1, x: PERCH.x, y: campHeight(PERCH.x, PERCH.z) + 1.6, z: PERCH.z, surface: Surface.Grass, loudness: 2400 / ctx.tuning.noise.radiusPerUnit, radius: 2400, suppressed: 0 });
      },
    };
  }

  it('turns reports of a shot into bearings the commander fuses, and a marksman sweeps there', () => {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins, reportAt(30)]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, 372, 372);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    const raw = neutralInput();
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 * 30; i++) for (const e of sim.step(raw)) events.push({ ...e });
    // Guards heard it, the camp came up and it has an estimate.
    expect(events.some((e) => e.type === 'heard' && e.kind === 'shot')).toBe(true);
    const camp = commanderOf(sim)!.camp;
    expect(camp.shots.bearings.length).toBeGreaterThan(0);
    expect(camp.shots.estimate).not.toBeNull();
    const est = camp.shots.estimate!;
    // The estimate is honest about where the shot came from: inside its two-sigma ellipse, the shooter.
    expect(inEllipse(est, PERCH.x, PERCH.z, 2)).toBe(true);
    // And the marksman turns to sweep it.
    const orders = events.filter((e): e is Extract<SimEvent, { type: 'order' }> => e.type === 'order' && e.task === 'sweep');
    expect(orders.length).toBeGreaterThan(0);
    expect(world.camp.guards[sim.guards.find((g) => g.id === orders[0]!.to)!.guard.spawn]!.role).toBe('marksman');
    expect(sim.guards.some((g) => world.camp.guards[g.guard.spawn]!.role === 'marksman' && g.brain!.act === 'task')).toBe(true);
    expect(camp.level).toBe('alert');
  });

  it('visibly reacts to a shot from 300 m inside the window', () => {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins, reportAt(30)]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, 372, 372);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    const raw = neutralInput();
    let first = -1;
    for (let i = 0; i < 6 * 30 && first < 0; i++) {
      for (const e of sim.step(raw)) if (e.type === 'act' && e.tick >= 30 && e.to !== 'routine') first = e.t - 30 / 30;
    }
    // Sound takes 0.9 s from 300 m; his reaction is telegraphed from then.
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(2);
  });
});

describe('bodies (E9)', () => {
  it('a body a guard finds is reported, and the camp goes on alert', () => {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, 372, 372);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    // A body lying in the open, in the gate sentry's view (post 0 at (28, 4.5), facing east).
    sim.spawn((id) => ({ id, kind: 'remains' as const, faction: Faction.Camp, remains: { of: 0, post: -1, x: 40, y: 0, z: 5, yaw: 0, eye: T.bodies.guard.eyeHeight.prone, vx: 0, vz: 0, fell: -10, part: 'torso' as const, carriedBy: 0, hidden: false } }));
    const raw = neutralInput();
    const events: SimEvent[] = [];
    for (let i = 0; i < 30 * 30; i++) for (const e of sim.step(raw)) events.push({ ...e });
    expect(events.some((e) => e.type === 'spotted' && e.what === 'body')).toBe(true);
    expect(events.some((e) => e.type === 'radio' && e.kind === 'body')).toBe(true);
    const camp = commanderOf(sim)!.camp;
    expect(camp.incidents.some((i) => i.kind === 'body')).toBe(true);
    expect(['alert', 'lockdown', 'uneasy']).toContain(camp.level);
  });
});

describe('sandbox body drops (E11)', () => {
  it('a body dropped where the player looks is found by the camp, as any body is', () => {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    // The player looks west and down, from east of the gate: the ground 8 m ahead.
    placePlayer(sim, 44, 6, -1, 0);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    sim.step(neutralInput(sim.player.yaw));
    const pitch = -Math.atan2(sim.player.eyeHeight, 8);
    const input = neutralInput(sim.player.yaw);
    input.commands = [{ kind: 'bodyDrop', lag: 0, yaw: sim.player.yaw, pitch }];
    const ev: SimEvent[] = [...sim.step(input).map((e) => ({ ...e }))];
    expect(sim.index.of('remains').length).toBe(1);
    const raw = neutralInput(sim.player.yaw);
    for (let i = 0; i < 40 * 30; i++) for (const e of sim.step(raw)) ev.push({ ...e });
    expect(ev.some((e) => e.type === 'spotted' && e.what === 'body')).toBe(true);
    expect(commanderOf(sim)!.camp.incidents.some((i) => i.kind === 'body')).toBe(true);
    // It is a body like any other: a dropped one, found by a guard, in the reason.
    expect(ev.some((e) => e.type === 'act' && e.why === 'body')).toBe(true);
  });
});

describe('a body in the open (E9)', () => {
  it('orders guards near it off the exposed ground', () => {
    const world = worldWith(guards([0, 0], [10, 0], [-14, 4]));
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    giveDevicesNone();
    const camp = commanderOf(sim)!.camp;
    camp.inbox.push({ kind: 'body', x: 6, y: 0, z: 6, radius: 6, tick: 0, from: 99, fromX: 6, fromZ: 6, cause: 0 });
    const raw = neutralInput();
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3 * 30; i++) for (const e of sim.step(raw)) ev.push({ ...e });
    expect(ev.some((e) => e.type === 'order' && e.task === 'cover')).toBe(true);
  });
});
function giveDevicesNone(): void {}
