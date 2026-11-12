import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { protectionOf } from '../src/lab/gauges';
import type { AttackDriver } from '../src/sim/game/attacks';
import { commanderOf } from '../src/sim/game/comms';
import { answerOf } from '../src/sim/game/protection';
import { ViewDriver } from '../src/sim/game/bots/playerView';
import { compound } from '../src/sim/game/scenes/compound';
import { circleOf, ladder } from '../src/sim/game/scenes/ladder';
import type { Simulation } from '../src/sim/game/sim';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { player } from '../src/sim/game/entities';
import { tuningCopy } from './fixtures';
import { shooterScene, worldOf } from './live';

/**
 * A camp's answer for its target, by the problem it's built round (brain/protect.ts,
 * game/protection.ts): it holds him, it bolts with him, or it waits for its relief to bring
 * him out (tests/takedown.test.ts has those stages).
 *
 * The seconds are the owner's to set by playing, so these hold the method and none of the
 * times beyond the ones the drill itself counts:
 * - which answer a camp takes, and that a switch takes it away;
 * - a camp that bolts gives its warning first: the engine, heard, for as long as tuning says,
 *   before anyone goes in for him. It needs no radio. With its vehicle dead nothing starts
 *   and he stays. With the man on his door gone the next man starts it, later; with the man
 *   who started it gone he comes out by himself; with nobody left to start it, it's the
 *   relief that comes for him;
 * - a camp that holds keeps him to the end, whatever his nerve, and posts its relief on his
 *   doors, where they stay;
 * - a man on the target's door stays by it once the siren has sounded, in a fight as out of
 *   one;
 * - a run that loses him says at the end what there was to read before he went.
 */

const FLUSH = 'LEB-2534';
const INSIDE = 'HOT-7106';
const HZ = T.sim.tickHz;
const A = T.brain.protect.answer;

interface Timeline {
  sim: Simulation;
  /** Seconds, or NaN if it never happened. */
  siren: number;
  /** His vehicle's engine started, and the last time it was heard before he was aboard. */
  engine: number;
  /** How many times it sounded, and the least far any of those carried. */
  sounds: number;
  carried: number;
  relief: number;
  told: number;
  left: number;
  aboard: number;
  /** Someone found the vehicle dead and said so. */
  dead: number;
  next: () => void;
}

/** A sniper on the camp's best overview, watched for `seconds` or until `stopAt`; `each` runs before every tick. */
function attack(seed: string, params: string, seconds: number, opts: { tuning?: Tuning; stopAt?: (t: Timeline) => boolean; each?: (t: Timeline) => void; before?: (sim: Simulation) => void } = {}): Timeline {
  const world = worldOf(seed);
  const scene = { ...(compound(`seed=${seed}&attack=sniper${params}`) as Scene<Simulation>), world: () => world };
  const sim = startScene(scene, opts.tuning ?? T, world);
  opts.before?.(sim);
  const driver = scene.driver!() as AttackDriver;
  const raw = scene.game.still(sim);
  const camp = commanderOf(sim)!.camp;
  const target = camp.objective!.target;
  const vehicle = sim.index.of('vehicle').find((v) => v.vehicle.escape)!;
  const t: Timeline = { sim, siren: NaN, engine: NaN, sounds: 0, carried: Infinity, relief: NaN, told: NaN, left: NaN, aboard: NaN, dead: NaN, next: () => undefined };
  t.next = () => {
    const now = sim.tick / HZ;
    for (const e of sim.step(driver.next(sim, raw))) {
      if (e.type === 'siren' && Number.isNaN(t.siren)) t.siren = now;
      if (e.type === 'reinforce' && Number.isNaN(t.relief)) t.relief = now;
      if (e.type === 'act' && e.source === target && e.to === 'flee' && Number.isNaN(t.left)) t.left = now;
      if (e.type === 'engine' && e.source === vehicle.id && Number.isNaN(t.aboard)) {
        if (e.load === 'start') t.engine = now;
        t.sounds++;
        t.carried = Math.min(t.carried, e.radius);
      }
    }
    const him = sim.index.get(target);
    if (him?.kind === 'guard' && Number.isNaN(t.told) && him.brain?.told.some((r) => r.kind === 'escort')) t.told = now;
    if (Number.isNaN(t.aboard) && (camp.objective?.status === 'escaping' || camp.objective?.status === 'escaped')) t.aboard = now;
    if (Number.isNaN(t.dead) && sim.guards.some((g) => g.brain?.stranded)) t.dead = now;
  };
  const stopAt = opts.stopAt ?? ((x) => !Number.isNaN(x.aboard));
  for (let i = 0; i < seconds * HZ && !stopAt(t); i++) {
    opts.each?.(t);
    t.next();
  }
  return t;
}

/** The man on the target's door, in a camp that has one. */
function doorMan(sim: Simulation): number {
  return sim.guards.find((g) => sim.world.camp.guards[g.guard.spawn]!.holdsDoor)?.id ?? -1;
}

describe('a camp’s answer for its target', () => {
  it('follows from the problem it’s built round', () => {
    expect(answerOf('inside', true)).toBe('hold');
    expect(answerOf('inside', false)).toBe('hold');
    expect(answerOf('flush', true)).toBe('bolt');
    // Nothing to bolt in: it waits for its relief, like an escort's camp and a camp built by hand.
    expect(answerOf('flush', false)).toBeNull();
    expect(answerOf('escort', true)).toBeNull();
    expect(answerOf('walk', true)).toBeNull();
    expect(answerOf(undefined, true)).toBeNull();
  });

  it('is given to a camp that protects him, and to no other; and a switch takes it away', () => {
    const camp = (seed: string, params: string) => {
      const world = worldOf(seed);
      return commanderOf(startScene({ ...(compound(`seed=${seed}&attack=sniper${params}`) as Scene<Simulation>), world: () => world }, T, world))!.camp;
    };
    expect(worldOf(FLUSH).camp.crux).toBe('flush');
    expect(worldOf(INSIDE).camp.crux).toBe('inside');
    expect(camp(FLUSH, '').answer).toBe('bolt');
    expect(camp(INSIDE, '').answer).toBe('hold');
    // A camp that protects nobody has no answer to give.
    expect(camp(FLUSH, '&off=protect').answer).toBeUndefined();
    expect(camp(FLUSH, '&off=protect').protects).toBeUndefined();
    expect(camp(FLUSH, '&off=answer').answer).toBeUndefined();
    expect(camp(INSIDE, '&off=answer').answer).toBeUndefined();
    // No vehicle, nothing to bolt in.
    expect(camp(FLUSH, '&off=truck').answer).toBeUndefined();
  }, 240_000);
});

describe('a camp that bolts', () => {
  let t: Timeline;
  beforeAll(() => {
    t = attack(FLUSH, '', 300);
  }, 240_000);

  it('starts his vehicle at the siren, and that engine is heard until he’s away in it', () => {
    expect(t.siren).toBeGreaterThan(0);
    expect(t.engine).toBeGreaterThanOrEqual(t.siren);
    // The man on his door has only to run to it.
    expect(t.engine - t.siren).toBeLessThan(20);
    // A sound every `engine.every` seconds from the start until he's aboard, none carrying less far than an engine standing.
    expect(t.sounds).toBeGreaterThanOrEqual(Math.floor((t.aboard - t.engine) / T.brain.engine.every));
    expect(t.carried).toBeGreaterThanOrEqual(T.brain.engine.idle);
  });

  it('brings him out only once it has run its time, with no help from outside', () => {
    // Told by the man who started it, once it had run its time; or, if the sniper got that man first, out by himself once it had run longer still.
    if (Number.isNaN(t.told)) expect(t.left - t.engine).toBeGreaterThanOrEqual(A.prep + A.own);
    else {
      expect(t.told - t.engine).toBeGreaterThanOrEqual(A.prep);
      expect(t.left).toBeGreaterThanOrEqual(t.told);
    }
    expect(t.aboard).toBeGreaterThan(t.left);
    // It was the camp's own doing: the relief, if it has come at all, came after he was on his way.
    expect(Number.isNaN(t.relief) || t.relief > Math.min(t.left, Number.isNaN(t.told) ? Infinity : t.told)).toBe(true);
  });

  it('is over once he’s away: the camp knows its vehicle has gone, and nobody goes on trying to start it', () => {
    const camp = commanderOf(t.sim)!.camp;
    expect(camp.devices.escape).toBeNull();
    // A minute on, with the engine's sound gone from where it stood: every man is back to the fight, or his day.
    for (let i = 0; i < 60 * HZ; i++) {
      t.next();
      const starting = t.sim.guards.filter((g) => g.brain?.task?.kind === 'start').map((g) => g.id);
      expect(starting, `at ${(t.sim.tick / HZ).toFixed(0)} s`).toEqual([]);
    }
  });

  it('needs no radio', () => {
    const quiet = attack(FLUSH, '&off=radio', 300);
    expect(Number.isNaN(quiet.relief)).toBe(true);
    expect(quiet.engine - quiet.siren).toBeLessThan(20);
    expect(quiet.told - quiet.engine).toBeGreaterThanOrEqual(A.prep);
    expect(quiet.aboard).toBeGreaterThan(quiet.told);
  }, 240_000);

  it('starts nothing with its vehicle dead: the man who went to it says so, nobody goes in for him, and he stays', () => {
    const tuning = tuningCopy();
    // No relief either, so nothing else sends for him; and his nerve holds for the length of this.
    tuning.brain.protect.giveUp = 600;
    const dead = attack(FLUSH, '&off=reinforce', 200, { tuning, before: (sim) => void (sim.index.of('vehicle').find((v) => v.vehicle.escape)!.vehicle.disabled = true) });
    expect(dead.siren).toBeGreaterThan(0);
    expect(Number.isNaN(dead.engine)).toBe(true);
    expect(dead.sounds).toBe(0);
    expect(dead.dead).toBeGreaterThan(dead.siren);
    expect(Number.isNaN(dead.told)).toBe(true);
    expect(Number.isNaN(dead.left)).toBe(true);
    expect(commanderOf(dead.sim)!.camp.objective!.status).toBe('open');
    // The lab panel says so, unless the sniper has found him.
    if (dead.sim.index.get(commanderOf(dead.sim)!.camp.objective!.target)) expect(protectionOf(dead.sim)).toMatch(/ · bolts · his vehicle is dead, and the camp knows · waiting for the word$/);
    // Word gets round: nobody else runs to it, and nobody would be sent to bring him out to it.
    expect(commanderOf(dead.sim)!.camp.devices.escape).toBeNull();
  }, 240_000);

  it('brings him out late and by himself if the man on his door is gone once it’s running', () => {
    let gone = false;
    const alone = attack(FLUSH, '&off=reinforce', 300, {
      each: (x) => {
        if (gone || Number.isNaN(x.engine)) return;
        gone = true;
        x.sim.despawn(doorMan(x.sim));
      },
    });
    expect(gone).toBe(true);
    // Nobody told him: he heard it running for longer than the drill allows, and came.
    expect(Number.isNaN(alone.told)).toBe(true);
    expect(alone.left - alone.engine).toBeGreaterThanOrEqual(A.prep + A.own);
    expect(alone.aboard).toBeGreaterThan(alone.left);
  }, 240_000);

  it('starts it later, by the nearest man left, if the man on his door is gone before he can', () => {
    let gone = false;
    const late = attack(FLUSH, '&off=reinforce', 420, {
      each: (x) => {
        if (gone) return;
        gone = true;
        x.sim.despawn(doorMan(x.sim));
      },
    });
    expect(late.siren).toBeGreaterThan(0);
    // Nobody goes at once: each man left counts for himself first, the longer the farther he is from it.
    expect(late.engine - late.siren).toBeGreaterThanOrEqual(A.takeOver);
    // Then the drill runs as it would have: the man who started it goes in for him once it has run its time.
    expect(late.told - late.engine).toBeGreaterThanOrEqual(A.prep);
    expect(late.aboard).toBeGreaterThan(late.told);
  }, 240_000);

  it('is a camp that waits for its relief if nobody is left to start it', () => {
    const tuning = tuningCopy();
    // Nobody but the man on his door ever takes it on, and he's gone.
    tuning.brain.protect.answer.takeOver = 1e6;
    let gone = false;
    const late = attack(FLUSH, '', 420, {
      tuning,
      each: (x) => {
        if (gone) return;
        gone = true;
        x.sim.despawn(doorMan(x.sim));
      },
    });
    expect(late.siren).toBeGreaterThan(0);
    // No engine until someone is aboard it: the relief comes for him, as in any camp that waits for one.
    expect(late.relief).toBeGreaterThan(late.siren);
    expect(late.told).toBeGreaterThanOrEqual(late.relief);
    expect(late.sounds).toBe(0);
    expect(late.aboard).toBeGreaterThan(late.told);
  }, 240_000);
});

describe('a camp that holds', () => {
  let t: Timeline;
  beforeAll(() => {
    const tuning = tuningCopy();
    // His nerve would have gone long before the end of this, in a camp that waits.
    tuning.brain.protect.giveUp = 60;
    t = attack(INSIDE, '', 300, { tuning, stopAt: () => false });
  }, 240_000);

  it('keeps him in his room to the end: nobody comes for him, and he doesn’t lose his nerve', () => {
    expect(t.siren).toBeGreaterThan(0);
    expect(t.relief).toBeGreaterThan(t.siren);
    expect(Number.isNaN(t.told)).toBe(true);
    expect(Number.isNaN(t.left)).toBe(true);
    expect(Number.isNaN(t.aboard)).toBe(true);
    const camp = commanderOf(t.sim)!.camp;
    expect(camp.objective!.status).toBe('open');
    const him = t.sim.index.get(camp.objective!.target);
    // Unless the sniper found him first, he's there.
    if (him?.kind === 'guard') {
      expect(Math.hypot(him.body.x - camp.protects!.x, him.body.z - camp.protects!.z)).toBeLessThanOrEqual(T.brain.protect.near);
      expect(protectionOf(t.sim)).toMatch(/^in his room · holds him there · \d of its relief on his doors$/);
    }
  });

  it('posts its relief on his doors, and they stay there', () => {
    const camp = commanderOf(t.sim)!.camp;
    const keepers = camp.roster.filter((g) => g.keeps);
    expect(keepers.length).toBeGreaterThan(0);
    expect(keepers.length).toBeLessThanOrEqual(A.keepers);
    const hq = t.sim.world.camp.layout!.buildings.find((b) => b.module === 'hq')!;
    for (const k of keepers) {
      const g = t.sim.index.get(k.id);
      // One the sniper has shot since isn't standing anywhere.
      if (g?.kind !== 'guard') continue;
      const door = hq.doors.map((d) => t.sim.world.camp.doors![d]!).find((d) => Math.hypot(d.x - d.nx * A.doorPost - k.reserve!.x, d.z - d.nz * A.doorPost - k.reserve!.z) < 0.01);
      expect(door, `guard ${k.id}'s post is in front of a door of the target's building`).toBeDefined();
      expect(Math.hypot(g.body.x - k.reserve!.x, g.body.z - k.reserve!.z), `guard ${k.id} is at it, three minutes after he got down`).toBeLessThan(4);
      // And none of them was ever sent anywhere else.
      expect(camp.tasks.some((task) => task.assigned.includes(k.id))).toBe(false);
    }
  });
});

describe('a man on the target’s door', () => {
  it('stays by it once the siren has sounded: he fights from beside it, and goes after nobody', () => {
    // An escort's camp, which has such a man, and a shooter who circles it firing at whoever he sees.
    const ESCORT = 'NUT-4776';
    const world = worldOf(ESCORT);
    const sc = { ...(ladder(`seed=${ESCORT}&plan=circle`) as Scene<Simulation>), world: () => world, playOn: true };
    const sim = startScene(sc, T, world);
    const bot = circleOf(sim);
    const driver = new ViewDriver(bot);
    const raw = sc.game.still(sim);
    const men = sim.guards.filter((g) => world.camp.guards[g.guard.spawn]!.holdsDoor).map((g) => g.id);
    expect(men.length).toBeGreaterThan(0);
    let siren = -1;
    let fought = 0;
    let farthest = 0;
    const wandered: string[] = [];
    while (sim.tick < 420 * HZ && !bot.lapped && (player(sim.index).health?.hits ?? 0) < sim.tuning.brain.combat.playerHits) {
      for (const e of sim.step(driver.next(sim, raw))) if (e.type === 'siren' && siren < 0) siren = sim.tick;
      if (siren < 0) continue;
      for (const g of sim.guards) {
        if (!men.includes(g.id) || !g.brain) continue;
        const act = g.brain.act;
        if (act === 'fight') fought++;
        if (act === 'push' || act === 'investigate' || act === 'search' || act === 'flank') wandered.push(`guard ${g.id} at ${(sim.tick / HZ).toFixed(0)} s: ${act}`);
        // Sent in for the target, he goes: that's the one errand that takes him off it.
        if (act === 'task') continue;
        const post = world.camp.guards[g.guard.spawn]!;
        farthest = Math.max(farthest, Math.hypot(g.body.x - post.x, g.body.z - post.z));
      }
    }
    expect(siren).toBeGreaterThan(0);
    // The shooter came close enough for him to be in the fight, so this isn't a man nobody troubled.
    expect(fought).toBeGreaterThan(0);
    expect(wandered).toEqual([]);
    expect(farthest).toBeLessThanOrEqual(T.brain.firefight.spot.doorRun + 2);
  }, 240_000);
});

describe('a run that loses him', () => {
  /** A marksman on the best overview who can't be hurt, against a live camp, until the rules end it. */
  function lost(params: string): string {
    const scene = shooterScene(FLUSH, 300, 8, 6, params);
    const sim = startScene(scene, T, scene.world(T)) as Simulation;
    delete player(sim.index).health;
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    for (let i = 0; i < 300 * HZ && sim.state.outcome.status === 'playing'; i++) sim.step(driver.next(sim, raw));
    expect(sim.state.outcome.status).toBe('failed');
    return sim.state.outcome.reason;
  }

  it('says what there was to read: the engine, in a camp that bolts', () => {
    const reason = lost('');
    const said = /^the target got away: his vehicle's engine had been running for (\d+) s when he got to it$/.exec(reason);
    expect(said, reason).not.toBeNull();
    expect(Number(said![1])).toBeGreaterThanOrEqual(A.prep);
  }, 240_000);

  it('says it was the relief, in a camp that waits for one', () => {
    expect(lost('&off=answer')).toMatch(/^the target got away: the relief had been at the gate for \d+ s, and went in for him$/);
  }, 240_000);

  it('says nothing held him, in a camp that protects nobody', () => {
    expect(lost('&off=protect')).toBe('the target got away: he ran for his vehicle at the siren');
  }, 240_000);
});

