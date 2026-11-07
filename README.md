# Sightline

A first-person stealth-sniper game. Each mission is a freshly generated enemy camp that you scout, plan against and take apart your own way.

This repository is at **Phase 0 · Foundations**: the engine, a walkable wireframe valley, and the tooling every later system is built on. The design lives in the [Sightline · Game Design & Build Plan](https://claude.ai/artifact/Q7JxvgeF1zrrTEWNrFQy7j). [docs/phase-0-report.md](docs/phase-0-report.md) records what was built and how it measured up.

![The first view: a valley overlook with the camp below](docs/images/overlook.png)

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173 and click to begin. Requires Node 20.19+ or 22.12+.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| C | Crouch (toggle) |
| Z | Prone (toggle) |
| Right mouse or F (hold) | Zoom |
| F3 or \` | Switch between the honest view and the debug view |
| Esc | Pause |

In the debug view only:

| Key | Action |
| --- | --- |
| B | Show every collider: purple blocks everything, blue blocks movement, green blocks sight |
| O | Show overwatch perches and their sightlines to the camp |
| N | Fly camera (Space or E up, Q down, Shift fast) |
| [ and ] | Slow down or speed up time (0.25× to 8×) |
| R | Restart the run |

URL options: `?seed=TAL-4471` picks a valley, `?view=debug` starts in the debug view, `?spawn=edge` starts where the road leaves the map, `?bench` runs a 20-second performance flythrough, and `?dpr=2` renders at a higher resolution.

## The two views

The **honest view** shows only what the finished game will show: the world and a compass. The **debug view** shows everything the simulation knows: guard sight cones and routes, footstep sound rings sized to how far they carry, the rangefinder, performance and player state. Playtests use the honest view; tuning uses the debug view.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload. Saving `src/config/tuning.ts` applies new numbers to the running game. |
| `npm test` | All tests (determinism, controller, collision, generation, recordings, architecture rules). |
| `npm run typecheck` | TypeScript, strict. |
| `npm run check` | Both of the above. |
| `npm run sim -- --minutes 10` | Headless run: a bot plays a valley at about 2,000× real time, records it, re-simulates the recording and checks it matches bit for bit. |
| `npm run sim -- --replay file.slrec` | Re-simulates a recording saved from the browser (pause menu → Save recording). |
| `npm run seeds -- --count 100` | Generates many valleys and reports validation, timing, overwatch and access. |
| `npm run build` | Production build into `dist/`. |

## How it fits together

```
src/config/tuning.ts   every gameplay number, hot-reloadable
src/sim/               the simulation: pure TypeScript, no rendering, no DOM, deterministic
  core/                fixed-step clock, seeded RNG, deterministic math, hashing, seeds
  gen/                 the valley, cover, the test camp, analysis and validation
  world/               heightfield, colliders, surfaces
  entities/            the player controller and the guard dummies
  record/              recordings and re-simulation
  bots/                scripted players for headless runs
src/render/            three.js wireframe renderer; reads snapshots, never writes
src/app/               the browser loop, input, HUD, overlay, benchmark, automation hooks
src/headless/          command-line tools
tests/                 Vitest
```

The simulation runs at a fixed 30 Hz and the renderer interpolates between ticks. Given the same seed, tuning and inputs, it produces bit-identical results in Node and in the browser. That one property makes recordings replayable, bugs reproducible, seeds shareable and headless tests trustworthy. `tests/architecture.test.ts` guards it.

`CLAUDE.md` has the working rules for anyone, human or agent, extending the code.
