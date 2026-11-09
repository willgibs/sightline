import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { bodyShape, createBody } from '../src/sim/body';
import { emptyStrike, fly, type BulletState, type Flight } from '../src/sim/ballistics';
import { stimulus } from '../src/sim/game/drops';
import { compound } from '../src/sim/game/scenes/compound';
import { labWorld } from '../src/sim/game/scenes/perceptionLab';
import type { Simulation } from '../src/sim/game/sim';
import { campMission, generateWorld } from '../src/sim/generation';
import { Rng } from '../src/sim/kernel/core/rng';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { crownsOf, type FoliageVolume } from '../src/sim/kernel/world/foliage';
import { emptyHit, IGNORE_CROWNS, raycast, sightLine, type QueryView } from '../src/sim/kernel/world/query';
import { Solids } from '../src/sim/kernel/world/solids';
import { emptyShape } from '../src/sim/kernel/world/shape';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { emptyExposure, exposure, type Observer, type SightTarget } from '../src/sim/perception';
import { testWorld, viewOf } from './fixtures';

/**
 * If you can't see through it, you can't shoot through it (the owner's first sitting, Nov 9).
 * A tree's crown dims a line by how much of it the line crosses; past the world's limit the
 * line is stopped there, sight and bullets by the same law.
 */

const STOP = T.gen.props.crownStop;
const D = T.gen.props.crownDensity;

/** A flat test world with these crowns and the generated world's limit. */
function withCrowns(crowns: FoliageVolume[]): World {
  const world = testWorld({ spawnOnTop: true });
  world.crowns = crowns;
  world.crownStop = STOP;
  return world;
}

const cone = (x: number, z: number, y0: number, y1: number, r: number): FoliageVolume => ({ kind: 'cone', x, z, y0, y1, r, density: D });
const cyl = (x: number, z: number, y0: number, y1: number, r: number): FoliageVolume => ({ kind: 'cyl', x, z, y0, y1, r, density: D });

describe('a crown in the way of a line', () => {
  const world = withCrowns([cone(30, 0, 3, 11, 2.5)]);
  const view = viewOf(world);
  const h = world.terrain.heightAt(0, 0);

  it('stops a line through its thick part, at the point the line runs out', () => {
    const hit = raycast(view, 0, h + 6, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit());
    expect(hit.what).toBe('crown');
    // The cone is 1.56 m in radius at this height, and the line gets 1.14 m into it.
    expect(hit.dist).toBeCloseTo(30 - 2.5 * (1 - 3 / 8) + STOP / D, 6);
    expect(hit.surface).toBe(Surface.Wood);
    expect(hit.nx).toBe(-1);
  });

  it('lets a line by through its thin tip, or under it, or over it', () => {
    expect(raycast(view, 0, h + 10.7, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit()).what).not.toBe('crown');
    expect(raycast(view, 0, h + 2, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit()).what).not.toBe('crown');
    expect(raycast(view, 0, h + 12, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit()).what).not.toBe('crown');
  });

  it('stops sight the same as a bullet, and never sound', () => {
    expect(raycast(view, 0, h + 6, 0, 1, 0, 0, 60, Blocks.Sight, emptyHit()).what).toBe('crown');
    expect(raycast(view, 0, h + 6, 0, 1, 0, 0, 60, Blocks.Sound, emptyHit()).what).not.toBe('crown');
  });

  it('ends before anything behind it, and not after anything in front', () => {
    const body = { id: 7, shape: bodyShape(createBody(world, new Solids(world.colliders), T.bodies.player, 40, 0, -1, 0), T.bodies.player, emptyShape()) };
    const y = body.shape.head.y;
    const before = withCrowns([cone(30, 0, h, h + 9, 2.5)]);
    expect(raycast({ world: before, solids: view.solids, bodies: [body] }, 0, y, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit()).what).toBe('crown');
    const beyond = withCrowns([cone(50, 0, h, h + 9, 2.5)]);
    expect(raycast({ world: beyond, solids: view.solids, bodies: [body] }, 0, y, 0, 1, 0, 0, 60, Blocks.Bullet, emptyHit()).what).toBe('body');
  });

  it('does not hold a line against the crown it starts or ends inside', () => {
    // Someone with their head among the branches has parted them: they can see out, a
    // round can leave, and they can be seen. Any other crown still counts.
    const y = h + 6;
    const inside = { x: 30, y, z: 0 };
    const out = { x: 60, y, z: 0 };
    expect(raycast(view, inside.x, inside.y, inside.z, 1, 0, 0, 30, Blocks.Bullet, emptyHit()).what).not.toBe('crown');
    expect(sightLine(view, inside.x, inside.y, inside.z, out.x, out.y, out.z, Blocks.Sight)).toBe(true);
    expect(sightLine(view, out.x, out.y, out.z, inside.x, inside.y, inside.z, Blocks.Sight)).toBe(true);
    const two = withCrowns([cone(30, 0, 3, 11, 2.5), cone(45, 0, 3, 11, 2.5)]);
    expect(raycast(viewOf(two), inside.x, inside.y, inside.z, 1, 0, 0, 30, Blocks.Bullet, emptyHit()).what).toBe('crown');
    expect(sightLine(viewOf(two), inside.x, inside.y, inside.z, out.x, out.y, out.z, Blocks.Sight)).toBe(false);
  });

  it('is the same either way along the line, to the bit', () => {
    const rng = new Rng('crowns', 'lines');
    const crowns = crownsOf(world);
    for (let k = 0; k < 2000; k++) {
      const a = { x: rng.range(10, 50), y: h + rng.range(0, 14), z: rng.range(-6, 6) };
      const b = { x: rng.range(10, 50), y: h + rng.range(0, 14), z: rng.range(-6, 6) };
      expect(crowns.opticalDepth(a.x, a.y, a.z, b.x, b.y, b.z)).toBe(crowns.opticalDepth(b.x, b.y, b.z, a.x, a.y, a.z));
      expect(sightLine(view, a.x, a.y, a.z, b.x, b.y, b.z, Blocks.Bullet)).toBe(sightLine(view, b.x, b.y, b.z, a.x, a.y, a.z, Blocks.Bullet));
      expect(sightLine(view, a.x, a.y, a.z, b.x, b.y, b.z, Blocks.Sight)).toBe(sightLine(view, a.x, a.y, a.z, b.x, b.y, b.z, Blocks.Bullet));
    }
  });
});

describe('a bullet among the trees', () => {
  /** A straight, undragged flight along +x, 26.7 m per tick. */
  const flight = (y: number): Flight => ({ x: 0, y, z: 0, dx: 1, dy: 0, dz: 0, t: 0, v0: 800, k: 0, g: 0, wx: 0, wz: 0 });
  const bullet = (y: number): BulletState => ({ shooter: 0, shot: 0, flight: flight(y), swept: 0 });
  const noBodies = (_t: number, out: QueryView['bodies'] extends readonly (infer B)[] ? B[] : never) => ((out.length = 0), out);
  const dt = 1 / 30;

  it('adds up what it has been through, across the pieces of its flight', () => {
    const r = 0.45; // Each is 0.9 m across: 0.63 of the limit's 0.8, so one alone gets through.
    const world = withCrowns([cyl(13, 0, 0, 40, r), cyl(40, 0, 0, 40, r)]);
    const h = world.terrain.heightAt(0, 0) + 6;
    const view = viewOf(world);
    const b = bullet(h);
    const out = emptyStrike();
    expect(fly(b, 0.2, dt, view, noBodies, out)).not.toBeNull();
    expect(out.surface).toBe(Surface.Wood);
    expect(out.what).toBe('collider');
    expect(out.id).toBe(-1);
    expect(out.x).toBeGreaterThan(40 - r);
    expect(out.x).toBeLessThan(40 + r);
    expect(b.crown).toBeCloseTo(D * 2 * r, 6);
  });

  it('gets through one of them', () => {
    const world = withCrowns([cyl(13, 0, 0, 40, 0.45)]);
    const b = bullet(world.terrain.heightAt(0, 0) + 6);
    expect(fly(b, 0.2, dt, viewOf(world), noBodies, emptyStrike())).toBeNull();
    expect(b.crown).toBeCloseTo(D * 0.9, 6);
  });

  it('is not stopped in a world without a limit', () => {
    const world = withCrowns([cyl(13, 0, 0, 40, 3)]);
    delete world.crownStop;
    const b = bullet(world.terrain.heightAt(0, 0) + 6);
    expect(fly(b, 0.2, dt, viewOf(world), noBodies, emptyStrike())).toBeNull();
  });
});

describe('a guard looking through a crown', () => {
  const world = labWorld(T);
  const solids = new Solids(world.colliders);
  const env = world.spec.env;
  const x = -140;
  const eyeY = world.terrain.heightAt(x, 0) + T.bodies.guard.eyeHeight.stand;
  const eye: Observer = { id: 99, x, y: eyeY, z: 0, yaw: -Math.PI / 2, pitch: 0, far: false, sharp: 1 };
  const b = createBody(world, solids, T.bodies.player, x + 60, 0, -1, 0);
  b.speed = 1.4;
  const target: SightTarget = { id: 1, body: b, spec: T.bodies.player, shape: bodyShape(b, T.bodies.player, emptyShape()) };
  const look = (w: World) => exposure({ world: w, solids, bodies: [{ id: 1, shape: target.shape }] }, env, 0, T, eye, target, emptyExposure());

  it('sees nothing through a thick one', () => {
    expect(look(world).clear).toBe(3);
    const blocked = { ...world, crowns: [cyl(x + 30, 0, 0, 200, 3)], crownStop: STOP };
    const seen = look(blocked);
    expect(seen.clear).toBe(0);
    expect(seen.rate).toBe(0);
  });

  it('sees dimly past a thin one', () => {
    const thin = { ...world, crowns: [cyl(x + 30, 0, 0, 200, 0.3)], crownStop: STOP };
    const seen = look(thin);
    expect(seen.clear).toBe(3);
    expect(seen.cover).toBeLessThan(look(world).cover);
    expect(seen.cover).toBeCloseTo(look(world).cover * Math.exp(-D * 0.6), 2);
  });
});

describe('the trees of a generated camp', () => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(campMission('LEB-2534'), T);
  }, 60_000);

  it('have crowns where they are drawn, inside its flat sides, and a limit', () => {
    const { trees } = world.props;
    expect(world.crowns!.length).toBe(trees.length);
    expect(world.crownStop).toBe(STOP);
    trees.forEach((t, k) => {
      const v = world.crowns![k]!;
      expect([v.kind, v.x, v.z, v.y0, v.y1, v.r]).toEqual(['cone', t.x, t.z, t.y + t.trunkH, t.y + t.trunkH + t.canopyH, t.canopyR * T.gen.props.crownInset]);
    });
  });

  /** From a perch, the first standing man the rock and the wood leave clear but the crowns hide, after a few seconds of the camp's routine. */
  function hiddenMan(sim: Simulation): { from: { x: number; y: number; z: number }; at: { x: number; y: number; z: number }; id: number } | null {
    const view = { world: sim.world, solids: sim.solids, bodies: [] };
    const crowns = crownsOf(sim.world);
    const hit = emptyHit();
    for (const p of sim.world.report.camp!.perches) {
      const from = { x: p.x, y: sim.world.terrain.heightAt(p.x, p.z) + T.bodies.player.eyeHeight.prone, z: p.z };
      for (const g of sim.guards) {
        const at = { x: g.body.x, y: g.body.y + g.body.eyeHeight * 0.75, z: g.body.z };
        if (Math.sqrt(g.body.vx * g.body.vx + g.body.vz * g.body.vz) > 0.1) continue;
        const dx = at.x - from.x;
        const dy = at.y - from.y;
        const dz = at.z - from.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (raycast(view, from.x, from.y, from.z, dx / d, dy / d, dz / d, d, Blocks.Bullet, hit, -1, IGNORE_CROWNS).what !== 'none') continue;
        if (crowns.opticalDepth(from.x, from.y, from.z, at.x, at.y, at.z) >= 2 * STOP) return { from, at, id: g.id };
      }
    }
    return null;
  }

  /** The same shot at the same moment, with and without crowns that stop things. */
  function shoot(w: World): { events: SimEvent[]; id: number; alive: boolean; at: { x: number; y: number; z: number } } {
    const scene = { ...(compound('seed=LEB-2534') as Scene<Simulation>), world: () => w };
    const sim = startScene(scene, T, w);
    for (let i = 0; i < 90; i++) sim.step(neutralInput());
    const shot = hiddenMan({ ...sim, world: world, guards: sim.guards, solids: sim.solids } as unknown as Simulation) ?? (() => { throw new Error('no line hidden only by crowns on this camp'); })();
    const events: SimEvent[] = [];
    events.push(...sim.step({ ...neutralInput(), commands: [stimulus('shot', shot.at, shot.from)] }).map((e) => ({ ...e })));
    for (let i = 0; i < 40; i++) events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
    return { events, id: shot.id, alive: sim.guards.some((g) => g.id === shot.id), at: shot.at };
  }

  it('stop a shot that only the crowns are in the way of, and it kills him without them', () => {
    const through = shoot(world);
    expect(through.alive).toBe(true);
    const impact = through.events.find((e) => e.type === 'impact') as Extract<SimEvent, { type: 'impact' }>;
    expect(impact.what).toBe('collider');
    expect(impact.surface).toBe(Surface.Wood);
    expect(Math.sqrt((impact.x - through.at.x) ** 2 + (impact.z - through.at.z) ** 2)).toBeGreaterThan(5);

    const bare = { ...world };
    delete bare.crownStop;
    expect(shoot(bare).alive).toBe(false);
  }, 60_000);
});
