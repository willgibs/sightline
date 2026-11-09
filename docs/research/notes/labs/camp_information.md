# How a defence gains information fairly from typed inputs, and how that scales

Research notes for Sightline, Nov 8, 2026. They add to `docs/research/notes/labs/camp_defense.md`, `guard_and_camp_ai.md`, `perception_and_detection.md`, `hearing_and_sound_propagation.md`, and `foundations/adaptation_and_directors.md` and `stealth_and_systemic_design.md`. Sources those notes already use are cited only where something new came out of them.

**How far to trust a line.**

| Tag | Meaning |
| --- | --- |
| **[P]** | Primary: a developer's own chapter, talk or dev blog, an official manual, an audit by the responsible body, shipped source |
| **[S]** | Secondary: journalism, encyclopedia, an academic paper reporting someone else's result |
| **[W]** | Weak: forum, guide, fan wiki, hobbyist page, Steam post |
| **[snippet]** | Read only through a search engine's summary, because the page refused the fetch or wasn't opened. Less sure than its tier. |

Lines marked **Inference** are mine. **Computed** means arithmetic of mine, with its assumptions given. Everything from sources is paraphrased.

## 0. The short answer

Four separations carry nearly all the weight, and each has shipped or fielded precedent.

1. **What is given off is separate from who can sense it.** An emission is a typed record; a sensor is a typed reader of one channel. New gear is a new row on either side ([Crytek](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf) **[P]**; [Arma 3](https://dev.arma3.com/post/oprep-sensor-overhaul) **[P]**).
2. **What is known is separate from how it came to be known.** Each piece of knowledge carries who originated it, how it got here, when, and how strong the evidence is ([Talk of the Town](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter37_Simulating_Character_Knowledge_Phenomena_in_Talk_of_the_Town.pdf) **[P]**; [Brewer](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf) **[P]**).
3. **That something exists is separate from what it is and from where it is.** Those three go stale and improve at different rates ([Combat Mission manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Rabin](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter04_Vision_Zones_and_Object_Identification_Certainty.pdf) **[P]**; [Carlisle](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter34_A_Simple_and_Robust_Knowledge_Representation_System.pdf) **[P]**).
4. **A camp as seen from outside is separate from a camp as it runs.** Other camps and the world need a digest and a mailbox, nothing else ([A-Life](https://www.gamedeveloper.com/game-platforms/interview-inside-the-ai-of-i-s-t-a-l-k-e-r-i-) **[P]**; [Alibi Generation](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter37_Alibi_Generation_Fooling_All_the_Players_All_the_Time.pdf) **[P]**).

**Where Sightline stands (read from the code on this branch).** Percepts already have a kind, a place, an uncertainty radius, a strength, a lapse tick and a cause, and they never say who made the stimulus (`src/sim/perception/percept.ts`). `HEARD_AS` in `perception/stimuli.ts` is a small wiring table from event type to how it is heard. Reports are typed and carry `from`, `cause` and `sigma`; `Told` adds `via` and `heard` (`brain/reports.ts`). The commander knows only its inbox (`brain/camp.ts`). A guard calls in only what he sensed himself (`ownEvidence`, `brain/brain.ts`), so reports are one hop deep today. There is a ledger where repeats are taken more seriously. There is one camp record, not a set. So the camp is already honest; what it lacks is a common law for emissions, a grade for what a contact is, and a seam for a second camp.

## 1. Knowledge representation for groups

### 1.1 What one guard knows

- **Three kinds of knowledge need three homes.** Static environment data, dynamic spatial data (influence, occupancy) and entity-specific data ([Brewer, Game AI Pro Online 2021](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**.
- **Last known, not last seen.** Brewer says the word matters: sound and a teammate's relay update it too. His minimal record is target, whether visible now, last known position; storing the time since seen beats a visible flag, because an agent can keep treating a target as visible through a brief occlusion ([same](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**.
- **An event history** is a table of time, event type, entity, perception type and position, truncated by count or age, with salient items promoted to a compact long-term store ([same](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**.
- **Unreachable as knowledge.** Recording that a target can't be reached saves repeated failed path queries, and lets a fallback be chosen on purpose ([same](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**.
- **Crytek's Target Tracks (Crysis 2 on):** one track per perceived target per agent, holding at most one envelope per stimulus type. The track's value is the highest of its envelopes, so the best target is just the highest track ([Welsh, Game AI Pro](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)) **[P]**.
- **Expiry at the attribute level.** EverSky's blackboard let any value expire by counting down a per-variant timer, for a whole entity or for a single attribute such as position ([Carlisle, Game AI Pro](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter34_A_Simple_and_Robust_Knowledge_Representation_System.pdf)) **[P]**.
- **Carlisle's list of what knowledge is:** entity attributes, existence, classification, set membership, relationships, attitudes, knowledge of others, semantic knowledge, events. He treats existence as the first test everything else drills under ([same](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter34_A_Simple_and_Robust_Knowledge_Representation_System.pdf)) **[P]**.

### 1.2 Provenance: where a belief came from

[Ryan & Mateas, *Talk of the Town*, Game AI Pro 3](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter37_Simulating_Character_Knowledge_Phenomena_in_Talk_of_the_Town.pdf) **[P]** is the deepest published model found. Research game, unfinished when written; the same framework ran in the installation *Bad News* over a hundred times. Every line of the list below is from that chapter.

- **A belief is a facet:** owner, subject, type, value, a link to the belief it replaced, links to the facets of the people it came from, a list of evidence, a summed strength, and whether it's true. The predecessor chain and the truth flag are for the system's tracing; characters don't get them.
- **Evidence is typed:** eleven types in five groups. Origination: reflection, observation, transference (one person reminds you of another, and a belief copies across), confabulation, lying, implanted at generation. Propagation by statements and eavesdropping. Reinforcement: saying a thing strengthens your own belief, so a repeated lie can come to be believed. Deterioration: mutation along a hand-drawn graph of likely mistakes. Termination: forgetting.
- **Each piece of evidence** has a source, a place, a time and a strength. Strength starts from the type (a statement is weaker than an observation) and decays. For anything told, it also depends on how much you like the teller and how strongly the teller believed it at the time.
- **Contradiction.** New evidence stronger than the current belief replaces it. Weaker evidence is kept as a candidate, accumulating, and can overtake later. The authors accept belief oscillation as an appeal of the design.
- **Fallibility is tuned per attribute.** Their early performances had people forgetting where their own parents lived; turning down that one mutation rate fixed it.
- **Implantation.** Knowledge at the start isn't simulated; each resident gets what he'd believably know (family, friends, neighbours, co-workers).
- **Their warnings.** The many interacting parameters worry them, and it runs between turns, not in real time.

**Brewer's first-hand rule** (the best single fairness rule found): keep a flag for whether the agent personally witnessed the target. In an L-shaped corridor, the guard who can actually see the player should be the one to run for the alarm; a guard round the corner, told second-hand, shouldn't, because that would feel unfair and would take away the player's chance to stop it. Likewise a guard who has only heard something should turn and look before running for the alarm ([Brewer](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**.

**Doctrine's version.** The Admiralty code grades each report on two independent scales: source reliability A–F and information credibility 1–6. Grade 1 means confirmed by other independent sources; 5 means contradicted; F and 6 mean no basis to judge. The two grades are assessed in isolation, so a reliable source can still give a doubtful report ([Wikipedia](https://en.wikipedia.org/wiki/Admiralty_code)) **[S]**.

**The failure it guards against: data incest.** In distributed fusion, the same information can reach a node along more than one path and be counted as independent. Estimates become over-confident and can fail badly ([Julier, UCL](https://discovery-pp.ucl.ac.uk/15814/1/15814.pdf); [Noack et al., KIT](https://isas.iar.kit.edu/pdf/Fusion11_Noack.pdf)) **[P, snippet]**. Exact removal needs knowledge of the whole network; covariance intersection is the conservative alternative when correlation is unknown ([Wikipedia](https://en.wikipedia.org/wiki/Covariance_intersection)) **[S]**.

### 1.3 What a group knows

- **Public and private.** Knowledge everyone should have goes in a central store; what only witnesses have stays with them ([Brewer](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf)) **[P]**. Sightline's commander record is a third thing: public to the camp, but fed only by reports.
- **Combat Mission's history.** In Barbarossa to Berlin an enemy appears on the player's map once any one of his units has spotted it, and its manual already grades contacts ([manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**. Players call that older model absolute or Borg spotting: a spotted enemy is known to every unit. The later engine moved to relative spotting: each unit has its own contacts, and they pass up through a working command link and back down to other platoons, and sideways within voice range (players report 4 squares, 32 m). Buttoned tanks reportedly don't share. Whether a shared contact speeds a unit's own spotting is unsettled among players ([C2 information sharing](https://community.battlefront.com/topic/119474-c2-information-sharing/page/3/); [what is Borg spotting](https://community.battlefront.com/topic/48246-what-the-hell-is-borg-spotting/); [shared contact markers](https://community.battlefront.com/topic/134969-do-shared-contact-markers-lead-to-faster-spotting-times/)) **[W, snippet]**.
- **Arma.** `knowsAbout` is a number from 0 to 4; enemy knowledge is shared instantly within a group; `reveal` raises a unit's value to the highest any unit on the revealing side holds and can never lower it, and `forgetTarget` is needed for that ([knowsAbout](https://community.bistudio.com/wiki/knowsAbout); [reveal](https://community.bistudio.com/wiki/reveal)) **[P, snippet: wiki notes of mixed age]**.
- **Arma's Data Link shows provenance to the player.** Own sensor contacts are drawn filled, contacts received from others hollow; each vehicle can be set to send, receive, both or neither ([OPREP: Sensor Overhaul](https://dev.arma3.com/post/oprep-sensor-overhaul)) **[P]**.

### 1.4 How sure

- **Certainty is about what it is, not whether it was seen.** Rabin rejects treating 0–1 as a detection probability: rolled often enough, anything is seen, and the behaviour is inexplicable to the player. He reads it as how sure the agent is of the object's identity. Zones give illustrative values 1.0, 0.7, 0.5, 0.4, 0.3; moving +0.3, camouflaged −0.3. Low values produce leaning, squinting, a question to a mate; turning the head raises the value, so the behaviour self-corrects ([Rabin, Game AI Pro 2](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter04_Vision_Zones_and_Object_Identification_Certainty.pdf)) **[P]**.
- **Combat Mission's contact ladder** ([manual, pp. 69–71](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**:

| Level | Name | What you get |
| --- | --- | --- |
| 0 | No contact | Nothing, though he may have you |
| 1 | Sound contact | Generic icon, guessed type, place may be wrong; it can even seem to move through impassable ground |
| 2 | First contact | A glimpse or a muzzle flash; general type only |
| 3 | Contact | Squad or team, weapons, vehicle class; inexperienced men can mis-identify, usually as something bigger and scarier |
| 4 | Identified | Headcount, exact model, experience; earlier mistakes corrected |

  On the extreme setting many units in cover or far away are never fully identified, and levels 3 and 4 are rare. Panicked or broken units relay almost no useful spotting information. Bailed-out crews had their spotting cut deliberately, to stop players using them as disposable scouts.
- **Johnson's criteria** (1958) put numbers on the same ladder for an image system: 1.0 line pair across the target to detect, 1.4 for orientation, 4 to recognise (a person versus a car), 6.4 to identify a particular one, each at 50% probability ([Wikipedia](https://en.wikipedia.org/wiki/Johnson%27s_criteria)) **[S]**.
- **Inference, computed.** Take a 20/20 eye (one line pair ≈ 2 arcminutes), a target 0.5 m across, and ideal contrast. Then detect at about 860 m, recognise at about 215 m and identify at about 135 m, all with the naked eye; a 4× scope multiplies each by about 4. These are ceilings, far beyond a camouflaged man against brush, but they say the rungs sit at very different ranges. Guards at 300 m can reach "something moved" long before "that's a man with a rifle".

### 1.5 How knowledge decays

- **Crytek's envelopes** make decay data: attack (how fast it builds), decay, sustain while the stimulus lasts, release when it stops. Per-type peak values in one shipped configuration: footsteps 25, weapon sound 50, primary-view sight 100. A distance multiplier runs 1 near to 0 at 50 m. Attack time on sight is what designers lengthened to give the player time to lean out ([Welsh](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)) **[P]**.
- **Verification beats timers.** In Combat Mission a lost contact stays on the map as a generic marker until the same unit is seen again or someone gets close enough to confirm it has gone ([manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**. Arma's `knowsAbout`, in contrast, is reported to reset after about 120 s without contact, with users disagreeing about timing ([wiki](https://community.bistudio.com/wiki/knowsAbout); [forum](https://forums.bohemia.net/forums/topic/187707-detected-by-opfor-vs-knowsabout/)) **[P/W, snippet]**.
- **Going forward, not just staying put.** Dishonored 2's chase seeds an influence map at the last known position, plus a barrier across the half-plane behind the player's last known direction, so the belief floods forward along real routes. Propagation stops at a fixed step limit, at no more cells, or when too many cells heat in one step ([Couvidou, Game AI Pro Online 2021](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter06_Flooding_the_Influence_Map_for_Chase_in_Dishonored_2.pdf)) **[P]**.

### 1.6 How players detect cheating

- **Leaked knowledge feels bad when it's noticed.** Dishonored's breadcrumb chase gave NPCs effective omniscience about where the player went, which felt unfair and frustrating once spotted. A plain dead-reckoning replacement survived a long time in production, but testers found chases disappointing, because extrapolation hit walls and the NPCs gave up ([Couvidou](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter06_Flooding_the_Influence_Map_for_Chase_in_Dishonored_2.pdf)) **[P]**. So fairness and persistence are separate requirements: a hunt that gives up too early is also a failure.
- **Crytek's statement of the principle:** once players realise the AI cheats, they feel cheated ([Welsh](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)) **[P]**.
- **What gets complained about in practice:** seeing through foliage and walls, snapping round to a headshot, hits from extreme range ([Gray Zone Warfare, Charlie INTEL](https://charlieintel.com/gray-zone-warfare/gray-zone-warfare-players-demand-change-to-ridiculously-overpowered-ai-323330); [Dot Esports](https://vip-develop.dotesports.com/gray-zone-warfare/news/gray-zone-warfares-lethal-ai-is-getting-out-of-hand-after-latest-patch)) **[S, snippet]**. In Arma, players attribute it to AI line of sight ignoring grass ([feedback tracker](https://feedback.bistudio.com/T165421)) **[W, snippet]**.
- **Cheating for the player is built in without apology.** Ghost Recon Wildlands' squad uses "magic shots" that simply drop a target, stays invisible while the player is undetected, and teleports ([Thompson, on Rolland's GameAI North talk](https://www.gamedeveloper.com/design/why-friendly-ai-cheat-in-ghost-recon-wildlands)) **[S]**.
- **Inference.** The evidence is about reactions that are correct without a visible cause. A camp can be perfectly honest and still read as cheating if the player can't see the chain. This is the case for every link being a thing, already the idea of `docs/camp-engine.md` section 2, and for showing contact grade as behaviour.

### Inferences for Sightline

- A `Report` should say who originally sensed it and how many hops it has taken, as a separate field from who is saying it. Today `from` is both, which is fine only while reports are one hop.
- Reading the code, `ownEvidence` gates reporting and investigating, but the `combat` case in `fillOptions` (`brain/brain.ts`) offers `alarm` whether or not the man has first-hand evidence. Brewer's rule would apply there; check whether a guard can reach `combat` on hearsay alone. I didn't trace that.
- Fusion should count origins, not messages, the moment anything relays.

### Gaps

- Isla & Gorniak's GDC 2009 "Beyond Behavior" and Graham & Brewer's GDC 2018 "Knowledge is Power" are the talks behind Brewer's chapter; neither was read.
- No shipped game describes a team-level belief model with explicit confidence and provenance in a stealth or shooter context. Talk of the Town is research.
- Vehkala & De Pascale's GDC 2013 talk on Hitman: Absolution's knowledge system was not read.
- Nothing found measuring how quickly players detect a given kind of cheat.

## 2. A typed-signature model of inputs

### 2.1 Crytek's stimulus structure: the plainest composable design

[Welsh, Game AI Pro](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf) **[P]**. Every line of this list is from that chapter:

- **One record for every perceivable event:** stimulus type, source entity, position or direction, and the radius within which it can be perceived. An optional second id handles cases such as a thrown box, whose collision has a responsible thrower.
- **One function to enter the system,** callable from anywhere in the code; the rest of the game sees a single register call and a query for the best target.
- **Filters in cheap order:** does this agent subscribe to this type, is it in range, and per-type flags such as hostile-only.
- **Per-agent configuration in data.** A blind agent is a configuration; visual stimuli just don't register and audio is weighted up.
- **Special cases are dog whistles:** a sound with no audio, purely to tell the AI something. Bullet rain has a direction but no origin, so a man can react to being under fire without knowing where the shooter is.
- **Ignore time** is an offset from the stimulus to its perception, used for faking the speed of sound.
- **Optimisation by interest.** In Crackdown 2, registering only for hostile targets cut 136 raycasts to 16 in a 16-agent scene.

Sightline's percepts are stricter than this: Crytek passes the source id so that a stimulus lands on the right track; Sightline's percept never names its source. That is a real advantage for honesty, and it means two stimuli can only be attributed to one target by inference.

### 2.2 Arma 3's sensor overhaul: signature by channel, sensor by product

[OPREP: Sensor Overhaul (Kužel, Bohemia, 2017)](https://dev.arma3.com/post/oprep-sensor-overhaul) **[P]**; component names from the [sensors wiki](https://community.bistudio.com/wiki/Arma_3_Sensors) and [getSensorTargets](https://community.bistudio.com/wiki/getSensorTargets) **[P, snippet]**.

| Sensor | Reads | Reports | Costs or limits |
| --- | --- | --- | --- |
| Active radar | Radar returns; size-graded (`radarTargetSize`) | Speed, altitude, distance: the only sensor that does | Must be switched on; announces itself |
| Passive radar / RWR | Others' active radars | The emitter, at twice the emitter's own range | Only works if someone else transmits |
| Infrared | Hot targets (`irTargetSize` and actual heat: engine, tyres, muzzle) | No speed, altitude or distance | Tied to the optics' view; fog and smoke hurt it |
| Visual | Anything, by `visualTargetSize` | No speed, altitude or distance | Needs daylight; fog and smoke hurt it |
| Human tracking | People, for small UAVs | Tracks them | Very limited range |
| Laser / strobe | A lased spot or an IR strobe | That spot | Front hemisphere |
| Data link | Other units' contacts | Shown hollow | Per-vehicle send and receive |

Other points from the same post: passive sensors reveal nothing about the watcher, active ones reveal the emitter to anyone with a detector; a heated vehicle can take many minutes to cool; fog and smoke affect infrared and visual but not radar; signature varies with type, background, altitude and speed.

### 2.3 Infantry channels in Arma

Unit configs have `camouflage`, `audible` and `sensitivity`-style values, and `audible = 0` makes a unit unhearable to enemies ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/comments/2863404489)) **[W, snippet; which result said this is uncertain]**. Mods change `camouflageCoef` and `audibleCoef` at run time ([dynamic camo](https://forums.bohemia.net/forums/topic/223202-dynamiccamo-script/?do=embed)) **[W, snippet]**. Bohemia's own pages refused the fetch; the prior notes have the rest.

### 2.4 Serious sims

- **Command: Modern Air/Naval Operations** (player reports only). Contacts carry an uncertainty polygon; a torpedo detection generates a submarine contact with a 10 nm uncertainty that can send aircraft to the wrong place; contacts sit at levels such as unknown, unfriendly, hostile; the log records which sensor made each classification; emissions can be intercepted far beyond the emitter's own useful range; a false contact can be attacked and destroyed ([uncertainty and classification thread](https://steamcommunity.com/app/321410/discussions/0/141136086944716870/); [ELINT thread](https://steamcommunity.com/app/321410/discussions/0/1368380934294535351/)) **[W, snippet]**.
- **DCS:** nothing usable found (section 7).

### 2.5 The world as an alarm

Crytek's developers on Hunt: Showdown say every sound comes from a real source and falls off with distance. Barking dogs or an injured horse can betray a team; crows taking off mean another player caused it ([Sony blog, Schwarz and Füsslin](https://blog.playstation.com/archive/2020/02/17/battle-royale-meets-supernatural-horror-in-cryteks-hunt-showdown-out-tomorrow-on-ps4)) **[P]**. The mechanics, the number of trap kinds and their ranges were not available: the fan wiki refused the fetch.

### 2.6 What makes channels composable (Inference)

From 2.1 and 2.2, a checklist. A new input is cheap only if all of these hold.

1. **Emission and reception are different records.** The player, guards, a generator and a dog all emit; a person, a camera, a microphone and a dog all receive. A channel is the only thing they share.
2. **A channel table says what the world does to it.** Smoke, fog, night, wind, foliage and rain each multiply by channel (Arma: fog hurts sight and heat, not radar; Combat Mission: rain muffles noise so sound contacts become much harder, snow somewhat less, and thick fog cuts both sight and sound contacts). No new tool touches this table.
3. **A sensor's product is explicit.** Presence, bearing, place, class. A hearing guard gives a bearing; a tripwire gives presence at a known place; a seismic sensor gives a class and a direction of travel (section 3); a rangefinder gives a place. Downstream code consumes products, so it doesn't know what produced them.
4. **Channels combine by maximum per track, not by sum** (Crytek). Adding a channel can't quietly make detection easier everywhere, which protects Lab A's and Lab C's predictability exit tests.
5. **An active tool is also an emitter.** A radio call, a searchlight, a dog, a drone and a generator all go through the same law. That gives the player's counter for free, and it keeps the same law for both sides, as `docs/camp-engine.md` already asks.
6. **Lingering is a property of the channel.** Heat stays for minutes after firing (Arma). Scent and tracks stay longer. The record has a `lingers` value, and traces are simply emissions that keep emitting.

### Gaps

- No doctrinal table of a soldier's signature across channels was retrieved (FM 20-3 or ATP 3-37.34; the site refused).
- MGS3's camouflage index is in `movement_and_body.md`; nothing new found.
- No game found models scent or physical traces as a typed emission with published numbers. The prior notes hold The Last of Us Part II's dogs at press level only.

## 3. Sensors and information tools in defence

### 3.1 What each one really gives

| Tool | Product | Numbers | How it fails or is beaten | Source |
| --- | --- | --- | --- | --- |
| CCTV with an operator | Presence, then a human's judgement | Detection 83% at 4 feeds, 84% at 9, 64% at 16; survey of 11 control rooms found 27–520 cameras per operator and up to 175 feeds at once; two Tayside operators spent over 90% of viewing time on one selectable spot monitor | Attention. Most feeds are unwatched most of the time | [Stainer et al. 2013, citing Tickner & Poulton 1973 and Gill et al. 2005](https://pmc.ncbi.nlm.nih.gov/articles/PMC3786256) **[S]** |
| CCTV, live test | | About 50% of target behaviours detected, false alarms high; vigilance fell for novices and generalists; specialists held up better | | [Donald et al. 2015](https://www.scribd.com/document/623229333/Donaldetal2015-CCTV) **[S, snippet]** |
| Unattended ground sensor (I-REMBASS) | Presence, class (person, wheeled, tracked), direction of movement | Persons 3–50 m; wheeled 15–250 m; tracked 25–350 m | Not found. Triggers on a change in ambient seismic-acoustic, thermal or magnetic energy | [GlobalSecurity](https://www.globalsecurity.org/military/systems/ground/irembass.htm); [DTIC](https://apps.dtic.mil/sti/tr/pdf/ADA390663.pdf) **[S, snippet]** |
| Air-dropped sensor field (Igloo White, Laos) | Seismic and acoustic presence, relayed by orbiting aircraft to a computer centre | About 20,000 sensors; 80% operational after delivery; $619–$2,997 each in 1972; 316 in 44 strings at Khe Sanh | Found one, searched for the rest; deception; foliage hid the sensors. The headline results (46,000 trucks) were discounted by the CIA by up to 75% at the time | [Wikipedia](https://en.wikipedia.org/wiki/Operation_Igloo_White) **[S]** |
| Chemical "people sniffer" | Presence of ammonia or smoke | Oversensitive, caught civilians and animals; a 1967 controlled test found its response close to random | Stopped firing when the helicopters were recognised; hung buckets of urine-soaked mud in trees and moved away; largely neutralised in jungle | [Wikipedia, citing Kirby](https://en.wikipedia.org/wiki/People_sniffer) **[S]** |
| Gunshot locator (ShotSpotter, NYC) | Place, class "gunfire" | 80–92% of alerts by month unconfirmed as shootings (87% overall; 13% confirmed); 7,262 unconfirmed sent to officers in the sample; about 20 min per unfounded, 32 min per unconfirmed alert | The audit's summary doesn't say why. The vendor disputes confirmed shootings as the right yardstick ([Smart Cities Dive](https://www.smartcitiesdive.com/news/new-york-joins-cities-questioning-shotspotter-costs-benefits-Houston-Chicago-gun-crime/721118/) **[S, snippet]**) | [NYC Comptroller audit, 2024](https://comptroller.nyc.gov/newsroom/nypds-shotspotter-gunshot-detection-system-overwhelmingly-sends-officers-to-locations-where-no-confirmed-shooting-occurred-new-audit-uncovers) **[P]** |
| Gunshot locator, human comparison | | Durham pilot, 1,447 notifications: 57% ShotSpotter only, 28% 911 only, 15% both | Sensors and people catch different events | [Smart Cities Dive](https://www.smartcitiesdive.com/news/new-york-joins-cities-questioning-shotspotter-costs-benefits-Houston-Chicago-gun-crime/721118/) **[S, snippet]** |
| Acoustic air-defence net (Sky Fortress, Ukraine) | Class by audio signature from phone microphones; flight tracks after central fusion with radar, sent to mobile gun teams' tablets | Roughly 9,500 to 14,000 nodes; $300 to $1,000 each | Works on propeller noise; horizontal range not published | [ITC](https://itc.ua/en/news/in-ukraine-9-500-phones-detect-shaheds-by-sound-and-transmit-air-defense-data); [NV](https://english.nv.ua/russian-war/ukrainian-engineers-develop-sky-fortress-drone-detection-system-to-counter-shaheds-50520480.html); [Janes](https://www.janes.com/osint-insights/defence-news/weapons/ukraine-conflict-ukrainian-air-defence-employs-passive-sensors-for-detection-and-tracking) **[S, snippet]** |
| Working dog | Presence, rough direction via handler | About 200 m in still air by smell, hearing and sight; sound and sight still work in bad wind; reduced by noise, movement, smoke, dust, dense undergrowth, woods, jungle; the team may shift off the line of march to use the wind | Wind, cover, distraction. A handler's recollection: he judged distance from how strongly the dog alerted **[W]** | [FM 19-4 App. K](https://www.globalsecurity.org/military/library/policy/army/fm/19-4/Appk.htm); [1967 scout dog handbook](https://www.vdha.us/stuff/contentmgr/files/2/cadadca1a92ce43c1a8114561b4108f8/miscdocs/army_handbook_scout_dog_may_1967.pdf) **[P, snippet]** |
| Trip flare (M49) | Presence at a known place, and light | Pull of about 2 lb; burns about 55–60 s; lights about a 300 m or 300 yd radius | Stepped over; found and disarmed | [Bulletpicker](https://bulletpicker.com/flare_-trip_-m49.html); [patent](https://patents.google.com/patent/US9574857) **[W, snippet]** |
| Small drone, as heard | Its own noise | In test conditions detected at about 75–90 m and classified at about 20 m; commercial FPV detectors claim 100–300 m | Background noise | [Radap](https://doi.radap.kpi.ua/article/view/326688) **[S, snippet; attribution of the 75 m figure among results is uncertain]** |

Prior notes already hold Boomerang's bearing accuracy, FM 3-06.11's OP and dog material, and Hesketh-Prichard's dummy heads.

### 3.2 Physical and social versions in games

- **Payday 2.** After a guard is killed his pager must be answered within roughly ten seconds, and the fourth answer usually fails. Civilians with no guard nearby phone it in, taking about 20 s. An ECM jammer suspends cameras, pagers and phones, and when it ends the dead guard's pager goes off. A shot camera draws a guard to inspect, and a guard who sees a damaged camera raises the alarm ([Payday wiki](https://payday.fandom.com/wiki/Social_Stealth); [Steam](https://steamcommunity.com/app/218620/discussions/8/1744483505465188472)) **[W, snippet; dated; which Steam thread said what is uncertain]**.
- **Red Dead Redemption 2.** Most crimes need a witness. A witness stage comes before wanted status; someone who sees you at the scene afterwards counts too. Stopping every witness before they reach the law clears the crime, and a bandanna makes you anonymous. Bounties are kept separately by area ([GamePressure](https://www.gamepressure.com/red-dead-redemption-2/wanted-system/z2b7e4); [Shacknews](https://www.shacknews.com/article/108138/how-the-wanted-and-bounty-systems-work-in-red-dead-redemption-2); [rdr2.org](https://www.rdr2.org/wiki/wanted-system/)) **[W, snippet]**. Note the two separate facts: that a crime happened, and who did it.

### 3.3 What happens when links are cut

- **Combat Mission.** If a Platoon HQ dies, its squads are out of command for the rest of the battle unless a Company or Battalion HQ is close enough. Radio vehicles keep command without line of sight, within about 400 m; non-radio vehicles need line of sight, and both commanders' hatches open ([manual, pp. 131–132](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**.
- **Starlink whitelist, Feb 5, 2026.** Unregistered terminals were disconnected across Ukraine and occupied territory. A Ukrainian adviser claimed command had collapsed and assaults had stopped in many areas ([Ukrinform](https://www.ukrinform.net/rubric-ato/4090806-russia-scrambles-to-restore-connectivity-as-starlink-restrictions-disrupt-battlefield-c2.html); [DroneXL](https://dronexl.co/2026/02/05/starlink-russian-frontline-collapses-drone)) **[S, snippet, partisan; which outlet said what is uncertain]**. Perun's analysis is more cautious: degradation is likely but no complete collapse is assessed. Units fell back to slower satellite service, wifi bridges and cellular, and Telegram and Discord for sharing drone video. Daily assaults reportedly fell from 180–200 to 130–160, which he calls correlation only, and most evidence is anecdotal ([Perun transcript](https://rosetta.to/u/perunau/the-starlink-shutdown-russian-military-communications-corruption-satellites-in-u)) **[S]**.
- **Igloo White** depended on orbiting relay aircraft to carry sensor data to the centre ([Wikipedia](https://en.wikipedia.org/wiki/Operation_Igloo_White)) **[S]**. The link is a target of its own.
- **Wanat** is in the prior notes.
- **ELICIT**, the US DoD's experimental game for comparing hierarchy with edge organisations, exists to test this. Reports say edge sometimes beats hierarchy and sometimes doesn't, depending on task and environment. No figures for network damage could be reached ([ELICIT page](https://internationalc2institute.org/elicit); [Alberts slides](https://dodccrp-testorg.squarespace.com/s/Alberts-Introduction-to-ELICIT-10-24-19.pdf); [paper](https://core.ac.uk/download/36728187.pdf)) **[S, snippet]**.

### Inferences for Sightline

- **Every non-human sensor ends at a human or at a siren.** The CCTV numbers say the bottleneck is attention. A camera wired to nobody is a siren; a camera wired to a man is limited by what that man is looking at. That matches `docs/camp-engine.md`'s "every link is a thing" and points at the operator as the weak link.
- **Sensors feed men, and men get tired of being sent.** NYC's figures make the cost concrete. Computed: 13% confirmed means about 6.7 unconfirmed trips per confirmed one, or 2.2–3.6 officer-hours per confirmed shooting. Sightline's ledger currently counts repeats up ("repeats get taken more seriously"). The real curve is two-sided: repeats with finds raise attention, repeats with nothing should cost trust and manpower.
- **A sensor gives a product, not a fact.** I-REMBASS's class-and-direction is a natural "something walking north past marker 3".
- **What a cheap decoy buys.** Urine buckets and stones are the same trick: an emission in the sensor's channel with no one behind it. The sensor law gives this for free.

### Gaps

- Tripwire and motion-sensor false-alarm rates: none found.
- Small quadcopter endurance and useful sensor range under field use: none found.
- Scout dog numbers from FM 7-40: the only copy found is a scan without text.
- How long a report takes from sensor to a decision in any real small-unit setting: none found.

## 4. Information flow through a chain of command

### 4.1 Theory that is actually usable

- **OODA is a stage model, not a mechanism.** Reviews of Boyd's loop say it leaves out command concepts, planning, exit criteria and system delays, and so over-stresses speed. Brehmer's Dynamic OODA replaces it with four functions (data collection, sensemaking, planning, military activity) and insists on the delays between them ([arXiv review](https://arxiv.org/pdf/2109.06874); [Tribute to Brehmer](https://c5i.gmu.edu/?p=1320)) **[S, snippet; which paper said what is uncertain]**. Aviation historian Michael Hankins argues the original is vague enough for anyone to read into ([Wikipedia](https://en.wikipedia.org/wiki/OODA_loop)) **[S]**. Brehmer's paper itself didn't load.
- **Commanders mostly don't compare options.** Klein, Calderwood and Clinton-Cirocco interviewed 26 fireground commanders about 156 decision points. In about 80%, they identified the situation as typical and took the first workable course without weighing a second ([ARI report](https://apps.dtic.mil/sti/pdfs/ADA199492.pdf); [Fire Engineering](https://www.fireengineering.com/?p=277352)) **[P/S, snippet]**. The claim that 80% take under a minute comes from Klein's later book, and I couldn't verify it at source. The model's stated weak point is unusual or misidentified situations ([Wikipedia](https://en.wikipedia.org/wiki/Recognition-primed_decision)) **[S]**.
- **Serial reports shorten and sharpen.** Allport and Postman's serial-reproduction experiments found three effects: levelling (accounts get shorter), sharpening (a few details are selectively kept), and assimilation (accounts bend toward what listeners expect). Field studies show much less distortion than the lab ([Wikipedia](https://en.wikipedia.org/wiki/Rumor); [Encyclopedia.com](https://www.encyclopedia.com/social-sciences/applied-and-social-sciences-magazines/rumor)) **[S, snippet]**. The often-repeated "70% of details lost after five or six hops" couldn't be confirmed.

### 4.2 Games that model it

- **Combat Mission's command delay.** Every unit has one before executing new movement orders; it can still fire and react meanwhile. The length depends on nationality, experience and whether the unit is in command range. More orders and waypoints lengthen it, standing for the time to explain a complicated plan. An HQ's Command leadership extends its radius, by formulating orders better rather than shouting louder ([manual, p. 131](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF)) **[P]**. Numbers aren't published.
- **Command Ops 2** lists orders delay and a realistic command process as core models ([Steam](https://store.steampowered.com/app/521800/Command_Ops_2/)) **[S, snippet]**. No detail found.
- **Arma's Data Link** separates who may send and who may receive ([OPREP](https://dev.arma3.com/post/oprep-sensor-overhaul)) **[P]**.

### 4.3 Conflicting reports

Talk of the Town's candidate belief (1.2), the Admiralty code's independent-confirmation grade (1.2) and Combat Mission's wrong-then-corrected identifications (1.4) are the only explicit treatments found. Nothing found on how a commander weighs conflicting reports with numbers.

### Inferences for Sightline

- **Doctrine as an ordered pattern list beats a utility over the whole Picture.** Klein's result says the realistic commander picks the first fit. It's cheaper, it reads well in `explain()`, and the failure mode is a game: mislead the pattern and the camp is slow.
- **Delay by order complexity** (Combat Mission) gives a simple law: a short shouted order is fast; a three-part sweep takes time.
- **Report queue.** Half-duplex radio means one speaker at a time. Sightline's `airwaves` and `talk` (1.6 s) already make a call interruptible. Inference: if a call must wait for the net, a burst of events saturates it, and which report gets through first is a priority rule in tuning.

### Gaps

- Published per-hop garble rates: none found.
- Published radio delay in any shipped game: none, again, beyond Combat Mission's unnumbered description. The prior notes hit the same wall.
- C3Fire experiments on delay: not reached.
- SALUTE-style report formats and real radio-net throughput: not reached.

## 5. More than one camp

### 5.1 What has shipped or been published

- **S.T.A.L.K.E.R. A-Life.** Dmitriy Iassenev, who built it, describes two behaviour modes, with offline as a level of detail of online. Offline characters skip animation, sound, inventory management and smooth paths, but still move on the global graph. Only characters within a radius of the player are online, usually about 150 m, set per level. Offline fights are turn-based, resolved by a formula and a random factor. Outcomes include dying, fleeing, or never noticing each other. The player hears about offline events through news generated when a character sees an event or its aftermath. "Smart terrains" assign destinations and hold characters there, which produced faction bases and campfires. Unlimited ammo cut an emergent looting scenario. His wishlist includes real team AI instead of imitated teamwork ([interview, 2008](https://www.gamedeveloper.com/game-platforms/interview-inside-the-ai-of-i-s-t-a-l-k-e-r-i-)) **[P]**.
- **S.T.A.L.K.E.R. 2.** Patch 1.1 (Dec 19, 2024) fixed over-aggressive optimisation that had stopped A-Life NPCs existing offline, and fixed NPCs spawning behind the player. Patch 1.2 fixed a further case of NPCs spawning in front of the player ([The Sixth Axis](https://www.thesixthaxis.com/2024/12/19/huge-stalker-2-patch-1-1-brings-over-1800-fixes-a-life-improvements/); [PC Gamer](https://www.pcgamer.com/games/fps/stalker-2-revives-a-life-with-a-mondo-huge-110-gb-christmas-patch-that-marks-the-games-first-major-update/); [Shacknews](https://www.shacknews.com/article/143108/stalker-2-update-1-2-patch-notes)) **[S, snippet]**. The lesson: faking the offline half is exactly what players notice.
- **Alibi generation.** Sunshine-Hill's principle: details are generated lazily, when first required, consistent with what the player has already seen and with the distribution the full simulation would give. Entry and population rates must match, or a place drifts to empty or overfull. Heisenburgh simulated pedestrians in a city by sector, using portals and Poisson and exponential sampling. Characters given an alibi should last longer, because they mattered ([Game AI Pro](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter37_Alibi_Generation_Fooling_All_the_Players_All_the_Time.pdf)) **[P]**.
- **LOD Trader.** Detail is chosen to minimise the chance the player notices a break, not by distance. Three kinds of break: an unrealistic state seen right now; a fundamental discontinuity against what the player remembers (he comes back and something is impossible); unrealistic long-term behaviour observed over time. Criticality is built from observability, attention, memory, return time and duration ([Game AI Pro](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter14_Phenomenal_AI_Level-of-Detail_Control_with_the_LOD_Trader.pdf)) **[P]**.
- **Lanchester models for resolving a fight off-screen.** The general form is dA/dt = −β·A^(2−n)·B and dB/dt = −α·B^(2−n)·A, whose invariant is α·A^n − β·B^n, so A wins if α·A₀^n exceeds β·B₀^n. n is the attrition order: 1 is the linear law, 2 the square law. The authors say it is about the rate of acquiring new targets, not range as such. For StarCraft: Brood War a value near 1.56 fit best. As a bot's attack-or-retreat predictor, against six top 2014 bots over 200 matches each, a learned version averaged a 69.7% win rate, against 63.9% for static values and 60.8% for simulation ([Stanescu, Barriga & Buro, Game AI Pro 3](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter25_Combat_Outcome_Prediction_for_Real-Time_Strategy_Games.pdf)) **[P]**.
- **Event-driven updates.** Most per-frame updates just wait. Replace them with a priority queue of when something will next happen, and derive the rest mathematically on demand ([Graham, Game AI Pro Online 2021](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter02_Efficient_Event_Based_Simulations.pdf)) **[P]**.
- **ALiVE for Arma 3** (open source, GPL v2). Thousands of groups run as virtual profiles while no player is near and spawn when one is in range. An AI commander takes all its faction's forces and learns its objectives from placement modules ([README](https://github.com/ALiVEOS/ALiVE.OS)) **[P]**. Its thresholds couldn't be confirmed.
- **Mount & Blade II.** Modders describe the base auto-resolve as picking a random troop from each side to fight, mostly decided by chance, and players complain of it ([Advanced Autoresolve](https://www.nexusmods.com/mountandblade2bannerlord/mods/752); [GamePressure](https://www.gamepressure.com/newsroom/mount-and-blade-2-bannerlord-auto-resolve-annoys-players/zd1c18)) **[W, snippet]**.
- **Kenshi.** World States let the player's actions, chiefly killing or kidnapping a faction's leaders, change town overrides and spawn rates in zones ([wiki](https://kenshi.wiki/w/World_States)) **[W, snippet]**. That's a very small interface: a few faction facts drive what spawns.
- **Nemesis:** prior notes. **Far Cry and Wildlands off-screen:** nothing found.

### 5.2 What the smallest camp-level interface is (Inference)

Sightline has a head start that most of these games lacked: rule 3 makes a guard on routine a pure function of time, so an unobserved camp at rest needs no ticking at all. That is alibi generation for free, for the routine case. Only incidents need stored state.

A camp seen from outside needs five things, and they are plain data (rule 9):

```ts
interface CampPort {
  id: number; site: SiteRef;                 // rule 15: everything in a site frame
  digest: CampDigest;                        // what the world may read without entering
  inbox: Report[];                           // the same Report the camp uses inside
  // Pure functions over plain data:
  // advance(digest, toTick, rng, tuning)    → digest + outgoing reports (event-driven: ctx.schedule)
  // expand(digest, tick)                    → full CampState + guards, seeded by the camp's own stream
  // reduce(state)                           → digest
}

interface CampDigest {
  tick: number;
  level: AlertLevel; floor: AlertLevel;      // posture
  strength: number[];                        // survivors by role
  dead: number[]; broken: number[];          // ids: what the player remembers (fundamental discontinuity)
  threats: ThreatRecord[];                   // what it believes, with origin and grade
  ledger: LedgerEntry[];                     // what it has learned
  pending: ScheduledThing[];                 // reinforcement due, reliefs, work list position
}
```

Why these and no more.

- **`dead` and `broken` are what the player remembers**, so reducing must not lose them (LOD Trader's fundamental discontinuity).
- **`threats` and `ledger`** are what the camp has learned, which is the reason a second camp matters.
- **`inbox` is the same `Report`** the camp uses within itself. Between camps it's just another hop with a longer delay and a link that can be cut, which is A-Life's news made honest.
- **`advance` is event-driven** (Graham) and resolves any low-fidelity fight with a Lanchester form, using `dpow` from detmath (rule 2) with `n` in tuning (rule 4), drawing only from that camp's own stream (rule 3).
- **The bubble must exceed the longest engagement range.** A-Life's 150 m won't do: a shooter works 300–1,000 m out (prior notes). The rule should be perception-based (is a camp audible, visible or reported), in the spirit of the LOD Trader.

**What to do now, under the foundation plan's rule** (a seam only if cheap now and expensive to retrofit): add `origin` and `hops` to `Report`, and write `campDigest(camp)` as a pure function with a test that a digest round-trips the facts above. Leave `advance`, `expand` and multi-camp state alone. A digest function also gives `explain()` and the debrief something to read. Adding fields moves `state`, so `STATE_SCHEMA` and the golden recording move with it (rule 11).

### Gaps

- Developer accounts of Far Cry's or Wildlands' off-screen outpost simulation: none found.
- Kenshi: no developer source; world states from a wiki only.
- Bannerlord's campaign AI: TaleWorlds' blog refused the fetch; only mods' descriptions.
- Brockington's level-of-detail AI for Neverwinter Nights, which has published budget shares, wasn't reached.
- RAND's multi-resolution modelling work (Davis & Bigelow) on consistency between fidelities refused the fetch.

## 6. What to build, ranked by expected gain

Ranked for Sightline's camp as it is today. Each survives rules 9, 12, 13, 16 and 18.

### 1. One emission law, sensors as rows

- **In play.** Every tool is a new way to give yourself away or to read someone else. Smoke beats eyes and cameras but not ears. A hot rifle stays visible to thermal for minutes. A searchlight or a radio is itself a signature.
- **Counter.** Learn which channel a tool reads and stay out of it. The emitter is how you find the tool.
- **Sources.** [Crytek](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf) **[P]**; [Arma 3](https://dev.arma3.com/post/oprep-sensor-overhaul) **[P]**.
- **Build.** `tuning.signatures` (channel, magnitude, lingers) and `tuning.sensors` (channel, range, arc, product). `HEARD_AS` is the seed of this. People are rows. Combine by max per track and channel, not sum. A channel table for environment. Channel and product added to `Percept`.
- **Test.** A sensor row with no instance placed moves no pinned run. The six-point checklist in 2.6 as a review list.

### 2. Evidence: origin, hops, grade; one vote per origin; who may act on what

- **In play.** One rattled man can't lock the camp. Two separate men can. A rumour arrives weaker than a sighting.
- **Counter.** Silence the only witness before he talks. Keep your exposure to one man at a time.
- **Sources.** [Talk of the Town](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter37_Simulating_Character_Knowledge_Phenomena_in_Talk_of_the_Town.pdf) **[P]**; [Brewer](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter04_Knowledge_is_Power_an_Overview_of_AI_Knowledge_Representation_in_Games.pdf) **[P]**; [Admiralty code](https://en.wikipedia.org/wiki/Admiralty_code) **[S]**; [data incest](https://discovery-pp.ucl.ac.uk/15814/1/15814.pdf) **[P, snippet]**.
- **Build.** `origin`, `hops`, `grade` on `Report`. Fusion counts distinct origins per cause. A small table in tuning: what grade and how many origins each act requires (alarm, fires, sweep).
- **Test.** The same shot relayed three times moves the estimate as one vote. Scene: a guard told by voice doesn't run for the alarm.

### 3. Every sensor ends at a person with limited attention

- **In play.** Cameras and tripwires feed an operator. He watches one feed well, and the wall badly. A burst of alerts queues up. Kill him and the wire goes quiet.
- **Counter.** Trip three things at once and move in the burst; take the operator, not the camera. Payday's jammer is the cheap gadget version.
- **Sources.** [Stainer et al., citing Tickner & Poulton: 83/84/64% at 4/9/16 feeds](https://pmc.ncbi.nlm.nih.gov/articles/PMC3786256) **[S]**; [Payday](https://payday.fandom.com/wiki/Social_Stealth) **[W]**.
- **Build.** An operator entity with a queue, `watching` as state, drawn from a tuning curve of feeds to detection. Reports leave through the existing `airwaves`.
- **Test.** Detection against feeds on a bench. A dead operator produces only the delayed 'quiet' report.

### 4. A contact ladder: something, a person, armed, him

- **In play.** At 400 m a guard says something moved. At 150 m he says a man. Green men over-call it.
- **Counter.** Stay in the "something" band. Later: uniform, an animal, a decoy.
- **Sources.** [Combat Mission](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Rabin](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter04_Vision_Zones_and_Object_Identification_Certainty.pdf) **[P]**; [Johnson](https://en.wikipedia.org/wiki/Johnson%27s_criteria) **[S]**.
- **Build.** An integer grade on `Belief` and `Percept`, a deterministic function of angular size, optics and exposure time. No dice (Rabin). Reactions gate on grade; `Belief.seen` is the top of it. The honest view shows it as behaviour.
- **Test.** Lab A's prediction exit test must still pass; if it can't, cut rungs.

### 5. Cry wolf: sensors earn and lose trust

- **In play.** Throw stones at a trip line until they stop coming, then cross it. Or watch the camp post a man there instead.
- **Counter.** It is the counter. The camp's counter is a dog or a person, which costs it a man.
- **Sources.** [NYC audit: 87% unconfirmed, 20–32 min each](https://comptroller.nyc.gov/newsroom/nypds-shotspotter-gunshot-detection-system-overwhelmingly-sends-officers-to-locations-where-no-confirmed-shooting-occurred-new-audit-uncovers) **[P]**; [people sniffer decoys](https://en.wikipedia.org/wiki/People_sniffer) **[S]**. Cost is measured; loss of trust is my inference.
- **Build.** Split the E9 ledger's count into `alarms` and `finds`. Trust = finds over alarms, per sensor. Below a threshold, a response is skipped or a man is posted (a Task).
- **Test.** Bench: N empty alarms cut responses by a known amount; one find restores it.

### 6. The camp port: digest plus mailbox

- **In play.** Nothing yet. Later: a second camp hears of you, late, if the link holds, and you can outrun the news.
- **Counter.** Cut the link between camps; move faster than the report.
- **Sources.** [A-Life](https://www.gamedeveloper.com/game-platforms/interview-inside-the-ai-of-i-s-t-a-l-k-e-r-i-) **[P]**; [Alibi](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter37_Alibi_Generation_Fooling_All_the_Players_All_the_Time.pdf) **[P]**; [LOD Trader](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter14_Phenomenal_AI_Level-of-Detail_Control_with_the_LOD_Trader.pdf) **[P]**; [Lanchester](https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter25_Combat_Outcome_Prediction_for_Real-Time_Strategy_Games.pdf) **[P]**; [STALKER 2](https://www.thesixthaxis.com/2024/12/19/huge-stalker-2-patch-1-1-brings-over-1800-fixes-a-life-improvements/) **[S, snippet]**.
- **Build.** Section 5.2: now, only `origin`, `hops` and a pure `campDigest`.
- **Test.** The digest round-trips dead men, broken devices, level, ledger and threats.

### 7. First-match doctrine

- **In play.** The camp recognises a pattern and commits. Show it the wrong pattern and it's late to the right one.
- **Counter.** Feint from the north, shoot from the south.
- **Sources.** [Klein et al.](https://apps.dtic.mil/sti/pdfs/ADA199492.pdf) **[P, snippet]**; [RPD's weakness](https://en.wikipedia.org/wiki/Recognition-primed_decision) **[S]**; [Combat Mission's delay](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**.
- **Build.** `tuning.doctrine.patterns`, ordered, each a condition on the Picture plus a posture. No match means a slower 'hold and look'. More complex orders take longer.
- **Test.** `explain()` names the matched pattern. A bench for "feint then switch" against time to re-task.

### 8. Contacts clear only by someone going to look

- **In play.** "There's someone out there" lasts. Where goes stale quickly. A false contact makes them spend men.
- **Counter.** Leave no evidence, or plant a contact far away.
- **Sources.** [Combat Mission](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**; [Carlisle](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter34_A_Simple_and_Robust_Knowledge_Representation_System.pdf) **[P]**.
- **Build.** Separate existence from place in the commander's record; `beliefRadius` already grows the place; `SearchState.cleared` is the start. A `check` task clears it. Interacts with the design doc's "settles one level above".

### Further candidates

- **Birds and dogs as ambient sentries** ([Hunt](https://blog.playstation.com/archive/2020/02/17/battle-royale-meets-supernatural-horror-in-cryteks-hunt-showdown-out-tomorrow-on-ps4) **[P]**): emissions with no owner, flushed by anyone near, readable by both sides.
- **Witness and identity as two facts** ([RDR2](https://www.gamepressure.com/red-dead-redemption-2/wanted-system/z2b7e4) **[W]**): that something happened, and who did it, travel separately.
- **Link state per channel** ([Combat Mission](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3843560/manuals/7436ac4733c5aaf22be862782209bfb6ba1567ff/CM2_Manual.PDF) **[P]**): voice radius, radio, wire; each man knows which he has.
- **Forward flood** ([Dishonored 2](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter06_Flooding_the_Influence_Map_for_Chase_in_Dishonored_2.pdf) **[P]**): seed the search map with a barrier behind the last known direction.

## 7. What I could not find

- DCS's AI detection model, at all. Command: Modern Operations' model, only through player posts.
- Hunt's sound-trap mechanics or numbers.
- Any shipped game publishing radio or relay delays. Combat Mission describes what its delay depends on, but gives no numbers.
- A per-hop rate of garbling. The "70% lost" figure could not be traced.
- ELICIT's numbers under network damage. Brehmer's DOODA paper and any delay experiment.
- Doctrinal multi-channel signature tables. Trip-wire and motion-sensor false-alarm rates. Small-drone endurance. FM 7-40's dog figures (scan only).
- How Far Cry, Wildlands or Bannerlord simulate bases off-screen, from a developer. Kenshi beyond a wiki.
- A study measuring how players detect specific kinds of AI cheating.
- Trust loss from false alarms: I have the cost, and did not search for the "cry wolf" literature.

**Method.** 30 search calls, the limit. One of them came back with two result sets. Bohemia's wiki, GlobalSecurity, DTIC, Battlefront's forum, core.ac.uk, RAND, UCL, Fandom wikis and TaleWorlds refused fetches; lines resting on them are tagged [snippet]. Game AI Pro chapters and the Combat Mission manual were read in full from their PDF text layers.
