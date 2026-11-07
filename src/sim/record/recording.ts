import type { Tuning } from '../../config/tuning';
import { hashValue } from '../core/hash';
import type { MoveMode, Stance } from '../entities/player';
import type { SimEvent } from '../events';
import type { SpawnKind } from '../gen/world';
import { InputFlag, type InputFrame } from '../input';
import type { Simulation } from '../sim';
import type { Surface } from '../world/surfaces';
import { ByteReader, ByteWriter } from './bytes';
import { assertTuning } from '../../config/validate';

/**
 * Mission recordings.
 *
 * A recording holds two things. The input track (every tick, 12 bytes) can re-simulate
 * the mission exactly, which turns any playtest into a reproducible bug report or a
 * regression test. The state track (10 Hz) and the event track drive the debrief replay
 * in Phase 2 and playtest telemetry, without re-simulating anything.
 *
 * File layout: "SLRC", u32 version, then four length-prefixed blocks: header JSON,
 * inputs, states, events. All numbers little-endian.
 */

/** 2: checkpoints hash the whole state tree (sim/state.ts). */
export const RECORDING_VERSION = 2;
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
const MODES: MoveMode[] = ['idle', 'sprint', 'walk', 'crouch', 'crawl'];
const STATE_BASE = 36;
const STATE_PER_GUARD = 20;
const EVENT_SIZE = 28;
const INPUT_SIZE = 12;

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
  mode: MoveMode;
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
    const input = sim.lastInput;
    const w = this.inputs;
    w.i8(Math.round(input.moveX * 127));
    w.i8(Math.round(input.moveZ * 127));
    w.u8((input.sprint ? InputFlag.Sprint : 0) | (input.crouch ? InputFlag.Crouch : 0) | (input.prone ? InputFlag.Prone : 0));
    w.u8(0);
    w.f32(input.yaw);
    w.f32(input.pitch);

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
      s.u8(MODES.indexOf(p.mode));
      s.u16(0);
      for (const g of sim.guards) {
        s.f32(g.x);
        s.f32(g.y);
        s.f32(g.z);
        s.f32(g.yaw);
        s.f32(g.headYaw);
      }
    }

    for (const e of events) {
      const ev = this.events;
      if (e.type === 'footstep') {
        ev.u8(1);
        ev.u8(e.surface);
        ev.i16(e.source);
        ev.u32(e.tick);
        ev.f32(e.x);
        ev.f32(e.y);
        ev.f32(e.z);
        ev.f32(e.loudness);
        ev.f32(e.radius);
      } else if (e.type === 'land') {
        ev.u8(3);
        ev.u8(e.surface);
        ev.i16(e.source);
        ev.u32(e.tick);
        ev.f32(e.x);
        ev.f32(e.y);
        ev.f32(e.z);
        ev.f32(e.loudness);
        ev.f32(e.speed);
      } else {
        ev.u8(2);
        ev.u8(STANCES.indexOf(e.from));
        ev.i16(STANCES.indexOf(e.to));
        ev.u32(e.tick);
        for (let k = 0; k < 5; k++) ev.f32(0);
      }
    }

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
  if (!whole(h.ticks, 0) || h.ticks * INPUT_SIZE !== inputBytes) fail(`${String(h.ticks)} ticks but ${inputBytes / INPUT_SIZE} inputs`);
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

  get eventCount(): number {
    return this.events.length / EVENT_SIZE;
  }

  readInput(i: number, out: InputFrame): InputFrame {
    const v = new DataView(this.inputs.buffer, this.inputs.byteOffset + i * INPUT_SIZE, INPUT_SIZE);
    out.moveX = v.getInt8(0) / 127;
    out.moveZ = v.getInt8(1) / 127;
    const flags = v.getUint8(2);
    out.sprint = (flags & InputFlag.Sprint) !== 0;
    out.crouch = (flags & InputFlag.Crouch) !== 0;
    out.prone = (flags & InputFlag.Prone) !== 0;
    out.yaw = v.getFloat32(4, true);
    out.pitch = v.getFloat32(8, true);
    return out;
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
      mode: 'idle',
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
    s.mode = MODES[v.getUint8(33)] ?? 'idle';
    for (let i = 0; i < n * 5; i++) s.guards[i] = v.getFloat32(STATE_BASE + i * 4, true);
    return s;
  }

  readEvents(): SimEvent[] {
    const out: SimEvent[] = [];
    for (let k = 0; k < this.eventCount; k++) {
      const v = new DataView(this.events.buffer, this.events.byteOffset + k * EVENT_SIZE, EVENT_SIZE);
      const type = v.getUint8(0);
      if (type === 1) {
        out.push({
          type: 'footstep',
          surface: v.getUint8(1) as Surface,
          source: v.getInt16(2, true),
          tick: v.getUint32(4, true),
          x: v.getFloat32(8, true),
          y: v.getFloat32(12, true),
          z: v.getFloat32(16, true),
          loudness: v.getFloat32(20, true),
          radius: v.getFloat32(24, true),
        });
      } else if (type === 3) {
        const loudness = v.getFloat32(20, true);
        out.push({
          type: 'land',
          surface: v.getUint8(1) as Surface,
          source: v.getInt16(2, true),
          tick: v.getUint32(4, true),
          x: v.getFloat32(8, true),
          y: v.getFloat32(12, true),
          z: v.getFloat32(16, true),
          loudness,
          speed: v.getFloat32(24, true),
          radius: loudness * this.header.tuning.noise.radiusPerUnit,
        });
      } else if (type === 2) {
        out.push({
          type: 'stance',
          from: STANCES[v.getUint8(1)] ?? 'stand',
          to: STANCES[v.getInt16(2, true)] ?? 'stand',
          tick: v.getUint32(4, true),
        });
      }
    }
    return out;
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
    return new Recording(header, inputs, states, events);
  }
}
