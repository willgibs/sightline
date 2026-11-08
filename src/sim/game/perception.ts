import { bodyShape, hasBody, type BodyEntity } from '../body';
import { dcos, dsin } from '../kernel/core/detmath';
import type { DebugDraw } from '../kernel/debugDraw';
import { Faction, type Entity } from '../kernel/state';
import type { System, TickContext } from '../kernel/systems';
import { emptyShape } from '../kernel/world/shape';
import {
  createSenses,
  edgeWidth,
  emptyExposure,
  exposure,
  lightName,
  stepMeter,
  type Exposure,
  type Observer,
  type Senses,
  type SightTarget,
} from '../perception';
import type { GuardEntity } from './entities';
import type { Simulation } from './sim';

/**
 * Perception for Sightline's guards: the perception lane's sight, hearing and awareness
 * (sim/perception), run over the guards that have senses, toward the bodies of the other
 * side. Until it joins the valley (A13) these systems run only where a scene adds them:
 * the perception lab and its scenarios (`PERCEPTION`).
 *
 * Each guard looks from his eye, along his body's yaw plus his head turn. Who is of the
 * other side comes from factions, never from who someone is: a guard of the camp looks at
 * every body that isn't.
 */

/** Gives every guard senses: a scene's setup, where perception runs. Marksmen get the far zone. */
export function giveSenses(sim: Simulation): void {
  for (const g of sim.guards) g.senses ??= createSenses(sim.world.camp.guards[g.guard.spawn]?.role === 'marksman');
}

/** The eye a guard looks from, written to `out`. */
export function guardEye(g: GuardEntity, senses: Senses, out: Observer): Observer {
  const b = g.body;
  out.id = g.id;
  out.x = b.x;
  out.y = b.y + b.eyeHeight;
  out.z = b.z;
  out.yaw = b.yaw + g.guard.headYaw;
  out.pitch = b.pitch;
  out.far = senses.far;
  out.sharp = senses.awareness.sharp;
  return out;
}

/** True if a body is of a side `faction` watches: any side but its own and no one's. */
function otherSide(e: Entity, faction: number): e is BodyEntity {
  return e.faction !== faction && e.faction !== Faction.None && hasBody(e);
}

const eye: Observer = { id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, far: false, sharp: 1 };
const seen = emptyExposure();
const best = emptyExposure();
const target: SightTarget = { id: 0, body: null as never, spec: null as never, shape: emptyShape() };

/**
 * Sight: every guard with senses looks at every body of the other side; the most exposed
 * fills his meter. The meter's rise through the cue is 'noticed', its arrival at 1
 * 'detected', which carries every factor that filled it.
 */
export const perceptionSight: System = {
  name: 'perception-sight',
  phase: 'perception',
  reads: ['*.body', 'guard.guard', 'guard.senses', 'solid.solid'],
  writes: ['guard.senses.sight'],
  emits: ['noticed', 'detected'],
  run(ctx, dt) {
    const T = ctx.tuning;
    const t = ctx.tick / T.sim.tickHz;
    const env = ctx.world.spec.env;
    let view = null as ReturnType<TickContext['query']> | null;
    for (const g of ctx.index.of('guard')) {
      const s = g.senses;
      if (!s) continue;
      guardEye(g, s, eye);
      best.rate = 0;
      best.zone = 'none';
      let who = 0;
      for (const e of ctx.state.entities) {
        if (!otherSide(e, g.faction)) continue;
        view ??= ctx.query();
        target.id = e.id;
        target.body = e.body;
        target.spec = T.bodies[e.kind];
        bodyShape(e.body, target.spec, target.shape);
        exposure(view, env, t, T, eye, target, seen);
        if (who === 0 || seen.rate > best.rate) {
          copyExposure(seen, best);
          who = e.id;
        }
      }
      const sight = s.sight;
      const step = stepMeter(sight, best.rate, dt, ctx.tick, T);
      if (best.rate > 0) {
        sight.target = who;
        sight.x = best.rays[1].x;
        sight.y = best.rays[1].y;
        sight.z = best.rays[1].z;
      }
      if (step.noticed) {
        sight.noticed = ctx.emit({ type: 'noticed', source: g.id, target: sight.target, x: sight.x, y: sight.y, z: sight.z, distance: best.distance, zone: best.zone });
        sight.detected = 0;
      }
      // Seen once, he has seen you: a dip and a return while he still has you isn't news.
      if (step.detected && sight.detected === 0) {
        sight.detected = ctx.emit({
          type: 'detected',
          source: g.id,
          cause: sight.noticed,
          target: sight.target,
          x: sight.x,
          y: sight.y,
          z: sight.z,
          distance: best.distance,
          angle: best.angleDeg,
          zone: best.zone,
          stance: best.stance,
          light: best.light,
          skyline: best.skyline,
          range: best.range,
          movement: best.movement,
          cover: best.cover,
          rate: best.rate,
        });
      }
      if (step.lost) {
        sight.noticed = 0;
        sight.detected = 0;
      }
      if (who !== 0) ctx.debug((draw) => drawSight(draw, ctx, g, best));
    }
  },
};

/** The perception lab's systems, each in its phase (scenes add them with `systems`). */
export const PERCEPTION: readonly System[] = [perceptionSight];

function copyExposure(a: Exposure, b: Exposure): void {
  b.distance = a.distance;
  b.angleDeg = a.angleDeg;
  b.zone = a.zone;
  b.cone = a.cone;
  b.stance = a.stance;
  b.light = a.light;
  b.skyline = a.skyline;
  b.range = a.range;
  b.edge = a.edge;
  b.seconds = a.seconds;
  b.movement = a.movement;
  b.cover = a.cover;
  b.clear = a.clear;
  b.rate = a.rate;
  b.capped = a.capped;
  for (let k = 0; k < 3; k++) Object.assign(b.rays[k]!, a.rays[k]!);
}

/**
 * A guard's sight in the debug view: his zones at their real ranges for the body he's
 * looking at as it is now (the caps of its stance and light), each with its edge band; the
 * contact zone; the three rays (clear, through foliage, blocked; against the sky); and the
 * factors, over his head.
 */
function drawSight(draw: DebugDraw, ctx: TickContext, g: GuardEntity, x: Exposure): void {
  const T = ctx.tuning;
  const S = T.perception.sight;
  const b = g.body;
  const yaw = b.yaw + g.guard.headYaw;
  const caps = x.stance * (x.light || T.visibility.light.lit);
  const ground = (px: number, pz: number): number => ctx.world.terrain.heightAt(px, pz) + 0.12;
  const arc = (half: number, range: number, tone: 'info' | 'muted' | 'warn'): void => {
    if (!(range > 0)) return;
    const n = Math.max(6, Math.ceil(half / 4));
    let px = b.x;
    let pz = b.z;
    for (let k = 0; k <= n; k++) {
      const a = yaw - (half * Math.PI) / 180 + ((2 * half * Math.PI) / 180) * (k / n);
      const qx = b.x - dsin(a) * range;
      const qz = b.z - dcos(a) * range;
      if (k === 0) draw.line(b.x, ground(b.x, b.z), b.z, qx, ground(qx, qz), qz, tone);
      else draw.line(px, ground(px, pz), pz, qx, ground(qx, qz), qz, tone);
      px = qx;
      pz = qz;
    }
    draw.line(px, ground(px, pz), pz, b.x, ground(b.x, b.z), b.z, tone);
  };
  const zone = (half: number, reference: number): void => {
    const r = reference * caps;
    const w = edgeWidth(r, S);
    arc(half, r, 'info');
    arc(half, r + w / 2, 'muted');
    if (r - w / 2 > 0) arc(half, r - w / 2, 'muted');
  };
  zone(S.core.halfDeg, S.core.range);
  zone(S.peripheral.halfDeg, S.peripheral.range);
  if (g.senses?.far) zone(S.far.halfDeg, S.far.range);
  draw.circle(b.x, ground(b.x, b.z), b.z, S.contact.range, 'warn');
  const ex = b.x;
  const ey = b.y + b.eyeHeight;
  const ez = b.z;
  for (const r of x.rays) {
    const tone = !r.clear ? 'bad' : r.through < 0.5 ? 'warn' : 'good';
    draw.line(ex, ey, ez, r.x, r.y, r.z, x.distance > 0 && (r.clear || x.zone !== 'none') ? tone : 'muted');
    if (r.sky > 0) draw.point(r.x, r.y, r.z, 0.04 + 0.12 * r.sky, 'info');
  }
  const m = g.senses?.sight.meter ?? 0;
  const core = S.core.range * caps;
  const where =
    x.zone !== 'none'
      ? `${x.zone} · ${x.distance.toFixed(0)} m of ${x.range.toFixed(0)} m`
      : x.angleDeg > S.peripheral.halfDeg + S.edgeDeg / 2
        ? `out of his cones · ${x.distance.toFixed(0)} m`
        : `${x.distance.toFixed(0)} m, beyond the ${core.toFixed(0)} m his core reaches for this body`;
  const text =
    `${Math.round(m * 100)}% · ${where} · ${x.light ? lightName(x.light, T) : 'light not taken'} · ${(x.cover * 100).toFixed(0)}% in view` +
    `${x.skyline > 1 ? ` · sky ×${x.skyline.toFixed(2)}` : ''} · ${x.rate > 0 ? `${(1 / x.rate).toFixed(1)} s to fill${x.capped ? ' (capped)' : ''}` : 'not filling'}`;
  draw.label(b.x, b.y + b.eyeHeight + 0.6, b.z, text, m >= 1 ? 'bad' : m >= S.cue ? 'warn' : 'muted');
}
