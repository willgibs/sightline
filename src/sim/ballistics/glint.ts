import type { Tuning } from '../../config/tuning';
import { dcosDeg } from '../kernel/core/detmath';
import type { Vec3 } from './trajectory';

/**
 * Lens glint (design doc · Tools): sunlight off an optic's objective lens, which faces
 * where it aims. An observer sees it when the lens faces near the half-way direction
 * between the sun and the observer, the mirror's condition, so a scope turned toward the
 * sun flashes at whoever it's pointed at. Full within glint.fullDeg of that direction,
 * easing to nothing by glint.zeroDeg, scaled by how far the optic is up, and nothing with
 * the sun down. A pure function: lab A's perception (A9) asks it for each guard who might
 * see the player's lens, and the counter-sniper's glint (E8) is the same function.
 */
export function glint(aim: Vec3, up: number, sun: Vec3, toObserver: Vec3, G: Tuning['ballistics']['glint']): number {
  if (!(up > 0) || sun.y <= 0) return 0;
  const hx = sun.x + toObserver.x;
  const hy = sun.y + toObserver.y;
  const hz = sun.z + toObserver.z;
  const l = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (l < 1e-9) return 0;
  const c = (aim.x * hx + aim.y * hy + aim.z * hz) / l;
  const full = dcosDeg(G.fullDeg);
  const none = dcosDeg(G.zeroDeg);
  if (c <= none) return 0;
  const t = c >= full ? 1 : (c - none) / (full - none);
  return up * t * t * (3 - 2 * t);
}
