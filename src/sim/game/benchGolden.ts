import type { PinnedBench } from './benches';

/**
 * Each lane's pinned work and metrics (benches.ts), written by `npm run bench -- --write`.
 * Review this file's diff as you would a moved golden: it is what a change did to every
 * lane's budgets and quality. tests/bench.test.ts holds the live numbers to it.
 */
export const BENCH_GOLDEN: PinnedBench = {
  "kernel": {
    "metrics": {},
    "runs": {
      "spawn-tick": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 130 },
          "watch-perception": { "rays": 2, "nodes": 0, "bodies": 0 }
        }
      },
      "kernel-alone": {
        "work": {}
      }
    }
  },
  "generation": {
    "metrics": {
      "valid at the first attempt (of 6)": 6,
      "least margin under the attempt budget": 5
    },
    "runs": {}
  },
  "body": {
    "metrics": {
      "body-ticks checked": 57600,
      "runs with a broken promise (of 4)": 0,
      "bodies under the terrain": 0,
      "bodies inside something solid": 0,
      "worst overlap (m)": 2.2093438190040615e-14,
      "worst rise in a tick (m)": 0.28554800812780456,
      "worst gain on steep ground (m)": 0
    },
    "runs": {
      "movement-course": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 1418 }
        }
      }
    }
  },
  "perception": {
    "metrics": {
      "grid pairs checked": 2739816,
      "grid pairs filling slower with more exposure": 0,
      "standing, walking, in the open: seen to (m)": 155.75,
      "still, prone, in cover: seen to (m)": 46.75,
      "crouched, walking, in shade, 30 m: seconds": 5.33333333,
      "a marksman's far zone: seen to (m)": 405.75,
      "least seconds from the first cue to 100%, outside contact": 1.5,
      "steepest edge: rate change per metre": 0.122196796,
      "steepest edge: rate change per degree": 0.113636364,
      "seed · grid pairs checked": 2739816,
      "seed · grid pairs filling slower with more exposure": 0,
      "seed · standing, walking, in the open: seen to (m)": 150,
      "seed · still, prone, in cover: seen to (m)": 150,
      "seed · crouched, walking, in shade, 30 m: seconds": 8.88888889,
      "seed · a marksman's far zone: seen to (m)": 400,
      "seed · least seconds from the first cue to 100%, outside contact": 0.468416667,
      "seed · steepest edge: rate change per metre": 0.301129235,
      "seed · steepest edge: rate change per degree": 0.954545455,
      "sight scenarios as expected (of 15)": 15,
      "foliage: pairs that differ by direction (of 2000)": 0,
      "hearing: speakers and a guard at the same place differ (of 200)": 0,
      "crack at 300 m: least degrees off the shooter": 55.438591,
      "crack at 300 m: most degrees off the shooter": 57.2126615,
      "seed · crack at 300 m: degrees off the shooter": 0
    },
    "runs": {
      "perception-lab": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 10800 },
          "perception-sight": { "rays": 25723, "nodes": 0, "bodies": 0 }
        }
      }
    }
  },
  "brain": {
    "metrics": {},
    "runs": {}
  },
  "ballistics": {
    "metrics": {},
    "runs": {
      "shooting-range": {
        "work": {
          "rifle": { "rays": 1, "nodes": 0, "bodies": 0 },
          "motor": { "rays": 0, "nodes": 0, "bodies": 4660 },
          "bullets": { "rays": 100, "nodes": 0, "bodies": 0 }
        }
      }
    }
  },
  "game": {
    "metrics": {},
    "runs": {
      "TAL-4471 wander": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 14400 }
        }
      },
      "MUD-9031 wander": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 14400 }
        }
      },
      "TAL-4471 chaos": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 14400 }
        }
      }
    }
  }
};
