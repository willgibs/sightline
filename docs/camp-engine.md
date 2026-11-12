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
| **2 · The camp hunts** | Done: stance for guards, routes that reach the ridges, the firefight (2a, below) and the hunt (2b, below): the camp places a shooter and sends a section after him. Still to come: cut-offs on the road, the relief as a second section, a hunt without the radio | Getting out, with someone coming | Large |
| **3 · The camp has means** | Built: the target's answer by the camp's problem, and engines you can hear (3a, below). To come: the counter-sniper pair and the optics law, a crewed gun, close protection, role tells and marking, preparedness levels | Break the Chain, The Duel | Large |
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

**Where those stand** (Nov 12, `npm run experiment -- ladder`, 16 camps, one roll each, with the firefight, the hunt and buried targets on `main`):

| Plan | Wins | The target shot | Shot dead himself | Men he put down |
| --- | --- | --- | --- | --- |
| Careless: walks in shooting | 0 of 16 | 0 | 2 | 3.6 |
| Shoot once and leave | 1 of 16 | 2 | 1 | 0.2 |
| Perfect and static | 0 of 16 | 2 | 0 | 5.9 |
| Shoot and relocate | 1 of 16 | 2 | 3 | 2.4 |

No plan from a perch wins any more, and the reason is the generator's more than the camp's reactions: a camp buries its target, so he can be shot from a perch on 2 camps of 16. The mission is won by going in or by making him run, and this ladder has no plan that does either: that is what it lacks.

Two things about the instrument, found on the way. Since the walled camps landed, the careless walker couldn't find a way in to 4 of these 16 camps: the valley's map has no way through a gate narrower than its cells, so he stood at the valley's edge for the whole run, and asked for a route on every step, which made those runs take hours. He now takes the navigator's way in, as the camp's own men would, and a walk with nowhere to go asks again every five seconds.

**What you play:** a real perch (`?scene=live-camp&params=seed=LEB-2534%26perch=1&lab`), one shot, then get out. It should feel like being hunted, and the way out should be something you have to think about before you fire.

### The owner's brief for what comes next (Nov 10)

From playing the takedown and the live camp, and two answers on the desk. It was scheduled for after the weekly limit reset. The owner's usage was reset early, so it began on Nov 11: the first part of 1 is built (*Step 2a*, below), 3 is being finished alongside it, and the rest follows in this order.

**1. A camp that responds in phases (step 2).** Today men take cover and look where a shot came from, and it ends there. Walk through a camp and they neither converge nor follow; break their line of sight and they stop.
- **Not knowing where the threat is:** cover from the rough direction first, then work out what's happening. Men near a shot come in slowly, to deal with the nearer threat.
- **Knowing:** "threat identified, combat engaged". An intelligent gunfight by trained men: no running to a corner to hide, and they follow someone who breaks contact.
- **Never a ring.** Once the attacker's position is known, the camp doesn't converge on one spot. Men fight from established cover, work out the problem and improve their positions: "a more realistic, methodical response than blindly running into the fire". That gives the player time to make a push.
- It's the other half of the owner's shoot-and-circle note, and has to answer it on the person-limited shooter and in a sitting.

**2. The target answers by the camp's problem** (the owner's call on `core-challenge`; built Nov 11, *Step 3a* below). Some camps keep the target inside and others make the target run, so that play "can't be reduced to always cutting a radio or disabling a vehicle". A leader expecting to win from a stronghold hunkers down. The condition: "there needs to be a clear method to the madness". A player who lost has to be able to say what they should have read, so the tells are designed with it, and read before the end of a run. The takedown's stages (`?scene=takedown`) are the parts to build from.

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

**Cover is judged from where the intruder is, including how high.** On the ground a man takes the intruder's eyes to be 1.3 m up, whatever the intruder is doing. Someone believed to be more than 2.4 m above the ground (a tower's deck, an upper window) is judged from there: his line to a man's head climbs toward him, so a low wall hides only what's close behind it. Asked as if he stood on the ground beneath, one position in eight on the camps tried was in his view (`positions.ts`, `eyesAt`).

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

- **Outside the wire nobody follows.** Across an open field there's no covered way, so they hold and shoot. Going out after someone is a section's job: the hunt, below.
- **One man goes, alone.** A pair bounding in turn, with covering fire on the place, needs a man to know where his own side is, which a mind doesn't yet (`docs/foundation-review.md`, "People should be one kind of thing"). Until then nobody fires blind at a place someone has said he's moving on.
- **Tower men are as they were:** upright on an open deck, and the first to die. A parapet and the counter-sniper pair are step 3.
- **Nobody takes a position indoors or upstairs.** Positions are found on the ground. A man who is upstairs when a fight starts comes down to one, and someone in a windowless upper room is watched from outside until the fight lapses (35 s) and a man goes up to look, as before the firefight. What a camp does about an intruder inside a building belongs with how the target answers (the brief's second part).
- **The first man up still dies** to someone already aiming at his spot. That's fair to a careful player, and it's why a careless one still gets three or four men before he's stopped.

**Dials a person should set by playing,** all in `tuning.brain.firefight`: how well they shoot from a position (`spreadDeg`, 0.6°: about one round in two on a standing man at 50 m), how long a look lasts, how long a near miss pins a man, and how far a man will follow.

**On the taller camps** (measured again when two storeys landed, the same experiment): circling ends with the shooter dead on 10 camps of 16, from 8 without the firefight, and he gets all the way round on 5, from 7. Men he puts down from the walk fall from 3.1 to 2.1. The effect is smaller than on one storey because a taller camp shows a walker fewer men, and fewer of them see him.

**With the hunt as well** (step 2b, the same 16 taller camps and the same experiment, Nov 11):

| | Before either | The firefight | The firefight and the hunt |
| --- | --- | --- | --- |
| Circling: shot dead on the walk | 8 of 16 | 10 | 14 |
| Circling: got all the way round | 7 of 16 | 5 | 1 |
| Circling: men down from the walk | 3.1 | 2.1 | 0.9 |
| Circling: rounds at him | 19.7 | | 29.4 |
| Men shot by their own side | 0.19 | 0 | 0 |

A camp that hunts sends nobody out alone to look for a shooter, so the men a walker used to pick off one at a time as they came are still in their positions, shooting. Measured again with the target's answer on (step 3a): 14 and 1 again, and 1.1 men down from the walk.

### Step 2b, built: the hunt (Nov 11)

`brain/approach.ts`, `brain/hunt.ts`, and the hunt's half of `brain/commander.ts`. Only a camp with `hunts` does it (`off=hunt` plays the camp as it was). A hunt ends in a firefight, so `off=firefight` takes it away too.

**What was wrong.** After a shot from a ridge the camp got down, its tower men fired back, and that was the end of it. Nobody worked out where he was and nobody came. He could lie where he had fired from for as long as he liked: on 12 camps he was placed on none and found on none.

**Three things had to exist first.**

- **A fix worth acting on.** Men dived for cover and said nothing, so the camp had one bearing at most, and that was often the crack of the bullet, which points the wrong way. Now a man who has got down says on the net where the shot came from: the flash if he saw it, or the muzzle's report with the error of his ears. The camp fuses the bearings as it did and names the listed firing point they fit best. A fix wider than 80 m is left alone. After one loud shot the camp places the shooter on 12 camps of 12, a median 27 m off.
- **A reading of the valley** (`approach.ts`). What hides a man from a ridge is the ground and the trees, and a section has to read that the way a man reads a map before he leaves. It is a lattice of places 10 m apart over a relief on the map's own cells: the ground's height, anything solid on it, and each tree crown as the cone it is. Whether a place is in a firing point's view is read off that with no rays. Held against real lines of sight (`npm run experiment -- approach`) it agrees on 93% of the ground, and 7% of what it calls hidden is in view. Finding a way takes under a millisecond.
- **A camp that knows who is down.** It used to send a dead man out. A body is now put a name to: whoever's beat it lies on, if he has gone quiet since.

**The finding that shaped the drill.** No way to a firing point stays out of its view. At any price, on every camp tried, a way has 145 m or more of it in view, and most of that is the last stretch, which is the ground the firing point looks down on. A pair sent straight at the place would hand a waiting shooter two more targets. So they stop short and watch.

**What a section does:**

| Phase | What it does | What you see or hear |
| --- | --- | --- |
| Gather | Two men, of those who can be spared, make their own way to where the way out leaves the wire | Two men leaving the camp, about half a minute after your last shot |
| Out | Ground out of your view they run together. Ground in it they cross by bounds, in turn: one dashes to the next stop, gets down and says "Set!", and the other goes when he hears it | Dashes of a few seconds; "Set!" and "Moving!" if you're within about 55 m |
| Watch | At the last cover within rifle range of the place (55 to 130 m) they get down and watch it: up to look, down again, for 20 s | Heads coming up at two places. A shot or a man getting up now is under two rifles |
| Close | The leader goes on to the place in short dashes. The other covers him with fire on it until he's within 22 m | Rounds landing on the place he believes you're at |
| Look it over | He walks a box round the place, looking in, and then round each listed firing point within 60 m of it | A man walking round you, 6 m off |
| Hold, home | Nobody there: he says so, on the net and aloud. The camp crosses those places off and sends them on to the next, or they come home | "Clear here." |

**Six rules carry it.**

- **Not while you're firing.** Nobody is sent, and nobody crosses ground in view, until you've been quiet for 18 s. The camp answers a rifle that's speaking from where it is.
- **Fix him with fire, finish him with men.** Before a section steps out onto ground you can see, it says so on the net, and the camp's marksmen put rounds on the place for 12 s. If the camp has you placed right, those rounds are on you.
- **Nobody else goes.** While the camp has someone placed outside the wire it sends no lone searchers, and a man doesn't walk off its ground alone to look. Two fighting men always stay at home.
- **By voice, and only by voice.** A man knows where the other half is by hearing it say so (rule 13). A man who hears nothing goes on after a wait, and after three such he turns for home: a man alone doesn't hunt. One whose partner never comes to the rally says who is missing, and the camp sends someone else.
- **Ways a man can climb.** A way keeps to ground that rises no more than 25° where it can, and takes a harder climb only where there's no other. A place the leader can't get onto isn't called clear, and his call says how far out from the place it holds.
- **Honest.** The camp places you from what its men heard and said. A quiet round that nobody hears gives it nothing to go on.

**Measured** (`npm run experiment -- hunt`, 12 camps, the same seeds before and with the hunt; a scripted shooter on the best overview who can't be hurt, and the rounds that would have struck a man lying where he last fired from, of which three kill a player):

| | Before | With the hunt |
| --- | --- | --- |
| One loud shot: the camp places him | 0 of 12 | 12 of 12, a median 27 m off |
| A section is sent | 0 | 11 of 12 |
| It's watching his place after | never | 152 s |
| He stays: found | 0 | 9 of 12, after a median 210 s |
| He stays: enough rounds on him to kill | 0 | 6 of 12, by a median 214 s |
| He fires four times and stays: found | 0 | 8 of 12 |
| He moves about 90 m after the shot: found | 0 | 3 of 12 |
| He moves: enough rounds on him to kill | 0 | 1 of 12 |
| Men not sent who went past the wire | 0 | 0.08 |
| Fewest fighting men left at home | | 3.5 |

So staying put after a loud shot now gets a shooter found on three camps in four, and moving a hundred metres is worth most of that back. That is what step 2 was for. A shooter who circles the camp instead does worse too: shot dead on 14 camps of 16, where the firefight alone had 10 (step 2a, *With the hunt as well*).

**What it doesn't do yet, and where each belongs.**

- **A marksman who shoots everything he sees still wins.** Played by the mission's rules with a shooter who never misses his chance, the camp sends 1.7 sections, loses 2.1 of their men, and never hurts him. A section on foot can't beat a rifle that's watching for it. The camp's answer to that is means, and those are step 3: the counter-sniper pair, a crewed gun.
- **It takes about three and a half minutes.** The design hoped for two. A foot section going 250 to 350 m by cover and bounds can't do that. A cut-off by truck could.
- **One section at a time.** The relief's spare men aren't yet a second section with another job: the way out.
- **No radio, no section.** The camp places nobody and orders nobody. A section already out carries on. A hunt called by voice by whoever saw the flash is still to build.
- **Some places it won't go.** A walled camp whose gate faces away is 900 m or more round to the place, and nobody is sent. A firing point up a face a man can't climb isn't called clear, and the camp leaves it be for four minutes.
- **Inside the wire nothing changed.** A search of the camp's own ground waits while someone is placed outside.

**Dials a person should set by playing,** all in `tuning.brain.hunt`: how long after your last shot they come (`quiet`, `after`), how long they watch before closing in (`watch.for`), how long the marksmen cover a crossing (`fix`), how many men go and how many stay (`size`, `keep`), and how much longer a way they'll take for cover (`ground.price`, `ground.priceOn`).

### Step 2c, built: out of the gate isn't out of the fight (Nov 12)

`brain/firefight.ts` (the chase), `brain/walls.ts`. The owner, from playing: "even if many guards were aware of my presence within the camp at once and actively watching me, if I exited the compound through a door, turned 90º and just followed along the wall for even a few meters, it was very, very rare for a guard to even step outside the door to look around or continue a gunfight... the current reaction gives a slight impression of 'he walked out that door, must be gone forever'." What they'd expect: "a guard or two maybe continue pursuit to fire from behind me as I escape, but if I can shoot them down as they expose themselves outside of the camp, then I get more of that sense of security because I took out the ones that did pursue, and the rest are still defending within." And a limit on the fix: "Don't want our efforts in fixing this more minor problem to cascade into massive errors in judgment across the reactive intelligence you're starting to hone in already."

**What was wrong, measured** (`npm run experiment -- out-the-gate`, 24 camps). Someone stands a little way inside an opening in a camp's wall until three guards have him in sight, or five seconds after the first man with a rifle is sure of him. Then he runs out, turns along the outside of the wall and stops 8 m on, where no post can see him. On 21 camps he was seen and got out that way. As the camp was, someone came to the opening on 15 of them, a median 37 s after he had gone through it. A man came out after him on 3, 66 s behind, and nobody was out inside 25 s on any. So the owner's read was right.

**Why.** Step 2a's follow is how a trained man comes at someone who has gone to ground: he holds the angle for four seconds and more, then one man goes in bounds, by ways out of the intruder's view, to where he can see the place, and from there on the way the intruder was heading. Each part of that is wrong for a man who is leaving. The hold gives him ten seconds. The covered way assumes he's watching the gate. And the way he was heading is straight out, when he has turned along the wall.

**The chase.** A man who is leaving isn't waiting for anyone.

| | |
| --- | --- |
| Who knows | A man who knows he was inside the walls (he saw him there, or a man who did said so), and then had him in sight outside by an opening, or going out through one at a run. He shouts it and says it on the net, and whoever hears that knows too |
| Who goes | The nearest who knows, and the keenest, first: less than a second for a patrol at the gate, about three for an officer 40 m off. Two at a time, and the first to say so are the ones who go |
| Who doesn't | A man holding the target's door. A man on a tower. A man who saw him and has an alarm box in reach: the box is his, and he calls out where the intruder went as he goes for it |
| How | At a run, by the quickest way, to a step outside the opening. No bounds and no covered way |
| There | Down on a knee. A look each way along the wall, 2.6 s each, then out across the ground for 5 s. A figure he glimpses out there is the man he came out for, and the fight is on from there |
| How far | The camp's own ground. He steps out, looks and shoots. Going on into the valley is a section's job (step 2b), once the camp has placed someone out there |
| The rest | Once anyone has gone out, every other man's position and every bound he makes keeps inside the walls |
| The rest's fire | For a minute after a man says he's going out, nobody fires at ground he can't see into within 15 m of that place, and nobody well behind the opening fires through it at a man's height. A man at the opening himself fires as he sees fit, and a tower's round at something far out goes over their heads |
| If nobody's there | He says the place is empty and goes back in |

In the code:

- **A camp's walls are something its men know** (`brain/walls.ts`): which side of the perimeter a place is on, where the openings are, and which one a straight move goes out by. Static knowledge, like its alarm boxes.
- **Watching him go takes knowing he was in** (`Firefight.inside`). A man keeps the last moment he knew the intruder was inside the walls: he had him in sight there, or a man who saw him said so. Without that, a figure last seen outside by an opening is someone at the gate, and the ordinary firefight's.
- **"He's gone out" is its own word** (`Report.out`, on a contact that names the outside of the opening). A man keeps it apart from where he believes the intruder is (`Firefight.heardOut`), because the net's older news of where he was a moment before arrives later and would unsay it.
- **Who has gone is counted by ear** (`Firefight.out`, `outAt`). A chaser says "Moving!" aloud and on the net as he sets off, and says it's out of the walls (`Report.out` again). Each man counts the ones he has heard say that, and a man who said it third gives it up when he hears the two who said it first.
- **Where his own have gone out is where a man doesn't shoot** (`BrainState.mateOut`, `mateGoneOut`, `mateInLine`). Every man with a brain keeps the last such word and its place, tower men too. A brain doesn't see its own side (rule 13), so this is by ear as well: it knows where a mate said he was going, not where he is.
- **One chase a man, in one fight.** Once he's been out, he fights from where that got him by step 2a's rules. Without that he ran out again each time he lost sight of the intruder behind his own cover.
- **`off=chase`** plays a camp as it was. A camp with no firefight has no chase either.
- **`gate=1`** on a live camp (`?scene=takedown&params=seed=NUF-6608%26gate=1`) starts a person 45 m outside the opening the scene uses, facing it, where nobody has noticed them: a sitting on this is about going in and coming out, not the walk from the valley's edge (`game/leaving.ts`).

**Measured after** (the same 21 camps):

| | As it was | With the chase |
| --- | --- | --- |
| Someone came to the opening | 15, 37 s after he went through | 20, 11 s after |
| Someone came out after him | 3, 66 s after | 19, 13 s after |
| Someone was out within 25 s | 0 | **18** |
| A man who came out set eyes on him | 2, 63 s after | **19, 16 s after** |
| Rounds fired by the men who came out | 0.1 | 13 |
| Men who came out, in all | 0.2 | 1.8 |
| Most out at once | 0.2 | 1.3 |
| Fewest fighting men left inside the walls | 6.3 | 5.0 |
| Men shot by their own side | 0 | 0 |

And the two other things a person does once he's out:

| | As it was | With the chase |
| --- | --- | --- |
| **He runs on for the trees.** Rounds fired at him | 38 | 62 |
| Rounds that hit him once he was out | 13 | 20 |
| Enough of them to kill | 11 of 21 | 16 of 21 |
| **He stays and shoots whoever comes out.** Men who came out | 0.2 | 1.8 |
| Of them, put down by him | 0.2 | 1.8: all of them |
| Men who came out once two were down | 0 | **0** |
| Men shot by their own side | 0 | 0 |

What the tables say:

- **Out of the gate isn't out of the fight.** About 13 s after you go through it, a man is out after you, and two or three seconds later he has you in sight along the wall.
- **It's one or two, and the camp keeps its men.** Five fighting men are still inside at the worst moment, where six were.
- **Running in a straight line was deadly already,** as the owner expected: a runner took 13 hits from the towers and from men with a line through the opening before any of this. It's more so now.
- **You can correct the mistake.** A man who waits by the wall and puts down the two who come out has nobody else come out after them.

**What didn't move.** No behaviour fingerprint, and nothing in any lane's bench: no pinned run or bench has anyone go out of a camp by an opening. And the wider experiments, on the same camps as `main` the day this landed:

| Experiment | Runs | Against `main` |
| --- | --- | --- |
| `ladder`: four plans against a camp | 64, on 16 camps | Identical |
| `circling`: a shooter who walks round it | 96, on 16 camps | Identical |
| `second-step`: ten ways to open | 240, on 24 camps | Identical |
| `hunt` | 24, on 12 camps | Identical |
| `takedown` | 96, on 24 camps | Identical |
| `answer` | 54, on 18 camps | Identical |
| `firefight` | 120, on 60 camps | Identical |
| `flaws`: every attack in the compound simulator | 216, on 24 camps | Identical |

Identical means every figure in each report, to the last digit, over 910 runs. That's what these benches measure, and not a proof that no man took a different step.

That list, and the chase's own bench, read wrong more than once on the way. Each time it was this fix reaching into something else, or the fix for that reaching too far. Those are the first four entries below.

**Decided along the way.**

- **The camp was shooting the men it sent out.** The chaser's "Moving!" went on the net so the far end of the camp could count him, and it named where he was going. A tower marksman reads a "Moving!" on the net as a section asking for fire on the place it names (step 2b), and a tower man who can't see an intruder fires at where he believes him to be, which was now "just outside the gate". On three camps of 24, four of the men who went out were killed kneeling there by their own side, and the first measurements counted such men as put down by the intruder. A chaser's word is no longer a call for fire; nobody fires blind near where a mate went out; and nobody well behind the opening fires through it. The scene now fails if any man is shot by his own side, in all three of its plans (72 runs: none).
- **Watching him go takes knowing he was in, and going out is through the opening.** The ladder of plans found this one, on one camp of its 16 (SIZ-0270). A man who walks in at the front gate stopped a step outside it, in a guard's view, and came on in. He was last seen outside the walls by an opening, which the first rule read as a man who had left: the guard called it, two men went out to look for him along the wall, and he walked to the target's door and shot him. Now a man chases only someone he knows was inside, and one last seen inside counts as going out only if the way he was going leaves by the opening and not into the wall beside it. That walker is fought on all 16 camps exactly as he is on `main` (`tests/chase.test.ts`).
- **Being told he was inside counts, if the man telling saw him.** The first version of that rule took only a man's own eyes, and lost two camps: the man who saw him come out was a patrol outside the wall, who had never seen him in it and had heard that he was. A sighting someone called counts. A place someone heard doesn't: a man at the gate is within a guess of being inside it.
- **Only a man who says he's going out of the walls counts as one.** The first count took any "Moving!" about a place outside the walls, and a man going after a shooter who was outside all along says that too. Against a shooter circling a camp, two men were counted as out who had chased nobody, and from then on the rest were held to the walls in a fight nobody had left. It moved no number on any bench, and it was wrong (`tests/firefight.test.ts`).
- **The man with a box in reach raises the alarm, and tells the rest where he went.** The first version had the only witness leave the chase for a box he passed, a second after he'd said he was going: the men who heard him counted a chaser who wasn't one. A man who has set off doesn't turn back for a box. One who hasn't, and has a box in reach, goes for it, as he always did.
- **Told on the net, not only shouted.** A shout carries 55 m and walls stop it. The men nearest the opening were often the ones who hadn't seen him go, and out of earshot of the man who had.
- **The first to say so go.** With ids settling it, the man with the lowest number kept going however late he said it, and three were out at once on some camps while the highest turned back.
- **Having given him up doesn't come into it.** A man with no covered way nearer to an intruder standing in the open calls him lost, which is right for the follow. The first version let that stop him answering "he's gone out", and on two camps the nearest men stayed where they were for a minute. The chase needs no covered way.
- **A man who can't get there doesn't pretend he did.** On one camp a chaser was boxed in by another man behind the same wall. He ran on the spot for eight seconds, then knelt where he was, looked "along the wall" from 45 m inside the camp and called the gate clear. Now he looks for another way for 12 s, and then leaves it.
- **A look long enough for his eyes, and a man he's expecting.** At 0.9 s each way, a chaser 9 m from a man standing still against the wall looked straight at him and moved on: the law of sight wants about two seconds for that. It's 2.6 s, which is what a look over cover is in step 2a. And a chaser who arrived more than 12 s after the news no longer took a glimpsed figure for the intruder, so a man who came round the corner for him looked at him and went home. Out there and looking, a figure within 25 m of the opening is the man.
- **Everyone else inside.** Once a chaser had him in sight, the ordinary firefight took the rest of the camp to positions outside the gate: three to five men out. Positions and bounds keep inside the walls for every man but the chasers, from the moment anyone has gone.

**What it leaves.**

- **Nobody has played it.** Whether 13 s is the right head start, and whether two is the right number, are the owner's by playing: `brain.firefight.chase`.
- **A worker who is the only one to see him tells nobody where.** He holds or runs for a box, and the men with rifles never learn which way the intruder went. Two of the 21 camps are that (one or two men knew of him as he left, and nobody came out). What a man with no rifle says about what he sees belongs with the camp's voice, and is the next thing in this direction.
- **A man doesn't see his own side.** He holds his fire by what a mate said and where, not by who is in front of his muzzle. That's enough for the gateway, on these camps. It also means that for a minute after a man goes out, the men well behind that opening don't fire through it whether he's still alive or not: put down the two who came out, and the gateway is quieter than it should be until the minute is up. A camp that could see its own would hold its fire for exactly as long as it should, and that's lab A's to give it.
- **Two men behind one wall can box each other in.** The route a man takes doesn't know about the man beside him, and stepping round him can leave him circling. It cost one camp twelve seconds here (25 s to the first man out, where the rest take 13), and it's the navigator's to fix, for every act that sets off at a run.
- **A third man can go out, after the first two.** Three who set off in the same second haven't heard each other yet, and the third turns back when he does. On two camps of 21 three men went out in all, and no more than two were out at once on any.
- **He's followed to the opening, not round the corner.** A chaser who sees nobody along the wall gives it up after his look. A man who keeps going round the compound's corner is the firefight's ordinary follow, or the hunt's.
- **Hugging the wall still hides you from a tower.** That's honest geometry: a deck 3 m inside a 3 m wall can't see the ground within about 3.5 m of its far side. The answer to it is the man who steps out, which is this.

### Step 3a, built: the target's answer, by the camp's problem (Nov 11)

`brain/protect.ts`, `game/protection.ts`, `game/escape.ts`. The owner's call (`core-challenge`, Nov 10): what the target does under attack depends on the camp, so that play "can't be reduced to always cutting a radio or disabling a vehicle", and with "a clear method to the madness", so that nobody is left asking "how could I have possibly known that without getting near the end then losing".

**What was wrong.** Every camp that protected its target gave the one answer: he waits in his room for the relief, and two of its men bring him out to his vehicle about two minutes after the siren. Cutting the radio or the vehicle beat every camp. And the vehicles were silent, the relief's truck included, so the one thing that said he was about to go made no sound.

**The method is one sentence: he leaves only by a way the camp has ready.** A camp is built round one problem (`generation/crux.ts`), and its answer follows from it (`off=answer` gives every camp the old one):

| The camp's problem | Its answer | Under attack | What stops it |
| --- | --- | --- | --- |
| He's buried in it, with a way in kept open | **It holds him** | He goes to his room and stays there to the end. The relief comes to his doors, two men, and those are their posts from then on | Nothing makes him leave: someone has to go in. Cutting the radio means fewer men at his doors |
| It's built to be flushed | **It bolts** | At the siren the man on his door runs to his vehicle and starts it. When it has run a minute he goes back in for him, and he runs for it | Killing the vehicle: nothing starts, nobody is sent, and he stays. The radio makes no difference |
| He walks out with an escort (and any camp built by hand) | **It waits for its relief** | As before: the radio calls the relief, and its men bring him out | The radio, the men sent for him and the vehicle, in turn |

**A bolt is a drill, so every step of it is something a man does on what he himself hears.** The siren sends the man on his door to the vehicle. An engine heard running where the vehicle stands, for 60 s, sends whoever started it back in. The target comes out when he's told, or by himself once he has heard it for 80 s. Nothing in it needs an order. So what you do to it shows:

- Kill the man on his door before he starts it, and the nearest man left goes instead, 20 s after the siren and 0.8 s more for each metre he has to come. Each man counts for himself, so nobody has to be told whose turn it is. On LEB-2534 the engine then starts 35 s after the siren, where it starts after 3.
- Kill whoever started it once it's running, and the target comes out late and alone.
- Kill every man who goes to it, and it's a camp that waits for its relief: now the radio matters.
- Kill the vehicle, and he stays, with a man on his door: a camp that holds, the hard way.
- While that man is at the vehicle, for a minute, nobody is on the target's door.

The first of those came from playing the sitting's own link headless (`npm run sitting`). The man on the target's door is the guard a perch sees best, so a shooter who takes whoever he sees first shot him before the siren, and the camp's whole answer went with him, without a sound. A camp that means to bolt wouldn't hang it on one sentry.

**What there is to read.** Before a shot: who stands on his doors (nobody, on a camp that holds), and whether he ever walks out (only on an escort's). After one: an engine. A vehicle's engine is a sound now (the `engine` event, every two seconds while it runs, by the law every sound obeys): heard to 500 m as it starts or drives and to 320 m standing. The camp's own starting up seconds after the siren means he's going. No engine in the camp and a truck on the road means the relief is coming for him. Neither means he's staying. And a run that loses him says so at the end: "his vehicle's engine had been running for 79 s when he got to it".

**Men on his door stay on it.** Once the siren has sounded, a man posted on the target's door doesn't walk off to look into something, the commander sends him nowhere but in for the target, and in a firefight he takes a position within 8 m of where he stands and goes after nobody. Under a shooter circling an escort's camp, the man on the door was never more than 4.8 m from it in six minutes, 15 s of them in the fight. He leaves it only by the drill. The relief knows the alarm is up when it arrives. And an order from the commander doesn't take a man off bringing the target out, or off his way to hold a door.

**The camp knows what has become of its vehicle.** Once he has driven off in it, or once a man has gone to start it and found it dead, there is no vehicle as far as anyone in the camp is concerned: nobody else runs to it, and nobody is sent to bring him out to it. Before that, the first version had every man in the camp taking his turn to go and start a vehicle that had left, and the fight stopped. The firefight's own test caught it.

**Measured** (`npm run experiment -- answer --camps 40`: camps under a sniper on the best overview for five minutes; 20 built to be gone into, 13 to be flushed, 7 an escort's. The first two columns are camps that protect their targets, where the siren sounded on 31. The third is the same camps not ready for trouble, which protect nobody and run him at the siren: every camp's answer before the takedown. There it sounded on 33.)

| | One answer for every camp | By the camp's problem | Not ready for trouble |
| --- | --- | --- | --- |
| He left | 31 of 31 | 15 of 31 | 33 of 33 |
| Built to be gone into: he left | 16 of 16, 120 s after the siren | 0 of 16 | 17 of 17, 8 s after |
| Its relief on his doors at the end | 0 | 1.9 men | 0 |
| Built to be flushed: he left | 10 of 10, 121 s after | 10 of 10, 84 s after | 10 of 10, 10 s after |
| Its engine ran before he was in it | he started it himself | 79 s | he started it himself |
| He came out with nobody telling him | 0 | 4 of 10: the sniper had shot the man on his door | all: nobody is sent |
| An escort's: he left | 5 of 5, 114 s after | the same | 6 of 6, 4 s after |
| He left: something to hear of it from the overview first | 28 of 31 | 14 of 15 | 0 of 33 |
| For how long before he was in his vehicle | 50 s | 78 s | 0 s |

So the three kinds of camp now end three ways under the same attack, and where he leaves there is more than a minute of something to hear first, from where a player most likely is.

**What it doesn't do yet, and where each belongs.**

- **Nobody has played it, or heard it.** The engine's voice is checked for being one unbroken sound that fades with distance (`tests/browser/engine.test.ts`). Whether it sounds like an engine, and whether a person reads it in time, is a sitting's to say.
- **Where his vehicle stands tells you nothing.** The generator puts it by his door on every camp, so on a camp that holds it's a getaway that is never used. It stood there because a camp that wasn't ready for trouble ran him to it at the siren, and standing by his door kept that run out of a perch's view. Since Nov 12 no camp does that (step 3b), so a holding camp's vehicle can go to the motor pool, and where it stands will then say something. That is a change to what the generator builds, and goes with its next one. Until then the things to read before a shot are the men on his door and whether he walks out.
- **He does nothing about someone who comes into his room.** He crouches there. What he and the men on his door do about an intruder inside his building is close protection, the next of step 3's means.
- **A camp that wasn't marked ready for trouble ran him at the siren,** in his vehicle a median of 4 to 10 s later with nothing to hear first (the table's third column). On Nov 12 that ended: every camp answers by its problem (step 3b), and `off=protect` plays the old way.
- **Nine camps in forty never sounded the siren** under this sniper in five minutes, and on those nothing happens to him either way.

**Dials a person should set by playing,** in `tuning.brain.protect.answer` and `tuning.brain.engine`: how long the engine runs before he's sent for (`prep`, 60 s: the length of the warning), how much longer before he comes by himself (`own`), how long before another man takes over starting it (`takeOver`, `perMetre`), how many of the relief go to his doors (`keepers`), how far a man on his door will go for a position (`firefight.spot.doorRun`), and how far an engine carries starting, standing and driving.

### Step 3b, built: a first move that isn't the last (Nov 12)

`brain/grounds.ts`, `game/perception.ts`, `brain/commander.ts`, `game/sabotage.ts`. The owner, from playing: "if I'm shooting with a suppressor from a distance and hit a guard in a tower, the siren would go off immediately", though the shot is quiet, the strike is negligible, and nobody on the ground is likely to see a man in a tower drop. And every other opening ended the same way: "If I take a shot at the siren, everyone hears it and panics. If I take a shot at the generator, everyone hears it and panics. If I try to go into the camp to disable those, I get seen, everyone panics, and the siren goes off. If I shoot a guard first, the siren goes off. How do I win here without the target escaping the second everyone knows I'm attacking."

**The standard it's built to** (the owner, the same day): "the goal of the camp's reactive intelligence is fair realism... The core question is: what would someone actually do here, and how would the camp actually react? Then, using your discretion, build that into a good video game version." A suppressed shot from the right distance "may not even catch my attention, especially with other sounds going on around me". Near me it would. Having noticed, "I might be more confused than immediately sprint to cover, depending on how likely I can confirm an attacking gunshot... as well as the reactions (or lack thereof) of those around me." A man dropped unseen: "I may or may not hear a thud... but likely wouldn't immediately assume that somebody was just shot from a hidden sniper or sprint to cover/hit a siren on a light assumption. Sometimes... I may have to find a body to know something's happening." And no kit is a perfect answer: "It shouldn't be so easy to go suppressor plus subsonic camo and be deadly quiet for every single kill, regardless of distance."

**What was wrong, measured** (`npm run experiment -- second-step`, 24 camps: one round, into one thing, and four minutes of what the camp makes of it). One suppressed round through the head of a man on a raised post, from the best overview:

| | A plain camp | A camp marked ready (the takedown) |
| --- | --- | --- |
| The camp whistled | 20 of 20 | 19 of 20 |
| Of the rest, searching 5 s later | 98% | 66% |
| The siren sounded | 9 of 20, 3.9 s after he fell | 8 of 20, 4.9 s after |
| Thrown by a man who had seen nobody and no body | 8 of the 9 | 7 of the 8 |
| The target was gone | 9 of 20, 34 s after the shot | 4 of 20, 144 s after |

A round into the generator or an alarm box did nothing to it, and whistled the camp up every time. Three causes:

1. **Any sound of a shot was a shot.** A body's thud carries 650 m, so that you hear your own hit land. Every man in the camp took it for a shot, and turned to look at the man who had made it.
2. **A worker ran for the siren on any of them.** The design doc has a worker raise the alarm "if he sees you", and the reaction window open on "something alarming, like a comrade dropping". The code had him go on anything he heard.
3. **A camp that wasn't marked ready ran its target at the siren.** Gone in half a minute, with nothing to hear first.

**A camp's alarm is a ladder, and each rung takes its own evidence.** The rules are the same for every camp: the takedown's separate numbers are the game's, and `ready=` is gone.

| What a man does | What it takes | What tells you |
| --- | --- | --- |
| Nothing | A snap or a thud a long way off. He hears it, and it's lost in the camp's own noise | |
| He looks up | A snap within about 35 m of the round's path, a thud within about 50 m, a suppressed report at the edge of hearing | "Hm?", a head turning |
| He's wary, and may go and see | A snap within about 20 m, a thud within about 28 m, a report heard faintly. Or a man he can see lying where he shouldn't be, more than 10 m off: he walks over | "Who's there?", "Is that... a body?", a man walking over |
| He gets down, shouts, and blows his whistle; the camp stands to and the target goes to his room | Fire he's sure of: a near miss within 4 m, a flash, or (since step 3c) a report with something to bear it out. Or a body near enough to see what happened to it | "That was a shot!", "Man down!", the whistle |
| He runs for an alarm box | He knows the camp is under attack: an intruder in his sight; one of his own in his sight when the round struck; a body come on after a shot he took for a shot; or fire that has come again inside a minute | A man running for a wall, then the siren |
| The camp orders someone to a box | Two of its men reported dead, however they were found. Or word on the net from a man who knows and can't reach a box himself | The same, a little later |
| The target leaves | Only by a way the camp has ready (step 3a) | An engine in the camp, or a truck on the road |

What each of those is, in the code:

- **A sound tells a man what it sounds like** (`perception.awareness.shots`). One law says what he hears; this says what he can tell from it. A sound of a shot that tells him nothing leaves nothing in his mind: no percept, no belief, no look. So the strike still carries 650 m and you still hear your own hit land.
- **A man going down is seen by whoever would see him drop**: within 80 m looking that way, 30 m out of the side of his eye. Those are the ranges the generator builds a camp's web of watchers by (`gen.sight.witness`), and a guard's eyes now go by the same number (`perception.sight.fall`). They had gone by the law for a standing, walking man, which reaches 150 m.
- **He watched him go down only if he had him in sight when the round struck.** A man who whips round at the thud gets there a moment later, to a man folding up or lying still. And a man lying more than 10 m off is someone lying down (`perception.sight.bodyNear`): he goes over, and it's a body when he's near enough to see.
- **Grounds for the siren** (`brain/grounds.ts`), and the camp's own (`brain/commander.ts`): the last two rows but one. Once a man knows, he knows for 30 s. A man sent by the camp who never throws the box isn't sent again: for all it knows he's dead.
- **Men who are down keep saying so.** A man in cover calls in each new shot, unless he has heard someone else do it, so the camp knows the rifle hasn't stopped, and sends nobody out under it (step 2b).
- **Every camp protects its target** (step 3a's answers, on every camp). No camp runs him at the siren. `off=protect` plays one that does, for measuring against.
- **A round breaks an alarm box** (`game/sabotage.ts`, `ballistics.breaks`). One round, one box, and the camp has others: a man who throws a dead one goes for the next. The generator is in the same table at none. It feeds every box and the radio, so one round from a ridge would take the siren and the net out of the whole mission, and a camp has no answer to that yet. Cutting the power stays a job for hands, as the design doc has it.

**Measured after** (the same bench, same camps). "Careful" is a man nobody has had in sight for ten seconds, on a line 12 m clear of everyone else: the shot of someone who has watched first.

| One round | It landed on | Whistled | Searching at +5 s | Siren | Target gone |
| --- | --- | --- | --- | --- | --- |
| Suppressed, careful, from the overview | 20 camps | 1 | 2% | **0** | **0** |
| The same from 80 m | 21 | 9 | 17% | 0 | 0 |
| Subsonic and suppressed, careful, from 90 m | 22 | 3 | 3% | 0 | 0 |
| The same from 40 m | 24 | 19 | 42% | 2, at 50 s | 1 |
| Suppressed, at whoever is on a watchtower | 13 | 6 | 23% | 4, at 11 s | 3, at 109 s |
| Suppressed, at whoever is on the ground | 23 | 12 | 29% | 13, at 7.7 s | 5, at 125 s |
| Loud, at whoever is on a watchtower | 13 | 13 | 92% | 5, at 10 s | 4, at 109 s |
| Suppressed, at an alarm box | 11 | 4 | 16% | 0 | 0; the box was dead on 11 |
| Suppressed, at the generator | 13 | 1 | 3% | 0 | 0; it does nothing to it |
| Five suppressed rounds half a minute apart, each careful | 20 | 14 | | 5, at 135 s, with 3 men down | 2, at 181 s |

One siren in the table was thrown by a man who had seen nobody and no body: in the run of five rounds, a man for whom it was fire that goes on. Before, it was 37 of 48. What the table says:

- **A careful first shot is quiet.** One camp in twenty whistles, and none sounds its siren. It was nine in twenty, with the target gone half a minute later.
- **It isn't a perfect answer, and neither is the subsonic load.** The suppressor does less the nearer you are: from 80 m the camp whistles on 9 of 21. The subsonic load buys you in to about 90 m, and at 40 m it's heard on 19 camps of 24. And a camp counts its dead: five careful rounds bring the siren on 5 camps of 20, with three men down.
- **Where it sounds on one round, someone was watching the man who fell.** That is the sightline puzzle the generator builds, and the difference between the first row and the fifth is the game.

**What else it moved.** One loud shot no longer brings the siren, so a shooter who fires once from the overview and stays is now found on 5 camps of 12, where step 2b had 9: a section still goes out after him on 10, but (my reading) no relief joins the search. One who fires four times is found on 9, with enough rounds on him to kill on 6, as one shot used to do. Under the sniper who fires every 8 s the siren comes 12 s after his first shot, from 7. And the brain bench's overlook has 24 guards of 32 down to a perfect shooter on one perch, from 18: its camps ran for cover at any sound of a shot, and now stand to where they are at the whistle, as the takedown's camps did. A man on the best overview sees men who have only got down, and that is the next thing a static shooter should lose.

**How you win, then.** Watch before you fire. A man nobody is looking at, on a line that passes nobody, falls unseen, and the camp finds him by a check-in he doesn't answer or by walking past. If a man sees you, or sees one fall, he has to reach a box: drop him on the way (the design doc's reaction window, about a second and a half before he sets off). A second body found, or a second loud shot, and the siren comes anyway. But it starts the camp's answer and doesn't end the mission: a camp you have to go into keeps its target to the end, a camp built to be flushed gives a minute of engine before he runs, and an escort's waits for its relief.

**What it doesn't do yet, and where each belongs.**

- **Nobody has played it.** The numbers say a careful opening is quiet. Whether a person can tell from a ridge who is being watched is a sitting's to say, and it's the thing to find out.
- **The honest view doesn't show who hears a snap or who is watching whom.** A player has guards' facings and nothing else. The tactical map (design doc) is where routes and watchers would draw themselves in.
- **Nothing on the honest screen says who raised the siren, or on what.** `npm run sitting -- <link> --why` and the debug view's WHY line do. The end screen should.
- **A man still makes up his mind alone.** The owner's "the reactions (or lack thereof) of those around me" is in only as shouts and the whistle. A man who looks to his neighbours before he believes his own ears would be the next step in the same direction. *(Built the same day: step 3c.)*
- **News by voice and radio still raises every man who hears it** to searching, though he then only holds where he is. The review's "two dials" (what a man knows apart from what he's told to do) is still the piece that would stop that. A careful kill now has 2% of the camp searching, so it's no longer what decides a first shot. *(Step 3c: word about a sound now leaves a listener wary, and what a sure man says he has seen is still believed.)*
- **A camp finds its dead by its radio or by walking past.** A post that doesn't answer its check-in is looked for. Reliefs of posts, so that a camp with no radio still finds a man at the end of his watch, aren't built (the owner: "something like camp rotations may help discover dead bodies").
- **A camp has no answer to losing its power.** Nobody restarts a generator or mends a box, and with the power cut by hand it can't sound a siren or call relief at all. Until it has one (a second alarm that needs no power, a runner), a rifle doesn't stop the generator.
- **A vehicle can't be shot dead.** It would hand a ridge the way to stop a bolting camp's getaway, and that sitting hasn't been played.

**Dials a person should set by playing:** `perception.awareness.shots` (how near a snap is a shot, how near a thud makes a man look), `perception.sight.bodyNear`, `perception.sight.fall` with `gen.sight.witness` (how far off a falling man is seen: one number), `brain.alarm.grounds` (how many shots make fire that goes on, and how long a man goes on knowing), `brain.alarm.casualties` (how many dead before the camp orders the siren), and `ballistics.breaks`.

### Step 3c, built: one thing is a question, and two that agree are an answer (Nov 12)

`perception/awareness.ts` (`agree`), `game/perception.ts`, `game/comms.ts`, `brain/grounds.ts`. Step 3b left a man making up his mind alone, and news raising every man who heard it. The owner's standard has both in one sentence: having noticed something, a man is "more confused than immediately sprint to cover, depending on how likely I can confirm an attacking gunshot versus a mix of personal confusion and curiosity, as well as the reactions (or lack thereof) of those around me".

**The rule.** What a man sees he believes: one of his own down, a flash, an intruder. So does whoever he tells, if he's sure of it. What a man hears is a question, and he's wary until something else answers it. The cues of a shooting reach him by different ways: a rifle's report, the snap of its round, its strike, a voice, a man seen down, a flash. Two that come by different ways within 4 s bear each other out, and so does the same sound again inside a minute. A voice has 10 s, because a man has to get the words out. But two puzzles are still a puzzle: one of the two has to be plain.

| What reaches him | Alone | With something to bear it out |
| --- | --- | --- |
| A rifle's report, heard well: a gun, somewhere (plain) | Wary. He looks for where, and says "Was that a shot?" | Fire, with the snap of its round, its strike, a cry, a mate who heard it too, or another report inside the minute |
| A snap or a thud (a puzzle) | Wary at most | Still a puzzle with another snap or thud, or with a mate who is asking. Fire with a report, a cry, the whistle, or the word of a man who is sure. A man shot, with a body he can see |
| A cry (plain) | Wary: someone is hurt, and he hasn't seen by what | A man shot, with any sound of a round |
| "Was that a shot?" from a mate | Nothing | It bears out a report he heard himself |
| "Shots!" on the net, from a man who is sure (plain) | Wary | Fire, with anything he heard himself |
| The same from a man who is only asking | Wary | It bears out a report he heard himself, as a mate asking does. With a snap, they're two men asking |
| "Contact!" or "Man down!" from a man who is sure | Searching: he believes him | |
| A round that all but hits him, a flash, a body near enough to see | Sure | |

What each of those is, in the code:

- **Cues** (`CUES`, `Stimulus.cue`): report, crack, impact, bolt, voice, body, muzzle. A man's awareness keeps the last of each that reached him, at its own level (`Awareness.cues`), so agreement never compounds: three sounds of one shot count as two do.
- **The numbers** (`perception.awareness.agree`): two cues within 4 s by different ways (10 s if one is a voice), or the same sound again between 2 and 60 s later, count 0.25 more than the stronger does alone. With nothing plain among them they stop at 0.7, which is wary. A clear report is 0.7 where it was 0.8, and a cry 0.62 where it was 0.8: each is one step short of sure.
- **Plain** (`plainShot`, `Stimulus.plain`): a report or a bolt heard well enough to know it for a gun, a near miss, a flash, a cry, the camp's whistle or siren, a body he is sure of, and the word of a man who is sure. A snap and a thud are never plain, however near.
- **A man says what he says as one who is sure or one who is asking** (`Report.sure`, `PendingSound.word`). A line said on becoming wary carries no alarm of its own and bears out what a listener heard himself. There's a new one for a shot he isn't sure of: "Was that a shot?". On the net, the word of a man who is only asking never has a listener more than wary (`brain.comms.asking`), whatever it's about.
- **Word about a sound is hearsay; word about a sight is news.** "Shots!" leaves a listener wary (0.62, from 0.8). "Contact!" and "Man down!" from a man who is sure raise him as they did.
- **What a man is going on can be read.** The debug view's perception list shows the cues each man has in mind beside his name (`cues: report + snap`), and `npm run sitting -- <link> --why` names them for each man as he becomes sure ("a report and a snap and a strike").
- **The siren's evidence didn't loosen** (`brain/grounds.ts`). Fire that goes on starts from a gun a man heard or saw for himself (a report he knows for one, a near miss, a flash) and was sure of. A snap and a man down have him sure, shouting and down, and are still nobody's gun.

**Measured** (`npm run experiment -- second-step`, the same 24 camps as step 3b, which is the "before" here):

| One round | Whistled | Searching at +5 s | Searching at +20 s | Siren |
| --- | --- | --- | --- | --- |
| Loud, at whoever is on a watchtower | 13 of 13, as before | 92%, as before | 85%, from 91% | 5 of 13, as before |
| Suppressed, at whoever is on a watchtower | 5 of 13, from 6 | 28%, from 23% | 32%, from 38% | 5, from 4 |
| Suppressed, at whoever is on the ground | 15 of 23, from 12 | 39%, from 29% | 56%, from 46% | 13, as before |
| Suppressed, careful, from the overview | 1 of 20, as before | 2%, as before | 11%, as before | 0, as before |
| The same from 80 m | 8 of 21, from 9 | 18%, from 17% | 20%, from 28% | 0 |
| Subsonic and suppressed, careful, from 90 m | 1 of 22, from 3 | 1%, from 3% | 11%, from 12% | 0 |
| The same from 40 m | 19 of 24, as before | 45%, from 42% | 47%, as before | 3, from 2 |
| Suppressed, at the generator | 0 of 13, from 1 | 0 | 0 | 0 |
| Five suppressed careful rounds, half a minute apart | 15 of 20, from 14 | | | 7, from 5, at 114 s with three men down |

And the flaw report (`npm run experiment -- flaws --camps 24`: every attack script against 24 camps, counting the moments a camp does what a defender plainly wouldn't):

| | Before | After |
| --- | --- | --- |
| A tower man with a loud shot in his range and no answer, per run (one shot, a sniper, a relocating one, two fronts) | 0.25, 0.25, 0.33, 0.25 | **0 on all four** |
| A man outdoors still unaware 5 s after a loud shot | 0.04 to 0.29 by attack | The same |
| Standing in the shooter's clear line, stuck, piled up, chattering | | Level, within the noise of 24 camps |

What the tables say:

- **A first shot is read much as it was.** Step 3b had already graded what each sound tells a man, so who gets down in the first seconds barely moves, and the siren on a first shot is where it was. What moves is why: a man is sure because two things agreed, and the trace says which (`npm run sitting -- <link> --why`).
- **A loud shot still has a camp down.** A rifle is a rifle: the whistle and the net carry it to every man who heard the bang, and 20 s on 85% of the camp is searching. A man who heard only the bang gets there a beat later, by asking.
- **A man shot where others are near is known for what it is a little more often** (the whistle on 15 camps of 23, from 12): a thud, and then "Man down!" from the man who looked.
- **A camp finds its dead a little sooner.** After five careful rounds the siren comes on 7 camps of 20, from 5, about two minutes in with three men down. I traced the two that changed. In one the camp ordered it on a second body reported, with four men down. In the other the overview is 117 m off, near enough that a suppressed rifle is still a gun, and a man came on a body having heard it. Nobody ran for a box on less than he would have before.
- **Tower men answer a loud shot.** On `main` one run in four had a tower man who didn't: his mind had lost the shot to the talk about it (below, *Talk doesn't push out what a man sensed himself*).

**Decided along the way.**

- **Two puzzles are still a puzzle.** The first version let any two cues agree. A snap and a thud are two sounds of one round, so every quiet shot was "borne out": the careful shot whistled 9 camps of 20, and a round into the generator 12 of 13. So one of the two has to be plain.
- **The siren takes his own plain evidence of a gun.** With "sure" meaning two things agreed, a snap and a body near enough to see had a man sure, and the old rule read that as "a body come on after a shot": the siren on a suppressed first shot went to 17 camps of 23, from 13. A real man would be sure his mate was shot, and he is: he shouts and gets down. Whether the camp is under attack is the next rung, and it takes a gun.
- **What a sure man has seen is believed.** For a while every report left a listener wary. The camp then re-found a lost intruder on 13 runs of 16, from 15 (`npm run bench`, the brain lane), because "Contact!" on the net no longer had anyone searching. The owner's sentence is about sounds, and the fix is about sounds: a sighting called in by a man who is sure counts as it did.
- **A voice has longer than a sound.** With 4 s for everything, a third of a camp still wasn't sure 20 s after a loud shot (68% searching, where 91% had been), because the word that would have settled it reached them five or six seconds after the bang. That read as deaf more than careful. A man who is still wary of a bang when the net says "shots!" knows what he heard, so a voice answers a sound for 10 s, which is as long as he stays wary of it.
- **Talk doesn't push out what a man sensed himself.** The flaw report found tower men giving no answer to one loud shot on 11 camps of 24, where `main` had 6. A man's mind holds eight things. With every wary man saying "Was that a shot?", eight voices in two seconds pushed the report out of a tower man's mind, and he stopped answering it half a second after he started. What he was told now goes before what he sensed (`prunePercepts`). No tower man is silent after a loud shot on any of the 24, so this was costing `main` too.
- **A camp that hunts sends nobody out alone to a sound.** The hunt's bench counts men who go past the camp's edge unsent, and it had one, 250 m out on the shooter's ridge. A wary man's late call had put the bang there while the camp was only uneasy, and at that level the camp sends one man to look wherever the last report said. Off its own ground that's a section's job once it has placed someone, so the camp now makes no errand of it (`brain/commander.ts`).
- **Counting them up was the wrong way to weigh them.** The ladder's old rule (three weak stimuli inside a grace period count as a stronger one) turned one shot's sounds into "Again. Same place." Cues of a shooting skip it: they have been weighed already.

**What it leaves.**

- **A man hears his neighbours. He doesn't watch them.** A mate who carries on unbothered doesn't calm him, and a mate who dives for cover in silence doesn't alarm him. "The reactions (or lack thereof)" count only as a second cue arriving or not. Seeing what the men round you are doing is the next step, and it wants the sight lane to say what a man can make of another's posture.
- **The camp is a little easier to shoot up from one perch.** The brain bench's overlook has 26 guards of 32 down to a perfect shooter who stays put, from 24: a wary man stands a moment longer than a man who took every bang for fire. Getting down behind something at a whistle (step 3b's list) is what answers that, and it's the next thing I'd build.
- **The numbers are the owner's by playing:** `perception.awareness.agree` (how long two cues have to agree, how long a voice has, how much it adds, where two puzzles stop), the readings in `perception.awareness.shots`, `perception.awareness.cry` and `brain.comms.level`.

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
