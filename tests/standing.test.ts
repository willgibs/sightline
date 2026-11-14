import { describe, expect, it } from 'vitest';
import { parseResults, stringifyResults, toResultsFile, type ResultsFile } from '../src/lab/results';
import { STANDING, choose, compareBench, formatComparison, mergeParts, partOf, pieceName, shard, unchanged, whole, type BenchResults } from '../src/lab/standing';

/** The standing benches' comparison of two builds (src/lab/standing.ts), on small made-up results. */

function made(over: (f: ResultsFile) => void = () => {}): ResultsFile {
  const f: ResultsFile = {
    format: 1,
    experiment: 'made-up',
    about: 'a made-up bench',
    series: 'made',
    camps: 3,
    rolls: 1,
    measures: [
      { key: 'won', label: 'he got away', kind: 'rate' },
      { key: 'time', label: 'time to the siren (s)', kind: 'mean' },
    ],
    arms: ['as it was', 'with the change'].map((name, a) => ({
      name,
      ...(a === 0 ? { off: 'change' } : {}),
      runs: ['AAA-1', 'BBB-2', 'CCC-3'].map((seed, k) => ({ seed, roll: 0, values: { won: k % 2, time: 10 + k + a } })),
    })),
  };
  over(f);
  return f;
}

const side = (label: string, benches: Record<string, BenchResults>) => ({ label, benches: new Map(Object.entries(benches)) });

describe('results as data', () => {
  it('writes NaN as null and reads it back as NaN', () => {
    const exp = { name: 'x', about: 'y', series: 's', arms: [{ name: 'a' }, { name: 'b', off: 'z' }], measures: [{ key: 'm', label: 'M', kind: 'mean' as const }] };
    const file = toResultsFile(exp, ['S-1', 'S-2'], 2, new Map([
      ['a', [{ m: 1 }, { m: NaN }, { m: 2.5 }, { m: 3 }]],
      ['b', [{ m: 0 }, { m: 0 }, { m: 0 }, { m: NaN }]],
    ]));
    expect(file.arms[0]!.runs.map((r) => [r.seed, r.roll])).toEqual([['S-1', 0], ['S-1', 1], ['S-2', 0], ['S-2', 1]]);
    const text = stringifyResults(file);
    expect(text).toContain('"m":null');
    expect(text).not.toContain('NaN');
    const back = parseResults(text);
    expect(back.arms[0]!.runs[1]!.values.m).toBeNaN();
    expect(back.arms[1]!.off).toBe('z');
    expect(back.arms[0]!.runs[2]!.values.m).toBe(2.5);
  });
});

describe('the standing set', () => {
  it('runs own-side on three rolls of the dice', () => {
    expect(STANDING.find((b) => b.name === 'own-side')!.dice).toBe(3);
  });

  it('splits a dear bench by its camps, and deals every part of every bench to exactly one shard', () => {
    const all = choose();
    for (const n of [4, 8]) {
      const shards = Array.from({ length: n }, (_, k) => shard(all, k + 1, n));
      const pieces = shards.flat();
      for (const b of all) {
        const mine = pieces.filter((p) => p.bench.name === b.name);
        expect(mine.map((p) => p.part).sort((x, y) => x - y)).toEqual(Array.from({ length: mine[0]!.parts }, (_, k) => k));
      }
      // No piece is dearer than an even share, so no bench sets how long the set takes.
      const share = all.reduce((s, b) => s + b.cost, 0) / n;
      expect(pieces.every((p) => p.cost <= share + 1e-9)).toBe(true);
      expect(pieces.find((p) => p.bench.name === 'own-side')!.parts).toBeGreaterThan(1);
      // Dealt dearest first to the lightest shard: none is heavier than the lightest by more than one piece.
      const costs = shards.map((s) => s.reduce((c, p) => c + p.cost, 0));
      expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(Math.max(...pieces.map((p) => p.cost)));
    }
    expect(shard(all, 1, 1).map((p) => [p.bench.name, p.parts])).toEqual(all.map((b) => [b.name, 1]));
  });

  it("merges a bench's parts back into the file a whole run writes, run for run", () => {
    const seeds = ['A-1', 'B-2', 'C-3', 'D-4', 'E-5', 'F-6', 'G-7'];
    const exp = { name: 'x', about: 'y', series: 's', arms: [{ name: 'a' }, { name: 'b', off: 'z' }], measures: [{ key: 'm', label: 'M', kind: 'mean' as const }] };
    const values = (arm: number, of: readonly string[]) => of.flatMap((s) => [0, 1].map((roll) => ({ m: arm * 100 + Number(s.slice(2)) * 10 + roll })));
    const fileOf = (of: readonly string[]) => toResultsFile(exp, of, 2, new Map([['a', values(0, of)], ['b', values(1, of)]]));
    // Part p of n holds the camps at p, p + n, ... (src/headless/labRunner.ts): more parts than camps leaves some empty.
    for (const n of [1, 2, 3, 7, 9]) expect(mergeParts(Array.from({ length: n }, (_, p) => fileOf(seeds.filter((_, i) => i % n === p))))).toEqual(fileOf(seeds));
    expect(() => mergeParts([fileOf(seeds), { ...fileOf(seeds), rolls: 3 }])).toThrow(/aren't of one run/);
    expect(partOf(pieceName({ bench: STANDING[0]!, part: 2, parts: 3 }))).toEqual({ bench: STANDING[0]!.name, part: 2, parts: 3 });
    expect(pieceName(whole(STANDING[0]!))).toBe(STANDING[0]!.name);
    expect(partOf(STANDING[0]!.name)).toBeNull();
  });

  it('refuses a name that is not in the set', () => {
    expect(() => choose(['nonesuch'])).toThrow(/isn't a standing bench/);
    expect(choose(['answer', 'takedown']).map((b) => b.name)).toEqual(['takedown', 'answer']);
  });
});

describe('comparing two builds', () => {
  it('says a bench whose every run is the same is the same, in one line', () => {
    const d = compareBench('made-up', made(), made());
    expect(unchanged(d)).toBe(true);
    const text = formatComparison(side('main', { 'made-up': made() }), side('branch', { 'made-up': made() }));
    expect(text).toContain('- **made-up**: same, all 6 runs.');
    expect(text).not.toContain('###');
  });

  it('lists the runs that differ, largest first, and the figures they move', () => {
    const after = made((f) => {
      f.arms[1]!.runs[0]!.values.time = 30; // 11 → 30
      f.arms[1]!.runs[2]!.values.time = 14; // 13 → 14
    });
    const d = compareBench('made-up', made(), after);
    expect(d.arms[0]!.differ).toEqual([]);
    expect(d.arms[1]!.differ.map((r) => [r.seed, r.changes[0]!.before, r.changes[0]!.after])).toEqual([['AAA-1', 11, 30], ['CCC-3', 13, 14]]);
    // The mean of 11, 12, 13 against 30, 12, 14: only that arm's time moved.
    expect(d.figures.map((f) => [f.arm, f.measure])).toEqual([['with the change', 'time to the siren (s)']]);
    const text = formatComparison(side('main', { 'made-up': made() }), side('branch', { 'made-up': after }));
    expect(text).toContain('- **made-up**: 1 figure moved, 2 of 6 runs differ.');
    expect(text).toContain('  - AAA-1: time to the siren (s) 11 → 30');
    expect(text.indexOf('AAA-1')).toBeLessThan(text.indexOf('CCC-3'));
  });

  it('counts a value that appeared or went as the largest difference, and shows it as –', () => {
    const after = made((f) => {
      f.arms[0]!.runs[1]!.values.time = 99;
      f.arms[0]!.runs[2]!.values.won = NaN;
    });
    const d = compareBench('made-up', made(), after);
    expect(d.arms[0]!.differ[0]!.seed).toBe('CCC-3');
    expect(formatComparison(side('a', { 'made-up': made() }), side('b', { 'made-up': after }))).toContain('he got away 0 → –');
  });

  it('caps the runs listed per arm and says how many more', () => {
    const before = made((f) => {
      f.arms[0]!.runs = Array.from({ length: 9 }, (_, k) => ({ seed: `S-${k}`, roll: 0, values: { won: 0, time: k } }));
    });
    const after = made((f) => {
      f.arms[0]!.runs = Array.from({ length: 9 }, (_, k) => ({ seed: `S-${k}`, roll: 0, values: { won: 0, time: k * 2 } }));
    });
    const text = formatComparison(side('a', { m: before }), side('b', { m: after }), 3);
    expect(text).toContain('8 of 9 runs');
    expect(text).toContain('  - S-8: time to the siren (s) 8 → 16');
    expect(text).toContain('  - and 5 more');
  });

  it('matches arms and measures by name and key, and lists the ones on one side only', () => {
    const after = made((f) => {
      f.arms.push({ name: 'a new arm', runs: [{ seed: 'AAA-1', roll: 0, values: { won: 1, time: 1 } }] });
      f.measures.push({ key: 'shots', label: 'shots fired', kind: 'mean' });
      for (const a of f.arms) for (const r of a.runs) r.values.shots = 3;
      f.arms.reverse();
    });
    const d = compareBench('made-up', made(), after);
    expect(d.armsOnlyAfter).toEqual(['a new arm']);
    expect(d.measuresOnlyAfter).toEqual(['shots fired']);
    expect(d.arms.every((a) => a.differ.length === 0)).toBe(true);
    expect(d.figures).toEqual([]);
    const text = formatComparison(side('a', { m: made() }), side('b', { m: after }));
    expect(text).toContain('0 figures moved, 0 of 6 runs differ, 2 arms or measures on one side only');
    expect(text).toContain('Arms only after: *a new arm*.');
  });

  it('shows the roll when a bench rolls the dice more than once, and runs on one side only', () => {
    const before = made((f) => {
      f.rolls = 2;
      for (const a of f.arms) a.runs = a.runs.flatMap((r) => [r, { ...r, roll: 1, values: { ...r.values } }]);
    });
    const after = made((f) => {
      f.rolls = 2;
      for (const a of f.arms) a.runs = a.runs.flatMap((r) => [r, { ...r, roll: 1, values: { ...r.values } }]);
      f.arms[0]!.runs[3]!.values.won = 0;
      f.arms[0]!.runs.pop();
    });
    const text = formatComparison(side('a', { m: before }), side('b', { m: after }));
    expect(text).toContain('  - BBB-2 roll 1: he got away 1 → 0');
    expect(text).toContain('(and 1 only before)');
  });

  it('reports a bench one build lacks without failing', () => {
    const text = formatComparison(side('base', { hunt: { missing: 'no such experiment' }, m: made() }), side('head', { hunt: made(), m: made() }));
    expect(text).toContain("- **hunt**: not in the build before (no such experiment); ran after.");
    expect(text).toContain('- **m**: same');
  });
});
