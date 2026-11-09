import type { GenTuning } from '../../config/tuning';
import { DEG, datan2, dcos, dsin } from '../kernel/core/detmath';
import type { Rng } from '../kernel/core/rng';
import type { Heightfield } from '../kernel/world/heightfield';
import type { SpatialGrid } from '../kernel/world/grid';
import { GridSearch } from '../kernel/world/search';
import type { Camp, GuardRole, GuardSpawn } from './camp';
import type { CampSpec } from './campSpec';
import { minimumCut } from './chokepoints';
import { buried, needsWayIn } from './crux';
import type { DoorSpec } from './compound';
import { segmentDistance, type Point2 } from './paths';
import { naturalPeriod, nearestWalkable, patrolRoutine, pickScan, postRoutine, walkPath, type ScanKind, type Stop } from './patrols';
import { dropDuty, seesDrop, trackOf, type GuardTrack } from './field';
import { cellOf, centreOf, lineOfSight, lineOfSightStrict, type Raster } from './raster';
import { overviewPerches, perchSeesDeck, type PerchViews } from './perches';
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
 *   cycle in his building, and on an escort's camp (crux.ts) makes one walk out, with
 *   another guard's eye on him.
 *
 * Every routine is fitted to one cycle of the camp (patrols.ts), so the camp's rhythm
 * repeats exactly and its windows can be learned. Each guard draws from his own fork.
 */
export function staffCamp(camp: Camp, hf: Heightfield, grid: SpatialGrid, raster: Raster, perches: PerchViews, gen: GenTuning, spec: CampSpec, rng: Rng, routines: Rng): void {
  const S = gen.staffing;
  // Difficulty's main knob, after the number of guards: how big a sightline cluster may grow (design doc).
  const clusterMax = Math.round(S.clusterMax[0]! + (S.clusterMax[1]! - S.clusterMax[0]!) * spec.difficulty);
  const coreMax = Math.round(S.coreMax[0]! + (S.coreMax[1]! - S.coreMax[0]!) * spec.difficulty);
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
  // The way in is kept open only on a camp whose crux needs one; elsewhere it's what the
  // player has to find, and guards stand where they like.
  const crux = camp.crux ?? 'walk';
  let corridor: readonly Point2[] = needsWayIn(crux) ? L.skeleton.corridor : [];
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
    /** Other routes he might walk instead, best first (the target's errands, chosen against the perches). */
    options?: Array<{ stops: Stop[]; legs: Point2[][] }>;
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

  // Where the way in matters and the target's building stands away from the breach, the
  // straight line of the skeleton runs through other buildings: the guards are kept off the
  // way a body can actually walk, from just inside the breach to his door.
  if (needsWayIn(crux) && buried(crux)) {
    const [entry, inside, door] = [L.skeleton.corridor[2]!, L.skeleton.corridor[3]!, L.skeleton.corridor[4]!];
    const walked = walkPath(layer, search, inside, door);
    if (walked) corridor = [...L.skeleton.corridor.slice(0, 2), entry, ...walked, L.skeleton.corridor[5]!];
  }

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
  // He waits a pace inside each door, watching out through it: out of the perches' sight, not out of the yard's.
  const officerStop = (d: DoorSpec): Point2 => step(d, -S.workerInside);
  const officerWalk = barracksDoor ? route([officerStop(hqDoor), officerStop(barracksDoor)], [lookAt(officerStop(hqDoor), at(0, 0)), lookAt(officerStop(barracksDoor), at(0, 0))], ['half', 'quarter']) : null;
  // Workers' chores: the generator, the stores, the motor pool.
  // Most of them indoors (a pace inside the door), out of the perches' sight.
  const chores = [L.skeleton.sabotage, ...(['storage', 'mess', 'barracks'] as const).map((m) => doorOf(m)).filter((d): d is DoorSpec => d !== null).map((d) => step(d, -S.workerInside))];
  const vehicle = (camp.vehicles ?? []).find((v) => v.escape);
  if (vehicle) chores.push({ x: vehicle.x + L.vx * 3, z: vehicle.z + L.vz * 3 });

  // Patrol loops on the lanes: the perimeter, the yard, and the alleys around each side.
  const lane = gen.compound.lane / 2;
  const y = L.yard;
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
  // Where the crux isn't the way in, his doors are held first: whoever means to reach him
  // has a man to deal with on each, so getting in isn't the cheap answer it would otherwise
  // be. On an escort's camp the target walks out of that door, so the man stands at its
  // shoulder, clear of the way out, and watches him go.
  if (!needsWayIn(crux)) {
    const aside = crux === 'escort' ? (rng.fork('door-shoulder').chance(0.5) ? gen.crux.doorShoulder : -gen.crux.doorShoulder) : 0;
    for (const k of [...hq.doors].reverse()) {
      const d = camp.doors![k]!;
      const front = step(d, gen.crux.doorPost);
      const post = { x: front.x + d.ux * aside, z: front.z + d.uz * aside };
      sentryPosts.unshift({ at: post, look: lookAt(post, { x: post.x - d.nx * 4, z: post.z - d.nz * 4 }) });
    }
  }
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
  const witnessSamples = Math.round(cycle / gen.analysis.dt);
  /** How long each perch has him in view, as validation counts it: a share of the cycle. */
  const perchShares = (t: GuardTrack): number[] =>
    perches.views.map((v, p) => {
      if (t.onDeck) return perchSeesDeck(raster, hf, perches.spots[p]!, t.x[0]!, t.chest[0]!, t.z[0]!) ? 1 : 0;
      let n = 0;
      for (let k = 0; k < witnessSamples; k++) {
        const c = cellOf(raster, t.x[k]!, t.z[k]!);
        if (c >= 0 && t.chest[k]! >= v[c]!) n++;
      }
      return n / witnessSamples;
    });
  chooseTargetRoutine();
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

  /**
   * The target's routine, against the perches: no perch may have him in view more than
   * `maxTarget` of the cycle, and his crux says what else (crux.ts). His spot indoors is the
   * one in his building the fewest perches see. A buried target stays there. On an escort's
   * camp he walks out, on a walk a perch can have him on; failing that, on the errand any
   * perch sees least; failing that, he stays in.
   */
  function chooseTargetRoutine(): void {
    const plan = plans.find((p) => p.role === 'target');
    if (!plan) return;
    const V = gen.validation;
    const overviews = overviewPerches(raster, perches.views, L.halfA, L.halfB, gen);
    const fork = rng.fork('target-routine');
    // Where indoors: the walkable cell of his building fewest perches see at chest height. A
    // buried target also stands out of line of his door, so that nobody can get him through
    // it from the yard: to reach him you have to step inside.
    const doorsOf = hq.doors.map((i) => camp.doors![i]!);
    const seenThroughDoor = (m: { x: number; y: number; z: number }): number => {
      const chest = m.y + gen.sight.chest;
      let seen = 0;
      for (const d of doorsOf) {
        for (const out of gen.crux.doorLineOut) {
          for (const side of gen.crux.doorLineSide) {
            const px = d.x - d.nx * out + d.ux * side;
            const pz = d.z - d.nz * out + d.uz * side;
            if (lineOfSightStrict(raster, px, hf.heightAt(px, pz) + gen.sight.crouchHead, pz, m.x, chest, m.z)) seen++;
          }
        }
      }
      return seen;
    };
    const inside: Point2 = (() => {
      let best: Point2 = { x: hq.x, z: hq.z };
      let bestCount = Infinity;
      let bestDoor = Infinity;
      let bestD = Infinity;
      const halfL = hq.length / 2 - gen.compound.wallThickness - 0.5;
      const halfD = hq.depth / 2 - gen.compound.wallThickness - 0.5;
      for (let c = 0; c < raster.na * raster.nb; c++) {
        if (!raster.walk[c]) continue;
        const m = centreOf(raster, c);
        const dx = m.x - hq.x;
        const dz = m.z - hq.z;
        const along = dx * hq.ux + dz * hq.uz;
        const across2 = -dx * hq.uz + dz * hq.ux;
        if (Math.abs(along) > halfL || Math.abs(across2) > halfD) continue;
        const chest = m.y + gen.sight.chest;
        let count = 0;
        for (const v of perches.views) if (chest >= v[c]!) count++;
        const door = buried(crux) ? seenThroughDoor(m) : 0;
        const d = dx * dx + dz * dz;
        if (count < bestCount || (count === bestCount && (door < bestDoor || (door === bestDoor && d < bestD)))) {
          best = { x: m.x, z: m.z };
          bestCount = count;
          bestDoor = door;
          bestD = d;
        }
      }
      return best;
    })();
    const scan = { scanAmp: R.headScanDeg * DEG * 0.4, scanPeriod: scanEvery, scanPhase: 0 };
    const lookIn = lookAt(inside, across);
    // A buried target stays indoors, at the spot the perches can't reach.
    if (buried(crux)) {
      plan.stops = undefined;
      plan.legs = undefined;
      plan.loop = undefined;
      plan.perCycle = undefined;
      plan.options = undefined;
      plan.post = { at: inside, look: lookIn, scan: 'glance' };
      return;
    }
    // His walk out: to one of the other buildings; failing those, a few steps out of his own door.
    const hqDoors = hq.doors.map((i) => camp.doors![i]!);
    const nearby: Point2[] = hqDoors.flatMap((d) => [step(d, 8), step(d, 5)]);
    // Round the side of his building, for different perches' sake.
    for (const side of [1, -1]) nearby.push({ x: hq.x - hq.uz * side * (hq.depth / 2 + 3), z: hq.z + hq.ux * side * (hq.depth / 2 + 3) }, { x: hq.x + hq.ux * side * (hq.length / 2 + 3), z: hq.z + hq.uz * side * (hq.length / 2 + 3) });
    // And out into the open before his door, in a fan.
    for (const d of hqDoors) {
      for (const dist of S.targetFan) {
        for (let k = -2; k <= 2; k++) {
          const out = { x: -d.nx, z: -d.nz };
          const c = dcos((k * Math.PI) / 6);
          const sn = dsin((k * Math.PI) / 6);
          nearby.push({ x: d.x + (out.x * c - out.z * sn) * dist, z: d.z + (out.z * c + out.x * sn) * dist });
        }
      }
    }
    const errands = [...fork.shuffle([doorOf('mess'), doorOf('barracks'), doorOf('storage')].filter((d): d is DoorSpec => d !== null).map((d) => step(d, 2.5))), ...fork.shuffle(nearby)];
    // An escort's walk must be one a perch can have him on; which of them is picked later,
    // once every guard is placed, for how often another guard has him too (rechooseTargetWalk).
    type Option = { stops?: Stop[]; legs?: Point2[][]; max: number; two: boolean; seenBy: number };
    const options: Option[] = [];
    for (const e of errands) {
      // Enough to choose from when he's placed: each route is a grid search, so stop there. An escort's walk needs them all compared.
      if (crux === 'walk' && options.filter((o) => o.max <= V.maxTarget - S.targetMargin && o.two).length >= S.targetOptions) break;
      const r = route([inside, e], [lookIn, lookAt(e, inside)], ['glance', 'glance']);
      if (!r) continue;
      r.stops[0]!.weight = 1;
      r.stops[1]!.weight = 0;
      r.stops[1]!.dwell = S.dwell[0]!;
      if (naturalPeriod(r.legs, r.stops, R) > cycle) continue;
      const t = trackOf(patrolRoutine(r.legs, r.stops, R, cycle, 0, scan), null, raster, gen, witnessSamples, gen.analysis.dt);
      const shares = perchShares(t);
      // A walk's use to the plan: for a 'walk' crux, two overviews must have him long enough; for an escort, one perch.
      const seenBy = shares.filter((x) => x * cycle >= V.targetSeconds).length;
      options.push({ stops: r.stops, legs: r.legs, max: Math.max(...shares), two: crux === 'walk' ? shares.filter((x, i) => overviews[i] && x * cycle >= V.targetSeconds).length >= V.longRangePerches : seenBy >= 1, seenBy });
    }
    // The walks within the limit, those a perch can use first; they're tried in that
    // order when he's placed, since a post at his door can rule one out.
    const within = options.filter((o) => o.max <= V.maxTarget - S.targetMargin);
    const ordered = [...within.filter((o) => o.two), ...within.filter((o) => !o.two)];
    if (ordered.length > 0) {
      plan.stops = ordered[0]!.stops;
      plan.legs = ordered[0]!.legs;
      plan.options = ordered.map((o) => ({ stops: o.stops!, legs: o.legs! }));
      plan.post = undefined;
      plan.loop = 'target';
      plan.perCycle = 1;
      return;
    }
    // Every walk out is seen too long: he stays in, at his spot.
    plan.stops = undefined;
    plan.legs = undefined;
    plan.loop = undefined;
    plan.perCycle = undefined;
    plan.post = { at: inside, look: lookIn, scan: 'glance' };
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
      if (dropDuty(raster, candidate, placed[i]!.sight, witnessSamples, gen, S.estimateStep) >= gen.analysis.clusterDuty) links.push([m, i]);
      if (dropDuty(raster, placed[i]!.sight, candidate, witnessSamples, gen, S.estimateStep) >= gen.analysis.clusterDuty) links.push([i, m]);
    }
    const sizes = componentSizes(m + 1, (a, b) => (a === m || b === m ? links.some(([x, y]) => x === a && y === b) : edges[a]![b]!));
    const largest = Math.max(...sizes);
    const cores = sizes.filter((x) => x > clusterMax).length;
    // A guard who'd watch the way in for long fits worse than any cluster.
    const watch = corridorWatch(candidate);
    const ok = largest <= coreMax && cores <= 1 && watch <= S.corridorWatch;
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
    let looked = 0;
    for (let k = 0; k < witnessSamples; k += S.estimateStep) {
      looked++;
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
    return watched / looked;
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
    let fallback: { routine: Routine; plan: Plan; xz: Float64Array; sight: GuardTrack; links: Array<[number, number]>; largest: number } | null = null;
    let done = false;
    // The route he has, or, for the target, each of his errands in turn.
    const scan = scanOf(r);
    const variants = p.plan.options?.map((o) => ({ routine: patrolRoutine(o.legs, o.stops, R, r.period, r.offset!, scan), plan: { ...p.plan, stops: o.stops, legs: o.legs } })) ?? [{ routine: r, plan: p.plan }];
    for (const variant of variants) {
      for (let k = 0; k < S.offsetTries && !done; k++) {
        const routine = { ...variant.routine, offset: (variant.routine.offset! + (variant.routine.period * k) / S.offsetTries) % variant.routine.period };
        const xz = track(routine);
        if (placed.some((q) => q.xz && clashes(q.xz, xz))) continue;
        const sight = sightOf(routine, null, p.plan.role);
        const fit = clusterLimit(sight);
        if (fit.ok) {
          accept({ plan: variant.plan, order: p.order }, routine, xz, sight, fit.links);
          done = true;
        } else if (!fallback || fit.largest < fallback.largest) fallback = { routine, plan: variant.plan, xz, sight, links: fit.links, largest: fit.largest };
      }
      if (done) break;
    }
    if (done || !mandatory(p.plan.role)) continue;
    if (fallback) {
      accept({ plan: fallback.plan, order: p.order }, fallback.routine, fallback.xz, fallback.sight, fallback.links);
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
  rechooseTargetWalk();
  easeCoverage();
  timeWitnesses();
  placed.sort((a, b) => a.order - b.order); // unique: each guard's place in the roster

  /**
   * No perch may have more than `maxCoverage` of the guards' time in view (validation): while
   * one comes within a margin of it, the post it sees most moves to the nearest ground that
   * perch can't see, within reach, keeping clear of the others (a fixed number of rounds).
   */
  function easeCoverage(): void {
    const V = gen.validation;
    const limit = V.maxCoverage - S.coverageMargin;
    const shares = placed.map((q) => perchShares(q.sight));
    const coverage = (p: number): number => shares.reduce((sum, row) => sum + row[p]!, 0) / placed.length;
    const excess = (rows: number[][]): number => perches.views.reduce((sum, _, p) => sum + Math.max(0, rows.reduce((t, row) => t + row[p]!, 0) / placed.length - limit), 0);
    for (let round = 0; round < S.coverageRounds; round++) {
      // Every perch over the limit: moving a post has to help them all, or it only hands him to another.
      const over = perches.views.map((_, p) => p).filter((p) => coverage(p) > limit);
      if (over.length === 0) return;
      const before = excess(shares);
      const candidates = placed
        .map((q, i) => ({ q, i, share: Math.max(...over.map((p) => shares[i]![p]!)) }))
        .filter(({ q }) => q.plan.post && q.plan.post.elevated === undefined && q.plan.role !== 'target')
        .sort((a, b) => b.share - a.share || a.i - b.i); // unique: guard indices
      let moved = false;
      for (const { q, i } of candidates) {
        const at = postAt(q.routine);
        let best: { x: number; z: number; seen: number; d: number } | null = null;
        for (let c = 0; c < raster.na * raster.nb; c++) {
          if (!raster.walk[c]) continue;
          const m = centreOf(raster, c);
          const d = (m.x - at.x) * (m.x - at.x) + (m.z - at.z) * (m.z - at.z);
          if (d > V.hideReach * V.hideReach) continue;
          let seen = 0;
          for (const p of over) if (m.y + gen.sight.chest >= perches.views[p]![c]!) seen++;
          if (!best || seen < best.seen || (seen === best.seen && d < best.d)) best = { x: m.x, z: m.z, seen, d };
        }
        if (!best || best.seen >= over.length) continue;
        const where = snap(best);
        if (!where) continue;
        const routine: Routine = { ...q.routine, legs: q.routine.legs.map((l) => (l.kind === 'hold' ? { ...l, x: where.x, z: where.z } : l)) };
        const xz = track(routine);
        if (placed.some((o) => o !== q && o.xz && clashes(o.xz, xz))) continue;
        const sight = sightOf(routine, null, q.plan.role);
        const next = perchShares(sight);
        const trial = shares.map((row, g) => (g === i ? next : row));
        if (excess(trial) >= before - 1e-9) continue;
        q.routine = routine;
        q.xz = xz;
        q.sight = sight;
        shares[i] = next;
        moved = true;
        break;
      }
      if (!moved) return;
    }
  }

  /**
   * A perch that sees two guards or more must see one who would be seen dropping by a guard
   * it can't see at that moment (validation). Where a perch breaks that, a walker's start
   * time is shifted, a few steps at a time, as long as that reduces the perches breaking it
   * and leaves everyone clear of each other (a fixed number of tries).
   */
  function timeWitnesses(): void {
    const V = gen.validation;
    const seenShare = V.seenSeconds / cycle;
    const n = placed.length;
    const K = witnessSamples;
    const seenAt = perches.views.map(() => placed.map(() => new Uint8Array(K)));
    const setSeen = (g: number): void => {
      const t = placed[g]!.sight;
      perches.views.forEach((v, p) => {
        const row = seenAt[p]![g]!;
        if (t.onDeck) row.fill(perchSeesDeck(raster, hf, perches.spots[p]!, t.x[0]!, t.chest[0]!, t.z[0]!) ? 1 : 0);
        else for (let k = 0; k < K; k++) {
          const c = cellOf(raster, t.x[k]!, t.z[k]!);
          row[k] = c >= 0 && t.chest[k]! >= v[c]! ? 1 : 0;
        }
      });
    };
    for (let g = 0; g < n; g++) setSeen(g);
    const edge = placed.map(() => placed.map(() => new Uint8Array(K)));
    const setEdges = (g: number): void => {
      for (let o = 0; o < n; o++) {
        if (o === g) continue;
        for (let k = 0; k < K; k += S.estimateStep) {
          edge[g]![o]![k] = seesDrop(raster, placed[g]!.sight, placed[o]!.sight, k, gen) ? 1 : 0;
          edge[o]![g]![k] = seesDrop(raster, placed[o]!.sight, placed[g]!.sight, k, gen) ? 1 : 0;
        }
      }
    };
    for (let g = 0; g < n; g++) setEdges(g);
    // This is an estimate from every few samples, so a camp built around a crux, which has
    // fewer men in the open to go wrong with, keeps a margin over the rule.
    const needed = V.watchedDuty + (crux === 'walk' ? 0 : S.witnessMargin);
    const breaking = (): number => {
      let bad = 0;
      for (let p = 0; p < perches.views.length; p++) {
        const inView: number[] = [];
        for (let g = 0; g < n; g++) {
          let c = 0;
          for (let k = 0; k < K; k++) c += seenAt[p]![g]![k]!;
          if (c / K >= seenShare - 1e-9) inView.push(g);
        }
        if (inView.length < 2) continue;
        let watched = false;
        for (const v of inView) {
          for (let u = 0; u < n && !watched; u++) {
            if (u === v) continue;
            let count = 0;
            let of = 0;
            for (let k = 0; k < K; k += S.estimateStep) {
              of++;
              if (edge[u]![v]![k] && seenAt[p]![v]![k] && !seenAt[p]![u]![k]) count++;
            }
            if (count / of >= needed) watched = true;
          }
          if (watched) break;
        }
        if (!watched) bad++;
      }
      return bad;
    };
    let bad = breaking();
    if (bad === 0) return;
    const walkers = placed.map((q, i) => ({ q, i })).filter(({ q }) => q.routine.offset !== undefined && q.plan.role !== 'target');
    for (let tries = 0; tries < S.witnessTries && bad > 0; tries++) {
      const { q, i } = walkers[tries % walkers.length] ?? { q: null, i: -1 };
      if (!q) return;
      const before = { routine: q.routine, xz: q.xz, sight: q.sight };
      const routine = { ...q.routine, offset: (q.routine.offset! + (q.routine.period * (1 + (tries % 7))) / 8) % q.routine.period };
      const xz = track(routine);
      if (placed.some((o) => o !== q && o.xz && clashes(o.xz, xz))) continue;
      q.routine = routine;
      q.xz = xz;
      q.sight = sightOf(routine, null, q.plan.role);
      setSeen(i);
      setEdges(i);
      const now = breaking();
      if (now < bad) bad = now;
      else {
        q.routine = before.routine;
        q.xz = before.xz;
        q.sight = before.sight;
        setSeen(i);
        setEdges(i);
      }
    }
    // A camp built around a crux has fewer men in the open to shift, so if that wasn't enough
    // a man on the ground is turned to have somebody else in his eye, as long as that keeps
    // him off the way in (a fixed number of tries).
    if (crux === 'walk') return;
    const posted = placed.map((q, i) => ({ q, i })).filter(({ q }) => q.plan.post !== undefined && q.plan.post.elevated === undefined && q.plan.role !== 'target');
    for (let tries = 0; tries < S.witnessTries && bad > 0 && posted.length > 0; tries++) {
      const { q, i } = posted[tries % posted.length]!;
      const turn = S.witnessTurns[Math.floor(tries / posted.length) % S.witnessTurns.length]!;
      const post = q.plan.post!;
      const before = { routine: q.routine, sight: q.sight };
      const routine = postRoutine(postAt(q.routine), post.look + turn * DEG, post.scan, R, cycle, scanOf(q.routine));
      const sight = sightOf(routine, null, q.plan.role);
      if (corridorWatch(sight) > S.corridorWatch) continue;
      q.routine = routine;
      q.sight = sight;
      setEdges(i);
      const now = breaking();
      if (now < bad) bad = now;
      else {
        q.routine = before.routine;
        q.sight = before.sight;
        setEdges(i);
      }
    }
  }

  /**
   * With every guard placed, the target's walk out is chosen again. On an escort's camp it's
   * the walk a perch can use where another guard has him most often (the crux). On the old
   * promise ('walk'), it's one that two of the perches that see half the camp have him on.
   */
  function rechooseTargetWalk(): void {
    const target = placed.find((q) => q.plan.role === 'target');
    if (!target?.plan.options || target.plan.options.length < (crux === 'escort' ? 1 : 2)) return;
    const V = gen.validation;
    const seen = placed.filter((q) => q !== target).map((q) => perchShares(q.sight).map((x) => x * cycle >= V.seenSeconds - 1e-9));
    const half = Math.ceil(placed.length / 2);
    const wide = perches.views.map((_, p) => seen.filter((row) => row[p]).length + 1 >= half);
    const score = (t: GuardTrack): number => perchShares(t).filter((x, p) => wide[p] && x * cycle >= V.targetSeconds).length;
    const r = target.routine;
    const scan = scanOf(r);
    // An escort: of the walks a perch can use, the one where a perch has him most often with
    // another guard's eye on him. Nobody is posted to do it; the walk is chosen.
    if (crux === 'escort') {
      const inAnyView = (t: GuardTrack, k: number): boolean => {
        const c = cellOf(raster, t.x[k]!, t.z[k]!);
        return c >= 0 && perches.views.some((v) => t.chest[k]! >= v[c]!);
      };
      const witnessed = (t: GuardTrack): number => {
        let seen = 0;
        let watched = 0;
        for (let k = 0; k < witnessSamples; k += S.estimateStep) {
          if (!inAnyView(t, k)) continue;
          seen++;
          if (placed.some((q) => q !== target && seesDrop(raster, q.sight, t, k, gen))) watched++;
        }
        return seen > 0 ? watched / seen : 0;
      };
      let top: { routine: Routine; xz: Float64Array; sight: GuardTrack; option: (typeof target.plan.options)[number]; share: number } | null = null;
      for (const o of target.plan.options) {
        const routine = patrolRoutine(o.legs, o.stops, R, r.period, r.offset!, scan);
        const xz = track(routine);
        if (placed.some((q) => q !== target && q.xz && clashes(q.xz, xz))) continue;
        const sight = sightOf(routine, null, 'target');
        const shares = perchShares(sight);
        if (shares.filter((x) => x * cycle >= V.targetSeconds).length < 1 || Math.max(...shares) > V.maxTarget - S.targetMargin) continue;
        const share = witnessed(sight);
        if (!top || share > top.share + 1e-9) top = { routine, xz, sight, option: o, share };
      }
      if (top) {
        target.routine = top.routine;
        target.xz = top.xz;
        target.sight = top.sight;
        target.plan = { ...target.plan, stops: top.option.stops, legs: top.option.legs };
      }
      return;
    }
    if (score(target.sight) >= V.longRangePerches) return;
    for (const o of target.plan.options) {
      const routine = patrolRoutine(o.legs, o.stops, R, r.period, r.offset!, scan);
      const xz = track(routine);
      if (placed.some((q) => q !== target && q.xz && clashes(q.xz, xz))) continue;
      const sight = sightOf(routine, null, 'target');
      if (score(sight) < V.longRangePerches) continue;
      if (Math.max(...perchShares(sight)) > V.maxTarget - S.targetMargin) continue;
      target.routine = routine;
      target.xz = xz;
      target.sight = sight;
      target.plan = { ...target.plan, stops: o.stops, legs: o.legs };
      return;
    }
  }

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

