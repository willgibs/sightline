import { diffStates, show, type Difference } from './diff';
import type { TickInput } from './input';
import { decodeState, encodeState } from './record/stateCodec';
import type { Simulation } from './sim';
import { hashState, stateParts, type SimState } from './state';

/**
 * Synctest: proof, over a long run, that a save-state really is the whole state. Every
 * `every` ticks it saves the state twice, through structuredClone and through the
 * on-disk codec (record/stateCodec.ts). When `every` more ticks have passed, it puts each
 * copy back and steps the same inputs again: the codec's copy into a shadow simulation
 * built the same way (fresh caches, fresh scratch), the clone into the main simulation
 * itself (a rollback). Every tick must match the main run's, part by part. State kept
 * anywhere but the tree, a cache rebuilt differently after a restore, or a codec that
 * loses a bit all show up as the first tick and the parts that disagree.
 *
 * This is Factorio's heavy mode, which saves and loads every tick, and the SyncTest of
 * the rollback library GGPO, which rolls back and re-runs; `npm run fuzz -- --synctest`
 * runs it for hours.
 */

export interface SyncFailure {
  /** The tick whose state disagreed. */
  tick: number;
  /** How the state was put back: through the codec into a fresh simulation, by rolling the main one back, or the codec's own round trip. */
  how: 'codec' | 'rollback' | 'round trip';
  /** The parts that disagreed: 'guard:4', 'rng', 'player:1'. */
  parts: string[];
  /** The first state paths that differ, the main run's value first. */
  paths: Difference[];
}

export interface SyncReport {
  /** Save-states taken and put back. */
  saves: number;
  /** Ticks re-stepped and compared. */
  ticks: number;
  failure: SyncFailure | null;
}

export class SyncTest {
  readonly report: SyncReport = { saves: 0, ticks: 0, failure: null };
  private saved: { clone: SimState; disk: SimState } | null = null;
  /** Since the save: each tick's input and the main run's state after it. */
  private readonly inputs: TickInput[] = [];
  private readonly states: SimState[] = [];

  /** `shadow` must be built like `sim`: the same world, tuning and systems. */
  constructor(
    private readonly sim: Simulation,
    private readonly shadow: Simulation,
    readonly every = 30,
  ) {
    if (!Number.isInteger(every) || every < 1) throw new Error(`A synctest every ${every} ticks`);
  }

  /** Call before each tick of the main simulation. */
  beforeTick(): void {
    if (this.saved || this.report.failure || this.sim.tick % this.every !== 0) return;
    const disk = decodeState(encodeState(this.sim.state));
    if (hashState(disk) !== this.sim.hash()) {
      this.fail('round trip', this.sim.tick, this.sim.state, disk);
      return;
    }
    this.saved = { clone: this.sim.saveState(), disk };
    this.inputs.length = 0;
    this.states.length = 0;
  }

  /** Call after each tick of the main simulation. Returns the failure the first time restoring and re-stepping disagree. */
  afterTick(): SyncFailure | null {
    if (!this.saved || this.report.failure) return this.report.failure;
    const input = this.sim.lastInput;
    this.inputs.push({ ...input, commands: input.commands.map((c) => ({ ...c })) });
    this.states.push(this.sim.saveState());
    if (this.inputs.length < this.every) return null;
    const { disk, clone } = this.saved;
    this.saved = null;
    this.report.saves++;
    if (this.replay(this.shadow, disk, 'codec')) return this.report.failure;
    this.replay(this.sim, clone, 'rollback');
    return this.report.failure;
  }

  /** Puts `state` back into `sim` and steps the recorded inputs, comparing each tick with the main run's. */
  private replay(sim: Simulation, state: SimState, how: SyncFailure['how']): boolean {
    sim.restore(state);
    for (let k = 0; k < this.inputs.length; k++) {
      sim.step(this.inputs[k]!);
      this.report.ticks++;
      const want = this.states[k]!;
      if (hashState(sim.state) !== hashState(want)) {
        this.fail(how, sim.tick, want, sim.state);
        return true;
      }
    }
    return false;
  }

  private fail(how: SyncFailure['how'], tick: number, want: SimState, got: SimState): void {
    const before = new Map(stateParts(want));
    const parts = stateParts(got)
      .filter(([name, hash]) => before.get(name) !== hash)
      .map(([name]) => name);
    for (const [name] of before) if (!parts.includes(name) && !stateParts(got).some(([n]) => n === name)) parts.push(name);
    this.report.failure = { tick, how, parts, paths: diffStates(want, got, 8) };
  }
}

/** A synctest failure in words, for a log. */
export function describeSyncFailure(f: SyncFailure): string {
  const paths = f.paths.map((d) => `${d.path}: ${show(d.from)} → ${show(d.to)}`).join('; ');
  return `tick ${f.tick}, put back by ${f.how}: ${f.parts.join(', ') || 'the whole state'} differ${paths ? ` (${paths})` : ''}`;
}
