import { describe, expect, it } from 'vitest';
import { InputController as Input } from '../../src/app/input';
import { BrowserStore, type TelemetryReport } from '../../src/app/playtest';
import { Optic } from '../../src/sim/kernel/input';

const down = (button: number): void => void document.dispatchEvent(new MouseEvent('mousedown', { button }));
const up = (button: number): void => void document.dispatchEvent(new MouseEvent('mouseup', { button }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('the scope on a trackpad', () => {
  it('stays up after a tap, so a click can fire, and comes down with another; a long press only peeks', async () => {
    const input = new Input(document.createElement('canvas'));
    input.attach();
    input.locked = true;
    input.armed = true;
    expect(input.opticHeld).toBe(Optic.None);
    down(2);
    up(2);
    expect(input.opticHeld).toBe(Optic.Scope);
    down(0);
    up(0);
    expect(input.opticHeld).toBe(Optic.Scope);
    down(2);
    up(2);
    expect(input.opticHeld).toBe(Optic.None);
    down(2);
    await wait(320);
    expect(input.opticHeld).toBe(Optic.Scope);
    up(2);
    expect(input.opticHeld).toBe(Optic.None);
    input.detach();
  });
});

/** WebKit under test runs a private profile, where IndexedDB can't hold a Blob at all. */
const webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

describe('the runs kept in this browser', () => {
  it.skipIf(webkit)('can be deleted, one at a time', async () => {
    const store = new BrowserStore();
    const report = (savedAt: string) => ({ savedAt, world: { seed: 'S', scene: null }, run: { ticks: 1, tickHz: 30 } }) as unknown as TelemetryReport;
    await store.save('delete-a', new Blob(['a']), report('2026-11-09T00:00:01.000Z'));
    await store.save('delete-b', new Blob(['b']), report('2026-11-09T00:00:02.000Z'));
    expect((await store.list()).map((r) => r.name)).toEqual(expect.arrayContaining(['delete-a', 'delete-b']));
    await store.remove('delete-a');
    const left = (await store.list()).map((r) => r.name);
    expect(left).toContain('delete-b');
    expect(left).not.toContain('delete-a');
    await store.remove('delete-b');
  });
});
