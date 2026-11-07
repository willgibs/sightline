/**
 * Fixed-step clock. Real frame time goes in; a whole number of simulation ticks comes
 * out, plus the fraction of a tick left over (alpha) that the renderer uses to
 * interpolate between the last two simulation states.
 */
export class FixedStepClock {
  readonly hz: number;
  readonly dt: number;
  /** Longest frame we will catch up on; anything longer is dropped (tab switched, debugger). */
  maxFrame = 0.25;
  /** Hard cap on ticks per frame so a slow machine degrades instead of spiralling. */
  maxTicksPerFrame = 8;
  private acc = 0;

  constructor(hz: number) {
    this.hz = hz;
    this.dt = 1 / hz;
  }

  /**
   * Feed elapsed real seconds and the time scale (the debug view's fast-forward). Returns
   * ticks to run. The limits apply to real time, so a frame that took long still moves
   * the game on by the scale, up to the frame limit.
   */
  advance(elapsed: number, scale = 1): number {
    // NaN fails both comparisons, so it counts as no time rather than poisoning the clock.
    const s = scale > 0 ? scale : 1;
    this.acc += (elapsed > 0 ? Math.min(elapsed, this.maxFrame) : 0) * s;
    const cap = Math.ceil(this.maxTicksPerFrame * Math.max(1, s));
    let ticks = Math.floor(this.acc / this.dt);
    if (ticks > cap) {
      ticks = cap;
      this.acc = 0;
      return ticks;
    }
    this.acc -= ticks * this.dt;
    return ticks;
  }

  /** Fraction of the next tick already elapsed, in [0, 1). */
  get alpha(): number {
    return Math.min(this.acc / this.dt, 1);
  }

  reset(): void {
    this.acc = 0;
  }
}
