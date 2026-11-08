import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { bodyShape, createBody, type BodyState, type Stance } from '../src/sim/body';
import { Rng } from '../src/sim/kernel/core/rng';
import { Solids } from '../src/sim/kernel/world/solids';
import type { QueryView } from '../src/sim/kernel/world/query';
import { emptyShape } from '../src/sim/kernel/world/shape';
import {
  Foliage,
  emptyExposure,
  exposure,
  fillSeconds,
  groundLight,
  rangeRamp,
  telegraphCap,
  type Exposure,
  type FoliageVolume,
  type Observer,
  type SightTarget,
} from '../src/sim/perception';
import { LAB, labWorld } from '../src/sim/game/scenes/perceptionLab';

/**
 * Sight (A2): the design doc's ranges as the owner read them on Nov 7. Stance and light are
 * range caps; periphery is a short-range zone; time grows linearly with distance inside a
 * zone; every edge ramps; the first cue comes at least 1.5 s before 100% outside contact.
 * Measured in the perception lab's open field, east of the camp, where the ground is flat
 * and the lab's low hills close every line that would leave it.
 */

const world = labWorld(T);
const solids = new Solids(world.colliders);
const env = world.spec.env;
const S = T.perception.sight;

/** An eye at standing height in the field, looking east. */
function eyeAt(x: number, z: number, opts: Partial<Observer> = {}): Observer {
  return { id: 99, x, y: world.terrain.heightAt(x, z) + T.bodies.guard.eyeHeight.stand, z, yaw: -Math.PI / 2, pitch: 0, far: false, sharp: 1, ...opts };
}

/** A player body at (x, z) in a stance, moving at `speed`. */
function body(x: number, z: number, stance: Stance = 'stand', speed = 1.4): BodyState {
  const spec = T.bodies.player;
  const b = createBody(world, solids, spec, x, z, -1, 0);
  b.stance = stance;
  b.eyeHeight = spec.eyeHeight[stance];
  b.speed = speed;
  return b;
}

function target(b: BodyState): SightTarget {
  return { id: 1, body: b, spec: T.bodies.player, shape: bodyShape(b, T.bodies.player, emptyShape()) };
}

function viewWith(t: SightTarget, more: QueryView['bodies'] = []): QueryView {
  return { world, solids, bodies: [{ id: t.id, shape: t.shape }, ...more] };
}

function look(eye: Observer, b: BodyState): Exposure {
  const t = target(b);
  return exposure(viewWith(t), env, 0, T, eye, t, emptyExposure());
}

const E = eyeAt(-140, 0);

describe('sight: the design doc ranges', () => {
  it('sees a standing, walking body in the open out to 150 m, the edge ramping over 12 m', () => {
    const at = (d: number): Exposure => look(E, body(-140 + d, 0));
    const x = at(100);
    expect(x.zone).toBe('core');
    expect(x.light).toBe(T.visibility.light.lit);
    expect(x.cover).toBeCloseTo(1, 12);
    expect(x.skyline).toBe(1);
    expect(x.range).toBe(150);
    expect(x.rate).toBeCloseTo(1 / fillSeconds(x.distance, 150, S), 12);
    // The edge: full rate to 144 m, half at 150 m, none past 156 m.
    expect(at(143).edge).toBe(1);
    expect(at(150).edge).toBeCloseTo(0.5, 1);
    expect(at(157).rate).toBe(0);
    expect(rangeRamp(156.01, 150, S)).toBe(0);
  });

  it('never sees a still, prone body beyond 50 m, in cover or not', () => {
    for (const d of [48, 60, 90, 140]) expect(look(E, body(-140 + d, 0, 'prone', 0)).rate, `${d} m`).toBe(0);
    // Inside its range it is seen, slowly: 45 m is the prone cap.
    const near = look(E, body(-140 + 30, 0, 'prone', 0));
    expect(near.range).toBeCloseTo(45, 9);
    expect(near.rate).toBeGreaterThan(0);
  });

  it('spots a crouched body walking in shade at 30 m in 3 to 6 s', () => {
    // The tall wall's shadow: in the lab it falls on the ground north-east of the wall.
    let found: { x: number; z: number } | null = null;
    for (let dz = 0.5; dz < 8 && !found; dz += 0.5) {
      for (let dx = -5; dx <= 5 && !found; dx += 1) {
        const x = LAB.tallWall.x + dx;
        const z = LAB.tallWall.z - dz;
        if (groundLight(world, solids, env, 0, x, world.terrain.heightAt(x, z), z, T) === T.visibility.light.shade) found = { x, z };
      }
    }
    expect(found, 'shade by the tall wall').not.toBeNull();
    const b = body(found!.x, found!.z, 'crouch', 1.8);
    // An eye 30 m away to the west, looking at it.
    const eye = eyeAt(found!.x - 30, found!.z);
    const x = look(eye, b);
    expect(x.light).toBe(T.visibility.light.shade);
    expect(x.range).toBeCloseTo(150 * 0.6 * 0.6, 9);
    const seconds = 1 / x.rate;
    expect(seconds).toBeGreaterThanOrEqual(3);
    expect(seconds).toBeLessThanOrEqual(6);
  });

  it("gives a marksman's narrow far zone 400 m", () => {
    const eye = eyeAt(-180, 0, { far: true });
    const at = (d: number): Exposure => look(eye, body(-180 + d, 0));
    expect(at(380).zone).toBe('far');
    expect(at(380).rate).toBeGreaterThan(0);
    expect(at(415).rate).toBe(0);
    // Without the far zone, nothing past the core's 150 m.
    expect(look(eyeAt(-180, 0), body(-180 + 300, 0)).rate).toBe(0);
  });

  it('keeps peripheral vision short: 25 m standing, off the core cone', () => {
    const off = (deg: number, d: number): Exposure => {
      const a = (deg * Math.PI) / 180;
      return look(E, body(-140 + Math.cos(a) * d, -Math.sin(a) * d));
    };
    expect(off(45, 20).zone).toBe('peripheral');
    expect(off(45, 20).rate).toBeGreaterThan(0);
    expect(off(45, 40).rate).toBe(0);
    // And the core cone's edge ramps over 4°: about half the rate at 30° (the chest sits a
    // little below the eye, so a touch more than 30° off the gaze), none past 32°.
    expect(off(30, 20).cone).toBeCloseTo(0.5, 1);
    expect(off(70, 10).rate).toBe(0);
  });
});

describe('sight: telegraphed, and touch', () => {
  it('never fills faster than lets the first cue come 1.5 s before 100%, outside contact', () => {
    const cap = telegraphCap(S);
    expect((1 - S.cue) / cap).toBeCloseTo(S.minCueSeconds, 12);
    const x = look({ ...E, sharp: 2 }, body(-140 + 5, 0, 'stand', 5.5));
    expect(x.capped).toBe(true);
    expect(x.rate).toBe(cap);
  });

  it('notices a body close enough to touch from any direction', () => {
    const behind = look(E, body(-142, 0));
    expect(behind.zone).toBe('contact');
    expect(behind.rate).toBeGreaterThan(telegraphCap(S));
    expect(look(E, body(-144, 0)).rate).toBe(0);
  });
});

describe('sight: cover, foliage and the sky', () => {
  it('counts the share of the body in view: sandbags at the feet hide a third', () => {
    // The sentry's sandbags, 0.95 m high, just in front of a body seen from 13 m away.
    const b = body(LAB.sentry.x + 2.8, 0);
    const eye = eyeAt(LAB.sentry.x - 10, 0);
    const x = look(eye, b);
    expect(x.rays[2].clear).toBe(false);
    expect(x.rays[0].clear && x.rays[1].clear).toBe(true);
    expect(x.cover).toBeCloseTo(S.parts.head + S.parts.chest, 12);
  });

  it('dims sight through a bush by the line through it, the same both ways', () => {
    // The bush by the low wall, at (−112, −9), radius 1.3.
    const inside = body(-112, -9, 'prone', 0);
    const eye = eyeAt(-112 - 20, -9);
    const x = look(eye, inside);
    expect(x.rays[1].clear).toBe(true);
    expect(x.rays[1].through).toBeLessThan(0.5);
    expect(x.cover).toBeLessThan(0.5);
  });

  it('is symmetric to the bit: what the foliage lets through from a to b equals b to a', () => {
    const f = world.foliage!;
    const rng = new Rng('SIGHT-0001', 'pairs');
    let crossed = 0;
    for (let k = 0; k < 4000; k++) {
      const v = f.volumes[rng.int(0, f.volumes.length - 1)]!;
      // From anywhere around a volume to a point inside it (a cone's inside narrows toward its apex).
      const a = [v.x + rng.range(-25, 25), rng.range(0, 12), v.z + rng.range(-25, 25)] as const;
      const h = rng.range(0, 0.5);
      const u = rng.unit2();
      const r = v.r * (v.kind === 'cone' ? 1 - h : 1) * rng.range(0, 0.9);
      const b = [v.x + u.x * r, v.y0 + (v.y1 - v.y0) * h, v.z + u.z * r] as const;
      const ab = f.transmittance(a[0], a[1], a[2], b[0], b[1], b[2]);
      const ba = f.transmittance(b[0], b[1], b[2], a[0], a[1], a[2]);
      expect(Object.is(ab, ba)).toBe(true);
      if (ab < 1) crossed++;
    }
    expect(crossed).toBeGreaterThan(3900);
  });

  it('measures chords exactly: through a cylinder and a cone', () => {
    const v: FoliageVolume[] = [
      { kind: 'cyl', x: 0, z: 0, y0: 0, y1: 2, r: 1, density: 1 },
      { kind: 'cone', x: 10, z: 0, y0: 0, y1: 4, r: 2, density: 1 },
    ];
    const f = new Foliage(v);
    // Straight through the cylinder's middle: 2 m.
    expect(f.opticalDepth(-5, 1, 0, 5, 1, 0)).toBeCloseTo(2, 12);
    // Through the cone at half its height, where its radius is 1: 2 m.
    expect(f.opticalDepth(5, 2, 0, 15, 2, 0)).toBeCloseTo(2, 12);
    // Up the cone's axis from below its base to above its apex: its height.
    expect(f.opticalDepth(10, -1, 0, 10, 6, 0)).toBeCloseTo(4, 12);
    // Over the top of everything.
    expect(f.opticalDepth(-5, 5, 0, 15, 5, 0)).toBe(0);
  });

  it('sees a body on the ridge against the sky farther than the same body below it', () => {
    const R = LAB.ridge;
    const x0 = -135; // west of the tall wall, clear of the bush on the crest
    const crest = body(x0, R.z, 'prone', 0);
    const eye = eyeAt(x0, R.z + 60);
    eye.yaw = 0; // north
    const x = look(eye, crest);
    expect(x.rays[0].sky).toBeGreaterThan(0.9);
    expect(x.skyline).toBeGreaterThan(1.2);
    // 60 m is beyond the prone cap of 45 m and its edge, for a body not against the sky.
    expect(rangeRamp(x.distance, x.range, S)).toBe(0);
    expect(x.rate).toBeGreaterThan(0);
  });
});
