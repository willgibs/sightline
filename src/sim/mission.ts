import type { SpawnKind } from './gen/world';
import { GEN_VERSION } from './version';

/**
 * Everything that decides what a mission's world is, named explicitly: the input to
 * generation and the first thing a recording stores. Shared seeds and daily contracts
 * depend on a spec always building the same world, so every input that can change the
 * world belongs here, versioned, rather than arriving from elsewhere.
 *
 * Later phases add fields here (the camp archetype, the objective, time of day and wind,
 * the loadout, difficulty, doctrine, and terrain from real elevation data identified by
 * its content hash), each defaulting to today's behaviour.
 */
export interface MissionSpec {
  /** Seed code, such as TAL-4471. */
  seed: string;
  /** Generator version the spec was made with; another version may build another world. */
  genVersion: number;
  /** Where the terrain comes from. Only the procedural valley exists so far. */
  terrain: { kind: 'procedural'; generator: 'valley' };
  /** Where the player starts. */
  insertion: SpawnKind;
}

export function missionSpec(seed: string, insertion: SpawnKind = 'overlook'): MissionSpec {
  return { seed, genVersion: GEN_VERSION, terrain: { kind: 'procedural', generator: 'valley' }, insertion };
}
