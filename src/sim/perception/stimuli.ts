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
 * - lab B's report, impact and bolt are shots, and a cry is a voice (B4, B8);
 * - a body seen, a comrade dropping, a thrown object landing, lens glint and an open door
 *   come in as stimuli at their own levels through `stimulate` (B4, B6, B9, D4).
 */
export const HEARD_AS: Readonly<Partial<Record<EventType, PendingSound['kind']>>> = {
  footstep: 'sound',
  land: 'sound',
  noise: 'sound',
  bark: 'voice',
};
