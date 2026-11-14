/**
 * The owner's sittings that play a camp, as data: every link the plan gives for one
 * (docs/phase-1-plan.md, *The owner's time*, the desk's public record), each once, with a
 * short name that stays. The sittings bench plays each of them as `npm run sitting` does
 * and takes the names as its seeds (experiments/sittings.ts; experiment.ts, `seedsOf`), so
 * CI's comparison of a change names any sitting that reads differently after it.
 *
 * A link is written as the plan writes it, without the deployment's address. What the plan
 * gives as a change to a sitting's links is a link of its own for each of them: "then
 * `KUV-9210`", "and without `perch=1` to walk in", and `%26off=...` ("the camp as it was").
 * A link two sittings share is listed once, under the first. A name is its sitting's, then
 * what sets the link apart, and is never changed: a comparison matches runs by it.
 *
 * Left out, as not a camp's doing or not a sitting this can play: the perception and
 * movement labs' trial modes (`?trials=`), the shooting range and the movement lab; the
 * compound simulator (`?scene=compound`), which has no player and no rules and plays its own
 * attack, so a sitting there would read as a camp left alone; and lab E's handmade camp
 * (`?scene=camp-brain`), an early look that doesn't count, with no perches to fire from.
 */

export interface Sitting {
  /** Short and kept: the bench's seed for the sitting, and how a comparison names it. */
  name: string;
  /** The sitting of the plan that links to it, by its lab and its name there. */
  sitting: string;
  /** The link, as the plan writes it. */
  link: string;
}

/** The series whose camps are the sittings: its seeds are their names, in this order (experiment.ts, `seedsOf`). */
export const SITTINGS_SERIES = 'sittings';

export const SITTINGS: readonly Sitting[] = [
  // Walked in from the valley's edge.
  { name: 'camps-LEB-2534', sitting: "E, and D's three camps", link: '?scene=live-camp&params=seed=LEB-2534' },
  { name: 'camps-KUV-9210', sitting: "E, and D's three camps", link: '?scene=live-camp&params=seed=KUV-9210' },
  { name: 'camps-HUM-0755', sitting: "E, and D's three camps", link: '?scene=live-camp&params=seed=HUM-0755' },
  { name: 'first-fight', sitting: 'F, the first fight', link: '?scene=live-camp&params=seed=LEB-2534%26perch=1&lab' },
  // Also the hunt's, the first move's and the target's answer's first link.
  { name: 'takedown', sitting: 'F, the takedown', link: '?scene=takedown&params=seed=LEB-2534%26perch=1&lab' },
  // Also the firefight's.
  { name: 'takedown-walk', sitting: 'F, the takedown', link: '?scene=takedown&params=seed=LEB-2534&lab' },
  { name: 'firefight-off', sitting: 'F, the firefight', link: '?scene=takedown&params=seed=LEB-2534%26off=firefight&lab' },
  { name: 'hunt', sitting: 'F, the hunt', link: '?scene=hunt&lab' },
  { name: 'hunt-off', sitting: 'F, the hunt', link: '?scene=takedown&params=seed=LEB-2534%26perch=1%26off=hunt&lab' },
  { name: 'gate-NUF-6608', sitting: 'F, out of the gate', link: '?scene=takedown&params=seed=NUF-6608%26gate=1' },
  { name: 'gate-VOP-9546', sitting: 'F, out of the gate', link: '?scene=takedown&params=seed=VOP-9546%26gate=1' },
  { name: 'gate-NUF-6608-off', sitting: 'F, out of the gate', link: '?scene=takedown&params=seed=NUF-6608%26gate=1%26off=chase' },
  { name: 'gate-VOP-9546-off', sitting: 'F, out of the gate', link: '?scene=takedown&params=seed=VOP-9546%26gate=1%26off=chase' },
  // Also the target's answer's.
  { name: 'first-move-HOT-7106', sitting: 'F, the first move', link: '?scene=takedown&params=seed=HOT-7106%26perch=1' },
  { name: 'first-move-NUT-4776', sitting: 'F, the first move', link: '?scene=takedown&params=seed=NUT-4776%26perch=1' },
  { name: 'answer-off-LEB-2534', sitting: "F, the target's answer", link: '?scene=takedown&params=seed=LEB-2534%26perch=1%26off=answer&lab' },
  { name: 'answer-off-HOT-7106', sitting: "F, the target's answer", link: '?scene=takedown&params=seed=HOT-7106%26perch=1%26off=answer&lab' },
  { name: 'answer-off-NUT-4776', sitting: "F, the target's answer", link: '?scene=takedown&params=seed=NUT-4776%26perch=1%26off=answer&lab' },
  { name: 'taller-VIH-9105', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=VIH-9105%26perch=1' },
  { name: 'taller-KAT-3755', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=KAT-3755%26perch=1' },
  { name: 'taller-MUD-8412', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=MUD-8412%26perch=1' },
  { name: 'taller-LUL-8783', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=LUL-8783%26perch=1' },
  { name: 'taller-VIH-9105-walk', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=VIH-9105' },
  { name: 'taller-KAT-3755-walk', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=KAT-3755' },
  { name: 'taller-MUD-8412-walk', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=MUD-8412' },
  { name: 'taller-LUL-8783-walk', sitting: 'D, taller camps', link: '?scene=takedown&params=seed=LUL-8783' },
];
