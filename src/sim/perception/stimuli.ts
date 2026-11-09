import type { EventType } from '../kernel/events';
import type { PendingSound } from './senses';

/**
 * How guards take each kind of event they sense (A9): the wiring point for the stimuli
 * the other labs bring. A sound event (one with SoundFields) is heard by the law of sound
 * whatever it is; this says what it is heard as, which sets what it raises a guard to
 * (perception/awareness.ts, soundLevel): a sound by its clarity, a shot to searching, a
 * voice to its line's level.
 *
 * Each source is wired in when it is on `main`:
 * - lab B's report, impact and bolt are shots (an impact draws the eye to where it struck),
 *   and a cry is a voice, one a guard's own side doesn't ignore (B4, B8);
 * - a thrown thing's clatter stays a sound, by its clarity: it's a distraction, and it
 *   draws a guard to look, not to search (B9);
 * - a body seen, a comrade dropping and a flash from a lens come in by sight through
 *   'perception-spotting' (game/perception.ts), at their own levels (B4, B6);
 * - a door shut or opened is a sound, and a door not as it was left comes in by sight (E7).
 */
export const HEARD_AS: Readonly<Partial<Record<EventType, PendingSound['kind']>>> = {
  footstep: 'sound',
  land: 'sound',
  noise: 'sound',
  clatter: 'sound',
  bark: 'voice',
  cry: 'voice',
  call: 'voice',
  siren: 'voice',
  report: 'shot',
  impact: 'shot',
  bolt: 'shot',
  door: 'sound',
};
