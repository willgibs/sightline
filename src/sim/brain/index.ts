/**
 * The brain lane: orders, utility, beliefs, the commander and pacing (lab E). A brain
 * decides from its mind alone (mind.ts), behind the perception boundary. Everything
 * outside the lane reaches it through this file.
 *
 * Its contract: the mind a brain decides from (mind.ts), the orders it steers its body
 * with (orders.ts), and the brains themselves: the routine (routine.ts), and lab A's minimal
 * reactions to each state of the awareness ladder (react.ts), which lab E's brain replaces.
 */
export type { GuardMind, MindAwareness, NavAllowance } from './mind';
export { carryOut, standStill, type MoveOrder, type Order } from './orders';
export { keepRoutine } from './routine';
export { react } from './react';
export { groundSpot, type GroundSpot } from './ground';
export { emptyRoute, emptySteering, followRoute, navigatorOf, routeLength, type Route, type RouteResult, type Steering, type Walk } from './nav';
export { ACTS, ACT_WHYS, createBrain, decide, type ActChange, type ActName, type ActWhy, type BrainState, type Tasking } from './brain';
export { choose, response, type Curve, type Option } from './utility';
export { REPORT_KINDS, type Report, type ReportKind, type Told, type Via } from './reports';
export { clearSeen, createSearchMap, hottestCell, injectBelief, mapMass, mapSpread, spreadBelief, type SearchMap } from './searchMap';
export { ellipseArea, emptyEstimate, fuseBearings, inEllipse, mahalanobis2, type Bearing, type FuseGrid, type ShotEstimate } from './triangulate';
export { ALERT_LEVELS, alertRung, createCamp, type AlertLevel, type CampState, type RosterEntry, type SearchState, type Task, type TaskKind } from './camp';
export { digest, fuseShots, plan, spreadCamp, type CampMind, type CampOrder } from './commander';
