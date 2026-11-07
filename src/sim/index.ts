/**
 * The simulation's public surface. Everything under src/sim is pure TypeScript with no
 * rendering and no DOM, so it runs identically in the browser, in Node and in tests.
 */
export { Simulation, GUARD_FIELDS, type Snapshot } from './sim';
export { generateWorld, type World, type Spawn, type SpawnKind } from './gen/world';
export { neutralInput, quantizeInput, type InputFrame } from './input';
export type { SimEvent, FootstepEvent, LandEvent, StanceEvent, EventDraft } from './events';
export { PLAYER_ID } from './state';
export { EVENTS, isSound } from './events';
export { EventLog } from './eventlog';
export { exposure } from './perception/visibility';
export type { BodyState, Gait, Stance } from './motor/body';
export type { PlayerControl } from './entities/player';
export type { GuardState } from './entities/guards';
export { Recorder, Recording, type RecordingHeader } from './record/recording';
export { resimulate, type ResimResult } from './record/resim';
export { WanderBot } from './bots/wander';
export { FixedStepClock } from './core/clock';
export { Rng } from './core/rng';
export { normalizeSeed, randomSeed, isCanonicalSeed, DEFAULT_SEED } from './core/seed';
export { Blocks } from './world/colliders';
export { Surface, surfaceName } from './world/surfaces';
