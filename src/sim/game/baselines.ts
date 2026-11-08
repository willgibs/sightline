import type { Tuning } from '../../config/tuning';
import { emptyRoute, emptySteering, followRoute, navigatorOf, type Route } from '../brain';
import { dcos, dsin } from '../kernel/core/detmath';
import { turnTowards, yawFromDirection } from '../kernel/core/math';
import { Rng } from '../kernel/core/rng';
import { neutralInput } from '../kernel/input';
import { withSystem, type System } from '../kernel/systems';
import { WaypointDriver, type Waypoint } from './bots/waypoints';
import { giveBrains } from './brains';
import { campCheckins, campCommander, commsVoice, giveCommander, tell } from './comms';
import { PERCEPTION, giveSenses } from './perception';
import { placePlayer } from './setup';
import { Simulation } from './sim';
import { SYSTEMS } from './systems';
import { campWorld } from './scenes/campBrain';

/**
 * The bench's search-competence baselines (E12): Xu and Verbrugge's four, run in the
 * lab's camp, beside the honest brain, on the same pursuit: guards believe the intruder
 * was at a last known position; he creeps away; they have 60 s to find him again. How
 * often each policy re-finds him is the bench's competence metric. The baselines
 * steer guards with a system in 'decide' that overrides their orders, so they use the
 * same motor, the same perception and the same detection as the honest brain:
 *   random     wander to random spots near the camp
 *   plain      keep routine, and send one guard to the last known position once
 *   staleness  head for the area nobody has looked at longest
 *   omniscient always go to the player's true position (it cheats, as the baseline must)
 */
export type Policy = 'honest' | 'random' | 'plain' | 'staleness' | 'omniscient';
export const POLICIES: readonly Policy[] = ['honest', 'random', 'plain', 'staleness', 'omniscient'];

/** Runs one pursuit: returns the tick the intruder was re-found, or −1 within `seconds`. */
export function pursuit(policy: Policy, seed: number, tuning: Tuning, seconds = 60): number {
  const world = campWorld(tuning);
  // Every guard's own streams start from the world's seed: a pursuit's seed varies those too.
  world.seed = `${world.seed}/pursuit${seed}`;
  const rng = new Rng('pursuit', String(seed));
  // The last known position: 70 m or so out from the camp's east side.
  const lkp = { x: 70 + rng.range(0, 25), z: rng.range(-30, 30) };
  // The intruder is already 25–40 m beyond it, crouched and creeping farther, out of sight of the camp.
  const out: Waypoint[] = [];
  const base = rng.range(-Math.PI / 3, Math.PI / 3);
  for (let k = 0; k < 7; k++) {
    const r = 30 + k * 18;
    const a = base + rng.range(-0.35, 0.35);
    out.push({ x: lkp.x + r * dcos(a), z: lkp.z + r * dsin(a), stance: 'crouch' });
  }
  const steer = emptySteering();
  const routes = new Map<number, Route>();
  const goals = new Map<number, { x: number; z: number; until: number }>();
  const hz = tuning.sim.tickHz;
  const policySystem: System = {
    name: 'baseline-policy',
    phase: 'decide',
    after: ['guard-brains'],
    reads: ['guard.body', 'guard.guard', 'player.body'],
    writes: ['guard.guard.order'],
    emits: [],
    run(ctx) {
      const player = ctx.index.of('player')[0]!;
      for (const g of ctx.index.of('guard')) {
        if (policy === 'plain' && g.guard.spawn !== 0) continue; // the others keep their routines
        const post = ctx.world.camp.guards[g.guard.spawn]!;
        if (post.elevated) continue;
        let goal = goals.get(g.id);
        const now = ctx.tick;
        const arrived = goal ? (g.body.x - goal.x) * (g.body.x - goal.x) + (g.body.z - goal.z) * (g.body.z - goal.z) < 4 : false;
        if (!goal || now >= goal.until || arrived) {
          let x: number;
          let z: number;
          if (policy === 'omniscient') {
            x = player.body.x;
            z = player.body.z;
          } else if (policy === 'staleness') {
            // Sweep a ring around the believed spot, least visited first: here, by a fixed tour of the ring.
            const a = (g.id * 2.39 + now / (hz * 8)) % (2 * Math.PI);
            const r = 18 + ((now / (hz * 8)) % 3) * 8;
            x = lkp.x + r * dsin(a);
            z = lkp.z + r * dcos(a);
          } else if (policy === 'plain') {
            x = lkp.x;
            z = lkp.z;
          } else {
            x = rng.range(-20, 90);
            z = rng.range(-50, 50);
          }
          goal = { x, z, until: now + Math.round((policy === 'omniscient' ? 1.5 : 10) * hz) };
          goals.set(g.id, goal);
          const route = routes.get(g.id) ?? emptyRoute();
          routes.set(g.id, route);
          navigatorOf(ctx.world, ctx.tuning).find(g.body.x, g.body.z, goal.x, goal.z, { work: ctx.work }, route);
        }
        const route = routes.get(g.id)!;
        const o = g.guard.order;
        const w = followRoute(route, g.body.x, g.body.z, ctx.tuning.brain.paces.search, g.id, ctx.tick + 1, ctx.tuning, steer);
        o.tick = ctx.tick + 1;
        o.wishX = w === 'arrived' ? 0 : steer.wishX;
        o.wishZ = w === 'arrived' ? 0 : steer.wishZ;
        o.gait = w === 'arrived' ? 'idle' : 'walk';
        const toward = steer.dirX * steer.dirX + steer.dirZ * steer.dirZ > 0 ? yawFromDirection(steer.dirX, steer.dirZ) : g.body.yaw;
        o.yaw = turnTowards(g.body.yaw, toward, ctx.tuning.perception.awareness.turnRate * ctx.dt);
        o.headYaw = 0;
      }
    },
  };
  // The honest brain runs the camp brain's systems; the baselines the same perception, without the brain.
  let systems = SYSTEMS;
  for (const s of [...PERCEPTION, commsVoice, campCommander, campCheckins]) systems = withSystem(systems, s);
  if (policy !== 'honest') systems = withSystem(systems, policySystem);
  const sim = new Simulation(world, tuning, systems);
  placePlayer(sim, out[0]!.x, out[0]!.z, -1, 0);
  const pb = sim.player;
  const pspec = sim.tuning.bodies.player;
  pb.stance = 'crouch';
  pb.eyeHeight = pspec.eyeHeight.crouch;
  pb.eyeFrom = pb.eyeHeight;
  for (const h of pb.history) h.eyeHeight = pb.eyeHeight;
  giveSenses(sim);
  if (policy === 'honest') giveBrains(sim);
  giveCommander(sim);
  // Every guard starts out believing the intruder is at the last known position: a radio
  // report in hand, as if a contact had just been called in and lost.
  const ctx = (sim as unknown as { ctx: Parameters<typeof tell>[0] }).ctx;
  for (const g of sim.guards) {
    const report = { kind: 'contact' as const, x: lkp.x, y: 0.8, z: lkp.z, radius: 10, tick: 0, from: 0, fromX: lkp.x, fromZ: lkp.z, cause: 0 };
    if (g.brain) tell(ctx, g, report, 'radio', 0);
  }
  commanderOfSim(sim)?.camp.inbox.push({ kind: 'contact', x: lkp.x, y: 0.8, z: lkp.z, radius: 10, tick: 0, from: 0, fromX: lkp.x, fromZ: lkp.z, cause: 0 });
  const driver = new WaypointDriver(out, 2);
  const raw = neutralInput();
  const ticks = Math.round(seconds * hz);
  for (let i = 0; i < ticks; i++) {
    const events = sim.step(driver.next(sim, raw));
    for (const e of events) if (e.type === 'detected') return sim.tick;
  }
  return -1;
}

function commanderOfSim(sim: Simulation): { camp: { inbox: unknown[] } } | undefined {
  return sim.index.of('commander')[0] as never;
}
