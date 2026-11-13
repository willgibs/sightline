import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { FlawWatch } from '../src/lab/flaws';
import { keptWorld } from '../src/lab/worlds';
import { navigatorOf } from '../src/sim/brain/nav';
import { placeAt } from '../src/sim/brain/protect';
import type { AttackDriver } from '../src/sim/game/attacks';
import { commanderOf } from '../src/sim/game/comms';
import { emptyMind, guardMind } from '../src/sim/game/guards';
import { compound } from '../src/sim/game/scenes/compound';
import type { Simulation } from '../src/sim/game/sim';
import { startScene, type Scene } from '../src/sim/kernel/scene';

/**
 * Men sent about the target each have a place of their own (brain/protect.ts, `placeAt`), so
 * two pairs sent to bring him out don't end on one spot by his vehicle.
 *
 * - Place 0, or none, is the point itself: a man with no place stands where he always did.
 * - Different places are different spots, each `apart` or more from the others, on ground a
 *   man could walk to straight from the point.
 * - NUB-9046 under a suppressed sniper: the relief's two and the camp's own two once stood
 *   within 2.5 m of each other by the vehicle for half a minute. With places they don't;
 *   with `off=places` they do, as before.
 */

const SEED = 'NUB-9046';
const ATTACK = 'suppressed-sniper';
/** Past the half minute the four stood together (about 170 to 195 s). */
const UNTIL = 210;

interface Run {
  sim: Simulation;
  watch: FlawWatch;
  /** Ticks at which two men on orders about him held the same place, and every place handed out. */
  shared: number;
  places: Set<number>;
}

function run(off: string): Run {
  const scene = compound(`seed=${SEED}&attack=${ATTACK}${off ? `&off=${off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(scene, T, keptWorld(`live-camp:${SEED}`, T, scene.world));
  const driver = scene.driver!() as AttackDriver;
  const raw = scene.game.still(sim);
  const watch = new FlawWatch(driver.truth);
  let shared = 0;
  const places = new Set<number>();
  while (sim.tick < UNTIL * T.sim.tickHz) {
    watch.observe(sim, sim.step(driver.next(sim, raw)));
    const now = new Set<number>();
    for (const g of sim.guards) {
      const t = g.brain?.task;
      if (!t || (t.kind !== 'fetch' && t.kind !== 'escort') || t.place === undefined) continue;
      places.add(t.place);
      if (now.has(t.place)) shared++;
      now.add(t.place);
    }
  }
  return { sim, watch, shared, places };
}

describe('places by the target', () => {
  let on: Run;
  let off: Run;
  beforeAll(() => {
    on = run('');
    off = run('places');
  }, 120_000);

  it('puts place 0, or no place, on the point, and other places apart from it and from each other', () => {
    const sim = on.sim;
    const camp = commanderOf(sim)!.camp;
    const room = camp.protects!;
    const at = camp.devices.escape!;
    const g = sim.guards.find((x) => x.brain)!;
    const m = guardMind(g, sim.world, sim.tuning, sim.tick, emptyMind());
    const nav = navigatorOf(sim.world, sim.tuning);
    const spots: Array<{ x: number; z: number }> = [];
    for (let place = 0; place < 6; place++) {
      const s = { x: NaN, z: NaN };
      placeAt(m, at.x, at.z, room.x, room.z, place, s);
      spots.push(s);
      expect(nav.clear(at.x, at.z, s.x, s.z)).toBe(true);
    }
    expect(spots[0]).toEqual({ x: at.x, z: at.z });
    const none = { x: NaN, z: NaN };
    placeAt(m, at.x, at.z, room.x, room.z, -1, none);
    expect(none).toEqual({ x: at.x, z: at.z });
    for (let a = 0; a < spots.length; a++)
      for (let b = a + 1; b < spots.length; b++) {
        const d = Math.hypot(spots[a]!.x - spots[b]!.x, spots[a]!.z - spots[b]!.z);
        expect(d, `places ${a} and ${b}`).toBeGreaterThan(T.brain.protect.apart * 0.99);
      }
  });

  it('gives the two pairs sent for him places no two of them share, and none with the switch off', () => {
    expect(commanderOf(on.sim)!.camp.places).toBe(true);
    expect(commanderOf(off.sim)!.camp.places).toBeUndefined();
    // The relief's two, then the camp's own two, then the next pair it sends.
    expect([...on.places].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(on.shared).toBe(0);
    expect(off.places.size).toBe(0);
  });

  it('keeps the four men by his vehicle from piling up on NUB-9046, and off=places plays it as before', () => {
    const piles = (w: FlawWatch): number => w.flaws.filter((f) => f.kind === 'pile-up' && f.at >= 140).length;
    expect(piles(off.watch)).toBeGreaterThan(0);
    expect(piles(on.watch)).toBe(0);
  });
});
