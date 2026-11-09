import { Acoustics, emptyHeard } from '../sim/perception';
import type { Solids } from '../sim/kernel/world/solids';
import type { World } from '../sim/kernel/world/world';
import type { Tuning } from '../config/tuning';

/**
 * The player's ears, by the guards' law (owner, Nov 7: one law of sound). The speakers ask
 * the perception lane's hearing (sim/perception/hearing.ts) exactly what a guard standing
 * where the camera is would hear: the level by the louder route round or through, where it
 * seems to come from (a doorway), and how long the route is, for its delay. So whatever you
 * hear, a guard where you stand hears as clearly; whatever is unfair to you gets a cue,
 * never a bias.
 *
 * It keeps its own acoustics, so the speakers never disturb the simulation's last flood.
 */

/** How a sound reaches the listener: the hearing law's answer, for the engine. */
export interface Route {
  /** Level over the threshold of hearing, unmasked (1 at the sound's radius along an open route). */
  level: number;
  /** Its clarity where the listener is: level over the masked threshold. */
  clarity: number;
  /** Where it seems to come from. */
  x: number;
  y: number;
  z: number;
  /** Metres along its route, for its delay. */
  length: number;
  /** It came through a wall. */
  muffled: boolean;
}

/** A sound at (x, y, z) carrying `radius`, heard at (lx, ly, lz): its route, or null out of earshot. */
export type RouteFn = (x: number, y: number, z: number, radius: number, lx: number, ly: number, lz: number, out: Route) => Route | null;
/** Steady source `i` (generation/ambient.ts's order), heard at (lx, ly, lz). */
export type SteadyFn = (i: number, lx: number, ly: number, lz: number, out: Route) => Route | null;

export function emptyRoute(): Route {
  return { level: 0, clarity: 0, x: 0, y: 0, z: 0, length: 0, muffled: false };
}

/** The speakers' hearing for a world, through a run's solids; rebuilt when either changes. */
export class Ears {
  private acoustics: Acoustics | null = null;
  private readonly heard = emptyHeard();

  /** A new world or tuning: fresh acoustics. */
  setWorld(world: World | null, tuning: Tuning): void {
    this.acoustics = world ? new Acoustics(world, tuning) : null;
  }

  setTuning(tuning: Tuning): void {
    this.acoustics?.setTuning(tuning);
  }

  /** A new run: what stops sound is this simulation's solids. */
  setSolids(solids: Solids): void {
    this.acoustics?.setSolids(solids);
  }

  /** Whether the camp's generators are running, from the snapshot: a stopped one stops humming. */
  setHumming(on: boolean): void {
    if (this.acoustics) this.acoustics.humming = on;
  }

  /** How a sound reaches a listener, by the guards' law. */
  readonly route: RouteFn = (x, y, z, radius, lx, ly, lz, out) => {
    const a = this.acoustics;
    if (!a) return null;
    // Beyond its radius in a straight line, no route carries it.
    const dx = lx - x;
    const dz = lz - z;
    if (dx * dx + dz * dz > radius * radius) return null;
    a.spread({ x, y, z, radius });
    const h = a.hear(lx, ly, lz, this.heard);
    if (h.route === 'none' || h.level <= 0) return null;
    return this.fill(out);
  };

  /** How a steady source reaches a listener. */
  readonly steady: SteadyFn = (i, lx, ly, lz, out) => {
    const a = this.acoustics;
    if (!a || i >= a.steadyCount) return null;
    const h = a.hearSteady(i, lx, ly, lz, this.heard);
    if (h.route === 'none' || h.level <= 0) return null;
    return this.fill(out);
  };

  private fill(out: Route): Route {
    const h = this.heard;
    out.level = h.level;
    out.clarity = h.clarity;
    out.x = h.fromX;
    out.y = h.fromY;
    out.z = h.fromZ;
    out.length = h.length;
    out.muffled = h.route === 'through' && h.walls > 0;
    return out;
  }
}
