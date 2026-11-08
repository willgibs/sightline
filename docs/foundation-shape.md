# The foundation's shape: a kernel, lanes and benches

Approved by the owner on Nov 7, 2026, before Wave 0 started. It draws on the two research reports in `docs/research/`: the labs' prior art (`labs.md`) and the wider foundation (`foundations.md`).

## Why

**What the owner asked for:**
- the foundation should carry many games and features;
- each lane should keep improving on its own;
- each lane should aim past the best known solution rather than match it.

**What went wrong elsewhere, and what worked.** Frostbite shows how this fails. One engine was mandated across genres, and the missing pieces were pushed onto each team. Shared technology worked where a narrow kernel was extracted from shipped games, with contracts enforced by test: Sony's ICE libraries, Ubisoft's Snowdrop, Paradox's layered engines.

**Where Sightline stands.** Its core already has the shape of the best shipped deterministic designs: all state in one tree, stateless systems, as in Photon Quantum. What it lacks is declared boundaries, and benches that measure each lane.

## Three layers inside `src/sim`

| Layer | What's in it | It may import |
| --- | --- | --- |
| Kernel | See the list below | Only itself |
| Lanes | One directory per lane, each with one `index.ts` that exports its contract: | The kernel, and other lanes' exported contracts |
| | - body: the motor and its modes (lab C) | |
| | - perception: sight, hearing, percepts, the awareness ladder (lab A) | |
| | - brain: orders, utility, beliefs, the commander, pacing (lab E) | |
| | - ballistics (lab B) | |
| | - generation: terrain, sites, modules, analysis, validation (lab D) | |
| Game | Sightline itself: | The kernel and lanes |
| | - its entity kinds | |
| | - which lanes run in which phases | |
| | - its content as data: the rifle, the compound, the roles | |
| | - its scenes and its rules | |

**The kernel holds:**
- deterministic math and random streams;
- the state tree's mechanics: ids, hash, save, restore;
- the tick: phases, systems, the schedule;
- the event and command registries;
- recordings, re-simulation and seeking;
- the world: terrain queries, colliders and solids, the spatial grid, grid search;
- the environment, and the law of sound;
- the scene harness, the debug channel and the invariant watch.

**Rules for the layers:**
- **The kernel never imports a lane or the game.** A scene with every lane switched off still steps, hashes, saves, restores and replays.
- **The kernel spawns nothing.** Today the simulation spawns the player and the camp's guards itself. That moves into the game's setup.
- **The renderer, the app and the audio stay where they are.** They split the same way when a second game needs them.
- **Generalize at the third use.** With one game, the layers are directories and import rules, not packages. npm workspaces wait for a second game. "Camp" becomes "base" at the third archetype. Modes become patches over the base tuning at the second mode.

## Contracts, enforced by tests

1. **Declared data access.** Every system declares what it `reads`, `writes` and `emits`, and each state subtree has one writer. A test fails when two systems in one phase touch the same path with no declared order. This is Bevy's ambiguity check, made deterministic and permanent. Today the order within a phase is an unwritten contract between five labs: the order of an array.
2. **The lane map is data.** One table says which lanes may import which, and the architecture test reads it.
3. **Lane edges are exported types:** percepts (kind, strength, place, age, expiry, cause), orders, bullets and camp specs. A lane's insides can be rewritten without touching another lane.
4. **No hidden state.** Two simulations stepped in alternation must keep their own hashes. This catches state kept in modules before the debrief replay, or several bases, need two worlds at once. Overwatch's kill cam taught this lesson after release.
5. **Honesty reaches every mind.** The no-omniscience test covers the commander, the pacing layer and doctrine, as well as each guard.

## A bench for every lane

A lane's bench is where "better" is measured instead of claimed. A lab improves its lane against it, and so can any session after it.
- **Pinned scenes per lane.** Their fingerprints sit beside the global goldens, so a change shows which lane moved.
- **Quality metrics,** printed beside every moved golden:

  | Lab | Metric |
  | --- | --- |
  | A | Detection times against the design's ranges |
  | B | Reticle against impact, within 1 cm |
  | C | Invariant violations under adversarial bots |
  | D | Camps valid at their first attempt, with each seed's margin under its iteration budget |
  | E | Search cycle length, and the calibration of the camp's estimate of where a shot came from |

- **Work counts as budgets.** Rays cast, grid nodes expanded and bodies resolved, per system. They're deterministic and pinned like goldens, which turns rule 18's budgets into numbers. Wall time stays a trend.
- **Seed and target.** Before building, each lab records three things: its seed (the strongest prior art, from `docs/research/`), where that seed falls short, and its target. Its exit note gives the bench numbers against them.
- **No version number per lane.** In a bit-exact simulation, every observable bit is something someone depends on (Hyrum's Law), so `SIM_VERSION` stays one number.

## Landing, made mechanical

The Phase 1 plan's rules for landing are right, but enforced by hand, and five branches are about to move shared goldens.
- **Goldens explain themselves.** When a fingerprint moves, CI prints the first divergent tick, the state path that moved, and the lane's metrics.
- **Only up-to-date branches merge.** That's a merge queue if the repository's plan allows one, otherwise a branch rule. Rebaselines are generated with `npm run golden` inside the pull request, and reviewed with it.
- **Recordings carry behaviour fingerprints.** A recording from a lab's preview deploy has the same `SIM_VERSION` as `main` but behaves differently. Today it would be accepted, then diverge. With the fingerprint, it's refused with a reason.

## Determinism, hardened at the edges

The core already matches or beats industry practice. What's left:
- **A synctest mode in the fuzz run.** Save, step, then restore through the on-disk codec as well as `structuredClone`, and compare the hashes part by part. This combines Factorio's heavy mode with SyncTest from the rollback library GGPO.
- **A bisect tool.** From the last matching save-state, it finds the first bad tick, then the phase, then prints a state-path diff such as `guards[3].mind.alert: 0.41 → 0.42`.
- **A known-answer check at startup** for `Math.sqrt` and `detmath`. ECMAScript doesn't promise `sqrt` bit for bit, and engines change their math libraries.
- **A rule in the architecture test** that every sort comparator gives a total order, with an id to break ties.

## What changes in Wave 0

Wave 0 grows from four code steps to seven. The kernel boundary goes first, so everything after it lands in its final place.

| Step | What it lands |
| --- | --- |
| W0.2 · The kernel boundary and lanes | Behaviour-preserving: every golden holds. The directories, the lane map, declared data access and its conflict test, the game's own setup, the kernel-alone test and the interleaved-simulations test. |
| W0.3 · Brains in 'decide' | Brains steer through orders. |
| W0.4 · Queries and spawning inside a tick | A scene pins the tick on which a spawned body first exists, for the motor and for perception. |
| W0.5 · Grid search | One search over the spatial grid, for hearing, analysis and navigation. |
| W0.6 · Registries and roles | Code ranges for events and commands, and all seven guard roles. |
| W0.7 · Landing made mechanical | Self-explaining goldens, per-lane benches with work counts, behaviour fingerprints in recordings, and the merge rule. |
| W0.8 · Determinism at the edges | Synctest, bisect, the known-answer check and the comparator rule. |

Each lab's section of `docs/phase-1-plan.md` gains its seed, the seed's shortfall, how the lab goes beyond it, and how its bench shows that, taken from the labs' report.
