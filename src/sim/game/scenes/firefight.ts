import { navigatorOf } from '../../brain';
import { dcos, dsin } from '../../kernel/core/detmath';
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
import { takedownTuning } from './takedown';

/**
 * The firefight's own scene (brain/firefight.ts): the thing the owner did, walking into a
 * camp (Nov 10). "When enemy defender saw me, it was easy to run away behind cover when they
 * stopped and they wouldn't even attempt to follow once I did."
 *
 * Someone stands in front of a guard, in the open, until the guard is sure of him. Then he
 * goes behind the nearest thing that hides him from every post in the camp, and stays there.
 * What the scene asks is what happens next: that someone comes after him and sets eyes on
 * him again, that it's one man who comes and not the camp, and that the rest keep to their
 * own ground.
 *
 * It's the takedown's camp. The man can't be hurt here, because the question is whether
 * they come, and a dead man can't be followed. `off=firefight` plays it against the camp as
 * it was, where nobody comes.
 */

export interface FirefightParams {
  seed: string;
  off: CampSwitch[];
}

export function parseFirefight(text: string | undefined): FirefightParams {
  const p: FirefightParams = { seed: 'LEB-2534', off: [] };
  for (const part of (text ?? '').split('&')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (key === 'seed' && value) p.seed = value;
    else if (key === 'off') p.off = parseSwitches(value ?? '');
    else throw new Error(`The firefight scene doesn't know '${part}'`);
  }
  return p;
}

interface Meeting {
  /** Where he stands to be seen, the way he faces there, and where he goes to be out of sight. */
  show: { x: number; z: number };
  faceX: number;
  faceZ: number;
  hide: { x: number; z: number };
}

const meetings = new WeakMap<World, Meeting | null>();
const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };

/**
 * A place in front of a guard on the ground, in his view, with somewhere a short walk away
 * that no post in the camp can see: the first there is, by post, then distance, then angle.
 * Read off the world as generated, so every run of a camp gets the same one.
 */
export function meetingOf(world: World, tuning: Tuning): Meeting | null {
  const kept = meetings.get(world);
  if (kept !== undefined) return kept;
  const nav = navigatorOf(world, tuning);
  const eye = tuning.bodies.guard.eyeHeight.stand;
  const posts = world.camp.guards.map((g) => {
    routinePose(g.routine, 0, pose);
    return { x: pose.x, y: (g.elevated ? g.y : world.terrain.heightAt(pose.x, pose.z)) + eye, z: pose.z, yaw: pose.yaw, g };
  });
  // Out of sight of every post, a man on a tower included: his chest and his head.
  const hiddenFromAll = (x: number, z: number): boolean => {
    const ground = world.terrain.heightAt(x, z);
    return posts.every((p) => !nav.seesPoint(p.x, p.y, p.z, x, ground + 1.2, z) && !nav.seesPoint(p.x, p.y, p.z, x, ground + tuning.bodies.player.height.stand, z));
  };
  let found: Meeting | null = null;
  for (const p of posts) {
    if (found) break;
    if (p.g.elevated || (p.g.role !== 'sentry' && p.g.role !== 'patrol')) continue;
    for (const d of [22, 18, 26, 14]) {
      if (found) break;
      for (const a of [0, 0.25, -0.25, 0.5, -0.5]) {
        if (found) break;
        const sx = p.x - dsin(p.yaw + a) * d;
        const sz = p.z - dcos(p.yaw + a) * d;
        if (!nav.standable(sx, sz) || nav.blockedFrom(p.x, p.z, sx, sz, 1.5)) continue;
        for (const r of [5, 7, 9, 12]) {
          if (found) break;
          for (let k = 0; k < 16; k++) {
            const hx = sx + r * dcos((2 * Math.PI * k) / 16);
            const hz = sz + r * dsin((2 * Math.PI * k) / 16);
            if (!nav.standable(hx, hz) || !nav.clear(sx, sz, hx, hz) || !hiddenFromAll(hx, hz)) continue;
            found = { show: { x: sx, z: sz }, faceX: p.x - sx, faceZ: p.z - sz, hide: { x: hx, z: hz } };
            break;
          }
        }
      }
    }
  }
  meetings.set(world, found);
  return found;
}

/** What the scene's driver does: stands until someone's sure of him, then walks out of sight and stays. */
class ShowAndHide implements Driver<Simulation> {
  private walk: WalkTo | null = null;
  private driver: ViewDriver | null = null;

  next(sim: Simulation, out: InputFrame): InputFrame {
    const m = meetingOf(sim.world, sim.tuning);
    if (!m) return out;
    if (!this.walk) {
      if (!sim.guards.some((g) => g.senses?.awareness.state === 'combat')) return out;
      this.walk = new WalkTo(m.hide.x, m.hide.z, 'stand');
      this.driver = new ViewDriver(this.walk);
    }
    return this.walk.arrived ? out : this.driver!.next(sim, out);
  }
}

/** Metres: a man this near him who began farther off than `FAR` has closed in on him. */
const CLOSE = 30;
const FAR = 45;

export function firefight(params?: string): Scene {
  const p = parseFirefight(params);
  const base = liveCamp(`seed=${p.seed}&ready=alert`);
  // What the run has shown so far: kept by the scene, and begun again by its setup.
  const seen = { sure: -1, hidden: -1, found: -1, going: 0, closed: new Set<number>(), far: new Set<number>(), went: new Set<number>() };
  return switchedOff(
    {
      ...base,
      name: 'firefight',
      version: 1,
      params: `seed=${p.seed}${p.off.length > 0 ? `&off=${p.off.join(',')}` : ''}`,
      tune: takedownTuning,
      title: `The firefight (${p.seed})`,
      description: 'Someone stands in front of a guard until he is seen, then goes behind the nearest thing that hides him and stays there. What comes after him?',
      setup: (sim) => {
        base.setup!(sim);
        seen.sure = seen.hidden = seen.found = -1;
        seen.going = 0;
        seen.closed.clear();
        seen.far.clear();
        seen.went.clear();
        const m = meetingOf(sim.world, sim.tuning);
        if (m) placePlayer(sim, m.show.x, m.show.z, m.faceX, m.faceZ);
        // The question is whether they come: he can't be hurt here.
        delete player(sim.index).health;
      },
      driver: () => new ShowAndHide(),
      seconds: 120,
      playOn: true,
      expect: [
        {
          name: 'he is seen, and goes to ground',
          during(sim) {
            const m = meetingOf(sim.world, sim.tuning);
            if (!m) return 'this camp has nowhere to meet a guard and hide from him';
            const you = player(sim.index).body;
            if (seen.sure < 0 && sim.guards.some((g) => g.senses?.awareness.state === 'combat')) seen.sure = sim.tick;
            if (seen.sure >= 0 && seen.hidden < 0 && (you.x - m.hide.x) * (you.x - m.hide.x) + (you.z - m.hide.z) * (you.z - m.hide.z) < 9) seen.hidden = sim.tick;
            // Who's going after him, how many at once, how many are round him, and whether one who went has set eyes on him.
            let going = 0;
            for (const g of sim.guards) {
              if (g.brain?.act === 'push') {
                going++;
                if (seen.hidden >= 0) seen.went.add(g.id);
              }
              const d2 = (g.body.x - you.x) * (g.body.x - you.x) + (g.body.z - you.z) * (g.body.z - you.z);
              if (d2 > FAR * FAR) seen.far.add(g.id);
              else if (d2 <= CLOSE * CLOSE && seen.far.has(g.id)) seen.closed.add(g.id);
              if (seen.found < 0 && seen.went.has(g.id) && g.senses?.percepts.some((q) => q.kind === 'sight' && q.tick === sim.tick)) seen.found = sim.tick;
            }
            if (going > seen.going) seen.going = going;
          },
          after: () => (seen.sure < 0 ? 'nobody was ever sure of him' : seen.hidden < 0 ? 'he never reached his hiding place' : undefined),
        },
        {
          name: 'someone goes after him, and sets eyes on him',
          after: (sim) =>
            seen.hidden < 0 || seen.found >= 0 ? undefined : seen.went.size === 0 ? 'nobody went after him' : `${seen.went.size} went after him, and none had set eyes on him ${((sim.tick - seen.hidden) / sim.tuning.sim.tickHz).toFixed(0)} s on`,
        },
        {
          name: 'they come one or two at a time, and the camp doesn\'t close in round him',
          after: () => (seen.going > 2 ? `${seen.going} men were going after him at once` : seen.closed.size > 3 ? `${seen.closed.size} men came in on him from across the camp` : undefined),
        },
      ],
    },
    p.off,
  );
}
