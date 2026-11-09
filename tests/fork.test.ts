import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { firstTick, forkRun, formatFork, moveAcross, movePlayer, noChange, parseIntervention, patched, patchNumber, playBranch, recordingRun, removeGuard, sceneRun, switchOff, type RunSource } from '../src/lab/fork';
import { commanderOf } from '../src/sim/game/comms';
import { overlook } from '../src/sim/game/scenes/overlook';
import { takeAway } from '../src/sim/game/switches';
import type { Simulation } from '../src/sim/game/sim';
import { cancelScheduled, emptySchedule, popDue, scheduleAt } from '../src/sim/kernel/schedule';
import { runScene, startScene, type Scene } from '../src/sim/kernel/scene';

/** Forking a run (Lab F): re-simulation plus one intervention. */

const params = 'seed=LEB-2534&plan=clear&pace=5';
const scene = (): Scene<Simulation> => overlook(params) as Scene<Simulation>;
/** One run to fork, played again for every branch: a world takes longer to build than these take to play. */
let fifteen: RunSource | null = null;
const run = (seconds = 15): RunSource => (seconds === 15 ? (fifteen ??= sceneRun(scene(), T, { seconds })) : sceneRun(scene(), T, { seconds }));
const shotAt = (sim: Simulation, events: readonly { type: string; source: number }[]): boolean => events.some((e) => e.type === 'shot' && e.source === sim.playerId);

describe('a fork', () => {
  it('that changes nothing reproduces the run, bit for bit', () => {
    const r = forkRun(run(), 150, [noChange()]);
    const b = r.branches[0]!;
    expect(b.differs).toEqual({ state: null, guard: null, event: null });
    expect(b.finalHash).toBe(r.base.finalHash);
    expect(b.behaviour).toBe(r.base.behaviour);
    expect(b.ticks).toBe(r.base.ticks);
    expect(formatFork(r)).toContain('the same run, bit for bit');
    // And the run it reproduces is the one the scene plays with no fork anywhere near it.
    const plain = runScene({ ...scene(), expect: [] }, T, { seconds: 15 });
    expect(plain.sim.hash()).toBe(r.base.finalHash);
  }, 60_000);

  it('of a recording re-simulates its inputs to the fork, and a no-op reproduces it', () => {
    const played = runScene({ ...scene(), expect: [] }, T, { seconds: 10 });
    const r = forkRun(recordingRun(played.recording, scene()), 120, [noChange()]);
    expect(r.base.finalHash).toBe(played.recording.header.finalHash);
    expect(r.branches[0]!.finalHash).toBe(played.recording.header.finalHash);
    expect(r.branches[0]!.differs.state).toBeNull();
  }, 60_000);

  it('has one past: nothing differs before the fork, and the change shows at it', () => {
    const shot = firstTick(run(), shotAt)!;
    expect(shot).toBeGreaterThan(0);
    const at = shot + 30;
    const r = forkRun(run(), at, [moveAcross(30)]);
    expect(r.branches[0]!.differs.state!.tick).toBe(at);
    expect(r.branches[0]!.finalHash).not.toBe(r.base.finalHash);
  }, 60_000);

  it('moves the player, standing as he stood, and moving him nowhere changes nothing', () => {
    const at = 200;
    const live = run().begin(null, at);
    while (live.sim.tick < at) live.step();
    const { x, y, z, stance } = live.sim.player;
    expect(stance).toBe('prone');
    const r = forkRun(run(), at, [movePlayer(x, z)]);
    expect(r.branches[0]!.differs.state).toBeNull();
    let after: Simulation | null = null;
    playBranch(run(), at, movePlayer(x + 24, z + 18), (sim) => {
      if (sim.tick === at + 1) after = sim;
    });
    const p = (after as unknown as Simulation).player;
    expect(p.stance).toBe('prone');
    expect(Math.abs(p.y - y)).toBeLessThan(40);
  }, 60_000);

  it('removes a guard: gone with no body, off the roster, and never the target', () => {
    const live = startScene(scene(), T);
    removeGuard('officer').apply(live);
    const camp = commanderOf(live)!.camp;
    expect(live.guards.some((g) => live.world.camp.guards[g.guard.spawn]!.role === 'officer')).toBe(false);
    expect(camp.roster.every((m) => live.guards.some((g) => g.id === m.id))).toBe(true);
    expect(live.index.of('remains')).toHaveLength(0);
    expect(() => removeGuard(camp.objective!.target).apply(live)).toThrow(/target/);
    expect(() => removeGuard(9999).apply(live)).toThrow(/no guard/);
  }, 60_000);

  it('switches a part off from a tick on, leaving the run before it alone', () => {
    const at = 120;
    const change = switchOff(['radio', 'commander']);
    const r = forkRun(run(), at, [change]);
    expect(r.branches[0]!.differs.state!.tick).toBe(at);
    const live = run().begin(change, at);
    let planned = -1;
    while (live.sim.tick < at) live.step();
    planned = commanderOf(live.sim)!.camp.planned;
    change.apply(live.sim);
    for (let k = 0; k < 90; k++) live.step();
    expect(live.sim.index.of('radio')).toHaveLength(0);
    expect(commanderOf(live.sim)!.camp.netWorking).toBe(false);
    // The commander had been planning up to the fork, and not one tick after it.
    expect(planned).toBeGreaterThan(0);
    expect(commanderOf(live.sim)!.camp.planned).toBe(planned);
  }, 60_000);

  it('takes back reinforcements already on their way, and only those', () => {
    const s = emptySchedule();
    scheduleAt(s, 0, 30, 'radio-deliver', 1);
    scheduleAt(s, 0, 10, 'reinforce-arrive');
    scheduleAt(s, 0, 20, 'radio-deliver', 2);
    expect(cancelScheduled(s, 'reinforce-arrive')).toBe(1);
    expect(cancelScheduled(s, 'reinforce-arrive')).toBe(0);
    expect([popDue(s, 100)!.a, popDue(s, 100)!.a, popDue(s, 100)]).toEqual([2, 1, null]);
    const sim = startScene(scene(), T);
    scheduleAt(sim.state.schedule, 0, 400, 'reinforce-arrive');
    commanderOf(sim)!.camp.reinforceCalled = 1;
    takeAway(sim, ['reinforce']);
    expect(sim.state.schedule.queue.filter((e) => e.kind === 'reinforce-arrive')).toHaveLength(0);
    expect(commanderOf(sim)!.camp.reinforceCalled).toBe(0);
  }, 60_000);

  it('patches a number from the fork on, and refuses what a fork cannot change', () => {
    expect(patched(T, 'brain.combat.spreadDeg', 0.5).brain.combat.spreadDeg).toBe(0.5);
    expect(T.brain.combat.spreadDeg).not.toBe(0.5);
    expect(patched(T, 'brain.combat.range.marksman', 500).brain.combat.range.marksman).toBe(500);
    expect(() => patched(T, 'gen.world.size', 512)).toThrow(/fixed for a run/);
    expect(() => patched(T, 'sim.tickHz', 60)).toThrow(/fixed for a run/);
    expect(() => patched(T, 'brain.nothing', 1)).toThrow(/no number/);
    expect(() => patched(T, 'brain.combat', 1)).toThrow(/no number/);
    expect(() => patched(T, 'brain.combat.spreadDeg', NaN)).toThrow(/isn't a number/);
    const sim = startScene(scene(), T);
    patchNumber('brain.combat.spreadDeg', 0.5).apply(sim);
    expect(sim.tuning.brain.combat.spreadDeg).toBe(0.5);
  }, 60_000);

  it('reads its changes from the command line', () => {
    expect(parseIntervention('none').name).toBe('nothing');
    expect(parseIntervention('move:30').name).toContain('30 m across');
    expect(parseIntervention('move:12,-40').name).toContain('(12, -40)');
    expect(parseIntervention('remove:7').name).toContain('7');
    expect(parseIntervention('remove:officer').name).toContain('officer');
    expect(parseIntervention('off:radio,alarm').name).toContain('radio, alarm');
    expect(parseIntervention('patch:brain.combat.spreadDeg=2').name).toContain('2');
    expect(() => parseIntervention('off:')).toThrow(/parts of the camp/);
    expect(() => parseIntervention('off:radar')).toThrow(/radar/);
    expect(() => parseIntervention('jump:9')).toThrow(/jump/);
    expect(() => parseIntervention('move:a,b')).toThrow(/metres/);
  });

  it('says so when the run ends before the fork', () => {
    expect(() => forkRun(run(2), 90, [noChange()])).toThrow(/before the fork/);
  }, 60_000);
});
