import type { Tuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, siteAt, type Camp, type GuardRole, type GuardSpawn, type Routine, type Structure, type StructureKind } from '../../generation';
import { Rng } from '../../kernel/core/rng';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface } from '../../kernel/world/surfaces';
import type { World } from '../../kernel/world/world';
import type { FoliageVolume } from '../../perception';
import { WaypointDriver, type Waypoint } from '../bots/waypoints';
import { PERCEPTION, giveSenses } from '../perception';
import { giveBrains } from '../brains';
import { campCheckins, campCommander, commsVoice, giveCommander } from '../comms';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * The camp-brain lab (lab E, E2): a small handmade compound with the guards the design
 * doc's table names, a fence, buildings with real doorways, a marksman's tower, a radio
 * hut, a generator and an alarm box, in a field with bushes and a ridge to shoot from. It
 * stands in for lab D's camps until D4–D6 are on `main`.
 *
 * Coordinates: the camp's centre is at the origin; its gate faces east (+x).
 */

const NAME = 'camp-brain';

/** Where everything is. */
export const CAMP = {
  fence: 30,
  gateHalf: 3,
  /** A hut's centre, its size across x and z, and the side its doorway is on. */
  barracks: { x: -14, z: -16, w: 14, d: 8, door: 'south' },
  radio: { x: 16, z: -18, w: 7, d: 5, door: 'south' },
  office: { x: -16, z: 16, w: 9, d: 6, door: 'north' },
  generator: { x: 16, z: 18 },
  alarm: { x: 6, z: 2 },
  mast: { x: 20, z: -22 },
  tower: { x: -27, z: -27, deck: 6.25 },
  truck: { x: 19, z: 6 },
  spawn: { x: 120, z: 15 },
  /** A ridge to the east-north-east to shoot from, and its crest. */
  ridge: { x: 320, z: -140, height: 34, halfLength: 90, halfWidth: 46 },
  size: 760,
} as const;

function bump(t: number): number {
  if (t <= -1 || t >= 1) return 0;
  const c = 1 - t * t;
  return c * c;
}

/** Flat around the camp, a ridge to the east-north-east, and low hills round the edge. */
export function campHeight(x: number, z: number): number {
  const R = CAMP.ridge;
  const a = (x - R.x) * 0.8 + (z - R.z) * 0.6;
  const b = -(x - R.x) * 0.6 + (z - R.z) * 0.8;
  const ridge = R.height * bump(b / R.halfWidth) * bump(a / R.halfLength);
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (CAMP.size / 2 - 40);
  return ridge + (edge > 0 ? Math.min(14, edge * 0.28) : 0);
}

function campSurface(x: number, z: number): Surface {
  const F = CAMP.fence;
  if (Math.abs(x) <= F && Math.abs(z) <= F) return Surface.Gravel;
  // The track: east from the gate.
  if (Math.abs(z) < 2 && x > F && x < 150) return Surface.Dirt;
  return Surface.Grass;
}

function box(x: number, z: number, hx: number, hz: number, y0: number, y1: number, flags: number, surface: Surface): ColliderInput {
  return { kind: 'box', x, z, y0, y1, hx, hz, ux: 1, uz: 0, flags, surface };
}

interface Layout {
  colliders: ColliderInput[];
  structures: Structure[];
}

/** A hut: four walls with a doorway on one side, 1.2 m wide, and a roof overhead. */
function hut(add: (kind: StructureKind, parts: ColliderInput[]) => void, H: { x: number; z: number; w: number; d: number; door: string }): void {
  const t = 0.12;
  const h = 2.7;
  const halfW = H.w / 2;
  const halfD = H.d / 2;
  const door = 0.6;
  const parts: ColliderInput[] = [];
  const wall = (x: number, z: number, hx: number, hz: number): void => {
    parts.push(box(x, z, hx, hz, -0.3, h, Blocks.All, Surface.Wood));
  };
  // Each wall, split around the doorway when it has one.
  const north = H.z - halfD;
  const south = H.z + halfD;
  const west = H.x - halfW;
  const east = H.x + halfW;
  if (H.door === 'north') {
    wall(H.x - (halfW + door) / 2, north, (halfW - door) / 2, t);
    wall(H.x + (halfW + door) / 2, north, (halfW - door) / 2, t);
  } else wall(H.x, north, halfW + t, t);
  if (H.door === 'south') {
    wall(H.x - (halfW + door) / 2, south, (halfW - door) / 2, t);
    wall(H.x + (halfW + door) / 2, south, (halfW - door) / 2, t);
  } else wall(H.x, south, halfW + t, t);
  if (H.door === 'west') {
    wall(west, H.z - (halfD + door) / 2, t, (halfD - door) / 2);
    wall(west, H.z + (halfD + door) / 2, t, (halfD - door) / 2);
  } else wall(west, H.z, t, halfD + t);
  if (H.door === 'east') {
    wall(east, H.z - (halfD + door) / 2, t, (halfD - door) / 2);
    wall(east, H.z + (halfD + door) / 2, t, (halfD - door) / 2);
  } else wall(east, H.z, t, halfD + t);
  parts.push(box(H.x, H.z, halfW + t, halfD + t, h, h + 0.2, Blocks.All, Surface.Metal));
  add('building', parts);
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
  // The fence: chain-link, with a gate on the east side.
  const F = CAMP.fence;
  const G = CAMP.gateHalf;
  const fence = (x: number, z: number, hx: number, hz: number): void => add('fence', [box(x, z, hx, hz, -0.3, 2.4, Blocks.Move, Surface.Metal)]);
  fence(0, -F, F, 0.05);
  fence(0, F, F, 0.05);
  fence(-F, 0, 0.05, F);
  fence(F, -(F + G) / 2, 0.05, (F - G) / 2);
  fence(F, (F + G) / 2, 0.05, (F - G) / 2);
  // Buildings, each with a doorway.
  hut(add, CAMP.barracks);
  hut(add, CAMP.radio);
  hut(add, CAMP.office);
  // The radio's mast, the generator, the alarm box on its post.
  add('mast', [{ kind: 'cyl', x: CAMP.mast.x, z: CAMP.mast.z, y0: -0.3, y1: 12, r: 0.12, flags: Blocks.All, surface: Surface.Metal }]);
  const g = CAMP.generator;
  add('generator', [box(g.x, g.z, 1.1, 0.6, -0.3, 1.5, Blocks.All, Surface.Metal)]);
  add('sandbags', [box(g.x + 2, g.z, 0.4, 1.8, -0.3, 0.95, Blocks.All, Surface.Dirt)]);
  add('post', [{ kind: 'cyl', x: CAMP.alarm.x, z: CAMP.alarm.z, y0: -0.3, y1: 1.5, r: 0.09, flags: Blocks.Move | Blocks.Bullet, surface: Surface.Metal }]);
  // The tower: legs, a deck at 6 m, a waist-high rail.
  const T = CAMP.tower;
  const parts: ColliderInput[] = [];
  for (const [dx, dz] of [
    [-1.25, -1.25],
    [1.25, -1.25],
    [-1.25, 1.25],
    [1.25, 1.25],
  ] as const) {
    parts.push(box(T.x + dx, T.z + dz, 0.12, 0.12, -0.3, T.deck - 0.25, Blocks.All, Surface.Wood));
  }
  parts.push(box(T.x, T.z, 1.5, 1.5, T.deck - 0.25, T.deck, Blocks.All, Surface.Wood));
  parts.push(box(T.x - 1.45, T.z, 0.05, 1.5, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  parts.push(box(T.x, T.z - 1.45, 1.5, 0.05, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  parts.push(box(T.x, T.z + 1.45, 1.5, 0.05, T.deck, T.deck + 0.9, Blocks.All, Surface.Wood));
  add('tower', parts);
  // A parked truck, crates and sandbags for cover.
  const k = CAMP.truck;
  add('vehicle', [box(k.x, k.z, 2.6, 1.05, -0.3, 2.3, Blocks.All, Surface.Metal)]);
  for (const [x, z] of [
    [-4, 12],
    [-2.4, 12.5],
    [10, -8],
    [-22, 2],
    [22, -6],
  ] as const) {
    add('crate', [box(x, z, 0.6, 0.6, -0.3, 1.2, Blocks.All, Surface.Wood)]);
  }
  add('sandbags', [box(27, 8, 0.4, 2, -0.3, 0.95, Blocks.All, Surface.Dirt)]);
  add('sandbags', [box(0, -26, 2, 0.4, -0.3, 0.95, Blocks.All, Surface.Dirt)]);
  return { colliders, structures };
}

/** Bushes in the field outside the fence, where a player can lie up. */
function foliage(tuning: Tuning): FoliageVolume[] {
  const F = tuning.perception.foliage;
  const bush = (x: number, z: number, r: number, h: number): FoliageVolume => ({ kind: 'cyl', x, z, y0: campHeight(x, z) - 0.1, y1: campHeight(x, z) + h, r, density: F.bush });
  return [bush(40, 10, 1.2, 1.1), bush(44, -8, 1.3, 1.15), bush(55, 20, 1.1, 1.1), bush(70, -4, 1.4, 1.2), bush(62, 32, 1.2, 1.1), bush(-44, 18, 1.3, 1.1), bush(10, 44, 1.2, 1.1)];
}

function post(id: number, role: GuardRole, x: number, z: number, faceX: number, faceZ: number, tuning: Tuning, opts: Partial<GuardSpawn> = {}): GuardSpawn {
  const s: GuardSpawn = {
    id,
    role,
    x,
    y: opts.y ?? 0,
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

/** The guards: the design doc's roles, eight of them. */
function guards(tuning: Tuning): GuardSpawn[] {
  const H = 24;
  const loop = [
    { x: H, z: -H },
    { x: H, z: H },
    { x: -H, z: H },
    { x: -H, z: -H + 3 },
  ];
  const chores = [
    { x: -3, z: 9 },
    { x: 3.5, z: 14 },
    { x: 9, z: 11 },
  ];
  const rounds = [
    { x: -12, z: 8 },
    { x: 8, z: -7 },
    { x: -2, z: -6 },
  ];
  return [
    post(0, 'sentry', 28, 4.5, 1, 0, tuning, { scanPhase: 0.2 }),
    post(1, 'sentry', -1, -28, 0, -1, tuning, { scanPhase: 0.7 }),
    post(2, 'patrol', loop[0]!.x, loop[0]!.z, 0, 1, tuning, { route: loop, routeStart: 1 }),
    post(3, 'patrol', loop[2]!.x, loop[2]!.z, 0, -1, tuning, { route: loop, routeStart: 3, scanPhase: 0.5 }),
    post(4, 'marksman', CAMP.tower.x, CAMP.tower.z, 1, 1, tuning, { y: CAMP.tower.deck, elevated: true, scanScale: 0.3, scanPhase: 0.6 }),
    post(5, 'radio-operator', CAMP.radio.x, CAMP.radio.z, 0, 1, tuning, { scanScale: 0.3 }),
    post(6, 'officer', rounds[0]!.x, rounds[0]!.z, 1, 0, tuning, { route: rounds, routeStart: 1, scanPhase: 0.4 }),
    post(7, 'worker', chores[0]!.x, chores[0]!.z, 1, 0, tuning, { route: chores, routeStart: 1, scanScale: 0.4 }),
  ];
}

/** The lab's world. */
export function campWorld(tuning: Tuning): World {
  const { colliders, structures } = layout();
  const camp: Omit<Camp, 'site'> & { site: ReturnType<typeof siteAt> } = { structures, guards: guards(tuning), fenceHalf: CAMP.fence, site: siteAt(0, 0) };
  const world = buildWorld(
    {
      name: NAME,
      size: CAMP.size,
      cell: 2,
      height: campHeight,
      surface: campSurface,
      colliders,
      spawn: { x: CAMP.spawn.x, z: CAMP.spawn.z, faceX: -1, faceZ: 0 },
      camp,
    },
    tuning.gen,
  );
  world.foliage = foliage(tuning);
  return world;
}

/** A walk in from the east, along the track to the gate. */
const ROUTE: Waypoint[] = [
  { x: 60, z: 14, stance: 'stand' },
  { x: 44, z: 6, stance: 'crouch' },
];

export function campBrain(): Scene {
  return {
    name: NAME,
    version: 1,
    title: 'Camp brain',
    description: 'A compound with eight guards in the design doc roles: sentries, a patrol pair, a marksman, a radio operator, an officer and a worker.',
    game: SIGHTLINE,
    world: campWorld,
    systems: [...PERCEPTION, commsVoice, campCommander, campCheckins],
    setup: (sim) => {
      giveSenses(sim);
      giveBrains(sim);
      giveCommander(sim);
    },
    driver: () => new WaypointDriver(ROUTE),
    seconds: 40,
    expect: [
      {
        name: 'the camp stays a camp: every guard is near it, on the ground or his tower',
        after: (sim) => {
          for (const g of sim.guards) {
            const s = sim.world.camp.guards[g.guard.spawn]!;
            if (g.body.x * g.body.x + g.body.z * g.body.z > 70 * 70) return `guard ${g.id} (${s.role}) walked off to ${g.body.x.toFixed(1)}, ${g.body.z.toFixed(1)}`;
            if (!s.elevated && Math.abs(g.body.y - sim.world.terrain.heightAt(g.body.x, g.body.z)) > 1) return `guard ${g.id} (${s.role}) isn't on the ground`;
          }
        },
      },
    ],
  };
}
