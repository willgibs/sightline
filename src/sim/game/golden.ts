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
  world: '4640c8146acaa42b',
  /** 60 s of play: the person-like bot in two valleys, the fuzzing bot in one. */
  play: {
    'TAL-4471 wander': { behaviour: 'dd04c3ea131fbc77', state: 'ccb5e6855313bb66' },
    'MUD-9031 wander': { behaviour: 'd0bf5d5bff35c730', state: 'f1b50e82c8db8a0a' },
    'TAL-4471 chaos': { behaviour: '8bea5ca7b1faa4e3', state: 'f2afae4655015058' },
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
    'movement-course': { behaviour: '0f2551d99837a6bc', state: 'e151f704efdfc053' },
    'perception-crowd': { behaviour: 'bc307aa49c7feb7a', state: '5c87451629c9b453' },
    'perception-lab': { behaviour: '0aad2727a0cf9bbb', state: 'c579a99618ead109' },
    'shooting-range': { behaviour: '8cc3e0f7a274c3c5', state: 'd0676f9f10a445c2' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: '08480ad0b6bd8fcb' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: '789ff03523af9afc' },
    'camp-systems': { behaviour: 'ee2f1f13c3740683', state: '85c82dd745f3e55e' },
    'camp-fight': { behaviour: 'e4b1399d4cf58e68', state: 'c301e6f3930af2de' },
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
