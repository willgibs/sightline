# The camp as an engine: how it fights back, and how we prove it

A proposal, Nov 8, 2026, answering the owner's questions about how a camp should respond to an attacker. **Nothing here is built.** The calls that belong to the owner are in *Decisions* at the end.

Where it draws from:
- `docs/research/notes/labs/camp_defense.md`: what real defenders do, and what shipped games learned. Every claim has a source and a confidence tag.
- `docs/lab-opportunities.md`: where all five labs test less than the best idea on hand.
- `docs/decisions.md`, *One overlook*: the measurements behind section 1.

## 1. Where the camp stands

The owner's test: "I'm not just popping off a few perfect shots from a position comfortably to win every match." Today, that is what happens.

Measured on 30 fresh generated camps, with everything lab E built awake, and a perfect shooter on the best overview who never moves and fires every 5 s.

| | Today |
| --- | --- |
| Guards down from one perch | 8.7 of 9.6 |
| Rounds the camp fired at him | **0, in all 30 runs** |
| Runs in which any guard ever detected him | **0** |
| Nearest any guard came | a median 272 m, never within 100 m |
| Every marksman dead | a median 6 s after his first shot |
| The camp's estimate of his position, 30 s after his first shot | a median **62 m off** |
| Guards in a clear line from the perch at the moment of the first kill | 4.8, 56% of those left |
| The same, 20 s later | **4.8, 61%** |

A shooter who waits for one clean moment takes the target in 28 of 30 camps. He is never found.

**The camp senses and thinks. It has no hands.** It knows within about 60 m where he is, and it can't do anything about it. Reading the code says why:

- **He can't be seen.** Stance caps every guard's range. Prone, a marksman's 400 m becomes 120 m, or 180 m against the sky. The ridges stand 240–420 m out. Firing shows nothing at all.
- **He can't be reached.** The search map stops 160 m from the camp's centre, so the commander can't send anyone to a ridge. Apart from a guard who wanders out on his own, only the reinforcement squad goes, 90 s after lockdown.
- **He can't be hit.** Every role has the same aim, about 5.8 m of error at 300 m.
- **The gallery never closes.** Nothing gets people out of the shooter's view. Ordering cover made things worse, three ways (*One overlook*), because ad-hoc cover within 12 m doesn't hide anyone from a ridge, and men ran across open ground to reach it.
- **Nothing after the shot counts.** The mission ends when the target falls, so a witnessed kill still wins.

No number can be tuned to fix this. A camp needs ways to reach a shooter, and we need a design for them.

## 2. Three ideas

### Four loops, four speeds

A defended position looks intelligent when several loops run at different speeds, people carry them, and each can be read and cut. (`camp_defense.md`, section 0.)

| Loop | Speed | Who | What it does |
| --- | --- | --- | --- |
| Reflex | 1–2 s | Each man | Gets small, shouts, feels the near miss |
| Drill | 2–30 s | A section | Fixes a direction, suppresses it, covers a move, sends someone round |
| Command | 30 s to minutes | Officer, operator | Assigns roles, calls fires, sends a relief, fuses reports |
| Adaptation | Minutes to the whole mission | The camp | Hardens, changes posture, remembers |

Today the camp has part of the third loop and a little of the fourth. The first two barely exist, and those are what would close the gallery in the seconds that matter. A perfect shooter empties a camp in under a minute, so counter-fire arriving at 30 s can't be the first answer. The first answer is that nobody stays in the open.

### Every capability is a chain, and every link is a thing

Whatever can find or hurt you is a chain: a sensor, a decision, a way to pass it on, and something that acts. Every link is an entity or a piece of state in the simulation, and can be seen, shot, cut or avoided.

```
observer sees a dust puff  →  operator radios it  →  crew lays the tube  →  a spotting round, then fire
  shoot him                   cut the set or         shoot the crew,        hear the tube,
  or stay out of his cone     the generator          sabotage the tube      be somewhere else
```

The radio, the generator and the alarm box already work this way. This idea makes it the rule for everything. "How do I beat this?" becomes "which link?", and the answer depends on where you are and when. Players praise generators, alarms and callers in shipped games, things that are physical and named. They complain about knowledge they can't explain and enemies who arrive in ones and twos (`camp_defense.md`, section 3).

### Honest, legible, and good enough to be watched

- **Honest.** Rule 13 extends to the camp. It acts only on what someone sensed and passed on. Static facts about its own ground, such as which ridges overlook it, are fair: a prepared defender knows those.
- **Legible.** Every response is visible or audible and has a cause `explain()` can name. The camp is predictable in kind, so a plan can be built on it, and not in detail.
- **Good enough to be watched.** Halo's playtests rated tough enemies "very intelligent" far more often than weak ones, because surviving gives the AI time to be seen doing things. A camp that fights back is also a camp that looks smart.

## 3. Seven engines

Each has one job, its own state in `sim.state`, a bench, and a sandbox (section 6). Doctrine is data in tuning (rule 16), so a green garrison and a prepared one are the same engines with different numbers.

| Engine | Its job | Speed | Today |
| --- | --- | --- | --- |
| **Nerve** | What each man can still do under fire | 1–2 s, then seconds to the whole mission | Nothing: a guard is at full strength until he is dead |
| **Drill** | What each man does first, by his role, before anyone tells him | 2–30 s | `cover` within 12 m, in combat or when rounds land close |
| **Picture** | What the camp believes: what kind of attack, from where, how sure | Seconds | One search map and one ellipse |
| **Command** | Turns the picture into a posture and tasks | 30 s to minutes | Levels, five task kinds, capped slots |
| **Means** | What the camp can reach you with, each a chain | Varies | Rifles, the alarm, the radio, one truck |
| **Ground** | The camp's defence plan, drawn when it is generated | At generation | Posts and routines only |
| **Memory** | What changes and stays changed | Minutes to the mission | A level floor, faster check-ins, sharper eyes |

**How this fits the foundation.** Nothing here should need the kernel to change.
- Nerve, Drill, Picture, Command and Memory belong to the brain lane, behind rule 13: percepts in, orders out.
- Ground belongs to generation, on a new random stream in the site frame (rules 3 and 15), so a camp's layout doesn't move when its defence plan is added.
- Means are game entities, with their numbers in tuning (rule 16). A fire mission is a delayed effect on the schedule (rule 12).
- The grid's map layer already covers the whole terrain, so routes to a ridge exist. What's missing is a search window that can go there.
- Smoke is the one new kind of thing: a sight-blocking volume that comes and goes, which the perception lane doesn't have yet.

## 4. The owner's six questions

### How does a camp respond, dynamically and intelligently?

**Command runs "protect, deny, find, fix, finish" against each threat it believes in.** Protect the target. Deny the shooter his targets. Find him. Fix him with fire. Finish him with people. Each goal is a set of capped task slots, filled from whoever and whatever is left.

**Picture says what kind of attack this is,** because the right answer differs: shots from the ridge, someone inside the wire, something broken. It keeps a small list of hypotheses in place of one belief. The prior comes from lab D's perch list, which is static knowledge a mind may read, and the search window follows the fix instead of the camp's centre.

**The order of events is what makes it read as a fight.** The research's lesson from the battle at Wanat is to keep the order and compress the minutes: local fire first, then heavy fire, then whoever comes by road. Reaction order mattered more than reaction speed.

| After his first shot | Who | What | What you notice |
| --- | --- | --- | --- |
| 0–2 s | Each man | Men in the open drop where they stand, or reach defilade if it's within a couple of seconds. Callers and runners keep going | Bodies go down |
| 2–5 s | Nearest gun and rifles | Rake the believed ridge: pressure, not accuracy | Rounds crack past, tracers |
| 3–10 s | Voices, radio | Reports; the picture forms | Shouting |
| 5–15 s | Everyone | **Stand-to:** each man to his fighting position, in dead ground from the believed perch. The target goes to a hard room or his vehicle | The gallery closes |
| 15–30 s | Observer pair | Glass the believed ridge | A glint, if you're looking |
| 20–45 s | Mortar, if there is one | Spotting round, then fire on a registered point | The tube's thump, then seconds to move |
| 22–60 s | Pairs | One goes to inspect the believed perch. Others go for your **way out**, because a moving sniper is at his weakest | Men moving along the treeline |
| ~90 s | Truck | A squad that hunts | Engine on the road |
| Minutes | Work parties | Screens, sandbags, cut brush | Your lanes close |

These are starting numbers from the sources, to be set by play. The drill answers what went wrong when we ordered cover: a man drops only if that's the safe move, a runner keeps running, and the positions are known in advance, so nobody crosses open ground looking for one.

**What gives a shooter away** has to be decided first, since everything above depends on it. The recommendation:
- A **firing signature**: dust and flash that lift the stance cap for a moment for anyone looking that way, less with a suppressor.
- **Optics for observers**: much longer range in a narrow cone. A man glassing the right 30 m of ridge can find you. A sentry looking around can't.
- The same law for both sides. You find his observer exactly the way he finds you.

### How do members operate independently?

Each man already has his own senses and beliefs. Add:
- **Nerve.** Three clocks from three shipped models: suppression that decays in seconds, confidence that holds for minutes, and a lasting flag for someone who has broken. They bend his aim, his senses and which acts he can choose.
- **Standing orders.** Doctrine says what each role does with nobody telling him. Cut the radio and the camp still fights, as individuals, and worse. At Wanat, when leaders fell, others kept functioning, and that depended on training. So training decides how much a dead leader costs.
- **Orders that take time and can fail.** Orders already travel by voice and radio. A shaken man doesn't obey. Self-preservation pre-empts a role.
- **Sections, not a hive mind.** Two to four men near each other form a section with a local leader, as in Days Gone. What one man knows reaches others only by a carrier.

### How do their behaviours affect each other?

Through a small set of carriers, all honest:

| Carrier | What happens | The player's use of it |
| --- | --- | --- |
| Shared confidence | Each man weighs perceived strength on both sides, counting casualties. A panicked man counts for the enemy, so panic spreads | Kill where others can see |
| Leader radius | Men near an officer recover and obey faster. Lose him and the section acts alone | Find him by how others behave |
| Voice and radio | Second-hand knowledge is worse than first-hand, by rule | Cut the net, and each man knows only what he saw |
| Capped roles | One man goes to investigate, two provide cover, and a replacement picks up a dead man's role | Each kill moves a hole |
| A shared front | The section's axis comes from the believed shot bearing. Half move while half cover | Fire from a new direction and the front is wrong |
| Casualties | The wounded cry out. A disciplined section smokes first and then drags; a nervous one stays put | Bait works once |
| Sectors | Someone takes over a dead sentry's sector, leaving another gap | The camp's watch changes shape as you fight it |

### How do they adjust as you progress?

Three timescales:
- **At once, by what's left.** Command re-fills its slots from whoever survives. A camp without its gunner has lost a capability, and you can see which. As numbers fall it shrinks: outer posts come in, then the camp holds the keep or tries to break out with the target.
- **Over minutes, by posture and work.** Posture rises and stays up. Routines stay pure functions of time and posture, so lab D can certify each posture's windows, and they re-phase and re-face toward the likely threat. A work list gets carried out in a set order: sectors, screens across exposed crossings, cut brush.
- **Over the mission, by what it has inferred.** A ledger of what the camp has evidence for: he is long-range, suppressed, north side, goes for officers. Officers stop standing in the open. A repeated trick loses its effect. Across missions this becomes the doctrine table, which stays in Phase 3.

### What do they have at hand to defend?

Each tool below is a chain. Ranked, best first. `First` marks the proposed first set.

| Tool | The chain | You see or hear | How you beat it | |
| --- | --- | --- | --- | --- |
| **Hidden counter-sniper pair** | Observer glasses → tells the shooter → aimed shot | A glint if the sun allows; a changeover | Find him first; kill the observer; stay out of his cone | First |
| **Crew-served gun on a sector** | Any bearing → gunner on the mount → rakes it | Tracers, noise, the mount | Be off the bearing; kill the gunner (someone may take over); use its noise | First |
| **Fighting positions** (Ground) | Generated dead ground for each man | They vanish into known places | Fire from a direction the plan didn't expect | First |
| **Cut-off pairs and the QRF** | Radio → truck or feet → the likely exfil routes | Men moving, an engine | Leave early; ambush them; go where they left | First |
| **Close protection** | Siren → target's detail → hard room or vehicle | The escort forms | Take him before it forms, or go in | First |
| **Mortar with registered points** | Reference points → caller → radio → crew → tube | Plot markers, the thump, a spotting round | Avoid the obvious perch; hit the crew first; use its noise to move | Second |
| **Smoke** | A casualty or a move → someone throws | Smoke screens a move | Change your angle | Second |
| **Decoy heads** | A dummy above a parapet → your bullet's path → a near-exact bearing | A head that never shifts | Watch before you shoot | Second |
| **Observer pairs that tire, with reliefs** | Time on watch lowers their sight; relief walks are visible | A changeover | Shoot at changeover | Second |
| **Hardening** | Time → work party → screens, sandbags | Your lanes close | Speed; shoot the work party | Second |
| **Stay-behind ambush** | Six go out, four come back | Count them | Count them | Later |
| **Flares, searchlights** | Dusk or night | Light | Kill the power | Phase 3 |
| **Dogs** | Scent on the wind | Barking | Use the wind | Phase 3 |
| **Helmets and other doctrine** | Across an operation | Named in the briefing | The design's table | Phase 3 |

### How do you have to act, as an intelligent one-man army?

Every plan on this ladder should be possible, and the outcomes should fall in this order. That tests the design's pillar, "good loses, great wins", which has no measure today.

| Plan | What it does | Expected |
| --- | --- | --- |
| Careless | Walks in, fires loud | Loses fast |
| Perfect and static | Today's bot | **Must lose or fail to finish** |
| Timed one shot | Waits for the clean moment, then stays | Kills him, doesn't get out |
| Shoot and relocate | Moves along dead ground after each engagement | Wins sometimes |
| Chain breaker | Removes the link that matters first: the gun crew, the observer, the radio | Wins often |
| Force and flank | Draws the QRF out, then goes in where they left | Wins often |
| Patient planner | Recon, then all of the above in the right order, then out by a route chosen first | Wins most, cleanly |

Plays we want to exist, and to be able to measure:
- Shoot the crew before they get rounds off.
- Use their own mortar to mask your movement.
- Reveal yourself on purpose to draw the hunter.
- Deliberately miss to pin a runner.
- Kill where others can see, or where they can't, on purpose.
- Fire from a new direction so the front faces the wrong way.
- Ambush the cut-off pair on your own way out.
- Time your shot to the gun's noise.

## 5. What the player's side needs

- **Getting out has to count.** Kill and get out, at least in the sandboxes and the live camp. Without it the camp's response can't matter. Phase 2 makes it the mission's rule.
- **Being shot at has to matter.** `startle()` exists and nothing calls it. Hits and near misses should raise the heart rate. The shot is only ever judged calm today.
- **The relocation network.** Real walking routes between perches, with their exposure. Certification uses a straight line at 2 m/s today.

## 6. Sandboxes: engines you can play

The owner's idea: test engines, and combinations of engines, in small environments that are almost mini-games, so assessing a foundation system is fun and also tells us something. The architecture is unusually good for this. A run is deterministic, every entity has its own random stream, and a run can be saved, restored and forked. Turn one engine off and everything that changes is that engine's doing, and nothing else.

### What a sandbox is

A scene with a seed, a short run (one to five minutes), and four additions:
- **A score** you want to beat, and an instant restart.
- **Engine switches**: any engine can be off. Switches are tuning patches, so recordings embed them and replay exactly.
- **A bot ladder**, so every sandbox runs headless over many seeds. A person's score lands on the same scale as the bots'.
- **Vitals**: the engine's own numbers, in the debug view and the results.

Sandbox runs are pinned on the bench, so a change that kills a behaviour fails CI.

### The set

| Sandbox | You | Score | Engines | What it proves |
| --- | --- | --- | --- | --- |
| **The Duel** | You and one counter-sniper pair, a valley between you, the same rules for both | Who finds whom first, and how fast | Perception, optics, firing signature, ballistics | What gives a shooter away, and that it's symmetrical. Bots can play both seats over thousands of seeds |
| **Hold the Perch** | One perch, the whole response on. How many before you must go, and do you get away? | Kills, weighted by getting out alive | Everything | "Shoot, then relocate", directly. Its first run is today's camp: zero incoming |
| **Dominoes** | A yard of 8–12 men and an officer, five rounds. Break the group | Men pinned or routed per round | Nerve, leader radius, contagion | Men's behaviour affects each other. Near misses work |
| **Pair Shot** | Short vignettes of two to four guards in mutual view at 200–300 m | Clean pairs, and the gap between shots | Ballistics, perception, Drill | The design's signature skill exists at all. There is about 0.2 s of slack today |
| **Break the Chain** | A gun or mortar with its observer, radio and crew is working you over. Stop it | Seconds until silence, more for the cheapest link | Means, comms, sabotage | Each link's loss really stops it, and you can tell which is which |
| **Hunted** | You've fired. Cut-offs and the QRF are out. Reach the extraction point | Time and sightings | Picture, Command, movement | Getting away is a game of its own |
| **Second Front** | Make them look one way, then go the other | Distance inside the wire before anyone looks round | Picture, Command, Means | Forcing them to deploy can be used against them |
| **Be the Camp** | The sides flip. You are the commander, you see only the camp's picture, your orders go at radio speed, and a bot sniper attacks | How long the target lives, or how fast you catch him | Picture, Command, Means | If a person can't stop the bot with these tools and this information, neither can the AI. It gives the commander a human baseline and tests rule 13 from the inside |

### Combinations

- **The mix board.** Any sandbox, any set of engines on or off, as the owner plays or across seeds. You can feel what each one adds.
- **The interaction matrix.** Run every combination of a few engines over the same seeds, and report what each adds alone and what each pair adds together beyond that. It names the failures we most need to catch: a *dead* engine that changes nothing, a *runaway* that decides everything, and a pair that *cancels*. The cover experiment that stopped alarm runs was exactly that third kind, and we found it by accident.
- **The tournament.** Every plan on the ladder against every doctrine, as a payoff table. A plan that beats everything means the game is solved, as the ridge shot is today (best in 29 of 30 reviewers' camps). A doctrine that loses to everything is dead weight.
- **What-if.** Fork a run at any tick, change one thing, compare. At the end of a sandbox: "You'd have lived if you'd left 6 s earlier." It tells necessity from coincidence, separates luck from decisions by reseeding one stream, and seeds Phase 2's debrief.

### A first try, on today's camp

To see whether the idea earns its keep, we switched today's systems off one at a time: the same 16 camps, the same perfect shooter on the best perch, a shot every 5 s.

| Switched off | Guards down, of 9.8 | Target got away | Target shot | Siren sounded |
| --- | --- | --- | --- | --- |
| Nothing | 9.0 | 13 | 1 | 14 |
| The commander | 8.9 | 13 | 0 | 14 |
| The radio | 8.8 | 13 | 0 | 14 |
| The commander and the radio | 9.0 | 13 | 0 | 14 |
| Reinforcements | 9.4 | 13 | 1 | 14 |
| The target's truck | 8.9 | 0 | 8 | 14 |
| The generator | 8.3 | 0 | 1 | 0 |
| The generator and the truck | 8.3 | 0 | 1 | 0 |

It took minutes, and it says more than we knew:
- **The commander and the radio change nothing** against a ridge. Everything lab E built for coordination is a dead engine in this fight.
- **Reinforcements are only more targets.** With them off, he shoots slightly more of the camp's own guards, because the squad stops soaking up his rounds.
- **Only the siren and the truck decide anything.** The one way the camp can beat him is by running the target out.
- **The generator is a single point of failure.** Cut it and the siren never sounds, in any camp. There's no fallback: no runner, no whistle, no backup. A cut that strong may be right for the player, but it should be a choice.
- **The generator and the truck are redundant** together: the second adds nothing once the first is gone. That is the pair analysis, working by hand.

### The numbers an engine has to show

| Vital | What it says |
| --- | --- |
| **Gallery** | Share of standing guards in a clear line from the perch, by seconds since the first shot |
| **Pressure** | Rounds landing within 5 m of the shooter, per minute |
| **Perch life** | Seconds from the first shot until he is hit or found |
| **Relocation value** | How much survival moving 30 m or 100 m buys, by fork |
| **Belief** | The camp's error and sharpness over time |
| **Chain cut** | How far pressure falls when a given link goes |
| **Contagion** | How many men change state per casualty, seen against unseen |
| **Explained** | Share of responses with a whole chain of causes back to something sensed |
| **Dominance** | How far the best plan is ahead of the next, per camp |

## 7. How we'd know it works: a proposed lab

**Lab F · The camp fights back.** Exit test, over held-out camps and every preparedness level:

1. The ladder holds its order. Perfect and static loses or can't finish on 90% of camps that expect attack. The patient planner wins most.
2. No plan is best on more than half the camps.
3. The gallery closes: under 20% of standing guards in a clear line 15 s after a shot, on camps that expect attack. A relaxed camp stays slower.
4. A shooter who stays is under effective fire within a time we set, and moving along dead ground buys back a measured amount.
5. Every capability stops when any one link is cut, and its signature can be read.
6. Every response explains itself back to something sensed. No-omniscience holds after contact, by fork.
7. The owner plays three sandboxes and one camp and can say "I got outplayed", not "I was cheated".

Lab E's test stands alongside this, and E12 ("one overlook doesn't clear the camp") closes here.

## 8. Order of work

Each slice ends with something to play and numbers to read.

| Slice | Builds | Plays as | Size |
| --- | --- | --- | --- |
| **0 · The bench** | Fork, an experiment runner with intervals, the sandbox harness, the vitals | Hold the Perch against today's camp: the "before" | Medium |
| **1 · Can you be found?** | Firing signature, optics, the counter-sniper pair | The Duel | Medium |
| **2 · The gallery closes** | Nerve, Drill, Ground's fighting positions | Dominoes, Pair Shot, Hold the Perch again | Large |
| **3 · The camp reaches out** | Picture, Command, the gun, cut-offs, close protection, get-out rule | Hunted, Break the Chain | Large |
| **4 · The camp remembers** | Mortar, smoke, hardening, Memory, re-phased routines | Be the Camp, Second Front, the tournament, the exit test | Large |

Slice 0 needs no taste calls and helps every lab, so it's the natural start.

## 9. Decisions

Work proceeds on the recommendation unless the owner says otherwise.

| # | The call | Recommended |
| --- | --- | --- |
| 1 | Add Lab F to Phase 1, so *Labs pass* requires it. This moves within-mission means and posture forward from Phase 3. Doctrine across an operation stays in Phase 3 | Yes |
| 2 | Does firing give you away a little: dust and flash that lift the stance cap for a moment? | Yes, less with a suppressor |
| 3 | The mission ends when you get out, not when the target falls | Yes, in sandboxes and the live camp now |
| 4 | Preparedness as a camp property: relaxed, alert, prepared. "A compound expecting attack" is one of them | Yes, three levels, from the mission spec |
| 5 | Does a mortar belong in the setting? | Yes, in prepared camps |
| 6 | Wounds: a leg shot always kills today. Wounded who cry out make casualties a decision | Try it in Dominoes before deciding |
| 7 | When you're shot at: heart rate and sway only, or a screen effect too? | Heart rate and sway only |
| 8 | Hidden traits, such as the odd fanatic who doesn't break, stop players solving morale but cut against "predict the camp" | None to begin with: training is visible |

## 10. Beyond the camp

`docs/lab-opportunities.md` lists 53 opportunities across the labs, ranked, each with its source. Those most worth taking:

- **A and C · The trial briefs name what the honest view should show.** "You crouch-walk in the tall wall's shade, 40 m from a sentry" tells the player the factors being tested. An unlabelled variant proves shade and range can be read. It is small, and cheapest before the owner's first sitting.
- **D · Every rifle hit is heard camp-wide, suppressed or not.** A body hit's 650 m thump raises every listener to searching. The sightline graph, the game's first stated idea, has never been checked against what guards really sense.
- **B · The pair shot has about 0.2 s of slack, by arithmetic on the tuning,** and nobody has tried it (Pair Shot, above).
- **D · Certified ways in assume guards ignore their own meter.** A real guard turns at 30%.
- **Shared · An experiment runner.** The numbers behind an owner's call should be one command away.
