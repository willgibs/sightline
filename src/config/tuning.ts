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
    dice: 0, // which roll of the dice a run gets: forks every entity's random streams, the same camp with other luck (Lab F). 0 is the game's own
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
      detail: 0.9, // fine relief
      creekWidth: 7, // flat creek bed
      roadWidth: 6,
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

    // Terrain with teeth (lab D, D3; sim/generation/landform.ts): the valley a generated camp
    // stands in. Two or three ridge spines on chosen bearings overlook it from a few sectors,
    // never a ring; their camp faces are cliffs broken by walkable gullies, and a creek with
    // steep banks is crossed only at fords, so the way in is a choice.
    landform: {
      attempts: 8, // terrain re-rolls before a valley that fails its checks is kept anyway (rule 18)
      openArcDeg: [130, 170], // the low side, with no ridge: the road comes in through it
      ridges: [2, 3], // spines placed around the rest of the horizon
      ridgeDistance: [240, 420], // from the camp to the middle of the crest
      ridgeSpanDeg: [50, 80], // how much of the horizon each spine takes, seen from the camp
      ridgeHeight: [30, 58], // crest above the pad
      ridgeBack: [110, 190], // run of the far slope
      ridgeBend: [-0.12, 0.3], // how far the crest's ends curl toward the camp, per metre of distance
      cliffs: 0.9, // how much of a camp face is cliff away from its gullies (1: all of it)
      gullies: [1, 2], // walkable gullies down each camp face
      gullyWidth: 26, // across a gully, metres
      floorRise: 9, // the valley floor's rise toward the play area's edge
      floorHills: 4, // rolling relief on the floor
      crags: 6, // broken relief on the spines
      rim: 90, // hills beyond the play area, for the horizon
      creekBank: 2.2, // creek banks between fords: too steep to climb (rise per metre)
      fordBank: 0.45, // and at a ford
      fords: [2, 3], // crossings besides the road's
      // The kinds of ground a camp can stand on (landform.ts), and how often each comes up
      // (relative weights). A hollow is the valley above; every other kind is its own ground.
      sites: { hollow: 3, spur: 2, bend: 2, scarp: 2, gorge: 1, col: 1 },
      // How the road reaches the gate where there's an open side to come in by: straight in, or
      // swinging round from a long way off the gate's axis.
      roads: { straight: 1, dogleg: 1 },
      doglegDeg: [40, 75], // the swing from the gate's axis, degrees
      // A camp on a spur: the ground falls away round the pad, except along the neck that joins
      // it to the high ground behind. Long, flat shots across the valley; dead ground to the fence.
      spur: {
        drop: [22, 38], // from the pad down to the valley floor
        fall: [85, 120], // the run of that fall, from the pad's edge
        neck: [36, 56], // half-width of the level ground running back from the pad
        neckBlend: 40, // the neck's shoulders
        ridgeDistance: [300, 440],
        ridgeRise: [14, 32], // a crest above the pad, so above the floor by this and the drop
        ridgeSpanDeg: [60, 95],
        passBy: [30, 90], // the creek's closest approach, beyond the fall
      },
      // A camp in a river's bend: the water loops round its back, and comes near no gate.
      bend: {
        loop: [50, 78], // the river's distance beyond the pad's edge
        width: [12, 20], // of its bed
        openingDeg: [95, 125], // the river's legs leave at this bearing either side of the road
        ridgeDistance: [250, 350],
        ridgeHeight: [16, 30],
        fords: [2, 4],
      },
      // A camp under a cliff (scarp), or between two (gorge): a wall nobody can stand on, broken
      // at most by a notch you can climb to.
      wall: {
        distance: [155, 190], // from the camp's centre to the crest
        height: [44, 72],
        front: [38, 52], // run of its camp face
        back: [34, 48], // and of its far face
        notchDepth: 0.55, // how much of the crest a notch takes
        notches: [0, 1],
        arcShare: 0.9, // how much of the open side a scarp's wall takes
      },
      gorge: {
        wallHalfDeg: [34, 46], // half the arc of each wall
        ridgeDistance: [340, 500], // the far rises up and down its axis
        ridgeHeight: [24, 44],
        ridgeSpanDeg: [34, 50],
        offAxisDeg: [18, 30], // the front rise stands this far off the road
        passBy: [108, 122], // the creek along its floor
      },
      // A camp on a col: high shoulders close on either side, the ground falling away ahead and behind.
      col: {
        shoulderDistance: [195, 255],
        shoulderHeight: [38, 62],
        shoulderSpanDeg: [50, 62],
        fall: [10, 22], // how far the ground falls ahead of and behind the camp
        run: [140, 240], // over this distance from its pad
        passBy: [180, 250], // the creek, across the fall ahead
      },
    },

    // What D3 checks a valley for (sim/generation/overwatch.ts): overwatch from the placed
    // ridges only, never a ring, and ways in and out that don't share a chokepoint.
    overwatch: {
      perchAngleDeg: 2.5, // a perch looks down into the camp at least this steeply
      perchRange: [150, 560], // from the camp
      maxPerchArcDeg: 180, // perches over at most half the horizon
      minOpenGapDeg: 120, // the widest stretch of horizon with no perch
      minAccess: 3, // of 8 octants of the play area's edge, the camp is reachable on foot from this many
      exfilSeparation: 20, // two ways out stay at least this far apart beyond exfilFree of the camp
      exfilFree: 90,
    },

    // The compound (lab D, D4; sim/generation/compound.ts): the core mission's archetype, as data
    // a logging camp or a comms relay can follow. A plot (the fence, its gate and breach, towers,
    // the road in) and parcels around a central yard, each filled from a handmade module.
    // Sizes are metres: buildings are [length, depth, wall height].
    compound: {
      // The camp's plan, each part a relative weight from a stream of its own: the shape of its
      // plot, what its perimeter is made of, how full its yard is. `yard`, `chain` and `open` are
      // the compound as first built.
      plots: { yard: 3, long: 2, wide: 2, tight: 2 },
      perimeters: { chain: 3, screen: 2, fort: 1 },
      fills: { open: 3, packed: 2 },
      plotLong: [58, 66], // half-size along a long plot's length
      plotNarrow: [30, 36], // and across it
      plotTight: [36, 42], // half-sizes of a tight plot
      yardTight: 10, // the yard of a plot too shallow for the usual one
      wallHeight: 3.2, // a solid perimeter: higher than a man, and it stops a bullet
      wallFacing: 0.6, // a screen is walled on the sides this squarely facing a ridge
      coverPacked: [18, 30], // clusters of containers and crates in a packed yard
      fenceHalf: [44, 52], // half-sizes of the perimeter, along the gate axis and across it
      fenceHeight: 2.2,
      gateWidth: 8,
      breachWidth: 4,
      lane: 7, // clear ground inside the fence, where the perimeter patrols walk
      road: 8, // the road from the gate to the yard
      yard: 13, // half-size of the open yard at the centre
      towers: [2, 4], // watchtowers at the corners
      towerDeck: 6, // height of a tower's deck
      ladderGap: 0.8, // the gap in a tower's rail at the top of its ladder, or a climber can't step onto the deck
      wallThickness: 0.2,
      doorWidth: 1.5, // wide enough for the 0.5 m grid to pass a body through at any angle
      doorHeight: 2.1,
      hq: [12, 9, 3.2], // the target's building
      barracks: [18, 8, 3],
      mess: [13, 9, 3],
      storage: [13, 10, 4.4],
      radio: [6, 5, 2.8], // the radio room; its antenna, on its most hidden wall
      mast: 2, // the antenna's height: a whip well below the roof line (radio room 2.8 m), so the building hides it
      fixtureDoorGap: 2, // metres a wall fixture keeps from a door
      screenDepth: 1.6, // a buried target's door has a short wall this far inside it: no straight line through the door
      screenWing: 1.2, // how far that wall runs past the doorway either side
      screenGap: 1.6, // clear floor kept between the end of that wall and the room's side wall: there's always a way round
      escapeRun: [6, 22], // metres from the target's door to his vehicle, tried at this range
      escapeClearance: 3, // metres his vehicle keeps off the skeleton's way in
      overviewShare: 0.15, // a perch that sees this much of the camp's ground counts as an overview, which fixtures hide from first
      alarmSpacing: 15, // metres between alarm boxes
      shed: [5, 4, 2.6], // the generator's shed: a roof on posts
      lights: [3, 5], // light poles around the yard, on the generator's circuit
      alarms: [2, 3], // alarm boxes, on the generator's circuit
      cover: [5, 9], // clusters of containers, crates and sandbags
      corridorCover: [3, 5], // low cover along the way in from the breach
    },

    // Staffing a generated camp (lab D, D6; sim/generation/staffing.ts): guards bought with points,
    // one of every role first, under the cap; sentries at the camp's real chokepoints; patrols on
    // its lanes with stops and scans; every routine fitted to one cycle of the camp.
    staffing: {
      points: [16, 40], // to spend, from difficulty 0 to 1
      cap: 16, // guards at most (design doc, Validation: budgets hold)
      cost: { sentry: 2, patrol: 3, marksman: 4, radio: 2, officer: 3, worker: 1 }, // the target is free
      cycle: [160, 300], // seconds: the camp's cycle, which every routine divides; longer only if a route needs it
      dwell: [3, 9], // seconds held still at a patrol's stop
      chokeWidth: 10, // the widest passage a sentry is posted at, metres
      clearance: 1.0, // no two guards on routine come closer than this, metres
      offsetTries: 12, // start times tried for a walking guard before he's left out
      targetMargin: 0.02, // the target's walk out keeps this far under validation's limit on his time in view
      targetOptions: 3, // he stops considering walks once this many fit and two overviews would see them (each is a grid search)
      estimateStep: 3, // while staffing, sightlines are estimated from every this-many samples of the cycle (the analysis takes them all)
      workerInside: 2.5, // metres inside a door that a worker's chores are done
      targetFan: [6, 10, 14], // metres out from his door that the target's walks are tried, in a fan
      coverageMargin: 0.02, // posts are moved while a perch comes this near validation's limit on guard time
      coverageRounds: 6, // posts so moved, at most (rule 18)
      witnessTries: 12, // walkers' phases tried to give every perch someone it can't see watching, and as many turns of posts (rule 18)
      witnessTurns: [45, -45, 90, -90, 135, -135], // degrees a post is tried turned for that
      witnessMargin: 0.02, // the estimate of who's watched keeps this over validation's duty, on a camp built around a crux
      clusterMax: [2, 3], // the largest sightline cluster, from the easiest camp to the hardest: all but one
      coreMax: [3, 5], // and the hard core's
      corridorWatch: 0.2, // the most of the cycle one guard may watch the skeleton's way in
    },

    // The crux: the decisive problem each camp is built around (sim/generation/crux.ts), picked for
    // the seed before anything else, relative weights. `walk` is the old promise (a target who walks
    // out in front of the perches) and is weighted to nothing: an arm of the variety experiments only.
    crux: {
      kinds: { walk: 0, inside: 4, flush: 3, escort: 3 },
      buriedSeconds: 2, // on inside and flush camps, no perch has him in view longer than this a cycle
      doorPost: 1.4, // metres out from a door of his building that a door's sentry stands, where the crux isn't the way in: close enough that nobody crosses the threshold outside his contact zone
      doorShoulder: 1.3, // on an escort's camp that sentry stands this far to the side, clear of the target's way out of the door
      doorLineOut: [3, 6, 9, 12], // a buried target's spot is out of line of his door: eyes this far out in front of it are tried
      doorLineSide: [-2, 0, 2], // and this far to either side
    },

    // Lab D's own sight model (D7; sim/generation/sight.ts). Generation reads only gen, so its
    // model is its own: lab A's law (tuning.perception.sight) for one body, a crouched intruder
    // on the move, lit, in the open, with A's numbers copied here and the ranges A's × 0.6 for
    // the stance. tests/campSight.test.ts holds it to A's detection through A's scenario runner,
    // so a retune of perception never changes a valley; a deliberate one is copied here.
    sight: {
      cone: { core: 30, peripheral: 60, far: 2.5, edge: 4 }, // half-angles off the gaze, and the width of a cone's edge, degrees
      intruder: { core: 90, peripheral: 15, far: 240 }, // metres: A's 150, 25 and 400 for a standing body, × 0.6 crouched
      edge: { share: 0.08, min: 2, max: 12 }, // a range's edge ramps over this share of it, within these metres
      fill: { near: 2, edge: 8 }, // seconds to fill the meter at no distance, and at the range: linear between
      cap: 0.47, // the fastest fill outside contact, of a full meter per second (A's telegraph: the cue 1.5 s before 100%)
      contact: { range: 2.5, ramp: 0.5, seconds: 0.8 }, // close enough to touch: any direction, and quickly
      still: 0.4, // a still body fills a guard's meter at this share of a moving one's rate
      // A guard seeing a comrade drop: a standing body, falling. Lab D's own, until lab E's
      // brain says how guards take it.
      witness: { core: 80, peripheral: 30 },
      eye: 1.7, // a standing guard's eye
      chest: 1.35, // where a standing body is seen, and shot
      crouchHead: 1.05, // the crouched intruder's head and chest: what a guard sees of him
      crouchChest: 0.75,
      proneEye: 0.32, // a shooter lying on a perch: the body's own prone eye (bodies.player.eyeHeight.prone)
    },

    // What a camp must pass (D8; sim/generation/validate.ts): the design doc's rules (Maps and
    // procedural camps · Validation rules), the plan's no-single-perch rule and its companions.
    validation: {
      seenSeconds: 15, // a perch sees a guard if he's in its view this long a cycle: the plan's minimum time in view
      longRangePerches: 2, // perches that see half the guards and hold the target, for a 'walk' crux: the old promise
      targetSeconds: 10, // long enough a cycle for a perch to count as having the target
      maxCoverage: 0.6, // no perch sees more than this share of guard time
      maxTarget: 0.25, // nor the target for more than this share of the cycle
      watchedDuty: 0.03, // a guard counts as watched if another would see him drop for this share of the cycle
      manyGuards: 0.4, // a perch that sees this share of guard time keeps alarm boxes and the antenna out of its fire
      counterRange: 450, // metres: a marksman post or a counter-perch overlooks a perch within this
      counterRings: [60, 120, 200, 300, 400], // metres round a perch searched for ground the camp can reach that overlooks it
      counterBearings: 24, // bearings tried on each ring
      botPerches: 8, // the long-range bot (the exit test's) tries this many perches, the most-watching first
      repairAttempts: 12, // re-analyses a repair may spend (rule 18)
      campAttempts: 3, // camps built on one terrain before giving up: a camp repair can't save is rejected and built again
      repairShifts: 8, // a patrol's phase is tried at this many even steps of its period
      repairTurns: [30, -30, 60, -60, 90, -90], // degrees a post is tried turned
      repairMoves: [3, -3, 6, -6], // metres a post is tried moved along its arc
      hideReach: 14, // metres a post may be moved to get out of a perch's sight
      runSpeed: 5.5, // metres per second: the target running from his door to his vehicle
      interceptSeconds: 1.5, // a perch can stop the escape if it has him in view this long on that run
    },

    // How lab D analyses a camp (D7; sim/generation/analysis files).
    analysis: {
      cell: 1, // metres: the analysis raster, two of the site layer's cells a side
      dt: 5 / 9, // seconds between samples of the camp's cycle: a crouched step of a cell (1 m at 1.8 m/s), so the ways in are walkable
      margin: 30, // metres of ground around the fence that the intruder crosses
      meterLevels: 128, // the intruder's detection meter, in whole levels: full is detected
      meterLimit: 0.85, // the share of the meter a certified way in may reach: a margin over lab A's own
      // How fast it falls while no guard sees him, of a full meter per second. A's falls at 0.12
      // after holding 1.5 s; half that rate with no hold covers any pause of 3 s or more.
      meterDecay: 0.0625,
      maxExpansions: 400000, // the infiltration search's budget (rule 18)
      searchWeight: 40, // the greedy search tried first: arrival + this × distance, which finds a way far sooner, if not the earliest
      reaction: 1.5, // seconds from seeing a comrade drop to raising the camp (design doc)
      closeShot: 12, // metres: where infiltration ends, near enough to see the target indoors, with a clear line
      exitApart: 40, // metres between where two ways out leave the raster
      shotInterval: 0.75, // seconds between two shots from one rifle
      relocate: 2, // metres per second a shooter moves between perches
      perches: 32, // the most perches analysed, after thinning
      perchSpacing: 25, // metres between two perches kept
      perchSlopeDeg: 40, // no perch on ground steeper than this: a body slides off it (the motor's maxSlopeDeg is 42)
      clusterDuty: 0.1, // share of the cycle a witness edge must hold to join two guards in a cluster
      clusterExpansions: 20000, // the cluster search's budget (rule 18)
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
      // Ladders (sim/body/ladder.ts). Again the lab's own numbers; no game publishes these.
      ladder: {
        standoff: 0.05, // how far off a ladder's plane the body's edge stands
        reach: 1.05, // how far from the ladder a press takes it, at its foot, metres
        topReach: 2.2, // and on the deck at its top, where the rungs are further off
        footing: 0.6, // how close to its foot or its top a body must be, vertically
        facingCos: 0.5, // cosine of the widest angle off facing it a press works at (60°)
        reachTime: 0.25, // seconds to get onto the rungs
        upRate: 1.8, // m/s
        downRate: 2.2, // m/s
        rung: 0.3, // metres between rungs: a footstep each
        topGap: 0.65, // how far below the top a body stops, feet: the mantle over the top does the rest
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
        pivot: 0.55, // the pivot a lying body turns on: this far back from the top of its head (near the chest)
        chainSpacing: 0.25, // lying, its collision chain has a circle at least this often
      },
      // Carrying and dragging a body (sim/game/use.ts): standing it rides the shoulder; crouched it
      // drags behind. Slow, and dragging scrapes. The lab's own numbers.
      carry: { reach: 1.7, speed: 1.6, dragSpeed: 0.9, shoulder: 1.15, trail: 1.1, facingCos: 0.5, underfoot: 0.4, hideBy: 1, hideBelow: 0.3, reachHeight: 1.1, grabAt: 0.2, trailGap: 0.1 },
      // Lying down (sim/body/motor.ts): the turn the body's axis makes toward where it looks, rad/s,
      // by the largest step that keeps every part of it clear. No game publishes this; it's the lab's.
      prone: { turnRate: 2 },
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
      ladder: { standoff: 0.05, reach: 1.05, topReach: 2.2, footing: 0.6, facingCos: 0.5, reachTime: 0.25, upRate: 1.8, downRate: 2.2, rung: 0.3, topGap: 0.65 },
      parts: {
        headRadius: 0.115,
        torsoRadius: 0.22,
        legRadius: 0.15,
        neck: 0.24,
        hip: 0.5,
        proneLength: 1.75,
        pivot: 0.55,
        chainSpacing: 0.25,
      },
      carry: { reach: 1.7, speed: 1.6, dragSpeed: 0.9, shoulder: 1.15, trail: 1.1, facingCos: 0.5, underfoot: 0.4, hideBy: 1, hideBelow: 0.3, reachHeight: 1.1, grabAt: 0.2, trailGap: 0.1 },
      prone: { turnRate: 2 },
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
    ladder: 0.45, // a rung under a step: loudness, times the surface
    carry: 1.8, // a loaded step, at carrying pace, is about as loud as walking (sim/game/use.ts)
    // Dragging something: loudness of the scrape, each step, by surface. Noisy on gravel (design doc).
    drag: { grass: 0.35, dirt: 0.6, gravel: 1.55, rock: 1.0, water: 1.1, metal: 1.4, wood: 0.9 },
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
      // A flash from a lens (A9): the glint at or above `min` is seen from this far by a guard
      // looking that way (his core cone, or a marksman's far one), through foliage letting
      // through at least `through`, with nothing solid in the way.
      glint: { min: 0.5, range: 600, through: 0.15 },
      notice: { range: 30, stop: 1.2, through: 0.15 }, // equipment stopped or a door out of place: how far, how near the line may end, and how much foliage it sees through
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
      // The flood carries a sound round buildings this far along its path; beyond, it
      // arrives by the straight line only (A11: a shout's whole flood cost a frame).
      floodReach: 25,
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
      cry: 0.8, // a comrade's cry heard: searching
      body: 0.8, // a body seen: searching (design doc: the strongest stimulus)
      glint: 0.55, // a flash from a lens: suspicious
      muzzle: 0.8, // a muzzle flash, seen: searching
      whistle: 0.8, // the camp's whistle: searching
      outage: 0.55, // equipment stopped, that was running: suspicious
      door: 0.3, // a door not as it was left: curious
      keepBody: 120, // seconds a body stays in his mind (a sound or a shot: hearing.keep)
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
    // Sandbox (A10): a noise dropped where the player looks, from the debug view.
    sandbox: { noise: 30, reach: 400 },
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
      nodesPerTick: 12000, // and once a tick's searches have expanded this many cells, the rest wait for the next (a search under way always finishes)
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
      flee: { pace: 4.6, arrive: 1.2, boardGap: 0.8, drive: 9, swerve: 4, swerveBy: [0, 0.5, -0.5, 1, -1, 2, -2], giveWay: 4 }, // the target's run for the vehicle at lockdown (m/s, how close counts as aboard, the gap beside it to get in; then its speed on the way out, how far off the road it goes round someone, sideways per metre forward in the order it tries them, and the seconds before it barges through)
      retry: 10, // seconds before he'll try the alarm again, after a run that came to nothing
      claimWithin: 3, // metres from the box for someone's shout to count as claiming it
      sirenHeight: 3, // metres above the box's foot that the horn sounds from
    },
    // Doors (E7, A9): they stand open until someone shuts one.
    doors: {
      reach: 1.8, // metres from the body to the doorway, for a press of use
      underfoot: 0.5, // metres inside which he needn't be facing it
      reachHeight: 1.2, // metres of height between the body and the doorway
      facingCos: 0.5,
      guardReach: 1.1, // metres at which a walking guard opens a shut door
      radius: 14, // metres a door is heard at
    },
    // The first fight (Lab F, docs/camp-engine.md): how a camp that's ready for it answers a shot. Only camps with `fights` do this.
    fight: {
      drill: {
        within: 4, // seconds a shot stays news enough to get out of the line for
        listen: 1.2, // seconds he waits for the report after a crack or a strike, before going on what he has
        maxRun: 16, // metres of path a man will run to get out of the line
        cells: 500, // cells one search for a spot may look at (rule 18)
        bearingDeg: 20, // listed perches this close to the believed bearing are the ones to hide from
        standTo: { min: 45, max: 60 }, // seconds after the last shot before men come back out
      },
      whistle: { radius: 600, every: 6 }, // metres it carries, and the seconds between blasts: it's how a person on a ridge knows the camp has reacted
      suppress: { range: 480, react: 2.5, every: 2.2, forget: 25 }, // tower men firing at where they believe he is: metres, seconds to the first round, between rounds, and how long a shot stays worth answering
      spreadDeg: { marksman: 0.3, other: 1.1 }, // the error radius of a round fired by a camp that fights, degrees
      nearMiss: { radius: 3, knock: 1.4 }, // metres from your head that a round counts as a near miss, and the seconds it knocks you off your rest
      flash: { range: 520, suppressed: 140 }, // metres a muzzle flash can be seen at, by someone looking that way
    },
    getOut: { radius: 15 }, // metres from the way out at which you've got out (Lab F)
    // Sabotage (E7): held at arm's length, with nothing but your hands.
    sabotage: {
      reach: 1.6, // metres from the body to the thing
      underfoot: 0.5, // metres inside which he needn't be facing it
      reachHeight: 1.2, // metres between the thing and waist height
      facingCos: 0.5, // cosine of how far off to the side it can be
      seconds: { generator: 2.5, radio: 2, vehicle: 4 },
    },
    // Reinforcements (E8): called at lockdown, arriving after a delay as a squad that hunts.
    reinforce: {
      delay: 90, // seconds from lockdown to their arrival
      count: 3, // guards in the squad
      spread: 3.5, // metres between them when they arrive
      edgeMargin: 14, // metres inside the map's edge where they arrive, up the camp's road
      truck: { length: 6.2, width: 2.3, height: 2.9, every: 25, stopShort: 14, dropBehind: 1.5, holdOff: 1 }, // their truck (metres): its size, a waypoint this often along the road, where it stops short of the gate, how far behind it the squad gets down; and the seconds it holds off if someone is standing where it would appear
    },
    // Counter-sniper (E8): triangulating shots from bearings (triangulate.ts) and hunting the shooter.
    sniper: {
      fusion: { half: 640, cells: 128, rangeMin: 120, rangeMax: 560 }, // the commander's grid around the camp, metres, and its ring of plausible perches
      keep: 90, // seconds of bearings it fuses
      maxBearings: 16, // bearings it keeps
      earSigmaDeg: 4, // the error of a bearing taken by ear, from the guard's own stream, on top of where it seemed to be
      minSigmaDeg: 1.5, // nobody's ear is sharper than this
      maxSigmaDeg: 25, // a bearing worse than this is said to be no bearing at all
      sweepSeconds: 8, // how long a marksman sweeps a believed perch
      sweepHeadDeg: 20, // how far his head swings to either side of it
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
      coverCloser: 2, // metres nearer the threat that a cover spot may be and still be worth taking
      coverCloserCost: 4, // square metres of extra run it counts as, if it is nearer
      underFireFor: 3, // seconds a nearby strike keeps him looking for cover
      underFireWithin: 18, // metres: a strike this close counts as being shot at
      flankLinger: 3, // seconds he stands and looks when he has worked round
      flankDistance: 18, // metres to the side of the believed position he works toward, moving up
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
    // The weights of the options that don't come from a role or a curve (brain.ts).
    weights: {
      orderCurious: 0.9, // an order, to a guard who's only curious
      reportSuspicious: 0.2, // stopping to call it in, while only suspicious
      workerAlarm: 0.9, // a worker's run for the box, while searching
      coverNoFight: 0.6, // getting under cover, for one who doesn't fight
      holdSearching: 0.2, // standing his ground, while searching
      holdCombat: 0.25, // standing his ground, in combat
      searchStale: 0.25, // a search's pull once the belief has gone cold
    },
    // Reports (E4): what guards tell each other and the camp (reports.ts, game/comms.ts).
    comms: {
      talk: 1.6, // seconds a radio call lasts: long enough to be interrupted
      netDelay: 1.5, // seconds from a finished call to its delivery across the net
      talkRadius: 14, // metres his voice carries while he's on the radio
      shoutRadius: 55, // metres a shout carries
      keep: 25, // seconds a guard remembers what he's been told
      maxTold: 8, // reports a guard's memory holds
      reportEvery: 20, // seconds between his calls about the same thing
      level: { contact: 0.8, heard: 0.32, shot: 0.8, body: 0.82, missing: 0.4, clear: 0, claim: 0, outage: 0.32 }, // what a report raises him to
      radius: { contact: 4, heard: 18, shot: 22, body: 6, missing: 8, clear: 12, claim: 8, outage: 6 }, // metres of uncertainty each kind adds to the speaker's
      clearRadius: 18, // metres a searcher's "clear" report wipes from the map
      // Claims (Blacklist): "I've got it": one guard goes, those who hear him don't all pile in.
      claimWithin: 14, // metres between a claim's spot and his own for it to count
      claimFor: 15, // seconds a claim holds
      claimedWeight: 0.15, // how much a claim by someone else leaves of his own wish to go
      heardReach: 45, // metres: an unverified report only stirs guards this near what it's about; farther ones just know of it
    },
    // The camp's search map (E4, searchMap.ts): a window of cells around the camp.
    searchMap: {
      cells: 64,
      cell: 5, // metres: the map reaches 160 m from the camp's centre, past where an intruder who broke contact has got to
      spreadRate: 0.5, // share of a cell's belief that bleeds to its neighbours per second,
      updateHz: 2, // applied this many times a second (rule 17)
      seenStep: 1, // metres between the samples of a line of sight over the ground
      seenHeight: 0.3, // height above the ground that has to be in view for a spot to count as seen
      clearRays: 400, // cells one clearing may test
      injectRadius: 8, // metres: the least a report can be spread over
    },
    // The camp (E5, commander.ts): alert levels, tasks, pacing and search cycles.
    camp: {
      planEvery: 0.5, // seconds between the commander's plans
      keepOrder: 25, // seconds an order stays good if nothing renews it
      noOfficerEvery: 3, // seconds between plans with no officer to run them: searches turn sloppy
      // How many guards it may send: the pacing layer's role slots, by the camp's level.
      coverSeconds: 25, // seconds a guard told to get under cover stays there, after a body turns up in the open
      rolePenalty: 20, // metres of extra walk a wholly unsuited role counts as, when choosing who goes
      rosterTrust: 20, // seconds the camp believes where it last heard a guard was, before falling back on his routine
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
        retry: 5, // seconds before trying again when there's no set or no operator
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
    leanRollDeg: 22, // degrees the view tilts per metre of lean: 4 at a peek, 9 at a full lean
    fogDensity: 0.0012, // exp² fog: about 30% at 500 m, 75% at 1 km
  },
};

export type Tuning = typeof defaultTuning;
/** The slice of tuning that generation reads; generation code never sees the rest. */
export type GenTuning = Tuning['gen'];
