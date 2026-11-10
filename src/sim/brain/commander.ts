import type { Tuning } from '../../config/tuning';
import { routinePose } from '../generation';
import { ALERT_LEVELS, alertRung, type AlertLevel, type CampState, type RosterEntry, type Task, type TaskKind } from './camp';
import { clearSeen, hottestCell, injectBelief, mapMass, mapSpread, spreadBelief } from './searchMap';
import { fuseBearings, emptyEstimate } from './triangulate';
import type { Report } from './reports';
import type { Ground } from './mind';

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
  readonly world: Ground;
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
export function digest(camp: CampState, r: Report, tick: number, tuning: Tuning, world: Ground): void {
  const M = tuning.brain.searchMap;
  if (r.kind === 'clear') {
    clearSeen(camp.map, r.x, r.z, tuning.brain.comms.clearRadius, world, tuning, tuning.bodies.guard.eyeHeight.stand);
    const R = tuning.brain.comms.clearRadius;
    if (camp.search && (camp.search.x - r.x) * (camp.search.x - r.x) + (camp.search.z - r.z) * (camp.search.z - r.z) <= R * R) camp.search.cleared = true;
    // Someone has finished looking: free the slot if it was his task, and retire the task if it's done.
    for (const t of camp.tasks) {
      const before = t.assigned.length;
      t.assigned = t.assigned.filter((id) => id !== r.from);
      if (t.assigned.length < before && t.assigned.length === 0) t.capacity = 0;
    }
    camp.tasks = camp.tasks.filter((t) => t.capacity > 0);
    noteMan(camp, r);
    return;
  }
  noteMan(camp, r);
  injectBelief(camp.map, r.x, r.z, Math.max(r.radius, M.injectRadius), 1);
  camp.lastPercept = tick;
  camp.lastCause = r.cause;
  // The ledger of repeated tricks and the memory of incidents (E9): what the camp learns
  // only from what was reported to it.
  remember(camp, r, tick, tuning);
  if (r.kind === 'shot' && r.sigma !== undefined) noteShot(camp, r, tick, tuning);
  // A post gone quiet is a job for someone: walk over and see (E6).
  if (r.kind === 'missing' || r.kind === 'outage') {
    const t = addTask(camp, 'check', r.x, r.z, 2, 1, tick);
    t.cause = r.cause;
    if (r.kind === 'missing') {
      const man = camp.roster.find((m) => m.id === r.from);
      if (man) man.status = 'missing';
    }
  }
  const wanted: AlertLevel = r.kind === 'heard' || r.kind === 'missing' || r.kind === 'outage' ? 'uneasy' : 'alert';
  if (alertRung(wanted) > alertRung(camp.level)) raise(camp, wanted, tick);
  // A body in the open (E9): guards near it get off exposed ground.
  if (r.kind === 'body') addTask(camp, 'cover', r.x, r.z, 2, 3, tick);
  // An unverified report from someone already on his way there: the camp knows, and he has it.
  if (r.kind === 'heard' && r.checking && !camp.tasks.some((t) => t.kind === 'investigate')) {
    const t = addTask(camp, 'investigate', r.x, r.z, 2, 1, tick);
    t.assigned.push(r.from);
    t.cause = r.cause;
  }
  // A search at this level, centred on the latest report.
  if (!camp.search && alertRung(camp.level) >= alertRung('uneasy')) {
    camp.search = { started: tick, startLevel: camp.floor, x: r.x, z: r.z, radius: Math.max(r.radius, M.injectRadius), cleared: false };
  } else if (camp.search) {
    camp.search.x = r.x;
    camp.search.z = r.z;
    camp.search.radius = Math.max(r.radius, M.injectRadius);
    camp.search.cleared = false;
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
  const stated = r.sigma ?? r.radius / (2 * d);
  const sigma = Math.min((S.maxSigmaDeg * Math.PI) / 180, Math.max((S.minSigmaDeg * Math.PI) / 180, stated));
  const shots = camp.shots;
  shots.bearings.push({ x: r.fromX, z: r.fromZ, ux: dx / d, uz: dz / d, sigma, tick });
  // Keep the newest, within its window; the fusion runs once a tick, after the whole inbox.
  const horizon = tick - Math.round(S.keep * tuning.sim.tickHz);
  shots.bearings = shots.bearings.filter((b) => b.tick >= horizon);
  if (shots.bearings.length > S.maxBearings) shots.bearings.splice(0, shots.bearings.length - S.maxBearings);
  shots.dirty = true;
}

/** Re-fuses the camp's bearings if new ones came in this tick: at most once a tick, however many reports arrived. */
export function fuseShots(camp: CampState, tick: number, tuning: Tuning): void {
  const shots = camp.shots;
  if (!shots.dirty) return;
  shots.dirty = false;
  const F = tuning.brain.sniper.fusion;
  const est = shots.estimate ?? emptyEstimate();
  const cx = camp.map.x0 + (camp.map.n * camp.map.cell) / 2;
  const cz = camp.map.z0 + (camp.map.n * camp.map.cell) / 2;
  if (fuseBearings(shots.bearings, { x: cx, z: cz, half: F.half, cells: F.cells, rangeMin: F.rangeMin, rangeMax: F.rangeMax }, est)) {
    shots.estimate = est;
    shots.tick = tick;
  }
}

/** The ledger: a repeated stimulus at about the same spot counts up, and old spots are forgotten. Incidents: shots and bodies, where they were. */
function remember(camp: CampState, r: Report, tick: number, tuning: Tuning): void {
  const A = tuning.brain.adapt;
  const hz = tuning.sim.tickHz;
  camp.ledger = camp.ledger.filter((e) => (tick - e.tick) / hz < A.forget);
  if (r.kind === 'heard' || r.kind === 'claim') {
    const near = camp.ledger.find((e) => e.kind === r.kind && Math.abs(e.x - r.x) < A.cellSize && Math.abs(e.z - r.z) < A.cellSize);
    if (near) {
      near.count++;
      near.tick = tick;
    } else camp.ledger.push({ kind: r.kind, x: r.x, z: r.z, count: 1, tick });
  }
  if (r.kind === 'shot' || r.kind === 'body') {
    const kind = r.kind === 'shot' ? 'shots' : 'body';
    const near = camp.incidents.find((e) => e.kind === kind && Math.abs(e.x - r.x) < A.cellSize * 3 && Math.abs(e.z - r.z) < A.cellSize * 3);
    if (near) {
      near.count++;
      near.tick = tick;
    } else camp.incidents.push({ kind, x: r.x, z: r.z, count: 1, tick });
  }
}

/** How many guards a report of a repeated trick draws: the ledger's count, capped by the pacing slots. */
function investigators(camp: CampState, x: number, z: number, slots: number, tuning: Tuning): number {
  const A = tuning.brain.adapt;
  const repeated = camp.ledger.find((e) => e.kind === 'heard' && Math.abs(e.x - x) < A.cellSize && Math.abs(e.z - z) < A.cellSize);
  return repeated && repeated.count >= A.repeatCount ? Math.min(slots, 2) : Math.min(slots, 1);
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
  // An alarm raised is lockdown (E7): only a box changing state sets it.
  if (camp.level !== 'lockdown' && camp.devices.alarms.some((a) => a.raised)) raise(camp, 'lockdown', m.tick);
  const T = m.tuning.brain.camp;
  const hz = m.tuning.sim.tickHz;
  // A camp in lockdown is hunting, whether or not anyone has reported anything yet.
  if (camp.level === 'lockdown' && !camp.search) {
    const box = camp.devices.alarms.find((a) => a.raised);
    camp.search = { started: m.tick, startLevel: camp.floor, x: box ? box.x : m.world.camp.site.x, z: box ? box.z : m.world.camp.site.z, radius: m.tuning.brain.searchMap.injectRadius, cleared: false };
  }
  const search = camp.search;
  // Ending a search: on time since the last report and the map's spread, never on the truth.
  // Not at lockdown: a raised alarm stays raised, and the camp doesn't stand down from it.
  if (search && camp.level !== 'lockdown') {
    const quiet = (m.tick - camp.lastPercept) / hz;
    if (quiet >= T.search.minSeconds && (quiet >= T.search.maxSeconds || mapMass(camp.map) < T.search.lowMass || mapSpread(camp.map) > T.search.wideArea)) endSearch(camp, m.tick);
  }
  // Orders in force lapse when nothing renews them.
  camp.tasks = camp.tasks.filter((t) => (m.tick - t.issued) / hz < m.tuning.brain.camp.keepOrder);
  // Shots sweep and search whether or not a search is under way; a search needs the level.
  if (camp.level === 'calm') return;
  const slots = camp.level === 'uneasy' ? T.slots.uneasy : camp.level === 'alert' ? T.slots.alert : T.slots.lockdown;
  // Investigate where the last report said.
  if (camp.search && !camp.search.cleared && slots.investigate > 0 && camp.tasks.filter((t) => t.kind === 'investigate').length === 0 && camp.level === 'uneasy') {
    addTask(camp, 'investigate', camp.search.x, camp.search.z, 2, investigators(camp, camp.search.x, camp.search.z, T.slots.lockdown.investigate + 1, m.tuning), m.tick);
  }
  // A shooter the camp has fixed: the marksmen sweep where it believes he is (E8).
  const shot = camp.shots.estimate;
  // A newer fix than the one being swept retires that sweep, so the marksmen follow the estimate.
  if (shot) camp.tasks = camp.tasks.filter((t) => t.kind !== 'sweep' || t.issued >= camp.shots.tick);
  if (shot && m.tick - camp.shots.tick < T.keepOrder * m.tuning.sim.tickHz && camp.tasks.filter((t) => t.kind === 'sweep').length === 0) {
    addTask(camp, 'sweep', shot.x, shot.z, 3, m.world.camp.guards.filter((g) => g.role === 'marksman').length, m.tick);
  }
  // Bringing the target out (protect.ts): once the relief is at the gate, men are sent to
  // his door, and others after a while if his vehicle still hasn't moved. The camp knows its
  // own vehicle has gone; it doesn't know why a man hasn't come.
  const P = m.tuning.brain.protect;
  const relief = camp.relief;
  const going = camp.objective?.status === 'escaping' || camp.objective?.status === 'escaped';
  if (camp.protects && camp.devices.escape && relief && !going && relief.fetches < P.fetches && (relief.fetches === 0 || (m.tick - relief.last) / hz >= P.fetchEvery) && !camp.tasks.some((t) => t.kind === 'fetch')) {
    addTask(camp, 'fetch', camp.protects.x, camp.protects.z, 4, P.fetchers, m.tick);
    relief.fetches++;
    relief.last = m.tick;
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
        const suit = t.kind === 'sweep' ? (post.role === 'marksman' ? 1 : 0) : t.kind === 'cover' ? 1 : t.kind === 'fetch' ? (role.fight > 0 ? 1 : 0) : t.kind === 'search' ? role.search : role.investigate;
        if (suit <= 0) continue;
        const pos = whereIs(m, g);
        const dx = pos.x - t.x;
        const dz = pos.z - t.z;
        const cost = Math.sqrt(dx * dx + dz * dz) + (1 - suit) * m.tuning.brain.camp.rolePenalty;
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
  if (age < m.tuning.brain.camp.rosterTrust && g.tick > 0) return g;
  if (g.reserve) return g.reserve;
  const post = m.world.camp.guards[g.post]!;
  routinePose(post.routine, m.time, pose);
  return { x: pose.x, z: pose.z };
}

/** One tick's upkeep of the search map: its spread, at a fixed rate. */
export function spreadCamp(camp: CampState, tick: number, tuning: Tuning, world: Ground): void {
  const M = tuning.brain.searchMap;
  const every = Math.max(1, Math.round(tuning.sim.tickHz / M.updateHz));
  if (tick % every === 0) spreadBelief(camp.map, M.spreadRate * (every / tuning.sim.tickHz), world);
}
