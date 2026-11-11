# The camp as an engine: how it fights back, and how we prove it

The design for Lab F, Nov 8, 2026, answering the owner's questions about how a camp should respond to an attacker. The owner has made the three biggest calls (section 10). What's built is ticked off in `docs/phase-1-plan.md`, Lab F; everything else below is still a design.

Where it draws from:
- `docs/research/notes/labs/camp_defense.md`: what real defenders do, and what shipped games learned. Every claim has a source and a confidence tag.
- `docs/lab-opportunities.md`: where all five labs test less than the best idea on hand.
- `docs/decisions.md`, *One overlook*: the measurements behind section 1.

**Read section 9 first if you only read one thing.** Two independent reviews on Nov 8, one as a game designer and one as an engine programmer, kept the core idea and changed what comes first. Section 12 has what they found.

## 1. Where the camp stands

The owner's test: "I'm not just popping off a few perfect shots from a position comfortably to win every match." Today, that is what happens.

Measured on 30 fresh generated camps, with everything lab E built awake, and a perfect shooter on the best overview who never moves and fires every 5 s. `npm run experiment -- friction` and `-- gallery` reproduce these.

| | Today |
| --- | --- |
| Guards down from one perch | 8.7 of 9.6 |
| Rounds the camp fired at him | **0, in all 30 runs** |
| Runs in which any guard ever detected him | **0** |
| Nearest any guard came | a median 272 m, never within 100 m |
| Every marksman dead | a median 6 s after his first shot |
| The camp's estimate of his position, 30 s after his first shot | a median **74 m off**, counting the runs where it had none |
| Share of standing guards in a clear line from the perch at the first kill | 56% |
| The same, 20 s later | **61%** |

A shooter who waits for one clean moment takes the target in 28 of 30 camps. He is never found.

**The camp senses and thinks. It has no hands.** It knows roughly where he is, and it can't do anything about it. Reading the code says why:

- **He can't be seen.** Stance caps every guard's range. Prone, a marksman's 400 m becomes 120 m, or 180 m against the sky. The ridges stand 240–420 m out. Firing shows nothing at all.
- **He can't be reached.** The search map stops 160 m from the camp's centre, so the commander can't send anyone to a ridge. Apart from a guard who wanders out on his own, only the reinforcement squad goes, 90 s after lockdown.
- **He can't be hit.** Every role has the same aim, about 5.8 m of error at 300 m.
- **The gallery never closes.** Nothing gets people out of the shooter's view. Ordering cover made things worse, three ways (*One overlook*): men hid from one believed point, which rarely hides them from the real one, and they crossed open ground to do it.
- **Nothing after the shot counts.** The mission ended when the target fell, so a witnessed kill still won. Even with a way out to reach, the nearest edge of the valley is a 92 s walk from the perches that can see the target (`npm run experiment -- way-out`), and nothing the camp does could interrupt that. So the way out is the end of the road: about five minutes on foot, and the way the reinforcements come in.

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
| 5–15 s | Everyone | **Stand-to:** each man to his fighting position, in dead ground from the believed perch, or behind a parapet where he's a smaller target. Tower men stay and fight. The target goes to a hard room or his vehicle | The gallery closes |
| 15–30 s | Observer pair | Glass the believed ridge | A glint, if you're looking |
| 45–60 s | Sections | **Stand-to ends.** Hiding doesn't win a fight, so sections move: sweep toward the believed perch, walk the target's escort out, fetch the casualties | Men come back into the open, doing something |
| 20–45 s | Mortar, if there is one | Spotting round, then fire on a registered point | The tube's thump, then seconds to move |
| 22–60 s | Pairs | One goes to inspect the believed perch. Others go for your **way out**, because a moving sniper is at his weakest | Men moving along the treeline |
| ~90 s | Truck | A squad that hunts | Engine on the road |
| Minutes | Work parties | Screens, sandbags, cut brush | Your lanes close |

These are starting numbers from the sources, to be set by play. The drill answers what went wrong when we ordered cover: a man drops only if that's the safe move, a runner keeps running, and the positions are known in advance, so nobody crosses open ground looking for one.

**Can a camp really get out of the way? Yes, if it knows its own ground.** Measured over 24 camps, three perches each (`npm run experiment -- dead-ground`), for the 44% of guard positions a perch can see:

| How a man picks where to go | Reached within a 2 s run | Within 5 s | Really hidden from the shooter |
| --- | --- | --- | --- |
| He knows the exact perch | 100%, a median 2 m | 100% | 100% |
| He hides from one believed point, 30 m wrong | 100% | 100% | **30%** |
| He hides from every *listed* perch near what the camp believes, 60 m wrong | 70% | 90% | **100%** |
| The same, from the bearing alone | 60% | 90% | **100%** |
| The same, and the shooter is somewhere the list doesn't have | 70% | 90% | 80% |
| He runs for the nearest roof | 50% | 80% | 30% |

So the ground is there. Hiding from one guessed point is what fails, and that is what we tried. A man who hides from every perch the camp's own range card lists in that direction is safe, a few metres away. Lab D already computes those perches. Ground stores which perches see which spots, so choosing costs no rays in play. It also gives the player something to find: a firing point the camp's list doesn't have leaves one man in five in the open.

**Hiding can't be the end of it.** Hidden men can't shoot you either, and the nearest perch that exposes half of them again is a median 353 m away: two minutes on foot. So stand-to has to expire, and the camp has to come back out with a job to do. That is the rhythm: you shoot, they vanish, you move while they hunt, and they're out again when you next have a line.

**What gives a shooter away** has to be decided first, since everything above depends on it. The recommendation:
- A **firing signature**: a discrete flash with a bearing, seen by anyone looking that way, handled like a lens glint. It can't go through the detection meter: a one-second lift at 300 m fills a few percent of it. A suppressor shrinks it, and needs a cost of its own, or it simply stays on.
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
| **A signal you can hear** | First man to react → whistle or horn code, heard at 600 m | Whistle blasts across the valley | Kill the man before he blows it; it needs no power, so it's also the generator's fallback | First |
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
| **Shoot once and leave** | Takes the clean moment, then walks off | **Must not win.** It's what wins today |
| Perfect and static | Today's bot | **Must lose or fail to finish** |
| Timed one shot | Waits for the clean moment, then stays | Kills him, doesn't get out |
| Shoot and relocate | Moves along dead ground after each engagement | Wins sometimes |
| Chain breaker | Removes the link that matters first: the gun crew, the observer, the radio | Wins often |
| Force and flank | Draws the QRF out, then goes in where they left | Wins often |
| Patient planner | Recon, then all of the above in the right order, then out by a route chosen first | Wins most, cleanly |

Today's camp, with the first fight in it and person-limited shooters (`npm run experiment -- ladder`, 16 camps × 3 rolls of the dice, the mission's rule): shoot once and leave wins 27 of 48 (10 shot dead on the way), shoot and relocate 13, careless 7, and the perfect static shooter none, because he can't get out. That isn't yet the order the table wants. `docs/decisions.md`, *The lab bench finished*, has the rest.

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
- **Being shot at has to matter.** Today nothing a bullet does near you changes anything. A raised heart rate alone isn't enough: at the worst of it, prone and rested, sway stays under 9 cm at 300 m. A near miss should knock the rifle off its rest, so you have to settle again.
- **You need your own picture.** The scope covers 19 m at 290 m: one building, three men at most. Bare-eyed, a man is 6–8 pixels and they all look alike. So what the camp does has to reach you by ear, and roles have to show in what men carry. Marking through the binoculars comes forward from Phase 2.
- **The relocation network.** Real walking routes between perches, with their exposure. Certification uses a straight line at 2 m/s today.

## 6. Sandboxes: instruments for proving engines

The owner's idea: test engines, and combinations of engines, in small environments that play almost like mini-games. They're development instruments, for our near-term purposes of testing, proving and hardening the foundation. They aren't features: no scoreboards, no polish, nothing that has to last. Each can be retired when it has done its job. Developer tooling and lab architecture get built as freely as this needs.

The architecture is unusually good for this. A run is deterministic, every entity has its own random stream, and a run can be saved, restored and forked. Turn one engine off and everything that changes is that engine's doing.

### The compound simulator comes first

The owner's framing, Nov 8: the camp in its core form has no player in it. `?scene=compound` is a live camp, a fly camera, and keys that drop a noise, a body, a shot from where you are, a guard dropping, or equipment going dead, wherever you're pointing. A person can watch the whole defence answer, in real time, from any angle. Attack scripts (`src/sim/game/attacks.ts`) do the same headless. Flaw detectors (`src/lab/flaws.ts`) watch each run and flag what a defender plainly wouldn't do: standing in the shooter's line, a tower that doesn't answer, men stuck or piled up, a camp that never comes back out. `npm run flaws -- <seed> <attack>` lists each moment with the address to watch it. The number to drive to zero is `npm run experiment -- flaws`. See `docs/pillars.md`.

### What a sandbox is

A scene with a seed, a short run (one to five minutes), and four additions:
- **A goal and a number**, so that a run has a point, and an instant restart.
- **Engine switches**: any engine can be off. A switch is a scene parameter (`off=radio,alarm`), so a recording names it and re-simulates it. It makes the part absent, as if the camp had never had it: nobody discovers a dead set. It leaves the system in place doing nothing, so everything else keeps its order.
- **A bot ladder**, so every sandbox runs headless over many seeds. A person's score lands on the same scale as the bots'.
- **Gauges**: what the camp is doing to you, the same ones for a person and for a bot. `&lab` in the address shows them, and the switches, beside the game.

Sandbox runs are pinned on the bench, so a change that kills a behaviour fails CI.

### The set

| Sandbox | You | Score | Engines | What it proves |
| --- | --- | --- | --- | --- |
| **The Duel** | You and one counter-sniper pair, a valley between you, the same rules for both | Who finds whom first, and how fast | Perception, optics, firing signature, ballistics | What gives a shooter away, and that it's symmetrical. Bots can play both seats over thousands of seeds |
| **Hold the Perch** | One perch, the whole response on. How many before you must go, and do you get away? | Kills, weighted by getting out alive | Everything | "Shoot, then relocate", directly. Its first run is today's camp: zero incoming |
| **Dominoes** | A yard of 8–12 men and an officer, five rounds. Break the group | Men pinned or routed per round | Nerve, leader radius, contagion | Men's behaviour affects each other. Near misses work |
| **Pair Shot** | Short vignettes of two to four guards in mutual view at 200–300 m | Clean pairs, and the gap between shots | Ballistics, perception, Drill | The design's signature skill exists at all. There is about 0.2 s of slack today, and a man who drops takes your aim with him |
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

To see whether the idea earns its keep, we switched today's systems off one at a time: the same 30 camps, the same perfect shooter on the best perch, a shot every 5 s (`npm run experiment -- switch-off`, two minutes).

| Switched off | Guards down, of 9.6 | Target got away | Target shot | Siren sounded |
| --- | --- | --- | --- | --- |
| Nothing | 8.7 | 22 | 3 | 25 |
| The commander, and so reinforcements | 8.5 | 23 | 0 | 25 |
| The radio | 8.5 | 23 | 1 | 25 |
| The commander and the radio | 8.5 | 23 | 1 | 25 |
| The alarm boxes | 8.3 | 0 | 12 | 0 |
| Reinforcements | 9.0 | 22 | 3 | 25 |
| The target's truck | 8.3 | 0 | 13 | 25 |
| The generator, cut before the run starts | 7.9 | 0 | 4 | 0 |
| The alarm boxes and the truck | 8.3 | 0 | 12 | 0 |

It says more than we knew:
- **The commander and the radio change nothing** against a ridge. Everything lab E built for coordination has nothing to reach him with.
- **Reinforcements are only more targets.** Without them he drops slightly more of the camp's own guards, because the squad stops soaking up his rounds.
- **Only the siren and the truck decide anything.** The one way the camp can beat him is by running the target out, and it needs both.
- **The generator is a single point of failure.** Cut it and the siren never sounds, in any camp. There's no fallback: no runner, no whistle, no backup. That's why cuts should degrade the camp and force a visible fallback, instead of ending the fight.
- **Some pairs are redundant.** Once the alarm boxes are gone, taking the truck as well changes nothing. That's the pair analysis, done by hand.

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

## 7. Human-playable, at every step

Simulations say what's possible. They can't say whether it plays. A camp can be perfect on paper and miserable through a scope, so:

- **Nothing is done on bot numbers alone.** Every slice ends with something the owner can play in a few minutes on the public build, with two or three questions. A slice isn't finished until the numbers and a person agree.
- **Bots are limited to what a person can do.** The perfect shooter stays, as the upper limit of what one perch could ever do. Decisions rest on a person-limited shooter: seconds to find a target, range it and hold; some misses; and knowing only what the honest view shows.
- **Every threat has a human budget.** For anything that can hurt you, the cue, the moment to take it in, and what you'd do about it must fit inside its lead time, and a test holds that, as `tests/fairness.test.ts` does for a guard's meter.
- **It has to read through a scope.** You watch a camp through a straw. Whatever you need to know reaches you through what's in view or through your ears: shouts, the siren, the gun, a crack overhead. Anything you must read gets drawn at the range it matters, with `npm run look`, and judged.
- **Frame rate is a real machine's.** New per-tick work is counted on the bench, and the owner checks it in the browser.
- **Sittings keep their evidence.** The dev build saves each run for `npm run playtest`, and M marks anything that can't be explained.

## 8. How we'd know it works: the lab

**Lab F · The camp fights back.** Exit test, over held-out camps and every preparedness level:

1. The ladder holds its order. Shoot once and leave doesn't win on camps that expect attack. Perfect and static loses or can't finish on 90% of them. The patient planner wins most.
2. No plan is best on more than half the camps.
3. The gallery closes: under 20% of standing guards in a clear line 15 s after a shot, on camps that expect attack. A relaxed camp stays slower.
4. A shooter who stays is under effective fire within a time we set, and moving along dead ground buys back a measured amount.
5. Every capability degrades when a link is cut, and the camp visibly falls back: a runner for a dead radio, a whistle for a dead siren. No single cut wins by itself, or the generator would be everyone's opening move.
6. Every response explains itself back to something sensed. No-omniscience holds after contact, by fork.
7. The owner plays three sandboxes and one camp and can say "I got outplayed", not "I was cheated".

Lab E's test stands alongside this, and E12 ("one overlook doesn't clear the camp") closes here.

These are scored with the person-limited shooter, not the perfect one, and every number is for guards who aren't on a tower: tower men hold 22% of the posts and can't leave them.

## 9. Order of work

**A person feels it first.** Nothing past the bench gets built on the numbers alone.

| Step | Builds | What you play | Size |
| --- | --- | --- | --- |
| **0 · The bench** | Done: experiments, switches, gauges, the panel, the way out, forking a run, re-rolling the dice on one camp, a shooter limited to what a person can do, a fight pinned on the bench | Today's camp with the panel on: the "before" | Medium |
| **1 · The first fight** | Built: a whistle you can hear, men who leave the line and come back, tower men who fire back, near misses that knock you off your rest, a muzzle flash anyone looking can see. The compound simulator and its flaw detectors. So far: a perfect shooter's kills fall from 8.7 to 7.0 of 9.6, and the share of guards in his line 20 s after a shot from 61% to 41% | The compound simulator first, then a real perch. Fifteen minutes, three questions: what did the camp do, why did you move, what would you do next? | Medium |
| **2 · The camp hunts** | Done: stance for guards, routes that reach the ridges, and the firefight (2a, below). Still to come: Picture and Command, sections that sweep, cut-offs on the road, the fallbacks | Getting out, with someone coming | Large |
| **3 · The camp has means** | The counter-sniper pair and the optics law, a crewed gun, close protection, role tells and marking, preparedness levels | Break the Chain, The Duel | Large |
| **4 · If play asks for it** | Mortar, smoke, hardening, Memory, decoys, Second Front, Be the Camp, the tournament | | Large |

Step 4 waits for evidence. The owner named artillery, so the mortar stays on the list, but building it before anyone has felt step 1 would be guessing.

### Step 2 in detail: what it has to change

The bench says what's wrong, and it isn't the first 30 seconds any more. After the first shot, nothing the camp does reaches the shooter:

- **Moving buys nothing.** Forked 2 s after his first shot, moving 30 m or 100 m changes no number: about 3 rounds at him, no detection, nobody within 250 m (`npm run experiment -- relocate`).
- **Shoot once and leave wins**, 31 of 48 runs, and it walks out (`npm run experiment -- ladder`).

So the job of step 2 is that the camp comes after him, in a way he can see coming and get ahead of. Routes to the ridges and stance for guards are done. The rest, in order:

1. **Picture: firing points, not one ellipse.** The fused bearings pick out listed perches under them, each with a weight. With no news the weight spreads, to neighbouring perches and toward the ways out, because a shooter who's stopped firing has probably moved. A fresh shot re-fixes it. The list is the camp's range card, which it's fair for it to know.
2. **Command: find, cut off, fix.** When a stand-to ends the men who come out have jobs. A pair goes to each of the top firing points, a pair or the truck goes to each way out, and the tower men and marksmen keep the fix under fire and glass. Each is a capped slot, filled from whoever's left, so every man you kill leaves a visible hole.
3. **Sections that sweep.** Two to four men move as a section with a shared front taken from the bearing, half moving while half watch, so a shooter who waits for them has a target that shoots back. What they reach, they clear with their eyes, through perception, and the map remembers.
4. **Fallbacks.** Cut the radio and sections act on their last order and shout. Lose the officer and the plan gets sloppier, by rule. Nothing stops dead when one link is cut.

**How we'll know**, all on the person-limited shooter:

| Number | Today | Wanted |
| --- | --- | --- |
| Shoot once and leave wins (`ladder`) | 31 of 48 | Under a third, and only by a route he chose before firing |
| Staying put after the first shot | Never found | Found within about 2 minutes, nearly always |
| Moving 100 m right after the shot (`relocate`) | Changes nothing | Clearly better than staying, on the nearest hunter and on being found |
| Shoot and relocate (`ladder`) | 10 of 48 | Better than shooting once and leaving |

**What you play:** a real perch (`?scene=live-camp&params=seed=LEB-2534%26perch=1&lab`), one shot, then get out. It should feel like being hunted, and the way out should be something you have to think about before you fire.

### The owner's brief for what comes next (Nov 10)

From playing the takedown and the live camp, and two answers on the desk. It was scheduled for after the weekly limit reset. The owner's usage was reset early, so it began on Nov 11: the first part of 1 is built (*Step 2a*, below), 3 is being finished alongside it, and the rest follows in this order.

**1. A camp that responds in phases (step 2).** Today men take cover and look where a shot came from, and it ends there. Walk through a camp and they neither converge nor follow; break their line of sight and they stop.
- **Not knowing where the threat is:** cover from the rough direction first, then work out what's happening. Men near a shot come in slowly, to deal with the nearer threat.
- **Knowing:** "threat identified, combat engaged". An intelligent gunfight by trained men: no running to a corner to hide, and they follow someone who breaks contact.
- **Never a ring.** Once the attacker's position is known, the camp doesn't converge on one spot. Men fight from established cover, work out the problem and improve their positions: "a more realistic, methodical response than blindly running into the fire". That gives the player time to make a push.
- It's the other half of the owner's shoot-and-circle note, and has to answer it on the person-limited shooter and in a sitting.

**2. The target answers by the camp's problem** (the owner's call on `core-challenge`). Some camps keep the target inside and others make the target run, so that play "can't be reduced to always cutting a radio or disabling a vehicle". A leader expecting to win from a stronghold hunkers down. The condition: "there needs to be a clear method to the madness". A player who lost has to be able to say what they should have read, so the tells are designed with it, and read before the end of a run. The takedown's stages (`?scene=takedown`) are the parts to build from.

**3. Levels (two storeys).** The second half of compound types (`docs/compound-types.md`, *Where this stands*: built and measured on Nov 11, ahead of the other two, and waiting on the owner's sitting). Taller buildings hide men from a perch and add vertical range to read. The limit: "I don't want to have to go clear every corner of every building to claim success."

**Behind all of it:** realistic on both sides. A fence gives the view outward but stops no pot shots, so a camp that expects attack needs a real layer of walls. Defenders shouldn't make "the dumb decisions laughably made in most horror movies", and players shouldn't be left banging their heads against a wall either.

### Step 2a, built: the firefight (Nov 11)

`brain/firefight.ts` and `brain/positions.ts`. Only a camp with `firefight` does it (`off=firefight` plays the camp as it was), and only men who fight and aren't on a tower.

**What was wrong.** A man who lost sight of an intruder ran to the nearest thing that hid him and stayed there for the stand-to, 45 to 60 s. One who could see him stood in the open to shoot, or stopped to make a radio call. Nobody followed. That's the owner's walk into a camp, and it's why circling one worked.

**A man is in a firefight when he knows where someone close is:** within 130 m of him, and to within 25 m. He knows by his own eyes, a muzzle flash he saw, a report close enough to place, or a contact someone called. A sniper on a ridge is still the drill's business (step 1).

**What he does, in phases:**

| Phase | What he does | What you see |
| --- | --- | --- |
| Cover | To a *position*: somewhere that hides him kneeling, with a place to look and fire from. Behind something low that's the same spot stood up; behind something tall, a step out to one side | Men running for the nearest wall, not all for the same one |
| Find | Up to look at where he believes you are for 2.6 to 4 s, down for 1.6 to 3.4 s | Heads coming up at places you can learn |
| Fight | In sight: three aimed rounds, then down. A round striking within 4 m keeps his head down 2.5 to 5 s | You can pin a man, and move while he's down |
| Follow | With no view of his own for long enough, one man shouts "Moving!" and goes a bound at a time to where he can see the place. If it's empty he goes on the way you were heading, four bounds and no farther than 90 m from his post | You hear him say it. Whoever heard him keeps watching |

**Four rules carry it.**

- **Firing back at the flash.** A man with a line to a place he's sure of (a flash he saw, the man himself, a report near enough to place to within 9 m) fires at it for 4 s after, with nobody in his sights. A shot from somewhere costs something: rounds come back at where it was fired from. A place he was only told of isn't sure enough to shoot at.
- **A figure where he expects one is the man.** His eyes alone take about 5 s to be sure of someone at 70 m, which is right for a man who isn't expecting anyone, and longer than a look over cover lasts. A man who has news of you there within 12 s takes what he glimpses there for you. Perception's law is untouched: this is what a brain does with a glimpse.
- **Covered ways, or he doesn't go.** A man who isn't running for his life moves by routes that cost five times as much on ground in your view, and never crosses more than 10 m of it at a stretch (30 m while someone has you in his sights and is saying so). If there's no such way nearer, he doesn't run at a man who's waiting for him. He holds, and the hunt is the camp's (step 2b).
- **The likeliest man goes first.** The keener his role and the nearer he is, the sooner his turn comes, so he has said he's moving before the next man's does. Two who say it at once settle it by who heard whom. Men out of earshot of each other may both go, from different sides.

**Nobody crosses the camp.** A position is within 26 m of where a man stands if he has to get out of sight, and up to about 48 m if he's out of it already and going for a view, so the camp fights from where it is. That's the owner's "the whole enemy camp doesn't just converge into one location as a ring".

**Nobody fires with one of his own in front of his muzzle.** Firing back at a place put two men in sixteen camps in front of their own side's rounds. A brain knows nothing of where its own side is, but a man sees who's in front of his rifle, so it's settled where the round is made (`game/combat.ts`): he holds his fire.

**Honest.** All of it is decided from a mind (rule 13). Where you are reaches a man by his senses or by someone's voice, and who's moving reaches him by hearing it said. Cut the radio and the men in earshot still fight as one; the rest never hear of it.

**Measured** (`npm run experiment -- firefight`, 16 of the takedown's camps, the same seeds before and after, played by bots limited to what a person can do):

| | Before | With the firefight |
| --- | --- | --- |
| Circling: shot dead on the walk | 10 of 16 | 15 of 16 |
| Circling: got all the way round | 6 of 16 | 1 of 16 |
| Circling: men down from the walk | 2.5 | 2.1 |
| Circling: rounds at him | 10.6 | 16.3 |
| Contact from outside the wire: men he put down | 3.1 | 2.3 |
| Men who left their own ground (over 45 m) | 1.9 | 1.1 |
| Men shot by their own side | 0 | 0 |

And the walk in itself (`npm run scene -- firefight`): someone stands in front of a guard until he's seen, then goes behind the nearest thing that hides him from every post. Before, nobody goes after him. Now a man who had no view says he's moving, works round, and has eyes on him about 20 s after he went to ground, while the man who first saw him keeps him busy, and nobody else leaves his place.

**What it doesn't do yet, and where each belongs.**

- **Outside the wire nobody follows.** Across an open field there's no covered way, so they hold and shoot. Going out after someone is a section's job, by dead ground or by truck: step 2b.
- **One man goes, alone.** A pair bounding in turn, with covering fire on the place, needs a man to know where his own side is, which a mind doesn't yet (`docs/foundation-review.md`, "People should be one kind of thing"). Until then nobody fires blind at a place someone has said he's moving on.
- **Tower men are as they were:** upright on an open deck, and the first to die. A parapet and the counter-sniper pair are step 3.
- **The first man up still dies** to someone already aiming at his spot. That's fair to a careful player, and it's why a careless one still gets three or four men before he's stopped.

**Dials a person should set by playing,** all in `tuning.brain.firefight`: how well they shoot from a position (`spreadDeg`, 0.6°: about one round in two on a standing man at 50 m), how long a look lasts, how long a near miss pins a man, and how far a man will follow.

## 10. Decisions

**Decided by the owner, Nov 8:**
1. Lab F joins Phase 1, and *Labs pass* requires it. Within-mission means and posture move forward from Phase 3. Doctrine across an operation stays in Phase 3.
2. Firing gives you away a little: dust and flash that lift the stance cap for a moment, less with a suppressor.
3. A mission ends when you get out, not when the target falls.
4. Each seed is generated from a decisive problem, replacing the guarantee that a perch can see the target (`docs/decisions.md`, *The world pillar*). The Nov 8 call that chose the camp's reactions over the generator stands for how a camp fights, and this one answers what it's defending.
5. Step 2 waits for the owner's sitting on step 1 (Nov 9).

**Still open.** Work proceeds on the recommendation unless the owner says otherwise.

| # | The call | Recommended |
| --- | --- | --- |
| 4 | Preparedness as a camp property: relaxed, alert, prepared. "A compound expecting attack" is one of them | Yes, three levels, from the mission spec |
| 5 | Does a mortar belong in the setting? | Yes, in prepared camps |
| 6 | Wounds: a leg shot always kills today. Wounded who cry out make casualties a decision | Try it in Dominoes before deciding |
| 7 | When you're shot at, what happens to you? | A near miss knocks the rifle off its rest and raises your heart rate. No screen effects |
| 9 | Tower men can't leave their towers. Do they stay and fight from behind a parapet? | Yes |
| 10 | Should a camp that expects attack keep its target out of the open, so the ridge shot isn't there for free? | Yes, by preparedness level |
| 8 | Hidden traits, such as the odd fanatic who doesn't break, stop players solving morale but cut against "predict the camp" | None to begin with: training is visible |

## 11. Beyond the camp

`docs/lab-opportunities.md` lists 53 opportunities across the labs, ranked, each with its source. Those most worth taking:

- **A and C · The trial briefs name what the honest view should show.** "You crouch-walk in the tall wall's shade, 40 m from a sentry" tells the player the factors being tested. An unlabelled variant proves shade and range can be read. It is small, and cheapest before the owner's first sitting.
- **D · Every rifle hit is heard camp-wide, suppressed or not.** A body hit's 650 m thump raises every listener to searching. The sightline graph, the game's first stated idea, has never been checked against what guards really sense.
- **B · The pair shot has about 0.2 s of slack, by arithmetic on the tuning,** and nobody has tried it (Pair Shot, above).
- **D · Certified ways in assume guards ignore their own meter.** A real guard turns at 30%.
- **Shared · An experiment runner.** The numbers behind an owner's call should be one command away.

## 12. What the reviews found

Two independent reviews, Nov 8. The notes are theirs. What changed in this design is marked.

**As a game designer** (checked on 30 camps and through the real scope; feel only reasoned): right problem and core idea, wrong centre of gravity.

| Finding | What changed |
| --- | --- |
| The fight is skippable: every row of the response starts after a shot that may already have won, and nobody stays to be punished | The way out moved to the end of the road. "Shoot once and leave" is the first plan on the ladder, and it must not win |
| Hiding ends the game: hidden men can't shoot you either, and 92% of exposed men can hide from a whole ridge within 5 s | Stand-to ends at 45–60 s and sections come back out with a job. Parapets make smaller targets, not none |
| The camp gets a picture and you don't: voices stop at 60 m, the scope covers 19 m, everyone looks alike | A whistle code heard at 600 m, role tells, marking brought forward |
| Incoming fire doesn't bite | A near miss knocks the rifle off its rest |
| "Stops when any link is cut" makes the generator everyone's opening move | Cuts degrade the camp and force a visible fallback |
| A firing signature through the meter does nothing at range; a free suppressor stays on | A discrete flash with a bearing. The suppressor needs a cost |
| The order is wrong: nobody has played any of this | A person's hands come before the rest of it (section 9). The Duel waits, because bots don't search the way eyes do |

**As an engine programmer** (measurements run; some items only read): yes, it can be built well here. What would have bitten:

| Finding | What changed |
| --- | --- |
| Routes to the ridges mostly fail: 192 of 704 found none, because routing starts on the coarse layer, where indoors is a sealed pocket | Step 2 routes out through the fine layer first |
| Nothing caps route-finding in a tick: the worst tick today took 56 ms | A node allowance, and a camp fight pinned on the bench |
| The firing signature can't work through the meter; optics need a zone of their own | As above; the discrete flash comes first |
| Guards can't change stance, and they're all drawn standing | An optional stance in their orders, and in the snapshot |
| Towers hold 22% of guards, and a scripted stand-to that was told the exact perch stalled at 34% of guards in view | Tower men stay and fight, and the exit test counts the rest |
| Lab D's raster isn't the truth: 28% of cells it calls dead have a clear real line | Every candidate position is checked with real rays |
| Switches were events, not absences: switching off the radio made a camp uneasy before the first shot | Fixed: a switch now makes a part absent, and the table above was re-run |
| Forking has traps: bots keep memory, and the recorder refuses to start mid-run | Fork is built as re-simulation plus an intervention |
| Dice can't be re-rolled on one camp, and one fork proves nothing | A salt in the tuning. The experiment runner pairs by seed |
| Bots are handed the whole simulation | A view limited to what a player could see |
| Guards' rifles keep a 100 m zero, 0.52 m low at 300 m, and bullets can hit their friends | Aim is solved per shot, spread goes per role, and a guard won't fire through a friend |
| CI is near its limit on Windows | One canary per sandbox in CI; the ladders run weekly |
