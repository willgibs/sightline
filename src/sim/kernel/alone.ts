import type { GenTuning } from '../../config/tuning';
import { Hasher } from './core/hash';
import { defaultEnv } from './env';
import type { Game } from './game';
import { neutralInput } from './input';
import type { Scene } from './scene';
import { Simulation } from './sim';
import { Faction, type SolidEntity } from './state';
import { decide, scheduleSystem, type Access, type ScheduleHandler, type System } from './systems';
import { GEN_VERSION } from './version';
import { Blocks, ColliderSet, type BoxCollider, type ColliderInput } from './world/colliders';
import { buildGrid } from './world/grid';
import { Heightfield } from './world/heightfield';
import { Surface } from './world/surfaces';
import type { World } from './world/world';

/**
 * The kernel alone: a game with no lanes, a world with only the kernel's parts, and a
 * scene that runs them. It shows that the kernel stands on its own: with every lane
 * switched off, a run still steps, hashes, saves, restores and replays
 * (tests/kernel.test.ts). Like the rest of the kernel, nothing here imports a lane or the game.
 */

/** A fingerprint of a world's kernel parts: its terrain and its colliders, bit for bit. */
export function kernelFingerprint(world: World): string {
  const h = new Hasher();
  world.terrain.hashInto(h);
  world.colliders.hashInto(h);
  return h.digest();
}

/**
 * A game of the kernel alone: its only system runs the schedule, through `handlers` (with
 * their declared `access`), and its runs start empty, with no bodies.
 */
export function kernelGame(handlers: Readonly<Record<string, ScheduleHandler>> = {}, access?: Access): Game {
  const game: Game = {
    name: 'the kernel alone',
    systems: [scheduleSystem(handlers, access)],
    simulation: (world, tuning, systems) => new Simulation(world, tuning, game, systems),
    start: () => {},
    still: () => neutralInput(),
    bodies: (_state, _tuning, out) => {
      out.length = 0;
      return out;
    },
    world: () => {
      throw new Error('The kernel alone builds no world from a mission spec: its scenes build their own (kernelWorld)');
    },
    fingerprint: kernelFingerprint,
    sample: () => {},
  };
  return game;
}

/**
 * A flat world of the kernel's parts only: terrain, colliders and the spatial grid. What
 * the lanes add to a World (generation's camp, props and spawn) isn't there, so only the
 * kernel's own systems may run in it.
 */
export function kernelWorld(name: string, gen: GenTuning, opts: { size?: number; cell?: number; colliders?: readonly ColliderInput[] } = {}): World {
  const size = opts.size ?? 64;
  const terrain = new Heightfield(size, opts.cell ?? 2);
  terrain.finalize();
  const colliders = new ColliderSet(size);
  for (const c of opts.colliders ?? []) colliders.add(c);
  colliders.build();
  const half = size / 2;
  const kernelParts = {
    spec: { seed: name, genVersion: GEN_VERSION, terrain: { kind: 'handmade' as const, name }, insertion: 'edge' as const, env: defaultEnv() },
    seed: name,
    terrain,
    colliders,
    grid: buildGrid(terrain, colliders, { minX: -half, minZ: -half, maxX: half, maxZ: half }, gen),
    playHalf: half - 2,
  };
  return kernelParts as World;
}

/** The gates' turns: every 1.5 s, until the eighth decides the run. */
const TURN_SECONDS = 1.5;
const TURNS = 8;

/** A gate's quarter turn falls due: it swings, and the next is scheduled; the last decides the run. */
const turn: ScheduleHandler = (ctx, e) => {
  const gate = ctx.index.get(e.a);
  if (!gate || gate.kind !== 'solid' || gate.solid.kind !== 'box') return;
  const c = gate.solid;
  const ux = c.ux;
  // Adding 0 keeps a zero component from being −0.
  c.ux = -c.uz + 0;
  c.uz = ux;
  if (e.b + 1 < TURNS) ctx.schedule(TURN_SECONDS, 'turn', e.a, e.b + 1);
  else decide(ctx, 'succeeded', `the gates turned ${TURNS} times`, e.a);
};

/** The gates slide along their own axis, by a step drawn from each gate's own stream; on the first tick they start turning. */
const slide: System = {
  name: 'gates',
  phase: 'world',
  reads: ['solid.solid'],
  writes: ['solid.solid', 'rng.step', 'schedule'],
  emits: [],
  run(ctx, dt) {
    for (const gate of ctx.index.of('solid')) {
      const c = gate.solid;
      if (c.kind !== 'box') continue;
      if (ctx.tick === 1) ctx.schedule(TURN_SECONDS, 'turn', gate.id, 0);
      const step = ctx.draw(gate.id, 'step', (rng) => 0.5 + rng.next()) * 2 * dt;
      c.x += c.ux * step;
      c.z += c.uz * step;
    }
  },
};

const GATE: BoxCollider = { kind: 'box', id: 0, x: 0, z: 0, y0: 0, y1: 2, hx: 1.5, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood };
/** Where the two gates start. */
const STARTS = [
  [-6, -6],
  [6, 6],
] as const;

/**
 * Two gates in a walled yard, with no bodies and no lanes: each slides along its own
 * axis by steps drawn from its own random stream and swings a quarter turn on a schedule,
 * so each traces a rough square; the eighth turn decides the run. It touches every part
 * of the kernel a lane builds on: entities, the solids, random streams, the schedule,
 * events and the outcome.
 */
export function kernelAloneScene(name = 'kernel-alone'): Scene {
  const game = kernelGame({ turn }, { reads: [], writes: ['solid.solid', 'outcome'], emits: ['outcome'] });
  /** How far each gate has been from its start: a gate traces a square, and is back near its start after every fourth turn. */
  const farthest = STARTS.map(() => 0);
  const wall = (x: number, z: number, hx: number, hz: number): ColliderInput => ({ kind: 'box', x, z, y0: 0, y1: 3, hx, hz, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Wood });
  return {
    name,
    version: 1,
    title: 'The kernel alone',
    description: 'Two gates turning in a yard, with no lanes and no bodies: the kernel on its own.',
    game,
    world: (tuning) => kernelWorld(name, tuning.gen, { colliders: [wall(0, -20, 20, 0.5), wall(0, 20, 20, 0.5), wall(-20, 0, 0.5, 20), wall(20, 0, 0.5, 20)] }),
    systems: [slide],
    setup(sim) {
      farthest.fill(0);
      for (const [x, z] of STARTS) sim.spawn((id): SolidEntity => ({ id, kind: 'solid', faction: Faction.None, solid: { ...GATE, x, z } }));
    },
    seconds: 30,
    expect: [
      {
        name: 'the eighth turn decides the run',
        after: (sim) => {
          const o = sim.state.outcome;
          if (o.status !== 'succeeded') return `the outcome is ${o.status} at tick ${sim.tick}`;
          if (o.tick !== 1 + TURNS * Math.round(TURN_SECONDS * sim.tuning.sim.tickHz)) return `decided at tick ${o.tick}`;
        },
      },
      {
        name: 'the gates move, and keep inside the yard',
        during: (sim) => {
          for (const [k, g] of sim.index.of('solid').entries()) {
            if (Math.abs(g.solid.x) > 19 || Math.abs(g.solid.z) > 19) return `gate ${g.id} at ${g.solid.x.toFixed(2)}, ${g.solid.z.toFixed(2)}`;
            const dx = g.solid.x - STARTS[k]![0];
            const dz = g.solid.z - STARTS[k]![1];
            farthest[k] = Math.max(farthest[k]!, Math.sqrt(dx * dx + dz * dz));
          }
        },
        after: () => {
          const still = farthest.findIndex((d) => d < 1);
          if (still >= 0) return `gate ${still + 1} never went more than ${farthest[still]!.toFixed(2)} m from its start`;
        },
      },
    ],
  };
}
