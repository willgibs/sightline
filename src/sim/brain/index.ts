/**
 * The brain lane: orders, utility, beliefs, the commander and pacing (lab E). A brain
 * decides from its mind alone (mind.ts), behind the perception boundary. Everything
 * outside the lane reaches it through this file.
 *
 * Its contract: the mind a brain decides from, the decision it makes, and the brains
 * themselves; today the routine (routine.ts).
 */
export type { GuardDecision, GuardMind } from './mind';
export { keepRoutine } from './routine';
