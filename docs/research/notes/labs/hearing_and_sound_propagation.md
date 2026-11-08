# Hearing and sound propagation: what enemies hear, how sound travels, and how the player hears it

Research date: 7 Nov 2026. Read in full: Game AI Pro chapters on Splinter Cell Blacklist, The Last of Us (two), Mark of the Ninja, Crytek's perception system and NPC search; Tom Leonard's Thief article (GDC 2003); Robert Maher's gunshot-acoustics paper (2006); Steam Audio's official guide; the Dungeon Crawl Stone Soup noise code; Crytek's Hunt: Showdown audio blogs; Ubisoft's Siege posts; Microsoft Research's Project Triton page; Raghuvanshi's 2021 arXiv paper; Unreal Engine 5.8 perception docs; PC Gamer's report of the Overwatch GDC talk. Items marked **(search excerpt)** were seen only as search-engine extracts, because the page blocked automated fetching (GDC slide PDFs, the Bohemia wiki, Audiokinetic's site, some bug-tracker pages). Treat them as medium confidence. The shared web-search budget ran out partway through, so Escape from Tarkov, MGSV, The Last of Us Part II and the Wwise documentation are thin (see the Gaps sections). Everything in the "Inferences" sections is my reasoning or my own measurement, not a source's claim.

Sightline facts used in the fit notes come from the repository: `src/sim/sound.ts` (audibility = radius / distance, 1 at the radius), `src/sim/world/grid.ts` (a 2.5 m map layer and a 0.5 m site layer; Walkable, BlocksSound, Roofed and Steep flags; east/north walk edges; doors override cells from sim state), `src/sim/world/ambient.ts` (creek and generator sources with threshold radii) and `src/config/tuning.ts` (footstep radius = movement × surface × 12 m, so 7–25 m; creek 38 m; generator 70 m; site margin 12 m).

## Q1. How did Thief, Splinter Cell, Hitman, The Last of Us, Hunt, Siege, Overwatch, Tarkov, Arma 3, Sniper Elite and MGSV implement AI hearing and sound propagation? What data structures, at what cost?

### Takeaway
Shipped games split into two families. One family uses a designer-set radius per sound, cut by raycast occlusion: Half-Life, The Last of Us, Hunt and the Unreal default. The other measures distance along a coarse graph so sound goes around walls: Thief's rooms, Blacklist's area-and-choke graph, Mark of the Ninja's triangle "sound mesh", Siege's propagation nodes, Hitman's rooms and portals, and a grid flood fill in DCSS. Every stealth game that cared about "no hearing through walls" measured path distance on a cheap, coarse structure, once per sound event. Several used the same structure for the player's audio: Mark of the Ninja, Thief, Siege and Overwatch.

### Cited Findings

**Baseline: radius from loudness (shipped: Half-Life 1998; Unreal Engine 5.8 today)**
- Half-Life's hearing multiplies a sound's volume by the listener's hearing sensitivity. The product is a distance within which the AI hears the sound. Hearing is also a catch-all channel: AIs "hear" made-up smells coming from corpses. — [Leonard, Gamasutra/GDC 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm) (read through a Wayback Machine copy)
- Unreal Engine 5.8's hearing sense is set up with Hearing Range, Detection by Affiliation and Max Age. Sounds come from Report Noise Event. "LoS Hearing Range" only draws a different debug radius. The docs say nothing about occlusion or walls. — [Epic, AI Perception docs (UE 5.8)](https://dev.epicgames.com/documentation/en-us/unreal-engine/ai-perception-in-unreal-engine)

**Thief: The Dark Project (1998) / Thief II (2000), Dark Engine; Deus Ex: Invisible War (2003). Shipped.**
- Thief's sounds, rendered or not, carried semantic tags and propagated through the world's 3D geometry. A sound reached an AI from the direction it would in the real world, with attenuated awareness values, and spoken concepts could carry information from other AIs. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm)
- The senses send periodic "awareness pulses". Sound and vision are compared and the dominant one sets awareness. A rise must pass a time filter tied to the current state, which is how reaction delays and player forgiveness work. A fall decays gradually through a "capacitor". When pulses stop, the AI gets some "free knowledge" scaled by its state, so it appears to deduce. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm)
- Thief level designers laid a separate layer of "sound rooms" around the terrain so the engine could compute propagation. It was tedious and error-prone. — [GameDev.net, "Creating Virtual Worlds"](https://archive.gamedev.net/archive/reference/design/features/vworld/page2.html) **(search excerpt)**. DromEd doors are objects that form small portals. — [ThieveryUT DromEd/UnrealEd notes](https://thieveryut.com/Mapping/DromEdToUnrealEd.html) **(search excerpt)**
- Deus Ex: Invisible War's sound programmer, Brian Sharp, said its propagation is very similar to Thief 1 and 2:
  - Sound passes freely through open doorways.
  - Closing a solid door makes the far side much quieter. Frail doors block less; a solid metal door may block everything.
  - Speech reaches a guard one floor down by travelling along the hall, down the stairs and back along the next hall.
  - Sharp also notes that sound goes both ways. — [GameBanshee, 13 Feb 2004, summarizing a TotalVideoGames dev diary](http://www.gamebanshee.com/ka3h4)

**The Dark Mod (open-source Thief-like game on the Doom 3 engine). Shipped, free.**
- Sound reaches the AI and the player through Doom 3's areas and visportals.
- In 2013 (rev 5695, fixed in TDM 2.00), loss across portals reaching the player switched from a distance method to a dB method.
- A portal-settings entity applies loss to the AI, the player or both. Loss through a door scales with how far it is open, reaching full volume at 50% open. A 10 dB door loss was added for the player only.
- A closed func_portal has a default occlusion distance of 450 units: it silences small-radius sounds and only quietens large ones. — [TDM bug 3042](https://bugs.thedarkmod.com/view.php?id=3042)
- A restore bug: portal sound-loss values live in engine data that is rebuilt after a restore. One door class did not notify the engine, so after loading a save, AI footsteps played at full volume through closed doors. — [TDM bug 3455](https://bugs.thedarkmod.com/view.php?id=3455) **(search excerpt)**
- A missing ×0.015 multiplier made attenuation through location boundaries about 67× too strong. — [TDM bug 3660](https://bugs.thedarkmod.com/view.php?id=3660) **(search excerpt)**

**Splinter Cell: Conviction (2010) / Blacklist (2013), Ubisoft Toronto. Shipped.** Source: [Walsh, "Modeling Perception and Awareness in Tom Clancy's Splinter Cell Blacklist", Game AI Pro 2 (2015), ch. 28](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
- Every audio event has a radius and a priority. An NPC in range hears it and reacts according to the event, who else is in range, and his own state.
- On Conviction, the team first asked the sound engine for audio distance. Some calls were extremely expensive, and when audio data hadn't been built (often), testing turned up false detections.
- They switched to an "area path" over TEAS, a graph of areas connected by choke points.
  - Designers tagged navmesh triangles into sub-navmeshes, one per area.
  - Doors and windows are choke nodes; walkable chokes are made of overlap triangles that belong to both areas.
  - In the same area, sound distance is the straight line.
  - Otherwise it is the sum of the legs: source to the nearest choke into the next area, choke to choke, and the last choke to the listener.
  - The chapter calls it a rough approximation, but accurate enough that they switched and never went back.
- TEAS also stopped NPCs without line of sight from staring at walls: they look at the door or window leading into the player's area.
- Fairness: NPCs who are offscreen, but far enough away that not hearing is plausible, have their hearing halved for certain events (the same for some indirect visual events). Hearing wasn't cut entirely offscreen, because a guard just around the corner who failed to hear you would feel absurd.
- Missing-ally logic: if NPC A has been within earshot (by sound distance) of NPC B for 10 s, and B then makes no noise for 5 s more (because he is dead), A gets an investigation event with a long cooldown.

**Mark of the Ninja (Klei, 2012). Shipped.** Source: [Miles, "How to Catch a Ninja", Game AI Pro (2013), ch. 32](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter32_How_to_Catch_a_Ninja_NPC_Awareness_in_a_2D_Stealth_Platformer.pdf)
- Sounds are "interest sources": a sense, a priority, a radius, a time-to-live and an offset, with flags such as rediscoverable or remove-duplicates. The final game has about 60 declarations. Running footsteps use a loud-noise priority with a lifetime of `4*FRAMES`, a constant the chapter doesn't define, so it may mean 4 s.
- Detection is an A* path from the source to the agent's head over a "sound mesh". The mesh is a triangle mesh of the level's empty space, generated with Shewchuk's Triangle when a level is exported. Only agents inside the maximum radius are tested. An agent inside the radius with no path to the source doesn't hear it.
- The audio system runs the same pathfinding between the player character and each sound source to decide how much filtering to apply.
- Each agent holds one interest at a time, with no queue. Each source is noticed once per agent. The exception is the "suspect" source on the player, which can be noticed again and again.

**The Last of Us (Naughty Dog, 2013). Shipped.** Sources: [Botta, "Infected AI in The Last of Us", Game AI Pro 2, ch. 33](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf); [McIntosh, "Human Enemy AI in The Last of Us", ch. 34](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter34_Human_Enemy_AI_in_The_Last_of_Us.pdf)
- The AI hears logical sound events, not the rendered audio.
  - Designers choose which sounds each character type hears, and at what range.
  - Sound designers can change the audio without touching the AI.
  - Logical events were tied to real audio wherever possible, so players can predict reactions.
  - A logical "breathing" sound with no audio lets the AI sense a nearby player who is standing still.
- Effective radius = event radius × a tunable multiplier for each character type and behaviour. Infected hear about 6× better than Hunters, and hear less while unaware, which slows the pace.
- Occlusion is raycast. Rays go from every character inside the radius to the source to measure how occluded it is. The sound reaches everyone in range who isn't completely occluded.
- The radius of the player's movement sounds scales with speed, so crouching next to Infected isn't safe. Infected become agitated when they start hearing noise, which warns the player.
- Smoke bombs block the Infected's hearing as well as their sight: a gameplay choice over realism.
- Human enemies: an investigate skill reacts to distraction sounds, and one NPC takes the Investigator role.
- The audio side was covered in Jonathan Lanier's GDC 2014 talk "Aural Immersion": obstruction and occlusion problems, plus a mix that changes with game state. — [GDC Vault](https://www.gdcvault.com/play/1020444/Aural-Immersion-Audio-Technology-in) (abstract only)

**CryENGINE "Target Tracks" perception (Crytek). Shipped engine system.** Source: [Welsh, Game AI Pro (2013), ch. 31](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)
- Stimuli are typed: movement, loud movement, bullet rain (bullets passing close), collision, loud collision, weapon fired and explosion. Ambient birdsong and machinery are deliberately not stimuli.
- A weapon-fire stimulus comes from the same animation event as the audio and the muzzle flash. A collision stimulus carries the ID of the character who caused it, so the AI can ignore a friend bumping a barrel.
- Each stimulus drives an ADSR envelope. Example peaks: footsteps 25, weapons 50, sight in the main field of view 100. An optional "ignore time" at attack can fake the speed-of-sound delay.

**Hitman (IO Interactive, 2016). Shipped.**
- Stepan Boev's talk "Sound Propagation in Hitman" (GDC Europe 2015) starts from the problem that distance attenuation alone gives artifacts when a sound is close but in another space or behind obstacles. The solution aims to be cheap, to work in open and closed spaces, and to handle dynamic geometry. — [GDC Vault](https://www.gdcvault.com/play/1022774/Sound-Propagation-in)
- The slides describe rooms and portals: an average level has 275 rooms and 800 portals, and the audio budget is about 1 ms on the main thread plus up to half of one core. Obstruction by objects is handled separately, through Wwise volume and low-pass curves. — [Boev slides PDF](https://twvideo01.ubm-us.net/o1/vault/gdceurope2015/Boev_Stepan_Sound%20Propagation%20in.pdf) **(search excerpt; the PDF was access-denied)**

**Overwatch (Blizzard, 2016). Shipped.**
- High dynamic range (HDR) audio, where the loudest sound wins, wasn't enough. Blizzard built an "importance system" that boosts the enemies most threatening to you (looking at you, shooting at you, nearby) and dims everything else. — [PC Gamer on Lawlor and Neumann's GDC 2016 talk](https://www.pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see/)
- The team built "paths" that measure the extra distance sound travels around structures. That extra distance drives a muffling that changes as both players move. Lawlor called it maybe the most important feature for playing by sound: "You can almost listen to the walls." — [PC Gamer](https://www.pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see/)
- Enemy footsteps are mixed louder than allies'. — [Game Developer, 7 Jul 2016](https://gamedeveloper.com/audio/video-how-i-overwatch-i-was-designed-so-people-could-play-by-sound-)
- How the paths are stored (hand-placed splines or a graph) wasn't confirmed. A third-party blog claims interpolation between splines to avoid jumps. **(Search excerpt; low confidence.)**

**Rainbow Six Siege (Ubisoft Montreal, 2015–). Shipped.**
- Siege's propagation, per audio director Louis-Philippe Dion. — [Game Developer deep dive, 18 Jan 2017](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i-)
  - Propagation nodes sit on every breachable surface. Sound takes the cheapest path, where cost = path length + accumulated turn angles + a penalty from the destruction state of the nodes it passes.
  - Nodes in intact walls cost infinity. Barricades and reinforcements add a penalty that depends on material.
  - The sound is moved virtually toward the chosen path's direction, which is how diffraction is simulated.
  - Occlusion, meaning absorption through walls, is done one of two ways: a pre-rendered muffled variant (such as footsteps on the ceiling), or real-time filtering of the direct path. Real-time filtering is CPU-heavy and used mostly for guns. The occluded and path versions can play together.
  - Occlusion alone would have been a "wall hack", which is why obstruction was added.
- The 2020 status report:
  - Maps are split into zones joined by connection points (walls, floors, doors, windows), and the system finds the best path to the listener given the current destruction.
  - Some bugs (inverted audio, missing sounds) couldn't be reproduced in-house.
  - A full rebuild of propagation was needed and would not finish in Year 5. — [Ubisoft, 11 Jun 2020](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/HyDyYTuRkWtyYQ3WDFeEL/rainbow-six-siege-status-report)
- Siege X (June 2025) reworked propagation and reverb. — [GINX interview](https://www.ginx.tv/en/interview-creative-director-siege-x-changes) **(search excerpt; low confidence)**

**Hunt: Showdown (Crytek, 2018–). Shipped.**
- Hunt's 2018 approach. — [Crytek, 26 Sep 2018](https://www.huntshowdown.com/news/hunt-audio-readability-realism-and-consistency)
  - Each source casts a ray to the listener to find obstacles and their surface; denser surfaces muffle more.
  - Underground areas fooled the ray, so they were tagged with a special material that forces high occlusion.
  - Each sound has an attenuation template set by how powerful it is.
  - A readability rule: by ear, a player should know what a sound is, where it is and what state it is in.
  - "Sound traps" give the player away: ravens, ducks, chickens, dogs, glass piles and hanging cans.
- Update 2.4. — [Crytek, 6 Jun 2025](https://www.huntshowdown.com/news/dev-insight-audio-design-recap-what-s-new-in-update-24)
  - Obstruction checks for objects between source and listener and filters by material, whatever the output format.
  - Brick dampens less than log walls. Stone gets stronger filters partly because enemies behind it are less dangerous.
  - Positioned sounds update more often.
  - Ambient loops were cut back so that important sounds stand out.
  - An echo system, added with the "1896" relaunch, applies only to gunshots and explosions.
  - Indoor gunshots got smoother attenuation so players can judge distance.
- CrySpatial, Hunt's own HRTF spatializer (2019), handles direction only. Distance attenuation and occlusion are handled by the game separately. — [Crytek, 9 May 2025](https://www.huntshowdown.com/news/dev-insight-a-deep-dive-into-3d-audio-in-hunt)

**Other shipped propagation work (abstracts only)**
- Ubisoft, Jean-François Guay (GDC 2012): a lightweight propagation method for obstruction and occlusion, including the virtual direction and position of a source. The abstract says it was used successfully in Ubisoft AAA titles, without naming them. — [GDC Vault](https://www.gdcvault.com/play/1015492/Real-time-Sound-Propagation-in)
- Quantum Break (Remedy, 2016): reused the Umbra spatial database, built for occlusion culling, for audio occlusion. — [GDC Vault 2015](https://gdcvault.com/play/1022402/Using-Umbra-Spatial-Data-for)
- Microsoft VERA (GDC 2018): a voxel engine for real-time acoustics that gives occlusion, obstruction, early reflections and portals. — [GDC Vault](https://gdcvault.com/play/1025063/Audio-Propagation-Through-the-Ears)

**Open source: Dungeon Crawl Stone Soup's noise grid. Shipped; GPL-2.0-or-later.** Sources: [noise.h](https://github.com/crawl/crawl/blob/master/crawl-ref/source/noise.h), [shout.cc](https://github.com/crawl/crawl/blob/master/crawl-ref/source/shout.cc), [LICENSE](https://github.com/crawl/crawl/blob/master/LICENSE)
- The algorithm is a multi-source breadth-first expansion over the dungeon grid, run once per turn for every queued noise.
- Intensities are integers in thousandths, with an audible floor of 1000.
- Base loss is 850 per cell. Walls cost ×12, closed doors ×8, trees ×3, statues ×2, and permanent rock stops sound.
- Each change of direction adds 25% per "turn step": 0 for straight on, 1 for a knight's move, 2 for a right angle, 3 for a sharp turn.
- Each cell stores the neighbour the noise came from and how far it has travelled.
- A source comment explains that per-cell loss was cut from 1000 to 850 because walls and doors now absorb sound, and that this makes open levels "nastier".
- Ambient noise reduces each noise's loudness by a random average of the ambient level.

**Sniper Elite, Arma 3, Tarkov, MGSV:** gunshot hearing is in Q4.

### Inferences (fit with Sightline: one line per technique)
- **Radius from loudness (Half-Life, UE):** this is Sightline's current `audibility = radius / distance`. Keep it as the inner law and give it path distance instead of the straight line.
- **Thief's tagged sounds arriving "from the right direction":** a flood on the site grid gives the arrival direction for free, by following parent cells back from the listener. Typed events (footstep, shot, impact, voice, object) are already in the design doc.
- **Thief and DX:IW door muffling:** model a door as a dB loss on the cells it overrides from sim state (grid.ts already plans for this), with solid and frail values in tuning.
- **The Dark Mod's dB losses through portals:** express door and wall losses in dB in tuning. Under Sightline's 6 dB-per-halving law, a loss of L dB multiplies effective distance by 10^(L/20) (dpow is allowed), so a 10 dB door ≈ ×3.2 distance. Its restore bug is a warning: derive the propagation field purely from `sim.state` plus the world, so restore rebuilds it and the state hash covers its inputs (rules 9 and 11).
- **Blacklist's area-and-choke graph (TEAS):** at generation, build a choke graph of the camp's doorways and windows from the module library, with all-pairs distances. It is very cheap per query and deterministic, but a grid flood is simpler and was fast enough in my benchmark (Q2).
- **Blacklist's halved hearing offscreen:** this contradicts Sightline's "one law for both" rule. The honest alternative is to keep the law and fix the unfairness with feedback (tiered barks, an honest-view cue). Owner's call.
- **Blacklist's missing-ally check (earshot for 10 s, then silence for 5 s):** easy to express with sound distance on the site grid and the schedule. It fits lab E (camp brain).
- **Mark of the Ninja's A* on a sound mesh, with the same path driving audio filtering:** direct precedent for Sightline's rule that the player's speakers use the guards' law. Sightline's grid takes the place of the triangle mesh.
- **TLOU's logical events with multipliers by type and behaviour:** already Sightline's model (logical events in the sim). Add hearing multipliers by awareness state in tuning. TLOU's raycast-only occlusion would stop sound around corners, which contradicts the "around buildings" spec.
- **Crytek's typed stimuli and ADSR envelopes:** envelopes map cleanly onto fixed 30 Hz ticks. The "ignore time" equals using `ctx.schedule` for speed-of-sound delay, and "bullet rain" is the supersonic crack stimulus.
- **Hitman's rooms and portals:** camp buildings come from handmade modules, so rooms and portals could be authored per module. The grid flood avoids that authoring.
- **Overwatch's excess path, muffling and importance mix:** excess path (path length minus straight line) should drive a low-pass in the renderer. An importance mix is renderer-only and must never feed back into the sim, or it breaks "you hear what a guard would hear".
- **Siege's path cost with turn angles and destruction penalties:** a turn penalty (also in DCSS) is a cheap stand-in for diffraction loss around corners. Siege plays the path (obstruction) and the through-wall (occlusion) versions together: Sightline can do the same with one flood plus one grid raycast (Q2).
- **Hunt's raycast and material filter:** Sightline's BlocksSound flag is binary. A per-cell transmission-loss byte (like the existing `cover` byte) would let a tent wall differ from a stone wall. Hunt's "sound traps" (birds, dogs, cans) map to camp-generator features that turn the player's small noise into a loud one.
- **Umbra, VERA and Guay:** no equivalent data in the browser sim. Cite them only to show that studios reuse existing spatial data (visibility, voxels, navmesh) rather than building an acoustic model.
- **DCSS's noise grid:** the closest analogue to Sightline: integer arithmetic, a multi-source flood on a flagged grid, per-feature loss, turn penalty, ambient-reduced loudness, and a fuzzy heard position (Q3). It is GPL: study the design, don't copy the code into Sightline unless the project's license allows.

### Gaps
- **Escape from Tarkov:** no primary source found on its spatializer or AI hearing before the search budget ran out. I recall Tarkov moved to Steam Audio around 2021 (patch 0.12.12), but that is unverified.
- **MGSV:** nothing found on AI hearing (rain masking, suppressor radii, triangulating sniper fire).
- **The Last of Us Part II:** nothing found on changes to hearing or propagation.
- **Hitman:** nothing found on how its AI hears.
- **Overwatch:** the path data structure and cost are unconfirmed.
- **Thief:** the internal room and portal database (attenuation per room, door "blocking" values) is unconfirmed beyond Leonard's summary and the DX:IW diary.
- **The Dark Mod:** source license not verified this session.

## Q2. Path-based propagation, raycast occlusion or wave-based acoustics: which do shipped games use for gameplay-relevant hearing, and what is cheap enough for about 16 listeners at 30 Hz?

### Takeaway
For gameplay hearing (AI and competitive play), shipped games use graph or path distance on a coarse structure: Thief, Blacklist, Mark of the Ninja, Siege, Hitman, Overwatch, DCSS. Some use a single raycast with material filtering instead (TLOU, Hunt). Wave-based acoustics shipped mostly to improve the player's audio, through precomputed bakes on static geometry (Project Acoustics in Gears of War 4/5, Sea of Thieves and Borderlands 3). Steam Audio's baked probe paths sit in between. For Sightline, one bounded Dijkstra per sound event on the 0.5 m site grid is cheap. In my benchmark it took about 0.2 ms for a footstep and about 3.4 ms to flood the whole camp. Its cost doesn't grow with the number of guards.

### Cited Findings

**Path or graph distance (shipped)**
- Thief and DX:IW propagate through world geometry, with doors muffling. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm); [GameBanshee 2004](http://www.gamebanshee.com/ka3h4)
- Blacklist uses areas joined by chokes. It was chosen because sound-engine distance queries were too expensive and too fragile. — [Walsh 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
- Mark of the Ninja runs A* over a triangle mesh of empty space, testing only agents inside the radius. — [Miles 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter32_How_to_Catch_a_Ninja_NPC_Awareness_in_a_2D_Stealth_Platformer.pdf)
- Siege uses a cheapest path over nodes, rebuilt as destruction opens or closes them. — [Game Developer 2017](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i-)
- Hitman uses rooms and portals: about 275 rooms and 800 portals per level, inside a 1 ms main-thread budget. — [Boev slides](https://twvideo01.ubm-us.net/o1/vault/gdceurope2015/Boev_Stepan_Sound%20Propagation%20in.pdf) **(search excerpt)**
- Overwatch uses paths that give the excess distance. — [PC Gamer](https://www.pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see/)
- DCSS floods its whole level grid once per turn. — [DCSS shout.cc](https://github.com/crawl/crawl/blob/master/crawl-ref/source/shout.cc)

**Raycast occlusion (shipped)**
- TLOU casts one ray set per character inside the radius. A fully occluded character doesn't hear; a partly occluded one does. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)
- Hunt casts one ray per source to the listener and filters by surface material. It needed special-material hacks underground. — [Crytek 2018](https://www.huntshowdown.com/news/hunt-audio-readability-realism-and-consistency); [Crytek 2025](https://www.huntshowdown.com/news/dev-insight-audio-design-recap-what-s-new-in-update-24)

**Steam Audio (Valve; open source under Apache-2.0; latest release v4.8.1, 11 Feb 2026).** Sources: [Steam Audio guide](https://github.com/ValveSoftware/steam-audio/blob/master/core/doc/guide.rst); [repository](https://github.com/ValveSoftware/steam-audio)
- **Occlusion:**
  - Occlusion is a fraction from 0 to 1. Transmission through the occluder is a 3-band EQ applied to the occluded part.
  - Both are usually found by tracing rays.
  - The cheap mode is one ray from source to listener, which can jump abruptly in and out of occlusion. Smoother modes cost more CPU.
- **Pathing:**
  - It was added because ray-traced reflections need very many rays to find paths that bend around corners or pass through several openings.
  - Pathing finds the shortest unoccluded probe-to-probe paths from source to listener.
  - Probes are generated, for example on a uniform floor grid (2 m spacing, 1.5 m high in the guide's example).
  - Paths are baked offline. The example bake tests visibility with one ray, skips probe pairs more than 50 m apart and stores no paths longer than 100 m.
  - At runtime, paths come from the baked data and are rendered as an ambisonic sound field.
  - Baked paths assume static geometry. Steam Audio can re-check them against dynamic occluders and search for alternatives.

**Wave-based, precomputed: Microsoft Project Triton / Project Acoustics**
- Triton models the real wave physics of sound, including diffraction. Because simulation is expensive, it bakes static geometry offline, like light baking, and compresses the result for fast lookup.
- At runtime it gives obstruction, occlusion, "portaling" (sound through a doorway arrives from the doorway, not the source), reverberance and clarity, and decay time, within practical CPU and RAM budgets, down to mobile.
- Games listed: Gears of War 4 and 5, Sea of Thieves, Borderlands 3. Project Acoustics ships plugins for Unity and Unreal, introduced at GDC 2019. — [Microsoft Research, Project Triton](https://www.microsoft.com/en-us/research/project/project-triton/)
- Precomputed wave methods are cheap at runtime but limited to static scenes. Raghuvanshi's 2021 extension handles dynamic portals such as doors. It finds the portals on the shortest diffracted path using the precomputed delay and direction data, then applies each portal's open or closed loss. The search scales at worst linearly with the number of portals, much cheaper than a global path search over the scene area. Demos ran in UE4 with Wwise. Research, building on a shipped system. — [arXiv 2107.11548](https://arxiv.org/abs/2107.11548)

**Cost data points**
- Hitman: about 1 ms on the main thread plus up to half a core for all audio, with about 800 portals. — **(search excerpt)** [Boev slides](https://twvideo01.ubm-us.net/o1/vault/gdceurope2015/Boev_Stepan_Sound%20Propagation%20in.pdf)
- Blacklist: sound-engine distance calls were sometimes extremely expensive; the area path replaced them. — [Walsh 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
- NPC search: line-of-sight raycasts to search spots are expensive, so timeslice them; one every 1–2 s per spot is enough. — [Welsh, "Looking for Trouble", Game AI Pro 2, ch. 27](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter27_Looking_for_Trouble_Making_NPCs_Search_Realistically.pdf)
- Mark of the Ninja: a maximum radius per sound limits which agents are tested at all. — [Miles 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter32_How_to_Catch_a_Ninja_NPC_Awareness_in_a_2D_Stealth_Platformer.pdf)
- Siege: real-time filtering and impulse-response reverb were limited by CPU, so gun reverb was baked. — [Game Developer 2017](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i-)

### Inferences
- **My benchmark (a measurement, not a source).** I timed a bucket-queue (Dial) Dijkstra in Node 22 on this Mac. It used integer step costs (10 straight, 14 diagonal, no corner cutting), BlocksSound cells were impassable, and the camp was synthetic: rectangular buildings with door gaps. It was a naive implementation with JavaScript arrays as buckets.

  | Flood | Cells visited | Time per flood |
  | --- | --- | --- |
  | Footstep, 21 m, on the 0.5 m grid | ~5,000 | 0.20 ms |
  | 70 m (the generator's radius) | ~56,000 | 2.0 ms |
  | Whole 150 m × 150 m site grid (300 × 300) | ~90,000 | 3.4 ms |
  | Whole 512 × 512 map layer | ~262,000 | 9.4 ms |

  A tick has a 33 ms budget. Typed-array ring buffers would probably be 2–3× faster. Re-measure in Chromium, Firefox and WebKit.
- **Run the flood from the source, so cost doesn't depend on the number of listeners.** Run one bounded flood per sound event from its source, stopping where the sound falls below the lowest possible masked threshold. All 16 guards, and the player's audio, then read their own cell, so cost is independent of the guard count. This is DCSS's design, and it suits Sightline's per-event model better than A* per listener (Mark of the Ninja). For the player's ears, one flood from the player's cell gives distances to every source, since grid paths are symmetric. Rerun it when the player changes cell.
- **Keep both the path and the through-wall routes, as Siege does.**
  - Obstruction: the flood with BlocksSound impassable gives the path around walls.
  - Occlusion: a DDA raycast on the site grid counts walls crossed, at a dB loss per wall from tuning.
  - Audibility is the louder of the two, or their power sum.
  - Footsteps die behind walls, but a gunshot still carries through a wall as a muffled thud from the true direction, while the path version gives the doorway direction.
  - Additive per-cell costs (DCSS-style ×12 for a wall) only approximate Sightline's multiplicative dB law. The two-route approach keeps the law exact.
- **Outdoors, don't flood the 2.5 m map layer.** No walls exist outside the camp: use the straight line, plus an optional ridge check (sample the heightfield along the segment) for terrain shadowing. That costs 16 segment checks per shot. To bring an outdoor shot into the camp, seed a multi-source flood on the site boundary cells, each starting at its straight-line distance from the shooter. That is one site flood per shot, about 3.4 ms in my benchmark.
- **The speed of sound gives a free time-slicing budget.** The report covers 343/30 ≈ 11.4 m per tick, so a gunshot's flood can be expanded in distance bands tick by tick: literally the wavefront. A guard hears it on the tick the front reaches his current cell. Deterministic options:
  - Compute the field once at emission and keep it as a cache derived from state (keyed by sound id, rebuilt on restore), then schedule each guard's arrival from it.
  - Or keep the frontier in `sim.state`. That is heavier for the hash.
- **Rules to keep for determinism.**
  - Use integer step costs, a fixed neighbour order and a bucket queue (no ambiguous ties in a heap order).
  - `Math.sqrt` is allowed and `Math.hypot` is not.
  - Fixed iteration caps (rule 18).
  - Door state changes go through state, so the field is a pure function of state.
- **Wave-based bakes don't fit (Triton, Steam Audio's baked paths).** They need offline bakes of static geometry, and Sightline generates camps per seed in the browser. Their outputs are the right schema for the sim-to-renderer snapshot, though: obstruction in dB, excess path, arrival direction through the doorway, and reverb class.
- **Fit: Steam Audio.** Apache-2.0 C++. A WebAssembly build could spatialize the player's audio, but its pathing bake and raycasts aren't deterministic sim code. Use the idea (probe-to-probe shortest paths); Sightline's grid cells are already the probes.
- **Fit: dynamic portals (Raghuvanshi 2021).** Same trick as Blacklist's chokes: only doors on the shortest path matter. That is cheap to evaluate from door state.

### Gaps
- Audiokinetic's Wwise Spatial Audio documentation (rooms and portals, diffraction, transmission, path search depth, CPU costs) blocked automated fetching, and the search budget ran out. Its model is known here only indirectly: Hitman used Wwise curves, and Raghuvanshi demonstrated with Wwise.
- Overwatch's, Siege's and Hitman's per-query costs in milliseconds or rays aren't published in the sources I could read.
- No source compared path-based and raycast-based AI hearing in playtests.

## Q3. How do games model ambient masking and localization error, choose an investigation target from a heard sound, and sharpen the estimate over repeated sounds?

### Takeaway
Masking shipped in three forms:
- a visible threshold, where your noise must stay below the ambient level (Splinter Cell: Chaos Theory's meter);
- discrete "loud areas" or loud moments that cover shots (Sniper Elite V2–5);
- ambient noise subtracted from each sound's loudness (DCSS).

Localization error is mostly rough design rules rather than physics:
- DCSS fuzzes the heard position by how much longer the path was than the straight line;
- Blacklist and Thief make sound arrive from the doorway it came through;
- the TLOU Infected walk to the stimulus itself;
- Sniper Elite 3 sharpens the camp's knowledge with each shot (cautious, then zeroing in, then the exact position).

Psychoacoustics supports a threshold-shift model of masking and roughly 1° accuracy in front versus about 15° to the side.

### Cited Findings

**Masking**
- Splinter Cell: Chaos Theory (2005) added a meter of Sam's noise alongside the environment's ambient noise. Sam must make less noise than his surroundings or guards hear him, and repeated sounds raise guard stress gradually. — [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Chaos_Theory) (secondary)
- DCSS: when ambient noise is high, each noise loses loudness, by a random average of the ambient level, before it propagates. — [DCSS shout.cc](https://github.com/crawl/crawl/blob/master/crawl-ref/source/shout.cc)
- **Sniper Elite** (secondary sources):
  - **V2 (2012):** one fan guide says a masking sound comes roughly every 10 s. — [Gamepressure V2 tips](https://www.gamepressure.com/sniperelitev2/overall-hints/zd3be3) **(search excerpt; low confidence)**
  - **3 (2014):** shots must be masked with environmental sounds, and some levels have equipment such as generators you can sabotage to make noise. — [Engadget, 11 Jul 2014](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html)
  - **4 (2017):** artillery and overhead aircraft always cover a rifle shot, but a nearby gunfight doesn't, which the reviewer found inconsistent. — [Game Informer, 13 Feb 2017](https://www.gameinformer.com/games/sniper_elite_4/b/playstation4/archive/2017/02/13/sniper-elite-4-game-informer-review)
  - **5 (2022):** "loud areas" are shown by a sound-wave indicator at the top of the screen. You can make one by tampering with a generator or a vehicle engine, and loud ambient events such as artillery and planes count too. — [Gamepressure SE5 stealth guide](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d)
- The Last of Us: smoke clouds make the Infected deaf as well as blind. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)
- Hunt 2.4 cut back ambient loops so players could tell important sounds from unimportant ones. The game's own ambience was masking gameplay information. — [Crytek 2025](https://www.huntshowdown.com/news/dev-insight-audio-design-recap-what-s-new-in-update-24)
- Crytek: ambient sounds such as birdsong and machine whirr aren't AI stimuli at all. — [Welsh 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)
- **Psychoacoustics** (secondary). — [Wikipedia, Auditory masking](https://en.wikipedia.org/wiki/Auditory_masking)
  - The masked threshold is the quietest level of a signal that can still be heard over a given masker. The amount of masking is that threshold minus the unmasked threshold. Example: a sound audible at 10 dB SPL in quiet needs about 26 dB SPL over a vacuum cleaner, 16 dB of masking (20 dB for another listener).
  - Masking is strongest when the frequencies match, and is limited to a critical band. It spreads upward in frequency as the masker gets louder.
  - Masking also works across time: about 20 ms before a masker starts and about 100 ms after it ends.

**Localization accuracy**
- People localize to about 1° in front and about 15° to the sides. The minimum audible angle is about 1° on the median plane and about 7° at 75° azimuth (Wang and Brown 2006). Front and back are told apart by pinna cues.
- Distance cues are loudness (for familiar sources), the ratio of direct to reflected sound, high-frequency loss, the initial time-delay gap and motion parallax. The article gives no figures for distance accuracy. — [Wikipedia, Sound localization](https://en.wikipedia.org/wiki/Sound_localization) (secondary)

**Choosing an investigation target**
- **DCSS's "perceived position" for each monster that hears a noise:**
  - If the noise travelled in a straight line, or the listener can see the source, the listener knows the exact origin, at any range.
  - Otherwise it takes the excess (path minus grid distance), shifts the point from the source toward the listener by a weight of 75 × excess / distance against 200 for the source, and adds random fuzz of up to ± excess on each axis (each draw averages two rolls).
  - The result is clamped to the map. — [DCSS shout.cc](https://github.com/crawl/crawl/blob/master/crawl-ref/source/shout.cc)
- Blacklist: NPCs without line of sight look at the choke (a door or window) leading to the player's area, rather than at the player through a wall. — [Walsh 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
- Thief: a sound reaches the AI from the direction it would in the real world. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm)
- Siege moves a sound virtually toward the direction of its path. — [Game Developer 2017](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i-)
- Triton's "portaling" makes sound through a door arrive from the door. — [MSR](https://www.microsoft.com/en-us/research/project/project-triton/)
- The TLOU Infected go to the stimulus itself (where a bottle landed) rather than inferring a thrower. Hunters infer that someone is nearby. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)
- **"Looking for Trouble" (generic AAA search):**
  - Hostile stimuli (gunfire, explosions) start an aggressive search; distractions (a bottle, a knocked-over prop) start a cautious one.
  - Phase 1 checks the last known position, limiting how many NPCs go in a cautious search.
  - Phase 2 builds search spots from cover hidden from the estimated position, filled out with hidden navmesh points if needed.
  - A coordinator hands out spots. Every searcher's line of sight clears unsearched spots, with raycasts timesliced every 1–2 s.
  - Occupancy maps (Isla 2006, "Probabilistic target tracking and search using occupancy maps", AI Game Programming Wisdom 3) are suggested as another source of search areas. — [Welsh, Game AI Pro 2, ch. 27](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter27_Looking_for_Trouble_Making_NPCs_Search_Realistically.pdf)
- **TLOU Infected search:**
  - A graph of search points is built over the navmesh by line of sight, and points are chosen by the player's predicted location.
  - The "canvass" behaviour lays a logical grid over the canvass radius, marks obstacles and out-of-radius cells as seen, and picks the animation whose end pose looks into the most unseen cells in a sensory wedge.
  - Designers set the canvass radius and how long it lasts. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)

**Sharpening with repeated sounds**
- Sniper Elite 3 escalates per shot:
  - First shot: nearby enemies become cautious.
  - Second shot: they zero in.
  - Third shot: every enemy on the map knows exactly where you are.
  - The UI warns when your position may be compromised. The suggested routine is to shoot, move up to about 30 m, and shoot again. — [Engadget 2014](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html)
- Sniper Elite 4 dropped the relocation meter, a set amount of noise allowed before enemies knew your position. Enemies near a noise are alerted to your position at once. — [Game Informer 2017](https://www.gameinformer.com/games/sniper_elite_4/b/playstation4/archive/2017/02/13/sniper-elite-4-game-informer-review)
- Thief: awareness rises only after a time filter set by the current state, and decays through a capacitor. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm)
- Crytek: each stimulus has an envelope, and new stimuli can win over long-sustained ones because of the decay phase. — [Welsh 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)
- Mark of the Ninja: one interest at a time; new interests are judged by priority. — [Miles 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter32_How_to_Catch_a_Ninja_NPC_Awareness_in_a_2D_Stealth_Platformer.pdf)

### Inferences (fit with Sightline)
- **Masking as a threshold shift.** All in Sightline's audibility units, where 1 is the threshold of hearing:
  - Ambient level at a guard: A_m = sqrt(Σ (R_i / d_i)²). Amplitudes add as power.
  - Masked threshold: T = max(1, k·A_m), where k = 10^(−SNR_dB/20) is how far below the masker a signal can sit and still be heard. Tune it in lab A; the psychoacoustic example above suggests masking of 15–20 dB is realistic.
  - A sound of audibility a is heard if a > T, and its clarity is a/T.
  - The same function drives the player's mix, so a creek that hides a guard's footsteps from you hides yours from him (the "one law" rule).
  - Fit: `ambient.ts` already defines the sources and radii; this adds one function in `sound.ts`.
- **Transient maskers.** Thunder, a passing truck and bells become scheduled events with a radius and a duration. A sound is masked if it overlaps a masker. Temporal masking suggests about 100 ms of grace after a masker ends, about 3 ticks at 30 Hz. Sniper Elite's binary "loud area plus indicator" is the readable version; Sightline's continuous SNR is more systemic, but it needs a cue (Q5) or players won't predict it.
- **Apparent direction from the path.** In the parent field of the source's flood, walk back from the guard's cell to the last cell he can see. The bearing to it is the doorway direction, the same idea as Thief, Siege and Triton's portaling. Then add angular error from the guard's own random stream: `ctx.draw(guardId, 'hear-bearing', n)`.
  - The error is a standard deviation that grows as clarity falls and with excess path, the DCSS principle: a straight, clear sound means an exact bearing.
  - It also grows with the angle off the guard's facing: about 1° in front versus about 15° to the side. So a guard who turns toward a first sound localizes the second better, a natural way for repeated sounds to sharpen the estimate.
- **Distance estimate.** Guards know each sound type's loudness (a rifle report), so they can turn level into range, with a large spread that widens with distance; an exact range shouldn't come from one report. A large multiplicative spread matches the design doc's "little sense of distance" at 300 m. Owner/lab A should tune it, since I found no distance-perception figures (see Gaps).
- **Investigation target.**
  - Short range or inside the camp: DCSS's centroid toward the listener, plus fuzz from excess path.
  - Long range: sample along the heard bearing at the estimated range. Lab E's camp brain then snaps it to likely perches (the design doc's "sweeps likely perches").
  - Then "Looking for Trouble": phase 1 at the point, phase 2 at hidden spots.
  - Distractions (a thrown rock) should send the guard to the stimulus itself, as with the Infected, because the design doc says he walks toward the noise.
- **Fusing repeated sounds.** Two options:
  - (a) Each guard keeps a few weighted Gaussian hypotheses (mean, a 2×2 covariance, weight) as plain numbers in `sim.state`. Each heard bearing becomes a wedge-shaped likelihood. Bearings from two guards, or from one guard after he has moved, intersect, so a second shot from the same perch is localized much better (triangulation).
  - (b) A coarse occupancy grid at camp level (Isla 2006) shared by the camp brain, for example 64×64 numbers: cheap to hash, and it also drives searches.
  - Either reproduces Sniper Elite 3's "cautious, then zeroing in, then known" from rules rather than a script, and makes "shoot, then relocate" the right play.
- **Brains see only their minds (rule 13).** The flood, masking and error are perception (lab A). The brain gets only the heard bearing, rough range, sound type and clarity, never the source position, so `tests/perception.test.ts` stays meaningful.

### Gaps
- No primary source from any game gives the numbers for its masking threshold (SNR in dB) or for localization error. Every shipped example found uses design rules (meters, zones, fuzz).
- I didn't reach the human distance-perception literature (for example Zahorik's 2005 review of auditory distance perception), so I have no numbers for how badly people misjudge distance. Look these up before tuning lab A.
- MGSV's rain and sandstorm effects on hearing, and Arma's weather effects on AI hearing, weren't found.
- The Dishonored 2 chase chapter (flooding an influence map, Game AI Pro Online 2021) is relevant to propagating uncertainty on a grid but wasn't read. [Link from the index](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter06_Flooding_the_Influence_Map_for_Chase_in_Dishonored_2.pdf)

## Q4. Gunshots: how do games model the muzzle report and the supersonic crack, and how do AI and players locate shooters? What are the real acoustics?

### Takeaway
Physically, a supersonic shot makes two sounds. The muzzle blast travels at the speed of sound from the gun, lasts a few milliseconds and is loudest in the direction the barrel points. The shock wave is a cone trailing the bullet, at half-angle θ_M = arcsin(1/M); its front travels perpendicular to the cone, not from the gun. So a listener near the bullet's path hears the crack first, from a point on the path upstream of him, which in my calculation is about 55–65° off the true direction at typical rifle speeds, and the report later from the gun. The gap between them grows with range: at about 300 m it's roughly 0.4 s for a typical rifle. Among games, the closest models are Crytek's "bullet rain" stimulus, Arma's per-ammo audibility for AI and suppressor multipliers (wiki and forum excerpts), Sniper Elite's masking and per-weapon audible range, and Hunt's distance readability and echo system. None of the sources I could read models the crack's misleading direction for AI.

### Cited Findings

**Real acoustics: Maher (Montana State), "Modeling and Signal Processing of Acoustic Gunshot Recordings", IEEE DSP Workshop, Sept 2006** ([PDF](https://www.montana.edu/rmaher/publications/maher_ieeedsp_0906_257-261.pdf)). Research, but the physics is settled.
- **Muzzle blast:**
  - Lasts 3–5 ms and travels at the speed of sound.
  - Loudest in the direction the barrel points, weaker as the angle off the axis grows.
  - Can be blocked by barriers on the direct path.
  - Can be reduced or changed by a suppressor.
- **Shock wave:**
  - A supersonic bullet (V > c) trails a cone at half-angle θ_M = arcsin(1/M), where M = V/c. Its front moves outward at the speed of sound.
  - A fast bullet (M = 2.67, θ_M ≈ 22°) sends the front out nearly perpendicular to its path. Near Mach 1, θ_M nears 90°.
  - As the bullet slows downrange, θ_M grows and the front curves. The shock disappears once the bullet is subsonic.
- **Timing:**
  - The ray that reaches a microphone leaves the path at the point X where the geometry works out. The arrival time is the bullet's flight time to X plus the ray's travel at c.
  - Downrange listeners get the shock well before the blast. Ground reflections arrive later than the direct paths.
- **Direction:**
  - Arrival-time differences between microphones give the shock's propagation direction, which is not the bullet's path.
  - A recording with the muzzle pointed away from the microphones showed no shock wave and a weaker blast. **(Search excerpt from a related Maher summary paper, not in the PDF I read.)**
- **The crack:** an N-wave lasting under about 200 µs for a typical bullet, about T ≈ 1.82 (d/c) (M·x / l)^¼. Here d is the bullet diameter, l its length and x the miss distance.
- Measured example: a .308 at M = 2.54 has θ_M = 23.2°, and the model matched measured arrival times closely.

**Crack-thump ranging (folk rules, low confidence)**
- Tactical guidance: a one-second gap between crack and thump means the shooter is beyond about 600 m. — [Max Velocity Tactical](https://maxvelocitytactical.com/crack-thump) **(search excerpt)**
- Search excerpts also cite FM 23-10 (the US Army sniper manual) for turning the crack-thump interval into a rough range, but the passage with numbers wasn't reachable. A forum thread notes that people can't time the gap to hundredths of a second, so the method is coarse. — [Sniper's Hide thread](https://snipershide.com/shooting/threads/countersniper-math.234002) **(search excerpt)**

**Games**
- Crytek CryENGINE has a "bullet rain" stimulus for bullets passing close, alongside a "weapon fired" stimulus, a direct analogue of crack versus report for AI. — [Welsh 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter31_Crytek's_Target_Tracks_Perception_System.pdf)
- **Arma 3** (Bohemia, 2013; the BI wiki blocked fetching, so everything here is **search excerpt**, medium to low confidence):
  - The CfgAmmo parameter `audibleFire` says how much AI can hear a weapon fired; the reference example is 5.0. It sits alongside `visibleFire`, `audibleFireTime` and `visibleFireTime`. — [BI wiki, CfgAmmo](https://community.bistudio.com/wiki/CfgAmmo_Config_Reference)
  - A suppressor's `ItemInfo >> AmmoCoef` class holds multipliers on these values for ammo fired through it. The guideline's example uses `audibleFire = 0.8`; forum posts show other values such as 0.4. — [BI wiki, Arma 3 Weapon Config Guidelines](https://community.bistudio.com/wiki/Arma_3_Weapon_Config_Guidelines); [BI forums](https://forums.bohemia.net/forums/topic/173649-are-there-any-advantages-to-using-silencers-in-a3/)
  - Forum users report `audibleFire` 40 for MX ammunition against 5 for another magazine, and 64 as the maximum. — **(search excerpts; unverified)**
  - No official description of the AI hearing formula was found.
- Sniper Elite 5: each weapon has an audible range shown on the loadout screen. Suppressors can cut it sharply but cost accuracy. Hearing a gunshot can raise an enemy to the yellow (suspicious) state. — [Gamepressure SE5 guide](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d)
- Sniper Elite 3 and 4: see Q3 (escalation per shot, masking events, relocation).
- Hunt: Showdown:
  - Update 2.4 changed the mix so players can judge enemy gunshot distance better at close range, and smoothed indoor gunshot attenuation.
  - The echo system (from the 1896 relaunch) applies only to gunshots and explosions. — [Crytek 2025](https://www.huntshowdown.com/news/dev-insight-audio-design-recap-what-s-new-in-update-24)
  - Louder sounds use longer attenuation templates. — [Crytek 2018](https://www.huntshowdown.com/news/hunt-audio-readability-realism-and-consistency)
- Siege: real-time filtering of the direct, occluded path was mostly reserved for guns, and gun reverb was baked at the gun's position. — [Game Developer 2017](https://gamedeveloper.com/design/game-design-deep-dive-dynamic-audio-in-destructible-levels-in-i-rainbow-six-siege-i-)

### Inferences (my derivations and numbers; fit with Sightline)
- **Why the crack misleads (derived from Maher's geometry).**
  - The ray from the emission point X to a listener at miss distance x leaves at angle φ to the bullet's direction, with cos φ = 1/M, so tan φ = sqrt(M² − 1).
  - X is therefore x / sqrt(M² − 1) upstream of the listener's closest point on the path.
  - A listener near the path, far from the shooter, hears the crack arrive about arccos(1/M) = 90° − θ_M away from the shooter's true bearing, toward the bullet's path.
  - That's about 62° at M = 2.1, about 56° at M = 1.8 and about 34° at M = 1.2. It shrinks toward the true bearing only as the bullet nears Mach 1.
  - Listeners close to or behind the muzzle (no valid X between the muzzle and the point where the bullet goes subsonic) hear no crack at all.
  - Only sqrt is needed, which is allowed in `src/sim`. Solve for X with a fixed number of iterations along the ballistic velocity profile (rule 18): about 16 listeners × a few iterations per shot.
- **Illustrative timings.** I assumed a .308-like bullet: 790 m/s at the muzzle, 620 m/s at 300 m, exponential velocity decay, c = 343 m/s, and a listener 5 m off the path at range R.

  | R | Crack | Report | Gap | Gap at 30 Hz | Crack bearing error |
  | --- | --- | --- | --- | --- | --- |
  | 100 m | 0.145 s | 0.292 s | 0.147 s | ~4 ticks | ~62° |
  | 300 m | 0.442 s | 0.875 s | 0.433 s | ~13 ticks | ~56° |
  | 500 m | 0.79 s | 1.46 s | 0.67 s | | ~49° |
  | 800 m | 1.43 s | 2.33 s | 0.90 s | | ~34° |

  Range ≈ gap × (680–890) m/s over this span. So the "over 600 m for a one-second gap" rule is conservative but in the right range. The gap should be computed exactly, not from a constant.
- **Three events per shot, all in the sim, all heard through the same law by guards and by the player's speakers:**
  1. **Report:** emitted at the muzzle at t₀. Its loudness comes from per-ammo data in tuning (rule 16), with a directional gain that is louder in front of the muzzle (Maher), and the suppressor multiplies its radius (as Arma's `AmmoCoef` does). It is propagated as in Q2 and arrives at t₀ + d_path/c through `ctx.schedule`. Its apparent bearing comes from the path's first leg back from the listener.
  2. **Crack:** only if the bullet is supersonic at X. It arrives at t_flight(X) + |XL|/c, appears to come from X, and its loudness falls with miss distance and grows with calibre. It is unaffected by a suppressor. Subsonic ammunition has none.
  3. **Impact:** at the impact point at t_impact + d/c. Per the design doc, it draws eyes to the impact.
- **What a guard concludes from what he heard:**
  - Report clearly heard: a bearing toward the shooter. If both were heard and the guard is trained (a doctrine or marksman trait), the crack-thump gap gives range: R ≈ gap / (1/c − 1/v̄).
  - Report masked or suppressed: only the crack and the impact, so the camp looks along the bullet's side, too far forward. This produces "can mislead listeners" and "suppressor cuts the report but not the crack" from rules alone.
  - Several guards hearing the same report from different places triangulate (Q3).
- **Sub-tick timing for the player.** At 30 Hz the 300 m crack-thump gap is about 13 ticks. Arrival times are analytic, so the renderer can schedule the crack, report and impact at exact fractional times in Web Audio, while guards receive them on the tick of arrival. This matches the design doc's "crack-thump delay by distance" without breaking rule 14. Sound has no visible motion, but its timing must come from the sim.
- **Masking a shot.** A shot is "masked" when its report's clarity at a guard is at or below 1 against the current masker (Q3). The crack may still be heard near the path, so masked shots still give away "a shot happened, over there-ish": a richer version of Sniper Elite's all-or-nothing loud areas.

### Gaps
- **Escape from Tarkov:** no source found on how players or AI locate shots (spatializer, distance layers, crack modelling).
- **Arma 3:** sonic-crack internals (for example sound-set parameters for supersonic cracks, and whether AI react to cracks rather than the report) couldn't be verified; the BI wiki was blocked. Whether Arma delays sound by its travel time wasn't verified from a source.
- **Hunt:** whether gunshot audio is delayed by travel time, and how far shots carry, aren't stated in the sources read.
- **Shock-wave amplitude:** how fast the shock's amplitude falls with miss distance (the classic far-field result scales the N-wave amplitude with distance^(−3/4)) wasn't verified from a fetched source. Lab B needs a source or a tuned curve.
- **Folk ranging rule:** a "roughly 270 m per second of gap" rule appeared in one search excerpt (a survival guide) but couldn't be attributed. It contradicts the physics above (probably confused with counting thunder at 343 m/s).
- **Measured soldier error:** no data found on how far off soldiers actually are when locating fire from the crack. Military countersniper manuals were not reachable.
- **MGSV:** nothing on how sniper fire is located (for example triangulation after several shots).

## Q5. How is hearing telegraphed to the player (Mark of the Ninja's noise rings, Splinter Cell's noise meter, The Last of Us's listen mode)?

### Takeaway
Three patterns shipped.
- **Explicit geometry:** Mark of the Ninja's expanding rings show the exact radius at which enemies hear, for the player's sounds and for enemies' sounds out of sight.
- **A meter compared with the ambient level:** Splinter Cell: Chaos Theory.
- **Diegetic cues:** barks tiered from specific to generic in Blacklist, agitation animations in TLOU, a distinct warning sound at each escalation in Hunt, and Sniper Elite 5's on-screen indicator of when a shot is masked.

The Last of Us's Listen Mode inverts the idea, turning the player's hearing into wall-penetrating outlines of enemies. Every source agrees that if players can't read what the AI heard, detection feels unfair.

### Cited Findings
- **Mark of the Ninja (2012):**
  - Running and similar actions show as a rapidly expanding circle, and the player can preview how much noise a thrown item will make.
  - Enemies' sounds are shown the same way even out of sight.
  - New Game Plus removes this, so the player no longer sees the radius at which actions are heard. — [Wikipedia](https://en.wikipedia.org/wiki/Mark_of_the_Ninja) (secondary)
  - The AI hears by path, not radius alone: a guard inside the circle with no path doesn't hear. So the drawn circle can overstate who hears; the chapter's Figure 32.1 explains this with three guards. — [Miles 2013](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter32_How_to_Catch_a_Ninja_NPC_Awareness_in_a_2D_Stealth_Platformer.pdf)
- **Splinter Cell: Chaos Theory (2005):** a meter shows Sam's noise against the environment's ambient noise; stay below it. — [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Chaos_Theory) (secondary)
- **Splinter Cell: Blacklist (2013):**
  - Design wanted a minimal HUD, so fairness came from halving offscreen hearing plus three tiers of barks: specific (naming the cause, such as footsteps), then generic (heard someone in a direction), then vague (someone is around).
  - The specific lines teach the rule the first few times, and the generic ones avoid repetition. — [Walsh 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
  - Lesson: what matters is what the player thinks the NPC can hear, limited by plausibility. The creative director kept complaining about being heard by guards he couldn't see until offscreen hearing was reduced. — [Walsh 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf)
- **The Last of Us (2013):**
  - Listen Mode shows the outlines of enemies and characters through walls, framed as heightened hearing and spatial awareness. — [Wikipedia](https://en.wikipedia.org/wiki/The_Last_of_Us_(video_game)) (secondary)
  - The Infected become agitated when they start hearing noise, giving the player time to react. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)
  - Clicker echolocation was cut because it couldn't be communicated: players seen by a "blind" enemy felt cheated, and a ripple effect seemed too unrealistic. Lesson: reject features you can't telegraph. — [Botta 2015](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter33_Infected_AI_in_The_Last_of_Us.pdf)
- **Hunt: Showdown:** AI voices step up from ambient to aware to combat, and each escalation plays a distinct one-time warning sound. The player should know a sound's what, where and state by ear. — [Crytek 2018](https://www.huntshowdown.com/news/hunt-audio-readability-realism-and-consistency)
- **Sniper Elite:**
  - SE5 shows when a shot can be masked with a sound-wave indicator, and shows each weapon's audible range at loadout. — [Gamepressure SE5](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d)
  - SE3's UI warned when your position might be compromised. — [Engadget 2014](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html)
- **Overwatch:** muffling by path tells players they're out of danger as they round a corner, so the audio itself is the telegraph. Each hero has distinctive footsteps, and friend and foe sound different. — [PC Gamer](https://www.pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see/)
- **Thief:** reaction delays and "player forgiveness" are tuned through the time filter on rising awareness. — [Leonard 2003](http://www.gamasutra.com/gdc2003/features/20030307/leonard_pfv.htm)

### Inferences (fit with Sightline)
- **Debug-view sound rings should be the real heard region.** Draw the contour of the flood where clarity = 1 (after masking), not a circle, so they never overstate as Mark of the Ninja's circle can. It's cheap: the flood already exists per event. Fit: rule 8 (every system ships explainable).
- **Honest view.** Lab C's exit test ("players predict their own noise") and lab A's (testers predict detection 80% of the time) need some honest-view cue for hearing. Options, by how much they show:
  - (a) Diegetic only: barks tiered as in Blacklist, plus guards turning or looking toward the heard bearing, which Sightline simulates anyway.
  - (b) A Chaos Theory-style meter: your last sound's audibility against the local masking, which is literally the sim's clarity value at your own cell under the one law.
  - (c) Mark of the Ninja-style rings, the most readable and the most "gamey".
  - Which to show is a taste call for the owner. My suggestion is to prototype (b) first, because it rests on a quantity the sim already computes.
- **Masking cue.** Masking windows (thunder, a truck, the generator) need a cue, or masked shots will feel random. Sniper Elite 5 uses an on-screen indicator. A diegetic choice for Sightline is that the player's own mix audibly ducks other sounds when masking is high; that is honest, because the same masker raises the player's threshold too.
- **Investigation readability.** When a guard investigates a heard sound, he should walk toward his estimated point, not the true source. Showing that (sweeping the wrong ridge after a crack-only shot) is the strongest possible telegraph that "the crack misleads" and that "shoot, then relocate" works. Put it in the debrief replay (design doc: sounds and beliefs over time).
- **A listen-mode equivalent.** The rule says the player's speakers use the guards' law, so a sound you hear could also be heard by a guard where you stand. A TLOU-style wall-penetrating reveal would break the honest view unless it's limited to sounds the player actually hears, for example a compass tick toward heard sounds. Owner's call.

### Gaps
- Nels Anderson's own writing on Mark of the Ninja's readability and the GDC talks on its sound visualization weren't reached. The Wikipedia summary and the Game AI Pro chapter were used instead.
- Listen Mode's exact limits (distance, crouched only, the Grounded difficulty) and Part II's changes weren't confirmed from a source.
- No playtest data was found on which telegraph style best supports predicting detection, which is lab A's exit criterion.
