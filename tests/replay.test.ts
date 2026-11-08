import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Replay, REPLAY_SPEEDS } from '../src/app/replay';
import { Optic, neutralInput, quantizeInput } from '../src/sim/kernel/input';
import { Recorder, Recording } from '../src/sim/kernel/record/recording';
import { startScene } from '../src/sim/kernel/scene';
import { sceneOf } from '../src/sim/game/scenes';
import type { SimEvent } from '../src/sim/kernel/events';

/**
 * Watching a recording (src/app/replay.ts): playing it forward gives exactly the events
 * the live run made, seeking back and playing again gives them again, and the replay
 * knows when the player had an optic up and where the markers are.
 */

function recordCourse(seconds: number): { bytes: Uint8Array; events: SimEvent[][] } {
  const scene = sceneOf({ scene: { name: 'movement-course' } })!;
  const sim = startScene(scene, T);
  const recorder = new Recorder(sim, 'test');
  const events: SimEvent[][] = [];
  for (let i = 0; i < seconds * T.sim.tickHz; i++) {
    const zoom = i >= 30 && i < 60;
    const input = quantizeInput({ ...neutralInput(sim.player.yaw), moveZ: 1, sprint: i > 90, optic: zoom ? Optic.Binoculars : Optic.None });
    const out = sim.step(input);
    recorder.record(sim, out);
    events.push(out.map((e) => ({ ...e })));
    if (i === 100) recorder.annotate('marker', 'here');
  }
  return { bytes: recorder.finish(sim, '2026-11-07T00:00:00Z').toBytes(), events };
}

describe('a replay', () => {
  const { bytes, events } = recordCourse(8);
  const ids = (es: readonly SimEvent[]) => es.map((e) => `${e.type}:${e.id}:${e.t}`);

  it('plays forward exactly the events the run made, and again after seeking back', () => {
    const r = new Replay(Recording.fromBytes(bytes), 'test');
    expect(r.ticks).toBe(8 * T.sim.tickHz);
    r.seeker.seek(0);
    for (let k = 0; k < r.ticks; k++) expect(ids(r.seeker.step())).toEqual(ids(events[k]!));
    expect(r.seeker.step()).toHaveLength(0);
    r.seeker.seek(95);
    for (let k = 95; k < 140; k++) expect(ids(r.seeker.step())).toEqual(ids(events[k]!));
  });

  it('knows when the optic was up, where the markers are, and its speeds', () => {
    const r = new Replay(Recording.fromBytes(bytes), 'test');
    expect(r.opticAt(10)).toBe(false);
    expect(r.opticAt(40)).toBe(true);
    expect(r.opticAt(70)).toBe(false);
    expect(r.marks).toEqual([{ tick: 101, kind: 'marker', text: 'here' }]);
    expect(r.markFrom(0, 1)).toBe(101);
    expect(r.markFrom(101, 1)).toBeNull();
    expect(r.markFrom(200, -1)).toBe(101);
    expect(r.speed).toBe(1);
    expect(r.changeSpeed(1)).toBe(2);
    for (let k = 0; k < 10; k++) r.changeSpeed(1);
    expect(r.speed).toBe(REPLAY_SPEEDS.at(-1));
    expect(r.changeSpeed(0)).toBe(REPLAY_SPEEDS[0]);
  });

  it("says why it can't be watched in a build without its scene", () => {
    const rec = Recording.fromBytes(bytes);
    (rec.header as { scene: { name: string; version: number } | null }).scene = { name: 'no-such-scene', version: 1 };
    expect(() => new Replay(rec, 'test')).toThrow(/scene 'no-such-scene'/);
  });
});
