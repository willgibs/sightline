import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { buildRoutine, buildWorld, type GuardSpawn, type Routine } from '../src/sim/generation';
import { Rng } from '../src/sim/kernel/core/rng';
import { datan2 } from '../src/sim/kernel/core/detmath';
import type { Command } from '../src/sim/kernel/commands';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput, Optic, type InputFrame } from '../src/sim/kernel/input';
import { bodyShape } from '../src/sim/body';
import { emptyShape } from '../src/sim/kernel/world/shape';
import { player } from '../src/sim/game/entities';
import { placePlayer } from '../src/sim/game/setup';
import { arm } from '../src/sim/game/shooting';
import { Simulation } from '../src/sim/game/sim';

/**
 * The rifle's rules in a tick (game/shooting.ts): rounds, the bolt, the dial, the
 * suppressor, the scope's raise, and the sandbox's dropped shot.
 */

/** A flat world with one sentry 60 m north of the player. */
function range(): Simulation {
  const post = (): GuardSpawn => {
    const s: GuardSpawn = { id: 0, role: 'sentry', x: 0, y: 0, z: -60, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 1, routine: null as unknown as Routine };
    s.routine = buildRoutine(s, T.gen.routines, new Rng('shooting-test', 'routines'));
    return s;
  };
  const world = buildWorld({ name: 'shooting-test', size: 200, cell: 1, camp: { structures: [], guards: [post()], fenceHalf: 0 } }, T.gen);
  const sim = new Simulation(world, T);
  placePlayer(sim, 0, 0, 0, -1);
  return sim;
}

/** The view angles from the player's eye to the sentry's head. */
function atHead(sim: Simulation): { yaw: number; pitch: number } {
  const p = sim.player;
  const g = sim.guards[0]!;
  const head = bodyShape(g.body, T.bodies.guard, emptyShape()).head;
  const dx = head.x - p.x;
  const dy = head.y - (p.y + p.eyeHeight);
  const dz = head.z - p.z;
  return { yaw: datan2(-dx, -dz), pitch: datan2(dy, Math.sqrt(dx * dx + dz * dz)) };
}

function step(sim: Simulation, input: InputFrame, commands: Command[] = []): SimEvent[] {
  return sim.step({ ...input, commands }).map((e) => ({ ...e }));
}

describe('the rifle', () => {
  it('fires only with a round chambered: the bolt holds the next for its time, and the rounds run out', () => {
    const sim = range();
    arm(player(sim.index), T);
    const rifle = player(sim.index).rifle!;
    rifle.rounds = 2;
    const up: InputFrame = { ...neutralInput(0, 0.05), optic: Optic.Scope };
    for (let i = 0; i < 15; i++) step(sim, up);
    const fire: Command = { kind: 'fire', lag: 0, yaw: 0, pitch: 0.05 };
    expect(step(sim, up, [fire]).filter((e) => e.type === 'shot')).toHaveLength(1);
    // The bolt: nothing for its time, then the next round.
    const bolt = Math.round(T.ballistics.rifle.boltTime * T.sim.tickHz);
    let shots = 0;
    for (let i = 0; i < bolt - 2; i++) shots += step(sim, up, [fire]).filter((e) => e.type === 'shot').length;
    expect(shots).toBe(0);
    for (let i = 0; i < 4; i++) step(sim, up);
    expect(step(sim, up, [fire]).filter((e) => e.type === 'shot')).toHaveLength(1);
    expect(rifle.rounds).toBe(0);
    for (let i = 0; i < 60; i++) expect(step(sim, up, [fire]).filter((e) => e.type === 'shot')).toHaveLength(0);
  });

  it('clicks its zero in 100 m steps within the dial, and holds fire while the suppressor goes on', () => {
    const sim = range();
    arm(player(sim.index), T);
    const rifle = player(sim.index).rifle!;
    const still = neutralInput();
    for (let i = 0; i < 8; i++) step(sim, still, [{ kind: 'zeroUp' }]);
    expect(rifle.zero).toBe(T.ballistics.rifle.zero.max);
    for (let i = 0; i < 9; i++) step(sim, still, [{ kind: 'zeroDown' }]);
    expect(rifle.zero).toBe(T.ballistics.rifle.zero.min);
    step(sim, still, [{ kind: 'suppressor' }]);
    expect(rifle.suppressed).toBe(!T.ballistics.rifle.suppressed);
    const fire: Command = { kind: 'fire', lag: 0, yaw: 0, pitch: 0 };
    expect(step(sim, still, [fire]).filter((e) => e.type === 'shot')).toHaveLength(0);
    for (let i = 0; i < T.ballistics.rifle.fitTime * T.sim.tickHz; i++) step(sim, still);
    const events = step(sim, still, [fire]);
    const report = events.find((e) => e.type === 'report');
    expect(report?.type === 'report' && report.suppressed).toBe(1);
    expect(report?.type === 'report' && report.radius).toBe(T.ballistics.sound.suppressedReport);
  });

  it('shoots where the scope looks once it is up, and only roughly from the hip', () => {
    const misses = (raise: boolean): number => {
      const sim = range();
      arm(player(sim.index), T);
      const aim = atHead(sim);
      const input: InputFrame = { ...neutralInput(aim.yaw, aim.pitch), optic: raise ? Optic.Scope : Optic.None };
      for (let i = 0; i < 20; i++) step(sim, input);
      const events = step(sim, input, [{ kind: 'fire', lag: 0, ...aim }]);
      const shot = events.find((e) => e.type === 'shot')!;
      if (shot.type !== 'shot') return NaN;
      // How far off the line to the head the barrel pointed, mils (the zero's tilt aside).
      const want = { x: -Math.sin(aim.yaw) * Math.cos(aim.pitch), y: Math.sin(aim.pitch), z: -Math.cos(aim.yaw) * Math.cos(aim.pitch) };
      const cross = Math.hypot(shot.dy * want.z - shot.dz * want.y, shot.dz * want.x - shot.dx * want.z, shot.dx * want.y - shot.dy * want.x);
      return cross * 1000;
    };
    // Scoped and standing still: the sway and the zero's tilt, a few mils at most.
    expect(misses(true)).toBeLessThan(4);
    // From the hip: tens of mils off.
    expect(misses(false)).toBeGreaterThan(misses(true));
  });
});

describe('the sandbox', () => {
  it('drops a shot where you look, rifle or not, and it strikes there', () => {
    const sim = range();
    expect(player(sim.index).rifle).toBeUndefined();
    const aim = atHead(sim);
    const events: SimEvent[] = [];
    events.push(...step(sim, neutralInput(aim.yaw, aim.pitch), [{ kind: 'shotDrop', lag: 0, ...aim }]));
    for (let i = 0; i < 15; i++) events.push(...step(sim, neutralInput(aim.yaw, aim.pitch)));
    expect(events.some((e) => e.type === 'shot' && e.speed > 0)).toBe(true);
    const impact = events.find((e) => e.type === 'impact');
    expect(impact?.type === 'impact' && impact.part).toBe('head');
    expect(events.some((e) => e.type === 'death')).toBe(true);
    expect(sim.guards).toHaveLength(0);
    expect(sim.index.of('remains')).toHaveLength(1);
  });
});
