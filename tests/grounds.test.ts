import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { secondStep } from '../src/lab/experiments/secondStep';
import { createBrain, digest, hasGrounds, noteGrounds, plan, type CampMind, type CampOrder, type CampState, type GuardMind, type Report } from '../src/sim/brain';
import { commanderOf, giveCommander } from '../src/sim/game/comms';
import { emptyMind } from '../src/sim/game/guards';
import { giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { withSystem, type System } from '../src/sim/kernel/systems';
import { Surface } from '../src/sim/kernel/world/surfaces';
import type { World } from '../src/sim/kernel/world/world';
import type { Percept } from '../src/sim/perception';
import { testGuard, testWorld } from './fixtures';

/**
 * A first move that isn't the last (the owner, Nov 12; docs/camp-engine.md, Step 3b): what
 * a camp makes of one round, and what it takes to sound its siren.
 *
 * - A sound tells a man what it sounds like: a thud a long way off tells him nothing.
 * - The siren takes a man who knows the camp is under attack (brain/grounds.ts), or a camp
 *   that has counted its dead (brain/commander.ts).
 * - A round breaks the generator, or an alarm box (game/sabotage.ts).
 * - And on generated camps, by the bench the numbers come from: no siren is thrown by a
 *   man who has seen nobody and no body, and a careful first shot doesn't bring it at all.
 */

const HZ = T.sim.tickHz;
const G = T.brain.alarm.grounds;
const A = T.perception.awareness;

/** A sound of a shot, as a percept: which, how clearly, and when he heard it. */
const shot = (sound: 'report' | 'crack' | 'impact', clarity: number, tick: number): Percept => ({ kind: 'shot', sound, strength: clarity, x: 10, y: 1, z: 10, radius: 3, tick, expires: tick + Math.round(T.perception.hearing.keep * HZ), cause: 1 });
const body = (tick: number, fell: boolean): Percept => ({ kind: 'body', strength: 1, x: 5, y: 0, z: 5, radius: 0.5, tick, expires: tick + Math.round(A.keepBody * HZ), cause: 2, ...(fell ? { fell: true as const } : {}) });
const voice = (sound: string, tick: number): Percept => ({ kind: 'voice', sound, strength: 12, x: 0, y: 1, z: 0, radius: 2, tick, expires: tick + 180, cause: 3 });

/** A man's mind over time: what he has in it at each moment is whatever `at` is given. */
function man(): { at: (seconds: number, state: GuardMind['awareness']['state'], percepts: Percept[]) => boolean } {
  const m = emptyMind();
  m.tuning = T;
  m.brain = createBrain();
  return {
    at(seconds, state, percepts) {
      m.tick = Math.round(seconds * HZ);
      m.percepts = percepts.filter((p) => p.tick <= m.tick && p.expires > m.tick);
      m.awareness = { ...m.awareness, state };
      noteGrounds(m);
      return hasGrounds(m);
    },
  };
}

describe('grounds for the siren', () => {
  it('aren’t a snap, a thud, a whistle or a shout, however many', () => {
    const g = man();
    const heard = [shot('crack', 10, 30), shot('impact', 60, 31), voice('whistle', 40), voice('bark', 45), shot('crack', 8, 300), shot('impact', 40, 600)];
    for (const t of [1, 2, 5, 11, 21, 40]) expect(g.at(t, 'searching', heard)).toBe(false);
  });

  it('are an intruder in his sight, for as long as he sees him and a while after', () => {
    const g = man();
    expect(g.at(1, 'suspicious', [])).toBe(false);
    expect(g.at(2, 'combat', [])).toBe(true);
    expect(g.at(2 + G.keep - 1, 'searching', [])).toBe(true);
    expect(g.at(2 + G.keep + 1, 'searching', [])).toBe(false);
  });

  it('are a man he watched go down, and aren’t a body he came on', () => {
    const watched = man();
    expect(watched.at(3, 'searching', [body(60, true)])).toBe(true);
    // He knows it from when he saw it: a minute on, with the body still in his mind, he isn't still on his way to a box.
    expect(watched.at(2 + G.keep + 1, 'searching', [body(60, true)])).toBe(false);
    const found = man();
    expect(found.at(3, 'searching', [body(60, false)])).toBe(false);
    expect(found.at(20, 'searching', [body(60, false)])).toBe(false);
  });

  it('are a body he came on after taking a shot for a shot', () => {
    const g = man();
    const report = shot('report', 6, 30);
    expect(g.at(1.5, 'searching', [report])).toBe(false);
    expect(g.at(20, 'searching', [report, body(600, false)])).toBe(true);
  });

  it('are fire that goes on: one plain shot isn’t, and a second inside the minute is', () => {
    const g = man();
    const first = [shot('report', 6, 30), shot('crack', 60, 32), shot('impact', 70, 40)];
    // One shot makes several sounds, a moment apart: they're one shot.
    expect(g.at(1.5, 'searching', first)).toBe(false);
    expect(g.at(8, 'searching', [])).toBe(false);
    expect(g.at(10, 'searching', [shot('report', 6, 300)])).toBe(true);
  });

  it('take the second shot inside the minute: two a long time apart are one each', () => {
    const g = man();
    expect(g.at(1.5, 'searching', [shot('report', 6, 30)])).toBe(false);
    const later = Math.round((G.within + 10) * HZ);
    expect(g.at(G.within + 11, 'searching', [shot('report', 6, later)])).toBe(false);
  });

  it('count a near miss as a shot, and a snap farther off as nothing', () => {
    const near = man();
    near.at(1, 'searching', [shot('crack', A.shots.crack.closeAt + 5, 20)]);
    expect(near.at(10, 'searching', [shot('crack', A.shots.crack.closeAt + 5, 290)])).toBe(true);
    const far = man();
    far.at(1, 'searching', [shot('crack', A.shots.crack.closeAt - 5, 20)]);
    expect(far.at(10, 'searching', [shot('crack', A.shots.crack.closeAt - 5, 290)])).toBe(false);
  });
});

const POST = { role: 'patrol' as const, y: 0, faceX: 0, faceZ: -1, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };

function worldWith(...at: Array<[number, number, string?]>): World {
  return testWorld({ size: 200, spawn: { x: -90, z: 90 }, camp: { structures: [], guards: at.map(([x, z, role], id) => testGuard({ ...POST, id, x, z, role: (role ?? 'patrol') as 'patrol' })), fenceHalf: 0 } });
}

describe('a camp that has counted its dead', () => {
  const world = worldWith([0, 0], [30, 0], [-30, 0], [0, 40, 'marksman']);
  const report = (x: number, z: number, tick: number): Report => ({ kind: 'body', x, y: 0, z, radius: 5, tick, from: 2, fromX: x, fromZ: z, cause: 77 });
  const mind = (camp: CampState, tick: number): CampMind => ({ camp, world, tuning: T, tick, time: tick / HZ, officer: true });
  function campWithBoxes(): CampState {
    const sim = new Simulation(world, T, SYSTEMS);
    giveCommander(sim);
    const camp = commanderOf(sim)!.camp;
    camp.devices.alarms.push({ x: 28, z: 4, raised: false, powered: true }, { x: -60, z: -60, raised: false, powered: true });
    return camp;
  }
  const orders = (camp: CampState, tick: number): CampOrder[] => {
    const out: CampOrder[] = [];
    plan(mind(camp, tick), out);
    return out;
  };

  it('orders nobody to the siren for one body, or for the same body called in twice', () => {
    const camp = campWithBoxes();
    digest(camp, report(10, 10, 100), 100, T, world);
    expect(orders(camp, 110).some((o) => o.task.kind === 'alarm')).toBe(false);
    digest(camp, report(11, 10, 200), 200, T, world);
    expect(camp.bodies).toHaveLength(1);
    expect(orders(camp, 210).some((o) => o.task.kind === 'alarm')).toBe(false);
  });

  it('orders the man who can get to a working box soonest, once a second body is reported', () => {
    const camp = campWithBoxes();
    digest(camp, report(10, 10, 100), 100, T, world);
    digest(camp, report(-40, 20, 200), 200, T, world);
    expect(camp.bodies).toHaveLength(T.brain.alarm.casualties);
    const sent = orders(camp, 210).filter((o) => o.task.kind === 'alarm');
    expect(sent).toHaveLength(1);
    // The box by the man at (30, 0), and that man: not the marksman, who doesn't run for boxes.
    expect(sent[0]!.task.x).toBe(28);
    expect(world.camp.guards[camp.roster.find((g) => g.id === sent[0]!.guard)!.post]!.x).toBe(30);
    // One order at a time: it isn't given again while it stands.
    expect(orders(camp, 220).some((o) => o.task.kind === 'alarm')).toBe(false);
  });

  it('gives it on the word of a man who knows the camp is under attack and can’t get to a box himself', () => {
    const camp = campWithBoxes();
    const word: Report = { kind: 'shot', x: 60, y: 0, z: 60, radius: 20, tick: 100, from: 3, fromX: 0, fromZ: 40, cause: 77, attack: true };
    digest(camp, { ...word, attack: undefined } as Report, 100, T, world);
    expect(orders(camp, 110).some((o) => o.task.kind === 'alarm')).toBe(false);
    digest(camp, word, 200, T, world);
    expect(orders(camp, 210).filter((o) => o.task.kind === 'alarm')).toHaveLength(1);
  });

  it('sends someone else when the man it sent never throws it', () => {
    const camp = campWithBoxes();
    digest(camp, report(10, 10, 100), 100, T, world);
    digest(camp, report(-40, 20, 200), 200, T, world);
    const first = orders(camp, 210).find((o) => o.task.kind === 'alarm')!;
    // His order runs out with no siren: for all the camp knows he's dead.
    const later = 210 + Math.round((T.brain.camp.keepOrder + 1) * HZ);
    const second = orders(camp, later).find((o) => o.task.kind === 'alarm')!;
    expect(second).toBeDefined();
    expect(second.guard).not.toBe(first.guard);
    expect(camp.noAnswer).toContain(first.guard);
  });

  it('gives no such order with every box dead or thrown, or once the siren has sounded', () => {
    const dead = campWithBoxes();
    for (const a of dead.devices.alarms) a.powered = false;
    digest(dead, report(10, 10, 100), 100, T, world);
    digest(dead, report(-40, 20, 200), 200, T, world);
    expect(orders(dead, 210).some((o) => o.task.kind === 'alarm')).toBe(false);
    const up = campWithBoxes();
    up.devices.alarms[0]!.raised = true;
    digest(up, report(10, 10, 100), 100, T, world);
    digest(up, report(-40, 20, 200), 200, T, world);
    expect(orders(up, 210).some((o) => o.task.kind === 'alarm')).toBe(false);
    expect(up.level).toBe('lockdown');
  });
});

describe('a thud a long way off', () => {
  /** A round striking a body at the origin, at a tick. */
  const strike = (tick: number): System => ({
    name: 'test-strike',
    phase: 'commands',
    after: ['player-commands', 'rifle', 'sandbox-drops', 'use'],
    reads: [],
    writes: [],
    emits: ['impact'],
    run(ctx) {
      const r = T.ballistics.sound.impact.body;
      if (ctx.tick === tick) ctx.emit({ type: 'impact', source: 1, t: ctx.tick / HZ, cause: 0, x: 0, y: 1, z: 0, surface: Surface.Dirt, loudness: r / T.noise.radiusPerUnit, radius: r, what: 'body', target: 0, part: 'head', speed: 600, nx: 0, ny: 1, nz: 0 });
    },
  });

  it('is heard, and tells a man nothing: no percept, no look, where a man close by turns to it', () => {
    const world = worldWith([8, 0], [150, 0]);
    const sim = new Simulation(world, T, withSystem(SYSTEMS, strike(10)));
    giveSenses(sim);
    const raw = neutralInput();
    const events: SimEvent[] = [];
    for (let i = 0; i < 2 * HZ; i++) events.push(...sim.step(raw).map((e) => ({ ...e })));
    const [near, far] = sim.guards;
    const heard = (id: number) => events.filter((e) => e.type === 'heard' && e.source === id && e.kind === 'shot');
    // Both hear it: the law of sound hasn't changed, and a shooter still hears his hit land.
    expect(heard(near!.id)).toHaveLength(1);
    expect(heard(far!.id)).toHaveLength(1);
    // What it tells each is another matter.
    expect(near!.senses!.percepts.some((p) => p.kind === 'shot' && p.sound === 'impact')).toBe(true);
    expect(near!.senses!.awareness.state).not.toBe('unaware');
    expect(far!.senses!.percepts).toHaveLength(0);
    expect(far!.senses!.awareness.state).toBe('unaware');
    expect(events.some((e) => e.type === 'alert' && e.source === far!.id)).toBe(false);
  });
});

describe('on generated camps (npm run experiment -- second-step)', () => {
  /** Camps of the bench's own series on which each of these openings has a line, so nothing here passes for want of a shot. */
  const CAMPS = ['NEB-1102', 'NEZ-8154', 'REN-5699'];
  const arm = (name: string) => secondStep.arms.find((a) => a.name === name)!;
  const runs = (name: string) => CAMPS.map((seed) => secondStep.run(seed, arm(name), T)).filter((r) => r.done === 1);

  it('a suppressed round at a man nobody is watching brings no siren, and the target stays', () => {
    const careful = runs('suppressed, at a man nobody is watching');
    expect(careful.length).toBeGreaterThan(0);
    for (const r of careful) {
      expect(r.siren).toBe(0);
      expect(r.gone).toBe(0);
    }
  }, 600_000);

  it('nobody throws the siren who has seen nobody and no body, whatever the opening', () => {
    let thrown = 0;
    for (const a of secondStep.arms) {
      for (const r of runs(a.name)) {
        if (r.siren !== 1) continue;
        thrown++;
        expect(r.blind, a.name).toBe(0);
      }
    }
    // It does sound for some of them: a man seen going down is grounds enough.
    expect(thrown).toBeGreaterThan(0);
  }, 900_000);

  it('a round into an alarm box kills that box; the generator is a rifle’s to stop only if the game says so', () => {
    const generator = runs('suppressed, at the generator');
    const box = runs('suppressed, at an alarm box');
    expect(generator.length).toBeGreaterThan(0);
    expect(box.length).toBeGreaterThan(0);
    for (const r of box) expect(r.dead).toBe(1);
    expect(T.ballistics.breaks.generator).toBe(0);
    for (const r of generator) expect(r.dead).toBe(0);
    // With the dial on, one round stops it.
    const dial = structuredClone(T);
    dial.ballistics.breaks.generator = 1;
    const stopped = CAMPS.map((seed) => secondStep.run(seed, arm('suppressed, at the generator'), dial)).filter((r) => r.done === 1);
    expect(stopped.length).toBeGreaterThan(0);
    for (const r of stopped) expect(r.dead).toBe(1);
  }, 600_000);
});
