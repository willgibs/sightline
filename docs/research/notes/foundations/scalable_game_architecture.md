# Scalable game architecture: shared engines, modular gameplay, deterministic modding, lane contracts and TypeScript practice

Compiled 7 Nov 2026 for Sightline's Phase 1 planning. Labels: **[Fact]** documented or first-party; **[Reported]** journalism or secondary write-ups; **[Opinion]** a practitioner's judgement; **[Community]** forums or fan wikis. Each finding ends with a **Fit** line: my inference for Sightline, not a sourced claim. Sources are paraphrased; one short quotation is used. The web-search budget ran out partway through, so later items rest on direct fetches of known primary pages (see each Gaps list).

## 1. Sharing technology across many games: how studios do it, and which boundaries made it succeed or fail

### Takeaway
Shared tech has worked when the shared layer was extracted from shipped games, stayed narrow (kernels, libraries, tools), and each consuming team kept control of its own gameplay lane and schedule. It failed when one genre-shaped engine was mandated across genres and central support was rationed by publisher priority, which is the documented Frostbite-at-BioWare story.

### Cited Findings

**EA Frostbite (the cautionary case)**
- **[Reported] A genre engine mandated across genres moved the missing genre's work onto each team.** [Kotaku, Jason Schreier, "How BioWare's Anthem Went Wrong", 2 Apr 2019 (19 anonymous sources)](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964)
  - Lesson: DICE built Frostbite for Battlefield; EA moved its studios onto it to share knowledge and avoid licence fees.
  - Evidence: Dragon Age: Inquisition's team had to build save-load and a third-person camera from scratch; Anthem's dynamic environments and survival ideas proved hard or impossible in the engine and were cut; simple bug fixes took days of back-and-forth, and a lighting bake could take 24 hours, so people hacked around problems instead of fixing them.
  - Fit: Keep Sightline's kernel (state tree, phases, schedule, recorder, detmath, motor, world query) genre-neutral and small; never require a future mode (zombies, survival) to reuse a lab's gameplay system such as the camp brain.
- **[Reported] Central support followed revenue, not need.** Same Kotaku article.
  - Lesson: when one central team serves many games, the smallest-revenue game loses the contest for its time.
  - Evidence: BioWare routed engine work through EA's central Frostbite team; support levels were tied to each game's projected revenue; when FIFA moved to Frostbite in 2016, BioWare's Frostbite-experienced engineers were reassigned to it; developers described an in-house engine with the problems of a licensed one, designed by nobody on their staff; DICE later sent a strike team.
  - Fit: Give each lane a named owner and its own budget, and keep kernel changes small enough that a lane can make the one it needs itself, with the architecture tests (not a gatekeeper) as the guard.
- **[Reported] Superb at what it was built for, absent elsewhere.** [Kotaku, Schreier, "The Story Behind Mass Effect: Andromeda's Troubled Five-Year Development", 7 Jun 2017](https://kotaku.com/the-story-behind-mass-effect-andromedas-troubled-five-1795886428)
  - Evidence: Frostbite had never been used for an RPG when BioWare began on it in 2011; it could not manage party members or inventory; it had no built-in animation system (the add-on was described as patched together); its initial maximum map size, 100 × 100 km, was too small for Andromeda's planets; streaming and saving were further struggles. A senior developer likened it to a Formula 1 car beside Unreal's SUV and Unity's compact: superb at its purpose, helpless outside it.
  - Fit: For the "bigger open world with several bases" horizon, put world-size limits in tuning and run one deliberately oversized multi-site scene early, so any hard-coded limit surfaces now.
- **[Fact, secondary] EA spread Frostbite across genres, then dropped the mandate.** [Wikipedia, "Frostbite (game engine)"](https://en.wikipedia.org/wiki/Frostbite_(game_engine)), citing PC Gamer and others
  - Evidence: from shooters it spread to racing (Need for Speed), sports (FIFA 17 in 2016, Madden NFL 18 in 2017, NHL 22, UFC 5, College Football 25) and RPGs (Inquisition 2014, Andromeda 2017, Anthem 2019, The Veilguard 2024); EA formed Frostbite Labs (about 30–40 people, Stockholm and Vancouver) in 2016; in December 2023 EA abandoned its plan to build every game on Frostbite and let studios choose engines; cancelled projects (Visceral's Ragtag) are tied to Frostbite trouble.
  - Fit: A foundation should win its users by being the easiest path; for Sightline, the kernel's tools (scenes, recordings, fuzzing, `npm run look`) must be the cheapest way to build a new mode.
- **[Reported] BioWare's next Mass Effect appears to be on Unreal Engine 5.** [GameSpot, Dec 2021](https://www.gamespot.com/articles/next-mass-effect-runs-on-unreal-engine-5-it-appears/1100-6499132/)
  - Evidence: inferred from a producer's job-post tweet and a reporter's follow-up; GameSpot noted it was not a flat confirmation.
  - Fit: none beyond the above; it shows the cost was felt.

**Ubisoft Massive's Snowdrop**
- **[Fact, first-party] A modular platform with fast iteration, grown from one studio's shipped engine.** [Massive Entertainment, "The History of Snowdrop" (undated)](https://massive.se/?p=11738)
  - Evidence: Snowdrop's roots are the World in Conflict engine (2007); after Ubisoft acquired Massive (2008) the tech team had time for R&D; all tools and game code moved into one code solution; a node system lets tech artists build mechanics, from animation to sound; the studio describes a generic platform with different bodies built on top; fast iteration was a founding principle (an earlier engine took up to 45 minutes to compile). The article names The Division, The Settlers, South Park and a Star Wars game; related Massive posts cover Avatar: Frontiers of Pandora.
  - Fit: Keep tools and game in one repository and `npm run check` fast enough to run on every change; content as data plus debug overlays is Sightline's equivalent of Snowdrop's node system, letting the owner tune without code.
- **[Reported, unverified] Ubisoft has been consolidating on Snowdrop and Anvil during its 2024–26 restructuring.** [TweakTown](https://www.tweaktown.com/news/110558/ubisoft-hits-another-studio-with-layoffs-100-plus-employees-offered-severance-packages/index.html); [Wikipedia, "Ubisoft Anvil"](https://en.wikipedia.org/wiki/Ubisoft_Anvil)
  - Evidence: reports say Red Storm's remaining staff will focus on Snowdrop; Anvil remains the Assassin's Creed engine (also For Honor and Steep). I did not open the TweakTown page.
  - Fit: the pattern is two engines aligned with two families of games, not one engine for everything.

**id Software and MachineGames**
- **[Reported] Sharing by fork.** [MobyGames, "3D Engine: Motor"](https://mobygames.com/group/20527/3d-engine-motor); [KitGuru review of Indiana Jones and the Great Circle](https://www.kitguru.net/tech-news/matthew-wilson/kitguru-games-indiana-jones-and-the-great-circle-is-a-stunning-achievement/)
  - Evidence: Indiana Jones and the Great Circle (2024) runs on Motor, a branch of id Tech 7 (which debuted in Doom Eternal, 2020) customised by the game's own team; MachineGames called it its own modified id Tech.
  - Fit: For a genuinely different future game (the broad open-world shooter), forking the kernel at a tagged `SIM_VERSION` and owning the divergence is legitimate, and often cheaper than generalising one kernel for both.

**Sony and Naughty Dog's ICE team**
- **[Reported] Share components, not an engine.** [PPE.pl feature on the ICE Team](https://www.ppe.pl/publicystyka/422315/ice-team-ludzie-ktorzy-nauczyli-studia-sony-programowac-na-playstation-3.html); [Push Square, Jul 2013](https://www.pushsquare.com/news/2013/07/theres_a_secret_room_inside_naughty_dog_thats_as_cold_as_ice)
  - Evidence: ICE (Initiative for a Common Engine) is a Sony central technology group housed at Naughty Dog; despite the name it never produced one engine for all Sony games; it shipped libraries, code, animation systems, geometry tools and a PS3 graphics profiler and debugger to first- and third-party teams.
  - Fit: Sightline's most reusable assets are libraries with no gameplay in them (`detmath`, `rng`, `hash`, the recorder, grid search, the scene harness); make them the first shared layer, importing nothing from gameplay.

**Paradox's Clausewitz and Jomini**
- **[Reported] Engines grow by layering, and old games stay on old layers.** [PCGamesN on Jomini](https://pcgamesn.com/imperator-rome/paradox-new-engine-jomini); [Wikipedia, "Paradox Development Studio"](https://en.wikipedia.org/wiki/Paradox_Development_Studio)
  - Evidence: early Paradox titles copied code from game to game, and the "Europa Engine" name was applied afterwards; Clausewitz arrived in 2007 with Europa Universalis III; Jomini (2019, Imperator: Rome) is a layer on top of Clausewitz, mostly modding tools; Paradox said existing games could not adopt Jomini because it would change how they behave and what they need to run.
  - Fit: A new shared capability is a new layer above the kernel; recordings and saves of older modes stay on their own `SIM_VERSION` rather than being upgraded.

**Epic: Unreal grown by Fortnite**
- **[Fact, first-party, via search excerpt] Game Feature plugins exist to move live content in and out.** [Unreal Engine blog, Krzysztof Pachulski, "Modular Game Features in UE5: plug 'n play, the Unreal Way"](https://www.unrealengine.com/en-US/blog/modular-game-features-in-ue5-plug-n-play-the-unreal-way)
  - Evidence: Epic says Fortnite relies on them heavily to add and remove the content that cycles through the game seasonally and daily. (The page refused direct fetching; this is from its search excerpt.)
  - Fit: Sightline's future modes are the analogue of Fortnite's seasons; they should arrive as bundles that register into the kernel, not as edits scattered through it (section 2).

**Unity: converging two object models**
- **[Fact, first-party] Unity is folding ECS into the core rather than keeping two worlds.** [Unity Discussions, Eric Dziurzynski, "ECS Development Status – December 2025", 11 Dec 2025](https://discussions.unity.com/t/ecs-development-status-december-2025/1699284/1); [Unity roadmap, "ECS for All"](https://activation.unity3d.com/roadmap/2700-ecs-for-all)
  - Evidence: Entities, Collections, Mathematics and Entities Graphics become core packages in Unity 6.4, which Unity says lets it change ECS inside the engine faster; one `EntityId` will identify both GameObjects and Entities; the stated aim is every GameObject backed by an Entity; delivery is incremental through Unity 6 releases toward the 6.7 LTS; Physics and Netcode are to join the core packages in 2026; package versions will track the editor's. Unity's roadmap items are not commitments.
  - Fit: Keep exactly one state model (`sim.state`); never let a future mode keep side state or a parallel object model, which is the split Unity is spending years unwinding.

### Inferences
- Across the cases, success correlates with three boundaries: the shared layer has no game-specific knowledge (ICE, Snowdrop's platform); each consumer controls its own gameplay and priorities (MachineGames' fork, Paradox's per-game layers); and a shipped game proved the shared layer first (Unreal through Fortnite, Snowdrop through The Division). Frostbite at BioWare broke all three.
- For Sightline, the "engine" is the kernel plus its tools, the five labs are its first lanes, and the named horizons are future consumers. The kernel should be hardened and extracted from the stealth-sniper game as it reaches Concept proven, not designed toward the horizons in advance, which is the foundation plan's existing rule (horizons shape interfaces only).
- The missing-feature risk sits where Frostbite was missing things: save-load, camera, animation, large maps, streaming. Sightline already has generic save-states; the gaps to watch are world size (several bases) and long-lived saves (survival).

### Gaps
- Insomniac's engine, shared across Ratchet & Clank, Spider-Man and Wolverine: not researched before the search budget ran out; no source gathered.
- Ubisoft's current engine consolidation: only low-authority reports, not verified.
- How id and MachineGames share code day to day (one codebase with branches, or periodic merges): not documented in the sources found.
- Most GDC talks on these engines sit behind GDC Vault's paywall and were not read.

## 2. Modular gameplay architectures, and which ideas suit a deterministic, plain-data, fixed-step simulation with declared phases

### Takeaway
What transfers from ECS is its disciplines, not its storage: components are data without behaviour, systems are behaviour without state, order and data access are declared, each piece of state has one writer, side effects are deferred to a known point, and features attach to the core by registering, never by the core importing them. Sightline's plain-data tree and declared phases already embody most of this. What it lacks is a declared read and write set per system, a checker for conflicts within a phase, and a feature unit that bundles a lane's systems, events, content and scenes.

### Cited Findings

**Unreal: Game Feature plugins and Lyra**
- **[Fact] Features are data assets of actions that inject components into actors that opt in.** [Epic docs, "Game Features and Modular Gameplay"](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine)
  - Evidence: a GameFeatureData asset holds a list of actions (add components, add cheats, add a data registry, add data-registry sources, add world-partition content); actors opt in by registering as receivers with `UGameFrameworkComponentManager`; the docs ask that the feature's components carry all its logic and data, with minimal involvement from the actor; targeting the base actor class is unsupported; the stated benefits are a readable codebase and no accidental dependencies between unrelated features, which matters most for live games whose feature sets change.
  - Fit: Model a Sightline feature as data: a declaration listing systems by phase, event types, tuning sections, entity kinds and scenes, which the kernel registers. The kernel never imports a feature.
- **[Community] Dependency direction: features may depend on the core, and the core works with features off.** [X157 dev notes on Game Features](https://x157.github.io/UE5/GameFeatures); [Unreal forums, "Why Lyra experience system is not a plugin?"](https://forums.unrealengine.com/t/why-lyra-experience-system-is-not-a-plugin/2530643)
  - Evidence: a Game Feature plugin behaves more like a mod than an ordinary plugin and can see game code, which ordinary plugins cannot; its code and assets load only when the game asks; Lyra's experiences (game modes) are themselves feature plugins, loaded with the map's experience, whose actions inject components, input mappings and UI. Epic's pages do not state the dependency rule outright.
  - Fit: Make "the kernel runs with every feature off" a test: a scene with no features must still step, hash, save, restore and replay.

**Bevy: plugins and schedules**
- **[Fact] Plugins are the unit of app configuration, with staged setup.** [Bevy 0.20 docs, `Plugin`](https://docs.rs/bevy/latest/bevy/app/trait.Plugin.html); [`PluginGroup`](https://docs.rs/bevy/latest/bevy/app/trait.PluginGroup.html)
  - Evidence: `build` runs on registration; `ready`, `finish` and `cleanup` let a plugin complete setup that depends on other plugins; plugins are unique by name unless they opt out; groups bundle plugins and let a user override one plugin's settings.
  - Fit: Give feature registration two stages: declare (systems, events, tuning schema), then validate once everything is declared (conflicts, missing dependencies, phase order).
- **[Fact] Order is nondeterministic unless declared, and ambiguity detection reports conflicts.** [Bevy example, `nondeterministic_system_order.rs`](https://docs.rs/crate/bevy/latest/source/examples/ecs/nondeterministic_system_order.rs); [`ScheduleBuildSettings`](https://docs.rs/bevy_internal/latest/bevy_internal/ecs/schedule/struct.ScheduleBuildSettings.html)
  - Evidence: Bevy runs systems in parallel, and their relative order is unspecified unless constrained; ambiguity detection flags pairs whose data access conflicts (one writes what the other reads) with no order between them; it is configured per schedule and defaults to off; silencing a report is meant only for clear false positives, with a comment justifying it.
  - Fit: Sightline runs systems in array order, so it is deterministic today, but the order inside a phase is an unwritten contract between labs; declare reads and writes per system and fail a test when two systems in one phase touch the same state without an explicit order.

**Overwatch's ECS (Tim Ford, GDC 2017)**
- **[Fact, via transcription] Rules the team took a long time to find.** [GDC Vault, "Overwatch Gameplay Architecture and Netcode"](https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and); detail from [a Chinese write-up of the talk (Tencent GAD, republished on Sohu, 2017)](https://www.sohu.com/a/148848770_466876)
  - Evidence: the client had about 46 systems and 103 component types; components have no functions, systems have no state, shared code lives in utility functions, large side effects are deferred, and systems may not call one another; per the write-up, arriving at and writing down these rules took about a year and a half.
  - Fit: Sightline's rules 9, 12 and 13 already say most of this; add "systems never call each other: they communicate through state, the schedule or events" to the architecture tests.
- **[Fact, via transcription] A second world exposes every global.** Same sources.
  - Evidence: the kill-cam needed two worlds at once, the live game and a replay; call sites that reached systems through globals broke, which pushed the team toward singleton components.
  - Fit: Sightline's horizons (several bases, in-game replays, Phase 2's debrief replay) imply several simulations alive at once; add a test that steps two `Simulation` instances interleaved and checks both hashes, to catch module-level state now.
- **[Fact, via transcription] Singletons, single writers, and utilities with few callers.** Same sources.
  - Evidence: about 40% of components were singletons, and state needed by only one system proved rare, because new singletons almost always ended up shared; `CommandSystem` became the only writer of `PlayerCommand`, the networked command that drives simulation; a utility called from many places must read few components and have few side effects, while one with heavy side effects must have few callers (the character-movement utility had exactly two: server simulation and client prediction).
  - Fit: Keep the shared motor as that kind of few-caller utility, and give each state subtree (orders, beliefs, alarms, vitals) exactly one writing system, recorded in the lane map.
- **[Fact, via transcription] Deferment, and a regret about deferred creation.** Same sources.
  - Evidence: impact effects were queued in a singleton and resolved at one point in the frame, which also allowed spreading work over frames within a budget; deferring entity creation to the end of the frame caused a one-frame delay between systems, and immediate creation had to be added after release in a stressful patch.
  - Fit: W0.3 (spawning inside a tick) chooses this semantics now; pin it with a scene that checks on which tick a spawned body first exists for perception and for the motor, because changing it later moves every golden.
- **[Fact, via transcription] Iceberg subsystems, read-only access, and a smell.** Same sources.
  - Evidence: projectile simulation and path validation hid their internal state and threading behind a small ECS surface; components could be marked read-only in a system's tuple, allowing parallel reads; a behaviour that needs a tuple of 40 components signals a design problem.
  - Fit: Lab A's perception and lab E's navigation can be icebergs: small typed outputs in the state tree (percepts, paths) with internals free to change; a system that reads half the tree is the smell to catch in review.
- **[Fact, via transcription] Determinism was scoped to the systems that needed it.** Same sources.
  - Evidence: the game ran on fixed command frames (16 ms, 7 ms in esports); predicted systems used a fixed update; only a handful of systems (network events and messages, interpolation, weapons, state scripts, movement state) took part in netcode.
  - Fit: Sightline is deterministic as a whole, which is stricter and simpler; keep it, since scoping determinism to some systems is what games that added it late had to do.
- **[Opinion] Not universal.** [Sean Middleditch, "My GDC '17 talk retrospective"](https://seanmiddleditch.github.io/my-gdc-17-talk-retrospective)
  - Evidence: per its search excerpt, he found the talk well presented and the approach refreshingly simple, but judged that the architecture will not suit many kinds of games.
  - Fit: adopt the disciplines, not ECS storage for its own sake.

**Deterministic ECS in practice: Photon Quantum**
- **[Fact, first-party] The whole game state in one frame, stateless systems, no garbage.** [Photon Quantum 3, introduction](https://doc.photonengine.com/quantum/current/quantum-intro); [Quantum API, `Frame`](https://doc-api.photonengine.com/en/quantum/current/class_quantum_1_1_frame.html)
  - Evidence: Quantum's frame holds all game state and is passed to every system; systems are stateless logic run each tick; a small DSL generates the code for game data; simulation code allocates no managed heap memory at runtime; input goes out every tick, commands only when needed; events carry information from the simulation to the Unity view; assets are defined in the simulation and authored in the editor; the API exposes per-frame checksums and frame dumps when checksums disagree.
  - Fit: This is the closest shipped analogue to Sightline and validates its shape. Worth borrowing: a schema for state types (to generate hashing, restore and typed accessors instead of walking the tree generically, if profiling ever asks) and the rule that events are outputs to the view, never state.

**Data-oriented design**
- **[Opinion, practitioner] Design around the data and its transformations.** [Noel Llopis, "Data-Oriented Design (Or Why You Might Be Shooting Yourself in the Foot With OOP)", 4 Dec 2009](https://gamesfromwithin.com/data-oriented-design); [Mike Acton, "Data-Oriented Design and C++", CppCon 2014](https://www.youtube.com/watch?v=rX0ItVEVjHc)
  - Evidence: Llopis argues that programs are data transformations; that batches of homogeneous data give parallelism, cache use, modularity and trivially testable functions; and that the way in is one subsystem at a time, classifying each input as read-only, read-write or write-only. He concedes it is no silver bullet and is hard to mix with object code. Acton's talk is the canonical statement of the view (only its title page was verified here).
  - Fit: Llopis's read-only/read-write/write-only classification is exactly the per-system access declaration recommended above; in JavaScript the cache argument is weaker, but the testability and modularity arguments carry over intact.
- **[Opinion, practitioner] Architecture is about change.** [Robert Nystrom, *Game Programming Patterns*, "Architecture, Performance, and Games" (2014)](https://gameprogrammingpatterns.com/architecture-performance-and-games.html)
  - Evidence: good architecture minimises what you must hold in your head to make a change; flexibility costs learning time and runtime (indirection, dynamic dispatch); every extension point is a bet on the future, and YAGNI is the check; keep code flexible while the design is unsettled and remove abstraction once it settles; making a fun game fast beats making a fast game fun.
  - Fit: put flexibility in data (tuning, content, scenes) and keep inner loops concrete.

### Inferences
- The three models, judged for Sightline:

| Model | Strength | Cost | Fit for Sightline |
| --- | --- | --- | --- |
| ECS (Overwatch, Bevy, Quantum, Unity DOTS) | Declared access, parallelism, cache-friendly storage, generic queries | Up-front schema and query machinery; the storage win depends on native memory layout | Take the disciplines; skip the storage until entity counts demand it (a zombie horde) |
| Objects with components (Unreal actors, Unity GameObjects, Game Feature injection) | Familiar; features inject components into hosts that opt in | Behaviour on objects invites cross-calls and hidden state; Unity is now merging it into ECS | Borrow only the opt-in injection idea, expressed as data |
| Plain-data tree with declared systems (Sightline) | One hash, save and restore; trivially serialisable; ids instead of pointers | Access is undeclared, so conflicts surface late through goldens; generic tree walks may cost time | Keep it; add declared access and a checker; generate hashing from a schema only if profiling says so |

- A concrete shape: a system spec gains `reads`, `writes` and `emits` (state paths and event types); a feature bundles systems, event types, tuning sections, entity kinds, scenes and debug overlays; `SYSTEMS` is assembled from features; tests fail if two systems in a phase write the same path, if a system reads a path nothing writes, or if the kernel imports a feature.
- Horde-scale modes may need hot components in typed arrays (structure of arrays). Rule 9 allows only plain arrays and objects, so that would be a deliberate `STATE_SCHEMA` change with hashing support, taken only when profiling demands it.

### Gaps
- Epic's pages read here do not state the dependency-direction rule for Game Features; it is community understanding.
- Lyra's experience-loading order and its pitfalls were not covered by the pages fetched.
- Unreal's Mass entity framework, O3DE's Gems (its page did not render) and Godot's node model were not covered.
- Unity DOTS's determinism guarantees were not checked.

## 3. Moddable deterministic games: how features plug in while determinism, saves and replays survive mods and updates (and versioned content schemas)

### Takeaway
The games that manage this do three things. They separate content that affects the simulation from content that does not, and fingerprint the former (Paradox's checksum, Supreme Commander's sim mods). They run mod code in a sandbox stripped of nondeterministic functions, with fixed lifecycle stages and rules for when state may change (Factorio). And they handle version drift either by pinning (StarCraft II keeps old builds for old replays; Dwarf Fortress copies content into each save; Factorio replays break when mods or the version change) or by migrating (Factorio migrations, Minecraft's DataFixerUpper and pack-format ranges). None of them runs old replays on new simulation code.

### Cited Findings

**Factorio**
- **[Fact] A staged mod lifecycle with explicit rules for when state may change.** [Factorio Lua API, "Data Lifecycle"](https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html)
  - Evidence: the settings and prototype stages (`data`, `data-updates`, `data-final-fixes`) run in one shared Lua state that is discarded afterwards; mods load by dependency depth, then name; on loading a save, each mod's `control.lua` registers handlers; `on_init` runs only for new saves or mods new to a save; migrations run at most once per save (JSON, then Lua) and are skipped when joining multiplayer because the host already applied them; `on_load` may only restore metatables, handlers and local references and may read but not write the persistent `storage`, and the docs warn that doing more causes desyncs that break both multiplayer and replays; `on_configuration_changed` fires when the game version, mod versions, mod set, startup settings or prototypes change.
  - Fit: Map these onto Sightline: assembling content before a mission is the data stage; systems are the control stage; restore must never write state (a test can compare the hash before and after restore plus cache rebuild); a save made under an older content set triggers an explicit migration step.
- **[Fact] The sandbox removes or replaces nondeterministic functions.** [Factorio Lua API, "Libraries and Functions"](https://lua-api.factorio.com/latest/auxiliary/libraries.html)
  - Evidence: `loadfile`, `dofile`, `coroutine`, `io` and `os` are removed, mostly for determinism; `pairs` and `next` iterate in insertion order; `math.random` is deterministic and seeded from the map seed, and `math.randomseed` does nothing; trigonometric, hyperbolic, exponential and logarithmic functions are custom, for determinism across platforms; the bundled serialiser no longer prints table addresses.
  - Fit: This is Sightline's rule 2 and `detmath.ts`, arrived at independently; if mission scripts or mods ever exist, give them a restricted API or a declarative format rather than plain JavaScript with globals.
- **[Fact] Real desyncs come from iteration order and unsaved derived state.** [Factorio Friday Facts #340, "Deep desyncs", Klonan, 27 Mar 2020](https://factorio.com/blog/post/fff-340)
  - Evidence: most desync reports involved mods, because control scripting has non-obvious gotchas; one desync came from the serialiser using nil as a placeholder, which in Lua deletes the key and so changed iteration order between peers; another from a unit group that cached its maximum speed without saving it, so the value was recomputed differently after loading.
  - Fit: Keep every cache derived from `sim.state` (the entity index already is) and test that a cache rebuilt after restore equals one maintained tick by tick.
- **[Fact] Cheap checksums every tick, full ones for hunting.** [Factorio Friday Facts #55, 2014](https://factorio.com/blog/post/fff-55)
  - Evidence: in multiplayer testing the team ran a fast, incomplete checksum every tick, switching to a full game-state checksum every tick only for hard cases, since it is slow but precise.
  - Fit: Store a cheap per-tick checksum (poses and events, like the `behaviour` fingerprint) in recordings, so a divergence is located to its tick without a full re-run.
- **[Fact] Replays are pinned to the version and the mod set.** [Factorio wiki, "Replay system"](https://wiki.factorio.com/Replay_system)
  - Evidence: a replay lives inside its save; replays from older versions need the old version; adding or removing mods breaks a replay, as do scripts that change game state; there is no skipping ahead or rewinding.
  - Fit: Sightline's recordings are pinned by `SIM_VERSION` as well; decide now that old recordings are played by old builds rather than promising forward compatibility.

**RimWorld**
- **[Community wiki] Patches instead of overrides.** [RimWorld wiki, "Modding Tutorials/PatchOperations"](https://rimworldwiki.com/wiki/Modding_Tutorials/PatchOperations)
  - Evidence: content is XML Defs; before alpha 17, mods replaced whole Defs and the last one loaded won, losing other mods' changes; PatchOperations select nodes by XPath and add, insert, remove, replace or set attributes, with conditional operations that test whether another mod is loaded; patches apply after all Defs load, in mod order and before inheritance; mods declare load-before and load-after.
  - Fit: Express a mode (night zombies, survival) as a patch over the base tuning (operations at paths) rather than a copied tuning file; recordings embed the resolved result, so replays never depend on the patch engine.
- **[Community] Determinism retrofitted onto a moddable game never ends.** [rwmt/Multiplayer](https://github.com/rwmt/Multiplayer); [rwmt/Multiplayer-Compatibility](https://github.com/rwmt/Multiplayer-Compatibility); [RimWorld Hub desync guide](https://rimworldhub.com/post/rimworld_desyncs_lets_get_back_in_sync)
  - Evidence: a community mod adds cooperative multiplayer to a game not built for it, hooking the game's code through Harmony patches; a separate project carries determinism and sync patches for about 141 other mods and invites their authors to absorb them; mismatched mod lists are the commonest cause of desyncs.
  - Fit: Determinism from the first commit is the expensive-to-retrofit property Sightline already has; protect it above every other foundation rule.

**Paradox (Clausewitz)**
- **[Fact, official wiki] A checksum over gameplay files gates multiplayer and achievements.** [Europa Universalis IV wiki, "Checksum"](https://eu4.paradoxwikis.com/Checksum)
  - Evidence: a four-character checksum beside the version covers the gameplay folders (common, events, missions, decisions, history, and map data including the map bitmaps); some files are ignored so that cosmetic mods leave it unchanged; players with different checksums cannot start a multiplayer game; achievements require the official checksum.
  - Fit: Show a content checksum (sim-relevant tuning plus generation inputs, including any future real-world elevation data) in the debug view and store it in recordings and saves; leave view-only tuning out of it.
- **[Community] Checksums are fragile at the edges.** [Paradox forum, "Mod checksum different in a Linux machine"](https://admin-forum.paradoxplaza.com/forum/threads/mod-checksum-different-in-a-linux-machine.1487263)
  - Evidence: players with identical mod lists sometimes get different checksums; one thread traces a cross-OS difference to non-ASCII file names entering the checksum; load order also changes it.
  - Fit: Hash content, never file names or paths, and canonicalise before hashing (sorted keys, fixed number formatting).

**Supreme Commander: Forged Alliance (FAF community)**
- **[Community] Sim mods and UI mods.** [FAForever forums](https://forum.faforever.xyz/post/45527)
  - Evidence: UI mods change only the local player's view and controls, and each player picks their own; sim mods change the simulation, must be identical for every player, are enabled by the host, and make games unrated; a mod that would desync if one player lacked it is by definition a sim mod.
  - Fit: Sightline's rules 1 and 14 already draw this line for code; draw it for content too, splitting tuning into a simulation section (recorded, checksummed) and a view section (local, free to change).

**StarCraft II**
- **[Fact, first-party] Old replays run on old builds.** [Blizzard, replay changes in patch 2.0.10 (c. 2013)](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10); [Blizzard forums on old replays](https://us.forums.blizzard.com/en/sc2/t/previous-version-of-the-game-replay-cannot-be-watched/28344)
  - Evidence: Blizzard said replays from earlier versions were incompatible with 2.0.10 and must be loaded in earlier versions, and that the game already opened each replay in its matching version automatically; players report that the client keeps old executables and that playback fails when the matching build is missing.
  - Fit: The cheapest way to keep old Sightline recordings watchable is to keep each `SIM_VERSION`'s build reachable (for instance as its own deployment) and route a recording to the build that made it. Vercel's immutable per-deployment URLs make this plausible (not verified here).

**Dwarf Fortress**
- **[Community wiki] Content is copied into the save.** [Dwarf Fortress wiki, "Saved game folder"](https://dwarffortresswiki.org/index.php/DF2014:Saved_game_folder); [wiki, "Raw file"](https://dwarffortresswiki.org/index.php/DF2014:Raw)
  - Evidence: when a world is generated, the raws (text definitions of creatures, materials and so on) are copied into the save, and that world uses its own copy; edits to the base raws reach only new worlds; duplicated raw files cause crashes that are hard to diagnose.
  - Fit: Sightline's rule 16 (content in tuning, embedded in recordings) is the same idea; extend it to saves, so a survival save carries its content and does not change when the base tuning does.

**Minecraft (Java Edition)**
- **[Community wiki] Content packs declare a format range, with minor versions for non-breaking change.** [Minecraft Wiki, "Pack format"](https://minecraft.wiki/w/Pack_format)
  - Evidence: `pack.mcmeta` declares which game versions a data or resource pack supports; ranges (`supported_formats`) arrived in snapshot 23w31a; snapshot 25w31a replaced the single number with `min_format` and `max_format` and added minor versions, bumped for non-breaking changes; data-pack formats run from 4 (1.13) to 121.0 (26.3); a pack outside the game's range is marked incompatible.
  - Fit: Version Sightline's content and recording formats as major.minor: minor for additive, optional fields a reader may ignore; major for anything a reader must understand; readers accept a declared range.
- **[Fact, first-party] Versioned schemas and rewrite rules migrate old data.** [Mojang, DataFixerUpper (MIT)](https://github.com/Mojang/DataFixerUpper)
  - Evidence: DataFixerUpper defines a schema as a set of type definitions and a fix as a rewrite rule between types; a builder takes the chain of schemas and fixes and builds an optimised converter; Mojang made it to convert Java Edition game data between versions.
  - Fit: When saves must outlive a `STATE_SCHEMA` bump (survival mode), keep a chain of small migrations, one per bump, tested by running stored fixture saves through the chain; recordings need none, since they re-simulate on their own build.

**Lockstep classics and a retrofit**
- **[Fact, first-party] Age of Empires: lockstep, recordings as repros, and metering.** [Paul Bettner and Mark Terrano, "1500 Archers on a 28.8", Gamasutra, 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)
  - Evidence: every machine ran the same simulation from the same commands, scheduled two turns ahead; recorded games were reliable repro cases because they always played out identically; checksums covered the world, objects, pathfinding and targeting, and any mismatch stopped the game; desyncs compounded from tiny early differences (a deer misplaced at map generation); cosmetic randomness inside the simulation, or a different number of random calls, broke sync; 50 MB traces made debugging slow; always-on, cheap metering was the team's strongest tool, and its successor added sync checks that compile out of release builds.
  - Fit: Sightline already has per-entity random streams and recordings as repros; add always-on metering per system (rays cast, nodes expanded, entities touched) as deterministic numbers in the profile.
- **[Fact, first-party] League of Legends: retrofitting determinism took a year.** [Riot, "Determinism in League of Legends: Implementation", 20 Jun 2017](https://www.riotgames.com/en/news/determinism-league-legends-implementation); [Riot, "…: Introduction"](https://www.riotgames.com/en/news/determinism-league-legends-introduction)
  - Evidence: the motive was fast, repeatable tests driven by recorded inputs (and recovering a live esports game); the team unified six clock and timing APIs, replaced several random generators with one seeded by the game's id, hunted uninitialised variables and containers ordered by pointer, preloaded data to avoid I/O races, recorded network input per frame in arrival order, and recorded the startup configuration; it took almost a year of several engineers' time; they concluded it was better to make more of the code deterministic rather than less.
  - Fit: Sightline's "no clocks, timers, async or network in `src/sim`" rule is the cheap version of that year; keep the architecture test that enforces it.
- **[Fact, first-party] Staying deterministic is a standing process.** [Riot, Rick Hoskinson, "Determinism in League of Legends: Fixing Divergences", 1 May 2018](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences)
  - Evidence: the article opens with "The price of determinism is eternal vigilance."; rather than checksum memory (hard to trace to a line of code), the game logs its state as hierarchical key-value JSON at the end of each frame, writing only changed values, and a script diffs two logs to the first divergence; 2,000–3,000 real games a day from the public beta servers are re-played on dedicated hardware; a bug seen in about 1 game in 5,000 turned out to be one uninitialised vector component, found by binary search over constructor calls; with daily automated testing and reusable tools, the feature needed no dedicated team after May 2017.
  - Fit: Sightline's plain-data tree makes Riot's diff almost free: on divergence, report the first tick and the first state paths that differ; re-simulate every kept playtest session on a schedule, not only on demand.

### Inferences
- The shared recipe for pluggable content in deterministic games: content is data loaded in fixed stages; the sim-relevant part is canonicalised and fingerprinted; scripts run in a restricted deterministic API; saves carry or migrate their content; replays are pinned to the build that made them.
- Sightline's version numbers already match the split these games use: `SIM_VERSION` pins recordings (StarCraft II, Factorio), `GEN_VERSION` pins worlds (Dwarf Fortress raws), and `STATE_SCHEMA` is what save migrations would key on (DataFixerUpper). Missing: a content checksum (Paradox), a content format version with accepted ranges (Minecraft), and a sim/view split of tuning (Supreme Commander).
- JavaScript iterates integer-like keys (such as numeric ids used as object keys) in ascending numeric order before string keys, regardless of insertion order. This is specified, so it is deterministic across engines, but it can surprise code that assumes insertion order. (Spec behaviour, not re-verified in this research.)

### Gaps
- Factorio's mechanism for syncing and checking the mod set when joining multiplayer was not in the pages read.
- Paradox's out-of-sync detection internals: no official developer diary found, only forum material.
- StarCraft II's data editor (XML catalogs) and how map data is versioned for replays: not found.
- The RimWorld Multiplayer mod's sync API (sync methods, fields and workers): its README does not describe it.

## 4. Lanes and contracts: subsystem interfaces, how teams version them, and per-subsystem benchmarks that gate changes

### Takeaway
Interfaces that let implementations be swapped are data contracts: a stimulus record for perception, a move request and result for physics, inputs and commands for gameplay. They are verified by pinned behaviour on canonical scenes, with a fast tier on every change and a heavier statistical tier on a schedule. In a deterministic simulation every observable bit is depended on, so versions follow fingerprints, and lanes are better served by their own pinned scenes than by their own version numbers.

### Cited Findings
- **[Fact] Unreal's AI Perception: senses as configuration, stimuli as data.** [Epic docs, "AI Perception"](https://dev.epicgames.com/documentation/en-us/unreal-engine/ai-perception-in-unreal-engine)
  - Evidence: a perception component on the AI controller listens for configured senses (sight, hearing, damage, team, touch, prediction), each with a maximum age after which stimuli are forgotten; actors register as stimulus sources; updates deliver a stimulus record holding age, expiration age, strength, stimulus location, receiver location, a tag and whether it was successfully sensed; hearing filters by affiliation; custom senses are written in C++; a debug view shows perception during play.
  - Fit: Lab A's percept kinds should be such records in `GuardMind` (kind, strength, source location, the guard's own location, age, expiry), with senses configured per body kind in tuning, so a zombie kind can hear differently without code changes.
- **[Fact] Godot adopted an alternative physics engine that had proven itself as an extension.** [Godot 4.4 release notes (2025)](https://godotengine.org/releases/4.4/)
  - Evidence: Jolt, used by many Godot developers through an extension since late 2022, was integrated into the engine as an opt-in, experimental alternative to Godot Physics, chosen in project settings.
  - Fit: Keep collision behind the `resolveMove`/`Solids` seam so an alternative motor or collision implementation can sit behind a tuning flag, be compared in scenes, and be promoted only when its goldens are accepted.
- **[Fact] Hyrum's Law: every observable behaviour becomes part of the contract.** [hyrumslaw.com](https://www.hyrumslaw.com/)
  - Evidence: Hyrum Wright observed, and Titus Winters named, that with enough users every observable behaviour of a system is depended on, whatever the documented contract says, until interface and implementation become indistinguishable.
  - Fit: In a bit-exact simulation every bit is observable through recordings and goldens, which is why `SIM_VERSION` moves with any behaviour change. Separate version numbers per lane would be false precision; per-lane pinned scenes are honest.
- **[Fact] Box2D: one canonical scene pins determinism on every pull request.** [Erin Catto, "Determinism", Box2D blog, 27 Aug 2024](https://box2d.org/posts/2024/08/determinism/); [Box2D FAQ](https://box2d.org/documentation/md_questions.html)
  - Evidence: a "falling hinges" test runs in CI on every pull request across MSVC, Clang and GCC, x64 and ARM, and several thread counts; it checks two numbers, the steps until every body sleeps and a hash of their transforms; an intended change that moves them fails CI until the maintainer confirms determinism still holds and updates the targets; cross-platform determinism required avoiding fast-math, disabling fused multiply-add and writing custom `sin`, `cos` and `atan2`, at no noticeable cost; Box2D has had cross-platform determinism since v3.1; Catto does not support rollback, because the engine's internal state and ordering are hard to restore.
  - Fit: This is Sightline's golden scheme, validated. Add per-lane canonical scenes (the perception ladder, a ballistics range, the motor course, camp seeds, an escalation script) with their own pinned values, so a lab sees which lane moved and parallel labs rarely collide on the global goldens.
- **[Fact] Riot: real sessions replayed daily as the determinism gate.** [Riot, "Fixing Divergences", 1 May 2018](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences) (details in section 3)
  - Fit: Run `npm run playtest` over every kept session in scheduled CI, keeping failures as recordings.
- **[Fact] Stockfish's Fishtest: statistical gates for a game AI.** [Fishtest documentation, "Fishtest Mathematics"](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html); [Wikipedia, "Stockfish (chess)"](https://en.wikipedia.org/wiki/Stockfish_(chess)) (via search summary)
  - Evidence: Stockfish accepts or rejects changes to its playing code by playing tens of thousands of games against a reference version on volunteers' machines, using a generalised sequential probability ratio test that stops as soon as the evidence is sufficient; bounds are set in normalised Elo; paired-game (pentanomial) statistics save substantial testing; workers with anomalous results are flagged; by February 2025 the framework had used over 16,700 CPU-years to play more than 8.7 billion games.
  - Fit: Labs A and E have outcome metrics (detection times within ranges, escalation contained) that bots can measure across many seeds; gate behaviour changes with a sequential test against the reference build rather than on one seed, and keep the history as a quality trend.
- **[Fact, secondary] Sea of Thieves: tests from day one, in tiers.** [GDC Vault, Robert Masella, "Automated Testing of Gameplay Features in 'Sea of Thieves'", GDC 2019](https://gdcvault.com/play/1026366/Automated-Testing-of-Gameplay-Features); [slides hosted by a third party](https://www.sambuz.com/doc/automated-testing-for-multiplayer-game-ai-automated-ppt-presentation-901544); [GDC Vault, "Lessons Learned in Adapting the 'Sea of Thieves' Automated Testing Methodology to 'Minecraft'"](https://www.gdcvault.com/play/1027345/contactUs)
  - Evidence: Rare built the game with automated gameplay tests from the start; slides attributed to the talk cite about 10,000 tests, a core set run before every check-in and longer tests periodically, justified by a live game's need for constant build confidence; a later GDC talk carried the methodology over to Minecraft.
  - Fit: The scene harness and its scenario tables are the asset most likely to transfer to future games; keep two tiers, fast scenes in `npm run check` and long fuzz, seed sweeps and statistical runs on a schedule.
- **[Fact, first-party] Factorio: go fast by going well.** [Factorio Friday Facts #366, kovarex, 18 Jun 2021](https://factorio.com/blog/post/fff-366)
  - Evidence: end-to-end tests drive simulated input through every layer; a test-dependency system guarantees that a failing test's dependencies already pass, which isolates the simplest failure; coverage tools find dead code; QA writes a test before each bug fix; the tests made a rewrite that deleted thousands of lines safe.
  - Fit: Let each lane's scenes declare the kernel scenes they rely on, so a failure points at the lowest broken layer, and adopt "a scene before every bug fix".
- **[Fact, via transcription] Overwatch: single writers, read-only access, budgets through deferment.** [Sohu write-up of Ford's talk](https://www.sohu.com/a/148848770_466876) (section 2)
  - Fit: Write the single writer of each state subtree into the lane map, and enforce it in tests.

### Inferences
- Lane contracts for Sightline: perception owns percepts and beliefs in `GuardMind` (records of kind, strength, location and age); awareness owns the ladder; the camp brain consumes beliefs and emits orders; the motor consumes `MoveIntent` and owns poses; projectiles own shots and hits; generation owns the world and its sites, checked by its validators and fingerprint. Each lane gets its canonical scenes, pinned values, debug overlay (rule 8) and single-writer subtrees.
- Budgets: time depends on the machine (rule 18), so the gated budgets should be deterministic work counts per system per tick (rays cast, grid nodes expanded, bodies resolved), pinned like goldens; wall time on a reference machine is tracked only as a trend.
- Divergence tooling is the multiplier: Riot's per-path diff, Factorio's cheap checksums and Age of Empires' metering each turned rare desyncs from weeks of hunting into hours.

### Gaps
- No primary source was found for AI test arenas in action games (as opposed to chess engines), or for a large studio's physics regression suite beyond Box2D; Game Developer's piece on Rare's AI testing was found in search but not read.
- Studio practice for per-system frame budgets enforced in CI was not sourced.

## 5. Pitfalls: "make games, not engines", the rule of three, abstraction costs in hot paths and for determinism, and when to split into packages

### Takeaway
Reusable technology is best extracted from working games once it has been needed two or three times. Abstractions built ahead of need tend to accrete parameters and conditionals until they hurt. Flexibility belongs in data, not in inner loops. Splitting into packages pays when a second consumer or build time demands it, not before.

### Cited Findings
- **[Opinion, practitioner] Extract engines from finished games.** [Josh Petrie, "Write Games, Not Engines", 30 Aug 2007 (2013 mirror)](https://geometrian.com/programming/tutorials/write-games-not-engines/index.php)
  - Evidence: engines built without a game tend to be unfocused and fragile, little more than tech demos; his process is to build a game, move what is reusable into a base library, strip game-specific dependencies, test the library against the finished game, and repeat with each new game.
  - Fit: Phase 1 builds the game; extract and harden the kernel at the Phase 2 gate, testing it against the stealth-sniper scenes.
- **[Rule of thumb] The rule of three.** [Wikipedia, "Rule of three (computer programming)"](https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming))
  - Evidence: attributed to Don Roberts and popularised by Martin Fowler's *Refactoring*: tolerate two similar copies and extract at the third, because extracting earlier risks the wrong abstraction.
  - Fit: Generalise "camp" into "base" only once a second and third base type exist; the plan's logging camp and comms relay are the natural second and third.
- **[Opinion, practitioner] Duplication is cheaper than the wrong abstraction.** [Sandi Metz, "The Wrong Abstraction", 20 Jan 2016](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction)
  - Evidence: a shared abstraction meets a requirement that almost fits; each later programmer adds a parameter and a conditional; sunk cost keeps it alive; her remedy is to inline it back into its callers, delete what each caller does not use, and extract again from what remains.
  - Fit: The tell in Sightline would be mode flags threaded into the shared motor or the brain; new motor modes and new brains should be separate functions, selected by data.
- **[Opinion, practitioner] Make code usable before making it reusable.** [Casey Muratori, "Semantic Compression", 28 May 2014](https://caseymuratori.com/blog_0015)
  - Evidence: he writes each case concretely and extracts shared code only once it has appeared at least twice, so the reusable version is shaped by real uses; he argues that objects emerge from this process rather than being designed first.
  - Fit: Labs should write their systems concretely and compress at their own milestone ends, not design frameworks at the start.
- **[Opinion, practitioner] Flexibility costs learning time and runtime.** [Nystrom, "Architecture, Performance, and Games"](https://gameprogrammingpatterns.com/architecture-performance-and-games.html) (section 2)
  - Fit: Keep extension points at the granularity of systems and content, never per entity per call.
- **[Fact] In JavaScript, generic call sites slow down as they see more object shapes.** [Vyacheslav Egorov, "What's up with monomorphism?", 11 Jan 2015](https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html)
  - Evidence: V8 caches each property access by object shape; one shape is fastest, up to four is polymorphic, more is megamorphic and falls back to a slow global lookup that also blocks inlining; shapes diverge when properties are added conditionally, in a different order, or deleted; he advises profiling before worrying.
  - Fit: A dispatch loop over registered systems is fine (one call per system per tick); a generic helper fed differently shaped objects of every entity kind is not. Give all entities of a kind the same fields, created in the same order, with `null` rather than absent fields.
- **[Fact] Determinism rules out the convenient math.** [MDN, `Math`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math); [Box2D, "Determinism"](https://box2d.org/posts/2024/08/determinism/); [Factorio, "Libraries and Functions"](https://lua-api.factorio.com/latest/auxiliary/libraries.html)
  - Evidence: MDN notes that many `Math` functions have implementation-dependent precision, so browsers, and even one engine on different platforms, can disagree; Box2D and Factorio both replaced trigonometry with their own implementations for this reason.
  - Fit: Keep `detmath.ts` and its architecture test; any shared library a future game pulls into the simulation must pass the same import scan.
- **[Fact] Determinism retrofitted is expensive; designed in, it is cheap.** [Riot, "Implementation", 2017](https://www.riotgames.com/en/news/determinism-league-legends-implementation); [rwmt/Multiplayer-Compatibility](https://github.com/rwmt/Multiplayer-Compatibility)
  - Fit: The rules never to relax for a feature's sake are 2, 3 and 5.
- **[Fact] Splitting has build costs as well as benefits.** [TypeScript handbook, "Project References"](https://www.typescriptlang.org/docs/handbook/project-references.html); [Unity, ECS status, Dec 2025](https://discussions.unity.com/t/ecs-development-status-december-2025/1699284/1)
  - Evidence: project references speed builds and enforce separation, but referenced projects must emit declarations, editors need those outputs (or an in-memory fallback that costs performance), and dependencies build only under `tsc -b`; Unity pulled its ECS packages into the core, with versions that track the editor, so it can change them faster.
  - Fit: Tightly coupled lanes should share one version and one build until a real second consumer exists.

### Inferences
- When to split Sightline into packages: (1) a second consumer needs the kernel without the game (a second game, a headless server, a separate tools app); (2) typecheck and test time make `npm run check` slow enough that people skip it; (3) a boundary has stayed stable, with few pull requests editing both sides. Until then, folders plus lint-enforced boundaries give most of the benefit at none of the build cost.
- Premature generalisation risks specific to the horizons: a generic mode framework before a second mode exists; a generic inventory before survival is designed; streaming before a big world exists. Each fails the rule of three today.

### Gaps
- No quantitative study of the cost of premature generalisation in games was found; the sources are practitioners' judgements.

## 6. TypeScript practice: workspaces and project references, enforcing dependency direction, and allocation-free, deterministic hot paths across module boundaries

### Takeaway
TypeScript offers three tiers of boundary: folders with lint rules (cheap and fine-grained, the right default now), project references (compiler-enforced, incremental builds, declaration outputs), and workspaces (separate packages, each with its own `package.json`). Dependency direction is best enforced by one declarative lane map checked in CI and in the editor, alongside the project's own architecture tests. Hot paths stay fast and deterministic by keeping object shapes stable, allocating outside the tick, and using only the deterministic math module.

### Cited Findings
- **[Fact] Project references.** [TypeScript handbook, "Project References"](https://www.typescriptlang.org/docs/handbook/project-references.html)
  - Evidence: a project lists the projects it references and imports their built declarations instead of their sources; referenced projects need `composite`, which requires declarations and every file listed or included; `tsc -b` finds referenced projects, checks whether they are current and builds them in dependency order; a "solution" config with empty `files` references every leaf project; costs as in section 5.
  - Fit: When the kernel splits out, make it a composite project that the game references; the compiler then refuses imports the reference graph does not allow.
- **[Fact] `isolatedDeclarations` (TypeScript 5.5, 2024).** [TypeScript 5.5 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)
  - Evidence: it requires explicit types on exports (trivially inferable ones excepted) so that declaration files can be generated without a type checker, letting monorepo packages build in parallel; it changes only error reporting, not emit; the TypeScript team recommends it case by case, because it costs some ergonomics.
  - Fit: Worth enabling, or imitating by convention, for lane entry points (`TickContext`, `GuardMind`, percepts, orders), because explicit exported types are the written contract between labs, whatever the build benefit.
- **[Fact] npm workspaces.** [npm docs, "workspaces"](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
  - Evidence: a root `package.json` lists workspace folders, each its own package; `npm install` symlinks them into the root `node_modules`; scripts run in one, several or all workspaces.
  - Fit: The eventual layout might be `packages/sim-kernel`, `packages/sim-<lane>`, `packages/game-stealth`, `packages/render` and `apps/web`, adopted only when section 5's criteria are met.
- **[Fact] dependency-cruiser.** [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
  - Evidence: it validates JavaScript and TypeScript dependencies against rules you write, chiefly forbidden rules with `from` and `to` path patterns; `--init` adds rules for circular dependencies, orphans, undeclared packages and production code depending on development dependencies; it reports as lint-style text or as graphs (dot, mermaid, HTML).
  - Fit: One forbidden rule per arrow the lane map disallows (the kernel importing a lane, `sim` importing `render`, a lane reaching into another lane's internals) replaces hand-written regex checks, and the graph output documents the lanes.
- **[Fact] eslint-plugin-boundaries.** [javierbrea/eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
  - Evidence: folders are classified into element types by path pattern; a dependencies rule with a default of disallow lists the allowed imports between element types, and its errors name the forbidden pair; violations appear in the editor as well as in CI.
  - Fit: Editor-time feedback suits parallel lab sessions, which then meet a forbidden import while writing it, not at the end of the pull request.
- **[Fact] Nx module boundaries.** [Nx, "Enforce Module Boundaries"](https://nx.dev/features/enforce-module-boundaries)
  - Evidence: projects carry tags such as `scope:client`; a lint rule lets a source tag depend only on listed tags; untagged projects may depend on nothing unless configured otherwise.
  - Fit: Tags such as `layer:kernel`, `layer:lane`, `layer:game`, `layer:view`, plus `side:sim` and `side:view`, would express rules 1 and 13 directly, if Sightline ever adopts Nx.
- **[Fact] Stable shapes in V8.** [Egorov, 2015](https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html) (section 5)
- **[Fact] No garbage in the simulation.** [Photon Quantum introduction](https://doc.photonengine.com/quantum/current/quantum-intro)
  - Evidence: Quantum's simulation code allocates no managed heap memory at runtime.
  - Fit: Allocate scratch buffers once per system (outside the state, never carrying state between ticks), reuse arrays for queries, avoid closures created per entity per tick, and add an allocation measurement to the existing `npm run sim -- --profile` bot run.

### Inferences
- For Phase 1: stay one package; write the lane map once, as data, and generate both the dependency-cruiser (or eslint-plugin-boundaries) rules and the architecture-test expectations from it; give each lane one `index.ts` entry point and ban deep imports into another lane; give lane entry points explicit exported types.
- Determinism across module boundaries: the forbidden-math scan must cover every module the simulation reaches, including shared utilities that later move into packages; any package the simulation imports should carry the same "sim-safe" tag and pass the same scan.
- Plain-data state and hidden classes: since entities are plain objects in the tree, creating each kind through one factory, with every field present, keeps both the hash and V8's shapes stable.

### Gaps
- Not verified: dependency-cruiser's options for type-only imports, and the remaining eslint-plugin-boundaries rules (entry points, private files), which the fetched pages did not detail.
- No benchmark was found comparing generic state-tree hashing with schema-generated hashing in V8.

## 7. What it means for Sightline: what to keep and what to change

### Takeaway
Sightline's foundation already matches what shipped deterministic games converged on: one state frame, stateless systems in a declared order, seeded streams, deterministic math, recordings as repros, golden fingerprints, content embedded in recordings, and a perception boundary. Scalability, in the sense the owner asked for, comes from lanes with written contracts and their own gates, not from a general engine designed up front. The changes worth making turn today's vigilance into mechanical guards: declared data access per system, a feature unit that registers into the kernel, per-lane pinned scenes and deterministic budgets, a sim/view split of content with a checksum, and an explicit policy for old recordings and long-lived saves.

### Cited Findings
- One state frame, stateless systems, events to the view: [Photon Quantum](https://doc.photonengine.com/quantum/current/quantum-intro); [Overwatch, via the Sohu write-up](https://www.sohu.com/a/148848770_466876).
- Declared order and access, with conflict detection: [Bevy](https://docs.rs/crate/bevy/latest/source/examples/ecs/nondeterministic_system_order.rs); [Llopis](https://gamesfromwithin.com/data-oriented-design).
- Features that inject into the core: [Unreal Game Features](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine); [Bevy plugins](https://docs.rs/bevy/latest/bevy/app/trait.Plugin.html).
- Pinned canonical scenes in CI: [Box2D](https://box2d.org/posts/2024/08/determinism/); daily replays: [Riot](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences); statistical gates: [Fishtest](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html).
- Content fingerprints and the sim/view split: [Paradox checksum](https://eu4.paradoxwikis.com/Checksum); [FAF sim and UI mods](https://forum.faforever.xyz/post/45527).
- Pinning and migration: [StarCraft II](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10); [Factorio replays](https://wiki.factorio.com/Replay_system); [DataFixerUpper](https://github.com/Mojang/DataFixerUpper); [pack format](https://minecraft.wiki/w/Pack_format).
- Extraction over up-front design: [Petrie](https://geometrian.com/programming/tutorials/write-games-not-engines/index.php); [Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction); how shared engines fail: [Kotaku, 2019](https://kotaku.com/how-biowares-anthem-went-wrong-1833731964).

### Inferences
Timing tags follow the foundation plan's rule (a seam goes in now only if it is cheap now and expensive to retrofit): **Now** means before wave 1's lab branches open, **With the labs** means inside the lab that owns it, **At a trigger** means when the named condition occurs.

**Keep**
1. One plain-data `sim.state` with generic hash, save and restore (Quantum's frame; Unity's convergence shows the price of two models).
2. Declared phases, the schedule for delays, per-entity random streams, `detmath` and the no-clock rule (Age of Empires, Riot, Factorio, Box2D).
3. Recordings as repros, and goldens updated only deliberately (Age of Empires, Box2D).
4. The perception boundary, with percepts as data records (Unreal AI Perception, Overwatch's data-only components).
5. Content embedded in recordings (Dwarf Fortress raws, Factorio prototypes).
6. Horizons shape interfaces only; generalise at the third use (Petrie, the rule of three, Metz, Muratori).
7. Determinism for the whole simulation rather than per system, which is cheaper than any retrofit (Riot, RimWorld Multiplayer).

**Change or add**
1. **Now:** `reads`, `writes` and `emits` on every system, one writer per state subtree, and a test for conflicts within a phase (Bevy, Overwatch, Llopis).
2. **Now (light), at a trigger (full):** each lab exposes a lane module that exports its systems by phase, event types, tuning sections, entity kinds, scenes and overlays, and `SYSTEMS` is assembled from lane exports; the kernel never imports a lane and runs with none. Selecting feature sets per `MissionSpec` (modes) waits until a second mode exists (Game Features, Bevy plugins, the rule of three).
3. **Now:** per-lane canonical scenes with pinned values beside the global goldens, so parallel labs see which lane moved (Box2D).
4. **Now:** a test that steps two simulations interleaved, to flush out module-level state before several bases or in-game replays need it (Overwatch's kill-cam).
5. **Now:** one lane map as data, driving dependency-cruiser or eslint-plugin-boundaries and the architecture tests; one `index.ts` per lane; explicit exported types at lane entry points (TypeScript, Nx).
6. **With the labs:** percepts as stimulus records with age and expiry, and senses configured per body kind (Unreal AI Perception); perception, navigation and generation as icebergs with small typed outputs (Overwatch).
7. **With the labs:** deterministic work counters per system as gated budgets; wall time only as a trend (rule 18, Age of Empires' metering).
8. **With the labs:** scheduled CI that re-simulates every kept session, runs long fuzz and seed sweeps, and runs sequential statistical tests of AI and feel metrics against the reference build (Riot, Fishtest, Sea of Thieves).
9. **With the labs:** divergence reports that name the first tick and the first differing state paths, plus a cheap per-tick checksum in recordings (Riot, Factorio).
10. **At a trigger (the first content that is view-only, or the first mode):** tuning split into `sim` (recorded, checksummed, shown in the debug view) and `view` (local); modes written as patches over the base tuning (Paradox, Supreme Commander, RimWorld).
11. **At a trigger (the first save meant to outlive a build):** recordings stay pinned and replay on their own build, reachable per `SIM_VERSION`; saves migrate through a chain of small fixes keyed on `STATE_SCHEMA`, tested with stored fixtures; content and recording formats become major.minor with accepted ranges (StarCraft II, Factorio, DataFixerUpper, Minecraft).
12. **At a trigger (a second consumer, slow checks, or a stable boundary):** split into workspaces and composite projects (TypeScript, npm, Unity's experience with separately versioned packages).

### Gaps
- The fit lines are inferences from the sources and from Sightline's own documents (`CLAUDE.md`, `docs/phase-1-plan.md`, `docs/foundation-plan.md`); none has been prototyped or measured.
- The web-search limit was reached partway through. Insomniac, Unreal's module system, Unity DOTS determinism, O3DE Gems and further primary material on AI test arenas were not covered; a follow-up session could fill them.
