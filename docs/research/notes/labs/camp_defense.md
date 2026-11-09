# Camp defense: how a defended position answers an attacker, and what to build from it

Research notes for Sightline, Nov 8, 2026. They add to `docs/research/labs.md` and `docs/research/notes/labs/guard_and_camp_ai.md` and don't repeat them.

**How far to trust a line.** Every claim carries its source and one of these tags.

| Tag | Meaning |
| --- | --- |
| **[P]** | Primary: official manual or doctrine, a developer's own talk, chapter or Q&A, or shipped source code |
| **[S]** | Secondary: journalism, a review, an analyst's article |
| **[W]** | Weak: guide, fan wiki, forum or Steam post |
| **[snippet]** | Read only through a search engine's summary, because the page refused the fetch or wasn't opened. Treat as less sure than its tier. |

Lines marked **Inference** are mine and rest on the cited lines near them. Numbers marked **computed** are arithmetic of mine.

All text from sources is paraphrased. PDFs were read from their text layers.

## 0. The short answer

A defended position looks intelligent when several loops run at different speeds, people carry them, and each loop can be read and cut.

| Loop | Speed | Who | What it does | Best evidence |
| --- | --- | --- | --- | --- |
| Reflex | 1–2 s | Each man | Gets small, shouts, feels the near miss | [LAMBS `brainReact`](https://github.com/nk3nny/LambsDanger/blob/master/addons/danger/functions/fnc_brainReact.sqf) [P]; [CMBB manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) [P] |
| Drill | 2–30 s | Section | Fixes a direction, suppresses it, covers a move, sends someone round | [LAMBS `tacticsAssess`](https://github.com/nk3nny/LambsDanger/blob/master/addons/danger/functions/fnc_tacticsAssess.sqf) [P]; [FM 3-06.11 ch. 6](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) [P] |
| Command | 30 s to minutes | Officer, operator | Assigns roles, calls fires, sends a relief, fuses reports | [Wanat study](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) [P]; [Days Gone](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf) [P] |
| Adaptation | Minutes to the whole mission | The camp | Hardens, changes posture, remembers | [FM 3-21.8 priority of work](https://boisestate.edu/sps-militaryscience/wp-content/uploads/sites/123/2014/04/work.pdf) [P]; [Invisible, Inc.](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [P] |

Members influence each other through a small set of carriers: a shared estimate of who is winning (Days Gone), a leader's radius (Combat Mission), voice and radio of limited fidelity (LAMBS, ASR), a shared front (Days Gone) and capped roles (Horizon). Each loop has a physical weak point: the caller, the mortar crew, the generator, the observer pair, the officer. That is where the player's cleverness goes.

**Against Sightline's own numbers.** E12 found that a perfect shooter on the best overview drops 8.7 of 9.6 guards. Ordering cover at the first shot made things worse, because guards ran across open ground and the alarm-runners stopped running. After the kill the camp's estimate of the perch was a median 83 m off, and the nearest guard came a median 223 m away (`docs/decisions.md`, One overlook; `docs/phase-1-plan.md`, E12). Section 6 answers those findings directly.

## 1. Real defensive practice

### 1.1 What a unit does about a sniper (FM 3-06.11, ch. 6, the fullest single source found)

All of this is from [FM 3-06.11 ch. 6](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**.

**The envelope.**
- A typical medium-rifle sniper attack is 300–600 m; 800–1,000 m is the exception; heavy rifles reach 1,200–1,500 m, but are only marginally accurate on people.
- Under 300 m a sniper's movements and firing signature are noticeably easier to spot.
- Heavy rifles are valued against snipers because they penetrate building materials.

**What the sniper is trying to do.** The manual lists: defeat the unit; force it to deploy and lose tempo; harass and exhaust it; kill a specific person, often by function (officer, radio operator); or inflict casualties for political effect.

**How the commander decides.** The first choice is between two responses: suppress the sniper and bypass him, or suppress to fix him in place and manoeuvre to close. Rules of engagement then limit what's allowed.

**Active countermeasures.**
- *Observation posts and aerial observers.* Constant watch on likely positions, to catch a sniper moving in. OPs get spotting scopes, binoculars and night optics. Scanning for tiny movements is exhausting, so people should rotate often. But the person who knows the ground best is the one most likely to notice a small change. **That is a real trade-off between relief and familiarity.**
- *Patrols.* Constant, usually small. A sniper caught moving by a small patrol is at a serious disadvantage: little firepower and no support nearby. Routes must vary, and a reaction force or supporting weapons must be ready when a patrol makes contact.
- *Dogs.* They search buildings fast and can detect people at long range when the wind is right.
- *Stay-behind ambush.* A small element travels inside a larger patrol, drops out unobserved, and engages snipers as they move into position.
- *Own snipers.* The manual treats them as effective but scarce, and asks the commander whether a purely reactive role is the best use.
- *Unit weapons.* All light weapons may respond. Direction is often hard to judge, especially from a single shot. Return suppressive fire while manoeuvring to close, knowing a good sniper has already chosen his withdrawal route. Fragmentation rounds such as 40 mm grenades suppress best.
- *Overmatching fire.* Heavy weapons firing back at once. Snipers in Panama (1989) reportedly went quiet under immediate .50-calibre fire; in Somalia, automatic grenade launchers often stopped irregulars.
- *Pre-emptive fires.* Fragmentation fire from mortars and artillery on likely positions, used more in offence; ammunition-hungry, good for short attacks.
- *Projected smoke.* Quick smoke protects a unit that has just been hit. The closer to the sniper it lands, the better, but smoke near the unit still helps if his position is unknown.

**Passive countermeasures.**
- Limit exposure: covered routes, avoid open plazas, stay away from doors and windows, walk at the side of the street, move in shadow, disperse, avoid skylines and lit areas, cross open ground fast, stay crouched or prone behind cover, don't gather in groups.
- Don't advertise rank: no conspicuous badges, no saluting in the open.
- Wear protection; use armoured vehicles.
- Screens and shields: canvas or plastic across dangerous crossings, screens over windows, moveable barriers, rubble-filled drums, sandbags.
- Deny overwatching terrain: occupy it or change it. Pull down hiding places, clear bushes and rubble, brick up windows, pile earth to block sight lines.
- Smoke hazes over broad areas.
- The manual's verdict: passive measures rarely succeed alone, they create a siege mentality, and they hand the initiative to the sniper.

**Discipline and psychology.**
- The sniper has the initiative. Halfhearted countermeasures invite casualties, because snipers can wait hours for a guard to drop.
- Units that take heavy, continual sniper casualties with no way to hit back have historically become enraged and overreacted.

**Snipers' own position rules** (same chapter).
- Avoid obvious spots such as steeples and rooftops, because they get watched and targeted.
- Stay away from heavy traffic.
- A team may use several positions as long as they support each other.
- Mortar and artillery fire can mask an infiltrating element's sounds.

### 1.2 Finding where the shot came from

- **Crack and thump.** A Southampton binaural study of the SA80 found that listeners located all sounds above chance, but the crack carried weaker time and level cues than the thump, and location error rose in the order noise burst, thump, gunshot, crack ([manuscript](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf); [record](https://eprints.soton.ac.uk/397341)) **[P, snippet]**.
- A US Army/NDIA briefing says the crack points at the bullet's path and that soldiers are taught to ignore it and wait for the thump ([NDIA slides](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)) **[S, snippet]**. FM 3-06.11 says direction is often hard to judge, especially from a single shot, and that suppressors make locating a sniper harder ([ch. 6](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf)) **[P]**.
- **Microphone arrays set a floor.** Early Boomerang requirements were shooter direction within ±15° in about a second, against AK-class fire at 50–150 m ([Wikipedia](https://en.wikipedia.org/wiki/Boomerang_%28countermeasure%29); [Machine Design](https://machinedesign.com/news/article/21815008/acoustics-help-troops-pinpoint-snipers)) **[S, snippet]**. Later vendor material claims over 95% detection; its accuracy table was unreadable ([datasheet](https://prd-sc102-cdn.rtx.com/-/media/rtx/our-company/who-we-are/bbn/boomerang/files/boomerang_data.pdf)) **[P, snippet]**.
- **Dummy heads.** From [*Sniping in France*](https://gutenberg.org/files/68964/68964-h/68964-h.htm) (Hesketh-Prichard, 1920; only the first 100,000 characters were read) **[P]**:
  - A papier-mâché head was raised on a stick in a groove between stakes. When it was shot, it was lowered and a periscope fitted at the holes, so the observer looked straight back along the bullet's path.
  - Trials at the First Army Sniping School located **67 of 71** snipers this way (94%, computed).
  - Bullets lodged in a tree and a parapet also gave a line back to a sniper's bush.
  - The [Western Front Association](https://www.westernfrontassociation.com/world-war-i-articles/2008/october/hesketh-vernon-hesketh-prichard-and-the-british-school-of-sniping-on-the-western-front/) adds cigarette-smoking heads, and heads released to mimic a casualty **[S, snippet]**.
- A wargaming group's handbook gives the same drill for players: call it out, hard cover, crack-then-bang, relay the position, don't peek twice from one spot, smoke the route rather than your current spot ([UNITAF](https://future.unitedtaskforce.net/handbook/group/228/counter-sniper-tactics)) **[W]**.

**Inference.** A single listener at ±15° and 300 m misplaces the perch by about 80 m (computed: 300 × tan 15°). Three independent ones fused give about 46 m (computed: 15°/√3). E12's median error of 83 m is therefore about what one honest listener would produce, which suggests the fused estimate isn't gaining much yet. A hit on a decoy would be worth far more than another ear.

### 1.3 Observation posts and watchkeeping

- An OP is a platoon's first layer of security. It gives early warning by direction, distance and size, sits on likely approaches, must have communications, and shouldn't be placed beyond the platoon's small-arms range. OPs may have trip flares, parachute flares and mortar illumination ([FM 3-21.8, ch. 8](https://boisestate.edu/sps-militaryscience/wp-content/uploads/sites/123/2014/04/work.pdf)) **[P]**.
- Manning: at least two per relief, one observing and one recording and reporting, swapping every 20–30 minutes ([Army study guide](https://armystudyguide.com/content/SMCT_CTT_Tasks/Skill_Levels_2_4/0713265705-sl2-establish-.shtml)) **[S, snippet]**. As a guide, OPs are relieved every 2–4 hours ([ACCP IN0201](https://www.globalsecurity.org/military/library/policy/army/accp/in0201/ch2l.htm) or [FM 7-92](https://www.globalsecurity.org/military/library/policy/army/fm/7-92/fm792_6.htm); the search didn't say which) **[P, snippet]**.
- Vigilance falls fast in laboratory watch tasks. Mackworth's work for the RAF found about a 10–15% drop in detections within 30 minutes; reviews put most of the loss in the first 20–35 minutes ([National Academies](https://www.nap.edu/read/2045/chapter/8); [Frontiers review](https://www.frontiersin.org/journals/cognition/articles/10.3389/fcogn.2025.1617561/full)) **[P/S, snippet]**. Applying that to sentries is extrapolation.
- A US Army guide to counter-snipers wants them elevated, with an observer who has binoculars and a link to higher command, and says the partner also steadies the rifleman ([Marksmanship Unit guide](https://archive.org/download/MManuals/CounterSniperGuide_text.pdf)) **[P, old]**.
- WWI British snipers worked in pairs, one shooting and one spotting with a telescope, and their observation logs were valued as intelligence ([*Sniping in France*](https://gutenberg.org/files/68964/68964-h/68964-h.htm)) **[P]**.

### 1.4 Preparing a position: an ordered list

- **Priority of work.** FM 3-21.8 gives an order that keeps security while work proceeds ([ch. 8](https://boisestate.edu/sps-militaryscience/wp-content/uploads/sites/123/2014/04/work.pdf)) **[P]**:
  1. Local security.
  2. Sectors of fire for squads.
  3. Sectors for heavy weapons and medium machine guns.
  4. Sectors for light machine guns, grenadiers and riflemen.
  5. Command post and communications.
  6. Final protective lines and fires.
  7. Clear fields of fire; range cards.
  8. Sector sketches.
  9. Fighting positions, first stage.
  10. Coordinate with neighbours; review sketches.
  11. Mines, then wire and obstacles.
  12. Mark target reference points.
  13. Improve positions; overhead cover.
  14. Supplementary and alternate positions.
  15. Rest plan.
  16. Stockpile ammunition, food and water.
  17. Trenches between positions.
  18. Keep improving; renew camouflage.
- Three levels of preparation exist, by time available: occupy (ready and rehearsed), prepare (marked, caches placed), reconnoitre (planned only) ([same](https://boisestate.edu/sps-militaryscience/wp-content/uploads/sites/123/2014/04/work.pdf)) **[P]**.
- A platoon splits its engagement area into sectors so that targets aren't overkilled ([FM 3-21.8](https://www.marines.mil/Portals/1/Publications/FM%203-21.8%20%20The%20Infantry%20Rifle%20Platoon%20and%20Squad_5.pdf)) **[P, snippet]**.
- A **range card** records left and right limits, target reference points, maximum engagement line, final protective line, and each target's direction, elevation and range ([cadet course page](https://cadettrails.pages.dev/docs/warriortasks/range-cards/)) **[S]**.
- A **target reference point** is a recognisable ground point used to orient and focus fire. **Final protective fires** are a planned last barrier on the most dangerous approach, and a final protective line is where interlocking fire checks an assault ([FM 6-20-50](https://www.globalsecurity.org/military/library/policy/army/fm/6-20-50/Appf.htm); [FM 3-21.71](https://www.globalsecurity.org/military/library/policy/army/fm/3-21-71/ch8.htm)) **[P, snippet]**.
- A single 60 mm mortar's final protective fire covers about 50 × 50 m and may be as close as 60 m to the front ([older Army text](https://tpub.com/sch/26.htm)); another source lists 60 × 30 m ([Wikipedia](https://en.wikipedia.org/wiki/Final_protective_fire)) **[S, snippet]**.

### 1.5 Stand-to

- At Wanat the force was fully awake and in position by 0400, at least 45 minutes before dawn. The study credits this for the fact that every weapon was manned when the attack came, and says dawn was the insurgents' preferred time ([Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf)) **[P]**.
- Apache crews there scheduled their shift change to be ready at dawn, the commonest time for attack (same) **[P]**.
- Canadian doctrine, quoted in a forum, gives one-hour stand-tos centred on first and last light ([army.ca](https://army.ca/forums/threads/food-and-a-little-of-everything-else-at-stalwart-guardian-04.17946/page-5)) **[W]**. I did not retrieve the current US text.

### 1.6 A real timeline: Wanat, July 13, 2008

49 US and 24 Afghan soldiers in a new outpost. Everything below is from the [Army's Wanat study](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) **[P]**.

| Time | Event |
| --- | --- |
| 0400 | Stand-to complete |
| ~0408 | Groups seen on the hillsides; TOW and 120 mm mortar prepared, **and 12 minutes pass** |
| 0420 | Attack opens. The volley goes for crew-served weapons first: TOW destroyed, mortars suppressed, one OP gun suppressed |
| Opening minutes | The six-man mortar section gets off **4 rounds**, then is driven off; a .50-calibre is knocked out inside 5 minutes |
| 0423 | First artillery mission logged; first rounds land **within 6 minutes of the start** |
| 0429–0505 | 52 shells in five missions. Many attackers are too close to engage safely |
| 0430 | Attack helicopters alerted, about 5 minutes after the first call; airborne within 23 minutes; flight about 29 minutes |
| 0430 | Quick reaction platoon alerted; leaves at 0515, delayed loading ammunition; arrives **0601**, half the usual drive time |
| 0523 | First helicopter gun run |
| 0552–0605 | First of two medical helicopters lands |
| 0630 | Fighting at the OP ends. 9 killed and 27 wounded in all |

Further points from the study:
- Attackers used all available dead ground and the buildings around the perimeter.
- The OP became isolated, and keeping contact with it became the commander's main priority.
- When the OP's firing stopped, a squad leader took two men toward it on his own initiative.
- Leaders fell and others kept functioning; the study says each paratrooper acted like an NCO.
- Vehicle-mounted weapons, which survived the first volley, carried the early defence.

Elsewhere, a QRF is generically described as ready in under 15 minutes ([GlobalSecurity](https://www.globalsecurity.org/military/agency/army/qrf.htm)) **[S, snippet]**.

### 1.7 Suppression, measured

- Emeric Daniau's analysis, as reported by a blog, gives the miss distance for a given probability of suppression ([Isegoria](https://www.isegoria.net/?p=45032)) **[S; the original paper wasn't retrieved]**:

| Round | 50% suppression | 90% suppression |
| --- | --- | --- |
| 5.56 mm / .45 ACP | ~3 m | under 0.5 m |
| 7.62 mm | ~6 m | ~0.7 m |
| .50 BMG | ~24 m | ~5 m |

  Area suppressed at 150 m (50%): about 28 m² for .223, 113 m² for 7.62 mm, 1,800 m² for .50.
- Older US work found that near misses combining sight and sound suppress more than sound alone ([DTIC AD0519874](https://apps.dtic.mil/sti/pdfs/AD0519874.pdf)), and ARI related miss distance, rate of fire and a suppression index ([TR-79-A19](https://apps.dtic.mil/sti/pdfs/ADA071116.pdf)) **[P, snippet; numbers not obtained]**.

### 1.8 Casualties

- Tactical Combat Casualty Care's first phase puts the fight first: return fire and take cover, tell or expect the casualty to keep fighting and get himself to cover, and drag him only when tactically feasible ([TCCC guidelines](https://health.mil/Reference-Center/Publications/2015/04/29/Tactical-Combat-Casualty-Care-Guidelines); [WikEM](https://wikem.org/wiki/Care_under_fire)) **[P/S, snippet]**.
- Nothing found addresses sniper bait specifically.

### 1.9 Lone snipers against a position

- A WWI British sniper deliberately showed himself to draw German snipers out, and shot the officer directing them ([*Sniping in France*](https://gutenberg.org/files/68964/68964-h/68964-h.htm)) **[P]**.
- Decoy heads of Sikhs, Gurkhas or Frenchmen suggested different units were in the line, and a ticking mechanical stop in No Man's Land made Germans expect a bomb (same) **[P]**.
- Popular retellings say Carlos Hathcock pinned an enemy company for days by shifting his firing positions and calling artillery, so it thought it faced many men ([The Collector](https://www.thecollector.com/carlos-hathcock-deadliest-marine-sniper-vietnam/); [We Are The Mighty](https://www.wearethemighty.com/articles/marine-american-sniper-vietnam-war)) **[S; accounts disagree on the unit; no official account found]**.

### Inferences for Sightline

- **The trade-off to simulate is familiarity against tiredness.** A fresh observer is less familiar; a familiar one is tired.
- **Passive measures are what stops a ridge, and they have to come before the shot.** That is the E12 failure seen from the other side: cover within 12 m is rarely enough from a ridge, because doctrine's answer is prepared geometry (screens, shields, denied ground), not a reaction.
- **Reaction order matters more than reaction speed.** Wanat's mortar crew got 4 rounds off; its 12 minutes of preparation were pre-empted.
- **Keep Wanat's order, not its minutes.** Local fires first, then air or truck. Compressing it to a mission's length is an owner's pacing call.

### Gaps

- ATP 3-21.8 (2024) and FM 3-21.8's other chapters couldn't be opened, so current wording on stand-to, sector sketches and range cards is unverified.
- FM 3-05.222 and TC 3-22.10 (sniper manuals) wouldn't open. Mortar crew-drill and fire-mission time standards weren't found.
- No current US standard for QRF readiness on a small base was found. CALL's *Commanders' Guide to Snipers* isn't public ([Army](https://www.globalsecurity.org/military/library/news/2009/10/mil-091028-arnews03.htm)).

## 2. Morale and suppression as simulation

| System | State | What feeds it | How it spreads | Visible results | Recovery | Quality |
| --- | --- | --- | --- | --- | --- | --- |
| Combat Mission: Barbarossa to Berlin | 8-step ladder plus a lasting "rattled" flag | Fire, casualties, command, experience, global morale | HQ radius; global morale | Takes cover, disobeys, pins, runs | Faster with leaders; rattled for the rest of the battle | Manual **[P]** |
| Close Combat (1996) | Emotional state plus physical state, per soldier | Casualties, fatigue, fire, poor leadership | Unit cohesion | Dive for cover, ignore orders, break | Panicked men must be rallied | Manual **[P]** |
| Days Gone | 5 levels of confidence | Perceived strength ratio, kills, losses | Allies' confidence counts; panic counts for the enemy | Press, hold, retreat in waves | Kills and losses wane slowly | Chapter **[P]** |
| Company of Heroes | Suppressed, then pinned | Machine guns, some explosions | None described | Crawl, then freeze; can always retreat | Lifts when fire stops | Community **[W]** |
| Arma 3 | Suppression 0–1 | Close rounds | Group courage comes from the leader | Worse aim, smoke, cover | Speed set by courage | Wiki **[P, snippet]** |
| LAMBS Danger | Arma's values plus states | Danger events, group memory | Radio and shout ranges, capped fidelity | Hide, suppress, flank, assault | Timed tactics | Code **[P]** |
| Steel Division 2 | One suppression bar | Fire; more from artillery and flame | Officer nearby | Fewer men fire, then pinned, then surrender | Falls when not under fire | Guide **[W]** |
| Total War | Unit morale | Losses, flanking, general | Routing allies reduce neighbours | Wavering, routing | Rally; "shattered" after a general's death | Manual **[P]**, wiki **[W]** |

**Combat Mission: Barbarossa to Berlin** ([manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**
- Fire suppresses without casualties. Even light fire only moves a unit from OK to Alerted or Cautious, which can be enough to make it re-evaluate.
- Each shot affects an area around the target, so neighbours are suppressed as well.
- The ladder:
  - OK.
  - Alerted (noticed danger, not yet affected).
  - Cautious (reluctant, longer command delay, may replot).
  - Shaken (disobeys when survival is at stake, seeks cover).
  - Pinned (stays down; may finish a move if cover is near).
  - Panicked (runs; player loses control).
  - Broken (longer to recover; runs farther; permanently rattled).
  - Routed (wants off the map).
- *Rattled* is a lasting flag: such a unit panics, surrenders or routs more readily for the rest of the battle.
- How fast a unit falls depends on incoming fire and casualties, whether it's in command, experience and global morale. Green units can cower at the first shot; elite units can withstand heavy barrages.
- *Fanatic* troops don't break. The trait is hidden and drawn per unit from a designer-set chance, so it can't be gamed. Flamethrowers still break them.
- HQs rally subordinates in their command radius and shorten delays. If a platoon HQ dies, its squads are out of command for the rest of the game unless a higher HQ is near.
- Command delay grows with waypoint count, inexperience and being out of command; units still shoot and react during it.
- Tired troops panic faster.
- Off-map fire takes from about 30 s to 10–15 minutes, longer without line of sight. On a **target reference point** it takes as little as 10 s and never more than 1 minute, regardless of line of sight. On-map mortars may fire at one unseen only if they never moved. A first spotting round warns that the barrage is off.

**Close Combat** ([manual, theory](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=3); [realism factors](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=4); [states](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=27)) **[P]**
- Soldiers may change target or dive for cover against orders. Cohesion falls with casualties, and accumulated stress makes men break and run.
- Emotional states: Berserk, Fanatic, Heroic, Stable, Panic (must be rallied), Routed.
- Fatigue, being pinned and low morale all cut accuracy.
- Each soldier has tracked health, suppression and morale state, and rated abilities. A higher Morale rating makes him less likely to panic or be suppressed; a leader's Leadership rating lowers the chance that others on his team break and run ([manual](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=21)) **[P]**. Heavy suppressive fire lowers morale ([manual](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=26)) **[P]**.
- The manual also has Pinned (mostly hides) and Cowering (hides, firing only in desperation) according to a search summary; I couldn't find which page **[P, snippet]**.
- The later *Bloody First* says stress rises from incoming fire, losing leaders, being flanked or ambushed, and bodies around a man; morale recovers with success ([article](https://www.magicgameworld.com/close-combat-the-bloody-first-command-morale/)) **[S]**. The series is widely described as per-soldier ([Wikipedia](https://en.wikipedia.org/wiki/Close_Combat_%28series%29)) **[S, snippet]**.

**Company of Heroes 2**: machine guns suppress (a slow crawl), then pin after a few seconds (no moving or firing, but reduced damage and retreat still possible). A single gun can suppress several squads in its arc, which is why players attack from several directions ([coh2.org](https://www.coh2.org/guides/5732/company-of-heroes-2-basic-concepts-and-glossary)) **[W]**. A Steam Workshop AI's changelog says suppressed and pinned squads count as much less dangerous to the AI ([changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/2942790265?p=7)) **[W, snippet]**.

**Arma 3 (vanilla)**
- `getSuppression` is 0–1. AI aim deteriorates, recovery speed comes from Courage, and suppressed AI may use smoke to hide. Suppression isn't calculated for players ([BI wiki](https://community.bistudio.com/wiki/Arma_3:_Suppression); [`getSuppression`](https://community.bistudio.com/wiki/getSuppression)) **[P, snippet]**.
- A group flees when losses exceed a share of its starting strength set by the leader's courage, and only whole AI-led groups flee ([`allowFleeing`](https://community.bistudio.com/wiki/allowFleeing); [`fleeing`](https://community.bistudio.com/wiki/fleeing)) **[P, snippet]**.

**LAMBS Danger FSM** (read from [source](https://github.com/nk3nny/LambsDanger); GitHub can't identify its licence, so **read for design, don't copy code**) **[P]**
- Its [wiki](https://github.com/nk3nny/LambsDanger/wiki) states a design goal: readable, consistent, clearly communicated behaviour that still varies.
- `brainReact`: on fire, a hit, an explosion or a close bullet, a suppressed man (over 0.5) goes for cover; otherwise he dodges. Timeout about 1.4 s ([source](https://github.com/nk3nny/LambsDanger/blob/master/addons/danger/functions/fnc_brainReact.sqf)).
- [`tacticsAssess`](https://github.com/nk3nny/LambsDanger/blob/master/addons/danger/functions/fnc_tacticsAssess.sqf) is the leader's plan. Key rules:
  - Groups under four often don't plan. The check skips planning with probability 75%, 50% and 25% for 1, 2 and 3 men (computed).
  - **A far, high, poorly known enemy:** over 300 m away, at least 15 m above the leader's eyes, with low knowledge. The plan is drawn from suppress, hide, hide.
  - Enemy far, indoors or fortified: flank, flank, suppress, with extra options by context, and smoke to hide the move.
  - Artillery only if the target is over 220 m away and no friendlies are within 120 m of it.
  - Empty static weapons within 75 m get manned before the plan runs ([`doGroupStaticFind`](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/functions/GroupAction/fnc_doGroupStaticFind.sqf)). Flares go up at night.
  - Tactics start after a delay: attack 1–2 s, hide 1–4 s, suppress 2–4 s, assault 6–14 s, garrison 10–16 s, flank 22–30 s.
- [`doCallArtillery`](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/functions/UnitAction/fnc_doCallArtillery.sqf): the caller, or whoever holds the radio within 150 m, stops for 20 s, kneels or goes prone, and uses binoculars.
- [`doShareInformation`](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/functions/fnc_doShareInformation.sqf) and [settings](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/settings.inc.sqf): default radio 500 m, backpack radio +2,000 m, combat sharing 200 m, shout 100 m. **Shared knowledge is capped at 1.0 on a 0–4 scale.** Second-hand information is low-fidelity by rule.
- [`shouldSuppressPosition`](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/functions/fnc_shouldSuppressPosition.sqf) probes the fire line and refuses if an obstacle stops it short of the target.
- Changelog: the threshold for suppressing while suppressed rose from 0.5 to 0.75 ([Steam](https://steamcommunity.com/sharedfiles/filedetails/changelog/1858075458?p=2)) **[W, snippet]**.

**ASR AI 3**: shared target accuracy depends on the sender's command skill ([changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/642457233)) **[W, snippet]**. **VCOM**: the Reforger port says squads flank, call for help, fall back and regroup ([workshop](https://reforger.armaplatform.com/workshop/6AA71B6947ACE916)) **[W, snippet]**. **ACE3**: the only suppression reference found is a Zeus command to direct AI suppressive fire ([changelog](https://steamcommunity.com/sharedfiles/filedetails/changelog/463939057?p=5)) **[W, snippet]**.

**Steel Division.** Eugen describes the system as modelling soldiers' stress under fire ([Eugen](https://eugensystems.com/?p=2520); [PCGamesN](https://pcgamesn.com/steel-division-normandy-44-stress-mechanic-suppression)) **[P/S, snippet]**. A full bar stops a unit except for retreat. A fully suppressed unit next to an enemy in enemy territory surrenders. Leaders reduce the effect ([GamePressure](https://www.gamepressure.com/steel-division-2/morale-and-surrender/zac6a0)) **[W]**.

**Total War.** A general's presence lifts morale; units that rout after he dies are shattered, and a junior general can't prevent it ([Rome II manual](https://r2enc.totalwar.com/en/manual/single-player/0087_enc_page_battle_play_phase_conflict_morale)) **[P, snippet]**. Routing neighbours are the main driver of chain routs ([wiki](https://forums.totalwar.org/wiki/index.php/MTW_Morale)) **[W, snippet]**. An analyst calls the army-losses penalty a hidden backstop ([ACOUP](https://acoup.blog/2022/07/01/collections-total-generalship-commanding-pre-modern-armies-part-iiic-morale-and-cohesion/comment-page-1/)) **[S, snippet]**.

**Research.** RAND says most US military wargames and simulations omit will to fight or use only minor proxies, and offers a model and an experimental simulation ([RR2341](https://www.rand.org/pubs/research_reports/RR2341.html)) **[S, snippet]**.

### Inferences for Sightline

- **Keep three quantities.** A fast suppression meter that decays in seconds; a slower confidence level that holds for minutes; and a lasting flag for a man who has broken. Each comes from a different shipped model, and they don't substitute for each other.
- **A separate physical channel.** Close Combat's fatigue maps onto Sightline's motor, so tired men panic faster.
- **Hidden traits are a guard against "the system can be gamed".** Combat Mission's fanatics show that a small unseen chance of holding firm stops players from treating morale as a solved equation, but it fights "predict the camp". An owner's call.
- **Leaders are a local radius, not a global switch.** Combat Mission, Close Combat, Steel Division and Total War agree. Wanat is the counter-example: disciplined men replace leaders. Training level should decide how much a leader's death costs.

### Gaps

- No formula or threshold from Close Combat's or Company of Heroes' developers. Combat Mission publishes the ladder, not the numbers.
- Graviteam, Men of War, Brothers in Arms (only the [red-to-grey suppression marker](https://en.wikipedia.org/wiki/Brothers_in_Arms:_Road_to_Hill_30) was confirmed **[S, snippet]**), and XCOM's panic weren't researched further.

## 3. Games where the camp fights a sniper or lone assaulter

### Sniper Ghost Warrior Contracts and Contracts 2

**What exists**
- A base goes on alert after a few kills, but enemies without visual confirmation mostly sit behind cover; once one spots you, the whole base knows ([New Game Network](https://www.newgamenetwork.com/article/2246/sniper-ghost-warrior-contracts-review/)) **[S, snippet]**.
- Mortars exist. A review describes one opening up from a sandbag fort ([Bloody Disgusting](https://bloody-disgusting.com/reviews/3595929/review-sniper-ghost-warrior-contracts-tragic-misfire/)) **[S, snippet]**.
- A guide says to silence the crew first and move a few dozen metres once discovered, to avoid the shell ([GamePressure](https://www.gamepressure.com/sniper-ghost-warrior-contracts/arakchayev-fortress-walkthrough/zacdc0)) **[W]**.
- Contracts 2 puts a sniper on each jammer tower; each jammer must be switched off by hand, and enemies may arrive in waves during sabotage ([GamePressure](https://www.gamepressure.com/sniper-ghost-warrior-contracts-2/mount-kuamar/z7e9b7)) **[W]**.
- Automatic turrets can be stopped with shots at the barrel, and a jammer blocks enemy marking until destroyed ([GamePressure](https://www.gamepressure.com/sniper-ghost-warrior-contracts/arakchayev-fortress-walkthrough/zacdc0)) **[W]**.
- Searching enemies check your last position and a small area around it ([GamePressure](https://www.gamepressure.com/sniper-ghost-warrior-contracts-2/i-was-exposed-what-should-i-do/z4e91e)) **[W]**.

**Felt cheap or dumb.** Reviews repeatedly call the AI weak or inconsistent while praising the maps and sniping ([PC Gamer](https://www.pcgamer.com/sniper-ghost-warrior-contracts-2-review); [COGconnected](https://cogconnected.com/review/sniper-ghost-warrior-contracts-2-review/)) **[S, snippet; attribution within the set not verified]**.

**Counter.** Remove snipers first; relocate after a shot; clear the jammer's guards ([GamePressure](https://www.gamepressure.com/sniper-ghost-warrior-contracts/arakchayev-fortress-walkthrough/zacdc0)) **[W]**.

### Sniper Elite 4 and 5

**What exists**
- *Developer:* soldiers track their squadmates, grow more aggressive with an officer present, and fall back to defensive cover if he's killed. A soldier who finds a body may report it, setting off a chain reaction ([Rebellion Q&A](https://www.tech-gaming.com/qa-sniper-elite-4s-rebellion-developments/)) **[P]**.
- *Specialists:* a radio operator calls reinforcements; a spotter fires a flare to bring artillery on your position ([Gaming Pastime](https://gamingpastime.com/sniper-elite-4-pc-review/)) **[S, snippet]**. The flare lands a strike about 10 s later ([achievement guides](https://www.gamepressure.com/sniper-elite-4/fire-and-brimestone/z698b3)) **[W, snippet]**.
- *Sniper Elite 5:* alarm panels; enemies run for them (from a search summary across several reviews such as [GameChronicles](https://gamechronicles.com/sniper-elite-5-review-playstation-5); which review said it wasn't verified) **[S, snippet]**.

**Enemy snipers and glint [W]**
- Enemy snipers reveal themselves with a glint ([TV Tropes](https://www.tvtropes.org/pmwiki/pmwiki.php/Main/SniperScopeGlint); [fan wiki](https://sniperelite.fandom.com/wiki/Enemy_Snipers)).
- Later games add sound: in Sniper Elite 5, a first cue means he has seen you and a second means he's about to fire (same; player-written sources).
- Binoculars don't glint, so scout with them ([GamerGuides](https://gamerguides.com/sniper-elite-5/guide/basics/gameplay/how-to-use-binoculars)).

**Felt intelligent.** A reviewer says the AI watches its own back well (search summary across reviews including [DSOGaming](https://www.dsogaming.com/special/reviews/sniper-elite-5-pc-review/); which review said it wasn't verified) **[S, snippet]**.

**Felt cheap or dumb.**
- Enemies who spot you through cover and bushes, or can seem to know where you are (same set) **[S, snippet]**.
- TheSixthAxis calls investigation one-dimensional, with unnatural switching between actions, and the AI rigid and easily exploited ([review](https://thesixthaxis.com/2022/05/25/sniper-elite-5-review)) **[S]**.
- PC Gamer found offline AI slightly dim next to the human invader ([PC Gamer](https://www.pcgamer.com/uk/sniper-elite-5-review)) **[S, snippet]**.

### Ghost Recon Wildlands and Breakpoint

**What exists**
- Breakpoint dropped Wildlands' fixed alarms for one enemy who calls for help; killing him prevents the call, and there's a short window after he's alerted ([New Game Network](https://www.newgamenetwork.com/article/2219/ghost-recon-breakpoint-review/); [Stevivor](https://stevivor.com/reviews/ghost-recon-breakpoint-review-progress-job/); search summary, so which review said which wasn't verified) **[S, snippet]**.
- Ubisoft says disabling a camp's generator shuts down lights, mortars and automated turrets, and that detection range grows with how many enemies are alerted ([developer Q&A](https://ghost-recon.ubisoft.com/game/en-ca/news-updates/2S1mCyksqVAnCVkRlixsFR/tom-clancys-ghost-recon-breakpoint-developer-qa-stealth-gameplay)) **[P, snippet; the page has moved]**.
- A later patch lengthened detection time and delayed how quickly enemies radio ([patch notes](https://devtrackers.gg/ghost-recon-wildlands/p/b7104cde-tom-clancy-s-ghost-recon-breakpoint-patch-notes-title-update-3-0-3)) **[P, snippet]**.
- In Wildlands, pulling a generator's lever stops the alarm, the lights, the drone jammer and AA. Destroying it is loud and draws soldiers ([GamePressure](https://www.gamepressure.com/ghost-recon-wildlands/how-to-cut-off-the-power-supply/zb9954)) **[W]**.

**Felt dumb.**
- Alerted enemies arrive uncoordinated, one or two at a time ([reviews](https://www.newgamenetwork.com/article/2219/ghost-recon-breakpoint-review/)) **[S, snippet]**.
- Wildlands players complain about reinforcements appearing from nowhere and guards not noticing nearby kills ([Steam](https://steamcommunity.com/app/460930/discussions/0/3211505894125176143)) **[W, snippet]**.

### Metal Gear Solid V

(Revenge ledger already covered; only the additions.)
- The revenge tiers include covert countermeasures (decoys, mines, cameras) and combat tiers (shields, armour, stronger guns) ([Metal Gear Wiki](https://metalgear.fandom.com/wiki/Revenge_System_%28enemy_preparedness%29); [Steam guide](https://steamcommunity.com/app/287700/discussions/0/4520009413786712767)) **[W, snippet]**.
- A separate icon tracks preparedness against sniping (same) **[W, snippet]**.
- **No source mentions mortars in MGSV.**

### Far Cry outposts

- Scout from a height, tag, then choose stealth, assault or mines and a hilltop rifle; alarms are the tension, and disabling one by hand can shut down the rest ([Twinfinite](https://twinfinite.net/pc/5-steps-to-easily-dominate-outposts-in-far-cry-4/4/); [GamerGuides](https://gamerguides.com/far-cry-3/guide/introduction/gameplay/outposts); [level-design note](https://williamliugames.notion.site/Far-Cry-Level-Design-1edc4c5718c48072b4f1f6d6289f8bf3)) **[W]**.
- Far Cry 6 found players rarely finished outposts stealthily and playtesters called failures unfair. Fixes: footsteps prompt investigation instead of hostility; stationary guards make noise; a one-second window before a guard raises his weapon; adjust detection speed rather than range; the guard who spotted you is the one who raises the alarm; a delay before suspicion decays, because players were oscillating the meter at a guard's personal-space edge ([Ubisoft](https://news.ubisoft.com/en-us/article/1coXQaIzFcbrESiapwUQJK/improving-stealth-in-far-cry-6)) **[P]**.

### The Division 1 and 2

- Nine archetypes: Assault, Rusher, Tank, Sniper, Thrower, Support (heals), Heavy (suppresses), Leader (buffs nearby), Controller (fights through a turret). They interlock: tanks and heavies pin you while throwers flush you out ([Game Developer](https://www.gamedeveloper.com/design/enemy-ai-design-in-tom-clancy-s-the-division)) **[S, relaying a GDC talk]**.
- Profiles tune reaction time, group behaviour, cover use, suppression resistance and more. Elite lasers are purely cosmetic, yet make players nervous (same) **[S]**.
- Division 2 gives factions Aggression, Training and Tech traits. Trained factions keep cover fire and flanking; untrained ones barely flank. Weak points are tied to equipment ([Game Developer](https://www.gamedeveloper.com/design/designing-the-enemy-ai-of-the-division-2)) **[S]**.

### Far Cry 2 (medics)

- Enemies carry injured comrades as buddies carry you ([GamesRadar preview](https://www.gamesradar.com/far-cry-2-will-make-you-a-metaphorical-monster)) **[S, snippet]**. Store text is reported as saying medics drag the wounded to safety (a search summary; the store page opened behind an age gate).
- Players disagree on how often it happens ([forum](https://forums.overclockers.co.uk/threads/far-cry-2-wounding-enemy-soldiers.17938819)) **[W, snippet]**.

### Inferences

- **Praise goes to physical, named things.** Specialists, generators, alarms, one caller. **Complaints go to knowledge the player can't explain** and to enemies arriving one at a time. That fits Rule 13: honest knowledge is a differentiator.
- **Glint plus a two-stage warning** would give Sightline's marksmen a read the player can act on, but only forums document it.

### Gaps

- No developer source for how Sniper Ghost Warrior, Wildlands, Far Cry or MGSV decide reinforcements, mortars or counter-snipers.
- Enemy counter-sniper behaviour in Contracts is documented only by walkthroughs.

## 4. Squad and group architecture for mutual influence

### Days Gone (Karlsson, Game AI Pro Online 2021): the best single model found

[Chapter](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf) **[P]**

**Structure.** A squad is a full AI entity whose job is coordination. It decides the collective aim, each member's role and where. A role is a packaged sub-behaviour slotted into the individual's hierarchy, so higher-priority behaviour still pre-empts it. New roles need no edits to existing behaviours. Squads form by distance and merge and split dynamically.

**Confidence.**
- Five levels: panicked, worried, neutral, confident, heroic. A squad's level is the mean of its members', rounded toward neutral.
- Each AI computes friendly strength against enemy strength, each side summing perceived strengths.
- A unit's strength is multiplied by armour, weapon, wound and suppression. It's also scaled by the other men's confidence, but not the AI's own.
- The strength of enemies the squad has killed is added to the friendly side; friends lost are added to the enemy side. Both wane over a period much longer than a fight, so a squad that lost men earlier stays nervous.
- **A panicked character's strength is added to the enemy's side**, which is why panic spreads.
- The calculation settles after a few updates. Confidence is never computed with no enemy present.
- Against the player they add factors on purpose. A stationary player raises AI confidence over time, faster if hiding in cover. Charging, melee and being the aim-assist target lower it.

**Frontline.**
- A shared construct: direction of combat (squad centre to enemy centre), a closest line, a width, a Neutral Area the squad shouldn't enter, and the enemy-controlled area. Close mode pulls the squad along with the enemy; far mode holds it in place.
- **Lanes** divide the front's width by squad size and are assigned to minimise movement, so men spread out and keep the direction readable.
- Four states: form up, normal, retreat, press. **Retreat at worried or lower, press at confident or higher.**
- Retreat goes in waves: half move, half cover fire. Those nearest the front or without cover go first.
- Flankers are chosen from the ends. **Flankers always leave an opening at the rear.**
- Snipers and rushers aren't squad members and don't count toward the front. Snipers are kept to perches.
- Stability techniques: a threshold on updates; an adaptive rate that moves faster when the change is large; flankers leave a static "ghost" in the front's centre of mass.
- Enemy flankers are deliberately ignored for a set time, so a good flank pays off.

**Designer markup.**
- *Defend Zones:* outside the zone, confidence ticks down by a binding strength, so a chase runs out of nerve and returns.
- *Home Areas:* the front is oriented with home at its back. If pushed into home, or if the enemy is between the squad and home, the squad may not retreat.
- *Fortification Zones:* a directional Kill Zone paired with a position to hold.

### Horizon Zero Dawn: group agents and role caps

[Game Developer](https://www.gamedeveloper.com/design/behind-the-ai-of-horizon-zero-dawn-part-1-) **[S, relaying Guerrilla]**
- Individuals and herds are both agents. The group agent has no body, holds a blackboard (safe areas, patrol routes), and assigns roles with **a cap per role**.
- Under threat, roles rebalance: some flee, others fight.
- It isn't a hive mind. Group data doesn't update each tick, so a machine can die without the group learning unless the attack was spotted or the target survives.
- Watchers scout and warn.

### Killzone 3: orders down, reports up

[Chapter](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter29_Hierarchical_AI_for_Multiplayer_Bots_in_Killzone_3.pdf) **[P]**
- Commander, squad and bot layers. Orders go down; information and failure reports come up. Squads report imminent failure when decimated.
- Bots keep autonomy and may ignore an order to survive. They use the same position-picking as single-player, and predict the most likely hiding spots of a hidden threat.
- Each faction has an influence value per strategic area, from bots present and recent deaths, smoothed in distance and time.
- Objectives have a weight and an optimal number of bots.

### Other parts worth having

- **[Modular Tactical Influence Maps](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf) (Dave Mark)** **[P]**. Proximity and threat maps per faction, made from pre-computed stamps. A ranged threat is a **ring around the unit**, not a disc. Line-of-sight threats simply don't spread to unseen cells.
- **[Tactical Position Selection](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter26_Tactical_Position_Selection.pdf) (Matthew Jack, CryEngine)** **[P]**. Generation, then Conditions, then Weights, in a small data language whose keywords compose (criterion, object).
- **[Beyond the Kung-Fu Circle](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter28_Beyond_the_Kung-Fu_Circle_A_Flexible_System_for_Managing_NPC_Attacks.pdf) (Michael Dawe)** **[P]**. Separate budgets for how many attackers and how heavy their attacks. A central stage manager holds all spatial reasoning.
- **[Hierarchical Plan-Space Planning](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter13_Hierarchical_Plan-Space_Planning_for_Multi-unit_Combat_Maneuvers.pdf) (van der Sterren)** **[P]**. Says single-unit planners don't suit multiple units. Plans are searched as partial task graphs, with coordination and precedence explicit ("the attack can't start until all form-ups finish").
- **[Dishonored 2's chase flood](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter06_Flooding_the_Influence_Map_for_Chase_in_Dishonored_2.pdf) (Couvidou)** **[P]**.
  - Breadcrumbs felt omniscient; dead reckoning gave up at the first wall.
  - The fix seeds heat at the last position and a barrier behind the target, floods a fixed number of steps, stops if too many cells ignite in one step, and takes the warm-weighted centroid as the chase point.
  - It stops early in open ground (switch to slow search) and runs on in corridors.

### Inference: how the pieces could combine in Sightline

- Keep the commander's Objectives layer from the existing research; add a **section** layer as in Days Gone, formed by distance, with confidence and a front.
- Treat confidence as a mind-only quantity. "Enemy strength" must be believed, from reports and shots heard, never the player's real state (Rule 13).
- Iterate confidence in guard-id order over two passes rather than to convergence (Rules 2, 18).
- The role as a packaged sub-behaviour matches `orders.ts` and Rule 13's split: the role is an order, and self-preservation pre-empts it.
- The Frontline's axis comes from the camp's believed shot bearing. It can carry both the lanes and the leash.
- A multi-unit planner is overkill at this scale. Take van der Sterren's precedence ("suppress, then flank") as a two-field task record instead.

### Gaps

- The Division's "who shoots now" system isn't described anywhere public that I found.
- Killzone 3 is multiplayer bots, not a defending camp.

## 5. The player's side: outsmarting versus exploiting

**Evidence**

- **Tougher reads as smarter.** Halo's playtests: with weak enemies 8% called them very intelligent and 20% not intelligent; with tough enemies 43% very intelligent and 0% not. Difficulty ratings also improved: 52% to 92% said "about right" ([Butcher & Griesemer, GDC 2002](https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf)) **[P]**. Survival time buys time for the AI to be seen doing things.
- **Halo's model of the player's experience** ([same](https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf); [notes](https://halo.bungie.org/misc/gdc.2002.haloai/talk.html?page=6)) **[P]**:
  - To be *fooled* an enemy needs limited knowledge and predictable reactions.
  - To be *thwarted* it needs a breaking point: terror, berserk, retreat or a defensive state.
  - Avoid subtlety.
  - Discourage boring tactics and reward experiments.
  - Allow extra abilities only when recognisable and predictable.
- **Letting cleverness work.** Days Gone delays reaction to a flank, always leaves a rear exit, and makes the AI pressure a passive player and yield to an active one, explicitly to encourage movement ([chapter](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf)) **[P]**.
- **Time pressure from planning.** Invisible, Inc. uses an alarm from 0 to 6 that rises with kills, bodies found and each turn. The first version had 20–30 levels and read as random; six levels with five silent steps each read clearly. At level 3 a new patrol enters. Designers say no starting situation is hard on its own: the pressure comes from mid-term planning. Many players still felt it unfair, because of expectations from other stealth games ([Lantz](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-)) **[P]**.
- **Single physical points.** Breakpoint's generator, Wildlands' lever, Far Cry 6's EMP: each is a thing you can reach and cut ([Q&A](https://ghost-recon.ubisoft.com/game/en-ca/news-updates/2S1mCyksqVAnCVkRlixsFR/tom-clancys-ghost-recon-breakpoint-developer-qa-stealth-gameplay) **[P, snippet]**; [GamePressure](https://www.gamepressure.com/ghost-recon-wildlands/how-to-cut-off-the-power-supply/zb9954) **[W]**; [Ubisoft](https://news.ubisoft.com/en-us/article/1coXQaIzFcbrESiapwUQJK/improving-stealth-in-far-cry-6) **[P]**).
- **AI as entertainment.** Ubisoft's AI leads say that AI exists to entertain rather than to find a solution ([Game Developer](https://gamedeveloper.com/programming/understanding-the-ai-design-behind-ubisoft-s-biggest-games)) **[S]**. Days Gone says the same in nearly those terms, preferring good-looking combat to the most effective behaviour.
- **Qualitative differences between enemies.** Harvey Smith's "orthogonal unit differentiation" (units that differ in kind, not amount) is the classic statement, seen only through secondary descriptions ([pattern wiki](https://math.vu.nl/~eliens/demo/pattern-orthogonalunitdifferentiation.html); [Ludism](https://ludism.org/gamedesign/OrthogonalElements)) **[W, snippet]**.

**What a real lone sniper's playbook adds** ([FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf); [Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf); [*Sniping in France*](https://gutenberg.org/files/68964/68964-h/68964-h.htm)) **[P]**:
- Choose the withdrawal route before the first shot.
- Stay 300–600 m out.
- Hit crew-served weapons first.
- Use dead ground.
- Isolate a post so the commander has to deal with it.
- Force the unit to deploy and lose tempo.
- Reveal yourself on purpose to draw the hunter.
- Use their own mortar fire to mask your sound.

**Inference: what makes it feel like outsmarting**

1. The camp's response follows from something the player did, and the debrief can say so.
2. The responses are predictable in kind, so a plan can be built on them.
3. The camp is good enough to survive being looked at (Halo).
4. Something can be cut, and the cut is visible.
5. Time is the enemy, in stages that can be counted (Invisible, Inc.).
6. The camp has a limit it can be pushed past, and pushing it has consequences, such as cornering a squad at home.

### Gaps

- No study was found comparing "outsmarted" and "exploited" directly. I found no player research on it.
- Mimimi's material on interlocking guards wasn't confirmed: a [Shadow Tactics write-up](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-detection-in-i-shadow-tactics-i-) and the [postmortem](https://gdcvault.com/play/1025239/-Shadow-Tactics-Postmortem-Commandos) exist but weren't opened.

## 6. What to build, ranked by usefulness to Sightline

The existing plan already covers a marksman's tower, triangulation, sweeps, glint, alarm boxes, radio, check-ins and reinforcement trucks. These add to it.

### 1. Shared confidence

- **In play.** Two quick visible kills and a section falls back in alternating waves, half covering. One calm sergeant pulls it together. A stationary shooter makes them bolder.
- **Counter.** Kill where others can see; split them; don't corner them at home, where they stop retreating.
- **Sources.** [Days Gone](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf) **[P]**.
- **Build.** Integer level per guard in the mind; friendly and enemy sums from what the guard knows. Believed enemy strength comes from shots heard per minute and casualties reported. "Stationary" comes from repeated fixes from one bearing, never from the player's position (Rule 13). Two ordered passes per update. Slow waning is a rate × dt (Rule 17).
- **Test.** Scene: same casualties seen against unseen must change a section's confidence; a panicked man's removal changes the rest.

### 2. Suppression, confidence, rattled: three clocks

- **In play.** A near miss sends a man down for seconds even if it hits nothing. You can deliberately miss to stop a runner. A man who has broken stays brittle for the mission.
- **Counter.** Conscripts fold first, veterans less, and a hidden fanatic may not.
- **Sources.** [CMBB manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Close Combat](https://www.manualsdir.com/manuals/124140/microsoft-close-combat.html?page=27) **[P]**; [Daniau via Isegoria](https://www.isegoria.net/?p=45032) **[S]**.
- **Build.** A near-miss percept from B's crack; suppression 0–1 with decay; effects as Lab A range and aim multipliers. Each man's bar in the debug view (Rule 8). Whether the player has a suppression meter too is a taste call.
- **Test.** Inputs to outputs in a scene; every effect reversible on decay; `tests/state.test.ts` covers the leaves.

### 3. A first-shot drill by role

- **In play.** The first shot: men in the open drop where they are, or reach defilade only if it's within a couple of seconds. Callers and alarm-runners keep going. Within 2–4 s a gunner rakes the believed ridge. After 22–30 s two men peel off.
- **Counter.** Be off the bearing when the fire lands; ambush the two; use the noise to mask your move.
- **Sources.** [LAMBS](https://github.com/nk3nny/LambsDanger/blob/master/addons/danger/functions/fnc_tacticsAssess.sqf) **[P]**; [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Days Gone](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf) (roles pre-empted only by higher priorities) **[P]**.
- **Why this form.** It addresses E12 directly: the whole-camp cover order failed because guards crossed open ground and runners stopped running.
- **Build.** A `drill` skill, its delays through `ctx.schedule`, a suppress order against the search ellipse, and the role as an order that drill doesn't cancel. LAMBS picks one plan per assessment; running suppression and a flank together is my proposal.
- **Test.** Re-run the E12 overlook benches.

### 4. Observer pairs that tire

- **In play.** A pair on an overlook, one scanning, one writing. Their sight falls with time on watch. Relief walks are visible. They spot what's changed.
- **Counter.** Shoot at changeover; take the watcher first; approach under 300 m only with great care.
- **Sources.** [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Army study guide](https://armystudyguide.com/content/SMCT_CTT_Tasks/Skill_Levels_2_4/0713265705-sl2-establish-.shtml) **[S, snippet]**; [Mackworth, reviewed](https://www.nap.edu/read/2045/chapter/8) **[P, snippet]**; [Hesketh-Prichard](https://gutenberg.org/files/68964/68964-h/68964-h.htm) **[P]**.
- **Build.** Reliefs are a routine, a pure function of time (Rule 3). A `vigilance` factor enters Lab A's meter as a range multiplier, and has to stay predictable for A's exit test.

### 5. Decoys that buy a bearing

- **In play.** A guard lifts a dummy head above a parapet. Hit it and the camp gets a near-exact line, and the mortar or marksman turns.
- **Counter.** Watch whether it ever shifts; don't answer; if you must, relocate immediately.
- **Sources.** [Hesketh-Prichard, 67 of 71](https://gutenberg.org/files/68964/68964-h/68964-h.htm) **[P]**.
- **Build.** A decoy entity with a body shape. When hit, the ray enters the commander's fusion as a bearing with small error. It must look different when watched, as Rule 14 implies.
- **Test.** Calibration bench: ellipse before and after a decoy hit.

### 6. Stay-behind ambush

- **In play.** Six men go down the treeline and four come back. Two lie up where a sniper would crawl in.
- **Counter.** Count them.
- **Sources.** [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**.
- **Build.** A commander task with a capacity of two, positions from Lab D's perch table.

### 7. Registered fires and a mortar crew

- **In play.** The camp has plotted the likely perches. A mortar lands on those within 10–60 s of a call, preceded by a spotting round; elsewhere it takes minutes and needs an observer in sight.
- **Counter.** Read the plot markers; avoid the obvious perch; hit the crew first; use its fire to mask your movement. Cutting the generator may cut it too.
- **Sources.** [CMBB manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) **[P]**; [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Breakpoint Q&A](https://ghost-recon.ubisoft.com/game/en-ca/news-updates/2S1mCyksqVAnCVkRlixsFR/tom-clancys-ghost-recon-breakpoint-developer-qa-stealth-gameplay) **[P, snippet]**.
- **Build.** Generated list of reference points in the site frame (Rule 15). A fire mission is scheduled with delay from tuning (Rules 4, 12).
- **Owner's call.** Whether a mortar belongs in the setting at all.

### 8. Hardening as a work list

- **In play.** Time buys the camp fewer good lanes: posts manned, sectors set, canvas screens across exposed crossings, sandbags, cut brush.
- **Counter.** Speed; shoot the working party; find the angle they haven't covered. A camp that only hardens has given up the initiative.
- **Sources.** [FM 3-21.8](https://boisestate.edu/sps-militaryscience/wp-content/uploads/sites/123/2014/04/work.pdf) **[P]**; [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Invisible, Inc.](https://www.gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) for a small count of clear stages **[P]**.
- **Build.** A camp-level index into a tuned task list, with durations and capacities. Screens are solids through `Solids`, never moved into a body (Rule 10).

### 9. Stand-to

- **In play.** Around first and last light everyone stands at his post looking outward.
- **Counter.** Use it as recon, to see every position; strike afterwards, when they stand down.
- **Sources.** [Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) **[P]**; [timing, forum](https://army.ca/forums/threads/food-and-a-little-of-everything-else-at-stalwart-guardian-04.17946/page-5) **[W]**.
- **Build.** A routine, pure function of time (Rule 3).

### 10. Cut-offs rather than convergence, and slow reinforcement

- **In play.** After a fix, small pairs go to the likely withdrawal routes rather than the perch. A post that stops firing draws an improvised relief. Trucks arrive much later than local fires.
- **Counter.** Plan the route first; leave early; kill the caller within his short window.
- **Sources.** [FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) **[P]**; [Breakpoint reviews](https://www.newgamenetwork.com/article/2219/ghost-recon-breakpoint-review/) **[S, snippet]**.
- **Why this form.** It answers E12's finding that the camp's reaction doesn't make getting away harder.
- **Build.** Commander tasks on Lab D's exfil corridors, capacity two each.
- **Test.** A bench on "shooter stays put, shooter leaves at once" against nearest-guard distance.

### 11. Casualties as decisions

- **In play.** The wounded cry out and crawl. A disciplined section smokes first and then drags; a nervous one doesn't go.
- **Counter.** Bait works, but once a section has lost a rescuer it stops coming. Medics become a priority.
- **Sources.** [TCCC](https://health.mil/Reference-Center/Publications/2015/04/29/Tactical-Combat-Casualty-Care-Guidelines) **[P, snippet]**; [FM 3-06.11 on smoke](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Far Cry 2](https://www.gamesradar.com/far-cry-2-will-make-you-a-metaphorical-monster) **[S, snippet]**.
- **Build.** A `rescuer` role with capacity one, gated by confidence, recorded in the habituation ledger.

### 12. Command radius and leaders

- **In play.** Men near their officer recover and obey faster. Shot, his section acts alone, and the survivors stop saluting and hide rank.
- **Counter.** Identify him by behaviour; expect veterans to replace him.
- **Sources.** [CMBB manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Sniper Elite 4 Q&A](https://www.tech-gaming.com/qa-sniper-elite-4s-rebellion-developments/) **[P]**; [FM 3-06.11 on rank](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Wanat](https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-gpo2790/pdf/GOVPUB-D110-PURL-gpo2790.pdf) **[P]**.

### Further candidates, if there's room

- **Leash** ([Days Gone Defend Zones](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf) **[P]**): confidence bleeds outside the wire, so guards can't be strung out forever.
- **Frustration** ([FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**; [Halo](https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf) **[P]**): after several unanswered casualties, undisciplined men spray the hillside and leave cover, which the player can use.
- **Dogs** ([FM 3-06.11](https://www.theblackvault.com/documents/fm/fm30611/ch6.pdf) **[P]**): detection that depends on wind. A use for the wind model.
- **Scent of change:** a watcher who has held a post for a long time notices moved objects, per the same manual's note on familiarity.
- **Second-hand fidelity** ([LAMBS](https://github.com/nk3nny/LambsDanger/blob/master/addons/main/functions/fnc_doShareInformation.sqf) **[P]**; [ASR](https://steamcommunity.com/sharedfiles/filedetails/changelog/642457233) **[W, snippet]**): reports received are capped below first-hand knowledge.

## 7. What I could not find

- Developer accounts of reinforcement, mortar or counter-sniper logic in Sniper Ghost Warrior, Wildlands, Far Cry or MGSV. Walkthroughs and reviews only.
- Any evidence of mortars in MGSV.
- Formulas behind Close Combat's or Company of Heroes' morale.
- An ACE3 suppression effect on AI or players, or a real feature list for ASR AI and VCOM (Arma 3).
- A radio delay or mortar reaction time published by any shipped game, apart from Combat Mission's manual and guide-level flare timing.
- Current US doctrine on stand-to timing, small-base QRF standards, or mortar crew times.
- Daniau's original paper, and numbers from the older suppression studies.
- Research directly comparing whether players felt they outsmarted a defended position or exploited it.
- How The Division decides which NPCs may shoot.

**Method note.** Web and PDF sources were read through web search, page fetches and PDF text extraction, and LAMBS through the GitHub API. Some doctrine sites refused fetches; those lines rest on search summaries and are tagged.
