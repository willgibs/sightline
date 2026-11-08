# Movement and body: stealth and tactical prior art for lab C (stances, lean, mantle, ladders, prone, bodies, self-readouts, kinematic controllers)

*How to read these notes.*
- **Status tags:** **[Shipped: game, year]**, **[Engine/library]**, **[Hobby]** (unshipped practitioner work) and **[Research]**.
- **Confidence tags** follow each source. **read** means I opened the page. **snippet** means I saw it only in search-result summaries, because the page wasn't opened or was blocked; these are the lowest confidence. The tag also gives the kind of source: primary (developer, official docs or source code), press, guide/wiki, or forum. Claims from forums, fan wikis and guides are lower confidence throughout.
- **IDs** (L, M, D, P, B, R, K) tie each technique to its one-line fit note under Inferences.
- **Sightline constraints used in the fit notes:** a deterministic kinematic motor in TypeScript at a fixed 30 Hz, with interpolated rendering, mouse look at frame rate, a 0.45 m step and a 42° maximum slope. The motor's invariants and the CLAUDE.md rules are cited as "rule n".
- **Release years** in brackets are the games' release years. Source dates are given where the source states them.

## 1. Lean: how far, collision, camera roll, whether the hitbox follows, shooting while leaning, abuse cases

### Takeaway
Lean ships in two forms. The common one moves the head or camera with the feet planted (Thief, Dishonored, Rainbow Six Siege, Tarkov, Ready or Not, Ground Branch). The other is a continuum of adjustable stances (Arma 3).

The failures that shipped games had to patch:
- The eye sat outside the head's hitbox, so a leaner saw more than he exposed. Siege fixed this in 2019 by centring the camera in the head.
- A lean could be made instant or spammed (Siege's lean-spam and its melee-plus-lean "teleport").
- A lean could reach through thin walls and doors (Dark Engine speedruns).

No source gave measured lean distances or camera-roll angles. The safest fit for Sightline is a lean amount simulated in `src/sim` and limited by a rate. The head is swept against solids and bodies and stopped short of contact. The camera sits at the centre of that simulated head, and guards see from and to the same point.

### Cited Findings
#### Shipped implementations
- **L1 · Camera centred in the head while leaning** [Shipped: Rainbow Six Siege (2015), Operation Burnt Horizon patch addendum, March 2019]. Ubisoft moved the leaning camera from the far side of the head to its middle, even at full lean, to counter lean-spam. The same addendum made the head lean in the running animations less aggressive. Reported 4 Mar 2019, quoting the patch notes. — [PCGamesN](https://www.pcgamesn.com/rainbow-six-siege/rainbow-six-siege-lean-spam) (read: press)
- **L2 · Lean-spam and instant-lean abuse** [Shipped: Rainbow Six Siege]. Testing credited to Rogue9 found that lean-spam works less by warping the hitbox than by making the head hard to track. A later patch, Y6S1.1 (Crimson Heist), targeted melee plus lean pressed together, which bypassed the lean animation and moved the head left and right almost instantly. — [KitGuru](https://www.kitguru.net/gaming/damien-cox/ubisoft-finally-addresses-lean-and-crouch-spamming-in-rainbow-six-siege); [PC Gamer](https://pcgamer.com/ubisoft-targets-rainbow-six-sieges-crouch-and-lean-spam-for-future-fix); [ComicBook](https://comicbook.com/gaming/news/rainbow-six-siege-crouch-and-spam-trick-fix) (snippet: press; I couldn't tell which of these pages carried the Y6S1.1 detail)
- **L3 · Lean with the body abstracted as hidden** [Shipped: Dishonored, 2012]. Arkane's tips say that with your body behind a wall you can lean out to look, and the game abstracts this so the body stays hidden. The stealth model is mostly enemy view cones plus occlusion. Posted 9 Oct 2012 on Harvey Smith's personal site. — [witchboy.net, "Dishonored Pro-tips"](https://www.witchboy.net/2012/10/) (read: primary)
- **L4 · Context-aware lean amount** [Dev blog: Ground Branch, 2 Sep 2012] (read: primary) — [Ground Branch dev blog](https://groundbranch.com/2012/09/leaning-peeking-system)
  - Q/E lean whose extent comes from checks of the surroundings, the weapon's position and the stance.
  - With the weapon lowered, it leans just far enough to expose one eye. With the weapon raised, it leans farther so the weapon clears the corner.
  - The lean is animated as a full-body lean from the legs up, not a bend at the waist, and blended with crouch and stand into a "fluid stance" modelled on Raven Shield.
  - Head tracking (TrackIR, Kinect, Rift) is offered as an analog alternative but judged not natural or quick.
- **L5 · Incremental lean and a separate sidestep** [Shipped: Escape from Tarkov (beta 2017)]. Q/E is the full lean. Left Alt + A/D leans a little at a time and holds the partial lean. Alt + Q/E sidesteps the whole body instead of leaning. — [GameSpot](https://www.gamespot.com/articles/escape-from-tarkov-guide-for-controls-and-hotkeys/1100-6472601/); [Gamepur](https://gamepur.com/?p=11237); contradicted on which binding is the step and which the lean by [GGRecon](https://www.ggrecon.com/guides/escape-from-tarkov-best-key-binds/) (snippet: guides)
- **L6 · Adjustable stance heights and step-lean** [Shipped: Arma 3, 2013]. Holding Left Ctrl, W/S raises or lowers the stance and A/D does a half-step sideways. Q/E is the traditional lean. — [Arma 3 Field Manual: Infantry Controls](https://community.bistudio.com/wiki/Arma_3_Field_Manual_-_Infantry_Controls) (snippet: official wiki). Players install mods just to show stance and lean state, for example [a stance-indicator mod for Arma Reforger](https://reforger.armaplatform.com/workshop/6A17052EE15B48D9) (snippet: mod page).
- **L7 · Free lean** [Shipped: Ready or Not]. Q/E lean, plus a free-lean mode: hold Alt and steer the lean with WASD. — [itemlevel.net](https://itemlevel.net/ready-or-not-how-to-sprint-free-lean-canted-sight-guide) (snippet: guide)
- **L8 · Lean, free aim and hitbox share** [Shipped: Insurgency (2014), Insurgency: Sandstorm (2018)].
  - Free aim works in every stance, with the weapon not tied to the centre of the screen. — [Insurgency Wiki: Aiming](https://insurgency.fandom.com/wiki/Aiming) (snippet: wiki)
  - A post about the 2014 game claims leaning removes more than half of your hitbox. — [Steam forum](https://steamcommunity.com/app/222880/discussions/3/540744936230359339/?ctp=2) (snippet: forum)
  - Sandstorm forum posts ask for lean while prone, which implies it was missing when they were written. — [Focus forums](https://forums.focus-entmt.com/post/110236), [Focus forums](https://forums.focus-entmt.com/post/234641) (snippet: forum)
- **L9 · Lean beyond left and right; listening at doors** [Shipped: Thief: The Dark Project, 1998, and sequels].
  - Giant Bomb's concept page singles out Thief's lean as more advanced than left/right-only systems. — [Giant Bomb: Leaning](https://giantbomb.com/leaning/3015-2675/) (snippet: wiki)
  - Players press against doors to eavesdrop, because the audio propagates through the level. — [PC Gamer, Dec 2018, via PressReader](https://www.pressreader.com/usa/pc-gamer-us/20181204/282389810507668) (snippet: press)
  - A Thief Gold player couldn't find a lean-forward binding. — [GOG forum](https://gog.com/forum/thief_series/missing_lean_forward_key_binding_in_thief_gold) (snippet: forum)
- **L10 · Reaching through walls (abuse)** [Shipped: Dark Engine games with the NewDark "newmantle" option]. Speedrunners clip thin walls and doors by combining a melee swing with lean and jump, and lean through a door to press a button on its far side. — [speedrun.com](https://www.speedrun.com/posts/51buw), [speedrun.com](https://www.speedrun.com/posts/0v185) (snippet: forum; the threads sit in System Shock 2's forum, which shares Thief's engine)
- **L11 · Lean tied to aiming** [Shipped: Rainbow Six Siege]. Guides disagree on whether PC players must aim down sights before Q/E leans. — [Gfinity](https://www.gfinityesports.com/rainbow-six-siege/rainbow-six-6-siege-leaning-guide-aim-pc-ps4-xbox/); contradicted by [GamerTweak](https://gamertweak.com/lean-without-aiming-rainbox-six-siege) (snippet: guides)

#### Collision technique
- **L12 · Sweep the head, clamp the lean** [Hobby]. Practitioners gate lean with a sphere trace toward the lean side and shorten the lean on a hit. Advice from the same threads:
  - Trace from the lean-side offsets, not only from the centre.
  - Keep the eye a minimum distance from walls; about 4 units is a common Quake-engine figure.
  - When a lean is blocked, nudge the player away from the wall so it doesn't feel sticky.

  Pitfalls they report: traces still miss the head going through a wall when the mouse is shaken against it, and leaning parallel to a wall clips. — [Unreal forum](https://forums.unrealengine.com/t/prevent-camera-from-clipping-through-wall-when-leaning/1749594); [InsideQC](https://forums.insideqc.com/viewtopic.php?p=14041) (snippet: forum)

### Inferences
#### Fit notes (one line per technique)
- **L1:** Rule 14 already requires the camera to be where the body is. Put the eye at the centre of a simulated head part, and have lab A's perception test sight lines to that same point. If you can see the guard past the corner, he has a line to your eye: symmetric and predictable.
- **L2:** Keep the lean amount in `sim.state`, moving toward its target at `leanRate * dt` (rule 17). There is no separate animation path to bypass, so no instant lean can exist. A small visibility cost while moving the head deters spam better than a cooldown would.
- **L3:** Dishonored's abstraction favours the player at the cost of honesty. For an exit test built on prediction, honest geometry plus an exposure term (only the head exposed, so a smaller area and slower detection; compare Thief's exposure factor, R1) fits better.
- **L4:** A sniper needs two leans: a peek (the eye clears the cover) and a weapon lean (the muzzle and scope clear it). Both can be derived in the simulation from the sweep: the lean stops just past the cover edge.
- **L5:** A held lean (already in `InputFrame`) moving at a rate gives partial lean for free if releasing the key mid-travel holds that amount. No new analog input axis is needed.
- **L6:** Arma's continuum of stances shows what readability costs. Three stances plus lean keep "predict your visibility from your stance" tractable for the exit test.
- **L7/L8:** Free lean and free aim add analog dimensions the player has to read. They are out of scope unless "deliberate" movement demands them.
- **L9:** Leaning to listen is a lab A hook: lean could raise the player's hearing at a tent wall or corner. It is not a motor feature.
- **L10:** "Never ends a tick inside anything solid" must cover the leaned head part. Interaction reach (doors, bodies) should be a ray from the eye that respects `Solids`.
- **L12:** Sweep a circle or sphere from the unleaned head to the target through `Solids` and other bodies, and clamp at the hit minus a margin. This uses only dot products and sqrt, so it stays deterministic. The lean's invariants:
  - the head never ends a tick inside a solid or another body;
  - the feet never move;
  - the lean never exceeds its limit in `tuning.bodies`.

#### Other inferences
- Stance changes (stand from crouch or prone, crouch under a low roof) need the same headroom check as a lean. The UE mantle write-up stands the character up before its clearance check (M4). Unity's KCC requires `SetCapsuleDimensions` because it caches the capsule (K5). Arma's crouch metric is 110–120 cm (M8).
- Camera roll changes nothing a shot depends on, because rolling about the view axis keeps the forward direction. It can be a pure function of the lean amount, evaluated by both sides like `bob.ts`, so it never becomes renderer-only motion.

### Gaps
- No primary measurements of lean distance, camera-roll angle or lean speed for any of the listed games. PC Gamer's overview "Leaning in first-person shooters" wouldn't load.
- Hunt: Showdown: I found no evidence that it has a lean mechanic, and the patch coverage I searched mentions none.
- Tarkov and Siege: that the hitbox follows the lean exactly is implied by Siege's fix, not documented.
- Arma 3: search results suggested that players find adjustable stances hard to read in first person, but I couldn't open the ticket.

## 2. Mantle, vault and ladders: ledge detection, first-person mantles without full animation, limits, windows, ladders as a state

### Takeaway
Ledge detection converges on three probes:
1. forward probes at several heights, to find the wall face and the first open height;
2. a downward probe from above, to find the top;
3. a shape overlap at the landing pose (standing or crouched), to confirm clearance.

First-person mantles without full-body animation, in the open-source The Dark Mod, split the move into short phases (hang, pull, shift, push) with eased camera motion. Their recorded pitfall is checking the endpoint only once.

Ladders ship as their own movement type, with gravity off and a stored ladder normal (Source engine). Half-Life 2 adds explicit dismount points that must be validated.

For Sightline, mantle and ladder fit as motor modes that follow a path of their own. They can keep the universal invariants with no exception if the rise per tick is limited and every tick's pose is checked.

### Cited Findings
#### Mantle and vault
- **M1 · Phased first-person mantle** [Shipped: The Dark Mod; source on a public SVN].
  - It has two entries: a walk-mantle, and a jump-mantle for ledges above the head (issue opened 30 Dec 2023). — [TDM issue 6390](https://bugs.thedarkmod.com/view.php?id=6390) (read: primary)
  - The overhead mantle runs in phases: hang, pull, shift, then push. A 2023 change shortened those phases and gave the pull an easing that accelerates and decelerates (before, it only decelerated at the end). It extended `pm_mantle_roll_mod` to a side-to-side rocking, delayed the crouch dip of a forced-crouch mantle to the last phase, and raised eye height slightly at the end of the pull. — [TDM issue 6343](https://bugs.thedarkmod.com/view.php?id=6343) (snippet: primary)
  - A 2019 proposal replaced the slow pull-push, with its heavy grunt, by a quick pull plus a regular push for medium ledges. — [TDM issue 4945](https://bugs.thedarkmod.com/view.php?id=4945) (snippet: primary)
- **M2 · Endpoint validated once, then clipping** [The Dark Mod, 2019]. The endpoint is checked once before the mantle starts, so an object that moves in can cause clipping when it ends. The suggested fix is to check the end position every frame. — [TDM issue 4509](https://bugs.thedarkmod.com/view.php?id=4509) (snippet: primary)
- **M3 · Mantling off a rope or ladder ends standing** [The Dark Mod, 2022]. — [TDM issue 5962](https://bugs.thedarkmod.com/view.php?id=5962) (read: primary)
- **M4 · Forward line traces at descending heights plus capsule clearance** [Hobby: UE5 project "Density", undated] (read) — [Daniel Martinez Amigo, "Mantle/Ledge grabbing system"](https://danimtz.github.io/devpost/Mantle)
  - Triggered by a capsule hit on a static mesh. Allowed only while airborne with forward input held, and not within about 0.5 s of a jump.
  - Five forward line traces run from the top of the capsule downward. The first trace that hits nothing marks the open space.
  - The character is uncrouched before the clearance check, so the smaller crouched capsule doesn't skew it. Then a capsule clearance check runs at the landing spot, and the move is classed as a short or tall mantle.
  - Movement is a root-motion montage with motion warping in two phases, vertical then horizontal, with the movement mode set to Flying during the vertical phase. The first-person montage is cosmetic only.
- **M5 · Downward cast for the top; inset by the radius; overlap at the target** [Hobby/blog]. Find the ledge top with a downward cast, then place the capsule's bottom there, inset from the edge by the capsule radius. Overlap-test the target pose, and abort or nudge outward if it intersects. — [bugnet.io](https://bugnet.io/blog/how-to-fix-mantle-snapping-player-into-the-ledge-geometry) (snippet: blog). The same pattern appears in an [Unreal forum thread](https://forums.unrealengine.com/t/line-trace-based-on-results-from-another-line-trace-for-ledge-detection/426865): forward traces at rising heights, then a trace down from above (snippet: forum).
- **M6 · Climb onto versus vault over; Auto versus Hotkey** [Shipped: Escape from Tarkov, patch 0.14].
  - There are two traversal types: climbing onto an obstacle and staying there (to fire from a crate, say), and vaulting over it.
  - "Auto" mode climbs medium and low obstacles by itself. "Hotkey" mode needs the jump key.
  - Animations vary with the obstacle's type and height.

  — [TechRadar](https://www.techradar.com/gaming/escape-from-tarkov-is-finally-adding-vaulting-and-players-are-elated); [PC Gamer](https://www.pcgamer.com/6-years-after-becoming-publicly-playable-escape-from-tarkov-is-adding-vaulting-and-fans-are-a-lot-more-excited-about-it-than-i-wouldve-expected) (snippet: press)
- **M7 · Validating climb-over points through windows** [Shipped: Arma Reforger (2022)].
  - A patch fixed paths skipped by the climbing test for valid climb-over points, such as climbing through a window. — [The Nerd Stash](https://thenerdstash.com/arma-reforger-june-1-update-patch-notes) (snippet: press summarising patch notes)
  - Update 1.030.130 (Fire Support) disallowed climbing and jumping while walking through razor wire. — [MP1st](https://mp1st.com/title-updates-and-patches/arma-reforger-update-1-030-130-for-fire-support-patch-1-3) (snippet: press)
- **M8 · Clearance metrics for openings** [Shipped: Arma 3].
  - Moving through a gap needs about 50 cm prone and 110 cm crouched. 120 cm is recommended for crouching, because the head clips at 110. The space must exist in the fire-geometry LOD, since the normal geometry doesn't count. — [Arma 3: Infantry Metrics](https://community.bistudio.com/wiki/Arma_3:_Infantry_Metrics) (snippet: official wiki; the page returned 403 to me)
  - A related page suspects that some blocks' collision differs from their stated size. — [Arma 3: Environment Metrics](https://community.bohemia.net/wiki/Arma_3:_Environment_Metrics) (snippet)
- **M9 · Open-source UE locomotion ports** [Engine plugin]. ALS-Community and ALS-Refactored are C++ ports of the Advanced Locomotion System. ALS-Community is MIT, © 2020 Doğa Can Yanıkoğlu & LongmireLocomotion. ALS-Refactored is MIT. Licenses were checked through the GitHub API on 7 Nov 2026; the mantle code itself wasn't inspected. — [ALS-Community](https://github.com/dyanikoglu/ALS-Community); [ALS-Refactored](https://github.com/Sixze/ALS-Refactored) (read: primary)

#### Ladders
- **D1 · Ladder as a movement type** [Shipped: Source engine games, e.g. Half-Life 2 (2004) and Counter-Strike] (read: primary source code) — [`gamemovement.cpp`](https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/shared/gamemovement.cpp); license read from the [repository](https://github.com/ValveSoftware/source-sdk-2013): the Source 1 SDK License allows free use and modification to build a modified Valve game on Source 1, distributable if it is free.
  - **Detection:** `CGameMovement::LadderMove` probes `LadderDistance()` along the wished direction, or along the reversed stored ladder normal when already climbing. It looks for `CONTENTS_LADDER` or a surface marked climbable.
  - **Entry:** on a hit, it sets `MOVETYPE_LADDER`, stores the hit normal as the ladder normal and sets gravity to 0.
  - **Input:** forward/back and strafe go through the view vectors, so the view's pitch decides whether "forward" climbs up or down. The source says facing up while moving down is by design. The velocity is split into the part into the ladder face and the lateral rest, then re-projected up the ladder.
  - **Leaving:** jump returns to walking with velocity = the ladder normal × 270 units/s.
  - **Counter-Strike only:** `sv_ladder_dampen` (0.2) and `sv_ladder_angle` (−0.707) damp sideways motion at shallow angles.
- **D2 · Explicit mount and dismount points** [Shipped: Half-Life 2 and HL2: Deathmatch, 2004]. `func_useableladder` uses `info_ladder_dismount` markers.
  - A dismount point must let the player stand without intersecting world geometry.
  - Pressing use near a marker dismounts to it, which gives controlled exits from ladders that pass several floors. Players can also walk off the endpoints.
  - `sv_showladders 1` draws the endpoints and dismount points.

  — [VDC: func_useableladder](https://developer.valvesoftware.com/wiki/Func_useableladder); [VDC: info_ladder_dismount](https://developer.valvesoftware.com/wiki/Info_ladder_dismount); [VDC: Working ladders](https://developer.valvesoftware.com/wiki/Working_ladders); [VDC (zh): Working Ladders](https://developer.valvesoftware.com/wiki/Zh/Working_Ladders) (snippet: official developer wiki)

### Inferences
#### Fit notes (one line per technique)
- **M1:** Phases map onto a motor mode that follows its own path. The mantle keeps its start, end, phase and tick count in `sim.state`, and the eye's position is a pure function of them, the way `bob.ts` is. Render and sim then agree (rule 14). An eased pull with a little roll gives weight without a body animation.
- **M2:** Check every tick: the next pose on the path must clear `Solids` and other bodies (rule 10). On a failure, stop at the last valid pose or drop into air mode. Rule 10 already stops entities' shapes, such as doors, from moving into bodies, but a guard can still walk into the path, so the per-tick check stays necessary.
- **M4/M5:** Sightline's colliders have known heights, so the downward probe is exact: take the collider's top. The forward probe uses the body's own circle at knee, waist and chest height. The landing check is the circle at standing or crouched height, plus headroom along the whole path. All plain arithmetic, so deterministic.
- **Rise per tick:** a 1.2 m mantle over 0.6 s at 30 Hz rises 0.067 m per tick, far below the 0.45 m step limit. Any mantle longer than height ÷ 13.5 m/s keeps "never rises more than stepHeight in one tick" with no exception, and so does any ladder climb slower than 13.5 m/s.
- **Mantle invariants to state:**
  - it ends only on a walkable top (42° or less) with clearance for the stance it ends in;
  - it never passes through an opening lower than that stance (Arma's 50 cm and 110–120 cm, M8, are starting numbers);
  - its horizontal travel never exceeds its reach;
  - it emits a footfall or landing event for the surface (the motor's "every landing makes a sound").
- **M6:** Make mantling hotkey-only. An automatic vault makes noise the player didn't choose, which works against "players predict how loud they are".
- **M7/M8:** Window and gap clearances belong in lab D's validation: a window that can be mantled needs a clear landing on both sides.
- **D1:** Make the ladder a path mode:
  - mount over a few ticks onto the ladder's line, checking collision each tick;
  - gravity off;
  - climb at `climbSpeed * dt` along the ladder's axis;
  - map forward to up whatever the pitch, avoiding Source's pitch-dependent mapping;
  - jump or a hit detaches into air mode with a small velocity along the ladder normal.
- **D2:** Leave a ladder only onto dismount poses validated when the camp is generated (lab D: every ladder has a top and a bottom dismount where the body fits). The ladder's invariants:
  - the body stays within the ladder's sideways bounds;
  - it rises at most `climbSpeed * dt` per tick;
  - it never ends a tick inside a solid;
  - it exits only to a validated standing pose or into air mode.

#### Other inferences
- Ladder rungs and mantle contacts are footstep-like events. Routing them through `surfaceLoudness` (metal loud) ties traversal into "players predict their own noise" for free.

### Gaps
- I found no primary height limits for shipped mantles or vaults (Tarkov, Reforger, Hunt, Battlefield).
- The Dark Mod's mantle cvars: search summaries mentioned `pm_mantle_height` (a fraction of player height, default 0.2), `pm_mantle_reach` (0.5), `pm_mantle_minflatness` (0.707) and `pm_mantle_while_shouldering` (on). I couldn't find the issue page holding that diff (issues 6390 and 5962 don't contain it), so treat these as unverified.
- The Dark Mod's code license isn't verified here.
- Rules for interrupting a ladder (taking damage, being shot) in Arma, Tarkov or Battlefield: not found.
- Source's `ClimbSpeed()` value and its top and bottom exit code sit in the part of the file I didn't read.

## 3. Prone: collision shapes, turning, aligning to terrain, pitfalls

### Takeaway
A single upright capsule can't cover a prone body. Engine practice adds a second, flat collider for prone. Shipped games that let the legs clip have recurring exploits: legs stick through walls and get shot, and AI rifles and cameras poke through walls. Bohemia's notes show the hard part is the shape swept while turning and changing stance, more than the static pose: it needs a 50 cm gap, and changing the rotation axis couldn't fully cure wall clipping.

For Sightline: a chain of circles (or a stadium) the length of the body, grown gradually while entering prone. Every part is checked against solids and terrain every tick. A turn is either swept and limited, or pushed out, but never through a wall.

### Cited Findings
- **P1 · A separate prone collider** [Engine practice: Unreal]. A capsule can't cover a prone pose, so legs or torso end up outside it. Suggested fixes: spawn a flat collider the size of the body with the capsule's collision settings, or a separate prone collider active only when prone. — [Unreal forum: Prone Collision](https://forums.unrealengine.com/t/prone-collision/73950); [Unreal forum: collision setup for prone](https://forums.unrealengine.com/t/how-can-i-properly-set-up-character-collision-for-prone/391667); [Unreal forum: going into walls while prone](https://forums.unrealengine.com/t/how-would-i-prevent-my-character-from-going-into-a-wall-while-prone/630680) (snippet: forum)
- **P2 · Legs through walls get shot** [Shipped: BattleBit Remastered, Delta Force, Hell Let Loose]. Players report prone legs sticking out through building walls and taking full damage. One BattleBit player notes that many shooters instead push the player away from the wall to keep the legs in. — [BattleBit Steam thread](https://steamcommunity.com/app/671860/discussions/4/3814034023686941160); [Delta Force Steam thread](https://steamcommunity.com/app/2507950/discussions/0/604141771964884150); [Hell Let Loose Steam thread](https://steamcommunity.com/app/686810/discussions/1/4211496988416732974/?l=turkish) (snippet: forum)
- **P3 · Push prone bodies out of geometry** [Shipped: Arma 3, as described in an Arma Reforger ticket]. A Bohemia feedback ticket proposes that prone can't be blocked and is pushed away from colliding geometry, as in Arma 3. — [BI feedback T165055](https://feedback.bistudio.com/T165055) (snippet: tracker; the page returned 403)
- **P4 · Prone clearance metric** [Shipped: Arma 3]. A 50 cm gap is the minimum to move through prone (see M8). — [Arma 3: Infantry Metrics](https://community.bistudio.com/wiki/Arma_3:_Infantry_Metrics) (snippet)
- **P5 · Arma 3's prone and wall-clip reports** [Shipped: Arma 3]. Bohemia tracker reports (from search summaries; not matched to specific ticket numbers):
  - walking through building walls by sidestepping at an angle while turning;
  - AI lying prone with rifles clipping through walls and apparently seeing through them;
  - some structures (a lighthouse, upper floors, certain walls) not colliding with crouched or prone players;
  - a change to the animations' rotation axis reduced wall clipping, but a full fix was said to be beyond Arma 3's animation system;
  - sinking into terrain lowers the player without shrinking the hitboxes.

  — [BI feedback T77845](https://feedback.bistudio.com/T77845), [T59490](https://feedback.bistudio.com/T59490), [T61441](https://feedback.bistudio.com/T61441), [T85365](https://feedback.bistudio.com/T85365) (snippet: tracker)
- **P6 · Prone clipping patched map by map** [Shipped: Battlefield 2042 (2021); Battlefield 6 (2025)].
  - BF2042's update 3.2.0 notes fixed prone clipping on specific geometry. — [EA forums](https://forums.ea.com/blog/battlefield-game-info-hub-en/battlefield-2042---update-3-2-0/7011697/replies/7011749) (snippet)
  - A BF6 fix addressed soldiers' legs rotating wrongly with the body when falling while prone. — [DSOGaming](https://www.dsogaming.com/?p=191821) (snippet; I'm not sure this page is the source)

### Inferences
#### Fit notes (one line per technique)
- **P1:** In Sightline the body's kind owns its shape (rule 10: sizes, limits and parts come from `tuning.bodies`). A prone kind can declare three circles along the facing axis (head and chest, hips, knees and feet), r ≈ 0.2–0.25 m, spanning 1.5 m. That reuses the existing `circleOverlaps` and `pushOutCircle`, and the shape lives in tuning, so recordings embed it (rule 16).
- **P2/P3:** Pushing a prone body out of a wall must respect rule 10's order (solids beat bodies), and the push can't carry it through another wall. With walls on both sides, the move or turn is refused. Because every circle is checked, no leg ever ends a tick inside a wall, so BattleBit's exploit can't arise.
- **Entering prone (0.75 s):** grow the footprint from the standing circle to the full chain over the transition, checking each tick. If the space behind is blocked, extend forward instead, or refuse with a cue. The invariant then holds with no exception.
- **Turning while prone:** put the pivot near the head and chest, so the eye doesn't swing and the view stays steady and predictable, while the feet sweep an arc. Limit each tick's yaw change to the largest that keeps every circle clear, found by bisection with a fixed number of iterations (rule 18).
- **Terrain:** sample the height under each circle on the same triangles as everything else (rule 7). Take the body's pitch from the heights under head and feet. Check "never under the terrain" for every circle. On ground steeper than 42°, a prone body slides like any other.
- **P5:** "The rifle clips through the wall and sees through it" can't happen here. The eye sits inside the head circle, the head never ends a tick inside a solid, and a shot leaves from where the camera looks (rule 14). Arma's hitbox left behind by terrain sinking is ruled out because what is drawn is what is simulated (rule 14).
- **P6:** Map-by-map patches are what a game gets without an invariant. The fuzzing bots (`npm run fuzz`) and the invariant run should drive prone bodies into walls and slopes: entering prone, crawling, turning.

#### Other inferences
- With the prone chain in place, a dead or unconscious body (section 4) can reuse it as a "corpse" body kind. Drops and drags then obey the same invariants as everything else.

### Gaps
- PUBG, Squad, Tarkov and Battlefield prone collision shapes: no primary sources found.
- Turning rates while prone, and how shipped games align a prone body to terrain: not found.
- The Bohemia metrics page and ticket T165055 returned 403, so their content comes from search summaries.

## 4. Bodies: carrying versus dragging, speed penalties, noise, hiding places, how AI discovers bodies

### Takeaway
Shipped stealth games converge on a few patterns:
- **Moving bodies:** shoulder-carrying (Thief, Splinter Cell before Conviction, Dishonored) or dragging (Hitman from 2016 on).
- **Hiding bodies:** move them out of light and sight (Splinter Cell); push them into foliage, buildings or off cliffs (Sniper Elite); or put them in containers of limited capacity (Hitman: two per container).
- **Discovery:** guards perceive a body as a change in the world (Thief), a patrol finds it (Chaos Theory), a camera finds it (Conviction), or, in early Splinter Cell, the game sweeps an area you've left for bodies in lit spots.

No source gave concrete speed penalties or noise values for carrying or dragging. For Sightline, carrying and dragging belong to the carrier as limits in the motor (a speed cap, the gait, footstep loudness per surface). The body is its own entity, and guards find it only through perception (rule 13).

### Cited Findings
- **B1 · Bodies as perceivable evidence** [Shipped: Thief: The Dark Project, 1998].
  - NPCs react to visual changes in their environment such as blood stains, opened doors and fallen bodies. — [Wikipedia](https://en.wikipedia.org/wiki/Thief:_The_Dark_Project) (snippet: wiki)
  - Leonard's sensory system holds awareness in "sense links" that act as the AI's memory and can be shared with other AIs. — [Game Developer, 2003](https://www.gamedeveloper.com/programming/building-an-ai-sensory-system-examining-the-design-of-i-thief-the-dark-project-i-) (read: primary)
  - Sleeping bodies snore and wake easily, unconscious bodies cry out when attacked, and corpses do neither. Guards may or may not raise the alarm on finding a corpse, and on some difficulties a kill fails the mission. — [Thief Wiki: Corpse](https://thief.fandom.com/wiki/Corpse) (snippet: fan wiki)
- **B2 · Sweep versus patrol discovery** [Shipped: Splinter Cell (2002), Pandora Tomorrow (2004), Chaos Theory (2005)].
  - In the earlier games, leaving an area made the game sweep it for unconscious or dead bodies in well-lit spots, and raise an alarm for any it found. In Chaos Theory, a patrolling guard has to discover the body. — [Splinter Cell Wiki: Alarm](https://splintercell.fandom.com/wiki/Alarm) (snippet: fan wiki)
  - Walkthrough advice: always move bodies into darkness, but even in the dark a guard who steps onto one raises the alarm. — [GameSpot Pandora Tomorrow walkthrough](https://www.gamespot.com/articles/tom-clancys-splinter-cell-pandora-tomorrow-walkthrough/1100-6094883) (snippet: guide)
- **B3 · No carrying; cameras find bodies** [Shipped: Splinter Cell: Conviction, 2010]. You can't carry bodies, and an alarm is raised if an enemy finds a dead comrade or a security camera spots the body. — [Gamepressure](https://www.gamepressure.com/tomclancyssplintercellconviction/hints/zd24eb) (snippet: guide)
- **B4 · Containers with a capacity; dragging, not carrying** [Shipped: Hitman (2016), Hitman 2 (2018), Hitman 3 (2021)].
  - Bodies go into wardrobes, containers and crates, at most two per container. — [Gamepressure](https://www.gamepressure.com/hitman-iii/bodies-how-to-get-rid-of-them/zee225); [Twinfinite](https://twinfinite.net/guides/hitman-3-hide-bodies/) (snippet: guides)
  - A full container refuses more bodies; a mod resets containers to remove the "container full" error. — [Nexus Mods](https://www.nexusmods.com/hitman3/mods/1417) (snippet)
  - A player complains that 47 drags bodies rather than shoulder-carrying them. — [Steam (Hitman 2)](https://steamcommunity.com/app/863550/discussions/0/3020122487791751157) (snippet: forum)
  - Speedrunners document a fast-drag input. — [speedrun.com](https://speedrun.com/hitman_2/guide/k58lm) (snippet)
  - A wiki entry about the Blood Money and Hitman 2 era says hidden bodies are never discovered and never wake. — [Hitman Wiki: NPC](https://hitman.fandom.com/wiki/NPC) (snippet: fan wiki)
- **B5 · Dumpsters as hiding places** [Shipped: Metal Gear Solid V, 2015]. Dumpster-style trash cans return as places for Snake to hide, from which he can peek, fire or use CQC. — [Metal Gear Wiki: Trash can](https://metalgear.fandom.com/wiki/Trash_can) (snippet: fan wiki; about Snake hiding, not about disposing of bodies)
- **B6 · The world disposes of bodies** [Shipped: Dishonored, 2012]. An unconscious NPC left where rats can reach it may be "cleaned up", which counts as a kill. A body dropped in water counts as a kill too. Whether natural rat swarms count is disputed between the fan wiki and players. — [PC Gamer, reporting Bethesda's details](https://www.pcgamer.com/dishonored-chaos-guide-stealth-no-detection-explanation) (snippet: press; the page wouldn't load for me)
- **B7 · Foliage, cliffs, throwing and booby traps** [Shipped: Sniper Elite 4 (2017), Sniper Elite 5 (2022)].
  - Sniper Elite 4 guide: hide bodies in bushes or buildings, or throw them off cliffs; bodies can be thrown a long way. Enemies who find one investigate it and search the area, and a body can be booby-trapped with an S-mine. — [Gamepressure SE4](https://www.gamepressure.com/sniper-elite-4/sneaking-and-silent-kills/z7971f) (read: guide)
  - The same guide gives the stance rules: crouching and crawling are quieter but much slower, and running crouched alarms enemies at about 5 m.
  - Sniper Elite 5 guides: found bodies cause searches, unconscious enemies can be woken, and bodies can be thrown off bridges or hidden in crates. Carrying appears at least in one mission objective (carry Baumann). — [GamesRadar](https://gamesradar.com/sniper-elite-5-tips); [Gamepressure SE5](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d); [Gamepressure SE5 mission](https://www.gamepressure.com/sniper-elite-5/lanzo-baumann/z0fddb) (snippet: guides)

### Inferences
#### Fit notes (one line per technique)
- **B1:** A body is an entity whose presence lab A turns into a stimulus. A guard can react only to a body he perceives (rule 13). Unconscious or dead is a state of the entity, and an unconscious body can make noise (Thief's cries) through the event system.
- **B2:** Early Splinter Cell's rule (a lit body is found when you leave the area) is easy to make deterministic, but it has no witness, so it breaks rule 13's spirit. Prefer Chaos Theory's rule, where a patrol finds the body. Computing light at the body's position with the player's own function (R1) gives the player a readable rule: put him in shadow.
- **B4:** Container capacity is content data in tuning (rules 4 and 16). A body in a closed container simply can't be perceived until the container is opened.
- **Carrying:** a constraint on the carrier inside the motor (rule 10). Speed capped (for example at or below walk), no sprint, no prone, mantling optional. Footfalls get louder by a load multiplier times the surface's loudness, so gravel is loud. The carried body adds to the carrier's exposure.
- **Dragging:** slower (crawl to crouch-walk speeds), with a continuous scrape noise per surface. A trailing circle behind the carrier is resolved together with him through `resolveMove`.
- **Dropping:** a body is put down only where its shape fits (outside solids, on the terrain), the same invariant as any body. The corpse kind can reuse the prone chain (section 3).
- **B6/B7:** Hiding in foliage means a foliage volume lowers the body's exposure, in the same visibility function as the player's. Booby traps are out of scope.

#### Other inferences
- Dragging and carrying noise is where the exit test bites: if "slow and noisy on gravel" is real, the player must hear their own drag scrape at a loudness that matches the simulation, as footsteps already do (the calibration step).

### Gaps
- No documented speed penalties or noise values for carrying or dragging in any listed game.
- Metal Gear Solid V: radio check-ins for missing soldiers and its rules for bodies in dumpsters weren't verified.
- Dishonored and Splinter Cell carry speeds, and Thief's noise rules for carrying and dropping bodies: not found.

## 5. Self-readouts: light gems, noise meters and rings; can players predict their own exposure without a meter?

### Takeaway
The history runs in three stages:
1. **HUD meters:** Thief's light gem (1998), Splinter Cell's light meter (2002), Metal Gear Solid 3's camo index (2004), and Chaos Theory's noise meter with an ambient marker (2005).
2. **Reading exposure from the world:** Conviction's black-and-white screen (2010), Mark of the Ninja's binary light and noise rings (2012), Dishonored's model built on geometry (2012), and Hunt: Showdown's feedback carried by audio alone (2019 on).
3. **A partial return to small meters in big games:** Splinter Cell: Blacklist (2013), and Assassin's Creed Shadows' eye icon with an outline on the hidden character (2025).

What designers learned:
- Keep the underlying rule simple and in a few levels: binary light in Mark of the Ninja, discrete outputs in Thief.
- Sample exposure somewhere the player can see it: Thief biased the player's lighting toward the floor beneath them.
- Make every change in a guard's behaviour traceable to a cause.
- Full-screen effects were rejected as jarring. Meters invite players to stare at them, and an added meter can undercut the design.

Players can predict their own exposure without a meter only when the world shows the rule: lit pools, crisp thresholds, and audible footsteps distinct for each surface.

### Cited Findings
- **R1 · Thief's analog visibility, sampled near the floor** [Shipped: Thief: The Dark Project, 1998]. From Tom Leonard, the game's lead programmer, writing in Game Developer on 7 Mar 2003 (read: primary) — [Game Developer](https://www.gamedeveloper.com/programming/building-an-ai-sensory-system-examining-the-design-of-i-thief-the-dark-project-i-):
  - Each object has a visibility value of its own, built from lighting, movement and exposure (size, and separation from other objects), stored as an analog value from 0 to 1.
  - The player's lighting is biased toward the light near the floor below them, so that players can anticipate their own safety.
  - Vision uses ordered view cones and several raycasts. Sounds propagate through the level's 3D geometry.
  - Awareness is a set of discrete states. Rises pass through a time filter, which gives reaction delays and forgiveness; falls pass through a capacitor and fade one state at a time.
  - Sensing has to be perceivable and understandable by the player, so the design uses a limited set of inputs the player can perceive and discrete outputs they can learn.
- **R2 · The light gem** [Shipped: Thief series]. A HUD gem that brightens and darkens with the light level at Garrett's position. — [Thief Wiki: Light Gem](https://thief.fandom.com/wiki/Light_Gem) (snippet: fan wiki)
- **R3 · A rendered light gem** [Shipped: The Dark Mod; source on a public SVN].
  - It sets up a separate view, hides the player model and held objects, substitutes a low-poly stand-in, renders it and analyses the image. Version 2.05 skipped shadowless surfaces and lights the player isn't inside, and later captured only the top or bottom of the image per pass by default. — [ModDB, 2.05 notes](https://www.moddb.com/news/the-dark-mod-205-is-here); [`LightGem.h`](https://svn.thedarkmod.com/publicsvn/darkmod_src/branches/appveyor3/game/LightGem.h)
  - Known bugs: brightness depended on view angle because the capture view's offset took in part of the world (#50), and brightness drifted with turning after a renderer change to the GL state code (#3144). — [TDM #50](https://bugs.thedarkmod.com/view.php?id=50); [TDM #3144](https://bugs.thedarkmod.com/view.php?id=3144)
  - A proposal: a lit lantern means full brightness, running one step brighter, crouching one step darker. — [TDM #251](https://bugs.thedarkmod.com/view.php?id=251)
  - Mapping guidance: the gem gives crouching a bonus, and the default ambient light should keep surfaces visible. — [TDM wiki: Virtual Darkness](https://wiki.thedarkmod.com/index.php/Virtual_Darkness)

  (snippet: primary tracker, wiki and release notes)
- **R4 · A light meter plus a noise meter with an ambient marker** [Shipped: Splinter Cell: Chaos Theory, 2005].
  - Next to the light bar, a sound meter shows Sam's noise against the ambient noise. Staying below the ambient mark keeps you unheard, so traffic or thunder covers movement. — [Nintendo World Report](https://nintendoworldreport.com/review/4357); [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Chaos_Theory) (snippet: reviews and wiki)
  - One reviewer found the sound meter more useful than the light meter. — [Worth Playing](https://worthplaying.com/article/2005/3/28/reviews/23463-xboxpc-review-splinter-cell-chaos-theory) (snippet)
  - A user review says the light meter is divided into four sections. — [Backloggd](https://www.backloggd.com/u/Uni/review/91469/) (snippet: user review, lower)
- **R5 · A light on the character** [Shipped: Splinter Cell: Double Agent, 2006]. A guide says the light on Sam's shoulder turns green when the shadow is deep enough. — [SuperCheats](https://www.supercheats.com/xbox360/tom-clancys-splinter-cell-double-agent/3176/stealth-tips/) (snippet: guide)
- **R6 · A full-screen effect replaces the meter** [Shipped: Splinter Cell: Conviction, 2010].
  - The screen drains to black and white in shadow, and colour returns as soon as light touches Sam. — [Giant Bomb user review](https://www.giantbomb.com/tom-clancys-splinter-cell-conviction/3030-20464/user-reviews/2200-14403/) (snippet)
  - Ubisoft's Steven Masters presented this as removing the small graph, so players stop studying a detection meter. — [GamesRadar interview](https://www.gamesradar.com/splinter-cell-conviction-interview) (snippet: press)
  - Being spotted showed as a shrinking white ring. — [GamesRadar hands-on](https://gamesradar.com/tom-clancys-splinter-cell-conviction-hands-on-10) (snippet)
  - A mod removes the filter; the ammo HUD still changes colour between light and shadow. — [ModDB](https://www.moddb.com/games/tom-clancys-splinter-cell-conviction/addons/removing-the-black-white-filter-in-shadows) (snippet)
- **R7 · The effect reversed** [Shipped: Splinter Cell: Blacklist, 2013].
  - Creative director Maxime Béland said the team read about 80 reviews and the black-and-white filter was the second most common complaint, so it was removed. — [Game Informer, 17 Jul 2012](https://www.gameinformer.com/b/features/archive/2012/07/17/directing-splinter-cell-an-interview-with-maxime-beland.aspx) (snippet: press)
  - Game director Patrick Redding said the team found the filter jarring and went back to a light meter familiar from Double Agent. — [PC Gamer](https://www.pcgamer.com/splinter-cell-blacklist-game-director-talks-stealth-goggles-abusive-insta-fail-missions) (snippet: press; the page wouldn't load)
  - Both the art team and players had found the black-and-white cue annoying. — [PC Gamer preview](https://pcgamer.com/splinter-cell-blacklist-hands-on-perfectionist-mode-takes-fisher-back-to-basics) (snippet)
- **R8 · Binary light, noise rings and readable AI** [Shipped: Mark of the Ninja, 2012]. Lead designer Nels Anderson's rules, as reported by Mathew Kumar in Game Developer on 3 Dec 2012 (read: press) — [Game Developer](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules); talk: [GDC Vault 2013, "Of Choice and Breaking New Ground"](https://gdcvault.com/play/1017791/Of-Choice-and-Breaking-New):
  - There is no visibility meter: light and dark are binary. A hidden character is drawn dark with red highlights, a lit one in full colour.
  - A guard who glimpses you at the edge of his sight approaches quickly but isn't fully alert.
  - The reach of a noise is drawn as a ring (for example, the radius of a light about to be smashed), and guards' sight limits are shown.
  - Guards have three awareness states, each with visible cues for entering it. A "ghost" marks where you were last seen, and guards look toward sources of sound.
  - Every change in a guard's behaviour should be traceable to what caused it.
  - An added focus-aiming meter undercut the design and was removed.
- **R9 · A model built on geometry, with no light meter** [Shipped: Dishonored, 2012]. Arkane's tips (read: primary) — [witchboy.net](https://www.witchboy.net/2012/10/):
  - The stealth model is mostly enemy view cones and occlusion.
  - Darkness matters at a significant distance; up close, the enemy's facing and field of view matter most.
  - Most HUD elements can be turned off.
- **R10 · The camo index** [Shipped: Metal Gear Solid 3, 2004; Peace Walker, 2010]. A percentage that combines how well the uniform and face paint match the surface, the stance (prone in grass is best) and movement (moving lowers it, staying still raises it). In Peace Walker, crouching beats standing and firing briefly cuts the index. A 2004 demo showed 45% standing in grass. — [StrategyWiki: MGS3 Camouflage](https://strategywiki.org/wiki/Metal_Gear_Solid_3:_Snake_Eater/Camouflage); [StrategyWiki: Peace Walker](https://strategywiki.org/wiki/Metal_Gear_Solid:_Peace_Walker/Gameplay); [Kikizo, Apr 2004](https://games.kikizo.com/news/200404/002.asp) (snippet: guides and press)
- **R11 · The sound-masking indicator** [Shipped: Sniper Elite series, including Sniper Elite 5 (2022) and Resistance (2025)].
  - A wavy sound indicator at the top of the screen shows when your shots will be masked by loud sources. — [Kotaku](https://kotaku.com/sniper-elite-resistance-tips-ping-health-noise-1851749709); [Gamepressure SE5](https://www.gamepressure.com/sniper-elite-5/stealth/z5fe6d) (snippet: guides)
  - Reviewers called masking poorly implemented or inconsistent; artillery and aircraft always mask the rifle. — [Engadget (SE3)](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html); [Game Informer (SE4)](https://www.gameinformer.com/games/sniper_elite_4/b/playstation4/archive/2017/02/13/sniper-elite-4-game-informer-review.aspx) (snippet: reviews)
  - Players report enemies hearing shots the game said were masked. — [Steam (SE4)](https://steamcommunity.com/app/312660/discussions/0/3059617763566365961) (snippet: forum)
- **R12 · Audio as the readout** [Shipped: Hunt: Showdown, 2019; relaunched as Hunt: Showdown 1896 in 2024].
  - Crytek's audio director Florian Füsslin describes the feedback as an audio language the player can read. A high dynamic mix makes loud things stand out and gives players a realistic sense of how loud they are. Every sound comes from a real source and attenuates realistically over distance, and crows taking off tell you another player caused it. — [PlayStation Blog, Feb 2020](https://blog.playstation.com/?p=221483) (read: primary interview)
  - Sound traps include crows, ducks, horses, chickens, chained dogs, chains and broken glass. — [Red Bull guide](https://redbull.com/gb-en/hunt-showdown-tips-guide) (snippet: guide)
  - A June 2025 update fixed silent footsteps caused by missing or wrongly assigned surface types, and missing footsteps in vegetation. — [Hunt dev insight, Jun 2025](https://www.huntshowdown.com/news/dev-insight-audio-design-recap-what-s-new-in-update-24) (snippet: primary)
- **R13 · A small eye meter plus an outline; prone lowers visibility** [Shipped: Assassin's Creed Shadows, 2025].
  - Ubisoft: global illumination makes dynamic light and shadow that affect enemy vision, players can make darkness by destroying lanterns, standing raises visibility, and crouching and prone lower it. — [Ubisoft, 21 Nov 2024](https://www.ubisoft.com/en-us/game/assassins-creed/news/1lmnk4XTnnqRh1foViGYPR/assassins-creed-shadows-stealth-gameplay-overview) (snippet: official)
  - Previews describe a light meter at the top centre of the screen: an eye whose bars fill as the risk of being seen rises. — [PC Gamer preview, 2024](https://pcgamer.com/games/rpg/assassins-creed-shadows-previwe-summer-game-fest-2024); [Vulkk](https://vulkk.com/2024/06/12/assassins-creed-shadows-at-ubisoft-forward-gameplay-mechanics-story-and-ui/) (snippet: press)
  - Players say a closed eye means you're in shadow and a white outline marks Naoe as hidden. — [Steam](https://steamcommunity.com/app/3159330/discussions/0/800059836888869608) (snippet: forum)

### Inferences
#### Fit notes (one line per technique)
- **R1:** Compute the player's light inside the simulation and deterministically (sun or moon plus camp lights, shadowed by colliders), and sample it at the ground under the player. The lit patch they can see on the ground then is the rule. Group visibility into a few levels the player can learn.
- **R2/R3:** Avoid a rendered light gem. It depends on the GPU, it is sensitive to view angle (#50, #3144), and it can't run in the headless simulation. Any readout must come from the same function lab A uses (rule 1: the renderer reads, never writes).
- **R4:** Chaos Theory's ambient marker maps straight onto Sightline: footstep loudness (gait × surface) against ambient sound (wind, generators). Sniper Elite's shot masking (R11) is the same idea for the rifle, so one masking model can serve both.
- **R5/R13:** If an honest-view cue is needed, a cue on the body (a tint on the hands or weapon, or a small glyph) is the accepted, low-clutter form. Full-screen filters were rejected (R6/R7).
- **R8:** Crisp thresholds and visible causes are what make "testers predict detection 80% of the time" plausible. The light term can be coarse (lit, dim, dark) even if the rest of the model is continuous. The debug view (rule 8) can draw noise rings and sight cones as Mark of the Ninja does.
- **R9:** Dishonored's split (darkness matters at range; facing and field of view up close) is close to Sightline's distance-and-light model, and it suits a sniper who engages from range.
- **R10:** The camo index shows that one composed percentage can be shown to players. The debug overlay can show Sightline's composed visibility and its factors, and a training mode could show it in the honest view.
- **R12:** Without meters, the mix must make the player's own footsteps clearly audible and distinct for each surface, at a loudness that matches the simulation (the project's footstep calibration). A wrongly tagged surface silently breaks prediction (Hunt, 2025), so test that each terrain cell's surface tag matches its rendered material.

#### Other inferences
- The exit test ("predict how loud and visible you are from your stance and the surface") can be met with no meter if light, stance and surface each map to a few levels the player can see or hear. A meter mainly helps where the rule is invisible: ambient masking, and light from sources behind the player.
- The evidence (Masters, R6; Mark of the Ninja's removed meter, R8) says a permanently visible meter turns into the thing players watch instead of the world. If one is added, keep it small and ideally on the body, as Double Agent and Shadows do.

### Gaps
- The Last of Us: no source found on lighting's role in perception or on how stealth state is shown. Only the abstract of the GDC 2014 talk turned up: [GDC Vault: The Last of Us: Human Enemy AI](https://gdcvault.com/play/1020338/The-Last-of-Us-Human).
- No quantitative studies found of players predicting their exposure with versus without a meter.
- Chaos Theory's meters have no official documentation in what I found, only reviews.
- Metal Gear Solid Delta (2025): the remake's camo index wasn't checked.

## 6. Kinematic character controllers and the feel of a fixed tick with interpolation

### Takeaway
Industry controllers share one core:
- a kinematic shape (a capsule) moved by "collide and slide", with a bounded number of iterations;
- a small skin or offset that keeps it off surfaces;
- a step-up and step-down pass;
- a walkable-slope threshold near 45°: about 44.8° in UE, a surface-normal z of 0.7 (≈45.6°) in Source and Quake, 50° by default in Jolt, 45° in Flutter Scene.

Sightline's 0.45 m step equals UE's default MaxStepHeight of 45 cm, and its 42° slope limit is a little stricter than all of these.

Running the simulation at a fixed step and interpolating shows the world 1–2 ticks late: 33–67 ms at 30 Hz. That is why mouse look is applied per frame (Godot's advice, and Sightline's practice), and why shipped shooters time shots within the tick (Overwatch, CS2).

### Cited Findings
- **K1 · Quake III's `PM_SlideMove` and `PM_StepSlideMove`** [Shipped: Quake III Arena, 1999; GPL-2.0] (read: primary source code) — [`bg_slidemove.c`](https://raw.githubusercontent.com/id-Software/Quake-III-Arena/master/code/game/bg_slidemove.c); [repository](https://github.com/id-Software/Quake-III-Arena) (license checked through the GitHub API)
  - Up to 4 bumps, with `MAX_CLIP_PLANES` set to 5.
  - Hitting the same plane again nudges the velocity out along it.
  - With two planes, velocity is clipped against both and slides along their crease (their cross product); with three, it stops.
  - Stepping: slide first. If clipped, trace up by `STEPSIZE`, slide again, then trace down.
  - It refuses to step when moving upward and the ground below is missing or too steep (normal z < 0.7).
  - It plays step sounds by height climbed.
- **K2 · Source's `TryPlayerMove` and `StepMove`** [Shipped: Source games, 2004 on; Source 1 SDK License, see D1] (read: primary source code) — [`gamemovement.cpp`](https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/shared/gamemovement.cpp)
  - `numbumps` 4 and `MAX_CLIP_PLANES` 5.
  - A surface counts as floor when its normal z > 0.7. The same threshold decides staying on the ground and step landings.
  - `StepMove` tries both a plain slide and a stepped slide, and keeps whichever went farther horizontally. If the step lands on ground steeper than the threshold, it falls back to the plain result.
- **K3 · Unreal's CharacterMovementComponent** [Engine: UE4/UE5].
  - MaxStepHeight defaults to 45 (cm, per forum users). The walkable floor angle is about 44–45° (WalkableFloorZ ≈ 0.71, its cosine). — [UE docs: walkable slope](https://dev.epicgames.com/documentation/en-us/unreal-engine/walkable-slope-in-unreal-engine); forum posts [639300](https://forums.unrealengine.com/t/ai-refuse-to-navigate-steps-despite-having-a-valid-nav-mesh/639300), [346709](https://forums.unrealengine.com/t/ai-moving-through-different-height-levels/346709/9), [277151](https://forums.unrealengine.com/t/question-change-slope-for-character-movement/277151) (snippet: docs and forum)
  - `PerchRadiusThreshold` stops the character from perching on an edge whose contact is that close to the capsule's rim. Characters don't fall off while within MaxStepHeight of a walkable surface below. `PerchAdditionalHeight` lets the character hang slightly higher off an edge, while step-ups still obey MaxStepHeight. — [UE API: PerchRadiusThreshold](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/GameFramework/UCharacterMovementComponent/PerchRadiusThreshold?application_version=5.5); [UE API: PerchAdditionalHeight](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/GameFramework/UCharacterMovementComponent/PerchAdditionalH-?application_version=5.5) (snippet: official docs)
  - `FindFloor` is a vertical sweep of the capsule. — [UE API: FindFloor](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UCharacterMovementComponent/FindFloor) (snippet: official docs)
- **K4 · Unity's CharacterController** [Engine: Unity]. The manual advises:
  - Step Offset between 0.1 and 0.4 m for a 2 m human.
  - Skin Width about 10% of the radius and above 0.01. Colliders may penetrate that deep; this removes jitter and keeps the character from getting stuck.
  - Min Move Distance 0.
  - Slope Limit not too small; the manual says 90° often works best.
  - Height around 2 m for a human-like character.

  — [Unity Manual: Character Controller](https://docs.unity.com/en-us/engine/current/manual/physics-section/physics-overview/character-control-section/class-character-controller) (read: primary)
- **K5 · Kinematic Character Controller (Philippe St-Amand)** [Asset: Unity Asset Store; release date not verified]. From the user guide (read; it is a third-party npm mirror, so its provenance is lower; its support address is the author's) — [User Guide (mirror)](https://cdn.jsdelivr.net/npm/kinematic-char-controller@0.0.1/UserGuide.pdf); [Unity forum release thread](https://discussions.unity.com/t/released-kinematic-character-controller/678434) (snippet):
  - The `KinematicCharacterMotor` solves movement and collision from a velocity and a rotation that user callbacks supply (`UpdateVelocity`, `UpdateRotation`, `IsColliderValidForCollisions`).
  - Each FixedUpdate, `KinematicCharacterSystem`:
    1. saves poses, as the start of interpolation;
    2. computes the velocities of moving platforms;
    3. runs `UpdatePhase1`, which solves initial overlaps and grounding;
    4. places the platforms;
    5. runs `UpdatePhase2`, which solves movement and the final pose;
    6. restores the saved transforms so rendering can interpolate.
  - Setting `AutoSimulation = false` lets a networked game re-simulate past inputs.
  - Query buffers are fixed-size and don't allocate (32 hits, 32 overlaps).
  - Teleport with `SetPosition`. Resize only through `SetCapsuleDimensions`, because dimensions are cached. Never parent the character to a moving transform.
  - Root motion is applied by converting it to a velocity.
- **K6 · PhysX's character controller (CCT)** [Engine: PhysX 5; BSD-3-Clause] (read: primary docs) — [PhysX docs](https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/CharacterControllers.html); [repository](https://github.com/NVIDIA-Omniverse/PhysX)
  - It is kinematic rather than dynamic, to avoid tunnelling and jitter, friction and restitution that can't be tuned to zero, launches off ramps, and a rotating capsule. It moves by "collide and slide" with sweeps.
  - `contactOffset` is the skin. `stepOffset` should be kept small.
  - For capsules, `eEASY` climbing may go above stepOffset and `eCONSTRAINED` tries not to.
  - `slopeLimit` is given as a cosine. `nonWalkableMode` either prevents climbing, or prevents climbing and forces sliding.
  - `upDirection` can be any direction. An overlap-recovery module pushes characters out of static geometry. Precise sweeps exist, as do invisible walls built beside non-walkable triangles.
  - Nearby geometry is cached with `volumeGrowth`, and large triangles can be tessellated.
  - Limitations: slope limits apply only to static geometry, and the update order of obstacles, controllers and cameras matters to avoid jitter. Use MTD for consistent normals.
- **K7 · Jolt's CharacterVirtual** [Engine: Jolt Physics, MIT; JoltPhysics.js, MIT] (read: primary docs) — [CharacterVirtualSettings](https://jrouwe.github.io/JoltPhysics/class_character_virtual_settings.html); [CharacterVirtual](https://jrouwe.github.io/JoltPhysics/class_character_virtual.html) (snippet for the function signatures); [JoltPhysics](https://github.com/jrouwe/JoltPhysics); [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js)
  - Settings and their defaults:

    | Setting | Default | Note |
    | --- | --- | --- |
    | `mMaxSlopeAngle` | 50° | |
    | `mCharacterPadding` | 0.02 | |
    | `mPenetrationRecoverySpeed` | 1.0 | |
    | `mPredictiveContactDistance` | 0.1 | too low sticks; too high gives ghost collisions |
    | `mMaxCollisionIterations` | 5 | |
    | `mMaxConstraintIterations` | 15 | |
    | `mMinTimeRemaining` | 1e-4 | |
    | `mCollisionTolerance` | 1e-3 | |
    | `mMaxNumHits` | 256 | |
    | `mHitReductionCosMaxAngle` | 0.999 | |
    | back faces | collide | |
    | inner rigid body | optional | lets ray casts hit the character |
    | `mMass` | 70 kg | |
    | `mMaxStrength` | 100 N | |
  - `WalkStairs(...)` takes step-up, step-forward, forward-test and extra step-down vectors. `StickToFloor(stepDown)` keeps the character on the floor.
- **K8 · Rapier's kinematic character controller** [Engine: Rapier and rapier.js, Apache-2.0] (read: primary docs) — [Rapier JS guide](https://rapier.rs/docs/user_guides/javascript/character_controller); [slopes and autostep page](https://rapier.rs/docs/user_guides/templates/character_controller_slopes/) (snippet); [rapier](https://github.com/dimforge/rapier); [rapier.js](https://github.com/dimforge/rapier.js)
  - Move-and-slide by ray casts and shape casts. Translation only; gravity is the caller's job.
  - An `offset` gap from geometry, and `setUp` for the up direction.
  - `setMaxSlopeClimbAngle` and `setMinSlopeSlideAngle`, in radians.
  - Autostep takes a maximum height, a minimum width of room on top, and whether to step onto dynamic bodies. It acts only when the character touched the floor just before the obstacle. It is off by default and expensive.
  - `enableSnapToGround(distance)`. Collisions are reported in order.
  - A comparable Flutter Scene controller defaults both slope angles to 45° (π/4). — [pub.dev](https://pub.dev/documentation/flutter_scene/latest/physics/KinematicCharacterController-class.html) (snippet)
- **K9 · The collide-and-slide papers** [Research: Fauerby 2003; Linahan 2012]. Fauerby gives swept-ellipsoid collision against triangles with a sliding response, building on earlier work by Paul Nettle and Jorrit Rouwé. Linahan documents numerical-robustness problems in Fauerby's response step and proposes fixes. — [Fauerby, "Improved Collision Detection and Response" (PDF)](http://www.peroxide.dk/papers/collision/collision.pdf), via [Irrlicht forum](https://irrlicht.sourceforge.io/forum/viewtopic.php?p=197125); [Linahan, arXiv 1211.0059](https://arxiv.org/pdf/1211.0059) (snippet: research)
- **K10 · "Fix Your Timestep!"** [Article: Glenn Fiedler, 10 Jun 2004] (read: primary) — [Gaffer On Games](https://gafferongames.com/post/fix_your_timestep/)
  - Add real elapsed time to an accumulator and step the simulation at a fixed dt while it holds a full step.
  - alpha = accumulator ÷ dt. Render a blend of the previous and current states (slerp for orientations).
  - The "spiral of death" is a simulation that takes longer than real time to compute and falls further behind. Avoid it with headroom, or clamp frame time (0.25 s in the article); running slow under load beats spiralling.
- **K11 · Interpolation delay and handling the camera** [Engine: Godot, MIT] (read: primary docs) — [Godot: introduction](https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/physics_interpolation_introduction.html); [Godot: advanced](https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/advanced_physics_interpolation.html); [repository](https://github.com/godotengine/godot)
  - Interpolation shows objects 1–2 ticks in the past. Most players won't object, fast-input games may feel a slight lag, and a higher tick rate shortens it.
  - Extrapolation avoids the delay but risks impossible positions (inside walls) and jarring snaps.
  - Apply mouse look per frame instead of waiting for the next physics tick, and turn off interpolation on the camera's rotation. Interpolate the camera manually, especially at low tick rates.
- **K12 · Shot timing within the tick** [Shipped: Overwatch's "High Precision Mouse Input" option (date not verified; devtrackers lists the developer's post as about five years old); Counter-Strike 2, 2023].
  - Overwatch ticks every 16 ms (62.5 Hz) and normally updates aim once per tick from the raw input since the last one. With the option on, a shot fired between ticks is resolved with the state repositioned to that moment. Looking around feels the same, because each frame already used all raw input before it. — [Blizzard forum thread](https://us.forums.blizzard.com/en/overwatch/t/new-feature-high-precision-mouse-input-gameplay-option/422094); [devtrackers copy](https://devtrackers.gg/overwatch/p/fa58c981-new-feature-high-precision-mouse-input-gameplay-option) (snippet: Blizzard engineer's posts)
  - CS2 timestamps inputs between its 64 Hz ticks, and the server replays them at those times. — [Counter-Strike Wiki](https://counterstrikewiki.com/Sub-Tick_System) (snippet: community wiki, lower)

#### Open-source implementations and licenses (checked through the GitHub API, 7 Nov 2026)
- Quake III Arena: GPL-2.0 (`bg_slidemove.c`, `bg_pmove.c`). [repository](https://github.com/id-Software/Quake-III-Arena)
- Source SDK 2013: Source 1 SDK License, free for modified Valve games on Source 1. Not a general open-source license. [repository](https://github.com/ValveSoftware/source-sdk-2013)
- Rapier and rapier.js: Apache-2.0. The JS/WASM build is usable in a browser. [rapier](https://github.com/dimforge/rapier), [rapier.js](https://github.com/dimforge/rapier.js)
- Jolt Physics and JoltPhysics.js: MIT. [JoltPhysics](https://github.com/jrouwe/JoltPhysics), [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js)
- PhysX 5: BSD-3-Clause. [repository](https://github.com/NVIDIA-Omniverse/PhysX)
- Godot: MIT. [repository](https://github.com/godotengine/godot)
- ALS-Community and ALS-Refactored (Unreal locomotion and mantling): MIT. [ALS-Community](https://github.com/dyanikoglu/ALS-Community), [ALS-Refactored](https://github.com/Sixze/ALS-Refactored)
- Unity.CharacterController samples (ECS): Unity Companion License, for Unity-dependent projects. [repository](https://github.com/Unity-Technologies/CharacterControllerSamples)

### Inferences
#### Fit notes (one line per technique)
- **K1:** `resolveMove` can take Quake's bounded clip-plane slide in spirit. Fixed bump and plane counts (4 and 5) satisfy rule 18, and dot, cross, divide and sqrt are allowed math (rule 2). Quake refuses to step onto ground too steep to stand on; that is the step-up analogue of "never gain height on ground steeper than 42°". A step must check the landing's slope (cos 42° ≈ 0.743), not only its height.
- **K2:** "Try both, keep the farther" is deterministic and needs no heuristics, a good fit for the shared motor that guards use too.
- **K3:** The numbers match: 0.45 m step against UE's 45 cm, and 42° against about 44.8°. For prone chains and bodies on ridges, a perch rule (don't stand on a contact near the circle's rim) avoids hovering on corners.
- **K4:** Unity's skin width allows penetration, which Sightline's invariant forbids. Use an offset kept outside instead (Rapier's `offset`, Jolt's 0.02 m padding, PhysX's `contactOffset`), and check it in the invariant run.
- **K5:** KCC's two phases (overlaps and grounding, then movement) and its save-and-restore interpolation mirror Sightline's systems in declared phases (rule 12). Its manual simulation for networking is the same idea as Sightline's replays.
- **K6:** "Prevent climbing and force sliding" is Sightline's existing slide on steep ground. Invisible walls are unnecessary because the slope rule lives in the motor. Overlap recovery would hide bugs; it's better for a body found inside geometry to trip a fault (`sim.fault`) in tests.
- **K7/K8:** Don't put Rapier or Jolt inside `src/sim`. Rule 2 limits simulation math to exactly specified operations and `detmath`, and a WASM engine's internals fall outside that contract. Borrow their parameters and algorithms instead:
  - autostep's minimum width (step only if the circle fits on top);
  - a snap-to-ground distance;
  - a predictive contact distance;
  - iteration caps.
- **K9:** Sightline's terrain is a heightfield with a known diagonal split (rule 7), and its colliders are circles and boxes in plan. Sweeping a circle against them in plan, plus height checks, is simpler than ellipsoids against triangles. Linahan's robustness fixes matter only if a full 3D sweep is ever added.
- **K10/K11:** At 30 Hz the interpolated body is drawn 33–67 ms late. That suits deliberate movement, and Sightline already applies mouse look per frame. The camera offsets for lean, mantle and ladder should be interpolated simulation functions, while rotation stays per frame.
- **K12:** For a sniper, the aim at the instant of the click matters more than movement latency. Carry the look direction at click time, quantized, in `InputFrame`. The recorded shot then equals the live one (rule 5) and leaves from where the camera looked (rule 14). Overwatch's option is the shipped precedent.

#### Other inferences
- **30 Hz versus 60 Hz:** 60 Hz halves both the interpolation delay and the distance moved per tick. At Sightline's speeds (a sprint covers 0.18 m per tick at 30 Hz, a crawl 0.023 m), swept collision makes tunnelling a non-issue at 30 Hz, so the difference is mostly feel. That has to be judged on a real machine; CLAUDE.md notes that a headless browser can't.
- **Iteration budgets as safety:** every engine caps its iterations (Quake 4/5, Source 4/5, Jolt 5/15). Under rule 18, Sightline's caps are part of behaviour, and changing them moves the `behaviour` fingerprint (rule 11).

### Gaps
- UE's defaults are confirmed only by forum posts and summaries of the docs. I didn't read the engine source or check its license (Epic's EULA).
- KCC's motor settings (MaxStableSlopeAngle, StepHandling, LedgeAndDenivelationHandling and so on) and their defaults aren't in the user guide, and the API reference wasn't available. The mirror's provenance is uncertain, and the Asset Store license wasn't checked. I didn't verify whether St-Amand wrote Unity's ECS Character Controller package.
- I didn't read the determinism guides of Rapier and Jolt (Rapier's documentation lists one).
- Quake's `STEPSIZE` is defined in a header I didn't fetch.
- I found no studies of how 30 Hz and 60 Hz compare in feel for character movement.
