import type { Scene } from '.';
import { liveCamp } from './liveCamp';

/**
 * The takedown (docs/foundation-review.md, section 3): a generated camp that protects what
 * it's guarding, played as a mission is meant to be. Trouble doesn't end it in half a minute.
 * It changes it, a stage at a time, and each stage can be seen or heard and worked against:
 * the whistle and the stand-to, the siren and the target in his hard room, the relief on the
 * road, the men sent to his door, and only then his run for the vehicle (brain/protect.ts).
 * Which stages a camp goes through depends on the problem it's built round: it holds him,
 * it bolts with him, or it waits for that relief (game/protection.ts, `answerOf`).
 *
 * It began as a mode: the live camp marked ready for trouble, with numbers of its own for
 * how a camp reads what it hears. On Nov 12 both became what every camp is, so this is the
 * live camp under the name its sittings link to.
 *
 * `?scene=takedown`, or `?scene=takedown&params=seed=LEB-2534%26perch=1` to start on the
 * camp's best overview.
 */
export function takedown(params?: string): Scene {
  const base = liveCamp(params);
  return {
    ...base,
    name: 'takedown',
    version: 2,
    title: base.title.replace('A live camp', 'The takedown'),
    description:
      'A camp that protects its target, by the problem it is built round. At a whistle its men get down and he goes to his hard room. At the siren, a camp you have to go into keeps him there to the end; a camp built to be flushed starts his vehicle, and he runs for it a minute later; any other calls its relief, and he leaves when they have come for him. Listen for the engine. Y changes the load: the subsonic one, with the suppressor (T), is the quiet one.',
  };
}
