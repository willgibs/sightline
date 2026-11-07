import { describe, expect, it } from 'vitest';
import { runSelfTest } from '../src/sim/selftest';

describe('determinism self-test', () => {
  it('matches the golden values in this engine', () => {
    for (const r of runSelfTest()) expect({ name: r.name, hash: r.got }).toEqual({ name: r.name, hash: r.expected });
  });
});
