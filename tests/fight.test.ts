import { beforeAll, describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { attackRun } from '../src/lab/experiments/flaws';
import { yardOnly } from '../src/lab/experiments/variety';
import { compound } from '../src/sim/game/scenes/compound';
import { bestOverview } from '../src/sim/game/scenes/overlook';
import { ATTACKS, type AttackDriver } from '../src/sim/game/attacks';
import { CampGauges } from '../src/lab/gauges';
import { Rng } from '../src/sim/kernel/core/rng';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { sightLine } from '../src/sim/kernel/world/query';
import { compoundDrops, STIMULI, stimulus } from '../src/sim/game/drops';
import { giveBrains } from '../src/sim/game/brains';
import { guardFire } from '../src/sim/game/combat';
import { campCommander, commanderOf, commsVoice, giveCommander } from '../src/sim/game/comms';
import { giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { testGuard, testWorld, tuningCopy } from './fixtures';
import { campMission, generateWorld } from '../src/sim/generation';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { resimulate } from '../src/sim/kernel/record/resim';
import { runScene, sceneOver, sceneTicks, startScene, type Scene } from '../src/sim/kernel/scene';
import type { World } from '../src/sim/kernel/world/world';
import { groundSpot } from '../src/sim/brain/ground';
import { navigatorOf } from '../src/sim/brain/nav';

/** The first fight (Lab F), and the compound simulator it's tested in: no player needed. */

let world: World;
beforeAll(() => {
  world = generateWorld(campMission('LEB-2534'), T);
});

const eye = (w: World, p: { x: number; z: number }): { x: number; y: number; z: number } => ({ x: p.x, y: w.terrain.heightAt(p.x, p.z) + T.bodies.player.eyeHeight.prone, z: p.z });

/** A camp hit by one shot from its best overview, at the site's middle, with what happened over `seconds`. */
function oneShot(seconds: number, off = ''): { sim: Simulation; events: SimEvent[]; from: { x: number; y: number; z: number } } {
  const scene = { ...(compound(`seed=LEB-2534${off ? `&off=${off}` : ''}`) as Scene<Simulation>), world: () => world };
  const sim = startScene(scene, T, world);
  const from = eye(world, bestOverview(world));
  const s = world.camp.site;
  const at = { x: s.x, y: world.terrain.heightAt(s.x, s.z) + 1, z: s.z };
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 30; i++) {
    const commands = i === 30 ? [stimulus('shot', at, from)] : [];
    events.push(...sim.step({ ...neutralInput(), commands }).map((e) => ({ ...e })));
  }
  return { sim, events, from };
}

describe('a camp that fights back', () => {
  it('answers a shot: a whistle, men going to ground, and tower men firing back', () => {
    const { events } = oneShot(14);
    expect(events.filter((e) => e.type === 'whistle').length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'act' && e.to === 'cover')).toBe(true);
    expect(events.some((e) => e.type === 'act' && e.to === 'suppress')).toBe(true);
    expect(events.filter((e) => e.type === 'shot').length).toBeGreaterThan(1);
  }, 120_000);

  it('does none of it with the fight switched off', () => {
    const { events } = oneShot(14, 'fight');
    expect(events.some((e) => e.type === 'whistle')).toBe(false);
    expect(events.some((e) => e.type === 'act' && e.to === 'suppress')).toBe(false);
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(1);
  }, 120_000);

  it('comes back out once it has been quiet a while', () => {
    const { sim } = oneShot(T.brain.fight.drill.standTo.max + 25);
    expect(sim.guards.some((g) => g.brain?.act === 'cover')).toBe(false);
  }, 120_000);

  it('lets a watching man see a muzzle flash and believe where it came from', () => {
    // One sentry in the open, looking south, and a shot from straight in front of him.
    const guards = [testGuard({ id: 0, role: 'sentry', x: 0, y: 0, z: 0, faceX: 0, faceZ: 1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 })];
    const w = testWorld({ size: 240, spawn: { x: -100, z: -100 }, camp: { structures: [], guards, fenceHalf: 0 } });
    let systems: readonly System[] = SYSTEMS;
    for (const s of [commsVoice, campCommander, compoundDrops]) systems = withSystem(systems, s);
    const sim = new Simulation(w, T, systems);
    giveSenses(sim);
    giveBrains(sim);
    giveCommander(sim);
    commanderOf(sim)!.camp.fights = true;
    const events: SimEvent[] = [];
    const from = { x: 0, y: 1.2, z: 60 };
    events.push(...sim.step({ ...neutralInput(), commands: [stimulus('shot', { x: 20, y: 1, z: 0 }, from)] }).map((e) => ({ ...e })));
    events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
    expect(events.some((e) => e.type === 'spotted' && e.what === 'muzzle')).toBe(true);
    const belief = sim.guards[0]!.senses!.belief!;
    expect(Math.hypot(belief.x - from.x, belief.z - from.z)).toBeLessThan(3);
  }, 60_000);

  it('gets men down at the spots that hide them, and up again when the stand-to ends', () => {
    const { sim, events } = oneShot(T.brain.fight.drill.standTo.max + 25);
    const down = events.filter((e) => e.type === 'stance' && (e.to === 'crouch' || e.to === 'prone'));
    expect(down.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'stance' && e.to === 'stand')).toBe(true);
    for (const g of sim.guards) if (g.brain && !g.brain.down) expect(g.body.stance).toBe('stand');
  }, 120_000);

  it('never has a man running while he is down', () => {
    // An order that arrives during a stand-to clears his cover and sends him off. This attack, on this camp, once had men sprinting flat.
    const scene = compound('seed=BOR-1323&attack=suppressed-sniper') as Scene<Simulation>;
    const sim = startScene(scene, T);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const ticks = sceneTicks(scene, T);
    const S = T.bodies.guard.speed;
    const held = new Map<number, number>();
    let moved = 0;
    while (!sceneOver(scene, sim, ticks)) {
      sim.step(driver.next(sim, raw));
      for (const g of sim.guards) {
        const limit = g.body.stance === 'prone' ? S.crawl : g.body.stance === 'crouch' ? S.crouch : Infinity;
        const down = limit < Infinity ? (held.get(g.id) ?? 0) + 1 : 0;
        held.set(g.id, down);
        // A moment to slow down after getting there.
        if (down > 15 && Math.hypot(g.body.vx, g.body.vz) > limit + 0.05) moved++;
      }
    }
    expect(moved).toBe(0);
  }, 180_000);

  it('gives reinforcements a place of their own, not a shared post', () => {
    // A squad once ended up in a heap at a post that was a single point. These camps call one in.
    for (const seed of ['LEB-2534', 'REV-0010']) {
      // Plain yards, as these two camps were when the numbers were set: the reinforcements are what's measured.
      const { sim, watch } = attackRun(seed, 'sniper', yardOnly(T));
      expect(watch.counts()['pile-up']).toBe(0);
      const reserves = sim.guards.filter((g) => g.guard.reserve);
      expect(reserves.length).toBeGreaterThan(0);
      for (const g of reserves) expect(g.guard.reserve!.x === reserves[0]!.guard.reserve!.x && g !== reserves[0]).toBe(false);
    }
  }, 120_000);

  it('hides a man from every listed perch toward the threat, with the real rays', () => {
    const p = bestOverview(world);
    const nav = navigatorOf(world, T);
    let found = 0;
    for (const g of world.camp.guards) {
      if (g.elevated) continue;
      const spot = groundSpot(world, T, g.x, g.z, p.x, p.z);
      if (!spot) continue;
      found++;
      const e = eye(world, p);
      expect(nav.seesPoint(e.x, e.y, e.z, spot.x, world.terrain.heightAt(spot.x, spot.z) + T.bodies.guard.eyeHeight[spot.stance], spot.z)).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  }, 60_000);
});

describe('what a tick of a fight may cost', () => {
  /** The rays the brains cast in each tick of a sniper's first minute on the camp. */
  function raysByTick(tuning: Tuning): number[] {
    const scene = { ...(compound('seed=LEB-2534&attack=sniper') as Scene<Simulation>), world: () => world };
    const sim = startScene(scene, tuning, world);
    const driver = scene.driver!();
    const raw = scene.game.still(sim);
    const out: number[] = [];
    let before = 0;
    for (let i = 0; i < 60 * 30; i++) {
      sim.step(driver.next(sim, raw));
      const now = sim.work().find((w) => w.system === 'guard-brains')!.rays;
      out.push(now - before);
      before = now;
    }
    return out;
  }

  it('counts the rays a look for dead ground casts, and stops at its budget', () => {
    const p = bestOverview(world);
    const g = world.camp.guards.find((x) => !x.elevated)!;
    const work = { rays: 0, nodes: 0, bodies: 0 };
    groundSpot(world, T, g.x, g.z, p.x, p.z, false, work);
    expect(work.rays).toBeGreaterThan(0);
    // One candidate past the budget at most: every listed perch toward the threat, at two heights.
    expect(work.rays).toBeLessThanOrEqual(T.brain.fight.drill.rays + 2 * world.report.camp!.perches.length);
  });

  it('starts no look for dead ground once the tick’s looks have had their share of rays', () => {
    const D = T.brain.fight.drill;
    const usual = raysByTick(T);
    expect(Math.max(...usual)).toBeGreaterThan(0);
    // Whatever started before the share ran out finishes: a tick's worst is the share and one search.
    expect(Math.max(...usual)).toBeLessThan(D.raysPerTick + D.rays + 2 * world.report.camp!.perches.length);
    // With no share at all, every man who wants to look still gets to, one a tick.
    const tight = tuningCopy();
    tight.brain.fight.drill.raysPerTick = 1;
    const one = raysByTick(tight);
    const loose = tuningCopy();
    loose.brain.fight.drill.raysPerTick = 1_000_000;
    const all = raysByTick(loose);
    expect(one.filter((r) => r > 0).length).toBeGreaterThanOrEqual(all.filter((r) => r > 0).length);
    expect(Math.max(...one)).toBeLessThanOrEqual(Math.max(...all));
    expect(one.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }, 240_000);
});

describe('a near miss', () => {
  /** A guard 30 m from the player fires a round `off` metres past his head. */
  function fireAtPlayer(off: number): { sim: Simulation; events: SimEvent[] } {
    const base = compound('seed=LEB-2534') as Scene<Simulation>;
    const fire: System = {
      name: 'test-fire',
      phase: 'commands',
      after: ['compound-drops'],
      reads: [],
      writes: ['entities', 'rng.aim', 'bullet.bullet'],
      emits: ['shot', 'report'],
      run: (ctx) => {
        if (ctx.tick !== 2) return;
        const you = ctx.index.of('player')[0]!;
        const g = ctx.index.of('guard')[0]!;
        guardFire(ctx, g, { x: you.body.x, y: you.body.y + you.body.eyeHeight, z: you.body.z + off });
      },
    };
    const scene: Scene<Simulation> = {
      ...base,
      world: () => world,
      systems: [...(base.systems ?? []), fire],
      setup: (s) => {
        base.setup!(s);
        const you = s.index.of('player')[0]!;
        const g = s.index.of('guard')[0]!;
        g.body.x = you.body.x + 30;
        g.body.z = you.body.z;
        g.body.y = world.terrain.heightAt(g.body.x, g.body.z);
      },
    };
    const sim = startScene(scene, T, world);
    const you = sim.index.of('player')[0]!;
    you.rifle!.rest = 1;
    const events: SimEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(...sim.step(neutralInput()).map((e) => ({ ...e })));
    return { sim, events };
  }

  it('knocks the rifle off its rest and jolts the heart', () => {
    const { sim, events } = fireAtPlayer(1.5);
    const you = sim.index.of('player')[0]!;
    expect(events.some((e) => e.type === 'passed')).toBe(true);
    expect(you.rifle!.rest).toBeLessThan(0.5);
    expect(you.rifle!.shaken).toBeGreaterThan(0);
    expect(you.vitals!.heartRate).toBeGreaterThan(T.vitals.restingHr + 5);
  }, 60_000);

  it('does nothing when it goes wide', () => {
    expect(fireAtPlayer(20).events.some((e) => e.type === 'passed')).toBe(false);
  }, 60_000);

  it('does nothing when something stopped the round short of him', () => {
    const saved = [world.crowns, world.crownStop] as const;
    const you = { x: T.gen.world.size, z: T.gen.world.size };
    try {
      // A thick crown between the guard and the player: the round ends there.
      const probe = fireAtPlayer(1.5);
      you.x = probe.sim.index.of('player')[0]!.body.x;
      you.z = probe.sim.index.of('player')[0]!.body.z;
      world.crowns = [{ kind: 'cyl', x: you.x + 15, z: you.z, y0: -500, y1: 500, r: 4, density: T.gen.props.crownDensity }];
      world.crownStop = T.gen.props.crownStop;
      expect(fireAtPlayer(1.5).events.some((e) => e.type === 'passed')).toBe(false);
    } finally {
      world.crowns = saved[0];
      world.crownStop = saved[1];
    }
  }, 60_000);
});

describe('the compound simulator', () => {
  it('runs an attack with no player, and its recording re-simulates', () => {
    const scene = compound('seed=LEB-2534&attack=one-shot') as Scene<Simulation>;
    const run = runScene({ ...scene, world: () => world, seconds: 30 }, T);
    expect(commanderOf(run.sim)!.camp.level).not.toBe('calm');
    expect(resimulate(run.recording, { scene: { ...scene, world: () => world } }).ok).toBe(true);
  }, 120_000);

  it('reads the fight from where the shots really come from, not the parked player', () => {
    const scene = compound('seed=LEB-2534&attack=one-shot') as Scene<Simulation>;
    const sim = startScene(scene, T);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const gauges = new CampGauges(sim);
    expect(gauges.read(sim).shooter).toBeNull();
    for (let i = 0; i < 20 * 30; i++) gauges.observe(sim, sim.step(driver.next(sim, raw)));
    const from = driver.truth.find((t) => t.what === 'shot')!.from;
    const r = gauges.read(sim);
    expect(r.shotsFired).toBe(1);
    expect(r.shooter!.x).toBeCloseTo(from.x, 3);
    expect(r.shooter!.z).toBeCloseTo(from.z, 3);
    let nearest = Infinity;
    for (const g of sim.guards) nearest = Math.min(nearest, Math.sqrt((g.body.x - from.x) ** 2 + (g.body.z - from.z) ** 2));
    expect(r.nearest).toBeCloseTo(nearest, 3);
    // The camp is hundreds of metres from where the player is parked: measuring from him is the bug this replaced.
    expect(Math.sqrt((sim.player.x - from.x) ** 2 + (sim.player.z - from.z) ** 2)).toBeGreaterThan(nearest + 100);
  }, 60_000);

  it('only ever shoots at someone it can see, and holds fire when it can see nobody', () => {
    const scene = compound('seed=LEB-2534&attack=sniper') as Scene<Simulation>;
    const sim = startScene(scene, T);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const view = { world: sim.world, solids: sim.solids, bodies: [] };
    let seen = 0;
    for (let i = 0; i < 80 * 30; i++) {
      const input = driver.next(sim, raw);
      for (; seen < driver.truth.length; seen++) {
        const t = driver.truth[seen]!;
        const aimed = sim.guards.some((g) => sightLine(view, t.from.x, t.from.y, t.from.z, g.body.x, g.body.y + g.body.eyeHeight * 0.75, g.body.z, Blocks.Bullet));
        expect(aimed).toBe(true);
      }
      sim.step(input);
    }
    expect(seen).toBeGreaterThan(0);
    const nobody = Object.create(sim, { guards: { value: [] } }) as Simulation;
    expect(ATTACKS['one-shot']![0]!.make(nobody, new Rng('test', 'attack'))).toBeNull();
  }, 60_000);

  it('keeps every kind of stimulus recordable', () => {
    const scene = { ...(compound('seed=LEB-2534') as Scene<Simulation>), world: () => world, seconds: 3 };
    const s = world.camp.site;
    const at = { x: s.x, y: world.terrain.heightAt(s.x, s.z) + 1, z: s.z };
    const run = runScene({ ...scene, driver: () => ({ next: (sim: Simulation, out) => {
      Object.assign(out, neutralInput());
      out.commands = sim.tick < STIMULI.length ? [stimulus(STIMULI[sim.tick]!, at, { x: at.x + 100, y: at.y + 10, z: at.z })] : [];
      return out;
    } }) }, T);
    expect(run.failures).toEqual([]);
    expect(resimulate(run.recording, { scene }).ok).toBe(true);
  }, 120_000);

  it('finds nothing to complain about in a camp left alone', () => {
    expect(attackRun('LEB-2534', 'quiet', T).flaws).toEqual([]);
  }, 120_000);
});
