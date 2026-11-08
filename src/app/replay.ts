import { generateWorld } from '../sim/generation';
import type { World } from '../sim/kernel/world/world';
import { neutralInput, Optic } from '../sim/kernel/input';
import type { Recording } from '../sim/kernel/record/recording';
import { ReplaySeeker } from '../sim/kernel/record/seek';
import { sceneOf, type Scene } from '../sim/game/scenes';
import { SIGHTLINE, type Simulation } from '../sim/game/sim';
import type { TimelineMark } from './timeline';

/**
 * A recording being watched: the simulation it re-creates, where in it the replay is,
 * whether it's playing and how fast. Seeking is exact, from the save-states the seeker
 * keeps (sim/kernel/record/seek.ts); playing steps the recorded input forward a tick at a time,
 * so the replay shows exactly what happened, guards and all, from any camera.
 */

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** Sounds play up to this speed; faster, they'd only be noise. */
export const REPLAY_SOUND_SPEED = 2;

export class Replay {
  readonly seeker: ReplaySeeker<Simulation>;
  readonly world: World;
  readonly scene: Scene | null;
  /** The last tick the replay can show. */
  readonly ticks: number;
  readonly hz: number;
  readonly marks: readonly TimelineMark[];
  playing = true;
  private speedIndex = 2;
  private readonly input = neutralInput();

  /**
   * Builds the recording's world and re-simulates it once to keep save-states. Throws,
   * saying why, if this build can't replay it.
   */
  constructor(
    readonly rec: Recording,
    readonly label: string,
  ) {
    const h = rec.header;
    this.scene = h.scene ? (sceneOf(h) ?? null) : null;
    if (h.scene && !this.scene) throw new Error(`This recording was made in the scene '${h.scene.name}', which this build doesn't have`);
    this.world = this.scene ? this.scene.world(h.tuning) : generateWorld(h.mission, h.tuning);
    this.seeker = new ReplaySeeker(rec, { game: SIGHTLINE, world: this.world, scene: this.scene ?? undefined });
    this.ticks = this.seeker.ticks;
    this.hz = h.tickHz;
    this.marks = rec.annotations().map((a) => ({ tick: a.tick, kind: a.kind, ...(a.text ? { text: a.text } : {}) }));
  }

  get sim() {
    return this.seeker.sim;
  }

  get speed(): number {
    return REPLAY_SPEEDS[this.speedIndex]!;
  }

  /** Slower or faster by one step (−1 or +1); the next step round from the fastest. */
  changeSpeed(d: number): number {
    this.speedIndex = d === 0 ? (this.speedIndex + 1) % REPLAY_SPEEDS.length : Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, this.speedIndex + d));
    return this.speed;
  }

  /** Whether the player had an optic up on this tick: the replay zooms as they did. */
  opticAt(tick: number): boolean {
    if (this.ticks === 0) return false;
    this.rec.readInput(Math.max(0, Math.min(this.ticks - 1, tick)), this.input);
    return this.input.optic !== Optic.None;
  }

  /** The next marker after `tick`, or before it (dir −1), if any. */
  markFrom(tick: number, dir: 1 | -1): number | null {
    const ticks = this.marks.filter((m) => m.kind === 'marker').map((m) => m.tick);
    const pick = dir > 0 ? ticks.filter((t) => t > tick).sort((a, b) => a - b)[0] : ticks.filter((t) => t < tick).sort((a, b) => b - a)[0];
    return pick ?? null;
  }
}
