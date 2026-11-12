import type { Tuning } from '../../config/tuning';
import type { AlertReason } from '../kernel/events';
import type { Belief, Percept, PerceptKind } from './percept';
import { AWARENESS, rung, type Awareness, type AwarenessState, type PendingSound, type Senses } from './senses';

/**
 * The awareness ladder (design doc · Individual awareness): unaware, curious, suspicious,
 * searching, combat. Thief's and The Dark Mod's shape, made exact:
 *
 * - **What he wants** is the highest state whose level the evidence reaches: the sight
 *   meter, or the evidence other stimuli left (a footstep heard, a shot), or his floor.
 *   Combat takes the meter at 1: a confirmed sighting.
 * - **A rise waits for the dwell** of the state he's in, one state at a time, so every rise
 *   is telegraphed: curious from the first cue at once, then suspicious after `dwell.curious`,
 *   and so on. About 1.5 s from something alarming to searching, as the design doc's
 *   reaction window asks.
 * - **A fall steps down one state at a time,** after the state's ramp-down without anything
 *   to hold it (sight of you at its level, or a stimulus of its level), each ramp-down varied
 *   by `spread` from his own stream.
 * - **Grace:** for a moment after a stimulus raises him, weaker ones are ignored, unless one
 *   beats it by `graceBeat`, or `graceCount` arrive, which counts as a stronger one.
 * - **One thing is a question, and two that agree are an answer** (the owner, Nov 12: a man
 *   is "more confused than immediately sprint to cover, depending on how likely I can
 *   confirm an attacking gunshot... as well as the reactions (or lack thereof) of those
 *   around me"). What a man sees he believes: one of his own down, a flash, an intruder. So
 *   does whoever he tells, if he's sure of it. What a man hears is a question: a bang is a
 *   gun somewhere, a snap is something sharp, a thud is a thud, a cry is someone hurt, and
 *   "shots!" on the net is someone else's ears. Any one of those alone leaves him wary at
 *   most. (A round that all but hits him is the one sound nobody has to ask about.)
 *   The cues of a shooting come by different ways: a rifle's report, the snap of its round,
 *   its strike, a voice, a man seen down, a flash. Two that come by different ways within a
 *   few seconds bear each other out, and so does the same sound again inside a minute:
 *   together they count a step more than the stronger does alone (`agree`). But two that
 *   are each a puzzle are still a puzzle. A snap and a thud, or a snap and a mate saying
 *   "Was that a shot?", leave him wary and no more (`agree.cap`). He is sure only when one
 *   of the two is plain: a gun's report heard well, a flash, a man crying out, a man he can
 *   see is down, the word of someone who is sure. So a bang with the snap of its round is
 *   fire, a snap with the whistle is fire, a bang with a mate who heard it too is fire, and
 *   one man alone with one sound is still asking.
 * - **Sharper after a search:** once he has searched and settled, his floor rises and his
 *   eyes quicken (design doc: a raised baseline).
 *
 * Pure functions over a guard's senses, so the ladder is the same wherever it runs, and
 * every change it makes is returned for its system to emit and explain.
 */

/**
 * The ways the cues of a shooting reach a man, for telling whether two of them agree: a
 * rifle's report, the crack of its round, its strike, the bolt; a voice (a comrade's word,
 * a cry, the camp's whistle or siren); a body he is sure of; a flash. In a fixed order.
 */
export const CUES = ['report', 'crack', 'impact', 'bolt', 'voice', 'body', 'muzzle'] as const;
export type Cue = (typeof CUES)[number];
/** The ones a single shot makes: the same one again, a while later, is another shot. */
const OF_A_SHOT: readonly Cue[] = ['report', 'crack', 'impact', 'bolt'];
/** Each in a word or two, for saying what a man is going on (the debug view, `npm run sitting -- --why`). */
export const CUE_WORDS: Readonly<Record<Cue, string>> = { report: 'a report', crack: 'a snap', impact: 'a strike', bolt: 'a bolt', voice: 'a voice', body: 'a man down', muzzle: 'a flash' };

/** A stimulus other than the meter, as the ladder takes it: the level it raises him to, where, and why. */
export interface Stimulus {
  kind: PerceptKind;
  /** The level on the ladder's scale it raises him to (before his floor): 0.3 is curious. */
  level: number;
  x: number;
  y: number;
  z: number;
  /** The event behind it, for the alert it causes. */
  cause: number;
  reason: AlertReason;
  /** Which way it came, if it's a cue of a shooting: it may bear out, or be borne out by, another (`agree`). Absent for anything else: a footstep, a door, a glint. */
  cue?: Cue;
  /** A voice with something to say: it bears out what a listener has noticed himself whatever level it has of its own, and "Was that a shot?" has none. */
  notice?: boolean;
  /** A cue there's no mistaking for what it is: a gun's report heard well, a flash, a cry, a man he can see is down, the word of someone who is sure. Borne out by one of these, or bearing one out, a man is sure; two that are both puzzles leave him wary (`agree.cap`). */
  plain?: boolean;
}

/** A change of state, for its system to emit as an 'alert'. */
export interface Change {
  from: AwarenessState;
  to: AwarenessState;
  reason: AlertReason;
  cause: number;
}

/** The level a state starts at, on the ladder's scale (combat: the meter at 1). */
export function levelOf(state: AwarenessState, A: Tuning['perception']['awareness']): number {
  switch (state) {
    case 'unaware':
      return 0;
    case 'curious':
      return A.levels.curious;
    case 'suspicious':
      return A.levels.suspicious;
    case 'searching':
      return A.levels.searching;
    case 'combat':
      return 1;
  }
}

/** The highest state a level reaches. */
export function stateAt(level: number, A: Tuning['perception']['awareness']): AwarenessState {
  if (level >= 1) return 'combat';
  if (level >= A.levels.searching) return 'searching';
  if (level >= A.levels.suspicious) return 'suspicious';
  if (level >= A.levels.curious) return 'curious';
  return 'unaware';
}

/**
 * The level a heard sound raises a guard to: faint at the edge of hearing, clear at clarity 4;
 * a voice only its line's. A shot is read the same way, by which of its sounds reached him
 * (the report, the crack, the strike, the bolt), each with its own levels and its own idea of
 * clear. One law says what he hears (kernel/sound.ts); this says what he can tell from it.
 */
export function soundLevel(p: PendingSound, tuning: Tuning): number {
  const A = tuning.perception.awareness;
  if (p.kind === 'voice') return p.voice;
  if (p.kind === 'shot') return shotLevel(p.sound, p.clarity, tuning);
  return ramp(A.sound.faint, A.sound.clear, (p.clarity - 1) / 3);
}

/** What one of a shot's sounds tells a man, by which it was and how clearly it reached him: the level it raises him to. */
export function shotLevel(sound: string | undefined, clarity: number, tuning: Tuning): number {
  const A = tuning.perception.awareness;
  // A crack has a third reading: a round that passed within a few metres is a near miss, and nobody takes that for a snap.
  if (sound === 'crack') return clarity >= A.shots.crack.closeAt ? A.shots.crack.close : ramp(A.shots.crack.faint, A.shots.crack.clear, (clarity - 1) / (A.shots.crack.clearAt - 1));
  const S = sound === 'impact' ? A.shots.impact : sound === 'bolt' ? A.shots.bolt : A.shots.report;
  return ramp(S.faint, S.clear, (clarity - 1) / (S.clearAt - 1));
}

/**
 * Whether one of a shot's sounds is plain to a man as a gun's: a report, or a bolt, heard
 * well enough to know it for one, or a round that all but hit him. A snap or a thud is a
 * puzzle, however near: it takes something else to say what it was (`agree`).
 */
export function plainShot(sound: string | undefined, clarity: number, tuning: Tuning): boolean {
  const L = tuning.perception.awareness.levels;
  if (sound === 'impact') return false;
  return shotLevel(sound, clarity, tuning) >= (sound === 'crack' ? L.searching : L.suspicious);
}

function ramp(faint: number, clear: number, t: number): number {
  return faint + (clear - faint) * (t <= 0 ? 0 : t >= 1 ? 1 : t);
}

/** Seconds a state's fall waits for, with its spread: `u` is a draw in [0, 1) from his own stream. */
function rampDown(state: AwarenessState, A: Tuning['perception']['awareness'], u: number): number {
  const base = state === 'curious' ? A.rampDown.curious : state === 'suspicious' ? A.rampDown.suspicious : state === 'searching' ? A.rampDown.searching : A.rampDown.combat;
  return base * (1 + A.spread * (2 * u - 1));
}

/**
 * Takes a stimulus: raises his evidence to its level (above his floor), unless a grace
 * period from the last rise has it ignored, and points his attention at it. Returns
 * whether it raised or held him. `draw` gives a number in [0, 1) from his own stream.
 */
export function stimulate(a: Awareness, s: Stimulus, tick: number, tuning: Tuning, draw: () => number): boolean {
  const A = tuning.perception.awareness;
  const hz = tuning.sim.tickHz;
  let level = a.floor + agreed(a, s, tick, tuning);
  if (level <= 0) return false;
  const inGrace = a.riseTick >= 0 && (tick - a.riseTick) / hz < A.grace;
  if (inGrace && level < a.riseLevel * A.graceBeat) {
    // A cue of a shooting has been weighed already with whatever bears it out: a weaker one adds nothing, however many come.
    if (s.cue) return false;
    // Weaker than the last rise, inside its grace: counted, and enough of them count as stronger.
    a.graceCount++;
    if (a.graceCount < A.graceCount) return false;
    level = a.riseLevel + A.repeat;
    s.reason = 'repeat';
  }
  a.focus = true;
  a.fx = s.x;
  a.fy = s.y;
  a.fz = s.z;
  if (level > 0.999) level = 0.999; // only the meter confirms a sighting
  const held = level >= levelOf(a.state, A);
  if (level > a.evidence) a.evidence = level;
  a.riseTick = tick;
  a.riseLevel = level;
  a.graceCount = 0;
  a.cause = s.cause;
  if (held) a.fallAt = tick + Math.round(rampDown(a.state === 'unaware' ? 'curious' : a.state, A, draw()) * hz);
  a.reason = s.reason;
  return true;
}

/**
 * What a cue counts for with whatever bears it out: its own level, or, if another cue has
 * reached him by a different way within `agree.within` seconds, or the same way again
 * between `agree.apart` and `agree.again` seconds ago, a step more than the stronger of the
 * two. Each is weighed at its own level, so agreement never compounds. Remembers the cue.
 */
function agreed(a: Awareness, s: Stimulus, tick: number, tuning: Tuning): number {
  if (!s.cue) return s.level;
  const A = tuning.perception.awareness;
  const G = A.agree;
  const hz = tuning.sim.tickHz;
  const counts = (level: number, notice: boolean): boolean => level >= A.levels.curious || notice;
  let level = s.level;
  let borne = false;
  let shot = OF_A_SHOT.includes(s.cue);
  let body = s.cue === 'body';
  let plain = s.plain === true;
  if (counts(s.level, s.notice === true)) {
    for (const k of CUES) {
      const c = a.cues?.[k];
      if (!c || !counts(c.level, c.notice === true)) continue;
      // Two voices of noticing bear nothing out: somebody has to have something of his own.
      if (s.level < A.levels.curious && c.level < A.levels.curious) continue;
      const age = (tick - c.tick) / hz;
      const other = k !== s.cue && age <= G.within;
      const again = k === s.cue && OF_A_SHOT.includes(k) && age >= G.apart && age <= G.again;
      if (!other && !again) continue;
      borne = true;
      if (c.level > level) level = c.level;
      if (OF_A_SHOT.includes(k)) shot = true;
      if (k === 'body') body = true;
      if (c.plain) plain = true;
    }
  }
  (a.cues ??= {})[s.cue] = { level: s.level, tick, ...(s.notice ? { notice: true as const } : {}), ...(s.plain ? { plain: true as const } : {}) };
  if (!borne) return s.level;
  // Two puzzles are still a puzzle: without something plain among them he's wary, and no more.
  if (!plain) return Math.max(s.level, Math.min(level + G.step, G.cap));
  // Borne out, it's what the two of them point to, whichever came last: a man down, or a shot.
  if (body) s.reason = 'body';
  else if (shot) s.reason = 'shot';
  return level + G.step;
}

/**
 * The cues of a shooting that have reached him lately enough to bear each other out, in
 * `CUES` order: what he is going on, for the debug view and for explaining a run. With two
 * or more of them, and something plain among them, he is sure.
 */
export function cuesInMind(a: Awareness, tick: number, tuning: Tuning): Cue[] {
  const within = tuning.perception.awareness.agree.within * tuning.sim.tickHz;
  const out: Cue[] = [];
  for (const k of CUES) {
    const c = a.cues?.[k];
    if (c && tick - c.tick <= within) out.push(k);
  }
  return out;
}

/**
 * One tick of the ladder, given the sight meter: a rise after the dwell, or a fall after
 * the ramp-down; the floor and sharpness after a search. Returns the change, if any.
 * `seenCause` is the 'noticed' or 'detected' event when the meter is what drives him.
 */
export function stepLadder(a: Awareness, meter: number, seenCause: number, tick: number, tuning: Tuning, draw: () => number): Change | null {
  const A = tuning.perception.awareness;
  const hz = tuning.sim.tickHz;
  const fromMeter = stateAt(meter, A);
  const fromEvidence = stateAt(Math.max(a.evidence, a.floor), A);
  const wanted = rung(fromMeter) >= rung(fromEvidence) ? fromMeter : fromEvidence;
  const now = rung(a.state);
  // Seeing him at this state's level or above holds the state up.
  if (rung(fromMeter) >= now && now > 0) a.fallAt = tick + Math.round(rampDown(a.state, A, draw()) * hz);
  if (rung(wanted) > now) {
    const dwell = a.state === 'unaware' ? A.dwell.unaware : a.state === 'curious' ? A.dwell.curious : a.state === 'suspicious' ? A.dwell.suspicious : A.dwell.searching;
    if ((tick - a.since) / hz + 1e-9 < dwell) return null;
    const to = AWARENESS[now + 1]!;
    const bySight = rung(fromMeter) > now;
    const change: Change = { from: a.state, to, reason: bySight ? 'seen' : a.reason, cause: bySight ? seenCause : a.cause };
    a.state = to;
    a.since = tick;
    a.fallAt = tick + Math.round(rampDown(to, A, draw()) * hz);
    if (to === 'searching' || to === 'combat') a.searched = true;
    // A sighting confirmed leaves strong evidence: when he loses you, he searches.
    if (to === 'combat' && a.evidence < A.glimpse) a.evidence = A.glimpse;
    return change;
  }
  // Evidence explains a rise but holds nothing up: only sight, or a fresh stimulus (which
  // moves `fallAt`), keeps him where he is.
  if (now > 0 && rung(fromMeter) < now && tick >= a.fallAt) {
    const to = AWARENESS[now - 1]!;
    const change: Change = { from: a.state, to, reason: 'calm', cause: 0 };
    a.state = to;
    a.since = tick;
    const level = levelOf(to, A);
    if (a.evidence > level) a.evidence = level;
    if (to !== 'unaware') a.fallAt = tick + Math.round(rampDown(to, A, draw()) * hz);
    else {
      a.focus = false;
      if (a.searched) {
        // He searched and found nothing: back to routine, sharper.
        a.searched = false;
        a.floor = A.floor;
        a.sharp = A.sharp;
        a.evidence = 0;
      }
    }
    return change;
  }
  return null;
}

/** Keeps a percept list to its live entries and at most `max`, oldest dropped first. */
export function prunePercepts(list: Percept[], tick: number, max = 8): void {
  let w = 0;
  for (let r = 0; r < list.length; r++) if (list[r]!.expires >= tick) list[w++] = list[r]!;
  list.length = w;
  if (list.length > max) list.splice(0, list.length - max);
}

/** Forms or refreshes a belief from a percept, if it is surer than what he believes now (its radius grown with age). */
export function believe(s: Senses, p: Percept, seen: boolean, tick: number, tuning: Tuning): boolean {
  const b = s.belief;
  const hz = tuning.sim.tickHz;
  const speed = tuning.perception.awareness.believedSpeed;
  if (b && !seen && b.radius + (speed * (tick - b.tick)) / hz < p.radius) return false;
  const next: Belief = { x: p.x, y: p.y, z: p.z, radius: p.radius, tick, seen: seen || (b !== null && b.seen && p.kind === 'sight'), cause: p.cause };
  s.belief = next;
  return true;
}
