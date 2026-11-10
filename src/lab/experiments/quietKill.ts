import { defaultTuning, type Tuning } from '../../config/tuning';
import { commanderOf } from '../../sim/game/comms';
import { stimulus, type StimulusName } from '../../sim/game/drops';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import { dcos, dsin } from '../../sim/kernel/core/detmath';
import { rung } from '../../sim/perception';
import type { StimulusCommand } from '../../sim/kernel/commands';
import { startScene, type Scene } from '../../sim/kernel/scene';
import { Blocks } from '../../sim/kernel/world/colliders';
import { sightLine } from '../../sim/kernel/world/query';
import type { Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * One guard down, three ways, and what the rest of the camp knows about it: the design's
 * first idea, "the camp's puzzle is who can see whom", measured against what guards hear.
 *
 * The same man in every arm: the first guard standing still in a clear line from the camp's
 * best overview, taken through the head, so he never cries out. Silently (he is simply down,
 * as a knife would leave him); by a suppressed round or a loud one from that overview; or by
 * a suppressed subsonic round from 90 m, the design doc's "quiet short-range tool", which
 * makes no crack. Under two readings of what a shot's sounds tell a listener: `FLAT`, where
 * any of them heard at all is a shot and raises him to searching, and `GRADED`, where each is
 * read by how clearly it reached him. Each arm sets its own, so the table doesn't move with
 * the game's defaults. The last three arms also make the camp's whistle a call to look up
 * and not to search, to see how much of what spreads is the whistle's doing.
 */

type Shots = Tuning['perception']['awareness']['shots'];

/** Any sound of a shot, heard at all, is a shot: how the game was built. */
export const FLAT: Shots = {
  report: { faint: 0.8, clear: 0.8, clearAt: 4 },
  crack: { faint: 0.8, clear: 0.8, clearAt: 4 },
  impact: { faint: 0.8, clear: 0.8, clearAt: 4 },
  bolt: { faint: 0.8, clear: 0.8, clearAt: 4 },
};

/** Each sound by how clearly it was heard: the takedown's numbers (sim/game/scenes/takedown.ts). */
export const GRADED: Shots = defaultTuning.modes.takedown.shots;

const withShots = (tuning: Tuning, shots: Shots, subsonic: boolean, whistle = tuning.perception.awareness.whistle): Tuning => ({
  ...tuning,
  perception: { ...tuning.perception, awareness: { ...tuning.perception.awareness, shots, whistle } },
  ballistics: subsonic ? { ...tuning.ballistics, rifle: { ...tuning.ballistics.rifle, load: 'subsonic' } } : tuning.ballistics,
});

/** How far round from the overview's bearing a close firing point is looked for, a step at a time, one side then the other. */
const ROUND = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9];

interface QuietArm {
  name: string;
  how: Extract<StimulusName, 'kill' | 'shot' | 'suppressed-shot'>;
  shots: Shots;
  /** A subsonic round, from this many metres: closer than any overview. */
  subsonicFrom?: number;
  /** What the camp's whistle raises a man who hears it to, if not searching: the last three arms ask how much of the spread is the whistle's. */
  whistle?: number;
}

const ARMS: readonly QuietArm[] = [
  { name: 'silent', how: 'kill', shots: FLAT },
  { name: 'suppressed, any shot is a shot', how: 'suppressed-shot', shots: FLAT },
  { name: 'suppressed, by how clearly', how: 'suppressed-shot', shots: GRADED },
  { name: 'loud, any shot is a shot', how: 'shot', shots: FLAT },
  { name: 'loud, by how clearly', how: 'shot', shots: GRADED },
  { name: 'subsonic at 90 m, any shot is a shot', how: 'suppressed-shot', shots: FLAT, subsonicFrom: 90 },
  { name: 'subsonic at 90 m, by how clearly', how: 'suppressed-shot', shots: GRADED, subsonicFrom: 90 },
  { name: 'silent, and a whistle only turns heads', how: 'kill', shots: FLAT, whistle: 0.3 },
  { name: 'suppressed, by how clearly, and a whistle only turns heads', how: 'suppressed-shot', shots: GRADED, whistle: 0.3 },
  { name: 'subsonic at 90 m, by how clearly, and a whistle only turns heads', how: 'suppressed-shot', shots: GRADED, subsonicFrom: 90, whistle: 0.3 },
];

/** Seconds into the run before anything is done, and how long it waits for a man who can be taken. */
const FIRST = 12;
const GIVE_UP = 70;
/** Seconds watched after he falls. */
const WATCH = 150;

interface Point {
  x: number;
  y: number;
  z: number;
}

/** The camp's best overview, with a prone shooter's eye on it. */
function overview(sim: Simulation): Point {
  const list = [...(sim.world.report.camp!.perches as ReadonlyArray<{ x: number; z: number; coverage: number }>)].sort((a, b) => b.coverage - a.coverage || a.x - b.x || a.z - b.z);
  const p = list[0]!;
  return { x: p.x, y: sim.world.terrain.heightAt(p.x, p.z) + sim.tuning.bodies.player.eyeHeight.prone, z: p.z };
}

/** The first guard, in id order, who is standing still with his head in a clear line from there, and isn't the target. */
function victim(sim: Simulation, from: Point): { id: number; head: Point } | null {
  const view = { world: sim.world, solids: sim.solids, bodies: [] };
  for (const g of sim.guards) {
    if (sim.world.camp.guards[g.guard.spawn]?.role === 'target') continue;
    if (g.body.vx * g.body.vx + g.body.vz * g.body.vz > 0.0025 || g.body.stance !== 'stand') continue;
    const head = { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z };
    if (sightLine(view, from.x, from.y, from.z, head.x, head.y, head.z, Blocks.Sight | Blocks.Bullet)) return { id: g.id, head };
  }
  return null;
}

/** A prone shooter's eye `range` metres from a man's head with a clear line to it: toward the overview if that's open, else the nearest bearing round from it that is. */
function closeTo(sim: Simulation, head: Point, toward: Point, range: number): Point | null {
  const view = { world: sim.world, solids: sim.solids, bodies: [] };
  const dx = toward.x - head.x;
  const dz = toward.z - head.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  for (const k of ROUND) {
    const a = (k * 20 * Math.PI) / 180;
    const c = dcos(a);
    const s = dsin(a);
    const x = head.x + ((dx * c - dz * s) / d) * range;
    const z = head.z + ((dx * s + dz * c) / d) * range;
    const from = { x, y: sim.world.terrain.heightAt(x, z) + sim.tuning.bodies.player.eyeHeight.prone, z };
    if (sightLine(view, from.x, from.y, from.z, head.x, head.y, head.z, Blocks.Sight | Blocks.Bullet)) return from;
  }
  return null;
}

export const quietKill: Experiment = {
  name: 'quiet-kill',
  about: 'one guard down, silently, suppressed or loud: how much of the camp knows, and what it costs, under two readings of what a shot sounds like',
  series: 'lab-quiet-kill',
  camps: 24,
  arms: ARMS,
  measures: [
    { key: 'killed', label: 'he went down', kind: 'rate' },
    { key: 'searching5', label: 'of the rest, searching at +5 s', kind: 'mean' },
    { key: 'wary5', label: 'suspicious or more at +5 s', kind: 'mean' },
    { key: 'searching20', label: 'searching at +20 s', kind: 'mean' },
    { key: 'siren', label: 'siren within 150 s', kind: 'rate' },
    { key: 'sirenAt', label: 'siren after (s)', kind: 'median' },
    { key: 'away', label: 'target gone within 150 s', kind: 'rate' },
    { key: 'awayAt', label: 'target gone after (s)', kind: 'median' },
  ],
  run(seed, arm, tuning) {
    const a = arm as QuietArm;
    const T = withShots(tuning, a.shots, a.subsonicFrom !== undefined, a.whistle);
    const scene = compound(`seed=${seed}&attack=quiet`) as Scene<Simulation>;
    const sim = startScene(scene, T, keptWorld(`live-camp:${seed}`, T, scene.world));
    const raw = scene.game.still(sim);
    const hz = T.sim.tickHz;
    const from = overview(sim);
    const out: Record<string, number> = { killed: 0, searching5: NaN, wary5: NaN, searching20: NaN, siren: NaN, sirenAt: NaN, away: NaN, awayAt: NaN };
    let chosen = -1;
    let fired = -1;
    let fell = -1;
    const share = (least: number): number => {
      const rest = sim.guards.filter((g) => sim.world.camp.guards[g.guard.spawn]?.role !== 'target');
      return rest.length === 0 ? NaN : rest.filter((g) => g.senses !== undefined && rung(g.senses.awareness.state) >= least).length / rest.length;
    };
    for (let i = 0; i < (GIVE_UP + WATCH) * hz; i++) {
      const now = sim.tick / hz;
      const commands: StimulusCommand[] = [];
      // One go at it: at the first moment someone can be taken, and never again.
      if (chosen < 0 && now >= FIRST && now < GIVE_UP) {
        const v = victim(sim, from);
        // The same man whatever the arm, so the close shot is at whoever the overview would have taken.
        const muzzle = v && a.subsonicFrom !== undefined ? closeTo(sim, v.head, from, a.subsonicFrom) : from;
        if (v) {
          chosen = v.id;
          fired = sim.tick;
          if (muzzle) commands.push(a.how === 'kill' ? stimulus('kill', v.head) : stimulus(a.how, v.head, muzzle));
        }
      }
      const events = sim.step({ ...raw, commands });
      for (const e of events) {
        if (e.type === 'death' && e.victim === chosen && fell < 0) fell = sim.tick;
        if (e.type === 'siren' && fell >= 0 && Number.isNaN(out.sirenAt!)) out.sirenAt = (sim.tick - fell) / hz;
      }
      if (chosen >= 0 && fell < 0 && sim.tick > fired + 3 * hz) break; // the round didn't take him: no kill to measure
      if (fell < 0) continue;
      const since = sim.tick - fell;
      if (since === 5 * hz) {
        out.searching5 = share(rung('searching'));
        out.wary5 = share(rung('suspicious'));
      }
      if (since === 20 * hz) out.searching20 = share(rung('searching'));
      if (Number.isNaN(out.awayAt!) && commanderOf(sim)?.camp.objective?.status === 'escaped') out.awayAt = since / hz;
      if (since >= WATCH * hz) break;
    }
    if (fell < 0) return out;
    out.killed = 1;
    out.siren = Number.isNaN(out.sirenAt!) ? 0 : 1;
    out.away = Number.isNaN(out.awayAt!) ? 0 : 1;
    return out;
  },
};
