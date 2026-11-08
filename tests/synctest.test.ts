import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { generateWorld } from '../src/sim/generation';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { RecordingFormatError } from '../src/sim/kernel/record/bytes';
import { decodeState, encodeState } from '../src/sim/kernel/record/stateCodec';
import { Faction, STATE_SCHEMA, hashState, type SimState, type SolidEntity } from '../src/sim/kernel/state';
import { SyncTest, describeSyncFailure } from '../src/sim/kernel/synctest';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';

const world = generateWorld(missionSpec('TAL-4471'), T);

/** Plays the fuzzing bot for `ticks`, under a synctest every `every` ticks. */
function play(systems: readonly import('../src/sim/kernel/systems').System[], ticks: number, every: number, setup?: (sim: Simulation) => void): SyncTest {
  const sim = new Simulation(world, T, systems);
  const shadow = new Simulation(world, T, systems);
  setup?.(sim);
  setup?.(shadow);
  const sync = new SyncTest(sim, shadow, every);
  const bot = new ChaosBot('TAL-4471');
  const raw = neutralInput();
  for (let i = 0; i < ticks && !sync.report.failure; i++) {
    sync.beforeTick();
    sim.step(bot.next(sim, raw));
    sync.afterTick();
  }
  return sync;
}

describe('the save-state codec', () => {
  it('round-trips a state exactly: every bit, −0 and NaN, and every key in its order', () => {
    const sim = new Simulation(world, T);
    const bot = new ChaosBot('TAL-4471');
    const raw = neutralInput();
    for (let i = 0; i < 300; i++) sim.step(bot.next(sim, raw));
    const odd = structuredClone(sim.state) as SimState & { extra?: unknown };
    (odd.rng as Record<string, unknown>)['9.odd'] = [-0, NaN, Number.MIN_VALUE, -Number.MAX_VALUE];
    const back = decodeState(encodeState(odd));
    expect(hashState(back)).toBe(hashState(odd));
    expect(Object.is((back.rng['9.odd'] as number[])[0], -0)).toBe(true);
    expect(Number.isNaN((back.rng['9.odd'] as number[])[1])).toBe(true);
    expect(JSON.stringify(Object.keys(back.entities[0]!))).toBe(JSON.stringify(Object.keys(odd.entities[0]!)));
    expect(back).toEqual(odd);
  });

  it('refuses what it can’t trust: another schema, damage, trailing bytes', () => {
    const bytes = encodeState(new Simulation(world, T).state);
    expect(() => decodeState(bytes.slice(0, bytes.length - 3))).toThrow(RecordingFormatError);
    expect(() => decodeState(new Uint8Array([...bytes, 0]))).toThrow(/after the tree/);
    const other = bytes.slice();
    new DataView(other.buffer).setUint32(8, STATE_SCHEMA + 1, true);
    expect(() => decodeState(other)).toThrow(/schema/);
    expect(() => decodeState(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a Sightline save-state/);
  });
});

describe('the synctest', () => {
  it('finds nothing in an honest run: every restore, through the codec and by rollback, re-steps the same', () => {
    const sync = play(SYSTEMS, 900, 30);
    expect(sync.report.failure).toBeNull();
    expect(sync.report.saves).toBe(30);
    expect(sync.report.ticks).toBe(30 * 30 * 2);
  });

  it('catches state kept outside the tree, and says which part and path', () => {
    // A crate pushed by a counter kept in a closure: a restore can't rewind it.
    let pushes = 0;
    const hidden: System = {
      name: 'hidden-pusher',
      phase: 'world',
      reads: [],
      writes: ['solid.solid'],
      emits: [],
      run(ctx) {
        const crate = ctx.index.of('solid')[0]!;
        crate.solid.x = 400 + 0.01 * pushes++;
      },
    };
    const crate = (id: number): SolidEntity => ({ id, kind: 'solid', faction: Faction.None, solid: { kind: 'box', id: 0, x: 400, z: 400, y0: 0, y1: 1, hx: 0.5, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood } });
    const sync = play(withSystem(SYSTEMS, hidden), 300, 30, (sim) => void sim.spawn(crate));
    const f = sync.report.failure!;
    expect(f).not.toBeNull();
    expect(f.how).toBe('codec');
    expect(f.parts).toEqual(['solid:9']);
    expect(f.paths[0]!.path).toBe('solid:9.solid.x');
    // The first tick re-stepped from the save at tick 0: the counter is at 30, not 0.
    expect(describeSyncFailure(f)).toMatch(/^tick 1, put back by codec: solid:9 differ \(solid:9\.solid\.x: 400 → 400\.3/);
  });
});
