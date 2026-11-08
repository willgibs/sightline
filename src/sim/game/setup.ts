import { createBody } from '../body';
import type { Simulation as KernelSimulation } from '../kernel/sim';
import { Faction } from '../kernel/state';
import type { TickContext } from '../kernel/systems';
import type { GuardEntity, PlayerEntity } from './entities';
import { spawnCampThings } from './camp';
import { createGuard, think } from './guards';
import { createPlayer } from './player';
import type { Simulation } from './sim';

/**
 * How a run of Sightline starts (kernel/game.ts, Game.start): the player at the world's
 * spawn, then each of the camp's guards at his post, then the camp's doors and vehicles
 * (game/camp.ts), in that order, so the player is always entity 1 and the guards follow in
 * the camp's order. Re-simulating a recording starts the same way.
 */
export function startRun(sim: KernelSimulation): void {
  const { world, solids, tuning } = sim;
  sim.spawn((id): PlayerEntity => ({ id, kind: 'player', faction: Faction.Player, ...createPlayer(world, solids, tuning) }));
  for (let i = 0; i < world.camp.guards.length; i++) spawnGuard(sim, i);
  spawnCampThings(sim);
}

/** What can spawn: a simulation between ticks, or a system inside one. */
export type Spawner = Pick<TickContext, 'world' | 'solids' | 'tuning' | 'state' | 'spawn'>;

/**
 * Spawns a guard at one of the camp's posts (world.camp.guards), between ticks or inside
 * one, as reinforcements will. He starts with his first order: what his brain decides
 * from where he stands, for the first tick not yet finished (tick 1 at setup; the tick
 * running, inside one), as it will at the end of every tick after.
 */
export function spawnGuard(at: Spawner, post: number): GuardEntity {
  const { world, solids, tuning } = at;
  const g = at.spawn((id): GuardEntity => ({ id, kind: 'guard', faction: Faction.Camp, ...createGuard(world, solids, post, tuning) }));
  think(g, world, tuning, at.state.tick + 1);
  return g;
}

/** A scene's setup: puts the player at (x, z), facing (faceX, faceZ), standing where a body would stand there. */
export function placePlayer(sim: Simulation, x: number, z: number, faceX = 0, faceZ = -1): void {
  if (sim.tick !== 0) throw new Error('placePlayer is for setup, before the first tick');
  const body = createBody(sim.world, sim.solids, sim.tuning.bodies.player, x, z, faceX, faceZ);
  Object.assign(sim.player, body);
}
