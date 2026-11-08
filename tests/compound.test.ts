import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { campMission, defaultCampSpec, generateWorld } from '../src/sim/generation';
import { buildCompound } from '../src/sim/generation/compound';
import type { Ridge } from '../src/sim/generation/landform';
import type { Site } from '../src/sim/generation/site';
import type { TerrainFeatures } from '../src/sim/generation/terrain';
import { Rng } from '../src/sim/kernel/core/rng';
import { ColliderSet, footprintContains } from '../src/sim/kernel/world/colliders';
import { Cell, cellIndex, type GridLayer } from '../src/sim/kernel/world/grid';
import { GridSearch } from '../src/sim/kernel/world/search';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { InvariantWatch } from '../src/sim/body';
import { WanderBot } from '../src/sim/game/bots/wander';
import { Simulation } from '../src/sim/game/sim';
import { testWorld } from './fixtures';

/**
 * The compound (D4, generation/compound.ts): plots and parcels from handmade modules,
 * laid out skeleton first, in its site's frame; its doors and vehicles spawned as
 * entities with solid shapes (game/camp.ts).
 */

const SEEDS = ['TAL-4471', 'MUD-9031', 'KOR-1188', 'BNC-0303', 'POP-6981'];
const worlds: World[] = [];
beforeAll(() => {
  for (const seed of SEEDS) worlds.push(generateWorld(campMission(seed), T));
}, 120_000);

/** A path on the site layer between two points, if one exists within budget. */
function walk(layer: GridLayer, from: { x: number; z: number }, to: { x: number; z: number }): boolean {
  const search = new GridSearch(layer);
  const a = nearestWalkable(layer, from.x, from.z);
  const b = nearestWalkable(layer, to.x, to.z);
  if (a < 0 || b < 0) return false;
  return search.path(a, b, { maxExpansions: layer.nx * layer.nz }).found;
}

/** The walkable cell nearest (x, z), within a metre and a half. */
function nearestWalkable(layer: GridLayer, x: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let dz = -1.5; dz <= 1.5; dz += layer.cell) {
    for (let dx = -1.5; dx <= 1.5; dx += layer.cell) {
      const c = cellIndex(layer, x + dx, z + dz);
      if (c < 0 || (layer.flags[c]! & Cell.Walkable) === 0) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

describe('the compound', () => {
  it('has its modules: the target building with two doors, the others with theirs, towers with ladders', () => {
    for (const w of worlds) {
      const L = w.camp.layout!;
      const modules = L.buildings.map((b) => b.module);
      for (const m of ['hq', 'barracks', 'mess', 'radio'] as const) expect(modules).toContain(m);
      const hq = L.buildings.find((b) => b.module === 'hq')!;
      expect(hq.doors.length).toBe(2);
      for (const b of L.buildings) expect(b.doors.length).toBeGreaterThanOrEqual(1);
      expect(L.towers.length).toBeGreaterThanOrEqual(T.gen.compound.towers[0]!);
      expect(w.camp.ladders!.length).toBe(L.towers.length);
      expect(w.camp.vehicles!.filter((v) => v.escape).length).toBe(1);
      for (const kind of ['generator', 'mast', 'light', 'alarm', 'fence', 'tower'] as const) expect(w.camp.structures.some((s) => s.kind === kind)).toBe(true);
    }
  });

  it('lays down the skeleton first: the way in reaches the target, the generator and both ways out are walkable', () => {
    for (const w of worlds) {
      const sk = w.camp.layout!.skeleton;
      const site = w.grid.site;
      const [outside, , , , , door] = sk.corridor;
      expect(walk(site, outside!, door!)).toBe(true);
      expect(walk(site, outside!, sk.sabotage)).toBe(true);
      expect(walk(site, sk.target, sk.exfil[0]![2]!)).toBe(true);
      expect(walk(site, sk.target, sk.exfil[1]![2]!)).toBe(true);
      // The target's escape: his building, his vehicle (beside it), the gate.
      const vehicle = sk.escape[2]!;
      expect(walk(site, sk.escape[1]!, { x: vehicle.x + 3, z: vehicle.z })).toBe(true);
      expect(walk(site, sk.target, sk.escape[3]!)).toBe(true);
    }
  });

  it('keeps every doorway clear on both sides, and every building walkable inside', () => {
    for (const w of worlds) {
      for (const d of w.camp.doors!) {
        for (const k of [-0.6, 0.6]) {
          const c = cellIndex(w.grid.site, d.x + d.nx * k, d.z + d.nz * k);
          expect(c, `door at ${d.x.toFixed(1)}, ${d.z.toFixed(1)}`).toBeGreaterThanOrEqual(0);
          expect(nearestWalkable(w.grid.site, d.x + d.nx * k, d.z + d.nz * k)).toBeGreaterThanOrEqual(0);
        }
        const inside = { x: d.x + d.nx * 1.2, z: d.z + d.nz * 1.2 };
        const outside = { x: d.x - d.nx * 1.2, z: d.z - d.nz * 1.2 };
        const bd = w.camp.layout!.buildings[d.building]!;
        expect(walk(w.grid.site, outside, inside), `${w.seed}: the ${bd.module}'s door at ${d.x.toFixed(1)}, ${d.z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it("puts nothing inside another: no building's footprint holds another's corner", () => {
    for (const w of worlds) {
      const roofs = w.camp.structures.filter((s) => s.kind === 'building').map((s) => w.colliders.list[s.colliders[s.colliders.length - 1]!]!);
      for (const a of roofs) {
        for (const b of roofs) {
          if (a === b || a.kind !== 'box' || b.kind !== 'box') continue;
          expect(footprintContains(a, b.x, b.z, 0)).toBe(false);
        }
      }
    }
  });

  it('stands wherever its site is: the same camp, moved', () => {
    const hf = testWorld({ size: 1200, cell: 4 }).terrain;
    const ridge = (bx: number, bz: number): Ridge => ({ bx, bz, angle: 0, span: 1, crest: { points: [], lengths: [], total: 0, boxes: new Float64Array(0) }, height: 40, front: 90, gullyRun: 90, back: 150, gullies: [] });
    const build = (site: Site) => {
      const colliders = new ColliderSet(1200);
      const features = { site, ridges: [ridge(-0.8, 0.6)] } as unknown as TerrainFeatures;
      const camp = buildCompound(new Rng('SITE-0002', 'camp'), hf, features, colliders, T.gen, defaultCampSpec());
      return { camp, colliders };
    };
    const axis = { ux: 0.6, uz: -0.8 };
    const home = build({ x: 0, z: 0, ...axis, radius: 78, height: 0 });
    const away = build({ x: 211.5, z: -97.25, ...axis, radius: 78, height: 0 });
    expect(away.colliders.list.length).toBe(home.colliders.list.length);
    home.colliders.list.forEach((c, k) => {
      const d = away.colliders.list[k]!;
      expect(d.x - c.x).toBeCloseTo(211.5, 9);
      expect(d.z - c.z).toBeCloseTo(-97.25, 9);
    });
    home.camp.doors!.forEach((d, k) => expect(away.camp.doors![k]!.x - d.x).toBeCloseTo(211.5, 9));
  });
});

describe("the compound's doors and vehicles", () => {
  it('spawn as entities after the guards, with solid shapes, and keep the motor to its promises', () => {
    const w = worlds[0]!;
    const sim = new Simulation(w, T);
    const doors = sim.index.of('door');
    const vehicles = sim.index.of('vehicle');
    expect(doors.length).toBe(w.camp.doors!.length);
    expect(vehicles.length).toBe(w.camp.vehicles!.length);
    expect(Math.min(...doors.map((d) => d.id))).toBeGreaterThan(Math.max(...sim.guards.map((g) => g.id)));
    expect(sim.solids.count).toBe(doors.length + vehicles.length);
    // A minute of the person-like bot, every body's promises checked every tick.
    const watch = new InvariantWatch(sim);
    const bot = new WanderBot(w.seed);
    const raw = neutralInput();
    for (let i = 0; i < 60 * 30; i++) {
      watch.beforeTick();
      sim.step(bot.next(sim, raw));
      watch.afterTick();
    }
    expect(watch.report.first).toBeNull();
  });

  it("aren't there in Phase 0's valley, whose runs keep their goldens", () => {
    const plain = new Simulation(generateWorld({ ...campMission('TAL-4471'), camp: undefined }, T), T);
    expect(plain.index.of('door').length).toBe(0);
    expect(plain.solids.count).toBe(0);
  });
});

describe("the compound's systems (D5)", () => {
  it('wires every light, alarm box and the radio to the one generator, and names the target as the objective', () => {
    for (const w of worlds) {
      const devices = w.camp.devices!;
      const generators = devices.filter((d) => d.kind === 'generator');
      expect(generators.length).toBe(1);
      const gen = devices.indexOf(generators[0]!);
      for (const d of devices) expect(d.feed).toBe(d.kind === 'generator' ? -1 : gen);
      expect(devices.filter((d) => d.kind === 'radio').length).toBe(1);
      expect(devices.filter((d) => d.kind === 'alarm').length).toBeGreaterThanOrEqual(T.gen.compound.alarms[0]!);
      expect(devices.filter((d) => d.kind === 'light').length).toBeGreaterThanOrEqual(T.gen.compound.lights[0]!);
      for (const d of devices) expect(w.camp.structures[d.structure]!.kind).toBe(d.kind);
      const o = w.camp.objective!;
      expect(w.camp.guards[o.target]!.role).toBe('target');
      expect(w.camp.layout!.buildings[o.building]!.module).toBe('hq');
      expect(w.camp.vehicles![o.vehicle]!.escape).toBe(true);
    }
  });

  it('shows each device as live or dead in the snapshot the renderer reads', () => {
    const w = worlds[1]!;
    const sim = new Simulation(w, T);
    const devices = w.camp.devices!;
    expect(sim.snapshot().devices).toEqual(devices.map(() => 1));
    sim.index.of('generator')[0]!.generator.running = false;
    sim.step(neutralInput(sim.player.yaw));
    const states = sim.snapshot().devices;
    devices.forEach((_, i) => expect(states[i]).toBe(0));
    expect(sim.index.of('objective')[0]!.objective.status).toBe('open');
  });
});
