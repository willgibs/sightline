import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deal } from './deal';

/**
 * How CI deals the test files to its shards (tests/sequencer.ts). A file dealt to no shard
 * would never run while CI stayed green, so every file must go to exactly one, whatever the
 * timings say.
 */
describe("the deal of test files to CI's shards", () => {
  const timings = JSON.parse(readFileSync(new URL('./timings.json', import.meta.url), 'utf8')) as Record<string, number>;
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.ts')).map((f) => `tests/${f}`);
  const known = Object.values(timings).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)] ?? 1;
  const items = files.map((f) => ({ key: f, cost: timings[f] ?? median, item: f }));

  it('deals every test file to exactly one shard, at any count', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      const shards = deal(items, n);
      expect(shards).toHaveLength(n);
      expect(shards.flat().sort()).toEqual([...files].sort());
    }
  });

  it('leaves no shard heavier than the lightest by more than the dearest file', () => {
    const cost = (f: string): number => timings[f] ?? median;
    for (const n of [3, 4]) {
      const loads = deal(items, n).map((s) => s.reduce((t, f) => t + cost(f), 0));
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(Math.max(...items.map((i) => i.cost)));
    }
  });

  it('deals the same way whatever order the files come in', () => {
    expect(deal([...items].reverse(), 4)).toEqual(deal(items, 4));
  });
});
