import type { BulletEntity } from '../ballistics';
import { ballisticOf, flightAt, flightEnd, launch, solveAim, vec3, zeroOf } from '../ballistics';
import { bodyShape, eyeOf, hasBody, startle } from '../body';
import { dcos, dsin } from '../kernel/core/detmath';
import { air, windAt } from '../kernel/env';
import { Faction } from '../kernel/state';
import { Blocks } from '../kernel/world/colliders';
import { emptyHit, raycast } from '../kernel/world/query';
import { emptyShape, type BodyPart, type BodyShape, type Capsule } from '../kernel/world/shape';
import type { SimEvent } from '../kernel/events';
import { decide, type System, type TickContext } from '../kernel/systems';
import { player, type GuardEntity, type PlayerEntity } from './entities';

/**
 * Minimal combat (E10): guards shoot with lab B's machinery (the same bullets, the same
 * sounds), and the player can be hit and die. Phase 2 only joins the labs, so a mission's
 * rules can end on the player's death.
 */

const eye = vec3();
const line = vec3();
const from = vec3();
const to = vec3();
const head = { x: 0, y: 0, z: 0 };
const aim = vec3();
const wind = { x: 0, z: 0 };
const inFront = emptyHit();
const reached = emptyHit();
/** Where a line and a body part pass nearest: how far along the line, how far apart, and the point on the part. */
const nearest = { along: 0, gap: 0, x: 0, y: 0, z: 0 };

/**
 * Where a line of fire passes nearest a capsule: the line from (ox, oy, oz) along the unit
 * vector (ux, uy, uz) for `reach` metres, against the capsule's own segment. A sphere is a
 * capsule whose ends are one point. Writes `nearest`.
 */
function nearestTo(ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, reach: number, c: Capsule): void {
  const vx = c.bx - c.ax;
  const vy = c.by - c.ay;
  const vz = c.bz - c.az;
  const rx = ox - c.ax;
  const ry = oy - c.ay;
  const rz = oz - c.az;
  const e = vx * vx + vy * vy + vz * vz;
  const f = vx * rx + vy * ry + vz * rz;
  const cc = ux * rx + uy * ry + uz * rz;
  const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi, v));
  // s is metres along the line of fire (its direction is a unit vector), t the fraction of the way along the part.
  let s = 0;
  let t = 0;
  if (e <= 1e-9) s = clamp(-cc, reach);
  else {
    const b = ux * vx + uy * vy + uz * vz;
    const denom = e - b * b;
    s = denom > 1e-9 ? clamp((b * f - cc * e) / denom, reach) : 0;
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp(-cc, reach);
    } else if (t > 1) {
      t = 1;
      s = clamp(b - cc, reach);
    }
  }
  nearest.x = c.ax + vx * t;
  nearest.y = c.ay + vy * t;
  nearest.z = c.az + vz * t;
  const dx = ox + ux * s - nearest.x;
  const dy = oy + uy * s - nearest.y;
  const dz = oz + uz * s - nearest.z;
  nearest.along = s;
  nearest.gap = Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const point: Capsule = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0 };
const upright = emptyShape();

/**
 * One of the camp's own where this round could go, or 0: between the muzzle and what it's
 * aimed at, within the error of his aim and a margin, with nothing between the two men that
 * would stop it. A round goes anywhere inside its error radius, so a man beside the line or
 * crouched under it is in front of the rifle as surely as one standing on it: every man the
 * camp shot of its own, in the runs that were looked at, was one of those, half a metre off
 * the line. A man behind a wall isn't, and nor is one past the target.
 *
 * He's looked for where he is and where he'd be on his feet: a man down behind a crate in
 * the middle of a fight is about to come up from behind it.
 *
 * A brain knows nothing of where its own side is (rule 13), but a man sees who's in front
 * of his rifle, so it's settled here, where the round is made, as his eyes would settle it.
 * Writes how far along the line that man is to `nearest.along`.
 */
function ownInTheWay(ctx: TickContext, g: GuardEntity, ux: number, uy: number, uz: number, reach: number, spread: number): number {
  const M = ctx.tuning.brain.fight.mates;
  const view = ctx.query();
  /** Whether a round could get to this part of him: it's within the cone, and nothing but him would stop a round sent at it. `whole` is the man as he stands, whom a ray can find; on his feet he's only a place. */
  const within = (part: Capsule, id: number, whole: boolean): boolean => {
    nearestTo(eye.x, eye.y, eye.z, ux, uy, uz, reach, part);
    if (nearest.along < M.near || nearest.gap - part.r > nearest.along * spread + M.clear) return false;
    const along = nearest.along;
    // The side of him nearest the line is what a round going wide finds first: most of the way from his middle to his edge,
    // so that a man with only a shoulder showing round a wall's end is still a man in the way.
    const k = nearest.gap > 1e-6 ? (Math.min(part.r, nearest.gap) * M.edge) / nearest.gap : 0;
    const dx = nearest.x + (eye.x + ux * along - nearest.x) * k - eye.x;
    const dy = nearest.y + (eye.y + uy * along - nearest.y) * k - eye.y;
    const dz = nearest.z + (eye.z + uz * along - nearest.z) * k - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= 0) return false;
    // A wall he's behind takes the round, and he's nobody the man with the rifle can see.
    raycast(view, eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, whole ? d + part.r : d, Blocks.Bullet, reached, g.id);
    nearest.along = along;
    return whole ? reached.what === 'body' && reached.id === id : reached.what === 'none' || (reached.what === 'body' && reached.id === id);
  };
  const parts = (shape: BodyShape, id: number, whole: boolean): boolean => {
    point.ax = point.bx = shape.head.x;
    point.ay = point.by = shape.head.y;
    point.az = point.bz = shape.head.z;
    point.r = shape.head.r;
    return within(point, id, whole) || within(shape.torso, id, whole) || within(shape.legs, id, whole);
  };
  for (const q of view.bodies) {
    if (q.id === g.id) continue;
    const e = ctx.index.get(q.id);
    if (!e || e.faction !== Faction.Camp || !hasBody(e)) continue;
    if (parts(q.shape, q.id, true)) return q.id;
    // And on his feet, if he isn't.
    const spec = ctx.tuning.bodies[e.kind];
    if (e.body.eyeHeight >= spec.eyeHeight.stand) continue;
    const stood = { ...e.body, eyeHeight: spec.eyeHeight.stand, lean: 0 };
    if (parts(bodyShape(stood, spec, upright), q.id, false)) return q.id;
  }
  return 0;
}

/**
 * A guard fires at where he believes his target is: a shot from his eye, with his aim's
 * error from his own stream. The shot, its report and the bullet are the same as the
 * player's, so it sounds and strikes through lab B's pipeline.
 */
export function guardFire(ctx: TickContext, g: GuardEntity, target: { x: number; y: number; z: number }): boolean {
  const T = ctx.tuning;
  const B = T.ballistics;
  const C = T.brain.combat;
  const b = g.body;
  const t = ctx.tick / T.sim.tickHz;
  eye.x = b.x;
  eye.y = b.y + b.eyeHeight;
  eye.z = b.z;
  const env = ctx.world.spec.env;
  const a = air(env);
  windAt(env, t, wind);
  const kit = { load: B.rifle.load, zero: B.rifle.zero.start };
  const bal = ballisticOf(kit, T, a.density, wind);
  const zero = zeroOf(kit, T, a.density);
  const camp = ctx.index.of('commander')[0]?.camp;
  const fights = camp?.fights === true;
  // A camp that fights holds over for the range: at 300 m a straight aim from a 100 m zero is half a metre low.
  if (fights) solveAim(eye, target, 0, 0, zero, bal, B.maxFlight, line);
  else {
    line.x = target.x - eye.x;
    line.y = target.y - eye.y;
    line.z = target.z - eye.z;
  }
  const d = Math.sqrt(line.x * line.x + line.y * line.y + line.z * line.z) || 1;
  // One of his own in front of his muzzle: he holds his fire. A brain knows nothing of where its own side is (rule 13), but a
  // man sees who's in front of his rifle, so it's settled here, where the round is made, as his eyes would settle it.
  const reach = Math.sqrt((target.x - eye.x) * (target.x - eye.x) + (target.y - eye.y) * (target.y - eye.y) + (target.z - eye.z) * (target.z - eye.z));
  raycast(ctx.query(), eye.x, eye.y, eye.z, line.x / d, line.y / d, line.z / d, reach, Blocks.Bullet, inFront, g.id);
  if (inFront.what === 'body' && ctx.index.get(inFront.id)?.faction === Faction.Camp) return false;
  // His aim's error: a small disk around the line to the target, from his own stream.
  const role = ctx.world.camp.guards[g.guard.spawn]?.role;
  // From a position, in a firefight (brain/firefight.ts), he has something to steady the rifle on.
  const steady = g.brain?.act === 'fight' && role !== 'marksman';
  const spread = ((steady ? T.brain.firefight.spreadDeg : fights ? (role === 'marksman' ? T.brain.fight.spreadDeg.marksman : T.brain.fight.spreadDeg.other) : C.spreadDeg) * Math.PI) / 180;
  // And one of his own anywhere that error could put the round, in a camp whose men look out for each other.
  if (camp?.mates) {
    const mate = ownInTheWay(ctx, g, line.x / d, line.y / d, line.z / d, reach, spread);
    if (mate) {
      ctx.emit({ type: 'held', source: g.id, mate, distance: nearest.along });
      return false;
    }
  }
  const [eu, ev] = ctx.draw(g.id, 'aim', (rng) => {
    const r = spread * Math.sqrt(rng.next());
    const a = rng.next() * 2 * Math.PI;
    return [r * dcos(a), r * dsin(a)] as const;
  });
  const ux = line.x / d;
  const uy = line.y / d;
  const uz = line.z / d;
  // Across the line, level with the ground, and up it.
  const rl = Math.sqrt(uz * uz + ux * ux) || 1;
  const rx = -uz / rl;
  const rz = ux / rl;
  aim.x = ux + rx * eu - uy * rz * ev;
  aim.y = uy + rl * ev;
  aim.z = uz + rz * eu + uy * rx * ev;
  const len = Math.sqrt(aim.x * aim.x + aim.y * aim.y + aim.z * aim.z) || 1;
  aim.x /= len;
  aim.y /= len;
  aim.z /= len;
  const flight = launch({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 }, eye, aim, zero, bal, t);
  const shot = ctx.emit({ type: 'shot', source: g.id, t, x: eye.x, y: eye.y, z: eye.z, dx: flight.dx, dy: flight.dy, dz: flight.dz, speed: bal.v0, drag: bal.k, wx: bal.wx, wz: bal.wz });
  ctx.spawn((id): BulletEntity => ({ id, kind: 'bullet', faction: Faction.Camp, bullet: { shooter: g.id, shot, flight, swept: t } }));
  const radius = B.sound.report;
  ctx.emit({ type: 'report', source: g.id, t, cause: shot, x: eye.x, y: eye.y, z: eye.z, surface: b.surface, loudness: radius / T.noise.radiusPerUnit, radius, suppressed: 0 });
  return true;
}

/**
 * A camp's round going past the player's head (Lab F): it knocks the rifle off its rest and
 * jolts the heart, once a round. Being shot at has to matter even when it misses.
 */
export function nearMiss(ctx: TickContext, e: BulletEntity, now: number): void {
  const you = player(ctx.index);
  const shot = e.bullet;
  if (shot.shooter === you.id || shot.passed || !ctx.index.of('commander')[0]?.camp.fights) return;
  const N = ctx.tuning.brain.fight.nearMiss;
  flightAt(shot.flight, shot.swept, from);
  flightAt(shot.flight, now, to);
  eyeOf(you.body, ctx.tuning.bodies.player, head);
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const vz = to.z - from.z;
  const len2 = vx * vx + vy * vy + vz * vz;
  if (len2 <= 0) return;
  const s = Math.max(0, Math.min(1, ((head.x - from.x) * vx + (head.y - from.y) * vy + (head.z - from.z) * vz) / len2));
  const dx = from.x + vx * s - head.x;
  const dy = from.y + vy * s - head.y;
  const dz = from.z + vz * s - head.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > N.radius * N.radius) return;
  // A round something stopped short of him never went past him.
  const closest = shot.swept + (now - shot.swept) * s;
  if (flightEnd(shot.flight, closest, 1 / ctx.tuning.sim.tickHz, ctx.query()) < closest) return;
  shot.passed = true;
  if (you.vitals) startle(you.vitals, ctx.tuning.vitals);
  if (you.rifle) {
    you.rifle.rest = 0;
    you.rifle.shaken = N.knock;
  }
  ctx.emit({ type: 'passed', source: shot.shooter, cause: shot.shot, distance: Math.sqrt(d2) });
}

/** The player takes a hit: their hits add up, by which part it struck. */
export function hurtPlayer(ctx: TickContext, p: PlayerEntity, part: BodyPart, shooter: number, cause: number): void {
  if (!p.health) return;
  const C = ctx.tuning.brain.combat;
  p.health.hits += C.damage[part];
  ctx.emit({ type: 'hurt', source: shooter, cause, part, hits: p.health.hits });
}

/**
 * The lab's rules: the player who takes enough hits dies; the objective is done if the
 * target falls, lost if he gets away. Where getting out counts (the objective's `getOut`,
 * the owner's call on Nov 8), the target falling is only half of it: you've won when you
 * then reach that place alive. It's the end of the road, a five-minute walk from the
 * perches that can see the target (`npm run experiment -- way-out`), where the nearest edge
 * of the valley is a stroll that nothing the camp does could interrupt, and it's the way
 * the reinforcements come in.
 */
export const campRules: System = {
  name: 'camp-rules',
  phase: 'mission',
  reads: ['player.health', 'events', 'commander.camp'],
  writes: ['outcome', 'commander.camp.objective'],
  emits: ['outcome', 'objective'],
  run(ctx) {
    const p = player(ctx.index);
    const C = ctx.tuning.brain.combat;
    if (p.health && p.health.hits >= C.playerHits) {
      let cause = 0;
      let source = p.id;
      for (const e of ctx.events) {
        if (e.type === 'hurt') {
          cause = e.id;
          source = e.source;
        }
      }
      decide(ctx, 'failed', 'shot dead by the camp', source, cause);
      return;
    }
    // The objective (stand-in until lab D's): the target falling, or getting away.
    const obj = ctx.index.of('commander')[0]?.camp.objective;
    if (!obj) return;
    if (obj.status === 'open') {
      const death = ctx.events.find((e): e is Extract<SimEvent, { type: 'death' }> => e.type === 'death' && e.victim === obj.target);
      if (death) {
        obj.status = 'done';
        if (obj.getOut) ctx.emit({ type: 'objective', source: p.id, cause: death.id, stage: 'get-out' });
        else decide(ctx, 'succeeded', 'the target is down', death.source, death.id);
      }
    } else if (obj.status === 'escaped') {
      decide(ctx, 'failed', `the target got away${whatGaveItAway(ctx, obj.left, ctx.index.of('commander')[0]?.camp.protects !== undefined)}`, p.id);
    } else if (obj.status === 'done' && obj.getOut && (p.body.x - obj.getOut.x) * (p.body.x - obj.getOut.x) + (p.body.z - obj.getOut.z) * (p.body.z - obj.getOut.z) <= ctx.tuning.brain.getOut.radius * ctx.tuning.brain.getOut.radius) {
      decide(ctx, 'succeeded', 'the target is down, and you got out', p.id);
    }
  },
};

/**
 * What there was to read before the target left, in words, for the end of a run that lost
 * him (the owner, Nov 10: a player who lost has to be able to say what they should have
 * read). The first of these that happened: his vehicle's engine was running before he got to
 * it; the relief was at the gate and went in for him; or nothing came between the siren and
 * his run: because nobody came, in a camp that had him wait, or because his camp runs him at
 * the siren.
 */
function whatGaveItAway(ctx: TickContext, left: { tick: number; engine: number; relief: number; siren: number } | undefined, protects: boolean): string {
  if (!left) return '';
  const hz = ctx.tuning.sim.tickHz;
  const since = (tick: number): number => Math.round((left.tick - tick) / hz);
  if (left.engine >= 0 && since(left.engine) >= 5) return `: his vehicle's engine had been running for ${since(left.engine)} s when he got to it`;
  if (left.relief >= 0) return `: the relief had been at the gate for ${since(left.relief)} s, and went in for him`;
  // A camp that protects him had him wait, and nobody came. One that doesn't had him run at once, however long the run took.
  if (left.siren >= 0) return protects ? `: nobody came for him, and he ran for his vehicle ${since(left.siren)} s after the siren` : ': he ran for his vehicle at the siren';
  return '';
}
