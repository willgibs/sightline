# Foundation pass: the plan

Phase 0 passed its gate on Nov 7, 2026. Before Phase 1's labs start, the owner asked for the foundation to be pushed close to its full potential, with room for the game to grow later. This is the working plan for that pass. Status is kept current as work lands, and every audit finding not yet fixed is listed here, so nothing depends on anyone's memory.

## What this pass is for

Phase 0 built the right core: deterministic math, seeded generation, recordings that replay bit for bit, one set of terrain triangles, a small custom physics layer guarded by invariant tests. What it lacks is shape. Its four interfaces are sized for one player and seven guards that perceive nothing:

| Interface | Today | After this pass |
| --- | --- | --- |
| State | A hash that lists fields by hand; a guard list fixed for the run | One plain-data state tree with stable entity ids, spawning, a generic hash, snapshot and restore (done, M2) |
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

### M1 · Ground rules and inputs ✓
- [x] `MissionSpec` replaces (seed, spawn kind) as the input to generation and the recording header; `GEN_VERSION` and `SIM_VERSION`.
- [x] Tuning split by owner: `gen` (generation), `view` (presentation), everything else (simulation). Keys derived, not hand-listed; a test proves generation reads nothing outside `gen`. (All body sizes are kinds in `tuning.bodies` since M6.)
- [x] Architecture tests: no wall-clock time, async code, timers, network or dynamic imports in `src/sim`; no module-level state that lasts across ticks; no aliasing around the banned math.
- [x] Deterministic `dexp`, `dlog`, `dpow`.
- [x] The sim-core and controller audits' findings fixed, each with a regression test. What they deferred is listed under the milestones below.

### M2 · State and entities ✓
- [x] All dynamic state in one plain-data `SimState`: entities with stable ids, kinds, factions and component records; random stream words inside the state.
- [x] `spawn`, `despawn`, generic `hashState`, `cloneState`, `Simulation.restore`; a coverage test that changing any leaf changes the hash.
- [x] Renderer, guard meshes and debug layer work from entity ids, so things can appear and disappear mid-run. (The recorder's event and state tracks follow in M4.)
- [x] Proven bit-identical to Phase 0 through a `legacyHash()`, then switched to the generic hash.

### M3 · Systems and the shared motor ✓
- [x] `step()` runs a declared list of phases; each system has a rate and reports its time (`npm run sim -- --profile`, and the debug view); a deterministic schedule for delayed effects, in the state tree.
- [x] Movement split into intent (input or AI to a `MoveIntent`) and one shared motor with modes (ground and air now), usable by any body with its own spec. The guards join it in M5.
- [x] The self-test pins `behaviour` (observable, every tick) separately from `state` (the whole tree), with the fuzzing bot added, so refactors prove themselves.

### M4 · Timed commands, the event log, recording v2 ✓
- [x] Tick input gains held states (optic, breath, lean) and a list of commands; precise commands carry the lag and view angles of the frame the player saw. Pose history of two ticks for hits between ticks. A `fire` command emits a `shot` event from the eye the player saw; a test proves it at six frame rates.
- [x] One event registry: typed, with ids, times in seconds and causes; `explain(id)` walks the chain. Every event carries its source as an entity id. Footsteps carry the gait, so sound picks its voice from what the legs did rather than from loudness.
- [x] Recording v2: tagged tracks (header, inputs, checkpoints, tuning changes, states, events, annotations), build and version stamps, markers (M); save-states cached in memory for exact seeking (`ReplaySeeker`).
- [x] A strict loader: a bounds-checked reader, a `RecordingFormatError`, every header field checked, a size cap, no trailing bytes. The header carries the world fingerprint and the tick-0 hash, and re-simulation says why it can't run.
- [x] Tuning is frozen when a simulation takes it, and a tuning change mid-run becomes a track in the recording instead of a flag. A recorder records only the simulation it was made for.
- [x] Checkpoints hash each part of the state, so a desync names where it diverged (an entity, the random streams).
- [x] Long sessions: the writer fills 64 KB chunks instead of doubling a buffer, and saving hands the chunks to a Blob. Saving still copies each track once.
- [x] A golden recording in the tests, re-simulated bit for bit (`npm run golden` rewrites it).

### M5 · Deliberate behaviour changes ✓
- [x] A random stream per entity and purpose (`ctx.draw`); the shared `sim` stream retired.
- [x] Patrol routines as pure functions of time, generated with the camp, so stopping one guard never shifts another's timetable. The debug view shows where each guard will be in 10 s.
- [x] Guards move with the shared motor, so they collide with the world like the player.
- [ ] Later, if perception's budget needs it: a fast path for bodies standing still (eight bodies cost about 80 µs a tick headless).

### M6 · World, bodies, environment
- [x] `world/query.ts`: raycasts with hit point, normal, id, body part and surface; sight lines. `Blocks.Sound`. The rangefinder uses `raycast` instead of its own guard test.
- [ ] Segment sweeps against moving bodies (the bullet's path against each part between two ticks' poses), with lab B.
- [x] Colliders that can be inserted, moved and removed at runtime: entities with a solid shape (`solid`, a collider in the state tree), seen with the world's colliders through `Solids`, by the motor, every query, the light and the renderer (both views). Ids stay the same for the run; whatever moves one never moves it into a body. Doors and vehicles become kinds with a `solid` when a lab needs them; bodies riding what they stand on, and the grid learning about doors, come with them.
- [x] Simulation code reads the terrain through its queries; an architecture test keeps the heightfield's arrays to generation, bots and rendering.
- [x] Body shapes (`bodyShape()` in `src/sim/motor/shape.ts`): head, torso and legs from each pose, from `tuning.bodies`; the guards' meshes built from the same numbers.
- [x] Every body is a complete kind in `tuning.bodies` (player and guard: sizes, limits, strides, parts); gravity is `tuning.sim.gravity`, shared by everything that falls.
- [x] The environment in the mission spec, owned by the simulation: clock, wind, air (density, speed of sound); the sun's direction from deterministic math; light at a point (sun, shade, dusk, dark); the renderer reads the sun from the simulation.
- [x] One spatial grid: a 2.5 m map layer and a 0.5 m site layer recording walkable, blocks sound, roofed and cover height, with walkable edges between cells (a fence between two centres); G shows it.
- [ ] Ambient masking from the world's steady sources (the creek, the generator), with lab A; the sources move from `audio/worldSounds.ts` into the simulation then. Validation (`analysis.ts`) moves onto the grid with lab D.

### M7 · Sites, camps, scenes and the perception boundary
- [ ] `Site` and `CampSpec`: camps live at a site with its own origin and axis; nothing assumes the camp is at (0, 0). The Phase 0 camp converted.
- [ ] Scene harness: worlds from a seed or built by hand, setup, scripts of inputs, commands or bots, expectations. Runs headless (`npm run scene`, vitest) and in the browser (`?scene=…`). Golden recordings re-simulated by the tests.
- [ ] Rulesets: a scene's or mission's rules (objectives, outcome, scoring) plug in; lab scenes are the first rulesets, Phase 2's mission the next.
- [ ] A movement course scene: steps, ramps, ceilings, gaps, crawl spaces, drops, surfaces. A regression test now, lab C's arena later.
- [ ] The perception boundary (audit item 4): only `src/sim/perception` reads other entities' true state. AI code receives a `GuardMind` (its own state, percepts, beliefs, the static world, its own random stream), and an architecture test enforces the imports. A no-omniscience test runs a scene twice with the player in two places no guard can perceive, and every guard decision must match bit for bit until the first percept differs.

### M8 · Presentation seams and feel
- [ ] Cues (what the shipped game shows) and debug primitives as separate channels out of the simulation; the honest view reads cues only.
- [ ] An action-map layer: device bindings to named actions by context (on foot, optic, menu, debug), defaults in a data table.
- [ ] Settings with persistence: sensitivity, field of view, invert, volume. Raw mouse input where the browser supports it.
- [ ] Sound wired into the game: events, ambient sources, muffling, pause ducking.
- [ ] The camera never renders from inside a guard: a guard's mesh hides while the eye is inside its capsule. (Guards that step around a cornered player come with lab E.)
- [ ] Tree canopies drawn so an eye inside one sees it, not a hole (they are single-sided cones today).
- [ ] A controller debug overlay: ground slope against the limit, sliding, rim probes, and the pushes of each resolve step (rule 8).
- [ ] Head bob is drawn but not simulated, so a shot leaves from the eye without it. Turn bob off with an optic up, or make it a pure function of simulation time that both sides evaluate (with lab B).

**The runtime audit** (the browser app and renderer, Nov 7; findings H1–H5, M1–M8, L1–L9):
- [x] H1 · Tab during play moved the focus into the hidden seed field, and Enter regenerated the valley: the hidden overlay is inert, the focus drops when the lock starts, and Tab and browser shortcuts are the game's while playing (Ctrl+Shift stays the browser's).
- [x] H2 · A non-finite view angle hung the debug view's ray loop: raycasts refuse non-finite rays, the automation hooks check their arguments, and the view numbers are bounded.
- [x] H3 · Debug overlays turned on and off leaked about 12 MB per regeneration, and instance buffers waited for garbage collection: everything is freed when the valley is rebuilt.
- [x] H4 · Errors were silent, and a failed tick corrupted the recording: a failed tick stops the simulation and the recording keeps the failing tick, so re-simulating it fails the same way; a drawing or page error pauses with the run intact; a failed generation says so and offers to try again.
- [x] H5 · Saving tuning.ts reloaded the page: the validator takes the update too, and an architecture test keeps other importers out.
- [x] M1 · Without WebGL 2 the page was blank; a lost context went unnoticed: both say so, and the run waits for the context to come back.
- [x] M2 · A refused pointer lock did nothing visible: the status line says why.
- [x] M3 · Shortcuts and closing the tab: browser shortcuts are the game's while playing; leaving with a minute or more of unsaved play asks first (the deployed build only). Autosaving the recording comes with M9.
- [x] M4 · A save changing the world and the tick rate together ran at half speed, and tuning messages were invisible while paused: the clock follows the tuning on every restart, and messages show in the overlay.
- [x] M5 · Per-frame garbage: flat transparent materials draw in one pass, and the motor's rim loops don't allocate.
- [x] M6 · One mouse spike turned the view 189°: the first move after a lock change and single jumps over 400 px are dropped. Raw input (`unadjustedMovement`) comes with the settings.
- [x] M7 · The pixel ratio followed the first screen only, and wide or tall windows got extreme views: the ratio follows the screen, and the horizontal view stays within 60–110°.
- [x] M8 · Layout: the debug panel sits below the compass, toasts wrap, the overlay scrolls in a short window, and the compass is drawn at its real width.
- [x] L1–L9 · Static loading text, one valley per Enter, fast-forward scaled after the frame limit (the panel shows what it delivers), a movement key held while the lock starts counts, the key and button zooms are separate, the save message names the folder, paused means still (no bob, no animation, no redrawing an unchanged screen), the automation hooks refuse misuse clearly, `?dpr` is clamped to 0.5–3, and key labels follow the keyboard layout where the browser says.
- [ ] Later, if loading time needs it: shaders compiled before "Click to begin", and generation in a worker.
- [ ] With Phase 2's menus: a teardown path (the renderer's and input's disposal are never called, and the resize listener stays).

### M9 · The playtest loop
- [ ] Every dev session saves its recording and a telemetry report into `playtests/` (the marker key, M, already records moments).
- [ ] `npm run playtest -- <file>` re-simulates and summarizes a session.
- [ ] A replay viewer with scrubbing.
- [ ] Determinism checked in Chromium, Firefox and WebKit, and under Bun (JavaScriptCore), in CI. A long fuzzing-bot invariant run joins the weekly platform runs. First, find out why the first browser-test run after a source change sometimes hangs (likely Vite's dependency optimizer); a rerun passes.

### M10 · Close out
- [ ] `CLAUDE.md` gains the audit's rules as their milestones land: AI reads only `GuardMind`; systems join the phase list, never `step()` directly; anything drawn between ticks that changes an outcome, such as sway, is a pure function in `src/sim` that both sides evaluate; generation works in site frames; content definitions (rifle, ammunition, optics, throwables) live in tuning, so recordings embed them; rates are per second times `dt`; repair loops and searches get iteration budgets, never time budgets.
- [ ] `decisions.md`, the Phase 0 report and the design doc updated; delivered; verified on the owner's Mac; an independent review of the result.

## Done so far

- GitHub repository, CI (Linux on every push; macOS and Windows weekly, hashes compared), Vercel deploys.
- Sound engine, procedural voices and world sounds, with browser tests (not yet wired into the game).
- Browser test harness (`npm run test:browser`) and the determinism self-test (`npm run selftest`).
- M1: explicit generation inputs, tuning by owner and validated, the clock kept out of the simulation, the determinism audit's fixes.
- The controller hardened from its audit: steep ground is a barrier from every angle, falls land audibly, the body is as tall as it is (`SIM_VERSION` 2).
- M2: one plain-data state tree, save-states, entity ids through the renderer.
- M3: declared system phases with rates, profiling and a schedule; the shared motor with ground and air modes; behaviour and state fingerprints.
- M4: the event registry with ids, times, sources and causes; clicks dated against the frame on screen, with pose history; recordings as checked, tagged tracks with seeking, tuning changes and markers.
- M5: routines as pure functions of time, generated with the camp; guards as bodies moved by the shared motor; a random stream per entity (`GEN_VERSION` 2, `SIM_VERSION` 4).

## Deliberately later

- **Range reduction for `dsin` and `dcos` beyond |x| < 10⁶.** Better reduction changes bits, so it waits for a deliberate `GEN_VERSION` bump, made together with lab D's fingerprint change and seed-and-cell scatter (X3).
- **Lab C** decides the prone body's shape: today a 0.3 m circle stands in for a 1.5 m body.
- **Lab E** makes guards step around a player instead of shoving through.

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
| A night zombie mode | Factions (M2), the environment clock (M6), the shared motor and the perception boundary (M7). Zombie AI, hordes, waves: nothing now. |
| A broader open-world shooter | The action map (M8), content definitions as data (M10's rule). Vehicles, physics engine, networking: nothing now. |
