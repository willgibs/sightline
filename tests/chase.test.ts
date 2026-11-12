import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { openingNear, openingThrough, outsideWalls } from '../src/sim/brain';
import { commanderOf } from '../src/sim/game/comms';
import { player } from '../src/sim/game/entities';
import { gateStart, leavingOf } from '../src/sim/game/leaving';
import { ladder } from '../src/sim/game/scenes/ladder';
import { liveCamp, parseLiveCamp } from '../src/sim/game/scenes/liveCamp';
import { OUT_THE_GATE_TABLE, outTheGate } from '../src/sim/game/scenes/outTheGate';
import type { Simulation } from '../src/sim/game/sim';
import { runScene, sceneOver, sceneTicks, startScene, type Scene } from '../src/sim/kernel/scene';
import { testWorld } from './fixtures';

/**
 * The chase (brain/firefight.ts; the owner, Nov 12): a man seen inside a camp who leaves by
 * an opening in its wall and turns along the outside isn't gone. One or two come out after
 * him at once, look both ways along the wall and shoot; no more than that go, however many
 * of them he puts down; and the rest keep to the walls.
 */

describe('a camp’s walls, as its own men know them', () => {
  const world = outTheGate('seed=TES-6931').world(T);
  const m = leavingOf(world, T)!;

  it('have an inside and an outside', () => {
    expect(m).not.toBeNull();
    expect(outsideWalls(world, world.camp.site.x, world.camp.site.z)).toBe(false);
    expect(outsideWalls(world, m.show.x, m.show.z)).toBe(false);
    expect(outsideWalls(world, m.hide.x, m.hide.z)).toBe(true);
    // A few steps either side of the opening, along the way out of it.
    expect(outsideWalls(world, m.gate.x + m.gate.nx * 3, m.gate.z + m.gate.nz * 3)).toBe(true);
    expect(outsideWalls(world, m.gate.x - m.gate.nx * 3, m.gate.z - m.gate.nz * 3)).toBe(false);
  });

  it('have openings, each with a way out of it', () => {
    const g = openingNear(world, m.out.x, m.out.z)!;
    expect(Math.hypot(g.x - m.gate.x, g.z - m.gate.z)).toBeLessThan(0.01);
    expect(Math.hypot(g.nx, g.nz)).toBeCloseTo(1, 9);
    // The way out points away from the middle of the camp.
    expect(g.nx * (g.x - world.camp.site.x) + g.nz * (g.z - world.camp.site.z)).toBeGreaterThan(0);
    expect(g.width).toBeGreaterThan(1);
  });

  it('are left by an opening, and by nothing else: a move that ends outside them goes through one, or goes nowhere', () => {
    // Straight out of the middle of it, as the scene's man goes.
    const g = openingThrough(world, m.show.x, m.show.z, m.out.x, m.out.z, 1.5)!;
    expect(Math.hypot(g.x - m.gate.x, g.z - m.gate.z)).toBeLessThan(0.01);
    // The same way out, from 12 m along the wall: that's a man running at a wall.
    const ax = -m.gate.nz;
    const az = m.gate.nx;
    const side = m.gate.width / 2 + 12;
    expect(openingThrough(world, m.gate.x - m.gate.nx * 2 + ax * side, m.gate.z - m.gate.nz * 2 + az * side, m.gate.x + m.gate.nx * 2 + ax * side, m.gate.z + m.gate.nz * 2 + az * side, 1.5)).toBeNull();
    // A move that stays inside leaves by nothing, and so does one that begins outside.
    expect(openingThrough(world, m.show.x, m.show.z, m.gate.x - m.gate.nx * 2, m.gate.z - m.gate.nz * 2, 1.5)).toBeNull();
    expect(openingThrough(world, m.out.x, m.out.z, m.hide.x, m.hide.z, 1.5)).toBeNull();
  });

  it('are nothing to a camp built by hand: nowhere is outside it, and it has no openings', () => {
    const plain = testWorld({ size: 120, spawn: { x: 50, z: 0 }, camp: { structures: [], guards: [], fenceHalf: 0 } });
    expect(outsideWalls(plain, 500, 500)).toBe(false);
    expect(openingNear(plain, 0, 0)).toBeNull();
    expect(openingThrough(plain, 0, 0, 500, 500, 1.5)).toBeNull();
  });
});

describe('out of the gate', () => {
  // The first row is the scene as it stands, which tests/scenes.test.ts runs.
  for (const params of OUT_THE_GATE_TABLE.slice(1)) {
    it(`${params}: someone comes out after him soon, no more than two, and the rest keep to the walls`, () => {
      expect(runScene(outTheGate(params), T).failures).toEqual([]);
    }, 120_000);
  }

  it('nobody is shot by his own side, on a camp whose tower was firing at the place its men went out to', () => {
    // RUL-1023: a tower man with no sight of the intruder fires at where he believes him to be, which is the ground
    // outside the door, and the first man to kneel there was killed by him ten seconds after the intruder left. FIH-1382:
    // a marksman took the chasers' word on the net for a section asking for fire on that place, and killed both.
    // Only that is asked of them here: on the first, the scene's own man stops a step short of his place along the wall.
    for (const seed of ['RUL-1023', 'FIH-1382']) {
      expect(runScene(outTheGate(`seed=${seed}`), T).failures.filter((f) => f.includes('shot dead by the camp'))).toEqual([]);
    }
  }, 240_000);

  it('as the camp was, the first man out is most of a minute behind him', () => {
    const before = runScene(outTheGate('seed=TES-6931&off=chase'), T);
    expect(before.failures.join('; ')).toMatch(/s behind him|nobody went out after him/);
  }, 120_000);

  it('is a fact about the camp, which the switch takes away', () => {
    const on = outTheGate('seed=TES-6931') as Scene<Simulation>;
    const off = outTheGate('seed=TES-6931&off=chase') as Scene<Simulation>;
    const world = on.world(T);
    expect(commanderOf(startScene(on, T, world))!.camp.chases).toBe(true);
    expect(commanderOf(startScene(off, T, world))!.camp.chases).toBeUndefined();
    // And a camp with no firefight in it has no chase either: it's the firefight's.
    const neither = outTheGate('seed=TES-6931&off=firefight') as Scene<Simulation>;
    expect(commanderOf(startScene(neither, T, world))!.camp.chases).toBeUndefined();
  }, 120_000);
});

describe('a sitting that starts at the gate (`gate=1` on a live camp)', () => {
  it('is a parameter of the camp, and leaves every other link as it was', () => {
    expect(parseLiveCamp('seed=TES-6931&gate=1').gate).toBe(true);
    expect(parseLiveCamp('seed=TES-6931').gate).toBe(false);
    expect(liveCamp('seed=TES-6931&gate=1').params).toContain('&gate=1');
    expect(liveCamp('seed=TES-6931').params).not.toContain('gate');
  });

  it('starts you a short way outside the opening the scene leaves by, facing it, where nobody has noticed you half a minute on', () => {
    const sc = liveCamp('seed=TES-6931&gate=1') as Scene<Simulation>;
    const world = sc.world(T);
    const m = leavingOf(world, T)!;
    const at = gateStart(world, T)!;
    const sim = startScene(sc, T, world);
    const you = player(sim.index).body;
    expect(Math.hypot(you.x - at.x, you.z - at.z)).toBeLessThan(0.01);
    expect(outsideWalls(world, you.x, you.z)).toBe(true);
    // Out of the opening, along its own way out, and looking back at it.
    const dx = you.x - m.gate.x;
    const dz = you.z - m.gate.z;
    const d = Math.hypot(dx, dz);
    expect(d).toBeGreaterThanOrEqual(35);
    expect(d).toBeLessThanOrEqual(60);
    expect((dx * m.gate.nx + dz * m.gate.nz) / d).toBeCloseTo(1, 6);
    expect(at.faceX).toBeCloseTo(-m.gate.nx, 9);
    expect(at.faceZ).toBeCloseTo(-m.gate.nz, 9);
    // The live camp's own check, from there: left alone, it stays calm.
    expect(runScene(sc, T, { world }).failures).toEqual([]);
  }, 120_000);
});

describe('the chase is for a man who went out, and for nobody else', () => {
  /** The ladder's careless walker on a camp, to the end of his run: how it ended, and every chase taken up before he had ever been inside the walls. */
  function walkIn(seed: string, off: string): { end: number; reason: string; down: number; early: string[] } {
    const sc = ladder(`seed=${seed}&plan=careless${off}`) as Scene<Simulation>;
    const world = sc.world(T);
    const sim = startScene(sc, T, world);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, T);
    const early: string[] = [];
    let inside = false;
    while (!sceneOver(sc, sim, ticks)) {
      sim.step(driver.next(sim, raw));
      const you = player(sim.index).body;
      if (!outsideWalls(world, you.x, you.z)) inside = true;
      if (!inside) for (const g of sim.guards) if (g.brain?.ff?.gate || (g.brain?.ff?.out.length ?? 0) > 0) early.push(`guard ${g.id} at tick ${sim.tick}`);
    }
    const o = sim.state.outcome;
    return { end: o.tick, reason: o.status === 'failed' ? o.reason : o.status, down: world.camp.guards.length - sim.guards.length, early };
  }

  it('a man seen at the gate on his way in has not gone out of anything: he is fought as he was', () => {
    // SIZ-0270: he stops a step outside the front gate, in a guard's view, and walks in. The first version of the chase
    // read where he was last seen (outside, by an opening) as a man who had left, and sent two men out to look for him
    // along the wall while he walked to the target's door.
    const chased = walkIn('SIZ-0270', '');
    expect(chased.early).toEqual([]);
    const before = walkIn('SIZ-0270', '&off=chase');
    expect({ end: chased.end, reason: chased.reason, down: chased.down }).toEqual({ end: before.end, reason: before.reason, down: before.down });
  }, 300_000);
});
