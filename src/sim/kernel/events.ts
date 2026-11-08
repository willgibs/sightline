import type { EntityId } from './state';
import type { Surface } from './world/surfaces';

/**
 * Everything observable that happens in the simulation is an event: one type from the
 * registry below, with an id, the tick and the moment it happened, the entity that made
 * it happen, and the event that caused it, if any. Events are the contract between the
 * labs: perception consumes them as stimuli, the debrief walks their causes to explain a
 * mission ("the alarm, because he heard a footstep, because you sprinted on gravel"),
 * the recorder stores them, the audio plays them and the debug view draws them.
 *
 * Sounds are one family: a sound has a position, a surface, a loudness and a radius,
 * the one loudness unit (metres at which an unmasked guard with normal hearing would
 * just hear it along an open path).
 *
 * Adding an event type: add its interface to SimEvent and its entry to EVENTS, with a
 * code never used before. The compiler rejects a type without an entry, and an entry
 * that doesn't say how to store every field.
 */

export interface EventBase {
  /** Unique within a run, in order of emission, from 1. */
  id: number;
  /** The tick that produced it. */
  tick: number;
  /**
   * When it happened, in seconds from the start. Usually within its tick:
   * (tick − 1)·dt < t ≤ tick·dt. A command resolved against what the player saw happened
   * earlier, up to two ticks before its tick began.
   */
  t: number;
  /** The entity that made it happen. */
  source: EntityId;
  /** The id of the event that caused this one, or 0. */
  cause: number;
}

/** The fields every sound has. */
export interface SoundFields {
  x: number;
  y: number;
  z: number;
  surface: Surface;
  /** Relative loudness: movement × surface. */
  loudness: number;
  /** How far an unmasked guard with normal hearing would hear it, in metres. */
  radius: number;
}

export interface FootstepEvent extends EventBase, SoundFields {
  type: 'footstep';
  /** What the legs were doing, which picks the step's sound; its loudness says how hard. */
  gait: StepGait;
}

/** A body hitting the ground after a fall or a slide. */
export interface LandEvent extends EventBase, SoundFields {
  type: 'land';
  /** Impact speed, m/s. */
  speed: number;
}

/**
 * A shot leaves the muzzle: from the eye at the moment the player fired, along their aim.
 * Lab B adds the bullet's flight, its sounds and what it hits.
 */
export interface ShotEvent extends EventBase {
  type: 'shot';
  x: number;
  y: number;
  z: number;
  /** Unit direction of the aim. */
  dx: number;
  dy: number;
  dz: number;
}

export interface StanceEvent extends EventBase {
  type: 'stance';
  from: StanceName;
  to: StanceName;
}

export type StanceName = 'stand' | 'crouch' | 'prone';

/** The gaits a step can be taken in: every gait a body moves in (body/body.ts, Gait) but standing still. */
export type StepGait = 'crawl' | 'crouch' | 'walk' | 'sprint';

/** The rules decided the run (state.ts, Outcome): the reason is in the state. */
export interface OutcomeEvent extends EventBase {
  type: 'outcome';
  status: 'succeeded' | 'failed';
}

export type SimEvent = FootstepEvent | LandEvent | StanceEvent | ShotEvent | OutcomeEvent;
export type EventType = SimEvent['type'];
export type EventOf<K extends EventType> = Extract<SimEvent, { type: K }>;

/** An event as its emitter writes it: the simulation fills in the id, the tick and, unless given, the time. */
export type EventDraft = SimEvent extends infer E
  ? E extends SimEvent
    ? Omit<E, 'id' | 'tick' | 't' | 'cause'> & { t?: number; cause?: number }
    : never
  : never;

/** How a field is stored in a recording. */
export type FieldCodec = 'u8' | 'i32' | 'u32' | 'f32' | 'f64' | { readonly enum: readonly string[] };

type Payload<E> = Omit<E, keyof EventBase | 'type'>;

export interface EventSpec<E> {
  /** Identifies the type in recordings. Never reuse a retired code. */
  code: number;
  /** A sound: perception hears it, and it has SoundFields. */
  sound: boolean;
  /** How each field beyond the base is stored, in order. */
  fields: { readonly [F in keyof Payload<E>]-?: FieldCodec };
}

const GAITS = ['crawl', 'crouch', 'walk', 'sprint'] as const;
const STANCES = ['stand', 'crouch', 'prone'] as const satisfies readonly StanceName[];
const SOUND = { x: 'f32', y: 'f32', z: 'f32', surface: 'u8', loudness: 'f32', radius: 'f32' } as const;

export const EVENTS: { readonly [K in EventType]: EventSpec<EventOf<K>> } = {
  footstep: { code: 1, sound: true, fields: { ...SOUND, gait: { enum: GAITS } } },
  stance: { code: 2, sound: false, fields: { from: { enum: STANCES }, to: { enum: STANCES } } },
  land: { code: 3, sound: true, fields: { ...SOUND, speed: 'f32' } },
  shot: { code: 4, sound: false, fields: { x: 'f64', y: 'f64', z: 'f64', dx: 'f64', dy: 'f64', dz: 'f64' } },
  outcome: { code: 5, sound: false, fields: { status: { enum: ['succeeded', 'failed'] } } },
};

export function isSound(e: SimEvent): e is Extract<SimEvent, SoundFields> {
  return EVENTS[e.type].sound;
}
