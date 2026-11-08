import type { CampAnalysis } from './campAnalysis';
import type { RuleName, Validation } from './validate';
import type { Overwatch } from './overwatch';

/**
 * What generation says about a world it built: the overwatch perches, the ways in, and,
 * for a generated camp, its analysis and validation. The debug view and the seed explorer
 * read it.
 */

export interface Perch {
  x: number;
  y: number;
  z: number;
  /** Which way it looks, of 32 directions round the camp. */
  dir: number;
  /** Horizontal distance to the camp centre. */
  dist: number;
  heightAbovePad: number;
  /** Which overwatch ridge (contiguous run of directions) this perch belongs to. */
  ridge: number;
}

export interface TerrainReport {
  perches: Perch[];
  /** Contiguous runs of directions with a valid perch. */
  ridges: number;
  /** Of 8 compass sectors (45° each), how many hold at least one perch. */
  overwatchSectors: number;
  /** Of 16 compass sectors, how many reach the camp on foot from the play-area edge. */
  accessSectors: number;
  /** Share of the play area too steep to walk. */
  steepShare: number;
  ok: boolean;
  problems: string[];
  /** Terrain with teeth only (landform.ts), absent from Phase 0's valley: D3's checks in full. */
  valley?: Overwatch;
  /** Generated camps only (D7): the camp's analysis over its cycle. */
  camp?: CampAnalysis;
  /** Generated camps only (D8): how it stands against the rules, after any repairs. */
  validation?: Validation;
  /** Which camp attempt this is: 0 if the first camp built on this terrain stood. */
  campAttempt?: number;
  /** The repairs it took: empty if the camp as generated passed. */
  repairs?: string[];
  /** Re-analyses repair spent (of `validation.repairAttempts`), and the rules the camp broke as first built. */
  repairAttempts?: number;
  firstFailed?: RuleName[];
}
