import { describe, expect, it } from 'vitest';
import { inBush, inCanopy } from '../src/render/interiors';
import type { Bush, Tree } from '../src/sim/generation/props';

/**
 * Which foliage the camera is inside (render/interiors.ts): inside, or close enough that
 * the camera's near plane would cut into the shape, but not merely near it.
 */

const tree: Tree = { cell: 0, x: 10, y: 5, z: -4, trunkR: 0.2, trunkH: 2, canopyR: 2, canopyH: 8, ux: 1, uz: 0 };
const bush: Bush = { cell: 0, x: -3, y: 1, z: 2, r: 1, h: 1 };

describe('foliage interiors', () => {
  it('know when the eye is in a canopy: the cone narrows to its tip', () => {
    // At the base, out to the canopy's radius; half way up, half of it.
    expect(inCanopy(tree, 10 + 1.9, 7.1, -4)).toBe(true);
    expect(inCanopy(tree, 10 + 0.9, 11, -4)).toBe(true);
    expect(inCanopy(tree, 10 + 1.4, 11, -4)).toBe(false);
    // Under the canopy, by the trunk, is outside it; just under its base or over its tip is close enough to count.
    expect(inCanopy(tree, 10.5, 6, -4)).toBe(false);
    expect(inCanopy(tree, 10.5, 6.9, -4)).toBe(true);
    expect(inCanopy(tree, 10, 15.1, -4)).toBe(true);
    expect(inCanopy(tree, 10, 15.3, -4)).toBe(false);
  });

  it('know when the eye is in a bush, crouched or prone, and not when standing over it', () => {
    expect(inBush(bush, -3, 1.3, 2)).toBe(true);
    expect(inBush(bush, -3.8, 1.4, 2.2)).toBe(true);
    expect(inBush(bush, -3, 1 + 1.65, 2)).toBe(false);
    expect(inBush(bush, -5, 1.3, 2)).toBe(false);
  });
});
