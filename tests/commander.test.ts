import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { digest, injectBelief, plan, type CampMind, type CampOrder, type CampState, type Report } from '../src/sim/brain';
import { giveBrains } from '../src/sim/game/brains';
import { campCommander, commanderOf, commsVoice, giveCommander } from '../src/sim/game/comms';
import { PERCEPTION, giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem } from '../src/sim/kernel/systems';
import type { World } from '../src/sim/kernel/world/world';
import { campWorld } from '../src/sim/game/scenes/campBrain';
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

describe('in the camp', () => {
  function campRun(place: { x: number; z: number }, seconds: number): { sim: Simulation; events: SimEvent[]; levels: Array<{ t: number; to: string }> } {
    const world = campWorld(T);
    let systems = SYSTEMS;
    for (const s of [...PERCEPTION, commsVoice, campCommander]) systems = withSystem(systems, s);
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

