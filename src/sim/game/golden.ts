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
    'TAL-4471 wander': { behaviour: 'dd04c3ea131fbc77', state: 'd3c806b930e211e2' },
    'MUD-9031 wander': { behaviour: 'd0bf5d5bff35c730', state: '258c0babc42fdbf0' },
    'TAL-4471 chaos': { behaviour: '8bea5ca7b1faa4e3', state: '8b7684a7779eb31e' },
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
    'movement-course': { behaviour: '0f2551d99837a6bc', state: 'fe192089a913d315' },
    'perception-crowd': { behaviour: 'bc307aa49c7feb7a', state: 'a180f94997ac86fe' },
    'perception-lab': { behaviour: '0aad2727a0cf9bbb', state: '626ab98dfec3f52d' },
    'shooting-range': { behaviour: '8cc3e0f7a274c3c5', state: '889ab20027d2b463' },
    'spawn-tick': { behaviour: 'f5e93112e48134bb', state: '52951a96414d49aa' },
    'kernel-alone': { behaviour: '0698e581024f5b35', state: '802974068b30de09' },
    'camp-systems': { behaviour: 'ee2f1f13c3740683', state: '6a56ee19eb2be8b0' },
    'camp-fight': { behaviour: 'e4b1399d4cf58e68', state: 'a86f255553a10f48' },
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
