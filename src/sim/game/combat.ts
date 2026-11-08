import type { BulletEntity } from '../ballistics';
import { ballisticOf, launch, vec3, zeroOf } from '../ballistics';
import { dcos, dsin } from '../kernel/core/detmath';
import { air, windAt } from '../kernel/env';
import { Faction } from '../kernel/state';
import type { BodyPart } from '../kernel/world/shape';
import type { SimEvent } from '../kernel/events';
import { decide, type System, type TickContext } from '../kernel/systems';
import { player, type GuardEntity, type PlayerEntity } from './entities';

/**
 * Minimal combat (E10): guards shoot with lab B's machinery (the same bullets, the same
 * sounds), and the player can be hit and die. Phase 2 only joins the labs, so a mission's
 * rules can end on the player's death.
 */

const eye = vec3();
const aim = vec3();
const wind = { x: 0, z: 0 };

/**
 * A guard fires at where he believes his target is: a shot from his eye, with his aim's
 * error from his own stream. The shot, its report and the bullet are the same as the
 * player's, so it sounds and strikes through lab B's pipeline.
 */
export function guardFire(ctx: TickContext, g: GuardEntity, target: { x: number; y: number; z: number }): void {
  const T = ctx.tuning;
  const B = T.ballistics;
  const C = T.brain.combat;
  const b = g.body;
  const t = ctx.tick / T.sim.tickHz;
  eye.x = b.x;
  eye.y = b.y + b.eyeHeight;
  eye.z = b.z;
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  // His aim's error: a small disk around the line to the target, from his own stream.
  const spread = (C.spreadDeg * Math.PI) / 180;
  const [eu, ev] = ctx.draw(g.id, 'aim', (rng) => {
    const r = spread * Math.sqrt(rng.next());
    const a = rng.next() * 2 * Math.PI;
    return [r * dcos(a), r * dsin(a)] as const;
  });
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
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
  const env = ctx.world.spec.env;
  const a = air(env);
  windAt(env, t, wind);
  const kit = { load: B.rifle.load, zero: B.rifle.zero.start };
  const bal = ballisticOf(kit, T, a.density, wind);
  const zero = zeroOf(kit, T, a.density);
  const flight = launch({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 }, eye, aim, zero, bal, t);
  const shot = ctx.emit({ type: 'shot', source: g.id, t, x: eye.x, y: eye.y, z: eye.z, dx: flight.dx, dy: flight.dy, dz: flight.dz, speed: bal.v0, drag: bal.k, wx: bal.wx, wz: bal.wz });
  ctx.spawn((id): BulletEntity => ({ id, kind: 'bullet', faction: Faction.Camp, bullet: { shooter: g.id, shot, flight, swept: t } }));
  const radius = B.sound.report;
  ctx.emit({ type: 'report', source: g.id, t, cause: shot, x: eye.x, y: eye.y, z: eye.z, surface: b.surface, loudness: radius / T.noise.radiusPerUnit, radius, suppressed: 0 });
}

/** The player takes a hit: their hits add up, by which part it struck. */
export function hurtPlayer(ctx: TickContext, p: PlayerEntity, part: BodyPart, shooter: number, cause: number): void {
  if (!p.health) return;
  const C = ctx.tuning.brain.combat;
  p.health.hits += C.damage[part];
  ctx.emit({ type: 'hurt', source: shooter, cause, part, hits: p.health.hits });
}

/** The lab's rules: the player who takes enough hits dies; the objective is done if the target falls, lost if he gets away. */
export const campRules: System = {
  name: 'camp-rules',
  phase: 'mission',
  reads: ['player.health', 'events', 'commander.camp'],
  writes: ['outcome', 'commander.camp.objective'],
  emits: ['outcome'],
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
        decide(ctx, 'succeeded', 'the target is down', death.source, death.id);
      }
    } else if (obj.status === 'escaped') {
      decide(ctx, 'failed', 'the target got away', p.id);
    }
  },
};
