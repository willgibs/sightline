import { describe, expect, it } from 'vitest';
import { ActionMap, DEFAULT_ACTIONS, keysHtml, type Context } from '../src/app/actions';
import { DEFAULT_SETTINGS, cleanSettings } from '../src/app/settings';

/** The browser app's data: the action map and the player's settings. */
describe('the action map', () => {
  const map = new ActionMap();
  const all = new Set<Context>(['play', 'always', 'debug', 'fly']);

  it('binds each key or button to one action, so no two can fire together', () => {
    const seen = new Map<string, string>();
    for (const [action, spec] of Object.entries(DEFAULT_ACTIONS)) {
      for (const input of spec.inputs) {
        expect(seen.get(input), `${input} is bound to ${seen.get(input)} and ${action}`).toBeUndefined();
        seen.set(input, action);
      }
    }
  });

  it('only answers in the contexts an action belongs to', () => {
    expect(map.actionsOf('KeyW', new Set(['play']))).toEqual(['forward']);
    expect(map.actionsOf('KeyB', new Set(['play', 'always']))).toEqual([]);
    expect(map.actionsOf('KeyB', all)).toEqual(['colliders']);
    expect(map.actionsOf('Space', new Set(['play', 'always', 'debug']))).toEqual([]);
    expect(map.actionsOf('Space', all)).toEqual(['flyUp']);
    expect(map.actionsOf('F3', new Set(['always']))).toEqual(['debugView']);
  });

  it('names keys the way a legend shows them', () => {
    expect(map.describe('zoom')).toBe('Right mouse or F');
    expect(keysHtml(map, ['forward', 'left', 'back', 'right'])).toBe('<kbd data-code="KeyW KeyA KeyS KeyD">W A S D</kbd>');
    expect(keysHtml(map, ['sprint'])).toBe('<kbd data-code="ShiftLeft">Shift</kbd>');
    expect(keysHtml(map, ['debugView'])).toBe('<kbd data-code="F3">F3</kbd> or <kbd data-code="Backquote">`</kbd>');
  });
});

describe('settings', () => {
  it('keep what is sensible, and fall back where it is not', () => {
    expect(cleanSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ sensitivity: 99, fov: 20, volume: -1, invertY: 'yes', rawMouse: true })).toEqual({
      sensitivity: 4,
      fov: 40,
      volume: 0,
      invertY: false,
      rawMouse: true,
    });
    expect(cleanSettings({ sensitivity: NaN, fov: 0 }).sensitivity).toBe(1);
  });
});
