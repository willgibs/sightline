import type { Profiler } from './sim';
import type { Phase, System } from './systems';

/**
 * Time spent in each system, for `npm run sim -- --profile` and the debug view. The
 * caller supplies the clock: the simulation never reads one.
 *
 * Browsers coarsen their clock (to 0.1 ms in Chrome), far coarser than one system's
 * share of a tick, so read totals over many ticks rather than any single one.
 */
export class SystemProfile implements Profiler {
  private readonly totals = new Map<string, { phase: Phase; ms: number; runs: number }>();
  private start = 0;

  constructor(private readonly now: () => number) {}

  begin(): void {
    this.start = this.now();
  }

  end(system: System): void {
    const ms = this.now() - this.start;
    const t = this.totals.get(system.name);
    if (t) {
      t.ms += ms;
      t.runs++;
    } else {
      this.totals.set(system.name, { phase: system.phase, ms, runs: 1 });
    }
  }

  /** Each system's cost averaged over `ticks`, in microseconds per tick, in running order. */
  report(ticks: number): Array<{ name: string; phase: Phase; usPerTick: number; runs: number }> {
    return [...this.totals].map(([name, t]) => ({ name, phase: t.phase, usPerTick: (t.ms * 1000) / Math.max(1, ticks), runs: t.runs }));
  }

  reset(): void {
    this.totals.clear();
  }
}
