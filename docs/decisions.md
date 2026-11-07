# Engineering decisions

Newest first. Taste calls and product decisions live in the design doc's Part 5; this log covers how the game is built.

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
