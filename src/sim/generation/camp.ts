import type { GenTuning } from '../../config/tuning';
import { buildRoutine, type Routine } from './routine';
import type { Rng } from '../kernel/core/rng';
import { Blocks, type ColliderSet } from '../kernel/world/colliders';
import type { Heightfield } from '../kernel/world/heightfield';
import { Surface } from '../kernel/world/surfaces';
import type { Point2 } from './paths';
import type { Site } from './site';
import type { TerrainFeatures } from './terrain';

/**
 * Phase 0's static test camp: a hand-authored layout placed on the pad, its gate facing
 * the road, mirrored at random so seeds differ a little. Phase 1 (lab D) replaces it
 * with the procedural camp generator.
 *
 * Layout coordinates are (a, b) in the site's frame (site.ts): a runs from the site's
 * centre toward the gate, b across the camp.
 */

export type StructureKind =
  | 'fence'
  | 'post'
  | 'tower'
  | 'building'
  | 'container'
  | 'sandbags'
  | 'crate'
  | 'generator'
  | 'pole'
  | 'mast'
  | 'vehicle'
  /** A piece of hand-built geometry (handmade.ts): stairs, a ceiling, a wall in a scene. */
  | 'block'
  /** Generated camps (compound.ts): a tower's ladder, the generator's shed, a light pole, an alarm box. */
  | 'ladder'
  | 'shed'
  | 'light'
  | 'alarm';

export interface Structure {
  kind: StructureKind;
  colliders: number[];
}

/**
 * The jobs a guard can have (design doc, Roles). Each is something the player can remove
 * from the camp, with its own consequence: a sentry's sector, a patrol's partner, a
 * marksman's long-range eyes, a radio operator's check-ins, an officer's searches, a
 * worker's chores, the target the mission is for. The test camp uses three.
 */
export const GUARD_ROLES = ['sentry', 'patrol', 'marksman', 'radio-operator', 'officer', 'worker', 'target'] as const;

export type GuardRole = (typeof GUARD_ROLES)[number];

export interface GuardSpawn {
  id: number;
  role: GuardRole;
  x: number;
  y: number;
  z: number;
  /** Initial facing as a unit vector. */
  faceX: number;
  faceZ: number;
  /** Raised posts (towers) keep a fixed height instead of following the ground. */
  elevated: boolean;
  route: Point2[] | null;
  routeStart: number;
  /** Phase offset for head scanning, so sentries don't sweep in lockstep. */
  scanPhase: number;
  scanScale: number;
  /** What he does all mission, as a pure function of time (routine.ts). */
  routine: Routine;
}

export interface Camp {
  /** Where it stands: its centre, its gate's direction, its pad. */
  site: Site;
  structures: Structure[];
  guards: GuardSpawn[];
  /** Fence half-size. */
  fenceHalf: number;
}

/**
 * `routines` draws each guard's waits from its own fork, after the camp is laid out, so
 * the layout's draws are the same as before routines existed.
 */
export function buildTestCamp(rng: Rng, hf: Heightfield, features: TerrainFeatures, colliders: ColliderSet, gen: GenTuning, routines: Rng): Camp {
  const site = features.site;
  const padH = site.height;
  const u = { x: site.ux, z: site.uz };
  const mirror = rng.chance(0.5) ? -1 : 1;
  const v = { x: -u.z * mirror, z: u.x * mirror };
  // Directions in the camp's frame, and points: the site's centre plus a direction's worth.
  const along = (a: number, b: number): Point2 => ({ x: u.x * a + v.x * b, z: u.z * a + v.z * b });
  const at = (a: number, b: number): Point2 => {
    const d = along(a, b);
    return { x: site.x + d.x, z: site.z + d.z };
  };
  const jitter = () => rng.range(-1.2, 1.2);

  const structures: Structure[] = [];
  const add = (kind: StructureKind, ids: number[]) => structures.push({ kind, colliders: ids });

  /** A box aligned with the camp axes. Its base follows the ground unless y0 is given. */
  const box = (a: number, b: number, lenA: number, lenB: number, h: number, flags: number, surface: Surface, y0?: number): number => {
    const p = at(a, b);
    const base = y0 ?? Math.min(hf.heightAt(p.x, p.z), padH) - 0.25;
    return colliders.add({
      kind: 'box',
      x: p.x,
      z: p.z,
      y0: base,
      y1: (y0 ?? padH) + h,
      hx: lenA / 2,
      hz: lenB / 2,
      ux: u.x,
      uz: u.z,
      flags,
      surface,
    });
  };
  const cyl = (a: number, b: number, r: number, h: number, flags: number, surface: Surface): number => {
    const p = at(a, b);
    return colliders.add({ kind: 'cyl', x: p.x, z: p.z, y0: padH - 0.3, y1: padH + h, r, flags, surface });
  };

  // --- Perimeter fence: chain link blocks movement, not sight or bullets. ------------
  const F = 52;
  const fenceH = 2.2;
  const fenceRun = (a0: number, b0: number, a1: number, b1: number) => {
    const len = Math.abs(a1 - a0) + Math.abs(b1 - b0);
    const pieces = Math.max(1, Math.ceil(len / 8));
    const ids: number[] = [];
    for (let k = 0; k < pieces; k++) {
      const t0 = k / pieces;
      const t1 = (k + 1) / pieces;
      const ca = a0 + (a1 - a0) * (t0 + t1) * 0.5;
      const cb = b0 + (b1 - b0) * (t0 + t1) * 0.5;
      const along = (len / pieces) * 1.0;
      const alongA = Math.abs(a1 - a0) > 0;
      ids.push(box(ca, cb, alongA ? along : 0.2, alongA ? 0.2 : along, fenceH, Blocks.Move, Surface.Metal));
    }
    add('fence', ids);
    const posts: number[] = [];
    for (let k = 0; k <= pieces; k++) {
      const t = k / pieces;
      posts.push(box(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, 0.16, 0.16, fenceH + 0.25, Blocks.Move | Blocks.Bullet, Surface.Metal));
    }
    add('post', posts);
  };
  const gate = 5;
  fenceRun(F, -F, F, -gate); // front, left of the gate
  fenceRun(F, gate, F, F); // front, right of the gate
  fenceRun(-F, -F, -F, 18.5); // back, with a 3 m hole
  fenceRun(-F, 21.5, -F, F);
  fenceRun(-F, -F, -20, -F); // left side, with a 4 m breach
  fenceRun(-16, -F, F, -F);
  fenceRun(-F, F, F, F); // right side

  // --- Watchtowers: legs, platform, waist-high walls, roof. --------------------------
  const tower = (a: number, b: number) => {
    const ids: number[] = [];
    const deckY = padH + 6;
    for (const [da, db] of [
      [-1.25, -1.25],
      [1.25, -1.25],
      [-1.25, 1.25],
      [1.25, 1.25],
    ] as const) {
      ids.push(box(a + da, b + db, 0.25, 0.25, 6, Blocks.All, Surface.Wood));
    }
    ids.push(box(a, b, 3, 3, 0.25, Blocks.All, Surface.Wood, deckY));
    const wallY = deckY + 0.25;
    ids.push(box(a + 1.45, b, 0.1, 3, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(a - 1.45, b, 0.1, 3, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(a, b + 1.45, 3, 0.1, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(a, b - 1.45, 3, 0.1, 0.9, Blocks.All, Surface.Wood, wallY));
    for (const [da, db] of [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 1.4],
      [1.4, 1.4],
    ] as const) {
      ids.push(box(a + da, b + db, 0.12, 0.12, 1.5, Blocks.Move | Blocks.Bullet, Surface.Wood, wallY + 0.9));
    }
    ids.push(box(a, b, 3.6, 3.6, 0.15, Blocks.All, Surface.Metal, wallY + 2.4));
    add('tower', ids);
    return deckY + 0.25;
  };
  const towerA = { a: -44 + jitter(), b: -44 + jitter() };
  const towerB = { a: 42 + jitter(), b: 44 + jitter() };
  const deckA = tower(towerA.a, towerA.b);
  const deckB = tower(towerB.a, towerB.b);

  // --- Buildings and cover. ----------------------------------------------------------
  const s = () => rng.range(0.92, 1.08);
  add('building', [box(-22 + jitter(), 22 + jitter(), 10 * s(), 22 * s(), 3.6, Blocks.All, Surface.Wood)]); // barracks
  add('building', [box(8 + jitter(), -26 + jitter(), 12 * s(), 10 * s(), 3.4, Blocks.All, Surface.Wood)]); // office
  add('building', [box(-28 + jitter(), -20 + jitter(), 14 * s(), 10 * s(), 4.6, Blocks.All, Surface.Metal)]); // storage
  add('building', [box(14 + jitter(), 24 + jitter(), 9 * s(), 15 * s(), 3.2, Blocks.All, Surface.Wood)]); // mess

  const cH = 2.59;
  add('container', [box(30, -4, 2.44, 6.06, cH, Blocks.All, Surface.Metal)]);
  add('container', [box(33, -4, 2.44, 6.06, cH, Blocks.All, Surface.Metal)]);
  add('container', [box(30, -4, 2.44, 6.06, cH, Blocks.All, Surface.Metal, padH + cH)]);
  add('container', [box(-32 + jitter(), 4, 6.06, 2.44, cH, Blocks.All, Surface.Metal)]);

  add('sandbags', [box(46, -8.5, 0.8, 4, 0.95, Blocks.All, Surface.Dirt), box(46, 8.5, 0.8, 4, 0.95, Blocks.All, Surface.Dirt)]);
  add('sandbags', [
    box(towerA.a + 5, towerA.b + 2, 0.8, 5, 0.95, Blocks.All, Surface.Dirt),
    box(towerA.a + 2.6, towerA.b + 4.6, 5, 0.8, 0.95, Blocks.All, Surface.Dirt),
  ]);

  add('crate', [box(-10, 4, 1.2, 1.2, 1.2, Blocks.All, Surface.Wood)]);
  add('crate', [box(-11.5, 4.3, 1.2, 1.2, 1.2, Blocks.All, Surface.Wood)]);
  add('crate', [box(-10, 4, 1.2, 1.2, 1.2, Blocks.All, Surface.Wood, padH + 1.2)]);
  add('crate', [box(22, 6, 1.2, 1.2, 1.2, Blocks.All, Surface.Wood)]);

  add('generator', [box(-2, -10, 2.2, 1.2, 1.5, Blocks.All, Surface.Metal)]);
  add('pole', [cyl(36, -36, 0.12, 7, Blocks.Move | Blocks.Bullet, Surface.Metal)]);
  add('pole', [cyl(-36, 36, 0.12, 7, Blocks.Move | Blocks.Bullet, Surface.Metal)]);
  add('mast', [cyl(16, -34, 0.2, 14, Blocks.Move | Blocks.Bullet, Surface.Metal)]);
  add('vehicle', [box(34, -24, 6.5, 2.5, 2.9, Blocks.All, Surface.Metal)]);

  // --- Guards: Phase 0 dummies with fixed posts and simple routes. -------------------
  const guards: GuardSpawn[] = [];
  const face = (fa: number, fb: number) => {
    const p = along(fa, fb);
    const l = Math.sqrt(p.x * p.x + p.z * p.z);
    return { x: p.x / l, z: p.z / l };
  };
  const ground = (a: number, b: number) => {
    const p = at(a, b);
    return hf.heightAt(p.x, p.z);
  };
  const guard = (role: GuardRole, a: number, b: number, fa: number, fb: number, opts: Partial<GuardSpawn> = {}) => {
    const p = at(a, b);
    const f = face(fa, fb);
    const spawn: Omit<GuardSpawn, 'routine'> = {
      id: pending.length,
      role,
      x: p.x,
      y: opts.elevated ? opts.y! : ground(a, b),
      z: p.z,
      faceX: f.x,
      faceZ: f.z,
      elevated: opts.elevated ?? false,
      route: opts.route ?? null,
      routeStart: opts.routeStart ?? 0,
      scanPhase: rng.range(0, 1),
      scanScale: opts.scanScale ?? 1,
    };
    pending.push(spawn);
  };
  const pending: Array<Omit<GuardSpawn, 'routine'>> = [];
  guard('sentry', towerA.a, towerA.b, -1, -1, { elevated: true, y: deckA });
  guard('sentry', towerB.a, towerB.b, 1, 1, { elevated: true, y: deckB });
  guard('sentry', 48, 3, 1, 0);
  const loop = [at(40, 36.5), at(-40, 36.5), at(-40, -36.5), at(40, -36.5)];
  guard('patrol', 40, 36.5, -1, 0, { route: loop, routeStart: 1 });
  guard('patrol', -40, -36.5, 1, 0, { route: loop, routeStart: 3 });
  guard('patrol', 2, 0, 0, 1, { route: [at(2, 0), at(-8, 14), at(24, 12), at(24, -12), at(6, -16)], routeStart: 1 });
  guard('worker', 0.6, -10, -1, 0, { scanScale: 0.35 });

  for (const p of pending) {
    const spawn = { ...p, routine: null as unknown as Routine };
    spawn.routine = buildRoutine(spawn, gen.routines, routines.fork(`guard${p.id}`));
    guards.push(spawn);
  }
  return { site, structures, guards, fenceHalf: F };
}
