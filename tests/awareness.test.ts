import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import type { AwarenessName, SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { createSenses, stepLadder, stimulate, type Awareness, type Stimulus } from '../src/sim/perception';
import { giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { testGuard, testWorld } from './fixtures';

/**
 * The awareness ladder (A7): rises wait for the dwell of the state they rise from, one
 * state at a time; falls step down one state at a time after each ramp-down, with spread
 * from the guard's own stream; grace periods; and a guard who searched settles sharper.
 */

const A = T.perception.awareness;
const hz = T.sim.tickHz;

function fresh(): Awareness {
  return createSenses().awareness;
}

const sound = (level: number): Stimulus => ({ kind: 'sound', level, x: 5, y: 0, z: 5, cause: 7, reason: 'heard' });

/** Runs the ladder from `from` to `to` (ticks), with the meter given per tick, recording each change. */
function climb(a: Awareness, meter: (tick: number) => number, from: number, to: number, draw: () => number): Array<{ tick: number; to: AwarenessName }> {
  const out: Array<{ tick: number; to: AwarenessName }> = [];
  for (let tick = from; tick <= to; tick++) {
    const c = stepLadder(a, meter(tick), 1, tick, T, draw);
    if (c) out.push({ tick, to: c.to });
  }
  return out;
}

describe('the awareness ladder', () => {
  const rng = new Rng('LADDER', 'draws');
  const draw = (): number => rng.next();

  it('rises one state at a time, each after the dwell of the one before', () => {
    const a = fresh();
    // The meter jumps to 1 at tick 30 and stays.
    const changes = climb(a, (t) => (t >= 30 ? 1 : 0), 1, 30 + 4 * hz, draw);
    const at = (s: AwarenessName): number => changes.find((c) => c.to === s)!.tick;
    expect(at('curious')).toBe(30);
    expect((at('suspicious') - at('curious')) / hz).toBeCloseTo(A.dwell.curious, 6);
    expect((at('searching') - at('suspicious')) / hz).toBeCloseTo(A.dwell.suspicious, 6);
    expect((at('combat') - at('searching')) / hz).toBeCloseTo(A.dwell.searching, 6);
    expect(changes.map((c) => c.to)).toEqual(['curious', 'suspicious', 'searching', 'combat']);
  });

  it('reacts to something alarming in about 1.5 s, telegraphed from the first instant', () => {
    const a = fresh();
    stimulate(a, { ...sound(A.shot), reason: 'shot' }, 100, T, draw);
    const changes = climb(a, () => 0, 100, 100 + 3 * hz, draw);
    expect(changes[0]).toEqual({ tick: 100, to: 'curious' });
    const searching = changes.find((c) => c.to === 'searching')!;
    expect((searching.tick - 100) / hz).toBeGreaterThanOrEqual(1.2);
    expect((searching.tick - 100) / hz).toBeLessThanOrEqual(1.8);
    // Sound alone never confirms a sighting.
    expect(changes.some((c) => c.to === 'combat')).toBe(false);
  });

  it('falls one state at a time, each after its ramp-down, varied from his own stream', () => {
    const a = fresh();
    stimulate(a, sound(A.levels.searching), 0, T, draw);
    climb(a, () => 0, 0, 2 * hz, draw);
    expect(a.state).toBe('searching');
    const changes = climb(a, () => 0, 2 * hz + 1, 120 * hz, draw);
    expect(changes.map((c) => c.to)).toEqual(['suspicious', 'curious', 'unaware']);
    const s = A.spread;
    const gaps = [changes[0]!.tick - 2 * hz, changes[1]!.tick - changes[0]!.tick, changes[2]!.tick - changes[1]!.tick].map((t) => t / hz);
    const bases = [A.rampDown.searching, A.rampDown.suspicious, A.rampDown.curious];
    gaps.forEach((g, k) => {
      expect(g).toBeGreaterThanOrEqual(bases[k]! * (1 - s) - 2.1);
      expect(g).toBeLessThanOrEqual(bases[k]! * (1 + s) + 0.1);
    });
    // Stand-downs start near 20 s.
    expect(gaps[0]).toBeGreaterThan(14);
  });

  it('ignores weaker stimuli in a grace period, until enough arrive to count as a stronger one', () => {
    const a = fresh();
    expect(stimulate(a, sound(A.sound.faint), 0, T, draw)).toBe(true);
    expect(a.evidence).toBeCloseTo(A.sound.faint, 12);
    // Two more faint steps inside the grace period: ignored.
    expect(stimulate(a, sound(A.sound.faint), 10, T, draw)).toBe(false);
    expect(stimulate(a, sound(A.sound.faint), 20, T, draw)).toBe(false);
    // The third counts as a repeat: one step stronger.
    const third = sound(A.sound.faint);
    expect(stimulate(a, third, 30, T, draw)).toBe(true);
    expect(third.reason).toBe('repeat');
    expect(a.evidence).toBeCloseTo(A.sound.faint + A.repeat, 12);
    // One that beats the last rise by enough always counts.
    expect(stimulate(a, sound(A.shot), 35, T, draw)).toBe(true);
    expect(a.evidence).toBeCloseTo(A.shot, 12);
  });

  it('settles sharper after a search: a raised floor and quicker eyes', () => {
    const a = fresh();
    stimulate(a, sound(A.levels.searching), 0, T, draw);
    climb(a, () => 0, 0, 120 * hz, draw);
    expect(a.state).toBe('unaware');
    expect(a.floor).toBe(A.floor);
    expect(a.sharp).toBe(A.sharp);
    // A sound that leaves a fresh guard short of curious now makes him curious.
    const weak = A.levels.curious - A.floor / 2;
    const b = fresh();
    stimulate(b, sound(weak), 0, T, draw);
    expect(climb(b, () => 0, 0, 10, draw)).toEqual([]);
    stimulate(a, sound(weak), 120 * hz + 1, T, draw);
    expect(climb(a, () => 0, 120 * hz + 1, 120 * hz + 10, draw).map((c) => c.to)).toEqual(['curious']);
  });

  it('draws the same falls for the same guard and history, and others for another guard', () => {
    const fall = (seed: string): number[] => {
      const r = new Rng(seed, 'draws');
      const a = fresh();
      stimulate(a, sound(A.levels.searching), 0, T, () => r.next());
      return climb(a, () => 0, 0, 120 * hz, () => r.next()).map((c) => c.tick);
    };
    expect(fall('guard 2')).toEqual(fall('guard 2'));
    expect(fall('guard 2')).not.toEqual(fall('guard 3'));
  });
});

describe('the minimal reactions', () => {
  /** One sentry facing north on open ground; a noise behind him; the player far away. */
  function run(seconds: number): { states: Array<{ t: number; to: AwarenessName }>; track: Array<{ t: number; x: number; z: number; yaw: number }>; post: { x: number; z: number } } {
    const post = { x: 0, z: 0 };
    const world = testWorld({
      size: 120,
      cell: 1,
      spawn: { x: 50, z: 50 },
      camp: {
        structures: [],
        guards: [testGuard({ id: 0, role: 'sentry', x: post.x, y: 0, z: post.z, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })],
        fenceHalf: 0,
      },
    });
    const drop: System = {
      name: 'test-noise',
      phase: 'commands',
      after: ['player-commands', 'rifle', 'sandbox-drops', 'use'],
      reads: [],
      writes: [],
      emits: ['noise'],
      run(ctx) {
        // A loud noise 12 m behind him, at 1 s: clear enough to make him suspicious.
        if (ctx.tick === 30) ctx.emit({ type: 'noise', source: 1, x: 0, y: 0, z: 12, surface: Surface.Gravel, loudness: 60 / 12, radius: 60 });
      },
    };
    let systems = withSystem(SYSTEMS, drop);
    const sim = new Simulation(world, T, systems);
    placePlayer(sim, 50, 50);
    giveSenses(sim);
    const states: Array<{ t: number; to: AwarenessName }> = [];
    const track: Array<{ t: number; x: number; z: number; yaw: number }> = [];
    for (let i = 0; i < seconds * hz; i++) {
      const ev: readonly SimEvent[] = sim.step(neutralInput());
      for (const e of ev) if (e.type === 'alert') states.push({ t: sim.tick / hz, to: e.to });
      const g = sim.guards[0]!;
      track.push({ t: sim.tick / hz, x: g.body.x, z: g.body.z, yaw: g.body.yaw + g.guard.headYaw });
    }
    return { states, track, post };
  }

  it('looks, walks to where he heard it, looks around, and goes back to his post', () => {
    const { states, track, post } = run(90);
    expect(states[0]!.to).toBe('curious');
    expect(states.some((s) => s.to === 'suspicious')).toBe(true);
    expect(states.at(-1)!.to).toBe('unaware');
    // Curious: he turns to look behind him (south, +z) within a second.
    const look = track.find((p) => p.t > states[0]!.t + 1)!;
    expect(Math.abs(Math.abs(look.yaw) - Math.PI)).toBeLessThan(0.6);
    // Suspicious: he walks most of the way to the noise.
    const nearest = Math.min(...track.map((p) => Math.hypot(p.x - 0, p.z - 12)));
    expect(nearest).toBeLessThan(T.perception.awareness.arrive + 4);
    // Settled: back at his post.
    const end = track.at(-1)!;
    expect(Math.hypot(end.x - post.x, end.z - post.z)).toBeLessThan(0.5);
  });
});
