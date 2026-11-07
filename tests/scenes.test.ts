import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Recording } from '../src/sim/record/recording';
import { resimulate } from '../src/sim/record/resim';
import { ReplaySeeker } from '../src/sim/record/seek';
import { runScene } from '../src/sim/scene';
import { SCENES, sceneOf } from '../src/sim/scenes';

/**
 * Every scene, run headless by its own driver: its expectations hold, and its recording
 * names the scene and re-simulates bit for bit through it.
 */
describe('scenes', () => {
  for (const [name, make] of Object.entries(SCENES)) {
    it(`${name}: does what it expects, and replays`, () => {
      const scene = make();
      const run = runScene(scene, T);
      expect(run.failures).toEqual([]);
      const rec = Recording.fromBytes(run.recording.toBytes());
      expect(rec.header.scene).toEqual({ name, version: scene.version });
      expect(sceneOf(rec.header)?.name).toBe(name);
      const re = resimulate(rec, { scene: make() });
      expect(re.ok, re.problem ?? `diverged at ${re.firstDivergence}`).toBe(true);
      // Seeking works in a scene too: the end is the end of the run.
      const seeker = new ReplaySeeker(rec, { scene: make() });
      expect(seeker.seek(rec.header.ticks).hash()).toBe(run.sim.hash());
    });
  }

  it('says why a scene recording can not be re-simulated without its scene, or in another version', () => {
    const run = runScene(SCENES['movement-course']!(), T, { seconds: 2 });
    expect(resimulate(run.recording).problem).toMatch(/made in the scene 'movement-course', which this build doesn't have/);
    const newer = { ...SCENES['movement-course']!(), version: 99 };
    expect(resimulate(run.recording, { scene: newer }).problem).toMatch(/version \d+ of the scene .*this build has version 99/);
  });
});
