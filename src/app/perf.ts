/** Rolling frame statistics for the debug panel and the benchmark. */
export class FrameStats {
  private readonly frames: Float64Array;
  private readonly cpu: Float64Array;
  private readonly ticks: Float64Array;
  private i = 0;
  private n = 0;

  constructor(size = 120) {
    this.frames = new Float64Array(size);
    this.cpu = new Float64Array(size);
    this.ticks = new Float64Array(size);
  }

  push(frameMs: number, cpuMs: number, tickMs: number): void {
    this.frames[this.i] = frameMs;
    this.cpu[this.i] = cpuMs;
    this.ticks[this.i] = tickMs;
    this.i = (this.i + 1) % this.frames.length;
    this.n = Math.min(this.n + 1, this.frames.length);
  }

  summary(): { fps: number; frameMs: number; p95Ms: number; cpuMs: number; tickMs: number } {
    if (this.n === 0) return { fps: 0, frameMs: 0, p95Ms: 0, cpuMs: 0, tickMs: 0 };
    const f = Array.from(this.frames.subarray(0, this.n));
    const mean = f.reduce((a, b) => a + b, 0) / this.n;
    const sorted = f.sort((a, b) => a - b);
    const p95 = sorted[Math.min(this.n - 1, Math.floor(0.95 * this.n))]!;
    let cpu = 0;
    let tick = 0;
    for (let k = 0; k < this.n; k++) {
      cpu += this.cpu[k]!;
      tick += this.ticks[k]!;
    }
    return { fps: 1000 / mean, frameMs: mean, p95Ms: p95, cpuMs: cpu / this.n, tickMs: tick / this.n };
  }
}

/** Percentile of an unsorted list. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/**
 * Frame times over a whole session, in 1 ms buckets up to 250 ms: percentiles and slow
 * frames for the playtest report, at a fixed cost however long the session runs.
 */
export class FrameHistogram {
  readonly buckets = new Uint32Array(251);
  count = 0;
  max = 0;
  private sum = 0;

  push(ms: number): void {
    if (!(ms >= 0)) return;
    this.buckets[Math.min(250, Math.floor(ms))]!++;
    this.count++;
    this.sum += ms;
    if (ms > this.max) this.max = ms;
  }

  get mean(): number {
    return this.count ? this.sum / this.count : 0;
  }

  /** The time q of the frames came in under, to the millisecond. */
  percentile(q: number): number {
    if (this.count === 0) return 0;
    const want = q * this.count;
    let seen = 0;
    for (let k = 0; k < this.buckets.length; k++) {
      seen += this.buckets[k]!;
      if (seen >= want) return k + 1;
    }
    return this.buckets.length;
  }

  /** How many frames took longer than `ms` (a whole number of milliseconds). */
  over(ms: number): number {
    let n = 0;
    for (let k = Math.max(0, Math.floor(ms)); k < this.buckets.length; k++) n += this.buckets[k]!;
    return n;
  }
}
