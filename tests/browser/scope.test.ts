import { afterEach, describe, expect, it, vi } from 'vitest';
import { Instruments, type InstrumentState } from '../../src/app/scope';
import type { RifleView } from '../../src/sim/game/sim';

/** The scope's overlay is a full-window 2D canvas: millions of pixels, so it's drawn only when something on it changes. */

const rifle = (over: Partial<RifleView> = {}): RifleView => ({ up: 0, right: 0, raise: 1, rest: 0, rounds: 5, zero: 100, bolt: 0, fitting: 0, suppressed: false, load: 'match', heartRate: 70, held: 0, air: 1, glint: 0, steady: 1, ...over });
const state = (over: Partial<InstrumentState> = {}): InstrumentState => ({ scope: 1, binoculars: 0, fovDeg: 4, rifle: rifle(), ranged: null, assists: 'sim', dope: [], dot: null, readout: null, ...over });

describe('the scope overlay', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is drawn once while nothing on it changes, however the rifle sways', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    scope.draw(state());
    const once = clear.mock.calls.length;
    expect(once).toBeGreaterThan(0);
    for (let k = 0; k < 30; k++) scope.draw(state({ rifle: rifle({ up: Math.sin(k), right: Math.cos(k), steady: k / 30 }) }));
    expect(clear.mock.calls.length).toBe(once);
  });

  it('is drawn again when something on it does change', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    scope.draw(state());
    let calls = clear.mock.calls.length;
    const changes: Array<Partial<InstrumentState>> = [{ rifle: rifle({ rounds: 4 }) }, { rifle: rifle({ rounds: 4, suppressed: true }) }, { rifle: rifle({ rounds: 4, suppressed: true, air: 0.5 }) }, { scope: 0.8, rifle: rifle({ rounds: 4, suppressed: true, air: 0.5 }) }];
    for (const c of changes) {
      scope.draw(state(c));
      expect(clear.mock.calls.length).toBeGreaterThan(calls);
      calls = clear.mock.calls.length;
    }
  });

  it('comes back after being put away', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    scope.draw(state());
    scope.draw(state({ scope: 0, rifle: null }));
    const calls = clear.mock.calls.length;
    scope.draw(state());
    expect(clear.mock.calls.length).toBeGreaterThan(calls);
  });
});
