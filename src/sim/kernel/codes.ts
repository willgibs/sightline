/**
 * Event types and command kinds are stored as one byte in recordings, by a code that is
 * never reused once recorded. Each lane takes new codes from its own range, so lab
 * branches running in parallel can't take the same one (docs/phase-1-plan.md, Codes). Every
 * entry in the event and command registries (events.ts, commands.ts) names the range its
 * code came from, and tests/codes.test.ts checks that every code is unique in its registry
 * and inside its range.
 */
export const CODE_RANGES = {
  /** What the foundation defined before Phase 1: footsteps, stances, landings, shots, outcomes, firing. */
  foundation: [1, 9],
  /** Lab A. */
  perception: [10, 29],
  /** Lab B. */
  ballistics: [30, 49],
  /** Lab C. */
  body: [50, 69],
  /** Lab D. */
  generation: [70, 89],
  /** Lab E. */
  brain: [90, 129],
  /** Phase 2 onwards. */
  later: [130, 255],
} as const satisfies Readonly<Record<string, readonly [first: number, last: number]>>;

export type CodeRange = keyof typeof CODE_RANGES;
