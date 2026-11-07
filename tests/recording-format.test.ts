import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { WanderBot } from '../src/sim/bots/wander';
import { generateWorld, type World } from '../src/sim/gen/world';
import { neutralInput } from '../src/sim/input';
import { missionSpec } from '../src/sim/mission';
import { ByteReader, ByteWriter, RecordingFormatError, concat } from '../src/sim/record/bytes';
import { Recorder, Recording, RECORDING_VERSION } from '../src/sim/record/recording';
import { resimulate } from '../src/sim/record/resim';
import { ReplaySeeker } from '../src/sim/record/seek';
import { Simulation } from '../src/sim/sim';
import { tuningCopy } from './fixtures';

let world: World;
beforeAll(() => {
  world = generateWorld(missionSpec('VEX-0042'), defaultTuning);
});

/** Plays with the wander bot; `during` runs before each tick, to change tuning or annotate. */
function play(ticks: number, during?: (sim: Simulation, recorder: Recorder) => void): { sim: Simulation; rec: Recording; hashes: string[] } {
  const sim = new Simulation(world, defaultTuning);
  const recorder = new Recorder(sim, 'test-build');
  const bot = new WanderBot(world.seed);
  const raw = neutralInput();
  const hashes = [sim.hash()];
  for (let i = 0; i < ticks; i++) {
    during?.(sim, recorder);
    recorder.record(sim, sim.step(bot.next(sim, raw)));
    hashes.push(sim.hash());
  }
  return { sim, rec: recorder.finish(sim, '2026-11-07T00:00:00Z'), hashes };
}

/** Rebuilds a file from its tracks, so tests can damage one part. */
function file(tracks: Array<[string, Uint8Array]>, version = RECORDING_VERSION, trailing = 0): Uint8Array {
  const w = new ByteWriter();
  for (const c of 'SLRC') w.u8(c.charCodeAt(0));
  w.u32(version);
  w.u32(tracks.length);
  for (const [tag, bytes] of tracks) {
    for (const c of tag) w.u8(c.charCodeAt(0));
    w.u32(bytes.length);
    w.bytes(bytes);
  }
  for (let i = 0; i < trailing; i++) w.u8(0);
  return w.toBytes();
}

function tracksOf(rec: Recording): Array<[string, Uint8Array]> {
  return [['HEAD', new TextEncoder().encode(JSON.stringify(rec.header))], ...Object.entries(rec.tracks)];
}

describe('the recording file', () => {
  it('stamps the versions, the build, the mission and the fingerprints', () => {
    const { rec } = play(30);
    const h = rec.header;
    expect(h.build).toBe('test-build');
    expect(h.mission).toEqual(missionSpec('VEX-0042'));
    expect(h.worldFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(h.startHash).toBe(new Simulation(world, defaultTuning).hash());
  });

  it('round-trips every track, and skips tracks it does not know', () => {
    const { rec } = play(400, (sim, r) => sim.tick === 100 && r.annotate('marker', 'here'));
    const back = Recording.fromBytes(rec.toBytes());
    expect(back.tracks).toEqual(rec.tracks);
    expect(back.annotations()).toEqual([{ tick: 100, kind: 'marker', text: 'here' }]);
    const extra = Recording.fromBytes(file([...tracksOf(rec), ['ZZZZ', new Uint8Array([1, 2, 3])]]));
    expect(extra.tracks).toEqual(rec.tracks);
  });

  it('refuses damage: trailing bytes, a duplicate or missing track, a wrong version, an unknown header field', () => {
    const { rec } = play(60);
    const tracks = tracksOf(rec);
    const refuse = (bytes: Uint8Array, message: RegExp | typeof RecordingFormatError) => expect(() => Recording.fromBytes(bytes)).toThrow(message);
    expect(() => Recording.fromBytes(file(tracks))).not.toThrow();
    refuse(file(tracks, RECORDING_VERSION, 1), /after the last track/);
    refuse(file([...tracks, tracks[1]!]), /two INPT/);
    refuse(file(tracks.filter(([t]) => t !== 'INPT')), /no INPT/);
    refuse(file(tracks, RECORDING_VERSION - 1), /another build/);
    refuse(file(tracks).slice(0, 40), RecordingFormatError);
    const header = { ...rec.header, surprise: 1 };
    refuse(file([['HEAD', new TextEncoder().encode(JSON.stringify(header))], ...tracks.slice(1)]), /unknown header field/);
    refuse(new TextEncoder().encode('not a recording at all'), /Not a Sightline recording/);
  });

  it('refuses an input track that disagrees with the tick count', () => {
    const { rec } = play(60);
    const tracks = tracksOf(rec).map(([t, b]): [string, Uint8Array] => [t, t === 'INPT' ? concat([b, b.slice(0, 13)]) : b]);
    expect(() => Recording.fromBytes(file(tracks))).toThrow(/input past tick 60/);
  });
});

describe('re-simulating a recording', () => {
  it('follows tuning changed mid-run, on the tick it changed', () => {
    const fast = tuningCopy();
    fast.bodies.player.speed.walk = 3.6;
    fast.bodies.player.accel = 22;
    const { rec } = play(900, (sim, r) => {
      if (sim.tick === 300) {
        sim.setTuning(fast);
        r.tuningChanged(sim);
      }
    });
    expect(rec.tuningChanges().map((c) => c.tick)).toEqual([301]);
    expect(resimulate(Recording.fromBytes(rec.toBytes()), world).ok).toBe(true);
    // Without the change the run diverges, and the checkpoint says where.
    const stripped = new Recording(rec.header, { ...rec.tracks, TUNE: new TextEncoder().encode('[]') });
    const result = resimulate(stripped, world);
    expect(result.ok).toBe(false);
    expect(result.firstDivergence).toBe(600);
    expect(result.divergedParts).toContain('player:1');
  });

  it('keeps the last of two tuning changes between the same two ticks', () => {
    const a = tuningCopy();
    a.bodies.player.accel = 10;
    const b = tuningCopy();
    b.bodies.player.accel = 12;
    const { rec } = play(100, (sim, r) => {
      if (sim.tick === 50) {
        sim.setTuning(a);
        r.tuningChanged(sim);
        sim.setTuning(b);
        r.tuningChanged(sim);
      }
    });
    expect(rec.tuningChanges()).toHaveLength(1);
    expect(rec.tuningChanges()[0]!.tuning.bodies.player.accel).toBe(12);
    expect(resimulate(rec, world).ok).toBe(true);
  });

  it('says why a recording from another build or another valley cannot be compared', () => {
    const { rec } = play(60);
    const older = new Recording({ ...rec.header, simVersion: rec.header.simVersion - 1, build: 'abc123' }, rec.tracks);
    expect(resimulate(older, world).problem).toMatch(/simulation .* abc123/);
    const elsewhere = generateWorld(missionSpec('KOR-1188'), defaultTuning);
    expect(resimulate(rec, elsewhere).problem).toMatch(/different valley/);
  });
});

describe('seeking in a recording', () => {
  it('reaches any tick exactly, forwards and backwards', () => {
    const fast = tuningCopy();
    fast.bodies.player.speed.walk = 3.4;
    const { rec, hashes } = play(1200, (sim, r) => {
      if (sim.tick === 500) {
        sim.setTuning(fast);
        r.tuningChanged(sim);
      }
    });
    const seeker = new ReplaySeeker(rec, world);
    for (const tick of [1200, 0, 777, 150, 151, 499, 500, 501, 1199, 3, 1000]) {
      expect(seeker.seek(tick).hash(), `tick ${tick}`).toBe(hashes[tick]);
    }
  });
});

describe('the simulation tuning', () => {
  it('is a frozen copy: changing the original changes nothing', () => {
    const t = tuningCopy();
    const sim = new Simulation(world, t);
    t.bodies.player.speed.walk = 99;
    expect(sim.tuning.bodies.player.speed.walk).toBe(defaultTuning.bodies.player.speed.walk);
    expect(Object.isFrozen(sim.tuning.bodies.player.speed)).toBe(true);
    expect(() => {
      (sim.tuning.bodies.player.speed as { walk: number }).walk = 5;
    }).toThrow();
  });

  it('is recorded only by the recorder of its own simulation', () => {
    const a = new Simulation(world, defaultTuning);
    const b = new Simulation(world, defaultTuning);
    const recorder = new Recorder(a);
    b.step(neutralInput());
    expect(() => recorder.record(b, [])).toThrow(/only the simulation it was made for/);
  });
});

describe('the byte writer', () => {
  it('writes across chunk boundaries without splitting a value', () => {
    const w = new ByteWriter(16);
    const big = new Uint8Array(100).map((_, i) => i);
    for (let i = 0; i < 50; i++) {
      w.u32(i * 7919);
      w.f64(i / 3);
      if (i % 9 === 0) w.bytes(big);
    }
    const r = new ByteReader(w.toBytes());
    for (let i = 0; i < 50; i++) {
      expect(r.u32()).toBe(i * 7919);
      expect(r.f64()).toBe(i / 3);
      if (i % 9 === 0) expect(r.take(100)).toEqual(big);
    }
    expect(r.remaining).toBe(0);
    expect(w.parts().length).toBeGreaterThan(10);
  });
});
