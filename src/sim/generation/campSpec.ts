import { defaultEnv, type EnvSpec } from '../kernel/env';
import { missionSpec, type MissionSpec, type SpawnKind } from '../kernel/mission';

/**
 * What camp a mission asks for (lab D): the archetype whose layout rules build it, and how
 * hard it should be. It travels in the mission spec, so a recording names the camp it was
 * played in and a shared seed builds the same one anywhere.
 *
 * The core mission's archetype is the compound (owner, Nov 7), built as data in
 * `tuning.gen` so a logging camp or a comms relay can follow in Phase 3 as more data.
 *
 * Until D9, a mission with no camp spec builds Phase 0's valley and test camp, as every
 * recording and golden so far expects; one with a spec builds lab D's. D9 makes the
 * compound the default and retires the test camp.
 */
export interface CampSpec {
  archetype: CampArchetype;
  /** 0 (easy) to 1 (hard): how many guards, and how tightly they watch each other. */
  difficulty: number;
}

export const ARCHETYPES = ['compound'] as const;
export type CampArchetype = (typeof ARCHETYPES)[number];

declare module '../kernel/mission' {
  interface MissionSpec {
    /** The camp to generate (generation/campSpec.ts); absent, Phase 0's test camp. */
    camp?: CampSpec;
  }
}

export function defaultCampSpec(): CampSpec {
  return { archetype: 'compound', difficulty: 0.5 };
}

/** A mission that asks for a generated camp. */
export function campMission(seed: string, camp: CampSpec = defaultCampSpec(), insertion: SpawnKind = 'overlook', env: EnvSpec = defaultEnv()): MissionSpec {
  return { ...missionSpec(seed, insertion, env), camp: { ...camp } };
}

/** What is wrong with a camp spec, in words; none if it can be built. */
export function campSpecProblems(c: unknown): string[] {
  if (!c || typeof c !== 'object') return ['the camp spec is not an object'];
  const spec = c as Record<string, unknown>;
  const problems: string[] = [];
  const keys = Object.keys(spec).sort().join();
  if (keys !== 'archetype,difficulty') problems.push(`the camp spec has fields ${keys}, not archetype and difficulty`);
  if (!ARCHETYPES.includes(spec.archetype as CampArchetype)) problems.push(`no camp archetype '${String(spec.archetype)}'`);
  const d = spec.difficulty;
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > 1) problems.push(`camp difficulty ${String(d)} is outside 0–1`);
  return problems;
}
