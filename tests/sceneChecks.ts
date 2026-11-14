import { expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { SCENES, sceneOf } from '../src/sim/game/scenes';
import { Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { ReplaySeeker } from '../src/sim/kernel/record/seek';
import { runScene } from '../src/sim/kernel/scene';

/**
 * Every scene, run headless by its own driver: its expectations hold, and its recording
 * names the scene and re-simulates bit for bit through it. Part `part` of `of` (from 1)
 * registers the scenes whose place in the list leaves `part - 1` when divided by `of`, so
 * the scenes are shared out over a few test files (scenes.test.ts and scenes<N>.test.ts)
 * that CI's shards run side by side. Every file must use the same `of`, one file a part.
 */
export function sceneChecks(part: number, of: number): void {
  Object.entries(SCENES).forEach(([name, make], i) => {
    if (i % of !== part - 1) return;
    it(`${name}: does what it expects, and replays`, () => {
      const scene = make();
      const run = runScene(scene, T);
      expect(run.failures).toEqual([]);
      const rec = Recording.fromBytes(run.recording.toBytes());
      expect(rec.header.scene).toEqual({ name, version: scene.version, params: scene.params ?? '' });
      expect(sceneOf(rec.header)?.name).toBe(name);
      const re = resimulate(rec, { scene: make() });
      expect(re.ok, re.problem ?? `diverged at ${re.firstDivergence}`).toBe(true);
      // Seeking works in a scene too: the end is the end of the run.
      const seeker = new ReplaySeeker(rec, { scene: make() });
      expect(seeker.seek(rec.header.ticks).hash()).toBe(run.sim.hash());
    });
  });
}
