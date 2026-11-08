import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { PLAYTEST_NAME } from '../src/headless/playtestInbox';
import { FrameHistogram } from '../src/app/perf';
import { PlaytestCapture, type PlaytestStore, type TelemetryReport } from '../src/app/playtest';
import { neutralInput, quantizeInput } from '../src/sim/kernel/input';
import { Recorder, Recording } from '../src/sim/kernel/record/recording';
import { Simulation } from '../src/sim/game/sim';
import { EAST, testWorld } from './fixtures';

/**
 * Playtest capture (src/app/playtest.ts): when a run is kept, what goes with it, and the
 * frame statistics its report carries. The dev server's inbox and the browser's store are
 * checked by playing the game; here a store records what it is given.
 */

class MemoryStore implements PlaytestStore {
  readonly where = 'memory';
  readonly saved: Array<{ name: string; recording: Recording; report: TelemetryReport }> = [];
  async save(name: string, recording: Blob, report: TelemetryReport): Promise<void> {
    this.saved.push({ name, recording: Recording.fromBytes(new Uint8Array(await recording.arrayBuffer())), report });
  }
}

function run(seconds: number): { sim: Simulation; recorder: Recorder; play(seconds: number, capture: PlaytestCapture): void } {
  const sim = new Simulation(testWorld(), T);
  const recorder = new Recorder(sim, 'test');
  const input = quantizeInput({ ...neutralInput(EAST), moveZ: 1 });
  const play = (s: number, capture: PlaytestCapture) => {
    for (let i = 0; i < s * T.sim.tickHz; i++) {
      recorder.record(sim, sim.step(input));
      // A frame per tick, 33 ms each.
      capture.frame(1000 / T.sim.tickHz, 2, 0.05, 1);
    }
  };
  void seconds;
  return { sim, recorder, play };
}

const context = { build: 'test', machine: () => ({ gpu: 'none' }), settings: () => ({ volume: 1 }) };

describe('playtest capture', () => {
  it('keeps a run every minute of play, with a recording that replays it and a report', async () => {
    const store = new MemoryStore();
    const capture = new PlaytestCapture(store, context);
    const r = run(0);
    capture.startRun(r.sim, r.recorder, 'TEST-0000', null);
    r.play(59, capture);
    await capture.settled();
    expect(store.saved).toHaveLength(0);
    r.play(2, capture);
    await capture.settled();
    expect(store.saved).toHaveLength(1);
    const { name, recording, report } = store.saved[0]!;
    expect(name).toMatch(/^\d{8}-\d{6}-TEST-0000$/);
    expect(PLAYTEST_NAME.test(`${name}.slrec`)).toBe(true);
    expect(recording.header.ticks).toBe(60 * T.sim.tickHz);
    expect(report).toMatchObject({ format: 'sightline-telemetry', reason: 'minute', world: { seed: 'TEST-0000', scene: null }, run: { ticks: 1800, tickHz: 30 } });
    expect(report.frames.count).toBe(1800);
    expect(report.frames.p50Ms).toBe(34);
    expect(report.machine).toEqual({ gpu: 'none' });
  });

  it("doesn't keep a run of a few seconds, and keeps the last one when a new run starts", async () => {
    const store = new MemoryStore();
    const capture = new PlaytestCapture(store, context);
    const a = run(0);
    capture.startRun(a.sim, a.recorder, 'TEST-0000', null);
    a.play(3, capture);
    capture.save('pause');
    await capture.settled();
    expect(store.saved).toHaveLength(0);
    a.play(10, capture);
    const b = run(0);
    capture.startRun(b.sim, b.recorder, 'TEST-0000', 'course');
    await capture.settled();
    expect(store.saved.map((s) => [s.report.reason, s.recording.header.ticks])).toEqual([['new run', 13 * 30]]);
    // Nothing new since: no second copy.
    capture.save('pause');
    await capture.settled();
    expect(store.saved).toHaveLength(1);
  });

  it('saves one at a time, and every run that asked', async () => {
    let release: () => void = () => undefined;
    const order: string[] = [];
    const slow: PlaytestStore = {
      where: 'slow',
      save: (name, _rec, report) =>
        new Promise((resolve) => {
          order.push(`${report.reason}:${report.run.ticks}`);
          release = resolve;
          void name;
        }),
    };
    const capture = new PlaytestCapture(slow, context);
    const a = run(0);
    capture.startRun(a.sim, a.recorder, 'TEST-0000', null);
    a.play(10, capture);
    capture.save('pause');
    expect(capture.busy).toBe(true);
    a.play(1, capture);
    capture.save('hidden');
    capture.save('pause');
    expect(order).toEqual(['pause:300']);
    release();
    await new Promise((r) => setTimeout(r, 0));
    // The waiting request ran with the latest reason, and the newest state.
    expect(order).toEqual(['pause:300', 'pause:330']);
    release();
    await capture.settled();
  });

  it("asks a failing store once a minute, not every frame, and still tries again on a pause", async () => {
    let attempts = 0;
    const failing: PlaytestStore = {
      where: 'nowhere',
      save: async () => {
        attempts++;
        throw new Error('disk full');
      },
    };
    const capture = new PlaytestCapture(failing, context);
    const r = run(0);
    capture.startRun(r.sim, r.recorder, 'TEST-0000', null);
    r.play(61, capture);
    await capture.settled();
    expect(attempts).toBe(1);
    expect(capture.status).toMatch(/couldn't save: disk full/);
    // Thirty more seconds of frames: no new attempts until the next minute.
    r.play(30, capture);
    await capture.settled();
    expect(attempts).toBe(1);
    // A pause asks again: the run still isn't kept anywhere. The next minute counts from it.
    capture.save('pause');
    await capture.settled();
    expect(attempts).toBe(2);
    r.play(59, capture);
    await capture.settled();
    expect(attempts).toBe(2);
    r.play(2, capture);
    await capture.settled();
    expect(attempts).toBe(3);
  });

  it('keeps the failing tick when a tick fails right after a save', async () => {
    const store = new MemoryStore();
    const capture = new PlaytestCapture(store, context);
    const r = run(0);
    capture.startRun(r.sim, r.recorder, 'TEST-0000', null);
    r.play(10, capture);
    capture.save('pause');
    await capture.settled();
    expect(store.saved.at(-1)!.recording.header.ticks).toBe(300);
    // The next tick fails: the recorder keeps its input, though the simulation's tick doesn't move.
    r.sim.fault = { tick: 301, system: 'test', message: 'boom' };
    r.recorder.recordFault(r.sim);
    capture.save('fault');
    await capture.settled();
    expect(store.saved).toHaveLength(2);
    expect(store.saved[1]!.recording.header.ticks).toBe(301);
    expect(store.saved[1]!.recording.header.fault).toMatchObject({ tick: 301, system: 'test' });
  });

  it('refuses file names that could leave playtests/', () => {
    for (const bad of ['../x.slrec', 'a/b.slrec', '.hidden.slrec', 'x.exe', 'x.slrec/..', '']) expect(PLAYTEST_NAME.test(bad)).toBe(false);
    expect(PLAYTEST_NAME.test('20261107-185836-scene-movement-course.json')).toBe(true);
  });
});

describe('frame histograms', () => {
  it('give percentiles and slow frames to the millisecond, over any number of frames', () => {
    const h = new FrameHistogram();
    for (let i = 0; i < 90; i++) h.push(16.6);
    for (let i = 0; i < 9; i++) h.push(40);
    h.push(400);
    expect(h.percentile(0.5)).toBe(17);
    expect(h.percentile(0.95)).toBe(41);
    expect(h.percentile(1)).toBe(251);
    expect(h.over(34)).toBe(10);
    expect(h.over(101)).toBe(1);
    expect(h.max).toBe(400);
    expect(h.mean).toBeCloseTo((90 * 16.6 + 9 * 40 + 400) / 100, 9);
    h.push(NaN);
    expect(h.count).toBe(100);
  });
});
