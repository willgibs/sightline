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

  // The camp brain (lab E, src/sim/brain).
  brain: {
    // Navigation (E1): A* over the map and site layers of the spatial grid (nav.ts).
    nav: {
      siteExpansions: 40000, // site-layer cells one search may expand (rule 18)
      mapExpansions: 20000, // map-layer cells one search may expand (rule 18)
      searchesPerTick: 4, // routes searched in one tick, across every guard
      snapRadius: 4, // metres: how far a blocked point looks for the nearest walkable cell
      pullAhead: 200, // cells a straight segment may skip in string-pulling
      sampleStep: 0.2, // metres between clearance samples along a pulled segment
      arrive: 0.6, // metres: close enough to a waypoint to move on
      slowDown: 1.2, // metres before the last waypoint where he eases off
      minSpeed: 0.5, // m/s: never slower than this while walking a route
      progress: 0.02, // metres he must gain on a waypoint to count as progress
      stallSeconds: 0.9, // no progress for this long: something's in the way
      stallsMax: 4, // stalls a route may take before the brain is told
      sideSeconds: 0.7, // how long a sidestep around something in the way lasts
    },
    // A guard's brain (E3, brain.ts): awareness states, utility scoring inside each.
    think: 0.4, // seconds between reconsiderings, at most (sooner when something changes)
    pickShare: 0.7, // options within this share of the best weight are in the draw (rank-then-weight)
    switchRatio: 1.4, // a running act is dropped only for one better by this factor
    routeEvery: 1.5, // seconds a guard waits before re-searching a route to a goal that moved
    goalMoved: 2.5, // metres a goal must move before it's worth a new route
    backAt: 3, // metres from where his routine says he should be: close enough to walk straight there
    routeRetry: 1.5, // seconds before trying again after no route was found
    paces: { investigate: 1.35, search: 2, hurry: 2.4, run: 5 },
    linger: { investigate: 4.5, search: 2.5 },
    cooldown: { investigate: 2.5, search: 2 },
    search: { points: 3, radius: 7, growth: 0.35 },
    taskWeight: 0.9, // how strongly he weighs an order against what his own senses tell him
    // Adaptation within a mission (E9): a ledger of repeated tricks and a memory of incidents.
    adapt: {
      cellSize: 8, // metres: stimuli within this of each other count as one spot
      forget: 240, // seconds a spot stays in the ledger without a repeat
      repeatCount: 3, // from this many repeats of one trick, two guards go and it is radioed in
    },
    // Alarms (E7): a guard runs for the alarm box when things turn real (design doc: 4–8 s away).
    alarm: {
      reach: 44, // metres: a run of about 8 s at his sprint; farther, he won't
      use: 0.7, // seconds to throw the switch, standing at it
      role: { sentry: 0.6, patrol: 0.5, marksman: 0, 'radio-operator': 0.3, officer: 0.5, worker: 1, target: 0 },
      sirenRadius: 1200,
    },
    // Reinforcements (E8): called at lockdown, arriving after a delay as a squad that hunts.
    reinforce: {
      delay: 90, // seconds from lockdown to their arrival
      count: 3, // guards in the squad
      spread: 3.5, // metres between them when they arrive
      edgeMargin: 14, // metres inside the map's edge where they arrive, up the camp's road
    },
    // Counter-sniper (E8): triangulating shots from bearings (triangulate.ts) and hunting the shooter.
    sniper: {
      fusion: { half: 640, cells: 128, rangeMin: 120, rangeMax: 560 }, // the commander's grid around the camp, metres, and its ring of plausible perches
      keep: 90, // seconds of bearings it fuses
      maxBearings: 16, // bearings it keeps
      earSigmaDeg: 4, // the error of a bearing taken by ear, from the guard's own stream, on top of where it seemed to be
      statedScale: 0.85, // the error he states, as a share of his real error, calibrated so the camp's ellipse contains the shooter at its stated rates (bench)
      minSigmaDeg: 1.5, // nobody's ear is sharper than this
      maxSigmaDeg: 25, // a bearing worse than this is said to be no bearing at all
      sweepSeconds: 8, // how long a marksman sweeps a believed perch
    },
    // Minimal combat (E10): guards engage, take cover and call support; the player can be hit and die.
    combat: {
      range: { sentry: 90, patrol: 90, marksman: 320, 'radio-operator': 60, officer: 80, worker: 0, target: 0 }, // metres he will shoot at what he sees
      seenFor: 0.7, // seconds a sighting stays good enough to shoot at
      react: 0.6, // seconds from seeing to the first shot
      every: 1.1, // seconds between shots
      spreadDeg: 1.1, // his aim's error radius, degrees, from his own stream
      playerHits: 3, // hits the player can take
      damage: { head: 2, torso: 1, legs: 1 }, // what each part counts as
      coverRange: 12, // metres he looks for cover within
      coverRings: 4, // rings of candidate spots, out to coverRange
      coverPoints: 12, // spots per ring
      coverAfter: 2.5, // seconds without a sight of the target before he looks for cover
      holdAfter: 6, // seconds he holds cover without seeing anything before moving up
      chest: 1.2, // height of the line he has to break
    },
    roles: {
      // What each role is willing to do (0 never, 1 fully): the role column of the design doc's table.
      sentry: { investigate: 0.65, search: 0.75, flank: 0.6, report: 0.8, fight: 0.8 },
      patrol: { investigate: 1, search: 1, flank: 0.85, report: 0.8, fight: 1 },
      marksman: { investigate: 0, search: 0, flank: 0, report: 1, fight: 1 },
      'radio-operator': { investigate: 0.1, search: 0.1, flank: 0, report: 1, fight: 0.4 },
      officer: { investigate: 0.7, search: 0.8, flank: 0.3, report: 1, fight: 0.7 },
      worker: { investigate: 0.25, search: 0, flank: 0, report: 0.6, fight: 0 },
      target: { investigate: 0, search: 0, flank: 0, report: 0, fight: 0 },
    },
    // Each option's weight multiplies these, each read through its response curve.
    curves: {
      near: { from: 4, to: 60, at0: 1, at1: 0.15 }, // how much a nearby spot pulls him
      fresh: { from: 2, to: 25, at0: 1, at1: 0.05 }, // how fresh the belief is
    },
    lookWeight: 0.35, // the weight of standing to look, when it competes with going
    // Reports (E4): what guards tell each other and the camp (reports.ts, game/comms.ts).
    comms: {
      talk: 1.6, // seconds a radio call lasts: long enough to be interrupted
      netDelay: 1.5, // seconds from a finished call to its delivery across the net
      talkRadius: 14, // metres his voice carries while he's on the radio
      shoutRadius: 55, // metres a shout carries
      keep: 25, // seconds a guard remembers what he's been told
      maxTold: 8, // reports a guard's memory holds
      reportEvery: 20, // seconds between his calls about the same thing
      level: { contact: 0.8, heard: 0.45, shot: 0.8, body: 0.82, missing: 0.4, clear: 0, claim: 0 }, // what a report raises him to
      radius: { contact: 4, heard: 18, shot: 22, body: 6, missing: 8, clear: 12, claim: 8 }, // metres of uncertainty each kind adds to the speaker's
      clearRadius: 18, // metres a searcher's "clear" report wipes from the map
      // Claims (Blacklist): "I've got it": one guard goes, those who hear him don't all pile in.
      claimWithin: 14, // metres between a claim's spot and his own for it to count
      claimFor: 15, // seconds a claim holds
      claimedWeight: 0.15, // how much a claim by someone else leaves of his own wish to go
    },
    // The camp's search map (E4, searchMap.ts): a window of cells around the camp.
    searchMap: {
      cells: 64,
      cell: 2.5,
      spreadRate: 0.25, // share of a cell's belief that bleeds to its neighbours per update,
      updateHz: 2, // updates a second, a rate (rule 17)
      clearRays: 400, // cells one clearing may test
      injectRadius: 8, // metres: the least a report can be spread over
    },
    // The camp (E5, commander.ts): alert levels, tasks, pacing and search cycles.
    camp: {
      planEvery: 0.5, // seconds between the commander's plans
      keepOrder: 25, // seconds an order stays good if nothing renews it
      noOfficerEvery: 3, // seconds between plans with no officer to run them: searches turn sloppy
      // How many guards it may send: the pacing layer's role slots, by the camp's level.
      slots: {
        uneasy: { investigate: 1, search: 0 },
        alert: { investigate: 1, search: 3 },
        lockdown: { investigate: 1, search: 4 },
      },
      search: {
        minSeconds: 30, // a search ends no sooner than this after the last report of anything suspicious,
        maxSeconds: 45, // and no later than this after it
        lowMass: 0.2, // the map holds less than this: looked at, and nothing there
        wideArea: 1200, // square metres the belief has bled over: he could be anywhere
        avoid: 12, // metres between the spots of two searchers
      },
      // Radio check-ins (E6): the operator calls each post in turn, every few minutes.
      checkins: {
        every: 150, // seconds between calls to each post, spread evenly across the posts,
        uneasyEvery: 75, // and how often once the camp is uneasy
        reply: { min: 1, max: 3 }, // seconds a post takes to answer, drawn from its own stream
        deadline: 12, // seconds without an answer before the post counts as silent
      },
    },
  },

  // The rifle, its ammunition and suppressor, the optics and the throwable (design doc ·
  // Weapons, tools and ballistics; the ballistics lane, sim/ballistics). Content as data
  // (rule 16): recordings embed it, and replay with the numbers they were made with.
  ballistics: {
    // The core mission's rifle: a bolt-action .308 with a fixed 10× scope and a suppressor to fit or take off.
    rifle: {
      rounds: 15, // per mission (design doc · Loadout: about 15, so a camp can't be brute-forced)
      boltTime: 1.2, // seconds from a shot until the next round is chambered
      raiseTime: 0.3, // seconds to bring the scope to the eye; until it's there the shot isn't where you look
      zero: { min: 100, max: 600, step: 100, start: 100 }, // metres: the dial clicks in 100 m steps
      load: 'match', // the load the rifle starts with (a key of loads)
      suppressed: false, // the suppressor fitted at the start
      fitTime: 3, // seconds to fit or take off the suppressor; no shooting meanwhile
      unaimedMil: 25, // the barrel's pointing error with the scope down: a shot from the hip
    },
    // Each load: muzzle speed, and one quadratic drag constant (a = −k·|v|·v) at the
    // reference air (airDensity); the mission's air scales it. Fitted to a G7 point-mass
    // solver's time of flight (docs/research/scripts/ballistics.py).
    loads: {
      // Hornady .308 Win 168 gr ELD Match: 823 m/s, G7 0.263. 0.41 s and 1.8 mil of drop to 300 m (100 m zero).
      match: { muzzleSpeed: 823, drag: 0.000756 },
      // A subsonic .308: 320 m/s, G7 0.30 assumed (no published BC was found). Quiet, slow, with heavy drop.
      subsonic: { muzzleSpeed: 320, drag: 0.00037 },
    },
    airDensity: 1.225, // kg/m³ the loads' drag constants are given at: sea level, 15 °C
    maxFlight: 4, // seconds a bullet flies before it's dropped, far past any target
    // The shot's sounds, as radii in metres: how far an unmasked guard with normal
    // hearing would just hear each one (sim/kernel/sound.ts).
    sound: {
      report: 2400, // the muzzle report, unsuppressed: the whole valley hears it
      suppressedReport: 220, // the suppressor cuts the report sharply (about 20 dB) but it's still a shot
      subsonicReport: 0.5, // a subsonic load's report is quieter still: this share of the radius
      crack: 160, // the supersonic crack, heard this far from the bullet's path; a subsonic bullet makes none
      bolt: 8, // working the bolt
      // A bullet's strike, by what it hits: the thump of a body carries back to the shooter.
      impact: { body: 650, metal: 900, rock: 320, wood: 260, ground: 160, water: 140 },
    },
    // What a hit does (design doc · Hits).
    hits: {
      cryChance: 0.35, // a torso shot kills an unarmored guard, but this often he cries out first
      cryRadius: 90, // his cry, heard this far
      collapseTime: 0.7, // seconds for the body to fall to the ground
    },
    // The optics. Field is the true angle across the view, degrees.
    scope: { fieldDeg: 3.6 }, // a fixed 10× scope: 6.3 m across at 100 m
    binoculars: { fieldDeg: 6.5, rangeMax: 1500 }, // 8× glasses with a laser rangefinder, to the nearest metre
    // Lens glint (design doc · Tools: binoculars glint when facing the sun): full while the
    // lens faces within fullDeg of half way between the sun and the one who sees it, gone by zeroDeg.
    glint: { fullDeg: 12, zeroDeg: 35 },
    // The throwable (design doc · Tools): a rock that pulls one guard's attention.
    throwable: {
      count: 3, // carried at the start
      speed: 13, // m/s, along the view lifted by liftDeg
      liftDeg: 12,
      radius: 0.05, // metres
      bounce: 0.3, // share of the speed into the ground kept after a bounce
      friction: 0.55, // share of the speed along the ground kept after a bounce
      rest: 1.2, // m/s: slower than this at a touch, it stops
      // Its landing, as heard: the radius at 10 m/s on dirt, scaled by speed and the surface's loudness.
      landing: 26,
      maxFlight: 6, // seconds before it's taken as settled wherever it is
    },
    // Sway: the aim's wander from where you look, in milliradians (a mil is 10 cm at
    // 100 m). Pure functions of the state and the time (sim/ballistics/sway.ts); starting
    // values to tune, meant to give a 95th-percentile radius of about 1.5 mil standing,
    // 0.5–0.8 prone, 0.25 prone on a rest, and 0.1 rested with the breath held.
    sway: {
      breath: 1.25, // breathing, up and down, standing and calm
      breathRate: 0.25, // breaths a second at rest (15 a minute); faster with the heart
      drift: 0.4, // the breathing's slower sideways drift, as a share of its rise and fall
      tremor: 0.55, // grip tremor, smooth noise on both axes
      tremorRate: 1.7, // its changes a second
      pulse: 0.22, // the heartbeat's kick, mostly vertical
      pulseWidth: 0.15, // share of each beat the kick lasts
      pulseRight: 0.3, // its sideways share
      stance: { stand: 1, crouch: 0.6, prone: 0.42 },
      rested: 0.37, // multiplier on a rest: a bipod, a sandbag, a wall
      held: 0.2, // multiplier on the breathing and the tremor while the breath is held
      holdSettle: 0.5, // seconds a held breath takes to still the aim
      spent: 1.5, // once a hold has run out: extra tremor per second past it, up to spentMax
      spentMax: 3,
      heart: 0.012, // extra sway per beat a minute above resting
      moving: 6, // multiplier while moving, easing back to 1 over settle
      movingSpeed: 0.1, // m/s: moving faster than this unsettles the aim at once
      settle: 0.8, // seconds to settle after stopping
      restTime: 0.4, // seconds to settle onto a rest, or come off one
      recoil: 7, // the shot's kick, up, then settling over recoilTime
      recoilTime: 0.45,
      recoilRight: 0.25, // its sideways share
      recoilFloor: 0.35, // the least of the kick a stance and a rest leave
      gasp: 1.6, // multiplier on the breathing just after a long hold is let go, fading over gaspTime
      gaspTime: 1.5,
      // Where a rest is: under the rifle's fore-end this far ahead of the eye, this far below the line of sight.
      restReach: { prone: 0.75, upright: 0.55 },
      restBand: { prone: [0.12, 0.4], upright: [0.04, 0.32] },
      bipodPitchDeg: 18, // a bipod rests only aiming within this of level
    },
  },

  // Breath and heart rate: every shooter's, steadying or shaking the aim (design doc ·
  // Vitals; sim/body/vitals.ts). Lab C extends them.
  vitals: {
    restingHr: 68, // beats a minute, calm
    maxHr: 175,
    // The heart rate each gait drives toward, beats a minute: sprinting raises it.
    effortHr: { idle: 68, crawl: 88, crouch: 92, walk: 96, sprint: 165 },
    rise: 6, // seconds for the heart to close most of the way to a higher rate
    calm: 6.5, // seconds to settle most of the way back: about 20 s from a sprint to calm
    holdTime: 4, // seconds a breath steadies the aim, calm; shorter as the heart races
    holdAtMaxHr: 1.5, // seconds it lasts at the maximum heart rate
    recoverTime: 6, // seconds to get the breath back after a full hold
    minAir: 0.25, // a breath can't be held again until this much of it is back
    closeCall: 28, // beats a minute a close call adds at once (a crack past the head, a near miss)
  },

  view: {
    fov: 58, // vertical degrees, about 91° horizontal at 16:9
    zoomFov: 9, // binocular-style zoom while holding the right mouse button
    zoomTime: 0.16,
    lookSensitivity: 0.0022, // radians per pixel at the base field of view
    headBob: 1, // 0 turns camera bob off
    // How far the eye dips as each foot comes down, metres, at each gait's speed (sim/body/bob.ts).
    bob: { crawl: 0.01, crouch: 0.016, walk: 0.026, sprint: 0.05 },
    fogDensity: 0.0012, // exp² fog: about 30% at 500 m, 75% at 1 km
  },
};

export type Tuning = typeof defaultTuning;
/** The slice of tuning that generation reads; generation code never sees the rest. */
export type GenTuning = Tuning['gen'];
