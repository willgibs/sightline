/**
 * Version numbers for the two things a recording or a shared seed depends on. Bump one
 * with every deliberate change, together with the golden values in src/sim/game/selftest.ts
 * and a line in docs/decisions.md, so a mismatch between builds is explained rather
 * than mysterious.
 */

/**
 * What generation builds from a given MissionSpec. 2: guards' routines, generated with the
 * camp. 3: walls and buildings block sound (Blocks.Sound), and the fingerprint covers every
 * collider. 4: scatter depends only on seed, label and cell; the fingerprint covers every
 * field of the world; dsin and dcos reduce exactly from 10⁶ up (lab D, D1).
 */
export const GEN_VERSION = 4;

/**
 * How the simulation behaves for given inputs. 3: events carry ids, times, entity sources
 * and gaits. 4: guards keep to routines and move with the shared motor. 5: falls follow
 * constant gravity exactly, and land at the speed of touchdown. 6: a footstep happens
 * where and when the stride runs out within its tick, not at the tick's end. 7: on ground
 * too steep to stand on, a body's own speed no longer carries it uphill.
 */
export const SIM_VERSION = 7;
