# Foundation review: the vision I chose, and why

Nov 9, 2026. Written for the owner by an advisor session on `claude-fable-5-2`.

The brief came twice. First: judge the foundation freshly, say what to keep, improve or rebuild, and do what was worth doing. Then, wider: treat everything built so far as a moodboard, start from an empty tree if that's the path to the ideal game, and prove the work by whatever standard I judge right. This is my account of what I chose under the second brief, and why. Everything measured here is one command away, and the commands are named. The work is on the branch `claude/fable-advisor-f47b5c` (pull request 30 on `willgibs/sightline`, a draft), and section 8 says how to take it.

## 1. The verdict

**I didn't start from an empty tree.** I took the offer seriously, and the test I used was this: *starting from nothing, with everything the project now knows, would I build this part differently in a way you could feel when you play?*

- **Where the answer was no, the part stays, because it's right and not because it's there.** That's the core that everything stands on, the body and its motor, the rifle, the laws of sight and sound, the camp generator and its analysis, the lab bench, and the choice of a browser and a simulation that repeats exactly. From an empty tree I'd arrive at the same things some weeks later, with more bugs, and you'd feel no difference. The browser is what lets you judge by opening a link. The exact simulation is what makes bots, experiments, replays and "what if" cheap, and that's how a project with one person playing learns anything. A native engine would buy art and lighting, which are out until the concept is proven. I'd ask the question again then, and not before.
- **Where the answer was yes, I rebuilt it or laid the rebuild out.** There are four such places: the mission's contest, the guard's brain, what a person is, and how a camp is certified. The first is the one that matters, and it's the one I built.

**What I built from the ground up: the mission's contest.** The weakest thing in the project wasn't in any engine. It was what happens after the first loud moment: the target ran, and 27 seconds later the mission was lost, whatever you or the camp did next. No tuning fixes that, because the shape is wrong. So I built the shape I think the game needs, as a mode you can open today: **the takedown**. A camp that protects its target answers trouble in stages. Each stage is something you can see or hear, each hangs on something in the world, and each can be worked against. Section 2 says how to play it, and section 3 what it is.

**What else is new since the first review:**
- **A quiet round can be quiet,** in that mode. A camp reads each sound of a shot by how clearly it heard it, its whistle turns heads where it used to hand every man the alarm, and the kit carries the subsonic load.
- **The brain's rebuild has a first piece.** The takedown's acts live in a module of their own, on shared moves taken out of the one large file. It's the pattern section 5 lays out for the rest, proven on one case. It is not the rebuild.
- **A vehicle that's held up no longer waits for ever.** That was a way for a mission to hang, with the target neither gone nor anywhere you could reach.

**The standard I held the work to,** since you asked me to say:
1. **A person can play it.** You can open it, every stage shows itself, and every link is something you can act on with keys the game already has. I drove it in a real browser at 120 frames a second, from a loud shot to the target's vehicle on the road. I can't tell you it's fun. Only you playing can.
2. **Every link is real.** Take one away and what happens next changes. That's measured on 24 camps (`npm run experiment -- takedown`) and held by tests (`tests/takedown.test.ts`).
3. **Nothing that was true stopped being true.** A camp that isn't in the mode plays as it did: every pinned run gives the same behaviour fingerprint, and the whole suite passes. Inside the mode the simulation still repeats exactly: four minutes of an attacked camp re-simulate from their recording bit for bit.
4. **What I didn't hold it to:** exact timings. The seconds are still to be found by playing, so the tests hold the order of the stages and what each link does, not when.

**What didn't work, plainly.**
- **My first idea about the quiet kill was wrong.** I expected the law of sound to be the problem. Letting a faint sound count for less barely moved anything: 99% of the camp searching became 95%. The cause is how news spreads (section 3).
- **A quiet kill still isn't quiet enough,** even in the mode. Five seconds after a man falls to the quietest round there is, 67% of the camp is searching, because someone sees him fall and shouts. The whistle is fixed. The shout and the radio aren't, and that's the next piece (section 4, choice 3).
- **The instrument for "good plans win" is still blind.** On 12 of 16 camps no bot wins at all. I didn't build the bot that would fix it.
- **Nobody has played any of this.** Everything below is a design with numbers behind it until you have.

## 2. Play it

```bash
npm run dev
```

Then open `http://localhost:5173/?scene=takedown&params=seed=LEB-2534%26perch=1&lab`.

- `perch=1` starts you on the camp's best overview, 194 m out. Leave it off to walk in from the edge of the valley.
- `&lab` shows the lab panel. Its `protection` line says in words where the camp has got to: "in his room · relief called 40 s ago · waits 200 s more". It shows the truth, so leave it off for a blind sitting.
- Any camp works: `seed=DEG-0219`, `seed=HOT-7106`.
- The same camp, not ready for trouble, is `?scene=live-camp` with the same parameters. That's the game as it was.
- The pull request's preview deploy should have it too. I didn't open it: only your Vercel account can.

Five things to try, a few minutes each. F3 opens the debug view, where R restarts the run and the square brackets change the speed of time.

1. **Make noise and watch.** Fire one round at nothing. A whistle, and the men get down. Then the siren. He's in his room, and the relief is called. A minute and a half later a truck comes up the road and stops short of the gate. Two men run to his door. "Time to go. Move!" He runs for his vehicle and it drives out. Once the alarm is up, that run is the only time he's in the open, and your noise made it happen.
2. **Cut the radio first.** Go in quietly and hold G at the radio set for two seconds. Then make noise. Nobody is called, and nobody comes to his door. He waits four minutes, loses his nerve, and runs for it alone.
3. **Take his vehicle first.** Hold G at it for four seconds. When they come for him he gets to it, finds it dead, and goes back to his room. He's still in the camp, and so are you.
4. **Stand in the road.** Be in front of his vehicle as it pulls out. The camp's own men step out of its way. You don't, and after 12 seconds he gets out and runs back.
5. **The quiet round.** T fits the suppressor (3 s) and Y changes to the subsonic load (2.5 s). It's slow and it drops heavily: good to about 100 m, so it wants you down off the ridge and near the wire. In my run, a suppressed round from the overview that struck a tree short of the camp turned no heads at all.

I checked 2, 3 and 4 with the camp's switches and in tests, not by walking a body in (section 9).

## 3. The takedown

**The problem, in numbers.** You played the first fight and said a target who runs early forces one or two strategies: take the minimum shots from outside, or alarm the camp and take him on his way out. Both skip the camp. The numbers say it's structural (`npm run experiment -- quiet-kill`, 24 camps, one guard taken through the head):

| | Of the rest, searching 5 s later | 20 s later | Siren within 150 s | Target gone |
| --- | --- | --- | --- | --- |
| Silently, as a knife would | 38% | 60% | 2 of 24 | 2 of 24 |
| Suppressed, from the best overview | 99% | 91% | 10 of 24 | 10 of 24 |
| Loud, from the best overview | 99% | 91% | 10 of 24 | 10 of 24 |
| Suppressed and subsonic, from 90 m | 98% | 87% | 8 of 23 | 8 of 23 |
| Subsonic from 90 m, with each sound read by how clearly it was heard | 85% | 84% | 7 of 23 | 7 of 23 |
| Subsonic from 90 m, read that way, and the camp's whistle only turns heads | 67% | 75% | 7 of 23 | 7 of 23 |

Where the siren sounds, it sounds a median 7 s after the man falls, and the target is gone a median 27 s after he fell. The overviews stand 240 to 460 m from the camp: 45 to 85 s at a sprint. So once anything loud has happened, nobody on a ridge can reach anything that matters before the mission is decided. Three things multiply:

1. **One way to lose, on a short fuse nothing can lengthen.** The design doc's second idea is right: "an alarm doesn't kill you; it costs you the objective." But its fourth anti-goal is "not instant-fail stealth", and 27 seconds from the first loud sound to a lost mission is instant-fail stealth with a short delay.
2. **News saturates.** One man's evidence becomes every man's alarm within seconds. He shouts "Man down!", which raises everyone in earshot as far as seeing the body would. The radio carries it. In a camp that fights, someone blows a whistle that carries 600 m. Each of those tells whoever hears it to go to the same high state, whatever he himself knows. So "who can see whom", the design's first idea, stops mattering at the first casualty, however quietly it's done.
3. **Nothing the mission needs is inside the wire,** except on the camps built around going in.

**The core challenge I'd build the game around.** *Break the camp's protection of the objective before the camp's picture of you is good enough to stop you, then get out.* Two pictures race: yours of the camp, built by watching, and the camp's of you, built from evidence. Every act buys progress and costs evidence. Escalation changes the problem at each step, and only its last step loses the objective.

**What I built.** A camp can be *relaxed* or *alert*. A relaxed camp is the game as it was: it panics and runs him. An alert camp protects him:

| Stage | What starts it | What the camp does | What carries it | What you can do about it |
| --- | --- | --- | --- | --- |
| Routine | Nothing | Posts, patrols, check-ins | | Quiet work: the sightline puzzle |
| Stand-to | A whistle | Men with nothing of their own to go on get down and watch. He goes to his hard room | The whistle, heard | Move while they're down and looking about, or wait: it ends after about a minute of quiet |
| Lockdown | The siren | He stays in his room. The relief is called | The radio: a working set and a live operator | Cut the radio first, or take the man who works it, and nobody is coming |
| Fetch | The relief at the gate, 90 s later | Two men run to his door and tell him aloud that it's time | Two men and their voices | Stop them on the way and he doesn't know. More are sent, three times in all |
| Extraction | He's told | He runs for his vehicle and it drives out | His legs, the vehicle, the road | The run is a shot your pressure created. A vehicle you disabled strands him. A road you stand in stops it |

If nobody comes for him, he waits four minutes, loses his nerve and runs alone. That's the last step and the only one nothing carries, so a camp you've cut off still ends, and still gives you his run.

**What it measures** (`npm run experiment -- takedown`, 24 camps, a scripted sniper on the best overview firing every 8 s; medians from his first shot; the siren sounded on 21 camps, and he never hit the target):

| | Siren | Relief at the gate | Told to come | Left his room | Gone |
| --- | --- | --- | --- | --- | --- |
| Relaxed: he runs at the siren | 5.8 s | – | – | 6.0 s | 21 of 21, at 27 s |
| Alert: he shelters, and is sent for | 6.6 s | 97 s | 18 of 21 | 126 s | 21 of 21, at 156 s |
| Alert, no radio | 6.6 s | never | 0 of 21 | 247 s | 21 of 21, at 267 s |
| Alert, no vehicle | 6.6 s | 97 s | 0 of 21 | never | 0 of 21 |

So the half minute is now two and a half, with three places to act inside it, and each link does what the table above says it does. The 3 camps of 21 where he was never told are the same thing happening unplanned: the sniper's first round had taken the radio operator, so nobody could call the relief, and the target ran alone when his nerve went. A sniper who only sits and shoots still loses him on every camp, which is right: staying put should lose.

Every family of plan has a place in that. A ghost never leaves the first row. A sniper gets one free shot at most, and only on a camp where the target shows himself. Someone who goes in has minutes, not seconds. Flushing him out is still a plan, but it now costs a fight with the relief, where it used to be the cheapest thing to do.

**How it's built, in one paragraph.** A brain knows only what its mind holds, so nothing here is scripted over the guards' heads. The target acts on the whistle and the siren he heard and on what was said at his door. The men sent act on an order. The relief is called only if the radio can carry the call. The mode is the live camp with a set of numbers of its own over the game's, which a scene can now carry, so the game outside the mode is untouched. `docs/decisions.md` has the details.

## 4. The game changes this makes, as your choices

Each of these changes the game itself. In the build they're confined to the takedown, except where I say so.

| | What changes | Where it stands | I recommend |
| --- | --- | --- | --- |
| **1. Readiness decides what an alarm costs** | An alert camp shelters him and extracts him when the relief comes. A relaxed camp runs him at once, as the weakest camp's mistake | Built. The mode only | Yes, once you've played it. Make alert what a camp is, and relaxed the easy end |
| **2. A camp reads what it hears** | A shot's sounds count by how clearly they were heard, and a whistle turns heads and brings on the stand-to | Built. The mode only | Yes, with 1 |
| **3. Two dials for the camp, all the way** | What a man knows is kept apart from what the camp has told everyone to do. A shout or a radio call changes the camp's posture; only a man's own senses, or a report that says where, change what he knows | Not built. The whistle is the first channel done this way | Yes. It's the next piece of the camp work, and it's what a quiet kill still needs |
| **4. The subsonic load in the kit** | Y changes the load. Brought forward from Phase 3 | Built. Only the takedown's kit carries it | Yes |
| **5. A held-up escape ends** | The camp's men step out of their vehicle's way. Anyone else who holds it for 12 s makes him get out | Built, in every camp, because the alternative was a mission that hangs | Keep. Running someone down belongs with shooting the driver, in Phase 3 |
| **6. The seconds** | Relief 90 s after the siren. He gives up after 240 s. Men sent again every 45 s, three times | In tuning (`brain.protect`, `brain.reinforce`) | Find them by playing. I'd expect the 240 to come down |
| 7. Lengthen the fuse instead | He waits before running, and nothing else changes | Not built | No. The same two strategies, more slowly |
| 8. Bring an objective inside the wire forward | A mission whose goal is in the camp: take something, break something | Phase 3 content | Worth doing later. It treats the symptom |

**How this sits with the ask on your desk.** Your desk has an open question: what should the target do when the camp comes under attack? Its four answers are that he digs in and leaves only if the camp is losing, that it depends on the camp's problem, that he still runs but later, and that he never runs. The takedown is a fifth, between the first and the third: he digs in, and leaves when help has come for him. I chose it over "only if the camp is losing" for two reasons. A camp that has to judge whether it's losing leans on beliefs that saturate today, so it would judge badly. And a relief truck is something in the world: you can hear it coming, cut the call that sends it, or meet it on the road, where "the camp decides it's losing" happens in nobody's sight. It keeps a clock on the mission without the clock being a bare timer. The first answer's trigger is still worth having on top: release him early when the camp believes someone is inside the wire, or his room is under fire. That isn't built. The readiness levels are the ones you've already called: relaxed and alert are here, and prepared has no behaviour of its own yet. Nothing on the desk is changed by this, and the question is still yours.

**One more, from the first review, still yours:** do you need to hear your hit at 300 m? A body's strike carries 650 m so that you do. If a falling man seen through the scope is confirmation enough, that radius can come down to something a camp wouldn't hear across a valley.

## 5. Engine by engine

### The kernel: keep

One tree of plain data for all state, systems that declare what they read and write, recordings that re-simulate bit for bit, save and restore, and a compile check that the kernel stands alone. This is better than most shipped games have, and it's what makes every other number in this review cheap to get.

- **Evidence.** 762 of 763 tests passed on `main` when I started; the one failure was a 120-second timeout on a machine that was heavily loaded, and it passed on the next run. On this branch the whole suite passes (`npm run check`; section 8 has the count). A ten-minute bot run re-simulates to the same hash. A tick costs 256 µs on that loaded machine, under 1% of the 33 ms it has. All eleven pinned runs gave the same behaviour fingerprints after every change I made, the takedown included.
- **Limits, none urgent.** Spawning or removing an entity rebuilds the whole index. Entities are found by kind only. Both are fine for a camp and would need work for a horde or an open world: a contained change when the time comes.
- **One thing tightened here.** A guard's mind was handed the whole static world, which includes where the player came into the valley and everything the generator worked out about how to take the camp. No brain read either, but nothing stopped one, and the test that catches omniscience wouldn't have caught it. A mind is now handed its camp's own ground and no more, by type, and a test keeps it so.

### Body and motor: keep

The most intricate code in the project, and the best tested. Section 8 has the story of the "about one run in five". On the merged code, 40 fresh valleys with both bots for 15 minutes each, the movement scenes and 200 ladder towers hold every promise: 3.7 million ticks.

- **One known inexactness, written down.** The motor judges a move by where it begins and ends, so between two pieces of ground it can stand on, a body can clip a corner of a steep triangle uphill: up to 68 mm in a tick, never faster than a walkable grade, and nothing it can climb by. Making it exact changes every pinned run near steep ground for something no player can see. It's in the motor's header and on the bench, and I'd leave it until there's a reason.
- **Cost.** The motor is 69% of a tick: 16 µs a body. That's nothing for 16 guards and would be the first thing to matter for hundreds.
- **For the futures.** Modes exist (ground, air, mantle, ladder), so a parachute or a swim is a new mode. A vehicle you drive is not a mode: it's a lane of its own. Today's trucks are shapes moved along a road by a script.

### Ballistics: keep

One closed-form trajectory that the bullet, the reticle, the zero dial and the rangefinder all read, so they can't disagree. Shots resolve against what was on screen. I found nothing to change, and added one thing: the kit says which loads it carries, and a key changes between them.

- **For the futures.** The rifle is one hard-coded weapon (57 places outside the lane name it). More weapons and limited loadouts need weapons as a table and a loadout on the person. Mechanical, and best done when people become one kind of thing (below).

### Perception: keep the laws, change how news spreads

Sight with range caps, hearing that floods round buildings and loses level through walls, and the awareness ladder are each careful work.

- **Improve: the ladder mixes two things** (section 4, choice 3): what a man knows, and what he's been told to do.
- **Improve: sniping range.** A prone shooter can't be seen past 120 m, and the ridges start at 240 m. The muzzle flash is the first rule that reaches that far, and it's close to all-or-nothing: 520 m loud, 140 m suppressed. This needs one deliberate law for long range, as your desk already notes.
- **Done here.** What each sound of a shot tells a listener is data, with the old behaviour as the default. The takedown reads them by how clearly they were heard, and its whistle is the first channel that changes what men do without changing what they know.

### The brain: rebuild its structure

- **What it is.** When I started, one file of 1,157 lines: a switch over a guard's alert state, a list of options with priorities, and one procedure per act. Fourteen acts shared one memory record of 43 fields.
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
- **Begun here.** The takedown's acts (sheltering, standing to, fetching) are the first to live in a module of their own, `brain/protect.ts`: what they remember, when they're on offer, how they're carried out. What every act uses to move a man is `brain/moves.ts`. That's step 2 of the plan on one case, and it worked without moving a pinned run. The other fourteen acts, the memory record and the flags are as they were.
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
- **Done here: `takedown`,** the same camps relaxed and alert, with and without the radio and the vehicle (section 3).
- **Done here: an experiment builds each camp once.** Every arm used to build its camp again. `quiet-kill` on six camps went from 135 s to 40 s, with the same report to the character. A cache on disk, so that a second command reuses the first one's camps, is the next step.

### The renderer and the browser shell

I couldn't judge feel or frame rate: both need your machine. Structurally, the browser shell is one class of about 1,900 lines holding play, replay, trials, the explorer and the compound simulator. Split it by mode before Phase 2 adds the brief, the map and the debrief.

### Tests and checks

The suite took 17 minutes here, and over 20 on CI. The balance you set, test what's settled and measure what's still moving, is right, and one thing contradicts it today: see rule 11 below.

## 6. The futures

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

## 7. Rules I'd change

- **Rule 10, the motor's promise about steep ground.** As written ("never gains height on ground steeper than the limit, from any angle") it could be read two ways, and two sessions read it differently on the same afternoon. Say what's kept exactly: *from ground too steep to stand on a body ends a tick no higher, onto such ground it ends no higher either, and it gains nothing on the steep ground it began the tick on.* The motor's header says this now. I left `CLAUDE.md` for you.
- **Rule 11, pinned behaviour.** Two problems. First, the camp's fight is pinned in every engine, though by your own rule its outcomes should be pinned "once a person has played the step and it has settled". Pin its invariants and its work budgets, and leave its fingerprint out of the build's digest until then. Second, one digest covers every pinned run, so any change to the camp's brain makes every kept recording unplayable, including a movement sitting that has no camp in it. Carry a digest per lane a scene uses. Your sittings' evidence would then survive most updates.
- **Rule 13, brains see only their minds.** Right, and the mind was wider than the rule: fixed here (section 5, The kernel). The rule could say so: *a mind's world is its camp's own ground.*
- **Rule 6, generation's fingerprint.** It should cover the world, not the proofs about it (section 5, Generation).
- **One law of sound.** Keep it. Add its other half: one law says what is heard, and a separate, equally honest one says what a listener can tell from it. The strike's 650 m radius is really a hit confirmation for the player written as a world sound, and that's a taste call: section 4.
- **Rule 4, every number in tuning.** Kept, and stretched to modes: a scene can now set numbers of its own over the game's, and those live in tuning too (`modes.takedown`), so they hot-reload and a recording carries them. Worth a line in the rule: *a mode's numbers are in tuning, under its name, and its scene applies them.*
- **Sixteen guards at most.** It was set for frame rate, and the simulation's cost per guard is a few microseconds. Let the fight decide the number, then measure drawing them.
- **Lab F inside the gate.** Your desk already marks this for reopening, and I agree: the lab is right, and making the first whole mission wait for all of it is the part to undo.

## 8. What's on the branch

Branch `claude/fable-advisor-f47b5c`, from `main` at `d66b7b1`, with `main` merged in at `567abdd` (the motor's steep-ground rule and the first-fight fixes). It's up to date with `main` today. `npm run check` is green on the whole: 88 files, 791 tests.

| Commit | What | Moves |
| --- | --- | --- |
| The steep-ground promise, measured where it's kept | The watch charges height gained on steep ground to where it was gained (`Heightfield.gainOnSteep`). Tests for both directions | Nothing a player sees. One new bench number |
| The foot of a low ledge is no way up it | The motor backs off the right way at a ledge narrower than a body | `SIM_VERSION` 14 after the merge. No pinned run or bench number |
| Merge of `main` | Takes `main`'s rule that a body on steep ground ends no higher, and holds the watch and the tests to it | |
| A shot's sounds are data, and the quiet kill is measured | `perception.awareness.shots`, the experiment, a subsonic report for the simulator's shot | The tuning grew, so the golden recording is rewritten. No fingerprint |
| The way-in search, a fifth quicker, bit for bit | Beaten labels leave their lists; the heap holds label numbers | Nothing: 24 worlds' fingerprints are the same |
| An experiment builds each camp once | The runner hands a process a camp's runs together; `src/lab/worlds.ts` | Nothing: the reports are the same |
| A mind is handed its camp's ground | `Ground` in `brain/mind.ts`, and a test | Nothing: types only |
| The first review, and its update after `main` moved | | |
| **The takedown** | A camp that protects its target, as a mode: the stages, the mode's numbers, the load key, the vehicle that gives up, the lab panel's line, the experiment and its tests | `SIM_VERSION` 15, `STATE_SCHEMA` 10. Every pinned `state` value (the schema), and no `behaviour` value. The golden recording is rewritten |
| This account | | |

**The motor, in full.** Two sessions took this up on the same afternoon. In the five failing runs I traced, the body had slid off a steep triangle onto a walkable one that rose the way it was going, and every millimetre was gained on the walkable one. I read that as the check being wrong and rewrote the check. The other session read the rule more strictly, that a body on steep ground should end no higher wherever it ends, and changed the motor to keep it. Theirs landed first, and it's the better promise: simple, and exactly kept. The merge takes it.

What this branch adds on top:
- **The watch measures where height is gained,** so it can tell a climb from a slide, and it also checks bodies that arrive on steep ground from walkable ground, which nothing looked at before.
- **A stuck body, fixed.** With the rise refused, a body at the foot of a low ledge of one shape is pushed toward the ledge every tick and refused every tick: it can't move again, by walking or sprinting in any direction. I measured that on `main`'s motor: 0.000 m in five seconds, five ways. Before `main`'s change the same body was lifted 0.43 m onto the ledge, which was wrong but let it go. The bots meet that shape about once in fifty 12-minute runs, and the long runs can't see a body that's merely stuck. The fix backs the body off toward its own centre, and it slides clear.
- **The corner clipping described above,** measured and reported, and left.

**To take it.** Two ways, and the choice is yours (section 10).
- **The foundation work alone:** merge commit `e7086c9`. That's everything in the table above the takedown. Nothing in it touches the generator's output, the escape vehicle, `camp.ts` or `comms.ts`.
- **All of it:** merge the branch. The takedown does touch the files the camp work lives in: `brain/brain.ts`, `brain/commander.ts`, `game/comms.ts`, `game/escape.ts`, `game/camp.ts` and `game/systems.ts`. If `main` has moved in those, bring `main` into the branch by merging it, and expect to resolve them by hand.

Either way, four places conflict mechanically whenever `main` moves:
- `SIM_VERSION` and `STATE_SCHEMA`: take the next number.
- The `state` values in `src/sim/game/golden.ts`: run `npm run selftest` and take what it prints, having checked that no `behaviour` value moved.
- `tests/golden/TAL-4471-wander.slrec`: run `npm run golden` after merging.
- `docs/decisions.md`: both sides add entries at the top.

**`CLAUDE.md` is untouched.** I left your rules file alone. Three lines in it are now behind: the automation hook is `tap('KeyC' | 'KeyZ' | 'KeyT' | 'KeyY')`, "Where we are" doesn't mention the takedown, and rule 10's wording (section 7).

## 9. What I couldn't verify

- **Fun and feel.** I drove the takedown in the app's own browser, at 120 frames a second: the start panel, the load named in the scope, a suppressed shot that turned no heads, then a loud one through every stage to the vehicle on the road. That shows it runs and reads. It doesn't show it's good.
- **Hands on the camp.** Cutting the radio and disabling the vehicle were checked with the camp's switches and by setting the state in tests, not by a body walking in and holding G. Sabotage by hand is `main`'s, with its own tests. Standing in the road was checked by putting the player's body in the vehicle's way every tick.
- **Stopping the men sent for him.** Not tested as such. What's tested is its consequence: if nobody reaches his door, he waits.
- **The browser tests** (`npm run test:browser`) and the other engines: not run here. CI runs them on the pull request.
- **The preview deploy.** Not opened.
- **Long bot runs since the takedown.** The 285 clean runs were on the code before it. Since, a short one: 8 fresh valleys with both bots for ten minutes each, the scenes and the towers, 648,000 ticks, every promise held. The bots don't play a takedown, so that says the motor is as it was, and no more.
- **Timings.** The machine was busy with other sessions throughout. Every time here is CPU time, a sampling profile, or a before-and-after pair run back to back.

## 10. What I'd do next, and what I need from you

**Next, in order of what each does for the game:**

1. **Play the takedown for fifteen minutes** (section 2). It's the fastest way to find out whether the shape is right, and what's wrong with the seconds.
2. **Finish the two dials** (section 4, choice 3): shouts and radio calls change what the camp does, and only a man's own senses change what he knows. A quiet kill needs it.
3. **Build bots that can win.** The ladder is blind because its bots only shoot from a ridge. The takedown gives them things to do: one that cuts the radio, one that takes the vehicle, one that waits for the run. Until one wins, "good loses, great wins" can't be measured.
4. **Play one whole mission, start to finish,** walking in with no perch given.
5. **Carry on with the brain** (section 5): the rest of the acts into modules, the memory split, actions out. Then sections, which the camp that hunts needs.
6. **Make people one kind of thing** (section 5, The game layer).
7. **Stop the generator answering questions nobody asked,** and separate a world from what's been proved about it.
8. **Keep sittings' recordings alive across updates** (section 7, rule 11).

**Decisions for you:**

1. **Is this the contest?** Shelter, relief, fetch, extraction, with readiness deciding (section 4, choices 1 and 2). I recommend yes, once you've played it. If no, tell me what felt wrong and I'd rather change the shape than tune it.
2. **Two dials for the camp** (choice 3). I recommend yes, next.
3. **The subsonic load in the kit** (choice 4). I recommend yes.
4. **A held-up escape ends with him getting out** (choice 5). It's in every camp now. I recommend keeping it.
5. **Which to take:** the foundation commits alone, or the takedown with them (section 8). I recommend the foundation commits now, and the takedown after you've played it on the branch.
6. **The brain's rebuild before the camp learns to hunt.** I recommend yes.
7. **The whole mission before more of the camp:** reopen the gate, as your desk suggests. I recommend yes.
8. **Do you need to hear your hit at 300 m?** Yours to call.
