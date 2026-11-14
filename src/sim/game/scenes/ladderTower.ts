import type { Tuning } from '../../../config/tuning';
import { InvariantWatch, type Ladder } from '../../body';
import { buildRoutine, buildWorld, type GuardSpawn, type Routine } from '../../generation';
import { dcos, dsin } from '../../kernel/core/detmath';
import { Rng } from '../../kernel/core/rng';
import { Faction } from '../../kernel/state';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface } from '../../kernel/world/surfaces';
import type { World } from '../../kernel/world/world';
import { LadderBot } from '../bots/ladderBot';
import type { RemainsEntity } from '../entities';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * A tower with a ladder, drawn from a seed, for the ladder's fuzzing (C5): ground flat,
 * rolling or sloping under it, clutter on the deck and round the foot, sometimes a roof,
 * two guards walking past the foot, and a body lying near it. Its driver is the ladder
 * bot, and the long invariant run plays fresh ones for every valley.
 *
 * The scene holds its run to the motor's promises itself (body/invariants.ts), tick by
 * tick, so a tower the long run broke a promise on is that run again by its name:
 * `npm run scene -- ladder-tower --params seed=RES-2063-3`. The ones found so far are kept
 * in TOWER_FINDS, and run with every other scene.
 */

/**
 * Towers that broke a promise, played as the long invariant run plays one, kept after the
 * default tower.
 *
 * Three are one mistake: a body on the ladder took a pose that was clear, and in the same
 * tick a guard walking under it rose into its feet. A path now moves after everything that
 * walks, and whoever walks is shoved from under feet he would rise into (body/system.ts,
 * motor.ts).
 * - RES-2063-3 (the long run, Nov 12): coming down, as he stepped up onto a box (tick 855);
 * - SWP-1295-0: going up, as he stepped up onto a box (tick 1260);
 * - SWP-1381-1: coming down, as he walked up a slope, by a millimetre (tick 1791).
 *
 * One is a refused move that was lifted. A guard walked up a slope along the side of a box,
 * under a shelf with room for him on the ground and none on the box. When the box's top
 * came within a step of his feet his move onto it was refused, for the shelf, and settling
 * lifted him onto the box where he stood, his head 0.28 m into the shelf. A refused move
 * now keeps its footing (body/motor.ts).
 * - SWP-1085-0: tick 1273.
 *
 * Two are a pose on the ladder a fraction of a micrometre into the underside of a shelf,
 * which the pose check let by and the walking motor didn't. The pose check now takes a
 * slab as overhead by the same comparison as the rest of the motor (body/mantle.ts).
 * - SWP-1424-4: reaching for the rungs, as the ground under the reach rose (tick 98);
 * - RFN-1208-3: climbing (tick 2117).
 */
export const TOWER_FINDS: readonly string[] = ['seed=TOWER-0', 'seed=RES-2063-3', 'seed=SWP-1295-0', 'seed=SWP-1381-1', 'seed=SWP-1085-0', 'seed=SWP-1424-4', 'seed=RFN-1208-3'];

/** How long a tower is played, seconds: the long run's length for one, so whatever it finds on a tower the scene finds too. */
export const TOWER_SECONDS = 240;

const SIDE = 1.5;

function towerWorld(seed: string, tuning: Tuning): World {
  const r = new Rng(seed, 'ladder-tower');
  const kind = r.int(0, 3);
  const a = r.range(0.05, 0.25);
  const f = r.range(0.2, 0.7);
  const p = r.range(0, 6);
  const height = (x: number, z: number): number => (kind === 0 ? 0 : kind === 1 ? a * dsin(x * f + p) * dcos(z * f) : kind === 2 ? 0.15 * x : a * dsin(z * f + p));
  const angle = r.range(0, 2 * Math.PI);
  const ox = dsin(angle);
  const oz = dcos(angle);
  const ux = dcos(angle);
  const uz = -dsin(angle);
  const lx = ox * (SIDE + 0.08);
  const lz = oz * (SIDE + 0.08);
  const ground = height(lx + ox * 0.35, lz + oz * 0.35);
  const y0 = ground + 0.03;
  const y1 = y0 + r.range(2, 7);
  const flags = Blocks.All;
  const surface = Surface.Wood;
  const panel = (at: number, hx: number): ColliderInput => ({ kind: 'box', x: ox * at, z: oz * at, y0: y0 - 2, y1, hx, hz: 0.04, ux, uz, flags, surface });
  const colliders: ColliderInput[] = [{ kind: 'box', x: 0, z: 0, y0: y1 - 0.25, y1, hx: SIDE, hz: SIDE, ux, uz, flags, surface }, panel(1.46, 1.2), panel(1.54, 0.3)];
  const clutter = r.int(0, 8);
  for (let k = 0; k < clutter; k++) {
    const hx = r.range(0.05, 0.5);
    const hz = r.range(0.05, 0.5);
    switch (r.int(0, 3)) {
      case 0: // on the deck
        colliders.push({ kind: 'box', x: r.range(-1.4, 1.4), z: r.range(-1.4, 1.4), y0: y1, y1: y1 + r.range(0.1, 1), hx, hz, ux: 1, uz: 0, flags, surface });
        break;
      case 1: // a roof, low or not
        colliders.push({ kind: 'box', x: 0, z: 0, y0: y1 + r.range(1.3, 2.2), y1: y1 + 2.4, hx: 1.6, hz: 1.6, ux, uz, flags, surface });
        break;
      case 2: {
        // round the foot
        const d = r.range(1.8, 3.2);
        const s = r.range(-1, 1);
        colliders.push({ kind: 'box', x: ox * d + ux * s, z: oz * d + uz * s, y0: ground - 0.5, y1: ground + r.range(0.1, 2), hx, hz, ux: 1, uz: 0, flags, surface });
        break;
      }
      default: {
        // across the shaft
        const h = r.range(y0 + 1, y1 - 0.2);
        colliders.push({ kind: 'box', x: ox * r.range(1.7, 2.3), z: oz * r.range(1.7, 2.3), y0: h, y1: h + 0.15, hx: r.range(0.05, 0.7), hz: r.range(0.05, 0.7), ux: 1, uz: 0, flags, surface });
      }
    }
  }
  const guards: GuardSpawn[] = [];
  for (let k = 0; k < 2; k++) {
    const d0 = r.range(1.9, 4);
    const d1 = r.range(1.9, 4);
    const s0 = r.range(-2.5, 2.5);
    const s1 = r.range(-2.5, 2.5);
    const x0 = ox * d0 + ux * s0;
    const z0 = oz * d0 + uz * s0;
    const g: GuardSpawn = { id: k, role: 'patrol', x: x0, y: height(x0, z0), z: z0, faceX: 1, faceZ: 0, elevated: false, route: [{ x: x0, z: z0 }, { x: ox * d1 + ux * s1, z: oz * d1 + uz * s1 }], routeStart: 1, scanPhase: 0, scanScale: 1, routine: null as unknown as Routine };
    g.routine = buildRoutine(g, tuning.gen.routines, new Rng(seed, 'routines').fork(`guard${k}`));
    guards.push(g);
  }
  const world = buildWorld({ name: `ladder-tower-${seed}`, size: 40, cell: 0.5, height, colliders, spawn: { x: ox * 3.2, z: oz * 3.2, faceX: -ox, faceZ: -oz }, camp: { structures: [], guards, fenceHalf: 0 } }, tuning.gen);
  const ladder: Ladder = { x: lx, z: lz, y0, y1, ox, oz };
  world.ladders = [ladder];
  return world;
}

/** A ladder tower, from its parameters: `seed=<any word>`. */
export function ladderTower(params?: string): Scene {
  const seed = params?.startsWith('seed=') ? params.slice(5) : 'TOWER-0';
  let took = false;
  let watch: InvariantWatch | null = null;
  return {
    name: 'ladder-tower',
    version: 1,
    params: `seed=${seed}`,
    title: `A ladder tower · ${seed}`,
    description: 'A tower with a ladder, clutter and guards at its foot, and a bot making trouble on it.',
    game: SIGHTLINE,
    world: (tuning) => towerWorld(seed, tuning),
    setup: (sim) => {
      took = false;
      const l = sim.world.ladders![0]!;
      const x = l.x + l.ox * 1.6;
      const z = l.z + l.oz * 1.6;
      sim.spawn((id): RemainsEntity => ({ id, kind: 'remains', faction: Faction.Camp, remains: { of: 0, post: -1, x, y: sim.world.terrain.heightAt(x, z), z, yaw: 0, eye: sim.tuning.bodies.guard.eyeHeight.stand, vx: 0, vz: 0, fell: -5, part: 'torso', carriedBy: 0, hidden: false } }));
      // Where every body starts the first tick. It only reads the state.
      watch = new InvariantWatch(sim);
      watch.beforeTick();
    },
    // The long invariant run's bot for this tower, by the name that run gives it (headless/fuzz.ts).
    driver: () => new LadderBot(`tower:${seed}`),
    seconds: TOWER_SECONDS,
    expect: [
      {
        name: 'it takes the ladder',
        during: (sim) => {
          if (sim.player.motor === 'ladder') took = true;
        },
        after: () => (took ? undefined : 'it never got onto the ladder'),
      },
      {
        name: 'every body keeps the motor\'s promises',
        during: () => {
          const w = watch!;
          w.afterTick();
          // Nothing touches the state between one tick's end and the next one's start, so where each body starts the next is noted here.
          w.beforeTick();
          return w.report.first ? `entity ${w.report.first.entity} ${w.report.first.what}` : undefined;
        },
      },
    ],
  };
}
