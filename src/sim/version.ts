/**
 * Version numbers for the two things a recording or a shared seed depends on. Bump one
 * with every deliberate change, together with the golden values in src/sim/selftest.ts
 * and a line in docs/decisions.md, so a mismatch between builds is explained rather
 * than mysterious.
 */

/** What generation builds from a given MissionSpec. */
export const GEN_VERSION = 1;

/** How the simulation behaves for given inputs. 3: events carry ids, times, entity sources and gaits. */
export const SIM_VERSION = 3;
