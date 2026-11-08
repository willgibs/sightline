import type { Gait, Stance } from '../body';
import { ByteReader, RecordingFormatError, type ByteWriter } from '../kernel/record/bytes';
import type { Recording } from '../kernel/record/recording';
import type { Simulation } from '../kernel/sim';

/**
 * The recording's state track (STAT) for a run of Sightline: at 10 Hz, the player's pose,
 * stance and gait, and each guard's pose and head turn, for the replay and telemetry
 * without re-simulating (kernel/record/recording.ts). The kernel stores the samples
 * Game.sample writes; this module writes and reads them, checking each before trusting it.
 */

const STANCES: Stance[] = ['stand', 'crouch', 'prone'];
const GAITS: Gait[] = ['idle', 'sprint', 'walk', 'crouch', 'crawl'];

/** Bytes before the guard count, and per guard. */
const HEAD_BYTES = 34;
const GUARD_BYTES = 24;

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

/** Writes one sample of the run as it stands (Game.sample). */
export function writeSample(w: ByteWriter, sim: Simulation): void {
  const p = sim.index.of('player')[0]!.body;
  const guards = sim.index.of('guard');
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
  w.u16(guards.length);
  for (const g of guards) {
    w.u32(g.id);
    w.f32(g.body.x);
    w.f32(g.body.y);
    w.f32(g.body.z);
    w.f32(g.body.yaw);
    w.f32(g.guard.headYaw);
  }
}

/** Where each sample starts in a recording's state track; throws RecordingFormatError if one is truncated. */
export function sampleOffsets(rec: Recording): Uint32Array {
  const track = rec.tracks.STAT;
  const r = new ByteReader(track);
  const at: number[] = [];
  while (r.remaining > 0) {
    at.push(r.offset);
    r.offset += HEAD_BYTES;
    if (r.offset + 2 > track.length) throw new RecordingFormatError('Corrupt recording: a state sample is truncated');
    const n = r.u16();
    r.offset += n * GUARD_BYTES;
    if (r.offset > track.length) throw new RecordingFormatError('Corrupt recording: a state sample is truncated');
  }
  return Uint32Array.from(at);
}

/** How many state samples a recording holds. */
export function sampleCount(rec: Recording): number {
  return sampleOffsets(rec).length;
}

/** The `k`th state sample of a recording. */
export function readSample(rec: Recording, k: number, out?: RecordedState): RecordedState {
  const r = new ByteReader(rec.tracks.STAT);
  const at = sampleOffsets(rec)[k];
  if (at === undefined) throw new RangeError(`No state sample ${k}`);
  r.offset = at;
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
