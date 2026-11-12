import type { Tuning } from '../../../config/tuning';
import type { Scene } from '.';
import { formatLiveCamp, liveCamp, parseLiveCamp } from './liveCamp';

/**
 * The takedown (docs/foundation-review.md, section 3): a generated camp that protects what
 * it's guarding, played as a mission is meant to be. Trouble doesn't end it in half a minute.
 * It changes it, a stage at a time, and each stage can be seen or heard and worked against:
 * the whistle and the stand-to, the siren and the target in his hard room, the relief on the
 * road, the men sent to his door, and only then his run for the vehicle (brain/protect.ts).
 * Which stages a camp goes through depends on the problem it's built round: it holds him,
 * it bolts with him, or it waits for that relief (game/protection.ts, `answerOf`).
 *
 * It is a mode: the live camp with `ready=alert`, and numbers of its own over the game's
 * (kernel/scene.ts, `tune`; the numbers are `modes.takedown` in tuning). They are how a camp
 * reads what it hears, and what's in the kit:
 * - each of a shot's sounds counts for what it tells a man, by how clearly it reached him.
 *   A crack is a shot to someone within about 40 m of the bullet's path and a snap beyond;
 *   a strike is a thud that makes him look, and what he then sees is what tells him;
 * - the whistle turns heads and brings on the stand-to. It doesn't hand every man who hears
 *   it the alarm of someone who heard the shot himself.
 * - the kit carries the subsonic load as well as the match one (Y changes between them).
 * So a quiet round, well placed, can be quiet: the suppressor (T) with the subsonic load.
 *
 * `?scene=takedown`, or `?scene=takedown&params=seed=LEB-2534%26perch=1` to start on the
 * camp's best overview.
 */

/**
 * The takedown's numbers over the game's (`modes.takedown` in tuning). It only sets values
 * from the tuning it's given, so applying it twice changes nothing.
 */
export function takedownTuning(tuning: Tuning): Tuning {
  const M = tuning.modes.takedown;
  return {
    ...tuning,
    perception: { ...tuning.perception, awareness: { ...tuning.perception.awareness, shots: M.shots, whistle: M.whistle } },
    ballistics: { ...tuning.ballistics, rifle: { ...tuning.ballistics.rifle, carries: { ...tuning.ballistics.rifle.carries, subsonic: M.subsonic } } },
  };
}

export function takedown(params?: string): Scene {
  const p = { ...parseLiveCamp(params), ready: 'alert' as const };
  const base = liveCamp(formatLiveCamp(p));
  return {
    ...base,
    name: 'takedown',
    version: 1,
    title: `The takedown (${p.seed})`,
    description:
      'A camp that protects its target, by the problem it is built round. At a whistle its men get down and he goes to his hard room. At the siren, a camp you have to go into keeps him there to the end; a camp built to be flushed starts his vehicle, and he runs for it a minute later; any other calls its relief, and he leaves when they have come for him. Listen for the engine. Y changes the load: the subsonic one, with the suppressor (T), is the quiet one.',
    tune: takedownTuning,
  };
}
