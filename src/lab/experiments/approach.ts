import type { Tuning } from '../../config/tuning';
import { approachOf, emptyWay, eyesOn, navigatorOf, type Eyes } from '../../sim/brain';
import { liveCamp } from '../../sim/game/scenes/liveCamp';
import { Cell } from '../../sim/kernel/world/grid';
import type { World } from '../../sim/kernel/world/world';
import type { Arm, Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * The valley as a section reads it (brain/approach.ts), held against real lines of sight.
 *
 * A section going out after a shooter picks its way by a rough reading of the ground: what
 * a believed firing point can see, off a raster, with no rays. Two questions decide whether
 * that reading is good enough to move men by:
 *
 * - **How often is it right?** For the ground within reach of the camp and each of its three
 *   best overviews: of the places it calls out of view, how many really are in it (a man who
 *   trusts it there is seen), and of those it calls in view, how many really aren't (cover
 *   he didn't use).
 * - **What does the way it picks buy?** From the camp to each of those overviews, watched
 *   from there and from the listed firing points either side: the covered way against the
 *   straight one, in metres really in view (real rays, every 2.5 m of it) and the longest
 *   stretch of them.
 *
 * Geometry only: nothing is simulated, and no guard moves.
 */

type Reading = 'none' | 'relief' | 'rays';

const ARMS: ReadonlyArray<Arm & { by: Reading }> = [
  { name: 'the straight way', by: 'none' },
  { name: 'the covered way', by: 'relief' },
  { name: 'covered, by real rays', by: 'rays' },
];

/** Metres from the camp's middle that the ground is judged over. */
const AROUND = 350;
/** Overviews tried on each camp, and the listed firing points beside each that also watch. */
const OVERVIEWS = 3;
const BESIDE = 2;
/** Metres between the points of a way that are checked with real rays. */
const EVERY = 2.5;

interface Perch {
  x: number;
  z: number;
  coverage: number;
}

/** The firing point and its nearest neighbours on the camp's list: where a shooter believed to be at one may as well be. */
function watchers(world: World, at: Perch): Perch[] {
  const near = [...world.report.camp!.perches]
    .filter((p) => p !== at)
    .sort((a, b) => (a.x - at.x) * (a.x - at.x) + (a.z - at.z) * (a.z - at.z) - ((b.x - at.x) * (b.x - at.x) + (b.z - at.z) * (b.z - at.z)) || a.x - b.x || a.z - b.z)
    .slice(0, BESIDE);
  return [at, ...near];
}

function run(seed: string, arm: Arm & { by: Reading }, tuning: Tuning): Record<string, number> {
  const G = tuning.brain.hunt.ground;
  const t: Tuning = arm.by !== 'none' ? tuning : { ...tuning, brain: { ...tuning.brain, hunt: { ...tuning.brain.hunt, ground: { ...G, price: 0, priceOn: 0 } } } };
  const world = keptWorld(`live-camp:${seed}`, tuning, liveCamp(`seed=${seed}`).world);
  const nav = navigatorOf(world, t);
  const site = world.camp.site;
  const perches = [...world.report.camp!.perches].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z).slice(0, OVERVIEWS);
  const sees = (eyes: readonly Eyes[], x: number, y: number, z: number): boolean => eyes.some((e) => nav.seesPoint(e.x, e.y, e.z, x, y, z));
  let judgedDead = 0;
  let deadWrong = 0;
  let judgedLit = 0;
  let litWrong = 0;
  let found = 0;
  let length = 0;
  let straight = 0;
  let judged = 0;
  let real = 0;
  let longest = 0;
  let bounds = 0;
  let litBounds = 0;
  let stopsSeen = 0;
  let ms = 0;
  const way = emptyWay();
  approachOf(world, t).prepare();
  for (const perch of perches) {
    const from = watchers(world, perch);
    const eyes = from.map((p) => eyesOn(world, p.x, p.z, G.eye));
    const a = approachOf(world, t);
    // From the open ground nearest the camp's middle, which is often indoors.
    const start = a.near(site.x, site.z, 8);
    // The third arm reads the ground with real rays, at a cost no tick could bear: what the way would be if the reading were never wrong.
    let truth: Uint8Array | null = null;
    if (arm.by === 'rays') {
      truth = new Uint8Array(a.layer.nx * a.layer.nz);
      for (let c = 0; c < truth.length; c++) if (a.near(a.px[c]!, a.pz[c]!, 0) === c && sees(eyes, a.px[c]!, a.floor[c]! + G.head, a.pz[c]!)) truth[c] = 1;
    }
    const began = performance.now();
    const ok = start >= 0 && (truth ? a.aimAs(truth) : a.aim(from)).way(a.px[start]!, a.pz[start]!, perch.x, perch.z, way);
    ms += performance.now() - began;
    if (truth) a.aim(from);
    // How often the reading is right, over the ground round the camp.
    const L = a.layer;
    for (let c = 0; c < L.nx * L.nz; c++) {
      if ((L.flags[c]! & Cell.Walkable) === 0 || a.near(a.px[c]!, a.pz[c]!, 0) !== c) continue;
      const x = a.px[c]!;
      const z = a.pz[c]!;
      if ((x - site.x) * (x - site.x) + (z - site.z) * (z - site.z) > AROUND * AROUND) continue;
      const truth = sees(eyes, x, a.floor[c]! + G.head, z);
      if (a.lit(c)) {
        judgedLit++;
        if (!truth) litWrong++;
      } else {
        judgedDead++;
        if (truth) deadWrong++;
      }
    }
    if (!ok) continue;
    found++;
    length += way.length;
    judged += way.exposed;
    straight += Math.sqrt((perch.x - site.x) * (perch.x - site.x) + (perch.z - site.z) * (perch.z - site.z));
    bounds += way.lit.length - 1;
    for (const l of way.lit) litBounds += l;
    // Where a bound ends a man gets down: is he really out of view there, on a knee?
    for (let k = 1; k < way.lit.length - 1; k++) {
      const x = way.stops[2 * k]!;
      const z = way.stops[2 * k + 1]!;
      if (sees(eyes, x, world.terrain.heightAt(x, z) + t.bodies.guard.height.crouch, z)) stopsSeen++;
    }
    // What the way is really worth: real rays along it, to a walking man's head.
    let stretch = 0;
    let worst = 0;
    for (let k = 1; k < way.lit.length; k++) {
      const ax = way.stops[2 * k - 2]!;
      const az = way.stops[2 * k - 1]!;
      const bx = way.stops[2 * k]!;
      const bz = way.stops[2 * k + 1]!;
      const d = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      const n = Math.max(1, Math.round(d / EVERY));
      for (let s = 1; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n;
        const z = az + ((bz - az) * s) / n;
        if (sees(eyes, x, world.terrain.heightAt(x, z) + G.head, z)) {
          real += d / n;
          stretch += d / n;
          if (stretch > worst) worst = stretch;
        } else stretch = 0;
      }
    }
    longest += worst;
  }
  const per = (v: number): number => (found > 0 ? v / found : NaN);
  return {
    deadWrong: judgedDead > 0 ? deadWrong / judgedDead : NaN,
    litWrong: judgedLit > 0 ? litWrong / judgedLit : NaN,
    dead: judgedDead / (judgedDead + judgedLit),
    found: found / perches.length,
    straight: per(straight),
    length: per(length),
    judged: per(judged),
    real: per(real),
    longest: per(longest),
    bounds: per(bounds),
    litBounds: per(litBounds),
    stopsSeen: per(stopsSeen),
    ms: ms / perches.length,
  };
}

export const approach: Experiment = {
  name: 'approach',
  about: 'the way out to a firing point that keeps out of its view: how right the reading of the ground is, and what the way buys',
  series: 'lab-approach',
  camps: 12,
  arms: ARMS,
  measures: [
    { key: 'dead', label: `ground within ${AROUND} m read as out of view (share)`, kind: 'mean' },
    { key: 'deadWrong', label: 'of it, really in view (share)', kind: 'mean' },
    { key: 'litWrong', label: 'of ground read as in view, really out of it (share)', kind: 'mean' },
    { key: 'found', label: 'ways found (share)', kind: 'mean' },
    { key: 'straight', label: 'straight to the firing point (m)', kind: 'mean' },
    { key: 'length', label: 'the way (m)', kind: 'mean' },
    { key: 'judged', label: 'of it, read as in view (m)', kind: 'mean' },
    { key: 'real', label: 'of it, really in view (m)', kind: 'mean' },
    { key: 'longest', label: 'longest stretch really in view (m)', kind: 'mean' },
    { key: 'bounds', label: 'bounds', kind: 'mean' },
    { key: 'litBounds', label: 'of them, across ground in view', kind: 'mean' },
    { key: 'stopsSeen', label: 'stops where a kneeling man is really in view', kind: 'mean' },
    { key: 'ms', label: 'time to read the ground and find the way (ms)', kind: 'median' },
  ],
  run: (seed, arm, tuning) => run(seed, arm as Arm & { by: Reading }, tuning),
};
