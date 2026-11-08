import type { Tuning } from '../../config/tuning';
import { boreLine, holdBetween, lineOfSight, solveAim, unit, vec3, zeroOf, type Ballistic, type Hold, type Vec3 } from '../ballistics';
import { bodyShape, poseAt, type PoseSample } from '../body';
import { air } from '../kernel/env';
import type { Command } from '../kernel/commands';
import type { ShotEvent } from '../kernel/events';
import { emptyShape } from '../kernel/world/shape';
import { player } from './entities';
import type { Simulation } from './sim';

/**
 * What decided each shot (lab B, B10): the miss broken down into range, lead, wind and
 * sway, in mils, so the owner's verdict on the 300 m walker can be checked against what
 * actually happened (docs/phase-1-plan.md, Exit tests, B).
 *
 * For a shot, its target is the guard whose head it came closest to being aimed at. What
 * the shot needed is solved with the instruments' own function (ballistics/aim.ts) from
 * where the guard's head was at the shot's instant and how he was walking: the drop for
 * his range at the dialled zero, the lead for his walk, the wind's push. What the player
 * held is the line of sight they pressed on; the sway is the difference between that and
 * the line the bullet left on. Then:
 *   range  the height of the hold against the drop needed (and the range error it implies);
 *   lead and wind  the sideways hold against the two needed, attributed to whichever the
 *          player most nearly left out;
 *   sway   what the rifle's wander added at the press.
 *
 * Read after the tick that fired the shot, with that tick's fire command.
 */

export interface ShotReport {
  /** The shot event's id and time. */
  shot: number;
  t: number;
  /** The guard aimed at: his entity id, camp post and range; null if none was near the aim. */
  target: { id: number; post: number; range: number; walking: boolean } | null;
  /** Mils, in the scope's frame: what the shot needed (by part), what was held, and the sway. */
  needed: { drop: number; lead: number; wind: number };
  held: Hold;
  sway: Hold;
  /** The errors, mils: positive is high or right. `rangeM` is the range error the height implies. */
  errors: { range: number; rangeM: number; lead: number; wind: number; sway: number };
  /** Which sideways decision the player most nearly skipped, if either. */
  skipped: 'none' | 'lead' | 'wind' | 'both';
  /** Where the shot went, relative to his head: mils up and right. */
  miss: Hold;
}

/** The end screen's columns: the header for `shotRow`'s lines. */
export const SHOT_COLUMNS = ` #  ${'aimed at'.padEnd(13)} ${'struck'.padEnd(16)}${'range'.padStart(7)}${'lead'.padStart(7)}${'wind'.padStart(7)}${'sway'.padStart(7)}`;

/**
 * A shot on one line in `SHOT_COLUMNS`' columns, for the end screen: fifteen of them
 * have to fit on it at once, so what each shot needed stays in `describeShot`.
 */
export function shotRow(r: ShotReport, result: string, n: number): string {
  const num = String(n).padStart(2);
  const struck = result.replace(/^missed, /, '').padEnd(16);
  const sway = r.errors.sway.toFixed(2).padStart(7);
  if (!r.target) return `${num}  ${'no guard near'.padEnd(13)} ${struck}${'–'.padStart(7).repeat(3)}${sway}`;
  const who = `${r.target.range.toFixed(0)} m ${r.target.walking ? 'walker' : 'guard'}`.padEnd(13);
  const column = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`.padStart(7);
  return `${num}  ${who} ${struck}${column(r.errors.range)}${column(r.errors.lead)}${column(r.errors.wind)}${sway}`;
}

const pose: PoseSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 0, lean: 0 };
const shape = emptyShape();

/** The breakdown of a shot fired in the tick just run (`sim` after it), with the command that fired it. */
export function analyzeShot(sim: Simulation, shot: ShotEvent, cmd: Extract<Command, { kind: 'fire' }>): ShotReport {
  const T: Tuning = sim.tuning;
  const eye: Vec3 = { x: shot.x, y: shot.y, z: shot.z };
  const rifle = player(sim.index).rifle;
  const density = air(sim.world.spec.env).density;
  const zero = zeroOf(rifle ?? { load: T.ballistics.rifle.load, zero: T.ballistics.rifle.zero.start }, T, density);
  const windy: Ballistic = { v0: shot.speed, k: shot.drag, g: T.sim.gravity, wx: shot.wx, wz: shot.wz };
  const still: Ballistic = { ...windy, wx: 0, wz: 0 };
  const maxFlight = T.ballistics.maxFlight;
  // The lines: pressed on, and left on (the bore turned back down by the zero).
  const pressed = lineOfSight(cmd.yaw, cmd.pitch, vec3());
  const left = boreLine(shot.dx, shot.dy, shot.dz, zero.cos, -zero.sin, vec3());
  // The shot's instant was the command's lag before the tick began: one tick more, now.
  const lag = cmd.lag + 1;
  let best: { id: number; post: number; head: Vec3; vx: number; vz: number; off: number } | null = null;
  const sight = vec3();
  for (const g of sim.guards) {
    poseAt(g.body, lag, pose);
    const head = bodyShape(pose, T.bodies.guard, shape).head;
    const at = { x: head.x, y: head.y, z: head.z };
    solveAim(eye, at, g.body.vx, g.body.vz, zero, windy, maxFlight, sight);
    const h = holdBetween(left, sight, { up: 0, right: 0 });
    const off = Math.sqrt(h.up * h.up + h.right * h.right);
    if (off < 15 && (!best || off < best.off)) best = { id: g.id, post: g.guard.spawn, head: at, vx: g.body.vx, vz: g.body.vz, off };
  }
  // Guards killed by this very shot are gone now: their bodies say where they stood.
  for (const r of sim.index.of('remains')) {
    const m = r.remains;
    const since = m.fell - shot.t;
    if (since < 0 || since > maxFlight) continue;
    // Where his head was at the shot's instant: back along his walk from where he fell.
    const head = bodyShape({ x: m.x - m.vx * since, y: m.y, z: m.z - m.vz * since, yaw: m.yaw, eyeHeight: m.eye, lean: 0 }, T.bodies.guard, shape).head;
    const at = { x: head.x, y: head.y, z: head.z };
    solveAim(eye, at, m.vx, m.vz, zero, windy, maxFlight, sight);
    const h = holdBetween(left, sight, { up: 0, right: 0 });
    const off = Math.sqrt(h.up * h.up + h.right * h.right);
    if (off < 15 && (!best || off < best.off)) best = { id: m.of, post: m.post, head: at, vx: m.vx, vz: m.vz, off };
  }
  const empty: Hold = { up: 0, right: 0 };
  if (!best) {
    return {
      shot: shot.id,
      t: shot.t,
      target: null,
      needed: { drop: 0, lead: 0, wind: 0 },
      held: empty,
      sway: holdBetween(pressed, left, { up: 0, right: 0 }),
      errors: { range: 0, rangeM: 0, lead: 0, wind: 0, sway: 0 },
      skipped: 'none',
      miss: empty,
    };
  }
  const to = unit(best.head.x - eye.x, best.head.y - eye.y, best.head.z - eye.z, vec3());
  const range = Math.sqrt((best.head.x - eye.x) * (best.head.x - eye.x) + (best.head.y - eye.y) * (best.head.y - eye.y) + (best.head.z - eye.z) * (best.head.z - eye.z));
  // What it needed, part by part: still air and a still target, then the walk, then the wind.
  solveAim(eye, best.head, 0, 0, zero, still, maxFlight, sight);
  const drop = holdBetween(sight, to, { up: 0, right: 0 });
  solveAim(eye, best.head, best.vx, best.vz, zero, still, maxFlight, sight);
  const led = holdBetween(sight, to, { up: 0, right: 0 });
  solveAim(eye, best.head, best.vx, best.vz, zero, windy, maxFlight, sight);
  const all = holdBetween(sight, to, { up: 0, right: 0 });
  const needed = { drop: drop.up, lead: led.right - drop.right, wind: all.right - led.right };
  const held = holdBetween(pressed, to, { up: 0, right: 0 });
  const went = holdBetween(left, to, { up: 0, right: 0 });
  const sway = { up: went.up - held.up, right: went.right - held.right };
  // The range the held height implies: the drop changes by about its slope per metre here.
  solveAim(eye, { x: eye.x + to.x * (range + 10), y: eye.y + to.y * (range + 10), z: eye.z + to.z * (range + 10) }, 0, 0, zero, still, maxFlight, sight);
  const farther = holdBetween(sight, to, { up: 0, right: 0 }).up;
  const perMetre = (farther - drop.up) / 10;
  const rangeErr = held.up - all.up;
  // Sideways: which decision the hold looks like it left out.
  const side = held.right - all.right;
  const fits: Array<[ShotReport['skipped'], number]> = [
    ['none', Math.abs(side)],
    ['lead', Math.abs(side + needed.lead)],
    ['wind', Math.abs(side + needed.wind)],
    ['both', Math.abs(side + needed.lead + needed.wind)],
  ];
  let skipped: ShotReport['skipped'] = 'none';
  let fit = Infinity;
  for (const [what, d] of fits) {
    if (d < fit - 1e-9) {
      fit = d;
      skipped = what;
    }
  }
  const lead = skipped === 'lead' || skipped === 'both' ? -needed.lead : skipped === 'wind' ? side + needed.wind : side;
  const wind = skipped === 'wind' || skipped === 'both' ? -needed.wind + (skipped === 'both' ? side + needed.lead + needed.wind : 0) : skipped === 'lead' ? side + needed.lead : 0;
  return {
    shot: shot.id,
    t: shot.t,
    target: { id: best.id, post: best.post, range, walking: Math.sqrt(best.vx * best.vx + best.vz * best.vz) > 0.2 },
    needed,
    held,
    sway,
    errors: { range: rangeErr, rangeM: perMetre > 1e-9 ? rangeErr / perMetre : 0, lead, wind, sway: Math.sqrt(sway.up * sway.up + sway.right * sway.right) },
    skipped,
    miss: { up: went.up - all.up, right: went.right - all.right },
  };
}

/**
 * A shot's breakdown in one line, for the playtest summary and the sitting's report. A hit
 * shows what it needed; a miss shows what it got wrong, and which decision it most nearly
 * left out. `result` says what it struck; `hit` whether that was the guard it was aimed at.
 */
export function describeShot(r: ShotReport, result: string, hit: boolean): string {
  if (!r.target) return `${result} · no guard near the aim · sway ${r.errors.sway.toFixed(2)} mil`;
  const signed = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
  const who = `${r.target.range.toFixed(0)} m ${r.target.walking ? 'walker' : 'guard'} (post ${r.target.post})`;
  const needed = `needed drop ${r.needed.drop.toFixed(2)}, lead ${signed(r.needed.lead)}, wind ${signed(r.needed.wind)} mil`;
  if (hit) return `${who} · ${result} · ${needed} · sway ${r.errors.sway.toFixed(2)}`;
  // Under about 25 m the drop barely changes with range, so a hold can't imply one.
  const asIf = r.target.range + r.errors.rangeM;
  const metres = Math.abs(r.errors.range) < 0.1 ? '' : asIf >= 25 ? ` (as if ${Math.round(asIf)} m)` : ' (as if point-blank)';
  const skip = r.skipped === 'none' ? '' : ` · ${r.skipped === 'both' ? 'lead and wind' : r.skipped} left out`;
  return `${who} · ${result} · off ${signed(r.miss.up)} up ${signed(r.miss.right)} right: range ${signed(r.errors.range)}${metres} · lead ${signed(r.errors.lead)} · wind ${signed(r.errors.wind)} · sway ${r.errors.sway.toFixed(2)} mil${skip} · ${needed}`;
}
