import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { SIGHTLINE } from '../src/sim/game/sim';

/**
 * A recording kept in the repository, re-simulated bit for bit: the loader, the input
 * codec, tuning changes, checkpoints and the simulation itself, end to end. When
 * SIM_VERSION, STATE_SCHEMA or RECORDING_VERSION changes on purpose, rewrite it with
 * `npm run golden`.
 */
describe('the golden recording', () => {
  const rec = Recording.fromBytes(new Uint8Array(readFileSync('tests/golden/TAL-4471-wander.slrec')));

  it('re-simulates bit for bit', () => {
    const result = resimulate(rec, { game: SIGHTLINE });
    expect(result.problem).toBeNull();
    expect(result.firstDivergence).toBeNull();
    expect(result.ok).toBe(true);
  });

  it('holds a shot, a tuning change and a marker', () => {
    expect(rec.readEvents().filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(rec.tuningChanges().map((c) => c.tick)).toEqual([1201]);
    expect(rec.annotations()).toEqual([{ tick: 1500, kind: 'marker', text: 'golden' }]);
  });
});
