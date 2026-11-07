import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/bots/chaos';
import { WanderBot } from '../src/sim/bots/wander';
import { generateWorld } from '../src/sim/gen/world';
import { neutralInput, type InputFrame } from '../src/sim/input';
import { missionSpec } from '../src/sim/mission';
import { Simulation } from '../src/sim/sim';
import { assertPlain, hashState, type SimState } from '../src/sim/state';

/**
 * The state tree: plain data, completely covered by the hash, and restorable so that a
 * run continues bit for bit from any save-state.
 */

const world = generateWorld(missionSpec('VEX-0042'), T);

function play(sim: Simulation, bot: { next(sim: Simulation, out: InputFrame): InputFrame }, ticks: number, hashes?: string[]): void {
  const raw = neutralInput();
  for (let i = 0; i < ticks; i++) {
    sim.step(bot.next(sim, raw));
    hashes?.push(sim.hash());
  }
}

describe('the state tree', () => {
  it('is plain data, whatever the simulation is doing', () => {
    const sim = new Simulation(world, T);
    const bot = new ChaosBot('VEX-0042');
    for (let k = 0; k < 6; k++) {
      play(sim, bot, 300);
      assertPlain(sim.state);
      expect(structuredClone(sim.state)).toEqual(sim.state);
    }
  });

  it('restores so the run continues bit for bit', () => {
    // Play 60 s, save, then feed the original and a restored copy the same next 60 s of input.
    const a = new Simulation(world, T);
    const bot = new WanderBot('VEX-0042');
    play(a, bot, 1800);
    const b = new Simulation(world, T);
    b.restore(a.saveState());
    expect(b.hash()).toBe(a.hash());
    const raw = neutralInput();
    for (let i = 0; i < 1800; i++) {
      const f = { ...bot.next(a, raw) };
      a.step(f);
      b.step(f);
      expect(b.hash()).toBe(a.hash());
    }
    // And the copy shares nothing with the original.
    b.player.x += 1;
    expect(b.hash()).not.toBe(a.hash());
  });

  it('is changed by changing any leaf', () => {
    const sim = new Simulation(world, T);
    play(sim, new ChaosBot('VEX-0042'), 900);
    const base = hashState(sim.state);
    const leaves: Array<{ path: string; poke: (s: SimState) => void }> = [];
    const walk = (v: unknown, path: (string | number)[]): void => {
      if (v !== null && typeof v === 'object') {
        for (const [k, x] of Object.entries(v as object)) walk(x, [...path, Array.isArray(v) ? Number(k) : k]);
        return;
      }
      leaves.push({
        path: path.join('.'),
        poke: (s) => {
          let o = s as unknown as Record<string | number, unknown>;
          for (const k of path.slice(0, -1)) o = o[k] as Record<string | number, unknown>;
          const k = path[path.length - 1]!;
          const old = o[k];
          o[k] = typeof old === 'number' ? old + 1 : typeof old === 'boolean' ? !old : typeof old === 'string' ? `${old}!` : 0;
        },
      });
    };
    walk(sim.state, []);
    expect(leaves.length).toBeGreaterThan(100);
    for (const leaf of leaves) {
      const s = structuredClone(sim.state);
      leaf.poke(s);
      expect(hashState(s), leaf.path).not.toBe(base);
    }
  });
});
