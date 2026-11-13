# A walk held up: every bench against `main`, camp by camp

Nov 12, 2026. The record behind *A man held up by a mate steps round him* in `docs/decisions.md`: what `brain/nav.ts`'s `followRoute` does when a walk stalls changed, and this is every run of every bench that reads differently for it.

**How it was made.** Each bench was run camp by camp on `main` (`7e86d0a`, with looking out for one's own in it) and on this change merged with it, with a line logged every time a walk stalled: when, who, where, how fast he was going. `main`'s side was run twice: in the main checkout itself, and in a copy of its tree with the logging line, and the two agree run for run. A stall is the only place the change does anything, so a run in which no walk stalls is the same run. Where a run reads differently, the table gives the first stall that isn't the same in both: from there it is a different fight, and what follows is what that fight came to. "Stalls" is how many times a walk stalled in the run, on `main` and here.

**In all.** 1,006 runs. 192 read differently, and a walk stalled in every one of them. Walks stalled 6,860 times on `main` and 2,974 times here, and gave up 1,090 times on `main` and 256 here.

| Bench | Runs | Read differently | Stalls | Walks given up | Counts of runs that moved |
| --- | --- | --- | --- | --- | --- |
| `ladder` | 64 | 12 | 213 → 84 | 34 → 4 | Shot dead 20 → 20 and detected 17 → 17: one camp each way |
| `circling` | 96 | 43 | 850 → 653 | 133 → 86 | Made out at all 80 → 74. Shot dead on the walk 87 → 85 |
| `second-step` | 240 | 5 | 631 → 396 | 94 → 37 | None |
| `hunt` | 24 | 8 | 1,075 → 346 | 181 → 30 | Found 8 → 9. Enough rounds on him to kill 7 → 8. Shot dead 0 → 1 |
| `takedown` | 96 | 8 | 316 → 190 | 55 → 26 | The target told to come out 12 → 14 |
| `answer` | 54 | 8 | 193 → 84 | 33 → 6 | None |
| `firefight` (60 camps) | 120 | 69 | 2,414 → 719 | 380 → 45 | Below |
| `flaws` (24 camps) | 216 | 20 | 797 → 361 | 122 → 18 | Below |
| `out-the-gate` | 48 | 5 | 98 → 29 | 16 → 0 | A man out within 25 s 18 → 19 |
| `own-side` | 48 | 14 | 273 → 112 | 42 → 4 | None: men shot by their own side 2 → 1 as the camp was, 0 → 0 as it is |

**The three that need saying.**

- **`circling`: the camp makes the shooter out on 74 runs of 96, from 80, and shoots him dead on 85, from 87.** These are the longest runs with the most men moving: a walk stalls in 75 of the 96 on `main`. To see what a change of that size means, the same bench was run on a placebo: `main`, with nothing changed but which side a man steps to first (his own rule, turned round). That reads 77 and 83. So these counts move about as far for a change that can't matter as they do for this one. Of the eight runs where he is no longer made out, he is shot dead all the same on six: nobody's eyes had settled on him before a round found him.
- **`firefight`: with the firefight on, as every camp is, nothing a run is counted by moves but one more shooter shot dead** (27 → 28 of the 37 who found someone to shoot at): someone came after him on 13 either way, they set eyes on him again on 1, the circling shooter is shot dead on 53 of 60 and gets all the way round on 2, and nobody is shot by his own side in either. With it switched off, the camp as it was before Nov 11, they set eyes on him again on 2 camps, from 5.
- **`flaws`: pile-ups (four men within 2.5 m for more than 4 s) are 40, from 4, on three camps** (NUB-9046, GIN-9513, SUK-5361), and every one is where the relief meets the target. On NUB-9046, the worst of them, the relief's two men reach his door together now, where on `main` the second was still stepping round the first, and they are still there when the men sent to fetch him come. Nobody is pushing at anybody: they're standing where the escort stands them. The other flaws are as they were: stuck 329 → 326, chatter 74 → 73, deaf 20, in the line 6, silent tower 114, friendly fire 0.

**And the brain lane's own bench** (`npm run bench`), which pins what a perfect shooter on the best overview does to three camps. On one, BNC-0202, the man sent to start the target's vehicle sets off pressed against an officer. On `main` he is a third of a second later getting clear, and is shot before he gets there; the engine starts half a minute late and the shooter reaches the target first. Here he starts it, and the target gets away as on the other two. The two numbers that pins are in the decisions log.

**What the benches caught on the way** is in the decisions log: five things the first versions of this change did that it shouldn't have, each found here and each fixed before this record was made.

### `ladder`: who wins against the camp: the target down, and you out

64 runs on 16 camps. A walk stalled on `main` in 20 of them. 12 runs read differently, on 8 camps. Stalls in all: 213 → 84. Walks given up: 34 → 4. Counts that moved: shot dead 20 → 20 of 64 (1 gained, 1 lost); detected 17 → 17 of 64 (1 gained, 1 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| ZOM-7683 | careless | nearest guard (m): 0.11 → 0.10 | 0 → 1 | No stall on `main`: here, guard 73 at 498 s, going at 5.0 m/s |
| ZOM-7683 | perfect and static | rounds fired: 14 → 13; rounds at him: 29 → 27 | 0 → 1 | No stall on `main`: here, guard 70 at 107 s, going at 5.0 m/s |
| ZOM-7683 | shoot and relocate | guards down: 3 → 1; rounds fired: 6 → 5; rounds at him: 26 → 53; nearest guard (m): 197 → 0.6 | 31 → 12 | On `main`, guard 7 at 375 s, going at 2.0 m/s; here, guard 41 at 150 s, going at 5.0 m/s |
| FIB-5851 | shoot and relocate | shot dead: no → yes; guards down: 3 → 2; rounds fired: 11 → 8; detected: no → yes; rounds at him: 115 → 108; nearest guard (m): 0.4 → 101 | 63 → 7 | On `main`, guard 7 at 547 s, going at 4.4 m/s; here, guard 7 at 549 s, going at 4.4 m/s |
| VOT-0029 | perfect and static | guards down: 9 → 10 | 1 → 1 | On `main`, guard 75 at 106 s, going at 5.0 m/s; here, guard 75 at 104 s, going at 5.0 m/s |
| HOF-3956 | shoot and relocate | shot dead: yes → no; guards down: 4 → 7; rounds fired: 9 → 11; detected: yes → no; rounds at him: 52 → 7; nearest guard (m): 2.9 → 0.9 | 16 → 4 | On `main`, guard 7 at 256 s, going at 4.4 m/s; here, guard 8 at 257 s, going at 4.4 m/s |
| RUR-3446 | perfect and static | rounds fired: 14 → 10 | 5 → 4 | On `main`, guard 45 at 106 s, going at 5.0 m/s; here, guard 45 at 105 s, going at 5.0 m/s |
| RUR-3446 | shoot and relocate | nearest guard (m): 350 → 351 | 2 → 6 | On `main`, guard 44 at 165 s, going at 5.0 m/s; here, guard 44 at 164 s, going at 5.0 m/s |
| VAR-6722 | shoot and relocate | guards down: 2 → 3; rounds at him: 22 → 23; nearest guard (m): 209 → 217 | 7 → 3 | On `main`, guard 8 at 111 s, going at 5.4 m/s; here, guard 2 at 182 s, going at 4.6 m/s |
| NOM-7045 | perfect and static | rounds at him: 34 → 33 | 7 → 2 | On `main`, guard 4 at 42 s, going at 5.0 m/s; here, guard 71 at 135 s, going at 5.0 m/s |
| NOM-7045 | shoot and relocate | rounds fired: 6 → 9; rounds at him: 57 → 95; nearest guard (m): 51.7 → 1.6 | 6 → 7 | On `main`, guard 57 at 170 s, going at 5.0 m/s; here, guard 57 at 169 s, going at 5.0 m/s |
| KIZ-9599 | perfect and static | rounds fired: 12 → 10; nearest guard (m): 287 → 290 | 4 → 1 | On `main`, guard 13 at 10 s, going at 5.0 m/s; not here |

### `circling`: what one lap of a base's outside hands a shooter, and what its shape shows from there: the plain yard against each kind of place

96 runs on 16 camps. A walk stalled on `main` in 75 of them. 43 runs read differently, on 15 camps. Stalls in all: 850 → 653. Walks given up: 133 → 86. Counts that moved: made out at all 80 → 74 of 96 (2 gained, 8 lost); shot dead on the walk 87 → 85 of 96 (1 gained, 3 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| HUB-9331 | yard only | men down in a lap: 4 → 3; of them, from the walk: 2 → 1; share of the camp (%): 40 → 30; down before he was made out: 4 → 3; rounds at him: 22 → 31; rounds he fired: 3 → 2 | 51 → 54 | On `main`, guard 4 at 140 s, going at 1.4 m/s; here, guard 8 at 172 s, going at 5.4 m/s |
| HUB-9331 | keep | rounds at him: 86 → 85 | 10 → 20 | On `main`, guard 8 at 225 s, going at 4.4 m/s; here, guard 9 at 225 s, going at 4.4 m/s |
| GUF-8063 | farm | men down in a lap: 7 → 5; of them, from the walk: 5 → 3; share of the camp (%): 58.3 → 41.7; down before he was made out: 6 → 2; rounds at him: 40 → 30; rounds he fired: 8 → 13 | 1 → 7 | On `main`, guard 9 at 66 s, going at 1.4 m/s; here, guard 9 at 66 s, going at 1.4 m/s |
| VOH-5131 | yard only | men down in a lap: 5 → 4; of them, from the walk: 2 → 1; share of the camp (%): 55.6 → 44.4; rounds at him: 30 → 37; rounds he fired: 6 → 7 | 7 → 3 | On `main`, guard 2 at 89 s, going at 4.6 m/s; here, guard 2 at 90 s, going at 4.6 m/s |
| VOH-5131 | keep | rounds at him: 13 → 53 | 10 → 22 | On `main`, guard 7 at 123 s, going at 5.0 m/s; here, guard 10 at 493 s, going at 2.0 m/s |
| VOH-5131 | depot | men down in a lap: 6 → 5; of them, from the walk: 4 → 3; share of the camp (%): 66.7 → 55.6; down before he was made out: 6 → 5; rounds at him: 17 → 5; rounds he fired: 5 → 4 | 10 → 12 | On `main`, guard 35 at 140 s, going at 5.0 m/s; here, guard 35 at 139 s, going at 5.0 m/s |
| VOH-5131 | as built | men down in a lap: 6 → 5; of them, from the walk: 4 → 3; share of the camp (%): 66.7 → 55.6; down before he was made out: 6 → 5; rounds at him: 17 → 5; rounds he fired: 5 → 4 | 10 → 12 | On `main`, guard 35 at 140 s, going at 5.0 m/s; here, guard 35 at 139 s, going at 5.0 m/s |
| TAP-5457 | keep | men down in a lap: 4 → 5; of them, from the walk: 1 → 2; share of the camp (%): 40 → 50; down before he was made out: 4 → 5; made out at all: yes → no; rounds at him: 15 → 22; rounds he fired: 4 → 8 | 2 → 2 | On `main`, guard 4 at 283 s, going at 2.0 m/s; here, guard 50 at 334 s, going at 2.0 m/s |
| SID-7035 | yard only | men down in a lap: 2 → 3; of them, from the walk: 1 → 2; share of the camp (%): 20 → 30; down before he was made out: 2 → 3; made out at all: yes → no; rounds at him: 11 → 19; rounds he fired: 3 → 4 | 6 → 2 | On `main`, guard 44 at 255 s, going at 1.4 m/s; here, guard 10 at 34 s, going at 1.4 m/s |
| SID-7035 | depot | rounds at him: 39 → 43 | 1 → 1 | The same 1 stall, and the step after one went differently |
| SID-7035 | farm | rounds at him: 11 → 19 | 45 → 36 | On `main`, guard 10 at 150 s, going at 5.4 m/s; here, guard 8 at 162 s, going at 5.4 m/s |
| SID-7035 | as built | rounds at him: 39 → 43 | 1 → 1 | The same 1 stall, and the step after one went differently |
| HET-1624 | farm | men down in a lap: 3 → 5; of them, from the walk: 1 → 3; share of the camp (%): 27.3 → 45.5; rounds at him: 18 → 73; rounds he fired: 3 → 11 | 5 → 7 | On `main`, guard 10 at 98 s, going at 4.4 m/s; here, guard 9 at 120 s, going at 5.2 m/s |
| ZUV-9136 | yard only | made out at all: yes → no; rounds at him: 13 → 19 | 5 → 2 | On `main`, guard 4 at 302 s, going at 2.4 m/s; here, guard 4 at 327 s, going at 2.4 m/s |
| ZUV-9136 | walled | made out at all: no → yes; rounds at him: 72 → 69; rounds he fired: 6 → 5 | 26 → 8 | On `main`, guard 10 at 274 s, going at 4.4 m/s; here, guard 8 at 485 s, going at 4.4 m/s |
| ZUV-9136 | farm | rounds at him: 39 → 42 | 1 → 1 | The same 1 stall, and the step after one went differently |
| ZUV-9136 | as built | rounds at him: 39 → 42 | 1 → 1 | The same 1 stall, and the step after one went differently |
| HEL-2923 | yard only | made out at all: yes → no; rounds at him: 9 → 10; rounds he fired: 3 → 4 | 16 → 33 | On `main`, guard 9 at 126 s, going at 5.4 m/s; here, guard 9 at 125 s, going at 5.4 m/s |
| HEL-2923 | keep | rounds at him: 95 → 93; rounds he fired: 3 → 4 | 4 → 2 | On `main`, guard 69 at 279 s, going at 2.4 m/s; not here |
| HEL-2923 | depot | rounds at him: 9 → 8 | 8 → 3 | On `main`, guard 42 at 112 s, going at 5.0 m/s; here, guard 42 at 111 s, going at 5.0 m/s |
| HEL-2923 | farm | rounds at him: 21 → 18 | 18 → 7 | On `main`, guard 47 at 132 s, going at 5.0 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| HEL-2923 | as built | rounds at him: 21 → 18 | 18 → 7 | On `main`, guard 47 at 132 s, going at 5.0 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| HAM-3144 | yard only | men down in a lap: 4 → 3; of them, from the walk: 1 → 0; share of the camp (%): 40 → 30; made out at all: yes → no; rounds at him: 32 → 20; rounds he fired: 5 → 4 | 4 → 1 | On `main`, guard 4 at 69 s, going at 1.4 m/s; not here |
| HAM-3144 | walled | men down in a lap: 6 → 3; of them, from the walk: 4 → 1; share of the camp (%): 60 → 30; down before he was made out: 6 → 3; made out at all: no → yes; shot dead on the walk: no → yes; rounds at him: 5 → 17; rounds he fired: 8 → 4; a lap takes (s): 726 → — | 48 → 1 | On `main`, guard 8 at 85 s, going at 4.4 m/s; not here |
| HAM-3144 | keep | men down in a lap: 5 → 2; of them, from the walk: 3 → 0; share of the camp (%): 50 → 20; down before he was made out: 5 → 2; rounds at him: 60 → 50; rounds he fired: 8 → 3 | 46 → 44 | On `main`, guard 3 at 39 s, going at 2.4 m/s; here, guard 3 at 39 s, going at 2.4 m/s |
| HAM-3144 | as built | men down in a lap: 5 → 2; of them, from the walk: 3 → 0; share of the camp (%): 50 → 20; down before he was made out: 5 → 2; rounds at him: 60 → 50; rounds he fired: 8 → 3 | 46 → 44 | On `main`, guard 3 at 39 s, going at 2.4 m/s; here, guard 3 at 39 s, going at 2.4 m/s |
| VIP-2861 | farm | men down in a lap: 5 → 2; of them, from the walk: 3 → 0; share of the camp (%): 41.7 → 16.7; down before he was made out: 5 → 2; rounds at him: 12 → 13; rounds he fired: 7 → 3 | 45 → 1 | On `main`, guard 11 at 121 s, going at 5.4 m/s; not here |
| PUH-1156 | walled | men down in a lap: 4 → 5; of them, from the walk: 3 → 4; share of the camp (%): 44.4 → 55.6; down before he was made out: 4 → 5; rounds at him: 37 → 39; rounds he fired: 10 → 11; a lap takes (s): 914 → 915 | 6 → 2 | On `main`, guard 4 at 559 s, going at 2.4 m/s; not here |
| PUH-1156 | depot | made out at all: yes → no; shot dead on the walk: yes → no; rounds at him: 58 → 73; rounds he fired: 4 → 5; a lap takes (s): — → 799 | 6 → 10 | On `main`, guard 8 at 190 s, going at 4.4 m/s; here, guard 53 at 365 s, going at 2.0 m/s |
| PUH-1156 | farm | rounds at him: 9 → 0; rounds he fired: 4 → 3; a lap takes (s): 836 → 829 | 84 → 180 | On `main`, guard 8 at 67 s, going at 4.4 m/s; here, guard 8 at 84 s, going at 5.4 m/s |
| PUH-1156 | as built | made out at all: yes → no; shot dead on the walk: yes → no; rounds at him: 58 → 73; rounds he fired: 4 → 5; a lap takes (s): — → 799 | 6 → 10 | On `main`, guard 8 at 190 s, going at 4.4 m/s; here, guard 53 at 365 s, going at 2.0 m/s |
| PUV-2831 | walled | men down in a lap: 3 → 2; of them, from the walk: 1 → 0; share of the camp (%): 30 → 20; rounds at him: 87 → 70 | 30 → 3 | On `main`, guard 8 at 259 s, going at 4.4 m/s; here, guard 11 at 500 s, going at 2.4 m/s |
| BED-2105 | yard only | men down in a lap: 2 → 3; of them, from the walk: 0 → 1; share of the camp (%): 20 → 30 | 7 → 3 | On `main`, guard 54 at 139 s, going at 5.0 m/s; here, guard 54 at 139 s, going at 5.0 m/s |
| BED-2105 | walled | men down in a lap: 1 → 2; of them, from the walk: 0 → 1; share of the camp (%): 9.1 → 18.2; rounds at him: 91 → 87 | 11 → 4 | On `main`, guard 7 at 80 s, going at 5.4 m/s; here, guard 105 at 142 s, going at 5.0 m/s |
| BED-2105 | keep | men down in a lap: 2 → 3; of them, from the walk: 1 → 2; share of the camp (%): 20 → 30; down before he was made out: 2 → 3; made out at all: yes → no; rounds at him: 198 → 130; rounds he fired: 3 → 5 | 1 → 4 | After the stalls they share: here, guard 3 at 236 s, going at 2.4 m/s |
| BED-2105 | farm | rounds at him: 46 → 45 | 6 → 3 | On `main`, guard 9 at 105 s, going at 5.4 m/s; here, guard 57 at 118 s, going at 5.0 m/s |
| BED-2105 | as built | men down in a lap: 1 → 2; of them, from the walk: 0 → 1; share of the camp (%): 9.1 → 18.2; rounds at him: 91 → 87 | 11 → 4 | On `main`, guard 7 at 80 s, going at 5.4 m/s; here, guard 105 at 142 s, going at 5.0 m/s |
| MAZ-1737 | yard only | men down in a lap: 4 → 8; of them, from the walk: 3 → 7; share of the camp (%): 44.4 → 88.9; shot dead on the walk: yes → no; rounds at him: 41 → 36; rounds he fired: 10 → 14; a lap takes (s): — → 712 | 2 → 2 | On `main`, guard 50 at 167 s, going at 1.4 m/s; here, guard 50 at 168 s, going at 1.4 m/s |
| MAZ-1737 | walled | men down in a lap: 3 → 4; share of the camp (%): 33.3 → 44.4; down before he was made out: 3 → 4; rounds at him: 11 → 6 | 15 → 2 | On `main`, guard 4 at 32 s, going at 5.0 m/s; here, guard 4 at 71 s, going at 1.4 m/s |
| MAZ-1737 | farm | rounds at him: 0 → 3; rounds he fired: 5 → 6; a lap takes (s): 740.77 → 740.93 | 1 → 1 | The same 1 stall, and the step after one went differently |
| MAZ-1737 | as built | men down in a lap: 3 → 4; share of the camp (%): 33.3 → 44.4; down before he was made out: 3 → 4; rounds at him: 11 → 6 | 15 → 2 | On `main`, guard 4 at 32 s, going at 5.0 m/s; here, guard 4 at 71 s, going at 1.4 m/s |
| LIS-8625 | keep | rounds at him: 51 → 52 | 2 → 2 | The same 2 stalls, and the step after one went differently |
| LIS-8625 | as built | rounds at him: 51 → 52 | 2 → 2 | The same 2 stalls, and the step after one went differently |

### `second-step`: one round into a man, the generator or an alarm box: what the camp makes of it, and whether the mission is still there to be played

240 runs on 24 camps. A walk stalled on `main` in 63 of them. 5 runs read differently, on 5 camps. Stalls in all: 631 → 396. Walks given up: 94 → 37. No count of runs moved.

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| KAH-0231 | suppressed, at a man on the ground | target gone after (s): 109 → 110 | 7 → 8 | On `main`, guard 33 at 112 s, going at 2.0 m/s; here, guard 2 at 103 s, going at 4.6 m/s |
| DUM-3725 | five suppressed rounds half a minute apart, each at a man nobody is watching | men down by then: 5 → 3 | 21 → 21 | On `main`, guard 5 at 87 s, going at 1.4 m/s; here, guard 5 at 89 s, going at 1.4 m/s |
| NEB-1102 | suppressed, at a man on the ground | target gone after (s): 158.90 → 159.20 | 1 → 1 | The same 1 stall, and the step after one went differently |
| BOT-4672 | five suppressed rounds half a minute apart, each at a man nobody is watching | siren after (s): 213 → 163 | 29 → 18 | On `main`, guard 9 at 120 s, going at 2.4 m/s; here, guard 9 at 122 s, going at 2.4 m/s |
| TAV-2782 | five suppressed rounds half a minute apart, each at a man nobody is watching | men down by then: 1 → 2 | 5 → 3 | On `main`, guard 5 at 91 s, going at 1.4 m/s; here, guard 9 at 230 s, going at 2.0 m/s |

### `hunt`: what comes for a shooter on the best overview: before the hunt and with it

24 runs on 12 camps. A walk stalled on `main` in 24 of them. 8 runs read differently, on 7 camps. Stalls in all: 1075 → 346. Walks given up: 181 → 30. Counts that moved: four shots, stays: found 8 → 9 of 24 (1 gained, 0 lost); four shots, stays: enough rounds on him to kill 6 → 8 of 24 (2 gained, 0 lost); one shot, moves: enough rounds on him to kill 1 → 0 of 24 (0 gained, 1 lost); shoots what he sees: shot dead 0 → 1 of 24 (1 gained, 0 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| ROL-8005 | before | shoots what he sees: men he put down: 6 → 4 | 12 → 10 | On `main`, guard 8 at 96 s, going at 1.4 m/s; here, guard 9 at 210 s, going at 2.4 m/s |
| ROL-8005 | the hunt | one shot: it is watching his place after (s): 191 → 194; shoots what he sees: men he put down: 5 → 7; shoots what he sees: of them, men of a section: 2 → 3 | 63 → 50 | On `main`, guard 9 at 24 s, going at 5.0 m/s; here, guard 9 at 194 s, going at 4.4 m/s |
| MUN-1186 | before | four shots, stays: enough rounds on him to kill: no → yes; four shots, stays: by (s after the first shot): — → 304 | 12 → 2 | On `main`, guard 46 at 245 s, going at 2.0 m/s; here, guard 47 at 246 s, going at 2.0 m/s |
| SUH-4151 | the hunt | four shots, stays: found after (s): 335 → 323; four shots, stays: by (s after the first shot): 269 → 274; shoots what he sees: shot dead: no → yes; shoots what he sees: shot dead after (s): — → 295; shoots what he sees: sections sent: 4 → 2 | 101 → 9 | On `main`, guard 9 at 109 s, going at 4.4 m/s; here, guard 56 at 380 s, going at 2.0 m/s |
| GUH-8791 | the hunt | four shots, stays: found: no → yes; four shots, stays: found after (s): — → 375; four shots, stays: enough rounds on him to kill: no → yes; four shots, stays: by (s after the first shot): — → 387; shoots what he sees: of them, men of a section: 3 → 2; shoots what he sees: sections sent: 2 → 1 | 130 → 46 | On `main`, guard 9 at 73 s, going at 1.4 m/s; here, guard 7 at 78 s, going at 1.4 m/s |
| DUS-0705 | the hunt | one shot: it is watching his place after (s): 152 → 142; one shot, stays: found after (s): 194 → 184; one shot, stays: by (s after the shot): 196 → 185; four shots, stays: found after (s): 225 → 217; four shots, stays: by (s after the first shot): 228 → 220; one shot, moves: enough rounds on him to kill: yes → no | 42 → 11 | On `main`, guard 8 at 62 s, going at 5.4 m/s; here, guard 7 at 69 s, going at 5.4 m/s |
| LIK-5836 | the hunt | one shot: it is watching his place after (s): 228 → 236; one shot, stays: found after (s): 274 → 291 | 36 → 34 | On `main`, guard 36 at 113 s, going at 5.0 m/s; here, guard 7 at 148 s, going at 5.4 m/s |
| HEG-2316 | the hunt | one shot: it is watching his place after (s): 149 → 165 | 31 → 6 | On `main`, guard 54 at 134 s, going at 5.0 m/s; here, guard 9 at 154 s, going at 4.4 m/s |

### `takedown`: what an alarm costs and when: a camp that runs its target at the siren against one that protects him, with and without its radio and his vehicle

96 runs on 24 camps. A walk stalled on `main` in 34 of them. 8 runs read differently, on 4 camps. Stalls in all: 316 → 190. Walks given up: 55 → 26. Counts that moved: told to come 12 → 14 of 96 (2 gained, 0 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| PET-8787 | he shelters, and leaves by the way his camp has ready | gone after (s): 148.13 → 148.27 | 1 → 1 | The same 1 stall, and the step after one went differently |
| KAK-8518 | protecting nobody: he runs at the siren | gone after (s): 65.2 → 39.3 | 20 → 2 | On `main`, guard 2 at 33 s, going at 4.6 m/s; here, guard 9 at 16 s, going at 5.0 m/s |
| KAK-8518 | he shelters, and leaves by the way his camp has ready | gone after (s): 147 → 146 | 0 → 1 | No stall on `main`: here, guard 9 at 16 s, going at 5.0 m/s |
| BAG-1985 | no radio | gone after (s): 132.33 → 132.40 | 5 → 1 | On `main`, guard 4 at 104 s, going at 2.4 m/s; not here |
| TOP-3663 | protecting nobody: he runs at the siren | siren after (s): 20.1 → 12.8; left his room after (s): 20.2 → 12.9; gone after (s): 43.9 → 36.5 | 5 → 1 | On `main`, guard 4 at 23 s, going at 5.0 m/s; not here |
| TOP-3663 | he shelters, and leaves by the way his camp has ready | siren after (s): 20.1 → 12.8; told to come: no → yes; left his room after (s): 102 → 80.8; gone after (s): 126 → 105 | 5 → 1 | On `main`, guard 4 at 23 s, going at 5.0 m/s; not here |
| TOP-3663 | no radio | siren after (s): 20.1 → 12.8; told to come: no → yes; left his room after (s): 102 → 80.8; gone after (s): 126 → 105 | 5 → 1 | On `main`, guard 4 at 23 s, going at 5.0 m/s; not here |
| TOP-3663 | no vehicle | siren after (s): 20.1 → 12.8 | 5 → 2 | On `main`, guard 4 at 23 s, going at 5.0 m/s; here, guard 12 at 257 s, going at 2.4 m/s |

### `answer`: what a camp does about its target under attack, and what there is to hear of it first: one answer for every camp, and by the camp’s problem

54 runs on 18 camps. A walk stalled on `main` in 27 of them. 8 runs read differently, on 4 camps. Stalls in all: 193 → 84. Walks given up: 33 → 6. No count of runs moved.

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| DOD-7922 | one answer for every camp | flushed: in his vehicle after the siren (s): 149 → 124; he left: for how long before he was in his vehicle (s): 99.4 → 75.2 | 13 → 6 | On `main`, guard 4 at 23 s, going at 5.0 m/s; here, guard 55 at 116 s, going at 5.0 m/s |
| DOD-7922 | by the camp’s problem | flushed: in his vehicle after the siren (s): 76.5 → 76.4 | 3 → 1 | On `main`, guard 4 at 23 s, going at 5.0 m/s; not here |
| DOD-7922 | protecting nobody | flushed: in his vehicle after the siren (s): 24.0 → 9.6 | 13 → 2 | On `main`, guard 4 at 23 s, going at 5.0 m/s; here, guard 2 at 30 s, going at 4.6 m/s |
| BUR-2116 | one answer for every camp | gone into: in his vehicle after the siren (s): 119.73 → 119.70; he left: for how long before he was in his vehicle (s): 34.63 → 34.60 | 6 → 3 | On `main`, guard 10 at 79 s, going at 1.4 m/s; here, guard 10 at 82 s, going at 1.4 m/s |
| SEH-3389 | one answer for every camp | an escort’s: in his vehicle after the siren (s): 119 → 114; he left: for how long before he was in his vehicle (s): 44.1 → 39 | 10 → 2 | On `main`, guard 2 at 134 s, going at 4.6 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| SEH-3389 | by the camp’s problem | an escort’s: in his vehicle after the siren (s): 119 → 114; he left: for how long before he was in his vehicle (s): 44.1 → 39 | 10 → 2 | On `main`, guard 2 at 134 s, going at 4.6 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| LIS-7451 | one answer for every camp | an escort’s: in his vehicle after the siren (s): 118 → 116; he left: for how long before he was in his vehicle (s): 87.3 → 85.6 | 6 → 3 | On `main`, guard 2 at 133 s, going at 4.6 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| LIS-7451 | by the camp’s problem | an escort’s: in his vehicle after the siren (s): 118 → 116; he left: for how long before he was in his vehicle (s): 87.3 → 85.6 | 6 → 3 | On `main`, guard 2 at 133 s, going at 4.6 m/s; here, guard 2 at 134 s, going at 4.6 m/s |

### `firefight`: whether a camp comes after someone who breaks contact, and what circling it costs: before the firefight and with it

120 runs on 60 camps. A walk stalled on `main` in 104 of them. 69 runs read differently, on 49 camps. Stalls in all: 2414 → 719. Walks given up: 380 → 45. Counts that moved: he found someone to shoot at 84 → 86 of 120 (2 gained, 0 lost); someone came after him 32 → 32 of 120 (2 gained, 2 lost); they set eyes on him again 6 → 3 of 120 (0 gained, 3 lost); shot dead 57 → 58 of 120 (6 gained, 5 lost); circling: shot dead on the walk 91 → 91 of 120 (5 gained, 5 lost); circling: got all the way round 16 → 16 of 120 (4 gained, 4 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| SUH-6249 | before | circling: rounds at him: 55 → 50 | 1 → 1 | The same 1 stall, and the step after one went differently |
| SUH-6249 | the firefight | circling: rounds at him: 140 → 134 | 50 → 6 | On `main`, guard 4 at 588 s, going at 2.4 m/s; here, guard 63 at 122 s, going at 5.0 m/s |
| SIF-8245 | before | circling: rounds at him: 1 → 6 | 16 → 14 | On `main`, guard 41 at 138 s, going at 2.0 m/s; here, guard 41 at 137 s, going at 2.0 m/s |
| DAZ-0671 | the firefight | circling: rounds at him: 27 → 32 | 378 → 19 | On `main`, guard 5 at 98 s, going at 5.0 m/s; here, guard 5 at 100 s, going at 5.0 m/s |
| LED-4665 | before | circling: men down from the walk: 5 → 4; circling: rounds at him: 21 → 26 | 10 → 3 | On `main`, guard 42 at 145 s, going at 5.0 m/s; here, guard 9 at 193 s, going at 2.4 m/s |
| LED-4665 | the firefight | circling: men down from the walk: 1 → 0; circling: rounds at him: 16 → 5 | 6 → 2 | On `main`, guard 42 at 156 s, going at 5.0 m/s; not here |
| NOG-3420 | the firefight | circling: rounds at him: 6 → 11 | 71 → 25 | On `main`, guard 8 at 170 s, going at 5.4 m/s; here, guard 10 at 192 s, going at 5.4 m/s |
| NAL-0183 | before | someone came after him: no → yes; the nearest anyone came (m): 43.8 → 28.2; men who came within 40 m: 0 → 3; men who left their own ground (over 45 m): 5 → 4; hits on him: 0 → 3; shot dead: no → yes; men he put down: 5 → 2; circling: men down from the walk: 0 → 1 | 103 → 30 | On `main`, guard 7 at 12 s, going at 5.0 m/s; here, guard 7 at 13 s, going at 5.0 m/s |
| ZEN-5124 | before | circling: men down from the walk: 6 → 5; circling: rounds at him: 26 → 17 | 13 → 5 | On `main`, guard 10 at 160 s, going at 2.4 m/s; here, guard 10 at 162 s, going at 2.4 m/s |
| ZEN-5124 | the firefight | circling: rounds at him: 27 → 37 | 2 → 1 | On `main`, guard 9 at 113 s, going at 2.4 m/s; not here |
| KOS-7566 | before | someone came after him: yes → no; they set eyes on him again: yes → no; the nearest anyone came (m): 13.7 → 57.4; men who came within 40 m: 5 → 0; men who left their own ground (over 45 m): 0 → 1; rounds at him while he watched: 4 → 0; men he put down: 6 → 3; circling: men down from the walk: 1 → 2; circling: rounds at him: 15 → 11 | 15 → 13 | On `main`, guard 7 at 74 s, going at 5.0 m/s; here, guard 4 at 269 s, going at 5.0 m/s |
| KOS-7566 | the firefight | circling: rounds at him: 40 → 45 | 10 → 7 | On `main`, guard 4 at 23 s, going at 5.0 m/s; here, guard 9 at 30 s, going at 5.0 m/s |
| TEH-6919 | before | circling: men down from the walk: 2 → 1; circling: rounds at him: 11 → 12 | 5 → 6 | On `main`, guard 45 at 136 s, going at 5.0 m/s; here, guard 5 at 133 s, going at 2.4 m/s |
| POB-1595 | before | circling: men down from the walk: 3 → 2 | 5 → 1 | On `main`, guard 10 at 444 s, going at 1.4 m/s; not here |
| POB-1595 | the firefight | circling: rounds at him: 8 → 14 | 15 → 24 | On `main`, guard 9 at 365 s, going at 4.4 m/s; here, guard 9 at 365 s, going at 4.4 m/s |
| NEN-9082 | before | the nearest anyone came (m): 65.6 → 53.2; men who left their own ground (over 45 m): 6 → 7; rounds at him while he watched: 2 → 0; hits on him: 3 → 0; shot dead: yes → no | 2 → 2 | On `main`, guard 4 at 240 s, going at 2.0 m/s; here, guard 10 at 496 s, going at 1.4 m/s |
| NEN-9082 | the firefight | the nearest anyone came (m): 47.4 → 65.6; rounds at him while he watched: 5 → 6; hits on him: 4 → 3 | 20 → 9 | On `main`, guard 4 at 289 s, going at 1.4 m/s; here, guard 4 at 291 s, going at 1.4 m/s |
| BEB-9314 | before | he found someone to shoot at: no → yes; someone came after him: — → no; they set eyes on him again: — → no; the nearest anyone came (m): — → 57.2; men who came within 40 m: — → 0; men who left their own ground (over 45 m): — → 8; rounds at him while he watched: — → 0; hits on him: — → 0; shot dead: — → no; men he put down: — → 7 | 16 → 2 | On `main`, guard 7 at 60 s, going at 5.0 m/s; here, guard 11 at 630 s, going at 1.4 m/s |
| KAN-9682 | before | men who left their own ground (over 45 m): 1 → 0; men he put down: 4 → 6; circling: men down from the walk: 6 → 2; circling: shot dead on the walk: no → yes; circling: rounds at him: 15 → 66 | 34 → 19 | On `main`, guard 2 at 171 s, going at 4.6 m/s; here, guard 41 at 153 s, going at 5.0 m/s |
| NID-7768 | before | circling: shot dead on the walk: yes → no; circling: got all the way round: no → yes; circling: rounds at him: 3 → 0 | 5 → 1 | On `main`, guard 38 at 129 s, going at 5.0 m/s; not here |
| NEM-4950 | before | circling: men down from the walk: 3 → 5; circling: shot dead on the walk: yes → no | 38 → 3 | On `main`, guard 47 at 429 s, going at 2.0 m/s; here, guard 47 at 433 s, going at 2.0 m/s |
| NEM-4950 | the firefight | circling: men down from the walk: 4 → 2; circling: rounds at him: 26 → 27 | 11 → 1 | On `main`, guard 40 at 143 s, going at 5.0 m/s; not here |
| ZAD-9026 | before | men who came within 40 m: 3 → 1; men who left their own ground (over 45 m): 4 → 5; hits on him: 2 → 3; shot dead: no → yes; men he put down: 5 → 4 | 10 → 4 | On `main`, guard 3 at 58 s, going at 2.0 m/s; here, guard 5 at 89 s, going at 5.0 m/s |
| ZAD-9026 | the firefight | circling: rounds at him: 7 → 5 | 10 → 1 | On `main`, guard 7 at 16 s, going at 5.0 m/s; not here |
| GIB-3251 | before | he found someone to shoot at: no → yes; someone came after him: — → no; they set eyes on him again: — → no; the nearest anyone came (m): — → 71.3; men who came within 40 m: — → 0; men who left their own ground (over 45 m): — → 7; rounds at him while he watched: — → 0; hits on him: — → 3; shot dead: — → yes; men he put down: — → 5; circling: men down from the walk: 6 → 5; circling: shot dead on the walk: no → yes; circling: got all the way round: yes → no; circling: rounds at him: 18 → 24 | 104 → 20 | On `main`, guard 2 at 18 s, going at 4.6 m/s; here, guard 43 at 127 s, going at 5.0 m/s |
| GIB-3251 | the firefight | men who left their own ground (over 45 m): 2 → 1; circling: rounds at him: 40 → 37 | 57 → 2 | On `main`, guard 2 at 154 s, going at 4.6 m/s; here, guard 2 at 26 s, going at 4.6 m/s |
| SAS-0085 | the firefight | rounds at him while he watched: 5 → 3; hits on him: 1 → 3; shot dead: no → yes; circling: men down from the walk: 1 → 2 | 26 → 24 | On `main`, guard 53 at 112 s, going at 2.4 m/s; here, guard 2 at 153 s, going at 4.6 m/s |
| PUH-3685 | before | men he put down: 3 → 4; circling: men down from the walk: 2 → 3; circling: shot dead on the walk: yes → no; circling: got all the way round: no → yes; circling: rounds at him: 27 → 23 | 7 → 5 | On `main`, guard 11 at 144 s, going at 2.4 m/s; here, guard 44 at 197 s, going at 2.0 m/s |
| PUH-3685 | the firefight | circling: rounds at him: 15 → 17 | 17 → 2 | On `main`, guard 11 at 144 s, going at 2.4 m/s; here, guard 11 at 141 s, going at 2.4 m/s |
| GAT-1285 | before | the nearest anyone came (m): 33.0 → 34.2 | 6 → 4 | On `main`, guard 35 at 249 s, going at 2.0 m/s; here, guard 37 at 253 s, going at 2.0 m/s |
| KUN-4349 | before | circling: men down from the walk: 0 → 3; circling: rounds at him: 24 → 8 | 4 → 1 | On `main`, guard 43 at 236 s, going at 2.0 m/s; not here |
| KUN-4349 | the firefight | circling: rounds at him: 21 → 24 | 15 → 6 | On `main`, guard 11 at 134 s, going at 4.4 m/s; here, guard 11 at 135 s, going at 4.4 m/s |
| ZIG-8803 | the firefight | circling: men down from the walk: 1 → 0; circling: rounds at him: 19 → 2 | 196 → 44 | On `main`, guard 8 at 104 s, going at 2.0 m/s; here, guard 8 at 107 s, going at 2.0 m/s |
| VEZ-8583 | before | circling: men down from the walk: 4 → 3; circling: rounds at him: 31 → 28 | 3 → 2 | On `main`, guard 47 at 137 s, going at 5.0 m/s; here, guard 47 at 137 s, going at 5.0 m/s |
| VEZ-8583 | the firefight | rounds at him while he watched: 12 → 11; hits on him: 3 → 4; circling: men down from the walk: 1 → 2; circling: rounds at him: 38 → 58 | 39 → 5 | On `main`, guard 53 at 173 s, going at 5.0 m/s; here, guard 53 at 174 s, going at 5.0 m/s |
| MIB-3844 | before | circling: rounds at him: 28 → 22 | 31 → 8 | On `main`, guard 9 at 316 s, going at 2.0 m/s; here, guard 38 at 254 s, going at 2.0 m/s |
| PAG-6249 | before | circling: rounds at him: 40 → 32 | 5 → 1 | On `main`, guard 10 at 594 s, going at 5.0 m/s; not here |
| KUF-2510 | before | circling: men down from the walk: 1 → 3; circling: rounds at him: 15 → 17 | 6 → 2 | On `main`, guard 5 at 101 s, going at 5.0 m/s; here, guard 3 at 147 s, going at 5.0 m/s |
| HUG-7893 | before | circling: men down from the walk: 1 → 3; circling: shot dead on the walk: no → yes; circling: got all the way round: yes → no; circling: rounds at him: 8 → 19 | 46 → 15 | On `main`, guard 5 at 123 s, going at 2.4 m/s; here, guard 5 at 125 s, going at 2.4 m/s |
| FIH-9765 | before | circling: rounds at him: 22 → 19 | 43 → 10 | On `main`, guard 42 at 137 s, going at 2.4 m/s; here, guard 42 at 139 s, going at 2.4 m/s |
| LAN-7903 | before | circling: rounds at him: 12 → 32 | 6 → 5 | On `main`, guard 8 at 633 s, going at 2.0 m/s; here, guard 40 at 638 s, going at 2.0 m/s |
| LAN-7903 | the firefight | circling: men down from the walk: 3 → 1; circling: rounds at him: 8 → 10 | 12 → 13 | On `main`, guard 8 at 166 s, going at 4.4 m/s; here, guard 8 at 168 s, going at 4.4 m/s |
| RAZ-3349 | before | circling: men down from the walk: 3 → 1; circling: shot dead on the walk: no → yes; circling: got all the way round: yes → no; circling: rounds at him: 26 → 22 | 15 → 7 | On `main`, guard 49 at 142 s, going at 2.4 m/s; here, guard 49 at 144 s, going at 2.4 m/s |
| TUZ-7507 | before | circling: rounds at him: 6 → 10 | 5 → 1 | On `main`, guard 4 at 264 s, going at 2.0 m/s; not here |
| ZET-8194 | before | someone came after him: no → yes; the nearest anyone came (m): 78.4 → 2.7; men who came within 40 m: 0 → 2; hits on him: 3 → 1; shot dead: yes → no; men he put down: 3 → 4; circling: rounds at him: 47 → 50 | 11 → 8 | On `main`, guard 49 at 124 s, going at 5.0 m/s; here, guard 39 at 205 s, going at 2.4 m/s |
| ZET-8194 | the firefight | circling: men down from the walk: 1 → 3 | 4 → 9 | On `main`, guard 10 at 102 s, going at 1.4 m/s; here, guard 10 at 101 s, going at 1.4 m/s |
| LOR-2255 | before | circling: rounds at him: 39 → 24 | 35 → 12 | On `main`, guard 11 at 272 s, going at 5.0 m/s; here, guard 43 at 329 s, going at 5.0 m/s |
| LOR-2255 | the firefight | circling: rounds at him: 65 → 73 | 6 → 3 | On `main`, guard 45 at 331 s, going at 2.4 m/s; here, guard 44 at 379 s, going at 5.2 m/s |
| RIZ-3160 | before | circling: men down from the walk: 4 → 6; circling: rounds at him: 18 → 14 | 32 → 4 | On `main`, guard 51 at 159 s, going at 5.0 m/s; here, guard 51 at 173 s, going at 5.0 m/s |
| SAK-8948 | before | circling: men down from the walk: 6 → 5 | 7 → 2 | On `main`, guard 4 at 234 s, going at 2.4 m/s; here, guard 4 at 233 s, going at 2.4 m/s |
| HIH-7702 | before | circling: men down from the walk: 5 → 7; circling: rounds at him: 27 → 26 | 55 → 11 | On `main`, guard 46 at 153 s, going at 5.0 m/s; here, guard 12 at 186 s, going at 5.0 m/s |
| HIH-7702 | the firefight | circling: men down from the walk: 4 → 3; circling: rounds at him: 33 → 15 | 48 → 8 | On `main`, guard 2 at 14 s, going at 4.6 m/s; here, guard 48 at 234 s, going at 5.0 m/s |
| KOV-8465 | before | men he put down: 4 → 3; circling: rounds at him: 28 → 29 | 22 → 4 | On `main`, guard 11 at 188 s, going at 5.0 m/s; here, guard 11 at 188 s, going at 5.0 m/s |
| LUH-5331 | before | circling: men down from the walk: 1 → 4; circling: rounds at him: 16 → 39 | 19 → 11 | On `main`, guard 8 at 87 s, going at 2.0 m/s; here, guard 42 at 154 s, going at 2.0 m/s |
| RIP-6604 | before | they set eyes on him again: yes → no; the nearest anyone came (m): 16.8 → 20.3; men who came within 40 m: 5 → 2; men who left their own ground (over 45 m): 5 → 6; rounds at him while he watched: 6 → 2 | 1 → 4 | After the stalls they share: here, guard 2 at 338 s, going at 4.6 m/s |
| RIP-6604 | the firefight | circling: rounds at him: 69 → 70 | 35 → 10 | On `main`, guard 9 at 147 s, going at 5.4 m/s; here, guard 71 at 149 s, going at 5.0 m/s |
| GIF-1421 | before | the nearest anyone came (m): 112.02 → 111.53 | 38 → 1 | On `main`, guard 5 at 24 s, going at 2.4 m/s; not here |
| GIF-1421 | the firefight | men who left their own ground (over 45 m): 4 → 3; hits on him: 0 → 3; shot dead: no → yes; men he put down: 6 → 5 | 12 → 4 | On `main`, guard 40 at 199 s, going at 2.4 m/s; here, guard 40 at 136 s, going at 2.4 m/s |
| BIH-3754 | before | someone came after him: yes → no; they set eyes on him again: yes → no; the nearest anyone came (m): 53.6 → 75.4; men who left their own ground (over 45 m): 2 → 4; rounds at him while he watched: 2 → 0; hits on him: 3 → 0; shot dead: yes → no | 6 → 6 | On `main`, guard 46 at 226 s, going at 2.0 m/s; here, guard 46 at 227 s, going at 2.0 m/s |
| GIB-7096 | before | the nearest anyone came (m): 45.3 → 48.0; men who left their own ground (over 45 m): 4 → 5; hits on him: 3 → 2; shot dead: yes → no; circling: rounds at him: 63 → 100 | 21 → 5 | On `main`, guard 39 at 141 s, going at 5.0 m/s; here, guard 49 at 128 s, going at 5.0 m/s |
| ZUM-5566 | before | circling: men down from the walk: 1 → 3; circling: shot dead on the walk: yes → no; circling: got all the way round: no → yes; circling: rounds at him: 7 → 2 | 13 → 7 | On `main`, guard 12 at 109 s, going at 2.4 m/s; here, guard 41 at 123 s, going at 2.4 m/s |
| FUS-1776 | before | men who left their own ground (over 45 m): 5 → 4; hits on him: 0 → 3; shot dead: no → yes; men he put down: 4 → 5; circling: rounds at him: 10 → 8 | 42 → 3 | On `main`, guard 36 at 191 s, going at 5.0 m/s; here, guard 8 at 290 s, going at 2.0 m/s |
| FUS-1776 | the firefight | men who left their own ground (over 45 m): 4 → 3; hits on him: 3 → 0; shot dead: yes → no; men he put down: 5 → 3 | 9 → 6 | On `main`, guard 11 at 119 s, going at 2.4 m/s; here, guard 11 at 119 s, going at 2.4 m/s |
| ZUM-8816 | before | circling: men down from the walk: 1 → 2; circling: shot dead on the walk: yes → no; circling: got all the way round: no → yes; circling: rounds at him: 26 → 25 | 11 → 3 | On `main`, guard 49 at 124 s, going at 5.0 m/s; here, guard 49 at 123 s, going at 5.0 m/s |
| ZUM-8816 | the firefight | circling: rounds at him: 66 → 51 | 9 → 5 | On `main`, guard 8 at 92 s, going at 5.4 m/s; here, guard 64 at 123 s, going at 5.0 m/s |
| BON-5377 | before | circling: rounds at him: 39 → 45 | 2 → 3 | On `main`, guard 3 at 436 s, going at 2.0 m/s; here, guard 46 at 337 s, going at 2.4 m/s |
| MAT-6326 | the firefight | circling: rounds at him: 70 → 77 | 11 → 10 | On `main`, guard 8 at 246 s, going at 4.4 m/s; here, guard 2 at 21 s, going at 4.6 m/s |
| KIZ-4283 | the firefight | circling: rounds at him: 66 → 65 | 5 → 1 | On `main`, guard 8 at 138 s, going at 5.4 m/s; not here |
| BUB-6053 | before | men he put down: 5 → 4; circling: men down from the walk: 4 → 1; circling: shot dead on the walk: no → yes; circling: got all the way round: yes → no; circling: rounds at him: 15 → 30 | 27 → 13 | On `main`, guard 11 at 188 s, going at 5.0 m/s; here, guard 5 at 205 s, going at 2.4 m/s |

### `flaws`: every attack script against the same camps, with no player: how often the camp does something a defender plainly would not

216 runs on 24 camps. A walk stalled on `main` in 106 of them. 20 runs read differently, on 8 camps. Stalls in all: 797 → 361. Walks given up: 122 → 18. No count of runs moved.

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| GIN-9513 | one-shot | stuck: 2 → 0 | 11 → 3 | On `main`, guard 39 at 124 s, going at 5.0 m/s; here, guard 2 at 132 s, going at 4.6 m/s |
| GIN-9513 | suppressed-sniper | stuck: 2 → 4; pile-up: 0 → 2 | 10 → 5 | On `main`, guard 51 at 124 s, going at 5.0 m/s; here, guard 2 at 132 s, going at 4.6 m/s |
| GIN-9513 | relocating | pile-up: 0 → 4 | 37 → 13 | On `main`, guard 2 at 133 s, going at 4.6 m/s; here, guard 2 at 134 s, going at 4.6 m/s |
| GIN-9513 | two-fronts | stuck: 2 → 0; pile-up: 0 → 3 | 16 → 9 | On `main`, guard 43 at 124 s, going at 5.0 m/s; here, guard 5 at 124 s, going at 2.4 m/s |
| GIN-9513 | silent-kills | stuck: 2 → 0 | 12 → 3 | On `main`, guard 36 at 138 s, going at 5.0 m/s; here, guard 36 at 138 s, going at 5.0 m/s |
| ZUB-2548 | sniper | chatter: 2 → 1 | 9 → 2 | On `main`, guard 4 at 16 s, going at 5.0 m/s; here, guard 43 at 145 s, going at 5.0 m/s |
| ZUB-2548 | relocating | chatter: 4 → 3 | 10 → 2 | On `main`, guard 4 at 16 s, going at 5.0 m/s; here, guard 59 at 145 s, going at 5.0 m/s |
| ZUB-2548 | silent-kills | chatter: 0 → 1 | 7 → 2 | On `main`, guard 37 at 171 s, going at 5.0 m/s; here, guard 38 at 183 s, going at 2.0 m/s |
| LUD-6633 | silent-kills | stuck: 3 → 2 | 9 → 2 | On `main`, guard 2 at 164 s, going at 4.6 m/s; here, guard 35 at 170 s, going at 5.0 m/s |
| SUK-5361 | sniper | pile-up: 1 → 3 | 16 → 12 | On `main`, guard 2 at 146 s, going at 4.6 m/s; here, guard 2 at 148 s, going at 4.6 m/s |
| SUK-5361 | suppressed-sniper | stuck: 4 → 2 | 5 → 3 | On `main`, guard 2 at 179 s, going at 4.6 m/s; here, guard 2 at 180 s, going at 4.6 m/s |
| SUK-5361 | relocating | stuck: 2 → 0 | 14 → 7 | On `main`, guard 2 at 147 s, going at 4.6 m/s; here, guard 69 at 201 s, going at 2.4 m/s |
| SUK-5361 | two-fronts | pile-up: 1 → 3 | 16 → 12 | On `main`, guard 2 at 146 s, going at 4.6 m/s; here, guard 2 at 148 s, going at 4.6 m/s |
| SUK-5361 | silent-kills | stuck: 4 → 2 | 12 → 6 | On `main`, guard 2 at 144 s, going at 4.6 m/s; here, guard 2 at 144 s, going at 4.6 m/s |
| HEM-7749 | relocating | stuck: 0 → 2 | 0 → 1 | No stall on `main`: here, guard 2 at 134 s, going at 4.6 m/s |
| DOV-4221 | suppressed-sniper | stuck: 4 → 7 | 21 → 1 | On `main`, guard 2 at 177 s, going at 4.6 m/s; not here |
| NUB-9046 | sniper | pile-up: 0 → 7 | 22 → 7 | On `main`, guard 55 at 148 s, going at 5.0 m/s; here, guard 5 at 156 s, going at 1.4 m/s |
| NUB-9046 | suppressed-sniper | pile-up: 0 → 12 | 39 → 9 | On `main`, guard 61 at 148 s, going at 5.0 m/s; here, guard 5 at 156 s, going at 1.4 m/s |
| NUB-9046 | two-fronts | pile-up: 0 → 4 | 22 → 8 | On `main`, guard 52 at 148 s, going at 5.0 m/s; here, guard 5 at 156 s, going at 1.4 m/s |
| BIG-3366 | sniper | stuck: 0 → 3 | 7 → 9 | On `main`, guard 9 at 183 s, going at 2.4 m/s; here, guard 59 at 142 s, going at 5.0 m/s |

### `out-the-gate`: seen inside a camp, he leaves by an opening in its wall and turns along it: what comes after him, as it was and with the chase

48 runs on 24 camps. A walk stalled on `main` in 11 of them. 5 runs read differently, on 5 camps. Stalls in all: 98 → 29. Walks given up: 16 → 0. Counts that moved: by the wall: someone was out within 25 s 18 → 19 of 48 (1 gained, 0 lost).

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| TES-6931 | the chase | runs for the trees: rounds fired at him: 59 → 44; runs for the trees: rounds that hit him once he was out: 16 → 13 | 5 → 1 | On `main`, guard 4 at 59 s, going at 2.4 m/s; not here |
| DOT-6344 | the chase | by the wall: after (s): 22.8 → 15.2; by the wall: after (s): 25.4 → 17.8; by the wall: someone was out within 25 s: no → yes; by the wall: after (s): 29.8 → 22.3; by the wall: rounds fired by men who came out: 14 → 27 | 15 → 3 | On `main`, guard 4 at 130 s, going at 5.2 m/s; here, guard 4 at 128 s, going at 5.2 m/s |
| PET-8787 | the chase | by the wall: after (s): 18.4 → 17.4; by the wall: rounds fired by men who came out: 30 → 0 | 5 → 1 | On `main`, guard 11 at 38 s, going at 5.2 m/s; not here |
| PID-8021 | the chase | runs for the trees: rounds fired at him: 14 → 34; runs for the trees: rounds that hit him once he was out: 9 → 15 | 10 → 3 | On `main`, guard 10 at 112 s, going at 5.2 m/s; here, guard 8 at 114 s, going at 5.2 m/s |
| VOM-2928 | the chase | by the wall: rounds fired by men who came out: 0 → 1; runs for the trees: rounds fired at him: 70 → 85; runs for the trees: rounds that hit him once he was out: 27 → 28 | 19 → 5 | On `main`, guard 9 at 40 s, going at 2.4 m/s; here, guard 10 at 76 s, going at 2.4 m/s |

### `own-side`: a fight round a gate: how often the camp shoots its own men, and what holding fire for them costs

48 runs on 24 camps. A walk stalled on `main` in 34 of them. 14 runs read differently, on 7 camps. Stalls in all: 273 → 112. Walks given up: 42 → 4. No count of runs moved.

| Camp | Run | What reads differently | Stalls | The first stall that isn't the same |
| --- | --- | --- | --- | --- |
| TES-6931 | as it was | by the wall: rounds the camp fired: 54 → 20; runs for the trees: rounds the camp fired: 157 → 160 | 19 → 14 | On `main`, guard 4 at 113 s, going at 2.4 m/s; here, guard 4 at 112 s, going at 5.2 m/s |
| TES-6931 | looks out for its own | by the wall: rounds the camp fired: 51 → 17; runs for the trees: rounds the camp fired: 158 → 114; runs for the trees: rounds held for one of its own: 39 → 92; runs for the trees: rounds that hit him once he was out: 32 → 23 | 19 → 14 | On `main`, guard 4 at 113 s, going at 2.4 m/s; here, guard 4 at 112 s, going at 5.2 m/s |
| DOT-6344 | as it was | by the wall: rounds the camp fired: 45 → 56 | 10 → 2 | On `main`, guard 4 at 130 s, going at 5.2 m/s; here, guard 4 at 128 s, going at 5.2 m/s |
| DOT-6344 | looks out for its own | by the wall: rounds the camp fired: 45 → 56 | 10 → 2 | On `main`, guard 4 at 130 s, going at 5.2 m/s; here, guard 4 at 128 s, going at 5.2 m/s |
| PET-8787 | as it was | by the wall: rounds the camp fired: 64 → 110 | 11 → 3 | On `main`, guard 11 at 38 s, going at 5.2 m/s; here, guard 45 at 111 s, going at 5.0 m/s |
| PET-8787 | looks out for its own | by the wall: rounds the camp fired: 53 → 109; by the wall: rounds held for one of its own: 11 → 1 | 11 → 3 | On `main`, guard 11 at 38 s, going at 5.2 m/s; here, guard 44 at 111 s, going at 5.0 m/s |
| PID-8021 | as it was | runs for the trees: rounds the camp fired: 57 → 66; runs for the trees: rounds that hit him once he was out: 17 → 24 | 10 → 3 | On `main`, guard 10 at 112 s, going at 5.2 m/s; here, guard 8 at 114 s, going at 5.2 m/s |
| PID-8021 | looks out for its own | runs for the trees: rounds the camp fired: 47 → 65; runs for the trees: rounds held for one of its own: 10 → 1; runs for the trees: rounds that hit him once he was out: 16 → 24 | 10 → 3 | On `main`, guard 10 at 112 s, going at 5.2 m/s; here, guard 8 at 114 s, going at 5.2 m/s |
| KEB-2136 | as it was | by the wall: men shot by their own side: 2 → 1; by the wall: rounds the camp fired: 123 → 113 | 2 → 2 | On `main`, guard 11 at 110 s, going at 5.2 m/s; here, guard 4 at 129 s, going at 5.2 m/s |
| KEB-2136 | looks out for its own | by the wall: rounds the camp fired: 70 → 78; by the wall: rounds held for one of its own: 75 → 42 | 3 → 2 | On `main`, guard 11 at 110 s, going at 5.2 m/s; here, guard 4 at 129 s, going at 5.2 m/s |
| VOM-2928 | as it was | by the wall: rounds the camp fired: 99 → 101; runs for the trees: rounds the camp fired: 155 → 221; runs for the trees: rounds that hit him once he was out: 49 → 59 | 14 → 4 | On `main`, guard 9 at 40 s, going at 2.4 m/s; here, guard 10 at 76 s, going at 2.4 m/s |
| VOM-2928 | looks out for its own | by the wall: rounds the camp fired: 99 → 101; runs for the trees: rounds the camp fired: 155 → 193; runs for the trees: rounds held for one of its own: 0 → 28; runs for the trees: rounds that hit him once he was out: 49 → 55 | 14 → 4 | On `main`, guard 9 at 40 s, going at 2.4 m/s; here, guard 10 at 76 s, going at 2.4 m/s |
| ZOH-8906 | as it was | by the wall: rounds the camp fired: 35 → 52 | 4 → 3 | On `main`, guard 9 at 72 s, going at 2.4 m/s; here, guard 5 at 147 s, going at 1.4 m/s |
| ZOH-8906 | looks out for its own | by the wall: rounds the camp fired: 35 → 52 | 4 → 3 | On `main`, guard 9 at 72 s, going at 2.4 m/s; here, guard 5 at 147 s, going at 1.4 m/s |
