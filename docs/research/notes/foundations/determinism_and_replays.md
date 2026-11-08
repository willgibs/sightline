# Determinism, replays, save-states and simulation testing: practices and pitfalls for Sightline

Researched 7 Nov 2026. Each finding ends with a **Fit** line for Sightline: a fixed 30 Hz TypeScript sim, its own deterministic math, per-entity seeded streams, one plain-data state tree hashed by exact bits, inputs-only recordings with checkpoint hashes and 10 Hz state samples, refusal of recordings from other builds, structuredClone save-states with cached-save-state seeking, behaviour and state goldens, a fuzzing bot with per-tick invariants, and five labs about to work on parallel branches. The tags are **Covered**, **Partly**, **Not covered** and **N/A yet**. Coverage claims were checked against the repo: `src/sim/core/hash.ts`, `src/sim/record/recording.ts`, `src/sim/record/resim.ts`, `src/sim/record/seek.ts`, `src/headless/fuzz.ts` and `tests/state.test.ts`.

The session's shared web-search budget ran out partway through. Later items were checked by fetching known primary URLs directly, and the topics left unsearched are listed under Gaps.

## Q1. How do shipped games implement deterministic replays or lockstep, and keep replays working across patches?

### Takeaway
Inputs-only replay systems are always tied to the build that recorded them. That holds for Age of Empires, Supreme Commander, StarCraft II, Factorio, League of Legends' server, Halo Theater, Trackmania and Doom. Shipped games keep old replays playable in one of three ways:
- **Keep the old build.** StarCraft II quietly loads the old game version.
- **Keep the old behaviour switchable inside the new build.** Doom source ports do this with compatibility levels.
- **Let replays expire.** Overwatch and Halo do this.

Snapshot or "curve" replays don't depend on determinism, only on format compatibility. Examples are Planetary Annihilation's ChronoCam and Overwatch's replay system. They buy cheap seeking at the cost of size.

Sightline already has what the best of these have: inputs as the source of truth, state hashes and refusal with a reason. What it lacks is a way to *play* an old recording rather than refuse it.

### Cited Findings

#### Lockstep and inputs-only replays
- **Age of Empires** ("1500 Archers on a 28.8", Paul Bettner and Mark Terrano, 22 Mar 2001) [Bettner & Terrano](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
  - Every machine runs the same simulation from the same commands.
  - A command issued in one turn executes two turns later. Turns were about 200 ms, and "speed control" adjusted their length to the slowest machine and the latency.
  - Checksums covered the world, objects, pathfinding and targeting. A mismatch was tagged "out of sync" and the game stopped.
  - **Fit:** Sightline's checkpoint hashes, taken part by part every 10 s, play the role of AoE's per-system checksums. **Covered.**
- **Age of Empires sync debugging.** Finding a bug meant "Giant (50MB) message traces and world object dumps to sift through." Programmers had to keep "the same number of calls to random." For their next engine (RTS3) the team built per-system sync macros (`syncRandCode`, `syncRandData`) that could be compiled out of release builds [Bettner & Terrano](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
  - **Fit:** Per-entity, per-purpose streams (`ctx.draw(id, purpose, use)`) remove the "same number of random calls" fragility at its root. **Covered.** Tagged per-system trace logs that can be switched on to localize a divergence are **Partly** covered: part hashes say which part diverged, not which line.
- **Age of Kings recordings as bug reports.** Age of Kings added recorded games. Because the simulation is deterministic, a recording reproduces a bug exactly, which made recordings a way to share repro cases [Bettner & Terrano](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
  - **Fit:** Same idea as `playtests/` and `npm run sim -- --replay`. **Covered.**
- **Supreme Commander and Demigod** (Forrest Smith, 9 Jul 2011) [Smith 2011a](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/).
  - The sim ran at a fixed 10 ticks per second. A separate user layer at about 60 fps interpolated positions for display.
  - Commands were scheduled for a future SimTick.
  - The whole game state was hashed once per second, and any mismatch ended the game with "Desync Detected". There was no recovery.
  - **Fit:** Sightline's sim/render split (rule 1) and its pure-function drawn motion (rule 14) are the same layering. **Covered.**
- **Supreme Commander debugging and causes** [Smith 2011a](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/).
  - Desyncs were debugged by binary search, printing the memory hash while walking the state. Rare ones meant looping games on several machines until one broke.
  - Uninitialized variables were "one of the most common causes".
  - Replays store inputs only, so they "break when a game is patched" and are hard to rewind.
  - **Fit:** TypeScript removes uninitialized memory. Its analogues are `undefined` turning into NaN in arithmetic, and state held outside `sim.state`. Rule 9 and `tests/state.test.ts` guard against both. **Covered.**
- **"Sync Harder"** (Smith, 24 Jul 2011): "The issue with desyncs is that the bug is always there, it just shows up some of the time." Smith argues against recovery systems in favour of fixing the desyncs [Smith 2011b](https://www.forrestthewoods.com/blog/synchronous_rts_engines_2_sync_harder/).
  - **Fit:** Sightline does the same: `sim.fault` stops the simulation, and recordings are refused rather than "nearly" replayed. **Covered.**
- **A Gas Powered Games engineer on IEEE floats** ("Elijah", quoted by Glenn Fiedler, 24 Feb 2010): "We have never had a problem with the IEEE standard across any PC cpu AMD and Intel with this approach." Fiedler concludes that one compiler and architecture plus care can be deterministic across machines, but arbitrary C++ is not, even between debug and release builds [Fiedler](https://gafferongames.com/post/floating_point_determinism/).
  - **Fit:** JavaScript gives Sightline "one compiler" for + − × ÷ by specification (see Q2). **Covered.**
- **Factorio** [Factorio wiki](https://wiki.factorio.com/Desynchronization).
  - Multiplayer is lockstep: "all players' games need to simulate every single tick of the game identically."
  - When a client detects a desync, it disconnects and re-downloads the map.
  - The desync report holds the client's save at the desync ("desynced-level"), the server's save after reconnecting ("reference-level.zip") and the log. Developers diff files such as `script.dat` and `level_with_tags_tick_XXXX.dat`.
  - **Fit:** Sightline's part hashes say when and which part diverged. Factorio also ships *both full states* for a diff. **Partly** covered: there is no automatic state-tree diff at the first divergent tick.
- **Factorio heavy mode.** It "save[s] and load[s] the game every tick" and flags any state change across the round trip, writing dumps [Factorio wiki](https://wiki.factorio.com/Desynchronization). Forum threads show it also gives false positives, for example on mod state [Factorio forums](https://forums.factorio.com/viewtopic.php?p=686390).
  - **Fit:** `tests/state.test.ts` does one save and restore after 60 s. The fuzz run (`src/headless/fuzz.ts`) does not round-trip state every tick. **Partly** covered.
- **League of Legends** (Riot, 20 Jun 2017) [Riot, Introduction](https://www.riotgames.com/en/news/determinism-league-legends-introduction).
  - Server Network Recordings capture inputs, match settings and configuration.
  - Playback runs faster than real time: recovering to minute 40 "often takes under 3 minutes".
  - This made Chronobreak possible, rewinding live esports games after a bug. The work began as "Delta Checker" tests "driven from a set of recordable inputs."
  - **Fit:** Same architecture as Sightline's recordings and re-simulation. **Covered.**
- **What Riot had to fix** (Jun 2017) [Riot, Implementation](https://www.riotgames.com/en/news/determinism-league-legends-implementation).
  - It unified "6 completely different clock and timing APIs" into one clock.
  - It replaced several random generators with one xorshift generator seeded by the game id.
  - It added validation tools that flag variables that "end a frame with a nondeterministic value".
  - It found that pointer-keyed ordered maps iterate in different orders from run to run, and that recordings made on one OS could diverge on another.
  - It replaced the network layer with fake client endpoints for playback.
  - **Fit:** Sightline built these in from day one: no clocks in the sim, per-entity streams, ids not pointers, and quantized input. Its test that every leaf moves the hash corresponds to Riot's "nondeterministic value at frame end" check. **Covered.**

#### Snapshot and curve replays (not dependent on determinism)
- **Planetary Annihilation's ChronoCam** (Forrest Smith, 9 Oct 2013) [Smith 2013](https://www.forrestthewoods.com/blog/tech_of_planetary_annihilation_chrono_cam/).
  - Lockstep replays are tiny: an hour of StarCraft fits in "under 100kb".
  - But "old replays are often invalidated by patches," which is "particularly problematic with synchronous engines," and StarCraft II works around it by loading an old copy of the game.
  - PA instead sends every server-to-client value as a curve of keyframes (linear, step and pulse), so the client can jump, scrub and play in reverse. Seeking requires that no frame depend on the previous one, and walk animations had to start at random frames.
  - PA planned backwards-compatible serialization (UberProto) so that replays from any earlier version would play.
  - **Fit:** Sightline's 10 Hz STAT track holds float32 player and guard poses, so a lightweight version of this already exists. If the viewer could draw a run from STAT alone, old recordings would stay *watchable* even after `SIM_VERSION` moves. **Partly** covered.
- **Overwatch.**
  - Tim Ford's GDC 2017 talk "'Overwatch' Gameplay Architecture and Netcode" covers its ECS and "how it uses determinism to achieve responsiveness and precision" [GDC Vault, Ford](https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and).
  - Philip Orwig's GDC 2017 talk "Replay Technology in 'Overwatch': Kill Cam, Gameplay, and Highlights" covers refactoring the client "to support an interruptible kill cam," and a replay system built for both players and internal use [GDC Vault, Orwig](https://gdcvault.com/play/1024053/Replay-Technology-in-Overwatch-Kill).
  - **Fit:** An interruptible replay that hands control back to live play matches Sightline's debrief and replay. The lesson is to keep replay a mode of the same client, not a separate player. **Covered** (ReplaySeeker reuses `Simulation`).
- **Overwatch replays expire with patches.** A third-party guide says replay codes load only on the patch they were made in [clip.dor.gg guide](https://clip.dor.gg/en/blog/overwatch-replay-guide). Overwatch 2 update 3.83 "Wipes Existing Replay Codes" [MP1st](https://mp1st.com/?p=267506). These are secondary sources, and no official policy page was found.
  - **Fit:** Expiry is acceptable for player replays but not for regression fixtures (`playtests/`, the golden recording). **Covered** for fixtures: `npm run golden` re-records.
- **Rocket League.** Jared Cone's GDC 2018 talk "It IS Rocket Science! The Physics of 'Rocket League' Detailed" covers its "networked physics" [GDC Vault, Cone](https://gdcvault.com/play/1024972/It-IS-Rocket-Science-The). The public abstract does not describe the replay mechanism.
  - **Fit:** No transferable detail confirmed.

#### Keeping replays alive across patches (versioning)
- **StarCraft II keeps every build.**
  - Blizzard: "StarCraft II has always automatically loaded replays in the appropriate version of the game behind the scenes." Loading an older version "has to disconnect from Battle.net."
  - Patch 2.0.10 added jumping ahead to any time in a replay. Before it, viewers could only seek back or forward to times already reached. The page is undated, from the Heart of the Swarm era [Blizzard, 2.0.10](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10).
  - **Fit:** Sightline recordings already carry the build stamp (`h.build`, which `resim.ts` reports when refusing). The analogous step is to open a refused recording in the deployment that made it. **Not covered.**
- **Even keeping builds fails when the container format changes.** Patch 3.0 (Oct 2015) dropped pre-3.0 replays because of a new "file format for compressing and storing game files". Blizzard promised that replays from 3.0 on "will be supported in future versions" [Kotaku, 6 Oct 2015](https://kotaku.com/starcraft-iis-new-patch-wont-support-old-replays-1734891305). Players report that just after patch 5.0.13, 5.0.12 replays failed with "The version of StarCraft II required to play this game is not available" [Blizzard forums](https://us.forums.blizzard.com/en/sc2/t/old-5012-version-replays-are-broken-after-5013-patch/28404). These are anecdotal.
  - **Fit:** If Sightline routes old recordings to old deployments, the route must not depend on today's file format. Keep the outer `SLRC` header readable forever. **Partly** covered: tagged tracks with skip-unknown are forward-friendly.
- **Doom demos and compatibility levels.**
  - Doom `.lmp` demos usually play back only with the same IWAD and executable or source port. A mismatch makes the player "run into walls and shoot apparently at random" ("desynch"). Even v1.9 and v1.9f differ [DoomWiki talk](https://doomwiki.org/wiki/Talk:Demo).
  - Ports such as PrBoom+ keep old behaviour selectable with `-complevel`: 2 for Doom2.exe, 3 for Ultimate Doom, 9 for Boom and -1 for current. Some vanilla demos still desync at the right level.
  - With Boom's `demo_insurance=0`, demos "stand a good chance of losing sync on the next version of Boom" [Doomworld forum](https://www.doomworld.com/forum/post/1357758); [Doomworld forum](https://www.doomworld.com/vb/post/643972). These are forum sources.
  - **Fit:** Compatibility levels are the "old behaviour inside one binary" option. For Sightline that would mean keeping old system versions in code, which costs too much while five labs are changing behaviour weekly. Prefer old builds. **N/A yet.**
- **TASVideos pins emulator versions.** "If your run fails to sync on an official release, it cannot be verified, and thus cannot be accepted." Anything affecting sync, including emulator settings, "must be stated in the submission text" [TASVideos Movie Rules](https://tasvideos.org/MovieRules).
  - **Fit:** Sightline's recording header embeds the versions, build, mission spec and full tuning, which is the same contract. **Covered.**
- **Halo Theater** "works by recording the button inputs from players and non-playable characters" [Halopedia](https://www.halopedia.org/Theater_mode).
  - A Halo 3 beta update erased saved films [N4G](https://n4g.com/news/39910/halo-3-beta-already-updated-films-erased).
  - Halo 4 campaign theater in the Master Chief Collection (July 2023) is marked "Experimental" because of "bugs and quirks in the original implementation" [Halopedia](https://www.halopedia.org/Theater_mode).
  - A Halo support article reportedly says some updates invalidate Theater films in the Master Chief Collection. The page returned 403, so this rests on the search summary alone [Halo Support](https://support.halowaypoint.com/hc/en-us/articles/360049568292).
  - **Fit:** Same lesson as Overwatch. **Covered** for dev fixtures.

### Inferences
- **Route refused recordings to the build that made them.** Recordings already store `h.build`. Because every push to `main` and every branch deploys, a refused recording could offer to open in its own deployment (StarCraft II's approach).
  - Cost: the deployment URL, or a SHA-to-URL map, has to be resolvable.
  - Risk: Vercel's deployment retention policy is unverified (see Gaps).
  - This would keep five labs' playtest sessions viewable across `SIM_VERSION` bumps without compatibility code.
- **Fall back to STAT-only viewing.** When no old build is reachable, a "watch only" mode from STAT (ChronoCam-style samples) would still show the run, clearly labelled as not re-simulated.
- **Desync responses rank by cost.** Refuse (Sightline today), then keep old builds (StarCraft II), then keep old behaviour in the same binary (Doom complevels). Overwatch and Halo show players tolerate expiry. For a dev-phase project, the first two are enough.

### Gaps
- Factorio's replay feature and whether replays survive versions, and Factorio's own trig functions for cross-platform determinism. Both were planned searches cut off by the search budget.
- Rocket League's replay mechanism (state stream versus inputs). The only finding is secondary: v2.52 patch notes reportedly "fix old replays not working" [Reddit mirror](https://r.darklab.sh/r/RocketLeague/comments/1km06dz/rocket_league_patch_notes_v252_release_thread/msdhlh4/?context=3).
- The content of the Overwatch GDC talks beyond their abstracts. The full talks need GDC Vault access.
- Supreme Commander's own replay versioning, and Forged Alliance Forever's handling of old game versions. Not retrieved.
- Vercel's current deployment retention policy, which is needed before relying on old deployments for replays.

## Q2. Floating point in JavaScript and WebAssembly: what is guaranteed, what differs, and what the setup may be missing

### Takeaway
ECMAScript fixes + − × ÷ (IEEE binary64, round to nearest, ties to even) and a few exact functions (`floor`, `round`, `fround`, `abs`, `min`, `max`). Every other `Math` function, *including `Math.sqrt`*, is "implementation-approximated" in the spec text. Sightline's reliance on `sqrt` therefore rests on universal practice (hardware sqrt is correctly rounded by IEEE 754), not on the language spec.

Engines do change their transcendental functions:
- V8 has moved from an fdlibm port to LLVM-libc implementations.
- V8 and WebKit have both had `pow` results that differ by JIT tier.

Sightline's ban on native transcendentals and `**` is therefore the right call.

WebAssembly is stricter: `sqrt` is correctly rounded by definition. But NaN payloads and signs are nondeterministic outside Wasm 3.0's deterministic profile, and relaxed SIMD is deliberately nondeterministic (fused or unfused multiply-add, for example).

### Cited Findings
- **What ECMAScript leaves to engines.** For the Math functions, "the choice of algorithms is left to the implementation"; using fdlibm is "recommended (but not specified by this standard)". `Math.sqrt` step 4: "Return an implementation-approximated Number value representing the result of the square root of ℝ(n)." `Math.hypot` is also implementation-approximated. `Math.round` returns "the integral Number closest to n, preferring the Number closer to +∞ in the case of a tie" (exact), and `Math.fround` is exact [ECMAScript 2024 via read262](https://read262.netlify.app/numbers-and-dates/math-object); [tc39 spec anchor](https://tc39.es/ecma262/#sec-math.sqrt).
  - **Fit:** Rule 2 lists `Math.sqrt` as allowed. That is true of every engine in CI, but the spec does not promise it. **Partly** covered: cross-engine CI exercises it; nothing guards engines outside CI.
- **The spec would even allow a crude sqrt.** A Japanese write-up on JS math accuracy notes the spec's wording would not be violated by something as crude as `Math.sqrt(5) = 2` [uhyo, zenn.dev](https://zenn.dev/uhyo/articles/javascript-math-accuracy). A TC39 pull request (#903) discussed defining `sqrt` as correctly rounded, noting that JSC, ChakraCore, SpiderMonkey and V8 already behaved that way. Its outcome was not confirmed [tc39/ecma262 PR 903](https://github.com/tc39/ecma262/pull/903).
  - **Fit:** Supports adding a known-answer self-test for `sqrt`. **Not covered.**
- **What IEEE 754 guarantees.** Addition, subtraction, multiplication, division and square root return the correctly rounded exact result, given the same inputs, settings and destination precision. Transcendentals are not IEEE-defined, and compile-time and run-time results can differ (Bruce Dawson, "Floating-Point Determinism", 16 Jul 2013) [Dawson](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/).
- **Dawson's remaining hazards** [Dawson](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/):
  - per-thread FPU settings (x87 precision, rounding mode, denormal handling), which a printer driver or DirectX could change;
  - FMA, under which `a*b + c*d` may not be zero when it mathematically should be;
  - reciprocal and reciprocal-square-root estimate instructions that differ by vendor;
  - CPU-feature code paths in libraries;
  - uninitialized data.
  - In comments, Company of Heroes 2 reportedly gave up and split multiplayer by platform, and Spring RTS used streflop.
  - **Fit:** JavaScript removes the FPU-mode, estimate-instruction and FMA hazards for scalar `Number` arithmetic, because each operation must be rounded on its own. That leaves transcendentals, which `detmath.ts` handles. **Covered.**
- **`**` and `Math.pow` can disagree within one engine.**
  - V8 constant-folded `99**99` with a different `pow` than its runtime `Math.pow`. The runtime result was off by 4+ ulp in Chrome 55; this was reported as V8 bug 5848 in January 2017 [Christoph Michel, freeCodeCamp](https://www.freecodecamp.org/news/i-found-a-bug-in-v8s-exponentiation-operator-dcddfa5b8482/).
  - WebKit noted that its fast exponentiation path can produce "different results depending on the representation of arguments and the tier we are on" [WebKit bug 147167](https://bugs.webkit.org/show_bug.cgi?id=147167).
  - **Fit:** Rule 2 bans `**` and `Math.pow` in `src/sim`, and `tests/architecture.test.ts` enforces it. **Covered.** The lesson is that a single passing run proves little when results depend on JIT tier.
- **V8 has changed its math library.** V8's `src/base/ieee754.cc` still opens with "adapted from fdlibm". On `main` today, its `sin`, `cos` and `pow` forward to `LIBC_NAMESPACE::shared::sin/cos/pow`, LLVM libc's shared math [V8 source, ieee754.cc](https://github.com/v8/v8/blob/main/src/base/ieee754.cc).
  - **Fit:** Native `Math.*` results can change between versions of the *same* engine. That is consistent with the project's observation that Chrome and Node disagree in the last bit. `detmath.ts` is the right defence. **Covered.**
- **Native physics engines ship cross-platform determinism without fixed point.**
  - Box2D v3 (Erin Catto, 27 Aug 2024) turned off fast-math, disabled FMA contraction (`-ffp-contract=off`), and wrote its own `sinf`, `cosf` and `atan2f` because "atan2f gave different results across platforms." `sqrtf` compiles to `sqrtss` and is deterministic.
  - Its CI runs a "Falling Hinges" scene on every pull request and checks two numbers: steps until all bodies sleep (310) and a transform hash (0x5e70e5fe). It was tested on x64 and ARM with MSVC, GCC and Clang. Catto says fixed point is "no longer necessary" [Box2D blog](https://box2d.org/posts/2024/08/determinism/).
  - The Box2D FAQ claims cross-platform determinism from v3.1, assuming precision is not mixed [Box2D FAQ](https://box2d.org/documentation/md_questions.html).
  - **Fit:** This mirrors `detmath.ts` plus goldens. A second, *meaningful* number next to the hash (steps-to-sleep) makes churn reviewable. **Partly** covered: scenes have expectations, and the fingerprints are opaque hashes.
- **Jolt Physics.**
  - Determinism requires the same API call order and "The same binary code".
  - A cross-platform option costs about 8% speed. Platforms verified "with every build" include "WASM32 emscripten running in nodejs" and WASM64.
  - It recommends `-ffp-model=precise` and `-ffp-contract=off`, and avoiding standard trig functions and `std::sort`.
  - Its sample app's "Check Determinism" records state, rewinds and reruns each step [Jolt docs](https://jrouwe.github.io/JoltPhysics/index.html).
  - **Fit:** The `std::sort` warning has a JavaScript analogue in `Array.prototype.sort` with a comparator that is not a consistent total order (see Q7). The "Check Determinism" rewind-and-rerun is **Not covered** in Sightline's fuzz run.
- **Rapier** is "locally deterministic" by default. Its `enhanced-determinism` feature gives cross-platform determinism on targets that "strictly comply to the IEEE 754-2008" standard, which "include most modern mainstream processors as well as WASM targets." It requires bodies to be inserted in "the exact same order" and math through nalgebra traits rather than `f64::sin` [Rapier docs](https://rapier.rs/docs/user_guides/rust/determinism).
  - **Fit:** This is the precedent if a lab ever wants a Wasm physics or pathfinding module inside the sim. **N/A yet.**
- **WebAssembly NaN rules.** When an operator other than `fneg`, `fabs` or `fcopysign` returns NaN, "its sign is non-deterministic." The payload is canonical only if all NaN inputs were canonical; otherwise it is "picked non-deterministically among all arithmetic NaNs." "In the deterministic profile, only positive canonical NaN outputs are produced." Rounding "always is round-to-nearest ties-to-even" [Wasm spec, numerics](https://webassembly.github.io/spec/core/exec/numerics.html).
  - **Fit:** Sightline uses no Wasm today. **N/A yet.** `Hasher.f64` already hashes every NaN alike, so a Wasm NaN would not fork the hash, though it could still fork behaviour through bit-level reads.
- **Wasm 3.0** (17 Sep 2025) specifies "a deterministic default behavior for every instruction" with otherwise nondeterministic results, covering NaN generation and the relaxed vector instructions. Between platforms implementing that profile, "Wasm thereby is fully deterministic, reproducible, and portable" [WebAssembly news](https://webassembly.org/news/2025-09-17-wasm-3.0).
  - **Fit:** No source found says browsers run pages under the deterministic profile (see Gaps). **N/A yet.**
- **Relaxed SIMD is nondeterministic by design.** Relaxed `madd`/`nmadd` may be "evaluated with higher precision and then only rounded once (if supported by hardware)". Relaxed min, max, swizzle and truncation have implementation-defined edge cases, and the overview accepts that "two calls to the same instruction can return different results" [relaxed-SIMD overview](https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md).
  - **Fit:** Any future Wasm in the sim must be built without relaxed SIMD and audited for it. **N/A yet.**
- **NaN bit patterns are observable in JavaScript.** NaNs with different bit patterns can be observed through typed arrays [MDN, NaN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NaN). The spec lets an implementation write any NaN encoding into an ArrayBuffer [tc39 spec anchor, NumericToRawBytes](https://tc39.es/ecma262/#sec-numerictorawbytes); that wording was recalled, since the fetch could not reach the section body.
  - **Fit:** `Hasher.f64` canonicalizes NaN, and its comment records that x64 V8, ARM and JavaScriptCore differ ([hash.ts](src/sim/core/hash.ts)). **Covered.**

### Inferences
- **sqrt self-test.** Add known-answer cases (hard-rounding inputs) run at startup in every runtime, refusing to record or verify if they fail. Today's guarantee is "every engine CI runs," not "every engine."
- **JSON loses -0, NaN and ±Infinity** (spec behaviour; the spec text was not fetched in this session).
  - `JSON.stringify` writes `-0` as `"0"` and NaN and ±Infinity as `null`.
  - The recording header (mission spec, tuning) is JSON ([recording.ts](src/sim/record/recording.ts)), and so is `hashValue()`/`stableStringify()` in `hash.ts`.
  - A tuning or mission value of -0 or ±Infinity would therefore silently change in a recording, and two values that differ only by the sign of zero would fingerprint alike.
  - `tuning.ts` currently has no Infinity. A validation that rejects non-finite numbers and -0 in tuning and mission, or encodes the header's numbers as f64, would close it.
  - The state hash itself goes through `Hasher.f64` and distinguishes ±0. That is correct, because `atan2` and `1/x` behave differently on -0.
- **Sort and locale.** Any sim-side `Array.prototype.sort` needs a comparator that is a consistent total order with an id tie-break. Sightline should also make sure no sim code uses `localeCompare` or `Intl`, whose results depend on the user's locale and ICU version. An architecture-test rule could check both.
- **Keep Wasm out of the sim.** WebAssembly does not by itself make the sim *more* deterministic for a browser game (NaN, relaxed SIMD, and no control over the profile). Its one advantage is that `f64.sqrt` is correctly rounded by spec. Keep Wasm out unless a lab needs its speed.

### Gaps
- How SpiderMonkey (fdlibm) and JavaScriptCore (system libm) currently implement `sin`, `cos`, `exp` and `pow`, and their history. Searches were cut off by the budget. The project's own observation in `hash.ts` stands in.
- When V8 switched `sin`/`cos`/`pow` from its fdlibm port to LLVM libc. The source shows the current state, not the date.
- Whether any browser exposes or uses Wasm 3.0's deterministic profile for web content.
- A primary statement that JS JITs never contract a*b+c into FMA. It follows from per-operation rounding in the spec, but no engine document was retrieved.
- Denormals: the ECMAScript Number type includes subnormals [tc39 spec anchor](https://tc39.es/ecma262/#sec-ecmascript-language-types-number-type) (not re-quoted). No source was retrieved on Wasm forbidding flush-to-zero, or on subnormal performance cliffs in JS engines.
- Fixed-point engines such as Photon Quantum were not researched (search budget).

## Q3. Testing simulations: desync detection, invariants, property-based testing, fuzzing, golden masters, and golden churn across branches

### Takeaway
Mature teams test determinism the way Sightline does: golden checksums regenerated when logic changes deliberately, run on every change. They add two things Sightline lacks:
- **Constant rewind-and-replay of live state.** Examples are GGPO's SyncTest, Factorio's heavy mode and Jolt's "Check Determinism".
- **Tooling that keeps golden churn reviewable** as many contributors move baselines: rebaselining by bot inside the same change, and a merge queue that tests the merged result.

Property-based testing with shrinking (fast-check) would turn the chaos bot's long failing recordings into minimal input sequences.

### Cited Findings
- **Factorio's golden CRCs** (FFF #60, 14 Nov 2014). Integration tests create "a small map", run updates and check conditions. Then "a crc check is made against the set of presaved crc values", which "are simply regenerated when the game logic changes." Unit tests also cover "synchronization mechanisms in the multiplayer code" [FFF #60](https://factorio.com/blog/post/fff-60).
  - **Fit:** Same as the `behaviour`/`state` fingerprints and `npm run golden`. **Covered.**
- **Factorio's build server and visual tests.** In FFF #62 (Nov 2014), a build server was to run the automated suites daily "in all the systems and possible configurations," with manual checks such as "whether the replays are not broken again" [FFF #62](https://factorio.com/blog/post/fff-62). FFF #288 (29 Mar 2019) added graphics tests after "2 broken versions" caused by GUI logic [FFF #288](https://factorio.com/blog/post/fff-288).
  - **Fit:** CI runs the full check on every push, plus weekly macOS and Windows with a cross-platform hash comparison. **Covered.** Sightline's `npm run look` covers the visual side, though it is not a pass/fail test.
- **GGPO SyncTest.** "The sync test session is a special, single player session which is designed to find errors in your simulation's determinism." GGPO "will execute a 1 frame rollback for every frame," compares the re-executed state with the first execution, and "raises an error if they differ" [GGPO Developer Guide](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md). In `ggponet.h`, the `frames` parameter is "The number of frames to run before verifying the prediction. The recommended value is 1." The save callback can "compute a checksum of the data" [ggponet.h](https://github.com/pond3r/ggpo/blob/master/src/include/ggponet.h).
  - **Fit:** This would catch state outside `sim.state`, incomplete restores and hidden caches anywhere the bots go, not just in the one 60 s case in `tests/state.test.ts`. **Not covered** in `src/headless/fuzz.ts`.
- **Jolt's "Check Determinism"** "records state, rewinds, and reruns each step" [Jolt docs](https://jrouwe.github.io/JoltPhysics/index.html).
  - **Fit:** Same as above. **Not covered.**
- **Box2D's determinism scene in CI.** "When a change alters these [numbers], CI fails and the author can update the targets" [Box2D blog](https://box2d.org/posts/2024/08/determinism/).
  - **Fit:** Same as `selftest.ts`. **Covered.**
- **Fenceposts within a tick.** Michael Stallone's GDC talk "8 Frames in 16ms: Rollback Networking in 'Mortal Kombat' and 'Injustice 2'" covers the "engine changes, optimizations, and tools needed to roll back and re-simulate up to 8 frames in 16 ms" [GDC Vault, Stallone](https://gdcvault.com/play/1025021/8-Frames-in-16ms-Rollback). A secondary breakdown says "Thousands of fencepost checks validate that both clients are in sync at various points in the tick" [Edgegap](https://edgegap.com/blog/game-backend-deep-dive-mortal-kombat-x-injustice-2-rollback). Sources disagree on whether the talk was at GDC 2017 or 2018.
  - **Fit:** Sightline's `PHASES` in `systems.ts` are natural fencepost points: hash after each phase in a debug or bisect mode. **Not covered.** Checkpoints are every 10 s, by part.
- **Riot's divergence logs.** Riot's "Fixing Divergences" describes logs containing "a JSON-based representation of the evolving game state", and their problems: huge files and "severe performance implications" [Riot, Fixing Divergences](https://technology.riotgames.com/node/84). This comes from a search excerpt; the full text timed out.
  - **Fit:** Since Sightline re-simulates cheaply, divergence logs can be produced *on demand* by re-running to the failing checkpoint rather than logged always. **Partly** covered: `--replay` says where a run diverged.
- **fast-check model-based testing.**
  - Commands implement `check(model)` and `run(model, real)`.
  - `fc.commands` "can efficiently shrink failing scenarios", keeping only commands that ran, so `[A,B,C,A,A,C]` with `[A,-,C,A,-,-]` executed shrinks toward `[A,C,A]`.
  - Failures replay from `seed` and `path`, plus `replayPath`. `fc.modelRun` is synchronous [fast-check docs](https://fast-check.dev/docs/advanced/model-based-testing/).
  - **Fit:** Commands map onto `InputFrame` sequences, `run` onto stepping plus `InvariantWatch`, and shrinking onto minimal repro recordings. The synchronous sim suits `modelRun`. **Not covered:** fuzz failures are saved whole, unminimized.
- **Bots that hunt bugs.** Ariyurek, Betin-Can and Surer (arXiv, 2 Jun 2019) built "synthetic" and "human-like" test agents from RL and MCTS. The human-like ones use test goals from 427 human tester trajectories (MGP-IRL). Both are checked by an automated oracle. Across 3 games, 12 levels and 45 seeded bugs, they performed "comparably to human testers" [arXiv 1906.00317](https://arxiv.org/abs/1906.00317).
  - **Fit:** WanderBot and ChaosBot are synthetic agents. The human-like idea maps onto seeding fuzz runs from `playtests/` sessions, by perturbing recorded human inputs. **Partly** covered.
- **Chromium rebaselines by bot.** "The recommended way to rebaseline for a currently-in-progress CL is to use results from try jobs" (`blink_tool.py rebaseline-cl`). "The new baselines can be reviewed along with the changes." "If a test can be rebaselined, it should always be rebaselined instead of adding lines to TestExpectations," and reverting is preferred to suppressing [Chromium web test expectations](https://chromium.googlesource.com/chromium/src/+/main/docs/testing/web_test_expectations.md).
  - **Fit:** Generating golden values on CI and committing them in the same PR, with a human-readable diff, is how many contributors keep baseline churn reviewable. **Not covered.** Fingerprints are updated by hand plus `npm run golden`.
- **GitHub merge queue.** For each queued PR, the queue builds a temporary branch from "the latest version of the base branch", the PR's changes, and the PRs ahead of it. Required checks must run on the `merge_group` event. A failing PR is removed and the queue rebuilt [GitHub Docs, merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
  - **Fit:** Two lab branches that each update `selftest.ts` fingerprints can merge cleanly as text and still leave `main` red, because each was computed without the other's change. A merge queue catches this before it lands. **Not covered.** CLAUDE.md asks to keep `main` green but names no queue.

### Inferences
- **Synctest mode for fuzz.** Every N ticks:
  1. Save a state with `structuredClone`, step k ticks and hash.
  2. Restore and step the same k inputs again.
  3. Compare the two hashes, and the per-part hashes.

  Also restore through the *serialized* path (whatever saves to disk), not only `structuredClone`, to catch codec losses such as -0 through JSON.
  - This is Factorio heavy mode, GGPO SyncTest and Jolt's "Check Determinism" in one, and costs roughly 2× sim time on sampled ticks.
- **Minimize fuzz failures.**
  - Re-simulate the failing recording while delta-debugging the input frames (remove halves, then quarters, and so on), keeping the shortest prefix and sparsest input that still breaks the same invariant.
  - Alternatively, express bot actions as fast-check commands to get shrinking for free.
  - A two-second repro beats a 60-minute recording as a lab's bug report.
- **Bisect divergences automatically.** On a checkpoint mismatch:
  1. Re-simulate from the last matching save-state, hashing every tick, to find the first bad tick.
  2. Hash after each phase within that tick.
  3. Emit a path-level diff of the two state trees (`guards[3].mind.alert: 0.41 → 0.42`).

  This is Factorio's two-save diff, Supreme Commander's binary search and Mortal Kombat's fenceposts as a single command.
- **Golden churn with five labs.**
  - (a) Give each lab its own scene goldens, so a lab's change moves only its scene and the shared self-test moves only on deliberate cross-cutting changes.
  - (b) Have CI print *what* changed alongside the fingerprint: the first divergent tick and state path in the golden run, and a few semantic numbers in the Box2D style, such as detection time or shots to kill. Then a reviewer can judge "intended?" without re-running.
  - (c) Use a merge queue.
  - (d) Do not hand-increment `SIM_VERSION` on branches. Two labs bumping 6→7 for different behaviours would produce preview-deploy recordings that claim the same version. Either assign versions only at merge, or also refuse when `h.build` or the behaviour fingerprint disagrees.
  - (e) `docs/decisions.md` takes an append from every bump and will conflict at its tail. One file per decision, or git's `union` merge driver, would avoid that; the merge-driver behaviour is from general knowledge and was not verified here.

### Gaps
- The Sea of Thieves automated-testing GDC talk, EA SEED's and Ubisoft La Forge's game-testing papers, and published "chaos bot" practices. Searches were cut off by the search budget.
- The detailed rollback test methodology in Mortal Kombat. Only the GDC abstract and a secondary summary were retrieved. The reported "two man-years" of serialization work could not be attributed to a primary source.
- Riot's "Fixing Divergences" full text, and its date (the fetch timed out).

## Q4. Replays as debugging tools and as verification of leaderboard runs

### Takeaway
A deterministic recording is the best bug report a game can have:
- Age of Kings and League of Legends use them to reproduce bugs.
- Factorio's desync report ships both states for diffing.
- TASVideos accepts runs only if they sync on a stated emulator build.

As *proof* of a leaderboard run, re-simulation proves only that the inputs are legal under the sim, not that a human produced them at real-time speed. Trackmania's slowed-down records passed replay validation and were caught by input statistics.

### Cited Findings
- **Bug reports.**
  - Recorded games in Age of Kings reproduce bugs exactly and became shareable repro cases [Bettner & Terrano](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
  - Riot's Server Network Recordings let it re-run server games for tests (Delta Checker) and for esports recovery [Riot, Introduction](https://www.riotgames.com/en/news/determinism-league-legends-introduction).
  - **Fit:** `playtests/`, `npm run playtest` and `Recorder.recordFault` (rule 5) already make every session and fault a repro. **Covered.**
- **Desync reports with screenshots on the exact tick.** Factorio's "Deep desyncs" (FFF #340, 27 Mar 2020) traced two mod desyncs from player desync reports and "screenshots taken on the exact tick the desync occurred" [FFF #340](https://factorio.com/blog/post/fff-340):
  - the Serpent serializer used `nil` placeholders, which delete Lua keys, so table iteration order differed across peers;
  - a unit group's cached max speed was not saved but recomputed on load, so it changed after a load.
  - **Fit:** The second bug is exactly what rule 9 and the restore test catch: a derived cache outside the saved tree. In JS the analogue is a `Map` or memo cache at module scope. **Covered** for tested paths; a synctest mode (Q3) would widen it.
- **TASVideos' verification contract.** "Your submission must be reproducible." Runs "from power-on or SaveRAM"; "Starting from an emulator savestate is normally not allowed", and when unavoidable, "The verification movie must start from power-on and not be save-anchored itself" [TASVideos Movie Rules](https://tasvideos.org/MovieRules).
  - **Fit:** Sightline recordings start from the mission spec, the "power-on" case. **Covered.** If suspend and resume ever produce sessions that start from a save-state, chain them to the recording that produced it (Q5).
- **Trackmania replays and their limit** [donadigo & Wirtual, TMX investigation](https://donadigo.com/tmx1). The page is undated; its latest item is from 7 Dec 2020.
  - Replays store timed inputs, and "the exact same inputs will always yield the exact same results". The in-game Validate re-runs inputs and compares them with the ghost.
  - But "official mode does not detect slowing down the game, nor does it reject replays driven with such techniques."
  - The investigators flagged cheats with an input statistic, steering direction changes ("spikes") per second. They caution the score is "in no way a measure of judging replays."
  - **Fit:** If Sightline ever ranks runs, re-simulation proves legality only. Humanity needs input-level statistics, such as input resolution, timing jitter and reaction-time distributions. **N/A yet.**
- **Nadeo's response.** After the investigation, Nadeo re-ran anti-cheat detection on 400k TMUF records from 15 years and said the share of fair records is above 99%, declining to detail the method [PC Gamer, via search summary](https://www.pcgamer.com/trackmania-dev-analyses-15-years-worth-of-records-to-root-out-the-cheaters). Trackmania dedicated servers can use "a dynamic seed for server-side validation checks" and save the replays used for validation [EvoTM docker-trackmania](https://github.com/EvoTM/docker-trackmania). Openplanet notes that replays made through game APIs are "readily identifiable" [Openplanet Archivist](https://openplanet.dev/plugin/archivist).
  - **Fit:** Keep every submitted run's inputs so new detectors can be run over old records later. Issue a server-chosen seed per attempt so runs can't be precomputed offline. **N/A yet.**

### Inferences
- **A bug report needs four things:** the recording, the build that made it, the first divergent tick, and the state diff at that tick. Sightline has the first two and part of the third (`--replay` names where a run diverged). The automatic tick bisect and path-level state diff (Q3) would complete it.
- **Leaderboards later.** If Sightline adds leaderboards or shared challenge seeds, verification has three layers:
  1. re-simulate on a trusted runtime with the recording's build;
  2. reject inputs the client could not have produced, such as quantization outside `InputFrame`'s grid (which in-sim quantization already enforces);
  3. run statistical "humanness" checks.

  Only the first is cheap, and none proves real-time play.

### Gaps
- Doom speedrun verification (Compet-n, DSDA) and speedrun.com's video-based policy were not retrieved: DoomWiki returned 403, and search was cut off.
- Nadeo's official description of how TM2020 validates leaderboard records server-side was not found.

## Q5. Rollback netcode and save-state design: lessons for single-player seeking and suspend/resume

### Takeaway
Rollback engines prescribe the same rules for state as Sightline's:
- all state in one restorable blob, including random generator state;
- no wall-clock time;
- no pointers or hidden statics;
- a fixed time step.

Retrofitting those rules is expensive: Mortal Kombat reportedly spent man-years on serialization. Sightline has them by design. For seeking, the established designs are periodic snapshots plus re-simulation (Sightline and StarCraft II) or keyframed curves (ChronoCam). Drawn animation must be a function of state and time for seeking to look right.

### Cited Findings
- **GGPO's state rules** [GGPO Developer Guide](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md):
  - "The game simulation must be fully deterministic."
  - Random generator state must be "included in your game state."
  - Wall-clock time "is almost never in sync", so leave it out or treat it as input.
  - "Rebase your pointers" on load.
  - Static locals cannot be rolled back.
  - Advance "by a fixed time quanta per frame."
  - **Fit:** Plain-data tree with id references, per-entity streams in state, no clocks and a fixed 30 Hz tick. **Covered.**
- **Jolt's partial save-state.** `SaveState` captures only state the engine modifies during its update, so other changes must be restored by hand, and body IDs must match on both sides [Jolt docs](https://jrouwe.github.io/JoltPhysics/index.html).
  - **Fit:** Sightline's "all state in `sim.state`" removes this split. The open question is the generated world: a save-state presumably relies on regenerating the same valley from the mission spec, so a save should carry the world fingerprint and generation version and refuse a mismatch, as recordings do. **Partly** covered: recordings check `worldFingerprint`; whether save-states do was not checked.
- **Box2D v3** provides no "roll-back determinism" as of the August 2024 post [Box2D blog](https://box2d.org/posts/2024/08/determinism/). The FAQ points to a snapshot system for rollback [Box2D FAQ](https://box2d.org/documentation/md_questions.html).
  - **Fit:** Any third-party physics would need its internal state inside, or restorable alongside, `sim.state`. **N/A yet.**
- **Seeking in StarCraft II.** Seeking forward to any time came only in StarCraft II 2.0.10 [Blizzard, 2.0.10](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10).
  - **Fit:** `ReplaySeeker` re-simulates once and caches a save-state every 150 ticks (5 s), about 1 KB each, then restores the nearest one and steps forward ([seek.ts](src/sim/record/seek.ts)). **Covered.**
- **Seeking in ChronoCam.** It requires that no rendered frame depend on the previous one, and animations were started at random frames so seeking didn't march bots in step [Smith 2013](https://www.forrestthewoods.com/blog/tech_of_planetary_annihilation_chrono_cam/).
  - **Fit:** Rule 14 makes head bob and walk cycles pure functions of state and time (`bob.ts`). **Covered.** Particles and other render-only effects still need a "rebuild from state at time t" path when seeking backwards.
- **Halo Theater rewind.** Halo 3 campaign replays had no rewind. Halo: Reach's "Theater 2.0" added rewinding for campaign and Firefight [Halopedia](https://www.halopedia.org/Theater_mode).
  - **Fit:** Sightline has seeking already. **Covered.**
- **Fast playback as recovery.** League of Legends recovers to minute 40 in under 3 minutes by fast playback [Riot, Introduction](https://www.riotgames.com/en/news/determinism-league-legends-introduction).
  - **Fit:** Re-simulation speed is the seek and recovery budget. `npm run sim --profile` measures it. **Covered.**

### Inferences
- **Suspend and resume in the browser.** Store the latest save-state *plus the input log since mission start*, with `SIM_VERSION`, `STATE_SCHEMA`, `GEN_VERSION`, the build and the world fingerprint. A resumed session then stays a valid, power-on-anchored recording (the TASVideos rule), not a save-anchored fragment.
  - On a version mismatch, the input log can be re-simulated in the old build (Q1). Failing that, offer "restart the mission" rather than silently migrating sim state.
  - Persisting through IndexedDB's structured clone would keep -0 and NaN intact, where JSON would not (see Q2); the IndexedDB behaviour was not verified in this session.
- **Synctest doubles as a save-state test.** The synctest-style fuzz mode (Q3) is also the best test of suspend and resume, because it exercises restore at thousands of arbitrary ticks.

### Gaps
- Browser page-lifecycle specifics for suspend and resume (`pagehide`, `visibilitychange`, the back/forward cache, storage eviction) and IndexedDB's structured-clone fidelity were not researched (search budget).
- Primary detail on Mortal Kombat's serialization and rollback testing beyond the GDC abstract.

## Q6. Known failure stories: desyncs, and replays broken by patches

### Takeaway
Desyncs come from a few recurring places:
- state that is not saved or not hashed: Factorio's cached unit-group speed, Riot's uninitialized members, Demigod's dangling pointer;
- iteration order: Lua tables, pointer-keyed maps;
- math libraries: atan2 across platforms, `pow` across JIT tiers;
- changed builds: every inputs-only replay system after a patch.

The fixes are always the same: hash everything, test restore, own the math, and pin the build.

### Cited Findings
- **Age of Empires.** A product manager predicted "out-of-sync is going to be it", meaning the one bug that goes to the wire. A deer misaligned slightly at map creation later changed a villager's hunt [Bettner & Terrano](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond).
  - **Fit:** Small divergences grow, so part hashes from tick 0 matter. **Covered.**
- **Demigod (Gas Powered Games).** A rare desync moved units a few centimetres between machines and took almost a week to find. A deleted pathfinding component left a dangling pointer, whose memory the allocator reused before the unit landed [Smith 2011a](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/).
  - **Fit:** Memory safety removes this class in TypeScript. **Covered.**
- **Factorio "Deep desyncs".** Serpent's `nil` placeholders changed Lua iteration order, and an unsaved cached max speed was recomputed differently after load [FFF #340](https://factorio.com/blog/post/fff-340).
  - **Fit:** Plain-data state and the restore test. **Covered.** Per-tick restore in fuzz would widen it (Q3).
- **League of Legends.** Pointer-keyed ordered maps iterated differently across runs, and recordings made on one OS could diverge on another [Riot, Implementation](https://www.riotgames.com/en/news/determinism-league-legends-implementation).
  - **Fit:** Ids, not pointers, plus cross-browser CI and the weekly macOS/Windows comparison. **Covered.**
- **Supreme Commander on ARM (Forged Alliance Forever).** Players report desyncs "on all replays and games" running under Windows 11 on ARM (M1 Max, x64 emulation), with immediate desync on replay playback. These are forum reports [FAF forum](https://forum.faforever.com/post/33616).
  - **Fit:** A native-code hazard; JavaScript engines don't emulate x87 or x64 math. Keep at least one ARM runtime in the cross-platform comparison. **Partly** covered: whether the weekly macOS job runs on ARM was not checked.
- **Engine math.**
  - V8's `99**99` folding mismatch (2017) [freeCodeCamp](https://www.freecodecamp.org/news/i-found-a-bug-in-v8s-exponentiation-operator-dcddfa5b8482/).
  - WebKit's tier-dependent `pow` [WebKit bug 147167](https://bugs.webkit.org/show_bug.cgi?id=147167).
  - Box2D's `atan2f` differing across platforms [Box2D blog](https://box2d.org/posts/2024/08/determinism/).
  - **Fit:** `detmath.ts` plus the architecture-test ban. **Covered.**
- **StarCraft II.**
  - Patch 3.0 (Oct 2015) dropped all earlier replays when the storage format changed [Kotaku](https://kotaku.com/starcraft-iis-new-patch-wont-support-old-replays-1734891305).
  - Players report a "required version is not available" failure just after patch 5.0.13 [Blizzard forums](https://us.forums.blizzard.com/en/sc2/t/old-5012-version-replays-are-broken-after-5013-patch/28404).
  - **Fit:** Even "keep old builds" needs a stable outer format and reliable old-build retrieval. **Partly** covered.
- **Overwatch and Halo.**
  - Overwatch 2 update 3.83 wiped existing replay codes [MP1st](https://mp1st.com/?p=267506).
  - The Halo 3 beta update erased saved films [N4G](https://n4g.com/news/39910/halo-3-beta-already-updated-films-erased).
  - Halo 4 campaign theater in the Master Chief Collection is "Experimental" because of quirks in the original implementation [Halopedia](https://www.halopedia.org/Theater_mode).
  - **Fit:** Expiry is the norm in shipped games. **Covered** for dev fixtures through `npm run golden`.
- **Rocket League.** In 2017 players reported crashes in older Urban Central replays "shortly after a player picks up (or would have picked up) a corner boost", which suggests a map or content change had broken old replays [Steam thread](https://steamcommunity.com/app/252950/discussions/3/1484358860946261992). These are user reports.
  - **Fit:** Content is part of the sim. Sightline's rule 16 puts content definitions in tuning, which recordings embed, so a content change cannot silently break an old recording. **Covered.**
- **Doom.** v1.9 and v1.9f demos desync on each other's executables [DoomWiki talk](https://doomwiki.org/wiki/Talk:Demo). Boom demos with `demo_insurance=0` are likely to lose sync on the next Boom version [Doomworld forum](https://www.doomworld.com/vb/post/643972).
  - **Fit:** Even tiny executable differences matter. Sightline's refusal compares sim, state and generation versions, scene version, world fingerprint and start hash. **Covered.**
- **Trackmania.** Slowed-down (tool-assisted) records passed replay validation for years [donadigo & Wirtual](https://donadigo.com/tmx1).
  - **Fit:** Re-simulation is not anti-cheat. **N/A yet.**

### Inferences
- The failures Sightline has not structurally excluded are the cross-cutting ones:
  - a build change while a recording is in flight (Q1);
  - lossy encodings outside the hashed tree, such as the JSON header and `stableStringify` (Q2);
  - a restore path never exercised mid-run by the bots (Q3).

### Gaps
- Single, unverified secondary claim: Factorio's FFF #446 (18 Sep 2026) reportedly saw no ARM64 versus x86 desyncs during a LAN party [supercraft.host](https://supercraft.host/wiki/factorio/desync_troubleshooting/). Check the original FFF before relying on it.

## Q7. Is there anything the setup may be missing?

### Takeaway
The core is at or beyond industry practice: own math, per-entity streams, one hashed plain-data tree, in-sim input quantization, recordings refused with reasons, cross-engine CI, invariants every tick, and weekly long fuzzing. The gaps are at the edges: spec-level trust in `sqrt`, lossy JSON paths, the lack of a per-tick restore check and automatic divergence bisecting, unminimized fuzz failures, golden churn across five branches, and no way to replay old recordings in their own build.

### Cited Findings
- **`Math.sqrt` is implementation-approximated in ECMAScript** [read262](https://read262.netlify.app/numbers-and-dates/math-object).
  - **Fit:** Add a startup known-answer test. **Not covered.**
- **Rewind-and-replay of every frame or tick** catches determinism and restore bugs continuously: GGPO SyncTest [GGPO](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md), Factorio heavy mode [Factorio wiki](https://wiki.factorio.com/Desynchronization) and Jolt's "Check Determinism" [Jolt docs](https://jrouwe.github.io/JoltPhysics/index.html).
  - **Fit:** Add to `npm run fuzz`. **Not covered.**
- **Shrinking failing command sequences** gives minimal repros [fast-check](https://fast-check.dev/docs/advanced/model-based-testing/).
  - **Fit:** **Not covered.**
- **Rebaselining inside the change, reviewed with it** [Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/testing/web_test_expectations.md), plus testing the merged result [GitHub merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
  - **Fit:** **Not covered.**
- **Old replays in old builds** [Blizzard, 2.0.10](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10).
  - **Fit:** **Not covered.** The build stamp is already in the header.
- **Semantic numbers next to the hash in goldens** [Box2D](https://box2d.org/posts/2024/08/determinism/).
  - **Fit:** **Partly** covered.
- **Diffing two full states at a desync** [Factorio wiki](https://wiki.factorio.com/Desynchronization).
  - **Fit:** **Partly** covered: part hashes, no tree diff.

### Inferences
Ranked by value for the labs phase:
1. **Synctest mode in fuzz.** Per-tick or sampled save, step, restore, re-step and compare, including through the on-disk codec.
2. **Automatic divergence bisect.** First bad tick, then per-phase hashes, then a path-level state diff, as a `npm run sim -- --replay` option.
3. **Golden workflow for five branches.** Merge queue; per-lab scene goldens; CI-generated golden updates committed in the PR, with a printed first-divergence and semantic-number diff; `SIM_VERSION` assigned at merge, or refusal also keyed on build or fingerprint; a conflict-free `docs/decisions.md`.
4. **Fuzz-failure minimizer** (ddmin over input frames, or fast-check commands).
5. **Number hygiene.** Reject -0 and non-finite numbers in the mission and tuning JSON, or encode them losslessly. Add a startup `sqrt` and `detmath` known-answer check. Add architecture-test rules for `sort` comparators and for `localeCompare`/`Intl` in `src/sim`.
6. **"Open in the build that made it"** for refused recordings, plus a STAT-only "watch" fallback.
7. **Future leaderboards.** Server-side re-simulation plus input statistics plus server-issued seeds, since re-simulation proves legality, not humanity.

### Gaps
- None of these recommendations was tested against the codebase beyond the files named in the preface. Specifically not checked:
  - whether save-states, as distinct from recordings, carry the world fingerprint;
  - whether the replay viewer can fall back to STAT;
  - what CPU architecture the weekly macOS run uses;
  - whether recording-header validation already rejects `null` in numeric tuning fields.
