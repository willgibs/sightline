import { beforeAll, describe, expect, it } from 'vitest';
import { CommandLatch } from '../src/app/commandLatch';
import { defaultTuning as T } from '../src/config/tuning';
import { FixedStepClock } from '../src/sim/kernel/core/clock';
import type { ShotEvent } from '../src/sim/kernel/events';
import { generateWorld } from '../src/sim/generation/world';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { Simulation, type Snapshot } from '../src/sim/game/sim';
import { lerp } from '../src/sim/kernel/core/math';

/**
 * A shot goes where the crosshair was on the frame the player clicked on, at any frame
 * rate. The test drives the simulation the way the game does (a fixed-step clock, input
 * sampled per tick, frames drawn between the last two states, mouse look at frame rate,
 * clicks latched against the frame on screen), with a scripted player sprinting and
 * sweeping the view, and checks every shot against the camera of its frame.
 */

interface Camera {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** The mouse: a steady sweep with a wobble, so angles change between every two frames. */
const mouseYaw = (t: number): number => 0.9 * t + 0.25 * Math.sin(3.1 * t);
const mousePitch = (t: number): number => 0.2 * Math.sin(1.7 * t) - 0.05;

/** Clicks, in seconds of real time. */
const CLICKS = [0.4137, 0.9, 1.25311, 2.0001, 2.71828, 3.3333];

interface Run {
  shots: ShotEvent[];
  /** The camera of the frame on screen at each click, and when that frame was drawn. */
  seen: Array<{ camera: Camera; drawnAt: number; clickAt: number }>;
}

function play(world: World, frameTimes: number[]): Run {
  const sim = new Simulation(world, T);
  const clock = new FixedStepClock(T.sim.tickHz);
  const latch = new CommandLatch();
  const raw = neutralInput();
  let prev: Snapshot = sim.snapshot();
  let curr: Snapshot = sim.snapshot();
  const shots: ShotEvent[] = [];
  const seen: Run['seen'] = [];
  let shown: Camera | null = null;
  let drawnAt = 0;
  let click = 0;
  let last = 0;
  for (const now of frameTimes) {
    // Clicks since the last frame are about the frame that was on screen.
    while (click < CLICKS.length && CLICKS[click]! <= now) {
      latch.latch('fire');
      seen.push({ camera: { ...shown! }, drawnAt, clickAt: CLICKS[click]! });
      click++;
    }
    const ticks = clock.advance(now - last);
    last = now;
    for (let k = 0; k < ticks; k++) {
      raw.moveZ = 1;
      raw.sprint = true;
      raw.yaw = mouseYaw(now);
      raw.pitch = mousePitch(now);
      raw.commands = latch.drain(sim.tick, []);
      const swap = prev;
      prev = curr;
      curr = swap;
      for (const e of sim.step(raw)) if (e.type === 'shot') shots.push({ ...e });
      sim.snapshot(curr);
    }
    // Draw: between the last two states, with the mouse as it is now.
    const a = clock.alpha;
    shown = { x: lerp(prev.px, curr.px, a), y: lerp(prev.py, curr.py, a) + lerp(prev.eye, curr.eye, a), z: lerp(prev.pz, curr.pz, a), yaw: mouseYaw(now), pitch: mousePitch(now) };
    latch.frameShown(sim.tick, a, shown.yaw, shown.pitch);
    drawnAt = now;
  }
  return { shots, seen };
}

/** Frame times at a steady rate. */
const steady = (fps: number, seconds: number): number[] => Array.from({ length: Math.floor(seconds * fps) }, (_, i) => (i + 1) / fps);

/** Frame times that stutter: mostly 60 fps, with long and short frames mixed in. */
function stuttering(seconds: number): number[] {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; t < seconds; i++) {
    t += [1 / 60, 1 / 60, 1 / 23, 1 / 144, 1 / 60, 0.071, 1 / 300][i % 7]!;
    out.push(t);
  }
  return out;
}

let world: World;
beforeAll(() => {
  world = generateWorld(missionSpec('TAL-4471'), T);
});

describe('a shot between ticks', () => {
  const dt = 1 / T.sim.tickHz;
  const cases: Array<[string, () => number[]]> = [
    ['30 fps', () => steady(30, 4)],
    ['60 fps', () => steady(60, 4)],
    ['144 fps', () => steady(144, 4)],
    ['240 fps', () => steady(240, 4)],
    ['47 fps, out of step with the ticks', () => steady(47, 4)],
    ['an uneven frame rate', () => stuttering(4)],
  ];

  for (const [name, frames] of cases) {
    it(`leaves from the camera of the frame clicked on, along its crosshair, at ${name}`, () => {
      const { shots, seen } = play(world, frames());
      expect(shots).toHaveLength(CLICKS.length);
      shots.forEach((s, k) => {
        const { camera, drawnAt, clickAt } = seen[k]!;
        // Sprinting at 5.5 m/s, lag is stored to 1/120 of a tick: under a millimetre.
        expect(Math.hypot(s.x - camera.x, s.y - camera.y, s.z - camera.z)).toBeLessThan(1e-3);
        const cp = Math.cos(camera.pitch);
        const want = [-Math.sin(camera.yaw) * cp, Math.sin(camera.pitch), -Math.cos(camera.yaw) * cp];
        expect(Math.hypot(s.dx - want[0]!, s.dy - want[1]!, s.dz - want[2]!)).toBeLessThan(1e-6);
        // The screen shows the world one tick behind the clock, so the shot happens one tick
        // before the frame it was clicked on was drawn, within the lag's rounding.
        expect(Math.abs(s.t - (drawnAt - dt))).toBeLessThan(dt / 100);
        expect(drawnAt).toBeLessThanOrEqual(clickAt);
      });
    });
  }
});
