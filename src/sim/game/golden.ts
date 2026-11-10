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
  world: '317ed710bbcc8526',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: '0844c9d26b801aa0', state: 'e0bebfb99afa73b9' },
    'MUD-9031 wander': { behaviour: '5198df1366a18e5a', state: 'df3cdd3a6304ab8e' },
    'TAL-4471 chaos': { behaviour: '9774463eae30de2c', state: '59f6a7b73dc28dc3' },
  },
  /**
   * Scenes run by their own drivers, each pinning its lane (benches.ts): the movement
   * course covers stairs, drops, ramps, ceilings, crawling and surfaces; the perception
   * lab, guards seeing and hearing a walker who ends in a bush, and its crowd of sixteen (the
   * budget); the shooting range, a marksman's shots from the click to the body on the
   * ground; spawn timing,
   * bodies spawned inside a tick; the kernel alone, a run with every lane switched off;
   * camp systems, a generated camp with its generator cut and its target taken (lab D);
   * a camp fight, the first 45 s of a shooter on an overlook with the whole brain awake (lab F).
   */
  scenes: {
    'movement-course': { behaviour: '0f2551d99837a6bc', state: '09b7c0b38f93fb85' },
    'perception-crowd': { behaviour: '8a0406d39b05cc58', state: 'c3b170c93e439d42' },
    'perception-lab': { behaviour: '0aad2727a0cf9bbb', state: 'f50f679a066c2aa2' },
    'shooting-range': { behaviour: '8cc3e0f7a274c3c5', state: '96aaf03fb351723a' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: '8d4c75a6b711d511' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: '0bb32cdd438c309a' },
    'camp-systems': { behaviour: '5453a463a1fc3f81', state: '4e268816788dc12c' },
    'camp-fight': { behaviour: '13c29bc769abab8d', state: 'bf18960bf5a6237f' },
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
