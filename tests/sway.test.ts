import { describe, expect, it } from 'vitest';
import { CommandLatch } from '../src/app/commandLatch';
import { defaultTuning as T } from '../src/config/tuning';
import { boreLine, lineOfSight, vec3, viewLine, zeroOf } from '../src/sim/ballistics';
import { calmVitals, holdLength, startle, stepVitals } from '../src/sim/body';
import { FixedStepClock } from '../src/sim/kernel/core/clock';
import { lerp } from '../src/sim/kernel/core/math';
import { air } from '../src/sim/kernel/env';
import type { ShotEvent } from '../src/sim/kernel/events';
import { neutralInput, Optic } from '../src/sim/kernel/input';
import { buildWorld } from '../src/sim/generation';
import { SWAY_RUNGS, swayRadius } from '../src/sim/game/ballisticsBench';
import { player } from '../src/sim/game/entities';
import { placePlayer } from '../src/sim/game/setup';
import { arm } from '../src/sim/game/shooting';
import { Simulation, type Snapshot } from '../src/sim/game/sim';

/**
 * Sway (sim/ballistics/sway.ts) and the vitals under it (sim/body/vitals.ts). The aim
 * wanders as a pure function of the state and the time, sampled at every tick's end with
 * two ticks of history; the camera and the shot read it through one interpolation, so a
 * shot leaves along the camera of the frame clicked on, sway and all, at any frame rate.
 */

function armedSim(): Simulation {
  const world = buildWorld({ name: 'sway-test', size: 200, cell: 1 }, T.gen);
  const sim = new Simulation(world, T);
  placePlayer(sim, 0, 0, 0, -1);
  arm(player(sim.index), T);
  return sim;
}

const mouseYaw = (t: number): number => 0.35 * t + 0.08 * Math.sin(2.3 * t);
const mousePitch = (t: number): number => 0.05 * Math.sin(1.3 * t);
/** Clicks, real seconds, each after the bolt has chambered the next round. */
const CLICKS = [1.1037, 2.7316, 4.3101, 5.9711];

interface Seen {
  eye: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  /** The line of sight with no sway. */
  bare: { x: number; y: number; z: number };
}

function play(frameTimes: number[]): { shots: ShotEvent[]; seen: Seen[]; sim: Simulation } {
  const sim = armedSim();
  const clock = new FixedStepClock(T.sim.tickHz);
  const latch = new CommandLatch();
  const raw = neutralInput();
  let prev: Snapshot = sim.snapshot();
  let curr: Snapshot = sim.snapshot();
  const shots: ShotEvent[] = [];
  const seen: Seen[] = [];
  let shown: Seen | null = null;
  let click = 0;
  let last = 0;
  for (const now of frameTimes) {
    while (click < CLICKS.length && CLICKS[click]! <= now) {
      latch.latch('fire');
      seen.push(structuredClone(shown!));
      click++;
    }
    const ticks = clock.advance(now - last);
    last = now;
    for (let k = 0; k < ticks; k++) {
      // Walking with the scope up: the sway is at its widest, and changes every tick.
      raw.moveZ = 1;
      raw.optic = Optic.Scope;
      raw.yaw = mouseYaw(now);
      raw.pitch = mousePitch(now);
      raw.commands = latch.drain(sim.tick, []);
      const swap = prev;
      prev = curr;
      curr = swap;
      for (const e of sim.step(raw)) if (e.type === 'shot') shots.push({ ...e });
      curr = sim.snapshot(curr);
    }
    // Draw as the renderer does: the body between the last two states, the sway too.
    const a = clock.alpha;
    const ra = prev.rifle!;
    const rb = curr.rifle!;
    const sway = { up: lerp(ra.up, rb.up, a), right: lerp(ra.right, rb.right, a), raise: lerp(ra.raise, rb.raise, a) };
    shown = {
      eye: { x: lerp(prev.px, curr.px, a), y: lerp(prev.py, curr.py, a) + lerp(prev.eye, curr.eye, a), z: lerp(prev.pz, curr.pz, a) },
      dir: viewLine(mouseYaw(now), mousePitch(now), sway, vec3()),
      bare: lineOfSight(mouseYaw(now), mousePitch(now), vec3()),
    };
    latch.frameShown(sim.tick, a, mouseYaw(now), mousePitch(now));
  }
  return { shots, seen, sim };
}

const steady = (fps: number, seconds: number): number[] => Array.from({ length: Math.floor(seconds * fps) }, (_, i) => (i + 1) / fps);

describe('sway', () => {
  for (const fps of [30, 47, 60, 144]) {
    it(`sends the shot along the camera of the frame clicked on, sway and all, at ${fps} fps`, () => {
      const { shots, seen, sim } = play(steady(fps, 7));
      expect(shots).toHaveLength(CLICKS.length);
      const zero = zeroOf(player(sim.index).rifle!, T, air(sim.world.spec.env).density);
      shots.forEach((s, k) => {
        const { eye, dir } = seen[k]!;
        expect(Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z)).toBeLessThan(1e-3);
        // The bullet leaves along the bore: the camera's line turned up by the zero. Lag is
        // stored to 1/120 of a tick, and walking with the scope up the sway runs at about
        // 12 mil/s: under 0.002 mil of rounding, half a millimetre at 300 m.
        const bore = boreLine(dir.x, dir.y, dir.z, zero.cos, zero.sin, vec3());
        expect(Math.hypot(s.dx - bore.x, s.dy - bore.y, s.dz - bore.z)).toBeLessThan(5e-6);
      });
      // And the sway was real: each shot left well off the bare line of sight.
      for (const v of seen) expect(Math.hypot(v.dir.x - v.bare.x, v.dir.y - v.bare.y, v.dir.z - v.bare.z)).toBeGreaterThan(0.5e-3);
    });
  }

  it('climbs the ladder the bench pins: free-standing past a head, prone on a rest with the breath held under 0.1 mil', () => {
    const r = Object.fromEntries(SWAY_RUNGS.map((rung) => [rung.name, swayRadius(rung, T)]));
    expect(r['standing']).toBeGreaterThan(1.5);
    expect(r['prone']).toBeGreaterThan(0.5);
    expect(r['prone']).toBeLessThan(0.8);
    expect(r['prone, rested']).toBeGreaterThan(0.2);
    expect(r['prone, rested']).toBeLessThan(0.3);
    expect(r['prone, rested, breath held']).toBeLessThan(0.1);
    // Each rung steadier than the one before.
    const order = SWAY_RUNGS.map((rung) => r[rung.name]!);
    for (let k = 1; k < order.length; k++) expect(order[k]).toBeLessThan(order[k - 1]!);
  });
});

describe('vitals', () => {
  it('hold a breath about 4 s, run out, and get it back over about 6 s', () => {
    const sim = armedSim();
    const p = player(sim.index);
    const hz = T.sim.tickHz;
    let steadied = 0;
    for (let i = 0; i < 6 * hz; i++) {
      sim.step({ ...neutralInput(), optic: Optic.Scope, breath: true });
      if (p.vitals!.held > 0 && p.vitals!.held <= holdLength(p.vitals!.heartRate, T.vitals)) steadied++;
    }
    expect(steadied / hz).toBeGreaterThan(3.8);
    expect(steadied / hz).toBeLessThan(4.2);
    expect(p.vitals!.air).toBe(0);
    // Breathing again: back after the recovery time, not before.
    for (let i = 0; i < 5 * hz; i++) sim.step({ ...neutralInput(), optic: Optic.Scope });
    expect(p.vitals!.air).toBeLessThan(1);
    for (let i = 0; i < 1.2 * hz; i++) sim.step({ ...neutralInput(), optic: Optic.Scope });
    expect(p.vitals!.air).toBe(1);
  });

  it('race with a sprint, shorten the hold, and settle in about 20 s', () => {
    const sim = armedSim();
    const p = player(sim.index);
    const hz = T.sim.tickHz;
    for (let i = 0; i < 8 * hz; i++) sim.step({ ...neutralInput(), moveZ: 1, sprint: true });
    const racing = p.vitals!.heartRate;
    expect(racing).toBeGreaterThan(130);
    expect(holdLength(racing, T.vitals)).toBeLessThan(2.5);
    for (let i = 0; i < 20 * hz; i++) sim.step(neutralInput());
    expect(p.vitals!.heartRate).toBeLessThan(T.vitals.restingHr + 5);
  });

  it('jump at a close call and settle as after a sprint', () => {
    const v = calmVitals(T.vitals);
    startle(v, T.vitals);
    expect(v.heartRate).toBe(T.vitals.restingHr + T.vitals.closeCall);
    for (let i = 0; i < 20 * 30; i++) stepVitals(v, 'idle', false, T.ballistics.sway.breathRate, T.vitals, 1 / 30);
    expect(v.heartRate).toBeLessThan(T.vitals.restingHr + 2);
  });

  it('is part of the state: a restored run sways the same', () => {
    const sim = armedSim();
    const hz = T.sim.tickHz;
    for (let i = 0; i < 2 * hz; i++) sim.step({ ...neutralInput(), optic: Optic.Scope, moveZ: i < hz ? 1 : 0 });
    const saved = sim.saveState();
    const a: number[] = [];
    for (let i = 0; i < hz; i++) {
      sim.step({ ...neutralInput(), optic: Optic.Scope, breath: i > 10 });
      a.push(player(sim.index).rifle!.sway.up);
    }
    sim.restore(saved);
    const b: number[] = [];
    for (let i = 0; i < hz; i++) {
      sim.step({ ...neutralInput(), optic: Optic.Scope, breath: i > 10 });
      b.push(player(sim.index).rifle!.sway.up);
    }
    expect(b).toEqual(a);
  });
});
