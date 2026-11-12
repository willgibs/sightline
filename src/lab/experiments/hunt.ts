import type { Tuning } from '../../config/tuning';
import { MarksmanDriver } from '../../sim/game/bots/marksman';
import { WalkTo } from '../../sim/game/bots/person';
import { ViewDriver } from '../../sim/game/bots/playerView';
import { player } from '../../sim/game/entities';
import { emptyHuntSeen, hunt, huntSteps, watchHunt, type HuntSeen } from '../../sim/game/scenes/hunt';
import { ladder } from '../../sim/game/scenes/ladder';
import type { Simulation } from '../../sim/game/sim';
import type { InputFrame } from '../../sim/kernel/input';
import { sceneOver, sceneTicks, startScene, type Driver, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { CampGauges } from '../gauges';
import { keptWorld } from '../worlds';
import { firingPointAbout } from './relocate';

/**
 * The hunt (brain/hunt.ts, brain/commander.ts), held against what step 2 of the camp work
 * said it had to change (docs/camp-engine.md, section 9): after his first shot, nothing the
 * camp did reached the shooter, and moving bought him nothing.
 *
 * The same camps, before and with the hunt, four ways:
 *
 * - **He fires once and stays.** Is he placed, is a section sent, does it get to where it
 *   watches from, and does one of its men set eyes on him? How long after the shot?
 * - **He fires four times and stays.** The same, with the fix four shots give a camp.
 * - **He fires once and moves.** A hundred metres or so to another firing point, on foot,
 *   and lies up there. Is he found then? Moving should be worth something.
 * - **He stays and shoots at whatever he sees,** as a marksman who never misses his chance:
 *   the section included. Who's left? This is the one a hunt can lose.
 *
 * In the first three he can't be hurt: they ask whether the camp comes, and where, and
 * count the rounds that would have struck a man lying where he last fired from. Three of
 * those is what kills a player. The last is played by the mission's rules.
 */

const ARMS: readonly Arm[] = [{ name: 'before', off: 'hunt' }, { name: 'the hunt' }];

/** Seconds of each run after the scene's own start. */
const SECONDS = 480;
/** Metres he moves, in the run where he does. */
const MOVES = 100;

/** Fires once, then goes to another firing point about `MOVES` m off, on foot and low, and lies up there. */
class ShootAndMove implements Driver<Simulation> {
  private shooter: MarksmanDriver | null = null;
  private walk: WalkTo | null = null;
  private view: ViewDriver | null = null;
  private down = false;
  moved = NaN;

  next(sim: Simulation, out: InputFrame): InputFrame {
    const hz = sim.tuning.sim.tickHz;
    if (sim.tick / hz < 12) return (this.shooter ??= new MarksmanDriver(huntSteps(sim.world, 1))).next(sim, out);
    if (!this.walk) {
      const to = firingPointAbout(sim, MOVES);
      const you = player(sim.index).body;
      this.moved = to ? Math.sqrt((to.x - you.x) * (to.x - you.x) + (to.z - you.z) * (to.z - you.z)) : 0;
      this.walk = new WalkTo(to?.x ?? you.x, to?.z ?? you.z, 'crouch');
      this.view = new ViewDriver(this.walk);
    }
    if (!this.walk.arrived) return this.view!.next(sim, out);
    out.moveX = 0;
    out.moveZ = 0;
    out.sprint = false;
    out.crouch = false;
    out.commands = [];
    // Down, once, and then nothing.
    out.prone = !this.down && player(sim.index).body.stance !== 'prone';
    this.down = true;
    return out;
  }
}

/** What a run showed, and the tick by which enough rounds had come close enough to have killed a man lying where he last fired from (−1 if they never did). */
interface Played extends HuntSeen {
  killed: number;
}

function play(seed: string, arm: Arm, t: Tuning, params: string, driver?: Driver<Simulation>): Played {
  const sc = hunt(`seed=${seed}${params}${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>;
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  const d = driver ?? sc.driver!();
  const raw = sc.game.still(sim);
  const seen: Played = { ...emptyHuntSeen(), killed: -1 };
  const gauges = new CampGauges(sim);
  const hz = t.sim.tickHz;
  const ticks = SECONDS * hz;
  for (let k = 0; k < ticks; k++) {
    const events = sim.step(d.next(sim, raw));
    gauges.observe(sim, events);
    watchHunt(sim, events, seen);
    if (seen.killed < 0 && sim.tick % hz === 0 && gauges.read(sim).returnFire.struck >= t.brain.combat.playerHits) seen.killed = sim.tick;
  }
  return seen;
}

function run(seed: string, arm: Arm, t: Tuning): Record<string, number> {
  const hz = t.sim.tickHz;
  const after = (seen: HuntSeen, tick: number): number => (tick < 0 || seen.shot < 0 ? NaN : (tick - seen.shot) / hz);
  const stay = play(seed, arm, t, '');
  const four = play(seed, arm, t, '&shots=4');
  const mover = new ShootAndMove();
  const moved = play(seed, arm, t, '', mover);
  // The marksman who shoots at what he sees, by the mission's rules.
  const sc = { ...(ladder(`seed=${seed}&plan=static&ready=alert${arm.off ? `&off=${arm.off}` : ''}`) as Scene<Simulation>), playOn: true };
  const sim = startScene(sc, t, keptWorld(`live-camp:${seed}`, t, sc.world));
  const driver = sc.driver!();
  const raw = sc.game.still(sim);
  const ticks = sceneTicks(sc, t);
  const gauges = new CampGauges(sim);
  const seen = emptyHuntSeen();
  const killed = t.brain.combat.playerHits;
  const hits = (): number => player(sim.index).health?.hits ?? 0;
  let hunters = 0;
  while (!sceneOver(sc, sim, ticks) && hits() < killed) {
    const events = sim.step(driver.next(sim, raw));
    gauges.observe(sim, events);
    watchHunt(sim, events, seen);
    for (const e of events) if (e.type === 'death' && seen.men.has(e.victim)) hunters++;
  }
  const r = gauges.read(sim);
  return {
    placed: stay.placed >= 0 ? 1 : 0,
    off: stay.off,
    sent: stay.ordered >= 0 ? 1 : 0,
    watching: after(stay, stay.watching),
    found: stay.found >= 0 ? 1 : 0,
    foundAt: after(stay, stay.found),
    cleared: stay.found < 0 && stay.cleared >= 0 ? 1 : 0,
    killed: stay.killed >= 0 ? 1 : 0,
    killedAt: after(stay, stay.killed),
    killed4: four.killed >= 0 ? 1 : 0,
    killedAt4: after(four, four.killed),
    killedMoved: moved.killed >= 0 ? 1 : 0,
    strays: stay.strays.size,
    home: stay.home === Infinity ? NaN : stay.home,
    found4: four.found >= 0 ? 1 : 0,
    foundAt4: after(four, four.found),
    moved: mover.moved,
    foundMoved: moved.found >= 0 ? 1 : 0,
    dead: hits() >= killed ? 1 : 0,
    deadAt: hits() >= killed ? sim.tick / hz : NaN,
    down: r.guardsDown,
    hunters,
    sections: seen.sections,
  };
}

export const huntExperiment: Experiment = {
  name: 'hunt',
  about: 'what comes for a shooter on the best overview: before the hunt and with it',
  series: 'lab-hunt',
  camps: 12,
  arms: ARMS,
  measures: [
    { key: 'placed', label: 'one shot: the camp places him', kind: 'rate' },
    { key: 'off', label: 'one shot: how far off its fix is (m)', kind: 'median' },
    { key: 'sent', label: 'one shot: a section is sent', kind: 'rate' },
    { key: 'watching', label: 'one shot: it is watching his place after (s)', kind: 'median' },
    { key: 'found', label: 'one shot, stays: found', kind: 'rate' },
    { key: 'foundAt', label: 'one shot, stays: found after (s)', kind: 'median' },
    { key: 'cleared', label: 'one shot, stays: looked over and missed', kind: 'rate' },
    { key: 'killed', label: 'one shot, stays: enough rounds on him to kill', kind: 'rate' },
    { key: 'killedAt', label: 'one shot, stays: by (s after the shot)', kind: 'median' },
    { key: 'strays', label: 'men not sent who went past the wire', kind: 'mean' },
    { key: 'home', label: 'fewest fighting men left on the camp\'s ground', kind: 'mean' },
    { key: 'found4', label: 'four shots, stays: found', kind: 'rate' },
    { key: 'foundAt4', label: 'four shots, stays: found after (s)', kind: 'median' },
    { key: 'killed4', label: 'four shots, stays: enough rounds on him to kill', kind: 'rate' },
    { key: 'killedAt4', label: 'four shots, stays: by (s after the first shot)', kind: 'median' },
    { key: 'moved', label: 'one shot, moves: how far (m)', kind: 'mean' },
    { key: 'foundMoved', label: 'one shot, moves: found', kind: 'rate' },
    { key: 'killedMoved', label: 'one shot, moves: enough rounds on him to kill', kind: 'rate' },
    { key: 'dead', label: 'shoots what he sees: shot dead', kind: 'rate' },
    { key: 'deadAt', label: 'shoots what he sees: shot dead after (s)', kind: 'median' },
    { key: 'down', label: 'shoots what he sees: men he put down', kind: 'mean' },
    { key: 'hunters', label: 'shoots what he sees: of them, men of a section', kind: 'mean' },
    { key: 'sections', label: 'shoots what he sees: sections sent', kind: 'mean' },
  ],
  run,
};
