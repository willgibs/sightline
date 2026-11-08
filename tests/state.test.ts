import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { WanderBot } from '../src/sim/game/bots/wander';
import { generateWorld } from '../src/sim/generation/world';
import { neutralInput, type InputFrame } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { Simulation } from '../src/sim/game/sim';
import { Faction, assertPlain, hashState, type SimState } from '../src/sim/kernel/state';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';

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

  it('keeps two simulations apart when they are stepped in alternation', () => {
    // Two valleys and two bots, alone and then in turns: state kept anywhere but each
    // simulation's own tree (in a module, a cache, a closure) would leak from one to the other.
    const other = generateWorld(missionSpec('MUD-9031'), T);
    const make = (k: number): { sim: Simulation; bot: { next(sim: Simulation, out: InputFrame): InputFrame } } =>
      k === 0 ? { sim: new Simulation(world, T), bot: new WanderBot('VEX-0042') } : { sim: new Simulation(other, T), bot: new ChaosBot('MUD-9031') };
    const alone = [0, 1].map((k) => {
      const { sim, bot } = make(k);
      const hashes: string[] = [];
      play(sim, bot, 900, hashes);
      return hashes;
    });
    const runs = [make(0), make(1)];
    const raw = neutralInput();
    for (let i = 0; i < 900; i++) {
      for (const [k, { sim, bot }] of runs.entries()) {
        sim.step(bot.next(sim, raw));
        expect(sim.hash(), `run ${k} at tick ${i + 1}`).toBe(alone[k]![i]);
      }
    }
  });

  it('is changed by changing any leaf', () => {
    const sim = new Simulation(world, T);
    // An entity of every kind: the player, the guards, and a solid shape.
    sim.spawn((id) => ({
      id,
      kind: 'solid',
      faction: Faction.None,
      solid: { kind: 'box', id: 0, x: 400, z: 400, y0: 0, y1: 2, hx: 1, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal },
    }));
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
