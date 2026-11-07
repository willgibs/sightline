import { describe, expect, it } from 'vitest';
import { neutralInput, quantizeInput, type InputFrame } from '../src/sim/input';
import { footfall } from '../src/sim/motor/footfall';
import { Simulation } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/events';
import { Blocks } from '../src/sim/world/colliders';
import { Surface } from '../src/sim/world/surfaces';
import { EAST, testWorld, tuningCopy } from './fixtures';

const HZ = 30;

/** Steps a simulation with a held input; `first` applies on the first tick only (stance toggles). */
function hold(sim: Simulation, seconds: number, held: Partial<InputFrame>, first: Partial<InputFrame> = {}): SimEvent[] {
  const events: SimEvent[] = [];
  const base = { ...neutralInput(EAST), ...held };
  const q = quantizeInput(base);
  const q0 = quantizeInput({ ...base, ...first });
  for (let i = 0; i < Math.round(seconds * HZ); i++) events.push(...sim.step(i === 0 ? q0 : q));
  return events;
}

describe('player movement', () => {
  it('reaches the design doc speeds for each stance', () => {
    const cases: Array<[string, Partial<InputFrame>, Partial<InputFrame>, number]> = [
      ['walk', { moveZ: 1 }, {}, 3.0],
      ['sprint', { moveZ: 1, sprint: true }, {}, 5.5],
      ['crouch', { moveZ: 1 }, { crouch: true }, 1.8],
      ['crawl', { moveZ: 1 }, { prone: true }, 0.7],
    ];
    for (const [name, held, first, expected] of cases) {
      const sim = new Simulation(testWorld(), tuningCopy());
      hold(sim, 3, held, first);
      expect(sim.player.speed, name).toBeCloseTo(expected, 1);
      expect(sim.player.gait).toBe(name);
    }
  });

  it('builds speed over a few tenths of a second', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 0.1, { moveZ: 1 });
    expect(sim.player.speed).toBeLessThan(2.2);
    hold(sim, 0.4, { moveZ: 1 });
    expect(sim.player.speed).toBeCloseTo(3.0, 1);
  });

  it('takes three quarters of a second to go prone, crawling meanwhile', () => {
    const t = tuningCopy();
    const sim = new Simulation(testWorld(), t);
    hold(sim, 0.3, { moveZ: 1 }, { prone: true });
    expect(sim.player.stance).toBe('prone');
    expect(sim.player.gait).toBe('crawl');
    expect(sim.player.eyeHeight).toBeGreaterThan(t.player.eyeHeight.prone);
    expect(sim.player.eyeHeight).toBeLessThan(t.player.eyeHeight.stand);
    hold(sim, 0.6, {});
    expect(sim.player.eyeHeight).toBeCloseTo(t.player.eyeHeight.prone, 6);
  });

  it('cannot climb ground steeper than the slope limit', () => {
    const steep = Math.tan((50 * Math.PI) / 180);
    const sim = new Simulation(testWorld({ height: (x) => (x > 20 ? (x - 20) * steep : 0) }), tuningCopy());
    hold(sim, 20, { moveZ: 1 });
    expect(sim.player.x).toBeLessThan(21.5);
    expect(sim.player.y).toBeLessThan(1.5);
  });

  it('climbs moderate slopes, slower than on the flat', () => {
    const ramp = Math.tan((25 * Math.PI) / 180);
    const flat = new Simulation(testWorld(), tuningCopy());
    const hill = new Simulation(testWorld({ height: (x) => Math.max(0, x) * ramp }), tuningCopy());
    hold(flat, 6, { moveZ: 1 });
    hold(hill, 6, { moveZ: 1 });
    expect(hill.player.x).toBeGreaterThan(8);
    expect(hill.player.x).toBeLessThan(flat.player.x * 0.9);
    expect(hill.player.y).toBeCloseTo(hill.world.terrain.heightAt(hill.player.x, hill.player.z), 5);
  });

  it('is stopped by walls', () => {
    const wall = { kind: 'box' as const, x: 10, z: 0, y0: -1, y1: 2, hx: 0.5, hz: 20, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const t = tuningCopy();
    const sim = new Simulation(testWorld({ colliders: [wall] }), t);
    hold(sim, 8, { moveZ: 1 });
    expect(sim.player.x).toBeCloseTo(10 - 0.5 - t.player.radius, 2);
  });

  it('steps onto low ledges and falls off high ones', () => {
    const ledge = { kind: 'box' as const, x: 8, z: 0, y0: -1, y1: 0.3, hx: 2, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const sim = new Simulation(testWorld({ colliders: [ledge] }), tuningCopy());
    hold(sim, 2.8, { moveZ: 1 });
    expect(sim.player.x).toBeGreaterThan(6.5);
    expect(sim.player.y).toBeCloseTo(0.3, 6);
    expect(sim.player.surface).toBe(Surface.Wood);

    const roof = { kind: 'box' as const, x: 0, z: 0, y0: -1, y1: 3, hx: 2, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal };
    const high = new Simulation(testWorld({ colliders: [roof], spawnOnTop: true }), tuningCopy());
    expect(high.player.y).toBeCloseTo(3, 6);
    hold(high, 2, { moveZ: 1 });
    expect(high.player.y).toBeCloseTo(0, 6);
    expect(high.player.motor).toBe('ground');
  });

  it('cannot stand up under something low', () => {
    const shelf = { kind: 'box' as const, x: 0, z: 0, y0: 0.8, y1: 1.2, hx: 3, hz: 3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const sim = new Simulation(testWorld({ colliders: [shelf], spawn: { x: 6, z: 0 } }), tuningCopy());
    hold(sim, 1, {}, { prone: true });
    expect(sim.player.stance).toBe('prone');
    // Crawl under the shelf, then try to get up.
    hold(sim, 9, { moveZ: -1 });
    expect(Math.abs(sim.player.x)).toBeLessThan(2.5);
    hold(sim, 1, {}, { prone: true });
    expect(sim.player.stance).toBe('prone');
  });

  it('stays inside the play area', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 40, { moveZ: 1, sprint: true });
    expect(sim.player.x).toBeLessThanOrEqual(sim.world.playHalf);
  });
});

describe('controller edge cases (from code review)', () => {
  it('cannot skip the prone change by sprinting', () => {
    const t = tuningCopy();
    const sim = new Simulation(testWorld(), t);
    hold(sim, 1, {}, { prone: true });
    const events = hold(sim, 0.5, { moveZ: 1, sprint: true }, { prone: true });
    expect(sim.player.proneTransition).toBe(true);
    expect(sim.player.gait).toBe('crawl');
    expect(sim.player.speed).toBeLessThanOrEqual(t.player.speed.crawl + 1e-9);
    expect(events.filter((e) => e.type === 'stance')).toHaveLength(1);
  });

  it('queues a stance toggle pressed during a prone change', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 1, {}, { prone: true });
    hold(sim, 0.2, {}, { prone: true }); // prone → crouch begins
    hold(sim, 0.1, {}, { crouch: true }); // pressed mid-change
    expect(sim.player.stance).toBe('crouch');
    hold(sim, 1, {});
    expect(sim.player.stance).toBe('stand');
  });

  it('stays crouched when crouching while holding sprint', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 1, { moveZ: 1, sprint: true });
    const events = hold(sim, 1.5, { moveZ: 1, sprint: true }, { crouch: true });
    expect(events.filter((e) => e.type === 'stance')).toHaveLength(1);
    expect(sim.player.stance).toBe('crouch');
    expect(sim.player.speed).toBeCloseTo(1.8, 1);
  });

  it('stands up from a crouch to sprint', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 1, {}, { crouch: true });
    hold(sim, 2, { moveZ: 1, sprint: true });
    expect(sim.player.stance).toBe('stand');
    expect(sim.player.speed).toBeCloseTo(5.5, 1);
  });

  it('cannot climb a cliff on momentum', () => {
    const step = tuningCopy().player.stepHeight;
    for (const deg of [50, 70, 80, 85]) {
      const steep = Math.tan((deg * Math.PI) / 180);
      const sim = new Simulation(testWorld({ height: (x) => (x > 20 ? (x - 20) * steep : 0) }), tuningCopy());
      let maxRise = 0;
      for (let i = 0; i < 30 * 8; i++) {
        const before = sim.player.y;
        hold(sim, 1 / HZ, { moveZ: 1, sprint: true });
        maxRise = Math.max(maxRise, sim.player.y - before);
      }
      expect(sim.player.y, `${deg}°`).toBeLessThan(0.25);
      expect(maxRise, `${deg}°`).toBeLessThanOrEqual(step);
    }
  });

  it('is never shoved through a fence by a guard', () => {
    const fence = { kind: 'box' as const, x: 10, z: 0, y0: -0.25, y1: 2.2, hx: 0.1, hz: 4, ux: 1, uz: 0, flags: Blocks.Move, surface: Surface.Metal };
    for (const offset of [0, 0.1, 0.25]) {
      const camp = {
        structures: [],
        fenceHalf: 0,
        guards: [
          {
            id: 0,
            role: 'patrol' as const,
            x: 16,
            y: 0,
            z: offset,
            faceX: -1,
            faceZ: 0,
            elevated: false,
            route: [
              { x: 16, z: offset },
              { x: 4, z: offset },
            ],
            routeStart: 1,
            scanPhase: 0,
            scanScale: 1,
          },
        ],
      };
      const sim = new Simulation(testWorld({ colliders: [fence], camp, spawn: { x: 10.45, z: 0 } }), tuningCopy());
      for (let i = 0; i < 30 * 8; i++) {
        hold(sim, 1 / HZ, {});
        expect(sim.player.x, `offset ${offset}`).toBeGreaterThanOrEqual(10.4 - 1e-9);
      }
    }
  });

  it('is never thrown sideways under a low ceiling', () => {
    const slab = { kind: 'box' as const, x: 10, z: 0, y0: 1.9, y1: 2.3, hx: 3, hz: 3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const stepBox = { kind: 'box' as const, x: 10, z: 0, y0: -1, y1: 0.3, hx: 1, hz: 3, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const worlds = [
      testWorld({ colliders: [slab, stepBox], spawn: { x: 5, z: 0.4 } }),
      testWorld({ colliders: [slab], spawn: { x: 5, z: 0.4 }, height: (x) => Math.max(0, x - 7) * Math.tan((6 * Math.PI) / 180) }),
    ];
    for (const w of worlds) {
      const sim = new Simulation(w, tuningCopy());
      for (let i = 0; i < 30 * 4; i++) {
        const x = sim.player.x;
        const z = sim.player.z;
        hold(sim, 1 / HZ, { moveZ: 1 });
        expect(Math.hypot(sim.player.x - x, sim.player.z - z)).toBeLessThanOrEqual(3.0 / HZ + 1e-9);
      }
    }
  });
});

describe('footstep noise', () => {
  it('follows how fast the body moves, not the stance asked for', () => {
    // Dive prone from a full sprint: the body takes a moment to stop, and every footstep
    // on the way down must be as loud as the speed it was made at.
    const t = tuningCopy();
    const sim = new Simulation(testWorld(), t);
    hold(sim, 1.5, { moveZ: 1, sprint: true });
    let steps = 0;
    let fastest = 0;
    for (let i = 0; i < 15; i++) {
      const events = hold(sim, 1 / HZ, { moveZ: 1 }, i === 0 ? { prone: true } : {});
      for (const e of events) {
        if (e.type !== 'footstep') continue;
        steps++;
        fastest = Math.max(fastest, sim.player.speed);
        expect(e.loudness).toBeCloseTo(footfall(sim.player.speed, t.player, t.noise).loudness * t.noise.surface.grass, 9);
      }
    }
    expect(sim.player.gait).toBe('crawl');
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThanOrEqual(2);
    expect(fastest).toBeGreaterThan(t.player.speed.crawl);
  });

  it('makes sprinting on gravel about three times as loud as crouching on grass', () => {
    const t = tuningCopy();
    const loud = t.noise.movement.sprint * t.noise.surface.gravel;
    const quiet = t.noise.movement.crouch * t.noise.surface.grass;
    expect(loud / quiet).toBeGreaterThan(2.5);
    expect(loud / quiet).toBeLessThan(4);
  });

  it('emits footsteps at stride intervals with the right loudness', () => {
    const t = tuningCopy();
    const sim = new Simulation(testWorld({ surface: Surface.Gravel }), t);
    const events = hold(sim, 10, { moveZ: 1 });
    const steps = events.filter((e) => e.type === 'footstep');
    // About 10 s × 3 m/s ÷ 1.25 m per step, less the acceleration.
    expect(steps.length).toBeGreaterThan(20);
    expect(steps.length).toBeLessThan(25);
    const step = steps[0]!;
    if (step.type !== 'footstep') throw new Error('expected a footstep');
    expect(step.loudness).toBeCloseTo(t.noise.movement.walk * t.noise.surface.gravel, 9);
    expect(step.radius).toBeCloseTo(step.loudness * t.noise.radiusPerUnit, 9);
    expect(step.surface).toBe(Surface.Gravel);
  });

  it('is silent when standing still or pushing into a wall', () => {
    const wall = { kind: 'box' as const, x: 1, z: 0, y0: -1, y1: 2, hx: 0.4, hz: 5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const sim = new Simulation(testWorld({ colliders: [wall] }), tuningCopy());
    hold(sim, 1, { moveZ: 1 });
    const events = hold(sim, 5, { moveZ: 1 });
    expect(events.filter((e) => e.type === 'footstep')).toHaveLength(0);
  });
});

describe('controller edge cases (from the second audit)', () => {
  const NORTH_YAW = 0;
  const box = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, surface: Surface = Surface.Wood) => ({
    kind: 'box' as const,
    x,
    z,
    hx,
    hz,
    y0,
    y1,
    ux: 1,
    uz: 0,
    flags: Blocks.All,
    surface,
  });

  it('keeps the eye below a slab the body dives under', () => {
    // A 0.6 m crawl space: slab underside at 0.6 m from x = 8 on. Dive prone at many points.
    const slab = box(14, 0, 6, 4, 0.6, 0.7);
    let worst = -Infinity;
    for (let start = 4; start <= 7.5; start += 0.25) {
      const sim = new Simulation(testWorld({ colliders: [slab], spawn: { x: 0, z: 0 } }), tuningCopy());
      const run = { ...neutralInput(EAST), moveZ: 1, sprint: true };
      while (sim.player.x < start) sim.step(run);
      sim.step({ ...run, prone: true });
      for (let i = 0; i < 90; i++) {
        sim.step({ ...run, sprint: false });
        const p = sim.player;
        if (p.x > 8 - 0.3) worst = Math.max(worst, p.y + p.eyeHeight - slab.y0);
      }
    }
    // Never above the underside, and never within the camera's near-plane reach of it.
    expect(worst).toBeLessThan(-0.12);
  });

  it('only gets less visible once the body is actually down', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 0.5, {});
    const standing = sim.player.eyeHeight;
    hold(sim, 1 / HZ, {}, { prone: true });
    expect(sim.player.stance).toBe('prone');
    expect(sim.player.eyeHeight).toBeGreaterThan(standing * 0.95);
    hold(sim, 1, {});
    expect(sim.player.eyeHeight).toBeCloseTo(tuningCopy().player.eyeHeight.prone, 6);
  });

  it('falls off a cliff instead of walking down it, and lands with a sound', () => {
    const s = Math.tan((80 * Math.PI) / 180);
    // A plateau 30 m up for x < 0, then an 80° face down to the valley floor.
    const world = testWorld({ size: 400, cell: 1, height: (x) => Math.max(0, Math.min(30, -x * s)), spawn: { x: -8, z: 0 } });
    const sim = new Simulation(world, tuningCopy());
    let airborne = 0;
    let ticks = 0;
    const lands: number[] = [];
    while (sim.player.y > 0.01 && ticks < 300) {
      for (const e of sim.step({ ...neutralInput(EAST), moveZ: 1 })) if (e.type === 'land') lands.push(e.speed);
      if (sim.player.motor === 'air') airborne++;
      ticks++;
    }
    for (let i = 0; i < 10; i++) for (const e of sim.step(neutralInput(EAST))) if (e.type === 'land') lands.push(e.speed);
    expect(sim.player.y).toBeLessThan(0.01);
    expect(airborne).toBeGreaterThan(60); // about 2.4 s of free fall
    expect(Math.max(...lands)).toBeGreaterThan(20);
  });

  it('lands louder from higher, and steps down a small ledge silently', () => {
    const landing = (h: number): number => {
      const sim = new Simulation(testWorld({ colliders: [box(0, 0, 2, 2, -1, h)], spawnOnTop: true }), tuningCopy());
      let loud = 0;
      for (const e of hold(sim, 3, { moveZ: 1 })) if (e.type === 'land') loud = Math.max(loud, e.loudness);
      return loud;
    };
    expect(landing(0.5)).toBe(0);
    expect(landing(1)).toBeGreaterThan(0);
    expect(landing(3)).toBeGreaterThan(landing(1));
  });

  it('slides down ground too steep to stand on', () => {
    const s = Math.tan((55 * Math.PI) / 180);
    const world = testWorld({ size: 200, cell: 1, height: (x) => Math.max(0, Math.min(8, (6 - x) * s)), spawn: { x: 3, z: 0 } });
    const sim = new Simulation(world, tuningCopy());
    hold(sim, 4, {});
    expect(sim.player.y).toBeLessThan(0.01);
    expect(sim.player.x).toBeGreaterThan(5.9);
  });

  it('stands on a crate only when the body actually touches it', () => {
    const crate = box(0, 5, 0.6, 0.6, 0, 0.4);
    for (const gap of [0.005, 0.05]) {
      // Walk north past the crate's east side, `gap` clear of it.
      const sim = new Simulation(testWorld({ colliders: [crate], spawn: { x: 0.6 + 0.3 + gap, z: 12 } }), tuningCopy());
      let highest = 0;
      for (let i = 0; i < 150; i++) {
        sim.step({ ...neutralInput(NORTH_YAW), moveZ: 1 });
        highest = Math.max(highest, sim.player.y);
      }
      expect(highest).toBe(0);
    }
  });

  it('can get up beside a table corner', () => {
    const table = box(0, 0, 0.5, 0.5, 0.75, 1.0);
    // Prone 2 cm diagonally clear of the corner, with nothing overhead.
    const d = 0.5 + (0.3 + 0.02) / Math.SQRT2;
    const sim = new Simulation(testWorld({ colliders: [table], spawn: { x: d, z: d } }), tuningCopy());
    hold(sim, 1, {}, { prone: true });
    hold(sim, 1, {}, { crouch: true });
    expect(sim.player.stance).toBe('crouch');
  });

  it('slides out from under the edge of an overhang instead of freezing', () => {
    const roof = box(10, -5, 30, 5, 1.9, 2.1);
    const slope = Math.tan((6 * Math.PI) / 180);
    for (const overlap of [0.01, 0.1, 0.25]) {
      const sim = new Simulation(testWorld({ colliders: [roof], height: (x) => Math.max(0, x) * slope, spawn: { x: -3, z: 2 } }), tuningCopy());
      sim.player.z = 0.3 - overlap;
      for (let i = 0; i < 180; i++) sim.step({ ...neutralInput(EAST), moveZ: 1 });
      expect(sim.player.x).toBeGreaterThan(10);
    }
  });

  it('never fires two footsteps in a row, and a shoved body takes no steps', () => {
    const wall = box(10, 0, 0.5, 20, 0, 3);
    for (const inc of [20, 45, 75]) {
      const a = (inc * Math.PI) / 180;
      const sim = new Simulation(testWorld({ colliders: [wall] }), tuningCopy());
      let last = -10;
      for (let i = 0; i < 150; i++) {
        for (const e of sim.step({ ...neutralInput(Math.atan2(-Math.cos(a), -Math.sin(a))), moveZ: 1, sprint: true })) {
          if (e.type !== 'footstep' || e.source !== -1) continue;
          expect(sim.tick - last).toBeGreaterThan(1);
          last = sim.tick;
        }
      }
    }
  });

  it('walks diagonally backward at the backward speed', () => {
    const sim = new Simulation(testWorld(), tuningCopy());
    hold(sim, 3, { moveX: -1, moveZ: -1 });
    const T = tuningCopy().player;
    expect(sim.player.speed).toBeCloseTo(T.speed.walk * (1 - (1 - T.backwardFactor) * Math.SQRT1_2), 1);
  });

  it('copes with an instant stance change', () => {
    const t = tuningCopy();
    t.player.stanceTime.prone = 0;
    t.player.stanceTime.crouch = 0;
    const sim = new Simulation(testWorld(), t);
    hold(sim, 0.2, {}, { prone: true });
    expect(sim.player.proneTransition).toBe(false);
    hold(sim, 0.2, {}, { crouch: true });
    hold(sim, 1, { moveZ: 1, sprint: true });
    expect(sim.player.stance).toBe('stand');
    expect(sim.player.gait).toBe('sprint');
  });

  it('can stand up under a slab exactly at standing height', () => {
    const slab = box(0, 0, 3, 3, 1.8, 2.0);
    const sim = new Simulation(testWorld({ colliders: [slab] }), tuningCopy());
    hold(sim, 1, {}, { crouch: true });
    hold(sim, 1, {}, { crouch: true });
    expect(sim.player.stance).toBe('stand');
  });
});
