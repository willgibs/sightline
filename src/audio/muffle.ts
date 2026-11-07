import { Blocks } from '../sim/world/colliders';
import { sightLine, type QueryView } from '../sim/world/query';
import type { Muffle, MuffleFn } from './engine';

/**
 * What muffles a sound on its way to the listener: a first approximation, for the
 * speakers only. The straight path is blocked by the terrain or by anything solid that
 * stops sound: the world's colliders and entities' shapes alike, through the same world
 * query everything else asks (a closed gate muffles the generator as a wall does).
 * Bodies don't block sound.
 *
 * Lab A replaces this with sound that travels around buildings along walkable paths
 * (design doc · Enemy perception · Hearing), in the simulation, so the guards and the
 * player hear by one law; the speakers will then ask it instead.
 */

export const MUFFLED: Muffle = { gain: 0.45, cutoff: 900 };

/** Sounds start this far above where they are, so a footstep isn't blocked by the ground it's on. */
const LIFT = 0.3;

/** `view` gives the current simulation's world and solids; it changes when a run restarts. */
export function makeMuffle(view: () => QueryView | null): MuffleFn {
  return (sx, sy, sz, lx, ly, lz) => {
    const v = view();
    if (!v) return null;
    const dx = lx - sx;
    const dy = ly - sy;
    const dz = lz - sz;
    if (dx * dx + dy * dy + dz * dz < 0.25) return null;
    return sightLine(v, sx, sy + LIFT, sz, lx, ly, lz, Blocks.Sound) ? null : MUFFLED;
  };
}
