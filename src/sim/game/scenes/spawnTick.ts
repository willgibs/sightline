import type { GenTuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, type GuardSpawn, type Routine } from '../../generation';
import { Rng } from '../../kernel/core/rng';
import type { EntityId } from '../../kernel/state';
import { decide, type System, type TickContext } from '../../kernel/systems';
import { Blocks } from '../../kernel/world/colliders';
import { emptyHit, raycast } from '../../kernel/world/query';
import type { GuardEntity } from '../entities';
import { spawnGuard } from '../setup';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * When a body spawned inside a tick first exists, for each system. Two guards are away
 * from their posts at the start, and arrive mid-run, dropped from a metre up:
 * - one in the 'world' phase of tick 30, after the motor has run: queries see him at
 *   once, perception that same tick, and the motor first moves him on tick 31;
 * - one in the 'commands' phase of tick 60, before 'intent': he carries out his first
 *   order and the motor moves him in tick 60 itself.
 * The rule this pins: a spawned entity exists from the moment it is spawned, for every
 * system that runs after it in the tick, and for every system from the next tick on.
 * Reinforcements (lab E), a killed guard's body (lab B) and sandbox drops build on it.
 */

const NAME = 'spawn-tick';
/** Where perception looks from: a watch point clear of every body. */
const EYE = { x: 12, y: 2, z: 12 };
/** Where the player stands, out of the way. */
const PLAYER = { x: 0, z: 20 };
const ARRIVALS = [
  { post: 0, tick: 30, phase: 'world' },
  { post: 1, tick: 60, phase: 'commands' },
] as const;

function post(id: number, x: number, z: number, routines: GenTuning['routines']): GuardSpawn {
  const s: GuardSpawn = { id, role: 'sentry', x, y: 0, z, faceX: 0, faceZ: 1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 1, routine: null as unknown as Routine };
  s.routine = buildRoutine(s, routines, new Rng(NAME, 'routines').fork(`guard${id}`));
  return s;
}

/** What each arrival did, and when: written by the scene's watching systems, read by its expectations. */
interface Arrival {
  id: EntityId;
  spawnY: number;
  /** Ticks at which the spawner found him in a query, perception first saw him, and the motor first moved him. */
  queried: number;
  seen: number;
  moved: number;
}

export function spawnTick(): Scene {
  const arrivals: Arrival[] = [];
  const hit = emptyHit();

  /** Spawns post `k`'s guard a metre up, and checks that a query sees him at once. */
  const arrive = (ctx: TickContext, k: number): void => {
    const g = spawnGuard(ctx, ARRIVALS[k]!.post);
    const b = g.body;
    b.y += 1;
    for (const h of b.history) h.y += 1;
    b.motor = 'air';
    arrivals[k] = { id: g.id, spawnY: b.y, queried: ctx.query().bodies.some((q) => q.id === g.id) ? ctx.tick : -1, seen: -1, moved: -1 };
  };
  const arrival = (ctx: TickContext, k: number): GuardEntity | undefined => {
    const a = arrivals[k];
    const e = a ? ctx.index.get(a.id) : undefined;
    return e?.kind === 'guard' ? e : undefined;
  };

  const arriveAfterMotor: System = {
    name: 'arrive-after-motor',
    phase: 'world',
    reads: [],
    writes: ['entities'],
    emits: [],
    run: (ctx) => void (ctx.tick === ARRIVALS[0].tick && arrive(ctx, 0)),
  };
  const arriveBeforeIntent: System = {
    name: 'arrive-before-intent',
    phase: 'commands',
    reads: [],
    writes: ['entities'],
    emits: [],
    after: ['player-commands', 'rifle', 'sandbox-drops'],
    run: (ctx) => void (ctx.tick === ARRIVALS[1].tick && arrive(ctx, 1)),
  };
  const watchMotor: System = {
    name: 'watch-motor',
    phase: 'motor',
    reads: ['guard.body'],
    writes: [],
    emits: [],
    after: ['motor'],
    run(ctx) {
      for (const [k, a] of arrivals.entries()) {
        const g = arrival(ctx, k);
        if (g && a.moved < 0 && g.body.y < a.spawnY) a.moved = ctx.tick;
      }
    },
  };
  const watchPerception: System = {
    name: 'watch-perception',
    phase: 'perception',
    reads: ['*.body', 'solid.solid'],
    writes: [],
    emits: [],
    run(ctx) {
      const view = ctx.query();
      for (const [k, a] of arrivals.entries()) {
        const g = arrival(ctx, k);
        if (!g || a.seen >= 0) continue;
        const dx = g.body.x - EYE.x;
        const dy = g.body.y + g.body.eyeHeight - EYE.y;
        const dz = g.body.z - EYE.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        raycast(view, EYE.x, EYE.y, EYE.z, dx / d, dy / d, dz / d, d + 1, Blocks.Sight, hit);
        if (hit.what === 'body' && hit.id === g.id) a.seen = ctx.tick;
      }
    },
  };
  const rules: System = {
    name: 'arrival-rules',
    phase: 'mission',
    reads: ['guard.body'],
    writes: ['outcome'],
    emits: ['outcome'],
    run(ctx) {
      if (arrivals.length !== ARRIVALS.length) return;
      const landed = arrivals.every((_, k) => arrival(ctx, k)?.body.motor === 'ground');
      if (landed) decide(ctx, 'succeeded', 'both arrivals have landed', arrivals[1]!.id);
    },
  };

  const pinned = (k: number, seen: number, moved: number) => (): string | void => {
    const a = arrivals[k];
    const what = `post ${ARRIVALS[k]!.post}'s guard, spawned in '${ARRIVALS[k]!.phase}' at tick ${ARRIVALS[k]!.tick}`;
    if (!a) return `${what} never arrived`;
    if (a.queried !== ARRIVALS[k]!.tick || a.seen !== seen || a.moved !== moved) return `${what}: queried at ${a.queried}, seen at ${a.seen}, moved at ${a.moved}`;
  };

  return {
    name: NAME,
    version: 1,
    title: 'Spawn timing',
    description: 'Two guards arrive mid-run, one after the motor and one before it: when each first exists for queries, perception and the motor.',
    game: SIGHTLINE,
    world: (tuning) =>
      buildWorld(
        {
          name: NAME,
          size: 80,
          cell: 1,
          camp: { structures: [], guards: [post(0, -5, -10, tuning.gen.routines), post(1, 5, -10, tuning.gen.routines)], fenceHalf: 0 },
          spawn: { x: PLAYER.x, z: PLAYER.z, faceX: 0, faceZ: -1 },
        },
        tuning.gen,
      ),
    systems: [arriveBeforeIntent, watchMotor, arriveAfterMotor, watchPerception, rules],
    setup(sim) {
      arrivals.length = 0;
      // Both guards are away from their posts when the run starts.
      for (const g of [...sim.guards]) sim.despawn(g.id);
    },
    seconds: 5,
    expect: [
      { name: "a guard spawned in 'world' exists for queries at once, for perception that tick, and for the motor from the next", after: pinned(0, 30, 31) },
      { name: "a guard spawned in 'commands' exists for queries, perception and the motor in the tick he arrives", after: pinned(1, 60, 60) },
      {
        name: 'both arrivals land, and the rules call it a success',
        after: (sim) => {
          if (sim.state.outcome.status !== 'succeeded') return `the outcome is ${sim.state.outcome.status}`;
        },
      },
    ],
  };
}
