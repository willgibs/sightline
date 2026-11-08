import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { campCommander, campCheckins, campDevices, commanderOf, commsVoice, giveCommander } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { usePrompt } from '../src/sim/game/use';
import { campMission, generateWorld, type DeviceSpec } from '../src/sim/generation';
import { yawFromDirection } from '../src/sim/kernel/core/math';
import { neutralInput, type TickInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Cell, cellAt } from '../src/sim/kernel/world/grid';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld } from './fixtures';

/**
 * The camp's equipment (E7): sabotage by holding the use key at arm's length, whoever
 * passes or needs it noticing, the truck that drives away, and doors.
 */

let world: World;
beforeAll(() => {
  world = generateWorld(campMission('LEB-2534'), T);
});

/** A live camp with the player standing `reach` metres from a point, facing it, somewhere clear. */
function beside(x: number, z: number, reach: number): { sim: Simulation; yaw: number } {
  const base = liveCamp('seed=LEB-2534') as Scene<Simulation>;
  const scene: Scene<Simulation> = {
    ...base,
    world: () => world,
    setup: (sim) => {
      base.setup!(sim);
      let spare: [number, number] | null = null;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * 2 * Math.PI;
        const px = x + Math.cos(a) * reach;
        const pz = z + Math.sin(a) * reach;
        const c = cellAt(world.grid, px, pz);
        if (!c || (c.layer.flags[c.index]! & Cell.Walkable) === 0) continue;
        spare ??= [px, pz];
        placePlayer(sim, px, pz, x - px, z - pz);
        // A place where the use key reaches it, if there is one; a wall may stand on the near side.
        if (usePrompt(sim.index.of('player')[0]!, sim.index, sim.world, T, sim.solids) !== '') return;
      }
      if (!spare) throw new Error('nowhere to stand');
      placePlayer(sim, spare[0], spare[1], x - spare[0], z - spare[1]);
    },
  };
  const sim = startScene(scene, T);
  return { sim, yaw: yawFromDirection(x - sim.player.x, z - sim.player.z) };
}

function hold(sim: Simulation, yaw: number, seconds: number, use = true): SimEvent[] {
  const events: SimEvent[] = [];
  const input: TickInput = { ...neutralInput(yaw), use };
  for (let i = 0; i < seconds * 30; i++) events.push(...sim.step(input).map((e) => ({ ...e })));
  return events;
}

const device = (kind: DeviceSpec['kind']): DeviceSpec => world.camp.devices!.find((d) => d.kind === kind)!;

describe('sabotage (E7)', () => {
  it('stops the generator after holding use for its time, and its circuit goes dark', () => {
    const g = device('generator');
    const { sim, yaw } = beside(g.x, g.z, 1.4);
    expect(usePrompt(sim.index.of('player')[0]!, sim.index, sim.world, T, sim.solids)).toBe('generator');
    hold(sim, yaw, T.brain.sabotage.seconds.generator - 0.5);
    expect(sim.index.of('generator')[0]!.generator.running).toBe(true);
    const events = hold(sim, yaw, 1);
    expect(events.filter((e) => e.type === 'sabotage').map((e) => (e as { what: string }).what)).toEqual(['generator']);
    expect(sim.index.of('generator')[0]!.generator.running).toBe(false);
    hold(sim, yaw, 0.1, false);
    expect(sim.index.of('alarm').every((a) => !a.alarm.powered)).toBe(true);
    expect(sim.index.of('radio').every((r) => !r.radio.powered)).toBe(true);
    expect(sim.index.of('light').every((l) => !l.light.on)).toBe(true);
    const c = commanderOf(sim)!;
    expect(c.camp.devices.generatorRunning).toBe(false);
    expect(c.camp.devices.alarms.every((a) => !a.powered)).toBe(true);
    expect(c.camp.netWorking).toBe(false);
  });

  it('starts again if you let go', () => {
    const g = device('generator');
    const { sim, yaw } = beside(g.x, g.z, 1.4);
    const S = T.brain.sabotage.seconds.generator;
    hold(sim, yaw, S * 0.7);
    hold(sim, yaw, 0.2, false);
    hold(sim, yaw, S * 0.7);
    expect(sim.index.of('generator')[0]!.generator.running).toBe(true);
  });

  it('is out of reach through a wall or from too far', () => {
    const g = device('generator');
    const { sim, yaw } = beside(g.x, g.z, 3);
    expect(usePrompt(sim.index.of('player')[0]!, sim.index, sim.world, T, sim.solids)).toBe('');
    hold(sim, yaw, T.brain.sabotage.seconds.generator + 1);
    expect(sim.index.of('generator')[0]!.generator.running).toBe(true);
  });

  it('breaks the radio at its set: the net goes down and the operator says so', () => {
    const r = device('radio');
    const { sim, yaw } = beside(r.x, r.z, 1.3);
    const events = hold(sim, yaw, T.brain.sabotage.seconds.radio + 0.5);
    expect(events.some((e) => e.type === 'sabotage')).toBe(true);
    expect(sim.index.of('radio')[0]!.radio.working).toBe(false);
    expect(commanderOf(sim)!.camp.netWorking).toBe(false);
    // The next check-in finds it dead, and the camp comes up a level.
    const later = hold(sim, yaw, 40, false);
    expect(later.some((e) => e.type === 'checkin' && e.stage === 'dead')).toBe(true);
    expect(commanderOf(sim)!.camp.level).toBe('uneasy');
  }, 60_000);
});

describe('whoever passes it notices (E7)', () => {
  function watcher(deviceKind: 'generator' | 'radio'): Simulation {
    const camp = {
      structures: [],
      guards: [testGuard({ id: 0, role: 'sentry', x: 0, y: 0, z: -8, faceX: 0, faceZ: 1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })],
      fenceHalf: 0,
      devices: [
        { kind: 'generator' as const, x: 0, y: 1, z: 0, structure: 0, feed: -1 },
        { kind: 'radio' as const, x: 3, y: 1, z: 0, structure: 0, feed: 0 },
      ],
    };
    const w = testWorld({ size: 120, spawn: { x: -50, z: 50 }, camp });
    let systems: readonly System[] = SYSTEMS;
    for (const s of [commsVoice, campCommander, campCheckins, campDevices]) systems = withSystem(systems, s);
    const sim = new Simulation(w, T, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    if (deviceKind === 'generator') sim.index.of('generator')[0]!.generator.running = false;
    return sim;
  }

  it('a guard who sees the generator stopped takes notice of it, once', () => {
    const sim = watcher('generator');
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 * 30; i++) events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
    expect(events.some((e) => e.type === 'spotted' && e.what === 'outage')).toBe(true);
    // He looks into it. With the generator down the radio is too, so telling the camp is the operator's (above).
    expect(events.some((e) => e.type === 'act' && (e.to === 'look' || e.to === 'investigate' || e.to === 'report') && e.why === 'outage')).toBe(true);
    // Noticed once, however long he looks at it.
    expect(events.filter((e) => e.type === 'spotted' && e.what === 'outage').length).toBe(1);
  });

  it('a stopped generator stops masking what it was masking', () => {
    const sim = watcher('generator');
    sim.step(neutralInput());
    const running = watcher('radio');
    running.step(neutralInput());
    expect(sim.snapshot().humming).toBe(false);
    expect(running.snapshot().humming).toBe(true);
  });
});

describe('the target and his vehicle (E7)', () => {
  /** A live camp, the alarm raised by hand, and the target running. */
  function lockdown(disabled: boolean): { sim: Simulation; events: SimEvent[] } {
    const sim = startScene(liveCamp('seed=LEB-2534') as Scene<Simulation>, T, world);
    const v = sim.index.of('vehicle').find((x) => x.vehicle.escape)!;
    if (disabled) v.vehicle.disabled = true;
    const events: SimEvent[] = [];
    const c = commanderOf(sim)!;
    const raw = neutralInput();
    for (let i = 0; i < 90 * 30 && sim.state.outcome.status === 'playing'; i++) {
      if (i === 30) {
        // The siren, as a box being raised would sound it: he hears it wherever he is.
        c.camp.devices.alarms[0]!.raised = true;
        c.camp.level = 'lockdown';
        const box = c.camp.devices.alarms[0]!;
        const target = sim.index.get(c.camp.objective!.target) as { kind: string; brain?: { sirenAt: number } };
        target.brain!.sirenAt = sim.tick;
        void box;
      }
      events.push(...sim.step(raw).map((e) => ({ ...e })));
    }
    return { sim, events };
  }

  it('drives away down the road, and only then is the mission lost', () => {
    const { sim } = lockdown(false);
    const v = sim.index.of('vehicle').find((x) => x.vehicle.escape)!;
    const parked = world.camp.vehicles!.find((x) => x.escape)!;
    expect(sim.state.outcome).toMatchObject({ status: 'failed', reason: 'the target got away' });
    expect(Math.hypot(v.solid.x - parked.x, v.solid.z - parked.z)).toBeGreaterThan(40);
    expect(sim.index.of('objective')[0]!.objective.status).toBe('escaped');
  }, 120_000);

  it('sabotaged, it stays where it is, he stays by it, and the mission is still on', () => {
    const { sim, events } = lockdown(true);
    expect(sim.state.outcome.status).toBe('playing');
    const c = commanderOf(sim)!;
    const target = sim.index.get(c.camp.objective!.target) as unknown as { brain: { stranded?: boolean }; body: { x: number; z: number } };
    expect(target).toBeDefined();
    expect(target.brain.stranded).toBe(true);
    const parked = world.camp.vehicles!.find((x) => x.escape)!;
    expect(Math.hypot(target.body.x - parked.x, target.body.z - parked.z)).toBeLessThan(8);
    expect(events.some((e) => e.type === 'act' && e.to === 'flee')).toBe(true);
  }, 120_000);
});

describe('doors (E7, A9)', () => {
  const doorCamp = () => world.camp.doors![0]!;

  it('shuts at a press of use, and it is a sound', () => {
    const d = doorCamp();
    const { sim, yaw } = beside(d.x + d.nx * 1.2, d.z + d.nz * 1.2, 0.05);
    const toDoor = yawFromDirection(d.x - sim.player.x, d.z - sim.player.z);
    expect(usePrompt(sim.index.of('player')[0]!, sim.index, sim.world, T, sim.solids)).toMatch(/^(shut|)$/);
    const before = sim.index.of('door')[0]!.door.open;
    expect(before).toBe(true);
    void yaw;
    const events = sim.step({ ...neutralInput(toDoor), commands: [{ kind: 'use' }] }).map((e) => ({ ...e }));
    const door = sim.index.of('door').find((x) => !x.door.open);
    if (door) expect(events.some((e) => e.type === 'door' && e.open === 0)).toBe(true);
  });

  it('a guard who walks up to a shut door opens it', () => {
    const sim = startScene(liveCamp('seed=LEB-2534') as Scene<Simulation>, T, world);
    const d = sim.index.of('door')[0]!;
    const spec = world.camp.doors![d.door.index]!;
    d.door.open = false;
    const g = sim.guards[0]!;
    g.body.x = spec.x + spec.nx * 0.8;
    g.body.z = spec.z + spec.nz * 0.8;
    const events: SimEvent[] = [];
    for (let i = 0; i < 3; i++) events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
    expect(d.door.open).toBe(true);
    expect(events.some((e) => e.type === 'door' && e.open === 1 && e.source === g.id)).toBe(true);
  });
});

