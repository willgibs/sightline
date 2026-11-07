# Foundation pass: the plan

Phase 0 passed its gate on Nov 7, 2026. Before Phase 1's labs start, the owner asked for the foundation to be pushed close to its full potential, with room for the game to grow later. This is the working plan for that pass. Status is kept current as work lands.

## What this pass is for

Phase 0 built the right core: deterministic math, seeded generation, recordings that replay bit for bit, one set of terrain triangles, a small custom physics layer guarded by invariant tests. What it lacks is shape. Its four interfaces are sized for one player and seven guards that perceive nothing:

| Interface | Today | After this pass |
| --- | --- | --- |
| State | A hash that lists fields by hand; a guard list fixed for the run | One plain-data state tree with stable entity ids, spawning, a generic hash, snapshot and restore |
| Input | A 12-byte record sampled once per tick | Held states plus timed commands, so a shot between ticks resolves against what the player saw |
| Events | Two types at tick resolution, no ids, no causes | One typed registry with ids, sub-tick times and cause chains |
| Geometry | Two raycasts that return a distance; no guard hitboxes | One world-query module and one body model shared by physics, sight and hits |

Phase 1 runs five labs in parallel, and all five extend these interfaces. Widening them first means each lab builds on the same seams instead of widening them its own way, and Phase 2's integration stays an integration rather than a rewrite.

## How decisions are made here

- **A seam goes in now only if it is cheap now and expensive to retrofit.** Future ideas (see Horizons) can shape interfaces, never add features.
- **Behaviour-preserving first.** Restructuring steps must reproduce Phase 0's simulation bit for bit, proven against the golden values in `src/sim/selftest.ts`. Deliberate behaviour changes come after, each with new golden values and a line in `decisions.md`.
- **Every step ends green and deployed:** tests pass, CI passes, `main` deploys.

## Milestones

Sources: the architecture audit (items 1–16 and extensibility seams X1–X5), the sim-core, controller and runtime audits, and the owner's notes.

### M1 · Ground rules and inputs
- [ ] `MissionSpec` replaces (seed, spawn kind) as the input to generation and the recording header; `genVersion` and `simVersion` numbers.
- [ ] Tuning split by owner: `gen` (generation), `view` (presentation), everything else (simulation). Keys derived, not hand-listed. Body sizes and content definitions as data.
- [ ] Architecture tests: no wall-clock time, async code, timers, network or dynamic imports in `src/sim`; no module-level state that lasts across ticks.
- [ ] Deterministic `dexp`, `dlog`, `dpow`.
- [ ] Confirmed audit findings fixed, each with a regression test.

### M2 · State and entities
- [ ] All dynamic state in one plain-data `SimState`: entities with stable ids, kinds, factions and component records; random stream words inside the state.
- [ ] `spawn`, `despawn`, generic `hashState`, `cloneState`, `Simulation.restore`; a coverage test that changing any leaf changes the hash.
- [ ] Renderer, recorder, guard meshes and debug layer work from entity ids, so things can appear and disappear mid-run.
- [ ] Proven bit-identical to Phase 0 through a `legacyHash()`, then switched to the generic hash.

### M3 · Systems and the shared motor
- [ ] `step()` runs a declared list of phases; each system has a rate and reports its time (`npm run sim -- --profile`); a deterministic scheduler queue for delayed effects.
- [ ] Movement split into intent (input or AI to a `MoveIntent`) and one shared motor with modes (ground and air now), used by every body.

### M4 · Timed commands, the event log, recording v2
- [ ] Tick input gains held states (optic, breath, lean) and a list of commands; precise commands carry the lag and view angles of the frame the player saw. Pose history of two ticks for hits between ticks.
- [ ] One event registry: typed, with ids, times in seconds and causes; `explain(id)` walks the chain.
- [ ] Recording v2: tagged tracks (header, inputs, states, events, annotations), build and version stamps, markers; snapshots cached in memory for exact seeking.

### M5 · Deliberate behaviour changes
- [ ] A random stream per entity and purpose; the shared `sim` stream retired.
- [ ] Patrol routines as pure functions of time, generated with the camp, so stopping one guard never shifts another's timetable.
- [ ] Guards move with the shared motor, so they collide with the world like the player.

### M6 · World, bodies, environment
- [ ] `world/query.ts`: raycasts with hit point, normal, id, body part and surface; segment sweeps against moving bodies; sight lines. Colliders that can be inserted, moved and removed at runtime. `Blocks.Sound`.
- [ ] `entities/body.ts`: head, torso and legs from each pose, from `tuning.bodies`; meshes and hitboxes built from the same numbers.
- [ ] `EnvState` in the simulation: clock, wind, air (density, speed of sound); the sun's direction from deterministic math; the renderer reads the sun from the simulation.
- [ ] One spatial grid: a 2.5 m map layer and a 0.5 m site layer recording walkable, blocks sound, cover height, indoors, surface and ambient masking.

### M7 · Sites, camps and scenes
- [ ] `Site` and `CampSpec`: camps live at a site with its own origin and axis; nothing assumes the camp is at (0, 0). The Phase 0 camp converted.
- [ ] Scene harness: worlds from a seed or built by hand, setup, scripts of inputs, commands or bots, expectations. Runs headless (`npm run scene`, vitest) and in the browser (`?scene=…`). Golden recordings re-simulated by the tests.
- [ ] A movement course scene: steps, ramps, ceilings, gaps, crawl spaces, drops, surfaces. A regression test now, lab C's arena later.

### M8 · Presentation seams and feel
- [ ] Cues (what the shipped game shows) and debug primitives as separate channels out of the simulation; the honest view reads cues only.
- [ ] An action-map layer: device bindings to named actions by context (on foot, optic, menu, debug), defaults in a data table.
- [ ] Settings with persistence: sensitivity, field of view, invert, volume. Raw mouse input where the browser supports it.
- [ ] Sound wired into the game: events, ambient sources, muffling, pause ducking.
- [ ] Runtime robustness from the audit: input release on blur, context loss, disposal on regenerate, visible errors.

### M9 · The playtest loop
- [ ] Every dev session saves its recording and a telemetry report into `playtests/`; a marker key flags moments.
- [ ] `npm run playtest -- <file>` re-simulates and summarizes a session.
- [ ] A replay viewer with scrubbing.
- [ ] Determinism checked in Chromium, Firefox and WebKit, and under Bun (JavaScriptCore), in CI.

### M10 · Close out
- [ ] `CLAUDE.md`, `decisions.md`, the Phase 0 report and the design doc updated; delivered; verified on the owner's Mac; an independent review of the result.

## Done so far

- GitHub repository, CI (Linux on every push; macOS and Windows weekly, hashes compared), Vercel deploys.
- Sound engine, procedural voices and world sounds, with browser tests (not yet wired into the game).
- Browser test harness (`npm run test:browser`) and the determinism self-test (`npm run selftest`).

## Not in this pass

- **Phase 2:** the debrief, the tactical map, scoring, telemetry backend, the model of what the player has observed (only its inputs get recorded now).
- **The labs' own work:** the ballistic model, the hearing solver, the brain, lean, mantle, ladders and carrying.
- **Only if a need shows up:** Recast navigation, skipping perception for distant guards (checks measured at 2–6 µs), the simulation in a worker.
- **Later phases:** penetration, helmets, wind gusts, night, weather, doctrine, compression, leaderboards, difficulty bots.
- **Not in Phase 1 at all:** an ECS framework, a plugin system, a UI framework. The UI's shape (a stack of screens over view models, one shared 2D map renderer) is decided at the start of Phase 2, when the debrief and map need it.

## Horizons

Possible futures the owner has named. None is planned. They shape interfaces only, under the rule above.

| Future | What it needs from this pass |
| --- | --- |
| Real-world terrain (national parks, Everest, the Amazon, islands) | Sites on a given landscape (M7); generation inputs named, versioned and content-hashed (M1); scatter that depends only on seed and cell (with lab D's fingerprint change). Importing elevation data, biomes, water, big relief: nothing now. Named real places also touch the setting taste call. |
| A bigger open world with several bases | Sites (M7), entities that spawn (M2), runtime colliders (M6). Streaming, chunking and level of detail: nothing now. |
| A plane drop and parachute insertion | Movement modes in the shared motor (M3). The plane, free-fall and canopy: nothing now. |
| Survival with shelters, gear and supplies | Entities and save-states (M2), runtime colliders (M6), stable ids for generated objects (with the scatter change). Inventory, crafting, persistence: nothing now. |
| A night zombie mode | Factions (M2), the environment clock (M6), the shared motor and perception. Zombie AI, hordes, waves: nothing now. |
| A broader open-world shooter | The action map (M8), content definitions as data (M1). Vehicles, physics engine, networking: nothing now. |
