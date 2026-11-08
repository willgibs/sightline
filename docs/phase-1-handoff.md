# Phase 1: start here

> **Planning is done.** The plan is `docs/phase-1-plan.md`. It holds each lab's milestones, the rules for landing on `main` and how each exit test is measured. Wave 0 starts with the kernel boundary in `docs/foundation-shape.md`, and each lab's seeds are in `docs/research/`. This file still says what each lab starts from, and its gotchas hold.

Written on Nov 7, 2026, at the end of the session that ran the foundation pass, so that a new session can plan and build Phase 1 without it. Read `CLAUDE.md` first (Claude Code loads it by itself), then this, then the design doc's Part 2 sections for the lab at hand.

## Where things stand

- **Phase 0 passed its gate,** Engine runs, on Nov 7, 2026. The **foundation pass** that followed is done: `docs/foundation-plan.md` records each milestone (M1–M10), what was deliberately left to the labs, and the Horizons.
- **One item waits on the owner:** checking the deployed build on his Mac with the screen in view. That means frame rate, sound, the runs the game keeps, and a replay. It doesn't block planning.
- **Phase 1 is planned** (`docs/phase-1-plan.md`), and no lab has a branch or a scene yet.
- **`main` is green** at the commit that added this file.
  - CI runs the check on Linux, macOS and Windows, and a 20-minute run gives the same hash on all three (`e9311dda2ac00379`).
  - A 40-hour fuzz run passed, and Chromium, Firefox, WebKit and Bun all give the golden values.
  - The build is deployed at sightline-willgibs.vercel.app.
- **Versions:** `SIM_VERSION` 6, `GEN_VERSION` 3, `STATE_SCHEMA` 7 (W0.3), recording format 9.

## Getting going in a new session

1. **Get the code.** Claude Code on the web clones the repository for you. The owner's Mac has a copy at `/Users/gibby/local/ai/sightline`, which was still at the first commit when this was written, so run `git pull` there before anything else.
2. **Set up:** run `npm ci`, then `npx playwright install chromium` (skip it where Chromium is already installed), then `npm run check`. The check should pass with 30 test files and 213 tests. `npm run test:browser` runs the tests that need a real browser.
3. **Open the design doc.** The live doc is the source of truth: [Sightline · Game Design & Build Plan](https://claude.ai/artifact/Q7JxvgeF1zrrTEWNrFQy7j). A session that can't open it, because it has no Claude Docs connector, works from the copy in `docs/design-doc.md` (revision 36).
4. **Look at the game.** `npm run look` saves the honest and debug views to `shots/`. `npm run look -- --scene movement-course` shows the one scene there is so far. The header of `src/headless/look.ts` lists the options. A script that needs more than pictures can drive the game with `openGame()` from `src/headless/browser.ts`.

## What Phase 1 is

Part 4 of the design doc (Roadmap) defines it.
- There are five labs. Each is an isolated wireframe scene, built to its final quality bar before integration, and the labs can run in parallel.
- Phase 1 ends at the gate **Labs pass**, when each lab meets its exit test.
- Phase 2 then joins the labs into one core mission, which ends at the gate **Concept proven**.
- The labs build only what the core mission needs, each piece in depth. "The core (Phases 1–2)" lists what's in and what waits for Phase 3.
- The Tooling table assigns three tools to Phase 1:
  - **Sandbox mode:** drop a noise, a body or a shot into a live camp and watch it respond.
  - **Seed explorer.**
  - **Scenario runner:** headless fairness checks, such as "crouched in shadow at 30 m: spotted in 3–6 s". The scene harness is its base.

| Lab | Design doc, Part 2 | Done when |
| --- | --- | --- |
| A · Perception and awareness | Enemy perception (sight, hearing, what gives you away, fairness rules); individual awareness and the reaction window | Blind testers predict detection outcomes at least 80% of the time from the honest view alone |
| B · Shooting | Weapons, tools and ballistics. Taste call 3, ballistics realism, is decided here | Hitting a walking target at 300 m feels earned and satisfying |
| C · Movement and body | Player (movement, visibility and noise, vitals) | Moving feels deliberate, and players can predict how loud and visible they are from their stance and the surface |
| D · Camp generator | Maps and procedural camps (scale, the pipeline, the sightline puzzle, validation, seeds) | 90 of 100 consecutive seeds pass validation on the first try, the rest are repaired, and a reviewer finds a clearly different best plan in each of 10 random camps |
| E · Camp brain | Enemy awareness and the camp brain (alert level, beliefs, roles, radio check-ins, counter-sniper, how it's built); adaptation within a mission | A tester facing 5–8 guards can cause and recover from a suspicion episode, evade a search and interrupt an alarm, explain every reaction, and never see a guard act on knowledge he couldn't have |

## What each lab starts from

The foundation pass widened the interfaces every lab extends, so each lab builds on existing seams rather than inventing its own. The tables below say what is already there and what was deliberately left to each lab. `docs/decisions.md` has the reasoning.

Wave 0 then split `src/sim` into the kernel, the lanes and the game (W0.2, `docs/foundation-shape.md`). Each lab works in its lane's directory and reaches other lanes only through their `index.ts`; the lane map is `src/sim/lanes.ts`.

### A · Perception and awareness

| Already there | Left to this lab |
| --- | --- |
| **The perception boundary.** A brain decides from its `GuardMind` alone (`src/sim/brain/mind.ts`). An architecture test and the no-omniscience test in `tests/perception.test.ts` guard it. | **Percepts and beliefs:** the real kinds of percept, and beliefs in the mind. |
| **Sight lines** through the world query (`src/sim/kernel/world/query.ts`). Entities' solid shapes block sight. | **The hearing solver.** |
| **Body shapes** with a head, torso and legs (`src/sim/body/shape.ts`). | **Ambient masking** from the steady sources (`src/sim/generation/ambient.ts`, the list the speakers already play). |
| **The player's visibility** factor from the sight table (`src/sim/perception/visibility.ts`). | **Foliage and sight, both ways.** Canopies block no sight in the simulation, so a guard sees you through a canopy that hides him from you. A bush hides you from a guard, but you see out of it freely. The lab decides; the renderer follows. |
| **Light at a point** (sun, shade, dusk, dark) in `src/sim/kernel/env.ts`. | **Fast paths, only if perception's budget needs them:** a still body skips the motor, and distant guards skip perception. |
| **The law of sound** shared by guards and speakers (`src/sim/kernel/sound.ts`), and footsteps that carry their gait and surface. | |
| **Cues.** The honest view draws only snapshots and events, which is what the shipped game can show. Systems explain themselves in the debug view through `ctx.debug`. | |

### B · Shooting

| Already there | Left to this lab |
| --- | --- |
| **Timed commands.** A `fire` command carries the lag and view angles of the frame the player saw, against two ticks of pose history. The `shot` event leaves from the eye the player saw, tested at six frame rates. | **The ballistic model.** |
| **Raycasts** return the hit point, normal, body part and surface. | **Segment sweeps** of the bullet's path against each body part, between two ticks' poses. |
| **Wind and air** (density, speed of sound) in the environment. | **Whether walking bodies bob in the simulation,** sight lines and hits included. `src/sim/body/bob.ts` is ready for it. |
| **Held states** for the optic and breath in the input. | **Whether a shot leaves from the bobbing eye.** |
| **Sound timed** against the picture. | **Content as data in tuning** (rule 16): the rifle, ammunition, optics and the throwable. |
| **The rangefinder.** | **The shot's sound:** the crack and thump, by distance. |

### C · Movement and body

| Already there | Left to this lab |
| --- | --- |
| **The shared motor** (`src/sim/body/motor.ts`), with ground and air modes and invariants checked every tick by tests and the fuzz run. | **The prone body's real shape.** A 0.3 m circle stands in for a 1.5 m body today. |
| **Stances** and every body's sizes as kinds in `tuning.bodies`. Lean already has a held state in the input, waiting for the motor. | **Lean, mantle, ladders and carrying bodies.** Each new motor mode states its invariants (rule 10). |
| **Surfaces** with their footstep loudness. | **Light exposure for the player.** |
| **The head bob** on the stride. | **Judging whether movement feels deliberate.** The owner deferred this at the Phase 0 gate until there's more gameplay. |
| **The movement course scene,** this lab's arena. | |
| **The controller's debug overlay.** | |
| **The action map** (rebinding is a change of table) and **settings.** | |

### D · Camp generator

| Already there | Left to this lab |
| --- | --- |
| **Sites** (`src/sim/generation/site.ts`) and the `MissionSpec`. The Phase 0 test camp stands at a site. | **The camp generator.** It takes a site and a `CampSpec` of this lab's design, and builds one archetype from handmade modules. |
| **The valley generator.** | **Validation moved onto the grid.** |
| **Analysis and validation** (`analysis.ts`) with overwatch perches. | **The seed explorer.** |
| **The spatial grid:** a 2.5 m map layer and a 0.5 m site layer. | **One deliberate `GEN_VERSION` bump** that brings in range reduction for `dsin` and `dcos`, together with scatter that depends only on seed and cell. |
| **Routines** generated with the camp. | **Doors and vehicles,** as entity kinds with a `solid` when a lab needs them. |
| **Handmade worlds** (`generation/handmade.ts`). | |
| **`npm run seeds`.** | |
| **The TAL-4471 golden** fingerprint. | |

### E · Camp brain

| Already there | Left to this lab |
| --- | --- |
| **Brains behind the perception boundary.** The routine (`src/sim/brain/routine.ts`) is the first brain. | **The brain itself:** awareness states, with utility scoring within each state. |
| **A random stream** per entity and purpose (`ctx.draw`). | **The camp commander and the pacing layer.** |
| **The schedule** for delayed effects (`ctx.schedule`). | **Navigation:** grid A\* over the heightfield. |
| **Entities that spawn mid-run,** for reinforcements. | **Brains with their own random streams.** |
| **Factions.** | **Guards who step around a cornered player** instead of shoving through. |
| **Rulesets** that decide a scene's outcome. | **Bodies that ride moving solids.** |
| **Guards that move with the shared motor.** | **A grid that learns about doors.** |

## What planning needs to settle

These were settled when Phase 1 was planned, on Nov 7, 2026. `docs/phase-1-plan.md` has the answers.

- **Order and overlap.** The design doc lets the labs run in parallel, and its risk table puts the perception lab first. They depend on each other:
  - E's brains act on A's percepts.
  - C's prone shape and light exposure feed A's visibility.
  - D's camps give E its posts and roles.
  - A's foliage call changes the renderer.

  Parallel sessions on branches would all edit the same seams (`state.ts`, `tuning.ts`, `systems.ts`, the event registry), so a plan may want those changes made in order.
- **How each exit test is measured, and by whom.**
  - A and C need testers predicting outcomes blind, in the honest view. Who are the testers, and how many trials count?
  - "Feels earned" in B is the owner's call.
  - D is automated, apart from the reviewer who judges best plans.
  - E needs scripted scenes and a tester.
- **The owner's time.** In the working model, he joins only at gates and taste calls: about 10 minutes of play and one to three questions. Each lab should end with a playable link (`?scene=<name>` on the deployment) and a short note.
- **The three Phase 1 tools.** Decide which lab builds sandbox mode, the seed explorer and the scenario runner.
- **Taste call 3,** ballistics realism, is due in lab B. No other taste call is due in Phase 1.
- **Where the plan lives.** By analogy with the foundation pass, `docs/phase-1-plan.md` would hold the milestones, status and findings, kept current as work lands, and the design doc's phase notes would point to it.

## How the repository works

- **Production.** `main` deploys to production at sightline-willgibs.vercel.app. Vercel Authentication is on, so only the owner's Vercel account can open it.
- **Branches.** Every other branch gets a preview deploy. `ci.yml` checks pushes to `main` and pull requests, not other branches, so give a lab branch a pull request to have it checked. `engines.yml` runs on `main`, on `ci/**` and on pull requests.
- **Weekly runs.** Every Monday, and on demand, `ci.yml` adds macOS and Windows with the hash comparison, plus the 40-hour fuzz run.
- **Dispatching `ci.yml` by hand** cancels a run on `main` that's in progress, because they share a concurrency group. Don't push to `main` while you're waiting on a dispatched run.

## Gotchas

- **Headless frame rate.** Headless Chromium in a cloud container draws at about 5 fps with a software GPU. Judge frame rate, rhythm and feel from model tests or on the owner's machine, never from headless timings.
- **The desktop app's browser pane.** A hidden pane pauses the page's frames, so frame-rate checks need the pane in view.
- **The pointer lock in headless browsers.** Esc doesn't release it there, so use `sightline.pause()` or `document.exitPointerLock()`.
- **Hot reload.** The dev server reloads the page when `src` changes, which kills a scripted run. `npm run look` and `openGame()` run their own server without hot reload.
- **The playtest inbox.** Only the project's `vite.config.ts` has it: a Vite server started with `configFile: false` has no `playtests/`.
- **Footstep voices.** After changing one, recalibrate (`CLAUDE.md`, Checking work). Firefox can't suspend an offline audio context, so only the voices test runs there.
- **The first browser-test run.** If it ever hangs again, run it with `DEBUG=vite:deps`.
- **Deleting branches.** The GitHub proxy in Claude's cloud sessions refused to delete branches (both `git push --delete` and the API). Ask the owner to delete stale ones.

## Keeping the design doc's copy current

When the live doc changes, export it again over `docs/design-doc.md`, keeping the note at its top. A session with the Claude Docs connector does it like this:
1. Read the doc (`bb23b8ff-bed0-4eb8-b12e-5424fe19b63e`).
2. Export its one tab (`f4f91fb8-0c37`) as markdown.
3. The export drops the four diagrams, so carry over their text versions, or rewrite them from the widgets.

A session without the connector can't change the live doc. It proposes the change to the owner.
