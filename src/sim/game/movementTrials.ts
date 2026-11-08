import type { Tuning } from '../../config/tuning';
import { dpow } from '../kernel/core/detmath';
import { Rng } from '../kernel/core/rng';
import { startScene } from '../kernel/scene';
import { MASK_DISTANCE, NOISE_GAITS, NOISE_PREROLL, NOISE_SURFACES, formatNoise, noiseScenario, parseNoise, type NoiseGait, type NoiseParams, type NoiseSurface } from './scenes/noiseScenario';
import { formatSight, parseSight, type SightParams } from './scenes/sightScenario';
import { SITTING, SPOT_MAX, briefOf, generateSitting, legibleCues, outcomeOf, rulesPredict, spaceSteps, stepFactor, type Factor, type Outcome, type SittingOptions, type Trial, type TrialSpace } from './trials';

/**
 * The movement lab's trials (C8): can you predict your own noise and visibility? The same
 * protocol as the perception lab's (game/trials.ts): the cells, the borderline split, the
 * pairwise spread, the freezes, the scoring and the pass mark. This module supplies what
 * is the lab's own: two kinds of situation, each drawn around the edge of its outcome.
 *
 * - **Noise** (game/scenes/noiseScenario.ts): "You crouch-walk on gravel, 7 m from a sentry
 *   with his back to you. Will he hear you within 8 seconds?" What flips one: the surface,
 *   the gait, the distance, a generator's hum beside him.
 * - **Visibility** (the sight scenario): "You stay crouched, still, in the tall wall's
 *   shade, 40 m from a sentry. Will he see you within 8 seconds?" What flips one: the
 *   light, the skyline behind you, the gait (stance and movement together), the distance.
 *
 * A sitting is 3 + 2 warm-ups and 15 + 15 scored, the scored ones shuffled together.
 *
 * - **The rules-only predictor** for noise knows only how far each gait carries, and the
 *   distance: the rule of thumb. It leaves out the surface and the hum, which are what the
 *   world has to show (the ground underfoot, the generator, your own footsteps). So reading
 *   the gait and the distance alone gets half the borderline trials at best, as in lab A.
 * - **Freezes:** a noise trial frozen at its cue stops after a few steps (NOISE_PREROLL), so
 *   you have heard yourself and he has only now started listening. A sprint can't be one:
 *   running along the arc, you aren't looking at him. Visibility trials freeze as lab A's do.
 *
 * Generation is deterministic and bounded by a count of candidates (rule 18).
 */

const round2 = (x: number): number => Math.round(x * 2) / 2;

/** How far a gait carries by the rule of thumb: the gait and nothing else (on dirt, in silence). */
export function gaitRadius(gait: NoiseGait, tuning: Tuning): number {
  return tuning.noise.movement[gait] * tuning.noise.radiusPerUnit;
}

/** One candidate noise trial: distances drawn round its edge, where outcomes are closest. */
function drawNoise(rng: Rng, tuning: Tuning): NoiseParams {
  const surface = rng.pick(NOISE_SURFACES);
  const gait = rng.pick<NoiseGait>(['crawl', 'crouch', 'crouch', 'walk', 'walk', 'sprint']);
  const mask = rng.pick<0 | 1 | 2>([0, 0, 1, 2]);
  const N = tuning.noise;
  const radius = N.movement[gait] * N.surface[surface] * N.radiusPerUnit;
  // The hum's level at the guard, less maskDb, is what a step must beat (perception/hearing.ts).
  const hum = mask > 0 ? N.ambient.generator / MASK_DISTANCE[mask]! : 0;
  const threshold = Math.max(1, hum * dpow(10, -tuning.perception.hearing.maskDb / 20));
  const edge = radius / threshold;
  const share = rng.chance(0.5) ? rng.range(0.25, 0.7) : rng.range(0.7, 1.35);
  const d = Math.max(1.5, Math.min(45, round2(edge * share)));
  return { surface, gait, d, mask, secs: SITTING.seconds, expect: null };
}

/** Runs a noise trial headless: heard or not, and when. Its cue is the pre-roll's end. */
export function noiseOutcome(params: string, tuning: Tuning): Outcome {
  const p = parseNoise(params);
  const scene = noiseScenario(params);
  const sim = startScene(scene, tuning);
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round(p.secs * tuning.sim.tickHz);
  const out: Outcome = { seen: false, seenAt: -1, cueAt: p.gait === 'sprint' ? -1 : NOISE_PREROLL, clear: { start: true, cue: true } };
  for (let i = 0; i < ticks && !out.seen; i++) {
    for (const e of sim.step(driver.next(sim, raw))) {
      if (e.type === 'heard' && !out.seen) {
        out.seen = true;
        out.seenAt = e.t;
      }
    }
  }
  return out;
}

function stepNoise(p: NoiseParams, f: Factor, up: boolean): NoiseParams | null {
  const q: NoiseParams = { ...p };
  switch (f) {
    case 'distance': {
      const d = round2(up ? p.d / 1.15 : p.d * 1.15);
      if (d === p.d || d < 1.5 || d > 50) return null;
      q.d = d;
      return q;
    }
    case 'surface': {
      const k = NOISE_SURFACES.indexOf(p.surface) + (up ? 1 : -1);
      if (k < 0 || k >= NOISE_SURFACES.length) return null;
      q.surface = NOISE_SURFACES[k] as NoiseSurface;
      return q;
    }
    case 'gait': {
      const k = NOISE_GAITS.indexOf(p.gait) + (up ? 1 : -1);
      if (k < 0 || k >= NOISE_GAITS.length) return null;
      q.gait = NOISE_GAITS[k] as NoiseGait;
      return q;
    }
    case 'masking': {
      // More exposure is less of the hum.
      const m = p.mask + (up ? -1 : 1);
      if (m < 0 || m > 2) return null;
      q.mask = m as 0 | 1 | 2;
      return q;
    }
    default:
      return null;
  }
}

const SURFACE_WORDS: Readonly<Record<NoiseSurface, string>> = { grass: 'on grass', dirt: 'on bare dirt', rock: 'on rock', gravel: 'on gravel', wood: 'on boards', water: 'through shallow water', metal: 'on metal plate' };
const GAIT_WORDS: Readonly<Record<NoiseGait, string>> = { crawl: 'crawl', crouch: 'crouch-walk', walk: 'walk', sprint: 'run' };

function briefNoise(p: NoiseParams): string {
  const hum = p.mask === 0 ? '' : p.mask === 1 ? ', a generator running a few metres from him' : ', a generator running right beside him';
  return `You ${GAIT_WORDS[p.gait]} ${SURFACE_WORDS[p.surface]}, ${p.d} m from a sentry with his back to you${hum}. Will he hear you within ${p.secs} seconds?`;
}

/** Noise trials: will he hear this move? */
export const NOISE_SPACE: TrialSpace = {
  kind: 'noise',
  stream: 'trials-noise',
  factors: ['distance', 'gait', 'surface', 'masking'],
  draw: (rng, tuning) => formatNoise(drawNoise(rng, tuning)),
  outcome: (params, tuning) => noiseOutcome(params, tuning),
  step: (params, f, up) => {
    const q = stepNoise(parseNoise(params), f, up);
    return q ? formatNoise(q) : null;
  },
  rules: (params, tuning) => {
    const p = parseNoise(params);
    return p.d <= gaitRadius(p.gait, tuning);
  },
  brief: (params) => briefNoise(parseNoise(params)),
  levels: (params, t) => {
    const p = parseNoise(params);
    return [`surface:${p.surface}`, `gait:${p.gait}`, `range:${p.d <= 4 ? 'near' : p.d <= 10 ? 'mid' : 'far'}`, `mask:${p.mask}`, `outcome:${t.seen ? 'heard' : 'not'}`, `kind:${t.borderline ? 'borderline' : 'clear'}`];
  },
  legible: () => ({ indicator: false, head: false, voice: false }),
};

/** A body's exposure as one ladder, stance and movement together: lying still to walking upright. */
const SIGHT_GAITS: ReadonlyArray<Pick<SightParams, 'stance' | 'move'>> = [
  { stance: 'prone', move: 'still' },
  { stance: 'prone', move: 'walk' },
  { stance: 'crouch', move: 'still' },
  { stance: 'crouch', move: 'walk' },
  { stance: 'stand', move: 'still' },
  { stance: 'stand', move: 'walk' },
];

function drawSight(rng: Rng, tuning: Tuning): SightParams {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  const spot = rng.pick(['open', 'open', 'shade', 'crest'] as const);
  const stance = rng.pick(['prone', 'crouch', 'stand'] as const);
  // Facing the guard, the player steps sideways, which never runs: still or walking (in the stance's gait).
  const move = rng.pick(['still', 'walk', 'walk'] as const);
  const off = rng.pick([0, 0, 10, 20, 30, 40]);
  const zone = off <= S.core.halfDeg ? S.core.range : S.peripheral.range;
  const edge = zone * V.stance[stance] * (spot === 'shade' ? V.light.shade : V.light.lit) * (spot === 'crest' ? V.skyline : 1);
  // Half drawn well inside the range, half round its edge: both outcomes, clear and close.
  const share = rng.chance(0.5) ? rng.range(0.08, 0.55) : rng.range(0.5, 1.35);
  const d = Math.max(4, Math.min(SPOT_MAX[spot], Math.round(edge * share)));
  return { guard: 'sentry', spot, d, off, stance, move, secs: SITTING.seconds, react: true, face: true, expect: null };
}

function stepOwnSight(p: SightParams, f: Factor, up: boolean): SightParams | null {
  if (f === 'distance' || f === 'light' || f === 'sky') return stepFactor(p, f, up);
  if (f !== 'gait') return null;
  const k = SIGHT_GAITS.findIndex((g) => g.stance === p.stance && g.move === p.move) + (up ? 1 : -1);
  if (k < 0 || k >= SIGHT_GAITS.length) return null;
  return { ...p, ...SIGHT_GAITS[k]! };
}

/** Visibility trials: will he see you? Lab A's scenario, drawn for what your own body and light do. */
export const OWN_SIGHT_SPACE: TrialSpace = {
  kind: 'sight',
  stream: 'trials-own-sight',
  factors: ['distance', 'gait', 'light', 'sky'],
  draw: (rng, tuning) => formatSight(drawSight(rng, tuning)),
  outcome: outcomeOf,
  step: (params, f, up) => {
    const q = stepOwnSight(parseSight(params), f, up);
    return q ? formatSight(q) : null;
  },
  rules: (params, tuning) => rulesPredict(parseSight(params), tuning),
  brief: (params) => briefOf(parseSight(params)),
  levels: (params, t) => {
    const p = parseSight(params);
    return [`light:${p.spot}`, `gait:${p.stance}-${p.move}`, `range:${p.d <= 15 ? 'near' : p.d <= 60 ? 'mid' : 'far'}`, `gaze:${p.off <= 10 ? 'ahead' : 'aside'}`, `outcome:${t.seen ? 'seen' : 'not'}`, `kind:${t.borderline ? 'borderline' : 'clear'}`];
  },
  legible: (params, freeze, tuning, clear, opts) => legibleCues(parseSight(params), freeze, tuning, clear, opts),
};

/** The noise half's options: any trial but a sprint reaches its cue, so freezes are simply shared out. */
export const NOISE_SITTING: SittingOptions = { ...SITTING, warmups: 3, scored: 15, balanceFreeze: false };
/** The visibility half's. */
export const OWN_SIGHT_SITTING: SittingOptions = { ...SITTING, warmups: 2, scored: 15 };

/** The most candidates a movement sitting runs before settling for what it has. */
export const MOVEMENT_CANDIDATES = NOISE_SITTING.maxCandidates + OWN_SIGHT_SITTING.maxCandidates;

/** Sitting ids of the movement lab start with this, so a recording's id says which lab it's from. */
export const MOVEMENT_SITTING = 'movement:';

/**
 * A movement sitting, a candidate at a time (the browser's wait): the noise trials, then
 * the visibility trials, the warm-ups first and the scored ones shuffled together.
 */
export function* movementSteps(seed: string, tuning: Tuning): Generator<number, Trial[]> {
  const halves: Array<readonly [TrialSpace, SittingOptions]> = [
    [NOISE_SPACE, NOISE_SITTING],
    [OWN_SIGHT_SPACE, OWN_SIGHT_SITTING],
  ];
  const done: Trial[][] = [];
  let offset = 0;
  for (const [space, opts] of halves) {
    const steps = spaceSteps(space, seed, tuning, opts);
    for (let r = steps.next(); ; r = steps.next()) {
      if (r.done) {
        done.push(r.value);
        break;
      }
      yield offset + r.value;
    }
    offset += opts.maxCandidates;
  }
  const warmups = done.flatMap((half) => half.filter((t) => t.warmup));
  const scored = done.flatMap((half) => half.filter((t) => !t.warmup));
  const order = new Rng(seed, 'trials-movement').fork('order');
  for (let i = scored.length - 1; i > 0; i--) {
    const j = order.int(0, i);
    const a = scored[i]!;
    scored[i] = scored[j]!;
    scored[j] = a;
  }
  const all = [...warmups, ...scored];
  all.forEach((t, k) => (t.k = k));
  return all;
}

/** A movement sitting from its seed. */
export function generateMovementSitting(seed: string, tuning: Tuning): Trial[] {
  const steps = movementSteps(seed, tuning);
  for (let r = steps.next(); ; r = steps.next()) if (r.done) return r.value;
}

/** Any sitting from its id: the movement lab's if the id says so, else the perception lab's. */
export function generateAnySitting(id: string, tuning: Tuning): Trial[] {
  return id.startsWith(MOVEMENT_SITTING) ? generateMovementSitting(id, tuning) : generateSitting(id, tuning);
}
