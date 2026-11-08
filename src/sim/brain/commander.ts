import type { Tuning } from '../../config/tuning';
import type { World } from '../kernel/world/world';
import { routinePose } from '../generation';
import { ALERT_LEVELS, alertRung, type AlertLevel, type CampState, type RosterEntry, type Task, type TaskKind } from './camp';
import { clearSeen, hottestCell, injectBelief, mapMass, mapSpread, spreadBelief } from './searchMap';
import { fuseBearings, emptyEstimate } from './triangulate';
import type { Report } from './reports';

/**
 * The camp commander (E5): Halo 3's declarative Objectives over guards. It lists the
 * tasks the camp needs done now, each with a priority, a condition and a capacity, and a
 * greedy assignment places guards on them at the least cost: distance, and the role's
 * suitability. Ties break by task index, then guard id, so the assignment is the same
 * every run. It decides from `CampMind` alone: its own memory, the static world, the
 * time, and the routines it published itself: never another entity's true state.
 *
 * The pacing layer lives here too: role slots by alert level cap how many guards
 * converge outside combat. It reads only the camp's beliefs, so it throttles rather
 * than informs.
 *
 * A search ends on belief, never truth: on the time since the last report of anything
 * suspicious and the search map's spread (searchMap.ts), between 30 and 45 s by default.
 * The camp then settles one level above where it started (the design doc's raised baseline).
 */

/** The commander's mind: everything it decides from, built by its system each tick. */
export interface CampMind {
  /** Its own memory: everything the camp believes. */
  readonly camp: CampState;
  readonly world: World;
  readonly tuning: Tuning;
  readonly tick: number;
  readonly time: number;
  /** The officer who runs the camp is on his feet: with no officer, the camp plans sloppily. A fact about the commander's own body, not about the world. */
  readonly officer: boolean;
}

/** An order the system should deliver: which guard, what task. */
export interface CampOrder {
  guard: number;
  task: Task;
}

/**
 * Digests one report that reached the camp: raises the level and the search map, and
 * remembers when anything suspicious was last heard of.
 */
export function digest(camp: CampState, r: Report, tick: number, tuning: Tuning, world: World): void {
  const M = tuning.brain.searchMap;
  if (r.kind === 'clear') {
    clearSeen(camp.map, r.x, r.z, tuning.brain.comms.clearRadius, world, tuning, tuning.bodies.guard.eyeHeight.stand);
    // Someone has finished looking: free the slot if it was his task.
    for (const t of camp.tasks) {
      t.assigned = t.assigned.filter((id) => id !== r.from);
    }
    camp.tasks = camp.tasks.filter((t) => t.assigned.length > 0 || t.capacity === 0);
    noteMan(camp, r);
    return;
  }
  noteMan(camp, r);
  injectBelief(camp.map, r.x, r.z, Math.max(r.radius, M.injectRadius), 1);
  camp.lastPercept = tick;
  camp.lastCause = r.cause;
  if (r.kind === 'shot') noteShot(camp, r, tick, tuning);
  // A post gone quiet is a job for someone: walk over and see (E6).
  if (r.kind === 'missing') {
    const t = addTask(camp, 'check', r.x, r.z, 2, 1, tick);
    t.cause = r.cause;
    const man = camp.roster.find((m) => m.id === r.from);
    if (man) man.status = 'missing';
  }
  const wanted: AlertLevel = r.kind === 'heard' || r.kind === 'missing' ? 'uneasy' : 'alert';
  if (alertRung(wanted) > alertRung(camp.level)) raise(camp, wanted, tick);
  // A search at this level, centred on the latest report.
  if (!camp.search && alertRung(camp.level) >= alertRung('uneasy')) {
    camp.search = { started: tick, startLevel: camp.floor, x: r.x, z: r.z, radius: Math.max(r.radius, M.injectRadius) };
  } else if (camp.search) {
    camp.search.x = r.x;
    camp.search.z = r.z;
    camp.search.radius = Math.max(r.radius, M.injectRadius);
  }
}

/**
 * A report of a shot adds a bearing to what the camp fuses (E8): the direction the
 * reporter heard it from, with an error that grows the less sure he is of it (the
 * uncertainty of his guess, seen from where he stood, clamped to plausible ears).
 */
function noteShot(camp: CampState, r: Report, tick: number, tuning: Tuning): void {
  const S = tuning.brain.sniper;
  const dx = r.x - r.fromX;
  const dz = r.z - r.fromZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1) return; // he heard it on top of himself: no bearing to speak of
  const sigma = Math.min((S.maxSigmaDeg * Math.PI) / 180, Math.max((S.minSigmaDeg * Math.PI) / 180, r.radius / (2 * d)));
  const shots = camp.shots;
  shots.bearings.push({ x: r.fromX, z: r.fromZ, ux: dx / d, uz: dz / d, sigma, tick });
  // Keep the newest, within its window.
  const horizon = tick - Math.round(S.window * tuning.sim.tickHz);
  shots.bearings = shots.bearings.filter((b) => b.tick >= horizon);
  if (shots.bearings.length > S.maxBearings) shots.bearings.splice(0, shots.bearings.length - S.maxBearings);
  const est = shots.estimate ?? emptyEstimate();
  if (fuseBearings(shots.bearings, { x: camp.map.x0 + (camp.map.n * camp.map.cell) / 2, z: camp.map.z0 + (camp.map.n * camp.map.cell) / 2, half: S.fusion.half, cells: S.fusion.cells, rangeMin: S.fusion.rangeMin, rangeMax: S.fusion.rangeMax }, est)) {
    shots.estimate = est;
    shots.tick = tick;
  }
}

/** A report also says where its speaker is: the camp remembers. */
function noteMan(camp: CampState, r: Report): void {
  const man = camp.roster.find((m) => m.id === r.from);
  if (man) {
    man.x = r.fromX;
    man.z = r.fromZ;
    man.tick = r.tick;
    if (man.status === 'missing') man.status = 'ok';
  }
}

function raise(camp: CampState, level: AlertLevel, tick: number): void {
  camp.level = level;
  camp.since = tick;
}

/**
 * One plan: ends a search if belief says so, and fills the tasks the camp's level calls
 * for, up to the pacing layer's slots, writing the new orders to `out`.
 */
export function plan(m: CampMind, out: CampOrder[]): void {
  out.length = 0;
  const camp = m.camp;
  const T = m.tuning.brain.camp;
  const hz = m.tuning.sim.tickHz;
  const search = camp.search;
  // Ending a search: on time since the last report and the map's spread, never on the truth.
  if (search) {
    const quiet = (m.tick - camp.lastPercept) / hz;
    if (quiet >= T.search.minSeconds && (quiet >= T.search.maxSeconds || mapMass(camp.map) < T.search.lowMass || mapSpread(camp.map) > T.search.wideArea)) endSearch(camp, m.tick);
  }
  // Orders in force lapse when nothing renews them.
  camp.tasks = camp.tasks.filter((t) => (m.tick - t.issued) / hz < m.tuning.brain.camp.keepOrder);
  // Shots sweep and search whether or not a search is under way; a search needs the level.
  if (camp.level === 'calm') return;
  const slots = camp.level === 'uneasy' ? T.slots.uneasy : camp.level === 'alert' ? T.slots.alert : T.slots.lockdown;
  // Investigate where the last report said.
  if (camp.search && slots.investigate > 0 && camp.tasks.filter((t) => t.kind === 'investigate').length === 0 && camp.level === 'uneasy') {
    addTask(camp, 'investigate', camp.search.x, camp.search.z, 2, slots.investigate, m.tick);
  }
  // A shooter the camp has fixed: the marksmen sweep where it believes he is (E8).
  const shot = camp.shots.estimate;
  if (shot && m.tick - camp.shots.tick < T.keepOrder * m.tuning.sim.tickHz && camp.tasks.filter((t) => t.kind === 'sweep').length === 0) {
    addTask(camp, 'sweep', shot.x, shot.z, 3, m.world.camp.guards.filter((g) => g.role === 'marksman').length, m.tick);
  }
  // Search teams at the hottest cells on the map, spaced apart.
  const taken: number[] = [];
  for (const t of camp.tasks) taken.push(t.x, t.z);
  let searches = camp.tasks.filter((t) => t.kind === 'search').length;
  while (camp.search && searches < slots.search) {
    const spot = hottestCell(camp.map, taken, T.search.avoid);
    if (!spot) break;
    addTask(camp, 'search', spot.x, spot.z, 1, 1, m.tick);
    taken.push(spot.x, spot.z);
    searches++;
  }
  assign(m, out);
}

function endSearch(camp: CampState, tick: number): void {
  const start = camp.search!.startLevel;
  camp.search = null;
  camp.tasks.length = 0;
  camp.map.p.fill(0);
  const settled = ALERT_LEVELS[Math.min(alertRung(start) + 1, alertRung('alert'))]!;
  if (alertRung(settled) > alertRung(camp.floor)) camp.floor = settled;
  camp.level = camp.floor;
  camp.since = tick;
}

function addTask(camp: CampState, kind: TaskKind, x: number, z: number, priority: number, capacity: number, tick: number): Task {
  const t: Task = { id: camp.nextTask++, kind, x, z, priority, capacity, assigned: [], cause: camp.lastCause, issued: tick };
  camp.tasks.push(t);
  return t;
}

/**
 * Greedy assignment: repeatedly the cheapest (task, guard) pair that fits, by distance
 * from where the guard should be, plus a penalty for roles less suited to searching.
 * Priority first; ties break by task index, then guard id.
 */
function assign(m: CampMind, out: CampOrder[]): void {
  const camp = m.camp;
  const roles = m.tuning.brain.roles;
  const taskIndex = new Map<number, number>();
  camp.tasks.forEach((t, i) => taskIndex.set(t.id, i));
  const busy = new Set<number>();
  for (const t of camp.tasks) for (const id of t.assigned) busy.add(id);
  for (;;) {
    let bestT: Task | null = null;
    let bestG: RosterEntry | null = null;
    let bestCost = Infinity;
    let bestPrio = -Infinity;
    for (const t of camp.tasks) {
      if (t.assigned.length >= t.capacity) continue;
      if (t.priority < bestPrio) continue;
      for (const g of camp.roster) {
        if (busy.has(g.id) || g.status !== 'ok') continue;
        const post = m.world.camp.guards[g.post]!;
        if (post.elevated && t.kind !== 'sweep') continue;
        const role = roles[post.role];
        const suit = t.kind === 'sweep' ? (post.role === 'marksman' ? 1 : 0) : t.kind === 'search' ? role.search : role.investigate;
        if (suit <= 0) continue;
        const pos = whereIs(m, g);
        const dx = pos.x - t.x;
        const dz = pos.z - t.z;
        const cost = Math.sqrt(dx * dx + dz * dz) + (1 - suit) * 20;
        const better =
          t.priority > bestPrio ||
          cost < bestCost - 1e-9 ||
          (cost <= bestCost + 1e-9 && bestT !== null && (taskIndex.get(t.id)! < taskIndex.get(bestT.id)! || (t === bestT && g.id < bestG!.id)));
        if (bestT === null || better) {
          bestT = t;
          bestG = g;
          bestCost = cost;
          bestPrio = t.priority;
        }
      }
    }
    if (!bestT || !bestG) return;
    bestT.assigned.push(bestG.id);
    busy.add(bestG.id);
    bestG.x = bestT.x;
    bestG.z = bestT.z;
    bestG.tick = m.tick;
    out.push({ guard: bestG.id, task: bestT });
  }
}

const pose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/** Where the camp believes a guard is: where he last said, or, if he's on routine, where it puts him now. */
function whereIs(m: CampMind, g: RosterEntry): { x: number; z: number } {
  const age = (m.tick - g.tick) / m.tuning.sim.tickHz;
  // Heard from recently, believe that; otherwise the routine he published.
  if (age < 20 && g.tick > 0) return g;
  const post = m.world.camp.guards[g.post]!;
  routinePose(post.routine, m.time, pose);
  return { x: pose.x, z: pose.z };
}

/** One tick's upkeep of the search map: its spread, at a fixed rate. */
export function spreadCamp(camp: CampState, tick: number, tuning: Tuning, world: World): void {
  const M = tuning.brain.searchMap;
  const every = Math.max(1, Math.round(tuning.sim.tickHz / M.updateHz));
  if (tick % every === 0) spreadBelief(camp.map, M.spreadRate, world);
}
