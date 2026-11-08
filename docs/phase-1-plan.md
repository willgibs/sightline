# Phase 1 · Core labs: the plan

Phase 1 builds five labs. Each lab is an isolated wireframe scene, built to its exit test before anything is integrated. The phase ends at the gate **Labs pass**, when every lab meets its exit test. Phase 2 then joins the labs into one core mission.

This is the working plan. Its checkboxes are kept current as work lands, and what a lab learns goes into its section, so nothing depends on anyone's memory.
- **What each lab builds:** its spec, starting numbers and **Done when** test come from Part 2 of the design doc (`docs/design-doc.md`).
- **What it starts from:** `docs/phase-1-handoff.md` says what is already in place.
- **This plan says:**
  - how the labs run;
  - what each one defines for the others;
  - how each exit test is measured.

Planned on Nov 7, 2026. The owner answered four questions, and an independent review of the first draft checked the plan against the code.

## Decided in planning

| Question | The owner's answer |
| --- | --- |
| How the labs run | In parallel, in two waves, after a short pass of shared seams on `main` |
| Who tests labs A and C blind | The owner alone, in two sittings per lab |
| Who reviews lab D's camps | A fresh agent, then the owner spot-checks three |
| The core mission's archetype | A compound, built as data so a logging camp or a comms relay can follow later |

**Sniping must not clear a camp from one place.** The owner found today's compound too easy to take apart from a single overlook:
- *"I love sniping as a core component of this, but [it] shouldn't be so easy as to take everyone out in a valley compound from a single overlook above."*

So:
- lab D validates that no single perch wins (D8);
- lab D's terrain overlooks the camp from a few sectors, not from a ring of ridges all round (D3);
- lab E proves that the camp's response stops a perfect shooter on the best perch (E12).

## How the labs run

| Wave | What runs | Opens when |
| --- | --- | --- |
| 0 · Seams | One session on `main`, one change at a time | Now |
| 1 | Labs A, B and D, each in its own session, branch and pull request | Wave 0 is on `main` |
| 2 | Labs E and C, the same way | A's percepts, beliefs and awareness ladder (A6, A7) are on `main` |

- **Wave 0** lands what more than one lab needs, before any lab branch opens, so no two labs build their own version of it.
- **Wave 1** runs the three labs that share the least:
  - A works in `sim/perception` and `sim/ai`;
  - B works in projectiles, content and instruments;
  - D works in `sim/gen`.
- **Wave 2** runs the labs that build on wave 1:
  - **E** acts on A's percepts.
    - E1 (navigation) needs only Wave 0's grid search.
    - E's later milestones need D4–D6 (the camp's systems and roles) and B4 (bodies).
  - **C**'s trials need A's shade and trial mode (A4, A12), and its carrying needs B's bodies (B4).
    - Its motor work needs nothing, but waits so that it's judged in a world with more gameplay, as the owner asked at the Phase 0 gate.
- **Why this order:**
  - the design doc's risk table puts perception first;
  - E's brains act on A's percepts;
  - C's exit test needs guards that see and hear;
  - D's camps feed E.

**A lab session** starts from:
- `CLAUDE.md`;
- `docs/phase-1-handoff.md`;
- this plan's section for its lab;
- the design doc's Part 2 sections for it.

It works on a branch named for the lab: `lab-a-perception`, `lab-b-shooting`, `lab-c-movement`, `lab-d-camps` or `lab-e-brain`. It opens a draft pull request early, because CI checks pull requests, not other branches.

## Landing on `main`

Several branches change the same goldens, versions and registries at once. Rules for landing:

- **One merge at a time,** from a branch that is up to date with `main` and green there. Two pull requests that are each green on their own can still leave `main`'s golden values wrong.
- **Goldens are regenerated after a rebase, never merged by hand.** That means:
  - `GOLDEN` in `src/sim/selftest.ts`;
  - `GOLDEN_TAL_4471` in `tests/world.test.ts`;
  - the golden recording (`npm run golden`).

  The golden recording also needs rewriting whenever the tuning's shape changes, not only on a version bump. `src/config/validate.ts` refuses a recording whose tuning has other keys.
- **The pull request lists every golden that moved, and why.**
  - Version numbers are taken at merge time: the next free one.
  - That covers `SIM_VERSION`, `GEN_VERSION`, `STATE_SCHEMA` and `RECORDING_VERSION`.
- **Changes that move every golden land alone and announced:** W0.2, D1, D9, C2 and A13. The other branches rebase onto each before their next merge.
- **The valley's behaviour moves only in announced commits.** Until then, a lab keeps its work in one of these:
  - its scene (`scene.systems`);
  - input the bots never give;
  - a `CampSpec` option.
- **Shared files are added to, not rewritten:**
  - tuning in the lab's own section of `tuning.ts`;
  - systems in their own phase;
  - HUD pieces in their own modules;
  - each new event type with a sample in `tests/events.test.ts`, which checks that every type round-trips.
- **The motor:** while lab C runs, it owns `src/sim/motor/`.
  - Other labs' motor changes (B5's bob, E7's riding) land one at a time.
  - They keep the motor's invariants (rule 10).

### Codes

Event types and command kinds are stored as one byte. Each lab takes new codes from its own range, so parallel branches can't collide. A test (W0.5) checks that codes are unique and inside their range. Today, events use 1–5, and `fire` is command 1.

| Codes | Owner |
| --- | --- |
| 10–29 | Lab A |
| 30–49 | Lab B |
| 50–69 | Lab C |
| 70–89 | Lab D |
| 90–129 | Lab E |
| 130–255 | Later phases |

## Who defines what

A concept that two labs need is defined once, by the milestone named here. The others build on it.

| Concept | Defined by | Used by |
| --- | --- | --- |
| Brains in the 'decide' phase, steering bodies through orders | W0.2 | A, E |
| Queries, spawning and despawning inside a tick | W0.3 | A, B, E, sandbox drops |
| Grid search: Dijkstra and A\* over both layers of the spatial grid, budgeted by iterations | W0.4 | A (hearing), D (analysis), E (navigation) |
| All seven guard roles; the code ranges | W0.5 | Every lab |
| Percept kinds and beliefs in `GuardMind`; the awareness ladder and the reaction delay | A | E (what each state does), C |
| Exposure from the observer's side (cone, distance, cover, skyline); shade drawn where `lightAt` finds it; trial mode | A | C, E |
| D's own sight model, in `tuning.gen` | D | Checked against A's detection |
| The body a killed guard leaves; the shot's sounds, with the crack as a path | B | A, C, E |
| Vitals: breath and heart rate, in one component | B | C extends it |
| The player's health and death | E (minimal combat) | Phase 2 |
| Camp systems as data, plus entity kinds for those with state: the generator, lights, alarm boxes, radio, vehicles, doors and the objective | D | E |
| The use action: carry, drag, sabotage | C | E |

## The three tools

- **Scenario runner** (A3). A scenario is a scene with parameters and an expected range, such as "crouched in shadow at 30 m: spotted in 3–6 s".
  - Its first table is the design doc's ranges.
  - It runs in `npm run scene` and in the tests.
  - C and E add their own scenarios.
- **Sandbox mode** (started in A10). Drop a noise, a shot or a body into a live run from the debug view, at up to 8×.
  - A drop is a command in the input, so a recording replays it (rule 5).
  - A10 adds noise drops and a hook for the time scale.
  - B8 adds shots, and E11 adds bodies.
- **Seed explorer** (D2), at `?explore`: a grid of camps showing their validation results, which D's later milestones extend with:
  - coverage heatmaps;
  - sightline graphs;
  - perch scores;
  - approach paths.

## Exit tests: how each is measured

The owner is the only tester. Each exit test that needs a person is built into its lab, so the lab records its own result.

### A · Testers predict detection 80% of the time in the honest view

- **Trial mode** in the perception lab draws trials from a seeded space of situations: the guard's role and gaze, distance, stance, movement, light, cover and skyline.
  - Each trial states what the player will do (for example, crouch-walk to the crate) and runs about 8 s.
  - The question is yes or no: will the guard see you before the trial ends?
- **There are two kinds of freeze.**
  - Some trials freeze at the start, before any cue, and are judged from the situation.
  - Others freeze at the first cue (a head turn, a bark, the edge indicator) and are judged from it.
  - Below 30% nothing shows, so start-frozen trials alone would test the rules, not the cues.
- **Balance:** half the trials end in detection, and half are borderline (one factor away from the other outcome).
- **A sitting** is 5 warm-up trials with the outcome shown, then 30 scored.
  - The browser scores them, shows the result, and saves each answer as an annotation in the recording, for `npm run playtest`.
  - There are two sittings a few days apart, each with a fresh set.
- **Pass:** 80% of the 60 answers, and at least 70% in each sitting.
- **Blind** means the honest view only, no outcomes or parameters ahead of time, and fresh trials. The owner knows the sight table, but on borderline trials the answer depends on reading shade, gaze and skyline in the honest view.
- **Agents pre-screen** each trial set by watching frames of the honest view, to catch unreadable cues before they cost the owner's time. They never count toward the pass.
- **Automated, in CI:**
  - The design doc's ranges:
    - spotted at about 150 m standing and moving in the open by day;
    - near invisible beyond 50 m still and prone in cover;
    - 3–6 s crouched in shadow at 30 m;
    - marksmen to about 400 m in a narrow cone.
  - The fairness rules:
    - every detection is telegraphed by a cue first;
    - every detection is explained by `explain(id)` back to its percepts;
    - the no-omniscience test holds for guards who do perceive.

### B · A 300 m shot at a walking target feels earned

- **The owner's call,** on the range, with about 10 minutes and 15 rounds. Two questions:
  - Is the 300 m walking shot earned and satisfying?
  - **Taste call 3:** keep realistic-lite (drop, travel time and wind, with assists), make it more arcade, or more simulation?
- **Supporting checks:**
  - time of flight (about 0.5 s to 400 m);
  - drop and wind drift against the reticle's mils;
  - shot telemetry in the playtest summary: range, lead and wind error, the part hit.

### C · Players predict their own noise and visibility

- **A's trial mode** runs noise trials ("will the guard hear this move?") and visibility trials, with the same protocol and the same pass mark. The design doc gives no number; 80% is proposed to match lab A.
- **The owner judges** whether moving feels deliberate, in the same sittings. That judgement was deferred at the Phase 0 gate.

### D · 90 of 100 seeds pass validation on the first try

- **`npm run seeds -- --count 100 --from <a held-out series>`:**
  - at least 90 camps pass at their first camp attempt, with no repair;
  - repair fixes the rest within its iteration budget.

  The default series is the one D tunes against, so the gate runs on another. Today's `attempt` counts re-rolls of the whole world (`src/sim/gen/world.ts`); D counts camp attempts and repairs separately.
- **The reviewer** is a fresh agent that hasn't seen the generator's code.
  - It works from what recon would show: the layout, the guards, their routes and timing. It doesn't see the generator's perch scores or paths, so the review isn't circular.
  - For each of 10 random camps, it writes the best plan as a signature:
    - the opening perch or approach;
    - the first target;
    - how the first cluster is split;
    - the tool or timing that does it.
  - No two signatures may match. The owner checks three.
- **The guard budget** of 16 at most is checked by count, not by time (rule 18).

### E · Escalation can be caused, contained and interrupted

- **Scripted scenarios** in the scenario runner:
  - a suspicion episode, caused and recovered;
  - a search, evaded;
  - an alarm, interrupted;
  - one overlook doesn't clear the camp:
    - a scripted, perfect shooter on the camp's best perch fires at whatever it sees;
    - the camp's response (cover from the shot's direction, perches swept, the alarm, the target's escape) stops it from finishing the objective.
- **Every reaction** has a chain of causes back to a percept, and the no-omniscience test covers the whole brain.
- **The owner** plays the camp-brain lab, with 5–8 guards, for 10–15 minutes.
  - Press M at any reaction the honest view doesn't explain.
  - Each mark is checked in the replay.
  - The target is zero.

## The owner's time

- **Each lab ends** with:
  - a playable link on the deployment (`?scene=<name>`, or `?explore`);
  - a short note of what to try;
  - one to three questions.
- **Sittings:**

  | Lab | Sittings |
  | --- | --- |
  | A | Two of about 12 minutes, a few days apart |
  | B | One of about 10 minutes, with taste call 3 |
  | C | Two of about 12 minutes, with a few minutes on feel |
  | D | One of about 10 minutes |
  | E | One of 10–15 minutes |
  | Gate | The report, and one last look |

- **The foundation pass's open check** folds into the first sitting. It runs on the owner's Mac and covers:
  - frame rate;
  - sound;
  - the runs the game keeps;
  - a replay.

## Milestones

### Wave 0 · Seams

- [x] W0.1 · This plan, and the pointers to it.
  - In the repository: `CLAUDE.md`, the README, the handoff and `decisions.md`.
  - In the design doc: its phase notes, a validation rule and its decision log (revision 37).
- [ ] W0.2 · Brains decide after perceiving.
  - The routine moves from the 'intent' phase to 'decide', and becomes an order.
  - 'decide' at tick N plans tick N + 1. 'intent' carries out the current order, with an initial order for tick 1.
  - Behaviour must not move: the `behaviour` goldens hold. The state does: `STATE_SCHEMA` 7, and the golden recording is rewritten.
  - The probe in `tests/perception.test.ts` moves to 'decide' with the brains.
- [ ] W0.3 · Queries and spawning inside a tick.
  - `TickContext` gains `query()`: the world, everything solid, and every body's shape as they stand now.
  - It also gains `spawn` and `despawn`, with the index and the solids kept current.
  - Today systems can't see bodies' shapes, and `sim.spawn` works only between ticks.
  - Behaviour doesn't change.
- [ ] W0.4 · Grid search over both layers of the spatial grid (`src/sim/world/grid.ts`).
  - Bounded Dijkstra and A\*, with a cost per edge.
  - Budgeted by iterations (rule 18), and deterministic.
  - Usable from generation as well as the simulation.
- [ ] W0.5 · Registries and roles.
  - The code ranges above, written into the registries, with a test that codes are unique and in range.
  - `GuardRole` gains marksman, radio operator, officer and target. The renderer's role tints follow; the test camp still uses three roles.

### A · Perception and awareness

Playable at `?scene=perception-lab`. Design doc: Enemy perception; Individual awareness and the reaction window.

- [ ] A1 · The lab scene.
  - It holds a sentry, a patrol, a marksman post, cover, shade, a skyline ridge, gravel and grass, and a generator.
  - It grows with each milestone.
  - Handmade worlds have no foliage yet (`gen/handmade.ts`), so the scene adds it or uses generated terrain.
- [ ] A2 · Sight: the detection meter.
  - Cone zones from the head, and distance.
  - Stance × movement × light (`perception/visibility.ts`, `env.ts`).
  - Cover, as the share of head, chest and feet in view; and the skyline.
  - Rates per second (rule 17), in `tuning.perception`.
  - Its debug overlay: cones at their real ranges, rays to the three parts, and the factors.
- [ ] A3 · The scenario runner (see The three tools). Scenes take no parameters today, and a recording's header names its scene by exactly `{name, version}` (`record/recording.ts`). Parameters therefore join the scene's identity.
- [ ] A4 · Shade and foliage.
  - The honest view draws shade where `lightAt` finds it. Today nothing is shaded, yet shade multiplies detection by 0.6.
  - A test holds the drawing to `lightAt` at sampled points.
  - Then: what foliage does to sight in both directions, with the renderer following.
- [ ] A5 · Hearing.
  - Sound travels along paths on the grid (W0.4), not through walls; obstruction fades it.
  - The steady sources in `world/ambient.ts` mask it.
  - A heard sound gives a guess, not a fix; its error comes from the guard's own stream.
  - The crack is a line source along the bullet's path (B8).
  - The player's speakers use the same path.
- [ ] A6 · Percepts and beliefs.
  - The percept kinds, and the last known position, with its uncertainty, in the mind.
  - The no-omniscience test extends to guards who perceive. Its two places must lie beyond every sense: marksmen see 400 m, and the overlook is about 330 m from the camp.
- [ ] A7 · The awareness ladder.
  - Curious from 30%, then suspicious, searching and combat.
  - Decay to a raised baseline, not to zero.
  - About 1.5 s to react to something alarming.
  - Minimal reactions show each state: look, walk to the believed spot, go back. E's brain replaces them.
- [ ] A8 · Cues in the honest view.
  - Head and body turn, and weapon raised.
  - A placeholder bark per state.
  - The detection indicator at the screen edge.
  - Then the fairness checks.
- [ ] A9 · The other stimuli, each wired in when its source is on `main`:
  - bodies and a comrade dropping (B4);
  - impacts (B4);
  - thrown objects (B9);
  - lens glint (B6);
  - open doors (D4).
- [ ] A10 · Sandbox mode: noise drops, and the time-scale hook.
- [ ] A11 · The budget: 16 guards perceiving within the frame budget (`npm run sim -- --profile`). Fast paths come only if it needs them: a still body skips the motor, and a distant guard skips perception.
- [ ] A12 · Trial mode, and the agents' pre-screen.
- [ ] A13 · Perception joins the valley (`SYSTEMS`), announced, with the version bump.
- [ ] Exit test, a note, a playable link.

### B · Shooting

Playable at `?scene=shooting-range`. Design doc: Weapons, tools and ballistics; Vitals (breath and heart rate). Taste call 3 is decided here.

- [ ] B1 · The range scene: firing points with a rest; targets walking routines across 100–500 m; flags and grass that show the wind.
- [ ] B2 · Content as data in `tuning.ts` (rule 16): the rifle, its ammunition and suppressor, the scope and binoculars, and the throwable.
- [ ] B3 · The ballistic model, realistic-lite.
  - Bullets live in the state tree, flown in the 'projectiles' phase with gravity, drag and the mission's wind.
  - Deterministic math only.
  - About 0.5 s to 400 m.
- [ ] B4 · Hits.
  - Each bullet's path is swept between two ticks' poses against each body part, the terrain and the colliders. Hit and impact events follow.
  - A headshot kills. A torso shot kills an unarmored guard, but may let the guard cry out first (drawn from the guard's own stream).
  - A killed guard leaves a body, spawned within the tick (W0.3).
- [ ] B5 · Bob: whether walking bodies bob in the simulation, and whether a shot leaves from the bobbing eye. Decided by measuring at 300 m; `motor/bob.ts` is ready.
- [ ] B6 · Instruments in the honest view, which today has no crosshair.
  - The scope, with its mil reticle and a zero dial in 100 m steps.
  - Binoculars with the rangefinder and a wind readout.
  - Lens glint toward the sun.
  - Marking waits for Phase 2, with the model of what the player has observed.
- [ ] B7 · Sway, breath and heart rate.
  - Sway is a pure function of state and time in the simulation (rule 14), so the shot goes where the drawn reticle points.
  - Prone is steadiest, and a rest helps.
  - Breath holds for about 4 s and recovers over about 6 s.
  - Heart rate rises with sprinting and close calls, and settles over about 20 s.
- [ ] B8 · The shot's sound.
  - The report at the muzzle, the crack along the path, the impact.
  - The suppressor cuts the report.
  - Crack and thump arrive apart, by distance; their voices are in the audio engine.
  - Sandbox shot drops.
- [ ] B9 · The throwable: its arc, and a landing sound that draws one guard.
- [ ] B10 · Hit confirmation, and shot telemetry in the playtest summary.
- [ ] Taste call 3, the exit test, a note, a playable link.

### C · Movement and body

Playable at `?scene=movement-lab`; the movement course stays as a regression test. Design doc: Player (movement, visibility and noise).

- [ ] C1 · The lab scene: the course grown into an arena with:
  - lit and shaded ground, and every surface;
  - a guard listening and one watching;
  - walls to mantle, a window, a ladder, and a body to carry.
- [ ] C2 · The prone body's real shape: a capsule along the facing for collision, not a 0.3 m circle. Turning prone needs room. It moves every golden (the fuzzing bot goes prone, `bots/chaos.ts`), so it lands alone.
- [ ] C3 · Lean: the eye and upper body shift sideways and roll, limited by what's beside them. Sight lines and hits see the leaning head.
- [ ] C4 · Mantle: a motor mode onto and over low walls, and through windows.
- [ ] C5 · Ladders: a motor mode, on D's towers, with links for E's navigation. Each new mode states its invariants in the motor's header and joins the invariant run (rule 10).
- [ ] C6 · The use action.
  - Carry or drag a body: slow, and noisy on gravel.
  - Hide it in foliage or a container, where guards don't see it.
  - E's sabotage uses the same action.
- [ ] C7 · The player's own light and noise: no meter beyond the drawn shade and your own footsteps, unless the trials fail without one.
- [ ] C8 · Noise and visibility trials, with A's trial mode.
- [ ] C9 · Feel: whether 30 Hz interpolation is responsive enough, and whether moving feels deliberate.
- [ ] Exit test, a note, a playable link.

### D · Camp generator

Playable at `?seed=<seed>` and `?explore`. Design doc: Maps and procedural camps. The core mission's archetype is a **compound** (owner, Nov 7). It's built as data, so a logging camp or a comms relay can follow in Phase 3.

- [ ] D1 · The one deliberate `GEN_VERSION` bump.
  - Scatter that depends only on seed and cell, so generated objects keep stable ids.
  - Range reduction for `dsin` and `dcos`, for |x| ≥ 10⁶ only. Both functions drive the simulation too, so a test shows that no simulation input reaches it and that the math golden doesn't move.
  - TAL-4471 gets a new golden.
  - It lands alone.
- [ ] D2 · The seed explorer, first version: a grid of camps with their validation results.
- [ ] D3 · Terrain with teeth.
  - Cliffs and chokepoints, so the choice of approach matters.
  - Overwatch from a few sectors 150–500 m out, not a ring of ridges all round.
  - Validation tightens.
- [ ] D4 · `CampSpec` and the compound, from handmade modules:
  - the gate and perimeter;
  - towers with ladders;
  - buildings with doorways, including the target's;
  - cover clusters;
  - the generator, the radio mast and alarm boxes;
  - vehicles, including the escape vehicle.

  Doors and vehicles are entity kinds with a `solid`.
- [ ] D5 · Systems: the generator powers the lights, the alarm boxes and the radio; the objective.
- [ ] D6 · Staffing.
  - All seven roles.
  - Sentries at chokepoints.
  - Patrols for coverage, timed to open and close windows.
  - Routines stay pure functions of time.
- [ ] D7 · Analysis on the grid.
  - Who sees whom over the routine cycle: the sightline graph and its clusters.
  - Coverage heatmaps and perch scores.
  - Lowest-exposure infiltration paths, exfil routes and the escape route.
  - Generation reads only `tuning.gen`, so its sight model is its own. A scenario-runner check holds it to A's detection at sampled points, so retuning A never changes a valley.
- [ ] D8 · Validation and repair.
  - The design doc's rules, plus **no single perch wins**. Starting values, for any one perch:
    - at most 60% of the guards are ever in view over the routine cycle;
    - the target is in view at most 25% of the cycle;
    - at least one guard in view is watched by a guard out of view, so a shot there is witnessed unless it's timed.
  - Repairs stop after a fixed number of iterations (rule 18).
  - Difficulty comes from cluster count and size.
- [ ] D9 · The valley switches to the generator, and the test camp retires. It lands alone.
- [ ] Exit test, a note, a playable link.

### E · Camp brain

Playable at `?scene=camp-brain`. Design doc: Enemy awareness and the camp brain; Adaptation, within a mission.

- [ ] E1 · Navigation on the grid search (W0.4).
  - A\*, with string-pulled paths followed through the motor.
  - Stepping around a cornered player.
  - Ladder links (C5).
- [ ] E2 · The lab scene: 5–8 guards with roles, an alarm box, a radio and a generator. It uses a handmade camp until D4–D6 are on `main`.
- [ ] E3 · The brain.
  - Utility scoring within each awareness state: investigate, call it in, take cover, flank, search.
  - It draws from its own random streams through the mind (rule 13).
  - It replaces A's minimal reactions.
- [ ] E4 · Beliefs spread.
  - By voice to guards nearby, heard through A's hearing.
  - By radio across the camp, after a delay (the schedule).
  - The radio needs a working set and an operator.
- [ ] E5 · The camp.
  - Alert levels: calm, uneasy, alert, lockdown.
  - The commander assigns search sectors and replaces missing patrols.
  - The pacing layer.
  - Searches end, and the camp settles one level up.
- [ ] E6 · Radio check-ins: the operator calls each post every few minutes. A dead post doesn't answer, and someone walks over.
- [ ] E7 · Alarms.
  - After the reaction window, a guard shouts, or runs 4–8 s to an alarm box or the radio. Lockdown is physical.
  - The core's sabotage, by default: hold the use key at arm's length to switch off the generator or cut the radio. Whoever passes or needs it notices the outage. The sabotage kit is Phase 3's.
  - At lockdown, the target escapes by vehicle. That needs bodies to ride moving solids (with C).
- [ ] E8 · Counter-sniper and reinforcements.
  - Marksmen scan their sectors.
  - After an unsuppressed shot, the camp estimates its direction from what it heard, and sweeps the likely perches.
  - Reinforcements arrive by truck after a delay, as a squad that hunts.
- [ ] E9 · Found bodies and adaptation within a mission, through A's perception.
  - A body found means alert.
  - Posture rises and stays up.
  - Repeated tricks lose effect.
  - Bodies in the open push guards off exposed sightlines.
- [ ] E10 · Minimal combat.
  - Guards engage, take cover and call support.
  - The player's health is two or three hits, and the player can die.
  - Phase 2 only joins labs, so this is built here.
- [ ] E11 · Sandbox body drops.
- [ ] E12 · The scenarios (see Exit tests).
- [ ] Exit test, a note, a playable link.

### Gate · Labs pass

- [ ] Every exit test passed, with its result recorded here.
- [ ] `docs/phase-1-report.md`, the owner's sign-off, and the design doc's phase notes and decision log updated.

## Gotchas found while planning

These add to the handoff's list.

- **Nothing is shaded.** The renderer draws no shadows, yet shade multiplies detection by 0.6. A4 fixes it before any trial.
- **The honest view has no crosshair, rangefinder or zoom overlay** (B6).
- **Generation reads only `tuning.gen`,** which is why D7 has its own sight model.
- **Scenes take no parameters,** and a recording names its scene by exactly `{name, version}` (A3).
- **Handmade worlds have no foliage** (A1).
- **The recording's 10 Hz state track stores five values per guard.** In-browser replays re-simulate, so a new guard cue needs only `GUARD_FIELDS` and `snapshot()` in `src/sim/sim.ts`.
- **`sightline.generate()` ignores the seed inside a scene.** The start screen also has no scene picker, so a lab is reached by `?scene=<name>`.
- **Time scaling exists only in the debug view,** with no automation hook (A10 adds one).
- **The fuzzing bot goes prone,** so C2 moves every golden.
- **People other than the owner can't open the deployment** (Vercel Authentication), should a lab want another tester later.

## Not in Phase 1

- **Phase 2:**
  - the mission flow, from brief to debrief;
  - the tactical map and marking;
  - scoring;
  - the debrief replay;
  - telemetry;
  - the UI's shape.
- **Phase 3:**
  - night, weather and gusts;
  - other tools and ammunition, and the sabotage kit;
  - penetration and helmets;
  - doctrine;
  - other archetypes and objectives;
  - art and production audio.
- **Horizons** are unchanged: see `docs/foundation-plan.md`.
