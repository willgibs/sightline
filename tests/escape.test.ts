import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { CampGauges } from '../src/lab/gauges';
import type { AttackDriver } from '../src/sim/game/attacks';
import { escapeRoute, yardRoute, type VehicleEntity } from '../src/sim/game/camp';
import { commanderOf } from '../src/sim/game/comms';
import { compound } from '../src/sim/game/scenes/compound';
import type { Simulation } from '../src/sim/game/sim';
import { campMission, generateWorld } from '../src/sim/generation';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { emptyHit, raycast } from '../src/sim/kernel/world/query';
import { Solids } from '../src/sim/kernel/world/solids';
import type { World } from '../src/sim/kernel/world/world';

/**
 * The target's way out (E7), after the owner's first fight: the box "seems to run into a
 * building, get stuck, the target gets in, marked as escaped". On LEB-2534 it stalled 12 m
 * along a straight line through a wall, and four seconds later the camp called it away.
 */

// The last two are depots whose jeep is parked by a fence: the open cell nearest it is a pocket behind it.
const SEEDS = ['LEB-2534', 'DEG-0219', 'HOT-7106', 'GUD-4772', 'PEK-0664'];
const worlds = new Map<string, World>();
beforeAll(() => {
  for (const seed of SEEDS) worlds.set(seed, generateWorld(campMission(seed), T));
}, 120_000);

describe('the escape vehicle', () => {
  it('has a way out of the yard that goes through nothing solid', () => {
    for (const [seed, w] of worlds) {
      const v = w.camp.vehicles!.find((x) => x.escape)!;
      const yard = yardRoute(w, T, v);
      expect(yard, seed).not.toBeNull();
      const route = [{ x: v.x, z: v.z }, ...yard!, ...escapeRoute(w, T)];
      const view = { world: w, solids: new Solids(w.colliders), bodies: [] };
      const hit = emptyHit();
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.01) continue;
        raycast(view, a.x, w.terrain.heightAt(a.x, a.z) + 1, a.z, (b.x - a.x) / len, 0, (b.z - a.z) / len, len, Blocks.Move, hit);
        expect(hit.what === 'collider', `${seed}, leg ${i}`).toBe(false);
      }
    }
  });

  it('follows the road out, not a line off the gate', () => {
    for (const [, w] of worlds) {
      const route = escapeRoute(w, T);
      expect(route.length).toBeGreaterThan(2);
      const road = w.features.road.points;
      for (const p of route.slice(1)) expect(road.some((q) => q.x === p.x && q.z === p.z)).toBe(true);
    }
  });

  /** A sniper at the camp, up to the moment the target is aboard. */
  function untilAboard(seed: string): { sim: Simulation; next: () => void; truck: VehicleEntity } {
    const w = worlds.get(seed)!;
    const scene = { ...(compound(`seed=${seed}&attack=sniper`) as Scene<Simulation>), world: () => w };
    const sim = startScene(scene, T, w);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const next = (): void => void sim.step(driver.next(sim, raw));
    for (let i = 0; i < 120 * 30 && commanderOf(sim)!.camp.objective?.status !== 'escaping'; i++) next();
    expect(commanderOf(sim)!.camp.objective?.status).toBe('escaping');
    return { sim, next, truck: sim.index.of('vehicle').find((v) => v.vehicle.escape)! };
  }

  it('is away only at the end of the road', () => {
    const { sim, next, truck } = untilAboard('LEB-2534');
    const end = truck.vehicle.driving!.route.at(-1)!;
    for (let i = 0; i < 60 * 30 && commanderOf(sim)!.camp.objective?.status === 'escaping'; i++) next();
    expect(commanderOf(sim)!.camp.objective?.status).toBe('escaped');
    expect(Math.hypot(truck.solid.x - end.x, truck.solid.z - end.z)).toBeLessThan(T.brain.alarm.flee.drive / 30 + 0.01);
  }, 120_000);

  it('hasn’t escaped because it is held up', () => {
    const { sim, next, truck } = untilAboard('LEB-2534');
    truck.vehicle.driving!.waited = T.brain.alarm.flee.giveWay * 10;
    next();
    expect(commanderOf(sim)!.camp.objective?.status).toBe('escaping');
    expect(truck.vehicle.driving).toBeDefined();
  }, 120_000);
});

describe('the lab panel on the camp’s return fire', () => {
  it('measures the rounds against where the shooter last fired from', () => {
    const w = worlds.get('LEB-2534')!;
    const scene = { ...(compound('seed=LEB-2534&attack=sniper') as Scene<Simulation>), world: () => w };
    const sim = startScene(scene, T, w);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const gauges = new CampGauges(sim);
    for (let i = 0; i < 90 * 30; i++) gauges.observe(sim, sim.step(driver.next(sim, raw)));
    const r = gauges.read(sim);
    expect(r.returnFire.rounds).toBeGreaterThan(0);
    expect(r.returnFire.closest).toBeGreaterThanOrEqual(0);
    expect(r.returnFire.closest).toBeLessThan(400);
    expect(r.returnFire.struck).toBeLessThanOrEqual(r.returnFire.rounds);
    expect(r.sinceLastShot).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
