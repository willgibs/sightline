import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { commanderOf } from '../src/sim/game/comms';
import { PERCEPT_ROOTS } from '../src/sim/game/benches';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import type { Simulation } from '../src/sim/game/sim';
import type { SimEvent } from '../src/sim/kernel/events';
import { runScene, startScene } from '../src/sim/kernel/scene';
import { resimulate } from '../src/sim/kernel/record/resim';
import { shooterScene } from './live';

/**
 * The camp brain on generated camps (E13): everything lab E built, on the camps lab D
 * generates. A marksman fires from the camp's best overview at whatever he can see.
 */

const SEEDS = ['LEB-2534', 'KUV-9210', 'HUM-0755'];

function play(seed: string, seconds: number): { sim: Simulation; events: SimEvent[] } {
  const scene = shooterScene(seed, seconds);
  const sim = startScene(scene, T);
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds * T.sim.tickHz && sim.state.outcome.status === 'playing'; t++) events.push(...sim.step(driver.next(sim, raw)).map((e) => ({ ...e })));
  return { sim, events };
}

describe('a live camp (E13)', () => {
  for (const seed of SEEDS) {
    it(`answers shots from its best overview, ${seed}: a reaction inside 2 s, an alarm at its own box, and the target in his room`, () => {
      const { sim, events } = play(seed, 60);
      expect(sim.fault).toBeFalsy();
      const shot = events.find((e) => e.type === 'shot' && e.source === sim.playerId)!;
      expect(shot).toBeDefined();
      const reaction = events.find((e) => e.type === 'act' && e.tick >= shot.tick && e.to !== 'routine' && e.to !== 'return');
      expect(reaction, 'nobody reacted').toBeDefined();
      expect((reaction!.tick - shot.tick) / T.sim.tickHz).toBeLessThanOrEqual(2);
      const raised = events.find((e) => e.type === 'alarm' && e.stage === 'raised') as Extract<SimEvent, { type: 'alarm' }> | undefined;
      expect(raised, 'no alarm raised').toBeDefined();
      // It takes more than the first shot: a man who watched one of his own go down, or fire that has come again.
      expect(raised!.tick).toBeGreaterThan(shot.tick);
      // The box the commander knows is lab D's entity, raised with it.
      expect(sim.index.of('alarm').filter((a) => a.alarm.raised).length).toBe(1);
      const camp = commanderOf(sim)!.camp;
      expect(camp.level).toBe('lockdown');
      // Every camp protects its target: at the first sign of trouble he goes to his room, and the siren doesn't send him running.
      const target = camp.objective!.target;
      expect(events.some((e) => e.type === 'act' && e.source === target && e.to === 'shelter'), 'the target never went to his room').toBe(true);
      const ran = events.find((e) => e.type === 'act' && e.source === target && e.to === 'flee');
      if (ran) expect((ran.tick - raised!.tick) / T.sim.tickHz, 'he ran at the siren').toBeGreaterThan(T.brain.protect.answer.prep / 2);
    }, 180_000);
  }

  it('with its protection switched off, runs him for his vehicle at the siren and loses him: lab E’s chain, whole', () => {
    const scene = shooterScene(SEEDS[0]!, 120, 8, 6, '&off=protect');
    const sim = startScene(scene, T);
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    const events: SimEvent[] = [];
    for (let t = 0; t < 120 * T.sim.tickHz && sim.state.outcome.status === 'playing'; t++) events.push(...sim.step(driver.next(sim, raw)).map((e) => ({ ...e })));
    expect(events.some((e) => e.type === 'act' && e.to === 'flee'), 'the target never ran').toBe(true);
    expect(sim.state.outcome).toMatchObject({ status: 'failed', reason: expect.stringMatching(/^the target got away/) });
    expect(sim.index.of('objective')[0]!.objective.status).toBe('escaped');
  }, 180_000);

  it('explains every reaction, back to something sensed', () => {
    const { events } = play(SEEDS[0]!, 90);
    const byId = new Map(events.map((e) => [e.id, e]));
    const reactions = events.filter((e) => e.type === 'act' && e.to !== 'routine' && e.to !== 'return');
    expect(reactions.length).toBeGreaterThan(10);
    const unexplained = reactions.filter((r) => {
      let cause = r.cause;
      for (let hops = 0; hops < 32 && cause !== 0; hops++) {
        const c = byId.get(cause);
        if (!c) return true;
        if (PERCEPT_ROOTS.has(c.type)) return false;
        cause = c.cause;
      }
      return true;
    });
    expect(unexplained.map((e) => `${e.type} ${(e as { to?: string }).to} at ${e.tick}`)).toEqual([]);
  }, 180_000);

  it('re-simulates bit for bit', () => {
    const scene = shooterScene(SEEDS[1]!, 40);
    const run = runScene(scene, T);
    expect(run.failures).toEqual([]);
    const again = resimulate(run.recording, { scene });
    expect(again.problem).toBeNull();
    expect(again.ok).toBe(true);
  }, 180_000);

  it('is named by its seed and difficulty, and refuses what it cannot build', () => {
    expect(liveCamp('seed=ABC-1234&difficulty=0.25').params).toBe('seed=ABC-1234&difficulty=0.25');
    expect(liveCamp().params).toBe('seed=LEB-2534&difficulty=0.5');
    expect(() => liveCamp('difficulty=2')).toThrow(/between 0 and 1/);
    expect(() => liveCamp('plan=now')).toThrow(/doesn't know/);
  });
});
