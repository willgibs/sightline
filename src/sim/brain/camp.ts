import type { Tuning } from '../../config/tuning';
import type { Report } from './reports';
import { createSearchMap, type SearchMap } from './searchMap';

/**
 * The camp's memory and its nervous system (E4, E5): one plain record, the commander's,
 * that everything the camp knows lives in. Fed only by reports (reports.ts): the
 * commander decides from this record alone (commander.ts, CampMind), never from the truth.
 */
export const ALERT_LEVELS = ['calm', 'uneasy', 'alert', 'lockdown'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export function alertRung(level: AlertLevel): number {
  return ALERT_LEVELS.indexOf(level);
}

/** A guard, as the camp knows him: where he should be and whether he's accounted for. */
export interface RosterEntry {
  id: number;
  /** The camp post he came from (world.camp.guards). */
  post: number;
  /** Where he was when last heard from, and when; his post at the start. */
  x: number;
  z: number;
  tick: number;
  status: 'ok' | 'missing' | 'dead';
}

/** An order the commander has given (E5): where, and why. */
export interface Task {
  id: number;
  kind: TaskKind;
  x: number;
  z: number;
  priority: number;
  /** How many guards it's for, and who's on it. */
  capacity: number;
  assigned: number[];
  /** The report it came from: the chain of causes. */
  cause: number;
  issued: number;
}

export type TaskKind = 'investigate' | 'search';

/** A search under way: the camp's last known position of the intruder, and how it's going. */
export interface SearchState {
  started: number;
  startLevel: AlertLevel;
  x: number;
  z: number;
  radius: number;
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
  /** The last tick a report of something suspicious came in, and its cause. */
  lastPercept: number;
  lastCause: number;
  /** The men it knows it has. */
  roster: RosterEntry[];
  /** Orders in force, and the next task's id. */
  tasks: Task[];
  nextTask: number;
  /** The search under way, if any. */
  search: SearchState | null;
  /** When it last planned. */
  planned: number;
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
    lastCause: 0,
    roster: [],
    tasks: [],
    nextTask: 1,
    search: null,
    planned: -1,
  };
}
