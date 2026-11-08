import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/bots/chaos';
import { InvariantWatch, OVERLAP_TOLERANCE, STEEP_TOLERANCE, type InvariantReport } from '../src/sim/bots/invariants';
import { WanderBot } from '../src/sim/bots/wander';
import { generateWorld } from '../src/sim/gen/world';
import { neutralInput, type InputFrame } from '../src/sim/input';
import { missionSpec } from '../src/sim/mission';
import { Simulation } from '../src/sim/sim';

/**
 * Long bot runs over real valleys, checking after every tick what the motor promises
 * every body (CLAUDE.md rule 10, src/sim/bots/invariants.ts). One bot plays like a
 * person, the other like a fuzzer; the guards keep their routines throughout. The weekly
 * run goes much longer, over fresh valleys (`npm run fuzz`).
 */

function run(seed: string, bot: { next(sim: Simulation, out: InputFrame): InputFrame }, minutes: number): InvariantReport {
  const sim = new Simulation(generateWorld(missionSpec(seed), T), T);
  const watch = new InvariantWatch(sim);
  const raw = neutralInput();
  for (let i = 0; i < minutes * 60 * T.sim.tickHz; i++) {
    watch.beforeTick();
    sim.step(bot.next(sim, raw));
    watch.afterTick();
  }
  return watch.report;
}

function expectSound(r: InvariantReport): void {
  expect(r.first).toBeNull();
  expect(r.nan).toBe(0);
  expect(r.below).toBe(0);
  expect(r.inside).toBe(0);
  expect(r.worstOverlap).toBeLessThan(OVERLAP_TOLERANCE);
  expect(r.worstRise).toBeLessThanOrEqual(T.bodies.player.stepHeight + 1e-9);
  expect(r.steepGain).toBeLessThan(STEEP_TOLERANCE);
  // Every body was watched, not just the player's.
  expect(r.checks).toBeGreaterThan(r.ticks);
}

describe('motor invariants on generated valleys', () => {
  it('hold for a bot that plays like a person', () => {
    for (const seed of ['TAL-4471', 'MUD-9031']) expectSound(run(seed, new WanderBot(seed), 4));
  });

  it('hold for a bot that plays like a fuzzer', () => {
    for (const seed of ['ELK-1618', 'ASH-1207', 'COL-3141']) expectSound(run(seed, new ChaosBot(seed), 4));
  });

  it('catch a body that breaks a promise', () => {
    // The watch itself must not pass a broken motor: lift the player half a metre mid-run.
    const sim = new Simulation(generateWorld(missionSpec('TAL-4471'), T), T);
    const watch = new InvariantWatch(sim);
    const bot = new WanderBot('TAL-4471');
    const raw = neutralInput();
    for (let i = 0; i < 60; i++) {
      watch.beforeTick();
      sim.step(bot.next(sim, raw));
      if (i === 30) sim.player.y += 0.5;
      watch.afterTick();
    }
    expect(watch.sound).toBe(false);
    expect(watch.report.first).toMatchObject({ tick: 31, entity: sim.playerId });
    expect(watch.report.first!.what).toMatch(/^rose 0\.(49|50)/);
  });
});
