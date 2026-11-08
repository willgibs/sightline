import { defaultTuning } from '../../config/tuning';
import { generateWorld } from '../generation';
import type { LayerName } from '../lanes';
import { kernelAloneScene } from '../kernel/alone';
import { Hasher } from '../kernel/core/hash';
import { EVENTS, type FieldCodec, type SimEvent } from '../kernel/events';
import { neutralInput } from '../kernel/input';
import { missionSpec } from '../kernel/mission';
import { sceneOver, sceneTicks, startScene, type Scene as KernelScene } from '../kernel/scene';
import type { Simulation as KernelSimulation } from '../kernel/sim';
import type { World } from '../kernel/world/world';
import { ChaosBot } from './bots/chaos';
import { WanderBot } from './bots/wander';
import { GOLDEN, type PinnedRunName } from './golden';
import { SCENES } from './scenes';
import { Simulation } from './sim';

/**
 * The pinned runs: the plays and scenes whose fingerprints are golden (golden.ts), each
 * played the one way it always is, and each belonging to the lane whose bench it is part
 * of (benches.ts). The self-test, `npm run trace`, `npm run explain` and `npm run bench`
 * all play them from here, so they all play the same runs.
 */

/** A pinned run in progress: one tick at a time, until it's over. */
export interface Run {
  readonly sim: KernelSimulation;
  /** Plays one tick and returns its events (the simulation's array: copy what you keep). */
  step(): readonly SimEvent[];
  readonly over: boolean;
}

export interface PinnedRun {
  readonly name: PinnedRunName;
  /** The lane whose bench this run is part of ('game' for the valley's plays). */
  readonly lane: LayerName;
  /** Starts the run. A play can be given its valley, already generated. */
  start(world?: World): Run;
}

/** 60 s of a bot in a valley. */
function play(name: keyof typeof GOLDEN.play): PinnedRun {
  const [seed, bot] = name.split(' ') as [string, 'wander' | 'chaos'];
  return {
    name,
    lane: 'game',
    start(world = generateWorld(missionSpec(seed), defaultTuning)): Run {
      const sim = new Simulation(world, defaultTuning);
      const player = bot === 'wander' ? new WanderBot(world.seed) : new ChaosBot(world.seed);
      const raw = neutralInput();
      const ticks = Math.round(60 * defaultTuning.sim.tickHz);
      return {
        sim,
        step: () => sim.step(player.next(sim, raw)),
        get over() {
          return sim.tick >= ticks;
        },
      };
    },
  };
}

/** A scene, run by its own driver for its own length. */
function scene(name: keyof typeof GOLDEN.scenes, lane: LayerName, make: () => KernelScene): PinnedRun {
  return {
    name,
    lane,
    start(): Run {
      const sc = make();
      const sim = startScene(sc, defaultTuning);
      const driver = sc.driver?.();
      const raw = sc.game.still(sim);
      const ticks = sceneTicks(sc, defaultTuning);
      return {
        sim,
        step: () => sim.step(driver ? driver.next(sim, raw) : raw),
        get over() {
          return sceneOver(sc, sim, ticks);
        },
      };
    },
  };
}

export const PINNED_RUNS: readonly PinnedRun[] = [
  play('TAL-4471 wander'),
  play('MUD-9031 wander'),
  play('TAL-4471 chaos'),
  scene('movement-course', 'body', SCENES['movement-course']!),
  scene('perception-lab', 'perception', SCENES['perception-lab']!),
  scene('perception-crowd', 'perception', SCENES['perception-crowd']!),
  scene('spawn-tick', 'kernel', SCENES['spawn-tick']!),
  scene('kernel-alone', 'kernel', kernelAloneScene),
];

export function pinnedRun(name: string): PinnedRun {
  const run = PINNED_RUNS.find((r) => r.name === name);
  if (!run) throw new Error(`No pinned run '${name}'; there are ${PINNED_RUNS.map((r) => `'${r.name}'`).join(', ')}`);
  return run;
}

/** Both fingerprints of a pinned run, played through. */
export function runFingerprint(run: PinnedRun, world?: World): { behaviour: string; state: string } {
  const r = run.start(world);
  const h = new Hasher();
  while (!r.over) behaviourInto(h, r.sim, r.step());
  return { behaviour: h.digest(), state: r.sim.hash() };
}

const order: number[] = [];

/**
 * One tick of observable behaviour: every body's pose (in a run of Sightline: the
 * player's, then each guard's), every solid shape, then every entity's events in order.
 */
export function behaviourInto(h: Hasher, sim: KernelSimulation, events: readonly SimEvent[]): void {
  h.u32(sim.tick);
  if (sim instanceof Simulation) {
    const p = sim.player;
    h.f64(p.x).f64(p.y).f64(p.z).f64(p.yaw).f64(p.pitch).f64(p.eyeHeight).f64(p.speed).str(p.stance).str(p.gait);
    for (const g of sim.guards) {
      const b = g.body;
      h.u32(g.id).f64(b.x).f64(b.y).f64(b.z).f64(b.yaw).f64(g.guard.headYaw).f64(b.speed).str(b.stance).str(b.gait);
    }
  }
  // Solid things where they are (only when there are any, so runs without them keep their values).
  if (sim.solids.count > 0) {
    h.u32(sim.solids.count);
    for (const c of sim.solids.shapes) {
      h.u32(c.id).f64(c.x).f64(c.z).f64(c.y0).f64(c.y1).u32(c.flags);
      if (c.kind === 'box') h.f64(c.ux).f64(c.uz).f64(c.hx).f64(c.hz);
      else h.f64(c.r);
    }
  }
  // Events grouped by source, keeping each source's own order: which entity acted first
  // within a tick is a detail of how systems are scheduled, not behaviour. Every field
  // the registry stores is covered, so a new event type is covered too.
  order.length = 0;
  for (let k = 0; k < events.length; k++) order.push(k);
  order.sort((a, b) => events[a]!.source - events[b]!.source || a - b);
  h.u32(events.length);
  for (const k of order) {
    const e = events[k]!;
    h.str(e.type).u32(e.id).u32(e.tick).f64(e.t).f64(e.source).u32(e.cause);
    const fields = EVENTS[e.type].fields as Readonly<Record<string, FieldCodec>>;
    const values = e as unknown as Readonly<Record<string, number | string>>;
    for (const name in fields) {
      const v = values[name]!;
      if (typeof v === 'string') h.str(v);
      else h.f64(v);
    }
  }
}
