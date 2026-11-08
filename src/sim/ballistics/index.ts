/**
 * The ballistics lane (lab B): one ballistic function under the bullet, the reticle, the
 * rangefinder and every assist; bullets in the state tree, flying in the 'projectiles'
 * phase; hits swept against each body part; the rifle, its sway and its rest. Everything
 * outside the lane reaches it through this file.
 *
 * Its contract:
 * - trajectory.ts: a bullet's launch (Flight) and where it is at any instant (flightAt);
 *   the 'shot' event carries the same launch, so anyone can follow a bullet's path, its
 *   crack's included.
 * - aim.ts: zeroes, launches, landings and holds: every instrument's arithmetic.
 * - bullet.ts: the bullet entity, and flying it against a world and moving bodies.
 * - rifle.ts, sway.ts, rest.ts: the rifle a shooter carries, how its aim wanders, and
 *   where it can rest.
 * What a strike does to whoever it hits is the game's.
 */
export { airspeedAt, dragIn, flightAt, timeAtRange, vec3, velocityAt, type Flight, type Vec3 } from './trajectory';
export {
  boreLine,
  holdBetween,
  landing,
  launch,
  lineOfSight,
  markDirection,
  sightFrame,
  smallAngle,
  solveAim,
  unit,
  viewLine,
  zeroFor,
  type Ballistic,
  type Hold,
  type SightFrame,
  type Zero,
} from './aim';
export { emptyStrike, fly, type BodiesAt, type BulletEntity, type BulletState, type Strike } from './bullet';
export { ballisticOf, dialZero, freshRifle, loadOf, pushSway, swayAt, zeroOf, type RifleState, type SwaySample } from './rifle';
export { smoothNoise, swaySample } from './sway';
export { restAvailable } from './rest';
export { glint } from './glint';
