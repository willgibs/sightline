import { ballisticOf, markDirection, solveAim, unit, vec3, zeroOf, type Vec3 } from '../../ballistics';
import { bodyShape } from '../../body';
import { datan2 } from '../../kernel/core/detmath';
import { air, windAt } from '../../kernel/env';
import { Optic, type InputFrame } from '../../kernel/input';
import { emptyShape } from '../../kernel/world/shape';
import { player } from '../entities';
import type { Simulation } from '../sim';

/**
 * A marksman for the shooting range's headless run: a scripted shooter who makes every
 * decision right, from what the simulation knows (a test driver may see everything): he
 * goes prone, ranges with the binoculars, raises the scope, holds his breath, solves the
 * hold with the instruments' own function (ballistics/aim.ts), leads the walker, and
 * fires the instant the bolt allows, taking the sway into account as he presses. A step
 * can skip a decision on purpose, to miss the way a player who skipped it would.
 *
 * Deterministic: the same script, the same input, every run. Commands carry lag 0, so a
 * shot leaves at the start of the tick that consumes it.
 */

/** A guard by his camp post (aimed at his head, led as he walks), or a fixed point. */
export type Target = { post: number } | { x: number; y: number; z: number };

export type Step =
  | { at: number; act: 'prone' }
  | { at: number; act: 'scope' }
  | { at: number; act: 'binoculars' }
  /** Throw the throwable straight ahead, lifted by `pitchDeg`. */
  | { at: number; act: 'throw'; pitchDeg: number }
  | { at: number; act: 'range'; target: Target }
  | { at: number; act: 'fire'; target: Target; skip?: 'lead' | 'wind'; breath?: number; part?: 'head' | 'torso' | 'legs' };

export class MarksmanDriver {
  private done = 0;
  private optic: number = Optic.None;
  private readonly los = vec3();
  private readonly aim = vec3();
  private readonly target = vec3();
  private readonly shape = emptyShape();
  private readonly eye = vec3();

  constructor(private readonly steps: readonly Step[]) {}

  /** Every step so far has been taken: a driver that adds steps as it goes can add another. */
  get idle(): boolean {
    return this.done >= this.steps.length;
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const hz = sim.tuning.sim.tickHz;
    const now = sim.tick / hz;
    const p = player(sim.index);
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.breath = false;
    out.commands = [];

    // Steps whose time has come, in order; a shot waits for its bolt.
    for (;;) {
      const step = this.steps[this.done];
      if (!step || step.at > now) break;
      if (step.act === 'prone') out.prone = true;
      else if (step.act === 'scope') this.optic = Optic.Scope;
      else if (step.act === 'binoculars') this.optic = Optic.Binoculars;
      else if (step.act === 'throw') {
        this.optic = Optic.None;
        out.commands = [{ kind: 'throw', lag: 0, yaw: p.body.yaw, pitch: (step.pitchDeg * Math.PI) / 180 }];
      }
      else if (step.act === 'range') {
        // The laser goes straight: no hold, no lead.
        if (!this.solve(sim, step.target, false, false, true)) break;
        out.commands = [{ kind: 'range', lag: 0, ...this.angles(this.los) }];
      } else {
        const rifle = p.rifle;
        if (!rifle || rifle.bolt > 0 || rifle.fitting > 0) {
          out.breath = true;
          break;
        }
        if (this.solve(sim, step.target, step.skip === 'lead', step.skip === 'wind', false, step.part)) {
          // Press so that the line the sway takes the shot along is the solved one.
          const s = rifle.sway;
          const cmd = this.aim;
          cmd.x = this.los.x;
          cmd.y = this.los.y;
          cmd.z = this.los.z;
          const got = vec3();
          for (let k = 0; k < 6; k++) {
            markDirection(cmd, s.up, s.right, got);
            unit(cmd.x + this.los.x - got.x, cmd.y + this.los.y - got.y, cmd.z + this.los.z - got.z, cmd);
          }
          out.commands = [{ kind: 'fire', lag: 0, ...this.angles(cmd) }];
        }
      }
      this.done++;
      if (out.commands.length > 0) break;
    }
    out.optic = this.optic;

    // Hold the breath ahead of the next shot, and look where it will go.
    const next = this.steps[this.done];
    if (next?.act === 'fire' && now >= next.at - (next.breath ?? 0)) out.breath = true;
    if (out.commands.length > 0) {
      const c = out.commands[0]!;
      if (c.kind === 'fire' || c.kind === 'range' || c.kind === 'throw') {
        out.yaw = c.yaw;
        out.pitch = c.pitch;
      }
    } else if (next && (next.act === 'fire' || next.act === 'range') && this.solve(sim, next.target, false, false)) {
      const a = this.angles(this.los);
      out.yaw = a.yaw;
      out.pitch = a.pitch;
    } else {
      out.yaw = p.body.yaw;
      out.pitch = p.body.pitch;
    }
    return out;
  }

  /** The line of sight that puts a shot on the target now, into `los`; false if the target is gone. */
  private solve(sim: Simulation, t: Target, noLead: boolean, noWind: boolean, straight = false, part: 'head' | 'torso' | 'legs' = 'head'): boolean {
    const p = player(sim.index);
    const eye = this.eye;
    eye.x = p.body.x;
    eye.y = p.body.y + p.body.eyeHeight;
    eye.z = p.body.z;
    let vx = 0;
    let vz = 0;
    const at: Vec3 = this.target;
    if ('post' in t) {
      const g = sim.guards.find((e) => e.guard.spawn === t.post);
      if (!g) return false;
      bodyShape(g.body, sim.tuning.bodies.guard, this.shape);
      if (part === 'head') {
        at.x = this.shape.head.x;
        at.y = this.shape.head.y;
        at.z = this.shape.head.z;
      } else {
        const c = part === 'torso' ? this.shape.torso : this.shape.legs;
        at.x = (c.ax + c.bx) / 2;
        at.y = (c.ay + c.by) / 2;
        at.z = (c.az + c.bz) / 2;
      }
      vx = g.body.vx;
      vz = g.body.vz;
    } else {
      at.x = t.x;
      at.y = t.y;
      at.z = t.z;
    }
    const rifle = p.rifle;
    if (!rifle || straight) {
      unit(at.x - eye.x, at.y - eye.y, at.z - eye.z, this.los);
      return true;
    }
    const env = sim.world.spec.env;
    const a = air(env);
    const wind = windAt(env, sim.tick / sim.tuning.sim.tickHz, { x: 0, z: 0 });
    const b = ballisticOf(rifle, sim.tuning, a.density, noWind ? { x: 0, z: 0 } : wind);
    const zero = zeroOf(rifle, sim.tuning, a.density);
    solveAim(eye, at, noLead ? 0 : vx, noLead ? 0 : vz, zero, b, sim.tuning.ballistics.maxFlight, this.los);
    return true;
  }

  private angles(d: Vec3): { yaw: number; pitch: number } {
    return { yaw: datan2(-d.x, -d.z), pitch: datan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) };
  }
}
