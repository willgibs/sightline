import { buildWorld } from '../../generation';
import type { SimEvent } from '../../kernel/events';
import { decide, type System } from '../../kernel/systems';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface, surfaceName } from '../../kernel/world/surfaces';
import { WaypointDriver, type Waypoint } from '../bots/waypoints';
import { player } from '../entities';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * The movement course: one lane, west to east, through everything the body has to
 * handle. Stairs and a 1 m drop; a 30° ramp up and a 40° ramp down; a ceiling that
 * needs a crouch and a crawl space that needs prone; stairs up to a 2 m drop; then
 * gravel, metal, wood and water underfoot. A regression test now (a scripted walker
 * must get through, crouching, crawling and landing where it should), and lab C's arena
 * later.
 */

const TAN30 = 0.5773502691896257;
const TAN40 = 0.8390996311772799;
const RAMP_TOP = 6 * TAN30; // 3.46 m

/** Where everything is, along the lane (x, metres). */
export const COURSE = {
  start: -52,
  stairs: -46, // four steps of 0.25 m, 1 m deep, to a platform at 1 m
  drop1: -39, // the platform's east edge: a 1 m drop
  rampUp: [-30, -24] as const,
  rampDown: [-20, -20 + RAMP_TOP / TAN40] as const,
  ceiling: [-10, -4] as const, // underside 1.3 m: crouch
  crawl: [0, 6] as const, // underside 0.6 m: prone
  stairs2: 12, // eight steps of 0.25 m, 0.75 m deep, to a platform at 2 m
  drop2: 21, // its east edge: a 2 m drop
  underfoot: [28, 32, 36, 40, 44] as const, // gravel, metal, wood, water from each mark, grass again after
  finish: 48,
};

function height(x: number): number {
  const [u0, u1] = COURSE.rampUp;
  const [d0, d1] = COURSE.rampDown;
  if (x <= u0) return 0;
  if (x <= u1) return (x - u0) * TAN30;
  if (x <= d0) return RAMP_TOP;
  if (x <= d1) return RAMP_TOP - (x - d0) * TAN40;
  return 0;
}

function surface(x: number): Surface {
  const [g, m, w, wa, end] = COURSE.underfoot;
  if (x >= COURSE.crawl[0] && x < COURSE.crawl[1]) return Surface.Dirt;
  if (x < g || x >= end) return Surface.Grass;
  if (x < m) return Surface.Gravel;
  if (x < w) return Surface.Metal;
  if (x < wa) return Surface.Wood;
  return Surface.Water;
}

const block = (x0: number, x1: number, y0: number, y1: number, halfWidth: number, surface: Surface): ColliderInput => ({
  kind: 'box',
  x: (x0 + x1) / 2,
  z: 0,
  y0,
  y1,
  hx: (x1 - x0) / 2,
  hz: halfWidth,
  ux: 1,
  uz: 0,
  flags: Blocks.All,
  surface,
});

function colliders(): ColliderInput[] {
  const out: ColliderInput[] = [];
  // Stairs to a platform at 1 m, ending at the first drop.
  for (let k = 0; k < 4; k++) out.push(block(COURSE.stairs + k, COURSE.stairs + k + 1, -1, 0.25 * (k + 1), 2, Surface.Wood));
  out.push(block(COURSE.stairs + 4, COURSE.drop1, -1, 1, 2, Surface.Wood));
  // A ceiling to crouch under, and a crawl space to go prone in.
  out.push(block(COURSE.ceiling[0], COURSE.ceiling[1], 1.3, 1.5, 2.5, Surface.Wood));
  out.push(block(COURSE.crawl[0], COURSE.crawl[1], 0.6, 0.8, 2.5, Surface.Wood));
  // Stairs to a platform at 2 m, ending at the second drop.
  for (let k = 0; k < 8; k++) out.push(block(COURSE.stairs2 + 0.75 * k, COURSE.stairs2 + 0.75 * (k + 1), -1, 0.25 * (k + 1), 2, Surface.Metal));
  out.push(block(COURSE.stairs2 + 6, COURSE.drop2, -1, 2, 2, Surface.Metal));
  return out;
}

const ROUTE: Waypoint[] = [
  { x: COURSE.drop1 + 2, z: 0, stance: 'stand' }, // over the stairs and off the platform
  { x: COURSE.ceiling[0] - 1.5, z: 0, stance: 'stand' }, // over the ramps
  { x: COURSE.ceiling[1] + 1, z: 0, stance: 'crouch' }, // under the ceiling
  { x: COURSE.crawl[0] - 1, z: 0, stance: 'crouch' },
  { x: COURSE.crawl[1] + 1, z: 0, stance: 'prone' }, // through the crawl space
  { x: COURSE.drop2 + 2.5, z: 0, stance: 'stand' }, // up the stairs and off the 2 m drop
  { x: COURSE.finish + 1, z: 0, stance: 'stand' }, // across the surfaces
];

/** Every footstep's surface, and the landings: what the expectations look at. */
function fresh(): { stepped: Set<string>; landings: number[]; crouchedUnder: boolean; proneIn: boolean } {
  return { stepped: new Set(), landings: [], crouchedUnder: true, proneIn: true };
}

/** The course's rules: reaching the far end is a success. */
const rules: System = {
  name: 'course-rules',
  phase: 'mission',
  reads: ['player.body'],
  writes: ['outcome'],
  emits: ['outcome'],
  run(ctx) {
    const p = player(ctx.index);
    if (p.body.x >= COURSE.finish) decide(ctx, 'succeeded', 'reached the end of the course', p.id);
  },
};

export function movementCourse(): Scene {
  let seen = fresh();
  return {
    name: 'movement-course',
    version: 2, // 2: rules decide the run
    title: 'Movement course',
    game: SIGHTLINE,
    description: 'Stairs, drops, ramps, a low ceiling, a crawl space and six surfaces, west to east. Reach the far end.',
    world: (tuning) =>
      buildWorld(
        {
          name: 'movement-course',
          size: 130,
          cell: 0.5,
          height: (x) => height(x),
          surface: (x) => surface(x),
          colliders: colliders(),
          spawn: { x: COURSE.start, z: 0, faceX: 1, faceZ: 0 },
        },
        tuning.gen,
      ),
    setup: () => {
      seen = fresh();
    },
    systems: [rules],
    driver: () => new WaypointDriver(ROUTE),
    seconds: 90,
    expect: [
      {
        name: 'the walker reaches the far end, and the rules call it a success',
        after: (sim) => {
          const o = sim.state.outcome;
          if (o.status !== 'succeeded') return `stopped at x ${sim.player.x.toFixed(2)}, z ${sim.player.z.toFixed(2)}; the outcome is ${o.status}`;
        },
      },
      {
        name: 'it is crouched under the ceiling and prone in the crawl space',
        during: (sim) => {
          const p = sim.player;
          const inside = (span: readonly [number, number]): boolean => p.x > span[0] + 0.3 && p.x < span[1] - 0.3;
          if (inside(COURSE.ceiling) && p.stance === 'stand') return 'standing under the 1.3 m ceiling';
          if (inside(COURSE.crawl) && p.stance !== 'prone') return `${p.stance} in the 0.6 m crawl space`;
        },
      },
      {
        name: 'both drops land audibly, the higher one harder',
        during: (_sim, events) => {
          for (const e of events) if (e.type === 'land') seen.landings.push(e.speed);
        },
        after: (sim) => {
          // Free fall from h lands at √(2gh): 4.4 m/s from 1 m, 6.3 m/s from 2 m.
          const [a, b] = seen.landings;
          if (seen.landings.length !== 2) return `${seen.landings.length} landings (${seen.landings.map((s) => s.toFixed(2)).join(', ')})`;
          const g = sim.tuning.sim.gravity;
          if (Math.abs(a! - Math.sqrt(2 * g)) > 0.01 || Math.abs(b! - Math.sqrt(4 * g)) > 0.01) return `landed at ${a!.toFixed(3)} and ${b!.toFixed(3)} m/s`;
        },
      },
      {
        name: 'every surface on the course is stepped on and heard as itself',
        during: (sim, events: readonly SimEvent[]) => {
          for (const e of events) {
            if (e.type !== 'footstep' || e.source !== sim.playerId) continue;
            seen.stepped.add(surfaceName(e.surface));
            const expected = sim.tuning.noise.radiusPerUnit * e.loudness;
            if (Math.abs(e.radius - expected) > 1e-6) return `a step on ${surfaceName(e.surface)} heard at ${e.radius} m, not ${expected}`;
          }
        },
        after: () => {
          const missing = ['grass', 'wood', 'dirt', 'metal', 'gravel', 'water'].filter((s) => !seen.stepped.has(s));
          if (missing.length) return `never stepped on ${missing.join(', ')}`;
        },
      },
    ],
  };
}

