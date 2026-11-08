import { defaultTuning } from '../../config/tuning';
import { InvariantWatch } from '../body';
import { generateWorld } from '../generation';
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
import { runScene, sceneOver, sceneTicks, startScene } from '../kernel/scene';
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
    about: "Lab D: valleys valid at their first attempt, of a held-out series, and the least margin left under the attempt budget.",
    metrics() {
      let first = 0;
      let margin = Infinity;
      const budget = defaultTuning.gen.world.maxGenAttempts;
      for (const seed of GENERATION_SEEDS) {
        const w = generateWorld(missionSpec(seed), defaultTuning);
        if (w.attempt === 0 && w.report.ok) first++;
        margin = Math.min(margin, budget - (w.attempt + 1));
      }
      return { [`valid at the first attempt (of ${GENERATION_SEEDS.length})`]: first, 'least margin under the attempt budget': margin };
    },
  },
  body: {
    about: "Lab C: the motor's promises under the person-like and the fuzzing bot, a minute each in two valleys, and the closest calls.",
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
      return m;
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
  // The same, in the world: guards hear real shots and radio their bearings, the commander fuses them.
  const world = inWorldCalibration(T, 100);
  m['ellipse in the world: contains the perch at 1 sigma (%)'] = world.one;
  m['ellipse in the world: contains the perch at 2 sigma (%)'] = world.two;
  m['ellipse in the world: mean bearings fused per shot'] = world.bearings;
  // Competence against the baselines: re-finding an intruder who has broken contact.
  const horizon = 25;
  const seeds = 8;
  for (const policy of POLICIES) {
    let found = 0;
    for (let s = 0; s < seeds; s++) if (pursuit(policy, s, T, horizon) >= 0) found++;
    m[`re-found within ${horizon} s (of ${seeds}): ${policy}`] = found;
  }
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
function inWorldCalibration(T: Tuning, shots: number): { one: number; two: number; bearings: number } {
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
    const sim = new Simulation(campWorld(T), T, systems);
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
