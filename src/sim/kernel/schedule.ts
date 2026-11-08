/**
 * Delayed effects: a radio call that arrives late, reinforcements that turn up after a
 * delay, a search that ends when its time runs out. Each is an entry in the state tree
 * saying what happens (`kind`, with two numbers such as entity ids) and on which tick.
 *
 * Entries fall due in tick order, and entries due on the same tick in the order they
 * were scheduled, so the queue is deterministic and saves, restores and hashes with the
 * rest of the state. The 'schedule' phase runs each due entry's handler at the start of
 * its tick, before anything moves, so the whole tick sees its effect.
 *
 * The queue is a binary min-heap kept in a plain array.
 */

export interface Scheduled {
  /** The tick this falls due on. */
  tick: number;
  /** Order of scheduling: breaks ties between entries due on the same tick. */
  seq: number;
  kind: string;
  a: number;
  b: number;
}

export interface ScheduleState {
  /** The next entry's `seq`. */
  seq: number;
  queue: Scheduled[];
}

export function emptySchedule(): ScheduleState {
  return { seq: 0, queue: [] };
}

function before(x: Scheduled, y: Scheduled): boolean {
  return x.tick < y.tick || (x.tick === y.tick && x.seq < y.seq);
}

/** Schedules `kind` for `tick`, which must be in the future: a tick never schedules into itself. */
export function scheduleAt(s: ScheduleState, now: number, tick: number, kind: string, a = 0, b = 0): void {
  if (!Number.isInteger(tick) || tick <= now) throw new Error(`Can't schedule '${kind}' for tick ${tick} from tick ${now}`);
  const q = s.queue;
  const e: Scheduled = { tick, seq: s.seq++, kind, a, b };
  let i = q.length;
  q.push(e);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(e, q[parent]!)) break;
    q[i] = q[parent]!;
    i = parent;
  }
  q[i] = e;
}

/** Ticks from now until `seconds` have passed: at least one, so a delay always lands in a later tick. */
export function ticksAfter(seconds: number, dt: number): number {
  return Math.max(1, Math.round(seconds / dt));
}

/** Removes and returns the earliest entry due on or before `tick`, or null if none is. */
export function popDue(s: ScheduleState, tick: number): Scheduled | null {
  const q = s.queue;
  const top = q[0];
  if (!top || top.tick > tick) return null;
  const last = q.pop()!;
  if (q.length > 0) {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= q.length) break;
      const r = l + 1;
      const c = r < q.length && before(q[r]!, q[l]!) ? r : l;
      if (!before(q[c]!, last)) break;
      q[i] = q[c]!;
      i = c;
    }
    q[i] = last;
  }
  return top;
}
