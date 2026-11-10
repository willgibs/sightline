import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { dpow } from '../src/sim/kernel/core/detmath';
import { audibility } from '../src/sim/kernel/sound';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { Acoustics, emptyHeard, type Heard } from '../src/sim/perception';
import { LAB, labWorld } from '../src/sim/game/scenes/perceptionLab';
import { testWorld } from './fixtures';

/**
 * Hearing (A5), one law for every listener: the louder of the route round (a flood over
 * the site grid) and the route through (the straight line, losing 12 dB a wall); masked by
 * the steady sources; heard from the last place on its route the listener can see.
 */

const wall = (x: number, z: number, hx: number, hz: number): ColliderInput => ({ kind: 'box', x, z, y0: -0.5, y1: 3, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });

/** A 10 m room centred on the origin, with a 1.6 m doorway in its south wall (+z). */
const room = testWorld({
  size: 80,
  cell: 1,
  spawn: { x: 30, z: 30 },
  colliders: [
    wall(0, -5, 5.2, 0.2), // north
    wall(-5, 0, 0.2, 5.2), // west
    wall(5, 0, 0.2, 5.2), // east
    wall(-3.1, 5, 2.3, 0.2), // south, west of the door
    wall(3.1, 5, 2.3, 0.2), // south, east of the door
  ],
});

function heard(a: Acoustics, sx: number, sz: number, radius: number, lx: number, lz: number): Heard {
  a.spread({ x: sx, y: 0, z: sz, radius });
  return a.hear(lx, 1.7, lz, emptyHeard());
}

describe('hearing', () => {
  const a = new Acoustics(room, T);
  const lift = T.perception.hearing.lift;

  it('in the open, falls off with distance: exactly the law of sound', () => {
    const h = heard(a, 20, 20, 20, 30, 20);
    const d = Math.sqrt(10 * 10 + (1.7 - lift) * (1.7 - lift));
    expect(h.level).toBe(audibility(20, d));
    expect(h.threshold).toBe(1);
    expect(h.clarity).toBe(h.level);
    expect(h.walls).toBe(0);
    expect([h.fromX, h.fromZ]).toEqual([20, 20]);
  });

  it('through a wall, loses 12 dB: a quarter of the level', () => {
    // From the room's middle to just north of its north wall: round the room is too far.
    const h = heard(a, 0, 0, 12, 0, -7);
    expect(h.route).toBe('through');
    expect(h.walls).toBe(1);
    const d = Math.sqrt(7 * 7 + (1.7 - lift) * (1.7 - lift));
    expect(h.level).toBeCloseTo(audibility(12, d) * 10 ** (-12 / 20), 12);
    expect(h.clarity).toBeLessThan(1);
  });

  it('round a corner, goes through the doorway, and is heard from it', () => {
    // Outside, south-east of the door: the straight line meets the wall; the doorway is open.
    const h = heard(a, 0, 0, 20, 7, 9);
    expect(h.route).toBe('around');
    expect(h.walls).toBe(1);
    expect(h.length).toBeGreaterThan(h.straight);
    expect(h.clarity).toBeGreaterThan(1);
    // It seems to come from the doorway, not from inside the room.
    expect(Math.abs(h.fromX)).toBeLessThanOrEqual(1.5);
    expect(h.fromZ).toBeGreaterThan(3.5);
    expect(h.fromZ).toBeLessThan(6.5);
  });

  it('straight through the doorway, is heard from where it was', () => {
    const h = heard(a, 0, 0, 20, 0, 12);
    expect(h.walls).toBe(0);
    expect([h.fromX, h.fromZ]).toEqual([0, 0]);
  });

  it('never carries beyond its radius by either route', () => {
    expect(heard(a, 0, 0, 6, 0, 30).clarity).toBeLessThan(1);
  });

  it('is masked by the steady sources: a step heard in the field is lost beside the generator', () => {
    const lab = labWorld(T);
    const acoustics = new Acoustics(lab, T);
    const G = LAB.generator;
    // A walking step on grass, 6 m away, far from the generator.
    const far = heard(acoustics, 0, 40, 10, 6, 40);
    expect(far.threshold).toBe(1);
    expect(far.clarity).toBeGreaterThan(1);
    // The same step, 6 m away, with the listener beside the generator.
    const near = heard(acoustics, G.x + 3, G.z + 8, 10, G.x + 3, G.z + 2);
    expect(near.threshold).toBeGreaterThan(2);
    expect(near.level).toBeCloseTo(far.level, 1);
    expect(near.clarity).toBeLessThan(1);
    // The generator's own level there is its law's: 70 m radius, about 3 m away.
    expect(acoustics.ambientLevel(G.x + 3, 1.7, G.z + 2)).toBeGreaterThan(15);
  });

  it('finds the masked threshold without a ray wherever nothing steady could mask, and the same everywhere', () => {
    const lab = labWorld(T);
    const acoustics = new Acoustics(lab, T);
    const G = LAB.generator;
    const factor = dpow(10, -T.perception.hearing.maskDb / 20);
    let masked = 0;
    let open = 0;
    // A line of listeners from beside the generator out into the field.
    for (let d = 1; d <= 60; d += 1.5) {
      const x = G.x + d * 0.6;
      const z = G.z + d * 0.8;
      const full = Math.max(1, acoustics.ambientLevel(x, 1.7, z) * factor);
      expect(acoustics.threshold(x, 1.7, z), `${d} m`).toBe(full);
      if (full > 1) masked++;
      else open++;
    }
    expect(masked).toBeGreaterThan(2);
    expect(open).toBeGreaterThan(10);
  });

  it('hears the same whether or not it is told who is listening, wherever he then goes', () => {
    const lab = labWorld(T);
    const named = new Acoustics(lab, T);
    const plain = new Acoustics(lab, T);
    const G = LAB.generator;
    const spots: Array<[number, number]> = [
      [G.x + 3, G.z + 2],
      [G.x + 3, G.z + 2],
      [0, 40],
      [G.x + 9, G.z - 4],
      [G.x + 3, G.z + 2],
    ];
    for (const humming of [true, false, true]) {
      named.humming = humming;
      plain.humming = humming;
      for (const [x, z] of spots) {
        named.spread({ x: x + 6, y: 0, z: z + 6, radius: 10 });
        plain.spread({ x: x + 6, y: 0, z: z + 6, radius: 10 });
        expect(named.hear(x, 1.7, z, emptyHeard(), 7)).toEqual(plain.hear(x, 1.7, z, emptyHeard()));
      }
    }
  });

  it('gives the same answer, bit for bit, whoever asks: two listeners at one cell, two acoustics of one world', () => {
    const b = new Acoustics(room, T);
    for (const [lx, lz] of [
      [7, 9],
      [0, -7],
      [20, 15],
      [-8, 6],
    ] as const) {
      const x = heard(a, 0, 0, 25, lx, lz);
      const y = heard(b, 0, 0, 25, lx, lz);
      expect(y).toEqual(x);
      expect(Object.is(y.clarity, x.clarity)).toBe(true);
    }
  });
});

describe('one law of sound: the speakers and the guards', () => {
  it("give the player's ears exactly what a guard where the camera is hears, bit for bit", async () => {
    const { Ears, emptyRoute } = await import('../src/audio/hearing');
    const { acousticsOf } = await import('../src/sim/perception');
    const lab = labWorld(T);
    const ears = new Ears();
    ears.setWorld(lab, T);
    const sim = acousticsOf(lab, T);
    const G = LAB.generator;
    // Steps round the camp, the generator's hum, and the hut in the way.
    const cases: Array<[number, number, number, number, number, number]> = [
      [G.x + 3, G.z + 8, 14, G.x + 3, G.z + 2, 1.7],
      [-192, 4, 18, -192, -16, 1.7],
      [-180, -6, 25, -205, -6, 1.6],
      [-150, 3, 9, -146, 0, 1.71],
    ];
    let compared = 0;
    for (const [sx, sz, radius, lx, lz, ly] of cases) {
      const r = ears.route(sx, 0, sz, radius, lx, ly, lz, emptyRoute());
      sim.spread({ x: sx, y: 0, z: sz, radius });
      const g = sim.hear(lx, ly, lz, emptyHeard());
      if (!r) {
        // Out of earshot for the speakers: out of hearing for a guard too.
        expect(g.clarity).toBeLessThan(1);
        continue;
      }
      expect(Object.is(r.level, g.level)).toBe(true);
      expect(Object.is(r.clarity, g.clarity)).toBe(true);
      expect([r.x, r.y, r.z]).toEqual([g.fromX, g.fromY, g.fromZ]);
      expect(r.length).toBe(g.length);
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(3);
  });
});

describe('the crack', () => {
  it('is heard from upstream on the path, 55–62° off the shooter, for listeners near it at 300 m', async () => {
    const { crackBias } = await import('../src/sim/game/benches');
    const angles = crackBias();
    expect(angles).toHaveLength(3);
    for (const a of angles) {
      expect(a).toBeGreaterThanOrEqual(55);
      expect(a).toBeLessThanOrEqual(62);
    }
  });

  it('is not heard behind the muzzle, nor from a bullet slower than sound', async () => {
    const { crackHeard } = await import('../src/sim/perception');
    const out = { x: 0, y: 0, z: 0, t: 0 };
    const fast = [
      { x: 0, y: 1.5, z: 0, t: 0 },
      { x: 400, y: 1.5, z: 0, t: 0.5 },
    ];
    expect(crackHeard(fast, -20, 1.7, 5, 343, out)).toBe(false);
    expect(crackHeard(fast, 200, 1.7, 10, 343, out)).toBe(true);
    // It arrives after the bullet passes, and before the report would from the muzzle.
    expect(out.t).toBeGreaterThan(0.25);
    expect(out.t).toBeLessThan(Math.hypot(200, 10) / 343);
    const slow = [
      { x: 0, y: 1.5, z: 0, t: 0 },
      { x: 300, y: 1.5, z: 0, t: 1 },
    ];
    expect(crackHeard(slow, 200, 1.7, 10, 343, out)).toBe(false);
  });
});
