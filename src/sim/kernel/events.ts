import type { CodeRange } from './codes';
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
 * code never used before from your lane's range (codes.ts). The compiler rejects a type
 * without an entry, and an entry that doesn't say how to store every field.
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

/** Where a body was in a guard's sight: the zone that set the rate (perception/sight.ts). */
export type SightZone = 'core' | 'peripheral' | 'far' | 'contact' | 'none';
/** The awareness ladder's states (perception/senses.ts). */
export type AwarenessName = 'unaware' | 'curious' | 'suspicious' | 'searching' | 'combat';
/** Why a guard's awareness changed (perception/awareness.ts). */
export type AlertReason = 'seen' | 'glimpse' | 'heard' | 'shot' | 'voice' | 'repeat' | 'contact' | 'calm';
/** What a heard sound sounded like (perception/hearing.ts). */
export type HeardKind = 'sound' | 'shot' | 'voice';
/** What a guard can be doing, and why he changed (brain/brain.ts, ACTS and ACT_WHYS). Stored by index: only add at the end. */
export type ActCode = 'routine' | 'return' | 'look' | 'investigate' | 'search' | 'hold';
export type ActReason = 'start' | 'seen' | 'glimpse' | 'heard' | 'shot' | 'voice' | 'repeat' | 'contact' | 'calm' | 'arrived' | 'nothing' | 'stalled' | 'no-route' | 'lost';

/**
 * A guard's detection meter rose through the cue (30%): the first sign shows, at the
 * screen's edge and in his head (perception, lab A). Source: the guard.
 */
export interface NoticedEvent extends EventBase {
  type: 'noticed';
  /** The body he is noticing. */
  target: EntityId;
  /** Where its chest was, and how far from his eye. */
  x: number;
  y: number;
  z: number;
  distance: number;
  zone: SightZone;
}

/**
 * The meter reached 100%: he has seen you. It carries every factor that filled it, so it
 * explains itself (perception/explain.ts); its cause is the 'noticed' that came first.
 */
export interface DetectedEvent extends EventBase {
  type: 'detected';
  target: EntityId;
  x: number;
  y: number;
  z: number;
  distance: number;
  /** Degrees off his gaze. */
  angle: number;
  zone: SightZone;
  /** The caps: stance, light beneath the body, the sky behind it; and the range they made. */
  stance: number;
  light: number;
  skyline: number;
  range: number;
  /** The rate factors: movement, and the share of the body in view. */
  movement: number;
  cover: number;
  /** The fill rate at the moment, per second. */
  rate: number;
}

/** A guard heard a sound: a guess at where it came from, not a fix. Its cause is the sound. */
export interface HeardEvent extends EventBase {
  type: 'heard';
  kind: HeardKind;
  /** Its level over his masked threshold: 1 at the edge of hearing. */
  clarity: number;
  /** Where it seemed to come from, and how unsure. */
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** A guard's awareness changed state; its cause is the percept that did it (or 0 for calming down). */
export interface AlertEvent extends EventBase {
  type: 'alert';
  from: AwarenessName;
  to: AwarenessName;
  reason: AlertReason;
}

/** A guard said something: a voice, which others hear (perception/barks.ts holds the lines). */
export interface BarkEvent extends EventBase, SoundFields {
  type: 'bark';
  /** Which line (perception/barks.ts, BARKS). */
  line: number;
}

/** A noise dropped into the run from the sandbox (A10): a sound anyone near hears. */
export interface NoiseEvent extends EventBase, SoundFields {
  type: 'noise';
}

/** A guard's brain changed what he is doing (brain/brain.ts): source the guard, cause the percept or act behind it. */
export interface ActEvent extends EventBase {
  type: 'act';
  from: ActCode;
  to: ActCode;
  why: ActReason;
  /** Where the new act points. */
  x: number;
  z: number;
  /** The utility the winning option scored, 0–1. */
  weight: number;
}

export type SimEvent =
  | FootstepEvent
  | LandEvent
  | StanceEvent
  | ShotEvent
  | OutcomeEvent
  | NoticedEvent
  | DetectedEvent
  | HeardEvent
  | AlertEvent
  | BarkEvent
  | NoiseEvent
  | ActEvent;
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
  /** The range the code was taken from (codes.ts). */
  range: CodeRange;
  /** A sound: perception hears it, and it has SoundFields. */
  sound: boolean;
  /** How each field beyond the base is stored, in order. */
  fields: { readonly [F in keyof Payload<E>]-?: FieldCodec };
}

const GAITS = ['crawl', 'crouch', 'walk', 'sprint'] as const;
const ZONES = ['core', 'peripheral', 'far', 'contact', 'none'] as const satisfies readonly SightZone[];
const AWARE = ['unaware', 'curious', 'suspicious', 'searching', 'combat'] as const satisfies readonly AwarenessName[];
const REASONS = ['seen', 'glimpse', 'heard', 'shot', 'voice', 'repeat', 'contact', 'calm'] as const satisfies readonly AlertReason[];
const HEARD = ['sound', 'shot', 'voice'] as const satisfies readonly HeardKind[];
const STANCES = ['stand', 'crouch', 'prone'] as const satisfies readonly StanceName[];
const SOUND = { x: 'f32', y: 'f32', z: 'f32', surface: 'u8', loudness: 'f32', radius: 'f32' } as const;
const ACT_NAMES = ['routine', 'return', 'look', 'investigate', 'search', 'hold'] as const satisfies readonly ActCode[];
const ACT_WHY_NAMES = ['start', 'seen', 'glimpse', 'heard', 'shot', 'voice', 'repeat', 'contact', 'calm', 'arrived', 'nothing', 'stalled', 'no-route', 'lost'] as const satisfies readonly ActReason[];

export const EVENTS: { readonly [K in EventType]: EventSpec<EventOf<K>> } = {
  footstep: { code: 1, range: 'foundation', sound: true, fields: { ...SOUND, gait: { enum: GAITS } } },
  stance: { code: 2, range: 'foundation', sound: false, fields: { from: { enum: STANCES }, to: { enum: STANCES } } },
  land: { code: 3, range: 'foundation', sound: true, fields: { ...SOUND, speed: 'f32' } },
  shot: { code: 4, range: 'foundation', sound: false, fields: { x: 'f64', y: 'f64', z: 'f64', dx: 'f64', dy: 'f64', dz: 'f64' } },
  outcome: { code: 5, range: 'foundation', sound: false, fields: { status: { enum: ['succeeded', 'failed'] } } },
  noticed: { code: 10, range: 'perception', sound: false, fields: { target: 'u32', x: 'f32', y: 'f32', z: 'f32', distance: 'f32', zone: { enum: ZONES } } },
  detected: {
    code: 11,
    range: 'perception',
    sound: false,
    fields: {
      target: 'u32',
      x: 'f32',
      y: 'f32',
      z: 'f32',
      distance: 'f32',
      angle: 'f32',
      zone: { enum: ZONES },
      stance: 'f32',
      light: 'f32',
      skyline: 'f32',
      range: 'f32',
      movement: 'f32',
      cover: 'f32',
      rate: 'f32',
    },
  },
  heard: { code: 12, range: 'perception', sound: false, fields: { kind: { enum: HEARD }, clarity: 'f32', x: 'f32', y: 'f32', z: 'f32', radius: 'f32' } },
  alert: { code: 13, range: 'perception', sound: false, fields: { from: { enum: AWARE }, to: { enum: AWARE }, reason: { enum: REASONS } } },
  bark: { code: 14, range: 'perception', sound: true, fields: { ...SOUND, line: 'u8' } },
  noise: { code: 15, range: 'perception', sound: true, fields: { ...SOUND } },
  act: { code: 90, range: 'brain', sound: false, fields: { from: { enum: ACT_NAMES }, to: { enum: ACT_NAMES }, why: { enum: ACT_WHY_NAMES }, x: 'f32', z: 'f32', weight: 'f32' } },
};

export function isSound(e: SimEvent): e is Extract<SimEvent, SoundFields> {
  return EVENTS[e.type].sound;
}
