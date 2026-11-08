import type { Tuning } from '../../config/tuning';
import {
  ballisticOf,
  boreLine,
  dialZero,
  emptyStrike,
  flightAt,
  fly,
  flyThrown,
  thrownAt,
  landingRadius,
  freshRifle,
  launch,
  lineOfSight,
  markDirection,
  pushSway,
  restAvailable,
  smallAngle,
  solveAim,
  swayAt,
  swaySample,
  vec3,
  zeroOf,
  type BulletEntity,
  type RifleState,
  type ThrownEntity,
  type Strike,
  type SwaySample,
} from '../ballistics';
import { calmVitals, poseAt, stepVitals, type PoseSample } from '../body';
import type { Command } from '../kernel/commands';
import { DEG, datan2, dcos, dsin } from '../kernel/core/detmath';
import { air, windAt } from '../kernel/env';
import { Faction } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, raycast } from '../kernel/world/query';
import { SURFACE_NAMES, Surface } from '../kernel/world/surfaces';
import { player, type GuardEntity, type PlayerEntity } from './entities';
import { bodiesAt } from './remains';

/**
 * Shooting, in a tick: the ballistics lane's rifle and bullets (sim/ballistics), wired to
 * Sightline's entities and what a strike does to them.
 *
 *   'commands'     the rifle: a shot is fired from the eye and along the sway the player
 *                  saw at the click's instant, and swept at once from that instant to the
 *                  tick's start, against the bodies as they stood then (their history);
 *                  the rangefinder; the zero dial; the suppressor.
 *   'projectiles'  every bullet flies on through the tick, each tick's chord swept against
 *                  every body part between its two poses, the terrain and the colliders.
 *                  Then the aim: breath and heart (body lane, vitals), the scope coming
 *                  up, a rest found or lost, and the sway sampled at the tick's end, once
 *                  every body has moved.
 *
 * A strike sounds (an impact), and a guard struck dies: a headshot silently, a torso
 * shot with a cry first as often as his own stream says, a leg shot always with one. He
 * leaves a body where he was hit, spawned in the same tick, and his entity is gone.
 *
 * Only a player given a rifle shoots (arm): without one, a click stays the bare shot of
 * 'player-commands', so the valley behaves as it did until Phase 2 joins the labs.
 */

/** Gives the player a rifle and the vitals that steady it: a run's setup calls this. */
export function arm(p: PlayerEntity, tuning: Tuning): void {
  p.rifle = freshRifle(tuning.ballistics);
  p.vitals = calmVitals(tuning.vitals);
}

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0 };
const eye = vec3();
const sight = vec3();
/** The debug view's drawing of a stone's arc: one line a step, for as long as a throw can last. */
const ARC_STEP = 0.05;
const ARC_STEPS = 64;
const aim = vec3();
const sway: SwaySample = { up: 0, right: 0, raise: 0 };
const strike = emptyStrike();
const hit = emptyHit();
const wind = { x: 0, z: 0 };

/** The player's commands for the rifle, the rangefinder, the dial and the suppressor. */
const rifleSystem: System = {
  name: 'rifle',
  phase: 'commands',
  after: ['player-commands'],
  reads: ['input', 'player.body', 'player.rifle', '*.body', 'guard.guard.spawn', 'remains.remains', 'solid.solid'],
  writes: ['player.rifle', 'entities', 'bullet.bullet', 'thrown.thrown', 'rng.unaimed', 'rng.wound'],
  emits: ['shot', 'report', 'ranged', 'impact', 'death', 'cry', 'clatter'],
  run(ctx) {
    const p = player(ctx.index);
    for (const c of ctx.input.commands) if (c.kind === 'shotDrop') dropShot(ctx, p, c);
    const rifle = p.rifle;
    if (!rifle) return;
    for (const c of ctx.input.commands) {
      if (c.kind === 'fire') shoot(ctx, p, rifle, c);
      else if (c.kind === 'range') rangefind(ctx, p, c);
      else if (c.kind === 'zeroUp') dialZero(rifle, 1, ctx.tuning.ballistics);
      else if (c.kind === 'zeroDown') dialZero(rifle, -1, ctx.tuning.ballistics);
      else if (c.kind === 'throw') throwOne(ctx, p, rifle, c);
      else if (c.kind === 'suppressor' && rifle.fitting <= 0) {
        rifle.suppressed = !rifle.suppressed;
        rifle.fitting = ctx.tuning.ballistics.rifle.fitTime;
      }
    }
  },
};

/** Fires the rifle, if a round is chambered: the shot, its report, its bullet, swept to the tick's start. */
function shoot(ctx: TickContext, p: PlayerEntity, rifle: RifleState, c: Extract<Command, { kind: 'fire' }>): void {
  if (rifle.rounds <= 0 || rifle.bolt > 0 || rifle.fitting > 0) return;
  const T = ctx.tuning;
  const B = T.ballistics;
  const hz = T.sim.tickHz;
  // The instant the player saw, the eye there, and the sway the camera showed.
  const t = (ctx.tick - 1 - c.lag) / hz;
  poseAt(p.body, c.lag, pose);
  eye.x = pose.x;
  eye.y = pose.y + pose.eyeHeight;
  eye.z = pose.z;
  swayAt(rifle, c.lag, sway);
  // With the scope down, the barrel points only roughly where you look.
  const loose = 1 - sway.raise;
  const [ux, uz] = ctx.draw(p.id, 'unaimed', (rng) => {
    const d = rng.unit2();
    const r = B.rifle.unaimedMil * Math.sqrt(rng.next());
    return [d.x * r, d.z * r] as const;
  });
  markDirection(lineOfSight(c.yaw, c.pitch, sight), sway.up + loose * uz, sway.right + loose * ux, aim);

  const env = ctx.world.spec.env;
  const a = air(env);
  windAt(env, t, wind);
  const b = ballisticOf(rifle, T, a.density, wind);
  const zero = zeroOf(rifle, T, a.density);
  // The bullet's launch, which the shot event carries whole: the bore's line, its speed, drag and wind.
  const flight = launch({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 }, eye, aim, zero, b, t);
  const shotId = ctx.emit({ type: 'shot', source: p.id, t, x: eye.x, y: eye.y, z: eye.z, dx: flight.dx, dy: flight.dy, dz: flight.dz, speed: b.v0, drag: b.k, wx: b.wx, wz: b.wz });
  const bullet = ctx.spawn((id): BulletEntity => ({ id, kind: 'bullet', faction: p.faction, bullet: { shooter: p.id, shot: shotId, flight, swept: t } }));
  const subsonic = b.v0 < a.speedOfSound;
  const radius = (rifle.suppressed ? B.sound.suppressedReport : B.sound.report) * (subsonic ? B.sound.subsonicReport : 1);
  ctx.emit({ type: 'report', source: p.id, t, cause: shotId, x: eye.x, y: eye.y, z: eye.z, surface: p.body.surface, loudness: radius / T.noise.radiusPerUnit, radius, suppressed: rifle.suppressed ? 1 : 0 });

  rifle.rounds--;
  rifle.lastShot = t;
  if (rifle.rounds > 0) rifle.bolt = B.rifle.boltTime;
  // Sweep it from its instant to the tick's start, through the world as the player saw it.
  const now = (ctx.tick - 1) / hz;
  flyAndStrike(ctx, bullet, now);
}

/**
 * Sandbox (B8): a match round dropped where the frame's line of sight meets the world,
 * from the eye, with or without a rifle: no sway, no bolt, no rounds counted. Solved to
 * land on that point (aim.ts), so a guard beside it hears the crack and the strike.
 */
function dropShot(ctx: TickContext, p: PlayerEntity, c: Extract<Command, { kind: 'shotDrop' }>): void {
  const T = ctx.tuning;
  const B = T.ballistics;
  const t = (ctx.tick - 1 - c.lag) / T.sim.tickHz;
  poseAt(p.body, c.lag, pose);
  eye.x = pose.x;
  eye.y = pose.y + pose.eyeHeight;
  eye.z = pose.z;
  lineOfSight(c.yaw, c.pitch, sight);
  const env = ctx.world.spec.env;
  const a = air(env);
  windAt(env, t, wind);
  const kit = { load: B.rifle.load, zero: B.rifle.zero.start };
  const b = ballisticOf(kit, T, a.density, wind);
  const zero = zeroOf(kit, T, a.density);
  raycast(ctx.query(), eye.x, eye.y, eye.z, sight.x, sight.y, sight.z, B.binoculars.rangeMax, Blocks.Bullet, hit, p.id);
  if (hit.what !== 'none') solveAim(eye, { x: hit.x, y: hit.y, z: hit.z }, 0, 0, zero, b, B.maxFlight, aim);
  else {
    aim.x = sight.x;
    aim.y = sight.y;
    aim.z = sight.z;
  }
  const flight = launch({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 }, eye, aim, zero, b, t);
  const shotId = ctx.emit({ type: 'shot', source: p.id, t, x: eye.x, y: eye.y, z: eye.z, dx: flight.dx, dy: flight.dy, dz: flight.dz, speed: b.v0, drag: b.k, wx: b.wx, wz: b.wz });
  const radius = B.sound.report;
  ctx.emit({ type: 'report', source: p.id, t, cause: shotId, x: eye.x, y: eye.y, z: eye.z, surface: p.body.surface, loudness: radius / T.noise.radiusPerUnit, radius, suppressed: 0 });
  const bullet = ctx.spawn((id): BulletEntity => ({ id, kind: 'bullet', faction: p.faction, bullet: { shooter: p.id, shot: shotId, flight, swept: t } }));
  flyAndStrike(ctx, bullet, (ctx.tick - 1) / T.sim.tickHz);
}

/**
 * Throws the throwable (B9) along the frame's line of sight, lifted a little, from just in
 * front of the eye, carried by the body's own speed; then flies it on to the tick's start
 * against the world as the player saw it, like a shot.
 */
function throwOne(ctx: TickContext, p: PlayerEntity, rifle: RifleState, c: Extract<Command, { kind: 'throw' }>): void {
  if (rifle.throwables <= 0) return;
  const T = ctx.tuning;
  const R = T.ballistics.throwable;
  const t = (ctx.tick - 1 - c.lag) / T.sim.tickHz;
  poseAt(p.body, c.lag, pose);
  lineOfSight(c.yaw, c.pitch, sight);
  const lift = smallAngle(R.liftDeg * DEG);
  boreLine(sight.x, sight.y, sight.z, lift.cos, lift.sin, aim);
  rifle.throwables--;
  const thrown = ctx.spawn((id): ThrownEntity => ({
    id,
    kind: 'thrown',
    faction: Faction.None,
    thrown: {
      thrower: p.id,
      x: pose.x + sight.x * 0.35,
      y: pose.y + pose.eyeHeight - 0.1,
      z: pose.z + sight.z * 0.35,
      vx: aim.x * R.speed + p.body.vx,
      vy: aim.y * R.speed,
      vz: aim.z * R.speed + p.body.vz,
      t,
      swept: t,
      rest: false,
      touches: 0,
    },
  }));
  flyThrownOn(ctx, thrown, (ctx.tick - 1) / T.sim.tickHz);
}

/** Flies a throwable on to `now`, sounding every touch. */
function flyThrownOn(ctx: TickContext, e: ThrownEntity, now: number): void {
  const T = ctx.tuning;
  flyThrown(e.thrown, now, 1 / T.sim.tickHz, ctx.query(), T, (touch) => {
    const radius = landingRadius(touch.speed, T.noise.surface[SURFACE_NAMES[touch.surface]], T);
    if (radius < 1) return;
    ctx.emit({ type: 'clatter', source: e.thrown.thrower, t: touch.t, x: touch.x, y: touch.y, z: touch.z, surface: touch.surface, loudness: radius / T.noise.radiusPerUnit, radius, thrown: e.id, speed: touch.speed });
  });
}

/** Every throwable in the air flies on through the tick. */
const thrownSystem: System = {
  name: 'thrown',
  phase: 'projectiles',
  after: ['bullets'],
  reads: ['thrown.thrown', '*.body', 'remains.remains', 'solid.solid'],
  writes: ['thrown.thrown'],
  emits: ['clatter'],
  run(ctx) {
    const now = ctx.tick / ctx.tuning.sim.tickHz;
    for (const e of ctx.index.of('thrown')) {
      if (e.thrown.rest) continue;
      flyThrownOn(ctx, e, now);
      // The debug view: the arc it is on, from its last touch to where it next meets the ground.
      ctx.debug((draw) => {
        if (e.thrown.rest) return;
        const g = ctx.tuning.sim.gravity;
        thrownAt(e.thrown, g, e.thrown.t, eye);
        for (let k = 1; k <= ARC_STEPS; k++) {
          thrownAt(e.thrown, g, e.thrown.t + k * ARC_STEP, sight);
          draw.line(eye.x, eye.y, eye.z, sight.x, sight.y, sight.z, 'info');
          if (sight.y <= ctx.world.terrain.heightAt(sight.x, sight.z)) {
            draw.point(sight.x, sight.y, sight.z, 0.12, 'warn');
            break;
          }
          eye.x = sight.x;
          eye.y = sight.y;
          eye.z = sight.z;
        }
      });
    }
  },
};

/** Lasers the range along the frame's line of sight: the distance to the first thing that stops light, to the metre. */
function rangefind(ctx: TickContext, p: PlayerEntity, c: Extract<Command, { kind: 'range' }>): void {
  poseAt(p.body, c.lag, pose);
  lineOfSight(c.yaw, c.pitch, sight);
  const max = ctx.tuning.ballistics.binoculars.rangeMax;
  raycast(ctx.query(), pose.x, pose.y + pose.eyeHeight, pose.z, sight.x, sight.y, sight.z, max, Blocks.Sight, hit, p.id);
  const t = (ctx.tick - 1 - c.lag) / ctx.tuning.sim.tickHz;
  if (hit.what === 'none') ctx.emit({ type: 'ranged', source: p.id, t, range: -1, x: 0, y: 0, z: 0, what: 'none' });
  else ctx.emit({ type: 'ranged', source: p.id, t, range: Math.round(hit.dist), x: hit.x, y: hit.y, z: hit.z, what: hit.what });
}

/**
 * Flies a bullet on to mission time `now` (the tick's start or its end), against the bodies
 * as they stood at each instant, and does what its strike does. Despawns it once it has
 * struck or flown its longest.
 */
function flyAndStrike(ctx: TickContext, bullet: BulletEntity, now: number): void {
  const T = ctx.tuning;
  const b = bullet.bullet;
  const s = fly(b, now, 1 / T.sim.tickHz, ctx.query(), (t, out) => bodiesAt(ctx.state, T, now, t, out), strike);
  if (s) {
    struck(ctx, bullet, s, now);
    ctx.despawn(bullet.id);
  } else if (now - b.flight.t >= T.ballistics.maxFlight) {
    ctx.despawn(bullet.id);
  }
}

/** What a strike does: it sounds, and a guard it strikes falls. */
function struck(ctx: TickContext, bullet: BulletEntity, s: Strike, now: number): void {
  const T = ctx.tuning;
  const I = T.ballistics.sound.impact;
  const b = bullet.bullet;
  const target = s.what === 'body' ? ctx.index.get(s.id) : undefined;
  const radius =
    s.what === 'body'
      ? I.body
      : s.surface === Surface.Metal
        ? I.metal
        : s.surface === Surface.Rock
          ? I.rock
          : s.surface === Surface.Wood
            ? I.wood
            : s.surface === Surface.Water
              ? I.water
              : I.ground;
  const surface = s.surface ?? (target && 'body' in target ? target.body.surface : Surface.Dirt);
  const impact = ctx.emit({
    type: 'impact',
    source: b.shooter,
    t: s.t,
    cause: b.shot,
    x: s.x,
    y: s.y,
    z: s.z,
    surface,
    loudness: radius / T.noise.radiusPerUnit,
    radius,
    what: s.what,
    target: s.id,
    part: s.part ?? 'none',
    speed: s.speed,
    nx: s.nx,
    ny: s.ny,
    nz: s.nz,
  });
  if (target?.kind === 'guard') kill(ctx, target, s, bullet, impact, now);
}

/** A guard struck: he may cry out, falls where he was hit, and leaves his body. */
function kill(ctx: TickContext, g: GuardEntity, s: Strike, bullet: BulletEntity, cause: number, now: number): void {
  const T = ctx.tuning;
  const H = T.ballistics.hits;
  const part = s.part ?? 'torso';
  const cried = part === 'legs' || (part === 'torso' && ctx.draw(g.id, 'wound', (rng) => rng.chance(H.cryChance)));
  // Where he was at the strike's instant.
  poseAt(g.body, (now - s.t) * T.sim.tickHz, pose);
  if (cried) {
    ctx.emit({
      type: 'cry',
      source: g.id,
      t: s.t,
      cause,
      x: pose.x,
      y: pose.y + pose.eyeHeight,
      z: pose.z,
      surface: g.body.surface,
      loudness: H.cryRadius / T.noise.radiusPerUnit,
      radius: H.cryRadius,
    });
  }
  const f = bullet.bullet.flight;
  const remains = ctx.spawn((id) => ({
    id,
    kind: 'remains' as const,
    faction: Faction.Camp,
    remains: { of: g.id, post: g.guard.spawn, x: pose.x, y: pose.y, z: pose.z, yaw: datan2(-f.dx, -f.dz), eye: pose.eyeHeight, vx: g.body.vx, vz: g.body.vz, fell: s.t, part },
  }));
  ctx.emit({ type: 'death', source: bullet.bullet.shooter, t: s.t, cause, victim: g.id, remains: remains.id, post: g.guard.spawn, part, x: pose.x, y: pose.y, z: pose.z });
  ctx.despawn(g.id);
}

/** Every bullet flies on through the tick. */
const bulletsSystem: System = {
  name: 'bullets',
  phase: 'projectiles',
  reads: ['bullet.bullet', '*.body', 'guard.guard.spawn', 'remains.remains', 'solid.solid'],
  writes: ['bullet.bullet', 'entities', 'rng.wound'],
  emits: ['impact', 'death', 'cry'],
  run(ctx) {
    const now = ctx.tick / ctx.tuning.sim.tickHz;
    // Bullets in id order; striking despawns them, so go through a copy.
    for (const bullet of [...ctx.index.of('bullet')]) {
      // The debug view: each bullet's path so far, as the one function has it.
      ctx.debug((draw) => {
        const f = bullet.bullet.flight;
        const steps = 12;
        flightAt(f, f.t, eye);
        for (let k = 1; k <= steps; k++) {
          flightAt(f, f.t + ((now - f.t) * k) / steps, sight);
          draw.line(eye.x, eye.y, eye.z, sight.x, sight.y, sight.z, 'warn');
          eye.x = sight.x;
          eye.y = sight.y;
          eye.z = sight.z;
        }
      });
      flyAndStrike(ctx, bullet, now);
    }
  },
};

/** The aim at the tick's end: vitals, the scope, the bolt, a rest, and the sway sampled. */
const aimSystem: System = {
  name: 'aim',
  phase: 'projectiles',
  after: ['thrown'],
  reads: ['input', 'player.body', 'solid.solid'],
  writes: ['player.rifle', 'player.vitals'],
  emits: ['bolt'],
  run(ctx, dt) {
    const p = player(ctx.index);
    const rifle = p.rifle;
    const vitals = p.vitals;
    if (!rifle || !vitals) return;
    const T = ctx.tuning;
    const B = T.ballistics;
    const S = B.sway;
    const body = p.body;
    stepVitals(vitals, body.gait, ctx.input.breath, S.breathRate, T.vitals, dt);
    // The bolt is worked half way through its cycle: lifted, drawn and run home.
    const half = B.rifle.boltTime / 2;
    if (rifle.bolt > half && rifle.bolt - dt <= half) {
      const r = B.sound.bolt;
      const at = ctx.tick / T.sim.tickHz - (half - (rifle.bolt - dt));
      ctx.emit({ type: 'bolt', source: p.id, t: at, x: body.x, y: body.y + body.eyeHeight, z: body.z, surface: body.surface, loudness: r / T.noise.radiusPerUnit, radius: r });
    }
    rifle.bolt = Math.max(0, rifle.bolt - dt);
    rifle.fitting = Math.max(0, rifle.fitting - dt);
    // The scope comes up while it's held, unless the body is sprinting or busy with the suppressor.
    const up = ctx.input.optic === 1 && body.gait !== 'sprint' && rifle.fitting <= 0;
    const step = dt / Math.max(B.rifle.raiseTime, 1e-6);
    rifle.raise = up ? Math.min(1, rifle.raise + step) : Math.max(0, rifle.raise - step);
    // Settling after moving, and onto a rest.
    rifle.steady = body.speed > S.movingSpeed ? 0 : Math.min(1, rifle.steady + dt / Math.max(S.settle, 1e-6));
    const rested = restAvailable(ctx.world, ctx.solids, body, ctx.input.yaw, ctx.input.pitch, S);
    // The debug view: where a rest is looked for, under the fore-end, green when there is one.
    ctx.debug((draw) => {
      const reach = body.stance === 'prone' ? S.restReach.prone : S.restReach.upright;
      const x = body.x - dsin(ctx.input.yaw) * reach;
      const z = body.z - dcos(ctx.input.yaw) * reach;
      draw.point(x, body.y + body.eyeHeight - 0.15, z, 0.05, rested ? 'good' : 'muted');
    });
    const restStep = dt / Math.max(S.restTime, 1e-6);
    rifle.rest = rested ? Math.min(1, rifle.rest + restStep) : Math.max(0, rifle.rest - restStep);
    // The sway at the tick's end, with the two before kept.
    pushSway(rifle);
    swaySample(rifle, vitals, body, ctx.tick / T.sim.tickHz, p.id, T, rifle.sway);
    rifle.sway.raise = rifle.raise;
  },
};

export const SHOOTING_SYSTEMS = { rifle: rifleSystem, bullets: bulletsSystem, thrown: thrownSystem, aim: aimSystem } as const;
