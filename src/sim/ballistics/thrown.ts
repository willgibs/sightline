import type { Tuning } from '../../config/tuning';
import type { EntityBase, EntityId } from '../kernel/state';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, raycast, type QueryView } from '../kernel/world/query';
import type { Surface } from '../kernel/world/surfaces';

/**
 * The throwable (design doc · Tools: a rock that pulls one guard's attention): a small
 * hard thing thrown along the view, on an exact arc under gravity (no drag at these
 * speeds), bouncing off whatever it meets and settling. Each touch hard enough to hear is
 * a landing, whose sound is the throwable's whole point: loud enough that the guard it
 * lands near hears it, quiet enough that, at a camp's spacing, the next one doesn't.
 *
 * Like a bullet, a throwable in flight is its current arc (where and when it began, and
 * its velocity then) and how far along it has been swept, so its position at any instant
 * is exact; each tick's chord is swept against the terrain, the colliders and the bodies.
 */

export interface ThrownState {
  thrower: EntityId;
  /** The current arc: where and when it began, and the velocity then (m/s). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  /** Mission time up to which the arc has been swept. */
  swept: number;
  /** Lying still where it settled. */
  rest: boolean;
  /** Touches so far. */
  touches: number;
}

export interface ThrownEntity extends EntityBase {
  kind: 'thrown';
  thrown: ThrownState;
}

declare module '../kernel/state' {
  interface EntityKinds {
    thrown: ThrownEntity;
  }
}

/** Where a throwable is on its arc at mission time `t`. */
export function thrownAt(s: ThrownState, g: number, t: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const tau = s.rest ? 0 : Math.max(0, t - s.t);
  out.x = s.x + s.vx * tau;
  out.y = s.y + s.vy * tau - 0.5 * g * tau * tau;
  out.z = s.z + s.vz * tau;
  return out;
}

/** One touch: where and when, how fast, and on what. */
export interface Touch {
  t: number;
  x: number;
  y: number;
  z: number;
  speed: number;
  surface: Surface;
  /** It stopped here. */
  settled: boolean;
}

const a = { x: 0, y: 0, z: 0 };
const b = { x: 0, y: 0, z: 0 };
const hit = emptyHit();
/** The most touches one piece of an arc may have: a budget, not a time (rule 18). */
const MAX_TOUCHES = 6;

/**
 * Flies a throwable on to mission time `until`, a chord a tick at a time (`dt` apart),
 * bouncing at each touch; calls `touched` for each, in order. The arc bends from its
 * chord by about 1.4 mm in a tick at 30 Hz.
 */
export function flyThrown(s: ThrownState, until: number, dt: number, view: QueryView, T: Tuning, touched: (t: Touch) => void): void {
  const R = T.ballistics.throwable;
  const g = T.sim.gravity;
  let touches = 0;
  while (!s.rest && s.swept < until && touches < MAX_TOUCHES) {
    const t0 = s.swept;
    const t1 = Math.min(until, (Math.floor(t0 / dt + 1e-9) + 1) * dt);
    thrownAt(s, g, t0, a);
    thrownAt(s, g, t1, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-9) raycast(view, a.x, a.y, a.z, dx / len, dy / len, dz / len, len, Blocks.Move | Blocks.Bullet, hit, s.thrower);
    if (len <= 1e-9 || hit.what === 'none') {
      s.swept = t1;
      if (t1 - s.t > R.maxFlight) s.rest = true;
      continue;
    }
    touches++;
    // The touch: when, how fast, and the bounce off the surface's normal.
    const f = hit.dist / len;
    const tc = t0 + (t1 - t0) * f;
    const tau = tc - s.t;
    const vx = s.vx;
    const vy = s.vy - g * tau;
    const vz = s.vz;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const vn = vx * hit.nx + vy * hit.ny + vz * hit.nz;
    const into = -vn;
    const settled = into < R.rest;
    // Off the surface: the normal part reversed and cut, the rest slowed by friction.
    const tx = (vx - vn * hit.nx) * R.friction;
    const ty = (vy - vn * hit.ny) * R.friction;
    const tz = (vz - vn * hit.nz) * R.friction;
    s.x = hit.x + hit.nx * R.radius;
    s.y = hit.y + hit.ny * R.radius;
    s.z = hit.z + hit.nz * R.radius;
    s.t = tc;
    s.swept = tc;
    s.touches++;
    if (settled) {
      s.vx = 0;
      s.vy = 0;
      s.vz = 0;
      s.rest = true;
    } else {
      s.vx = tx + hit.nx * into * R.bounce;
      s.vy = ty + hit.ny * into * R.bounce;
      s.vz = tz + hit.nz * into * R.bounce;
    }
    touched({ t: tc, x: s.x, y: s.y, z: s.z, speed, surface: hit.surface ?? (1 as Surface), settled });
  }
}

/** How far a touch at this speed on this surface is heard (the landing's radius, metres). */
export function landingRadius(speed: number, surfaceLoudness: number, T: Tuning): number {
  return T.ballistics.throwable.landing * (speed / 10) * surfaceLoudness;
}
