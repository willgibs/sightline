import type { Tuning } from '../../config/tuning';
import { DEG, TWO_PI, datan2, dsin } from '../core/detmath';
import { turnTowards, wrapAngle, yawFromDirection } from '../core/math';
import type { Rng } from '../core/rng';
import type { SimEvent } from '../events';
import type { World } from '../gen/world';
import { surfaceLoudness } from '../world/surfaces';

/**
 * Phase 0 guard dummies: sentries that hold a post and sweep their gaze, and patrols
 * that walk their routes and pause at each waypoint. No perception yet; that arrives in
 * Phase 1 (labs A and E). They exist now to test scale, readability at range, the debug
 * cones and the recorder.
 */
export interface GuardState {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Body facing. */
  yaw: number;
  /** Head turn relative to the body. */
  headYaw: number;
  waypoint: number;
  wait: number;
  moving: boolean;
  stride: number;
  scanTime: number;
}

export function createGuards(world: World): GuardState[] {
  return world.camp.guards.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    z: s.z,
    yaw: yawFromDirection(s.faceX, s.faceZ),
    headYaw: 0,
    waypoint: s.routeStart,
    wait: 0,
    moving: false,
    stride: 0,
    scanTime: 0,
  }));
}

export function stepGuards(
  guards: GuardState[],
  world: World,
  tuning: Tuning,
  dt: number,
  tick: number,
  rng: Rng,
  emit: (e: SimEvent) => void,
): void {
  const G = tuning.guards;
  for (const g of guards) {
    const spawn = world.camp.guards[g.id]!;
    g.scanTime += dt;
    g.moving = false;
    const route = spawn.route;
    if (route && route.length > 1) {
      if (g.wait > 0) {
        g.wait = Math.max(0, g.wait - dt);
      } else {
        const target = route[g.waypoint]!;
        const dx = target.x - g.x;
        const dz = target.z - g.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.25) {
          g.waypoint = (g.waypoint + 1) % route.length;
          g.wait = rng.between(G.waitTime);
        } else {
          const want = datan2(-dx, -dz);
          g.yaw = turnTowards(g.yaw, want, G.turnRate * dt);
          if (Math.abs(wrapAngle(want - g.yaw)) < 0.6) {
            const step = Math.min(G.walkSpeed * dt, dist);
            g.x += (dx / dist) * step;
            g.z += (dz / dist) * step;
            // Height before the footstep, so the sound comes from where the foot lands.
            g.y = spawn.elevated ? spawn.y : world.terrain.heightAt(g.x, g.z);
            g.moving = true;
            g.stride += step;
            if (g.stride >= G.stride) {
              g.stride = Math.min(g.stride - G.stride, G.stride);
              const surface = world.terrain.surfaceAt(g.x, g.z);
              const loudness = tuning.noise.movement.walk * surfaceLoudness(surface, tuning);
              emit({
                type: 'footstep',
                tick,
                source: g.id,
                x: g.x,
                y: g.y,
                z: g.z,
                surface,
                loudness,
                radius: loudness * tuning.noise.radiusPerUnit,
              });
            }
          }
        }
      }
    }
    g.y = spawn.elevated ? spawn.y : world.terrain.heightAt(g.x, g.z);
    const amp = G.headScanDeg * DEG * spawn.scanScale * (g.moving ? 0.3 : 1);
    g.headYaw = amp * dsin(TWO_PI * (g.scanTime / G.headScanPeriod + spawn.scanPhase));
  }
}
