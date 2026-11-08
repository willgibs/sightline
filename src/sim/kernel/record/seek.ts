import { neutralInput } from '../input';
import type { SimEvent } from '../events';
import type { Simulation } from '../sim';
import type { SimState } from '../state';
import type { Recording, TuningChange } from './recording';
import { replaySimulation, type ReplayOptions } from './resim';

/**
 * Exact seeking in a recording, for the replay and the debrief: re-simulates it once,
 * keeping a save-state every few seconds, then reaches any tick by restoring the nearest
 * one before it and stepping forward with the recorded input. The saved states are a
 * cache (about a kilobyte each); the recording itself stays inputs only. A run that
 * ended in a fault can be watched up to the tick before it.
 */
const NO_EVENTS: readonly SimEvent[] = [];

export class ReplaySeeker<S extends Simulation = Simulation> {
  readonly sim: S;
  /** The last tick that can be shown: the recording's end, or the tick before its fault. */
  readonly ticks: number;
  private readonly saves: Array<{ state: SimState; change: number }> = [];
  private readonly input = neutralInput();
  private readonly changes: TuningChange[];
  /** How many of the recording's tuning changes are in force. */
  private change = 0;

  private readonly every: number;

  /** Throws if this build can't re-simulate the recording (replaySimulation says why). `every`: ticks between save-states. */
  constructor(
    private readonly rec: Recording,
    opts: ReplayOptions<S> & { every?: number } = {},
  ) {
    const h = rec.header;
    this.every = opts.every ?? 150;
    this.ticks = h.fault ? h.ticks - 1 : h.ticks;
    this.changes = rec.tuningChanges();
    const sim = replaySimulation(rec, opts);
    if (typeof sim === 'string') throw new Error(`Can't replay this recording: ${sim}`);
    this.sim = sim;
    this.saves.push({ state: this.sim.saveState(), change: 0 });
    while (this.sim.tick < this.ticks) {
      this.stepOne();
      if (this.sim.tick % this.every === 0) this.saves.push({ state: this.sim.saveState(), change: this.change });
    }
  }

  /** Puts the simulation at `tick` (clamped to the recording) and returns it. */
  seek(tick: number): S {
    const target = Math.max(0, Math.min(this.ticks, Math.floor(tick)));
    const save = this.saves[Math.floor(target / this.every)]!;
    this.sim.restore(save.state);
    this.change = save.change;
    this.sim.setTuning(save.change > 0 ? this.changes[save.change - 1]!.tuning : this.rec.header.tuning);
    while (this.sim.tick < target) this.stepOne();
    return this.sim;
  }

  /**
   * Plays one more tick of the recording, from wherever the simulation is, and returns its
   * events (the array is reused); none at the end. For watching a replay play.
   */
  step(): readonly SimEvent[] {
    if (this.sim.tick >= this.ticks) return NO_EVENTS;
    return this.stepOne();
  }

  private stepOne(): readonly SimEvent[] {
    this.applyTuning();
    this.rec.readInput(this.sim.tick, this.input);
    return this.sim.step(this.input);
  }

  /** Brings in any tuning change that applies from the next tick. */
  private applyTuning(): void {
    let k = this.change;
    while (k < this.changes.length && this.changes[k]!.tick <= this.sim.tick + 1) k++;
    if (k !== this.change) {
      this.change = k;
      this.sim.setTuning(this.changes[k - 1]!.tuning);
    }
  }
}
