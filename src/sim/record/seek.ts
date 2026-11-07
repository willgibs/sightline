import { generateWorld, type World } from '../gen/world';
import { neutralInput } from '../input';
import { Simulation } from '../sim';
import type { SimState } from '../state';
import type { Recording, TuningChange } from './recording';

/**
 * Exact seeking in a recording, for the replay and the debrief: re-simulates it once,
 * keeping a save-state every few seconds, then reaches any tick by restoring the nearest
 * one before it and stepping forward with the recorded input. The saved states are a
 * cache (about a kilobyte each); the recording itself stays inputs only.
 */
export class ReplaySeeker {
  readonly sim: Simulation;
  private readonly saves: Array<{ state: SimState; change: number }> = [];
  private readonly input = neutralInput();
  private readonly changes: TuningChange[];
  /** How many of the recording's tuning changes are in force. */
  private change = 0;

  constructor(
    private readonly rec: Recording,
    world?: World,
    private readonly every = 150,
  ) {
    const h = rec.header;
    this.changes = rec.tuningChanges();
    this.sim = new Simulation(world ?? generateWorld(h.mission, h.tuning), h.tuning);
    this.saves.push({ state: this.sim.saveState(), change: 0 });
    while (this.sim.tick < h.ticks) {
      this.stepOne();
      if (this.sim.tick % every === 0) this.saves.push({ state: this.sim.saveState(), change: this.change });
    }
  }

  /** Puts the simulation at `tick` (clamped to the recording) and returns it. */
  seek(tick: number): Simulation {
    const target = Math.max(0, Math.min(this.rec.header.ticks, Math.floor(tick)));
    const save = this.saves[Math.floor(target / this.every)]!;
    this.sim.restore(save.state);
    this.change = save.change;
    this.sim.setTuning(save.change > 0 ? this.changes[save.change - 1]!.tuning : this.rec.header.tuning);
    while (this.sim.tick < target) this.stepOne();
    return this.sim;
  }

  private stepOne(): void {
    this.applyTuning();
    this.rec.readInput(this.sim.tick, this.input);
    this.sim.step(this.input);
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
