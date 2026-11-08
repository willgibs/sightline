import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { campRules } from '../src/sim/game/combat';
import { campCommander, commsVoice, giveCommander } from '../src/sim/game/comms';
import { PERCEPTION, giveSenses } from '../src/sim/game/perception';
import { placePlayer } from '../src/sim/game/setup';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { player } from '../src/sim/game/entities';
import { neutralInput } from '../src/sim/kernel/input';
import type { SimEvent } from '../src/sim/kernel/events';
import { withSystem } from '../src/sim/kernel/systems';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import { testGuard, testWorld } from './fixtures';

/**
 * Minimal combat (E10): guards engage and shoot with lab B's bullets, the player can be
 * hit and die, and a guard with nothing to shoot at takes cover.
 */

const SENTRY = { id: 0, role: 'sentry' as const, x: 0, y: 0, z: 0, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };

function wall(x: number, z: number, hx: number, hz: number): ColliderInput {
  return { kind: 'box', x, z, y0: -0.3, y1: 2.4, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
}

function worldWith(colliders: ColliderInput[] = [], guards = [SENTRY]): World {
  return testWorld({ size: 160, spawn: { x: -70, z: 70 }, colliders, camp: { structures: [], guards: guards.map((g) => testGuard(g)), fenceHalf: 0 } });
}

function campy(world: World): Simulation {
  let systems = SYSTEMS;
  for (const s of [...PERCEPTION, commsVoice, campCommander, campRules]) systems = withSystem(systems, s);
  const sim = new Simulation(world, T, systems);
  giveSenses(sim);
  giveBrains(sim);
  giveCommander(sim);
  player(sim.index).health = { hits: 0 };
  return sim;
}

function run(sim: Simulation, seconds: number, stop: () => boolean = () => false): SimEvent[] {
  const raw = neutralInput();
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds * 30 && !stop(); i++) out.push(...sim.step(raw).map((e) => ({ ...e })));
  return out;
}

describe('minimal combat', () => {
  it('a guard who sees the player shoots, with a short reaction first', () => {
    const sim = campy(worldWith());
    placePlayer(sim, 18, 0, -1, 0);
    const ev = run(sim, 12);
    const shots = ev.filter((e) => e.source === sim.guards[0]!.id && e.type === 'shot');
    expect(shots.length).toBeGreaterThan(1);
    const detected = ev.find((e) => e.type === 'detected')!;
    expect(shots[0]!.t).toBeGreaterThan(detected.t + T.brain.combat.react - 0.1);
  });

  it('the player can be hit and can die', () => {
    const sim = campy(worldWith());
    placePlayer(sim, 7, 0, -1, 0);
    const ev = run(sim, 40, () => sim.state.outcome.status !== 'playing');
    expect(sim.state.outcome.status).toBe('failed');
    const hits = ev.filter((e) => e.type === 'hurt');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(player(sim.index).health!.hits).toBeGreaterThanOrEqual(T.brain.combat.playerHits);
    // Its cause is the impact, whose cause is the guard's shot.
    const hurt = hits[0]!;
    const impact = ev.find((e) => e.id === hurt.cause);
    expect(impact?.type).toBe('impact');
  });

  it('a guard in combat who can no longer see takes cover behind what is solid', () => {
    const colliders = [wall(5, 6, 1, 1)];
    const sim = campy(worldWith(colliders));
    const g = sim.guards[0]!;
    // He's in combat, believing the threat is to the east, seeing nothing now.
    const a = g.senses!.awareness;
    a.state = 'combat';
    a.since = 0;
    a.fallAt = 99999;
    a.focus = true;
    a.fx = 30;
    a.fz = 0;
    g.senses!.belief = { x: 30, y: 1.2, z: 0, radius: 2, tick: 0, seen: true, cause: 0 };
    const ev = run(sim, 8);
    expect(ev.some((e) => e.type === 'act' && e.to === 'cover')).toBe(true);
    // He has moved toward the block's far side, which breaks the line to the east.
    expect(Math.hypot(g.body.x, g.body.z)).toBeGreaterThan(0.5);
  });
});
