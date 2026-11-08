import type { World } from '../kernel/world/world';
import { defaultTuning } from '../../config/tuning';
import { InvariantWatch, bodyHeight, bodyShape, createBody, eyeOf, mantleAt, stepMotor, type Cylinder, type MotorContext } from '../body';
import { analyzeCamp, buildWorld, campMission, generateWorld, infiltrate, spaceTimeSearch } from '../generation';
import type { LayerName } from '../lanes';
import { LAYERS } from '../lanes';
import { Hasher } from '../kernel/core/hash';
import { neutralInput } from '../kernel/input';
import { missionSpec } from '../kernel/mission';
import type { WorkCounts } from '../kernel/work';
import { ChaosBot } from './bots/chaos';
import { WanderBot } from './bots/wander';
import { PINNED_RUNS, behaviourInto } from './runs';
import { Simulation } from './sim';
import { Acoustics, SEED_LAW, SIGHT_LAW, crackHeard, drawnLit, emptyHeard, foliageOf, groundLight, shadeMap, sweepSight, type CrackHeard, type FlightPoint } from '../perception';
import { Solids } from '../kernel/world/solids';
import { datan2, dcos, dexp, dlog, dsin } from '../kernel/core/detmath';
import { air, defaultEnv } from '../kernel/env';
import { Rng } from '../kernel/core/rng';
import { runScene, sceneOver, sceneTicks, startScene, type Scene as KernelScene } from '../kernel/scene';
import { emptyEstimate, fuseBearings, inEllipse, type Bearing, type FuseGrid } from '../brain';
import { POLICIES, pursuit } from './baselines';
import { campScenario } from './scenes/campScenario';
import type { Tuning } from '../../config/tuning';
import { withSystem, type System } from '../kernel/systems';
import { Surface } from '../kernel/world/surfaces';
import { giveBrains } from './brains';
import { campCommander, commsVoice, giveCommander } from './comms';
import { PERCEPTION, giveSenses } from './perception';
import { placePlayer } from './setup';
import { SYSTEMS } from './systems';
import { campHeight, campWorld } from './scenes/campBrain';
import { labWorld } from './scenes/perceptionLab';
import { arenaWorld } from './scenes/movementLab';
import { SCENES } from './scenes';
import { Blocks, pushOutCircle } from '../kernel/world/colliders';
import { sightLine, type QueryView } from '../kernel/world/query';
import { emptyShape } from '../kernel/world/shape';
import { SIGHT_TABLE, sightScenario } from './scenes/sightScenario';
import { FACTORS, SITTING, generateSitting, pairsCovered, scoreSitting, verdict, type Trial } from './trials';
import { SWAY_RUNGS, decisionSensitivity, swayRadius, sweepCases, sweepWorst } from './ballisticsBench';

/** A metric to four decimals: enough to see a change, and the same bits everywhere it's computed. */
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/**
 * A bench for every lane (docs/foundation-shape.md): where "better" is measured instead
 * of claimed. A lane's bench is
 * - its pinned runs (runs.ts), whose fingerprints are golden (golden.ts), so a change
 *   shows which lane moved;
 * - the work each system does in them (kernel/work.ts): rays, grid nodes and bodies,
 *   deterministic and pinned, which turns rule 18's budgets into numbers;
 * - its quality metrics, deterministic numbers that say how good the lane is.
 *
 * Work and metrics are pinned in benchGolden.ts, which `npm run bench -- --write`
 * rewrites; review its diff as you would a moved golden. `npm run explain` prints both
 * beside every moved fingerprint. A lab improves its lane against its bench, and adds to
 * it: lab A its detection times, lab B its reticle error, lab E its search cycles.
 */

export interface Bench {
  /** What the bench measures, in words. */
  readonly about: string;
  /** The lane's quality metrics, by name: deterministic, so they can be pinned. */
  metrics(): Record<string, number>;
}

/** Each valley is played by both bots for a minute while every body's promises are checked. */
const BODY_RUNS = ['TAL-4471', 'MUD-9031'];
/** Seeds no lab tunes against: generation's held-out series. */
const GENERATION_SEEDS = ['BNC-0101', 'BNC-0202', 'BNC-0303', 'BNC-0404', 'BNC-0505', 'BNC-0606'];

export const BENCHES: Readonly<Record<LayerName, Bench>> = {
  kernel: {
    about: 'Runs with every lane switched off, and bodies spawned inside a tick: pinned by their fingerprints and work.',
    metrics: () => ({}),
  },
  generation: {
    about:
      "Lab D: of a held-out series, Phase 0's valleys and lab D's valid at their first attempt, the least margin left under each budget, how much of the horizon lab D's ridges overlook, and the analysis of lab D's camps: valid at the first attempt, repaired, rules left broken, ways in and out, unsolved clusters, the busiest search, and safe intervals against the plain search.",
    metrics() {
      let first = 0;
      let margin = Infinity;
      const budget = defaultTuning.gen.world.maxGenAttempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(missionSpec(seed), defaultTuning);
        if (w.attempt === 0 && w.report.ok) first++;
        margin = Math.min(margin, budget - (w.attempt + 1));
      }
      // Lab D's valleys (D3), until D9 makes them the default.
      let campFirst = 0;
      let campMargin = Infinity;
      let widest = 0;
      let narrowestOpen = Infinity;
      const valleyBudget = defaultTuning.gen.landform.attempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(campMission(seed), defaultTuning);
        const v = w.report.valley!;
        if (w.attempt === 0 && v.ok) campFirst++;
        campMargin = Math.min(campMargin, valleyBudget - (w.attempt + 1));
        widest = Math.max(widest, Math.round(v.perchArcDeg));
        narrowestOpen = Math.min(narrowestOpen, Math.round(v.openGapDeg));
      }
      // Lab D's analysis of its camps (D7): ways in found, clusters left unsolved, and the
      // busiest search against its budget; and on the first, the gain of safe intervals over
      // the plain space-time search, by states expanded on the way in.
      let wayIn = 0;
      let unsolved = 0;
      let busiest = 0;
      let firstTry = 0;
      let repaired = 0;
      let broken = 0;
      let mostAttempts = 0;
      let sipp = 0;
      let plain = 0;
      let hardest: World | null = null;
      let hardestWork = -1;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(campMission(seed), defaultTuning);
        const a = w.report.camp!;
        if (a.infiltration.found && a.exfil.found) wayIn++;
        unsolved += a.clusters.filter((c) => c.certified === 'unsolved').length;
        busiest = Math.max(busiest, a.infiltration.expanded, a.sabotage.expanded, a.exfil.expanded, a.exfil2.expanded, a.vehicle.expanded);
        const repairs = w.report.repairs ?? [];
        if (w.report.validation!.ok && repairs.length === 0 && w.attempt === 0 && (w.report.campAttempt ?? 0) === 0) firstTry++;
        else if (w.report.validation!.ok) repaired++;
        broken += w.report.validation!.failed.length;
        mostAttempts = Math.max(mostAttempts, w.report.repairAttempts ?? 0);
        if (!hardest || a.infiltration.expanded > hardestWork) {
          hardest = w;
          hardestWork = a.infiltration.expanded;
        }
      }
      // The exact search against the plain one, on the camp whose way in was hardest to find
      // (the analysis itself runs a greedy search first, which finds a way sooner still).
      if (hardest) {
        const w = hardest;
        sipp = analyzeCamp(w.camp, w.terrain, w.colliders, w.grid, defaultTuning.gen, undefined, (S, E, M, Q) => infiltrate(S, E, M, { ...Q, weight: 1 })).analysis.infiltration.expanded;
        plain = analyzeCamp(w.camp, w.terrain, w.colliders, w.grid, defaultTuning.gen, undefined, spaceTimeSearch).analysis.infiltration.expanded;
      }
      return {
        [`valid at the first attempt (of ${GENERATION_SEEDS.length})`]: first,
        'least margin under the attempt budget': margin,
        [`lab D valleys valid at the first attempt (of ${GENERATION_SEEDS.length})`]: campFirst,
        'lab D least margin under the valley budget': campMargin,
        'lab D widest overwatched horizon (°)': widest,
        'lab D narrowest open horizon (°)': narrowestOpen,
        [`lab D camps valid at the first attempt, no repair (of ${GENERATION_SEEDS.length})`]: firstTry,
        'lab D camps repaired': repaired,
        'lab D rules still broken': broken,
        [`lab D most re-analyses in a repair (of ${defaultTuning.gen.validation.repairAttempts})`]: mostAttempts,
        [`lab D camps with a way in and out (of ${GENERATION_SEEDS.length})`]: wayIn,
        'lab D clusters left unsolved': unsolved,
        [`lab D busiest search (of ${defaultTuning.gen.analysis.maxExpansions} expansions)`]: busiest,
        'lab D hardest way in, states expanded: safe intervals': sipp,
        'lab D hardest way in, states expanded: plain space-time search': plain,
      };
    },
  },
  body: {
    about:
      "Lab C: the motor's promises under the person-like and the fuzzing bot, a minute each in two valleys, the closest calls, and the eye at the head: every lean's line of sight, both ways, beside the seed's camera-only lean.",
    metrics() {
      const m = {
        'body-ticks checked': 0,
        [`runs with a broken promise (of ${BODY_RUNS.length * 2})`]: 0,
        'bodies under the terrain': 0,
        'bodies inside something solid': 0,
        'worst overlap (m)': 0,
        'worst rise in a tick (m)': 0,
        'worst gain on steep ground (m)': 0,
      };
      for (const seed of BODY_RUNS) {
        const world = generateWorld(missionSpec(seed), defaultTuning);
        for (const bot of [new WanderBot(seed), new ChaosBot(seed)]) {
          const sim = new Simulation(world, defaultTuning);
          const watch = new InvariantWatch(sim);
          const raw = neutralInput();
          for (let i = 0; i < 60 * defaultTuning.sim.tickHz; i++) {
            watch.beforeTick();
            sim.step(bot.next(sim, raw));
            watch.afterTick();
          }
          const r = watch.report;
          m['body-ticks checked'] += r.checks;
          if (r.first) m[`runs with a broken promise (of ${BODY_RUNS.length * 2})`]++;
          m['bodies under the terrain'] += r.below;
          m['bodies inside something solid'] += r.inside;
          m['worst overlap (m)'] = Math.max(m['worst overlap (m)'], r.worstOverlap);
          m['worst rise in a tick (m)'] = Math.max(m['worst rise in a tick (m)'], r.worstRise);
          m['worst gain on steep ground (m)'] = Math.max(m['worst gain on steep ground (m)'], r.steepGain);
        }
      }
      return { ...m, ...eyeToHead(), ...mantleMeetsWalker(), ...proneBench() };
    },
  },
  perception: {
    about:
      "Lab A: the sight rate law swept over the factor grid against the design doc's ranges, beside the seed's (Blacklist's model with the table as rates); the sight scenarios run whole; foliage symmetric to the bit.",
    metrics: perceptionMetrics,
  },
  brain: {
    about:
      "Lab E: search cycle length, the calibration of the camp's estimate of where a shot came from, the search map's size, how often the honest brain re-finds an intruder against the baselines (omniscient, staleness, plain, random), and how many reactions are explained back to a percept.",
    metrics: brainMetrics,
  },
  ballistics: {
    about: 'Lab B: the reticle against the impact within 1 cm over the sweep, decision sensitivity at 300 m, and the sway ladder.',
    metrics() {
      const m: Record<string, number> = {};
      m[`reticle against impact, worst of ${sweepCases().length} shots (cm)`] = round4(sweepWorst(defaultTuning) * 100);
      const s = decisionSensitivity(defaultTuning);
      m['300 m walker: head radius (mil)'] = round4(s.head);
      m['300 m walker: drop skipped (mil off)'] = round4(s.drop);
      m['300 m walker: lead skipped (mil off)'] = round4(s.lead);
      m['300 m walker: wind skipped (mil off)'] = round4(s.wind);
      m['300 m walker: ranged by eye, 15% out (mil off)'] = round4(s.ranging);
      for (const rung of SWAY_RUNGS) m[`sway, ${rung.name} (mil, 95th percentile)`] = round4(swayRadius(rung, defaultTuning));
      return m;
    },
  },
  game: { about: "The valley's plays, which exercise every lane together: pinned by their fingerprints and work.", metrics: () => ({}) },
};

/**
 * Prone (C2): how far a lying body's shape goes into what's solid, with the chain and with
 * the seed's single 0.3 m circle standing in for it: the fuzzing bot on the movement course
 * for ten minutes and in two valleys for five each (long enough to outweigh where the bot
 * happens to wander), and a body turning right round between two walls a metre apart.
 * Measured independently of the motor, as a part's penetration in three dimensions (the
 * least of how far it is in horizontally, under the top and over the bottom), allowing
 * 2 cm. The shape is straight, so a leg lying up over a ledge can cut its corner: the
 * chain doesn't (the invariant watch), but the capsules that stand for it here can.
 */
function proneBench(): Record<string, number> {
  const seed = structuredClone(defaultTuning);
  seed.bodies.player.parts.chainSpacing = 0;
  const walls = [
    { kind: 'box' as const, x: 0, z: -0.6, y0: -0.3, y1: 2, hx: 8, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock },
    { kind: 'box' as const, x: 0, z: 0.6, y0: -0.3, y1: 2, hx: 8, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock },
  ];
  const trench = buildWorld({ name: 'bench-trench', size: 40, cell: 0.5, colliders: walls, spawn: { x: 0, z: 0, faceX: 1, faceZ: 0 } }, defaultTuning.gen);
  const ids: number[] = [];
  const push = { x: 0, z: 0 };
  const shape = emptyShape();
  const depth = (sim: Simulation, x: number, y: number, z: number, r: number): number => {
    let worst = 0;
    sim.solids.query(x - r - 0.1, z - r - 0.1, x + r + 0.1, z + r + 0.1, ids);
    for (const id of ids) {
      const c = sim.solids.get(id);
      if ((c.flags & Blocks.Move) === 0 || c.y1 <= y - r || c.y0 >= y + r || !pushOutCircle(c, x, z, r, push)) continue;
      worst = Math.max(worst, Math.min(Math.sqrt(push.x * push.x + push.z * push.z), c.y1 - (y - r), y + r - c.y0));
    }
    return worst;
  };
  const measure = (sim: Simulation, tally: { inside: number; deepest: number; poses: number }): void => {
    const b = sim.player;
    if (!(b.lying > 0.99)) return;
    tally.poses++;
    const s = bodyShape(b, sim.tuning.bodies.player, shape);
    let worst = depth(sim, s.head.x, s.head.y, s.head.z, s.head.r);
    for (const c of [s.torso, s.legs]) {
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        worst = Math.max(worst, depth(sim, c.ax + (c.bx - c.ax) * f, c.ay + (c.by - c.ay) * f, c.az + (c.bz - c.az) * f, c.r));
      }
    }
    if (worst > 0.02) tally.inside++;
    tally.deepest = Math.max(tally.deepest, worst);
  };
  const course = (tuning: typeof defaultTuning): { inside: number; deepest: number; poses: number } => {
    const tally = { inside: 0, deepest: 0, poses: 0 };
    const play = (sim: Simulation, botSeed: string, minutes: number): void => {
      const bot = new ChaosBot(botSeed);
      const raw = neutralInput();
      for (let i = 0; i < minutes * 60 * 30; i++) {
        sim.step(bot.next(sim, raw));
        measure(sim, tally);
      }
    };
    play(startScene(SCENES['movement-course']!() as unknown as KernelScene<Simulation>, tuning), 'BENCH-COURSE', 10);
    for (const valley of ['TAL-4471', 'MUD-9031']) play(new Simulation(generateWorld(missionSpec(valley), tuning), tuning), valley, 5);
    return tally;
  };
  const between = (tuning: typeof defaultTuning): { inside: number; deepest: number; poses: number } => {
    const tally = { inside: 0, deepest: 0, poses: 0 };
    const sim = new Simulation(trench, tuning);
    const input = neutralInput(sim.player.yaw);
    for (let i = 0; i < 12 * 30; i++) {
      input.prone = i === 0;
      if (i > 30) {
        input.yaw += 0.08;
        input.moveZ = i % 60 < 30 ? 1 : -1;
      }
      sim.step(input);
      measure(sim, tally);
    }
    return tally;
  };
  const a = course(defaultTuning);
  const b = course(seed);
  const c = between(defaultTuning);
  const d = between(seed);
  return {
    'prone: fuzzing bot on the course and in two valleys, lying poses checked': a.poses,
    'prone: fuzzing bot on the course and in two valleys, poses with a part inside something solid': a.inside,
    'seed · single circle: fuzzing bot on the course and in two valleys, lying poses checked': b.poses,
    'seed · single circle: fuzzing bot on the course and in two valleys, poses with a part inside something solid': b.inside,
    'prone: turning between walls a metre apart, poses with a part inside something solid': c.inside,
    'seed · single circle: turning between walls a metre apart, poses with a part inside something solid': d.inside,
    'prone: deepest any part goes into something solid (m)': round(Math.max(a.deepest, c.deepest)),
    'seed · single circle: deepest any part goes into something solid (m)': round(Math.max(b.deepest, d.deepest)),
  };
}

/**
 * Lean, and the eye at the head (C3): for 2,000 lean poses around the movement lab's walls
 * and a guard somewhere beyond, the line from the eye to the guard's head and the line
 * back. They are one segment, so they agree, bit for bit. Beside it the seed: a lean that
 * moves the camera and leaves the body's shape where it was, Dishonored's hidden lean, and
 * how often it sees a guard who has no line to the head he would aim at.
 */
function eyeToHead(): Record<string, number> {
  const world = arenaWorld(defaultTuning);
  const solids = new Solids(world.colliders);
  const view: QueryView = { world, solids, bodies: [] };
  const rng = new Rng('BENCH-C', 'lean');
  const P = defaultTuning.bodies.player;
  const G = defaultTuning.bodies.guard;
  const shape = emptyShape();
  const eye = { x: 0, y: 0, z: 0 };
  let differ = 0;
  let inView = 0;
  let unseen = 0;
  const pairs = 2000;
  for (let k = 0; k < pairs; k++) {
    const x = rng.range(-56, 56);
    const z = rng.range(-5, 2);
    const b = createBody(world, solids, P, x, z, 0, -1);
    b.yaw = rng.range(-Math.PI, Math.PI);
    b.lean = (rng.chance(0.5) ? 1 : -1) * rng.range(P.lean.peek * 0.5, P.lean.weapon);
    const head = bodyShape(b, P, shape).head;
    const g = createBody(world, solids, G, x + rng.range(-25, 25), z + rng.range(-20, 20), 0, 1);
    eyeOf(g, G, eye);
    const sees = sightLine(view, head.x, head.y, head.z, eye.x, eye.y, eye.z, Blocks.Sight);
    const seen = sightLine(view, eye.x, eye.y, eye.z, head.x, head.y, head.z, Blocks.Sight);
    if (sees !== seen) differ++;
    if (sees) inView++;
    // The seed: the camera moved aside, the head he aims at left over the feet.
    if (sees && !sightLine(view, eye.x, eye.y, eye.z, b.x, b.y + b.eyeHeight, b.z, Blocks.Sight)) unseen++;
  }
  return {
    [`lean: eye-to-head lines that differ by direction (of ${pairs})`]: differ,
    [`lean: pairs in view (of ${pairs})`]: inView,
    [`seed · lean: pairs where the camera sees a guard who has no line to the head (of ${pairs})`]: unseen,
  };
}

/**
 * The mantle's every pose, checked every tick (C4): over a wall, as someone walks across
 * where it lands, timed to reach it just as the mantle does. The seed, The Dark Mod's
 * mantle, validated its endpoint once, and goes through him.
 */
function mantleMeetsWalker(): Record<string, number> {
  const P = defaultTuning.bodies.player;
  const dt = 1 / defaultTuning.sim.tickHz;
  const wall = { kind: 'box' as const, x: 0, z: -0.15, y0: -0.3, y1: 1, hx: 3, hz: 0.15, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
  const world = buildWorld({ name: 'bench-mantle', size: 30, cell: 0.5, colliders: [wall], spawn: { x: 0, z: 2 } }, defaultTuning.gen);
  const solids = new Solids(world.colliders);
  const speed = defaultTuning.bodies.guard.speed.walk;
  const walker: Cylinder = { x: 0, y: 0, z: -0.62, radius: 0.3, height: 1.85 };
  const crossing = 0.62; // seconds until he is where the mantle lands
  const placed = (t: number): void => {
    walker.x = (t - crossing) * speed;
  };
  const body = createBody(world, solids, P, 0, 0.4, 0, -1);
  const ctx: MotorContext = { world, solids, tuning: defaultTuning, dt, tick: 1, source: 1, others: [walker], emit: () => 0 };
  const inside = (x: number, y: number, z: number, height: number): boolean => {
    const dx = x - walker.x;
    const dz = z - walker.z;
    const rr = P.radius + walker.radius - 1e-3;
    return dx * dx + dz * dz < rr * rr && y < walker.y + walker.height && walker.y < y + height;
  };
  // The mantle as it runs: it waits for him.
  let ours = 0;
  let plan: { points: number[]; legs: number[] } | null = null;
  placed(0);
  for (let t = 1; t <= 90; t++) {
    ctx.tick = t;
    placed((t - 1) * dt);
    stepMotor(body, { tick: t, wishX: 0, wishZ: 0, gait: 'idle', yaw: body.yaw, pitch: 0, lean: 0, raised: false, climb: t === 1, climbAxis: 0, load: 1, scrape: false }, P, ctx);
    plan ??= body.mantle ? { points: [...body.mantle.points], legs: [...body.mantle.legs] } : null;
    if (inside(body.x, body.y, body.z, bodyHeight(body, P))) ours++;
  }
  // The seed: the same path, checked when it starts and never again.
  let seed = 0;
  const pose = { x: 0, y: 0, z: 0 };
  if (plan) {
    const total = plan.legs.reduce((a, b) => a + b, 0);
    for (let t = 1; t <= 90; t++) {
      placed((t - 1) * dt);
      const when = Math.min(t * dt, total);
      mantleAt({ ...plan, t: 0, waited: 0, stand: false, grip: Surface.Rock, feet: Surface.Grass, grabbed: false, dropped: 0, grabAt: 0, then: -1 }, when, pose);
      if (when < total && inside(pose.x, pose.y, pose.z, P.height.crouch)) seed++;
    }
  }
  return { 'mantle: ticks inside someone walking across the landing': ours, 'seed · mantle checked once: ticks inside him': seed };
}

/** Lab E's bench (brain lane): docs/phase-1-plan.md, E · recorded before building. */
function brainMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  const T = defaultTuning;
  // The camp's memory.
  m['search map: numbers'] = T.brain.searchMap.cells * T.brain.searchMap.cells;
  // Search cycles: from the last report to the search's end, in the search scenarios.
  const cycles: number[] = [];
  for (let seed = 0; seed < 3; seed++) {
    const sc = campScenario(`script=search&seed=${seed}`);
    const sim = startScene(sc, T);
    const driver = sc.driver?.();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, T);
    let cycle = -1;
    while (!sceneOver(sc, sim, ticks) && cycle < 0) {
      const events = sim.step(driver ? driver.next(sim, raw) : raw);
      const camp = sim.index.of('commander')[0]!.camp;
      for (const e of events) if (e.type === 'level' && e.to === 'uneasy' && camp.search === null) cycle = (e.tick - camp.lastPercept) / T.sim.tickHz;
    }
    cycles.push(cycle);
  }
  m['search cycle: shortest (s)'] = round(Math.min(...cycles));
  m['search cycle: longest (s)'] = round(Math.max(...cycles));
  // Calibration: seeded shots, bearings with the stated error, the camp's ellipse.
  const rng = new Rng('BENCH-E', 'calibration');
  const grid: FuseGrid = { x: 0, z: 0, half: 720, cells: 120, rangeMin: 120, rangeMax: 480 };
  const sigma = (5 * Math.PI) / 180;
  const est = emptyEstimate();
  let in1 = 0;
  let in2 = 0;
  const N = 400;
  for (let k = 0; k < N; k++) {
    const a = rng.range(0, 2 * Math.PI);
    const r = Math.sqrt(rng.next() * (grid.rangeMax * grid.rangeMax - grid.rangeMin * grid.rangeMin) + grid.rangeMin * grid.rangeMin);
    const sx = r * dcos(a);
    const sz = r * dsin(a);
    const bs: Bearing[] = [];
    for (let i = 0; i < 2 + (k % 5); i++) {
      const x = rng.range(-30, 30);
      const z = rng.range(-30, 30);
      const dx = sx - x;
      const dz = sz - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const err = sigma * Math.sqrt(-2 * dlog(Math.max(1e-12, rng.next()))) * dcos(2 * Math.PI * rng.next());
      const c = dcos(err);
      const sn = dsin(err);
      bs.push({ x, z, ux: (dx / d) * c - (dz / d) * sn, uz: (dx / d) * sn + (dz / d) * c, sigma });
    }
    fuseBearings(bs, grid, est);
    if (inEllipse(est, sx, sz, 1)) in1++;
    if (inEllipse(est, sx, sz, 2)) in2++;
  }
  m['ellipse: contains the shooter at 1 sigma (%)'] = round((100 * in1) / N);
  m['ellipse: contains the shooter at 2 sigma (%)'] = round((100 * in2) / N);
  // Relocation emerges (E8): after a shot at 300 m heard at ±5°, how often a move of 26–30 m
  // puts the shooter outside what the camp believes, with no meter anywhere.
  const moved = new Rng('BENCH-E', 'relocation');
  let across = 0;
  let any = 0;
  for (let k = 0; k < N; k++) {
    const a = moved.range(0, 2 * Math.PI);
    const sx = 300 * dcos(a);
    const sz = 300 * dsin(a);
    const bs: Bearing[] = [];
    for (let i = 0; i < 2 + (k % 5); i++) {
      const x = moved.range(-30, 30);
      const z = moved.range(-30, 30);
      const dx = sx - x;
      const dz = sz - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const err = sigma * Math.sqrt(-2 * dlog(Math.max(1e-12, moved.next()))) * dcos(2 * Math.PI * moved.next());
      const c = dcos(err);
      const sn = dsin(err);
      bs.push({ x, z, ux: (dx / d) * c - (dz / d) * sn, uz: (dx / d) * sn + (dz / d) * c, sigma });
    }
    fuseBearings(bs, grid, est);
    const step = moved.range(26, 30);
    const side = moved.next() < 0.5 ? 1 : -1;
    // Across the line of fire, as someone moving off it would; and in any direction at all.
    if (!inEllipse(est, sx - dsin(a) * step * side, sz + dcos(a) * step * side, 2)) across++;
    const b = moved.range(0, 2 * Math.PI);
    if (!inEllipse(est, sx + step * dcos(b), sz + step * dsin(b), 2)) any++;
  }
  m['relocation: 26–30 m across the line of fire, outside 2 sigma (%)'] = round((100 * across) / N);
  m['relocation: 26–30 m in any direction, outside 2 sigma (%)'] = round((100 * any) / N);
  // The same, in the world: guards hear real shots and radio their bearings, the commander fuses them.
  const world = inWorldCalibration(T, 100);
  m['ellipse in the world: contains the perch at 1 sigma (%)'] = world.one;
  m['ellipse in the world: contains the perch at 2 sigma (%)'] = world.two;
  m['ellipse in the world: mean bearings fused per shot'] = world.bearings;
  // Competence against the baselines: re-finding an intruder who has broken contact.
  // The window is pursuit's own: 60 s, about a search and the walk out to it.
  const horizon = 60;
  const seeds = 16;
  for (const policy of POLICIES) {
    let found = 0;
    for (let s = 0; s < seeds; s++) if (pursuit(policy, s, T, horizon) >= 0) found++;
    m[`re-found within ${horizon} s (of ${seeds}): ${policy}`] = found;
  }
  // The plan's competence target is before pacing throttles it: the same brain with every guard free to go.
  const unpaced = structuredClone(T);
  unpaced.brain.camp.slots.alert.search = 6;
  let freed = 0;
  for (let s = 0; s < seeds; s++) if (pursuit('honest', s, unpaced, horizon) >= 0) freed++;
  m[`re-found within ${horizon} s (of ${seeds}): honest, unpaced`] = freed;
  // Every reaction in the scripted scenarios has a chain of causes back to something sensed.
  let reactions = 0;
  let unexplained = 0;
  for (const params of ['script=suspicion&seed=0', 'script=search&seed=0']) {
    const sc = campScenario(params);
    const sim = startScene(sc, T);
    const driver = sc.driver?.();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, T);
    const byId = new Map<number, { type: string; cause: number }>();
    while (!sceneOver(sc, sim, ticks)) {
      for (const e of sim.step(driver ? driver.next(sim, raw) : raw)) {
        byId.set(e.id, { type: e.type, cause: e.cause });
        if (e.type !== 'act' || e.to === 'routine' || e.to === 'return') continue;
        reactions++;
        let cause = e.cause;
        let ok = false;
        for (let hops = 0; hops < 32 && cause !== 0; hops++) {
          const c = byId.get(cause);
          if (!c) break;
          if (PERCEPT_ROOTS.has(c.type)) {
            ok = true;
            break;
          }
          cause = c.cause;
        }
        if (!ok) unexplained++;
      }
    }
  }
  m['reactions (in the scripted scenarios)'] = reactions;
  m['reactions unexplained'] = unexplained;
  return m;
}

/**
 * The ellipse in the world (E8's exit metric): scripted shots from random perches around the
 * lab's camp, heard by its guards through perception, radioed in, fused by the commander.
 */
export function inWorldCalibration(T: Tuning, shots: number): { one: number; two: number; bearings: number } {
  const rng = new Rng('BENCH-E', 'perches');
  let in1 = 0;
  let in2 = 0;
  let have = 0;
  let bearings = 0;
  const F = T.brain.sniper.fusion;
  for (let k = 0; k < shots; k++) {
    const a = rng.range(0, 2 * Math.PI);
    const r = Math.sqrt(rng.next() * (F.rangeMax * F.rangeMax - F.rangeMin * F.rangeMin) + F.rangeMin * F.rangeMin);
    const px = r * dcos(a);
    const pz = r * dsin(a);
    const shot: System = {
      name: 'bench-shot',
      phase: 'commands',
      after: ['player-commands', 'rifle', 'sandbox-drops'],
      reads: [],
      writes: [],
      emits: ['report'],
      run(ctx) {
        if (ctx.tick === 30) ctx.emit({ type: 'report', source: 1, x: px, y: campHeight(px, pz) + 1.6, z: pz, surface: Surface.Grass, loudness: 2400 / ctx.tuning.noise.radiusPerUnit, radius: 2400, suppressed: 0 });
      },
    };
    let systems = SYSTEMS;
    for (const s of [...PERCEPTION, commsVoice, campCommander, shot]) systems = withSystem(systems, s);
    // Each shot in its own world seed: every guard's streams start from it, so his ear errs afresh.
    const shotWorld = campWorld(T);
    shotWorld.seed = `${shotWorld.seed}/shot${k}`;
    const sim = new Simulation(shotWorld, T, systems);
    placePlayer(sim, 372, 372);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    const raw = neutralInput();
    for (let i = 0; i < 14 * 30; i++) sim.step(raw);
    const camp = sim.index.of('commander')[0]!.camp;
    if (camp.shots.estimate) {
      have++;
      bearings += camp.shots.bearings.length;
      if (inEllipse(camp.shots.estimate, px, pz, 1)) in1++;
      if (inEllipse(camp.shots.estimate, px, pz, 2)) in2++;
    }
  }
  return { one: round((100 * in1) / Math.max(1, have)), two: round((100 * in2) / Math.max(1, have)), bearings: round(bearings / Math.max(1, have)) };
}

/** What a chain of causes can end in: something sensed (a sound or a sighting), or an order from what was sensed. */
const PERCEPT_ROOTS = new Set(['footstep', 'land', 'noise', 'report', 'impact', 'bark', 'heard', 'noticed', 'detected', 'radio', 'call', 'clatter', 'cry', 'bolt', 'death', 'checkin', 'order']);

/** Lab A's bench (perception lane): docs/phase-1-plan.md, A · recorded before building, says what each should be. */
function perceptionMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const [who, law] of [
    ['', SIGHT_LAW],
    ['seed · ', SEED_LAW],
  ] as const) {
    const r = sweepSight(defaultTuning, law);
    m[`${who}grid pairs checked`] = r.pairs;
    m[`${who}grid pairs filling slower with more exposure`] = r.violations;
    m[`${who}standing, walking, in the open: seen to (m)`] = r.standingReach;
    m[`${who}still, prone, in cover: seen to (m)`] = r.proneCoverReach;
    m[`${who}crouched, walking, in shade, 30 m: seconds`] = round(r.crouchShade30);
    m[`${who}a marksman's far zone: seen to (m)`] = r.farReach;
    m[`${who}least seconds from the first cue to 100%, outside contact`] = round(r.minCueSeconds);
    m[`${who}steepest edge: rate change per metre`] = round(r.steepestMetre);
    m[`${who}steepest edge: rate change per degree`] = round(r.steepestDegree);
  }
  let passed = 0;
  for (const params of SIGHT_TABLE) if (runScene(sightScenario(params), defaultTuning).failures.length === 0) passed++;
  m[`sight scenarios as expected (of ${SIGHT_TABLE.length})`] = passed;
  // Foliage, both ways, through every volume of the lab.
  const f = foliageOf(labWorld(defaultTuning));
  const rng = new Rng('BENCH-A', 'foliage');
  let asymmetric = 0;
  for (let k = 0; k < 2000; k++) {
    const v = f.volumes[k % f.volumes.length]!;
    const ax = v.x + rng.range(-30, 30);
    const ay = rng.range(0, 12);
    const az = v.z + rng.range(-30, 30);
    const bx = v.x + rng.range(-v.r, v.r);
    const by = rng.range(v.y0, v.y1);
    const bz = v.z + rng.range(-v.r, v.r);
    if (!Object.is(f.transmittance(ax, ay, az, bx, by, bz), f.transmittance(bx, by, bz, ax, ay, az))) asymmetric++;
  }
  m['foliage: pairs that differ by direction (of 2000)'] = asymmetric;
  // One law of sound: what the speakers hear and what a guard at the same place hears, bit for bit.
  const lab = labWorld(defaultTuning);
  const ears = new Acoustics(lab, defaultTuning);
  const guards = new Acoustics(lab, defaultTuning);
  const a = emptyHeard();
  const b = emptyHeard();
  let differ = 0;
  for (let k = 0; k < 200; k++) {
    const sx = -200 + rng.range(0, 80);
    const sz = -30 + rng.range(0, 60);
    const radius = rng.range(4, 40);
    const lx = sx + rng.range(-30, 30);
    const lz = sz + rng.range(-30, 30);
    ears.spread({ x: sx, y: 0, z: sz, radius });
    ears.hear(lx, 1.7, lz, a);
    guards.spread({ x: sx, y: 0, z: sz, radius });
    guards.hear(lx, 1.7, lz, b);
    if (!Object.is(a.clarity, b.clarity) || a.fromX !== b.fromX || a.fromZ !== b.fromZ || a.length !== b.length) differ++;
  }
  m['hearing: speakers and a guard at the same place differ (of 200)'] = differ;
  // Shade drawn as simulated (A4): the drawn map against the simulation's light, over the area and at the edges.
  const solids = new Solids(lab.colliders);
  const area = lab.shadeArea!;
  const map = shadeMap(lab, solids, lab.spec.env, 0, area, defaultTuning);
  const simLit = (x: number, z: number): boolean =>
    groundLight(lab, solids, lab.spec.env, 0, x, lab.terrain.heightAt(x, z), z, defaultTuning) === defaultTuning.visibility.light.lit;
  let agree = 0;
  for (let k = 0; k < 20000; k++) {
    const x = rng.range(area.x0, area.x1);
    const z = rng.range(area.z0, area.z1);
    if (drawnLit(map, x, z) === simLit(x, z)) agree++;
  }
  m['shade: drawn as simulated, of 20000 points'] = agree;
  const shaded: number[] = [];
  for (let k = 0; k < map.lit.length; k++) if (map.lit[k] === 0) shaded.push(k);
  let edges = 0;
  for (let k = 0; k < 6000; k++) {
    const c = shaded[rng.int(0, shaded.length - 1)]!;
    const x = map.x0 + ((c % map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
    const z = map.z0 + (Math.floor(c / map.nx) + 0.5) * map.cell + rng.range(-1.5, 1.5);
    if (drawnLit(map, x, z) === simLit(x, z)) edges++;
  }
  m['shade: drawn as simulated within 1.5 m of a shadow, of 6000 points'] = edges;
  // The crack (A5): listeners 5–15 m from a bullet's path at 300 m, its speed falling as a
  // drag constant makes it (790 m/s at the muzzle, about 650 m/s there).
  const angles = crackBias();
  m['crack at 300 m: least degrees off the shooter'] = round(Math.min(...angles));
  m['crack at 300 m: most degrees off the shooter'] = round(Math.max(...angles));
  m['seed · crack at 300 m: degrees off the shooter'] = 0;
  Object.assign(m, trialMetrics());
  return m;
}

/**
 * Trial mode (A12) on two pinned sittings: what the sittings hold, and how often the
 * protocol passes readers of known skill, against the plan's first rule (seed: 48 of 60
 * right). docs/research/foundations.md found the seed passes a reader who is right on every
 * clear trial and guesses the borderline ones about 18% of the time, and a true 80% reader
 * 57%.
 */
function trialMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  let candidates = 0;
  const seeds = ['BENCH-A-1', 'BENCH-A-2'];
  const sittings = seeds.map((seed) => generateSitting(seed, defaultTuning, undefined, () => candidates++));
  // The seed: trials taken as they come, freezes wherever there's a cue.
  const firstCome = seeds.map((seed) => generateSitting(seed, defaultTuning, { ...SITTING, pool: 1, balanceFreeze: false }));
  const scored = sittings.flatMap((ts) => ts.filter((t) => !t.warmup));
  m['trials: candidates run for two sittings'] = candidates;
  m['trials: scored trials in two sittings'] = scored.length;
  m['trials: pairs of factor levels the first sitting covers'] = pairsCovered(sittings[0]!);
  m['seed · trials: pairs of factor levels covered, taken first come'] = pairsCovered(firstCome[0]!);
  const key = (ts: readonly Trial[], f: (t: Trial) => boolean): Map<number, boolean> => new Map(ts.map((t) => [t.k, f(t)]));
  const rules = sittings.map((ts) => scoreSitting(ts, key(ts, (t) => t.rules)));
  m['trials: borderline right by the sight table alone (of 30)'] = rules[0]!.borderlineRight + rules[1]!.borderlineRight;
  m["trials: the rules-only predictor's balanced accuracy, first sitting (%)"] = round(rules[0]!.balanced * 100);
  m['trials: frozen at the first cue (of 60)'] = scored.filter((t) => t.freeze === 'cue').length;
  m['trials: cue-frozen trials where his head can be read'] = scored.filter((t) => t.freeze === 'cue' && t.legible.head).length;
  for (const f of FACTORS) m[`trials: borderline trials ${f} flips`] = scored.filter((t) => t.flips.includes(f)).length;
  // What the freeze gives away: the share seen in each kind, and readers who go by it.
  const seenShare = (ts: readonly Trial[], kind: Trial['freeze']): number => {
    const of = ts.filter((t) => !t.warmup && t.freeze === kind);
    return round((100 * of.filter((t) => t.seen).length) / Math.max(1, of.length));
  };
  for (const [tag, set] of [
    ['', sittings],
    ['seed · ', firstCome],
  ] as const) {
    const all = set.flat();
    m[`${tag}trials: seen among those frozen at the first cue (%)`] = seenShare(all, 'cue');
    m[`${tag}trials: seen among those frozen at the start (%)`] = seenShare(all, 'start');
    const read = (name: string, f: (t: Trial) => boolean): void => {
      const [x, y] = set as [Trial[], Trial[]];
      const v = verdict({ trials: x, answers: key(x, f) }, { trials: y, answers: key(y, f) });
      m[`${tag}trials: ${name}: balanced over both (%)`] = round(v.balanced * 100);
      m[`${tag}trials: ${name}: passes (0 or 1)`] = v.pass ? 1 : 0;
    };
    read('a reader who says yes only at a first-cue freeze', (t) => t.freeze === 'cue');
    read('a reader by the first cue\'s time, and the table otherwise', (t) => (t.freeze === 'cue' ? t.cueAt <= 2.4 : t.rules));
  }
  // Readers of known skill, 4000 pairs of sittings each.
  const rng = new Rng('BENCH-A', 'readers');
  const [a, b] = sittings as [Trial[], Trial[]];
  const readers: Array<[string, (t: Trial) => number]> = [
    ['right on every clear trial, guessing the borderline', (t) => (t.borderline ? 0.5 : 1)],
    ['right 80% of the time', () => 0.8],
    ['right 90% of the time', () => 0.9],
  ];
  for (const [who, p] of readers) {
    let ours = 0;
    let seed = 0;
    const draws = 4000;
    for (let k = 0; k < draws; k++) {
      const answers = (ts: readonly Trial[]): Map<number, boolean> => new Map(ts.map((t) => [t.k, rng.chance(p(t)) ? t.seen : !t.seen]));
      const A = answers(a);
      const B = answers(b);
      if (verdict({ trials: a, answers: A }, { trials: b, answers: B }).pass) ours++;
      const right = (ts: readonly Trial[], ans: Map<number, boolean>): number => ts.filter((t) => !t.warmup && ans.get(t.k) === t.seen).length;
      if (right(a, A) + right(b, B) >= 48) seed++;
    }
    m[`trials: a reader ${who}: passes (% of ${draws})`] = round((100 * ours) / draws);
    m[`seed · trials: a reader ${who}: passes (% of ${draws})`] = round((100 * seed) / draws);
  }
  return m;
}

/** Degrees between where the crack seems to come from and where the shooter is, for listeners near a path at 300 m. */
export function crackBias(): number[] {
  const v0 = 790;
  const k = 0.00065;
  const path: FlightPoint[] = [];
  for (let s = 0; s <= 420; s += 5) path.push({ x: s, y: 1.5, z: 0, t: (dexp(k * s) - 1) / (k * v0) });
  const out: CrackHeard = { x: 0, y: 0, z: 0, t: 0 };
  const c = air(defaultEnv()).speedOfSound;
  const angles: number[] = [];
  for (const side of [5, 10, 15]) {
    const L = { x: 300, y: 1.7, z: side };
    if (!crackHeard(path, L.x, L.y, L.z, c, out)) continue;
    const ax = out.x - L.x;
    const az = out.z - L.z;
    const bx = 0 - L.x;
    const bz = 0 - L.z;
    angles.push((datan2(Math.abs(ax * bz - az * bx), ax * bx + az * bz) * 180) / Math.PI);
  }
  return angles;
}

/** To 9 significant digits: metrics are pinned exactly, and their last bits are noise to a reader. */
function round(v: number): number {
  return Number.isFinite(v) ? Number(v.toPrecision(9)) : -1;
}

/** A pinned run as the bench sees it: its fingerprints, and the work each system did (systems that did none left out). */
export interface RunReport {
  behaviour: string;
  state: string;
  work: Record<string, WorkCounts>;
}

export interface LaneReport {
  runs: Record<string, RunReport>;
  metrics: Record<string, number>;
}

export type BenchReport = Record<LayerName, LaneReport>;

/** What benchGolden.ts pins for each lane: its metrics, and its runs' work (their fingerprints are golden.ts's). */
export type PinnedBench = Readonly<Record<LayerName, { metrics: Record<string, number>; runs: Record<string, { work: Record<string, WorkCounts> }> }>>;

/** Plays every pinned run and every lane's metrics. */
export function benchReport(): BenchReport {
  const report = {} as BenchReport;
  for (const lane of Object.keys(LAYERS) as LayerName[]) report[lane] = { runs: {}, metrics: BENCHES[lane].metrics() };
  for (const run of PINNED_RUNS) {
    const r = run.start();
    const h = new Hasher();
    while (!r.over) behaviourInto(h, r.sim, r.step());
    const work: Record<string, WorkCounts> = {};
    for (const w of r.sim.work()) if (w.rays + w.nodes + w.bodies > 0) work[w.system] = { rays: w.rays, nodes: w.nodes, bodies: w.bodies };
    report[run.lane].runs[run.name] = { behaviour: h.digest(), state: r.sim.hash(), work };
  }
  return report;
}
