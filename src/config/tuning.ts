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
    gravity: 9.81, // m/s², for everything that falls: bodies now, bullets and throws later
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

    // The spatial grid (sim/kernel/world/grid.ts) is built for a standard body; tests keep these
    // equal to the player's.
    grid: {
      bodyRadius: 0.3,
      stepHeight: 0.45,
      bodyHeight: 1.8,
      siteCell: 0.5, // metres: fine enough for a 1 m doorway
      siteMargin: 12, // metres of fine grid beyond the camp's outermost structures
    },

    // The camp's rhythm: how its guards walk their routines (sim/generation/routine.ts). Part of the
    // camp, like its layout: lab D validates the timing windows these make.
    routines: {
      pace: 1.35, // m/s along a patrol route
      holdTime: [2, 5], // seconds paused at each waypoint
      turnRate: 2.6, // rad/s while turning at a waypoint
      headScanDeg: 50, // sentries sweep this far either side
      headScanPeriod: 7, // seconds per sweep
    },
  },

  // Kinds of body: what the shared motor moves (sim/body/body.ts) and what sight lines and
  // hits see (sim/body/shape.ts). Each kind is complete, so a new one (a dog, a pilot in a
  // harness) is data, not code; recordings carry them with the rest of the tuning.
  bodies: {
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
      pitchLimit: 1.45, // radians the head can tilt up or down
      shoveMax: 0.08, // most another body shoves this one per resolve pass; small enough that walls always win
      groundSnap: 0.6, // stay glued to the ground walking downhill
      stride: { sprint: 1.7, walk: 1.25, crouch: 0.85, crawl: 0.6 }, // metres between footsteps
      // Leaning around cover (sim/body/lean.ts): metres the eye moves aside, about the hips.
      // No game publishes these; they are the lab's (docs/phase-1-plan.md, C3).
      lean: {
        peek: 0.18, // with nothing raised: an eye past the corner
        weapon: 0.4, // with an optic up: far enough to clear it. Never past radius + headRadius, so turning can't swing the head through a wall the body is clear of
        prone: 0.12, // lying down: rolling onto one shoulder
        bend: 0.58, // upright: at most this share of the spine (hips to eye), so a crouch leans less than a stand
        rate: 1.4, // m/s the eye moves aside at
      },
      // The mantle (sim/body/mantle.ts). No game publishes these; they are the lab's.
      mantle: {
        probes: 9, // forward probes, at heights up to maxHeight + 0.1 m
        maxHeight: 1.5, // the highest ledge a body can get up onto, metres above its feet
        reach: 0.5, // how far past its edge the hands reach for a ledge, metres
        squareCos: 0.4, // cosine of the widest angle off square it can start from (about 66°)
        overDepth: 0.8, // thinner than this, it goes over rather than up onto
        maxDrop: 1.6, // the furthest it will lower itself down the far side
        lift: 0.03, // how far above the ledge the feet clear it, metres
        hang: 0.1, // seconds for the hands to take hold
        pullSpeed: 4, // m/s on average, up the wall
        shiftSpeed: 3.5, // m/s on average, across the top
        dropSpeed: 3, // m/s on average, down the far side
        minLeg: 0.12, // no leg of the path is quicker than this, seconds
        holdFor: 0.4, // seconds it waits for something in the way before it gives up
        buffer: 0.2, // a press stays good this long, so an early press still works
      },
      // Three parts for sight lines and hits: a head sphere at the eye, a torso capsule
      // from the hips to the shoulders, a legs capsule from the feet to the hips.
      // Heights come from the stance.
      parts: {
        headRadius: 0.115,
        torsoRadius: 0.22,
        legRadius: 0.15,
        neck: 0.24, // the top of the torso sits this far below the eye
        hip: 0.5, // hips at this share of the stance's height
        proneLength: 1.75, // head to heels, lying down
      },
    },
    guard: {
      // A little taller than the player, and brisker to speed up and slow down, so he
      // keeps to his routine within a few centimetres. His normal walk is slow: his
      // footsteps are as loud as a walk at this speed.
      radius: 0.3,
      height: { stand: 1.85, crouch: 1.2, prone: 0.5 },
      eyeHeight: { stand: 1.71, crouch: 1.05, prone: 0.32 },
      speed: { sprint: 5.5, walk: 1.35, crouch: 1.8, crawl: 0.7 },
      backwardFactor: 0.7,
      accel: 30,
      decel: 30,
      stanceTime: { crouch: 0.22, prone: 0.75 },
      maxSlopeDeg: 42,
      uphillSlowdown: 0.55,
      stepHeight: 0.45,
      pitchLimit: 1.45,
      shoveMax: 0.08,
      groundSnap: 0.6,
      stride: { sprint: 1.7, walk: 0.75, crouch: 0.85, crawl: 0.6 },
      lean: { peek: 0.18, weapon: 0.4, prone: 0.12, bend: 0.58, rate: 1.4 },
      mantle: {
        probes: 9,
        maxHeight: 1.5,
        reach: 0.5,
        squareCos: 0.4,
        overDepth: 0.8,
        maxDrop: 1.6,
        lift: 0.03,
        hang: 0.1,
        pullSpeed: 4,
        shiftSpeed: 3.5,
        dropSpeed: 3,
        minLeg: 0.12,
        holdFor: 0.4,
        buffer: 0.2,
      },
      parts: {
        headRadius: 0.115,
        torsoRadius: 0.22,
        legRadius: 0.15,
        neck: 0.24,
        hip: 0.5,
        proneLength: 1.75,
      },
    },
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
    // A mantle (sim/body/mantle.ts): the hands taking hold, and being lowered down the far side
    // (loudness, times the surface; the drop's grows with how far, up to 1 m).
    mantle: { grip: 0.7, drop: 0.6, minDrop: 0.3 },
    // Steady sources, as heard radii. Phase 1 makes them mask other sounds for guards too.
    ambient: { creek: 38, generator: 70 },
  },

  visibility: {
    // Multipliers from design doc · Enemy perception · Sight. Phase 1 builds detection on them.
    stance: { stand: 1.0, crouch: 0.6, prone: 0.3 },
    movement: { still: 0.4, moving: 1.0, sprinting: 1.6 },
    light: { lit: 1.0, shade: 0.6, dusk: 0.6, dark: 0.25 }, // shade: out of the sun in daylight (starting value; lab A tunes it)
    skyline: 1.5,
    coneCoreDeg: 60,
    conePeripheralDeg: 120,
  },

  // Perception and awareness (lab A, sim/perception). The sight table's multipliers stay in
  // `visibility`; this is how they're read (owner, Nov 7): stance, light and the sky behind
  // you scale a zone's range, movement and the share of you in view scale how fast the
  // meter fills inside it, time grows linearly with distance, and every edge ramps.
  perception: {
    sight: {
      // Each zone's range is for the reference body: standing, walking, lit, in the open.
      // The most inclusive zone sets the range at each angle off the gaze (Blacklist).
      core: { halfDeg: 30, range: 150 }, // design doc: a core cone of about 60°; 150 m in daylight
      peripheral: { halfDeg: 60, range: 25 }, // owner: peripheral vision covers only a short range
      far: { halfDeg: 2.5, range: 400 }, // a marksman's binoculars: about 400 m in a narrow cone
      edgeDeg: 4, // a cone's edge ramps over this many degrees
      edgeShare: 0.08, // a range's edge ramps over this share of the range,
      edgeMin: 2, // but no less than this many metres
      edgeMax: 12, // and no more
      // Seconds to fill the meter at no distance, and at the range's edge: linear between.
      fill: { near: 2, edge: 8 },
      // How much each ray counts toward the share of the body in view.
      parts: { head: 0.2, chest: 0.5, feet: 0.3 },
      // Rays that must be clear of anything solid before the meter moves at all. One for
      // every stance: the share in view already slows a sliver, and a gate would be a cliff.
      minClear: { stand: 1, crouch: 1, prone: 1 },
      // Close enough to touch: noticed in any direction, and quickly. Drawn in the debug view.
      contact: { range: 2.5, ramp: 0.5, seconds: 0.8 },
      movingAt: 1, // m/s: the movement factor ramps from still at rest to moving at this speed
      cue: 0.3, // below this nothing shows (design doc)
      minCueSeconds: 1.5, // outside contact, the first cue comes at least this long before 100%
      hold: 1.5, // seconds the meter holds after the body leaves view,
      decay: 0.12, // then falls this much per second
      skylineReach: 1500, // a line on past the body that hits nothing this far ends in open sky
      skylineRampDeg: 0.5, // it counts as sky from this far below level to this far above, ramping
      groundLift: 0.05, // light is taken this far above the ground beneath the body (owner)
      shadeBelow: 0.5, // foliage that lets through less sun than this casts shade
    },
    // Foliage dims sight by the length of the line through it, the same both ways:
    // transmittance exp(−density × length).
    foliage: {
      bush: 1.3, // per metre: a 1.6 m bush lets through about an eighth
      canopy: 0.7, // per metre: a 4 m conifer canopy lets through about a twentieth
    },
    hearing: {
      maxExpansions: 120000, // site-grid cells one sound's flood may expand (rule 18)
      wallLossDb: 12, // the straight route loses this much per wall it passes through (as Rainbow Six Siege's does)
      terrainLossDb: 15, // and this much where the ground is in the way
      maxWalls: 4, // through more walls than this, the straight route is silent
      maskDb: 17, // a steady sound hides anything more than this far below it (psychoacoustics: 15–20 dB)
      // A heard sound gives a guess, not a fix: its place is blurred by a share of its distance,
      // more by how much longer its path was than a straight line.
      blur: { min: 0.5, distance: 0.08, detour: 0.6 },
      lift: 0.3, // sounds start this far above where they are, clear of the ground they're on
      keep: 6, // seconds a heard sound stays a percept
    },
    // The awareness ladder (design doc · Individual awareness): Thief's and The Dark Mod's.
    awareness: {
      // The level each state starts at, of the meter or of the evidence (combat: seen, at 1).
      levels: { curious: 0.3, suspicious: 0.55, searching: 0.8 },
      // A rise waits this long in the state it rises from: telegraphed reaction time.
      dwell: { unaware: 0, curious: 0.6, suspicious: 0.8, searching: 0.6 },
      // A fall steps down one state after this long without a new stimulus.
      rampDown: { curious: 6, suspicious: 10, searching: 20, combat: 30 },
      spread: 0.25, // each ramp-down varies by up to this share, from the guard's own stream
      grace: 2.5, // seconds after a rise in which weaker stimuli are ignored,
      graceBeat: 1.25, // unless one beats the last rise by this factor,
      graceCount: 3, // or this many arrive, which counts as a stronger stimulus
      repeat: 0.2, // how much a repeated stimulus adds
      // What one heard sound raises him to, at the edge of hearing and when clear (clarity 4).
      sound: { faint: 0.3, clear: 0.62 },
      shot: 0.8, // a shot heard: searching
      glimpse: 0.8, // having seen you at 100%: searching, once he loses you
      floor: 0.15, // after a search he never settles below this (design doc: a raised baseline)
      sharp: 1.25, // and his eyes are this much quicker
      // Minimal reactions (A7), until lab E's brain: how he turns and moves at each state.
      turnRate: 3.5, // rad/s, body
      headRate: 5, // rad/s, head
      headLimitDeg: 75, // the head turns this far before the body follows
      approach: 1.5, // m/s, walking to look
      hurry: 2.2, // m/s, searching
      arrive: 1.5, // metres: close enough to the spot to stop and look
      scanDeg: 40, // looking around a spot, either side
      scanPeriod: 4, // seconds per sweep
      believedSpeed: 1.5, // m/s: how fast he assumes an intruder could have moved since
    },
    // Barks: each line is a voice (a sound the others hear), at most once in this long.
    barks: { cooldown: 8, radius: 22, shout: 60 },
  },

  guards: {
    // Their bodies are bodies.guard; this is how they keep to their routines (sim/game/guards.ts).
    catchUp: 1.5, // how much faster than walking a guard may hurry back to his routine
  },

  view: {
    fov: 58, // vertical degrees, about 91° horizontal at 16:9
    zoomFov: 9, // binocular-style zoom while holding the right mouse button
    zoomTime: 0.16,
    lookSensitivity: 0.0022, // radians per pixel at the base field of view
    headBob: 1, // 0 turns camera bob off
    // How far the eye dips as each foot comes down, metres, at each gait's speed (sim/body/bob.ts).
    bob: { crawl: 0.01, crouch: 0.016, walk: 0.026, sprint: 0.05 },
    leanRollDeg: 22, // degrees the view tilts per metre of lean: 4 at a peek, 9 at a full lean
    fogDensity: 0.0012, // exp² fog: about 30% at 500 m, 75% at 1 km
  },
};

export type Tuning = typeof defaultTuning;
/** The slice of tuning that generation reads; generation code never sees the rest. */
export type GenTuning = Tuning['gen'];
