import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import type { AttackDriver } from '../src/sim/game/attacks';
import { FIREFIGHT_SECONDS, REHEARSAL_SECONDS, rehearse, rehearseFirefight } from '../src/sim/game/rehearsal';
import { firefight, meetingOf } from '../src/sim/game/scenes/firefight';
import { compound } from '../src/sim/game/scenes/compound';
import type { Simulation } from '../src/sim/game/sim';
import { generateWorld } from '../src/sim/generation';
import { missionSpec } from '../src/sim/kernel/mission';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { testWorld } from './fixtures';
import { worldOf } from './live';

/**
 * The rehearsal (game/rehearsal.ts): a camp's fight run once, out of sight, before anyone
 * plays, so that the first shot of the real one costs what the tenth does. It may change
 * when work is done and nothing else: a run after a rehearsal is the run without one.
 */

const SEED = 'LEB-2534';

/** The state's hash and the events of the first 40 s of a sniper on the camp. */
function fight(): { hash: string; events: number } {
  const world = worldOf(SEED);
  const scene = { ...(compound(`seed=${SEED}&attack=sniper&ready=alert`) as Scene<Simulation>), world: () => world };
  const sim = startScene(scene, T, world);
  const driver = scene.driver!() as AttackDriver;
  const raw = scene.game.still(sim);
  let events = 0;
  for (let i = 0; i < 40 * T.sim.tickHz; i++) events += sim.step(driver.next(sim, raw)).length;
  return { hash: sim.hash(), events };
}

describe('the rehearsal', () => {
  it('changes nothing about the run that follows it', () => {
    const before = fight();
    expect(rehearse(worldOf(SEED), T)).toBe(REHEARSAL_SECONDS * T.sim.tickHz);
    expect(fight()).toEqual(before);
    // And a fight really was rehearsed: the camp heard shots.
    expect(before.events).toBeGreaterThan(100);
  }, 240_000);

  it('rehearses a fight at close quarters too, and that changes nothing either', () => {
    const world = worldOf(SEED);
    const close = (): string => {
      const scene = { ...(firefight(`seed=${SEED}`) as Scene<Simulation>), world: () => world };
      const sim = startScene(scene, T, world);
      const driver = scene.driver!();
      const raw = scene.game.still(sim);
      for (let i = 0; i < 40 * T.sim.tickHz; i++) sim.step(driver.next(sim, raw));
      return sim.hash();
    };
    const before = close();
    expect(rehearseFirefight(world, T)).toBe(meetingOf(world, T) ? FIREFIGHT_SECONDS * T.sim.tickHz : 0);
    expect(close()).toBe(before);
  }, 240_000);

  it('has nothing to rehearse where there is no camp to attack', () => {
    expect(rehearse(testWorld(), T)).toBe(0);
    expect(rehearseFirefight(testWorld(), T)).toBe(0);
  });

  it('runs on the valley’s own camp as on any other', () => {
    expect(rehearse(generateWorld(missionSpec('TAL-4471'), T), T, 2)).toBe(2 * T.sim.tickHz);
  }, 120_000);
});
