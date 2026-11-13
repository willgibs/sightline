import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { emptyRoute, emptySteering, followRoute, navigatorOf, routeLength, type Feel, type Route } from '../src/sim/brain/nav';
import { plainTuning, yardOnly } from '../src/lab/experiments/variety';
import { campMission } from '../src/sim/generation';
import { generateWorld } from '../src/sim/generation/world';
import { player } from '../src/sim/game/entities';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { turnTowards, yawFromDirection } from '../src/sim/kernel/core/math';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld } from './fixtures';

/**
 * Navigation (E1): A* over the two grid layers with an iteration budget, string-pulled
 * into waypoints the motor walks, and a walk that gets out of the way of what it can't
 * see on the grid (a body in its path).
 */

const wall = (x: number, z: number, hx: number, hz: number): ColliderInput => ({ kind: 'box', x, z, y0: -0.3, y1: 3, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock });

/** A square room (±10 m) with a 1.2 m doorway in its east wall, in the middle of a field. */
function room(): World {
  const colliders = [
    wall(0, -10, 10.25, 0.25),
    wall(0, 10, 10.25, 0.25),
    wall(-10, 0, 0.25, 10.25),
    // The east wall, in two pieces leaving a doorway at z in [-0.6, 0.6].
    wall(10, -5.65, 0.25, 5.05),
    wall(10, 5.65, 0.25, 5.05),
  ];
  return testWorld({ size: 120, colliders, spawn: { x: -30, z: 30 } });
}

function waypoints(r: Route): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < r.points.length; i += 2) out.push([r.points[i]!, r.points[i + 1]!]);
  return out;
}

describe('navigation', () => {
  it('finds a route through a doorway the map layer cannot see, and pulls it into few waypoints', () => {
    const world = room();
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    const work = { rays: 0, nodes: 0, bodies: 0 };
    expect(nav.find(-5, 0, 30, 0, { work }, r)).toBe('found');
    const pts = waypoints(r);
    expect(pts.length).toBeLessThanOrEqual(4);
    // It goes through the doorway: some waypoint near it, or a straight line through it.
    let cross = false;
    let px = -5;
    let pz = 0;
    for (const [x, z] of pts) {
      if ((px < 10 && x >= 10) || (px >= 10 && x < 10)) {
        const t = (10 - px) / (x - px);
        const zc = pz + (z - pz) * t;
        if (Math.abs(zc) < 0.6) cross = true;
      }
      px = x;
      pz = z;
    }
    expect(cross).toBe(true);
    expect(work.nodes).toBeGreaterThan(0);
    // Ends at the goal.
    const [lx, lz] = pts[pts.length - 1]!;
    expect(Math.hypot(lx - 30, lz)).toBeLessThan(0.5);
  });

  it('never cuts what the search went around: every pulled segment is clear', () => {
    const world = room();
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(-8, -8, 8, 8, {}, r)).toBe('found');
    let px = -8;
    let pz = -8;
    for (const [x, z] of waypoints(r)) {
      expect(nav.clear(px, pz, x, z)).toBe(true);
      px = x;
      pz = z;
    }
  });

  it('ends as near as a body can stand when the goal is inside something solid', () => {
    const world = testWorld({ size: 120, colliders: [wall(0, 0, 1.5, 1.5)], spawn: { x: -30, z: 30 } });
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(-12, 0, 0, 0, { work: { rays: 0, nodes: 0, bodies: 0 } }, r)).toBe('found');
    const [ex, ez] = waypoints(r).at(-1)!;
    expect(Math.abs(ex) > 1.5 || Math.abs(ez) > 1.5).toBe(true);
    expect(Math.hypot(ex, ez)).toBeLessThan(4.5);
  });

  it('says there is no route where there is none, and when a budget runs out', () => {
    // A sealed room: walls all round.
    const world = testWorld({
      size: 80,
      colliders: [wall(0, -5, 5.25, 0.25), wall(0, 5, 5.25, 0.25), wall(-5, 0, 0.25, 5.25), wall(5, 0, 0.25, 5.25)],
      spawn: { x: -30, z: 30 },
    });
    const nav = navigatorOf(world, T);
    const r = emptyRoute();
    expect(nav.find(0, 0, 25, 25, {}, r)).toBe('no-route');
    const small = structuredClone(T);
    small.brain.nav.siteExpansions = 4;
    small.brain.nav.mapExpansions = 2;
    const tight = navigatorOf(room(), small);
    expect(tight.find(-5, 0, 30, 0, {}, r)).toBe('out-of-budget');
    expect(r.points.length).toBe(0);
  });

  it('knows at once that ground can’t be reached, where a search would look at everything first', () => {
    // A sealed room in a field: the field is forty thousand cells of somewhere else to look.
    const world = testWorld({
      size: 120,
      colliders: [wall(0, -5, 5.25, 0.25), wall(0, 5, 5.25, 0.25), wall(-5, 0, 0.25, 5.25), wall(5, 0, 0.25, 5.25)],
      spawn: { x: -30, z: 30 },
    });
    const r = emptyRoute();
    const aimed = { rays: 0, nodes: 0, bodies: 0 };
    expect(navigatorOf(world, T).find(25, 25, 0, 0, { work: aimed }, r)).toBe('no-route');
    expect(aimed.nodes).toBe(0);
    expect(r.points.length).toBe(0);
    // The straight-line estimate alone has to look: it's what the labels save.
    const plain = structuredClone(T);
    plain.brain.nav.landmarks = 0;
    const looked = { rays: 0, nodes: 0, bodies: 0 };
    expect(navigatorOf(world, plain).find(25, 25, 0, 0, { work: looked }, r)).not.toBe('found');
    expect(looked.nodes).toBeGreaterThan(10_000);
  });

  it('goes round a camp’s walls on a fraction of the cells, by a route no longer', () => {
    // The plain yard's walls and lanes, which is what the cells and routes below were measured on.
    const world = generateWorld(campMission('LEB-2534'), yardOnly(T));
    const plain = structuredClone(T);
    plain.brain.nav.landmarks = 0;
    // Two tunings share a world's navigator, so each asks all its routes in turn.
    const L = world.grid.site;
    const posts = world.camp.guards.map((g) => ({ x: g.x, z: g.z })).filter((p) => p.x > L.x0 && p.z > L.z0 && p.x < L.x0 + L.nx * L.cell && p.z < L.z0 + L.nz * L.cell);
    const pairs: Array<[number, number]> = [];
    for (let a = 0; a < posts.length; a++) for (let b = 0; b < posts.length; b++) if (a !== b) pairs.push([a, b]);
    const ask = (tuning: typeof T): { nodes: number; worst: number; metres: number; found: number } => {
      const nav = navigatorOf(world, tuning);
      const total = { nodes: 0, worst: 0, metres: 0, found: 0 };
      for (const [a, b] of pairs) {
        const work = { rays: 0, nodes: 0, bodies: 0 };
        const r = emptyRoute();
        if (nav.find(posts[a]!.x, posts[a]!.z, posts[b]!.x, posts[b]!.z, { work }, r) === 'found') {
          total.found++;
          total.metres += routeLength(r, posts[a]!.x, posts[a]!.z);
        }
        total.nodes += work.nodes;
        total.worst = Math.max(total.worst, work.nodes);
      }
      return total;
    };
    const before = ask(plain);
    const after = ask(T);
    expect(pairs.length).toBeGreaterThan(20);
    // Every pair of posts has a route, and none of them is found by giving up on the fine layer.
    expect(after.found).toBe(pairs.length);
    // Post to post is mostly open yard, where a straight aim is already good: half the cells.
    expect(after.nodes).toBeLessThan(before.nodes * 0.6);
    expect(after.worst).toBeLessThan(before.worst);
    // The same cost on the grid; the pulled waypoints may differ by a cell here and there.
    expect(after.metres).toBeLessThan(before.metres * 1.01);
    // The routes a fight really asked for and choked on (a sniper on this camp, four minutes):
    // a man three metres from where he's going with a wall between, and two across the camp.
    // Each ran the fine search out of its budget, fell back on the coarse layer and searched twice more.
    for (const [ax, az, bx, bz] of [
      [58.7, -38.7, 57.2, -36.1],
      [-9.2, -17.3, 42.5, -42.5],
      [52.0, -52.3, -33.2, -9.5],
    ] as const) {
      const was = { rays: 0, nodes: 0, bodies: 0 };
      const now = { rays: 0, nodes: 0, bodies: 0 };
      const r = emptyRoute();
      navigatorOf(world, plain).find(ax, az, bx, bz, { work: was }, r);
      expect(navigatorOf(world, T).find(ax, az, bx, bz, { work: now }, r), `${ax}, ${az}`).toBe('found');
      expect(was.nodes, `${ax}, ${az}`).toBeGreaterThanOrEqual(plain.brain.nav.siteExpansions);
      expect(now.nodes, `${ax}, ${az}`).toBeLessThan(T.brain.nav.nodesPerTick);
    }
  }, 120_000);

  it('finds the same route every time, cell for cell', () => {
    const world = room();
    const a = emptyRoute();
    const b = emptyRoute();
    navigatorOf(world, T).find(-7, 3, 26, -9, {}, a);
    navigatorOf(world, T).find(-7, 3, 26, -9, {}, b);
    expect(a.points).toEqual(b.points);
  });

  it('goes coarse across the valley, refining inside the camp, and every segment is walkable', () => {
    // The plain valley this route was first checked on: on other valleys a raw diagonal step can
    // clip a tree (nav.ts's edges check the two ways round a corner, not the corner itself).
    const world = generateWorld(missionSpec('TAL-4471'), plainTuning(T));
    const nav = navigatorOf(world, T);
    const site = world.camp.site;
    const r = emptyRoute();
    // From inside the camp out to the overlook.
    const dx = world.spawn.x - site.x;
    const dz = world.spawn.z - site.z;
    const d = Math.hypot(dx, dz);
    const work = { rays: 0, nodes: 0, bodies: 0 };
    expect(nav.find(site.x, site.z, world.spawn.x, world.spawn.z, { work }, r)).toBe('found');
    expect(routeLength(r, site.x, site.z)).toBeGreaterThan(d * 0.9);
    let px = site.x;
    let pz = site.z;
    for (const [x, z] of waypoints(r)) {
      expect(nav.clear(px, pz, x, z), `${px.toFixed(1)},${pz.toFixed(1)} to ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      px = x;
      pz = z;
    }
    expect(work.nodes).toBeLessThan(T.brain.nav.mapExpansions + 2 * T.brain.nav.siteExpansions);
  });
});

/**
 * Guards under a test brain that walks a route with the motor: its order every tick from
 * followRoute, from a route found once. Bodies obey every rule the player's do.
 */
function walkers(world: World, goals: Array<{ x: number; z: number }>, opts: { pace?: number; feel?: boolean } = {}): { sim: Simulation; routes: Route[]; done: boolean[]; arrived: number[] } {
  const routes = goals.map(() => emptyRoute());
  const done = goals.map(() => false);
  const arrived = goals.map(() => -1);
  const steer = emptySteering();
  const pace = opts.pace ?? T.bodies.guard.speed.walk;
  const feel: Feel = {};
  const brain: System = {
    name: 'test-walker',
    phase: 'decide',
    after: ['guard-brains'],
    reads: ['guard.body', 'guard.guard'],
    writes: ['guard.guard.order'],
    emits: [],
    run(ctx) {
      for (const g of ctx.index.of('guard')) {
        const k = g.guard.spawn;
        const r = routes[k]!;
        const o = g.guard.order;
        if (done[k]) {
          o.tick = ctx.tick + 1;
          o.wishX = 0;
          o.wishZ = 0;
          o.gait = 'idle';
          continue;
        }
        if (r.points.length === 0 && arrived[k]! < 0) {
          if (navigatorOf(ctx.world, ctx.tuning).find(g.body.x, g.body.z, goals[k]!.x, goals[k]!.z, { work: ctx.work }, r) !== 'found') throw new Error(`no route for guard ${k}`);
        }
        // With `feel`, as a brain walks (brain/moves.ts): he knows when he's pressed against something, and which side has room.
        const nav = navigatorOf(ctx.world, ctx.tuning);
        if (opts.feel) {
          const asked = Math.hypot(o.wishX, o.wishZ);
          feel.pressed = asked > 0 && g.body.speed < ctx.tuning.brain.nav.creep * asked;
          feel.open = nav.open;
        }
        const w = followRoute(r, g.body.x, g.body.z, pace, g.id, ctx.tick, ctx.tuning, steer, opts.feel ? feel : undefined);
        if (w === 'arrived') {
          done[k] = true;
          arrived[k] = ctx.tick;
          o.wishX = 0;
          o.wishZ = 0;
          o.gait = 'idle';
          o.tick = ctx.tick + 1;
          continue;
        }
        o.tick = ctx.tick + 1;
        o.wishX = steer.wishX;
        o.wishZ = steer.wishZ;
        o.gait = pace > ctx.tuning.bodies.guard.speed.walk ? 'sprint' : 'walk';
        o.yaw = turnTowards(g.body.yaw, yawFromDirection(steer.dirX, steer.dirZ), 8 * ctx.dt);
        o.headYaw = 0;
      }
    },
  };
  const sim = new Simulation(world, T, withSystem(SYSTEMS, brain));
  return { sim, routes, done, arrived };
}

function hold(s: Simulation, seconds: number, stop: () => boolean = () => false): number {
  const raw = neutralInput();
  let i = 0;
  for (; i < seconds * 30 && !stop(); i++) s.step(raw);
  return i;
}

function guardAt(x: number, z: number, id = 0): ReturnType<typeof testGuard> {
  return testGuard({ id, role: 'sentry', x, y: 0, z, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 });
}

describe('walking a route', () => {
  it('walks through the door and arrives, the motor carrying him', () => {
    const colliders = [
      wall(0, -10, 10.25, 0.25),
      wall(0, 10, 10.25, 0.25),
      wall(-10, 0, 0.25, 10.25),
      wall(10, -5.65, 0.25, 5.05),
      wall(10, 5.65, 0.25, 5.05),
    ];
    const world = testWorld({ size: 120, colliders, spawn: { x: -30, z: 30 }, camp: { structures: [], guards: [guardAt(-6, 2)], fenceHalf: 0 } });
    const goal = { x: 30, z: 0 };
    const { sim, done, arrived } = walkers(world, [goal]);
    const ticks = hold(sim, 60, () => done[0]!);
    expect(done[0]).toBe(true);
    expect(Math.hypot(sim.guards[0]!.body.x - goal.x, sim.guards[0]!.body.z - goal.z)).toBeLessThan(0.8);
    expect(ticks / 30).toBeLessThan(40);
    expect(arrived[0]).toBeGreaterThan(0);
  });

  it('steps around a body in the way instead of shoving through it', () => {
    // A guard walks straight along a line toward a goal; the player stands in the way on it.
    const world = testWorld({ size: 120, spawn: { x: -30, z: 30 }, camp: { structures: [], guards: [guardAt(-10, 0)], fenceHalf: 0 } });
    const { sim, done } = walkers(world, [{ x: 10, z: 0 }]);
    placePlayer(sim, 0, 0, -1, 0);
    let closest = Infinity;
    let pushed = 0;
    const start = { x: sim.player.x, z: sim.player.z };
    const raw = neutralInput();
    let i = 0;
    for (; i < 45 * 30 && !done[0]; i++) {
      sim.step(raw);
      const g = sim.guards[0]!.body;
      closest = Math.min(closest, Math.hypot(g.x - sim.player.x, g.z - sim.player.z));
      pushed = Math.max(pushed, Math.hypot(sim.player.x - start.x, sim.player.z - start.z));
    }
    expect(done[0], `guard ended at ${sim.guards[0]!.body.x.toFixed(2)}, ${sim.guards[0]!.body.z.toFixed(2)}`).toBe(true);
    // The guard never pushed the player aside, and never tried to stand inside him.
    expect(pushed).toBeLessThan(0.05);
    expect(closest).toBeGreaterThan(0.45);
    expect(sim.guards[0]!.body.x).toBeGreaterThan(9);
    expect(player(sim.index).id).toBe(1);
  });

  it('two guards walking head-on pass each other', () => {
    const world = testWorld({
      size: 120,
      spawn: { x: -30, z: 30 },
      camp: { structures: [], guards: [guardAt(-10, 0, 0), guardAt(10, 0.02, 1)], fenceHalf: 0 },
    });
    const { sim, done } = walkers(world, [{ x: 10, z: 0 }, { x: -10, z: 0 }]);
    hold(sim, 40, () => done[0]! && done[1]!);
    expect(done).toEqual([true, true]);
  });
});

/**
 * A man who sets off at a run with a mate in his way (the owner's camps, Nov 12: an officer took up a chase from behind a
 * wall with another man crouched on the first steps of his route, and was eight seconds getting round him). The route knows
 * nothing of bodies, so what gets him round is the walk: he knows he's pressed against something, steps a body's width to
 * the side that has room, and has his time again from where that leaves him.
 */
describe('a mate in the way of a run', () => {
  const N = T.brain.nav;
  const hz = T.sim.tickHz;
  const RUN = T.brain.firefight.paces.bound;

  /** A straight route east from the origin, and a walk along it that the caller moves by hand. */
  const straight = (): Route => ({ ...emptyRoute(), points: [20, 0] });

  it('pressed against something, a centimetre now and then is not progress', () => {
    const steer = emptySteering();
    // He slides 2.5 cm nearer every half second: by the distance alone that's a walk that never stalls.
    const slide = (feel: Feel | undefined): number => {
      const r = straight();
      for (let t = 1; t <= 6 * hz; t++) {
        followRoute(r, 5 + 0.025 * Math.floor(t / 15), 0, RUN, 2, t, T, steer, feel);
        if (r.stalls > 0) return t / hz;
      }
      return Infinity;
    };
    expect(slide(undefined)).toBe(Infinity);
    expect(slide({ pressed: false })).toBe(Infinity);
    const stalled = slide({ pressed: true });
    expect(stalled).toBeGreaterThanOrEqual(N.stallSeconds);
    expect(stalled).toBeLessThan(N.stallSeconds + 0.2);
  });

  it('after one step aside for it, sliding counts again: he pushes on through where there is no way round', () => {
    const steer = emptySteering();
    const r = straight();
    let t = 1;
    const at = (): number => 5 + 0.025 * Math.floor(t / 15);
    for (; r.stalls === 0; t++) followRoute(r, at(), 0, RUN, 2, t, T, steer, { pressed: true });
    // The step gets him nowhere (something is there too), and then he is sliding as before.
    for (; r.sideUntil >= 0; t++) followRoute(r, at(), 0, RUN, 2, t, T, steer, { pressed: true });
    const from = t;
    for (; t < from + 8 * hz; t++) followRoute(r, at(), 0, RUN, 2, t, T, steer, { pressed: true });
    expect(r.stalls).toBe(N.creepSteps);
    // Until he reaches a waypoint: the next leg starts afresh.
    expect(N.creepSteps).toBe(1);
  });

  it('a walk taken up again from a standstill starts its leg with a measure, pressed or not', () => {
    const steer = emptySteering();
    const r = straight();
    // The first tick of a leg always counts, whatever he feels: a route found long ago isn't a stall the moment he walks it.
    expect(followRoute(r, 5, 0, RUN, 2, 10 * hz, T, steer, { pressed: true })).toBe('walking');
    expect(r.stalls).toBe(0);
    expect(steer.wishX).toBeCloseTo(RUN);
  });

  it('the step is no longer than gets him round a truck, at any pace, and he has his time again when it is over', () => {
    const steer = emptySteering();
    for (const pace of [T.brain.paces.investigate, T.brain.paces.hurry, RUN]) {
      const r = straight();
      let t = 1;
      // Held still until he stalls.
      for (; r.stalls === 0; t++) followRoute(r, 5, 0, pace, 2, t, T, steer, { pressed: true });
      expect(r.sideUntil).toBeGreaterThan(t);
      // He steps the way he's told to, as fast as he was going, and nothing is in his way now.
      let z = 0;
      let x = 5;
      const began = t;
      for (; r.sideUntil >= 0 && t < began + 5 * hz; t++) {
        x += steer.wishX / hz;
        z += steer.wishZ / hz;
        followRoute(r, x, z, pace, 2, t, T, steer, { pressed: false });
      }
      const took = (t - began) / hz;
      // No further than the step and one tick's travel, and never longer than `sideSeconds`.
      expect(Math.abs(z), `at ${pace} m/s`).toBeLessThanOrEqual(N.sideStep + pace / hz + 1e-9);
      expect(took, `at ${pace} m/s`).toBeLessThanOrEqual(N.sideSeconds + 2 / hz);
      // Up to a hurry the time runs out first, as it always did. At a run the distance does, in half the time.
      expect(took, `at ${pace} m/s`).toBeLessThanOrEqual(Math.min(N.sideSeconds, N.sideStep / pace) + 2 / hz);
      if (pace <= T.brain.paces.hurry) expect(took, `at ${pace} m/s`).toBeGreaterThanOrEqual(N.sideSeconds - 1 / hz);
      else expect(took).toBeLessThan(N.sideSeconds * 0.6);
      // And the clock starts again: stopped dead once more, he gets the whole of `stallSeconds` before the next step.
      const again = t;
      for (; r.stalls === 1 && t < again + 5 * hz; t++) followRoute(r, x, z, pace, 2, t, T, steer, { pressed: true });
      expect((t - again) / hz).toBeGreaterThanOrEqual(N.stallSeconds - 1 / hz);
    }
  });

  it('steps to the side the ground leaves room on, where only one does', () => {
    const steer = emptySteering();
    const stall = (id: number, open: Feel['open']): number => {
      const r = straight();
      for (let t = 1; r.stalls === 0; t++) followRoute(r, 5, 0, RUN, id, t, T, steer, { pressed: true, open });
      return Math.sign(steer.wishZ);
    };
    // Heading east, +z is his right. By his own rule guard 2 goes left first and guard 3 right.
    expect(stall(2, undefined)).toBe(-1);
    expect(stall(3, undefined)).toBe(1);
    expect(stall(2, () => true)).toBe(-1);
    expect(stall(2, () => false)).toBe(-1);
    // A wall on his left, a wall on his right: the step itself is shut.
    const step = (az: number): boolean => az === 0;
    expect(stall(2, (_ax, az, _bx, bz) => !step(az) || bz > 0)).toBe(1);
    expect(stall(3, (_ax, az, _bx, bz) => !step(az) || bz > 0)).toBe(1);
    expect(stall(3, (_ax, az, _bx, bz) => !step(az) || bz < 0)).toBe(-1);
    // Room to step either way, and from his left he couldn't walk on to his waypoint: the end of a wall he'd be behind.
    expect(stall(2, (_ax, az) => step(az) || az > 0)).toBe(1);
    expect(stall(3, (_ax, az) => step(az) || az < 0)).toBe(-1);
    // A side he can step to and not walk on from still beats one he can do neither with.
    expect(stall(3, (_ax, az, _bx, bz) => step(az) && bz < 0)).toBe(-1);
    // And walking on counts for more than the step: against a wall's corner no step looks clear, and one side still leads on.
    expect(stall(2, (_ax, az, _bx, bz) => (step(az) ? bz < 0 : az > 0))).toBe(1);
    expect(stall(2, (_ax, az) => !step(az) && az > 0)).toBe(1);
  });

  it('wedged between a mate and a wall, he is round him and running again within two seconds', () => {
    // A wall along the north of his way, and a mate standing on it with less than a body's width between him and the wall.
    // The runner meets him a little to the wall's side of head-on, so sliding off him takes the runner into the gap.
    const colliders = [wall(0, -0.25, 6, 0.25)];
    const world = testWorld({ size: 120, colliders, spawn: { x: -30, z: 30 }, camp: { structures: [], guards: [guardAt(-8, 0.5, 0), guardAt(0, 0.55, 1)], fenceHalf: 0 } });
    const { sim, done } = walkers(world, [{ x: 8, z: 0.5 }, { x: 0, z: 0.55 }], { pace: RUN, feel: true });
    const raw = neutralInput();
    const runner = sim.guards[0]!.body;
    const mate = sim.guards[1]!.body;
    const stood = { x: mate.x, z: mate.z };
    let met = -1;
    let past = -1;
    let shoved = 0;
    for (let i = 0; i < 12 * hz && !done[0]; i++) {
      sim.step(raw);
      if (met < 0 && Math.hypot(runner.x - mate.x, runner.z - mate.z) < 0.65) met = sim.tick;
      if (past < 0 && runner.x > mate.x + 1 && runner.speed > RUN * 0.9) past = sim.tick;
      shoved = Math.max(shoved, Math.hypot(mate.x - stood.x, mate.z - stood.z));
    }
    expect(met, 'he ran into his mate').toBeGreaterThan(0);
    expect(past, 'and got past him').toBeGreaterThan(0);
    expect((past - met) / hz).toBeLessThan(2);
    expect(done[0]).toBe(true);
    // Round him, not through him.
    expect(shoved).toBeLessThan(0.25);
    // Sixteen metres at a run is three seconds. With the mate in the way it's under five.
    expect(sim.tick / hz).toBeLessThan(5);
  });
});

describe('routes off the camp', () => {
  it('reaches the ground that overlooks the camp from every post, and leaves by the side it is going to', () => {
    // A camp with no wall of its own to go round: what this measures is the fields, not the compound.
    const world = generateWorld(campMission('LEB-2534'), yardOnly(T));
    const nav = navigatorOf(world, T);
    const route = emptyRoute();
    const perches = world.report.camp!.perches as ReadonlyArray<{ x: number; z: number }>;
    let found = 0;
    let tried = 0;
    let worst = 0;
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      for (const p of perches) {
        tried++;
        if (nav.find(g.x, g.z, p.x, p.z, {}, route) !== 'found') continue;
        found++;
        worst = Math.max(worst, routeLength(route, g.x, g.z) / Math.hypot(p.x - g.x, p.z - g.z));
      }
    }
    expect(found / tried).toBeGreaterThan(0.95);
    // Leaving by whichever edge is nearest, a route to the far side goes round the whole camp.
    expect(worst).toBeLessThan(2);
  }, 60_000);
});
