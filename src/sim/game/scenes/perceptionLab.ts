import type { Tuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, type Camp, type GuardRole, type GuardSpawn, type Routine, type Structure, type StructureKind } from '../../generation';
import { Rng } from '../../kernel/core/rng';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface } from '../../kernel/world/surfaces';
import type { World } from '../../kernel/world/world';
import type { FoliageVolume } from '../../perception';
import { WaypointDriver, type Waypoint } from '../bots/waypoints';
import { PERCEPTION, giveSenses } from '../perception';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * The perception lab (lab A): an isolated camp in a long field, where every factor of
 * sight and hearing has a place to be tried.
 *
 * - **Guards:** a sentry at the camp's east edge sweeping the field; a patrol walking the
 *   camp's perimeter; a marksman on a tower whose narrow far zone sweeps the field to 400 m.
 * - **Sight:** the open field east of the camp runs 260 m to a rise; low walls, a
 *   chest-high wall and crates give cover at 30, 60 and 90 m; a shelter, a tall wall and a
 *   conifer cast shade; bushes and the conifer's canopy are foliage, which dims sight both
 *   ways; a ridge north of the field puts anyone on its crest against the sky as the camp
 *   sees it.
 * - **Hearing:** gravel around the camp and along the track, grass elsewhere; the camp's
 *   generator masks what's heard near it.
 *
 * Coordinates: the camp's centre is at (−170, 0); east (+x) is the field.
 */

const NAME = 'perception-lab';

/** Where everything is. */
export const LAB = {
  camp: { x: -170, z: 0 },
  sentry: { x: -150, z: 0 },
  tower: { x: -158, z: -22, deck: 6.25 },
  generator: { x: -180, z: 12 },
  spawn: { x: 20, z: 0 },
  ridge: { z: -70, height: 8, halfWidth: 18, x0: -175, x1: 60 },
  /** Low walls (0.9 m) at 30 m from the sentry, chest-high (1.3 m) at 60 m. */
  lowWall: { x: -120, z: 0 },
  chestWall: { x: -90, z: 6 },
  shelter: { x: -110, z: 22 },
  tallWall: { x: -96, z: -22 },
  tree: { x: -70, z: 18 },
  size: 520,
} as const;

function bump(t: number): number {
  // A smooth bump: 1 at 0, 0 at |t| ≥ 1.
  if (t <= -1 || t >= 1) return 0;
  const c = 1 - t * t;
  return c * c;
}

/** The ground: flat in the field and camp, a ridge to the north, and low hills round the edge so lines that leave the lab end on ground. */
export function labHeight(x: number, z: number): number {
  const R = LAB.ridge;
  const along = x < R.x0 ? (x - R.x0) / 25 : x > R.x1 ? (x - R.x1) / 25 : 0;
  const ridge = R.height * bump((z - R.z) / R.halfWidth) * bump(Math.max(-1, Math.min(1, along)) * 0.999);
  const edge = Math.max(Math.abs(x), Math.abs(z)) - 205;
  const hills = edge > 0 ? Math.min(15, edge * 0.3) : 0;
  return ridge + hills;
}

function labSurface(x: number, z: number): Surface {
  const C = LAB.camp;
  if (Math.abs(x - C.x) < 28 && Math.abs(z - C.z) < 28) return Surface.Gravel;
  // The track: east from the camp's gate along the field.
  if (Math.abs(z) < 1.6 && x > C.x && x < -40) return Surface.Gravel;
  return Surface.Grass;
}

/** A box collider by its centre, half-extents across (hx along x, hz along z) and its bottom and top. */
function box(x: number, z: number, hx: number, hz: number, y0: number, y1: number, flags: number, surface: Surface): ColliderInput {
  return { kind: 'box', x, z, y0, y1, hx, hz, ux: 1, uz: 0, flags, surface };
}

interface Layout {
  colliders: ColliderInput[];
  structures: Structure[];
}

function layout(): Layout {
  const colliders: ColliderInput[] = [];
  const structures: Structure[] = [];
  const add = (kind: StructureKind, parts: ColliderInput[]): void => {
    const ids: number[] = [];
    for (const c of parts) {
      ids.push(colliders.length);
      colliders.push(c);
    }
    structures.push({ kind, colliders: ids });
  };
  // The marksman's tower: legs, a deck at 6 m, a waist-high rail.
  const T = LAB.tower;
  const legs: ColliderInput[] = [];
  for (const [dx, dz] of [
    [-1.25, -1.25],
    [1.25, -1.25],
    [-1.25, 1.25],
    [1.25, 1.25],
  ] as const) {
    legs.push(box(T.x + dx, T.z + dz, 0.12, 0.12, -0.3, T.deck - 0.25, Blocks.All, Surface.Wood));
  }
  legs.push(box(T.x, T.z, 1.5, 1.5, T.deck - 0.25, T.deck, Blocks.All, Surface.Wood));
  legs.push(box(T.x - 1.45, T.z, 0.05, 1.5, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  legs.push(box(T.x, T.z - 1.45, 1.5, 0.05, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  legs.push(box(T.x, T.z + 1.45, 1.5, 0.05, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  add('tower', legs);
  // The generator, whose hum masks hearing near it.
  const G = LAB.generator;
  add('generator', [box(G.x, G.z, 1.1, 0.6, -0.3, 1.5, Blocks.All, Surface.Metal)]);
  // A hut at the camp's back, and sandbags at the sentry's post.
  add('building', [box(-192, -6, 5, 7, -0.3, 3.4, Blocks.All, Surface.Wood)]);
  add('sandbags', [box(LAB.sentry.x + 1.6, LAB.sentry.z, 0.4, 2.2, -0.3, 0.95, Blocks.All, Surface.Dirt)]);
  // Cover in the field: low walls at 30 m, a chest-high wall at 60 m, crates.
  const L = LAB.lowWall;
  add('block', [box(L.x, L.z - 4, 0.25, 3, -0.3, 0.9, Blocks.All, Surface.Rock)]);
  add('block', [box(L.x, L.z + 5, 0.25, 2, -0.3, 0.9, Blocks.All, Surface.Rock)]);
  const W = LAB.chestWall;
  add('block', [box(W.x, W.z, 0.25, 3.5, -0.3, 1.3, Blocks.All, Surface.Rock)]);
  add('crate', [box(-104, 6, 0.6, 0.6, -0.3, 1.2, Blocks.All, Surface.Wood)]);
  add('crate', [box(-60, -6, 0.6, 0.6, -0.3, 1.2, Blocks.All, Surface.Wood)]);
  add('crate', [box(-30, 9, 0.6, 0.6, -0.3, 1.2, Blocks.All, Surface.Wood)]);
  // Shade: a shelter's roof on posts, a tall wall, and the conifer (its trunk; its canopy is foliage).
  const S = LAB.shelter;
  const shelter: ColliderInput[] = [];
  for (const [dx, dz] of [
    [-3.8, -2.8],
    [3.8, -2.8],
    [-3.8, 2.8],
    [3.8, 2.8],
  ] as const) {
    shelter.push(box(S.x + dx, S.z + dz, 0.1, 0.1, -0.3, 3, Blocks.Move | Blocks.Bullet, Surface.Wood));
  }
  shelter.push(box(S.x, S.z, 4, 3, 3, 3.2, Blocks.All, Surface.Metal));
  add('block', shelter);
  const TW = LAB.tallWall;
  add('block', [box(TW.x, TW.z, 6, 0.2, -0.3, 3.5, Blocks.All, Surface.Rock)]);
  const tr = LAB.tree;
  add('block', [{ kind: 'cyl', x: tr.x, z: tr.z, y0: -0.5, y1: 3.4, r: 0.28, flags: Blocks.All, surface: Surface.Wood }]);
  return { colliders, structures };
}

/** The lab's foliage: bushes in the field, and the conifer's canopy. */
export function labFoliage(tuning: Tuning): FoliageVolume[] {
  const F = tuning.perception.foliage;
  const bush = (x: number, z: number, r: number, h: number): FoliageVolume => ({ kind: 'cyl', x, z, y0: labHeight(x, z) - 0.1, y1: labHeight(x, z) + h, r, density: F.bush });
  const tr = LAB.tree;
  return [
    bush(-128, 12, 1.0, 1.2),
    bush(-112, -9, 1.3, 1.1),
    bush(-84, -10, 1.2, 1.15),
    bush(-52, 5, 1.0, 1.0),
    bush(-24, -8, 1.4, 1.2),
    bush(-120, -70, 1.2, 1.1), // on the ridge
    { kind: 'cone', x: tr.x, z: tr.z, y0: 2.6, y1: 10.6, r: 2.6, density: F.canopy },
  ];
}

function post(id: number, role: GuardRole, x: number, y: number, z: number, faceX: number, faceZ: number, tuning: Tuning, opts: Partial<GuardSpawn> = {}): GuardSpawn {
  const s: GuardSpawn = {
    id,
    role,
    x,
    y,
    z,
    faceX,
    faceZ,
    elevated: opts.elevated ?? false,
    route: opts.route ?? null,
    routeStart: opts.routeStart ?? 0,
    scanPhase: opts.scanPhase ?? 0,
    scanScale: opts.scanScale ?? 1,
    routine: null as unknown as Routine,
  };
  s.routine = buildRoutine(s, tuning.gen.routines, new Rng(NAME, 'routines').fork(`guard${id}`));
  return s;
}

/** The lab's guards: the sentry, the patrol and the marksman. */
function guards(tuning: Tuning): GuardSpawn[] {
  const C = LAB.camp;
  const S = LAB.sentry;
  const T = LAB.tower;
  const loop = [
    { x: C.x - 24, z: C.z - 24 },
    { x: C.x + 22, z: C.z - 24 },
    { x: C.x + 22, z: C.z + 24 },
    { x: C.x - 24, z: C.z + 24 },
  ];
  return [
    post(0, 'sentry', S.x, 0, S.z, 1, 0, tuning, { scanPhase: 0.15 }),
    post(1, 'patrol', loop[0]!.x, 0, loop[0]!.z, 1, 0, tuning, { route: loop, routeStart: 1 }),
    post(2, 'marksman', T.x, T.deck, T.z, 1, 0, tuning, { elevated: true, scanScale: 0.3, scanPhase: 0.6 }),
  ];
}

/** Builds the lab's world: the terrain, the camp and the field, and its foliage. */
export function labWorld(tuning: Tuning): World {
  const { colliders, structures } = layout();
  const camp: Omit<Camp, 'site'> = { structures, guards: guards(tuning), fenceHalf: 0 };
  const world = buildWorld(
    {
      name: NAME,
      size: LAB.size,
      cell: 2,
      height: labHeight,
      surface: labSurface,
      colliders,
      spawn: { x: LAB.spawn.x, z: LAB.spawn.z, faceX: -1, faceZ: 0 },
      camp,
    },
    tuning.gen,
  );
  world.foliage = labFoliage(tuning);
  return world;
}

/**
 * A walk through the lab for headless runs: in from the east standing, along the track,
 * then into the bush by the low wall, prone.
 */
const ROUTE: Waypoint[] = [
  { x: -60, z: 0, stance: 'stand' },
  { x: -100, z: 12, stance: 'crouch' },
  { x: -110, z: -9, stance: 'prone' },
];

export function perceptionLab(): Scene {
  return {
    name: NAME,
    version: 1,
    title: 'Perception lab',
    description: 'A camp in a long field: a sentry, a patrol and a marksman, cover, shade, foliage, a skyline ridge and a generator. See what they see, and hear what they hear.',
    game: SIGHTLINE,
    world: labWorld,
    systems: PERCEPTION,
    setup: (sim) => giveSenses(sim),
    driver: () => new WaypointDriver(ROUTE),
    seconds: 90,
    playOn: true,
    expect: [
      {
        name: 'the sentry notices the walker in the open, and sees him before he reaches cover',
        during: () => undefined,
      },
    ],
  };
}
