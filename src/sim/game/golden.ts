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
  world: 'd65c15c8a7a25bb6',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: 'dd04c3ea131fbc77', state: '30f1572ebaf8c000' },
    'MUD-9031 wander': { behaviour: 'd0bf5d5bff35c730', state: '19b5e405a99dbd5f' },
    'TAL-4471 chaos': { behaviour: '8bea5ca7b1faa4e3', state: '4d843d893be968dc' },
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
    'movement-course': { behaviour: '0f2551d99837a6bc', state: 'd5397126566a15c5' },
    'perception-crowd': { behaviour: '8a0406d39b05cc58', state: '96edaa6fc1852da6' },
    'perception-lab': { behaviour: '0aad2727a0cf9bbb', state: '3f244f57020fbe8e' },
    'shooting-range': { behaviour: '8cc3e0f7a274c3c5', state: '8499bc18876bc023' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: 'deb338564ad53710' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: '5919638609883179' },
    'camp-systems': { behaviour: 'ee2f1f13c3740683', state: 'c597db17b49ffaa3' },
    'camp-fight': { behaviour: '2e009ed1db8abfb9', state: '9d5a53c290714387' },
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
