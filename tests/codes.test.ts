import { describe, expect, it } from 'vitest';
import { CODE_RANGES, type CodeRange } from '../src/sim/kernel/codes';
import { COMMANDS } from '../src/sim/kernel/commands';
import { EVENTS } from '../src/sim/kernel/events';

/**
 * Event and command codes are recorded as one byte and never reused, and each lane takes
 * its codes from its own range (kernel/codes.ts), so lab branches can't collide.
 */

const ranges = Object.entries(CODE_RANGES) as Array<[CodeRange, readonly [number, number]]>;

describe('event and command codes', () => {
  it('come from ranges that split one byte between the lanes, without gaps or overlaps', () => {
    const sorted = [...ranges].sort((a, b) => a[1][0] - b[1][0]);
    expect(sorted[0]![1][0]).toBe(1);
    expect(sorted.at(-1)![1][1]).toBe(255);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k]![1][0], sorted[k]![0]).toBe(sorted[k - 1]![1][1] + 1);
    for (const [, [first, last]] of ranges) expect(first).toBeLessThanOrEqual(last);
  });

  for (const [name, registry] of [
    ['event types', EVENTS],
    ['command kinds', COMMANDS],
  ] as const) {
    it(`are unique among the ${name}, each inside the range its entry names`, () => {
      const seen = new Map<number, string>();
      for (const [key, spec] of Object.entries(registry) as Array<[string, { code: number; range: CodeRange }]>) {
        const [first, last] = CODE_RANGES[spec.range];
        expect(Number.isInteger(spec.code), key).toBe(true);
        expect(spec.code >= first && spec.code <= last, `${key}: code ${spec.code} is outside ${spec.range} (${first}–${last})`).toBe(true);
        expect(seen.get(spec.code), `${key} and ${seen.get(spec.code)} share code ${spec.code}`).toBeUndefined();
        seen.set(spec.code, key);
      }
    });
  }
});
