# Phase 1 · Core labs: the plan

Phase 1 builds six labs (the sixth, F, added on Nov 8). Each lab is an isolated wireframe scene, built to its exit test before anything is integrated. The phase ends at the gate **Labs pass**, when every lab meets its exit test. Phase 2 then joins the labs into one core mission.

This is the working plan. Its checkboxes are kept current as work lands, and what a lab learns goes into its section, so nothing depends on anyone's memory.

**Where everything else lives:**
- `docs/design-doc.md`, Part 2: what each lab builds, its starting numbers and its **Done when** test.
- `docs/phase-1-handoff.md`: what is already in place.
- `docs/foundation-shape.md`: the shape every lab builds into. A narrow kernel, lanes whose contracts are enforced by tests, and a bench for every lane.
- `docs/research/`: the seeds each lab starts from.
- `docs/pillars.md`: the owner's three pillars (world, camp, player), and the camp as a system that takes inputs.
- `docs/camp-engine.md`: Lab F's design: how a camp fights back, as engines, and sandboxes as development instruments for proving them.
- `docs/lab-opportunities.md`: where each lab tests less than the best idea on hand, ranked, with sources.

This plan covers how the labs run, what each one defines for the others, and how each exit test is measured.

**Research is a seed, not a ceiling.** Each lab:
1. starts from the strongest technique the research found;
2. says where it falls short for Sightline;
3. builds past it;
4. proves the gain on its lane's bench.

Each lab's section below names its seed and its target. A lab records its bench numbers against both before calling itself done.

Planned on Nov 7, 2026. The owner answered eight questions, an independent review checked the first draft against the code, and fourteen researchers gathered the prior art.

## Decided in planning

| Question | The owner's answer |
| --- | --- |
| How the labs run | In parallel, in two waves, after a pass of shared seams on `main` |
| Who tests labs A and C blind | The owner alone, in two sittings per lab |
| Who reviews lab D's camps | A fresh agent, then the owner spot-checks three |
| The core mission's archetype | A compound, built as data so a logging camp or a comms relay can follow later |
| The foundation's shape | As proposed in `docs/foundation-shape.md`: Wave 0 gains the kernel boundary, benches, mechanical landing and determinism hardening |
| Lab A's sight factors | Stance and light become range caps, and peripheral vision a short-range zone. Time grows linearly with distance inside each zone, and edges ramp rather than cliff. The design doc's ranges stay; its multipliers become starting values. |
| Hearing | One law of sound for guards and the player's speakers. Anything unfair gets a cue, never a bias. |
| The player's light | The light at the ground beneath the body, which is what the player can see, as in Thief |

**Two directions from the owner shape everything below.**
- **Aim past prior art.** Build the pinnacle of each lane, not the best of what others have shipped.
- **One foundation for many games.** It should carry many games and features, each lane improving on its own.

**Sniping must not clear a camp from one place.** The owner found today's compound too easy to take apart from a single overlook:
- *"I love sniping as a core component of this, but [it] shouldn't be so easy as to take everyone out in a valley compound from a single overlook above."*

So:
- lab D validates that no single perch wins (D8);
- its terrain overlooks the camp from a few sectors, not from a ring of ridges all round (D3);
- lab E proves the rule from both sides (E12): the camp's response stops a perfect shooter on the best perch, and a shooter who relocates, splits clusters and times shots still wins.

## How the labs run

| Wave | What runs | Opens when |
| --- | --- | --- |
| 0 · Seams | One session on `main`, one change at a time | Now |
| 1 | Labs A, B and D, each in its own session, branch and pull request | Wave 0 is on `main` |
| 2 | Labs E and C, the same way | A's percepts, beliefs and awareness ladder (A6, A7) are on `main` |

- **Wave 0** sets the foundation's shape and lands what more than one lab needs, before any lab branch opens. Every lab then builds into its final place, and no two labs build their own version of a seam.
- **Wave 1** runs the three labs that share the least:
  - A works in the perception lane;
  - B in the ballistics lane and the instruments;
  - D in the generation lane.
- **Wave 2** runs the labs that build on wave 1:
  - **E** acts on A's percepts.
    - E1 (navigation) needs only Wave 0's grid search (W0.5).
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
- `docs/foundation-shape.md`;
- this plan's section for its lab;
- its pages in `docs/research/`;
- the design doc's Part 2 sections for it.

It works on a branch named for the lab: `lab-a-perception`, `lab-b-shooting`, `lab-c-movement`, `lab-d-camps` or `lab-e-brain`. It opens a draft pull request early, because CI checks pull requests, not other branches.

## Landing on `main`

Several branches change the same goldens, versions and registries at once. W0.7 made most of these rules mechanical.

- **One merge at a time,** from a branch that is up to date with `main` and green there. Two pull requests that are each green on their own can still leave `main`'s golden values wrong. Land with `npm run land -- <number>`, which refuses a branch behind `main` or not green, and CI's "Up to date with main" check fails a branch that is behind. A merge queue needs an organization, and no branch rule is set (one became possible when the repository went public on Nov 8, and it is the owner's call), so these are the rule.
- **A branch takes `main` by merging it, never by rebasing.** Merge `origin/main` in, or use GitHub's *Update branch*. The app refuses a session's force push of a rebased branch (lab A, Nov 8), and the landing check asks only that `main` be an ancestor of the branch's head.
- **Goldens are regenerated after `main` comes in, never merged by hand.** Where one conflicts, take either side and regenerate. That means:
  - `GOLDEN` in `src/sim/game/golden.ts`, which pins every lane's runs;
  - `GOLDEN_TAL_4471` in `tests/world.test.ts`;
  - each lane's work and metrics (`npm run bench -- --write`);
  - the golden recording (`npm run golden`).

  The golden recording also needs rewriting whenever the tuning's shape changes, not only on a version bump. `src/config/validate.ts` refuses a recording whose tuning has other keys.
- **The pull request lists every golden that moved, and why.** CI's "Goldens, explained" job prints, for every pinned run that moved, the first divergent tick, the state paths and its lane's work and metrics (`npm run explain`).
  - Version numbers are taken at merge time: the next free one.
  - That covers `SIM_VERSION`, `GEN_VERSION`, `STATE_SCHEMA` and `RECORDING_VERSION`.
  - There are no version numbers per lane: in a bit-exact simulation, every observable bit is part of the contract.
- **Changes that move every golden land alone and announced:** W0.3, D1, D9, C2 and A13. The other branches merge each in before their next merge. W0.2 moves files but must move no golden at all.
- **The valley's behaviour moves only in announced commits.** Until then, a lab keeps its work in one of these:
  - its scene (`scene.systems`);
  - input the bots never give;
  - a `CampSpec` option.
- **Shared files are added to, not rewritten:**
  - tuning in the lane's own section of `tuning.ts`;
  - systems in their own phase, declaring what they read, write and emit (W0.2);
  - HUD pieces in their own modules;
  - each new event type with a sample in `tests/events.test.ts`, which checks that every type round-trips.
- **The motor:** while lab C runs, it owns the body lane (the motor and its modes).
  - Other labs' motor changes (B5's bob, E7's riding) land one at a time.
  - They keep the motor's invariants (rule 10).

### Codes

Event types and command kinds are stored as one byte. Each lab takes new codes from its own range, so parallel branches can't collide. A test (W0.6) checks that codes are unique and inside their range. Today, events use 1–5, and `fire` is command 1.

| Codes | Owner |
| --- | --- |
| 10–29 | Lab A |
| 30–49 | Lab B |
| 50–69 | Lab C |
| 70–89 | Lab D |
| 90–129 | Lab E |
| 130–255 | Later phases |

## Who defines what

A concept that two labs need is defined once, by the milestone named here. The others build on it through its lane's exported contract.

| Concept | Defined by | Used by |
| --- | --- | --- |
| The kernel, the lanes, the lane map and declared data access | W0.2 | Every lab |
| Brains in the 'decide' phase, steering bodies through orders | W0.3 | A, E |
| Queries, spawning and despawning inside a tick | W0.4 | A, B, E, sandbox drops |
| Grid search: Dijkstra and A\* over both layers of the spatial grid, budgeted by iterations | W0.5 | A (hearing), D (analysis), E (navigation) |
| All seven guard roles; the code ranges | W0.6 | Every lab |
| Benches: pinned scenes per lane, metrics, work counts | W0.7 | Every lab |
| Percepts as records (kind, strength, place, age, expiry, cause), beliefs in `GuardMind`, the awareness ladder and the reaction delay | A | E (what each state does), C |
| Exposure for any observer (cone, distance, cover, skyline, light at the ground); shade drawn where `lightAt` finds it; trial mode | A | C, E, and the player as observer in Phase 2 |
| D's own sight model, in `tuning.gen` | D | Checked against A's detection |
| The body a killed guard leaves; the shot's sounds, with the crack as a path; one ballistic function | B | A, C, E |
| Vitals: breath and heart rate, in one component | B | C extends it |
| The player's health and death | E (minimal combat) | Phase 2 |
| Camp systems as data, plus entity kinds for those with state: the generator, lights, alarm boxes, radio, vehicles, doors and the objective | D | E |
| The use action: carry, drag, sabotage | C | E |

## The three tools

- **Scenario runner** (A3). A scenario is a scene with parameters and an expected range, such as "crouched in shadow at 30 m: spotted in 3–6 s".
  - Its first table is the design doc's ranges, swept across the whole factor grid.
  - It runs in `npm run scene` and in the tests.
  - C and E add their own scenarios.
  - It's also how each lane's bench measures quality.
- **Sandbox mode** (started in A10). Drop a noise, a shot or a body into a live run from the debug view, at up to 8×.
  - A drop is a command in the input, so a recording replays it (rule 5).
  - A10 adds noise drops and a hook for the time scale.
  - B8 adds shots, and E11 adds bodies.
- **Seed explorer** (D2), at `?explore`: a grid of camps showing their validation results, which D's later milestones extend with:
  - coverage and idleness heatmaps;
  - sightline graphs;
  - perch scores;
  - approach paths.

## Exit tests: how each is measured

The owner is the only tester. Each exit test that needs a person is built into its lab, so the lab records its own result.

The statistics behind these protocols are in `docs/research/foundations.md`. A plain "80% of 60 answers" passes a reader whose true accuracy is exactly 80% only 57% of the time. It also passes an owner who answers the clear trials from the sight table and guesses the borderline ones about 18% of the time. The protocols below close that gap.

### A · Testers predict detection 80% of the time in the honest view

- **Trial mode** in the perception lab draws trials from a seeded space of situations: the guard's role and gaze, distance, stance, movement, light, cover and skyline.
  - Each trial states what the player will do (for example, crouch-walk to the crate) and runs about 8 s.
    - A trial's brief names only the action, and the guard's job (Nov 8). The light, the cover, the sky behind you, the ground and the distance have to be read from the scene: stating them would test the sight table, not the honest view.
  - The question is yes or no: will the guard see you before the trial ends?
- **There are two kinds of freeze.**
  - Some trials freeze at the start, before any cue, and are judged from the situation.
  - Others freeze at the first cue (a head turn, a bark, the edge indicator) and are judged from it.
  - Below 30% nothing shows, so start-frozen trials alone would test the rules, not the cues.
- **An answer key in four cells:** detected or not, crossed with clear or borderline. Borderline means one factor away from the other outcome. Each cell holds a quarter of the trials, and scoring uses balanced accuracy.
- **A sitting** is 5 warm-up trials with the outcome shown, then 30 scored, with no outcome shown until the sitting ends. Showing outcomes would teach mid-test.
  - The browser scores the sitting, shows the result at the end, and saves each answer as an annotation in the recording, for `npm run playtest`.
  - There are two sittings a few days apart, each with a fresh set.
- **Pass:** all four of these.
  - 80% balanced accuracy over the 60 answers.
  - At least 70% in each sitting.
  - At least 21 of the 30 borderline answers right. Guessing reaches that only 2% of the time.
  - Clearly better than a rules-only predictor scored on the same trials: distance and the sight table, with no cues. Beating it is the evidence that the cues are readable.
    - (Nov 8, A12: on the borderline trials, by 3 of 30, as the research advises; the table proved strong, so the borderline cells are split evenly by whether it gets them right.)
- **Item analysis:** accuracy is reported by the factor that flips each borderline outcome. A factor near chance needs a cue, or a simpler rule, before the second sitting.
- **Blind** means the honest view only, no outcomes or parameters ahead of time, and fresh trials.
- **Agents pre-screen** each trial set for cues the simulation shows to be missing, after passing a perception check against the simulation's own record. Today's vision-language agents are unreliable judges of timing and detail, so their findings never count toward the pass.
- **Automated, in CI:**
  - The design doc's ranges, swept over the factor grid:
    - spotted at about 150 m standing and moving in the open by day;
    - near invisible beyond 50 m still and prone in cover;
    - 3–6 s crouched in shadow at 30 m;
    - marksmen to about 400 m in a narrow cone.
  - Monotonicity: more exposure never detects more slowly.
  - The fairness rules:
    - every detection outside a drawn contact zone gets a minimum interval from its first cue to 100%;
    - every detection is explained by `explain(id)` back to its percepts;
    - the no-omniscience test holds for guards who perceive.

### B · A 300 m shot at a walking target feels earned

- **The owner's call,** on the range, with about 10 minutes and 15 rounds. Two questions:
  - Is the 300 m walking shot earned and satisfying?
  - **Taste call 3:** keep realistic-lite (drop, travel time and wind, with assists), make it more arcade, or more simulation? With one ballistic function under everything (B3), each answer is a layer of assists over the same physics.
- **Supporting checks:**
  - The reticle's hold and the simulated impact agree within 1 cm, over a sweep of loads, ranges of 100–500 m, winds and slopes.
  - **Decision sensitivity:** at 300 m, skipping any one decision moves a centred shot off the head. The decisions are drop (1.5 mil), lead (about 1.9 mil for a walker), wind, and ranging.
  - Telemetry breaks every miss down into range, lead, wind and sway error, in mils, so the owner's verdict can be checked against what decided each shot.

### C · Players predict their own noise and visibility

- **A's trial mode** runs noise trials ("will the guard hear this move?") and visibility trials, with the same protocol and the same pass mark. The design doc gives no number; 80% is proposed to match lab A.
- **Accuracy is reported by the factor that flips each outcome:** surface, gait, distance, masking, light.
- **The owner judges** whether moving feels deliberate, in the same sittings. That judgement was deferred at the Phase 0 gate.

### D · 90 of 100 seeds pass validation on the first try

- **`npm run seeds -- --count 100 --from <a held-out series>`:**
  - at least 90 camps pass at their first camp attempt, with no repair;
  - repair fixes the rest within its iteration budget;
  - each seed reports how close it came to that budget.

  The default series is the one D tunes against, so the gate runs on another. Today's `attempt` counts re-rolls of the whole world (`src/sim/generation/world.ts`); D counts camp attempts and repairs separately.
- **Before any review, the simulation proves diversity.**
  - Restricted-play bots (long range only, infiltration only, systems only) find each camp's best plans.
  - The plans are clustered by signature: the opening perch or approach, the first target, how the first cluster is split, and the tool or timing that does it.
  - Expressive range is plotted over the 100 seeds.
- **The reviewer:**
  - Several fresh agents that haven't seen the generator's code. They work from what recon would show (the layout, the guards, their routes and timing), never the generator's scores or paths, so the review isn't circular.
  - Each sees the camps in its own random order, and their agreement is measured.
  - Each writes each camp's best plan as a signature, and every plan is run in the simulation to show it works.
- **"Clearly different"** means no two of the 10 camps share a signature, and each camp's best plan, run on another camp, does clearly worse there (a regret matrix).
- **The owner checks three.** A 3-of-10 spot check catches a single bad camp only 30% of the time, so the simulated checks carry the weight.
- **The guard budget** of 16 at most is checked by count, not by time (rule 18).

### E · Escalation can be caused, contained and interrupted

- **Scripted scenarios** in the scenario runner:
  - a suspicion episode, caused and recovered;
  - a search, evaded, with search cycles near 30–45 s, ended by belief, not truth;
  - an alarm, interrupted;
  - one overlook doesn't clear the camp, shown from both sides on every validated camp:
    - a perfect shooter on the best perch fails;
    - a shooter who relocates, splits clusters and times shots succeeds.
- **Calibration:** across seeded runs, the camp's estimate of where a shot came from contains the true perch at its stated rates: about 39% inside one standard deviation, and 86% inside two.
- **Competence:** the honest brain's search efficiency is reported against Xu and Verbrugge's baselines, run on the same camps. The baselines are a random walk, a plain state machine, a staleness search and an omniscient chaser.
- **Every reaction** carries a reason code and a chain of causes back to a percept. The no-omniscience test covers the commander and the pacing layer as well as each guard.
- **The owner** plays the camp-brain lab, with 5–8 guards, for 10–15 minutes.
  - Press M at any reaction the honest view doesn't explain.
  - Each mark is checked in the replay.
  - The target is zero marks over at least 40 reactions, which bounds unexplained reactions below about 7%.

### F · A camp worth taking down

The design is `docs/camp-engine.md`, section 8. Scored with a shooter limited to what a person can do, over held-out camps and every preparedness level, on guards who aren't on a tower.

- **The ladder holds its order.** Shoot once and leave doesn't win on camps that expect attack. Perfect and static loses or can't finish on 90% of them. The patient planner wins most.
- **No plan is best on more than half the camps.** Today one plan is best on 29 of 30.
- **The gallery closes, and opens again.** Under 20% of standing guards in a clear line 15 s after a shot, on camps that expect attack, and men back out with a job within about a minute.
- **Staying is dangerous, and moving pays:** a shooter who stays is under effective fire within a time we set, and moving along dead ground buys back a measured amount.
- **Cuts degrade the camp and force a visible fallback.** No single cut wins by itself.
- **Every response explains itself** back to something sensed, and no-omniscience holds after contact.
- **A person can play it.** The owner plays each step and can say "I got outplayed", not "I was cheated".

## The owner's time

- **Each lab ends** with:
  - a playable link on the deployment (`?scene=<name>`, or `?explore`);
  - a short note of what to try;
  - its bench numbers against its seed;
  - one to three questions.
- **Sittings:**

  | Lab | Sittings |
  | --- | --- |
  | A | Two of about 12 minutes, a few days apart |
  | B | One of about 10 minutes, with taste call 3 |
  | C | Two of about 12 minutes, with a few minutes on feel |
  | D | One of about 10 minutes |
  | E | One of 10–15 minutes |
  | F | A short one at the end of every step, about 15 minutes, with three questions |
  | Gate | The report, and one last look |

- **The foundation pass's open check** folds into the first sitting. It runs on the owner's Mac and covers:
  - frame rate;
  - sound;
  - the runs the game keeps;
  - a replay.
- **Where the sittings stand (Nov 8).** Nobody has played any of this yet. Everything is at https://sightline-brown.vercel.app, with no login. Each sitting ends by saving a file, for `npm run playtest`.

  | When | What | Where | About |
  | --- | --- | --- | --- |
  | Any time | B, with taste call 3 and the foundation pass's check | `?scene=shooting-range` | 10 min |
  | Any time | A, first sitting | `?trials=OWNER-A1` | 12 min |
  | Any time | C, first sitting, and feel (C9) | `?trials=OWNER-C1&lab=movement`, then `?scene=movement-lab`, with `&hz=blind` | 15 min |
  | A few days later | A and C, second sittings | `?trials=OWNER-A2` and `?trials=OWNER-C2&lab=movement` | 25 min |
  | Once E7 and E8 are on `main` | E, and D's three camps | `?scene=live-camp&params=seed=LEB-2534`, then `KUV-9210` and `HUM-0755` | 25 min |
  | Any time | F, the first fight | `?scene=compound&params=seed=LEB-2534%26attack=sniper`, then `?scene=live-camp&params=seed=LEB-2534%26perch=1&lab`. What did the camp do, why did you move, what would you do next? | 15 min |

  What each sitting asks is in its lab's section. Lab A's questions wait until after its first sitting.

  The four trial sets were pre-screened on Nov 8 by two agents who first passed a perception check against the simulation's record. No cue is drawn against the record, nothing on screen gives an outcome away, and no trial changed (`docs/decisions.md`, After the labs).

## Milestones

### Wave 0 · Seams

The kernel boundary goes first, so everything after it lands in its final place. `docs/foundation-shape.md` has the design.

- [x] W0.1 · This plan, the foundation's shape, the research, and the pointers to them.
  - In the repository: `CLAUDE.md`, the README, the handoff and `decisions.md`.
  - In the design doc: its phase notes, its validation rule, the owner's calls on sight, hearing and light, and its decision log.
- [x] W0.2 · The kernel boundary and lanes, behaviour-preserving. Every golden holds.
  - `src/sim` splits into the kernel, one directory per lane (each with one `index.ts`), and the game.
  - The lane map, as data, drives the architecture test.
  - Every system declares what it reads, writes and emits, with one writer per state subtree. A test fails when two systems in a phase touch the same path with no declared order.
  - The simulation no longer spawns the player and the guards itself; the game's setup does.
  - A scene with every lane off still steps, hashes, saves, restores and replays. Two simulations stepped in alternation keep their own hashes.
- [x] W0.3 · Brains decide after perceiving.
  - The routine moves from the 'intent' phase to 'decide', and becomes an order.
  - 'decide' at tick N plans tick N + 1. 'intent' carries out the current order, with an initial order for tick 1.
  - Behaviour must not move: the `behaviour` goldens hold. The state does: `STATE_SCHEMA` 7, and the golden recording is rewritten.
  - The probe in `tests/perception.test.ts` moves to 'decide' with the brains.
- [x] W0.4 · Queries and spawning inside a tick.
  - `TickContext` gains `query()`: the world, everything solid, and every body's shape as they stand now.
  - It also gains `spawn` and `despawn`, with the index and the solids kept current.
  - A scene pins the tick on which a spawned body first exists, for the motor and for perception.
  - Today systems can't see bodies' shapes, and `sim.spawn` works only between ticks.
  - Behaviour doesn't change.
- [x] W0.5 · Grid search over both layers of the spatial grid (`kernel/world/grid.ts`).
  - Bounded Dijkstra with a bucket queue, and A\*.
  - A cost per edge, and a fixed neighbour order.
  - Budgeted by iterations (rule 18), deterministic.
  - Usable from generation as well as the simulation.
- [x] W0.6 · Registries and roles.
  - The code ranges above, written into the registries, with a test that codes are unique and in range.
  - `GuardRole` gains marksman, radio operator, officer and target. The renderer's role tints follow; the test camp still uses three roles.
- [x] W0.7 · Landing, made mechanical.
  - **Goldens explain themselves:** the first divergent tick, the state path, and the lane's metrics.
  - **Benches per lane:** pinned scenes, quality metrics, and deterministic work counts (rays, grid nodes, bodies) in `--profile`, pinned as budgets.
  - **Behaviour fingerprints in recording headers,** so a preview deploy's recording is refused with a reason. Today it would be accepted, then diverge.
  - **The rule** that only up-to-date branches merge.
- [x] W0.8 · Determinism at the edges.
  - **A synctest mode in `npm run fuzz`:** save, step and restore through the on-disk codec as well as `structuredClone`, then compare hashes part by part.
  - **A bisect tool:** first bad tick, then phase, then a state-path diff.
  - **A known-answer check at startup** for `Math.sqrt` and `detmath`.
  - **An architecture-test rule** that sort comparators give a total order, with an id to break ties.

**Notes for wave 1** (from the session that built Wave 0):
- **Work in your lane.** A in `src/sim/perception`, B in `src/sim/ballistics` (empty, its `index.ts` waiting), D in `src/sim/generation`. Reach any other lane through its `index.ts`, and export what others need from yours there. The architecture test reads the lane map, `src/sim/lanes.ts`; if your lane must import another the map doesn't allow, that's a change to the map, made deliberately.
- **Add to the kernel's types from your lane, by module augmentation:** a new entity kind as `game/entities.ts` adds the player and guards, new `World` fields as `generation/world.ts` adds the camp. `npm run typecheck` also compiles the kernel alone, so kernel code can't use them. If the kernel itself needs something new from a game, it belongs in the `Game` contract (`kernel/game.ts`).
- **Every system declares `reads`, `writes` and `emits`.** Two systems in a phase that touch the same data need `after`, or the simulation won't start. `tests/systems.test.ts` diffs the state around every system, in the valley and every scene in `SCENES`, against what it declares, so declare honestly and register your scene.
- **Inside a tick:** `ctx.query()` for every body's shape as it stands, `ctx.spawn` and `ctx.despawn` (declare `entities`), `ctx.channel` to hand a value to a later system in the same tick, and `ctx.work` for your work counts (pass it as a grid search's `work`). Spawn guards with `spawnGuard` (`game/setup.ts`), which gives them their first order.
- **Brains** (lab E, and A7's minimal reactions) decide in 'decide' and steer through orders (`brain/orders.ts`), kept in the guard's state and carried out in 'intent'. The no-omniscience probe watches in 'decide'.
- **Grid search** (`kernel/world/search.ts`): costs are whole centimetres, budgets are expansions, and one `GridSearch` per layer can be kept for the world's life.
- **Codes:** take event and command codes from your range (`kernel/codes.ts`: A 10–29, B 30–49, D 70–89) and name it in the entry's `range`.
- **Your bench** (`game/benches.ts`): pin your lab's scene in `game/runs.ts` and `game/golden.ts`, add your metrics, and pin them with `npm run bench -- --write`. That is how your exit note's bench numbers stay true after you.
- **Landing:** merge `main` in (never rebase: see Landing on `main`), regenerate (the values in `game/golden.ts`, `npm run golden`, `npm run bench -- --write`, and `GOLDEN_TAL_4471` for generation), read `npm run explain`, then `npm run land -- <number>`. No branch rule is set, so nothing but this stops a merge from a stale branch.
- **Recordings carry their build's behaviour digest** (format 10): one made on your preview deploy is refused by `main` with a reason, by design. `npm run bisect -- --recording <file>` shows where your build and the one that made it part ways.

### A · Perception and awareness

Playable at `?scene=perception-lab`. Design doc: Enemy perception; Individual awareness and the reaction window. Research: `docs/research/labs.md`, Lab A.

**The seed, and the target:**
- **Seed:**
  - Sight: Blacklist's rays to body points, with a minimum per stance, nested zones and time linear in distance; the asymmetric ladder of Thief and The Dark Mod.
  - Hearing: a Dungeon Crawl Stone Soup-style flood on the grid, Blacklist's doorways, and Mark of the Ninja's path shared with the player's audio.
- **Where it falls short:**
  - Vision models stop at 60–90 m.
  - Rate scaling can't make a range.
  - Long-range periphery and a skyline factor have no precedent.
  - Zone edges are cliffs.
  - Offscreen cheats.
  - Nothing models foliage both ways, or the crack.
- **Beyond it:**
  - Every factor becomes a boundary the honest view can show.
  - Sight and sound are symmetric by construction.
  - The crack is modelled from physics.
  - Predictability is measured per factor.
- **Bench:**
  - the factor-grid sweep, with the minimum cue interval;
  - bit-exact symmetry tests;
  - a crack-bias scenario;
  - trial accuracy above the rules-only predictor.

**Recorded before building (Nov 8), so the exit note can be read against it:**
- **The seed, as the bench runs it.** The perception bench keeps the seed as a model of its own (`seedSight`): Blacklist's nested zones (core 60°, periphery 120°, each with a hard range), time linear in distance inside a zone, and the design doc's table applied as one product of rates, with no caps. Both models are swept over the same factor grid.
- **Where the seed falls short, in the bench's terms:**
  - **Fixed points.** It can't meet the design's ranges together. Rates alone make any exposure inside a zone complete given time, so a still, prone player in cover is still found at 140 m, against a target of never beyond 50 m.
  - **Edges.** A zone's edge is a cliff: time to detection jumps from its slowest to never within a centimetre.
  - **Telegraph.** Nothing bounds the time from the first cue to 100%: at a metre's range it is under half a second.
  - **Foliage.** It has none: a canopy hides a guard from you but not you from him.
  - **The crack.** It has no model: a crack is heard from the shooter.
- **The target, in the bench's metrics:**
  - **The design's ranges in daylight:**
    - a standing, walking player in the open is spotted out to 150 m, ±10 m;
    - a still, prone player in cover is never spotted beyond 50 m;
    - crouched in shade at 30 m, spotted in 3–6 s;
    - a marksman's narrow cone reaches 400 m, ±20 m.
  - **Monotone:** no step up in exposure, anywhere on the grid, detects more slowly.
  - **Telegraphed:** outside a 2.5 m contact zone, at least 1.5 s from the first cue (30%) to 100%, in every combination.
  - **No cliffs:** every edge, of range and of cone, ramps over at least 2 m or 4°.
  - **Symmetric, bit for bit:** foliage between a guard and the player, both ways; a sound's clarity in the player's speakers and for a guard at the player's cell.
  - **The crack:** a listener 5–15 m from a supersonic path at 300 m hears it from 55–62° off the shooter's bearing. (Recorded as 5–20 m; at 20 m the shooter's own bearing sits 3.8° off the path, giving 54.6°. The research's figure is for listeners near the path.)
  - **Readable:** the owner beats the rules-only predictor on borderline trials (A12).

**Milestones:**
- [x] A1 · The lab scene.
  - It holds a sentry, a patrol, a marksman post, cover, shade, a skyline ridge, gravel and grass, and a generator.
  - It grows with each milestone.
  - Handmade worlds have no foliage yet (`generation/handmade.ts`), so the scene adds it or uses generated terrain.
- [x] A2 · Sight: the detection meter, restructured (owner, Nov 7).
  - Stance and light are range caps, and peripheral vision is a short-range zone. Time grows linearly with distance inside each zone, and each edge ramps over a few metres instead of a cliff.
  - Rays go to head, chest and feet, with a minimum number clear per stance.
  - Light is taken at the ground beneath the body (owner).
  - Skyline.
  - Exposure is computed for any observer, so the player can be one in Phase 2.
  - Rates per second (rule 17), in `tuning.perception`.
  - Its debug overlay: zones at their real ranges, rays to the three parts, and the factors.
- [x] A3 · The scenario runner (see The three tools).
  - Scenes take no parameters today, and a recording's header names its scene by exactly `{name, version}` (`kernel/record/recording.ts`). Parameters therefore join the scene's identity.
  - Its first table sweeps the design doc's ranges over the factor grid, asserting monotonicity and the minimum interval from cue to detection.
- [x] A4 · Shade and foliage, drawn as simulated.
  - Each body's lit state comes from the simulation, in the snapshot.
  - World shade comes from one static shadow map over the play area, rendered once.
  - A test holds the drawing to `lightAt` at sampled points; 99.5% is the starting bar.
  - Fog uses distance, not view depth, so a guard's contrast doesn't change as you turn.
  - Foliage is a transmittance multiplied along each body ray in both directions, drawn from the same volumes, and tested for symmetry.
- [x] A5 · Hearing, with one law of sound (owner, Nov 7).
  - A bounded flood on the site grid (W0.5), once per sound, which every listener and the player's speakers read at their own cell.
  - A second, through-wall route that loses a set number of decibels per wall, as in Rainbow Six Siege. The louder route wins.
  - Masking by the steady sources in `generation/ambient.ts`, as a shift of the hearing threshold.
  - A heard sound gives a guess, not a fix. It arrives from the doorway it came through, blurred by how much longer its path was than a straight line, with the error drawn from the guard's own stream.
  - The crack comes from the point the bullet's shock cone predicts, about 55–62° off the shooter's true bearing, scheduled at its exact arrival (B8). Its geometry is built and benched (`perception/crack.ts`); it is scheduled at arrival when B8's shot sounds land.
  - No offscreen bias: anything unfair gets a cue.
- [x] A6 · Percepts and beliefs.
  - Percepts are records with a kind, strength, place, age, expiry and cause.
  - The mind holds the last known position, with its uncertainty.
  - The no-omniscience test extends to guards who perceive. Its two places must lie beyond every sense: marksmen see 400 m, and the overlook is about 330 m from the camp.
- [x] A7 · The awareness ladder.
  - Curious from 30%, then suspicious, searching and combat.
  - A rise is delayed by the current state's dwell. A fall steps down one state at a time, to a raised floor.
  - Grace periods, with the spread drawn from the guard's own stream.
  - About 1.5 s to react to something alarming, always telegraphed: Bungie found an untelegraphed delay read as a bug.
  - Stand-downs start near 20 s.
  - Minimal reactions show each state: look, walk to the believed spot, go back. E's brain replaces them.
- [x] A8 · Cues in the honest view.
  - Head and body turn, and weapon raised.
  - The bark vocabulary, started now (Alien: Isolation's took most of its cycle). Barks run from specific to generic.
  - The detection indicator at the screen edge.
  - Then the fairness checks.
- [x] A9 · The other stimuli, each wired in when its source is on `main` (`docs/decisions.md`, A9):
  - [x] bodies and a comrade dropping (B4);
  - [x] impacts (B4), and the crack from the bullet's path;
  - [x] thrown objects (B9);
  - [x] lens glint (B6);
  - [x] doors (D4, E7): a door shut or opened is a sound, and a door not as it was left is something a guard notices. Lab D's doors all start open, so the cue is a door someone has shut.
- [x] A10 · Sandbox mode: noise drops, and the time-scale hook.
- [x] A11 · The budget: 16 guards perceiving within the frame budget, measured by work counts as well as `npm run sim -- --profile`, in Chromium, Firefox and WebKit. Fast paths come only if it needs them: a still body skips the motor, and a distant guard skips perception.
- [x] A12 · Trial mode, with the protocol in Exit tests, and the agents' pre-screen.
  - `?trials=<seed>` plays a sitting; `npm run playtest` scores it from its recordings or its saved file; `npm run trials -- <seed> --shots` prints it and draws its freeze frames for the pre-screen.
  - Each borderline cell is split evenly between trials the sight table gets right and wrong, so the table alone scores 7 of 15 there, and the comparison with it is on the borderline trials (`docs/decisions.md`, A12).
  - The trials are spread over the factors by a greedy pairwise covering; a one-tap probe asks what told you; R on the results plays back the misses (the research's list for before the first sitting).
  - The freeze kind says nothing about the outcome: each kind holds the same share of seen and not seen, and they're scored apart. Answers survive a reload, and each carries its key, so later builds can still score the sitting.
- [x] A13 · Perception joins the valley (`SYSTEMS`), announced, with the version bump.
- [ ] Exit test, the bench numbers, a note, a playable link.
  - **Ready for the owner's two sittings** (Nov 8). `?scene=perception-lab` is the lab, and The owner's time above has the sittings.
  - **The owner should leave the rest of this item until after the first sitting.** It says how the trials are built and how quickly guards see you, which would spoil a blind test.
  - **Three questions, for after the first sitting:**
    1. Is the borderline split the test the owner wants? The sight table alone proved a strong predictor, so each borderline cell holds as many trials it gets right as wrong (`docs/decisions.md`, A12). The alternative is to draw them as they come, where the table gets about two thirds right.
    2. Is a still body found too slowly up close? Standing still in shade 7 m in front of a sentry takes 5.9 s, and lying still in the open 4 m away takes 7.2 s. If that's too forgiving, it's a tuning call.
    3. Does the first cue's time count as reading it? A meter that reaches 30% early reaches 100% in time. A reader of that alone, with the table otherwise, scores about 75% and fails the verdict.
  - **The bench against the seed** (`npm run bench`, lane perception):

    | Measure | The seed | Target | Measured |
    | --- | --- | --- | --- |
    | Standing, walking in the open: seen to | 150 m | 150 ± 10 m | 155.75 m |
    | Still, prone, in cover: seen to | 150 m | never beyond 50 m | 46.75 m |
    | Crouched, walking, in shade at 30 m | 8.89 s | 3–6 s | 5.33 s |
    | A marksman's far zone | 400 m | 400 ± 20 m | 405.75 m |
    | Least time, first cue to 100%, outside contact | 0.47 s | at least 1.5 s | 1.5 s |
    | Steepest edge, per metre and per degree | 0.301 and 0.955 | no cliffs | 0.122 and 0.114 |
    | The crack at 300 m, degrees off the shooter | 0° | 55–62° | 55.4–57.2° |
    | A reader guessing the borderline trials passes | 17.4% | as low as can be | 2.0% |
    | A reader right 80% of the time passes | 58.6% | | 50.9% |
    | A reader right 90% of the time passes | 99.5% | | 99.0% |

### B · Shooting

Playable at `?scene=shooting-range`. Design doc: Weapons, tools and ballistics; Vitals (breath and heart rate). Taste call 3 is decided here. Research: `docs/research/labs.md`, Lab B.

**The seed, and the target:**
- **Seed:**
  - one drag constant per load, as in vanilla Arma;
  - Sniper Elite's realistic-lite presets and mil holds;
  - Arma's sway;
  - Sniper Elite's rationed payoff;
  - the timed fire command.
- **Where it falls short:**
  - Solvers that are unported or GPL.
  - One Euler step per tick lands 18.5 cm low at 500 m.
  - No published sway numbers.
  - Bullets that leave the muzzle rather than the eye.
- **Beyond it:**
  - One function for the bullet, the reticle, the rangefinder and every assist.
  - A budget of decision sensitivity.
  - Physically timed confirmation.
  - Sway as a pure function.
- **Bench:**
  - reticle and impact within 1 cm over the sweep;
  - every skipped decision moves a centred hit off the head at 300 m;
  - the miss breakdown in telemetry;
  - the owner's call.

**Recorded before building** (Nov 8, by the lab B session). Each row is a number the lane's bench (`game/benches.ts`, lane `ballistics`) measures, with the seed's value where the research measured one. The exit note gives the bench's values against both columns.

| Measure | The seed | Target |
| --- | --- | --- |
| Drawn hold against simulated impact: two loads, 100–500 m, winds 0–8 m/s from any side, slopes ±30° | 18.5 cm low at 500 m (one Euler step per tick under an exact reticle); a field of view that bent Tarkov's reticle by 100–200 m of zero | Under 1 cm everywhere; aim for 0.2 cm |
| The model against a G7 point-mass solver (.308, 168 gr, sea level) | Gravity only: drop 22–29% short; wind carried with the air: drift 6–9 times too much | Drop within 1 cm and drift within 0.5 cm to 500 m |
| The closed form against RK4 of its own model, ±30° | — | Across the aim, under 0.06 cm to 500 m for the match load (the research found 0.05), and 0.12 cm to 300 m for the subsonic |
| Decision sensitivity at 300 m, a guard walking 1.35 m/s | Measured by no game | Skipping drop, lead, wind (4 m/s) or ranging (an unaided 15% guess) each moves a centred head shot off the 23 cm head |
| Sway, the 95th-percentile radius over 20 s | Arma: no numbers published | Free-standing at least 1.5 mil; prone 0.5–0.8; prone rested 0.25; rested, breath held, 0.1 or less |
| The impact heard back at the shooter | No game times it physically | Flight plus return, to the tick: about 1.28 s at 300 m |
| What decided each miss | Sniper Elite: a hidden score | Range, lead, wind and sway error in mils, for every shot, in the playtest summary |

**How the lab is built** (decided before building; `docs/decisions.md`, Lab B, has the reasons):
- **One ballistic function** (`ballistics/trajectory.ts`): the closed form for one drag constant, in the bore's frame, with the lag rule for wind. A bullet's whole path is its launch, so a bullet in the state is its launch and nothing else, and its position at any instant is exact.
- **Bullets are entities.** A shot is resolved in 'commands' against the poses the player saw (the two ticks of history), from its instant to the tick's start, then flown in 'projectiles' every tick, each segment swept against every body part between two ticks' poses, the terrain and the colliders.
- **The rifle and vitals are components the run's setup gives.** The range gives them now; the valley gets them in Phase 2. Until then a click in the valley is the bare shot it was, and no valley golden moves.
- **Sway is sampled at every tick's end, kept with two ticks of history** like a body's pose, and both the camera and the shot read it through one function at the frame's instant: the shot goes where the drawn reticle pointed.
- **Assist layers are view-only.** Arcade, realistic-lite and simulation differ only in what the instruments show, over one physics, so taste call 3 never changes a recording.

**Milestones:**
- [x] B1 · The range scene: firing points with a rest; targets walking routines across 100–500 m; flags and grass that show the wind.
  - Landed: `game/scenes/shootingRange.ts` (`?scene=shooting-range`): a mound with a bipod's ground, sandbags and a wall; eight guards walking and standing at 100–506 m; steel plates; a berm; four flags (a new `'flag'` structure kind) and grass streaming in a 4 m/s crosswind (`render/windCues.ts`); sea-level air. A marksman drives its headless run and pinned bench run.
- [x] B2 · Content as data in `tuning.ts` (rule 16): the rifle, its ammunition and suppressor, the scope and binoculars, and the throwable.
  - Landed: `tuning.ballistics` (the rifle, two loads with their drag constants, the shot's sounds, hits, optics, the throwable, sway) and `tuning.vitals`, bounded in `config/validate.ts`.
- [x] B3 · One ballistic function, realistic-lite.
  - Gravity, one drag constant per load, and the mission's wind, applied by the lag rule. Carrying the bullet with the air overstates drift six to nine times.
  - Evaluated exactly in closed form, which needs only `dlog`, `dexp` and division, or with Heun's method once per tick. Never with one Euler step per tick.
  - Bullets live in the state tree and fly in the 'projectiles' phase. About 0.5 s to 400 m.
  - The same function draws the reticle's marks and drives the rangefinder, the wind readout and every assist.
  - Landed: `ballistics/trajectory.ts` (the closed form in the bore's frame) and `aim.ts` (zero, launch, landing, the hold solver). Against RK4 of its own model: 0.53 mm across the aim at ±30° and 500 m. Against the G7 solver: drop and drift within 1 cm and 0.5 cm to 500 m (`tests/ballistics.test.ts`). The instruments that read it are B6's.
- [x] B4 · Hits.
  - Each bullet's path is swept between two ticks' poses against each body part, the terrain and the colliders. A path bends about 1.4 mm in a tick, so there is no sub-stepping. Hit and impact events follow.
  - A headshot kills. A torso shot kills an unarmored guard, but may let the guard cry out first (drawn from the guard's own stream).
  - A killed guard leaves a body, spawned within the tick (W0.4).
  - Landed: bullets are entities (`ballistics/bullet.ts`), resolved in 'commands' against the poses the player saw and flown in 'projectiles' (`game/shooting.ts`). A leg shot kills too, always with a cry; lab E may make it a wound. The body left behind collapses as a pure function of time (`game/remains.ts`), and sight lines and bullets see it.
- [x] B5 · Bob: whether walking bodies bob in the simulation, and whether a shot leaves from the bobbing eye. Decided by measuring at 300 m; `body/bob.ts` is ready.
  - Decided: neither, so nothing in the motor changes (`docs/decisions.md`, B5; the measurements are tests in `tests/bob.test.ts`). A walking guard's head dips 2.6 cm: 0.087 mil at 300 m, under a quarter of the head's radius, five times smaller than the smallest decision (ranging, 0.46 mil), and under a pixel and a half through the scope. The shooter's camera stops bobbing as the scope comes up, so a scoped shot leaves exactly from the drawn eye; unscoped, the barrel's 25 mil of pointing error is a hundred times a sprint's dip at 300 m. Revisit when Phase 3's walk cycles come with art.
- [x] B6 · Instruments in the honest view, which today has no crosshair.
  - The scope, with its mil reticle and a zero dial in 100 m steps, and mil holds between steps. A target 50 m from the nearest step sits 11–34 cm off.
  - Binoculars with the rangefinder and a wind readout.
  - Lens glint toward the sun.
  - A sweep test holds the drawn hold to the simulated impact within 1 cm.
  - Marking waits for Phase 2, with the model of what the player has observed.
  - Landed: `app/scope.ts` draws the scope (a mil reticle in the camera's own projection, the zero, the rounds, rest and breath marks, a flare when facing the sun) and the binoculars (a mil scale and the rangefinder); the right button raises the scope, F the binoculars, the arrows click the zero, Shift holds the breath while scoped, H changes the assists. The sweep (`tests/reticle.test.ts`, `game/ballisticsBench.ts`): 160 shots through the whole simulation, worst 0.136 cm; each hold drawn within 0.001 mil of where three.js projects the point, on three screen shapes. Glint is a pure function (`ballistics/glint.ts`) for lab A's A9.
- [x] B7 · Sway, breath and heart rate.
  - Sway is a pure function of state and time in the simulation (rule 14), so the shot goes where the drawn reticle points at the click's instant. Its parts:
    - incommensurate sines;
    - a heartbeat pulse;
    - hashed grip noise.
  - A proposed starting ladder, to tune:
    - free-standing: well above a head;
    - prone, unrested: 0.5–0.8 mil;
    - prone, rested: 0.25 mil;
    - prone, rested, breath held: 0.1 mil or less.
  - Breath holds for about 4 s, recovers over about 6 s, and spikes on release.
  - Heart rate rises with sprinting and close calls, and settles over about 20 s.
  - Landed: `ballistics/sway.ts` (breathing on two incommensurate phases, hashed smooth tremor, the heartbeat's kick, the recoil), sampled at every tick's end with two ticks of history (`rifle.ts`), and `body/vitals.ts` (heart rate, breath held and recovered, `startle` for close calls, which lab E calls when guards shoot back). A rest is found by geometry (`rest.ts`): a bipod prone, sandbags or a wall upright. The ladder measured (`game/ballisticsBench.ts`): 1.64 mil standing, 0.99 crouched, 0.69 prone, 0.255 prone on a rest, 0.046 with the breath held. Shots leave along the camera of the frame clicked on, sway and all, at 30–144 fps (`tests/sway.test.ts`).
- [x] B8 · The shot's sound.
  - The report at the muzzle, the crack along the path, the impact.
  - The suppressor cuts the report.
  - The impact's sound reaches the shooter at flight time plus return time, about 1.28 s at 300 m.
  - Voices in the audio engine.
  - Sandbox shot drops.
  - Landed: `report`, `impact` and `cry` events (sounds, with radii by the suppressor, the load and what was struck) and the crack as a function of the path (`ballistics/crack.ts`: the Mach cone's point, d·tan μ upstream of the nearest pass), for lab A's hearing and the speakers alike. Voices in `audio/shotVoices.ts`. Measured offline in Chromium (`tests/browser/shot.test.ts`): the strike of a 300 m shot comes back 1.24–1.33 s after the trigger; a listener 10 m off the path hears the crack near 0.4 s and the report after 0.8 s; the shooter hears no crack; the suppressor cuts the report by more than 12 dB. Sandbox: J in the debug view drops a shot where you look (`shotDrop`, command 35), rifle or not.
- [x] B9 · The throwable: its arc, and a landing sound that draws one guard.
  - Landed: X throws a stone (`ballistics/thrown.ts`, three carried) on an exact arc, swept a chord a tick against the world and the bodies, bouncing (30% of the speed into a surface kept, 55% along it) until it settles; each touch is a `clatter` sound (code 36), loudest at the first: 31 m on grass at a full throw, about 40 m on gravel. Measured against the Phase 0 test camp, where guards stand in pairs 7–10 m apart, a landing beside one guard reaches his partner too: which single guard walks over is lab A's (A7's minimal reactions, A9 wires the stimulus) and lab E's (E5's commander), not the sound's.
- [x] B10 · Hit confirmation, and telemetry.
  - Landed: dust where a shot strikes (darker than the ground, so it reads at 500 m), a flash on steel, a trace along the simulated path, and the body's collapse, all drawn from the simulation (`render/shotLayer.ts`, tested without a GPU in `tests/shotLayer.test.ts`); the thump of a hit 1.28 s after the trigger at 300 m (B8). The decision-sensitivity check is on the bench (B6). The miss breakdown (`game/telemetry.ts`) is in `npm run playtest` and on the screen at the end of a run. No kill cam: the payoff is physical, and the replay already plays a shot back at a quarter speed.
  - Dust on a miss, so the player can correct like a spotter.
  - The decision-sensitivity check, and the miss breakdown in the playtest summary.
  - A kill cam, if any, is only a slowed replay of the recording.
- [ ] Taste call 3, the exit test, the bench numbers, a note, a playable link.
  - **Ready for the owner's sitting** (Nov 8): B1–B10 landed (willgibs/sightline#1). Open the range at https://sightline-brown.vercel.app/?scene=shooting-range, about 10 minutes and 15 rounds. What to try:
    - Go prone (Z) on the mound: REST lights up in the scope. Hold the breath with Shift while scoped and press between heartbeats.
    - Range a walker with the binoculars (F, then click), then dial the zero (↑ ↓) to the nearest 100 m and hold the rest, or keep 100 m and hold over with the dope card.
    - Read the wind from the flags (from the west, a full crosswind) and hold into it; lead a walker about 1.8 mil at 300 m.
    - Hear the strike come back about 1.3 s after the shot at 300 m; watch the dust on a miss and correct like a spotter.
    - Press H to try the arcade and simulation instruments; the run's end gives every shot a row of range, lead, wind and sway, in mils.
  - **The bench against the seed** (`npm run bench`, lane ballistics):

    | Measure | The seed | Target | Measured |
    | --- | --- | --- | --- |
    | Drawn hold against simulated impact, 160 shots through the simulation | 18.5 cm at 500 m | under 1 cm; aim 0.2 | 0.136 cm worst |
    | The model against a G7 solver, to 500 m | drop 22–29% short, or drift 6–9 times too much | drop within 1 cm, drift within 0.5 | 0.82 cm and 0.45 cm |
    | The closed form against RK4, ±30° | — | under 0.06 cm (match), 0.12 (subsonic) | 0.053 cm and 0.11 cm |
    | A skipped decision at 300 m, against the head's 0.38 mil | measured by no game | each off the head | drop 1.79, lead 1.84, wind 0.60, ranging 0.46 mil |
    | Sway (95th percentile): standing, prone, rested, breath held | no numbers published | ≥ 1.5, 0.5–0.8, 0.25, ≤ 0.1 mil | 1.64, 0.69, 0.255, 0.046 mil |
    | The strike heard back from 300 m | not timed by any game | flight and return, about 1.28 s | 1.24–1.33 s, rendered in Chromium |
    | What decided each miss | a hidden score | every shot, in mils | `npm run playtest` and the run's end |
  - **Two questions for the owner:** Is the 300 m walking shot earned and satisfying? And taste call 3: keep realistic-lite (the default: you make the four decisions with a rangefinder, a dope card and the flags), go more arcade (the instruments make them for you: the hold and the wind read out, the landing marked), or more simulation (no dope card: you learn the drops)? Each is only a layer of what the instruments show, over the one physics.

### C · Movement and body

Playable at `?scene=movement-lab`; the movement course stays as a regression test. Design doc: Player (movement, visibility and noise). Research: `docs/research/labs.md`, Lab C.

**The seed, and the target:**
- **Seed:**
  - the bounded collide-and-slide of Quake and Source, with an offset kept outside surfaces;
  - Siege's lean, with the camera at the centre of the head;
  - The Dark Mod's mantle;
  - Source's ladders and Half-Life 2's validated dismounts;
  - Thief's light, biased to the floor.
- **Where it falls short:**
  - Skins that sink into geometry, recovery that pushes bodies out, and clipping fixed map by map.
  - WebAssembly physics that falls outside the math contract.
  - No published lean, mantle or carry numbers.
- **Beyond it:**
  - No motor mode gets an exception: every pose of every mode is checked every tick.
  - A prone chain of circles, with bisected turns.
  - The eye at the centre of the simulated head.
  - Readouts in the world.
- **Bench:**
  - zero invariant violations over the weekly fuzz run, with adversarial bots;
  - an eye-to-head symmetry test;
  - a surface-tag audit;
  - trial accuracy by factor.

**Recorded before building (Nov 8), so the exit note can be read against it:**
- **The seed, as the bench runs it.** The body lane's bench (`src/sim/game/benches.ts`) keeps the seed beside the lab's work, as lab A's does:
  - **Prone:** today's motor, a single 0.3 m circle standing in for a body lying 1.75 m along its facing.
  - **Lean:** a camera moved beside the head while the shape that guards see stays where it was (Dishonored's hidden lean; Siege before 2019 had the eye at the far side of the head).
  - **Mantle:** the endpoint validated once, as The Dark Mod's was (its bug 4509); the path runs on after that whatever walks into it.
  - **Ladders:** Source's ladder with fixed dismount points, checked when placed.
- **Where the seed falls short, in the bench's terms** (the prone figures are measured on `main` at `e92acd1`, with the fuzzing bot):
  - **Prone clips.** The lying shape goes up to 0.17 m into solids in TAL-4471, 0.55 m in MUD-9031, and 0.58 m on the movement course (702 of 8,376 prone ticks).
  - **Turning prone between walls 1 m apart** leaves 303 of 360 ticks with a body part inside a wall, up to 0.32 m deep.
  - **The eye isn't where the head is:** a camera-only lean sees guards who can't see the player's head.
  - **Mantles and dismounts** are checked once, so anything that moves in afterwards clips.
- **The target, in the bench's metrics:**
  - **Zero broken promises** over the weekly fuzz run (40 hours of play), with bots that lean into walls, mantle into moving guards and turn prone between walls. Every pose of every motor mode is checked every tick.
  - **Prone:** zero pose-ticks with any part of the body's shape inside something solid, under the fuzzing bot and in a scripted turn between walls 1 m apart; the worst overlap stays under the watch's 0.1 mm.
    - *Measured after building (Nov 8), and short of this for the shape:* the chain itself stays within the watch's 0.1 mm, with no broken promise in the fuzz, and the turn between walls is clean (0 poses, against 259 for the seed). The straight capsules along it can still cut a corner they lie over, a leg down a stair or across a ledge. With the fuzzing bot, ten minutes on the course and five each in two valleys: 548 of 16,869 lying poses have a part over 2 cm inside something, the deepest 16 cm; the seed has 3,258 and 49 cm. (A review moved this from 398 and 27 cm: a lying body no longer takes a waist-high wall for the ground, which costs more shallow cuts and removes the deepest ones.) Bending the legs, or lifting the body over the corner, would close it. It's left until the body has a real pose.
  - **Lean:** the eye is the centre of the head guards target, so a line from the player's eye to a guard's head and the line back agree, bit for bit, over 2,000 sampled lean poses at corners.
  - **Mantle:** zero ticks inside a guard who walks into the landing, where the validated-once seed runs through him.
  - **Surface tags:** zero cells whose tag differs from their drawn material.
  - **Trials (C8):** A's protocol and pass mark, 80% balanced accuracy over two sittings, with accuracy reported by the factor that flips each outcome: surface, gait, distance, masking, light.

**Milestones:**
- [x] C1 · The lab scene: the course grown into an arena with:
  - lit and shaded ground, and every surface;
  - a guard listening and one watching;
  - walls to mantle, a window, a ladder, and a body to carry.
  - It stands at `?scene=movement-lab` (`game/scenes/movementLab.ts`): the noise yard, the wall garden and the field.
- [x] C2 · The prone body's real shape.
  - A chain of circles along the facing, or a capsule, for collision, in place of a 0.3 m circle. It grows over the transition, so it never ends a tick inside anything.
  - It turns by the largest yaw that keeps every part clear, found with a fixed number of bisections, pivoting near the chest.
  - It's pitched from the terrain under head and feet.
  - It moves every golden (the fuzzing bot goes prone, `game/bots/chaos.ts`), so it lands alone.
- [x] C3 · Lean.
  - The eye sits at the centre of the simulated head that guards target.
  - A peek exposes one eye; a lean with the weapon goes far enough to clear the corner (Ground Branch).
  - Rate-limited and swept against solids and bodies.
  - A property test: whenever the player can see a guard past a corner, the guard has a line to the player's eye.
- [x] C4 · Mantle: a motor mode onto and over low walls, and through windows.
  - Three probes find the ledge: forward at several heights, down for the top, and an overlap at the landing pose.
  - Eased phases: hang, pull, shift, push.
  - Every pose is re-checked every tick. A 1.2 m mantle over 0.6 s rises 0.067 m per tick.
- [x] C5 · Ladders: a motor mode, with validated dismount poses, on D's towers, and with links for E's navigation. Each new mode states its invariants in the motor's header and joins the invariant run (rule 10). The fuzz bots learn to lean into walls, mantle into moving guards and turn prone between walls.
- [x] C6 · The use action.
  - Carry or drag a body: slow, and noisy on gravel. The body reuses the prone chain.
    - Landed differently: a dragged body trails the carrier and stops short of what's behind it, but it isn't a collider of its own, and carried it is out of every sight line and bullet (its carrier is what's seen). A chain of its own would need a body that collides while it isn't one.
  - Hide it in foliage or a container, where guards don't see it.
  - E's sabotage uses the same action.
- [x] C7 · The player's own light and noise, read from the world.
  - The drawn shade and your own footsteps, at their simulated loudness. Landed: the lab's shade is drawn as simulated, held to `groundLight` by a test; your own footsteps play at their radius (the browser audio test).
  - An audit that every cell's surface tag matches its drawn material (`tests/surface-audit.test.ts`). Hunt shipped silent footsteps from mis-tagged surfaces.
  - A small cue on the body, only for what the world can't show (ambient masking and light from behind), and only if the trials fail without it. Not built: it waits for the sittings.
- [x] C8 · Noise and visibility trials, with A's trial mode.
  - Landed: `?trials=<seed>&lab=movement`, 5 warm-ups and 30 scored, 15 noise and 15 visibility, scored by lab A's protocol (`game/movementTrials.ts`, `scenes/noiseScenario.ts`). The factors reported are the surface, the gait, the distance, the masking, the light and the skyline. The owner's two sittings are the exit test, below.
- [ ] C9 · Feel: whether 30 Hz interpolation is responsive enough, and whether moving feels deliberate. Since every rate is per second, a blind comparison of 30 and 60 Hz is possible in the owner's sitting.
  - Built: `?hz=<n>` and `?hz=blind`; the debug view says which rate it picked. The judgement is the owner's.
- [ ] Exit test, the bench numbers, a note, a playable link.
  - The bench against the seed, as it stands (Nov 8):
    - Zero broken promises over the weekly-size fuzz: 44 hours of play in 20 valleys, the lab and the course, both bots, and 100 generated ladder towers with a bot that climbs them. Every body is checked every tick, but the valleys and the lab mostly exercise walking, lying and leaning; ladders and mantles over ladder tops come from the towers. The save, restore and re-step synctest passes over all of it.
    - Lean: 0 of 2,000 lines from the eye to a guard's head differ by direction; the seed's camera-only lean, 19.
    - Mantle: 0 ticks inside someone walking across the landing; the seed's once-checked path, 15.
    - Prone: 0 poses inside a wall turning between walls a metre apart, against 259 for the seed. Under the fuzzing bot the drawn shape is short of its target (see above): 548 of 16,869 lying poses over 2 cm, 16 cm at worst, against 3,258 and 49 cm.
    - Surface tags: 0 cells whose tag differs from their drawn material.
    - Trial accuracy by factor comes from the owner's two sittings.
  - Playable at `?scene=movement-lab`, and a sitting at `?trials=<seed>&lab=movement`.

### D · Camp generator

Playable at `?seed=<seed>` and `?explore`. Design doc: Maps and procedural camps. Research: `docs/research/labs.md`, Lab D.

The core mission's archetype is a **compound** (owner, Nov 7). It's built as data, so a logging camp or a comms relay can follow in Phase 3.

**The seed, and the target:**
- **Seed:**
  - XCOM 2's plots and parcels;
  - Spelunky's solution-first skeleton;
  - point budgets;
  - Brogue's chokepoints and fixed retries;
  - McGill's space-time analysis;
  - Xu's patrols;
  - ridges placed as features.
- **Where it falls short:**
  - Random-tree search can't certify that a path exists.
  - Solvers run on time-outs.
  - Floor plans only.
  - No clustering by mutual visibility.
  - Perch coverage counted ambiguously.
- **Beyond it:**
  - Infiltration certified exactly, by safe intervals.
  - A certified sightline graph. No published method clusters guards by mutual visibility over time.
  - An exhaustive no-single-perch check, with counter-perch, alarm-reach and escape rules.
  - Diversity proven by bots.
  - Local repair.
- **Bench:**
  - 90 of 100 on a held-out series, with iteration margins;
  - safe-interval search matching brute force;
  - zero rule violations;
  - distinct plan signatures before review.

**Recorded before building** (Nov 8):
- **The seed, measured** on 100 held-out valleys with today's generator (`npm run seeds -- --count 100 --from lab-d-seed`):
  - 100 of 100 valid at the first attempt, by rules that ask only for overwatch from 3 of 8 sectors and access from 4 of 16;
  - overwatch from all 8 of 8 sectors in every valley: the ring the owner found too easy;
  - access from all 16 of 16 sectors: no chokepoint, so no approach differs from another;
  - one hand-made camp, mirrored, with 7 guards in 3 roles. Nothing analyses who sees whom, what a perch covers, or whether a way in exists.
- **The targets, as numbers:**
  - **camps:** at least 90 of 100 held-out seeds valid at their first camp attempt, the rest repaired within the iteration budget, each seed's margin reported;
  - **terrain:** overwatch from the two or three placed ridges only (perches over at most half the horizon, with an open side of at least 120°), confirmed by radial-sweep viewsheds; the camp reachable on foot from at least 3 of 8 directions, and two ways out that share no chokepoint;
  - **infiltration:** safe-interval search agrees with brute-force space-time search on every small test camp, on whether a path exists and on its cost;
  - **rules:** no violation over the 100: no perch above 60% of guard time or 25% of the target's, and the three companion rules;
  - **diversity:** the bots' best plans give 10 distinct signatures over 10 random camps before any review, and each camp's own plan does best on it in the regret matrix;
  - **budgets:** at most 16 guards, by count; every search, repair and retry stops after a fixed number of iterations.
- **Counting, pinned before D8,** as the research asked: a perch's coverage of a guard is the share of the camp's cycle that guard is in its view, sampled every half second. Both perch rules count this way.

**Milestones:**
- [x] D1 · The one deliberate `GEN_VERSION` bump.
  - Scatter that depends only on seed, label and cell, so generated objects keep stable ids and a repair touches only its own cells.
  - Range reduction for `dsin` and `dcos`, for |x| ≥ 10⁶ only. Both functions drive the simulation too, so a test shows that no simulation input reaches it and that the math golden doesn't move.
  - TAL-4471 gets a new golden.
  - It lands alone.
- [x] D2 · The seed explorer, first version: a grid of camps with their validation results.
  - `?explore` (`&series=<name>&count=<n>`, the same seeds `npm run seeds -- --from <name>` reports on). Workers generate the camps; each card shows the valley and the camp from above, with the validation results, and opens the seed to play. The survey it draws (`generation/survey.ts`) is where each later milestone adds its layer.
- [x] D3 · Terrain with teeth.
  - Two or three ridge spines placed on chosen bearings 150–500 m out, before noise. They're verified by viewsheds computed with a radial sweep, so overwatch comes from a few sectors, not a ring.
  - Cliffs and chokepoints, so the choice of approach matters.
  - Validation tightens.
  - **Built** (`generation/landform.ts`, `overwatch.ts`, `campWorld.ts`). A mission with a camp spec (`campMission`, `?camp`) gets it; Phase 0's valley stays the default until D9.
    - Two or three spines 240–420 m out stand around one side of the horizon, leaving an open side of 130–170° where the road comes in.
    - Each camp face is a cliff band broken by one or two walkable gullies. The creek crosses the open side, passes the camp and leaves between spines, with banks too steep to climb except at its fords.
    - The checks: every placed ridge overlooks the camp, overwatch covers at most half the horizon, the open side is at least 120°, the camp is reachable from at least 3 of 8 directions, and two ways out share no chokepoint. A valley that fails is re-rolled, up to 8 times.
    - 60 of 60 valleys passed at the first attempt; the bench pins 6 of 6 held-out ones, overlooked over at most 157° with an open side of at least 164°.
- [x] D4 · `CampSpec` and the compound, laid out in plots and parcels from handmade modules.
  - The skeleton goes down first: a perch line, a low-exposure corridor, a reachable sabotage node, two exfil corridors and the escape route.
  - Then the parcels:
    - the gate and perimeter;
    - towers with ladders;
    - buildings with doorways, including the target's;
    - cover clusters;
    - the generator, the radio mast and alarm boxes;
    - vehicles, including the escape vehicle.
  - Doors and vehicles are entity kinds with a `solid`.
  - **Built** (`generation/compound.ts`, `game/camp.ts`).
    - The skeleton goes first: a breach on the side facing a ridge (whose gully comes down toward it), a corridor with low cover to the target's back door, the generator's shed beside it, the breach and the gate as two ways out, and the escape route (building, vehicle, gate, road).
    - Then the plot: a fence 88–104 m a side with its gate toward the road, two to four corner towers with ladders (away from the breach first), a clear lane for patrols, and the road to an open yard.
    - Then seven parcels from modules: the target's building (two doors), barracks, mess, storage, the radio room and its mast, the generator's shed, and the motor pool (the escape jeep and a truck). Buildings are hollow: walls with 1.5 m doorways (narrower ones don't pass the 0.5 m grid at every angle), lintels, roofs. Light poles, alarm boxes and cover clusters follow.
    - Doors (open, swung into the room) and vehicles spawn as entities after the guards, each with a solid. Their data is in `camp.doors` and `camp.vehicles`, and tower ladders are in `camp.ladders` for lab C.
    - Tested on five seeds: the corridor reaches the target, the generator is reachable, both ways out and the escape route are walkable, every doorway passes on the grid, nothing overlaps, the camp moves with its site, and a minute of the person-like bot breaks no promise of the motor's.
    - Its guards are a placeholder until D6.
- [x] D5 · Systems: the generator powers the lights, the alarm boxes and the radio; the objective.
  - **Built.** The camp's devices are data (`camp.devices`, each wired to the one generator) and its objective (`camp.objective`: the target, his building, his escape vehicle).
  - In a run they are entities (`game/camp.ts`):
    - `generator` (running);
    - `light` (on);
    - `alarm` (powered, raised);
    - `radio` (powered, working);
    - `objective` (open, done or escaped).
  - `camp-power` (phase 'world') powers everything on a running generator's circuit. `objective` (phase 'mission') marks the target's death.
  - The debug view draws the wiring, live or dead. The `camp-systems` scene cuts and restarts the generator and takes the target, and is pinned as the generation lane's run.
- [x] D6 · Staffing.
  - All seven roles, bought with points under the 16-guard cap.
  - Sentries at the real chokepoints Brogue's method finds.
  - Patrols on skeleton roadmaps, with a grammar of stops and scans, timed to open and close windows.
  - Routines stay pure functions of time.
  - **Built** (`generation/staffing.ts`, `patrols.ts`, `chokepoints.ts`).
    - Points from 16 (easy) to 40 (hard): one of each role first, then extras by a priority list leaning on patrols and marksmen when hard, sentries and workers when easy. That gives about 8, 12 and 15–16 guards.
    - Chokepoints are minimum vertex cuts (max flow) between the camp's zones, no wider than 10 m. This is Brogue's question generalized from one-cell corridors to passages metres wide. Sentries stand there, or at doors, kept 8 m off the skeleton's corridor.
    - Patrols walk the perimeter lane, the yard and the alleys along grid paths pulled taut, with stops from a grammar: glance, quarter turn, half turn, sweep, full turn.
    - Every routine divides one camp cycle (160–300 s, longer only if a route needs it), so the camp repeats exactly. Patrols that share a lane run it the same way round.
    - Each walking guard tries up to 12 start times until no guard on routine comes within 1 m of another, all cycle long. The last of a role who can't is posted at a stop, so all seven roles stay. Guards then keep to their routines through the motor within 25 cm.
- [x] D7 · Analysis on the grid.
  - Infiltration is certified with Safe Interval Path Planning against the routines' known trajectories. It allows exposure that stays below A's fill rates, and is checked against brute-force space-time search on small camps.
  - The sightline graph: directed witness edges, each carrying the intervals of the cycle when it holds. Its strongly connected components are the clusters. Each cluster is certified by a bounded search for a kill order inside the reaction window, or for a split by sabotage or distraction.
  - Coverage and idleness heatmaps, perch scores, exfil routes and the escape route.
  - Generation reads only `tuning.gen`, so its sight model is its own, and a scenario-runner check holds it to A's detection at sampled points. A retune of A then never changes a valley.
  - **Built** (`generation/raster.ts`, `field.ts`, `sight.ts`, `infiltrate.ts`, `clusters.ts`, `perches.ts`, `campAnalysis.ts`). Every world with a camp carries its analysis (`report.camp`), and the explorer draws it.
    - A 1 m raster in the camp's frame, and one cycle sampled every half second. The exposure field sums every guard's view, by D's copy of A's law for a crouched intruder on the move: A's zones, ramps, fill, cap and contact zone. A's scenario runner holds it to A at 112 points: never later than A by more than a sample, never twice as quick inside a zone.
    - SIPP with a 128-level meter, its labels in Pareto fronts per interval. It agrees with brute force and the plain space-time search on 400 small camps. The bench pins it against the plain search on its hardest way in (11,532 states to 100,478).
    - The ways: in (to a close shot at the target: within 12 m, a clear line, outside his contact zone), to the generator, and out.
    - Clusters are the strongly connected parts of the witness graph. They are certified watchers first by a bounded search: chains inside the 1.5 s reaction, waits for windows, relocation between perches, one distraction.
    - Staffing places each guard so the graph stays within limits (no part over 4, one over 3 at most) and the corridor stays a way in.
    - The analysis carries every camp's way in, to the generator and out, and its clusters; D8's rules read them.
- [x] D8 · Validation and repair.
  - The design doc's rules, plus **no single perch wins**, checked exhaustively over the finite list of perches.
  - Both perch rules count coverage the same way: the share of each guard's time in view over the cycle, or a minimum time in view. Never "ever in view", which would count every passing patrol.
  - Starting values, for any one perch:
    - it sees at most 60% of the guards;
    - it sees the target at most 25% of the cycle;
    - at least one guard in its view is watched by a guard out of its view, so a shot there is witnessed unless it's timed.
  - Three companion rules:
    - every perch is overlooked by a marksman post or a counter-perch the camp can reach;
    - no alarm box or antenna lies within fire of a perch that sees many guards;
    - the escape route is interceptable only from perches other than the best overview.
  - Repair is a bounded greedy search over a fixed list of operators (move a sentry, shift a patrol's phase, swap a module, add cover, re-time a light circuit). Each attempt draws from its own labelled fork and stops after a fixed number of iterations (rule 18).
  - Difficulty comes from cluster count and size.
  - **Built** (`generation/validate.ts`, `repair.ts`, `plans.ts`, and in `compound.ts` and `staffing.ts`). Every rule above, measured as `docs/decisions.md` says, with `seeds --camps` reporting first attempts, repairs, rebuilds and each seed's margin.
    - The generator builds to the rules first: the antenna and alarm boxes hidden from the overviews (walls, else indoors), the target's walk and his vehicle chosen against the perches, workers and the officer waiting indoors, posts moved off a dominant perch.
    - Repair: shift a patrol's phase, turn or move a post, or move it out of an offending perch's sight, kept only if the camp comes closer to valid, within 12 re-analyses. A camp it can't save is rebuilt from fresh forks, up to 3 times.
    - Firing the reviewers' plans in the simulation (`npm run plans -- --evaluate`) corrected two more: a perch is ground a body can lie on (at most 40°), and its eye is the body's prone eye. Lab C's check gave each tower's rail a gap at the ladder's head.
    - Running the ways in through the real simulation (`npm run plans -- --simulate`) corrected four things in D7's model: the crouched pace (a step takes 5/9 s), towers (open under the roof), how the raster stamps thin things (by cell centres, so a certificate of stealth errs the safe way), and a margin (a certified way may fill the meter only to 85%). With them, every way in tried held in the simulation.
- [x] D9 · The valley switches to the generator, and the test camp retires. It lands alone. (Lab D held this for the owner's go-ahead. It isn't a taste call, so it went ahead without one: `docs/decisions.md`, After the labs.)
  - **Built.** A mission that names no camp gets the default compound, and its spec says so, so a recording names its camp. Phase 0's terrain, camp and analysis are gone, with the tuning only they read. `GEN_VERSION` 5.
- [ ] Exit test, the bench numbers, a note, a playable link.
  - **Where it stands (Nov 8), waiting on the owner:**
    - **Two questions, for the camps' sitting:**
      1. **Answered Nov 8: contest it, through how a camp fights rather than through the generator (`docs/camp-engine.md`).** Should camps steer players away from the ridge shot at the target? The default proposed was to keep all three approaches but vary how contested that shot is, so that in some camps every clean moment is watched or brief. The alternative is to leave it to lab E's reactions and accept the signature test as too strict for now. Measured with the camp answering (E12, above): one timed shot takes the target in 28 of 30, and the camp then doesn't get near the shooter, so lab E's reactions alone won't change it.
      2. Are sightline hard cores bigger than the intended 4 all right? 22 of 100 camps have one, the largest 7, because tower marksmen now see properly. They make camps harder rather than broken.
    - **The held-out series passes:** 97 of 100 at the first camp attempt, 3 repaired or rebuilt, none invalid (`lab-d-exit-3`).
    - **The bots prove diversity:** 36 distinct best-plan signatures over those 100, and 8 of 10 on the review set, whose plans are clearly worse elsewhere in 77 of 90 cases.
    - **The reviewers:** 3 agents, 10 camps. Their plans work (29 of 30 on D's model; 24 of the 28 rifle plans dropped their guards in the simulation) and they agree (19 of 30 pairs).
    - **"Clearly different" does not pass on the reviewers' signatures.** 29 of their 30 plans are the same kind (shoot the target from a ridge while he's out on his walk, unwatched), so 7 to 12 of the 45 pairs of camps share a signature. `docs/decisions.md` (Lab D) has the numbers and why; whether camps should steer players away from that shot is the owner's call.
    - **The owner's spot check of three camps** is still to come.

### E · Camp brain

Playable at `?scene=camp-brain`. Design doc: Enemy awareness and the camp brain; Adaptation, within a mission. Research: `docs/research/labs.md`, Lab E.

**The seed, and the target:**
- **Seed:**
  - from The Last of Us: its states, scores, coordinator and search map;
  - Halo 3's Objectives;
  - Blacklist's behaviours;
  - Metal Gear's check-ins;
  - Left 4 Dead's pacing shape.
- **Where it falls short:**
  - Searches and directors that read the truth.
  - Budgets in milliseconds.
  - Per-guard maps too big to hash.
  - Weak counter-snipers.
  - No published delays.
- **Beyond it:**
  - A camp as competent as a cheater, without cheating: measured against an omniscient baseline, then throttled.
  - Searches ended by belief.
  - Calibrated triangulation.
  - Marksmen who hunt.
  - Escalation that can be interrupted.
- **Bench:**
  - no-omniscience over the whole brain;
  - search cycles of 30–45 s;
  - the ellipse's coverage near 39% and 86%;
  - the perfect shooter fails and a planner succeeds on every camp;
  - zero unexplained reactions.

**Recorded before building (Nov 8), so the exit note can be read against it:**
- **The seed, as the bench runs it.** The bench keeps the seed's policies as brains of their own, run on the same camps, beside the real one:
  - **The seed search:** The Last of Us's shape without its cheat (close on the last known position; after 10 s unseen one guard goes to check; a timed sweep; a timer ends it, with no map and no check of the truth).
  - **Xu and Verbrugge's four baselines:** a random walk, a plain state machine, a staleness search and an omniscient chaser.
- **Where the seed falls short, in the bench's terms:**
  - **Search cycles.** The seed's honest cycle runs far past the target: The Last of Us's focus tests averaged nearly 2 minutes (about 120 s), and it reached 30 s only by checking the player's true position.
  - **Truth.** The omniscient chaser, and any director or search that reads the truth, fails the no-omniscience probe at its first decision.
  - **State.** Per-guard maps over the valley would put about 410,000 numbers into the hashed state.
  - **Budgets.** The seed's are milliseconds; nothing about them can be pinned.
  - **Counter-snipers.** No published model is calibrated: nothing says how often a stated ellipse contains the shooter.
- **The target, in the bench's metrics:**
  - **No-omniscience, over the whole brain.** Zero leaks: every guard's mind, the commander's input and the pacing layer's are hashed, in runs with the player at two places beyond every sense; every layer has a planted peek the probe catches.
  - **Search cycles.** From the last percept to the end of the search, 30–45 s in at least 90% of the seeded runs of the search scenario, with the same length to the bit wherever the unsensed player is (ended by belief, never truth).
  - **The camp's memory.** One search map of at most 5,000 numbers, against the seed's 410,000.
  - **Calibration.** Over at least 400 seeded shots, the fused ellipse contains the true perch 39% ± 5 points of the time at one standard deviation and 86% ± 5 points at two, and it shrinks with repeated shots from one place.
  - **Relocation emerges.** At ±5° and 300 m, a shooter who moves 26–30 m between shots is outside the camp's two-sigma ellipse at least half the time, with no meter anywhere.
  - **Competence.** On the same camps, the honest brain re-finds an evading bot at least 80% as often as the omniscient chaser, ahead of the staleness search, the plain machine and the random walk (their published order). Pacing then throttles it deliberately, so it is fair by design.
  - **One overlook doesn't clear the camp.** On every validated camp, a perfect shooter on the best perch fails, and a shooter who relocates, splits clusters and times shots succeeds.
  - **Explained.** Every reaction has a reason code and a chain of causes back to a percept: zero exceptions over the bench's runs.
  - **Seen to react.** A shot from 300 m gets a reaction a watcher can see inside the design's window: at most 2 s.

**Milestones:**
- [x] E1 · Navigation on the grid search (W0.5) (`brain/nav.ts`, `tests/nav.test.ts`).
  - Coarse routes over the map layer and a fine local grid over the camp.
  - A\*, with fixed tie-breaks and an iteration budget; paths string-pulled and followed through the motor.
  - Stepping around a cornered player: a stalled walk sidesteps by a fixed rule (own-body information only), comes back to its route, and tells the brain when it can't.
  - Ladder links (C5): waiting on lab C's ladders.
- [x] E2 · The lab scene (`?scene=camp-brain`): 8 guards in the design doc's roles and the target, an alarm box, a radio, a generator and a truck, in a handmade camp until D4–D6 are on `main`.
- [x] E3 · The brain (`brain/brain.ts`, `brain/utility.ts`, the `act` event).
  - A prioritized machine of awareness states.
  - Inside each state, actions (investigate, call it in, take cover, flank, search) are scored by multiplied 0–1 considerations through response curves, with cooldowns against dithering.
  - Rank-then-weight choice, drawing from the guard's own stream through the mind (rule 13).
  - A reason code on every transition.
  - It replaces A's minimal reactions wherever the camp brain runs (a guard given a `brain`); lab A's own scenes and trials keep them, so what they measure doesn't move. Take cover and flank come with E10.
- [x] E4 · Beliefs spread (`brain/searchMap.ts`, `brain/reports.ts`, `game/comms.ts`).
  - One camp-level search map, fed only by reports: a grid that spreads from the last known position and clears where searchers can see. Per-guard maps would put about 410,000 numbers into the hashed state.
  - Voice to guards nearby, heard through A's hearing.
  - Radio across the camp after a delay. A report is an action with a duration, and its delivery is cancelled if the speaker drops. The radio needs a working set and an operator.
- [x] E5 · The camp (`brain/camp.ts`, `brain/commander.ts`, `game/comms.ts`).
  - Alert levels: calm, uneasy, alert, lockdown (the last set by E7's alarm boxes).
  - The commander assigns tasks with a priority, a condition and a capacity, in the manner of Halo 3's Objectives, over guards. Ties break by task index, then guard id.
  - The pacing layer reads only the camp's beliefs, caps convergence with role slots, and throttles rather than informs.
  - Searches end on time since the last percept and the search map's spread, never on the player's true position. Cycles run near 30–45 s, and the camp settles one level up.
  - The no-omniscience probe covers the commander, with a planted peek it catches.
- [x] E6 · Radio check-ins, as scheduled events (`game/comms.ts`). The operator calls each post every few minutes. A dead post doesn't answer, the camp goes uneasy, and someone walks over.
- [x] E7 · Alarms.
  - Done (`game/comms.ts`, `brain/brain.ts`, stand-in boxes until D's devices land): after the reaction window, a guard runs 4–8 s to an alarm box, a journey through the motor; lockdown is set only by the box changing state; dropping him or cutting the power interrupts it.
  - The core's sabotage, by default: hold the use key at arm's length to switch off the generator or cut the radio. Whoever passes or needs it notices the outage. The sabotage kit is Phase 3's.
  - At lockdown, the target runs for the vehicle when he hears the siren (`flee`); reaching it loses the mission, and dropping him first wins it. The drive away needs bodies to ride moving solids (with C).
  - **Built on generated camps** (`game/sabotage.ts`, `game/escape.ts`, `game/doors.ts`). Holding use at arm's length stops the generator, breaks the radio at its set or mast, or disables the target's vehicle. Nobody is told: a guard who looks at stopped equipment takes notice, the operator finds a dead set at the next call, and a runner finds a dead box. A stopped generator stops humming and masking. His truck drives out through the gate, swerving round anyone in the road, and the mission is lost only when it's gone; a sabotaged one strands him beside it, still to be got. Bodies still don't ride moving solids: he is gone from the camp once he's in the cab.
- [x] E8 · Counter-sniper and reinforcements. Triangulation from real shot and crack percepts, with a calibrated ellipse (`brain/triangulate.ts`), marksmen sweeping the estimate and following newer fixes, a visible reaction inside 2 s, guards under fire taking cover, and reinforcements at lockdown, by truck up the camp's road on a generated camp. Marksmen stay on their towers: measured over 16 camps, a tower already overlooks 98% of the perches and every camp's best overview, so leaving one (which needs ladder links in navigation) waits until a sitting shows it's missed (`docs/decisions.md`, The camp's equipment).
  - **Honest triangulation:**
    - every guard who heard the report or the crack forms a bearing, with error from his own stream;
    - reports reach the commander by voice or radio;
    - the commander fuses them, in a fixed order, into an ellipse that shrinks with repeated shots.

    About 26 m of relocation at ±5° and 300 m then emerges with no meter.
  - **Counter-snipers hunt.** They move to overlooking posts, sweep candidate perches in the order of belief, and glint (done: a marksman on a sweep flashes at the player, by lab B's `glint`, in the honest view; `game/sim.ts`, `render/guardMeshes.ts`).
  - **The reaction is visible.** A shot from 300 m gets a visible reaction inside the window: Halo's playtests found that sniping makes AI look oblivious.
  - **Reinforcements** arrive by truck after a delay, as a squad that hunts.
- [x] E9 · Found bodies and adaptation within a mission (`brain/commander.ts`, `brain/brain.ts`). All of it comes through A's perception, and only from incidents the player caused and could see.
  - A body found means alert: a guard who sees a body reports it (`report` kind `body`), the camp goes on alert.
  - A ledger of habituation by stimulus and cell, so repeated tricks lose effect: the third rock at one spot draws two guards and an unverified radio report.
  - Floors on decay, so posture stays up: a search settles the camp one level up, and A's ladder keeps its raised floor.
  - Memory of incidents, such as a perch with casualties: where shots and bodies were reported (`camp.incidents`).
  - Bodies in the open push guards off exposed sightlines: guards near a found body are ordered behind cover for a while.
- [x] E10 · Minimal combat (`game/combat.ts`, the `engage` and `cover` acts).
  - Guards engage, take cover and call support, with lab B's bullets and sounds.
  - The player's health is two or three hits (`tuning.brain.combat`), and the player can die (`game/combat.ts`, `campRules`).
  - Phase 2 only joins labs, so this is built here.
- [x] E11 · Sandbox body drops: L in the debug view drops a body where the player looks (lab A's A9/A10 sandbox); the camp finds it as it would any body (`tests/commander.test.ts`).
- [ ] E12 · The scenarios and the baselines (see Exit tests). Done: the scenario family `camp-scenario` (suspicion, search, alarm, escape), the search-cycle and calibration benches, the relocation metric, the honest brain against Xu and Verbrugge's baselines (`game/baselines.ts`, pinned in the bench), and "one overlook" from both sides (`?scene=overlook&params=seed=<seed>%26plan=clear`, or `plan=timed`, pinned in the bench). Still open: the seed search isn't on the bench yet, every report of the same body adds its own cover order, and "one overlook doesn't clear the camp" doesn't hold on every camp.
  - **One overlook, measured on 30 fresh camps (Nov 8):** a perfect shooter on the best overview, one shot every 5 s, the target last, drops 8.7 of 9.6 guards on average. In 22 of 30 the alarm goes up and the target gets away, so the mission is lost. In 2 of 30 he clears the camp outright. A shot as fast as the bolt allows: 8.2 of 9.6 down, 10 of 30 lost, 1 of 30 cleared. **It stops the mission, but it doesn't stop the killing:** whether that meets the owner's "shouldn't be so easy as to take everyone out" is the owner's call at the camps' sitting. Getting guards under cover at the first shot was tried and made it worse (`docs/decisions.md`, One overlook).
  - **One timed shot, the other side:** a shooter on a certified perch waits for the target's head to be in a clear line with nobody watching, a median 138 s in, and wins 28 of 30, with the camp awake. That is the ridge-shot question in numbers: the camp can't answer a shot it can't see coming, and the lab's mission ends with the target. Phase 2's exfil is what makes getting away part of it.
  - **After that shot, with the shooter staying put for two minutes more (28 kills):** the alarm went up in 20 (median 8 s after the kill), and nobody saw him or hit him in any of them. The nearest any guard came was a median 223 m, and the camp's estimate of the perch was a median 83 m off. **The camp's reaction doesn't yet make getting away any harder.**
- [x] E13 · The camp brain on generated camps (added Nov 8). So far it had run only on E2's handmade camp: a generated camp's guards perceive (A13), but they had no brain, commander, radio or rules, and the player no rifle. A scene puts all of those on any validated camp, using that camp's own devices, so that E7, E8 and E12 can finish there and the owner can play it. It stays a scene: the default valley's behaviour doesn't move until Phase 2.
  - **Built:** `?scene=live-camp&params=seed=<seed>` (`scenes/liveCamp.ts`). The commander's record of the alarm boxes and the radio is kept from lab D's entities (`campDevices`), and raising a box raises the entity. On the three spot-check camps, a marksman firing from the best overview draws a reaction inside 2 s, the alarm goes up at one of the camp's own boxes, and the target gets away; every reaction reads back to something sensed (`tests/liveCamp.test.ts`).
- [ ] Exit test, the bench numbers, a note, a playable link.
  - **Ready for the owner's sitting:** `?scene=live-camp&params=seed=<seed>` puts the whole brain on a generated camp, with the rifle. `?scene=camp-brain` plays now on the handmade camp, for an early look that doesn't count.
  - **What to try** (F3 opens the debug view, which lists each guard's act and the camp's state; M marks a reaction you can't explain):
    - Walk toward the gate. The sentry looks up, walks over or calls it in. Move off, and watch him go back when he finds nothing.
    - Make a noise near the gate, or press K in the debug view to drop one: one guard goes, and the others look that way but stay put.
    - Run once you've been seen. The camp radios, goes on alert, sends search teams to where it last believed you were, and stands down one level higher about 30 s after the last news.
    - Shoot from far away. Guards look up inside a second, report it by radio, and the marksman turns to sweep where the camp believes it came from.
    - Get a guard into combat near the alarm box: he runs for it. Shoot him first and it never sounds. Let it sound, and reinforcements come, and the target runs for the truck.
    - Press L in the debug view to drop a body in a guard's sight: he finds it, and the camp goes on alert.
    - Fire last. In one scripted run, one unsuppressed shot from the ridge led to the siren 5 s later and the target away 11 s after the shot, before a second shot could matter.
  - **Three questions for the sitting:**
    1. Radio calls play as murmurs with captions. Is that enough, or should the camp's level be shown to the player? It isn't shown anywhere in the honest view.
    2. A search comes out at about 30 s, the short end of the plan's 30–45 s. Long enough to be a real search, and short enough not to drag?
    3. How bold should the run for the alarm be? As it stands, a worker who hears a shot runs for the box, and so does any other guard in combat within a sprint of it. Should a worker go only once someone has seen the shooter, or only when near it and alone?
  - **The bench against the plan's targets** (`npm run bench`, lane brain):

    | Measure | Target | Measured |
    | --- | --- | --- |
    | Search cycle | 30–45 s | 30.3 s |
    | The camp's search map | at most 5,000 numbers (the seed's: about 410,000) | 4,096 |
    | Ellipse holds the perch, in the world, at 1 and 2 sigma | 39% and 86%, ±5 points | 41.2% and 86.6% |
    | A 26–30 m move at ±5° and 300 m ends outside 2 sigma | at least half the time | 50.5% moving across the line of fire; 29.5% in any direction |
    | Re-found within 60 s, of 16 | honest at least 80% of omniscient, and ahead of the rest | honest 15, unpaced 16; staleness 13, plain 13, random 2, omniscient 16 |
    | Reactions unexplained | 0 | 0 of 62 |

### F · The camp fights back

Added on Nov 8, the owner's call. *Labs pass* requires it. Design and reasoning: `docs/camp-engine.md`. Research: `docs/research/notes/labs/camp_defense.md`.

**The seed, and the target:**
- **Seed:** the first-contact drill in LAMBS Danger, confidence in Days Gone, the suppression ladder and reference points in Combat Mission, the countermeasures in FM 3-06.11, the order of events at Wanat.
- **Where it falls short:** games reach for numbers and scripts; the camp is either helpless against a sniper or it cheats.
- **Beyond it:** every capability is a chain of simulated things you can see and cut; the camp knows its own ground as data computed with it; the same honesty as lab E.
- **Bench:** the gauges and experiments in `src/lab`, over paired camps.

**Every step ends with something the owner can play.** A step isn't finished on bot numbers alone.

- [ ] F0 · The bench.
  - [x] `npm run experiment`: the same camps, several ways, compared seed by seed. `friction`, `gallery`, `switch-off`, `dead-ground` and `way-out` reproduce the numbers behind the design.
  - [x] Engine switches (`off=` in a camp scene's parameters), as true absences.
  - [x] Gauges, and the lab panel (`&lab`).
  - [x] A mission ends when you get out (the owner's call): on the live camp, at the end of the road, marked on the compass once the target is down.
  - [x] Trial briefs name only the action (see the exit tests).
  - [x] Fork a run: re-simulation plus one intervention (`src/lab/fork.ts`, `npm run whatif`). `npm run experiment -- relocate` and `-- relocate-quiet` use it for what moving buys.
  - [x] Re-roll the dice on one camp: `tuning.sim.dice`, and `--dice N` on every experiment, which says how much of each number is the camp and how much is luck.
  - [x] A shooter limited to what a person can do, through a view of what a player could see (`game/bots/playerView.ts`, `game/bots/person.ts`), and the ladder of plans (`npm run experiment -- ladder`, the `ladder` scene), which really walks out.
  - [x] A camp fight pinned on the bench (`camp-fight`, the brain lane's first pinned run), kept short for CI. The full ladder runs weekly.
  - [x] A cap on route-finding per tick (`brain.nav.nodesPerTick`, with F1).
- [ ] F1 · The first fight. Fifteen minutes in the owner's hands: what did the camp do, why did you move, what would you do next?
  - [x] A camp that fights (`camp.fights`, `off=fight` for the old one): a whistle heard at 600 m, men who leave the line for spots no listed perch toward the threat can see and come back after a stand-to of 45–60 s, tower men who fire back at the believed point, a near miss that knocks you off your rest, a muzzle flash anyone looking can see.
  - [x] The compound simulator (`?scene=compound`): the camp with no player, and stimuli dropped anywhere. Attack scripts, and flaw detectors (`npm run flaws`, `npm run experiment -- flaws`).
  - [x] Men get out of the line from up to 40 m away and get down when they arrive, crouched or flat by what hides them. Standing in the line fell from 5.5 to 0.9 men per run against a sniper.
  - [x] Reinforcements have a place of their own, so a squad no longer stands in a heap.
  - [ ] Drive the rest of the flaws down. What's left is mostly men caught by a shot they couldn't place.
  - [ ] The owner's sitting.
- [ ] F2 · The camp hunts. Picture and Command, sections that sweep, cut-offs on the road, fallbacks.
  - [x] Stance for guards.
  - [x] Routes that reach the ridges: 99% of post-to-perch routes found (`npm run experiment -- routes`), at about 0.5 ms each.
- [ ] F3 · The camp has means. The counter-sniper pair and the optics law, a crewed gun, close protection, role tells and marking, preparedness levels.
- [ ] F4 · If play asks for it. Mortar, smoke, hardening, Memory, decoys, and the rest of the sandboxes.

### Gate · Labs pass

- [ ] Every exit test passed, with its result and bench numbers recorded here.
- [ ] `docs/phase-1-report.md`, the owner's sign-off, and the design doc's phase notes and decision log updated.

## Gotchas found while planning

These add to the handoff's list.

- **Nothing is shaded.** The renderer draws no shadows, yet shade multiplies detection by 0.6. A4 fixes it before any trial.
- **The sight factors span about 800×,** so rate scaling alone can't produce the design's ranges. The owner's call: range caps (A2).
- **The player's light** was tested about 1.24 m up. A standing player stayed lit across the outer 1.8 m of a ground shadow. The owner's call: the ground beneath the body (A2).
- **"Ever in view" counts every passing patrol,** so both perch rules count time in view (D8).
- **A preview deploy's recording** has `main`'s `SIM_VERSION` but different behaviour. W0.7 adds behaviour fingerprints.
- **Sniping makes AI look oblivious** (Bungie, 2002). This is E's top risk, and why E8 needs a visible reaction to a 300 m shot.
- **The honest view has no crosshair, rangefinder or zoom overlay** (B6).
- **Generation reads only `tuning.gen`,** which is why D7 has its own sight model.
- **Scenes take no parameters,** and a recording names its scene by exactly `{name, version}` (A3).
- **Handmade worlds have no foliage** (A1).
- **The recording's 10 Hz state track stores five values per guard.** In-browser replays re-simulate, so a new guard cue needs only `GUARD_FIELDS` and `snapshot()` in `src/sim/game/sim.ts`, and the state track's sample in `src/sim/game/samples.ts`.
- **`sightline.generate()` ignores the seed inside a scene.** The start screen also has no scene picker, so a lab is reached by `?scene=<name>`.
- **Time scaling exists only in the debug view,** with no automation hook (A10 adds one).
- **The fuzzing bot goes prone,** so C2 moves every golden.
- **three.js's built-in level of detail ignores zoom by field of view,** and depth precision fails at range (near 0.08 m, far 7 km). Don't add level of detail inside the play area.
- **People other than the owner can't open the deployment** (Vercel Authentication). That matters for Phase 2's naive testers.
- **Warner Bros. holds a patent on the Nemesis system.** Doctrine in Phase 3 learns at the faction level, but get a review before adding persistent named enemies.

## Not in Phase 1

- **Phase 2:**
  - the mission flow, from brief to debrief;
  - the tactical map and marking, built on a ledger of what the player has observed, with the player as one more observer;
  - a debrief that sets what the player knew beside what each guard knew;
  - scoring keyed to what the camp ends up knowing;
  - telemetry;
  - the UI's shape;
  - three to five naive testers for A and C before Concept proven.
- **Phase 3:**
  - night, weather and gusts;
  - other tools and ammunition, and the sabotage kit;
  - penetration and helmets;
  - doctrine that learns only from evidence the faction has, named in briefings;
  - other archetypes and objectives;
  - art and production audio.
- **Phase 4:** the daily contract, verified by re-simulation on the day's pinned build, with an attempt token from the server.
- **At a trigger** (`docs/foundation-shape.md`):
  - packages and workspaces once a second game uses the kernel;
  - modes as patches over the base tuning at the second mode;
  - "camp" becomes "base" at the third archetype.
- **Horizons** are unchanged: see `docs/foundation-plan.md`.
