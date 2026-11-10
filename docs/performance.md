# Performance: where the hitches were, and what was done

Nov 10, 2026. For the owner, after the first go at the takedown: "it freezes and jumps a few frames", "sometimes the whole experience gets laggy, not just scoped in". Everything measured here is one command away, and section 4 names the commands.

## 1. The answer

**The fight was freezing the game, and now it doesn't.** A tick of the simulation has 33 ms and takes a tenth of a millisecond on average, so the average was never the problem. The problem was the one tick in a thousand. Across 72 minutes of scripted fights on three camps:

| | Before | After |
| --- | --- | --- |
| Ticks slower than 4 ms | 386 | 1 |
| Slower than 16 ms: a dropped frame at 60 Hz | 60 | 0 |
| Slower than 33 ms: the simulation itself running late | 21 | 0 |
| The slowest tick | 112 ms | 4.1 ms |
| An average tick | 0.17 ms | 0.11 ms |

Those are the hitches you felt while holding a breath: a guard reacts, asks for a route, and the picture stands still for two to six frames.

**The first shot of a run was the worst moment, and that's fixed too.** The first time anything happens in a run it costs many times what it costs after. The tick of the first shot took 36 to 49 ms in a fresh process, which is what a new tab is. It now takes 3 to 4, because the game rehearses the camp's fight once while the valley loads.

**In a real browser the slow frames in play are gone.** Chromium on this Mac's GPU, the same attacked camp for two and a half minutes, one run each: before, frames of 83 and 50 ms in play and two stalls of the page; after, none. Section 5 says what that browser couldn't tell me.

**Nothing about how the game plays was traded for this**, with one exception worth knowing: guards now find routes that used to defeat them (section 3).

## 2. What it was

| What you felt | What it was | What was done |
| --- | --- | --- |
| A freeze of a few frames in a fight, at no particular moment | A guard asking for a route across the camp. With a wall between him and where he's going, the search looked at every cell nearer than the gate first: up to 124,000 of them in one tick, 60 ms | Routes inside a camp now aim by landmarks: the same route for a tenth of the looking. A place that can't be reached is known at once |
| The same, a moment after a shout or a shot | Every sound was checked against all 61 steady sounds of the valley (the river is 60 of them), with a ray each, for every listener | A listener too far from anything steady to be masked by it is known without a ray. The answer is the same |
| The first shot of a run hitches | Code run for the first time, and things the world works out on first use | The camp's fight is rehearsed once at load, out of sight |
| A stall as he gets into his vehicle | The vehicle's way across the yard was searched for in that tick | Found once, at setup |
| A hitch when a round strikes | Each strike's dust was a new material, thrown away as it faded. The last one thrown away takes its shader program with it, and the next strike waits for it to be built again | The dust is a fixed set of puffs, made once |
| A hitch once a minute | Your session is saved every minute, and each save asked the GPU its name, which waits on the GPU's own process | Asked once |
| Scoped in, everything a little slower | The scope asked for the rifle's zero every frame: sixty simulated flights each time. (The scope's overlay itself is being fixed in another session) | Kept once solved |

One more thing is done on the same principle, though I couldn't measure what it had been costing: a mesh is sent to the GPU the first time it's drawn, which is the first time you turn that way. The whole world is now drawn once from overhead, into a single pixel, while the valley loads.

The steady cost was never high. Averaged over a fight the simulation uses about a third of one percent of its time, and the page's own work is about a millisecond a frame.

## 3. What changed in the game, and what didn't

**Guards find their way where they used to give up.** One fight in my measurements had a guard three metres from where he was sent, with a wall between. The old search ran out of budget, fell back on a coarse guess, and he walked a route that wasn't one. He now gets the real route. Across 16 camps, 1.6% of the routes a fight asks for used to fail that way, and none do now. Of two routes of the same length a guard may now take the other. That's all that changed in what the game does, and it's why the simulation's version went up: recordings made before this build won't replay in it.

**Everything else is the same, to the bit.** With the route change switched off, 30 four-minute fights end in exactly the state they did before: the same hash and the same number of events. That covers the faster search, the hearing shortcuts, the belief map, the vehicle's route and the rifle's zero. Every pinned run gives the fingerprint it gave.

**What each of a route's landmarks buys** (`npm run experiment -- route-cost`, 16 camps, 240 routes each):

| | Cells a search looks at | The most one search looked at | Searches costing more than a tick's share | Found |
| --- | --- | --- | --- | --- |
| Straight-line estimate alone, as it was | 8,711 | 60,472 | 26.8% | 99.6% |
| 4 landmarks | 2,578 | 19,929 | 6.7% | 100% |
| 8 landmarks | 1,337 | 14,048 | 1.4% | 100% |
| 16 landmarks, the game's | 710 | 8,541 | 0.1% | 100% |

Routes come out the same length (80 m on average, every row). Sixteen landmarks cost about 10 MB of memory and a seventh of a second when a camp loads.

## 4. Measuring it

- `npm run hitches`: the standing fights, each in a process of its own, built as the game's code is built. For each: the first run as a fresh tab would find it, the warm runs, each system's worst tick and the most work it did in one, and every tick over 4 ms. `npm run hitches -- takedown` or any scene with its parameters; `--no-rehearsal` shows a cold start without the rehearsal.
- `npm run experiment -- route-cost`: the table above.
- `npm run bench`: the brain lane now pins a fight's worst tick as work: the most grid cells the brains expand in a tick, the most rays they cast, the most cells sounds flood. Work is the same on every machine, so a hitch shows up there before anyone feels it.
- `npm run playtest`: a session's telemetry now keeps its slowest frames, when each was, and whose it was: the page's own work, the simulation's share of that, or neither (a frame that was long with little work in it waited on the GPU or the browser). Your next sitting will say what's left in your own browser, on the public build too.

Times in this page are from a machine that was busy with other sessions. Where it matters each tick's time is the least of several identical runs, which takes most of the noise out. The work counts have none.

## 5. What I couldn't verify, and what's left

- **Your own browser.** I measured in Chromium with this Mac's GPU, at 60 frames a second, with nobody at the keys. I couldn't measure at 120 Hz, in Safari, on the public build, or with a hand on the mouse. The slowest-frames list in the telemetry is there so that your next go tells us.
- **How bad the shader rebuild was for you.** With the frame rate uncapped it stalled the page for up to a second at every strike. At 60 Hz in the same browser I couldn't make it cost more than about 20 ms. It's fixed either way.
- **The scope's overlay** is another session's fix, and not in these numbers.
- **Feel.** Nobody has played this build.

Left, in order of what I'd do next:

1. **A save every minute still costs 10 to 25 ms** on the main thread (closing the recording, and the store). It belongs in a worker.
2. **Rays are the next cost.** A look for dead ground casts up to 900, about 3 ms in the worst case, and a shout's apparent direction walks its path a ray a cell. A ray that passes well above a forest still tests every tree under it; skipping those is exact and would roughly halve the long ones.
3. **A checkpoint every ten seconds costs about 2.5 ms**, because the state is hashed twice.
4. **Collections of garbage of 15 to 25 ms**, about once a minute with the debug view on. The honest view makes far less.
5. **The largest steady cost is guards' sight**: about a third of the simulation's time, spread evenly, so it never hitches. It would be the first thing to matter with many more guards.
