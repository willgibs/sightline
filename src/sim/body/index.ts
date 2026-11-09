/**
 * The body lane: the shared motor and its modes, which move every body the same way
 * (lab C owns it while it runs). Everything outside the lane reaches it through this
 * file; inside, files import each other directly.
 *
 * Its contract: a body is plain data in the state tree (BodyState), sized by its kind in
 * tuning.bodies; whatever steers a body writes a MoveIntent into the tick's `@intents`
 * channel during 'intent', and the motor system moves every body in 'motor', keeping the
 * invariants in motor.ts's header (InvariantWatch checks them).
 */
export {
  bodyHeight,
  createBody,
  groundBelow,
  hasBody,
  poseAt,
  type BodyEntity,
  type BodySpec,
  type BodyState,
  type Gait,
  type MantleState,
  type MotorModeName,
  type PoseSample,
  type Stance,
} from './body';
export { idleIntent, stepMotor, type Cylinder, type MotorContext, type MoveIntent } from './motor';
export { canMantle, mantleAt } from './mantle';
export { climbPrompt, ladderInReach, ladderLine, ladderLinks, ladderTop, laddersOf, type Ladder, type LadderLink, type LadderState } from './ladder';
export { requestStance } from './stance';
export { intentFor, intents, motorSystem } from './system';
export { clearOfBodies } from './chain';
export { bodyShape, bodyShapeAt, eyeOf, hipHeight, queryBodies, type ShapePose } from './shape';
export { bobDepth, headBob, stridePhase, type BobDepths } from './bob';
export { InvariantWatch, OVERLAP_TOLERANCE, STEEP_TOLERANCE, type InvariantReport } from './invariants';
export { breathRate, calmVitals, holding, holdLength, startle, stepVitals, type VitalsState } from './vitals';
