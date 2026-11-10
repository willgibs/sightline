import type { Tuning } from '../../config/tuning';
import type { Report } from './reports';
import { createSearchMap, type SearchMap } from './searchMap';
import type { Bearing, ShotEstimate } from './triangulate';

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
  /** A reinforcement's own place, where the camp expects him when he's not heard from. */
  reserve?: { x: number; z: number };
}

/** An order the commander has given (E5): where, and why. */
export interface Task {
  id: number;
  kind: TaskKind;
  x: number;
  z: number;
  /** How high the place is, where a report said: which floor of a building to go to. */
  y?: number;
  priority: number;
  /** How many guards it's for, and who's on it. */
  capacity: number;
  assigned: number[];
  /** The report it came from: the chain of causes. */
  cause: number;
  issued: number;
}

/** `fetch` and `escort` are the two halves of bringing the target out (protect.ts): to his door, then to his vehicle. */
export type TaskKind = 'investigate' | 'search' | 'check' | 'sweep' | 'cover' | 'fetch' | 'escort';

/** A search under way: the camp's last known position of the intruder, and how it's going. */
export interface SearchState {
  started: number;
  startLevel: AlertLevel;
  x: number;
  z: number;
  /** How high the latest report's place was: which floor. */
  y?: number;
  radius: number;
  /** Someone has been to the spot the latest report named and called it clear: nobody else is sent there until a new report. */
  cleared: boolean;
}

export interface CampDevices {
  /** The alarm boxes, in order: where each stands, whether it's raised and has power, and its device in world.camp.devices, for a generated camp. */
  alarms: Array<{ x: number; z: number; raised: boolean; powered: boolean; device?: number }>;
  generatorRunning: boolean;
  /** Where the target's vehicle stands, if the camp has one (E7): where he runs at lockdown. */
  escape: { x: number; z: number } | null;
}

export interface CampState {
  /** The mission's objective (E7): the target's entity id and whether he's still to be got, a stand-in until lab D's. */
  /** `getOut`: the mission isn't won when the target falls, but when the player then reaches this place (Lab F). */
  /** A camp that fights back (Lab F): absent for a camp that doesn't. */
  fights?: true;
  /**
   * A camp that protects its target (protect.ts): where his hard room is. At the first sign
   * of trouble he goes there, and he leaves only when someone comes for him. Absent for a
   * camp that runs him to his vehicle the moment the siren sounds.
   */
  protects?: { x: number; z: number; y?: number };
  /** The tick the relief got down at the gate, and how many times, and when last, men have been sent for the target since. */
  relief?: { at: number; fetches: number; last: number };
  /** The tick of the last blast on the whistle. */
  whistled?: number;
  objective: { target: number; status: 'open' | 'done' | 'escaping' | 'escaped'; getOut?: { x: number; z: number } } | null;
  /** The camp's devices (E7): where they are and whether they work. On a generated camp, kept current from lab D's entities (`game/comms.ts`, campDevices). */
  devices: CampDevices;
  /** A shooter the camp has triangulated (E8): the bearings it fuses, and its estimate. */
  shots: { bearings: Array<Bearing & { tick: number }>; estimate: ShotEstimate | null; tick: number; dirty: boolean };
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
  /** A ledger of the stimuli the camp has seen, by kind and rough place (E9): repeats get taken more seriously. */
  ledger: Array<{ kind: string; x: number; z: number; count: number; tick: number }>;
  /** What the camp remembers of incidents the player caused (E9). */
  incidents: Array<{ kind: 'shots' | 'body'; x: number; z: number; count: number; tick: number }>;
  /** Reinforcements called (E8): when they were called, or −1. */
  reinforceCalled: number;
  /** The men it knows it has. */
  roster: RosterEntry[];
  /** Orders in force, and the next task's id. */
  tasks: Task[];
  nextTask: number;
  /** The search under way, if any. */
  search: SearchState | null;
  /** When it last planned. */
  planned: number;
  /** Radio check-ins (E6): when the next call goes out, and the one waiting for an answer. */
  checkins: { next: number; cursor: number; pending: { post: number; guard: number; seq: number; answered: boolean } | null; seq: number; deadReported?: boolean };
}

export function createCamp(campX: number, campZ: number, tuning: Tuning): CampState {
  const M = tuning.brain.searchMap;
  return {
    devices: { alarms: [], generatorRunning: true, escape: null },
    objective: null,
    shots: { bearings: [], estimate: null, tick: -1, dirty: false },
    level: 'calm',
    since: 0,
    floor: 'calm',
    map: createSearchMap(campX, campZ, M.cells, M.cell),
    inbox: [],
    voices: [],
    airwaves: [],
    nextAir: 1,
    netWorking: true,
    ledger: [],
    incidents: [],
    reinforceCalled: -1,
    lastPercept: -1,
    lastCause: 0,
    roster: [],
    tasks: [],
    nextTask: 1,
    search: null,
    planned: -1,
    checkins: { next: 0, cursor: 0, pending: null, seq: 1 },
  };
}
