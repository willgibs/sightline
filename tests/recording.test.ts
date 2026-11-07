import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { WanderBot } from '../src/sim/bots/wander';
import { generateWorld, type World } from '../src/sim/gen/world';
import { neutralInput } from '../src/sim/input';
import { Recorder, Recording } from '../src/sim/record/recording';
import { resimulate } from '../src/sim/record/resim';
import { Simulation } from '../src/sim/sim';

let world: World;
beforeAll(() => {
  world = generateWorld('VEX-0042', defaultTuning);
});

/** Plays `seconds` with the wander bot and returns the simulation and its recording. */
function play(seconds: number): { sim: Simulation; rec: Recording } {
  const sim = new Simulation(world, defaultTuning);
  const recorder = new Recorder(sim, 'overlook');
  const bot = new WanderBot(world.seed);
  const raw = neutralInput();
  for (let i = 0; i < seconds * 30; i++) {
    const events = sim.step(bot.next(sim, raw));
    recorder.record(sim, events);
  }
  return { sim, rec: recorder.finish(sim) };
}

describe('determinism', () => {
  it('produces identical states from identical inputs', () => {
    const a = play(90);
    const b = play(90);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(a.rec.header.checkpoints).toEqual(b.rec.header.checkpoints);
    // And the bot really went somewhere.
    expect(Math.hypot(a.sim.player.x - world.spawn.x, a.sim.player.z - world.spawn.z)).toBeGreaterThan(20);
  });
});

describe('recordings', () => {
  it('round-trip through bytes', () => {
    const { rec } = play(60);
    const back = Recording.fromBytes(rec.toBytes());
    expect(back.header).toEqual(rec.header);
    expect(back.inputs).toEqual(rec.inputs);
    expect(back.states).toEqual(rec.states);
    expect(back.readEvents()).toEqual(rec.readEvents());
    expect(back.stateCount).toBe(60 * 10);
  });

  it('store the state at 10 Hz', () => {
    const { sim, rec } = play(30);
    const last = rec.readState(rec.stateCount - 1);
    expect(last.tick).toBe(sim.tick);
    expect(last.px).toBeCloseTo(sim.player.x, 3);
    expect(last.pz).toBeCloseTo(sim.player.z, 3);
    expect(last.guards[0]).toBeCloseTo(sim.guards[0]!.x, 3);
  });

  it('re-simulate bit for bit', () => {
    const { rec } = play(120);
    const result = resimulate(Recording.fromBytes(rec.toBytes()), world);
    expect(result.firstDivergence).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(rec.header.finalHash);
  });

  it('pinpoint where a tampered recording diverges', () => {
    const { rec } = play(60);
    const bytes = rec.inputs.slice();
    // Flip the forward axis at tick 900 (30 s in).
    const at = 900 * 12 + 1;
    bytes[at] = bytes[at] === 127 ? 0 : 127;
    const tampered = new Recording(rec.header, bytes, rec.states, rec.events);
    const result = resimulate(tampered, world);
    expect(result.ok).toBe(false);
    expect(result.firstDivergence).toBe(1200); // the first checkpoint after the change
  });

  it('replay even when the caller never quantized its input', () => {
    const sim = new Simulation(world, defaultTuning);
    const recorder = new Recorder(sim, 'overlook');
    for (let i = 0; i < 300; i++) {
      const events = sim.step({
        moveX: 0.5, // not a multiple of 1/127
        moveZ: 1.5, // out of range
        sprint: i % 50 < 25,
        crouch: false,
        prone: i === 100,
        yaw: 3 + 0.013 * i, // runs past π
        pitch: 0.1234567,
      });
      recorder.record(sim, events);
    }
    const rec = recorder.finish(sim);
    expect(resimulate(Recording.fromBytes(rec.toBytes()), world).ok).toBe(true);
  });

  it('refuse to skip a tick', () => {
    const sim = new Simulation(world, defaultTuning);
    const recorder = new Recorder(sim, 'overlook');
    sim.step(neutralInput());
    sim.step(neutralInput());
    expect(() => recorder.record(sim, [])).toThrow(/missed a tick/);
  });

  it('stay small: a 20-minute mission is a few megabytes', () => {
    const { rec } = play(60);
    const perMinute = rec.toBytes().length;
    expect(perMinute * 20).toBeLessThan(4 * 1024 * 1024);
  });
});
