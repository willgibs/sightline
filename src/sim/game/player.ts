import type { Tuning } from '../../config/tuning';
import { dcos, dsin } from '../kernel/core/detmath';
import type { World } from '../kernel/world/world';
import { Optic, type InputFrame } from '../kernel/input';
import { createBody, requestStance, type BodySpec, type BodyState, type Gait, type MotorContext, type MoveIntent } from '../body';
import type { Solids } from '../kernel/world/solids';

/**
 * The player: how input becomes what the player's body intends. Physics is the shared
 * motor's (body/motor.ts); this module holds only the rules of the controls.
 *
 * - Stance keys toggle. A prone change can't be interrupted, so a toggle pressed during
 *   one is queued (the latest wins) and applied when it ends.
 * - Sprinting from a crouch stands you up, unless you crouched while holding sprint;
 *   then release sprint first.
 * - Sprint needs standing, moving forward, and not being mid-way through a prone change.
 * - Walking backwards is slower, by up to backwardFactor.
 * - A lean is held (body/lean.ts), and sprinting gives it up.
 *
 * Numbers come from the player's body, tuning.bodies.player (design doc · Player · Movement).
 */

/** What the controls remember between ticks. */
export interface PlayerControl {
  /** A stance toggle pressed during a prone change, applied when it finishes. */
  queuedStance: 'crouch' | 'prone' | null;
  /** Crouched or went prone while holding sprint: don't auto-stand until sprint is released. */
  sprintSuppressed: boolean;
  /** Seconds a press of climb stays good, for a press made just early. */
  climbWait: number;
}

export function createPlayer(world: World, solids: Solids, tuning: Tuning): { body: BodyState; control: PlayerControl } {
  const { spawn } = world;
  return {
    body: createBody(world, solids, tuning.bodies.player, spawn.x, spawn.z, spawn.faceX, spawn.faceZ),
    control: { queuedStance: null, sprintSuppressed: false, climbWait: 0 },
  };
}

/** Turns this tick's input into the body's intent, starting any stance change it asks for. */
export function playerIntent(
  b: BodyState,
  c: PlayerControl,
  input: InputFrame,
  spec: BodySpec,
  ctx: Pick<MotorContext, 'world' | 'solids' | 'tick' | 'source' | 'emit' | 'dt'>,
  out: MoveIntent,
): MoveIntent {
  updateStance(b, c, input, spec, ctx);
  const busy = b.proneTransition;
  const wantsSprint = input.sprint && input.moveZ > 0.5 && b.stance === 'stand' && !busy;

  let mx = input.moveX;
  let mz = input.moveZ;
  const len = Math.sqrt(mx * mx + mz * mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  let gait: Gait;
  if (len < 0.05) gait = 'idle';
  else if (b.stance === 'prone' || busy) gait = 'crawl';
  else if (b.stance === 'crouch') gait = 'crouch';
  else gait = wantsSprint ? 'sprint' : 'walk';
  let speed = gait === 'idle' ? 0 : spec.speed[gait];
  // The backward share of the (already normalized) direction slows you, up to backwardFactor.
  if (mz < 0) speed *= 1 - (1 - spec.backwardFactor) * Math.min(1, -mz / Math.max(Math.min(len, 1), 1e-6));

  const sinY = dsin(input.yaw);
  const cosY = dcos(input.yaw);
  out.tick = ctx.tick;
  out.wishX = (cosY * mx - sinY * mz) * speed;
  out.wishZ = (-sinY * mx - cosY * mz) * speed;
  out.gait = gait;
  out.yaw = input.yaw;
  out.pitch = input.pitch;
  out.lean = gait === 'sprint' ? 0 : (input.lean ?? 0);
  out.raised = input.optic !== undefined && input.optic !== Optic.None;
  // A press is good for a moment, so one made just before reaching the wall still works.
  if (input.commands?.some((c) => c.kind === 'climb')) c.climbWait = spec.mantle.buffer;
  else if (c.climbWait > 0) c.climbWait = c.climbWait > ctx.dt ? c.climbWait - ctx.dt : 0;
  out.climb = b.motor !== 'mantle' && c.climbWait > 0;
  if (b.motor === 'mantle') c.climbWait = 0;
  return out;
}

function updateStance(b: BodyState, c: PlayerControl, input: InputFrame, spec: BodySpec, ctx: Pick<MotorContext, 'solids' | 'source' | 'emit'>): void {
  if (!input.sprint) c.sprintSuppressed = false;
  if (b.motor === 'mantle') return; // the hands are busy
  let request: 'crouch' | 'prone' | null = input.prone ? 'prone' : input.crouch ? 'crouch' : null;
  if (b.proneTransition) {
    if (request) c.queuedStance = request;
    return;
  }
  if (!request && c.queuedStance) {
    request = c.queuedStance;
    c.queuedStance = null;
  }
  if (request === 'prone') {
    requestStance(b, b.stance === 'prone' ? 'crouch' : 'prone', spec, ctx);
    if (input.sprint) c.sprintSuppressed = true;
  } else if (request === 'crouch') {
    requestStance(b, b.stance === 'crouch' ? 'stand' : 'crouch', spec, ctx);
    if (input.sprint && b.stance !== 'stand') c.sprintSuppressed = true;
  } else if (input.sprint && input.moveZ > 0.5 && b.stance === 'crouch' && !c.sprintSuppressed) {
    requestStance(b, 'stand', spec, ctx);
  }
}
