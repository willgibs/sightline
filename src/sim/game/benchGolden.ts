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
      "lab D valleys valid at the first attempt (of 6)": 6,
      "lab D least margin under the valley budget": 7,
      "lab D widest overwatched horizon (°)": 157,
      "lab D narrowest open horizon (°)": 152,
      "lab D camps valid at the first attempt, no repair (of 6)": 6,
      "lab D camps repaired": 0,
      "lab D rules still broken": 0,
      "lab D most re-analyses in a repair (of 12)": 0,
      "lab D camps with a way in and out (of 6)": 1,
      "lab D clusters left unsolved": 0,
      "lab D busiest search (of 400000 expansions)": 400000,
      "lab D hardest way in, states expanded: safe intervals": 400000,
      "lab D hardest way in, states expanded: plain space-time search": 400000
    },
    "runs": {
      "camp-systems": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 2519 }
        }
      }
    }
  },
  "body": {
    "metrics": {
      "body-ticks checked": 82800,
      "runs with a broken promise (of 4)": 0,
      "bodies under the terrain": 0,
      "bodies inside something solid": 0,
      "worst overlap (m)": 0.00009984134594931415,
      "worst rise in a tick (m)": 0.029554423939202934,
      "worst gain on steep ground (m)": 0,
      "most a move crossed uphill on steep triangles with no promise broken (m)": 0,
      "lean: eye-to-head lines that differ by direction (of 2000)": 0,
      "lean: pairs in view (of 2000)": 1496,
      "seed · lean: pairs where the camera sees a guard who has no line to the head (of 2000)": 18,
      "mantle: ticks inside someone walking across the landing": 0,
      "seed · mantle checked once: ticks inside him": 15,
      "prone: fuzzing bot on the course and in two valleys, lying poses checked": 16573,
      "prone: fuzzing bot on the course and in two valleys, poses with a part inside something solid": 548,
      "seed · single circle: fuzzing bot on the course and in two valleys, lying poses checked": 16573,
      "seed · single circle: fuzzing bot on the course and in two valleys, poses with a part inside something solid": 3734,
      "prone: turning between walls a metre apart, poses with a part inside something solid": 0,
      "seed · single circle: turning between walls a metre apart, poses with a part inside something solid": 259,
      "prone: deepest any part goes into something solid (m)": 0.15625,
      "seed · single circle: deepest any part goes into something solid (m)": 0.490337132
    },
    "runs": {
      "movement-course": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 1445 }
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
      "shade: drawn as simulated, of 20000 points": 19982,
      "shade: drawn as simulated within 1.5 m of a shadow, of 6000 points": 5810,
      "crack at 300 m: least degrees off the shooter": 55.438591,
      "crack at 300 m: most degrees off the shooter": 57.2126615,
      "seed · crack at 300 m: degrees off the shooter": 0,
      "trials: candidates run for two sittings": 1816,
      "trials: scored trials in two sittings": 60,
      "trials: pairs of factor levels the first sitting covers": 192,
      "seed · trials: pairs of factor levels covered, taken first come": 165,
      "trials: borderline right by the sight table alone (of 30)": 14,
      "trials: the rules-only predictor's balanced accuracy, first sitting (%)": 55.3571429,
      "trials: frozen at the first cue (of 60)": 30,
      "trials: cue-frozen trials where his head can be read": 23,
      "trials: borderline trials distance flips": 3,
      "trials: borderline trials stance flips": 15,
      "trials: borderline trials movement flips": 15,
      "trials: borderline trials light flips": 2,
      "trials: borderline trials cover flips": 8,
      "trials: borderline trials sky flips": 4,
      "trials: borderline trials gaze flips": 9,
      "trials: seen among those frozen at the first cue (%)": 53.3333333,
      "trials: seen among those frozen at the start (%)": 53.3333333,
      "trials: a reader who says yes only at a first-cue freeze: balanced over both (%)": 50,
      "trials: a reader who says yes only at a first-cue freeze: passes (0 or 1)": 0,
      "trials: a reader by the first cue's time, and the table otherwise: balanced over both (%)": 74.7767857,
      "trials: a reader by the first cue's time, and the table otherwise: passes (0 or 1)": 0,
      "seed · trials: seen among those frozen at the first cue (%)": 83.3333333,
      "seed · trials: seen among those frozen at the start (%)": 23.3333333,
      "seed · trials: a reader who says yes only at a first-cue freeze: balanced over both (%)": 80.1339286,
      "seed · trials: a reader who says yes only at a first-cue freeze: passes (0 or 1)": 1,
      "seed · trials: a reader by the first cue's time, and the table otherwise: balanced over both (%)": 75.8928571,
      "seed · trials: a reader by the first cue's time, and the table otherwise: passes (0 or 1)": 0,
      "trials: a reader right on every clear trial, guessing the borderline: passes (% of 4000)": 1.975,
      "seed · trials: a reader right on every clear trial, guessing the borderline: passes (% of 4000)": 17.4,
      "trials: a reader right 80% of the time: passes (% of 4000)": 50.9,
      "seed · trials: a reader right 80% of the time: passes (% of 4000)": 58.625,
      "trials: a reader right 90% of the time: passes (% of 4000)": 99.025,
      "seed · trials: a reader right 90% of the time: passes (% of 4000)": 99.475
    },
    "runs": {
      "perception-lab": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 10800 },
          "perception-sight": { "rays": 26396, "nodes": 0, "bodies": 0 },
          "perception-awareness": { "rays": 0, "nodes": 60480, "bodies": 0 }
        }
      },
      "perception-crowd": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 45900 },
          "perception-sight": { "rays": 91778, "nodes": 0, "bodies": 0 },
          "perception-awareness": { "rays": 0, "nodes": 371126, "bodies": 0 }
        }
      }
    }
  },
  "brain": {
    "metrics": {
      "search map: numbers": 4096,
      "search cycle: shortest (s)": 30.2666667,
      "search cycle: longest (s)": 30.2666667,
      "ellipse: contains the shooter at 1 sigma (%)": 38.75,
      "ellipse: contains the shooter at 2 sigma (%)": 88.5,
      "relocation: 26–30 m across the line of fire, outside 2 sigma (%)": 50.5,
      "relocation: 26–30 m in any direction, outside 2 sigma (%)": 29.5,
      "ellipse in the world: contains the perch at 1 sigma (%)": 41.2371134,
      "ellipse in the world: contains the perch at 2 sigma (%)": 86.5979381,
      "ellipse in the world: mean bearings fused per shot": 5.30927835,
      "re-found within 60 s (of 16): honest": 15,
      "re-found within 60 s (of 16): random": 2,
      "re-found within 60 s (of 16): plain": 13,
      "re-found within 60 s (of 16): staleness": 13,
      "re-found within 60 s (of 16): omniscient": 16,
      "re-found within 60 s (of 16): honest, unpaced": 16,
      "reactions (in the scripted scenarios)": 62,
      "reactions unexplained": 0,
      "overlook: guards down from one perch, of 32": 17,
      "overlook: camps cleared (of 3)": 0,
      "overlook: the target got away (of 3)": 2,
      "timed shot on an escort's camp: target down (of 3)": 3,
      "a fight’s worst tick: grid cells the brains expand": 6503,
      "a fight’s worst tick: rays the brains cast": 454,
      "a fight’s worst tick: grid cells sounds flood": 19332,
      "routes between a camp’s posts: found (of 56)": 56,
      "routes between a camp’s posts: grid cells a search looks at, on average": 459,
      "routes between a camp’s posts: the most one search looks at": 2716,
      "routes to a camp’s upper floors and back: found (of 32)": 32,
      "routes to a camp’s upper floors and back: grid cells a search looks at, on average": 287,
      "routes to a camp’s upper floors and back: the most one search looks at": 683
    },
    "runs": {
      "camp-fight": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 12105 },
          "bullets": { "rays": 53, "nodes": 0, "bodies": 0 },
          "perception-hearing": { "rays": 51, "nodes": 29269, "bodies": 0 },
          "perception-spotting": { "rays": 8477, "nodes": 0, "bodies": 0 },
          "perception-awareness": { "rays": 0, "nodes": 64535, "bodies": 0 },
          "guard-brains": { "rays": 277, "nodes": 8945, "bodies": 0 }
        }
      }
    }
  },
  "ballistics": {
    "metrics": {
      "reticle against impact, worst of 160 shots (cm)": 0.1355,
      "300 m walker: head radius (mil)": 0.3825,
      "300 m walker: drop skipped (mil off)": 1.7859,
      "300 m walker: lead skipped (mil off)": 1.8418,
      "300 m walker: wind skipped (mil off)": 0.5967,
      "300 m walker: ranged by eye, 15% out (mil off)": 0.4599,
      "sway, standing (mil, 95th percentile)": 1.6426,
      "sway, crouched (mil, 95th percentile)": 0.9856,
      "sway, prone (mil, 95th percentile)": 0.6899,
      "sway, prone, rested (mil, 95th percentile)": 0.2553,
      "sway, prone, rested, breath held (mil, 95th percentile)": 0.0464
    },
    "runs": {
      "shooting-range": {
        "work": {
          "rifle": { "rays": 1, "nodes": 0, "bodies": 0 },
          "motor": { "rays": 0, "nodes": 0, "bodies": 4780 },
          "bullets": { "rays": 100, "nodes": 0, "bodies": 0 },
          "thrown": { "rays": 89, "nodes": 0, "bodies": 0 }
        }
      }
    }
  },
  "game": {
    "metrics": {},
    "runs": {
      "TAL-4471 wander": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 21600 }
        }
      },
      "MUD-9031 wander": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 19800 }
        }
      },
      "TAL-4471 chaos": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 21600 }
        }
      }
    }
  }
};
