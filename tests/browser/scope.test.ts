import { afterEach, describe, expect, it, vi } from 'vitest';
import { Instruments, type InstrumentState } from '../../src/app/scope';
import type { RifleView } from '../../src/sim/game/sim';

/** The scope's overlay is a full-window 2D canvas: millions of pixels, so it's drawn only when something on it changes. */

const rifle = (over: Partial<RifleView> = {}): RifleView => ({ up: 0, right: 0, raise: 1, rest: 0, rounds: 5, zero: 100, bolt: 0, fitting: 0, swapping: false, suppressed: false, load: 'match', heartRate: 70, held: 0, air: 1, glint: 0, steady: 1, ...over });
const state = (over: Partial<InstrumentState> = {}): InstrumentState => ({ scope: 1, binoculars: 0, fovDeg: 4, rifle: rifle(), ranged: null, assists: 'sim', dope: [], dot: null, readout: null, ...over });

/** What of the rifle the overlay doesn't show. The world sways behind it; the rest of the fields must redraw it. */
const NOT_ON_THE_OVERLAY: ReadonlySet<string> = new Set<keyof RifleView>(['up', 'right', 'raise', 'heartRate', 'steady']);

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

  it('is drawn again when anything of the rifle it shows changes, so a new field can’t go stale', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    const base = rifle();
    for (const key of Object.keys(base) as Array<keyof RifleView>) {
      scope.draw(state({ rifle: base }));
      const calls = clear.mock.calls.length;
      const v = base[key];
      const other = typeof v === 'number' ? (v > 0 ? 0 : 1) : typeof v === 'boolean' ? !v : `${v}!`;
      scope.draw(state({ rifle: { ...base, [key]: other } }));
      expect(clear.mock.calls.length > calls, key).toBe(!NOT_ON_THE_OVERLAY.has(key));
    }
  });

  it('is drawn again when the optic, the view or a readout changes', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    const changes: Array<Partial<InstrumentState>> = [
      { scope: 0.8 },
      { scope: 0.2, binoculars: 0.9 },
      { fovDeg: 3 },
      { assists: 'lite' },
      { ranged: { range: 300, age: 0 } },
      { dope: [{ range: 100, up: 0, windPerMs: 0.1 }] },
      { dot: { up: 1, right: 1 } },
      { readout: { hold: 1, wind: 1, windFrom: 'N' } },
    ];
    for (const c of changes) {
      scope.draw(state());
      const calls = clear.mock.calls.length;
      scope.draw(state(c));
      expect(clear.mock.calls.length, JSON.stringify(c)).toBeGreaterThan(calls);
    }
  });

  it('doesn’t count a new empty dope table as a change', () => {
    const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect');
    const scope = new Instruments(document.body);
    scope.draw(state({ dope: [] }));
    const calls = clear.mock.calls.length;
    scope.draw(state({ dope: [] }));
    expect(clear.mock.calls.length).toBe(calls);
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
