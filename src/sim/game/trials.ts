import type { Tuning } from '../../config/tuning';
import { dtanDeg } from '../kernel/core/detmath';
import { Rng } from '../kernel/core/rng';
import { startScene } from '../kernel/scene';
import { Blocks } from '../kernel/world/colliders';
import { foliageOf } from '../perception';
import { formatSight, parseSight, sightScenario, type SightParams } from './scenes/sightScenario';
import type { Simulation } from './sim';

/**
 * Trial mode (A12): the exit test's protocol (docs/phase-1-plan.md, Exit tests · A), built
 * into the lab so it records its own result.
 *
 * A trial is a sight scenario (scenes/sightScenario.ts) where the player faces a guard who
 * reacts as he would, for 8 s: the question is whether he sees you before it ends. A
 * sitting is 5 warm-ups, their outcomes shown, then 30 scored, none shown until the end.
 *
 * - **The answer key** comes from running each trial: seen or not, when, and when the first
 *   cue came. A trial is **borderline** when one step of one factor, toward the other
 *   outcome, flips it; every factor that does is recorded, for item analysis. Each of the
 *   four cells (seen or not, clear or borderline) holds a quarter of the scored trials.
 * - **The borderline trials are split evenly** between those the rules-only predictor
 *   (below) gets right and those it gets wrong, so reading the sight table alone scores
 *   half of them at best (7 of 15), and the bar of 21 of 30 can only be met by reading
 *   what the table leaves out: movement, cover, the skyline and the cues.
 * - **Freezes:** half the trials are judged from the situation, frozen before anything
 *   shows; half at the first cue, when the meter reaches 30% (the indicator, then the head
 *   turn and a bark), since below the cue nothing shows and start freezes alone would test
 *   the rules, not the cues.
 * - **The rules-only predictor** says seen exactly when the trial's distance is inside the
 *   sight table's range for the guard's zone, the stance and the light: no movement, cover,
 *   sky or cues. Beating it on the borderline trials is the evidence that the cues are read
 *   (docs/research/foundations.md: the baseline is strong; Tremblay found people judge by
 *   distance).
 * - **The trials are spread over the factors.** Each cell gathers more candidates than it
 *   needs, and the sitting takes those that add the most new pairs of factor levels (a
 *   greedy pairwise covering array, as the research advises), the outcome and the kind of
 *   trial among the levels, so no surface feature comes to mean one outcome or the other.
 * - **Legible cues** are the simulation's own record of what could be seen at the freeze:
 *   the indicator at a cue freeze, the guard's head where it spans 2 pixels and the line
 *   from your eye to it is clear, his voice within a bark's reach. The agents' pre-screen
 *   (headless/trials.ts) checks the honest view against it.
 * - **Scoring** is balanced accuracy: the mean of the share right among trials seen and
 *   among trials not seen, so answering yes to everything scores 50%.
 *
 * Generation is deterministic (a seed gives the same sitting anywhere) and bounded by a
 * count of candidates (rule 18).
 */

export type Factor = 'distance' | 'stance' | 'movement' | 'light' | 'cover' | 'sky' | 'gaze';
export const FACTORS: readonly Factor[] = ['distance', 'stance', 'movement', 'light', 'cover', 'sky', 'gaze'];

export interface Trial {
  /** Its place in the sitting, from 0; the warm-ups come first. */
  k: number;
  warmup: boolean;
  /** The sight scenario it runs (canonical parameters). */
  params: string;
  /** What the player will do, and who's watching, in words. */
  brief: string;
  /** Judged from the situation, frozen at the start; or frozen at the first cue. */
  freeze: 'start' | 'cue';
  /** The answer key: seen within the trial, and when (s); when the first cue came (s), or −1. */
  seen: boolean;
  seenAt: number;
  cueAt: number;
  /** One factor's step flips it; every factor that does, in FACTORS order. */
  borderline: boolean;
  flips: Factor[];
  /** What the rules-only predictor says. */
  rules: boolean;
  /** Which cues can be read at the freeze, as the simulation knows them (the agents' pre-screen starts here). */
  legible: { indicator: boolean; head: boolean; voice: boolean };
}

export interface SittingOptions {
  warmups: number;
  scored: number;
  /** The most candidates run before the sitting settles for what it has (rule 18). */
  maxCandidates: number;
  /** How many candidates each cell gathers, as a multiple of what it needs, for the sitting to pick from. */
  pool: number;
  /** Seconds each trial runs. */
  seconds: number;
  /** A cue-frozen trial stops this long after the first cue: long enough for his head to start turning. */
  cueHoldSeconds: number;
  /** The guard's head is a readable cue where it spans this many pixels, at 720 lines. */
  headPixels: number;
  /**
   * ...and the line from your eye to it lets through at least this share (foliage), with
   * nothing solid in the way. A guard drawn in the open keeps about 86% contrast against
   * the ground behind him, and foliage keeps its transmittance of that (measured in the
   * honest view by the agents' pre-screen): 0.15 leaves him about 13%, which reads.
   */
  seeThrough: number;
}

export const SITTING: SittingOptions = { warmups: 5, scored: 30, maxCandidates: 1600, pool: 3, seconds: 8, cueHoldSeconds: 0.3, headPixels: 2, seeThrough: 0.15 };

interface Outcome {
  seen: boolean;
  seenAt: number;
  cueAt: number;
  /** Whether the line from the player's eye to the guard's head is clear at each freeze. */
  clear: { start: boolean; cue: boolean };
}

/** Runs a trial's scenario headless: seen or not, when, its first cue, and the view at each freeze. */
export function outcomeOf(params: string, tuning: Tuning, opts: SittingOptions = SITTING): Outcome {
  const scene = sightScenario(params);
  const sim = startScene(scene, tuning);
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round((scene.seconds ?? 8) * tuning.sim.tickHz);
  const hold = Math.round(opts.cueHoldSeconds * tuning.sim.tickHz);
  const out: Outcome = { seen: false, seenAt: -1, cueAt: -1, clear: { start: headInView(sim, opts), cue: false } };
  let freeze = -1;
  // On to the cue's freeze even once seen (only in the contact zone can it come first).
  for (let i = 0; i < ticks && !(out.seen && sim.tick >= freeze); i++) {
    for (const e of sim.step(driver.next(sim, raw))) {
      if (e.type === 'noticed' && out.cueAt < 0) {
        out.cueAt = e.t;
        freeze = sim.tick + hold;
      }
      if (e.type === 'detected' && !out.seen) {
        out.seen = true;
        out.seenAt = e.t;
      }
    }
    if (sim.tick === freeze) out.clear.cue = headInView(sim, opts);
  }
  return out;
}

/** Whether the player's eye sees the guard's head: nothing solid between, and foliage letting enough through. */
function headInView(sim: Simulation, opts: SittingOptions): boolean {
  const g = sim.guards[0];
  if (!g) return false;
  const p = sim.player;
  const ex = p.x;
  const ey = p.y + p.eyeHeight;
  const ez = p.z;
  const hx = g.body.x;
  const hy = g.body.y + g.body.eyeHeight;
  const hz = g.body.z;
  const dx = hx - ex;
  const dy = hy - ey;
  const dz = hz - ez;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  // The ground and anything solid that blocks sight; bodies don't hide each other's heads here.
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const view = sim.queryView();
  if (view.world.terrain.raycast(ex, ey, ez, ux, uy, uz, len) <= len) return false;
  if (view.solids.distance(ex, ey, ez, ux, uy, uz, len, Blocks.Sight) <= len) return false;
  return foliageOf(sim.world).transmittance(ex, ey, ez, hx, hy, hz) >= opts.seeThrough;
}

const STANCES: readonly SightParams['stance'][] = ['prone', 'crouch', 'stand'];
const MOVES: readonly SightParams['move'][] = ['still', 'walk', 'sprint'];
/** How far each spot's ground lets a guard stand from it with a clear line (sightScenario's geometry). */
const SPOT_MAX: Readonly<Record<SightParams['spot'], number>> = { open: 390, shade: 95, bush: 70, wall: 60, crest: 230 };

/** One step of one factor, toward more exposure (`up`) or less; null if it has no step that way here. */
export function stepFactor(p: SightParams, f: Factor, up: boolean): SightParams | null {
  const q: SightParams = { ...p };
  switch (f) {
    case 'distance': {
      const d = Math.round(up ? p.d / 1.15 : p.d * 1.15);
      if (d === p.d || d < 2 || d > SPOT_MAX[p.spot]) return null;
      q.d = d;
      return q;
    }
    case 'stance': {
      const k = STANCES.indexOf(p.stance) + (up ? 1 : -1);
      if (k < 0 || k >= STANCES.length) return null;
      q.stance = STANCES[k]!;
      if (q.stance !== 'stand' && q.move === 'sprint') q.move = 'walk';
      return q;
    }
    case 'movement': {
      const k = MOVES.indexOf(p.move) + (up ? 1 : -1);
      // A trial's player faces the guard and steps sideways, which never runs.
      if (k < 0 || k >= MOVES.length || MOVES[k] === 'sprint') return null;
      q.move = MOVES[k]!;
      return q;
    }
    case 'light':
      if (up && p.spot === 'shade') q.spot = 'open';
      else if (!up && p.spot === 'open') q.spot = 'shade';
      else return null;
      return q.d <= SPOT_MAX[q.spot] ? q : null;
    case 'cover':
      if (up && (p.spot === 'bush' || p.spot === 'wall')) q.spot = 'open';
      else if (!up && p.spot === 'open') q.spot = p.stance === 'stand' ? 'wall' : 'bush';
      else return null;
      return q.d <= SPOT_MAX[q.spot] ? q : null;
    case 'sky':
      if (up && p.spot === 'open') q.spot = 'crest';
      else if (!up && p.spot === 'crest') q.spot = 'open';
      else return null;
      return q.d <= SPOT_MAX[q.spot] ? q : null;
    case 'gaze': {
      const off = up ? Math.max(0, p.off - 20) : Math.min(180, p.off + 20);
      if (off === p.off) return null;
      q.off = off;
      return q;
    }
  }
}

/** The rules-only predictor: inside the sight table's range for the zone, the stance and the light (no cues). */
export function rulesPredict(p: SightParams, tuning: Tuning): boolean {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  const zone = p.guard === 'marksman' && p.off <= S.far.halfDeg ? S.far.range : p.off <= S.core.halfDeg ? S.core.range : p.off <= S.peripheral.halfDeg ? S.peripheral.range : 0;
  const light = p.spot === 'shade' ? V.light.shade : V.light.lit;
  return p.d <= zone * V.stance[p.stance] * light;
}

/** What the player will do, and who watches: the trial's brief. */
export function briefOf(p: SightParams): string {
  const doing =
    p.move === 'still'
      ? p.stance === 'stand'
        ? 'stand still'
        : p.stance === 'crouch'
          ? 'stay crouched, still'
          : 'lie still'
      : p.stance === 'prone'
        ? 'crawl'
        : p.stance === 'crouch'
          ? 'crouch-walk'
          : p.move === 'sprint'
            ? 'run'
            : 'walk';
  const where = { open: 'in the open', shade: "in the tall wall's shade", bush: 'in the bush', wall: 'behind the low wall', crest: "on the ridge's crest" }[p.spot];
  const who = p.guard === 'marksman' ? 'a marksman with binoculars' : 'a sentry';
  return `You ${doing} ${where}, ${p.d} m from ${who}. Will he see you within 8 seconds?`;
}

/** Which cues a player can read at a trial's freeze, as the simulation knows them. */
export function legibleCues(p: SightParams, freeze: Trial['freeze'], tuning: Tuning, clear: Outcome['clear'], opts: SittingOptions = SITTING): Trial['legible'] {
  // The head's turn is a cue only where the head spans enough pixels, at 720 lines and the
  // default field of view, and nothing hides it from your eye.
  const pixels = (2 * tuning.bodies.guard.parts.headRadius * 720) / (2 * p.d * dtanDeg(tuning.view.fov / 2));
  return { indicator: freeze === 'cue', head: pixels >= opts.headPixels && clear[freeze], voice: freeze === 'cue' && p.d <= tuning.perception.barks.radius };
}

/**
 * The scored trials' cells, and how many each holds of 30: seen or not, clear or
 * borderline, and each borderline cell split by whether the rules-only predictor is right.
 * The table-wrong half rounds up, so the table alone gets 7 of the 15 borderline trials.
 */
const CELLS = ['seen, clear', 'seen, borderline, table right', 'seen, borderline, table wrong', 'not seen, clear', 'not seen, borderline, table right', 'not seen, borderline, table wrong'] as const;

function cellOf(t: Pick<Trial, 'seen' | 'borderline' | 'rules'>): number {
  return (t.seen ? 0 : 3) + (t.borderline ? (t.rules === t.seen ? 1 : 2) : 0);
}

/** How many of the scored trials each cell holds: a quarter each to the four outer cells, as even as it divides. */
export function cellQuotas(scored: number): number[] {
  const quarter = (c: number): number => Math.floor(scored / 4) + (c < scored % 4 ? 1 : 0);
  // seen-clear, seen-borderline, unseen-clear, unseen-borderline.
  const outer = [quarter(0), quarter(1), quarter(2), quarter(3)];
  const half = (n: number, up: boolean): [number, number] => (up ? [Math.floor(n / 2), Math.ceil(n / 2)] : [Math.ceil(n / 2), Math.floor(n / 2)]);
  // The table-wrong halves round up between them: 4 and 4 of 8, then 3 and 4 of 7.
  const [sr, sw] = half(outer[1]!, true);
  const [ur, uw] = half(outer[3]!, true);
  return [outer[0]!, sr, sw, outer[2]!, ur, uw];
}

/** The cells' names, for reports. */
export const CELL_NAMES: readonly string[] = CELLS;
/** A trial's cell, for reports. */
export function cellOfTrial(t: Pick<Trial, 'seen' | 'borderline' | 'rules'>): number {
  return cellOf(t);
}

/** Draws one candidate situation from the seeded space: the guard, his gaze, the spot, the stance, the movement, the distance. */
function draw(rng: Rng, tuning: Tuning): SightParams {
  const S = tuning.perception.sight;
  const V = tuning.visibility;
  const spot = rng.pick(['open', 'open', 'open', 'shade', 'shade', 'bush', 'wall', 'crest', 'crest'] as const);
  const guard = spot === 'open' && rng.chance(0.25) ? 'marksman' : 'sentry';
  const stance = spot === 'bush' ? rng.pick(['prone', 'crouch'] as const) : spot === 'wall' ? rng.pick(['stand', 'crouch'] as const) : rng.pick(STANCES);
  // Facing the guard, the player steps sideways, which never runs: still or walking (in the stance's gait).
  const move = rng.pick(['still', 'walk', 'walk'] as const);
  const off = guard === 'marksman' ? rng.pick([0, 0, 2, 10, 20]) : rng.pick([0, 0, 10, 20, 30, 40, 55, 70]);
  // Distances drawn round the edge the rules give, where outcomes are closest.
  const zone = guard === 'marksman' && off <= S.far.halfDeg ? S.far.range : off <= S.core.halfDeg ? S.core.range : S.peripheral.range;
  const light = spot === 'shade' ? V.light.shade : V.light.lit;
  const sky = spot === 'crest' ? V.skyline : 1;
  const edge = zone * V.stance[stance] * light * sky;
  // Half drawn well inside the range, half round its edge: both outcomes, clear and close.
  const share = rng.chance(0.5) ? rng.range(0.08, 0.55) : rng.range(0.5, 1.35);
  const d = Math.max(4, Math.min(SPOT_MAX[spot], Math.round(edge * share)));
  return { guard, spot, d, off, stance, move, secs: 8, react: true, face: true, expect: null };
}

/** A situation's levels, for spreading a sitting over them: its seven factors (light, cover and skyline are one draw, the spot), and its place in the key. */
function levelsOf(p: SightParams, t: Pick<Trial, 'seen' | 'borderline'>): string[] {
  return [
    `who:${p.guard}`,
    `gaze:${p.off <= 10 ? 'ahead' : p.off <= 40 ? 'aside' : 'edge'}`,
    `range:${p.d <= 15 ? 'near' : p.d <= 60 ? 'mid' : 'far'}`,
    `stance:${p.stance}`,
    `move:${p.move}`,
    `spot:${p.spot}`,
    `outcome:${t.seen ? 'seen' : 'not'}`,
    `kind:${t.borderline ? 'borderline' : 'clear'}`,
  ];
}

/** Every pair of a situation's levels. */
function pairsOf(t: Trial): string[] {
  const levels = levelsOf(parseSight(t.params), t);
  const pairs: string[] = [];
  for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) pairs.push(`${levels[i]}|${levels[j]}`);
  return pairs;
}

/** How many distinct pairs of factor levels a sitting's scored trials cover. */
export function pairsCovered(trials: readonly Trial[]): number {
  const covered = new Set<string>();
  for (const t of trials) if (!t.warmup) for (const pair of pairsOf(t)) covered.add(pair);
  return covered.size;
}

/**
 * Picks each cell's quota from its candidates, greedily: the candidate that adds the most
 * pairs not yet covered, the earliest drawn among equals. Cells are kept separate, so the
 * key's balance holds.
 */
function spread(cells: readonly Trial[][], quotas: readonly number[]): Trial[][] {
  const chosen: Trial[][] = cells.map(() => []);
  const taken = new Set<Trial>();
  const covered = new Set<string>();
  const pairs = new Map<Trial, string[]>();
  for (const cell of cells) for (const t of cell) pairs.set(t, pairsOf(t));
  for (;;) {
    let best: Trial | null = null;
    let bestCell = -1;
    let bestGain = -1;
    for (let c = 0; c < cells.length; c++) {
      if (chosen[c]!.length >= quotas[c]!) continue;
      for (const t of cells[c]!) {
        if (taken.has(t)) continue;
        let gain = 0;
        for (const pair of pairs.get(t)!) if (!covered.has(pair)) gain++;
        if (gain > bestGain) {
          best = t;
          bestCell = c;
          bestGain = gain;
        }
      }
    }
    if (best === null) return chosen;
    chosen[bestCell]!.push(best);
    taken.add(best);
    for (const pair of pairs.get(best)!) covered.add(pair);
  }
}

/**
 * A sitting's trials from its seed: candidates drawn and run until each of the four cells
 * has its quarter of the scored trials and the warm-ups are found, or the candidates run
 * out. `progress` hears how far it has got (for the browser's wait).
 */
export function generateSitting(seed: string, tuning: Tuning, opts: SittingOptions = SITTING, progress?: (done: number, of: number) => void): Trial[] {
  const steps = sittingSteps(seed, tuning, opts);
  for (let r = steps.next(); ; r = steps.next()) {
    if (r.done) return r.value;
    progress?.(r.value, opts.maxCandidates);
  }
}

/**
 * The same, a candidate at a time: each step yields how many candidates have run, and the
 * last returns the trials. The browser runs a few steps a frame, so the page stays alive.
 */
export function* sittingSteps(seed: string, tuning: Tuning, opts: SittingOptions = SITTING): Generator<number, Trial[]> {
  const rng = new Rng(seed, 'trials');
  const quotas = cellQuotas(opts.scored);
  const capacity = quotas.map((q) => q * opts.pool);
  const gathered: Trial[][] = quotas.map(() => []);
  const drawn: Trial[] = [];
  const enough = opts.scored + opts.warmups;
  const clears = new Map<Trial, Outcome['clear']>();
  const seen = new Set<string>();
  const want = (): boolean => drawn.length < enough || gathered.some((c, i) => c.length < capacity[i]!);
  for (let n = 0; n < opts.maxCandidates && want(); n++) {
    yield n;
    const p = draw(rng, tuning);
    const params = formatSight(p);
    if (seen.has(params)) continue;
    seen.add(params);
    const o = outcomeOf(params, tuning, opts);
    const rules = rulesPredict(p, tuning);
    const borderlineCell = cellOf({ seen: o.seen, borderline: true, rules });
    const clearCell = cellOf({ seen: o.seen, borderline: false, rules });
    // A candidate no cell can take, once there are enough for the warm-ups, isn't worth its flips.
    if (drawn.length >= enough && gathered[borderlineCell]!.length >= capacity[borderlineCell]! && gathered[clearCell]!.length >= capacity[clearCell]!) continue;
    // Borderline: one factor's step toward the other outcome flips it. Every factor that does.
    const flips: Factor[] = [];
    for (const f of FACTORS) {
      const q = stepFactor(p, f, !o.seen);
      if (q && outcomeOf(formatSight(q), tuning, opts).seen !== o.seen) flips.push(f);
    }
    const t: Trial = {
      k: 0,
      warmup: false,
      params,
      brief: briefOf(p),
      freeze: 'start',
      seen: o.seen,
      seenAt: o.seenAt,
      cueAt: o.cueAt,
      borderline: flips.length > 0,
      flips,
      rules,
      legible: { indicator: false, head: false, voice: false },
    };
    clears.set(t, o.clear);
    drawn.push(t);
    const c = cellOf(t);
    if (gathered[c]!.length < capacity[c]!) gathered[c]!.push(t);
  }
  const cells = spread(gathered, quotas);
  // The warm-ups: what's left, in the order drawn, turn about seen and not, so they show both.
  const picked = new Set(cells.flat());
  const rest = drawn.filter((t) => !picked.has(t));
  const warmups: Trial[] = [];
  for (let wantSeen = true; warmups.length < opts.warmups && rest.length > 0; wantSeen = !wantSeen) {
    const at = Math.max(0, rest.findIndex((t) => t.seen === wantSeen));
    const t = rest.splice(at, 1)[0]!;
    const w = { ...t, warmup: true };
    clears.set(w, clears.get(t)!);
    warmups.push(w);
  }
  // Half the scored trials frozen at their first cue, taken from the cells in turn (a
  // trial that never reaches the cue can only be judged from the situation).
  const scored: Trial[] = [];
  for (const cell of cells) scored.push(...cell);
  const most = Math.max(...quotas);
  let cues = 0;
  for (let i = 0; i < most && cues < opts.scored / 2; i++) {
    for (const cell of cells) {
      const t = cell[i];
      if (t && t.cueAt >= 0 && cues < opts.scored / 2) {
        t.freeze = 'cue';
        cues++;
      }
    }
  }
  const order = rng.fork('order');
  for (let i = scored.length - 1; i > 0; i--) {
    const j = order.int(0, i);
    const a = scored[i]!;
    scored[i] = scored[j]!;
    scored[j] = a;
  }
  warmups.forEach((t, i) => (t.freeze = i % 2 === 1 && t.cueAt >= 0 ? 'cue' : 'start'));
  const all = [...warmups, ...scored];
  all.forEach((t, k) => {
    t.k = k;
    t.legible = legibleCues(parseSight(t.params), t.freeze, tuning, clears.get(t)!, opts);
  });
  return all;
}

/** A sitting's score, or two sittings' together. */
export interface Score {
  /** Scored answers, and how many were right. */
  answers: number;
  right: number;
  /** Balanced accuracy: the mean of the share right among trials seen and among trials not seen. */
  balanced: number;
  /** Among borderline trials: how many, and right. */
  borderline: number;
  borderlineRight: number;
  /** The rules-only predictor on the same trials: balanced accuracy, and right among the borderline. */
  rulesBalanced: number;
  rulesBorderlineRight: number;
  /** Among the borderline trials each factor flips (item analysis): how many, right, and the rules-only predictor's right. */
  byFactor: Partial<Record<Factor, { right: number; of: number; rules: number }>>;
}

/** Scores answers ("he'll see me": true) to a sitting's scored trials; warm-ups don't count. */
export function scoreSitting(trials: readonly Trial[], answers: ReadonlyMap<number, boolean>): Score {
  const s: Score = { answers: 0, right: 0, balanced: 0, borderline: 0, borderlineRight: 0, rulesBalanced: 0, rulesBorderlineRight: 0, byFactor: {} };
  let seenRight = 0;
  let seenOf = 0;
  let unseenRight = 0;
  let unseenOf = 0;
  let rulesSeen = 0;
  let rulesUnseen = 0;
  for (const t of trials) {
    if (t.warmup) continue;
    const a = answers.get(t.k);
    if (a === undefined) continue;
    const ok = a === t.seen;
    s.answers++;
    if (ok) s.right++;
    if (t.seen) {
      seenOf++;
      if (ok) seenRight++;
      if (t.rules) rulesSeen++;
    } else {
      unseenOf++;
      if (ok) unseenRight++;
      if (!t.rules) rulesUnseen++;
    }
    if (t.borderline) {
      s.borderline++;
      if (ok) s.borderlineRight++;
      if (t.rules === t.seen) s.rulesBorderlineRight++;
      for (const factor of t.flips) {
        const f = (s.byFactor[factor] ??= { right: 0, of: 0, rules: 0 });
        f.of++;
        if (ok) f.right++;
        if (t.rules === t.seen) f.rules++;
      }
    }
  }
  const share = (r: number, of: number): number => (of > 0 ? r / of : 0);
  s.balanced = (share(seenRight, seenOf) + share(unseenRight, unseenOf)) / 2;
  s.rulesBalanced = (share(rulesSeen, seenOf) + share(rulesUnseen, unseenOf)) / 2;
  return s;
}

/** What the player says told them, at a trial frozen at its first cue (the probe: diagnoses, never gates). */
export type Told = 'mark' | 'head' | 'voice' | 'situation';
export const TOLD: readonly Told[] = ['mark', 'head', 'voice', 'situation'];

export interface ProbeTally {
  /** How often each was named, and how many of those answers were right. */
  by: Record<Told, { said: number; right: number }>;
  /** How often a cue was named that the simulation says couldn't be read at that freeze. */
  unreadable: number;
}

/** The probes of a sitting, against its key and what the simulation says could be read. */
export function probeTally(trials: readonly Trial[], answers: ReadonlyMap<number, boolean>, probes: ReadonlyMap<number, Told>): ProbeTally {
  const out: ProbeTally = { by: { mark: { said: 0, right: 0 }, head: { said: 0, right: 0 }, voice: { said: 0, right: 0 }, situation: { said: 0, right: 0 } }, unreadable: 0 };
  for (const t of trials) {
    const told = probes.get(t.k);
    if (told === undefined || t.warmup) continue;
    out.by[told].said++;
    if (answers.get(t.k) === t.seen) out.by[told].right++;
    if ((told === 'mark' && !t.legible.indicator) || (told === 'head' && !t.legible.head) || (told === 'voice' && !t.legible.voice)) out.unreadable++;
  }
  return out;
}

/** Two sittings, scored together: the exit test's verdict (docs/phase-1-plan.md, Exit tests · A). */
export interface Verdict {
  pass: boolean;
  /** Balanced accuracy over both sittings' answers. */
  balanced: number;
  each: [number, number];
  borderlineRight: number;
  borderline: number;
  rulesBalanced: number;
  /** The rules-only predictor's right among the same borderline trials. */
  rulesBorderlineRight: number;
  /** Why it doesn't pass, in words. */
  shortfalls: string[];
}

/**
 * The pass: 80% balanced accuracy over both sittings; at least 70% in each; at least 70%
 * of the borderline answers right (21 of 30); and clearly better than the rules-only
 * predictor on the same borderline trials, by 10 points (3 of 30), where the table can't
 * settle them (docs/research/foundations.md). The split of the borderline cells holds the
 * table to 14 of 30 there, so a sitting that fills its cells meets this one by meeting the
 * bar; it stands for a sitting that couldn't.
 */
export function verdict(a: { trials: readonly Trial[]; answers: ReadonlyMap<number, boolean> }, b: { trials: readonly Trial[]; answers: ReadonlyMap<number, boolean> }): Verdict {
  const sa = scoreSitting(a.trials, a.answers);
  const sb = scoreSitting(b.trials, b.answers);
  // Both sittings' trials as one set, keyed apart.
  const trials: Trial[] = [...a.trials, ...b.trials.map((t) => ({ ...t, k: t.k + 10000 }))];
  const answers = new Map<number, boolean>([...a.answers, ...[...b.answers].map(([k, v]) => [k + 10000, v] as [number, boolean])]);
  const all = scoreSitting(trials, answers);
  const shortfalls: string[] = [];
  if (all.balanced < 0.8) shortfalls.push(`balanced accuracy ${(all.balanced * 100).toFixed(1)}% over both sittings, under 80%`);
  for (const [k, s] of [sa, sb].entries()) if (s.balanced < 0.7) shortfalls.push(`sitting ${k + 1} at ${(s.balanced * 100).toFixed(1)}%, under 70%`);
  if (all.borderlineRight < Math.ceil(all.borderline * 0.7)) shortfalls.push(`${all.borderlineRight} of ${all.borderline} borderline right, under 70%`);
  const margin = Math.ceil(all.borderline * 0.1);
  if (all.borderlineRight < all.rulesBorderlineRight + margin)
    shortfalls.push(`${all.borderlineRight} of ${all.borderline} borderline right against the rules-only predictor's ${all.rulesBorderlineRight}: not ${margin} clear of it`);
  return {
    pass: shortfalls.length === 0,
    balanced: all.balanced,
    each: [sa.balanced, sb.balanced],
    borderlineRight: all.borderlineRight,
    borderline: all.borderline,
    rulesBalanced: all.rulesBalanced,
    rulesBorderlineRight: all.rulesBorderlineRight,
    shortfalls,
  };
}
