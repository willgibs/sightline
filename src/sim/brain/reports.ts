/**
 * Reports (E4): what guards tell each other and the camp, as plain data. A report says
 * what was noticed, where, how sure, when and by whom, and which percept it came from, so
 * a chain of causes can be followed from an order all the way back to a footstep.
 *
 * Reports travel by voice (a sound, heard through lab A's hearing) or by radio (delivered
 * across the camp after a delay, if the speaker got his words out and the set and operator
 * are working). A guard knows only what reached him; the commander knows only its inbox.
 */
export type ReportKind = 'contact' | 'heard' | 'shot' | 'body' | 'missing' | 'clear';

export const REPORT_KINDS: readonly ReportKind[] = ['contact', 'heard', 'shot', 'body', 'missing', 'clear'];

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
}

/** How a report reached someone. */
export type Via = 'voice' | 'radio';

/** A report as held in a guard's memory: the report, how it reached him and when. */
export interface Told extends Report {
  via: Via;
  /** When he heard it. */
  heard: number;
}
