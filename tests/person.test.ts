import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { tournament, type Experiment, type RunResult } from '../src/lab/experiment';
import { plainTuning } from '../src/lab/experiments/variety';
import { Careless, HASTY, PERSON, ShootOnceAndLeave, WalkTo } from '../src/sim/game/bots/person';
import { LiveView, ViewDriver, type Angles, type PlayerView, type Point3, type SeenMan, type You } from '../src/sim/game/bots/playerView';
import { commanderOf, giveCommander } from '../src/sim/game/comms';
import { circleOf, ladder } from '../src/sim/game/scenes/ladder';
import { arm } from '../src/sim/game/shooting';
import { Simulation } from '../src/sim/game/sim';
import { Rng } from '../src/sim/kernel/core/rng';
import { neutralInput, Optic } from '../src/sim/kernel/input';
import { sceneOver, sceneTicks, startScene } from '../src/sim/kernel/scene';
import { Blocks } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { Scene } from '../src/sim/kernel/scene';
import { testGuard, testWorld, tuningCopy } from './fixtures';

/** The player's view, and the shooter limited to what a person can do (Lab F). */

const G = (id: number, x: number, z: number) => testGuard({ id, role: 'sentry', x, y: 0, z, faceX: 0, faceZ: 1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 });

/** Someone standing at the origin, looking north, and guards: one 40 m ahead in the clear, one behind a wall, one behind him, one too far off to the side. */
function scene(): { sim: Simulation; view: LiveView } {
  const wall = { kind: 'box' as const, x: 8, z: -30, y0: -1, y1: 6, hx: 6, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
  const world = testWorld({ size: 300, cell: 1, spawn: { x: 0, z: 0, faceX: 0, faceZ: -1 }, colliders: [wall], camp: { structures: [], guards: [G(0, 0, -40), G(1, 12, -70), G(2, 0, 60), G(3, 100, -8)], fenceHalf: 0 } });
  const sim = new Simulation(world, T);
  const view = new LiveView();
  view.update(sim);
  return { sim, view };
}

describe('the player view', () => {
  it('shows a man in a clear line, inside the view, at the distance he is', () => {
    const { sim, view } = scene();
    const ahead = sim.guards[0]!;
    const seen = view.seen.map((m) => m.id);
    expect(seen).toEqual([ahead.id]);
    expect(view.seen[0]!.distance).toBeCloseTo(40, 0);
    expect(view.you.stance).toBe('stand');
  });

  it('leaves out a man behind a wall, one behind him, and one off to the side', () => {
    const { sim, view } = scene();
    for (const g of [sim.guards[1]!, sim.guards[2]!, sim.guards[3]!]) expect(view.seen.some((m) => m.id === g.id)).toBe(false);
  });

  it('follows a man already in view, and drops one who falls, between looks', () => {
    const { sim, view } = scene();
    sim.step(neutralInput(sim.player.yaw));
    view.update(sim);
    expect(view.seen).toHaveLength(1);
    sim.despawn(sim.guards[0]!.id);
    sim.step(neutralInput(sim.player.yaw));
    view.update(sim);
    expect(view.seen).toHaveLength(0);
  });

  it('knows the man he came for only through glass on him, or up close', () => {
    const { sim, view } = scene();
    const c = giveCommander(sim);
    const ahead = sim.guards[0]!;
    c.camp.objective = { target: ahead.id, status: 'open' };
    arm(sim.index.of('player')[0]!, T);
    view.update(sim);
    expect(view.seen[0]!.isTarget).toBe(false);
    // Glass up and on him: he can tell. (A scope has to reach the eye first.)
    const input = neutralInput(sim.player.yaw);
    input.optic = Optic.Binoculars;
    input.pitch = 0.04;
    sim.step(input);
    view.update(sim);
    expect(view.seen[0]!.isTarget).toBe(true);
    // Glass up and on someone else: he can't.
    input.yaw += 0.5;
    sim.step(input);
    sim.step(input);
    view.update(sim);
    expect(view.seen.find((m) => m.id === ahead.id)?.isTarget ?? false).toBe(false);
    expect(commanderOf(sim)!.camp.objective!.status).toBe('open');
  });

  it("can give no bot the simulation: what it's handed is the view's interface, and the bots import nothing else", () => {
    const { view } = scene();
    const asView: PlayerView = view;
    expect(Object.keys(asView)).not.toContain('world');
  });
});

/** A view with no simulation behind it: whatever a bot does with this, it did from the view alone. */
function fakeView(man: SeenMan | null): { view: PlayerView & { you: You }; tick: () => void; optic: (o: number) => void } {
  const you = { x: 0, y: 0, z: 0, eye: { x: 0, y: 0.3, z: 0 }, yaw: 0, pitch: 0, stance: 'prone' as const, settled: true, speed: 0, optic: 0, raised: false, rounds: 10, ready: true, hits: 0, targetDown: false, wayOut: null };
  let time = 0;
  const view = {
    get time() {
      return time;
    },
    dt: 1 / 30,
    you,
    get seen() {
      return man ? [man] : [];
    },
    aimAt(at: Point3, _vx: number, _vz: number, out: Angles): boolean {
      out.yaw = Math.atan2(-at.x, -at.z);
      out.pitch = 0;
      return true;
    },
    lookAt(at: Point3, out: Angles): void {
      out.yaw = Math.atan2(-at.x, -at.z);
      out.pitch = 0;
    },
    routeTo: () => null,
  };
  return {
    view: view as unknown as PlayerView & { you: You },
    tick: () => {
      time += 1 / 30;
      you.raised = you.optic === Optic.Scope;
    },
    optic: (o) => {
      you.optic = o;
    },
  };
}

const MAN: SeenMan = { id: 7, head: { x: 0, y: 2, z: -300 }, chest: { x: 0, y: 1.5, z: -300 }, distance: 300, vx: 0, vz: 0, isTarget: true };

function shotsOf(seed: string, man: SeenMan | null, seconds: number): Array<{ t: number; yaw: number; kind: string }> {
  const bot = new ShootOnceAndLeave(new Rng(seed, 'test'), { x: 0, z: -300 }, [{ x: 0, z: 0 }], 9999, PERSON);
  const { view, tick, optic } = fakeView(man);
  const shots: Array<{ t: number; yaw: number; kind: string }> = [];
  const out = neutralInput();
  for (let k = 0; k < seconds * 30; k++) {
    bot.next(view, out);
    optic(out.optic ?? 0);
    for (const c of out.commands ?? []) if (c.kind === 'fire' || c.kind === 'range') shots.push({ t: view.time, yaw: c.yaw, kind: c.kind });
    tick();
  }
  return shots;
}

describe('a shooter limited to a person', () => {
  it('takes seconds to find a man, to range him and to hold', () => {
    const shots = shotsOf('A', MAN, 40);
    const fire = shots.find((s) => s.kind === 'fire')!;
    const range = shots.find((s) => s.kind === 'range')!;
    expect(range.t).toBeLessThan(fire.t);
    // Find, look, range, hold: at the very least their shortest times add up.
    expect(fire.t).toBeGreaterThanOrEqual(PERSON.find[0] + PERSON.look[0] + PERSON.range[0] + PERSON.hold[0]);
  });

  it('can only engage who he can see', () => {
    expect(shotsOf('A', null, 120)).toEqual([]);
  });

  it('misses: his presses scatter, from his own stream', () => {
    const yaws = Array.from({ length: 60 }, (_, k) => shotsOf(`S${k}`, MAN, 20).find((s) => s.kind === 'fire')!.yaw);
    const mean = yaws.reduce((a, b) => a + b, 0) / yaws.length;
    const sd = Math.sqrt(yaws.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (yaws.length - 1));
    // In mil: about his press's error, and far from zero.
    expect(sd * 1000).toBeGreaterThan(PERSON.pressMil * 0.5);
    expect(sd * 1000).toBeLessThan(PERSON.pressMil * 2);
  }, 20_000);

  it('is deterministic: the same stream, the same hands', () => {
    expect(shotsOf('B', MAN, 30)).toEqual(shotsOf('B', MAN, 30));
    expect(shotsOf('B', MAN, 30)).not.toEqual(shotsOf('C', MAN, 30));
  });

  it('a hasty shooter is quicker and worse', () => {
    expect(HASTY.hold[1]).toBeLessThan(PERSON.hold[0] + 1);
    expect(HASTY.pressMil).toBeGreaterThan(PERSON.pressMil);
    const careless = new Careless(new Rng('A', 'test'), { x: 0, z: 0 });
    const { view } = fakeView(null);
    expect(careless.next(view, neutralInput()).commands).toEqual([]);
  });

  it('walks where it says it will, around whatever is in the way, and says so', () => {
    const wall = { kind: 'box' as const, x: 0, z: -20, y0: -1, y1: 6, hx: 12, hz: 0.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
    const world = testWorld({ size: 200, cell: 1, spawn: { x: 0, z: 0, faceX: 0, faceZ: -1 }, colliders: [wall], camp: { structures: [], guards: [G(0, 90, 90)], fenceHalf: 0 } });
    const sim = new Simulation(world, T);
    const walk = new WalkTo(0, -40, 'crouch');
    const driver = new ViewDriver(walk);
    const raw = neutralInput(sim.player.yaw);
    for (let k = 0; k < 40 * 30 && !walk.arrived; k++) sim.step(driver.next(sim, raw));
    expect(walk.arrived).toBe(true);
    expect(Math.hypot(sim.player.x, sim.player.z + 40)).toBeLessThan(3.5);
    expect(sim.player.stance).toBe('crouch');
  }, 30_000);
});

describe('the ladder', () => {
  it('shoot once and leave really does walk out: with nothing able to stop him, he reaches the way out', () => {
    // Nobody can shoot back, and the target has nowhere to run, so this is about the walk.
    const quiet = tuningCopy();
    for (const role of Object.keys(quiet.brain.combat.range) as Array<keyof typeof quiet.brain.combat.range>) quiet.brain.combat.range[role] = 0;
    // On a camp the old promise built: this plan shoots the target from a perch, and most camps don't offer one now.
    const sc = ladder('seed=HOF-3956&plan=leave&off=truck,alarm,fight') as Scene<Simulation>;
    const sim = startScene(sc, plainTuning(quiet));
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, quiet);
    const start = { x: sim.player.x, z: sim.player.z };
    let farthest = 0;
    while (!sceneOver(sc, sim, ticks)) {
      sim.step(driver.next(sim, raw));
      farthest = Math.max(farthest, Math.hypot(sim.player.x - start.x, sim.player.z - start.z));
    }
    const out = commanderOf(sim)!.camp.objective!.getOut!;
    expect(sim.state.outcome.status).toBe('succeeded');
    expect(sim.state.outcome.reason).toMatch(/got out/);
    expect(Math.hypot(sim.player.x - out.x, sim.player.z - out.z)).toBeLessThanOrEqual(quiet.brain.getOut.radius);
    expect(farthest).toBeGreaterThan(300);
  }, 60_000);

  it('shoot and circle goes down to the base, and goes all the way round it', () => {
    // Nobody can shoot back, and the target stays: this is about the walk.
    const quiet = tuningCopy();
    for (const role of Object.keys(quiet.brain.combat.range) as Array<keyof typeof quiet.brain.combat.range>) quiet.brain.combat.range[role] = 0;
    const sc = { ...(ladder('seed=HOF-3956&plan=circle&off=truck,alarm,fight') as Scene<Simulation>), playOn: true };
    const sim = startScene(sc, quiet);
    const bot = circleOf(sim);
    const driver = new ViewDriver(bot);
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, quiet);
    const site = sim.world.camp.site;
    const L = sim.world.camp.layout!;
    const start = { x: sim.player.x, z: sim.player.z };
    // Round the plot: every quarter of the way round from where he came down.
    const quarters = new Set<number>();
    let leftPerchAt = -1;
    while (!sceneOver(sc, sim, ticks) && !bot.lapped) {
      sim.step(driver.next(sim, raw));
      if (leftPerchAt < 0 && bot.walking) leftPerchAt = sim.tick;
      if (Math.max(Math.abs((sim.player.x - site.x) * L.ux + (sim.player.z - site.z) * L.uz) - L.halfA, Math.abs((sim.player.x - site.x) * L.vx + (sim.player.z - site.z) * L.vz) - L.halfB) < 50) {
        quarters.add(Math.floor(((Math.atan2(sim.player.z - site.z, sim.player.x - site.x) + Math.PI) / (2 * Math.PI)) * 4));
      }
    }
    expect(leftPerchAt).toBeGreaterThan(0);
    expect(Math.hypot(sim.player.x - start.x, sim.player.z - start.z)).toBeGreaterThan(40);
    expect(bot.lapped).toBe(true);
    expect(quarters.size).toBe(4);
  }, 120_000);

  it('counts who was best on each camp, and by how far', () => {
    const exp: Experiment = { name: 't', about: '', series: 's', camps: 2, arms: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], score: 'won', measures: [{ key: 'won', label: 'won', kind: 'rate' }], run: () => ({}) };
    const r = (x: number[]): RunResult[] => x.map((won) => ({ won }));
    const results = new Map([
      ['a', r([1, 1, 0, 0])],
      ['b', r([0, 1, 1, 1])],
      ['c', r([0, 0, 0, 0])],
    ]);
    const t = tournament(exp, results, 2)!;
    expect(t.best.map((b) => b.camps)).toEqual([1, 1, 0]);
    expect(t.tied).toBe(0);
    expect(t.margin).toBeCloseTo(0.75, 10);
    expect(tournament({ ...exp, score: undefined }, results, 2)).toBeNull();
  });
});
