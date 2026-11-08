import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { createLook } from '../src/render/materials';
import { ShotLayer } from '../src/render/shotLayer';
import { remainsShape } from '../src/sim/game/remains';
import type { Snapshot } from '../src/sim/game/sim';
import type { ImpactEvent } from '../src/sim/kernel/events';
import { emptyShape } from '../src/sim/kernel/world/shape';

/**
 * What a shot leaves for the eye (render/shotLayer.ts), checked without a GPU: the dust a
 * spotter reads shows from the strike's instant and fades; a body is drawn where the
 * simulation's shape for it is, at the frame's instant; a trace ends where the bullet is.
 */

function snapshot(tick: number, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    tick,
    px: 0,
    py: 0,
    pz: 0,
    eye: 1.65,
    eyeX: 0,
    eyeY: 1.65,
    eyeZ: 0,
    lean: 0,
    climb: false,
    yaw: 0,
    pitch: 0,
    speed: 0,
    step: 0,
    stance: 'stand',
    gait: 'idle',
    guardIds: [],
    guardSpawns: [],
    guards: new Float32Array(0),
    solids: [],
    rifle: null,
    remains: [],
    bullets: [],
    thrown: [],
    ...extra,
  };
}

const layer = (): ShotLayer => new ShotLayer(createLook(new THREE.Vector3(0, 1, 0), 0.001), T);
const meshes = (l: ShotLayer): THREE.Mesh[] => l.group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

describe('the shot layer', () => {
  it('raises dust where a shot strikes the ground, from the strike, thinning away', () => {
    const l = layer();
    const strike: ImpactEvent = { type: 'impact', id: 2, tick: 31, t: 31 / 30 - 0.01, source: 1, cause: 1, x: 3, y: 0, z: -300, surface: 1, loudness: 1, radius: 160, what: 'terrain', target: -1, part: 'none', speed: 600, nx: 0, ny: 1, nz: 0 };
    l.addEvents([strike]);
    const puff = meshes(l)[0]!;
    expect(puff.position.toArray()).toEqual([3, 0, -300]);
    // A frame before the strike: not yet.
    l.update(snapshot(29), snapshot(30), 0.5);
    expect(puff.visible).toBe(false);
    // From its instant, growing; then thinning.
    l.update(snapshot(30), snapshot(31), 0.9);
    expect(puff.visible).toBe(true);
    const opacity = (): number => (puff.material as THREE.MeshBasicMaterial).opacity;
    const early = opacity();
    const small = puff.scale.x;
    l.update(snapshot(60), snapshot(61), 0);
    expect(opacity()).toBeLessThan(early);
    expect(puff.scale.x).toBeGreaterThan(small);
    // Gone once its time is up.
    l.update(snapshot(200), snapshot(201), 0);
    expect(meshes(l)).toHaveLength(0);
  });

  it("draws a body where the simulation has its shape, collapsing at the frame's instant", () => {
    const l = layer();
    const r = { id: 9, of: 4, post: 2, x: 10, y: 1, z: -50, yaw: 0.3, eye: 1.71, vx: 1.35, vz: 0, fell: 1, part: 'head' as const };
    const prev = snapshot(35, { remains: [r] });
    const curr = snapshot(36, { remains: [r] });
    l.update(prev, curr, 0.5);
    const t = 35.5 / 30;
    const want = remainsShape(r, t, T, emptyShape());
    const body = l.group.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const head = body.children[0] as THREE.Mesh;
    expect(head.position.x).toBeCloseTo(want.head.x, 9);
    expect(head.position.y).toBeCloseTo(want.head.y, 9);
    expect(head.position.z).toBeCloseTo(want.head.z, 9);
    // On the ground once the collapse is over.
    l.update(snapshot(90, { remains: [r] }), snapshot(91, { remains: [r] }), 0);
    expect(head.position.y).toBeCloseTo(remainsShape(r, 90 / 30, T, emptyShape()).head.y, 9);
    expect(head.position.y).toBeLessThan(r.y + 0.5);
  });

  it("draws each bullet's trace ending where the bullet is at the frame's instant", () => {
    const l = layer();
    const flight = { x: 0, y: 2, z: 0, dx: 0, dy: 0, dz: -1, t: 1, v0: 823, k: 0.000756, g: 9.81, wx: 0, wz: 0 };
    l.update(snapshot(35, { bullets: [{ id: 5, flight }] }), snapshot(36, { bullets: [{ id: 5, flight }] }), 0.5);
    const lines = l.group.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = lines.geometry.drawRange.count;
    expect(count).toBeGreaterThan(0);
    // The last point drawn: the bullet at 35.5 ticks, about 0.18 s after it left, some 145 m out.
    const z = pos.getZ(count - 1);
    expect(z).toBeLessThan(-140);
    expect(z).toBeGreaterThan(-150);
  });
});
