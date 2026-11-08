/**
 * The crack (A5): where a listener hears a supersonic bullet from, and when. The bullet
 * trails a shock cone; the part of it that reaches a listener first left the path where
 * the line to him makes an angle φ with the bullet's direction, cos φ = c / v (Maher,
 * IEEE DSP 2006). So someone near the path hears the crack from a point just upstream of
 * him, about 55–62° off the shooter's true bearing at the speeds a bullet has after a few
 * hundred metres: the mistake the physics hands the player, to cause on purpose.
 *
 * The path is lab B's: its one ballistic function (B3) gives the points the bullet passed
 * and when, and the crack is scheduled at its exact arrival when the shot's sounds land
 * (B8). Until then this is the geometry, measured by the bench's crack-bias scenario.
 */

/** A point on a bullet's flight, and the moment it passed. */
export interface FlightPoint {
  x: number;
  y: number;
  z: number;
  t: number;
}

/** Where a crack seems to come from, and when it arrives. */
export interface CrackHeard {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * When and from where a listener at (x, y, z) hears the crack of a bullet that flew `path`
 * (straight pieces at constant speed between its points), with sound at `c` m/s. False if
 * no shock reaches him: the bullet was never faster than sound where it passed him, or he
 * stands outside the cone it swept (behind the muzzle, past where it stopped).
 */
export function crackHeard(path: readonly FlightPoint[], x: number, y: number, z: number, c: number, out: CrackHeard): boolean {
  let found = false;
  out.t = Infinity;
  for (let k = 0; k + 1 < path.length; k++) {
    const p = path[k]!;
    const q = path[k + 1]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dz = q.z - p.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dt = q.t - p.t;
    if (len < 1e-9 || dt <= 0) continue;
    const v = len / dt;
    if (v <= c) continue;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    // The listener's place along the piece, and his distance from its line.
    const lx = x - p.x;
    const ly = y - p.y;
    const lz = z - p.z;
    const along = lx * ux + ly * uy + lz * uz;
    const ax = lx - along * ux;
    const ay = ly - along * uy;
    const az = lz - along * uz;
    const off = Math.sqrt(ax * ax + ay * ay + az * az);
    // Upstream of his foot by off · cot φ, where cos φ = c / v.
    const cos = c / v;
    const s = along - (off * cos) / Math.sqrt(1 - cos * cos);
    // The shock that reaches him first left inside this piece: the cone swept him here.
    if (s < 0 || s > len) continue;
    const px = p.x + ux * s;
    const py = p.y + uy * s;
    const pz = p.z + uz * s;
    const rx = x - px;
    const ry = y - py;
    const rz = z - pz;
    const t = p.t + s / v + Math.sqrt(rx * rx + ry * ry + rz * rz) / c;
    if (t < out.t) {
      out.x = px;
      out.y = py;
      out.z = pz;
      out.t = t;
      found = true;
    }
  }
  return found;
}
