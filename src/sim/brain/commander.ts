import type { Tuning } from '../../config/tuning';
import { routinePose, type RoutinePose } from '../generation';
import type { SearchOptions } from '../kernel/world/search';
import { approachOf, emptyWay } from './approach';
import { emptyRoute, navigatorOf, routeLength } from './nav';
import { ALERT_LEVELS, alertRung, type AlertLevel, type CampState, type RosterEntry, type Section, type Task, type TaskKind, type Threat } from './camp';
import { clearSeen, hottestCell, injectBelief, mapMass, mapSpread, spreadBelief } from './searchMap';
import { ellipseArea, fuseBearings, emptyEstimate, mahalanobis2 } from './triangulate';
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
 *
 * The hunt (Lab F, step 2b; hunt.ts): a camp that hunts keeps a threat, someone it has
 * placed outside its own ground, from a man's eyes or from the bearings it fuses. Against
 * the range card that is a firing point with a name. Once the men have had time to get out
 * of the line it sends a section: a few of those who can be spared, by the way that keeps
 * most out of his view (approach.ts). When the section calls the place clear the threat
 * moves to the next firing point he could have reached, and the section is sent on; after
 * a few such, or when its orders run out, it comes home. It knows of its section only what
 * it ordered and what has come back over the net.
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
  /** Where the searches a plan makes are counted (a section's way out, and its men's routes to where they gather): the commander's system passes its tick's. */
  readonly work?: SearchOptions['work'];
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
      // A section's order stands until the camp says otherwise (planHunt).
      if (t.kind === 'hunt') continue;
      const before = t.assigned.length;
      t.assigned = t.assigned.filter((id) => id !== r.from);
      if (t.assigned.length < before && t.assigned.length === 0) t.capacity = 0;
    }
    camp.tasks = camp.tasks.filter((t) => t.capacity > 0);
    noteMan(camp, r);
    if (camp.hunts) heardClear(camp, r, tick, tuning, world);
    return;
  }
  noteMan(camp, r);
  // A section's word that it's moving, or down: where its man is, and nothing about an intruder.
  if (r.kind === 'moving' || r.kind === 'set') return;
  // Someone has him in sight, or saw his flash: a place to act on.
  if (camp.hunts && r.kind === 'contact') seenThreat(camp, r, tick, tuning, world);
  if (r.kind === 'shot' || r.kind === 'contact') camp.lastShot = tick;
  injectBelief(camp.map, r.x, r.z, Math.max(r.radius, M.injectRadius), 1);
  camp.lastPercept = tick;
  camp.lastCause = r.cause;
  // The ledger of repeated tricks and the memory of incidents (E9): what the camp learns
  // only from what was reported to it.
  remember(camp, r, tick, tuning);
  if (r.kind === 'shot' && r.sigma !== undefined) noteShot(camp, r, tick, tuning);
  // A man of a section who never came to its rally (hunt.ts): he's unaccounted for, and the section is done with. Another is formed.
  if (r.kind === 'missing' && r.about !== undefined) {
    const man = camp.roster.find((g) => g.id === r.about);
    if (man) man.status = 'missing';
    disband(camp, r.from);
    if (alertRung('uneasy') > alertRung(camp.level)) raise(camp, 'uneasy', tick);
    return;
  }
  // A body, in a camp that keeps count of its men: whoever should have been standing there is down.
  if (r.kind === 'body' && camp.hunts) accountFor(camp, r, tick, tuning, world);
  // A post gone quiet is a job for someone: walk over and see (E6).
  if (r.kind === 'missing' || r.kind === 'outage') {
    const t = addTask(camp, 'check', r.x, r.z, 2, 1, tick, r.y);
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
    const t = addTask(camp, 'investigate', r.x, r.z, 2, 1, tick, r.y);
    t.assigned.push(r.from);
    t.cause = r.cause;
  }
  // A search at this level, centred on the latest report.
  if (!camp.search && alertRung(camp.level) >= alertRung('uneasy')) {
    camp.search = { started: tick, startLevel: camp.floor, x: r.x, z: r.z, y: r.y, radius: Math.max(r.radius, M.injectRadius), cleared: false };
  } else if (camp.search) {
    camp.search.x = r.x;
    camp.search.z = r.z;
    camp.search.y = r.y;
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
    man.heard = r.tick;
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
  // Orders in force lapse when nothing renews them. A section's stands until it's called home (planHunt).
  camp.tasks = camp.tasks.filter((t) => t.kind === 'hunt' || (m.tick - t.issued) / hz < m.tuning.brain.camp.keepOrder);
  if (camp.hunts) planHunt(m, out);
  // Shots sweep and search whether or not a search is under way; a search needs the level.
  if (camp.level === 'calm') return;
  const slots = camp.level === 'uneasy' ? T.slots.uneasy : camp.level === 'alert' ? T.slots.alert : T.slots.lockdown;
  // Someone placed off the camp's own ground is a section's to find (planHunt): nobody else is sent walking about in his view to look for him.
  const hunting = camp.hunts === true && camp.threat !== null;
  // Investigate where the last report said.
  if (!hunting && camp.search && !camp.search.cleared && slots.investigate > 0 && camp.tasks.filter((t) => t.kind === 'investigate').length === 0 && camp.level === 'uneasy') {
    addTask(camp, 'investigate', camp.search.x, camp.search.z, 2, investigators(camp, camp.search.x, camp.search.z, T.slots.lockdown.investigate + 1, m.tuning), m.tick, camp.search.y);
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
    addTask(camp, 'fetch', camp.protects.x, camp.protects.z, 4, P.fetchers, m.tick, camp.protects.y);
    relief.fetches++;
    relief.last = m.tick;
  }
  // Search teams at the hottest cells on the map, spaced apart.
  const taken: number[] = [];
  for (const t of camp.tasks) taken.push(t.x, t.z);
  let searches = camp.tasks.filter((t) => t.kind === 'search').length;
  while (!hunting && camp.search && searches < slots.search) {
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
  // A section that's out stays out: its orders have their own end.
  camp.tasks = camp.tasks.filter((t) => t.kind === 'hunt');
  camp.map.p.fill(0);
  const settled = ALERT_LEVELS[Math.min(alertRung(start) + 1, alertRung('alert'))]!;
  if (alertRung(settled) > alertRung(camp.floor)) camp.floor = settled;
  camp.level = camp.floor;
  camp.since = tick;
}

function addTask(camp: CampState, kind: TaskKind, x: number, z: number, priority: number, capacity: number, tick: number, y?: number): Task {
  const t: Task = { id: camp.nextTask++, kind, x, z, ...(y === undefined ? {} : { y }), priority, capacity, assigned: [], cause: camp.lastCause, issued: tick };
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

/** Ends the section a man is in, if he's in one: its order is withdrawn, and nothing holds the camp from forming another. */
function disband(camp: CampState, member: number): void {
  const s = camp.sections.find((x) => x.men.includes(member));
  if (!s) return;
  camp.sections.splice(camp.sections.indexOf(s), 1);
  camp.tasks = camp.tasks.filter((t) => t.id !== s.task);
}

const where: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/**
 * Whose body it is, as the camp can tell. Called in by a man of a section about somewhere
 * off the camp's own ground, it's one of that section's: of a pair, the other man. Anywhere
 * else it's whoever's beat it lies on and who hasn't said a word since it was found: where
 * his routine had him at some moment of the last minute, or where he was put down as a
 * reinforcement. The camp doesn't send a dead man out. A body it can't put a name to
 * changes nothing here, and the same body called in twice is nobody new.
 */
function accountFor(camp: CampState, r: Report, tick: number, tuning: Tuning, world: Ground): void {
  const B = tuning.brain.hunt.body;
  for (const f of camp.fallen) if ((f.x - r.x) * (f.x - r.x) + (f.z - r.z) * (f.z - r.z) <= B.same * B.same) return;
  const s = camp.sections.find((x) => x.men.includes(r.from));
  if (s && !ownGround(world, r.x, r.z)) {
    const rest = s.men.filter((id) => id !== r.from && camp.roster.find((g) => g.id === id)?.status === 'ok');
    if (rest.length === 1) {
      camp.roster.find((g) => g.id === rest[0])!.status = 'dead';
      camp.fallen.push({ x: r.x, z: r.z, who: rest[0]! });
      disband(camp, r.from);
      camp.huntEnded = tick;
    }
    return;
  }
  const hz = tuning.sim.tickHz;
  let best: RosterEntry | null = null;
  let bestD = B.within * B.within;
  for (const g of camp.roster) {
    if (g.status === 'dead' || g.id === r.from) continue;
    // He's said something since: it isn't him.
    if (g.heard !== undefined && g.heard >= r.tick) continue;
    let d = Infinity;
    if (g.reserve) d = (g.reserve.x - r.x) * (g.reserve.x - r.x) + (g.reserve.z - r.z) * (g.reserve.z - r.z);
    else {
      for (let back = 0; back <= B.beat; back += B.every) {
        routinePose(world.camp.guards[g.post]!.routine, Math.max(0, tick / hz - back), where);
        const at = (where.x - r.x) * (where.x - r.x) + (where.z - r.z) * (where.z - r.z);
        if (at < d) d = at;
      }
    }
    if (d <= bestD) {
      bestD = d;
      best = g;
    }
  }
  if (!best) return;
  best.status = 'dead';
  camp.fallen.push({ x: r.x, z: r.z, who: best.id });
}

/** The camp's own ground: nearer its middle than this, someone is the men's who are there (firefight.ts), and no section is sent. */
function ownGround(world: Ground, x: number, z: number): boolean {
  const site = world.camp.site;
  return (x - site.x) * (x - site.x) + (z - site.z) * (z - site.z) <= site.radius * site.radius;
}

/** The listed firing point at (x, z), or the nearest within `within` metres of it; −1 if none. */
function pointAt(world: Ground, x: number, z: number, within: number): number {
  const perches = world.report.camp?.perches ?? [];
  let best = -1;
  let bestD = within * within;
  for (let k = 0; k < perches.length; k++) {
    const d = (perches[k]!.x - x) * (perches[k]!.x - x) + (perches[k]!.z - z) * (perches[k]!.z - z);
    if (d <= bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** True if a section has looked at this place, lately, and found nobody. */
function crossedOff(camp: CampState, x: number, z: number, tuning: Tuning): boolean {
  const R = tuning.brain.comms.clearRadius;
  for (const c of camp.cleared) if ((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) <= R * R) return true;
  return false;
}

/** Holds a place as the camp's threat: a new one starts its clock, the same one again only freshens it. */
function hold(camp: CampState, x: number, z: number, r: number, point: number, seen: boolean, news: number, tick: number, tuning: Tuning): void {
  const old = camp.threat;
  const H = tuning.brain.hunt;
  const fresh = old !== null && (tick - old.news) / tuning.sim.tickHz <= H.fresh;
  camp.threat = { x, z, r, point, since: fresh ? old.since : tick, news, seen };
}

/** A man has him in sight, or saw his flash, somewhere past the camp's own ground: that's where he is. */
function seenThreat(camp: CampState, r: Report, tick: number, tuning: Tuning, world: Ground): void {
  if (ownGround(world, r.x, r.z)) return;
  hold(camp, r.x, r.z, r.radius, pointAt(world, r.x, r.z, tuning.brain.comms.clearRadius), true, tick, tick, tuning);
}

/**
 * What the camp makes of the bearings it has fused, once they amount to a place: the listed
 * firing point they fit best, if any lies inside the ellipse, or else the middle of it. One
 * crack of a bullet passing is a direction to duck from and no place to send men to, so a
 * fix wider than `sure` is left alone. Eyes beat ears while they're fresh, and a place a
 * section has just found empty isn't taken up again.
 */
function heardThreat(m: CampMind): void {
  const camp = m.camp;
  const est = camp.shots.estimate;
  if (!est || camp.shots.tick < 0) return;
  const hz = m.tuning.sim.tickHz;
  const old = camp.threat;
  if (old && old.news >= camp.shots.tick) return;
  if (old && old.seen && (m.tick - old.news) / hz < m.tuning.brain.hunt.eyes) return;
  // How sure it is: the radius of a circle as large as the ellipse.
  const r = Math.sqrt(ellipseArea(est) / Math.PI);
  if (!(r <= m.tuning.brain.hunt.sure)) return;
  const perches = m.world.report.camp?.perches ?? [];
  let best = -1;
  let bestM = est.m2;
  for (let k = 0; k < perches.length; k++) {
    const p = perches[k]!;
    if (crossedOff(camp, p.x, p.z, m.tuning)) continue;
    const d = mahalanobis2(est, p.x, p.z);
    if (d < bestM) {
      bestM = d;
      best = k;
    }
  }
  if (best >= 0) {
    const p = perches[best]!;
    hold(camp, p.x, p.z, m.tuning.brain.comms.clearRadius, best, false, camp.shots.tick, m.tick, m.tuning);
    return;
  }
  if (ownGround(m.world, est.x, est.z) || crossedOff(camp, est.x, est.z, m.tuning)) return;
  // Off the list: the middle of what it has, as sure as that is.
  hold(camp, est.x, est.z, r, -1, false, camp.shots.tick, m.tick, m.tuning);
}

/**
 * A section's word that its place is clear: the place is crossed off, and whoever was there
 * hasn't gone far. The threat moves to the nearest firing point he could have reached that
 * nobody has looked at, or is given up.
 */
function heardClear(camp: CampState, r: Report, tick: number, tuning: Tuning, world: Ground): void {
  const s = camp.sections.find((x) => x.men.includes(r.from));
  if (!s) return;
  const R = tuning.brain.comms.clearRadius;
  if ((r.x - s.x) * (r.x - s.x) + (r.z - s.z) * (r.z - s.z) > R * R) return;
  s.heard = 'clear';
  s.heardAt = tick;
  camp.cleared.push({ x: s.x, z: s.z, tick });
  // And the listed firing points close beside it, as far out as the call says: a section looks those over with it (hunt.ts).
  const order = camp.tasks.find((t) => t.id === s.task)?.hunt;
  const reach = Math.min(tuning.brain.hunt.sweep.reach, r.radius);
  if (order) {
    for (let k = 0; k + 1 < order.watch.length; k += 2) {
      const d = (order.watch[k]! - s.x) * (order.watch[k]! - s.x) + (order.watch[k + 1]! - s.z) * (order.watch[k + 1]! - s.z);
      if (d > 1 && d <= reach * reach) camp.cleared.push({ x: order.watch[k]!, z: order.watch[k + 1]!, tick });
    }
  }
  const th = camp.threat;
  if (!th || (th.x - s.x) * (th.x - s.x) + (th.z - s.z) * (th.z - s.z) > R * R) return;
  const H = tuning.brain.hunt;
  const perches = world.report.camp?.perches ?? [];
  let best = -1;
  let bestD = H.next * H.next;
  for (let k = 0; k < perches.length; k++) {
    const p = perches[k]!;
    if (crossedOff(camp, p.x, p.z, tuning)) continue;
    const d = (p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best < 0) {
    camp.threat = null;
    return;
  }
  const p = perches[best]!;
  // A guess, and it says so: the news is as old as it was.
  camp.threat = { x: p.x, z: p.z, r: R, point: best, since: th.since, news: th.news, seen: false };
}

/** Where the shooter is taken to be watching from: the place itself, and the listed firing points nearest it. */
function watchOf(m: CampMind, th: Threat): number[] {
  const H = m.tuning.brain.hunt;
  const perches = m.world.report.camp?.perches ?? [];
  const reach = H.sweep.reach * H.sweep.reach;
  const near = perches
    .map((p, k) => ({ k, d: (p.x - th.x) * (p.x - th.x) + (p.z - th.z) * (p.z - th.z) }))
    .filter((p) => p.k !== th.point)
    .sort((a, b) => a.d - b.d || a.k - b.k) // the index breaks a tie
    .filter((p, i) => i < H.beside || (p.d <= reach && i < H.sweep.most));
  const out = th.point >= 0 ? [perches[th.point]!.x, perches[th.point]!.z] : [th.x, th.z];
  for (const p of near) out.push(perches[p.k]!.x, perches[p.k]!.z);
  return out;
}

/** A section's order among the camp's: ahead of searches and checks, behind the men sent for the target. */
const HUNT_PRIORITY = 3.5;

const huntWay = emptyWay();
const watching: Array<{ x: number; z: number }> = [];

/**
 * Where a section gathers, and whether it's worth going at all. The way out is worked from
 * the open ground nearest its men, and they gather where that way leaves the camp's own
 * ground: inside the wire there are walls between them, so a shout doesn't carry and nobody
 * can see far, and each man simply makes his own way out to it. Also how long the slowest
 * of them should take to get there, by the walk and not the straight line, seconds. Null if
 * there's no way, or it's farther round than a section is sent.
 */
function rallyFor(m: CampMind, from: ReadonlyArray<{ x: number; z: number }>, th: Threat, watch: readonly number[]): { x: number; z: number; eta: number } | null {
  const a = approachOf(m.world, m.tuning);
  const nav = navigatorOf(m.world, m.tuning);
  const H = m.tuning.brain.hunt;
  const site = m.world.camp.site;
  watching.length = 0;
  for (let k = 0; k + 1 < watch.length; k += 2) watching.push({ x: watch[k]!, z: watch[k + 1]! });
  a.aim(watching);
  let cx = 0;
  let cz = 0;
  for (const p of from) {
    cx += p.x / from.length;
    cz += p.z / from.length;
  }
  const start = a.near(cx, cz, 8);
  if (start < 0 || !a.way(a.px[start]!, a.pz[start]!, th.x, th.z, huntWay, m.work) || huntWay.length > H.farthest) return null;
  // The first stop past the wire; or, for men already out there (a section being sent on), where they are.
  let rally = 0;
  const out = (k: number): boolean => (huntWay.stops[2 * k]! - site.x) * (huntWay.stops[2 * k]! - site.x) + (huntWay.stops[2 * k + 1]! - site.z) * (huntWay.stops[2 * k + 1]! - site.z) > site.radius * site.radius;
  while (rally < huntWay.lit.length - 1 && !out(rally)) rally++;
  const x = huntWay.stops[2 * rally]!;
  const z = huntWay.stops[2 * rally + 1]!;
  let far = 0;
  for (const p of from) {
    const r = nav.find(p.x, p.z, x, z, { work: m.work }, rallyRoute);
    if (r !== 'found') return null;
    far = Math.max(far, routeLength(rallyRoute, p.x, p.z));
  }
  return { x, z, eta: far / H.paces.covered };
}

const rallyRoute = emptyRoute();

/**
 * The hunt, once a plan: keeps the threat current, calls a section home when its orders
 * have run out, sends it on when the place has moved, and forms one when there's someone
 * to go after, men to spare, and they've had time to get out of the line.
 */
function planHunt(m: CampMind, out: CampOrder[]): void {
  const camp = m.camp;
  const H = m.tuning.brain.hunt;
  const hz = m.tuning.sim.tickHz;
  const tick = m.tick;
  camp.cleared = camp.cleared.filter((c) => (tick - c.tick) / hz < H.forget);
  heardThreat(m);
  // A fix goes stale, unless a section is out on it: then it stands until they've looked.
  if (camp.threat && camp.sections.length === 0 && (tick - camp.threat.news) / hz > H.fresh) camp.threat = null;
  // Sections whose time is up, or whose men are all gone as far as the camp knows, or who've cleared their place with nowhere to go on to.
  for (const s of [...camp.sections]) {
    const men = s.men.filter((id) => camp.roster.find((g) => g.id === id)?.status === 'ok').length;
    // Called its place clear, and hasn't been sent on in the time its men wait for orders: they're on their way home.
    const done = s.heard === 'clear' && (tick - s.heardAt) / hz > H.hold;
    // One man isn't a section: what's left of it comes home by itself (hunt.ts).
    if ((tick - s.ordered) / hz <= H.lifetime && men >= 2 && !done) continue;
    camp.sections.splice(camp.sections.indexOf(s), 1);
    camp.tasks = camp.tasks.filter((t) => t.id !== s.task);
    camp.huntEnded = tick;
    // A place it was sent to and never called is left be for a while: whatever stopped this section would stop the next.
    if (s.heard !== 'clear') camp.cleared.push({ x: s.x, z: s.z, tick });
  }
  // Nobody's sent twice to a place that's crossed off: the threat there is given up until there's news of him.
  if (camp.threat && camp.sections.length === 0 && crossedOff(camp, camp.threat.x, camp.threat.z, m.tuning)) camp.threat = null;
  const now = camp.threat;
  if (!now) return;
  const s = camp.sections[0];
  if (s) {
    // Out already: sent on if the place has moved, and it has legs left.
    const moved = (now.x - s.x) * (now.x - s.x) + (now.z - s.z) * (now.z - s.z) > H.shift * H.shift;
    if (moved && s.legs < H.legs) resend(m, s, now, out);
    return;
  }
  if ((tick - now.since) / hz < H.after) return;
  if (camp.huntEnded >= 0 && (tick - camp.huntEnded) / hz < H.again) return;
  // Not while he's still firing: nobody's sent across ground under a rifle that has just spoken. The camp answers him from where it is, and waits for him to stop.
  if (camp.lastShot >= 0 && (tick - camp.lastShot) / hz < H.quiet) return;
  form(m, now, out);
}

/** Forms a section for a threat, if there are men to spare and a way to it, and sends them their orders. */
function form(m: CampMind, th: Threat, out: CampOrder[]): void {
  const camp = m.camp;
  const H = m.tuning.brain.hunt;
  const roles = m.tuning.brain.roles;
  // A section has first call on men, behind only those sent for the target: whoever's on a lesser errand is taken off it.
  const busy = new Set<number>();
  for (const t of camp.tasks) if (t.priority >= HUNT_PRIORITY) for (const id of t.assigned) busy.add(id);
  // Who fights on the ground, as far as the camp knows; and of them, who goes after people and has nothing better to do.
  const fighters = camp.roster.filter((g) => g.status === 'ok' && !m.world.camp.guards[g.post]!.elevated && roles[m.world.camp.guards[g.post]!.role].fight > 0);
  const able = fighters
    .filter((g) => roles[m.world.camp.guards[g.post]!.role].flank > 0 && !busy.has(g.id))
    .sort((a, b) => roles[m.world.camp.guards[b.post]!.role].flank - roles[m.world.camp.guards[a.post]!.role].flank || a.id - b.id); // the keenest first, and the id breaks a tie
  const size = Math.min(H.size, fighters.length - H.keep, able.length);
  if (size < 2) return;
  const men = able.slice(0, size);
  // The senior man leads: the one whose role says the most on the net, then the keenest.
  men.sort((a, b) => roles[m.world.camp.guards[b.post]!.role].report - roles[m.world.camp.guards[a.post]!.role].report || roles[m.world.camp.guards[b.post]!.role].flank - roles[m.world.camp.guards[a.post]!.role].flank || a.id - b.id);
  const watch = watchOf(m, th);
  const rally = rallyFor(m, men.map((g) => whereIs(m, g)), th, watch);
  if (!rally) return;
  for (const t of camp.tasks) t.assigned = t.assigned.filter((id) => !men.some((g) => g.id === id));
  const task = addTask(camp, 'hunt', th.x, th.z, HUNT_PRIORITY, size, m.tick);
  task.assigned = men.map((g) => g.id);
  task.hunt = { men: [...task.assigned], r: th.r, rx: rally.x, rz: rally.z, eta: rally.eta, watch };
  const section: Section = { id: camp.nextSection++, task: task.id, men: [...task.assigned], x: th.x, z: th.z, point: th.point, ordered: m.tick, legs: 1, heard: 'out', heardAt: m.tick };
  camp.sections.push(section);
  for (const id of task.assigned) out.push({ guard: id, task });
}

/** Sends a section that's out after a place that has moved: from the place it has just cleared, or from wherever it was last heard of. */
function resend(m: CampMind, s: Section, th: Threat, out: CampOrder[]): void {
  const camp = m.camp;
  const task = camp.tasks.find((t) => t.id === s.task);
  if (!task || !task.hunt) return;
  const lead = camp.roster.find((g) => g.id === s.men[0]);
  const from = s.heard === 'clear' ? { x: s.x, z: s.z } : lead && lead.tick >= s.ordered ? { x: lead.x, z: lead.z } : { x: task.hunt.rx, z: task.hunt.rz };
  const watch = watchOf(m, th);
  const rally = rallyFor(m, [from], th, watch);
  if (!rally) return;
  // A new order, with a number of its own: each man works the way out afresh when it reaches him.
  task.id = camp.nextTask++;
  task.x = th.x;
  task.z = th.z;
  task.issued = m.tick;
  // Sent on from where they are: nobody has far to come.
  task.hunt = { men: [...s.men], r: th.r, rx: rally.x, rz: rally.z, eta: 0, watch };
  s.task = task.id;
  s.x = th.x;
  s.z = th.z;
  s.point = th.point;
  s.legs++;
  s.heard = 'out';
  s.heardAt = m.tick;
  for (const id of s.men) if (camp.roster.find((g) => g.id === id)?.status === 'ok') out.push({ guard: id, task });
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
