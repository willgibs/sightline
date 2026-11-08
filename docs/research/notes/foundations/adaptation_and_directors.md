# Enemy adaptation within and across missions, and AI pacing directors (foundation for Sightline's doctrine system and pacing layer)

How to read these notes:
- **Confidence tags.** [P] marks primary sources: game script, developer slides, patents, papers, and articles written by the developers. [S] marks secondary sources: journalism, analysts and Wikipedia. [C] marks community sources: fan wikis, forums and guides, which are lower confidence.
- **"(snippet)".** I saw that content only in a search-result summary, not in a full read.
- **Fit and Det. lines.** Most items end with two lines. **Fit** says how the item maps to Sightline's doctrine and pacing design. **Det.** says how it fits a deterministic simulation in which guards know only what they perceived or were told in a briefing. Both lines are my inferences, not findings.
- **Search budget.** The session's web-search budget ran out partway through. Later checks used direct fetches of known URLs only.

## 1. Metal Gear Solid V: The Phantom Pain: adaptive countermeasures, their thresholds, the dispatch missions that reduce them, and how players received them

### Takeaway
MGSV's countermeasures are a points ledger in the game script `TppRevenge.lua`. It works like this:
- Twelve tracked habit types gain points from specific events. Every 100 points is one level.
- Story progress caps the levels, and some types decay at mission end.
- Each level maps to a share of soldiers carrying some gear, or to a count of specialists.
- Fourteen "revenge" combat-deployment missions each block one gear type for three sorties. A mission is offered only while its countermeasure is live.
- Nothing caps how many countermeasure types are active at once.

Reception was mixed:
- Reviewers praised the way it forces variety.
- Players complained that blocks wear off and that the system reads as general escalation.
- Players also gamed it by avoiding the tracked actions.

### Cited Findings

#### Rules and thresholds, from the game script
- **Source note.** The values below come from `TppRevenge.lua` as kept in the Infinite Heaven (IH) mod repository. IH's edits are tagged `--tex`, and original lines are kept as `--ORIG`. The constants are believed to be vanilla but were not diffed against an unmodified dump. I read the file through a summarizing fetch, and the read was truncated at about 100k of 105k characters — [TppRevenge.lua, Infinite Heaven repo](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P, near-primary]
- **Tracked types.** STEALTH, NIGHT_S (discovered at night), COMBAT, NIGHT_C (eliminations at night), LONG_RANGE, VEHICLE, HEAD_SHOT, TRANQ, FULTON and SMOKE, plus two per-mission tallies, M_STEALTH and M_COMBAT — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
  - Fit: Sightline's habit list has the same shape (range, headshots, time of day, tools, approach, bodies found, alarms). MGSV shows that about a dozen axes are workable, though it shows only six to players (see Visibility).
  - Det.: a fixed set of integer counters in operation state, trivially hashed.
- **Points to levels.** Level = floor(points / 100) (`REVENGE_POINT_PER_LV=100`), capped per type and per story rank. Points are clamped to between 0 and maxLevel×100+99 — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
- **Story ceilings.** A "limit rank" from 1 to 6 rises at five story milestones: Find the Secret Weapon, Rescue Huey, Eliminate the POWs, White Mamba and OKB Zero. Hard missions use the top rank. The per-type ceilings, as six-step arrays indexed by rank:
  - HEAD_SHOT 0, 1, 2, 3, 5, 7.
  - STEALTH and COMBAT 0 to 5.
  - NIGHT_S, VEHICLE and SMOKE 0, 1, 1, 2, 3, 3.
  - FULTON 0, 1, 2, 2, 3, 3.
  - LONG_RANGE 0, 1, 1, 2, 2, 2.
  - NIGHT_C and TRANQ at most 1.

  Every array starts at 0. If they are indexed from rank 1, which is my reading, no countermeasure can appear before the first milestone — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]. The fan wiki likewise describes levels capped until scripted story points are reached — [Metal Gear Wiki (snippet)](https://metalgear.fandom.com/wiki/Revenge_System_(enemy_preparedness)) [C]
  - Fit: a ceiling schedule by mission index keeps an operation's opening missions clean. Sightline's 5–7 missions could cap doctrine strength per mission.
  - Det.: the ceiling is a pure function of the mission index carried in the MissionSpec.
- **Event points (`REVENGE_POINT_TABLE`).** Source: [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P].

  | Event | Type | Points |
  | --- | --- | --- |
  | Headshot | HEAD_SHOT | +5 |
  | Sniping kill | LONG_RANGE | +30 |
  | Discovered at night | NIGHT_S | +15 |
  | Eliminated at night | NIGHT_C | +10 |
  | Fulton extraction | FULTON | +15 |
  | Using or witnessing smoke | SMOKE | +15 |
  | Helicopter or vehicle kill | VEHICLE | +10 |
  | A comrade woken from tranquilizer | TRANQ | +5 |
  | Each stealth or combat elimination | M_STEALTH or M_COMBAT | +5 |
  | Wiping out a whole outpost | M_STEALTH or M_COMBAT | +15 |

  - By my arithmetic, about 20 headshots buy one helmet level (+10% helmets), and about four long-range kills summon two snipers.
  - Fit: the tally is per event and blind to whether the enemy could know (see Inferences).
- **Stealth-versus-combat "tendency" at mission end.** Whichever of M_STEALTH or M_COMBAT dominated adds 25 points (low levels) to 50 (high levels) to its own axis, and takes 0 to 50 from the other. A draw raises both at low levels and lowers both at high levels. The M_ tallies then reset — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
  - Fit: a zero-sum axis makes doctrine answer the dominant approach of a mission, not everything the player did. That is a good model for Sightline's "approach" habit.
  - Det.: computed once at mission end from tallies kept in state.
- **Countermeasure tables (`revengeDefine`).** Source: [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P].
  - HEAD_SHOT level n puts helmets on 10%×n of soldiers, so 70% at level 7.
  - NIGHT_S gives night-vision goggles to 25–75%. NIGHT_C gives gun lights to 75%.
  - SMOKE gives gas masks to 25–75%.
  - STEALTH 1 brings cameras, and STEALTH 3 adds decoys and mines.
  - COMBAT 1 brings soft armour for 25% plus two shotguns or two machine guns. COMBAT 5 brings four shields, four heavy armour and super reinforcements (reinforce count 3).
  - LONG_RANGE 1 brings two snipers, and LONG_RANGE 2 makes them stronger.
  - VEHICLE brings two, then four, missiles.
  - FULTON 1 to 3 bring low, high and special anti-Fulton tiers.
  - Heavy armour is capped at four soldiers.
  - Fit: these mirror Sightline's table (helmets, marksmen, lights). Equipping a percentage of soldiers keeps a countermeasure partial, so the habit is taxed rather than banned.
  - Det.: per-soldier rolls should come from a forked generation stream, such as `rng.fork('doctrine')`, and be baked into the MissionSpec.
- **Decay at mission end.** Source: [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P].
  - Night, smoke, long-range and vehicle points fall by 10 at level 0 and by 50 above it.
  - The other types fall by 10×(level+1), capped at 50.
  - STEALTH and COMBAT don't decay. They move only by tendency.
  - With the chicken-cap flag set (the chicken-hat assist), the other types lose 100 points.
  - I couldn't see where the reduction routine is called from in the portion read. The fan wiki says preparedness drops when a mission is completed — [Metal Gear Wiki (snippet)](https://metalgear.fandom.com/wiki/Revenge_System_(enemy_preparedness)) [C]
  - Fit: decay means a habit must be kept up to keep its countermeasure. The chicken hat is a mercy valve that ties struggling to less adaptation.
- **Exempt missions.** A list of mission IDs never generates revenge points. It includes the prologue, several story missions, the helicopter hub and FOB. Free-roam and Mother Base IDs skip the stealth/combat tendency — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
  - Fit: tutorials and set pieces should not feed doctrine.

#### Visibility to the player
- **iDroid icons.** The game registers six response parameters for the iDroid map: Fulton, headshot, stealth, combat, night and long range. Each is on a 0–3 scale, where 3 means at or above the late-game ceiling. Smoke, tranquilizer and vehicle responses are tracked but not shown — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]. A guide describes map icons whose backgrounds turn white, then pink, then red for levels 1–3 — [Gamer Guides, Dynamic difficulty](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/dynamic-difficulty) [C]
  - Fit: an always-visible threat board complements Sightline's briefing. Hidden axes are where players get surprised.
  - Det.: the board is a read-only projection of operation state, drawn on the render side.
- **Pre-release framing.** A Gamescom report of 15 Aug 2014 says the enemy learns your patterns and adapts. It gives helmets if you overuse headshots, heavier body armour if you favour body shots, and more guards on routes you use often — [Outcyders](https://www.outcyders.net/news/metal-gear-solid-v-the-phantom-pain-conference-gamescom-2014) [S]

#### Dispatch counters (combat deployments)
- **Fourteen "revenge" deployments.** Each is mapped to a revenge type, a minimum level and one blocked gear type — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P].
  - Smoke blocks gas masks. Headshot blocks helmets.
  - Stealth 1, 2 and 3 block cameras, decoys and mines.
  - Night stealth blocks NVGs. Night combat blocks gun lights.
  - Combat 1 to 5 block shotguns, machine guns, soft armour, shields and heavy armour.
  - Long range blocks snipers. Vehicle blocks missiles.
  - A deployment is added to the list only while its type is at or above the required level and not already blocked. Otherwise it is removed.
- **Block duration.** A successful deployment sets a block of `BLOCKED_FOR_MISSION_COUNT=3`. The count goes down after helicopter-hub missions, which I read as once per sortie. IH makes the count configurable — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
  - Fit: this is exactly Sightline's "side objectives set doctrine back". The gating, offered only while the countermeasure is live, keeps the menu relevant.
  - Det.: block counters are integers in operation state, and the offer list is a pure function of that state.
- **Guide and player accounts.** Guides call the relief temporary. They say the deployments need high-ranked combat-unit staff, and later ones need vehicles or Walker Gears — [Gamer Guides, Dispatch missions](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/missions/dispatch-missions); [Gamer Guides, Dynamic difficulty](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/dynamic-difficulty) [C]. Players describe raiding the supply of helmets, riot suits, body armour, cameras, machine guns and sometimes snipers this way — [Steam thread, 31 Mar 2019](https://steamcommunity.com/app/287700/discussions/0/1771511442695350520) [C]
- **No global cap.** In the portion read, the script assigns gear per soldier, with exclusion lists and armour caps. It sets no limit on how many countermeasure types are active at once — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]
  - Fit: this contrasts with Sightline's cap of three (section 3).

#### Reception and criticism
- **Critics.** Wikipedia's reception summary says some critics praised the enemy AI and how its tactics changed to counter favoured playstyles. It cites PC Gamer, Eurogamer, Polygon and Time — [Wikipedia](https://en.wikipedia.org/wiki/Metal_Gear_Solid_V:_The_Phantom_Pain) [S]
- **Twinfinite and GamingTrend.** Twinfinite called the system a clever way to force players to change things up. GamingTrend treated it as part of a playground to manipulate and experiment with — [Twinfinite review (snippet)](https://twinfinite.net/pc/metal-gear-solid-v-the-phantom-pain-review/); [GamingTrend review (snippet)](https://gamingtrend.com/reviews/tactical-espionage-brilliance-metal-gear-solid-v-the-phantom-pain-review) [S]
- **A review, probably Expert Reviews.** The search summary didn't pin these points to a single outlet. Mother Base can remove these advantages only temporarily. Close-quarters play brings shields, body armour and riot gear, and many night missions bring flashlights and NVGs — [Expert Reviews (snippet; attribution uncertain)](https://www.expertreviews.co.uk/technology/gaming/metal-gear-solid-v-the-phantom-pain-review) [S, lower confidence]
- **Operation Rainfall.** It framed the steady growth in enemy competence as a design problem — [Operation Rainfall (snippet)](https://operationrainfall.com/2015/10/04/review-metal-gear-solid-v-phantom-pain/2) [S, lower confidence]
- **WhatCulture.** It lists headshot-heavy play as a way players unknowingly make the game harder — [WhatCulture](https://whatculture.com/gaming/10-times-you-made-a-video-game-harder?page=10) [S]
- **Players.**
  - One complained that a sabotage only reduced helmets, and that they were back in full once it wore off — [Steam (snippet)](https://steamcommunity.com/app/287700/discussions/0/523897653308116986/?ctp=3) [C]
  - Another deliberately avoids headshots, and limits a buddy's headshots, to keep the helmet response from rising, calling it free to exploit — [Steam thread, 31 Mar 2019](https://steamcommunity.com/app/287700/discussions/0/1771511442695350520) [C]
  - A sceptic argued that enemies simply upgrade over time rather than answering specific tactics — [Steam (snippet)](https://steamcommunity.com/app/287700/discussions/0/523897653296214623) [C]

### Inferences
- **MGSV counts ground truth.** A headshot counts whether or not anyone ever finds the body. Sightline can be fairer and teach the player more by counting only what the faction knows:
  - wounds on bodies that were found;
  - shots heard, and the sector they came from;
  - reports from survivors and over the radio;
  - tools that were recovered.

  Hiding bodies then becomes counterplay against doctrine as well as within the mission, and doctrine obeys rule 13 by construction.
- **Why it reads as escalation.** The "they just get stronger" reading follows from the design: story ceilings rise through the campaign, and with no global cap several types climb at once. A cap of three, plus a briefing that names the evidence ("three sentries found with head wounds"), should read as a response instead.
- **MGSV's pace is too slow for Sightline.** It uses 5 points per headshot and 100 per level across roughly 50 missions, which is far too slow for 5–7. Sightline should score habit shares per mission, meaning which tendencies dominated, rather than slow absolute accumulation. MGSV's zero-sum tendency table is a good model.
- **Blocks that expire drew complaints.** Three-sortie blocks led to "the helmets came back". In a 5–7 mission operation, a three-mission block is half the campaign. A permanent setback, such as removing a level, is simpler to brief and feels earned.
- **Counters exist even when unstated.** Every MGSV countermeasure leaves one. Guides advise body or leg shots against helmets, day operations defeat NVGs, and cameras can be destroyed. Sightline's design table leaves most counterplay cells blank ("—"), and filling them is the main design debt (section 7).

### Gaps
- The Metal Gear Wiki page couldn't be opened (HTTP 402), so its details come from search snippets only.
- The script was read in IH's repository rather than from a vanilla dump. The read was truncated, and I couldn't confirm where the decay routine is called.
- I found no Kojima Productions talk or postmortem on the system.
- I couldn't confirm whether radio calls or mission briefings announce new countermeasures. Only the iDroid icons are confirmed.
- The in-game text of the deployment missions, and how the three-mission block is shown to players, wasn't verified.

## 2. Memory and adaptation elsewhere: the nemesis system, Alien: Isolation, Left 4 Dead, Resident Evil 4, and other visibly adapting AI

### Takeaway
Shipped designs fall into three groups:
- **Rendered memory:** nemesis scars and dialogue, MGSV's gear, the actions Echo's enemies have learned, Hitman's newspaper.
- **Hidden adjustment that works because nobody notices:** RE4's rank, Dishonored's chaos, Alien: Isolation's director.
- **In-mission answers to repeated tricks:** Alien's unlocks, Arkham Knight's thugs, Sniper Elite's triangulation.

The designs players call fair say what was learned and why. Two designs conflict with Sightline's rule that guards know only what they perceived: directors that know where the player is (Alien) and directors that measure the player's state directly (Left 4 Dead, RE4).

### Cited Findings

#### Nemesis system (Middle-earth: Shadow of Mordor, 2014; Shadow of War, 2017)
- **Patent.** Source: [Google Patents](https://patents.google.com/patent/US10926179B2/en) [P].
  - US10926179B2: priority 26 Mar 2015, filed 25 Mar 2016, granted 23 Feb 2021.
  - Assignee Warner Bros. Inventors include Michael de Plater, Christopher Hoge and Robert Roberts.
  - Every apparent kill or defeat maps to a battle scar, which is shown at the next appearance.
  - A nemesis can recover from defeat or death and return. It can lose weaknesses and gain strengths as it grows.
  - Soldiers are promoted for feats such as killing the player.
  - Encounters are stored as faction event records. They are queued and applied at triggers such as the player's death or entering a new zone.
  - Dialogue is chosen to show memory of the event, and it changes as the character accumulates history.
  - Fit: rendering memory, through scars and taunts, is what made the system famous. Sightline's equivalents are visible gear changes, plus briefing lines and guard barks that cite the incident.
  - Det.: "event records applied at triggers" is doctrine updated only at mission boundaries from recorded events, which is ideal for replay.
- **Monolith interview.** Bob Roberts, design director at Monolith, said that in Mordor the players who played best had the worst time. Dominating left the system no rivalries to build on. Shadow of War made allies fragile through betrayal, a lever the team can pull when the player does too well. The team chose to treat surprising emergent results as features — [Game Developer, 18 Sep 2017](https://www.gamedeveloper.com/design/upgrading-the-nemesis-system-for-i-middle-earth-shadow-of-war-i-) [P, interview]
  - Fit: adaptation fed by the player's failures starves skilled players. Sightline's doctrine feeds on successful habits, which avoids that, but it must not read as punishment for mastery (section 6).
  - Det.: no concern; it is a design-level lesson.
- **Talks.** Chris Hoge gave a GDC 2018 talk, "Helping Players Hate (or Love) Their Nemesis", which I did not review. At DICE 2015, de Plater cited multiplayer rivalry and pro sports as inspirations — [GDC Vault listing (snippet)](https://www.gdcvault.com/play/1025150/contactUs); [PC Gamer (snippet)](https://www.pcgamer.com/shadow-of-mordors-nemesis-system-inspired-by-multiplayer-sports) [S]
- **Patent scope.** Commentary summarises claim 1 this way: an avatar's interaction with one NPC changes the parameters of a second NPC, which then opposes the player. Critics called it very broad, and enforceability is untested — [PatentArcade, Feb 2021 (snippet)](https://www.patentarcade.com/2021/02/warner-brothers-granted-patent-for-nemesis-system-from-middle-earth-video-games.html) [S]
  - Fit: a flag for the owner, not legal advice. A faction that re-equips its soldiers because of how the player dealt with other soldiers may resemble that claim language as summarised. I did not review the claim text.

#### Alien: Isolation (Creative Assembly, 2014)
- **Two layers.** A director always knows where the player is. It periodically sends the alien toward the player's general area, never to the exact spot. The alien must then find the player with its own senses — [Tommy Thompson, Game Developer, 31 Oct 2017](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation) [S; draws on Andy Bray's 2016 nucl.ai talk]
- **Menace gauge.** It fills with proximity, line of sight and motion-tracker closeness, and more slowly if the alien is near but in another room. At its peak the director withdraws the alien backstage into the vents. Designers can tune cooldowns, the time to peak and the maximum number of menaces per sequence. Higher difficulty shortens backstage time and lengthens how long the gauge can stay high — [Thompson 2017](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation); [Thompson, Game Developer, 20 May 2020](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation) [S]
- **Apparent learning.** Sources: [Thompson 2017](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation); [Thompson 2020](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation) [S].
  - The behaviour tree has over 100 nodes, about 30 at the top, and starts with branches locked.
  - Locker searching and vent crawling unlock only after the player repeatedly escapes that way.
  - A flamethrower encounter changes the alien's later approaches.
  - Player deaths never trigger an unlock.
  - Some behaviours unlock at fixed campaign points regardless, so the alien keeps pace.
- **Fairness controls.** Designers can mark areas the alien never searches. According to Bray, the alien teleports only twice in the campaign, both times for cutscenes — [Thompson 2017](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation) [S]
- **Intent and reception.** Gary Napper (gameplay designer) wanted the alien to differ every playthrough, because predictability kills fear. GamesRadar and GameSpot praised the AI. Polygon's reviewer said overexposure eventually turned fear into annoyance. IGN found too much time spent hiding in lockers, and GameSpot criticised the trial-and-error progression — [Wikipedia](https://en.wikipedia.org/wiki/Alien:_Isolation) [S]
  - Fit: the unlocks are the precedent for "repeated tricks lose effect". Campaign-point unlocks are a floor that complements MGSV's ceilings. Polygon's complaint is the failure mode a pacing cap must prevent.
  - Det.: a director that knows the player's position breaks Sightline's rule. An equivalent director may work only from faction knowledge: last known positions and reports. Unlock conditions should count what guards perceived, such as a guard who saw the trick used or found evidence of it.

#### Left 4 Dead (Valve, 2008): the AI Director
- **Source.** Booth, "The AI Systems of Left 4 Dead", the AIIDE 2009 keynote according to the Yannakakis & Togelius bibliography — [Booth slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) [P]; [Yannakakis & Togelius 2018, ref. 60](https://gameaibook.org/book.pdf) [P]
- **Survivor intensity.** Each survivor's intensity rises with damage taken (in proportion), with being incapacitated, with being pulled off a ledge, and with nearby infected deaths (inversely with distance). It decays toward zero over time, but not while infected are engaging that survivor. The director tracks the highest of the four survivors — [Booth slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) [P]
- **Phases.** Source: [Booth slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) [P].
  1. Build Up runs the full threat population until intensity crosses a peak threshold.
  2. Sustain Peak holds it for 3–5 s more.
  3. Peak Fade drops to the minimal population until intensity falls out of the peak range and the fight reaches a natural break.
  4. Relax holds the minimal population for 30–45 s, or until the team has travelled far enough toward the next safe room.

  The minimal population means no wanderers until the team is calm, no mobs and no new special infected, though existing specials may still attack. Boss encounters are exempt from the pacing.
- **Pacing, not difficulty.** In Booth's words: "Algorithm adjusts pacing, not difficulty." Amplitude stays the same, and only frequency changes. Static enemy placement gets memorised, and play degenerates into a race. Hence "structured unpredictability":
  - Mobs arrive every 90–180 s on Normal.
  - Specials spawn in areas the survivors can't see.
  - 75% of mobs come from behind.

  Source: [Booth slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) [P]. A companion GDC 2009 deck also lists adaptive dramatic pacing among the design's mechanics — [Booth, GDC 2009 deck (snippet)](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf) [P]
  - Fit: the phase machine is the template for Sightline's pacing layer: a bounded build-up, a short sustained peak, then an enforced relax. "Pacing, not difficulty" is the right constraint. Doctrine also exists partly to stop players memorising the camps across missions.
  - Det.: Sightline's director should read faction-side state, such as guards committed and alerts open, not the player's health or position. Reading the player's state would leak it into guard behaviour (rule 13) and amount to rubber-banding.

#### Resident Evil 4 (Capcom, 2005): hidden rank
- **Secrecy.** Capcom never disclosed the adjustment, and players didn't notice it for years — [WhatCulture](https://whatculture.com/gaming/8-video-game-moments-you-didnt-realise-were-tricking-you?page=5) [S]. Engadget relayed Mark Brown's explanation that the game quietly adjusts to how well you play — [Engadget, 3 Jun 2015 (snippet)](https://www.engadget.com/2015-06-03-resident-evil-4-difficulty.html) [S]
- **Fan analysis.** It puts the rank at 1–10 with a hidden progress bar. The rank changes damage taken and dealt, critical headshot chance and hitbox sizes — [speedrun.com guide (snippet)](https://www.speedrun.com/re4pc07/guides/qorc9) [C]
- **2023 remake.** A fan overview describes an action score from −5000 to 5000, bounded by the chosen difficulty. Accuracy and the timer don't count — [Reddit mirror (snippet)](https://pol1.lr.ggtyler.dev/r/residentevil4/comments/12myv5i/general_overview_of_difficulty_adjustment_da) [C]
  - Fit: this is the counter-model. It works because it is invisible and because it changes outcomes (damage, hitboxes). Both would wreck Lab A's "testers predict detection 80%" and Lab B's "shot feels earned". Keep anything like it out of Sightline.
  - Det.: a rank kept in state is deterministic, but it would undermine the predictability the honest view promises.

#### Other games that visibly adapt
- **Batman: Arkham Knight (2015).** Thugs can spot Batman crawling through vents and adapt to how he takes them down. Drones can disable vents and detect overuse of Detective Vision — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Batman:_Arkham_Knight); [Gulf News (snippet)](https://gulfnews.com/technology/gaming/batmans-knightmare-is-a-dream-for-fans-1.1575294) [S; the summary didn't say which of these two sources makes each claim]. A guide notes that goons are much more attuned to the player's tricks than in earlier games — [Gamer Guides (snippet)](https://www.gamerguides.com/batman-arkham-knight/gameplay-basics/basics/predator-sequences) [C]. Lower-confidence accounts in the same results add that thugs bunch up when picked off one at a time, mine vantage points after attacks from above, and grenade floor grates after attacks from below (source quality mixed).
  - Fit: the closest precedent for in-mission "repeated tricks lose effect", and, through the regrouping, for "bodies found push guards off exposed lines".
  - Det.: triggers keyed to takedowns the group perceived.
- **Echo (Ultra Ultra, 2017).** While the palace lights are on, everything the player does becomes available to the Echoes after the next blackout. Even running, crouching, opening doors and dropping from ledges count. The palace is blind during blackouts, so actions taken then aren't learned — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Echo_(2017_video_game)); [Twinfinite (snippet)](https://twinfinite.net/?p=308374); [Push Square (snippet)](https://www.pushsquare.com/reviews/ps4/echo) [S]. A post title sums up the premise: shooting the Echoes only teaches them to use guns — [MetaFilter (snippet)](https://metafilter.com/169587/Shooting-them-will-only-teach-them-to-use-a-gun) [C]
  - Fit: the most legible learning design found. The learning window and the learned set are explicit, so players choose what to teach. Sightline's version: the faction learns only from what it witnessed, and the briefing lists what it learned.
  - Det.: the learned set is a plain list in operation state.
- **Hello Neighbor (tinyBuild; full release 8 Dec 2017).** It was marketed on an AI that changes behaviour based on your past actions: bear traps on paths you used, water buckets over doors, cameras where you go often. Reviews were generally unfavourable (Metacritic 38–42), aimed at gameplay, controls and technical problems — [Wikipedia](https://en.wikipedia.org/wiki/Hello_Neighbor) [S]
  - Fit: a cautionary case. Promising "it learns from you" without legible rules invites disappointment. The sources don't single out the AI as the cause.
  - Det.: no concern; it is a design-level lesson.
- **Sniper Elite 3 and 4.** Sources: [Outcyders, SE4 review (snippet)](https://outcyders.net/review/sniper-elite-4-review-shot-through-heart); [bit-tech, SE4 preview (snippet)](https://bit-tech.net/previews/gaming/sniper-elite-4-hands-on-impressions/1); [Sniper Elite III, Wikipedia mirror (snippet)](https://ipfs.ssi.eecc.de/ipns/en.wikipedia-on-ipfs.org/wiki/Sniper_Elite_III); [GamesRadar (snippet)](https://gamesradar.com/sniper-elite-3-takes-wwii-africa-complete-organ-busting-bullet-cam) [S].
  - Enemies triangulate a shooter from several shots fired from the same area, and moving before the next shot defeats it.
  - A ghost silhouette marks the player's last known position, and enemies search around it.
  - Loud environmental noise masks shots.
  - Fit: the in-mission half of "one perch → counter-sniper teams". Count shots heard per sector, and let relocation reset the count. The ghost marker is a good honest-view cue for what the enemy believes.
  - Det.: per-sector counters fed only by what guards heard.
- **Splinter Cell: Chaos Theory (2005).** Each alarm raises enemy awareness. Higher alarm levels make guards put on heavier armour and set up choke points, and Chaos Theory has four alarm stages. Pandora Tomorrow gave guards flak jackets or helmets by alarm level — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Chaos_Theory); [Splinter Cell Wiki (snippet)](https://splintercell.fandom.com/wiki/Alarm) [S/C]
  - Fit: within-mission posture that rises and stays up, shown as gear the player can see.
  - Det.: posture is a discrete level in state.
- **Dishonored (2012).** A hidden chaos value is tracked across the playthrough. Kills raise it and knockouts don't. High chaos brings more guards, more rats and weepers, and a darker ending — [Dishonored Wiki (snippet)](https://dishonored.fandom.com/wiki/Chaos) [C]
  - Fit: cross-mission escalation keyed to lethality, but hidden. Sightline should keep the escalation idea and drop the hiding.
  - Det.: a hidden value in state is still deterministic; the objection is to the hiding, not the arithmetic.
- **Hitman: Blood Money (2006).** Notoriety rises when 47 is caught on camera or seen killing. After each mission, a newspaper article reports what the investigation found. Players can lower notoriety with bribes or a new identity, paid for with money that pays more for clean hits — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Hitman:_Blood_Money) [S]. A guide gives specific prices, such as a police bribe of $100,000 for −40 notoriety — [ludo.guide (snippet)](https://www.ludo.guide/guide/hitman-blood-money/hitman-blood-money-part-26) [C, unverified]
  - Fit: the newspaper is the best precedent for Sightline's briefing, an in-world report of what the enemy knows. Notoriety is also perception-gated: it rests on cameras and witnesses. Bribes are a paid way to set it back.
  - Det.: notoriety derived only from perceived evidence events.

### Inferences
- **Fair designs render memory in the world.** Players accept the ones that show it: scars, helmets, Echo's learned moves, the newspaper. Hidden ones (RE4's rank, Dishonored's chaos, the Alien director) work only while unnoticed, and they clash with Sightline's honest view.
- **The trigger is always noticeable.** Unlocks keyed to repetition (Alien, Arkham Knight, Sniper Elite) are the established in-mission form of "repeated tricks lose effect". In every case the trigger is something the enemy could plausibly have noticed.
- **Doctrine can carry knowledge forward without cheating.** "Suspected perches" from earlier missions enter as briefed knowledge in the MissionSpec and seed each GuardMind at spawn. Smoke and flares on suspected perches then need no knowledge of the player's real position. This is the briefing channel in "the enemy knows only what it perceived or was told in a briefing".

### Gaps
- I did not review the GDC talks themselves (Hoge 2018, or any Creative Assembly GDC talk) or Bray's nucl.ai 2016 talk. The Alien details come from Tommy Thompson's analyses.
- I found no primary source for RE4's rank.
- After the search budget ran out I couldn't look into Assassin's Creed notoriety, Killer Instinct's Shadows or Forza's Drivatars.
- I did not review the nemesis patent's claim text.

## 3. Limits on active countermeasures, announcing them in briefings, and side objectives that set adaptation back

### Takeaway
The closest shipped analogue to "at most three, announced in advance, counterable by side missions" is XCOM 2's Dark Events. Community sources say about three are pending at a time, a choice of guerrilla ops each counters one, and most last a month. MGSV has gear-specific counters (three-sortie dispatch blocks) and constant visibility (the iDroid icons), but no cap. Hitman: Blood Money's newspaper, with paid notoriety reduction, is the best model of an in-world after-action report. Klei shows how to warn about the next escalation without cluttering the screen.

### Cited Findings
- **XCOM 2 (2016) Dark Events.** Guides and players describe how ADVENT prepares Dark Events and how players counter them, mainly through guerrilla ops. Usually three ops are offered, each countering one event, so only one per batch can be stopped. Most events last a month, and hidden ones can be revealed with intel. Players cite a maximum of three pending; one reported 7–8 active over a long campaign — [Gamepressure guide (snippet)](https://www.gamepressure.com/xcom2/dark-events-game-mechanics/z78546); [SegmentNext guide (snippet)](https://segmentnext.com/xcom-2-dark-events-guide-all-dark-events-how-to-counter-tips); [Steam discussion (snippet)](https://steamcommunity.com/app/268500/discussions/0/412446890547022312) [C]. PC Gamer's preview headline framed them as changing the game in unpredictable ways; I didn't read the article body — [PC Gamer](https://www.pcgamer.com/xcom-2s-dark-events-will-change-the-game-in-unpredictable-ways/) [S]
  - Fit: the template for a capped set of announced enemy measures with a side mission that removes one. Dark Events are an enemy strategy layer, not a response to the player's habits; Sightline joins the two.
  - Det.: choosing what to adopt is a deterministic ranking (habit scores with a fixed tie-break) or a draw from a forked stream, and the result goes into the MissionSpec.
- **MGSV.** Gear-specific blocks are offered only while the countermeasure is live, last three sorties, and sit under no global cap. Six threat axes are always visible on the iDroid map — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua) [P]; [Gamer Guides](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/dynamic-difficulty) [C]
  - Fit: copy the gating. For example, offer the antenna-sabotage side objective only when the runner protocol is active. Drop the expiry, or show its countdown in the briefing.
  - Det.: the offer list is a pure function of operation state.
- **Hitman: Blood Money.** The newspaper after each mission reflects the investigation and the player's notoriety, and notoriety can be bought down — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Hitman:_Blood_Money) [S]
  - Fit: briefing intel can be framed as the enemy's after-action report: what they found, and what they now think you do.
  - Det.: generate it only from perceived evidence, so it can never reveal anything the faction couldn't know.
- **Invisible, Inc. (Klei, 2015).** James Lantz (technical designer) explains that Klei replaced 20–30 alarm levels, whose UI was unclear and whose consequences felt unpredictable and random. The new alarm has six full levels, each made of five silent sub-levels. Tooltips warn about the next level, and the effects are discrete and named: at level 2 every firewall rises by one, and at level 3 another patrol enters. The label became SECURITY LEVEL, with extra UI and tutorials — [Game Developer, 1 Jun 2015](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [P]
  - Fit: show the next countermeasure that would be adopted if a habit continues, so doctrine can be planned around, not only suffered. Sub-levels let the briefing say "close to adopting X".
  - Det.: thresholds and sub-levels are integers in operation state.
- **Players need to be told.** Unaided, players don't infer an AI's strategy: in a 22-AI study, strategy recognition was almost nil. Yet priming players with information about adaptation changes what they perceive — [Wetzel & Anderson, Game AI Pro 3](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf) [P]; [Denisova & Cairns 2015](https://www-users.york.ac.uk/~pc530/pubs/Denisova2_CHIPLAY15.pdf) [P]
  - Fit: the briefing isn't decoration. Without it, players will mostly miss doctrine or invent their own story about it. With it, they will attribute what happens to doctrine, so it has to be accurate.

### Inferences
- **A visible cap.** A cap of three is stricter than MGSV (no cap) and close to XCOM 2's batches. A visible three-slot board ("Active doctrine: 1. helmets at the north camp; 2. paired patrols; 3. —") makes the cap legible and gives the player a target: break one slot.
- **Deterministic ranking.**
  - Rank habits by their share of the evidence over the last one or two missions.
  - Adopt the top three above a threshold, breaking ties by a fixed order.
  - Record the reason, meaning the evidence, for the briefing.
- **Durable side objectives.** Prefer a permanent setback (remove a level and the evidence behind it) to a timed block, or show how many missions a block has left. Offer side objectives only against active doctrine, as MGSV does.
- **A forecast line.** An "about to adopt" line, like Klei's next-level tooltip, turns doctrine from punishment after the fact into a forecast the player can plan around.

### Gaps
- There is no primary Firaxis source for Dark Event rules; the counts and durations are community-reported.
- I found no shipped game that caps habit-driven countermeasures and announces them in a briefing, so Sightline's combination may be new. My search was limited, so this is not a firm conclusion.
- I found no data on how players received XCOM 2's Dark Events specifically.

## 4. Pacing directors that keep searches thorough but not swarming

### Takeaway
Directors that keep pressure on without swarming the player share three parts:
- an estimate of pressure;
- phases that force a relax period;
- a coordinator that hands out a few roles or slots.

Searches feel thorough and fair when a coordinator owns a pool of spots, the search stops at a time or iteration limit, and guards stand down at staggered times. Each shipped example also cheats about where the player is somewhere: the Alien director knows it, Welsh adds an "intuition" weight, and The Last of Us uses a 5 m rule. Sightline must rebuild those parts from what guards perceived.

### Cited Findings
- **L4D phases.** Build Up, then Sustain Peak for 3–5 s, then Peak Fade, then Relax for 30–45 s. Relax removes mobs and new specials. The director changes frequency, not amplitude — [Booth slides](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) [P]
  - Fit: the enforced relax window is the key piece for "not swarming".
  - Det.: phases are a small state machine with tick timers.
- **Alien: Isolation.** The menace gauge and backstage withdrawal work as described in section 2. After a disturbance, the alien's search radius shrinks on each pass. When stalking an objective it circles in a ring rather than standing on it. At least 12 designer configurations range from vent-bound to aggressive — [Thompson 2020](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation) [S]
  - Fit: a menace-like gauge can pull searchers back before the player is swamped, if it is built only from faction-side pressure (guards committed, time since last contact).
  - Det.: a scalar in sim.state, updated each tick as rate × dt (rule 17).
- **Rich Welsh, "Looking for Trouble: Making NPCs Search Realistically" (Game AI Pro 2, 2015).** Source: [Welsh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter27_Looking_for_Trouble_Making_NPCs_Search_Realistically.pdf) [P, practitioner].
  - **Two search types.** A cautious search (the guard is alerted but doesn't know the source) ends after the first location is checked. An aggressive search (the target is a known hostile) moves on to phase 2.
  - **Cautious phase 1.** Letting only one NPC investigate lets the player peel targets away. The others lose interest. If the investigator doesn't return in time, a new stimulus at his position draws allies.
  - **Aggressive phase 1.** Cap simultaneous searchers at 2–3 while the rest cover them.
  - **Phase 2.** A search coordinator holds a pool of spots. Each NPC claims a spot, and claimed spots leave the pool. The search ends when the spots run out or a time limit passes. Spots are scored by their distance to the target's estimated position and to the NPC.
  - **Cheats.** A subtle weight toward the player's actual position fakes intuition, and too strong a weight makes the game feel stacked against the player. NPCs also keep knowing the target's position for 2–3 s after losing sight.
  - **Ending.** NPCs should drift back to routine in their own time. Stopping them all at once looks like a hive mind.
  - Fit: this maps almost directly onto "the first rock draws one curious guard; the third draws two guards and a radio report". It is a cautious search with one investigator that escalates to aggressive with two or three, plus the "he didn't come back" stimulus.
  - Det.: the coordinator, spot pool and timers live in sim.state, and limits are counted in ticks or iterations (rule 18). Drop the actual-position weight and the 2–3 s of free knowledge, or replace them with extrapolation from the last seen velocity.
- **Travis McIntosh, "Human Enemy AI in The Last of Us" (Game AI Pro 2, 2015).** Source: [McIntosh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter34_Human_Enemy_AI_in_The_Last_of_Us.pdf) [P, practitioner].
  - **Mostly honest knowledge.** NPCs mostly didn't cheat about the player's position. Perceiving the player creates a timestamped location that is shared with all NPCs. While no NPC perceives the player, that location isn't updated.
  - **Combat cycle.** NPCs surround the player and advance. After 10 s without sight, a single NPC goes to check. If the player is gone, they search.
  - **The 5 m cheat.** In focus tests, that cycle took nearly 2 minutes and felt unresponsive. So they cheated: if the player moved more than 5 m from the believed position, an NPC approached at once. That cut the cycle to about 30 s.
  - **Investigator role.** A distraction makes NPCs request a single Investigator role. The winner checks the spot, and then returns to its script.
  - **Search map.** A grid in which the believed location spreads into neighbouring cells over time. Every cell an NPC can see is cleared each frame.
  - **Combat Coordinator.** It grants the roles Flanker, Approacher, Investigator, StayUpAndAimer and OpportunisticShooter. Only one NPC needs to be shooting at a time, and one ideal Flanker is chosen.
  - Fit: the Investigator role is the curious guard. The search map makes a search thorough using only perceived information. Role caps are the convergence cap.
  - Det.: map diffusion is cellular arithmetic, deterministic with exact or fixed-point steps. Replace the 5 m rule with a time-since-contact timeout, which needs no ground truth.
- **Michael Dawe, "Beyond the Kung-Fu Circle" (Game AI Pro, 2013; Kingdoms of Amalur: Reckoning).** A stage manager hands out up to eight slots around the player. Each creature has a grid weight (for example soldier 4, troll 8), and the total must fit the player's grid capacity (for example 12). A separate attack capacity limits simultaneous attacks. The number and types of attackers allowed can vary with the difficulty level — [Dawe](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter28_Beyond_the_Kung-Fu_Circle_A_Flexible_System_for_Managing_NPC_Attacks.pdf) [P, practitioner]
  - Fit: a weighted convergence budget per incident, in which an officer or marksman costs more than a rifleman, generalises "cap how many guards converge".
  - Det.: process requests in a fixed order (by entity id), never in arrival order from an unordered container.
- **Invisible, Inc. alarm.** The alarm rises when guards are killed and when bodies are found, and also at the end of every turn, whatever the player does. Klei put tension ahead of difficulty and lowered each level's base difficulty to compensate. Lantz admits the alarm still feels unfair to many players, and says fiction, UI and tutorials only partly fixed it — [Lantz 2015](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [P]
  - Fit: this supports Sightline's choice to raise posture only after incidents. A clock-driven rise is the version players call unfair.
  - Det.: posture is a set of discrete levels in state.

### Inferences
- **A deterministic pacing layer for Sightline:**
  - For each disturbance, the incident's alert class sets a budget of weighted slots. Cautious: one investigator, two once the trick has been repeated. Aggressive: two or three searchers plus overwatch.
  - A coordinator owns the search-spot pool, seeded from a grid of last known positions in the style of The Last of Us.
  - After a search closes, a relax window (in the spirit of L4D's 30–45 s) bars new convergence on that area.
  - Searchers stand down at staggered times, with delays drawn from each guard's own stream.
  - Everything reads faction-side state, never the player's health or true position.
- **Two independent knobs.** "Thorough" comes from coverage: the spot pool and the clearing of grid cells. "Not swarming" comes from roles and slots. The Last of Us and Welsh both show that the two can be tuned separately.
- **A measurable target for Lab E.** The Last of Us found that a two-minute search loop felt unresponsive, and its cycle landed near 30 s after tuning. Lab E should measure search duration and set a target, using triggers that are honest about perception.

### Gaps
- I found no primary source on search throttling in Hitman (2016), MGSV or Splinter Cell.
- Three Game AI Pro chapters were found but not read: pacing in Warframe (Brewer), chase in Dishonored 2 (Couvidou) and perception in Splinter Cell: Blacklist (Walsh) — [Game AI Pro index](http://www.gameaipro.com/)

## 5. Research: dynamic difficulty adjustment (Hamlet; flow), player modelling (Yannakakis & Togelius), and whether players notice and like adaptation

### Takeaway
Most DDA research aims at flow, by adjusting supplies or enemy strength out of the player's sight. Its useful lessons for Sightline:
- **Hunicke:** change things off-stage rather than mid-encounter.
- **Chen:** performance metrics such as headshots don't measure experience, so put choices into play instead.
- **Yannakakis & Togelius:** hand-built models of player behaviour over frequent action patterns are a recognised approach.
- **Denisova & Cairns:** expectations drive perception, so players told about adaptation report it even when there is none.
- **Wetzel & Anderson:** players can't infer an AI's strategy or detect its cheating.

### Cited Findings
- **Hunicke & Chapman, "AI for Dynamic Difficulty Adjustment in Games" (2004).** The venue, the AAAI Challenges in Game AI workshop, comes from the standard citation and isn't printed on the PDF. Hamlet was built on Half-Life — [Hamlet PDF](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) [P].
  - **What it watches.** Hamlet watches the supply and demand of inventory. It looks for "flailing": a player repeatedly edging toward a state their means can't handle.
  - **Reactive actions** change entities that are on stage: their accuracy, damage and health. They risk making the game look erratic and breaking the player's suspension of disbelief.
  - **Proactive actions** change entities that are off stage: their type, spawn order, health and the items they carry. Made in the wings, they are less noticeable but harder to evaluate.
  - **Costing.** Each intervention is costed by the player's location, progress, deaths, repeated attempts and past interventions. Intervening the same way every time makes a game feel trivial or repetitive.
  - **Two policies.** A Comfort Zone keeps the player near 50% health, between 25% and 75%. A Discomfort Zone keeps the player at 15–20% health with scarce supplies.
  - **Evaluation.** It was planned with heart-rate monitors.
  - Fit: doctrine between missions is a proactive, off-stage change, the kind least likely to break immersion. In-mission posture changes should be reactive only in-fiction, caused by an incident the guards perceived.
  - Det.: Hamlet-style in-run tuning conflicts with "live play equals its recording" unless it is part of state. Doctrine applied at mission boundaries avoids the problem.
- **Hunicke, "The case for dynamic difficulty adjustment in games" (ACE 2005, pp. 429–433).** The paper exists, but I couldn't obtain its results — [Hunicke CV (snippet)](https://users.cs.northwestern.edu/~hunicke/vitae.html)
- **Jenova Chen, "Flow in Games" (MFA thesis, about 2006; the game flOw).** Source: [Chen thesis](https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf) [P].
  - **Passive DDA.** System-oriented DDA runs a loop: monitor, analyse, adjust. Chen lists four problems with it:
    1. There is no direct data on how the player feels.
    2. Performance doesn't mirror flow. His examples of sampled metrics are total kills, accuracy and headshots.
    3. Assumptions break across audiences.
    4. It bakes in the designers' fixed preferences.
  - **Active DDA.** The alternative gives players a wide range of choices built into play, so they steer their own challenge.
  - Fit: Sightline's doctrine shouldn't be framed or tuned as difficulty, because headshot rate measures neither skill nor fun. Its job is to create choices: keep the habit and pay the tax, switch habits, or run the side objective that sets it back.
- **Yannakakis & Togelius, *Artificial Intelligence and Games* (Springer).** The 2018 edition is available as a free draft dated 26 Jan 2018, and a 2nd edition appeared in 2025. Sources: [2018 book PDF](https://gameaibook.org/book.pdf); [2nd-edition table of contents](https://gameaibook.org/toc/); [book site](https://gameaibook.org/) [P].
  - **Definition.** Player modelling means detecting, predicting and expressing players' cognitive, affective and behavioural patterns. It is distinct from player profiling (static traits) and from opponent modelling.
  - **Behaviour versus experience.** Behaviour is what a player does; experience is how they feel.
  - **Behaviour-modelling tasks.** Imitation, prediction, clustering and association mining. Association mining finds frequent patterns or sequences of actions.
  - **Approaches.** They range from model-based (top-down: theory-driven and hand-crafted) to model-free (bottom-up: data-driven).
  - **Experience-driven PCG.** Experience-driven procedural content generation creates content from the player's previous behaviour.
  - **On L4D.** The book calls Left 4 Dead's director simple and one-dimensional, yet highly effective.
  - **2nd edition.** It adds an ethics chapter with sections on transparency and on adaptation.
  - Fit: doctrine is a model-based behaviour model (hand-authored habit counters mapped to countermeasures) whose output changes content. In the book's terms it is experience-driven PCG at the scale of an operation.
  - Det.: hand-authored integer rules are deterministic and explainable (rule 8). Learned, model-free models would endanger both.
- **Denisova & Cairns, "The Placebo Effect in Digital Games: Phantom Perception of Adaptive Artificial Intelligence" (CHI PLAY 2015, London).** Source: [paper](https://www-users.york.ac.uk/~pc530/pubs/Denisova2_CHIPLAY15.pdf) [P].
  - **Study 1.** 21 players, within-subjects, playing Don't Starve. Being told an "adaptive AI" ran one session raised total immersion from 111.9 to 119.9: F(1,20)=7.88, p=.011, partial η²=.283. Both sessions were in fact identical random worlds.
  - **What players reported.** They described the "AI" placing resources and adjusting monsters. Ten said the game adapted to them and five said it didn't. Only the two with AI expertise were sceptical.
  - **Study 2.** 40 players, between-subjects. Immersion was 124.2 against 116.0: F(1,38)=6.01, p=.019, partial η²=.137. Perceived challenge didn't differ (14.2 against 14.1).
  - **Authors' advice.** Run blind playtests, and discount claims that a sequel's AI is better.
  - Fit: the briefing will strongly shape what players believe doctrine is doing. That helps legibility but risks phantom attribution, so keep briefings truthful and specific. In the Lab A and Lab E exit tests, testers should be blind to whether doctrine or pacing changes are active.
- **Wetzel & Anderson, "What You See Is Not What You Get: Player Perception of AI Opponents" (Game AI Pro 3).** Source: [chapter](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf) [P, practitioner study, small sample].
  - **Setup.** 12 game-design students played a turn-based game against 22 AIs and rated each one.
  - **Difficulty.** All but one AI scored between 3.0 and 3.6 out of 5 on perceived difficulty, whatever its win rate. Perceived difficulty tracked perceived realism.
  - **Strategy recognition.** Almost nil. Only two strategies were spotted by most players: an AI that attacked its own teammates, and one that targeted whatever was nearest the top of the screen.
  - **Randomness.** 83% failed to recognise an AI that chose at random.
  - **Hustling AIs.** AIs that throttled themselves when ahead were rated as hard as the real ones.
  - **Cheating.** Players accused an AI that didn't cheat of cheating. They accused one that cheated in their favour of cheating against them.
  - **Authors' practice.** Their hustling AIs only ever nerfed themselves, because players complain more when an AI does better than usual.
  - Fit: unannounced doctrine would mostly go unnoticed or be misread. Make countermeasures striking and spatial, such as floodlights on the player's old perch or helmets, and name them.
- **Flow theory.** Hamlet adopts Csikszentmihalyi's flow channel: keep the player away from states that are far too hard or far too easy, with challenge rising as skill rises — [Hamlet PDF](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) [P]

### Inferences
- **Different goals, shared lessons.** DDA seeks flow through hidden tuning, while doctrine wants a legible opponent that answers the player. The research still says three useful things:
  - where adaptation should happen: off-stage, between missions;
  - what it shouldn't use: performance as a stand-in for experience;
  - how to evaluate it: blind tests, because expectations change perception.
- **Doctrine as player-chosen challenge.** Sightline's doctrine is closer to Chen's active DDA than to Hamlet's. The player chooses whether to keep a habit and pay for it.

### Gaps
- I couldn't obtain Hunicke's 2005 results.
- I found no controlled study comparing hidden and announced adaptation in an action game, or measuring resentment of cross-mission countermeasures. The search budget ran out before I could look.
- Two leads remain unverified: Smeddinck et al. (CHI 2016) on how difficulty choices are presented, and Constant & Levieux (CHI 2019) on DDA and player confidence.

## 6. What players feel about adaptive AI: fairness, transparency, rubber-banding, and resentment at being punished for a favourite style

### Takeaway
Players resent adaptation that:
- weakens them or invisibly helps their opponents, once they notice (rubber-banding, patronising DDA);
- has unpredictable consequences (Klei's first alarm);
- punishes mastery (Mordor);
- overexposes the same threat (Alien).

They accept or praise adaptation that is in-fiction and legible, such as MGSV's helmets. They also game any tracker they can see, and misread trackers they can't.

### Cited Findings
- **Ernest Adams (14 May 2008).** Many players feel patronised when they find a game going easy on them. They can exploit DDA by playing worse than they are, and racing rubber bands feel absurd. His advice:
  - make the game harder by strengthening the opposition, never by weakening the player;
  - let players turn DDA off;
  - prefer frequent small changes;
  - hide how the evaluation works;
  - remember that DDA can ruin pacing.

  Source: [Game Developer](https://www.gamedeveloper.com/design/the-designer-s-notebook-difficulty-modes-and-dynamic-difficulty-adjustment) [S, expert]
  - Fit: doctrine strengthens the opposition through equipment and procedure, and never weakens the player, so it sits on the right side of Adams's line. His advice to hide the evaluation conflicts with Sightline's transparency. That is acceptable because doctrine isn't trying to go unnoticed, and a player who exploits it ("I'll stop taking headshots") is the intended response.
- **Nic Melder on rubber-banding (Game AI Pro, 2013).** Done well, it goes unnoticed. Done badly, players feel cheated, especially when an AI driving the same car is obviously faster. Turn it off close to the player, and prefer changing driver skill over raw power, because power changes look like cheating — [Melder](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf) [P, practitioner]
  - Fit: the convergence cap must never react to the player's state, such as low health or being in trouble, or it becomes a rubber band. Make it a property of the faction's procedure.
  - Det.: inputs are faction state only.
- **Klei.** The alarm feels unfair to many players. Klei dropped its earlier design because the consequences felt unpredictable and random, which suits a planning-heavy stealth game badly — [Lantz 2015](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [P]
- **Monolith.** The players who played best had the worst time in Mordor — [Roberts 2017](https://www.gamedeveloper.com/design/upgrading-the-nemesis-system-for-i-middle-earth-shadow-of-war-i-) [P]
- **Alien: Isolation.** Critics complained of overexposure to the alien, time spent in lockers and trial and error — [Wikipedia](https://en.wikipedia.org/wiki/Alien:_Isolation) [S]
- **MGSV.** Praise for forced variety, complaints that blocks expire, and players avoiding the tracked action — [Wikipedia](https://en.wikipedia.org/wiki/Metal_Gear_Solid_V:_The_Phantom_Pain) [S]; [Steam (snippet)](https://steamcommunity.com/app/287700/discussions/0/523897653308116986/?ctp=3); [Steam thread, 31 Mar 2019](https://steamcommunity.com/app/287700/discussions/0/1771511442695350520) [C]
- **Misattribution.** Players told to expect adaptation see it where there is none. They accuse fair AIs of cheating and miss cheating in their favour — [Denisova & Cairns 2015](https://www-users.york.ac.uk/~pc530/pubs/Denisova2_CHIPLAY15.pdf); [Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf) [P]
- **RE4.** Its hidden adjustment drew little resentment because players didn't know it existed for years — [WhatCulture](https://whatculture.com/gaming/8-video-game-moments-you-didnt-realise-were-tricking-you?page=5) [S]
  - Fit: invisibility is the only thing that protects hidden DDA. Sightline chose visibility, so the adaptation itself must be defensible.

### Inferences
- **What would cause resentment in Sightline:**
  1. Doctrine that reads as punishment for skill.
  2. Countermeasures with no counter.
  3. Doctrine that seems to know what it couldn't, such as counting headshots on bodies nobody found, or smoking a perch that was never revealed.
  4. The same countermeasure every mission.
- **Mitigations, in the same order:**
  1. Frame doctrine as respect: "Command has issued helmets because of you."
  2. Fill every counterplay cell.
  3. Learn only from evidence, and say which evidence.
  4. Rotate. The cap of three plus decay means a countermeasure lapses once its habit is dropped.
- **Gaming the tracker becomes the point.** Players will game any tracker they can see. In MGSV that showed up as a complaint and an exploit; in Sightline it can be the intended play, provided the briefing lets players see it coming.

### Gaps
- I found no peer-reviewed study specific to cross-mission adaptive countermeasures, or to stealth games.
- I didn't access Sid Meier's GDC 2010 talk on how players perceive fairness.
- The reception evidence for MGSV comes from reviews and forums, not surveys.

## 7. Design lessons: making adaptation visible and plannable, offering counterplay, and avoiding resentment

### Takeaway
Doctrine should:
- learn only from evidence the faction actually has;
- adopt at most three named countermeasures, shaped as equipment or procedure, each with an explicit counter;
- announce what is active and what is coming next;
- let side objectives remove countermeasures durably;
- never touch the player's tools or the guards' perception.

The in-mission pacing layer should be a coordinator on the faction's side that hands out roles and slots. It needs pools of search spots, relax windows and staggered stand-downs. In both systems, everything should be integer state changed only at mission or tick boundaries.

### Cited Findings
- **Learning from perceived evidence.** The Last of Us shares only perceived locations — [McIntosh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter34_Human_Enemy_AI_in_The_Last_of_Us.pdf). Echo learns only while the lights are on — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Echo_(2017_video_game)). Blood Money's notoriety rests on cameras and witnesses — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Hitman:_Blood_Money). By contrast, MGSV counts ground truth — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua)
- **Legibility channels.** MGSV shows iDroid icons on a 0–3 scale — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua). Klei uses next-level tooltips — [Lantz 2015](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-). Hitman uses the newspaper — [Wikipedia (snippet)](https://en.wikipedia.org/wiki/Hitman:_Blood_Money). The nemesis system uses scars and dialogue — [patent](https://patents.google.com/patent/US10926179B2/en)
- **Ceilings and floors.** MGSV caps levels by story rank — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua). Alien unlocks behaviours at campaign points — [Thompson 2017](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation)
- **Durable rollback.** MGSV's blocks expire after three sorties, and players complained about it — [TppRevenge.lua](https://raw.githubusercontent.com/TinManTex/InfiniteHeaven/master/tpp/data1_dat-lua-ih/Assets/tpp/script/lib/TppRevenge.lua); [Steam (snippet)](https://steamcommunity.com/app/287700/discussions/0/523897653308116986/?ctp=3)
- **Strengthen the opposition, never weaken the player** — [Adams 2008](https://www.gamedeveloper.com/design/the-designer-s-notebook-difficulty-modes-and-dynamic-difficulty-adjustment); [Melder](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf)
- **Coordinators and caps** — [Welsh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter27_Looking_for_Trouble_Making_NPCs_Search_Realistically.pdf); [McIntosh](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter34_Human_Enemy_AI_in_The_Last_of_Us.pdf); [Dawe](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter28_Beyond_the_Kung-Fu_Circle_A_Flexible_System_for_Managing_NPC_Attacks.pdf); [Booth](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
- **Testing and perception** — [Denisova & Cairns 2015](https://www-users.york.ac.uk/~pc530/pubs/Denisova2_CHIPLAY15.pdf); [Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf)
- **Player choice over hidden tuning** — [Chen thesis](https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf)

### Inferences
1. **Learn from evidence the faction has.**
   - Headshot rate comes from wounds on bodies that were found.
   - Engagement range comes from shots heard and where bodies lay, reconstructed into suspected perch sectors.
   - Time of day comes from incident timestamps.
   - Tools come from recovered objects and distraction reports.
   - Alarms raised are known directly.

   Evidence is a simulation event, so doctrine is a pure function of the operation's recorded history (rule 5), and hiding bodies is counterplay.
2. **Show doctrine in three places.**
   - The briefing: intel that names its evidence ("two bodies found with head wounds, shot from long range").
   - The world: gear and lights the player can see through the scope (rule 14).
   - A persistent operation board with three slots, like MGSV's icons.
3. **Cap and rank deterministically.** Score each habit by its share of evidence over the last one or two missions. Adopt the top three above a threshold, and break ties by a fixed priority. Show the fourth as "under consideration", like Klei's next-level preview.
4. **Pace for a short campaign.** MGSV's 100-point levels over about 50 missions are too slow for 5–7. Use per-mission tendency increments, as in MGSV's stealth-versus-combat table. Set ceilings by mission index (for example, no doctrine in mission 1 and at most one countermeasure in mission 2), and floors so variety still appears.
5. **Give every countermeasure counterplay.** These suggestions fill the "—" cells in the design table and still need testing in the labs:
   - **Helmets:** shoot body or neck, or wait for moments when helmets are off. MGSV guides advise body or leg shots.
   - **More marksmen:** their posts become intel targets.
   - **Floodlights:** they depend on generators, so sabotaging the backup generator is a natural side objective.
   - **Counter-sniper teams and smoke on suspected perches:** relocate, as in Sniper Elite, and use new perches. Suspected perches come only from past evidence, so unused ground stays safe.
   - **Paired patrols:** wait for the gap in check-ins, or distract one guard.
   - **Pairs investigating noises:** use two-step lures.
   - **Backup radio:** antenna sabotage is already specified.
6. **Make setbacks stick.** Side objectives should set doctrine back durably by subtracting a level and its evidence. Offer them only against active doctrine, as MGSV does. If any block does expire, the briefing shows a countdown.
7. **Never touch player power or guard competence through doctrine.** That includes perception constants and accuracy. Countermeasures are equipment, procedure and staffing only, so Lab A's prediction test stays valid across the whole operation.
8. **In-mission rules.**
   - Posture rises only after perceived incidents, never on a clock (Klei's lesson).
   - Repeated tricks escalate through counters, kept per area and per trick, of what guards perceived (Welsh's cautious-to-aggressive escalation; Alien's unlocks). Telegraph each escalation with an audible radio report.
   - Bodies found in the open set an "exposed lines" flag in the group's mind (compare Arkham Knight's regrouping).
   - The pacing layer allocates weighted slots and roles (Dawe, McIntosh), enforces a relax window (Booth), stands searchers down at staggered times (Welsh), and reads only faction-side state.
9. **Determinism checklist.**
   - Evaluate doctrine at mission end from recorded evidence events.
   - Generate active countermeasures and per-soldier rolls into the MissionSpec through `rng.fork('doctrine')`.
   - Inject guards' briefed knowledge, such as suspected perches, into each GuardMind at spawn.
   - Keep coordinator state, spot pools and search maps in sim.state, processed in entity-id order.
   - Count all limits in ticks or iterations.
   - No director ever reads the player's true position.
10. **Evaluate blind.** In the Lab A and Lab E tests, testers shouldn't know whether doctrine or pacing changes are active (Denisova & Cairns). Also check whether players can name the active doctrine after a mission without the briefing. Wetzel & Anderson predict they mostly can't, which is what justifies the briefing.
11. **Patent check.** Warner Bros.' nemesis patent, as summarised (an avatar's interaction with one NPC changes another NPC's parameters), is broad. It is worth the owner's attention before shipping. This is not legal advice.

### Gaps
- I found no direct precedent for "bodies found in the open push guards off exposed sightlines". Arkham Knight's regrouping is the nearest.
- The numbers suggested above (slot weights, relax windows, thresholds, mission ceilings) are untested starting points for the labs, not findings.
- The web-search budget ran out partway through. That limited follow-up on Assassin's Creed's notoriety system, MGSV developer interviews, Hunicke's 2005 results, studies comparing transparent and hidden DDA, the investigation design of Hitman (2016) and the content of the GDC talks.
