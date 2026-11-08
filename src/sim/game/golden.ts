import { hashString } from '../kernel/core/hash';

/**
 * The golden values: what this build's deterministic math, generation and pinned runs
 * give, bit for bit (selftest.ts checks them; runs.ts says how each run is played).
 *
 * Each run of play has two fingerprints:
 *   behaviour  what can be observed, every tick: where every body is and how it stands,
 *              and every event, each entity's in order. Internal bookkeeping doesn't
 *              count, so restructuring that changes nothing observable keeps it.
 *   state      the hash of the whole state tree at the end, which also pins its layout.
 *
 * If a change moves `behaviour`, it changed what the game does: bump SIM_VERSION, update
 * the values and add a line to docs/decisions.md. If it moves only `state`, it changed
 * how state is stored: bump STATE_SCHEMA instead. If either moves by accident, the
 * change has a bug. `npm run explain` says where a moved value first diverged.
 */
export const GOLDEN = {
  /** Bits of every deterministic math function over 4,000 inputs each. */
  detmath: '8d55144e8e74968f',
  /** Everything generation decides for TAL-4471 (also pinned in tests/world.test.ts). */
  world: 'f555512c33daea22',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: '688ae4eddeadae3a', state: '4c04325e4eca45c6' },
    'MUD-9031 wander': { behaviour: '67964675cb39477e', state: '4002c5b682b8bcc8' },
    'TAL-4471 chaos': { behaviour: 'fe623d33389a2f21', state: 'e8037411190fc911' },
  },
  /**
   * Scenes run by their own drivers, each pinning its lane (benches.ts): the movement
   * course covers stairs, drops, ramps, ceilings, crawling and surfaces; the perception
   * lab, guards seeing and hearing a walker who ends in a bush; the shooting range, a
   * marksman's shots from the click to the body on the ground; spawn timing,
   * bodies spawned inside a tick; the kernel alone, a run with every lane switched off;
   * camp systems, a generated camp with its generator cut and its target taken (lab D).
   */
  scenes: {
    'movement-course': { behaviour: '40c97133a0ef732d', state: 'a72123b8c4cb29d8' },
    'perception-lab': { behaviour: '0dfa42645814f21a', state: '6625deddfd28368b' },
    'shooting-range': { behaviour: 'b1e8920883443ac0', state: '991969418ddbcee4' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: '2535df87754d14eb' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: 'b51b84477d71dbf1' },
    'camp-systems': { behaviour: 'e5c646c959574b12', state: 'd922e4245070fa08' },
  },
} as const;

export type PinnedRunName = keyof typeof GOLDEN.play | keyof typeof GOLDEN.scenes;

/**
 * This build's behaviour, in one digest of every pinned behaviour value. A recording
 * carries the digest of the build that made it, so a build that behaves differently, such
 * as a lab's preview deploy with the same SIM_VERSION as `main`, refuses it with a reason
 * instead of diverging partway (kernel/record/resim.ts).
 */
export const BEHAVIOUR = hashString(
  [...Object.entries(GOLDEN.play), ...Object.entries(GOLDEN.scenes)]
    .map(([name, g]) => `${name}=${g.behaviour}`)
    .sort()
    .join('\n'),
);
