import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { injectBelief, mapMass, mapSpread, spreadBelief, type CampState } from '../src/sim/brain';
import { giveBrains } from '../src/sim/game/brains';
import { campCommander, commanderOf, commsVoice, giveCommander, tell } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem, type System } from '../src/sim/kernel/systems';
import type { World } from '../src/sim/kernel/world/world';
import { campWorld } from '../src/sim/game/scenes/campBrain';
import { testGuard, testWorld } from './fixtures';

/**
 * How reports travel (E4): voice through lab A's hearing, radio across the camp after a
 * delay, cancelled if the speaker drops; the camp's one search map, fed only by reports.
 */

const SENTRY = { id: 0, role: 'sentry' as const, x: 0, y: 0, z: 0, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };
const OPERATOR = { ...SENTRY, id: 9, role: 'radio-operator' as const, x: 40, z: -40 };

function worldWith(...guards: Array<Parameters<typeof testGuard>[0]>): World {
  return testWorld({ size: 160, spawn: { x: -70, z: 70 }, camp: { structures: [], guards: guards.map((g) => testGuard(g)), fenceHalf: 0 } });
}

function campy(world: World, extra: System[] = []): Simulation {
  let systems = SYSTEMS;
  for (const s of [commsVoice, campCommander, ...extra]) systems = withSystem(systems, s);
  const sim = new Simulation(world, T, systems);
  giveSenses(sim);
  giveBrains(sim);
  giveCommander(sim);
  return sim;
}

function run(sim: Simulation, seconds: number): SimEvent[] {
  const raw = neutralInput();
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds * 30; i++) out.push(...sim.step(raw).map((e) => ({ ...e })));
  return out;
}

describe('reports', () => {
  it('a report reaches those in earshot by voice, through hearing', () => {
    // A near guard hears the speaker's report; a far one doesn't, without a radio call.
    const sim = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: 6, z: 2 }, { ...SENTRY, id: 2, x: -60, z: -60 }));
    const speaker = sim.guards[0]!;
    // Have the speaker say it directly: no noise needed; the near guard is told by the voice.
    speaker.senses!.awareness.state = 'searching';
    speaker.senses!.awareness.focus = true;
    speaker.senses!.awareness.fx = 20;
    speaker.senses!.awareness.fz = 0;
    speaker.brain!.say = { report: { kind: 'heard', x: 20, y: 0, z: 0, radius: 10, tick: 0, from: speaker.id, fromX: 0, fromZ: 0, cause: 0 }, radius: T.brain.comms.talkRadius, radio: false };
    const ev = run(sim, 2);
    expect(ev.some((e) => e.type === 'call')).toBe(true);
    const near = sim.guards[1]!;
    const far = sim.guards[2]!;
    expect(near.brain!.told.length).toBe(1);
    expect(near.brain!.told[0]!.via).toBe('voice');
    expect(far.brain!.told.length).toBe(0);
  });

  it('a voice carries its report only as far as hearing allows', () => {
    // The same speech heard by one at 5 m and one at 60 m (beyond a talking voice's reach).
    const sim = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: 5, z: 0 }, { ...SENTRY, id: 2, x: 60, z: 0 }));
    const speaker = sim.guards[0]!;
    speaker.brain!.say = { report: { kind: 'heard', x: 20, y: 0, z: 0, radius: 10, tick: 0, from: speaker.id, fromX: 0, fromZ: 0, cause: 0 }, radius: T.brain.comms.talkRadius, radio: false };
    run(sim, 1);
    expect(sim.guards[1]!.brain!.told.length).toBe(1);
    expect(sim.guards[2]!.brain!.told.length).toBe(0);
  });

  it('a radio call reaches the camp after its delay, when the speaker finishes it', () => {
    const sim = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: -60, z: -60 }, OPERATOR));
    const speaker = sim.guards[0]!;
    speaker.brain!.radio = { kind: 'contact', x: 20, y: 0, z: 0, radius: 5, tick: 0, from: speaker.id, fromX: 0, fromZ: 0, cause: 0 };
    const radio: SimEvent[] = [];
    const raw = neutralInput();
    for (let i = 0; i < 4 * 30; i++) for (const e of sim.step(raw)) if (e.type === 'radio') radio.push({ ...e });
    expect(radio.length).toBe(1);
    expect(radio[0]!.t).toBeCloseTo(T.brain.comms.netDelay + 1 / 30, 1);
    expect(sim.guards[1]!.brain!.told.length).toBe(1);
    expect(sim.guards[1]!.brain!.told[0]!.via).toBe('radio');
    expect(commanderOf(sim)!.camp.map.p.some((v) => v > 0)).toBe(true);
  });

  it('a call whose speaker falls mid-sentence is never delivered', () => {
    const sim = campy(worldWith(SENTRY, OPERATOR));
    const speaker = sim.guards[0]!;
    // He starts a radio call (he's searching), then he's dropped before it's over.
    speaker.senses!.awareness.state = 'searching';
    speaker.senses!.awareness.focus = true;
    speaker.senses!.awareness.fx = 20;
    speaker.senses!.awareness.fz = 0;
    speaker.senses!.belief = { x: 20, y: 0, z: 0, radius: 5, tick: 0, seen: false, cause: 0 };
    speaker.brain!.act = 'report';
    speaker.brain!.until = 40; // the call ends at tick 40
    const raw = neutralInput();
    for (let i = 0; i < 20; i++) sim.step(raw);
    sim.despawn(speaker.id);
    const radios: SimEvent[] = [];
    for (let i = 0; i < 4 * 30; i++) for (const e of sim.step(raw)) if (e.type === 'radio') radios.push({ ...e });
    expect(radios.length).toBe(0);
    expect(commanderOf(sim)!.camp.airwaves.length).toBe(0);
  });

  it('the radio needs an operator and a working set', () => {
    // No operator: the call goes nowhere.
    const a = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: -60, z: -60 }));
    a.guards[0]!.brain!.radio = { kind: 'contact', x: 20, y: 0, z: 0, radius: 5, tick: 0, from: a.guards[0]!.id, fromX: 0, fromZ: 0, cause: 0 };
    run(a, 4);
    expect(a.guards[1]!.brain!.told.length).toBe(0);
    // A broken set: the same.
    const b = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: -60, z: -60 }, OPERATOR));
    commanderOf(b)!.camp.netWorking = false;
    b.guards[0]!.brain!.radio = { kind: 'contact', x: 20, y: 0, z: 0, radius: 5, tick: 0, from: b.guards[0]!.id, fromX: 0, fromZ: 0, cause: 0 };
    run(b, 4);
    expect(b.guards[1]!.brain!.told.length).toBe(0);
    // Voice still works without the radio.
  });

  it('a guard who is told something raises his awareness and his belief', () => {
    const sim = campy(worldWith(SENTRY));
    const g = sim.guards[0]!;
    expect(g.senses!.awareness.state).toBe('unaware');
    const ctx = (sim as unknown as { ctx: Parameters<typeof tell>[0] }).ctx;
    tell(ctx, g, { kind: 'contact', x: 12, y: 0, z: 3, radius: 4, tick: 0, from: 99, fromX: 0, fromZ: 0, cause: 5 }, 'radio', 7);
    run(sim, 2);
    expect(g.senses!.awareness.focus).toBe(true);
    expect(g.senses!.belief?.x).toBeCloseTo(12, 6);
    expect(g.brain!.told.length).toBe(1);
  });
});

describe('the search map', () => {
  const world = campWorld(T);
  const map = () => ({ ...createFrom() });
  const createFrom = (): CampState['map'] => {
    const sim = new Simulation(world, T, SYSTEMS);
    return giveCommander(sim).camp.map;
  };

  it('is one grid under 5,000 numbers', () => {
    const m = map();
    expect(m.p.length).toBeLessThanOrEqual(5000);
    expect(m.n * m.cell).toBeGreaterThanOrEqual(100);
  });

  it('holds belief where a report said, and bleeds it outward without losing any', () => {
    const m = map();
    injectBelief(m, 5, 5, 8, 1);
    expect(mapMass(m)).toBeCloseTo(1, 6);
    const sharp = mapSpread(m);
    for (let i = 0; i < 40; i++) spreadBelief(m, T.brain.searchMap.spreadRate, world);
    expect(mapMass(m)).toBeCloseTo(1, 6);
    expect(mapSpread(m)).toBeGreaterThan(sharp * 3);
  });

  it('is cleared by a report that a place has been searched, by what can be seen from there', () => {
    const sim = campy(worldWith(SENTRY, OPERATOR));
    const c = commanderOf(sim)!;
    injectBelief(c.camp.map, 10, 10, 8, 1);
    const before = mapMass(c.camp.map);
    c.camp.inbox.push({ kind: 'clear', x: 10, y: 0, z: 10, radius: 16, tick: 0, from: 1, fromX: 10, fromZ: 10, cause: 0 });
    sim.step(neutralInput());
    expect(mapMass(c.camp.map)).toBeLessThan(before * 0.5);
  });

  it('fed only by reports: a guard who sees or hears nothing feeds it nothing', () => {
    const sim = campy(campWorld(T), []);
    const raw = neutralInput();
    for (let i = 0; i < 300; i++) sim.step(raw);
    expect(commanderOf(sim)!.camp.map.p.every((v) => v === 0)).toBe(true);
  });
});

describe('searching guards report in', () => {
  it('radios what it heard, and the camp and the other guards believe it', () => {
    const sim = campy(worldWith(SENTRY, { ...SENTRY, id: 1, x: -55, z: -55 }, OPERATOR));
    const g = sim.guards[0]!;
    const ctx = (sim as unknown as { ctx: Parameters<typeof tell>[0] }).ctx;
    // He heard it himself, too: a report is worth calling in only from his own senses.
    g.senses!.percepts.push({ kind: 'shot', x: 9, y: 0, z: 0, radius: 10, strength: 3, tick: 0, expires: 999, cause: 0 });
    tell(ctx, g, { kind: 'shot', x: 9, y: 0, z: 0, radius: 10, tick: 0, from: 99, fromX: 0, fromZ: 0, cause: 0 }, 'voice', 0);
    const ev = run(sim, 14);
    expect(ev.some((e) => e.type === 'act' && e.to === 'report')).toBe(true);
    expect(ev.some((e) => e.type === 'radio')).toBe(true);
    const far = sim.guards[1]!;
    expect(far.brain!.told.some((t) => t.via === 'radio')).toBe(true);
    expect(commanderOf(sim)!.camp.map.p.some((v) => v > 0)).toBe(true);
    // His own report never comes back to him.
    expect(g.brain!.told.filter((t) => t.via === 'radio').length).toBe(0);
  });
});

