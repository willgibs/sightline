import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/app/styles.css';
import { Hud } from '../../src/app/hud';
import { Kit, kitFields, type RifleReadout } from '../../src/app/kit';
import { Minimap } from '../../src/app/minimap';
import { Overlay, type OverlayHandlers } from '../../src/app/overlay';
import { Blocks } from '../../src/sim/kernel/world/colliders';
import { Surface } from '../../src/sim/kernel/world/surfaces';
import type { World } from '../../src/sim/kernel/world/world';
import { testWorld } from '../fixtures';

/**
 * The corner in a real browser: the honest view's readouts laid out by the real stylesheet.
 * The picture is painted once and left alone, and the corner keeps off the other panels.
 */

const rifle: RifleReadout = { rounds: 15, zero: 100, fitting: 0, swapping: false, suppressed: false, load: 'match' };

/** A hollow-looking building, a fence and some relief: a camp, small. */
function camp(): World {
  const box = (x: number, z: number, hx: number, hz: number, y0: number, y1: number, flags: number) => ({ kind: 'box' as const, x, z, y0, y1, hx, hz, ux: 1, uz: 0, flags, surface: Surface.Wood });
  return testWorld({
    size: 200,
    cell: 2,
    height: (x, z) => 3 * Math.sin(x / 40) * Math.cos(z / 30),
    colliders: [box(20, 0, 8, 6, 3, 3.2, Blocks.All), box(20, -6, 8, 0.1, 0, 3, Blocks.All), box(-30, 30, 8, 0.1, 0, 2, Blocks.Move)],
    camp: { structures: [{ kind: 'building', colliders: [0, 1] }], guards: [], fenceHalf: 0 },
    spawn: { x: 0, z: 40 },
  });
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'hud';
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  vi.restoreAllMocks();
});

describe('the map', () => {
  it('paints its picture once, however the player moves', () => {
    const map = new Minimap(root, '<kbd>1</kbd>');
    map.setWorld(camp());
    map.resize(1280, 720);
    map.update({ x: 0, z: 40, yaw: 0 }, false);
    const picture = root.querySelector('.minimap canvas');
    expect(picture).not.toBeNull();
    const marker = root.querySelector<HTMLElement>('.minimap-you')!;
    const painted = marker.style.transform;
    const drawing = (['drawImage', 'putImageData', 'fill', 'stroke', 'fillRect', 'clearRect', 'fillText'] as const).map((m) => vi.spyOn(CanvasRenderingContext2D.prototype, m));
    const made = vi.spyOn(document, 'createElement');
    for (let k = 0; k < 400; k++) map.update({ x: k / 5, z: 40 - k / 7, yaw: k / 40 }, false);
    expect(root.querySelector('.minimap canvas')).toBe(picture);
    for (const spy of drawing) expect(spy).not.toHaveBeenCalled();
    expect(made).not.toHaveBeenCalled();
    expect(marker.style.transform).not.toBe(painted);
  });

  it('keeps each size once a world has it, and starts over for the next world', () => {
    const map = new Minimap(root, '<kbd>1</kbd>');
    map.setWorld(camp());
    map.resize(1280, 720);
    const you = { x: 0, z: 40, yaw: 0 };
    map.update(you, false);
    const small = root.querySelector('.minimap canvas');
    map.cycle();
    map.update(you, false);
    const large = root.querySelector('.minimap canvas');
    expect(large).not.toBe(small);
    map.cycle(); // put away
    map.update(you, false);
    map.cycle(); // and back: the same picture, not a new one
    map.update(you, false);
    expect(root.querySelector('.minimap canvas')).toBe(small);
    map.setWorld(camp());
    map.update(you, false);
    expect(root.querySelector('.minimap canvas')).not.toBe(small);
  });

  it('shows nothing, and paints nothing, when the eyes on screen are not the player\'s', () => {
    const map = new Minimap(root, '<kbd>1</kbd>');
    map.setWorld(camp());
    map.update(null, false);
    expect(root.querySelector<HTMLElement>('.minimap')!.hidden).toBe(true);
    expect(root.querySelector('.minimap canvas')).toBeNull();
  });

  it('puts the marker where the player is, pointing where they look', () => {
    const map = new Minimap(root, '<kbd>1</kbd>');
    map.setWorld(camp());
    map.resize(1280, 720);
    // The middle of a map whose square is centred on the world's, looking west: yaw goes up turning left.
    map.update({ x: 0, z: 0, yaw: Math.PI / 2 }, false);
    const marker = root.querySelector<HTMLElement>('.minimap-you')!;
    expect(marker.style.transform).toBe('translate(83px, 83px) rotate(-90deg)');
  });
});

describe('the kit', () => {
  it('shows only what applies', () => {
    const kit = new Kit(root);
    const el = root.querySelector<HTMLElement>('.kit')!;
    kit.show(null);
    expect(el.hidden).toBe(true);
    kit.show(kitFields('crouch', false, null));
    expect(el.hidden).toBe(false);
    expect(el.dataset.stance).toBe('crouch');
    expect(el.classList.contains('has-rifle')).toBe(false);
    kit.show(kitFields('prone', false, { ...rifle, suppressed: true, fitting: 2, rounds: 1, load: 'subsonic' }));
    expect(el.textContent).toContain('PRONE');
    expect(el.textContent).toContain('FITTING');
    expect(el.textContent).toContain('SUBSONIC');
    expect(el.textContent).toContain('1 RD');
    expect(el.textContent).not.toContain('1 RDS');
    expect(el.textContent).toContain('ZERO 100');
  });
});

describe('the controls list', () => {
  it('offers the map key, and takes it back where it does nothing', () => {
    const nothing = (): void => undefined;
    const handlers: OverlayHandlers = { onResume: nothing, onGenerate: nothing, onSaveRecording: nothing, onWatch: nothing, onRetry: nothing, onSettings: nothing };
    const overlay = new Overlay(root, handlers);
    const line = root.querySelector<HTMLElement>('.keys [data-key="minimap"]')!;
    expect(line.textContent).toContain('map');
    overlay.setKey('minimap', false);
    expect(line.style.display).toBe('none');
    overlay.setKey('minimap', true);
    expect(line.style.display).toBe('');
  });
});

describe('the corner', () => {
  const up = (hud: Hud): void => {
    hud.map.setWorld(camp());
    hud.kit.show(kitFields('stand', false, rifle));
    hud.map.update({ x: 0, z: 40, yaw: 0 }, false);
  };
  const rect = (selector: string): DOMRect => root.querySelector(selector)!.getBoundingClientRect();
  const clear = (a: DOMRect, b: DOMRect): boolean => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;

  it('stands on the key legend, whatever else is there', () => {
    const hud = new Hud(root);
    hud.setDebug(true);
    up(hud);
    expect(clear(rect('.corner'), rect('.legend'))).toBe(true);
  });

  it('keeps the right-hand panels above it, even with the map enlarged', () => {
    const hud = new Hud(root);
    hud.setDebug(true);
    hud.dock.add({ id: 'tall', title: 'Tall', side: 'right', open: true, text: () => 'a line\n'.repeat(400) });
    hud.dock.refresh();
    up(hud);
    expect(clear(rect('.corner'), rect('.dev-dock-right'))).toBe(true);
    hud.map.cycle();
    hud.map.update({ x: 0, z: 40, yaw: 0 }, false);
    expect(root.querySelector<HTMLElement>('.minimap')!.dataset.mode).toBe('large');
    expect(clear(rect('.corner'), rect('.dev-dock-right'))).toBe(true);
  });
});
