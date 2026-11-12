import type { Tuning } from '../../config/tuning';
import { approachOf, emptyRoute, navigatorOf } from '../brain';
import { startScene } from '../kernel/scene';
import { Cell } from '../kernel/world/grid';
import type { World } from '../kernel/world/world';
import { compound } from './scenes/compound';
import { firefight, meetingOf } from './scenes/firefight';
import { hunt } from './scenes/hunt';
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
 * taken cover, found routes and sounded its siren. Its relief is brought in early, so that
 * the truck, the men sent to the target's door and his run for his vehicle are rehearsed
 * too. What the world keeps is kept for the real run, and the code is warm. The run itself
 * is thrown away: nothing in it reaches a state anyone plays, so it can't change what
 * happens, only when the work is done.
 *
 * Returns the ticks it ran: none for a world with no camp to attack.
 */
export function rehearse(world: World, tuning: Tuning, seconds = REHEARSAL_SECONDS): number {
  if (!world.report.camp || world.report.camp.perches.length === 0 || world.camp.guards.length === 0) return 0;
  const scene = compound(`seed=${world.seed}&attack=sniper&ready=alert`);
  const hurried: Tuning = { ...tuning, brain: { ...tuning.brain, reinforce: { ...tuning.brain.reinforce, delay: RELIEF_AFTER } } };
  const sim = startScene(scene, hurried, world) as Simulation;
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round(seconds * tuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) sim.step(driver.next(sim, raw));
  rehearseFloors(world, tuning);
  // What each listed firing point sees of the valley, read now and kept: otherwise the tick a section is first sent out reads three of them.
  approachOf(world, tuning).prepare();
  return ticks;
}

/**
 * Routes with an end upstairs come later in a fight than the rehearsal runs: the men sent to a
 * target's door on an upper floor, his own way down to his vehicle. The tick of the first of
 * them took 5.6 ms where the same tick takes 2 once that code has run (`npm run hitches`, the
 * first run only). So the far end of each floor from the head of its flight is asked for from
 * every post on the ground, there and back. A navigator keeps nothing between calls, so
 * nothing here reaches a run either.
 */
function rehearseFloors(world: World, tuning: Tuning): void {
  const nav = navigatorOf(world, tuning);
  const route = emptyRoute();
  for (const stair of world.grid.stairs) {
    const { layer, y } = world.grid.storeys[stair.storey]!;
    let fx = stair.headX;
    let fz = stair.headZ;
    let far = -1;
    for (let c = 0; c < layer.nx * layer.nz; c++) {
      if ((layer.flags[c]! & Cell.Walkable) === 0) continue;
      const i = c % layer.nx;
      const x = layer.x0 + (i + 0.5) * layer.cell;
      const z = layer.z0 + ((c - i) / layer.nx + 0.5) * layer.cell;
      const d = (x - stair.headX) * (x - stair.headX) + (z - stair.headZ) * (z - stair.headZ);
      // The first of the farthest, in cell order.
      if (d > far) {
        far = d;
        fx = x;
        fz = z;
      }
    }
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      nav.find(g.x, g.z, fx, fz, {}, route, undefined, y);
      nav.find(fx, fz, g.x, g.z, {}, route, y);
    }
  }
}

/**
 * And a fight at close quarters (scenes/firefight.ts), on a camp that has a place for one:
 * someone seen in front of a guard, who goes to ground. A sniper on a ridge never brings on
 * the firefight (brain/firefight.ts), so its positions, its bounds and the ways that keep
 * out of an intruder's view would otherwise be compiled the first time a player is seen.
 * Thrown away like the other. Returns the ticks it ran: none where there's nowhere to meet.
 */
export function rehearseFirefight(world: World, tuning: Tuning, seconds = FIREFIGHT_SECONDS): number {
  if (world.camp.guards.length === 0 || !world.camp.layout || !meetingOf(world, tuning)) return 0;
  const scene = firefight(`seed=${world.seed}`);
  const sim = startScene(scene, tuning, world) as Simulation;
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round(seconds * tuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) sim.step(driver.next(sim, raw));
  return ticks;
}

/** Long enough for him to be seen, to go to ground, and for someone to have come after him. */
export const FIREFIGHT_SECONDS = 45;

/**
 * And a hunt (scenes/hunt.ts): one loud shot from the best overview, and the camp placing
 * him, forming a section and sending it out. The attack above is the compound simulator's,
 * whose camp doesn't hunt, so the tick a section was first formed took 5.1 ms where it
 * takes 1.6 once that code has run (`npm run hitches -- hunt`). Thrown away like the
 * others. Returns the ticks it ran: none where there's no overview to fire from.
 */
export function rehearseHunt(world: World, tuning: Tuning, seconds = HUNT_SECONDS): number {
  if (!world.report.camp || world.report.camp.perches.length === 0 || world.camp.guards.length === 0 || !world.camp.layout) return 0;
  const scene = hunt(`seed=${world.seed}`);
  const sim = startScene(scene, tuning, world) as Simulation;
  const driver = scene.driver!();
  const raw = scene.game.still(sim);
  const ticks = Math.round(seconds * tuning.sim.tickHz);
  for (let i = 0; i < ticks; i++) sim.step(driver.next(sim, raw));
  return ticks;
}

/** Long enough for his shot (at 8 s) to have been placed, a section formed and its men to have gathered and set off. */
export const HUNT_SECONDS = 60;

/** Long enough for the script's shots (from 12 s) to have run their course through the camp, and for the hurried relief to have come and the target to have been sent for. */
export const REHEARSAL_SECONDS = 50;

/** Seconds from lockdown to the relief's arrival, in the rehearsal only. */
const RELIEF_AFTER = 6;
