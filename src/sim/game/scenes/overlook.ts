import { analyzeCamp, buildRaster, campMission, defaultCampSpec, generateWorld, SECTORS, writtenShots, type WrittenShots } from '../../generation';
import { neutralInput } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import type { World } from '../../kernel/world/world';
import { OverlookShooter, TimedShooter } from '../bots/overlook';
import { commanderOf } from '../comms';
import { placePlayer } from '../setup';
import type { Simulation } from '../sim';
import type { Scene } from '.';
import { liveCamp } from './liveCamp';

/**
 * "One overlook doesn't clear the camp" (E12), from both sides, on any generated camp:
 *
 *   plan=clear   a perfect shooter on the camp's best overview, who never moves and takes
 *                everyone he can see, the target last. The camp's answer must stop him: at
 *                the end, someone is still standing.
 *   plan=timed   a shooter on the perch the camp's analysis certifies, who waits for a
 *                moment when the target's head is in a clear line and nobody is watching
 *                him, and takes that one shot. He must get the target.
 *
 * Both run with the whole camp brain awake (scenes/liveCamp.ts).
 */

export type OverlookPlan = 'clear' | 'timed';

export interface OverlookParams {
  seed: string;
  plan: OverlookPlan;
  /** Seconds between the clearing shooter's shots: perfect aim at a person's pace by default, 1.5 for as fast as the bolt allows. */
  pace: number;
}

export function parseOverlook(text: string | undefined): OverlookParams {
  const p: OverlookParams = { seed: 'LEB-2534', plan: 'clear', pace: 5 };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'plan' && (value === 'clear' || value === 'timed')) p.plan = value;
    else if (key === 'pace' && Number.isFinite(Number(value)) && Number(value) > 0) p.pace = Number(value);
    else throw new Error(`An overlook scenario doesn't know '${part}'`);
  }
  return p;
}

/** The camp's best overview: the perch that sees the most guard time. */
export function bestOverview(world: World): { x: number; z: number } {
  return [...world.report.camp!.perches].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z)[0]!; // the coordinates break a tie
}

/** The cleanest certified shot at the target, on this camp, from any perch: where, and when in the cycle. */
export function timedShot(world: World, tuning: Parameters<Scene['world']>[0]): { shots: WrittenShots; x: number; z: number; dt: number; unwatched: boolean[] } | null {
  const G = tuning.gen;
  const raster = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, G.analysis.cell, G.analysis.margin);
  const { analysis, parts } = analyzeCamp(world.camp, world.terrain, world.colliders, world.grid, G, raster);
  // The cleanest kind of shot the camp allows: nobody watching, or else a witness dropped in time, or one distracted.
  const certified = (split: 'window' | 'chain' | 'distraction'): WrittenShots | null => {
    let found: WrittenShots | null = null;
    for (const sector of SECTORS) {
      for (const band of ['near', 'far']) {
        const s = writtenShots({ opening: `${sector} ${band}`, first: 'target', split, tool: 'rifle window' }, world.camp, analysis, parts, G);
        if (s && (!found || s.risk < found.risk)) found = s;
      }
    }
    return found;
  };
  const best = certified('window') ?? certified('chain') ?? certified('distraction');
  if (!best) return null;
  const perch = analysis.perches[best.perch]!;
  const target = world.camp.objective!.target;
  const K = parts.witnesses.samples;
  const unwatched: boolean[] = [];
  for (let k = 0; k < K; k++) unwatched.push((parts.lines.masks[target * K + k]! & ~(1 << target)) === 0);
  return { shots: best, x: perch.x, z: perch.z, dt: analysis.dt, unwatched };
}

export function overlook(params?: string): Scene {
  const p = parseOverlook(params);
  const base = liveCamp(`seed=${p.seed}&difficulty=${defaultCampSpec().difficulty}`);
  let world: World | null = null;
  let plan: ReturnType<typeof timedShot> = null;
  const build = (tuning: Parameters<Scene['world']>[0]): World => {
    world = generateWorld(campMission(p.seed), tuning);
    if (p.plan === 'timed') plan = timedShot(world, tuning);
    return world;
  };
  return {
    ...base,
    name: 'overlook',
    params: `seed=${p.seed}&plan=${p.plan}&pace=${p.pace}`,
    title: p.plan === 'clear' ? `One overlook, one shooter (${p.seed})` : `A timed shot at the target (${p.seed})`,
    description:
      p.plan === 'clear'
        ? 'A perfect shooter on the camp\'s best overview, who never moves, takes everyone he can see. The camp should stop him before he clears it.'
        : 'A shooter on a certified perch waits for the moment the target is in view and nobody is watching.',
    world: build,
    setup: (sim) => {
      base.setup!(sim);
      const at = p.plan === 'clear' ? bestOverview(world!) : plan;
      if (!at) return;
      const site = world!.camp.site;
      placePlayer(sim, at.x, at.z, site.x - at.x, site.z - at.z);
    },
    driver: (): Driver<Simulation> => {
      if (p.plan === 'clear') return new OverlookShooter(p.pace);
      if (!plan) return { next: (sim, out) => Object.assign(out, neutralInput(sim.player.yaw)) };
      return new TimedShooter(world!.camp.objective!.target, plan.unwatched, plan.dt);
    },
    seconds: p.plan === 'clear' ? 180 : 320,
    playOn: p.plan === 'clear',
    // What must hold on every camp. How often each side wins is the bench's to pin (benches.ts, lane brain).
    expect:
      p.plan === 'clear'
        ? [
            {
              name: 'the camp answers: when it is over, it is not calm',
              after: (sim) => (commanderOf(sim)!.camp.level === 'calm' ? 'the camp stayed calm' : undefined),
            },
          ]
        : [],
  };
}

export const OVERLOOK_TABLE: readonly string[] = ['LEB-2534', 'KUV-9210', 'HUM-0755'].flatMap((seed) => [`seed=${seed}&plan=clear`, `seed=${seed}&plan=timed`]);
