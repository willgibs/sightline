import { campMission, generateWorld } from '../../generation';
import type { System } from '../../kernel/systems';
import { SIGHTLINE, type Simulation } from '../sim';
import type { Scene } from '.';

/**
 * A generated camp's systems (lab D, D5): its generator powers the lights, the alarm boxes
 * and the radio, and the mission's objective is its target. The scene cuts the generator
 * at tick 60 and restarts it at tick 180, as lab E's sabotage and repairs will, and takes
 * the target away at tick 120, as a kill by lab B will. Everything on the circuit goes dark
 * in the tick of the cut and comes back in the tick of the restart, and the objective is
 * done in the tick its target goes.
 */

const NAME = 'camp-systems';
const SEED = 'CMP-0101';
const CUT = 60;
const RESTART = 180;
const TAKEN = 120;

function circuit(sim: Simulation): { powered: boolean; dark: boolean } {
  const lights = sim.index.of('light');
  const alarms = sim.index.of('alarm');
  const radios = sim.index.of('radio');
  const all = [...lights.map((l) => l.light.on), ...alarms.map((a) => a.alarm.powered), ...radios.map((r) => r.radio.powered)];
  return { powered: all.every(Boolean), dark: all.every((x) => !x) };
}

export function campSystems(): Scene {
  const cut: System = {
    name: 'cut-the-generator',
    phase: 'commands',
    reads: [],
    writes: ['generator.generator.running'],
    emits: [],
    run(ctx) {
      if (ctx.tick !== CUT && ctx.tick !== RESTART) return;
      for (const g of ctx.index.of('generator')) g.generator.running = ctx.tick === RESTART;
    },
  };
  const take: System = {
    name: 'take-the-target',
    phase: 'commands',
    reads: ['objective.objective'],
    writes: ['entities'],
    emits: [],
    after: ['cut-the-generator', 'player-commands'],
    run(ctx) {
      if (ctx.tick !== TAKEN) return;
      for (const o of ctx.index.of('objective')) ctx.despawn(o.objective.target);
    },
  };

  return {
    name: NAME,
    version: 1,
    title: 'Camp systems',
    description: `A generated camp (${SEED}): its generator is cut and restarted, and its target taken. The lights, alarm boxes and radio follow the generator; the objective is done when the target goes.`,
    game: SIGHTLINE,
    world: (tuning) => generateWorld(campMission(SEED), tuning),
    systems: [cut, take],
    seconds: 8,
    expect: [
      {
        name: 'the camp has a generator, lights, alarm boxes, a radio and an objective',
        after(sim) {
          for (const kind of ['generator', 'light', 'alarm', 'radio', 'objective'] as const) if (sim.index.of(kind).length === 0) return `no ${kind}`;
        },
      },
      {
        name: 'everything on the circuit is powered while the generator runs, and dark in the tick it stops',
        during(sim) {
          const { powered, dark } = circuit(sim);
          const off = sim.tick >= CUT && sim.tick < RESTART;
          if (off && !dark) return 'something stayed powered with the generator stopped';
          if (!off && !powered) return 'something was dark with the generator running';
        },
      },
      {
        name: 'the objective is open until its target goes, and done in that tick',
        during(sim) {
          const o = sim.index.of('objective')[0]!.objective.status;
          if (sim.tick < TAKEN && o !== 'open') return `it was ${o} before the target went`;
          if (sim.tick >= TAKEN && o !== 'done') return `it was ${o} after the target went`;
        },
      },
    ],
  };
}
