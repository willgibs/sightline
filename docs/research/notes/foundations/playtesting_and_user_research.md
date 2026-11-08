# Playtesting and games user research: methods that make small-sample exit tests credible

Tags used below: **[E]** measured evidence (a study or benchmark with data), **[P]** practitioner primary source (a studio's own talk, deck or engineering blog), **[S]** secondary summary or press, **[C]** claim with no published data. **†** means the source was read directly in this session (in full or the relevant section). Untagged sources were checked through abstracts, publisher pages or search excerpts only. Every "Fit:" line says how the item applies to Sightline's setup: one owner-tester, bit-exact replays, per-playtest telemetry, and labs A–E with their exit tests. Numbers marked *computed* were worked out for these notes with exact binomial sums, using the interval definitions in Brown, Cai & DasGupta (2001). Web searching stopped partway through because the session's shared search budget ran out. The Gaps sections list what could not be checked.

## 1. How do game studios test whether players understand systems, and has NPC perception or stealth readability been tested?

### Takeaway
Studio games user research (GUR) checks understanding with direct observation, think-aloud, structured Q&A and rapid fix-and-retest loops (RITE). It treats what players *do* as more reliable than what they *say*. Published tests of NPC perception readability are rare. The closest is McGill's stealth work (Tremblay et al. 2014: 27 people judged which of two animated paths was safer). I found no published study that measures how accurately players predict guard detection outcomes, which is what Lab A does.

### Cited Findings

**Industry practice**
- **[P]† Valve, "Valve's Approach to Playtesting: The Application of Empiricism" (Mike Ambinder, GDC 2009).** Valve's process treats "game designs are hypotheses; playtests are experiments", and it aims to "get data early, get data often" and iterate constantly. The deck lists the methods with their trade-offs:
  - direct observation, which matters because of "what people do — not what they say", though observers can bias results and behaviour needs interpretation;
  - verbal reports, i.e. think-aloud that is "unprompted and uncorrected" and runs alongside observation; good for "why" questions, but it interferes with play and is "inaccurate and biased";
  - Q&A, which can determine specific player intent, but "people don't know why they do what they do", and group Q&A suffers anchoring and social pressure;
  - stats/telemetry, design experiments (hypotheses, conditions, data), forced-choice surveys, and physiological measures.

  The deck also states that the playtest goal is fun, "not bug testing, not game balancing". — [Valve GDC 2009 deck](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ValvesApproachToPlaytesting.pdf). *Fit:* this argues for scoring Lab A/C on what the owner predicts (behaviour), not on how he explains himself. Keep fun and feel (B, C's "deliberate" judgement) apart from readability scoring and from bug-hunting by bots.
- **[P] Pagulayan, Keeker, Wixon, Romero & Fuller, "User-centered design in games" (Microsoft Game Studios; HCI Handbook, 2003, pp. 883–906).** Iterative usability testing of games aims to remove "obstacles to fun" rather than obstacles to accomplishment. — [UCSB CDGR entry](https://cdgr.ucsb.edu/database/user-centered-design-games). *Fit:* Sightline's readability tests remove obstacles to understanding. Failing to read a guard is an obstacle to fun only when it feels arbitrary.
- **[S] Halo 3 testing (NPR, 2007).** The lab used multiple cameras, players were asked whether the game was too hard, easy, fast or slow, and they thought aloud. One reported finding: players repeatedly didn't know their objective, and the fix was to flash the new objective on screen. Fetching the page timed out, so these details come from search excerpts. — [NPR transcript](https://www.npr.org/transcripts/14649338). *Fit:* comprehension failures show up as repeated behaviour. Look for the same wrong prediction recurring on the same cue type.
- **[P]† RITE, Rapid Iterative Testing and Evaluation (Medlock et al., Microsoft, named 2002; Age of Empires II case study).** The team fixes a problem as soon as it is found, often after a single participant, and keeps testing on the revised build. The AoE II study ran 10 participants with rapid iteration, then 6 with no changes (the "verification step"). MeasuringU notes that six change-free sessions only give 80% confidence of having seen problems that affect about 24% or more of users. Catching 1%-frequency problems at that confidence would need 161 change-free participants. No study has compared RITE with traditional testing, and practitioners often skip the verification step. — [MeasuringU, "Ten Things to Know about the RITE Method"](https://measuringu.com/rite-method/); [Wikipedia: RITE Method](https://en.wikipedia.org/wiki/RITE_Method). *Fit:* RITE fits the owner-only loop between sittings: fix the cue, re-run, keep the gate sittings as the verification step. Its stopping math also limits what "zero unexplained reactions" in Lab E can show (§2).
- **[E] Cued retrospective reporting (van Gog, Paas, van Merriënboer & Witte, J. Exp. Psych.: Applied 11(4):237–244, 2005; N = 26).** Participants retrospected while watching a replay of their own eye fixations and mouse/keyboard actions. This yielded more coded information than plain retrospective reports, except for "why" information. Concurrent reporting did likewise, except for metacognitive information. — [Open Universiteit record](https://research.ou.nl/en/publications/uncovering-the-problem-solving-process-cued-retrospective-reporti/). *Fit:* Sightline's bit-exact replay is a ready cue for this. Have the owner explain each Lab E reaction, or each Lab A miss, while watching the replay instead of thinking aloud during 8-second trials.
- **[P] Riot Games, "Clarity in League" (dev blog).** Riot holds a clarity standard: silhouettes are "the single most important thing" for recognizing a champion, skins must keep clarity parity with the base champion, and distracting effects are cut back. One example: Dawnbringer Soraka's ultimate effect was limited to the Soraka player. Riot admits older champions were designed "mostly going off of intuition." — [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/). *Fit:* this is a standing clarity rule like Lab A's "every detection is telegraphed by a cue first". It is evidence that studios set clarity rules, not of how they test them.

**Stealth- and perception-specific**
- **[E]† Tremblay, Andrade Torres & Verbrugge, "Measuring Risk in Stealth Games" (FDG 2014).**
  - **Design:** 27 anonymous participants, mostly students, took part unsupervised in their own browsers in a 15–20-minute session. Each saw 15 levels as looping animated GIFs of two player paths, with guard movement and fields of view, and picked the "overall safest" path. Path colour was randomized.
  - **Consensus:** human agreement reached the authors' 75% threshold on only 10 of 15 levels.
  - **Metrics:** of three risk metrics, path distance to enemies agreed with the human consensus on all 10. Line of sight and "near misses" each agreed on 7.
  - **Expectations:** the designers' guesses about which levels were clear and which ambiguous did not always match the people.
  - **Limit:** the authors call for testing other contexts and presentations to see whether distance dominance generalizes.

  — [paper PDF](https://www.cs.mcgill.ca/~jtremb59/Papers/fdg2014_paper_33.pdf). *Fit:* this is the closest published precedent for Lab A: a forced-choice judgement of stealth risk from an observer's view.
  - A third of hand-made scenarios had no 75% consensus among 27 people, so borderline trials will be genuinely ambiguous.
  - If outcomes are predictable from distance alone, the test may measure distance reading, not cue reading.
- **[E] Al Enezi & Verbrugge, "Evaluating Player Experience in Stealth Games: Dynamic Guard Patrol Behavior Study" (AIIDE 2023).** Players could generally tell several dynamic patrol behaviours apart by difficulty and by enjoyment. — [DOI](https://doi.org/10.1609/aiide.v19i1.27513). *Fit:* players can tell guard behaviours apart, which supports Lab E's "explain every reaction". The participant count was not available to me.
- **[P/S]† Martin Walsh, "Modeling AI Perception and Awareness in Splinter Cell: Blacklist" (GDC 2014), as summarized by Tommy Thompson (Game Developer, June 3, 2020).**
  - **Plausibility over cleverness:** guards should be "always being plausible" rather than clever.
  - **Vision:** Blacklist uses several vision regions with different thresholds and build-up rates. The overall shape is "coffin"-like rather than a cone.
  - **Body visibility:** raycasts go from the guard's eyes to 8 of Sam's bones, and detection needs a stance-dependent minimum of visible bones. Designers can set visibility values at cover points.
  - **Hearing:** guards hear less when off-screen.
  - **Feedback:** tiered barks such as "I saw something" serve as feedback.
  - **Testing:** the summary reports no playtest data.

  — [Thompson summary](https://gamedeveloper.com/design/bringing-balance-to-stealth-ai-in-splinter-cell-blacklist); [GDC Vault session](https://gdcvault.com/play/1020436/Modeling-AI-Perception-and-Awareness). *Fit:* design precedents for A's cues: graded barks, quieter off-screen hearing, stance-dependent exposure. Treat them as design claims, not tested readability results.

### Inferences
- The published record has no direct precedent for Lab A's measure, i.e. accuracy at predicting yes/no detection from an honest view. Studios either observe whether players understand (Valve, Halo) or ask humans to rank risk (Tremblay). Lab A's protocol is more rigorous than common practice, and its design choices have to stand on statistics (§2) rather than on precedent.
- Valve's warning that "people don't know why they do what they do" suggests adding a one-tap "which cue told you?" probe after each A/C trial: light, stance, movement, distance, gaze, sound, or none. Compare it with `explain(id)`'s top factor. Use it to diagnose, never to gate: self-reported reasons are biased, but disagreements show where the owner's mental model and the simulation's causal model part.
- Tremblay's finding that distance dominated human risk judgements suggests a cheap check. Fit a *distance-only predictor* to each trial set. If it already scores near 80%, the trials don't test cues.
- RITE suits the time between sittings. A sitting that fails points to cue fixes, and the next sitting on fresh trials acts as verification.

### Gaps
- No published study found that measures how accurately players predict NPC detection outcomes, in any genre. The first search said so explicitly, and later searches found only the adjacent studies above.
- I could not verify GUR comprehension-testing practice from PlayStation, Ubisoft or Bungie, the GDC Games UX Summit talks, or the book *Games User Research* (Drachen, Mirza-Babaei & Nacke, OUP 2018). The search budget ran out before those queries. Sony Interactive Entertainment does list the VideoGameQA-Bench study (§4) on its research pages ([SIE](https://sonyinteractive.com/en/innovation/research-academia/research/vision-language-models-for-quality-assurance/)).
- The participant count for Al Enezi & Verbrugge 2023 is unknown; the AAAI page blocked automated access.
- Wired's 2007 Halo 3 feature could not be fetched. Halo details here rest on NPR excerpts and on secondary summaries in §3.

## 2. What do small-sample statistics say about the A/C protocol (intervals, the 80%-of-60 bar, base rates, learning effects, one tester)?

### Takeaway
80% of 60 decisively rules out guessing (p ≈ 1.6×10⁻⁶). Against 70% it is roughly a one-sided 5% test: a tester with true accuracy 70% passes 5.6% of the time, one at 85% passes 89%, but one at exactly 80% passes only 57%.

The bigger risk is not sample size but what gets measured. With half the trials "clear", an owner who knows the sight table but reads no cues averages about 74–75%, and passes 12–18% of the time. So the borderline (cue-dependent) trials need their own score and their own bar. The answer key needs balanced base rates, scored as balanced accuracy, and accuracy should be compared with a rules-only baseline, not with 50%.

### Cited Findings
- **[E] Brown, Cai & DasGupta, "Interval Estimation for a Binomial Proportion" (Statistical Science 16(2), 2001).** The standard Wald interval's coverage is erratic. For n ≤ 40 they recommend the Wilson or equal-tailed Jeffreys interval. For n > 40, the Wilson, Jeffreys and Agresti–Coull intervals are all very similar. — [Project Euclid](https://projecteuclid.org/euclid.ss/1009213286). *Fit:* use Wilson for each 30-trial sitting and for the 60-trial total, and avoid Wald.
- **[E] Sauro & Lewis, "Estimating Completion Rates from Small Samples Using Binomial Confidence Intervals" (HFES 2005).**
  - On UX-style small samples, the adjusted Wald interval (add 2 successes and 2 failures) performed best for 95% intervals.
  - Clopper–Pearson ("exact") was overly conservative, covering nearer 99% at nominal 95%.
  - The plain Wald interval understated the width.

  — [paper PDF](https://lgreski.github.io/datasciencedepot/references/EstimatingCompletionRatesSauro-Lewis.pdf); [MeasuringU calculator](https://measuringu.com/wald/). *Fit:* report Wilson or adjusted Wald. Use Clopper–Pearson only where a guaranteed-conservative bound is wanted, such as a public claim.
- **[E] Computed: 95% two-sided intervals** (definitions per [Brown et al. 2001](https://projecteuclid.org/euclid.ss/1009213286)):

  | Observed | Wilson | Clopper–Pearson | Adjusted Wald |
  |---|---|---|---|
  | 21/30 (70%) | 52.1–83.3% | 50.6–85.3% | 52.0–83.5% |
  | 24/30 (80%) | 62.7–90.5% | 61.4–92.3% | 62.3–90.9% |
  | 27/30 (90%) | 74.4–96.5% | 73.5–97.9% | 73.6–97.3% |
  | 12/15 (80%, one stratum in one sitting) | 54.8–93.0% | 51.9–95.7% | 54.0–93.7% |
  | 42/60 (70%) | 57.5–80.1% | 56.8–81.2% | 57.4–80.2% |
  | 48/60 (80%) | 68.2–88.2% | 67.7–89.2% | 68.1–88.3% |
  | 51/60 (85%) | 73.9–91.9% | 73.4–92.9% | 73.7–92.1% |
  | 54/60 (90%) | 79.9–95.3% | 79.5–96.2% | 79.5–95.7% |

  One-sided 95% lower bounds: 48/60 gives 69.6% (Clopper–Pearson) and 70.3% (Wilson); 51/60 gives 75.3% and 75.9%; 54/60 gives 81.2% and 81.8%; 24/30 gives 64.3% and 65.7%. *Fit:* scoring exactly 48/60 shows the owner's true accuracy is probably above about 70%, not that it is 80%. To show ≥ 80% at 95% confidence, he would need about 54/60.
- **[E] Computed: exact tails against chance and against 70%** (n = 60, pass at ≥ 48):

  | True accuracy | P(≥ 48/60) |
  |---|---|
  | 0.50 | 1.6×10⁻⁶ |
  | 0.60 | 8.1×10⁻⁴ |
  | 0.65 | 0.0086 |
  | 0.70 | 0.057 |
  | 0.75 | 0.23 |

  For the per-sitting floor at n = 30, P(≥ 21 | 0.5) = 0.021 and P(≥ 21 | 0.7) = 0.59. *Fit:* the 80% bar is in effect the critical value of a one-sided exact test of H₀: p ≤ 0.70 at α ≈ 0.057. Chance (50%) is the wrong null for this gate.
- **[E] Computed: operating characteristic of the full rule** (≥ 48/60 and ≥ 21/30 in each sitting; independent trials at constant accuracy p):

  | True accuracy p | P(pass) | P(fail the floor at sitting 1) |
  |---|---|---|
  | 0.70 | 0.056 | 0.41 |
  | 0.72 | 0.104 | 0.32 |
  | 0.75 | 0.229 | 0.20 |
  | 0.78 | 0.422 | 0.10 |
  | 0.80 | 0.573 | 0.06 |
  | 0.82 | 0.721 | 0.03 |
  | 0.85 | 0.892 | 0.01 |
  | 0.88 | 0.975 | 0.002 |
  | 0.90 | 0.994 | < 0.001 |

  The per-sitting floor changes P(pass) by less than 0.5 points when accuracy is steady; the total alone gives 0.057, 0.576 and 0.894 at 0.70, 0.80 and 0.85. It matters as an early stop and when the sittings differ. Learning between sittings with the same 80% mean:

  | Sitting 1 → sitting 2 | P(pass) |
  |---|---|
  | 0.80 → 0.80 | 0.573 |
  | 0.75 → 0.85 | 0.560 |
  | 0.70 → 0.90 | 0.496 |
  | 0.65 → 0.95 | 0.348 |

  *Fit:* the gate separates about 70% from about 85% well. At exactly the 80% target it is a coin flip. The floor is a cheap futility stop after sitting 1.
- **[E] Computed: a mix of clear and borderline trials** (15 of each per sitting). Answering the clear half from the rules while guessing on the borderline half still passes sometimes:

  | Clear-trial accuracy | Borderline accuracy | Expected overall | P(pass) |
  |---|---|---|---|
  | 1.00 | 0.50 | 75% | 0.18 |
  | 0.97 | 0.50 | 73.5% | 0.12 |
  | 0.97 | 0.60 | 78.5% | 0.45 |
  | 1.00 | 0.60 | 80% | 0.58 |
  | 0.97 | 0.65 | 81% | 0.66 |
  | 0.95 | 0.70 | 82.5% | 0.77 |

  Scored on its own, the borderline stratum (30 trials across both sittings) at a bar of ≥ 21/30 gives these pass rates:

  | Borderline accuracy | P(≥ 21/30) |
  |---|---|
  | 0.50 (chance) | 0.021 |
  | 0.70 | 0.59 |
  | 0.75 | 0.80 |
  | 0.80 | 0.94 |

  A bar of ≥ 20/30 passes chance with P = 0.049. *Fit:* this is the protocol's main validity gap. An owner who knows the sight table can approach the pass mark on the clear half alone. Report borderline accuracy separately and require roughly ≥ 21/30 on it.
- **[E] Faulkner, "Beyond the five-user assumption" (Behavior Research Methods, Instruments & Computers 35(3):379–383, 2003).** 100 simulated tests were run per group size from 5 to 60 users. Five users found about 85% of problems on average, but individual five-user sets found as few as 55%. Fifteen users found about 97% on average, with a lower bound of 90%. — [PubMed](https://pubmed.ncbi.nlm.nih.gov/14587545/). *Fit:* people vary a lot as testers. A single tester's result is one draw from that spread, and the owner is an atypical draw who knows the rules (§2 Inferences).
- **[P] NIST combinatorial testing (Kuhn, Wallace & Gallo 2004 and later NIST work).**
  - Software failures are triggered by interactions of a few parameters: in NIST's cross-study figures, 65% of faults by a single factor and 96% by one or two factors, with nearly all involving 6 or fewer.
  - Pairwise coverage alone can still miss faults that need more factors.

  — [NIST ACTS research program](https://csrc.nist.gov/Projects/automated-combinatorial-testing-for-software/Our-Research-Program); [Kuhn 2019 slides](https://csrc.nist.gov/CSRC/media/Projects/cyber-supply-chain-risk-management/documents/SSCA/Fall_2019/WedAM2.2_kuhn.pdf); [Kuhn, Wallace & Gallo 2004](https://webarchive.library.unt.edu/eot2008/20080916140037/http://csrc.nist.gov/staff/Kuhn/kuhn-wallace-gallo-04.pdf). *Fit:* the evidence comes from software faults, so applying it to perception is an analogy. A pairwise covering array over the 7 situation factors (role/gaze, distance, stance, movement, light, cover, skyline) lets 30 trials touch every pair of factor levels. That beats uniform random draws for coverage.
- **[E]† Tremblay et al. 2014:** 5 of 15 stealth scenarios had no 75% consensus among 27 viewers ([PDF](https://www.cs.mcgill.ca/~jtremb59/Papers/fdg2014_paper_33.pdf)). *Fit:* some borderline items will be unanswerable even for groups. Item analysis (§3) should drop items that are ambiguous for everyone rather than count them against the cues.
- **[P]† MeasuringU on RITE stopping:** the chance of having seen a problem of frequency p in n clean sessions is 1 − (1 − p)ⁿ. Six clean sessions give 80% confidence only for problems of about 24% frequency or more. — [MeasuringU](https://measuringu.com/rite-method/). *Fit:* the same math bounds Lab E's "press M; target zero" (computed below).

### Inferences
- **Fix the base rate first.** "Half end in detection, half are borderline" can be read as a partition: detection trials versus borderline trials. Then the yes/no key is not 50/50 and "always yes" beats 50%. Use a 2×2 stratification instead: outcome (detected / not) × difficulty (clear / borderline), with 7–8 trials per cell per sitting. Also, within each stratum, a factor (for example "prone") must not predict the outcome on its own.
  - **Scoring:** report balanced accuracy, i.e. the mean of the hit rate and the correct-rejection rate, so the score cannot be gamed by always answering one way.
  - **Optional SDT score:** add signal-detection d′ and a response-bias measure. For an unbiased observer with equal base rates, d′ = 2·z(accuracy): 70% → 1.05, 80% → 1.68, 85% → 2.07, 90% → 2.56. These are computed here from the standard d′ = z(H) − z(FA); I could not verify a citation this session.
- **Compare with a rules-only baseline, not 50%.** For every trial set, compute the accuracy of a simple predictor that uses only what the trial states and the start-frozen situation, such as the sight table applied to distance, stance and light. The gate should require the owner to beat it on borderline trials. If the baseline itself scores ≥ 80%, the set tests the rules, not the cues.
- **Keep the two freeze types apart.** Report start-frozen and first-cue-frozen trials separately. Only the first-cue-frozen ones test cue reading, and the plan already notes that below 30% awareness nothing shows.
- **Feedback during scored trials** (the result shown after each) produces within-sitting learning. That is fine if the claim is "learnable within a sitting", but it is a different claim from "readable at first sight".
  - **Check the size:** split each sitting into its first 15 and last 15 trials. At these sizes only large rises, about 25 points or more, are detectable.
  - **Choose the claim:** if first-sight readability is the claim, hold feedback until the end of the sitting and let the warm-ups do the calibration.
  - **Warm-ups:** cover all four cells, so calibration isn't skewed toward one outcome.
- **Memory and "tells".** Use fresh seeds per sitting (already planned), never reuse camp layouts or trial situations, and randomize trial order. Also check that borderline trials aren't identifiable by surface features: if every borderline trial involves shade, the owner learns "shade means borderline".
  - **Cross-sitting stability:** if all trials come from one fixed generator, a classifier trained on sitting 1's metadata should not predict sitting 2's outcomes much above the rules baseline.
- **The owner knows the sight table.** He cannot un-know it, so the pass shows that a rule-aware expert can read the cues, not that a naive player can. Faulkner's spread between testers means one tester's result is a single draw.
  - **Owner-only phase:** treat the owner's pass as necessary but not sufficient.
  - **Later:** before Concept proven, add even 3–5 naive testers for A and C.
- **Independence.** The binomial intervals assume independent trials. Repeated guards, shared camps or learning effects make trials dependent and the true uncertainty wider than shown.
- **A faster loop for development** (not for the gate): a sequential probability ratio test of H₀ p = 0.70 against H₁ p = 0.85, with α = β = 0.10. It stops after about 29 trials on average when the true accuracy is 0.85 and about 24 when it is 0.70. These are Wald approximations computed here; I did not verify a citation this session. This suits RITE-style iteration between gate sittings.
- **Lab E's zero target.** Zero M-marks over N observed reactions bounds the rate of unexplained reactions only loosely. The 95% upper bounds, from 1 − 0.05^(1/N), are:

  | Reactions observed (N) | Upper bound on unexplained rate |
  |---|---|
  | 10 | 25.9% |
  | 20 | 13.9% |
  | 40 | 7.2% |
  | 60 | 4.9% |
  | 100 | 3.0% |

  A single 10–15-minute session therefore shows only that unexplained reactions aren't common. Pair it with the scripted scenarios and the no-omniscience test, which cover the rare cases.
- **Lab D's spot check.** The owner checking 3 of 10 camps catches a bad camp with these odds:

  | Bad camps among the 10 | P(owner sees at least one) |
  |---|---|
  | 1 | 30% |
  | 2 | 53% |
  | 3 | 71% |
  | 5 | 92% |

  The spot check validates the reviewer's method; it does not certify each camp.

### Gaps
- I could not verify citations for practice effects and counterbalancing, the curse of knowledge (Camerer, Loewenstein & Weber 1989), signal detection formulas (Stanislaw & Todorov 1999; Macmillan & Creelman), the SPRT (Wald 1945) or Latin hypercube sampling. The search budget ran out. The computations above don't depend on those citations.
- No source was found on optimal warm-up length for perceptual prediction tasks in games.
- Per-item difficulty calibration for stealth cues, and how to choose "borderline" so that human accuracy lands near a target, are not covered by any source found. Psychophysics staircase methods are the likely model, but none was verified here.

## 3. How are telemetry, heatmaps, event logs and replays used to diagnose why something happened?

### Takeaway
The proven pattern is to pair *what* happened (instrumented events, death and position heatmaps) with context that explains *why*: synced video, survey answers, or replay. Practitioners warn that aggregates hide extremes and invite illusory patterns. Deterministic replay is the strongest diagnostic tool where it exists; Riot rebuilt League's server around it, and Sightline already has it.

### Cited Findings
- **[E] Kim, Gunn, Schuh, Phillips, Pagulayan & Wixon, "Tracking Real-Time User Experience (TRUE)" (CHI 2008, pp. 443–452, Microsoft Game Studios).** TRUE pairs behavioural instrumentation with other HCI methods to improve game design. — [publisher record](https://www.springerprofessional.de/doi/10.1145/1357054.1357126). *Fit:* Sightline's recording plus telemetry is already a TRUE-like log. Add the "attitudinal" half per trial: the owner's answer, confidence and the cue he named, stored as annotations in the recording.
- **[S] Halo 3 instrumentation (secondary summaries of Wired's 2007 feature by Clive Thompson).** Microsoft's tools extracted each player's location and when and where they fired weapons, rode vehicles, killed aliens and died. Maps of where players died were used to find terrain features that made a battle onerous. — [GameAnalytics summary](https://gameanalytics.com/?p=3901); [Nicolas Nova's 2007 summary](https://nicolas-nova.squarespace.com/pasta-and-vinegar/2007/08/23/some-hints-about-microsoft-games-user-research-methods). Wired itself could not be fetched. *Fit:* the Sightline equivalent is to map *detections*, *first cues* and *near-misses* per camp over many bot and owner runs. That locates unfair detection spots, such as long-range detections from behind cover.
- **[P]† Valve GDC 2009: stat collection.** Valve records deaths, level times and friendly fire, and showed a "Heatmap of Death Concentrations (Dustbowl from TF2)".
  - **Pros:** objective, global trends, baselines and comparisons.
  - **Cons:** "Averages hide extreme examples", "Miss nuance (lacking context)", "Requires rigor", "Can see 'illusory' patterns".

  — [Valve deck](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ValvesApproachToPlaytesting.pdf). *Fit:* with a single human tester, heatmaps of the owner's own runs are too sparse. Use them on bot and fuzz runs, and use per-event replay drill-down for the owner's runs.
- **[E] Drachen & Canossa, "Analyzing Spatial User Behavior in Computer Games using Geographic Information Systems" (MindTrek 2009), and "Towards Gameplay Analysis via Gameplay Metrics" (MindTrek 2009).** Death-location analysis on *Tomb Raider: Underworld* used Eidos's metrics suite. The analysis was hypothesis-driven: did players die in the intended places at the intended frequencies, with enemy-caused and environment-caused deaths mapped separately?
  - A related study narrowed about a million sessions to 1,365 players for self-organizing player models.

  — [ITU record](https://pure.itu.dk/en/publications/analyzing-spatial-user-behavior-in-computer-games-using-geographi/); [AAU record](https://vbn.aau.dk/en/publications/towards-gameplay-analysis-via-gameplay-metrics); [UBC lecture reproducing the analysis](https://cmps-people.ok.ubc.ca/bowenhui/game/lectures/6-metrics.pdf) [S]; [fan-blog account of the 1,365-player study](https://blog.tombraiders.net/2009/08/beyond-player-tailoring-tomb-raider-as.html) [S]. *Fit:* state the intended detection geography for each camp first (the perches that should be safe, the approaches that should be watched), then test the telemetry against it, rather than reading heatmaps without a hypothesis.
- **[E] *Game Analytics: Maximizing the Value of Player Data* (Seif El-Nasr, Drachen & Canossa, eds., Springer 2013)** is the standard reference collection for game telemetry. — [Altmetric record](https://link.altmetric.com/details/15822892). *Fit:* a background reference. Its chapters were not read in this session.
- **[P] Riot Games, "Determinism in League of Legends" (engineering blog series, Rick Hoskinson).**
  - **Recorded inputs:** Riot made the game server deterministic so a recorded game can be re-played and the server restored to an earlier state. The main uncontrolled input, player network traffic, is recorded ("Server Network Recording").
  - **One clock:** six separate clock and timing APIs were unified into one, which took nearly six months.
  - **Divergence hunting:** dedicated hardware hunts divergences, and "only the first divergence really matters."
  - **Use in production:** the work underpins Chronobreak (deterministic disaster recovery).

  — [Introduction](https://technology.riotgames.com/node/67); [Implementation](https://technology.riotgames.com/node/68); [Fixing divergences](https://www.riotgames.com/en/news/determinism-league-legends-fixing-divergences). *Fit:* this independently confirms Sightline's rules 2 and 5. The "first divergence" principle matches `npm run sim -- --replay` reporting where a run diverged.
- **[E] Playtracer (Andersen, Liu, Apter, Boucher-Genesse & Popović, FDG 2010).** Multidimensional scaling clusters players and game states into a map of the routes players take. On the puzzle game *Refraction*, it surfaced design hypotheses, confusing elements and anomalies.
  - The follow-up (Liu et al., FDG 2011) notes low discriminative power for medium-complexity games and no support for continuous state. It proposes feature-based projections.

  — [Playtracer project](https://grail.cs.washington.edu/projects/playtracer/); [FDG 2011 follow-up](https://grail.cs.washington.edu/projects/playtracer/fdg2011). *Fit:* project each run onto a few features rather than raw continuous state: perch used, first target, time to first shot, peak guard awareness. Then the owner's and the bots' routes through a camp can be compared.
- **[E] Glyph (Nguyen, Seif El-Nasr & Canossa, FDG 2015).** A visualization that compares behaviour sequences. It gives an overview of the strategies players use and lets the analyst drill into individuals and outliers. — [arXiv](https://arxiv.org/abs/2106.13742). *Fit:* useful for Lab D (§5), where the question is whether camps produce distinct strategy clusters.
- **[E]† Tremblay, Torres, Rikovitch & Verbrugge, "An Exploration Tool for Predicting Stealthy Behaviour" (2013).**
  - **Method:** RRT search through (x, y, time) space, constrained by walls, guard fields of view and player speed, produces many feasible stealth paths. These are shown as aggregate heatmaps, with areas never seen, eventually swept and currently in view coloured differently.
  - **Design questions:** "would a player 20% slower still make it?" and "what if this alcove moves 2 m?"

  — [paper](https://www.sable.mcgill.ca/~clump/papers/tremblay-13-exploration.pdf); [Game Developer summary (Mike Cook)](https://www.gamedeveloper.com/design/the-saturday-paper---metal-gear-science) [S]. *Fit:* run on Sightline's deterministic sim, this kind of tool can produce per-camp "safe/swept/watched" maps for designers and the pre-screen. It also answers sensitivity questions, such as whether a camp stays solvable when a guard's route timing shifts.

### Inferences
- **Add a "cue lead time" telemetry metric.** Measure the time from the first visible cue (head turn, bark, edge indicator) to detection, for every detection in bot and owner runs. Lab A's rule "every detection is telegraphed by a cue first" can then be tracked as a distribution, including its worst cases, not just as a pass/fail rule. Valve's warning about averages applies here.
- **Do item analysis across sittings.** The recordings store each answer as an annotation, so per-trial results can be pooled across the owner's sittings and the agents' pre-screens. Flag items everyone gets wrong (likely unreadable or ambiguous, as with Tremblay's no-consensus levels) apart from items only the owner misses.
- **Hypothesis first, heatmap second** (Drachen & Canossa). For each camp, write down where detection *should* happen before looking at the maps.

### Gaps
- IO Interactive's analytics (Hitman) could not be verified. No primary or secondary source was retrieved before the search budget ran out.
- The full text of the TRUE paper (ACM DL blocked) and its Halo and Shadowrun case details were not read. Its case-study specifics are therefore not reported here.

## 4. What is the state of automated playtesting 2018–2026, and what is each kind of tester good and bad at?

### Takeaway
- **Search and sampling bots** (RRT, MCTS): reliable at proving solvability and mapping risk. Cheap with a deterministic simulation.
- **RL agents:** good at coverage and at exploit-hunting, but they play unlike humans unless trained to imitate them. Industry developers are sceptical of them.
- **Imitation and simulation models** (King, Rovio): predict difficulty well in narrow, data-rich games.
- **LLM agents:** can rank difficulty roughly (r ≈ 0.6–0.87 in two text-based games), but play far below human level.
- **Vision-language models:** still weak at fine visual detail, long videos and real-time play (under 2% completion on 1990s games in 2025). As judges they are biased and can be gamed by superficial cues.

### Cited Findings

**Search, scripted and persona bots**
- **[E] Tremblay et al. 2013 (RRT stealth analysis)** and **Borodovski & Verbrugge 2016**, which extends RRT analysis to dynamic guard states caused by distractions. — [Tremblay 2013](https://www.sable.mcgill.ca/~clump/papers/tremblay-13-exploration.pdf); [Borodovski & Verbrugge 2016](https://www.sable.mcgill.ca/~clump/papers/borodovski-16-analyzing.pdf). *Fit:* this is the stealth-specific way to check that a level can be solved and to sample many feasible plans. It suits Lab D's validation and the inputs to its reviewer.
- **[E] Xu, Tremblay & Verbrugge, "Generative Methods for Guard and Camera Placement in Stealth Games" (AIIDE 2014).** Camera placement starts from a theoretically optimal placement and is deliberately weakened to avoid unrealistic over-coverage. Guard routes are built on automatically generated roadmaps. — [AAAI](https://ojs.aaai.org/index.php/AIIDE/article/view/12711). *Fit:* this is precedent for a camp generator tuning coverage downward so that gaps exist to exploit, a goal Lab D can measure.
- **[E] Holmgård, Green, Liapis & Togelius, "Automated Playtesting with Procedural Personas through MCTS with Evolved Heuristics" (IEEE Transactions on Games 11(4), 2019; preprint 2018).** In MiniDungeons 2, MCTS agents whose selection rule is evolved to match decision-theory "personas" enact different play styles on the same level. — [PDF](https://antoniosliapis.com/papers/automated_playtesting_with_procedural_personas_through_mcts_with_evolved_heuristics.pdf). *Fit:* run persona-like bots (ghost, sniper-first, aggressive) on each camp. Whether the personas' best outcomes differ by camp is one test of "clearly different best plans" (§5).
- **[E] PathOS (Stahlke, Nova & Mirza-Babaei, "Artificial Players in the Design Process", CHI PLAY 2020, pp. 267–280).** An open-source tool that simulates player navigation with a basic model of human behaviour. Designers found it useful. A later summary of an evaluation in which 10 participants each built two levels with it reports that participants found the agents "very different from how a player would behave". — [DBLP](https://dblp.uni-trier.de/rec/conf/chiplay/StahlkeNM20.html); [Stahlke thesis](https://ir.library.ontariotechu.ca/handle/10155/1181?show=full). *Fit:* human-like navigation agents are helpful for level reading but are not stand-ins for the tester.
- **[E]† Khaleque, Cook & Gow, "Evaluating Environments Using Exploratory Agents" (arXiv, Sept 2024, work in progress).** An agent modelling motivations for exploration "can clearly distinguish" engaging from unengaging generated levels (5 of each). — [arXiv](https://arxiv.org/abs/2409.02632). *Fit:* the sample is small, but it points to agent-based fitness measures for generated camps.

**Reinforcement learning and learned models (industry and academic)**
- **[E] EA SEED: Bergdahl, Gordillo, Tollmar & Gisslén, "Augmenting Automated Game Testing with Deep Reinforcement Learning" (IEEE CoG 2020).** Adding an RL layer to a test framework, so agents explore or exploit mechanics guided by a reward, increased test coverage and surfaced exploits and bugs. The experiments used first-person shooter environments and looked at coverage, exploits, map difficulty and common problems. — [arXiv](https://arxiv.org/abs/2103.15819); [EA SEED](https://www.ea.com/seed/news/automated-game-testing-deep-reinforcement-learning). *Fit:* the deterministic headless sim could train an agent to reach places or states the invariant bots don't. This fits exploit-hunting on the motor and perception rules (lab C) rather than readability.
- **[E] EA SEED: Gordillo, Bergdahl, Tollmar & Gisslén, "Improving Playtesting Coverage via Curiosity Driven RL Agents" (IEEE CoG 2021).** Agents rewarded for novelty learned to reach different areas of a complex 3D map. The paper also covers visualizations that turn agent data into design insight. — [arXiv](https://arxiv.org/abs/2103.13798). *Fit:* curiosity-driven coverage maps of a valley expose unreachable perches or holes in the terrain and colliders, alongside `npm run fuzz`.
- **[E] Ubisoft La Forge: Alonso, Peter, Goumard & Romoff, "Deep Reinforcement Learning for Navigation in AAA Video Games" (arXiv Nov 2020; NeurIPS 2020 workshop).** RL navigation using any movement ability achieved ≥ 90% success on all the paper's test scenarios, one of which was a map modelled on a Ubisoft AAA game. Ubisoft later reported tests inside Hyper Scape on maps up to 1 km × 1 km. Generalizing to unseen goals and maps was left as future work. — [arXiv](https://arxiv.org/abs/2011.04764v2); [Ubisoft La Forge](https://ubisoft.com/en-us/studio/laforge/news/6bRtGllmfhuDqTHRS6KVLj/deep-reinforcement-learning-for-navigation-in-aaa-video-games). *Fit:* it shows RL navigation works at kilometre scale. For guards, Sightline's motor and navigation are deterministic and designed, so this is a testing aid at most.
- **[E] King: Gudmundsson et al., "Human-Like Playtesting with Deep Learning" (IEEE CIG 2018).** A CNN trained on human moves in Candy Crush predicted level difficulty more accurately than MCTS, at a fraction of the compute.
  - **Production claim [S]:** a secondhand account says it was used in production, cutting difficulty estimation from about 7 days of human playtesting per 15-level episode to under a minute per level.

  — [paper PDF](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf); [secondhand production account](https://koaning.io/TIL/playtesting) [S]. *Fit:* this needs large logs of human play, which a one-tester project lacks. Imitating the owner's recorded runs would give "owner-like" bots, not player-like ones.
- **[E] Roohi et al. (Aalto/Rovio), "Predicting Game Difficulty and Churn Without Players" (CHI PLAY 2020) and "Predicting Game Difficulty and Engagement Using AI Players" (CHI PLAY 2021).** DRL agents, extended with MCTS, plus a population simulation predicted per-level pass and churn rates in Angry Birds Dream Blast. Features based on the agent's *best-case* performance correlated more strongly with human data than average performance did. — [2021 arXiv](https://arxiv.org/abs/2107.12061v1); [2020 arXiv](https://arxiv.org/abs/2008.12937). *Fit:* if bots grade a camp's difficulty, use the best bot run per camp rather than the mean.
- **[E]† Politowski, Guéhéneuc & Petrillo, "Towards Automated Video Game Testing: Still a Long Way to Go" (arXiv, Feb 2022).** A literature review and developer survey. Research interest is growing, but developers are sceptical of automated agents for testing. New approaches must not disrupt workflows, and research should focus on the testing goal and the test oracle. — [arXiv](https://arxiv.org/abs/2202.12777). *Fit:* Sightline's oracles are explicit (invariants, fingerprints, scene expectations, `explain(id)`), which is the condition the survey says automated testing lacks.

**Exploit hunters**
- **[E/S] OpenAI hide-and-seek: Baker et al., "Emergent Tool Use From Multi-Agent Autocurricula" (arXiv Sept 17, 2019; ICLR 2020).** The paper reports six emergent strategy phases (box forts, ramp use and others).
  - **Press accounts [S]:** "box surfing" let seekers ride a box using a physics loophole: agents apply force to themselves without checking that they stand on the floor. Ramps were used to launch over walls. Hiders later locked boxes to counter surfing.
  - **Quoted remark [S]:** press also quotes OpenAI that agents often find unintended exploits in the environment or physics engine.
  - **Framing:** the arXiv abstract itself presents the behaviours as emergent tool use, not as exploits.

  — [arXiv abstract](https://arxiv.org/abs/1909.07528)†; [TechCrunch](https://techcrunch.com/?p=1882280) [S]; [Neurohive](https://neurohive.io/en/news/ai-agents-learnt-how-to-use-tools-and-exploit-the-environment-in-a-hide-and-seek-game/) [S]. *Fit:* competitive agents (player bot against guard brain) are the way to find perception or motor loopholes, such as edge-of-cone or step-height exploits. Sightline's invariants (rule 10) are the oracle.
- **[E] Chrabaszcz, Loshchilov & Hutter, "Back to Basics: Benchmarking Canonical Evolution Strategies for Playing Atari" (IJCAI 2018).** A simple evolution strategy found a Q*bert bug in which platforms keep blinking and the score climbs to nearly a million. It did not recur reliably: press reports a low score in 22 of 30 runs. — [IJCAI](https://www.ijcai.org/Proceedings/2018/197); [The Register](https://www.theregister.com/2018/03/02/ai_qbert_bug/) [S]. *Fit:* exploit search needs many seeds, and every hit must become a saved recording. Sightline's fuzz-to-recording loop already does this.

**LLM and vision-language agents (2023–2026)**
- **[E]† Xiao & Yang, "LLMs May Not Be Human-Level Players, But They Can Be Testers: Measuring Game Difficulty with LLM Agents" (arXiv, Oct 2024).**
  - **Wordle** (529 puzzles, 20 trials each): GPT-4 with chain-of-thought plus formatting help correlated with human difficulty at r = 0.624. An optimal algorithmic solver correlated at only r = 0.075 (not significant).
  - **Slay the Spire** (20 trials per boss): GPT-4 chain-of-thought reached r = 0.871 (Act 1) and 0.710 (Act 2), against 0.742 and 0.482 for a rule-based expert AI.
  - **Limits the authors state:** below-human play; compensation was needed (a 12-guess cap, a stronger deck); text-only setup, so visually intensive games were not tested; and strategies that exploit rules can bias difficulty estimates.

  — [arXiv](https://arxiv.org/html/2410.02829v1). *Fit:* LLM agents can *rank* relative difficulty from a text description. For Lab D, a recon summary in text is more reliable input than frames, and the rankings need checking against human or bot ground truth.
- **[E] VideoGameBench (Zhang, Griffiths, Narasimhan & Press, arXiv May 2025).** On 10 popular 1990s games played in real time, the best frontier VLMs completed 0.48% of the benchmark, and 1.6% of the "Lite" version that pauses while the model thinks. Latency was a major limit. Sources differ on whether Gemini 2.5 Pro alone or also Claude 3.7 Sonnet was the top model. — [arXiv](https://arxiv.org/abs/2505.18134v2). *Fit:* current VLMs cannot stand in for a player, so agents should judge frames offline, not play the honest view live.
- **[E] GlitchBench (Taesiri, Feng, Nguyen & Bezemer, CVPR 2024).** On 593 community-reported glitches from 205 games, the best of 11 models (GPT-4V) scored 43.4%, with a captioning upper bound of 64.9%. — [CVPR paper](https://openaccess.thecvf.com/content/CVPR2024/papers/Taesiri_GlitchBench_Can_Large_Multimodal_Models_Detect_Video_Game_Glitches_CVPR_2024_paper.pdf); [arXiv](https://arxiv.org/html/2312.05291v2). *Fit:* expect agents to miss subtle visual problems. They suit gross checks ("is the guard's head turn visible at all?") better than judgements of shade gradations.
- **[E] VideoGameQA-Bench (Taesiri et al., NeurIPS 2025 Datasets & Benchmarks).** It tests 16 VLMs on 9 tasks with 4,786 questions, including visual unit tests, regression tests, glitch detection and bug reports. Frontier models wrote useful bug reports for up to 50% of real glitches. They struggled with fine-grained visual detail, subtle regressions and pinpointing glitches in longer videos. — [NeurIPS proceedings](https://proceedings.neurips.cc/paper_files/paper/2025/hash/db2cf8f479a96cb83329f5e193318a29-Abstract-Datasets_and_Benchmarks_Track.html). *Fit:* the "visual unit test" format ("is X visible in frame t?") is the right shape for A's pre-screen. Fine cue gradations are where agents fail.
- **[E] Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (NeurIPS 2023).**
  - **Biases:** LLM judges show position, verbosity and self-enhancement biases.
  - **Fix:** swap the order and call a tie if the verdict flips.
  - **Agreement:** GPT-4 agreed with humans over 80% of the time, about as often as humans agree with each other.

  — [arXiv](https://arxiv.org/abs/2306.05685). *Fit:* Lab D's reviewer should see camps in random order and be re-run with orders swapped. Its plan descriptions should be parsed into fixed signature fields, so a more verbose plan does not read as a "different" one.
- **[E]† Kim, Porwal, Bellam, Le Nevez, Babey & Sharma, "Assessing the Gameability of Vision Language Model Judges for World Model Video Evaluation" (NeurIPS 2026 workshop).**
  - **Under-reaction:** temporal corruption (shuffle, freeze, reverse) lowered human plausibility scores by 0.89–2.66 points on a 1–5 scale, but the three VLM judges dropped much less or even rose.
  - **Over-reaction:** text overlays raised judge scores. A blank box of matched size gave one judge a similar boost to a rubric-worded overlay.
  - **Optimized exploits:** a small search over overlay wording raised scores further and transferred across judges, enough to change model rankings.

  — [NeurIPS 2026 poster page](https://neurips.cc/virtual/2026/175831). *Fit:* this is a direct warning for A's pre-screen. VLMs miss timing, which is exactly what "freeze at first cue" depends on, and they react to overlay-like UI such as the edge indicator.
- **[E]† Wang, "What Makes Generated Content Functionally Legible? A VLM-Judged Ablation with Executable Ground Truth" (NeurIPS 2026).**
  - **The problem:** VLM judges shift with the prompt, vary between runs and are rarely held to ground truth.
  - **The protocol:** the study uses the game's code as an executable answer key. The judge must pass a perception check on the assets before it may score, and no result comes from a single scoring pass.

  — [NeurIPS 2026 poster page](https://neurips.cc/virtual/2026/172984). *Fit:* adopt the same protocol for Sightline's agents. The simulation already knows which cue fired, where and when, so it is the answer key. Gate each agent on a perception check (known frames, known answers) before trusting its pre-screen, and aggregate several runs.
- **[E] GameCraft-Bench (arXiv June 2026; from search excerpts, not read).** A multimodal judge re-run 10 times on fixed evidence was broadly aligned with human scores but slightly more permissive, with residual noise mainly from borderline visual interpretations. — [arXiv PDF](https://arxiv.org/pdf/2606.17861). *Fit:* expect agent disagreement to concentrate on exactly the borderline trials that matter for A and C.

### Inferences

**Each tester's strengths, weaknesses and best use in Sightline**

| Tester | Good at | Bad at | Best Sightline use |
|---|---|---|---|
| Scripted and invariant bots (existing) | Known properties, regressions, determinism, unwinnable seeds | Unknown unknowns; behaviour unlike humans | Rules 10–11, D's validation, E's scripted scenarios |
| Search and sampling (RRT, MCTS on the deterministic sim) | Proving a plan exists; sampling many plans; risk maps; sensitivity | Optimizes with knowledge players don't have unless restricted to recon information | D's best-plan search; A's trial generation (borderline = "one factor flips the outcome") |
| RL and competitive agents | Coverage; exploits in motor and perception; emergent loopholes | Training cost; non-human play; brittle to changes | Exploit-hunting against the motor and perception invariants |
| Imitation or simulation models | Difficulty prediction in data-rich games | Need large human logs | Not viable with one tester |
| LLM agents (text) | Relative difficulty ranking; plan writing from structured recon; bug-report prose | Hallucinated or unverified "best" plans; position and verbosity bias; below-human play | D's reviewer, with verification by search/sim and swapped order |
| VLM agents (frames) | Gross visibility checks; bug descriptions | Fine detail, timing, long clips, real-time play; gameable by overlays; run-to-run instability | A's pre-screen for *missing* cues only, gated by a perception check and the sim's answer key |

- **Pre-screen selection bias.** If agents drop trials they find unreadable, the scored set drifts toward what agents can read, which is not what the owner can read. Drop a trial only when the simulation's ground truth shows the cue is objectively absent, occluded or too small to see (a pixel-size threshold). Log every drop and keep the drop rate low.
- **Calibrating agents as predictors.** Agents' detection predictions could be scored like the owner's, on the same trial sets. That calibrates the agents, not the cues. An agent at 50% on borderline trials may be blind, not the cue.

### Gaps
- modl.ai's automated QA product, its claims and any published evidence could not be checked (search budget).
- DeepMind's SIMA and SIMA 2 (generalist 3D game agents, 2024–25), Claude/Gemini "plays Pokémon" (2025) and NetEase's Wuji (ASE 2019) were not verified, so they are not reported.
- No published study was found of LLM or VLM agents judging *stealth readability* or predicting NPC detection from frames.
- Per-task VLM scores on VideoGameQA-Bench's visual unit tests (the format closest to A's pre-screen) were not retrieved.

## 5. How can one measure whether generated levels have clearly different best solutions?

### Takeaway
PCG research measures variety mostly in *content* space (expressive range analysis, ERA), not in *solution* space. The tools that do work in solution space are:
- exhaustive or solver search over play, which finds all solutions and constrains unwanted ones (Smith, Butler & Popović 2013);
- persona or agent play traces (Holmgård; Tremblay's RRT);
- clustering and visualization of traces (Playtracer, Glyph).

For Lab D, the credible measure combines a simulation-verified best plan per camp, a fixed plan signature, and a cross-camp transfer test. The LLM reviewer then becomes one rater checked against those, not the oracle.

### Cited Findings
- **[E] Smith & Whitehead, "Analyzing the Expressive Range of a Level Generator" (PCG Workshop, FDG 2010).** Introduces expressive range analysis (ERA): visualizing a generator's output space over chosen metrics. — [PDF](https://www.pcgworkshop.com/archive/smith2010analyzing.pdf). *Fit:* run ERA on *plan-signature features* across the 100 validation seeds (opening perch type × first-target class × split method), not on geometry alone.
- **[E] Withington & Tokarchuk, "The Right Variety: Improving Expressive Range Analysis with Metric Selection Methods" (2023).** Most ERA work reuses the metric pairs of Smith & Whitehead's original paper or plots every pair. The authors propose three selection criteria: fitness independence, mutual independence and minimal alternative metric independence. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2304.02366). *Fit:* choose plan-space metrics that don't merely restate validation fitness, such as guard count. Otherwise "variety" is just variety of difficulty.
- **[E] Withington, Cook & Tokarchuk, "On the Evaluation of Procedural Level Generation Systems" (FDG 2024).** They survey 86 works and propose a taxonomy of evaluation methods, noting there was no modern one. — [arXiv](https://arxiv.org/abs/2404.18657). A related 2023 workshop paper argues ERA is ill-suited to intermediate steps of generation pipelines ([CEUR](https://ceur-ws.org/Vol-3626/paper1.pdf)). *Fit:* this is the current map of PCG evaluation methods. Lab D's agent-review protocol is an unusual, human-proxy method within it.
- **[E] Smith, Butler & Popović, "Quantifying over Play: Constraining Undesirable Solutions in Puzzle Design" (FDG 2013).** They define a "shortcut solution" as any gameplay the designer finds undesirable. Answer-set programming searches the whole space of play exhaustively, so the *Refraction* generator rejects puzzles that admit unwanted solutions. Failed attempts speed up later searches. — [PDF](https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf). *Fit:* this is the formal version of "the best plan in camp i should not be the generic plan". Encode undesirable generic plans, such as "shoot from the spawn ridge" or "a perch that sees every guard", as constraints the generator or validator rejects.
- **[E] Holmgård et al. (IEEE Transactions on Games, 2019): procedural personas** enact different play styles per level. — [PDF](https://antoniosliapis.com/papers/automated_playtesting_with_procedural_personas_through_mcts_with_evolved_heuristics.pdf). *Fit:* if the persona that wins varies by camp, the camps reward different approaches. That is a behavioural sign of different best plans.
- **[E] Playtracer (FDG 2010/2011) and Glyph (FDG 2015).** These cluster or compare play traces into strategies, with drill-down to individuals. — [Playtracer](https://grail.cs.washington.edu/projects/playtracer/); [Glyph](https://arxiv.org/abs/2106.13742). *Fit:* cluster the bots' best runs across the 10 camps. Distinct clusters per camp support "clearly different", and one shared cluster refutes it.
- **[E]† Tremblay et al. 2013 (RRT path sampling) and Tremblay, Torres & Verbrugge 2014 (risk metrics; distance correlated best with human judgement).** — [2013](https://www.sable.mcgill.ca/~clump/papers/tremblay-13-exploration.pdf); [2014](https://www.cs.mcgill.ca/~jtremb59/Papers/fdg2014_paper_33.pdf). *Fit:* sample many feasible approach paths per camp and score them with a risk metric. The lowest-risk approach is a candidate "best approach" independent of the LLM reviewer.
- **[E] Zheng et al. 2023 (LLM-judge biases)** and **[E]† Wang 2026 (VLM judges unstable without executable ground truth).** — [Zheng](https://arxiv.org/abs/2306.05685); [Wang](https://neurips.cc/virtual/2026/172984). *Fit:* an LLM's "best plan" is unverified, and "no two signatures match" can be satisfied by wording alone. Signatures need fixed fields from a closed vocabulary, and every plan needs checking in the simulation.

### Inferences
**A proposed Lab D measure.** It extends the plan; it is not taken from any one source.
1. **Signature schema:** fixed, closed-vocabulary fields:
   - opening perch or approach, as a perch ID or an approach sector;
   - first target, as a role class;
   - first-cluster split method, from a fixed set (noise lure, timing gap, shoot-from-two-perches, wait for patrol);
   - enabling tool or timing.

   Two signatures "match" if they agree on at least *k* of 4 fields (k = 3 suggested), not only if they are identical.
2. **Verify each reviewer plan in the simulation.** Execute or approximate each agent plan with the deterministic sim, for example a scripted run following the signature. Confirm it succeeds and record its risk or score. An unexecutable plan doesn't count.
3. **Cross-camp transfer (regret) matrix.** Apply camp i's best signature to camp j, as nearly as the layout allows, and measure how much worse it does than camp j's own best. "Clearly different best plans" means large off-diagonal regret: no plan is near-best in more than one camp. This catches the failure where signatures differ in wording but one generic plan would do everywhere.
4. **Inter-rater agreement among agents.** Run 3 or more fresh reviewer agents per camp with randomized camp order. Report how often their signatures agree, using a chance-corrected statistic. High disagreement means the camp has several near-equal best plans or the recon view is ambiguous. Both are worth knowing, but neither proves a "clearly different best".
5. **ERA in plan space** over the 100 held-out seeds: a histogram of signature classes. A healthy generator spreads across classes; a degenerate one piles into one.
6. **Owner spot check (3 of 10).** Per §2, it only catches frequent errors (30% chance if one camp is bad, 71% if three are), so treat it as validating the method.

### Gaps
- No source was found that defines "clearly different best solution" quantitatively for generated *levels*. Smith et al. 2013 constrains unwanted solutions in puzzles, and the transfer matrix above is my proposal.
- Summerville's "Expanding Expressive Range" (AIIDE 2018) and the quality-diversity work (MAP-Elites with agent-behaviour descriptors, e.g. Fontaine et al. 2021) are likely relevant but were not verified before the search budget ran out. Neither was Bauckhage, Drachen & Sifa's "Clustering Game Behavior Data" (IEEE TCIAIG 2015).
