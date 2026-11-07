# Sightline: working rules

The design doc is the source of truth: [Sightline · Game Design & Build Plan](https://claude.ai/artifact/Q7JxvgeF1zrrTEWNrFQy7j). Build phase by phase. Each system's spec, starting numbers and **Done when** test come from Part 2 of that doc. Taste calls belong to the owner. Work proceeds on the doc's recommended defaults until the owner overrides them.

## Where we are

Phase 0 (Foundations) is complete, and the owner passed its gate on Nov 7, 2026; see `docs/phase-0-report.md`. The owner approved the wireframe look as the canvas for the next phases.

**Now: the foundation pass.** Before the labs start, the owner asked for the foundation to be pushed close to its full potential. `docs/foundation-plan.md` is the working plan: milestones M1–M10 with their status, every audit finding not yet fixed, and the Horizons (futures that may shape interfaces, never add features). Read it before starting work, and keep its checkboxes current as work lands.

**Then Phase 1:** five labs, each an isolated wireframe scene built to its exit test.

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
2. **Determinism.** Inside `src/sim`, use only exactly specified math: `+ - * /`, `Math.floor/round/abs/sign/min/max/sqrt/fround`, and `src/sim/core/detmath.ts` (`dsin`, `dcos`, `datan`, `datan2`, `dtanDeg`, `dexp`, `dlog`, `dpow`). Never use `Math.sin/cos/tan/atan2/pow/exp/log/hypot` or `**` there: Chrome and Node really do disagree in the last bit. Never use `Math.random` (`randomSeed()` in `seed.ts` is UI-only). No clocks, timers, async code or network in `src/sim` either: a tick depends only on its state and input. `tests/architecture.test.ts` enforces all of this.
3. **Random streams are forked by label.** A new feature gets `rng.fork('new-label')` and never draws from an existing stream, so old seeds keep producing the same valleys.
4. **Every gameplay number lives in `src/config/tuning.ts`.** It hot-reloads in the dev build.
5. **Live play equals its recording.** `Simulation.step()` quantizes its input and keeps it as `sim.lastInput`, and `Recorder.record(sim, events)` stores exactly that after every tick. Anything new that affects simulation state must flow through `InputFrame` or the `MissionSpec`.
6. **Generation changes are deliberate.** If `tests/world.test.ts` reports a new fingerprint for TAL-4471, decide whether the change is intended. If it is, update `GOLDEN_TAL_4471` and add a line to `docs/decisions.md`.
7. **One set of terrain triangles.** Physics, raycasts and rendering split each cell along the diagonal from (i, j) to (i+1, j+1). Change all three together or none.
8. **Every system ships explainable.** New systems come with a debug-view overlay and a test for their Done-when criteria.
9. **All simulation state lives in `sim.state`.** It is one tree of plain data (`src/sim/state.ts`): numbers, booleans, strings, null, arrays and plain objects, with entities referring to each other by id. The hash, save-states and restore are generic over it, so state anywhere else is invisible to determinism checks and lost on restore. `tests/state.test.ts` checks that every leaf moves the hash and that a restored run continues bit for bit.
10. **The motor's invariants hold.** Bodies move through the shared motor (`src/sim/motor/motor.ts`), the player's now and the guards' from M5: input or AI produces a `MoveIntent`, and the motor decides what the body gets. A body never ends a tick inside anything solid or under the terrain, never rises more than `stepHeight` in one tick, and never gains height on ground steeper than `maxSlopeDeg`, from any angle. `tests/invariants.test.ts` (a person-like bot and a fuzzing bot) and `tests/steep.test.ts` check this. Collision goes through `resolveMove`, which resolves other bodies, then terrain, then static colliders. A new motor mode states its own invariants in the motor's header and adds them to the invariant run.
11. **Behaviour changes are deliberate.** `src/sim/selftest.ts` pins two fingerprints per run of play. `behaviour` covers what can be observed every tick (every body's pose, every event); `state` covers the whole state tree. If `behaviour` moves, the game does something different: if that's intended, update the values, bump `SIM_VERSION` (or `GEN_VERSION` for generation) in `src/sim/version.ts`, and add a line to `docs/decisions.md`. If only `state` moves, state is stored differently: bump `STATE_SCHEMA` in `src/sim/state.ts` instead. A refactor must move neither `behaviour` value. After either, rewrite the golden recording with `npm run golden`.
12. **Systems run in declared phases.** A tick runs the systems in `SYSTEMS` (`src/sim/systems.ts`), phase by phase, in the order `PHASES` gives. Add a system to `SYSTEMS` in its phase, never by calling it from `step()`. A delayed effect goes through the schedule (`ctx.schedule`), never a timer kept outside the state. Reordering phases is a behaviour change.

## Checking work

- `npm run check`: typecheck plus all tests. Must pass before you hand anything back.
- `npm run test:browser`: tests that need a real browser (Web Audio, WebGL, each browser's JavaScript engine), run in Chromium through Playwright. On a new machine, install the browser once with `npx playwright install chromium`.
- `npm run sim -- --minutes 10`: bot run, recording and bit-exact re-simulation, with timing. Add `--profile` for the time each system takes.
- `npm run seeds -- --count 100`: generation health across many seeds.
- `npm run sim -- --replay <file>`: re-simulate a recording saved in the browser; it says where a run diverged, or why it can't re-simulate in this build.
- In the browser, `window.sightline` exposes automation hooks for scripted screenshots and playtests: `play`, `debug(on)`, `fly(x, y, z, headingDeg, pitchDeg)`, `body()`, `hold([codes])`, `tap('KeyC' | 'KeyZ')`, `click()`, `zoom(on)`, `state()`, `dump()`, `recording()`.
- Look at the result. Render the honest and debug views and judge them, rather than trusting that code which compiles also reads well.

## Workflow

- The repository is `willgibs/sightline` on GitHub. Keep `main` green: CI runs the full check on every push, and weekly on macOS and Windows with a cross-platform hash comparison.
- Every push to `main` deploys to production on Vercel (sightline-willgibs.vercel.app, visible only to the owner's Vercel account); other branches get preview deploys.
- Commit in small, verified steps, each with its tests passing.

## Conventions

- TypeScript strict, ES modules, no default exports except where a tool requires one.
- Units are metres, seconds and radians. Tuning uses degrees where a name ends in `Deg`.
- Yaw 0 faces north (−z) and increases turning left. Use `yawFromDirection` and `headingDegrees` from `src/sim/core/math.ts`.
- Comments explain why, not what. Module headers state the module's job and its invariants.
- Pin dependency versions exactly, and prefer releases at least two weeks old.
