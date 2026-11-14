import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { resimulate } from '../src/sim/kernel/record/resim';
import { runScene } from '../src/sim/kernel/scene';
import { SCENES } from '../src/sim/game/scenes';
import { sceneChecks } from './sceneChecks';

/**
 * Every scene, run headless by its own driver: its expectations hold, and its recording
 * names the scene and re-simulates bit for bit through it. A third of the scenes run here,
 * the rest in scenes2.test.ts and scenes3.test.ts (sceneChecks.ts).
 */
describe('scenes', () => {
  sceneChecks(1, 3);

  it('says why a scene recording can not be re-simulated without its scene, or in another version', () => {
    const run = runScene(SCENES['movement-course']!(), T, { seconds: 2 });
    expect(resimulate(run.recording).problem).toMatch(/made in the scene 'movement-course', which this build doesn't have/);
    const newer = { ...SCENES['movement-course']!(), version: 99 };
    expect(resimulate(run.recording, { scene: newer }).problem).toMatch(/version \d+ of the scene .*this build has version 99/);
  });
});
