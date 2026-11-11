import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { exposedAt, fightingSpot, lineFrom } from '../src/sim/brain';
import { ViewDriver } from '../src/sim/game/bots/playerView';
import { commanderOf } from '../src/sim/game/comms';
import { player } from '../src/sim/game/entities';
import { circleOf, ladder, ringAround } from '../src/sim/game/scenes/ladder';
import { bestOverview } from '../src/sim/game/scenes/liveCamp';
import type { Simulation } from '../src/sim/game/sim';
import { sceneTuning, startScene, type Scene } from '../src/sim/kernel/scene';
import { worldOf } from './live';

/**
 * The firefight (brain/firefight.ts, brain/positions.ts): how trained men fight someone
 * close whose place they know. Its numbers are still being found by playing, so these hold
 * what's settled about it, and none of the seconds:
 *
 * - a position hides a man when he's down, and has a line when it says it has;
 * - a man fires only at someone he can see, or back at a place he has good reason to be sure of;
 * - rounds landing close keep his head down;
 * - one man at a time goes after the intruder, and the camp doesn't leave its ground to do it;
 * - a camp without it does none of this, and the same fight ends the same way twice.
 */

const SEED = 'LEB-2534';
const HZ = T.sim.tickHz;
const F = T.brain.firefight;

interface Fight {
  sim: Simulation;
  /** Men who fought at all, and the most who were going after him at one moment. */
  fought: Set<number>;
  pushers: number;
  /** Rounds fired from a position, and those fired with no right to. */
  rounds: number;
  wild: string[];
  /** Men who were up while rounds were landing on them. */
  upUnderFire: string[];
  /** Men who went farther than this from where they stood when the fight began. */
  left: Set<number>;
  /** Men shot by their own side. */
  ownGoals: number;
  hash: string;
}

/** The circling shooter against the camp, to the end of his lap, his life or `seconds`. */
function circle(params: string, seconds: number): Fight {
  const world = worldOf(SEED);
  const sc = { ...(ladder(`seed=${SEED}&plan=circle&ready=alert${params}`) as Scene<Simulation>), world: () => world, playOn: true };
  const tuning = sceneTuning(sc, T);
  const sim = startScene(sc, T, world);
  const bot = circleOf(sim);
  const driver = new ViewDriver(bot);
  const raw = sc.game.still(sim);
  const out: Fight = { sim, fought: new Set(), pushers: 0, rounds: 0, wild: [], upUnderFire: [], left: new Set(), ownGoals: 0, hash: '' };
  const began = new Map<number, { x: number; z: number }>();
  const dead = (): boolean => (player(sim.index).health?.hits ?? 0) >= tuning.brain.combat.playerHits;
  while (sim.tick < seconds * HZ && !bot.lapped && !dead()) {
    const events = sim.step(driver.next(sim, raw));
    let pushing = 0;
    for (const g of sim.guards) {
      const b = g.brain!;
      if (b.act !== 'fight' && b.act !== 'push') continue;
      const ff = b.ff;
      out.fought.add(g.id);
      if (b.act === 'push') pushing++;
      if (!began.has(g.id)) began.set(g.id, { x: g.body.x, z: g.body.z });
      const from = began.get(g.id)!;
      if ((g.body.x - from.x) * (g.body.x - from.x) + (g.body.z - from.z) * (g.body.z - from.z) > 45 * 45) out.left.add(g.id);
      // His order is for the tick after this one: that's the tick he has to be down for.
      if (ff && ff.up && sim.tick + 1 < ff.pinned && b.act === 'fight') out.upUnderFire.push(`guard ${g.id} at tick ${sim.tick}`);
    }
    out.pushers = Math.max(out.pushers, pushing);
    for (const e of events) {
      if (e.type === 'death' && e.source !== sim.playerId && sim.index.get(e.source)?.kind === 'guard') out.ownGoals++;
      if (e.type !== 'shot' || e.source === sim.playerId) continue;
      const g = sim.guards.find((x) => x.id === e.source);
      if (!g || g.brain?.act !== 'fight') continue;
      out.rounds++;
      const ff = g.brain.ff;
      const sees = g.senses!.percepts.some((p) => p.kind === 'sight' && sim.tick - p.tick <= 2);
      const answers = ff !== undefined && ff.own && ff.r <= F.answer.sure && (sim.tick - ff.news) / HZ <= F.answer.fresh + 0.1;
      if (!sees && !answers) out.wild.push(`guard ${g.id} at tick ${sim.tick}`);
    }
  }
  out.hash = sim.hash();
  return out;
}

describe('a place to fight from', () => {
  it('hides a kneeling man from the intruder, and has a line to him when it says it has', () => {
    const world = worldOf(SEED);
    const from = ringAround(world, bestOverview(world))[0]!;
    const S = F.spot;
    let found = 0;
    let withLine = 0;
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      const spot = fightingSpot(world, T, { x: g.x, z: g.z, tx: from.x, tz: from.z, maxRun: S.maxRun * 2, needLine: false, gain: 0, dash: 0 });
      if (!spot) continue;
      found++;
      expect(exposedAt(world, T, spot.hx, spot.hz, spot.hs, from.x, from.z), `the hiding place of post ${g.role}`).toBe(false);
      const step = Math.sqrt((spot.fx - spot.hx) * (spot.fx - spot.hx) + (spot.fz - spot.hz) * (spot.fz - spot.hz));
      expect(step).toBeLessThanOrEqual(S.stepOut * Math.SQRT2 + 0.01);
      const range = Math.sqrt((spot.hx - from.x) * (spot.hx - from.x) + (spot.hz - from.z) * (spot.hz - from.z));
      expect(range).toBeGreaterThanOrEqual(S.standoff);
      if (spot.line) {
        withLine++;
        expect(lineFrom(world, T, spot.fx, spot.fz, spot.fs, from.x, from.z), `the firing place of post ${g.role}`).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(withLine).toBeGreaterThan(0);
  });

  it('is judged from where the intruder is, when he is up on something: a deck or an upper floor sees over what hides a man from the ground', () => {
    const world = worldOf(SEED);
    const S = F.spot;
    // Someone who has taken a raised post: a tower's deck or an upper window. A man's chest there, as a sighting or a flash would give it.
    const raised = world.camp.guards.filter((g) => g.elevated && g.role !== 'target');
    expect(raised.length).toBeGreaterThan(0);
    let found = 0;
    let fooled = 0;
    for (const r of raised) {
      const ty = r.y + 1.2;
      expect(ty - world.terrain.heightAt(r.x, r.z)).toBeGreaterThan(S.raised);
      for (const g of world.camp.guards) {
        if (g.elevated) continue;
        const ask = { x: g.x, z: g.z, tx: r.x, tz: r.z, maxRun: S.maxRun * 2, needLine: false, gain: 0, dash: 0 };
        const spot = fightingSpot(world, T, { ...ask, ty });
        if (spot) {
          found++;
          expect(exposedAt(world, T, spot.hx, spot.hz, spot.hs, r.x, r.z, undefined, ty), `the hiding place of post ${g.role}, from ${ty.toFixed(1)} m up`).toBe(false);
          if (spot.line) expect(lineFrom(world, T, spot.fx, spot.fz, spot.fs, r.x, r.z, undefined, ty), `the firing place of post ${g.role}`).toBe(true);
        }
        // The same question asked as if he stood on the ground under it: some of those places are in his view.
        const low = fightingSpot(world, T, ask);
        if (low && exposedAt(world, T, low.hx, low.hz, low.hs, r.x, r.z, undefined, ty)) fooled++;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(fooled).toBeGreaterThan(0);
  });

  it('is somewhere nearer the intruder, when a bound is asked for, or nowhere', () => {
    const world = worldOf(SEED);
    const from = ringAround(world, bestOverview(world))[0]!;
    const P = F.push;
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      const spot = fightingSpot(world, T, { x: g.x, z: g.z, tx: from.x, tz: from.z, maxRun: P.maxRun, needLine: true, gain: P.gain, dash: F.danger.dash });
      if (!spot) continue;
      const own = Math.sqrt((g.x - from.x) * (g.x - from.x) + (g.z - from.z) * (g.z - from.z));
      const range = Math.sqrt((spot.hx - from.x) * (spot.hx - from.x) + (spot.hz - from.z) * (spot.hz - from.z));
      expect(range).toBeLessThanOrEqual(own - P.gain + 0.01);
      expect(spot.line).toBe(true);
    }
  });
});

describe('a firefight', () => {
  let fight: Fight;
  beforeAll(() => {
    fight = circle('', 420);
  }, 300_000);

  it('is fought: men take positions and fire from them', () => {
    expect(commanderOf(fight.sim)!.camp.firefight).toBe(true);
    expect(fight.fought.size).toBeGreaterThan(1);
    expect(fight.rounds).toBeGreaterThan(0);
  });

  it('has nobody firing at nothing: only at a man in sight, or back at a place he has reason to be sure of', () => {
    expect(fight.wild).toEqual([]);
  });

  it('has nobody shot by his own side', () => {
    expect(fight.ownGoals).toBe(0);
  });

  it('keeps a man down while rounds are landing on him', () => {
    expect(fight.upUnderFire).toEqual([]);
  });

  it('sends one man at a time after him, and the camp keeps its ground', () => {
    expect(fight.pushers).toBeLessThanOrEqual(2);
    expect(fight.left.size).toBeLessThanOrEqual(3);
  });

  it('ends the same way twice', () => {
    expect(circle('', 420).hash).toBe(fight.hash);
  }, 300_000);

  it("isn't fought by a camp without it", () => {
    const before = circle('&off=firefight', 420);
    expect(commanderOf(before.sim)!.camp.firefight).toBeUndefined();
    expect(before.fought.size).toBe(0);
  }, 300_000);
});
