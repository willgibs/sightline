import type { Tuning } from '../../config/tuning';
import { hashValue } from '../core/hash';
import type { Gait, Stance } from '../motor/body';
import type { SimEvent } from '../events';
import type { SpawnKind } from '../gen/world';
import { neutralInput, type TickInput } from '../input';
import type { Simulation } from '../sim';
import { ByteReader, ByteWriter, RecordingFormatError } from './bytes';
import { readEvent, writeEvent } from './eventCodec';
import { readInput, writeInput } from './inputCodec';
import { assertTuning } from '../../config/validate';

/**
 * Mission recordings.
 *
 * A recording holds two things. The input track (every tick, 13 bytes and any commands) can re-simulate
 * the mission exactly, which turns any playtest into a reproducible bug report or a
 * regression test. The state track (10 Hz) and the event track drive the debrief replay
 * in Phase 2 and playtest telemetry, without re-simulating anything.
 *
 * File layout: "SLRC", u32 version, then four length-prefixed blocks: header JSON,
 * inputs, states, events. All numbers little-endian.
 */

/**
 * 2: checkpoints hash the whole state tree (sim/state.ts).
 * 3: the tree's layout changed (STATE_SCHEMA 2), so older checkpoints can't be compared.
 * 4: events from the registry (ids, times, sources, causes); STATE_SCHEMA 3.
 * 5: held states and commands in the input track; STATE_SCHEMA 4 (pose history).
 */
export const RECORDING_VERSION = 5;
const MAGIC = [0x53, 0x4c, 0x52, 0x43]; // SLRC

export interface RecordingHeader {
  format: 'sightline-recording';
  version: number;
  seed: string;
  spawn: SpawnKind;
  /** The exact tuning played with, so re-simulation never depends on today's defaults. */
  tuning: Tuning;
  tuningHash: string;
  tickHz: number;
  /** Ticks between state samples. */
  stateEvery: number;
  /** Ticks between checkpoint hashes. */
  checkpointEvery: number;
  guardCount: number;
  ticks: number;
  finalHash: string;
  checkpoints: string[];
  /** Set when tuning changed mid-mission (hot reload); such recordings can't be re-simulated. */
  tuningChanged: boolean;
  createdAt: string;
}

const STANCES: Stance[] = ['stand', 'crouch', 'prone'];
const GAITS: Gait[] = ['idle', 'sprint', 'walk', 'crouch', 'crawl'];
const STATE_BASE = 36;
const STATE_PER_GUARD = 20;

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
  /** x, y, z, yaw, headYaw per guard. */
  guards: Float32Array;
}

export class Recorder {
  readonly seed: string;
  readonly spawn: SpawnKind;
  readonly tuning: Tuning;
  readonly stateEvery: number;
  readonly checkpointEvery: number;
  private readonly guardCount: number;
  private readonly inputs = new ByteWriter(64 * 1024);
  private readonly states = new ByteWriter(64 * 1024);
  private readonly events = new ByteWriter(16 * 1024);
  private readonly checkpoints: string[] = [];
  private tuningChanged = false;
  ticks = 0;

  constructor(sim: Simulation, spawn: SpawnKind, checkpointSeconds = 10) {
    if (sim.tick !== 0) throw new Error('Recorder must start on a fresh simulation (tick 0)');
    this.seed = sim.world.seed;
    this.spawn = spawn;
    this.tuning = structuredClone(sim.tuning);
    this.stateEvery = Math.max(1, Math.round(sim.tuning.sim.tickHz / sim.tuning.sim.recordHz));
    this.checkpointEvery = Math.max(1, Math.round(sim.tuning.sim.tickHz * checkpointSeconds));
    this.guardCount = sim.guards.length;
  }

  /**
   * Call right after every `sim.step()`, with the events it returned. Stores the exact
   * input the simulation ran on (`sim.lastInput`), so a recording always replays.
   */
  record(sim: Simulation, events: readonly SimEvent[]): void {
    if (sim.tick !== this.ticks + 1) throw new Error(`Recorder missed a tick: at ${sim.tick}, recorded ${this.ticks}`);
    writeInput(this.inputs, sim.lastInput);

    if (sim.tick % this.stateEvery === 0) {
      const p = sim.player;
      const s = this.states;
      s.u32(sim.tick);
      s.f32(p.x);
      s.f32(p.y);
      s.f32(p.z);
      s.f32(p.yaw);
      s.f32(p.pitch);
      s.f32(p.eyeHeight);
      s.f32(p.speed);
      s.u8(STANCES.indexOf(p.stance));
      s.u8(GAITS.indexOf(p.gait));
      s.u16(0);
      for (const g of sim.guards) {
        s.f32(g.x);
        s.f32(g.y);
        s.f32(g.z);
        s.f32(g.yaw);
        s.f32(g.headYaw);
      }
    }

    for (const e of events) writeEvent(this.events, e);

    if (sim.tick % this.checkpointEvery === 0) this.checkpoints.push(sim.hash());
    this.ticks++;
  }

  /** Marks the recording as not re-simulatable (tuning changed mid-mission). */
  markTuningChanged(): void {
    this.tuningChanged = true;
  }

  get sizes(): { inputs: number; states: number; events: number } {
    return { inputs: this.inputs.length, states: this.states.length, events: this.events.length };
  }

  /** Closes the recording. `createdAt` is an ISO timestamp from the caller (the simulation has no clock). */
  finish(sim: Simulation, createdAt = ''): Recording {
    const header: RecordingHeader = {
      format: 'sightline-recording',
      version: RECORDING_VERSION,
      seed: this.seed,
      spawn: this.spawn,
      tuning: this.tuning,
      tuningHash: hashValue(this.tuning),
      tickHz: this.tuning.sim.tickHz,
      stateEvery: this.stateEvery,
      checkpointEvery: this.checkpointEvery,
      guardCount: this.guardCount,
      ticks: this.ticks,
      finalHash: sim.hash(),
      checkpoints: [...this.checkpoints],
      tuningChanged: this.tuningChanged,
      createdAt,
    };
    return new Recording(header, this.inputs.toBytes(), this.states.toBytes(), this.events.toBytes());
  }
}

/**
 * A recording is often a file from elsewhere. Check the header before its tuning drives
 * generation: the tuning must be valid and match its hash, and the counts must agree
 * with the data. (Recording format v2 replaces this with a full validator.)
 */
function checkHeader(h: RecordingHeader, inputBytes: number): void {
  const fail = (what: string): never => {
    throw new Error(`Corrupt recording: ${what}`);
  };
  if (!h || typeof h !== 'object') fail('no header');
  if (typeof h.seed !== 'string' || (h.spawn !== 'overlook' && h.spawn !== 'edge')) fail('seed or spawn');
  const whole = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
  // Every tick's input takes at least 13 bytes; checked before anything is sized by `ticks`.
  if (!whole(h.ticks, 0) || h.ticks * 13 > inputBytes) fail(`${String(h.ticks)} ticks in ${inputBytes} bytes of input`);
  if (!whole(h.checkpointEvery, 1) || !whole(h.stateEvery, 1) || !whole(h.guardCount, 0) || h.guardCount > 4096) fail('counts');
  if (!Array.isArray(h.checkpoints) || h.checkpoints.length !== Math.floor(h.ticks / h.checkpointEvery)) fail('checkpoints');
  try {
    assertTuning(h.tuning);
  } catch (e) {
    fail(e instanceof Error ? e.message : 'tuning');
  }
  if (hashValue(h.tuning) !== h.tuningHash) fail('tuning does not match its hash');
}

export class Recording {
  constructor(
    readonly header: RecordingHeader,
    readonly inputs: Uint8Array,
    readonly states: Uint8Array,
    readonly events: Uint8Array,
  ) {}

  get stateCount(): number {
    return this.states.length / (STATE_BASE + STATE_PER_GUARD * this.header.guardCount);
  }

  private decoded: SimEvent[] | null = null;

  get eventCount(): number {
    return this.decodedEvents().length;
  }

  private decodedEvents(): SimEvent[] {
    if (!this.decoded) {
      const r = new ByteReader(this.events);
      const out: SimEvent[] = [];
      while (r.remaining > 0) out.push(readEvent(r));
      this.decoded = out;
    }
    return this.decoded;
  }

  private inputIndex: Uint32Array | null = null;

  /** Indexes the input track, checking it holds exactly `ticks` inputs. */
  indexInputs(): void {
    this.offsets();
  }

  /** Where each tick's input starts in the input track. */
  private offsets(): Uint32Array {
    if (!this.inputIndex) {
      const index = new Uint32Array(this.header.ticks);
      const r = new ByteReader(this.inputs);
      const scratch = neutralInput();
      for (let i = 0; i < this.header.ticks; i++) {
        index[i] = r.offset;
        readInput(r, scratch);
      }
      if (r.remaining !== 0) throw new RecordingFormatError(`Corrupt recording: input past tick ${this.header.ticks}`);
      this.inputIndex = index;
    }
    return this.inputIndex;
  }

  readInput(i: number, out: TickInput): TickInput {
    const r = new ByteReader(this.inputs);
    r.offset = this.offsets()[i]!;
    return readInput(r, out);
  }


  readState(k: number, out?: RecordedState): RecordedState {
    const n = this.header.guardCount;
    const size = STATE_BASE + STATE_PER_GUARD * n;
    const v = new DataView(this.states.buffer, this.states.byteOffset + k * size, size);
    const s: RecordedState = out ?? {
      tick: 0,
      px: 0,
      py: 0,
      pz: 0,
      yaw: 0,
      pitch: 0,
      eye: 0,
      speed: 0,
      stance: 'stand',
      gait: 'idle',
      guards: new Float32Array(n * 5),
    };
    s.tick = v.getUint32(0, true);
    s.px = v.getFloat32(4, true);
    s.py = v.getFloat32(8, true);
    s.pz = v.getFloat32(12, true);
    s.yaw = v.getFloat32(16, true);
    s.pitch = v.getFloat32(20, true);
    s.eye = v.getFloat32(24, true);
    s.speed = v.getFloat32(28, true);
    s.stance = STANCES[v.getUint8(32)] ?? 'stand';
    s.gait = GAITS[v.getUint8(33)] ?? 'idle';
    for (let i = 0; i < n * 5; i++) s.guards[i] = v.getFloat32(STATE_BASE + i * 4, true);
    return s;
  }

  /** Every recorded event, decoded (copies: change them freely). */
  readEvents(): SimEvent[] {
    return this.decodedEvents().map((e) => ({ ...e }));
  }

  toBytes(): Uint8Array {
    const w = new ByteWriter(this.inputs.length + this.states.length + this.events.length + 8192);
    for (const b of MAGIC) w.u8(b);
    w.u32(RECORDING_VERSION);
    const header = new TextEncoder().encode(JSON.stringify(this.header));
    for (const block of [header, this.inputs, this.states, this.events]) {
      w.u32(block.length);
      w.bytes(block);
    }
    return w.toBytes();
  }

  static fromBytes(bytes: Uint8Array): Recording {
    const r = new ByteReader(bytes);
    for (const b of MAGIC) if (r.u8() !== b) throw new Error('Not a Sightline recording');
    const version = r.u32();
    if (version !== RECORDING_VERSION) throw new Error(`Unsupported recording version ${version}`);
    const header = JSON.parse(new TextDecoder().decode(r.take(r.u32()))) as RecordingHeader;
    const inputs = r.take(r.u32());
    const states = r.take(r.u32());
    const events = r.take(r.u32());
    checkHeader(header, inputs.length);
    const rec = new Recording(header, inputs, states, events);
    rec.indexInputs(); // refuses an input track of the wrong length
    return rec;
  }
}
