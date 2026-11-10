import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { fromOutside } from '../src/lab/experiments/circling';
import { yardOnly } from '../src/lab/experiments/variety';
import { campMission, COMPOUND_TYPES, compoundTypeOf, CRUX_KINDS, cruxOf, generateWorld, siteKindOf, worldFingerprint, SITE_KINDS, type CompoundType, type CruxKind } from '../src/sim/generation';
import { Simulation } from '../src/sim/game/sim';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Cell, cellIndex } from '../src/sim/kernel/world/grid';
import { sightLine } from '../src/sim/kernel/world/query';
import { Solids } from '../src/sim/kernel/world/solids';
import type { World } from '../src/sim/kernel/world/world';

/**
 * Compound types (docs/compound-types.md, generation/plots.ts): a seed gets a kind of place
 * that suits its crux and its ground; each kind is what it says; and with every other type
 * weighted to nothing, the generator draws exactly what it did before there were types.
 */

/** A camp of one type: the others weighted to nothing. */
function ofType(type: CompoundType, crux?: CruxKind): Tuning {
  const t = structuredClone(T);
  for (const k of COMPOUND_TYPES) t.gen.compound.types[k].cruxes = k === type ? { walk: 1, inside: 1, flush: 1, escort: 1 } : { walk: 0, inside: 0, flush: 0, escort: 0 };
  if (crux) t.gen.crux.kinds = { walk: 0, inside: 0, flush: 0, escort: 0, [crux]: 1 };
  return t;
}

const inFrame = (w: World, x: number, z: number): { a: number; b: number } => {
  const L = w.camp.layout!;
  const dx = x - w.camp.site.x;
  const dz = z - w.camp.site.z;
  return { a: dx * L.ux + dz * L.uz, b: dx * L.vx + dz * L.vz };
};

describe('which type a seed gets', () => {
  it('depends only on its crux and its ground, and never on a type weighted to nothing', () => {
    const G = T.gen;
    for (let k = 0; k < 200; k++) {
      const seed = `TYPE-${k}`;
      const crux = cruxOf(seed, G);
      const kind = siteKindOf(seed, G);
      const type = compoundTypeOf(seed, crux, kind, G);
      expect(compoundTypeOf(seed, crux, kind, G)).toBe(type);
      expect(G.compound.types[type].cruxes[crux] * G.compound.types[type].sites[kind]).toBeGreaterThan(0);
    }
    // Every pair of crux and ground has a place to be.
    for (const crux of CRUX_KINDS.filter((c) => c !== 'walk')) {
      for (const kind of SITE_KINDS) {
        const total = COMPOUND_TYPES.reduce((sum, t) => sum + G.compound.types[t].cruxes[crux] * G.compound.types[t].sites[kind], 0);
        expect(total, `${crux} on a ${kind}`).toBeGreaterThan(0);
      }
    }
  });

  it('comes from its own stream: with only the yard weighted, every seed gets the yard', () => {
    const yard = yardOnly(T).gen;
    for (let k = 0; k < 50; k++) {
      const seed = `TYPE-${k}`;
      expect(compoundTypeOf(seed, cruxOf(seed, yard), siteKindOf(seed, yard), yard)).toBe('yard');
    }
  });
});

describe('with only the yard weighted', () => {
  it('generates exactly what it did before there were types', () => {
    const w = generateWorld(campMission('TAL-4471'), yardOnly(T));
    expect(w.camp.layout!.type).toBe('yard');
    // The layout's two new fields aside, every generated field: colliders, guards, report.
    for (const key of ['type', 'loops', 'road']) delete (w.camp.layout as unknown as Record<string, unknown>)[key];
    expect(worldFingerprint(w)).toBe(BEFORE_TYPES);
  }, 120_000);
});

describe('each kind of place', () => {
  const worlds = new Map<CompoundType, World>();
  beforeAll(() => {
    // A seed each where its validation passes and the generator wasn't rebuilt, so the pictures of it are real.
    const picks: Array<[CompoundType, CruxKind]> = [
      ['keep', 'inside'],
      ['depot', 'escort'],
      ['farm', 'flush'],
    ];
    for (const [type, crux] of picks) {
      const t = ofType(type, crux);
      worlds.set(type, generateWorld(campMission(`KIND-${type}-7`), t));
    }
  }, 300_000);

  it('passes what every camp must, with all of its roles', () => {
    for (const [type, w] of worlds) {
      expect(w.camp.layout!.type).toBe(type);
      expect(w.report.validation!.failed, type).toEqual([]);
      const modules = w.camp.layout!.buildings.map((b) => b.module);
      for (const m of ['hq', 'barracks', 'mess', 'radio'] as const) expect(modules, type).toContain(m);
      expect(new Set(w.camp.guards.map((g) => g.role)).size, type).toBeGreaterThanOrEqual(6);
    }
  });

  it('a keep has him in the middle, behind a wall all round', () => {
    const w = worlds.get('keep')!;
    const L = w.camp.layout!;
    const hq = L.buildings.find((b) => b.module === 'hq')!;
    const f = inFrame(w, hq.x, hq.z);
    expect(Math.abs(f.a)).toBeLessThan(2);
    expect(Math.abs(f.b)).toBeLessThan(2);
    expect(L.plan.perimeter).toBe('fort');
    expect(hq.height).toBe(T.gen.compound.types.keep.modules.hq[2]);
    expect(w.camp.structures.some((s) => s.kind === 'fence')).toBe(false);
  });

  it('a depot has a road through it, gate to gate, and its doors open on to the road', () => {
    const w = worlds.get('depot')!;
    const L = w.camp.layout!;
    const gates = L.openings.filter((o) => o.kind === 'gate');
    expect(gates.map((o) => o.side).sort()).toEqual(['back', 'front']);
    expect(L.halfA / L.halfB).toBeGreaterThan(1.5);
    const roadB = gates[0]!.b;
    const half = T.gen.compound.road / 2;
    // Nothing built on the road, its whole length.
    for (const b of L.buildings) {
      const f = inFrame(w, b.x, b.z);
      const across = Math.abs(f.b - roadB);
      expect(across + 1e-6, b.module).toBeGreaterThan(half);
    }
    // Every shed's doors open on to the road: the door's inward normal points away from it.
    for (const b of L.buildings) {
      const door = w.camp.doors![b.doors[0]!]!;
      const f = inFrame(w, door.x, door.z);
      const onward = (door.nx * L.vx + door.nz * L.vz) * Math.sign(f.b - roadB);
      expect(onward, `the ${b.module}'s door`).toBeGreaterThan(0.5);
    }
  });

  it('a farm has no fence: a court of three, huts beyond, long field walls with gaps to find', () => {
    const w = worlds.get('farm')!;
    const L = w.camp.layout!;
    expect(L.plan.perimeter).toBe('fields');
    expect(w.camp.structures.some((s) => s.kind === 'fence')).toBe(false);
    expect(L.towers.length).toBe(1);
    const C = T.gen.compound;
    // Nearly every run of its field walls stands higher than a man, and there are gaps between them.
    const walls = w.camp.structures.filter((s) => s.kind === 'block').flatMap((s) => s.colliders.map((id) => w.colliders.list[id]!)).filter((c) => c.kind === 'box' && Math.abs(Math.max(c.hx, c.hz) * 2) >= 10 && Math.min(c.hx, c.hz) <= 0.3);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(walls.filter((c) => c.y1 - c.y0 >= C.fieldWallHigh).length).toBeGreaterThanOrEqual(walls.length / 2);
    // The barn stands tall, and the house and barn are on the court.
    const barn = L.buildings.find((b) => b.module === 'storage')!;
    expect(barn.height).toBe(C.types.farm.modules.storage[2]);
    // A body gets through the field walls: from outside the plot, the farmyard's middle is on foot.
    const G = w.grid.site;
    const outside = cellIndex(G, w.camp.site.x + L.ux * (L.halfA + 10), w.camp.site.z + L.uz * (L.halfA + 10));
    expect(G.flags[outside]! & Cell.Walkable).toBe(Cell.Walkable);
  });
});

describe('what its shape shows from outside (the owner: walking the outside should not hand you each man in turn)', () => {
  const SEEDS = ['KIND-walled-1', 'KIND-walled-2', 'KIND-walled-3'];
  const shown = new Map<string, { inView: number; arc: number; hidden: number }>();
  const worlds = new Map<string, World>();
  const read = (w: World) => fromOutside(new Simulation(w, T));
  beforeAll(() => {
    for (const seed of SEEDS) {
      for (const [name, t] of [['yard', yardOnly(T)], ['walled', ofType('walled', 'flush')], ['depot', ofType('depot', 'flush')], ['farm', ofType('farm', 'flush')], ['keep', ofType('keep', 'flush')]] as const) {
        const w = generateWorld(campMission(seed), t);
        worlds.set(`${seed}/${name}`, w);
        shown.set(`${seed}/${name}`, read(w));
      }
    }
  }, 600_000);

  it('a place behind walls shows fewer men from every stop on the walk than the open yard', () => {
    for (const seed of SEEDS) {
      const yard = shown.get(`${seed}/yard`)!;
      for (const name of ['walled', 'depot', 'farm', 'keep']) {
        expect(shown.get(`${seed}/${name}`)!.inView, `${seed}, ${name} against the yard`).toBeLessThan(yard.inView);
      }
    }
  });

  it('a windowed wall is a wall, with no more chain link than its windows', () => {
    const C = T.gen.compound;
    for (const seed of SEEDS) {
      for (const name of ['walled', 'depot']) {
        const w = worlds.get(`${seed}/${name}`)!;
        if (w.camp.layout!.plan.perimeter !== 'windowed') continue;
        const chain = w.camp.structures.filter((s) => s.kind === 'fence').flatMap((s) => s.colliders.map((id) => w.colliders.list[id]!)).reduce((n, c) => n + (c.kind === 'box' ? 2 * Math.max(c.hx, c.hz) : 0), 0);
        expect(chain, `${seed}, ${name}`).toBeLessThanOrEqual(4 * C.windows[1]! * C.windowWidth[1]! + 1e-6);
      }
    }
  });

  it('a gate can be seen into from straight ahead, and not from off to one side', () => {
    const D = T.gen.compound.types.walled.barbican;
    // A solid wall either side, or a window beside the gate would be the thing seen through.
    const solid = ofType('walled', 'flush');
    solid.gen.compound.types.walled.perimeters = { chain: 0, screen: 0, fort: 1, fields: 0, windowed: 0 };
    for (const seed of SEEDS) {
      const w = generateWorld(campMission(seed), solid);
      const L = w.camp.layout!;
      const g = L.openings.find((o) => o.kind === 'gate')!;
      const s = w.camp.site;
      const point = (a: number, b: number) => ({ x: s.x + L.ux * a + L.vx * b, z: s.z + L.uz * a + L.vz * b });
      // The two walls run out from the gate along the road: they say which way is straight ahead.
      const gate = point(g.a, g.b);
      const wall = w.colliders.list.find((c) => c.kind === 'box' && Math.abs(c.hx * 2 - D) < 1e-6 && Math.hypot(c.x - gate.x, c.z - gate.z) < D)!;
      expect(wall, seed).toBeDefined();
      const sign = wall.kind === 'box' && wall.ux * L.ux + wall.uz * L.uz > 0 ? 1 : -1;
      const ux = wall.kind === 'box' ? wall.ux * sign : 0;
      const uz = wall.kind === 'box' ? wall.uz * sign : 0;
      const view = { world: w, solids: new Solids(w.colliders), bodies: [] };
      const inside = point(g.a - 4, g.b);
      const y = w.terrain.heightAt(inside.x, inside.z) + 1.5;
      // On the level, so what's in the way is the walls and not the lie of the ground outside.
      const canSee = (x: number, z: number): boolean => sightLine(view, x, y, z, inside.x, y, inside.z, Blocks.Sight);
      expect(canSee(gate.x + ux * (D + 1), gate.z + uz * (D + 1)), `${seed}: from straight ahead`).toBe(true);
      // From 6 m outside the wall, 14 m to either side of the gate: the walls are in the way.
      const side = (b: number) => point(g.a + 6, g.b + b);
      const left = side(-g.width / 2 - 14);
      const right = side(g.width / 2 + 14);
      expect(canSee(left.x, left.z), `${seed}: from one side`).toBe(false);
      expect(canSee(right.x, right.z), `${seed}: from the other side`).toBe(false);
    }
  }, 300_000);
});

/** TAL-4471, its layout as it was before compound types: generation fingerprints don't move for a yard. */
const BEFORE_TYPES = '317ed710bbcc8526';
