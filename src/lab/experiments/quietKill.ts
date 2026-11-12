import { defaultTuning, type Tuning } from '../../config/tuning';
import { commanderOf } from '../../sim/game/comms';
import { stimulus, type StimulusName } from '../../sim/game/drops';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import { rung } from '../../sim/perception';
import type { StimulusCommand } from '../../sim/kernel/commands';
import { startScene, type Scene } from '../../sim/kernel/scene';
import type { Experiment } from '../experiment';
import { clearLine, closeTo, overviewEye, type Point } from '../vantage';
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
  crack: { faint: 0.8, clear: 0.8, clearAt: 4, close: 0.8, closeAt: 4 },
  impact: { faint: 0.8, clear: 0.8, clearAt: 4 },
  bolt: { faint: 0.8, clear: 0.8, clearAt: 4 },
};

/** Each sound by how clearly it was heard: the game's own reading (`perception.awareness.shots`). */
export const GRADED: Shots = defaultTuning.perception.awareness.shots;

const withShots = (tuning: Tuning, shots: Shots, subsonic: boolean, whistle = tuning.perception.awareness.whistle): Tuning => ({
  ...tuning,
  perception: { ...tuning.perception, awareness: { ...tuning.perception.awareness, shots, whistle } },
  // The kit has to carry the load it starts with (config/validate.ts).
  ballistics: subsonic ? { ...tuning.ballistics, rifle: { ...tuning.ballistics.rifle, load: 'subsonic', carries: { ...tuning.ballistics.rifle.carries, subsonic: true } } } : tuning.ballistics,
});

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

/** The first guard, in id order, who is standing still with his head in a clear line from there, and isn't the target. */
function victim(sim: Simulation, from: Point): { id: number; head: Point } | null {
  for (const g of sim.guards) {
    if (sim.world.camp.guards[g.guard.spawn]?.role === 'target') continue;
    if (g.body.vx * g.body.vx + g.body.vz * g.body.vz > 0.0025 || g.body.stance !== 'stand') continue;
    const head = { x: g.body.x, y: g.body.y + g.body.eyeHeight, z: g.body.z };
    if (clearLine(sim, from, head)) return { id: g.id, head };
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
    const from = overviewEye(sim);
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
