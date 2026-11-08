/**
 * Counts of the work systems do: rays cast, grid nodes expanded, bodies resolved. They
 * are deterministic, a pure function of the run like everything else in it, so they turn
 * rule 18's budgets into numbers that can be pinned like goldens (each lane's bench, game/
 * benches.ts) while wall time stays a trend. The simulation adds up what each system does
 * (Simulation.work); queries count their rays themselves (world/query.ts), a grid search
 * reports its expansions, and the motor counts the bodies it resolves.
 *
 * Work done only to draw the debug view is counted too, so benches run with it off.
 */
export interface WorkCounts {
  /** Rays cast through the world query. */
  rays: number;
  /** Grid cells a search expanded (world/search.ts). */
  nodes: number;
  /** Bodies the motor resolved. */
  bodies: number;
}

export const WORK_KINDS = ['rays', 'nodes', 'bodies'] as const satisfies ReadonlyArray<keyof WorkCounts>;

export function noWork(): WorkCounts {
  return { rays: 0, nodes: 0, bodies: 0 };
}
