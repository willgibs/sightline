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
 * - **Sharper after a search:** once he has searched and settled, his floor rises and his
 *   eyes quicken (design doc: a raised baseline).
 *
 * Pure functions over a guard's senses, so the ladder is the same wherever it runs, and
 * every change it makes is returned for its system to emit and explain.
 */

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

/** The level a heard sound raises a guard to: faint at the edge of hearing, clear at clarity 4; a voice only its line's. */
export function soundLevel(p: PendingSound, tuning: Tuning): number {
  const A = tuning.perception.awareness;
  if (p.kind === 'shot') return A.shot;
  if (p.kind === 'voice') return p.voice;
  const t = (p.clarity - 1) / 3;
  return A.sound.faint + (A.sound.clear - A.sound.faint) * (t <= 0 ? 0 : t >= 1 ? 1 : t);
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
  let level = a.floor + s.level;
  if (level <= 0) return false;
  const inGrace = a.riseTick >= 0 && (tick - a.riseTick) / hz < A.grace;
  if (inGrace && level < a.riseLevel * A.graceBeat) {
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
