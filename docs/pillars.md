# The three pillars

The owner's picture of a great foundation, Nov 8, 2026. Everything we build should strengthen one of these, and the three work together.

**1. The world.** Dynamic, challenging maps that don't feel bland or repetitive across seeds; natural movement with collisions; materials that behave moderately accurately; camp designs worth studying. Engines now, art later: a lot of what makes it good comes from the engines.

**2. The camp.** Individual logic; how members react, coordinate and defend; how the whole camp thinks; how each group comes to know things. The core win is a dynamic system that can *fairly* gain information and intelligently react and defend. A good foundation allows more defences, more than one camp, recognition and information tools, and smarter decisions at individual and team level. It never stands around being picked off, and nobody is omniscient.

**3. The player.** Different weapons, limited loadouts, world interactions, open-world modes with many bases, target pursuits, survival, evade and escape, vehicles.

## The camp takes inputs. The player is one way of providing them.

"Once a camp can intelligently scout, perceive, use tools and defend against inputs like vision, sound and communications, then we're just creating different ways the player provides those inputs."

So the camp's core form has no player in it. **The compound simulator** (`?scene=compound`) is that core form: a live camp, with nothing to do it but what you drop on it. Fly anywhere, and drop a shot, a noise or a body, or cut its equipment, and watch the defence answer in real time. `npm run flaws` and `npm run experiment -- flaws` run every attack script against many camps and flag each moment the camp does something a defender plainly wouldn't. The aim is to find no flaws, against every kind of attack.

When a player drops into the map, they become the source of those inputs. The camp knows nothing about them beyond its own defences and the tools it has for looking.

What that means for how we build:

- **Inputs are typed and don't name their source.** A camp senses a sound, a sight, a bullet, a body, something broken. Nothing in its mind says "the player". A muzzle flash comes from whatever fired, wherever that was.
- **Tools are more inputs.** A new sensor is a new way to read a channel. New gear for the player is a new way to emit on one.
- **Fair information is the point.** Every piece of knowledge has a route: someone sensed it, someone said it, someone heard. Rule 13 is the whole game here.
- **Generalize at the third use.** Keep the seams clean now, and don't build for multiple camps or open-world modes before they're real. `docs/research/notes/labs/camp_information.md` has the smallest interface that would let a camp later run at lower fidelity.

## Always look for the greatest gain

Nothing here will ever be perfect. So we keep asking which pillar is weakest, measure it, and put effort there: `docs/lab-opportunities.md` is the running list, the experiments in `src/lab` keep it honest, and independent agents can improve weak areas while the main work goes on.

Research is a seed, not a ceiling. And when another game's idea is patented, as the Nemesis system is, we don't copy that pattern or round down to how they applied it. We take the problem it solves and build something clearly different and better. Sightline's memory is institutional and evidence-based: what a camp could actually infer and pass on, and how that changes its doctrine and its means. It has no named rivals who remember the player, and no ranks that reshuffle when they beat you. That's a design position, not legal advice: a commercial release needs a proper freedom-to-operate review.
