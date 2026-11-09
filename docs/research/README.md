# Research: the seeds each lane starts from

Gathered on Nov 7, 2026, while planning Phase 1. Fourteen researchers covered two sets of areas, and two reports synthesize them.

**The rule:** research is a seed, not a ceiling.
1. A lab starts from the strongest technique found here.
2. It says where that technique falls short for Sightline.
3. It builds past it.
4. It proves the gain on its lane's bench (`docs/foundation-shape.md`).

| Report | What it covers |
| --- | --- |
| [labs.md](labs.md) | The five labs: perception, hearing, guard and camp AI, ballistics, movement and the body, procedural camps, and keeping one perch from clearing a camp. For each lab: where to start, where the best known approach falls short, how to go past it, and how to show it. |
| [foundations.md](foundations.md) | The wider foundation: stealth and systemic design, playtesting and the statistics of the exit tests, missions and debriefs, adaptation and pacing, browser rendering, determinism and replays, and architecture for many games. Ends with recommendations ranked by when they land. |

## Supporting material

- **`notes/labs/` and `notes/foundations/`:** each researcher's notes behind the reports, with every source linked and tagged by confidence. Go there when a lab needs the detail behind a claim.
- **`scripts/`:** the calculations behind figures marked *computed*.
  - The ballistics solver (`ballistics.py`) and its checks:
    - `closedform.py`: the closed-form trajectory;
    - `zeros.py`: zero steps;
    - `incline.py`: slopes;
    - `extra.py` and `validate.py`: further checks.
  - `flood.mjs`: the hearing flood benchmark, for Node.
  - `stats.py`: the exit-test statistics.

  They are reference calculations, not part of the build.
- **`notes/labs/camp_information.md`** and **`notes/foundations/world_variety.md`** (added Nov 8): how a camp gains information fairly, and what makes generated worlds feel different across seeds.
- **`notes/labs/camp_defense.md`** (added Nov 8): how a defended position answers an attacker, from field manuals, after-action studies and shipped games. Behind `docs/camp-engine.md`.

## How far to trust it

- **The search budget ran out.** All fourteen researchers shared one budget of web searches, which ran out partway through. Later sources were fetched directly from known addresses, and the gaps are listed in each set of notes.
- **Some sources are weaker than others.**
  - Many shipped numbers come from datamines, mod repositories, guides and fan wikis, and are flagged where a conclusion rests on them.
  - Metal Gear Solid V's values come from a mod repository. They're believed to match the shipped game, but that wasn't checked.
- **"Not found" means the research found no example,** not that none exists.
- **Suggested starting numbers are hypotheses** for the labs to tune, not findings.
