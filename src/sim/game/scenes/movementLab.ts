import type { Tuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, type Camp, type GuardRole, type GuardSpawn, type Routine, type Structure, type StructureKind } from '../../generation';
import { TWO_PI, datan2, dcos, dsin } from '../../kernel/core/detmath';
import { Rng } from '../../kernel/core/rng';
import { Faction } from '../../kernel/state';
import type { SimEvent } from '../../kernel/events';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { SURFACE_NAMES, Surface, surfaceName } from '../../kernel/world/surfaces';
import type { World } from '../../kernel/world/world';
import { createSenses, type FoliageVolume } from '../../perception';
import { WaypointDriver, type Waypoint } from '../bots/waypoints';
import type { RemainsEntity } from '../entities';
import { PERCEPTION } from '../perception';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * The movement lab (lab C): the arena where a body's own noise and visibility are
 * learned, and every way it can move is tried. South to north:
 *
 * - **The noise yard:** a guard in a canvas tent that stops sight, not sound, listens from
 *   the middle of a disc cut into wedges, one for every surface. Walk any wedge, at any
 *   gait and distance, and you find out what he hears.
 * - **A body to carry** lies on the dirt in front of the garden (C6).
 * - **The wall garden:** free-standing walls from a stride's height to out of reach, a
 *   platform to climb onto, windows you fit through and windows you don't, a tower with
 *   a ladder. A guard who neither sees nor hears walks the far side of the walls, back and
 *   forth, so a landing can be taken while someone walks into it.
 * - **The field:** beyond a tall wall with a gate, a guard watches south down a long
 *   field. The wall shades a strip of ground and a roof shades a patch of it, so the same
 *   walk can be tried in the sun and out of it, near and far from his eyes.
 *
 * Coordinates: north is −z. The lab grows with each milestone (docs/phase-1-plan.md, C1).
 */

const NAME = 'movement-lab';

/** Where everything is. */
export const ARENA = {
  size: 220,
  cell: 1,
  spawn: { x: 0, z: 88 },
  /** The noise yard: its centre (the listener) and how far its wedges reach. */
  yard: { x: 0, z: 44, radius: 30 },
  /** The tent around the listener: its half-size and height. */
  tent: { half: 1.5, height: 2.4 },
  /** The wall garden's row: every obstacle's north face is on this line. */
  garden: { z: -2.15, thickness: 0.3 },
  /** The walker's lane, just north of the garden's walls. */
  walker: { z: -2.9, x0: -56, x1: 52 },
  /** A tall wall from west to east, with a gate off to the east: it hides the field from the yard and shades a strip north of it. */
  divider: { z: -14, half: 70, height: 4, gate: [30, 36] as const },
  /** The field's far end: the watcher's post. */
  watcher: { x: 0, z: -96 },
  /** A roof on posts in the field, shading a patch of it. */
  roof: { x: 0, z: -56, hx: 12, hz: 8, height: 3.4 },
} as const;

/** The bush the tour hides the body in. */
export const BUSH = { x: 38, z: 20 } as const;

/** Heights of the free-standing walls in the garden's row (x centres, 5 m wide). */
export const WALLS: ReadonlyArray<{ x: number; height: number }> = [
  { x: -52, height: 0.6 },
  { x: -44, height: 0.9 },
  { x: -36, height: 1.2 },
  { x: -28, height: 1.5 },
  { x: -20, height: 1.9 },
];

/** A window cut in a wall, by its centre along the row and its opening. */
export interface WindowSpec {
  x: number;
  /** Half-width of the opening; the sill and the top of the opening. */
  halfWidth: number;
  sill: number;
  top: number;
}

/** The windows: one a body fits through, one too narrow, one too low. */
export const WINDOWS: readonly WindowSpec[] = [
  { x: -6, halfWidth: 0.55, sill: 0.95, top: 2.3 },
  { x: 8, halfWidth: 0.24, sill: 0.95, top: 2.3 },
  { x: 22, halfWidth: 0.55, sill: 1.05, top: 1.75 },
];

/** A platform to climb onto (1.2 m), 3 m deep, south of the row; a tower with a deck at 5 m beyond it. */
export const PLATFORM = { x: 34, half: 2.5, height: 1.2, depth: 3 };
export const TOWER = { x: 44, deck: 5 };
/** A body to carry or drag (lab B's `remains`), lying on the dirt in front of the walls. */
export const BODY = { x: -16, z: 6 } as const;

/** The tower's ladder, on its open south side: its foot, the deck it reaches, and away from the tower. */
export const LADDER = { x: TOWER.x, z: ARENA.garden.z + 3 + 0.08, y0: 0, y1: TOWER.deck, ox: 0, oz: 1 } as const;

/** The ground: flat, with low hills round the edge so lines that leave the lab end on ground. */
export function arenaHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z)) - 100;
  return edge > 0 ? Math.min(12, edge * 0.3) : 0;
}

/** Which surface's wedge a bearing from the listener falls in, by its index in SURFACE_NAMES. */
function wedgeOf(dx: number, dz: number): number {
  const a = datan2(dx, -dz) + Math.PI;
  const k = Math.floor((a / TWO_PI) * SURFACE_NAMES.length);
  return k >= SURFACE_NAMES.length ? SURFACE_NAMES.length - 1 : k;
}

/** A point in a wedge (by its index in SURFACE_NAMES), `radius` from the listener. */
export function wedgePoint(k: number, radius: number): { x: number; z: number } {
  const a = ((k + 0.5) / SURFACE_NAMES.length) * TWO_PI - Math.PI;
  const Y = ARENA.yard;
  return { x: Y.x + radius * dsin(a), z: Y.z - radius * dcos(a) };
}

function arenaSurface(x: number, z: number): Surface {
  const Y = ARENA.yard;
  const dx = x - Y.x;
  const dz = z - Y.z;
  if (dx * dx + dz * dz <= Y.radius * Y.radius) return wedgeOf(dx, dz) as Surface;
  // Dirt in the garden, gravel down the field's middle.
  if (z < ARENA.divider.z && Math.abs(x) < 2) return Surface.Gravel;
  if (z >= ARENA.divider.z && z < 12) return Surface.Dirt;
  return Surface.Grass;
}

function box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, surface: Surface, flags: number = Blocks.All): ColliderInput {
  return { kind: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, y0, y1, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ux: 1, uz: 0, flags, surface };
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
  // The listener's tent: canvas stops the eye, not the ear.
  const Y = ARENA.yard;
  const { half, height } = ARENA.tent;
  const canvas = Blocks.Move | Blocks.Sight;
  const t = 0.05;
  add('block', [
    box(Y.x - half, Y.x + half, Y.z - half - t, Y.z - half + t, -0.3, height, Surface.Dirt, canvas),
    box(Y.x - half, Y.x + half, Y.z + half - t, Y.z + half + t, -0.3, height, Surface.Dirt, canvas),
    box(Y.x - half - t, Y.x - half + t, Y.z - half, Y.z + half, -0.3, height, Surface.Dirt, canvas),
    box(Y.x + half - t, Y.x + half + t, Y.z - half, Y.z + half, -0.3, height, Surface.Dirt, canvas),
  ]);
  const G = ARENA.garden;
  const north = G.z;
  const south = G.z + G.thickness;
  // The free-standing walls.
  for (const w of WALLS) add('block', [box(w.x - 2.5, w.x + 2.5, north, south, -0.3, w.height, Surface.Rock)]);
  // The windows, each in a wall 8 m wide and 3 m tall.
  for (const w of WINDOWS) {
    add('block', [
      box(w.x - 4, w.x - w.halfWidth, north, south, -0.3, 3, Surface.Wood),
      box(w.x + w.halfWidth, w.x + 4, north, south, -0.3, 3, Surface.Wood),
      box(w.x - w.halfWidth, w.x + w.halfWidth, north, south, -0.3, w.sill, Surface.Wood),
      box(w.x - w.halfWidth, w.x + w.halfWidth, north, south, w.top, 3, Surface.Wood),
    ]);
  }
  // The platform, its north face on the row.
  const P = PLATFORM;
  add('block', [box(P.x - P.half, P.x + P.half, north, north + P.depth, -0.3, P.height, Surface.Wood)]);
  // A tower with a deck, reached by its ladder (below).
  const T = TOWER;
  const deck = T.deck;
  const legs: ColliderInput[] = [];
  for (const [dx, dz] of [
    [-1.25, -1.25],
    [1.25, -1.25],
    [-1.25, 1.25],
    [1.25, 1.25],
  ] as const) {
    legs.push(box(T.x + dx - 0.12, T.x + dx + 0.12, north + 1.5 + dz - 0.12, north + 1.5 + dz + 0.12, -0.3, deck - 0.25, Surface.Wood));
  }
  legs.push(box(T.x - 1.5, T.x + 1.5, north, north + 3, deck - 0.25, deck, Surface.Wood));
  // A waist-high rail on three sides, open to the south.
  legs.push(box(T.x - 1.5, T.x + 1.5, north, north + 0.1, deck, deck + 0.9, Surface.Wood));
  legs.push(box(T.x - 1.5, T.x - 1.4, north, north + 3, deck, deck + 0.9, Surface.Wood));
  legs.push(box(T.x + 1.4, T.x + 1.5, north, north + 3, deck, deck + 0.9, Surface.Wood));
  add('tower', legs);
  // Its ladder, up the open south side. Thin, and the only way up without a body to stand on.
  const L = LADDER;
  add('block', [box(L.x - 0.3, L.x + 0.3, L.z - 0.08, L.z, -0.3, L.y1, Surface.Wood, Blocks.Move | Blocks.Bullet)]);
  // The divider, with its gate.
  const D = ARENA.divider;
  add('block', [box(-D.half, D.gate[0], D.z - 0.2, D.z + 0.2, -0.3, D.height, Surface.Rock)]);
  add('block', [box(D.gate[1], D.half, D.z - 0.2, D.z + 0.2, -0.3, D.height, Surface.Rock)]);
  // A roof over part of the field, on four posts.
  const R = ARENA.roof;
  const posts: ColliderInput[] = [];
  for (const [dx, dz] of [
    [-R.hx + 0.3, -R.hz + 0.3],
    [R.hx - 0.3, -R.hz + 0.3],
    [-R.hx + 0.3, R.hz - 0.3],
    [R.hx - 0.3, R.hz - 0.3],
  ] as const) {
    posts.push(box(R.x + dx - 0.1, R.x + dx + 0.1, R.z + dz - 0.1, R.z + dz + 0.1, -0.3, R.height, Surface.Wood, Blocks.Move | Blocks.Bullet));
  }
  posts.push(box(R.x - R.hx, R.x + R.hx, R.z - R.hz, R.z + R.hz, R.height, R.height + 0.2, Surface.Metal));
  add('block', posts);
  // A low bank to lie behind, and crates to stand behind, in the field.
  add('block', [box(-20, -14, -36, -35.4, -0.3, 0.8, Surface.Dirt)]);
  add('crate', [box(16, 17.2, -38, -36.8, -0.3, 1.2, Surface.Wood)]);
  add('crate', [box(-30, -28.8, -70, -68.8, -0.3, 1.2, Surface.Wood)]);
  return { colliders, structures };
}

/** The lab's foliage: bushes in the field to hide in, and one by the yard. */
export function arenaFoliage(tuning: Tuning): FoliageVolume[] {
  const F = tuning.perception.foliage;
  const bush = (x: number, z: number, r: number, h: number): FoliageVolume => ({ kind: 'cyl', x, z, y0: arenaHeight(x, z) - 0.1, y1: arenaHeight(x, z) + h, r, density: F.bush });
  return [bush(-24, -48, 1.2, 1.1), bush(24, -44, 1.3, 1.15), bush(34, -76, 1.0, 1.0), bush(38, 20, 1.2, 1.1)];
}

function post(id: number, role: GuardRole, x: number, z: number, faceX: number, faceZ: number, tuning: Tuning, opts: Partial<GuardSpawn> = {}): GuardSpawn {
  const s: GuardSpawn = {
    id,
    role,
    x,
    y: 0,
    z,
    faceX,
    faceZ,
    elevated: false,
    route: opts.route ?? null,
    routeStart: opts.routeStart ?? 0,
    scanPhase: opts.scanPhase ?? 0,
    scanScale: opts.scanScale ?? 1,
    routine: null as unknown as Routine,
  };
  s.routine = buildRoutine(s, tuning.gen.routines, new Rng(NAME, 'routines').fork(`guard${id}`));
  return s;
}

/** The lab's guards, in entity order: the listener, the watcher, the walker. */
function guards(tuning: Tuning): GuardSpawn[] {
  const Y = ARENA.yard;
  const W = ARENA.watcher;
  const L = ARENA.walker;
  return [
    post(0, 'sentry', Y.x, Y.z, 0, -1, tuning, { scanScale: 0 }),
    post(1, 'sentry', W.x, W.z, 0, 1, tuning, { scanScale: 0.3 }),
    post(2, 'patrol', L.x0, L.z, 1, 0, tuning, {
      route: [
        { x: L.x0, z: L.z },
        { x: L.x1, z: L.z },
      ],
      routeStart: 1,
    }),
  ];
}

/** Builds the arena. */
export function arenaWorld(tuning: Tuning): World {
  const { colliders, structures } = layout();
  const camp: Omit<Camp, 'site'> = { structures, guards: guards(tuning), fenceHalf: 0 };
  const world = buildWorld(
    {
      name: NAME,
      size: ARENA.size,
      cell: ARENA.cell,
      height: arenaHeight,
      surface: arenaSurface,
      colliders,
      spawn: { x: ARENA.spawn.x, z: ARENA.spawn.z, faceX: 0, faceZ: -1 },
      camp,
    },
    tuning.gen,
  );
  world.foliage = arenaFoliage(tuning);
  world.ladders = [LADDER];
  // The shade is drawn as it's simulated (A4): the divider's strip and the roof's patch are what the field is for.
  world.shadeArea = { x0: -105, z0: -105, x1: 105, z1: 105, cell: 0.5 };
  return world;
}

/** The guards who sense: the listener and the watcher. The walker keeps his routine, blind and deaf, for the mantle to meet. */
export const SENSING = [0, 1] as const;

/** A tour for headless runs: round the yard's wedges, through the garden and the gate, up the field. */
function route(): Waypoint[] {
  const points: Waypoint[] = [];
  for (let k = 0; k < SURFACE_NAMES.length; k++) {
    const p = wedgePoint(k, 13);
    points.push({ x: p.x, z: p.z, stance: 'stand', sprint: k % 2 === 0 });
  }
  const D = ARENA.divider;
  const gate = (D.gate[0] + D.gate[1]) / 2;
  const G = ARENA.garden;
  const south = G.z + G.thickness + 0.55; // where a body stands to mantle the row from the south
  const north = G.z - 1.2; // beyond it, the far side of the row
  // The body: pick it up, carry it to the bush, put it down.
  // Coming at it from the east, so the body is ahead on arriving.
  points.push({ x: BODY.x + 6, z: BODY.z + 0.5, stance: 'stand' });
  points.push({ x: BODY.x + 1, z: BODY.z + 0.2, stance: 'stand', use: true });
  points.push({ x: BUSH.x, z: BUSH.z - 0.3, stance: 'stand' });
  points.push({ x: BUSH.x, z: BUSH.z - 0.3, stance: 'stand', use: true });
  // Over the 0.9 m wall.
  points.push({ x: WALLS[1]!.x, z: south, stance: 'stand', climb: true });
  points.push({ x: WALLS[1]!.x, z: north, stance: 'stand' });
  // Back through a gap, and in through the window that fits a body.
  points.push({ x: -14, z: north, stance: 'stand' });
  points.push({ x: -14, z: 4, stance: 'stand' });
  points.push({ x: WINDOWS[0]!.x, z: south, stance: 'stand', climb: true });
  points.push({ x: WINDOWS[0]!.x, z: north, stance: 'stand' });
  points.push({ x: 15, z: north, stance: 'stand' });
  points.push({ x: gate, z: D.z + 3, stance: 'stand' });
  points.push({ x: gate, z: D.z - 4, stance: 'stand' });
  points.push({ x: 0, z: ARENA.roof.z + ARENA.roof.hz + 4, stance: 'stand' });
  // Back through the gate, and up the tower's ladder to its deck.
  const L = LADDER;
  points.push({ x: gate, z: D.z - 4, stance: 'stand' });
  points.push({ x: gate, z: D.z + 3, stance: 'stand' });
  points.push({ x: L.x + 0.5, z: L.z + 2, stance: 'stand' });
  points.push({ x: L.x, z: L.z + 0.55, stance: 'stand', ladder: true });
  points.push({ x: L.x, z: L.z - 1, stance: 'stand' });
  return points;
}

/** What the expectations gather as the run goes on. */
function fresh(): { stepped: Set<string>; heard: number; sawThroughTent: boolean; noticed: boolean; noticedAcrossDivider: boolean; mantles: number } {
  return { stepped: new Set(), heard: 0, sawThroughTent: false, noticed: false, noticedAcrossDivider: false, mantles: 0 };
}

export function movementLab(): Scene {
  let seen = fresh();
  return {
    name: NAME,
    version: 2,
    title: 'Movement lab',
    description: "A yard of every surface around a guard who listens, a garden of walls and windows, and a field under a guard who watches. Learn how loud and how visible you are.",
    game: SIGHTLINE,
    world: arenaWorld,
    systems: PERCEPTION,
    setup: (sim) => {
      seen = fresh();
      for (const k of SENSING) sim.guards[k]!.senses ??= createSenses(false);
      // A body to carry, or drag: lying on the dirt south of the garden's walls.
      sim.spawn(
        (id): RemainsEntity => ({
          id,
          kind: 'remains',
          faction: Faction.Camp,
          remains: { of: 0, post: -1, x: BODY.x, y: 0, z: BODY.z, yaw: 1.2, eye: sim.tuning.bodies.guard.eyeHeight.stand, vx: 0, vz: 0, fell: -5, part: 'torso', carriedBy: 0, hidden: false },
        }),
      );
    },
    driver: () => new WaypointDriver(route(), 1),
    seconds: 240,
    playOn: true,
    expect: [
      {
        name: 'every surface in the yard is stepped on, and heard as itself',
        during: (sim, events: readonly SimEvent[]) => {
          for (const e of events) {
            if (e.type !== 'footstep' || e.source !== sim.playerId) continue;
            const expected = sim.tuning.noise.radiusPerUnit * e.loudness;
            if (Math.abs(e.radius - expected) > 1e-6) return `a step on ${surfaceName(e.surface)} heard at ${e.radius} m, not ${expected}`;
            seen.stepped.add(surfaceName(e.surface));
          }
        },
        after: () => {
          const missing = SURFACE_NAMES.filter((s) => !seen.stepped.has(s));
          if (missing.length) return `never stepped on ${missing.join(', ')}`;
        },
      },
      {
        name: 'the listener hears the walk round the yard, through canvas that stops his eyes',
        during: (sim, events) => {
          const listener = sim.guards[0]!.id;
          for (const e of events) {
            if (e.type === 'heard' && e.source === listener) seen.heard++;
            if (e.type === 'noticed' && e.source === listener) seen.sawThroughTent = true;
          }
        },
        after: () => {
          if (seen.heard === 0) return 'he heard nothing';
          if (seen.sawThroughTent) return 'he noticed the walker by sight, through the tent';
        },
      },
      {
        name: 'the walker carries the body to the bush, and it is hidden there',
        after: (sim) => {
          const r = sim.index.of('remains')[0]!.remains;
          if (r.carriedBy !== 0) return 'still carrying the body';
          if (!r.hidden) return `the body is at ${r.x.toFixed(1)}, ${r.z.toFixed(1)}, not hidden`;
        },
      },
      {
        name: 'the walker ends on the tower, up its ladder',
        after: (sim) => {
          if (Math.abs(sim.player.y - TOWER.deck) > 0.05) return `feet at ${sim.player.y.toFixed(2)}, not on the 5 m deck`;
        },
      },
      {
        name: 'the walker mantles a wall, a window and the deck of the tower',
        during: (sim, events) => {
          for (const e of events) if (e.type === 'mantle' && e.source === sim.playerId) seen.mantles++;
        },
        after: () => {
          if (seen.mantles !== 3) return `${seen.mantles} mantles`;
        },
      },
      {
        name: 'the watcher notices the walker in the open field, not through the divider',
        during: (sim, events) => {
          const watcher = sim.guards[1]!.id;
          const D = ARENA.divider;
          for (const e of events) {
            if (e.type !== 'noticed' || e.source !== watcher) continue;
            // South of the wall and away from the gate, the wall is in the way.
            if (sim.player.z > D.z + 0.5 && sim.player.x < D.gate[0] - 2) seen.noticedAcrossDivider = true;
            seen.noticed = true;
          }
        },
        after: () => {
          if (seen.noticedAcrossDivider) return 'he noticed the walker through the divider';
          if (!seen.noticed) return 'he never noticed the walker';
        },
      },
    ],
  };
}
