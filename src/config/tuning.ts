/**
 * Every tunable number in the game, in one place.
 *
 * Starting values come from the design doc (Part 2) and get tuned in play. In the dev
 * build, saving this file hot-reloads it into the running game: simulation and view
 * values apply immediately; `gen` values regenerate the valley in place.
 *
 * Three owners, so each change knows what it invalidates:
 *   gen   what generation reads (and only that): a change means a different valley;
 *   view  presentation only: never changes an outcome, never invalidates a recording;
 *   the rest is the simulation's: a change mid-run marks the recording as unreplayable.
 *
 * Units: metres, seconds, degrees (where named *Deg), multipliers otherwise.
 */
export const defaultTuning = {
  sim: {
    tickHz: 30, // fixed simulation rate (design doc · Platform and architecture)
    recordHz: 10, // state samples per second in recordings
  },

  // Everything generation reads, and nothing else: changing any of it rebuilds the valley.
  gen: {
    world: {
      size: 1280, // terrain square, centred on the camp
      cellSize: 2.5, // heightfield spacing; render and physics share these triangles
      playMargin: 70, // out-of-bounds band at the terrain edge
      padRadius: 78, // flattened camp pad
      padBlend: 36, // blend from the pad into the valley floor
      padHeight: 0.5, // pad elevation; kept off the 5 m contour lines
      ridgeRadius: [215, 430], // crest distance from the camp, varying around the valley
      ridgeHeight: [32, 78], // crest height above the pad
      saddleCount: [3, 4], // low passes through the ridges: the creek uses two, the road one
      saddleDepth: [0.6, 0.82], // share of the crest height a saddle removes
      saddleHalfWidthDeg: [15, 24],
      warpAmplitude: 70, // breaks the bowl's symmetry
      hills: 15, // broad rolling relief
      crags: 9, // ridged relief on the slopes
      detail: 0.9, // fine relief
      creekWidth: 7, // flat creek bed
      creekBankSlope: 0.8, // bank rise per metre (about 39°)
      roadWidth: 6,
      maxGenAttempts: 6, // re-rolls before accepting a valley that fails validation
    },

    props: {
      treeSpacing: 6, // jittered-grid cell for tree candidates
      treeCover: 0.42, // share of forest cells that grow a tree
      rockSpacing: 13,
      bushSpacing: 7,
    },
    // Validation measures walkability with the controller's own slope limit; a test
    // keeps the two equal.
    walkableSlopeDeg: 42,

    // The camp's rhythm: how its guards walk their routines (gen/routine.ts). Part of the
    // camp, like its layout: lab D validates the timing windows these make.
    routines: {
      pace: 1.35, // m/s along a patrol route
      holdTime: [2, 5], // seconds paused at each waypoint
      turnRate: 2.6, // rad/s while turning at a waypoint
      headScanDeg: 50, // sentries sweep this far either side
      headScanPeriod: 7, // seconds per sweep
    },
  },

  player: {
    radius: 0.3,
    height: { stand: 1.8, crouch: 1.2, prone: 0.5 },
    eyeHeight: { stand: 1.65, crouch: 1.05, prone: 0.32 },
    speed: { sprint: 5.5, walk: 3.0, crouch: 1.8, crawl: 0.7 }, // design doc · Player · Movement
    backwardFactor: 0.7, // speed multiplier walking backwards
    accel: 16, // m/s² toward the wished speed
    decel: 20, // m/s² when slowing down
    stanceTime: { crouch: 0.22, prone: 0.75 }, // seconds to change stance
    maxSlopeDeg: 42, // steeper ground cannot be climbed
    uphillSlowdown: 0.55, // speed multiplier climbing at the maximum slope
    stepHeight: 0.45, // ledges up to this height are stepped onto
    pitchLimit: 1.45, // radians the view can tilt up or down
    shoveMax: 0.08, // most a guard shoves the body per resolve pass; small enough that walls always win
    gravity: 9.81,
    groundSnap: 0.6, // stay glued to the ground walking downhill
    stride: { sprint: 1.7, walk: 1.25, crouch: 0.85, crawl: 0.6 }, // metres between footsteps
  },

  noise: {
    // Loudness = movement × surface; heard radius = loudness × radiusPerUnit (no masking).
    // Sprinting on gravel is about three times as loud as crouch-walking on grass.
    movement: { sprint: 1.5, walk: 1.0, crouch: 0.6, crawl: 0.3 },
    surface: { grass: 0.85, dirt: 1.0, gravel: 1.15, rock: 1.05, water: 1.35, metal: 1.4, wood: 1.2 },
    radiusPerUnit: 12,
    // Landing from a fall or a slide: loudness grows with impact speed (m/s), from a soft
    // drop at minSpeed to the cap. A 1 m drop lands at 4.4 m/s, about a walking step.
    landing: { minSpeed: 2.5, perSpeed: 0.25, max: 3 },
    speedOfSound: 343, // m/s: distant sounds arrive late (crack-thump, footsteps across the camp)
    // Steady sources, as heard radii. Phase 1 makes them mask other sounds for guards too.
    ambient: { creek: 38, generator: 70 },
  },

  visibility: {
    // Multipliers from design doc · Enemy perception · Sight. Phase 1 builds detection on them.
    stance: { stand: 1.0, crouch: 0.6, prone: 0.3 },
    movement: { still: 0.4, moving: 1.0, sprinting: 1.6 },
    light: { lit: 1.0, dusk: 0.6, dark: 0.25 },
    skyline: 1.5,
    coneCoreDeg: 60,
    conePeripheralDeg: 120,
  },

  guards: {
    // Their bodies; everything else comes from the player's (entities/guards.ts, guardSpec).
    radius: 0.3, // collision body (the drawn capsule is set in render/guardMeshes.ts until bodies are unified)
    height: 1.85,
    eyeHeight: 1.71,
    walkSpeed: 1.35, // their normal walk; footsteps are as loud as a walk at this speed
    stride: 0.75,
    accel: 30, // m/s², speeding up and slowing down: brisker than the player, so a guard keeps to his routine within a few centimetres
    catchUp: 1.5, // how much faster than walking a guard may hurry back to his routine
  },

  view: {
    fov: 58, // vertical degrees, about 91° horizontal at 16:9
    zoomFov: 9, // binocular-style zoom while holding the right mouse button
    zoomTime: 0.16,
    lookSensitivity: 0.0022, // radians per pixel at the base field of view
    headBob: 1, // 0 turns camera bob off
    fogDensity: 0.0012, // exp² fog: about 30% at 500 m, 75% at 1 km
  },
};

export type Tuning = typeof defaultTuning;
/** The slice of tuning that generation reads; generation code never sees the rest. */
export type GenTuning = Tuning['gen'];
