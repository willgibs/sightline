import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/bots/chaos';
import { WanderBot } from '../src/sim/bots/wander';
import { dtanDeg } from '../src/sim/core/detmath';
import { bodyHeight } from '../src/sim/entities/player';
import { generateWorld } from '../src/sim/gen/world';
import { neutralInput, type InputFrame } from '../src/sim/input';
import { missionSpec } from '../src/sim/mission';
import { Simulation } from '../src/sim/sim';
import { Blocks, pushOutCircle } from '../src/sim/world/colliders';
import { makeTerrainSample } from '../src/sim/world/heightfield';

/**
 * Long bot runs over real valleys, checking after every tick what the controller
 * promises (CLAUDE.md rule 10): never under the terrain, never inside anything solid,
 * never more than one step up in a tick, never any height gained on ground too steep to
 * stand on, and never a NaN. One bot plays like a person, the other like a fuzzer.
 *
 * The audit that hardened the controller showed the old version of this test passing two
 * deliberately broken controllers, so the tolerances here are tight (0.1 mm).
 */

interface Run {
  ticks: number;
  below: number;
  inside: number;
  worstOverlap: number;
  worstRise: number;
  steepGain: number;
  nan: number;
}

function run(seed: string, bot: { next(sim: Simulation, out: InputFrame): InputFrame }, minutes: number): Run {
  const world = generateWorld(missionSpec(seed), T);
  const sim = new Simulation(world, T);
  const raw = neutralInput();
  const push = { x: 0, z: 0 };
  const ids: number[] = [];
  const sample = makeTerrainSample();
  const tanMax = dtanDeg(T.player.maxSlopeDeg);
  const out: Run = { ticks: 0, below: 0, inside: 0, worstOverlap: 0, worstRise: 0, steepGain: 0, nan: 0 };
  for (let i = 0; i < minutes * 60 * T.sim.tickHz; i++) {
    const before = sim.player;
    const y0 = before.y;
    world.terrain.sample(before.x, before.z, sample);
    const onSteep = before.grounded && before.standingOn < 0 && sample.slopeTan > tanMax;
    sim.step(bot.next(sim, raw));
    out.ticks++;
    const p = sim.player;
    if ([p.x, p.y, p.z, p.vx, p.vy, p.vz, p.yaw, p.pitch, p.eyeHeight].some((v) => v !== v)) out.nan++;
    if (p.y < world.terrain.heightAt(p.x, p.z) - 1e-6) out.below++;
    if (p.grounded) out.worstRise = Math.max(out.worstRise, p.y - y0);
    if (onSteep && p.standingOn < 0) out.steepGain = Math.max(out.steepGain, p.y - y0);
    const height = bodyHeight(p, T);
    world.colliders.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1, ids);
    for (const id of ids) {
      const c = world.colliders.list[id]!;
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= p.y + T.player.stepHeight || c.y0 >= p.y + height) continue;
      if (!pushOutCircle(c, p.x, p.z, T.player.radius, push)) continue;
      const depth = Math.sqrt(push.x * push.x + push.z * push.z);
      out.worstOverlap = Math.max(out.worstOverlap, depth);
      if (depth > 1e-4) out.inside++;
    }
  }
  return out;
}

function expectSound(r: Run): void {
  expect(r.nan).toBe(0);
  expect(r.below).toBe(0);
  expect(r.inside).toBe(0);
  expect(r.worstOverlap).toBeLessThan(1e-4);
  expect(r.worstRise).toBeLessThanOrEqual(T.player.stepHeight + 1e-9);
  // Ground too steep to stand on never lifts the body (a hair of slack for triangle seams).
  expect(r.steepGain).toBeLessThan(0.005);
}

describe('controller invariants on generated valleys', () => {
  it('hold for a bot that plays like a person', () => {
    for (const seed of ['TAL-4471', 'MUD-9031']) expectSound(run(seed, new WanderBot(seed), 4));
  });

  it('hold for a bot that plays like a fuzzer', () => {
    for (const seed of ['ELK-1618', 'ASH-1207', 'COL-3141']) expectSound(run(seed, new ChaosBot(seed), 4));
  });
});
