import type { SimEvent } from './events';

/**
 * Every event of a run, kept for looking back: the debug view, the debrief, telemetry.
 * Not simulation state: it only reads what the simulation emitted.
 */
export class EventLog {
  private readonly byId = new Map<number, SimEvent>();
  /** Every event added, in order. */
  readonly all: SimEvent[] = [];

  /** Adds a tick's events. The simulation reuses its array, so they are copied. */
  add(events: readonly SimEvent[]): void {
    for (const e of events) {
      const copy = { ...e };
      this.all.push(copy);
      this.byId.set(copy.id, copy);
    }
  }

  get(id: number): SimEvent | undefined {
    return this.byId.get(id);
  }

  /**
   * Why an event happened: the chain of causes, from the first to the event itself.
   * A cause missing from the log (from before it started) ends the chain.
   */
  explain(id: number): SimEvent[] {
    const chain: SimEvent[] = [];
    const seen = new Set<number>();
    for (let e = this.byId.get(id); e && !seen.has(e.id); e = e.cause ? this.byId.get(e.cause) : undefined) {
      seen.add(e.id);
      chain.push(e);
    }
    return chain.reverse();
  }

  clear(): void {
    this.byId.clear();
    this.all.length = 0;
  }
}
