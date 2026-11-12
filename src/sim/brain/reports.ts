/**
 * Reports (E4): what guards tell each other and the camp, as plain data. A report says
 * what was noticed, where, how sure, when and by whom, and which percept it came from, so
 * a chain of causes can be followed from an order all the way back to a footstep.
 *
 * Reports travel by voice (a sound, heard through lab A's hearing) or by radio (delivered
 * across the camp after a delay, if the speaker got his words out and the set and operator
 * are working). A guard knows only what reached him; the commander knows only its inbox.
 */
export type ReportKind = 'contact' | 'heard' | 'shot' | 'body' | 'missing' | 'clear' | 'claim' | 'outage' | 'escort' | 'moving' | 'set';

/**
 * In the order events store them: only ever added to at the end. `escort` is what the men
 * sent to bring the target out say to him at his door (protect.ts). `moving` is what a man
 * shouts as he goes after an intruder in a firefight (firefight.ts): the place he's going to
 * look at, for whoever is in earshot to watch, and to leave to him. `set` is what a man on
 * the hunt says when he's down at the end of his bound (hunt.ts): where he is, for the other
 * half of his section, whose turn it is to move.
 */
export const REPORT_KINDS: readonly ReportKind[] = ['contact', 'heard', 'shot', 'body', 'missing', 'clear', 'claim', 'outage', 'escort', 'moving', 'set'];

export interface Report {
  kind: ReportKind;
  /** Where it was, as the speaker believed it, and how sure (metres). */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** When he noticed it. */
  tick: number;
  /** Who said it, and where he was. */
  from: number;
  fromX: number;
  fromZ: number;
  /** The event behind it: the percept the speaker acted on. */
  cause: number;
  /** A shot's bearing: how sure he is of the direction, radians at one standard deviation (E8). */
  sigma?: number;
  /** He is on his way to see it himself: the camp needn't send anyone (E5). */
  checking?: boolean;
  /** Who it's about, when it's about one of the camp's own: the man of his section who never came to the rally (hunt.ts). */
  about?: number;
}

/** How a report reached someone. */
export type Via = 'voice' | 'radio';

/** A report as held in a guard's memory: the report, how it reached him and when. */
export interface Told extends Report {
  via: Via;
  /** When he heard it. */
  heard: number;
}
