import type { GenTuning } from '../../config/tuning';
import { DEG, datan2, dcos, dsin } from '../kernel/core/detmath';
import type { Rng } from '../kernel/core/rng';
import type { Heightfield } from '../kernel/world/heightfield';
import type { SpatialGrid } from '../kernel/world/grid';
import { GridSearch } from '../kernel/world/search';
import type { Camp, GuardRole, GuardSpawn } from './camp';
import type { CampSpec } from './campSpec';
import { minimumCut } from './chokepoints';
import type { DoorSpec } from './compound';
import type { Point2 } from './paths';
import { naturalPeriod, nearestWalkable, patrolRoutine, pickScan, postRoutine, walkPath, type ScanKind, type Stop } from './patrols';
import { routinePose, type Routine, type RoutinePose } from './routine';

/**
 * Staffing a generated camp (lab D, D6). Guards are bought with points, as Dead Cells and
 * RimWorld budget their enemies: the camp's difficulty sets the points, every one of the
 * seven roles is bought once first (the design doc's roles all have a consequence when
 * removed), then more sentries, patrols, marksmen and workers by a priority list, never
 * past the cap of 16 (counted, rule 18).
 *
 * - **Sentries** stand at the camp's real chokepoints: inside the gate, and the narrowest
 *   passages between its zones (chokepoints.ts), each a minimum cut no wider than
 *   `chokeWidth`, kept off the skeleton's way in.
 * - **Patrols** walk loops on the camp's lanes (the perimeter lane, the yard, the alleys
 *   between parcels), along grid paths, with stops from the grammar (patrols.ts). Two on
 *   one loop walk it half a period apart.
 * - **Marksmen** hold the tower decks; the **radio operator** his room; the **officer**
 *   walks between the target's building and the barracks; **workers** go about their
 *   chores between the generator, the stores and the motor pool; the **target** spends the
 *   cycle in his building but for one walk out, his window.
 *
 * Every routine is fitted to one cycle of the camp (patrols.ts), so the camp's rhythm
 * repeats exactly and its windows can be learned. Each guard draws from his own fork.
 */
export function staffCamp(camp: Camp, hf: Heightfield, grid: SpatialGrid, gen: GenTuning, spec: CampSpec, rng: Rng, routines: Rng): void {
  const S = gen.staffing;
  const R = gen.routines;
  const L = camp.layout!;
  const site = camp.site;
  const layer = grid.site;
  const search = new GridSearch(layer);
  const at = (a: number, b: number): Point2 => ({ x: site.x + L.ux * a + L.vx * b, z: site.z + L.uz * a + L.vz * b });
  const lookAt = (from: Point2, to: Point2): number => datan2(-(to.x - from.x), -(to.z - from.z));
  const doorOf = (module: string, k = 0): DoorSpec | null => {
    const b = L.buildings.find((x) => x.module === module);
    return b && b.doors[k] !== undefined ? camp.doors![b.doors[k]!]! : null;
  };
  const step = (d: DoorSpec, k: number): Point2 => ({ x: d.x - d.nx * k, z: d.z - d.nz * k });
  const corridor = L.skeleton.corridor;
  /** How far a point is from the skeleton's way in: posts keep off it. */
  const offCorridor = (p: Point2): number => {
    let best = Infinity;
    for (let k = 0; k + 1 < corridor.length; k++) best = Math.min(best, segmentDistance(p, corridor[k]!, corridor[k + 1]!));
    return best;
  };

  // --- What the points buy. ----------------------------------------------------------
  const points = S.points[0]! + (S.points[1]! - S.points[0]!) * spec.difficulty;
  const cost: Record<GuardRole, number> = { sentry: S.cost.sentry, patrol: S.cost.patrol, marksman: S.cost.marksman, 'radio-operator': S.cost.radio, officer: S.cost.officer, worker: S.cost.worker, target: 0 };
  const roster: GuardRole[] = ['target', 'radio-operator', 'officer', 'worker', 'marksman', 'sentry', 'patrol'];
  let spent = roster.reduce((sum, r) => sum + cost[r], 0);
  const limits: Partial<Record<GuardRole, number>> = { marksman: L.towers.length, worker: 3, officer: 1, 'radio-operator': 1, target: 1 };
  const prng = rng.fork('roster');
  // Harder camps lean on patrols and marksmen, easier ones on workers and sentries.
  const priority: GuardRole[] =
    spec.difficulty >= 0.5 ? ['patrol', 'sentry', 'marksman', 'patrol', 'sentry', 'worker', 'patrol', 'marksman', 'sentry', 'patrol'] : ['sentry', 'patrol', 'worker', 'sentry', 'marksman', 'patrol', 'worker', 'sentry', 'patrol', 'marksman'];
  for (let k = 0, tries = 0; roster.length < S.cap && tries < 40; tries++, k++) {
    const role = priority[k % priority.length]!;
    if (prng.chance(0.15)) continue; // a camp is a little irregular
    const have = roster.filter((r) => r === role).length;
    if (have >= (limits[role] ?? Infinity) || spent + cost[role] > points) continue;
    roster.push(role);
    spent += cost[role];
  }

  // --- Posts and routes. ---------------------------------------------------------------
  interface Plan {
    role: GuardRole;
    /** A post: where he holds, and what he watches. */
    post?: { at: Point2; look: number; scan: ScanKind; elevated?: number };
    /** A route: its stops, the legs between them, and which of the patrols on it he is. */
    stops?: Stop[];
    legs?: Point2[][];
    loop?: string;
  }
  const plans: Plan[] = [];
  const srng = rng.fork('posts');
  const dwell = () => srng.between(S.dwell);
  /** The middle of the walkable cell nearest a point: where a stop or a post really is. */
  const snap = (p: Point2): Point2 | null => {
    const c = nearestWalkable(layer, p.x, p.z);
    return c < 0 ? null : { x: layer.x0 + ((c % layer.nx) + 0.5) * layer.cell, z: layer.z0 + (Math.floor(c / layer.nx) + 0.5) * layer.cell };
  };
  /** A loop through the stops, along grid paths; null if a stop or a leg can't be walked. */
  const route = (wanted: Point2[], looks: number[], scans?: ScanKind[]): { stops: Stop[]; legs: Point2[][] } | null => {
    const pts = wanted.map(snap);
    if (pts.some((p) => p === null)) return null;
    const legs: Point2[][] = [];
    for (let k = 0; k < pts.length; k++) {
      const leg = walkPath(layer, search, pts[k]!, pts[(k + 1) % pts.length]!);
      if (!leg) return null;
      legs.push(leg);
    }
    return { stops: pts.map((p, k) => ({ x: p!.x, z: p!.z, scan: scans?.[k] ?? pickScan(srng), look: looks[k]!, dwell: dwell() })), legs };
  };

  // The target: in his building, with one walk out to the mess (or the motor pool) and back.
  const hq = L.buildings.find((b) => b.module === 'hq')!;
  const hqDoor = camp.doors![hq.doors[0]!]!;
  const errand = doorOf('mess') ?? doorOf('barracks');
  const targetWalk = errand ? route([{ x: hq.x, z: hq.z }, step(errand, 2.5)], [lookAt({ x: hq.x, z: hq.z }, hqDoor), lookAt(step(errand, 2.5), { x: hq.x, z: hq.z })], ['glance', 'glance']) : null;
  // The officer: between the target's door and the barracks, watching the yard.
  const barracksDoor = doorOf('barracks');
  const officerWalk = barracksDoor ? route([step(hqDoor, 3), step(barracksDoor, 3)], [lookAt(step(hqDoor, 3), at(0, 0)), lookAt(step(barracksDoor, 3), at(0, 0))], ['half', 'quarter']) : null;
  // Workers' chores: the generator, the stores, the motor pool.
  const chores = [L.skeleton.sabotage, ...(['storage', 'mess', 'barracks'] as const).map((m) => doorOf(m)).filter((d): d is DoorSpec => d !== null).map((d) => step(d, 2.5))];
  const vehicle = (camp.vehicles ?? []).find((v) => v.escape);
  if (vehicle) chores.push({ x: vehicle.x + L.vx * 3, z: vehicle.z + L.vz * 3 });

  // Patrol loops on the lanes: the perimeter, the yard, and the alleys around each side.
  const lane = gen.compound.lane / 2;
  const y = gen.compound.yard;
  const HA = L.halfA;
  const HB = L.halfB;
  const loops: Array<{ name: string; pts: Point2[] }> = [
    { name: 'perimeter', pts: [at(HA - lane, HB - lane), at(-HA + lane, HB - lane), at(-HA + lane, -HB + lane), at(HA - lane, -HB + lane)] },
    { name: 'yard', pts: [at(y - 1, y - 1), at(-y + 1, y - 1), at(-y + 1, -y + 1), at(y - 1, -y + 1)] },
    { name: 'back', pts: [at(-y - 1, HB - lane), at(-HA + lane, HB - lane), at(-HA + lane, -HB + lane), at(-y - 1, -HB + lane)] },
    // Each loop runs the lanes it shares with the perimeter the same way round, so patrols never meet head on.
    { name: 'left', pts: [at(-HA + lane, -y - 1), at(-HA + lane, -HB + lane), at(HA - lane, -HB + lane), at(HA - lane, -y - 1)] },
    { name: 'right', pts: [at(HA - lane, y + 1), at(HA - lane, HB - lane), at(-HA + lane, HB - lane), at(-HA + lane, y + 1)] },
  ];
  const centre = at(0, 0);
  const outward = (p: Point2): number => lookAt(centre, p) + 180 * DEG; // facing out, away from the middle
  const routes = loops
    .map((l) => ({ name: l.name, r: route(l.pts, l.pts.map((p) => (l.name === 'yard' ? lookAt(p, centre) : outward(p)))) }))
    .filter((l): l is { name: string; r: { stops: Stop[]; legs: Point2[][] } } => l.r !== null);

  // Sentry posts: inside the gate, then the narrowest passages between the camp's zones.
  const gate = L.openings.find((o) => o.kind === 'gate')!;
  const sentryPosts: Array<{ at: Point2; look: number }> = [{ at: at(gate.a - 4, gate.b + gate.width / 2 + 1.5), look: lookAt(at(gate.a - 4, gate.b), at(gate.a + 10, gate.b)) }];
  const zones = [at(0, 0), at(-HA + lane, 0), at(0, -HB + lane), at(0, HB - lane), at(HA - lane - 2, gate.b)];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const cut = minimumCut(layer, zones[i]!, 5, zones[j]!, 5, S.chokeWidth);
      if (!cut || offCorridor(cut) < 8) continue;
      if (sentryPosts.some((p) => (p.at.x - cut.x) * (p.at.x - cut.x) + (p.at.z - cut.z) * (p.at.z - cut.z) < 64)) continue;
      sentryPosts.push({ at: { x: cut.x, z: cut.z }, look: lookAt(zones[j]!, zones[i]!) });
    }
  }
  // Then the doors that matter, if posts are still wanted.
  for (const m of ['radio', 'storage', 'barracks'] as const) {
    const d = doorOf(m);
    if (d && offCorridor(step(d, 2)) > 8) sentryPosts.push({ at: step(d, 2), look: lookAt(d, step(d, 6)) });
  }

  const towers = [...L.towers];
  let patrolIndex = 0;
  let sentryIndex = 0;
  let workerIndex = 0;
  for (const role of roster) {
    if (role === 'target') {
      if (targetWalk) plans.push({ role, stops: targetWalk.stops, legs: targetWalk.legs, loop: 'target' });
      else plans.push({ role, post: { at: { x: hq.x, z: hq.z }, look: lookAt({ x: hq.x, z: hq.z }, hqDoor), scan: 'glance' } });
    } else if (role === 'marksman') {
      const t = towers.shift();
      if (t) plans.push({ role, post: { at: { x: t.x, z: t.z }, look: outward({ x: t.x, z: t.z }), scan: 'half', elevated: t.deck } });
    } else if (role === 'radio-operator') {
      const radio = L.buildings.find((b) => b.module === 'radio');
      if (radio) {
        const door = camp.doors![radio.doors[0]!]!;
        plans.push({ role, post: { at: { x: radio.x, z: radio.z }, look: lookAt({ x: radio.x, z: radio.z }, door), scan: 'glance' } });
      }
    } else if (role === 'officer') {
      if (officerWalk) plans.push({ role, stops: officerWalk.stops, legs: officerWalk.legs, loop: 'officer' });
      else plans.push({ role, post: { at: step(hqDoor, 3), look: lookAt(hqDoor, centre), scan: 'half' } });
    } else if (role === 'worker') {
      const a = chores[workerIndex % chores.length]!;
      const b = chores[(workerIndex + 1) % chores.length]!;
      workerIndex++;
      const r = route([a, b], [lookAt(a, b), lookAt(b, a)], ['glance', 'glance']);
      if (r) plans.push({ role, stops: r.stops.map((s) => ({ ...s, dwell: s.dwell * 4 })), legs: r.legs, loop: `worker${workerIndex}` });
    } else if (role === 'sentry') {
      const p = sentryPosts[sentryIndex++];
      if (p) plans.push({ role, post: { at: p.at, look: p.look, scan: 'sweep' } });
    } else if (role === 'patrol') {
      // The perimeter first, twice, then the yard and the alleys.
      const order = ['perimeter', 'yard', 'perimeter', 'back', 'left', 'right'];
      const name = order[patrolIndex++ % order.length]!;
      const r = routes.find((x) => x.name === name) ?? routes[patrolIndex % Math.max(1, routes.length)];
      if (r) plans.push({ role, stops: r.r.stops, legs: r.r.legs, loop: r.name });
    }
  }

  // --- One cycle for the whole camp. -------------------------------------------------
  // A route too long for the longest cycle gives up its dwells and scans first; if it
  // still doesn't fit, the cycle grows to hold it, since a routine cut short would jump.
  for (const p of plans) {
    if (p.stops && naturalPeriod(p.legs!, p.stops, R) > S.cycle[1]!) p.stops = p.stops.map((st) => ({ ...st, dwell: 0, scan: 'glance' }));
  }
  const natural = new Map<string, number>();
  for (const p of plans) if (p.stops && p.loop && !natural.has(p.loop)) natural.set(p.loop, naturalPeriod(p.legs!, p.stops, R));
  const longest = Math.max(0, ...natural.values());
  const cycle = Math.max(S.cycle[0]!, Math.ceil(longest / 10) * 10);
  const scanEvery = cycle / Math.max(1, Math.round(cycle / R.headScanPeriod));
  const onLoop = new Map<string, number>();
  for (const p of plans) if (p.loop) onLoop.set(p.loop, (onLoop.get(p.loop) ?? 0) + 1);
  const seen = new Map<string, number>();
  const orng = routines.fork('offsets');
  const pending: Array<{ plan: Plan; routine: Routine }> = [];
  for (const p of plans) {
    const scan = { scanAmp: R.headScanDeg * DEG * (p.role === 'worker' ? 0.35 : p.role === 'target' ? 0.4 : 1), scanPeriod: scanEvery, scanPhase: srng.range(0, 1) };
    if (p.post) {
      // A post on the ground stands on its nearest walkable cell; a tower's deck is its own.
      const where = p.post.elevated !== undefined ? p.post.at : (snap(p.post.at) ?? p.post.at);
      pending.push({ plan: p, routine: postRoutine(where, p.post.look, p.post.scan, R, cycle, scan) });
      continue;
    }
    const own = natural.get(p.loop!)!;
    // A period that divides the cycle: the longest that is at least the route's own.
    const k = Math.max(1, Math.floor(cycle / own + 1e-9));
    const period = cycle / k;
    const nth = seen.get(p.loop!) ?? 0;
    seen.set(p.loop!, nth + 1);
    const count = onLoop.get(p.loop!)!;
    // Patrols sharing a loop walk it evenly apart; a lone one starts wherever its fork says.
    const offset = count > 1 ? (period * nth) / count : orng.range(0, period);
    pending.push({ plan: p, routine: patrolRoutine(p.legs!, p.stops!, R, period, offset, scan) });
  }

  // No two guards come within a body's reach of each other on routine: the posts are
  // fixed, and each guard who walks tries offsets until he passes everyone clear, or is
  // left out (rule 18: a fixed number of tries).
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  const STEP = 0.25;
  const samples = Math.round(cycle / STEP);
  const track = (r: Routine): Float64Array => {
    const xz = new Float64Array(samples * 2);
    for (let k = 0; k < samples; k++) {
      routinePose(r, k * STEP, pose);
      xz[2 * k] = pose.x;
      xz[2 * k + 1] = pose.z;
    }
    return xz;
  };
  const reach2 = S.clearance * S.clearance;
  const clashes = (a: Float64Array, b: Float64Array): boolean => {
    for (let k = 0; k < samples; k++) {
      const dx = a[2 * k]! - b[2 * k]!;
      const dz = a[2 * k + 1]! - b[2 * k + 1]!;
      if (dx * dx + dz * dz < reach2) return true;
    }
    return false;
  };
  const placed: Array<{ plan: Plan; routine: Routine; xz: Float64Array | null; order: number }> = [];
  const indexed = pending.map((p, order) => ({ ...p, order }));
  const ground = indexed.filter((p) => p.plan.post?.elevated === undefined);
  for (const p of indexed) if (p.plan.post?.elevated !== undefined) placed.push({ ...p, xz: null });
  for (const p of ground.filter((q) => q.plan.post)) {
    const xz = track(p.routine);
    if (!placed.some((q) => q.xz && clashes(q.xz, xz))) placed.push({ ...p, xz });
  }
  for (const p of ground.filter((q) => !q.plan.post)) {
    const r = p.routine;
    const tries = S.offsetTries;
    let ok: { routine: Routine; xz: Float64Array } | null = null;
    for (let k = 0; k < tries && !ok; k++) {
      const candidate = { ...r, offset: (r.offset! + (r.period * k) / tries) % r.period };
      const xz = track(candidate);
      if (!placed.some((q) => q.xz && clashes(q.xz, xz))) ok = { routine: candidate, xz };
    }
    if (ok) placed.push({ plan: p.plan, routine: ok.routine, xz: ok.xz, order: p.order });
    else if (!placed.some((q) => q.plan.role === p.plan.role)) {
      // Every role is kept: the last of his role who can't walk clear holds one of his stops instead.
      for (const st of p.plan.stops!) {
        const post = postRoutine({ x: st.x, z: st.z }, st.look, 'quarter', R, cycle, { scanAmp: r.scanAmp, scanPeriod: r.scanPeriod, scanPhase: r.scanPhase });
        const xz = track(post);
        if (!placed.some((q) => q.xz && clashes(q.xz, xz))) {
          placed.push({ plan: { role: p.plan.role, post: { at: { x: st.x, z: st.z }, look: st.look, scan: 'quarter' } }, routine: post, xz, order: p.order });
          break;
        }
      }
    }
  }
  // The target is never left out: without him there's no mission.
  if (!placed.some((q) => q.plan.role === 'target')) placed.push({ ...indexed.find((q) => q.plan.role === 'target')!, xz: null });
  placed.sort((a, b) => a.order - b.order); // unique: each guard's place in the roster

  for (const { plan, routine } of placed) {
    routinePose(routine, 0, pose);
    // Facing from a yaw, the routine's own convention (yaw 0 faces −z).
    const face = { x: -dsin(pose.yaw), z: -dcos(pose.yaw) };
    const spawn: GuardSpawn = {
      id: camp.guards.length,
      role: plan.role,
      x: pose.x,
      y: plan.post?.elevated ?? hf.heightAt(pose.x, pose.z),
      z: pose.z,
      faceX: face.x,
      faceZ: face.z,
      elevated: plan.post?.elevated !== undefined,
      route: plan.legs ? plan.legs.flatMap((leg) => leg.slice(0, -1)) : null,
      routeStart: 0,
      scanPhase: routine.scanPhase,
      scanScale: 1,
      routine,
    };
    camp.guards.push(spawn);
  }
  camp.cycle = cycle;
  setObjective(camp);
}

declare module './camp' {
  interface Camp {
    /** Generated camps only: the seconds after which every routine in the camp repeats (D6). */
    cycle?: number;
  }
}

/** The mission's objective, once the camp has its target: him, his building, his vehicle. */
export function setObjective(camp: Camp): void {
  const L = camp.layout!;
  const target = camp.guards.findIndex((g) => g.role === 'target');
  if (target < 0) throw new Error('A camp with no target has no objective');
  camp.objective = {
    kind: 'eliminate',
    target,
    building: L.buildings.findIndex((b) => b.module === 'hq'),
    vehicle: (camp.vehicles ?? []).findIndex((v) => v.escape),
  };
}

function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + dx * t - p.x;
  const z = a.z + dz * t - p.z;
  return Math.sqrt(x * x + z * z);
}
