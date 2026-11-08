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
 * A shot leaves the muzzle: from the eye at the moment the player fired. With a rifle
 * (ballistics lane) the event is the bullet's whole path, the crack's included: its
 * launch point, time and direction (the bore's line), its muzzle speed and drag in the
 * mission's air, and the wind it flies in, so anyone can evaluate where it was at any
 * instant (ballistics/trajectory.ts, flightAt) with the gravity from the tuning. Its
 * strike is an 'impact' event caused by it. A shot with no bullet (no rifle carried) has
 * speed 0, and its direction is the aim.
 */
export interface ShotEvent extends EventBase {
  type: 'shot';
  x: number;
  y: number;
  z: number;
  /** Unit direction the bullet left in, or the aim. */
  dx: number;
  dy: number;
  dz: number;
  /** Muzzle speed, m/s; 0 for a shot with no bullet. */
  speed: number;
  /** The load's drag constant in the mission's air, per metre. */
  drag: number;
  /** The wind's velocity the bullet flies in, m/s. */
  wx: number;
  wz: number;
}

/** A shot's muzzle report: a sound at the muzzle, as loud as the suppressor and the load allow. */
export interface ReportEvent extends EventBase, SoundFields {
  type: 'report';
  /** 1 if the suppressor was fitted. */
  suppressed: number;
}

/** What a bullet struck. */
export type StrikeKind = 'terrain' | 'collider' | 'body';
/** Where on a body a bullet struck, or none. */
export type PartName = 'none' | 'head' | 'torso' | 'legs';

/**
 * A bullet's strike: a sound where it struck, by what it struck (the thump of a body, the
 * ring of steel). Caused by its shot. The shooter hears it after the flight and the way
 * back: about 1.28 s at 300 m.
 */
export interface ImpactEvent extends EventBase, SoundFields {
  type: 'impact';
  what: StrikeKind;
  /** The body's entity id or the collider's id; −1 for the terrain. */
  target: number;
  part: PartName;
  /** The bullet's speed at the strike, m/s. */
  speed: number;
  /** The struck surface's outward normal. */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Someone was killed by a strike (its cause): `source` fired, `victim` fell and is gone,
 * and `remains` is the body he left, spawned in the same tick.
 */
export interface DeathEvent extends EventBase {
  type: 'death';
  victim: number;
  remains: number;
  /** The victim's camp post (world.camp.guards), or −1. */
  post: number;
  part: Exclude<PartName, 'none'>;
  x: number;
  y: number;
  z: number;
}

/** A hit guard's cry before he falls: a sound at his head. */
export interface CryEvent extends EventBase, SoundFields {
  type: 'cry';
}

/** The rangefinder's reading: where its laser found something, and how far, to the metre. */
export interface RangedEvent extends EventBase {
  type: 'ranged';
  /** Metres, or −1 if nothing was within reach. */
  range: number;
  x: number;
  y: number;
  z: number;
  what: 'none' | StrikeKind;
}

/** The bolt worked, chambering the next round: a small sound by the shooter. */
export interface BoltEvent extends EventBase, SoundFields {
  type: 'bolt';
}

/** A thrown thing landing, or bouncing: a sound where it touched, as loud as it hit (ballistics lane). */
export interface ClatterEvent extends EventBase, SoundFields {
  type: 'clatter';
  /** The thrown entity's id. */
  thrown: number;
  /** Its speed at the touch, m/s. */
  speed: number;
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
export type ActCode = 'routine' | 'return' | 'look' | 'investigate' | 'search' | 'hold' | 'report' | 'task' | 'engage' | 'cover';
export type ReportCode = 'contact' | 'heard' | 'shot' | 'body' | 'missing' | 'clear' | 'claim';
export type TaskCode = 'investigate' | 'search' | 'check';
export type LevelCode = 'calm' | 'uneasy' | 'alert' | 'lockdown';
export type ActReason = 'start' | 'seen' | 'glimpse' | 'heard' | 'shot' | 'voice' | 'repeat' | 'contact' | 'calm' | 'arrived' | 'nothing' | 'stalled' | 'no-route' | 'lost' | 'told' | 'report' | 'ordered';

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

/** A guard's voice, saying a report aloud or into his radio (E4): a voice, which others hear (kernel/sound.ts, the one law). */
export interface CallEvent extends EventBase, SoundFields {
  type: 'call';
  /** 1 if he's on the radio: delivered across the camp when he finishes (brain/reports.ts). */
  radio: number;
}

/** A radio report arrives across the net (E4): delivered to the camp and every guard with a radio. Source: the guard who said it; cause: the percept he reported. */
export interface RadioEvent extends EventBase {
  type: 'radio';
  /** What he reported (brain/reports.ts, REPORT_KINDS), and where. */
  kind: ReportCode;
  x: number;
  z: number;
  radius: number;
}

/** The commander gave an order (E5): source the commander, `to` the guard, cause the report behind it. */
export interface OrderEvent extends EventBase {
  type: 'order';
  to: EntityId;
  task: TaskCode;
  x: number;
  z: number;
}

/** A radio check-in (E6): the operator calls a post; the post answers; or it stays silent past its deadline. Source: who's speaking. */
export interface CheckinEvent extends EventBase {
  type: 'checkin';
  /** The post (world.camp.guards index). */
  post: number;
  stage: 'call' | 'answer' | 'silence';
}

/** The camp's alert level changed (E5). Source: the commander; cause: the report behind it. */
export interface LevelEvent extends EventBase {
  type: 'level';
  from: LevelCode;
  to: LevelCode;
}

/** The player is hit (E10): which part, and how many hits they've taken. Source: the shooter; cause: the impact. */
export interface HurtEvent extends EventBase {
  type: 'hurt';
  part: 'head' | 'torso' | 'legs';
  hits: number;
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
  | ActEvent
  | CallEvent
  | RadioEvent
  | OrderEvent
  | LevelEvent
  | CheckinEvent
  | HurtEvent
  | ReportEvent
  | ImpactEvent
  | DeathEvent
  | CryEvent
  | RangedEvent
  | BoltEvent
  | ClatterEvent;
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
const LEVELS = ['calm', 'uneasy', 'alert', 'lockdown'] as const satisfies readonly LevelCode[];
const REPORT_CODES = ['contact', 'heard', 'shot', 'body', 'missing', 'clear', 'claim'] as const satisfies readonly ReportCode[];
const ACT_NAMES = ['routine', 'return', 'look', 'investigate', 'search', 'hold', 'report', 'task', 'engage', 'cover'] as const satisfies readonly ActCode[];
const ACT_WHY_NAMES = ['start', 'seen', 'glimpse', 'heard', 'shot', 'voice', 'repeat', 'contact', 'calm', 'arrived', 'nothing', 'stalled', 'no-route', 'lost', 'told', 'report', 'ordered'] as const satisfies readonly ActReason[];
const STRIKES = ['terrain', 'collider', 'body'] as const satisfies readonly StrikeKind[];
const PARTS = ['none', 'head', 'torso', 'legs'] as const satisfies readonly PartName[];

export const EVENTS: { readonly [K in EventType]: EventSpec<EventOf<K>> } = {
  footstep: { code: 1, range: 'foundation', sound: true, fields: { ...SOUND, gait: { enum: GAITS } } },
  stance: { code: 2, range: 'foundation', sound: false, fields: { from: { enum: STANCES }, to: { enum: STANCES } } },
  land: { code: 3, range: 'foundation', sound: true, fields: { ...SOUND, speed: 'f32' } },
  shot: {
    code: 4,
    range: 'foundation',
    sound: false,
    fields: { x: 'f64', y: 'f64', z: 'f64', dx: 'f64', dy: 'f64', dz: 'f64', speed: 'f64', drag: 'f64', wx: 'f64', wz: 'f64' },
  },
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
  report: { code: 30, range: 'ballistics', sound: true, fields: { ...SOUND, suppressed: 'u8' } },
  impact: {
    code: 31,
    range: 'ballistics',
    sound: true,
    fields: { ...SOUND, what: { enum: STRIKES }, target: 'i32', part: { enum: PARTS }, speed: 'f32', nx: 'f32', ny: 'f32', nz: 'f32' },
  },
  death: {
    code: 32,
    range: 'ballistics',
    sound: false,
    fields: { victim: 'u32', remains: 'u32', post: 'i32', part: { enum: ['head', 'torso', 'legs'] }, x: 'f32', y: 'f32', z: 'f32' },
  },
  cry: { code: 33, range: 'ballistics', sound: true, fields: { ...SOUND } },
  ranged: { code: 34, range: 'ballistics', sound: false, fields: { range: 'f32', x: 'f32', y: 'f32', z: 'f32', what: { enum: ['none', ...STRIKES] } } },
  bolt: { code: 35, range: 'ballistics', sound: true, fields: { ...SOUND } },
  clatter: { code: 36, range: 'ballistics', sound: true, fields: { ...SOUND, thrown: 'u32', speed: 'f32' } },
  call: { code: 91, range: 'brain', sound: true, fields: { ...SOUND, radio: 'u8' } },
  radio: { code: 92, range: 'brain', sound: false, fields: { kind: { enum: REPORT_CODES }, x: 'f32', z: 'f32', radius: 'f32' } },
  order: { code: 93, range: 'brain', sound: false, fields: { to: 'u32', task: { enum: ['investigate', 'search', 'check'] }, x: 'f32', z: 'f32' } },
  hurt: { code: 96, range: 'brain', sound: false, fields: { part: { enum: ['head', 'torso', 'legs'] }, hits: 'u8' } },
  checkin: { code: 95, range: 'brain', sound: false, fields: { post: 'i32', stage: { enum: ['call', 'answer', 'silence'] } } },
  level: { code: 94, range: 'brain', sound: false, fields: { from: { enum: LEVELS }, to: { enum: LEVELS } } },
  act: { code: 90, range: 'brain', sound: false, fields: { from: { enum: ACT_NAMES }, to: { enum: ACT_NAMES }, why: { enum: ACT_WHY_NAMES }, x: 'f32', z: 'f32', weight: 'f32' } },
};

export function isSound(e: SimEvent): e is Extract<SimEvent, SoundFields> {
  return EVENTS[e.type].sound;
}
