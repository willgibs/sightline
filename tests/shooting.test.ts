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
import { SCENES } from '../src/sim/game/scenes';
import { Simulation } from '../src/sim/game/sim';
import { sceneOver, sceneTicks, startScene } from '../src/sim/kernel/scene';
import { SyncTest, describeSyncFailure } from '../src/sim/kernel/synctest';

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

describe('the throwable', () => {
  it('flies its arc exactly, lands where the arc meets the ground, bounces lower each time and settles', () => {
    const sim = range();
    arm(player(sim.index), T);
    const R = T.ballistics.throwable;
    const pitch = (20 * Math.PI) / 180;
    const events: SimEvent[] = [];
    const p = sim.player;
    const eye = { x: p.x, y: p.y + p.eyeHeight, z: p.z };
    events.push(...step(sim, neutralInput(0, pitch), [{ kind: 'throw', lag: 0, yaw: 0, pitch }]));
    for (let i = 0; i < 6 * 30; i++) events.push(...step(sim, neutralInput(0, pitch)));
    expect(player(sim.index).rifle!.throwables).toBe(R.count - 1);
    const clatters = events.filter((e) => e.type === 'clatter');
    expect(clatters.length).toBeGreaterThan(1);
    // Where the arc meets the flat ground: thrown from just ahead of the eye, lifted by liftDeg.
    const a = pitch + (R.liftDeg * Math.PI) / 180;
    const y0 = eye.y - 0.1;
    const z0 = eye.z - 0.35 * Math.cos(pitch);
    const vy = R.speed * Math.sin(a);
    const vz = R.speed * Math.cos(a);
    const g = T.sim.gravity;
    const tau = (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g;
    const first = clatters[0]!;
    if (first.type !== 'clatter') throw new Error('not a clatter');
    expect(Math.abs(first.z - (z0 - vz * tau)), `landed at z ${first.z}, the arc says ${z0 - vz * tau}`).toBeLessThan(0.02);
    // Thrown at the start of the first tick (lag 0), so at mission time 0.
    expect(Math.abs(first.t - tau)).toBeLessThan(1e-3);
    // Each touch slower and quieter than the one before.
    for (let k = 1; k < clatters.length; k++) {
      const c = clatters[k]!;
      const b = clatters[k - 1]!;
      if (c.type === 'clatter' && b.type === 'clatter') expect(c.speed).toBeLessThan(b.speed);
    }
    const stone = sim.index.of('thrown')[0]!;
    expect(stone.thrown.rest).toBe(true);
    // Heard as far as a hard landing on its surface carries: about 30–40 m at a full throw.
    expect(first.radius).toBeGreaterThan(25);
    expect(first.radius).toBeLessThan(45);
  });

  it('shows its arc in the debug view, to where it next meets the ground, and drawing changes nothing', () => {
    const pitch = (20 * Math.PI) / 180;
    const run = (draw: boolean): { hash: string; lines: number; arcEnd: number; points: number } => {
      const sim = range();
      arm(player(sim.index), T);
      sim.drawDebug = draw;
      step(sim, neutralInput(0, pitch), [{ kind: 'throw', lag: 0, yaw: 0, pitch }]);
      for (let i = 0; i < 6; i++) step(sim, neutralInput(0, pitch));
      const shapes = sim.debugCanvas.shapes;
      const lines = shapes.filter((s) => s.kind === 'line');
      const last = lines[lines.length - 1];
      return { hash: sim.hash(), lines: lines.length, arcEnd: last && last.kind === 'line' ? last.by : NaN, points: shapes.filter((s) => s.kind === 'point').length };
    };
    const shown = run(true);
    const quiet = run(false);
    expect(shown.hash).toBe(quiet.hash);
    expect(quiet.lines).toBe(0);
    // The arc runs on to the flat ground and marks where it meets it.
    expect(shown.lines).toBeGreaterThan(5);
    expect(shown.arcEnd).toBeLessThanOrEqual(0);
    expect(shown.points).toBeGreaterThanOrEqual(1);
  });

  it('is only thrown while one is left', () => {
    const sim = range();
    arm(player(sim.index), T);
    player(sim.index).rifle!.throwables = 1;
    const throws = (n: number) => {
      let count = 0;
      for (let i = 0; i < n; i++) count += sim.step({ ...neutralInput(), commands: [{ kind: 'throw', lag: 0, yaw: 0, pitch: 0.3 }] }).length >= 0 ? 0 : 1;
      return count;
    };
    throws(3);
    expect(sim.index.of('thrown')).toHaveLength(1);
  });
});

describe('the range, saved and put back', () => {
  it('continues bit for bit with bullets in the air and a stone in flight', () => {
    const scene = SCENES['shooting-range']!();
    const world = scene.world(T);
    const sim = startScene(scene, T, world);
    const shadow = startScene(scene, T, world);
    // Every 5 ticks: a bullet takes 12 to reach 300 m and a stone far more, so saves fall inside every flight.
    const every = 5;
    const sync = new SyncTest(sim, shadow, every);
    const driver = scene.driver!();
    const still = scene.game.still(sim);
    const ticks = sceneTicks(scene, T);
    let bulletsSaved = 0;
    let stonesSaved = 0;
    while (!sceneOver(scene, sim, ticks) && !sync.report.failure) {
      if (sim.tick % every === 0) {
        bulletsSaved += sim.index.of('bullet').length;
        stonesSaved += sim.index.of('thrown').filter((o) => !o.thrown.rest).length;
      }
      sync.beforeTick();
      sim.step(driver.next(sim, still));
      sync.afterTick();
    }
    expect(sync.report.failure ? describeSyncFailure(sync.report.failure) : null).toBeNull();
    expect(sync.report.saves).toBeGreaterThan(50);
    expect(bulletsSaved).toBeGreaterThan(5);
    expect(stonesSaved).toBeGreaterThan(2);
  });
});
