# Missions, scoring, debriefs and player knowledge in stealth games: proven designs for Sightline

Confidence tags: **[dev]** developer-written or developer interview; **[press]** journalism or criticism; **[datamined]** values read from game files via a modding wiki; **[community]** wiki, guide, forum or vendor page (lower confidence). "(excerpt)" means the claim came from a search excerpt because the page itself would not render. Every *Fit* line uses the design doc's terms: camp levels Calm, Uneasy, Alert and Lockdown; grades Ghost, Clean and Loud; doctrine; and the debrief's Done-when (find why a mission failed in under a minute). Researched Nov 7, 2026.

## 1. Mission flow (brief, insert, recon, plan, execute, exfil, debrief) and objectives that fail by escalation

### Takeaway
Shipped games make escalation-failure feel fair in three ways:
- **A commitment point.** Hitman's Elusive Targets allow restarts until the "Rubicon moment".
- **A physical flight.** In Freelancer, the leader runs for an exit once the network is alerted.
- **A legible meter.** Klei found its alarm only read as fair once it had few steps, previewed the next threshold and had deterministic consequences.

Planning games (Door Kickers) show that a drawn plan is worth keeping as a first-class artifact.

### Cited Findings
- **Hitman Elusive Targets: the Rubicon restart rule.** The first design had no restarts. Playtests showed players needed to scout and plan, so IOI allowed restarts at any time until the player starts eliminating targets or completing objectives. After that "Rubicon moment" there are no restarts. — [Game Developer, Oct 4 2016, Torben Ellert, lead online designer](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* the cleanest commitment point for the ranked daily attempt: recon freely, then lock the attempt at the first shot or first full sighting. But because Sightline's patrol timing is deterministic from the seed, restarts before the Rubicon would be free practice (see Inferences).
- **Elusive Targets: permanence changes behaviour.** Failure and success were permanent from the first prototypes. Players became more deliberate, experimented less casually and took more care with witnesses and guards. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* supports "Good loses, great wins" and the ranked first attempt. Stakes alone change how identical content is played.
- **Elusive Targets: the briefing sets a clock.** ET briefings close on time pressure instead of the usual invitation to prepare. In the fiction the target is present only briefly. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* the Brief can carry a departure time, so a soft clock sits over recon even before any alarm.
- **Freelancer Showdowns: the target flees physically.** Players report that alerting the Syndicate network (suspects, lookouts, assassins) sends the suspects and the leader to an exit, which fails the Showdown. — [Steam thread](https://steamcommunity.com/app/1659040/discussions/0/598518216964213750); [HitmanForum Freelancer thread](https://www.hitmanforum.com/t/freelancer-general-discussion/17691?page=14) (excerpt; the claim is in one of these) [community]
  *Fit:* direct precedent for "at Lockdown the target evacuates". Flight to a physical exit is what makes the validation rule "an interceptable escape" meaningful: a great player can still stop the runner.
- **Freelancer: high risk, high reward.** The co-directors framed Freelancer as deliberately high-risk, high-reward play. They conceded that Hardcore's extra XP and rarer gear may not feel proportionate to its difficulty, which they called extremely hard. — [Wccftech Q&A, Feb 20 2023, Jonas Breum Jensen and Torbjørn Vinther Christensen, Freelancer co-directors](https://wccftech.com/hitman-freelancer-qa-ioi-devs-talk-about-designing-the-game-mode-its-reception-upon-release-and-more/) [dev]
  *Fit:* if Hardline ships, reward it in kind (a grade mark or a feat) rather than with material rewards that will never feel proportionate.
- **Invisible, Inc.: the alarm redesign.**
  - The alarm runs 0–6. It rises each turn and when the player kills a guard or guards find a body.
  - The first version had 20–30 steps, rising one per turn with periodic escalations. It failed for two reasons: players couldn't tell when the next step would matter, and random consequences suited an action game but not a planning stealth game.
  - The fix was six levels with five sub-steps that have no effect, plus tooltips that warn what the next level brings. "ALARM" was renamed "SECURITY LEVEL".
  - Perceived unfairness, rooted in expectations from earlier stealth games, was never fully solved.

  — [Game Developer, Jun 1 2015, James Lantz, technical designer, Klei](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [dev]
  *Fit:* Sightline's four camp levels already have few steps. Lantz's lesson is to always preview the next level's consequence (Lockdown means the target evacuates) and keep it deterministic. The radio check-in clock ("your first kill starts a clock") is Sightline's version of the per-turn tick.
- **Invisible, Inc.: texture over difficulty.**
  - Level 2 raises every firewall by one; level 3 sends in another patrol.
  - The stated aim was rising tension and systemic texture rather than ratcheting difficulty.
  - No single starting situation is hard. Difficulty comes from mid- and long-term decisions.

  — [Game Developer, Lantz, 2015](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [dev]
  *Fit:* Uneasy and Alert should change the camp's texture (extra check-ins, lights on, paired patrols) more than its raw lethality. That matches the doc's "a mistake starts a problem that a good player contains".
- **Far Cry: alarms are objects.** If you're detected, outpost guards try to trigger an alarm and call reinforcements. Liberating an outpost without the alarm sounding stops reinforcements and pays a bonus. — [GamerGuides, Far Cry 3 outposts](https://www.gamerguides.com/far-cry-3/introduction/gameplay/outposts); [Prima, Far Cry 5 outposts](https://primagames.com/eguides/far-cry-5-eguide/training/cult-outposts) [community]
  *Fit:* the doc already credits this loop ("alarms you can sabotage"). Escalation runs through a physical device that the player can deny.
- **Door Kickers: plan, then execute.**
  - Each mission splits into a planning phase and an execution phase.
  - In planning you draw each trooper's path, with waypoints and facing.
  - You can pause at any time to amend the plan, and go-codes synchronise units.

  — [Wikipedia: Door Kickers](https://en.wikipedia.org/wiki/Door_Kickers); [Scientific Gamer review](https://scientificgamer.com/thoughts-door-kickers/) [press]
  *Fit:* "drop pins and sketch your route" makes the plan an artifact. In Sightline it's a note, not orders, so the debrief can overlay the sketched route on the path actually taken. That diff is a fast "why did it go wrong" cue.
- **MGSV: intel draws a route.** In one mission, taking an intel file marks the trafficker's route on the map. — [Gamepressure walkthrough](https://www.gamepressure.com/mgs5thephantompain/locating-the-trafficker/z07dad) [community]
  *Fit:* intel can feed the tactical map directly. A recovered patrol roster could draw routes in, closing the recon-to-plan loop.

### Inferences
- **Choose where the ranked attempt locks.** Ellert's Rubicon reconciles scouting with permanence, but in Sightline a seed's patrol timing is identical on every run, so any pre-Rubicon restart is pure information gain. Two options:
  - lock the ranked attempt at insertion, and treat all scouting as part of the attempt (the doc's "From Plan back to Recon when there's not enough intel" already fits this);
  - or allow restarts only on the insertion-choice screen.
- **Preview the next level, always.** Show the current camp level and what the next one does, e.g. "Lockdown: target evacuates by vehicle". This is Klei's tooltip fix, applied to Sightline's four levels.
- **Sightline escalates on evidence, not on a timer.** It escalates on events (bodies, missed check-ins, alarm boxes) rather than every turn, so it avoids Klei's main fairness complaint. The check-in clock is the one timer, and it is visible and interruptible (deal with the radio first).

### Gaps
- No primary source found on Freelancer's exact Showdown failure penalty. Search excerpts said you lose equipped gear, half your Mercers and the campaign, but I couldn't confirm which page said so.
- No IOI source found on how Elusive Targets behave when alerted (flee, hide, or keep their routine).

## 2. Hitman (World of Assassination): mission stories, challenges, Silent Assassin, scoring, Elusive Targets and Freelancer

### Takeaway
IOI moved in three directions:
- **From score to rating.** The "how" became a binary checklist (Silent Assassin), shown as a star rating in Hitman 3. Mastery and challenges carry progression.
- **From one-shot to replayable.** IOI's 2026 view is that one-shot pressure stops exploration, and that the design has to earn replay value.
- **From self-imposed to built-in feats.** Freelancer acknowledges players' feats so improvisation is rewarded rather than self-imposed.

### Cited Findings
- **Hitman 2: Silent Assassin is four flat bonuses.** Never spotted, no noticed kills, no bodies found, no recordings: each is worth a flat 20,000 points, an 80,000 bonus in all. — [PC Gamer, Hitman 2 leaderboards](https://www.pcgamer.com/uk/i-love-to-destroy-my-friends-on-hitman-2s-leaderboards) (excerpt) [press]
  *Fit:* fixed, large bonuses per clean condition are the mechanism behind "points reward the hard thing". Ghost and Clean should each be worth a fixed chunk that no amount of kills can match.
- **Hitman 3: Silent Assassin can be recovered.** Requirements: kill only targets, no non-target deaths, never be spotted, no witnesses or bodies found, stay off camera. Destroying the recorded footage keeps the rating. — [DBLTAP guide](https://dbltap.com/posts/hitman-3-silent-assassin-requirements-01exd43krjht) [community]
  *Fit:* the grade can be recovered by removing evidence before it spreads, the same shape as Sightline's "drop the runner before the alarm box". The grade should test what the camp ends up knowing, not whether anything ever went wrong.
- **Hitman 3: a star rating.** The end screen shows a five-star mission rating, with Silent Assassin as a rating rather than a playstyle title. Players reverse-engineering it believe Silent Assassin alone yields four stars and five needs every objective, optional ones included. — [HitmanForum thread](https://www.hitmanforum.com/t/hitman-3-new-end-of-mission-ratings-for-players/3160?page=5); [HitmanForum thread](https://hitmanforum.com/t/can-we-get-the-details-on-the-new-rating-system/18449) [community]
  *Fit:* the same split as "the grade says how you did it; the score says how well". A rating also reads faster than a five-digit number.
- **Hitman 3: progression decoupled from judgement.** Killing NPCs no longer costs XP. — [WhatCulture tips](https://whatculture.com/gaming/hitman-3-8-tips-tricks-the-game-doesnt-tell-you?page=2) [community]
  *Fit:* "No XP" in Sightline goes further. Keep the grade the only judgement, and let feats carry unlocks.
- **Freelancer: playstyle titles replace Silent Assassin.** Silent Assassin is effectively disabled in Freelancer; playstyle ratings remain. — [HitmanForum Freelancer thread](https://www.hitmanforum.com/t/freelancer-general-discussion/17691?page=133) [community]
  *Fit:* in a run-based mode IOI preferred descriptive titles to a pass/fail stealth grade. Worth considering for operations under Hardline.
- **Hitman 2 Sniper Assassin: a progression multiplier.** Players report a permanent score multiplier from completing a map's challenges (3× on Himmelstein), and Silent Assassin rules that differ in this mode (a body can be found). — [TrueAchievements, Peak Performance comments](https://www.trueachievements.com/a263280/peak-performance-achievement); [Steam thread A](https://steamcommunity.com/app/863550/discussions/0/1637542851362518753), [Steam thread B](https://steamcommunity.com/app/863550/discussions/0/1741106440023972561) (excerpt; the rules difference is in one of these) [community]
  *Fit:* the closest sniper-specific precedent, and a warning. A multiplier earned through progression makes leaderboard scores incomparable, so the daily contract must score every player on identical terms.
- **Elusive Targets: the map gives nothing away.** For Elusive Targets IOI removed the red target glow, the mini-map and the map icons. The first test gave the designer only a photo of the target. Targets were kept out of brand-new maps so players first master the layout, which ties into level mastery; Ellert describes playing a mastered level as being the apex predator. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* the daily contract should use a camp archetype the player has met before, so the first attempt tests skill on a fresh seed rather than learning the UI. It also backs the honest view and a map of observed facts only.
- **Elusive Targets: two kinds of player.** Some players scout for hours and restart often, while others play once and accept the outcome. Players collaborate while each faces the target alone. Ellert calls Hitman a party game because its moments are shareable. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* the daily's social layer is talk and share cards around a solo attempt, which matches "shared daily seeds are the only social layer".
- **Elusive Targets, 2026: one-shot pressure stops exploration.** Eskil Mohl says players get so afraid to mess up that they play safe and "never get to see 5% of what the mission actually has to offer". The design, he says, must earn replay value rather than rely on one moment of dread. Celebrity Elusive Targets are now released as replayable special assignments. — [Pocket Tactics, updated Sep 19 2026, Eskil Mohl, senior game designer](https://www.pockettactics.com/hitman-world-of-assassination/snoop-dogg-interview) [dev]
  *Fit:* this validates "the first attempt is ranked; later runs are practice". Keep the seed replayable after the ranked run, unlike the original Elusive Targets.
- **Elusive Target Arcade (2021 on): a lockout instead of permanent loss.** Failing locks you out of that target for 12 hours. Restarting or quitting once you've started on the objectives counts as failure. — [DoubleXP](https://doublexp.com/news/io-interactive-finally-fixes-elusive-target-arcade-timers); [Gamepur](https://gamepur.com/?p=283843); [HitmanForum Arcade thread](https://www.hitmanforum.com/t/elusive-target-arcade/12548?page=19) (excerpt; the restart and quit rule is Gamepur's, the 12-hour figure comes from press and forum reports) [press/community]. A December 2021 opinion piece argued the Arcade needed to allow repeat attempts. — [PowerUp Gaming](https://powerupgaming.co.uk/2021/12/09/hitman-3-elusive-target-arcade-needs-to-allow-repeat-attempts/) [press]
  *Fit:* quitting mid-attempt must count as the attempt, or the first-attempt rank is trivially gamed.
- **Freelancer: feats are built in.** The team wanted built-in challenges that acknowledge players' feats, so that improvisation is rewarded rather than being a layer players add themselves. Randomisation exists to push new approaches on familiar maps. — [Wccftech, Feb 20 2023](https://wccftech.com/hitman-freelancer-qa-ioi-devs-talk-about-designing-the-game-mode-its-reception-upon-release-and-more/) [dev]
  *Fit:* "Tools unlock through feats" (no alarms unlocks subsonic ammo; three shots chained within 3 s unlock a second throwable slot) is the same idea: recognise hard play directly instead of through volume or grind.
- **Freelancer's inspirations.** Coverage headlines the mode as inspired by Hades and Escape from Tarkov. — [Sports Illustrated, Freelancer interview](https://videogames.si.com/features/hitman-freelancer-interview) (headline only) [press]
  *Fit:* an extraction game (Tarkov) is a named influence, which fits Sightline's "reach exfil alive" success rule.
- **Mission stories teach a level.** Mission stories are guided approaches that weave story into play, and they work well for learning a level on early runs. — [EGM, Hitman 3 review](https://egmnow.com/hitman-3-review/) [press]. IOI's GDC Europe 2016 talk covered a linear guidance system built to support the open sandbox without overshadowing it. — [Game Developer, video post Feb 20 2019, Jacob Mikkelsen and Mette Podenphant Andersen](https://gamedeveloper.com/design/video-how-i-hitman-i-guides-players-through-non-linear-level-design) [dev]
  *Fit:* a guided story per camp archetype could serve the onboarding mission (Phase 4). It should be off in the daily and in the honest view.
- **Opportunities guidance can be turned down.** Opportunities begin from overheard conversations and become a quest chain with markers. Players can set guidance to minimal or off. — [Wikipedia: Hitman (2016)](https://en.wikipedia.org/wiki/Hitman_(2016_video_game)) [press]. With it off, only the markers and prompts go; the conversations still hint at options. — [PC Gamer, first impressions, 2016](https://www.pcgamer.com/uk/hitman-first-impressions-from-episode-one) [press]
  *Fit:* overheard guard and radio chatter can be in-world intel with no UI marker. The player learns by listening, which suits lab A's perception focus.

### Inferences
- IOI's trajectory points to making Sightline's grade the headline and the score the detail. A grade is legible at a glance and maps to a few clean conditions; a raw score invites speedrun-style optimisation.
- A map-specific progression multiplier must never touch daily-contract scores.
- Elusive Targets show permanence and pressure create stories. Mohl's 2026 comment shows that pressure hides content, so practice runs after the ranked attempt matter as much as the attempt.

### Gaps
- I found no official IOI statement on why Hitman 3 moved to a star rating, or on the exact Hitman 2 and 3 time-bonus formulas. Forum reverse-engineering only.
- The GDC Europe 2016 guidance talk was not reviewed beyond its summary; it's video only.
- No source found for exact challenge counts or mastery XP curves.

## 3. Scoring and player-knowledge tracking in other stealth games (MGSV, Blacklist, Dishonored, Far Cry, Sniper Elite, Invisible, Inc., Shadow Tactics)

### Takeaway
The pattern that lasts:
- **A huge binary "perfect" bonus** that dwarfs per-action points: MGSV's No Traces is worth 100,000, against 200 per enemy neutralised; Far Cry 3 pays about three times more for staying undetected.
- **Style categories**, as in Blacklist.
- **Weighting who you kill**, as in Dishonored 2.
- **Feat badges** (Shadow Tactics) and a **reward view for the earned shot** (Sniper Elite's kill cam).

MGSV's revenge system is the clearest shipped model of "what the enemy learned".

### Cited Findings
- **MGSV scoring table** (from the game's TppResult.lua):
  - **Bonuses:** +200 per enemy neutralised; +1,000 per headshot; +1,000 per tactical takedown; +150 per interrogation, counted only if it yields information; +30 per marker; +5,000 per prisoner extracted; +5,000 per special objective; No Traces +100,000; Perfect Stealth, No Kills +20,000; No Reflex +10,000; No Retry, No Kill and No Alert +5,000 each.
  - **Penalties:** −100 per hit taken; −500 per re-discovery during a search; −5,000 per enemy alert. Only alerts where you're spotted and enemies open fire count; alerts from a found body don't.
  - **Ranks:** S needs 130,000. Using a "rank-limiting" item caps the rank at A. The time bonus exists but is unverified.

  — [MGSV Modding Wiki, TppResult.lua](https://mgsvmoddingwiki.github.io/TppResult.lua) [datamined]; S at 130,000 also in [Gamepressure FAQ](https://www.gamepressure.com/mgs5thephantompain/how-to-obtain-the-s-ranks-in-missions/ze7b23) [community]
  *Fit:* the scale ratio is the lesson: one No Traces equals 500 neutralisations. Ghost and Clean should outweigh any count-based points by an order of magnitude. Rank-limiting items are a direct precedent for capping the grade when an assist tool is used.
- **MGSV: the penalty line between "seen" and "suspicious".** The penalty counts only alerts where the enemy has actually spotted you, not body-triggered alerts. — [MGSV Modding Wiki](https://mgsvmoddingwiki.github.io/TppResult.lua) [datamined]
  *Fit:* the same line Sightline draws between Ghost (never fully spotted) and Clean (no camp-wide alarm). Grades should key on what the camp knows about you specifically.
- **MGSV: recon is rewarded for information, not effort.** +30 per mark; an interrogation scores only when it yields information. — [MGSV Modding Wiki](https://mgsvmoddingwiki.github.io/TppResult.lua) [datamined]
  *Fit:* if recon earns score, reward the information gained (a route confirmed, a marksman found), not the number of marks.
- **MGSV's revenge system ("enemy preparedness").**
  - Headshots raise a helmet counter (+5 per headshot kill; at the top level up to 70% of guards wear helmets).
  - Kills at night lead to gun lights; repeated night infiltration leads to night-vision goggles.
  - Tranquiliser or smoke use leads to gas masks.

  — [Metal Gear Wiki](https://metalgear.fandom.com/wiki/Revenge_System_(enemy_preparedness)); [GamerGuides](https://www.gamerguides.com/metal-gear-solid-v-the-phantom-pain/guide/the-basics-6/gameplay-9/dynamic-difficulty); the gas-mask counter is from a [Nexus mod page](https://www.nexusmods.com/metalgearsolidvtpp/mods/2254), so it may not reflect the base game [community]
  *Fit:* Sightline's doctrine table (long-range headshots lead to helmets; night operations lead to floodlights) closely mirrors MGSV. MGSV's per-habit counters are a ready model for "What the enemy learned": show this mission's contribution to each counter, and the threshold that triggers the next countermeasure.
- **Splinter Cell: Blacklist: points by style.** A non-lethal takedown earns Ghost points, a silent kill Panther points, and a loud but skilful kill Assault points. Ghost pays most, Panther next, Assault least. — [Prima Games](https://primagames.com/news/splinter-cell-blacklist-playstyle-campaign-scoring) (excerpt; page blocked) [community]. Lead designer Richard James Carrillo said every style is rewarded, but going the extra mile for Ghost earns more. — [GamesBeat, 2013](https://gamesbeat.com/how-ubisofts-designers-transformed-sam-fisher-into-a-panther-and-a-leader-in-splinter-cell-blacklist-interview/2) (excerpt) [dev]. The game grades each mission on the three styles, or a mix, under an "Economy" scoring system. — [GamingBolt, ComDev Q&A #3, Jan 11 2013](https://gamingbolt.com/splinter-cell-blacklist-comdev-qa-3-explores-scoring-system) [dev video via press]
  *Fit:* Blacklist scores style per action, which still rewards volume (more takedowns, more points). Sightline's per-mission grade, keyed on what the camp knows, is sturdier. Blacklist's per-action style points map onto Sightline's "style" score category, which should then be capped.
- **Blacklist: scoring as the only consequence.** PC Gamer's review argued Blacklist leans on its scoring system for consequences because the story doesn't react to how you play. — [PC Gamer review](https://www.pcgamer.com/splinter-cell-blacklist-review) [press]
  *Fit:* Sightline's consequences are systemic (doctrine, the target's escape), so the score can stay light.
- **Dishonored 2: chaos weighs who you kill.**
  - Chaos has three states: low, high and very high.
  - At the start of each mission, characters are assigned a morality: most are guilty and worth a set amount of chaos, the sympathetic are worth more, and the murderous are worth less.
  - Chaos changes bloodfly infestations, guard density, voice lines and the ending's parts.
  - Smith framed this as a more nuanced approach, in response to player feedback.

  — [Wccftech, May 30 2016, reporting Harvey Smith on the Game Informer Show](https://wccftech.com/dishonored-2s-chaos-system-implications-explained-game-director/) [dev via press]
  *Fit:* score by who you kill as well as how many. An unarmed worker or a surrendering guard could cost score, the target's bodyguard nothing. The consequence also lands in the world (doctrine, posture), not only in points.
- **Far Cry outposts: an undetected bonus.**
  - Far Cry 3: about 500 XP for a liberation, 550 with no alarm, 1,500 undetected. — [GamerGuides FC3](https://www.gamerguides.com/far-cry-3/introduction/gameplay/outposts) [community]
  - Far Cry 4: 1,500 XP undetected, plus an achievement. — [GamerGuides FC4](https://gamerguides.com/far-cry-4/guide/extras/trophyachievement-guide) [community]
  - Far Cry 5: bonus income for an undetected liberation with all alarms disabled. — [Prima FC5](https://primagames.com/eguides/far-cry-5-eguide/training/cult-outposts) [community]
  - Far Cry New Dawn: extra ethanol for no alarm or for staying undetected. — [GameWith](https://gamewith.net/far-cry-new-dawn/article/show/7804) [community]

  *Fit:* the three tiers (undetected, no alarm, loud) are Ghost, Clean and Loud almost exactly, and FC3's roughly 3× ratio is a sensible starting point for the Ghost premium.
- **Far Cry 3: the bonus tracks being seen, not killing.** The undetected bonus is still paid if something else, such as a wild animal, clears the outpost while you stay unseen. — [Prima FC3](https://primagames.com/eguides/far-cry-3-with-interactive-map-eguide/essentials/key-locations/outposts) [community]
  *Fit:* Ghost should test "never fully spotted" regardless of who or what did the killing. A guard killed by his own trapped generator still leaves you a Ghost.
- **Sniper Elite: the X-ray kill cam.** It arrived with Sniper Elite V2 and follows the bullet through the body. Rebellion studies high-speed film and ballistic gel for it. — [TheSixthAxis, Jun 27 2025, Rebellion interview](https://www.thesixthaxis.com/2025/06/27/rebellion-on-sniper-elites-wacky-wunderwaffe-and-weapon-authenticity/) [dev]. Rebellion tested gorier kill cams and rejected them as going too far. — [FRVR](https://frvr.com/blog/news/sniper-elite-devs-wont-add-gorier-bullet-cams-as-multiple-tests-proved-more-violence-went-too-far/) [press]
  *Fit:* a payoff view for the earned shot. In Sightline it belongs in the debrief: the bullet's real path, wind drift and time of flight, rebuilt from the bit-exact recording rather than faked. An in-mission kill cam would also leak whether the shot killed, which the scope view should have to show.
- **Sniper Elite 4: what scores.** Score depends on accuracy and headshots, and payouts scale with difficulty. Shots to vital organs count like headshots and trigger the kill cam. Non-sniper and knife kills also score. — [Gamepressure SE4 tips](https://www.gamepressure.com/sniper-elite-4/for-beginners/z5971d) [community]
  *Fit:* weight precision by difficulty factors (range, wind, moving target, a shot masked by noise), not raw kill count. That's how "a 300 m shot at a walking target feels earned" (lab B) becomes worth points.
- **Invisible, Inc.: the alarm.** Covered in section 1. The lesson for scoring is that the alarm is the economy: every action spends exposure. — [Game Developer, Lantz, 2015](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [dev]
  *Fit:* peak alert is already a stealth input to Sightline's score. Klei's framing argues the debrief should show the alert-level curve as the run's budget being spent.
- **Shadow Tactics: badges.** Each mission has optional badges: beat a par time, finish on Hardcore, and feats such as unique kills, harming no enemies or not using certain skills. — [Wikipedia: Shadow Tactics](https://en.wikipedia.org/wiki/Shadow_Tactics:_Blades_of_the_Shogun) [press]. A German review notes the badges are revealed only after the mission is first beaten. — [GamePro.de review, p. 2](https://www.gamepro.de/artikel/shadow-tactics-blades-of-the-shogun-die-rueckkehr-der-echtzeit-taktik,3317431,seite2.html) (excerpt, German) [press]
  *Fit:* hiding badges until the first clear keeps the first (ranked) attempt unbiased and seeds replays afterwards. Sightline's feat unlocks are badges with gameplay value.

### Inferences
- **Volume leaks in through count-based bonuses.** MGSV pays +1,000 per headshot: 30 headshots score 30,000, less than No Traces but not trivial. To keep "killing every guard is never worth more than one perfect shot" true, score precision as rates and qualities (one-shot kills as a share of shots, headshot rate, difficulty-weighted best shot) and cap any per-kill term.
- **A total-time bonus punishes recon.** In a 15–25 minute mission where recon is the point, base efficiency on rounds, tools and execution time (first shot to exfil) rather than total time. This is my inference; MGSV's hidden per-mission time thresholds are the anti-pattern.
- **Publish the scoring table in the debrief.** Every line item with its points, as Hitman's score screen does, so players learn what "hard" means. MGSV's hidden time thresholds hurt this.

### Gaps
- No Kojima Productions statement found on the intent behind MGSV's ranks, and no verified time-bonus formula.
- Blacklist: no per-action point values. A search excerpt said that once detected you can't earn Ghost again until an area is cleared, but I couldn't confirm it.
- Sniper Elite: no source found for the formal scoring formula, or for the kill cam's origin as a reward.
- Shadow Tactics: no Mimimi statement found on badge design.

## 4. Replay and debrief features elsewhere: which make "why did I fail" fast?

### Takeaway
The fastest tools pre-index the moments that matter and answer "what got me" on one screen:
- Tekken 8's My Replay & Tips;
- League of Legends' death recap;
- Counter-Strike's 2D round replays, with a timed kill feed and utility paths.

Raw 3D playback with a free camera (Rocket League, early Valorant) is slow. Tekken 8's "take over from this moment" is the strongest single pattern, and Sightline's save-and-restore of `sim.state` makes it nearly free.

### Cited Findings
- **Tekken 8: My Replay & Tips.**
  - While a replay plays, tips appear in real time: a better combo route, a punish for an unsafe move, how to duck a string or break a throw.
  - You can take control from the moment of the advice and try alternatives for about ten seconds.
  - It works for online matches and AI ghost matches, and refines a feature first added to Tekken 7.

  — [GamingBolt](https://gamingbolt.com/tekken-8-overhauls-my-replay-and-tips-allows-for-real-time-practice); [Prima Games](https://primagames.com/news/tekken-8-teaches-you-how-to-learn-from-mistakes-with-new-interactive-replays); [Automaton (JP), Jan 31 2024](https://automaton-media.com/articles/newsjp/20240131-280770/) [press]
  *Fit:* the model for the debrief's "jump to key moments" plus a takeover: restore the state at the first sighting and play on live from there. It answers "what should I have done", not just "what happened".
- **League of Legends: the death recap.** The 2019 overhaul (patch 9.14) shows what kind of damage killed you, which champions threatened you most and which spells to watch for. The old recap had been a community joke for years. — [Comicbook](https://comicbook.com/gaming/news/league-of-legends-death-recap-updated); [ONE Esports](https://www.oneesports.gg/league-of-legends/here-is-your-first-look-at-the-new-league-of-legends-death-recap-screen/); [GosuGamers](https://www.gosugamers.net/lol/news/49667-riot-games-reveal-new-league-of-legends-death-recap-and-more-in-developer-update) [press]
  *Fit:* Sightline's failure card can show what spotted you (which guard, which sense, the stimulus: stance, surface, muzzle report, glint), each with a jump link to its tick. It answers the under-a-minute test before any scrubbing.
- **Counter-Strike 2: 2D round replays (third-party).** op.gg's 2D replay shows each player's movement and facing, grenade paths, smoke and fire areas, and a timed kill feed on the radar map. Refrag parses demos automatically from your match history; Skybox, Noesis, SCOPE.GG and RoundIQ offer similar views. — [op.gg docs](https://op.gg/cs2/2d-replay); [Refrag blog, Apr 5 2025](https://refrag.gg/blog/how-to-view-cs2-demos-online/) [community/vendor]
  *Fit:* a checklist that maps one-to-one onto Sightline's debrief:
  - positions and facing → paths and vision cones;
  - grenade paths → shot trajectories and throwables;
  - smoke and fire areas → noise radii and masking zones;
  - the kill feed → the key-moment index.
- **Valorant: replays, late.** Riot showed a replay prototype in May 2025; tech lead Marcus Reid stressed it was nowhere near launch. — [esports.gg](https://esports.gg/news/valorant/riot-shows-how-valorants-replay-system-will-work-but-the-feature-is-nowhere-near-launch) [press]. A guide reports it went live on Sep 16 in patch 11.06 for Competitive, Unrated, Swiftplay and Premier, with play/pause, agent cycling and a free camera. Replays expire after a few weeks. — [esports.net](https://www.esports.net/wiki/guides/valorant-replay-system-explained/) [community]. Riot had earlier said it had no plans for a player-facing replay system. — [AFK Gaming](https://afkgaming.com/esports/news/riot-games-responds-to-backlash-about-lack-of-replay-system-in-valorant) [press]
  *Fit:* years of player demand show replay is expected. But a 3D free camera answers "why" slowly; a top-down view with an event index is faster, which is the design doc's choice.
- **Rocket League: replays are opt-in.** Replays aren't saved automatically; you have to choose to save at the end of the match. — [AFK Gaming](https://afkgaming.com/esports/guide/rocket-league-replays-where-are-they-saved-and-how-to-locate-them) [press]. The community built analysis on top: ballchasing.com parses uploaded replays into stats and a 3D viewer with a timeline. — [ballchasing FAQ](https://ballchasing.com/doc/faq) [community]
  *Fit:* record every run by default, as Sightline already does. Saving by choice loses the failures players most need to study.
- **Trackmania: replays are inputs.** A replay file holds the player's inputs with timestamps. The in-game validator re-plays those inputs from start to finish and checks the result matches the replay's ghost. — [donadigo and Wirtual, TMX replay investigation (2021; data to Dec 7 2020)](https://donadigo.com/tmx1) [community primary analysis]
  *Fit:* the same structure as Sightline's recordings (input frames plus a deterministic re-simulation). Overlaying a "ghost" of your previous attempt, or of the day's top run once you've played, shows where routes and timings diverged.
- **Into the Breach: show the failure before it happens.** The game telegraphs enemy attacks and gives perfect information. A UX analysis credits this with making the player feel smart. — [Prototypr UX analysis](https://blog.prototypr.io/into-the-breachs-ux-makes-you-feel-smart-a9cb03210757) [press]. Subset's design postmortem was presented at GDC 2019 by Matthew Davis. — [Game Developer GDC preview](https://gamedeveloper.com/design/get-an-inside-look-at-the-making-of-i-into-the-breach-i-at-gdc-2019-) [dev]
  *Fit:* this isn't a replay but the complement to one. The honest view must expose cues (a head turn, a "Hm?", weapon up) so the debrief confirms what the player could have seen. Rule 13 (brains see only their minds) means the replay can show exactly what each guard knew.

### Inferences
- **A sequence that should pass the under-a-minute test:**
  1. A failure card with the cause chain, walked backwards: target evacuated ← Lockdown ← an alarm box reached by a named guard ← the sighting that sent him ← its stimulus.
  2. Jump buttons for first suspicion, first sighting, the alarm and the shot.
  3. At any scrubbed tick, each guard's awareness state and last-known-position circle.
  4. A takeover from any key moment.

  Every link in the cause chain is a recorded event, so this is a query over the recording, not a guess.
- **A "plan versus reality" layer** (the route you sketched against the path you took) is cheap and points straight at where the plan broke.

### Gaps
- No primary source for Rocket League's in-game viewer controls.
- No good sources found for roguelite death recaps (Binding of Isaac, Spelunky, Hades); not covered.
- No developer data found on how long players take to find a failure's cause with any of these tools.

## 5. Tactical maps that show only what the player observed, last known positions, routes annotated automatically, and the marking debate

### Takeaway
Most shipped stealth games show marked enemies live, through walls (MGSV, Far Cry, Assassin's Creed). Critics call that a wallhack that hollows stealth out, and IOI stripped the target glow and map icons from its hardest mode. Splinter Cell: Conviction's last-known-position silhouette is the best-known way to show what an enemy believes. I found no shipped game that draws patrol routes in from what the player has watched; Sightline's map would be distinctive.

### Cited Findings
- **MGSV: map marking.** Markers you place on the iDroid map appear in the world with a distance counter. — [SuperCheats iDroid guide](https://www.supercheats.com/metal-gear-solid-v-the-phantom-pain/walkthrough/the-idroid) [community]. Interrogation adds resources and prisoners to the map. — [Gamepressure](https://www.gamepressure.com/mgs5thephantompain/locating-the-trafficker/z07dad) [community]. Marking scores +30 per mark. — [MGSV Modding Wiki](https://mgsvmoddingwiki.github.io/TppResult.lua) [datamined]
  *Fit:* keep MGSV's player pins and distance readout. Replace live tracking of marked guards with last-seen positions that age.
- **Hitman: designers removed the intel UI for the hardest mode.** For Elusive Targets IOI removed the target glow, the mini-map and the map icons. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* designer-side evidence that live intel UI lowers the stakes. It supports showing only what the player has seen.
- **Splinter Cell: Conviction: Last Known Position.** Breaking line of sight with an alerted guard leaves a silhouette where he believes Sam is. Patrick Redding, co-op game director, named Mark & Execute and Last Known Position as the core of the new stealth. — [Wikipedia](https://en.wikipedia.org/wiki/Tom_Clancy%27s_Splinter_Cell:_Conviction) [press]. Previewers found it made slipping away easier once spotted and useful for drawing groups to one spot to sneak past. — [Giant Bomb hands-on](https://www.giantbomb.com/articles/splinter-cell-conviction-hands-on/1100-1877/?page=2) [press]. Critics found the AI fixated on the silhouette too much, which made flanking easy. — [Expert Reviews](https://www.expertreviews.co.uk/software/28364/splinter-cell-conviction-review) [press]
  *Fit:* Sightline's guards already hold a last known position with an uncertainty radius. Draw it as a circle in the debrief and the debug view. Whether it shows in the honest view is a taste call, and lab A's predict-detection test should settle it. Conviction shows players will use it as a lure.
- **The case against marking.** A PC Gamer piece on Aragami calls marking enemies and seeing them through walls obligatory but unnecessary parts of modern stealth. — [PC Gamer](https://pcgamer.com/how-aragamis-teleporting-ninja-assassionations-gets-stealth-wrong) [press]. The Last of Us limits seeing enemies through walls to enemies who are making noise. — [School of Stealth, part 2, video transcript](https://amara.org/subtitles/WhRzE9B9SAIb/en/1/download/The%20Five%20Types%20of%20Stealth%20Game%20Gadget%20%20School%20of%20Stealth%20Part%202.en.txt) [community]. Kotaku welcomed Assassin's Creed IV's tagging for making enemies easier to track through walls. — [Kotaku](https://kotaku.com/theres-a-lot-to-like-in-this-assassins-creed-iv-steal-1124441700) [press]. GamesRadar frames the real problem as poor implementation. — [GamesRadar](https://gamesradar.com/how-developers-can-fix-stealth-mechanics) [press]
  *Fit:* last-seen marking is the middle ground. A mark records knowledge without granting live tracking, so the player still has to watch to keep it current.
- **Door Kickers: route drawing as planning** (see section 1). — [Wikipedia: Door Kickers](https://en.wikipedia.org/wiki/Door_Kickers) [press]
  *Fit:* a precedent for a drawn route as the notebook of a plan.
- **MGSV: intel that draws a route** (see section 1). — [Gamepressure](https://www.gamepressure.com/mgs5thephantompain/locating-the-trafficker/z07dad) [community]
  *Fit:* shows that automatically drawn routes read well. Sightline earns them by watching instead of from a pickup.

### Inferences
- **Routes draw themselves from watching.** A guard on routine is a pure function of time (rule 3), so the map can draw a guard's route only along the segments the player has actually watched, each stamped with the time it was seen. The prediction should never reach further than what was observed; anything more would be a wallhack by another name.
- **Show age as uncertainty.** Fade last-seen marks with time, and mark the timing of a route segment as confirmed once it has been watched twice, so the map shows uncertainty honestly.
- **Record the player's knowledge.** The replay can then show what the player knew at each tick next to what each guard knew. That pairing ("you didn't know about the marksman") is often the real answer to "why did I fail".

### Gaps
- No Game Maker's Toolkit or developer analysis found arguing specifically that tagging trivialises stealth; the opinions above come from reviews and features.
- No shipped precedent found for patrol routes annotated from observation. Tactics games such as Commandos and Desperados may have one, but I didn't verify it.

## 6. Briefing intel that may be wrong or partial, and how recon confirms or corrects it

### Takeaway
Hitman's Freelancer Showdown is the strongest shipped precedent. The briefing gives partial descriptors (look, tell, agenda), and the player confirms identity by watching suspects. MGSV gates intel behind field actions (interrogation, intel files). I found no shipped stealth game whose briefing is deliberately false. Sightline's hedged intel ("the target is probably in the office") is closest to Freelancer's partial clues.

### Cited Findings
- **Freelancer Showdowns: partial clues confirmed by watching.**
  - An intel board lists the leader's agenda, tell and look; Diana provides the clues.
  - Players watch suspects until they perform a tell or attend a meeting, and confirm with the camera.
  - Later Showdowns include suspects who match the traits but not the agenda.
  - Diana discloses only some clues, so ruling suspects out by traits she never mentioned is risky.

  — [HitmanForum Freelancer thread](https://www.hitmanforum.com/t/freelancer-general-discussion/17691?page=14); [Steam thread](https://steamcommunity.com/app/1659040/discussions/0/598518216964213750); [NAGuide](https://naguide.com/?p=45979) (excerpt; claims spread across these) [community]
  *Fit:* the model for "the target is probably in the office". Give hedged, partial descriptors that recon confirms through the scope (a gait, a habit, a meeting). Identifying the target at range is the sniper fantasy.
- **Elusive Targets: a photo and little else.** Players had only the briefing video and released pictures; the first test gave the designer just a photo. — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* minimal, appearance-based intel keeps identification a skill; binoculars and the scope are the confirmation tools.
- **Hitman: overheard intel.** With guidance off, Opportunities still surface through overheard conversations; only the markers go. — [PC Gamer, 2016](https://www.pcgamer.com/uk/hitman-first-impressions-from-episode-one) [press]
  *Fit:* guard chatter and radio check-ins can correct the briefing in the world ("he's moved to the motor pool"). That rewards the listening systems from lab A.
- **MGSV: intel comes from field actions.** An interrogation scores only when it yields information. — [MGSV Modding Wiki](https://mgsvmoddingwiki.github.io/TppResult.lua) [datamined]. Some locations can only be learned by interrogating soldiers, and one needs a language interpreter. Intel files can mark routes on the map. — [Gamepressure](https://www.gamepressure.com/mgs5thephantompain/locating-the-trafficker/z07dad) [community]
  *Fit:* Sightline is mostly long-range, so its equivalents are radio intercepts, documents taken in a Retrieve objective, and patient observation.
- **Invisible, Inc.: framing shapes fairness.** Players' expectations from earlier stealth games drove the sense of unfairness. Klei's mitigations were in-world fiction, extra UI and tutorials. — [Game Developer, Lantz, 2015](https://gamedeveloper.com/design/game-design-deep-dive-alarm-systems-in-klei-s-i-invisible-inc-i-) [dev]
  *Fit:* if briefing intel can be wrong, the fiction must frame it as an estimate (who reported it, and when) so a wrong guess feels like weather, not betrayal.

### Inferences
- **Make every claim checkable.** Phrase intel with its confidence and age ("last reported at 06:40", "probably"), and make every briefing claim checkable from some perch during recon. Wrong intel should be wrong in a way the player can discover.
- **Add an intel scorecard to the debrief.** List each briefing claim marked confirmed, corrected or never checked. It teaches recon habits and ties into "What the enemy learned".
- **Doctrine counts as briefing intel.** The design already puts doctrine changes in the briefing ("Guards are now issued helmets"). Treating it as confident intel, as against the hedged intel about the target, keeps the two kinds distinct.

### Gaps
- I found no Hitman mechanic actually named "rumours". The closest are Opportunities discovered by overhearing, Elusive Target briefings and Freelancer's clues.
- No sources found in this pass on Invisible, Inc.'s partial information (unknown daemons, unexplored layout).
- No source found for a shipped stealth game that deliberately falsifies its briefing, or for how players reacted to one.

## 7. Daily seeded contracts with a first-attempt leaderboard, and how runs are verified

### Takeaway
Spelunky's daily proved the format:
- one shared seed, one attempt and one score per day turn a single-player game into a social event;
- the main game becomes practice for the daily.

Its weaknesses are exactly what Sightline's bit-exact recordings fix: it records no replays, so scores can't be verified, and players can watch others before their own run. Server-side re-simulation proves only that a run's inputs produce its result, not that a human played them in real time. That was the lesson of Trackmania's 2021 scandal, where players slowed the game down while recording.

### Cited Findings
- **Spelunky: same seed, one try.** Derek Yu explained that the daily levels share one seed for everyone, so a high score reflects skill and knowledge rather than luck. — [Shacknews, 2013](https://www.shacknews.com/article/80294/spelunky-pc-introduces-daily-challenges); [PC Gamer, 2013](https://www.pcgamer.com/uk/spelunky-gets-competitive-with-the-steam-exclusive-daily-challenge) (excerpt; the quote is in one of these) [dev via press]. Everyone gets one try; once you die, that day's run can never be played again. — [Tom Francis, Pentadact](https://www.pentadact.com/?p=6366) [press]
  *Fit:* Sightline's daily is the same shape. Cross-engine determinism means one global seed really is the same valley for everyone, which Spelunky didn't manage across platforms (next bullet).
- **Spelunky: the daily becomes the real game.**
  - The author came to treat the main mode as practice for the daily, and one small slip costs the whole day.
  - Even a failed run posts a score.
  - Players built friend leaderboards and an Explorers' Club, and watched each other's runs to learn tactics.

  — [Game Developer, Aug 29 2013, Mike Rose](https://gamedeveloper.com/design/the-understated-genius-of-the-i-spelunky-i-daily-challenge) [press]
  *Fit:* Sightline's operations are the practice and the daily is the stage. Every daily attempt should produce a grade and a share card, even on failure.
- **Spelunky: no times, no replays, split seeds.** The daily board compares money and level reached. Completion times and replays aren't recorded, and Steam and PSN had different seeds. — [Spelunky Wiki](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)) [community]
  *Fit:* store the recording with every daily score; it's both the proof and the content.
- **Spelunky: watching first.** A 2014 critique argued dedicated players could watch someone else play the daily before making their own attempt, which undercuts the risk the mode is meant to reward. — [The Ludite, Jun 23 2014](https://theludite.com/2014/06/23/spelunky-when-scoring-goes-bad/) [press]. Hacked times were removed by hand in 2013 (a forum report that programmer Andy Hull would remove them). — [Steam forum](https://steamcommunity.com/app/239350/discussions/0/864978109695115837) [community]
  *Fit:* a ranked first attempt can be gamed by watching streams. Consider hiding other players' replays and stats for the day's seed until you've made your own attempt or the day closes.
- **Spelunky: the format came from players.** Coverage credits a player ritual with inspiring the daily, before Mossmouth formalised it with the Steam release in 2013. — [Gutefabrik](https://gutefabrik.com/redux-spelunky-glory-videogame-rituals-and-nifflas-miracle-run/) [press]
  *Fit:* seeds as text (TAL-4471) let players hold rituals before the backend exists.
- **Slay the Spire: the Daily Climb.**
  - A fixed character, a set Ascension level and three random modifiers. — [Slay the Spire Wiki](https://slaythespire.wiki.gg/wiki/Custom_Mode); [Bossdown STS2 guide](https://bossdown.com/guides/slay-the-spire-2-daily-climb-guide/) [community]
  - The same modifiers don't appear two days running. — [Kotaku](https://kotaku.com/slay-the-spires-daily-challenges-keep-getting-better-1823780588) [press]
  - Community answers say only the first run of the day is submitted, to stop score farming. — [STS2 Steam thread A](https://steamcommunity.com/app/2868840/discussions/0/591810592556252896/), [STS2 Steam thread B](https://steamcommunity.com/app/2868840/discussions/0/798966745989725135/) (excerpt; the claim is in one of these; no developer statement found) [community]

  *Fit:* STS lets you replay but ranks only the first run, which is exactly Sightline's "first attempt ranked; later runs are practice". Daily modifiers (fog, night, a doctrine preset) keep the daily distinct from operation missions without new content.
- **Trackmania: Track of the Day and Cup of the Day.**
  - Ubisoft Nadeo curates one community map per day, released at 19:00 CE(S)T.
  - Players have 24 hours to set times, and trophy points are awarded by final placement.
  - Cup of the Day is a knockout on that map, three times a day, after a 10-minute qualification.

  — [Trackmania docs: Track of the Day](https://doc.trackmania.com/play/what-is-totd/); [Trackmania docs: Cup of the Day](https://doc.trackmania.com/play/how-to-play-cotd/) [dev docs]
  *Fit:* the counter-model, unlimited attempts with the best time counting. Sightline could rank the first attempt and also show a "best of the day" practice board, with a fixed daily release time.
- **Hitman Elusive Targets: a window and one attempt** (see section 2). — [Game Developer, Ellert, 2016](https://gamedeveloper.com/design/designing-the-elusive-targets-system-in-2016-s-i-hitman-i-) [dev]
  *Fit:* the stealth-genre precedent for a ranked one-shot.
- **Trackmania: replay verification has a hole.**
  - Replays hold inputs and timestamps. The official validation re-plays the inputs but does not detect that the game was slowed down while recording.
  - The investigators scraped 33,641 replays from United and 5,691 from Nations.
  - They measured steering "spikes per second" against human norms and named seven players.
  - Their recommendation: require the Competition Patch, which records metadata to detect injected inputs and changed game speed.

  — [donadigo and Wirtual](https://donadigo.com/tmx1) [community primary analysis]. The investigation began in May 2021 and led Nadeo to a wider cheating investigation. — [Wikipedia: Wirtual](https://en.wikipedia.org/wiki/Wirtual) [press]. The cheating spanned more than a decade and several Trackmania games, and Nadeo took action. — [PC Gamer](https://www.pcgamer.com/cheating-allegations-catch-up-with-some-of-trackmanias-fastest-drivers) [press]
  *Fit:* the key risk for Sightline. Its fixed 30 Hz step with quantised input means a slowed-down or scripted client produces a perfectly valid recording, so re-simulation proves legality, not humanity.
- **Doom: demos as proof.** Doom speedruns are only considered legitimate with demo files (.lmp), which record the player's inputs frame by frame and can be played back by anyone. Compet-N verifies submitted demos. — [Doom Wiki: Speedrun](https://doom.fandom.com/wiki/Speedrun) [community]. DSDA-Doom is a port built for recording and playing back demos for speedrunning. — [DSDA-Doom manual (Debian)](https://manpages.debian.org/testing/dsda-doom/doom.6.en.html) [community]. TASVideos verifies Doom submissions by playing them back in the original game under DOSBox, and tool-assisted records are tracked separately. — [TASVideos forum](https://tasvideos.org/Forum/Posts/408828); [Doom Wiki](https://doom.fandom.com/wiki/Speedrun) [community]
  *Fit:* three decades of precedent for exactly Sightline's model: input recording, deterministic playback, and verification by re-simulation. Keeping tool-assisted runs on a separate board is the policy answer for runs that are legal but not human.

### Inferences
- **A verification pipeline that follows from the findings and the repo's rules:**
  1. The client uploads the recording.
  2. The server re-simulates it headless, in Node, with the recording's embedded tuning and the matching `SIM_VERSION`.
  3. The server recomputes grade and score itself and never trusts the client's numbers.
  4. It rejects any run that diverges, or any `sim.fault`.
  5. It stores the recording so the top runs can be watched and audited, as donadigo's community audit was.
- **Pin the build for the day.** A daily seed must be re-simulated by the build it was played on (rule 11 bumps `SIM_VERSION` on behaviour changes). Either freeze the simulation version for each daily, or keep a re-sim worker per version for the day's window.
- **Enforce the first attempt on the server.**
  - Issue the day's seed with an attempt token when the attempt starts, and make the seed underivable offline from the date. Otherwise players can practise it in the dev build first.
  - Count quitting as an attempt, as the Elusive Target Arcade does.
  - Accept only the recording tied to the first token.
- **Check plausibility, not just legality.** Re-simulation can't see a slowed-down client. Add statistics on input-change rates and on how fast aim reacts to stimuli, and have a human review the top runs. Accept that a determined cheater with a bot needs a TAS-style separate board or a ban, not a technical proof.
- **Gate spoilers.** Show the day's seed replays only after your own submission or after the day closes. That addresses Spelunky's "watch first" problem without banning streaming.

### Gaps
- No developer statement found from Mega Crit on the first-attempt rule, or from Mossmouth on daily cheating beyond the 2013 forum report.
- Nadeo's own technical findings and record counts weren't available; the PC Gamer article on its 15-year review didn't render beyond the headline ([PC Gamer](https://www.pcgamer.com/trackmania-dev-analyses-15-years-worth-of-records-to-root-out-the-cheaters)).
- No source found on how IOI verifies Elusive Target results. They are server-tracked online sessions, so not comparable.
