import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { campCommander, commanderOf, commsVoice, cutPower, giveCommander, giveDevices } from '../src/sim/game/comms';
import { PERCEPTION, giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem } from '../src/sim/kernel/systems';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld } from './fixtures';

/**
 * Alarms (E7): a guard runs for the alarm box, a journey through the motor; lockdown is
 * set only by a box changing state; dropping the runner or cutting the power interrupts.
 */

const G = { id: 0, role: 'sentry' as const, x: 0, y: 0, z: 0, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };

function worldWith(guards = [G]): World {
  return testWorld({ size: 160, spawn: { x: -70, z: 70 }, camp: { structures: [], guards: guards.map((g) => testGuard(g)), fenceHalf: 0 } });
}

function campy(world: World, alarms: Array<{ x: number; z: number }>): Simulation {
  let systems = SYSTEMS;
  for (const s of [...PERCEPTION, commsVoice, campCommander]) systems = withSystem(systems, s);
  const sim = new Simulation(world, T, systems);
  giveSenses(sim);
  giveBrains(sim);
  giveCommander(sim);
  giveDevices(sim, alarms);
  return sim;
}

/** Puts a guard in combat, facing a threat to the east. */
function combat(sim: Simulation): void {
  for (const g of sim.guards) {
    const a = g.senses!.awareness;
    a.state = 'combat';
    a.since = 0;
    a.fallAt = 99999;
    a.focus = true;
    a.fx = 40;
    a.fz = 0;
    g.senses!.belief = { x: 40, y: 1.2, z: 0, radius: 3, tick: 0, seen: true, cause: 0 };
  }
}

function run(sim: Simulation, seconds: number, each?: (k: number) => void): SimEvent[] {
  const raw = neutralInput();
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds * 30; i++) {
    each?.(i);
    out.push(...sim.step(raw).map((e) => ({ ...e })));
  }
  return out;
}

describe('alarms', () => {
  it('a guard in combat runs for the box, throws the switch, and the camp locks down', () => {
    const sim = campy(worldWith(), [{ x: -18, z: 5 }]);
    combat(sim);
    const ev = run(sim, 12);
    expect(ev.some((e) => e.type === 'act' && e.to === 'alarm')).toBe(true);
    const raised = ev.find((e) => e.type === 'alarm' && e.stage === 'raised');
    expect(raised).toBeDefined();
    // A real run: the distance took him seconds, not a teleport.
    expect(raised!.t).toBeGreaterThan(3);
    const camp = commanderOf(sim)!.camp;
    expect(camp.level).toBe('lockdown');
    expect(camp.devices.alarms[0]!.raised).toBe(true);
    expect(ev.some((e) => e.type === 'siren')).toBe(true);
    expect(ev.some((e) => e.type === 'level' && e.to === 'lockdown')).toBe(true);
  });

  it('dropping the runner before he reaches the box stops the alarm', () => {
    const sim = campy(worldWith(), [{ x: -18, z: 5 }]);
    combat(sim);
    run(sim, 1.5, (k) => {
      if (k === 40) sim.despawn(sim.guards[0]!.id);
    });
    const ev = run(sim, 15);
    expect(ev.some((e) => e.type === 'alarm')).toBe(false);
    expect(commanderOf(sim)!.camp.level).not.toBe('lockdown');
  });

  it('cutting the power first means he reaches a dead box', () => {
    const sim = campy(worldWith(), [{ x: -18, z: 5 }]);
    combat(sim);
    cutPower(sim);
    const ev = run(sim, 12);
    expect(ev.some((e) => e.type === 'alarm' && e.stage === 'dead')).toBe(true);
    expect(ev.some((e) => e.type === 'alarm' && e.stage === 'raised')).toBe(false);
    expect(commanderOf(sim)!.camp.level).not.toBe('lockdown');
  });

  it('a box out of a sprint is out of reach', () => {
    const sim = campy(worldWith(), [{ x: T.brain.alarm.reach + 30, z: 0 }]);
    combat(sim);
    const ev = run(sim, 4);
    expect(ev.some((e) => e.type === 'act' && e.to === 'alarm')).toBe(false);
  });
});

describe('reinforcements (E8)', () => {
  it('lockdown calls a squad that arrives after its delay, and hunts', () => {
    const fast = structuredClone(T);
    fast.brain.reinforce.delay = 3;
    let systems = SYSTEMS;
    for (const s of [...PERCEPTION, commsVoice, campCommander]) systems = withSystem(systems, s);
    const world = worldWith();
    const sim = new Simulation(world, fast, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    giveDevices(sim, [{ x: -18, z: 5 }]);
    combat(sim);
    const before = sim.guards.length;
    const ev = run(sim, 14);
    expect(ev.some((e) => e.type === 'reinforce')).toBe(true);
    expect(sim.guards.length).toBe(before + fast.brain.reinforce.count);
    const arrived = sim.guards.filter((g) => !commanderOf(sim)!.camp.roster.slice(0, before).some((m) => m.id === g.id));
    expect(arrived.length).toBe(fast.brain.reinforce.count);
    // They came up the road from the edge, and they have orders.
    expect(arrived.every((g) => g.brain!.task !== null || g.brain!.act === 'task')).toBe(true);
  });
});
