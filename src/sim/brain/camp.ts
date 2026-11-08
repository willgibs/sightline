import type { Tuning } from '../../config/tuning';
import type { Report } from './reports';
import { createSearchMap, type SearchMap } from './searchMap';

/**
 * The camp's memory and its nervous system (E4, E5): one plain record, the commander's,
 * that everything the camp knows lives in. Fed only by reports (reports.ts): the
 * commander decides from this record alone (camp.ts's CampMind, E5), never from the truth.
 */
export const ALERT_LEVELS = ['calm', 'uneasy', 'alert', 'lockdown'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export function alertRung(level: AlertLevel): number {
  return ALERT_LEVELS.indexOf(level);
}

export interface CampState {
  /** The camp's alert level, since when, and the floor it settles back to. */
  level: AlertLevel;
  since: number;
  floor: AlertLevel;
  /** Where the intruder could be. */
  map: SearchMap;
  /** Reports that have reached the camp, in the order they arrived, not yet digested. */
  inbox: Report[];
  /** What each recent voice said, by the voice's event, for whoever hears it. */
  voices: Array<{ event: number; report: Report; heardUntil: number }>;
  /** Radio calls on their way across the net, by id. */
  airwaves: Array<{ id: number; report: Report; speaker: number }>;
  nextAir: number;
  /** The radio set is working. */
  netWorking: boolean;
  /** The last tick a report of something suspicious came in. */
  lastPercept: number;
}

export function createCamp(campX: number, campZ: number, tuning: Tuning): CampState {
  const M = tuning.brain.searchMap;
  return {
    level: 'calm',
    since: 0,
    floor: 'calm',
    map: createSearchMap(campX, campZ, M.cells, M.cell),
    inbox: [],
    voices: [],
    airwaves: [],
    nextAir: 1,
    netWorking: true,
    lastPercept: -1,
  };
}
