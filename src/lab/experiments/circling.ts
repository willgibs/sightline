import type { Tuning } from '../../config/tuning';
import { ViewDriver } from '../../sim/game/bots/playerView';
import { player } from '../../sim/game/entities';
import { circleOf, ladder, ringAround } from '../../sim/game/scenes/ladder';
import { bestOverview } from '../../sim/game/scenes/liveCamp';
import type { Simulation } from '../../sim/game/sim';
import { COMPOUND_TYPES, routinePose, type CompoundType, type RoutinePose } from '../../sim/generation';
import { sceneOver, sceneTicks, startScene, type Scene } from '../../sim/kernel/scene';
import { Blocks } from '../../sim/kernel/world/colliders';
import { sightLine } from '../../sim/kernel/world/query';
import type { Arm, Experiment } from '../experiment';
import { CampGauges } from '../gauges';
import { keptWorld } from '../worlds';
import { yardOnly } from './variety';

/**
 * Walking the outside (the owner's takedown sitting, Nov 10): "a few perch shots, then just
 * circling the base taking out each new enemy as they came into view, never really being
 * seen". The bar for a compound's shape is that this stops working: it should make you scout
 * and work for an angle, and walking its outside shouldn't hand you each man in turn.
 *
 * Two readings of the same camps, in each kind of place, against the takedown's alert camp:
 *
 * - **What the walk hands you,** played. A bot limited to what a person can do
 *   (bots/person.ts, `ShootAndCircle`) fires three rounds from the best overview, goes down
 *   and walks a lap of the plot 25 m out, crouched, stopping every 15 m to look in, and shoots
 *   whoever is there. How many men go down, and how many before anyone has made him out.
 * - **What the shape shows you,** with nobody firing. From every stop on the same walk, at
 *   twelve moments of the camp's routine: how many men are in a clear line, and over the
 *   walk, what share of it each man can be seen from. That's the width of the angle you get
 *   him from, and a man no stop shows at all has to be worked for some other way. And from
 *   the firing points: how many men the best overview shows, and how many firing points it
 *   takes to see everyone any of them can, which is the scouting a camp asks of you.
 *
 * Every arm is the same seeds. `yard only` is the base the owner played.
 */

type CirclingArm = Arm & { type?: CompoundType };

const ARMS: readonly CirclingArm[] = [{ name: 'yard only' }, { name: 'walled', type: 'walled' }, { name: 'keep', type: 'keep' }, { name: 'depot', type: 'depot' }, { name: 'farm', type: 'farm' }, { name: 'as built' }];

/** Every camp this type, whatever its crux and ground would have picked. */
export function onlyType(t: Tuning, type: CompoundType): Tuning {
  const out = structuredClone(t);
  for (const k of COMPOUND_TYPES) out.gen.compound.types[k].cruxes = k === type ? { walk: 1, inside: 1, flush: 1, escort: 1 } : { walk: 0, inside: 0, flush: 0, escort: 0 };
  return out;
}

function tuned(arm: CirclingArm, t: Tuning): Tuning {
  if (arm.name === 'yard only') return yardOnly(t);
  return arm.type ? onlyType(t, arm.type) : t;
}

/** Moments of the routine the shape is read at, and the seconds between them. */
const MOMENTS = 12;
const EVERY = 10;
const CHEST = 0.75;

/** What the walk round shows, with nobody firing. */
export function fromOutside(sim: Simulation): { inView: number; arc: number; hidden: number; overview: number; perches: number } {
  const w = sim.world;
  const T = sim.tuning;
  const ring = ringAround(w, { x: w.camp.site.x, z: w.camp.site.z }, 25, 10);
  const view = { world: w, solids: sim.solids, bodies: [] };
  const eye = T.bodies.player.eyeHeight.crouch;
  const head = T.bodies.guard.eyeHeight.stand;
  const men = w.camp.guards;
  const shownFrom = men.map(() => new Uint8Array(ring.length));
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  let seen = 0;
  for (let k = 0; k < MOMENTS; k++) {
    men.forEach((g, m) => {
      routinePose(g.routine, k * EVERY, pose);
      const y = g.elevated ? g.y : w.terrain.heightAt(pose.x, pose.z);
      ring.forEach((p, s) => {
        const ey = w.terrain.heightAt(p.x, p.z) + eye;
        const clear = sightLine(view, p.x, ey, p.z, pose.x, y + head, pose.z, Blocks.Sight) || sightLine(view, p.x, ey, p.z, pose.x, y + head * CHEST, pose.z, Blocks.Sight);
        if (clear) {
          seen++;
          shownFrom[m]![s] = 1;
        }
      });
    });
  }
  const stops = shownFrom.map((f) => f.reduce((n, x) => n + x, 0));
  return {
    inView: seen / (MOMENTS * ring.length),
    arc: (100 * stops.reduce((n, x) => n + x, 0)) / (men.length * ring.length),
    hidden: (100 * stops.filter((x) => x === 0).length) / men.length,
    ...fromPerches(sim),
  };
}

/** What scouting has to do: how many men the best overview shows, and how many firing points it takes to see everyone any of them can. */
function fromPerches(sim: Simulation): { overview: number; perches: number } {
  const w = sim.world;
  const T = sim.tuning;
  const view = { world: w, solids: sim.solids, bodies: [] };
  const eye = T.bodies.player.eyeHeight.prone;
  const head = T.bodies.guard.eyeHeight.stand;
  const men = w.camp.guards;
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  const perches = w.report.camp!.perches;
  const shows = perches.map(() => new Uint8Array(men.length));
  let seen = 0;
  const best = bestOverview(w);
  for (let k = 0; k < MOMENTS; k++) {
    men.forEach((g, m) => {
      routinePose(g.routine, k * EVERY, pose);
      const y = g.elevated ? g.y : w.terrain.heightAt(pose.x, pose.z);
      perches.forEach((p, i) => {
        const ey = w.terrain.heightAt(p.x, p.z) + eye;
        if (!(sightLine(view, p.x, ey, p.z, pose.x, y + head, pose.z, Blocks.Sight) || sightLine(view, p.x, ey, p.z, pose.x, y + head * CHEST, pose.z, Blocks.Sight))) return;
        shows[i]![m] = 1;
        if (p.x === best.x && p.z === best.z) seen++;
      });
    });
  }
  // Greedily, the firing point that shows the most men not yet seen.
  const left = new Set(men.map((_, m) => m).filter((m) => shows.some((s) => s[m] === 1)));
  let count = 0;
  while (left.size > 0) {
    let pick = 0;
    let most = -1;
    shows.forEach((s, i) => {
      let n = 0;
      for (const m of left) n += s[m]!;
      if (n > most) {
        most = n;
        pick = i;
      }
    });
    for (const m of [...left]) if (shows[pick]![m] === 1) left.delete(m);
    count++;
  }
  return { overview: seen / MOMENTS, perches: count };
}

export const circling: Experiment = {
  name: 'circling',
  about: "what one lap of a base's outside hands a shooter, and what its shape shows from there: the plain yard against each kind of place",
  series: 'lab-circling',
  camps: 16,
  arms: ARMS,
  score: 'down',
  measures: [
    { key: 'down', label: 'men down in a lap', kind: 'mean' },
    { key: 'walk', label: 'of them, from the walk', kind: 'mean' },
    { key: 'share', label: 'share of the camp (%)', kind: 'mean' },
    { key: 'clean', label: 'down before he was made out', kind: 'mean' },
    { key: 'found', label: 'made out at all', kind: 'rate' },
    { key: 'dead', label: 'shot dead on the walk', kind: 'rate' },
    { key: 'incoming', label: 'rounds at him', kind: 'mean' },
    { key: 'fired', label: 'rounds he fired', kind: 'mean' },
    { key: 'seconds', label: 'a lap takes (s)', kind: 'median' },
    { key: 'inView', label: 'men in view at a stop', kind: 'mean' },
    { key: 'arc', label: "share of the walk a man's visible from (%)", kind: 'mean' },
    { key: 'hidden', label: 'men no stop ever shows (%)', kind: 'mean' },
    { key: 'overview', label: 'men in view from the best overview', kind: 'mean' },
    { key: 'perches', label: 'firing points to see everyone', kind: 'mean' },
  ],
  run(seed, arm, tuning) {
    const t = tuned(arm as CirclingArm, tuning);
    // The target getting away ends a mission, not the walk: what's asked here is what the walk hands you.
    const sc = { ...(ladder(`seed=${seed}&plan=circle&ready=alert`) as Scene<Simulation>), playOn: true };
    const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
    const shape = fromOutside(sim);
    const men = sim.guards.length;
    const bot = circleOf(sim);
    const driver = new ViewDriver(bot);
    const raw = sc.game.still(sim);
    const ticks = sceneTicks(sc, t);
    const gauges = new CampGauges(sim);
    let clean = NaN;
    let fromPerch = NaN;
    const hits = (): number => player(sim.index).health?.hits ?? 0;
    const killed = t.brain.combat.playerHits;
    while (!sceneOver(sc, sim, ticks) && !bot.lapped && hits() < killed) {
      const events = sim.step(driver.next(sim, raw));
      gauges.observe(sim, events);
      if (Number.isNaN(fromPerch) && bot.walking) fromPerch = gauges.read(sim).guardsDown;
      if (Number.isNaN(clean) && events.some((e) => e.type === 'detected' && e.target === sim.playerId)) clean = gauges.read(sim).guardsDown;
    }
    const r = gauges.read(sim);
    const dead = hits() >= killed;
    return {
      down: r.guardsDown,
      walk: r.guardsDown - (Number.isNaN(fromPerch) ? r.guardsDown : fromPerch),
      share: (100 * r.guardsDown) / men,
      clean: Number.isNaN(clean) ? r.guardsDown : clean,
      found: r.detected ? 1 : 0,
      dead: dead ? 1 : 0,
      incoming: r.roundsAtYou,
      fired: r.shotsFired,
      seconds: bot.lapped ? sim.tick / t.sim.tickHz : NaN,
      ...shape,
    };
  },
};
