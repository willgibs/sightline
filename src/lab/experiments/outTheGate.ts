import type { Tuning } from '../../config/tuning';
import { player } from '../../sim/game/entities';
import { leavingOf } from '../../sim/game/leaving';
import { emptyGateSeen, outTheGate, watchGate, type GateSeen } from '../../sim/game/scenes/outTheGate';
import type { Simulation } from '../../sim/game/sim';
import { startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * The chase (brain/firefight.ts), held against what the owner found by playing (Nov 12): seen
 * by a whole camp, they left by an opening in its wall, turned along the outside and were gone.
 * "It was very, very rare for a guard to even step outside the door to look around or
 * continue a gunfight." What they'd expect: "a guard or two maybe continue pursuit to fire
 * from behind me as I escape, but if I can shoot them down as they expose themselves outside
 * of the camp, then I get more of that sense of security because I took out the ones that
 * did pursue, and the rest are still defending within."
 *
 * The same camps, as they were (`off=chase`) and with it, and three things a person does
 * once he's out (scenes/outTheGate.ts): stops a few metres along the wall, runs on for the
 * trees, or stops and shoots whoever comes out after him.
 */

const ARMS: readonly Arm[] = [{ name: 'as it was', off: 'chase' }, { name: 'the chase' }];

/** Seconds from the moment he crosses the wall's line that a run is watched for. */
const WATCH = 75;
/** Seconds: a man out by then came after him, and wasn't the camp's search finding its way there. */
const SOON = 25;

interface Played extends GateSeen {
  /** Rounds that hit him, where he can be hurt (`plan=run`), and the tick enough had to kill him (−1 if they never did). */
  hits: number;
  killed: number;
}

function play(seed: string, arm: Arm, t: Tuning, plan: 'wall' | 'run' | 'fight'): Played | null {
  const sc = outTheGate(`seed=${seed}${plan === 'wall' ? '' : `&plan=${plan}`}${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  if (!leavingOf(sim.world, t)) return null;
  const d = sc.driver!();
  const raw = sc.game.still(sim);
  const seen: Played = { ...emptyGateSeen(), hits: 0, killed: -1 };
  const hz = t.sim.tickHz;
  // Long enough to be seen and get out, and then the watch.
  for (let k = 0; k < (120 + WATCH) * hz; k++) {
    const events = sim.step(d.next(sim, raw));
    watchGate(sim, events, seen);
    // Hits before he was out of the walls are the fight inside's, which was there already: only what follows him out is counted.
    const hits = player(sim.index).health?.hits ?? 0;
    if (seen.left < 0) seen.hits = -hits;
    else if (seen.killed < 0 && hits + Math.min(seen.hits, 0) >= t.brain.combat.playerHits) seen.killed = sim.tick;
    if (seen.left >= 0 && sim.tick - seen.left >= WATCH * hz) break;
  }
  seen.hits = (player(sim.index).health?.hits ?? 0) + Math.min(seen.hits, 0);
  return seen.left < 0 || seen.astray ? null : seen;
}

function run(seed: string, arm: Arm, t: Tuning): Record<string, number> {
  const hz = t.sim.tickHz;
  const out: Record<string, number> = {
    done: 0, aware: NaN, came: NaN, cameAt: NaN, went: NaN, wentAt: NaN, soon: NaN, found: NaN, foundAt: NaN, most: NaN, men: NaN, home: NaN, rounds: NaN, own: NaN,
    'r.done': 0, 'r.fired': NaN, 'r.struck': NaN, 'r.killed': NaN, 'r.own': NaN,
    'f.done': 0, 'f.came': NaN, 'f.down': NaN, 'f.late': NaN, 'f.most': NaN, 'f.own': NaN,
  }; // prettier-ignore
  const after = (seen: GateSeen, tick: number): number => (tick < 0 ? NaN : (tick - seen.left) / hz);
  const wall = play(seed, arm, t, 'wall');
  if (wall) {
    out.done = 1;
    out.aware = wall.aware;
    out.came = wall.came.size > 0 ? 1 : 0;
    out.cameAt = after(wall, wall.cameAt);
    out.went = wall.went.size > 0 ? 1 : 0;
    out.wentAt = after(wall, wall.wentAt);
    out.soon = wall.wentAt >= 0 && (wall.wentAt - wall.left) / hz <= SOON ? 1 : 0;
    out.found = wall.found >= 0 ? 1 : 0;
    out.foundAt = after(wall, wall.found);
    out.most = wall.most;
    out.men = wall.went.size;
    out.home = wall.home === Infinity ? NaN : wall.home;
    out.rounds = wall.roundsOut;
    out.own = wall.own.size;
  }
  const ran = play(seed, arm, t, 'run');
  if (ran) {
    out['r.done'] = 1;
    out['r.fired'] = ran.rounds;
    out['r.struck'] = ran.hits;
    out['r.killed'] = ran.killed >= 0 ? 1 : 0;
    out['r.own'] = ran.own.size;
  }
  const fought = play(seed, arm, t, 'fight');
  if (fought) {
    out['f.done'] = 1;
    out['f.came'] = fought.outFor.size;
    out['f.down'] = fought.down.size;
    out['f.late'] = fought.late.size;
    out['f.most'] = fought.most;
    out['f.own'] = fought.own.size;
  }
  return out;
}

export const outTheGateExperiment: Experiment = {
  name: 'out-the-gate',
  about: 'seen inside a camp, he leaves by an opening in its wall and turns along it: what comes after him, as it was and with the chase',
  series: 'lab-takedown',
  camps: 24,
  arms: ARMS,
  measures: [
    { key: 'done', label: 'he was seen, and got out by the opening', kind: 'rate' },
    { key: 'aware', label: 'men who knew of him as he went', kind: 'mean' },
    { key: 'came', label: 'by the wall: someone came to the opening', kind: 'rate' },
    { key: 'cameAt', label: 'by the wall: after (s)', kind: 'median' },
    { key: 'went', label: 'by the wall: someone came out after him', kind: 'rate' },
    { key: 'wentAt', label: 'by the wall: after (s)', kind: 'median' },
    { key: 'soon', label: `by the wall: someone was out within ${SOON} s`, kind: 'rate' },
    { key: 'found', label: 'by the wall: a man who came out set eyes on him', kind: 'rate' },
    { key: 'foundAt', label: 'by the wall: after (s)', kind: 'median' },
    { key: 'rounds', label: 'by the wall: rounds fired by men who came out', kind: 'mean' },
    { key: 'men', label: 'by the wall: men who came out, in all', kind: 'mean' },
    { key: 'most', label: 'by the wall: most out at once', kind: 'mean' },
    { key: 'home', label: 'by the wall: fewest fighting men left inside', kind: 'mean' },
    { key: 'own', label: 'by the wall: men shot by their own side', kind: 'mean' },
    { key: 'r.fired', label: 'runs for the trees: rounds fired at him', kind: 'mean' },
    { key: 'r.struck', label: 'runs for the trees: rounds that hit him once he was out', kind: 'mean' },
    { key: 'r.killed', label: 'runs for the trees: enough of them to kill', kind: 'rate' },
    { key: 'r.own', label: 'runs for the trees: men shot by their own side', kind: 'mean' },
    { key: 'f.came', label: 'shoots whoever comes out: men who came out, in all', kind: 'mean' },
    { key: 'f.down', label: 'shoots whoever comes out: of them, put down', kind: 'mean' },
    { key: 'f.late', label: 'shoots whoever comes out: men who came out once two were down', kind: 'mean' },
    { key: 'f.most', label: 'shoots whoever comes out: most out at once', kind: 'mean' },
    { key: 'f.own', label: 'shoots whoever comes out: men shot by their own side', kind: 'mean' },
  ],
  run,
};
