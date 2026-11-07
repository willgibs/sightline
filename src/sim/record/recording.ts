import type { Tuning } from '../../config/tuning';
import { assertTuning, tuningShapeProblems } from '../../config/validate';
import { hashValue } from '../core/hash';
import type { SimEvent } from '../events';
import { worldFingerprint } from '../gen/world';
import { neutralInput, type TickInput } from '../input';
import type { MissionSpec } from '../mission';
import type { Gait, Stance } from '../motor/body';
import type { SimFault, Simulation } from '../sim';
import { STATE_SCHEMA, stateParts } from '../state';
import { GEN_VERSION, SIM_VERSION } from '../version';
import { ByteReader, ByteWriter, RecordingFormatError, concat } from './bytes';
import { readEvent, writeEvent } from './eventCodec';
import { readInput, writeInput } from './inputCodec';

/**
 * Mission recordings: a file of tagged tracks.
 *
 *   HEAD  the header (JSON): versions, the build, the mission spec, the tuning at the
 *         start, fingerprints of the world and the first state, counts.
 *   INPT  every tick's input. Re-simulates the mission exactly: the source of truth.
 *   CHKP  the state's hash every 10 s, whole and part by part, so a re-simulation that
 *         disagrees says when and where (a guard, the player, the random streams).
 *   TUNE  tuning changed mid-run (hot reload) and the tick it applies from, so a run
 *         tuned while playing still re-simulates.
 *   STAT  the state at 10 Hz, for the replay and telemetry without re-simulating.
 *   EVNT  every event.
 *   ANNO  what isn't simulation: markers, notes, pauses, view changes.
 *
 * STAT and EVNT are derived from INPT, and the same build can regenerate them. A reader
 * skips tracks it doesn't know, so adding a track needs no new version.
 *
 * File: "SLRC", u32 version, u32 track count, then each track: a 4-byte tag, a u32
 * length and its bytes. Little-endian; nothing after the last track. A recording is
 * often a file from elsewhere, so reading checks everything before trusting anything:
 * sizes, the header's every field, and that each track holds what the header says.
 */

/**
 * 6: tagged tracks; checkpoints part by part; tuning changes and annotations recorded.
 * 7: the mission spec carries its environment. 8: a run that ended in a fault says so.
 */
export const RECORDING_VERSION = 8;
const MAGIC = [0x53, 0x4c, 0x52, 0x43]; // SLRC
/** Larger than a day of play. Anything bigger is not a recording. */
export const MAX_RECORDING_BYTES = 512 * 1024 * 1024;
const MAX_HEADER_BYTES = 1024 * 1024;

export interface RecordingHeader {
  format: 'sightline-recording';
  version: number;
  /** The build that made it (a commit), or '' if unknown. */
  build: string;
  simVersion: number;
  genVersion: number;
  stateSchema: number;
  mission: MissionSpec;
  /** The exact tuning at the start, so re-simulation never depends on today's defaults. */
  tuning: Tuning;
  tuningHash: string;
  /** What generation built; a different valley is caught before re-simulating. */
  worldFingerprint: string;
  /** The state's hash before the first tick. */
  startHash: string;
  tickHz: number;
  /** Ticks between state samples. */
  stateEvery: number;
  /** Ticks between checkpoints. */
  checkpointEvery: number;
  ticks: number;
  /**
   * The state's hash after the last tick. For a run that ended in a fault, after the
   * failing tick threw: a deterministic fault leaves the same partial state every time.
   * Zeros if that state could not be hashed.
   */
  finalHash: string;
  /** The tick that failed and why, when the run ended in a fault; its input is the last one recorded. */
  fault: SimFault | null;
  createdAt: string;
}

export interface Checkpoint {
  tick: number;
  hash: string;
  /** The state's parts and their hashes (state.ts, stateParts). */
  parts: Array<[name: string, hash: string]>;
}

export interface TuningChange {
  /** The first tick that runs with it. */
  tick: number;
  tuning: Tuning;
}

/** Something that isn't simulation, at a tick: a marker, a note, a pause. */
export interface Annotation {
  tick: number;
  kind: string;
  text?: string;
}

const STANCES: Stance[] = ['stand', 'crouch', 'prone'];
const GAITS: Gait[] = ['idle', 'sprint', 'walk', 'crouch', 'crawl'];

export interface RecordedState {
  tick: number;
  px: number;
  py: number;
  pz: number;
  yaw: number;
  pitch: number;
  eye: number;
  speed: number;
  stance: Stance;
  gait: Gait;
  /** Guard entity ids, and x, y, z, yaw, headYaw per guard. */
  guardIds: number[];
  guards: number[];
}

export class Recorder {
  readonly mission: MissionSpec;
  readonly tuning: Tuning;
  readonly stateEvery: number;
  readonly checkpointEvery: number;
  private readonly sim: Simulation;
  private readonly startHash: string;
  private readonly fingerprint: string;
  private readonly inputs = new ByteWriter();
  private readonly states = new ByteWriter();
  private readonly events = new ByteWriter();
  private readonly checkpoints = new ByteWriter();
  private readonly tunings: TuningChange[] = [];
  private readonly annotations: Annotation[] = [];
  private fault: SimFault | null = null;
  ticks = 0;

  constructor(
    sim: Simulation,
    private readonly build = '',
    checkpointSeconds = 10,
  ) {
    if (sim.tick !== 0) throw new Error('Recorder must start on a fresh simulation (tick 0)');
    this.sim = sim;
    this.mission = structuredClone(sim.world.spec);
    this.tuning = structuredClone(sim.tuning);
    this.stateEvery = Math.max(1, Math.round(sim.tuning.sim.tickHz / sim.tuning.sim.recordHz));
    this.checkpointEvery = Math.max(1, Math.round(sim.tuning.sim.tickHz * checkpointSeconds));
    this.startHash = sim.hash();
    this.fingerprint = worldFingerprint(sim.world);
  }

  /**
   * Call right after every `sim.step()`, with the events it returned. Stores the exact
   * input the simulation ran on (`sim.lastInput`), so a recording always replays.
   */
  record(sim: Simulation, events: readonly SimEvent[]): void {
    if (sim !== this.sim) throw new Error('Recorder records only the simulation it was made for');
    if (this.fault) throw new Error(`The run ended in a fault at tick ${this.fault.tick}`);
    if (sim.tick !== this.ticks + 1) throw new Error(`Recorder missed a tick: at ${sim.tick}, recorded ${this.ticks}`);
    writeInput(this.inputs, sim.lastInput);
    if (sim.tick % this.stateEvery === 0) writeState(this.states, sim);
    for (const e of events) writeEvent(this.events, e);
    if (sim.tick % this.checkpointEvery === 0) writeCheckpoint(this.checkpoints, sim);
    this.ticks++;
  }

  /**
   * Call when `sim.step()` threw: keeps the failing tick's input and the fault, so the
   * recording reproduces the failure. The recording ends there.
   */
  recordFault(sim: Simulation): void {
    if (sim !== this.sim) throw new Error('Recorder records only the simulation it was made for');
    if (!sim.fault || this.fault || sim.fault.tick !== this.ticks + 1) return;
    writeInput(this.inputs, sim.lastInput);
    this.fault = { ...sim.fault };
    this.ticks++;
  }

  /** The run ended in a fault (recordFault). */
  get faulted(): boolean {
    return this.fault !== null;
  }

  /** The simulation's tuning changed (hot reload): it applies from the next tick. */
  tuningChanged(sim: Simulation): void {
    if (sim !== this.sim) throw new Error('Recorder records only the simulation it was made for');
    const change = { tick: sim.tick + 1, tuning: structuredClone(sim.tuning) };
    // Two changes between the same two ticks: the later one is what the next tick runs with.
    if (this.tunings.at(-1)?.tick === change.tick) this.tunings[this.tunings.length - 1] = change;
    else this.tunings.push(change);
  }

  /** Notes something that isn't simulation at the current tick: a marker, a pause. */
  annotate(kind: string, text?: string): void {
    this.annotations.push(text === undefined ? { tick: this.sim.tick, kind } : { tick: this.sim.tick, kind, text });
  }

  get sizes(): { inputs: number; states: number; events: number } {
    return { inputs: this.inputs.length, states: this.states.length, events: this.events.length };
  }

  /** Closes the recording. `createdAt` is an ISO timestamp from the caller (the simulation has no clock). */
  finish(sim: Simulation, createdAt = ''): Recording {
    if (sim !== this.sim) throw new Error('Recorder records only the simulation it was made for');
    const header: RecordingHeader = {
      format: 'sightline-recording',
      version: RECORDING_VERSION,
      build: this.build,
      simVersion: SIM_VERSION,
      genVersion: GEN_VERSION,
      stateSchema: STATE_SCHEMA,
      mission: structuredClone(this.mission),
      tuning: structuredClone(this.tuning),
      tuningHash: hashValue(this.tuning),
      worldFingerprint: this.fingerprint,
      startHash: this.startHash,
      tickHz: this.tuning.sim.tickHz,
      stateEvery: this.stateEvery,
      checkpointEvery: this.checkpointEvery,
      ticks: this.ticks,
      finalHash: hashOrZeros(sim),
      fault: this.fault ? { ...this.fault } : null,
      createdAt,
    };
    return new Recording(header, {
      INPT: concat(this.inputs.parts()),
      CHKP: concat(this.checkpoints.parts()),
      TUNE: encodeJson(this.tunings),
      STAT: concat(this.states.parts()),
      EVNT: concat(this.events.parts()),
      ANNO: encodeJson(this.annotations),
    });
  }
}

const NO_HASH = '0000000000000000';

/** The state's hash; a state a failing tick left unhashable (not plain data) gets zeros. */
export function hashOrZeros(sim: Simulation): string {
  try {
    return sim.hash();
  } catch {
    return NO_HASH;
  }
}

function writeState(w: ByteWriter, sim: Simulation): void {
  const p = sim.player;
  w.u32(sim.tick);
  w.f32(p.x);
  w.f32(p.y);
  w.f32(p.z);
  w.f32(p.yaw);
  w.f32(p.pitch);
  w.f32(p.eyeHeight);
  w.f32(p.speed);
  w.u8(STANCES.indexOf(p.stance));
  w.u8(GAITS.indexOf(p.gait));
  w.u16(sim.guards.length);
  for (const g of sim.guards) {
    w.u32(g.id);
    w.f32(g.body.x);
    w.f32(g.body.y);
    w.f32(g.body.z);
    w.f32(g.body.yaw);
    w.f32(g.guard.headYaw);
  }
}

function writeCheckpoint(w: ByteWriter, sim: Simulation): void {
  w.u32(sim.tick);
  writeDigest(w, sim.hash());
  const parts = stateParts(sim.state);
  w.u16(parts.length);
  for (const [name, hash] of parts) {
    const bytes = new TextEncoder().encode(name);
    w.u8(bytes.length);
    w.bytes(bytes);
    writeDigest(w, hash);
  }
}

/** A 64-bit digest (16 hex digits) in 8 bytes. */
function writeDigest(w: ByteWriter, hex: string): void {
  w.u32(parseInt(hex.slice(0, 8), 16));
  w.u32(parseInt(hex.slice(8, 16), 16));
}

function readDigest(r: ByteReader): string {
  return r.u32().toString(16).padStart(8, '0') + r.u32().toString(16).padStart(8, '0');
}

function encodeJson(v: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(v));
}

function decodeJson(bytes: Uint8Array, what: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new RecordingFormatError(`Corrupt recording: ${what} is not readable`);
  }
}

type TrackTag = 'INPT' | 'CHKP' | 'TUNE' | 'STAT' | 'EVNT' | 'ANNO';
const TRACKS: readonly TrackTag[] = ['INPT', 'CHKP', 'TUNE', 'STAT', 'EVNT', 'ANNO'];

export class Recording {
  private inputIndex: Uint32Array | null = null;
  private stateIndex: Uint32Array | null = null;
  private decodedEvents: SimEvent[] | null = null;
  private decodedCheckpoints: Checkpoint[] | null = null;

  constructor(
    readonly header: RecordingHeader,
    readonly tracks: Readonly<Record<TrackTag, Uint8Array>>,
  ) {}

  get inputs(): Uint8Array {
    return this.tracks.INPT;
  }

  /** Reads and checks every track against the header; throws RecordingFormatError on any mismatch. */
  validate(): void {
    this.offsets();
    this.states();
    this.events();
    const cps = this.checkpoints();
    if (cps.length !== Math.floor(this.header.ticks / this.header.checkpointEvery)) {
      throw new RecordingFormatError('Corrupt recording: checkpoints and ticks disagree');
    }
    cps.forEach((c, k) => {
      if (c.tick !== (k + 1) * this.header.checkpointEvery) throw new RecordingFormatError('Corrupt recording: a checkpoint is out of place');
    });
    let last = 0;
    for (const t of this.tuningChanges()) {
      if (t.tick <= last || t.tick > this.header.ticks + 1) throw new RecordingFormatError('Corrupt recording: tuning changes out of order');
      last = t.tick;
    }
    this.annotations();
  }

  /** Where each tick's input starts in the input track, checking it holds exactly `ticks` inputs. */
  private offsets(): Uint32Array {
    if (!this.inputIndex) {
      const n = this.header.ticks;
      const index = new Uint32Array(n);
      const r = new ByteReader(this.tracks.INPT);
      const scratch = neutralInput();
      for (let i = 0; i < n; i++) {
        index[i] = r.offset;
        readInput(r, scratch);
      }
      if (r.remaining !== 0) throw new RecordingFormatError(`Corrupt recording: input past tick ${n}`);
      this.inputIndex = index;
    }
    return this.inputIndex;
  }

  readInput(i: number, out: TickInput): TickInput {
    const r = new ByteReader(this.tracks.INPT);
    r.offset = this.offsets()[i]!;
    return readInput(r, out);
  }

  private states(): Uint32Array {
    if (!this.stateIndex) {
      const r = new ByteReader(this.tracks.STAT);
      const at: number[] = [];
      while (r.remaining > 0) {
        at.push(r.offset);
        r.offset += 34;
        const n = r.u16();
        r.offset += n * 24;
        if (r.offset > this.tracks.STAT.length) throw new RecordingFormatError('Corrupt recording: a state sample is truncated');
      }
      this.stateIndex = Uint32Array.from(at);
    }
    return this.stateIndex;
  }

  get stateCount(): number {
    return this.states().length;
  }

  readState(k: number, out?: RecordedState): RecordedState {
    const r = new ByteReader(this.tracks.STAT);
    r.offset = this.states()[k]!;
    const s: RecordedState = out ?? { tick: 0, px: 0, py: 0, pz: 0, yaw: 0, pitch: 0, eye: 0, speed: 0, stance: 'stand', gait: 'idle', guardIds: [], guards: [] };
    s.tick = r.u32();
    s.px = r.f32();
    s.py = r.f32();
    s.pz = r.f32();
    s.yaw = r.f32();
    s.pitch = r.f32();
    s.eye = r.f32();
    s.speed = r.f32();
    s.stance = STANCES[r.u8()] ?? 'stand';
    s.gait = GAITS[r.u8()] ?? 'idle';
    const n = r.u16();
    s.guardIds.length = n;
    s.guards.length = n * 5;
    for (let i = 0; i < n; i++) {
      s.guardIds[i] = r.u32();
      for (let f = 0; f < 5; f++) s.guards[i * 5 + f] = r.f32();
    }
    return s;
  }

  private events(): SimEvent[] {
    if (!this.decodedEvents) {
      const r = new ByteReader(this.tracks.EVNT);
      const out: SimEvent[] = [];
      while (r.remaining > 0) out.push(readEvent(r));
      this.decodedEvents = out;
    }
    return this.decodedEvents;
  }

  get eventCount(): number {
    return this.events().length;
  }

  /** Every recorded event, decoded (copies: change them freely). */
  readEvents(): SimEvent[] {
    return this.events().map((e) => ({ ...e }));
  }

  checkpoints(): Checkpoint[] {
    if (!this.decodedCheckpoints) {
      const r = new ByteReader(this.tracks.CHKP);
      const out: Checkpoint[] = [];
      const text = new TextDecoder('utf-8', { fatal: true });
      while (r.remaining > 0) {
        const tick = r.u32();
        const hash = readDigest(r);
        const n = r.u16();
        const parts: Array<[string, string]> = [];
        for (let k = 0; k < n; k++) {
          let name: string;
          try {
            name = text.decode(r.take(r.u8()));
          } catch (e) {
            if (e instanceof RecordingFormatError) throw e;
            throw new RecordingFormatError('Corrupt recording: a checkpoint part name is not text');
          }
          parts.push([name, readDigest(r)]);
        }
        out.push({ tick, hash, parts });
      }
      this.decodedCheckpoints = out;
    }
    return this.decodedCheckpoints;
  }

  tuningChanges(): TuningChange[] {
    const list = decodeJson(this.tracks.TUNE, 'the tuning track');
    if (!Array.isArray(list)) throw new RecordingFormatError('Corrupt recording: the tuning track is not a list');
    return list.map((t: unknown) => {
      const c = t as TuningChange;
      if (!c || typeof c !== 'object' || !Number.isInteger(c.tick)) throw new RecordingFormatError('Corrupt recording: a tuning change has no tick');
      try {
        assertTuning(c.tuning);
      } catch (e) {
        throw new RecordingFormatError(`Corrupt recording: tuning change at tick ${c.tick}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (hashValue(c.tuning.gen) !== hashValue(this.header.tuning.gen)) {
        throw new RecordingFormatError(`Corrupt recording: tuning change at tick ${c.tick} changes generation`);
      }
      return { tick: c.tick, tuning: c.tuning };
    });
  }

  annotations(): Annotation[] {
    const list = decodeJson(this.tracks.ANNO, 'the annotation track');
    if (!Array.isArray(list)) throw new RecordingFormatError('Corrupt recording: the annotation track is not a list');
    for (const a of list as Annotation[]) {
      if (!a || !Number.isInteger(a.tick) || typeof a.kind !== 'string' || (a.text !== undefined && typeof a.text !== 'string')) {
        throw new RecordingFormatError('Corrupt recording: an annotation is malformed');
      }
    }
    return list as Annotation[];
  }

  /** The file, as parts for a Blob (no single copy of the whole recording). */
  toParts(): Uint8Array[] {
    const head = encodeJson(this.header);
    const w = new ByteWriter(64);
    for (const b of MAGIC) w.u8(b);
    w.u32(RECORDING_VERSION);
    w.u32(1 + TRACKS.length);
    const parts: Uint8Array[] = [w.toBytes()];
    const track = (tag: string, bytes: Uint8Array): void => {
      const t = new ByteWriter(16);
      for (let i = 0; i < 4; i++) t.u8(tag.charCodeAt(i));
      t.u32(bytes.length);
      parts.push(t.toBytes(), bytes);
    };
    track('HEAD', head);
    for (const tag of TRACKS) track(tag, this.tracks[tag]);
    return parts;
  }

  toBytes(): Uint8Array {
    return concat(this.toParts());
  }

  static fromBytes(bytes: Uint8Array): Recording {
    if (bytes.length > MAX_RECORDING_BYTES) throw new RecordingFormatError('Not a Sightline recording: far too large');
    const r = new ByteReader(bytes);
    for (const b of MAGIC) if (r.remaining === 0 || r.u8() !== b) throw new RecordingFormatError('Not a Sightline recording');
    const version = r.u32();
    if (version !== RECORDING_VERSION) throw new RecordingFormatError(`Recording format ${version} is not ${RECORDING_VERSION}; it was made by another build`);
    const count = r.u32();
    if (count > 64) throw new RecordingFormatError('Corrupt recording: too many tracks');
    const found = new Map<string, Uint8Array>();
    for (let k = 0; k < count; k++) {
      const tag = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
      const length = r.u32();
      if (found.has(tag)) throw new RecordingFormatError(`Corrupt recording: two ${tag} tracks`);
      found.set(tag, r.sub(length)); // unknown tags are kept but ignored
    }
    if (r.remaining !== 0) throw new RecordingFormatError('Corrupt recording: bytes after the last track');
    const head = found.get('HEAD');
    if (!head) throw new RecordingFormatError('Corrupt recording: no header');
    if (head.length > MAX_HEADER_BYTES) throw new RecordingFormatError('Corrupt recording: the header is too large');
    const header = checkHeader(decodeJson(head, 'the header'));
    for (const tag of ['INPT', 'CHKP'] as const) if (!found.has(tag)) throw new RecordingFormatError(`Corrupt recording: no ${tag} track`);
    // Every tick's input takes at least 13 bytes: checked before anything is sized by `ticks`.
    const inputBytes = found.get('INPT')!.length;
    if (header.ticks * 13 > inputBytes) throw new RecordingFormatError(`Corrupt recording: ${header.ticks} ticks in ${inputBytes} bytes of input`);
    const empty = new Uint8Array(0);
    const list = new TextEncoder().encode('[]');
    const rec = new Recording(header, {
      INPT: found.get('INPT')!,
      CHKP: found.get('CHKP')!,
      TUNE: found.get('TUNE') ?? list,
      STAT: found.get('STAT') ?? empty,
      EVNT: found.get('EVNT') ?? empty,
      ANNO: found.get('ANNO') ?? list,
    });
    rec.validate();
    return rec;
  }
}

/**
 * Checks every field of a header from a file before it is trusted: its tuning drives
 * generation and its counts size arrays. Unknown fields are refused too: they mean a
 * format this build doesn't know.
 */
function checkHeader(v: unknown): RecordingHeader {
  const fail = (what: string): never => {
    throw new RecordingFormatError(`Corrupt recording: ${what}`);
  };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('no header');
  const h = v as Record<string, unknown>;
  const KEYS = [
    'format',
    'version',
    'build',
    'simVersion',
    'genVersion',
    'stateSchema',
    'mission',
    'tuning',
    'tuningHash',
    'worldFingerprint',
    'startHash',
    'tickHz',
    'stateEvery',
    'checkpointEvery',
    'ticks',
    'finalHash',
    'fault',
    'createdAt',
  ];
  for (const k of Object.keys(h)) if (!KEYS.includes(k)) fail(`unknown header field ${k}`);
  for (const k of KEYS) if (!(k in h)) fail(`no ${k}`);
  const whole = (x: unknown, min: number, max: number): boolean => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
  const text = (x: unknown, max: number): boolean => typeof x === 'string' && x.length <= max;
  const digest = (x: unknown): boolean => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x);
  if (h.format !== 'sightline-recording' || h.version !== RECORDING_VERSION) fail('format');
  if (!text(h.build, 200) || !text(h.createdAt, 64)) fail('build or date');
  if (!whole(h.simVersion, 1, 1e6) || !whole(h.genVersion, 1, 1e6) || !whole(h.stateSchema, 1, 1e6)) fail('versions');
  const m = h.mission as Record<string, unknown> | null;
  if (
    !m ||
    typeof m !== 'object' ||
    Object.keys(m).sort().join() !== 'env,genVersion,insertion,seed,terrain' ||
    !envOk(m.env) ||
    !text(m.seed, 64) ||
    !whole(m.genVersion, 1, 1e6) ||
    (m.insertion !== 'overlook' && m.insertion !== 'edge') ||
    JSON.stringify(m.terrain) !== '{"kind":"procedural","generator":"valley"}'
  ) {
    fail('mission');
  }
  // Tuning that is shaped differently comes from a build with other tuning values, not
  // from damage: say so, and which build, so the right build can replay it.
  const shape = tuningShapeProblems(h.tuning);
  if (shape.length > 0) {
    const more = shape.length > 3 ? `; and ${shape.length - 3} more` : '';
    throw new RecordingFormatError(
      `This recording was made by ${h.build ? `build ${String(h.build)}` : 'another build'}, whose tuning differs from this one's (${shape.slice(0, 3).join('; ')}${more}); replay it with that build`,
    );
  }
  try {
    assertTuning(h.tuning);
  } catch (e) {
    fail(e instanceof Error ? e.message : 'tuning');
  }
  if (hashValue(h.tuning) !== h.tuningHash) fail('tuning does not match its hash');
  if (!digest(h.worldFingerprint) || !digest(h.startHash) || !digest(h.finalHash)) fail('fingerprints');
  const tuning = h.tuning as Tuning;
  if (h.tickHz !== tuning.sim.tickHz) fail('tick rate');
  if (!whole(h.stateEvery, 1, 1e6) || !whole(h.checkpointEvery, 1, 1e8) || !whole(h.ticks, 0, 2147483647)) fail('counts');
  if (h.fault !== null) {
    const f = h.fault as Record<string, unknown>;
    if (!f || typeof f !== 'object' || Object.keys(f).sort().join() !== 'message,system,tick' || f.tick !== h.ticks || !text(f.system, 200) || !text(f.message, 4000)) {
      fail('fault');
    }
  }
  return h as unknown as RecordingHeader;
}

/** An environment from a file: every field present, finite and within reason. */
function envOk(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (Object.keys(e).sort().join() !== 'altitudeM,clockRate,dayOfYear,latitudeDeg,temperatureC,timeOfDayMin,wind') return false;
  const num = (x: unknown, lo: number, hi: number): boolean => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const w = e.wind as Record<string, unknown> | null;
  return (
    num(e.timeOfDayMin, 0, 1440) &&
    num(e.clockRate, 0, 3600) &&
    num(e.latitudeDeg, -90, 90) &&
    num(e.dayOfYear, 0, 366) &&
    num(e.altitudeM, -500, 9000) &&
    num(e.temperatureC, -60, 60) &&
    !!w &&
    typeof w === 'object' &&
    Object.keys(w).sort().join() === 'fromDeg,speed' &&
    num(w.speed, 0, 60) &&
    num(w.fromDeg, -360, 360)
  );
}
