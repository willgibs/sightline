import type { Tuning } from '../../../config/tuning';
import { buildRoutine, type GuardSpawn, type Routine } from '../../generation';
import { datan2, dcos, dsin } from '../../kernel/core/detmath';
import { turnTowards } from '../../kernel/core/math';
import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import { Solids } from '../../kernel/world/solids';
import type { World } from '../../kernel/world/world';
import { groundLight } from '../../perception';
import { keepRoutine } from '../../brain';
import type { System } from '../../kernel/systems';
import { emptyMind, guardMind } from '../guards';
import { giveSenses } from '../perception';
import { placePlayer } from '../setup';
import { SIGHTLINE, type Simulation } from '../sim';
import type { Scene } from '.';
import { LAB, labWorld } from './perceptionLab';

/**
 * The sight scenario (A3): one guard and the player in the perception lab, set up to
 * measure one combination of the sight table's factors, with the outcome it should have.
 * "Crouched in shade at 30 m: spotted in 3–6 s" is
 *
 *   spot=shade&d=30&stance=crouch&move=walk&expect=3-6
 *
 * A scenario is a scene with parameters, which are part of its identity: its recordings
 * name them, and re-simulate through them (kernel/scene.ts). It runs headless in the
 * tests and `npm run scene`, and in the browser at `?scene=sight&params=...`.
 *
 * Parameters (defaults in brackets):
 *   guard   sentry or marksman (the far zone)                                  [sentry]
 *   spot    where the player is: open, shade (the tall wall's shadow), bush (the bush
 *           by the low wall), wall (behind the low wall), crest (the ridge's)  [open]
 *   d       metres from the guard to the spot, along the ground                [30]
 *   off     degrees the spot lies off his gaze; 180 is right behind him        [0]
 *   stance  stand, crouch or prone                                              [stand]
 *   move    still, walk (in the stance's own gait) or sprint                   [still]
 *   secs    how long it runs                                                    [20]
 *   react   1: the guard reacts as his awareness rises (A7); 0: he holds his gaze  [0]
 *   face    1: the player faces the guard and steps across his line (trial mode, A12),
 *           so the view holds on him; 0: the player circles the spot           [0]
 *   expect  seconds to 100%, as a range ('3-6'), or 'never' within the run     [none]
 *
 * The guard keeps a fixed gaze (no head scan), and unless he reacts, holds it whatever he
 * notices, so the scenario measures sight alone. He stands where the spot's line runs clear:
 * west of the open field's far end and of the bush, east of the low wall, north of the
 * shade, south of the crest. The player moves round a small circle about the spot, or
 * steps across his line facing him, so the speed and the distance hold.
 */

export interface SightParams {
  guard: 'sentry' | 'marksman';
  spot: 'open' | 'shade' | 'bush' | 'wall' | 'crest';
  d: number;
  off: number;
  stance: 'stand' | 'crouch' | 'prone';
  move: 'still' | 'walk' | 'sprint';
  secs: number;
  /** The guard reacts to what he notices (A7), or holds his gaze. */
  react: boolean;
  /** The player faces the guard and side-steps across his line, rather than circling. */
  face: boolean;
  /** Seconds to detection, [min, max]; or 'never'; or null for no expectation. */
  expect: readonly [number, number] | 'never' | null;
}

const DEFAULTS: SightParams = { guard: 'sentry', spot: 'open', d: 30, off: 0, stance: 'stand', move: 'still', secs: 20, react: false, face: false, expect: null };

/** Reads a scenario's parameters, refusing anything it doesn't know. */
export function parseSight(text: string | undefined): SightParams {
  const p: SightParams = { ...DEFAULTS };
  if (!text) return p;
  const one = <T extends string>(key: string, v: string, allowed: readonly T[]): T => {
    if (!(allowed as readonly string[]).includes(v)) throw new Error(`Sight scenario: ${key} must be ${allowed.join(', ')}; got '${v}'`);
    return v as T;
  };
  const num = (key: string, v: string, lo: number, hi: number): number => {
    const x = Number(v);
    if (v === '' || !Number.isFinite(x) || x < lo || x > hi) throw new Error(`Sight scenario: ${key} must be a number from ${lo} to ${hi}; got '${v}'`);
    return x;
  };
  for (const part of text.split('&')) {
    if (!part) continue;
    const at = part.indexOf('=');
    const key = at < 0 ? part : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    if (key === 'guard') p.guard = one(key, v, ['sentry', 'marksman']);
    else if (key === 'spot') p.spot = one(key, v, ['open', 'shade', 'bush', 'wall', 'crest']);
    else if (key === 'd') p.d = num(key, v, 0.5, 420);
    else if (key === 'off') p.off = num(key, v, 0, 180);
    else if (key === 'stance') p.stance = one(key, v, ['stand', 'crouch', 'prone']);
    else if (key === 'move') p.move = one(key, v, ['still', 'walk', 'sprint']);
    else if (key === 'secs') p.secs = num(key, v, 1, 120);
    else if (key === 'react') p.react = num(key, v, 0, 1) === 1;
    else if (key === 'face') p.face = num(key, v, 0, 1) === 1;
    else if (key === 'expect') {
      if (v === 'never') p.expect = 'never';
      else {
        const [a, b] = v.split('-').map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a! < 0 || b! < a!) throw new Error(`Sight scenario: expect must be 'never' or a range such as '3-6'; got '${v}'`);
        p.expect = [a!, b!];
      }
    } else throw new Error(`Sight scenario: no parameter '${key}'`);
  }
  return p;
}

/** The canonical form of a scenario's parameters: every key, in a fixed order. */
export function formatSight(p: SightParams): string {
  const e = p.expect === null ? '' : p.expect === 'never' ? '&expect=never' : `&expect=${p.expect[0]}-${p.expect[1]}`;
  return `guard=${p.guard}&spot=${p.spot}&d=${p.d}&off=${p.off}&stance=${p.stance}&move=${p.move}&secs=${p.secs}${p.react ? '&react=1' : ''}${p.face ? '&face=1' : ''}${e}`;
}

interface Spot {
  x: number;
  z: number;
  /** The direction from the spot toward the guard. */
  ux: number;
  uz: number;
  /** The radius of the player's circle about the spot. */
  pace: number;
}

function spotOf(p: SightParams, world: World, tuning: Tuning): Spot {
  switch (p.spot) {
    case 'open':
      return { x: 195, z: 30, ux: -1, uz: 0, pace: p.move === 'sprint' ? 5 : 1.5 };
    case 'bush':
      return { x: -112, z: -9, ux: -1, uz: 0, pace: 0.4 };
    case 'wall':
      // West of the low wall, in the sun (its shadow falls to the north-east), seen from the east.
      return { x: LAB.lowWall.x - 0.7, z: -4, ux: 1, uz: 0, pace: 0.4 };
    case 'crest':
      return { x: -135, z: LAB.ridge.z, ux: 0, uz: 1, pace: 1.5 };
    case 'shade': {
      // The tall wall's shadow: the first spot north of it, along its middle, in shade.
      const T = LAB.tallWall;
      const solids = new Solids(world.colliders);
      for (let dz = 1; dz < 6; dz += 0.5) {
        const z = T.z - dz;
        if (groundLight(world, solids, world.spec.env, 0, T.x, world.terrain.heightAt(T.x, z), z, tuning) === tuning.visibility.light.shade) {
          // Seen from the north, across the open, the wall behind: moving, the player keeps along the shadow.
          return { x: T.x, z: z - 0.5, ux: 0, uz: -1, pace: 1.5 };
        }
      }
      throw new Error('Sight scenario: no shade by the tall wall');
    }
  }
}

const bases = new WeakMap<Tuning, World>();

/** The lab's world, built once per tuning: scenarios differ only in their one guard. */
function baseWorld(tuning: Tuning): World {
  let base = bases.get(tuning);
  if (!base) bases.set(tuning, (base = labWorld(tuning)));
  return base;
}

/** The lab's world with one guard, placed for the scenario. */
function scenarioWorld(p: SightParams, tuning: Tuning): World {
  const base = baseWorld(tuning);
  const s = spotOf(p, base, tuning);
  const gx = s.x + s.ux * p.d;
  const gz = s.z + s.uz * p.d;
  // He faces the spot, turned `off` degrees away from it.
  const yaw = datan2(-(s.x - gx), -(s.z - gz)) + (p.off * Math.PI) / 180;
  const post: GuardSpawn = {
    id: 0,
    role: p.guard,
    x: gx,
    y: base.terrain.heightAt(gx, gz),
    z: gz,
    faceX: -dsin(yaw),
    faceZ: -dcos(yaw),
    elevated: false,
    route: null,
    routeStart: 0,
    scanPhase: 0,
    scanScale: 0,
    routine: null as unknown as Routine,
  };
  post.routine = buildRoutine(post, tuning.gen.routines, new Rng('sight', 'routines').fork('guard0'));
  return { ...base, camp: { ...base.camp, guards: [post] } };
}

/**
 * Moves the player about the spot, in the scenario's stance and gait: round a small circle,
 * so the speed holds steady and the distance stays within the circle's radius.
 */
class CircleDriver {
  private yaw: number | null = null;
  private spot: Spot | null = null;
  /** Which way the player is stepping across the line, facing the guard: 1 to his right. */
  private leg = 1;

  constructor(private readonly p: SightParams) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    const b = sim.player;
    this.spot ??= spotOf(this.p, sim.world, sim.tuning);
    const s = this.spot;
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.pitch = 0;
    if (this.yaw === null) this.yaw = b.yaw;
    out.yaw = this.yaw;
    if (this.p.face) {
      // Facing the guard (the spot's direction toward him), stepping across his line and back.
      out.yaw = datan2(-s.ux, -s.uz);
      if (this.p.move === 'still') return out;
      const side = (b.x - s.x) * -s.uz + (b.z - s.z) * s.ux;
      if (side > s.pace) this.leg = -1;
      else if (side < -s.pace) this.leg = 1;
      out.moveX = this.leg;
      out.sprint = this.p.move === 'sprint';
      return out;
    }
    if (this.p.move === 'still') return out;
    // Head for the point a quarter-turn ahead on the circle: the walk curves round it.
    const a = datan2(b.z - s.z, b.x - s.x) + 0.6;
    const cx = s.x + s.pace * dcos(a);
    const cz = s.z + s.pace * dsin(a);
    const want = datan2(-(cx - b.x), -(cz - b.z));
    this.yaw = turnTowards(this.yaw, want, 12 * sim.dt);
    out.yaw = this.yaw;
    out.moveZ = 1;
    out.sprint = this.p.move === 'sprint';
    return out;
  }
}

const mind = emptyMind();

/** Holds the scenario's guard to his post and gaze, whatever he notices: after his brain, the routine's order again. */
const hold: System = {
  name: 'sight-hold',
  phase: 'decide',
  after: ['guard-brains'],
  reads: ['guard.body', 'guard.guard'],
  writes: ['guard.guard.order'],
  emits: [],
  run(ctx) {
    for (const g of ctx.index.of('guard')) keepRoutine(guardMind(g, ctx.world, ctx.tuning, ctx.tick + 1, mind), g.guard.order);
  },
};

/** A sight scenario, from its parameters. */
export function sightScenario(params?: string): Scene {
  const p = parseSight(params);
  const canonical = formatSight(p);
  const seen = { noticed: -1, detected: -1 };
  return {
    name: 'sight',
    version: 1,
    params: canonical,
    title: `Sight · ${p.stance}, ${p.move}, ${p.spot}, ${p.d} m${p.off ? `, ${p.off}° off` : ''}${p.guard === 'marksman' ? ', a marksman' : ''}`,
    description: `One ${p.guard} watching the player ${p.d} m away, ${p.stance} and ${p.move} in the ${p.spot}${p.expect === null ? '' : p.expect === 'never' ? ': never seen' : `: seen in ${p.expect[0]}–${p.expect[1]} s`}.`,
    game: SIGHTLINE,
    world: (tuning) => scenarioWorld(p, tuning),
    systems: p.react ? [] : [hold],
    setup: (sim) => {
      seen.noticed = -1;
      seen.detected = -1;
      const s = spotOf(p, sim.world, sim.tuning);
      placePlayer(sim, s.x, s.z, s.ux, s.uz);
      const b = sim.player;
      const spec = sim.tuning.bodies.player;
      // Already in the stance, as if the run began mid-stride.
      b.stance = p.stance;
      b.eyeHeight = spec.eyeHeight[p.stance];
      b.eyeFrom = b.eyeHeight;
      for (const h of b.history) h.eyeHeight = b.eyeHeight;
      giveSenses(sim);
    },
    driver: () => new CircleDriver(p),
    seconds: p.secs,
    expect: [
      {
        name: p.expect === null ? 'it runs' : p.expect === 'never' ? 'he never sees the player' : `he sees the player in ${p.expect[0]}–${p.expect[1]} s`,
        during: (sim, events) => {
          for (const e of events) {
            if (e.type === 'noticed' && seen.noticed < 0) seen.noticed = e.t;
            if (e.type === 'detected' && seen.detected < 0) {
              seen.detected = e.t;
              if (p.expect === 'never') return `seen at ${e.t.toFixed(2)} s, ${e.distance.toFixed(1)} m, ${e.zone}, by ${sim.guards.length} guard`;
            }
          }
        },
        after: () => {
          if (p.expect === null || p.expect === 'never') return;
          if (seen.detected < 0) return `never seen in ${p.secs} s`;
          if (seen.detected < p.expect[0] || seen.detected > p.expect[1]) return `seen at ${seen.detected.toFixed(2)} s`;
        },
      },
      {
        name: 'the first cue comes at least the telegraph interval before 100%, outside contact',
        during: (sim, events) => {
          for (const e of events) {
            if (e.type !== 'detected' || e.zone === 'contact') continue;
            const gap = e.t - seen.noticed;
            if (gap < sim.tuning.perception.sight.minCueSeconds - 1e-9) return `cue at ${seen.noticed.toFixed(2)} s, seen at ${e.t.toFixed(2)} s`;
          }
        },
      },
    ],
  };
}

/**
 * The first table (A3): the design doc's ranges (Enemy perception · Sight) as runs, each
 * with the outcome the owner's reading of the table gives it, and its neighbours either
 * side of each range's edge. The factor-grid sweep (perception/sweep.ts) covers every
 * combination of the factors through the rate law; these run the whole pipeline.
 */
export const SIGHT_TABLE: readonly string[] = [
  // Standing and walking in the open by day: spotted to about 150 m.
  'spot=open&d=140&stance=stand&move=walk&expect=6-9',
  'spot=open&d=162&stance=stand&move=walk&expect=never',
  // Still and prone in cover: near invisible beyond 50 m.
  'spot=bush&d=55&stance=prone&move=still&secs=40&expect=never',
  'spot=open&d=55&stance=prone&move=still&secs=40&expect=never',
  'spot=open&d=40&stance=prone&move=still&secs=40&expect=15-30',
  // Crouched in shadow at 30 m: spotted in 3 to 6 s.
  'spot=shade&d=30&stance=crouch&move=walk&expect=3-6',
  // Marksmen to about 400 m, in a narrow cone.
  'guard=marksman&spot=open&d=390&stance=stand&move=walk&expect=6-10',
  'guard=sentry&spot=open&d=390&stance=stand&move=walk&expect=never',
  // Peripheral vision is short.
  'spot=open&d=20&off=45&stance=stand&move=walk&expect=5-9',
  'spot=open&d=40&off=45&stance=stand&move=walk&expect=never',
  // Close enough to touch, from behind: a still body, noticed in 2 s.
  'spot=open&d=2&off=180&stance=stand&move=still&expect=1.8-2.2',
  // On the crest against the sky, a prone body is seen farther than its cap.
  'spot=crest&d=60&stance=prone&move=still&secs=40&expect=15-30',
  // Behind a low wall, standing still: two-thirds of the body in view.
  'spot=wall&d=40&stance=stand&move=still&expect=10-16',
  // Sprinting fills fastest, but never faster than the telegraph allows.
  'spot=open&d=12&stance=stand&move=sprint&expect=2-3',
  // A guard who reacts turns to look at what caught his eye: the periphery's 20 m, sooner.
  'spot=open&d=20&off=45&stance=stand&move=walk&react=1&expect=3.5-5.5',
];
