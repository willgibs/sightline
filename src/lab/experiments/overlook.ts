import { commanderOf } from '../../sim/game/comms';
import { player } from '../../sim/game/entities';
import { overlook } from '../../sim/game/scenes/overlook';
import type { Simulation } from '../../sim/game/sim';
import { sceneOver, sceneTicks, startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { CampGauges, inClearLine } from '../gauges';

/**
 * A perfect shooter on the best overview, who never moves and takes everyone in a clear
 * line, one every 5 s (E12's `overlook`), and what the camp does about it. He sees what
 * the simulation sees, so these are the upper limit of what one perch can do.
 */

const SERIES = 'lab-e-overlook';

function scene(seed: string, arm: Arm): Scene<Simulation> {
  return overlook(`seed=${seed}&plan=clear&pace=5${arm.off ? `&off=${arm.off}` : ''}`);
}

/** What the camp did to a shooter who stayed. */
export const friction: Experiment = {
  name: 'friction',
  about: 'what pressure a camp puts on a perfect shooter who stays on one perch',
  series: SERIES,
  camps: 30,
  arms: [{ name: 'fights back' }, { name: 'as lab E left it', off: 'fight' }],
  measures: [
    { key: 'down', label: 'guards down', kind: 'mean' },
    { key: 'incoming', label: 'rounds at him', kind: 'mean' },
    { key: 'near', label: 'near misses', kind: 'mean' },
    { key: 'hurt', label: 'hit', kind: 'rate' },
    { key: 'found', label: 'detected', kind: 'rate' },
    { key: 'nearest', label: 'nearest guard (m)', kind: 'median' },
    { key: 'error', label: 'estimate off at 30 s (m)', kind: 'median' },
    { key: 'away', label: 'target away', kind: 'rate' },
  ],
  run(seed, arm, tuning) {
    const sc = scene(seed, arm);
    const sim = startScene(sc, tuning);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, tuning);
    const gauges = new CampGauges(sim);
    let error = NaN;
    while (!sceneOver(sc, sim, ticks)) {
      gauges.observe(sim, sim.step(driver.next(sim, raw)));
      if (Number.isNaN(error)) {
        const r = gauges.read(sim);
        // No estimate at all, 30 s after he fired, counts as the worst.
        if (r.sinceFirstShot >= 30) error = Number.isNaN(r.estimateOff) ? Infinity : r.estimateOff;
      }
    }
    const r = gauges.read(sim);
    return {
      down: r.guardsDown,
      incoming: r.roundsAtYou,
      near: r.nearMisses,
      hurt: player(sim.index).health!.hits > 0 ? 1 : 0,
      found: r.detected ? 1 : 0,
      nearest: r.nearestEver,
      error,
      away: r.targetStatus === 'escaped' ? 1 : 0,
    };
  },
};

/** Switching today's systems off one at a time: what does each add against one perch? */
export const switchOff: Experiment = {
  name: 'switch-off',
  about: "what each of the camp's systems adds against one perch",
  series: SERIES,
  camps: 16,
  arms: [
    { name: 'nothing off' },
    { name: 'commander', off: 'commander' },
    { name: 'radio', off: 'radio' },
    { name: 'commander, radio', off: 'commander,radio' },
    { name: 'alarm boxes', off: 'alarm' },
    { name: 'reinforcements', off: 'reinforce' },
    { name: "target's truck", off: 'truck' },
    { name: 'generator cut', off: 'power' },
    { name: 'alarm boxes, truck', off: 'alarm,truck' },
  ],
  measures: [
    { key: 'down', label: 'guards down', kind: 'mean' },
    { key: 'away', label: 'target away', kind: 'rate' },
    { key: 'shot', label: 'target shot', kind: 'rate' },
    { key: 'siren', label: 'siren', kind: 'rate' },
  ],
  run(seed, arm, tuning) {
    const sc = scene(seed, arm);
    const sim = startScene(sc, tuning);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, tuning);
    const start = new Set(sim.guards.map((g) => g.id));
    let siren = 0;
    while (!sceneOver(sc, sim, ticks)) {
      for (const e of sim.step(driver.next(sim, raw))) if (e.type === 'siren') siren = 1;
    }
    const status = commanderOf(sim)!.camp.objective!.status;
    return {
      down: start.size - sim.guards.filter((g) => start.has(g.id)).length,
      away: status === 'escaped' ? 1 : 0,
      shot: sim.state.outcome.status === 'succeeded' ? 1 : 0,
      siren,
    };
  },
};

const MARKS = [0, 5, 10, 20] as const;

/** One shot, then he holds fire: how fast do people get out of his view? */
export const gallery: Experiment = {
  name: 'gallery',
  about: 'share of standing guards still in a clear line from the perch, after one kill',
  series: SERIES,
  camps: 30,
  arms: [{ name: 'fights back' }, { name: 'as lab E left it', off: 'fight' }],
  measures: MARKS.map((t) => ({ key: `at${t}`, label: `share at +${t} s`, kind: 'mean' as const })),
  run(seed, arm, tuning) {
    const sc = scene(seed, arm);
    const sim = startScene(sc, tuning);
    const driver = sc.driver!();
    const raw = sc.game.still(sim);
    const hz = tuning.sim.tickHz;
    const start = sim.guards.length;
    const out: Record<string, number> = Object.fromEntries(MARKS.map((t) => [`at${t}`, NaN]));
    let killed = -1;
    for (let i = 0; i < 300 * hz && sim.state.outcome.status === 'playing'; i++) {
      sim.step(killed < 0 ? driver.next(sim, raw) : { ...raw, commands: [] });
      if (killed < 0 && sim.guards.length < start) killed = sim.tick;
      if (killed < 0) continue;
      const since = (sim.tick - killed) / hz;
      for (const t of MARKS) if (since === t && sim.guards.length > 0) out[`at${t}`] = inClearLine(sim) / sim.guards.length;
      if (since > MARKS[MARKS.length - 1]!) break;
    }
    return out;
  },
};
