import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene } from '../src/sim/kernel/scene';
import { SyncTest, describeSyncFailure } from '../src/sim/kernel/synctest';
import { campBrain } from '../src/sim/game/scenes/campBrain';

/**
 * The camp brain under synctest: every 20 ticks the state is saved (through the codec
 * and by clone) and put back, and the same inputs re-stepped: anything the brain keeps
 * outside the state tree, or restores differently, shows up here.
 */
describe('the camp brain, under synctest', () => {
  it('re-steps bit for bit from every save, with a bot in the camp', () => {
    const tuning = structuredClone(T);
    tuning.brain.combat.playerHits = 1e6;
    const scene = campBrain();
    const sim = startScene(scene, tuning);
    const shadow = startScene(scene, tuning);
    const sync = new SyncTest(sim, shadow, 20);
    const bot = new ChaosBot('CAMP-SYNC');
    const raw = neutralInput();
    for (let i = 0; i < 40 * 30; i++) {
      sync.beforeTick();
      sim.step(bot.next(sim, raw));
      sync.afterTick();
      if (sync.report.failure) break;
    }
    expect(sync.report.failure, sync.report.failure ? describeSyncFailure(sync.report.failure) : '').toBeNull();
    expect(sync.report.saves).toBeGreaterThan(40);
  });
});
