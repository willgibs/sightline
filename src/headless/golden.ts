/**
 * Writes the golden recording the tests re-simulate: a minute of the person-like bot on
 * TAL-4471, with a shot, a tuning change and a marker, so every track has something in
 * it. Rewrite it whenever SIM_VERSION, STATE_SCHEMA or RECORDING_VERSION changes:
 *
 *   npm run golden
 */
import { writeFileSync } from 'node:fs';
import { defaultTuning } from '../config/tuning';
import { WanderBot } from '../sim/game/bots/wander';
import { generateWorld } from '../sim/generation';
import { neutralInput } from '../sim/kernel/input';
import { missionSpec } from '../sim/kernel/mission';
import { Recorder } from '../sim/kernel/record/recording';
import { Simulation } from '../sim/game/sim';

export const GOLDEN_RECORDING = 'tests/golden/TAL-4471-wander.slrec';

const world = generateWorld(missionSpec('TAL-4471'), defaultTuning);
const sim = new Simulation(world, defaultTuning);
const recorder = new Recorder(sim, 'golden');
const bot = new WanderBot(world.seed);
const raw = neutralInput();
const brisk = structuredClone(defaultTuning);
brisk.bodies.player.speed.walk = 3.3;
for (let i = 0; i < 60 * defaultTuning.sim.tickHz; i++) {
  const input = bot.next(sim, raw);
  input.commands = i === 900 ? [{ kind: 'fire', lag: 0.4, yaw: input.yaw, pitch: -0.05 }] : [];
  if (i === 1200) {
    sim.setTuning(brisk);
    recorder.tuningChanged(sim);
  }
  if (i === 1500) recorder.annotate('marker', 'golden');
  recorder.record(sim, sim.step(input));
}
const bytes = recorder.finish(sim, '2026-11-07T00:00:00.000Z').toBytes();
writeFileSync(GOLDEN_RECORDING, bytes);
console.log(`wrote ${GOLDEN_RECORDING}: ${bytes.length} bytes, ${sim.tick} ticks, final ${sim.hash()}`);
