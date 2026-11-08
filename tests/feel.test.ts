import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { buildWorld } from '../src/sim/generation';
import { Simulation } from '../src/sim/game/sim';
import { neutralInput } from '../src/sim/kernel/input';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { tuningCopy } from './fixtures';

/**
 * Feel (C9): every rate in tuning is per second, so the body moves the same at 30 Hz and
 * 60 Hz; that's what lets the owner's sitting compare the two blind (?hz=blind).
 */
describe('the same body at another tick rate', () => {
  const wall = { kind: 'box' as const, x: 0, z: -0.15, y0: -0.3, y1: 1, hx: 3, hz: 0.15, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };

  function at(hz: number): { mantleTook: number; walked: number; prone: number; leaned: number } {
    const T = tuningCopy();
    T.sim.tickHz = hz;
    const world = buildWorld({ name: 'feel', size: 40, cell: 0.5, colliders: [wall], spawn: { x: 0, z: 0.4, faceX: 0, faceZ: -1 } }, T.gen);
    const sim = new Simulation(world, T);
    const input = neutralInput(sim.player.yaw);
    // A mantle over the wall: how long it takes.
    input.commands = [{ kind: 'climb' }];
    sim.step(input);
    input.commands = [];
    let t = 1;
    while (sim.player.motor === 'mantle' && t < 10 * hz) {
      sim.step(input);
      t++;
    }
    const mantleTook = t / hz;
    // Two seconds of walking away from the wall.
    input.yaw = Math.PI;
    input.moveZ = 1;
    const z0 = sim.player.z;
    for (let k = 0; k < 2 * hz; k++) sim.step(input);
    const walked = sim.player.z - z0;
    // How long it takes to get down prone.
    input.moveZ = 0;
    input.prone = true;
    sim.step(input);
    input.prone = false;
    let down = 1;
    while (sim.player.lying < 1 && down < 5 * hz) {
      sim.step(input);
      down++;
    }
    // Standing up again and leaning: how far in half a second.
    input.prone = true;
    sim.step(input);
    input.prone = false;
    for (let k = 0; k < 2 * hz; k++) sim.step(input);
    input.lean = 1;
    for (let k = 0; k < hz / 2; k++) sim.step(input);
    return { mantleTook, walked, prone: down / hz, leaned: sim.player.lean };
  }

  it('takes the same time to mantle and to lie down, and covers the same ground', () => {
    const a = at(30);
    const b = at(60);
    expect(Math.abs(a.mantleTook - b.mantleTook)).toBeLessThan(0.05);
    expect(Math.abs(a.prone - b.prone)).toBeLessThan(0.05);
    expect(Math.abs(a.walked - b.walked)).toBeLessThan(0.15);
    expect(a.leaned).toBeCloseTo(defaultTuning.bodies.player.lean.peek, 2);
    expect(b.leaned).toBeCloseTo(defaultTuning.bodies.player.lean.peek, 2);
  });
});
