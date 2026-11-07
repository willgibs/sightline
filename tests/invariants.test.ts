import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { WanderBot } from '../src/sim/bots/wander';
import { generateWorld } from '../src/sim/gen/world';
import { neutralInput } from '../src/sim/input';
import { Simulation } from '../src/sim/sim';
import { Blocks, pushOutCircle } from '../src/sim/world/colliders';
import { missionSpec } from '../src/sim/mission';

/**
 * Long bot runs over real valleys, checking after every tick that the player is never
 * under the terrain and never inside anything solid.
 */
describe('controller invariants on generated valleys', () => {
  it('never sinks into the ground or into solid objects', () => {
    const push = { x: 0, z: 0 };
    const ids: number[] = [];
    let ticks = 0;
    let below = 0;
    let worst = 0;
    for (const seed of ['TAL-4471', 'MUD-9031']) {
      const world = generateWorld(missionSpec(seed), T);
      const sim = new Simulation(world, T);
      const bot = new WanderBot(seed);
      const raw = neutralInput();
      for (let i = 0; i < 30 * 60 * 4; i++) {
        sim.step(bot.next(sim, raw));
        ticks++;
        const p = sim.player;
        if (p.y < world.terrain.heightAt(p.x, p.z) - 1e-6) below++;
        const height = T.player.height[p.stance];
        world.colliders.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1, ids);
        for (const id of ids) {
          const c = world.colliders.list[id]!;
          if ((c.flags & Blocks.Move) === 0 || c.y1 <= p.y + T.player.stepHeight || c.y0 >= p.y + height) continue;
          if (pushOutCircle(c, p.x, p.z, T.player.radius, push)) worst = Math.max(worst, Math.hypot(push.x, push.z));
        }
      }
    }
    expect(ticks).toBe(14400);
    expect(below).toBe(0);
    expect(worst).toBeLessThan(0.01);
  });
});
