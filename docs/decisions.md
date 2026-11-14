# Engineering decisions

Newest first. Taste calls and product decisions live in the design doc's Part 5; this log covers how the game is built.

## 2026-11-14 · CI dealt by time: tests in quarters, the benches in eighths, and landing that reads `main`

**Where the time went**, measured on `main` at `c3a3f55` and on pull request 60:
- **A pull request waited on the standing benches.** `own-side` alone takes 16 minutes on one machine, and the shards were dealt bench by bench, so no shard could finish sooner. The test shards were dealt by a hash of the files' names: 6, 8 and 10.5 minutes on `main`'s run, 13.5 on a slower runner. Two files set a floor of their own: `systems.test.ts` (370 s, which watches every system's writes through 24 whole runs) and `scenes.test.ts` (298 s).
- **A behaviour change paid two full cycles.** Its decisions entry quotes the standing comparison, which only CI produces, and the commit that adds the quote ran everything again.
- **`main`'s own run took 25 minutes**: the whole suite on macOS and on Windows, one job each. It blocks nothing, but it is the only place that suite runs, and the next landing cancelled it: that is how the Windows fault below went unseen.

**What changed.**
- **Test files are dealt to CI's shards by how long each took** (`tests/sequencer.ts`, from `tests/timings.json`): the dearest first, each to whichever shard is lightest so far. Four shards instead of three. The two long files' checks are shared out (`sceneChecks.ts` over three files, `writeChecks.ts` over four), so the dearest file is now `sites.test.ts` at under three minutes. Each Linux shard uploads vitest's JSON report, and `npm run timings` refreshes the timings from `main`'s last green run.
- **The standing benches run in eighths, and a bench dearer than an eighth of the set is split by its camps** (`shard` in `src/lab/standing.ts`, the `part` option of `src/headless/labRunner.ts`). Part p of n runs the camps at p, p + n, p + 2n..., and reading a results folder merges the parts back into the file a whole run writes. On `answer`, run whole and run in two parts through the shard path, the comparison reads "same, all 54 runs" (`tests/standing.test.ts` holds the merge to every way of splitting).
- **`main`'s macOS and Windows suites run in thirds.**
- **A pull request whose newest commits change only docs, on top of a head CI passed, skips the heavy jobs** (the `changes` job in `ci.yml`), and so does a pull request of docs alone. No test reads the docs.
- **`main`'s runs are never cancelled**, and **`npm run land` refuses while `main`'s own latest runs (CI, Engines, Standing benches) are red**, with `--fixes-main` for the pull request that fixes it.
- **The gate runs the self-test only when something it checks changed** (the simulation, its tuning, how it's built). CI runs it on every pull request, in four engines.

**What it costs.** More jobs at once: a pull request's start asks for about 25 runners against the free plan's 20, so a few wait the seconds the cached jobs take. The timings drift as tests change, and a new file counts as the median until they're refreshed.

## 2026-11-14 · The quick gate is `npm run gate`: `precheck` was npm's hook for `check`

**What broke.** The first run of `main`'s CI to finish after the pipeline landed (below) failed its Windows check: `precheck: typecheck failed (spawnSync npm.cmd EINVAL)`. The step it failed in runs `npm run check`, the whole suite, which had nothing to do with the new gate.

**Why.** Two things, both in the pipeline change.
- **The name.** npm runs a script named `pre<name>` before `<name>`, and `post<name>` after it, by itself. A script called `precheck` is `check`'s hook. So `npm run check` ran the quick gate first, on every platform and here too: a typecheck, some tests and the self-test, before the suite that includes them.
- **Windows.** The gate started `npm.cmd` and `npx.cmd` directly. Node refuses to start a `.cmd` file except through a shell, so there the gate failed at its first step, `check` stopped, and the whole suite never ran on Windows.

It went unseen for three landings. A pull request's Windows job runs the self-test and a bot run, not `npm run check`: the whole suite on macOS and Windows runs only on a push to `main`. And each of those runs was cancelled by the next landing's push before it finished. The first to run to its end was the ladder fix's.

**Decision.** The gate is `npm run gate` (`src/headless/gate.ts`). It starts npm through a shell on Windows. `tests/scripts.test.ts` holds the rule for every script: none may be named `pre` or `post` plus another script's name.

**Proven.** The test fails with the old name and passes with the new one. `npm run gate` passes here. `main`'s Windows and macOS checks, which are what run `npm run check`, are read after this lands.

**What it leaves.** `main`'s own CI is the only place the whole suite runs on macOS and Windows, and a landing cancels the run before it. Three landings in an evening meant none of them was checked there until the last. Nothing is changed about that here.

## 2026-11-13 · A path's pose and the walking motor agree on what is overhead

**What broke.** Left open by "A refused move keeps its footing" (below). Two towers broke the first promise, on `main` from before the ladder's change: `tower:SWP-1424-4`, tick 98, the player `inside collider 4 by 0.3486 m`, and `tower:RFN-1208-3`, tick 2117, `inside collider 3 by 0.1985 m`. Each was a body on a ladder whose head ended a tick a hair into the underside of a shelf. In SWP-1424-4 the body then came off the ladder, and the walking motor pushed it out from under the shelf 0.35 m in one tick.

**Why.** A path's pose check (`poseClear`, `body/mantle.ts`) took a slab as overhead when `c.y0 >= y + height - 1e-6`. So it let a head into a slab by up to a micrometre. The walking motor (`c.y0 >= head`, `body/motor.ts`) and the watch (`c.y0 >= b.y + height`, `body/invariants.ts`) allow none. A pose in that micrometre was clear to the path and inside the shelf to everything else.
- **SWP-1424-4, reaching for the rungs.** The reach keeps the feet on the ground under it (`keepOnGround`). The ground there rose 0.68 mm, which put the head 0.96 µm into the shelf. The check let it by.
- **RFN-1208-3, climbing.** A climb step put the head 0.17 µm into a shelf over the ladder's line. The check let it by.

The slack came with the mantle (C4) and nothing in the motor needed it. The poses it let through weren't float error to be absorbed. They were heads a step of the path had honestly put into a slab.

**Decision.** The pose check takes a slab as overhead by the same comparison as the rest of the motor: `c.y0 >= y + height`, with the same `y` and `height`, and no allowance. A pose that puts the head into a slab by any amount is refused, as any other pose in the way is. On a ladder that means the body holds still under the shelf; reaching for the rungs, it lets go and stays on the ground. The motor's header states it as an invariant of every path: a body on a path never ends a tick in a pose the walking motor would call inside something, and one that comes off its path stays where it is.

**Not done instead.** Clamping the head to the slab's underside (`y = c.y0 - height`). `(c.y0 - height) + height` need not come back to `c.y0` in floating point, so the clamped pose could still be a bit inside. And it would let a climb end anywhere under a shelf, where now it ends one step short, as it does under any slab. Teaching the walking motor or the watch to allow a micrometre was the other way round, and it would have widened what every body may do.

**Proven.**
- Both towers hold for their full four minutes, and both are kept with the scene (`TOWER_FINDS`), which `tests/ladder.test.ts` plays.
- `tests/ladder.test.ts`, "never takes a pose with its head a hair into a slab": a slab over the ladder whose underside is 0.17, 0.5 and 0.96 µm under where a climb step would put the head. The head never goes above the underside, the watch sees nothing, and off the ladder the body stays where it is. On `main` it fails: the head ends at 3.000000000000001 under a slab at 2.99999983.
- The ladder, mantle, player, solids, invariants and steep tests pass, and so do the architecture tests and both typechecks.
- Fresh towers: 600, each played as the long run plays one (four minutes, `TOWER_SECONDS`), and none broke a promise. The fault was about one tower in 1,300, so that says nothing else broke; the two towers and the test are what show the fix.
- The standing benches, in CI on this pull request: all ten read the same as `main`, run by run, over 1,078 runs a side. `main`'s side came from the cache in nine seconds a shard.

**Versions and pins.** `SIM_VERSION` 30. A body on a path now stops where it used to go a hair into a slab, so a recording made before this may not replay: a change to what the game does takes a version whether or not a pinned run shows it, as 22, 23, 26 and 28 did (`CLAUDE.md`, rule 11, now says so). No pinned run has a path's pose within a micrometre of a slab, so no fingerprint moved (`npm run selftest` matches) and every lane's bench holds its pinned numbers. The golden recording is rewritten for the version.

**What it leaves.** A climb now stops a step short under a shelf, as it always did for anything more than a micrometre in. The watch still checks the head as a sphere, whose top is `y + height - r + r`, which can differ from `y + height` by the last bit of a float for any body, walking or not. Nothing has broken on it.

## 2026-11-13 · The standing benches and the whole suite are CI's to run, and a quick gate stays here

The owner, Nov 13: "If you'd like to reevaluate any of our workflows or pipelines to ensure they're absolutely optimal for how we're building, please do so. I don't want us to get trapped by anything stale that's now hurting us but seemed like a good idea in the past."

**What was wrong.** Two steps of the pipeline cost more than the work they checked, on the day the three changes below landed.

- **Comparing the benches.** A change to how a camp behaves has to show that the camp's other benches still read as on `main`. That meant about ten experiments run on `main` and again on the branch, 20 to 50 minutes a pass on a machine other work kept at a load of 60 to 200, and the tables compared by eye or by a script kept outside the repository. A saved pass on `main` went stale when `main` moved. And what found the one real fault that day, the first valley fix cutting a camp's section off from its firing points, was reading the runs camp by camp: the tables of means held.
- **The whole suite, here.** The rule was that `npm run check` passes before anything is handed back. With the machine loaded, one run took 41 minutes and failed 29 tests, every one a timeout and none an assertion. Run again apart from the rest, they passed. CI runs the same suite on clean machines for every pull request, and `npm run land` lands only what it passed, so the run here was checking, slowly and unreliably, what CI checks anyway.

**What's built.**

- **An experiment's results as data** (`src/lab/results.ts`; `npm run experiment -- <name> --json <file>`): every run's values, by arm, seed and roll of the dice.
- **The standing set, as data** (`src/lab/standing.ts`): `circling`, `second-step`, `own-side` with three rolls of the dice, `ladder`, `flaws`, `takedown`, `out-the-gate`, `hunt`, `firefight` and `answer`. With it, a pure comparison of two builds' results: the figures that moved, as each side's table prints them, and the runs that read differently, by seed and roll, the largest first.
- **`npm run standing -- --base origin/main`** (`src/headless/standing.ts`): the set on this checkout and on a ref, and the comparison. A ref is run in a temporary worktree, by this checkout's tool loading that checkout's experiments (`--root`), so a build that predates the tool is run the same way. Results are kept under `.cache/standing/` by what a bench depends on, which is git's hashes of `src`, `package-lock.json`, `tsconfig.json` and `.nvmrc`. So a ref is run once for as long as its code stands, and a change to docs or tests runs nothing.
- **CI** (`.github/workflows/standing.yml`): for every pull request, the set on the base and on the head, four shards each, cached by the same hash and the tool's own files, and the comparison in the run's summary. It informs, and never fails because a bench differs. A push to `main` runs the set on `main` alone (added the same day, after this landed): GitHub lets a pull request restore a cache made on `main` but never one made by another pull request, so without it every pull request ran its base again. Its first run, on this change: 1,078 runs a side in 47 minutes of machine time, done in 19.5 minutes side by side. The dearest bench, `own-side` with its five arms, took 16 minutes alone, so the shards are now dealt by measured cost, dearest first to the lightest shard, and that bench sets how long the set takes.
- **`npm run precheck`** (`src/headless/precheck.ts`; renamed `npm run gate` the next day, above): typecheck, the architecture test, every test file the branch changed, and the self-test. About 90 s.

**What changes in the working rules** (`CLAUDE.md`, *Checking work*).

- Before a push or a hand-back, `npm run precheck` passes. The whole suite is CI's to run, and `npm run check` is for when this machine is quiet.
- A change to behaviour lands with the standing comparison read (CI's summary, or `npm run standing -- --base origin/main`), and its entry here says what moved and why.
- A new behaviour's bench joins the set when it lands.

**What's proven.**

- `tests/standing.test.ts`: 11 tests on made-up results.
- `main` against this change, which alters no behaviour, on CI: all ten benches the same, every one of 1,078 runs. The same on one bench here (`--base origin/main --only answer`: 54 runs), with `main` run in a temporary worktree that was removed after.
- Two values altered by hand in a copy of one bench's results are reported as exactly those two runs and the two figures they move.

**What it leaves.**

- **The sittings aren't in it.** A sitting's link played headless (`npm run sitting`) is still run by hand on both builds: the links are on the owner's desk and in the plan, not in code.
- **An arm or a measure only one build has** is named as such and otherwise left out: the comparison is of what both builds have.
- **"The largest first"** goes by the raw gap between two values, whatever the measure's unit.
- **The cache here is never pruned.** `.cache/standing/` grows by a few hundred kilobytes a build.
- **`npm run land` waits for CI's benches too,** since it waits for every check.

## 2026-11-13 · A man whose round is held shifts a pace for a clear line

**What it is.** Proposed when step 2d left men holding, and built on the owner's yes (Nov 13): a guard whose fire is held for one of his own steps aside for a clear line, instead of standing there holding. Since step 2d a man holds his fire for one of the camp's own anywhere his round could go (`game/combat.ts`, `ownInTheWay`). He then stood where he was and tried again a second later. A held round counted toward his burst, so three of them put him down having fired nothing, and he came up at the same place to the same man in the way. By the wall in the `own-side` fight that was 12.9 rounds held a fight, and 3.1 s from a hold to that man's next round. Now he shifts a pace sideways, away from the man in the way, just far enough that his round would go, and fires from there. He doesn't walk round him and he doesn't leave his cover (`docs/camp-engine.md`, section 9, *Step 2e*).

**What's built.**

- **What he saw over his sights** (`game/combat.ts`, `seenInTheWay`; `BrainState.heldLine`). Where the round is made, the game records three numbers about the one man his round was held for, at that moment, relative to his own line of fire: which side of it the man stands, how far it is from his nearest edge, and how far along it he is. This keeps rule 13 for the reason step 2d gave: a man sees who is in front of his rifle. It says nothing of where anyone else on his side is, nor where that man is in the camp, nor anything after that moment. The silent hold (a man dead on the line) records it too. `ownInTheWay` hands back how far along the line the man is through an out-parameter, where it used to leave it in a shared scratch.
- **The pace** (`brain/firefight.ts`, `paceFor`). A pace `p` moves his line by `p (1 − along / L)` where that man stands, `L` being how far off he believes the intruder is. He needs the man's edge outside what holds a round (`along × spread + clear`), and `pad` more, and aims `near` past it because that's how short of a place he may stop: `p = (along × spread + clear + pad − off) / (1 − along / L) + near`. A man dead on the line (`deadOn`) can be cleared either way, the first side by his id, so a column fans out.
- **The place** has to be one he can stand on and walk straight to, with a line to where the intruder is, no more than `cap` from his position's firing place, and showing no more of him to the intruder's place than the firing place does. That last is graded (`brain/positions.ts`, `exposure`): `exposedAt` is one ray to the top of a man and is true at every firing place, so `exposure` counts six points on him, the top of his head and the middle of him, each at the middle and a shoulder's width either side.
- **A held round mid-burst** doesn't count, and his burst starts afresh at the new place. **A held last round** puts him down, as it always did, and on his next think he comes straight back up at the new place for a fresh burst: `answers` times running (one), so a man among several of his own still gets down. An ordinary time down starts the count again.
- **A pace he can't finish** (someone on the place) is given up `within` seconds after he chose it, and he gets down, the held round counted.
- **The place is kept while his position stands** (`keep`). He gets down at his position's hiding place and comes up next time at the place he kept, if it still has a line and shows no more of him to where the intruder is believed now; if not, or this tick has no look left, at his position's own. A round held at a kept place moves him again from where he stands, within `cap`, and counts; with nowhere to go he's back on his position's place.
- **`off=shift`** plays a camp whose men hold and wait. It's also off with `mates`, `firefight` or `fight`.
- **Explainable** (rule 8): the `held` event says which side the man was and how far off, a `shift` event says what he did (a pace, another from a place he'd shifted to, a time up begun at a kept place, a pace given up, a held last round the bound didn't answer), the debug label reads "shifting for a clear line", and the debug view draws the pace from the firing place.
- **Numbers** (`tuning.brain.firefight.shift`, the owner's to set by playing): `cap` 1.5 m, `deadOn` 0.2 m, `pad` 0.1 m, `near` 0.1 m, `within` 1.5 s, `answers` 1, `keep` true.

**What's proven.**

- **No held round, no difference.** Nothing of this runs until a round is held, and it draws nothing from a man's stream before then. On DOT-6344, both plans of the `own-side` fight (180 s each, no round held), a camp that shifts and one with `off=shift` match in every body's pose and every event, tick for tick; the state differs by the camp's flag alone. The first build counted every burst's last round a tick late, so every fight in every live camp would have differed from `main`; the review caught it, and the held last round is answered from down instead. With `off=shift`, the state hash and every event's kind matched the build before this, tick for tick, on TES-6931, LEB-2534 and DOT-6344, both plans (92 holds in one).
- `tests/clearLine.test.ts`: two men in a line and an intruder beyond them. The rear man's round is held, he shifts away from the man in front no farther than the cap, fires within 3 s, and none of his rounds passes within the margin of that man. With the switch off he never shifts. Against a wall with no place to shift to, he holds, and gets down after a burst of held rounds. Dead on the line, the side goes by his id. A held last round brings him straight back up for a whole fresh burst, and only so many times running. A third man standing on the place makes him give it up and get down. With places kept he comes up at the kept place; without, never. A fight with no round held is the same in every pose and event with the switch on and off.
- **The `own-side` bench** (`npm run experiment -- own-side --dice 3`, 24 camps, three rolls of the dice on each, 63 fights a plan):

| | Fires past his own (`off=mates`) | Holds and waits (`off=shift`) | A pace for one burst | A pace kept |
| --- | --- | --- | --- | --- |
| **He stays by the wall.** Fights with a man shot by his own side | 7 | 0 | 0 | **0** |
| Rounds the camp fired, a fight | 69.2 | 58.4 | 68.8 | **69.5** |
| Rounds held for one of its own | 0 | 12.9 | 9.7 | **6.9** |
| Paces taken | 0 | 0 | 3.5 | 1.5 |
| Bursts begun from a kept place | 0 | 0 | 0 | 5.6 |
| Shifts held again: by the same man / by another | – | – | 0.62 / 0.56 | 0.40 / 0.30 |
| Paces given up | – | – | 0.11 | 0.25 |
| Held last rounds not answered, by the bound | – | – | 0.08 | 0.02 |
| Longest run of bursts by one man without a time down | 1.2 | 1.2 | 1.3 | 1.3 |
| Seconds from a hold to that man's next round (median of a fight's) | – | 3.1 | 2.0 | 1.7 |
| **He runs for the trees.** Fights with a man shot by his own side | 4 | 0 | 0 | **0** |
| Rounds the camp fired, a fight | 157 | 153 | 157 | **160** |
| Rounds held for one of its own | 0 | 8.0 | 6.3 | **3.9** |
| Seconds from a hold to that man's next round (median of a fight's) | – | 4.0 | 1.9 | 2.0 |
| Rounds that hit him once he was out | 46.7 | 45.8 | 46.7 | 47.7 |

The rounds holding cost are back (69.5 a fight by the wall, where firing past its own fired 69.2), a hold is followed by a round in about half the time, a runner is hit as often, and nobody is shot by his own side. Kept is the default because, against a pace for one burst, rounds held go down and rounds fired don't. With the bound on coming straight back up lifted, every figure in the kept column reads the same but bursts begun from a kept place (5.3 where the bound gives 5.6): a man held at the end of burst after burst didn't happen on these camps, and the bound is there for one where it would. "Rounds held" counts every hold by the brain's own record of it, the silent ones included, so it reads higher than step 2d's table (12.9 where that said 11).

**The standing benches, against `main` at d2586ab.**

Only a fight in which a round is held can read differently from `main`, and where one does the camp fires a little more. No count moves by more than one camp, and nobody is shot by his own side on any bench.

| Bench | How it reads |
| --- | --- |
| `second-step`, `takedown`, `answer`, `flaws` | Every figure the same |
| `own-side --dice 3` | With `off=mates`, and with `off=shift`, every figure `main` has for its two arms is the same, but rounds held, which the bench now counts by the brain's own record (12.9 by the wall where `main`'s count says 11.6) |
| `out-the-gate` | He stays by the wall: the men who came out fire 15.7 rounds a fight, where it was 10.9. He runs for the trees: 65.4 rounds fired at him, where it was 63.2, and 20.7 hit him once he was out, where it was 20.3. Who comes out, how many and how soon are the same, and with `off=chase` every figure is |
| `hunt` | One figure: with no hunt, four shots and he stays, enough rounds on him to kill by 288 s, where it was 304. Every count the same |
| `firefight` | One figure: circling, 37.8 rounds at him, where it was 37.4 |
| `circling` | The plain yard: made out at all 12 → 13 of 16, and 28.8 rounds at him, where it was 28.6. Rounds at him on a farm 22.3 → 22.5, and as built 35.4 → 35.8 |
| `ladder` | Careless: guards down 4.3 → 4.4, and 21.3 rounds at him, where it was 21.1 |

**The sittings.** The four takedown links the owner's sittings play (`npm run sitting`: HOT-7106, NUT-4776 from the perch and from the ground, LEB-2534) read line for line as on `main`.

**Versions and pins.** `SIM_VERSION` 29: men whose round is held now move. No pinned run holds a round, so no pinned `behaviour` value moved. `STATE_SCHEMA` 19: a camp's `shifts`, a man's `heldLine`, `shiftNews`, and a firefight's `shift` and `answered` are new state, and every pinned `state` value moved with the schema's number. The golden recording is rewritten. Every lane's bench holds its pinned numbers, so no bench pin moved.

**What it leaves.**

- **He finds a man on his kept place by walking into him** (0.25 a fight by the wall). Nothing tells him a place is taken until he can't get onto it.
- **Positions half a metre apart are still handed out.** Nothing tells a man a spot is taken, so two men can fight shoulder to shoulder; on TES-6931 that's what a shift held again by the same man was, the one beside him shuffling back onto his own place, into the line the pace had cleared.
- **The place is judged against where he believes the intruder is**, not where he is, and checked again each time he comes up.
- **He knows only the man his round was held for.** Two men can shift the same way, or a shift can put another man in front of him. The game holds the round again, so nobody is shot for it, and the round counts.
- **He comes back to within 0.45 m of his hiding place**, as a man always did, not onto it.
- **A man running across a line of fire still isn't led**, and nothing past the target counts (step 2d's).
- **Nobody has played it.** Whether a pace and a half is the most a man would take, and whether it reads as a man stepping aside or as fidgeting, is the owner's: `off=shift` plays a camp that holds and waits, and `shift.keep` false a pace for one burst.

## 2026-11-13 · A route keeps off ground too steep to climb

**What broke.** Men of a hunting section, at a run out in the valley with nobody near them, stopped dead, stepped aside, tried again, and after five tries gave the walk up. A second and a half later they asked for a route, were given the same one, and did it again. Found while measuring the held-up walk (below), and on `main` before it. On HEL-2923, a yard, played the way the circling bench plays it, guard 9:

| | |
| --- | --- |
| 126 s | At a run for a waypoint 6 m to his east, he stops at (132.5, −94.2). A step north, and he's stopped again 2 m on. A step south, and he's back where he was. Five stalls, and the walk is given up |
| 250 s | Standing at (384.1, −95.9) with his route given up again, 95 m short of where the hunt sent him |

Both places are the edge of a cell the map calls walkable. A cell of the 2.5 m map layer is lined up with a cell of the terrain, which is two triangles (rule 7). A cell answers for the ground's slope at its middle, and the middle of a cell always lies on the same one of the two. At the first place that triangle is 27° and the other is 45°. At the second they are 32° and 44°. The limit is 42°, the motor's own, and the motor stops a body at whichever triangle it steps on to. So his route ran straight up ground he couldn't climb, and the step aside a held-up walk takes (1.7 m) can't get round a face a cell wide.

**How much of a valley.** On 20 valleys, 11,084 of 5.1 million walkable map cells have a triangle over the limit that the cell doesn't answer for: 0.22%, between 190 and 815 a valley, the steepest at 66°. They lie along the foot and the lip of every steep face, which is where a route round the face runs.

**The first fix, and why it doesn't stand.** A cell was made steep if either of its triangles is. It cured the stalls, and it took ground away that men use: a cell with one bad triangle is half good ground, and on `main` sections were getting through such places. Measured on the hunt bench's 12 camps, with their 346 listed firing points:

| | `main` | A whole cell steep | As built |
| --- | --- | --- | --- |
| Firing points a section has a covered way to, within the 900 m it's sent | 310 | 292 | 310 |
| A walker's route to GAP-2753's best overview | 525 m | 881 m | 530 m |
| A walker's route to a listed firing point, against `main`'s | the same | 22 m longer on average, the worst 493 m | 3 m longer on average, the worst 61 m |
| GAP-2753: a section sent after one shot | yes | no: no way to 11 of its firing points | yes |

It also reached into generation, which reads the same cells: built on that map, a perch, a post or a device moved on five of the twelve camps the owner's sittings play, and generation needed a copy of the old map to stand still. Three commits on this branch are that fix and its retreat.

A second try closed the edges into a bad triangle and left the cell alone. A walker's routes came back to within a few metres of `main`'s, and the hunt's planning didn't: it joins places 10 m apart by looking for a way inside the two of them (`brain/approach.ts`), and with a few edges gone it still lost 18 covered ways. Letting it look 5 m wider lost 14, gained 8 and moved others by hundreds of metres. The hunt's reading of the ground is its own piece of work, and this isn't it.

**What's built.**

- **The map marks the walks that climb such ground** (`kernel/world/grid.ts`, `Edge.EastSteep` and `Edge.NorthSteep`). For every edge a body fits along, the walk from one cell's middle to the next is measured on the terrain's own triangles, both ways (`gainOnSteep`). If it gains more than the motor's own slack (2 mm) on a triangle over the limit, the edge is marked. A cell's flag and the bit that says a body fits are as they were. On HEL-2923 that is 253 of 492,000 edges.
- **A route keeps off them** (`brain/nav.ts`). The navigator's searches over the map layer close a marked move, and a corner move where any side of its square is marked. The field that leads a route to the camp's rim is flooded the same way. An end that the marks have cut off, which is a ledge, is taken as the nearest cell with a way out of it.
- **And isn't pulled straight across one.** `clear`, which says whether a body can walk a straight stretch, now also says no to one that gains height on ground too steep, going that way. So string-pulling doesn't put back what the search went round, and the side a held-up man steps to is judged on it.
- **Nothing else reads the marks.** Sound, the camp's knowledge of its ground, the hunt's covered ways, the bots and generation all read the cells and the fitting bits, which haven't moved. So every seed builds the camp it built, and a section is sent where it was sent. On 20 valleys, nothing generation made differs from `main`'s apart from the marks: every cell's flag, its cover and the edges a body fits along are the same on both layers, and a valley has between 122 and 440 marks, all on the map layer.
- **The site layer isn't marked.** Its cells are a fifth as wide, and no walk inside a camp has been seen to fail this way.
- **No switch.** The other side to play is a route up a face a body can't climb.

**What's proven.**

- `tests/grid.test.ts`: on a ramp with one vertex dipped, the one walk that runs up the triangle neither cell answers for is marked, and the cell, its other edges and the fine layer aren't. On HEL-2923 the marks are exactly the walks that gain height on ground too steep, either way, among 492,000 edges: none missed and none extra.
- `tests/nav.test.ts`: at the place guard 9 stopped, the straight way east gains 1.16 m on the 45° triangle. `clear` refuses it going up and allows it coming down, and the route goes round in 15.8 m where the straight line is 15.0, with no stretch that climbs.
- `tests/world.test.ts`: the grid's slope limit is the guards' as well as the player's.
- HEL-2923, guard 9: no stall between 120 s and 270 s, and at the place the hunt sent him by 240 s.
- GAP-2753: the hunt goes out as on `main`, to the second.
- The stall census (every stall of every walk, on both builds). The hunt bench, 12 camps and 24 runs: stalls 346 → 240, walks given up 30 → 14, and 5 runs on 5 camps read differently. On ROL-8005 the section now finds him, where on `main` it stalled 50 times and gave up 8 walks. The circling bench, 16 camps and 96 runs: stalls 653 → 234, walks given up 86 → 13, and 12 runs on 9 camps read differently. On HEL-2923's yard the camp now finds him (stalls 33 → 2, walks given up 5 → 0), and no run loses a find.

**The standing benches, against `main` at ea9c1a7.** Men who go round steep ground get to some places by other routes and at other times, so the benches that send men out into the valley can't all read the same. No count moves by more than two camps.

| Bench | How it reads |
| --- | --- |
| `second-step`, `out-the-gate`, `takedown`, `answer`, `own-side --dice 3`, `flaws` | Every figure the same |
| `seeds -- --count 100` | Every figure the same: 90 of 100 valid the first time |
| `hunt` | With the hunt, one shot and he stays: found 8 → 9 of 12, found after 221 → 233 s, enough rounds on him to kill 3 → 4 of 12, by 185 → 199 s. It watches his place for 161 s after, where it was 164. A section is sent on 10 of 12, as on `main` |
| `circling` | Made out at all on the plain yard 11 → 12 of 16. Means inside their intervals |
| `firefight` | With the firefight, someone came after him 1 → 2 of 6. Means inside their intervals |
| `ladder` | Shoot and relocate: shot dead 4 → 2 of 16, detected 4 → 2 of 16. Means inside their intervals |

**Versions and pins.** `GEN_VERSION` 10: the grid in a world carries the marks, and TAL-4471's fingerprint is `4640c8146acaa42b`. `SIM_VERSION` 28: routes changed. No pinned run's route crossed such ground, so no pinned run's `behaviour` or `state` moved, and no bench pin moved. Two tests pin whole worlds as generation made them before compound types and before upper floors (`tests/types.test.ts`, `tests/storeys.test.ts`). They now leave the marks out (`withoutSteepMarks`, `tests/fixtures.ts`), as they already leave out the fields those changes added, and their five pins stand as they were: on TAL-4471 as a yard, MAZ-1737, HAM-3144, TAP-5457 and HUB-9331, nothing but the marks moved.

**What it leaves.**

- **The hunt's covered ways don't read the marks.** A way can still cross a marked walk, and the men on it go round by their own routes, a few metres longer. Planning that reads them needs a truer way of joining its places than looking inside the two of them, as the second try showed.
- **Nor does generation,** when it asks which perches a body can walk to. It should at its next deliberate change, when camps move anyway.
- **A marked walk is closed both ways,** though a body can come down it. A route that would have gone down a face goes round.
- **The site layer,** as above.
- **PUH-1156, the second case in the note that started this, isn't this.** On `main` today guard 8 runs into guard 7 there, steps round him once and goes on: the held-up walk's fix at work.
- A truck or a gate, which is an entity's shape, is still not in the grid, as its header says.

## 2026-11-13 · Men sent about the target each have a place

**What broke.** Found while landing the held-up walk (below): the relief's men and the men the camp sends for its target stood four to a spot. It shows since that fix, because the relief now arrives together (`npm run experiment -- flaws` counted 4 pile-ups before it and 40 after, all on three camps). `npm run flaws -- NUB-9046 suppressed-sniper` on `main`:

| | |
| --- | --- |
| 108 s | The relief arrives. Its first two men are sent in for him (`squadArrives`): to his room, six seconds at his door, then out to his vehicle to cover his way |
| 150 s | Both stand at the vehicle's point, at (−1.1, −41.7) and (−0.7, −42.2): half a metre apart |
| 155 s | His vehicle hasn't moved, so the commander sends two of the camp's own the same way (`fetchEvery`, 45 s after the first two) |
| 170 s | They're on that point too. Four men within 2.5 m, until the order lapses and they look about them where they stand, at about 195 s |

Every man on that errand was given the one point, at his door and then by his vehicle, and walked to it. On GIN-9513 it's the door: the relief's two stop at one spot in the doorway, beside a man already in cover there, as the target comes out.

**What's built.** A man is handed a place with his task (`Tasking.place`): a number, and nothing more. He knows no more of the others than he did (rule 13).

- **Who gets which.** The relief's two get 0 and 1 (`game/comms.ts`). Each pair the commander sends after them gets the next two (`brain/commander.ts`): a man's own is the task's first and his number among those sent, put on the order as it reaches him. In a camp that bolts, the man on the door is 0 and the man who started the engine is 1 (`brain/protect.ts`, `drill`).
- **By the vehicle** (`placeAt`, in the shape of the hunt's `spotAt`): place 0 on the point, and the rest across the way from his room to it, on alternate sides, 1.5 m between each (`tuning.brain.protect.apart`). Where a man couldn't walk straight from the point to his place (a wall, the vehicle itself), he stops short of the point on that line, so men file. Where even that isn't open, he stands on the point.
- **At his door** the second man of a pair stops 1.5 m further out, on his own way in. The sideways place is for open ground: a room may be upstairs, and a doorway has nothing beside it.
- **`off=places`** plays a camp that sends them all to the point. With it the state is `main`'s, tick for tick, on the three camps below.
- **The flaw report** no longer calls a man stuck who stands where his order put him (an escort by the vehicle, a man by it to start it, one on a door), and `npm run flaws -- <seed> <attack> <off>` takes switches.

**What it's worth.** Pile-up lines in the flaw report (a man with three others within 2.5 m for over 4 s):

| | `main` | Places |
| --- | --- | --- |
| NUB-9046, `suppressed-sniper` | 12 | 0 |
| GIN-9513, `relocating` | 4 | 0 |
| SUK-5361, `sniper` | 3 | 1 |

SUK-5361's one is at 148 s: the relief's two are 1.7 m apart, beside an officer on his round and the sentry at that door.

**One test changed.** `tests/answer.test.ts` holds the man on the target's door to staying by it while a shooter circles the camp, and needs the shooter to come round to him. On NUT-4776 the shooter was killed at 378 s, after he had. With a relief man standing 1.5 m short of the door the fight takes another course and he's killed at 300 s, before. Who wins on the way isn't what that test is about, so its shooter can't be hurt.

**The standing benches, against `main` at ea9c1a7.** Two men standing 1.5 m apart, where they stood on one spot, send the rest of a fight a little differently, so these can't all read the same. No count moves by more than one camp.

| Bench | How it reads |
| --- | --- |
| `out-the-gate`, `takedown`, `own-side --dice 3` | Every figure the same |
| `hunt`, `second-step`, `answer`, `ladder` | One to three figures each, in the last digit: a second off a time, a tenth off a mean |
| `firefight` | With the firefight, two means inside their intervals. In the arm that plays a camp without it, five counts by one camp each |
| `circling` | Three counts by one camp each: made out at all, on the plain yard (11 → 12 of 16) and the keep (13 → 14), and shot dead on the walk, on the keep (15 → 14). Means inside their intervals |
| `flaws`, 8 camps | 15 of 72 runs, on 4 camps. `stuck` falls in 14 of them, which is partly the report itself, no longer counting a man who stands where he was sent. Pile-ups on GIN-9513: `suppressed-sniper` 2 → 0, `relocating` 4 → 0, `two-fronts` 3 → 5 |

**GIN-9513 under `two-fronts` isn't men on one spot.** From 131 s to 137 s, on `main` and here, there's a crowd at his door: the relief's two have reached it and are giving him his six seconds to come (`protect.wait`), the door's sentry is a metre from them, the target comes out past them, and a worker on his way to cover is held up getting by. On `main` the second relief man pushed up behind the first, stepped aside and walked off. Here he waits 1.5 m behind him, as built, so he and the sentry beside him are in the count too. What's left there is a way out that men waiting at a door have shut.

**The sittings.** The `answer` and `takedown` sittings' links, played headless on both builds (`npm run sitting`): HOT-7106 and NUT-4776, from the perch and from the ground, read line for line as on `main`. On LEB-2534 the target sees a body a second sooner and is away at 2:35, where it was 2:36, for the same reason.

**Versions and pins.** `SIM_VERSION` 27. `STATE_SCHEMA` 18: a camp's `places` and a task's `place` are new state. No pinned run's `behaviour` moved. Every pinned `state` value did, since the schema's number is part of what's hashed. The golden recording is rewritten, and no bench pin moved.

**What it leaves.**

- **A crowd at his door while men wait for him,** as on GIN-9513 above: nobody is told to keep the way out clear.
- **The camp sends two more men every 45 s while his vehicle hasn't moved,** up to three times, whether or not he ever came out. On NUB-9046 he never did, and the same two were sent again at 200 s. That is the camp's answer as built (`fetchEvery`, `fetches`), and the owner's to tune.
- **A bolting camp's two and the relief's two share places 0 and 1** if they're ever by the vehicle together. It needs a drill left stranded as the relief arrives, and hasn't been seen.
- **The chase's two men still share one kneeling place** outside an opening (`performChase`): the second presses at the first for a second or two on PID-8021 and ZOH-8906. The chase was built to change nothing else, so that is its own change if it's worth one.
- **`apart` is the owner's by playing.**

## 2026-11-12 · A man held up by a mate steps round him

**What broke.** Tracing the chase (below) turned up a fault in how a man walks a route, older than the chase and there for every act that sets a man off at a run. `npm run scene -- out-the-gate --params 'seed=DOT-6344&for=160'`: an officer 45 m from the gate takes up the chase 4.4 s after the intruder has gone out of it. The first steps of his way run along a wall, and another man is crouched on that line, 0.4 m from the wall. A route is planned on a grid that knows nothing of bodies, and a brain doesn't see its own side (rule 13), so the officer finds his mate by running into him. On `main`, from the moment he sets off:

| | |
| --- | --- |
| 0.5 s | He reaches him. Sliding off a body takes him the short way round, which is into the gap between the man and the wall, and the gap is narrower than he is |
| to 4.5 s | Pressed there, he slides 2 cm nearer his waypoint every 0.4 s. A walk stalls when it gains nothing for 0.9 s, and 2 cm counted as gaining |
| 4.5 s | His first step aside, by turns: to his right, which is the wall. 0.7 s of nothing |
| 5.4 s | 0.2 s later he is "stalled" again: the 0.9 s ran from when the step began. Left, for 0.7 s at a sprint: 2.6 m, and into a low wall |
| 6.3 s, 7.2 s | Right 3 m, left 2 m, each time heading back for the same waypoint from somewhere the straight line to it is shut |
| 8.2 s | The walk gives up. He stands for 1.5 s, finds a new route from where all that left him, and goes |

The first man was out of that gate 24 s behind the intruder, where the other camps take about 12.

**Measured first.** Every man who takes up the chase on the bench's 24 camps (50 of them, on the 21 camps where the intruder is seen and gets out): nine stalls and a walk given up, and DOT-6344 is the one camp where it cost the chase its head start. With the fix it's two stalls and none given up, and 19 of the 21 camps read exactly as they did.

**Decision** (`brain/nav.ts`, `followRoute`; `brain/moves.ts`, `walk`). A man can't see his mate, but he knows two things: how his own legs are doing, and the ground. Four parts, and what each is worth, by taking it out again on the four camps of the 24 where a walk stalls once the intruder is out (every man's walk, not only the chasers'):

| | DOT-6344: first man out | The other three |
| --- | --- | --- |
| As it was | 23.9 s, a walk given up | Walks given up on VOM-2928 and PET-8787 |
| All four | **16.4 s**, one stall | No walk given up on any |
| Without 1: sliding still counts as gaining | 19.3 s | |
| Without 2: a step lasts 0.7 s at any pace | 20.0 s, two stalls | PET-8787: a second stall, and eyes on him a second later |
| Without 3: sides by turns | 19.6 s, two stalls | |
| Without 4: no fresh time after a step | 16.4 s | VOM-2928: eight stalls and a walk given up. ZOH-8906: three stalls |

1. **Pressed against something, he steps aside at once.** He asked his legs for a pace and got less than a tenth of it (`nav.creep`): whatever that gains him doesn't restart the 0.9 s. What he asked is the order he gave last tick, so a man who stopped to fire and walks on isn't "pressed". It brings forward one step on each leg of a route (`nav.creepSteps`). After it, sliding counts as it did.
2. **A step is no longer than gets him round a truck, at any pace** (`nav.sideStep`, 1.7 m: half the camp's truck, half himself, and a little). It ends when it has taken him that far off the line he was on, or after 0.7 s as before. Up to a hurry (2.4 m/s) the time runs out first and the step is what it was. At a run it was 3.6 m, and the next wall.
3. **It goes to the side the ground makes the better** (`Feel.open`, the navigator's own test of a straight walk): first a side he can walk straight on to his waypoint from, then a side the step itself is clear to. Wedged between a mate and a wall there is one way round, and by turns he tried the wall first half the time. Where the ground doesn't choose, it's by turns as before.
4. **His time starts again when the step is over.** It ran from when the step began, which left 0.2 s after it to gain on the waypoint before he was stepping the other way.

On DOT-6344 the officer reaches his mate half a second after setting off, is stopped for a second, steps left, and is heading down his route again at 2.0 s, at a sprint by 2.2 s.

**The owner's limit, and what it caught.** "Don't want our efforts in fixing this more minor problem to cascade": every other bench was re-run against `main`, camp by camp, with a count of every stall in every run. A stall is where this changes anything, so a run with one can come out differently, and a man who gets somewhere two seconds sooner changes a fight. That much was expected. Five things the first versions did were not, and each was this fix reaching too far. The circling bench found them: it has the longest runs and the most men moving.

- **A step a body wide doesn't get round a truck.** The first version stepped 0.95 m, sized for a man. On TAP-5457 a relief man going back to his place found the camp's own truck across his way, end on. 0.95 m to one side, pressed again, 0.95 m back: 44 stalls and eight walks given up in a minute, behind a truck he used to get round in one step of 1.7 m. A step is as long as it was at a hurry, and no longer at a run.
- **Sliding is how a man gets through where there's no room to step.** The first version never counted it. A man behind two kneeling in a gateway stepped from side to side until his walk gave up (PET-8787), where on `main` it didn't, and a man who was sliding round another in a doorway never got out of it. Being pressed now brings the first step forward and nothing more.
- **A slide round a shoulder was taken for being pressed.** At a fifth of his pace the first version stopped a man who was a second from getting round another in a doorway (GUF-8063), and he never got out of the hut. Sliding off a body feeds itself: the further round he is, the faster he goes. Pressed is under a tenth, which a slide that is going anywhere is past within a few ticks.
- **A step round the end of a wall left him behind it.** On PUH-1156 a man sliding round a wall's end stepped to the side his route didn't go, walked 11 m along the wrong face of the wall toward his waypoint, and gave up against it. Pressed against a corner, no step from where he stands looks clear, so the ground chose nothing and his turn chose wrong. What counts most now is whether he can walk on to his waypoint from where the step ends.
- **A patrol who stopped to fire was "pressed" the moment he walked on.** The first version went by his speed alone, and he was standing still. It goes by what he asked of his legs.

**Tried, and taken out: a new route from where the step leaves him.** It looked like the plain answer to "the straight line from there may be shut, or the waypoint may be behind him". On the chase's camps it changed nothing, and on VOM-2928 it was worse. There a man starts inside a hut with another crouched in its doorway. With his old route, one step aside and he slides round the man's shoulder to a waypoint 0.8 m off, and is through in 2.7 s. With a new one, its first waypoint is on the far side of the man in the door, he has to get all the way round him, and five stalls later he gives up, as he does on `main`. The old route's next point is nearly always the nearer one. So he keeps it.

**Not done instead.**
- **Having a man know where his mates are,** and walk round one without touching him. A brain still doesn't: holding his fire for them is settled where the round is made (the entry below), which "leaves the brain as it was", to be given that knowledge "when something needs it". This is a second thing that would use it. Until then this is what a man can do blind, and it stays right once he can see: something no map shows can still be in his way.
- **Steering round bodies below the brain,** where the game can see them. Sliding off a body already does that, and it is what took the officer into the gap: to do better it has to know the wall, which is planning, and the brain's.
- **Having the man in the way step aside.** He's behind that wall because he's fighting from it.
- **A shorter wait.** 0.9 s without progress is what tells a mate who is in the way from one who is crossing it, and two men who brush past each other still sort themselves out without a step.
- **A switch.** It's a fault in how a man walks, not a way for a camp to behave. `nav.creepSteps: 0` and a large `nav.sideStep` play the first two parts as they were.

**What it leaves.**
- **He still finds his mate by running into him,** and stands against him for 0.9 s. Until a brain knows where its mates are.
- **Two men sent out by one opening are given the same place to kneel.** The second presses at the first for a second or two when he gets there (PID-8021, 2.2 s; ZOH-8906, where the second man now steps aside once and comes back). That's the chase's, not the walk's.
- **A way that men have shut.** A doorway with a man in it and no room to slide past, a gateway with two kneeling in it, a man standing on the very point a route turns at: he pushes at them as he did, and the walk gives up as it did.
- **A step that leaves nothing clear.** Where neither side leads on to his waypoint, he steps by turns and may walk into what cut him off. A new route from there is the answer to that case alone, and it wasn't met on these camps.
- **A walk taken up again after a pause** is measured against where it had got to before the pause. If he's no nearer when he sets off again, that reads as a stall at once. Seen in the code and on no camp, so left.

**Tests.** `tests/nav.test.ts`, "a mate in the way of a run": pressed, a centimetre now and then doesn't keep a walk going, and after one step for it, it does again; a leg's first measure always counts; the step is what it was at a walk and a hurry and 1.7 m at a run, and he has his 0.9 s again after it; it goes to the side he can walk on from, then the side he can step to; and in a handmade yard a runner wedged between a mate and a wall is round him and at a sprint inside 2 s. The out-the-gate scene now fails if any man on his way to the opening is held up for more than 2 s, DOT-6344 is in its table (on the walk as it was it fails: "guard 4 was held up for 4.7 s"), and `npm run experiment -- out-the-gate` reports the longest such hold.

**Checked.**
- **Every other bench, camp by camp, against `main`** as it stood that evening, with looking out for one's own in it (`docs/walk-benches.md` has every run that reads differently, with the first stall that isn't the same). 1,006 runs: 192 read differently, and every one of them has a walk that stalled. Walks stall 2,974 times where they stalled 6,860, and give up 256 times where they gave up 1,090.

  | Bench | Runs | Read differently | Walks given up | Counts of runs that moved |
  | --- | --- | --- | --- | --- |
  | `ladder` | 64 | 12 | 34 → 4 | Shot dead 20 → 20, detected 17 → 17: one camp each way |
  | `circling` | 96 | 43 | 133 → 86 | Made out at all 80 → 74; shot dead on the walk 87 → 85 |
  | `second-step` | 240 | 5 | 94 → 37 | None |
  | `hunt` | 24 | 8 | 181 → 30 | Found 8 → 9; enough rounds on him to kill 7 → 8; shot dead 0 → 1 |
  | `takedown` | 96 | 8 | 55 → 26 | The target told to come out 12 → 14 |
  | `answer` | 54 | 8 | 33 → 6 | None |
  | `firefight`, 60 camps | 120 | 69 | 380 → 45 | With the firefight on: shot dead 27 → 28, the rest the same |
  | `flaws`, 24 camps | 216 | 20 | 122 → 18 | Pile-ups 4 → 40, on three camps, where the relief meets the target |
  | `out-the-gate` | 48 | 5 | 16 → 0 | A man out within 25 s 18 → 19 |
  | `own-side` | 48 | 14 | 42 → 4 | None. Nobody shot by his own side, as on `main` |

- **What the circling counts are worth: a placebo.** `main` with nothing changed but which side a man steps to first reads 77 made out and 83 shot dead, against `main`'s 80 and 87 and this change's 74 and 85. Those counts move about as far for a change that can't matter. Of the eight runs where the shooter is no longer made out, he is shot dead all the same on six.
- **The pile-ups are the escort's.** They are all where the relief meets the target. On NUB-9046 the relief's two men reach his door together now, where on `main` the second was still stepping round the first, and are still there when the men sent to fetch him arrive. Four men standing at a door, nobody pushing: where the escort stands them is the next thing there.
- **The brain lane's bench moved, and it's the same fault.** Its three overlook camps put a perfect shooter on the best overview. On BNC-0202 the siren goes at 6.7 s, a sentry is told to start the target's vehicle, and he sets off pressed against an officer running for cover. On `main` the officer's step aside, taken by turns, goes across the sentry's way; here it goes to the other side. The sentry is 0.4 m further along when the shooter's next round arrives at 8.3 s, and it passes behind him where on `main` it kills him. The order goes out again half a minute on and the engine starts at 39 s, so the shooter reaches the target first. Here the sentry starts it at 9.5 s and the target is away at 109 s, as he is on the other two camps. Pinned: the target got away on 3 of 3, from 2, and guards down from one perch 24 of 32, from 26. Nothing else in any lane's bench moved.
- `npm run check` passes (99 files, 997 tests), and no fingerprint moved.

**Versions.** `SIM_VERSION` 26 (looking out for one's own landed the same evening and took 25). No pinned run has a walk that stalls, so no fingerprint moved. Two numbers of the brain lane's bench are pinned anew (above). The golden recording is rewritten for the version.

## 2026-11-12 · A man looks out for his own

**Why.** The chase (below) left "a man doesn't see his own side", held off with rules about what a mate had said. Measuring it properly showed it was older and bigger than the chase: with other rolls of the dice than the game's own, a three-minute fight round a gate ended with a man shot dead by his own side in about one fight in ten on `main`, and 15 men were shot in 55 fights on the roll that goes worst. The owner said go on and build it.

**What it was.** A man already held his fire for one of his own, if that man was dead on his line: one ray from his eye to what he was shooting at (`game/combat.ts`, since the firefight). A round goes anywhere inside the error of his aim, which is half a metre at 50 m. Every man shot, in the 29 cases looked at, was between the rifle and its target and about half a metre off the line, beside it or crouched under it.

**Built** (`game/combat.ts`, `ownInTheWay`; `docs/camp-engine.md`, section 9, *Step 2d*). He holds for one of the camp's own anywhere the round could go: within the error of his aim and a margin, out to what he's shooting at, where that man stands or would stand on his feet, if a round could reach the side of him nearest the line. `npm run experiment -- own-side --dice 3`: fights with a man shot by his own side go from 5 of 63 to none by the wall and from 6 of 63 to none against a runner, for ten rounds in sixty-six held by the wall, and a runner is hit as often as he was.

**Decided along the way.**
- **Not a perception system.** The plan was for a man to perceive his mates and his brain to hold his fire. The check that was already there is settled where the round is made, "as his eyes would settle it", and all that was wrong with it was its width. Widening it is one place every round goes through, costs a ray or two a shot, and leaves the brain as it was. A brain that knows where its mates are is worth building when something needs it: moving for a clear line is the first thing that would.
- **By what a round could reach, not by what he can see.** The test is the same ray a bullet is: a man behind a wall isn't in the way, and one behind a bush is.
- **On his feet as well.** The one man still shot with the first version was down behind a crate half a metre off the line, and stood up into the round. He's looked for where he'd stand.
- **Nothing past the target.** None of the men shot was beyond it, and counting them would make an intruder safe between two guards.
- **The chase's stand-ins came out.** "Nothing blind near where a mate went out" and "nothing through that opening for the rest of the fight" kept the camp's rounds off the men it had sent out, and kept them off the intruder too. With this in, taking them out leaves nobody shot by his own side on 60 camps and three rolls, and a runner is hit 14 times where it was 9.
- **A switch, and a fact about the camp.** `off=mates` plays a camp that holds only for a man on the line. No pinned run's camp has `mates`, so no behaviour fingerprint moved.

**What moved.** `SIM_VERSION` 25, with no pinned behaviour changed. `STATE_SCHEMA` 17 (a camp's `mates`, a man's `held`; `mateOut` is gone). A new event, `held`. On the lab benches, against `main` the same evening: the chase's own bench reads the same for who comes out and when, and a runner is hit 20 times where the chase as it landed hit him 14 (13 before the chase); `firefight`, `circling` and `ladder` moved by under a round a run, and `firefight`'s men shot by their own side went from 0.07 a fight to none; `second-step`, `hunt`, `takedown`, `answer` and `flaws` read the same to the digit. The tables are in `docs/camp-engine.md`, section 9, *Step 2d*.

## 2026-11-12 · Out of the gate isn't out of the fight: the chase

**Why.** The owner, from playing: seen by a whole camp, they left by an opening in its wall, turned along the outside and were gone. "It was very, very rare for a guard to even step outside the door to look around or continue a gunfight... the current reaction gives a slight impression of 'he walked out that door, must be gone forever'." What they'd expect is "a guard or two maybe continue pursuit to fire from behind me as I escape, but if I can shoot them down as they expose themselves outside of the camp, then I get more of that sense of security because I took out the ones that did pursue, and the rest are still defending within". And how to go about it: "Don't want our efforts in fixing this more minor problem to cascade into massive errors in judgment across the reactive intelligence you're starting to hone in already."

**Measured first** (`npm run experiment -- out-the-gate`, a new scene and bench, 24 camps). Someone came out after him on 3 camps of 21, a median 66 s behind, and on none inside 25 s.

**Built** (`brain/firefight.ts`, the chase; `brain/walls.ts`; the rules and the numbers are in `docs/camp-engine.md`, section 9, *Step 2c*). A man who knows the intruder was inside the walls and watched him go out of them, or heard it from one who did, goes after him at once, at a run, to a step outside the opening, and looks each way along the wall. Two at a time. They keep to the camp's own ground, and from the moment anyone has gone, everyone else keeps inside the walls and nobody fires blind at the ground by that opening, or through it. A man is out after him inside 25 s on 18 camps of 21 and has him in sight about 16 s after he left; a man who waits by the wall and shoots the two who come out has nobody else come out; running for the trees is as deadly as it was; and nobody is shot by his own side.

**The owner's limit, and what it caught.** "Don't want our efforts in fixing this more minor problem to cascade": so the fix has a switch (`off=chase`), and every other bench was re-run against `main` until it read the same. It didn't, three times, and each was this fix reaching into something else:
- **The camp shot the men it sent out.** The chaser's "Moving!" on the net named where he was going; a tower marksman reads that as a call for fire on the place, and a tower man with no sight of the intruder fires at where he believes him to be. On three camps of 24, four chasers were killed at the gate by their own side, and the first measurements counted such men as the intruder's. A chaser's word isn't a call for fire; nobody fires at ground he can't see into near where a mate went out (`mateGoneOut`); and once men have gone out by an opening, nobody inside fires through it for the rest of that fight (`mateInLine`), because the gateway is where they are, coming, going and settling. A minute's hold wasn't enough, and keeping positions out of the gateway was worse: both are in *Step 2c*. The scene fails if anyone is shot by his own side, and on 60 camps and its three plans (147 runs) nobody is. With other rolls of the dice it's about one run in a hundred, against three in a hundred as the camp was: the camp was doing this on `main` already, and a brain that can't see its own side can only make it rarer.
- **A man walking in at the gate was read as one who had left.** `npm run experiment -- ladder` differed from `main` on one camp of 16: the walker stopped a step outside the gate, was last seen there, and two men went out to look along the wall while he walked to the target. A man now chases only someone he knows was inside (`Firefight.inside`: he saw him there, or a man who did said so), and "going out" is through the opening (`walls.openingThrough`), not at the wall beside it.
- **Any man going after someone outside was counted as a chaser.** The first count took any "Moving!" about a place outside the walls, which a man going after a shooter in the trees says too, and it held a camp to its walls in a fight nobody had left. A chaser's word carries `Report.out`, and `tests/firefight.test.ts` checks that a fight with someone outside all along counts nobody.

**Decided along the way.**
- **It's the firefight's fifth phase, not an engine of its own.** The follow was right for a man gone to ground and wrong for one leaving: it holds the angle, goes by covered ways, and looks the way he was heading. The chase is the same man, the same record and the same switch family, with those three things turned round.
- **A camp's walls are static knowledge** (`brain/walls.ts`, rule 13): a mind may know which side of its perimeter a place is on, as it knows its alarm boxes.
- **Counted by ear, and fire held by ear.** A brain doesn't see its own side, so who has gone out is who he has heard say so, aloud or on the net, and where not to shoot is where a mate said he was going. The first to say it go, and a man who said it third turns back when he hears the two before him.
- **"He's gone out" is kept apart from "he's there".** The net delivers a contact a few seconds after it was true. A stale "he's by the gate, inside" arriving after "he's gone out" would have unsaid it, so the second is its own word (`Report.out`) and its own memory (`Firefight.heardOut`).
- **The man with the box still raises the alarm.** A witness with a box in reach goes for it, and says where the intruder went as he goes. One already on the chase doesn't turn back for a box he passes: the men who heard him are counting on him.
- **Having given him up doesn't stop a man chasing him.** "Lost" means no covered way nearer, and the chase needs none.
- **A look is as long as his eyes need, and he's expecting someone.** 0.9 s each way had a chaser look straight at a man standing still 9 m off and move on. It's 2.6 s, the firefight's look over cover. And out there, looking, a figure within 25 m of the opening is the man he came out for.
- **A chaser who can't get there doesn't pretend he did.** Boxed in by another man, one knelt where he stood and called the gate clear from 45 m inside. He tries another way for 12 s, then leaves it.
- **The scene waits for a man with a rifle to see him.** On two camps the only witness was a worker, who tells nobody where. That's a real gap (what an unarmed man says about what he sees), and it isn't this one.

**What moved.** `SIM_VERSION` 24, with no pinned behaviour changed. `STATE_SCHEMA` 16 (what a man in a firefight remembers of a chase, where a man last heard one of his own go out, a camp's `chases`, a report's `out`).

## 2026-11-12 · A refused move keeps its footing

**What broke.** The tower the ladder's sweep left open (below): `npm run fuzz -- --run tower:SWP-1085-0`, tick 1273, `entity 3 · inside collider 5 by 0.5050 m`, on `main` every time. Entity 3 is a guard on his routine, with no senses and no brain in that scene, so it was the motor alone.

**What happened.** He walks up a slope round the corner of a box (its top at 0.1106 m) that stands under a thin shelf (its underside at 1.677 m). Under the shelf there is room for him on the ground and none on the box. His circle touches the box's corner as he goes, on it or off it by the last bit of a float: 5.6e-17 m on it, that tick. While the box's top is more than a step (0.45 m) over his feet it is a wall, and he slides along it. At tick 1273 the slope has brought his feet within a step of the top, by 1.8 mm, and the box has become something to step onto.
- **The move is refused.** Where he's going his circle is on the box. Standing on the box he wouldn't fit under the shelf, and a ceiling the ground has risen under blocks a move and is never pushed out of sideways. So `resolveMove` leaves him where he began.
- **Settling lifted him anyway.** It looked for the ground where he was as it does anywhere, the highest thing under his circle within a step of his feet. That was the box, by the bit of a float. He rose 0.448 m without moving, and his head ended the tick 0.28 m into the shelf.

The motor's reason for every tick ending clear was that a move which can't end clear leaves the body where it was, "by induction from a clear spawn". That held for a body's place and not for its height. The headroom a step up needs is checked where a move is resolved to: `isClear` counts the ground settling will find there into the body's height. For a move that was refused nothing had checked it. One tick earlier the same spot settled onto the ground only because the box's top was 1.2 mm out of reach.

**Decision.** A refused move keeps the body's footing along with its place (`moveBody`, `body/motor.ts`). Settling looks a step up for the ground only where a move was resolved to. A body whose move was refused finds what it stands on, or what is left under it, and nothing higher: it ends the tick where it began, standing on what it stood on, or falling if it was falling or that has gone from under it. That is the pose the last tick left clear, or one below it, so the induction holds for height as it did for place. It is the same for every body. One lying down was already put back where it began if it ended a tick unclear, though not while sliding or falling; now it isn't lifted there to begin with.

The motor's header says what a refused move keeps, and what that doesn't promise.

**Not done instead.**
- **Checking headroom as it settles, and lifting where there is some.** That lifts a body that hasn't moved onto a box it only touches, whenever there's room over the box, which nothing needs. Over 41 million moves (the 2,000 towers below and the long run) a refused body was offered a lift exactly once, and that once was this.
- **Taking a bit of a float for no contact,** so that only a circle on a ledge by more than a tolerance stands on it. That changes what every step up onto every ledge does, to settle one move in 41 million.

**What it leaves.** A ledge with no room over it to stand in stops a body that walks into it: the move is refused whole, as it is where the ground rises under a ceiling, and the body doesn't slide along the ledge as it does along a wall. That was so before this, on flat ground too (`tests/player.test.ts`, "is never thrown sideways under a low ceiling"). What is new is the body this used to throw into the shelf. It now stops, touching the ledge, and while it touches it a move along the ledge is refused as well, so it has to step away from the ledge to go on. In the handmade test below, 12 of 18 approaches were the broken promise on `main` and the other 6 stopped at the crate; here all 18 stop at it. Tried and not landed here: asking for a refused move again with nothing above the feet to step onto, so that the ledge is a wall for that tick. In the test every approach then slides past the crate, and over 1,000 of the towers it changes 432 of 80,335 refused moves of a standing body and breaks nothing. It changes what a ledge is to a body, which is more than this fix, so it is on the desk as a next step of its own.

**Tests,** each failing on the motor as it was. `tests/player.test.ts`, "a refused move": a body walking up a slope pressed against a crate, under a shelf with room on the ground and none on the crate, from 18 approaches, is never lifted onto it (12 of them touch the crate when its top comes within a step; `main` lifted every one of those into the shelf); a body standing on a low box, a hair into a higher one beside it under a low roof, keeps the box it stands on, its surface and its place when it walks into the higher one, and walks off the other way. A third holds what the rule must not do: a body whose move is refused in the air goes on falling. And the tower is kept with the scene (`TOWER_FINDS`, `seed=SWP-1085-0`), which `tests/ladder.test.ts` plays.

**Checked.**
- **The same 2,000 towers as the ladder's sweep,** four minutes each, 14.4 million ticks, on `main` and here. On `main` two break a promise: SWP-1085-0 this way, and SWP-1424-4 another way (below). Here SWP-1085-0 holds and nothing else changes. Of 600 more fresh ones, one breaks a promise, the other way again.
- **How often it was.** Over those towers and a long run on `main`, 41 million moves, a move was refused about once in 150 and settling lifted a refused body once. So the rule changes one move in 41 million, and that move was the broken promise.
- **The long run,** `npm run fuzz -- --seeds 6 --minutes 10 --synctest`: every promise held over 56 runs (six valleys with both bots, the movement scenes, 30 towers and 10 flights of stairs): 576,000 ticks, five hours and twenty minutes of play, saved, restored and re-stepped every 30 ticks.
- `npm run check` passes (97 files, 964 tests), every lane's bench holds its pinned numbers, and the kept towers play as scenes and re-simulate identically.

**Versions.** `SIM_VERSION` 23. No pinned run has a refused body touching a ledge within a step of its feet, so no fingerprint and no bench number moved. The golden recording is rewritten for the version.

**Found on the way, and still open.** Two of those 2,600 towers break the first promise another way, on `main` from before the ladder's change: `npm run fuzz -- --run tower:SWP-1424-4`, tick 98, the player `inside collider 4 by 0.3486 m`, and `--run tower:RFN-1208-3`, tick 2117, `inside collider 3 by 0.1985 m`. Both are a body on a ladder whose head ends a tick a fraction of a micrometre into the underside of a shelf: 0.96 µm as it reaches for the rungs and the ground under the reach rises 0.68 mm, 0.17 µm as it climbs. A path's pose check lets a head into a slab by up to a micrometre (`poseClear` in `body/mantle.ts`, `c.y0 >= y + height - 1e-6`), and nothing else in the motor does. The watch allows none, and reads it as 0.35 m because it measures how far in a body is across, not up. It isn't only the watch's reading: a body that comes off the ladder in that pose is taken by the walking motor as inside the shelf, and in SWP-1424-4 it is pushed out from under it 0.35 m in one tick. About one tower in 1,300, so the long run will say so now and then until the pose check and the rest of the motor agree. It is on the desk as its own piece of work.

## 2026-11-12 · A ladder is the last thing to move

**What broke.** The long invariant run broke a body's promise on a tower's ladder, the same way every time, on `main` and on every branch: `tower:RES-2063-3`, tick 855, `entity 1 · ladder inside body 3 by 0.1311 m`. Entity 1 is the player, coming down the ladder. Body 3 is a guard walking past its foot, who in that scene has no senses and no brain, so it was the motor alone.

**What happened.** The motor moved bodies in entity order, each against where the others were at that moment, and the player is the first of them. Coming down at 2.2 m/s, the player took a pose with feet 33 mm over the guard's head, which was clear. The guard then took his own step, which was up onto a box at the ladder's foot, 0.22 m, and his head ended the tick 0.19 m into the player's feet. Three things were wrong.
- **A path asked where the others had been.** A body on a mantle or a ladder can't be shoved aside, so it takes a pose only where that pose is clear of every other body. Moved in its turn among the walkers, it was asking about bodies that hadn't moved yet.
- **A walker was resolved against other bodies at the height it began the tick at.** Against colliders the motor already took a body as high as the tick could leave it. Against bodies it didn't, so the guard was never shoved from under the feet he was about to step up into.
- **The watch measured neither.** It judged the player against where the guard had been before the tick and how high he stood after it. The 0.1311 m is that mixture: at the end of the tick the two overlapped by 0.108 m across and 0.19 m deep. And it took any change in a body's place for a move, so a body settling onto its ladder's line by the last bit of a float (2.8e-17 m, the tick after reaching for the rungs) was held to a guard standing against it.

**Decision.**
- **A path is the last thing to move** (`body/system.ts`). Every body that walks or falls moves first, in entity order; then every body on a path of its own, in entity order. The pose a mantle or a ladder takes is then clear of every other body where the tick leaves it. That is exact, it doesn't depend on who has which id, and the watch checks it against where bodies are and never where they were.
- **A body is taken over the band the tick leaves it in** (`resolveMove`). When feet are within a step over its head and over its circle, it asks what ground settling will find where it's going, and if that lifts it into them it is shoved from under them, as it would be from beside them. It asks only then, so nothing else pays for it.
- **The motor's header says what is promised and what isn't.** A path never moves into another body. A body that walks or falls into one on a path is shoved, softly, as it is by anybody: held there by a wall, or fallen onto it, it can end a tick overlapping it, and the path holds still until it is clear. Making that half exact means bodies that stand on each other, which nothing has asked for.

Either change to the motor holds RES-2063-3 on its own. The order is what makes the promise exact; the band is what keeps the guard's head out of the feet at all. With neither, the watch as it now measures reports the overlap that was really there, 0.1078 m.

**Not done instead.** Correcting only the watch, to judge a pose by where each body stood when it was taken, passes this run and leaves the promise depending on entity ids, with the player always the one to go first and a guard's head in the player's feet for a tick. A step of clearance kept over every head would stop a climber half a metre short of anyone below, for no reason a player could see.

**The long run names what it plays.** A failing tower couldn't be played again: `--seed NAME` skipped a valley's towers and stairs. It now plays all of one valley (both bots, its five towers, every flight of its stairs), `--run NAME` plays one run again by the name its line began with (`tower:RES-2063-3`, `stairs:RES-2063 --bot flight2`, `scene:movement-lab --bot chaos`, a valley), and a run that breaks a promise prints that command. The `ladder-tower` scene holds its own run to the motor's promises and is driven by the long run's bot for that tower, so `npm run scene -- ladder-tower --params seed=RES-2063-3` is the same run. Towers that broke a promise are kept in the scene's table (`TOWER_FINDS`) and played with the tests.

**Tests** (`tests/ladder.test.ts`), each failing on the motor or the watch as it was: the player holds still over a guard who walks under the ladder in the same tick, and comes down once he's past, the guard never shoved off his line; a body walking onto a box under feet just over its head steps up beside them, not into them; the watch calls a ladder lowered into a body a broken promise, and one that holds still while overlapped, or settles onto its line by a bit of a float, not; and the kept towers hold.

**Checked,** on 2,000 fresh towers, four minutes each, the same towers on `main` and here (14.4 million ticks a side). On `main` six broke the ladder's promise as the watch then read it, RES-2063-3 aside. Four were a guard rising under the climber in the tick it took its pose: three stepping onto a box, with the climber going up as well as coming down, and one walking up a slope, by a millimetre. One was a guard falling onto the player in the tick it reached for the rungs. One was the float's last bit. Here none of the 2,000 breaks it. Nor does anyone wait longer for it: over 600 of the towers the bot climbed 18.8 km of ladder either way, and got over the top 2,308 times against 2,123 on `main`. Two of the towers are kept with the scene, beside RES-2063-3. The long run itself, `npm run fuzz -- --seeds 6 --minutes 10 --synctest`, held every promise over 58 runs (six valleys with both bots, the movement scenes, 30 towers and 12 flights of stairs): 590,400 ticks, five and a half hours of play, saved, restored and re-stepped every 30 ticks.

**Versions.** `SIM_VERSION` 22. No pinned run has a body under a ladder or a mantle, so no fingerprint and no bench number moved. The golden recording is rewritten for the version.

**Found on the way, and fixed since.** The same 2,000 towers turned up a different broken promise, once, on `main` before this change as well: `npm run fuzz -- --run tower:SWP-1085-0`, tick 1273, a guard `inside collider 5 by 0.5050 m`. He walks up a slope along the side of a box under a low shelf. The box's top comes within a step of his feet, his move onto it is refused because he wouldn't fit under the shelf, and settling lifts him onto it anyway, where he stands: a refused move kept a body's place but not its height. It now keeps both: *A refused move keeps its footing*, above, the same day.
## 2026-11-12 · One thing is a question, and two that agree are an answer

**Why.** The first move (below) left a man making up his mind alone, and news raising every man who heard it. The owner's fair realism has a man who has noticed something "more confused than immediately sprint to cover, depending on how likely I can confirm an attacking gunshot versus a mix of personal confusion and curiosity, as well as the reactions (or lack thereof) of those around me".

**Built** (`perception/awareness.ts`, `agree`; the table and the numbers are in `docs/camp-engine.md`, section 9, *Step 3c*). What a man sees he believes, and so does whoever he tells, if he's sure of it. What he hears leaves him wary at most until something bears it out: another cue of the same shooting by a different way within 4 s (a report, a snap, a strike, a voice, a man down, a flash; a voice has 10 s), or the same sound again inside a minute. One of the two has to be plain. A man says what he says as one who is sure or one who is asking (`Report.sure`, a voice's `word`), and there's a new line for asking: "Was that a shot?".

**Decided along the way.**
- **Agreement needs something plain.** A snap and a thud are two sounds of one round, so letting any two cues agree made every quiet shot a sure one (a careful shot whistled 9 camps of 20, from 1). Two puzzles stop at wary (`agree.cap`).
- **Agreement is weighed, not counted.** Each cue is kept at its own level and the pair counts a fixed step more than the stronger, so three sounds of one shot count as two do. The ladder's older rule, that three weak stimuli inside a grace period make a stronger one, is skipped for cues: it had one shot's sounds read as "Again. Same place."
- **The siren didn't get easier.** "A body come on after a shot" and "fire that goes on" both start from a gun the man heard or saw for himself and was sure of (`plainShot`). Reading them off "sure" alone had a snap and a body count, and the siren on a suppressed first shot went from 13 camps of 23 to 17.
- **Word about a sound is hearsay, and word about a sight is news.** With every report leaving a listener wary, the brain bench's camps re-found a lost intruder on 13 runs of 16, from 15. "Contact!" and "Man down!" from a man who is sure raise a listener as they did. "Shots!" leaves him wary, and the word of a man who is only asking never counts for more (`brain.comms.asking`).
- **A voice has longer than a sound** (`agree.word`, 10 s against 4): a man has to get the words out, and they answer what a listener heard for as long as he's still wary of it. With 4 s for both, a third of a camp still wasn't sure 20 s after a loud shot.
- **Talk is forgotten before what a man sensed himself** (`prunePercepts`). A mind holds eight percepts, oldest dropped first. Every wary man now says "Was that a shot?", and eight voices in two seconds pushed the report out of a tower man's mind, so he stopped answering it: `npm run experiment -- flaws` had a silent tower on 11 camps of 24, from 6. Voices go first now, and there are none. `main` was losing shots to chatter the same way, less often.
- **A camp that hunts makes no errand of a sound off its own ground** (`brain/commander.ts`). With men wary where they had been sure, a late "heard, going to look" could name the shooter's ridge while the camp was only uneasy, and it sent the man there: one stray in the hunt's twelve camps, where the rule since the hunt has been that nobody but a section goes out. Both places an investigation is ordered now keep to the camp's ground when it hunts.
- **A report carries how sure its speaker is, set where it's made.** The brain stamps it from the man's own state. Reading the speaker's state at delivery would have been one line, and would have had a radio call carry what he came to think after he made it.

**What moved.** `SIM_VERSION` 21: the camp-fight and perception-crowd runs. `STATE_SCHEMA` 15 (a man's cues, a voice's word, a report's `sure`). The first move's own numbers barely moved, since it had already graded what each sound tells a man: a first shot's whistle and siren are where they were. Five careful kills bring the siren on 7 camps of 20, from 5. A shooter who fires once from the overview and stays is found on 8 camps of 12, from 5. No tower man goes silent after a loud shot. The brain bench's overlook has 26 guards of 32 down to a perfect shooter on one perch, from 24: a wary man stands a moment longer.

## 2026-11-12 · A first move that isn't the last: what a camp knows, and what it does about it

**Why.** The owner, from playing: a suppressed round at a tower guard from a distance set the siren off at once, and so did everything else a person tries first. "How do I win here without the target escaping the second everyone knows I'm attacking." Measured before anything was changed (`npm run experiment -- second-step`, 24 camps): one suppressed round through the head of a man on a raised post whistled up every camp, had 98% of its men searching in 5 s, and sounded the siren on 9 of 20 a median 3.9 s later, thrown 8 times of 9 by a man who had seen nobody and no body. The target was gone 34 s after the shot. A camp marked ready (the takedown) was a little better and the same in kind. A round into the generator or an alarm box did nothing to it.

While it was being built they gave the standard for it, **fair realism**: "what would someone actually do here, and how would the camp actually react? Then, using your discretion, build that into a good video game version." And a limit on it: no perfect combination of kit, "the suppressor progressively helps at different ranges, as well as the subsonic ammo".

**Built** (the design, the ladder and the numbers are in `docs/camp-engine.md`, section 9, *Step 3b*).

- **One kind of camp.** The takedown's numbers for how a camp reads what it hears are the game's (`perception.awareness.shots`, the whistle), its kit is the game's (the subsonic load), and every live camp protects its target and answers for him by its problem. `ready=` is gone from every scene, `modes` is gone from tuning, and `?scene=takedown` is the live camp under the name its sittings link to. `off=protect` plays a camp that runs him at the siren.
- **A sound tells a man what it sounds like, or nothing.** A crack is a snap unless it's a near miss, and far from the round's path it tells him nothing. So does a strike a long way off: it's heard (the event is there, and a shooter still hears his hit land), and it leaves no percept, no belief and no look.
- **A falling man is seen within the generator's own witness ranges** (80 m looking that way, 30 m to the side: one constant now, `WITNESS`, for `gen.sight.witness` and `perception.sight.fall`), and counts as watched going down only if he was in sight when the round struck. A man lying more than 10 m off is someone to walk over to (a body percept that's `far`), and a body once he's near.
- **Grounds for the siren** (`brain/grounds.ts`): an intruder in sight, one of his own watched going down, a body come on after a shot he took for a shot, or fire that goes on. The worker's run for the box on anything he heard is gone, and any man whose role runs for boxes goes on grounds.
- **The camp counts its dead** (`brain/commander.ts`): two bodies reported, or word on the net from a man who knows and can't reach a box, and it orders the man who can reach a working one soonest (`alarm`, a new order).
- **A round breaks an alarm box** (`game/sabotage.ts`, `ballistics.breaks`: the rounds each thing takes, the generator at none).

**Decided along the way.**
- **The law of sound didn't move.** A body's strike still carries 650 m, so a hit at 300 m is still heard by whoever fired. What changed is what a listener can tell from it. Cutting the radius would have been simpler, and would have cost the shooter the sound of his own hit.
- **Aligning to the generator, not inventing a range.** The simulation saw a falling man as a standing, walking one, out to 150 m. The generator had always built its web of watchers by 80 and 30, with a note that it was "lab D's own, until lab E's brain says how guards take it". This says it: the same.
- **"Watched him go down" is literal.** The first version counted any body seen within a few seconds of the fall. A man who hears the thud turns his head in a fraction of a second, so every kill with anyone in earshot and in line was a watched one, and a careful shot still brought the siren on 7 camps of 21. He has to have had him in sight when the round struck.
- **A man lying at a distance isn't a body yet.** The first version had a guard who looked round and saw him shout "Man down!", get down and whistle. The owner: he "wouldn't immediately assume that somebody was just shot from a hidden sniper or sprint to cover... on a light assumption. Sometimes... I may have to find a body". So he walks over. It took the camp whistling on a careful shot from 6 camps of 20 to 1.
- **One shot is the whistle, and fire that goes on is the siren.** A camp under plain rifle fire should sound its alarm whoever has or hasn't seen a man fall, and one loud shot shouldn't be the whole camp's alarm (the owner's phased response: "never one sound and the whole camp sprinting in"). Once a man has taken one shot for a shot, any further sound of one counts: behind the wall he has got down behind, the next report is faint.
- **The camp goes on a man's word, not on a count of reports.** Counting reports of fire had one loud shot, called in by five men, pass for fire that goes on. A report now says whether the man making it knows the camp is under attack.
- **Two bodies, not one, for the camp's own order.** One could be anything, and a siren on every body found would be the instant failure again by a longer road. Three dead men and no alarm would be a camp behaving like a horror film's.
- **The generator isn't a rifle's to stop.** It was, for an afternoon: one suppressed round from a ridge stopped it on 12 camps of 13 with a line to it, and with it every alarm box and the radio, for the whole mission. That is the perfect opening the owner ruled out the same day. It's one number to turn on (`ballistics.breaks.generator`), and worth turning on when a camp has an answer to losing its power.
- **A vehicle can't be shot dead yet,** for the same kind of reason: it would hand a ridge the way to stop a bolting camp's getaway.

**Found by the tests on the way.** A man who never heard the siren, through enough walls, kept running back to a box that was already thrown: he now knows the alarm is up when he gets to one. The camp could go on ordering a dead man to the siren: one who doesn't answer isn't sent again. And with men leaving cover for boxes, a shot could go unreported long enough for the camp to send a section out under fire: men who are down now call in each new shot.

**Measured after,** the same bench: a suppressed round at a man nobody has had in sight for ten seconds, its path clear of everyone else, whistles up 1 camp of 20, brings the siren on none and loses the target on none. From 80 m it whistles up 9 of 21. With the subsonic load, 3 of 22 from 90 m and 19 of 24 from 40 m. Five careful rounds half a minute apart bring the siren on 5 of 20, with three men down. Fired at whoever is on a watchtower when there's a line, one round brings it on 4 of 13, each time from a man who saw him fall. A round kills an alarm box on 11 of 11.

**What else moved.** The hunt after one loud shot and staying put: found on 5 camps of 12, from 9, since one shot no longer brings the siren and its relief; after four shots, 9 of 12. The brain bench's overlook: 24 guards down of 32, from 18, because its camps ran for cover at any sound of a shot and now stand to where they are, as the takedown's did. A fight's worst tick does more work (11,988 grid cells in the brains, from 7,824) and takes 2.4 ms warm.

**Versions.** `SIM_VERSION` 20: the camp-fight run is a camp under fire, so its fingerprints moved; no other behaviour fingerprint did. `STATE_SCHEMA` 14 (a body percept's `fell` and `far`, a man's `afar`, a brain's `shots`, `knows`, `deadBoxes` and `lookedAt`, a camp's `bodies`, `attack` and `noAnswer`, a report's `attack`, and the rounds a generator or an alarm box has taken).

**Not done.** Nobody has played it. A man makes up his mind alone, where a person looks to those round him. News by voice and radio still raises every man who hears it to searching (the review's two dials). Nothing on the honest screen says who hears a snap, who watches whom, or who raised the siren. A camp finds its dead by radio or by walking past, with no reliefs of posts. A camp has no answer to losing its power.

## 2026-11-11 · The target's answer, by the camp's problem; and engines you can hear

**Why.** The owner's call on `core-challenge` (Nov 10): what the target does under attack should depend on the camp, so that play "can't be reduced to always cutting a radio or disabling a vehicle", with "a clear method to the madness". Every protecting camp gave one answer: he waited for the relief, and its men brought him out. And vehicles made no sound, so nothing said he was about to go.

**Built** (`brain/protect.ts`, `game/protection.ts`, `game/escape.ts`; the design and the numbers are in `docs/camp-engine.md`, section 9, *Step 3a*). A protecting camp takes its answer from the problem it's built round. One he's buried in holds him to the end and posts its relief on his doors. One built to be flushed bolts: at the siren the man on his door starts his vehicle, and when that engine has run a minute he goes in for him. Any other waits for its relief, as before. The method is one sentence: he leaves only by a way the camp has ready. `off=answer` gives every camp the old answer.

**An engine is a sound** (the `engine` event): as a vehicle starts, and every two seconds while it runs, standing or on the move, heard by the law every sound obeys. The page voices each as a stretch that joins the next. So a camp that bolts gives over a minute's warning, and the relief's truck is heard on the road.

**Decided along the way.**
- **A bolt is a drill, not an order.** Each step is something a man does on what he hears: the siren, then the engine. So the radio makes no difference to it, and what you do to it shows: kill the man who started it and the target comes out late, alone; kill the vehicle and he stays.
- **It doesn't hang on one man.** The man on the target's door is the guard a perch sees best, and a shooter who took him first defused the whole getaway without a sound. So if no engine is running 20 s after the siren the nearest man left goes to start it, each counting for himself, the longer the farther off he is. Found by playing the sitting's own link headless before putting it on the desk.
- **A camp that holds never gives him up.** Its problem promises that no perch ever has him, so a patient sniper must still go in. The owner chose "keep him inside" over "leaves only if the camp is losing".
- **A man on the target's door stays on it once the siren has sounded.** He used to walk off to look into things, which left the door open to the first distraction after an alarm. Now he looks into nothing, is ordered nowhere but in for the target, fights from within 8 m of where he stands, and goes after nobody. Before the siren he can still be drawn away.
- **An order doesn't take a man off bringing the target out**, or off his way to hold a door. The relief knows the alarm is up when it arrives: the siren itself is over by then.
- **A run that loses him says what there was to read**, in the outcome's reason: the engine, the relief, or nothing.

**Measured** (`npm run experiment -- answer --camps 40`): under a sniper on the best overview, he left 31 camps of 31 before and 15 now. None of the 16 built to be gone into lose him. The 10 built to be flushed lose him 84 s after the siren, with their engine running for 79 s of that. Where he leaves, something says so from the overview first on 14 camps of 15, for 78 s.

**Versions.** `SIM_VERSION` 19: runs with a vehicle on the move have engine events, and protecting camps answer differently. No pinned run has either, so no behaviour fingerprint moved. `STATE_SCHEMA` 13.

**Not done.** Nobody has played or heard it. A camp that holds still has a vehicle standing at his door, which reads as a getaway. It stays there for now: a camp that isn't ready for trouble still runs him to it at the siren, and its place by his door is what hides that run from a perch. It moves when those camps take an answer of their own. What he does about someone in his room is close protection, next of step 3's means.

## 2026-11-11 · Taller camps: levels, and what a ridge gets of them

**The owner's brief** (the desk's `compound-types` decision, Nov 10): "I think taller buildings help a lot with increasing the offensive challenge. Makes every enemy troop less openly visible from any given perch, and creates a bit more vertical range to assess versus just sweeping the guard towers first, then knowing everyone else is ground level. However, I don't want to have to go clear every corner of every building to claim success." This is the second step of compound types: `docs/compound-types.md` has the design (section 5), what building it changed (5a) and where it stands. `GEN_VERSION` 9.

**The engine: levels.** A storey is a small layer of the spatial grid over a building's footprint, joined to the ground by a stair, and `GridSearch` runs over the ground and its storeys as one index space (`kernel/world/grid.ts`, `search.ts`). With no storeys it is the search it was, bit for bit. Everything that walks or listens crosses a flight like any other move: routes (`brain/nav.ts`: an end with a height, pulled taut within a level and never across a flight), hearing (`perception/hearing.ts`: the flood goes up the stairwell, and a floor on the straight line costs `floorLossDb`), the analysis raster (a second slab a cell, and cells of its own for an upper floor and a flight) and the certified way in. An order and a search carry the floor they're for, so a guard who hears something upstairs goes up, a target who keeps upstairs shelters there, and the men sent for him climb. No routine climbs: upstairs men hold posts.

**Upper floors alone didn't do what was asked.** With the target's building and the barracks at two storeys, the best overview showed 5.1 men against 5.4 on one storey. Taken apart by role on twelve camps, two thirds of what a ridge had were men standing still in the open: sentries (in view 82% of their time) and marksmen on towers (all of it). A wall 3.2 m high hides 15 m of ground behind it from a perch looking down at 6°, and a building 6 m high hides 40 m: a tenth of a camp.

**So where men stand changed, as each kind of place's own data** (`maxCoverage`, `easeTo`, `posts` in a type's record; the yard keeps the old values and generates what it always did):
- *How much of its men's time one perch may have.* Validation's cap is the type's: 55% for the four taller kinds, 60% for the yard. Staffing eases to 22%: a post a perch has too much of is moved out of its sight, as it always was, but much further.
- *Posts under cover.* A post so moved goes behind something out of doors, never into a room; to ground that hides him to over his head (his chest behind a crate still left a ridge his head); from which he still sees the place he was posted to, and he's turned to watch it. A man holding a door stays at it. And a post goes back if, once walkers have been shifted and posts turned, a perch's men are still unwatched and putting him back mends it.
- *Marksmen at the upper windows before the towers,* each at the window of his building the fewest perches have a line to, looking out of it.

**Measured, against `main`** (`npm run experiment -- circling`, 24 camps, the same seeds in every arm and on both builds; ± is the 95% interval over camps). The yard, the bench's baseline, gives the same numbers on both to the last digit.

| Men in view from the best overview | `main` | Taller |
| --- | --- | --- |
| Walled compound | 5.1 ±0.31 | 4.0 ±0.37 |
| Keep | 5.2 ±0.28 | 3.7 ±0.31 |
| Depot | 5.5 ±0.42 | 3.5 ±0.54 |
| Farm | 6.2 ±0.48 | 5.1 ±0.51 |
| As built, each seed its own kind | 5.4 ±0.35 | **3.9 ±0.38** |

And the same camps both ways in one build (`npm run experiment -- taller`): `one storey` is a tuning (`oneStorey`, `lab/experiments/circling.ts`: every storey 1, the towers and heights the types had, the yard's coverage numbers) that generates what `main` generated, and `tests/storeys.test.ts` holds it to four of `main`'s fingerprints. *Clear* is a difference, seed by seed, beyond the camps' own spread.

| | One storey | As built | Seed by seed |
| --- | --- | --- | --- |
| Men in view from the best overview | 5.4 ±0.35 | 3.9 ±0.38 | 1.5 fewer, clear |
| Of them, on the ground | 3.8 ±0.43 | 2.9 ±0.33 | 0.95 fewer, clear |
| Men in view from the firing point that shows most | 6.1 ±0.36 | 4.7 ±0.35 | 1.4 fewer, clear |
| Firing points to see everyone a perch can | 1.8 ±0.26 | 2.3 ±0.34 | 0.5 more, clear |
| Men down in a lap of the outside | 4.8 ±0.53 | 4.5 ±0.71 | |
| Of them, from the walk | 2.5 ±0.49 | 2.4 ±0.69 | |
| Men in view at a stop on the walk | 1.2 ±0.09 | 0.77 ±0.14 | 0.41 fewer, clear |
| The shooter shot dead on the walk | 19 of 24 | 19 of 24 | |

A farm gains least: one tall building, the house, in open fields, and a lap of its outside hands over what it did (6.1 men against 5.8, where the other three kinds hand over 0.2 to 0.7 fewer).

**The owner's limit, made a measure** (`npm run experiment -- corners`, `lab/experiments/corners.ts`). A man is *read from outside* if a firing point, the ground beyond the wire or open ground inside it has a line to his head or chest. On one storey half a man a camp was not, for 2.9% of the camp's guard time: the officer a pace inside the target's door, behind the door's screen. As built: nobody but the target, in any building; no post upstairs but at a window; the way in, on the 12 camps of 24 built round one, through his building and no other; and his floor all in view from the head of his stairs, with him in it, on 20 of 20.

**What the lines through a window found.** The analysis reads a perch's view of a man through its raster, which makes a row of metre cells of a 0.2 m wall. A line through a 1.2 m window at a slant is stopped there and not in the world. With windows all round his floor, a firing point really had a line to a target the analysis called buried on 8 camps of 20, and the ground beyond the wire on 11 more. Two changes: on a camp with upper floors a man on a deck or an upper floor is seen through the colliders themselves, by a line to his head, his chest or his belt (`perchSeesMan`); and the floor a buried target keeps on has no windows at all. One window, for a marksman, with the target kept out of its line, still gave the ground beyond the wire a line on 2 of 8. He is now read from nowhere outside his building on 20 of 20, as on one storey.

**What the first run of the tests found** (the branch had never run them):
- A route across a flight kept only the end it left from. The far end was pulled taut from the near one, which is clear on the new level, so a man upstairs walked to the head of the stairs and then at a door he couldn't reach: a target who kept upstairs never got to his vehicle. The far end is a waypoint of its own, and both are the flight's own ends on its middle line, not the cells nearest them.
- The raster's upper floor was joined by straight lines between raster cells' middles, which on a camp turned off the world's axes left the stair's head in a pocket: no way in, twelve re-analyses, and the camp built again. Three of twelve camps took 30 to 70 s to generate. It is made from the storey layer's own cells and walk edges now, and the slowest of those twelve takes 3.8 s.
- A third overhead piece in a cell merged with the upper slab, so an alarm box on a wall under a floor closed the floor above it. It joins whichever it is nearer.
- A buried target's door screens were built to his building's height and ran through his upper floor. Where he keeps upstairs there are none.
- The spot upstairs that no perch could see was against a wall, inside the wall's row of raster cells, where nothing can see anything. He stands out on the floor.
- A raster built without the grid's levels takes a floor and its roof for one slab. Four callers did (the bench, the overlook scene, `npm run plans` and a test); the argument is required now.

**What `npm run hitches` found: a route with an end upstairs is found in legs.** The standing fights' camps have upper floors now, and three of the four had ticks over 4 ms where `main` has none: the worst 9.9 ms, twice in two ticks. They were routes to the target's floor, asked for by the men sent to his door. One search over the ground and the floors together aims straight at an end that has walls and a floor between, and the landmarks' tables don't cover it: 15,000 cells a route on LEB-2534, and from the relief's 130 m it spent its whole 40,000 and found nothing, so nobody came for him for another fifty seconds. A floor is joined to the ground by its flight and nothing else, so such a route is now a search of the one storey between the end and its flight's foot, and the ground between as any route on the ground (`findLevels`, `flightLeg`). The same routes cost 300 to 1,300 cells and are all found; `tests/storeys.test.ts` holds a route from anywhere in that camp to its legs' cost. Two smaller things with it: pulling a route taut on a floor asked every shape in the building below about every sample, a hundred and more, and now sorts out the few at the floor's height once (2.3 ms of a tick became 0.3); and the game's rehearsal at load asks for each floor's far end from every post, there and back, so the first such route in a fight isn't the first time its code runs (its tick took 5.6 ms the first time, and 2 after). `npm run hitches` now also lists the ticks that are slow in the first run only, with the system that took the time.

**Ticks** (`npm run hitches`, this machine, the four standing fights, 16 minutes of fighting on each build):

| | `main` | Taller |
| --- | --- | --- |
| Ticks over 4 ms, a fresh tab's run | 1 | 0 |
| Its slowest tick | 4.2 ms | 3.6 ms |
| Ticks over 4 ms once warm | 0 | 0 |
| The slowest tick once warm | 2.6 ms | 1.9 ms |
| The most cells the brains expand in a tick | 6,968 | 7,007 |
| The most cells awareness floods in a tick | 40,071 | 25,758 |
| The most cells hearing floods in a tick | 10,952 | 13,313 |

Four more fights on the camps of the owner's sitting have none over 4 ms either, first run or warm (the slowest 3.5 ms).

**Generation health.** 95 of 100 valid at the first attempt on a new held-out series, 5 repaired, none invalid (`npm run seeds -- --count 100 --from compound-storeys-exit-3`). `main` on the same series: 92, 8 repaired. Rules broken at the first attempt: perch witnessed 4, and the crux, the way in and the two ways out one each (`main`: perch witnessed 6, clusters 2). A camp takes 3.3 s to generate on average on both, and 6.5 s at the 95th percentile against 5.5 s.

**The motor on stairs.** `npm run fuzz` plays every flight of each valley's camp with a bot of its own (`bots/stairBot.ts`), as it plays each tower's ladder: a valley's bots seldom go indoors and never upstairs. `npm run fuzz -- --seeds 8 --minutes 10`: every promise held over 741,600 ticks, 13 flights among its 73 runs, each climbed 3 to 14 times in its four minutes, and a body's rise on a flight never passes one tread, 250 mm a tick. Again with `--synctest`, on eight other valleys and their 13 flights: 24,720 restores and 1,483,200 ticks stepped again, none different.

**Versions and pins.** `GEN_VERSION` 9. No `SIM_VERSION` bump: every pinned run that doesn't stand on a generated camp kept both its values, so the simulation behaves as it did on a world without levels, and the runs that moved did so because their camps are different camps. No `STATE_SCHEMA` bump: an order's floor is a field that is absent where there's none. TAL-4471's fingerprint is `d65c15c8a7a25bb6`; the golden recording and the benches are rewritten. The benches are pinned on the taller camps: a fight's worst tick floods 19,332 grid cells of sound where it flooded 16,238 and casts 454 rays from the brains where it cast 297 (LEB-2534 is a different camp now), and the brain lane's bench now pins the routes to a camp's upper floors and back (32 of 32 found, 287 cells on average, 683 at most, against 459 and 2,716 between posts on the ground).

**Not done, on purpose.** A search the commander orders doesn't climb (only a man who sensed something upstairs, or is sent for the target, goes up). Nothing tells a player which building is the target's except that it stands tall and blank on a camp that buries him: a flag on it is the owner's call. Patrols and workers are as visible from a ridge as they were. A floor has one flight: a route's legs take that for granted, and a second flight to a floor would want the shorter of the two ways.

## 2026-11-11 · The hunt: a section goes out after a shooter the camp has placed

**Why.** Step 2 of the camp work existed because nothing the camp did after the first shot reached the shooter (`docs/camp-engine.md`, section 9). The firefight answered someone close. This answers someone on a ridge, or in the field past the wire: the owner's "taking out each new enemy as they came into view, never really being seen".

**Built** (`brain/approach.ts`, `brain/hunt.ts`, `brain/commander.ts`; the design, the drill and the numbers are in `docs/camp-engine.md`, section 9, *Step 2b*). A camp that hunts places a shooter from what its men heard, sends two men out by the way that keeps most out of his view, and they watch his firing point from short of it before one goes on to walk round it.

**Decisions inside it.**
- **They stop short and watch.** Measured: no way to a firing point stays out of its view, at any price. Every one has 145 m or more in view, most of it the last stretch. So the drill isn't a run at the place.
- **Men say where the shot came from, once they're down.** Without that the camp had one bearing at most, often a wrong one, and the hunt would have had nothing to act on. It is a change to every camp that fights and hunts: more is said on the net in the first ten seconds.
- **A fix has to be good enough.** One good bearing against the range card is; a bullet's crack isn't (`hunt.sure`, 80 m).
- **Nobody is sent while he's still firing** (`hunt.quiet`, 18 s), and the camp's marksmen cover a section across open ground (`hunt.fix`, 12 s).
- **A camp that hunts sends no lone searchers** while it has someone placed outside, and a man doesn't walk off its ground alone. That takes away the men the owner picked off one by one.
- **A section is a drill, not a puppet.** Each man works the way out for himself from the order, and knows of the other half only what he hears it say. So there is no section entity and no section mind: the layer the foundation review asked for is, for now, an order and a shared drill. If a second kind of section needs more, that is when to build it.
- **The camp names its dead.** A body on a man's beat, and he's gone quiet: it's him. Nothing set a man down as dead before, so a section could be given a dead man.
- **The valley is read off a raster, not with rays.** 93% agreement with real lines of sight, under a millisecond a way. A man's own eyes settle where he stops.
- **Ways keep to ground a man can climb.** The map's walk edges don't know how much the ground rises between two cells, and a man sent up a 33° face stalled at the foot of it. The lattice has its own test (25°, or 34° where there's no other way). The map's edges themselves are unchanged: that is a generation change for another day, and it is the reason a hunter can still stall between two stops.

**Measured** (`npm run experiment -- hunt`, 12 camps): a shooter who fires once and stays is placed on 12, sent after on 11, found on 9 after a median 210 s, with enough rounds on him to kill on 6. If he moves 90 m he's found on 3. Before, none of it happened on any camp. Against a marksman who shoots everything he sees the camp loses 2.1 section men and never hurts him: that needs step 3's means.

**Not settled, so not pinned.** The seconds and the numbers are a person's to set. `tests/hunt.test.ts` holds what's settled: a section is sent, of men the camp believes are on their feet; nobody else goes; it says what it's doing, watches before closing in, and finds him or calls the place; nobody is sent while he's firing or without the radio; a man alone comes home; a camp without it does none of this; and the same hunt ends the same way twice. `tests/approach.test.ts` holds the reading of the valley.

**Ticks** (`npm run hitches`, and `-- hunt`): none over 4 ms on the four standing fights or the hunt's scene, in a fresh tab's run (3.6 ms at worst) or warm (2.7 ms). Two things had to be rehearsed at load to get there, about 0.4 s more loading a camp: a hunt itself (`rehearseHunt`), since the tick a section is first formed took 5.1 ms; and routes out to the ridges (`rehearseRidges`), which lone guards used to find during the rehearsal and no longer do. `docs/performance.md`, section 8, has how the second was found, and the two options `npm run hitches` gained for it.

**Versions.** `SIM_VERSION` 18: the pinned camp fight behaves differently, because its camp now hunts. No other pinned run's behaviour moved. `STATE_SCHEMA` 12: a camp keeps who it's hunting, its sections and what they've crossed off, and a man on the hunt keeps his way out. The brain lane's bench is re-pinned: the fight's worst tick expands 7,824 cells where it expanded 6,503.

## 2026-11-11 · Where the firefight meets the taller camps

Merging the two brought up one thing neither had alone: an intruder who is up on something. The firefight took his eyes to be 1.3 m above the ground at his place. With someone at an upper window or on a deck that's a line into the wall beneath him, so every place tested as hidden, and a man could kneel in the open under a window believing he was out of sight. A position, a covered way and a man's own exposure are now judged from where the intruder is believed to be when that's more than 2.4 m above the ground (`positions.ts`, `eyesAt`; `firefight.spot.raised`). On the ground nothing changed, to the bit: no pinned value moved, and `tests/firefight.test.ts` holds the new case on a camp's raised posts, where one position in eight chosen the old way was in view. `walk()` takes a goal's height and then a route's price. Positions are still found on the ground only: nobody takes one indoors or upstairs, which belongs with how a camp answers someone inside a building.

## 2026-11-11 · The firefight: cover, find, fight, follow

**Why.** The owner walked into a camp and out again: "when enemy defender saw me, it was easy to run away behind cover when they stopped and they wouldn't even attempt to follow", and circling one, "I'm not targeted or under pressure even at close quarters". And what they asked for instead: phases ("I need to find cover then identify the threat" versus "threat identified, combat engaged"), trained men, and never the whole camp converging "into one location as a ring". A man who lost sight of an intruder went to the nearest thing that hid him for the length of a stand-to, and one who could see him stood in the open to shoot.

**Built** (`brain/firefight.ts`, `brain/positions.ts`; `docs/camp-engine.md`, section 9, has the design and the numbers). A man who knows where someone close is fights from a position: somewhere that hides him kneeling, with a place to look and fire from. He comes up to look, fires a few rounds at a man in sight, and goes down again; rounds striking close keep him down. When he's had no view of his own for long enough, one man says he's moving and goes after the intruder a bound at a time.

**Four decisions inside it.**
- **He fires back at a flash.** A place he's sure of by his own senses is shot at for a few seconds with nobody in his sights. It's what makes a shot cost the shooter something, and it needs no change to what a man knows.
- **A figure where he expects one is the man.** Sight's law takes about 5 s to be sure of someone at 70 m. It was made for a man who isn't expecting anyone, and it stays as it is: the pre-screened trial sets rest on it. What changed is the brain: with fresh news of an intruder at a place, a glimpse there is enough to shoot at.
- **Covered ways, or he doesn't go.** Ground in the intruder's view is judged without rays, from the grid's own record of what stands in each cell (`positions.ts`, `Danger`), priced in his route, and never crossed more than a dash at a time. With no such way he holds. So nobody follows across an open field: that's a section's job, and step 2b.
- **Nobody fires with one of his own in front of his muzzle.** Firing back at a place put a man in front of his own side's rounds twice in sixteen camps. A brain can't know where its own side is (rule 13), and a man can see who's in front of his rifle, so the check is where the round is made (`game/combat.ts`, `guardFire`), below the brain, as stepping out of a vehicle's way is. It applies to every round a guard fires.
- **A shout of its own.** "Moving!" is a new kind of report (`moving`), said aloud. Whoever hears it leaves the going to him and keeps watching the place, and a player in earshot knows someone is coming.

**Not done here, on purpose.** Covering fire on the place while someone moves: a mind doesn't know where its own side is, so it would shoot the man it's covering. Pairs. Tower men, who still stand upright on an open deck.

**Measured.** `npm run experiment -- firefight`, 16 of the takedown's camps: circling ends with the shooter dead on 15, from 10, and he gets all the way round on 1, from 6. Nobody is shot by his own side. `npm run scene -- firefight`: someone who's seen and goes to ground is followed and found; with `off=firefight` nobody goes.

**Not settled, so not pinned.** The numbers are a person's to set by playing. `tests/firefight.test.ts` holds what's settled: a position hides a man and has the line it says it has, nobody fires at nothing, a pinned man stays down, one or two go and the camp keeps its ground, the same fight ends the same way twice, and a camp without it does none of this.

**Versions.** `SIM_VERSION` 17. No pinned run has anyone that close, so no `behaviour` value moved. `STATE_SCHEMA` 11: a camp says whether it's drilled for this, and a man in a firefight keeps what he knows of it, so every pinned `state` value moved with the schema.

## 2026-11-10 · The page has an instrument of its own

**Why.** The scope's overlay was a full-window canvas cleared and redrawn every frame though nothing on it had changed. No test and no profile of the simulation could see it; the owner felt it.

**Built.** `npm run frames` (`headless/frames.ts`): the game in Chromium on the machine's own GPU, and for each way of looking, what the page wrote every frame (DOM changes by element, 2D canvas calls by canvas, how often a canvas was cleared whole), the slowest frame after each change of view, the frames after "begin", and a frame's time with the frame-rate limit off.

**What it found, after the overlay's fix and the fight's:** nothing else of that kind. The whole list, with each item's cost and why it's left, is `docs/performance.md`, section 6: the largest are building the valley on the page's thread (3 to 10 s at load) and sound being made at the click on "begin" (one frame of 150 to 180 ms).

## 2026-11-10 · A fight's slow ticks: landmarks for routes, and nothing made in play

**Why.** The owner's first go at the takedown: "it freezes and jumps a few frames", "sometimes the whole experience gets laggy". A tick takes a tenth of a millisecond on average and has 33, so the average said nothing. The one tick in a thousand did: under a sniper on LEB-2534, 22 ticks in four minutes took over 4 ms, and 4 took over 33 ms, the worst 59 ms. `docs/performance.md` has the whole account and the numbers; this is what was decided.

**What the slow ticks were.** Route searches inside the camp. A guard three metres from where he's going with a wall between: A* aiming straight at him looks at every cell nearer than the gate first. One such search spent its 40,000 cells, fell back on the coarse layer, and searched the fine layer twice more: 124,000 cells in a tick. Across 16 camps, 27% of routes a fight asks for cost more than a whole tick's share of cells.

**Changed, and it changes what the game does** (`SIM_VERSION` 16; no pinned run moved):
- **Routes inside a camp aim by landmarks** (`kernel/world/search.ts`, `landmarkTables`; ALT, Goldberg and Harrelson 2005): 16 cells spread across the camp, each with a table of every cell's distance from it, made once when the camp's routes are prepared. A search's estimate is the better of the straight line and what the tables say. Paths cost the same; of equally short ones a different one may be taken; a route that used to run out of budget is now found. `brain.nav.landmarks`, 0 for the old estimate. Only a fine layer the size of a camp's gets them (`brain.nav.landmarkCells`): a hand-built scene's covers its whole map, 2.3 million cells, where the tables took 2.7 s to make and 148 MB to hold, and those scenes route as they did.
- **A place that can't be reached is known at once** (`components`): ground is labelled by what can be walked to from what, so a search for somewhere on other ground returns "no route" with no cells looked at, where it used to look at everything first and then guess from the coarse layer.
- **A tick's looks for dead ground share a budget of rays** (`brain.fight.drill.raysPerTick`, 300): once the tick's looks have cast that many, the rest wait for the next tick, as route searches already did. Their rays are now counted in the work.

**Changed, with nothing moving** (30 four-minute fights give the same state hash and event count as before, with the two switches above off):
- **The grid search does exactly what it did, about three times faster**: typed arrays, no closure or array made per cell, a cell's open moves read once as eight bits. The search it replaced is kept beside the tests (`tests/reference/gridSearchReference.ts`) and the new one is held to it cell for cell.
- **A listener's masked threshold** is worked out once for where he stands, and not at all where nothing steady could mask anything: no route makes a source louder than its straight line through open air, so where even that stays under the threshold of hearing the answer is 1, with no rays. A camp's river is 60 steady sources; every sound used to cast a ray at each for each listener.
- **The belief map** asks which of its cells a body can stand in once for a world, not sixteen times a cell at every spread. It was 17% of the simulation's time.
- **The escape vehicle's way across the yard** is found once for a camp, at setup, not in the tick the target gets in.
- **A rifle's zero** is kept once solved: the scope asked for it every frame, sixty flights each time.

**Nothing made in play** (the renderer and the app; no simulation state):
- **A strike's dust is drawn from a fixed set of puffs.** Each used to be a new material, thrown away when it faded, and a thrown-away material takes its shader program with it when it was the last to use one: the next strike then waits for the program to be built again.
- **Everything the scene can need is made ready while the valley loads**: every shader program, hidden things included, and every mesh's vertices, by drawing the whole world once from overhead into one pixel.
- **The camp's fight is rehearsed once at load** (`game/rehearsal.ts`): a throwaway run on the same world, 50 s of a sniper on the best overview with the relief brought in early, so the later stages are rehearsed too. The first shot of the real run then costs what the tenth does: 3 ms where it was 22. It adds about 0.3 s to loading.
- **The GPU is asked its name once.** A play session is saved every minute with it, and the answer waits on the GPU's own process.

**Tools.** `npm run hitches` times scenes' ticks in a process of their own, built as the game's code is built, and names the slow ones with the work they did. `npm run experiment -- route-cost` is what each number of landmarks buys. The brain lane's bench pins a fight's worst tick as work (grid cells, rays), which is the same on every machine. A play session's telemetry now keeps its slowest frames and whose work each was.

## 2026-11-10 · The honest view's corner: what you carry, and the picture you were given

**Why.** The owner, after playing: he couldn't tell whether the suppressor was on without scoping in, which stance he was in without toggling it, which load he had without changing it, or how many rounds were left. And a camp with fair defenses owes the attacker what he'd have had from scouting imagery, without the gear that hands either side too much (heartbeat sensors, UAVs). The design doc's *UI and HUD* says ammo only when you reload, and a tactical map of only what you've observed; this is his later word on the first, and the observed map is still to come.

**Built.** One column in the bottom-right corner, over the snapshot and the world, and never touching the simulation.
- **The card** (`app/kit.ts`): a figure for the stance, the word for it, the rounds, the zero, the load, and the suppressor on, off, fitting or removing. The fields keep their places. While a job is on, a line runs out under the row it's about, and no shot leaves until it has.
- **The map** (`app/minimap.ts`): north up, the whole play area, your position and heading on it. Key 1 (actions.ts) enlarges it, hides it, brings it back; every letter was taken.

**What a photograph can know.** The map is made from the world as generated and nothing else: the ground's relief and contours, the camp's fence and walls, roofs as plain outlines, the road, the creek, the woods. No guard, no target, no vehicle, nothing live. It can't see under a roof, so no doors and no rooms, and nothing tells one building from another: the door screens inside a target's building are `block`s like a perimeter wall, so a wall under a roof is left off (`satelliteOf`, held by `tests/hud.test.ts`, which also scans the file for anything live). Towers, containers, sandbags and vehicles are left off too, to keep to what was asked for; adding the towers is one line, and whether to is the owner's call.

**It costs almost nothing.** The picture is painted once per world and per size, the first time it's wanted (12 ms small, 23 ms enlarged, at twice the pixels, in Chromium). Each frame moves one small marker with a CSS transform, and writes that only when it has moved by a quarter of a pixel or turned by a degree. `tests/browser/hud.test.ts` holds it to that: 400 updates, no drawing.

**It stays out of the way.** The card and the map are the player's, so they sit out replays, a sitting (A12: blind means no change on screen, and the key does nothing), the benchmark, the fly camera and the compound simulator, which has no player. With an optic up the map fades, since in a small window the corner is inside the glass, and the card goes to the scope's own colours. It stands on the key legend in the debug view, and the right-hand dock stops above it.

## 2026-11-09 · The takedown: a camp that protects its target, as a mode

**Why.** A camp had one answer to everything: at the siren the target ran for his vehicle, and a median 27 s after the first loud moment the mission was lost, whatever anyone did next. The owner's first fight said the same from the other side: only two plans are worth trying, and both skip the camp. No number fixes that, because the shape is wrong (`docs/foundation-review.md`, section 3).

**Built** (`brain/protect.ts`, `game/protection.ts`, `game/scenes/takedown.ts`). A camp with `protects` set answers in stages, each of which someone can see or hear, and each carried by something in the world:
- **Stand-to.** The whistle. Men with nothing of their own to go on get down where they are and watch; the target goes to his hard room (the first roofed place his day already takes him). With no more trouble it ends.
- **Lockdown.** The siren. He stays in his room. The radio, if it works, calls the relief.
- **Fetch.** The relief gets down at the gate, and two of them go to his door and tell him aloud that it's time (a new report kind, `escort`, heard like any other speech). More are sent after 45 s if his vehicle hasn't moved, three times in all.
- **Extraction.** Released, he runs for his vehicle, and they see him to it.

Take a link away and the next stage doesn't happen. No radio: no relief, and nobody at his door. Nobody at his door: he doesn't know it's time, and waits 240 s before his nerve goes and he runs alone. A vehicle that won't start: he gets to it, is stranded, and goes back to his room. No vehicle at all: nobody is sent, and he stays. Nothing here knows more than a mind holds (rule 13): the target acts on the whistle and siren he heard and on what was said at his door.

**A mode, and nothing else moves.** `?scene=takedown` is the live camp with `ready=alert` and numbers of its own. A scene can now carry those (`Scene.tune`, `kernel/scene.ts`): a patch over the game's tuning that only sets values, so applying it twice changes nothing, and a recording embeds the result. The takedown's are in tuning with every other number (`modes.takedown`): each sound of a shot counts for what it tells a listener by how clearly it reached him, the whistle raises a man to curious and brings on the stand-to where it handed him the alarm of someone who heard the shot, and the kit carries the subsonic load. A live camp and the valley are as they were: every pinned run's `behaviour` fingerprint is the same.

**Measured** (`npm run experiment -- takedown`, 24 camps, a scripted sniper on the best overview firing every 8 s; the siren sounded on 21, and nobody shot the target):

| | Siren after | Relief at the gate | Told to come | Left his room | Gone |
| --- | --- | --- | --- | --- | --- |
| Relaxed: he runs at the siren | 5.8 s | – | – | 6.0 s | 21 of 21, at 27 s |
| Alert: he shelters, and is sent for | 6.6 s | 97 s | 18 of 21 | 126 s | 21 of 21, at 156 s |
| Alert, no radio | 6.6 s | never | 0 of 21 | 247 s | 21 of 21, at 267 s |
| Alert, no vehicle | 6.6 s | 97 s | 0 of 21 | never | 0 of 21 |

Times are medians from the sniper's first shot. On most camps the target is already under his roof when it starts. On the 3 camps of 21 where he wasn't told, the sniper's first round had taken the radio operator: nobody could call the relief, and he ran alone when his nerve went.

**Not settled, so not pinned.** The seconds are to be found by a person playing. `tests/takedown.test.ts` holds the order of the stages and what each link does, not when (the owner's rule: test what's settled, measure what's still moving). The lab panel has a `protection` line that says where the camp has got to.

**Versions.** `SIM_VERSION` 15, for the two things below that change a camp outside the mode. `STATE_SCHEMA` 10: a vehicle on its way out keeps who is in its cab. Every pinned `state` value moved with the schema, and no `behaviour` value.

## 2026-11-09 · A vehicle that's held up doesn't wait for ever

**Why.** The target was removed from the world when he got into his vehicle, and the vehicle waited for as long as anything stood in its way. A guard in the yard, or you in the road, left a mission that could neither be won nor lost: the target nowhere, the vehicle not moving. An early eight-camp run of the takedown met it.

**Changed** (`game/escape.ts`, in every camp).
- **The camp's own men step out of its way.** Whoever is in front of it is moved off its line, to the side he's already on, below his brain as a shove would move him (`guard.aside`, carried out with his orders).
- **Anyone else who holds it up for 12 s ends the escape.** The man in the cab gets out on the nearest free ground beside it, as the guard he was and knowing about the siren; the objective is open again; the vehicle stays where it stopped and the camp has no other. The vehicle keeps who is in its cab (`vehicle.rider`) so that he can.

`tests/equipment.test.ts`'s truck is now held up by the player, since a guard would step aside. Running a person down is Phase 3's, with shooting the driver.

## 2026-11-09 · The rifle's kit says which loads it carries

**Why.** The quiet tool the design doc names, the subsonic load, existed as data and could only be chosen before a run. The takedown needs it in the hand.

**Changed.** `ballistics.rifle.carries` says which loads are in the kit, and a `load` command (Y) changes to the next one, taking `loadTime` (2.5 s) with no shooting meanwhile, as the suppressor does. The game's kit carries the match load alone, so there the key does nothing and isn't offered: bringing the subsonic load forward from Phase 3 is the owner's call, and only the takedown's kit has it. The scope's readout names a load that isn't the match one, and a line says which went in.

## 2026-11-09 · The first act out of the one file

**Why.** `brain/brain.ts` held every act, its memory and its priorities in one place (the review, section 5). The takedown's acts were the first new ones since that was written down, so they went in the way the rebuild lays out, as a proof of the pattern.

**Changed.** What every act uses to move a man (`walk`, `stand`, `lookAround`, `writeOrder` and the rest) is `brain/moves.ts`. Sheltering, standing to and fetching are `brain/protect.ts`: what they remember, when they're on offer, and how they're carried out. `brain.ts` asks the module what it offers and hands it the act. Nothing a player could see changed with the move: the pinned runs say so. The other fourteen acts are still where they were.

## 2026-11-09 · A mind is handed its camp's ground, and no more of the world

**Why.** Rule 13 says a brain decides from its mind alone. The mind held the whole static world, which is more than a defender knows: it carries where the player came into the valley, the mission it was built for, and everything the generator worked out about how the camp can be taken (its certified ways in, who it found unwatched). No brain read any of that. Nothing stopped one, and the test that catches omniscience moves the player, not the world, so it wouldn't have caught it.

**Changed, by type alone.** A mind's world is a `Ground` (`brain/mind.ts`): the terrain, what's solid, the grid, the camp's layout and posts, and the range card as places only. A world is one of these, so nothing is copied and nothing runs differently. The brain lane names no wider type, and `tests/architecture.test.ts` holds it to that.

## 2026-11-09 · An experiment builds each camp once

**Why.** An experiment runs the same camps several ways, and every run built its camp again: seconds of generation for a fraction of a second of play. `quiet-kill` has ten arms, so it built each camp ten times.

**Changed.** The runner hands a process all of one camp's runs together, and an experiment may keep the world it last built for its next run (`src/lab/worlds.ts`, one world a process). A world is only read once it's built, and depends on nothing but its mission and the generation half of the tuning, so arms and rolls of the dice can share it. `ladder`, `flaws` and `quiet-kill` do. The overlook experiments don't, because their scene keeps a plan from the building.

**Measured,** the same command before and after, on six camps and six processes: `quiet-kill` 135 s to 40 s, `ladder` 22 s to 14 s. The reports are the same to the character. All 24 camps and ten arms of `quiet-kill` took 351 s before and 63 s after.

## 2026-11-09 · The way-in search, a fifth quicker, bit for bit

**Why.** Generation spends about two fifths of its time in the search that certifies a way in (`generation/infiltrate.ts`): 41% over five camps profiled, more than anything else.

**Changed, with no answer moving.** Two things inside the search, neither of which changes which state it expands next:
- **Beaten labels leave their lists.** A label another has beaten used to stay in its cell's list and be walked past on every later push and pop. It's now taken out when it's beaten and skipped when the heap reaches it. Beating carries over (if one label beats a second and the second beat a third, the first beats the third), so anything a removed label would have turned away is turned away by the one that removed it: the lists are true Pareto fronts, and the search expands exactly the states it did, in the same order.
- **The heap holds label numbers** and reads its keys from the pool, where it held six numbers a label in a plain array. No two open labels share all five keys, so the order they come off in is the order of the keys, whatever the heap's shape. Neighbours come from a table built once.

**Measured.** By sampling profile over the same five camps (four whose search runs out its budget, one repaired nine times), with the exposure field as the reference that shouldn't move (5,420 ms before, 5,423 ms after): the search 14.2 s to 11.5 s, 19% less, and a world 8% less. Every world's fingerprint is the same for 24 seeds, and a fingerprint covers each search's count of states expanded, so the order is the same and not only the answers. `tests/world.test.ts` pins one of them.

**What's left is the larger part, and it isn't this file's.** On a camp whose target has to be flushed out, the search runs its whole budget of 400,000 states and reports that it doesn't know, for a way in that camp's rules never ask for. Skipping it changes what a world's report holds, so it needs a new `GEN_VERSION` and belongs with the generator's next change. `docs/foundation-review.md`, Generation.

## 2026-11-09 · A shot's sounds are data, and the quiet kill is measured

**Why.** One suppressed kill from a ridge had nearly the whole camp searching within 5 s. The design doc's ladder asks searching of "a close shot"; the code raised a guard to searching for any sound of a shot heard at all, at any clarity: the report, the crack, the strike (which carries 650 m, so that you hear your hit) and the bolt.

**Changed, with nothing moving.** What each of a shot's four sounds raises a listener to is now data (`perception.awareness.shots`): a faint level, a clear level and the clarity that counts as clear, read like any other sound. The defaults are the old behaviour exactly (0.8 at any clarity), so no fingerprint moves; the golden recording is rewritten because the tuning grew. One law still says what a guard hears; this says what he can tell from it. The compound simulator's shot also takes a subsonic load's quieter report, as the rifle's own always did.

**Measured** (`npm run experiment -- quiet-kill`, 24 camps): the same guard taken through the head, silently, by a suppressed round from the best overview, by a loud one, and by a suppressed subsonic round from 90 m, each under the old reading and a graded one (a crack is a shot within about 40 m of the bullet's path and a snap beyond; a strike is a thud that makes a man look).

| | Of the rest, searching at +5 s | At +20 s | Siren within 150 s | Target gone |
| --- | --- | --- | --- | --- |
| Silent | 38% | 60% | 2 of 24 | 2 of 24 |
| Suppressed, any shot is a shot | 99% | 91% | 10 of 24 | 10 of 24 |
| Suppressed, by how clearly | 95% | 89% | 10 of 24 | 10 of 24 |
| Loud, any shot is a shot | 99% | 91% | 10 of 24 | 10 of 24 |
| Loud, by how clearly | 95% | 91% | 9 of 24 | 9 of 24 |
| Subsonic at 90 m, any shot is a shot | 98% | 87% | 8 of 23 | 8 of 23 |
| Subsonic at 90 m, by how clearly | 85% | 84% | 7 of 23 | 7 of 23 |
| Suppressed, by how clearly, and a whistle only turns heads | 84% | 84% | 9 of 24 | 9 of 24 |
| Subsonic at 90 m, by how clearly, and a whistle only turns heads | 67% | 75% | 7 of 23 | 7 of 23 |

**What it says.** Grading what a guard hears barely moves the camp: 99% to 95%, and 98% to 85% for the quietest rifle shot there is. So the law of sound isn't what makes a camp all-or-nothing. What does is how news spreads once one man has it: he shouts, the radio carries it, and in a camp that fights someone blows a whistle that carries 600 m and raises everyone who hears it to searching. Making that whistle a call to look up, and no more, takes the quietest shot to 67%. Even a silent kill, with no whistle blown at all, has 60% of the camp searching 20 s later. Where the siren sounds, it sounds a median 7 s after the man falls, and the target is gone a median 27 s after he fell. The defaults stay as they were: the graded reading is a taste call, and by itself it doesn't buy a quiet kill. `docs/foundation-review.md` says what would.

## 2026-11-09 · The foot of a low ledge is no way up it, and a watch that measures where height is gained

Two sessions took up the long bot runs' broken promise the same afternoon. The one that landed first is the entry *What the long bot runs found in the motor*, below: a body on steep ground could end a tick higher on a gentler triangle across a seam, and the motor now refuses any rise from steep ground. This entry is what the second found on top of it.

**Where the height was gained.** In the five failing runs traced here, every millimetre was gained on the walkable triangle: the body slid down or across the steep one, crossed the seam, and its speed carried it up the far side. By the letter of rule 10 that isn't height gained on steep ground. The fix below reads the rule more strictly, that a body on steep ground ends no higher wherever it ends, and that's the better promise: it's simple, and the motor can keep it exactly. A body that slides into a gully now stops rising for that tick and walks up from the next.

**The watch measures the gain where it happens** (`Heightfield.gainOnSteep`): along the line the body moved, triangle by triangle, counting what the terrain rises on the triangles too steep to stand on. It holds a body that walks to three things:
- from steep ground it ends the tick no higher, wherever it ends;
- onto steep ground it ends no higher either, wherever it began (the check only ever looked at bodies that began on steep ground);
- it gains nothing on the steep triangle it began the tick on.

**A real hole that the stricter rule would have turned into a stuck body.** A body sliding down the last of a near-vertical face was carried 1.2 m sideways and 0.43 m up onto the ledge above it in one tick (ROK-8470, tick 286, about one run in fifty). Terrain rising more than a step inside a body's rim backs it off "downhill", by the ground at the rim point. Where a scarp is narrower than the body, that ground is the top of the ledge, not its face, and if the top falls away from its edge, downhill pointed onto it. With the rise refused and the push still pointing the wrong way, the body is held where it is. Backing off now never goes toward the high ground: where the rim point's own downhill would, the body backs off toward its own centre. `SIM_VERSION` 14. `tests/steep.test.ts` holds a handmade ledge to it: without the change the body is lifted or held, and with it the body slides clear.

**A known inexactness, reported and left.** The motor judges a move by where it begins and ends, so between two pieces of ground it can stand on, a body can cross a corner of a steep triangle uphill: up to 68 mm in a tick over 34 hours of bot play, never faster than a walkable grade over the move, and nothing it can climb by. The watch reports the most it sees (`seamGain`, and on the body lane's bench) and holds it to no limit. Making it exact means cutting a move at the first steep triangle that rises and sliding along that triangle's contour. That moves every pinned run near steep ground, for something no player can see, so it's written down in the motor's header and left until there's a reason.

**Checked,** on the merged code: 40 fresh valleys with both bots for 15 minutes each, the movement scenes, 200 ladder towers, and ROK-8470 again. 3.7 million ticks, 34 hours of play, and every promise held (`npm run fuzz -- --seeds 40 --minutes 15`). The worst rise from or onto steep ground was 2.0 mm, the motor's own allowance.

## 2026-11-10 · Compound types: a walled compound, a keep, a depot and a farm, and why walking their outside no longer pays

**The owner's call** (on the desk, Nov 9): compound types are the next thing the generator learns, on their own branch, and two-storey buildings come with them. `docs/compound-types.md` is the design, with the honest list of what a second storey asks of each system. This lands its first step: the types, on one storey. The second storey is its own pull request. `GEN_VERSION` 8.

**Then the bar moved** (the owner's takedown sitting, Nov 10): "a few perch shots, then just circling the base taking out each new enemy as they came into view, never really being seen, even in the flat field just outside the compound, felt too easy. Largely the bland, simple base design." So a shape is held to this now: it makes you scout and work for an angle, and walking its outside doesn't hand you each man in turn. The first three types were built to differ and two were more open than the yard (a depot showed 3.1 men at a stop on the walk, a farm 3.9, the yard 2.6), so this reworked them.

**What a type is.** A record in `gen.compound.types` (`generation/plots.ts`): how well it suits each crux and each kind of ground, its plan, the size of its plot, its modules, and a `shape`, one function per plot family. A shape produces parcels, corners, lanes, lights and door-facing, and everything downstream (modules, fixtures, cover, staffing, validation) reads those and never asks which type it is. A new type on an old shape is data alone, which is how the walled compound arrived. A seed's type comes from a root stream of its own (`compoundTypeOf`), weighted by crux × ground, so a valley re-rolled or a camp rebuilt keeps it. With every other type weighted to nothing the generator draws exactly what it did before there were types (`tests/types.test.ts`).

**Four places, on four shapes.** A *walled compound* (the first plot, behind a wall). A *keep* (a bailey: a keep in the middle of a walled ring). A *depot* (a spine: the road through a long plot, gate to gate, sheds down both banks with their doors on the road). A *farm* (a steading: a court of three buildings, huts beyond, long field walls). The chain-link *yard* is out of the mix and stays in the tuning as the bench's baseline.

**How walking the outside was measured** (`npm run experiment -- circling`, `lab/experiments/circling.ts`, 24 camps, the same seeds in every arm). A bot limited to what a person can do (`ShootAndCircle`, `bots/person.ts`) fires three rounds from the best overview, walks a lap of the plot 25 m out, crouched, stopping every 15 m to look in, and shoots whoever is there, against the takedown's alert camp. With nobody firing, the same walk is read for what the shape shows.

| | yard (as the owner played it) | walled | keep | depot | farm | as built |
| --- | --- | --- | --- | --- | --- | --- |
| Men down from the walk | 4.8 ±0.8 | 2.9 ±0.7 | 2.2 ±0.6 | 2.8 ±0.6 | 3.9 ±1.0 | 2.9 ±0.7 |
| Men in view at a stop | 2.5 ±0.4 | 1.3 ±0.1 | 1.2 ±0.1 | 1.3 ±0.1 | 1.1 ±0.1 | 1.2 ±0.1 |
| Share of the walk a man is visible from | 32% | 15% | 13% | 15% | 17% | 15% |
| Men no stop ever shows | 23% | 36% | 52% | 33% | 26% | 35% |
| Men in view from the best overview | 5.3 | 5.1 | 5.2 | 5.5 | 6.2 | 5.4 |

Against the yard, seed by seed, as built: 1.9 fewer men down from the walk and 1.3 fewer in view at a stop, both clear of the camps' own spread. Taken apart (a scratch tally, the same 24 camps): of the men who fall on the walk, 2.2 of 3.1 came out to look for him or came with the relief, the camp's answer and the next piece of its engine. What the shape itself hands over, through a wall line, a gate, the breach or from a tower, fell from 2.7 a lap to 0.9.

**What changed to get there.** Chain link was the cause: a patrol on it is visible from 95% of the walk. (1) *A wall with windows*, the `windowed` perimeter: solid all round but for up to one stretch of chain link a side, 6 to 10 m, a place to find that shows a wedge of the camp. (2) *A gate that shows you the camp only from straight in front of it*: the walls-only compound still handed over five men from one spot beside the gate, so two walls now run out from each gatepost along the line the road takes (`barbican`, 10 to 12 m). (3) *Long, high field walls on a farm*, few gaps, a low run here and there, and its patrols 14 m in from them: along a wall with gaps a patrol passes every gap. (4) The plain yard out of the mix.

**Not changed: the view from the ridges.** The best overview still shows about five men at a moment, and two firing points still show everyone a perch can. Walls hide the yard from the ground, not from a ridge. The owner's note calls a bad shot from a perch getting you killed "good"; if scouting from the ridges should cost more it is a further step (overhead cover, or more of the men indoors more of the time).

**Variety** (100 held-out seeds, series `lab-world-variety`; `npm run experiment -- variety-compound`, `variety-families`, `variety-types`; the arm "yard only" is the generator before this change):

| | yard only | as built |
| --- | --- | --- |
| Type (walled / keep / depot / farm) | 0 / 0 / 0 / 0 (all yard) | 19 / 27 / 22 / 32 |
| Plot (yard / long / wide / tight) | 36 / 17 / 26 / 21 | 9 / 25 / 36 / 30 |
| Perimeter (chain / screen / fort / windowed / fields) | 47 / 39 / 14 / 0 / 0 | 0 / 0 / 35 / 33 / 32 |
| Openings in the perimeter, 3 or more | 0 | 22 |
| His door within 25 m of an opening | 21 | 10 |
| Best family of plan (shot / flush / take apart / way in) | 7 / 42 / 8 / 43 | 5 / 31 / 20 / 44 |

Which plan is best depends on the place (`variety-types`): a keep is answered by a way in (19) or a flush (8), never a ridge shot; a depot by taking it apart (10) with shots (4) and a flush (6) beside it; a farm by a way in (12), a flush (11) or taking it apart (9); a walled compound by a way in (11) or a flush (6).

**Lab D's bar.** 96 of 100 valid at the first attempt, 4 repaired, none invalid on the settled generator (`npm run seeds -- --count 100 --from compound-types-exit-5`). Along the way: 89 of 100 on `compound-types-exit-3`, the first series with walls, where `perch witnessed` broke 8 first attempts, most of them on places that had two men in view for a moment now and then behind a wall. Such a place isn't a perch that sees them, so that rule now asks only of a perch that sees 5% of guard time (`witnessedFrom`); 93 of 100 on `compound-types-exit-4`, and two more changes (the gate's walls start at the gateposts) took it to the final 96. Generation: mean 2.7 s, p95 4.5 s.

**What the pictures say** (`npm run look`, from above and at eye height): a walled compound reads as a walled compound, and at eye level you see down the road from straight ahead and from the side only wall, a tower and the light poles; a farm is a court of three behind long stone walls with gaps.

**Bugs found on the way.** A keep's centre is inside the keep, so a search from the site's centre finds nothing: `campWalkStart`, the walk's start, is just inside the gate wherever a building covers the centre. A vehicle parked across a door strands whoever is behind it: types keep it off doors (`vehicleDoorGap`). Main's `yardRoute` found no way out of the yard on 3 of 40 camps, two of them depots: its start was the open cell nearest the vehicle, which can be a pocket of a few cells between it and a fence. It now takes the nearest cell the gate can really be reached from: 0 of 60 boxed in, and none of those routes crosses anything solid.

**Tests.** `tests/types.test.ts`: the pick is by weight and from its own stream; a yard-only camp matches the old generator's fingerprint; each type is what it says; a place behind walls shows fewer men from the walk than the open yard, on the same seeds; a windowed wall is a wall; a gate can be seen into from straight ahead and not from the side. `tests/person.test.ts`: the bot goes all the way round.

**What moved.** `GEN_VERSION` 8, `GOLDEN_TAL_4471`, and the pinned runs standing on generated camps (`TAL-4471 wander`, `MUD-9031 wander`, `TAL-4471 chaos`, `camp-systems`, `camp-fight`); none of the movement, perception, shooting or kernel runs. The bench pins and the golden recording are rewritten.

## 2026-11-09 · The owner's first fight: what it found

**The escape really was broken.** The owner's reading: the box "seems to run into a building, get stuck, the target gets in, marked as escaped." On LEB-2534, the camp they played, that's exactly it. The vehicle's way out was a straight line to the gate, and on 21 of 24 camps that line went through something solid. It was held up 12 m along, and four seconds later the camp counted it as away, because giving up in the road ended the same way as reaching the end of it.

**Changed.** The vehicle finds a way across the yard on the site grid with room for its width (`yardRoute`), then follows the road itself, and is away only at the end of it. A vehicle with no way out of the yard counts as disabled, and that's 1 camp in 40.

**The target can be found.** The debug view marks him TARGET, and TARGET aboard once he's in the vehicle.

**The camp's return fire can be read.** The simulated shooter is a stand-in, so it stays small: a figure where the shots come from, and the panel measures each of the camp's rounds along the path it really flew against that spot (`fired back`: how many, the closest, how many would have struck). It can't be hurt. Being hunted is for a person to feel, from a perch (the owner, Nov 9: use whichever method really answers the question).

**Input.** A tap of the scope button now leaves the scope up, so a trackpad can scope and then click to fire; holding it still peeks. Runs kept in the browser can be deleted one at a time or all together.

**What this didn't fix.** On 19 of 24 camps the target is gone a median of 29 s after the first shot (fastest 21 s), which is the owner's larger point: it leaves one long shot or an ambush on the road, and neither takes the base. It's on their desk as a decision.
## 2026-11-09 · What the long bot runs found in the motor

The weekly run on main, and the same runs on the tree crown branch, broke a body's promise in about one run in five: "gained N m on ground too steep to stand on" (rule 10). Most of it was real: a body on steep ground could step up across a triangle seam onto a higher, gentler one, by up to 45 mm, because only the destination's slope was asked about. The motor now also refuses a rise when the body starts on steep ground. The rest wasn't a broken promise at all: a mantle from steep ground rises as a mantle should, and the check now applies to bodies that stay on the ground. Six of the seven failing valleys pass an hour of play.

**Still open:** one failing run (RAK-4743, the fuzzing bot) ends with a torso 1.3 mm inside a rock as a body starts to lie down beside it on a slope. It's in the lying-down chain and is small and rare, but it is a broken promise, and the weekly run will keep saying so until it's fixed.

## 2026-11-09 · What you can't see through, you can't shoot through

**Why.** The owner's first sitting found kill shots "through tree cover". Those shots had really gone over the treetops, but the worry was right: on a generated map a tree's crown stopped nothing. Of the lines from perches to posts that the simulation called clear, 11% passed through more crown than anyone could see through, and a bullet went through at no cost. "The fact that it can happen invites lots of problems."

**The law.** A crown is foliage: it dims a line by exp(−density × chord), the law perception's bushes already use. Past `gen.props.crownStop` (0.8, about 1.1 m of crown) the line is stopped there, sight and bullets alike, so a thin tip or rim only dims it and nearly all of what's drawn stops it. A bullet is swept piece by piece, so it adds up what it has been through (`BulletState.crown`). It ends on wood, among the branches.

**Left as they are, on purpose.** Sound isn't stopped. A thrown stone falls through branches. Bushes keep their own law: they hide you and don't stop a round, which is concealment rather than cover. Crowns don't cast simulated shade on generated maps, because the ground's shade isn't drawn there, and what's drawn is what's simulated.

**Where it lives.** `kernel/world/foliage.ts` (moved from the perception lane, since `raycast` is the kernel's), `World.crowns` and `World.crownStop`, built by generation so the fingerprint covers them. `sightLine` and perception weigh a crown from the line's two ends, so the answer is the same bit for bit whichever end is the eye. A line looks only at the cells it crosses, and of those only the ones whose foliage reaches its height: it costs very little over a forest of 6,500 trees.

**The crown round your eye doesn't count.** A line from inside a crown, or to a point inside one, isn't charged for that crown: someone with their head among the low branches has parted them. They see out, as the view from inside a crown is drawn (`render/interiors.ts`), a round they fire leaves, and they can be seen. Without this a player standing under a low tree could see a guard, fire, and hit nothing.

**The generator knows.** Perches and their views treat crowns as ground (`Canopy`, a height map of how high they stop a line), so a perch behind a wall of trees is no longer listed as one. Crowns are narrow and steep, so the map is the highest each crown comes in a cell and it's read every metre. Of the lines from listed perches to posts that rock and wood leave clear, 98.3% are open at the real limit (20 camps).

**What it did to the fight.** Against the fair sniper, on the new camps with crowns, the flaw report's largest number is a tower man silent 8 s after a suppressed shot, 0.75 a run. In the line is 0.25 a run for the sniper, the suppressed sniper and the relocating shooter (`npm run experiment -- flaws`, 8 camps).

**What it cost.** A tick of a generated valley's bot run takes 90 µs with crowns and 9 guards, and took 150 µs on the camp TAL-4471 had before, with 11: the forest doesn't show. On a fresh held-out series 90 of 100 camps are valid at the first attempt, none invalid (`npm run seeds -- --count 100 --from lab-crowns-exit`). The series the world pillar measured fell from 93 to 82, also with none invalid: the bar is being met only just. Nearly all the difference is the two rules about what one perch may see, `perch witnessed` (8) and `perch coverage` (5). A perch that crowns have narrowed sees a few men, and those two rules were written for perches that see most of a camp; a rebuild fixes those seeds, at about 3 s each. Whether those rules should change is left open until the camp types settle what a perch is for.

**What review changed.** An independent review checked the walk and the chords against brute force and found no bug in the law. It found these at the edges, all fixed: perches read the map too coarsely (the figure above was 93.6%); an eye inside a crown, as above; a round stopped short of a man still counted as a near miss, which was already true of walls; the tools that drop something where you point landed it in the branches; the debug shot line ran on past the crown; and the canopy cell had no bound, so a corrupt recording could size an allocation.
## 2026-11-09 · What the first sitting showed: the simulator was misreading its own shooter

The owner's first sitting of the compound simulator: "kill shots from hundreds of meters away, through tree cover. Zero line of sight, near perfect accuracy."

**What was really happening.** The script's shooter was on a ridge 200 to 290 m from the camp, and its shots went over the treetops. The panel measured everything from the idle player, parked 736 m away at the corner of the map, so it read as a 736 m shot through forest, and F3 put the camera back there. A tool that says the wrong thing costs a sitting.

**Changed.**
- The panel measures from the real shooter, the last muzzle, and says where that is. The label `shooter` marks it in the debug view, and 7 looks along the last shot from there.
- In the compound scene, leaving the debug view stays over the camp: its player is only parked.
- The scripted sniper is a person: it shoots only at someone in a clear line, at the chest, with 0.8 mrad of error, every 8 s, and otherwise holds fire. It used to fire at the middle of the camp when it could see nobody.
- The flaw detector holds a man only to what his camp could know. Of the 19 "in the line" flags against the fair sniper, none was exposed from where his camp believed the shots came from. He'd gone to cover from the wrong ridge, or had no idea. That's the honest uncertainty the owner asked for, not a defect. In-the-line per run: sniper 0, suppressed 2.0, relocating 0.9.

**Still true, and next:** tree crowns stop nothing on generated maps (11% of perch-to-post lines the simulation calls clear pass through crowns too thick to see through). The law to build: if you can't see through it, you can't shoot through it.

## 2026-11-08 · The world pillar: the target is buried, and camps are built around a crux

**Why.** The reviewers found the same best plan in 29 of 30 camps. The owner's ruling on what that plan rested on: "If the target can always be seen from every perch, that effectively makes every mission 1-shot from success from nearly every vantage point. That effectively forces the easiest map of all time across generations, where it likely has to fall into a low-building compound within a valley. Very bad rule that forces both generic map design, and no real challenge to reach a target. Much smarter to bury target behind the challenges inherent to the base takedown." So lab D's rule that every camp offers two perches on the target is gone. The design doc's validation rules ("three or more viable approaches") need the owner's edit to match.

**Measured first** (`npm run experiment -- variety-ground`, `-perches`, `-views`, `-compound`, `-target`, `-families`, `-cruxes`; 100 held-out seeds, series `lab-world-variety`; the `plain` arm is the generator as it was, with every new weight at zero). Three things made a hundred seeds one picture, rotated, and the seed explorer and `npm run look` agreed. Plain, then as built:

- **One kind of ground.** The pad in a hole or level with what's round it: 100 of 100 plain, 85 now, with 15 standing 8 m or more above it. A skyline under 4°: 94, then 70, with 9 at 8° or more (0 before). Ground falling away on half the bearings or more: 0, then 15. Dead ground the towers can't see over a tenth of the ring: 1, then 48. Six kinds of site now: hollow 25, spur 15, bend 23, scarp 20, gorge 8, col 9.
- **Every perch had the same view, and the target in it.** The median perch saw 65% of the camp's ground or more in 99 camps, 22 now, and under 40% in 23 (none before). Four perches in five or more held the target for 10 s in 63 camps, 6 now. Fewer than one in four in 1 camp, 78 now.
- **One compound, one road.** A square plot in all 100 (41 are now 1.6 long to 1 or more), the road within 15° of the gate's axis in all 100 (74 now), chain link everywhere (38 have a wall on the ridge sides, 15 all round; 38 have packed yards).

**The rule was doing the work, and layout couldn't undo it.** With the new ground and plans but the old promise (the `layout only` arm of `variety-families`), the ridge shot is best on 35 of 100 camps against 32 plain, and possible on all 100. Taking the promise away is what moved it: best on 7, possible on 29. Holding to a shot whatever the camp costs a mean 0.32 of risk now against 0.10 plain.

| Best family of plan (of 100) | shot | flush | take apart | way in | a shot at all |
| --- | --- | --- | --- | --- | --- |
| plain | 32 | 7 | 19 | 42 | 100 |
| layout only | 35 | 16 | 18 | 31 | 100 |
| as built | 7 | 39 | 12 | 42 | 29 |

No family is over 50%. That bar was already met on this scoring by the plain generator (42%, a way in), so it isn't what changed: the shot's share, its cost and whether it exists at all are. Lab D's risks aren't calibrated, and the mix leans on how the way in is scored: with the path the analysis first found rather than a careful one, the shot is best on 46 plain camps and 9 as built, the same direction. By crux (`variety-cruxes`): inside, a way in on 37 of 44 and a flush on 7; flush, a flush on 27 of 27; escort, spread: take apart 12, shot 7, flush 5, way in 5 of 29. The longest unwatched view of him any perch gets was 10 s or more in 40 camps, and is now in none, in the analysis's model, which counts a door as solid.

**Lab D's bar stays:** 93 of 100 valid at the first attempt on a new held-out series (`npm run seeds -- --count 100 --from lab-world-variety-exit`), 7 repaired or rebuilt, none invalid. Generation takes a little longer: a median of about 2.8 s for an inside camp and 3.7 s for a flush camp against 2.1 s plain, because on a flush camp the search for a way in to a man whose door is held usually runs out its budget.

**What changed.**

- **Cruxes** (`generation/crux.ts`). A seed picks its decisive problem first, from a root stream of its own (rule 3), and the camp is laid out to make it true. *Inside* (weight 4): he stays in his building, deep in the camp and away from the breach, out of every perch's view, and someone has to go in. *Flush* (3): he stays in too, his one door is held, and he has to be made to run and had on his run. *Escort* (3): he walks in the open, on the walk where another guard most often has him too. Validation's `crux` rule asks that a way to succeed at that problem exists, and nothing else.
- **What a crux lays out.** Deep slots for a buried target. A short wall inside each of his doors (`screenDepth`), so that a straight line through the door from the yard doesn't reach him, always stopped short of the side walls (`screenGap`). His spot picked out of line of the doors as well as out of the perches' sight. Where the way in isn't the crux, his one door held by a sentry; on an escort's camp that sentry stands at the door's shoulder, clear of his way out. On an inside camp, two doors on two different walls, and guards kept off the way a body can actually walk from the breach to his door.
- **The ground.** Six kinds of site (`generation/landform.ts`, each from its own stream). Walls nobody can stand on aren't perches, and a perch has to be ground a body can walk to (26 of 748 weren't).
- **The compound.** A plan (`layout.plan`, its own stream): the plot's shape, its perimeter, how full its yard is. Roads that swing off the gate's axis.
- **Close shots are checked against what stops bullets.** The raster let a line through a one-cell wall at a corner, so a search over many cells and moments found ways in that "shot" him through a wall. `clearShot` is a stricter raster line, then the colliders' own raycast.

Every new choice has its own stream and weights in tuning, so with them at zero the generator draws what it did (the `plain` arm). `GEN_VERSION` 6.

**The audit: what else forced generic maps or took the challenge away.** Changed, as clearly wrong:

- The two-perch guarantee and everything staffing did to serve it (the walk chosen for two overviews, the target at the breach).
- `infiltration`, `systems` and `two ways out` asked of every camp ("every approach must be possible on every seed"). They're asked now only where the crux needs the way in: on a flush or an escort camp a way in is what the player has to find, or do without.
- Guards kept off the way in on every camp: only where the crux needs it.

Left as they are, each the owner's call:

| Guarantee | Recommendation |
| --- | --- |
| One compound topology: seven slots round a yard, one gate, one breach | Next, and the biggest: archetypes as data (a keep on a hilltop, a depot strung along a road, a farm and its outbuildings), picked by crux |
| A breach in every fence, facing a ridge | Ask only of the cruxes that use it, once a player can cut a fence |
| Low buildings: one storey, 3.2 m | Change with the archetypes: a two-storey building is the next way to bury him |
| One-sided overwatch (perches over at most half the horizon, at least 120° open) | Keep for now: it's what leaves the road a way in. A ring of high ground belongs with the crux below |
| The flat pad at the middle of the map | Keep: everything assumes a pad, and rule 15 leaves the door open to moving it |
| One of each of the seven roles in every camp | Keep until lab F says what a camp's roster should be, then buy by crux |
| `clusters`: every sightline cluster can be taken apart | Keep, and ask it only where a chain shot is the way (escort) when a camp type needs otherwise: 1 camp in 120 broke it |
| `perch coverage`, `perch target`, `perch witnessed`, `counter-perch`, `alarms in fire`, `escape`, `guards` | Keep: they take a free ride away from a perch; they don't promise one |

A fourth crux, **the rim is held** (guards on the high ground, so the perches have to be taken first), isn't built: guards outside the raster aren't analysed, and they need lab F's engines. A player isn't told a camp's crux: finding it out is the reconnaissance.

**The research, weighed.** A survey of expressive range, plan-family regret and generating from a decisive problem (Smith and Whitehead 2010; Beukman et al. 2022; Balduzzi et al. 2019) was the seed. It said the sameness was structural and to pick each seed's problem first, and the measurements bear out both. It blamed the rule, and the rule asked for only two perches, but 27 of 32 had him: the open compound on flat ground did as much as the rule, and needed the new ground and plans. It kept the design doc's "every approach exists, what varies is the margin"; the owner's ruling goes further, and nothing is promised but a way through the crux. It went from a list of problems to validate; here the crux also lays out the camp, which is what makes a crux true on 93 of 100 seeds first time rather than a filter that throws most away.

**What moved.** `GEN_VERSION` 6, `GOLDEN_TAL_4471`, and the pinned runs that stand on generated camps (`TAL-4471 wander`, `MUD-9031 wander`, `TAL-4471 chaos`, `camp-systems`, `camp-fight`); no other scene's fingerprint moved.

- **Benches.** Lab D's six camps: 4 valid first time, 2 repaired (5 of those 6 happen to be flush camps), and a way in and out is found on 1 of them, since only an inside camp is promised one. One overlook from the best perch (E12): 22 of 31 guards down against 12 of 27, and the target got away on all three camps, which are flush camps where he runs when the shooting starts. No camp was cleared.
- **E12's timed shot** needs a target a perch can have, so the bench runs it on three escort camps of its own and gets him on 2 of 3. The plan's *One timed shot* (28 of 30) was measured before the cruxes and says so now. On other camps that shooter has nothing to do; the `overlook` scene already leaves him idle.
- **Tests.** `tests/validate.test.ts` and `tests/sites.test.ts` ask for what each crux promises. `tests/equipment.test.ts`, `nav.test.ts`, `plans.test.ts`, `person.test.ts` and the way-in check in `staffing.test.ts` run on the plain camps: what they test (doors, a route across the valley, the bots, the walk out after a perch shot, the skeleton's corridor) stood on what those camps promised. `tests/guards.test.ts` sums what's walked over its two camps, since a camp can have every man on a post. `tests/lab.test.ts`'s dice test stands on a flush camp, which takes longer to generate, so its time budget went up. `campAnalysis`, `landform`, `compound` and `world` follow the new kinds of site.

**Known limits.** The plan bots know long range, a way in and the systems, not a flush: on a flush camp `campPlans` falls back to a plan that doesn't reach him, so `npm run plans` and D's signature test say less there. A flush camp's officer mostly stands, because the door sentry is in the way of his walk through it (4 of 24 walk; 33 of 35 on inside camps, 40 of 72 plain); guards walking overall are level with plain (2.8 a camp), but a few camps have one or none, TAL-4471 among them. The reviewers haven't been re-run, nobody has played these camps, and lab D's risks aren't calibrated.

**What an independent review caught.** A flush target could be deaf to the siren: walls cost a siren what they cost a voice, and the deep room and the new screen put him behind three or four. On 24 forced flush camps one was deaf to every box and 10 of 62 boxes were silent, so he'd never run, which is the whole of that camp's problem. A siren is meant to be heard indoors: it now loses 3 dB a wall with no limit on how many, and none is silent. A player could start on a shelf with no walk to the camp (REV-0010, REV-0047, REV-0058): the spawn now asks. A man at rest in line with an open door was a free shot on an escort camp (2 of 23), because a perch's view counts a door as solid: the door-line choice now covers every crux but the old walk.

**One thing left, with the numbers.** Certified ways in on inside camps are looser than the simulation supports. Replayed with real perception they're detected on 10 of 41 inside camps, against 4 of 54 before: the paths are about 2.5 times longer at the same 0.84 peak against a limit of 0.85. A careful person isn't a replay, so the sitting decides whether it needs a tighter limit.

**Reported, not fixed (outside this work).** `brain/nav.ts`: a raw diagonal step can clip a tree (TAL-4471 as built, from −126.3, −96.3 to −128.8, −98.8), because its edges check the two ways round a corner and not the corner itself. `lineOfSight` in `raster.ts` still slips past a one-cell wall at a corner; staffing's estimates use it, and the close shot now doesn't.
## 2026-11-08 · Getting out of the line, getting down, and routes off the camp

**The flaw detectors found it.** Standing in the shooter's line was the largest flaw. Most of it wasn't men misled by a suppressed shot, as we'd written: it was men on the fence, whose nearest cover was 14 to 35 m away, with a search that gave up at about 11 m. They stood in the open for a minute. The search now walks up to 40 m, looks at fewer spots the farther it goes, and counts rays as well as cells (rule 18).

**Guards can change stance.** It looks first for a spot that hides a man crouched, because he can fight from there. A fold of ground that only hides him lying flat is taken when it's at least 8 m nearer. With nothing at all, he gets down where he stands. Orders carry an optional stance, the snapshot carries what his shape needs, and he's drawn where his shape is in any stance (rule 14, `tests/guardMeshes.test.ts`).

**What moved** (`npm run experiment -- flaws`, 8 camps): in the line, against a sniper, 5.5 to 0.9 men per run; a suppressed sniper 9.4 to 2.6; relocating 5.1 to 1.4; sabotage 4.3 to 1.0. It costs no more to run. Three things a detector shouldn't have counted are gone: a man flat in the open with truly nowhere to go has done what he can (a search on the real shooter's bearing decides), a man looking around where he was sent isn't stuck, and a man under a roof can really miss a distant report. What's left, about one man a run, is mostly men caught by a shot they couldn't place.

**Reinforcements have a place of their own.** They used to borrow the first patrol's post, and one camp's first patrol stands at a single point, so a squad of three ended up in a heap with him (pile-up 3.0 per run). Each now goes back to where he got down from the truck. A phase along the patrol's loop didn't help: a post with no route has no loop.

**Routes off the camp, and why fields.** A camp can't hunt on a ridge it can't route to, and only 74% of routes from a post to a listed perch were found (`npm run experiment -- routes`): 21% none, because the coarse layer's cells inside a building are a sealed pocket, and 6% ran out of budget. Going out through the fine layer first took it to 92%, but a fine search around a fence with one gate took up to 170 ms. So a route with one end in the camp now uses fields flooded once for the world's life: fine ones from anywhere in the site to each eighth of its edge, a coarse one from the rim to anywhere on the map, joined by a short coarse search outside the camp. He leaves by the side he's going to: leaving by the nearest edge made 11% of routes over 100 m too long, and it's now 1 in 1,000. 99% are found, at about 0.5 ms each, against 13 to 29 ms for a fine search. Most of what was left was checking a long segment against every collider in its box, so a segment now looks up colliders a stretch at a time. The fields are built before the first tick. A route with a priced or closed door doesn't use them: they're the open camp's.

**The independent review** caught what we'd have shipped: men sprinting while still ordered down (an order clears `covered` without starting a new act, so a stance has to apply only to a man staying put, and his legs now limit how fast an order can move him while he's down or getting up); a reinforcement who goes quiet looked for at the post he'd borrowed; and a detector that hid prone men who did have somewhere to go.

**Still wrong:** 1% of routes find nothing because the perch itself isn't reachable on the map layer. Worth checking against the world work, which is changing perches.

**The ladder hasn't moved, and shouldn't have been expected to** (`npm run experiment -- ladder`, 16 camps × 3 rolls): shoot once and leave 31 of 48 (27 before), shoot and relocate 10 (13), careless 6 (7), perfect and static 0. Men getting out of the line makes a second shot harder, and a plan that only needs one isn't touched by it. What beats that plan is a camp that comes after him, which is step 2.

## 2026-11-08 · The lab bench finished (F0): forks, dice, and a shooter with a person's limits

**A fork is re-simulation plus one intervention** (`src/lab/fork.ts`, `npm run whatif`). A branch starts again from tick 0 with a fresh driver or the recorded inputs, plays to the fork, has one change made between two ticks (the player moved, a guard taken out, a part switched off from that tick on, a number patched), and goes on. It doesn't restore mid-run: bots keep memory outside the state, the recorder won't start at a later tick, and `restore` keeps the tuning and the work counts. A branch that changes nothing is the same run, bit for bit, and `tests/fork.test.ts` holds it to that. A branch isn't a recording: an instrument's change doesn't flow through the input (rule 5).

**The dice are `tuning.sim.dice`, 0 by default.** Every entity's stream is forked once more by label, so 0 moves no fingerprint, no entity's numbers depend on another's, and generation, which reads only `tuning.gen`, can't move. `--dice N` runs each camp N times. Each camp still counts once, by its mean, because N rolls of 12 camps aren't 12 × N independent camps; the report also gives each number's split between the camp and luck. In the ladder, whether shoot-once-and-leave wins is three quarters luck (26% the camp), and whether shoot-and-relocate wins is mostly the camp (70%).

**Decisions rest on a shooter limited to a person** (`game/bots/playerView.ts`, `game/bots/person.ts`, the `ladder` scene). `PlayerView` gives a bot only what a player could know: bodies in a clear line, at the distance they are, its own state, the map, and only with glass on a man whether he's the target. The shooter takes seconds to find a man, range him and hold, misses from its own stream, and can engage only who it sees; a test keeps its imports behind the view. Its numbers are starting values, to be set against real sittings. It's still generous: it starts on a good perch, knows the map and the way out, never panics and never mistakes who's who. "Perfect and static" is the old bot, the upper limit of what one perch could do.

**What the ladder found on today's camp, with the first fight in it** (`npm run experiment -- ladder`, 16 camps × 3 rolls of the dice, the mission's own rule: the target down and you out):

| Plan | Won | Target shot | Target got away | Shot dead | Time to win | Rounds at him |
| --- | --- | --- | --- | --- | --- | --- |
| Careless | 7 of 48 | 10 | 20 | 21 | 378 s | 14.0 |
| Shoot once and leave | **27 of 48** | 37 | 9 | 10 | 408 s | 13.0 |
| Perfect and static | 0 of 48 | 1 | 42 | 0 | never gets out | 1.8 |
| Shoot and relocate | 13 of 48 | 15 | 30 | 2 | 373 s | 7.6 |

Shoot once and leave is still what wins: best on 6 of the 16 camps and tied on 6, as the design predicted and doesn't want. It really walks out, a median 408 s from the start of the run. Before the first fight landed the same ladder gave it 39 of 48, with 2 shot dead; with it, 27 with 10 shot dead. The plan loses to the target getting away in 9 and to being shot in 10. Careless is shot dead in 21 of 48 and wins 7.

**What moving buys, by fork** (`-- relocate`, `-- relocate-quiet`, 16 camps × 3 rolls, the perfect shooter on the best overview, forked 2 s after his first shot):

| | Rounds at him | Hits on him | Detected | Nearest guard | Estimate off at the end |
| --- | --- | --- | --- | --- | --- |
| Stays and keeps firing | 3.4 | 0.02 | 0 of 48 | 278 m | 78 m |
| Moved 30 m, instantly | 3.3 | 0.04 | 0 of 45 | 277 m | 76 m |
| Moved 100 m, instantly | 3.7 | 0 | 0 of 48 | 261 m | 106 m |
| Walks 30 m | 6.7 | 0.04 | 0 of 48 | 278 m | 81 m |
| Walks 100 m | 6.4 | 0.02 | 0 of 48 | 262 m | 96 m |

Against a shooter who fires once and holds fire (`relocate-quiet`), with the whole camp left alive, the same: 1.9 rounds and almost no hits, no detection and 252 to 266 m in every arm, and the estimate is 67 m off for him staying, 76 m for 30 m, 123 m for 100 m. No branch is clearly different from staying on anything, so moving 30 m or 100 m buys nothing today: the camp puts little on a perch and doesn't find him there or anywhere else. The estimate gets worse by less than the distance moved, about 9 m for 30 m and 30 to 56 m for 100 m, and nobody acts on it. This is the number F2 has to change.

**What moved:** no fingerprint moved beyond the new run. The brain lane's bench gains its first pinned run, `camp-fight` (the first 45 s of a shooter on an overlook, a couple of seconds in the self-test), and with it `BEHAVIOUR`, which is a digest of every pinned run: recordings made before this are refused with the reason, as they are for the new tuning key too. The golden recording is rewritten for both. The full ladder runs weekly in CI (`ladder`); a pull request plays only the `ladder` scene's canary.

## 2026-11-08 · The first fight, and a camp with no player in it

**Decision:** a camp that fights back is a flag on the camp (`fights`), so lab E's scenes are untouched, and the compound simulator (`?scene=compound`) tests it with no player at all: stimuli dropped by a person or a script, all through commands, so runs record and re-simulate. The owner's framing: the camp is the core, and a player is one way of providing its inputs.

**What it took.** A man hiding from where he first heard the shot hides from the crack, which points the wrong way (a median 46° off the real bearing). He now waits a moment for the report and hides from every listed perch near it, as a soldier is taught to. That took men really hidden from the shooter from 64% to 77%.

**What it did** (30 camps, a perfect shooter who stays): guards down 8.7 to 7.0 of 9.6; the share in his line 20 s after a shot 61% to 41%; rounds at him 0 to 3.8. It isn't a win yet: he's still never hit.

**The muzzle flash comes from the report, wherever it was fired**, so it's the input and not the player that's seen.

**What moved:** the brain's bench (guards down from one perch, 22 to 12 of 27). Nothing else pinned. Live camp is scene version 3.

## 2026-11-08 · Lab F: the owner's calls, and what review changed

**The owner's calls:** a sixth lab, required by *Labs pass*; firing gives you away a little; a mission ends when you get out. Sandboxes are near-term development instruments, not shipped games, and every step has to be human-playable.

**The way out is the end of the road, not the nearest edge.** From the perches that can see the target the nearest edge is a 92 s walk (`npm run experiment -- way-out`), which nothing the camp does could interrupt. The end of the road is 289 s on foot, and it's the way the reinforcements come in. E12's overlook keeps the old rule, because it measures whether the target falls or gets away.

**A trial's brief names only the action.** "In the tall wall's shade, 40 m from a sentry" told the player what the honest view was meant to show. Nobody had sat yet, so this was the cheapest moment to change it.

**Dead ground exists; hiding from one guessed point doesn't find it.** Of guards a perch can see, 100% can reach ground it can't see within 2 s, if they know the exact perch. A man hiding from one point 30 m wrong is really hidden 30% of the time. Hiding from every listed perch near the camp's belief works 100% of the time, within 2 s for 70%. The note below said cover within 12 m rarely hides a guard from a ridge. That was true of how we chose it, not of the ground.

**Two independent reviews changed the order of work.** `docs/camp-engine.md`, section 12, has what they found and what changed. In short: a person plays it before the rest gets built, hiding has to end, and shooting once and leaving must not win.

## 2026-11-08 · The camp needs hands

**The owner's call on the ridge shot:** contest it, and contest it through how a camp fights. A compound expecting attack has counter-snipers, and a camp under fire takes up defensive positions, returns fire, inspects where the shot came from and calls for support. Asked to assess that "through a lens of engines", we wrote `docs/camp-engine.md`. It's a proposal: nothing in it is built, and its calls are the owner's.

**What was tried first and shelved:** a generator rule that posts one more guard to watch the target's walk. 23 of 100 camps got one, and the longest unwatched moment on the walk fell only from a median 7.2 s to 5.0 s, because most candidates broke the limits on clusters. A guard posted on one walk contests one plan. It wasn't kept.

**What the measurement adds** (30 camps, series `lab-e-overlook`, a perfect shooter staying on the best perch): the camp fired no rounds at him in any run, no guard ever detected him, the nearest came a median 272 m, and 30 s after his first shot its estimate of his position was a median 62 m off. 4.8 guards stood in a clear line from the perch at the first kill, and 4.8 did 20 s later. The camp knows where he is and has no way to act on it.

Those scripts weren't kept. The numbers are now one command away: `npm run experiment -- friction`, `-- gallery`. The estimate is a median 74 m off when the runs with no estimate at all count as the worst, and 62 m without them.

## 2026-11-08 · One overlook, from both sides (E12)

**Decision:** the scenario `overlook` runs on any generated camp with the whole brain awake. `plan=clear` is a perfect shooter on the best overview who never moves and takes everyone he can see, the target last, one shot every 5 s by default (a person's pace; `pace=1.5` is as fast as the bolt allows). `plan=timed` is a shooter on a certified perch who waits for a clear line to the target's head while nobody is watching him, and fires, up to three times. The bench pins both on three camps. Scene expectations hold only what must be true on every camp.

**What it found** (30 fresh camps, series `lab-e-overlook`):

| | Guards down | Target got away | Cleared outright | Undecided or target down |
| --- | --- | --- | --- | --- |
| One perch, a shot every 5 s | 8.7 of 9.6 | 22 of 30 | 2 of 30 | 6 |
| One perch, as fast as the bolt | 8.2 of 9.6 | 10 of 30 | 1 of 30 | 19 |

The timed shot takes the target in 28 of 30, a median 138 s in. In the other two the shots were taken and didn't drop him. Left on his perch for two more minutes, in those 28: the alarm went up in 20, a median 8 s after the kill; nobody saw him or hit him; the nearest any guard came was a median 223 m; and the camp's estimate of the perch was a median 83 m off. That is what the owner's ridge-shot call rests on.

**What was tried and taken back:** ordering the whole camp to cover from the believed perch, having guards duck at the first shot they hear, and making cover hide the head, not the chest. Each made it worse. Guards ran across open ground to reach cover, and those who would have run for the alarm didn't, so the target stopped getting away. Cover within 12 m rarely hides a guard from a ridge in any case. Tuning this blind was the wrong tool, so the brain is as lab E left it and the question goes to the owner with the numbers.

**Why it's open:** the plan asks for "on every validated camp"; 2 of 30 isn't every, and the mission-losing alarm depends on who is left to raise it. The target's escape, not the guards' survival, is what stops a shooter on a ridge.

**What moved:** the brain's bench gains the four numbers. Nothing else pinned.

## 2026-11-08 · The camp's equipment (E7, E8, A9's doors)

**Decision:**
- **Sabotage is held, not pressed.** The use key has a held bit now (in the held byte, so older recordings still read). Holding it at arm's length stops the generator, breaks the radio at its set or its mast, or disables the target's vehicle. It's a step of the use system rather than a system of its own, because every other system in 'commands' already orders itself against 'use'.
- **Nobody is told.** A guard who looks at stopped equipment notices it, once. The operator finds a dead set at his next call. A runner finds a dead box. With the generator down the radio is down too, so a guard who notices can only say so aloud; the operator's report reaches the camp because the set is what's dead.
- **The hum stops with the generator:** in what masks a guard's hearing, and in the speakers.
- **The target's truck drives out,** and the mission is lost only when it's gone. It swerves round anyone in the road, and after 4 s held up it goes through, because a truck that a sentry can stop forever is a mission that can't be lost. Sabotaged, it strands him beside it and the mission stays open.
- **Doors** open and shut at a press and are heard. A guard who walks up to a shut door opens it, so no route needs to know. They all start open, so the cue is a door someone has shut.
- **Reinforcements come by truck** up the camp's road, timed to reach the gate at the delay, and get down behind it. A handmade camp has no road laid out, so its squad still arrives on foot.

**Marksmen stay on their towers, for now.** The plan had them moving to overlooking posts. Measured over 16 camps, a tower already overlooks 495 of 503 perches (98%) and every camp's best overview, so the move would matter for very few perches. It needs ladder links in navigation and a marksman who is no longer tied to his post, so it waits until a sitting shows it's missed.

**What moved:** nothing pinned. New state is absent until used, so runs that don't use it hash as before. The tuning grew, so the golden recording is rewritten.

## 2026-11-08 · The camp brain on generated camps (E13)

**Decision:** a scene, `live-camp`, puts lab E's whole brain on any generated camp, with the rifle. It is a scene rather than a change to the valley's systems, so the default valley's behaviour doesn't move until Phase 2 joins the labs. Lab D's entities hold the one answer about whether a box has power or the radio works; `campDevices` keeps the commander's copy of it, and raising a box raises its entity. A handmade scene's camp, with no such entities, keeps the list its scene gave it, so the scripted scenarios and benches are untouched.

**Why:** the review point read E7, E8 and E12 as nearly done. None could finish while the brain had only ever run on one handmade camp.

**What moved:** nothing pinned. The tuning gained the gap beside a vehicle where its driver gets in, so the golden recording is rewritten.

## 2026-11-08 · The valley is lab D's (D9)

**Decision:** every generated world now has lab D's valley and compound. A mission that names no camp gets the default one, and its spec says so (`world.spec.camp`), so a recording names the camp it was played in. Phase 0's terrain, test camp and terrain analysis are gone, with the ten `gen.world` values only they read. `?camp` still loads and does nothing; `&difficulty=` still sets how hard the camp is.

**Why:** the labs needed a stable valley while they were built. Keeping two generators now would mean every later system had to work on a camp nobody plays.

**What moved:** `GEN_VERSION` 5. `TAL-4471`'s fingerprint is `6493586d720c2b68`. Both fingerprints of the three pinned plays moved, the golden recording is rewritten, and the generation bench no longer counts Phase 0's valleys. No scene moved: `SIM_VERSION` stays 9. On a fresh held-out series (`lab-d-exit-4`), 96 of 100 camps pass at the first attempt, 4 are repaired or rebuilt within budget, and none is invalid.

**The tests that assumed the old camp** now say what they meant: guards keep to their routines within lab D's 25 cm, a recording's size allows for 16 guards' state, and the perception boundary's far places are the corners farthest from wherever the camp stands. Thin walls stop sound by their own flag, because 20 cm can fall between grid cell centres. The site test went: `tests/compound.test.ts` already holds the compound to rule 15.

## 2026-11-08 · After the labs

The night's review point, checked against the code the next afternoon.

- **E13 is added.** The review point said E7, E8 and E12 could finish now that labs C and D are on `main`. They can't, yet: `giveBrains`, the commander and the radio run only in the handmade `camp-brain` scene and its scenarios, a generated camp arms no rifle, and the brain's alarm boxes are a list of its own (`giveDevices`) beside lab D's `alarm` entities. E13 puts all of it on generated camps, in a scene, so the default valley doesn't move until Phase 2.
- **D9 doesn't wait on the owner.** Lab D held it for a go-ahead. It's in the plan, it is mechanical, and it can be undone; the owner has said sessions handle landing and versioning. The owner's spot check of three camps waits for E13 instead, because today those camps can only be walked.
- **`npm run land` looks past one failure:** Vercel's rate limit, recognized by its link to the upgrade page. CI builds the game itself, and the owner approved this default on Nov 8. Previews stay on and the plan stays free; any other failed deploy still stops a landing.
- **A9's doors go in with the use key.** Lab D's doors are on `main`, but they are generated open and nothing changes them, so there's no open door to notice until something can shut one.
- **The long runs passed on the merged `main`** (6e6d5f0, dispatched Nov 8): the 40-hour fuzz and the synctest, with every platform's check and the same hash on all three.
- **The pre-screen of the owner's four sets** (`OWNER-A1`, `A2`, `C1`, `C2`): two agents, each passing its perception check (8 of 8, and 7 of 8). The edge mark matches the record on all 140 frames, and nothing on screen gives an outcome away. Noted and left, since `Trial.legible` feeds only the probe's statistics and no trial or score moves: one frame's head is visible where the record calls it unreadable; a voice at exactly the bark radius is recorded as legible and not captioned; a noise trial's `legible` is all false by construction. Worth a look after the sittings: crawling in a bush, a pale band shows at the bottom of the screen where the foliage tint stops.

## 2026-11-08 · Lab E: the camp brain

The camp brain is built on the plan's defaults (`docs/phase-1-plan.md`, E) and research seeds; these are the calls made along the way.

### A guard with a brain is opt-in; lab A's minimal reactions stay where they are measured

**Decision:** A guard given a `brain` (`giveBrains`) decides through `decide()` (E3); a guard with senses but no brain keeps lab A's `react` (`game/guards.ts`, `think()`); a guard with neither keeps his routine.

**Why:** Lab A's scenes and trial mode measure sight against guards whose reactions it fixed (its trial protocol needs them to look, not to hunt), so its numbers must not move when E's brain lands. E3's "replace" holds wherever the camp brain runs. The valley moves to the brain in its own announced commit, after A13.

### The camp is an entity with one memory; the commander reads only that

**Decision:** Everything the camp believes is one plain record on a `commander` entity (`CampState`): its alert level, its search map, its roster, its tasks. The commander's mind (`CampMind`) is that record, the static world and the time; nothing else reaches its decisions, and the no-omniscience probe hashes it before and after.

**Why:** Rule 13 applies to the camp as to any guard. A single record makes the "fed only by reports" claim checkable: the map, the level and the ellipse change only by digesting the inbox.

### Reports travel physically; a guard told something only looks and waits

**Decision:** A report is an action: a radio call has a duration and its delivery is scheduled when it finishes, cancelled if the speaker drops, needing a working set and a live operator; a voice is a sound through lab A's hearing. A guard who is only told about something raises his awareness and looks; only his own senses start an investigation or a search of his own.

**Why:** It is the pacing the design doc asks for without a token system that reaches into minds: orders travel by the same honest channels, and convergence is limited by slots on what the commander sends (Halo 3's capacities), plus Blacklist's claiming ("I've got it"), not by reading who is where.

### Triangulation is a grid posterior, not a least-squares intersection

**Decision:** The commander fuses bearings on a coarse grid over a ring of plausible perches, reduced to an ellipse whose one- and two-sigma levels are the posterior's own 39%/86% mass (`brain/triangulate.ts`).

**Why:** Least squares says nothing useful about a lone bearing and is badly overconfident for the long, banana-shaped posteriors a clustered camp makes at 300 m. The grid handles both, is exact in every engine, and its cost is the budget (rule 18). A seeded test holds it to the 39% and 86% rates for one to six listeners.

### The in-world calibration bench was measuring one draw of each guard's ear

**Decision:** Each bench shot, and each pursuit, runs with its own world seed, so every guard's streams, and his ear's error, start afresh. The fudge factor that had been tuned against the old measure (`statedScale`, 0.85) is gone: the ellipse states the error each guard really has.

**Why:** Each guard's stream started from the same seed in all hundred shots, so an ear's error was one fixed draw per guard, and the bench's coverage swung from 36% to 61% at one sigma on a change that merely shifted a stream by one draw. Independent draws give 41% and 87% at one and two sigma, on target with no knob.

### The search map reaches 160 m out

**Decision:** The camp's map is still 64 by 64 cells, at 5 m a cell instead of 2.5 m.

**Why:** At 2.5 m the map stopped 80 m from the centre: an intruder who broke contact at 90 m was off the map before the search began, so the hottest cell hugged its edge and searchers stopped short. Coarser cells cost nothing a search can use.

### Competence is measured before pacing

**Decision:** The bench reports the honest brain as it plays (paced, three search slots at alert) and the same brain with every guard free to go.

**Why:** The plan's target is on the brain before the pacing layer throttles it ("Pacing then throttles it deliberately"), and the baselines aren't paced either. Paced, the brain re-finds at about the level of the staleness search, which is the point of pacing. Over 24 runs and 60 s: paced 21, unpaced 23, staleness 21, plain 19, random 5, omniscient 24.

### Lockdown doesn't lapse; a search below it does

**Decision:** A search ends on belief, as planned, at every level below lockdown. A raised alarm stays raised, so a camp in lockdown keeps hunting and never stands down from it. A guard learns the alarm is up from the siren (`sirenAt` in his brain), and only the box's position is in his mind: he doesn't run for a box he has heard sounding, and the target runs for his vehicle only once he has heard it.

**Why:** A review found a search's end dropping lockdown to the camp's floor, and the next plan raising it again, over and over. The design doc has lockdown as how good loses, with no way back from it in a mission.

### What a commander doesn't know, it doesn't know

**Decision:** A guard who finishes a task without a "clear" (he got stuck, a sweep ran out) stays on the commander's books until the order lapses, and the roster puts a guard where he was sent, not where he is.

**Why:** Both look like leaks, and a review flagged them. But the commander reads only what's reported to it: an order given and not reported on is exactly what it knows. A short lapse is the honest cost.

---

## 2026-11-08 · Lab B, shooting

Built on its branch as `docs/phase-1-plan.md`, section B, plans it. Its seed, the seed's shortfall and its targets are recorded there.

### How the lab is built

**Decision:**
- **One ballistic function.** The closed form for one quadratic drag constant per load, worked in the bore's frame (drop on g·cos θ, ½·g·sin θ·t² along the bore), with the lag rule for wind: drift = wind × (time of flight − distance ÷ muzzle speed). The bullet, the zero dial, the reticle's holds, the rangefinder's readout and every assist evaluate it; none integrates.
- **A bullet is its launch.** Its state is where and when it left, its direction, its muzzle speed and drag (at the mission's air), and the time up to which it has been swept; its position at any instant follows exactly. It is an entity, spawned when fired and despawned when it lands.
- **A shot resolves against what the player saw.** The `fire` command already carries the frame's instant and angles; the rifle sweeps the bullet from that instant to the tick's start against the bodies' two ticks of history, in 'commands', then 'projectiles' sweeps each tick's segment against every body part between its two poses, the terrain and the colliders.
- **The rifle and vitals are components a run's setup gives** (the player's `rifle` and `vitals`). The range scene gives them; the valley gets them in Phase 2, when the labs are joined. A click in the valley stays the bare `shot` it was.
- **Sway is sampled at every tick's end** (`rifle.sway`, with two ticks of history, as a body keeps its pose), from pure functions of the state and the time. The camera and the shot read it through one interpolation at the frame's instant.
- **Assist layers are view-only.** Arcade, realistic-lite and simulation differ in what the instruments show, never in the physics, so taste call 3 never changes a recording.

**Why:**
- The research's measurements (`docs/research/notes/labs/ballistics_and_shooting.md`): one Euler step per tick lands 18.5 cm low at 500 m, nearly a head, so a reticle drawn from an exact formula over an integrating bullet would lie. A function with no integration state can't drift from its instruments.
- Resolving the shot against history is the single-player form of lag compensation; the bodies already keep the two poses it needs.
- Giving the valley a rifle now would move every valley golden's state for a feature no bot uses, while labs A and D land beside this one. A loadout given by the setup keeps the valley still until Phase 2 joins the labs on purpose.
- Sway that changes every tick can't be re-evaluated exactly between ticks unless both sides read the same samples; two ticks of history is what the pose already does, so the shot and the drawn reticle agree by construction.
- **The binoculars' wind readout is arcade's only.** The plan's B6 lists a wind readout with the rangefinder; the design doc has the wind read "from flags, grass and smoke, or from the rangefinder on easier settings". So realistic-lite reads the flags, and arcade's readout gives the wind beside the hold. If the owner wants the readout on realistic-lite too, it is one condition in `app/scope.ts`.
- **Bullets and stones survive a save and a restore.** A synctest over the whole range run, saving every 5 ticks, puts saves inside every flight (`tests/shooting.test.ts`): a bullet in the state is only its launch, so nothing else needs keeping.
- **A thrown stone explains itself** (rule 8): the debug view draws the arc it is on, from its last touch to where it next meets the ground, and every touch's `clatter` is already a sound ring at its radius.
## 2026-11-08 · Public

### The repository is public, under MIT

**Decision:**
- `willgibs/sightline` is public, under the MIT License (`LICENSE`, © 2026 Will Gibson). The license covers the code and the documents, and grants no rights to the name Sightline.
- It stays the owner's project. `CONTRIBUTING.md` welcomes bug reports, best with a recording, and asks for an issue before any code. The README is written for people who find the repository.
- Production is public at sightline-brown.vercel.app, the repository's website link, and the README links it. Vercel Authentication covers sightline-willgibs.vercel.app and the previews, not the production domain, so Phase 0's entry below (Version control, CI and a playable link) overstated it.
- Nothing private is committed. The owner's local path is gone from the handoff, and a link only the owner can open, such as the live design doc, says so and points to the public copy.

**Why:** The owner wants people to be able to read the code and play the build, while the project stays the owner's own. MIT is the simplest, most familiar license for that. Art and sound, when they arrive, can carry their own terms.

## 2026-11-08 · Lab C: movement and body

Built on the `lab-c-movement` branch to `docs/phase-1-plan.md`, section C. Lean and the mantle use input the bots never give, so the valley's behaviour is untouched until the prone body (C2).

### The noise and visibility trials (C8), and the player's own light and noise (C7)

**Decision:**
- The exit test's protocol is lab A's, whole (`game/trials.ts`): the four cells, the borderline split by a rules-only predictor, the pairwise spread, the freezes, balanced accuracy, and the verdict over two sittings. It became generic at this second use: a `TrialSpace` supplies the draw, the run, the factor steps, the rule and the words. Lab A's sight trials are one space, and a seed draws exactly what it drew before.
- A noise trial (`scenes/noiseScenario.ts`) is one guard with his back turned and the player on a flat field of one surface, moving for 8 s at one gait along an arc about him, so every step comes from the same distance. A generator hums 5 m or 2.5 m from him in half the trials. "Will he hear you within 8 seconds?" The key comes from running it. A scenario table pins each gait either side of the edge of hearing, and the masking.
- The rule of thumb for noise knows how far a gait carries and the distance. It leaves out the surface and the hum, which are what the world has to show: the ground underfoot, the generator, your own footsteps. Its mistakes go both ways, so reading the gait and the distance alone gets about half the borderline trials.
- Half the noise trials freeze at the start and half after a few steps (2 s), so you have heard yourself on that ground. He only starts listening there: the pre-screen showed that freezing on the first footstep gave the answer away, with his "What was that?" already on screen. A sprint always freezes at the start, since running along the arc you aren't looking at him.
- The visibility half is lab A's sight scenario, drawn for what your own body and light do: one sentry, open ground, shade or the skyline, stance and movement together, distance.
- A sitting is 5 warm-ups and 30 scored, 15 of each kind shuffled together, at `?trials=<seed>&lab=movement`. `npm run playtest` scores it and keeps each lab's verdict apart. `npm run trials -- <seed> --movement --shots` pictures one for the pre-screen.
- C7: the lab's shade is drawn as simulated (lab A's shade map over the arena, held to `groundLight` by a test). Your own footsteps play at their simulated loudness (the browser audio test), and every surface tag matches its drawn material (`tests/surface-audit.test.ts`). The small cue on the body for ambient masking and light from behind isn't built: the plan wants it only if the trials fail without it.

**Why:** Two protocols would mean two ways of scoring that can disagree, and the owner would be sitting two different tests under one name. The rule of thumb is the honest baseline, because "people judge by distance" (the research behind lab A's protocol), and the surface and the hum are what this lab has to make readable.

### The use action (C6): carry, drag, hide

**Decision:**
- G (the `use` command, code 51; the debug view's grid moved to L) picks up the body in reach and puts it down. Standing it rides the shoulder, crouched it drags behind (`carry.speed` 1.6 m/s, `dragSpeed` 0.9): lab B's `remains` gains `carriedBy` and `hidden`. Lab E's sabotage and doors take their place on the same press.
- Carrying is slow and loud: a loaded step at carrying pace is as loud as walking (`noise.carry`); dragging also scrapes each step, by surface, loudest on gravel and metal (`noise.drag`), a new sound event (`drag`, code 51).
- Put down inside foliage or by a container it's hidden: `gameBodies` leaves it out, so guards' eyes and bullets find nothing there. (Lab A's body-finding reads the same flag.)
- Hands full: no mantling, ladders or lying down while carrying; crouching drags it.
- Carried, a body is out of every sight line and bullet: what's seen and hit is its carrier. It's reached on about the carrier's level, with a clear line from the eye. Dragged, it stops short of what's behind the carrier.
- A body is picked up standing or crouched, on the ground, and can be taken out of hiding again. Off the shoulder it comes down at the carrier's feet; dragged, it stays where it trails. Either way it lies on what's under it, not only the terrain.

**Why:** The design doc's "slow, and noisy on gravel" is a choice the player makes when they pick the route; the numbers (no shipped game publishes them) are starting values for the sittings.

### Ladders (C5), and fuzz bots that go looking for trouble

**Decision:**
- A ladder is a motor mode (`body/ladder.ts`): the climb press takes it from its foot or its top, forward and back move up and down it (1.8 m/s up, 2.2 m/s down), and a press lets go. The world's ladders are data (`world.ladders`, same shape as lab D's `LadderSpec`); `ladderLinks()` gives navigation (lab E) the two places each one joins, and how long it takes.
- Getting off the top is a mantle over the edge, checked pose by pose before it starts and every tick after (Half-Life 2's validated dismounts, without the fixed points); getting on from the top runs that same way backwards.
- A world's ladders are its own or its camp's (`laddersOf`): lab D's towers work as built, through the 0.8 m gap lab D left in the rail at the ladder's head. A test climbs every tower of a generated camp to its deck.
- A long fuzz in valleys says little about ladders: three hours of the chaos bot in the lab took a ladder six times. So the fuzz run also plays towers drawn from a seed, ground and clutter varied, with a bot that climbs them (`scene:ladder-tower`, `bots/ladderBot.ts`), and the watch checks that a mantle or a ladder doesn't move into another body.
- The fuzzing bot learned to lean hard into walls, press climb at walls and guards again and again, swing the body around while prone, and pump a ladder. The fuzz run also plays the movement lab (`movement-lab`), where the walls, windows, ladder and moving guards are.
- The chaos bot's new behaviours move `TAL-4471 chaos` and the benches' fuzz numbers; lean, mantle and ladders stay out of every other golden.

**Why:** "No motor mode gets an exception" only means something if the adversarial bots actually exercise each mode, every tick, for hours.

### The prone body (C2): a chain of circles, and the eye at the head

**Decision:**
- A lying body is a chain of circles along its axis (`body/chain.ts`, derived from `parts`: head, torso, legs), pivoting at a point near the chest (`pivot` 0.55 m back from the top of the head), so turning swings the legs and steadies the view. The circles' radii and spacing are chosen so they cover the capsules everything else sees: nothing clear of the chain can be inside the head, torso or legs.
- It grows out of the single standing circle over the stance change (`lying`, 0 to 1), pushing the body away from what it would meet, and stops if it can't; shrinking back is always free. It turns toward the view at `prone.turnRate` (2 rad/s), by the largest step that keeps every part clear, found with 6 bisections.
- It lies along the ground: the head, pelvis and feet rise with what's under them, within what a walkable slope allows, so the body pitches over rocks and banks. Parts within the pivot's own circle can't rise more than the pivot can step.
- The eye is the head's centre when prone too (`eyeOf`), so the camera moves to the head as a body goes down and the rifle's rest is found from the eye. `SIM_VERSION` 8: prone bodies collide as long as they are, and a prone shot leaves from the eye. The pinned runs that lie down moved: `movement-course`, `perception-lab` and `perception-crowd` (the walker ends prone in a bush), `shooting-range` (the marksman shoots prone), and `TAL-4471 chaos` (the bot learned new moves too). The valley's wander runs held, and lab A's trial metrics shifted slightly with the body. Every `state` fingerprint moved with `STATE_SCHEMA` 8.
- Measured with the fuzzing bot, ten minutes on the course and five each in two valleys (`npm run bench`): 548 of 16,869 lying poses have a part of the drawn shape more than 2 cm inside something solid, at worst 16 cm, against 3,258 and 49 cm for the seed's 0.3 m circle. Turning right round between walls a metre apart: 0 poses, against 259 (up to 0.25 m deep).
- Those 548 are the shape's limit, not the chain's. The chain's circles stay within the invariant watch's 0.1 mm, but the head, torso and legs are straight capsules, so a leg lying down a stair or across a ledge cuts the corner it lies over. The plan's target was zero, and it isn't met for the shape; the plan says so. Bending the legs, or lifting the body over the corner, would close it, and is left until the body has a real pose.
- What a circle of a lying body may rest on (a review of #11): `allow` is for ground that slopes. A collider counts as rest only within a step of the feet or of the terrain under that circle (`restBelow`), so a heel no longer takes a 0.8 m bank for the ground and lifts onto it in a tick, nor does crawling into a 0.5 m wall lift the eye 0.5 m. No end of a lying body rises more than a step in a tick, and the invariant watch now holds it to that. The cost is more shallow corner cuts (398 poses over 2 cm to 548) against a shallower worst (27 cm to 16 cm). Rule 10 is a promise and the bench is a measure of the drawn shape, so the promise wins.
- Getting up is checked as going down is. The 40-hour fuzz found the gap (PIF-1492): a lying body's reach onto the rock under its legs shrank as it drew in, so the ledge became a wall it was inside. Now a circle keeps its full-length reach while getting up; a body needs headroom along its whole length to start getting up (legs under a shelf refuse it, so the course's walker crawls on until its legs are out); and it draws in only as far as it ends the tick clear, waiting, eye and timer too, in a slot too narrow to stand in, and able to crawl out of it. The fuzz run also plays the course now, where the crawl space and low ceiling are.

**Why:** A 0.3 m circle standing in for a 1.75 m body is how prone clips in every shipped game that reported it (Arma, Hell Let Loose, Battlefield 2042); the chain makes the body as long as it is, for every promise the motor keeps.

### The mantle (C4): every pose, every tick, and no noise you didn't choose

**Decision:**
- A press of Space (the `climb` command, code 50) starts a mantle, if one can be found; it's never automatic, so its noise is one the player chose (Tarkov's automatic vault is the counter-example). A press stays good for 0.2 s, so one made just early still works.
- **Three probes find the ledge** (The Dark Mod's): forward at nine heights for the face, down for its top, an overlap at the landing pose. Only colliders can be mantled, so the rule that nothing gains height on too-steep terrain holds here as well.
- **Over or onto.** Shallower than `overDepth` (0.8 m) it goes over, if the far side is within `maxDrop` (1.6 m); deeper, or with nowhere to land beyond, it stands on top. The body squares up to the wall it faces, up to about 66° off square.
- **Four eased legs:** reach for the ledge, pull, shift, push down. It goes crouched, so a window that fits a crouch fits a mantle. Heights up to 1.5 m, about 0.6 s for 1.2 m, a little over 0.2 m of rise a tick at most.
- **Every pose is re-checked every tick** against everything solid (no step allowance) and every other body; a pose that isn't clear holds the body where it is, and after 0.4 s of waiting the mantle gives up and the body drops where it is. The Dark Mod validated its endpoint once, and clipped whatever moved in afterwards: on the bench, a walker crossing the landing is met 0 times; the seed path goes through him for 15 ticks.
- **Sounds:** the hands taking hold (a new sound event, `mantle`, code 50), by what they grip: 0.7 × surface × 12 m. Lowered down the far side is quieter than falling from there (`noise.mantle.drop`).
- `STATE_SCHEMA` 8 (taken with the lean, this is the same unmerged bump): bodies keep their mantle; the player's controls keep `climbWait`. No behaviour golden moved: the bots don't press climb.

**Why:** Mantles in shipped games fail by clipping and by surprising the player. Checking every pose, every tick, in every mode is the lab's claim (no motor mode gets an exception); making it a press rather than an automatic vault keeps the noise deliberate.

### The lean (C3): the eye is the centre of the head that's hit

**Decision:**
- A lean moves the head aside about the hips, the shoulders part way with it, and the arc takes the head down a little: `peek` 0.18 m with nothing raised, `weapon` 0.40 m with an optic up (Ground Branch's distinction), `bend` 0.58 of the spine, so a crouch leans less than a stand, `prone` 0.12 m.
- The eye is the centre of the head sphere in `bodyShape`, always, so the camera, a shot and a guard's rays all use the same point. A line from the eye to a guard's head and the line back are one segment and agree bit for bit.
- It grows at 1.4 m/s (`rate`), and a blocked lean goes as far as stays clear, found with 8 bisections. The world can force it back at any speed (a wall the body walks into), but it can't grow faster: a flick of the mouse can't throw the head out, and nothing is hidden.
- Sprinting gives it up. Turning carries the lean with the view; the weapon lean stays below `radius + headRadius`, so a head on a turning body can't pass through a wall the body is clear of.
- Lean is a held input (`input.lean`, recorded since the input's first format): the bots never give it, so no behaviour fingerprint moves.
- `STATE_SCHEMA` 8: bodies keep their lean. Every state golden moved; no behaviour golden did.

**Why:** The lean's reported failures are all about where the eye is: Siege moved the camera to the centre of the head to stop lean-spam, Dishonored hides the lean. Putting the eye at the head that guards target makes every lean honest by construction; the rate limit closes the flick (Siege patched a melee-and-lean input that moved the head almost instantly).

## 2026-11-08 · Lab A: perception and awareness

Built on the `lab-a-perception` branch to `docs/phase-1-plan.md`, section A. Until A13 the lab runs only in its scene (`?scene=perception-lab`) and its scenarios, so the valley's goldens hold.

### Perception joins the valley (A13)

**Decision:**
- **`SYSTEMS` now holds `PERCEPTION`**, in its phases, and the scenes stop listing it, lab E's too (its scenes, baselines, bench and tests, as its notes said they should). A guard spawned in a generated valley gets his senses at spawn (`setup.ts`, by the world's mission spec: its terrain is procedural), so reinforcements will perceive too. Handmade scenes and test worlds stay as they were: a scene gives senses with `giveSenses` to whom it wants.
- **`SIM_VERSION` 9 and `STATE_SCHEMA` 9** (lab C took the 8s). Real play changes (guards notice the player, and turn, walk and search by A7's minimal reactions until lab E's brain), though no pinned run does: the bots never come near a camp in their minute, so no `behaviour` fingerprint moves. Every `state` fingerprint does, for the schema number and the valley guards' senses.
- **Why it's ready:** a bot walking into five valleys' camps for 5 minutes each: every body promise held, guards rose through every state and stood down, and a median tick of 47–67 µs with the 99th percentile under 1 ms.

**What moved:** `SIM_VERSION` 9, `STATE_SCHEMA` 9; every `state` fingerprint; `BEHAVIOUR`; the golden recording; each valley's perception work in the game lane's bench.

### The other stimuli: lab B's sounds, the crack, bodies and lens glint (A9)

**Decision:**
- **Lab B's sounds, by what they are** (`perception/stimuli.ts`): a report, an impact and a bolt are shots, raising a guard to searching, with his attention on where he heard it (a deliberate miss draws his eye to the strike, as the design says). A cry is a voice at the same level, one his own side doesn't ignore. A stone's clatter stays a plain sound, by its clarity: it's a distraction, so he looks and doesn't search, and it never sends the camp hunting.
- **The crack comes from the bullet's path** (`game/perception.ts`, `deliverCrack`, with lab B's `crackAt`): each guard within 160 m of the path hears a shot from where the shock left it, when it reaches him, ahead of the report from the muzzle. So a suppressed shot's crack searches the path's side of the valley, not the shooter's. The path ends where the bullet meets the terrain or a wall (`flightEnd`, for the guards and the speakers alike), and a listener beyond that end hears no crack at all (found by the review: a bullet stopped by a wall cracked at guards past it, from under the ground).
- **A new event, `spotted` (code 16), for what a guard catches sight of that isn't a person** (`perception-spotting`, in 'perception' after sight and hearing):
  - A body is seen by the same law as a body lying still (`exposure`: its zones, caps, rays and foliage), and is news once per guard. One falling in plain view is seen falling, since it stands for the first moments of its collapse. It raises him to searching (the strongest stimulus), with a shouted "Man down! Man down!" that raises whoever hears it. He keeps it in mind for 2 minutes, and lab E can read it from his percepts.
  - A flash from a lens (lab B's `glint`, with the mirror's condition against the sun) is seen by a guard looking that way, in his core cone or a marksman's far one, up to 600 m with a clear line, when its glint is at least half. It's news when it starts, and raises him to suspicious.
- **The sandbox can drop a body** (`bodyDrop`, command 11; L in the debug view; `sightline.dropBody()`), already down, for a guard to find, as the design doc's sandbox line asks. The noise drop moved from X to K, because throw took X.

**Why:** the design's "What gives you away" list, each by the law that already applies, so a player who has learned sight and hearing has learned these too.

**What moved:** the perception lab's and the crowd's `state` fingerprints (`a568f302cd499718`, `869e55ebeb231e6b`), for the new fields of a guard's senses; their behaviour didn't move, since no body or rifle is in those scenes. The tuning gains the levels, so the golden recording is rewritten. Open doors (D4) wait for lab D's code on `main`.

### Trial mode: the exit test, built into the lab (A12)

**Decision:**
- **A sitting** (`?trials=<seed>`, `sim/game/trials.ts`, `app/trials.ts`) is the plan's protocol: 5 warm-ups whose outcome is shown, then 30 scored trials, none shown until the end. Each trial is a sight scenario: you, a guard who reacts as he would, 8 s, and a brief of what you'll do ("You crouch-walk behind the low wall, 60 m from a sentry"). It freezes at the start or at the first cue (his meter at 30%, plus 0.3 s for his head to start turning) and asks Y or N: will he see you? Every trial is a run of its own, recorded with the answer as an annotation; the results screen scores the sitting and saves it as a file.
- **The key is the simulation's.** Each candidate is run: seen or not, when, its first cue. It is **borderline** when one step of one factor toward the other outcome flips it, and every factor that does is recorded, for item analysis by factor (counting only the first, in a fixed order, credited stance with 41% of the flips and the skyline with 0.3%; counting every flip, the skyline flips 3 of the 30 borderline trials in the bench's two sittings, and stance 18).
- **The borderline trials are split by the sight table.** The research's rules-only baseline (the table applied to distance, stance and light, with no cues) proved strong: on sittings drawn without the split it scored 71% balanced on average and up to 86%, and 67% of the borderline trials. So each borderline cell holds as many trials the table gets right as wrong, and the table alone gets 7 of 15; the bar of 21 of 30 then can't be met by knowing the table, only by reading movement, cover, the skyline and the cues. The comparison with the baseline is on the borderline trials (docs/research/foundations.md): 3 more right of the 30 than the table alone.
- **The trials are spread over the factors**, as the research advises for "before the first sitting". Each cell gathers three times the candidates it needs, and the sitting takes those that add the most new pairs of factor levels, a greedy pairwise covering array over the guard, his gaze, the distance, the stance, the movement and the spot (light, cover and skyline are one draw), with the outcome and the kind of trial among the levels, so a surface feature, shade for instance, doesn't come to mean one or the other. The bench's first sitting covers 192 pairs against 165 taken first come. The warm-ups show all four combinations of seen or not and frozen at the start or at the cue.
- **The freeze doesn't tell (found by a review of this pull request).** Every seen trial reaches the first cue and most not-seen ones don't, so freezes taken where a cue existed made "frozen at the first sign" mean yes (77% seen) and "frozen at the start" mean no (30%), and a reader going by that alone scored 73%. Now each not-seen cell gathers trials that reach the cue, and each freeze kind holds the same share of seen and not seen (8 of 15, within clear and borderline, 53% either way), so the freeze alone scores 50%. The two kinds are also scored apart, as the research asks, since only the first-cue ones test reading the cues. The first cue's time still says a lot: a meter that reaches 30% early reaches 100% in time. A reader of that alone, with the table on start-frozen trials, scores 73% and fails the verdict; whether reading it counts is the owner's call, and is asked in the morning note.
- **The probe:** a trial frozen at its first cue then asks what told you (the mark, his head, his voice, the situation alone; Space skips). One tap, and it never gates. The results say how often each was named and how often that answer was right, and how often a cue was named that the simulation says couldn't be read.
- **Nothing is lost to a reload (found by the review).** Answers live in this browser's storage as they're given, and a reload picks up at the next question (`&fresh` starts over); the page asks before leaving an unfinished or unsaved sitting, in deployed builds; the sitting's file can be saved repeatedly; Y and N are ignored for 250 ms after a question appears (a double-tap) and with Ctrl, ⌘ or Alt held.
- **Scoring survives later builds (the review).** Each answer's annotation carries its key, so `npm run playtest` scores a sitting whose recordings this build can no longer re-simulate, or a sitting file whose tuning it can't use, and says what it couldn't check; a recording that contradicts its key is still a failure. The latest two sittings are by when they were played, not by name, and runs begun in the same second keep their own names.
- **The review:** on the results, R plays back the trials answered wrong, each with what happened and which single steps would have changed it. It's the research's cued retrospection, on a deterministic replay of the trial itself; nothing played in it is kept.
- **The verdict** (`verdict`) is the plan's four conditions over two sittings. The bench measures it against readers of known skill, 4,000 pairs of sittings each, beside the plan's first rule (48 of 60 right): a reader right on every clear trial who guesses the borderline ones passes 2.0% of the time (the first rule: 17.4%, the research's 18%); a reader right 80% of the time passes 50.9% (58.6%, the research's 57%); one right 90% of the time, 99.0% (99.5%).
- **`npm run playtest` scores sittings** from the answers their trials' recordings hold, generating each sitting again from its seed with the recording's own tuning and checking every recording against its trial; and from sitting files (`sitting-<seed>.json`, which carry their tuning), the record of a sitting played on a deployed build, which keeps only its last few runs. With two complete sittings it gives the verdict. In trial mode every trial's run is kept, however short.
- **The agents' pre-screen** (`npm run trials -- <seed> --shots`): every trial's freeze frame as the honest view draws it, with a manifest of what the simulation recorded there (whether the indicator shows, where the guard's eyes are drawn, whether his head can be read: at least 2 pixels, nothing solid between, foliage letting through 15%). The first pre-screen, of sitting PRESCREEN-1, passed its perception check (the guard where the manifest puts him, and the indicator wherever it says, in the frames checked) and found two things:
  - **The first cue's mark was invisible on a pale sky:** a cream arc at 40% opacity, luma 208 on a sky of 198–206. It now has a dark keyline and starts at 75% opacity (`app/cues.ts`).
  - **The bush hid less than the record said.** From inside a bush the view draws the guard with 18% of his contrast, as the simulation's transmittance there (0.17–0.21) says, and he plainly reads; the record's threshold was 50%. It is now 15%.
  Its findings change no trial: a trial is only ever dropped where the simulation shows a cue missing, and the generator already does that.

**Why:** the exit test is the owner's, and it should measure readability, not knowledge of the table; a test of a test (the readers) is cheap here because the simulation is the key.

**What moved:** the perception bench gains the trial metrics. No golden: trial mode runs only in its scenarios.

### The budget: sixteen guards perceiving (A11)

**Decision:**
- **The perception crowd** (`perception-crowd`): the lab with sixteen guards perceiving (the camp's most: eight sentries, seven on patrol and the tower, two marksmen, a worker), pinned in the perception bench, so its work is a budget: 34 rays a tick for sight and, over the 90 s walk in, 371,207 grid nodes for hearing.
- **Measured:**
  - in Node, per tick: median 0.14 ms, 99th percentile 1.9 ms, worst 5.5–7.8 ms (a burst of barks);
  - with `npm run scene -- perception-crowd --profile`: sight 107 µs, awareness and hearing 35 µs, the motor 37 µs;
  - in headless Chromium: 131 µs a tick, from `tests/browser/budget.test.ts`, which CI also runs in Firefox and WebKit;
  - against a 33 ms tick, and about 10 ms of a 60 Hz frame's own work.
- **One fast path, because it was needed:** a sound's flood goes no farther than 25 m along its path (`hearing.floodReach`). Beyond it a sound arrives by the straight line alone, which in the open is the same answer, and through walls loses 12 dB each. A shout's whole 60 m flood took 12 ms, and two in a tick 24 ms; now about 2 ms.
- **Fast paths already there:** a distant guard skips perception, because a body beyond every zone's farthest possible reach costs no rays. The world's steady sounds are flooded once, at the scene's setup, outside any tick.
- **Not needed:** a still body skipping the motor (lab C's), since the motor costs 37 µs for 17 bodies.

**Why:** rule 18's budgets are counts, pinned; time is a trend, reported.

**What moved:** the perception crowd joins the pinned runs (`e106e06750770ec4`, state `21e67f0f78200c87`), which moves `BEHAVIOUR`. Nothing else.

### Sandbox drops and the time scale (A10), and where other stimuli plug in (A9)

**Decision:**
- **A noise drop is a command** (`noise`, code 10): pressing K in the debug view (X until lab B's throw took it) drops a noise where the view points, carrying the moment and the view of the frame on screen like a shot, so it lands where the aim was at any frame rate. The `sandbox-drops` system (the game's, in 'commands', after the player's own commands) casts along that view from the eye at that moment and makes a 30 m noise where the line lands, heard by the law of sound. It is input the bots never give, so it joins `SYSTEMS` without moving a golden, and a recording replays it.
- **Automation:** `sightline.noise()` drops one; `sightline.timeScale(x)` sets the debug view's fast-forward (0.25× to 8×).
- **A9's wiring point** (`perception/stimuli.ts`, `HEARD_AS`): what each sound event is heard as, which sets what it raises a guard to. Lab B's report, impact and bolt become shots and its cry a voice when they land; a body, a comrade dropping, a thrown object, lens glint and an open door come in through `stimulate` at their levels when B4, B6, B9 and D4 are on `main`.

**What moved:** nothing. `SYSTEMS` gains `sandbox-drops`, after lab B's `rifle` in 'commands' (it reads the bodies the rifle may change); the spawn-tick scene's system in 'commands' declares its order after both (the same order as before).

### Cues in the honest view, and the fairness checks (A8)

**Decision:**
- **On the guard:** his head and body turn toward what caught his attention (A7's reactions), and his rifle comes up with his awareness: slung while unaware or curious, at the ready while suspicious or searching, shouldered at his eye in combat. The snapshot carries his rung of the ladder; at 300 m through a scope, the rifle carries it.
- **Barks** (`perception/barks.ts`): a line on each rise of the ladder and on settling, from specific to generic (Blacklist): the line that fits why he changed ("Footsteps. Close.", "Something moved out there."), unless he said it within 8 s, then his state's generic one ("Who's there?"). Each is a voice, heard by the law of sound (22 m, a shout 60 m), and raises the guards who hear it to its line's level: "Contact! There!" brings others to suspicious. Lines are only added at the end: a recording stores a line by its index. The speakers play a murmur of syllables until voiced lines (Phase 3).
- **The detection indicator at the screen's edge** (`app/cues.ts`): for every guard at the cue (30%) or above, a mark on an ellipse just inside the screen's edge, toward him, wider, thicker and warmer as his meter fills and his awareness rises, solid red at 100%. Nothing below the cue.
- **Captions:** a guard's words, only when they reach your ears by the law of sound, with an arrow toward where they came from.
- **Explained afterwards:** `describe` and `explainChain` (`perception/explain.ts`) say each event of a chain in words with the numbers that decided it; the debug panel's perception section shows each guard's state, meter and belief and the last change of awareness explained back to what caused it; `sightline.explain(id)` and `sightline.perception()` for scripts.
- **The fairness checks** (`tests/fairness.test.ts`), over the lab's own run and a seeded zig-zag through it: every detection's cause is its first cue, at least 1.5 s before outside contact; every change of awareness is caused by a percept of the same guard ('noticed', 'detected' or 'heard'), or is a calm stand-down; every 'heard' by a sound; every bark by an alert; every detection reads back, in words, to its first cue.

**Why:** the design doc's three telegraphs (a head turn, a bark, the meter at your screen's edge) and its rule that every detection can be explained afterwards. Barks run specific to generic so the player learns the cause without hearing a memorable line twice.

**What moved:** the perception lab's fingerprints (`da54eed00707a631`, state `f9afc16fbdc72c64`): at tick 353 a guard's bark reaches another, who hears it and rises (`npm run explain`). Its sight bench rays 25,723 → 26,033, and awareness floods 60,480 grid nodes. Nothing in the valley, so no version moves: until A13 perception runs only in the lab's scenes, which recordings name.

### Shade and foliage, drawn as simulated (A4)

**Decision:**
- **The ground's shade is the simulation's.** A world that draws its shade names an area (`world.shadeArea`; the lab's camp, field and ridge at 0.5 m). The renderer fills a map of `groundLight` at each texel's centre (`perception/light.ts`, `shadeMap`, 0.7 s once per world) and the terrain shader reads it bilinearly, lit at half or more, dropping the direct sun in shade. `drawnLit` is that read on the CPU: at 20,000 points over the area the drawing agrees with the simulation at 19,982 (99.91%), and at 6,000 points within 1.5 m of a shadow at 5,810 (96.8%), where only a texel's reach can differ.
- **Bodies are lit as the simulation finds them:** the snapshot carries the light beneath each guard and the player (computed where the world draws its shade), and each is drawn in sun or in shade.
- **Foliage is drawn from the same volumes by the same law:** each bush and canopy, by its back faces, solves its chord along each pixel's line of sight and draws opacity 1 − exp(−density × chord). Lying in a bush you see out through as much bush as a guard sees in through. A body standing inside foliage is drawn undimmed (the drawing doesn't know what is in front of the back face), the one place it understates.
- **Fog grows with distance from the eye**, in our shaders and in three.js's own chunk: a guard's contrast against the haze no longer changes as you turn.

**Why:** shade multiplies detection by 0.6 and nothing drew it (the plan's gotcha); a light gem would tell the player what the world should show. A GPU shadow map would agree only up to its bias and resolution; drawing the simulation's own answer agrees by construction, up to a texel.

**What moved:** nothing simulated. The snapshot gains three fields per guard (light, meter, awareness, the last two for A8) and the player's light. The lab's world gains its shade area, so its fingerprint moved (recordings of the lab from before refuse, by design).

### The awareness ladder and its minimal reactions (A7)

**Decision:**
- **Two kinds of evidence.** The sight meter, and the evidence other stimuli leave (a footstep raises a guard to between 0.3 and 0.62 by its clarity, a shot to 0.8), on one scale with the design doc's thresholds: curious 0.3, suspicious 0.55, searching 0.8; combat only from the meter at 1, a confirmed sighting.
- **Rises wait for the dwell** of the state they rise from (curious 0.6 s, suspicious 0.8 s, searching 0.6 s), one state at a time: something alarming reaches searching in 1.4 s, telegraphed by curiosity at once. A confirmed sighting leaves searching-level evidence for when he loses you.
- **Falls step down one state at a time** after the state's ramp-down (curious 6 s, suspicious 10 s, searching 20 s, combat 30 s), each varied ±25% from the guard's own stream. Evidence explains a rise but holds nothing up: only sight at the state's level, or a fresh stimulus of it, moves the fall back.
- **Grace periods** of 2.5 s ignore weaker stimuli unless one beats the last rise by 25%, or three arrive, which counts as a rise of 0.2: repeated footsteps escalate, single ones don't stack.
- **Sharper after a search:** a guard who searched settles at unaware with a floor of 0.15 under every stimulus and eyes 1.25× quicker.
- **Minimal reactions** (`brain/react.ts`), until lab E's brain: curious, stop and look (the head first, the body when it must); suspicious and searching, walk (1.5 m/s, 2.2 m/s) to where he believes it was and look around there; combat, face where he believes you are; unaware, back to the routine. A guard on a tower looks from it and never walks off.
- **Every change is an event:** 'alert', with its from, to, reason and the percept that caused it.

**Why:** Thief's filtered rises and capacitor-like falls and The Dark Mod's grace periods are the strongest open ladder; the design doc asks for a raised baseline and a 1.5 s reaction window. Stale evidence holding a state up kept guards searching forever: the tests caught it.

### Percepts and beliefs (A6)

**Decision:**
- **Percepts are records:** kind (sight, sound, shot, voice; body, impact, object, glint and door to come), place, radius of uncertainty, strength, the tick sensed, the tick it lapses, and its cause. A guard keeps at most eight live ones.
- **Beliefs:** the mind holds the last known position with its uncertainty: from sight (a fix within 0.5 m plus 1% of the distance), or from a heard guess, whichever is surer, its radius grown at 1.5 m/s as it ages. Seen at 100%, it is confirmed.
- **The mind** (`brain/mind.ts`) gains the head's turn, the percepts, the awareness (state, since, focus) and the belief. A guard without senses has the empty ones, so the valley's brains decide as before.
- **No-omniscience, for guards who perceive:** the valley with every guard's senses on, the player at two corners over 600 m from any guard (beyond a marksman's far zone against the sky) for the whole run: every guard has the same mind on every tick, and decides the same. A peeking brain is caught at its first decision; a run with the player near the camp shows minds that differ, which is perception doing its job.

**Why:** a percept never says who made a stimulus, and a belief comes only from percepts, so a guard can be wrong exactly where his senses were.

### Hearing: one law for the guards and the speakers (A5)

**Decision:**
- **Two routes, the louder wins.** Around: one bounded flood over the site grid per sound (W0.5's search, its radius as the cost limit, 120,000 expansions at most), read at every listener's cell. Through: the straight line, losing 12 dB for each full-height wall (counted against the colliders, by the grid's own rule, so a wall thinner than a cell counts and sound passes over a crate) and 15 dB where the ground is in the way.
- **Masking:** the steady sources (`generation/ambient.ts`), heard by the same law and summed as power, raise the threshold to 17 dB below them. Their floods are made once per world.
- **A guess, not a fix:** a sound around a corner seems to come from the last cell of its route the listener can see (the doorway); its place is blurred by 0.5 m, 8% of the distance and 60% of the detour, drawn from the guard's own stream. It arrives at the speed of sound along its route.
- **Sides:** a guard ignores his own side's footsteps, never a voice.
- **The speakers ask the same function** (`audio/hearing.ts`): level, the place it seems to come from, its delay along the route, muffled through walls; the steady sources too. The bench compares 200 random sounds and listeners: none differ by a bit.
- **The crack** (`perception/crack.ts`): from a bullet's flight, the point whose shock reaches a listener first, cos φ = c / v. On a path slowing from 790 m/s, listeners 5–15 m from it at 300 m hear it 55.4–57.2° off the shooter. It is wired in when lab B's shot sounds land (B8). The plan's recorded target said 5–20 m: at 20 m the shooter's own bearing sits 3.8° off the path, giving 54.6°, so the target now says 5–15 m.
- **Barks are delivered by their system:** a sound made after 'perception' (a bark in 'awareness') reaches listeners through `deliverSound`, since the tick's later events reach no reader.

**Why:** Mark of the Ninja fed one path to its AI and the player's audio; Thief's doorways and Siege's muffled second route keep hearing honest round buildings; Dungeon Crawl Stone Soup's integer flood is exact and cheap. The old speakers' straight-line muffle let you hear what a guard where you stood couldn't, and the reverse.

**What moved (A5–A7):** the perception lab's fingerprints (`0dfa42645814f21a`, `6625deddfd28368b`): guards now hear, react and fall back. Nothing in the valley.

### The scenario runner: scenes with parameters, and the factor-grid sweep (A3)

**Decision:**
- **Parameters join a scene's identity.** A scene can be made from parameters (`SCENES[name](params)`); a recording's header names them (`scene: { name, version, params }`, format 11), and re-simulating makes the scene again with them, refusing a scene made with others. `?scene=sight&params=...` plays one in the browser.
- **The sight scenario** (`game/scenes/sightScenario.ts`): one guard with a fixed gaze and the player in the lab, at a spot (open, shade, bush, wall, crest), a distance, an angle off the gaze, a stance and a movement, with the outcome it should have. The player circles the spot, so speed and distance hold. Its first table (`SIGHT_TABLE`) is the design doc's ranges and their neighbours either side of each edge: 14 rows, all as expected. `npm run scene` runs every table; `npm run scene -- sight --params ...` one row.
- **The factor-grid sweep** (`perception/sweep.ts`) runs the rate law, split from the geometry as `exposureRate`, over every combination of distance, angle, stance, movement, light, cover, sky, zones and sharpness: 2.7 million neighbouring pairs, none filling slower with more exposure. It reports the design's fixed points, the least time from cue to 100%, and the steepest edge per metre and per degree.
- **The seed is a rate law too** (`perception/seed.ts`): Blacklist's zones with hard ranges and the table as one product of rates. The bench sweeps it on the same grid.
- **Movement ramps with speed:** from still at rest to moving at 1 m/s, then from moving at the body's walk to sprinting at its sprint. It was a step at 0.2 m/s, a cliff the table runs found when a pacing player slowed to turn.

**The bench (perception lane), ours against the seed:** standing and walking, seen to 155.75 m (seed 150); still, prone, in cover, 46.75 m (seed 150); crouched and walking in shade at 30 m, 5.33 s (seed 8.89); a marksman's far zone, 405.75 m (seed 400); least time from the first cue to 100%, 1.5 s (seed 0.47); steepest edge 0.12 per metre and 0.11 per degree (seed 0.30 and 0.95, its cliffs measured at 1 m and 0.5° steps); monotonicity violations 0 of 2.7 million (seed 0).

**What moved:** `RECORDING_VERSION` 11, so the golden recording is rewritten. The perception lab's behaviour fingerprint (`ec5e3044c2701e84`), from the movement ramp; nothing in the valley.

### Sight: zones, caps and rates, with ramped edges (A2)

**Decision:**
- **How the table is read** (owner, Nov 7, made exact): each zone has a range for the reference body (standing, walking, lit, in the open): core ±30° to 150 m, peripheral ±60° to 25 m, and a marksman's far zone ±2.5° to 400 m. The most inclusive zone at the body's angle sets the rate. **Stance, light and the sky behind are range caps**; **movement and the share of the body in view are rate factors**. Inside a range the meter fills in 2 s at the eye growing linearly to 8 s at the edge.
- **Every edge ramps:** a cone's over 4°, a range's over 8% of it (2 to 12 m).
- **Telegraphed by construction:** outside a 2.5 m contact zone the rate is capped at 0.7 / 1.5 s, so the first cue (30%) always comes at least 1.5 s before 100%. Inside contact, a body is noticed in any direction, in 0.8 s.
- **Each part at its own range.** Rays go to head, chest and feet (weights 0.2, 0.5, 0.3), each through foliage; a part with open sky behind it is seen up to 1.5× farther. Summing parts, rather than scaling the range by the sky's share of what's visible, keeps the model monotone: more of you in view never fills more slowly.
- **Sky ramps too:** a line on past a body counts as sky as it rises through level (±0.5°), and ground behind it counts partly from 750 m and fully past 1,500 m.
- **One ray is enough** to start the meter, in every stance: the share in view already slows a sliver, and a minimum would be a cliff. The minimum stays a knob in tuning.
- **Light is the ground's** beneath the body (owner): the environment's light 5 cm above the feet, with foliage between it and the sun casting shade where it passes less than half.
- **A distant guard skips perception:** a body beyond every zone's farthest possible reach costs no rays.

**Why:** these read the design doc's four fixed points exactly. Standing and walking in the open: 150 m. Still and prone in cover: the prone cap is 45 m, so never beyond 50 m, and slowly within it. Crouched in shade at 30 m: a 54 m range, 5.3 s. A marksman: 400 m. Making movement a cap as well would put a still, crouched body in shade at 22 m, contradicting the third point.

**What moved:** nothing in the valley. The perception lab joins the pinned runs, in the perception lane's bench (`1a1c65ab2888e504`, `2d76d43f31015522`), which moves `BEHAVIOUR`; the tuning gains `perception`, so the golden recording is rewritten.

### Foliage dims sight the same both ways (A2, drawn in A4)

**Decision:** foliage is a set of volumes (cylinders for bushes, cones for canopies) that a line passes through with transmittance exp(−density × chord). `Foliage.transmittance` orders its two ends before computing, so it is symmetric to the bit; a test checks 4,000 pairs. Volumes are a world field the perception lane adds by augmentation (`world.foliage`). The valley's bushes are still opaque sight colliders and its canopies block nothing: they become volumes when perception joins the valley (A13), with generation.

**Why:** today a bush hides you without blocking your view out, and a canopy hides a guard from you but not you from him. One law in both directions removes both.

### Systems read the tick's events (A2)

**Decision:** `TickContext.events` is the events emitted so far in the tick. A system that reads them declares `events`, and the kernel refuses one in the same phase as a system that emits unless they're ordered. Perception takes stimuli from it (footsteps, shots, barks). Events emitted in a later phase reach no reader: what must outlast a tick goes into the state.

**Why:** events are the labs' contract, and perception is their first consumer inside the simulation.

### The perception lab (A1)

**Decision:** a camp at the west end of a 520 m field (`game/scenes/perceptionLab.ts`): a sentry sweeping the field, a patrol on the perimeter, a marksman on a 6 m tower sweeping his far zone across it; low walls at 30 m and a chest-high wall at 60 m; crates; a shelter, a tall wall and a conifer for shade; bushes and the conifer's canopy as foliage; a ridge 70 m north whose crest the camp sees against the sky; gravel round the camp and along the track; a generator. Low hills close the lab's edges, so no line ends in false sky at the world's edge.

**Why:** every factor of the sight table and of hearing has a place to be tried, and the scenario runner (A3) measures in its open field.

## 2026-11-08 · Lab D

Phase 1's camp generator (`docs/phase-1-plan.md`, section D), built in the generation lane.

### The exit test so far: what the reviewers' plans showed

**Reviewers.** Three fresh agents that never saw the generator planned ten held-out camps (series `lab-d-review`, as built before the fixes below) from what recon would show: the layout, the ridges, the guards and their timing, each in its own order and under its own letters (`npm run plans -- --briefs`). Each wrote each camp's best plan as a signature. `--evaluate` then took every plan at its word: `writtenShots` checks that the guard it names can be shot as it says from a perch in its sector and band, and lab B's scripted marksman fires it in the simulation.

- **The plans work.** 29 of 30 on D's model. Of the 28 rifle plans that fired, 24 dropped their guards; 3 of the 4 misses were one perch a body slides off (below), and one shot grazed a wall the model's 1 m cells call clear. The one way in a reviewer chose was checked on D's model only. Guards don't answer a shot until lab E, so "nobody saw him fall" is still D's model.
- **The reviewers agree.** Pairs of reviewers matched on three of four fields on one camp 19 times of 30.
- **The plans are not "clearly different" by the plan's own test.** 29 of the 30 plans are the same kind: shoot the target from a ridge while he's out on his walk, when nobody is watching him. `split` is "window" in 23 of them and `tool` is "rifle window" in 22, so two camps match on three of four fields as soon as they share a ridge side or the target's side. Within one reviewer's ten plans, 7 to 12 of the 45 pairs of camps share a signature (the bots' best plans, which take a camp apart, stay 9 of 10 distinct). Run on another camp, a reviewer's plan is clearly worse (0.1 riskier, or impossible) in 64 to 71 of 90 cases, so the plans do depend on their camps; they are the same *kind* of plan.
- **Why:** the design doc requires every camp to offer each approach, so the generator guarantees two perches that hold the target in view 10 s a cycle, and the brief asked how to eliminate him and get away. With no answer to a shot yet, that shot is the best plan almost everywhere. Whether a camp should steer players away from it is the owner's call; the review is left as it is rather than re-tuned against.

**What firing them corrected:**
- **A perch is ground a body can lie on,** at most 40° (`gen.analysis.perchSlopeDeg`; the motor's limit is 42°). Perches came from the terrain's skyline alone: on the review set 58 of 320 (18%) stood on ground too steep to lie on, and a shooter placed there slides off. Rules were being satisfied by places no one can be.
- **A perch's eye is the body's prone eye** (`gen.sight.proneEye`, 0.32 m; it was 0.5 m).
- **The reviewers' briefs gave facings as world bearings** beside positions in the camp's frame; one reviewer worked it out from the sweeps. Now in the camp's frame, for later runs.

**Lab C:** a climber at the top of a tower's ladder can never step onto the deck: the rail is too tall to mantle from there. The rail on the ladder's side now has a gap at the ladder's head (`gen.compound.ladderGap`, 0.8 m, as lab C's checks ask). Whichever of #6 and lab C's ladder lands second confirms a climb ends on the deck.

**Measured after those fixes, on a fresh series** (`lab-d-exit-3`): 97 of 100 at the first camp attempt, 3 repaired or rebuilt, none invalid, in 2.2 s a camp (p95 3.5 s, the slowest 13 s); first-attempt failures: perch coverage 2, perch witnessed 1. Over those 100:
- the bots' best plans fall into 36 distinct signatures (long range 40, infiltration 13, systems 1);
- the sightline graph ranges from no clusters to 3, with hard cores from 2 to 7 (22 above the intended 4);
- 88 certified ways in held when walked through the simulation (94 on the series before). The margin decides it: of the 42 ways that peak under 75% on D's model, 41 held; of the 58 close calls, 47.

The review set rebuilt on the fixed generator: the bots' best plans 8 of 10 distinct, 77 of 90 clearly worse elsewhere, 10 of 10 ways in held. The reviewers weren't asked again: their finding is about kinds of plan, which these fixes don't touch, and it waits on the owner.

**What moved:** nothing in Phase 0's valley, and no version: no recording on `main` has a lab D camp yet. The `camp-systems` run moved with the camps (`e5c646c959574b12`, state `d922e4245070fa08`), the tuning gained two values, so the golden recording is rewritten, and the generation bench's busiest search is 75,249 of 400,000.

### Validation and repair: the rules, built in first (D8)

**Decision:**
- **Validation** (`generation/validate.ts`) reads the analysis and says how far each rule is from passing. Every perch rule is checked over the whole list of perches. Coverage counts the plan's way (a guard's time in view over the cycle), or a minimum time in view (15 s a cycle), never "ever in view".
  - **Three approaches.** Long range: two perches that each see half the guards and the target for 10 s a cycle. Infiltration: a certified way to a close shot. Systems: an unseen way to the generator, which powers an alarm or the radio.
  - **No unsolved cluster.**
  - **No single perch.** At most 60% of guard time and 25% of the target's. And a shot from a perch that sees two guards or more must be witnessed by someone it can't see, unless it's timed. That one is resolved over time: at a moment the perch sees the guard, another guard would see him drop, and the perch can't see that other guard then, for at least 3% of the cycle. (Counted per guard over the whole cycle, as first written, a patrol who passes behind a building never counted as out of view, and 17 of 40 camps failed.)
  - **Companions.** Every perch is overlooked by a marksman post, or a counter-perch, or by ground the camp can walk to with a clear line within 450 m (the research's reading: "a ground position a counter-sniper team can reach"). No alarm box or antenna in the fire of a perch that sees 40% of guard time. And the escape: **the best overview** is the perch that sees the most of the camp's ground, and it mustn't have the target in view for 1.5 s on his run from his door to his vehicle; another perch must, or his vehicle can be reached unseen and sabotaged (the design doc's "crosses a perch's sightline or passes a sabotage point").
    - The run is what matters because the research's reason for the rule is Hitman's evacuation exploit: a camper triggers the escape and shoots the target on the run; the vehicle is "fast or armoured". Measuring the whole route had the best overview seeing 54–93% of it, in every camp.
  - **Two ways out,** leaving the raster at least 40 m apart, from the shot with the intruder's meter at rest.
  - **At most 16 guards,** by count.
- **Solution first, again.** Perches come from the terrain alone, and viewsheds from the first raster, so the generator builds to the rules rather than repairing into them:
  - **Fixtures** (`placeFixtures`, after a first raster and viewsheds): the antenna is a 2 m whip on the most hidden wall (of the radio room, else the nearest building, else indoors beside the set); alarm boxes go on hidden walls or, if none, just inside a door. "Hidden" is judged against the overviews first: perches that see at least 30% of the camp's ground.
  - **The escape vehicle** is parked 6–22 m from a door of the target's building, on the spot that best hides his run from the best overview and shows it to another perch.
  - **The target's walk** (`staffing.ts`) is chosen against the perches: the spot indoors the fewest perches see; his errand the first that keeps every perch within the limit and lets two overviews have him 10 s; re-chosen once every guard is placed if the perches seeing half the camp don't have him.
  - **Workers and the officer** wait a pace inside their doors, watching out through them (the officer's two stops are the target's door and the barracks door), and while a perch comes within 2 points of the coverage limit, the post it sees most moves to the nearest ground none of the perches over the limit can see.
- **Repair** (`repair.ts`) is the bounded greedy search the plan names: a fixed list of local operators (shift a patrol's phase, turn a post, move a post along its arc, move a post out of an offending perch's sight), each attempt on its own labelled fork, kept only if the camp comes closer to valid (fewer rules broken, then by how much), stopping after 12 re-analyses. Swapping a module and adding cover are left for when these prove too weak (they weren't needed); re-timing a light circuit changes nothing under D's daylight sight law.
- **A camp repair can't save is rejected** and built again from fresh forks, up to 3 times (the design doc: "repaired or rejected"). `seeds --camps` reports first attempts, repairs, rebuilds and each seed's margin.
- **Difficulty comes from clusters, too:** the largest sightline cluster runs from 2 to 3 and the hard core from 3 to 5 across the difficulty range (they were fixed at 3 and 4; the default, 0.5, is unchanged).
- **Four corrections to D7's model, found by running ways in through the simulation** with lab A's real perception (`npm run plans -- --simulate`):
  - A step of a cell now takes 5/9 s, a crouched pace of 1.8 m/s (it was 0.5 s, faster than a body can follow).
  - A tower is open under its roof: its deck and parapet count as solid, only its roof as the overhead slab, and perches see a guard on a deck by the direct line. Before, a marksman's own tower blocked his sight and hid him from every perch.
  - A thing in the raster fills the cells whose centres it covers, or, if thinner than a cell, the row its centre line runs through. Stamping every cell it touched hid the intruder behind things that only clipped a cell, which is the wrong way for a certificate of stealth to err.
  - A certified way in may fill the meter only to 85%: the two models differ a little (a patrol's gaze as he walks, how fast a meter falls), and paths that peaked at 90–95% in D's model were sometimes completed in A's.
  - With these, every way in of 20 camps run through the simulation held (no guard reached 100% before arrival), against 3 of 6 before them.
- **A greedy search first.** Validation only needs to know a way exists, so the analysis runs the search with its distance estimate weighted 40 times, and falls back to exact A* only if that runs out of budget. (The exact search stays the tested one: on 400 small camps it agrees with brute force.) Exact searches ran out of their 400k expansions on camps where a way exists; the greedy ones find it in 10–100k. A camp's generation dropped from 4–30 s to about 2 s.

**Measured, on series nothing was tuned against** (`npm run seeds -- --count 100 --from <series> --camps`): the first held-out series, `lab-d-exit`, gave 86 of 100 at the first camp attempt, the rest repaired or rebuilt, none invalid; 12 of the failures were perch coverage at 61–65%. The officer's stops moved indoors as a result, and a fresh series, `lab-d-exit-2`, gave 97 of 100, 3 repaired or rebuilt, none invalid, in 2.1 s a camp (p95 2.6 s, the slowest 21 s). Over those 100:
- 94 certified ways in held when walked through the simulation with lab A's real perception (nobody reached 100% before arrival);
- the bots' best plans fall into 32 distinct signatures (long range is the best plan in 63 camps, infiltration in 37);
- the sightline graph ranges from no clusters to 3, with hard cores from 2 to 9 (the 28 above 4 are more than staffing's limit intends: a tower's marksman, now seeing properly, joins groups that staffing's placement estimate allowed);
- on D's model alone a single perch can take 6 to 10 guards, one by one, given time. That model has no reaction to shots: the camp's answer is lab E's half of "one overlook mustn't clear a camp" (its exit test, a perfect shooter on the best perch failing).

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its staffing (`f1c3cabd3c2f6ab7`, state `234887d847d060db`), the tuning gained `gen.validation`, so the golden recording is rewritten, and the generation bench gained D8's numbers: all 6 of its camps pass at the first attempt, and on its hardest way in safe intervals expand 11,532 states to the plain search's 100,478.

**Why:** the plan's D8. Rules a camp must pass, built in first so most camps pass as built, with a bounded, labelled repair for the rest and a rebuild for what repair can't save.

### The camp's analysis: who sees whom, what each perch sees, and the ways in (D7)

**Decision:**
- **One raster, aligned with the camp** (`generation/raster.ts`): 1 m cells in the camp's frame, over the fence and 30 m round it, each with its ground, its tallest top, an overhead slab (roofs, lintels), whether it's walkable and its moves. Sight colliders and vehicles are stamped by their extents in the camp's frame, and doorways carved under their lintels. Its lines of sight agree with exact raycasts on more than 85% of random pairs and err toward blocking (a test).
- **One cycle, sampled every half second** (`field.ts`). Every routine divides the camp's cycle, so one cycle of every guard's eye and gaze is exact for the whole mission. The exposure field says, for each cell and sample, how many levels of the intruder's meter it adds, summed over guards: one meter for every guard fills at least as fast as any one guard's. It is stored cell by cell, so a search reads a cell's cycle in one run.
- **D's sight law is A's, copied** (`sight.ts`, `tuning.gen.sight`). Generation reads only `tuning.gen`, so the law is D's own: lab A's for one body, a crouched intruder on the move, lit, in the open.
  - A's zones, with ranges A's × 0.6 for the stance: the core ±30° to 90 m, the periphery ±60° to 15 m, a marksman's binoculars ±2.5° to 240 m. Then A's edge ramps, the fill linear in distance from 2 s to 8 s, the telegraph's cap (0.47 of the meter a second), contact (2.5 m in any direction, 0.8 s) and the still factor (0.4).
  - What it leaves out only makes it quicker than A: light, foliage, the share of the body A's three rays see, and per-guard meters. The one exception is the sky behind a body; on the camp's pad, guards see an intruder against the ground.
  - `tests/campSight.test.ts` runs A's sight scenario at 112 points across the zones and their edges. D is never later than A by more than a sample, and never more than twice as quick wherever the scenario's circle lies wholly inside one zone.
  - The meter has 128 levels and falls at 0.0625 of full a second: half A's rate, with no hold, which covers A's 1.5 s hold for any pause of 3 s or more.
  - The first calibration came from the design doc before A landed: 27 m of periphery, a 0.4 s fill up close, and no contact zone. A's numbers replaced it.
- **Infiltration by safe intervals, exactly** (`infiltrate.ts`).
  - SIPP over (cell, interval), with the meter. An interval is a safe run, where waiting lowers the meter, or one watched sample, whose rate the meter takes on arrival. It is a wall where even a still intruder couldn't take it.
  - Each interval keeps the Pareto front of its labels (arrival, meter), counting the meter's fall while a label waits in a safe run. The labels live in a pool, so a 128-level meter costs no memory. A* orders them by arrival plus the walking distance.
  - On 400 random small camps, it, the plain space-time search and brute force agree on whether a way exists and how soon, and every path replays. The generation bench pins it against the plain search on the hardest of its camps' ways in.
  - The budget is 400k expansions (rule 18).
  - **The three ways.**
    - In: from anywhere on the rim to a close shot at the target, within 12 m with a clear line to his chest and outside his contact zone. Reaching him within 1.5 m means entering that zone, which A's law makes all but impossible.
    - To the generator: within 2.2 m.
    - Out: from the shot to the rim, with the target's own view gone.
- **The sightline graph** (`clusters.ts`).
  - Witness edges: a sees b drop when b stands in a's cone within D's witness ranges (80 m in the core, 30 m in the periphery: lab D's own until lab E's brain says how guards take it) with a clear line. Each carries its duty over the cycle.
  - Edges holding for at least a tenth of the cycle join guards, and clusters are the strongly connected components (Tarjan, iterative, in guard order). No published method clusters guards by mutual visibility over time (`docs/research/labs.md`), so this is lab D's own.
  - **Certified, watchers first.** A bounded search (20k expansions a cluster) looks for a kill order from the perches:
    - shots 0.75 s apart from one perch while anyone is pending, and every witness dropped within the 1.5 s reaction;
    - or waiting for a moment nobody alive is watching;
    - relocating between perches at 2 m/s;
    - one distraction: a witness looks away for 6 s, from one of 12 moments.

    Clusters are taken apart in a topological order (a watcher's cluster before those he watches), each with the guards shot before it dead. Each is labelled isolated, window, chain, distraction, out of sight (no perch sees a member), or unsolved. The first version tried only each guard's next sighting, so it missed windows and left lone guards unsolved. With waiting and the kill order, none of 16 camps has an unsolved cluster.
- **Perches** (`perches.ts`). A 720-ray sweep of the valley finds spots that overlook the camp, thinned to 32 at least 25 m apart, steepest first. Each gets a viewshed over the raster (the lowest height visible in each cell), held to exact raycasts. Each perch reports:
  - each guard's share of the cycle in view, counted as the plan pinned before D8;
  - the target's share;
  - the alarm boxes and the antenna in view;
  - the share of the escape route it sees.
- **Heatmaps:** coverage (the share of the cycle some guard watches a cell) and idleness (its longest quiet stretch, wrapping round the cycle).
- **Staffing sees through the analysis** (`staffing.ts`). Each guard is placed only where the sightline graph stays within limits: no component over 4, at most one over 3, and no guard watching the skeleton's corridor for more than a fifth of the cycle. Posts try four facings, walkers 12 start times, and the roles that must stay take their best fallback. The target walks once a cycle, mostly inside, and guards indoors face away from doors.
- **Drawn.** The explorer's camp view draws the coverage heatmap, the sightline edges coloured by cluster (unsolved in red), the three ways (in green, to the generator orange, out blue) and the perches shaded by coverage, ringed where they see the target.
- **Its cost.** A camp now generates in about 2.3 s in Node (mean of 16): terrain 0.35 s, the grid 0.2 s, staffing 0.6 s, the fields 0.35 s, and the searches 0.2–1.5 s. A search that runs out of budget costs about 0.75 s. Laying the field out cell by cell, folding the target's view in densely, and the label pool brought it down from about 4 s.

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its staffing (`f38577ac4a34e3b6`, state `40446ee293103458`). The tuning gained `gen.sight` and `gen.analysis`, so the golden recording is rewritten. The generation bench gained D7's numbers: camps with a way in and out, unsolved clusters, the busiest search, and the expansions of both searches.

**Why:** the plan's D7. Validation (D8) needs to know who sees whom, what each perch sees, and whether a way in exists, exactly and within budgets. And D's model must be its own, yet held to A's.

### Staffing: points, chokepoints, a grammar, one cycle (D6)

**Decision:**
- **Points buy guards** (`generation/staffing.ts`).
  - Difficulty sets the budget: 16 to 40 points.
  - Each of the seven roles is bought once first. The roles cost: target 0, worker 1, sentry 2, radio operator 2, patrol 3, officer 3, marksman 4.
  - Then extras come from a priority list, at most one officer and radio operator, a marksman per tower, three workers, never past 16 guards (counted).
- **Sentries at the real chokepoints.** Brogue blocks each one-cell corridor and counts what it cuts off. A camp's passages are metres wide, so `minimumCut` (`chokepoints.ts`) finds the minimum vertex cut between two zones by max flow (Edmonds–Karp, breadth first in a fixed order).
  - It runs on the site layer contracted to 1 m cells, connected wherever the fine walk edges connect, so it agrees with the fine grid on what connects.
  - A cut wider than 10 m is no chokepoint. A test holds it to a hand-built wall with a 4 m gap.
  - Sentries stand inside the gate, at the cuts between the camp's zones, then at doors, and never within 8 m of the skeleton's corridor.
- **Patrols on lanes, with a grammar** (`patrols.ts`, after Xu, Tremblay and Verbrugge).
  - Loops: the perimeter lane, the yard, and the alleys round each side.
  - They walk grid paths pulled taut, and stops are snapped to walkable cells.
  - At each stop, a word of the grammar: a glance, a quarter turn, a half turn, a sweep back and forth, a full turn. Two patrols on one loop walk it half a period apart, and loops that share a lane run it the same way round.
- **One cycle for the camp.** Every routine divides it: a patrol's period is the cycle over a whole number, its stops' dwell stretched to fit, and a post holds the whole cycle. Each head sweep fits it a whole number of times. Routines gained an optional `offset` (absent for Phase 0's guards, whose bits are unchanged).
  - The camp repeats exactly every cycle (160–300 s), so its windows can be learned, and analysis (D7) can certify them over one cycle.
  - A route too long for 300 s drops its dwells, then the cycle grows. A clamped cycle had cut routines short, making them jump metres at the wrap.
- **No two guards meet on routine.** Before the check existed, guards on different loops reached a lane corner together, shoved each other, and in the worst cases locked for most of a minute.
  - Each walking guard tries up to 12 start times until he passes everyone at least 1 m clear, all cycle, sampled every quarter second.
  - The last of a role who can't walk clear holds one of his stops instead, so all seven roles always stay.
  - Guards now keep to their routines through the motor within 25 cm (tested for two minutes; measured within 11 cm over five, in four camps).
- **Open doors lie flat** against the inside wall beside their doorway. The grid doesn't know entity solids, so a leaf standing in the room was in routes' way.

**What moved:** nothing in Phase 0's valley. The `camp-systems` run moved with its camp's guards (`e430ba9fbbf75bd5`, state `02a8b5ec0ec11fbc`). The tuning gained `gen.staffing`, so the golden recording is rewritten.

**Why:** the plan's D6. Fitting routines to one cycle makes timing windows exact, and a clear routine is one the analysis can trust.

### The camp's systems and the objective (D5)

**Decision:**
- **Systems are data, and entities where they have state.** Generation records the devices (`camp.devices`: the generator, each light, alarm box and the radio set, each with its structure and its feed, the generator it draws from) and the objective (`camp.objective`: eliminate the target, with his building and his escape vehicle). In a run, each is an entity of its own kind (`game/camp.ts`):
  - a `generator` that runs;
  - a `light` that is on;
  - an `alarm` box that is powered and can be raised;
  - a `radio` that is powered and working;
  - an `objective` that is open, done or escaped.

  They spawn after the doors and vehicles, so no earlier id moves.
- **One system powers the circuit.** `camp-power`, in the 'world' phase, sets every light, alarm box and radio from its generator's state each tick, so a cut is seen in the tick it happens: before perception, and before lab E's camp acts. `objective`, in the 'mission' phase, marks the objective done when its target is gone.
  - Lab E raises alarms and drives the escape; lab C's use action and lab E's sabotage stop the generator or break the radio. Each writes the state that is already here.
- **Explained.** The snapshot carries each device's state, and the debug view draws the wiring from the generator to each device, live or dead. The `camp-systems` scene cuts the generator at tick 60, restores it at 180 and takes the target at 120, with expectations on each. It is pinned as the generation lane's run (`64d0c1711e6ab4c0`, state `af5ba8029683ec86`).

**What moved:** no existing golden. The new pinned run changes the build's behaviour digest, so the golden recording is rewritten. `camp-power` shares the 'world' phase with systems that spawn, so they name it in `after` (the spawn-tick scene, a test); their order is unchanged.

**Why:** the plan's who-defines-what gives lab D camp systems as data, plus entity kinds for those with state, so labs C and E build on one answer to "is that alarm box live?".

### The compound: plots, parcels and modules, skeleton first (D4)

**Decision:**
- **Solution first.** `buildCompound` (`generation/compound.ts`) lays down the approaches before any fill, as the research proposed from Spelunky:
  - the breach goes in the fence side that faces a ridge most squarely, so its gully is the way down toward it;
  - a corridor runs from 30 m outside the breach to the target's back door, with low cover along it;
  - the generator's shed stands beside that corridor;
  - the breach and the gate are the two ways out;
  - the escape route runs from the target's building to the escape vehicle, the gate and the road.

  The layout records these as its `skeleton`, so validation (D8) asks whether the fill broke them.
- **Plots and parcels**, as XCOM 2 builds them.
  - The plot is the fence (its gate toward the road, the breach), two to four corner towers (corners away from the breach first), a 7 m lane inside the fence for patrols, and the road to an open yard.
  - Seven parcels around the yard take modules: the target's building, barracks, mess, storage (60% of camps), the radio room with its mast, the generator's shed, and the motor pool. Each is placed in its slot by its own labelled fork.
  - The modules' sizes are data in `tuning.gen.compound`, so recordings embed them (rule 16).
- **Hollow buildings.** Walls with doorways, lintels and a roof, so the target can be reached inside, and the grid knows the inside is roofed. Doorways are 1.5 m wide: at 1.2 m, a camp turned to the grid at about 40° left no lattice step through some doorways for a 0.3 m body, while the motor would have passed. At 1.5 m, 306 of 306 doors over 40 camps pass.
- **Doors and vehicles are entities** (`game/camp.ts`). The `door` and `vehicle` kinds carry their camp index and state (open, escape), with a solid shape the motor and every query see. They spawn after the guards, so ids stay the player's, then the guards'. Doors start open, swung into the room: guards' routines walk through them, and labs E and C shut them.
- **Ladders are data** (`camp.ladders`: foot, top and the side a climber stands on), for lab C's ladder mode and lab E's navigation links. Each is drawn as a structure that blocks nothing.

**What moved:** nothing in Phase 0's valley. The tuning gained `gen.compound`, so the golden recording is rewritten. Guards are a fixed placeholder until D6.

**Why:** the plan's D4. Solution first keeps the first-try rate high, because the approaches validation checks for exist by construction. Doors and vehicles are lab D's to define and labs C and E's to use, so they exist as kinds now.

### Terrain with teeth, and how a mission asks for a camp (D3)

**Decision:**
- **A mission asks for a generated camp with a camp spec** (`generation/campSpec.ts`): `{ archetype: 'compound', difficulty }`, carried in the mission spec by module augmentation. The recording header accepts it as a small object of plain values, which the generator checks; the kernel doesn't read it. Until D9, a mission with no camp spec builds Phase 0's valley and test camp, so no golden moved. The game and the explorer take `?camp` (`&difficulty=`).
- **The valley is placed feature-first** (`generation/landform.ts`).
  - An open side of 130–170° is chosen first, and two or three ridge spines stand around the rest, 240–420 m out, each spanning 50–80° of the horizon.
  - Each camp face is a profile with a cliff band, too steep to climb, broken by one or two gullies whose run keeps their slope under about 37°.
  - The creek enters across the open side, passes the camp at 130–170 m and leaves through the widest gap between spines. Its bed sits 4–8 m below the floor, with banks that rise 2.2 m per metre except within 16 m of a ford, and where the road crosses.
  - Relief goes on after the features, with the crags kept out of the gullies.
- **D3's checks** (`generation/overwatch.ts`):
  - A radial sweep from the camp's eye finds perches: prone shooters' eyes 150–560 m out that clear the horizon and look down at least 2.5°.
  - Every placed ridge must hold one, perches may cover at most half the horizon (counted in degrees, not in 22.5° sectors, which overstate a long spine), and the widest open side must be at least 120°.
  - On the spatial grid's map layer (no colliders yet), the camp must be reachable from at least 3 of 8 directions, and a second way out must stay 20 m from the first beyond 90 m of the camp.
  - A valley that fails is re-rolled from its own stream (`valley#k`), up to `landform.attempts` times.
- The props, the camp and its routines draw from their own root streams, so a re-rolled valley leaves their draws as they were.

**What moved:** nothing. The tuning gained `gen.landform` and `gen.overwatch`, so the golden recording is rewritten for the new shape. The generation bench adds lab D's valleys: 6 of 6 held-out ones valid at their first attempt, a margin of 7 of 8, overlooked over at most 157°, with an open side of at least 164°.

**Why:** the owner found that one overlook could take a compound apart (phase-1-plan.md, D3). In Phase 0's valley, every valley was overlooked from all 8 of 8 directions, and reachable from all 16 of 16, so no approach differed from another. Counting overwatch in degrees keeps the rule exact for long spines. The creek had to be deep to be a barrier at all: 2.5 m terrain cells smear a shallow bank into a walkable slope.

### The seed explorer (D2)

**Decision:** `?explore` opens the seed explorer instead of the game (`app/explore.ts`): a grid of camps from a named series, the same seeds `npm run seeds -- --from <name>` reports on, each card drawing the valley and the camp from above with its validation results, and linking to the seed. Workers generate the camps (`app/exploreWorker.ts`), a few at a time, with the tuning the page was given, so the page never imports tuning of its own and hot reload keeps working. What a card draws is the world's survey (`generation/survey.ts`): plain data a worker can post, which each later milestone extends with its layer.

**Why:** the plan's three Phase 1 tools give lab D the seed explorer (D2), and the generator's range is easier to judge from fifty camps side by side than from any number in a report.

### The one deliberate `GEN_VERSION` bump (D1)

**Decision:**
- **Scatter by cell.** Trees, rocks and bushes are scattered on jittered grids as before, but each cell now draws from its own stream: the feature's labelled fork mixed with the cell's coordinates by integer hashing (`generation/scatter.ts`). A prop depends only on the seed, its kind and its cell, and carries that cell as its id (`Tree.cell` and the others). Before, every cell drew from one stream in visiting order, so a cell that kept its prop shifted every later cell's numbers. Now a repair that clears or adds cells (D8) changes only those cells, and generated objects keep their ids, as the survival horizon asks.
- **The fingerprint covers the world by construction.** `worldFingerprint` hashes every field of the world except what it was built from (`spec`, `seed`) and how long it took (`genMs`): the terrain by its heights and surfaces, the colliders by their list, and everything else (features, backdrop, props, camp and routines, the spatial grid, the report, the spawn) generically, keys sorted, typed arrays by their bytes. A field any lane adds to `World` is covered the day it is added, and a class instance there is refused by name. Before, it listed what it covered by hand, and missed the backdrop, the grid, the report and most of each prop.
- **`dsin` and `dcos` reduce exactly from 10⁶ up** (`kernel/core/detmath.ts`): Payne–Hanek in 24-bit limbs, with the 66 limbs of 2/π that a double can need, each product exact in a double. Below 10⁶ the plain reduction is kept bit for bit. `tests/detmath.test.ts` recomputes 2/π from Machin's formula in integer arithmetic, holds the new path to the engine's own `sin` and `cos` within the kernels' own error (1.5e-15) from 2²⁰ to 2¹⁰²², including the double nearest a multiple of π/2, and wraps the trigonometry while generating both valleys and every pinned run: the largest argument the simulation reaches is far below 10⁶. The one input that grows with time, a guard's head sweep, needs almost thirteen days of mission to get there.

**What moved:** `GEN_VERSION` 4. TAL-4471's fingerprint is `f555512c33daea22` (`GOLDEN.world`, `GOLDEN_TAL_4471`). Two plays moved because their bots met different trees and rocks: MUD-9031 wander (`67964675cb39477e`, state `4002c5b682b8bcc8`) and TAL-4471 chaos (`fe623d33389a2f21`, state `e8037411190fc911`). TAL-4471 wander, the scenes and the math golden held. The golden recording is rewritten. The body bench's worst rise in a tick is now 0.29 m (a rock, under the 0.45 m step), and its worst overlap 2e-14 m.

**Why:** the foundation pass left both changes for one deliberate bump (`docs/foundation-plan.md`, Deliberately later), so seeds change once, not twice. Lab D's repairs need scatter that stays put around them, and the camp generator adds a great deal to the world that a hand-kept list would have missed.

### The bullet, its strike and the body left behind (B2–B4)

**Decision:**
- **Content in `tuning.ballistics` and `tuning.vitals`:** the rifle (15 rounds, a 1.2 s bolt, a zero dial from 100 to 600 m in 100 m steps), two loads (the published .308 168 gr match at 823 m/s and k = 0.000756; an illustrative subsonic at 320 m/s), the report, crack, bolt and impact radii, the hit rules, the optics, the throwable and the sway's starting values. Drag constants are given at sea-level air and scaled by the mission's density.
- **The shot event is the bullet's path:** launch point and time, the bore's line, muzzle speed, drag and wind (`RECORDING_VERSION` 11). Labs A and E follow a bullet's path, its crack's included, from the event alone; its strike is an `impact` it caused.
- **New events (codes 30–35):** `report`, `impact` and `cry` (sounds), `death` (who fired, who fell, the body left), `ranged`, and `bolt` (a sound). **New commands (30–34):** `range`, `throw`, `zeroUp`, `zeroDown`, `suppressor`.
- **What a strike does:** a headshot kills silently; a torso shot kills, with a cry first as often as the guard's own stream says (35%); a leg shot kills, always with a cry. The guard's entity goes, and a `remains` entity takes his place in the same tick, collapsing over 0.7 s as a pure function of time; queries see it, the motor doesn't collide with it (lab C decides, with carrying).
- **Systems:** `rifle` in 'commands' after `player-commands`, `bullets` then `aim` in 'projectiles'. The spawn-timing scene's commands system now names `rifle` in its `after`.

**What moved:** `RECORDING_VERSION` 11, so the golden recording is rewritten; the tuning gained sections, so it would have been anyway. The shooting range joins the pinned runs (`411196f29915b2ee` / `5b191832e76a9bc8`, lane `ballistics`), which moves the behaviour digest. No valley or scene value moved: the bots never fire, and without a rifle a click is the bare shot it was. `SIM_VERSION` stays: nothing an earlier build could record behaves differently here, and such a recording is refused by its format anyway.

**Why:** a lab is an isolated scene until Phase 2 joins them; keeping the valley's goldens still lets labs A and D land beside this one without rebasing onto moved values.

### Sway, vitals and the instruments (B6, B7)

**Decision:**
- **Sway samples with history.** The aim system samples the sway at every tick's end (`rifle.sway`, two ticks kept). The renderer draws the camera along `viewLine` (the line of sight moved by the sway, as far as the scope is up), interpolating the samples as it does the body; the rifle fires along the same interpolation at the click's lag. With the scope down, the barrel points only roughly where you look: 25 mil of pointing error, drawn from the player's own stream.
- **The ladder, measured, not asserted:** standing 1.64 mil, crouched 0.99, prone 0.69, prone on a rest 0.255, with the breath held 0.046 (95th-percentile radius over 20 s). A rest is found by geometry, never declared: the ground under a bipod prone, a sandbag or a wall top under the fore-end upright.
- **Vitals live in the body lane** (`body/vitals.ts`), a component the run's setup gives with the rifle; lab C extends them. A held breath stills the chest over half a second and lasts 4 s calm, 1.5 s at the top of the heart rate; a long one ends in a gasp. `startle()` is the close call lab E calls when guards shoot back.
- **The reticle is drawn in mils as tangent offsets** in the camera's projection, the same offsets the hold solver works in, so a hold names the mark the target sits on exactly. The scope's field is 3.6° across its glass; the binoculars' 6.5°.
- **Assists are a setting, not tuning:** sim (the reticle and the range), lite (a dope card too: the hold at each 100 m for the dialled zero, and the wind's hold per m/s), arcade (the binoculars read the hold and the wind out, and the scope marks where a shot lands at the ranged distance). The default is lite. None touches the simulation.
- **Glint** is a pure function of the aim, the sun and the observer (the mirror's half-way condition), for lab A to ask per guard; the scope's glass flares when it faces the sun, so the player can tell.
- **The flags' and the grass's motion** is presentation only: it changes nothing that can be seen or hit.

**What moved:** the shooting range's fingerprints (tuning its own sway), and the tuning's shape, so the golden recording is rewritten. No valley value.

**Why:** the plan's B6 and B7. The research found no game that publishes sway numbers, so the bench pins Sightline's, and the sweep pins the claim that a reticle and its bullet can't disagree.

### The shot's sound, the throwable, and a query that reached too far (B8, B9)

**Decision:**
- **The crack is a function of the path,** not an event per listener (`ballistics/crack.ts`): the first arrival is where t + |L − P(t)|/c is least, found by a fixed golden-section search over the flight, which lands on the Mach cone's point. The speakers use it for the camera; lab A's hearing uses it per guard, scheduling the percept at the arrival.
- **The shot's own sounds are events:** `report` (the suppressor's and the load's radius), `impact` by what was struck, `cry`, `bolt`, and the throwable's `clatter`. Voices are procedural (`audio/shotVoices.ts`); the shooter hears his report at his ears and no crack of his own.
- **Sandbox shots** are a command (`shotDrop`, J in the debug view): a match round solved to land where you look, from the eye, rifle or not, so a recording replays it. Lab A's sandbox (A10) can call it from its own UI.
- **The throwable** is an entity on an exact arc (no drag), its chord swept per tick against the world and bodies, bouncing until it settles. Its landing is loud enough to reach the guard it lands by (31–40 m at a full throw); drawing exactly one guard is perception's and the brain's call, since guards in the test camp stand in pairs.
- **The miss breakdown** (`game/telemetry.ts`) solves what each shot needed with the instruments' own function (drop, lead, wind) from where its target's head was at the shot's instant, compares what was held and what the sway added, and names which sideways decision was most nearly left out. The playtest summary prints it per shot; the range's expectations check it reads the marksman's deliberate miss as "lead left out".
- **A kernel fix:** `raycast` (`kernel/world/query.ts`) accepted a body beyond `maxDist` when nothing else was within reach, so a short ray could return a guard 60 m away (a thrown stone found one). Bodies now count only within reach, like the terrain and colliders. No golden moved: nothing relied on it, and sight lines (`sightLine`) already treated a far hit as clear. Lab A's rays get the bound for free.

**What moved:** the shooting range's fingerprints (its script gained a throw), the golden recording. No valley value.

### Bob, hit confirmation and the end of a run (B5, B10)

**Decision:**
- **B5: walking bodies don't bob in the simulation, and a shot leaves from the simulation's eye.** Measured at 300 m (`tests/bob.test.ts`): a walking guard's 2.6 cm dip is 0.087 mil, under a quarter of the head's radius and a fifth of the smallest decision a 300 m shot needs, and under a pixel and a half through the scope. The camera's own bob fades out as the scope comes up, so the scoped shot and the drawn eye are the same point; unscoped, the barrel's pointing error is a hundred times larger than any dip. Bobbing bodies would cost a change to the body lane's shape, and through it every sight line, for nothing a player could see. Phase 3's walk cycles, which come with art, are the time to revisit it.
- **B10: confirmation is physical.** Dust where a shot strikes, darker than the ground so it reads at range; a flash on steel; the trace along the simulated path; the body's collapse; the thump heard after the flight and the way back. No kill cam: a replay already plays a shot back slowly, and nothing rations a reward that the physics hands out on its own.
- **The end of a run lists every rifle shot's breakdown** (range, lead, wind and sway in mils, and what it needed), from the same function `npm run playtest` prints, so the owner's verdict on a sitting can be checked against what decided each shot without a tool.
- **Optics belong to the body's own eyes:** the fly camera and the benchmark draw no scope, no sway and no zoom.

## 2026-11-07 · Wave 0

The seams of `docs/phase-1-plan.md`, Wave 0, landed on `main` one step at a time.

### Branches take `main` by merging it (Nov 8)

**Decision:**
- A branch behind `main` brings it in by merging it (`git merge origin/main`, or GitHub's *Update branch*), never by rebasing. The plan said to rebase, but `npm run land` and CI's "Up to date with main" ask only that `main` be an ancestor of the branch's head, and a merge gives that too.
- Goldens are still regenerated once `main` is in, never merged by hand: where one conflicts, take either side and regenerate.
- `npm run land` reads commit statuses (Vercel's deploys, which have a context and a state) as well as check runs. It took Vercel's status for a check still running, and refused with an empty list (#2 and #3 were merged by hand because of it).
- A ruleset on `main` became possible when the repository went public. It is the owner's call, and none is set.

**Why:** the app refuses a session's force push of a rebased branch, so lab A's finished #8 could not land after #7 moved `main` (Nov 8). A merge keeps every branch's history append-only, which is what the refusal protects.

**What moved:** nothing in the game. Only the landing script, CI's message and the plan's wording changed.

### A sliding body's own speed never carries it uphill (Nov 8)

**Decision:** on ground too steep to stand on, the motor now removes the uphill part of a body's velocity, as it already did for the wish. `SIM_VERSION` 7.

**Why:** the first run of the weekly jobs on Wave 0's code (Nov 8) found the motor breaking its promise in a fresh valley, NEM-4083: crawling prone off a low rock onto terrain a hair steeper than the limit, the player started sliding but kept the uphill speed he arrived with, which carried him onto gentler ground 8 mm higher. The same run fails the same way on the commit before Wave 0, so the bug was the foundation pass's, waiting for a valley to find it. A test at a handmade seam between too-steep and walkable ground showed it was worse at speed: a body arriving at a sprint coasted up to 16 cm in one tick. Both cases are now tests (`tests/steep.test.ts`).

**What moved:** no golden value: none of the pinned runs meets the case. The version still moves, because the motor now does something different for some inputs, and a recording that met the case would otherwise diverge on replay instead of being refused. The golden recording is rewritten for the new version.

### Determinism, hardened at the edges (W0.8)

**Decision:**
- **Synctest in the fuzz run** (`npm run fuzz -- --synctest`, `kernel/synctest.ts`). Every 30 ticks the state is saved twice: through `structuredClone`, and through a new exact on-disk codec for save-states (`kernel/record/stateCodec.ts`: every number's 64 bits, −0 and NaN, every key in its order). After 30 more ticks each copy is put back, the codec's into a fresh shadow simulation and the clone into the main one (a rollback), and re-stepped with the same inputs; every tick must match part by part. A weekly CI job runs it for 10 hours of play. A test plants state in a closure and sees it caught at the first re-stepped tick, with its part and path.
- **Bisect** (`npm run bisect`): from a recording (against the build that made it) or a pinned run (against `origin/main`), the first tick the two builds differ, then the first system within that tick, then the state paths that system left different. `npm run trace` gained recordings, per-system hashes and dumps after any system for it.
- **Known answers at startup** (`kernel/core/known.ts`): exact bits of `Math.sqrt` for twelve inputs, proved correctly rounded with integer arithmetic in `tests/known.test.ts`, and of every detmath function. The game refuses to start in an engine that gets them wrong, the headless tools stop, and the self-test checks them in every engine CI runs.
- **Sort comparators** must break ties with an id or an index, or say on their line why their keys can't tie; the architecture test checks every `.sort(` in the simulation. The footstep table's sort now names its tie-break, the gaits' order, which stable sorting already gave.

**What moved:** nothing.

**Why:** the core already matched industry practice; these were its edges (`docs/research/foundations.md`). The fuzz run never restored state mid-run, a divergence named a part of the state but not the tick, system or path, and nothing checked an engine outside CI.

### Landing, made mechanical (W0.7)

**Decision:**
- **Goldens explain themselves.** `npm run explain` runs another build (by default `origin/main`) from a temporary git worktree, traces every pinned run in both (`npm run trace`), and for each run that moved prints the first divergent tick, whether behaviour or only state moved, and the state paths that differ there (`guard:4.body.x: 12.5 → 12.75`, `kernel/diff.ts`), then each lane's work and metrics before and after. CI's "Goldens, explained" job prints it for every pull request and push to `main`.
- **Pinned runs and benches per lane.** The pinned runs (`game/runs.ts`) belong to lanes: the valley's plays to the game, the movement course to the body, spawn timing and the kernel alone to the kernel. Their fingerprints are `GOLDEN` (`game/golden.ts`). Each lane's bench (`game/benches.ts`) adds the work each system does in its runs and its quality metrics, pinned in `benchGolden.ts` and held by `tests/bench.test.ts`: today the body lane's broken promises and closest calls under two bots, and generation's valleys valid at their first attempt, of a held-out series. The other labs add theirs.
- **Work counts.** The kernel counts rays cast, grid nodes expanded and bodies resolved, and attributes them to the system that did the work (`kernel/work.ts`). They are deterministic, so they are pinned like goldens; `npm run sim -- --profile` prints them beside the time.
- **Behaviour fingerprints in recordings.** A recording's header carries its build's behaviour digest (`Game.behaviour`: one digest of every pinned behaviour value). A build that behaves differently refuses it with the reason and the build to replay it with, instead of re-simulating until it diverges.
- **The merge rule.** The repository is private and on GitHub Free: merge queues need an organization, and branch rules and rulesets need GitHub Pro or a public repository. So the rule is CI's "Up to date with main" check on every pull request, and `npm run land -- <number>`, which merges only a branch that is up to date with `main` and green, and only at the commit that was checked. Making the check blocking is the owner's call: it needs Pro, or a public repository.

**What moved:** `RECORDING_VERSION` 10, for the header's `behaviour` field, so the golden recording is rewritten. The kernel-alone scene's fingerprints join the goldens (`0698e581024f5b35`, `b51b84477d71dbf1`). No behaviour or state value moved.

**Why:** five lab branches are about to move shared goldens; the plan's landing rules were right but held by hand, and a recording from a lab's preview deploy would have been accepted by `main` and then diverged.

### Codes by lane, and all seven roles (W0.6)

**Decision:**
- **Code ranges** are data in `kernel/codes.ts`, by lane: the foundation 1–9, perception 10–29, ballistics 30–49, body 50–69, generation 70–89, brain 90–129, later phases 130–255. Every entry in the event and command registries names its range, and `tests/codes.test.ts` checks that the ranges split the byte with no gap or overlap, and that every code is unique in its registry and inside its range.
- **Roles:** `GUARD_ROLES` (generation lane) lists the design doc's seven: sentry, patrol, marksman, radio-operator, officer, worker and target. The debug view tints each; the test camp still uses three.

**What moved:** nothing. The registries' new `range` field isn't recorded.

**Why:** codes are permanent once recorded, so two branches that picked the same one would make recordings ambiguous; with a range per lane, they can't. Lab D staffs camps with all seven roles (D6) and lab E gives each its behaviour, so the roles exist before either branch opens.

### One grid search, exact and budgeted (W0.5)

**Decision:** `GridSearch` (`kernel/world/search.ts`) searches either layer of the spatial grid, for generation and the simulation alike: a bounded Dijkstra flood with a bucket queue (Dial's), for hearing and analysis, and A* with the octile estimate, for navigation.
- **Exact everywhere.** Costs are whole numbers of centimetres, so no rounding can reorder a queue; a cost function returning anything else throws.
- **One order.** Neighbours are visited in one fixed order (the four sides, then the corners), and A*'s ties break by the lower estimate left, then the lower cell index.
- **The layer's own moves.** A move follows the grid's walk edges, and a diagonal needs both of its two-step paths open, so no path cuts a corner. A cost function prices or closes any move: walls for sound, roofs, danger.
- **Budgets, not time** (rule 18): every search takes `maxExpansions`, reports what it expanded, and says if it ran out. The expansions are the work count W0.7's benches pin.

**What moved:** nothing; nothing uses it yet.

**Why:** lab A's hearing flood, lab D's analysis and lab E's navigation would otherwise each have built a search of their own, with their own tie-breaks.

### Systems query bodies and spawn inside a tick (W0.4)

**Decision:** the tick's context gains three calls.
- `ctx.query()`: the world, everything solid, and every body's shape as it stands at that moment, taken afresh on each call.
- `ctx.spawn` and `ctx.despawn`, which keep the entity index and the solids current at once. A system that uses them declares `entities` in its writes, or the simulation stops it.

**The rule this pins** (`game/scenes/spawnTick.ts`, the `spawn-tick` scene): a spawned entity exists from the moment it is spawned, for every system that runs after it in the tick, and for every system from the next tick on. A guard spawned in 'world' at tick 30 is in queries at once, seen by perception that tick, and first moved by the motor on tick 31; one spawned in 'commands' at tick 60 is seen and moved in tick 60. A guard spawned anywhere starts with his first order (`spawnGuard`, `game/setup.ts`), for the first tick not yet finished.

**What moved:** nothing. The scene's fingerprints are new in the self-test (`f5e93112e48134bb`, `2535df87754d14eb`).

**Why:** labs A, B and E all need it: sight lines against bodies, a killed guard's body, reinforcements, and the sandbox's drops. Overwatch had to add immediate creation in a patch after release; the research recommended pinning the semantics before the labs depend on them.

### Brains decide after perceiving, and steer through orders (W0.3)

**Decision:** a guard's brain runs in the 'decide' phase, after the world has moved and been perceived, and gives an order for the next tick. The order is plain data in the guard's state (`guard.order`, `brain/orders.ts`), and 'intent' carries out the current order every tick until the brain gives another. Each guard spawns with his first order, for tick 1, decided the same way from where he stands.

**What moved:** `STATE_SCHEMA` 7. The four `state` fingerprints in `src/sim/game/selftest.ts` (TAL-4471 wander `4c04325e4eca45c6`, MUD-9031 wander `0beac8712fcd45a4`, TAL-4471 chaos `5031fb7d0451b494`, the movement course `a72123b8c4cb29d8`), and the golden recording, rewritten. Every `behaviour` fingerprint held: the order the brain gives at the end of tick N is exactly what the routine gave at the start of tick N + 1, since nothing moves a guard between the two. In the golden recording, the input, event and state-sample tracks are byte for byte the same.

**Why:** brains then decide from what the tick perceived, never from a world that hasn't moved yet, and lab E's orders that last many ticks (go somewhere, follow a path) have their place: an order kind, carried out in 'intent'. Orders are the brain lane's edge with the body lane. The no-omniscience probe now watches in 'decide', and compares the orders given.

### The kernel boundary, the lanes and the game (W0.2)

**Decision:** `src/sim` is now `kernel/`, five lanes (`generation/`, `body/`, `perception/`, `brain/`, `ballistics/`) and `game/`, with the lane map as data in `src/sim/lanes.ts`. Every golden held: the selftest's fingerprints, TAL-4471's, the golden recording (rewritten byte for byte by `npm run golden`), and the 20-minute CI hash `e9311dda2ac00379`.

**How the kernel stays free of the game:**
- **One contract.** What the kernel needs from a game is the `Game` interface (`kernel/game.ts`): its systems, how a run starts (spawning the player and the guards moved here from `Simulation`'s constructor), every body's shape for queries, how to build a world from a mission spec and fingerprint it, and the recording's 10 Hz state sample. Sightline's is `SIGHTLINE` (`game/sim.ts`), whose `Simulation` subclass keeps `sim.player`, `sim.guards` and `snapshot()`.
- **Open registries.** The game adds its entity kinds, and generation adds its fields of `World`, by module augmentation, so the kernel's types grow without the kernel naming them. `npm run typecheck` compiles the kernel alone (`tsconfig.kernel.json`), where none of those additions exist, so kernel code can't quietly use them.
- **Shared vocabulary stays in the kernel.** The event and command registries are one table each in the kernel, which every lane adds to from its own code range (W0.6), so recordings decode without a game.
- **Channels instead of shared maps.** The intents the 'intent' phase hands to the motor go through `ctx.channel`, which starts empty every tick, so nothing outside the state tree lasts between ticks.

**Declared access:** every system declares the state paths it reads and writes and the events it emits. The simulation refuses two systems in one phase that touch the same data unless the later names the earlier in `after`, and stops a system that emits an undeclared event. A test diffs the state tree around every system, in two valleys and every scene, against its declared writes. One writer per subtree holds within each phase; the player's stance is written by the controls in 'intent' and by the motor in 'motor', which the phase order makes safe.

**Smaller calls:**
- The invariant watch lives with the motor in the body lane, since its promises are the motor's.
- The STAT track's sample is the game's: the kernel stores what `Game.sample` writes, and `game/samples.ts` reads and checks it. The file format didn't change.
- Re-simulating a plain mission takes its game (`{ game: SIGHTLINE }`); a scene names its own.
- Outside `src/sim`, code reaches a lane only through its `index.ts` too.

**Why:** `docs/foundation-shape.md`, approved by the owner. The kernel-alone scene (`kernel/alone.ts`, `tests/kernel.test.ts`) and two simulations stepped in alternation (`tests/state.test.ts`) show the kernel keeps no hidden state.

## 2026-11-07 · Planning Phase 1

The plan, with each lab's milestones and how its exit test is measured, is `docs/phase-1-plan.md`.

### The foundation's shape: a kernel, lanes and benches

**Decision:** `src/sim` splits into three layers:
- a narrow **kernel**, which never imports a lane or the game, and runs with every lane switched off;
- **lanes**, one per lab, each behind one exported contract;
- the **game**, Sightline's own content and rules.

**How it's enforced:**
- Systems declare what they read, write and emit, and a test catches two systems in a phase touching the same path with no declared order.
- The lane map is data, and the architecture test reads it.
- Every lane gets a bench: pinned scenes, quality metrics and deterministic work counts.

**What waits:** packages wait for a second game. The design is `docs/foundation-shape.md`, approved by the owner.

**Why:**
- **What the owner wants:** a foundation that many games and features can be built on, with each lane improving on its own.
- **What the research found** (`docs/research/foundations.md`): shared technology works when the kernel stays narrow and its contracts are enforced by test (Sony's ICE, Ubisoft's Snowdrop). It fails when one engine is mandated across genres (Frostbite).
- **Why now:** with five labs about to write most of the simulation, the boundary costs little now and much later.
- **Why no per-lane version numbers:** in a bit-exact simulation, every observable bit is part of the contract.

### Research is a seed, not a ceiling

**Decision:** fourteen researchers gathered the prior art, kept in `docs/research/`. Each lab starts from the strongest technique found, says where it falls short, builds past it, and records its bench numbers against both before it's done.

**Why:** the owner wants the pinnacle of each lane, not the best of what others have shipped. The research also shows where prior art cheated where Sightline promises not to: searches that read the player's true position, offscreen deafness, directors that know the truth. Each cheat becomes a check Sightline can run on every push.

### Seams first, then the labs in two waves

**Decision:** a short Wave 0 lands on `main` before any lab branch opens:
- brains decide in the 'decide' phase and steer through orders;
- systems can query bodies and spawn entities inside a tick;
- one grid search serves generation and the simulation;
- every lab gets a range of codes;
- all seven guard roles exist.

Then labs A, B and D run in parallel sessions, and C and E follow once A's percepts land.

**Why:** these are the seams that more than one lab would otherwise build its own way:
- A's hearing, D's analysis and E's navigation all search the grid;
- A's sight, B's bullets and E's reinforcements all need bodies and spawning inside a tick.

Landed once, before the branches, they turn merges of meaning into merges of text.

### One merge at a time, and goldens regenerated

**Decision:**
- Labs land on `main` one merge at a time, from branches that are up to date with it.
- Golden values and the golden recording are regenerated after each rebase, never merged by hand.
- Version numbers are taken at merge time.
- Changes that move every golden land alone, and are announced.
- Event and command codes come from a range per lab, and a test keeps them unique.

**Why:** two pull requests that are each green on their own can leave `main`'s golden values wrong. Codes are permanent once recorded. Two branches that picked the same one would make recordings ambiguous.

### Camp analysis sees with its own model

**Decision:** lab D's analysis and validation use a sight model of their own, in `tuning.gen`. A scenario-runner check holds it to lab A's detection at sampled points.

**Why:** generation reads only `tuning.gen`. Copying lab A's numbers there would make every retune of perception change every valley and bump `GEN_VERSION`.

### One overlook doesn't clear a camp

**Decision:** validation gains a rule, "no single perch wins". Its starting values are in the plan (D8). Lab E proves the rule from the other side: a scripted, perfect shooter on the best perch must be stopped by the camp's response before it finishes the objective.

**Why:** the owner found today's compound too easy to clear from a single overlook. Sniping stays central, but a long-range plan has to relocate, split clusters or time its shots.

## 2026-11-07 · Handing over to Phase 1

Phase 1 is planned and built in fresh Claude Code sessions, which know only what the repository holds. `docs/phase-1-handoff.md` is where they start.

### A copy of the design doc in the repository

**Decision:** `docs/design-doc.md` is a copy of the live design doc (revision 36). The live doc stays the source of truth, and the copy is exported again whenever the live doc changes. Its four diagrams are written out as text, because the export drops them.

**Why:** The design doc already serves as the brief for a Claude Code agent: each lab's spec and exit test can be handed over as they stand. But a session without the Claude Docs connector can't open the live doc. A copy beside the code can be read by any session.

### Looking at the game from a script

**Decision:** `npm run look` saves the honest and debug views as pictures from a headless browser. `openGame()` (`src/headless/browser.ts`) gives any script the game in a page, with the automation hooks in scope.

**Why:** `CLAUDE.md` asks for every change to be looked at. The scripts that did the looking during the foundation pass lived outside the repository and ended with that session. These tools also build in what those scripts learned:
- The tools' own Vite server has no hot reload, so an edit to `src` doesn't reload the page under a run.
- three is bundled before the page loads.
- Saves to the playtest inbox are dropped, so scripted runs don't land in `playtests/`.
- Expressions go to the page as strings, because tsx can wrap a function in helpers the page lacks.

## 2026-11-07 · Foundation pass

The working plan, with everything still open, is `docs/foundation-plan.md`.

### An independent review, and what it changed

**Decision:** before handing the pass back, a separate agent reviewed this session's commits (53ffd0d..2053269) without having seen them written: by reading, by running the tests, and with scripts of its own. Every finding was fixed:

- **Replay mode ends one way:** anything that starts a valley or a run, or opens another recording, leaves it first (`exitReplayMode`). Saving or hot-reloading during a replay acts on the recording being watched, never on the last live run's recorder.
- **A replay shows its own numbers:** bodies are drawn, and steady sounds heard, with the recording's tuning; only the view takes the viewer's.
- **The camera out of the body:** the fly camera flies on the movement keys in any context. With the camera outside the body, the player's own steps are heard from where they happen.
- **Saving that fails waits:** a failing store is asked again after the next minute of play or the next pause, not every frame. IndexedDB waits for its transaction to commit, and a failed tick's input counts as something new to save.
- **The fuzz verdict** is the first broken promise, by each body's own limits.

**Why:** an author's own checks follow the author's assumptions. The two serious findings were paths the author never took: opening a replay straight from a link, and leaving one by any route but Leave.

### A recording can be watched, from any camera, at any moment

**Decision:** the game watches recordings (`src/app/replay.ts`):

- **Opening one:** drop a file on the page, pick it on the start screen, choose one the deployed game kept, or load `?replay=<url>` (in development, any session in `playtests/`).
- **Seeking:** opening one builds its world and re-simulates it once, keeping save-states (`ReplaySeeker`), so seeking anywhere is exact. Playing steps the recorded input forward, so guards do exactly what they did.
- **The view:** the camera is the player's eyes, looking and zooming as they did, or the fly camera. The player's body is drawn whenever the camera is out of it (`render/playerMesh.ts`): its shape in its stance, the one sight and hits use.
- **Controls:** a timeline with the run's markers and pauses, speeds from ¼× to 8×, and replay keys in their own context (P, arrows, comma and period). The debug view's keys work in either view.

**Why:** a playtest's recording replays exactly. Watching it is how you find out why a guard saw you, and later the debrief and the tactical map (Phase 2) show the same thing. Building the viewer now also proves the renderer can draw the simulation from any state and any camera, which nothing else had tested.

### Every playtest is kept, and can be studied without the browser

**Decision:**

- **Saving:** the game keeps every run as it goes (`src/app/playtest.ts`): every minute of play, and when it pauses, the rules decide, a tick fails, the tab is hidden or a new run starts.
- **Where it goes:** in development the dev server writes each run into `playtests/`, as its recording and a telemetry report (`src/headless/playtestInbox.ts`). The deployed game keeps the last five runs in the browser's IndexedDB, and the start and pause screens offer them for saving.
- **The report:** it holds what the recording can't: frame-time percentiles and slow frames, the GPU and screen, the settings and the sound's state. Pauses and markers go into the recording as annotations.
- **Reading them back:** `npm run playtest` re-simulates every session. It checks the replay is bit for bit, and that every body kept its promises. Then it summarizes the play and the machine.

**Why:** a playtest you can't study afterwards is an anecdote. The recording replays exactly what happened, and the report records how it ran on that machine, which nothing else can tell us. The owner plays the deployed build, so a crash or a closed tab must not cost the run there either.

### The motor's promises are watched for every body, for hours

**Decision:** one watch (`src/sim/bots/invariants.ts`) checks every body after every tick: never under the terrain, never inside anything solid, never more than a step up, never gaining height on ground too steep, never a NaN. The invariant tests, `npm run playtest` and the long fuzz run (`npm run fuzz`) all use it. The weekly CI run plays 20 fresh valleys with both bots for an hour each. A broken promise stops that run and saves its recording, so the failure can be re-simulated.

**Why:** the tests check a few minutes on five fixed valleys, and only the player. The guards share the motor, and fresh valleys find the corners that fixed ones never reach.

### Every engine, every push

**Decision:** a second workflow (`.github/workflows/engines.yml`) runs the browser tests in Chromium, Firefox and WebKit, and the self-test under Bun (JavaScriptCore), on every push. Branches named `ci/...` run it too, so a change to CI can be tried before it reaches `main`. Vite now bundles three before the browser tests start, because a dependency first met mid-run makes Vite reload the page under the running tests. A test that imports the renderer would hit that. It doesn't explain the occasional first-run hang seen before: no browser test imports three yet. If that hang comes back, `DEBUG=vite:deps` shows what Vite is doing.

**Why:** a recording made in Safari has to replay in Chrome, and in CI. Every engine gives the golden values.

**What it found:** WebKit's high-pass filter passes 1–2 dB less than Chromium's at the same settings. Footsteps on grass, the only voice that used one, came out quieter than the simulation said. Grass now uses a wide band-pass, whose Q means the same in every engine. A calibration tool (`tests/browser/calibrate.test.ts`, run with `VITE_CALIBRATE=1`) re-derives every voice's loudness trim.

### What is drawn is what can be hit, from any camera

**Decision:**

- **Guards:** a guard whose body holds the camera isn't drawn (the fly camera, or a guard shoved into you against a wall). Walking guards no longer bob: the bob was the renderer's own, so the drawn head sat up to 3.5 cm from the hit sphere.
- **Foliage:** the canopy or bush the camera is in shows its inner faces, translucent (`src/render/interiors.ts`), using the same shapes and placement as the outside.

**Why:** a closed shape seen from inside is a hole, or slivers of faces cut by the near plane. A drawn shape that moves without its hit shape breaks the promise that guards' meshes make: lab B's 300 m shot at a walking guard depends on it. If walking bodies should bob, they bob in the simulation (lab B's call), and the drawing follows.

**Found on the way:** canopies are drawn opaque but block no sight in the simulation, and a bush hides you while you see out of it freely. What foliage does to sight, in both directions, is lab A's to decide. It's listed in the plan under M8.

### Sound plays in the game, at the moment the picture shows

**Decision:** The sound engine is wired into the game (`src/app/sound.ts`):

- **Starting:** the audio context is made on the first "Click to begin", the gesture browsers require, and woken on every later one.
- **Listening:** the listener is the camera. In your body it's at your eyes; in the fly camera it's wherever the camera is, so you can fly to a guard and listen to him.
- **Pausing:** a pause ducks everything to a quarter; a hidden tab suspends sound.
- **Volume:** the volume setting is heard on a square law.
- **Muffling:** the straight path is checked through the world query (`src/audio/muffle.ts`), so a gate an entity closes muffles the generator as a wall does.
- **Timing:** each event plays when the frame on screen reaches its moment, plus about a frame. The picture runs a tick behind the newest state, so a sound waits `(t − shown) / scale + hold`, at most a quarter of a second. The hold covers a tick computed late in its frame; it tracks the frame time, jumping up for a slow frame and easing back down. A sound the picture has passed plays at once.
- **Failures:** sound is never essential. Without Web Audio, or after any error in it, the game plays on silently and the debug panel says why. The panel also shows the context's state, latency and voices, and the steady sources in earshot.

**Why:** a tick's events used to reach the speakers when the frame that ran the tick was drawn: late by up to a tick, and by a different amount each time. In a model of the loop, with frames ±25% uneven, a sprint's steps wandered 28–47 ms from their period at 24–144 fps. That's enough to hear a steady stride as uneven. Timed against the picture, they stay within 3 ms of the model's wall clock (a test holds them under 4). In a real browser the audio clock's own steps, a few milliseconds a callback, come on top. That is still well under what an ear notices in a stride. The added frame roughly matches the screen's own latency, so sound stays in step with what you see.

### The world's steady sounds are listed by the simulation

**Decision:** Where the creek and the generator sound from, and how far they carry, is a function of the world in the simulation (`src/sim/world/ambient.ts`), not of the audio. The speakers play that list.

**Why:** lab A masks footsteps with these same sources. Kept in one list, the creek you hear and the creek a guard hears stay the same creek, and the hearing law stays one law.

### A footstep happens where and when the stride runs out

**Decision:** The motor stamps each footstep with the moment within its tick that the stride ran out, and the place the body was then. It no longer uses the tick's end. `SIM_VERSION` 6: every run's behaviour fingerprint moved, and no state did.

**Why:** a sprint takes a step every 9.27 ticks. Stamped at tick ends, its steps beat 9, 9, 10: a gallop you can hear at 30 Hz. Stamped at the true moment, they come exactly a stride apart in time and space, whatever the tick rate. A test holds the sprint to its period, and the head bob below lands on these moments.

### The head bob follows the body's stride

**Decision:**

- **What drives it:** the camera's dip is a pure function of how far through its stride the body is, and how fast it moves (`src/sim/motor/bob.ts`). It used to be a phase the renderer advanced by itself.
- **Shape:** the eye is lowest as a foot comes down, and highest half a stride later.
- **Depth:** it deepens with speed through each gait's depth (`tuning.view.bob`), from nothing at rest, so stopping never pops the view.
- **Optics:** the bob fades out as an optic comes up. Through one, the camera is exactly at the simulation's eye, where a shot leaves from.

**Why:** with the footsteps above, the dip lands on the step you hear, to the sample: a test checks that the interpolated stride starts over at each footstep's moment within its tick. The functions use exact arithmetic, so lab B can have the simulation evaluate the same bob if it decides shots leave from the bobbing eye.

### Scenes: one definition, run headless, played in the browser, replayed

**Decision:** A scene (`src/sim/scene.ts`) is a world (generated from a mission spec, or built by hand with `gen/handmade.ts`), the systems it adds, a setup before the first tick, a driver for headless runs (a bot or a list of waypoints), and expectations checked during and after the run. The same definition runs headless (`npm run scene`, and every scene in the tests), is played in the browser (`?scene=<name>`), and re-simulates from a recording, which names the scene and its version (recording format 9). Scenes live in `src/sim/scenes`, under the simulation's rules, and the self-test pins each one's fingerprints in every engine. A hand-built world's mission spec says so (`terrain: { kind: 'handmade' }`), and only its scene can build it.

The first scene is the movement course: stairs, a 1 m and a 2 m drop, ramps of 30° and 40°, a ceiling to crouch under, a crawl space, six surfaces.

**Why:** each Phase 1 lab is a scene built to its exit test, and needs to be playable, scriptable and replayable without building its own harness. A regression test that needs more than one tick is a scene too.

### Keys are bound to actions, in a table; settings belong to the player

**Decision:** Every key and button is bound to a named action in a context (on foot, always, the debug view, the fly camera) in one data table (`src/app/actions.ts`). The input controller tracks what is held and fires what is pressed, by action; the game handles actions, never key codes; the legends on the start screen and in the debug view are drawn from the table. The player's settings (sensitivity, field of view, invert, volume, raw mouse input) live in this browser's storage, not in tuning or recordings: a recording stores the view angles the mouse produced, whatever the sensitivity.

**Why:** each lab adds controls (lab B's breath and optic, lab C's lean); with a table, they add rows instead of key checks scattered through the input code, and rebinding, a gamepad or a touch layout later is data. Settings are a person's, so they follow the person, not the build.

### Systems explain themselves through a debug channel

**Decision:** A system draws for the debug view with `ctx.debug(draw => …)` (`src/sim/debugDraw.ts`): lines, points, circles and labels, coloured by meaning. The callback runs only while the debug view is on; what it draws isn't state, isn't hashed or recorded, and nothing in the simulation reads it back. The renderer draws the newest tick's lines, and the HUD places its labels. The first user is the controller overlay: the player's body circle, rim probes, heading, a label with slope against the limit, sliding, footing and mode, and every push of the resolve passes.

**Why:** rule 8 asks every system to ship explainable, and labs A to E need to show what their systems decided and why (a perception ray, a suspicion level, a path). Without one channel, each lab would reach into the renderer its own way, or leave debugging state in the simulation.

### Camps stand at sites

**Decision:** A camp is laid out in the frame of its site (`gen/site.ts`): the camp's centre, the direction its gate faces, and its pad. Everything that looks for the camp asks the site rather than the origin: validation's perches and approaches, the spawn's facing, the props kept clear of the pad, the first view, the benchmark's flight and the debug view's sight lines. The procedural valley still builds one site at the origin, so nothing moved: the valley's fingerprint is unchanged. A test builds the same camp at a site 380 m away and finds every collider, guard and routine simply moved.

**Why:** lab D's camp generator, several bases in one map and camps on real terrain all start from "build a camp here"; converting the camp's coordinates later would mean finding every place that quietly meant (0, 0).

### Brains decide from what they perceive

**Decision:** A guard's brain lives in `src/sim/ai` and decides from a `GuardMind` (`ai/mind.ts`): his own body, his post and routine, the static world, the tuning, the time, and his percepts. The mind is built outside the boundary from the guard's own state and perception's output (`entities/guards.ts`, `guardMind`). An architecture test allows `src/sim/ai` to import only the core, generation, the static world, the motor's types, events, the environment and the tuning's type: never the state, the simulation or the systems. Keeping to the routine is the first brain (`ai/routine.ts`), with behaviour unchanged.

A no-omniscience test plays the valley twice with the player 600 m apart in two places no guard can perceive: wherever a guard has the same mind in both runs, his decisions must match bit for bit. A brain that peeks at the player's true position fails it, and the test proves that too.

**Why:** a stealth game is only fair if guards know what they could have perceived. If the rule were a convention, lab E's first shortcut would read the player's position from the state; as a boundary with a test, a leak fails the build.

### The rules decide the outcome, in the state

**Decision:** Every run has an outcome in the state tree: playing, then succeeded or failed, with a reason and the tick (`STATE_SCHEMA` 6). Rules are a system in the 'mission' phase that calls `decide`; the first decision stands and emits an `outcome` event, so the debrief can walk its causes. A headless scene run ends when its rules decide (unless the scene plays on), and the browser stops the run, shows the outcome and offers to play again.

**Why:** each lab's exit test ends in an outcome (detected or not, the shot earned or not, the escalation contained or not), and Phase 2's mission rules plug into the same place. Kept in the state, an outcome replays and seeks like everything else.

### Falls follow gravity exactly

**Decision:** A body in the air moves by the exact constant-gravity step (y += v·dt − ½g·dt², v −= g·dt), and lands at the speed it has when it reaches the ground within the tick, not at the start of that tick. A fall from h now lands at exactly √(2gh), whatever the tick rate (`SIM_VERSION` 5).

**Why:** the movement course's first check found the old step falling a little faster in position but landing about 4% slower than gravity says (4.25 m/s from 1 m instead of 4.43), so landing noise didn't match its tuning's own note. No bot run in the self-test had fallen far enough to show it; the course now pins both drops in every engine.

### Solid things can appear, move and vanish

**Decision:** An entity can have a solid shape: a collider in the world frame, kept in the state tree (`SolidEntity`, kind `solid`, for now the only kind with one). `Solids` (`src/sim/world/solids.ts`) shows the world's colliders and every entity's shape as one set: the motor, the world query, the light and the renderer all ask it, so a gate stops a body, a shot and a sight line exactly as a wall does. An entity's collider id is a fixed offset plus its entity id, the same for the whole run and across restores. Whatever moves a shape never moves it into a body (it checks with `overlapsBody`, then waits or stops): that keeps the motor's invariant that no body ends a tick inside anything solid, and a test runs a gate that waits for the player. Until a kind of entity has its own mesh, the renderer draws its shape (in both views, so nothing solid is invisible).

**Why:** doors, the escape vehicle and the reinforcement truck (labs D and E, Phase 2) all need it, and retrofitting it would mean reworking every collision path of the motor later, under its invariants. With no entities' shapes in play, every answer is the same as before: the behaviour goldens and the golden recording are unchanged, and a tick costs the same.

**Not yet:** bodies don't ride what they stand on, and the spatial grid doesn't know about doors; both come with the lab that needs them.

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
