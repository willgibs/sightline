import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import type { AwarenessName, SimEvent } from '../src/sim/kernel/events';
import { Optic, neutralInput, type TickInput } from '../src/sim/kernel/input';
import { Faction } from '../src/sim/kernel/state';
import { withSystem, type System, type TickContext } from '../src/sim/kernel/systems';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { sunDirection } from '../src/sim/kernel/env';
import { giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { arm } from '../src/sim/game/shooting';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { player } from '../src/sim/game/entities';
import { testGuard, testWorld } from './fixtures';

/**
 * The other stimuli (A9): what lab B's sounds are heard as, the crack from the bullet's
 * path, a body seen, and a flash from a lens, each moving the guard who senses it by the
 * ladder, and each explained by the event that caused it.
 *
 * One sentry at the origin facing north (−z), open ground, the player 50 m east.
 */
const hz = T.sim.tickHz;

function setup(act: (ctx: TickContext) => void, emits: System['emits'], writes: System['writes'] = [], face: readonly [number, number] = [0, -1]): Simulation {
  const world = testWorld({
    size: 120,
    cell: 1,
    spawn: { x: 50, z: 0 },
    camp: {
      structures: [],
      guards: [testGuard({ id: 0, role: 'sentry', x: 0, y: 0, z: 0, faceX: face[0], faceZ: face[1], elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })],
      fenceHalf: 0,
    },
  });
  const drop: System = { name: 'test-stimulus', phase: 'commands', after: ['player-commands', 'rifle', 'sandbox-drops'], reads: [], writes, emits, run: act };
  let systems = withSystem(SYSTEMS, drop);
  const sim = new Simulation(world, T, systems);
  placePlayer(sim, 50, 0);
  giveSenses(sim);
  return sim;
}

interface Run {
  events: SimEvent[];
  states: AwarenessName[];
  sim: Simulation;
}

function run(sim: Simulation, seconds: number, input: (tick: number) => TickInput = () => neutralInput()): Run {
  const events: SimEvent[] = [];
  const states: AwarenessName[] = [];
  for (let i = 0; i < seconds * hz; i++) {
    const out = sim.step(input(sim.tick));
    events.push(...out);
    for (const e of out) if (e.type === 'alert') states.push(e.to);
  }
  return { events, states, sim };
}

/** A body lying `d` metres along (dx, dz) from the sentry, spawned at 0.5 s. */
function bodyAt(dx: number, dz: number, fellAt = 0): (ctx: TickContext) => void {
  return (ctx) => {
    if (ctx.tick !== 15) return;
    const t = ctx.tick / hz + fellAt;
    ctx.spawn((id) => ({ id, kind: 'remains' as const, faction: Faction.Camp, remains: { of: 99, post: 0, x: dx, y: 0, z: dz, yaw: 0, eye: T.bodies.guard.eyeHeight.prone, vx: 0, vz: 0, fell: t - 5, part: 'torso' as const } }));
  };
}

describe('a body', () => {
  it('in plain view is spotted once, with an event, and raises him to searching', () => {
    const sim = setup(bodyAt(0, -20), ['spotted'], ['entities']);
    // The debug view's overlay runs too (rule 8).
    sim.drawDebug = true;
    const r = run(sim, 6);
    const spotted = r.events.filter((e) => e.type === 'spotted');
    expect(spotted).toHaveLength(1);
    expect(spotted[0]).toMatchObject({ what: 'body' });
    expect(r.states).toEqual(expect.arrayContaining(['curious', 'suspicious', 'searching']));
    expect(r.states).not.toContain('combat');
    const alert = r.events.find((e) => e.type === 'alert' && e.to === 'searching')!;
    expect(alert).toMatchObject({ reason: 'body' });
    expect(r.sim.guards[0]!.senses!.percepts.some((p) => p.kind === 'body')).toBe(true);
    // He says so: the shouted line carries, and raises whoever hears it.
    expect(r.events.some((e) => e.type === 'bark' && e.radius === T.perception.barks.shout)).toBe(true);
  });

  it('behind him, or too far to make out, is not', () => {
    expect(run(setup(bodyAt(0, 20), [], ['entities']), 3).events.filter((e) => e.type === 'spotted')).toHaveLength(0);
    expect(run(setup(bodyAt(0, -55), [], ['entities']), 3).events.filter((e) => e.type === 'spotted')).toHaveLength(0);
  });
});

/** Emits one sound, at 1 s, `d` metres north of the sentry. */
const sound = (type: 'cry' | 'clatter' | 'report', d: number, radius: number) => (ctx: TickContext) => {
  if (ctx.tick !== hz) return;
  const base = { source: 99, x: 0, y: 1, z: -d, surface: Surface.Gravel, loudness: radius / T.noise.radiusPerUnit, radius };
  if (type === 'cry') ctx.emit({ type, ...base });
  else if (type === 'report') ctx.emit({ type, ...base, suppressed: 0 });
  else ctx.emit({ type, ...base, thrown: 98, speed: 5 });
};

describe('lab B\'s sounds, heard', () => {
  it('a comrade\'s cry is a voice, and raises him to searching', () => {
    const r = run(setup(sound('cry', 15, 40), ['cry']), 5);
    expect(r.events.find((e) => e.type === 'heard')).toMatchObject({ kind: 'voice' });
    expect(r.states).toContain('searching');
  });

  it('a shot\'s report is a shot, and raises him to searching', () => {
    const r = run(setup(sound('report', 40, 2400), ['report']), 5);
    expect(r.events.find((e) => e.type === 'heard')).toMatchObject({ kind: 'shot' });
    expect(r.states).toContain('searching');
  });

  it('a stone\'s clatter is only a sound: he looks, and doesn\'t search', () => {
    const r = run(setup(sound('clatter', 6, 40), ['clatter']), 6);
    expect(r.events.find((e) => e.type === 'heard')).toMatchObject({ kind: 'sound' });
    expect(r.states.length).toBeGreaterThan(0);
    expect(r.states).not.toContain('searching');
  });
});

describe('the sandbox', () => {
  it('drops a body where the view points, for a guard to find', () => {
    const sim = setup(() => undefined, []);
    const p = sim.player;
    // A point 20 m north of the sentry, on the ground, in the player's view.
    const dx = 0 - p.x;
    const dz = -20 - p.z;
    const dy = 0.02 - (p.y + p.eyeHeight);
    const l = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.asin(dy / l);
    const r = run(sim, 6, (tick) => {
      const f = neutralInput(yaw, pitch);
      if (tick === 30) f.commands.push({ kind: 'bodyDrop', lag: 0, yaw, pitch });
      return f;
    });
    expect(r.events.find((e) => e.type === 'spotted')).toMatchObject({ what: 'body' });
    expect(r.states).toContain('searching');
    expect(sim.index.of('remains')).toHaveLength(1);
  });
});

describe('the crack', () => {
  it('is heard from where the shock left the bullet\'s path, not from the shooter', () => {
    // A shot from 300 m north of the sentry, flying south along x = 8: it passes 8 m from him.
    const shoot = (ctx: TickContext) => {
      if (ctx.tick !== hz) return;
      ctx.emit({ type: 'shot', source: 1, x: 8, y: 1.7, z: -300, dx: 0, dy: 0, dz: 1, speed: 790, drag: 0.00065, wx: 0, wz: 0 });
    };
    const r = run(setup(shoot, ['shot']), 3);
    const heard = r.events.find((e) => e.type === 'heard')!;
    expect(heard).toMatchObject({ kind: 'shot' });
    if (heard.type !== 'heard') return;
    // Near the path: within a metre or two of x = 8 and some way north of him, a long way from the muzzle.
    expect(heard.z).toBeLessThan(0);
    expect(heard.z).toBeGreaterThan(-60);
    expect(Math.abs(heard.x - 8)).toBeLessThan(6);
    expect(r.states).toContain('searching');
  });
});

describe('a flash from a lens', () => {
  /** The player 50 m east of the sentry, armed, with binoculars up, aiming along `aim`. */
  function flash(aim: (sim: Simulation) => { yaw: number; pitch: number }): Run {
    // The sentry looks east, at the player.
    const sim = setup(() => undefined, [], [], [1, 0]);
    arm(player(sim.index), T);
    const { yaw, pitch } = aim(sim);
    return run(sim, 4, () => {
      const f = neutralInput(yaw, pitch);
      f.optic = Optic.Binoculars;
      return f;
    });
  }

  it('toward him with the sun behind it is spotted, once while it lasts, and makes him suspicious', () => {
    // Half way between the sun and the guard, from the lens: the mirror's condition.
    const r = flash((sim) => {
      const g = sim.guards[0]!;
      const p = sim.player;
      const to = { x: g.body.x - p.x, y: g.body.y + g.body.eyeHeight - (p.y + p.eyeHeight), z: g.body.z - p.z };
      const l = Math.hypot(to.x, to.y, to.z);
      const sun = sunDirection(sim.world.spec.env, 0, { x: 0, y: 0, z: 0 });
      const h = { x: to.x / l + sun.x, y: to.y / l + sun.y, z: to.z / l + sun.z };
      const n = Math.hypot(h.x, h.y, h.z);
      return { yaw: Math.atan2(-h.x, -h.z), pitch: Math.asin(h.y / n) };
    });
    const spotted = r.events.filter((e) => e.type === 'spotted');
    expect(spotted).toHaveLength(1);
    expect(spotted[0]).toMatchObject({ what: 'glint' });
    expect(r.states).toContain('suspicious');
    expect(r.states).not.toContain('searching');
    const a = r.events.find((e) => e.type === 'alert' && e.to === 'suspicious')!;
    expect(a).toMatchObject({ reason: 'glint' });
  });

  it('pointed away from him is not', () => {
    const r = flash(() => ({ yaw: Math.PI / 2, pitch: 0 }));
    expect(r.events.filter((e) => e.type === 'spotted')).toHaveLength(0);
  });
});
