/**
 * The brain lane: orders, utility, beliefs, the commander and pacing (lab E). A brain
 * decides from its mind alone (mind.ts), behind the perception boundary. Everything
 * outside the lane reaches it through this file.
 *
 * Its contract: the mind a brain decides from (mind.ts), the orders it steers its body
 * with (orders.ts), and the brains themselves; today the routine (routine.ts).
 */
export type { GuardMind } from './mind';
export { carryOut, standStill, type MoveOrder, type Order } from './orders';
export { keepRoutine } from './routine';
