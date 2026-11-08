import type { Tuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, type GuardSpawn, type Routine } from '../../generation';
import { datan2 } from '../../kernel/core/detmath';
import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface } from '../../kernel/world/surfaces';
import type { World } from '../../kernel/world/world';
import { PERCEPTION, giveSenses } from '../perception';
import { placePlayer } from '../setup';
import { SIGHTLINE, type Simulation } from '../sim';
import type { Scene } from '.';

/**
 * The noise scenario (C8): one guard with his back turned and the player on open ground
 * of one surface, set up to measure one combination of what decides whether a footstep is
 * heard: the surface, the gait, the distance, and a generator's hum masking it near him.
 * "Walking on gravel 12 m away: he hears it" is
 *
 *   surface=gravel&gait=walk&d=12&expect=heard
 *
 * A scenario is a scene with parameters, as the sight scenario is (scenes/sightScenario.ts).
 *
 * Parameters (defaults in brackets):
 *   surface  what's underfoot: grass, dirt, gravel, rock, water, metal or wood   [dirt]
 *   gait     crawl, crouch, walk or sprint; it sets the stance                   [walk]
 *   d        metres from the guard, along the ground                             [10]
 *   mask     how near a running generator stands to him: 0 none, 1 at 5 m, 2 at 2.5 m  [0]
 *   secs     how long it runs                                                    [8]
 *   expect   'heard', 'never' within the run, or nothing                         [none]
 *
 * The player keeps the distance by moving along an arc about the guard, on the side away
 * from the generator: facing him and side-stepping, or, sprinting, running along it. So
 * every step comes from the same distance, and an honest view holds him in sight.
 */

export const NOISE_SURFACES = ['grass', 'dirt', 'rock', 'gravel', 'wood', 'water', 'metal'] as const;
export type NoiseSurface = (typeof NOISE_SURFACES)[number];
export const NOISE_GAITS = ['crawl', 'crouch', 'walk', 'sprint'] as const;
export type NoiseGait = (typeof NOISE_GAITS)[number];

export interface NoiseParams {
  surface: NoiseSurface;
  gait: NoiseGait;
  d: number;
  mask: 0 | 1 | 2;
  secs: number;
  /** Whether he hears it within the run, or null for no expectation. */
  expect: 'heard' | 'never' | null;
}

/** How far from the guard the generator stands at each `mask` (0: there is none), metres. */
export const MASK_DISTANCE: readonly number[] = [0, 5, 2.5];

const DEFAULTS: NoiseParams = { surface: 'dirt', gait: 'walk', d: 10, mask: 0, secs: 8, expect: null };

/** Reads a scenario's parameters, refusing anything it doesn't know. */
export function parseNoise(text: string | undefined): NoiseParams {
  const p: NoiseParams = { ...DEFAULTS };
  if (!text) return p;
  const one = <T extends string>(key: string, v: string, allowed: readonly T[]): T => {
    if (!(allowed as readonly string[]).includes(v)) throw new Error(`Noise scenario: ${key} must be ${allowed.join(', ')}; got '${v}'`);
    return v as T;
  };
  const num = (key: string, v: string, lo: number, hi: number): number => {
    const x = Number(v);
    if (v === '' || !Number.isFinite(x) || x < lo || x > hi) throw new Error(`Noise scenario: ${key} must be a number from ${lo} to ${hi}; got '${v}'`);
    return x;
  };
  for (const part of text.split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    const key = at < 0 ? part : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    if (key === 'surface') p.surface = one(key, v, NOISE_SURFACES);
    else if (key === 'gait') p.gait = one(key, v, NOISE_GAITS);
    else if (key === 'd') p.d = num(key, v, 1.5, 50);
    else if (key === 'mask') p.mask = num(key, v, 0, 2) as 0 | 1 | 2;
    else if (key === 'secs') p.secs = num(key, v, 1, 120);
    else if (key === 'expect') p.expect = one(key, v, ['heard', 'never'] as const);
    else throw new Error(`Noise scenario: no parameter '${key}'`);
  }
  return p;
}

/** The canonical form of a scenario's parameters: every key, in a fixed order. */
export function formatNoise(p: NoiseParams): string {
  return `surface=${p.surface}&gait=${p.gait}&d=${p.d}&mask=${p.mask}&secs=${p.secs}${p.expect === null ? '' : `&expect=${p.expect}`}`;
}

const SURFACE: Readonly<Record<NoiseSurface, Surface>> = { grass: Surface.Grass, dirt: Surface.Dirt, gravel: Surface.Gravel, rock: Surface.Rock, water: Surface.Water, metal: Surface.Metal, wood: Surface.Wood };

/** The guard's post: everything else is placed about it. */
const GUARD = { x: 0, z: 0 };

const worlds = new WeakMap<Tuning, Map<string, World>>();

/** One flat field of the scenario's surface, with the guard and any generator: built once per surface and masking. */
function noiseWorld(p: NoiseParams, tuning: Tuning): World {
  let byKey = worlds.get(tuning);
  if (!byKey) worlds.set(tuning, (byKey = new Map()));
  const key = `${p.surface}:${p.mask}`;
  let world = byKey.get(key);
  if (world) return world;
  const colliders: ColliderInput[] = [];
  const structures: { kind: 'generator'; colliders: number[] }[] = [];
  if (p.mask > 0) {
    // Beyond him from the side the player keeps to: his back is to the player, his face to it.
    const G = MASK_DISTANCE[p.mask]!;
    colliders.push({ kind: 'box', x: GUARD.x - G, z: GUARD.z, y0: -0.3, y1: 1.5, hx: 0.6, hz: 1.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Metal });
    structures.push({ kind: 'generator', colliders: [0] });
  }
  const post: GuardSpawn = { id: 0, role: 'sentry', x: GUARD.x, y: 0, z: GUARD.z, faceX: -1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0, routine: null as unknown as Routine };
  post.routine = buildRoutine(post, tuning.gen.routines, new Rng('noise', 'routines').fork('guard0'));
  world = buildWorld({ name: `noise-${key}`, size: 130, cell: 2, surface: SURFACE[p.surface], colliders, spawn: { x: 20, z: 0, faceX: -1, faceZ: 0 }, camp: { structures, guards: [post], fenceHalf: 0 } }, tuning.gen);
  byKey.set(key, world);
  return world;
}

/** Keeps the player on an arc about the guard, at the scenario's distance, in the scenario's gait. */
class ArcDriver {
  /** Which way along the arc: 1 toward the north side of the east start, -1 back. */
  private leg = 1;

  constructor(private readonly p: NoiseParams) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    const b = sim.player;
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.pitch = 0;
    const dx = b.x - GUARD.x;
    const dz = b.z - GUARD.z;
    const r = Math.max(1e-6, Math.sqrt(dx * dx + dz * dz));
    const bearing = datan2(dz, dx);
    // No further round him than a quarter turn, nor than 16 m of arc: the generator's side stays clear.
    const limit = Math.min(Math.PI / 2, 16 / this.p.d);
    if (bearing > limit) this.leg = 1;
    else if (bearing < -limit) this.leg = -1;
    const nx = dx / r;
    const nz = dz / r;
    if (this.p.gait === 'sprint') {
      // Running along the arc, leaning in or out as it strays.
      const w = Math.max(-0.5, Math.min(0.5, (r - this.p.d) * 0.5));
      const tx = this.leg * nz - w * nx;
      const tz = -this.leg * nx - w * nz;
      out.yaw = datan2(-tx, -tz);
      out.moveZ = 1;
      out.sprint = true;
      return out;
    }
    // Facing him and stepping sideways, closing what the arc lets slip.
    out.yaw = datan2(nx, nz);
    out.moveX = this.leg;
    out.moveZ = Math.max(-0.4, Math.min(0.4, (r - this.p.d) * 2));
    return out;
  }
}

/** The stance a gait is taken in. */
function stanceOf(gait: NoiseGait): 'prone' | 'crouch' | 'stand' {
  return gait === 'crawl' ? 'prone' : gait === 'crouch' ? 'crouch' : 'stand';
}

/** The noise scenario, from its parameters. */
export function noiseScenario(params?: string): Scene {
  const p = parseNoise(params);
  const canonical = formatNoise(p);
  let heardAt = -1;
  return {
    name: 'noise',
    version: 1,
    params: canonical,
    title: `Noise · ${p.gait} on ${p.surface}, ${p.d} m${p.mask ? `, generator at ${MASK_DISTANCE[p.mask]} m` : ''}`,
    description: `One sentry with his back turned, the player moving at a ${p.gait} on ${p.surface} ${p.d} m away${p.mask ? `, a generator running ${MASK_DISTANCE[p.mask]} m from him` : ''}${p.expect === null ? '' : p.expect === 'heard' ? ': he hears it' : ': he never hears it'}.`,
    game: SIGHTLINE,
    world: (tuning) => noiseWorld(p, tuning),
    systems: PERCEPTION,
    setup: (sim) => {
      heardAt = -1;
      placePlayer(sim, GUARD.x + p.d, GUARD.z, -1, 0);
      const b = sim.player;
      const spec = sim.tuning.bodies.player;
      const stance = stanceOf(p.gait);
      // Already in the stance, as if the run began mid-stride.
      b.stance = stance;
      b.eyeHeight = spec.eyeHeight[stance];
      b.eyeFrom = b.eyeHeight;
      if (stance === 'prone') {
        b.lying = 1;
        b.axis = b.yaw;
      }
      for (const h of b.history) {
        h.eyeHeight = b.eyeHeight;
        h.lying = b.lying;
        h.axis = b.axis;
      }
      giveSenses(sim);
    },
    driver: () => new ArcDriver(p),
    seconds: p.secs,
    expect: [
      {
        name: p.expect === null ? 'it runs' : p.expect === 'never' ? 'he never hears the player' : 'he hears the player',
        during: (sim, events) => {
          for (const e of events) {
            if (e.type !== 'heard') continue;
            if (heardAt < 0) heardAt = e.t;
            if (p.expect === 'never') return `heard at ${e.t.toFixed(2)} s, clarity ${e.clarity.toFixed(2)}, with ${sim.player.gait} steps`;
          }
        },
        after: () => {
          if (p.expect === 'heard' && heardAt < 0) return `never heard in ${p.secs} s`;
        },
      },
    ],
  };
}

/** The scenario table (C8): each gait on a surface either side of the edge of hearing, and the generator's masking. */
export const NOISE_TABLE: readonly string[] = [
  // Walking on grass carries 10.2 m; on metal, 16.8 m.
  'surface=grass&gait=walk&d=9&expect=heard',
  'surface=grass&gait=walk&d=11.5&expect=never',
  'surface=metal&gait=walk&d=15.5&expect=heard',
  'surface=metal&gait=walk&d=18&expect=never',
  // Crouch-walking on dirt, 7.2 m; crawling on metal, 5 m; sprinting on gravel, 20.7 m.
  'surface=dirt&gait=crouch&d=6&expect=heard',
  'surface=dirt&gait=crouch&d=8.5&expect=never',
  'surface=metal&gait=crawl&d=4&expect=heard',
  'surface=metal&gait=crawl&d=6&expect=never',
  'surface=gravel&gait=sprint&d=19&expect=heard',
  'surface=gravel&gait=sprint&d=22.5&expect=never',
  // A generator 5 m from him halves how far a walk on dirt carries; at 2.5 m, a quarter.
  'surface=dirt&gait=walk&d=5&mask=1&expect=heard',
  'surface=dirt&gait=walk&d=7&mask=1&expect=never',
  'surface=dirt&gait=walk&d=2.5&mask=2&expect=heard',
  'surface=dirt&gait=walk&d=4&mask=2&expect=never',
];
