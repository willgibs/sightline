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
  /** The tick he last said anything on the net himself, if he has: `tick` above also moves when he's sent somewhere. */
  heard?: number;
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
  /** A section's order: who, from where, against whom (hunt.ts). */
  hunt?: HuntOrder;
}

/** `fetch` and `escort` are the two halves of bringing the target out (protect.ts): to his door, then to his vehicle. `hunt` is a section's (hunt.ts). */
export type TaskKind = 'investigate' | 'search' | 'check' | 'sweep' | 'cover' | 'fetch' | 'escort' | 'hunt';

/** What a section's order says beyond where to go (hunt.ts): who's in it, where it gathers, and where the shooter may be watching from. */
export interface HuntOrder {
  /** Its men's ids, the senior first: he leads, and the halves that move in turn are every other man. */
  men: number[];
  /** How sure the camp is of the place, metres. */
  r: number;
  /** Where they gather before they go, and how long the slowest of them should take to get there, seconds. */
  rx: number;
  rz: number;
  eta: number;
  /** x, z of each place the shooter is taken to be watching from, flattened: the place itself, and the listed firing points beside it. */
  watch: number[];
}

/**
 * A section out after someone (Lab F, step 2b; commander.ts): who's in it and what it was
 * sent to look at. The camp knows of it what it ordered and what has come back over the net.
 */
export interface Section {
  id: number;
  /** The order it's carrying out. */
  task: number;
  men: number[];
  /** The place it was sent to, and the listed firing point that is, or −1. */
  x: number;
  z: number;
  point: number;
  /** The tick it was first ordered out, and how many places it has been sent to. */
  ordered: number;
  legs: number;
  /** The last the camp heard from it: nothing yet, the place clear, or someone found; and when. */
  heard: 'out' | 'clear' | 'contact';
  heardAt: number;
}

/** Someone the camp has placed outside its men's reach: where, how sure, since when, and by what news. */
export interface Threat {
  x: number;
  z: number;
  r: number;
  /** The listed firing point it's taken to be, or −1. */
  point: number;
  /** The tick the camp first had him placed, this time, and the tick of the news the place rests on. */
  since: number;
  news: number;
  /** Seen, or his flash: a place to act on at once. Otherwise worked out from what was heard. */
  seen: boolean;
}

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
  /** A camp whose men know how to fight someone close (firefight.ts): cover, find him, fight from the cover, follow. Absent for a camp that only does the drill. */
  firefight?: true;
  /** A camp that sends a section out after someone it has placed (hunt.ts, commander.ts). Absent for a camp whose men stay inside the wire. */
  hunts?: true;
  /** Who it's hunting, if anyone; its sections out; the next section's id; places they've found empty; and the tick the last one came home or was lost, or −1. */
  threat: Threat | null;
  sections: Section[];
  nextSection: number;
  cleared: Array<{ x: number; z: number; tick: number }>;
  huntEnded: number;
  /** Bodies it has put a name to, and where each lies: the same one called in again is nobody new. */
  fallen: Array<{ x: number; z: number; who: number }>;
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
    threat: null,
    sections: [],
    nextSection: 1,
    cleared: [],
    huntEnded: -1,
    fallen: [],
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
