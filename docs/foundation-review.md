# Foundation review

Nov 9, 2026. Written for the owner by an advisor session on `claude-fable-5-2`, asked to judge the foundation freshly, say what to keep, improve or rebuild, and do what was worth doing. Everything measured here is one command away, and the commands are named. What I changed is on the branch `claude/fable-advisor-f47b5c`, and section 7 says how to merge it.

## 1. The verdict

**Keep the foundation. Don't rebuild it.** The core that everything stands on is the best part of the project, and a rebuild would spend weeks getting back to where it is today. The body, the rifle, sight and hearing, and the camp generator's analysis are each sound.

**Rebuild one engine's structure: the guard's brain.** It works, but it was shaped for a guard who reacts alone. The camp work ahead is all about men acting together, and there's nowhere for that to live. Rebuild it in place before the camp learns to hunt, proving at each step that nothing a player could see has changed.

**Change one rule of the game: what an alarm costs.** This is the weakest thing in the project, and it isn't in any engine. Today the first loud moment starts a fuse of about 25 seconds, and when it runs out the mission is lost. Nothing the player or the camp does after that can matter. Section 3 is my answer to your question about the core challenge.

**Play a whole mission before building more of the camp.** Nobody has finished one. The largest risk here is not technical.

**What I changed, and what it did:**

| Change | Measured |
| --- | --- |
| The motor's "broken promise" in long bot runs | Explained, and it was the instrument: 5 of 24 runs failed before, 0 of 284 after (34 hours of bot play) |
| A real hole the better instrument then found | A body could be carried 0.43 m up a low ledge in one tick. Fixed, with a test that fails without the fix |
| What a shot's sounds tell a guard | Now data. The game's behaviour is unchanged until you choose otherwise |
| The quiet kill, measured | `npm run experiment -- quiet-kill`. It shows the law of sound isn't the problem: how news spreads is |
| The camp generator's way-in search | The same answers bit for bit, 19% quicker, which takes 8% off building a world |
| Experiments build each camp once | `quiet-kill` on six camps: 135 s to 40 s, with the same report to the character |
| What a guard's mind is handed | Its camp's own ground, by type, where it was handed the whole world |

## 2. What I'd do, in order

Ranked by what each does for the game as a whole.

1. **Decide what an alarm costs** (section 3). It decides whether there is a game between "never noticed" and "lost". Every camp engine still to be built depends on the answer.
2. **Play one whole mission, start to finish, on today's build**, once the first-fight fixes land. Walk in with no perch given, find the camp's problem, act, get out. Fifteen minutes of that will correct more than another week of bot numbers.
3. **Give a camp two dials, not one**: what each man knows, and what the camp has ordered. Today a whistle hands every man the alarm a personal sighting would. Section 3 has the numbers.
4. **Rebuild the brain's structure before step 2 of the camp work** (section 4, Brain). Three to five days of agent work, with every pinned run proving nothing moved.
5. **Build one bot that can win on today's camps.** The plan ladder is the only instrument for "good loses, great wins", and it has gone blind: on 12 of 16 camps no bot wins at all, because every bot was built to shoot from a ridge and the target is no longer there to be shot. No decision about the fight can be measured until this exists.
6. **Make people one kind of thing.** A guard is the only thing that can perceive, think or be commanded. The player is the only thing that can hold a rifle. The scripted shooter you asked to give a body is the first of many things that are neither (section 4, The game layer).
7. **Stop the generator answering questions nobody asked**, and separate a world from what has been proved about it (section 4, Generation).
8. **Keep sittings' recordings alive across updates** (section 6, rule 11).
9. Smaller things, each in its section: the motor at triangle seams, the browser shell's one large class, a day spent on a tiny second game.

## 3. Your question: what is the core challenge?

You played the first fight and said a target who runs early forces one or two strategies: take the minimum shots from outside, or alarm the camp and take him on his way out. Both skip the camp. I agree, and the numbers say it's structural.

**What the numbers say** (`npm run experiment -- quiet-kill`, 24 camps, one guard taken through the head):

| | Of the rest, searching 5 s later | 20 s later | Siren within 150 s | Target gone |
| --- | --- | --- | --- | --- |
| Silently, as a knife would | 38% | 60% | 2 of 24 | 2 of 24 |
| Suppressed, from the best overview | 99% | 91% | 10 of 24 | 10 of 24 |
| Loud, from the best overview | 99% | 91% | 10 of 24 | 10 of 24 |
| Suppressed and subsonic, from 90 m | 98% | 87% | 8 of 23 | 8 of 23 |
| Subsonic from 90 m, with each sound read by how clearly it was heard | 85% | 84% | 7 of 23 | 7 of 23 |
| Subsonic from 90 m, read that way, and the camp's whistle only turns heads | 67% | 75% | 7 of 23 | 7 of 23 |

The man taken is the first one standing still in view of the best overview, so he's often in other men's view too: that's why even the silent row starts at 38%. Where the siren sounds, it sounds a median 7 s after the man falls, and the target is gone a median 25 s after he fell. The overviews stand 240 to 460 m from the camp: 45 to 85 s at a sprint. So once anything loud has happened, nobody on a ridge can reach anything that matters before the mission is decided.

**Why it happens.** Three things multiply.

1. **One way to lose, on a short fuse nothing can lengthen.** The design doc's second idea is right: "an alarm doesn't kill you; it costs you the objective." But its fourth anti-goal is "not instant-fail stealth", and 25 seconds from the first loud sound to a lost mission is instant-fail stealth with a short delay.
2. **News saturates.** One man's evidence becomes every man's alarm within seconds. I tested the obvious suspect first, the law of sound, by letting each of a shot's sounds count for less when it's fainter. For a suppressed shot from a ridge it barely moved anything: 99% became 95%. For the quietest rifle shot there is, 98% became 85%, and taking the whistle away as well made it 67%. What saturates the camp is what happens after the first man knows. He shouts "Man down!", which raises everyone in earshot as far as seeing the body would. The radio carries it. In a camp that fights, someone blows a whistle that carries 600 m. Each of those channels tells whoever hears it to go to the same high state, whatever they themselves know. Even a silent kill, with no whistle at all, has 60% of the camp searching 20 seconds later. So "who can see whom", the design's first idea, stops mattering at the first casualty, however quietly it's done.
3. **Nothing the mission needs is inside the wire**, except on the camps built around going in.

**What I'd make the core challenge.** *Break the camp's protection of the objective before the camp's picture of you is good enough to stop you, then get out.* Two pictures race: yours of the camp, built by watching, and the camp's of you, built from evidence. Every act buys progress and costs evidence. Escalation should change the problem at each step, and only its last step should lose the objective.

| Stage | What starts it | What the camp does | What you can do about it |
| --- | --- | --- | --- |
| Routine | Nothing | Posts, patrols, check-ins | Quiet work: the sightline puzzle |
| Stand-to | Hard evidence anywhere | Men to fighting positions. The target goes to a hard room with whoever protects him. The camp looks for the source | Go in while they face outward, or wait them out: stand-to ends |
| Relief called | The alarm, or a threat believed inside the wire | The radio calls the relief. It arrives after a delay you can hear coming | Cut the radio first, and nobody is coming. Ambush the road |
| Extraction | The relief arrives | He walks to a vehicle under escort and leaves | The walk is a shot your pressure created. A vehicle you disabled earlier strands him |

Every family of plan has a place in that. A ghost never leaves the first row. A sniper gets one free shot at most, and only on a camp where the target shows himself. Someone who goes in has minutes, not seconds, and a camp facing outward. Flushing him out is still a plan, but it now costs a fight with the relief, where today it's the cheapest thing to do.

**The choice is yours.** Four ways to answer it:

| | What changes | Cost | What it buys |
| --- | --- | --- | --- |
| **A. Shelter, then extract** (recommended) | On alarm the target goes to a hard room. He leaves when the relief arrives, or sooner only if the camp believes the threat is inside | Medium: a hard room in the generator, the target's protection, the relief's truck as his way out | The four stages above. The camp's engines get a mission to matter in |
| **B. Readiness decides** (recommended with A) | A relaxed camp panics and runs him, as today. An alert or prepared one does A | Small once A exists: readiness is already a decided call | Today's behaviour stays, as the weakest camp's mistake that a good player exploits |
| C. Lengthen the fuse | Tuning: he waits before running | Tiny | The same two strategies, more slowly |
| D. Bring an objective forward | A mission whose goal is inside: take something, break something | Medium, and it's Phase 3 content | A reason to go in that needs no change to the alarm |

I recommend A with B. C doesn't change the shape of the problem, and D is worth doing but treats the symptom.

**And two dials for the camp.** Whatever you choose above, the camp needs to stop being all-or-nothing, or stealth ends at the first body. A guard's alert state today mixes two things: what he personally knows, and what the camp has told everyone to do. They should be separate: a whistle or a siren changes the camp's *posture* (men stand to, look up, hold their positions, sharpen), and only a man's own senses, or a report that says where, change what he *knows*. A camp at stand-to that doesn't know where you are is still a camp you can work around. That is rule 13 taken one step further: an alarm is information about the camp, not about you.

**What would buy a quiet kill.** Three things together, none of which works alone: the posture split above; a strike that sounds like a thud and not a shot (the data is in place: `perception.awareness.shots`); and a quiet tool in the core kit, which the design doc already names: the subsonic load, slow, with heavy drop, good to about 100 m. That last one pulls you off the ridge and down toward the wire, which is where you want the game to happen.

## 4. Engine by engine

### The kernel: keep

One tree of plain data for all state, systems that declare what they read and write, recordings that re-simulate bit for bit, save and restore, and a compile check that the kernel stands alone. This is better than most shipped games have, and it's what makes every other number in this review cheap to get.

- **Evidence.** 762 of 763 tests passed on `main` when I started; the one failure was a 120-second timeout on a machine that was heavily loaded, and it passed on the next run. On the branch all 770 pass (`npm run check`). A ten-minute bot run re-simulates to the same hash. A tick costs 256 µs on that loaded machine, under 1% of the 33 ms it has. All eleven pinned runs gave the same fingerprints after every change I made.
- **Limits, none urgent.** Spawning or removing an entity rebuilds the whole index. Entities are found by kind only. Both are fine for a camp and would need work for a horde or an open world: a contained change when the time comes.
- **One thing tightened here.** A guard's mind was handed the whole static world, which includes where the player came into the valley and everything the generator worked out about how to take the camp. No brain read either, but nothing stopped one, and the test that catches omniscience wouldn't have caught it. A mind is now handed its camp's own ground and no more, by type, and a test keeps it so.

### Body and motor: keep

The most intricate code in the project, and the best tested. The "about one run in five" was the instrument, not the motor (section 7). After my two commits, 40 fresh valleys with both bots for 15 minutes each, the movement scenes and 200 ladder towers hold every promise.

- **One known inexactness, written down.** The motor judges a move by where it ends, so on the way to ground it can stand on, a body can clip a corner of a steep triangle uphill: up to 58 mm in a tick, never faster than a walkable grade, and nothing it can climb by. Making it exact changes every pinned run near steep ground for something no player can see. It's in the motor's header and on the bench, and I'd leave it until there's a reason.
- **Cost.** The motor is 69% of a tick: 16 µs a body. That's nothing for 16 guards and would be the first thing to matter for hundreds.
- **For the futures.** Modes exist (ground, air, mantle, ladder), so a parachute or a swim is a new mode. A vehicle you drive is not a mode: it's a lane of its own. Today's trucks are shapes moved along a road by a script.

### Ballistics: keep

One closed-form trajectory that the bullet, the reticle, the zero dial and the rangefinder all read, so they can't disagree. Shots resolve against what was on screen. I found nothing to change.

- **For the futures.** The rifle is one hard-coded weapon (57 places outside the lane name it). More weapons and limited loadouts need weapons as a table and a loadout on the person. Mechanical, and best done with item 6 above.

### Perception: keep the laws, change how news spreads

Sight with range caps, hearing that floods round buildings and loses level through walls, and the awareness ladder are each careful work.

- **Improve: the ladder mixes two things** (section 3): what a man knows, and what he's been told to do.
- **Improve: sniping range.** A prone shooter can't be seen past 120 m, and the ridges start at 240 m. The muzzle flash is the first rule that reaches that far, and it's close to all-or-nothing: 520 m loud, 140 m suppressed. This needs one deliberate law for long range, as your desk already notes.
- **Done here.** What each sound of a shot tells a listener is data, with the old behaviour as the default.

### The brain: rebuild its structure

- **What it is.** One file of 1,157 lines: a switch over a guard's alert state, a list of options with priorities, and one procedure per act. Fourteen acts share one memory record of 43 fields.
- **Why it has to change.** Every new behaviour adds a name, more fields on that shared record, a priority squeezed between the existing ones (4.5, 4.6, 4.7 and 5.5 arrived with the first fight), and a flag the game has to poll afterwards. The system that runs it now declares 21 kinds of state it writes and 8 kinds of event, so the declared-access check, which is one of the kernel's best ideas, tells you nothing there. And there is nothing between one man and the whole camp. Step 2 of the camp work needs sections that sweep and pairs that cut off the road. Step 3 needs a counter-sniper pair, a gun crew and close protection. Each is men acting together.
- **What to build.**
  1. **Acts as modules.** Each with its own memory, its own offer and its own procedure. Which acts a role has, at which priority, becomes a table in tuning. Readiness levels are then tables too.
  2. **Actions out, as orders already are.** Firing, using a device, speaking and boarding leave the brain as typed actions, the way movement leaves it as an order. The one large system becomes several small ones.
  3. **A layer between the man and the camp:** a section, with a leader, a job and a mind of its own, fed by the same honest channels.
  4. **The camp's posture as its own state**, apart from each man's awareness.
- **The plan, step by step.** The first four change nothing a player could see, and this codebase can prove that: after each, every pinned run must give the same behaviour fingerprint.
  1. **Split the memory.** The one record becomes a small core (what he's doing, since when, why), one record for each act that keeps anything (cover, alarm, report, task, search, engage, flee), and what he's been told. It changes how state is stored, so `STATE_SCHEMA` goes up and nothing else moves.
  2. **One module an act,** in `brain/acts/`: what it offers, how it begins, how it's carried out. `decide()` becomes a loop over the acts a role has.
  3. **Priorities become data:** for each role and alert state, the acts on offer with their rank and weight, in tuning. The branches for a camp that fights become a second table, with the same numbers.
  4. **Actions out.** `fire`, `use`, `say`, `radio`, `board` and `signal` as typed entries the brain adds and small systems carry out, each declaring only what it touches. They replace the six flags the game polls today.
  5. **Posture.** The camp's posture as its own state, set by signals, and given to each mind as a fact about his camp. Whistles and sirens stop raising what a man personally knows. This is the first step that changes behaviour: measure it with `quiet-kill` and the ladder.
  6. **Sections.** An entity with a mind of its own: its members' reports in, a job from the commander, orders to its men by voice. Sweeps and cut-offs are built here.
- **Cost.** Three to five days of agent work for steps 1 to 4. It collides with any other work in `brain.ts`, so do it between steps of the camp work, not during one.
- **What it unlocks.** Sections, crews and pairs. Readiness as data. A second camp. Other kinds of mind (a dog, a civilian, a zombie) as different tables over the same machinery.

### Generation: keep, and stop it answering questions nobody asked

The pipeline and its analysis are serious work: the way-in search is a published planning method adapted to a detection meter, held to a brute-force answer by tests.

- **Where the time goes.** In my profile: the way-in search 39%, who-sees-what 13%, floods over the grid 12%, staffing 11%, chokepoints 9%. On a camp where the target has to be flushed out, the way-in search runs its whole budget of 400,000 states and returns "don't know", for a question that camp's rules never ask. That's 5 of the 8 camps I profiled.
- **Done here.** The same search, giving the same answers and the same counts bit for bit, 19% quicker (14.2 s to 11.5 s over five camps), which takes 8% off building a world. The fingerprints of 24 worlds are unchanged.
- **Next, and it needs a new generation version, so it belongs with the compound-types work:** skip the searches a camp's problem doesn't need. By the profile that's about a third of the time those camps take.
- **A structural point.** A world's fingerprint covers the analysis's own counters, such as how many states a search expanded. So any improvement to an analysis changes the identity of every seed, even when the camp is the same camp. Separate the two: the world is what you play on, and the certificate is what's been proved about it, with a version of its own.
- **Certify by playing.** The analysis works on a model that disagrees with the real simulation about a quarter of the time on dead ground, and certified ways in are detected on 10 of 41 camps when replayed with real perception. The simulation runs over a hundred times faster than real time. Make "replayed in the real simulation, undetected" the last gate of a certificate.

### The game layer, and what a person is

The game layer is the largest part of the simulation (12,400 lines), because the systems live there: the lanes are mostly libraries. Two things follow.

- **"A foundation for many games" is unproven, and that's fine for now.** A second game would reuse the kernel and the lanes' laws and rewrite the wiring. Don't invest more in that claim before a mission is fun. One cheap test, later: a day on a tiny second game, listing what had to change.
- **People should be one kind of thing.** A guard is the only thing that can perceive, think or be commanded (22 places ask for "every guard"). The player is the only thing that can hold a rifle or take input. Your ask for a scripted shooter with a body is the first thing that's neither. The target, an escort, a counter-sniper, a relief squad, an animal, a second camp's men are next. Make a person something with parts (a body, senses, a brain, a weapon, controls), and have each system ask for the part it needs. Two to three days. It's what "the camp takes inputs, and the player is one way of providing them" looks like in the code.
- **One camp.** The world has one camp and one commander (about 130 places assume it). Leave it until a second camp is real, but put a camp's id on its men when people become one kind.

### The lab bench: keep, and repair its bots

Paired camps, intervals, re-rolled dice, forked runs and flaw detectors are a real asset: the numbers behind every call in this review took minutes.

- **The ladder is blind** (`npm run experiment -- ladder`, 16 camps): careless wins 0, shoot once and leave 1, perfect and static 0, shoot and relocate 3, and on 12 camps nobody wins. Shoot-once fires an average of 0.13 rounds, because it can't see the target. The bots predate the buried target.
- **Build one planner** that reads what the analysis certifies for a camp (a way in, a flush, a walk) and plays it through the real simulation, limited to what a person could do. It doubles as the certificate's last gate.
- **Done here: an experiment builds each camp once.** Every arm used to build its camp again. `quiet-kill` on six camps went from 135 s to 40 s, with the same report to the character. A cache on disk, so that a second command reuses the first one's camps, is the next step.

### The renderer and the browser shell

I couldn't judge feel or frame rate: both need your machine. Structurally, the browser shell is one class of about 1,900 lines holding play, replay, trials, the explorer and the compound simulator. Split it by mode before Phase 2 adds the brief, the map and the debrief.

### Tests and checks

The suite took 17 minutes here, and over 20 on CI. The balance you set, test what's settled and measure what's still moving, is right, and one thing contradicts it today: see rule 11 below.

## 5. The futures

What each named goal needs from today's code. None argues for a rebuild.

| Goal | What's already there | What it needs |
| --- | --- | --- |
| More weapons, limited loadouts | Loads as data, one exact trajectory | Weapons as a table, a loadout on the person |
| Many bases in an open world | Camps laid out in site frames, entities that spawn | A camp id on its men, a commander each, terrain in tiles, an index that doesn't rebuild |
| Target pursuits | Routes across the whole map, the truck | People as one kind, so a target can run, hide and be hunted like anyone |
| Survival | Save-states, runtime colliders | Items, and people as one kind |
| Evade and escape | The way out, the relief | The camp that hunts (step 2), on the rebuilt brain |
| Land, air and water vehicles | Solid shapes that move | A vehicle lane. The motor stays for bodies |
| Other creatures and factions | Factions, perception by side | People as one kind, acts as tables |

Two items carry most of that table: people as one kind, and the brain rebuilt. Both are worth doing for the current roadmap alone.

## 6. Rules I'd change

- **Rule 10, the motor's promise about steep ground.** As written ("never gains height on ground steeper than the limit, from any angle") it isn't quite what the motor does, and the check for it was wrong in a way that hid for a day. Say what's kept exactly: *a body never ends a tick higher on ground too steep to stand on, and gains nothing on the steep ground it began the tick on.* The motor's header says this now. I left `CLAUDE.md` for you.
- **Rule 11, pinned behaviour.** Two problems. First, the camp's fight is pinned in every engine, though by your own rule its outcomes should be pinned "once a person has played the step and it has settled". Pin its invariants and its work budgets, and leave its fingerprint out of the build's digest until then. Second, one digest covers every pinned run, so any change to the camp's brain makes every kept recording unplayable, including a movement sitting that has no camp in it. Carry a digest per lane a scene uses. Your sittings' evidence would then survive most updates.
- **Rule 13, brains see only their minds.** Right, and the mind was wider than the rule: fixed here (section 4, The kernel). The rule could say so: *a mind's world is its camp's own ground.*
- **Rule 6, generation's fingerprint.** It should cover the world, not the proofs about it (section 4, Generation).
- **One law of sound.** Keep it. Add its other half: one law says what is heard, and a separate, equally honest one says what a listener can tell from it. The strike's 650 m radius is really a hit confirmation for the player written as a world sound, and that's a taste call: section 9.
- **Sixteen guards at most.** It was set for frame rate, and the simulation's cost per guard is a few microseconds. Let the fight decide the number, then measure drawing them.
- **Lab F inside the gate.** Your desk already marks this for reopening, and I agree: the lab is right, and making the first whole mission wait for all of it is the part to undo.

## 7. What's on the branch

Branch `claude/fable-advisor-f47b5c`, from `main` at `d66b7b1`. Small commits, each with the tests it touches passing, and `npm run check` green on the whole: 86 files, 770 tests.

| Commit | What | Moves |
| --- | --- | --- |
| The steep-ground promise, measured where it's kept | The watch charges height gained on steep ground to where it was gained (`Heightfield.gainOnSteep`). Tests for both directions | Nothing a player sees. One new bench number |
| The foot of a low ledge is no way up it | The motor fix for the hole the watch found | `SIM_VERSION` 13. No pinned run or bench number |
| A shot's sounds are data, and the quiet kill is measured | `perception.awareness.shots`, the experiment, a subsonic report for the simulator's shot | The tuning grew, so the golden recording is rewritten. No fingerprint |
| The way-in search, a fifth quicker, bit for bit | Beaten labels leave their lists; the heap holds label numbers | Nothing: 24 worlds' fingerprints are the same |
| An experiment builds each camp once | The runner hands a process a camp's runs together; `src/lab/worlds.ts` | Nothing: the reports are the same |
| A mind is handed its camp's ground | `Ground` in `brain/mind.ts`, and a test | Nothing: types only |
| This review | | |

**The motor, in full.** In all five failing runs the body had slid off a steep triangle onto a walkable one that rose the way it was going. Every millimetre was gained on the walkable one, and the watch charged the tick's whole rise to where the tick began. Measuring properly then found two things the old check couldn't see: the ledge hole, about one run in fifty, now fixed; and the corner clipping described above, reported and left.

**To merge.** Nothing here touches the generator's output, the escape vehicle, `camp.ts` or `comms.ts`. Three places will conflict with other branches, all mechanically:
- `SIM_VERSION`: take the higher number plus one.
- `tests/golden/TAL-4471-wander.slrec`: run `npm run golden` after merging.
- `docs/decisions.md`: both sides add entries at the top.
The way-in search commit changes `src/sim/generation/infiltrate.ts` only, and no world: the compound-types session can take it at any point. The mind's type touches signatures in the brain lane (`World` became `Ground` in five files), which the camp's next step will also edit: take it before that step starts.

## 8. What I couldn't verify

- **Feel, fun and frame rate.** Nothing here was played by a person or drawn on a real machine.
- **Pictures.** `npm run look` timed out in the headless browser on a loaded machine. I looked at one older picture of the honest view from a ridge, which reads cleanly and confirms how small a camp is from there.
- **The browser tests** (`npm run test:browser`) and the other engines: not run. CI will.
- **Timings.** The machine was busy with other sessions throughout. Every time here is CPU time, a sampling profile, or a before-and-after pair run back to back. None is a clean wall-clock figure, and generation's "about 3 s" took 7 s here.
- **The first-fight branch.** I didn't read it. My view of the escape comes from `main`.

## 9. Decisions for you

1. **What an alarm costs** (section 3): A with B, C, or D. I recommend A with B.
2. **Two dials for the camp:** posture apart from what each man knows. I recommend yes, and it should come before step 2 of the camp work.
3. **A strike is a thud, not a shot.** The graded reading is ready as data (`GRADED` in `src/lab/experiments/quietKill.ts`). Alone it changes little, so I'd switch it on with decision 2, not before.
4. **A quiet tool in the core kit:** the subsonic load, brought forward from Phase 3. I recommend yes.
5. **Rebuild the brain's structure before step 2.** I recommend yes.
6. **The whole mission before more of the camp:** reopen the gate, as your desk suggests. I recommend yes.
7. **Do you need to hear your hit at 300 m?** If a falling man seen through the scope is confirmation enough, the strike's radius can come down to something a camp wouldn't hear across a valley. Yours to call.
