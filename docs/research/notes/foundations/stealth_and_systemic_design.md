# Stealth, immersive-sim and systemic sandbox design: principles, pitfalls and techniques for Sightline

How to read these notes. Each finding opens with the principle in bold, then the evidence (who, when), then the source link, then one line on what it means for Sightline. Tags separate shipped evidence from opinion:

- **[Shipped]** what a released game actually does.
- **[Dev]** a developer's own statement, in a postmortem, talk or interview.
- **[Data]** playtest or telemetry numbers that developers reported.
- **[Analysis]** critics, journalists and video essayists (opinion, not primary evidence).
- **[Academic]** a research paper.
- **[Legal]** a patent fact.

**(snippet)** marks a source I saw only in search-result summaries, without opening the page. Everything else was opened and read: articles fetched, PDFs extracted to text. Lines starting "→ Sightline:" are my applications, not sourced claims. Sources are paraphrased; there is one direct quote (Bungie, section 3). Research stopped when the shared web-search budget for the session ran out. Topics I could not search are listed under each Gaps heading.

## 1. How did teams design for many valid approaches and respect player intent?

### Takeaway
The makers of Thief, Deus Ex, Hitman, Desperados III and Teardown converge on one recipe. Give players consistent, legible rules so they can form and carry out their own plans. Frame obstacles as problems with several systemic answers, not one-solution puzzles. Keep the space open and let time, information and enemy behaviour supply the challenge. Avoid special-case scripting. Two warnings recur. Multiple paths are expensive to guarantee by hand: Deus Ex brute-forced them. And one approach can quietly dominate: Far Cry 2's long-range rifles, Sniper Elite 3's shoot-and-relocate loop.

### Cited Findings
- **The core tools are intention and perceivable consequence.** Doug Church of Looking Glass proposed a shared design vocabulary in 1999. *Intention* is the player's ability to devise and carry out their own plans. *Perceivable consequence* is the world's clear reaction to what the player did. He argued that embedded story competes with both. [Dev, theory; 1999] (snippet) — [Game Developer: Formal Abstract Design Tools](https://www.gamedeveloper.com/design/formal-abstract-design-tools).
  → Sightline: Lab A's 80% prediction test and Lab E's "explain every reaction" test perceivable consequence. Add an intention check: after recon, can the tester state a plan and watch it work?
- **Problems, not puzzles, and no forced failure.** In his Deus Ex postmortem, Warren Spector says obstacles should have several solutions tied to skills, augmentations, objects and weapons. Goals should be visible before the player reaches them, and real-world logic should let players predict outcomes. *No forced failure* came from his 1997 Rules of Role-Playing, which lead designer Harvey Smith extended. He admits the team often had to brute-force multiple paths, and that special-case scripting crept in. [Dev; Dec 6, 2000] — [Game Developer: Postmortem: Ion Storm's Deus Ex](https://www.gamedeveloper.com/design/postmortem-ion-storm-s-i-deus-ex-i-); revisited in [GDC 2017 Classic Game Postmortem](https://gdcvault.com/play/1024338/Classic-Game-Postmortem-Deus-Ex) (snippet).
  → Sightline: the validator's three-approach rule is problems-not-puzzles done procedurally. The approaches have to emerge from systems (the sightline graph, sabotage targets), because a generator cannot hand-place solutions the way Deus Ex's designers did.
- **Stealth levels need a deliberate mix of friendly and hostile elements, balanced by playtest.** Randy Smith's GDC 2006 talk warns that poorly built stealth levels frustrate players, worst when stealth is a secondary feature. A 2011 summary describes his method: rate each element as stealth-friendly or stealth-hostile, populate rooms with a mix, then balance after playtests. The "valence" label is the blogger's, not Smith's. [Dev talk + Analysis; 2006 and 2011] (snippet) — [GDC Vault: Level Building for Stealth Gameplay](https://gdcvault.com/play/1013435/Level-Building-for-Stealth); [Robert Yang, Radiator blog](https://www.blog.radiator.debacle.us/2011/07/dark-past-part-4-useful-post-or-randy.html?m=1).
  → Sightline: Analysis (generation step 6) can score each camp's friendly/hostile balance: shadow, cover and noise masking against exposure. That score can sit beside cluster count as a difficulty knob.
- **A sandbox is systems interacting, and timing is part of every solution.** IOI calls Hitman an organic, system-driven sandbox. Designers let mechanics interact and welcome the unexpected results. Players are invited to use or misuse systems, and an interaction's outcome depends on when and how the player approaches it. [Dev; Feb 1, 2022] — [IOI Craft Talks: Game Design](https://ioi.dk/careers/craft/craft-talks-game-design).
  → Sightline: guard routines are pure functions of time, so "when" is already part of every plan. Surface it as windows on the tactical map.
- **The player authors the story, and the protagonist does not judge.** Jacob Mikkelsen, IOI's principal level designer, says Hitman is about the stories players create, and that 47 is an empty vessel with no opinion on what the player does. [Dev; Nov 30, 2025] — [Inverse](https://www.inverse.com/gaming/hitman-turns-25-retrospective-interview).
  → Sightline: keep the grades (Ghost, Clean, Loud) descriptive. Never moralize a valid method.
- **Treat the golden path as scaffolding, the player's own route as the point, and harvest what testers discover.** Dominik Abé, Mimimi's creative director, says Desperados III levels have a golden path with sub-paths, but the fun begins when players choose their own routes. The mechanics are too open for single-solution puzzles. Most badges came from the team's own playtest discoveries and exist to drive replays with new approaches. [Dev; July 16, 2020] — [Game Developer: Designing the real-time stealth and combat of Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-).
  → Sightline: mine bot runs and playtests for novel solutions per archetype. Promote them into optional side objectives and debrief callouts.
- **Plan-then-execute without turning into a planning game.** Desperados III's Showdown Mode pauses play so players can queue orders for every character. Mimimi limited each character to one main action per chain, to keep the game real-time and avoid becoming a planning game like Door Kickers. [Dev; July 16, 2020] — [Game Developer: Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-).
  → Sightline: Sightline's simultaneous takedown is the chained shot inside the reaction window, and it should stay a real-time skill. If a queued-shot assist is ever tried, cap it at one action.
- **Keep everything reachable, and let the clock, not locks, create the challenge.** Dennis Gustafsson found that a fully destructible world breaks restriction-based design. Teardown therefore keeps the whole map accessible, and the challenge becomes finding efficient shortcuts against the clock. Play splits into a relaxed planning and preparation phase and an action-heavy execution phase. [Dev; July 21, 2021] — [Game Developer: Teardown](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-). He reportedly designs heists without a specific path in mind [Dev, reported] (snippet) — [PC Gamer](https://pcgamer.com/teardown-is-a-heist-sandbox-where-you-can-smash-everything-to-pieces). In the shipped campaign, picking up the first target trips the alarm and gives the player 60 seconds to finish; preparation is untimed [Shipped; community docs] (snippet) — [Teardown docs: Heist basics](https://get-teardown.readthedocs.io/en/latest/gameplay/heist-basics.html).
  → Sightline: use the same two-phase shape. Recon and prep are untimed, and the clock starts when the player commits, through the first kill and the missed radio check-in. Make that trigger explicit and the player's choice.
- **Build loops, not dead ends, and validate with the guards in place.** Zi Peters designed Hitman 2's Colombia level. He says realistic floor plans produce dead ends that hurt stealth, so he favours loops and extra open areas that always leave an escape or a hiding place. Paper flow diagrams are cheaper than rebuilding, and problems often appear only once targets and their patrol loops are placed. Steve Lee (Dishonored 2) designs many ways into every room and objective. He notes that non-lethal solutions are harder to build, yet many players choose them. [Dev; May 22, 2020] — [Game Developer: From pen-and-paper to blockouts](https://gamedeveloper.com/design/from-pen-and-paper-to-blockouts-how-level-designers-craft-iconic-stealthy-encounters).
  → Sightline: add a no-dead-end rule: every infiltration route needs an escape loop. Run validation after staffing and routes exist, not on geometry alone.
- **In sniper sandboxes, the order of operations belongs to the player.** Rebellion's Tim Jones calls tactical choice core to Sniper Elite III: wherever possible, the approach and the order of objectives are left to the player [Dev; Mar 4, 2014] — [Analog Addiction](https://analogaddiction.org/2014/03/04/sniper-elite-iii-interview-new-details-inside). Senior producer Jean-Baptiste Bolcato summed up the studio's goal as choice everywhere, with emergent play when encounters and AI are set up right [Dev; Feb 6, 2014] — [Strategy Informer via GameWatcher](https://gamewatcher.com/interviews/sniper-elite-3-interview/11217). For Sniper Elite 4, Jones described the levels as giant sandboxes [Dev; July 7, 2016] — [Player.One](https://player.one/sniper-elite-4-dev-outlines-many-ways-se4-will-improve-upon-its-predecessor-544309).
  → Sightline: Sightline goes further than open ordering, because who can see whom constrains the order. That constraint is the puzzle.
- **Don't let execution friction veto a valid plan.** One of Nels Anderson's Mark of the Ninja rules is a narrow gulf of execution: when stealth is the challenge, don't punish a lack of twitch skill. The game's focus aiming stops time and has unlimited uses. An earlier version that metered it with a resource undercut the design. [Dev; Dec 3, 2012] — [Game Developer: Mark of the Ninja's five stealth design rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules).
  → Sightline: Lab B wants a 300 m shot to feel earned, so some execution skill is the point. Keep the sway and wind assists so that a correct plan rarely dies to dexterity alone.
- **Watch for one dominant approach.** Clint Hocking finds the mix of rules, freeform play and narrative that Far Cry 2's unpredictable play produced deeply expressive. Critic Ben Abraham, though, relied on long-range rifles and explosives to cope with the early difficulty, and was bored until Act 2. [Dev + Analysis; Oct 20, 2023] — [The Ringer](https://theringer.com/video-games/2023/10/20/23924419/far-cry-2-15th-anniversary-clint-hocking-ubisoft-open-world-fps).
  → Sightline: long-range sniping is Sightline's likeliest degenerate strategy. The no-single-perch-win rule and the counter-sniper sweeps are the guards. Test that a player who only snipes from maximum range ends up Loud, not Ghost.

### Inferences
- Sightline's generator can do what Deus Ex could not: certify its approaches automatically. The real risk is approaches that exist on paper (the validator counts three) but feel identical in play. Lab D's reviewer test (a clearly different best plan in each of 10 camps) is the right guard. It should include approaches the bots discover.
- Teardown's two phases and Sightline's radio check-ins point to a crisp structure. Recon carries no pressure until the player commits. Commitment starts a camp-side clock that the player can speed up or slow down, for example by sabotaging the radio. That keeps observation the main verb without making waiting free forever (Invisible Inc.'s point, section 2).
- An open sniper sandbox is uniquely exposed to range dominance (Far Cry 2, Sniper Elite 3). Guard against it at three layers: generation (no single-perch win), AI (counter-sniper sweeps, pressure to relocate that comes from guards' beliefs) and scoring (Ghost requires splitting clusters).

### Gaps
- The search budget ran out before I could cover Prey (2017) and Ricardo Bare, Harvey Smith's GDC talks on emergent and systemic design (2003–2004), Clint Hocking's GDC talks, Hunt: Showdown, and Mimimi's GDC 2018 Shadow Tactics talk.
- For Chaos Theory's level-design rationale, PC Gamer's making-of returned only its title and GamesRadar's interview with the game's director returned only its headline.
- I found no 2026 developer talks on systemic stealth within budget.

## 2. How do games make "being seen starts a problem, not a game over" work, and what went wrong when they didn't?

### Takeaway
Games that moved away from instant failure replaced it in two ways. First, with a legible, mostly one-way pressure track whose next step is announced and whose cost is lost options rather than a restart: Invisible Inc.'s security level, Chaos Theory's fourth alarm stage, Hitman's proportional searches. Second, with explicit de-escalation through the enemy's beliefs, such as Sniper Elite III's ghost marker. The documented failures are:
- escalation that is opaque or random (Invisible Inc.'s first alarm);
- clocks that feel imposed (XCOM 2);
- respawns that undo the player's work (Far Cry 2);
- consequence meters read as moral judgment (Dishonored);
- relocation rules that become a chore (Sniper Elite 3);
- players restarting anyway once a level goes loud (Hitman telemetry).

### Cited Findings
- **A pressure track works when it is coarse, announced and systemic.** James Lantz, a technical designer at Klei, describes Invisible Inc.'s alarm:
  - **How it works:** it runs from 0 to 6, rises every turn, and rises faster for kills and for bodies guards find.
  - **Inspiration:** X-COM's bomb missions, FTL's pursuing rebel fleet and Spelunky's ghost. It is framed as the spy's version of a roguelike's hunger clock.
  - **First version:** 20 to 30 levels with escalating effects at intervals. It was hard to read, and its consequences felt random.
  - **Fix:** 6 levels of 5 silent sub-steps each, a predictable systemic effect per level (level 2 raises every firewall by one, level 3 adds a patrol), and tooltips that warn of the next level.
  - **Remaining problem:** many players still felt it was unfair, expecting what other stealth games do. In-world fiction, extra UI, tutorials and renaming ALARM to SECURITY LEVEL helped.
  - **Side benefit:** because pressure accumulated, each level could start less difficult.

  [Dev; June 1, 2015] — [Game Developer: Alarm systems in Klei's Invisible Inc.](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-).
  → Sightline: give each camp alert level announced, systemic consequences, and let the honest view hint at the next step through fiction (radio chatter, lights coming on). Escalation should never feel random.
- **Replace the soft search state with difficulty that scales with time, and keep true failure for catastrophe.** An outside analysis makes three points about Invisible Inc.:
  - its one-way security level replaces the usual hidden, searching, caught gradient, and small mistakes speed it up;
  - difficulty scales with time spent in the level, and a shout alerts only guards in the same room;
  - only losing the whole team ends the campaign.

  [Analysis; Feb 5, 2019] — [Game Developer: The Problems of Modern Stealth Design, and How Invisible Inc. Solves Them](https://www.gamedeveloper.com/design/lesson-the-problems-of-modern-stealth-design-and-how-invisible-inc-solves-them).
  → Sightline: beliefs that spread by voice nearby and by radio with a delay match this. Keep the player's death rare, and make Lockdown the usual way a good plan loses.
- **Chaos Theory removed alarm-limit failure.** In the first two Splinter Cell games, too many alarms ended the mission. Chaos Theory dropped that rule. Reaching its fourth alarm stage instead cancels non-primary objectives and makes the mission harder, with a few scripted exceptions. [Shipped; secondary sources] (snippet) — [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Chaos_Theory); [Splinter Cell Wiki: Alarm](https://splintercell.fandom.com/wiki/Alarm) (fan wiki).
  → Sightline: a direct precedent for an alarm that costs the objective rather than your life. The top stage removes options (the target evacuates, side objectives are lost) instead of ending the run.
- **Give the player a beat to react when spotted from an angle they couldn't control.** Kojima Productions staff explained Reflex Mode on the studio's official podcast. In earlier Metal Gear games each area was hand-built, so designers knew where enemies stood and which way the player would face; an open world lets enemies spot the player from any angle, often with no cover. Reflex Mode slows time for a moment so the player can stop an alert. It can be switched off, earns a bonus when unused, and hard mode without Reflex Mode or marking is a significant challenge. [Dev, secondary report; Nov 18, 2013] — [Metal Gear Informer](https://www.metalgearinformer.com/metal-gear-solid-v-will-reward-you-for-not-using-reflex-mode/); [Metal Gear Informer: normal vs. hard](https://www.metalgearinformer.com/kojima-productions-on-metal-gear-solid-v-theres-a-significant-difference-between-normal-and-hard/) (snippet).
  → Sightline: the 1.5 s reaction window is a diegetic, symmetric Reflex Mode, a beat in which the chained second shot can stop the alarm. A 1 km² valley has MGSV's any-angle problem, so the screen-edge detection indicators are non-negotiable.
- **Failure should start improvisation, and forgiveness should be tuned by test.** Tore Blystad, director of Hitman: Absolution:
  - **Goal:** the player pushes the game and the game pushes back, so a failure leads to improvisation rather than instant death and a restart.
  - **The realism trap:** AI that remembers the player forever isn't fun, so the team built in forgiveness.
  - **Tuning by test:** user tests set the timers; testers preferred a 20-second stand-down to a 50-second one.
  - **Proportional escalation:** trespassing earns a polite warning, a kill a longer and harsher search.

  [Dev + Data; Nov 2, 2012] — [Game Developer: The Tightrope Walk: Hitman Absolution, Freedom and Realism](https://www.gamedeveloper.com/design/the-tightrope-walk-i-hitman-absolution-i-freedom-and-realism).
  → Sightline: in Lab E, tune search durations and suspicion decay by test, starting short. Keep responses proportional to the stimulus; the design doc's rising response to repeated rocks already does this.
- **Players restart anyway when it goes loud.** Inverse, citing IOI's own metrics, reports that most players restart a level once it turns into a large shootout. [Data, reported; Nov 30, 2025] — [Inverse](https://www.inverse.com/gaming/hitman-turns-25-retrospective-interview).
  → Sightline: track abandon-after-alarm as a health metric for pillar 2. Loud has to stay winnable and interesting (an interceptable escape, several exfil routes), or players will treat the alarm as a restart button.
- **Cheap retries make patience bearable.** Anderson says sparse checkpoints turn patient stealth into tedium. Mark of the Ninja therefore checkpoints between nearly every meaningful encounter, and near-instant load times matter more than almost anything to how failure feels. Being spotted isn't automatically a failure: a guard who glimpses the player at the edge of his vision comes to look, without going to full alert. [Dev; Dec 3, 2012] — [Game Developer: Mark of the Ninja's five stealth design rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules).
  → Sightline: with no mid-mission saves, the retry loop is the whole mission. Make retrying a seed near-instant and keep the player's map pins and notes, so a 20-minute loss doesn't also cost 20 minutes of re-scouting. That also makes knowledge the progression.
- **Quicksaving as failure recovery has a price: everything must be reproducible.** Abé says frequent saving lowers the cost of failure and encourages experiment, but it makes randomness mostly pointless and forces every moment to be consistent, with no hidden tricks. Because players learn the rules through repeated attempts, the core rules can be less forgiving. The only randomness left is in how enemies search during alarms and investigations. [Dev; July 16, 2020] — [Game Developer: Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-).
  → Sightline: determinism gives the same reproducibility at the level of a seed. Because Sightline has no reload inside a mission, its rules must be more forgiving than Mimimi's binary ones: meters, decay and recoverable states.
- **A clock that feels imposed draws backlash.** Jake Solomon says XCOM 2's mission timers were meant to stop players from playing every mission the same cautious way. The team didn't expect such a strong reaction, and he says they should have offered an option to turn the timers off. [Dev; Mar 16, 2017] — [Player.One](https://www.player.one/whats-next-xcom-jake-solomon-talks-xcom-5-dlcs-and-mission-timers-589331).
  → Sightline: radio check-ins are a diegetic clock that the player starts and can sabotage, which should avoid the arbitrary-timer complaint. Don't add a global mission timer.
- **Don't undo the player's work.** Days after Far Cry 2 shipped, Hocking pointed to a blogger's list of its flaws, including that enemy respawning was a pain and the buddies absurd, and put them down to a lack of iteration and polish time. [Dev; Oct 26, 2008] — [Click Nothing: Tough Love](https://clicknothing.com/2008/10/26/tough-love). A critic contrasts Far Cry 2's ever-respawning guard posts with Far Cry 5's outposts, which can be taken and kept. [Analysis] (snippet) — [Kotaku](https://kotaku.com/the-far-cry-series-needs-to-let-things-break-again-1825110327).
  → Sightline: guards the player removes stay removed for the whole mission. Reinforcements arrive visibly, by truck, because an alarm caused them, never by respawning.
- **A consequence system read as moral judgment feels like punishment.** Harvey Smith says Dishonored was built so that heavy, cruel play has consequences: rewarding a killing spree would contradict the world. The team had to fight to keep the high-chaos ending's betrayal by the boatman, and players are not used to games being mean to them. [Dev; Aug 28, 2015, via Kotaku] — [MCV](https://mcvuk.com/business-news/why-dishonored-allows-players-to-kill-but-doesnt-want-them-to). For Dishonored 2, Arkane reportedly reworked chaos to count who was killed, after seeing players choose victims by what the Heart told them about their lives [Dev, reported; 2016] (snippet) — [Rolling Stone (Glixel)](https://www.rollingstone.com/culture/culture-news/why-making-dishonored-2-was-so-hard-121280/). One critic argues that players who wanted to play with the toybox felt punished by the system [Analysis] (snippet) — [Unwinnable](https://unwinnable.com/?p=85284).
  → Sightline: doctrine is safe because it is tactical, announced and counterable. It must never read as a verdict on how the player plays ("you killed too much").
- **Relocation should come from the enemy's beliefs, not a UI rule, and masking needs density.**
  - **Sniper Elite III, by design:** Jones says that in V2 being spotted ended stealthy play. In III, cover and shadow let the player de-escalate: a ghost image shows where the AI thinks the player is, and the player must get far enough away to lose them [Dev; Mar 4, 2014] — [Analog Addiction](https://analogaddiction.org/2014/03/04/sniper-elite-iii-interview-new-details-inside). Bolcato framed relocation as de-escalation: take a few shots, duck out of sight, come back [Dev; Feb 6, 2014] — [GameWatcher](https://gamewatcher.com/interviews/sniper-elite-3-interview/11217).
  - **Sniper Elite III, in a review:** the relocation prompt's 30 m move turned sniping into a cycle of shoot, relocate and set up again, and chances to mask a shot were sparse [Analysis; July 11, 2014] — [Engadget](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html).
  - **Sniper Elite 4:** Jones said the previous game had been encouraging relocation after each shot. The new approach is more organic, depending on distance and how alert the enemies are, and enemies may investigate or flank [Dev; July 7, 2016] — [Player.One](https://player.one/sniper-elite-4-dev-outlines-many-ways-se4-will-improve-upon-its-predecessor-544309).

  → Sightline: drive the counter-sniper response from each guard's beliefs (an estimated shot direction with an uncertainty radius), never from a fixed relocation radius. Have the validator require masking sources near scored perches.
- **Critics name instant failure as the genre's real problem.** One critic argues the trouble with stealth isn't stealth itself but games in which being spotted means total, automatic failure. [Analysis] (snippet) — [GamesRadar](https://gamesradar.com/how-developers-can-fix-stealth-mechanics).
  → Sightline: supports the anti-goal of no instant-fail stealth.

### Inferences
- The successes share an architecture with five parts:
  1. an individual detection ramp with telegraphs;
  2. a camp-level pressure track that is coarse, one-way or slow to decay, with its next step announced;
  3. costs paid in options (objectives, side goals, equipment, time);
  4. explicit de-escalation through the enemy's beliefs;
  5. a true failure that is rare.

  Sightline's design doc already has all five. The research points to two weak spots: whether players can read the camp alert level and its next step in the honest view, and whether Loud is engaging enough that they don't restart.
- Memory that never fades is a trap within a mission (Absolution) but is wanted across an operation (doctrine). The difference is visibility and counterplay.
- When the player can choose to escalate, going loud late becomes a plan, not a failure. Teardown's alarm after the first target is the model: take the target, then make exfil inside the reinforcement delay. That makes Loud a legitimate grade for a deliberate plan.

### Gaps
- I did not find IOI's own account of Hitman's compromised-disguise and search states (2016–2021).
- Chaos Theory's in-game escalation details (for example, whether guards add armour at each alarm stage) are unverified.
- I did not find Hocking explaining Far Cry 2's buddy rescue as an alternative to death and reload. The Ringer piece only says buddies were in the 2006 demo.
- Kojima Productions' rationale for MGSV's alert and evasion phases was not sourced.
- Splinter Cell: Conviction's last-known-position silhouette was not searched. Sniper Elite III's ghost marker is the sourced stand-in.

## 3. How do designers make systemic AI readable, fair and adaptive, neither too dumb nor omniscient?

### Takeaway
Perceived intelligence is mostly a communication problem. The developers of Halo, Thief and F.E.A.R. all found that reasoning the AI doesn't broadcast reads as stupidity or bugs. They fixed it with barks, posture and focus of attention rather than smarter planners. Fairness comes from honest perception, with no cheating and limits the player can learn. Omniscience is felt when the AI's knowledge can't be traced: cheating, instant camp-wide alerts, memory that never fades. Adaptation works when it is visible and counterable, as MGSV's countermeasure icons are. Players read learning even into scripted behaviour unlocks, as Alien: Isolation's xenomorph shows. For a sniper game, Halo's finding that sniping made its AI look oblivious is the top warning.

### Cited Findings
- **Make the AI intelligible, interactive and unpredictable, by communicating rather than hiding.** Bungie's GDC 2002 Halo talk:
  - **Design goals:** intelligible, interactive, unpredictable.
  - **Knowledge:** each actor has real perception with no cheating (vision, hearing, touch, plus a channel the slides label ESP), selective memory and persistent state, and can be fooled.
  - **Discarded:** hidden states, in favour of showing intent through language, posture, gesture and focus of attention; also randomness and a fuzzy emotion system, in favour of cause-and-effect stimuli and analog variation in position and timing.
  - **Combat dialogue:** 57 events, 166 dialogue types and 5,147 recorded lines.
  - **Things to avoid:** subtlety, looking broken, insufficient challenge.

  [Dev; GDC 2002] — [The Illusion of Intelligence, slides (mirror)](https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf).
  → Sightline: the awareness table already follows this. Unpredictability should come from reacting to the player and to timing, not from dice, which also suits determinism.
- **Tougher enemies read as smarter.** Bungie's playtests compared weak and tough enemies. With weak enemies, 36% of testers called the fights too easy, about 8% rated the AI very intelligent and 20% rated it not intelligent. With tough enemies, none called it too easy, 43% rated the AI very intelligent and none rated it not intelligent. I reconstructed which number belongs to which answer from the extracted slide text. The slides conclude that smarter means tougher, and tougher means smarter. [Data; 2002] — [Slides](https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf); [fan-hosted talk transcript, page 19](https://www.halo.bungie.org/misc/gdc.2002.haloai/talk.html?page=19).
  → Sightline: difficulty will confound the readability tests in Labs A and E, because testers judge easy camps as dumb. Run blind tests at target difficulty.
- **Subtle behaviour goes unseen, deliberate delays read as bugs, and sniping makes the AI look oblivious.** Findings from the Halo talk transcript:
  - In an early playtest, more than half the testers asked to stop and go home.
  - Fewer than a third connected Grunts fleeing to the death of their Elite, even after the team made it very obvious.
  - Testers took a deliberate pause before enemies recognized the player as a bug, so the team removed that perception delay for every character.
  - Sniping made the AI look oblivious and heavy melee made it look robotic, so engagement ranges were tuned.

  The talk's rule: "If it isn't totally obvious, it's too subtle." [Data + Dev; 2002] — [fan-hosted transcript, page 19](https://www.halo.bungie.org/misc/gdc.2002.haloai/talk.html?page=19).
  → Sightline: this is the biggest single risk for a sniper game. A guard shot at or startled from 300 m must react visibly (dive, point, radio), and the time the detection meter takes to fill must be telegraphed, or testers will read the guards as dumb.
- **Go beyond oblivious and omniscient: voice a range of awareness, never cheat, and treat sound as a two-way channel.** From Tom Leonard's Thief postmortem:
  - **Awareness:** the AI used a broader range than the usual oblivious-or-omniscient pair, communicated its state mostly through speech, and decided only from what it could perceive.
  - **Expressiveness:** non-human creatures were less expressive, which he links to players disliking the monster levels.
  - **Sound:** AIs told the player their location and state through sound and alerted each other with it, and the player's own noise could give him away or distract a guard. A secondary room database simplified level connectivity so sound could propagate in real time.

  [Dev; July 9, 1999] — [Game Developer: Postmortem: Thief: The Dark Project](https://www.gamedeveloper.com/design/postmortem-i-thief-the-dark-project-i-).
  → Sightline: wireframe capsules can't emote much, so barks and posture carry readability. Give every role and awareness state a distinct audio signature, and propagate sound along paths as Thief did.
- **Coordination the player can't see doesn't count, so let the barks explain it.** From Jeff Orkin's F.E.A.R. paper:
  - **Barks show intent:** the squad layer used dialogue to show players that coordination was intentional.
  - **Voice can stand in for a system:** a lone survivor calls for reinforcements, but no reinforcement mechanic exists, and players take the next enemies they meet as the reinforcements.
  - **Exchanges beat announcements:** one soldier asks another for his status, and the other answers that he's hit.
  - **Dialogue explains inaction:** a soldier who doesn't reposition says he has nowhere to go.
  - **Emergence:** apparent flanking and pincer moves came from simple cover-seeking around level geometry.

  [Dev; GDC 2006] — [Three States and a Plan: The AI of F.E.A.R. (paper)](https://pages.cs.wisc.edu/~dyer/cs540/handouts/gdc2006_orkin_jeff_fear.pdf).
  → Sightline: use paired radio exchanges for check-ins and searches, but keep them truthful. F.E.A.R.'s phantom reinforcement call would break the fairness rule that guards act only on what they sensed or were told.
- **Make the stealth system and the AI transparent.** Anderson's first two rules:
  - **Stealth system:** light and dark are binary, with no visibility meter, and vision limits and sound ranges are shown before the player acts.
  - **AI:** guards have three awareness levels, and every change is signalled, so players see at once what set it off.

  [Dev; Dec 3, 2012] — [Game Developer: five stealth design rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules). The related talk: [GDC 2013: Of Choice and Breaking New Ground](https://gdcvault.com/play/1017791/Of-Choice-and-Breaking-New) (snippet).
  → Sightline: Lab C's exit test (players predict their own noise and visibility) is Anderson's transparent stealth. The honest view must show the player's own noise and light band without guesswork.
- **Favour information over realism, so players can see why a plan failed.** Abé says a core pillar was giving players as much information as possible so they understand why a plan failed, even at the expense of realism.
  - **What players see:** vision cones, including the striped zones where a crouching player stays hidden.
  - **Where the challenge lies:** reading and countering predictable routines.
  - **Cost:** binary rules made balancing harder.
  - **Feedback added for Desperados III:** reinforcement spawn displays, off-screen guard markers and better aiming lines.

  [Dev; July 16, 2020] — [Game Developer: Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-).
  → Sightline: a first-person honest view can't draw cones, so the debrief replay carries the job of showing why it failed. The debrief's Done-when (find the cause in under a minute) is Abé's pillar.
- **A creature that seems to learn, with bounded superhuman senses.** Game Informer's 2025 retrospective of Alien: Isolation:
  - **Apparent learning:** the xenomorph ran on a behaviour tree of about 100 nodes whose searching and attacking sub-trees unlock as the player progresses. The impression that it learns comes from players, not developers.
  - **Senses and memory:** it can tell whether it has seen the player before, and a short-range sensor stops players sneaking up behind it.
  - **Debugging:** developers once had it announce its plans aloud.
  - **Sound:** the sound team built a readable vocal language for its intent, which took nearly the whole development cycle, and the music and mix follow stealth and threat.

  [Dev + journalist; June 24, 2025] — [Game Informer](https://gameinformer.com/retrospective/2025/06/24/how-creative-assembly-built-its-perfectly-evolved-ai-xenomorph). Analyses also describe a director that manages a menace gauge and periodically nudges the alien toward the player [Analysis] (snippet) — [Game Developer (Tommy Thompson): The Perfect Organism](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation); [TheGamer](https://www.thegamer.com/alien-isolations-ai-trivia/).
  → Sightline: the pacing layer, which caps how many guards converge, is the menace-gauge analog. Under fairness rule 1 it may only throttle guards, never steer them toward where the player really is.
- **Perception has four channels.** Martin Walsh's GDC 2014 talk and the Game AI Pro 2 chapter (2015) describe how Splinter Cell: Blacklist modelled visual, auditory, environmental and social or contextual awareness. The goal was consistent feedback to the player while keeping realism, and the talk covers the problems the team ran into. [Dev; 2014 and 2015] (snippet) — [GDC Vault: Modeling AI Perception and Awareness](https://gdcvault.com/play/1020436/Modeling-AI-Perception-and-Awareness); [Game AI Pro 2, chapter 28](https://www.oreilly.com/library/view/game-ai-pro/9781482254792/K23980_C028.xhtml); [Game Developer video summary](https://gamedeveloper.com/programming/video-how-i-splinter-cell-blacklist-i-achieved-realistic-ai-behavior). Related: Ubisoft's Eric Martel on designer-configurable detection, drawing on the Assassin's Creed and Thief franchises [Dev] (snippet) — [GDC Vault: Can You See Me Now?](https://gdcvault.com/play/1026497/Can-You-See-Me-Now).
  → Sightline: environmental awareness (changed doors and lights, sabotaged gear) and social awareness (a missing partner, an unanswered check-in) are the design doc's "what gives you away" list. Walsh's chapter is the closest single reference for Lab A.
- **Telegraph intent and keep randomness low.** A third party's notes on Subset Games' GDC 2019 Into the Breach postmortem report that randomness was kept to a minimum, that this paired with enemies forecasting their attacks, and that it tied in with making as much information as possible available. [Dev via notes; 2019] (snippet) — [GDC Vault: Into the Breach Design Postmortem](https://gdcvault.com/play/1025772/-Into-the-Breach-Design); [session notes](https://stevelilleyschool.blogspot.com/2019/04/gdc-2019-talks-into-breach-and-dead.html).
  → Sightline: telegraph the camp's intent too. The radio operator's check-in schedule and the officer's search sectors can be observable intel.

#### Adaptation within a mission and across an operation
- **Countermeasures work when they are visible and counterable.** In MGSV, frequent headshots lead soldiers to wear helmets, and leaning on the same tactics brings more or better-equipped enemies. Kojima's Gamescom 2014 demo showed helmeted troops, and map icons show which countermeasures are active. [Shipped; secondary sources] (snippet) — [GameSided](https://gamesided.com/2014/08/13/gamescom-2014-phantom-pain-gameplay-details); [The Register review, Sep 7, 2015](https://www.theregister.com/2015/09/07/game_theory_metal_gear_solid_v_the_phantom_pain_review/?page=3); [Gamer Guides](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/dynamic-difficulty).
  → Sightline: the doctrine table is MGSV's model plus briefing intel and named counterplay. Adopt MGSV's always-visible indicator of active countermeasures on the map.
- **Patent risk around adaptive nemesis systems.** WB Games holds US Patent 10,926,179, in force since Feb 23, 2021 and maintainable to about 2035. It covers nemesis characters, nemesis forts, social vendettas and followers in computer games. [Legal] (snippet) — [Patent Arcade](https://www.patentarcade.com/2021/02/warner-brothers-granted-patent-for-nemesis-system-from-middle-earth-video-games.html); [NME](https://www.nme.com/news/warner-bros-successfully-patented-shadow-of-mordor-nemesis-system-2874386).
  → Sightline: faction-level doctrine differs from persistent named enemies. Before adding individuals who remember the player across missions (a recurring officer, say), have counsel check the claims. This is not legal advice.

### Inferences
- **Too dumb**, in this evidence, means reasoning the player can't see (Halo's retreats read as bugs, F.E.A.R.'s unexplained inaction), soft difficulty (Halo) or no reaction at range (Halo's sniping). **Too omniscient** means knowledge the player can't trace: cheating, instant camp-wide alerts (criticized in the Invisible Inc. analysis), memory that never fades (Absolution). Sightline's fairness rules handle omniscience well. The bigger practical risk is looking dumb at 300 m.
- Bounded superhuman senses are tolerable when the player can learn them: Alien's rear sensor, Sightline's marksmen with their 400 m binocular cone. Make them part of the readable vocabulary: the marksman's silhouette, scope glint, a distinct bark.
- For adaptation, show the cause and the counter, as MGSV's icons and Sightline's planned "What the enemy learned" debrief do. Players will credit scripted unlocks as learning (Alien), so perceived adaptation is cheap. The doctrine Done-when requires that players understand why, though, so announce it.

### Gaps
- I did not retrieve the content of Walsh's Blacklist talk or chapter, Anderson's GDC 2013 talk, Eric Martel's GDC talk, or Tom Leonard's GDC paper on Thief's sensory system ("Building an AI Sensory System"). Only listings and summaries were found.
- A rule attributed to the Halo talk (an AI may have abilities the player lacks if they are recognizable and their limits predictable) appeared in search summaries, but I did not verify it on the page.
- Alien: Isolation's director and unlock claims rest on journalism and analysis rather than a developer talk.
- No Kojima Productions statement on the reasons for MGSV's adaptation system was found.

## 4. How do games make observation and recon rewarding rather than busywork, and does marking trivialize stealth?

### Takeaway
Recon pays off when watching changes the player's options rather than just revealing positions, as with Desperados III's overheard conversations, Hitman's opportunities and Sniper Elite's masking sources. It also needs routines deterministic enough to plan on, and information the player must gather and that stays imperfect. Marking itself is not the problem; unlimited, live, through-wall marking is, because it removes the uncertainty that observation exists to resolve. Shipped mitigations include caps on tags, visibility only under a condition, marking made optional and tied to difficulty, and guidance treated as a dial.

### Cited Findings
- **Watching should reveal options, not just positions.** Abé says that in Desperados III, listening to NPC conversations can reveal new options, and reading and countering predictable routines is a major source of the challenge. Civil Zones rate every action as hostile, suspicious or neutral. [Dev; July 16, 2020] — [Game Developer: Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-).
  → Sightline: let recon reveal opportunities that emerge from routines, not just guard dots: a worker fuelling the escape vehicle, a generator that cycles, a post about to miss its check-in.
- **Authored guidance becomes a walkthrough if players simply follow it.** Following IOI's laid-out opportunities, called Mission Stories in later versions, can make missions rather easy [Analysis; Nov 17, 2025] (snippet) — [Gaming Bible](https://www.gamingbible.com/features/hitman-25th-anniversary-io-interactive-interview-403479-20251117). IOI has a track lead plan the mission stories and opportunities and where their intel and items sit [Dev, stream transcript] (snippet) — [Hitman Forum](https://www.hitmanforum.com/t/hitman-briefings-ioi-streams-next-one-tbd/22673?page=5). Blystad says some fans resent being told anything while others want their options laid out. Instinct highlights nearby points of interest without giving solutions, difficulty changes how much information players get, and players raised on scripted games have to be taught that the choices exist. [Dev; Nov 2, 2012] — [Game Developer: The Tightrope Walk](https://www.gamedeveloper.com/design/the-tightrope-walk-i-hitman-absolution-i-freedom-and-realism).
  → Sightline: generated camps have no authored stories, which is good. Make guidance a difficulty dial: routes and timings draw themselves on Standard; Hardline gets manual pins only.
- **Information should be gathered, and imperfect.** Game Maker's Toolkit (lesson two of its stealth design video) notes that Deus Ex limits how many tagged enemies you can track at once, and that The Last of Us shows enemies through walls only while they make noise. Its principle: information should be carefully gathered and imperfect, not handed to the player. [Analysis] — [GMTK transcript (dataset viewer)](https://huggingface.co/datasets/taesiri/GMTK-Transcripts/viewer/default/train?p=44).
  → Sightline: the design doc's tactical map already follows this: it shows only what the player has observed, with guards at their last seen spots. Resist live, through-wall tags.
- **Marking takes many forms in shipped games.**
  - **Sniper Elite III:** binoculars tag enemies so they show through walls, and highlight vehicle weak points [Dev; Mar 4, 2014] — [Analog Addiction](https://analogaddiction.org/2014/03/04/sniper-elite-iii-interview-new-details-inside).
  - **Ghost Recon: Future Soldier:** tags are capped at four [Shipped; review, May 30, 2012] (snippet) — [The Register](https://www.theregister.co.uk/2012/05/30/review_game_ghost_recon_future_soldier?page=2).
  - **Assassin's Creed IV:** a preview notes that tagging makes it much easier to keep track of enemies through walls [Analysis] (snippet) — [Kotaku](https://kotaku.com/theres-a-lot-to-like-in-this-assassins-creed-iv-steal-1124441700).
  - **MGSV:** marking is optional, and hard mode without it or Reflex Mode is a significant challenge [Dev, reported] (snippet) — [Metal Gear Informer](https://www.metalgearinformer.com/kojima-productions-on-metal-gear-solid-v-theres-a-significant-difference-between-normal-and-hard/).

  → Sightline: if testers ask for live marks, use a cap, make them depend on sound, or offer them as an assist that costs the Ghost grade.
- **Masking turns listening into recon, but only if opportunities are plentiful.** Jones says V2 let players time shots to loud noises. III extended this so players can sabotage generators to backfire and cover a timed shot [Dev; Mar 4, 2014] — [Analog Addiction](https://analogaddiction.org/2014/03/04/sniper-elite-iii-interview-new-details-inside). One reviewer found masking opportunities sparse in practice [Analysis; July 11, 2014] — [Engadget](https://www.engadget.com/2014-07-11-sniper-elite-3-review-war-and-pieces.html). Rebellion's lead audio designer reportedly says the team spends more time on environment audio than on anything else [Dev] (snippet) — [MCV](https://mcvuk.com/development-news/sniper-elite-4-boom-shot/).
  → Sightline: recon should teach the camp's masking rhythms (generator cycles, machinery, thunder), and the generator should place enough of them that a masked shot is a regular option, not a rarity.
- **Let players pay for prediction.** The Invisible Inc. analysis notes that players can spend resources to predict guard movement. [Analysis; Feb 5, 2019] — [Game Developer: The Problems of Modern Stealth Design](https://www.gamedeveloper.com/design/lesson-the-problems-of-modern-stealth-design-and-how-invisible-inc-solves-them).
  → Sightline: recon already has prices (time on the score, exposure, lens glint toward the sun). Keep them, so that watching longer is a real trade.
- **Compact spaces are easier to map in your head.** Anderson found open levels frustrating because people struggle to map 2D space mentally. He suggests an encounter space of about one screen plus a margin, as his own observation rather than science. [Dev; Dec 3, 2012] — [Game Developer: five stealth design rules](https://gamedeveloper.com/design/-i-mark-of-the-ninja-i-s-five-stealth-design-rules).
  → Sightline: a 150 × 150 m camp is compact, but viewing it from 300 m flattens depth. The topographic map with routes drawn in is what makes the camp mappable in the player's head, so treat it as a core recon tool, not a menu.

### Inferences
- In this evidence, observation is rewarding when five things hold:
  1. routines are deterministic, as Sightline's pure function of time already makes them;
  2. watching reveals windows the player can act on (patrol gaps, check-in times, masking cycles);
  3. information decays (last-seen markers);
  4. gathering it has a cost (time, glint, exposure);
  5. acting on it is time-critical (the reaction window).
- The marking debate comes down to scope. Sightline's last-seen markers keep the uncertainty. The bigger risk to recon is the routes that draw themselves on the tactical map. Consider drawing a route only after one full loop has been watched, and showing its timing only after two.
- Hitman shows that authored guidance turns into walkthroughs. Sightline can derive opportunities from its systems (a refuelling event, the generator's service schedule) and should present them as things the player observed, never as objectives handed out.

### Gaps
- I could not verify the observation mechanics of Hitman Freelancer's Showdown missions (deducing the leader among suspects by their tells); the co-directors' Q&A I read doesn't mention them.
- Not searched: Assassin's Creed Shadows' shift to observing on foot and scouts (a recent example in the tagging debate), Sniper Ghost Warrior Contracts, Hunt: Showdown's sound-as-information design, Deathloop's learning loops, and academic work (FDG, DiGRA) on information in stealth games.

## 5. What keeps one-sitting, self-contained missions fresh on replay?

### Takeaway
One-sitting missions stay fresh through four things. Mastery of a deterministic space. Generated variety built around a guaranteed solution. Pressure that scales with time, so starting layouts can stay modest. And stakes that make an attempt count. Developers warn about three things: guidance that turns into a walkthrough (Hitman), hardcore modes whose rewards don't match their pain (Freelancer), and long retries without checkpoints (Mark of the Ninja, section 2).

### Cited Findings
- **Generate the solution first, then the obstacles.** Spelunky lays out a guaranteed solution path through a 4 × 4 grid of rooms (entrance, exit, navigable rooms) before it places spikes, enemies and items. Rooms off the path carry no guarantee of exits. Room templates mix fixed and probabilistic tiles. [Analysis of the shipped game; 2013] (snippet) — [Darius Kazemi: Spelunky Generator Lessons](https://tinysubversions.com/spelunkyGen/); [Kotaku](https://kotaku.com/see-how-spelunky-levels-are-made-1479192650).
  → Sightline: generate the required approaches (perches, a low-exposure path, a sabotage target) and the interceptable escape first, then staff around them, instead of staffing first and repairing. This is likely the fastest route to Lab D's 90 of 100 on the first try.
- **Whether a stealth path exists can be computed in space and time.** Tremblay, Torres, Rikovitch and Verbrugge at McGill built a Unity tool that discretizes a level over time and uses rapidly-exploring random tree (RRT) search to find paths that stay out of moving guards' fields of view. Designers can then explore how layout, enemy numbers and movement, view cones and start and goal positions affect stealth. The paper cites Randy Smith's GDC 2006 idioms. [Academic; 2013] — [An Exploration Tool for Predicting Stealthy Behaviour (PDF)](https://www.cs.mcgill.ca/~jtremb59/Papers/An%20Exploration%20Tool%20for%20Predicting%20Stealthy%20Behaviour%20-%20Jonathan%20Tremblay.pdf).
  → Sightline: a published method for generation step 6. Certify the infiltration path with exposure under threshold against patrol timing, not against a static snapshot.
- **Let pressure scale with time so layouts can stay modest.** Lantz says Invisible Inc.'s alarm let the team keep each level less difficult, because the pressure came from decisions that accumulate rather than from the starting situation. [Dev; June 1, 2015] — [Game Developer: Alarm systems in Invisible Inc.](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-).
  → Sightline: the generator's variance matters less if most of the difficulty comes from the player's own footprint: the alert level drifting up, check-ins going unanswered.
- **Roguelike stakes and randomized content drive replay, but watch the reward curve.** Hitman Freelancer's co-directors aimed for high replayability:
  - a personal career built from everyday hitman work (money, gear, planning contracts);
  - roguelike elements to support high-risk, high-reward play;
  - content that can be randomized, plus built-in challenges that recognize unusual approaches.

  Jonas Breum Jensen conceded that Prestige Objectives are punishing by design, and that Hardcore mode's rewards may not match its difficulty. [Dev; Feb 20, 2023] — [Wccftech](https://wccftech.com/hitman-freelancer-qa-ioi-devs-talk-about-designing-the-game-mode-its-reception-upon-release-and-more/).
  → Sightline: Hardline (permadeath across an operation) needs rewards that match its pain, or players will ignore it.
- **Timed live targets feel like assignments, and watching players is the most honest feedback.** Hitman's creative director Christian Elverdam:
  - IOI kept releasing Elusive Targets and escalation contracts, and the notification of a new one makes players feel like an agent with an assignment.
  - The episodic release let the team watch players and tune: how Sapienza and Paris were received shaped Colorado and Hokkaido.
  - Nothing is more honest than watching people play your game.

  [Dev; Nov 19, 2016] — [TechCrunch](https://techcrunch.com/2016/11/19/hitman-creative-director-looks-back-at-hitmans-first-season-and-games-as-a-service/). A 2025 headline says that for IOI's designers, the hardest part of new Elusive Targets is keeping the target alive [Dev, headline only] — [GamesRadar](https://www.gamesradar.com/games/hitman/after-9-years-of-deadly-new-hitman-updates-the-hardest-part-about-designing-new-elusive-targets-like-james-bond-villain-le-chiffre-is-actually-keeping-the-target-alive).
  → Sightline: the daily contract's ranked first attempt plays the Elusive Target's role. The target's escape logic has to survive player cheese (blocking the vehicle, say) without scripting.
- **Replays need reasons to try another way.** Mimimi's badges, drawn from the team's own playtest discoveries, exist to make players replay with new approaches [Dev; July 16, 2020] — [Game Developer: Desperados III](https://gamedeveloper.com/design/designing-the-real-time-stealth-and-combat-of-i-desperados-iii-i-). XCOM 2's timers were meant to stop players playing every mission the same way [Dev; Mar 16, 2017] — [Player.One](https://www.player.one/whats-next-xcom-jake-solomon-talks-xcom-5-dlcs-and-mission-timers-589331).
  → Sightline: doctrine is Sightline's answer to playing the same way every time, and optional side objectives (no alarms, suppressed shots only) are its badge layer.
- **Player-made content extends a game's life.** Gustafsson didn't expect modding to matter as much as it did; mod support, added soon after release, extended Teardown's life. [Dev; July 21, 2021] — [Game Developer: Teardown](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-).
  → Sightline: shareable seeds are a start. A seed browser or contract editor would be a cheap lever on longevity later: a Horizon, not v1.

### Inferences
- With no saves inside a 15–25 minute mission, Sightline's replay value stands on three legs: deterministic seeds (mastery), doctrine (variety driven by the player's own habits) and the daily contract (a first attempt that counts). The evidence says the generator should place guaranteed solutions first (Spelunky), certify them in space and time (Tremblay et al.) and let pressure come from the player's footprint (Invisible Inc.).
- Keep the player's recon knowledge across retries (map pins and notes). Retries get quicker, and it honours the design doc's line that progression is skill and knowledge.
- The Elusive Target precedent says a seed shared by everyone gains stakes from a single ranked attempt. That is already in the design doc. The research adds that the target's own AI must be the most robust in the camp.

### Gaps
- Not retrieved: the design rationale for Spelunky's Daily Challenge (one attempt a day), IOI's primary sources on Hitman's mastery and challenge loop and on the one-attempt rule for Elusive Targets, and the procedural guard placement paper by Xu, Tremblay and Verbrugge.
- Invisible Inc.'s campaign and mission length was not sourced.
- Roguelite design writing (Hades, Slay the Spire, Into the Breach's map generation) was not covered.

## 6. What did studios learn by proving their core loop in primitive form first?

### Takeaway
The postmortems keep naming the AI and sensory core as the system that must work before content. Thief rewrote four-fifths of its AI three to five months too late, and Deus Ex never prototyped its AI and designed it in a vacuum. Teams that proved a core in primitive form first found their game:
- Teardown, with a technology prototype;
- Invisible Inc., with a plain overhead prototype;
- Deus Ex, with proto-missions;
- OpenAI, with a world of boxes and ramps.

The other lessons: playtest early and watch, expect exploits, and remember that the camera, feel and audio language take the longest.

### Cited Findings
- **Build the AI core before the content.** Leonard's Thief postmortem:
  - Thief began as a sword-combat game (Dark Camelot) and was refocused on stealth in early 1997.
  - Its core systems didn't come together until mid-summer 1998, about three months before the planned ship date.
  - The original AI suited combat, so four-fifths of it was rewritten from mid-March 1998. He estimates an earlier rewrite would have saved three to five months.
  - Staffing up before the design and technology matured produced content that didn't serve the game, so next time he would delay the content teams.

  [Dev; July 9, 1999] — [Game Developer: Postmortem: Thief: The Dark Project](https://www.gamedeveloper.com/design/postmortem-i-thief-the-dark-project-i-).
  → Sightline: Labs A and E carry Thief's AI risk. Don't widen content (archetypes, biomes) until they pass their exit tests.
- **Proto-missions expose weak systems, and AI that isn't prototyped gets designed in a vacuum.** Spector's Deus Ex postmortem:
  - **What worked:** playable proto-missions exposed weak systems early, and Gabe Newell's feedback led to reworking the skill and augmentation systems. Cutting the 500-page design document to 270 pages after a milestone showed what worked.
  - **What didn't:** the AI wasn't prototyped early, so it was designed in a vacuum and kept changing until late. Relying on the engine's shooter-oriented AI, pathfinding and sound caused problems.
  - **His open question:** whether getting every mission to bare-bones playable, rather than polishing a few, was the right call.

  [Dev; Dec 6, 2000] — [Game Developer: Postmortem: Ion Storm's Deus Ex](https://www.gamedeveloper.com/design/postmortem-ion-storm-s-i-deus-ex-i-).
  → Sightline: the labs are proto-missions, and Phase 2's single core mission answers Spector's question on the side of polishing a few.
- **Playtest early, and watch.** Bungie calls playtesting the most objective way to find AI problems: playtest more, earlier, and have designers watch [Dev; 2002] — [fan-hosted transcript, page 19](https://www.halo.bungie.org/misc/gdc.2002.haloai/talk.html?page=19). Elverdam says nothing is more honest than watching people play [Dev; Nov 19, 2016] — [TechCrunch](https://techcrunch.com/2016/11/19/hitman-creative-director-looks-back-at-hitmans-first-season-and-games-as-a-service/).
  → Sightline: the `playtests/` folder and replays make this cheap. Schedule blind tests in the honest view for each lab from week one.
- **Technology first can work, but freedom without structure isn't a game.** Gustafsson built the destructible voxel world first and then looked for a game. About six months of prototypes with Emil Bengtsson failed, largely because players had too much freedom. About six more months working alone produced the heist design, with the setting fitted to the technology afterwards. [Dev; July 21, 2021] — [Game Developer: Teardown](https://gamedeveloper.com/design/combining-bombastic-heists-with-a-fully-destructible-voxel-world-in-i-teardown-i-).
  → Sightline: wireframe sandboxes risk the same aimlessness. Bring the objective and the cost of the alarm into the labs early; Lab E's test of interrupting an alarm does this.
- **Abstract prototypes are legible prototypes.** Game Informer described Invisible Inc.'s 2013 prototype, then called Incognita, as visually very simple: an overhead view of objectives and guard zones. [Journalist; July 26, 2013] (snippet) — [Game Informer](https://gameinformer.com/games/invisible_inc/b/pc/archive/2013/07/26/incognita-comes-out-of-hiding-in-kleis-livestream).
  → Sightline: precedent for prototyping with stealth systems drawn as abstract zones, which is Sightline's debug view.
- **Primitive worlds can produce rich behaviour, and exploits.** In OpenAI's hide-and-seek, a physics world of boxes, ramps and walls and a simple objective produced six distinct phases of emergent strategy, including tool use. Agents also found unintended physics exploits such as box surfing. [Academic; Sept 2019, ICLR 2020] (snippet) — [Baker et al., arXiv 1909.07528](https://arxiv.org/abs/1909.07528); [TechCrunch](https://techcrunch.com/2019/09/17/clever-hide-and-seek-ais-learn-to-use-tools-and-break-the-rules).
  → Sightline: the bar is right, and the fuzzing bots and motor invariants are the right defence. Players, like agents, will find any physics seam.
- **Art and feel are separable, and the camera and audio language take longest.** Creative Assembly's first Alien: Isolation prototype was a mood video, made in an engine built for Viking-era outdoor scenes. The game began in third person because that was the only way to get it greenlit, until a developer hacked in a first-person camera and the team saw a major improvement. The team iterated on every level in the final year to get the rise and fall of tension right, and the alien's readable vocal language took nearly the whole cycle. [Dev; June 24, 2025] — [Game Informer](https://gameinformer.com/retrospective/2025/06/24/how-creative-assembly-built-its-perfectly-evolved-ai-xenomorph).
  → Sightline: this backs the design doc's rule that feel (camera motion, sound timing) is in scope in the wireframe phases. Start the bark vocabulary in Phase 1, not with the Sound track.
- **Block out early with real metrics; skip it and the design happens late.**
  - **Steve Lee:** blockouts are rough but representative, built fast, tested and iterated, with the riskiest elements first.
  - **Zi Peters:** he starts from blockouts that respect character metrics (height, crouch height, reach) and from paper flow diagrams.
  - **Vincent Barrieres:** Assassin's Creed Syndicate's workflow allowed no greyblock prototyping, so level designers adjusted traversal, enemy placement and mission flow late, alongside the artists.

  [Dev; May 22, 2020] — [Game Developer: From pen-and-paper to blockouts](https://gamedeveloper.com/design/from-pen-and-paper-to-blockouts-how-level-designers-craft-iconic-stealthy-encounters).
  → Sightline: the wireframe rule that scale is real is Peters' metrics rule. Every generator module should carry true cover heights and sightline metrics.
- **Long iteration is normal.** The GDC session description says Into the Breach took Subset Games four years after FTL, with years of cut content and iteration [Dev; 2019] (snippet) — [GDC Vault](https://gdcvault.com/play/1025772/-Into-the-Breach-Design). Its creators told Kotaku they came close to giving up several times [Dev, reported; 2019] (snippet) — [Kotaku](https://kotaku.com/the-creators-of-into-the-breach-came-very-close-to-givi-1833498295).
  → Sightline: budget the Concept proven gate (end of Phase 2) for iteration, not features.

### Inferences
- The research supports Sightline's Phase 1 structure: isolate the riskiest systems (perception and the camp brain), test them blind in an honest view, and delay content. It adds four points:
  1. test readability at target difficulty (Halo);
  2. put the objective and the alarm's cost into the labs early (Teardown);
  3. start the audio language early (Alien: Isolation, Thief);
  4. expect exploits, and keep fuzzing (OpenAI).
- Thief's core gelled three months before ship, and Deus Ex's AI was never prototyped. Both point to a scheduling rule: no content milestone before Labs A and E pass their exit tests with blind testers.

### Gaps
- Not retrieved: Superhot's path from game jam to release, Mimimi's prototyping practice, IOI's blockout process, and Mark of the Ninja's prototype history (including Game Developer magazine's February 2013 issue, which may hold its postmortem).
- Hitman 2016's early prototypes and Thief's pre-1997 prototypes were not sourced.
- The session's web-search budget ran out before these could be searched. A follow-up session could take this Gaps list as its search plan.
