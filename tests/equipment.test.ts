import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { campCommander, campCheckins, campDevices, commanderOf, commsVoice, giveCommander } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { usePrompt } from '../src/sim/game/use';
import { clearOfBodies } from '../src/sim/body';
import { truckRoute } from '../src/sim/game/camp';
import { vehicleDrive } from '../src/sim/game/escape';
import { plainTuning } from '../src/lab/experiments/variety';
import { campMission, generateWorld, type DeviceSpec } from '../src/sim/generation';
import { yawFromDirection } from '../src/sim/kernel/core/math';
import { neutralInput, type TickInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { Recorder } from '../src/sim/kernel/record/recording';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Blocks, overlapsBody, type Collider, type ColliderInput, type RayHit } from '../src/sim/kernel/world/colliders';
import { Cell, cellAt } from '../src/sim/kernel/world/grid';
import { solidId } from '../src/sim/kernel/world/solids';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld, tuningCopy } from './fixtures';

/**
 * The camp's equipment (E7): sabotage by holding the use key at arm's length, whoever
 * passes or needs it noticing, the truck that drives away, and doors.
 */

let world: World;
beforeAll(() => {
  // The plain compound: the tests below place the player by devices and doors and let guards
  // walk their routines, so what they stand on is pinned to the camp they were written on.
  world = generateWorld(campMission('LEB-2534'), plainTuning(T));
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

/** Moves the player mid-run, as the tests of what happens next need. */
function teleport(sim: Simulation, x: number, z: number): void {
  sim.player.x = x;
  sim.player.z = z;
  sim.player.y = sim.world.terrain.heightAt(x, z);
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

  it('is out of reach from too far', () => {
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

describe('only what a hand can reach (E7)', () => {
  const screen = (x: number, z: number, hx: number, hz: number): ColliderInput => ({ kind: 'box', x, z, y0: -1, y1: 4, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });

  /** A generator at the origin and a jeep 20 m east, lying along x; with or without something between each and where the player will stand. */
  function yard(walled: boolean): Simulation {
    const camp = {
      structures: [],
      guards: [],
      fenceHalf: 0,
      devices: [{ kind: 'generator' as const, x: 0, y: 1, z: 0, structure: 9, feed: -1 }],
      vehicles: [{ kind: 'jeep' as const, x: 20, y: 0, z: 0, fx: 1, fz: 0, length: 4.4, width: 1.9, height: 1.8, escape: true }],
    };
    return new Simulation(testWorld({ size: 120, spawn: { x: -50, z: 50 }, camp, colliders: walled ? [screen(0, 0.75, 3, 0.05), screen(20, 1.6, 4, 0.05)] : [] }), T);
  }

  function prompt(sim: Simulation, x: number, z: number, faceX: number, faceZ: number): string {
    placePlayer(sim, x, z, faceX, faceZ);
    return usePrompt(sim.index.of('player')[0]!, sim.index, sim.world, T, sim.solids);
  }

  it('reaches the generator, but not through a wall', () => {
    expect(prompt(yard(false), 0, 1.4, 0, -1)).toBe('generator');
    expect(prompt(yard(true), 0, 1.4, 0, -1)).toBe('');
  });

  it('reaches a vehicle at its nearest side, whichever that is, and not through a wall', () => {
    expect(prompt(yard(false), 20, 2.2, 0, -1)).toBe('vehicle');
    expect(prompt(yard(false), 23.6, 0, -1, 0)).toBe('vehicle');
    // Nearer its centre than the end above is, and further from its side than a hand goes.
    expect(prompt(yard(false), 20, 3.2, 0, -1)).toBe('');
    expect(prompt(yard(true), 20, 2.2, 0, -1)).toBe('');
  });

  it('cannot be worked through a wall, however long you hold', () => {
    const sim = yard(true);
    placePlayer(sim, 20, 2.2, 0, -1);
    hold(sim, yawFromDirection(0, -1), T.brain.sabotage.seconds.vehicle + 1);
    expect(sim.index.of('vehicle')[0]!.vehicle.disabled).toBeFalsy();
  });
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
    // The game records every tick: a reaction it can't write down ends the run.
    const recorder = new Recorder(sim);
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 * 30; i++) {
      const tick = sim.step(neutralInput());
      recorder.record(sim, tick);
      events.push(...tick.map((e) => ({ ...e })));
    }
    expect(events.some((e) => e.type === 'spotted' && e.what === 'outage')).toBe(true);
    // He looks into it. With the generator down the radio is too, so telling the camp is the operator's (above).
    expect(events.some((e) => e.type === 'act' && (e.to === 'look' || e.to === 'investigate' || e.to === 'report') && e.why === 'outage')).toBe(true);
    // Noticed once, however long he looks at it.
    expect(events.filter((e) => e.type === 'spotted' && e.what === 'outage').length).toBe(1);
  });

  it('someone in front of him is news, whatever he noticed before', () => {
    const sim = watcher('generator');
    for (let i = 0; i < 12 * 30 && !sim.step(neutralInput()).some((e) => e.type === 'spotted' && e.what === 'outage'); i++);
    expect(sim.guards[0]!.senses!.percepts.some((p) => p.kind === 'outage')).toBe(true);
    teleport(sim, 2, -3);
    let said: string | undefined;
    for (let i = 0; i < 20 * 30 && said === undefined; i++) for (const e of sim.step(neutralInput())) if (e.type === 'call' && e.say !== 'claim') said = e.say;
    expect(said).toBe('contact');
  }, 60_000);

  it('a stopped generator stops masking what it was masking', () => {
    // A guard three metres from the generator, and someone crouch-walking three metres from him:
    // only the hum hides those steps.
    const heard = (running: boolean): boolean => {
      const camp = {
        structures: [{ kind: 'generator' as const, colliders: [0] }],
        guards: [testGuard({ id: 0, role: 'sentry', x: 0, y: 0, z: 3, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })],
        fenceHalf: 0,
        devices: [{ kind: 'generator' as const, x: 0, y: 1, z: 0, structure: 0, feed: -1 }],
      };
      const box: ColliderInput = { kind: 'box', x: 0, z: 0, y0: 0, y1: 1.5, hx: 0.8, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal };
      const w = testWorld({ size: 120, spawn: { x: -50, z: 50 }, camp, colliders: [box] });
      const sim = new Simulation(w, T);
      giveSenses(sim);
      sim.index.of('generator')[0]!.generator.running = running;
      placePlayer(sim, 0, 6, 1, 0);
      let any = false;
      for (let i = 0; i < 4 * 30; i++) if (sim.step({ ...neutralInput(yawFromDirection(1, 0)), crouch: true, moveZ: 1 }).some((e) => e.type === 'heard')) any = true;
      return any;
    };
    expect(heard(true), 'heard over the hum').toBe(false);
    expect(heard(false), 'not heard once it stopped').toBe(true);
  });
});

describe('the target and his vehicle (E7)', () => {
  /** A live camp that protects nobody, the alarm raised by hand, and the target running: lab E's target, who goes for his vehicle at the siren. */
  function lockdown(disabled: boolean): { sim: Simulation; events: SimEvent[] } {
    const sim = startScene(liveCamp('seed=LEB-2534&off=protect') as Scene<Simulation>, T, world);
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
    expect(sim.state.outcome).toMatchObject({ status: 'failed', reason: expect.stringMatching(/^the target got away/) });
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

describe('reinforcements (E8)', () => {
  it('hold off rather than appear on top of someone', () => {
    const route = truckRoute(world, T)!;
    const base = liveCamp('seed=LEB-2534') as Scene<Simulation>;
    const call: System = { name: 'test-call-truck', phase: 'world', reads: [], writes: ['schedule'], emits: [], run: (ctx) => { if (ctx.tick === 1) ctx.schedule(0.1, 'reinforce-arrive', 0, 0); } };
    const scene: Scene<Simulation> = { ...base, world: () => world, systems: [...(base.systems ?? []), call], setup: (sim) => { base.setup!(sim); placePlayer(sim, route[0]!.x, route[0]!.z, 1, 0); } };
    const sim = startScene(scene, T);
    const raw = neutralInput();
    const at = { x: sim.player.x, z: sim.player.z };
    const truck = () => sim.index.of('vehicle').find((v) => v.vehicle.index === -1);
    for (let i = 0; i < 30; i++) sim.step(raw);
    expect(truck()).toBeUndefined();
    expect(Math.hypot(sim.player.x - at.x, sim.player.z - at.z)).toBeLessThan(0.05);
    teleport(sim, route[2]!.x + 8, route[2]!.z);
    for (let i = 0; i < 45; i++) sim.step(raw);
    expect(truck()).toBeDefined();
  }, 60_000);

  it('swerve round someone at the side of the road, but only as far as they will go off it', () => {
    /**
     * A truck coming along the x axis, and someone standing just inside its left-hand side:
     * you, since one of the camp's own men would step out of its way (tests/takedown.test.ts).
     */
    const drive = (tuning: Tuning): { widest: number; x: number } => {
      const guards = [testGuard({ id: 0, role: 'sentry', x: 0, y: 0, z: 40, faceX: -1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })];
      const camp = { structures: [], guards, fenceHalf: 0, vehicles: [{ kind: 'truck' as const, x: -30, y: 0, z: 0, fx: 1, fz: 0, length: 6.2, width: 2.3, height: 2.9, escape: false }] };
      let systems: readonly System[] = SYSTEMS;
      for (const s of [campDevices, vehicleDrive]) systems = withSystem(systems, s);
      const sim = new Simulation(testWorld({ size: 120, spawn: { x: 0, z: 1 }, camp }), tuning, systems);
      const v = sim.index.of('vehicle')[0]!;
      v.vehicle.driving = { route: [{ x: -30, z: 0 }, { x: 40, z: 0 }], leg: 1, waited: 0, then: 'dismount', cause: 0 };
      let widest = 0;
      for (let i = 0; i < 20 * 30 && v.vehicle.driving; i++) {
        sim.step(neutralInput());
        widest = Math.max(widest, Math.abs(v.solid.z));
      }
      expect(v.vehicle.driving).toBeUndefined();
      return { widest, x: v.solid.x };
    };
    const round = drive(T);
    expect(round.widest).toBeGreaterThan(0.5);
    expect(round.x).toBeGreaterThan(30);
    const narrow = tuningCopy();
    narrow.brain.alarm.flee.swerve = 0.25;
    const held = drive(narrow);
    expect(held.widest).toBeLessThanOrEqual(0.25);
    expect(held.x).toBeLessThan(0);
  }, 60_000);

  it('come by truck up the road, and get down short of the gate', () => {
    const sim = startScene(liveCamp('seed=LEB-2534') as Scene<Simulation>, T, world);
    sim.index.of('vehicle').find((x) => x.vehicle.escape)!.vehicle.disabled = true;
    const before = sim.guards.length;
    const c = commanderOf(sim)!;
    const raw = neutralInput();
    let arrived: SimEvent | undefined;
    let seenOnRoad = false;
    for (let i = 0; i < (T.brain.reinforce.delay + 30) * 30 && !arrived; i++) {
      if (i === 30) c.camp.level = 'lockdown';
      for (const e of sim.step(raw)) if (e.type === 'reinforce') arrived = { ...e };
      if (sim.index.of('vehicle').some((v) => v.vehicle.index === -1 && v.vehicle.driving)) seenOnRoad = true;
    }
    expect(seenOnRoad, 'no truck on the road').toBe(true);
    expect(arrived, 'nobody arrived').toBeDefined();
    const when = arrived!.tick / 30;
    expect(when).toBeGreaterThan(T.brain.reinforce.delay - 5);
    expect(when).toBeLessThan(T.brain.reinforce.delay + 15);
    expect(sim.guards.length).toBe(before + T.brain.reinforce.count);
    const gate = world.camp.layout!.skeleton.escape[3]!;
    const r = arrived as Extract<SimEvent, { type: 'reinforce' }>;
    expect(Math.hypot(r.x - gate.x, r.z - gate.z)).toBeLessThan(T.brain.reinforce.truck.stopShort + 32);
  }, 120_000);
});

describe('doors (E7, A9)', () => {
  // A door no guard's route goes through, so nobody opens it again while the test leans on it.
  const doorCamp = () => {
    const doors = world.camp.doors!;
    const quiet = doors.find((d) => !world.camp.guards.some((g) => (g.route ?? [{ x: g.x, z: g.z }]).some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 2.5)));
    return quiet ?? doors[0]!;
  };

  it('shuts at a press of use, with a sound, and then stops a body and a bullet', () => {
    const d = doorCamp();
    const { sim } = beside(d.x + d.nx * 1.2, d.z + d.nz * 1.2, 0.05);
    const toDoor = yawFromDirection(d.x - sim.player.x, d.z - sim.player.z);
    sim.step(neutralInput(toDoor));
    const player = sim.index.of('player')[0]!;
    expect(usePrompt(player, sim.index, sim.world, T, sim.solids)).toBe('shut');
    const door = sim.index.of('door').find((x) => x.door.index === world.camp.doors!.indexOf(d))!;
    expect(door.door.open).toBe(true);
    const events = sim.step({ ...neutralInput(toDoor), commands: [{ kind: 'use' }] }).map((e) => ({ ...e }));
    expect(door.door.open).toBe(false);
    expect(events.some((e) => e.type === 'door' && e.open === 0 && e.source === player.id)).toBe(true);
    // Its shape changed and its id didn't: the id is how the motor and the renderer find it.
    expect(door.solid.id).toBe(solidId(door.id));
    const away = Math.hypot(d.x - sim.player.x, d.z - sim.player.z);
    const hit: RayHit = { dist: Infinity, id: -1 };
    sim.solids.raycast(sim.player.x, sim.player.y + 1.2, sim.player.z, (d.x - sim.player.x) / away, 0, (d.z - sim.player.z) / away, away + 1, Blocks.All, hit);
    expect(hit.id).toBe(door.solid.id);
    const side = (): number => (sim.player.x - d.x) * d.nx + (sim.player.z - d.z) * d.nz;
    const start = side();
    for (let i = 0; i < 90; i++) {
      sim.step({ ...neutralInput(toDoor), moveZ: 1 });
      expect(side() * start, `through the door at tick ${i}`).toBeGreaterThan(0);
    }
    expect(Math.abs(side())).toBeLessThan(Math.abs(start) - 0.3);
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

describe('getting out (the owner\'s call, Nov 8)', () => {
  /** A live camp whose target falls at the first tick, and the player `from` metres from the way out. */
  function afterTheKill(from: number, kill = true): { sim: Simulation; events: SimEvent[]; run: (seconds: number) => void } {
    const base = liveCamp('seed=LEB-2534') as Scene<Simulation>;
    const road = truckRoute(world, T)!;
    const exit = road[0]!;
    // Up the road from the way out, so there's ground to stand on, facing it.
    const ux = (road[1]!.x - exit.x) / Math.hypot(road[1]!.x - exit.x, road[1]!.z - exit.z);
    const uz = (road[1]!.z - exit.z) / Math.hypot(road[1]!.x - exit.x, road[1]!.z - exit.z);
    const killer: System = {
      name: 'test-kill',
      phase: 'world',
      after: ['camp-power', 'camp-devices', 'vehicle-drive'],
      reads: [],
      writes: ['entities'],
      emits: ['death'],
      run: (ctx) => {
        if (!kill || ctx.tick !== 1) return;
        const victim = commanderOf(ctx)!.camp.objective!.target;
        ctx.despawn(victim);
        ctx.emit({ type: 'death', source: ctx.state.entities[0]!.id, victim, remains: 0, post: 0, part: 'head', x: 0, y: 0, z: 0 });
      },
    };
    const scene: Scene<Simulation> = { ...base, world: () => world, systems: [...(base.systems ?? []), killer], setup: (s) => (base.setup!(s), placePlayer(s, exit.x + ux * from, exit.z + uz * from, -ux, -uz)) };
    const sim = startScene(scene, T);
    const events: SimEvent[] = [];
    const yaw = yawFromDirection(-ux, -uz);
    return {
      sim,
      events,
      run: (seconds) => {
        const input = { ...neutralInput(yaw), moveZ: 1 };
        for (let i = 0; i < seconds * 30 && sim.state.outcome.status === 'playing'; i++) events.push(...sim.step(input).map((e) => ({ ...e })));
      },
    };
  }

  it('the target falling is not the end: it says to get out, and the run goes on', () => {
    const { sim, events, run } = afterTheKill(200);
    run(2);
    expect(events.some((e) => e.type === 'objective' && e.stage === 'get-out')).toBe(true);
    expect(commanderOf(sim)!.camp.objective!.status).toBe('done');
    expect(sim.state.outcome.status).toBe('playing');
  }, 60_000);

  it('reaching the way out with the target down ends the mission', () => {
    const { sim, run } = afterTheKill(T.brain.getOut.radius + 6);
    run(6);
    expect(sim.state.outcome).toMatchObject({ status: 'succeeded', reason: 'the target is down, and you got out' });
  }, 60_000);

  it('reaching it with the target alive ends nothing', () => {
    const { sim, run } = afterTheKill(T.brain.getOut.radius + 6, false);
    run(6);
    expect(sim.state.outcome.status).toBe('playing');
  }, 60_000);
});

describe('what moves never moves into a body (rule 10)', () => {
  it('a lying body counts along its whole length', () => {
    const sim = new Simulation(testWorld({ size: 60 }), T);
    const b = sim.index.of('player')[0]!.body;
    for (let i = 0; i < 300 && b.lying < 1; i++) sim.step({ ...neutralInput(0), prone: true });
    expect(b.lying).toBe(1);
    // At his feet (he faces north, so south of his chest), and clear of the one circle a standing body would be.
    const atFeet: Collider = { id: 0, kind: 'box', x: b.x, z: b.z + 1, y0: b.y - 1, y1: b.y + 3, hx: 0.2, hz: 0.2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    expect(overlapsBody(atFeet, b.x, b.y, b.z, T.bodies.player.radius + 0.02, 2)).toBe(false);
    expect(clearOfBodies(atFeet, sim.state.entities, T.bodies)).toBe(false);
    expect(clearOfBodies({ ...atFeet, z: b.z + 3 }, sim.state.entities, T.bodies)).toBe(true);
  });
});
