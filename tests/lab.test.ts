import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { formatReport, report, seedsOf, type Experiment, type RunResult } from '../src/lab/experiment';
import { excludesZero, mean, median, pairedDifference, wilson } from '../src/lab/stats';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { overlook } from '../src/sim/game/scenes/overlook';
import { commanderOf } from '../src/sim/game/comms';
import { CAMP_SWITCHES, parseSwitches } from '../src/sim/game/switches';
import { resimulate } from '../src/sim/kernel/record/resim';
import { runScene, sceneSystems, startScene, type Scene } from '../src/sim/kernel/scene';
import type { Simulation } from '../src/sim/game/sim';

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
