# Where the labs test less than the best idea on hand

A survey of the Phase 1 plan, the decisions log, the research and the design doc, checked against `src/sim` on Nov 8, 2026, just before the camp's equipment landed. Line numbers are from that moment and will drift.

**How to read this**

- Items are ranked within each section, best first.
- **Size.** Small: a parameter, a metric or a test. Medium: a new scene, bot or analysis pass. Large: a new system, or a change to a lab's contract.
- **Kind.** *Stand-in*: a minimum where a stronger idea is already written down. *Never built*: research or design recommended it. *Thin test*: the exit test can pass without proving the claim. *Unused*: something this architecture makes possible that nobody has used.
- **Pointers.** `plan` is `docs/phase-1-plan.md`, `decisions` is `docs/decisions.md`, `design` is `docs/design-doc.md`, `labs.md` and `foundations.md` are in `docs/research/`, and `notes/` is `docs/research/notes/`. Line numbers are at that commit.
- **Evidence.** All of this comes from reading. None of the proposed measurements has been run. Figures marked *worked from* are my arithmetic on tuning values, and claims about what a run would do are read from the code, not observed.

## What would change the most

1. **No guard can see a prone shooter on a ridge, and the commander's searches stop short of him.** E12's "nobody saw him or hit him" isn't a tuning miss. It follows from the stance cap, the search map's reach and the guards' aim (E1).
2. **Every rifle hit is heard camp-wide, suppressed or not.** The sightline graph, the game's first stated idea, has never been checked against what guards actually sense (D1).
3. **The chain inside the reaction window has about 0.2 s of slack, and has never been shot** (B1).
4. **The winning plan in E12 is one unsuppressed shot.** No bot relocates, chains, splits a cluster or fits the suppressor (E2).
5. **Certified ways in are verified against guards who ignore their own meter** (D2), and D's plan diversity against a camp that doesn't answer (D3).
6. **The trials state in words what the honest view is meant to show** (A1, C1), with a guard who never scans (A2).
7. **The camp's ellipse is calibrated, but only where its own model is true, and nothing measures whether it is any use** (E4).
8. **`restore` is used only for synctest and seeking.** Nobody has replayed a run from a saved tick with one thing changed (S1).

---

## Lab A · Perception and awareness

**A1 · The brief states the factors the honest view is meant to show.** *Small · Thin test*
- **Now:** every trial opens with a sentence naming the stance, the gait, the spot (so the light, the cover and the skyline) and the distance to the metre: "You crouch-walk in the tall wall's shade, 40 m from a sentry." The design's test is "using only the honest view", and the plan only says a trial states what the player will do. The reader and the rules-only predictor start from the same words, so drawn shade, the crest and any judgement of range go untested.
- **Stronger:** run the same trials with a brief that gives only the action, scored apart. The gap between labelled and unlabelled accuracy is what the world itself carries. The owner hasn't sat yet, so this is the cheapest moment.
- **Proves:** shade, skyline and range can be read at all. The research named these as the factors likely to fail because they have no visible correlate.
- **Source:** `src/sim/game/trials.ts:249-267`; design:203; plan:176, 193; decisions:271; `notes/labs/perception_and_detection.md:287`.

**A2 · The trials hold still what the game makes you read.** *Medium · Thin test*
- **Now:** one guard, a fixed gaze ("no head scan"), the view held on him, no optics (the scenario never arms the player), A7's minimal reactions rather than E's brain, one lab world. Camp sentries sweep ±50° on a 7 s period, and patrols walk, stop and turn. By the trial's own rule his head is legible only to about 75 m (*worked from* 0.115 m head radius, 58° view, 720 lines, 2 pixels), so past that the edge mark is the only cue, while a real player at those ranges holds 8× binoculars.
- **Stronger:** a second `TrialSpace` (generic since C8) drawing situations from generated camps: real routines and head sweeps, E's brain, sometimes a second guard in earshot, binoculars in the far trials. The key still comes from running it.
- **Proves:** prediction under the timing of a glance, which is the actual reading task. Item analysis gains the factors that matter there: phase of the sweep, walking toward or across.
- **Source:** `src/sim/game/scenes/sightScenario.ts:44-48`; `src/sim/game/trials.ts:273-274, 337-355`; `src/config/tuning.ts:231-232`; decisions:71-75, 320.

**A3 · A yes or no within 8 s hides the answer a player needs.** *Small · Thin test*
- **Now:** the meter fills in 2–8 s before movement scales it, and a still body fills at 0.4×, so many "not seen" answers mean "not yet". Scoring is balanced accuracy at one horizon.
- **Stronger:** also ask "when?" on seen trials (the research's suggestion), or score a second horizon. Report sensitivity and bias apart (d′ and criterion): an over-cautious reader and a careless one can both score 80%.
- **Proves:** whether the player's clock matches the meter: how long do I have?
- **Source:** `src/sim/game/trials.ts:119`; `src/config/tuning.ts:390, 413`; `notes/labs/perception_and_detection.md:286`; `notes/foundations/playtesting_and_user_research.md:157`.

**A4 · The crack's lie has only been measured as geometry.** *Small · Thin test*
- **Now:** the bench holds the crack's apparent origin 55–57° off the shooter. In the camp, "a crack points the wrong way and says so": the guard reports it with the worst allowed error (25°), so the commander is vague rather than misled. No scene fires a suppressed round, and no bot ever fits the suppressor.
- **Stronger:** the scenario the research described: a suppressed shot, and which side of the valley the camp searches. Then decide whether ordinary guards should believe a crack at face value.
- **Proves:** the mechanic the research called the richest by-product of honesty, a mistake the player can learn to cause.
- **Source:** labs.md:98, 148; `src/sim/game/benches.ts:791`; `src/sim/brain/brain.ts:683-704`; `src/sim/game/bots/` (no suppressor anywhere).

**A5 · Masking is steady, so no shot can be timed to it.** *Medium · Never built*
- **Now:** the only maskers are the creek and the hum, both constant. `deliverCrack` applies no masking at all. A 2,400 m report at 300 m beats the hum unless the listener is within about 1.2 m of the generator (*worked from* the 70 m hum and 17 dB). The design lists shots "during loud moments" and scores masked shots.
- **Stronger:** one periodic masker from the camp's own systems, a pure function of time (a generator that cycles, an engine on the routine), with D certifying its windows.
- **Proves:** a learnable timing window that comes from physics. The research's condition is rare, periodic and legible.
- **Source:** `src/sim/generation/ambient.ts:15-43`; `src/sim/game/perception.ts:242-281`; `src/config/tuning.ts:384, 450`; design:138; `notes/labs/sniping_balance_and_level_design.md:139, 311`; `notes/labs/hearing_and_sound_propagation.md:314`; foundations.md:27.

**A6 · Bearings by ear ignore the angle off the guard's facing.** *Small · Never built*
- **Now:** a flat 4° from each guard's stream, plus the place blur. The research has error growing off-axis (1° ahead, 15° to the side) and as clarity falls, so a guard who turned toward the first shot places the second better.
- **Proves:** repeated shots sharpen the estimate for a physical reason, which feeds relocation pressure.
- **Source:** `src/sim/brain/brain.ts:705-712`; `src/config/tuning.ts:582`; `notes/labs/hearing_and_sound_propagation.md:315-317`; labs.md:130.

**A7 · Crack-to-report ranging was recommended and never built.** *Medium · Never built*
- **Now:** a bearing has no range. A ring prior of 120–560 m supplies it, and E12's fix sits a median 83 m off.
- **Stronger:** a trained listener who hears both estimates range from the gap, R ≈ gap ÷ (1/c − 1/v̄).
- **Proves:** an honest source for the ellipse's long axis, and a second real reason to fit the suppressor (no report, no gap).
- **Source:** `notes/labs/hearing_and_sound_propagation.md:404`; `src/config/tuning.ts:579`; decisions:16.

**A8 · Finding a body has no meter, and no trial asks about it.** *Small · Stand-in*
- **Now:** any positive rate finds a body at once, so one glance across it is enough. "The strongest stimulus" isn't in any trial space, yet deciding where to leave a body is a core prediction.
- **Stronger:** a body-finding `TrialSpace`, and a decision on whether a body needs a dwell.
- **Source:** `src/sim/game/perception.ts:354-356`; design:193; decisions:260.

**A9 · Cue lead time is a floor, not a distribution.** *Small · Never built*
- **Now:** 1.5 s by construction, measured from the meter reaching 30%. The research asked for the distribution from the first *visible* cue, with its worst cases.
- **Stronger:** log it for every detection in bot and owner runs, counting only cues `legible` says could be read.
- **Source:** foundations.md:59; `notes/foundations/playtesting_and_user_research.md:235`; `tests/fairness.test.ts:52`.

**A10 · The range-legibility aids were recommended and never built.** *Small · Never built*
- **Now:** no shared rim term and no fading of edge lines with projected size in `src/render`. Not art: the wireframe's rule is that guards read at 300 m by silhouette and motion.
- **Stronger:** let the far trials' accuracy by range band decide whether it's needed.
- **Source:** foundations.md:101, 146; design:435; `notes/foundations/rendering_and_performance.md:255-261`.

---

## Lab B · Shooting

**B1 · The chain inside the reaction window has never been shot.** *Small to measure · Thin test*
- **Now:** the design says great play lives in that window: "chain the second shot inside it". The bolt takes 1.2 s and a witness reaches searching in 1.4 s, so a second press has about 0.2 s to move to another guard, hold and squeeze (*worked from* tuning). E12's own bot notes the bolt allows "about 1.5" between shots. D certifies chains at 0.75 s (D11). The range has no pair, the exit test asks about one walker, and nothing has shot a pair against guards who react.
- **Stronger:** a pair on the range and in a vignette (S4): two guards in mutual view at 300 m, a few metres apart. Measure the margin for a bot with a human re-aim time, and let the owner try it. Then set the bolt, the re-aim and the window on purpose.
- **Proves:** whether the design's signature skill exists, and whether a person can ever chain a cluster.
- **Source:** design:223; `src/config/tuning.ts:213, 216, 704`; decisions:346-347, 518; `src/sim/game/bots/overlook.ts:43`; `notes/labs/sniping_balance_and_level_design.md:315`; labs.md:67.

**B2 · "Earned" is measured by skipping one decision at a time on one kind of walker.** *Medium · Thin test*
- **Now:** a centred shot with each decision removed alone, on a straight crossing walker, in a known steady wind. Wind (0.60 mil) and ranging (0.46) barely clear the head's 0.38 radius. There's no dispersion: rested with the breath held, sway is 0.046 mil, so once four decisions are right the hit is certain. Camp targets stop 2–5 s at each waypoint, turn, and walk toward and away.
- **Stronger:** a scripted shooter with plausible error distributions for ranging, wind read, lead and press, swept over motion classes (crossing, oblique, stopping, turning) and each assist layer, giving hit-probability surfaces. Also count how often a generated camp's certified shots need a moving shot at all: a patient shooter can wait for the stop, so the exit test's lead skill may be optional.
- **Proves:** taste call 3 with numbers, and which decisions matter in combination.
- **Source:** plan:214, 594; `src/sim/game/ballisticsBench.ts:231-280`; `src/sim/game/scenes/shootingRange.ts:53-61`; `src/config/tuning.ts:229`; labs.md:106.

**B3 · The wind cue exists only on the range.** *Small · Thin test*
- **Now:** the sitting says "read the wind from the flags". The `'flag'` structure is placed only by the shooting range, and generated camps have none. Wind is one of the four decisions.
- **Stronger:** have the generator place wind cues readable from the perches, or test the wind decision at a camp's actual view.
- **Source:** `src/sim/game/scenes/shootingRange.ts:210`; `src/sim/generation/camp.ts:23`; `src/render/windCues.ts`; design:125; plan:584.

**B4 · The heart never reacts to being shot at.** *Small · Stand-in*
- **Now:** `startle()` exists for "the close call lab E calls when guards shoot back", and nothing calls it. The design has taking fire and close calls raising the heart rate. The shot is only ever judged calm.
- **Stronger:** wire it to hits and near misses, and try a raised-rate shot in the sitting.
- **Source:** `src/sim/body/vitals.ts:98`; `src/sim/game/combat.ts:74-79`; plan:565; decisions:663; design:106.

**B5 · The miss breakdown is a calculation, not a test.** *Small after S1 · Unused*
- **Now:** `telemetry.ts` attributes each miss analytically.
- **Stronger:** fork at the shot and re-fire with each error corrected in turn: would it have hit? Errors that cancel stop being misattributed.
- **Source:** `src/sim/game/telemetry.ts:11-26`; plan:215.

**B6 · A leg shot always kills.** *Small · Stand-in*
- **Now:** "lab E may make it a wound", and it didn't. A wounded guard who calls out is a cost of imprecision the design already implies for torso shots.
- **Source:** plan:543; design:127.

---

## Lab C · Movement and body

**C1 · The noise trials tell you the ground.** *Small · Thin test*
- **Now:** "You crouch-walk on gravel, 7 m from a sentry with his back to you, a generator running a few metres from him." The surface audit made the ground readable, and the exit test then names it. Half the trials freeze before the player has heard a step on it.
- **Stronger:** the action only, read from the drawn ground and your own steps, scored apart (as A1).
- **Proves:** "from stance and surface" as the design says it: perceived, not told.
- **Source:** `src/sim/game/movementTrials.ts:114-117`; design:109; decisions:169-171.

**C2 · Only footsteps on open ground are in the trial space.** *Small to Medium · Thin test*
- **Now:** one guard, one flat field of one surface, the player on an arc, no wall or corner. Carrying, dragging, mantling, landing, ladders and doors each have their own loudness, and none is in a trial. Neither is the hearing lab's path around a building or its through-wall loss, which is where a straight-line intuition fails.
- **Stronger:** extend `NOISE_SPACE` with those sources, and with a guard around a corner or behind a wall.
- **Proves:** prediction of the noises that decide real routes ("slow, and noisy on gravel").
- **Source:** `src/sim/game/scenes/noiseScenario.ts:16-41, 51-59`; decisions:169, 182, 224; design:95, 185.

**C3 · Let the player choose.** *Medium · Thin test*
- **Now:** the driver moves the player, who answers yes or no. The claim is about predicting your *own* noise.
- **Stronger:** a method-of-adjustment trial: "walk past him as close as you dare", "cross at the fastest gait he won't hear". Score the signed error in metres or gait steps against the simulation's answer.
- **Proves:** a calibration curve with direction (over-cautious or careless), and far more information per trial than one bit.
- **Source:** plan:219-220; `notes/foundations/playtesting_and_user_research.md:157`.

**C4 · A carried body adds nothing to exposure.** *Small · Stand-in*
- **Now:** carried, it is out of every sight line. The research has the load adding to the carrier's exposure.
- **Source:** decisions:185; `notes/labs/movement_and_body.md:250`.

**C5 · "Hidden" is a flag, not the foliage law.** *Small · Stand-in*
- **Now:** a body put down in foliage drops out of every query. A half-hidden body behaves like a fully hidden one, where A's transmittance is already there.
- **Source:** decisions:183; plan:670; `notes/labs/movement_and_body.md:253`.

---

## Lab D · Camp generator

**D1 · The sightline graph has never met the simulation.** *Small to measure; Large if it changes the puzzle · Thin test*
- **Why it matters:** "the camp's puzzle is who can see whom" is the design's first idea. `tests/` holds D's model of the *intruder's* sight to A (112 points) and has no test of witness edges against the simulation.
- **Three disagreements, from reading:**
  - **Witness range.** D uses 80 m in the core and 30 m in the periphery ("Lab D's own, until lab E's brain says how guards take it"). A's real law for a falling body is any positive rate on a standing body: 150 m core, 25 m periphery, 400 m in a marksman's cone. In a compound 88–104 m a side, that's a different graph.
  - **Sound.** D's graph has none. A hit's `impact` has a 650 m radius, chosen so the thump carries back to the shooter. It's heard as a shot, and a shot raises any listener to searching whatever its clarity. A suppressor doesn't touch it. So an unwitnessed kill isn't a quiet one, and a "window" doesn't mean what it's certified to mean. The Clean grade rests on this.
  - **The rifle** (D11, B1).
- **Stronger:** a scene that takes certified window and chain kills in a live camp, with a bench metric: guards reaching searching within 5 s, by which percept. Then a decision on how far a body hit should carry.
- **Proves:** whether who-sees-whom decides anything once guards can hear.
- **Source:** design:75, 332; `src/config/tuning.ts:169, 726-732`; `src/sim/game/perception.ts:345-356`; `src/sim/perception/stimuli.ts:29-31`; `src/sim/perception/awareness.ts:76-78`; `src/sim/game/shooting.ts:319-322`; `src/sim/generation/field.ts:76-86`; decisions:258-261, 515.

**D2 · Certified ways in assume guards ignore their own meter.** *Small · Thin test*
- **Now:** `--simulate` keeps every guard on routine "even if they notice", and a certified way may fill the meter to 85%. A real guard turns at 30%, which changes the very exposure the path was certified against.
- **Stronger:** run the same paths with the brain on, and report how many hold. Add a certificate class that stays under the 30% cue.
- **Proves:** that "certified" survives contact with guards who react.
- **Source:** `src/headless/plans.ts:346-350`; `src/config/tuning.ts:207`; plan:822; decisions:451.

**D3 · Diversity and regret are computed with no camp response.** *Medium · Thin test*
- **Now:** "Nothing here fires a shot." The 77-of-90 regret result is on D's model, and the reviewers' plans were fired at guards on routine. Nothing has shown that sabotage "materially changes the camp" in a live run: on one held-out series the bots' best plan was long range in 63 camps and infiltration in 37, never systems.
- **Stronger:** run the restricted-play plans in the live camp (E13 now exists), and run the same plan with and without the generator cut.
- **Proves:** that the three approaches are distinct and viable against the real brain.
- **Source:** `src/sim/generation/plans.ts:17-18`; `src/headless/plans.ts:281-284`; decisions:436-453, 486; design:343.

**D4 · A certified window that can't be watched isn't a plan.** *Medium · Never built*
- **Now:** the bots read the routines, and the reviewers' briefs give routes and timing as recon "would show". Nothing asks whether a player could learn them.
- **Stronger:** a recon-observability score from D's own viewsheds and routines: for each camp's best plans, the vantages a player can reach that reveal each window, and the minutes of watching needed across the 160–300 s cycle. Flag camps whose best plan depends on a guard no safe vantage sees. This is a static check, not the Phase 2 ledger.
- **Proves:** pillar 3, "the player who watched longer holds the advantage", which has no measure today.
- **Source:** design:23; foundations.md:52; `notes/foundations/stealth_and_systemic_design.md:248-255`; `notes/labs/procgen_and_level_analysis.md:405`; plan:236.

**D5 · Relocation is a straight line at 2 m/s.** *Small to Medium · Stand-in*
- **Now:** certification moves a shooter between perches by straight-line distance, across cliff bands and exposed ground. The research asked for a relocation network linked by dead ground.
- **Stronger:** real walking routes between perches on the map grid, with their exposure, and at least one linked pair required. E2's relocating shooter needs it.
- **Source:** `src/sim/generation/clusters.ts:296`; `src/config/tuning.ts:217`; `notes/labs/sniping_balance_and_level_design.md:194`; labs.md:142.

**D6 · Alarm runs aren't checked for interceptability.** *Small · Thin test*
- **Now:** boxes are hidden from the overviews, rightly, and the target's escape must be interceptable. Nothing asks the same of a runner's last metres, and the design calls dropping the runner a real play. Hiding the box may hide the end of the run.
- **Stronger:** for each guard within reach of a box, the share of his run some perch sees.
- **Source:** decisions:469; `src/config/tuning.ts:543`; design:234.

**D7 · One way in is all that's certified.** *Small to Medium · Never built*
- **Now:** existence. Pillar 1 says no golden path, and the research kept random trees only to estimate how many routes exist.
- **Stronger:** re-run the safe-interval search with the used corridor blocked, and count disjoint ways.
- **Source:** labs.md:122; `notes/labs/procgen_and_level_analysis.md:325`; design:21.

**D8 · Timing slack isn't reported.** *Small · Unused*
- **Now:** margin is in meter levels. Of 42 ways peaking under 75%, 41 held; of 58 close calls, 47.
- **Stronger:** slack in seconds from the search's own intervals, and re-runs with each leg delayed 0.5, 1 and 2 s. A window that needs frame-perfect play isn't playable.
- **Source:** decisions:451; `src/sim/generation/infiltrate.ts`.

**D9 · Paired patrols don't exist.** *Medium · Stand-in*
- **Now:** the design has patrols "often in a pair", "his partner notices fast", and a missing partner giving you away. Staffing puts two patrols half a period apart. It's the canonical moving mutual pair, and the natural subject for B1. Blacklist's rule for a silent comrade was recommended and isn't built.
- **Source:** design:193, 248; decisions:552; labs.md:31; `notes/labs/guard_and_camp_ai.md:196`.

**D10 · Perch scores ignore the sun.** *Small · Stand-in*
- **Now:** glint depends on one fixed sun (south-west, 35° up), so some ridges cost you and others don't. No perch score reads it. A free, learnable difference between ridges.
- **Source:** `src/sim/kernel/env.ts:32`; `src/config/tuning.ts:745`; `src/sim/game/perception.ts:390`; `src/sim/generation/perches.ts`.

**D11 · Numbers D copied from other labs have drifted, and nothing checks.** *Small · Stand-in*
- **Now:** generation reads only `tuning.gen`, on purpose, and `campSight.test.ts` holds its sight law to A's. Nothing holds the rest: 0.75 s between shots against B's 1.2 s bolt, the target's run at 5.5 m/s against E's 4.6, the witness ranges above. At the analysis's sampling, 0.75 s is 2 samples against a reach of 3; the real bolt is 3 of 3, with nothing left to re-aim (*worked from* `dt` 5/9).
- **Stronger:** one test per copied value against its source.
- **Source:** `src/config/tuning.ts:197, 216, 547, 704`; `src/sim/generation/clusters.ts:212-213`.

**D12 · A "distraction" certificate has no tool at range.** *Small · Stand-in*
- **Now:** certification turns a witness's eyes away for 6 s. From a perch the only distraction is a deliberate miss, which A9 makes a shot; a stone carries about 17 m (*worked from* 13 m/s).
- **Source:** `src/sim/generation/clusters.ts:214`; `src/sim/perception/stimuli.ts:29-31`; `src/config/tuning.ts:749`.

**D13 · The one risk metric validated against people wasn't adopted.** *Small · Never built*
- **Now:** Tremblay's distance-to-guard metric matched human judgement. D's risk is meter-based.
- **Source:** labs.md:17, 118; `notes/labs/procgen_and_level_analysis.md:327`.

---

## Lab E · Camp brain

**E1 · The camp has almost no way to reach a shooter on a ridge, by construction.** *Medium; needs an owner decision · Thin test*
- **Why it matters:** the design promises "the fear of being taken down yourself" and "staying put after firing is dangerous". E12 found nobody saw or hit him, and that the reaction "doesn't yet make getting away any harder". The code says it can hardly do otherwise:
  - **Sight.** Stance caps every zone, a marksman's too. Prone, his 400 m is 120 m, or 180 m against the sky (*worked from* tuning). The placed ridges stand 240–420 m out.
  - **Reach.** The search map stops 160 m from the camp's centre, so a shot's report falls off it and the commander's search teams can't be sent to a ridge. The exceptions are a guard who walks out on his own, at a low weight, and the reinforcement squad, ordered to the believed spot 90 s after lockdown. E12's watch of two minutes ends before that squad could walk there, and up close a prone man is still capped at 45 m.
  - **Aim.** Every role has the same 1.1° spread, about 5.8 m at 300 m (*worked from* tuning).
  - **Firing.** It adds no visual stimulus. A lens flash is the only one, and it only makes a guard suspicious.
  - **Alarm.** On hearing a shot only workers run for a box. Armed guards need combat, which needs a confirmed sighting. So what stops the perch is whichever workers are left.
- **On the parked marksman question:** the reason given for leaving marksmen on towers ("a tower already overlooks 98% of perches") looks like the clear-line test in `validate.ts`. It can't be A's sight law. This doesn't argue for moving them; it says the measure doesn't support the conclusion.
- **Stronger:** decide what reveals a shooter. Candidates: a firing signature that lifts the stance cap for a moment (less when suppressed), a sweep of a believed perch that lifts it, D's perch list, a search window centred on the fix rather than the camp (the research's bounded window), flares. Then bench the claim itself: the chance he's found within 60 s if he stays, against moving 30 m and 100 m.
- **Proves:** "shoot, then relocate".
- **Source:** decisions:16-20, 34; plan:940; design:261-265; `src/config/tuning.ts:389, 407, 594, 657`; `src/sim/perception/sight.ts:349-376`; `src/sim/brain/searchMap.ts:53-69`; `src/sim/brain/commander.ts:65, 227-233`; `src/sim/game/comms.ts:254-260`; `src/sim/game/combat.ts:39-45`; `src/sim/brain/brain.ts:386-387, 397-400`; `src/sim/generation/validate.ts:195-201`; `notes/labs/guard_and_camp_ai.md:186-189`.

**E2 · "A planner wins" is one unsuppressed shot.** *Medium to Large · Thin test*
- **Now:** the plan's positive case is a shooter who "relocates, splits clusters and times shots". `plan=timed` fires at the target from one perch, using the analysis's knowledge of who is watching. No bot relocates, chains, or fits the suppressor, so the "perfect shooter" isn't perfect either.
- **Stronger:** a ladder of scripted plans over the same camps: careless, timed, suppressed, chained pair, relocating, sabotage first. Keep the perfect shooter, with a suppressor (one parameter). The ordering of outcomes tests "good loses, great wins" directly.
- **Proves:** pillar 2, which has no measure today.
- **Source:** plan:251, 883; `src/sim/game/bots/overlook.ts:76-113`; `src/sim/game/shooting.ts:146`; `src/config/tuning.ts:708`; design:22.

**E3 · After an incident the windows come back exactly.** *Medium · Stand-in*
- **Now:** task kinds are investigate, search, check, sweep and cover. Check-ins speed up, the level's floor rises and eyes sharpen, and then each guard returns to the same pure function of time. The design has paired patrols and sentries facing the likely threat, and posture that "rises and stays up".
- **Stronger:** posture as data that re-phases or re-faces routines, still pure functions of time and posture, so D can certify each posture's windows.
- **Proves:** that a camp remembers in a way a player can see and must plan around.
- **Source:** `src/sim/brain/camp.ts:45`; `src/sim/game/comms.ts:183`; design:231, 281; plan:929.

**E4 · Calibrated isn't the same as useful.** *Small · Thin test*
- **Now:** the 39% and 86% come from injected, unsuppressed report events, from perches drawn from the commander's own ring prior, on a handmade camp. The estimator is tested where its model is true. A wide ellipse can be perfectly calibrated. In generated camps the fix is a median 83 m off.
- **Stronger:** add sharpness (distance from truth, area at two sigma, tightening per shot) and run on generated camps, suppressed included. Replace the ring prior with D's perches and the victim's lines of sight, static data a mind may read.
- **Proves:** that the camp's estimate can drive anything.
- **Source:** `src/sim/game/benches.ts:427-457, 580-601`; `src/config/tuning.ts:579`; decisions:16, 89-99; labs.md:130; `notes/labs/guard_and_camp_ai.md:280`; `notes/labs/sniping_balance_and_level_design.md:125`.

**E5 · An alarm has been interrupted once, with two guards.** *Small · Thin test*
- **Now:** `script=alarm` is a gate sentry and an operator on the handmade camp, seed 0, shot by a perfect bot.
- **Stronger:** on generated camps, sweep the moment of the interruption across the run (S1). Report the interruptible window in seconds and the share of runners a perch can reach.
- **Proves:** "interrupted" as a number across camps.
- **Source:** `src/sim/game/scenes/campScenario.ts:150-176, 341`; plan:248.

**E6 · Cover doesn't know where the shooter can see.** *Medium · Never built (a means to a tracked gap)*
- **Now:** cover within 12 m "rarely hides a guard from a ridge", and three attempts made things worse. "It doesn't hold on every camp" is tracked in E12; the means below isn't.
- **Stronger:** Killzone's reasoning, from D's per-perch viewsheds over the camp raster: dead ground and interiors relative to the believed perch, and Blacklist's group answer to an unreachable shooter (retreat if he keeps killing).
- **Proves:** a camp that stops feeding a perch, rather than a target who runs.
- **Source:** decisions:18; `src/config/tuning.ts:597`; labs.md:33; `notes/labs/guard_and_camp_ai.md:280`; `src/sim/generation/perches.ts`.

**E7 · The evader never tries.** *Small to Medium · Thin test*
- **Now:** competence is measured on one policy: a crouched creep outward along a fixed route, on the handmade camp.
- **Stronger:** an adversarial evader that picks from every hiding spot the search map leaves cold. Report the share of hiding spots still safe when the search ends.
- **Source:** `src/sim/game/baselines.ts:38-47`; labs.md:130.

**E8 · Pacing has slots, not a shape.** *Small · Never built*
- **Now:** role slots by level. Ending a search clears every task at once. The research asked for a relax window and staggered stand-downs (the ladder's ±25% covers only part).
- **Source:** `src/sim/brain/commander.ts:237-246`; foundations.md:79, 87; `notes/foundations/adaptation_and_directors.md:325`.

---

## Shared trial machinery

**S1 · Fork a run at any tick, change one thing, compare.** *Medium · Unused*
- **Now:** `saveState` and `restore` serve only the synctest, seeking and tests. `explain(id)` gives provenance, the chain that happened, and not necessity, whether it would have happened anyway.
- **Stronger:** a headless command that takes a recording and a tick, makes one intervention (drop an event or percept, move a body, patch a tuning number, reseed a stream, flip one input), re-steps the remaining inputs, and reports the first difference and the outcome.
- **Proves:** but-for causes. It gives B5, D8, E5 and S2 and S3 their tool.
- **Source:** `src/sim/kernel/sim.ts:266`; `src/sim/kernel/synctest.ts:87`; `src/sim/kernel/record/seek.ts`; `src/sim/perception/explain.ts`.

**S2 · Separate luck from decisions with the per-entity streams.** *Small after S1 · Unused*
- **Stronger:** rule 3 gives every entity and purpose its own stream, so one can be reseeded alone. Run the same plan over the guards' dice, one purpose at a time.
- **Proves:** a plan's success probability on one camp, and which dice decide it. Today's figures mix that with differences between camps.
- **Source:** CLAUDE.md rule 3; decisions:95-99.

**S3 · No-omniscience after contact.** *Small after S1 · Unused*
- **Now:** every probe has the player beyond all senses from the start. The Last of Us's cheat lived after contact.
- **Stronger:** fork at the last percept, move the unsensed player, and require identical minds until the next percept.
- **Source:** `tests/perception.test.ts:103-139`; `tests/commander.test.ts:252`; labs.md:75.

**S4 · A cross-lab vignette set.** *Medium · Thin test*
- **Now:** scenes are either one lab (sight, noise, the range), scripted with 2–3 guards, or a whole camp. Between those, almost nothing tests systems meeting at small scale, which is what the owner asked for.
- **Stronger:** 20–40 s parameterized scenes of 2–4 guards where two or more labs interact, each with a bot and an assertion, each run over many seeds: the pair shot, a suppressed kill, a body on a patrol's route, the check-in clock after a kill, a runner intercepted, a crack that misleads, a stone that splits a pair.
- **Proves:** dynamic conditions at small scale, before Phase 2 joins everything.
- **Source:** `src/sim/game/scenes/campScenario.ts:341`; plan:152-155; design:9.

**S5 · An experiment runner with intervals.** *Small to Medium · Never built*
- **Now:** an owner's call rests on E12's 30-camp numbers, and I found no command in the repository that reproduces them: the bench pins 3 camps, and the series name appears nowhere in `src`. "Tuning this blind was the wrong tool."
- **Stronger:** N camps by tuning patches, paired by seed, with confidence intervals and early stopping, as one command. The research placed statistical gates in Phase 2; lab work needs them now.
- **Source:** decisions:9-20; `src/sim/game/benches.ts:547`; foundations.md:125, 161; `notes/foundations/playtesting_and_user_research.md:170`.

**S6 · Fuzz the brain.** *Small to Medium · Unused*
- **Now:** `npm run fuzz` covers valleys, the movement scenes and towers. `live-camp` isn't in it, and the chaos bot never fires.
- **Stronger:** the live camp under a firing bot, with brain invariants: every search below lockdown ends, no guard is stuck for long, tasks stay bounded, every reaction has a cause.
- **Source:** `src/headless/fuzz.ts:47, 68-70`; `src/sim/body/invariants.ts`.

**S7 · Belief against truth, every tick.** *Small · Unused*
- **Stronger:** a bench-side curve of the distance between what the camp believes and where the player is. "Re-found" is one bit; this shows whether the camp converges and what relocation does to it. It's early data for the debrief.
- **Source:** `src/sim/game/baselines.ts`; foundations.md:71.

**S8 · Which knobs matter.** *Small · Unused*
- **Stronger:** nudge each number in a lane's tuning by ±5%, run its bench, and rank what moves the exit metrics. It finds dead knobs and fragile ones, and a test already does the reverse for generation.
- **Source:** decisions:1187; CLAUDE.md rule 4.

**S9 · The intention check.** *Small · Never built*
- **Stronger:** in E's and D's sittings, the tester writes a one-line plan after recon, and the replay shows whether it unfolded as stated. The research proposed it to make the pillars falsifiable.
- **Source:** foundations.md:29.

**S10 · A minimizer for failing recordings.** *Small · Never built*
- **Stronger:** delta-debug a failing recording down to seconds. It speeds debugging and proves nothing new, so it ranks low.
- **Source:** foundations.md:111; `notes/foundations/determinism_and_replays.md:234-236`.

**S11 · A stronger "perfect shooter" by search.** *Large · Unused, and near a parked idea*
- **Stronger:** beam search over shooter actions using rollback on the real simulation, in place of a script. The parking lot holds *learned* bots hunting exploits; this isn't learned, but it's close in spirit, so it's the owner's call.
- **Source:** foundations.md:52; design:608.

---

## Left out on purpose

**Tracked already:** the owner's questions for A, D and E; C9; the exit-test sittings; E12's open items (the seed search on the bench, repeated cover orders, "doesn't hold on every camp"; E4 and E6 offer stronger means to the last, and say so).

**Parked with a reason:** moving marksmen off towers (E1 questions the measure, not the decision); bending a lying body's legs; walking bob; a kill cam; C7's body cue unless the trials fail; bodies riding moving solids; everything in Phase 2 (the knowledge ledger, map, debrief, scoring, naive testers) and Phase 3 (gusts, night, weather, penetration, helmets, doctrine, other tools); learned bots.

**Looked at and dropped as nice-to-have:** a vertical limit on guards' sight; the report's directional gain; a sequential test between sittings; per-kind senses; recoil hiding the strike (at 7 mil against a scope about 63 mil across, it doesn't).
