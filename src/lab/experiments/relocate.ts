import { OverlookShooter } from '../../sim/game/bots/overlook';
import { ViewDriver } from '../../sim/game/bots/playerView';
import { WalkTo } from '../../sim/game/bots/person';
import { commanderOf } from '../../sim/game/comms';
import { overlook } from '../../sim/game/scenes/overlook';
import type { Simulation } from '../../sim/game/sim';
import { neutralInput, type InputFrame } from '../../sim/kernel/input';
import type { Driver, Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { firstTick, noChange, playBranch, sceneRun, teleportTo, type Intervention } from '../fork';

/**
 * What moving buys (docs/camp-engine.md, Relocation value): the perfect shooter on the best
 * overview, forked two seconds after his first shot, and sent to another firing point 30 m
 * or 100 m away, or left where he is. Moved instantly, it's what being elsewhere is worth.
 * On foot, crouched, it's what going there costs as well: no shots on the way, and a body
 * up and moving. The firing point is one the camp's own analysis lists (they're about 27 m
 * apart along the ridges), so he can still see the camp when he gets there.
 *
 * Two questions, so two experiments:
 *   relocate         he keeps shooting from the new place, and a move that loses him the
 *                    camp has its cost in the same table;
 *   relocate-quiet   he fires that one shot and no more, so the whole camp is left to come
 *                    and find him: the fairest test of whether being elsewhere saves him.
 */

interface Move extends Arm {
  metres: number;
  how: 'stay' | 'instantly' | 'on foot';
}

const MOVES: readonly Move[] = [
  { name: 'stays', metres: 0, how: 'stay' },
  { name: 'moved 30 m, instantly', metres: 30, how: 'instantly' },
  { name: 'moved 100 m, instantly', metres: 100, how: 'instantly' },
  { name: 'walks 30 m', metres: 30, how: 'on foot' },
  { name: 'walks 100 m', metres: 100, how: 'on foot' },
];

const PACE = 5;
const SECONDS = 300;

/** Listed firing points near this far from where the player is: the one with the most of the camp in view. */
export function firingPointAbout(sim: Simulation, metres: number): { x: number; z: number } | null {
  const p = sim.player;
  let best: { x: number; z: number; coverage: number } | null = null;
  for (const c of sim.world.report.camp!.perches) {
    const d = Math.sqrt((c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z));
    if (d < metres * 0.7 || d > metres * 1.4) continue;
    if (!best || c.coverage > best.coverage || (c.coverage === best.coverage && (c.x < best.x || (c.x === best.x && c.z < best.z)))) best = c;
  }
  return best;
}

/** Lies where he is and does nothing. */
const LIES_STILL: Driver<Simulation> = { next: (sim, out) => Object.assign(out, neutralInput(sim.player.yaw, sim.player.pitch)) };

/** Stays put, shooting or not. */
function afterwards(firing: boolean, firstAt: number): Driver<Simulation> {
  return firing ? new OverlookShooter(PACE, firstAt) : LIES_STILL;
}

/** Carries the shooter on foot to a firing point, and then does what he'd do there. */
class WalkThere implements Driver<Simulation> {
  private walk: WalkTo | null = null;
  private view: ViewDriver | null = null;
  private then: Driver<Simulation> | null = null;

  constructor(
    private readonly metres: number,
    private readonly firing: boolean,
  ) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    if (this.then) return this.then.next(sim, out);
    if (!this.walk) {
      const at = firingPointAbout(sim, this.metres);
      if (!at) throw new Error(`No firing point for a ${this.metres} m walk`);
      this.walk = new WalkTo(at.x, at.z, 'crouch');
      this.view = new ViewDriver(this.walk);
    }
    const input = this.view!.next(sim, out);
    if (this.walk.arrived) {
      // Down again, and a moment to settle, before the next shot.
      if (this.firing) this.then = new OverlookShooter(PACE, sim.tick / sim.tuning.sim.tickHz + 2);
      else {
        input.prone = true;
        this.then = LIES_STILL;
      }
    }
    return input;
  }
}

function change(move: Move, firing: boolean, firstAt: number): Intervention {
  if (move.how === 'on foot') return { name: `walked ${move.metres} m`, apply: () => {}, driver: () => new WalkThere(move.metres, firing) };
  const base = move.how === 'stay' ? noChange() : teleportTo(`moved ${move.metres} m`, (sim) => firingPointAbout(sim, move.metres));
  return { ...base, driver: () => afterwards(firing, firstAt) };
}

function experiment(name: string, about: string, firing: boolean): Experiment {
  const measures = [
    { key: 'moved', label: 'moved (m)', kind: 'median' as const },
    { key: 'down', label: 'guards down', kind: 'mean' as const },
    { key: 'shot', label: 'target shot', kind: 'rate' as const },
    { key: 'away', label: 'target away', kind: 'rate' as const },
    { key: 'incoming', label: 'rounds at him', kind: 'mean' as const },
    { key: 'hits', label: 'hits on him', kind: 'mean' as const },
    { key: 'found', label: 'detected', kind: 'rate' as const },
    { key: 'nearest', label: 'nearest guard (m)', kind: 'median' as const },
    { key: 'believed', label: 'estimate off at the end (m)', kind: 'median' as const },
    { key: 'visible', label: 'guards in line at the end', kind: 'mean' as const },
  ];
  const nothing = (): Record<string, number> => Object.fromEntries(measures.map((m) => [m.key, NaN]));
  return {
    name,
    about,
    series: 'lab-e-overlook',
    camps: 12,
    arms: MOVES,
    measures,
    run(seed, arm, tuning) {
      const sc = overlook(`seed=${seed}&plan=clear&pace=${PACE}`) as Scene<Simulation>;
      const run = sceneRun(sc, tuning, { seconds: SECONDS });
      const first = firstTick(run, (sim, events) => events.some((e) => e.type === 'shot' && e.source === sim.playerId));
      if (first === null) return nothing();
      const at = first + 2 * tuning.sim.tickHz;
      let from: { x: number; z: number } | null = null;
      let target = '';
      let moved = 0;
      try {
        const o = playBranch(run, at, change(arm as Move, firing, (at + PACE * tuning.sim.tickHz) / tuning.sim.tickHz), (sim) => {
          if (sim.tick === at) from = { x: sim.player.x, z: sim.player.z };
          if (sim.tick >= at && from) moved = Math.max(moved, Math.sqrt((sim.player.x - from.x) * (sim.player.x - from.x) + (sim.player.z - from.z) * (sim.player.z - from.z)));
          target = commanderOf(sim)?.camp.objective?.status ?? '';
        });
        return {
          moved,
          down: o.readings.guardsDown,
          shot: target === 'done' ? 1 : 0,
          away: target === 'escaped' ? 1 : 0,
          incoming: o.readings.roundsAtYou,
          hits: o.hits,
          found: o.readings.detected ? 1 : 0,
          nearest: o.readings.nearestEver,
          believed: o.readings.estimateOff,
          visible: o.readings.inLine,
        };
      } catch (e) {
        // A camp with no firing point that far away has nothing to say about moving that far.
        if (e instanceof Error && /No firing point/.test(e.message)) return nothing();
        throw e;
      }
    },
  };
}

export const relocate = experiment('relocate', 'what moving 30 m or 100 m after the first shot buys against the camp, for a shooter who goes on shooting', true);
export const relocateQuiet = experiment('relocate-quiet', 'the same, for a shooter who fires one shot and no more, with the whole camp left to find him', false);
