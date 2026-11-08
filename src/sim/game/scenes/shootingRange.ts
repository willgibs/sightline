import type { GenTuning } from '../../../config/tuning';
import { buildRoutine, buildWorld, type GuardSpawn, type Routine } from '../../generation';
import { dsin } from '../../kernel/core/detmath';
import { smoothstep } from '../../kernel/core/math';
import { Rng } from '../../kernel/core/rng';
import { defaultEnv } from '../../kernel/env';
import type { SimEvent } from '../../kernel/events';
import { decide, type System } from '../../kernel/systems';
import { Blocks, type ColliderInput } from '../../kernel/world/colliders';
import { Surface } from '../../kernel/world/surfaces';
import { MarksmanDriver, type Step } from '../bots/marksman';
import { player } from '../entities';
import { placePlayer } from '../setup';
import { arm } from '../shooting';
import { SIGHTLINE } from '../sim';
import type { Scene } from '.';

/**
 * The shooting range (lab B): a firing point on a low mound with three rests (the ground
 * for a bipod, sandbags to kneel at, a wall to stand at), and a valley floor running
 * north to a dirt berm, with guards at 100–500 m: walkers crossing every lane, sentries
 * standing, and steel plates that ring when hit. Flags on poles along the east side
 * stream in a steady 4 m/s wind from the west, a full-value crosswind for every lane.
 * The air is at sea level, so the loads fly as published.
 *
 * Played in the browser at `?scene=shooting-range`, it is the owner's sitting for taste
 * call 3: 15 rounds, and the 300 m walker the exit test is about. Headless, a marksman
 * who makes every decision (prone, rested, breath held, ranged, held, led) shoots the
 * walkers, a sentry and a plate, and a miss on purpose, and its expectations hold the
 * chain from the click to the body on the ground.
 */

const NAME = 'shooting-range';

/** Where everything is: the firing point, and the lanes north of it (distance → z). */
export const RANGE = {
  /** The firing point: the player starts here, facing north. */
  firing: { x: 0, z: 251 },
  /** The rests at the firing line: sandbags to the east, a wall to the west. */
  sandbags: { x: 2.4, z: 250.35, top: 0.85 },
  wall: { x: -2.4, z: 250.35, top: 1.42 },
  /** The line the distances are measured from. */
  line: 250,
  plates: { x: -22, distances: [100, 200, 300, 400, 500] as const },
  flags: { x: 45, distances: [100, 200, 300, 400] as const },
  /** The mound's height above the floor. */
  mound: 2,
  wind: { speed: 4, fromDeg: 270 },
};

/** The guards: walkers across the lanes and sentries, by distance. */
const TARGETS: ReadonlyArray<{ d: number; x: number; walk?: number; face?: 'west' | 'east' | 'south'; start?: number }> = [
  { d: 100, x: -30, walk: 60 },
  { d: 200, x: 12, face: 'west' },
  { d: 300, x: -40, walk: 80 },
  { d: 306, x: 40, walk: -80, start: 1 },
  { d: 300, x: -18, face: 'south' },
  { d: 400, x: -35, walk: 70 },
  { d: 500, x: 8, face: 'east' },
  { d: 506, x: -30, walk: 60 },
];

/** The camp post (world.camp.guards index) of the first 300 m walker: the exit test's shot. */
export const WALKER_300 = 2;

const zOf = (d: number): number => RANGE.line - d;

/** The ground: a floor rising gently north, the mound, the berm, low hills at either side. */
export function rangeHeight(x: number, z: number): number {
  const floor = Math.max(0, RANGE.line - z) * 0.012 + 0.25 * dsin(x / 37) * dsin(z / 53);
  const dx = x - RANGE.firing.x;
  const dz = z - RANGE.line;
  const r = Math.sqrt(dx * dx + dz * dz);
  const mound = RANGE.mound * (1 - smoothstep(7, 18, r));
  const berm = 30 * smoothstep(-290, -380, z);
  const sides = 18 * smoothstep(110, 220, Math.abs(x));
  // The mound's top is level: the floor's rise and its swell start beyond it.
  return floor * smoothstep(4, 9, r) + mound + berm + sides;
}

function rangeSurface(x: number, z: number): Surface {
  const dx = x - RANGE.firing.x;
  const dz = z - RANGE.line;
  if (dx * dx + dz * dz < 64) return Surface.Gravel;
  if (z < -284 && Math.abs(x) < 160) return Surface.Dirt;
  return Surface.Grass;
}

const box = (x: number, z: number, y0: number, y1: number, hx: number, hz: number, flags: number, surface: Surface): ColliderInput => ({ kind: 'box', x, z, y0, y1, hx, hz, ux: 1, uz: 0, flags, surface });
const cyl = (x: number, z: number, y0: number, y1: number, r: number, flags: number, surface: Surface): ColliderInput => ({ kind: 'cyl', x, z, y0, y1, r, flags, surface });

/** The colliders, in order: the rests, the plates on their posts, then the flag poles (whose ids the flags take). */
function colliders(): { list: ColliderInput[]; flags: number[] } {
  const list: ColliderInput[] = [];
  const g = (x: number, z: number): number => rangeHeight(x, z);
  const ground = g(RANGE.firing.x, RANGE.line);
  list.push(box(RANGE.sandbags.x, RANGE.sandbags.z, ground - 0.5, ground + RANGE.sandbags.top, 0.5, 0.25, Blocks.All, Surface.Dirt));
  list.push(box(RANGE.wall.x, RANGE.wall.z, ground - 0.5, ground + RANGE.wall.top, 0.6, 0.15, Blocks.All, Surface.Wood));
  for (const d of RANGE.plates.distances) {
    const z = zOf(d);
    const y = g(RANGE.plates.x, z);
    list.push(box(RANGE.plates.x, z, y + 0.8, y + 1.3, 0.25, 0.02, Blocks.All, Surface.Metal));
    list.push(cyl(RANGE.plates.x, z + 0.06, y - 0.3, y + 0.8, 0.04, Blocks.Move | Blocks.Sight, Surface.Metal));
  }
  const flags: number[] = [];
  for (const d of RANGE.flags.distances) {
    const z = zOf(d);
    flags.push(list.length);
    // A pole stops a walker, never a bullet or a look.
    list.push(cyl(RANGE.flags.x, z, g(RANGE.flags.x, z) - 0.3, g(RANGE.flags.x, z) + 6, 0.06, Blocks.Move, Surface.Metal));
  }
  return { list, flags };
}

function guards(routines: GenTuning['routines']): GuardSpawn[] {
  const rng = new Rng(NAME, 'routines');
  return TARGETS.map((t, id) => {
    const z = zOf(t.d);
    const face = t.face === 'west' ? [-1, 0] : t.face === 'east' ? [1, 0] : t.face === 'south' ? [0, 1] : [Math.sign(t.walk ?? 1), 0];
    const route = t.walk === undefined ? null : [{ x: t.x, z }, { x: t.x + t.walk, z }];
    const s: GuardSpawn = {
      id,
      role: t.walk === undefined ? 'sentry' : 'patrol',
      x: t.x,
      y: rangeHeight(t.x, z),
      z,
      faceX: face[0]!,
      faceZ: face[1]!,
      elevated: false,
      route,
      routeStart: t.start ?? 1,
      scanPhase: id * 0.37,
      scanScale: 1,
      routine: null as unknown as Routine,
    };
    s.routine = buildRoutine(s, routines, rng.fork(`guard${id}`));
    return s;
  });
}

/** What the run's rules and expectations watch, kept outside the state (scene bookkeeping only). */
interface Watch {
  shots: number;
  lastStrike: number;
  events: SimEvent[];
}

export function shootingRange(): Scene {
  const watch: Watch = { shots: 0, lastStrike: 0, events: [] };

  /** The sitting ends once the last round has landed. */
  const rules: System = {
    name: 'range-rules',
    phase: 'mission',
    reads: ['player.rifle', 'bullet.bullet', 'remains.remains'],
    writes: ['outcome'],
    emits: ['outcome'],
    run(ctx) {
      const p = player(ctx.index);
      const rifle = p.rifle;
      if (!rifle || rifle.rounds > 0 || ctx.index.of('bullet').length > 0) return;
      // A moment for the last impact to come back.
      if (rifle.lastShot < 0 || ctx.tick / ctx.tuning.sim.tickHz - rifle.lastShot < 3) return;
      const down = ctx.index.of('remains');
      const walker = down.some((r) => r.remains.post === WALKER_300);
      decide(ctx, 'succeeded', `all ${ctx.tuning.ballistics.rifle.rounds} rounds fired: ${down.length} down, the 300 m walker ${walker ? 'among them' : 'still walking'}`, p.id);
    },
  };

  /** A plate's centre: what the marksman ranges and shoots at. */
  const plate = (d: number): { x: number; y: number; z: number } => ({ x: RANGE.plates.x, y: rangeHeight(RANGE.plates.x, zOf(d)) + 1.05, z: zOf(d) });
  const SCRIPT: Step[] = [
    { at: 0.2, act: 'prone' },
    { at: 1.4, act: 'binoculars' },
    { at: 2.2, act: 'range', target: plate(300) },
    { at: 2.6, act: 'scope' },
    { at: 4.0, act: 'fire', target: { post: WALKER_300 }, breath: 1.2 },
    { at: 6.5, act: 'fire', target: { post: 4 }, breath: 1.2 },
    { at: 9.0, act: 'fire', target: plate(200), breath: 1.0 },
    // A shot that skips the lead, at the other 300 m walker: it lands behind him, in the dirt.
    { at: 11.5, act: 'fire', target: { post: 3 }, skip: 'lead', breath: 1.0 },
    { at: 14.0, act: 'fire', target: { post: 3 }, breath: 1.2 },
    { at: 17.0, act: 'fire', target: { post: 6 }, breath: 1.4 },
    // The 200 m sentry, in the legs: he cries out before he falls.
    { at: 19.5, act: 'fire', target: { post: 1 }, part: 'legs', breath: 1.0 },
  ];

  return {
    name: NAME,
    version: 1,
    title: 'Shooting range',
    description:
      'Guards walk and stand at 100–500 m in a 4 m/s crosswind; 15 rounds. Range them with the binoculars, dial or hold for drop, read the flags for wind, lead the walkers, and go prone for a rest.',
    game: SIGHTLINE,
    world: (tuning) => {
      const { list, flags } = colliders();
      return buildWorld(
        {
          name: NAME,
          size: 1300,
          cell: 2.5,
          height: rangeHeight,
          surface: rangeSurface,
          colliders: list,
          camp: { structures: flags.map((id) => ({ kind: 'flag' as const, colliders: [id] })), guards: guards(tuning.gen.routines), fenceHalf: 0 },
          spawn: { x: RANGE.firing.x, z: RANGE.firing.z, faceX: 0, faceZ: -1 },
          // Sea level, so the loads fly as published; the valley's afternoon sun; a steady crosswind.
          env: { ...defaultEnv(), altitudeM: 0, temperatureC: 15, wind: { speed: RANGE.wind.speed, fromDeg: RANGE.wind.fromDeg } },
        },
        tuning.gen,
      );
    },
    systems: [rules],
    setup(sim) {
      watch.shots = 0;
      watch.lastStrike = 0;
      watch.events.length = 0;
      placePlayer(sim, RANGE.firing.x, RANGE.firing.z, 0, -1);
      arm(player(sim.index), sim.tuning);
    },
    driver: () => new MarksmanDriver(SCRIPT),
    seconds: 23,
    expect: [
      {
        name: "the marksman's shot at the 300 m walker strikes his head, and he falls",
        during: (_sim, events) => {
          for (const e of events) watch.events.push({ ...e });
        },
        after: () => {
          const shot = watch.events.find((e) => e.type === 'shot');
          const impact = watch.events.find((e) => e.type === 'impact' && e.cause === shot?.id);
          if (!shot || !impact || impact.type !== 'impact') return 'no first shot, or it struck nothing';
          if (impact.part !== 'head') return `it struck ${impact.what}${impact.part !== 'none' ? ` (${impact.part})` : ''}`;
          const death = watch.events.find((e) => e.type === 'death' && e.cause === impact.id);
          if (!death || death.type !== 'death' || death.post !== WALKER_300) return 'he did not fall';
        },
      },
      {
        name: 'a guard who falls leaves his body in the same tick, and is gone',
        after: (sim) => {
          const deaths = watch.events.filter((e) => e.type === 'death');
          if (deaths.length < 3) return `only ${deaths.length} fell`;
          for (const d of deaths) {
            if (d.type !== 'death') continue;
            const r = sim.index.get(d.remains);
            if (r?.kind !== 'remains' || r.remains.of !== d.victim) return `death ${d.id} left no body`;
            if (sim.index.get(d.victim)) return `guard ${d.victim} is still about`;
          }
        },
      },
      {
        name: 'a shot in the legs brings a cry before he falls; the bolt is worked after every shot',
        after: () => {
          const legs = watch.events.find((e) => e.type === 'impact' && e.part === 'legs');
          if (!legs) return 'no shot struck legs';
          const cry = watch.events.find((e) => e.type === 'cry' && e.cause === legs.id);
          const death = watch.events.find((e) => e.type === 'death' && e.cause === legs.id);
          if (!cry || !death || cry.id > death.id) return 'no cry before the fall';
          const shots = watch.events.filter((e) => e.type === 'shot').length;
          const bolts = watch.events.filter((e) => e.type === 'bolt').length;
          if (bolts !== shots) return `${bolts} bolts for ${shots} shots`;
        },
      },
      {
        name: 'the shot that skips the lead misses behind the walker, into the ground',
        after: () => {
          const shots = watch.events.filter((e) => e.type === 'shot');
          const fourth = shots[3];
          const impact = watch.events.find((e) => e.type === 'impact' && e.cause === fourth?.id);
          if (!impact || impact.type !== 'impact') return 'the fourth shot struck nothing';
          if (impact.what !== 'terrain') return `it struck ${impact.what}`;
        },
      },
      {
        name: 'a strike is heard back at the shooter after the flight and the way back: about 1.28 s at 300 m',
        after: () => {
          const shot = watch.events.find((e) => e.type === 'shot');
          const impact = watch.events.find((e) => e.type === 'impact' && e.cause === shot?.id);
          if (!shot || shot.type !== 'shot' || !impact) return 'no first strike';
          const dx = impact.type === 'impact' ? impact.x - shot.x : 0;
          const dy = impact.type === 'impact' ? impact.y - shot.y : 0;
          const dz = impact.type === 'impact' ? impact.z - shot.z : 0;
          // Sea level at 15 °C: the speed of sound is 340.3 m/s (kernel/env.ts, air).
          const back = impact.t - shot.t + Math.sqrt(dx * dx + dy * dy + dz * dz) / 340.3;
          if (Math.abs(back - 1.28) > 0.05) return `heard after ${back.toFixed(3)} s`;
        },
      },
      {
        name: 'the rangefinder reads the 300 m plate to the metre',
        after: () => {
          const r = watch.events.find((e) => e.type === 'ranged');
          if (!r || r.type !== 'ranged') return 'nothing was ranged';
          const eye = { x: RANGE.firing.x, z: RANGE.firing.z };
          const plate = { x: RANGE.plates.x, z: zOf(300) };
          const flat = Math.sqrt((plate.x - eye.x) * (plate.x - eye.x) + (plate.z - eye.z) * (plate.z - eye.z));
          if (r.what !== 'collider' || Math.abs(r.range - flat) > 2) return `it read ${r.range} m at ${r.what}, the plate is ${flat.toFixed(0)} m away`;
        },
      },
    ],
  };
}

/** The ground at the firing line. */
export function rangeGround(): number {
  return rangeHeight(RANGE.firing.x, RANGE.line);
}
