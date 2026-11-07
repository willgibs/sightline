# Engineering decisions

Newest first. Taste calls and product decisions live in the design doc's Part 5; this log covers how the game is built.

## 2026-11-07 · Foundation pass

The working plan, with everything still open, is `docs/foundation-plan.md`.

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
