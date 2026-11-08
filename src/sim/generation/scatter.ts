import type { Rng } from '../kernel/core/rng';

/**
 * Scatter that depends only on seed, label and cell (D1). A scattered feature (trees,
 * rocks, bushes, and the camp's dressing later) lays a jittered grid over the ground, and
 * each cell of it draws from its own stream: the feature's labelled fork, mixed with the
 * cell's coordinates. No cell's numbers depend on another cell's, on how many numbers any
 * cell drew, or on the order cells are visited, so:
 *
 * - a generated object keeps its id, the cell it was scattered from, whatever happens to
 *   its neighbours;
 * - a repair that clears or adds cells (lab D's validation, D8) changes only those cells;
 * - a feature can be scattered over part of the world and agree with the whole.
 *
 * Integer mixing only (Math.imul and 32-bit operations), so every engine draws the same.
 */
export class CellStreams {
  private readonly base: readonly [number, number, number, number];
  private readonly stream: Rng;

  /** The streams of the feature `label`, forked from `parent`: they depend on the seed and the label path alone. */
  constructor(parent: Rng, label: string) {
    this.stream = parent.fork(label);
    this.base = this.stream.stateWords();
  }

  /**
   * Cell (i, j)'s own stream. The same object is reseeded for every cell, so draw what a
   * cell needs before asking for the next one.
   */
  at(i: number, j: number): Rng {
    const [a, b, c, d] = this.base;
    const ci = Math.imul(i | 0, 0x9e3779b1);
    const cj = Math.imul(j | 0, 0x85ebca77);
    this.stream.setStateWords([mix(a ^ ci), mix(b ^ cj), mix(c ^ ci ^ 0x27d4eb2f), mix(d ^ cj ^ 0x165667b1)]);
    // sfc32 needs a few rounds before nearby seeds diverge.
    for (let k = 0; k < 8; k++) this.stream.nextU32();
    return this.stream;
  }
}

/** murmur3's finalizer: every input bit reaches every output bit. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
