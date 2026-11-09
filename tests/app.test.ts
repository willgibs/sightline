import { describe, expect, it } from 'vitest';
import { ActionMap, DEFAULT_ACTIONS, keysHtml, type Context } from '../src/app/actions';
import { panelBlock } from '../src/app/hud';
import { DEFAULT_SETTINGS, cleanSettings } from '../src/app/settings';

/** The browser app's data: the action map, the panels' blocks and the player's settings. */
describe('the debug panels', () => {
  it('titles a block by its capitals, and keeps the rest of that line as the first line', () => {
    expect(panelBlock('CAMP · alert · belief 9%\norders: search', 3)).toEqual({ title: 'Camp', body: 'alert · belief 9%\norders: search' });
    expect(panelBlock('PLAYER\npos 1, 2, 3', 1)).toEqual({ title: 'Player', body: 'pos 1, 2, 3' });
    expect(panelBlock('PLAYTEST · nothing saved', 6)).toEqual({ title: 'Playtest', body: 'nothing saved' });
  });

  it('calls the first block the run, and gives an untitled block a title of its own', () => {
    expect(panelBlock('9 fps · seed X\nbuild y', 0)).toEqual({ title: 'Run', body: '9 fps · seed X\nbuild y' });
    expect(panelBlock('some lines\nno title', 4)).toEqual({ title: 'More 4', body: 'some lines\nno title' });
  });
});

describe('the action map', () => {
  const map = new ActionMap();
  const all = new Set<Context>(['play', 'always', 'debug', 'fly']);

  it('binds each key or button to one action in each mode, so no two can fire together', () => {
    // The fly camera's keys may reuse on-foot keys: flying freezes the body's input (input.ts, sampleTick).
    for (const contexts of [
      ['play', 'always', 'debug', 'dev'],
      ['fly', 'always', 'debug', 'dev'],
      ['replay', 'always', 'debug', 'dev'],
    ] as Context[][]) {
      const seen = new Map<string, string>();
      for (const [action, spec] of Object.entries(DEFAULT_ACTIONS)) {
        if (!contexts.includes(spec.context)) continue;
        for (const input of spec.inputs) {
          expect(seen.get(input), `${input} is bound to ${seen.get(input)} and ${action}`).toBeUndefined();
          seen.set(input, action);
        }
      }
    }
  });

  it('only answers in the contexts an action belongs to', () => {
    expect(map.actionsOf('KeyW', new Set(['play']))).toEqual(['forward']);
    expect(map.actionsOf('KeyB', new Set(['play', 'always']))).toEqual([]);
    expect(map.actionsOf('KeyB', all)).toEqual(['colliders']);
    expect(map.actionsOf('Space', new Set(['play', 'always', 'debug']))).toEqual(['climb']);
    expect(map.actionsOf('Space', new Set(['fly', 'always', 'debug']))).toEqual(['flyUp']);
    expect(map.actionsOf('F3', new Set(['always']))).toEqual(['debugView']);
  });

  it('names keys the way a legend shows them', () => {
    expect(map.describe('zoom')).toBe('Right mouse');
    expect(map.describe('binoculars')).toBe('F');
    expect(map.describe('zeroUp')).toBe('↑ or PageUp');
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
      assists: 'lite',
    });
    expect(cleanSettings({ assists: 'arcade' }).assists).toBe('arcade');
    expect(cleanSettings({ assists: 'easy' }).assists).toBe('lite');
    expect(cleanSettings({ sensitivity: NaN, fov: 0 }).sensitivity).toBe(1);
  });
});
