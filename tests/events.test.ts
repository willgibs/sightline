import { SYSTEMS } from '../src/sim/game/systems';
import { decide, withSystem, type System } from '../src/sim/kernel/systems';
import { describe, expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { EventLog } from '../src/sim/kernel/eventlog';
import { EVENTS, isSound, type EventType, type SimEvent } from '../src/sim/kernel/events';
import { generateWorld } from '../src/sim/generation/world';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { ByteReader, ByteWriter, RecordingFormatError } from '../src/sim/kernel/record/bytes';
import { readEvent, writeEvent } from '../src/sim/kernel/record/eventCodec';
import { Simulation } from '../src/sim/game/sim';
import { PLAYER_ID, player } from '../src/sim/game/entities';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testWorld } from './fixtures';
import { sceneOver, sceneTicks, startScene } from '../src/sim/kernel/scene';
import { SCENES } from '../src/sim/game/scenes';

/**
 * A minute of the fuzzing bot (footsteps and stance changes from the player and guards),
 * then a drop off a roof (a landing), a bare shot and an outcome, then the shooting
 * range's marksman (a rifle's shots, reports, strikes, deaths, a cry, the bolt, a range).
 */
function events(): { sim: Simulation; all: SimEvent[]; valley: number; range: Simulation } {
  const sim = new Simulation(generateWorld(missionSpec('TAL-4471'), defaultTuning), defaultTuning);
  const bot = new ChaosBot('TAL-4471');
  const raw = neutralInput();
  const all: SimEvent[] = [];
  for (let i = 0; i < 60 * 30; i++) for (const e of sim.step(bot.next(sim, raw))) all.push({ ...e });
  const roof = { kind: 'box' as const, x: 0, z: 0, y0: -1, y1: 3, hx: 2, hz: 2, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal };
  const rules: System = {
    name: 'test-rules',
    phase: 'mission',
    reads: [],
    writes: ['outcome'],
    emits: ['outcome'],
    run: (ctx) => (ctx.tick === 30 ? decide(ctx, 'succeeded', 'off the roof', player(ctx.index).id) : undefined),
  };
  const drop = new Simulation(testWorld({ colliders: [roof], spawnOnTop: true }), defaultTuning, withSystem(SYSTEMS, rules));
  const walk = { ...neutralInput(), moveZ: 1 };
  const landings: SimEvent[] = [];
  for (let i = 0; i < 60; i++) for (const e of drop.step(walk)) if (e.type === 'land' || e.type === 'outcome') landings.push({ ...e });
  for (const e of drop.step({ ...walk, commands: [{ kind: 'fire', lag: 0.5, yaw: 0.3, pitch: -0.1 }] })) if (e.type === 'shot') landings.push({ ...e });
  // Renumber after the bot's events, as if one run.
  landings.forEach((e, k) => all.push({ ...e, id: all.length + k + 1 }));
  // Perception's events (lab A), one of each, from the valley's first guard, as the
  // perception lab makes them (tests/perception-lab.test.ts runs them for real).
  const guard = sim.guards[0]!.id;
  const tick = sim.tick;
  const voice = { x: 3.1, y: 1.7, z: -4.2, surface: Surface.Grass, loudness: 22 / 12, radius: 22 };
  const perceived: SimEvent[] = [
    { type: 'noticed', id: 0, tick, t: tick / 30, source: guard, cause: 0, target: PLAYER_ID, x: 12.5, y: 1.3, z: -40.25, distance: 42.4, zone: 'core' },
    {
      type: 'detected',
      id: 0,
      tick,
      t: tick / 30,
      source: guard,
      cause: 0,
      target: PLAYER_ID,
      x: 12.6,
      y: 1.3,
      z: -40.1,
      distance: 41.9,
      angle: 12.3,
      zone: 'peripheral',
      stance: 0.6,
      light: 0.6,
      skyline: 1.2,
      range: 54,
      movement: 1,
      cover: 0.7,
      rate: 0.21,
    },
    { type: 'heard', id: 0, tick, t: tick / 30, source: guard, cause: 1, kind: 'sound', clarity: 1.7, x: 11, y: 0.3, z: -38, radius: 4.5 },
    { type: 'alert', id: 0, tick, t: tick / 30, source: guard, cause: 0, from: 'unaware', to: 'curious', reason: 'heard' },
    { type: 'bark', id: 0, tick, t: tick / 30, source: guard, cause: 0, ...voice, line: 3 },
    { type: 'spotted', id: 0, tick, t: tick / 30, source: guard, cause: 0, what: 'body', x: 12.5, y: 0.3, z: -40.25, distance: 42.5 },
    { type: 'noise', id: 0, tick, t: tick / 30, source: PLAYER_ID, cause: 0, ...voice, loudness: 2, radius: 24 },
    { type: 'act', id: 0, tick, t: tick / 30, source: guard, cause: 1, from: 'routine', to: 'look', why: 'heard', x: 3, z: -4, weight: 0.65 },
    { type: 'call', id: 0, tick, t: tick / 30, source: guard, cause: 1, ...voice, loudness: 14 / defaultTuning.noise.radiusPerUnit, radius: 14, radio: 1 },
    { type: 'radio', id: 0, tick, t: tick / 30, source: guard, cause: 1, kind: 'contact', x: 8, z: -2, radius: 6 },
    { type: 'order', id: 0, tick, t: tick / 30, source: guard, cause: 1, to: guard, task: 'search', x: 1, z: -2 },
    { type: 'level', id: 0, tick, t: tick / 30, source: guard, cause: 1, from: 'calm', to: 'uneasy' },
    { type: 'checkin', id: 0, tick, t: tick / 30, source: guard, cause: 1, post: 2, stage: 'call' },
    { type: 'hurt', id: 0, tick, t: tick / 30, source: guard, cause: 1, part: 'torso', hits: 1 },
    { type: 'alarm', id: 0, tick, t: tick / 30, source: guard, cause: 1, box: 0, stage: 'raised' },
    { type: 'reinforce', id: 0, tick, t: tick / 30, source: guard, cause: 1, count: 3, x: 300, z: 0 },
    { type: 'siren', id: 0, tick, t: tick / 30, source: guard, cause: 1, ...voice, loudness: 900 / defaultTuning.noise.radiusPerUnit, radius: 900 },
  ];
  perceived.forEach((e) => all.push({ ...e, id: all.length + 1 }));
  const valley = all.length;
  // The range, live: the events as the simulation made them, before any codec.
  const scene = SCENES['shooting-range']!();
  const range = startScene(scene, defaultTuning);
  const driver = scene.driver!();
  const still = scene.game.still(range);
  const shooting: SimEvent[] = [];
  while (!sceneOver(scene, range, sceneTicks(scene, defaultTuning))) for (const e of range.step(driver.next(range, still))) shooting.push({ ...e });
  shooting.forEach((e, k) => all.push({ ...e, id: valley + k + 1 }));
  return { sim, all, valley, range };
}

/** Events of a timed command, and what it caused at once: they happened when the player saw them, before their tick began. */
const TIMED = new Set<EventType>(['shot', 'report', 'ranged', 'impact', 'death', 'cry']);

describe('events', () => {
  const { sim, all, valley, range } = events();

  it('are numbered in order, stamped with their tick and a time inside it', () => {
    expect(all.length).toBeGreaterThan(100);
    all.forEach((e) => {
      expect(e.t).toBeGreaterThan((e.tick - (TIMED.has(e.type) ? 3 : 1)) / 30);
      expect(e.t).toBeLessThanOrEqual(e.tick / 30);
    });
    const fromBot = all.slice(0, sim.state.nextEventId - 1);
    fromBot.forEach((e, k) => expect(e.id).toBe(k + 1));
    expect(all.some((e) => e.type === 'land')).toBe(true);
  });

  it('name the entity that made them', () => {
    const ids = new Set(sim.state.entities.map((e) => e.id));
    for (const e of all.slice(0, valley)) expect(ids.has(e.source)).toBe(true);
    const types = new Set(all.slice(0, valley).filter((e) => e.source === PLAYER_ID).map((e) => e.type));
    // The player drops noises from the sandbox (A10).
    expect([...types].sort()).toEqual(['footstep', 'land', 'noise', 'outcome', 'shot', 'stance']);
    expect(all.some((e) => e.source !== PLAYER_ID && e.type === 'footstep')).toBe(true);
    // On the range the guards who cry out are gone by the end: every source was an entity of that run.
    for (const e of all.slice(valley)) expect(e.source >= 1 && e.source < range.state.nextId).toBe(true);
    const shooter = new Set(all.slice(valley).filter((e) => e.source === PLAYER_ID).map((e) => e.type));
    expect([...shooter].sort()).toEqual(['bolt', 'clatter', 'death', 'impact', 'ranged', 'report', 'shot', 'stance']);
    expect(all.slice(valley).some((e) => e.type === 'cry' && e.source !== PLAYER_ID)).toBe(true);
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
