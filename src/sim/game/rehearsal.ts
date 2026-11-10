import type { Tuning } from '../../config/tuning';
import { startScene } from '../kernel/scene';
import type { World } from '../kernel/world/world';
import { compound } from './scenes/compound';
import type { Simulation } from './sim';

/**
 * A rehearsal: a camp's fight, run once where nobody sees it, before anyone plays it.
 *
 * The first time anything happens in a run it costs many times what it costs after: the
 * engine is still compiling the code for it, and whatever the world keeps for the purpose
 * (a listener's masked threshold, the tree crowns a bullet passes, a way across the yard)
 * is being worked out. In play that is the tick of the first shot, which took 22 ms where
 * the same tick later takes 3: the one moment the player is holding his breath.
 *
 * So the same camp is attacked here first: a sniper on its best overview, in a throwaway
 * run on the same world, for long enough that the camp has heard shots, barked, whistled,
 * taken cover, found routes and sounded its siren. What the world keeps is kept for the
 * real run, and the code is warm. The run itself is thrown away: nothing in it reaches a
 * state anyone plays, so it can't change what happens, only when the work is done.
 *
 * Returns the ticks it ran: none for a world with no camp to attack.
 */
export function rehearse(world: World, tuning: Tuning, seconds = REHEARSAL_SECONDS): number {
  if (!world.report.camp || world.report.camp.perches.length === 0 || world.camp.guards.length === 0) return 0;
  const scene = compound(`seed=${world.seed}&attack=sniper&ready=alert`);
  const sim = startScene(scene, tuning, world) as Simulation;
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round(seconds * tuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) sim.step(driver.next(sim, raw));
  return ticks;
}

/** Long enough for the script's first shots (from 12 s) to have run their course through the camp; longer warms nothing more that a fight's first minute needs. */
export const REHEARSAL_SECONDS = 25;
