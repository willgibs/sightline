import type { GenTuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { Rng } from '../kernel/core/rng';
import { Blocks, type ColliderSet } from '../kernel/world/colliders';
import { Cell, Edge, type SpatialGrid, type StairSpec, type StoreySpec } from '../kernel/world/grid';
import type { Heightfield } from '../kernel/world/heightfield';
import { Surface } from '../kernel/world/surfaces';
import type { Camp, Structure, StructureKind } from './camp';
import type { CampSpec } from './campSpec';
import { buried, needsWayIn, type CruxKind } from './crux';
import { segmentDistance, type Point2 } from './paths';
import { overviewPerches, type PerchViews } from './perches';
import { layOutPlot, type CompoundType, type CompoundTypeSpec, type PatrolLoop, type Rect } from './plots';
import { cellOf, type Raster } from './raster';
import type { SiteKind } from './landform';
import type { Site } from './site';
import type { TerrainFeatures } from './terrain';
import { pickWeighted } from './weights';

/**
 * The compound (lab D, D4): the core mission's archetype, laid out as plots and parcels
 * from handmade modules (XCOM 2's method), solution first (Spelunky's).
 *
 * 1. **The skeleton.** Before anything fills it, the camp's approaches are laid down: a
 *    breach in the fence on the side that faces a ridge (whose gully comes down toward
 *    it), a low-exposure corridor from outside the breach to the target's back door, the
 *    generator beside that corridor (a reachable sabotage node), two ways out (the breach
 *    and the gate), and the target's escape route (his building, his vehicle, the gate,
 *    the road). Validation (D8) then mostly asks whether the fill broke the skeleton.
 * 2. **The plot.** The perimeter fence with its gate toward the road and its breach,
 *    watchtowers with ladders at two to four corners, a clear lane inside the fence for
 *    the perimeter patrols, the road from the gate to an open yard at the centre.
 * 3. **The parcels.** Seven slots around the yard (two by the road, two beside the yard,
 *    three at the back), each filled from a module: the target's building, the barracks,
 *    the mess, the storage shed, the radio room and its mast, the generator's shed, the
 *    motor pool with the escape vehicle. Then the fixtures (light poles and alarm boxes)
 *    and the cover (containers, crates, sandbags).
 *
 * Buildings are hollow: walls with doorways and a roof, so the target can be reached
 * inside. Doors and vehicles have state, so they are data here (`camp.doors`,
 * `camp.vehicles`) and the game spawns them as entities with a solid shape
 * (game/camp.ts), seen by the motor and every query like a wall.
 *
 * Coordinates are (a, b) in the site's frame (site.ts): a runs from the centre toward the
 * gate, b across. Everything is placed through `at`, so the camp stands wherever its
 * site does (rule 15). Each part draws from its own labelled fork (rule 3).
 *
 * **The plan.** A camp's plan (`layout.plan`) says the shape of its plot (long along the gate's
 * axis, wide across it, small and tight, or the square yard it started as), what stands round it
 * (chain link, a solid wall on the sides facing the ridges, a wall all round), and how full its
 * yard is. A wall and a packed yard stop what a perch can see, which is what makes a plan
 * matter more than a shape. With every plan weighted to `yard`, `chain` and `open`, the compound
 * draws just what it always did.
 */

export type Side = 'front' | 'back' | 'left' | 'right';
/** A parcel's name, from its plot shape (plots.ts). */
export type SlotName = string;
export type ModuleName = 'hq' | 'barracks' | 'mess' | 'storage' | 'radio' | 'shed' | 'motor-pool' | 'cover';

/** A doorway, and the door in it: an entity whose solid closes the doorway when shut. */
export interface DoorSpec {
  /** The middle of the doorway, at floor level. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** Unit vector along the wall. */
  ux: number;
  uz: number;
  /** Unit vector from the doorway into the room. */
  nx: number;
  nz: number;
  /** The building it belongs to (its index in `layout.buildings`). */
  building: number;
  /** Doors start open, so routines walk through; lab E's guards and lab C's use action shut them. */
  open: boolean;
}

export interface VehicleSpec {
  kind: 'truck' | 'jeep';
  /** Centre of its footprint, and its base. */
  x: number;
  y: number;
  z: number;
  /** Unit vector it faces. */
  fx: number;
  fz: number;
  length: number;
  width: number;
  height: number;
  /** The target's way out at lockdown (lab E). */
  escape: boolean;
}

/** A ladder up a tower: lab C's ladder mode climbs it, lab E's navigation links its ends. */
export interface LadderSpec {
  /** Foot of the ladder. */
  x: number;
  z: number;
  y0: number;
  /** Top: the deck it reaches. */
  y1: number;
  /** Unit vector from the ladder away from the tower: where a climber stands. */
  ox: number;
  oz: number;
}

export type DeviceKind = 'generator' | 'light' | 'alarm' | 'radio';

/**
 * A part of the camp's systems (D5): the generator, and what it powers. Each is a
 * structure in the world and an entity with state in a run (game/camp.ts).
 */
export interface DeviceSpec {
  kind: DeviceKind;
  /** Where it is: the generator's middle, a light's lamp, an alarm box, the radio set. */
  x: number;
  y: number;
  z: number;
  /** Its structure (camp.structures index). */
  structure: number;
  /** The generator that powers it (its index in camp.devices), or −1 for a generator. */
  feed: number;
}

/** What the mission is for (D5): today, to eliminate the target before he escapes. */
export interface ObjectiveSpec {
  kind: 'eliminate';
  /** The target's post (camp.guards index). */
  target: number;
  /** His building (layout.buildings index) and his escape vehicle (camp.vehicles index). */
  building: number;
  vehicle: number;
}

export interface Opening {
  kind: 'gate' | 'breach';
  side: Side;
  /** Middle of the gap, in the site's frame. */
  a: number;
  b: number;
  width: number;
}

export interface Parcel {
  slot: SlotName;
  /** Middle and size of the slot, in the site's frame. */
  a: number;
  b: number;
  lenA: number;
  lenB: number;
  module: ModuleName;
}

/** A window of an upper floor: a gap in a wall between a sill and a head, in the world. */
export interface WindowSpec {
  /** The middle of its gap in the wall. */
  x: number;
  z: number;
  /** Along the wall. */
  ux: number;
  uz: number;
  width: number;
  /** Heights: the top of the sill, the underside of the head, the top of the wall. */
  sill: number;
  head: number;
  top: number;
  building: number;
}

export interface BuildingSpec {
  module: ModuleName;
  /** Middle of its footprint. */
  x: number;
  z: number;
  /** Unit vector along its length. */
  ux: number;
  uz: number;
  length: number;
  depth: number;
  height: number;
  /** Floors: 1, or 2 with stairs, windows and a floor above at `floorY` (0 if one), `storey` its index in camp.storeys (−1 if one). */
  storeys: number;
  floorY: number;
  storey: number;
  /** Its doors (indices into camp.doors). */
  doors: number[];
  /** The index of its structure in camp.structures. */
  structure: number;
}

/**
 * The skeleton: the approaches laid down before the fill, as world points. Validation
 * (D7, D8) measures the real ones; these are what the layout guarantees by construction.
 */
export interface Skeleton {
  /** The low-exposure way in: from outside the breach to the target's back door. */
  corridor: Point2[];
  /** Two ways out: through the breach, and through the gate. */
  exfil: Point2[][];
  /** The target's escape: his building, his vehicle, the gate, the road. */
  escape: Point2[];
  /** The sabotage node within reach of the corridor: the generator. */
  sabotage: Point2;
  /** Where the target spends the mission, inside his building. */
  target: Point2;
}

export interface CampPlan {
  /** The shape of its plot: as first built, long along the gate's axis, wide across it, or small and tight. */
  plot: 'yard' | 'long' | 'wide' | 'tight';
  /** What stands round it: chain link, a wall on the sides facing the ridges, a wall all round, low field walls. */
  perimeter: 'chain' | 'screen' | 'fort' | 'fields' | 'windowed';
  /** How full the yard is: scattered cover, or packed with containers. */
  fill: 'open' | 'packed';
}

/**
 * A camp's plan, from its own stream, by its type's weights. A gorge's yard runs along it, and
 * a scarp's along the foot of its wall; a type with a shape of its own keeps it.
 */
function choosePlan(rng: Rng, type: CompoundTypeSpec, kind: SiteKind | undefined): CampPlan {
  let plot = pickWeighted(rng, type.plots, ['yard', 'long', 'wide', 'tight'] as const);
  if (type.shape === 'yard') {
    if (kind === 'gorge' && plot === 'wide') plot = 'long';
    if (kind === 'scarp' && plot === 'long') plot = 'wide';
  }
  return { plot, perimeter: pickWeighted(rng, type.perimeters, ['chain', 'screen', 'fort', 'fields', 'windowed'] as const), fill: pickWeighted(rng, type.fills, ['open', 'packed'] as const) };
}

export interface CampLayout {
  archetype: CampSpec['archetype'];
  /** What kind of place it is (plots.ts): a yard, a keep, a depot, a farm. */
  type: CompoundType;
  /** How it was planned: the shape of its plot, its perimeter, how full its yard is. */
  plan: CampPlan;
  /** Fence half-sizes along the gate axis (a) and across (b), and the half-size of its yard. */
  halfA: number;
  halfB: number;
  yard: number;
  /** The camp's axes in the world: u toward the gate, v across. */
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  openings: Opening[];
  parcels: Parcel[];
  buildings: BuildingSpec[];
  /** Where its marksmen stand: a tower at a corner, or an upper window (`corner` 'window'), which has the way he looks out of it and whose building it is. */
  towers: Array<{ x: number; z: number; deck: number; corner: string; out?: Point2; building?: number }>;
  breach: Side;
  skeleton: Skeleton;
  /** The loops its patrols walk, in the frame (staffing.ts). */
  loops: PatrolLoop[];
  /** A strip of road through the plot to paint on the ground, if it has one, in the frame. */
  road: Rect | null;
}

declare module './camp' {
  interface Camp {
    /** Generated camps only (absent from Phase 0's test camp): how it was laid out. */
    layout?: CampLayout;
    doors?: DoorSpec[];
    vehicles?: VehicleSpec[];
    ladders?: LadderSpec[];
    /** The generator and what it powers (D5). */
    devices?: DeviceSpec[];
    /** What the mission is for (D5), set once the camp is staffed. */
    objective?: ObjectiveSpec;
    /** Upper floors' windows, stair flights and floors, for the raster and the grid (docs/compound-types.md). */
    windows?: WindowSpec[];
    storeys?: StoreySpec[];
    stairs?: StairSpec[];
  }
}

/**
 * Lays out a compound on its site. Its guards are staffed afterwards, from the layout and
 * the spatial grid (staffing.ts), so the camp comes back with none.
 */
export function buildCompound(rng: Rng, hf: Heightfield, features: TerrainFeatures, colliders: ColliderSet, gen: GenTuning, spec: CampSpec, crux: CruxKind = 'walk', typeName: CompoundType = 'yard'): Camp {
  const C = gen.compound;
  const type = C.types[typeName];
  const M = type.modules;
  const site: Site = features.site;
  const padH = site.height;
  const u = { x: site.ux, z: site.uz };
  const v = { x: -u.z, z: u.x };
  const along = (a: number, b: number): Point2 => ({ x: u.x * a + v.x * b, z: u.z * a + v.z * b });
  const at = (a: number, b: number): Point2 => {
    const d = along(a, b);
    return { x: site.x + d.x, z: site.z + d.z };
  };
  const structures: Structure[] = [];
  const add = (kind: StructureKind, ids: number[]): number => structures.push({ kind, colliders: ids }) - 1;
  const ground = (a: number, b: number): number => {
    const p = at(a, b);
    return Math.min(hf.heightAt(p.x, p.z), padH);
  };
  /** A box aligned with axis (ua, ub) in the camp frame (default: the camp's own axes). */
  const box = (a: number, b: number, lenA: number, lenB: number, h: number, flags: number, surface: Surface, y0?: number, axis?: { a: number; b: number }): number => {
    const p = at(a, b);
    const ax = axis ? along(axis.a, axis.b) : u;
    return colliders.add({ kind: 'box', x: p.x, z: p.z, y0: y0 ?? ground(a, b) - 0.25, y1: (y0 ?? padH) + h, hx: lenA / 2, hz: lenB / 2, ux: ax.x, uz: ax.z, flags, surface });
  };
  const cyl = (a: number, b: number, r: number, h: number, flags: number, surface: Surface, y0 = padH): number => {
    const p = at(a, b);
    return colliders.add({ kind: 'cyl', x: p.x, z: p.z, y0: y0 - 0.3, y1: y0 + h, r, flags, surface });
  };

  // --- The plot: the size of the fence, and which side the breach is on. --------------
  const prng = rng.fork('plot');
  const plan = choosePlan(rng.fork('plan'), type, features.kind);
  const byPlan = plan.plot === 'long' ? [C.plotLong, C.plotNarrow] : plan.plot === 'wide' ? [C.plotNarrow, C.plotLong] : plan.plot === 'tight' ? [C.plotTight, C.plotTight] : [C.fenceHalf, C.fenceHalf];
  // A type with a plot of its own sets its size; otherwise the plan's plot does.
  const [rangeA, rangeB] = type.half[0]! > 0 ? [type.half.slice(0, 2), type.half.slice(2, 4)] : byPlan;
  const HA = prng.between(rangeA!);
  const HB = prng.between(rangeB!);
  // A plot too shallow for the usual yard gets a smaller one, and keeps its parcels. A type sets its heart's size.
  const Y = type.heart > 0 ? type.heart : Math.min(HA, HB) < C.fenceHalf[0]! ? C.yardTight : C.yard;
  const outward: Record<Side, Point2> = { front: along(1, 0), back: along(-1, 0), left: along(0, -1), right: along(0, 1) };
  // The breach faces the ridge it faces most squarely: its gully is the way down toward it.
  // A wall counts for less, and only with a notch in it to come down by.
  const wallBias = rng.fork('breach-wall').range(-0.6, 0.1);
  let breach: Side = 'back';
  let bestFacing = -Infinity;
  for (const side of type.breachSides as Side[]) {
    let facing = -1;
    for (const rd of features.ridges ?? []) {
      if (rd.wall && rd.gullies.length === 0) continue;
      facing = Math.max(facing, outward[side].x * rd.bx + outward[side].z * rd.bz + (rd.wall ? wallBias : 0));
    }
    facing += prng.range(0, 0.15); // near ties go either way
    if (facing > bestFacing) {
      bestFacing = facing;
      breach = side;
    }
  }
  const sideHalf = (side: Side): number => (side === 'front' || side === 'back' ? HB : HA);
  const gateB = prng.range(-0.25, 0.25) * (HB - C.lane - C.road);
  const breachOffset = prng.range(-0.45, 0.45) * (sideHalf(breach) - C.lane - type.breachWidth);
  const openingAt = (side: Side, offset: number): { a: number; b: number } =>
    side === 'front' ? { a: HA, b: offset } : side === 'back' ? { a: -HA, b: offset } : side === 'left' ? { a: offset, b: -HB } : { a: offset, b: HB };
  const openings: Opening[] = [
    { kind: 'gate', side: 'front', ...openingAt('front', gateB), width: type.gateWidth },
    { kind: 'breach', side: breach, ...openingAt(breach, breachOffset), width: type.breachWidth },
  ];

  // --- The plot's shape: its parcels, lanes, lights and further gates (plots.ts). -------
  const L = C.lane;
  const roadB0 = gateB - C.road / 2;
  const roadB1 = gateB + C.road / 2;
  const plot = layOutPlot(type.shape, { C, type, HA, HB, Y, L, gateB, roadB0, roadB1, rng: rng.fork('plot-shape') });
  for (const g of plot.gates) openings.push({ kind: 'gate', ...g });

  // --- The perimeter: chain link blocks movement, not sight or bullets. A wall blocks
  // everything: which sides have one is the plan's, a screen putting them where the ridges are. -
  const solid = new Set<Side>();
  if (plan.perimeter === 'fort' || plan.perimeter === 'windowed') for (const s of ['front', 'back', 'left', 'right'] as const) solid.add(s);
  else if (plan.perimeter === 'screen') {
    let square: Side = 'back';
    let most = -Infinity;
    for (const s of ['front', 'back', 'left', 'right'] as const) {
      for (const rd of features.ridges ?? []) {
        if (rd.wall) continue;
        const facing = outward[s].x * rd.bx + outward[s].z * rd.bz;
        if (facing >= C.wallFacing) solid.add(s);
        if (facing > most) {
          most = facing;
          square = s;
        }
      }
    }
    if (solid.size === 0) solid.add(square);
  }
  // Low walls in runs with gaps between them (a farm's field walls): what a body gets over at a gap, or crawls behind.
  const frng0 = rng.fork('field-walls');
  const hrng = rng.fork('field-wall-heights');
  const fieldWalls = (a0: number, b0: number, a1: number, b1: number) => {
    const len = Math.abs(a1 - a0) + Math.abs(b1 - b0);
    const alongA = Math.abs(a1 - a0) > 0;
    const ids: number[] = [];
    for (let at = frng0.range(0, 5); at < len - 2; ) {
      const runLen = Math.min(frng0.between(C.fieldRun), len - at);
      const f = (at + runLen / 2) / len;
      ids.push(box(a0 + (a1 - a0) * f, b0 + (b1 - b0) * f, alongA ? runLen : 0.5, alongA ? 0.5 : runLen, hrng.chance(C.fieldHighShare) ? C.fieldWallHigh : C.fieldWall, Blocks.All, Surface.Rock));
      at += runLen + frng0.between(C.fieldGap);
    }
    if (ids.length > 0) add('block', ids);
  };
  const fenceRun = (a0: number, b0: number, a1: number, b1: number, wall: boolean) => {
    const len = Math.abs(a1 - a0) + Math.abs(b1 - b0);
    if (len < 0.5) return;
    const pieces = Math.max(1, Math.ceil(len / 8));
    const ids: number[] = [];
    const alongA = Math.abs(a1 - a0) > 0;
    if (wall) {
      const t = 3 * C.wallThickness;
      for (let k = 0; k < pieces; k++) {
        const f = (k + 0.5) / pieces;
        ids.push(box(a0 + (a1 - a0) * f, b0 + (b1 - b0) * f, alongA ? len / pieces : t, alongA ? t : len / pieces, C.wallHeight, Blocks.All, Surface.Rock));
      }
      add('block', ids);
      return;
    }
    for (let k = 0; k < pieces; k++) {
      const t = (k + 0.5) / pieces;
      ids.push(box(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, alongA ? len / pieces : 0.2, alongA ? 0.2 : len / pieces, C.fenceHeight, Blocks.Move, Surface.Metal));
    }
    add('fence', ids);
    const posts: number[] = [];
    for (let k = 0; k <= pieces; k++) {
      const t = k / pieces;
      posts.push(box(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t, 0.16, 0.16, C.fenceHeight + 0.25, Blocks.Move | Blocks.Bullet, Surface.Metal));
    }
    add('post', posts);
  };
  // The windows of a windowed wall: stretches left in chain link, each its own place to see in from.
  const wrng = rng.fork('perimeter-windows');
  const windowsOn = (half: number, gaps: ReadonlyArray<[number, number]>): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    const n = wrng.int(C.windows[0]!, C.windows[1]!);
    for (let k = 0; k < n; k++) {
      const w = wrng.between(C.windowWidth);
      const mid = wrng.range(-half + C.windowMargin + w / 2, half - C.windowMargin - w / 2);
      if ([...gaps, ...out].some(([x0, x1]) => mid + w / 2 + C.windowMargin > x0 && mid - w / 2 - C.windowMargin < x1)) continue;
      out.push([mid - w / 2, mid + w / 2]);
    }
    return out.sort((x, y) => x[0] - y[0]); // unique: windows never overlap
  };
  const side = (s: Side): void => {
    // Each side from corner to corner, with its openings cut out.
    const gaps = openings.filter((o) => o.side === s).map((o) => (s === 'front' || s === 'back' ? [o.b - o.width / 2, o.b + o.width / 2] : [o.a - o.width / 2, o.a + o.width / 2])).sort((x, y) => x[0]! - y[0]!); // unique: openings never overlap
    const half = sideHalf(s);
    let from = -half;
    const wall = solid.has(s);
    const lay = plan.perimeter === 'fields' ? (a0: number, b0: number, a1: number, b1: number) => fieldWalls(a0, b0, a1, b1) : (a0: number, b0: number, a1: number, b1: number, solidHere: boolean) => fenceRun(a0, b0, a1, b1, solidHere);
    const piece = (p: number, q: number, solidHere: boolean) => {
      if (s === 'front') lay(HA, p, HA, q, solidHere);
      else if (s === 'back') lay(-HA, p, -HA, q, solidHere);
      else if (s === 'left') lay(p, -HB, q, -HB, solidHere);
      else lay(p, HB, q, HB, solidHere);
    };
    const windows = plan.perimeter === 'windowed' ? windowsOn(half, gaps as Array<[number, number]>) : [];
    // A stretch of the side between its openings, wall with its windows of chain link where it has them.
    const run = (p: number, q: number) => {
      let at = p;
      for (const [w0, w1] of windows) {
        if (w1 <= at || w0 >= q) continue;
        piece(at, Math.max(at, w0), wall);
        piece(Math.max(at, w0), Math.min(q, w1), false);
        at = Math.min(q, w1);
      }
      piece(at, q, wall);
    };
    for (const [g0, g1] of gaps) {
      run(from, g0!);
      from = g1!;
    }
    run(from, half);
  };
  for (const s of ['front', 'back', 'left', 'right'] as const) side(s);

  // A gate that can be seen into from straight in front of it and nowhere else: two walls run
  // out from its sides, along the way the road leaves it, and the road goes between them.
  if (type.barbican > 0) {
    const road = features.road.points;
    const u0 = along(1, 0);
    const v0 = along(0, 1);
    for (const g of openings) {
      if (g.kind !== 'gate') continue;
      let da = g.side === 'front' ? 1 : -1;
      let db = 0;
      if (g.side === 'front') {
        const here = at(g.a, g.b);
        let first = 0;
        road.forEach((p, k) => {
          if ((p.x - here.x) * (p.x - here.x) + (p.z - here.z) * (p.z - here.z) < (road[first]!.x - here.x) * (road[first]!.x - here.x) + (road[first]!.z - here.z) * (road[first]!.z - here.z)) first = k;
        });
        const out = road.slice(first + 1).find((p) => (p.x - here.x) * (p.x - here.x) + (p.z - here.z) * (p.z - here.z) >= type.barbican * type.barbican);
        if (out) {
          const dx = out.x - here.x;
          const dz = out.z - here.z;
          const len = Math.sqrt(dx * dx + dz * dz);
          const a1 = (dx * u0.x + dz * u0.z) / len;
          const b1 = (dx * v0.x + dz * v0.z) / len;
          if (a1 > 0.5) {
            da = a1;
            db = b1;
          }
        }
      }
      const h = g.width / 2 + 0.3;
      // Each from its gatepost, so there's no slit between the wall and the post to see through.
      const ids = [-1, 1].map((s) => {
        const a = g.a + (da * type.barbican) / 2;
        const b = g.b + s * h + (db * type.barbican) / 2;
        return box(a, b, type.barbican, 0.6, C.wallHeight + 0.25, Blocks.All, Surface.Rock, ground(a, b) - 0.25, { a: da, b: db });
      });
      add('block', ids);
    }
  }

  // --- Watchtowers at the corners, with ladders on their camp side. -------------------
  const trng = rng.fork('towers');
  const corners = plot.corners;
  // Corners away from the breach first, so the way in isn't watched from above by default.
  const away = trng.shuffle(corners.filter((c) => !c.sides.includes(breach)));
  const near = trng.shuffle(corners.filter((c) => c.sides.includes(breach)));
  const towerCount = trng.int(type.towers[0]!, type.towers[1]!);
  const towers: CampLayout['towers'] = [];
  const ladders: LadderSpec[] = [];
  const occupied: Rect[] = [];
  for (const c of [...away, ...near].slice(0, towerCount)) {
    const deckY = padH + C.towerDeck;
    const ids: number[] = [];
    for (const [da, db] of [
      [-1.25, -1.25],
      [1.25, -1.25],
      [-1.25, 1.25],
      [1.25, 1.25],
    ] as const) {
      ids.push(box(c.a + da, c.b + db, 0.25, 0.25, C.towerDeck, Blocks.All, Surface.Wood));
    }
    ids.push(box(c.a, c.b, 3, 3, 0.25, Blocks.All, Surface.Wood, deckY));
    const wallY = deckY + 0.25;
    // The rail on the ladder's side has a gap at the ladder's head, or a climber can't step
    // onto the deck: the rail is too tall to mantle from the top of the ladder.
    const toward = c.a > 0 ? -1 : 1;
    const railPart = (3 - C.ladderGap) / 2;
    for (const side of [1, -1]) ids.push(box(c.a + toward * 1.45, c.b + side * (C.ladderGap / 2 + railPart / 2), 0.1, railPart, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(c.a - toward * 1.45, c.b, 0.1, 3, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(c.a, c.b + 1.45, 3, 0.1, 0.9, Blocks.All, Surface.Wood, wallY));
    ids.push(box(c.a, c.b - 1.45, 3, 0.1, 0.9, Blocks.All, Surface.Wood, wallY));
    for (const [da, db] of [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 1.4],
      [1.4, 1.4],
    ] as const) {
      ids.push(box(c.a + da, c.b + db, 0.12, 0.12, 1.5, Blocks.Move | Blocks.Bullet, Surface.Wood, wallY + 0.9));
    }
    ids.push(box(c.a, c.b, 3.6, 3.6, 0.15, Blocks.All, Surface.Metal, wallY + 2.4));
    add('tower', ids);
    const p = at(c.a, c.b);
    towers.push({ x: p.x, z: p.z, deck: deckY + 0.25, corner: c.name });
    // The ladder on the side toward the camp's middle, along the a axis.
    const foot = at(c.a + toward * 1.6, c.b);
    const out = along(toward, 0);
    ladders.push({ x: foot.x, z: foot.z, y0: ground(c.a + toward * 1.6, c.b), y1: deckY + 0.25, ox: out.x, oz: out.z });
    add('ladder', [box(c.a + toward * 1.55, c.b, 0.08, 0.6, C.towerDeck + 0.25, 0, Surface.Wood)]);
    occupied.push({ a0: c.a - 2.5, a1: c.a + 2.5, b0: c.b - 2.5, b1: c.b + 2.5 });
  }

  // --- The parcels: the plot's own, each filled from a module. --------------------------
  const slots = plot.slots;
  const touches = (slot: SlotName, s: Side): boolean => slots.find((x) => x.slot === slot)!.sides.includes(s);
  const atFront = (slot: SlotName): boolean => touches(slot, 'front');
  const mrng = rng.fork('parcels');
  const free = new Set<SlotName>(slots.map((s) => s.slot));
  const take = (candidates: SlotName[]): SlotName => {
    const open = candidates.filter((c) => free.has(c));
    const pick = open.length > 0 ? mrng.pick(open) : mrng.pick([...free].sort());
    free.delete(pick);
    return pick;
  };
  const names = slots.map((s) => s.slot);
  const breachSlots = names.filter((s) => touches(s, breach) && !atFront(s));
  // Where the target lives: at the breach when the crux wants him reachable (the old skeleton),
  // deep in the camp, away from it, when he's to be buried behind the camp itself.
  const deepSlots = names.filter((s) => !touches(s, breach));
  const farSide: Side = breach === 'left' ? 'right' : breach === 'right' ? 'left' : mrng.chance(0.5) ? 'left' : 'right';
  const assignment: Partial<Record<ModuleName, SlotName>> = {};
  // What the plot pins to a parcel of its own (a keep's hq, a farm's barn) is placed first.
  for (const [module, slot] of Object.entries(plot.pins)) {
    assignment[module as ModuleName] = slot;
    free.delete(slot);
  }
  const pinned = (m: ModuleName): boolean => plot.pins[m] !== undefined;
  if (!pinned('hq')) assignment.hq = take(buried(crux) ? deepSlots : breachSlots);
  if (!pinned('shed')) assignment.shed = take(breachSlots.length > 1 ? breachSlots : names.filter((s) => !atFront(s)));
  if (!pinned('motor-pool')) assignment['motor-pool'] = take(plot.motor);
  if (!pinned('radio')) assignment.radio = take(names.filter((s) => touches(s, farSide)));
  if (!pinned('barracks')) assignment.barracks = take(plot.barracks);
  if (!pinned('mess')) assignment.mess = take(names);
  if (!pinned('storage') && mrng.chance(0.6)) assignment.storage = take(names);
  const parcels: Parcel[] = slots.map((s) => {
    const module = (Object.entries(assignment).find(([, slot]) => slot === s.slot)?.[0] ?? 'cover') as ModuleName;
    return { slot: s.slot, a: (s.a0 + s.a1) / 2, b: (s.b0 + s.b1) / 2, lenA: s.a1 - s.a0, lenB: s.b1 - s.b0, module };
  });

  // --- Modules. -----------------------------------------------------------------------
  const doors: DoorSpec[] = [];
  const buildings: BuildingSpec[] = [];
  const vehicles: VehicleSpec[] = [];
  // Wired once all are placed: every device draws from the camp's one generator.
  const devices: DeviceSpec[] = [];
  const device = (kind: DeviceKind, a: number, b: number, y: number, structure: number) => {
    const p = at(a, b);
    devices.push({ kind, x: p.x, y, z: p.z, structure, feed: -1 });
  };
  const windows: WindowSpec[] = [];
  const campStoreys: StoreySpec[] = [];
  const campStairs: StairSpec[] = [];
  /** The wall facing a direction (unit, in the camp frame): which of a building's four sides. */
  type Face = 'a+' | 'a-' | 'b+' | 'b-';
  const faceToward = (da: number, db: number): Face => (Math.abs(da) >= Math.abs(db) ? (da >= 0 ? 'a+' : 'a-') : db >= 0 ? 'b+' : 'b-');
  /**
   * A hollow building: four walls with doorways on the given faces, and a roof. `lenA` and
   * `lenB` are its extent along the camp's axes. Returns its index in `buildings`.
   */
  /**
   * A second storey: the upper walls with their windows (none over a door), a floor with a
   * stairwell, a straight flight up against a wall (the one the doors leave clear, climbing
   * whichever way leaves them clear), a rail round the well, and a roof. Its floor goes on the
   * grid's list and its flight joins it to the ground (grid.ts). `windowsOn` is the walls that
   * have windows, null for all four.
   */
  const upperStorey = (a: number, b: number, lenA: number, lenB: number, y0: number, surface: Surface, ids: number[], index: number, cutsOf: Record<Face, number[]>, doorFaces: Face[], windowsOn: readonly Face[] | null): number => {
    const S = C.storey;
    const t = C.wallThickness;
    const floor = y0 + S;
    const roofUnder = y0 + 2 * S - C.floorThickness;
    const W = C.upperWindow;
    for (const face of ['a+', 'a-', 'b+', 'b-'] as const) {
      const horizontal = face === 'a+' || face === 'a-';
      const wa = face === 'a+' ? a + lenA / 2 - t / 2 : face === 'a-' ? a - lenA / 2 + t / 2 : a;
      const wb = face === 'b+' ? b + lenB / 2 - t / 2 : face === 'b-' ? b - lenB / 2 + t / 2 : b;
      const span = horizontal ? lenB : lenA;
      const count = windowsOn && !windowsOn.includes(face) ? 0 : Math.max(1, Math.floor(span / W.every));
      const cuts: number[] = [];
      for (let k = 0; k < count; k++) {
        const c = ((k + 0.5) / count - 0.5) * span;
        if (cutsOf[face].every((d) => Math.abs(d - c) > W.width / 2 + C.doorWidth / 2 + 0.5)) cuts.push(c);
      }
      const piece = (p: number, q: number, yb: number, yt: number) => {
        if (q - p < 0.05 || yt - yb < 0.05) return;
        const mid = (p + q) / 2;
        if (horizontal) ids.push(box(wa, b + mid, t, q - p, yt - yb, Blocks.All, surface, yb));
        else ids.push(box(a + mid, wb, q - p, t, yt - yb, Blocks.All, surface, yb));
      };
      let from = -span / 2;
      for (const c of cuts) {
        piece(from, c - W.width / 2, floor, roofUnder);
        piece(c - W.width / 2, c + W.width / 2, floor, floor + W.sill);
        piece(c - W.width / 2, c + W.width / 2, floor + W.head, roofUnder);
        const p = horizontal ? at(wa, b + c) : at(a + c, wb);
        const runs = horizontal ? along(0, 1) : along(1, 0);
        windows.push({ x: p.x, z: p.z, ux: runs.x, uz: runs.z, width: W.width, sill: floor + W.sill, head: floor + W.head, top: roofUnder, building: index });
        from = c + W.width / 2;
      }
      piece(from, span / 2, floor, roofUnder);
    }
    // The flight: along the building's long axis, against the long wall its doors leave clear.
    const T = C.stairs;
    const longA = lenA >= lenB;
    const halfLong = (longA ? lenA : lenB) / 2;
    const halfShort = (longA ? lenB : lenA) / 2;
    const steps = Math.max(1, Math.round(S / T.rise));
    const rise = S / steps;
    const run = steps * T.tread;
    const wallPlus: Face = longA ? 'b+' : 'a+';
    const wallMinus: Face = longA ? 'b-' : 'a-';
    const order = doorFaces[0] === wallPlus ? [-1, 1] : [1, -1];
    let sign = order[0]!;
    let dir = 1;
    let foundPlace = false;
    for (const sg of order) {
      const cuts = cutsOf[sg > 0 ? wallPlus : wallMinus];
      for (const d of [1, -1]) {
        const startAt = d > 0 ? -halfLong + t + 1.4 : halfLong - t - 1.4;
        const centre = startAt + (d * run) / 2;
        if (!foundPlace && cuts.every((c) => Math.abs(c - centre) > run / 2 + C.doorWidth / 2 + 0.6)) {
          sign = sg;
          dir = d;
          foundPlace = true;
        }
      }
    }
    // The flight starts a body's turning room from the end wall: its foot stands in that gap.
    const start = dir > 0 ? -halfLong + t + 1.4 : halfLong - t - 1.4;
    const across = sign * (halfShort - t - T.width / 2);
    /** A point of the building in the frame: `al` along its long axis, `ac` across it. */
    const frame = (al: number, ac: number): [number, number] => (longA ? [a + al, b + ac] : [a + ac, b + al]);
    for (let k = 0; k < steps; k++) {
      const [ta, tb] = frame(start + dir * (k + 0.5) * T.tread, across);
      const [la, lb] = longA ? [T.tread, T.width] : [T.width, T.tread];
      ids.push(box(ta, tb, la, lb, (k + 1) * rise + 0.25, Blocks.All, Surface.Wood, y0 - 0.25));
    }
    // The floor, with a hole for the flight: three slabs round it.
    const end = start + dir * run;
    const holeMin = Math.min(start, end);
    const holeMax = Math.max(start, end);
    const wallIn = sign * (halfShort - t);
    const holeIn = sign * (halfShort - t - T.width - 0.2);
    const slab = (al0: number, al1: number, ac0: number, ac1: number) => {
      if (al1 - al0 < 0.05 || Math.abs(ac1 - ac0) < 0.05) return;
      const [ca, cb] = frame((al0 + al1) / 2, (ac0 + ac1) / 2);
      const [la, lb] = longA ? [al1 - al0, Math.abs(ac1 - ac0)] : [Math.abs(ac1 - ac0), al1 - al0];
      ids.push(box(ca, cb, la, lb, C.floorThickness, Blocks.All, surface, floor - C.floorThickness));
    };
    const edge = -(halfShort - t);
    slab(-halfLong + t, holeMin, -(halfShort - t), halfShort - t);
    slab(holeMax, halfLong - t, -(halfShort - t), halfShort - t);
    slab(holeMin, holeMax, sign * edge, holeIn);
    // A rail along the open side of the well, and across its foot end: the head end is the way off.
    const railPiece = (al0: number, al1: number, ac0: number, ac1: number) => {
      if (Math.abs(al1 - al0) < 0.05 && Math.abs(ac1 - ac0) < 0.05) return;
      const [ca, cb] = frame((al0 + al1) / 2, (ac0 + ac1) / 2);
      const thin = 0.08;
      const lenAl = Math.max(thin, Math.abs(al1 - al0));
      const lenAc = Math.max(thin, Math.abs(ac1 - ac0));
      const [la, lb] = longA ? [lenAl, lenAc] : [lenAc, lenAl];
      ids.push(box(ca, cb, la, lb, C.rail, Blocks.All, Surface.Wood, floor));
    };
    railPiece(holeMin, holeMax, holeIn, holeIn);
    railPiece(start, start, wallIn, holeIn);
    // The roof over it all.
    ids.push(box(a, b, lenA + 0.3, lenB + 0.3, C.floorThickness, Blocks.All, surface, roofUnder));
    // On the grid's list: the floor's footprint, and the flight from its foot to its head.
    const corners = [at(a - lenA / 2, b - lenB / 2), at(a + lenA / 2, b - lenB / 2), at(a - lenA / 2, b + lenB / 2), at(a + lenA / 2, b + lenB / 2)];
    const margin = 0.5;
    const storey = campStoreys.length;
    campStoreys.push({ minX: Math.min(...corners.map((c) => c.x)) - margin, minZ: Math.min(...corners.map((c) => c.z)) - margin, maxX: Math.max(...corners.map((c) => c.x)) + margin, maxZ: Math.max(...corners.map((c) => c.z)) + margin, y: floor });
    const [footA, footB] = frame(start - dir * 0.8, across);
    const [headA, headB] = frame(end + dir * 0.6, across);
    const footP = at(footA, footB);
    const headP = at(headA, headB);
    campStairs.push({ storey, footX: footP.x, footZ: footP.z, headX: headP.x, headZ: headP.z, length: run + 1.4 });
    return storey;
  };
  const building = (module: ModuleName, a: number, b: number, lenA: number, lenB: number, h: number, surface: Surface, faces: Face[], doorRng: Rng, doorWidth = C.doorWidth, storeys = 1, windowsOn: readonly Face[] | null = null): number => {
    const t = C.wallThickness;
    const y0 = ground(a, b);
    // A two-storey building: its ground floor's walls are one storey high, and the upper floor stands on them.
    const two = storeys >= 2;
    const wallH = two ? C.storey : h;
    const cutsOf: Record<Face, number[]> = { 'a+': [], 'a-': [], 'b+': [], 'b-': [] };
    const ids: number[] = [];
    const index = buildings.length;
    const myDoors: number[] = [];
    const wall = (face: Face) => {
      const horizontal = face === 'a+' || face === 'a-'; // a wall across b, at the a extreme
      const wa = face === 'a+' ? a + lenA / 2 - t / 2 : face === 'a-' ? a - lenA / 2 + t / 2 : a;
      const wb = face === 'b+' ? b + lenB / 2 - t / 2 : face === 'b-' ? b - lenB / 2 + t / 2 : b;
      const span = horizontal ? lenB : lenA;
      const doorsHere = faces.filter((f) => f === face).length;
      const cuts: number[] = [];
      for (let k = 0; k < doorsHere; k++) cuts.push(((k + 1) / (doorsHere + 1) - 0.5) * span + doorRng.range(-0.12, 0.12) * span);
      cuts.sort((x, y) => x - y); // unique: doors are spread along the wall
      cutsOf[face] = cuts;
      let from = -span / 2;
      const piece = (p: number, q: number) => {
        if (q - p < 0.05) return;
        const mid = (p + q) / 2;
        // From under the ground to the roof's underside.
        if (horizontal) ids.push(box(wa, b + mid, t, q - p, wallH + 0.25, Blocks.All, surface, y0 - 0.25));
        else ids.push(box(a + mid, wb, q - p, t, wallH + 0.25, Blocks.All, surface, y0 - 0.25));
      };
      for (const c of cuts) {
        piece(from, c - doorWidth / 2);
        // The lintel over the doorway: it roofs the doorway, and stops sight above it.
        if (horizontal) ids.push(box(wa, b + c, t, doorWidth, wallH - C.doorHeight, Blocks.All, surface, y0 + C.doorHeight));
        else ids.push(box(a + c, wb, doorWidth, t, wallH - C.doorHeight, Blocks.All, surface, y0 + C.doorHeight));
        const p = horizontal ? at(wa, b + c) : at(a + c, wb);
        const runs = horizontal ? along(0, 1) : along(1, 0);
        const inward = along(face === 'a+' ? -1 : face === 'a-' ? 1 : 0, face === 'b+' ? -1 : face === 'b-' ? 1 : 0);
        myDoors.push(doors.length);
        doors.push({ x: p.x, y: y0, z: p.z, width: doorWidth, height: C.doorHeight, ux: runs.x, uz: runs.z, nx: inward.x, nz: inward.z, building: index, open: true });
        from = c + doorWidth / 2;
      }
      piece(from, span / 2);
    };
    for (const f of ['a+', 'a-', 'b+', 'b-'] as const) wall(f);
    // The roof: over the walls, so the inside is roofed and walkable. Two storeys: the upper floor, stairs and windows first.
    const storey = two ? upperStorey(a, b, lenA, lenB, y0, surface, ids, index, cutsOf, faces, windowsOn) : -1;
    if (!two) ids.push(box(a, b, lenA + 0.3, lenB + 0.3, 0.2, Blocks.All, surface, y0 + h));
    const structure = add('building', ids);
    const p = at(a, b);
    const len = lenA >= lenB ? along(1, 0) : along(0, 1);
    buildings.push({ module, x: p.x, z: p.z, ux: len.x, uz: len.z, length: Math.max(lenA, lenB), depth: Math.min(lenA, lenB), height: two ? 2 * C.storey : h, storeys, floorY: two ? y0 + C.storey : 0, storey, doors: myDoors, structure });
    occupied.push({ a0: a - lenA / 2 - 1.5, a1: a + lenA / 2 + 1.5, b0: b - lenB / 2 - 1.5, b1: b + lenB / 2 + 1.5 });
    return index;
  };
  /** Where in a slot a module of size (len × depth) goes, its long side along the slot's, nudged off centre. */
  const fit = (s: (typeof slots)[number], len: number, depth: number, frng: Rng): { a: number; b: number; lenA: number; lenB: number } => {
    const sa = s.a1 - s.a0;
    const sb = s.b1 - s.b0;
    const [lenA, lenB] = sa >= sb ? [Math.min(len, sa - 2), Math.min(depth, sb - 2)] : [Math.min(depth, sa - 2), Math.min(len, sb - 2)];
    return {
      a: (s.a0 + s.a1) / 2 + frng.range(-0.3, 0.3) * Math.max(0, sa - lenA - 2),
      b: (s.b0 + s.b1) / 2 + frng.range(-0.3, 0.3) * Math.max(0, sb - lenB - 2),
      lenA,
      lenB,
    };
  };
  const slotOf = (name: SlotName) => slots.find((s) => s.slot === name)!;
  /** The face of a box at (a, b) that looks toward the plot's heart. */
  const inwardFace = (a: number, b: number): Face => {
    const d = plot.inward(a, b);
    return faceToward(d.x, d.z);
  };

  // The target's building: a front door toward the yard and a back door toward the breach.
  const hq = assignment.hq!;
  const hqRng = rng.fork('hq');
  const hqFit = fit(slotOf(hq), M.hq[0]!, M.hq[1]!, hqRng);
  const backFace = faceToward(outward[breach].x * u.x + outward[breach].z * u.z, outward[breach].x * v.x + outward[breach].z * v.z);
  // Where the crux is the way in, a second door gives the way in somewhere to go. Where it
  // isn't, his one door is held (staffing), so nobody just walks in. Deep in the camp, the
  // wall toward the yard and the wall toward the breach are often the same one: the second
  // door then goes in the side wall nearer the breach, so the two are different ways in.
  const yardFace = inwardFace(hqFit.a, hqFit.b);
  const sideFace: Face = yardFace === 'a+' || yardFace === 'a-' ? (openings[1]!.b >= hqFit.b ? 'b+' : 'b-') : openings[1]!.a >= hqFit.a ? 'a+' : 'a-';
  const hqFaces: Face[] = !needsWayIn(crux) ? [yardFace] : [yardFace, buried(crux) && backFace === yardFace ? sideFace : backFace];
  // A buried target keeps on the upper floor where there is one, and a window up there shows him
  // to whoever finds the line through it: a ridge, or the fields beyond the wire, far enough out
  // to see over the sill. Measured with windows all round, a firing point had such a line on 8
  // camps of 20 and the ground beyond the wire on 11 more, and every one of them was the same
  // mission: find the window. With one window left for a marksman, and the target kept out of
  // its line, the ground beyond the wire still had him on 2 of 8. So his floor has none: he is
  // as buried as he was on one storey, and what shows of his building is that it stands tall
  // and blank where the others have windows.
  const hqWindows: readonly Face[] | null = buried(crux) ? [] : null;
  const hqIndex = building('hq', hqFit.a, hqFit.b, hqFit.lenA, hqFit.lenB, M.hq[2]!, Surface.Wood, hqFaces, hqRng, C.doorWidth, type.storeys.hq, hqWindows);
  const hqB = buildings[hqIndex]!;
  // A buried target's doors have screens: a short wall just inside each, so nobody gets a
  // straight line to him through the door from the yard. To reach him you step inside. A
  // screen stops short of the room's side walls, so there is always a way round it. Where his
  // building has an upper floor he keeps up there and the floor is what buries him: its doors
  // are left to show the room below, and the stairs.
  if (buried(crux) && hqB.storeys < 2) {
    const screens: number[] = [];
    for (const di of hqB.doors) {
      const d = doors[di]!;
      const f = toFrame(d.x + d.nx * C.screenDepth, d.z + d.nz * C.screenDepth);
      const alongA = Math.abs(d.ux * u.x + d.uz * u.z) > 0.5;
      const mid = alongA ? hqFit.a : hqFit.b;
      const half = (alongA ? hqFit.lenA : hqFit.lenB) / 2 - C.wallThickness - C.screenGap;
      const reach = C.doorWidth / 2 + C.screenWing;
      const from = Math.max((alongA ? f.x : f.z) - reach, mid - half);
      const to = Math.min((alongA ? f.x : f.z) + reach, mid + half);
      if (to - from < C.doorWidth) continue;
      const centre = (from + to) / 2;
      screens.push(alongA ? box(centre, f.z, to - from, C.wallThickness, M.hq[2]!, Blocks.All, Surface.Wood) : box(f.x, centre, C.wallThickness, to - from, M.hq[2]!, Blocks.All, Surface.Wood));
    }
    add('block', screens);
  }

  // The barracks, the mess and the storage shed.
  for (const [module, size, surface, doorsWanted] of [
    ['barracks', M.barracks, Surface.Wood, 2],
    ['mess', M.mess, Surface.Wood, 2],
    ['storage', M.storage, Surface.Metal, 1],
  ] as const) {
    const slot = assignment[module];
    if (!slot) continue;
    const brng = rng.fork(module);
    const f = fit(slotOf(slot), size[0]!, size[1]!, brng);
    const face = inwardFace(f.a, f.b);
    const faces: Face[] = doorsWanted === 2 ? [face, f.lenA >= f.lenB ? (f.b > 0 ? 'b-' : 'b+') : f.a > 0 ? 'a-' : 'a+'] : [face];
    building(module, f.a, f.b, f.lenA, f.lenB, size[2]!, surface, faces, brng, module === 'storage' ? C.doorWidth * 2 : C.doorWidth, type.storeys[module]);
  }

  // The radio room, and its mast beside it.
  const radioRng = rng.fork('radio');
  const rf = fit(slotOf(assignment.radio!), M.radio[0]! + 4, M.radio[1]!, radioRng);
  const radioA = rf.lenA >= rf.lenB ? rf.a - 2 : rf.a;
  const radioB = rf.lenA >= rf.lenB ? rf.b : rf.b - 2;
  const radioLenA = rf.lenA >= rf.lenB ? rf.lenA - 4 : rf.lenA;
  const radioLenB = rf.lenA >= rf.lenB ? rf.lenB : rf.lenB - 4;
  // Marksmen at the upper windows of its two-storey buildings, so height isn't only the towers: the
  // target's building first, its window toward the gate, then each other, its window toward the wall nearest it.
  {
    const gateAt = at(openings[0]!.a, openings[0]!.b);
    const best = (b: (typeof buildings)[number], index: number, toward: (w: (typeof windows)[number]) => Point2): { x: number; z: number; nx: number; nz: number; score: number } | null => {
      let top: { x: number; z: number; nx: number; nz: number; score: number } | null = null;
      for (const w of windows) {
        if (w.building !== index) continue;
        // Out of the window: across its wall, away from the middle of the building.
        const side = (w.x - b.x) * -w.uz + (w.z - b.z) * w.ux >= 0 ? 1 : -1;
        const nx = -w.uz * side;
        const nz = w.ux * side;
        const t = toward(w);
        const tl = Math.sqrt(t.x * t.x + t.z * t.z) || 1;
        const score = nx * (t.x / tl) + nz * (t.z / tl);
        // A pace back from the sill: he sees out of it, and is seen through it and from nowhere else.
        if (!top || score > top.score) top = { x: w.x - nx * 0.9, z: w.z - nz * 0.9, nx, nz, score };
      }
      return top;
    };
    // On a camp where someone has to get to him, his own floor stays clear of them: a way up has to
    // exist. And a floor he's buried on has no window for anyone to stand at.
    const twoFloors = buildings.map((b, index) => ({ b, index })).filter(({ b, index }) => b.storeys >= 2 && (index !== hqIndex || !needsWayIn(crux))).sort((p, q) => (p.index === hqIndex ? -1 : q.index === hqIndex ? 1 : p.index - q.index)); // unique: building indices
    let left = type.windowPost;
    for (const { b, index } of twoFloors) {
      if (left <= 0) break;
      const here = index === hqIndex ? best(b, index, (w) => ({ x: gateAt.x - w.x, z: gateAt.z - w.z })) : best(b, index, (w) => {
        const f = toFrame(w.x, w.z);
        const toEdge = HA - Math.abs(f.x) < HB - Math.abs(f.z) ? along(Math.sign(f.x) || 1, 0) : along(0, Math.sign(f.z) || 1);
        return toEdge;
      });
      if (!here) continue;
      towers.push({ x: here.x, z: here.z, deck: b.floorY, corner: 'window', out: { x: here.nx, z: here.nz }, building: index });
      left--;
    }
  }
  building('radio', radioA, radioB, radioLenA, radioLenB, M.radio[2]!, Surface.Wood, [inwardFace(radioA, radioB)], radioRng);
  // The set against the room's far wall from its door; its antenna is the mast outside.
  const radioDoor = doors[doors.length - 1]!;
  const setW = { x: radioDoor.x + radioDoor.nx * (Math.min(radioLenA, radioLenB) - 1.2), z: radioDoor.z + radioDoor.nz * (Math.min(radioLenA, radioLenB) - 1.2) };
  const setF = toFrame(setW.x, setW.z);
  device('radio', setF.x, setF.z, ground(setF.x, setF.z) + 1.0, add('radio', [box(setF.x, setF.z, 0.8, 0.5, 1.0, Blocks.All, Surface.Metal)]));

  // The generator's shed: a roof on four posts, the generator under it.
  const shedRng = rng.fork('shed');
  const sf = fit(slotOf(assignment.shed!), M.shed[0]!, M.shed[1]!, shedRng);
  // Toward the breach side of its slot, so the corridor reaches it.
  const toBreach = { a: outward[breach].x * u.x + outward[breach].z * u.z, b: outward[breach].x * v.x + outward[breach].z * v.z };
  const shedA = sf.a + toBreach.a * Math.max(0, (slotOf(assignment.shed!).a1 - slotOf(assignment.shed!).a0 - sf.lenA) / 2 - 1);
  const shedB = sf.b + toBreach.b * Math.max(0, (slotOf(assignment.shed!).b1 - slotOf(assignment.shed!).b0 - sf.lenB) / 2 - 1);
  const shedIds: number[] = [];
  for (const [da, db] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    shedIds.push(box(shedA + (da * sf.lenA) / 2, shedB + (db * sf.lenB) / 2, 0.15, 0.15, M.shed[2]!, Blocks.Move | Blocks.Bullet, Surface.Wood));
  }
  shedIds.push(box(shedA, shedB, sf.lenA + 0.4, sf.lenB + 0.4, 0.15, Blocks.All, Surface.Metal, ground(shedA, shedB) + M.shed[2]!));
  add('shed', shedIds);
  device('generator', shedA, shedB, ground(shedA, shedB) + 0.75, add('generator', [box(shedA, shedB, 2.2, 1.2, 1.5, Blocks.All, Surface.Metal)]));
  occupied.push({ a0: shedA - sf.lenA / 2 - 1.5, a1: shedA + sf.lenA / 2 + 1.5, b0: shedB - sf.lenB / 2 - 1.5, b1: shedB + sf.lenB / 2 + 1.5 });

  // The motor pool: the escape vehicle facing the road, and a truck beside it.
  const vrng = rng.fork('vehicles');
  const pool = slotOf(assignment['motor-pool']!);
  const poolA = (pool.a0 + pool.a1) / 2;
  const poolB = (pool.b0 + pool.b1) / 2;
  const facingGate = along(1, 0);
  const vehicle = (kind: VehicleSpec['kind'], a: number, b: number, escape: boolean, axis: Point2) => {
    const p = at(a, b);
    const [length, width, height] = kind === 'truck' ? [6.5, 2.5, 2.9] : [4.4, 1.9, 1.9];
    vehicles.push({ kind, x: p.x, y: ground(a, b), z: p.z, fx: axis.x, fz: axis.z, length, width, height, escape });
    occupied.push({ a0: a - 4, a1: a + 4, b0: b - 3, b1: b + 3 });
  };
  const jeepB = poolB + (poolB > gateB ? -1 : 1) * Math.min(4, Math.abs(pool.b1 - pool.b0) / 4);
  vehicle('jeep', poolA + vrng.range(-2, 2), jeepB, true, facingGate);
  vehicle('truck', poolA + vrng.range(-2, 2), jeepB + (poolB > gateB ? 1 : -1) * 6.5, false, facingGate);

  // --- Fixtures: light poles round the yard, alarm boxes at the gate and by buildings. --
  const frng = rng.fork('fixtures');
  const gate = openings[0]!;
  const lightSpots = plot.lights;
  const lightCount = frng.int(C.lights[0]!, C.lights[1]!);
  for (const p of frng.shuffle(lightSpots).slice(0, lightCount)) {
    device('light', p.x, p.z, padH + 6.9, add('light', [cyl(p.x, p.z, 0.12, 7, Blocks.Move | Blocks.Bullet, Surface.Metal), box(p.x, p.z, 0.8, 0.4, 0.25, Blocks.All, Surface.Metal, padH + 6.8)]));
    occupied.push({ a0: p.x - 1, a1: p.x + 1, b0: p.z - 1, b1: p.z + 1 });
  }
  function toFrame(x: number, z: number): Point2 {
    const dx = x - site.x;
    const dz = z - site.z;
    return { x: dx * u.x + dz * u.z, z: dx * v.x + dz * v.z };
  }

  // --- The skeleton's points, then cover along the corridor and around the yard. ------
  const breachOpening = openings[1]!;
  const out = outward[breach];
  const breachW = at(breachOpening.a, breachOpening.b);
  const backDoor = doors[hqB.doors[1] ?? hqB.doors[0]!]!;
  const frontDoor = doors[hqB.doors[0]!]!;
  const outside = (p: Point2, d: number): Point2 => ({ x: p.x + out.x * d, z: p.z + out.z * d });
  const doorStep = (d: DoorSpec, k: number): Point2 => ({ x: d.x - d.nx * k, z: d.z - d.nz * k });
  const hqCentre = { x: hqB.x, z: hqB.z };
  const escapeVehicle = vehicles.find((ve) => ve.escape)!;
  const gateW = at(gate.a, gate.b);
  const skeleton: Skeleton = {
    corridor: [outside(breachW, 30), outside(breachW, 4), breachW, outside(breachW, -C.lane), doorStep(backDoor, 2), { x: backDoor.x, z: backDoor.z }],
    exfil: [
      [{ x: backDoor.x, z: backDoor.z }, outside(breachW, -C.lane), breachW, outside(breachW, 60)],
      [{ x: frontDoor.x, z: frontDoor.z }, doorStep(frontDoor, 3), gateW, { x: gateW.x + u.x * 60, z: gateW.z + u.z * 60 }],
    ],
    escape: [hqCentre, doorStep(frontDoor, 2), { x: escapeVehicle.x, z: escapeVehicle.z }, gateW, { x: gateW.x + u.x * 80, z: gateW.z + u.z * 80 }],
    sabotage: at(shedA, shedB),
    target: hqCentre,
  };

  const crng = rng.fork('cover');
  const packed = plan.fill === 'packed';
  const placeCover = (a: number, b: number, crngLocal: Rng, low: boolean): boolean => {
    const kind = low ? (crngLocal.chance(0.5) ? 'sandbags' : 'crate') : crngLocal.pick(packed ? (['container', 'container', 'container', 'crate'] as const) : (['container', 'container', 'crate', 'sandbags'] as const));
    const turn = crngLocal.chance(0.5);
    const [lenA, lenB] = kind === 'container' ? (turn ? [6.06, 2.44] : [2.44, 6.06]) : kind === 'sandbags' ? (turn ? [4, 0.8] : [0.8, 4]) : [1.2, 1.2];
    const r: Rect = { a0: a - lenA / 2 - 1.2, a1: a + lenA / 2 + 1.2, b0: b - lenB / 2 - 1.2, b1: b + lenB / 2 + 1.2 };
    if (!inside(r) || occupied.some((o) => overlaps(o, r)) || plot.clear.some((c) => overlaps(r, c))) return false;
    occupied.push({ a0: a - lenA / 2 - 0.4, a1: a + lenA / 2 + 0.4, b0: b - lenB / 2 - 0.4, b1: b + lenB / 2 + 0.4 });
    if (kind === 'container') {
      const ids = [box(a, b, lenA, lenB, 2.59, Blocks.All, Surface.Metal)];
      if (crngLocal.chance(0.35)) ids.push(box(a, b, lenA, lenB, 2.59, Blocks.All, Surface.Metal, padH + 2.59));
      add('container', ids);
    } else if (kind === 'sandbags') add('sandbags', [box(a, b, lenA, lenB, 0.95, Blocks.All, Surface.Dirt)]);
    else {
      const ids = [box(a, b, 1.2, 1.2, 1.2, Blocks.All, Surface.Wood)];
      if (crngLocal.chance(0.4)) ids.push(box(a + 1.4, b + crngLocal.range(-0.3, 0.3), 1.2, 1.2, 1.2, Blocks.All, Surface.Wood));
      add('crate', ids);
    }
    return true;
  };
  const inside = (r: Rect): boolean => r.a0 > -HA + L - 1 && r.a1 < HA - L + 1 && r.b0 > -HB + L - 1 && r.b1 < HB - L + 1;
  // Low cover along the corridor, inside the fence: crates and sandbags to move between.
  const cc = crng.int(C.corridorCover[0]!, C.corridorCover[1]!);
  const inA = toFrame(skeleton.corridor[3]!.x, skeleton.corridor[3]!.z);
  const doorA = toFrame(backDoor.x - backDoor.nx * 2, backDoor.z - backDoor.nz * 2);
  for (let k = 0, tries = 0; k < cc && tries < 40; tries++) {
    const t = (k + 0.5) / cc + crng.range(-0.08, 0.08);
    const sideStep = crng.range(1.8, 3.2) * (crng.chance(0.5) ? 1 : -1);
    const da = doorA.x - inA.x;
    const db = doorA.z - inA.z;
    const len = Math.max(1e-6, Math.sqrt(da * da + db * db));
    if (placeCover(inA.x + da * t - (db / len) * sideStep, inA.z + db * t + (da / len) * sideStep, crng, true)) k++;
  }
  // Clusters round the yard and in the spare parcels.
  const coverRange = packed ? C.coverPacked : C.cover;
  const cover = crng.int(coverRange[0]!, coverRange[1]!);
  const coverTries = packed ? 600 : 200;
  for (let k = 0, tries = 0; k < cover && tries < coverTries; tries++) {
    const spare = parcels.filter((p) => p.module === 'cover');
    const p = spare.length > 0 && crng.chance(0.5) ? crng.pick(spare) : null;
    const a = p ? p.a + crng.range(-0.4, 0.4) * p.lenA : crng.range(-HA + L + 2, HA - L - 2);
    const b = p ? p.b + crng.range(-0.4, 0.4) * p.lenB : crng.range(-HB + L + 2, HB - L - 2);
    if (placeCover(a, b, crng, false)) k++;
  }
  // Sandbags at the gate.
  placeCover(gate.a - 3, gate.b - gate.width / 2 - 2.5, crng, true);
  placeCover(gate.a - 3, gate.b + gate.width / 2 + 2.5, crng, true);

  const layout: CampLayout = {
    archetype: spec.archetype,
    type: typeName,
    plan,
    halfA: HA,
    halfB: HB,
    yard: Y,
    ux: u.x,
    uz: u.z,
    vx: v.x,
    vz: v.z,
    openings,
    parcels,
    buildings,
    towers,
    breach,
    skeleton,
    loops: plot.loops,
    road: plot.road,
  };
  const generator = devices.findIndex((d) => d.kind === 'generator');
  for (const d of devices) d.feed = d.kind === 'generator' ? -1 : generator;
  return { site, structures, guards: [], fenceHalf: Math.max(HA, HB), layout, doors, vehicles, ladders, devices, crux, windows, storeys: campStoreys, stairs: campStairs };
}

/**
 * The fixtures validation asks about, placed by the perches' viewsheds once the raster knows
 * where everything stands (D8). What a shooter on a perch can reach, he can silence, so the
 * antenna and the alarm boxes go where the fewest overviews can see them: on the walls of
 * buildings, clear of their doors, or indoors if no wall will do. They're too small to
 * change what the grid and the raster say about the camp. And the target's vehicle is
 * parked where his run to it is hidden from the best overview and shown to another perch.
 */
export function placeFixtures(camp: Camp, colliders: ColliderSet, hf: Heightfield, R: Raster, perches: PerchViews, gen: GenTuning, rng: Rng): void {
  const C = gen.compound;
  const hfHeight = (x: number, z: number): number => hf.heightAt(x, z);
  const L = camp.layout!;
  const padH = camp.site.height;
  const doors = camp.doors ?? [];
  const devices = camp.devices ?? (camp.devices = []);
  const generator = devices.findIndex((d) => d.kind === 'generator');
  /** How many perches (of `among`, or all) see height y at a point. */
  const seenBy = (x: number, y: number, z: number, among: readonly Float32Array[] = perches.views): number => {
    const c = cellOf(R, x, z);
    if (c < 0) return among.length;
    let n = 0;
    for (const v of among) if (y >= v[c]!) n++;
    return n;
  };
  // The perches that overlook most of the camp: a fixture hides from them first.
  const overviews = overviewPerches(R, perches.views, L.halfA, L.halfB, gen);
  const strong = perches.views.filter((_, i) => overviews[i]);
  const inside: number[] = [];
  for (let c = 0; c < R.na * R.nb; c++) {
    if (!R.walk[c]) continue;
    const i = c % R.na;
    const j = (c - i) / R.na;
    const a = R.a0 + (i + 0.5) * R.cell;
    const b = R.b0 + (j + 0.5) * R.cell;
    if (Math.abs(a) <= L.halfA - 1 && Math.abs(b) <= L.halfB - 1) inside.push(c);
  }
  interface WallSpot {
    x: number;
    z: number;
    seen: number;
    building: number;
  }
  /** Four spots along each of a building's walls, just off it and clear of its doors. */
  const wallSpots = (index: number, height: number): WallSpot[] => {
    const bd = L.buildings[index]!;
    const out: WallSpot[] = [];
    const vx = -bd.uz;
    const vz = bd.ux;
    const faces = [
      { nx: bd.ux, nz: bd.uz, half: bd.length / 2, tx: vx, tz: vz, span: bd.depth },
      { nx: -bd.ux, nz: -bd.uz, half: bd.length / 2, tx: vx, tz: vz, span: bd.depth },
      { nx: vx, nz: vz, half: bd.depth / 2, tx: bd.ux, tz: bd.uz, span: bd.length },
      { nx: -vx, nz: -vz, half: bd.depth / 2, tx: bd.ux, tz: bd.uz, span: bd.length },
    ];
    for (const f of faces) {
      for (const along of [-3, -1, 1, 3].map((k) => (k * f.span) / 8)) {
        const x = bd.x + f.nx * (f.half + 0.3) + f.tx * along;
        const z = bd.z + f.nz * (f.half + 0.3) + f.tz * along;
        if (doors.some((d) => (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z) < C.fixtureDoorGap * C.fixtureDoorGap)) continue;
        out.push({ x, z, seen: seenBy(x, height, z, strong) * perches.views.length + seenBy(x, height, z), building: index });
      }
    }
    return out;
  };
  // The fewest perches first; among equals, the order the fork shuffles them into.
  const hiddenFirst = (spots: WallSpot[], fork: Rng): WallSpot[] => {
    const shuffled = fork.shuffle(spots).map((w, order) => ({ w, order }));
    shuffled.sort((p, q) => p.w.seen - q.w.seen || p.order - q.order); // unique: each spot's place in the shuffle
    return shuffled.map((p) => p.w);
  };
  // --- The escape (Hitman's exploit: a camper triggers the evacuation and shoots the target
  // on the run). His vehicle waits near a door of his building, on a spot where his run to it
  // is out of the best overview's sight and in another perch's. The run is what a perch must
  // see to stop him: the vehicle is fast, and a bullet won't stop it.
  {
    const groundSeen = (v: Float32Array): number => {
      let n = 0;
      for (const c of inside) if (R.ground[c]! + gen.sight.chest >= v[c]!) n++;
      return n;
    };
    // The best overview, and those within a whisker of it (the second raster can reorder near-equals).
    const seenGround = perches.views.map(groundSeen);
    const mostGround = Math.max(...seenGround);
    const overview = seenGround.map((g, i) => (g >= mostGround * 0.97 ? i : -1)).filter((i) => i >= 0);
    const hq = L.buildings.find((b) => b.module === 'hq');
    const jeep = (camp.vehicles ?? []).find((ve) => ve.escape);
    const skeleton = L.skeleton;
    if (hq && jeep && perches.views.length > 0) {
      const forward = { x: L.ux, z: L.uz };
      const runSeconds = (view: Float32Array, a: Point2, b: Point2): number => {
        const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
        const n = Math.max(1, Math.ceil(len));
        let seen = 0;
        for (let k = 0; k <= n; k++) {
          const c = cellOf(R, a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n);
          if (c >= 0 && R.ground[c]! + gen.sight.chest >= view[c]!) seen++;
        }
        return ((seen / (n + 1)) * len) / gen.validation.runSpeed;
      };
      const fits = (x: number, z: number, fx: number, fz: number): boolean => {
        // The vehicle's footprint, and a half metre round it, all on open ground.
        for (let a = -jeep.length / 2 - 0.5; a <= jeep.length / 2 + 0.5; a += 0.5) {
          for (let b = -jeep.width / 2 - 0.5; b <= jeep.width / 2 + 0.5; b += 0.5) {
            const c = cellOf(R, x + fx * a - fz * b, z + fz * a + fx * b);
            if (c < 0 || !R.walk[c]) return false;
          }
        }
        for (const other of camp.vehicles ?? []) {
          if (other === jeep) continue;
          if ((other.x - x) * (other.x - x) + (other.z - z) * (other.z - z) < 36) return false;
        }
        // Clear of every doorway, so nobody's way in or out is parked across (a type's own margin).
        const gap = C.types[L.type].vehicleDoorGap;
        if (gap > 0 && doors.some((d) => (d.x - d.nx * 1.5 - x) * (d.x - d.nx * 1.5 - x) + (d.z - d.nz * 1.5 - z) * (d.z - d.nz * 1.5 - z) < (gap + jeep.length / 2) * (gap + jeep.length / 2))) return false;
        for (let k = 0; k + 1 < skeleton.corridor.length; k++) {
          if (segmentDistance({ x, z }, skeleton.corridor[k]!, skeleton.corridor[k + 1]!) < C.escapeClearance) return false;
        }
        return true;
      };
      /** Whether he can run it: every metre of the straight line on open ground. */
      const runnable = (a: Point2, b: Point2): boolean => {
        const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
        for (let d = 0; d <= len; d += 0.5) {
          const c = cellOf(R, a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len);
          if (c < 0 || !R.walk[c]) return false;
        }
        return true;
      };
      let best: { x: number; z: number; step: Point2; fx: number; fz: number; short: number; dist: number } | null = null;
      for (const di of hq.doors) {
        const door = doors[di]!;
        const step = { x: door.x - door.nx * 2, z: door.z - door.nz * 2 };
        for (let dist = C.escapeRun[0]!; dist <= C.escapeRun[1]!; dist += 2) {
          for (let k = 0; k < 24; k++) {
            const angle = (k * Math.PI) / 12;
            const dx = dcos(angle);
            const dz = dsin(angle);
            const x = step.x + dx * dist;
            const z = step.z + dz * dist;
            // Parked along the camp's axes, nose toward the gate or across the camp.
            for (const [fx, fz] of [
              [forward.x, forward.z],
              [-forward.z, forward.x],
            ] as const) {
              if (!fits(x, z, fx, fz) || !runnable(step, { x, z })) continue;
              const hidden = Math.max(...overview.map((i) => runSeconds(perches.views[i]!, step, { x, z })));
              let other = 0;
              perches.views.forEach((v, i) => {
                if (!overview.includes(i)) other = Math.max(other, runSeconds(v, step, { x, z }));
              });
              // How far short it falls: hidden from the overview, in view of another perch (each with a margin).
              const I = gen.validation.interceptSeconds;
              const short = Math.max(0, hidden - (I - 0.3)) + Math.max(0, I + 0.3 - other);
              if (!best || short < best.short - 1e-9 || (short < best.short + 1e-9 && dist < best.dist)) best = { x, z, step, fx, fz, short, dist };
              break;
            }
          }
        }
      }
      if (best) {
        jeep.x = best.x;
        jeep.z = best.z;
        jeep.y = Math.min(hfHeight(best.x, best.z), padH);
        jeep.fx = best.fx;
        jeep.fz = best.fz;
        skeleton.escape[1] = best.step;
        skeleton.escape[2] = { x: best.x, z: best.z };
      }
    }
  }
  const addStructure = (kind: StructureKind, ids: number[]): number => camp.structures.push({ kind, colliders: ids }) - 1;
  const post = (x: number, z: number, r: number, h: number, flags: number): number => colliders.add({ kind: 'cyl', x, z, y0: padH - 0.3, y1: padH + h, r, flags, surface: Surface.Metal });
  // The radio's antenna: a short whip on the room's most hidden wall, below its roof line.
  const radioRoom = L.buildings.findIndex((b) => b.module === 'radio');
  if (radioRoom >= 0) {
    // On its own walls if one is hidden from the overviews; if not, on the nearest building's that is.
    const room = L.buildings[radioRoom]!;
    const fork = rng.fork('antenna');
    const own = hiddenFirst(wallSpots(radioRoom, padH + C.mast), fork)[0];
    let whip = own;
    if (!own || own.seen >= perches.views.length) {
      const near = L.buildings
        .map((b, i) => ({ b, i, d: (b.x - room.x) * (b.x - room.x) + (b.z - room.z) * (b.z - room.z) }))
        .filter((e) => e.i !== radioRoom)
        .sort((a, b) => a.d - b.d || a.i - b.i); // unique: building indices differ
      for (const e of near) {
        const spot = hiddenFirst(wallSpots(e.i, padH + C.mast), fork)[0];
        if (spot && (!whip || spot.seen < whip.seen)) whip = spot;
      }
    }
    if (whip && whip.seen >= perches.views.length) {
      // No wall hides it from every overview: the antenna goes inside, beside the set, under the roof.
      const set = devices.find((d) => d.kind === 'radio');
      if (set) whip = { ...whip, x: set.x + 0.6 * room.ux, z: set.z + 0.6 * room.uz };
    }
    if (whip) addStructure('mast', [post(whip.x, whip.z, 0.08, C.mast, Blocks.Move | Blocks.Bullet)]);
  }
  // Alarm boxes: a few, well apart, on the buildings people use.
  const count = rng.fork('alarm-count').int(C.alarms[0]!, C.alarms[1]!);
  const candidates = L.buildings.flatMap((b, i) => (b.module === 'hq' || b.module === 'barracks' || b.module === 'mess' || b.module === 'storage' ? wallSpots(i, padH + 1.4) : []));
  const chosen: WallSpot[] = [];
  const pick = (spots: WallSpot[]): void => {
    for (const spot of spots) {
      if (chosen.length >= count) break;
      if (chosen.some((c) => (c.x - spot.x) * (c.x - spot.x) + (c.z - spot.z) * (c.z - spot.z) < C.alarmSpacing * C.alarmSpacing)) continue;
      chosen.push(spot);
    }
  };
  // Out in the open if a wall hides it from the overviews; if not, just inside a door, under the roof.
  const scale = perches.views.length;
  pick(hiddenFirst(candidates, rng.fork('alarms')).filter((w) => w.seen < scale));
  if (chosen.length < count) {
    const indoors: WallSpot[] = [];
    for (let i = 0; i < L.buildings.length; i++) {
      const b = L.buildings[i]!;
      if (b.module !== 'hq' && b.module !== 'barracks' && b.module !== 'mess' && b.module !== 'storage') continue;
      for (const di of b.doors) {
        const d = doors[di]!;
        // Well to the side of the doorway and a pace inside (nx points into the room), so no
        // line through the doorway reaches it.
        const tx = -d.nz;
        const tz = d.nx;
        for (const side of [1, -1]) {
          const x = d.x + d.nx * 1.2 + tx * side * (C.doorWidth / 2 + 1.5);
          const z = d.z + d.nz * 1.2 + tz * side * (C.doorWidth / 2 + 1.5);
          const c = cellOf(R, x, z);
          if (c >= 0) indoors.push({ x, z, seen: seenBy(x, padH + 1.4, z, strong) * scale + seenBy(x, padH + 1.4, z), building: i });
        }
      }
    }
    pick(hiddenFirst(indoors, rng.fork('alarms-in')));
  }
  for (const w of chosen) {
    const box = colliders.add({ kind: 'box', x: w.x, z: w.z, y0: padH + 1.15, y1: padH + 1.6, hx: 0.175, hz: 0.125, ux: L.ux, uz: L.uz, flags: Blocks.All, surface: Surface.Metal });
    const structure = addStructure('alarm', [post(w.x, w.z, 0.06, 1.2, Blocks.Move | Blocks.Bullet), box]);
    devices.push({ kind: 'alarm', x: w.x, y: padH + 1.4, z: w.z, structure, feed: generator });
  }
}

/**
 * Parked vehicles aren't colliders (they're entities, with solids), so the grid doesn't know
 * them: their footprints, and a body's radius round them, are marked as ground a body can't
 * use, so routes go round them.
 */
export function blockVehicles(camp: Camp, grid: SpatialGrid, gen: GenTuning): void {
  const L = grid.site;
  const r = gen.grid.bodyRadius;
  const block = (k: number): void => {
    L.flags[k] = L.flags[k]! & ~Cell.Walkable;
    L.edges[k] = 0;
    if (k >= 1 && k % L.nx !== 0) L.edges[k - 1] = L.edges[k - 1]! & ~Edge.East;
    if (k >= L.nx) L.edges[k - L.nx] = L.edges[k - L.nx]! & ~Edge.North;
  };
  for (const v of camp.vehicles ?? []) {
    const hl = v.length / 2 + r;
    const hw = v.width / 2 + r;
    const reach = Math.ceil(Math.sqrt(hl * hl + hw * hw) / L.cell) + 1;
    const ci = Math.floor((v.x - L.x0) / L.cell);
    const cj = Math.floor((v.z - L.z0) / L.cell);
    for (let j = Math.max(0, cj - reach); j <= Math.min(L.nz - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(L.nx - 1, ci + reach); i++) {
        const dx = L.x0 + (i + 0.5) * L.cell - v.x;
        const dz = L.z0 + (j + 0.5) * L.cell - v.z;
        if (Math.abs(dx * v.fx + dz * v.fz) <= hl && Math.abs(-dx * v.fz + dz * v.fx) <= hw) block(j * L.nx + i);
      }
    }
  }
}

/**
 * Paints a type's road through its plot onto the terrain's surfaces, once the camp is final: a
 * rebuilt camp's own road, not every attempt's.
 */
export function paintRoad(camp: Camp, hf: Heightfield): void {
  const L = camp.layout;
  if (!L?.road) return;
  const R = L.road;
  const { n, surfaces } = hf;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = hf.coord(i) - camp.site.x;
      const dz = hf.coord(j) - camp.site.z;
      const a = dx * L.ux + dz * L.uz;
      const b = dx * L.vx + dz * L.vz;
      if (a >= R.a0 && a <= R.a1 && b >= R.b0 && b <= R.b1) surfaces[j * n + i] = Surface.Dirt;
    }
  }
}

function overlaps(p: Rect, q: Rect): boolean {
  return p.a0 < q.a1 && q.a0 < p.a1 && p.b0 < q.b1 && q.b0 < p.b1;
}
