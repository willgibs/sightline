# Engineering decisions

Newest first. Taste calls and product decisions live in the design doc's Part 5; this log covers how the game is built.

## 2026-11-08 · The first fight, and a camp with no player in it

**Decision:** a camp that fights back is a flag on the camp (`fights`), so lab E's scenes are untouched, and the compound simulator (`?scene=compound`) tests it with no player at all: stimuli dropped by a person or a script, all through commands, so runs record and re-simulate. The owner's framing: the camp is the core, and a player is one way of providing its inputs.

**What it took.** A man hiding from where he first heard the shot hides from the crack, which points the wrong way (a median 46° off the real bearing). He now waits a moment for the report and hides from every listed perch near it, as a soldier is taught to. That took men really hidden from the shooter from 64% to 77%.

**What it did** (30 camps, a perfect shooter who stays): guards down 8.7 to 7.0 of 9.6; the share in his line 20 s after a shot 61% to 41%; rounds at him 0 to 3.8. It isn't a win yet: he's still never hit.

**The muzzle flash comes from the report, wherever it was fired**, so it's the input and not the player that's seen.

**What moved:** the brain's bench (guards down from one perch, 22 to 12 of 27). Nothing else pinned. Live camp is scene version 3.

## 2026-11-08 · Lab F: the owner's calls, and what review changed

**The owner's calls:** a sixth lab, required by *Labs pass*; firing gives you away a little; a mission ends when you get out. Sandboxes are near-term development instruments, not shipped games, and every step has to be human-playable.

**The way out is the end of the road, not the nearest edge.** From the perches that can see the target the nearest edge is a 92 s walk (`npm run experiment -- way-out`), which nothing the camp does could interrupt. The end of the road is 289 s on foot, and it's the way the reinforcements come in. E12's overlook keeps the old rule, because it measures whether the target falls or gets away.

**A trial's brief names only the action.** "In the tall wall's shade, 40 m from a sentry" told the player what the honest view was meant to show. Nobody had sat yet, so this was the cheapest moment to change it.

**Dead ground exists; hiding from one guessed point doesn't find it.** Of guards a perch can see, 100% can reach ground it can't see within 2 s, if they know the exact perch. A man hiding from one point 30 m wrong is really hidden 30% of the time. Hiding from every listed perch near the camp's belief works 100% of the time, within 2 s for 70%. The note below said cover within 12 m rarely hides a guard from a ridge. That was true of how we chose it, not of the ground.

**Two independent reviews changed the order of work.** `docs/camp-engine.md`, section 12, has what they found and what changed. In short: a person plays it before the rest gets built, hiding has to end, and shooting once and leaving must not win.

## 2026-11-08 · The camp needs hands

**The owner's call on the ridge shot:** contest it, and contest it through how a camp fights. A compound expecting attack has counter-snipers, and a camp under fire takes up defensive positions, returns fire, inspects where the shot came from and calls for support. Asked to assess that "through a lens of engines", we wrote `docs/camp-engine.md`. It's a proposal: nothing in it is built, and its calls are the owner's.

**What was tried first and shelved:** a generator rule that posts one more guard to watch the target's walk. 23 of 100 camps got one, and the longest unwatched moment on the walk fell only from a median 7.2 s to 5.0 s, because most candidates broke the limits on clusters. A guard posted on one walk contests one plan. It wasn't kept.

**What the measurement adds** (30 camps, series `lab-e-overlook`, a perfect shooter staying on the best perch): the camp fired no rounds at him in any run, no guard ever detected him, the nearest came a median 272 m, and 30 s after his first shot its estimate of his position was a median 62 m off. 4.8 guards stood in a clear line from the perch at the first kill, and 4.8 did 20 s later. The camp knows where he is and has no way to act on it.

Those scripts weren't kept. The numbers are now one command away: `npm run experiment -- friction`, `-- gallery`. The estimate is a median 74 m off when the runs with no estimate at all count as the worst, and 62 m without them.

## 2026-11-08 · One overlook, from both sides (E12)

**Decision:** the scenario `overlook` runs on any generated camp with the whole brain awake. `plan=clear` is a perfect shooter on the best overview who never moves and takes everyone he can see, the target last, one shot every 5 s by default (a person's pace; `pace=1.5` is as fast as the bolt allows). `plan=timed` is a shooter on a certified perch who waits for a clear line to the target's head while nobody is watching him, and fires, up to three times. The bench pins both on three camps. Scene expectations hold only what must be true on every camp.

**What it found** (30 fresh camps, series `lab-e-overlook`):

| | Guards down | Target got away | Cleared outright | Undecided or target down |
| --- | --- | --- | --- | --- |
| One perch, a shot every 5 s | 8.7 of 9.6 | 22 of 30 | 2 of 30 | 6 |
| One perch, as fast as the bolt | 8.2 of 9.6 | 10 of 30 | 1 of 30 | 19 |

The timed shot takes the target in 28 of 30, a median 138 s in. In the other two the shots were taken and didn't drop him. Left on his perch for two more minutes, in those 28: the alarm went up in 20, a median 8 s after the kill; nobody saw him or hit him; the nearest any guard came was a median 223 m; and the camp's estimate of the perch was a median 83 m off. That is what the owner's ridge-shot call rests on.

**What was tried and taken back:** ordering the whole camp to cover from the believed perch, having guards duck at the first shot they hear, and making cover hide the head, not the chest. Each made it worse. Guards ran across open ground to reach cover, and those who would have run for the alarm didn't, so the target stopped getting away. Cover within 12 m rarely hides a guard from a ridge in any case. Tuning this blind was the wrong tool, so the brain is as lab E left it and the question goes to the owner with the numbers.

**Why it's open:** the plan asks for "on every validated camp"; 2 of 30 isn't every, and the mission-losing alarm depends on who is left to raise it. The target's escape, not the guards' survival, is what stops a shooter on a ridge.

**What moved:** the brain's bench gains the four numbers. Nothing else pinned.

## 2026-11-08 · The camp's equipment (E7, E8, A9's doors)

**Decision:**
- **Sabotage is held, not pressed.** The use key has a held bit now (in the held byte, so older recordings still read). Holding it at arm's length stops the generator, breaks the radio at its set or its mast, or disables the target's vehicle. It's a step of the use system rather than a system of its own, because every other system in 'commands' already orders itself against 'use'.
- **Nobody is told.** A guard who looks at stopped equipment notices it, once. The operator finds a dead set at his next call. A runner finds a dead box. With the generator down the radio is down too, so a guard who notices can only say so aloud; the operator's report reaches the camp because the set is what's dead.
- **The hum stops with the generator:** in what masks a guard's hearing, and in the speakers.
- **The target's truck drives out,** and the mission is lost only when it's gone. It swerves round anyone in the road, and after 4 s held up it goes through, because a truck that a sentry can stop forever is a mission that can't be lost. Sabotaged, it strands him beside it and the mission stays open.
- **Doors** open and shut at a press and are heard. A guard who walks up to a shut door opens it, so no route needs to know. They all start open, so the cue is a door someone has shut.
- **Reinforcements come by truck** up the camp's road, timed to reach the gate at the delay, and get down behind it. A handmade camp has no road laid out, so its squad still arrives on foot.

**Marksmen stay on their towers, for now.** The plan had them moving to overlooking posts. Measured over 16 camps, a tower already overlooks 495 of 503 perches (98%) and every camp's best overview, so the move would matter for very few perches. It needs ladder links in navigation and a marksman who is no longer tied to his post, so it waits until a sitting shows it's missed.

**What moved:** nothing pinned. New state is absent until used, so runs that don't use it hash as before. The tuning grew, so the golden recording is rewritten.

## 2026-11-08 · The camp brain on generated camps (E13)

**Decision:** a scene, `live-camp`, puts lab E's whole brain on any generated camp, with the rifle. It is a scene rather than a change to the valley's systems, so the default valley's behaviour doesn't move until Phase 2 joins the labs. Lab D's entities hold the one answer about whether a box has power or the radio works; `campDevices` keeps the commander's copy of it, and raising a box raises its entity. A handmade scene's camp, with no such entities, keeps the list its scene gave it, so the scripted scenarios and benches are untouched.

**Why:** the review point read E7, E8 and E12 as nearly done. None could finish while the brain had only ever run on one handmade camp.

**What moved:** nothing pinned. The tuning gained the gap beside a vehicle where its driver gets in, so the golden recording is rewritten.

## 2026-11-08 · The valley is lab D's (D9)

**Decision:** every generated world now has lab D's valley and compound. A mission that names no camp gets the default one, and its spec says so (`world.spec.camp`), so a recording names the camp it was played in. Phase 0's terrain, test camp and terrain analysis are gone, with the ten `gen.world` values only they read. `?camp` still loads and does nothing; `&difficulty=` still sets how hard the camp is.

**Why:** the labs needed a stable valley while they were built. Keeping two generators now would mean every later system had to work on a camp nobody plays.

**What moved:** `GEN_VERSION` 5. `TAL-4471`'s fingerprint is `6493586d720c2b68`. Both fingerprints of the three pinned plays moved, the golden recording is rewritten, and the generation bench no longer counts Phase 0's valleys. No scene moved: `SIM_VERSION` stays 9. On a fresh held-out series (`lab-d-exit-4`), 96 of 100 camps pass at the first attempt, 4 are repaired or rebuilt within budget, and none is invalid.

**The tests that assumed the old camp** now say what they meant: guards keep to their routines within lab D's 25 cm, a recording's size allows for 16 guards' state, and the perception boundary's far places are the corners farthest from wherever the camp stands. Thin walls stop sound by their own flag, because 20 cm can fall between grid cell centres. The site test went: `tests/compound.test.ts` already holds the compound to rule 15.

## 2026-11-08 · After the labs

The night's review point, checked against the code the next afternoon.

- **E13 is added.** The review point said E7, E8 and E12 could finish now that labs C and D are on `main`. They can't, yet: `giveBrains`, the commander and the radio run only in the handmade `camp-brain` scene and its scenarios, a generated camp arms no rifle, and the brain's alarm boxes are a list of its own (`giveDevices`) beside lab D's `alarm` entities. E13 puts all of it on generated camps, in a scene, so the default valley doesn't move until Phase 2.
- **D9 doesn't wait on the owner.** Lab D held it for a go-ahead. It's in the plan, it is mechanical, and it can be undone; the owner has said sessions handle landing and versioning. The owner's spot check of three camps waits for E13 instead, because today those camps can only be walked.
- **`npm run land` looks past one failure:** Vercel's rate limit, recognized by its link to the upgrade page. CI builds the game itself, and the owner approved this default on Nov 8. Previews stay on and the plan stays free; any other failed deploy still stops a landing.
- **A9's doors go in with the use key.** Lab D's doors are on `main`, but they are generated open and nothing changes them, so there's no open door to notice until something can shut one.
- **The long runs passed on the merged `main`** (6e6d5f0, dispatched Nov 8): the 40-hour fuzz and the synctest, with every platform's check and the same hash on all three.
- **The pre-screen of the owner's four sets** (`OWNER-A1`, `A2`, `C1`, `C2`): two agents, each passing its perception check (8 of 8, and 7 of 8). The edge mark matches the record on all 140 frames, and nothing on screen gives an outcome away. Noted and left, since `Trial.legible` feeds only the probe's statistics and no trial or score moves: one frame's head is visible where the record calls it unreadable; a voice at exactly the bark radius is recorded as legible and not captioned; a noise trial's `legible` is all false by construction. Worth a look after the sittings: crawling in a bush, a pale band shows at the bottom of the screen where the foliage tint stops.

## 2026-11-08 · Lab E: the camp brain

The camp brain is built on the plan's defaults (`docs/phase-1-plan.md`, E) and research seeds; these are the calls made along the way.

### A guard with a brain is opt-in; lab A's minimal reactions stay where they are measured

**Decision:** A guard given a `brain` (`giveBrains`) decides through `decide()` (E3); a guard with senses but no brain keeps lab A's `react` (`game/guards.ts`, `think()`); a guard with neither keeps his routine.

**Why:** Lab A's scenes and trial mode measure sight against guards whose reactions it fixed (its trial protocol needs them to look, not to hunt), so its numbers must not move when E's brain lands. E3's "replace" holds wherever the camp brain runs. The valley moves to the brain in its own announced commit, after A13.

### The camp is an entity with one memory; the commander reads only that

**Decision:** Everything the camp believes is one plain record on a `commander` entity (`CampState`): its alert level, its search map, its roster, its tasks. The commander's mind (`CampMind`) is that record, the static world and the time; nothing else reaches its decisions, and the no-omniscience probe hashes it before and after.

**Why:** Rule 13 applies to the camp as to any guard. A single record makes the "fed only by reports" claim checkable: the map, the level and the ellipse change only by digesting the inbox.

### Reports travel physically; a guard told something only looks and waits

**Decision:** A report is an action: a radio call has a duration and its delivery is scheduled when it finishes, cancelled if the speaker drops, needing a working set and a live operator; a voice is a sound through lab A's hearing. A guard who is only told about something raises his awareness and looks; only his own senses start an investigation or a search of his own.

**Why:** It is the pacing the design doc asks for without a token system that reaches into minds: orders travel by the same honest channels, and convergence is limited by slots on what the commander sends (Halo 3's capacities), plus Blacklist's claiming ("I've got it"), not by reading who is where.

### Triangulation is a grid posterior, not a least-squares intersection

**Decision:** The commander fuses bearings on a coarse grid over a ring of plausible perches, reduced to an ellipse whose one- and two-sigma levels are the posterior's own 39%/86% mass (`brain/triangulate.ts`).

**Why:** Least squares says nothing useful about a lone bearing and is badly overconfident for the long, banana-shaped posteriors a clustered camp makes at 300 m. The grid handles both, is exact in every engine, and its cost is the budget (rule 18). A seeded test holds it to the 39% and 86% rates for one to six listeners.

### The in-world calibration bench was measuring one draw of each guard's ear

**Decision:** Each bench shot, and each pursuit, runs with its own world seed, so every guard's streams, and his ear's error, start afresh. The fudge factor that had been tuned against the old measure (`statedScale`, 0.85) is gone: the ellipse states the error each guard really has.

**Why:** Each guard's stream started from the same seed in all hundred shots, so an ear's error was one fixed draw per guard, and the bench's coverage swung from 36% to 61% at one sigma on a change that merely shifted a stream by one draw. Independent draws give 41% and 87% at one and two sigma, on target with no knob.

### The search map reaches 160 m out

**Decision:** The camp's map is still 64 by 64 cells, at 5 m a cell instead of 2.5 m.

**Why:** At 2.5 m the map stopped 80 m from the centre: an intruder who broke contact at 90 m was off the map before the search began, so the hottest cell hugged its edge and searchers stopped short. Coarser cells cost nothing a search can use.

### Competence is measured before pacing

**Decision:** The bench reports the honest brain as it plays (paced, three search slots at alert) and the same brain with every guard free to go.

**Why:** The plan's target is on the brain before the pacing layer throttles it ("Pacing then throttles it deliberately"), and the baselines aren't paced either. Paced, the brain re-finds at about the level of the staleness search, which is the point of pacing. Over 24 runs and 60 s: paced 21, unpaced 23, staleness 21, plain 19, random 5, omniscient 24.

### Lockdown doesn't lapse; a search below it does

**Decision:** A search ends on belief, as planned, at every level below lockdown. A raised alarm stays raised, so a camp in lockdown keeps hunting and never stands down from it. A guard learns the alarm is up from the siren (`sirenAt` in his brain), and only the box's position is in his mind: he doesn't run for a box he has heard sounding, and the target runs for his vehicle only once he has heard it.

**Why:** A review found a search's end dropping lockdown to the camp's floor, and the next plan raising it again, over and over. The design doc has lockdown as how good loses, with no way back from it in a mission.

### What a commander doesn't know, it doesn't know

**Decision:** A guard who finishes a task without a "clear" (he got stuck, a sweep ran out) stays on the commander's books until the order lapses, and the roster puts a guard where he was sent, not where he is.

**Why:** Both look like leaks, and a review flagged them. But the commander reads only what's reported to it: an order given and not reported on is exactly what it knows. A short lapse is the honest cost.

---

## 2026-11-08 · Lab B, shooting

Built on its branch as `docs/phase-1-plan.md`, section B, plans it. Its seed, the seed's shortfall and its targets are recorded there.

### How the lab is built

**Decision:**
- **One ballistic function.** The closed form for one quadratic drag constant per load, worked in the bore's frame (drop on g·cos θ, ½·g·sin θ·t² along the bore), with the lag rule for wind: drift = wind × (time of flight − distance ÷ muzzle speed). The bullet, the zero dial, the reticle's holds, the rangefinder's readout and every assist evaluate it; none integrates.
- **A bullet is its launch.** Its state is where and when it left, its direction, its muzzle speed and drag (at the mission's air), and the time up to which it has been swept; its position at any instant follows exactly. It is an entity, spawned when fired and despawned when it lands.
- **A shot resolves against what the player saw.** The `fire` command already carries the frame's instant and angles; the rifle sweeps the bullet from that instant to the tick's start against the bodies' two ticks of history, in 'commands', then 'projectiles' sweeps each tick's segment against every body part between its two poses, the terrain and the colliders.
- **The rifle and vitals are components a run's setup gives** (the player's `rifle` and `vitals`). The range scene gives them; the valley gets them in Phase 2, when the labs are joined. A click in the valley stays the bare `shot` it was.
- **Sway is sampled at every tick's end** (`rifle.sway`, with two ticks of history, as a body keeps its pose), from pure functions of the state and the time. The camera and the shot read it through one interpolation at the frame's instant.
- **Assist layers are view-only.** Arcade, realistic-lite and simulation differ in what the instruments show, never in the physics, so taste call 3 never changes a recording.

**Why:**
- The research's measurements (`docs/research/notes/labs/ballistics_and_shooting.md`): one Euler step per tick lands 18.5 cm low at 500 m, nearly a head, so a reticle drawn from an exact formula over an integrating bullet would lie. A function with no integration state can't drift from its instruments.
- Resolving the shot against history is the single-player form of lag compensation; the bodies already keep the two poses it needs.
- Giving the valley a rifle now would move every valley golden's state for a feature no bot uses, while labs A and D land beside this one. A loadout given by the setup keeps the valley still until Phase 2 joins the labs on purpose.
- Sway that changes every tick can't be re-evaluated exactly between ticks unless both sides read the same samples; two ticks of history is what the pose already does, so the shot and the drawn reticle agree by construction.
- **The binoculars' wind readout is arcade's only.** The plan's B6 lists a wind readout with the rangefinder; the design doc has the wind read "from flags, grass and smoke, or from the rangefinder on easier settings". So realistic-lite reads the flags, and arcade's readout gives the wind beside the hold. If the owner wants the readout on realistic-lite too, it is one condition in `app/scope.ts`.
- **Bullets and stones survive a save and a restore.** A synctest over the whole range run, saving every 5 ticks, puts saves inside every flight (`tests/shooting.test.ts`): a bullet in the state is only its launch, so nothing else needs keeping.
- **A thrown stone explains itself** (rule 8): the debug view draws the arc it is on, from its last touch to where it next meets the ground, and every touch's `clatter` is already a sound ring at its radius.
## 2026-11-08 · Public

### The repository is public, under MIT

**Decision:**
- `willgibs/sightline` is public, under the MIT License (`LICENSE`, © 2026 Will Gibson). The license covers the code and the documents, and grants no rights to the name Sightline.
- It stays the owner's project. `CONTRIBUTING.md` welcomes bug reports, best with a recording, and asks for an issue before any code. The README is written for people who find the repository.
- Production is public at sightline-brown.vercel.app, the repository's website link, and the README links it. Vercel Authentication covers sightline-willgibs.vercel.app and the previews, not the production domain, so Phase 0's entry below (Version control, CI and a playable link) overstated it.
- Nothing private is committed. The owner's local path is gone from the handoff, and a link only the owner can open, such as the live design doc, says so and points to the public copy.

**Why:** The owner wants people to be able to read the code and play the build, while the project stays the owner's own. MIT is the simplest, most familiar license for that. Art and sound, when they arrive, can carry their own terms.

## 2026-11-08 · Lab C: movement and body

Built on the `lab-c-movement` branch to `docs/phase-1-plan.md`, section C. Lean and the mantle use input the bots never give, so the valley's behaviour is untouched until the prone body (C2).

### The noise and visibility trials (C8), and the player's own light and noise (C7)

**Decision:**
- The exit test's protocol is lab A's, whole (`game/trials.ts`): the four cells, the borderline split by a rules-only predictor, the pairwise spread, the freezes, balanced accuracy, and the verdict over two sittings. It became generic at this second use: a `TrialSpace` supplies the draw, the run, the factor steps, the rule and the words. Lab A's sight trials are one space, and a seed draws exactly what it drew before.
- A noise trial (`scenes/noiseScenario.ts`) is one guard with his back turned and the player on a flat field of one surface, moving for 8 s at one gait along an arc about him, so every step comes from the same distance. A generator hums 5 m or 2.5 m from him in half the trials. "Will he hear you within 8 seconds?" The key comes from running it. A scenario table pins each gait either side of the edge of hearing, and the masking.
- The rule of thumb for noise knows how far a gait carries and the distance. It leaves out the surface and the hum, which are what the world has to show: the ground underfoot, the generator, your own footsteps. Its mistakes go both ways, so reading the gait and the distance alone gets about half the borderline trials.
- Half the noise trials freeze at the start and half after a few steps (2 s), so you have heard yourself on that ground. He only starts listening there: the pre-screen showed that freezing on the first footstep gave the answer away, with his "What was that?" already on screen. A sprint always freezes at the start, since running along the arc you aren't looking at him.
- The visibility half is lab A's sight scenario, drawn for what your own body and light do: one sentry, open ground, shade or the skyline, stance and movement together, distance.
- A sitting is 5 warm-ups and 30 scored, 15 of each kind shuffled together, at `?trials=<seed>&lab=movement`. `npm run playtest` scores it and keeps each lab's verdict apart. `npm run trials -- <seed> --movement --shots` pictures one for the pre-screen.
- C7: the lab's shade is drawn as simulated (lab A's shade map over the arena, held to `groundLight` by a test). Your own footsteps play at their simulated loudness (the browser audio test), and every surface tag matches its drawn material (`tests/surface-audit.test.ts`). The small cue on the body for ambient masking and light from behind isn't built: the plan wants it only if the trials fail without it.

**Why:** Two protocols would mean two ways of scoring that can disagree, and the owner would be sitting two different tests under one name. The rule of thumb is the honest baseline, because "people judge by distance" (the research behind lab A's protocol), and the surface and the hum are what this lab has to make readable.

### The use action (C6): carry, drag, hide

**Decision:**
- G (the `use` command, code 51; the debug view's grid moved to L) picks up the body in reach and puts it down. Standing it rides the shoulder, crouched it drags behind (`carry.speed` 1.6 m/s, `dragSpeed` 0.9): lab B's `remains` gains `carriedBy` and `hidden`. Lab E's sabotage and doors take their place on the same press.
- Carrying is slow and loud: a loaded step at carrying pace is as loud as walking (`noise.carry`); dragging also scrapes each step, by surface, loudest on gravel and metal (`noise.drag`), a new sound event (`drag`, code 51).
- Put down inside foliage or by a container it's hidden: `gameBodies` leaves it out, so guards' eyes and bullets find nothing there. (Lab A's body-finding reads the same flag.)
- Hands full: no mantling, ladders or lying down while carrying; crouching drags it.
- Carried, a body is out of every sight line and bullet: what's seen and hit is its carrier. It's reached on about the carrier's level, with a clear line from the eye. Dragged, it stops short of what's behind the carrier.
- A body is picked up standing or crouched, on the ground, and can be taken out of hiding again. Off the shoulder it comes down at the carrier's feet; dragged, it stays where it trails. Either way it lies on what's under it, not only the terrain.

**Why:** The design doc's "slow, and noisy on gravel" is a choice the player makes when they pick the route; the numbers (no shipped game publishes them) are starting values for the sittings.

### Ladders (C5), and fuzz bots that go looking for trouble

**Decision:**
- A ladder is a motor mode (`body/ladder.ts`): the climb press takes it from its foot or its top, forward and back move up and down it (1.8 m/s up, 2.2 m/s down), and a press lets go. The world's ladders are data (`world.ladders`, same shape as lab D's `LadderSpec`); `ladderLinks()` gives navigation (lab E) the two places each one joins, and how long it takes.
- Getting off the top is a mantle over the edge, checked pose by pose before it starts and every tick after (Half-Life 2's validated dismounts, without the fixed points); getting on from the top runs that same way backwards.
- A world's ladders are its own or its camp's (`laddersOf`): lab D's towers work as built, through the 0.8 m gap lab D left in the rail at the ladder's head. A test climbs every tower of a generated camp to its deck.
- A long fuzz in valleys says little about ladders: three hours of the chaos bot in the lab took a ladder six times. So the fuzz run also plays towers drawn from a seed, ground and clutter varied, with a bot that climbs them (`scene:ladder-tower`, `bots/ladderBot.ts`), and the watch checks that a mantle or a ladder doesn't move into another body.
- The fuzzing bot learned to lean hard into walls, press climb at walls and guards again and again, swing the body around while prone, and pump a ladder. The fuzz run also plays the movement lab (`movement-lab`), where the walls, windows, ladder and moving guards are.
- The chaos bot's new behaviours move `TAL-4471 chaos` and the benches' fuzz numbers; lean, mantle and ladders stay out of every other golden.

**Why:** "No motor mode gets an exception" only means something if the adversarial bots actually exercise each mode, every tick, for hours.

### The prone body (C2): a chain of circles, and the eye at the head

**Decision:**
- A lying body is a chain of circles along its axis (`body/chain.ts`, derived from `parts`: head, torso, legs), pivoting at a point near the chest (`pivot` 0.55 m back from the top of the head), so turning swings the legs and steadies the view. The circles' radii and spacing are chosen so they cover the capsules everything else sees: nothing clear of the chain can be inside the head, torso or legs.
- It grows out of the single standing circle over the stance change (`lying`, 0 to 1), pushing the body away from what it would meet, and stops if it can't; shrinking back is always free. It turns toward the view at `prone.turnRate` (2 rad/s), by the largest step that keeps every part clear, found with 6 bisections.
- It lies along the ground: the head, pelvis and feet rise with what's under them, within what a walkable slope allows, so the body pitches over rocks and banks. Parts within the pivot's own circle can't rise more than the pivot can step.
- The eye is the head's centre when prone too (`eyeOf`), so the camera moves to the head as a body goes down and the rifle's rest is found from the eye. `SIM_VERSION` 8: prone bodies collide as long as they are, and a prone shot leaves from the eye. The pinned runs that lie down moved: `movement-course`, `perception-lab` and `perception-crowd` (the walker ends prone in a bush), `shooting-range` (the marksman shoots prone), and `TAL-4471 chaos` (the bot learned new moves too). The valley's wander runs held, and lab A's trial metrics shifted slightly with the body. Every `state` fingerprint moved with `STATE_SCHEMA` 8.
- Measured with the fuzzing bot, ten minutes on the course and five each in two valleys (`npm run bench`): 548 of 16,869 lying poses have a part of the drawn shape more than 2 cm inside something solid, at worst 16 cm, against 3,258 and 49 cm for the seed's 0.3 m circle. Turning right round between walls a metre apart: 0 poses, against 259 (up to 0.25 m deep).
- Those 548 are the shape's limit, not the chain's. The chain's circles stay within the invariant watch's 0.1 mm, but the head, torso and legs are straight capsules, so a leg lying down a stair or across a ledge cuts the corner it lies over. The plan's target was zero, and it isn't met for the shape; the plan says so. Bending the legs, or lifting the body over the corner, would close it, and is left until the body has a real pose.
- What a circle of a lying body may rest on (a review of #11): `allow` is for ground that slopes. A collider counts as rest only within a step of the feet or of the terrain under that circle (`restBelow`), so a heel no longer takes a 0.8 m bank for the ground and lifts onto it in a tick, nor does crawling into a 0.5 m wall lift the eye 0.5 m. No end of a lying body rises more than a step in a tick, and the invariant watch now holds it to that. The cost is more shallow corner cuts (398 poses over 2 cm to 548) against a shallower worst (27 cm to 16 cm). Rule 10 is a promise and the bench is a measure of the drawn shape, so the promise wins.
- Getting up is checked as going down is. The 40-hour fuzz found the gap (PIF-1492): a lying body's reach onto the rock under its legs shrank as it drew in, so the ledge became a wall it was inside. Now a circle keeps its full-length reach while getting up; a body needs headroom along its whole length to start getting up (legs under a shelf refuse it, so the course's walker crawls on until its legs are out); and it draws in only as far as it ends the tick clear, waiting, eye and timer too, in a slot too narrow to stand in, and able to crawl out of it. The fuzz run also plays the course now, where the crawl space and low ceiling are.

**Why:** A 0.3 m circle standing in for a 1.75 m body is how prone clips in every shipped game that reported it (Arma, Hell Let Loose, Battlefield 2042); the chain makes the body as long as it is, for every promise the motor keeps.

### The mantle (C4): every pose, every tick, and no noise you didn't choose

**Decision:**
- A press of Space (the `climb` command, code 50) starts a mantle, if one can be found; it's never automatic, so its noise is one the player chose (Tarkov's automatic vault is the counter-example). A press stays good for 0.2 s, so one made just early still works.
- **Three probes find the ledge** (The Dark Mod's): forward at nine heights for the face, down for its top, an overlap at the landing pose. Only colliders can be mantled, so the rule that nothing gains height on too-steep terrain holds here as well.
- **Over or onto.** Shallower than `overDepth` (0.8 m) it goes over, if the far side is within `maxDrop` (1.6 m); deeper, or with nowhere to land beyond, it stands on top. The body squares up to the wall it faces, up to about 66° off square.
- **Four eased legs:** reach for the ledge, pull, shift, push down. It goes crouched, so a window that fits a crouch fits a mantle. Heights up to 1.5 m, about 0.6 s for 1.2 m, a little over 0.2 m of rise a tick at most.
- **Every pose is re-checked every tick** against everything solid (no step allowance) and every other body; a pose that isn't clear holds the body where it is, and after 0.4 s of waiting the mantle gives up and the body drops where it is. The Dark Mod validated its endpoint once, and clipped whatever moved in afterwards: on the bench, a walker crossing the landing is met 0 times; the seed path goes through him for 15 ticks.
- **Sounds:** the hands taking hold (a new sound event, `mantle`, code 50), by what they grip: 0.7 × surface × 12 m. Lowered down the far side is quieter than falling from there (`noise.mantle.drop`).
- `STATE_SCHEMA` 8 (taken with the lean, this is the same unmerged bump): bodies keep their mantle; the player's controls keep `climbWait`. No behaviour golden moved: the bots don't press climb.

**Why:** Mantles in shipped games fail by clipping and by surprising the player. Checking every pose, every tick, in every mode is the lab's claim (no motor mode gets an exception); making it a press rather than an automatic vault keeps the noise deliberate.

### The lean (C3): the eye is the centre of the head that's hit

**Decision:**
- A lean moves the head aside about the hips, the shoulders part way with it, and the arc takes the head down a little: `peek` 0.18 m with nothing raised, `weapon` 0.40 m with an optic up (Ground Branch's distinction), `bend` 0.58 of the spine, so a crouch leans less than a stand, `prone` 0.12 m.
- The eye is the centre of the head sphere in `bodyShape`, always, so the camera, a shot and a guard's rays all use the same point. A line from the eye to a guard's head and the line back are one segment and agree bit for bit.
- It grows at 1.4 m/s (`rate`), and a blocked lean goes as far as stays clear, found with 8 bisections. The world can force it back at any speed (a wall the body walks into), but it can't grow faster: a flick of the mouse can't throw the head out, and nothing is hidden.
- Sprinting gives it up. Turning carries the lean with the view; the weapon lean stays below `radius + headRadius`, so a head on a turning body can't pass through a wall the body is clear of.
- Lean is a held input (`input.lean`, recorded since the input's first format): the bots never give it, so no behaviour fingerprint moves.
- `STATE_SCHEMA` 8: bodies keep their lean. Every state golden moved; no behaviour golden did.

**Why:** The lean's reported failures are all about where the eye is: Siege moved the camera to the centre of the head to stop lean-spam, Dishonored hides the lean. Putting the eye at the head that guards target makes every lean honest by construction; the rate limit closes the flick (Siege patched a melee-and-lean input that moved the head almost instantly).

## 2026-11-08 · Lab A: perception and awareness

Built on the `lab-a-perception` branch to `docs/phase-1-plan.md`, section A. Until A13 the lab runs only in its scene (`?scene=perception-lab`) and its scenarios, so the valley's goldens hold.

### Perception joins the valley (A13)

**Decision:**
- **`SYSTEMS` now holds `PERCEPTION`**, in its phases, and the scenes stop listing it, lab E's too (its scenes, baselines, bench and tests, as its notes said they should). A guard spawned in a generated valley gets his senses at spawn (`setup.ts`, by the world's mission spec: its terrain is procedural), so reinforcements will perceive too. Handmade scenes and test worlds stay as they were: a scene gives senses with `giveSenses` to whom it wants.
- **`SIM_VERSION` 9 and `STATE_SCHEMA` 9** (lab C took the 8s). Real play changes (guards notice the player, and turn, walk and search by A7's minimal reactions until lab E's brain), though no pinned run does: the bots never come near a camp in their minute, so no `behaviour` fingerprint moves. Every `state` fingerprint does, for the schema number and the valley guards' senses.
- **Why it's ready:** a bot walking into five valleys' camps for 5 minutes each: every body promise held, guards rose through every state and stood down, and a median tick of 47–67 µs with the 99th percentile under 1 ms.

**What moved:** `SIM_VERSION` 9, `STATE_SCHEMA` 9; every `state` fingerprint; `BEHAVIOUR`; the golden recording; each valley's perception work in the game lane's bench.

### The other stimuli: lab B's sounds, the crack, bodies and lens glint (A9)

**Decision:**
- **Lab B's sounds, by what they are** (`perception/stimuli.ts`): a report, an impact and a bolt are shots, raising a guard to searching, with his attention on where he heard it (a deliberate miss draws his eye to the strike, as the design says). A cry is a voice at the same level, one his own side doesn't ignore. A stone's clatter stays a plain sound, by its clarity: it's a distraction, so he looks and doesn't search, and it never sends the camp hunting.
- **The crack comes from the bullet's path** (`game/perception.ts`, `deliverCrack`, with lab B's `crackAt`): each guard within 160 m of the path hears a shot from where the shock left it, when it reaches him, ahead of the report from the muzzle. So a suppressed shot's crack searches the path's side of the valley, not the shooter's. The path ends where the bullet meets the terrain or a wall (`flightEnd`, for the guards and the speakers alike), and a listener beyond that end hears no crack at all (found by the review: a bullet stopped by a wall cracked at guards past it, from under the ground).
- **A new event, `spotted` (code 16), for what a guard catches sight of that isn't a person** (`perception-spotting`, in 'perception' after sight and hearing):
  - A body is seen by the same law as a body lying still (`exposure`: its zones, caps, rays and foliage), and is news once per guard. One falling in plain view is seen falling, since it stands for the first moments of its collapse. It raises him to searching (the strongest stimulus), with a shouted "Man down! Man down!" that raises whoever hears it. He keeps it in mind for 2 minutes, and lab E can read it from his percepts.
  - A flash from a lens (lab B's `glint`, with the mirror's condition against the sun) is seen by a guard looking that way, in his core cone or a marksman's far one, up to 600 m with a clear line, when its glint is at least half. It's news when it starts, and raises him to suspicious.
- **The sandbox can drop a body** (`bodyDrop`, command 11; L in the debug view; `sightline.dropBody()`), already down, for a guard to find, as the design doc's sandbox line asks. The noise drop moved from X to K, because throw took X.

**Why:** the design's "What gives you away" list, each by the law that already applies, so a player who has learned sight and hearing has learned these too.

**What moved:** the perception lab's and the crowd's `state` fingerprints (`a568f302cd499718`, `869e55ebeb231e6b`), for the new fields of a guard's senses; their behaviour didn't move, since no body or rifle is in those scenes. The tuning gains the levels, so the golden recording is rewritten. Open doors (D4) wait for lab D's code on `main`.

### Trial mode: the exit test, built into the lab (A12)

**Decision:**
- **A sitting** (`?trials=<seed>`, `sim/game/trials.ts`, `app/trials.ts`) is the plan's protocol: 5 warm-ups whose outcome is shown, then 30 scored trials, none shown until the end. Each trial is a sight scenario: you, a guard who reacts as he would, 8 s, and a brief of what you'll do ("You crouch-walk behind the low wall, 60 m from a sentry"). It freezes at the start or at the first cue (his meter at 30%, plus 0.3 s for his head to start turning) and asks Y or N: will he see you? Every trial is a run of its own, recorded with the answer as an annotation; the results screen scores the sitting and saves it as a file.
- **The key is the simulation's.** Each candidate is run: seen or not, when, its first cue. It is **borderline** when one step of one factor toward the other outcome flips it, and every factor that does is recorded, for item analysis by factor (counting only the first, in a fixed order, credited stance with 41% of the flips and the skyline with 0.3%; counting every flip, the skyline flips 3 of the 30 borderline trials in the bench's two sittings, and stance 18).
- **The borderline trials are split by the sight table.** The research's rules-only baseline (the table applied to distance, stance and light, with no cues) proved strong: on sittings drawn without the split it scored 71% balanced on average and up to 86%, and 67% of the borderline trials. So each borderline cell holds as many trials the table gets right as wrong, and the table alone gets 7 of 15; the bar of 21 of 30 then can't be met by knowing the table, only by reading movement, cover, the skyline and the cues. The comparison with the baseline is on the borderline trials (docs/research/foundations.md): 3 more right of the 30 than the table alone.
- **The trials are spread over the factors**, as the research advises for "before the first sitting". Each cell gathers three times the candidates it needs, and the sitting takes those that add the most new pairs of factor levels, a greedy pairwise covering array over the guard, his gaze, the distance, the stance, the movement and the spot (light, cover and skyline are one draw), with the outcome and the kind of trial among the levels, so a surface feature, shade for instance, doesn't come to mean one or the other. The bench's first sitting covers 192 pairs against 165 taken first come. The warm-ups show all four combinations of seen or not and frozen at the start or at the cue.
- **The freeze doesn't tell (found by a review of this pull request).** Every seen trial reaches the first cue and most not-seen ones don't, so freezes taken where a cue existed made "frozen at the first sign" mean yes (77% seen) and "frozen at the start" mean no (30%), and a reader going by that alone scored 73%. Now each not-seen cell gathers trials that reach the cue, and each freeze kind holds the same share of seen and not seen (8 of 15, within clear and borderline, 53% either way), so the freeze alone scores 50%. The two kinds are also scored apart, as the research asks, since only the first-cue ones test reading the cues. The first cue's time still says a lot: a meter that reaches 30% early reaches 100% in time. A reader of that alone, with the table on start-frozen trials, scores 73% and fails the verdict; whether reading it counts is the owner's call, and is asked in the morning note.
- **The probe:** a trial frozen at its first cue then asks what told you (the mark, his head, his voice, the situation alone; Space skips). One tap, and it never gates. The results say how often each was named and how often that answer was right, and how often a cue was named that the simulation says couldn't be read.
- **Nothing is lost to a reload (found by the review).** Answers live in this browser's storage as they're given, and a reload picks up at the next question (`&fresh` starts over); the page asks before leaving an unfinished or unsaved sitting, in deployed builds; the sitting's file can be saved repeatedly; Y and N are ignored for 250 ms after a question appears (a double-tap) and with Ctrl, ⌘ or Alt held.
- **Scoring survives later builds (the review).** Each answer's annotation carries its key, so `npm run playtest` scores a sitting whose recordings this build can no longer re-simulate, or a sitting file whose tuning it can't use, and says what it couldn't check; a recording that contradicts its key is still a failure. The latest two sittings are by when they were played, not by name, and runs begun in the same second keep their own names.
- **The review:** on the results, R plays back the trials answered wrong, each with what happened and which single steps would have changed it. It's the research's cued retrospection, on a deterministic replay of the trial itself; nothing played in it is kept.
- **The verdict** (`verdict`) is the plan's four conditions over two sittings. The bench measures it against readers of known skill, 4,000 pairs of sittings each, beside the plan's first rule (48 of 60 right): a reader right on every clear trial who guesses the borderline ones passes 2.0% of the time (the first rule: 17.4%, the research's 18%); a reader right 80% of the time passes 50.9% (58.6%, the research's 57%); one right 90% of the time, 99.0% (99.5%).
- **`npm run playtest` scores sittings** from the answers their trials' recordings hold, generating each sitting again from its seed with the recording's own tuning and checking every recording against its trial; and from sitting files (`sitting-<seed>.json`, which carry their tuning), the record of a sitting played on a deployed build, which keeps only its last few runs. With two complete sittings it gives the verdict. In trial mode every trial's run is kept, however short.
- **The agents' pre-screen** (`npm run trials -- <seed> --shots`): every trial's freeze frame as the honest view draws it, with a manifest of what the simulation recorded there (whether the indicator shows, where the guard's eyes are drawn, whether his head can be read: at least 2 pixels, nothing solid between, foliage letting through 15%). The first pre-screen, of sitting PRESCREEN-1, passed its perception check (the guard where the manifest puts him, and the indicator wherever it says, in the frames checked) and found two things:
  - **The first cue's mark was invisible on a pale sky:** a cream arc at 40% opacity, luma 208 on a sky of 198–206. It now has a dark keyline and starts at 75% opacity (`app/cues.ts`).
  - **The bush hid less than the record said.** From inside a bush the view draws the guard with 18% of his contrast, as the simulation's transmittance there (0.17–0.21) says, and he plainly reads; the record's threshold was 50%. It is now 15%.
  Its findings change no trial: a trial is only ever dropped where the simulation shows a cue missing, and the generator already does that.

**Why:** the exit test is the owner's, and it should measure readability, not knowledge of the table; a test of a test (the readers) is cheap here because the simulation is the key.

**What moved:** the perception bench gains the trial metrics. No golden: trial mode runs only in its scenarios.

### The budget: sixteen guards perceiving (A11)

**Decision:**
- **The perception crowd** (`perception-crowd`): the lab with sixteen guards perceiving (the camp's most: eight sentries, seven on patrol and the tower, two marksmen, a worker), pinned in the perception bench, so its work is a budget: 34 rays a tick for sight and, over the 90 s walk in, 371,207 grid nodes for hearing.
- **Measured:**
  - in Node, per tick: median 0.14 ms, 99th percentile 1.9 ms, worst 5.5–7.8 ms (a burst of barks);
  - with `npm run scene -- perception-crowd --profile`: sight 107 µs, awareness and hearing 35 µs, the motor 37 µs;
  - in headless Chromium: 131 µs a tick, from `tests/browser/budget.test.ts`, which CI also runs in Firefox and WebKit;
  - against a 33 ms tick, and about 10 ms of a 60 Hz frame's own work.
- **One fast path, because it was needed:** a sound's flood goes no farther than 25 m along its path (`hearing.floodReach`). Beyond it a sound arrives by the straight line alone, which in the open is the same answer, and through walls loses 12 dB each. A shout's whole 60 m flood took 12 ms, and two in a tick 24 ms; now about 2 ms.
- **Fast paths already there:** a distant guard skips perception, because a body beyond every zone's farthest possible reach costs no rays. The world's steady sounds are flooded once, at the scene's setup, outside any tick.
- **Not needed:** a still body skipping the motor (lab C's), since the motor costs 37 µs for 17 bodies.

**Why:** rule 18's budgets are counts, pinned; time is a trend, reported.

**What moved:** the perception crowd joins the pinned runs (`e106e06750770ec4`, state `21e67f0f78200c87`), which moves `BEHAVIOUR`. Nothing else.

### Sandbox drops and the time scale (A10), and where other stimuli plug in (A9)

**Decision:**
- **A noise drop is a command** (`noise`, code 10): pressing K in the debug view (X until lab B's throw took it) drops a noise where the view points, carrying the moment and the view of the frame on screen like a shot, so it lands where the aim was at any frame rate. The `sandbox-drops` system (the game's, in 'commands', after the player's own commands) casts along that view from the eye at that moment and makes a 30 m noise where the line lands, heard by the law of sound. It is input the bots never give, so it joins `SYSTEMS` without moving a golden, and a recording replays it.
- **Automation:** `sightline.noise()` drops one; `sightline.timeScale(x)` sets the debug view's fast-forward (0.25× to 8×).
- **A9's wiring point** (`perception/stimuli.ts`, `HEARD_AS`): what each sound event is heard as, which sets what it raises a guard to. Lab B's report, impact and bolt become shots and its cry a voice when they land; a body, a comrade dropping, a thrown object, lens glint and an open door come in through `stimulate` at their levels when B4, B6, B9 and D4 are on `main`.

**What moved:** nothing. `SYSTEMS` gains `sandbox-drops`, after lab B's `rifle` in 'commands' (it reads the bodies the rifle may change); the spawn-tick scene's system in 'commands' declares its order after both (the same order as before).

### Cues in the honest view, and the fairness checks (A8)

**Decision:**
- **On the guard:** his head and body turn toward what caught his attention (A7's reactions), and his rifle comes up with his awareness: slung while unaware or curious, at the ready while suspicious or searching, shouldered at his eye in combat. The snapshot carries his rung of the ladder; at 300 m through a scope, the rifle carries it.
- **Barks** (`perception/barks.ts`): a line on each rise of the ladder and on settling, from specific to generic (Blacklist): the line that fits why he changed ("Footsteps. Close.", "Something moved out there."), unless he said it within 8 s, then his state's generic one ("Who's there?"). Each is a voice, heard by the law of sound (22 m, a shout 60 m), and raises the guards who hear it to its line's level: "Contact! There!" brings others to suspicious. Lines are only added at the end: a recording stores a line by its index. The speakers play a murmur of syllables until voiced lines (Phase 3).
- **The detection indicator at the screen's edge** (`app/cues.ts`): for every guard at the cue (30%) or above, a mark on an ellipse just inside the screen's edge, toward him, wider, thicker and warmer as his meter fills and his awareness rises, solid red at 100%. Nothing below the cue.
- **Captions:** a guard's words, only when they reach your ears by the law of sound, with an arrow toward where they came from.
- **Explained afterwards:** `describe` and `explainChain` (`perception/explain.ts`) say each event of a chain in words with the numbers that decided it; the debug panel's perception section shows each guard's state, meter and belief and the last change of awareness explained back to what caused it; `sightline.explain(id)` and `sightline.perception()` for scripts.
- **The fairness checks** (`tests/fairness.test.ts`), over the lab's own run and a seeded zig-zag through it: every detection's cause is its first cue, at least 1.5 s before outside contact; every change of awareness is caused by a percept of the same guard ('noticed', 'detected' or 'heard'), or is a calm stand-down; every 'heard' by a sound; every bark by an alert; every detection reads back, in words, to its first cue.

**Why:** the design doc's three telegraphs (a head turn, a bark, the meter at your screen's edge) and its rule that every detection can be explained afterwards. Barks run specific to generic so the player learns the cause without hearing a memorable line twice.

**What moved:** the perception lab's fingerprints (`da54eed00707a631`, state `f9afc16fbdc72c64`): at tick 353 a guard's bark reaches another, who hears it and rises (`npm run explain`). Its sight bench rays 25,723 → 26,033, and awareness floods 60,480 grid nodes. Nothing in the valley, so no version moves: until A13 perception runs only in the lab's scenes, which recordings name.

### Shade and foliage, drawn as simulated (A4)

**Decision:**
- **The ground's shade is the simulation's.** A world that draws its shade names an area (`world.shadeArea`; the lab's camp, field and ridge at 0.5 m). The renderer fills a map of `groundLight` at each texel's centre (`perception/light.ts`, `shadeMap`, 0.7 s once per world) and the terrain shader reads it bilinearly, lit at half or more, dropping the direct sun in shade. `drawnLit` is that read on the CPU: at 20,000 points over the area the drawing agrees with the simulation at 19,982 (99.91%), and at 6,000 points within 1.5 m of a shadow at 5,810 (96.8%), where only a texel's reach can differ.
- **Bodies are lit as the simulation finds them:** the snapshot carries the light beneath each guard and the player (computed where the world draws its shade), and each is drawn in sun or in shade.
- **Foliage is drawn from the same volumes by the same law:** each bush and canopy, by its back faces, solves its chord along each pixel's line of sight and draws opacity 1 − exp(−density × chord). Lying in a bush you see out through as much bush as a guard sees in through. A body standing inside foliage is drawn undimmed (the drawing doesn't know what is in front of the back face), the one place it understates.
- **Fog grows with distance from the eye**, in our shaders and in three.js's own chunk: a guard's contrast against the haze no longer changes as you turn.

**Why:** shade multiplies detection by 0.6 and nothing drew it (the plan's gotcha); a light gem would tell the player what the world should show. A GPU shadow map would agree only up to its bias and resolution; drawing the simulation's own answer agrees by construction, up to a texel.

**What moved:** nothing simulated. The snapshot gains three fields per guard (light, meter, awareness, the last two for A8) and the player's light. The lab's world gains its shade area, so its fingerprint moved (recordings of the lab from before refuse, by design).

### The awareness ladder and its minimal reactions (A7)

**Decision:**
- **Two kinds of evidence.** The sight meter, and the evidence other stimuli leave (a footstep raises a guard to between 0.3 and 0.62 by its clarity, a shot to 0.8), on one scale with the design doc's thresholds: curious 0.3, suspicious 0.55, searching 0.8; combat only from the meter at 1, a confirmed sighting.
- **Rises wait for the dwell** of the state they rise from (curious 0.6 s, suspicious 0.8 s, searching 0.6 s), one state at a time: something alarming reaches searching in 1.4 s, telegraphed by curiosity at once. A confirmed sighting leaves searching-level evidence for when he loses you.
- **Falls step down one state at a time** after the state's ramp-down (curious 6 s, suspicious 10 s, searching 20 s, combat 30 s), each varied ±25% from the guard's own stream. Evidence explains a rise but holds nothing up: only sight at the state's level, or a fresh stimulus of it, moves the fall back.
- **Grace periods** of 2.5 s ignore weaker stimuli unless one beats the last rise by 25%, or three arrive, which counts as a rise of 0.2: repeated footsteps escalate, single ones don't stack.
- **Sharper after a search:** a guard who searched settles at unaware with a floor of 0.15 under every stimulus and eyes 1.25× quicker.
- **Minimal reactions** (`brain/react.ts`), until lab E's brain: curious, stop and look (the head first, the body when it must); suspicious and searching, walk (1.5 m/s, 2.2 m/s) to where he believes it was and look around there; combat, face where he believes you are; unaware, back to the routine. A guard on a tower looks from it and never walks off.
- **Every change is an event:** 'alert', with its from, to, reason and the percept that caused it.

**Why:** Thief's filtered rises and capacitor-like falls and The Dark Mod's grace periods are the strongest open ladder; the design doc asks for a raised baseline and a 1.5 s reaction window. Stale evidence holding a state up kept guards searching forever: the tests caught it.

### Percepts and beliefs (A6)

**Decision:**
- **Percepts are records:** kind (sight, sound, shot, voice; body, impact, object, glint and door to come), place, radius of uncertainty, strength, the tick sensed, the tick it lapses, and its cause. A guard keeps at most eight live ones.
- **Beliefs:** the mind holds the last known position with its uncertainty: from sight (a fix within 0.5 m plus 1% of the distance), or from a heard guess, whichever is surer, its radius grown at 1.5 m/s as it ages. Seen at 100%, it is confirmed.
- **The mind** (`brain/mind.ts`) gains the head's turn, the percepts, the awareness (state, since, focus) and the belief. A guard without senses has the empty ones, so the valley's brains decide as before.
- **No-omniscience, for guards who perceive:** the valley with every guard's senses on, the player at two corners over 600 m from any guard (beyond a marksman's far zone against the sky) for the whole run: every guard has the same mind on every tick, and decides the same. A peeking brain is caught at its first decision; a run with the player near the camp shows minds that differ, which is perception doing its job.

**Why:** a percept never says who made a stimulus, and a belief comes only from percepts, so a guard can be wrong exactly where his senses were.

### Hearing: one law for the guards and the speakers (A5)

**Decision:**
- **Two routes, the louder wins.** Around: one bounded flood over the site grid per sound (W0.5's search, its radius as the cost limit, 120,000 expansions at most), read at every listener's cell. Through: the straight line, losing 12 dB for each full-height wall (counted against the colliders, by the grid's own rule, so a wall thinner than a cell counts and sound passes over a crate) and 15 dB where the ground is in the way.
- **Masking:** the steady sources (`generation/ambient.ts`), heard by the same law and summed as power, raise the threshold to 17 dB below them. Their floods are made once per world.
- **A guess, not a fix:** a sound around a corner seems to come from the last cell of its route the listener can see (the doorway); its place is blurred by 0.5 m, 8% of the distance and 60% of the detour, drawn from the guard's own stream. It arrives at the speed of sound along its route.
- **Sides:** a guard ignores his own side's footsteps, never a voice.
- **The speakers ask the same function** (`audio/hearing.ts`): level, the place it seems to come from, its delay along the route, muffled through walls; the steady sources too. The bench compares 200 random sounds and listeners: none differ by a bit.
- **The crack** (`perception/crack.ts`): from a bullet's flight, the point whose shock reaches a listener first, cos φ = c / v. On a path slowing from 790 m/s, listeners 5–15 m from it at 300 m hear it 55.4–57.2° off the shooter. It is wired in when lab B's shot sounds land (B8). The plan's recorded target said 5–20 m: at 20 m the shooter's own bearing sits 3.8° off the path, giving 54.6°, so the target now says 5–15 m.
- **Barks are delivered by their system:** a sound made after 'perception' (a bark in 'awareness') reaches listeners through `deliverSound`, since the tick's later events reach no reader.

**Why:** Mark of the Ninja fed one path to its AI and the player's audio; Thief's doorways and Siege's muffled second route keep hearing honest round buildings; Dungeon Crawl Stone Soup's integer flood is exact and cheap. The old speakers' straight-line muffle let you hear what a guard where you stood couldn't, and the reverse.

**What moved (A5–A7):** the perception lab's fingerprints (`0dfa42645814f21a`, `6625deddfd28368b`): guards now hear, react and fall back. Nothing in the valley.

### The scenario runner: scenes with parameters, and the factor-grid sweep (A3)

**Decision:**
- **Parameters join a scene's identity.** A scene can be made from parameters (`SCENES[name](params)`); a recording's header names them (`scene: { name, version, params }`, format 11), and re-simulating makes the scene again with them, refusing a scene made with others. `?scene=sight&params=...` plays one in the browser.
- **The sight scenario** (`game/scenes/sightScenario.ts`): one guard with a fixed gaze and the player in the lab, at a spot (open, shade, bush, wall, crest), a distance, an angle off the gaze, a stance and a movement, with the outcome it should have. The player circles the spot, so speed and distance hold. Its first table (`SIGHT_TABLE`) is the design doc's ranges and their neighbours either side of each edge: 14 rows, all as expected. `npm run scene` runs every table; `npm run scene -- sight --params ...` one row.
- **The factor-grid sweep** (`perception/sweep.ts`) runs the rate law, split from the geometry as `exposureRate`, over every combination of distance, angle, stance, movement, light, cover, sky, zones and sharpness: 2.7 million neighbouring pairs, none filling slower with more exposure. It reports the design's fixed points, the least time from cue to 100%, and the steepest edge per metre and per degree.
- **The seed is a rate law too** (`perception/seed.ts`): Blacklist's zones with hard ranges and the table as one product of rates. The bench sweeps it on the same grid.
- **Movement ramps with speed:** from still at rest to moving at 1 m/s, then from moving at the body's walk to sprinting at its sprint. It was a step at 0.2 m/s, a cliff the table runs found when a pacing player slowed to turn.

**The bench (perception lane), ours against the seed:** standing and walking, seen to 155.75 m (seed 150); still, prone, in cover, 46.75 m (seed 150); crouched and walking in shade at 30 m, 5.33 s (seed 8.89); a marksman's far zone, 405.75 m (seed 400); least time from the first cue to 100%, 1.5 s (seed 0.47); steepest edge 0.12 per metre and 0.11 per degree (seed 0.30 and 0.95, its cliffs measured at 1 m and 0.5° steps); monotonicity violations 0 of 2.7 million (seed 0).

**What moved:** `RECORDING_VERSION` 11, so the golden recording is rewritten. The perception lab's behaviour fingerprint (`ec5e3044c2701e84`), from the movement ramp; nothing in the valley.

### Sight: zones, caps and rates, with ramped edges (A2)

**Decision:**
- **How the table is read** (owner, Nov 7, made exact): each zone has a range for the reference body (standing, walking, lit, in the open): core ±30° to 150 m, peripheral ±60° to 25 m, and a marksman's far zone ±2.5° to 400 m. The most inclusive zone at the body's angle sets the rate. **Stance, light and the sky behind are range caps**; **movement and the share of the body in view are rate factors**. Inside a range the meter fills in 2 s at the eye growing linearly to 8 s at the edge.
- **Every edge ramps:** a cone's over 4°, a range's over 8% of it (2 to 12 m).
- **Telegraphed by construction:** outside a 2.5 m contact zone the rate is capped at 0.7 / 1.5 s, so the first cue (30%) always comes at least 1.5 s before 100%. Inside contact, a body is noticed in any direction, in 0.8 s.
- **Each part at its own range.** Rays go to head, chest and feet (weights 0.2, 0.5, 0.3), each through foliage; a part with open sky behind it is seen up to 1.5× farther. Summing parts, rather than scaling the range by the sky's share of what's visible, keeps the model monotone: more of you in view never fills more slowly.
- **Sky ramps too:** a line on past a body counts as sky as it rises through level (±0.5°), and ground behind it counts partly from 750 m and fully past 1,500 m.
- **One ray is enough** to start the meter, in every stance: the share in view already slows a sliver, and a minimum would be a cliff. The minimum stays a knob in tuning.
- **Light is the ground's** beneath the body (owner): the environment's light 5 cm above the feet, with foliage between it and the sun casting shade where it passes less than half.
- **A distant guard skips perception:** a body beyond every zone's farthest possible reach costs no rays.

**Why:** these read the design doc's four fixed points exactly. Standing and walking in the open: 150 m. Still and prone in cover: the prone cap is 45 m, so never beyond 50 m, and slowly within it. Crouched in shade at 30 m: a 54 m range, 5.3 s. A marksman: 400 m. Making movement a cap as well would put a still, crouched body in shade at 22 m, contradicting the third point.

**What moved:** nothing in the valley. The perception lab joins the pinned runs, in the perception lane's bench (`1a1c65ab2888e504`, `2d76d43f31015522`), which moves `BEHAVIOUR`; the tuning gains `perception`, so the golden recording is rewritten.

### Foliage dims sight the same both ways (A2, drawn in A4)

**Decision:** foliage is a set of volumes (cylinders for bushes, cones for canopies) that a line passes through with transmittance exp(−density × chord). `Foliage.transmittance` orders its two ends before computing, so it is symmetric to the bit; a test checks 4,000 pairs. Volumes are a world field the perception lane adds by augmentation (`world.foliage`). The valley's bushes are still opaque sight colliders and its canopies block nothing: they become volumes when perception joins the valley (A13), with generation.

**Why:** today a bush hides you without blocking your view out, and a canopy hides a guard from you but not you from him. One law in both directions removes both.

### Systems read the tick's events (A2)

**Decision:** `TickContext.events` is the events emitted so far in the tick. A system that reads them declares `events`, and the kernel refuses one in the same phase as a system that emits unless they're ordered. Perception takes stimuli from it (footsteps, shots, barks). Events emitted in a later phase reach no reader: what must outlast a tick goes into the state.

**Why:** events are the labs' contract, and perception is their first consumer inside the simulation.

### The perception lab (A1)

**Decision:** a camp at the west end of a 520 m field (`game/scenes/perceptionLab.ts`): a sentry sweeping the field, a patrol on the perimeter, a marksman on a 6 m tower sweeping his far zone across it; low walls at 30 m and a chest-high wall at 60 m; crates; a shelter, a tall wall and a conifer for shade; bushes and the conifer's canopy as foliage; a ridge 70 m north whose crest the camp sees against the sky; gravel round the camp and along the track; a generator. Low hills close the lab's edges, so no line ends in false sky at the world's edge.

**Why:** every factor of the sight table and of hearing has a place to be tried, and the scenario runner (A3) measures in its open field.

## 2026-11-08 · Lab D

Phase 1's camp generator (`docs/phase-1-plan.md`, section D), built in the generation lane.

### The exit test so far: what the reviewers' plans showed

**Reviewers.** Three fresh agents that never saw the generator planned ten held-out camps (series `lab-d-review`, as built before the fixes below) from what recon would show: the layout, the ridges, the guards and their timing, each in its own order and under its own letters (`npm run plans -- --briefs`). Each wrote each camp's best plan as a signature. `--evaluate` then took every plan at its word: `writtenShots` checks that the guard it names can be shot as it says from a perch in its sector and band, and lab B's scripted marksman fires it in the simulation.

- **The plans work.** 29 of 30 on D's model. Of the 28 rifle plans that fired, 24 dropped their guards; 3 of the 4 misses were one perch a body slides off (below), and one shot grazed a wall the model's 1 m cells call clear. The one way in a reviewer chose was checked on D's model only. Guards don't answer a shot until lab E, so "nobody saw him fall" is still D's model.
- **The reviewers agree.** Pairs of reviewers matched on three of four fields on one camp 19 times of 30.
- **The plans are not "clearly different" by the plan's own test.** 29 of the 30 plans are the same kind: shoot the target from a ridge while he's out on his walk, when nobody is watching him. `split` is "window" in 23 of them and `tool` is "rifle window" in 22, so two camps match on three of four fields as soon as they share a ridge side or the target's side. Within one reviewer's ten plans, 7 to 12 of the 45 pairs of camps share a signature (the bots' best plans, which take a camp apart, stay 9 of 10 distinct). Run on another camp, a reviewer's plan is clearly worse (0.1 riskier, or impossible) in 64 to 71 of 90 cases, so the plans do depend on their camps; they are the same *kind* of plan.
- **Why:** the design doc requires every camp to offer each approach, so the generator guarantees two perches that hold the target in view 10 s a cycle, and the brief asked how to eliminate him and get away. With no answer to a shot yet, that shot is the best plan almost everywhere. Whether a camp should steer players away from it is the owner's call; the review is left as it is rather than re-tuned against.

**What firing them corrected:**
- **A perch is ground a body can lie on,** at most 40° (`gen.analysis.perchSlopeDeg`; the motor's limit is 42°). Perches came from the terrain's skyline alone: on the review set 58 of 320 (18%) stood on ground too steep to lie on, and a shooter placed there slides off. Rules were being satisfied by places no one can be.
- **A perch's eye is the body's prone eye** (`gen.sight.proneEye`, 0.32 m; it was 0.5 m).
- **The reviewers' briefs gave facings as world bearings** beside positions in the camp's frame; one reviewer worked it out from the sweeps. Now in the camp's frame, for later runs.

**Lab C:** a climber at the top of a tower's ladder can never step onto the deck: the rail is too tall to mantle from there. The rail on the ladder's side now has a gap at the ladder's head (`gen.compound.ladderGap`, 0.8 m, as lab C's checks ask). Whichever of #6 and lab C's ladder lands second confirms a climb ends on the deck.

**Measured after those fixes, on a fresh series** (`lab-d-exit-3`): 97 of 100 at the first camp attempt, 3 repaired or rebuilt, none invalid, in 2.2 s a camp (p95 3.5 s, the slowest 13 s); first-attempt failures: perch coverage 2, perch witnessed 1. Over those 100:
- the bots' best plans fall into 36 distinct signatures (long range 40, infiltration 13, systems 1);
- the sightline graph ranges from no clusters to 3, with hard cores from 2 to 7 (22 above the intended 4);
- 88 certified ways in held when walked through the simulation (94 on the series before). The margin decides it: of the 42 ways that peak under 75% on D's model, 41 held; of the 58 close calls, 47.

The review set rebuilt on the fixed generator: the bots' best plans 8 of 10 distinct, 77 of 90 clearly worse elsewhere, 10 of 10 ways in held. The reviewers weren't asked again: their finding is about kinds of plan, which these fixes don't touch, and it waits on the owner.

**What moved:** nothing in Phase 0's valley, and no version: no recording on `main` has a lab D camp yet. The `camp-systems` run moved with the camps (`e5c646c959574b12`, state `d922e4245070fa08`), the tuning gained two values, so the golden recording is rewritten, and the generation bench's busiest search is 75,249 of 400,000.

### Validation and repair: the rules, built in first (D8)

**Decision:**
- **Validation** (`generation/validate.ts`) reads the analysis and says how far each rule is from passing. Every perch rule is checked over the whole list of perches. Coverage counts the plan's way (a guard's time in view over the cycle), or a minimum time in view (15 s a cycle), never "ever in view".
  - **Three approaches.** Long range: two perches that each see half the guards and the target for 10 s a cycle. Infiltration: a certified way to a close shot. Systems: an unseen way to the generator, which powers an alarm or the radio.
  - **No unsolved cluster.**
  - **No single perch.** At most 60% of guard time and 25% of the target's. And a shot from a perch that sees two guards or more must be witnessed by someone it can't see, unless it's timed. That one is resolved over time: at a moment the perch sees the guard, another guard would see him drop, and the perch can't see that other guard then, for at least 3% of the cycle. (Counted per guard over the whole cycle, as first written, a patrol who passes behind a building never counted as out of view, and 17 of 40 camps failed.)
  - **Companions.** Every perch is overlooked by a marksman post, or a counter-perch, or by ground the camp can walk to with a clear line within 450 m (the research's reading: "a ground position a counter-sniper team can reach"). No alarm box or antenna in the fire of a perch that sees 40% of guard time. And the escape: **the best overview** is the perch that sees the most of the camp's ground, and it mustn't have the target in view for 1.5 s on his run from his door to his vehicle; another perch must, or his vehicle can be reached unseen and sabotaged (the design doc's "crosses a perch's sightline or passes a sabotage point").
    - The run is what matters because the research's reason for the rule is Hitman's evacuation exploit: a camper triggers the escape and shoots the target on the run; the vehicle is "fast or armoured". Measuring the whole route had the best overview seeing 54–93% of it, in every camp.
  - **Two ways out,** leaving the raster at least 40 m apart, from the shot with the intruder's meter at rest.
  - **At most 16 guards,** by count.
- **Solution first, again.** Perches come from the terrain alone, and viewsheds from the first raster, so the generator builds to the rules rather than repairing into them:
  - **Fixtures** (`placeFixtures`, after a first raster and viewsheds): the antenna is a 2 m whip on the most hidden wall (of the radio room, else the nearest building, else indoors beside the set); alarm boxes go on hidden walls or, if none, just inside a door. "Hidden" is judged against the overviews first: perches that see at least 30% of the camp's ground.
  - **The escape vehicle** is parked 6–22 m from a door of the target's building, on the spot that best hides his run from the best overview and shows it to another perch.
  - **The target's walk** (`staffing.ts`) is chosen against the perches: the spot indoors the fewest perches see; his errand the first that keeps every perch within the limit and lets two overviews have him 10 s; re-chosen once every guard is placed if the perches seeing half the camp don't have him.
  - **Workers and the officer** wait a pace inside their doors, watching out through them (the officer's two stops are the target's door and the barracks door), and while a perch comes within 2 points of the coverage limit, the post it sees most moves to the nearest ground none of the perches over the limit can see.
- **Repair** (`repair.ts`) is the bounded greedy search the plan names: a fixed list of local operators (shift a patrol's phase, turn a post, move a post along its arc, move a post out of an offending perch's sight), each attempt on its own labelled fork, kept only if the camp comes closer to valid (fewer rules broken, then by how much), stopping after 12 re-analyses. Swapping a module and adding cover are left for when these prove too weak (they weren't needed); re-timing a light circuit changes nothing under D's daylight sight law.
- **A camp repair can't save is rejected** and built again from fresh forks, up to 3 times (the design doc: "repaired or rejected"). `seeds --camps` reports first attempts, repairs, rebuilds and each seed's margin.
- **Difficulty comes from clusters, too:** the largest sightline cluster runs from 2 to 3 and the hard core from 3 to 5 across the difficulty range (they were fixed at 3 and 4; the default, 0.5, is unchanged).
- **Four corrections to D7's model, found by running ways in through the simulation** with lab A's real perception (`npm run plans -- --simulate`):
  - A step of a cell now takes 5/9 s, a crouched pace of 1.8 m/s (it was 0.5 s, faster than a body can follow).
  - A tower is open under its roof: its deck and parapet count as solid, only its roof as the overhead slab, and perches see a guard on a deck by the direct line. Before, a marksman's own tower blocked his sight and hid him from every perch.
  - A thing in the raster fills the cells whose centres it covers, or, if thinner than a cell, the row its centre line runs through. Stamping every cell it touched hid the intruder behind things that only clipped a cell, which is the wrong way for a certificate of stealth to err.
  - A certified way in may fill the meter only to 85%: the two models differ a little (a patrol's gaze as he walks, how fast a meter falls), and paths that peaked at 90–95% in D's model were sometimes completed in A's.
  - With these, every way in of 20 camps run through the simulation held (no guard reached 100% before arrival), against 3 of 6 before them.
- **A greedy search first.** Validation only needs to know a way exists, so the analysis runs the search with its distance estimate weighted 40 times, and falls back to exact A* only if that runs out of budget. (The exact search stays the tested one: on 400 small camps it agrees with brute force.) Exact searches ran out of their 400k expansions on camps where a way exists; the greedy ones find it in 10–100k. A camp's generation dropped from 4–30 s to about 2 s.

**Measured, on series nothing was tuned against** (`npm run seeds -- --count 100 --from <series> --camps`): the first held-out series, `lab-d-exit`, gave 86 of 100 at the first camp attempt, the rest repaired or rebuilt, none invalid; 12 of the failures were perch coverage at 61–65%. The officer's stops moved indoors as a result, and a fresh series, `lab-d-exit-2`, gave 97 of 100, 3 repaired or rebuilt, none invalid, in 2.1 s a camp (p95 2.6 s, the slowest 21 s). Over those 100:
- 94 certified ways in held when walked through the simulation with lab A's real perception (nobody reached 100% before arrival);
- the bots' best plans fall into 32 distinct signatures (long range is the best plan in 63 camps, infiltration in 37);
- the sightline graph ranges from no clusters to 3, with hard cores from 2 to 9 (the 28 above 4 are more than staffing's limit intends: a tower's marksman, now seeing properly, joins groups that staffing's placement estimate allowed);
- on D's model alone a single perch can take 6 to 10 guards, one by one, given time. That model has no reaction to shots: the camp's answer is lab E's half of "one overlook mustn't clear a camp" (its exit test, a perfect shooter on the best perch failing).

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its staffing (`f1c3cabd3c2f6ab7`, state `234887d847d060db`), the tuning gained `gen.validation`, so the golden recording is rewritten, and the generation bench gained D8's numbers: all 6 of its camps pass at the first attempt, and on its hardest way in safe intervals expand 11,532 states to the plain search's 100,478.

**Why:** the plan's D8. Rules a camp must pass, built in first so most camps pass as built, with a bounded, labelled repair for the rest and a rebuild for what repair can't save.

### The camp's analysis: who sees whom, what each perch sees, and the ways in (D7)

**Decision:**
- **One raster, aligned with the camp** (`generation/raster.ts`): 1 m cells in the camp's frame, over the fence and 30 m round it, each with its ground, its tallest top, an overhead slab (roofs, lintels), whether it's walkable and its moves. Sight colliders and vehicles are stamped by their extents in the camp's frame, and doorways carved under their lintels. Its lines of sight agree with exact raycasts on more than 85% of random pairs and err toward blocking (a test).
- **One cycle, sampled every half second** (`field.ts`). Every routine divides the camp's cycle, so one cycle of every guard's eye and gaze is exact for the whole mission. The exposure field says, for each cell and sample, how many levels of the intruder's meter it adds, summed over guards: one meter for every guard fills at least as fast as any one guard's. It is stored cell by cell, so a search reads a cell's cycle in one run.
- **D's sight law is A's, copied** (`sight.ts`, `tuning.gen.sight`). Generation reads only `tuning.gen`, so the law is D's own: lab A's for one body, a crouched intruder on the move, lit, in the open.
  - A's zones, with ranges A's × 0.6 for the stance: the core ±30° to 90 m, the periphery ±60° to 15 m, a marksman's binoculars ±2.5° to 240 m. Then A's edge ramps, the fill linear in distance from 2 s to 8 s, the telegraph's cap (0.47 of the meter a second), contact (2.5 m in any direction, 0.8 s) and the still factor (0.4).
  - What it leaves out only makes it quicker than A: light, foliage, the share of the body A's three rays see, and per-guard meters. The one exception is the sky behind a body; on the camp's pad, guards see an intruder against the ground.
  - `tests/campSight.test.ts` runs A's sight scenario at 112 points across the zones and their edges. D is never later than A by more than a sample, and never more than twice as quick wherever the scenario's circle lies wholly inside one zone.
  - The meter has 128 levels and falls at 0.0625 of full a second: half A's rate, with no hold, which covers A's 1.5 s hold for any pause of 3 s or more.
  - The first calibration came from the design doc before A landed: 27 m of periphery, a 0.4 s fill up close, and no contact zone. A's numbers replaced it.
- **Infiltration by safe intervals, exactly** (`infiltrate.ts`).
  - SIPP over (cell, interval), with the meter. An interval is a safe run, where waiting lowers the meter, or one watched sample, whose rate the meter takes on arrival. It is a wall where even a still intruder couldn't take it.
  - Each interval keeps the Pareto front of its labels (arrival, meter), counting the meter's fall while a label waits in a safe run. The labels live in a pool, so a 128-level meter costs no memory. A* orders them by arrival plus the walking distance.
  - On 400 random small camps, it, the plain space-time search and brute force agree on whether a way exists and how soon, and every path replays. The generation bench pins it against the plain search on the hardest of its camps' ways in.
  - The budget is 400k expansions (rule 18).
  - **The three ways.**
    - In: from anywhere on the rim to a close shot at the target, within 12 m with a clear line to his chest and outside his contact zone. Reaching him within 1.5 m means entering that zone, which A's law makes all but impossible.
    - To the generator: within 2.2 m.
    - Out: from the shot to the rim, with the target's own view gone.
- **The sightline graph** (`clusters.ts`).
  - Witness edges: a sees b drop when b stands in a's cone within D's witness ranges (80 m in the core, 30 m in the periphery: lab D's own until lab E's brain says how guards take it) with a clear line. Each carries its duty over the cycle.
  - Edges holding for at least a tenth of the cycle join guards, and clusters are the strongly connected components (Tarjan, iterative, in guard order). No published method clusters guards by mutual visibility over time (`docs/research/labs.md`), so this is lab D's own.
  - **Certified, watchers first.** A bounded search (20k expansions a cluster) looks for a kill order from the perches:
    - shots 0.75 s apart from one perch while anyone is pending, and every witness dropped within the 1.5 s reaction;
    - or waiting for a moment nobody alive is watching;
    - relocating between perches at 2 m/s;
    - one distraction: a witness looks away for 6 s, from one of 12 moments.

    Clusters are taken apart in a topological order (a watcher's cluster before those he watches), each with the guards shot before it dead. Each is labelled isolated, window, chain, distraction, out of sight (no perch sees a member), or unsolved. The first version tried only each guard's next sighting, so it missed windows and left lone guards unsolved. With waiting and the kill order, none of 16 camps has an unsolved cluster.
- **Perches** (`perches.ts`). A 720-ray sweep of the valley finds spots that overlook the camp, thinned to 32 at least 25 m apart, steepest first. Each gets a viewshed over the raster (the lowest height visible in each cell), held to exact raycasts. Each perch reports:
  - each guard's share of the cycle in view, counted as the plan pinned before D8;
  - the target's share;
  - the alarm boxes and the antenna in view;
  - the share of the escape route it sees.
- **Heatmaps:** coverage (the share of the cycle some guard watches a cell) and idleness (its longest quiet stretch, wrapping round the cycle).
- **Staffing sees through the analysis** (`staffing.ts`). Each guard is placed only where the sightline graph stays within limits: no component over 4, at most one over 3, and no guard watching the skeleton's corridor for more than a fifth of the cycle. Posts try four facings, walkers 12 start times, and the roles that must stay take their best fallback. The target walks once a cycle, mostly inside, and guards indoors face away from doors.
- **Drawn.** The explorer's camp view draws the coverage heatmap, the sightline edges coloured by cluster (unsolved in red), the three ways (in green, to the generator orange, out blue) and the perches shaded by coverage, ringed where they see the target.
- **Its cost.** A camp now generates in about 2.3 s in Node (mean of 16): terrain 0.35 s, the grid 0.2 s, staffing 0.6 s, the fields 0.35 s, and the searches 0.2–1.5 s. A search that runs out of budget costs about 0.75 s. Laying the field out cell by cell, folding the target's view in densely, and the label pool brought it down from about 4 s.

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its staffing (`f38577ac4a34e3b6`, state `40446ee293103458`). The tuning gained `gen.sight` and `gen.analysis`, so the golden recording is rewritten. The generation bench gained D7's numbers: camps with a way in and out, unsolved clusters, the busiest search, and the expansions of both searches.

**Why:** the plan's D7. Validation (D8) needs to know who sees whom, what each perch sees, and whether a way in exists, exactly and within budgets. And D's model must be its own, yet held to A's.

### Staffing: points, chokepoints, a grammar, one cycle (D6)

**Decision:**
- **Points buy guards** (`generation/staffing.ts`).
  - Difficulty sets the budget: 16 to 40 points.
  - Each of the seven roles is bought once first. The roles cost: target 0, worker 1, sentry 2, radio operator 2, patrol 3, officer 3, marksman 4.
  - Then extras come from a priority list, at most one officer and radio operator, a marksman per tower, three workers, never past 16 guards (counted).
- **Sentries at the real chokepoints.** Brogue blocks each one-cell corridor and counts what it cuts off. A camp's passages are metres wide, so `minimumCut` (`chokepoints.ts`) finds the minimum vertex cut between two zones by max flow (Edmonds–Karp, breadth first in a fixed order).
  - It runs on the site layer contracted to 1 m cells, connected wherever the fine walk edges connect, so it agrees with the fine grid on what connects.
  - A cut wider than 10 m is no chokepoint. A test holds it to a hand-built wall with a 4 m gap.
  - Sentries stand inside the gate, at the cuts between the camp's zones, then at doors, and never within 8 m of the skeleton's corridor.
- **Patrols on lanes, with a grammar** (`patrols.ts`, after Xu, Tremblay and Verbrugge).
  - Loops: the perimeter lane, the yard, and the alleys round each side.
  - They walk grid paths pulled taut, and stops are snapped to walkable cells.
  - At each stop, a word of the grammar: a glance, a quarter turn, a half turn, a sweep back and forth, a full turn. Two patrols on one loop walk it half a period apart, and loops that share a lane run it the same way round.
- **One cycle for the camp.** Every routine divides it: a patrol's period is the cycle over a whole number, its stops' dwell stretched to fit, and a post holds the whole cycle. Each head sweep fits it a whole number of times. Routines gained an optional `offset` (absent for Phase 0's guards, whose bits are unchanged).
  - The camp repeats exactly every cycle (160–300 s), so its windows can be learned, and analysis (D7) can certify them over one cycle.
  - A route too long for 300 s drops its dwells, then the cycle grows. A clamped cycle had cut routines short, making them jump metres at the wrap.
- **No two guards meet on routine.** Before the check existed, guards on different loops reached a lane corner together, shoved each other, and in the worst cases locked for most of a minute.
  - Each walking guard tries up to 12 start times until he passes everyone at least 1 m clear, all cycle, sampled every quarter second.
  - The last of a role who can't walk clear holds one of his stops instead, so all seven roles always stay.
  - Guards now keep to their routines through the motor within 25 cm (tested for two minutes; measured within 11 cm over five, in four camps).
- **Open doors lie flat** against the inside wall beside their doorway. The grid doesn't know entity solids, so a leaf standing in the room was in routes' way.

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its camp's guards (`e430ba9fbbf75bd5`, state `02a8b5ec0ec11fbc`). The tuning gained `gen.staffing`, so the golden recording is rewritten.

**Why:** the plan's D6. Fitting routines to one cycle makes timing windows exact, and a clear routine is one the analysis can trust.

### The camp's systems and the objective (D5)

**Decision:**
- **Systems are data, and entities where they have state.** Generation records the devices (`camp.devices`: the generator, each light, alarm box and the radio set, each with its structure and its feed, the generator it draws from) and the objective (`camp.objective`: eliminate the target, with his building and his escape vehicle). In a run, each is an entity of its own kind (`game/camp.ts`):
  - a `generator` that runs;
  - a `light` that is on;
  - an `alarm` box that is powered and can be raised;
  - a `radio` that is powered and working;
  - an `objective` that is open, done or escaped.

  They spawn after the doors and vehicles, so no earlier id moves.
- **One system powers the circuit.** `camp-power`, in the 'world' phase, sets every light, alarm box and radio from its generator's state each tick, so a cut is seen in the tick it happens: before perception, and before lab E's camp acts. `objective`, in the 'mission' phase, marks the objective done when its target is gone.
  - Lab E raises alarms and drives the escape; lab C's use action and lab E's sabotage stop the generator or break the radio. Each writes the state that is already here.
- **Explained.** The snapshot carries each device's state, and the debug view draws the wiring from the generator to each device, live or dead. The `camp-systems` scene cuts the generator at tick 60, restores it at 180 and takes the target at 120, with expectations on each. It is pinned as the generation lane's run (`64d0c1711e6ab4c0`, state `af5ba8029683ec86`).

**What moved:** no existing golden. The new pinned run changes the build's behaviour digest, so the golden recording is rewritten. `camp-power` shares the 'world' phase with systems that spawn, so they name it in `after` (the spawn-tick scene, a test); their order is unchanged.

**Why:** the plan's who-defines-what gives lab D camp systems as data, plus entity kinds for those with state, so labs C and E build on one answer to "is that alarm box live?".

### The compound: plots, parcels and modules, skeleton first (D4)

**Decision:**
- **Solution first.** `buildCompound` (`generation/compound.ts`) lays down the approaches before any fill, as the research proposed from Spelunky:
  - the breach goes in the fence side that faces a ridge most squarely, so its gully is the way down toward it;
  - a corridor runs from 30 m outside the breach to the target's back door, with low cover along it;
  - the generator's shed stands beside that corridor;
  - the breach and the gate are the two ways out;
  - the escape route runs from the target's building to the escape vehicle, the gate and the road.

  The layout records these as its `skeleton`, so validation (D8) asks whether the fill broke them.
- **Plots and parcels**, as XCOM 2 builds them.
  - The plot is the fence (its gate toward the road, the breach), two to four corner towers (corners away from the breach first), a 7 m lane inside the fence for patrols, and the road to an open yard.
  - Seven parcels around the yard take modules: the target's building, barracks, mess, storage (60% of camps), the radio room with its mast, the generator's shed, and the motor pool. Each is placed in its slot by its own labelled fork.
  - The modules' sizes are data in `tuning.gen.compound`, so recordings embed them (rule 16).
- **Hollow buildings.** Walls with doorways, lintels and a roof, so the target can be reached inside, and the grid knows the inside is roofed. Doorways are 1.5 m wide: at 1.2 m, a camp turned to the grid at about 40° left no lattice step through some doorways for a 0.3 m body, while the motor would have passed. At 1.5 m, 306 of 306 doors over 40 camps pass.
- **Doors and vehicles are entities** (`game/camp.ts`). The `door` and `vehicle` kinds carry their camp index and state (open, escape), with a solid shape the motor and every query see. They spawn after the guards, so ids stay the player's, then the guards'. Doors start open, swung into the room: guards' routines walk through them, and labs E and C shut them.
- **Ladders are data** (`camp.ladders`: foot, top and the side a climber stands on), for lab C's ladder mode and lab E's navigation links. Each is drawn as a structure that blocks nothing.

**What moved:** nothing in Phase 0's valley. The tuning gained `gen.compound`, so the golden recording is rewritten. Guards are a fixed placeholder until D6.

**Why:** the plan's D4. Solution first keeps the first-try rate high, because the approaches validation checks for exist by construction. Doors and vehicles are lab D's to define and labs C and E's to use, so they exist as kinds now.

### Terrain with teeth, and how a mission asks for a camp (D3)

**Decision:**
- **A mission asks for a generated camp with a camp spec** (`generation/campSpec.ts`): `{ archetype: 'compound', difficulty }`, carried in the mission spec by module augmentation. The recording header accepts it as a small object of plain values, which the generator checks; the kernel doesn't read it. Until D9, a mission with no camp spec builds Phase 0's valley and test camp, so no golden moved. The game and the explorer take `?camp` (`&difficulty=`).
- **The valley is placed feature-first** (`generation/landform.ts`).
  - An open side of 130–170° is chosen first, and two or three ridge spines stand around the rest, 240–420 m out, each spanning 50–80° of the horizon.
  - Each camp face is a profile with a cliff band, too steep to climb, broken by one or two gullies whose run keeps their slope under about 37°.
  - The creek enters across the open side, passes the camp at 130–170 m and leaves through the widest gap between spines. Its bed sits 4–8 m below the floor, with banks that rise 2.2 m per metre except within 16 m of a ford, and where the road crosses.
  - Relief goes on after the features, with the crags kept out of the gullies.
- **D3's checks** (`generation/overwatch.ts`):
  - A radial sweep from the camp's eye finds perches: prone shooters' eyes 150–560 m out that clear the horizon and look down at least 2.5°.
  - Every placed ridge must hold one, perches may cover at most half the horizon (counted in degrees, not in 22.5° sectors, which overstate a long spine), and the widest open side must be at least 120°.
  - On the spatial grid's map layer (no colliders yet), the camp must be reachable from at least 3 of 8 directions, and a second way out must stay 20 m from the first beyond 90 m of the camp.
  - A valley that fails is re-rolled from its own stream (`valley#k`), up to `landform.attempts` times.
- The props, the camp and its routines draw from their own root streams, so a re-rolled valley leaves their draws as they were.

**What moved:** nothing. The tuning gained `gen.landform` and `gen.overwatch`, so the golden recording is rewritten for the new shape. The generation bench adds lab D's valleys: 6 of 6 held-out ones valid at their first attempt, a margin of 7 of 8, overlooked over at most 157°, with an open side of at least 164°.

**Why:** the owner found that one overlook could take a compound apart (phase-1-plan.md, D3). In Phase 0's valley, every valley was overlooked from all 8 of 8 directions, and reachable from all 16 of 16, so no approach differed from another. Counting overwatch in degrees keeps the rule exact for long spines. The creek had to be deep to be a barrier at all: 2.5 m terrain cells smear a shallow bank into a walkable slope.

### The seed explorer (D2)

**Decision:** `?explore` opens the seed explorer instead of the game (`app/explore.ts`): a grid of camps from a named series, the same seeds `npm run seeds -- --from <name>` reports on, each card drawing the valley and the camp from above with its validation results, and linking to the seed. Workers generate the camps (`app/exploreWorker.ts`), a few at a time, with the tuning the page was given, so the page never imports tuning of its own and hot reload keeps working. What a card draws is the world's survey (`generation/survey.ts`): plain data a worker can post, which each later milestone extends with its layer.

**Why:** the plan's three Phase 1 tools give lab D the seed explorer (D2), and the generator's range is easier to judge from fifty camps side by side than from any number in a report.

### The one deliberate `GEN_VERSION` bump (D1)

**Decision:**
- **Scatter by cell.** Trees, rocks and bushes are scattered on jittered grids as before, but each cell now draws from its own stream: the feature's labelled fork mixed with the cell's coordinates by integer hashing (`generation/scatter.ts`). A prop depends only on the seed, its kind and its cell, and carries that cell as its id (`Tree.cell` and the others). Before, every cell drew from one stream in visiting order, so a cell that kept its prop shifted every later cell's numbers. Now a repair that clears or adds cells (D8) changes only those cells, and generated objects keep their ids, as the survival horizon asks.
- **The fingerprint covers the world by construction.** `worldFingerprint` hashes every field of the world except what it was built from (`spec`, `seed`) and how long it took (`genMs`): the terrain by its heights and surfaces, the colliders by their list, and everything else (features, backdrop, props, camp and routines, the spatial grid, the report, the spawn) generically, keys sorted, typed arrays by their bytes. A field any lane adds to `World` is covered the day it is added, and a class instance there is refused by name. Before, it listed what it covered by hand, and missed the backdrop, the grid, the report and most of each prop.
- **`dsin` and `dcos` reduce exactly from 10⁶ up** (`kernel/core/detmath.ts`): Payne–Hanek in 24-bit limbs, with the 66 limbs of 2/π that a double can need, each product exact in a double. Below 10⁶ the plain reduction is kept bit for bit. `tests/detmath.test.ts` recomputes 2/π from Machin's formula in integer arithmetic, holds the new path to the engine's own `sin` and `cos` within the kernels' own error (1.5e-15) from 2²⁰ to 2¹⁰²², including the double nearest a multiple of π/2, and wraps the trigonometry while generating both valleys and every pinned run: the largest argument the simulation reaches is far below 10⁶. The one input that grows with time, a guard's head sweep, needs almost thirteen days of mission to get there.

**What moved:** `GEN_VERSION` 4. TAL-4471's fingerprint is `f555512c33daea22` (`GOLDEN.world`, `GOLDEN_TAL_4471`). Two plays moved because their bots met different trees and rocks: MUD-9031 wander (`67964675cb39477e`, state `4002c5b682b8bcc8`) and TAL-4471 chaos (`fe623d33389a2f21`, state `e8037411190fc911`). TAL-4471 wander, the scenes and the math golden held. The golden recording is rewritten. The body bench's worst rise in a tick is now 0.29 m (a rock, under the 0.45 m step), and its worst overlap 2e-14 m.

**Why:** the foundation pass left both changes for one deliberate bump (`docs/foundation-plan.md`, Deliberately later), so seeds change once, not twice. Lab D's repairs need scatter that stays put around them, and the camp generator adds a great deal to the world that a hand-kept list would have missed.

### The bullet, its strike and the body left behind (B2–B4)

**Decision:**
- **Content in `tuning.ballistics` and `tuning.vitals`:** the rifle (15 rounds, a 1.2 s bolt, a zero dial from 100 to 600 m in 100 m steps), two loads (the published .308 168 gr match at 823 m/s and k = 0.000756; an illustrative subsonic at 320 m/s), the report, crack, bolt and impact radii, the hit rules, the optics, the throwable and the sway's starting values. Drag constants are given at sea-level air and scaled by the mission's density.
- **The shot event is the bullet's path:** launch point and time, the bore's line, muzzle speed, drag and wind (`RECORDING_VERSION` 11). Labs A and E follow a bullet's path, its crack's included, from the event alone; its strike is an `impact` it caused.
- **New events (codes 30–35):** `report`, `impact` and `cry` (sounds), `death` (who fired, who fell, the body left), `ranged`, and `bolt` (a sound). **New commands (30–34):** `range`, `throw`, `zeroUp`, `zeroDown`, `suppressor`.
- **What a strike does:** a headshot kills silently; a torso shot kills, with a cry first as often as the guard's own stream says (35%); a leg shot kills, always with a cry. The guard's entity goes, and a `remains` entity takes his place in the same tick, collapsing over 0.7 s as a pure function of time; queries see it, the motor doesn't collide with it (lab C decides, with carrying).
- **Systems:** `rifle` in 'commands' after `player-commands`, `bullets` then `aim` in 'projectiles'. The spawn-timing scene's commands system now names `rifle` in its `after`.

**What moved:** `RECORDING_VERSION` 11, so the golden recording is rewritten; the tuning gained sections, so it would have been anyway. The shooting range joins the pinned runs (`411196f29915b2ee` / `5b191832e76a9bc8`, lane `ballistics`), which moves the behaviour digest. No valley or scene value moved: the bots never fire, and without a rifle a click is the bare shot it was. `SIM_VERSION` stays: nothing an earlier build could record behaves differently here, and such a recording is refused by its format anyway.

**Why:** a lab is an isolated scene until Phase 2 joins them; keeping the valley's goldens still lets labs A and D land beside this one without rebasing onto moved values.

### Sway, vitals and the instruments (B6, B7)

**Decision:**
- **Sway samples with history.** The aim system samples the sway at every tick's end (`rifle.sway`, two ticks kept). The renderer draws the camera along `viewLine` (the line of sight moved by the sway, as far as the scope is up), interpolating the samples as it does the body; the rifle fires along the same interpolation at the click's lag. With the scope down, the barrel points only roughly where you look: 25 mil of pointing error, drawn from the player's own stream.
- **The ladder, measured, not asserted:** standing 1.64 mil, crouched 0.99, prone 0.69, prone on a rest 0.255, with the breath held 0.046 (95th-percentile radius over 20 s). A rest is found by geometry, never declared: the ground under a bipod prone, a sandbag or a wall top under the fore-end upright.
- **Vitals live in the body lane** (`body/vitals.ts`), a component the run's setup gives with the rifle; lab C extends them. A held breath stills the chest over half a second and lasts 4 s calm, 1.5 s at the top of the heart rate; a long one ends in a gasp. `startle()` is the close call lab E calls when guards shoot back.
- **The reticle is drawn in mils as tangent offsets** in the camera's projection, the same offsets the hold solver works in, so a hold names the mark the target sits on exactly. The scope's field is 3.6° across its glass; the binoculars' 6.5°.
- **Assists are a setting, not tuning:** sim (the reticle and the range), lite (a dope card too: the hold at each 100 m for the dialled zero, and the wind's hold per m/s), arcade (the binoculars read the hold and the wind out, and the scope marks where a shot lands at the ranged distance). The default is lite. None touches the simulation.
- **Glint** is a pure function of the aim, the sun and the observer (the mirror's half-way condition), for lab A to ask per guard; the scope's glass flares when it faces the sun, so the player can tell.
- **The flags' and the grass's motion** is presentation only: it changes nothing that can be seen or hit.

**What moved:** the shooting range's fingerprints (tuning its own sway), and the tuning's shape, so the golden recording is rewritten. No valley value.

**Why:** the plan's B6 and B7. The research found no game that publishes sway numbers, so the bench pins Sightline's, and the sweep pins the claim that a reticle and its bullet can't disagree.

### The shot's sound, the throwable, and a query that reached too far (B8, B9)

**Decision:**
- **The crack is a function of the path,** not an event per listener (`ballistics/crack.ts`): the first arrival is where t + |L − P(t)|/c is least, found by a fixed golden-section search over the flight, which lands on the Mach cone's point. The speakers use it for the camera; lab A's hearing uses it per guard, scheduling the percept at the arrival.
- **The shot's own sounds are events:** `report` (the suppressor's and the load's radius), `impact` by what was struck, `cry`, `bolt`, and the throwable's `clatter`. Voices are procedural (`audio/shotVoices.ts`); the shooter hears his report at his ears and no crack of his own.
- **Sandbox shots** are a command (`shotDrop`, J in the debug view): a match round solved to land where you look, from the eye, rifle or not, so a recording replays it. Lab A's sandbox (A10) can call it from its own UI.
- **The throwable** is an entity on an exact arc (no drag), its chord swept per tick against the world and bodies, bouncing until it settles. Its landing is loud enough to reach the guard it lands by (31–40 m at a full throw); drawing exactly one guard is perception's and the brain's call, since guards in the test camp stand in pairs.
- **The miss breakdown** (`game/telemetry.ts`) solves what each shot needed with the instruments' own function (drop, lead, wind) from where its target's head was at the shot's instant, compares what was held and what the sway added, and names which sideways decision was most nearly left out. The playtest summary prints it per shot; the range's expectations check it reads the marksman's deliberate miss as "lead left out".
- **A kernel fix:** `raycast` (`kernel/world/query.ts`) accepted a body beyond `maxDist` when nothing else was within reach, so a short ray could return a guard 60 m away (a thrown stone found one). Bodies now count only within reach, like the terrain and colliders. No golden moved: nothing relied on it, and sight lines (`sightLine`) already treated a far hit as clear. Lab A's rays get the bound for free.

**What moved:** the shooting range's fingerprints (its script gained a throw), the golden recording. No valley value.

### Bob, hit confirmation and the end of a run (B5, B10)

**Decision:**
- **B5: walking bodies don't bob in the simulation, and a shot leaves from the simulation's eye.** Measured at 300 m (`tests/bob.test.ts`): a walking guard's 2.6 cm dip is 0.087 mil, under a quarter of the head's radius and a fifth of the smallest decision a 300 m shot needs, and under a pixel and a half through the scope. The camera's own bob fades out as the scope comes up, so the scoped shot and the drawn eye are the same point; unscoped, the barrel's pointing error is a hundred times larger than any dip. Bobbing bodies would cost a change to the body lane's shape, and through it every sight line, for nothing a player could see. Phase 3's walk cycles, which come with art, are the time to revisit it.
- **B10: confirmation is physical.** Dust where a shot strikes, darker than the ground so it reads at range; a flash on steel; the trace along the simulated path; the body's collapse; the thump heard after the flight and the way back. No kill cam: a replay already plays a shot back slowly, and nothing rations a reward that the physics hands out on its own.
- **The end of a run lists every rifle shot's breakdown** (range, lead, wind and sway in mils, and what it needed), from the same function `npm run playtest` prints, so the owner's verdict on a sitting can be checked against what decided each shot without a tool.
- **Optics belong to the body's own eyes:** the fly camera and the benchmark draw no scope, no sway and no zoom.

## 2026-11-07 · Wave 0

The seams of `docs/phase-1-plan.md`, Wave 0, landed on `main` one step at a time.

### Branches take `main` by merging it (Nov 8)

**Decision:**
- A branch behind `main` brings it in by merging it (`git merge origin/main`, or GitHub's *Update branch*), never by rebasing. The plan said to rebase, but `npm run land` and CI's "Up to date with main" ask only that `main` be an ancestor of the branch's head, and a merge gives that too.
- Goldens are still regenerated once `main` is in, never merged by hand: where one conflicts, take either side and regenerate.
- `npm run land` reads commit statuses (Vercel's deploys, which have a context and a state) as well as check runs. It took Vercel's status for a check still running, and refused with an empty list (#2 and #3 were merged by hand because of it).
- A ruleset on `main` became possible when the repository went public. It is the owner's call, and none is set.

**Why:** the app refuses a session's force push of a rebased branch, so lab A's finished #8 could not land after #7 moved `main` (Nov 8). A merge keeps every branch's history append-only, which is what the refusal protects.

**What moved:** nothing in the game. Only the landing script, CI's message and the plan's wording changed.

### A sliding body's own speed never carries it uphill (Nov 8)

**Decision:** on ground too steep to stand on, the motor now removes the uphill part of a body's velocity, as it already did for the wish. `SIM_VERSION` 7.

**Why:** the first run of the weekly jobs on Wave 0's code (Nov 8) found the motor breaking its promise in a fresh valley, NEM-4083: crawling prone off a low rock onto terrain a hair steeper than the limit, the player started sliding but kept the uphill speed he arrived with, which carried him onto gentler ground 8 mm higher. The same run fails the same way on the commit before Wave 0, so the bug was the foundation pass's, waiting for a valley to find it. A test at a handmade seam between too-steep and walkable ground showed it was worse at speed: a body arriving at a sprint coasted up to 16 cm in one tick. Both cases are now tests (`tests/steep.test.ts`).

**What moved:** no golden value: none of the pinned runs meets the case. The version still moves, because the motor now does something different for some inputs, and a recording that met the case would otherwise diverge on replay instead of being refused. The golden recording is rewritten for the new version.

### Determinism, hardened at the edges (W0.8)

**Decision:**
- **Synctest in the fuzz run** (`npm run fuzz -- --synctest`, `kernel/synctest.ts`). Every 30 ticks the state is saved twice: through `structuredClone`, and through a new exact on-disk codec for save-states (`kernel/record/stateCodec.ts`: every number's 64 bits, −0 and NaN, every key in its order). After 30 more ticks each copy is put back, the codec's into a fresh shadow simulation and the clone into the main one (a rollback), and re-stepped with the same inputs; every tick must match part by part. A weekly CI job runs it for 10 hours of play. A test plants state in a closure and sees it caught at the first re-stepped tick, with its part and path.
- **Bisect** (`npm run bisect`): from a recording (against the build that made it) or a pinned run (against `origin/main`), the first tick the two builds differ, then the first system within that tick, then the state paths that system left different. `npm run trace` gained recordings, per-system hashes and dumps after any system for it.
- **Known answers at startup** (`kernel/core/known.ts`): exact bits of `Math.sqrt` for twelve inputs, proved correctly rounded with integer arithmetic in `tests/known.test.ts`, and of every detmath function. The game refuses to start in an engine that gets them wrong, the headless tools stop, and the self-test checks them in every engine CI runs.
- **Sort comparators** must break ties with an id or an index, or say on their line why their keys can't tie; the architecture test checks every `.sort(` in the simulation. The footstep table's sort now names its tie-break, the gaits' order, which stable sorting already gave.

**What moved:** nothing.

**Why:** the core already matched industry practice; these were its edges (`docs/research/foundations.md`). The fuzz run never restored state mid-run, a divergence named a part of the state but not the tick, system or path, and nothing checked an engine outside CI.

### Landing, made mechanical (W0.7)

**Decision:**
- **Goldens explain themselves.** `npm run explain` runs another build (by default `origin/main`) from a temporary git worktree, traces every pinned run in both (`npm run trace`), and for each run that moved prints the first divergent tick, whether behaviour or only state moved, and the state paths that differ there (`guard:4.body.x: 12.5 → 12.75`, `kernel/diff.ts`), then each lane's work and metrics before and after. CI's "Goldens, explained" job prints it for every pull request and push to `main`.
- **Pinned runs and benches per lane.** The pinned runs (`game/runs.ts`) belong to lanes: the valley's plays to the game, the movement course to the body, spawn timing and the kernel alone to the kernel. Their fingerprints are `GOLDEN` (`game/golden.ts`). Each lane's bench (`game/benches.ts`) adds the work each system does in its runs and its quality metrics, pinned in `benchGolden.ts` and held by `tests/bench.test.ts`: today the body lane's broken promises and closest calls under two bots, and generation's valleys valid at their first attempt, of a held-out series. The other labs add theirs.
- **Work counts.** The kernel counts rays cast, grid nodes expanded and bodies resolved, and attributes them to the system that did the work (`kernel/work.ts`). They are deterministic, so they are pinned like goldens; `npm run sim -- --profile` prints them beside the time.
- **Behaviour fingerprints in recordings.** A recording's header carries its build's behaviour digest (`Game.behaviour`: one digest of every pinned behaviour value). A build that behaves differently refuses it with the reason and the build to replay it with, instead of re-simulating until it diverges.
- **The merge rule.** The repository is private and on GitHub Free: merge queues need an organization, and branch rules and rulesets need GitHub Pro or a public repository. So the rule is CI's "Up to date with main" check on every pull request, and `npm run land -- <number>`, which merges only a branch that is up to date with `main` and green, and only at the commit that was checked. Making the check blocking is the owner's call: it needs Pro, or a public repository.

**What moved:** `RECORDING_VERSION` 10, for the header's `behaviour` field, so the golden recording is rewritten. The kernel-alone scene's fingerprints join the goldens (`0698e581024f5b35`, `b51b84477d71dbf1`). No behaviour or state value moved.

**Why:** five lab branches are about to move shared goldens; the plan's landing rules were right but held by hand, and a recording from a lab's preview deploy would have been accepted by `main` and then diverged.

### Codes by lane, and all seven roles (W0.6)

**Decision:**
- **Code ranges** are data in `kernel/codes.ts`, by lane: the foundation 1–9, perception 10–29, ballistics 30–49, body 50–69, generation 70–89, brain 90–129, later phases 130–255. Every entry in the event and command registries names its range, and `tests/codes.test.ts` checks that the ranges split the byte with no gap or overlap, and that every code is unique in its registry and inside its range.
- **Roles:** `GUARD_ROLES` (generation lane) lists the design doc's seven: sentry, patrol, marksman, radio-operator, officer, worker and target. The debug view tints each; the test camp still uses three.

**What moved:** nothing. The registries' new `range` field isn't recorded.

**Why:** codes are permanent once recorded, so two branches that picked the same one would make recordings ambiguous; with a range per lane, they can't. Lab D staffs camps with all seven roles (D6) and lab E gives each its behaviour, so the roles exist before either branch opens.

### One grid search, exact and budgeted (W0.5)

**Decision:** `GridSearch` (`kernel/world/search.ts`) searches either layer of the spatial grid, for generation and the simulation alike: a bounded Dijkstra flood with a bucket queue (Dial's), for hearing and analysis, and A* with the octile estimate, for navigation.
- **Exact everywhere.** Costs are whole numbers of centimetres, so no rounding can reorder a queue; a cost function returning anything else throws.
- **One order.** Neighbours are visited in one fixed order (the four sides, then the corners), and A*'s ties break by the lower estimate left, then the lower cell index.
- **The layer's own moves.** A move follows the grid's walk edges, and a diagonal needs both of its two-step paths open, so no path cuts a corner. A cost function prices or closes any move: walls for sound, roofs, danger.
- **Budgets, not time** (rule 18): every search takes `maxExpansions`, reports what it expanded, and says if it ran out. The expansions are the work count W0.7's benches pin.

**What moved:** nothing; nothing uses it yet.

**Why:** lab A's hearing flood, lab D's analysis and lab E's navigation would otherwise each have built a search of their own, with their own tie-breaks.

### Systems query bodies and spawn inside a tick (W0.4)

**Decision:** the tick's context gains three calls.
- `ctx.query()`: the world, everything solid, and every body's shape as it stands at that moment, taken afresh on each call.
- `ctx.spawn` and `ctx.despawn`, which keep the entity index and the solids current at once. A system that uses them declares `entities` in its writes, or the simulation stops it.

**The rule this pins** (`game/scenes/spawnTick.ts`, the `spawn-tick` scene): a spawned entity exists from the moment it is spawned, for every system that runs after it in the tick, and for every system from the next tick on. A guard spawned in 'world' at tick 30 is in queries at once, seen by perception that tick, and first moved by the motor on tick 31; one spawned in 'commands' at tick 60 is seen and moved in tick 60. A guard spawned anywhere starts with his first order (`spawnGuard`, `game/setup.ts`), for the first tick not yet finished.

**What moved:** nothing. The scene's fingerprints are new in the self-test (`f5e93112e48134bb`, `2535df87754d14eb`).

**Why:** labs A, B and E all need it: sight lines against bodies, a killed guard's body, reinforcements, and the sandbox's drops. Overwatch had to add immediate creation in a patch after release; the research recommended pinning the semantics before the labs depend on them.

### Brains decide after perceiving, and steer through orders (W0.3)

**Decision:** a guard's brain runs in the 'decide' phase, after the world has moved and been perceived, and gives an order for the next tick. The order is plain data in the guard's state (`guard.order`, `brain/orders.ts`), and 'intent' carries out the current order every tick until the brain gives another. Each guard spawns with his first order, for tick 1, decided the same way from where he stands.

**What moved:** `STATE_SCHEMA` 7. The four `state` fingerprints in `src/sim/game/selftest.ts` (TAL-4471 wander `4c04325e4eca45c6`, MUD-9031 wander `0beac8712fcd45a4`, TAL-4471 chaos `5031fb7d0451b494`, the movement course `a72123b8c4cb29d8`), and the golden recording, rewritten. Every `behaviour` fingerprint held: the order the brain gives at the end of tick N is exactly what the routine gave at the start of tick N + 1, since nothing moves a guard between the two. In the golden recording, the input, event and state-sample tracks are byte for byte the same.

**Why:** brains then decide from what the tick perceived, never from a world that hasn't moved yet, and lab E's orders that last many ticks (go somewhere, follow a path) have their place: an order kind, carried out in 'intent'. Orders are the brain lane's edge with the body lane. The no-omniscience probe now watches in 'decide', and compares the orders given.

### The kernel boundary, the lanes and the game (W0.2)

**Decision:** `src/sim` is now `kernel/`, five lanes (`generation/`, `body/`, `perception/`, `brain/`, `ballistics/`) and `game/`, with the lane map as data in `src/sim/lanes.ts`. Every golden held: the selftest's fingerprints, TAL-4471's, the golden recording (rewritten byte for byte by `npm run golden`), and the 20-minute CI hash `e9311dda2ac00379`.

**How the kernel stays free of the game:**
- **One contract.** What the kernel needs from a game is the `Game` interface (`kernel/game.ts`): its systems, how a run starts (spawning the player and the guards moved here from `Simulation`'s constructor), every body's shape for queries, how to build a world from a mission spec and fingerprint it, and the recording's 10 Hz state sample. Sightline's is `SIGHTLINE` (`game/sim.ts`), whose `Simulation` subclass keeps `sim.player`, `sim.guards` and `snapshot()`.
- **Open registries.** The game adds its entity kinds, and generation adds its fields of `World`, by module augmentation, so the kernel's types grow without the kernel naming them. `npm run typecheck` compiles the kernel alone (`tsconfig.kernel.json`), where none of those additions exist, so kernel code can't quietly use them.
- **Shared vocabulary stays in the kernel.** The event and command registries are one table each in the kernel, which every lane adds to from its own code range (W0.6), so recordings decode without a game.
- **Channels instead of shared maps.** The intents the 'intent' phase hands to the motor go through `ctx.channel`, which starts empty every tick, so nothing outside the state tree lasts between ticks.

**Declared access:** every system declares the state paths it reads and writes and the events it emits. The simulation refuses two systems in one phase that touch the same data unless the later names the earlier in `after`, and stops a system that emits an undeclared event. A test diffs the state tree around every system, in two valleys and every scene, against its declared writes. One writer per subtree holds within each phase; the player's stance is written by the controls in 'intent' and by the motor in 'motor', which the phase order makes safe.

**Smaller calls:**
- The invariant watch lives with the motor in the body lane, since its promises are the motor's.
- The STAT track's sample is the game's: the kernel stores what `Game.sample` writes, and `game/samples.ts` reads and checks it. The file format didn't change.
- Re-simulating a plain mission takes its game (`{ game: SIGHTLINE }`); a scene names its own.
- Outside `src/sim`, code reaches a lane only through its `index.ts` too.

**Why:** `docs/foundation-shape.md`, approved by the owner. The kernel-alone scene (`kernel/alone.ts`, `tests/kernel.test.ts`) and two simulations stepped in alternation (`tests/state.test.ts`) show the kernel keeps no hidden state.

## 2026-11-07 · Planning Phase 1

The plan, with each lab's milestones and how its exit test is measured, is `docs/phase-1-plan.md`.

### The foundation's shape: a kernel, lanes and benches

**Decision:** `src/sim` splits into three layers:
- a narrow **kernel**, which never imports a lane or the game, and runs with every lane switched off;
- **lanes**, one per lab, each behind one exported contract;
- the **game**, Sightline's own content and rules.

**How it's enforced:**
- Systems declare what they read, write and emit, and a test catches two systems in a phase touching the same path with no declared order.
- The lane map is data, and the architecture test reads it.
- Every lane gets a bench: pinned scenes, quality metrics and deterministic work counts.

**What waits:** packages wait for a second game. The design is `docs/foundation-shape.md`, approved by the owner.

**Why:**
- **What the owner wants:** a foundation that many games and features can be built on, with each lane improving on its own.
- **What the research found** (`docs/research/foundations.md`): shared technology works when the kernel stays narrow and its contracts are enforced by test (Sony's ICE, Ubisoft's Snowdrop). It fails when one engine is mandated across genres (Frostbite).
- **Why now:** with five labs about to write most of the simulation, the boundary costs little now and much later.
- **Why no per-lane version numbers:** in a bit-exact simulation, every observable bit is part of the contract.

### Research is a seed, not a ceiling

**Decision:** fourteen researchers gathered the prior art, kept in `docs/research/`. Each lab starts from the strongest technique found, says where it falls short, builds past it, and records its bench numbers against both before it's done.

**Why:** the owner wants the pinnacle of each lane, not the best of what others have shipped. The research also shows where prior art cheated where Sightline promises not to: searches that read the player's true position, offscreen deafness, directors that know the truth. Each cheat becomes a check Sightline can run on every push.

### Seams first, then the labs in two waves

**Decision:** a short Wave 0 lands on `main` before any lab branch opens:
- brains decide in the 'decide' phase and steer through orders;
- systems can query bodies and spawn entities inside a tick;
- one grid search serves generation and the simulation;
- every lab gets a range of codes;
- all seven guard roles exist.

Then labs A, B and D run in parallel sessions, and C and E follow once A's percepts land.

**Why:** these are the seams that more than one lab would otherwise build its own way:
- A's hearing, D's analysis and E's navigation all search the grid;
- A's sight, B's bullets and E's reinforcements all need bodies and spawning inside a tick.

Landed once, before the branches, they turn merges of meaning into merges of text.

### One merge at a time, and goldens regenerated

**Decision:**
- Labs land on `main` one merge at a time, from branches that are up to date with it.
- Golden values and the golden recording are regenerated after each rebase, never merged by hand.
- Version numbers are taken at merge time.
- Changes that move every golden land alone, and are announced.
- Event and command codes come from a range per lab, and a test keeps them unique.

**Why:** two pull requests that are each green on their own can leave `main`'s golden values wrong. Codes are permanent once recorded. Two branches that picked the same one would make recordings ambiguous.

### Camp analysis sees with its own model

**Decision:** lab D's analysis and validation use a sight model of their own, in `tuning.gen`. A scenario-runner check holds it to lab A's detection at sampled points.

**Why:** generation reads only `tuning.gen`. Copying lab A's numbers there would make every retune of perception change every valley and bump `GEN_VERSION`.

### One overlook doesn't clear a camp

**Decision:** validation gains a rule, "no single perch wins". Its starting values are in the plan (D8). Lab E proves the rule from the other side: a scripted, perfect shooter on the best perch must be stopped by the camp's response before it finishes the objective.

**Why:** the owner found today's compound too easy to clear from a single overlook. Sniping stays central, but a long-range plan has to relocate, split clusters or time its shots.

## 2026-11-07 · Handing over to Phase 1

Phase 1 is planned and built in fresh Claude Code sessions, which know only what the repository holds. `docs/phase-1-handoff.md` is where they start.

### A copy of the design doc in the repository

**Decision:** `docs/design-doc.md` is a copy of the live design doc (revision 36). The live doc stays the source of truth, and the copy is exported again whenever the live doc changes. Its four diagrams are written out as text, because the export drops them.

**Why:** The design doc already serves as the brief for a Claude Code agent: each lab's spec and exit test can be handed over as they stand. But a session without the Claude Docs connector can't open the live doc. A copy beside the code can be read by any session.

### Looking at the game from a script

**Decision:** `npm run look` saves the honest and debug views as pictures from a headless browser. `openGame()` (`src/headless/browser.ts`) gives any script the game in a page, with the automation hooks in scope.

**Why:** `CLAUDE.md` asks for every change to be looked at. The scripts that did the looking during the foundation pass lived outside the repository and ended with that session. These tools also build in what those scripts learned:
- The tools' own Vite server has no hot reload, so an edit to `src` doesn't reload the page under a run.
- three is bundled before the page loads.
- Saves to the playtest inbox are dropped, so scripted runs don't land in `playtests/`.
- Expressions go to the page as strings, because tsx can wrap a function in helpers the page lacks.

## 2026-11-07 · Foundation pass

The working plan, with everything still open, is `docs/foundation-plan.md`.

### An independent review, and what it changed

**Decision:** before handing the pass back, a separate agent reviewed this session's commits (53ffd0d..2053269) without having seen them written: by reading, by running the tests, and with scripts of its own. Every finding was fixed:

- **Replay mode ends one way:** anything that starts a valley or a run, or opens another recording, leaves it first (`exitReplayMode`). Saving or hot-reloading during a replay acts on the recording being watched, never on the last live run's recorder.
- **A replay shows its own numbers:** bodies are drawn, and steady sounds heard, with the recording's tuning; only the view takes the viewer's.
- **The camera out of the body:** the fly camera flies on the movement keys in any context. With the camera outside the body, the player's own steps are heard from where they happen.
- **Saving that fails waits:** a failing store is asked again after the next minute of play or the next pause, not every frame. IndexedDB waits for its transaction to commit, and a failed tick's input counts as something new to save.
- **The fuzz verdict** is the first broken promise, by each body's own limits.

**Why:** an author's own checks follow the author's assumptions. The two serious findings were paths the author never took: opening a replay straight from a link, and leaving one by any route but Leave.

### A recording can be watched, from any camera, at any moment

**Decision:** the game watches recordings (`src/app/replay.ts`):

- **Opening one:** drop a file on the page, pick it on the start screen, choose one the deployed game kept, or load `?replay=<url>` (in development, any session in `playtests/`).
- **Seeking:** opening one builds its world and re-simulates it once, keeping save-states (`ReplaySeeker`), so seeking anywhere is exact. Playing steps the recorded input forward, so guards do exactly what they did.
- **The view:** the camera is the player's eyes, looking and zooming as they did, or the fly camera. The player's body is drawn whenever the camera is out of it (`render/playerMesh.ts`): its shape in its stance, the one sight and hits use.
- **Controls:** a timeline with the run's markers and pauses, speeds from ¼× to 8×, and replay keys in their own context (P, arrows, comma and period). The debug view's keys work in either view.

**Why:** a playtest's recording replays exactly. Watching it is how you find out why a guard saw you, and later the debrief and the tactical map (Phase 2) show the same thing. Building the viewer now also proves the renderer can draw the simulation from any state and any camera, which nothing else had tested.

### Every playtest is kept, and can be studied without the browser

**Decision:**

- **Saving:** the game keeps every run as it goes (`src/app/playtest.ts`): every minute of play, and when it pauses, the rules decide, a tick fails, the tab is hidden or a new run starts.
- **Where it goes:** in development the dev server writes each run into `playtests/`, as its recording and a telemetry report (`src/headless/playtestInbox.ts`). The deployed game keeps the last five runs in the browser's IndexedDB, and the start and pause screens offer them for saving.
- **The report:** it holds what the recording can't: frame-time percentiles and slow frames, the GPU and screen, the settings and the sound's state. Pauses and markers go into the recording as annotations.
- **Reading them back:** `npm run playtest` re-simulates every session. It checks the replay is bit for bit, and that every body kept its promises. Then it summarizes the play and the machine.

**Why:** a playtest you can't study afterwards is an anecdote. The recording replays exactly what happened, and the report records how it ran on that machine, which nothing else can tell us. The owner plays the deployed build, so a crash or a closed tab must not cost the run there either.

### The motor's promises are watched for every body, for hours

**Decision:** one watch (`src/sim/bots/invariants.ts`) checks every body after every tick: never under the terrain, never inside anything solid, never more than a step up, never gaining height on ground too steep, never a NaN. The invariant tests, `npm run playtest` and the long fuzz run (`npm run fuzz`) all use it. The weekly CI run plays 20 fresh valleys with both bots for an hour each. A broken promise stops that run and saves its recording, so the failure can be re-simulated.

**Why:** the tests check a few minutes on five fixed valleys, and only the player. The guards share the motor, and fresh valleys find the corners that fixed ones never reach.

### Every engine, every push

**Decision:** a second workflow (`.github/workflows/engines.yml`) runs the browser tests in Chromium, Firefox and WebKit, and the self-test under Bun (JavaScriptCore), on every push. Branches named `ci/...` run it too, so a change to CI can be tried before it reaches `main`. Vite now bundles three before the browser tests start, because a dependency first met mid-run makes Vite reload the page under the running tests. A test that imports the renderer would hit that. It doesn't explain the occasional first-run hang seen before: no browser test imports three yet. If that hang comes back, `DEBUG=vite:deps` shows what Vite is doing.

**Why:** a recording made in Safari has to replay in Chrome, and in CI. Every engine gives the golden values.

**What it found:** WebKit's high-pass filter passes 1–2 dB less than Chromium's at the same settings. Footsteps on grass, the only voice that used one, came out quieter than the simulation said. Grass now uses a wide band-pass, whose Q means the same in every engine. A calibration tool (`tests/browser/calibrate.test.ts`, run with `VITE_CALIBRATE=1`) re-derives every voice's loudness trim.

### What is drawn is what can be hit, from any camera

**Decision:**

- **Guards:** a guard whose body holds the camera isn't drawn (the fly camera, or a guard shoved into you against a wall). Walking guards no longer bob: the bob was the renderer's own, so the drawn head sat up to 3.5 cm from the hit sphere.
- **Foliage:** the canopy or bush the camera is in shows its inner faces, translucent (`src/render/interiors.ts`), using the same shapes and placement as the outside.

**Why:** a closed shape seen from inside is a hole, or slivers of faces cut by the near plane. A drawn shape that moves without its hit shape breaks the promise that guards' meshes make: lab B's 300 m shot at a walking guard depends on it. If walking bodies should bob, they bob in the simulation (lab B's call), and the drawing follows.

**Found on the way:** canopies are drawn opaque but block no sight in the simulation, and a bush hides you while you see out of it freely. What foliage does to sight, in both directions, is lab A's to decide. It's listed in the plan under M8.

### Sound plays in the game, at the moment the picture shows

**Decision:** The sound engine is wired into the game (`src/app/sound.ts`):

- **Starting:** the audio context is made on the first "Click to begin", the gesture browsers require, and woken on every later one.
- **Listening:** the listener is the camera. In your body it's at your eyes; in the fly camera it's wherever the camera is, so you can fly to a guard and listen to him.
- **Pausing:** a pause ducks everything to a quarter; a hidden tab suspends sound.
- **Volume:** the volume setting is heard on a square law.
- **Muffling:** the straight path is checked through the world query (`src/audio/muffle.ts`), so a gate an entity closes muffles the generator as a wall does.
- **Timing:** each event plays when the frame on screen reaches its moment, plus about a frame. The picture runs a tick behind the newest state, so a sound waits `(t − shown) / scale + hold`, at most a quarter of a second. The hold covers a tick computed late in its frame; it tracks the frame time, jumping up for a slow frame and easing back down. A sound the picture has passed plays at once.
- **Failures:** sound is never essential. Without Web Audio, or after any error in it, the game plays on silently and the debug panel says why. The panel also shows the context's state, latency and voices, and the steady sources in earshot.

**Why:** a tick's events used to reach the speakers when the frame that ran the tick was drawn: late by up to a tick, and by a different amount each time. In a model of the loop, with frames ±25% uneven, a sprint's steps wandered 28–47 ms from their period at 24–144 fps. That's enough to hear a steady stride as uneven. Timed against the picture, they stay within 3 ms of the model's wall clock (a test holds them under 4). In a real browser the audio clock's own steps, a few milliseconds a callback, come on top. That is still well under what an ear notices in a stride. The added frame roughly matches the screen's own latency, so sound stays in step with what you see.

### The world's steady sounds are listed by the simulation

**Decision:** Where the creek and the generator sound from, and how far they carry, is a function of the world in the simulation (`src/sim/world/ambient.ts`), not of the audio. The speakers play that list.

**Why:** lab A masks footsteps with these same sources. Kept in one list, the creek you hear and the creek a guard hears stay the same creek, and the hearing law stays one law.

### A footstep happens where and when the stride runs out

**Decision:** The motor stamps each footstep with the moment within its tick that the stride ran out, and the place the body was then. It no longer uses the tick's end. `SIM_VERSION` 6: every run's behaviour fingerprint moved, and no state did.

**Why:** a sprint takes a step every 9.27 ticks. Stamped at tick ends, its steps beat 9, 9, 10: a gallop you can hear at 30 Hz. Stamped at the true moment, they come exactly a stride apart in time and space, whatever the tick rate. A test holds the sprint to its period, and the head bob below lands on these moments.

### The head bob follows the body's stride

**Decision:**

- **What drives it:** the camera's dip is a pure function of how far through its stride the body is, and how fast it moves (`src/sim/motor/bob.ts`). It used to be a phase the renderer advanced by itself.
- **Shape:** the eye is lowest as a foot comes down, and highest half a stride later.
- **Depth:** it deepens with speed through each gait's depth (`tuning.view.bob`), from nothing at rest, so stopping never pops the view.
- **Optics:** the bob fades out as an optic comes up. Through one, the camera is exactly at the simulation's eye, where a shot leaves from.

**Why:** with the footsteps above, the dip lands on the step you hear, to the sample: a test checks that the interpolated stride starts over at each footstep's moment within its tick. The functions use exact arithmetic, so lab B can have the simulation evaluate the same bob if it decides shots leave from the bobbing eye.

### Scenes: one definition, run headless, played in the browser, replayed

**Decision:** A scene (`src/sim/scene.ts`) is a world (generated from a mission spec, or built by hand with `gen/handmade.ts`), the systems it adds, a setup before the first tick, a driver for headless runs (a bot or a list of waypoints), and expectations checked during and after the run. The same definition runs headless (`npm run scene`, and every scene in the tests), is played in the browser (`?scene=<name>`), and re-simulates from a recording, which names the scene and its version (recording format 9). Scenes live in `src/sim/scenes`, under the simulation's rules, and the self-test pins each one's fingerprints in every engine. A hand-built world's mission spec says so (`terrain: { kind: 'handmade' }`), and only its scene can build it.

The first scene is the movement course: stairs, a 1 m and a 2 m drop, ramps of 30° and 40°, a ceiling to crouch under, a crawl space, six surfaces.

**Why:** each Phase 1 lab is a scene built to its exit test, and needs to be playable, scriptable and replayable without building its own harness. A regression test that needs more than one tick is a scene too.

### Keys are bound to actions, in a table; settings belong to the player

**Decision:** Every key and button is bound to a named action in a context (on foot, always, the debug view, the fly camera) in one data table (`src/app/actions.ts`). The input controller tracks what is held and fires what is pressed, by action; the game handles actions, never key codes; the legends on the start screen and in the debug view are drawn from the table. The player's settings (sensitivity, field of view, invert, volume, raw mouse input) live in this browser's storage, not in tuning or recordings: a recording stores the view angles the mouse produced, whatever the sensitivity.

**Why:** each lab adds controls (lab B's breath and optic, lab C's lean); with a table, they add rows instead of key checks scattered through the input code, and rebinding, a gamepad or a touch layout later is data. Settings are a person's, so they follow the person, not the build.

### Systems explain themselves through a debug channel

**Decision:** A system draws for the debug view with `ctx.debug(draw => …)` (`src/sim/debugDraw.ts`): lines, points, circles and labels, coloured by meaning. The callback runs only while the debug view is on; what it draws isn't state, isn't hashed or recorded, and nothing in the simulation reads it back. The renderer draws the newest tick's lines, and the HUD places its labels. The first user is the controller overlay: the player's body circle, rim probes, heading, a label with slope against the limit, sliding, footing and mode, and every push of the resolve passes.

**Why:** rule 8 asks every system to ship explainable, and labs A to E need to show what their systems decided and why (a perception ray, a suspicion level, a path). Without one channel, each lab would reach into the renderer its own way, or leave debugging state in the simulation.

### Camps stand at sites

**Decision:** A camp is laid out in the frame of its site (`gen/site.ts`): the camp's centre, the direction its gate faces, and its pad. Everything that looks for the camp asks the site rather than the origin: validation's perches and approaches, the spawn's facing, the props kept clear of the pad, the first view, the benchmark's flight and the debug view's sight lines. The procedural valley still builds one site at the origin, so nothing moved: the valley's fingerprint is unchanged. A test builds the same camp at a site 380 m away and finds every collider, guard and routine simply moved.

**Why:** lab D's camp generator, several bases in one map and camps on real terrain all start from "build a camp here"; converting the camp's coordinates later would mean finding every place that quietly meant (0, 0).

### Brains decide from what they perceive

**Decision:** A guard's brain lives in `src/sim/ai` and decides from a `GuardMind` (`ai/mind.ts`): his own body, his post and routine, the static world, the tuning, the time, and his percepts. The mind is built outside the boundary from the guard's own state and perception's output (`entities/guards.ts`, `guardMind`). An architecture test allows `src/sim/ai` to import only the core, generation, the static world, the motor's types, events, the environment and the tuning's type: never the state, the simulation or the systems. Keeping to the routine is the first brain (`ai/routine.ts`), with behaviour unchanged.

A no-omniscience test plays the valley twice with the player 600 m apart in two places no guard can perceive: wherever a guard has the same mind in both runs, his decisions must match bit for bit. A brain that peeks at the player's true position fails it, and the test proves that too.

**Why:** a stealth game is only fair if guards know what they could have perceived. If the rule were a convention, lab E's first shortcut would read the player's position from the state; as a boundary with a test, a leak fails the build.

### The rules decide the outcome, in the state

**Decision:** Every run has an outcome in the state tree: playing, then succeeded or failed, with a reason and the tick (`STATE_SCHEMA` 6). Rules are a system in the 'mission' phase that calls `decide`; the first decision stands and emits an `outcome` event, so the debrief can walk its causes. A headless scene run ends when its rules decide (unless the scene plays on), and the browser stops the run, shows the outcome and offers to play again.

**Why:** each lab's exit test ends in an outcome (detected or not, the shot earned or not, the escalation contained or not), and Phase 2's mission rules plug into the same place. Kept in the state, an outcome replays and seeks like everything else.

### Falls follow gravity exactly

**Decision:** A body in the air moves by the exact constant-gravity step (y += v·dt − ½g·dt², v −= g·dt), and lands at the speed it has when it reaches the ground within the tick, not at the start of that tick. A fall from h now lands at exactly √(2gh), whatever the tick rate (`SIM_VERSION` 5).

**Why:** the movement course's first check found the old step falling a little faster in position but landing about 4% slower than gravity says (4.25 m/s from 1 m instead of 4.43), so landing noise didn't match its tuning's own note. No bot run in the self-test had fallen far enough to show it; the course now pins both drops in every engine.

### Solid things can appear, move and vanish

**Decision:** An entity can have a solid shape: a collider in the world frame, kept in the state tree (`SolidEntity`, kind `solid`, for now the only kind with one). `Solids` (`src/sim/world/solids.ts`) shows the world's colliders and every entity's shape as one set: the motor, the world query, the light and the renderer all ask it, so a gate stops a body, a shot and a sight line exactly as a wall does. An entity's collider id is a fixed offset plus its entity id, the same for the whole run and across restores. Whatever moves a shape never moves it into a body (it checks with `overlapsBody`, then waits or stops): that keeps the motor's invariant that no body ends a tick inside anything solid, and a test runs a gate that waits for the player. Until a kind of entity has its own mesh, the renderer draws its shape (in both views, so nothing solid is invisible).

**Why:** doors, the escape vehicle and the reinforcement truck (labs D and E, Phase 2) all need it, and retrofitting it would mean reworking every collision path of the motor later, under its invariants. With no entities' shapes in play, every answer is the same as before: the behaviour goldens and the golden recording are unchanged, and a tick costs the same.

**Not yet:** bodies don't ride what they stand on, and the spatial grid doesn't know about doors; both come with the lab that needs them.

### A failed tick stops the run, and its recording reproduces the failure

**Decision:** If a system throws during a tick, the simulation records which tick, which system and why (`sim.fault`) and refuses further ticks: its state is partway through that tick, and going on would quietly part ways with any recording of the run. The recorder keeps the failing tick's input (`recordFault`), and the recording says the run ended in a fault (recording format 8). Re-simulating it runs up to that tick and must fail the same way, in the same system, leaving the same partial state: then the fault "reproduces exactly". A replay can show everything up to the tick before.

In the browser, a failed tick stops the run with the error on screen and offers to save the recording; a failure while drawing, or anywhere else in the page, pauses with the run intact; a failed generation says so and offers to try again; a lost WebGL context pauses until the browser gives it back.

**Why:** the runtime audit found that one exception inside a tick left the game running on half-updated state while the recorder kept going, so a saved recording looked valid and re-simulated as diverged, with no word to the player. A recording that reproduces a crash is the most useful bug report there is, and it costs nothing until something fails.

### Hot reload survives the validator

**Decision:** `config/validate.ts` accepts updates to `tuning.ts` itself (it reads the defaults to check a tuning's shape), and keeps checking against the shape it loaded with. A saved value applies in place, as before; a change of shape is refused with a message to reload, since the code that reads it changed too. An architecture test allows only `main.ts` and the validator to import the tuning values in the browser.

**Why:** the validator's import of the defaults made Vite reload the whole page on every save, losing the run (the runtime audit's H5), which broke rule 4 since the validator landed.

### Every body is a kind in tuning

**Decision:** The player's and the guard's bodies are complete kinds in `tuning.bodies`: sizes, speeds, accelerations, limits, strides and the sizes of their parts. The motor, the body shapes, the visibility factors and the guards' meshes read a body's own kind, never the player's, and the guard is no longer the player's spec with overrides written in code. Gravity left the body for `tuning.sim.gravity`, since everything that falls shares it (bodies now, bullets and throws with lab B). It stays out of the mission's environment: Earth's gravity varies by half a percent between the equator and the poles, too little to matter, and a mission shouldn't be able to change it.

A recording whose tuning is shaped differently (one from before this change, say) is refused as one made by another build, naming the build and the first differences, rather than as corrupt.

**Why:** a new kind of body (a dog, a pilot in a harness, a zombie) is data, not code; recordings carry every body's numbers with the rest of the tuning; and a guard's crouch can be tuned without changing the player's. The values are unchanged: the golden recording's final hash is the same.

### One grid for walking, sound, shelter and cover

**Decision:** Generation builds one spatial grid (`src/sim/world/grid.ts`) with the world: a 2.5 m map layer over the whole terrain, lined up with its cells, and a 0.5 m site layer over the camp and a 12 m margin (from the camp's own structures, not the origin). Each cell says whether a standing body fits (slope, and anything solid between a step and the top of the head, within the body's radius), whether a wall stops sound, whether it is roofed, and how tall the sight-blocking cover is. Each cell also says whether a body can walk from its centre to its east and north neighbours': a fence thinner than a cell can sit between two centres that both fit a body, and only the edge between them knows. G shows the fine layer in the debug view.

The grid is built for a standard body (`gen.grid`, kept equal to the player's by a test), because generation reads only `tuning.gen`. It adds about 0.2 s to generating a valley. Ambient masking (how loud the creek and the generator are at a point) stays a function of the world's steady sources and the noise tuning, for lab A, rather than a layer frozen at generation.

**Why:** Hearing (sound travels along walkable paths, not through walls), lab E's pathfinding and lab D's infiltration and access checks would otherwise each build their own grid, and sound would travel where guards can't walk. Generation's validation still uses its own slope-only map; lab D moves it onto the grid with its own fingerprint change.

### The simulation owns the sun, the wind and the air

**Decision:** The mission spec carries its environment (`src/sim/env.ts`): the time of day and how fast it runs, the latitude and day of the year, a steady wind, the altitude and the temperature. From these the simulation derives the sun's direction (deterministic math, a standard solar model), the wind's velocity, the air's density and the speed of sound, and the light at any point: in the sun, in the shade of terrain or anything that blocks sight, at dusk or in the dark. The renderer lights the scene and the sky from the simulation's sun; the default environment (a mid-October afternoon at 33° N, 14:24) puts it exactly where the wireframe look had it. The debug panel shows whether you stand in sun or shade, and the sound engine takes the mission air's speed of sound.

**Why:** Glint, shade as cover, a skyline and lab C's "players predict their own visibility" all need the sun the player sees to be the sun the simulation tests against. A renderer constant would have diverged the first time anyone changed the time of day. Altitude and temperature cost nothing now and are what real-world terrain (Everest's thin air) and lab B's drag will need.

**Starting values:** shade multiplies visibility by 0.6, like dusk; lab A tunes it. Steady daylight (clock rate 0) for the core mission, as the design doc says. `RECORDING_VERSION` 7 (the header's mission has an environment).

### One query for what a line hits, and one shape for every body

**Decision:** `src/sim/world/query.ts` answers "what does this line hit" for sight, hearing, shots and the rangefinder alike: the terrain, the colliders matching a mask, and bodies, with the point, the outward normal, what was hit, its id, the body part and the surface. `sightLine` asks whether one point can see another. Bodies stand in the way of sight and bullets, not sound; a new `Blocks.Sound` flag says which colliders stop sound (walls and buildings do, chain-link fences don't), and the sound engine's muffling uses it.

Every human body has one shape (`src/sim/motor/shape.ts`): a head sphere at the eye, a torso capsule from the hips to the shoulders, a legs capsule, from `tuning.bodies`. Prone, it lies along the facing, head first; between stances it follows the eye. The guards' meshes are built from the same shape, so what is drawn is what can be hit.

Simulation code reads the terrain through its queries (`heightAt`, `sample`, `surfaceAt`, `raycast`); an architecture test keeps the heightfield's arrays to generation, test bots and rendering, so real or chunked terrain can stand behind the same questions later.

**Why:** Labs A and B would otherwise write separate visibility and hit code against different guard shapes (three sources disagreed: physics, the rangefinder and the mesh), and "if he can see your head, you can hit his" would stop being true by construction.

**Guarded by** `tests/query.test.ts`: ray tests against spheres and capsules agree with marching along the ray to the millimetre; a ray at a guard's head, chest and knees names those parts; normals and surfaces of terrain and colliders; sound passes a fence but not a wall; sight between 400 random pairs of points is symmetric.

The valley's fingerprint now covers every collider (it only counted them before) and the sound flag, so `GEN_VERSION` is 3. Movement is unchanged.

### Guards keep to routines, a pure function of time, and move like the player

**Decision:**

- **Routines.** Every guard has a routine (`src/sim/gen/routine.ts`): one cycle of walks and pauses, repeated all mission. Sentries and workers hold their posts and sweep their gaze; patrols walk their routes at the camp's pace, pausing at each waypoint and turning toward the next leg. `routinePose(routine, t)` says where a guard on routine is at any moment, without running the simulation.
- **Generated with the camp.** Each guard's pauses are drawn from his own fork of a new `routines` stream when the valley is generated, so a seed always gives the same rhythm. The pace, pauses, turning rate and gaze sweep moved from `tuning.guards` to `tuning.gen.routines`: a camp's rhythm is part of the camp, and lab D validates the timing windows it makes. The valley itself is unchanged (its layout fingerprint still matches); the fingerprint now covers routines too, so `GEN_VERSION` is 2.
- **The shared motor.** Guards are bodies. A guard's intent each tick is to be where his routine puts him at the end of it, hurrying (up to 1.5 × walking pace) when he has fallen behind. The motor gets him there under the player's rules: walls stop him, he steps and climbs, his footsteps follow his actual speed, he stands on his tower's deck. Bodies move in entity order, each against where the others are at that moment.
- **A random stream per entity.** The shared `sim` stream is gone. `ctx.draw(id, purpose, use)` draws from an entity's own stream, kept in the state tree and made on first use.

**Why:** Before, every patrol drew its pauses from one shared stream as it reached each waypoint, so stopping one guard reshuffled everyone else's timetable (measured: 4.6 s within 10 minutes). The first kill would have erased the windows the player had watched and the generator had validated. And guards walked through fences.

**Guarded by** `tests/guards.test.ts`: guards keep within 5 cm of their routines for ten minutes in two valleys; removing a guard leaves every other guard's body bit for bit the same, every tick; sentries stand on their decks; a wall stops a patrol; an entity's draws don't depend on another's. Writing them caught every guard getting the same id, and so the same pauses.

**Cost:** the simulation now moves eight bodies, about 80 µs a tick headless (from 25). Bodies standing still still run the full collision; a fast path is possible if perception's budget needs it.

The debug view draws a line from each guard to where his routine puts him in ten seconds. `SIM_VERSION` 4, `STATE_SCHEMA` 5.

### Recordings are tagged tracks, checked before they are trusted

**Decision:** A recording (`RECORDING_VERSION` 6) is a header and tagged tracks: inputs (the source of truth), checkpoints, tuning changes, states at 10 Hz, events and annotations. A reader skips tracks it doesn't know.

- **The header** carries the build, `SIM_VERSION`, `GEN_VERSION`, `STATE_SCHEMA`, the mission spec, the tuning at the start, and fingerprints of the generated valley and the first state. Re-simulation stops with a reason, before running, when any of these disagree with this build.
- **Checkpoints** hash the state whole and part by part (each entity, the random streams, the schedule), so a divergence says where: "first divergence at tick 600, in player:1".
- **Tuning changed while playing** is recorded with the tick it applies from, so a run tuned by hot reload still re-simulates. A simulation runs on a frozen copy of its tuning, so the only way to change it is `setTuning`, which the recorder sees.
- **Seeking** (`record/seek.ts`) re-simulates once, keeping a save-state every 5 s, and then reaches any tick exactly.
- **Markers:** M marks a moment in the recording.
- **Reading is strict:** sizes, every header field (unknown fields refused), track contents against the header, no trailing bytes, a 512 MB cap. Everything fails as a `RecordingFormatError` that says what's wrong.
- **Writing** uses 64 KB chunks instead of a buffer that doubles, and saving hands the chunks to the browser as they are.
- **A golden recording** (`tests/golden/`) re-simulates bit for bit in the tests. Rewrite it with `npm run golden` when a version changes.

**Why:** Recordings are how bugs get reproduced and playtests analysed, and how daily runs will be verified later. A recording that can't say why it doesn't replay, or that a hostile file can hang, isn't a tool. The chunked writer's first test found that a value written as a chunk filled went into the previous chunk: every recording over 64 KB a track would have been corrupt.

### A click is about the frame the player saw

**Decision:** The tick input carries held states (an optic up, breath held, a lean) and a list of commands. A precise command such as `fire` carries what was on screen: its `lag` (how many ticks before the consuming tick's start state the frame was, from 0 to 2, stored to 1/120 of a tick) and that frame's view angles. The browser latches each click against the frame on screen (`app/commandLatch.ts`): 1 − α, plus a tick for each tick that ran since. Bodies keep their pose at the end of the last two ticks, and the simulation resolves a precise command against that history (`poseAt`), so a shot leaves from the eye the player saw, along the crosshair they saw. Each `fire` emits a `shot` event, timed when it happened; the debug view draws it to where it stops.

**Why:** The screen draws between the last two simulation states, so it runs about a tick behind the newest one, and mouse look runs at frame rate. A shot taken at the next tick with that tick's aim would miss by up to 9 cm at 300 m against an 11.5 cm head: exactly lab B's exit test. Lab B builds the ballistics; the timing has to be right underneath it first, because tuning lead and holdover around tick-quantized shots and fixing it later would change every shot.

**Guarded by:** `tests/timing.test.ts` drives the simulation the way the game does (fixed-step clock, input per tick, interpolated frames, latched clicks) with the player sprinting and the view sweeping. At 30, 60, 144, 240 and 47 fps, and at an uneven frame rate, every shot leaves within 1 mm of the camera of the frame clicked on and along its crosshair. With the history ignored, all six fail.

**Not yet:** head bob is drawn but not simulated, so a shot leaves from the eye without it (up to about 3 cm lower or higher). Lab B decides between turning bob off with an optic up and simulating it.

Commands are recorded with the input (`RECORDING_VERSION` 5); the pose history is state (`STATE_SCHEMA` 4). No bot fires, so the `behaviour` fingerprints held.

### Events come from one registry, with ids, times, sources and causes

**Decision:** Every event has one type from the registry in `src/sim/events.ts`, an id (from 1, in order, kept in the state tree), its tick, the moment it happened in seconds, the entity that made it, and the event that caused it (or 0). Sounds are one family: a position, a surface, a loudness and a radius. The registry says how each field is stored, so the recorder encodes events generically (`record/eventCodec.ts`) and the compiler rejects a type without a complete entry. `EventLog.explain(id)` walks causes back to the first.

- The player's events name the player's entity id (1), like everyone else's; the special −1 is gone. Stance events now say whose they are.
- A footstep says what the legs were doing (`gait`), and the sound engine picks the step's voice from that. Before, it guessed the voice from loudness, so a slow walk uphill played the crouch voice.

**Why:** Four labs emit and consume events in parallel: perception hears them, the brain reacts with its own, the debrief explains a mission through their causes ("the alarm, because he heard a footstep, because you sprinted on gravel"). Adding ids and causes later would mean revisiting every emitter.

**Proof:** every field of every body matched on every tick of six 90-second runs, and every event's content matched apart from the new fields and the player's id. Events now say more, so the `behaviour` fingerprint moved: `SIM_VERSION` 3, `STATE_SCHEMA` 3 (the next event id), `RECORDING_VERSION` 4.

### A tick runs declared systems, and every body shares one motor

**Decision:** `step()` runs the systems listed in `src/sim/systems.ts`, phase by phase: schedule, commands, intent, motor, projectiles, world, perception, awareness, camp, decide, mission. Most phases are empty until the labs fill them, but their order is fixed now. Perception sees the world after everything has moved; brains decide after perceiving; what they decide moves bodies from the next tick, one tick (33 ms) after the stimulus.

- **Rates.** A system can run slower than the tick (`hz: 10` runs every third tick), on a rhythm set by the tick number alone.
- **The schedule** (`src/sim/schedule.ts`) holds delayed effects in the state tree, due by tick, first-scheduled first within a tick, and runs them before anything moves. Radio calls, reinforcements and search timers will use it.
- **Profiling.** `npm run sim -- --profile` and the debug view report each system's time per tick. The caller supplies the clock.
- **The shared motor** (`src/sim/motor/`). The player's controls (`entities/player.ts`) turn input into a `MoveIntent` (a wished velocity, a gait, a facing). The motor decides what the body gets: slopes, steps, collision, falls, landings, footsteps. Any body can use it with its own spec; a test drives a wider body into a wall and another off a ledge. Guards join it in M5.
- **Modes.** A body is in one motor mode, `ground` or `air`. Each mode drives velocity its own way; moving and settling are shared, and settling picks the next mode. Lab C's mantle, vault and ladder become modes with their own invariants.
- **Two fingerprints in the self-test.** `behaviour` hashes what can be observed every tick: every body's pose and every event, each entity's in order. `state` hashes the whole tree at the end. A refactor keeps `behaviour`; a change to how state is stored moves only `state` (`STATE_SCHEMA`); a change to what the game does moves `behaviour` (`SIM_VERSION`). The fuzzing bot joins the self-test, so the controls' edge cases are pinned too.

**Why:** Every lab adds systems in parallel. Without a declared order, each would call its code from `step()` wherever it fit, and the reaction time between hearing a shot and acting on it would depend on whose code landed first. Moving one system later shifts every tuned reaction window by 33 ms and changes every recording, so the order has to be settled before the labs start. The motor is split now so that lab C's lean, mantle and carry and lab E's guards build on one controller, not two.

**Proof it changed nothing:** the Phase 0 field-by-field hash matched on every tick of six 90-second runs (three valleys, both bots), and every tick's events matched entity by entity. The `behaviour` values held; only `state` moved, because the player is now a body plus its controls and the tree has a schedule (`STATE_SCHEMA` 2, `RECORDING_VERSION` 3). With `behaviour` in place, `legacyHash()` is gone.

### All simulation state lives in one plain-data tree

**Decision:** Everything dynamic is in `sim.state` (`src/sim/state.ts`): entities with stable ids, a kind and a faction, each carrying its component (the player's body, a guard), plus the words of the simulation's random streams. Only numbers, booleans, strings, null, arrays and plain objects; entities refer to each other by id. Derived caches, such as the list of guards, live outside the tree and are rebuilt from it.

- The hash walks the whole tree with keys sorted and numbers by their exact bits, so new state is covered by construction. A test changes every leaf in turn and checks that the hash moves.
- A save-state is `structuredClone` of the tree, and `restore()` continues bit for bit. Seeking in a recording and suspend and resume build on this.
- Ids are never reused within a run. The renderer's snapshot, the guard meshes and the debug cones are keyed by id, so entities can appear and disappear mid-run: reinforcements, a body, a dropped rifle.
- Perception and AI will target factions, never "the player".

**Why:** The Phase 0 hash listed fields by hand, so a forgotten field was invisible to every determinism check, and the guard list was fixed for the run. Every Phase 1 lab adds state; this makes adding it safe by default.

**Proof it changed nothing:** a `legacyHash()` reproducing Phase 0's hash matched on every tick of six 90-second runs (three valleys, the person-like and the fuzzing bot) before the hash switched to the whole tree. The golden values and `RECORDING_VERSION` (2) moved because the hash covers more; behaviour did not.

### Generation takes a mission spec, and tuning has owners

**Decision:** `generateWorld(spec, tuning)` takes a `MissionSpec` (`src/sim/mission.ts`): seed, generator version, terrain source, insertion. Later inputs (camp archetype, objective, environment, loadout, real terrain identified by a content hash) slot in with today's behaviour as their defaults. `GEN_VERSION` and `SIM_VERSION` (`src/sim/version.ts`) move with the golden values, so a mismatch between builds explains itself.

Tuning is split by owner. Generation receives only `tuning.gen`, and a test moves every fractional number outside it by 1% and checks that the valley doesn't change. `view` is presentation. Everything else belongs to the simulation, and its key is derived as "all but `gen` and `view`" instead of a hand-kept list, which had left `visibility` out.

**Why:** Shared seeds and daily contracts need a seed to build the same valley for as long as it's public; after that, every generation change needs version branches. Real-world terrain and doctrine need generation inputs that are named and versioned rather than implied.

### Nothing reaches a tick except its state and its input

**Decision:** The simulation never reads a clock: generation, re-simulation and the recorder take a clock or a timestamp from their caller. `tests/architecture.test.ts` forbids clocks, timers, async code, network, dynamic imports and long-lived module state in `src/sim`, along with ways around the banned math (aliasing `Math`, bracket access, locale-dependent formatting). `dexp`, `dlog` and `dpow` join the deterministic math, within 1 ulp of `Math.exp` and `Math.log`.

**Why:** Each of these is a way for two runs of the same input to differ. The labs will want exponentials (drag, falloff), so the deterministic versions exist before anyone writes their own.

### Odd and hostile input is refused or made harmless

From the fresh-eyes audit of the simulation core:

- **Facing due south could make a recording that never replays.** `Math.fround(π)` is above π, and re-wrapping it on replay gave different bits. Quantizing is now idempotent bit for bit, tested at ±π.
- **Non-finite input can't get in.** Axes become 0, angles keep their previous value, −0 becomes +0, and every NaN hashes alike (V8, JavaScriptCore and ARM give NaN different bits).
- **Tuning is validated** (`src/config/validate.ts`) before anything trusts it: the same shape as the defaults, finite numbers only, and bounds on the sizes that drive loops and allocations. A hostile recording header used to hang re-simulation or allocate past 2 GB; it is now rejected by name, and its tuning must match its hash.
- **Smaller fixes:** `dtanDeg(90)` was −∞; `datan2` handles NaN and infinities; random-stream labels can't collide with nested forks; the clock ignores NaN frame times; guards' footsteps sound where the foot lands.

The audits' findings that are not fixed yet are listed in `docs/foundation-plan.md`, under the milestone that fixes each.

### Steep ground is a barrier from every angle, and leaving it is a fall

**Decision:** Ground steeper than `maxSlopeDeg` (42°) is not ground you can stand on.

- No move gains height on it, whatever the angle of approach: the uphill part of the wish, the move and the velocity is removed, so you slide along its contour.
- On it there is no traction. You slide down, with gravity along the slope.
- Walking off an edge steeper than gravity can follow is a fall.
- Every fall or slide ends in a landing event with a sound whose loudness grows with impact speed (`tuning.noise.landing`). A 1 m drop lands about as loud as a walking step; a 0.5 m step down is silent.
- The body is a circle against the terrain as well as against objects. Terrain rising more than a step inside its rim pushes it back, so a face never comes within the camera's near plane.

**Why:** A second fresh-eyes audit found that the slope limit applied only along the direction of travel. Walking across a cliff at a shallow angle climbed it: 545 m of height gained on 33 faces in three valleys, while generation's validation counted those faces as barriers. Walking down an 80° face stayed glued to the ground, faster than free fall and silent.

**Guarded by:**
- `tests/steep.test.ts`: the steepest real faces of three valleys, attempted from nine headings; the worst gain is under 5 cm.
- The invariant run, which now also checks rise per tick, height gained on steep ground and NaN, at a 0.1 mm tolerance, with a fuzzing bot (`src/sim/bots/chaos.ts`) alongside the person-like one. The old version of the test passed two deliberately broken controllers.
- A regression test for each finding in `tests/player.test.ts`.

### The body is as tall as it actually is

**Decision:** During a stance change, collision, headroom and sight use the body's actual height: its eye plus the target stance's head clearance, never less than the target height (`bodyHeight`). Visibility's stance factor is interpolated by eye height.

**Why:** The stance switched to the target at once while the eye eased down over up to 0.75 s. Diving prone at a crawl space let the body slide under a slab while the camera was still above it, then inside it. And pressing prone cut visibility by 70% on the first tick, for a body still standing.

### Smaller controller fixes from the second audit

- Standing and headroom use an exact circle test. The padded square floated the body on crates it wasn't touching and refused getting up beside table corners.
- A spawn stands where a body walking there would. Only a spawn inside something solid goes on top of it, and hand-built test worlds must say so (`spawnOnTop`), because the old behaviour quietly put tests on roofs.
- The edge of an overhang slides the body out from under it instead of freezing it; a body whose centre is under a ceiling it no longer fits beneath still stops.
- Footsteps come from the legs: a body shoved by a guard takes no steps, and a sudden slow-down no longer fires two steps 33 ms apart.
- Walking diagonally backward was 8% too fast; an instant stance time no longer locks the controller; headroom and movement agree at exact heights.
- The guards' body size and the shove limit are tuning values, and the pitch limit is one tuning value shared by the app and the simulation.
- These are deliberate behaviour changes: `SIM_VERSION` is 2, with new golden values. Generation is unchanged.

### Version control, CI and a playable link

**Decision:** The project lives in a private GitHub repository, `willgibs/sightline`, and `main` is always green.

- **Every push:** CI runs typecheck, all tests, the production build and a 20-minute recorded bot run on Linux.
- **Weekly, and on demand:** the same run repeats on macOS (Apple silicon) and Windows, and a final job fails unless all three platforms end on the same simulation hash. The first run matched on all three.
- **Deploys:** Vercel deploys every push to `main` to production at sightline-willgibs.vercel.app, and every other branch to a preview. Vercel Authentication is on, so only the owner's Vercel account can open them until he decides to share.

**Why:** The design doc's working model ends each phase with a playable link. CI turns "replays identically everywhere" from a claim into a check on every change. macOS and Windows runners are weekly because they cost 10× and 2× the minutes on GitHub's free plan, and the simulation uses only exactly specified arithmetic, so per-push Linux runs catch nearly everything.

### Sound behaves before it sounds good

**Decision:** A Web Audio engine (`src/audio/`) plays simulation events the way the simulation says sound behaves:

- **One hearing law** (`src/sim/sound.ts`), shared with guard perception from Phase 1: a sound is at the threshold of hearing at its radius, and 6 dB louder per halving of distance. Sounds fade out between 1× and 1.25× their radius. If you can hear it, a guard where you stand could too.
- **Delay** at the speed of sound (343 m/s, in tuning), so far footsteps and, later, shots arrive late.
- **Placement** with HRTF panning, and **muffling** (−7 dB and a 900 Hz low-pass) when terrain or anything bullet-proof blocks the straight path. Phase 1 replaces the straight path with sound that travels around buildings.
- **Your own body** plays centred at the level the simulation gives it, under the same law, so you can learn your noise by ear.
- **Every sound is procedural:** footsteps by surface and gait, cloth rustle, a wind bed, creek water and a generator hum.

**Why:** The design doc's audio direction asks for placeholder sounds with correct behavior in the wireframe phases. Lab C's exit test is that players predict their own noise, so the sound must carry the simulation's loudness faithfully.

**Calibration:** Measured raw, the voices varied by 13 dB at the same amplitude: a crouch on grass came out louder than a walk on dirt, which would teach the wrong thing. Per-surface, per-gait trims (`LOUDNESS_TRIM_DB` in `voices.ts`) now make every voice equally loud, within 0.1 dB, at the same amplitude. Level carries the simulation's loudness and timbre carries the surface. A browser test fails if the spread exceeds 2.5 dB.

### Browser tests run in real browsers

**Decision:** Tests that need Web Audio, WebGL or a browser's own JavaScript engine run through Vitest's browser mode with Playwright (`npm run test:browser`, config in `vitest.browser.config.ts`). Locally they run in Chromium; `BROWSERS=chromium,firefox,webkit` runs all three engines.

**Why:** The sound engine can only be measured in a browser: offline rendering renders the sound faster than real time and returns samples to check. The same harness will check that the simulation hashes identically inside Chromium, Firefox and WebKit.

**Note:** Measurements start 0.5 s into an offline render, because the limiter (a `DynamicsCompressorNode`) ramps its make-up gain in when a context starts. Measured from time zero, the distance law appeared to be 5 dB per doubling instead of 6.

## 2026-11-07 · Phase 0

### Every move resolves in a fixed order and always ends clear

**Decision:** `resolveMove` runs up to four passes, each in this order:

1. Guards, which are soft: they can shove you, by at most 8 cm a pass.
2. Terrain too steep at the destination: slide along its contour.
3. Static colliders, which are hard and always win.

Something that was above your head and is now in the way because the ground rose is a ceiling. It blocks the move instead of pushing you sideways. If anything still overlaps after the passes, you stay where you were.

**Why:** A fresh-eyes review found four ways to break the old single-pass resolver:

- climbing cliffs on momentum;
- being shoved through a fence by a guard;
- being thrown 2 m sideways under a ceiling;
- skipping the prone transition.

**Guarded by:** an invariant test over long bot runs, plus a regression test per bug. The invariant is: never under the terrain, never inside anything solid, never more than one step up per tick. Measured over 172,800 ticks across 8 valleys, the worst overlap was 3 × 10⁻¹⁴ m and the biggest rise per tick 0.443 m, under the 0.45 m step. The stay-where-you-were fallback never fired in normal play.

### Footstep noise follows actual speed, not the requested stance

**Decision:** Loudness and stride are interpolated from the body's real speed across the doc's four gaits: crawl, crouch, walk and sprint. The sight table's movement factor uses real speed too.

**Why:** Diving prone from a sprint used to make crawl-quiet footsteps at 4.8 m/s. Perception in Phase 1 has to hear what the body is doing, not what the player asked for.

### Prone changes can't be interrupted

**Decision:** A stance toggle pressed during the 0.75 s prone change is queued, latest press wins, and applied when the change finishes. Sprint stands you up from a crouch, unless you crouched while holding sprint. In that case, release sprint first.

**Why:** Holding sprint or tapping crouch skipped the transition entirely. Queuing keeps the cost of going prone real without eating the player's input.

### The simulation quantizes its own input

**Decision:** `Simulation.step()` quantizes whatever it's given (8-bit movement axes, 32-bit view angles) and keeps the result as `sim.lastInput`. `Recorder.record(sim, events)` stores that, and refuses to skip a tick.

**Why:** If live play used full-precision input while recordings stored quantized input, every replay would drift. Quantizing used to be the browser's job, and a caller that forgot to do it produced recordings that couldn't replay: 0.5 was stored as 64/127, and 1.5 wrapped the 8-bit value. Doing it inside the simulation makes live play and re-simulation identical for every caller, by construction.

### Hot reload knows which numbers matter

**Decision:** `worldTuningKey` covers everything generation reads, including `player.maxSlopeDeg`, which validation uses. `simTuningKey` covers everything the running simulation reads. Changing a view-only number such as fog or field of view no longer marks the run's recording as unreplayable.

### The whole simulation uses deterministic math

**Decision:** `src/sim` uses only exactly specified operations plus `detmath.ts` (`dsin`, `dcos`, `datan`, `datan2`, `dtanDeg`), built from `+ - * /` and `sqrt`. A test enforces this across the folder.

**Why:** A recording made in Chrome failed to re-simulate in Node. The cause was `Math.atan2` returning a different last bit in the two V8 builds, which nudged one guard's heading. Generation was already deterministic, but the simulation used native trigonometry. Recordings must replay anywhere: for bug reports, regression tests, and later for verifying daily-contract runs. After the switch, a 512-tick browser session re-simulated in Node bit for bit.

### Physics and raycasts are our own TypeScript, not Rapier

**Decision:** Collision, ground following and raycasts use a small TypeScript module (`heightfield.ts`, `colliders.ts`). Rapier stays out.

**Why:** A spike against `@dimforge/rapier3d-compat` on the TAL-4471 terrain cast 20,000 rays. Rapier took 150 ms; ours took 32 ms. Most of the gap is the per-call WebAssembly overhead. Rapier also adds about 2 MB and an async init (~40 ms). It splits each terrain cell along the opposite diagonal: hits agree to within 1 m 99.8% of the time, but drift up to 0.5 m at grazing angles. Our needs are a static heightfield plus boxes, cylinders and upright guards, and those are covered in about 600 lines. Those lines are deterministic, run headless and share the renderer's exact triangles.

**Revisit if:** Phase 3 needs dynamic rigid bodies such as ragdolls or physics-driven props.

### Navigation waits for lab E

**Decision:** No navigation library in Phase 0. Lab E starts with a deterministic grid A* over the heightfield cells (2.5 m), with obstacles rasterised from colliders and string-pulled paths. It moves to Recast (recast-navigation-js) only if guards need something the grid can't give.

**Why:** Guards don't path-find until Phase 1. A grid planner keeps the simulation deterministic and headless, with no WebAssembly.

### Mouse look runs at frame rate; everything else at 30 Hz

**Decision:** The camera's view angles update every frame from the mouse. Position, stance and everything simulated tick at 30 Hz and are interpolated.

**Why:** Look at 30 Hz feels sluggish; at frame rate it feels direct. Interpolating position adds up to one tick (33 ms) of visual latency to movement. That's acceptable for deliberate stealth movement, and lab C will judge it in play. If it feels late, the tick rate is one number in `tuning.sim.tickHz`.

### Recording format v1

**Decision:** The file starts with `SLRC` and a version, then four length-prefixed blocks:

- a JSON header carrying the seed, the full tuning, checkpoint hashes every 10 s and the final hash;
- inputs at 12 bytes per tick;
- states at 10 Hz (36 bytes plus 20 per guard);
- events at 28 bytes each.

**Why:** A 20-minute bot mission measured 2.65 MB, most of it state samples. Re-simulating it takes under 0.2 s. Checkpoints show where two runs diverge, not just that they did. The tuning is embedded, so a recording never depends on today's defaults.

### Terrain: one set of triangles, rendered in tiles

**Decision:**

- The heightfield is 1,280 m square at 2.5 m spacing (513 × 513).
- Physics, raycasts and the mesh all split cells along the (i, j)→(i+1, j+1) diagonal.
- The mesh is cut into 4 × 4 tiles for frustum culling.
- A coarse 6.4 km backdrop, tucked under the detailed terrain, carries the landscape to the horizon.

**Why:** What you see is exactly what you stand on and shoot over. Tiling cut visible triangles from about 1.0 M to 0.3–0.7 M depending on the view, with no visual change. Tiles are also where level of detail goes later.

### The wireframe look

**Decision:**

- Pale survey-model palette.
- Flat facets lit by one sun and a hemisphere ambient.
- Ground grid at 10 m and 50 m, contour lines at 5 m and 25 m.
- Hairline dark edges on structures and trees.
- Exp² fog (about 30% at 500 m).

Every solid uses the same lighting code (`materials.ts`), so props and terrain read as one world.

**Why:** It follows the ML-research-sim bar from the design doc: plain shapes and a legible world, with nothing competing with the behaviour. Contour lines also preview the tactical map.

### Validation counts overwatch by sector, not by ridge

**Decision:** A valley needs perches in at least 3 of 8 compass sectors, and the camp must be reachable on foot from at least 4 of 16.

**Why:** The first metric counted contiguous runs of perch directions, so a valley with perches all the way round counted as one ridge and failed. Sectors measure what the design wants: overwatch from several directions.

**Known gap:** Phase 0 valleys are gentle; under 2% of the play area is too steep to walk. Lab D adds cliffs and chokepoints so approach choices matter, and tightens these rules.

### Toolchain

**Decision:**

- TypeScript 7.0.2 (the native compiler), used only for type-checking.
- Vite 8.3.5 (Rolldown) and Vitest 5.0.5.
- three.js 0.186.1 and tsx 4.23.15.
- Versions are pinned exactly and were at least two weeks old when chosen.

**Why:** It's fast, code-only and headless-friendly, which the design doc's platform section asks for. The lockfile, generated by npm 11, includes every platform's native bindings, so `npm install` works on macOS, Linux and Windows.

**Note:** npm 10.9's fresh install (with no lockfile) crashes on Vitest 5's peer dependencies (`Cannot read properties of null (reading 'edgesOut')`). Installing with the committed lockfile works on npm 10 and 11.

### Generation fingerprint

**Decision:** `tests/world.test.ts` pins a fingerprint of everything TAL-4471 generates.

**Why:** Shared seeds and daily contracts depend on a seed always building the same valley, so any change to generation must be deliberate. Changes so far:

- Phase 0: fine relief lowered from 1.4 m to 0.9 m after ground-level screenshots showed noisy facets. Fingerprint `2ea333d491d7568c`.
