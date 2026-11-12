import { describe, expect, it } from 'vitest';
import { defaultTuning as T, type Tuning } from '../src/config/tuning';
import { protectionOf } from '../src/lab/gauges';
import type { AttackDriver } from '../src/sim/game/attacks';
import type { VehicleEntity } from '../src/sim/game/camp';
import { commanderOf } from '../src/sim/game/comms';
import { player } from '../src/sim/game/entities';
import { compound } from '../src/sim/game/scenes/compound';
import { liveCamp } from '../src/sim/game/scenes/liveCamp';
import { takedown, takedownTuning } from '../src/sim/game/scenes/takedown';
import type { Simulation } from '../src/sim/game/sim';
import type { Command } from '../src/sim/kernel/commands';
import { neutralInput } from '../src/sim/kernel/input';
import { startScene, type Scene } from '../src/sim/kernel/scene';
import { tuningCopy } from './fixtures';
import { worldOf } from './live';

/**
 * The takedown (brain/protect.ts, game/scenes/takedown.ts): a camp that protects its target
 * answers trouble in stages, and each stage hangs on something in the world. These check
 * the stages come in order, and that each link, taken away, changes what happens next.
 *
 * The exact seconds are still being found (the review's section on the takedown says which
 * a person should play first), so these pin the order and the consequences, not the times.
 *
 * These are the stages of a camp that waits for its relief to bring him out. A camp's answer
 * now depends on the problem it's built round (tests/answer.test.ts), and this one is built
 * to be flushed, so the stages are checked here with that switched off (`off=answer`).
 */

const SEED = 'LEB-2534';
/** A camp that protects its target, answering as every such camp did before answers went by the camp's problem. */
const STAGED = '&ready=alert&off=answer';
const GRADED_SHOTS = T.modes.takedown.shots;
const HZ = T.sim.tickHz;

interface Timeline {
  sim: Simulation;
  /** Seconds, or NaN if it never happened. */
  siren: number;
  room: number;
  relief: number;
  told: number;
  left: number;
  gone: number;
  next: () => void;
}

/** A sniper on the camp's best overview, watched for `seconds`, or until the target is gone. */
function attack(params: string, seconds: number, tuning: Tuning = T, stopAt: (t: Timeline) => boolean = (t) => !Number.isNaN(t.gone)): Timeline {
  const world = worldOf(SEED);
  const scene = { ...(compound(`seed=${SEED}&attack=sniper${params}`) as Scene<Simulation>), world: () => world };
  const sim = startScene(scene, tuning, world);
  const driver = scene.driver!() as AttackDriver;
  const raw = scene.game.still(sim);
  const camp = commanderOf(sim)!.camp;
  const target = camp.objective!.target;
  const near = sim.tuning.brain.protect.near;
  const t: Timeline = { sim, siren: NaN, room: NaN, relief: NaN, told: NaN, left: NaN, gone: NaN, next: () => undefined };
  t.next = () => {
    const now = sim.tick / HZ;
    for (const e of sim.step(driver.next(sim, raw))) {
      if (e.type === 'siren' && Number.isNaN(t.siren)) t.siren = now;
      if (e.type === 'reinforce' && Number.isNaN(t.relief)) t.relief = now;
      if (e.type === 'act' && e.source === target && e.to === 'flee' && Number.isNaN(t.left)) t.left = now;
    }
    const him = sim.index.get(target);
    if (him?.kind === 'guard') {
      const room = camp.protects;
      if (room && Number.isNaN(t.room) && Math.hypot(him.body.x - room.x, him.body.z - room.z) <= near) t.room = now;
      if (Number.isNaN(t.told) && him.brain?.told.some((r) => r.kind === 'escort')) t.told = now;
    }
    if (Number.isNaN(t.gone) && camp.objective?.status === 'escaped') t.gone = now;
  };
  for (let i = 0; i < seconds * HZ && !stopAt(t); i++) t.next();
  return t;
}

describe('the takedown’s numbers', () => {
  it('are set over the game’s, the same however often, and leave the game’s alone', () => {
    const once = takedownTuning(T);
    expect(takedownTuning(once)).toEqual(once);
    expect(once.perception.awareness.shots).toEqual(GRADED_SHOTS);
    expect(once.perception.awareness.whistle).toBe(T.modes.takedown.whistle);
    expect(T.perception.awareness.shots).not.toEqual(GRADED_SHOTS);
    expect(once.ballistics.rifle.carries).toEqual({ match: true, subsonic: true });
    expect(T.ballistics.rifle.carries).toEqual({ match: true, subsonic: false });
    expect({ ...once, perception: T.perception, ballistics: T.ballistics }).toEqual(T);
  });

  it('are what a takedown runs on, and what a live camp doesn’t', () => {
    const world = worldOf(SEED);
    const mode = startScene({ ...(takedown(`seed=${SEED}`) as Scene<Simulation>), world: () => world }, T, world);
    expect(mode.tuning.perception.awareness.shots).toEqual(GRADED_SHOTS);
    expect(commanderOf(mode)!.camp.protects).toBeDefined();
    const plain = startScene({ ...(liveCamp(`seed=${SEED}`) as Scene<Simulation>), world: () => world }, T, world);
    expect(plain.tuning.perception.awareness.shots).toEqual(T.perception.awareness.shots);
    expect(commanderOf(plain)!.camp.protects).toBeUndefined();
  }, 120_000);
});

describe('a camp that protects its target', () => {
  it('keeps him in his room at the siren, and lets him go only once the relief has come to his door', () => {
    const t = attack(STAGED, 420);
    expect(t.siren).toBeGreaterThan(0);
    // To his room, and there until he's told: the relief first, then the word at his door, then the run.
    expect(Number.isNaN(t.room)).toBe(false);
    expect(t.relief).toBeGreaterThan(t.siren);
    expect(t.told).toBeGreaterThanOrEqual(t.relief);
    expect(t.left).toBeGreaterThanOrEqual(t.told);
    expect(t.gone).toBeGreaterThan(t.left);
    // A relaxed camp has him away in half a minute. This is the difference the mode is for.
    expect(t.left - t.siren).toBeGreaterThan(45);
    expect(protectionOf(t.sim)).toBe('he is gone');
  }, 240_000);

  it('runs him for his vehicle at once when it isn’t ready for trouble', () => {
    const t = attack('', 240);
    expect(t.siren).toBeGreaterThan(0);
    expect(t.left - t.siren).toBeLessThan(5);
    expect(t.gone).toBeGreaterThan(t.left);
    expect(Number.isNaN(t.room)).toBe(true);
    expect(protectionOf(t.sim)).toBe('');
  }, 240_000);

  it('has nobody to send for with its radio out, so he waits until his nerve goes, and then runs alone', () => {
    const tuning = tuningCopy();
    tuning.brain.protect.giveUp = 60;
    const t = attack('&ready=alert&off=radio,answer', 300, tuning);
    expect(t.siren).toBeGreaterThan(0);
    expect(Number.isNaN(t.relief)).toBe(true);
    expect(Number.isNaN(t.told)).toBe(true);
    expect(t.left - t.siren).toBeGreaterThanOrEqual(60);
    expect(t.left - t.siren).toBeLessThan(63);
    expect(t.gone).toBeGreaterThan(t.left);
  }, 240_000);

  it('doesn’t know it’s time if nobody comes to tell him, relief or no relief', () => {
    const tuning = tuningCopy();
    tuning.brain.protect.giveUp = 150;
    tuning.brain.protect.fetchers = 0;
    const t = attack(STAGED, 420, tuning, (x) => !Number.isNaN(x.left));
    expect(t.relief).toBeGreaterThan(t.siren);
    expect(Number.isNaN(t.told)).toBe(true);
    expect(t.left - t.siren).toBeGreaterThanOrEqual(150);
  }, 240_000);

  it('keeps him where he is when there is no vehicle to run to', () => {
    const tuning = tuningCopy();
    tuning.brain.protect.giveUp = 30;
    const t = attack('&ready=alert&off=truck,answer', 200, tuning);
    expect(t.siren).toBeGreaterThan(0);
    expect(Number.isNaN(t.left)).toBe(true);
    expect(Number.isNaN(t.gone)).toBe(true);
    const camp = commanderOf(t.sim)!.camp;
    expect(camp.objective!.status).not.toBe('escaped');
    const him = t.sim.index.get(camp.objective!.target);
    // Still there, unless the sniper found him: and if he's alive, he's in his room.
    if (him?.kind === 'guard') {
      // Nobody is sent to bring him out to nothing: he's told nothing, and gives up waiting with nowhere to go.
      expect(him.brain!.told.some((r) => r.kind === 'escort')).toBe(false);
      expect(protectionOf(t.sim)).toMatch(/^in his room · .* · gave up waiting · no vehicle$/);
    }
    if (him?.kind === 'guard') expect(Math.hypot(him.body.x - camp.protects!.x, him.body.z - camp.protects!.z)).toBeLessThanOrEqual(T.brain.protect.near);
  }, 240_000);
});

describe('a vehicle that won’t start', () => {
  it('leaves him stranded when he gets to it, and he goes back to his room', () => {
    const world = worldOf(SEED);
    const scene = { ...(compound(`seed=${SEED}&attack=sniper${STAGED}`) as Scene<Simulation>), world: () => world };
    const sim = startScene(scene, T, world);
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const camp = commanderOf(sim)!.camp;
    const target = camp.objective!.target;
    // Someone has been at it before the first shot.
    sim.index.of('vehicle').find((v) => v.vehicle.escape)!.vehicle.disabled = true;
    let ran = false;
    let stranded = -1;
    let back = false;
    for (let i = 0; i < 420 * HZ && !back; i++) {
      for (const e of sim.step(driver.next(sim, raw))) if (e.type === 'act' && e.source === target && e.to === 'flee') ran = true;
      const him = sim.index.get(target);
      if (him?.kind !== 'guard') break;
      if (stranded < 0 && him.brain!.stranded) stranded = sim.tick;
      back = stranded >= 0 && him.brain!.act === 'shelter' && Math.hypot(him.body.x - camp.protects!.x, him.body.z - camp.protects!.z) <= T.brain.protect.near;
      expect(camp.objective!.status).toBe('open');
    }
    // Unless the sniper found him on the way, he ran for it, found it dead, and is back under his roof.
    const him = sim.index.get(target);
    if (him?.kind !== 'guard') return;
    expect(ran).toBe(true);
    expect(stranded).toBeGreaterThan(0);
    expect(back).toBe(true);
    expect(protectionOf(sim)).toMatch(/^in his room · /);
  }, 240_000);
});

describe('a vehicle held up on its way out', () => {
  /** A relaxed camp under the sniper, up to the moment the target is aboard and moving. */
  function untilAboard(): { t: Timeline; truck: VehicleEntity } {
    const t = attack('', 120, T, (x) => commanderOf(x.sim)!.camp.objective?.status === 'escaping');
    expect(commanderOf(t.sim)!.camp.objective?.status).toBe('escaping');
    return { t, truck: t.sim.index.of('vehicle').find((v) => v.vehicle.escape)! };
  }

  /** A point `ahead` metres along the way the vehicle is going. */
  function inItsWay(truck: VehicleEntity, ahead: number): { x: number; z: number } {
    const d = truck.vehicle.driving!;
    const to = d.route[d.leg]!;
    const len = Math.hypot(to.x - truck.solid.x, to.z - truck.solid.z) || 1;
    return { x: truck.solid.x + ((to.x - truck.solid.x) / len) * ahead, z: truck.solid.z + ((to.z - truck.solid.z) / len) * ahead };
  }

  it('is given up when someone who isn’t the camp’s stands in the road: he gets out, and the camp has no other', () => {
    const { t, truck } = untilAboard();
    const sim = t.sim;
    const camp = commanderOf(sim)!.camp;
    const was = camp.objective!.target;
    expect(sim.index.get(was)).toBeUndefined();
    expect(truck.vehicle.rider).toBeDefined();
    const half = (truck.solid as unknown as { hx: number }).hx;
    const hold = (): void => {
      if (!truck.vehicle.driving) return;
      const at = inItsWay(truck, half + T.bodies.player.radius + 0.3);
      sim.player.x = at.x;
      sim.player.z = at.z;
      sim.player.y = sim.world.terrain.heightAt(at.x, at.z);
    };
    for (let i = 0; i < (T.brain.alarm.flee.bailOut + 6) * HZ && truck.vehicle.driving; i++) {
      hold();
      t.next();
    }
    expect(truck.vehicle.driving).toBeUndefined();
    expect(truck.vehicle.disabled).toBe(true);
    expect(truck.vehicle.rider).toBeUndefined();
    expect(camp.devices.escape).toBeNull();
    expect(camp.objective!.status).toBe('open');
    // He's a man on the ground again, the target the mission is about, and he knows about the siren.
    const him = sim.index.get(camp.objective!.target);
    expect(him?.kind).toBe('guard');
    expect(camp.objective!.target).not.toBe(was);
    if (him?.kind !== 'guard') return;
    expect(him.brain!.sirenAt).toBeGreaterThanOrEqual(0);
    expect(sim.world.camp.guards[him.guard.spawn]!.role).toBe('target');
    expect(sim.index.of('objective').every((o) => o.objective.status !== 'escaping')).toBe(true);
    // And nothing takes him away after that.
    for (let i = 0; i < 60 * HZ; i++) t.next();
    expect(camp.objective!.status).not.toBe('escaped');
    expect(truck.vehicle.driving).toBeUndefined();
  }, 240_000);

  it('isn’t given up for one of the camp’s own men: he’s told to step off its line', () => {
    const { t, truck } = untilAboard();
    const sim = t.sim;
    const man = sim.guards[0]!;
    const half = (truck.solid as unknown as { hx: number }).hx;
    const at = inItsWay(truck, half + T.bodies.guard.radius + 0.2);
    man.body.x = at.x;
    man.body.z = at.z;
    man.body.y = sim.world.terrain.heightAt(at.x, at.z);
    let told = false;
    for (let i = 0; i < 90 * HZ && commanderOf(sim)!.camp.objective?.status === 'escaping'; i++) {
      t.next();
      told ||= man.guard.aside !== undefined;
    }
    expect(told).toBe(true);
    expect(commanderOf(sim)!.camp.objective?.status).toBe('escaped');
  }, 240_000);
});

describe('the rifle’s load', () => {
  it('has nothing to change to in a kit with one load: the game’s, until the owner says otherwise', () => {
    const world = worldOf(SEED);
    const sim = startScene({ ...(liveCamp(`seed=${SEED}`) as Scene<Simulation>), world: () => world }, T, world);
    const rifle = player(sim.index).rifle!;
    sim.step({ ...neutralInput(), commands: [{ kind: 'load' }] });
    expect(rifle.load).toBe('match');
    expect(rifle.fitting).toBe(0);
    expect(rifle.swap).toBeUndefined();
  }, 120_000);

  it('changes by command in the takedown’s kit, takes its time, and holds fire while it does', () => {
    const world = worldOf(SEED);
    const sim = startScene({ ...(takedown(`seed=${SEED}`) as Scene<Simulation>), world: () => world }, T, world);
    const you = player(sim.index);
    const rifle = you.rifle!;
    const still = neutralInput();
    const step = (commands: Command[] = []) => sim.step({ ...still, commands }).map((e) => ({ ...e }));
    expect(rifle.load).toBe('match');
    step([{ kind: 'load' }]);
    expect(rifle.load).toBe('subsonic');
    expect(rifle.swap).toBe('load');
    expect(sim.snapshot().rifle?.swapping).toBe(true);
    const fire: Command = { kind: 'fire', lag: 0, yaw: 0, pitch: 0 };
    expect(step([fire]).filter((e) => e.type === 'shot')).toHaveLength(0);
    // A second press while it's going in does nothing.
    step([{ kind: 'load' }]);
    expect(rifle.load).toBe('subsonic');
    for (let i = 0; i < T.ballistics.rifle.loadTime * HZ; i++) step();
    expect(rifle.swap).toBeUndefined();
    const events = step([fire]);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot).toBeDefined();
    const report = events.find((e) => e.type === 'report');
    // Unsuppressed, a subsonic load's report is its share of the rifle's; and round again to the match load.
    expect(report?.type === 'report' && report.radius).toBe(T.ballistics.sound.report * T.ballistics.sound.subsonicReport);
    for (let i = 0; i < (T.ballistics.rifle.boltTime + 0.2) * HZ; i++) step();
    step([{ kind: 'load' }]);
    expect(rifle.load).toBe('match');
  }, 120_000);
});
