import type { Tuning } from '../../config/tuning';
import { ballisticOf, holdBetween, landing, markDirection, solveAim, unit, vec3, velocityAt, zeroOf, type Ballistic, type Hold, type Vec3 } from '../ballistics';
import { buildWorld } from '../generation';
import { DEG, datan2, dcos, dsin } from '../kernel/core/detmath';
import { defaultEnv, air, windAt } from '../kernel/env';
import { neutralInput, Optic, type InputFrame } from '../kernel/input';
import { Faction } from '../kernel/state';
import { Blocks } from '../kernel/world/colliders';
import { Surface } from '../kernel/world/surfaces';
import type { World } from '../kernel/world/world';
import { player } from './entities';
import { placePlayer } from './setup';
import { arm } from './shooting';
import { Simulation } from './sim';

/**
 * Lab B's bench measurements (benches.ts), each run through the simulation or the one
 * ballistic function:
 *   - the sway ladder: a stance held with the scope up, the sway the simulation keeps at
 *     every tick's end sampled, as the camera and the shot see it;
 *   - the reticle sweep: the hold the instruments name, fired through the whole
 *     simulation at a board, over loads, ranges, winds and slopes;
 *   - decision sensitivity: how far each skipped decision moves a centred head shot at
 *     300 m on the range.
 */

/** A rung of the ladder: how the shooter holds the rifle. */
export interface SwayRung {
  name: string;
  stance: 'stand' | 'crouch' | 'prone';
  /** Pitch of the aim, degrees: past the bipod's reach, prone is unrested. */
  pitchDeg: number;
  /** Hold the breath (measured only while the hold steadies). */
  breath: boolean;
}

export const SWAY_RUNGS: readonly SwayRung[] = [
  { name: 'standing', stance: 'stand', pitchDeg: 0, breath: false },
  { name: 'crouched', stance: 'crouch', pitchDeg: 0, breath: false },
  { name: 'prone', stance: 'prone', pitchDeg: 25, breath: false },
  { name: 'prone, rested', stance: 'prone', pitchDeg: 0, breath: false },
  { name: 'prone, rested, breath held', stance: 'prone', pitchDeg: 0, breath: true },
];

/** The 95th-percentile radius of the sway, in mils, over `seconds` of a rung (held breaths: their steady part). */
export function swayRadius(rung: SwayRung, tuning: Tuning, seconds = 20): number {
  const world = buildWorld({ name: 'sway-bench', size: 60, cell: 1 }, tuning.gen);
  const sim = new Simulation(world, tuning);
  placePlayer(sim, 0, 0, 0, -1);
  arm(player(sim.index), tuning);
  const hz = tuning.sim.tickHz;
  const input: InputFrame = { ...neutralInput(0, rung.pitchDeg * DEG), optic: Optic.Scope };
  // Take the stance and settle: a second and a half.
  for (let i = 0; i < 1.5 * hz; i++) sim.step({ ...input, crouch: i === 0 && rung.stance === 'crouch', prone: i === 0 && rung.stance === 'prone' });
  const radii: number[] = [];
  const V = tuning.vitals;
  const p = player(sim.index);
  for (let i = 0; i < seconds * hz; ) {
    if (!rung.breath) {
      sim.step(input);
      radii.push(Math.sqrt(p.rifle!.sway.up * p.rifle!.sway.up + p.rifle!.sway.right * p.rifle!.sway.right));
      i++;
      continue;
    }
    // Hold for as long as a breath steadies, then breathe until it's back; sample the steady part.
    for (let k = 0; k < V.holdTime * hz && i < seconds * hz; k++, i++) {
      sim.step({ ...input, breath: true });
      if (p.vitals!.held >= tuning.ballistics.sway.holdSettle && p.vitals!.held <= V.holdTime) {
        radii.push(Math.sqrt(p.rifle!.sway.up * p.rifle!.sway.up + p.rifle!.sway.right * p.rifle!.sway.right));
      }
    }
    for (let k = 0; k < V.recoverTime * hz; k++) sim.step(input);
  }
  radii.sort((a, b) => a - b); // unique: plain numbers, so equal ones are interchangeable
  return radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.95))] ?? 0;
}

/** A shot of the reticle sweep: a load, a range along a slope, and a wind. */
export interface SweepCase {
  load: 'match' | 'subsonic';
  range: number;
  slopeDeg: number;
  wind: { speed: number; fromDeg: number };
}

/** The sweep: both loads (the subsonic to 300 m), 100–500 m, slopes to ±30°, winds from still to 8 m/s from four sides. */
export function sweepCases(): SweepCase[] {
  const out: SweepCase[] = [];
  const winds = [
    { speed: 0, fromDeg: 0 },
    { speed: 4, fromDeg: 270 },
    { speed: 8, fromDeg: 45 },
    { speed: 6, fromDeg: 160 },
  ];
  for (const wind of winds) {
    for (const load of ['match', 'subsonic'] as const) {
      for (const range of [100, 250, 300, 420, 500]) {
        if (load === 'subsonic' && range > 300) continue;
        for (const slopeDeg of [-30, -12, 0, 15, 30]) out.push({ load, range, slopeDeg, wind });
      }
    }
  }
  return out;
}

/** Where the shooter stands for the sweep: on a pillar 300 m up, so a shot can go 30° down as well as up. */
const PILLAR = 300;
/** The sweep shoots toward this heading, off every axis. */
const SWEEP_HEADING_DEG = 37;

/** A world for the sweep in a wind: flat, sea-level air, the pillar at the origin. */
export function sweepWorld(wind: SweepCase['wind'], tuning: Tuning): World {
  return buildWorld(
    {
      name: 'reticle-sweep',
      size: 1200,
      cell: 10,
      colliders: [{ kind: 'box', x: 0, z: 0, y0: -1, y1: PILLAR, hx: 1.5, hz: 1.5, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock }],
      env: { ...defaultEnv(), altitudeM: 0, temperatureC: 15, wind },
    },
    tuning.gen,
  );
}

/** What one shot of the sweep did: the hold the instruments named, and how far its path passed from the point. */
export interface SweepShot {
  hold: Hold;
  /** Metres between the aimed point and the bullet's path where it struck the board; Infinity if it struck elsewhere. */
  miss: number;
  /** The camera's line of sight and the point, for checking the drawn reticle (tests/reticle.test.ts). */
  sight: Vec3;
  eye: Vec3;
  target: Vec3;
}

/**
 * One shot of the sweep, through the whole simulation: the player on the pillar, armed
 * with the case's load, scope up; a board square to the line at the case's range and
 * slope; the hold the instruments solve for (ballistics/aim.ts); a press that puts the
 * swaying line of sight there (as the marksman does); the bullet flown by the 'rifle' and
 * 'bullets' systems and swept against the board.
 */
export function sweepShot(world: World, c: SweepCase, tuning: Tuning): SweepShot {
  const sim = new Simulation(world, tuning);
  placePlayer(sim, 0, 0, 0, -1);
  const p = player(sim.index);
  arm(p, tuning);
  p.rifle!.load = c.load;
  const hz = tuning.sim.tickHz;
  const h = SWEEP_HEADING_DEG * DEG;
  const s = c.slopeDeg * DEG;
  const yaw = -h;
  const still: InputFrame = { ...neutralInput(yaw, s), optic: Optic.Scope };
  for (let i = 0; i < 0.6 * hz; i++) sim.step(still);
  const eye = { x: p.body.x, y: p.body.y + p.body.eyeHeight, z: p.body.z };
  // The point, along the heading and the slope, and a board square to the line through it.
  const dir = { x: dsin(h) * dcos(s), y: dsin(s), z: -dcos(h) * dcos(s) };
  const target = { x: eye.x + dir.x * c.range, y: eye.y + dir.y * c.range, z: eye.z + dir.z * c.range };
  const across = unit(dir.z, 0, -dir.x, vec3());
  sim.spawn((id) => ({
    id,
    kind: 'solid' as const,
    faction: Faction.None,
    solid: { kind: 'box' as const, id: 0, x: target.x, z: target.z, y0: target.y - 3, y1: target.y + 3, hx: 3, hz: 0.01, ux: across.x, uz: across.z, flags: Blocks.All, surface: Surface.Wood },
  }));
  // What the instruments say: the line of sight that lands on the point, and its hold.
  const env = world.spec.env;
  const a = air(env);
  const b: Ballistic = ballisticOf(p.rifle!, tuning, a.density, windAt(env, sim.tick / hz, { x: 0, z: 0 }));
  const zero = zeroOf(p.rifle!, tuning, a.density);
  const sight = vec3();
  solveAim(eye, target, 0, 0, zero, b, tuning.ballistics.maxFlight, sight);
  const hold = holdBetween(sight, unit(target.x - eye.x, target.y - eye.y, target.z - eye.z, vec3()), { up: 0, right: 0 });
  // Press so the swaying line of sight is that one.
  const sway = p.rifle!.sway;
  const cmd = { ...sight };
  const got = vec3();
  for (let k = 0; k < 6; k++) {
    markDirection(cmd, sway.up, sway.right, got);
    unit(cmd.x + sight.x - got.x, cmd.y + sight.y - got.y, cmd.z + sight.z - got.z, cmd);
  }
  const angles = { yaw: datan2(-cmd.x, -cmd.z), pitch: datan2(cmd.y, Math.sqrt(cmd.x * cmd.x + cmd.z * cmd.z)) };
  let flight = null as null | { dx: number; dy: number; dz: number; x: number; y: number; z: number; t: number; speed: number; drag: number; wx: number; wz: number };
  let miss = Infinity;
  for (let i = 0; i < 3 * hz && miss === Infinity; i++) {
    const events = sim.step({ ...still, ...angles, commands: i === 0 ? [{ kind: 'fire', lag: 0, ...angles }] : [] });
    for (const e of events) {
      if (e.type === 'shot') flight = { ...e };
      if (e.type !== 'impact' || !flight) continue;
      if (e.what !== 'collider') return { hold, miss: Infinity, sight, eye, target };
      // How far the path through the strike passes from the point.
      const v = velocityAt({ x: flight.x, y: flight.y, z: flight.z, dx: flight.dx, dy: flight.dy, dz: flight.dz, t: flight.t, v0: flight.speed, k: flight.drag, g: tuning.sim.gravity, wx: flight.wx, wz: flight.wz }, e.t, vec3());
      const d = unit(v.x, v.y, v.z, vec3());
      const rx = target.x - e.x;
      const ry = target.y - e.y;
      const rz = target.z - e.z;
      const along = rx * d.x + ry * d.y + rz * d.z;
      miss = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - along * along));
    }
  }
  return { hold, miss, sight, eye, target };
}

/** The worst miss over the sweep, metres. */
export function sweepWorst(tuning: Tuning): number {
  let worst = 0;
  const worlds = new Map<string, World>();
  for (const c of sweepCases()) {
    const key = `${c.wind.speed}/${c.wind.fromDeg}`;
    let world = worlds.get(key);
    if (!world) worlds.set(key, (world = sweepWorld(c.wind, tuning)));
    worst = Math.max(worst, sweepShot(world, c, tuning).miss);
  }
  return worst;
}

/** How far each skipped decision moves a centred head shot, mils, on the range's 300 m walker. */
export interface Sensitivity {
  drop: number;
  lead: number;
  wind: number;
  /** Ranging by eye, 15% short and 15% long: the worse of the two. */
  ranging: number;
  /** A head's radius at that range, mils: a decision that moves the shot further misses the head. */
  head: number;
  /** The shot with every decision made: how far from the centre it lands. */
  centred: number;
}

/**
 * Decision sensitivity on the range (game/scenes/shootingRange.ts): the shooter prone on
 * the mound, a guard walking 1.35 m/s across the 300 m lane, the 4 m/s crosswind, the
 * 100 m zero. The shot that makes every decision lands on the centre of his head; each
 * skipped one is aimed as a player who skipped it would aim, and the miss measured from
 * where the head is when the bullet arrives, square to the line of fire.
 */
export function decisionSensitivity(tuning: Tuning): Sensitivity {
  const B = tuning.ballistics;
  const rifle = { load: B.rifle.load, zero: B.rifle.zero.start };
  // Sea level at 15 °C, as on the range.
  const env = { ...defaultEnv(), altitudeM: 0, temperatureC: 15, wind: { speed: 4, fromDeg: 270 } };
  const a = air(env);
  const wind = windAt(env, 0, { x: 0, z: 0 });
  const windy = ballisticOf(rifle, tuning, a.density, wind);
  const still = ballisticOf(rifle, tuning, a.density, { x: 0, z: 0 });
  const zero = zeroOf(rifle, tuning, a.density);
  const maxFlight = B.maxFlight;
  // The mound's eye prone, and the walker's head 300 m north, 3 m higher.
  const eye = { x: 0, y: 2.32, z: 250.6 };
  const head = { x: 0, y: 5.3, z: -50 };
  const walk = tuning.gen.routines.pace;
  const range = Math.sqrt((head.y - eye.y) * (head.y - eye.y) + (head.z - eye.z) * (head.z - eye.z));
  const missWith = (sight: Vec3, b: Ballistic): number => {
    // Where the head is when the bullet gets to his range, and how far the path passes from it.
    const to = unit(head.x - eye.x, head.y - eye.y, head.z - eye.z, vec3());
    const p = vec3();
    const t = landing(eye, sight, to, range, zero, b, maxFlight, p);
    const hx = head.x + walk * t;
    return Math.sqrt((p.x - hx) * (p.x - hx) + (p.y - head.y) * (p.y - head.y) + (p.z - head.z) * (p.z - head.z));
  };
  const sight = vec3();
  // Every decision made.
  solveAim(eye, head, walk, 0, zero, windy, maxFlight, sight);
  const right = missWith(sight, windy);
  // Drop skipped: the hold's height left at the centre, the lead and wind still held.
  const flat = vec3();
  const level = unit(head.x - eye.x, head.y - eye.y, head.z - eye.z, vec3());
  const hold = holdBetween(sight, level, { up: 0, right: 0 });
  markDirection(level, 0, hold.right, flat);
  const drop = missWith(flat, windy);
  // Lead skipped: aimed where he is, with the drop and the wind.
  solveAim(eye, head, 0, 0, zero, windy, maxFlight, sight);
  const lead = missWith(sight, windy);
  // Wind skipped: the drop and the lead, as if the air were still.
  solveAim(eye, head, walk, 0, zero, still, maxFlight, sight);
  const windMiss = missWith(sight, windy);
  // Ranging skipped: the drop held for a range 15% short or long.
  let ranging = 0;
  for (const k of [0.85, 1.15]) {
    const fake = { x: eye.x, y: eye.y + (head.y - eye.y) * k, z: eye.z + (head.z - eye.z) * k };
    solveAim(eye, fake, walk, 0, zero, windy, maxFlight, sight);
    ranging = Math.max(ranging, missWith(sight, windy));
  }
  const mil = (m: number): number => (m / range) * 1000;
  return { drop: mil(drop), lead: mil(lead), wind: mil(windMiss), ranging: mil(ranging), head: mil(tuning.bodies.guard.parts.headRadius), centred: mil(right) };
}
