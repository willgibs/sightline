import { crackAt, flightEnd, glint, vec3, viewLine, type Crack, type Flight } from '../ballistics';
import { bodyShape, hasBody, type BodyEntity, type BodyState } from '../body';
import { dcos, dsin } from '../kernel/core/detmath';
import type { DebugDraw } from '../kernel/debugDraw';
import { air, sunDirection } from '../kernel/env';
import { isSound, type AlertReason, type SimEvent, type SoundFields } from '../kernel/events';
import { Optic } from '../kernel/input';
import { Faction, type Entity } from '../kernel/state';
import { Surface } from '../kernel/world/surfaces';
import type { System, TickContext } from '../kernel/systems';
import { emptyShape } from '../kernel/world/shape';
import {
  BARKS,
  HEARD_AS,
  acousticsOf,
  believe,
  chooseBark,
  rung,
  type AwarenessState,
  createSenses,
  prunePercepts,
  soundLevel,
  stepLadder,
  stimulate,
  type Percept,
  emptyHeard,
  inGaze,
  lineOpen,
  type Acoustics,
  type PendingSound,
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
import { collapse, remainsShape } from './remains';
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

/**
 * Gives every guard senses: a scene's setup, where perception runs. Marksmen get the far
 * zone. The world's steady sounds are flooded now, between ticks, so no tick pays for them.
 */
export function giveSenses(sim: Simulation): void {
  for (const g of sim.guards) g.senses ??= createSenses(sim.world.camp.guards[g.guard.spawn]?.role === 'marksman');
  acousticsOf(sim.world, sim.tuning).warm();
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

const heard = emptyHeard();
const ear = { x: 0, y: 0, z: 0 };

/**
 * Delivers a sound to every guard with senses who could hear it: floods it once
 * (perception/hearing.ts), reads each listener's cell, and queues what each hears for when
 * it arrives, as a guess blurred from his own stream. Guards ignore the routine noise of
 * their own side (a comrade's footsteps), never a voice. Called by the hearing system for
 * the sounds made before it in the tick, and by any later system that makes one (a bark).
 */
export function deliverSound(ctx: TickContext, e: Extract<SimEvent, SoundFields>): void {
  const T = ctx.tuning;
  const H = T.perception.hearing;
  const kind: PendingSound['kind'] = HEARD_AS[e.type] ?? 'sound';
  const maker = ctx.index.get(e.source);
  const side = maker ? maker.faction : Faction.None;
  let acoustics: Acoustics | null = null;
  for (const g of ctx.index.of('guard')) {
    const s = g.senses;
    if (!s || g.id === e.source) continue;
    if (kind !== 'voice' && side === g.faction) continue;
    const b = g.body;
    ear.x = b.x;
    ear.y = b.y + b.eyeHeight;
    ear.z = b.z;
    const dx = ear.x - e.x;
    const dz = ear.z - e.z;
    // Beyond its radius in a straight line, no route makes it audible.
    if (dx * dx + dz * dz > e.radius * e.radius) continue;
    if (!acoustics) {
      acoustics = acousticsOf(ctx.world, T);
      acoustics.spread(e, ctx.work);
    }
    acoustics.hear(ear.x, ear.y, ear.z, heard);
    if (heard.clarity < 1) continue;
    // A guess, not a fix: blurred by its distance, and more by how far round it came.
    const radius = H.blur.min + H.blur.distance * heard.straight + H.blur.detour * (heard.length - heard.straight);
    const [ox, oz] = ctx.draw(g.id, 'hearing', (rng) => {
      const r = radius * Math.sqrt(rng.next());
      const a = rng.next() * 2 * Math.PI;
      return [r * dcos(a), r * dsin(a)] as const;
    });
    const arrives = Math.max(ctx.tick, Math.ceil((e.t + heard.length / air(ctx.world.spec.env).speedOfSound) * T.sim.tickHz - 1e-9));
    const voice = e.type === 'bark' ? (BARKS[e.line]?.level ?? 0) : e.type === 'cry' ? T.perception.awareness.cry : 0;
    s.heard.push({ arrives, cause: e.id, kind, clarity: heard.clarity, voice, x: heard.fromX + ox, y: heard.fromY, z: heard.fromZ + oz, radius });
  }
}

/** Hearing: every sound made so far this tick reaches the guards who can hear it. */
export const perceptionHearing: System = {
  name: 'perception-hearing',
  phase: 'perception',
  after: ['perception-sight'],
  reads: ['events', '*.body', 'guard.senses', 'solid.solid'],
  writes: ['guard.senses.heard', 'rng.hearing'],
  emits: [],
  run(ctx) {
    for (const e of ctx.events) {
      if (isSound(e)) deliverSound(ctx, e);
      else if (e.type === 'shot' && e.speed > 0) deliverCrack(ctx, e);
    }
  },
};

const flight: Flight = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, t: 0, v0: 0, k: 0, g: 0, wx: 0, wz: 0 };
const listener = vec3();
const crackOut: Crack = { t: 0, emitted: 0, x: 0, y: 0, z: 0, distance: 0 };

/**
 * The crack of a bullet passing (lab B's flight, its geometry in ballistics/crack.ts): each
 * guard near the path hears a shot from where the shock left it, not from the shooter, and
 * when it gets to him; the report, from the muzzle, comes later by the law of sound.
 */
function deliverCrack(ctx: TickContext, e: Extract<SimEvent, { type: 'shot' }>): void {
  const T = ctx.tuning;
  const H = T.perception.hearing;
  const c = air(ctx.world.spec.env).speedOfSound;
  flight.x = e.x;
  flight.y = e.y;
  flight.z = e.z;
  flight.dx = e.dx;
  flight.dy = e.dy;
  flight.dz = e.dz;
  flight.t = e.t;
  flight.v0 = e.speed;
  flight.k = e.drag;
  flight.g = T.sim.gravity;
  flight.wx = e.wx;
  flight.wz = e.wz;
  const maker = ctx.index.get(e.source);
  const side = maker ? maker.faction : Faction.None;
  const guards = ctx.index.of('guard');
  if (!guards.some((g) => g.senses)) return;
  // The path ends where the bullet meets the world; there's no crack past that.
  const until = flightEnd(flight, e.t + T.ballistics.maxFlight, 1 / T.sim.tickHz, ctx.query());
  for (const g of guards) {
    const s = g.senses;
    if (!s || g.id === e.source || side === g.faction) continue;
    listener.x = g.body.x;
    listener.y = g.body.y + g.body.eyeHeight;
    listener.z = g.body.z;
    const crack = crackAt(flight, until, listener, c, crackOut);
    if (!crack || crack.distance > T.ballistics.sound.crack) continue;
    const radius = H.blur.min + H.blur.distance * crack.distance;
    const [ox, oz] = ctx.draw(g.id, 'hearing', (rng) => {
      const r = radius * Math.sqrt(rng.next());
      const a = rng.next() * 2 * Math.PI;
      return [r * dcos(a), r * dsin(a)] as const;
    });
    const arrives = Math.max(ctx.tick, Math.ceil(crack.t * T.sim.tickHz - 1e-9));
    s.heard.push({ arrives, cause: e.id, kind: 'shot', clarity: T.ballistics.sound.crack / Math.max(crack.distance, 1), voice: 0, x: crack.x + ox, y: crack.y, z: crack.z + oz, radius });
  }
}

const aim = vec3();
const toEye = vec3();
const sunNow = vec3();
/** What sight reads of a body, for one left on the ground (it neither stands nor walks). */
const fallen = { x: 0, y: 0, z: 0, yaw: 0, eyeHeight: 0, speed: 0 } as unknown as BodyState;

/**
 * Spotting (A9): what a guard can catch sight of that isn't a person. A body, by the same
 * law of sight as a body lying still (so a body in the shade or behind a wall is safe, and
 * one falling in plain view is seen falling); each one is news once. A flash from a lens
 * pointed his way with the sun behind it, if he is looking that way (ballistics/glint.ts).
 * What he does about them is the ladder's ('perception-awareness').
 */
export const perceptionSpotting: System = {
  name: 'perception-spotting',
  phase: 'perception',
  after: ['perception-hearing'],
  reads: ['*.body', 'remains.remains', 'player.rifle', 'input', 'guard.guard', 'guard.senses', 'solid.solid'],
  writes: ['guard.senses.bodies', 'guard.senses.spotted', 'guard.senses.flashed'],
  emits: ['spotted'],
  run(ctx) {
    const T = ctx.tuning;
    const S = T.perception.sight;
    const remains = ctx.index.of('remains');
    const armed = ctx.index.of('player')[0];
    if (remains.length === 0 && !armed?.rifle) return;
    const t = ctx.tick / T.sim.tickHz;
    const env = ctx.world.spec.env;
    const spec = T.bodies.guard;
    const view = ctx.query();
    if (armed?.rifle) {
      viewLine(armed.body.yaw, armed.body.pitch, armed.rifle.sway, aim);
      sunDirection(env, t, sunNow);
    }
    for (const g of ctx.index.of('guard')) {
      const s = g.senses;
      if (!s) continue;
      guardEye(g, s, eye);
      for (const r of remains) {
        if (s.bodies.includes(r.id)) continue;
        const c = collapse(r.remains, t, T);
        fallen.x = r.remains.x;
        fallen.y = r.remains.y;
        fallen.z = r.remains.z;
        fallen.yaw = r.remains.yaw;
        fallen.eyeHeight = r.remains.eye + (spec.eyeHeight.prone - r.remains.eye) * c;
        fallen.speed = c < 1 ? spec.speed.walk : 0;
        target.id = r.id;
        target.body = fallen;
        target.spec = spec;
        remainsShape(r.remains, t, T, target.shape);
        exposure(view, env, t, T, eye, target, seen);
        if (seen.rate <= 0) continue;
        s.bodies.push(r.id);
        const chest = seen.rays[1];
        // Seen as he fell, this is the same tick's death; found later, nothing else says why.
        const death = ctx.events.find((e) => e.type === 'death' && e.remains === r.id);
        const cause = ctx.emit({ type: 'spotted', source: g.id, cause: death?.id ?? 0, what: 'body', x: chest.x, y: chest.y, z: chest.z, distance: seen.distance });
        s.spotted.push({ what: 'body', cause, x: chest.x, y: chest.y, z: chest.z, radius: 0.5, strength: 1 });
      }
      if (!armed?.rifle) continue;
      // The flash: where the player's lens is, toward this guard's eye.
      const p = armed.body;
      const lx = p.x;
      const ly = p.y + p.eyeHeight;
      const lz = p.z;
      const dx = eye.x - lx;
      const dy = eye.y - ly;
      const dz = eye.z - lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let flashing = false;
      if (d > 1e-6 && d <= S.glint.range) {
        toEye.x = dx / d;
        toEye.y = dy / d;
        toEye.z = dz / d;
        const up = ctx.input.optic === Optic.Binoculars ? 1 : armed.rifle.raise;
        const flash = glint(aim, up, sunNow, toEye, T.ballistics.glint);
        if (flash >= S.glint.min && (inGaze(eye, lx, ly, lz, S.core.halfDeg) || (eye.far && inGaze(eye, lx, ly, lz, S.far.halfDeg))) && lineOpen(view, eye, lx, ly, lz, 0.4, S.glint.through)) {
          flashing = true;
          if (!s.flashed) {
            const cause = ctx.emit({ type: 'spotted', source: g.id, what: 'glint', x: lx, y: ly, z: lz, distance: d });
            s.spotted.push({ what: 'glint', cause, x: lx, y: ly, z: lz, radius: 0.5 + 0.02 * d, strength: flash });
          }
        }
      }
      s.flashed = flashing;
    }
    // What's been caught sight of, drawn for the debug view: each guard to the bodies he has seen, and to a lens flashing at him.
    ctx.debug((draw) => {
      for (const r of remains) draw.label(r.remains.x, r.remains.y + 0.7, r.remains.z, 'body', 'warn');
      for (const g of ctx.index.of('guard')) {
        const s = g.senses;
        if (!s) continue;
        const b = g.body;
        const y = b.y + b.eyeHeight;
        for (const r of remains) if (s.bodies.includes(r.id)) draw.line(b.x, y, b.z, r.remains.x, r.remains.y + 0.3, r.remains.z, 'warn');
        if (s.flashed && armed) draw.line(b.x, y, b.z, armed.body.x, armed.body.y + armed.body.eyeHeight, armed.body.z, 'bad');
      }
    });
  },
};

/**
 * Awareness: what each guard sensed becomes percepts and belief, and moves him on the
 * awareness ladder (perception/awareness.ts). Sounds are heard as they arrive ('heard',
 * caused by the sound); a change of state is an 'alert', caused by the percept that made it.
 */
export const perceptionAwareness: System = {
  name: 'perception-awareness',
  phase: 'awareness',
  reads: ['guard.senses', 'guard.body'],
  writes: ['guard.senses', 'rng.awareness', 'rng.hearing'],
  emits: ['heard', 'alert', 'bark'],
  run(ctx) {
    const T = ctx.tuning;
    const S = T.perception.sight;
    const hz = T.sim.tickHz;
    const tick = ctx.tick;
    for (const g of ctx.index.of('guard')) {
      const s = g.senses;
      if (!s) continue;
      const draw = (): number => ctx.draw(g.id, 'awareness', (rng) => rng.next());
      const a = s.awareness;
      prunePercepts(s.percepts, tick);
      // Sight: someone in view at the cue or above is a percept, and where he believes they are.
      const sight = s.sight;
      if (sight.seenTick === tick && sight.meter >= S.cue) {
        const b = g.body;
        const dx = sight.x - b.x;
        const dz = sight.z - b.z;
        const p: Percept = {
          kind: 'sight',
          x: sight.x,
          y: sight.y,
          z: sight.z,
          radius: 0.5 + 0.01 * Math.sqrt(dx * dx + dz * dz),
          strength: sight.meter,
          tick,
          expires: tick + Math.round(S.hold * hz),
          cause: sight.detected || sight.noticed,
        };
        const at = s.percepts.findIndex((q) => q.kind === 'sight');
        if (at >= 0) s.percepts.splice(at, 1);
        s.percepts.push(p);
        believe(s, p, sight.detected !== 0, tick, T);
        a.focus = true;
        a.fx = sight.x;
        a.fy = sight.y;
        a.fz = sight.z;
      }
      // Sounds that have arrived, in the order they were queued.
      for (let k = 0; k < s.heard.length; ) {
        const h = s.heard[k]!;
        if (h.arrives > tick) {
          k++;
          continue;
        }
        s.heard.splice(k, 1);
        const id = ctx.emit({ type: 'heard', source: g.id, cause: h.cause, kind: h.kind, clarity: h.clarity, x: h.x, y: h.y, z: h.z, radius: h.radius });
        const p: Percept = { kind: h.kind, x: h.x, y: h.y, z: h.z, radius: h.radius, strength: h.clarity, tick, expires: tick + Math.round(T.perception.hearing.keep * hz), cause: id };
        s.percepts.push(p);
        if (h.kind !== 'voice') believe(s, p, false, tick, T);
        const reason = h.kind === 'shot' ? 'shot' : h.kind === 'voice' ? 'voice' : 'heard';
        stimulate(a, { kind: h.kind, level: soundLevel(h, T), x: h.x, y: h.y, z: h.z, cause: id, reason }, tick, T, draw);
      }
      // What he has just caught sight of: a body, a flash.
      for (const sp of s.spotted) {
        const keep = sp.what === 'body' ? T.perception.awareness.keepBody : T.perception.hearing.keep;
        const p: Percept = { kind: sp.what, x: sp.x, y: sp.y, z: sp.z, radius: sp.radius, strength: sp.strength, tick, expires: tick + Math.round(keep * hz), cause: sp.cause };
        s.percepts.push(p);
        stimulate(a, { kind: sp.what, level: sp.what === 'body' ? T.perception.awareness.body : T.perception.awareness.glint, x: sp.x, y: sp.y, z: sp.z, cause: sp.cause, reason: sp.what }, tick, T, draw);
      }
      s.spotted.length = 0;
      prunePercepts(s.percepts, tick);
      const searched = a.searched;
      const change = stepLadder(a, sight.meter, sight.detected || sight.noticed, tick, T, draw);
      if (!change) continue;
      const alert = ctx.emit({ type: 'alert', source: g.id, cause: change.cause, from: change.from, to: change.to, reason: change.reason });
      bark(ctx, g, s, change.to, change.reason, rung(change.to) > rung(change.from), searched, alert);
    }
  },
};

/**
 * A guard says the line for his change of state (perception/barks.ts), and it's heard: a
 * voice, by the law of sound, which raises the guards who hear it to its line's level.
 */
function bark(ctx: TickContext, g: GuardEntity, s: Senses, to: AwarenessState, reason: AlertReason, rising: boolean, afterSearch: boolean, cause: number): void {
  const B = ctx.tuning.perception.barks;
  const line = chooseBark(to, reason, rising, afterSearch, s.barked, ctx.tick, Math.round(B.cooldown * ctx.tuning.sim.tickHz));
  if (line === null) return;
  s.barked[String(line)] = ctx.tick;
  const b = g.body;
  const radius = BARKS[line]!.shout ? B.shout : B.radius;
  ctx.emit({ type: 'bark', source: g.id, cause, line, x: b.x, y: b.y + b.eyeHeight - ctx.tuning.perception.hearing.lift, z: b.z, surface: Surface.Grass, loudness: radius / ctx.tuning.noise.radiusPerUnit, radius });
  // Made after hearing ran this tick: delivered here, as the sound it is.
  const e = ctx.events[ctx.events.length - 1]!;
  if (e.type === 'bark') deliverSound(ctx, e);
}

/** The perception lab's systems, each in its phase (scenes add them with `systems`). */
export const PERCEPTION: readonly System[] = [perceptionSight, perceptionHearing, perceptionSpotting, perceptionAwareness];

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
