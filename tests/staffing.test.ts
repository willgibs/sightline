import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { plainTuning } from '../src/lab/experiments/variety';
import { campMission, generateWorld, GUARD_ROLES } from '../src/sim/generation';
import { minimumCut } from '../src/sim/generation/chokepoints';
import { routinePose, type RoutinePose } from '../src/sim/generation/routine';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Cell, cellIndex } from '../src/sim/kernel/world/grid';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { Simulation } from '../src/sim/game/sim';
import { testWorld } from './fixtures';

/**
 * Staffing (D6, generation/staffing.ts, patrols.ts, chokepoints.ts): guards bought with
 * points, all seven roles, sentries at the camp's chokepoints, patrols on its lanes, and
 * every routine fitted to one cycle of the camp.
 */

const worlds: World[] = [];
beforeAll(() => {
  for (const [seed, difficulty] of [
    ['TAL-4471', 0],
    ['MUD-9031', 0.5],
    ['KOR-1188', 1],
    ['POP-6981', 0.5],
  ] as const) {
    worlds.push(generateWorld(campMission(seed, { archetype: 'compound', difficulty }), T));
  }
}, 120_000);

const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

describe('chokepoints', () => {
  it('are the narrowest set of cells every way between two places crosses', () => {
    // A wall across the middle of a field, with a 4 m gap: the cut is the gap.
    const wall = (x0: number, x1: number) => ({ kind: 'box' as const, x: (x0 + x1) / 2, z: 0, y0: -1, y1: 3, hx: (x1 - x0) / 2, hz: 0.25, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
    const w = testWorld({ size: 60, cell: 1, colliders: [wall(-30, -2), wall(2, 30)], spawn: { x: 0, z: 20 } });
    const cut = minimumCut(w.grid.site, { x: 0, z: -15 }, 4, { x: 0, z: 15 }, 4, 10)!;
    expect(cut).not.toBeNull();
    expect(Math.abs(cut.x)).toBeLessThan(1.5);
    expect(Math.abs(cut.z)).toBeLessThan(1.5);
    // The gap, less a body's clearance either side.
    expect(cut.width).toBeGreaterThanOrEqual(2);
    expect(cut.width).toBeLessThanOrEqual(5);
    // Wider than the limit, a passage is no chokepoint.
    expect(minimumCut(w.grid.site, { x: 0, z: -15 }, 4, { x: 0, z: 15 }, 4, 1)).toBeNull();
  });
});

describe('a generated camp\'s guards', () => {
  it('fill all seven roles, within the cap and the points their difficulty buys', () => {
    for (const w of worlds) {
      const roles = new Set(w.camp.guards.map((g) => g.role));
      expect([...roles].sort()).toEqual([...GUARD_ROLES].sort());
      expect(w.camp.guards.length).toBeLessThanOrEqual(T.gen.staffing.cap);
      const S = T.gen.staffing;
      const cost = { sentry: S.cost.sentry, patrol: S.cost.patrol, marksman: S.cost.marksman, 'radio-operator': S.cost.radio, officer: S.cost.officer, worker: S.cost.worker, target: 0 } as const;
      const spent = w.camp.guards.reduce((sum, g) => sum + cost[g.role], 0);
      const d = w.spec.camp!.difficulty;
      expect(spent).toBeLessThanOrEqual(S.points[0]! + (S.points[1]! - S.points[0]!) * d);
      // Marksmen hold the tower decks.
      for (const g of w.camp.guards.filter((g) => g.role === 'marksman')) expect(g.elevated).toBe(true);
    }
    // Harder camps have more guards.
    expect(worlds[2]!.camp.guards.length).toBeGreaterThan(worlds[0]!.camp.guards.length);
  });

  it('keep routines that divide one cycle of the camp, so its rhythm repeats exactly', () => {
    for (const w of worlds) {
      const cycle = w.camp.cycle!;
      expect(cycle).toBeGreaterThanOrEqual(T.gen.staffing.cycle[0]!);
      expect(cycle).toBeLessThanOrEqual(T.gen.staffing.cycle[1]!);
      for (const g of w.camp.guards) {
        const r = g.routine;
        const k = cycle / r.period;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect(Math.abs(cycle / r.scanPeriod - Math.round(cycle / r.scanPeriod))).toBeLessThan(1e-9);
        for (let t = 0; t < cycle; t += 7.3) {
          const a = { ...routinePose(r, t, pose) };
          const b = routinePose(r, t + cycle, pose);
          expect(b.x).toBeCloseTo(a.x, 6);
          expect(b.z).toBeCloseTo(a.z, 6);
          expect(b.headYaw).toBeCloseTo(a.headYaw, 6);
        }
        // He starts where he spawns.
        routinePose(r, 0, pose);
        expect(Math.hypot(pose.x - g.x, pose.z - g.z)).toBeLessThan(1e-9);
      }
    }
  });

  it('walk only where a body can stand, and patrols sharing a loop walk it apart', () => {
    for (const w of worlds) {
      for (const g of w.camp.guards) {
        if (g.elevated) continue;
        for (let t = 0; t < g.routine.period; t += 0.5) {
          routinePose(g.routine, t, pose);
          const c = cellIndex(w.grid.site, pose.x, pose.z);
          expect(c, `${g.role} ${g.id} at ${t.toFixed(1)} s`).toBeGreaterThanOrEqual(0);
          expect((w.grid.site.flags[c]! & Cell.Walkable) !== 0, `${w.seed}: ${g.role} ${g.id} at ${t.toFixed(1)} s, (${pose.x.toFixed(1)}, ${pose.z.toFixed(1)})`).toBe(true);
        }
      }
      // No two guards on the ground ever come within the clearance of each other: patrols
      // sharing a loop walk it apart (at start times staffing chose, D7, so the sightline
      // graph's clusters stay within their limits).
      const ground = w.camp.guards.filter((g) => !g.elevated);
      const other = { ...pose };
      for (let t = 0; t < w.camp.cycle!; t += 0.5) {
        for (let a = 0; a < ground.length; a++) {
          routinePose(ground[a]!.routine, t, pose);
          for (let b = a + 1; b < ground.length; b++) {
            routinePose(ground[b]!.routine, t, other);
            const d = Math.hypot(pose.x - other.x, pose.z - other.z);
            expect(d, `${w.seed}: ${ground[a]!.role} ${ground[a]!.id} and ${ground[b]!.role} ${ground[b]!.id} at ${t} s`).toBeGreaterThanOrEqual(T.gen.staffing.clearance - 1e-6);
          }
        }
      }
    }
  });

  it('post sentries off the way in that the skeleton laid down', () => {
    // Asked of a camp whose crux is the way in along that skeleton: the old promise's. A
    // camp with another crux has no way in to keep; an inside camp's is the walked one.
    const plain = plainTuning(T);
    for (const seed of ['TAL-4471', 'KOR-1188']) {
      const w = generateWorld(campMission(seed), plain);
      const corridor = w.camp.layout!.skeleton.corridor;
      for (const g of w.camp.guards.filter((h) => h.role === 'sentry')) {
        let nearest = Infinity;
        for (const p of corridor) nearest = Math.min(nearest, Math.hypot(p.x - g.x, p.z - g.z));
        expect(nearest, `${w.seed}: sentry ${g.id}`).toBeGreaterThan(5);
      }
    }
  }, 120_000);

  it('keep to their routines through the motor, through doorways and round buildings', () => {
    const w = worlds[1]!;
    const sim = new Simulation(w, T);
    let worst = 0;
    for (let i = 0; i < 120 * 30; i++) {
      sim.step(neutralInput(sim.player.yaw));
      for (const g of sim.guards) {
        const spawn = w.camp.guards[g.guard.spawn]!;
        if (spawn.elevated) continue;
        routinePose(spawn.routine, sim.tick / 30, pose);
        worst = Math.max(worst, Math.hypot(g.body.x - pose.x, g.body.z - pose.z));
      }
    }
    expect(worst).toBeLessThan(0.25);
  }, 120_000);

  it("never come within a body's reach of each other on routine, over the whole cycle", () => {
    for (const w of worlds) {
      const guards = w.camp.guards.filter((g) => !g.elevated);
      const cycle = w.camp.cycle!;
      const at = guards.map(() => ({ x: 0, z: 0 }));
      for (let t = 0; t < cycle; t += 0.25) {
        guards.forEach((g, k) => {
          routinePose(g.routine, t, pose);
          at[k]!.x = pose.x;
          at[k]!.z = pose.z;
        });
        for (let a = 0; a < guards.length; a++) {
          for (let b = a + 1; b < guards.length; b++) {
            expect(Math.hypot(at[a]!.x - at[b]!.x, at[a]!.z - at[b]!.z), `${w.seed} at ${t} s: ${guards[a]!.role} and ${guards[b]!.role}`).toBeGreaterThanOrEqual(T.gen.staffing.clearance);
          }
        }
      }
    }
  });
});
