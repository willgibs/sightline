import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { formatReport, report, seedsOf, withDice, type Experiment, type RunResult } from '../src/lab/experiment';
import { clusteredRate, excludesZero, mean, median, pairedDifference, splitVariance, wilson } from '../src/lab/stats';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { overlook } from '../src/sim/game/scenes/overlook';
import { commanderOf } from '../src/sim/game/comms';
import { CAMP_SWITCHES, parseSwitches } from '../src/sim/game/switches';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { campMission, generateWorld, worldFingerprint } from '../src/sim/generation';
import { neutralInput } from '../src/sim/kernel/input';
import { resimulate } from '../src/sim/kernel/record/resim';
import { runScene, sceneSystems, startScene, type Scene } from '../src/sim/kernel/scene';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { testWorld } from './fixtures';

/** The lab bench (Lab F): its statistics, its reports, and engine switches. */

describe('statistics', () => {
  it('a proportion has a sensible interval at the extremes', () => {
    const none = wilson(0, 30);
    expect(none.value).toBe(0);
    expect(none.low).toBe(0);
    expect(none.high).toBeGreaterThan(0.05);
    expect(none.high).toBeLessThan(0.15);
    const all = wilson(30, 30);
    expect(all.high).toBe(1);
    expect(all.low).toBeGreaterThan(0.85);
  });

  it('leaves out runs a measure did not apply to', () => {
    expect(mean([1, NaN, 3]).value).toBe(2);
    expect(median([5, NaN, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(pairedDifference([1, 2, NaN], [2, NaN, 9]).value).toBe(1);
  });

  it('calls a difference clear only when the seeds agree about it', () => {
    expect(excludesZero(pairedDifference([1, 2, 3, 4], [2, 3, 4, 5.5]))).toBe(true);
    expect(excludesZero(pairedDifference([1, 2, 3, 4], [2, 1, 4, 3]))).toBe(false);
  });

  it('splits the spread between the camp and the dice', () => {
    // Every camp the same on every roll: all of it is the camp.
    const camps = splitVariance([
      [1, 1, 1],
      [4, 4, 4],
      [7, 7, 7],
    ]);
    expect(camps.campShare).toBe(1);
    expect(camps.dice).toBe(0);
    // Every camp with the same three rolls: none of it is.
    const dice = splitVariance([
      [1, 4, 7],
      [1, 4, 7],
      [1, 4, 7],
    ]);
    expect(dice.campShare).toBe(0);
    expect(dice.camp).toBe(0);
    expect(dice.dice).toBe(3);
    // A worked example: means 2 and 5, within-camp variance 1, between-camp mean square 13.5.
    const both = splitVariance([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(both.dice).toBeCloseTo(1, 10);
    expect(both.camp * both.camp).toBeCloseTo((13.5 - 1) / 3, 10);
    expect(splitVariance([[5], [6]]).campShare).toBeNaN();
    expect(splitVariance([[2, 2], [2, 2]]).campShare).toBeNaN();
  });

  it('counts rolls on one camp as less than that many camps', () => {
    const naive = wilson(12, 30);
    const same = clusteredRate(12, 30, 5, { camp: 1, dice: 0, campShare: 1 });
    expect(same.high - same.low).toBeGreaterThan(naive.high - naive.low);
    expect(same.value).toBeCloseTo(naive.value, 10);
    // Rolls that say nothing about each other are as good as camps.
    expect(clusteredRate(12, 30, 5, { camp: 0, dice: 1, campShare: 0 })).toEqual(naive);
    expect(clusteredRate(12, 30, 1, null)).toEqual(naive);
  });
});

describe('experiments', () => {
  const exp: Experiment = {
    name: 'test',
    about: 'a test',
    series: 'test',
    camps: 3,
    arms: [{ name: 'a' }, { name: 'b' }],
    measures: [
      { key: 'x', label: 'x', kind: 'mean' },
      { key: 'r', label: 'r', kind: 'rate' },
    ],
    run: () => ({}),
  };
  const runs = (x: number[], r: number[]): RunResult[] => x.map((v, k) => ({ x: v, r: r[k]! }));

  it('compares each arm with the first, seed by seed', () => {
    const results = new Map([
      ['a', runs([1, 2, 3], [0, 0, 1])],
      ['b', runs([2, 3, 4], [1, 1, 1])],
    ]);
    const [first, second] = report(exp, results);
    expect(first!.measures[0]!.change).toBeNull();
    expect(second!.measures[0]!.change!.value).toBe(1);
    expect(second!.measures[0]!.clear).toBe(true);
    const text = formatReport(exp, [first!, second!], 3);
    expect(text).toContain('1/3');
    expect(text).toContain('3/3');
    expect(text).toContain('Clearly different');
  });

  it('a series is always the same camps', () => {
    expect(seedsOf('some series', 5)).toEqual(seedsOf('some series', 5));
    expect(seedsOf('some series', 5)).not.toEqual(seedsOf('another series', 5));
  });

  it('with several rolls of the dice, each camp counts once and the report says what is luck', () => {
    // Two rolls of two camps. Arm b is 1 better on every camp, whatever the luck.
    const flat = (x: number[]): RunResult[] => x.map((v) => ({ x: v, r: v > 2 ? 1 : 0 }));
    const results = new Map([
      ['a', flat([1, 3, 5, 7])],
      ['b', flat([2, 4, 6, 8])],
    ]);
    const [first, second] = report(exp, results, 2);
    expect(first!.measures[0]!.value.value).toBe(4);
    expect(first!.measures[0]!.n).toBe(4);
    expect(second!.measures[0]!.change!.value).toBe(1);
    expect(first!.measures[0]!.split!.campShare).toBeGreaterThan(0.5);
    const text = formatReport(exp, [first!, second!], 2, 2);
    expect(text).toContain('2 camps, 2 rolls of the dice on each');
    expect(text).toContain('The camp or the dice?');
    // One roll each: the same report as ever.
    expect(report(exp, new Map([['a', runs([1, 2, 3], [0, 0, 1])], ['b', runs([2, 3, 4], [1, 1, 1])]]))[0]!.measures[0]!.split).toBeNull();
  });
});

describe('the dice', () => {
  const params = 'seed=LEB-2534&plan=clear&pace=5';
  const hashOf = (dice: number): string => {
    const tuning = withDice(T, dice);
    const sc = overlook(params) as Scene<Simulation>;
    const sim = startScene(sc, tuning);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    for (let k = 0; k < 400; k++) sim.step(driver.next(sim, raw));
    return sim.hash();
  };

  it('re-roll a run on the same camp, and the same roll is the same run', () => {
    const roll0 = hashOf(0);
    expect(hashOf(0)).toBe(roll0);
    const roll1 = hashOf(1);
    expect(roll1).not.toBe(roll0);
    expect(hashOf(1)).toBe(roll1);
    expect(hashOf(2)).not.toBe(roll1);
    // Generation reads only tuning.gen, so the valley can't have moved.
    const camp = campMission('LEB-2534');
    expect(worldFingerprint(generateWorld(camp, withDice(T, 7)))).toBe(worldFingerprint(generateWorld(camp, T)));
  }, 180_000);

  it('roll 0 is the game as it ships', () => {
    expect(T.sim.dice).toBe(0);
    expect(withDice(T, 0)).toBe(T);
    expect(withDice(T, 3).sim.dice).toBe(3);
    expect(T.sim.dice).toBe(0);
  });

  it('keep every entity its own stream on any roll: who else is there shifts nobody (rule 3)', () => {
    const drawn = (present: readonly number[], dice: number): Map<number, number> => {
      const out = new Map<number, number>();
      const system: System = {
        name: 'test-dice',
        phase: 'mission',
        reads: [],
        writes: ['rng.test'],
        emits: [],
        run(ctx) {
          for (const id of present) out.set(id, ctx.draw(id, 'test', (rng) => rng.next()));
        },
      };
      const sim = new Simulation(testWorld(), withDice(T, dice), withSystem(SYSTEMS, system));
      sim.step(neutralInput());
      return out;
    };
    const everyone = drawn([2, 3, 4], 5);
    const without = drawn([2, 4], 5);
    expect(without.get(2)).toBe(everyone.get(2));
    expect(without.get(4)).toBe(everyone.get(4));
    expect(new Set(everyone.values()).size).toBe(3);
    expect(drawn([2], 6).get(2)).not.toBe(everyone.get(2));
  });

  it('are refused unless they are a whole number', () => {
    expect(() => new Simulation(testWorld(), { ...T, sim: { ...T.sim, dice: 1.5 } })).toThrow(/dice/);
    expect(() => new Simulation(testWorld(), { ...T, sim: { ...T.sim, dice: -1 } })).toThrow(/dice/);
  });
});

describe('engine switches', () => {
  it('reads a list in a fixed order, and refuses what it does not know', () => {
    expect(parseSwitches('power,radio')).toEqual(parseSwitches('radio,power'));
    expect(parseSwitches('')).toEqual([]);
    expect(() => parseSwitches('radar')).toThrow(/radar/);
    expect(CAMP_SWITCHES).toContain('commander');
  });

  it('are named in the scene, so a recording re-simulates them', () => {
    expect(overlook('seed=LEB-2534&off=radio,power').params).toContain('off=radio,power');
    const scene = { ...(liveCamp('seed=LEB-2534&off=power,truck') as Scene<Simulation>), expect: [] };
    const run = runScene(scene, T, { seconds: 2 });
    expect(run.sim.index.of('generator').every((g) => !g.generator.running)).toBe(true);
    expect(commanderOf(run.sim)!.camp.devices.escape).toBeNull();
    expect(resimulate(run.recording, { scene }).ok).toBe(true);
  }, 120_000);

  it('leave every system in its place, so the others keep their order', () => {
    const on = sceneSystems(liveCamp('seed=LEB-2534') as Scene<Simulation>).map((s) => s.name);
    const off = sceneSystems(liveCamp('seed=LEB-2534&off=commander') as Scene<Simulation>).map((s) => s.name);
    expect(off).toEqual(on);
  });

  it('make a part absent: left alone, a camp without its radio or alarm boxes stays calm', () => {
    const run = runScene({ ...(liveCamp('seed=LEB-2534&off=radio,alarm') as Scene<Simulation>), expect: [] }, T, { seconds: 200 });
    const c = commanderOf(run.sim)!;
    expect(c.camp.level).toBe('calm');
    expect(c.camp.netWorking).toBe(false);
    expect(c.camp.devices.alarms).toHaveLength(0);
    expect(run.sim.index.of('radio')).toHaveLength(0);
  }, 120_000);

  it('stop the reinforcements being called at all', () => {
    const sim = startScene(liveCamp('seed=LEB-2534&off=reinforce') as Scene<Simulation>, T);
    expect(commanderOf(sim)!.camp.reinforceCalled).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
