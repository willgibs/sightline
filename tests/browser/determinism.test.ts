import { describe, expect, it } from 'vitest';
import { runSelfTest } from '../../src/sim/game/selftest';

/**
 * The simulation inside this browser's own JavaScript engine must produce exactly the
 * same bits as Node: V8 in Chromium, SpiderMonkey in Firefox, JavaScriptCore in WebKit.
 * That is what lets a recording made in one browser replay in another, or in CI.
 */
describe('determinism in this browser', () => {
  it('matches the golden values', () => {
    for (const r of runSelfTest(() => performance.now())) expect({ name: r.name, hash: r.got }).toEqual({ name: r.name, hash: r.expected });
  });
});
