/**
 * The perception lane: sight, hearing, percepts and the awareness ladder (lab A). It is
 * the only way anything about another entity reaches a mind (brain/mind.ts). Everything
 * outside the lane reaches it through this file.
 *
 * Its contract: percepts (percept.ts), which lab A turns into records with a kind,
 * strength, place, age, expiry and cause; and how visible a body is (visibility.ts).
 */
export type { Percept } from './percept';
export { exposure, movementVisibility, stanceVisibility } from './visibility';
