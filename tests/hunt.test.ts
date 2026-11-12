import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { commanderOf } from '../src/sim/game/comms';
import { emptyHuntSeen, hunt, watchHunt, type HuntSeen } from '../src/sim/game/scenes/hunt';
import type { Simulation } from '../src/sim/game/sim';
import { sceneTuning, startScene, type Scene } from '../src/sim/kernel/scene';
import { worldOf } from './live';

/**
 * The hunt (brain/hunt.ts, brain/commander.ts): a section that goes out after a shooter the
 * camp has placed. Its numbers are still being found by playing, so these hold what's
 * settled about it, and none of the seconds:
 *
 * - a camp that hears where a shot came from places the shooter and sends a section, of men
 *   it believes are on their feet, and keeps men at home;
 * - nobody else walks off the camp's own ground to look for him;
 * - the section says what it's doing aloud, watches the place before anyone goes on to it,
 *   and either finds him or calls the place clear;
 * - nobody is sent while he's still firing, and nobody without the radio;
 * - a man whose partner is gone doesn't go on alone, and calls nothing clear;
 * - a camp without it does none of this, and the same hunt ends the same way twice.
 */

const SEED = 'LEB-2534';
const HZ = T.sim.tickHz;
const H = T.brain.hunt;

interface Hunted {
  sim: Simulation;
  seen: HuntSeen;
  /** Every man ordered out, and whether the camp had him down as on his feet when it sent him. */
  sent: Array<{ id: number; ok: boolean; tick: number }>;
  /** The tick of his last shot. */
  lastShot: number;
  /** Men who were ever on the hunt. */
  hunters: Set<number>;
  hash: string;
}

/** The scripted shooter on the camp's best overview, against the plain yard, for `seconds`; `each` is called every tick. */
function run(params: string, seconds: number, each?: (sim: Simulation, h: Hunted) => void): Hunted {
  const world = worldOf(SEED);
  const sc = { ...(hunt(`seed=${SEED}${params}`) as Scene<Simulation>), world: () => world };
  const sim = startScene(sc, sceneTuning(sc, T), world);
  const driver = sc.driver!();
  const raw = sc.game.still(sim);
  const out: Hunted = { sim, seen: emptyHuntSeen(), sent: [], lastShot: -1, hunters: new Set(), hash: '' };
  for (let k = 0; k < seconds * HZ; k++) {
    const events = sim.step(driver.next(sim, raw));
    watchHunt(sim, events, out.seen);
    const camp = commanderOf(sim)!.camp;
    for (const e of events) {
      if (e.type === 'shot' && e.source === sim.playerId) out.lastShot = sim.tick;
      if (e.type === 'order' && e.task === 'hunt') out.sent.push({ id: e.to, ok: camp.roster.find((g) => g.id === e.to)?.status === 'ok', tick: sim.tick });
    }
    for (const g of sim.guards) if (g.brain?.act === 'hunt') out.hunters.add(g.id);
    each?.(sim, out);
  }
  out.hash = sim.hash();
  return out;
}

describe('a camp that hunts', () => {
  let h: Hunted;
  beforeAll(() => {
    h = run('', 330);
  });

  it('places a shooter it heard, and sends a section after him', () => {
    expect(h.seen.shot).toBeGreaterThan(0);
    expect(h.seen.placed).toBeGreaterThan(h.seen.shot);
    // Against the range card, one good bearing puts him on the right ridge.
    expect(h.seen.off).toBeLessThan(80);
    expect(h.seen.ordered).toBeGreaterThan(h.seen.placed);
    expect(h.seen.men.size).toBeGreaterThanOrEqual(H.size);
  });

  it('sends only men it believes are on their feet, and keeps men at home', () => {
    expect(h.sent.length).toBeGreaterThanOrEqual(H.size);
    for (const s of h.sent) expect(s.ok, `guard ${s.id}, ordered out at tick ${s.tick}`).toBe(true);
    expect(h.seen.home).toBeGreaterThanOrEqual(H.keep);
  });

  it('sends nobody else: no man walks off the camp\'s own ground alone to look for him', () => {
    expect([...h.seen.strays]).toEqual([]);
    for (const id of h.hunters) expect(h.seen.men.has(id), `guard ${id} was on the hunt without being of a section`).toBe(true);
  });

  it('goes out saying what it is doing, watches the place before anyone goes on to it, and finds him or calls it', () => {
    expect(h.seen.calls).toBeGreaterThan(2);
    expect(h.seen.watching).toBeGreaterThan(h.seen.ordered);
    if (h.seen.closing >= 0) expect(h.seen.closing).toBeGreaterThan(h.seen.watching);
    expect(h.seen.found >= 0 || h.seen.cleared >= 0).toBe(true);
  });

  it('ends the same way twice', () => {
    expect(run('', 330).hash).toBe(h.hash);
  });
});

describe('what a hunt waits for', () => {
  it('nobody is sent while the shooter is still firing', () => {
    const h = run('&shots=6', 150);
    expect(h.lastShot).toBeGreaterThan(60 * HZ);
    // Six shots twelve seconds apart: no gap long enough to send anyone in. Whoever goes, goes after the last of them.
    for (const s of h.sent) expect(s.tick, `guard ${s.id} was ordered out ${((h.lastShot - s.tick) / HZ).toFixed(0)} s before his last shot`).toBeGreaterThan(h.lastShot);
  });

  it('without the radio nothing reaches the camp, and nobody is sent', () => {
    const h = run('&off=radio', 200);
    expect(h.seen.shot).toBeGreaterThan(0);
    expect(h.sent).toEqual([]);
    expect(h.hunters.size).toBe(0);
  });

  it('a camp without it does none of this', () => {
    const h = run('&off=hunt', 200);
    expect(h.seen.placed).toBe(-1);
    expect(h.sent).toEqual([]);
    expect(h.hunters.size).toBe(0);
    expect(commanderOf(h.sim)!.camp.sections).toEqual([]);
  });
});

describe('a section that loses a man', () => {
  it('doesn’t go on alone, and calls nothing clear', () => {
    let gone = -1;
    let left = -1;
    let goneAt = -1;
    /** The most seconds he was still out on the hunt with nobody left alive in his section but himself. */
    let alone = 0;
    let since = -1;
    // A camp that still has men to spare sends him out again with another, which is a new section and not his going on alone:
    // so this watches the stretch after his partner is gone, and stops before a second section could have reached the place.
    const AFTER = 100;
    const h = run('', 330, (sim, out) => {
      if (gone < 0) {
        // Once both are out past where they gathered, one of them is gone, without a sound.
        const out2 = sim.guards.filter((g) => out.seen.men.has(g.id) && g.brain?.hunt && g.brain.hunt.at >= 2);
        if (out2.length < 2) return;
        gone = out2[1]!.id;
        left = out2[0]!.id;
        goneAt = sim.tick;
        sim.despawn(gone);
        return;
      }
      if (sim.tick - goneAt > AFTER * HZ) return;
      const b = sim.guards.find((g) => g.id === left)?.brain;
      const order = b?.task?.hunt;
      const lone = b?.hunt !== undefined && b.hunt.phase !== 'home' && (!order || order.men.every((id) => id === left || !sim.guards.some((g) => g.id === id)));
      if (lone && since < 0) since = sim.tick;
      if (!lone) since = -1;
      if (since >= 0) alone = Math.max(alone, (sim.tick - since) / HZ);
      // Nothing is called clear, and nobody is found, by a man with no partner.
      if (lone) expect(out.seen.cleared, `called clear at ${(sim.tick / HZ).toFixed(0)} s, alone`).toBe(-1);
    });
    expect(gone, 'both men of the section got out past the wire').toBeGreaterThan(0);
    expect(h.sim.guards.some((g) => g.id === left), 'the other man is still alive').toBe(true);
    // He gave it up within the time it takes a man to be sure nobody is coming: three bounds' worth of waiting, and a little.
    expect(alone).toBeLessThan(H.bound.wait * H.bound.giveUp + 25);
  });
});
