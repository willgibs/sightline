import type { Tuning } from '../../config/tuning';
import { climbPrompt, eyeOf, stridePhase, type BodyState, type Gait, type MotorContext, type Stance } from '../body';
import { gameBodies } from './remains';
import { generateWorld, worldFingerprint } from '../generation';
import { groundLight, rung } from '../perception';
import type { Game } from '../kernel/game';
import { neutralInput } from '../kernel/input';
import { missionSpec, type SpawnKind } from '../kernel/mission';
import { Simulation as KernelSimulation } from '../kernel/sim';
import type { EntityId, SimState } from '../kernel/state';
import type { System } from '../kernel/systems';
import type { Collider } from '../kernel/world/colliders';
import type { World } from '../kernel/world/world';
import { PLAYER_ID, player, type GuardEntity, type PlayerEntity, type RemainsEntity } from './entities';
import type { GuardRole } from '../generation';
import { glint, thrownAt, vec3, viewLine, type Flight, type Vec3 } from '../ballistics';
import { dcos, dsin } from '../kernel/core/detmath';
import { sunDirection } from '../kernel/env';
import type { PlayerControl } from './player';
import { writeSample } from './samples';
import { usePrompt } from './use';
import { startRun } from './setup';
import { BEHAVIOUR } from './golden';
import { SYSTEMS } from './systems';

/**
 * Sightline, as the kernel runs it (kernel/game.ts): the game's systems, a run that
 * starts with the player and the camp's guards, bodies whose shapes the body lane knows,
 * and worlds the generation lane builds.
 */
export const SIGHTLINE: Game<Simulation> = {
  name: 'Sightline',
  behaviour: BEHAVIOUR,
  systems: SYSTEMS,
  simulation: (world, tuning, systems) => new Simulation(world, tuning, systems),
  start: startRun,
  still: (sim) => neutralInput(sim.player.yaw),
  bodies: gameBodies,
  world: (spec, tuning) => generateWorld(spec, tuning),
  fingerprint: worldFingerprint,
  sample: writeSample,
};

const lens: Vec3 = { x: 0, y: 0, z: 0 };
const toPlayer: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * How brightly a marksman's scope flashes at the player (E8): the same mirror as the
 * player's own lens (ballistics/glint.ts), for a marksman sweeping a believed perch or
 * shooting. It decides nothing in the simulation; it's what the player can see of him.
 */
function scopeFlash(g: GuardEntity, role: GuardRole | undefined, px: number, py: number, pz: number, sun: Vec3, T: Tuning): number {
  const b = g.brain;
  if (role !== 'marksman' || !b || !((b.act === 'task' && b.task?.kind === 'sweep') || b.act === 'engage')) return 0;
  const body = g.body;
  const heading = body.yaw + g.guard.headYaw;
  lens.x = -dsin(heading);
  lens.y = 0;
  lens.z = -dcos(heading);
  const dx = px - body.x;
  const dy = py - (body.y + body.eyeHeight);
  const dz = pz - body.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1e-6) return 0;
  toPlayer.x = dx / d;
  toPlayer.y = dy / d;
  toPlayer.z = dz / d;
  return glint(lens, 1, sun, toPlayer, T.ballistics.glint);
}

/**
 * Per-guard values in Snapshot.guards: x, y, z, yaw, headYaw, moving; the light beneath
 * him (A4: 1 in the sun, less in shade, as the simulation finds it); his detection meter
 * (A8: what the honest view shows from the cue up); his rung on the awareness ladder
 * (0 unaware to 4 combat; A8: his posture and weapon); and how brightly his scope flashes
 * at the player (E8: 0 unless he's a marksman glassing the ground; 0–1).
 */
export const GUARD_FIELDS = 10;

/** The slice of state the renderer needs, copied once per tick for interpolation. */
export interface Snapshot {
  tick: number;
  px: number;
  py: number;
  pz: number;
  /** The body's eye height (its stance), and where its eye actually is, from its feet: the centre of its head. */
  eye: number;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  /** How far it is leaned to the right, metres (body/lean.ts). */
  lean: number;
  /** What a press of climb would do now: '' nothing, 'mantle', or 'ladder': the prompt (body/ladder.ts). */
  climb: '' | 'mantle' | 'ladder';
  /** What a press of use would do now: '' nothing, 'carry', or 'drop' (game/use.ts). */
  use: '' | 'carry' | 'drop';
  /** Lying down: the body's long axis, how far along it it has grown, and how the ground runs under it (body/chain.ts). */
  axis: number;
  lying: number;
  riseHead: number;
  risePelvis: number;
  riseFeet: number;
  yaw: number;
  pitch: number;
  speed: number;
  /** How far through its stride the player's body is: 0 as a foot comes down (body/bob.ts). */
  step: number;
  stance: Stance;
  gait: Gait;
  /** The light beneath the player, as the simulation finds it (A4): for the body drawn from outside. */
  light: number;
  /** Guard entity ids, ascending; guards appear and disappear by id. */
  guardIds: number[];
  /** Each guard's camp spawn (world.camp.guards index), parallel to guardIds. */
  guardSpawns: number[];
  /** GUARD_FIELDS values per guard, parallel to guardIds. */
  guards: Float32Array;
  /** Entities' solid shapes (copies), in entity order; their ids say whose (kernel/world/solids.ts). */
  solids: Collider[];
  /** The player's rifle and vitals as the scope and the HUD draw them, or null without a rifle. */
  rifle: RifleView | null;
  /** The bodies killed guards left: where each fell, which way, and when (game/remains.ts draws them). */
  remains: Array<RemainsEntity['remains'] & { id: number }>;
  /** Bullets in flight: their launches, so a trace is drawn along the simulated path. */
  bullets: Array<{ id: number; flight: Flight }>;
  /** Thrown things, where each is at the tick's end. */
  thrown: Array<{ id: number; x: number; y: number; z: number }>;
}

/** What the scope and the HUD show of the player's rifle and vitals, at a tick's end. */
export interface RifleView {
  /** The sway, mils, and how far the scope is up (rifle.ts, SwaySample): the camera shows `raise` of it. */
  up: number;
  right: number;
  raise: number;
  rest: number;
  rounds: number;
  zero: number;
  bolt: number;
  fitting: number;
  suppressed: boolean;
  load: string;
  heartRate: number;
  /** Seconds the breath has been held, and how much is left to hold. */
  held: number;
  air: number;
  /** How bright the lens glints to someone straight ahead, 0 to 1 (ballistics/glint.ts): facing the sun. */
  glint: number;
  /** How settled after moving, 0 to 1. */
  steady: number;
}

/**
 * A run of Sightline: the kernel's simulation (kernel/sim.ts) running the game, with what
 * the game's code asks of a run: the player, the guards, and the renderer's snapshot.
 * Every run has a player, always entity 1.
 */
export class Simulation extends KernelSimulation {
  private readonly eye = vec3();
  private readonly aimDir = vec3();
  private readonly sun = { x: 0, y: 0, z: 0 };
  /** `systems` replaces the game's own list, for tests and scenes; recordings replay with the game's. */
  constructor(world: World, tuning: Tuning, systems: readonly System[] = SYSTEMS) {
    super(world, tuning, SIGHTLINE, systems);
    this.playerEntity();
  }

  static create(seed: string, tuning: Tuning, spawnKind: SpawnKind = 'overlook'): Simulation {
    return new Simulation(generateWorld(missionSpec(seed, spawnKind), tuning), tuning);
  }

  private playerEntity(): PlayerEntity {
    return player(this.index);
  }

  /** The player's body: a live reference into the state tree. */
  get player(): BodyState {
    return this.playerEntity().body;
  }

  /** What the player's controls remember between ticks: a live reference into the state tree. */
  get playerControl(): PlayerControl {
    return this.playerEntity().control;
  }

  get playerId(): EntityId {
    return this.playerEntity().id;
  }

  /** The guards in entity order: live references into the state tree. */
  get guards(): readonly GuardEntity[] {
    return this.index.of('guard');
  }

  /** Removes an entity between ticks (a killed guard, a picked-up object); never the player. */
  override despawn(id: EntityId): boolean {
    if (id === PLAYER_ID) throw new Error('The player cannot be despawned');
    return super.despawn(id);
  }

  /** Continues from a save-state of a run of Sightline: it must have its player. */
  override restore(saved: SimState): void {
    super.restore(saved);
    this.playerEntity();
  }

  /** What the motor sees of the world, for questions asked between ticks. */
  private motorView(): MotorContext {
    return { world: this.world, solids: this.solids, tuning: this.tuning, dt: this.dt, tick: this.tick, source: this.playerId, others: [], emit: () => 0 };
  }

  snapshot(out?: Snapshot): Snapshot {
    const guards = this.guards;
    const n = guards.length;
    const s: Snapshot =
      out && out.guards.length === n * GUARD_FIELDS
        ? out
        : {
            tick: 0,
            px: 0,
            py: 0,
            pz: 0,
            eye: 0,
            eyeX: 0,
            eyeY: 0,
            eyeZ: 0,
            lean: 0,
            climb: '',
            use: '',
            axis: 0,
            lying: 0,
            riseHead: 0,
            risePelvis: 0,
            riseFeet: 0,
            yaw: 0,
            pitch: 0,
            speed: 0,
            step: 0,
            stance: 'stand',
            gait: 'idle',
            light: 1,
            guardIds: [],
            guardSpawns: [],
            guards: new Float32Array(n * GUARD_FIELDS),
            solids: [],
            rifle: null,
            remains: [],
            bullets: [],
            thrown: [],
          };
    const p = this.player;
    s.tick = this.tick;
    s.px = p.x;
    s.py = p.y;
    s.pz = p.z;
    s.eye = p.eyeHeight;
    const eye = eyeOf(p, this.tuning.bodies.player, this.eye);
    s.eyeX = eye.x - p.x;
    s.eyeY = eye.y - p.y;
    s.eyeZ = eye.z - p.z;
    s.lean = p.lean;
    s.climb = climbPrompt(p, this.tuning.bodies.player, this.motorView());
    s.use = usePrompt(this.playerEntity(), this.index, this.tuning, this.solids);
    s.axis = p.axis;
    s.lying = p.lying;
    s.riseHead = p.riseHead;
    s.risePelvis = p.risePelvis;
    s.riseFeet = p.riseFeet;
    s.yaw = p.yaw;
    s.pitch = p.pitch;
    s.speed = p.speed;
    s.step = stridePhase(p, this.tuning.bodies.player, this.tuning.noise);
    s.stance = p.stance;
    s.gait = p.gait;
    // Lit as the simulation finds it, where the world draws its shade (A4); in the sun elsewhere.
    const shade = this.world.shadeArea !== undefined;
    const t = this.tick / this.tuning.sim.tickHz;
    const env = this.world.spec.env;
    const sun = sunDirection(env, t, this.sun);
    s.light = shade ? groundLight(this.world, this.solids, env, t, p.x, p.y, p.z, this.tuning) : 1;
    s.guardIds.length = n;
    s.guardSpawns.length = n;
    for (let i = 0; i < n; i++) {
      const e = guards[i]!;
      const b = e.body;
      const o = i * GUARD_FIELDS;
      s.guardIds[i] = e.id;
      s.guardSpawns[i] = e.guard.spawn;
      s.guards[o] = b.x;
      s.guards[o + 1] = b.y;
      s.guards[o + 2] = b.z;
      s.guards[o + 3] = b.yaw;
      s.guards[o + 4] = e.guard.headYaw;
      s.guards[o + 5] = b.speed > 0.1 ? 1 : 0;
      s.guards[o + 6] = shade ? groundLight(this.world, this.solids, env, t, b.x, b.y, b.z, this.tuning) : 1;
      s.guards[o + 7] = e.senses ? e.senses.sight.meter : 0;
      s.guards[o + 8] = e.senses ? rung(e.senses.awareness.state) : 0;
      s.guards[o + 9] = scopeFlash(e, this.world.camp.guards[e.guard.spawn]?.role, p.x, p.y + p.eyeHeight, p.z, sun, this.tuning);
    }
    const shapes = this.solids.shapes;
    s.solids.length = shapes.length;
    for (let k = 0; k < shapes.length; k++) s.solids[k] = Object.assign(s.solids[k] ?? ({} as Collider), shapes[k]!);
    const pe = this.index.of('player')[0]!;
    const r = pe.rifle;
    const v = pe.vitals;
    if (r && v) {
      const view = (s.rifle ??= { up: 0, right: 0, raise: 0, rest: 0, rounds: 0, zero: 0, bolt: 0, fitting: 0, suppressed: false, load: '', heartRate: 0, held: 0, air: 0, glint: 0, steady: 1 });
      view.up = r.sway.up;
      view.right = r.sway.right;
      view.raise = r.sway.raise;
      view.rest = r.rest;
      view.rounds = r.rounds;
      view.zero = r.zero;
      view.bolt = r.bolt;
      view.fitting = r.fitting;
      view.suppressed = r.suppressed;
      view.load = r.load;
      view.heartRate = v.heartRate;
      view.held = v.held;
      view.air = v.air;
      view.steady = r.steady;
      const p = pe.body;
      const aim = viewLine(p.yaw, p.pitch, r.sway, this.aimDir);
      view.glint = glint(aim, r.raise, sunDirection(this.world.spec.env, this.tick / this.tuning.sim.tickHz, this.sun), aim, this.tuning.ballistics.glint);
    } else {
      s.rifle = null;
    }
    const remains = this.index.of('remains');
    s.remains.length = remains.length;
    for (let k = 0; k < remains.length; k++) s.remains[k] = Object.assign(s.remains[k] ?? ({} as Snapshot['remains'][number]), remains[k]!.remains, { id: remains[k]!.id });
    const bullets = this.index.of('bullet');
    s.bullets.length = bullets.length;
    for (let k = 0; k < bullets.length; k++) {
      const b = (s.bullets[k] ??= { id: 0, flight: { ...bullets[k]!.bullet.flight } });
      b.id = bullets[k]!.id;
      Object.assign(b.flight, bullets[k]!.bullet.flight);
    }
    const thrown = this.index.of('thrown');
    s.thrown.length = thrown.length;
    for (let k = 0; k < thrown.length; k++) {
      const o = (s.thrown[k] ??= { id: 0, x: 0, y: 0, z: 0 });
      o.id = thrown[k]!.id;
      thrownAt(thrown[k]!.thrown, this.tuning.sim.gravity, this.tick / this.tuning.sim.tickHz, o);
    }
    return s;
  }
}
