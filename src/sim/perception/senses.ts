import type { Belief, Percept } from './percept';

/**
 * What a perceiving body carries in the state tree: its sight meter, the sounds on their
 * way to it, its percepts, its place on the awareness ladder, and its belief. Plain data,
 * so it is hashed, saved and restored with everything else (CLAUDE.md, rule 9).
 *
 * Guards carry it where perception runs: the perception lab and its scenarios until A13,
 * when perception joins the valley and every guard gets it. A guard without it neither
 * sees nor hears, and keeps to his routine.
 */

/** The awareness ladder's states, lowest first (design doc · Individual awareness). */
export const AWARENESS = ['unaware', 'curious', 'suspicious', 'searching', 'combat'] as const;
export type AwarenessState = (typeof AWARENESS)[number];

/** A state's place on the ladder: 0 for unaware, 4 for combat. */
export function rung(s: AwarenessState): number {
  return AWARENESS.indexOf(s);
}

/** The detection meter toward the other side: it fills while someone is in view, and falls after they leave. */
export interface SightState {
  /** 0 to 1: at the cue (30%) the first sign shows; at 1 he has seen you. */
  meter: number;
  /** The last tick someone of the other side was in view, or −1. */
  seenTick: number;
  /** Who, and where their chest was then. */
  target: number;
  x: number;
  y: number;
  z: number;
  /** The 'noticed' event of the meter's last rise through the cue, while it stays above it; 0 otherwise. */
  noticed: number;
  /** The 'detected' event, once this rise reached 1; 0 otherwise. */
  detected: number;
}

/** A sound on its way to a listener: heard when it arrives (sound travels about 11 m a tick). */
export interface PendingSound {
  /** The tick it arrives. */
  arrives: number;
  /** The sound's event. */
  cause: number;
  /** What it sounded like: a step, a shot, a voice, a noise. */
  kind: 'sound' | 'shot' | 'voice';
  /** How clearly: its level over the masked threshold (1 at the edge of hearing). */
  clarity: number;
  /** Where it seemed to come from, blurred: the guess, not the fix. */
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface Awareness {
  state: AwarenessState;
  /** The tick he entered it. */
  since: number;
  /**
   * Evidence from everything but the meter, as a level on the ladder's scale (0 to 1):
   * a footstep heard raises it, a shot more. Each state's fall lowers it to that state.
   */
  evidence: number;
  /** He never settles below this: raised after a search (design doc: a raised baseline). */
  floor: number;
  /** How much quicker his eyes are than at the start: raised after a search. */
  sharp: number;
  /** The tick he steps down one state if nothing new arrives. */
  fallAt: number;
  /** The last rise from a stimulus: its tick and level, and how many more arrived in its grace period. */
  riseTick: number;
  riseLevel: number;
  graceCount: number;
  /** Where his attention is: the last stimulus that raised or held him. */
  focus: boolean;
  fx: number;
  fy: number;
  fz: number;
  /** The event behind his current state. */
  cause: number;
  /** He has searched since he last settled: when he does, his floor and eyes rise. */
  searched: boolean;
}

export interface Senses {
  /** A marksman's narrow far zone (perception.sight.far). */
  far: boolean;
  sight: SightState;
  /** Sounds on their way to him, in the order they arrive. */
  heard: PendingSound[];
  /** What he has sensed and not yet forgotten, oldest first. */
  percepts: Percept[];
  awareness: Awareness;
  /** Where he believes the intruder is; null until he has sensed one. */
  belief: Belief | null;
  /** When each bark line was last said (tick), for its cooldown. */
  barked: Record<string, number>;
}

/** A pair of fresh senses: unaware, nothing seen or heard. */
export function createSenses(far = false): Senses {
  return {
    far,
    sight: { meter: 0, seenTick: -1, target: 0, x: 0, y: 0, z: 0, noticed: 0, detected: 0 },
    heard: [],
    percepts: [],
    awareness: {
      state: 'unaware',
      since: 0,
      evidence: 0,
      floor: 0,
      sharp: 1,
      fallAt: 0,
      riseTick: -1,
      riseLevel: 0,
      graceCount: 0,
      focus: false,
      fx: 0,
      fy: 0,
      fz: 0,
      cause: 0,
      searched: false,
    },
    belief: null,
    barked: {},
  };
}
