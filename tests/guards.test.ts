import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { routinePose, type RoutinePose } from '../src/sim/generation/routine';
import { generateWorld } from '../src/sim/generation/world';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { Simulation } from '../src/sim/game/sim';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testGuard, testWorld, tuningCopy } from './fixtures';
import { GUARD_ROLES } from '../src/sim/generation';
import { palette } from '../src/render/palette';

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
const worlds: World[] = [];
beforeAll(() => {
  for (const seed of ['TAL-4471', 'MUD-9031']) worlds.push(generateWorld(missionSpec(seed), T));
});

describe('routines', () => {
  it('are pure functions of time that repeat every period, with no jumps', () => {
    for (const w of worlds) {
      for (const g of w.camp.guards) {
        const r = g.routine;
        for (let t = 0; t < 2 * r.period; t += 0.05) {
          const a = { ...routinePose(r, t, pose) };
          expect(routinePose(r, t + r.period, pose)).toMatchObject({ x: expect.closeTo(a.x, 9), z: expect.closeTo(a.z, 9) });
          const b = routinePose(r, t + 0.05, pose);
          // Never faster than the routine's pace.
          expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThanOrEqual(T.gen.routines.pace * 0.05 + 1e-9);
        }
      }
    }
  });

  it("are each guard's own: ids are unique and every patrol draws its own pauses", () => {
    for (const w of worlds) {
      const ids = w.camp.guards.map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
      const holds = w.camp.guards
        .filter((g) => g.route)
        .map((g) => g.routine.legs.filter((l) => l.kind === 'hold').map((l) => l.t1 - l.t0).join());
      expect(new Set(holds).size).toBe(holds.length);
    }
  });

  it('start each guard where he spawns', () => {
    for (const w of worlds) {
      for (const g of w.camp.guards) {
        routinePose(g.routine, 0, pose);
        expect(Math.hypot(pose.x - g.x, pose.z - g.z)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('roles', () => {
  it('are the seven of the design doc, each tinted in the debug view; a generated camp has them all', () => {
    expect([...GUARD_ROLES]).toEqual(['sentry', 'patrol', 'marksman', 'radio-operator', 'officer', 'worker', 'target']);
    expect(Object.keys(palette.debug.roles).sort()).toEqual([...GUARD_ROLES].sort());
    expect(new Set(Object.values(palette.debug.roles)).size).toBe(GUARD_ROLES.length);
    for (const w of worlds) expect([...new Set(w.camp.guards.map((g) => g.role))].sort()).toEqual([...GUARD_ROLES].sort());
  });
});

describe('guards on routine', () => {
  it('keep to their routines within 25 cm for ten minutes, moving with the shared motor (D6)', () => {
    for (const w of worlds) {
      const sim = new Simulation(w, T);
      let worst = 0;
      let walked = 0;
      for (let i = 0; i < 10 * 60 * 30; i++) {
        sim.step(neutralInput(sim.player.yaw));
        for (const g of sim.guards) {
          routinePose(w.camp.guards[g.guard.spawn]!.routine, sim.tick / 30, pose);
          worst = Math.max(worst, Math.hypot(g.body.x - pose.x, g.body.z - pose.z));
          walked += g.body.speed / 30;
        }
      }
      expect(worst).toBeLessThan(0.25);
      expect(walked).toBeGreaterThan(300);
    }
  });

  it("don't depend on each other: removing one leaves every other exactly where he was", () => {
    const w = worlds[0]!;
    const all = new Simulation(w, T);
    const fewer = new Simulation(w, T);
    const gone = fewer.guards[3]!.id;
    fewer.despawn(gone);
    for (let i = 0; i < 5 * 60 * 30; i++) {
      all.step(neutralInput(all.player.yaw));
      fewer.step(neutralInput(fewer.player.yaw));
      for (const g of fewer.guards) {
        const twin = all.guards.find((o) => o.id === g.id)!;
        expect(g.body).toEqual(twin.body);
      }
    }
  });

  it('stand on their towers', () => {
    for (const w of worlds) {
      const sim = new Simulation(w, T);
      for (let i = 0; i < 60; i++) sim.step(neutralInput());
      sim.guards.forEach((g) => {
        const spawn = w.camp.guards[g.guard.spawn]!;
        if (spawn.elevated) {
          expect(g.body.y).toBeCloseTo(spawn.y, 6);
          expect(g.body.standingOn).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });

  it('are stopped by walls like the player', () => {
    const wall = { kind: 'box' as const, x: 10, z: 0, y0: -1, y1: 2.5, hx: 0.2, hz: 6, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
    const guard = testGuard({
      id: 0,
      role: 'patrol',
      x: 16,
      y: 0,
      z: 0,
      faceX: -1,
      faceZ: 0,
      elevated: false,
      route: [
        { x: 16, z: 0 },
        { x: 4, z: 0 },
      ],
      routeStart: 1,
      scanPhase: 0,
      scanScale: 1,
    });
    const sim = new Simulation(testWorld({ colliders: [wall], camp: { structures: [], guards: [guard], fenceHalf: 0 }, spawn: { x: -20, z: 0 } }), tuningCopy());
    let nearest = Infinity;
    for (let i = 0; i < 30 * 8; i++) {
      sim.step(neutralInput());
      nearest = Math.min(nearest, sim.guards[0]!.body.x);
    }
    expect(nearest).toBeGreaterThanOrEqual(10 + 0.2 + T.bodies.guard.radius - 1e-6);
  });

  it('draw from their own random streams, kept in the state', () => {
    const sim = new Simulation(worlds[0]!, T);
    const [a, b] = [sim.guards[0]!.id, sim.guards[1]!.id];
    // A test system can't reach ctx directly; draw through a system that runs once.
    const draws: number[] = [];
    const probe = new Simulation(worlds[0]!, T, [
      ...sim.systems,
      {
        name: 'probe',
        phase: 'mission',
        reads: [],
        writes: ['rng.test'],
        emits: [],
        run: (ctx) => {
          draws.push(ctx.draw(a, 'test', (r) => r.next()), ctx.draw(b, 'test', (r) => r.next()), ctx.draw(a, 'test', (r) => r.next()));
        },
      },
    ]);
    probe.step(neutralInput());
    expect(new Set(draws).size).toBe(3);
    expect(Object.keys(probe.state.rng).sort()).toEqual([`${a}.test`, `${b}.test`]);
    // Guard b's numbers don't depend on how much guard a drew.
    const lone: number[] = [];
    const other = new Simulation(worlds[0]!, T, [...sim.systems, { name: 'probe', phase: 'mission', reads: [], writes: ['rng.test'], emits: [], run: (ctx) => void lone.push(ctx.draw(b, 'test', (r) => r.next())) }]);
    other.step(neutralInput());
    expect(lone[0]).toBe(draws[1]);
  });
});
