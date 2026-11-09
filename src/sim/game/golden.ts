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
  world: 'f4a711268d0f8a54',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: 'cda868bdf5e5d56e', state: 'b866ad76f8ce43d0' },
    'MUD-9031 wander': { behaviour: '5198df1366a18e5a', state: 'b6f8df743ce0b3d7' },
    'TAL-4471 chaos': { behaviour: '071a26a605f84d96', state: '2ab332fdecaa7487' },
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
    'movement-course': { behaviour: '0f2551d99837a6bc', state: '549efd1a98bc727c' },
    'perception-crowd': { behaviour: '8a0406d39b05cc58', state: '838930f20ad18c54' },
    'perception-lab': { behaviour: '0aad2727a0cf9bbb', state: 'a7c651e821e7b293' },
    'shooting-range': { behaviour: '8cc3e0f7a274c3c5', state: '5c849d1f738b28d5' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: '30be7b87da76f7de' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: '045b6f0f6879675a' },
    'camp-systems': { behaviour: 'd60f842d6b1f6ed8', state: 'af3d3b15725f8c5a' },
    'camp-fight': { behaviour: '9d006a812c1d5b8a', state: '2faf24b22481e596' },
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
