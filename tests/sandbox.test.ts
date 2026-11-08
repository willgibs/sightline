import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { quantizeInput } from '../src/sim/kernel/input';
import { Recorder, Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { startScene } from '../src/sim/kernel/scene';
import type { SimEvent } from '../src/sim/kernel/events';
import { SCENES } from '../src/sim/game/scenes';

/**
 * Sandbox mode (A10): a noise dropped from the debug view lands where the player looked,
 * is heard by the law of sound, and, being a command in the input, replays.
 */
describe('the sandbox', () => {
  it('drops a noise where the view points; guards hear it; the recording replays it', () => {
    const scene = SCENES['perception-lab']!();
    const sim = startScene(scene, T);
    const recorder = new Recorder(sim, 'test');
    // Walk west, then look down at the ground ahead and drop a noise near the sentry.
    const events: SimEvent[] = [];
    const yaw = Math.PI / 2; // west
    for (let i = 0; i < 40 * T.sim.tickHz; i++) {
      const walking = sim.player.x > -128;
      const input = quantizeInput({ moveX: 0, moveZ: walking ? 1 : 0, sprint: walking, crouch: false, prone: false, yaw, pitch: -0.25, commands: i === 40 * T.sim.tickHz - 120 ? [{ kind: 'noise', lag: 0.5, yaw, pitch: -0.25 }] : [] });
      const out = sim.step(input);
      recorder.record(sim, out);
      for (const e of out) events.push({ ...e });
    }
    const noise = events.find((e) => e.type === 'noise');
    expect(noise).toBeDefined();
    // About eye height / tan(0.25) ahead of where the player stood: some 6.6 m west of him, near the sentry.
    expect(noise!.source).toBe(sim.playerId);
    if (noise?.type === 'noise') expect(noise.radius).toBe(T.perception.sandbox.noise);
    const heard = events.filter((e) => e.type === 'heard' && e.cause === noise?.id);
    expect(heard.length).toBeGreaterThan(0);
    const rec = Recording.fromBytes(recorder.finish(sim).toBytes());
    expect(resimulate(rec, { scene: SCENES['perception-lab']!() }).ok).toBe(true);
  });
});
