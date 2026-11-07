import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/core/rng';
import { neutralInput, type InputFrame } from '../src/sim/input';
import { bodyHeight } from '../src/sim/motor/body';
import { Simulation } from '../src/sim/sim';
import { Faction, type SolidEntity } from '../src/sim/state';
import { SYSTEMS, withSystem, type System } from '../src/sim/systems';
import { Blocks, ColliderSet, footprintExtent, overlapsBody, pushOutCircle, type Collider, type ColliderInput } from '../src/sim/world/colliders';
import { emptyHit, raycast, sightLine } from '../src/sim/world/query';
import { ENTITY_SOLID, Solids, entityOfCollider, solidId } from '../src/sim/world/solids';
import { Surface } from '../src/sim/world/surfaces';
import { EAST, testWorld } from './fixtures';

/**
 * Entities' solid shapes (world/solids.ts): the motor and every query see them exactly as
 * they see the world's colliders, they live in the state tree, and a moving one that
 * waits for bodies to clear keeps the motor's invariants.
 */

const box = (x: number, z: number, y0: number, y1: number, hx: number, hz: number, flags: number = Blocks.All): Collider => ({
  kind: 'box',
  id: 0,
  x,
  z,
  y0,
  y1,
  hx,
  hz,
  ux: 1,
  uz: 0,
  flags,
  surface: Surface.Metal,
});

function solid(sim: Simulation, shape: Collider): SolidEntity {
  return sim.spawn((id) => ({ id, kind: 'solid', faction: Faction.None, solid: shape }));
}

function walk(sim: Simulation, ticks: number, frame: Partial<InputFrame>): void {
  const input = { ...neutralInput(sim.player.yaw), ...frame };
  for (let i = 0; i < ticks; i++) sim.step(input);
}

describe("entities' solid shapes", () => {
  it('answer queries as if they were among the world colliders', () => {
    // The same shapes once as world colliders and once as entities' shapes: every ray and box agrees.
    const rng = new Rng('SOLIDS-0001', 'shapes');
    const shapes: ColliderInput[] = [];
    for (let k = 0; k < 12; k++) {
      const a = rng.range(0, Math.PI);
      shapes.push(
        k % 3 === 0
          ? { kind: 'cyl', x: rng.range(-30, 30), z: rng.range(-30, 30), y0: 0, y1: rng.range(0.5, 4), r: rng.range(0.2, 2), flags: k % 2 ? Blocks.All : Blocks.Move, surface: Surface.Wood }
          : {
              kind: 'box',
              x: rng.range(-30, 30),
              z: rng.range(-30, 30),
              y0: 0,
              y1: rng.range(0.5, 4),
              hx: rng.range(0.2, 3),
              hz: rng.range(0.2, 3),
              ux: Math.cos(a),
              uz: Math.sin(a),
              flags: k % 2 ? Blocks.All : Blocks.Sight,
              surface: Surface.Metal,
            },
      );
    }
    const both = new ColliderSet(200);
    for (const c of shapes) both.add(c);
    both.build();
    const solids = new Solids(new ColliderSet(200));
    solids.fixed.build();
    solids.track(shapes.map((c, k) => ({ ...c, id: solidId(k + 2) }) as Collider));
    const ids: number[] = [];
    const want: number[] = [];
    const hitA = { dist: 0, id: -1 };
    const hitB = { dist: 0, id: -1 };
    for (let k = 0; k < 400; k++) {
      const o = [rng.range(-40, 40), rng.range(0.1, 3), rng.range(-40, 40)];
      const u = rng.unit2();
      const d = [u.x * 0.97, rng.range(-0.2, 0.2), u.z * 0.97];
      const l = Math.sqrt(d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!);
      const mask = [Blocks.Move, Blocks.Sight, Blocks.All][k % 3]!;
      both.raycast(o[0]!, o[1]!, o[2]!, d[0]! / l, d[1]! / l, d[2]! / l, 60, mask, hitA);
      solids.raycast(o[0]!, o[1]!, o[2]!, d[0]! / l, d[1]! / l, d[2]! / l, 60, mask, hitB);
      expect(hitB.dist, `ray ${k}`).toBe(hitA.dist);
      if (hitA.id >= 0) expect(entityOfCollider(hitB.id) - 2).toBe(hitA.id);
      // A box query returns candidates; both must include every shape whose footprint reaches the box.
      const [x, z] = [o[0]!, o[2]!];
      const reaches = (c: Collider): boolean => {
        const { ex, ez } = footprintExtent(c);
        return c.x + ex >= x - 4 && c.x - ex <= x + 4 && c.z + ez >= z - 4 && c.z - ez <= z + 4;
      };
      both.query(x - 4, z - 4, x + 4, z + 4, want);
      solids.query(x - 4, z - 4, x + 4, z + 4, ids);
      const truth = both.list.filter(reaches).map((c) => c.id);
      expect(want.filter((id) => reaches(both.list[id]!)).sort((p, q) => p - q), `box ${k}`).toEqual(truth);
      expect(ids.map((id) => entityOfCollider(id) - 2).sort((p, q) => p - q), `box ${k}`).toEqual(truth);
    }
  });

  it('get ids of their own, the same for the whole run and after a restore', () => {
    const sim = new Simulation(testWorld(), T);
    const crate = solid(sim, box(5, 5, 0, 1, 0.5, 0.5));
    expect(crate.solid.id).toBe(ENTITY_SOLID + crate.id);
    expect(sim.solids.get(solidId(crate.id))).toBe(crate.solid);
    const saved = sim.saveState();
    sim.despawn(crate.id);
    expect(sim.solids.count).toBe(0);
    expect(() => sim.solids.get(solidId(crate.id))).toThrow();
    sim.restore(saved);
    expect(sim.solids.get(solidId(crate.id)).x).toBe(5);
    // In the snapshot too, for the renderer.
    expect(sim.snapshot().solids.map((c) => c.id)).toEqual([solidId(crate.id)]);
  });

  it('stop a body as a wall does, and can be stood on', () => {
    // A wall 5 m east, and a crate 0.4 m high (a step) 2 m north.
    const sim = new Simulation(testWorld(), T);
    solid(sim, box(5, 0, 0, 2, 0.2, 3));
    walk(sim, 90, { yaw: EAST, moveZ: 1 });
    expect(sim.player.x).toBeLessThan(5 - 0.2 - T.bodies.player.radius + 1e-6);
    expect(sim.player.x).toBeGreaterThan(4.3);

    const s2 = new Simulation(testWorld(), T);
    const crate = solid(s2, box(0, -2, 0, 0.4, 0.8, 0.8));
    walk(s2, 30, { yaw: 0, moveZ: 1 });
    expect(s2.player.y).toBeCloseTo(0.4, 9);
    expect(s2.player.standingOn).toBe(crate.solid.id);
    // Take the crate away: the body drops back to the ground.
    s2.despawn(crate.id);
    walk(s2, 15, {});
    expect(s2.player.y).toBeCloseTo(0, 9);
    expect(s2.player.standingOn).toBe(-1);
  });

  it('stop shots and sight, and say whose they are', () => {
    const sim = new Simulation(testWorld(), T);
    const gate = solid(sim, box(10, 0, 0, 3, 0.1, 2));
    const hit = raycast(sim.queryView(), 0, 1.5, 0, 1, 0, 0, 50, Blocks.Bullet, emptyHit(), sim.playerId);
    expect(hit).toMatchObject({ what: 'collider', surface: Surface.Metal, nx: -1 });
    expect(entityOfCollider(hit.id)).toBe(gate.id);
    expect(hit.x).toBeCloseTo(9.9, 9);
    expect(sightLine(sim.queryView(), 0, 1.5, 0, 20, 1.5, 0, Blocks.Sight, sim.playerId)).toBe(false);
    // A chain-link gate stops bodies, not sight.
    gate.solid.flags = Blocks.Move;
    expect(sightLine(sim.queryView(), 0, 1.5, 0, 20, 1.5, 0, Blocks.Sight, sim.playerId)).toBe(true);
  });

  it('keep the motor invariants when they move: a gate that waits for bodies to clear', () => {
    // A gate slides across a gap in a wall, back and forth every 4 s, but only into space no body is in.
    const wall = (x: number, hz: number, z: number): ColliderInput => ({ kind: 'box', x, z, y0: -1, y1: 3, hx: 0.2, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
    const world = testWorld({ colliders: [wall(10, 20, -21.5), wall(10, 20, 21.5)], spawn: { x: 0, z: 0 } });
    let gateId = -1;
    let waits = 0;
    const gate: System = {
      name: 'test-gate',
      phase: 'world',
      run(ctx) {
        const e = ctx.state.entities.find((x) => x.id === gateId);
        if (!e || e.kind !== 'solid') return;
        const t = ctx.tick / 30;
        const goal = Math.floor(t / 4) % 2 === 0 ? 0 : 3.2; // shut across the gap, or open to the side
        const step = Math.max(-0.05, Math.min(0.05, goal - e.solid.z));
        const next = { ...e.solid, z: e.solid.z + step };
        for (const b of ctx.state.entities) {
          if (!('body' in b)) continue;
          const spec = ctx.tuning.bodies[b.kind];
          if (overlapsBody(next, b.body.x, b.body.y, b.body.z, spec.radius + 0.02, bodyHeight(b.body, spec))) {
            waits++;
            return;
          }
        }
        e.solid.z = next.z;
      },
    };
    const sim = new Simulation(world, T, withSystem(SYSTEMS, gate));
    gateId = solid(sim, { ...box(10, 3.2, -1, 3, 0.15, 1.6) }).id;
    const rng = new Rng('GATE-0001', 'walk');
    const push = { x: 0, z: 0 };
    let crossings = 0;
    let side = Math.sign(sim.player.x - 10);
    for (let i = 0; i < 1800; i++) {
      // Wander across the gap and back, sometimes standing in it.
      const target = Math.floor(i / 150) % 2 === 0 ? 20 : 0;
      const dx = target - sim.player.x;
      const dz = rng.range(-0.3, 0.3) - sim.player.z;
      const input = { ...neutralInput(Math.atan2(-dx, -dz)), moveZ: i % 97 < 12 ? 0 : 1 };
      sim.step(input);
      const p = sim.player;
      const spec = T.bodies.player;
      for (const c of sim.solids.shapes) {
        const inside = c.y1 > p.y + spec.stepHeight && c.y0 < p.y + bodyHeight(p, spec) && pushOutCircle(c, p.x, p.z, spec.radius, push) && push.x * push.x + push.z * push.z > 1e-6;
        expect(inside, `tick ${sim.tick}: inside the gate`).toBe(false);
      }
      const s = Math.sign(p.x - 10);
      if (s !== side) crossings++;
      side = s;
    }
    // The run did what it is for: the body went through the gap both ways, and the gate had to wait for it.
    expect(crossings).toBeGreaterThan(2);
    expect(waits).toBeGreaterThan(0);
  });
});
