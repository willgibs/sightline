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

  /** Feed elapsed real seconds (already scaled by any time scale). Returns ticks to run. */
  advance(elapsed: number): number {
    this.acc += Math.min(Math.max(elapsed, 0), this.maxFrame);
    let ticks = Math.floor(this.acc / this.dt);
    if (ticks > this.maxTicksPerFrame) {
      ticks = this.maxTicksPerFrame;
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
