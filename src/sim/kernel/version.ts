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
 * field of the world; dsin and dcos reduce exactly from 10⁶ up (lab D, D1). 5: every
 * valley is lab D's, with a generated compound; Phase 0's test camp retires (D9). 6: six
 * kinds of site, plans for the compound, kinds of day for the target, and perches a body
 * can walk to. 7: tree crowns are part of the world, and a perch's view stops at them.
 */
export const GEN_VERSION = 7;

/**
 * How the simulation behaves for given inputs. 3: events carry ids, times, entity sources
 * and gaits. 4: guards keep to routines and move with the shared motor. 5: falls follow
 * constant gravity exactly, and land at the speed of touchdown. 6: a footstep happens
 * where and when the stride runs out within its tick, not at the tick's end. 7: on ground
 * too steep to stand on, a body's own speed no longer carries it uphill. 8: a body lying
 * down is a chain of circles along its axis, and the eye is the centre of the head wherever a
 * lean or lying down puts it (lab C, C2).
 * 9: the valley's guards perceive (A13: lab A's sight, hearing and awareness join its
 * systems). 10: men in a camp that fights get down at the spots that hide them, from a
 * longer search; a route with one end in the camp is found through fields (Lab F).
 * 11: a siren is heard through walls, so a man deep indoors still hears it.
 * 12: a tree's crown stops sight and bullets once a line has been through enough of it.
 * 13: the escape vehicle drives round the yard and down the road, and is away only at the end of it.
 */
export const SIM_VERSION = 13;
