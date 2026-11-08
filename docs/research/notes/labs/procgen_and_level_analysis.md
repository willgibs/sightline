# Procedural generation and automated analysis of stealth and combat levels and enemy outposts

Scope: how shipped games and research generate tactical or stealth levels and enemy bases, and how such levels are analysed and validated automatically (visibility over time, guard coverage, infiltration paths, difficulty, diversity of solutions). Every technique is tagged **[Shipped: game]** or **[Research]**, with dates where a source gives them. Sightline fit notes are kept in each section's Inferences.

Method and caveats for the report writer:
- I read primary texts where possible (papers extracted from PDF, Brogue's source code, GDC Vault listings, developer articles).
- Where a finding rests only on a search-engine summary or a secondary write-up, it is flagged *(lower confidence: ...)*.
- The session's web-search budget ran out partway through. Several named games (State of Decay, Ghost Recon Breakpoint, MGSV, RimWorld base generation, Heat Signature and others) are therefore listed under Gaps, not covered.
- Quotations are avoided; nearly everything is paraphrased.

Sightline context used in the fit notes:
- Each mission is a 1–1.5 km² region on a 2.5 m terrain grid, with one camp of about 150 × 150 m on a 0.5 m grid.
- The camp is assembled from handmade modules.
- A guard's routine is a pure function of time.
- Validation covers three approaches, no unsolvable cluster, an interceptable escape, two exfil routes, at most 16 guards, and no single perch that wins.
- Generation budgets are iteration counts, and only plain-data output is allowed.

## 1. Shipped games: how procedural tactical and stealth levels and outposts are assembled and validated

### Takeaway
Every shipped example found uses a hybrid of handmade modules or rooms placed into a constraining frame:
- a plot, a solution path, a concept graph or a grid of rooms;
- plus cheap local randomness;
- plus a generate-and-test loop that throws a level away or retries when a threshold or reachability check fails, often under small fixed attempt limits (Brogue: 10, 50 or 1000 tries).

None of the shipped games found publishes a visibility-based validation of stealth difficulty. Klei said its procedural levels were its players' biggest frustration during Invisible, Inc.'s early access, which shows that is where the risk lies. Open-world outposts (Far Cry, Ghost Recon Wildlands) appear to be handmade, with procedural tools used only at authoring time for terrain, roads and settlements.

### Cited Findings

#### Invisible, Inc. (Klei) [Shipped: procedural turn-based stealth]
- **Talk:** Klei designer James Lantz gave "Designing Procedural Stealth for Invisible Inc." at the GDC 2015 Independent Games Summit. The public listing describes only the journey from concept to completion, not the algorithm — [GDC Vault](https://gdcvault.com/play/1021919/Designing-Procedural-Stealth-for-Invisible)
- **Why procedural levels:** In a May 2015 interview, Lantz called procedural levels the core of the game: every run gets a fresh level.
  - Keeping generated levels fun but not predictable was the hard part.
  - Guard intentions were made transparent and readable, a lesson carried over from Mark of the Ninja.
  - Combat was de-emphasized in favour of dependable, plannable options.
  - [Shacknews 2015](https://shacknews.com/article/89531/invisible-inc-programmer-discusses-design-stealth-and-procedurally-generated-stages)
- **Early-access response:** In January 2014, Klei said its players complained most about the procedural generation and an uneven difficulty curve, and that it would keep improving generation.
  - It added guard-manipulation tools: new interest points, distractions, sneaking behind guards, making them turn.
  - It framed the difficulty as intended, so players learn systems rather than memorize levels.
  - [Shacknews 2014](https://www.shacknews.com/article/82772/invisible-inc-adjusting-difficulty-for-procedural-generation)
  - *(lower confidence: relayed from Rock Paper Shotgun)*

#### XCOM 2 (Firaxis) [Shipped: plots, parcels and PCPs]
- **Talk:** Brian Hess (Firaxis) gave "Plot and Parcel: Procedural Level Design in XCOM 2" at GDC 2018. It covers the costs and benefits of procedural levels and the move from XCOM: Enemy Unknown's handcrafted maps. The public listing does not detail the algorithm — [GDC Vault](https://gdcvault.com/play/1025213/Plot-and-Parcel-Procedural-Level)
- **Plots and parcels:**
  - Plots are hand-crafted map layouts, mostly roads connecting parcels in cities, or forest paths. They carry randomized set dressing (cars, traffic lights, checkpoints) placed as a diorama rather than object by object.
  - Parcels are slots filled from a bank of premade modular buildings that fit the map's theme, in small, medium and large sizes.
  - Primary objectives are plot-driven. Secondary objectives use the modular content (destroy a building, hack a terminal).
  - Firaxis said Enemy Unknown's random levels had been "too random" and looked bad.
  - [Game Rant, June 2015](https://gamerant.com/xcom-2-procedural-level-detail/) *(lower confidence: secondary, pre-release, relaying an IGN interview with Garth DeAngelis and Greg Foertsch)*
- **PCPs:** Players describe a map as the result of parcels and PCPs slotted into a plot, with PCPs filling the gaps. Most maps are procedural except some story and DLC missions, and some plots (for example the sewers) vary less — [Steam discussion](https://steamcommunity.com/app/268500/discussions/0/1653297026034744537) *(lower confidence: players, not developers; what "PCP" stands for is not given)*

#### Spelunky [Shipped: room grid, solution path, templates]
- **Solution path:** The level is a 4×4 grid of rooms, and the solution path is laid down first.
  - The path starts in the top row and moves by a uniform roll of 1–5: left, left, right, right or down.
  - At the edges it drops and reverses direction.
  - Rooms are typed by guaranteed exits: type 1 has left and right; type 2 adds bottom; type 3 adds top.
  - Rooms off the path are type 0, with no guaranteed exits.
  - [Kazemi, Spelunky Generator Lessons pt. 1](http://tinysubversions.com/spelunkyGen/) *(medium confidence: reverse-engineered from a modded build; undated)*
- **Room contents:**
  - Each room type has about 8–16 templates. A template is a 10×8 grid of tile codes.
  - Some codes are probabilistic, for example 50/50 solid-or-empty, or 33% spike.
  - Each template also has fixed 5×3 obstacle-block slots, filled from obstacle templates.
  - Rooms may be mirrored. The exits stay fixed whichever template is chosen.
  - [Kazemi pt. 2](http://tinysubversions.com/spelunkyGen2/)

#### Dead Cells (Motion Twin) [Shipped: hybrid handmade and procedural, 2017 article]
- **Pipeline** — [Bénard, The Level Design of Dead Cells (Gamasutra, March 2017; republished)](https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/); also [Game Developer original](https://www.gamedeveloper.com/design/building-the-level-design-of-a-procedurally-generated-metroidvania-a-hybrid-approach-)
  - A hand-designed world frame stays fixed across seeds.
  - Hand-designed room tiles belong to one biome each. Each tile has a purpose and variations by exit count.
  - A designer-authored concept graph per biome constrains level length, the number of special tiles, how labyrinthine the biome is, and the tile distance from the entrance to the nearest exit.
  - For each graph node the generator tries random rooms until one fits the node's requirements, which Bénard calls mostly brute force.
  - Monsters are budgeted per combat tile (example: 250 tiles at 1 per 5 tiles gives 50). Per-type rules apply: some types cost 10 tiles, some are capped per level, some cannot share a platform.
  - A fully procedural prototype was abandoned because the level design suffered.
- **Later change:** Replying to a commenter, Bénard said the final version moved to a WFC-like method, partly because of the Switch port — [same page](https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/) *(lower confidence: comment thread)*

#### Diablo 1 [Shipped: per-stage constructive generators with validation and retry]
- **Analysis** — [Boris the Brave, Dungeon Generation in Diablo 1 (2019)](https://www.boristhebrave.com/2019/07/14/dungeon-generation-in-diablo-1/) *(medium confidence: secondary, but based on the Devilution reconstruction of the original code)*
  - Each level is a 40×40 tile grid, built in two stages: a floor plan, then tile selection.
  - Each stage uses a different algorithm. The Cathedral places rooms along an axis and buds more off them. The Catacombs subdivide recursively. The Caves grow from a central room.
  - Handmade set pieces (one per level, mostly for quests) and small 3×3 "minisets" are pasted in by pattern match.
- **Validation and regeneration:**
  - Walkable-tile minimums: Caves at least 600 floor tiles, Catacombs at least 700.
  - A lockout check that the whole level is reachable.
  - Retries when stairs, a lava pool or a set piece cannot be placed.
  - Many fix-up routines for known defects.

#### Brogue (Brian Walker; Brogue CE fork) [Shipped: topology analysis drives placement, with fixed retry budgets]
Source for this entry: [Architect.c, Brogue CE](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c) (high confidence: primary source code; AGPL-3.0 per the file header and the [repo](https://github.com/tmewett/BrogueCE)).
- **Map analysis:** `analyzeMap` marks cells that lie in loops. It then marks chokepoints: passable cells outside loops whose neighbourhood has more than two passable and impassable transitions.
- **Choke map:** It blocks each chokepoint in turn and flood-fills to count how many cells would be cut off. It stores the counts in `chokeMap` and flags those cells as gate sites.
- **Machine placement:** Room-type "machines" (vaults, puzzles) pick a gate site whose cut-off area fits the blueprint's size range. Their interior is flood-filled behind that gate.
- **Fixed retry budgets:**
  - 10 attempts to find a blueprint and location;
  - 10 attempts for sub-machines, after which the whole machine is aborted and the map restored from a backup;
  - 50 attempts for guaranteed machines;
  - 1000 for item regeneration.

#### RimWorld (Ludeon) [Shipped: threat-point budget for raids]
- **Formula:** Raid points = (wealth points + pawn points) × difficulty × starting factor × adaptation factor, capped at 10,000.
  - Wealth counts items and creatures at full value and buildings at 50%. It maps to up to 4,200 points at 1,000,000 or more wealth.
  - Each colonist is worth about 15 to 200 points depending on wealth.
  - The adaptation factor moves with recent colonist deaths and downings, from about 0.4 to 1.47.
- **Spending:** The storyteller buys raiders at about 1 point per point of combat power.
- [RimWorld Wiki: Raid points](https://rimworldwiki.com/wiki/Raid_points) *(medium confidence: community wiki, covering versions 1.2–1.4+)*

#### Ghost Recon Wildlands (Ubisoft Paris) [Shipped: procedural authoring tools, not runtime]
- **What was procedural:**
  - Terrain was generated in World Machine on an 80-machine farm.
  - Houdini tools made roads, rivers, railways, fields and power lines.
  - Settlements used a fully procedural pass, then hand detailing. Some key locations, such as a boss's spot inside a village, were made by hand and the village generated around them.
  - Buildings got a generated structure and hand-placed windows, doors and props.
  - The article never mentions enemy bases or outposts as procedural.
  - The art director's framing: "Nothing is random. Every river, every mountain is there for a reason."
  - [80.lv interview, April 2017](https://80.lv/articles/procedural-technology-in-ghost-recon-wildlands/)
- **GDC talk:** "Ghost Recon Wildlands: Terrain Tools and Technology" (Werlé and Martinez, GDC 2017) — [GDC Vault](https://gdcvault.com/play/1024708/-Ghost-Recon-Wildlands-Terrain)

#### Far Cry / Ubisoft open-world objectives [Shipped: handmade, design method only]
- **360 approach:** Ubisoft's "360 approach" to objective design began on Assassin's Creed 1 and is still used on Far Cry. It applies progression-curve techniques to non-linear objectives, with gameplay focus, difficulty progression and themes. Philippe Bergeron (Ubisoft Montreal) presented it at GDC 2016. The listing does not discuss outposts specifically — [GDC Vault](https://www.gdcvault.com/play/1023550/Level-Design-Workshop-360-Approach)

#### Unexplored (Ludomotion, Joris Dormans, 2017) [Shipped: cyclic graph generation]
- **Method:** The level is built from cycles: two routes between a start and a goal. Rewrite rules insert lock-and-key cycles, shortcuts, risk-versus-reward alternatives and one-way paths into existing cycles; a typical map has only a couple of nested cycles. Patterns are authored in Ludoscope.
- **Layout:** The graph is generated on a grid, turned into a low-resolution tilemap, then refined over several passes, and monsters, traps, keys and locks are placed from graph metadata.
- **Budget and safety:** Each run must generate 20 complete dungeons. Locks with no guaranteed solution are kept off the main path.
- [Tommy Thompson, Game Developer, 2021](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-) *(medium confidence: secondary, based on Dormans's talks; deeper secondary analysis at [Boris the Brave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/), not read here)*

#### WFC in shipped games [Shipped]
- The WFC repository lists shipped and other uses: Bad North, Caves of Qud, Townscaper, Dead Static Drive, Matrix Awakens, Proc Skater (2016), Swapland (2017) and others — [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)

### Inferences
Fit notes, one per technique:
- **XCOM 2 plot/parcel/filler** [Shipped]: the closest match to Sightline's compound.
  - The plot is the perimeter, gate and road skeleton in the site frame; parcels are the tower, building, generator and motor-pool slots sized from the 0.5 m grid; filler is cover clusters and dressing.
  - It is deterministic if parcel choice draws from a labelled RNG fork per slot.
- **Spelunky solution path first** [Shipped]: lay down a guaranteed skeleton for each required approach before filling the rest:
  - a perch line for long range;
  - a low-exposure corridor for infiltration;
  - a reachable sabotage node for systems;
  - two exfil corridors.

  This turns validation into "did the fill break the skeleton?", which is cheap and keeps first-try pass rates high.
- **Dead Cells concept graph + brute-force fit** [Shipped]: a per-archetype zone graph (gate, yard, HQ/objective, motor pool, generator, barracks) with designer constraints, filled by trying modules until one fits. Cap the tries per node, Brogue-style, to satisfy the iteration-budget rule.
- **Dead Cells monster budget per tile** and **RimWorld threat points** [Shipped]: model staffing as a points budget spent on roles. Sentry, patrol, marksman, radio operator and officer get costs, under a hard cap of 16 guards. Difficulty becomes a single number to aim at.
- **Diablo thresholds plus restart** [Shipped]: cheap scalar checks (walkable area, reachability) run before expensive visibility analysis. This rejects bad layouts early.
- **Brogue chokepoint and gate analysis** [Shipped]:
  - It finds where to put sentries ("sentries at chokepoints" in the design doc).
  - It can verify that the two exfil routes do not share a chokepoint.
  - It can check that the objective's region has more than one gate, so infiltration is not a single-door puzzle.
  - The algorithm is simple flood fills on a grid and deterministic. Reimplement it; don't copy AGPL code.
- **Brogue retry budgets** [Shipped]: a direct precedent for "budgets are iterations, never time". Nested failsafes (machine, then sub-machine) with full rollback on abort match Sightline's plain-data state well.
- **Unexplored cycles** [Shipped]: a region-level graph of insertion points, perches, camp gates and exfil, built from cycles, guarantees at least two routes by construction. Nested cycles give the approach choices.
- **Ghost Recon authoring-time tools** [Shipped]: only conceptually relevant. Their terrain is intentional, not random. Sightline must instead get that intent from runtime rules (Section 7).
- **Invisible, Inc.** [Shipped]: a cautionary data point. Procedural stealth levels felt unfair until difficulty tuning and player tools for manipulating guards caught up. That supports Sightline's strict validation, plus readable guards (Lab A's 80% prediction test).

### Gaps
- **Invisible, Inc. internals:** How it assembles rooms and prefabs, places guards and cameras, and rejects bad levels was not found. The GDC 2015 talk's content is behind the Vault, and no Klei technical post surfaced.
- **XCOM 2:** Parcel-matching rules, what "PCP" stands for, and whether Firaxis validated pathing or cover were not found. The Hess talk's content was not accessible.
- **Not researched (search budget exhausted):** State of Decay; RimWorld's faction-base generator (BaseGen and its symbol resolvers); Ghost Recon Breakpoint; Metal Gear Solid V's outpost design; Far Cry outpost-specific design talks; and Heat Signature, The Swindle, Sir, You Are Being Hunted, Payday 2, Hitman's Freelancer mode and Shadows of Doubt, all of which would be relevant.
- **Release years:** Most shipped titles' release years are not stated in the sources read, so years are given only where a source supplied one.
- **Far Cry 2 talk:** A search summary mentioned a GDC 2009 talk by Jonathan Morin on Far Cry 2's level-design structure ("player expression"). I did not retrieve its page, so it is unverified.

## 2. Proven generation methods: modules, grammars, WFC, constraint solvers, and generate-and-test with repair

### Takeaway
The literature divides generators into two kinds:
- constructive generators, which make one pass and must guarantee correctness while they build;
- generate-and-test (search-based) generators, which make several attempts and keep only content that passes.

For "necessary" content such as a mission camp, broken output is unacceptable. Shipped games mostly use constructive module assembly plus a test-and-retry loop.

Constraint methods do exist and can express universally quantified rules like "no single shortcut solution":
- WFC (greedy, non-backtracking, can hit contradictions);
- answer set programming (ASP);
- SAT- and MILP-based Sturgeon;
- MILP repair.

Their run times are machine-dependent, and research uses time-outs, so in Sightline they belong offline or under explicit iteration limits.

### Cited Findings
- **[Research, 2011] Search-based PCG taxonomy** — [Togelius, Yannakakis, Stanley, Browne, SBPCG taxonomy](http://julian.togelius.com/Togelius2011Searchbased.pdf)
  - A constructive algorithm generates content once and must ensure correctness by using only operations that never produce broken content. A generate-and-test algorithm makes several attempts and keeps those that pass.
  - Evaluation functions are direct (features mapped to fitness), simulation-based (an agent plays the content) or interactive.
  - "Necessary" content, which players must traverse, must always be correct. Optional content may fail.
- **[Research, 2016] The PCG textbook** (Shaker, Togelius, Nelson, Springer 2016) has freely downloadable chapters, including: search-based methods (ch. 2), constructive dungeon methods (ch. 3), grammars and L-systems for levels (ch. 5, with Dormans), ASP for mazes and levels (ch. 8, Nelson and Smith), and evaluating content generators (ch. 12) — [pcgbook.com](http://pcgbook.com/)
- **[Research, 2014] Grammar-based guard behaviour.** Xu, Tremblay and Verbrugge use a rewrite grammar that splits a patrol route into movement and scanning segments: stop and rotate 90°, 180° or 360°, or zig-zag. They place it in the tradition of grammar-based PCG, which includes Dormans's mission and space grammars (2010) — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
- **[Research and shipped; 2016–2021] WaveFunctionCollapse:**
  - **Origin:** Maxim Gumin's MIT-licensed reference implementation (2016) generates bitmaps and tilemaps from one example — [repo](https://github.com/mxgmn/WaveFunctionCollapse); MIT license verified from the repository's LICENSE file.
  - **Contradictions:** When a cell has no remaining options, the algorithm cannot continue and produces no output. The README says this is rare in practice and that the code does not use Merrell's model-modification fix — [repo](https://github.com/mxgmn/WaveFunctionCollapse)
  - **As constraint solving:** Karth and Smith (FDG 2017) analyse WFC as constraint solving: a greedy, non-backtracking search, re-expressed in ASP as a surrogate. A journal version appeared in IEEE Transactions on Games in 2021 — [eScholarship](https://escholarship.org/uc/item/1f29235t); [IEEE ToG](https://ieeexplore.ieee.org/document/9421370/) *(medium confidence: from search summary and abstract)*
  - **Related open-source code:**
    - [DeBroglie](https://github.com/BorisTheBrave/DeBroglie): C#, MIT, adds non-local constraints;
    - [MarkovJunior](https://github.com/mxgmn/MarkovJunior): MIT, a probabilistic pattern-matching language with constraint propagation.
- **[Research, 2013] ASP with universal quantification over play** — [Smith, Butler, Popović, Quantifying over Play, FDG 2013](https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf)
  - Smith, Butler and Popović frame generating a puzzle that is solvable but admits no undesirable ("shortcut") solution as a search problem at the NP^NP complexity level.
  - They solve it with disjunctive answer set programming for Refraction 2.
  - They argue that a pipeline where one tool proposes puzzles and another filters out shortcuts is wasteful, because the generator never learns from its mistakes.
  - The clingo ASP grounder and solver is MIT-licensed — [potassco/clingo](https://github.com/potassco/clingo)
- **[Research, 2022–2025] Sturgeon (Seth Cooper):**
  - **Sturgeon (AIIDE 2022, vol. 18, pp. 26–36):** a mid-level API for constraints over Boolean variables, running on various low-level solvers. It enforces local tile patterns learned from examples plus designer constraints, including reachability — [Bazzaz & Cooper 2025, citing it](https://arxiv.org/html/2504.05334v1); [AIIDE page](https://ojs.aaai.org/index.php/AIIDE/article/view/21944)
  - **Sturgeon-MKIII (FDG 2023):** generates a level and an example playthrough in one constraint problem, using tile rewrite rules — [PCG workshop archive](https://www.pcgworkshop.com/archive/cooper2023sturgeon.pdf)
  - **Sturgeon-MKIV (AIIDE 2024):** extends this to graph levels with graph label rewrite rules — [AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/view/31862)
  - *(medium confidence on MKIII/MKIV details: from search summaries)*
  - **Constrained expressive range (Bazzaz & Cooper 2025):**
    - It walks a generator's expressive range systematically instead of sampling at random.
    - It uses a 15-minute time-out per attempt and 12 hours per template.
    - Failed attempts go to a blocklist.
    - [arXiv 2504.05334](https://arxiv.org/html/2504.05334v1)
- **[Research, 2020] Generate-then-repair with MILP** — [Zhang, Fontaine, Hoover, Togelius, Dilkina, Nikolaidis, AIIDE 2020](https://arxiv.org/pdf/2010.06627)
  - A GAN trained on human levels proposes candidates. A mixed-integer linear program then makes the minimum number of edits needed to satisfy playability constraints, with the edit cost computed as a minimum-cost network flow.
  - Tested on a GVGAI Zelda clone, it produced diverse playable levels that kept the human levels' spatial relationships.
  - The code is named `milp_constrained_gan`, linked from [ar5iv](https://ar5iv.labs.arxiv.org/html/2010.06627). Its license was not checked.
- **[Research, 2020] Procedural content generation via reinforcement learning (PCGRL):** an MIT-licensed Gym environment — [amidos2006/gym-pcgrl](https://github.com/amidos2006/gym-pcgrl)
- **[Shipped] Module assembly with retry:**
  - XCOM 2's plots and parcels, Spelunky's templates, Dead Cells' tiles fitted to a graph, Diablo's set pieces and minisets, and Brogue's blueprints (Section 1).
  - Brogue aborts a whole machine after 10 failed sub-machine attempts and restores the map from a backup — [Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c)

### Inferences
Fit notes, one per technique:
- **Constructive module assembly with a guaranteed skeleton** [Shipped]: the best fit for the camp layout.
  - It is fast, deterministic and plain-data.
  - It keeps "necessary content" correct by construction, which the 90-of-100 first-try target needs.
- **Generate-and-test with targeted repair** [Shipped]: the right outer loop. Each repair attempt gets its own labelled fork, so attempt *k* of seed S is reproducible and adding a repair rule doesn't shift other draws (Rule 3).
- **Grammars** [Research, shipped in Unexplored]:
  - Good for two things: patrol behaviour (stop, scan and walk segments as a pure function of time) and mission or approach graphs (Unexplored-style cycles).
  - Rewrite grammars are deterministic given a seeded rule choice.
- **WFC** [Shipped]: medium fit for local texture: cover clusters, junk piles, fence segments and prop patches inside a parcel.
  - It is poor for global rules (three approaches, two exfil routes, perch dominance), which are non-local.
  - Contradictions need a bounded restart counter.
  - Use an integer "fewest remaining options" heuristic, or `dlog`, instead of `Math.log` entropy, to satisfy Rule 2.
- **ASP / SAT / MILP (clingo, Sturgeon, MILP repair)** [Research]: the most expressive, but a poor fit for runtime generation in the browser.
  - Solver search order and run time depend on the solver build and its options.
  - Research uses wall-clock time-outs, which violate Rule 18.
  - Use them offline: to check that modules and archetype rules can be satisfied at all, or to find adversarial seeds for test fixtures.
- **"Quantifying over play"** [Research]: conceptually exactly Sightline's "no single perch wins" rule: for every perch, no dominant plan. Because Sightline's perch candidates are a finite list, the universal quantifier can be checked exhaustively in plain TypeScript; no ASP needed.
- **MILP minimal-edit repair** [Research]: the right idea for repair. Make the smallest edit that restores validity: move one sentry, shift a patrol phase, add one cover cluster. Implement it as a bounded greedy local search over a small list of edit operators, not as a MILP.
- **PCGRL** [Research]: poor fit. Neural-network inference uses floating-point maths that can differ between browsers, against Rule 2. It also adds opacity where "every system ships explainable" (Rule 8).

### Gaps
- No published comparison of these methods for outdoor military compounds was found.
- No browser or WebAssembly build of an ASP or SAT solver was checked for determinism.
- The license of the MILP repair code was not checked, and no Sturgeon repository was found (`crowdgames/sturgeon` returned 404).

## 3. Stealth level analysis research: McGill (2012–2016) and later work (2017–2026)

### Takeaway
McGill's line of work (Tremblay, Torres, Rikovitch, Xu, Borodovski, Verbrugge) established the standard method:
- treat the stealth level as 2D space extruded over time;
- remove guard fields of view at each time step;
- search for undetected paths with RRT in (x, y, t).

It uses the RRT success ratio as a difficulty proxy and a simple occlusion-aware path-distance-to-enemies metric as a risk measure. That metric matched human judgement best in a 27-person study.

Later work turned to guard behaviour:
- dynamic patrols that track how long areas have gone unchecked (a "staleness" metric);
- searching with environment skeletons;
- potential fields;
- user studies.

There are only a few level-generation papers: Bonnot et al. 2024 and a 2024 Charles University thesis. No released analysis tool or code was found for any of them.

### Cited Findings
- **[Research, about 2012] RRT for level analysis:** "RRT-based game level analysis, visualization, and visual refinement", a precursor that used RRT to analyse and visualize where players can reach in a level — [SciSpace record](https://scispace.com/papers/rrt-based-game-level-analysis-visualization-and-visual-rmqairo0k2) *(lower confidence: the aggregator page surfaced by search was not opened. My attribution to Bauer and Popović at AIIDE 2012 is from memory and unverified.)*
- **[Research, 2013] The stealth exploration tool:** Tremblay, Torres, Rikovitch and Verbrugge, "An Exploration Tool for Predicting Stealthy Behaviour", at the 2013 AIIDE workshop on AI in the game design process.
  - It is a Unity3D tool that searches stealth paths with RRT.
  - The publications page gives no download or code link — [Tremblay publications](https://www.cs.mcgill.ca/~jtremb59/Publications.html)
  - A Game Developer column described it as visualizing the paths and problems players may meet in a level — [Saturday Paper: Metal Gear Science](https://www.gamedeveloper.com/design/the-saturday-paper-metal-gear-science) *(lower confidence: via search summary)*
- **[Research, 2014] Measuring risk in stealth games** (Tremblay, Torres, Verbrugge, FDG 2014) — [PDF](https://www.sable.mcgill.ca/~clump/papers/tremblay-14-measuring.pdf)
  - **Search space:** The level is discretized. Free space is the walkable area minus obstacles and the guards' fields of view at each time step, with guards moving deterministically.
  - **Three risk metrics:**
    - **Dist:** occlusion-aware distance to each enemy, computed with A* through free space at every time step;
    - **LOS:** weighted by the angle between the enemy's view direction and the player, and by distance;
    - **NM** (near misses): checks whether the last *n* and next *m* path positions, at a fixed time step, are exposed.
  - **Human study:** 27 participants compared pairs of paths across 15 levels, with a 75% consensus threshold. 10 levels reached consensus; LOS and NM each agreed with the humans on 7.
  - **Result:** Dist correlated best with human judgement of risk.
  - **Application:** the metrics were applied to a level from Metal Gear Solid.
- **[Research, 2014] Adding combat** (Tremblay, Torres, Verbrugge, CIG 2014) — [PDF](https://www.sable.mcgill.ca/~clump/papers/tremblay-14-algorithmic.pdf)
  - It adds combat to the space-time search: health values and fixed attack values, with combat resolved by a damage-per-second rule, because optimally solving even simple discretized-time combat is exponential or PSPACE-hard.
  - It uses an RRT variant that inserts combat-start and in-combat nodes.
  - For many paths at once it draws heat maps: all paths are flattened in time and cells shaded by path density.
- **[Research, 2014] Guard and camera placement** (Xu, Tremblay, Verbrugge, AIIDE 2014) — [PDF](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf); [AAAI](https://ojs.aaai.org/index.php/AIIDE/article/view/12711)
  - **Evaluation:**
    - A Monte-Carlo loop builds an arbitrary arrangement of guards and cameras, then checks it with RRT search in space-time.
    - The RRT success ratio is the difficulty proxy. They prefer RRT to A* precisely because its randomness approximates varied human play.
    - Path-distance (Dist) is the risk metric.
  - **Experiment:** For each guard count, 20 RRT searches on each of 30 random guard-path assignments.
  - **Findings:**
    - More guards raise coverage and lower success, as expected, but RRT still found solutions easily with 8 guards.
    - The slope of the distance metric was the better difficulty signal.
    - Densely applying the behaviour grammar barely changed RRT success: whether a solution exists depends mainly on the coverage that guard count and paths produce.
    - Generated guard behaviours were not statistically distinguishable from designer-made ones.
  - **Predecessor:** the PCG 2014 workshop paper used space decomposition for cameras and straight-line patrols — [Xu et al., PCG 2014](https://www.cs.mcgill.ca/~jtremb59/Papers/pcg2014_paper_04.pdf)
  - **Thesis:** Qihan Xu's 2015 McGill master's thesis is "Procedural Guard Placement and Behaviour Generation" — [McGill eScholarship (probable record)](https://escholarship.mcgill.ca/downloads/wd376059q) *(lower confidence: title and year via search summary; record not opened)*
- **[Research, 2014] Other McGill work:**
  - "I Can Jump!" (Tremblay, Borodovski, Verbrugge, EXAG 2014) compares A*, MCTS and RRT for simulating platformer players.
  - A 2014 Ubisoft Montreal tech talk by Tremblay covers stealth pathfinding and path analysis (slides and video).
  - [Tremblay publications](https://www.cs.mcgill.ca/~jtremb59/Publications.html)
- **[Research, 2015] Clustering player paths** (Campbell, Tremblay, Verbrugge, FDG 2015): clusters player traces to analyse a level's design — [Tremblay publications](https://www.cs.mcgill.ca/~jtremb59/Publications.html)
- **[Research, 2015] Speeding up the tool:** Na, Jeong and Jeong (Journal of Korea Game Society) found the McGill tool too slow for real-time design iteration. They replaced parts of its collision checking and RRT search — [KoreaScience](https://koreascience.kr/article/JAKO201526650060971.pdf) *(lower confidence: via search summary)*
- **[Research, 2016] Distractions** — [Borodovski & Verbrugge, Analyzing Stealth Games with Distractions](https://www.sable.mcgill.ca/~clump/papers/borodovski-16-analyzing.pdf)
  - Earlier stealth analysis relied on static, precomputed guard motion. This work adds distractions that change guard paths in response to player actions.
  - RRT nodes carry (x, y, t) plus the time each distraction fired.
  - To speed things up, the search first enumerates purely geometric simple paths, takes their midpoints, and runs a two-stage RRT through each midpoint.
  - Implemented in Unity3D, it solved distraction puzzles from real games and harder multi-distraction designs.
- **[Research, 2020–2025] Dynamic guard behaviour (Al Enezi and Verbrugge, then Xu and Verbrugge):**
  - **Dynamic guard patrol (AIIDE 2020):** builds patrol routes at runtime on a grid or on a visibility-based mesh, VisMesh, which was faster with fewer motion artefacts. Its "staleness" metric grows with the time since a region was last visited — [AAAI](https://ojs.aaai.org/index.php/AIIDE/article/view/7425); [Xu & Verbrugge 2025 background](https://arxiv.org/html/2508.18527v1) *(medium confidence: abstract via search summary)*
  - **Follow-ups:** a 2021 skeleton-based multi-agent search for a hidden player; a 2023 AIIDE user study in which players could tell dynamic patrol behaviours apart by difficulty and enjoyment ([DOI](https://doi.org/10.1609/aiide.v19i1.27513)); and a 2023 study on behaviours and dialogue — [Xu & Verbrugge 2025](https://arxiv.org/html/2508.18527v1)
  - **Thesis (2024):** Al Enezi's McGill dissertation "Dynamic behaviors for stealth game characters" covers patrol and search on grids, straight-skeleton roadmaps and convex decompositions — [eScholarship McGill](https://escholarship.mcgill.ca/downloads/v692tc945) *(via search summary)*
  - **Composite potential fields (AIIDE 2025):** "Generic Guard AI in Stealth Game with Composite Potential Fields" combines three decaying maps: information from the last sighting, confidence from recent coverage, and static connectivity.
    - It is evaluated on five levels with two player policies against random-walk, finite-state, staleness and cheating baselines.
    - Metrics: capture rate, capture time, captures in a fixed time, coverage rate, mean guard-to-player distance, time to first detection and backtrack count.
    - No code link is given.
    - [arXiv 2508.18527](https://arxiv.org/html/2508.18527v1); [AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/view/36819)
  - **Other recent work it cites:** an occupancy-map lineage (Isla 2006; Isla's 2013 game Third Eye Crime), deep RL for coordinated ambushes (Chia 2022), and a 2021 thesis on stealth NPC personalities — [arXiv 2508.18527](https://arxiv.org/html/2508.18527v1)
- **[Research, 2024] Level-generation papers:**
  - **Bonnot et al., IEEE GEM 2024:** "Enhancing Stealth Gameplay Through Procedural Generation" generates maps, places guards, sets patrol paths and evaluates level difficulty. It notes that very little scientific work addresses this area — [IEEE Xplore](https://ieeexplore.ieee.org/document/10585400/) *(lower confidence: abstract via search summary; full text not read)*
  - **Filip Sedlák, Charles University master's thesis (defended June 2024):** "Procedural generation of levels for a realtime stealth game" builds a cyclic level generator for a small 3D stealth game with lock-and-key structure, and claims complexity comparable to modern stealth games. A 75.67 MB attachment ZIP exists; its contents were not checked — [CUNI repository](https://dspace.cuni.cz/handle/20.500.11956/190711)
- **[Research, date unknown] Takedowns and body hiding:** a McGill thesis titled "Solving the take down and body hiding problems" exists. I could not open its details — [link](https://escholarship.mcgill.ca/downloads/9c67ws147)

### Inferences
Fit notes, one per technique:
- **Space-time extrusion of guard fields of view** [Research]: a direct fit, because Sightline's routines are pure functions of time.
  - Sample the routine cycle at a fixed `dt`, rasterize each guard's honest-view perception onto the 0.5 m camp grid, and the stealth problem becomes a static 3D (x, y, t) occupancy volume.
  - It is deterministic and plain-data.
- **RRT in (x, y, t)** [Research]: deterministic if driven by a labelled RNG fork with a fixed node budget.
  - But it is incomplete and gives different answers per fork. Good for estimating how many varied human-like solutions exist (success ratio over N forks).
  - Poor as the pass/fail validator. Use an exact interval search for that (SIPP, Section 5).
- **Dist risk metric** [Research]: worth adopting as the "exposure" cost of an infiltration path: occlusion-aware path-distance to each guard over time, not just binary seen or unseen. It is the only stealth risk metric validated against humans.
- **Distraction-aware search (Borodovski)** [Research]:
  - The model for systems and sabotage approaches: sabotage is a state change (lights off, radio down) that changes later fields of view.
  - Run the search with a small set of "action fired at time t" branches.
  - It keeps the analysis bounded and deterministic.
- **Heat maps flattened over time (Tremblay CIG 2014)** [Research]: ready-made debug overlays for the seed explorer (Rule 8): solution-path density, and the coverage heatmap's twin.
- **Path clustering (Campbell et al. 2015)** [Research]: a mechanism for the exit test. Cluster each camp's best bot plans and count distinct families before asking the reviewer.
- **Dynamic patrol and search (Al Enezi; Xu and Verbrugge)** [Research]:
  - More relevant to Lab E (the camp brain: escalation and searching) than to routine generation.
  - Their metrics (coverage rate, time to first detection) are useful for bot-based validation of search behaviour.

### Gaps
- No released source code or tool was found for the McGill stealth tool, Xu's placement system, Borodovski's distraction solver, Bonnot et al. or the 2025 potential-field work.
- No 2026 stealth-analysis or stealth-generation paper surfaced before the search budget ran out.
- No paper found applies these methods to large outdoor or long-range (sniper) settings. All the McGill test levels are small floor plans.

## 4. Guard placement, patrol routes, timing windows and mutual-visibility clustering

### Takeaway
Static observers are placed with art-gallery methods: triangulation and 3-colouring (Fisk), or set cover over candidate points, deliberately weakened to leave gaps. There is also a grid formulation that guarantees every cell is seen at least once every *t* seconds.

Patrol routes come from a free-space skeleton, a reduced medial axis close to a straight skeleton, with a grammar that inserts stops and scans. Patrolling theory supplies the timing language:
- **idleness:** the time since a cell or node was last visited;
- the **worst idleness** over all nodes is the longest window;
- a single patroller's best cyclic route is a TSP tour.

Security-game work (ARMOR at LAX) treats the attacker as someone who observes the patrol schedule and responds to it, which is exactly how a recon player behaves.

I found no published method for clustering guards by mutual visibility over time. Sightline's "sightline graph" appears novel and has to be designed (see Inferences).

### Cited Findings
- **[Research, 2014] Camera placement by weakened art-gallery solutions** — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
  - **Fisk's construction (1978):** at most ⌊n/3⌋ cameras cover a simple polygon of *n* vertices. Triangulate it, 3-colour the vertices, and put cameras on one colour.
  - **Holes:** obstacles are handled by cutting thin channels that join each obstacle to the outer boundary, turning holes into boundary.
  - **Weakening:** they then limit each camera's coverage and reduce the camera count, to leave incomplete coverage and so a potentially solvable level.
- **[Research, 2006] Periodic coverage on a grid** (Erdem and Sclaroff, cited by Xu et al.): cameras placed so every cell is observed with a period shorter than *t*, reduced to set cover and solved with integer programming — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
- **[Research, 2014] Patrol routes from a skeleton plus a grammar** — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
  - The roadmap is a reduced, straightened medial skeleton (Blum 1967), built by flooding outward from obstacles and inward from the boundary. Edges form where wavefronts meet, then a smoothing pass removes discretization zig-zags.
  - The result is close to a simplified straight skeleton, minus edges that run to polygon corners.
  - Guards get routes along the roadmap, then the grammar breaks movement into stop, turn and scan segments.
- **[Research, 2002] Patrol idleness** — [Machado, Ramalho, Zucker, Drogoul, MABS 2002](https://dblp1.uni-trier.de/rec/conf/mabs/MachadoRZD02.html)
  - Idleness is the time since a node was last visited; the worst idleness is the largest value over all nodes and the whole run.
  - Multi-agent patrolling is evaluated on graphs by these measures.
- **[Research, 2004] Optimal patrol strategies** — [Chevaleyre, Theoretical Analysis of the Multi-agent Patrolling Problem (IAT 2004)](https://www.cs.utexas.edu/~pstone/Courses/393Rfall18/readings/Chevaleyre.pdf)
  - With one patroller, the best cyclic strategy is the shortest closed walk covering all nodes, a TSP problem.
  - For several agents, cyclic strategies on a shared cycle are near-optimal, with an O(n³) approximation.
  - They suit graphs without long edges. Partition strategies, one region per agent, are the alternative.
  - In experiments the cyclic strategy did best, and above about 15 agents all strategies were equivalent.
- **[Shipped/deployed, 2007–] Stackelberg security games — ARMOR at LAX**
  - ARMOR randomizes checkpoints and canine patrols at Los Angeles International Airport, in use since August 2007.
  - It models the problem as a Bayesian Stackelberg game: the attacker observes the defender's mixed strategy and best-responds. The DOBSS solver computes the defender's strategy.
  - A mixed-initiative interface lets staff override the schedule.
  - [USC CREATE](https://create.usc.edu/?p=3493); [Pita et al. / AI Magazine 2009](https://ojs.aaai.org/index.php/aimagazine/article/view/2173); [Jain et al., Interfaces 2010](https://www.dii.uchile.cl/~fordon/docs/interfaces2010-published.pdf) *(medium confidence: abstracts via search summary)*
- **[Research, 2020] Staleness-driven dynamic patrols:** areas are visited according to how long since they were last seen — [AAAI](https://ojs.aaai.org/index.php/AIIDE/article/view/7425); [arXiv 2508.18527](https://arxiv.org/html/2508.18527v1)
- **[Shipped] Brogue's gate sites** are chokepoints that each cut off a known number of cells. They are a cheap way to locate natural sentry posts and the regions they control — [Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c)
- **[Shipped, 2001 article] Precomputed waypoint visibility** — [van der Sterren, Terrain Reasoning for 3D Action Games](https://www.gamedeveloper.com/programming/terrain-reasoning-for-3d-action-games)
  - Line of sight and line of fire between waypoints are precomputed into flat lists, because each waypoint sees only a small subset of the others.
  - Each waypoint has a "focus": how its visibility relations cluster in one direction.
  - This is the basis for scoring tactical spots. It is also the closest published precedent for a who-sees-whom graph.

### Inferences
Fit notes, one per technique:
- **Weakened art-gallery placement (Xu)** [Research]: medium fit. The camp is a mostly open yard with buildings as holes.
  - Better: greedy set cover over candidate sentry points (gates, tower tops, chokepoints from Brogue-style analysis) on the 0.5 m grid, stopped early at a coverage target below 100% to leave the windows.
  - It is deterministic with index-ordered tie-breaks.
- **Periodic coverage within time *t* (Erdem and Sclaroff)** [Research]: the exact formal shape of Sightline's timing windows.
  - For each cell, find the longest unobserved interval over the routine cycle. Validation requires some cells on each approach to have windows at least as long as the time needed to cross them.
  - Integer programming is overkill; compute it by sweeping time.
- **Skeleton roadmap + behaviour grammar (Xu)** [Research]: high fit for patrol routes.
  - Compute the free-space skeleton of the camp's 0.5 m walkable grid, which gives natural-looking corridors between buildings.
  - Choose closed loops on it, then insert scan, stop and smoke-break segments by grammar.
  - The route stays a pure function of time (Rule 3 of the routine model).
- **Idleness / worst idleness (Machado; Chevaleyre)** [Research]: high fit as the coverage-heatmap metric.
  - Per cell, store the fraction of the cycle observed, the worst idleness (longest window), and the window start phases.
  - This makes "routes open and close windows" measurable.
- **TSP-style cyclic patrols vs. partitioned patrols (Chevaleyre)** [Research]:
  - The perimeter patrol is a single cycle around the fence line.
  - Interior patrols are partitioned per zone, which keeps the clusters independent and readable.
- **Stackelberg view (ARMOR)** [Deployed]: conceptual fit only. Sightline deliberately does not randomize routines, because recon has to pay off. The Stackelberg attacker's best response is the formal definition of the best plan, which the validator's bots should compute.
- **Staleness-driven patrols** [Research]: Lab E (search after a disturbance), not routine generation.
- **The sightline graph** (no prior art found; proposed design):
  - **Witness edges:** For each routine-cycle sample *t*, compute a directed edge A→B when guard A, alive, would perceive B's body at B's position, using Lab A's honest-view model and treating a falling body or a shot impact on B as the stimulus.
  - **Edge data:** Store per edge the fraction of the cycle it exists, and the list of intervals when it is absent, the windows: SIPP-style interval sets.
  - **Clusters:** strongly connected components of the union graph. Thresholded by duty fraction, they give the design doc's shapes:
    - in-degree 0 is an isolated sentry;
    - a 2-cycle is a mutual pair;
    - a component of three or more covering the objective is the hard core.
  - **Solvable cluster:** a cluster is solvable if a bounded depth-first search finds a kill order and times t₁ ≤ t₂ ≤ … such that each kill is witnessed only by guards killed within the reaction window, or the cluster is split by a sabotage or distraction action that removes edges for an interval (Borodovski-style action branches).
  - **Cost:** clusters hold at most 16 guards and are small in practice, so this search is cheap and deterministic.
- **Precomputed visibility lists (van der Sterren)** [Shipped]: store the guard-to-guard and guard-to-cell visibility as sparse lists keyed by sample index. This keeps the analysis output plain data for the seed explorer.

### Gaps
- No paper or shipped game was found that clusters guards by mutual visibility, or that checks "witnessed takedown" solvability over time. This is the main novel piece Lab D must design and test.
- Watchman-route theory (shortest patrol that sees everything) and art-gallery variants with limited-range, limited-angle guards were not fetched beyond Xu et al.'s citations.
- How much better the patrolling theory's TSP-optimal cycles are than skeleton loops for Sightline-sized camps is unknown.

## 5. Automated analysis techniques: time-varying visibility, coverage heatmaps, vantage-point scoring, space-time stealth paths

### Takeaway
The building blocks are mature and deterministic:
- **Terrain visibility:** GIS viewshed algorithms. Radial sweep runs in O(n log n), against O(n^1.5) for the naive method.
- **Vantage-point (sniper spot) scoring:** precomputed visibility tables plus directional features.
- **Lowest-exposure paths through known moving observers:** Safe Interval Path Planning (SIPP). It keeps A*'s optimality and completeness while collapsing time into a few safe intervals per cell, a better validator than RRT.
- **Isovist and visibility-graph analysis tools** exist as GPL desktop software, so they must be reimplemented, not embedded.

### Cited Findings
- **[Research, 2011; deployed in robotics] SIPP** — Phillips and Likhachev, ICRA 2011 — [CMU RI](https://www.ri.cmu.edu/publications/sipp-safe-interval-path-planning-for-dynamic-environments)
  - Each configuration's safe time steps are grouped into a few contiguous safe intervals, and A* searches (configuration, interval) pairs.
  - This keeps the optimality and completeness of planning with time as a dimension, but runs much faster: tested with up to 200 dynamic obstacles and on a PR2 robot.
  - It assumes the obstacles' trajectories are known.
  - An anytime variant followed at IROS 2012 — [CMU RI](https://www.ri.cmu.edu/publications/anytime-safe-interval-path-planning-for-dynamic-environments) *(medium confidence: abstracts via search summary)*
- **[Research, 2004/2013] RRT in space-time:** RRT for planning with time (Morgan and Branicky 2004) underlies the McGill stealth tool. A path is a solution if it keeps advancing in time and avoids every field of view at every instant — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
- **[Tool/OSS, GPL] Viewsheds with GRASS GIS `r.viewshed`** — [r.viewshed manual](https://grass.osgeo.org/grass84/manuals/r.viewshed.html) *(medium confidence: manual details via search summary)*; GRASS's COPYING file is GPL — [OSGeo/grass](https://github.com/OSGeo/grass)
  - It implements Haverkort, Toma and Zhuang's algorithm (ALENEX 2007; ACM JEA 2009).
  - A sweep line runs in O(n log n), against O(n^1.5) for the standard method, on an *n*-cell raster.
  - Heights are bilinearly interpolated, so the terrain is a smooth surface. Two points see each other if the line between them clears it.
  - Options include observer and target height offsets (older default observer 1.75 m) and a refraction coefficient (newer versions).
- **[Tool/OSS, GPLv3] depthmapX:** spatial-network and visibility-graph software in the space-syntax tradition, licensed GPLv3 per its README — [SpaceGroupUCL/depthmapX](https://github.com/SpaceGroupUCL/depthmapX)
- **[Shipped-era practice, 2001] Sniper-spot scoring** — [van der Sterren 2001](https://www.gamedeveloper.com/programming/terrain-reasoning-for-3d-action-games)
  - **Score:** a spot's score in a direction combines its static properties with directional properties of the waypoints it overlooks, weighted by focus. The properties: it overlooks many distant locations; it is hard to reach from the places it overlooks; threats there can find cover.
  - **Tuning:** scores are then adjusted with gameplay feedback (time spent sniping, damage dealt and taken) and traffic data.
  - **Ambush spots:** hidden from most directions, overlooking nearby traffic that moves across or away from the attacker.
  - **Numbers:**
    - about 480 waypoints in the example;
    - a full N×N table reaches megabytes near N = 1,000;
    - preprocessing takes tens of seconds;
    - queries look 1–3 seconds ahead.
- **[Research, 2014] Path-density heat maps:** all solution paths flattened over time and shaded by density — [Tremblay et al., CIG 2014](https://www.sable.mcgill.ca/~clump/papers/tremblay-14-algorithmic.pdf)
- **[Research, 2014] Risk along a path:** occlusion-aware distance to enemies (Dist) was the risk metric that matched human judgement best — [Tremblay et al., FDG 2014](https://www.sable.mcgill.ca/~clump/papers/tremblay-14-measuring.pdf)
- **[Shipped] Topological analysis:** loops, chokepoints and cut-off areas (gate sites) — [Brogue Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c)

### Inferences
Fit notes, one per technique, plus a proposed pipeline:
- **SIPP** [Research]: the best fit for lowest-exposure infiltration paths and for the "infiltration approach exists" rule.
  - Sightline's guard trajectories are known exactly, as pure functions of time.
  - On the 0.5 m camp grid, compute each cell's safe intervals within the routine cycle, then run A* over (cell, interval) with a deterministic tie-break (f, then g, then cell index).
  - It is exact, bounded by the node count, and plain-data.
  - To get exposure-weighted rather than binary paths, add a Dist-style cost or allow short exposed intervals that stay below detection thresholds, with Lab A supplying how fast suspicion builds.
- **RRT** [Research]: keep it only for estimating solution variety (Section 6), never as the validator.
- **Radial-sweep viewshed (Haverkort et al.)** [Research/OSS]: high fit for perch analysis on the 2.5 m terrain grid.
  - Scale: 1 km² is 400 × 400 = 160,000 cells; 1.5 km² is about 240,000.
  - Build the viewshed over a surface model that includes module heights (towers, roofs, walls) rasterized into the camp. Then a guard's visibility from a perch at time *t* is a lookup of the guard's cell and height in that perch's viewshed.
  - This turns a perch × guard × time matrix into cheap lookups, not ray casts.
  - GRASS is GPL: reimplement from the paper.
- **Sniper-spot scoring (van der Sterren)** [Shipped-era]: features for perch scores:
  - guard-seconds visible;
  - objective and target visibility;
  - the perch's own exposure to marksmen and towers (reverse viewshed);
  - approach and egress cover;
  - focus.

  The "no single perch wins" rule then caps each perch's guard-coverage fraction (about 60%) and target-visible fraction (about 25%) over the cycle.
- **Coverage heatmaps** (proposed): per 0.5 m cell, store the fraction of the cycle observed, the worst idleness (longest window) and the phase of that window. Render them as the debug overlay; the same data feeds SIPP.
- **Brogue topology** [Shipped]: run it on the camp's walkable grid to:
  - mark sentry posts;
  - verify that two exfil routes share no chokepoint;
  - verify that the target's escape route passes a chokepoint covered by a perch or a sabotage point (the interceptable-escape rule).
- **Cost warning** (estimate, not measured): rasterizing every guard's cone at every sample costs samples × guards × cells per cone.
  - At 0.5 s sampling of a 5-minute cycle (600 samples), 16 guards and cones of tens of thousands of cells, that is about 10⁸ cell visits.
  - It must be budgeted: coarser sampling outside the hard core, a 1 m analysis grid, or evaluation only at candidate cells. Fold it into the 90-of-100 timing budget as an iteration count.

### Gaps
- I did not verify a JavaScript or TypeScript implementation of a sweep viewshed or of SIPP. Both look small enough to write in-house.
- No source quantifies how perch-scoring features predict human sniping choices. Van der Sterren tunes with gameplay data, not a validated model.
- Killzone's precomputed line-of-fire data (Guerrilla, 2005) was not retrieved (its URL returned 404).

## 6. Validation, repair, difficulty targeting and diversity of best solutions

### Takeaway
Validation practice spans:
- cheap direct checks (thresholds, reachability, chokepoints);
- simulation with bots (RRT success ratio, restricted agents);
- exhaustive, universally quantified checks that forbid shortcut solutions.

Repair is either retry-and-rollback with fixed budgets (Brogue, Diablo), or minimal-edit repair (MILP). For the claim that each camp has a different best plan, the tools are:
- expressive-range plots of generator metrics across seeds;
- quality-diversity archives;
- clustering of solution paths;
- "restricted play", which measures how much a game depends on one strategy by playing agents limited to it against standard agents.

### Cited Findings
- **[Research, 2014] Difficulty via search success:** the RRT success ratio as a feasibility and difficulty proxy, with path distance as perceived risk. Tested with 20 searches × 30 guard-path assignments per guard count — [Xu et al., AIIDE 2014](https://www.sable.mcgill.ca/~clump/papers/xu-14-generative.pdf)
- **[Research, 2012] Restricted play** — [Jaffe et al., AIIDE 2012](https://cdn.aaai.org/ojs/12513/12513-52-16035-1-2-20201228.pdf); [AAAI page](https://ojs.aaai.org/index.php/AIIDE/article/view/12513)
  - Balance is measured by the win rates of agents restricted to particular behaviours against standard agents.
  - Example: a player who never plays green cards is measured, and green is judged too weak.
  - Unpredictability is measured with players limited to low-entropy strategies.
  - Their tool computed such measures for an educational card game.
- **[Research, 2013] Forbidding unintended solutions:** generate puzzles that are solvable and admit no undesirable solution, with the "no shortcut" condition quantified over the entire space of play — [Smith, Butler, Popović, FDG 2013](https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf)
- **[Research, 2010] Expressive range** (Smith and Whitehead, PCG workshop 2010): plot generated artifacts on two quantifiable metrics to see a generator's range. Bazzaz and Cooper (2025) used density and difficulty as the axes, and walked the range with a constraint generator — [Bazzaz & Cooper 2025](https://arxiv.org/html/2504.05334v1)
- **[Research, 2019–2021] Quality diversity:** cited lines include Gravina et al., "Procedural Content Generation through Quality Diversity" (IEEE CoG 2019); Alvarez et al., interactive constrained MAP-Elites (IEEE ToG); and Sarkar and Cooper, quality diversity in a VAE latent space (FDG 2021) — [Bazzaz & Cooper 2025 references](https://arxiv.org/html/2504.05334v1)
- **[Research, 2015] Path clustering for distinct strategies** — [Campbell, Tremblay, Verbrugge, FDG 2015](https://www.cs.mcgill.ca/~jtremb59/Publications.html)
- **[Research, 2020] Minimal-edit repair:** fix candidates by the fewest edits that make the level playable — [Zhang et al., AIIDE 2020](https://arxiv.org/pdf/2010.06627)
- **[Research, 2010] Multiobjective search over StarCraft maps** — [Togelius et al., Multiobjective Exploration of the StarCraft Map Space, CIG 2010](http://julian.togelius.com/Togelius2010Multiobjective.pdf)
  - **Objectives:**
    - base space: the fraction of the 5×5 cells around a base reachable within 5 steps;
    - base distance;
    - resource safety;
    - choke points: the average narrowest gap along shortest paths between bases.
  - **Method:** SMS-EMOA with penalty-based constraints.
  - **Result:** Pareto fronts serve as design-support tools.
  - **Lesson:** some objectives are trivially optimized, or barely conflict with others, and so work better as constraints.
- **[Shipped] Retry-and-rollback budgets:**
  - Brogue: 10, 10, 50 and 1000 attempts, with restore from backup on abort — [Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c)
  - Diablo: restart when walkable-area minimums or reachability fail — [Boris the Brave 2019](https://www.boristhebrave.com/2019/07/14/dungeon-generation-in-diablo-1/)
  - Dead Cells: retry rooms until they fit — [Bénard 2017](https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/)
- **[Shipped] Difficulty budgets:**
  - RimWorld's raid points, with the adaptation factor responding to recent losses — [RimWorld Wiki](https://rimworldwiki.com/wiki/Raid_points)
  - Dead Cells' monsters per combat tile, with per-type costs — [Bénard 2017](https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/)
- **[Research, 2025] Counterexample to Sightline's budget rule:** constraint-based expressive-range work budgets by wall-clock time (15 minutes per attempt, 12 hours per template), so its results depend on the machine — [Bazzaz & Cooper 2025](https://arxiv.org/html/2504.05334v1)

### Inferences
Fit notes and a proposed validator:
- **Restricted play** [Research]: high fit for "three or more viable approaches" and "no single perch wins".
  - Run deterministic planner-bots restricted to one approach each: long range only, infiltration only, systems only. Each must succeed for the camp to pass.
  - Measure the dominance of the overall best plan as its margin over the best plan under each restriction. That directly supports the reviewer finding a clearly different best plan.
- **Quantified "no shortcut" checks** [Research]: implement "no single perch wins" as an exhaustive loop over the finite perch candidates:
  - each perch's guard-coverage fraction stays at or below about 0.6;
  - its target-visible fraction stays at or below about 0.25.

  A failing perch triggers a targeted repair: add an occluder (tarp, vehicle, wall module) on its sightline, or shift a patrol's phase. The check is then re-run, within an iteration cap.
- **Expressive range across seeds** [Research]: the seed explorer should plot 100 seeds on a few axes:
  - cluster count against hard-core size;
  - best-perch dominance against infiltration exposure;
  - approach margin.

  This catches sameness that per-seed checks can't see. The design doc lists "camps feel samey" as a risk.
- **Path and plan clustering** [Research]: for the 10-camp review, cluster the best bot plans by a signature (approach type, perch region, entry gate, kill order, sabotage target). Show the reviewer one representative per family. This makes "clearly different" checkable before a human looks.
- **Minimal-edit repair** [Research]: repair operators in fixed order, each with an iteration cap and its own labelled RNG fork:
  - move a sentry along its post's arc;
  - shift a patrol's phase;
  - swap a parcel module;
  - add or remove a cover cluster;
  - re-time a light circuit.

  If the cap is exhausted, reject the seed, so pass and repair counts stay well defined for the 90-of-100 test.
- **Multiobjective fronts (Togelius 2010)** [Research]: use them offline to tune the generator's tuning numbers, not per seed. Keep validation rules as hard constraints, not fitness terms, as that paper's lesson suggests.
- **Threat budgets** [Shipped]: staffing difficulty as points spent under the 16-guard cap. Cluster count and size, the design doc's main difficulty knob, are the targets checked after staffing.

### Gaps
- No stealth-specific difficulty model validated at scale was found. Tremblay's human study had 27 participants; Bonnot et al.'s difficulty evaluation was not read.
- No published "diversity of best solutions across generated levels" metric for stealth games was found. Campbell et al.'s path clustering is the nearest.
- Smith and Whitehead (2010) was cited through a later paper's references; the original was not opened.

## 7. Terrain shaping that guarantees vantage points and diverse approaches

### Takeaway
The available evidence on terrain shaping is thin:
- Shipped open worlds made terrain intentional with authoring-time tools: Ghost Recon Wildlands' World Machine and Houdini.
- Research has searched terrain or maps against fitness functions for chokepoints, base distance and path properties, as in the StarCraft maps work.
- No source found guarantees ridgelines or perches at given ranges.

The practical route is constructive: place the features the design needs first (ridges 150–500 m out, approach corridors, cliffs), then noise and erosion around them. Verify with viewsheds and topology analysis.

### Cited Findings
- **[Shipped, 2017] Ghost Recon Wildlands:** terrain base heightmaps came from World Machine (noise plus erosion) on an 80-machine farm. Rivers, roads and settlements were added with Houdini tools, with the stated intent that every landform has a purpose — [80.lv, April 2017](https://80.lv/articles/procedural-technology-in-ghost-recon-wildlands/)
- **[Research, 2010] Search with path-based terrain objectives:** map search with fitness terms for choke points (narrowest gap along shortest paths), base distance and resource safety. Some terms were trivially satisfiable, for example a small gap in a barrier — [Togelius et al., CIG 2010](http://julian.togelius.com/Togelius2010Multiobjective.pdf)
- **[Research, 2016] Textbook coverage:** fractals, noise and agents for landscapes — [PCG book ch. 4](http://pcgbook.com/)
- **[Shipped] Chokepoint and loop detection on a grid:** a reusable check that approaches are actually distinct, meaning they don't share a chokepoint — [Brogue Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c)
- **[Research/OSS] Viewshed computation** to verify vantage points after shaping — [r.viewshed manual](https://grass.osgeo.org/grass84/manuals/r.viewshed.html)

### Inferences
Fit notes:
- **Feature-first terrain** (inference from Wildlands' intent and Spelunky's path-first method):
  - In the site frame, place two or three ridge spines on chosen bearings at 150–500 m from the camp centre.
  - Add one or two defiles or creek beds as infiltration corridors, and an exfil valley.
  - Then blend noise and erosion around them, with a cap on how far a guaranteed feature may be eroded.
  - Afterwards, verify perches with a viewshed and approaches with chokepoint analysis. It is deterministic with forked streams per feature (Rule 3).
- **Fitness search over terrain (Togelius 2010)** [Research]: too slow per seed. Use it offline to tune the biome-rule parameters.
- **Distinct approaches as non-shared chokepoints (Brogue)** [Shipped]: a concrete definition for "diverse approaches": the long-range, infiltration and exfil corridors must not pass through the same choke cell on the 2.5 m grid.

### Gaps
- No primary source on generating terrain that guarantees vantage points or perches at a given range was found.
- Research on constrained terrain from feature primitives (graphics literature) and on FPS map balancing with bots (Cardamone, Lanzi, Loiacono and others) was not reached before the search budget ran out.

## 8. Seed and determinism practice

### Takeaway
Two practices recur:
- **Splittable or counter-based random generators:** fork streams by key or label (JAX's split; Squirrel Eiserloh's noise-based RNG), so results don't depend on call order and one feature's draws can't shift another's.
- **Fixed attempt counts instead of time-outs:** Brogue's failsafes, and Unexplored's fixed number of dungeons per run.

The SBPCG taxonomy frames deterministic, seed-driven generation as a design choice. Research generators that use wall-clock time-outs (Sturgeon expressive range) are not reproducible across machines.

### Cited Findings
- **[Tool/OSS; design note] JAX's PRNG** — [JAX PRNG design (JEP 263)](https://docs.jax.dev/en/latest/jep/263-prng.html)
  - **Rejected alternative:** a global stateful RNG, because reproducibility would then depend on the order in which independent calls run.
  - **Chosen design:** explicit keys with split, which forks one state into two independent streams so subroutines can't disturb their caller's stream.
  - **Generator:** a counter-based hash (Threefry, Salmon et al.): a key plus a counter, hashed. It cites the splittable-PRNG literature (doi 10.1145/2503778.2503784, Claessen and Pałka).
  - (The JAX project's license was not re-checked here.)
- **[Talk, GDC 2017] Noise-based RNG** — "Math for Game Programmers: Noise-Based RNG" (Squirrel Eiserloh, SMU Guildhall) argues for noise or hash functions in place of stateful RNGs. Claimed benefits: unordered access, better reseeding, record and playback, tolerance of network loss, lock-free parallelism — [GDC Vault](https://www.gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise)
- **[Research, 2011] Determinism as a design choice:** the SBPCG taxonomy separates stochastic from deterministic generation, and treats the random seed as one end of a parameter-vector continuum ("degrees of control") — [Togelius et al. 2011](http://julian.togelius.com/Togelius2011Searchbased.pdf)
- **[Shipped] Iteration budgets in a seeded generator:** Brogue's nested failsafe counters (10, 10, 50, 1000) and rollback — [Architect.c](https://raw.githubusercontent.com/tmewett/BrogueCE/master/src/brogue/Architect.c). Unexplored must generate 20 complete dungeons per run — [Game Developer 2021](https://gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-)
- **[Research] Time budgets as a counterexample:** Sturgeon expressive-range runs used a 15-minute time-out per attempt and 12 hours per template — [Bazzaz & Cooper 2025](https://arxiv.org/html/2504.05334v1)
- **[OSS] WFC can fail:** a contradiction ends a run with no output, so seeded use needs a bounded restart policy — [mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)

### Inferences
Fit notes:
- **Label-forked streams (JAX-style split)** [OSS practice]: Sightline's existing `rng.fork('label')` is the same pattern. Extend it to the analysis and repair layer:
  - `fork('repair/<rule>/<attempt>')`;
  - `fork('patrol/<guardId>')`;
  - `fork('perch-candidates')`.

  Adding a validation rule then never changes the camps of seeds that already pass.
- **Positional hashing (noise-based RNG)** [Talk]: use a hash of (seed, label, cell x, cell y) for dressing and cover jitter. Local edits by repair then don't reshuffle the whole camp, which keeps repairs minimal and makes golden fingerprints stable.
- **Fixed iteration caps at every level (Brogue)** [Shipped]: per-node module fitting, per-rule repair, per-seed total, and SIPP node expansions. Record the counts in the validation report, so the seed explorer can show how close each seed came to its budget.
- **No solver time-outs (Bazzaz & Cooper counterexample)** [Research]: any solver-backed step must stop on a decision or conflict count, never on time, or run offline only.
- **Deterministic tie-breaking** (general inference): A* and SIPP open lists, set cover and clustering must break ties by stable ids. Iteration order of maps and sets must be by sorted keys, so the analysis outputs (heatmaps, graphs, perch scores) hash identically in Node, Chrome, Firefox and WebKit.

### Gaps
- Not verified here (fetches blocked or not attempted):
  - Dwarf Fortress's world-generation rejection mechanics and limits (the wiki returned HTTP 429);
  - Slay the Spire's per-subsystem RNG streams;
  - Minecraft or Brogue seed-stability practice across versions;
  - Factorio's determinism notes.
- No source compared hash-based and stream-based RNGs for generator stability under content changes.
