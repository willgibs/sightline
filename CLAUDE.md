# Sightline: working rules

The design doc is the source of truth: [Sightline · Game Design & Build Plan](https://claude.ai/artifact/Q7JxvgeF1zrrTEWNrFQy7j), which only the owner's account can open. If you can't open it, work from its copy in `docs/design-doc.md`; the note at the top of that file says how the copy is kept current. Build phase by phase. Each system's spec, starting numbers and **Done when** test come from Part 2 of the design doc. Taste calls belong to the owner. Work proceeds on the doc's recommended defaults until the owner overrides them.

## Where we are

Phase 0 (Foundations) passed its gate on Nov 7, 2026 (`docs/phase-0-report.md`), and the owner approved the wireframe look as the canvas for the next phases.

The foundation pass that followed is done.
- `docs/foundation-plan.md` is its record: milestones M1–M10, what is deliberately left to the labs, and the Horizons (futures that may shape interfaces, never add features).
- Only the owner's check on his Mac is still open.

**Now: Phase 1, planned on Nov 7 in `docs/phase-1-plan.md`.**
- Wave 0, the shared seams, is on `main` (W0.2–W0.8, Nov 7): the kernel, the lanes and the game (`docs/foundation-shape.md`), brains that decide after perceiving, spawning and queries inside a tick, grid search, code ranges and roles, mechanical landing, and determinism checks at the edges. `docs/decisions.md` (Wave 0) has the reasoning.
- Wave 1 is open: labs A, B and D run in parallel, each in its own session, branch and pull request. C and E follow once A's percepts land.
- A lab session starts from:
  - this file;
  - `docs/phase-1-handoff.md`: what each lab starts from, and the gotchas;
  - `docs/foundation-shape.md`;
  - its lab's section of the plan;
  - its pages in `docs/research/`.

  The plan's rules for landing on `main` apply to every branch.
- Keep the plan's checkboxes current as work lands, as the foundation plan was kept.

**Phase 1:** five labs, each an isolated wireframe scene built to its exit test.

| Lab | Builds | Exit test |
| --- | --- | --- |
| A | Perception and awareness | Testers predict detection 80% of the time in the honest view |
| B | Shooting | A 300 m shot at a walking target feels earned |
| C | Movement and body | Players predict their own noise and visibility |
| D | Camp generator | 90 of 100 seeds pass validation on the first try |
| E | Camp brain | Escalation can be caused, contained and interrupted |

Art stays out until the core passes Concept proven (end of Phase 2). Feel is in scope: camera motion, sound timing and readability.

## Rules that must hold

1. **The simulation stands alone.** `src/sim` never imports three.js, `src/render` or `src/app`, and never touches the DOM. The renderer reads snapshots and never writes simulation state.
2. **Determinism.** Inside `src/sim`, use only exactly specified math: `+ - * /`, `Math.floor/round/abs/sign/min/max/sqrt/fround`, and `src/sim/kernel/core/detmath.ts` (`dsin`, `dcos`, `datan`, `datan2`, `dtanDeg`, `dexp`, `dlog`, `dpow`). Never use `Math.sin/cos/tan/atan2/pow/exp/log/hypot` or `**` there: Chrome and Node really do disagree in the last bit. Never use `Math.random` (`randomSeed()` in `seed.ts` is UI-only). No clocks, timers, async code or network in `src/sim` either: a tick depends only on its state and input. Every sort comparator breaks its ties with an id or an index (or says why its keys can't tie, `// unique: ...`). `tests/architecture.test.ts` enforces all of this, and the game, the headless tools and the self-test check known answers for `Math.sqrt` and detmath at startup (`src/sim/kernel/core/known.ts`).
3. **Random streams are forked by label.** In generation, a new feature gets `rng.fork('new-label')` and never draws from an existing stream, so old seeds keep producing the same valleys. In the simulation, randomness comes from an entity's own stream (`ctx.draw(id, purpose, use)`), never a shared one, so removing a guard never shifts another's numbers. A guard on routine is a pure function of time (`src/sim/generation/routine.ts`).
4. **Every gameplay number lives in `src/config/tuning.ts`.** It hot-reloads in the dev build.
5. **Live play equals its recording.** `Simulation.step()` quantizes its input and keeps it as `sim.lastInput`, and `Recorder.record(sim, events)` stores exactly that after every tick. Anything new that affects simulation state must flow through `InputFrame` or the `MissionSpec`. A tick that throws stops the simulation (`sim.fault`); `Recorder.recordFault(sim)` keeps the failing input, so the recording reproduces the failure.
6. **Generation changes are deliberate.** If `tests/world.test.ts` reports a new fingerprint for TAL-4471, decide whether the change is intended. If it is, update `GOLDEN_TAL_4471` and add a line to `docs/decisions.md`.
7. **One set of terrain triangles.** Physics, raycasts and rendering split each cell along the diagonal from (i, j) to (i+1, j+1). Change all three together or none.
8. **Every system ships explainable.** New systems come with a debug-view overlay and a test for their Done-when criteria.
9. **All simulation state lives in `sim.state`.** It is one tree of plain data (`src/sim/kernel/state.ts`): numbers, booleans, strings, null, arrays and plain objects, with entities referring to each other by id. The hash, save-states and restore are generic over it, so state anywhere else is invisible to determinism checks and lost on restore. `tests/state.test.ts` checks that every leaf moves the hash and that a restored run continues bit for bit.
10. **The motor's invariants hold.** Bodies move through the shared motor (`src/sim/body/motor.ts`), the player's and the guards': input or AI produces a `MoveIntent`, and the motor decides what the body gets. A body's sizes, limits and parts come from its kind in `tuning.bodies`; nothing else sizes a body. A body never ends a tick inside anything solid or under the terrain, never rises more than `stepHeight` in one tick, and never gains height on ground steeper than `maxSlopeDeg`, from any angle. `tests/invariants.test.ts` (a person-like bot and a fuzzing bot) and `tests/steep.test.ts` check this. Collision goes through `resolveMove`, which resolves other bodies, then terrain, then colliders: the world's and entities' solid shapes, both seen through `Solids` (`src/sim/kernel/world/solids.ts`). Whatever moves an entity's shape never moves it into a body. A new motor mode states its own invariants in the motor's header and adds them to the invariant run.
11. **Behaviour changes are deliberate.** `src/sim/game/golden.ts` pins two fingerprints per pinned run (`src/sim/game/runs.ts`), and the self-test checks them in every engine. `behaviour` covers what can be observed every tick (every body's pose, every event); `state` covers the whole state tree. If `behaviour` moves, the game does something different: if that's intended, update the values, bump `SIM_VERSION` (or `GEN_VERSION` for generation) in `src/sim/kernel/version.ts`, and add a line to `docs/decisions.md`. If only `state` moves, state is stored differently: bump `STATE_SCHEMA` in `src/sim/kernel/state.ts` instead. A refactor must move neither `behaviour` value. After either, rewrite the golden recording with `npm run golden`; `npm run explain` says where a moved value first diverged. Recordings carry the build's behaviour digest, so a build that behaves differently refuses them with the reason. Each lane's bench pins the work its systems do and its quality metrics (`src/sim/game/benches.ts`); pin what moved on purpose with `npm run bench -- --write`.
12. **Systems run in declared phases, and declare what they touch.** A tick runs the game's systems (`SYSTEMS`, `src/sim/game/systems.ts`), phase by phase, in the order `PHASES` gives (`src/sim/kernel/systems.ts`). Add a system to `SYSTEMS` in its phase, never by calling it from `step()`. Every system declares the state paths it `reads` and `writes` and the events it `emits`; the simulation refuses two systems in one phase that touch the same data unless the later names the earlier in `after`, and stops a system that emits an event it doesn't declare. `tests/systems.test.ts` checks every system's state changes against its `writes`. Inside a tick, systems see every body as it stands through `ctx.query()`, and spawn or despawn through `ctx.spawn` and `ctx.despawn` (declaring `entities`), which take effect at once (the `spawn-tick` scene pins when a spawned body first exists). A value one system hands to a later one within a tick goes through `ctx.channel`, which starts empty every tick; a delayed effect goes through the schedule (`ctx.schedule`), never a timer kept outside the state. Reordering phases is a behaviour change.
13. **Brains see only their minds.** A guard's brain (the brain lane, `src/sim/brain`) decides from its `GuardMind` (`src/sim/brain/mind.ts`) and imports nothing that holds the state; perception (lab A) is the only way anything about another entity reaches it. Brains decide in the 'decide' phase, after perceiving, and steer their bodies only through orders (`src/sim/brain/orders.ts`), kept in the state and carried out in 'intent' from the next tick. `tests/architecture.test.ts` checks the imports, and `tests/perception.test.ts` checks that guards with the same mind decide the same wherever the unseen player is.
14. **What is drawn is what is simulated.** Anything drawn between ticks that could change an outcome (head bob, sway, a walk cycle) is a pure function in `src/sim` of state and time that both sides can evaluate; `src/sim/body/bob.ts` is the model. The renderer adds no motion of its own to anything that can be seen or hit: a body is drawn where its shape is (`bodyShape`), and a shot leaves from where the camera looks.
15. **Generation works in site frames.** A camp, and anything generated around one, is laid out in its site's frame (`src/sim/generation/site.ts`); nothing assumes it stands at the origin.
16. **Content is data in tuning.** Content definitions (bodies now; the rifle, ammunition, optics and throwables with lab B) live in `src/config/tuning.ts`, so recordings embed them and replay with the numbers they were made with.
17. **Rates are per second, times `dt`.** Every rate in tuning is per second and applies as `rate * dt`, so a system behaves the same at any tick rate or system rate.
18. **Budgets are iterations, never time.** Generation retries, repair loops and searches stop after a fixed number of iterations; grid searches (`src/sim/kernel/world/search.ts`) take `maxExpansions` and say when they ran out. A time budget would make the result depend on the machine. Clocks may only be passed in to report how long something took.
19. **The kernel stands alone, and lanes stay behind their contracts.** `src/sim` has three layers (`docs/foundation-shape.md`): the kernel (`src/sim/kernel`), the lanes (`body`, `perception`, `brain`, `ballistics`, `generation`), and the game (`src/sim/game`). The lane map, `src/sim/lanes.ts`, says which may import which, and `tests/architecture.test.ts` reads it. A lane is reached only through its `index.ts`, from inside `src/sim` or outside it. The kernel imports no lane and no game: what it needs from a game comes through `Game` (`src/sim/kernel/game.ts`), and `npm run typecheck` also compiles the kernel alone (`tsconfig.kernel.json`). Lanes and the game add entity kinds and `World` fields by module augmentation (`game/entities.ts`, `generation/world.ts`), never by editing the kernel. The kernel-alone scene (`src/sim/kernel/alone.ts`) steps, hashes, saves, restores and replays with every lane switched off (`tests/kernel.test.ts`).

## Checking work

- `npm run check`: typecheck plus all tests. Must pass before you hand anything back.
- `npm run test:browser`: tests that need a real browser (Web Audio, WebGL, each browser's JavaScript engine), run in Chromium through Playwright. On a new machine, install the browser once with `npx playwright install chromium`. CI also runs them in Firefox and WebKit (`BROWSERS=chromium,firefox,webkit`), and the self-test under Bun, on every push. After changing a footstep voice, recalibrate: `VITE_CALIBRATE=1 npm run test:browser -- calibrate`.
- `npm run sim -- --minutes 10`: bot run, recording and bit-exact re-simulation, with timing. Add `--profile` for the time each system takes.
- `npm run seeds -- --count 100`: generation health across many seeds.
- `npm run fuzz -- --seeds 20 --minutes 60`: bots play fresh valleys while every body's promises are checked every tick; a failure is saved as a recording. `-- --synctest` also saves the state every 30 ticks, through the on-disk codec and by rollback, puts it back, re-steps and compares every tick (`src/sim/kernel/synctest.ts`).
- `npm run bisect -- --recording <file>` (or `-- --run <pinned run>`): where this checkout and another build part ways: the first tick, then the first system in it, then the state paths it left different. A recording is compared with the build that made it, a pinned run with `origin/main`, or `--base <ref>`.
- `npm run bench`: every lane's bench: its pinned runs, the work each system does in them (rays, grid nodes, bodies) and its quality metrics, against their pinned values. `-- --write` pins what moved on purpose.
- `npm run explain` (or `-- --base <ref>`): for every pinned run that moved since `origin/main`, the first divergent tick, the state paths that differ there, and each lane's work and metrics before and after. CI prints it for every pull request and push. `npm run trace -- --run <name>` is the per-tick trace it compares.
- `npm run playtest`: every session in `playtests/` (the dev build saves each run there as it goes), re-simulated, checked and summarized with its telemetry. `-- <file|dir>` for others.
- `npm run scene` (or `-- <name>`, `-- --list`): every scene in `src/sim/game/scenes` headless, by its own driver, checking its expectations and re-simulating its recording. `?scene=<name>` plays one in the browser. A regression test that needs more than one tick belongs in a scene.
- `npm run sim -- --replay <file>`: re-simulate a recording saved in the browser; it says where a run diverged, or why it can't re-simulate in this build.
- `npm run trials -- <seed>`: a sitting of trial mode (A12), trial by trial, with its key; `--shots` draws every freeze frame into `shots/trials/<seed>/` with what the simulation recorded there, for the agents' pre-screen. `npm run playtest` scores sittings from their recordings or saved files.
- `npm run look`: the honest and debug views as pictures in `shots/`, from a headless browser. `-- --scene <name>`, `--seed`, `--look`, `--walk` and `--fly` choose what to look at (the header of `src/headless/look.ts`).
- `window.sightline` exposes automation hooks for scripted screenshots and playtests. The full list is `automation()` in `src/app/game.ts`:
  - **Running:** `play()`, `pause()`.
  - **Views:** `debug(on)`, `colliders(on)`, `grid(on)`, `overwatch(on)`.
  - **Camera:** `look(headingDeg, pitchDeg)`, `fly(x, y, z, headingDeg, pitchDeg)`, `body()`.
  - **Input:** `hold([codes])`, `tap('KeyC' | 'KeyZ')`, `click()`, `zoom(on)`, `noise()` (drop a noise where the view points: the sandbox, A10).
  - **Time:** `timeScale(x)` (the debug view's, 0.25× to 8×).
  - **World:** `generate(seed)`, `fog(density)`.
  - **Reading:** `state()`, `dump()`, `recording()`, `sound()`, `insides()`, `playtest()`, `perception()` (each perceiving guard's state, meter and belief), `explain(id)` (an event back to its causes, in words).
  - **Replays:** `replay(base64)`, `replayState()`, `seek(tick)`.
  - **Trial mode** (`?trials=<seed>`, A12): `trial()` (where the sitting stands), `answer(yes)`, `onScreen(x, y, z)` (where a world point is drawn).
- To drive the hooks from a script, use `openGame()` in `src/headless/browser.ts`. It starts its own server and browser and evaluates expressions with the hooks in scope.
- `?replay=playtests/<name>.slrec` watches a kept session in the dev build.
- Look at the result. Render the honest and debug views and judge them, rather than trusting that code which compiles also reads well. A headless browser draws at a few frames a second, so judge feel and frame rate on a real machine.

## Workflow

- The repository is `willgibs/sightline` on GitHub. Keep `main` green: CI runs the full check on every push and pull request, on Linux, macOS and Windows, with a cross-platform hash comparison; weekly, it adds hours of fuzzing and synctest. The repository is public, so Actions minutes are free.
- Public, but the owner's project: it's under the MIT License (`LICENSE`), and `CONTRIBUTING.md` asks outsiders for bug reports, and for an issue before any code. Commit nothing private: no local paths, credentials or personal details. A link only the owner can open says so, and where the public copy is.
- Every push to `main` deploys to production on Vercel, publicly at sightline-brown.vercel.app (the repository's website link); other branches get preview deploys. Vercel Authentication still covers sightline-willgibs.vercel.app and the previews, so only the owner's Vercel account can open those.
- Commit in small, verified steps, each with its tests passing.
- Land a pull request with `npm run land -- <number>`: it merges only a branch that is up to date with `main` and green (`docs/phase-1-plan.md`, Landing on `main`).
- Research is a seed, not a ceiling. A lane starts from the strongest prior art in `docs/research/`, says where it falls short, builds past it, and proves the gain on its bench.
- The foundation is meant to carry many games. Keep the kernel narrow, keep lanes behind their contracts, and generalize at the third use (`docs/foundation-shape.md`).

## Conventions

- TypeScript strict, ES modules, no default exports except where a tool requires one.
- Units are metres, seconds and radians. Tuning uses degrees where a name ends in `Deg`.
- Yaw 0 faces north (−z) and increases turning left. Use `yawFromDirection` and `headingDegrees` from `src/sim/kernel/core/math.ts`.
- Comments explain why, not what. Module headers state the module's job and its invariants.
- Pin dependency versions exactly, and prefer releases at least two weeks old.
