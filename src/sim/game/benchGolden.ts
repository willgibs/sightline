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
      "shade: drawn as simulated, of 20000 points": 19982,
      "shade: drawn as simulated within 1.5 m of a shadow, of 6000 points": 5810,
      "crack at 300 m: least degrees off the shooter": 55.438591,
      "crack at 300 m: most degrees off the shooter": 57.2126615,
      "seed · crack at 300 m: degrees off the shooter": 0,
      "trials: candidates run for two sittings": 1759,
      "trials: scored trials in two sittings": 60,
      "trials: pairs of factor levels the first sitting covers": 192,
      "seed · trials: pairs of factor levels covered, taken first come": 165,
      "trials: borderline right by the sight table alone (of 30)": 14,
      "trials: the rules-only predictor's balanced accuracy, first sitting (%)": 58.9285714,
      "trials: frozen at the first cue (of 60)": 30,
      "trials: cue-frozen trials where his head can be read": 23,
      "trials: borderline trials distance flips": 4,
      "trials: borderline trials stance flips": 18,
      "trials: borderline trials movement flips": 14,
      "trials: borderline trials light flips": 4,
      "trials: borderline trials cover flips": 8,
      "trials: borderline trials sky flips": 3,
      "trials: borderline trials gaze flips": 12,
      "trials: seen among those frozen at the first cue (%)": 53.3333333,
      "trials: seen among those frozen at the start (%)": 53.3333333,
      "trials: a reader who says yes only at a first-cue freeze: balanced over both (%)": 50,
      "trials: a reader who says yes only at a first-cue freeze: passes (0 or 1)": 0,
      "trials: a reader by the first cue's time, and the table otherwise: balanced over both (%)": 73.2142857,
      "trials: a reader by the first cue's time, and the table otherwise: passes (0 or 1)": 0,
      "seed · trials: seen among those frozen at the first cue (%)": 76.6666667,
      "seed · trials: seen among those frozen at the start (%)": 30,
      "seed · trials: a reader who says yes only at a first-cue freeze: balanced over both (%)": 73.4375,
      "seed · trials: a reader who says yes only at a first-cue freeze: passes (0 or 1)": 0,
      "seed · trials: a reader by the first cue's time, and the table otherwise: balanced over both (%)": 79.4642857,
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
          "perception-sight": { "rays": 26033, "nodes": 0, "bodies": 0 },
          "perception-awareness": { "rays": 0, "nodes": 60480, "bodies": 0 }
        }
      },
      "perception-crowd": {
        "work": {
          "motor": { "rays": 0, "nodes": 0, "bodies": 45900 },
          "perception-sight": { "rays": 92825, "nodes": 0, "bodies": 0 },
          "perception-awareness": { "rays": 0, "nodes": 371207, "bodies": 0 }
        }
      }
    }
  },
  "brain": {
    "metrics": {
      "search map: numbers": 4096,
      "search cycle: shortest (s)": 30.1666667,
      "search cycle: longest (s)": 30.1666667,
      "ellipse: contains the shooter at 1 sigma (%)": 38.75,
      "ellipse: contains the shooter at 2 sigma (%)": 88.5,
      "ellipse in the world: contains the perch at 1 sigma (%)": 60.8247423,
      "ellipse in the world: contains the perch at 2 sigma (%)": 97.9381443,
      "ellipse in the world: mean bearings fused per shot": 6.74226804,
      "re-found within 25 s (of 8): honest": 6,
      "re-found within 25 s (of 8): random": 2,
      "re-found within 25 s (of 8): plain": 6,
      "re-found within 25 s (of 8): staleness": 4,
      "re-found within 25 s (of 8): omniscient": 8,
      "reactions (in the scripted scenarios)": 66,
      "reactions unexplained": 0
    },
    "runs": {}
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
