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
      "worst overlap (m)": 0,
      "worst rise in a tick (m)": 0.02614027438236377,
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
    "metrics": {},
    "runs": {}
  },
  "brain": {
    "metrics": {},
    "runs": {}
  },
  "ballistics": {
    "metrics": {},
    "runs": {}
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
