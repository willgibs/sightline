import type { Tuning } from '../../config/tuning';
import { DEG, dsin } from '../kernel/core/detmath';
import { turnTowards, wrapAngle, yawFromDirection } from '../kernel/core/math';
import type { Gait } from '../body';
import type { GuardMind } from './mind';
import { emptySteering, followRoute, navigatorOf, type Steering } from './nav';
import type { Order } from './orders';

/**
 * What every act is made of (brain.ts, and the acts in files of their own): standing and
 * facing something, looking around, walking somewhere by the navigator, and writing the
 * order that carries it out. They read the mind and write the order and the route's memory,
 * and nothing else.
 */

const steer: Steering = emptySteering();

/** Where his attention is: his focus, or where he believes the intruder is. */
export function focusOf(m: GuardMind): { x: number; z: number } {
  const a = m.awareness;
  if (a.state === 'combat' && m.belief) return m.belief;
  if (a.focus) return { x: a.fx, z: a.fz };
  if (m.belief) return m.belief;
  return { x: m.self.x, z: m.self.z };
}

/** Stands where he is and faces his focus: the head first, then the body, looking around if `scan`. */
export function stand(m: GuardMind, out: Order, scan: boolean): void {
  const A = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  const focus = focusOf(m);
  const self = m.self;
  const dx = focus.x - self.x;
  const dz = focus.z - self.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const toward = dist > 1e-6 ? yawFromDirection(dx, dz) : self.yaw;
  const limit = A.headLimitDeg * DEG;
  const combat = m.awareness.state === 'combat';
  let yaw = self.yaw;
  if (Math.abs(wrapAngle(toward - self.yaw)) > limit || combat) yaw = turnTowards(self.yaw, toward, A.turnRate * dt);
  let head = combat ? 0 : clamp(wrapAngle(toward - yaw), limit);
  if (scan) {
    const t = (m.tick - m.brain!.since) / m.tuning.sim.tickHz;
    head = clamp(head + A.scanDeg * DEG * dsin((2 * Math.PI * t) / A.scanPeriod), limit);
  }
  writeOrder(m, out, 0, 0, 'idle', yaw, head);
}

/** Stands where he is and faces a place: the sweep of a far marksman. */
export function standToward(m: GuardMind, out: Order, tx: number, tz: number, scan: boolean): void {
  const A = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  const self = m.self;
  const dx = tx - self.x;
  const dz = tz - self.z;
  const toward = dx * dx + dz * dz > 1e-6 ? yawFromDirection(dx, dz) : self.yaw;
  const yaw = turnTowards(self.yaw, toward, A.turnRate * dt);
  let head = 0;
  if (scan) head = m.tuning.brain.sniper.sweepHeadDeg * DEG * dsin((2 * Math.PI * (m.tick / m.tuning.sim.tickHz)) / A.scanPeriod);
  writeOrder(m, out, 0, 0, 'idle', yaw, head);
}

/** Stands where he is and looks around, while he lingers at a spot. */
export function lookAround(m: GuardMind, out: Order): void {
  stand(m, out, true);
}

/** Walks toward a goal by the navigator, then says whether he's there. */
export function walk(m: GuardMind, out: Order, x: number, z: number, pace: number, gait: Gait, lookX: number, lookZ: number): 'walking' | 'arrived' | 'stuck' {
  const b = m.brain!;
  const T = m.tuning.brain;
  const hz = m.tuning.sim.tickHz;
  const moved = (x - b.goalX) * (x - b.goalX) + (z - b.goalZ) * (z - b.goalZ) > T.goalMoved * T.goalMoved;
  const retry = b.routed >= 0 && (m.tick - b.routed) / hz >= (b.routeOk ? T.routeEvery : T.routeRetry);
  if (b.routed < 0 || (moved && retry) || (!b.routeOk && retry)) {
    if (m.nav.searches.left <= 0 || (m.nav.work?.nodes ?? 0) - m.nav.nodesAtStart >= T.nav.nodesPerTick) {
      stand(m, out, false);
      return 'walking';
    }
    m.nav.searches.left--;
    const r = navigatorOf(m.world, m.tuning).find(m.self.x, m.self.z, x, z, { work: m.nav.work }, b.route);
    b.routed = m.tick;
    b.routeOk = r === 'found';
    b.goalX = x;
    b.goalZ = z;
    if (!b.routeOk) return 'stuck';
  }
  if (!b.routeOk) return 'stuck';
  const w = followRoute(b.route, m.self.x, m.self.z, pace, m.id, m.tick, m.tuning, steer);
  if (w === 'arrived') return 'arrived';
  if (w === 'stalled') {
    // Something the grid doesn't know is in the way, and sidestepping hasn't cleared it.
    // He gives up on this route, and may look for another after routeRetry: never every tick.
    b.routed = m.tick;
    b.routeOk = false;
    return 'stuck';
  }
  const A = m.tuning.perception.awareness;
  const dt = 1 / hz;
  const toward = yawFromDirection(steer.dirX, steer.dirZ);
  const yaw = turnTowards(m.self.yaw, toward, A.turnRate * dt);
  const lx = lookX - m.self.x;
  const lz = lookZ - m.self.z;
  const see = lx * lx + lz * lz > 1e-6 ? yawFromDirection(lx, lz) : yaw;
  const head = clamp(wrapAngle(see - yaw), A.headLimitDeg * DEG);
  writeOrder(m, out, steer.wishX, steer.wishZ, gait, yaw, head);
  return 'walking';
}

export function sameGoal(ax: number, az: number, bx: number, bz: number, within: number): boolean {
  return (ax - bx) * (ax - bx) + (az - bz) * (az - bz) <= within * within;
}

export function writeOrder(m: GuardMind, out: Order, wishX: number, wishZ: number, gait: Gait, yaw: number, head: number): void {
  const A: Tuning['perception']['awareness'] = m.tuning.perception.awareness;
  const dt = 1 / m.tuning.sim.tickHz;
  out.kind = 'move';
  out.tick = m.tick;
  out.wishX = wishX;
  out.wishZ = wishZ;
  out.gait = gait;
  out.yaw = yaw;
  out.pitch = 0;
  out.headYaw = turnTowards(m.head, head, A.headRate * dt);
  // Down only while he's staying put: an order or a new route can send him off with `down` still set.
  // Absent standing, so a state that has never known a guard to get down doesn't change shape.
  if (m.brain?.down && wishX === 0 && wishZ === 0) out.stance = m.brain.down;
  else delete out.stance;
}

export function clamp(v: number, limit: number): number {
  return v > limit ? limit : v < -limit ? -limit : v;
}
