import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import { generateWorld } from '../src/sim/generation/world';
import type { World } from '../src/sim/kernel/world/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import type { BodyState } from '../src/sim/body/body';
import { bodyShape } from '../src/sim/body/shape';
import { emptyShape, rayCapsule, raySphere, type Capsule, type Sphere } from '../src/sim/kernel/world/shape';
import { Simulation } from '../src/sim/game/sim';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { emptyHit, raycast, sightLine, type QueryBody } from '../src/sim/kernel/world/query';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld, viewOf } from './fixtures';

const n = { x: 0, y: 0, z: 0 };

function insideSphere(s: Sphere, x: number, y: number, z: number): boolean {
  return (x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2 <= s.r * s.r;
}

function insideCapsule(c: Capsule, x: number, y: number, z: number): boolean {
  const ax = c.bx - c.ax;
  const ay = c.by - c.ay;
  const az = c.bz - c.az;
  const len2 = ax * ax + ay * ay + az * az;
  const s = Math.max(0, Math.min(1, ((x - c.ax) * ax + (y - c.ay) * ay + (z - c.az) * az) / len2));
  return (x - c.ax - ax * s) ** 2 + (y - c.ay - ay * s) ** 2 + (z - c.az - az * s) ** 2 <= c.r * c.r;
}

/** The first point of a ray inside a shape, by marching in 1 mm steps. */
function march(inside: (x: number, y: number, z: number) => boolean, o: number[], d: number[], max: number): number {
  for (let t = 0; t <= max; t += 0.001) if (inside(o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t)) return t;
  return -1;
}

describe('ray tests against body parts', () => {
  it('agree with marching along the ray, to the millimetre', () => {
    const rng = new Rng('QUERY-0001', 'rays');
    const sphere: Sphere = { x: 0.3, y: 1.2, z: -0.4, r: 0.2 };
    const capsule: Capsule = { ax: -0.2, ay: 0.4, az: 0.1, bx: 0.1, by: 1.3, bz: -0.2, r: 0.18 };
    let hits = 0;
    for (let k = 0; k < 300; k++) {
      const u = rng.unit2();
      const o = [u.x * 3, rng.range(0, 2.5), u.z * 3];
      const target = [rng.range(-0.4, 0.5), rng.range(0.2, 1.6), rng.range(-0.6, 0.4)];
      const d = target.map((v, i) => v - o[i]!);
      const l = Math.hypot(d[0]!, d[1]!, d[2]!);
      const dir = d.map((v) => v / l);
      const ts = raySphere(sphere, o[0]!, o[1]!, o[2]!, dir[0]!, dir[1]!, dir[2]!, n);
      const ms = march((x, y, z) => insideSphere(sphere, x, y, z), o, dir, 6);
      expect(ts < 0, `sphere ${k}`).toBe(ms < 0);
      if (ts >= 0) expect(Math.abs(ts - ms)).toBeLessThan(0.0011);
      const tc = rayCapsule(capsule, o[0]!, o[1]!, o[2]!, dir[0]!, dir[1]!, dir[2]!, n);
      const mc = march((x, y, z) => insideCapsule(capsule, x, y, z), o, dir, 6);
      expect(tc < 0, `capsule ${k}`).toBe(mc < 0);
      if (tc >= 0) {
        expect(Math.abs(tc - mc)).toBeLessThan(0.0011);
        // The normal points back against the ray.
        expect(n.x * dir[0]! + n.y * dir[1]! + n.z * dir[2]!).toBeLessThan(0);
        hits++;
      }
    }
    expect(hits).toBeGreaterThan(50);
  });
});

describe('body shapes', () => {
  const spec = T.bodies.guard;

  it('come from body kinds that all have the same fields', () => {
    const shape = (o: unknown): unknown => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o);
    for (const [kind, s] of Object.entries(T.bodies)) expect(shape(s), kind).toEqual(shape(T.bodies.player));
  });
  const body = (stance: 'stand' | 'crouch' | 'prone', eye: number): BodyState => ({ x: 0, y: 0, z: 0, yaw: 0, stance, eyeHeight: eye }) as BodyState;

  it('put the head at the eye and the parts in order, standing and crouched', () => {
    for (const [stance, eye] of [
      ['stand', spec.eyeHeight.stand],
      ['crouch', spec.eyeHeight.crouch],
    ] as const) {
      const s = bodyShape(body(stance, eye), spec, emptyShape());
      expect(s.head.y).toBeCloseTo(eye, 9);
      expect(s.legs.ay).toBeLessThan(s.legs.by);
      expect(s.legs.by).toBeCloseTo(s.torso.ay, 9);
      expect(s.torso.by).toBeLessThan(s.head.y);
      expect(s.head.y + s.head.r).toBeLessThanOrEqual(spec.height[stance] + 1e-9);
    }
  });

  it('lie along the facing when prone, head first', () => {
    const s = bodyShape(body('prone', spec.eyeHeight.prone), spec, emptyShape());
    // Yaw 0 faces north (−z): the head is the furthest part north, the heels the furthest south.
    expect(s.head.z).toBeLessThan(s.torso.az);
    expect(s.legs.az).toBeGreaterThan(s.torso.az);
    expect(Math.max(s.head.y + s.head.r, s.torso.ay + s.torso.r, s.torso.by + s.torso.r, s.legs.ay + s.legs.r)).toBeLessThanOrEqual(spec.height.prone);
    expect(s.head.z - s.head.r - (s.legs.az + s.legs.r)).toBeCloseTo(-spec.parts.proneLength, 6);
  });
});

describe('the world query', () => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(missionSpec('TAL-4471'), T);
  });

  it('names the part of a guard a ray hits', () => {
    const sim = new Simulation(world, T);
    sim.step(neutralInput());
    const bodies = sim.queryBodies();
    const hit = emptyHit();
    // A guard on the ground with nothing else on the ray's way to him.
    const g = sim.guards.find(
      (e) => !world.camp.guards[e.guard.spawn]!.elevated && [0.4, 1, 1.6].every((y) => raycast({ world, solids: sim.solids, bodies }, e.body.x + 20, e.body.y + y, e.body.z, -1, 0, 0, 20.4, Blocks.Bullet, hit, e.id).what === 'none'),
    )!;
    const from = (y: number) => raycast({ world, solids: sim.solids, bodies }, g.body.x + 20, g.body.y + y, g.body.z, -1, 0, 0, 50, Blocks.Bullet, hit);
    const s = bodies.find((b) => b.id === g.id)!.shape;
    expect(from(s.head.y - g.body.y)).toMatchObject({ what: 'body', id: g.id, part: 'head' });
    expect(from((s.torso.ay + s.torso.by) / 2 - g.body.y)).toMatchObject({ what: 'body', id: g.id, part: 'torso' });
    expect(from(0.4)).toMatchObject({ what: 'body', id: g.id, part: 'legs' });
    // Sound goes through bodies; so does a ray that ignores this one.
    expect(raycast({ world, solids: sim.solids, bodies }, g.body.x + 20, g.body.y + 1, g.body.z, -1, 0, 0, 25, Blocks.Sound, hit).what).not.toBe('body');
    expect(raycast({ world, solids: sim.solids, bodies }, g.body.x + 20, g.body.y + 1, g.body.z, -1, 0, 0, 25, Blocks.Bullet, hit, g.id).id).not.toBe(g.id);
    // A body beyond the ray's reach isn't hit, any more than the terrain or a collider would be.
    expect(from(s.head.y - g.body.y).dist).toBeLessThan(20);
    const short = raycast({ world, solids: sim.solids, bodies }, g.body.x + 20, s.head.y, g.body.z, -1, 0, 0, 5, Blocks.Bullet, hit);
    expect(short.what).toBe('none');
  });

  it('gives the point, an outward normal and the surface of the terrain and of colliders', () => {
    const w = testWorld({
      surface: Surface.Dirt,
      colliders: [{ kind: 'box', x: 10, z: 0, y0: -1, y1: 3, hx: 1, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal }],
    });
    const hit = emptyHit();
    expect(raycast(viewOf(w), 0, 1, 0, 1, 0, 0, 50, Blocks.Bullet, hit)).toMatchObject({ what: 'collider', surface: Surface.Metal, nx: -1, ny: 0, nz: 0 });
    expect(hit.x).toBeCloseTo(9, 9);
    expect(raycast(viewOf(w), 0, 5, 0, 0.6, -0.8, 0, 50, Blocks.Bullet, hit)).toMatchObject({ what: 'terrain', surface: Surface.Dirt });
    expect(hit.ny).toBeCloseTo(1, 9);
    expect(raycast(viewOf(w), 10, 10, 0, 0, -1, 0, 50, Blocks.Bullet, hit)).toMatchObject({ what: 'collider', ny: 1 });
  });

  it('lets sound through a chain-link fence but not a wall', () => {
    const fence = { kind: 'box' as const, x: 5, z: 0, y0: 0, y1: 2, hx: 0.05, hz: 5, ux: 1, uz: 0, flags: Blocks.Move, surface: Surface.Metal };
    const wall = { ...fence, x: 15, flags: Blocks.All, surface: Surface.Wood };
    const w = testWorld({ colliders: [fence, wall] });
    const hit = emptyHit();
    expect(raycast(viewOf(w), 0, 1, 0, 1, 0, 0, 50, Blocks.Sound, hit).x).toBeCloseTo(14.95, 6);
    expect(raycast(viewOf(w), 0, 1, 0, 1, 0, 0, 50, Blocks.Move, hit).x).toBeCloseTo(4.95, 6);
  });

  it('is symmetric: if A sees B, B sees A', () => {
    const sim = new Simulation(world, T);
    sim.step(neutralInput());
    const bodies: QueryBody[] = [];
    const rng = new Rng('QUERY-0002', 'pairs');
    let clear = 0;
    let blocked = 0;
    for (let k = 0; k < 400; k++) {
      const p = (): [number, number, number] => {
        const x = rng.range(-90, 90);
        const z = rng.range(-90, 90);
        return [x, world.terrain.heightAt(x, z) + rng.range(0.3, 4), z];
      };
      const [ax, ay, az] = p();
      const [bx, by, bz] = p();
      const ab = sightLine(viewOf(world, bodies), ax, ay, az, bx, by, bz, Blocks.Sight);
      const ba = sightLine(viewOf(world, bodies), bx, by, bz, ax, ay, az, Blocks.Sight);
      expect(ab, `pair ${k}`).toBe(ba);
      if (ab) clear++;
      else blocked++;
    }
    expect(clear).toBeGreaterThan(20);
    expect(blocked).toBeGreaterThan(20);
  });
});
