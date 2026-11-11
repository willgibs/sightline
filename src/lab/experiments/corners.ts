import type { Tuning } from '../../config/tuning';
import { campMission, generateWorld, routinePose, type BuildingSpec, type RoutinePose } from '../../sim/generation';
import { Blocks } from '../../sim/kernel/world/colliders';
import { Cell } from '../../sim/kernel/world/grid';
import { sightLine, type QueryView } from '../../sim/kernel/world/query';
import { Solids } from '../../sim/kernel/world/solids';
import type { World } from '../../sim/kernel/world/world';
import type { Experiment } from '../experiment';
import { keptWorld } from '../worlds';
import { oneStorey } from './circling';

/**
 * The owner's limit on taller camps (Nov 10): "I don't want to have to go clear every corner of
 * every building to claim success." What that comes to in numbers, read off each camp as it's
 * generated, with nobody playing.
 *
 * A man can be **read from outside** at a moment if somewhere a person could be, outside every
 * building, has a clear line to his head or his chest: a firing point, the ground beyond the
 * wire, or open ground inside it. A man nobody outside can read is in a room somebody has to open
 * to know what's in it. So, of each camp:
 *
 * - **men nobody outside can read**: guards other than the target who can't be for more than a
 *   fifth of their routine, the share of the camp's guard time spent that way, and the buildings
 *   besides his that hold one (each is a building to clear);
 * - **posts upstairs with no window**: a man on an upper floor whom no line from outside reaches;
 * - **the target**: whether he keeps upstairs; where he can be read from, where he keeps (a firing
 *   point, the ground beyond the wire, only from inside it, or nowhere short of his own stairs:
 *   on a camp that buries him the first two should be never); and, upstairs, how much of his
 *   floor the head of the stairs shows, with whether it shows him: a floor that's all in view
 *   from there has no corner to clear;
 * - **the way in**, on a camp built round one: whether its certified path goes through a
 *   building that isn't his, and whether anyone unread stands in one it does.
 *
 * Every arm is the same seeds. `one storey` is each kind of place as it stood before upper
 * floors (circling.ts), which is the generator on `main` before them.
 *
 * An instrument: it reads worlds and never changes them, so ordinary floating point is fine.
 */

/** Moments of a walker's routine it's read at. A post is read once: he doesn't move. */
const MOMENTS = 24;
/** A man unread for more than this share of his routine counts as one nobody outside can read. */
const UNREAD = 0.2;
/** Metres between the places a person could stand, on the ground. */
const EVERY = 2;
/** Rings beyond the fine grid, metres out from the plot's edge: a head in a window carries a long way over open fields. */
const FAR = [60, 100, 150];
const CHEST = 0.75;

interface Standpoint {
  x: number;
  y: number;
  z: number;
}

/** Where a person could be, outside every building: the firing points, the ground beyond the wire, and open ground inside it. */
function standpoints(w: World, T: Tuning): { perches: Standpoint[]; beyond: Standpoint[]; within: Standpoint[] } {
  const L = w.camp.layout!;
  const s = w.camp.site;
  const eyes = T.bodies.player.eyeHeight;
  const perches = w.report.camp!.perches.map((p) => ({ x: p.x, y: w.terrain.heightAt(p.x, p.z) + eyes.prone, z: p.z }));
  const beyond: Standpoint[] = [];
  const within: Standpoint[] = [];
  const G = w.grid.site;
  const stride = Math.max(1, Math.round(EVERY / G.cell));
  for (let j = 0; j < G.nz; j += stride) {
    for (let i = 0; i < G.nx; i += stride) {
      if ((G.flags[j * G.nx + i]! & Cell.Walkable) === 0) continue;
      const x = G.x0 + (i + 0.5) * G.cell;
      const z = G.z0 + (j + 0.5) * G.cell;
      if (buildingAt(L.buildings, x, z) >= 0) continue;
      const a = (x - s.x) * L.ux + (z - s.z) * L.uz;
      const b = (x - s.x) * L.vx + (z - s.z) * L.vz;
      const ground = w.terrain.heightAt(x, z);
      const list = Math.abs(a) > L.halfA || Math.abs(b) > L.halfB ? beyond : within;
      list.push({ x, y: ground + eyes.crouch, z }, { x, y: ground + eyes.stand, z });
    }
  }
  for (const out of FAR) {
    const A = L.halfA + out;
    const B = L.halfB + out;
    const corners = [
      [A, B],
      [-A, B],
      [-A, -B],
      [A, -B],
    ] as const;
    corners.forEach(([a0, b0], k) => {
      const [a1, b1] = corners[(k + 1) % 4]!;
      const n = Math.max(1, Math.round((Math.abs(a1 - a0) + Math.abs(b1 - b0)) / (EVERY * 2)));
      for (let i = 0; i < n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const b = b0 + ((b1 - b0) * i) / n;
        const x = s.x + L.ux * a + L.vx * b;
        const z = s.z + L.uz * a + L.vz * b;
        if (Math.abs(x) > w.playHalf || Math.abs(z) > w.playHalf) continue;
        beyond.push({ x, y: w.terrain.heightAt(x, z) + eyes.stand, z });
      }
    });
  }
  return { perches, beyond, within };
}

/** The building a point is inside, by its footprint, or −1. */
function buildingAt(buildings: readonly BuildingSpec[], x: number, z: number): number {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]!;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx * b.ux + dz * b.uz) <= b.length / 2 && Math.abs(-dx * b.uz + dz * b.ux) <= b.depth / 2) return i;
  }
  return -1;
}

type From = 'perch' | 'beyond' | 'within' | 'nowhere';

/** What a camp hides indoors, and what its target's building asks of whoever goes in. */
export function readCorners(w: World, T: Tuning): Record<string, number> {
  const L = w.camp.layout!;
  const view: QueryView = { world: w, solids: new Solids(w.colliders), bodies: [] };
  const places = standpoints(w, T);
  const head = T.bodies.guard.eyeHeight.stand;
  const sees = (from: readonly Standpoint[], x: number, y: number, z: number): boolean => {
    for (const p of from) {
      if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 1) continue;
      if (sightLine(view, p.x, p.y, p.z, x, y + head, z, Blocks.Sight) || sightLine(view, p.x, p.y, p.z, x, y + head * CHEST, z, Blocks.Sight)) return true;
    }
    return false;
  };
  /** Where the nearest kind of place a man can be read from is: a firing point first, then beyond the wire, then inside it. */
  const readFrom = (x: number, y: number, z: number): From => (sees(places.perches, x, y, z) ? 'perch' : sees(places.beyond, x, y, z) ? 'beyond' : sees(places.within, x, y, z) ? 'within' : 'nowhere');
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  const cycle = w.camp.cycle!;
  const target = w.camp.objective!.target;
  const his = w.camp.objective!.building;
  const upper = (y: number): boolean => w.grid.storeys.some((st) => Math.abs(st.y - y) < 0.3);
  let indoors = 0;
  let upstairs = 0;
  let unread = 0;
  let unreadTime = 0;
  let noWindow = 0;
  let inHis = 0;
  const rooms = new Set<number>();
  const holds = new Set<number>();
  let targetFrom = 'within' as From;
  w.camp.guards.forEach((g, index) => {
    const post = g.routine.legs.every((l) => l.kind === 'hold');
    const moments = post ? 1 : MOMENTS;
    const up = g.elevated && upper(g.y);
    if (up) upstairs++;
    let blind = 0;
    for (let k = 0; k < moments; k++) {
      routinePose(g.routine, (k * cycle) / moments, pose);
      const b = buildingAt(L.buildings, pose.x, pose.z);
      // On a tower, or out of doors: somewhere outside has him.
      if (b < 0 || (g.elevated && !up)) continue;
      indoors += 1 / moments;
      const from = readFrom(pose.x, g.elevated ? g.y : w.terrain.heightAt(pose.x, pose.z), pose.z);
      if (index === target) {
        // Where he keeps is where he is for most of his cycle: the first moment is in it.
        if (k === 0) targetFrom = from;
        continue;
      }
      if (from !== 'nowhere') continue;
      blind++;
      holds.add(b);
      if (b !== his) rooms.add(b);
    }
    if (index === target) return;
    unreadTime += blind / moments;
    if (blind / moments > UNREAD) {
      unread++;
      if (up) noWindow++;
    }
    if (blind > 0 && holds.has(his)) inHis++;
  });
  const him = w.camp.guards[target]!;
  const buried = w.camp.crux === 'inside' || w.camp.crux === 'flush';
  // The way in: the buildings its certified path goes through.
  const way = w.report.camp!.infiltration;
  const through = new Set<number>();
  if (way.found) {
    for (const p of way.path) {
      const b = buildingAt(L.buildings, p.x, p.z);
      if (b >= 0 && b !== his) through.add(b);
    }
  }
  const wanted = w.camp.crux === 'inside';
  // His floor from the head of his stairs: how much of it is in view from there, and whether he is.
  let floorSeen = NaN;
  let himSeen = NaN;
  const storey = L.buildings[his]!.storey;
  if (him.elevated && storey >= 0) {
    const stair = w.grid.stairs.find((st) => st.storey === storey);
    const U = w.grid.storeys[storey]!;
    if (stair) {
      const hx = U.layer.x0 + ((stair.head % U.layer.nx) + 0.5) * U.layer.cell;
      const hz = U.layer.z0 + (Math.floor(stair.head / U.layer.nx) + 0.5) * U.layer.cell;
      const eye = U.y + T.bodies.player.eyeHeight.crouch;
      let cells = 0;
      let seen = 0;
      for (let c = 0; c < U.layer.nx * U.layer.nz; c++) {
        if ((U.layer.flags[c]! & Cell.Walkable) === 0) continue;
        const x = U.layer.x0 + ((c % U.layer.nx) + 0.5) * U.layer.cell;
        const z = U.layer.z0 + (Math.floor(c / U.layer.nx) + 0.5) * U.layer.cell;
        if (buildingAt(L.buildings, x, z) !== his) continue;
        cells++;
        if ((x - hx) * (x - hx) + (z - hz) * (z - hz) < 1 || sightLine(view, hx, eye, hz, x, U.y + head, z, Blocks.Sight) || sightLine(view, hx, eye, hz, x, U.y + head * CHEST, z, Blocks.Sight)) seen++;
      }
      floorSeen = cells > 0 ? (100 * seen) / cells : NaN;
      himSeen = sightLine(view, hx, eye, hz, him.x, him.y + head, him.z, Blocks.Sight) || sightLine(view, hx, eye, hz, him.x, him.y + head * CHEST, him.z, Blocks.Sight) ? 1 : 0;
    }
  }
  const men = w.camp.guards.length;
  return {
    men,
    indoors,
    upstairs,
    unread,
    unreadTime: (100 * unreadTime) / Math.max(1, men - 1),
    rooms: rooms.size,
    noWindow,
    targetUp: him.elevated && upper(him.y) ? 1 : 0,
    buriedPerch: buried ? (targetFrom === 'perch' ? 1 : 0) : NaN,
    buriedBeyond: buried ? (targetFrom === 'beyond' ? 1 : 0) : NaN,
    buriedWithin: buried ? (targetFrom === 'within' ? 1 : 0) : NaN,
    buriedNowhere: buried ? (targetFrom === 'nowhere' ? 1 : 0) : NaN,
    floorSeen,
    himSeen,
    wayIn: wanted ? (way.found ? 1 : 0) : NaN,
    wayOther: wanted && way.found ? (through.size > 0 ? 1 : 0) : NaN,
    wayUnread: wanted && way.found ? ([...through].some((b) => rooms.has(b)) ? 1 : 0) : NaN,
    inHis,
  };
}

export const corners: Experiment = {
  name: 'corners',
  about: 'what a camp hides indoors: who nobody outside can read, where its target can be read from, and what his building asks of whoever goes in',
  series: 'lab-circling',
  camps: 24,
  arms: [{ name: 'one storey' }, { name: 'as built' }],
  measures: [
    { key: 'men', label: 'men in the camp', kind: 'mean' },
    { key: 'indoors', label: 'of them indoors at a moment', kind: 'mean' },
    { key: 'upstairs', label: 'posted on an upper floor', kind: 'mean' },
    { key: 'unread', label: 'men nobody outside can read (target aside)', kind: 'mean' },
    { key: 'unreadTime', label: 'guard time nobody outside can read (%)', kind: 'mean' },
    { key: 'rooms', label: 'buildings besides his that hold one', kind: 'mean' },
    { key: 'noWindow', label: 'posts upstairs with no window', kind: 'mean' },
    { key: 'inHis', label: 'unread men in his building besides him', kind: 'mean' },
    { key: 'targetUp', label: 'the target keeps upstairs', kind: 'rate' },
    { key: 'buriedPerch', label: 'a buried target read from a firing point', kind: 'rate' },
    { key: 'buriedBeyond', label: 'read from the ground beyond the wire', kind: 'rate' },
    { key: 'buriedWithin', label: 'read only from inside the wire', kind: 'rate' },
    { key: 'buriedNowhere', label: 'read from nowhere outside his building', kind: 'rate' },
    { key: 'floorSeen', label: 'his floor in view from the head of his stairs (%)', kind: 'mean' },
    { key: 'himSeen', label: 'he is in view from there', kind: 'rate' },
    { key: 'wayIn', label: 'a way in certified, where the camp is built round one', kind: 'rate' },
    { key: 'wayOther', label: "it goes through a building that isn't his", kind: 'rate' },
    { key: 'wayUnread', label: 'and an unread man stands in one', kind: 'rate' },
  ],
  run(seed, arm, tuning) {
    const t = arm.name === 'one storey' ? oneStorey(tuning) : tuning;
    const w = keptWorld(`corners:${seed}`, t, (tn) => generateWorld(campMission(seed), tn));
    return readCorners(w, t);
  },
};
