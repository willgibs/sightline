import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { campRules } from '../src/sim/game/combat';
import { campCommander, commanderOf, commsVoice, cutPower, giveCommander, giveDevices, giveObjective } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem, type System } from '../src/sim/kernel/systems';
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
  for (const s of [commsVoice, campCommander]) systems = withSystem(systems, s);
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

describe('once the alarm is up (E7)', () => {
  it('nobody runs for a box he has heard sounding', () => {
    const sim = campy(worldWith([G, { ...G, id: 1, x: 6, z: -8 }]), [{ x: -18, z: 5 }]);
    combat(sim);
    const ev = run(sim, 40);
    const raised = ev.find((e) => e.type === 'alarm' && e.stage === 'raised');
    expect(raised).toBeDefined();
    // Allow for the sound's flight and the think after it: then, no more runs, past any cooldown.
    const late = ev.filter((e) => e.type === 'act' && e.to === 'alarm' && e.t > raised!.t + 1.5);
    expect(late).toEqual([]);
    expect(sim.guards.every((g) => g.brain!.sirenAt >= 0)).toBe(true);
  });

  it('holds lockdown: the camp does not stand down while the alarm is up', () => {
    const sim = campy(worldWith(), [{ x: -18, z: 5 }]);
    combat(sim);
    const ev = run(sim, 12 + T.brain.camp.search.maxSeconds + 8);
    const camp = commanderOf(sim)!.camp;
    expect(camp.level).toBe('lockdown');
    expect(ev.filter((e) => e.type === 'level' && e.to === 'lockdown').length).toBe(1);
    expect(ev.some((e) => e.type === 'level' && e.from === 'lockdown')).toBe(false);
  });
});

describe('the target at lockdown (E7)', () => {
  const VEHICLE = { x: 22, z: -24 };

  function withTarget(extra: System[] = []): { sim: Simulation; target: number } {
    const world = worldWith([G, { ...G, id: 1, role: 'target' as never, x: 10, z: 2 }]);
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander, campRules, ...extra]) systems = withSystem(systems, s);
    const sim = new Simulation(world, T, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    giveDevices(sim, [{ x: -18, z: 5 }], VEHICLE);
    const target = sim.guards.find((g) => world.camp.guards[g.guard.spawn]!.role === 'target')!;
    giveObjective(sim, target.id);
    return { sim, target: target.id };
  }

  it('hears the siren and runs for his vehicle, and if he reaches it the mission is lost', () => {
    const { sim, target } = withTarget();
    combat(sim);
    const ev = run(sim, 30);
    const flee = ev.find((e) => e.type === 'act' && e.to === 'flee');
    expect(flee).toBeDefined();
    expect(flee && flee.type === 'act' && flee.why).toBe('siren');
    expect(flee!.source).toBe(target);
    // A real run through the motor, after the alarm and not before.
    const raised = ev.find((e) => e.type === 'alarm' && e.stage === 'raised')!;
    expect(flee!.t).toBeGreaterThanOrEqual(raised.t);
    expect(commanderOf(sim)!.camp.objective!.status).toBe('escaped');
    expect(sim.guards.some((g) => g.id === target)).toBe(false);
    expect(ev.some((e) => e.type === 'outcome' && e.status === 'failed')).toBe(true);
  });

  it('dropped before he gets there, the objective is done', () => {
    const shoot: System = {
      name: 'test-drop-target',
      phase: 'commands',
      after: ['player-commands', 'rifle', 'sandbox-drops'],
      reads: ['guard.body', 'commander.camp'],
      writes: ['entities'],
      emits: ['death'],
      run(ctx) {
        const c = commanderOf(ctx)!;
        const g = ctx.index.get(c.camp.objective!.target);
        if (!g || g.kind !== 'guard' || g.brain!.act !== 'flee' || ctx.tick - g.brain!.since < 30) return;
        ctx.emit({ type: 'death', source: g.id, victim: g.id, remains: 0, post: g.guard.spawn, part: 'torso', x: g.body.x, y: g.body.y, z: g.body.z });
        ctx.despawn(g.id);
      },
    };
    const { sim } = withTarget([shoot]);
    combat(sim);
    const ev = run(sim, 30);
    expect(commanderOf(sim)!.camp.objective!.status).toBe('done');
    expect(ev.some((e) => e.type === 'outcome' && e.status === 'succeeded')).toBe(true);
    expect(ev.some((e) => e.type === 'outcome' && e.status === 'failed')).toBe(false);
  });
});

describe('an order (E5)', () => {
  it('lasts as long as the walk: he is still on it after the order would have lapsed', () => {
    const sim = campy(worldWith(), []);
    const g = sim.guards[0]!;
    g.brain!.task = { id: 1, kind: 'search', x: 62, z: -62, issued: 0, cause: 0 };
    g.brain!.thinkAt = 0;
    run(sim, T.brain.camp.keepOrder + 5);
    expect(g.brain!.act).toBe('task');
    expect(g.brain!.task).not.toBeNull();
    expect(Math.hypot(g.body.x, g.body.z)).toBeGreaterThan(30);
  });

  it('that a guard never took up lapses, and is forgotten', () => {
    const sim = campy(worldWith(), []);
    const g = sim.guards[0]!;
    // He can't take it up while he's in combat, and by the time he's out of it it's old.
    combat(sim);
    g.brain!.task = { id: 1, kind: 'search', x: -70, z: 60, issued: 0, cause: 0 };
    run(sim, T.brain.camp.keepOrder + 3);
    expect(g.brain!.act).not.toBe('task');
    expect(g.brain!.task).toBeNull();
  });
});

describe('reinforcements (E8)', () => {
  it('lockdown calls a squad that arrives after its delay, and hunts', () => {
    const fast = structuredClone(T);
    fast.brain.reinforce.delay = 3;
    let systems = SYSTEMS;
    for (const s of [commsVoice, campCommander]) systems = withSystem(systems, s);
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
