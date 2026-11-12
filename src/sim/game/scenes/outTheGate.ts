import { navigatorOf } from '../../brain';
import { routinePose, type RoutinePose } from '../../generation';
import type { InputFrame } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import type { World } from '../../kernel/world/world';
import type { Tuning } from '../../../config/tuning';
import { WalkTo } from '../bots/person';
import { ViewDriver } from '../bots/playerView';
import { player } from '../entities';
import { placePlayer } from '../setup';
import type { Simulation } from '../sim';
import { parseSwitches, switchedOff, type CampSwitch } from '../switches';
import type { Scene } from '.';
import { liveCamp } from './liveCamp';

/**
 * Out of the gate (the owner, Nov 12): seen inside a camp, he leaves by an opening in its
 * wall, turns along the outside of it and stops a few metres on, where no post can see him.
 * "It was very, very rare for a guard to even step outside the door to look around or
 * continue a gunfight... the current reaction gives a slight impression of 'he walked out
 * that door, must be gone forever'." And what he'd expect: "a guard or two maybe continue
 * pursuit to fire from behind me as I escape", with nobody else leaving the target.
 *
 * Someone stands a little way inside an opening, in a guard's view, until a guard is sure of
 * him and the word has had a moment to spread. Then he runs out, turns along the wall and
 * stops. `plan=run` has him go on from there, straight away from the camp. What the scene
 * asks is what comes after him: that a man or two come out and set eyes on him again, and
 * that no more than that leave the walls.
 *
 * It's the takedown's camp. He can't be hurt here, because the question is whether they
 * come, and a dead man can't be followed.
 */

export interface OutTheGateParams {
  seed: string;
  /** What he does once he's along the wall: stays there, or runs on away from the camp. */
  plan: 'wall' | 'run';
  off: CampSwitch[];
}

export function parseOutTheGate(text: string | undefined): OutTheGateParams {
  const p: OutTheGateParams = { seed: 'HOT-7106', plan: 'wall', off: [] };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'plan' && (value === 'wall' || value === 'run')) p.plan = value;
    else if (key === 'off') p.off = parseSwitches(value ?? '');
    else throw new Error(`The out-the-gate scene doesn't know '${part}'`);
  }
  return p;
}

export interface Leaving {
  /** Where he stands to be seen, inside, and the way he faces there. */
  show: { x: number; z: number };
  faceX: number;
  faceZ: number;
  /** The middle of the opening he leaves by, and the way out of it (a unit vector). */
  gate: { x: number; z: number; nx: number; nz: number; width: number };
  /** Just outside it, the place along the wall, and where he'd run on to. */
  out: { x: number; z: number };
  hide: { x: number; z: number };
  away: { x: number; z: number };
}

const leavings = new WeakMap<World, Leaving | null>();
const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/** Metres: how far inside the opening he shows himself, how far outside the wall he walks, and how far along it he goes. */
const INSIDE = [9, 12, 6, 15];
const OFF_WALL = 1.6;
const ALONG = [8, 6, 10, 12];
/** How far he runs on, with `plan=run`. */
const AWAY = 70;

/**
 * A way out of this camp for someone seen inside it: an opening in its perimeter with a place
 * inside it in a ground guard's view, and a place a few metres along the outside of the wall
 * that no post in the camp can see. The first there is, by opening, then distances. Read off
 * the world as generated, so every run of a camp gets the same one. Null where the camp has
 * no wall to follow (chain link hides nobody).
 */
export function leavingOf(world: World, tuning: Tuning): Leaving | null {
  const kept = leavings.get(world);
  if (kept !== undefined) return kept;
  const L = world.camp.layout;
  let found: Leaving | null = null;
  if (L) {
    const nav = navigatorOf(world, tuning);
    const site = world.camp.site;
    const eye = tuning.bodies.guard.eyeHeight.stand;
    const posts = world.camp.guards.map((g) => {
      routinePose(g.routine, 0, pose);
      return { x: pose.x, y: (g.elevated ? g.y : world.terrain.heightAt(pose.x, pose.z)) + eye, z: pose.z, g };
    });
    const seenBy = (x: number, z: number, who: (typeof posts)[number]): boolean => {
      const ground = world.terrain.heightAt(x, z);
      return nav.seesPoint(who.x, who.y, who.z, x, ground + 1.2, z) || nav.seesPoint(who.x, who.y, who.z, x, ground + tuning.bodies.player.height.stand, z);
    };
    const at = (a: number, b: number): { x: number; z: number } => ({ x: site.x + a * L.ux + b * L.vx, z: site.z + a * L.uz + b * L.vz });
    for (const o of L.openings) {
      if (found) break;
      // The way out, and the way along the wall, in the camp's frame.
      const na = o.side === 'front' ? 1 : o.side === 'back' ? -1 : 0;
      const nb = o.side === 'left' ? -1 : o.side === 'right' ? 1 : 0;
      const mid = at(o.a, o.b);
      const nx = na * L.ux + nb * L.vx;
      const nz = na * L.uz + nb * L.vz;
      for (const d of INSIDE) {
        if (found) break;
        const show = at(o.a - na * d, o.b - nb * d);
        if (!nav.standable(show.x, show.z)) continue;
        // In the view of a man on the ground who fights: he's what the scene waits for.
        if (!posts.some((p) => !p.g.elevated && tuning.brain.roles[p.g.role].fight > 0 && seenBy(show.x, show.z, p))) continue;
        const out = at(o.a + na * OFF_WALL, o.b + nb * OFF_WALL);
        if (!nav.standable(out.x, out.z)) continue;
        for (const side of [1, -1]) {
          if (found) break;
          for (const r of ALONG) {
            // Along the wall is across the way out: the frame's other axis.
            const along = o.width / 2 + r;
            const hide = at(o.a + na * OFF_WALL + nb * side * along, o.b + nb * OFF_WALL + na * side * along);
            if (!nav.standable(hide.x, hide.z) || !nav.clear(out.x, out.z, hide.x, hide.z)) continue;
            if (posts.some((p) => seenBy(hide.x, hide.z, p))) continue;
            found = { show, faceX: -nx, faceZ: -nz, gate: { x: mid.x, z: mid.z, nx, nz, width: o.width }, out, hide, away: { x: hide.x + nx * AWAY, z: hide.z + nz * AWAY } };
            break;
          }
        }
      }
    }
  }
  leavings.set(world, found);
  return found;
}

/** True if a place is outside the camp's perimeter, by more than a step. */
export function outsideWalls(world: World, x: number, z: number): boolean {
  const L = world.camp.layout;
  if (!L) return false;
  const site = world.camp.site;
  const a = (x - site.x) * L.ux + (z - site.z) * L.uz;
  const b = (x - site.x) * L.vx + (z - site.z) * L.vz;
  return Math.abs(a) > L.halfA + 1 || Math.abs(b) > L.halfB + 1;
}

/** Seconds he stays where he was seen after a guard is sure of him: the word has a moment to spread, as it had when the owner did it. */
const LINGER = 2;

/** What the scene's driver does: stands until someone's sure of him, then runs out of the opening, along the wall, and stops (or runs on). */
class ShowAndLeave implements Driver<Simulation> {
  private sure = -1;
  private legs: WalkTo[] = [];
  private leg = 0;
  private driver: ViewDriver | null = null;

  constructor(private readonly plan: 'wall' | 'run') {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    const m = leavingOf(sim.world, sim.tuning);
    if (!m) return out;
    if (this.sure < 0) {
      if (!sim.guards.some((g) => g.senses?.awareness.state === 'combat')) return out;
      this.sure = sim.tick;
    }
    if ((sim.tick - this.sure) / sim.tuning.sim.tickHz < LINGER) return out;
    if (this.legs.length === 0) {
      this.legs = [new WalkTo(m.out.x, m.out.z, 'stand', true), new WalkTo(m.hide.x, m.hide.z, 'stand', true)];
      if (this.plan === 'run') this.legs.push(new WalkTo(m.away.x, m.away.z, 'stand', true));
      this.driver = new ViewDriver(this.legs[0]!);
    }
    while (this.leg < this.legs.length && this.legs[this.leg]!.arrived) {
      this.leg++;
      if (this.leg < this.legs.length) this.driver = new ViewDriver(this.legs[this.leg]!);
    }
    return this.leg >= this.legs.length ? out : this.driver!.next(sim, out);
  }
}

/** What a run has shown: ticks (−1 until it happens), and the men who did each thing. */
export interface GateSeen {
  /** A guard was sure of him; he crossed the wall's line; he reached his place along it. */
  sure: number;
  left: number;
  hidden: number;
  /** How many of the camp were in combat or searching as he crossed. */
  aware: number;
  /** Men who were outside the walls already when he crossed: a patrol on its beat isn't anyone coming after him. */
  already: Set<number>;
  /** Men who came to the opening after he'd gone through it, and men who went out of the walls after him. */
  came: Set<number>;
  went: Set<number>;
  cameAt: number;
  wentAt: number;
  /** A man who went out after him had him in sight; anyone at all did, once he was at his place. */
  found: number;
  seenAgain: number;
  /** Rounds the camp fired after he'd gone through, those of them fired by men who went out, and the most such men outside the walls at once. */
  rounds: number;
  roundsOut: number;
  most: number;
  /** The fewest men who fight and aren't on a tower left inside the walls. */
  home: number;
}

export function emptyGateSeen(): GateSeen {
  return { sure: -1, left: -1, hidden: -1, aware: 0, already: new Set(), came: new Set(), went: new Set(), cameAt: -1, wentAt: -1, found: -1, seenAgain: -1, rounds: 0, roundsOut: 0, most: 0, home: Infinity };
}

/** Metres from the opening's middle that count as at it. */
const AT_GATE = 6;

/** Takes one tick's events and state into what the run has shown. */
export function watchGate(sim: Simulation, events: ReturnType<Simulation['step']>, seen: GateSeen): void {
  const m = leavingOf(sim.world, sim.tuning);
  if (!m) return;
  const you = player(sim.index).body;
  const roles = sim.tuning.brain.roles;
  if (seen.sure < 0 && sim.guards.some((g) => g.senses?.awareness.state === 'combat')) seen.sure = sim.tick;
  if (seen.left < 0 && seen.sure >= 0 && outsideWalls(sim.world, you.x, you.z)) {
    seen.left = sim.tick;
    seen.aware = sim.guards.filter((g) => g.senses?.awareness.state === 'combat' || g.senses?.awareness.state === 'searching').length;
    for (const g of sim.guards) if (outsideWalls(sim.world, g.body.x, g.body.z)) seen.already.add(g.id);
  }
  if (seen.left >= 0 && seen.hidden < 0 && (you.x - m.hide.x) * (you.x - m.hide.x) + (you.z - m.hide.z) * (you.z - m.hide.z) < 4) seen.hidden = sim.tick;
  if (seen.left < 0) return;
  for (const e of events) {
    if (e.type !== 'shot' || e.source === sim.playerId) continue;
    seen.rounds++;
    if (seen.went.has(e.source)) seen.roundsOut++;
  }
  let outside = 0;
  let home = 0;
  for (const g of sim.guards) {
    const post = sim.world.camp.guards[g.guard.spawn]!;
    // The relief comes up the road from outside, and isn't anyone going after him.
    if (g.guard.reserve) continue;
    const out = outsideWalls(sim.world, g.body.x, g.body.z);
    const sees = g.senses?.percepts.some((q) => q.kind === 'sight' && q.tick === sim.tick) === true;
    if (sees && seen.seenAgain < 0 && seen.hidden >= 0) seen.seenAgain = sim.tick;
    if (out && !post.elevated && !seen.already.has(g.id)) {
      outside++;
      if (!seen.went.has(g.id)) {
        seen.went.add(g.id);
        if (seen.wentAt < 0) seen.wentAt = sim.tick;
      }
      if (sees && seen.found < 0) seen.found = sim.tick;
    } else if (!post.elevated && roles[post.role].fight > 0) home++;
    if (!seen.came.has(g.id) && (g.body.x - m.gate.x) * (g.body.x - m.gate.x) + (g.body.z - m.gate.z) * (g.body.z - m.gate.z) <= AT_GATE * AT_GATE) {
      seen.came.add(g.id);
      if (seen.cameAt < 0) seen.cameAt = sim.tick;
    }
  }
  if (outside > seen.most) seen.most = outside;
  if (home < seen.home) seen.home = home;
}

export function outTheGate(params?: string): Scene {
  const p = parseOutTheGate(params);
  const base = liveCamp(`seed=${p.seed}`);
  // What the run has shown so far: kept by the scene, and begun again by its setup.
  let seen = emptyGateSeen();
  return switchedOff(
    {
      ...base,
      name: 'out-the-gate',
      version: 1,
      params: `seed=${p.seed}${p.plan === 'wall' ? '' : `&plan=${p.plan}`}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}`,
      title: `Out of the gate (${p.seed})`,
      description: 'Someone stands inside an opening in the camp’s wall until he is seen, then runs out, turns along the outside of the wall and stops where no post can see him. What comes after him?',
      setup: (sim) => {
        base.setup!(sim);
        seen = emptyGateSeen();
        const m = leavingOf(sim.world, sim.tuning);
        if (m) placePlayer(sim, m.show.x, m.show.z, m.faceX, m.faceZ);
        // The question is whether they come: he can't be hurt here.
        delete player(sim.index).health;
      },
      driver: () => new ShowAndLeave(p.plan),
      seconds: 120,
      playOn: true,
      expect: [
        {
          name: 'he is seen inside, and gets out and along the wall',
          during(sim, events) {
            watchGate(sim, events, seen);
          },
          after: (sim) =>
            !leavingOf(sim.world, sim.tuning)
              ? 'this camp has no opening with a wall to follow out of sight'
              : seen.sure < 0
                ? 'nobody was ever sure of him'
                : seen.left < 0
                  ? 'he never got out of the walls'
                  : p.plan === 'wall' && seen.hidden < 0
                    ? 'he never reached his place along the wall'
                    : undefined,
        },
        {
          name: 'someone comes out after him, and sets eyes on him',
          after: (sim) =>
            seen.left < 0 || seen.found >= 0
              ? undefined
              : seen.went.size === 0
                ? `nobody went out after him (${seen.came.size} came to the opening)`
                : `${seen.went.size} went out after him, and none had set eyes on him ${((sim.tick - seen.left) / sim.tuning.sim.tickHz).toFixed(0)} s on`,
        },
        {
          name: 'a man or two go, and the camp keeps the rest',
          after: (sim) => (seen.most > 2 ? `${seen.most} men were outside the walls at once` : seen.home < sim.tuning.brain.hunt.keep ? `only ${seen.home} fighting men were left inside` : undefined),
        },
      ],
    },
    p.off,
  );
}
