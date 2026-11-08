import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../../src/config/tuning';
import { startScene } from '../../src/sim/kernel/scene';
import { SCENES } from '../../src/sim/game/scenes';

/**
 * The perception budget (A11), in this browser's own engine: sixteen guards seeing and
 * hearing at once (the perception crowd), a minute and a half of the walk in. The work it
 * does is pinned by count in the bench (rays, grid nodes); this measures what it costs here,
 * in V8, SpiderMonkey and JavaScriptCore, against a 33 ms tick.
 *
 * Browsers coarsen their clocks (Firefox to a millisecond), so the cost is timed over the
 * whole run, not tick by tick.
 */
describe('the perception budget in this browser', () => {
  it('keeps sixteen perceiving guards to a small share of a tick', () => {
    const scene = SCENES['perception-crowd']!();
    const sim = startScene(scene, T);
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    const ticks = 90 * T.sim.tickHz;
    // Warm the engine first, then measure.
    for (let i = 0; i < 60; i++) sim.step(driver.next(sim, raw));
    const t0 = performance.now();
    for (let i = 60; i < ticks; i++) sim.step(driver.next(sim, raw));
    const perTick = (performance.now() - t0) / (ticks - 60);
    console.log(`perception crowd: ${sim.guards.length} guards, ${(perTick * 1000).toFixed(0)} µs a tick`);
    expect(sim.guards.length).toBe(16);
    // A tick is 33 ms; the frame's own work at 60 Hz about 10 ms. Sixteen guards stay well under.
    expect(perTick).toBeLessThan(2);
  });
});
