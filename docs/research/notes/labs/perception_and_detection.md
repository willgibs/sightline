# Guard sight and detection in stealth games: prior art for Sightline (Lab A)

Confidence tags: **[P]** developer-authored primary source. **[S]** secondary (press, expert analysis). **[D]** datamined from shipped game files: lower confidence, because semantics are undocumented and values may differ by patch. **[F]** fan wiki, forum post or guide: lower confidence. Research stopped when the session's shared web-search budget ran out, and the Gaps sections list what was not covered. "Fit" notes (in Inferences) assume Sightline's rules: deterministic 30 Hz TypeScript sim, rates × dt, all state in `sim.state`, guards decide only from their `GuardMind`, and every gameplay number in `tuning.ts`.

## 1. How do the major stealth games model sight (cone shapes, ranges, falloff, light, partial visibility, peripheral vision, time to detect, decay)?

### Takeaway
Shipped games don't use one cone. They nest several vision shapes, for example Blacklist's cone, peripheral shape and "coffin" box, MGSV's four distance zones, Alien: Isolation's four cones and Mark of the Ninja's three. A filling timer or meter is gated by line-of-sight checks to several body points (Blacklist casts to 8 bones, with a minimum number visible per stance) and decays with hysteresis between states (The Dark Mod). Light is handled in one of three ways: graded (Thief, The Dark Mod, AC Shadows), binary (Mark of the Ninja, Conviction), or ignored inside the front cone (Dishonored; the xenomorph). Hard numbers are rare. The best are the Blacklist chapter, MGSV's datamined sight tables, The Dark Mod's open AI config and Ghost Recon Breakpoint's patch notes.

### Cited Findings

#### Splinter Cell: Conviction (2010) and Blacklist (2013)
- [P] Blacklist casts rays from the NPC to **eight bones** on the player's body. Each stance needs a minimum number of visible bones before detection even starts. In the chapter's figure, the "in cover" stance needs more than the two bones that are visible, "so detection has not yet begun." — [Walsh, "Modeling Perception and Awareness in Tom Clancy's Splinter Cell Blacklist", Game AI Pro 2, ch. 28 (2015)](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] Once enough bones are visible, a timer starts. Its full range comes from the detection shape the player is in, and the actual value is "arrived at by scaling linearly inside that range based on the current distance to the player". A growing HUD element represents the timer, and the player is detected when it is full. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] The timer only runs when the player is in a vision shape "unobstructed and lit". It is scaled "based on the distance to the player, lightness of the player, NPC state, etc." When it completes, the NPC both perceives the player and becomes aware of him as a threat in the same instant. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Shapes:** a standard vision cone directly ahead, "where the player should get detected quickly"; a peripheral shape; and for distance a "coffin-shaped box" that widens like a cone and then narrows again. A plain cone would let NPCs notice far players who are well off to the side, which isn't plausible. Conviction replaced the cone with boxes for distance vision, and Blacklist refined the boxes into coffins. "The most inclusive shape the player is in defines the range of the detection timer." — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **The edge cliff:** "If the player is 1 cm outside of that threshold, then the NPC will stand there forever without seeing the player. One centimeter inside and the player will be detected within a couple of seconds at most." Walsh calls this an unavoidable result of matching NPC state to the detection HUD. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Awareness states:** the progress bar is "analog in nature" but represents two binary states ("I don't see anything suspicious" and "that's enemy #1"). Splinter Cell adds a third, intermediate investigate state at "some percentage of the progress bar". — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [S] Blacklist uses multiple cones for close and distant vision, each with its own detection thresholds and signal rates. Cone size and shape change with difficulty, with more blind spots on lower settings. Designers can override player visibility at specific cover points. — [Game Developer, "Bringing balance to stealth AI in Splinter Cell: Blacklist" (GDC 2014 coverage)](https://www.gamedeveloper.com/design/bringing-balance-to-stealth-ai-in-splinter-cell-blacklist)
- [P] **Memory of changed objects:** when a door, window or light changes from its known state, it creates an event with a lifetime, and the first NPC to witness it claims it. [S] The coverage gives an example: a light that went off 5 seconds ago merits investigation, but one that went off 5 minutes ago doesn't trigger an immediate alert. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf); [Game Developer](https://www.gamedeveloper.com/design/bringing-balance-to-stealth-ai-in-splinter-cell-blacklist)
- [P] **Missing-comrade heuristic:** if NPC A has been within earshot of NPC B for 10 s, and B then makes no noise for 5 s (because he is dead), A gets an investigation event. The event has a long cooldown. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [S] Conviction removed the light and noise meters. Instead the screen desaturates to grayscale while Sam is hidden in shadow. — [Wikipedia: Splinter Cell: Conviction](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Conviction). [F] The author of a mod that removes the filter says the only other dependable hidden cue left is the ammo HUD's background. — [ModDB](https://www.moddb.com/games/tom-clancys-splinter-cell-conviction/addons/removing-the-black-white-filter-in-shadows)

#### Metal Gear Solid V (Ground Zeroes 2014, The Phantom Pain 2015): datamined sight tables
- [D] TPP's `Soldier2ParameterTables.lua` defines **sight forms** with distance in metres and horizontal × vertical angles in degrees. It is unknown whether the angles are full or half angles. The forms are contact 2 m (130°×160°), normal 60 m (100°×60°), far 90 m (30°×30°), searchlight 50 m (15°×15°) and observe 200 m (5°×5°). — [TinManTex/mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua); the same values appear in [NuLLxD/MGSVLUA](https://github.com/NuLLxD/MGSVLUA/blob/master/LUA/Soldier2ParameterTables.lua)
- [D] **Situation-specific sight types**, each with four zones (`discovery` / `indis` / `dim` / `far`; the names suggest graded recognition, but this is undocumented):
  - Day `baseSight`: 10 m at 48°×36°, 20 m at 80°×60°, 45 m at 80°×60°, 70 m at 8°×12°.
  - `nightSight`: 10 m at 40°, 15 m at 60°, 35 m at 60°, and the far zone disabled (0 m).
  - `combatSight`: 10 m at 60°, 25 m at 100°, 50 m at 100°, 70 m at 30°.
  - `observeSight` and `snipingSight` (scouts and snipers) narrow `indis` to 70 m at 8° and add an `observe` zone of 200 m at 5°.
  - `searchLightSight`: 30 m at 8° and 50 m at 12°.
  — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [D] **Weather multipliers:** sandstorm scales distance ×0.6 and angle ×0.8; fog scales distance ×0.5 and angle ×0.6; rain and cloud are ×1.0. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [D] A `sightCamouflageParameter` table gives per-zone values for enemy/character/object targets (discovery 530/530/530, indis 80/210/270, dim −50/30/130, far −310/0/70) and a `bushDensityThresold=100` (sic). Its meaning is undocumented, but it implies zone-dependent camouflage and bush-density thresholds. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [D] For Lab C, the same file sets hearing radii per sound class: 0 (prone movement, suppressors), 4.5, 5.5, 9, 15, 30, 60 and 160 m (unsuppressed shots, explosions), plus 500 m "special". A sandstorm silences the smallest classes. A modder's comments map these classes to player speeds in km/h. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [D] The Infinite Heaven mod exposes a "Soldier sight scale" (0–400 in steps of 5). It is "a rough scale over all the soldier sight distances, except for night sight distance", and the author writes "I like the retail settings in general". — [InfSoldierParams.lua](https://github.com/TinManTex/InfiniteHeaven/blob/master/tpp/gamedir-ih/GameDir/mod/modules/InfSoldierParams.lua)
- [F] Player-reported ranges conflict. One forum post gives about 60 m standing, 40 m crouched and 20 m prone, with less at night. A guide says you are "instantly" spotted at about 40 m when standing. — [Steam discussion](https://steamcommunity.com/app/287700/discussions/0/527274698152338702) (exact post not verified); [GamerGuides](https://gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/stealth-and-combat)
- [S] For comparison, MGS1 (1998) had one vision cone and no light states. The radar shows cones and guards at all times and jams during alerts. — [critpoints, "Stealth Game Spotting Deconstruction" (2015)](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/)

#### Thief: The Dark Project (1998) and The Dark Mod (open source; standalone 2013)
- [P] Tom Leonard's GDC 2003 paper, "Building an AI Sensory System: Examining the Design of Thief: The Dark Project", is the primary source for Thief's model. It could not be retrieved: the old Gamasutra URL now returns 404 on gamedeveloper.com. — [pointer: intelligent-artifice (2003)](https://intelligent-artifice.com/2003/03/making_sense)
- [S quoting P] Paul Neurath (Looking Glass) said early builds gave players "confused signals": sometimes they walked past guards unnoticed, and sometimes they were spotted instantly while well hidden, which he called "sloppy at best". The fix was the light gem, a HUD icon that "gets brighter or dimmer depending on how visibly hidden you are", with an audio component. "We had to feed back to the player their stealth state in terms of visibility." — [Game Developer, "Building the original Thief's revolutionary stealth system"](https://www.gamedeveloper.com/design/building-the-original-i-thief-s-i-revolutionary-stealth-system)
- [F] The gem shows how visible Garrett is from the light at his position, and how well nearby guards may see him. — [Thief wiki: Light Gem](https://thief.fandom.com/wiki/Light_Gem). [S, low] One analyst believes Thief 2 uses at least five view cones. — [critpoints (2015)](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/)
- [P] **The Dark Mod (TDM)**, a Thief-like game whose sensory parameters are open:
  - Base humanoid field of view is 150° horizontal × 120° vertical, rotated 20° downward. Headgear changes it, for example a hood to about 80°×95° and an eye patch to 110° (the table's alignment is ambiguous).
  - `acuity_vis` defaults to 100%, and drunk AI are scaled ×0.5.
  - The chance to spot the player depends on lightgem brightness, distance and visual acuity. The exact formula is in an unretrieved "Visual scan" page.
  — [TDM wiki: AI stats](https://wiki.thedarkmod.com/index.php/AI_stats)
- [P] TDM's lightgem "will provide a bonus for crouching, and thus complete darkness is simulated without blinding the player". — [TDM wiki: Virtual Darkness](https://wiki.thedarkmod.com/index.php/Virtual_Darkness)
- [P] **TDM alert ladder** (base values):

  | State | Threshold | Ramp-down time | Grace time | Grace fraction | Grace count |
  | --- | --- | --- | --- | --- | --- |
  | Observant (bark only) | 1.5 | 5 s ±1.5 | 2 s | 1.2 | 5 |
  | Suspicious (look, may stop and turn) | 6 | 8 s ±2 | 2 s | 1.2 | 5 |
  | Searching | 10 (was 8) | 25 s ±8 (was 30) | 3 s | 1.0 | 4 |
  | Agitated searching | 18 | 65 s ±20 | 2 s | 1.0 | 4 |
  | Combat | 23 | | | | |

  During a grace period further alerts are ignored, unless a new one exceeds the last increase × the grace fraction or more than the grace count arrive. — [tdm_ai.def (DarkRadiant test copy)](https://github.com/codereader/DarkRadiant/blob/f2ac15de7a8189dfdb93747944f0105efa134fac/test/resources/tdm/def/tdm_ai.def); [TDM wiki: AI stats](https://wiki.thedarkmod.com/index.php/AI_stats)
- [P] TDM AI think less often at distance. Between `min_interleave_think_dist` and `max_interleave_think_dist`, thinking frequency "decreases linearly", down to once every `max_interleave_think_frames`. — [tdm_ai.def](https://github.com/codereader/DarkRadiant/blob/f2ac15de7a8189dfdb93747944f0105efa134fac/test/resources/tdm/def/tdm_ai.def)

#### Dishonored (2012)
- [P] Co-creative director Harvey Smith: "We decided to go with 'view cone' based stealth." Enemies' "peripheral vision is weaker and they don't see as well up high", so you can "hide in the rafters". "If you're in front of their view cone they see you, no matter what the lighting levels." The team tried and rejected a "pool of shadow" model because "modern players would say the AI looks bad if I'm in a shadow and an enemy walks right by me." — [PlayStation Blog interview (2012)](https://blog.playstation.com/2012/08/21/interview-dishonoreds-harvey-smith-reboots-the-stealth-genre/)
- [S] One analyst says detection builds faster with proximity and less darkness, and that it is "impossible to be completely invisible" inside a cone. This partly conflicts with Smith: darkness may change the rate but not the outcome. Each NPC shows a three-stage alarm over its head, loud sounds jump straight to stage 2, and the Dark Vision power (25% mana) shows the cones. — [critpoints (2015)](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/)

#### Alien: Isolation (2014)
These findings come from game configs examined with the OpenCAGE modding tools.
- [S] All characters have **four view cones**: normal (long range), focussed (tighter, shorter), peripheral ("shorter in length but much wider") and close ("very short, but very broad"). Signal strength builds at different rates per cone, and crossing a threshold unlocks behaviour-tree branches. — [Thompson, Game Developer, "Revisiting the AI of Alien: Isolation"](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [S] Each cone has lighting and smoke modifiers. Light has "absolutely no effect" on the xenomorph, humans lose "massively" more visibility in the dark, and androids take a "minor penalty". Sensor readings decay, so the alien forgets. Turning on the flashlight while hiding gets you spotted "almost immediately". — [Thompson, Game Developer](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [S] Novice difficulty cuts vision and responsiveness to movement sounds by "over a third". There are at least 12 alien configurations. The director always knows where the player is but "never tells the alien exactly where you are", only the general area. — [Thompson, Game Developer](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)

#### Mark of the Ninja (2012)
- [P] Light and darkness are binary, with no visibility meter. A hidden ninja is drawn "in black with red highlights" and a lit one is "fully colored". Guards at the very edge of the cone may glimpse you and move toward you quickly, but not on full alert. Vision cones and sound ranges are shown on screen. There are three awareness levels, and a ghost marks the last seen position. — [Game Developer, "Mark of the Ninja's five stealth design rules"](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules)
- [S] One analysis counts three cones: a very short cone that works in darkness, a normal cone that needs light (night-vision enemies use it all the time) and an outer partial-sighting cone that sends guards to search. Sounds only cause investigation. — [critpoints (2015)](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/)

#### Shadow Tactics (2016) and Desperados III (2020)
- [P] **Shadow Tactics viewcone zones:**
  - Dark green: you are seen only if standing.
  - Bright green: seen in any stance. On some difficulties a sprint may get through.
  - Dotted (bushes or high grass): invisible while crawling unless an enemy enters. Enemies announce this with a voice line and only enter when lured or searching.
  - A pattern fill marks parts of the cone occluded by cover or high ground.
  - At night cones are smaller, the dark-green area is much larger and "light always creates a bright green area".
  — [Wagner, Game Developer, "Dynamic detection in Shadow Tactics"](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] All guards share cone size, angles and speed, and these stay the same across difficulties. Cones have sharp edges and "no gradients". — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [F] In Desperados III, a lighter striped area is where the guard "is not able to observe in 100%", for example at long distance or behind obstacles. — [gamepressure guide](https://www.gamepressure.com/desperados-iii/exploration-and-sneaking/zdd045). [P] Nearly all rules are binary, and the only randomness is in alarm and investigation searches. — [Game Developer, Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-)

#### The Last of Us (2013) and Part II (2020)
- [S] In TLOU (2013), NPCs use several view cones that aren't actually cone-shaped. — [AI and Games coverage (mirror)](https://www.jikguard.com/news/endure-and-survive-the-ai-of-the-last-of-us)
- [P] TLOU2's Stealth difficulty sub-setting controls "enemy perception through vision, hearing, and smell", "the grace period before enemies alert others" and the conditions for grabbing enemies. Combat-accessibility options add "Reduced enemy perception" and "Invisible while prone" (Off, Limited or Unlimited: "invisible to enemies while prone and not aiming"; Limited uses a time limit based on stealth difficulty). — [PlayStation: TLOU2 accessibility](https://playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/)
- [S] Co-director Anthony Newman: "Our AI now has a new state of awareness between complete awareness of your position and totally unaware of where you are." — [GamingBolt (citing GameSpot)](https://gamingbolt.com/the-last-of-us-part-2-ai-is-smarter-in-reacting-to-stealth-than-first-game)

#### Assassin's Creed Shadows (2025)
- [P] At night, "any pocket of shadows becomes a dynamic hiding spot" where Naoe is invisible, which Ubisoft calls a first for the series. Crouching and prone lower visibility. A sprinting player is spotted "almost instantaneously". Lanterns can be shot out to make shadows, and samurai slice bushes open while searching. — [Ubisoft stealth overview (Nov 2024)](https://www.ubisoft.com/en-us/game/assassins-creed/news/1lmnk4XTnnqRh1foViGYPR/assassins-creed-shadows-stealth-gameplay-overview)
- [S] PC Gamer describes a Splinter-Cell-inspired visibility meter, a "sliding scale based on stance, distance, and light level". This comes from a search snippet; the page didn't load. — [PC Gamer review](https://pcgamer.com/games/assassins-creed/assassins-creed-shadows-review). [S] Less light around enemies is reported to reduce both their detection time and their range. — [Vulkk (Ubisoft Forward recap)](https://vulkk.com/2024/06/12/assassins-creed-shadows-at-ubisoft-forward-gameplay-mechanics-story-and-ui/). [F] One critic found light "rarely impacted" play and stood on rooftops with a full meter unseen. — [forum repost of a critique](https://sameteem.com/threads/assassins-creed-shadows-is-not-the-ninja-splinter-cell-game-i-hoped-for.29285/?amp=1)

#### Far Cry, Ghost Recon Breakpoint, Hitman, Sniper Elite
- [F] **Far Cry 3 (2012):** when an enemy sees you, a white arrow appears over its head and fills. If you hide before it fills, it drains and the enemy doesn't follow up. Red means combat. — [GamerGuides FC3](https://gamerguides.com/far-cry-3/guide/introduction/gameplay/combat). **Far Cry 4 (2014):** the same meter, for humans only; animals don't use it. It "fills up and then flashes" when stealth breaks. — [GamerGuides FC4](https://www.gamerguides.com/far-cry-4/gameplay/general-gameplay/stealth-combat). **Far Cry 6 (2021)** adds a separate Heat bar that is yellow and turns red at 100%. — [gamepressure FC6](https://www.gamepressure.com/far-cry-6/heat/zef053)
- [P] **Ghost Recon Breakpoint**, Title Update 3.0.3 (Nov 2020):
  - "Increased enemy detection time; added 0.2s to 1s depending on the distance and the alert status."
  - "Time between sighting and communication is increased from 8s to 12s."
  - "Voice maximum range reduced from 20m to 15m."
  - Drones' 360° body-detection range was reduced.
  — [Ubisoft patch notes via devtrackers](https://devtrackers.gg/ghost-recon-wildlands/p/b7104cde-tom-clancy-s-ghost-recon-breakpoint-patch-notes-title-update-3-0-3). [S] Breakpoint's optical camo (Update 2.00) makes you invisible to enemies up to a certain distance. — [PSU, Update 2.00](https://www.psu.com/news/ghost-recon-breakpoint-update-2-00-unleashes-operation-motherland-content/)
- [S] **Hitman:** in Contracts (2004) a suspicion meter rises with proximity and with actions like running, and guards open fire when it fills. — [Wikipedia: Hitman: Contracts](https://en.wikipedia.org/wiki/Hitman:_Contracts). A preview of Absolution (2012) described detection as less binary than before, with a visible suspicion circle that grows. — [PC Gamer preview](https://pcgamer.com/hitman-absolution-preview-2/2). In Hitman 2 (2018), NPCs can spot 47's reflection in mirrors. — [PCGamesN](https://www.pcgamesn.com/hitman-2/ai-detect-mirrors)
- [F] **Sniper Elite 5 (2022):** after you break line of sight, a red triangle on the minimap marks your last known position. Searchers sound the all clear after a few minutes. Generators, explosions and aircraft mask shots, and guides advise relocating after a risky shot. — [gamepressure SE5](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d); [PC Gamer SE5 tips](https://www.pcgamer.com/sniper-elite-5-tips-guide/); [Attack of the Fanboy](https://attackofthefanboy.com/news/sniper-elite-5-stealth-how-to-remain-undetected/). [S] In **Sniper Elite 3 (2014)**, the UI tells you when your position may be compromised and shows how far you must move to stay unseen. — [Engadget review](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html)

#### Arma 3 (2013) and Arma Reforger (2022): the mil-sim reference for long ranges
- [P] The AI skill array includes `spotDistance` and `spotTime`. — [Bohemia wiki: Arma 3 AI Config Reference](https://community.bistudio.com/wiki/Arma_3:_AI_Config_Reference). [F] Units are created with `camouflageCoef` = 1, and lower values make them harder to see. — [mod author's changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/642457233?p=2)
- [F] A player post citing the wiki claims AI have a 120° field of view, and that once one squad member's "knowsAbout" is high enough, the whole squad knows your position. — [Steam discussion](https://steamcommunity.com/app/107410/discussions/18/1734336452601318730)

#### Open-source and inspectable implementations
- [S] **The Dark Mod:** code is GPL-3.0 and revised-BSD, and most assets are CC BY-NC-SA. The sensory and alert parameters are plain-text `.def` spawnargs (above). — [Wikipedia: The Dark Mod](https://en.wikipedia.org/wiki/The_Dark_Mod); [Slashdot (2013)](https://games.slashdot.org/story/13/10/21/1325200/the-dark-mod-20-standalone-id-tech-4-gpl-yields-a-free-thief-a-like-game)
- [D] The MGSV tables are extracted Konami game data, and the repositories hosting them declare no license. They are only usable as reference numbers. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua); [InfiniteHeaven](https://github.com/TinManTex/InfiniteHeaven)
- [F] `ntk4/UnitySensorySystem` is a small Apache-2.0 Unity sensory system, last pushed in 2019. I did not vet its content. — [GitHub](https://github.com/ntk4/UnitySensorySystem)

### Inferences

**Technique inventory with fit for Sightline**

| Technique | Shipped in (year) or research | Fit with Sightline |
| --- | --- | --- |
| Nested vision shapes; the most inclusive shape sets the timer range; a "coffin" that narrows at distance | Splinter Cell Conviction (2010, boxes), Blacklist (2013, coffin) | Point-in-shape is dot products against cosines precomputed once with `dcos`. A coffin cap stops the 120° peripheral zone seeing players far off to the side at 150 m. The shapes double as the debug overlay. |
| Distance zones with per-zone angles, switched by situation (day, night, combat, observe, searchlight), times weather factors | MGSV (2015) [D] | Pure table data in `tuning.ts`. The switch to combat sight must key on the guard's own `GuardMind` alert state, never the player's true state. Time and weather come from `MissionSpec` or state. |
| Rays to several body points, with a per-stance minimum before the meter starts | Blacklist (8 bones) | Head, chest and feet rays against the shared terrain triangles and `Solids` are deterministic in a fixed order. A Blacklist-style gate (e.g. prone-in-cover needs 2 of 3) removes "one foot showed" detections. |
| Timer linear in distance within a shape, scaled by lightness and NPC state | Blacklist | Equivalent to the rate model with `rate*dt`. Time that grows linearly with distance is easier for testers to learn than a steep product of factors. |
| Alert value with threshold ladder, per-state ramp-down times, grace periods and random fuzz | The Dark Mod (open source, GPL) | All leaves are numbers in `sim.state`. Fuzz must come from `ctx.draw(guardId, purpose, use)`, and grace periods are tick counters, not timers. |
| Light at the player's position as a visibility input, with a crouch bonus | Thief (1998), The Dark Mod | Must be computed from sim-side lights and time of day at the three body points, never read back from rendered pixels. |
| Light ignored in front of the cone | Dishonored (2012) | Trivially deterministic. A candidate rule for close range only, keeping the dark ×0.25 factor for long range. |
| Light sensitivity per character kind | Alien: Isolation (2014): xeno none, humans heavy, androids minor | Per-kind acuity and light factors in `tuning.bodies` (marksman, sentry with torch, a dog later). |
| Binary light with three cones (short dark cone, lit cone, partial-sighting cone) | Mark of the Ninja (2012) | Suggests expressing "dark" as a range cap rather than only a rate factor, which makes outcomes easier to predict. |
| Stance-dependent zones (crouch-safe far band, any-stance near band) | Shadow Tactics (2016), Desperados III (2020) | Same as a maximum range per stance in tuning. Easy to teach and to draw. |
| Sensor decay and forgetting | Alien: Isolation; The Dark Mod; Far Cry 3/4 meter drain | `decay*dt` per tick. The decay rate also sets the effective maximum detection range (see the equilibrium bullet). |
| Vertical field-of-view limits | Dishonored ("don't see as well up high"); MGSV vertical angles [D]; The Dark Mod 120° vertical tilted 20° down | One more dot product. It matters for a sniper on ridges above or below a camp. |
| Designer override of visibility at cover points | Blacklist | A per-collider concealment value in the generated camp data, in the site frame, reproducible from the seed. |
| Thinking less often at distance | The Dark Mod | Only allowed if the slice is a pure function of tick and guard id and the skipped `dt` is accumulated. Otherwise outcomes depend on slicing, and the behaviour fingerprint moves. |

- **Scale.** Sightline's ranges exceed every stealth-action game found. MGSV's normal soldier forms stop at 60–90 m (`far` 70 m at 8°), and only binocular and sniper "observe" forms reach 200 m, at 5°. Sightline's standing-in-the-open 150 m and marksman 400 m therefore have their closest precedents in MGSV's observe forms and in mil-sims like Arma, not in Thief-lineage games. Guard animations can't carry readability at those ranges.
- **Range versus rate.** MGSV handles night and weather by shrinking range and angle: at night the far zone goes from 70 m to 0 m and `dim` from 45 m to 35 m, and fog halves distance. Sightline scales the fill rate instead. With a pure rate scale, any non-zero exposure eventually completes unless decay exceeds fill. So "near invisible beyond 50 m" can only be guaranteed by an explicit cutoff or by a decay rate that outruns the fill at that distance.
- **Dynamic range of the factor product.** Sightline's worst case is peripheral 0.3 × prone 0.3 × still 0.4 × dark 0.25 × 1/3 cover = 0.003. Its best case is core 1.0 × standing 1.0 × sprinting 1.6 × lit 1.0 × full exposure 1.0 × sky 1.5 = 2.4. That is an 800× range before distance applies, so time-to-detect spans roughly three orders of magnitude.
- **Equilibrium example.** If both design ranges are equilibrium edges where fill equals decay, then prone, still and in cover (about 0.04× in the core) at 50 m must equal standing in the open at 150 m. The distance factor would have to fall about 25× between 50 and 150 m. That is roughly d⁻³; d⁻² would give only 9×. This suggests either a steep falloff or separate stance range caps in the MGSV and Shadow Tactics style.
- **Thresholds compared.** As fractions of TDM's combat threshold (23), its ladder sits at 6.5%, 26%, 43% and 78%. Sightline's 30% "curious" threshold sits close to TDM's suspicious state (26%), so there is precedent for an intermediate state at about a quarter to a third of the meter.
- **Periphery.** MGSV, Alien and Blacklist give the wide periphery a short range, while long range stays narrow. Applying Sightline's 0.3 peripheral factor at full range would let peripheral detection happen far away, which none of these games allow.

### Gaps
- Leonard's Thief paper: the archive copy was blocked and the Game Developer URL returns 404. Thief's cone parameters, visibility formula and awareness levels are therefore unconfirmed from primary text.
- Not found: Thief (2014) perception details, Splinter Cell Chaos Theory's light-meter mechanics, Hitman World of Assassination detection rules, AC Unity through Valhalla detection, Far Cry 5/6 and Ghost Recon Wildlands numbers, and Sniper Elite 4/5 vision ranges.
- MGSV: zone semantics, whether angles are full or half, and the meaning of the camouflage thresholds are undocumented. The datamined values may differ by patch.
- MGS3 and MGS Delta camo index (background matching) and Unreal Engine's AIPerception were not researched because the search budget ran out.

## 2. Which detection-meter and telegraph designs exist, what did developers learn about readability and fairness, and are there published numbers for time to detect?

### Takeaway
Telegraphs fall into four families:
- **Meters over guards' heads:** Far Cry's filling arrow, Dishonored's three stages, Hitman's growing circle.
- **HUD timers and directional warnings:** Blacklist's growing HUD element, TLOU2's directional awareness indicators.
- **Cues in the world:** Shadow Tactics' cone filling from the guard's eyes, Mark of the Ninja's character rendering, Conviction's desaturation, Blacklist's tiered barks.
- **Time tricks:** MGSV's Reflex Mode, Shadow Tactics' slow motion.

Developers agree that consistency beats realism, that what the player believes the guard could perceive matters more than what the simulation says, and that a telegraph must leave time to act. Few numbers are published: Blacklist's "a couple of seconds at most", Breakpoint's +0.2–1.0 s, and TDM's threshold and decay ladder.

### Cited Findings

#### Meter and telegraph designs
- [P] **Blacklist:** the detection timer is drawn as a growing HUD element that "defines his window of opportunity to break LOS or kill the NPC". — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Blacklist's three-tier barks:** specific lines first ("I think I heard footsteps"), then generic, then fully generic ("Huh?"). Players learn what caused a reaction from the specific lines, and the larger generic pool prevents memorable repeats. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Shadow Tactics' detection sequence:** a unique sound cue plays; the guard's cone switches on automatically; the game slows down; yellow fills the cone from the guard's eyes toward the character; detection happens when it arrives. Stepping into the yellow area means instant detection. — [Wagner, Game Developer](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] **Shadow Tactics' rejected safety nets:** freeze-on-detection broke flow; a single-action save was too strong for some characters and useless for others; a teleport circle was exploited; fake rewind confused players; real rewind was too risky to build. Slow motion first "felt like a punishment" until the slow amount and fill speed were tuned. — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [S] **MGSV Reflex Mode** slows time when you are spotted and "can switch this off through the options" (Nov 2013 demo report). — [Metal Gear Informer](https://www.metalgearinformer.com/metal-gear-solid-v-slow-motion-mechanic-can-be-switched-off). [F] Neutralising the guard before it ends stops him alerting others. — [GamerGuides MGSV](https://gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/stealth-and-combat); [Prima guide](https://primagames.com/featured/metal-gear-solid-v-the-phantom-pain-spoiler-free-guide)
- [P] **TLOU2 awareness indicators** are a "HUD element warning you when enemies are about to spot you and from which direction". The modes are Off, Stealth (until spotted) and Always (recommended for deaf and hard-of-hearing players). — [PlayStation: TLOU2 accessibility](https://playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/)
- [P] **Mark of the Ninja:** a ghost marks where the guard last saw you, and edge-of-cone glimpses make guards approach without a full alert. — [Game Developer, MotN rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules)
- [F] Far Cry 3/4's over-head arrow fills and drains; Dishonored's three-stage alarm [S]; Hitman Absolution's growing circle [S]. — [GamerGuides FC3](https://gamerguides.com/far-cry-3/guide/introduction/gameplay/combat); [critpoints](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/); [PC Gamer preview](https://pcgamer.com/hitman-absolution-preview-2/2)
- [S] Sniper-specific telegraphs: Sniper Elite 3 shows a compromised position and the distance to relocate ([Engadget](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html)). [F] Sniper Elite 5 marks your last known position with a red triangle ([gamepressure](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d)).
- [S] Tommy Thompson (AI and Games) notes that most games have some detection indicator on their interface mimicking the guard's awareness meter, and that players feel detection is unfair when it is ambiguous. This comes from a transcript snippet. — [School of Stealth Part 1](https://amara.org/v/C3BDw)

#### Developer lessons on readability and fairness
- [P] Walsh's four criteria are fairness, consistency, good feedback and intelligence. Consistency means "similar distances and timing for reactions every time", while animations and barks vary. Intelligence means "always being plausible". — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] "It's only important what's plausible from the player's point of view... in the case of player perception versus simulation accuracy, player perception should win", within the limits of plausibility. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Offscreen fairness.** The creative director kept complaining about being detected by NPCs he couldn't see. Pausing and free-camming usually explained the detection, but "the player can't pause the game and free-cam". The fix halved hearing for certain events for NPCs that were offscreen and plausibly far, and applied the same to some indirect visual events such as seeing an NPC get shot. "The game instantly became more fun." — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] Shadow Tactics aims at "almost perfect information" and shows one cone at a time so the screen stays readable. Cone rules are identical across difficulties, so players don't have to relearn them. — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] Desperados III: "We always want the players to know why their plan fails." Because the game has quick-save, detection must be precise and repeatable. — [Game Developer, Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-)
- [P] Mark of the Ninja's "transparent AI" rule: any change in guard behaviour should be understandable. — [Game Developer, MotN rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules)
- [S] One analyst judges Dishonored's fuzzy rules "more difficult to read" (hence Dark Vision), and cites Monaco's binary feedback as letting beginners act with certainty. — [critpoints](https://critpoints.net/2015/03/30/stealth-game-spotting-deconstruction/)
- [S] In Alien: Isolation the director never feeds the alien the player's exact position. The creature "has to earn its kill". — [Thompson, Game Developer](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)

#### Published numbers for time to detect and thresholds
- [P] **Blacklist:** once inside a shape, detection comes "within a couple of seconds at most", with time linear in distance inside the shape's range. — [Walsh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] **Breakpoint:** detection time +0.2 to +1.0 s depending on distance and alert status; sighting-to-radio delay 8 s → 12 s; voice range 20 m → 15 m. — [patch notes](https://devtrackers.gg/ghost-recon-wildlands/p/b7104cde-tom-clancy-s-ghost-recon-breakpoint-patch-notes-title-update-3-0-3)
- [P] **TDM:** thresholds 1.5, 6, 10, 18 and 23; decay times 5, 8, 25 and 65 s; grace periods 2–3 s. — [tdm_ai.def](https://github.com/codereader/DarkRadiant/blob/f2ac15de7a8189dfdb93747944f0105efa134fac/test/resources/tdm/def/tdm_ai.def)
- [D] **MGSV zone edges:** 10, 20, 45 and 70 m by day; 10, 15 and 35 m at night; 200 m for observers. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [S] **Alien: Isolation:** Novice reduces vision by "over a third". — [Thompson](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)

### Inferences

**Telegraph inventory with fit for Sightline**

| Telegraph | Shipped in | Fit with Sightline |
| --- | --- | --- |
| HUD timer that grows from the moment detection starts | Blacklist (2013) | Fill is sim state, so the HUD just reads the snapshot. Sightline hides 0–30%, so it must ensure 30→100% always leaves enough time to react. |
| Directional HUD warning: about to spot you, and from where | TLOU2 (2020) | The best fit for a first-person game at 150–400 m, where guard animations are unreadable. The direction comes from guard and player positions in the snapshot. |
| Over-head meters that fill and drain | Far Cry 3/4; Dishonored; Hitman Absolution | Need scope-scale drawing at sniper ranges, and could clash with "art stays out". The scope view could show them. |
| Cone fill from the guard's eyes, plus a sound sting, plus slow motion | Shadow Tactics (2016) | First person has no cones; the analogue is a sting plus an edge glow. Slow motion would be app-side tick pacing, which keeps the sim deterministic because it never sees wall-clock time. |
| Post-detection grace with slow motion | MGSV Reflex Mode (optional) | The grace window (N ticks before he can raise the alarm) is a sim rule in tuning; the slow motion is presentation. |
| Tiered barks | Blacklist | Pick the tier from counters in `sim.state` or the guard's own random stream. Speech isn't audible at 300 m, so barks only help up close or over the radio. |
| Last-known-position marker and relocation distance | MotN; Sniper Elite 3 and 5 | The core sniper loop. The last known position lives in `GuardMind`, and the honest view can show it after a shot. |
| Player visibility cues (light gem, desaturation, character tint) | Thief; Conviction; MotN; AC Shadows | Needed in first person, since players can't see their own lighting. Compute from sim light at the body points. |
| Edge-of-cone glimpse leads to an approach, not an alert | Mark of the Ninja | Maps directly onto Sightline's 30% curious state. |
| Grace before alerting others; radio delay; voice range | TLOU2 (tunable); Breakpoint (12 s, 15 m) | Concrete latencies for the "told" path. Messages go through scheduled events (`ctx.schedule`). |

- Blacklist shows its HUD from the moment detection starts. Sightline shows nothing below 30%. To keep "every detection telegraphed", the lab could assert a minimum interval in ticks between the first visible cue and 100% for every combination of factors, except for an explicit, readable contact zone such as MGSV's 10 m `discovery` zone or Shadow Tactics' instant yellow.
- Blacklist's offscreen halving can be implemented deterministically in Sightline, because the player's look direction is quantized input in sim state. It changes guard senses based on the player's camera, though, which is a design choice for the owner.
- Shadow Tactics' experience suggests Sightline should treat slow motion as optional, like MGSV, and tune it so it doesn't feel like a punishment.

### Gaps
- No published fill times were found for Far Cry, Assassin's Creed, Hitman or MGSV, and Reflex Mode's duration was not found.
- The Assassin's Creed "eye" indicator mentioned in the brief was not documented in what I found. No developer postmortem on Far Cry's meter was found.

## 3. How do games handle concealment in foliage and grass, in both directions, and how do they make light and shadow readable in the world?

### Takeaway
Shipped games mostly treat foliage as binary hiding volumes that guards search: Shadow Tactics and Desperados bushes, AC Shadows bushes, TLOU2 grass. A few grade it: TLOU2 by grass height, MGSV with a bush-density threshold. Mil-sims show that asymmetric foliage (grass the player sees but the AI ignores) produces the longest-running fairness complaints. Light is shown either as a player-side meter (Thief's light gem, AC Shadows' meter) or diegetically (Mark of the Ninja's character rendering, Conviction's desaturation, Shadow Tactics' bright zones at night).

### Cited Findings

#### Foliage and grass
- [P] Shadow Tactics: bushes and high grass make crawling characters invisible "unless an enemy enters the bushes". Enemies announce themselves with a voice line and only enter when lured or searching. — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] AC Shadows: bushes are hiding spots that "samurai can slice open while searching", removing them. — [Ubisoft stealth overview](https://www.ubisoft.com/en-us/game/assassins-creed/news/1lmnk4XTnnqRh1foViGYPR/assassins-creed-shadows-stealth-gameplay-overview)
- [S] TLOU2: how well you are hidden depends on how tall the grass is ("analog" stealth), and because players can hide in grass, enemies search grass and look under vehicles. These quotes come from 2018 press snippets; the exact article wasn't verified. — [GameSpot](https://www.gamespot.com/articles/the-last-of-us-2s-upgraded-enemy-ai-will-make-for-/1100-6470119/). [P] An "Invisible while prone" assist exists. — [PlayStation](https://playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/)
- [D] MGSV: `bushDensityThresold=100` sits next to per-zone camouflage thresholds. — [mgsv-deminified-lua](https://github.com/TinManTex/mgsv-deminified-lua/blob/master/data1/Assets/tpp/level_asset/chara/enemy/Soldier2ParameterTables.lua)
- [S] Alien: Isolation: designers built crawlspaces where the alien "can no longer see you" or its chances are "drastically reduced". — [Thompson](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [F] **Arma's grass asymmetry:**
  - Players have complained for years that AI see prone soldiers through grass the player can't see through.
  - A Bohemia feedback-tracker thread concluded that prone "appears to significantly increase camouflage factor" but "the grass itself doesn't appear to block AI's view" (the ticket attribution is from a snippet).
  - A community mod adds grass line-of-sight checks only between the player and AI, because "the computation is too costly" for all AI pairs.
  - Reforger players report that AI can't see through tree leaves or bushes, but that this concealment stops being reliable once the AI has detected you.
  — [Steam (Arma 3, 2013)](https://steamcommunity.com/app/107410/discussions/0/3192490241171731993); [BI feedback tracker](https://feedback.bistudio.com/T128621); [BI forums: ACSTG mod](https://forums.bohemia.net/forums/topic/241678-acstg-ai-cannot-see-through-grass); [Steam (Reforger)](https://steamcommunity.com/app/1874880/discussions/0/4356746836652267707)
- [P] Dishonored's vertically "squashed" vision lets players hide in rafters. — [PlayStation Blog](https://blog.playstation.com/2012/08/21/interview-dishonoreds-harvey-smith-reboots-the-stealth-genre/)

#### Light and shadow readability
- [S quoting P] Thief's light gem came from playtesters not knowing how hidden they were. Without knowing whether they were in shadow, "a lot of [the system] just doesn't work" (Neurath). — [Game Developer retrospective](https://www.gamedeveloper.com/design/building-the-original-i-thief-s-i-revolutionary-stealth-system)
- [P] Mark of the Ninja: binary light, with the character drawn black with red highlights when hidden. — [Game Developer](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules)
- [S] Conviction: grayscale while hidden. — [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Conviction)
- [P] Shadow Tactics: at night "light always creates a bright green area" inside smaller cones. — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] AC Shadows: shadow pockets make the player invisible, and lanterns can be shot out. — [Ubisoft](https://www.ubisoft.com/en-us/game/assassins-creed/news/1lmnk4XTnnqRh1foViGYPR/assassins-creed-shadows-stealth-gameplay-overview). [F] A forum post that appears to reproduce Ubisoft's text says a UI light meter shows concealment from fully visible to completely hidden. — [Lowyat forum](https://forum.lowyat.net/topic/5457817). [S] PC Gamer calls it a "sliding scale based on stance, distance, and light level" (search snippet). — [PC Gamer](https://pcgamer.com/games/assassins-creed/assassins-creed-shadows-review)
- [P] Dishonored rejected "pool of shadow" stealth as looking unrealistic to modern players. — [PlayStation Blog](https://blog.playstation.com/2012/08/21/interview-dishonoreds-harvey-smith-reboots-the-stealth-genre/)
- [P] TDM folds stance into the light measure: the lightgem's crouch bonus simulates darkness "without blinding the player". — [TDM wiki](https://wiki.thedarkmod.com/index.php/Virtual_Darkness)

### Inferences

**Fit for Sightline**

| Technique | Shipped in | Fit with Sightline |
| --- | --- | --- |
| Binary hiding volumes that guards announce and search | Shadow Tactics; AC Shadows; TLOU2 | Highly readable. A volume flag on generated vegetation plus a "search this bush" behaviour from `GuardMind` keeps it perception-only. |
| Concealment graded by density or height | TLOU2 (grass height); MGSV (density threshold) [D] | Model it as per-volume transmittance multiplied along each body-point ray. That is deterministic if volumes are sim data in the site frame, but it needs a visible cue such as foliage drawn between scope and guard. |
| Symmetric occlusion: what blocks your view blocks his | None found (Arma shows the failure mode) | Sightline's canopy currently hides the guard from the player but not the player from the guard, which is the Arma complaint pattern. Rule 14 ("what is drawn is what is simulated") argues for the same transmittance in both directions and the same geometry in the renderer. |
| Player light cue (gem or meter, desaturation, tint) | Thief; AC Shadows; Conviction; MotN | Three light bands map onto a three-state cue. It is computed from sim light at head, chest and feet, never from rendering. |
| Light that only matters at a distance | Dishonored (none in front); MGSV (night shrinks range) | One option: ignore light within contact range and apply the 0.25 dark factor only beyond it. That matches Smith's argument that "I'd still see you" up close. |

- Silhouette: no shipped game was found that documents a sky-silhouette factor, so Sightline's ×1.5 skyline factor has no direct precedent. A deterministic test could be "the guard-eye ray through the player's head continues to the sky without hitting terrain or foliage within N m". It needs its own honest-view cue, because a first-person player can't see what is behind his own head.

### Gaps
- No primary source on symmetric canopy or foliage handling was found. The Arma "grass layer" (prone bodies sunk into the ground at distance) is unverified because the forum page returned 403.
- MGS3's camo index (matching the background) and Styx's in-world light tattoo were not researched because the search budget ran out.

## 4. How did teams test and tune perception fairness, and are there studies of player understanding or predictability?

### Takeaway
Studios report tuning by playtesting with debug drawing, not by automated fairness tests: Blacklist's drawn shapes and free-cam reviews, Shadow Tactics' iterated safety nets, and Thief's light gem born from playtest confusion. Academia gives the closest thing to Sightline's exit test. Tremblay, Torres and Verbrugge (FDG 2014) found that a simple distance-to-guard metric predicted human judgements of path safety best. No published study measuring how accurately players predict detection outcomes was found.

### Cited Findings
- [P] Blacklist's solution came "through many hours of playtesting and designer tweaking". The chapter shows a debug drawing of the detection shapes (Figure 28.3) and describes free-cam reviews with the creative director. — [Walsh, Game AI Pro 2](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy%27s_Splinter_Cell_Blacklist.pdf)
- [P] Shadow Tactics' takeaway after iterating on safety nets: the team kept building on failed ideas instead of stepping back, and says it should have reassessed sooner. — [Wagner](https://www.gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-)
- [P] TDM's config comments record tuning history, for example `alert_thresh3` 8 → 10 and `alert_time3` 30 → 25 under issue #3492. — [tdm_ai.def](https://github.com/codereader/DarkRadiant/blob/f2ac15de7a8189dfdb93747944f0105efa134fac/test/resources/tdm/def/tdm_ai.def)
- [P] Breakpoint tuned detection time and radio delay after launch. — [patch notes](https://devtrackers.gg/ghost-recon-wildlands/p/b7104cde-tom-clancy-s-ghost-recon-breakpoint-patch-notes-title-update-3-0-3). [P] TLOU2 exposes its perception knobs (perception, grace before alerting, prone invisibility) to players as difficulty settings. — [PlayStation](https://playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/)
- [S] Alien: Isolation's configs, including at least 12 alien configurations, can be inspected with the OpenCAGE tools, which can disable the alien's vision for testing. — [Thompson](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [P, research, 2014] **Tremblay, Torres & Verbrugge, "Measuring Risk in Stealth Games" (FDG 2014):**
  - Setup: 27 participants watched 15 looping animations of two paths past guards with visible fields of view and chose the safer path. A level counted only when at least 75% of participants agreed.
  - Results: of the 10 levels that reached agreement, the distance metric matched humans on all 10, line of sight on 7 and near misses on 7. "A simple path-distance measure correlates best with human judgement."
  — [FDG 2014 paper](https://www.cs.mcgill.ca/~jtremb59/Papers/fdg2014_paper_33.pdf)
- [P, research] The same group's tools search space-time with random trees (RRT) for stealthy paths, where a valid move avoids obstacles and every guard's field of view (2013). Later work adds distractions (Borodovski & Verbrugge, 2016) and procedural guard and camera placement (Xu, Tremblay & Verbrugge, 2014). — [Tremblay et al. 2013](https://www.sable.mcgill.ca/~clump/papers/tremblay-13-exploration.pdf); [Borodovski & Verbrugge 2016](https://www.sable.mcgill.ca/~clump/papers/borodovski-16-analyzing.pdf); [Xu et al. 2014](https://www.pcgworkshop.com/archive/xu2014procedural.pdf)
- [P, research, 2023] Al Enezi & Verbrugge ran a user study of enjoyment and difficulty against several dynamic guard-patrol behaviours, and of whether players can tell them apart. It does not measure detection prediction. — [AIIDE 2023](https://ojs.aaai.org/index.php/AIIDE/article/view/27513)
- [P] Eric Martel (Ubisoft) gave a GDC 2017 talk on a "robust, designer-configurable sensory system" drawing on Assassin's Creed and Thief, mainly visual detection. Only the abstract is available. — [GDC Vault](https://gdcvault.com/play/1026497/Can-You-See-Me-Now)

### Inferences
- Sightline's blind-prediction exit test can borrow Tremblay's protocol. Deterministic replays give identical honest-view clips for every tester. Ask "seen or not?" (and optionally "when?"), score against the sim outcome, and use an agreement threshold plus a breakdown by factor to find which multipliers testers can't perceive.
- Tremblay's result suggests testers judge mostly by distance. Factors with no visible correlate (light band, skyline, cover share, peripheral zone) are where predictions will fail, so each needs an honest-view cue or a simpler rule.
- Determinism allows tests studios rarely have:
  - A "perception table" that sweeps distance × stance × movement × light × cover and asserts time-to-detect bands, using fixed-tick scenes from `npm run scene`.
  - Property tests: more exposure is never slower, foliage is symmetric, the minimum telegraph window holds.
  - The existing no-omniscience test (`perception.test.ts`).
  - Fuzz runs that log each detection with its factor breakdown, so the debug view can explain it afterwards (rule 8).
- Blacklist's free-cam lesson argues the debug view alone doesn't make detection feel fair; the honest-view cue is what testers must be able to use.

### Gaps
- No studio has published automated fairness tests for perception, as far as I found, and no study measures how accurately players predict detection outcomes. The content of Martel's GDC talk was not accessible.

## 5. What is the state of the art from 2018 to 2026?

### Takeaway
Recent shipped work focuses on tunability and accessibility (TLOU2, 2020: granular stealth difficulty, directional awareness indicators, invisible-while-prone), on post-launch tuning of detection timing (Breakpoint, 2020), and on bringing light-based stealth back with a HUD meter (AC Shadows, 2025). Hitman 2 (2018) added mirror reflections to sight. Academic work from 2020 to 2025 (McGill) targets guard search and patrol with explainable belief maps rather than perception itself. Isla's occupancy maps (2013) remain the reference for showing a guard's belief to the player.

### Cited Findings
- [P] TLOU2 (2020): stealth difficulty covers vision, hearing and smell plus the grace period before alerting others. It has directional awareness indicators and an "Invisible while prone" option. Enhanced listen-mode scans are tunable from 10 to 30 m and 1 to 5 s. — [PlayStation](https://playstation.com/en-us/games/the-last-of-us-part-ii/accessibility/)
- [P] Breakpoint (Nov 2020): +0.2–1.0 s detection time, 12 s radio delay, 15 m voice range. — [patch notes](https://devtrackers.gg/ghost-recon-wildlands/p/b7104cde-tom-clancy-s-ghost-recon-breakpoint-patch-notes-title-update-3-0-3)
- [P] AC Shadows (2025): shadows that make you invisible, prone, destructible lights. — [Ubisoft](https://www.ubisoft.com/en-us/game/assassins-creed/news/1lmnk4XTnnqRh1foViGYPR/assassins-creed-shadows-stealth-gameplay-overview)
- [S] Hitman 2 (2018): NPCs spot reflections in mirrors, part of a broad AI revision. — [PCGamesN](https://www.pcgamesn.com/hitman-2/ai-detect-mirrors)
- [P] Desperados III (2020): binary, repeatable rules, with randomness only in searches. — [Game Developer](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-)
- [P, research, 2013] Isla, "Third Eye Crime: Building a Stealth Game Around Occupancy Maps" (AIIDE 2013) describes a commercial stealth puzzler whose gameplay "relies heavily on occupancy maps". [S] Reviewers describe the player seeing where guards look and where they will go. — [AAAI page (via search abstract)](https://ojs.aaai.org/index.php/AIIDE/article/view/12663); [dblp](https://dblp1.uni-trier.de/rec/conf/aiide/Isla13.html); [TouchArcade (GDC 2013)](https://toucharcade.com/2013/03/26/gdc-2013-you-have-to-see-third-eye-crime/); [Pocket Gamer](https://www.pocketgamer.com/articles/059246/third-eye-crime/)
- [P, research, 2020] Al Enezi & Verbrugge, "Dynamic Guard Patrol in Stealth Games" (AIIDE 2020), cites Isla's work for keeping track of the player after line of sight breaks. — [AIIDE 2020](https://ojs.aaai.org/index.php/AIIDE/article/view/7425)
- [P, research, 2025] Xu & Verbrugge, "Generic Guard AI in Stealth Game with Composite Potential Fields" (arXiv, Aug 2025):
  - A training-free, explainable framework combining Information, Confidence and Connectivity maps, with a few decay and weight parameters.
  - Works on both grids and navmeshes.
  - Evaluated on 5 maps × 2 player policies × 5 guard modes, with claimed gains in capture efficiency and patrol naturalness.
  — [arXiv 2508.18527](https://arxiv.org/abs/2508.18527)

### Inferences

**Fit for Sightline**

| Technique | Shipped or research | Fit with Sightline |
| --- | --- | --- |
| Occupancy-map belief: cells in view are cleared, others spread over time | Third Eye Crime (2014); Isla (2013) | A natural form for `GuardMind` belief. It is a plain grid in `sim.state`, updated only from perception, deterministic, and drawable in the debug view as an explanation. |
| Information and confidence maps with decay | Xu & Verbrugge (2025, research) | Same fit. It gives designer-tunable decay parameters for `tuning.ts` and is explainable by construction. |
| Perception knobs exposed as difficulty | TLOU2 (2020) | Difficulty presets as overlays on the perception section of `tuning.ts`. Recordings embed the tuning they ran with (rule 16). |
| Timing tuned after launch | Breakpoint (2020) | Supports Sightline's approach of tuning numbers with behaviour fingerprints and recordings. |

- The trend for first-person readability is toward directional HUD warnings and optional assists, not visible cones. That matters for Sightline's honest view.

### Gaps
- No technical talk on TLOU2's perception was found. Nothing was found on Hitman 3 or World of Assassination detection, MGS Delta (2025), Thief VR (2025) or AC Mirage (2023).
- The full texts of Isla (2013) and Xu & Verbrugge (2025) were not read: the AAAI page was blocked by a bot check, and only the arXiv abstract was retrieved.
- The search budget ran out before these could be pursued.
