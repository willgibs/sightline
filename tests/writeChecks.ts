import { expect, it } from 'vitest';
import { defaultTuning } from '../src/config/tuning';
import { ChaosBot } from '../src/sim/game/bots/chaos';
import { WanderBot } from '../src/sim/game/bots/wander';
import { boardingPoint } from '../src/sim/game/camp';
import { commanderOf } from '../src/sim/game/comms';
import type { GuardEntity } from '../src/sim/game/entities';
import { SCENES } from '../src/sim/game/scenes';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { Simulation } from '../src/sim/game/sim';
import { generateWorld } from '../src/sim/generation';
import { kernelAloneScene } from '../src/sim/kernel/alone';
import { neutralInput } from '../src/sim/kernel/input';
import { missionSpec } from '../src/sim/kernel/mission';
import { runScene, type Scene } from '../src/sim/kernel/scene';
import type { Simulation as KernelSimulation } from '../src/sim/kernel/sim';
import type { SimState } from '../src/sim/kernel/state';
import { shooterScene } from './live';

/**
 * Whole runs watched system by system: whatever a system changes in the state tree must be
 * covered by what it declares (CLAUDE.md, rule 12). Cloning the state around every system
 * is slow, so the runs are shared out over a few test files (systems.test.ts and
 * systems<N>.test.ts), which CI's shards run side by side.
 */

/** The access path of a changed leaf of the state tree: entities by their kind, random streams by their purpose. */
function accessPath(path: readonly (string | number)[], after: SimState): string {
  const [root, k, ...rest] = path;
  if (root === 'entities') {
    const e = typeof k === 'number' ? after.entities[k] : undefined;
    return e && rest.length > 0 ? [e.kind, ...rest].join('.') : 'entities';
  }
  if (root === 'nextId') return 'entities';
  if (root === 'rng' && typeof k === 'string') return `rng.${k.slice(k.indexOf('.') + 1)}`;
  return String(root);
}

/** Every leaf that differs between two plain trees, as a path; a key added or removed is a change at that key, a changed length a change of the whole array. */
function changes(a: unknown, b: unknown, path: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
  if (a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b))) return out;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    out.push(path);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Entities are matched by id: a despawn shifts the rest along, and mustn't hide what else changed.
    if (path.length === 1 && path[0] === 'entities') {
      const now = new Map((b as Array<{ id: number }>).map((e, j) => [e.id, j]));
      if (a.length !== b.length || (a as Array<{ id: number }>).some((e) => !now.has(e.id))) out.push(path);
      for (const e of a as Array<{ id: number }>) {
        const j = now.get(e.id);
        if (j !== undefined) changes(e, b[j], [...path, j], out);
      }
      return out;
    }
    if (a.length !== b.length) out.push(path);
    else a.forEach((x, i) => changes(x, b[i], [...path, i], out));
    return out;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!(k in x) || !(k in y)) out.push([...path, k]);
    else changes(x[k], y[k], [...path, k], out);
  }
  return out;
}

/** True if a declared write covers a changed path: it is a prefix of it, with * standing for any kind. */
function covers(write: string, path: string): boolean {
  const w = write.split('.');
  const p = path.split('.');
  if (w.length > p.length) return false;
  const isKind = (r: string): boolean => !['schedule', 'outcome', 'rng', 'entities', 'input', 'nextEventId', 'tick'].includes(r);
  // Spawning and despawning, not every field of every entity: a new entity shows up as itself, with no field named.
  if (w[0] === 'entities') return p[0] === 'entities' || p.length === 1;
  if (w[0] !== p[0] && !(w[0] === '*' && isKind(p[0]!))) return false;
  return w.every((x, i) => i === 0 || x === p[i]);
}

/** Watches every system of a run: whatever it changes in the state tree must be covered by what it declares. */
function watchWrites(sim: KernelSimulation, found: Set<string>): void {
  let before: SimState | null = null;
  sim.profiler = {
    begin: () => {
      before = structuredClone(sim.state);
    },
    end: (system) => {
      for (const path of changes(before, sim.state)) {
        const p = accessPath(path, sim.state);
        if (p === 'nextEventId' ? system.emits.length === 0 : !system.writes.some((w) => covers(w, p))) found.add(`${system.name} wrote ${p}, which it doesn't declare`);
      }
    },
  };
}

function underFire(): void {
  const found = new Set<string>();
  const base = shooterScene('LEB-2534', 24, 2, 2);
  const scene = { ...base, setup: (sim: Simulation) => (base.setup!(sim), watchWrites(sim, found)) };
  runScene(scene, defaultTuning);
  expect([...found]).toEqual([]);
}

function boarding(): void {
  for (const disabled of [false, true]) {
    const found = new Set<string>();
    // A camp that protects nobody: at the siren its target goes for his vehicle at once.
    const base = liveCamp('seed=LEB-2534&off=protect') as Scene<Simulation>;
    const scene: Scene<Simulation> = {
      ...base,
      seconds: 6,
      expect: [],
      setup: (sim) => {
        base.setup!(sim);
        const c = commanderOf(sim)!;
        const spec = sim.world.camp.vehicles!.find((x) => x.escape)!;
        sim.index.of('vehicle').find((v) => v.vehicle.escape)!.vehicle.disabled = disabled;
        const at = boardingPoint(sim.world, spec, defaultTuning);
        const target = sim.index.get(c.camp.objective!.target) as GuardEntity;
        target.body.x = at.x;
        target.body.z = at.z;
        target.body.y = sim.world.terrain.heightAt(at.x, at.z);
        target.brain!.sirenAt = 0;
        c.camp.level = 'lockdown';
        watchWrites(sim, found);
      },
    };
    const run = runScene(scene, defaultTuning);
    const status = commanderOf(run.sim as Simulation)!.camp.objective!.status;
    expect(status).toBe(disabled ? 'open' : 'escaping');
    expect([...found]).toEqual([]);
  }
}

function inValleys(): void {
  const found = new Set<string>();
  const world = generateWorld(missionSpec('TAL-4471'), defaultTuning);
  for (const bot of [new ChaosBot('TAL-4471'), new WanderBot('TAL-4471')]) {
    const sim = new Simulation(world, defaultTuning);
    watchWrites(sim, found);
    const raw = neutralInput();
    for (let i = 0; i < 900; i++) sim.step({ ...bot.next(sim, raw), commands: i % 100 === 50 ? [{ kind: 'fire', lag: 0.5, yaw: 0, pitch: 0 }] : [] });
  }
  expect([...found]).toEqual([]);
}

function inScene(make: () => Scene): void {
  const found = new Set<string>();
  const scene = make();
  // Long scenes run shortened, without their expectations.
  const long = (scene.seconds ?? 10) > 20;
  const run = runScene(
    { ...scene, ...(long ? { expect: [] } : {}), setup: (sim) => (scene.setup?.(sim as never), watchWrites(sim, found)) } as typeof scene,
    defaultTuning,
    long ? { seconds: 20 } : {},
  );
  expect(run.failures).toEqual([]);
  expect([...found]).toEqual([]);
}

/**
 * Registers part `part` of `of` (from 1) of the checks: those whose place in the list leaves
 * `part - 1` when divided by `of`. Every file that calls this must use the same `of`, and
 * there must be one file for each part.
 */
export function writeChecks(part: number, of: number): void {
  // One check per scene: one time limit over all of them stopped fitting on Windows' runner.
  const scenes: Array<[string, () => Scene]> = [...(Object.entries(SCENES) as Array<[string, () => Scene]>), ['kernel-alone', () => kernelAloneScene()]];
  const checks: Array<[string, () => void, number]> = [
    ['with the camp brain under fire', underFire, 180_000],
    ['when the target boards or finds his vehicle dead', boarding, 180_000],
    ['in valleys', inValleys, 120_000],
    ...scenes.map(([name, make]): [string, () => void, number] => [`in the scene ${name}`, () => inScene(make), 180_000]),
  ];
  checks.forEach(([what, run, timeout], i) => {
    if (i % of === part - 1) it(`lets every system write only what it declares, ${what}`, run, timeout);
  });
}
