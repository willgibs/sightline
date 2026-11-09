import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { yardOnly } from '../src/lab/experiments/variety';
import { campMission, COMPOUND_TYPES, compoundTypeOf, CRUX_KINDS, cruxOf, generateWorld, siteKindOf, worldFingerprint, SITE_KINDS, type CompoundType, type CruxKind } from '../src/sim/generation';
import { Cell, cellIndex } from '../src/sim/kernel/world/grid';
import type { World } from '../src/sim/kernel/world/world';

/**
 * Compound types (docs/compound-types.md, generation/plots.ts): a seed gets a kind of place
 * that suits its crux and its ground; each kind is what it says; and with every other type
 * weighted to nothing, the generator draws exactly what it did before there were types.
 */

/** A camp of one type: the others weighted to nothing. */
function ofType(type: CompoundType, crux?: CruxKind): Tuning {
  const t = structuredClone(T);
  for (const k of COMPOUND_TYPES) {
    if (k !== type) t.gen.compound.types[k].cruxes = { walk: 0, inside: 0, flush: 0, escort: 0 };
  }
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

  it('a farm has no fence: a court of three, huts beyond, field walls to step round', () => {
    const w = worlds.get('farm')!;
    const L = w.camp.layout!;
    expect(L.plan.perimeter).toBe('fields');
    expect(w.camp.structures.some((s) => s.kind === 'fence')).toBe(false);
    expect(L.towers.length).toBe(1);
    const C = T.gen.compound;
    const low = w.camp.structures.filter((s) => s.kind === 'block' && s.colliders.every((id) => { const c = w.colliders.list[id]!; return c.y1 - c.y0 < C.fieldWall + 0.3; }));
    expect(low.length).toBeGreaterThanOrEqual(4);
    // The barn stands tall, and the house and barn are on the court.
    const barn = L.buildings.find((b) => b.module === 'storage')!;
    expect(barn.height).toBe(C.types.farm.modules.storage[2]);
    // A body gets through the field walls: from outside the plot, the farmyard's middle is on foot.
    const G = w.grid.site;
    const outside = cellIndex(G, w.camp.site.x + L.ux * (L.halfA + 10), w.camp.site.z + L.uz * (L.halfA + 10));
    expect(G.flags[outside]! & Cell.Walkable).toBe(Cell.Walkable);
  });
});

/** TAL-4471, its layout as it was before compound types: generation fingerprints don't move for a yard. */
const BEFORE_TYPES = '317ed710bbcc8526';
