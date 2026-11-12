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
 * 8: compound types: a keep, a depot and a farm (docs/compound-types.md).
 * 9: two-storey buildings: floors, stairs and windows, an upper floor the grid and the analysis know.
 */
export const GEN_VERSION = 9;

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
 * 14: terrain inside a body's rim backs it off toward its own centre where the ground there
 * would have carried it onto the high ground: the foot of a low ledge is no way up it.
 * 15: the camp's own men step out of the way of its vehicles, and an escape held up by
 * anyone else ends with the target getting out again; a camp can protect its target
 * (brain/protect.ts). No pinned run meets any of these, so no fingerprint moved.
 * 16: a route inside a camp is found by landmarks, so one that ran a search out of its
 * budget is now found, and of equally short routes a different one may be taken; a place
 * that can't be reached is known at once; a tick's looks for dead ground share a budget of
 * rays. No pinned run moved.
 * 17: the firefight (brain/firefight.ts): in a camp drilled for it, men who know where
 * someone close is fight from positions, fire back at a flash, and go after him by ways out
 * of his view, one at a time. No pinned run has anyone that close, so no fingerprint moved.
 * 18: the hunt (brain/hunt.ts, brain/commander.ts): a camp that hunts places a shooter from
 * what its men heard, says so from cover, sends a section out after him, and has its
 * marksmen cover the crossing; nobody else walks off its ground to look for him.
 * 19: a vehicle's engine is heard while it runs (the 'engine' event, game/escape.ts), so
 * every run with a vehicle on the move has new events in it. A protecting camp answers for
 * its target by the problem it's built round (brain/protect.ts): it holds him, or readies
 * his vehicle and bolts, or waits for its relief. A man on the target's door stays on it
 * once the siren has sounded, the relief knows the alarm is up, and an order doesn't take a
 * man off bringing the target out. No pinned run has a vehicle on the move or a protecting
 * camp at its siren, so no behaviour fingerprint moved.
 * 20: a camp goes by what it has seen and heard (brain/grounds.ts, game/perception.ts): a
 * shot's sounds are read by how clearly each was heard, in every camp; a thud or a snap a
 * long way off leaves nothing in a man's mind; a falling man is seen within the generator's
 * witness ranges, and a man lying farther off than a few metres is something to walk over
 * to; the siren takes a man who knows the camp is under attack, or a camp that has counted
 * two of its dead; every live camp protects its target; and a round breaks an alarm box.
 * The camp-fight run is a camp under fire, so its fingerprints moved.
 * 21: one thing is a question, and two that agree are an answer (perception/awareness.ts,
 * `agree`): any one cue of a shooting leaves a man wary at most (a report, a snap, a
 * strike, a shout, a word on the net); two that reach him by different ways within a few
 * seconds, or the same one again inside the minute, have him sure, if one of them is plain;
 * and a man says what he says as one who is sure or one who is asking. The siren still
 * takes a gun he heard or saw for himself. What a man was told leaves his mind before what
 * he sensed himself, so talk doesn't push out the shot he heard; and a camp that hunts
 * sends nobody out alone to a sound off its own ground. The camp-fight run moved again.
 * 22: a body on a path of its own (a mantle, a ladder) moves after every body that walks
 * or falls, so the pose it takes is clear of where they end the tick; and a body is shoved
 * from under feet just over its head when the tick would lift it into them (a step up, a
 * slope). No pinned run has a body under a ladder or a mantle, so no fingerprint moved.
 * 23: a refused move keeps the body's footing along with its place: settling looks a step
 * up for the ground only where a move was resolved to, so a body whose move is refused is
 * no longer lifted onto a ledge it only touches, into what is over it (body/motor.ts). No
 * pinned run has a refused body touching a ledge within a step, so no fingerprint moved.
 * 24: the chase (brain/firefight.ts): in a camp that chases, a man who knows an intruder
 * was inside its walls and watched him leave them by an opening, or heard it from one who
 * did, goes after him at once, at a run, to the opening and a step out of it, and looks
 * each way along the wall. Two at most are out at a time; they keep to the camp's own
 * ground, and once anyone has gone the rest keep inside the walls. And nobody fires at
 * ground he can't see into near where one of his own said he was going out. No pinned run
 * has anyone leave a camp by an opening, so no fingerprint moved.
 */
export const SIM_VERSION = 24;
