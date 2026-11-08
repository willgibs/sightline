import type { AlertReason, AwarenessName } from '../kernel/events';

/**
 * The bark vocabulary (A8), started now because Alien: Isolation's took most of its cycle.
 * A guard says something when his awareness changes, so the change is heard as well as
 * seen: the second of the design doc's cues ("Hm?", "Who's there?").
 *
 * Barks run from specific to generic (Splinter Cell: Blacklist): a guard says the most
 * specific line that fits why he changed, unless he said it within its cooldown, then a
 * more generic one, so the player learns the cause without hearing a memorable line twice.
 * Each line is a voice, which the others hear by the law of sound; a shout carries farther,
 * and raises the guards who hear it to the level it names.
 *
 * Lines are only ever added, at the end: a recording stores a line by its index.
 */
export interface BarkLine {
  text: string;
  /** The state it's said on entering. */
  to: AwarenessName;
  /** The reason it fits; 'any' for the generic line of its state. */
  reason: AlertReason | 'any';
  /** Shouted: heard to `barks.shout` metres rather than `barks.radius`. */
  shout: boolean;
  /** What it raises the guards who hear it to (0: nothing; they hear it all the same). */
  level: number;
}

export const BARKS: readonly BarkLine[] = [
  { text: 'Hm?', to: 'curious', reason: 'any', shout: false, level: 0 },
  { text: 'What was that?', to: 'curious', reason: 'heard', shout: false, level: 0 },
  { text: 'Thought I saw something.', to: 'curious', reason: 'seen', shout: false, level: 0 },
  { text: "Who's there?", to: 'suspicious', reason: 'any', shout: false, level: 0 },
  { text: 'Footsteps. Close.', to: 'suspicious', reason: 'heard', shout: false, level: 0 },
  { text: 'Something moved out there.', to: 'suspicious', reason: 'seen', shout: false, level: 0 },
  { text: 'Again. Same place.', to: 'suspicious', reason: 'repeat', shout: false, level: 0 },
  { text: "Someone's out there. Checking it.", to: 'searching', reason: 'any', shout: false, level: 0.3 },
  { text: 'That was a shot!', to: 'searching', reason: 'shot', shout: true, level: 0.55 },
  { text: 'I saw someone. Moving to check.', to: 'searching', reason: 'seen', shout: false, level: 0.3 },
  { text: 'Contact! There!', to: 'combat', reason: 'any', shout: true, level: 0.55 },
  { text: 'Must have been nothing.', to: 'unaware', reason: 'any', shout: false, level: 0 },
  { text: 'Back to it.', to: 'unaware', reason: 'calm', shout: false, level: 0 },
  // A9: what he says on finding a body, and on a flash from a lens.
  { text: 'Is that... a body?', to: 'suspicious', reason: 'body', shout: false, level: 0 },
  { text: 'Man down! Man down!', to: 'searching', reason: 'body', shout: true, level: 0.8 },
  { text: 'Something flashed up there.', to: 'suspicious', reason: 'glint', shout: false, level: 0 },
  // E7: equipment that has stopped, and a door not as it was left.
  { text: "Why's that off?", to: 'curious', reason: 'outage', shout: false, level: 0 },
  { text: 'Something cut this.', to: 'suspicious', reason: 'outage', shout: false, level: 0 },
  { text: 'Who shut that?', to: 'curious', reason: 'door', shout: false, level: 0 },

];

/**
 * The line a guard says on changing to `to` for `reason`: rising, the most specific line
 * that fits and isn't in its cooldown, then the generic one; settling back to unaware, a
 * stand-down (another after a search than after a moment's curiosity); otherwise nothing.
 * Null if nothing can be said now. `last` is when he last said each line (tick), by index.
 */
export function chooseBark(
  to: AwarenessName,
  reason: AlertReason,
  rising: boolean,
  afterSearch: boolean,
  last: Readonly<Record<string, number>>,
  tick: number,
  cooldownTicks: number,
): number | null {
  const find = (state: AwarenessName, why: AlertReason | 'any'): number => BARKS.findIndex((b) => b.to === state && b.reason === why);
  if (!rising) return to === 'unaware' ? pick(find('unaware', afterSearch ? 'calm' : 'any'), last, tick, cooldownTicks) : null;
  const specific = pick(find(to, reason), last, tick, cooldownTicks);
  return specific ?? pick(find(to, 'any'), last, tick, cooldownTicks);
}

function pick(k: number, last: Readonly<Record<string, number>>, tick: number, cooldownTicks: number): number | null {
  if (k < 0) return null;
  const said = last[String(k)];
  return said !== undefined && tick - said < cooldownTicks ? null : k;
}
