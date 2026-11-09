import type { GenTuning } from '../../config/tuning';
import { Rng } from '../kernel/core/rng';
import type { CampAnalysis } from './campAnalysis';
import type { Camp } from './camp';
import { pickWeighted } from './weights';

/**
 * The camp's crux: the decisive problem it is built around, picked for the seed before the
 * camp is laid out (the owner, Nov 8: a target anyone can shoot from any ridge makes every
 * mission one shot from success; bury him behind the camp itself).
 *
 * - **inside** he stays in his building, deep in the camp, and no perch has him: someone has
 *   to go in and get him.
 * - **flush** he stays in too, but when the camp is shaken he runs for his vehicle: somebody
 *   has to make him run and have him when he does.
 * - **escort** he walks in the open, but mostly when another guard has him too: a shot is
 *   witnessed unless it's chained or the witness is dealt with.
 *
 * The camp is generated to make its crux true, and validation asks that a way to succeed
 * exists for that crux, and no more than that (`cruxExcess`). Nothing is guaranteed in every
 * camp except a way through its own problem.
 *
 * `walk` is the old promise: a target who walks out where perches can see him. It is weighted
 * to nothing and kept so an experiment can still build the camps these were measured on
 * (lab/experiments/variety.ts).
 *
 * A seed's crux comes from its own root stream, so a valley re-rolled or a camp rebuilt
 * keeps its problem.
 */
export const CRUX_KINDS = ['walk', 'inside', 'flush', 'escort'] as const;
export type CruxKind = (typeof CRUX_KINDS)[number];

declare module './camp' {
  interface Camp {
    /** Generated camps only: the decisive problem this camp was built around. */
    crux?: CruxKind;
  }
}

export function cruxOf(seed: string, gen: GenTuning): CruxKind {
  return pickWeighted(new Rng(seed, 'crux'), gen.crux.kinds, CRUX_KINDS);
}

/** Cruxes where the target spends the whole cycle indoors. */
export function buried(crux: CruxKind): boolean {
  return crux === 'inside' || crux === 'flush';
}

/** Cruxes where the camp's guarded way in matters enough to be built and kept open. */
export function needsWayIn(crux: CruxKind): boolean {
  return crux === 'inside' || crux === 'walk';
}

/**
 * How far a camp is from having a way to succeed at its crux: 0 when it has one, and in what
 * words if it hasn't.
 */
export function cruxExcess(camp: Camp, a: CampAnalysis, gen: GenTuning): { excess: number; detail: string } {
  const V = gen.validation;
  const crux = camp.crux ?? 'walk';
  const target = camp.objective?.target ?? -1;
  switch (crux) {
    case 'walk': {
      // The old promise: two perches that each see half the guards and hold the target.
      const n = camp.guards.length;
      const half = Math.ceil(n / 2);
      const seenShare = V.seenSeconds / a.cycle;
      const good = a.perches.filter((p) => p.guards.filter((s) => s >= seenShare - 1e-9).length >= half && target >= 0 && p.target * a.cycle >= V.targetSeconds - 1e-9).length;
      return { excess: V.longRangePerches - good, detail: `${good} perch(es) see half the guards and the target; ${V.longRangePerches} needed` };
    }
    case 'inside': {
      const seen = a.perches.filter((p) => p.target * a.cycle > gen.crux.buriedSeconds).length;
      return { excess: seen + (a.infiltration.found ? 0 : 1), detail: !a.infiltration.found ? 'no way in to him' : `${seen} perch(es) can see him where he stays` };
    }
    case 'flush': {
      const seen = a.perches.filter((p) => p.target * a.cycle > gen.crux.buriedSeconds).length;
      // The best overview mustn't have his run (the escape rule says so); one other perch must, or his vehicle can be reached and stopped.
      const others = a.perches.filter((p) => p.run >= V.interceptSeconds).length;
      const stopped = others > 0 || a.vehicle.found;
      return { excess: seen + (stopped ? 0 : 1), detail: !stopped ? 'nothing can stop him when he runs' : `${seen} perch(es) can see him where he stays` };
    }
    case 'escort': {
      // A way to succeed: a perch that has him long enough to shoot. It won't be clean: that's the crux.
      const seen = a.perches.filter((p) => p.target * a.cycle >= V.targetSeconds - 1e-9).length;
      return { excess: seen > 0 ? 0 : 1, detail: 'no perch ever has him long enough to matter' };
    }
  }
}
