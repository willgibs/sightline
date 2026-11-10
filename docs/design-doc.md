# Sightline · Game Design & Build Plan

> **This is a copy.** The design doc lives at [Sightline · Game Design & Build Plan](https://claude.ai/artifact/Q7JxvgeF1zrrTEWNrFQy7j), which only the owner's account can open, and the live doc wins wherever the two differ. This is its revision 43, kept in step with it on Nov 10, 2026, for sessions that can't open it, such as a Claude Code session without the Claude Docs connector. The live doc's four diagrams are written out here as text. Don't edit this copy to change the design: change the live doc, or propose the change to the owner, then export it again over this file.

Nov 7, 2026 · @Will Gibson

Sightline (working title) is a first-person stealth-sniper game. Every mission is a freshly generated enemy camp that you scout, plan against and take apart your own way. Only a great plan gets you out.

Build order follows one rule: prove the core in a primitive wireframe world first, then enhance it in every direction. If a mission isn't tense and fun with capsules and boxes, more content won't save it. The bar is set by ML research sims like OpenAI's hide-and-seek: plain shapes, gripping behavior.

Each system in Part 2 has its design, starting numbers (all tunable) and a **Done when** test. Taste calls are marked **Taste call** with a recommended default, and work proceeds on the default until the owner overrides it in Part 5.

## Part 1 — The game

### Vision

You're the most capable operator in a hostile valley: patient, informed and lethal at any range. You win by knowing more than the camp does and acting at exactly the right moment. When it slips, you're one person against a camp that's hunting you.

#### Pillars

1. **Find your own way.** No golden path. Tools, rules and layout combine so several approaches work, and a valid idea is never punished for not being the intended one.
2. **Good loses, great wins.** Merely competent plans snowball into failure. Difficulty comes from escalation, scarcity and competent enemies, never from one mistake and a restart.
3. **Information is the weapon.** Observation is the main verb. The player who watched longer and understood the camp's rhythm holds the advantage.
4. **Never a gimme.** Enemies are readable, fair and adaptive. Within a mission they react; across missions they learn your habits.
5. **A complete session.** A mission fits in 15–25 minutes and stands alone. Progression is skill and knowledge, not a grind.

#### Anti-goals

- Not a run-and-gun shooter. Going loud is survivable but rarely a win.
- Not a one-solution puzzle. No scripted triggers that only work one way.
- Not a grind. No XP bars, loot tiers or daily chores.
- Not instant-fail stealth. Being seen starts a problem, not a game over.
- Not multiplayer in v1. Depth comes from the AI; shared daily seeds are the only social layer.

#### Touchstones

| Game | What we take |
| --- | --- |
| Metal Gear Solid V | Open outpost infiltration, marking, enemies that adapt to your habits |
| Hitman (World of Assassination) | Systemic sandbox, many valid solutions, mastery through replay |
| Far Cry 3 outposts | The camp-clearing loop, alarms you can sabotage, one-person-army escalation |
| Shadow Tactics, Desperados III | Readable vision cones, plan-then-execute pacing, simultaneous takedowns |
| Invisible Inc. | Procedural stealth levels, a rising alarm, scarcity |
| Mark of the Ninja | Stealth systems made readable: noise, light, sight |
| Sniper Elite | Ballistics, masking shots with loud sounds |
| Hunt: Showdown, Warzone | Sound as information; the fear of the counter-sniper |

### Core loop

Each mission runs scout, plan, strike, then a replay that shows the difference between good and great.

> **Diagram: every mission runs scout, plan, strike, then a replay.** One mission takes 15 to 25 minutes; the enemy carries what it learned into the next.
>
> Brief (objective, intel, kit) → Insert (choose a way in) → Recon (watch, mark, learn) → Plan (perch, order, prep) → Execute (shoot, adapt) → Exfil (get out alive) → Debrief (replay and rating) → back to Brief (retry the seed, or take the next).
>
> From Plan back to Recon when there's not enough intel.

If recon leaves gaps, you go back and watch longer; after the debrief, you retry the seed or take the next mission.

#### Session shape

- **Mission:** 15–25 minutes, one camp, one sitting. You can suspend and resume, but there are no mid-mission saves to reload.
- **Operation:** 5–7 missions in one region over a few sittings. The enemy adapts between missions, and the operation ends at a final target.
- **Daily contract:** one seeded mission per day, the same for everyone. The first attempt is ranked.

#### Win and lose

- **Success:** complete the primary objective and reach exfil alive.
- **Failure:** you die, the target escapes, or the objective is lost.
- **Grades on success:** Ghost (never fully spotted), Clean (no camp-wide alarm), Loud (alarm raised, job still done).
- After a failure, retry the same seed with what you learned, or move on.

#### Three ideas that carry the design

1. **The camp's puzzle is who can see whom.** Guards who watch each other must be taken together, separated or blinded first. The generator builds and tunes this web of sightlines, so every camp is a new puzzle with several solutions (see Maps and procedural camps).
2. **An alarm doesn't kill you; it costs you the objective.** At full alarm the camp protects it: the target evacuates, intel gets burned. A great plan keeps the alarm down or has already covered the escape (see Enemy awareness).
3. **The enemy learns your habits.** Lean on one tactic and the next camp counters it, visibly and with counterplay. Your best way can't stay the same way for long (see Adaptation).

## Part 2 — Systems

### Player

First-person, with a top-down tactical map for planning. **Taste call:** the alternative is third-person with a first-person scope. First-person keeps the scope fantasy native and removes a full player animation set, a large saving.

#### Movement

| Mode | Speed (start) | Noise | Visibility |
| --- | --- | --- | --- |
| Sprint | 5.5 m/s | Loud; raises heart rate | Highest |
| Walk | 3.0 m/s | Moderate | High |
| Crouch walk | 1.8 m/s | Low | Medium |
| Crawl (prone) | 0.7 m/s | Very low | Low |

- Lean around cover, mantle low walls and windows, climb ladders. No parkour.
- Carry or drag bodies (slow, and noisy on gravel), then hide them in foliage or containers.

#### Visibility and noise

- How visible you are depends on stance, movement, light, cover, background and distance (see Enemy perception).
- A ridgeline against open sky makes you far easier to spot. Shoot from below the crest.
- Footsteps make sound by surface: gravel and metal are loud, grass and dirt quiet. Sprinting on gravel is about three times as loud as crouch-walking on grass.

#### Vitals

- **Health:** two or three rifle hits kill you. No regeneration; a few bandages stop bleeding.
- **Heart rate:** sprinting, taking fire and close calls raise it. High heart rate widens scope sway and shortens breath hold; it settles after about 20 s of calm.
- **Breath hold:** steadies aim for about 4 s, then recovers over about 6 s.

**Done when:** in a wireframe test camp, moving feels deliberate, and players can predict from stance and surface how loud and visible they are.

### Weapons, tools and ballistics

One rifle deep enough to master, plus a small kit where every tool solves one problem and creates another.

#### Loadout

- Rifle (always), suppressed pistol, knife, three tool slots and an ammo mix.
- Ammo is scarce: about 15 rifle rounds per mission to start. Scarcity stops you brute-forcing a camp.
- The core mission (Phases 1–2) uses only the rifle with a suppressor toggle, binoculars and one throwable. Everything else arrives in Phase 3.

#### Ballistics (realistic-lite)

- **Drop and travel time:** rounds fall and take time to arrive, about half a second at 400 m, so moving targets need a lead.
- **Zeroing and holdover:** set the scope's zero in 100 m steps, or hold over using the reticle's mil marks. The rangefinder gives the distance.
- **Wind:** a base wind per mission, plus gusts from Phase 3. Read it from flags, grass and smoke, or from the rangefinder on easier settings.
- **Sway:** prone is steadiest and resting on a surface helps. Heart rate and breath hold change it.
- **Hits:** a headshot kills. A torso shot kills an unarmored guard but may let him cry out first, so precision matters. Helmets can deflect long-range headshots once the enemy adopts them.
- **Penetration:** wood and thin sheet metal let rounds through; concrete and thick steel stop them (Phase 3).

#### What a shot sounds like

Sound is how the camp finds you, so every shot is a stealth decision.

- **Muzzle report:** loud, travels at 343 m/s, and gives away your direction.
- **Supersonic crack:** heard along the bullet's path, and it can mislead listeners about where the shot came from.
- **Suppressor:** cuts the report sharply, but the crack remains.
- **Subsonic ammo:** near-silent with a suppressor, but slow with heavy drop. A quiet short-range tool.
- **Masking:** shots during loud moments (a generator, thunder, a passing truck, bells) are much harder to place.
- **Impact noise:** a round striking near a guard draws his eye to the impact, not to you. A deliberate miss is a distraction.

#### Tools

Every tool's cost is one the AI actually reacts to.

| Tool | Solves | Costs |
| --- | --- | --- |
| Binoculars and rangefinder | Recon, marking, range and wind | Lens glint when facing the sun |
| Suppressed pistol | Quiet close kills | Short range; weak against helmets |
| Knife takedown | A silent kill | Must be adjacent; leaves a body to hide |
| Throwable (rock, bottle) | Pulls one guard's attention | He walks toward the noise, maybe toward you |
| Timed noise decoy | A remote, timed distraction | Repeated use makes guards wary |
| Smoke | Breaks line of sight | Announces you; raises suspicion |
| Sabotage kit | Kills a generator, lights, radio, alarm or vehicle | Must get close; the outage gets noticed |
| Drone (late unlock) | Remote recon | Audible up close; can be shot down |

**Done when:** in the shooting lab, hitting a walking target at 300 m feels earned and satisfying, and by the end of Phase 3 the AI reacts to every tool's cost.

### Enemy perception

Enemies sense the world in ways you can learn and exploit, and they never know anything they couldn't have sensed.

#### Sight

- Each guard has a core cone of about 60° and a peripheral cone of about 120°.
- Detection is a meter that fills, not a switch. Each tick it rises by a base rate, scaled by distance and the factors below.

| Factor | Starting multiplier |
| --- | --- |
| Cone zone | Core 1.0; peripheral 0.3; outside 0 |
| Stance | Standing 1.0; crouched 0.6; prone 0.3 |
| Movement | Still 0.4; walking 1.0; sprinting 1.6 |
| Light | Lit 1.0; dusk 0.6; dark 0.25 |
| Cover | The share of your body in view |
| Silhouette | 1.5 against open sky |

- Line of sight is tested to your head, chest and feet, so partial exposure counts partially.
- Range: a standing, moving player in the open can be spotted out to about 150 m in daylight. A still, prone player in cover is close to invisible beyond 50 m. Marksmen with binoculars see about 400 m in a narrow cone.
- Thresholds: below 30% nothing visible happens; from 30% the guard turns curious, then suspicious; at 100% he has seen you.

**Reading the table (owner, Nov 7):** stance and light act as range caps, and peripheral vision covers only a short range, so each factor is a boundary the honest view can show. Inside each zone, time to detection grows linearly with distance, and zone edges ramp rather than cliff. The multipliers above are starting values for the caps, and the ranges stand. Your light is the light at the ground beneath you, which is what you can see.

#### Hearing

- Sounds are events with a loudness and a type: footstep, shot, impact, voice, object.
- They travel along walkable paths around buildings, not through walls, and fade with distance and obstruction.
- Ambient noise masks hearing: a guard next to a generator hears far less.
- A heard sound gives a guess, not a fix. A shot from 300 m gives a rough direction and little sense of distance.

**One law of sound (owner, Nov 7):** guards hear exactly what the player would, by the same law the player's speakers use. Anything unfair gets a cue, never a bias such as deafness off screen.

#### What gives you away

- Bodies (the strongest stimulus), a missing patrol partner, an unanswered radio check-in.
- Sabotaged equipment, once someone passes it or needs it.
- Bullet impacts, thrown objects, open doors, lens glint.

#### Fairness rules

1. No omniscience: guards act only on what they've sensed or been told.
2. Every detection is telegraphed before it completes: a head turn, a bark, the meter at your screen edge.
3. Every detection can be explained afterward in the debug view.

**Done when:** in the perception lab, blind testers predict detection outcomes correctly at least 80% of the time using only the honest view, which shows just the cues the final game will give.

### Enemy awareness and the camp brain

Escalation replaces instant failure: a mistake starts a problem that a good player contains and a sloppy one compounds.

#### Individual awareness

| State | Trigger | Behavior | Cue you see |
| --- | --- | --- | --- |
| Unaware | Default | Routine: patrol, post, chores | Relaxed posture, chatter |
| Curious | A weak stimulus | Pauses and looks toward it | Head turn, "Hm?" |
| Suspicious | A moderate or repeated stimulus | Investigates with weapon raised | Weapon up, "Who's there?" |
| Searching | Strong evidence: a body, a close shot, a glimpse | Radios it in, sweeps the area, uses cover | Radio chatter, flashlight on |
| Combat | A confirmed sighting | Engages, flanks, suppresses, calls support | Shouting, firing |

Suspicion decays to a raised baseline, not to zero. A guard who searched and found nothing goes back to routine noticeably sharper.

#### The reaction window

A guard who sees something alarming, like a comrade dropping, takes about 1.5 s to react. Then he shouts, or runs for a radio or alarm box 4–8 s away. Great play lives in that window: chain the second shot inside it, or drop him before he reaches the alarm.

#### Camp alert level

| Level | Cause | Camp response |
| --- | --- | --- |
| Calm | Default | Routine |
| Uneasy | An unverified report | Extra check-ins; one guard sent to look |
| Alert | Evidence: a body, a close shot, a missing guard | Paired patrols, lights on, search teams, marksmen posted |
| Lockdown | A confirmed hostile or a raised alarm | Siren, objective protected, reinforcements called, perches swept |

- Escalating to Lockdown is physical: someone must reach an alarm box or a working radio. Cutting power or dropping the runner is a real play.
- At Lockdown the camp protects its objective: the target evacuates, or the intel gets burned. This is how good loses.
- Searches end. After a time budget the camp settles one level above where it started.

#### Beliefs, not truth

- Each guard holds beliefs: your last known position with an uncertainty radius, which allies are dead or missing, and where shots seemed to come from.
- Beliefs spread by voice nearby and by radio camp-wide, with a delay. Radio needs a working set and an operator.

#### Roles

| Role | Job | When you remove him |
| --- | --- | --- |
| Sentry | Watches a fixed sector | A gap opens, but he misses the next check-in |
| Patrol | Walks a route, often in a pair | His partner notices fast |
| Marksman | Watches far from a high post | The camp loses its long-range eyes |
| Radio operator | Runs check-ins and calls for help | No reinforcements until someone notices |
| Officer | Coordinates searches | Searches turn sloppy |
| Worker | Chores, unarmed | Still raises the alarm if he sees you |
| Target | The objective | Objective done; at Lockdown he flees first |

#### Radio check-ins

The radio operator calls each post every few minutes. A dead post doesn't answer, the camp goes Uneasy, and someone walks over to check. Your first kill starts a clock, unless you deal with the radio first.

#### Counter-sniper

This is the fear of being taken down yourself.

- Marksmen on towers and high ground scan sectors with long, narrow vision. Their scopes glint, and so does yours when you face the sun.
- After an unsuppressed shot, the camp estimates its direction and sweeps likely perches with marksmen, flares or smoke. Staying put after firing is dangerous: shoot, then relocate.
- Reinforcements arrive by truck after a delay, as a squad that hunts.

#### How it's built

- Each guard runs a state machine for awareness, with utility scoring to choose actions within each state: investigate, call it in, take cover, flank.
- A camp commander assigns search sectors, replaces missing patrols and calls reinforcements.
- A pacing layer caps how many guards converge outside combat, so searches feel thorough, not swarming.

**Done when:** in the camp-brain lab, a tester facing 5–8 guards can cause and recover from a suspicion episode, evade a search and interrupt an alarm. They can explain every reaction, and the debug view never shows a guard acting on knowledge he couldn't have.

### Adaptation

The enemy learns in two layers: a camp remembers incidents within a mission, and the faction learns your habits across an operation.

#### Within a mission

- After an incident, posture rises and stays up: paired patrols, more frequent check-ins, lights left on, sentries facing the likely threat.
- Repeated tricks lose effect. The first rock draws one curious guard; the third draws two guards and a radio report.
- Bodies found in the open push guards off exposed sightlines: they take cover and stop lingering in the open.

#### Across an operation (doctrine)

The faction tracks how you play: engagement range, headshot rate, time of day, tools, approach, bodies found and alarms raised. Between missions it adopts countermeasures against your dominant habits.

| If you lean on | They adopt | Counterplay |
| --- | --- | --- |
| Long-range headshots | Helmets on some guards; more marksmen | Closer range, armor-piercing rounds, timing |
| Night operations | Floodlights, flashlights, backup generators | Kill the power first; go at dawn or dusk |
| One perch | Counter-sniper teams; smoke and flares on suspected perches | Relocate between shots; masked shots |
| Close takedowns | Paired patrols; more frequent check-ins | Split pairs with distractions; go long |
| Distraction tools | Pairs investigate; second noises ignored | Vary tools; use the camp's own noise |
| Killing the radio operator first | A backup radio; a runner protocol | Sabotage the antenna instead |

- At most three countermeasures are active at once.
- They appear in the briefing as intel ("Guards are now issued helmets"), so adaptation is visible and plannable, never hidden.
- Some missions offer side objectives that set doctrine back, like destroying a helmet shipment. This is the light strategy layer.

**Done when:** across a five-mission operation, a tester who plays the same way every time feels the game push back, understands why, and must change approach to keep earning Ghost grades.

### Maps and procedural camps

Every mission is a fresh camp generated from a seed and validated before you see it, so variety never costs fairness.

#### Scale

A mission region is about 1–1.5 km² around one main camp of about 150 × 150 m. It also holds approach routes, perches, a checkpoint or outpost and the exfil. Typical shots run 100–500 m.

#### Generation pipeline

1. **Terrain:** a seeded heightmap shaped by biome rules (valley, ridges, river, cliffs, forest), guaranteeing several overwatch ridges 150–500 m from the camp.
2. **Archetype:** checkpoint, quarry, comms relay, logging camp, compound, occupied village, fuel depot or airstrip, each with its own layout rules. The core mission uses one.
3. **Layout:** perimeter, gates and towers, then buildings from a library of handmade modules, cover clusters, lights and noise sources.
4. **Systems:** generators wired to lights, alarm boxes, a radio with an antenna, vehicles including the target's escape vehicle, and the objective.
5. **Staffing and routes:** sentries at chokepoints and patrol routes generated for coverage, timed so routes open and close windows.
6. **Analysis:** who sees whom over time, coverage heatmaps, scored perches and lowest-exposure infiltration paths.
7. **Validation and tuning:** camps that fail the rules below are repaired or rejected, then staffing is adjusted to hit the target difficulty.
8. **Dressing:** props, foliage and ambient life, deterministic from the seed and irrelevant to play (Look track).

#### The sightline puzzle

> **Diagram: camp difficulty comes down to who can see whom.** Guards are dots and sightlines are lines; linked guards must fall together or be split first.
> - **Isolated sentry:** no one else can see him. A free first move.
> - **Mutual pair:** two guards see each other. Chain both shots or split them.
> - **Core cluster:** three guards cover the target. Distract, mask or sabotage.

A camp mixes all three, and patrol timing makes the lines appear and disappear over the course of a mission.

- Guards who can see each other form clusters. Dropping one guard in a cluster gets witnessed, unless the others are looking away, the shots are chained inside the reaction window, or the cluster is split first.
- The generator shapes this graph on purpose: a few isolated entry points, two or three small clusters, and a hard core around the objective. Patrol timing opens and closes clusters, which creates the windows a great player finds.
- Cluster count and size are the main difficulty knob.

#### Validation rules

Every camp must pass all of these:

- **A way through the camp's own problem:** each seed picks a decisive problem first, and the camp is built around it. Inside: the target stays deep indoors, out of every perch's view, and a way in to him exists. Flush: he stays indoors until the camp is shaken, then runs, and something can stop him. Escort: he walks in the open, mostly when another guard has him too, and a perch can have him long enough to shoot. Nothing else is promised on every seed. Finding what this camp allows is the reconnaissance.
- **No unsolvable cluster:** each has a timing window or a way to split it.
- **No single-perch win:** no one perch sees most of the guards, or the target for long, so a long-range plan has to relocate, split clusters or time its shots.
- **An interceptable escape:** the target's escape route crosses a perch's sightline or passes a sabotage point.
- **Two or more exfil routes where the way in is the camp's problem.**
- **Budgets hold:** at most 16 active guards, within the frame-time budget.

#### Seeds

Every mission is a seed, like TAL-4471. A seed gives the same camp, patrol timing and weather on any machine, so seeds can be shared and the daily contract is fair.

**Done when:** at least 90 of 100 consecutive seeds pass validation on the first try, the rest are repaired, and a reviewer finds a clearly different best plan in each of 10 random camps.

### Environment systems

Time, weather and light change the puzzle, not just the mood. Most arrive in Phase 3; the core mission runs in daylight with steady wind and the camp's own noise sources.

| System | Effect on play |
| --- | --- |
| Time of day | Dawn, day, dusk or night. Night brings flashlights, floodlights and fewer, closer patrols. Some missions let you choose when to go in. |
| Fog | Shortens all sight, favoring infiltration over range. |
| Rain | Masks footsteps and dulls hearing; slightly affects ballistics. |
| Storm | Thunder periodically masks shots. Timing a shot to it is a great play. |
| Wind gusts | Make long shots a read, not a formula. |
| Ambient noise | Generators, machinery, a radio playing music, a river. Each creates a zone where guards hear less. |
| Light | Generator-powered floods and lamps make lit zones dangerous and shadows safe. Kill the power and the map changes. |

**Done when:** the same seed played at noon and at night produces clearly different best plans.

### Missions, scoring and the debrief

Objectives give each camp a reason to exist, and the debrief replay teaches the difference between good and great.

#### Objectives

| Type | Goal | At Lockdown |
| --- | --- | --- |
| Eliminate | Kill the target | The target evacuates by vehicle |
| Retrieve | Take intel from a building | The intel gets burned |
| Sabotage | Destroy fuel, comms or artillery | The asset gets guarded |
| Clear | Neutralize every hostile | Reinforcements pour in |

- The core mission uses Eliminate; the rest arrive in Phase 3.
- Optional side objectives: no alarms, no bodies found, suppressed shots only, or setting doctrine back.
- Briefing intel can be wrong ("the target is probably in the office"). Recon confirms or corrects it.

#### Scoring

- The grade (Ghost, Clean, Loud) says how you did it; the score says how well.
- Score comes from stealth (detections, peak alert), precision (accuracy, headshots, one-shot kills), efficiency (time, rounds, tools) and style (chained shots, masked shots, impact distractions).
- Points reward the hard thing, not volume. Killing every guard is never worth more than slipping in for one perfect shot.

#### Debrief replay

- A top-down replay of the whole mission with a scrubber: your path, every guard's path and awareness, shot trajectories, sounds and the alert level over time.
- Jump straight to key moments: first suspicion, first sighting, the alarm, the shot.
- "What the enemy learned" shows the doctrine changes this mission caused.
- A share card with the seed, grade, time and key stats.

**Done when:** after a failed mission, a tester can find in the replay exactly why it failed in under a minute.

### Progression and meta

Progression is skill and knowledge, plus light unlocks that widen your options without inflating your power. All of it arrives in Phase 3.

- **No XP.** Tools unlock through feats. Finishing a mission with no alarms unlocks subsonic ammo; chaining three shots within 3 s unlocks a second throwable slot.
- **Sidegrades, not power creep.** Scopes, suppressors and bipods each trade one strength for another.
- **Operations:** 5–7 missions in one region with evolving doctrine. Finishing one opens a new region and biome: forest valley, desert canyon, snowbound pass, coastal port.
- **Daily contract:** one global seed per day with a leaderboard. The first attempt is ranked; later runs are practice. It needs a backend, so it lands in Phase 4.
- **Difficulty:** Standard, plus Hardline with fewer tools, tighter reaction windows and permadeath across an operation. **Taste call**, made during Phase 3.

**Done when:** after a full operation, testers want to start the next one, and no unlock feels like a mandatory power boost.

## Part 3 — Direction

### Art direction

The look is decided last, on purpose. Phases 0–2 run in a wireframe world, and art direction starts only once the core passes Concept proven.

#### The wireframe world (Phases 0–2)

The bar is an ML research sim like OpenAI's hide-and-seek: plain shapes, with all the interest coming from behavior.

- Flat-shaded grey geometry with crisp edge lines: terrain, boxes for buildings, cones and cylinders for trees and cover.
- Guards are capsules with a head sphere (a real headshot hitbox) and a stick for a weapon. Posture shows through simple transforms: weapon raised, head turned, crouched.
- Two views. The debug view shows everything: awareness colors, cones, meters, sound rings and beliefs. The honest view shows only the cues the final game will give, and every blind test uses it.
- Feel is in scope from day one: camera motion, recoil, scope sway, hit confirmation and sound timing are gameplay, not polish.

#### Rules the wireframe must respect

So it doesn't paint the final game into a corner:

- Guards must read at 300 m by silhouette and motion alone.
- Light is gameplay: lit and dark zones must be obvious.
- Scale is real: distances, sightlines and cover heights match the final game.

#### Leading candidate for the Look track (Phase 3)

**Field notes:** stylized low-poly, flat-shaded terrain under layered atmospheric fog, so distant ridges flatten into bands of color, with dramatic time-of-day light. It grows out of the wireframe world rather than replacing it: the same flat shading, plus color, fog and light.

- One focal point at a time: the camp and its guards are always the most readable thing in frame.
- No gore. Hits read through motion and sound.
- References: Firewatch for color and atmosphere, Superhot for readability, Mirror's Edge for color as information.
- Characters are stylized, with role silhouettes that read at range: a marksman's long rifle and hood, an officer's cap, a radio operator's backpack antenna.
- **Taste call**, made on proven camps at the start of Phase 3. Alternatives: monochrome with one threat accent, or a realistic look at far higher cost.

### Audio direction

Audio is information first and atmosphere second, so placeholder sound with correct behavior goes in early, and production audio waits for the Sound track.

- **Wireframe phases (0–2):** placeholder sounds that behave correctly: spatialized and occluded, crack-thump delay by distance, footsteps by surface, a distinct bark per awareness state, recognizable masking sources.
- **Sound track (Phase 3):** designed sound effects, voiced barks and a minimal adaptive score.
- **Score rules:** near-silence while unaware, a low pulse as suspicion rises, percussion at Alert, full tension at Lockdown. The music never tells you anything the game hasn't shown.
- **Your body:** breathing and heartbeat become audible when your heart rate is high or you're holding your breath.

### UI and HUD

Clean screen by default, dense information on demand, and one focal point at a time. The information design is gameplay, so it's prototyped in the wireframe phases; visual polish comes with the Look track.

- **In the world:** almost nothing. A small compass strip, detection indicators at the screen edge that fill toward a guard, and one quiet corner: what you carry at a glance (stance, suppressor, load, rounds, zero), over a light map.
- **Instruments:** a wrist watch for time and heart rate, a scope with a mil reticle and zero dial, binoculars with a rangefinder and wind readout.
- **Tactical map:** a topographic map that shows only what you've observed. Marked guards sit at their last seen spots, and patrol routes and timings draw themselves in as you watch. Lights, alarms and generators appear once spotted. Drop pins and sketch your route: it's the notebook of your plan. The light map in the corner is the picture a satellite took before the mission: relief, the fence, roofs as plain outlines, the road, the creek, the woods, and your own position. Nothing that moves, and nothing under a roof.
- **Debrief:** the scrubbable replay (see Missions, scoring and the debrief).
- **Type:** a technical monospace for readouts and a clean grotesk for text. Thin rules, no heavy game-UI frames.
- **Accessibility:** colorblind-safe threat colors, directional subtitles for barks, assists for sway and wind, remappable controls.

### Setting and tone

A fictional, grounded present day: a contested mountain valley where you work alone as a contractor against a private militia that runs remote camps. **Taste call:** alternatives are near-future (drones, thermal optics), Cold War (analog radios, a distinct look) or abstract (pure systems, minimal fiction).

- Morally gray, not cynical. No real-world factions, and civilians are never targets.
- Story stays light: briefings and intel snippets. The story is the operation you played.
- The wireframe phases need no fiction at all, so this call can wait until Phase 3.

## Part 4 — Building it

### Platform and architecture

Browser-first and code-only, built around one simulation that the wireframe world, the final art, the replay and the tests all share.

#### Platform

- Desktop browsers with keyboard and mouse first; gamepad later. A link opens a mission, which suits seeds and sharing. **Taste call:** the alternative is desktop-first with Godot, aimed at Steam.
- A desktop wrapper for Steam is evaluated in Phase 4, if the game earns it. No mobile: precision aiming and performance don't fit.

#### Stack (verified in Phase 0)

| Layer | Candidate |
| --- | --- |
| Language and build | TypeScript, Vite |
| Rendering | Three.js |
| Physics and raycasts | Custom TypeScript (Rapier tested and set aside) |
| Navigation | Grid A\* over the heightfield in lab E; Recast only if needed |
| Audio | Web Audio API with a custom propagation layer |
| Hosting and backend | Vercel; Supabase later for daily seeds and leaderboards |

Godot 4 has better built-in tooling, but a code-only web stack fits the owner's web background, ships as a link, and is easiest for an AI agent to build, test and verify headlessly. Revisit if the browser's performance ceiling bites.

#### Architecture

> **Diagram: one simulation drives the wireframe now and the final art later.** Swapping the renderer never touches game logic.
>
> Player input and the tuning config feed the simulation core (pure TypeScript, no rendering; a fixed 30 Hz step and seeded RNG; perception, AI and the camp brain; ballistics, sound and alarms; the camp generator).
>
> The core feeds four consumers: presentation (wireframe now, art later), the recorder (feeds the debrief replay), the headless runner (fairness tests, bots, seeds) and the debug overlay (live state of every system).

Because the wireframe and the final art read the same simulation, the Look track replaces only the Presentation box.

1. **Simulation apart from presentation.** Game logic runs in pure TypeScript at a fixed 30 Hz and never touches rendering. Swapping the wireframe for final art changes nothing in the game.
2. **Seeded determinism.** All generation uses a seeded random generator, never Math.random, so a seed means the same camp everywhere.
3. **Every mission is recorded.** A compact timeline of positions and states at 10 Hz, plus events, drives the replay and playtest telemetry.
4. **Data-driven tuning.** Every number in this doc lives in hot-reloadable config, so tuning never needs a code change.
5. **Explainable by design.** Every system ships with a debug overlay of its internal state.
6. **Budget:** 60 fps on a mid-range laptop at 1080p with up to 16 guards at full perception. Distant guards update less often.

### Tooling

Tools are built alongside each system, not after, because a stealth game is tuned by seeing why things happened.

| Tool | What it does | Built in |
| --- | --- | --- |
| Debug overlay | Cones, detection meters, sound events, navmesh, routes and each guard's beliefs | Phase 0, growing with each lab |
| Honest-view toggle | Hides everything the shipped game won't show | Phase 0 |
| Sandbox mode | Drop a noise, a body or a shot into a live camp and watch it respond, at up to 8× speed | Phase 1 |
| Seed explorer | A grid of camps with coverage heatmaps, sightline graphs, perch scores, approach paths and validation results | Phase 1 |
| Scenario runner | Headless test scenes as automated fairness checks, such as "crouched in shadow at 30 m: spotted in 3–6 s" | Phase 1 |
| Telemetry | Where detections and deaths happen, time per phase, tools used | Phase 2 |
| Bot players | Scripted runs of each approach that estimate difficulty and catch unwinnable seeds | Phase 3 |

### Roadmap

Prove a narrow core in the wireframe world, then enhance it in every direction. Phases 0–2 build only the core; once it passes Concept proven, four tracks deepen it in parallel.

> **Diagram: prove the core in wireframe, then enhance in every direction.** Phases run top to bottom; each ends at a gate the owner plays through. Phases 0–2 are in the wireframe world (primitives, placeholder sound, debug and honest views).
> 1. **0 · Foundations:** sim core, wireframe renderer, debug views, recorder. Gate **Engine runs**: walkable valley, headless sim.
> 2. **1 · Core labs:** perception, shooting, movement, camps, camp brain. Gate **Labs pass**: each meets its exit test.
> 3. **2 · Core mission:** one full mission in the wireframe, brief to replay. Gate **Concept proven**: it is cool in the wireframe.
> 4. **3 · Enhance in every direction**, four tracks side by side: Depth (tools, weapons, ammo; night and weather; camps and objectives), Adaptation (enemy doctrine; operations, unlocks; scoring and grades), Look (art direction; modules, characters; animation, UI polish) and Sound (designed effects; voiced barks; adaptive score). Gate **Whole game holds up**: a full operation, final look.
> 5. **4 · Ship:** onboarding, settings, daily contract, performance.

Nothing branches until the core passes Concept proven; after that, the four tracks run side by side.

#### The core (Phases 1–2)

Only what the core mission needs, each piece built deeply:

- **In:** the rifle with a suppressor toggle, binoculars with marking, one throwable; full perception and awareness; the reaction window; radio check-ins and alarms; the target's escape; one camp archetype from the generator; daylight with steady wind; the tactical map; exfil; the debrief replay.
- **Out until Phase 3:** night and weather, other tools and ammo, doctrine, other objectives, operations, art and production audio.

#### Phase 1 labs

Each lab is an isolated wireframe scene, built to its final quality bar before integration. Labs can run in parallel.

| Lab | Builds | Exit test |
| --- | --- | --- |
| A · Perception and awareness | Sight, hearing, stimuli, the awareness ladder, cues | Testers predict detection 80% of the time in the honest view |
| B · Shooting | Ballistics, scope, zeroing, sway, breath, wind, shot sound, hit feel | A 300 m shot at a walking target feels earned |
| C · Movement and body | Stances, lean, mantle, surface noise, light exposure, carrying bodies | Players predict their own noise and visibility |
| D · Camp generator | Terrain, one archetype, layout, routes, analysis, validation, seed explorer | 90 of 100 seeds pass on the first try |
| E · Camp brain | Check-ins, radio, alarms, alert levels, searches, reinforcements, counter-sniper | Escalation can be caused, contained and interrupted |

#### Phase notes

- **Phase 0 · Foundations:** repo and deploys; the sim core with a fixed step, seeded random generator and config; the wireframe renderer; a first-person controller; debug and honest views; the recorder.
- **Phase 0 · Foundation pass (done Nov 7):** before the labs start, the interfaces every lab extends were widened. The simulation's core:
  - one state tree with entity ids and save-states;
  - timed commands, so a shot between ticks resolves against what you saw;
  - an event log with causes;
  - one motor for every body;
  - one world query and body model;
  - the environment inside the simulation;
  - camps at sites;
  - scenes with rules that decide the outcome (the harness for the scenario runner);
  - recordings that seek exactly.

  Sound is timed against the picture, and footsteps and the head bob land on the stride. Playtests are kept as they are played, summarized with `npm run playtest`, and watched in a replay viewer, the base of the debrief replay. Every push checks that the simulation gives the same bits in Chrome's, Firefox's and Safari's engines and in Bun. The plan and its status are in `docs/foundation-plan.md` in the repository.
- **Phase 1 · Core labs (planned Nov 7):** a short pass of shared seams lands first. Then labs A (perception), B (shooting) and D (camps) run in parallel, and C (movement) and E (camp brain) follow once A's percepts land. The owner runs the blind trials; an agent reviews lab D's camps and the owner checks three. The plan, its status and how each exit test is measured are in `docs/phase-1-plan.md` in the repository.
- **Phase 2 · Core mission:** brief, insert, recon with the auto-annotated map, execute, exfil and the debrief replay, on generated camps. Nothing moves on until Concept proven passes.
- **Phase 3 · Enhance in every direction:** four parallel tracks. Depth adds tools, weapons, night, weather, more archetypes and objectives. Adaptation adds doctrine, operations, unlocks and scoring. Look starts with look tests on proven camps, then modules, characters and animation. Sound adds production audio, voiced barks and the score.
- **Phase 4 · Ship:** an onboarding mission, settings and accessibility, performance, the daily contract with a leaderboard, share cards and the desktop wrapper evaluation.

### Risks, parking lot and working model

#### Risks

| Risk | Mitigation |
| --- | --- |
| A pretty but boring game | Art waits for Concept proven; every gate is judged in the wireframe first |
| AI feels unfair or dumb | Perception lab first; the explainable debug view; blind tests in the honest view; automated fairness checks |
| Camps feel samey or broken | Handmade modules, the sightline-graph design, strict validation, human review of seeds |
| Sniping trivializes camps | Counter-snipers, helmet doctrine, shot sound, the check-in clock, the target's escape |
| Stealth feels punishing | The escalation ladder with recovery; tuning from telemetry |
| Browser performance over long sightlines | Fog caps draw distance; level of detail for terrain and guards; a performance spike in Phase 0 |
| Scope creep | A narrow core, exit tests per lab, the anti-goals, and no feature without a pillar it serves |
| Art cost | First-person removes the player's body; stylized characters with a small animation set |

#### Parking lot

Deliberately deferred; each needs a pillar-level reason to come back:

- Dogs and scent tracking
- Non-lethal options and disguises
- Co-op
- Drivable vehicles and destructible buildings
- A written story campaign
- Learned bot players that hunt for exploits and dominant strategies, in the spirit of the hide-and-seek agents

#### Horizons

Possible futures the owner has named. None is on the roadmap. They may shape the foundation's interfaces, never its features: a seam goes in only if it is cheap now and expensive to retrofit later.

- **Real-world terrain** (national parks, Everest, the Amazon, islands): camps placed at sites on a given landscape, and generation inputs that are named, versioned and content-hashed. Named real places also touch the setting taste call.
- **A bigger open world with several bases:** sites, entities that can appear mid-mission, colliders that can be added at runtime.
- **A plane drop with a parachute:** movement modes in one shared controller.
- **Survival with shelters, gear and supplies:** entities, save-states, and stable ids for generated objects.
- **A night zombie mode:** factions, a simulation clock, the shared controller and perception.
- **A broader open-world shooter:** an action map for controls, and content defined as data.

#### Working model

- Claude builds phase by phase. Each phase ends with a playable link and a short note of the decisions made.
- The owner joins only at gates and taste calls: about 10 minutes of play and one to three questions.
- The decision log in Part 5 records every call.
- This doc doubles as the brief for a Claude Code agent: each lab's spec and exit test can be handed over as is.

## Part 5 — Taste calls

### Taste calls

Calls 1–3 shape the core and have working defaults; the rest are deliberately made later. Work proceeds on each default until the owner overrides it.

| # | Decision | Recommended default | Alternatives | Decide by |
| --- | --- | --- | --- | --- |
| 1 | Perspective | First-person with a top-down tactical map | Third-person with a first-person scope | Decided Nov 7 |
| 2 | Platform | Browser-first, desktop wrapper later | Desktop-first with Godot, aimed at Steam | Decided Nov 7 |
| 3 | Ballistics realism | Realistic-lite: drop, travel time and wind, with assists | Arcade; full simulation | Phase 1 (shooting lab) |
| 4 | Setting | Fictional present-day valley, private militia | Near-future; Cold War; abstract | Start of Phase 3 |
| 5 | Art direction | Field notes: stylized low-poly, atmospheric, instrument UI | Monochrome with one accent; realistic | Start of Phase 3 |
| 6 | Meta | Operations plus a daily contract, unlocks by feats | Campaign only; endless roguelite | Phase 3 |
| 7 | Difficulty modes | Standard plus Hardline | One tuned difficulty | Phase 3 |
| 8 | Working title | Sightline | Holdover, Windage, Dead Air | Any time |

#### Decision log

| Date | Decision | Outcome |
| --- | --- | --- |
| Nov 10, 2026 | What you carry, and a satellite picture | Owner, after playing the takedown: the honest view needs a GUI, and the attacker should have what they could get from scouting satellite imagery. A corner card shows stance, suppressor, load, rounds and zero, over a light map of what a photograph could know. "Both sides realistically equipped, without gear that reduces the dynamics": no heartbeat sensors or UAVs |
| Nov 9, 2026 | What you can't see through, you can't shoot through | Owner, after the first sitting: a kill through tree cover from hundreds of metres is unfair, and "the fact that it can happen invites lots of problems." A tree's crown stops sight and bullets once a line has been through about a metre of it, by one law. A thin tip or rim only dims the line, and the crown round your own eye doesn't count |
| Nov 8, 2026 | No promised approach | Owner: a target anyone can shoot from any ridge makes every mission one shot from success and forces the same easy map. The guarantee that perches see the target goes. Each seed is built around a decisive problem, and validation promises only a way through it |
| Nov 7, 2026 | Foundation for many games | Owner: one foundation for many games and features, with each lane aiming past the best known solution and proving it on its own bench. A narrow kernel, lanes behind contracts, a bench per lane |
| Nov 7, 2026 | Sight, hearing and light | Owner's calls: stance and light become range caps, with a short-range periphery; one law of sound, with cues rather than biases; the player's light is the light at the ground beneath them |
| Nov 7, 2026 | Phase 1 plan | Owner's calls: the labs run in two parallel waves after a short pass of shared seams; the owner runs the blind trials; an agent reviews lab D's camps and the owner checks three; the core archetype is a compound |
| Nov 7, 2026 | Sniping's limits | Owner: one overlook must never clear a camp. Validation gains a no-single-perch-win rule, and lab E tests it against a perfect shooter |
| Nov 7, 2026 | Phase 0 gate | Passed. The owner played it at 120 fps on a Mac. Whether movement feels deliberate enough gets judged once there's more gameplay. |
| Nov 7, 2026 | Wireframe look | Approved by the owner as the canvas for Phases 1–2 |
| Nov 7, 2026 | Perspective and platform | Owner's call: first-person; browser-first, with a desktop wrapper later |
| Nov 7, 2026 | Physics | Custom TypeScript instead of Rapier: 4.6× faster raycasts, and the same triangles the renderer draws |
| Nov 7, 2026 | Bar for the core | Gripping in plain shapes, like an ML research sim |
| Nov 7, 2026 | Build order | Prove the core in a wireframe world first; art waits for Concept proven |
| Nov 7, 2026 | Challenge | Find your own way, but only a great plan wins |
| Nov 7, 2026 | Core fantasy | Planning and executing a perfect takedown; no long-term grind |
