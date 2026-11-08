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
import { dropDuty, trackOf, type GuardTrack } from './field';
import { cellOf, centreOf, lineOfSight, type Raster } from './raster';
import { contactRate, reachOf, sightRate } from './sight';
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
export function staffCamp(camp: Camp, hf: Heightfield, grid: SpatialGrid, raster: Raster, gen: GenTuning, spec: CampSpec, rng: Rng, routines: Rng): void {
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
    /** Walk it this many times a cycle, if not as often as it fits. */
    perCycle?: number;
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
  // Inside, he faces across the room, neither door in his eyes; outside he lingers only briefly.
  const across = { x: hq.x - hqDoor.nz, z: hq.z + hqDoor.nx };
  const targetWalk = errand ? route([{ x: hq.x, z: hq.z }, step(errand, 2.5)], [lookAt({ x: hq.x, z: hq.z }, across), lookAt(step(errand, 2.5), { x: hq.x, z: hq.z })], ['glance', 'glance']) : null;
  if (targetWalk) {
    targetWalk.stops[0]!.weight = 1;
    targetWalk.stops[1]!.weight = 0;
    targetWalk.stops[1]!.dwell = S.dwell[0]!;
  }
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
      // His walk out happens once a cycle: his window.
      if (targetWalk) plans.push({ role, stops: targetWalk.stops, legs: targetWalk.legs, loop: 'target', perCycle: 1 });
      else plans.push({ role, post: { at: { x: hq.x, z: hq.z }, look: lookAt({ x: hq.x, z: hq.z }, hqDoor), scan: 'glance' } });
    } else if (role === 'marksman') {
      const t = towers.shift();
      if (t) plans.push({ role, post: { at: { x: t.x, z: t.z }, look: outward({ x: t.x, z: t.z }), scan: 'half', elevated: t.deck } });
    } else if (role === 'radio-operator') {
      const radio = L.buildings.find((b) => b.module === 'radio');
      if (radio) {
        // At his set, against the wall across from the door: his back to the yard.
        const set = (camp.devices ?? []).find((d) => d.kind === 'radio') ?? camp.doors![radio.doors[0]!]!;
        plans.push({ role, post: { at: { x: radio.x, z: radio.z }, look: lookAt({ x: radio.x, z: radio.z }, set), scan: 'glance' } });
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
    const k = p.perCycle ?? Math.max(1, Math.floor(cycle / own + 1e-9));
    const period = cycle / k;
    const nth = seen.get(p.loop!) ?? 0;
    seen.set(p.loop!, nth + 1);
    const count = onLoop.get(p.loop!)!;
    // Patrols sharing a loop walk it evenly apart; a lone one starts wherever its fork says.
    const offset = count > 1 ? (period * nth) / count : orng.range(0, period);
    pending.push({ plan: p, routine: patrolRoutine(p.legs!, p.stops!, R, period, offset, scan) });
  }

  // Each guard is placed in turn, posts first: on a routine that keeps him at least
  // `clearance` from every other all cycle, and, as far as one can, without growing the
  // sightline graph's clusters past their limits (a few small clusters and one hard core:
  // the design doc's sightline puzzle, shaped on purpose). A walker tries start times, a post
  // tries facing another way; each takes the first that fits, within a fixed number of tries
  // (rule 18). The last of a role who fits nowhere is kept anyway, his walk turned into a
  // post if he can't walk clear, so all seven roles stay.
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
  const witnessSamples = Math.round(cycle / gen.analysis.dt);
  interface Placed {
    plan: Plan;
    routine: Routine;
    xz: Float64Array | null;
    sight: GuardTrack;
    order: number;
  }
  const placed: Placed[] = [];
  /** Witness edges among the placed guards, by placed index: a sees b drop for at least clusterDuty. */
  const edges: boolean[][] = [];
  const clusterLimit = (candidate: GuardTrack): { ok: boolean; largest: number; links: Array<[number, number]> } => {
    const m = placed.length;
    const links: Array<[number, number]> = [];
    for (let i = 0; i < m; i++) {
      if (dropDuty(raster, candidate, placed[i]!.sight, witnessSamples, gen) >= gen.analysis.clusterDuty) links.push([m, i]);
      if (dropDuty(raster, placed[i]!.sight, candidate, witnessSamples, gen) >= gen.analysis.clusterDuty) links.push([i, m]);
    }
    const sizes = componentSizes(m + 1, (a, b) => (a === m || b === m ? links.some(([x, y]) => x === a && y === b) : edges[a]![b]!));
    const largest = Math.max(...sizes);
    const cores = sizes.filter((x) => x > S.clusterMax).length;
    // A guard who'd watch the way in for long fits worse than any cluster.
    const watch = corridorWatch(candidate);
    const ok = largest <= S.coreMax && cores <= 1 && watch <= S.corridorWatch;
    return { ok, largest: largest + (watch > S.corridorWatch ? 100 * watch : 0), links };
  };
  const accept = (p: { plan: Plan; order: number }, routine: Routine, xz: Float64Array | null, sight: GuardTrack, links: Array<[number, number]>) => {
    const m = placed.length;
    placed.push({ plan: p.plan, routine, xz, sight, order: p.order });
    for (const row of edges) row.push(false);
    edges.push(new Array<boolean>(m + 1).fill(false));
    for (const [a, b] of links) edges[a]![b] = true;
  };
  const sightOf = (r: Routine, deck: number | null, role: GuardRole): GuardTrack => trackOf(r, deck, raster, gen, witnessSamples, gen.analysis.dt, -1, role === 'marksman');
  // The skeleton's way in, cell by cell: no guard may watch it for long, so it stays a way in.
  const corridorCells: Array<{ x: number; z: number; y: number }> = [];
  {
    const seenCells = new Set<number>();
    for (let k = 0; k + 1 < corridor.length; k++) {
      const a = corridor[k]!;
      const b = corridor[k + 1]!;
      const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
      for (let d = 0; d <= len; d += raster.cell / 2) {
        const c = cellOf(raster, a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len);
        if (c < 0 || seenCells.has(c) || !raster.walk[c]) continue;
        seenCells.add(c);
        const m = centreOf(raster, c);
        corridorCells.push({ x: m.x, z: m.z, y: m.y + gen.sight.crouchHead });
      }
    }
  }
  /** The share of the cycle a guard would see an intruder's head somewhere on the corridor, by lab D's sight law. */
  const corridorWatch = (t: GuardTrack): number => {
    let watched = 0;
    const reach = reachOf(t.far ? gen.sight.intruder.far : gen.sight.intruder.core, gen.sight);
    for (let k = 0; k < witnessSamples; k++) {
      for (const p of corridorCells) {
        const dx = p.x - t.x[k]!;
        const dz = p.z - t.z[k]!;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > reach || d < 1e-6) continue;
        const cos = ((dx * raster.ux + dz * raster.uz) * t.ga[k]! + (dx * raster.vx + dz * raster.vz) * t.gb[k]!) / d;
        const off = datan2(Math.sqrt(Math.max(0, 1 - cos * cos)), cos) / DEG;
        if (sightRate(d, off, 1, t.far, gen.sight) <= 0 && contactRate(d, 1, gen.sight) <= 0) continue;
        if (lineOfSight(raster, t.x[k]!, t.eye[k]!, t.z[k]!, p.x, p.y, p.z)) {
          watched++;
          break;
        }
      }
    }
    return watched / witnessSamples;
  };
  const indexed = pending.map((p, order) => ({ ...p, order }));
  const mandatory = (role: GuardRole): boolean => !placed.some((q) => q.plan.role === role);
  // Posts on the towers, then on the ground, then the guards who walk.
  const onDecks = indexed.filter((p) => p.plan.post?.elevated !== undefined);
  const posts = indexed.filter((p) => p.plan.post && p.plan.post.elevated === undefined);
  const walkers = indexed.filter((p) => !p.plan.post);
  for (const p of [...onDecks, ...posts]) {
    const post = p.plan.post!;
    const deck = post.elevated ?? null;
    let fallback: { routine: Routine; xz: Float64Array | null; sight: GuardTrack; links: Array<[number, number]>; largest: number } | null = null;
    let done = false;
    for (const turn of [0, 90, -90, 180]) {
      const routine = turn === 0 ? p.routine : postRoutine(postAt(p.routine), post.look + turn * DEG, post.scan, R, cycle, scanOf(p.routine));
      const xz = deck === null ? track(routine) : null;
      if (xz && placed.some((q) => q.xz && clashes(q.xz, xz))) continue;
      const sight = sightOf(routine, deck, p.plan.role);
      const fit = clusterLimit(sight);
      if (fit.ok) {
        accept(p, routine, xz, sight, fit.links);
        done = true;
        break;
      }
      if (!fallback || fit.largest < fallback.largest) fallback = { routine, xz, sight, links: fit.links, largest: fit.largest };
    }
    if (!done && fallback && mandatory(p.plan.role)) accept(p, fallback.routine, fallback.xz, fallback.sight, fallback.links);
  }
  for (const p of walkers) {
    const r = p.routine;
    let fallback: { routine: Routine; xz: Float64Array; sight: GuardTrack; links: Array<[number, number]>; largest: number } | null = null;
    let done = false;
    for (let k = 0; k < S.offsetTries && !done; k++) {
      const routine = { ...r, offset: (r.offset! + (r.period * k) / S.offsetTries) % r.period };
      const xz = track(routine);
      if (placed.some((q) => q.xz && clashes(q.xz, xz))) continue;
      const sight = sightOf(routine, null, p.plan.role);
      const fit = clusterLimit(sight);
      if (fit.ok) {
        accept(p, routine, xz, sight, fit.links);
        done = true;
      } else if (!fallback || fit.largest < fallback.largest) fallback = { routine, xz, sight, links: fit.links, largest: fit.largest };
    }
    if (done || !mandatory(p.plan.role)) continue;
    if (fallback) {
      accept(p, fallback.routine, fallback.xz, fallback.sight, fallback.links);
      continue;
    }
    // He can't walk clear at any start: he holds one of his stops instead.
    for (const st of p.plan.stops!) {
      const post = postRoutine({ x: st.x, z: st.z }, st.look, 'quarter', R, cycle, scanOf(r));
      const xz = track(post);
      if (placed.some((q) => q.xz && clashes(q.xz, xz))) continue;
      const sight = sightOf(post, null, p.plan.role);
      accept({ plan: { role: p.plan.role, post: { at: { x: st.x, z: st.z }, look: st.look, scan: 'quarter' } }, order: p.order }, post, xz, sight, clusterLimit(sight).links);
      break;
    }
  }
  // The target is never left out: without him there's no mission.
  if (!placed.some((q) => q.plan.role === 'target')) {
    const t = indexed.find((q) => q.plan.role === 'target')!;
    placed.push({ plan: t.plan, routine: t.routine, xz: null, sight: sightOf(t.routine, null, 'target'), order: t.order });
  }
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

/** Where a post's routine holds. */
function postAt(r: Routine): Point2 {
  const leg = r.legs[0]!;
  return leg.kind === 'hold' ? { x: leg.x, z: leg.z } : { x: leg.x0, z: leg.z0 };
}

function scanOf(r: Routine): { scanAmp: number; scanPeriod: number; scanPhase: number } {
  return { scanAmp: r.scanAmp, scanPeriod: r.scanPeriod, scanPhase: r.scanPhase };
}

/**
 * The sizes of the strongly connected components of a small directed graph, by mutual
 * reachability (n is at most the guard cap, so the cube is cheap).
 */
function componentSizes(n: number, edge: (a: number, b: number) => boolean): number[] {
  const reach: boolean[][] = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => a === b || edge(a, b)));
  for (let k = 0; k < n; k++) for (let a = 0; a < n; a++) if (reach[a]![k]) for (let b = 0; b < n; b++) if (reach[k]![b]) reach[a]![b] = true;
  const seen = new Array<boolean>(n).fill(false);
  const sizes: number[] = [];
  for (let a = 0; a < n; a++) {
    if (seen[a]) continue;
    let size = 0;
    for (let b = 0; b < n; b++) {
      if (!seen[b] && reach[a]![b] && reach[b]![a]) {
        seen[b] = true;
        size++;
      }
    }
    sizes.push(size);
  }
  return sizes;
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
