# What makes generated worlds distinct and worth playing across seeds, and how to measure it

Research notes for Sightline, Nov 8, 2026. Written to extend `docs/research/labs.md` (Lab C, Lab D) and `docs/research/notes/labs/` (procgen, movement, ballistics, sniping balance). Sources those pages already use are not repeated unless something new came out of them.

**Confidence marks**

- **[A]** I opened the primary source (paper full text, developer post, source code), and it says this.
- **[B]** I opened a secondary source (press, practitioner blog, encyclopedia, translation) or only a primary source's abstract.
- **[C]** Search-result snippet only, or a forum or fan source. Lowest confidence.
- **[Inf]** My own inference or arithmetic. No source says it.
- **[Repo]** Read from this repository.

Everything is paraphrased. Search budget: all 30 used (28 calls, two of which the tool split in two). Hosts that refused the fetch are listed in section 7; I did not work around them.

---

## 0. The argument in one page

Sightline's sameness is structural, not cosmetic. The generator promises two perches that each hold the target in view for 10 s a cycle and see half the guards (`gen.…longRangePerches: 2`, `targetSeconds: 10`, `src/config/tuning.ts`), always in a flattened pad near the centre, with two or three ridges 240–420 m out and 30–58 m above it (`gen.landform`) **[Repo]**. So every seed offers the same winning move and only rearranges where it happens. The literature says the same thing from three directions:

- A generator gets more variety by encoding more knowledge, not by widening its random inputs (Rabii & Cook).
- A level differs from another only if it's solved differently (Beukman: two mazes with the same solution are the same level, whatever the tiles say).
- A count of distinct strategies means little when most are variants of one (Balduzzi: redundant copies split their weight and change nothing).

Sightline already shows the third problem: on the held-out series `lab-d-exit`, 32 distinct bot signatures over 100 camps looks diverse, while the best plan was long range in 63 camps and infiltration in 37, never systems (`docs/decisions.md`, Lab D; `docs/lab-opportunities.md`) **[Repo]**.

**A decision this touches.** The owner answered on Nov 8 that the ridge shot should be contested through how a camp fights, rather than through the generator (`docs/phase-1-plan.md`, D's open questions), and `docs/camp-engine.md` has an open call (#10) on keeping the target out of the open by preparedness. Ideas 1 and 2 below are generator-side, so they reopen that answer and it's his to make. They're offered because the world pillar asks for something the camp's reactions can't give: seeds that differ before a shot is fired.

**Ranked ideas** (detail in the sections below; evidence strength in brackets):

| # | Idea | Evidence |
| --- | --- | --- |
| 1 | Generate from a decisive problem; drop the universal ridge-shot guarantee | Weak for the method; strong that it's the cause |
| 2 | Vary where a camp sits against the ground (hilltop, bowl, river bend, saddle, forest) | Weak to moderate |
| 3 | Score diversity on the plan-versus-camp payoff table (Nash support, effective diversity) | Strong method, other domains |
| 4 | Shape dead ground: ridge cross-sections, military crest, spurs and draws | Moderate |
| 5 | Give perches an access problem | One small user study |
| 6 | Make height cost time: a Tobler-shaped slope law plus effort | Strong for humans, untested in games |
| 7 | One material table: cover versus concealment, penetration, grazing ricochets | Moderate numbers, older sources |
| 8 | Check sameness with people and pictures (triplets, embeddings, name-the-crux) | Weak for 3D |
| 9 | Map the space offline with MAP-Elites and regret-tilted sampling | Moderate, costly |

---

## 1. Measuring variety

### 1.1 Expressive range and what came after

- Smith & Whitehead's original method has four steps: pick global metrics that are emergent from the generator's point of view, generate a large sample, plot 2D histograms that show peaks and holes, then compare histograms as parameters change. Their two axes were linearity and leniency, and leniency's weights were admittedly intuitive. It exposed a bias toward linear levels. **[A]** [Smith & Whitehead 2010](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf) (The existing notes cited this second-hand.)
- There's no principled way to pick the two axes, which is what "The Right Variety" tackles. It ranks every pair of candidate metrics on three scores: fitness independence (average playability across a 20×20 grid over the plot), mutual correlation (1 − |Spearman ρ| within the pair), and alternative metric correlation (how well the pair stands in for the other metrics). Pilot: 18 metrics, 153 pairs, 9,015 Mario levels. **[A]** [Withington & Tokarchuk, FDG 2023](https://ar5iv.labs.arxiv.org/html/2304.02366)
  - A pair that ranks first on one score can rank last on another: EmptySpaceCount–MaxJumpAirTime is first on mutual correlation (0.997) and 153rd on fitness independence. **[A]** same
  - 15 of the top 20 pairs joined a structural metric with one extracted from an agent. The authors call that a single data point. **[A]** same
  - The paper gives no thresholds, and Spearman only catches monotonic redundancy. **[A]** same
- Dimensionality reduction as an alternative to choosing axes gave results the authors call promising but inconsistent: MCA reached ρ ≈ 0.765 against Mario empty space, but Boxoban stayed under 0.05, and the method missed similar structures placed in different parts of a level. **[A]** [Withington & Tokarchuk 2022](https://ar5iv.labs.arxiv.org/html/2205.15133)
- State of practice, from 86 systems out of 137 screened works: direct calculation from the representation is the commonest evaluation (37 uses), human play 27, fitness functions 33, validated questionnaires only 8, comparison with prior systems only 11. The authors ask for more benchmarks, especially for 3D. **[A]** [Withington, Cook & Tokarchuk, FDG 2024](https://ar5iv.labs.arxiv.org/html/2404.18657)
- A 2025 survey sorts measures into objective (single-indicator comparison or non-comparison, and multi-indicator such as expressive range and quality diversity) and subjective ones. It concludes no single metric covers diversity, recommends edit distance or dynamic time warping for play traces, and KL, JS or Jaccard for how elements are distributed. I read only the first half. **[A, partial]** [Li et al., "Measuring Diversity of Game Scenarios"](https://arxiv.org/html/2404.15192v3)

### 1.2 Diversity of how a level is solved

- Beukman, James and Cleghorn compare levels by the solutions a planner finds: A\* solves each level, the actions become a string, and two levels are compared by normalised Levenshtein distance. The measure tracks average position distance (Pearson r > 0.7). **[A]** [Beukman et al. 2022](https://ar5iv.labs.arxiv.org/html/2201.10334)
  - On mazes with identical solution paths and random unreachable tiles, compression distance called most pairs diverse and A\* diversity called them all identical. **[A]** same
  - Compression distance shifted with how levels were written down, and its mean rose with level size. A\* diversity changed much less with size. **[A]** same
  - Only two tile domains; no check against people. **[A]** same
- Persona-based search: three A\* personas (runner, killer, collector) each evaluated generated Mario segments, and the levels favoured the persona that evaluated them. On one set the collector triggered 23.17 events against 14.33 and 16.2 for the others. The authors say people still need to confirm it. **[A]** [Zhang, Bai & Liu 2022](https://ar5iv.labs.arxiv.org/html/2207.02100)
- I found no paper that clusters agent plans as the diversity signal for generated levels. Beukman's pairwise distance is the nearest. **[C]** (search came up empty) Campbell, Tremblay & Verbrugge's path clustering (already in the Lab D notes) remains the closest for stealth.

### 1.3 Does a measure match what people see?

- The strongest human-grounded study: 456 participants judged triplets of levels from two games (Candy Crush Saga, Legend of Zelda), each shown as screenshots and as abstract patterns, 11,400 judgements per condition. **[A]** [Berns et al., CHI 2024](https://arxiv.org/html/2402.18728v1)
  - The image-embedding models DreamSim, then CLIP, came closest to people. Tile frequencies came third; Hamming distance was close to it on Zelda. Tile patterns got worse as patterns grew. Symmetry was worst, often with low or negative agreement. **[A]** same
  - Focus groups named shape, symmetry and pattern, colour, level difficulty and theme as what they went by. **[A]** same
  - Caveats: 2D tile games and visual judgements only, people agreed with each other only modestly, CLIP was used to choose the stimuli, and DreamSim needs a GPU. **[A]** same

### 1.4 What players perceive as samey

- Compton's oatmeal point, as reported from her talk: a million mathematically unique objects are worth less than a smaller set players can actually tell apart, and a useful test is whether anyone would write fan fiction about the generated thing. **[B]** [Game Developer on Compton's GDC talk](https://gamedeveloper.com/design/practical-procedural-generation-for-everyone-) (Her original essay refused the fetch.)
- Short's answer to it: generated detail that's only decorative gets ignored once players see it's connected to nothing. Ideally different outputs open different actions or strategies. **[A]** [Emily Short 2016](https://emshort.blog/2016/09/21/bowls-of-oatmeal-and-text-generation/)
- Rabii and Cook formalise why: for a well-behaved generator, the complexity of its most complex output is bounded by the generator's code length plus the log of its possibility space. Recombination grows the space cheaply and adds no design knowledge, which tends to produce noisy, alike output. **[A]** [Rabii & Cook, FDG 2023](https://ar5iv.labs.arxiv.org/html/2305.02131)
- Even a successful generator gets the complaint: Deep Rock Galactic players report that one mission type in one biome lays out essentially the same every time. **[C]** [Steam thread](https://steamcommunity.com/app/548430/discussions/1/4420805388059862347)

### 1.5 Descriptors for terrain specifically

- **Geomorphons** classify each cell from zenith and nadir line-of-sight angles in eight directions: 498 unique patterns, reduced to ten forms (flat, peak, ridge, shoulder, spur, slope, hollow, footslope, valley, pit). Search radius sets the scale, skip radius ignores small bumps, a flatness threshold defines flat. Because it works from lines of sight, one method detects landforms at different sizes. **[A, manual; paper not opened]** [GRASS r.geomorphon](https://grass.osgeo.org/grass-stable/manuals/r.geomorphon.html), citing Jasiewicz & Stepinski 2013.
- **Orometry** describes relief through the prominence and isolation of peaks and the saddles and ridges joining them. Argudo et al. show that a sparse metric on peaks and saddles distinguishes mountain ranges, and they synthesise terrain from it; a perceptual study rated the result more plausible than existing methods. **[B, abstract]** [Argudo et al., SIGGRAPH Asia 2019](https://pubs.cs.uct.ac.za/id/eprint/1342/)
- **Isovists** applied to game terrain: Pech et al. measured 16 attributes (3D isovists of 1024 rays plus graph centralities) on 70 labelled areas from existing game levels, in five classes taken from Hullett: hidden area, open area, vantage point, choke point, stronghold. **[A]** [Pech et al. 2016](https://www.pcgworkshop.com/archive/pech2016identifying.pdf)
  - Most informative: area size (1.144), degree centrality (0.918), isovist sphericality (0.750), then eigenvector centrality and isovist dispersion (both 0.692). **[A]** same
  - Accuracy in 10-fold cross-validation was 82.9–85.7% across three classifiers. Open areas and strongholds confuse with each other. **[A]** same
  - 70 samples is small, and no held-out games were tested. **[A]** same
- The group later built measures for vantage points, strongholds, chokepoints and hidden areas into an evolutionary terrain generator, with two new ways to compute 3D isovist volume. **[B, abstract]** [Pech, Lam & Masek, IEEE Access 2020](https://ro.ecu.edu.au/ecuworkspost2013/9356) ([DOI](https://doi.org/10.1109/ACCESS.2020.3041276); the full text refused the fetch.)
- Isovists work from the player's perspective in Minecraft's block worlds too. **[C]** [Hervé & Salge 2022](https://arxiv.org/pdf/2204.03752v1.pdf)
- Prospect-refuge theory has no agreed measure, which is why researchers try isovists for it **[C]** ([Dawes & Ostwald](https://nova.newcastle.edu.au/vital/access/%20/manager/Repository/uon:15486)). The Level Design Book argues it fits games poorly, since safety in a game comes from encounters and state rather than architecture, and suggests the plainer terms sightline, vista, enclosure and cover. **[A]** [Level Design Book](https://book.leveldesignbook.com/process/blockout/massing/prospect-refuge)

### 1.6 What this means for Sightline **[Inf]**

Proposed measures, in the order I'd build them:

1. **Plan-family entropy and share.** Over a series of seeds, H = −Σ p log₂ p of the best-plan family. The plan's own bar is no family above 50% (`docs/phase-1-plan.md`). Suggested: at least four families and H ≥ 1.5 bits.
2. **Nash support and effective diversity** on the plan-by-camp table (section 3.2).
3. **Plan edit distance.** Normalised edit distance between plan signature strings, which is graded where "same signature" is binary.
4. **Expressive range with chosen axes.** Fifteen or so candidates: dead-ground share, perch count, best perch's target seconds, geomorphon entropy, isovist dispersion in the yard, skyline roughness, non-shared chokes, cluster count, hard-core size, dominance, regret. Rank pairs with Withington's three scores, and expect the winner to pair a structural axis with an agent-derived one.
5. **Geomorphon histograms.** Ten-class histograms over the play area, compared by Jensen-Shannon divergence, flagging seed pairs that sit close together. On a 2.5 m grid that's about 262,000 cells; a 5 m grid is plenty for a tool.
6. **Skyline signature.** The horizon-angle profile around the camp and from each perch, compared by circular correlation: cheap, deterministic, and it's what a player actually sees. No source tests this for games.

A layout-only measure would rate the reviewers' ten camps as different even though 29 of the 30 plans written for them were the same kind, which is the trap Beukman's maze example shows.

### 1.7 Gaps

- No perceptual study of 3D or outdoor levels was found.
- No published study ties any metric to players calling a game repetitive.

---

## 2. Terrain and site as tactical space

### 2.1 Military terrain analysis

- OAKOC's five factors are observation and fields of fire, avenues of approach, key terrain, obstacles, and cover and concealment. The premise is that terrain directly shapes objectives, movement, weapon effectiveness and protection. **[B, vendor guide]** [Exelis/NV5 terrain analysis guide](https://www.nv5geospatialsoftware.com/portals/0/pdfs/OAKOC_Terrain_Analysis.pdf)
- That guide treats viewshed analysis as the way to get observation, fields of fire and cover and concealment from elevation data. **[B]** same
- Key terrain is defined by the mission: a hilltop is key only if it matters to the operation. **[B]** [T.REX Arms on METT-TC](https://www.trex-arms.com/2023/08/What-is-METT-TC-Part-4-Terrain-and-Weather/) (practitioner blog; the ATP 2-01.3 copy I tried was empty.)
- Obstacles are what funnels, canalises, delays or disrupts movement. Analysis focuses on those along the avenues. **[B]** same
- Cover stops fire and concealment only hides. Both must be assessed for each side. **[B]** same
- A line-of-sight analysis finds dead space, ground that gives defilade from direct fire. **[B]** same
- A military crest lies just below the topographic crest, where a unit can observe and fire down the slope to its base without being silhouetted against the sky. **[B]** [Wikipedia, citing FM 101-5-1](https://en.wikipedia.org/wiki/Military_crest)
- Slope shape decides what the top can see. From the top of a convex slope you can't observe most of the slope or the foot of it, and an attacker on it has much more cover. From the top of a concave slope you can see the whole slope, and an attacker on it has none. **[C]** [Army-derived Seabee text](https://engineeringtraining.tpub.com/14234/Figure-5-10-Convex-Slope-134.html) (the page wouldn't load; snippet only.)
- A real case of a site defined by its ground: COP Keating sat low in a bowl with enemy-accessible high ground on every side, relying on a nearby observation post for overwatch. In the 2009 attack, fighters hit it from the surrounding heights and attacked the OP at the same time, reducing its mortar support. **[B]** [Long War Journal on the Army report](https://longwarjournal.org/archives/2010/02/army_releases_report_on_combat.php)

### 2.2 How shipped games author it

- **Breath of the Wild.** Triangular landforms give a choice between over and around, and block the view so the player wonders what's behind them. Three scales do different jobs: the largest are landmarks, medium ones obstruct the view, and the smallest set the pace of play. Rectangles hide completely where triangles reveal gradually. Structures of graded visibility pull players different ways ("gravity"). Player-route heat maps spread out more evenly after the layout was changed; no numbers are given. An early plan of spreading towers and events evenly felt linear to players. **[B, translation of the CEDEC 2017 talk]** [Matt Walker's translation, reformatted](https://gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399)
- **Hunt: Showdown compounds.** Crytek's 2021 reworks are the most specific shipped account I found. **[A]** [Crytek, Update 1.7 compound changes](https://huntshowdown.com/news/stillwater-and-lawson-details-of-the-compound-changes-coming-with-up)
  - Where attackers hesitated at a perimeter, it lengthened an entrance and added cover on the approach. Inside, it broke up long sightlines and added entrances to the boss room to allow flanking.
  - A strong roof position needed entering the compound to reach, so it added ladders.
  - A compound that sits high and feels intimidating got a watchtower nearby so attackers can scout before committing.
  - A forest was reshaped to be less corridor-like.
  - Water is an obstacle, not a gameplay space, and should be designed as one.
  - Some sites were rebalanced because they favoured one side.
- Hunt's design director says bullet drop freed the team to build longer sightlines, because it gives snipers a new problem. **[B]** [Shacknews interview, 1896](https://shacknews.com/article/141007/hunt-showdown-1896-mammons-gulch-dev-interview)
- Crytek reportedly thinned Mammon's Gulch's forests to open sightlines for scoped rifles. **[C]** [PC Gamer](https://pcgamer.com/games/this-is-the-most-polished-map-we-ve-ever-shipped-hunt-showdown-1896-director-goes-deep-on-hunt-s-first-new-map-in-3-years) (snippet)
- **Far Cry 5.** Tools generate biomes, textures, freshwater networks and cliffs from the terrain: water follows the mountains and erodes the land, forests grow denser on shaded north faces, grass reflects soil humidity. The team still fine-tuned small locations for tight gameplay. Nothing I could open discusses sightlines or cover. **[A]** [PlayStation Blog](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/), **[B]** [80.lv](https://80.lv/articles/houdini-procedural-world-generation-of-far-cry-5/)
- **Arma 3.** Altis is over 290 km², with more than 1.7 million hand-placed objects and 16 million sculpted vertices by a team of five, starting from real height data and imagery, about 2.5 years. **[A]** [Bohemia, Report In](https://arma3.com/news/report-in-martin-pezlar-environment) A designer described the map as compartmentalised, with a named person responsible for each part, and spoke of natural fortresses and being flanked in the open. **[C]** [PC Gamer](https://www.pcgamer.com/arma-3-interview-arma-3-alpha/3/) (snippet; the page came back truncated.)
- **Deep Rock Galactic.** A seed drives over 100 hand-made room templates (119 in the post's later count), each with internal randomisers, strung together by tunnels; about 150,000 new cave systems a day. Mission type changes assembly (some missions merge rooms into one cavern), and ten biomes change surface noise, debris, fog, light, enemies, hazards and sometimes cave shape. Designers playtest rooms with each class. **[B, official post on a mirror]** [Below Decks: Cave Generation](https://devtrackers.gg/deep-rock-galactic/p/8cd5ca9c-below-decks-at-ghost-ship-cave-generation-in-deep-rock-galactic)
- **Escape from Tarkov.** I found no developer account of map design. **[C]** (search came up empty)

### 2.3 Patterns with player data

Hullett's dissertation is the only study I found that measures how such a pattern changes play. It catalogues FPS patterns (sniper location, gallery, choke point, arena, stronghold), then tests instances in custom Half-Life 2 levels with 39 participants playing five levels each, after a 10-person pilot. **[A]** [Hullett, UCSC 2012](https://escholarship.org/uc/item/1m25b5j5)

- A sniper location's designer-controlled properties: height, usable area, cover, area covered, and how accessible it is from the area overlooked. **[A]** same
- No sniper location increased pace, even the two designed to. Hullett concludes the slowing effect holds strongly even when designers try to subvert it. **[A]** same
- Reduced challenge was also consistent. Low height and access are the properties that complicate it. Tension results were unclear. **[A]** same
- The design pattern says that a perch not isolated from the level makes the player defend the access point, raising tension. That's the pattern's description, not a measurement. **[A]** same
- Caveats, the author's own: small sample of experienced students, one genre. **[A]** same
- The appendix extends patterns to open-world missions such as chase and evade, with an elimination turning into a chase if the target runs. **[A]** same

### 2.4 Terrain generators with gameplay in them

- Pech et al. (section 1.5) are the closest: evolve modifications to a terrain to produce elements such as a hidden area. **[C]** [Pech et al. 2016, EvoApplications](https://ro.ecu.edu.au/ecuworkspost2013/1848)
- Stream-power terrain: uplift painted by hand plus fluvial erosion gives a stream graph, which becomes a heightfield with dendritic rivers, watersheds and ridges. **[C]** [Cordonnier et al. 2016](https://diglib.eg.org/handle/10.1111/cgf12820) A 2024 follow-up claims fast analytical solutions. **[C]** [Tzathas et al. 2024](https://diglib.eg.org/handle/10.1111/cgf15033)
- Argudo's peak-and-saddle graph (section 1.5) derives a consistent river network and shapes valley slopes around it. **[B]**

These two lines would give the spurs and draws Sightline's ridges lack, but they target mountain ranges, not a 1.3 km valley. **[Inf]** The feature-primitive line (Génevaux and others) didn't surface. It remains unread, as the Lab D notes also say.

### 2.5 FPS map search (a gap the Lab D notes named)

- Cardamone et al. evolved FPS maps using average fighting time as fitness. **[C]** [via survey](https://arxiv.org/pdf/2311.04710), [Springer](https://rd.springer.com/chapter/10.1007/978-3-642-20525-5_7)
- Lanzi et al. evolved Cube 2 maps for balance between particular skills and strategies, scored from bot matches. **[C]** same survey
- Karavolos et al. replace simulation with a learned surrogate that predicts match duration and winner from a top-down map and class parameters. **[C]** [Karavolos et al. 2018](https://www.antoniosliapis.com/papers/using_a_surrogate_model_of_gameplay_for_automated_level_design.pdf)
- The newest: MAP-Elites with sliding boundaries over 46 topological and 23 emergent features. **[A]** [de Donato, Lanzi & Loiacono, May 2026](https://arxiv.org/html/2605.30570)
  - Archive of 10 bins per feature; 20 starting maps, 400 iterations, 10 new maps per iteration; fitness is the entropy of the kill distribution over five bot matches. That's about 4,020 maps and 20,100 matches per run (computed).
  - Pairing a gameplay feature with a layout feature (pace against average eccentricity) gave more varied maps than two layout features. **[A]** same
  - Comparisons are qualitative: heat maps and curves, no numeric tables in the text. **[A]** same

### 2.6 What this means for Sightline **[Inf]**

- **Today's ridges are one species.** `cliffs: 0.9` makes the camp faces cliffs broken by a gully or two (`gen.landform`) **[Repo]**. A cliff has little or no military crest, so a perch tends to sit at the edge. Perception has a ×1.5 skyline factor, but perch selection doesn't weigh it (a grep of `perches.ts` finds no skyline term), so the choice between the best view and the silhouette barely exists. Cliffs also tend to isolate perches, which in Hullett's terms is the player-advantage, no-access sniper location that lowers pace and challenge. Both are my reading of the tuning, not measurements: worth checking on a real series.
- **Ridge cross-section is an unused control.** A family of front-slope profiles: concave (the perch sees everything and an approach has no cover), convex (the perch can't see the near ground, so there's dead ground up to its foot), and benched or stepped (a walkable military crest below the skyline, with a choice between the view and the silhouette). Add spurs and draws running toward the camp, so the approach along a spur's flank differs from its line.
- **Three scales, from BotW.** A landmark visible from everywhere; medium occluders (spurs, knolls) that hide and reveal; small features that set the pace of a crawl (folds, rock bands, stream banks).
- **Measures.**
  - Dead-ground share: the share of approach cells 150–500 m out that no perch or guard post sees at crouched eye height.
  - Reveal rate along approach paths.
  - Route count: Pareto-optimal paths on time versus exposure with different chokepoints (the SIPP search in Lab D can produce these).
  - Area-type census: Pech's measures per cell, giving a vantage / hidden / choke / open / stronghold mix per seed.

---

## 3. Layouts that resist a dominant plan

### 3.1 Why the ridge shot dominates **[Repo]**

- Validation requires two perches that each see half the guards and hold the target at least 10 s a cycle (`gen.validation.longRangePerches`, `targetSeconds`). No perch may see the target for more than 25% of the cycle (`maxTarget`).
- The design doc asks every camp to offer each approach, and the reviewers' plans followed that promise: 29 of 30 shoot the target from a ridge while he's unwatched on his walk (`docs/decisions.md`).
- With the camp answering, one timed shot still takes the target in 28 of 30 (`docs/phase-1-plan.md`).
- The owner answered on Nov 8 to contest it through how a camp fights rather than through the generator (`docs/phase-1-plan.md`). Open call #10 in `docs/camp-engine.md` recommends keeping the target out of the open by preparedness level. Sections 3.3 and 3.5 are generator-side and would reopen the first; they extend the second by making it depend on the seed rather than only on preparedness.

### 3.2 Telling how many plans matter

- **Nash averaging.** Treat agents-versus-tasks or agents-versus-agents as a zero-sum meta-game, and take the maximum-entropy equilibrium. Agents with weight form the core. It's invariant to redundancy: cloning an agent splits its weight among the copies and changes no one's score, where a uniform average would be distorted. In a purely cyclic game no agent is better than another; in a purely transitive game the weight falls on the top. The result only reflects the agents and tasks supplied. **[A]** [Balduzzi et al. 2018](https://ar5iv.labs.arxiv.org/html/1806.02643)
- **Effective diversity.** Compute the Nash p of the population's antisymmetric payoff matrix A, then d = pᵀ · max(A, 0) · p. It's positive in rock-paper-scissors. It's zero when one agent beats all the others, because the equilibrium concentrates on it. **[A]** [Balduzzi et al. 2019](https://ar5iv.labs.arxiv.org/html/1901.08106)
- **Restricted play** (Jaffe, already in the Lab D notes) asks how far a game leans on one strategy. These two add how many strategies are unexploitable, and they aren't fooled by variants. **[Inf]**

**In Sightline [Inf]:** rows are plans from the ladder, columns are camps (or doctrines on one camp), entries are outcome scores. Then:

- A family with no Nash weight is dead weight. A camp with no weight adds nothing.
- Ten ridge-shot variants count as one, which is what "36 distinct signatures" misses.
- Two levels of report: per series (which families are core) and per camp across doctrines (is there more than one answer).
- It's a small linear program on an offline tool, solved with a fixed iteration count (rule 18).

### 3.3 Regret and persona search

- PAIRED rewards an adversary for the gap between an antagonist's and a protagonist's returns. An unsolvable level pays nothing because both score the same, so the adversary's best output is the easiest level the protagonist fails and the antagonist solves. It beat minimax and domain randomisation on navigation transfer (labyrinth 40% solved against 10% and 0%; maze 18% against 0% and 0%). **[A]** [Dennis et al. 2020](https://ar5iv.labs.arxiv.org/html/2012.02096)
- Tilting search toward a persona works in Mario (section 1.2). **[A]**
- **In Sightline [Inf]:** regret(seed) = score of the best plan overall minus score of the best ridge-shot plan. A seed with high regret is solvable but not by the habit. This doesn't need learning: it's a filter on the deterministic plans already computed, used offline to tune the generator's parameters or to fix a seed sampler with an iteration budget.

### 3.4 Keeping structure while varying it

- **Modules times modifiers.** Deep Rock's room templates × randomisers × biomes × mission-driven assembly (section 2.2). **[B]**
- **The site reads the ground.** GDMC scores generated settlements on four axes of 0–10 by human judges on unseen maps: adaptability (fits the terrain, differs between maps), functionality, evocative narrative, aesthetics. The authors want the terrain's influence to be clear to a human observer. **[A]** [Salge et al. 2018](https://ar5iv.labs.arxiv.org/html/1803.09853)
- **Change a mission's structure, not its layout.** XCOM 2's timers were aimed at players playing every mission the same cautious way (Solomon, already in `docs/research/notes/foundations/stealth_and_systemic_design.md`). Critics argue timers ruin one strategy without solving why it dominates. **[C]** [Pavonis forum](https://www.pavonisinteractive.com/phpBB3/viewtopic.php?p=36467) A warning for any lever bolted on top.
- Grammars, WFC and solvers are in the Lab D notes. I found nothing new that ties them to tactical guarantees, and Sightline's constraints already fit its constructive approach. **[Inf]**

### 3.5 Generate from a decisive problem **[Inf; no source does this]**

Pick each seed's crux first, then build the site, compound and routine to make it true. All approaches stay possible, but which one is cheapest changes. Candidate list, each with what the generator must guarantee:

| Crux | The generator guarantees | Precedent |
| --- | --- | --- |
| Watched window | The target is visible from perches, but each clean window is watched by a mutual-view pair | Lab D's clusters |
| Flush him | No perch sees the target on routine; an alarm, fire or power cut brings him out | Hitman: Sniper Assassin (in notes) |
| High ground is theirs | A hilltop camp, no perch above it, dead ground on the approach | Hunt's high compound |
| Rim is held | A bowl camp with a manned post on the rim, which must be solved first | COP Keating and its OP |
| Getting out | The kill is easy; water or a defile leaves two chokes for the exit | Hunt's water as obstacle |
| No long lines | Forest or terraces cap sightlines at 80–120 m | Hunt's thinned forests, reversed |
| Moving target | He's only exposed on a road section, timed | Hullett's elimination-to-chase |

Measure it with sections 1.6 and 3.2, then re-run the reviewers. Keep the design doc's rule that every approach exists: what varies is the margin. "Flush him" overlaps open call #10 in `docs/camp-engine.md`, which ties it to preparedness; this makes it a property of the seed as well, and needs the owner's say (section 0).

### 3.6 Gaps

- No published generator varies the decisive problem of a stealth site.
- No shipped game was found that does this procedurally. Hand-authored open-world bases do it by hand.
- Equilibrium measures have been used on game-playing agents, not on level sets.

---

## 4. Materials and bullets, moderately accurate

### 4.1 What shipped games do

- **Arma 3.** Penetration depth in mm is about (projectile speed / 1000) × ammunition caliber × the surface's `bulletPenetrability` (from its `.bisurf`). Slow projectiles passing through solids use a different formula based on the same two values. **[C]** [Bohemia wiki, Damage Description](https://community.bistudio.com/wiki/Arma_3_Damage_Description) (refused the fetch; snippet only.)
  - One Bohemia tracker post gives caliber 1 for a 6.5 mm class round and 1.6 for 7.62 NATO, with a warning that the values may have changed. **[C]** ([T70229](https://feedback.bistudio.com/T70229) or [T80199](https://feedback.bistudio.com/T80199); the search result didn't say which.)
  - DayZ, the same engine family, names `deflecting` as the ricochet-angle property. **[C]** [DayZ wiki](https://dayz.gamepedia.com/Weapons,_damage_and_armor)
- **Counter-Strike.** Damage lost on penetration depends on a per-surface penetration modifier (0.001 to 1.0), the weapon's penetration power, and how far the bullet travels to exit. Third-party write-ups describe finding the exit point with a trace from inside the object. **[C]** [Valve wiki, CS:GO surface types](https://developer.valvesoftware.com/wiki/List_of_CS:GO_Surface_Types), [Valve wiki, CS:S penetration](https://developer.valvesoftware.com/wiki/Bullet_Penetration_in_Counter-Strike:_Source) (both refused the fetch.)
- **Escape from Tarkov.** Community guides describe penetration as a probability from ammunition, armour class and durability, with a per-round ricochet chance. Internals weren't found. **[C]** [GGRecon guide](https://www.ggrecon.com/guides/escape-from-tarkov-penetration/)

### 4.2 Real numbers

**Thickness that stops a rifle bullet.** All older sources, for 7.92 mm or .303-class rounds at short range. Treat them as starting numbers.

USMC amphibious manual, 7.92 mm at 100 yards, single shot: **[A, transcribed manual]** [HyperWar](https://ibiblio.org/hyperwar/USMC/ref/Amphibious/Amphibious-6.html)

| Material | Thickness |
| --- | --- |
| Brick masonry | 1½ ft (0.46 m) |
| Stone masonry, ordinary concrete | 1 ft (0.30 m) |
| Reinforced concrete | ½ ft (0.15 m) |
| Wood (guide only) | 2 ft (0.61 m) |
| Timber (guide only) | 3 ft (0.91 m) |
| Sandbags: sand, gravel, brick rubble | 20 in (0.51 m) |
| Sandbags: dry loam | 30 in (0.76 m) |
| Sandbags: dry clay | 40 in (1.02 m) |
| Loose parapet: sand / loam / clay | 2 / 3 / 3½ ft (0.61 / 0.91 / 1.07 m) |

The same table adds 50% when clay, loam or sand is wet, and roughly doubles the thickness if five or six hits land in the same place. **[A]**

British manuals, 1888–1979, compiled in one article: **[B]** [Frontline Ulster](https://frontlineulster.co.uk/field-fortifications-how-thick-was-thick-enough/)

- 1979 figures, no range given: ordinary soil 1.5 m, compacted sand in sandbags 75 cm, brick 45 cm, concrete 30 cm, timber 1.5 m, mild steel 4 cm.
- Earlier tables separate penetration from a safe minimum (earth 40 in penetration, 60 in minimum), and show that ramming earth reduces its resistance.
- Oak and fir vary a lot between editions (27–57 in, and 48–84 in).

FM 5-103's table refused the fetch, so no modern 7.62 mm table was reached. **[C]**

**Ricochet.**

- Critical angle, above which a bullet stops skipping: 5–9° across wallboard, automotive steel, wood and two glasses, for rifle and pistol calibers. An AK-style rifle into water starts penetrating at about 7°. **[A]** [Wyant, AAFS 2018](https://www.aafs.org/sites/default/files/media/documents/AAFS-2018-B99.pdf)
- 9 mm into water stops ricocheting at about 8°. At a 2° impact a 9 mm bullet didn't touch the tank floor until the water was shallower than its diameter; earlier .22 work got away with just under half the diameter. **[A]** [Diaczuk & Bongiovi, AAFS 2012](https://www.aafs.org/sites/default/files/media/documents/AAFS-2012-A102.pdf)
- On hard, unyielding surfaces the ricochet leaves at slightly less than the incident angle. On yielding ones (soil, sand, water, wallboard) it leaves at a greater angle, because the bullet digs a small ramp. Ricocheted bullets are in destabilised flight and increasingly unpredictable with distance. **[A]** [AAFS 2010](https://www.aafs.org/sites/default/files/media/documents/AAFS-2010-A199.pdf), [AAFS 2012](https://www.aafs.org/sites/default/files/media/documents/AAFS-2012-A102.pdf)
- Frozen concrete raised the critical angle by 1.25 to 2.5 times, depending on the round. **[C]** [Epistemonikos record](https://www.epistemonikos.org/it/documents/48256ab40750c9b611338a165e0b91f862a88df0)
- I found no measured critical angle for soil. **[C]**

**Newton's impact depth.** D ≈ L · ρ(projectile) / ρ(target), for fast but subsonic penetration, independent of speed. **[B]** [Wikipedia](https://en.wikipedia.org/wiki/Impact_depth) For a roughly 3 cm lead-core bullet in sand (1.6 g/cc) it gives about 0.2 m, against the manuals' 0.46–0.76 m, so a table beats the formula. **[Inf, computed]**

### 4.3 What this means for Sightline **[Inf]**

- **One table, many uses.** Extend the surface data (`noise.surface`) into one material entry per surface: stopping thickness, critical angle, whether a ricochet leaves above or below incidence, footstep loudness, effort, dust or splash. Rule 16 already asks for content as data, and a bullet then has one source of truth.
- **Model.** The bullet carries power proportional to its speed (Arma's linear form). Crossing a solid costs path length ÷ stopping thickness. If grazing angle is below the material's critical angle, it reflects with a loss, with jitter from the shooter's own stream (rule 3). All of it is +, −, ×, ÷.
- **The design doc's Phase 3 line is close, but more than wood and sheet metal let a round through.** A single skin of brick, a plank fence, a tent or sheet metal are all concealment. The stop list is concrete 0.3 m, brick 0.45 m, sandbags 0.5 m or more, earth a metre or more. Most of a primitive camp's "walls" are concealment, and that matters to where a guard is safe. It adds a shot-through plan family, and it adds a real use for knowing where a man stands.
- **Most ridge shots are near-critical grazing shots.** With ridges 30–58 m up and 240–420 m out, the angle of arrival on flat ground is about 4–14° (computed from `gen.landform`). That straddles the measured 5–9°. Near misses on hard ground would skip and be heard, and on soft ground they'd throw a splash. The miss itself becomes evidence for both sides.
- **Measures.**
  - Share of guard positions concealed but not covered.
  - How far the best plan moves with penetration on versus off.
  - Players predicting whether a shot goes through, on the same 80% bar as labs A and C.

---

## 5. Natural movement and collision

### 5.1 Slopes and rough ground

- Tobler's hiking function: W = 6 · exp(−3.5 · |s + 0.05|) km/h for gradient s. Peak 6 km/h on a slight downhill (about −2.9°), about 5 km/h on the flat, with an off-path factor of 0.6. **[B]** [Wikipedia](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function)
- Rough ground costs energy before speed. Walking at 1.0 m/s on terrain varying by up to 2.5 cm raised metabolic rate 28%, step-length variability 22%, step-width variability 36%, and positive hip work 62%; step length fell 4%. **[A, abstract]** [Voloshina et al. 2013](https://pubmed.ncbi.nlm.nih.gov/23913951/) (read through Europe PMC.)
- In the field, over five surfaces at about 1.25 m/s, woodchips cost about 27% more than sidewalk. Average gait barely changed. The most terrain-sensitive measure was how high the swing foot rises, up to 58% in its mean and 63% in its variability. Gait features alone classified the terrain with 10% error. **[A]** [Kowalsky et al. 2021](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0228682)

### 5.2 The camera and body

- Head stabilisation: across walking and running tasks, sagittal head rotation stayed under 20°, and vertical head translation ranged 1–25 cm. Head pitch compensates for translation, which keeps gaze steady. **[A, abstract]** [Pozzo, Berthoz & Lefort 1990](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22Head%20stabilization%20during%20various%20locomotor%20tasks%20in%20humans%22&format=json&resultType=core)
- Camera motions adapted to gait, weight, fatigue and terrain let naive participants tell walking, running and sprinting apart from the camera alone. **[B, abstract]** [Terziman et al., IEEE TVCG 2013](https://oa.mg/work/10.1109/tvcg.2013.38)
- Camera motions improve the sensation of walking at all. **[C]** [Lécuyer et al., IEEE VR 2006](https://dblp.org/rec/conf/vr/LecuyerBHD06), cited by later work.
- Source's stair smoothing: the eye lags and catches up at a fixed 150 units/s (3.81 m/s), with the offset capped at 18 units (0.46 m) either way, linear, no easing, only while standing on non-moving ground. A full step resolves in about 0.12 s (computed). **[A]** [`SmoothViewOnStairs` in Source SDK 2013](https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/shared/baseplayer_shared.cpp)
- Tarkov's inertia is the warning about weight. Battlestate wanted loaded players unable to stop on a dime, popular streamers hated it, and later patches softened it (20% off base strength in one pass, up to 70% under overload in another). **[C]** [Console & PC Gaming](https://consolepcgaming.com/escape-from-tarkov-player-inertia-meaning-impact-game), [Softcore pass](https://consolepcgaming.com/escape-from-tarkov-softcore-gets-a-beautiful-balancing-pass-ahead-of-1-0), [ClutchPoints](https://clutchpoints.com/escape-from-tarkov-balance-change-brings-back-old-tarkov), [Sportskeeda](https://sportskeeda.com/esports/feels-like-dogs-t-summit1g-voices-opinion-adding-inertia-escape-tarkov) (search snippets; they didn't map each number to a page.)

### 5.3 What this means for Sightline **[Inf]**

Height is nearly free today. The motor slows uphill walking by a linear factor down to 0.55 at the 42° limit (`uphillSlowdown`, `driveGround` in `src/sim/body/motor.ts`), and nothing slows a descent **[Repo]**.

| Gradient | Today's factor | Tobler vs flat |
| --- | --- | --- |
| 10% | 0.95 | 0.70 |
| 20% | 0.90 | 0.50 |
| 30% | 0.85 | 0.35 |
| 50% | 0.75 | 0.17 |
| 90% (the limit) | 0.55 | 0.04 |

- A 50 m climb at 30%: 65 s at today's walk, against about 160 s with Tobler's ratio, which is one short routine cycle (160–300 s). Height would become a time decision against the routine. (Computed; ignores stamina.) Tobler is steep near the limit, so a game wants a softened version: keep the shape, floor it.
- **Effort.** Let uphill power and rough surfaces raise heart rate (`effortHr`, now by gait only), so a climb costs steadiness at the scope, in the spirit of Voloshina's and Kowalsky's numbers. It's a cost that shows at the moment the player cares.
- **Rough ground through rhythm, not speed.** The studies say speed hardly changes and variability does. Vary stride length and timing by surface, from a pure hash of stride index and surface (rule 14), so footsteps on broken ground sound and bob irregularly. Cheaper than foot IK, and nothing to clip.
- **Keep it readable.** Slope and surface effects belong on the same "can you predict your own body" exit test as noise (Lab C). Tarkov's history says feel-based weight needs a check with the owner.
- **Step smoothing and compensatory pitch**, if wanted, must be pure functions in `src/sim`, like `bob.ts` (rule 14). A grep of the motor finds stance eye-height easing only, no step-up smoothing **[Repo]**.
- **Measures.**
  - Number of Pareto-optimal routes on time versus exposure, with and without the law.
  - Share of camps whose best route changes.
  - Error in players' predicted arrival times.
  - Zero new invariant violations in the fuzz run.

### 5.4 Gaps

- No game-side test of a slope-speed law or of gait variability was found.
- No shipped game's numbers for slope speed were found.
- No specific source on first-person collision feel on rough ground beyond what the movement notes already have.

---

## 6. Cross-cutting: how I'd sequence a test **[Inf]**

1. Build the payoff-table report on existing plans and bench series (idea 3), since it costs little and says whether anything else worked.
2. Add a hilltop archetype and a "flush him" crux (ideas 1, 2) to a held-out series; compare the best-plan family share and the core families.
3. Add ridge cross-sections and perch access (ideas 4, 5); watch perch life, dead-ground share and route counts.
4. Switch on the slope law and effort (idea 6) behind `tuning`, and bench the routes.
5. Ask people (idea 8): reviewers re-run the signature test, and a triplet sitting checks that the differences show.

Rule 11 applies to all of this: each change that moves behaviour or generation needs its bench, its fingerprint and a line in `docs/decisions.md`.

---

## 7. What I couldn't find, and what I couldn't open

**Not found**

- A published metric for how diverse the best plans are across generated stealth levels. The Lab D notes also lacked one, and Beukman's and Balduzzi's methods are the nearest neighbours, untested on stealth.
- A generator, shipped or published, that guarantees a chosen decisive problem or a dead-ground share at outdoor scale.
- Any study of what players call samey in 3D or outdoor worlds.
- Developer material on Tarkov's map craft, Arma's ridgeline or sightline craft, or Far Cry's tactical terrain. (The Far Cry 5 talk is a GDC Vault video.)
- A modern 7.62 mm material table, or a critical angle for soil.
- Numbers for how shipped games apply slope to speed.

**Hosts that refused the fetch** (403, 402 or a bot wall)

`developer.valvesoftware.com`, `community.bistudio.com`, `globalsecurity.org` (FM 5-103), `galaxykate0.tumblr.com` (Compton's essay), `ro.ecu.edu.au` (Pech 2020 full text), `doaj.org`, `diglib.eg.org`, `hal.archives-ouvertes.fr` (a bot wall), `gamespot.com`, `cs.money`, `escapefromtarkov.fandom.com`. Claims that depend on them are marked **[C]**.

I didn't route around these with other clients or an archive. Two abstracts came from other public indexes of the same record: Europe PMC (Voloshina, Pozzo) and oa.mg (Terziman). PDFs that the fetch saved in binary were read with a local text extractor.

Other failures, for completeness: PubMed asked for cookies; the `tpub.com` subdomain and `nohidden.info` had certificate mismatches; `dualshockers.com` dropped the connection; the `irp.fas.org` copy of ATP 2-01.3 came back empty; two PC Gamer pages came back truncated.

**Partial reads**

- Berns et al.: first 100,000 of 126,000 characters.
- Li et al.: first half.
- Argudo et al.: abstract only (the PDF is over the fetch's size limit).
