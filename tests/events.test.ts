import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/bots/chaos';
import { EventLog } from '../src/sim/eventlog';
import { EVENTS, isSound, type EventType, type SimEvent } from '../src/sim/events';
import { generateWorld } from '../src/sim/gen/world';
import { neutralInput } from '../src/sim/input';
import { missionSpec } from '../src/sim/mission';
import { ByteReader, ByteWriter, RecordingFormatError } from '../src/sim/record/bytes';
import { readEvent, writeEvent } from '../src/sim/record/eventCodec';
import { Simulation } from '../src/sim/sim';
import { PLAYER_ID } from '../src/sim/state';
import { Blocks } from '../src/sim/world/colliders';
import { Surface } from '../src/sim/world/surfaces';
import { testWorld } from './fixtures';

/** A minute of the fuzzing bot (footsteps and stance changes from the player and guards), then a drop off a roof (a landing). */
function events(): { sim: Simulation; all: SimEvent[] } {
  const sim = new Simulation(generateWorld(missionSpec('TAL-4471'), defaultTuning), defaultTuning);
  const bot = new ChaosBot('TAL-4471');
  const raw = neutralInput();
  const all: SimEvent[] = [];
  for (let i = 0; i < 60 * 30; i++) for (const e of sim.step(bot.next(sim, raw))) all.push({ ...e });
  const roof = { kind: 'box' as const, x: 0, z: 0, y0: -1, y1: 3, hx: 2, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal };
  const drop = new Simulation(testWorld({ colliders: [roof], spawnOnTop: true }), defaultTuning);
  const walk = { ...neutralInput(), moveZ: 1 };
  const landings: SimEvent[] = [];
  for (let i = 0; i < 60; i++) for (const e of drop.step(walk)) if (e.type === 'land') landings.push({ ...e });
  for (const e of drop.step({ ...walk, commands: [{ kind: 'fire', lag: 0.5, yaw: 0.3, pitch: -0.1 }] })) if (e.type === 'shot') landings.push({ ...e });
  // Renumber after the bot's events, as if one run.
  landings.forEach((e, k) => all.push({ ...e, id: all.length + k + 1 }));
  return { sim, all };
}

describe('events', () => {
  const { sim, all } = events();

  it('are numbered in order, stamped with their tick and a time inside it', () => {
    expect(all.length).toBeGreaterThan(100);
    all.forEach((e) => {
      // A shot happened when the player saw it, before its tick began.
      expect(e.t).toBeGreaterThan((e.tick - (e.type === 'shot' ? 3 : 1)) / 30);
      expect(e.t).toBeLessThanOrEqual(e.tick / 30);
    });
    const fromBot = all.slice(0, sim.state.nextEventId - 1);
    fromBot.forEach((e, k) => expect(e.id).toBe(k + 1));
    expect(all.some((e) => e.type === 'land')).toBe(true);
  });

  it('name the entity that made them', () => {
    const ids = new Set(sim.state.entities.map((e) => e.id));
    for (const e of all) expect(ids.has(e.source)).toBe(true);
    const types = new Set(all.filter((e) => e.source === PLAYER_ID).map((e) => e.type));
    expect([...types].sort()).toEqual(['footstep', 'land', 'shot', 'stance']);
    expect(all.some((e) => e.source !== PLAYER_ID && e.type === 'footstep')).toBe(true);
  });

  it('say what the legs were doing when they make a step', () => {
    const gaits = new Set(all.flatMap((e) => (e.type === 'footstep' && e.source === PLAYER_ID ? [e.gait] : [])));
    for (const g of ['crawl', 'crouch', 'walk', 'sprint']) expect(gaits.has(g as never)).toBe(true);
  });

  it('round-trip through the recording codec, every type', () => {
    const seen = new Set<EventType>();
    const w = new ByteWriter();
    for (const e of all) {
      writeEvent(w, e);
      seen.add(e.type);
    }
    expect([...seen].sort()).toEqual((Object.keys(EVENTS) as EventType[]).sort());
    const r = new ByteReader(w.toBytes());
    for (const e of all) {
      const back = readEvent(r);
      expect(Object.keys(back).sort()).toEqual(Object.keys(e).sort());
      for (const [k, v] of Object.entries(e)) {
        const got = (back as unknown as Record<string, unknown>)[k];
        const exact = k === 't' || e.type === 'shot';
        if (typeof v === 'number' && !Number.isInteger(v) && !exact) expect(got).toBe(Math.fround(v));
        else expect(got).toBe(v);
      }
    }
    expect(r.remaining).toBe(0);
  });

  it('refuse to decode an unknown type or a truncated record', () => {
    expect(() => readEvent(new ByteReader(new Uint8Array([250, 0, 0])))).toThrow(RecordingFormatError);
    const w = new ByteWriter();
    writeEvent(w, all[0]!);
    expect(() => readEvent(new ByteReader(w.toBytes().slice(0, 9)))).toThrow(/truncated/);
  });

  it('mark which are sounds, with the fields a sound needs', () => {
    for (const e of all) {
      if (!isSound(e)) continue;
      for (const k of ['x', 'y', 'z', 'surface', 'loudness', 'radius']) expect(k in e).toBe(true);
      expect(e.radius).toBeCloseTo(e.loudness * defaultTuning.noise.radiusPerUnit, 9);
    }
    expect(EVENTS.stance.sound).toBe(false);
  });
});

describe('the event log', () => {
  it('explains an event by walking its causes back to the first', () => {
    const log = new EventLog();
    const base = { tick: 1, t: 1 / 30, source: PLAYER_ID, x: 0, y: 0, z: 0, surface: 0 as const, loudness: 1, radius: 12 };
    log.add([
      { ...base, type: 'footstep', id: 1, cause: 0, gait: 'sprint' },
      { ...base, type: 'land', id: 2, cause: 1, speed: 5 },
      { ...base, type: 'footstep', id: 3, cause: 2, gait: 'walk' },
      { ...base, type: 'footstep', id: 4, cause: 99, gait: 'walk' },
    ]);
    expect(log.explain(3).map((e) => e.id)).toEqual([1, 2, 3]);
    expect(log.explain(1).map((e) => e.id)).toEqual([1]);
    // A cause from before the log started ends the chain.
    expect(log.explain(4).map((e) => e.id)).toEqual([4]);
    expect(log.explain(42)).toEqual([]);
  });

  it('keeps its own copies, since the simulation reuses its event array', () => {
    const log = new EventLog();
    const e: SimEvent = { type: 'stance', id: 1, tick: 1, t: 1 / 30, source: PLAYER_ID, cause: 0, from: 'stand', to: 'crouch' };
    log.add([e]);
    e.to = 'prone';
    expect(log.get(1)).toMatchObject({ to: 'crouch' });
  });
});
