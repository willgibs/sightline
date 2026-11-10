import type { GenTuning } from '../../config/tuning';
import { Rng } from '../kernel/core/rng';
import type { ModuleName, Side, SlotName } from './compound';
import type { CruxKind } from './crux';
import type { SiteKind } from './landform';
import type { Point2 } from './paths';
import { pickWeighted } from './weights';

/**
 * Compound types (lab D, the world pillar; docs/compound-types.md): what kind of place a camp
 * is. A type is a record in tuning (gen.compound.types): how well it suits each crux and each
 * kind of ground, its plan, its plot's size, its modules. Its `shape` names one of the plot
 * shapes here: a function that turns those numbers into parcels and the lanes between them.
 * Everything downstream (modules, doors, fixtures, cover, staffing, validation) reads what a
 * shape produces and never asks which type it is, so a new type on an old shape is data alone
 * and a new shape is one function.
 *
 * Coordinates are (a, b) in the camp's frame (compound.ts): a from the centre toward the gate,
 * b across. Points are { x: a, z: b }.
 *
 * - **yard** seven slots round an open yard: the compound as first built.
 * - **bailey** the same ring, with the target's building standing in the middle of the yard: a keep.
 * - **spine** the road runs through a long plot, gate to gate, with sheds along both sides of it: a depot.
 * - **steading** no fence, a court of three big buildings round a small farmyard, outbuildings
 *   scattered beyond it: a farm.
 *
 * A seed's type comes from its own root stream, so a valley re-rolled or a camp rebuilt keeps it
 * (crux.ts does the same). A shape that scatters draws only from its own fork (rule 3).
 */

export const COMPOUND_TYPES = ['yard', 'keep', 'depot', 'farm', 'walled'] as const;
export type CompoundType = (typeof COMPOUND_TYPES)[number];
export type CompoundTypeSpec = GenTuning['compound']['types'][CompoundType];

/** The seed's type: weighted by how well each suits its crux and its ground. */
export function compoundTypeOf(seed: string, crux: CruxKind, kind: SiteKind, gen: GenTuning): CompoundType {
  const T = gen.compound.types;
  const fit = (t: CompoundType): number => T[t].cruxes[crux] * T[t].sites[kind];
  return pickWeighted(new Rng(seed, 'compound-type'), { yard: fit('yard'), keep: fit('keep'), depot: fit('depot'), farm: fit('farm'), walled: fit('walled') }, COMPOUND_TYPES);
}

export interface Rect {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/** A parcel: a rectangle something is built on. */
export interface Slot extends Rect {
  slot: SlotName;
  /** The sides of the perimeter it lies against. */
  sides: readonly Side[];
}

/** A place for a watchtower. */
export interface Corner {
  name: string;
  a: number;
  b: number;
  sides: readonly Side[];
}

/** A loop a patrol can walk, by name; its points are (a, b) in the frame. */
export interface PatrolLoop {
  name: string;
  pts: Point2[];
}

/** What a plot shape lays out, in the camp's frame. */
export interface Plot {
  slots: Slot[];
  corners: Corner[];
  /** The loops its patrols walk, by name (staffing.ts). */
  loops: PatrolLoop[];
  /** Where light poles may stand. */
  lights: Point2[];
  /** Ground that cover is kept off: the road, the yard. */
  clear: Rect[];
  /** Modules pinned to parcels of their own, placed before any are chosen. */
  pins: Partial<Record<ModuleName, SlotName>>;
  /** Parcels the motor pool may take, and the barracks, in order of preference. */
  motor: SlotName[];
  barracks: SlotName[];
  /** Gates besides the one the road comes in by. */
  gates: Array<{ side: Side; a: number; b: number; width: number }>;
  /** A strip of road through the plot to paint on the ground, if it has one, in the frame. */
  road: Rect | null;
  /** Which way a door faces from (a, b): toward the plot's heart. */
  inward(a: number, b: number): Point2;
}

export interface PlotInput {
  C: GenTuning['compound'];
  type: CompoundTypeSpec;
  /** Fence half-sizes, the heart's half-size, the lane inside the fence. */
  HA: number;
  HB: number;
  Y: number;
  L: number;
  gateB: number;
  roadB0: number;
  roadB1: number;
  /** A fork of its own, for a shape that scatters. */
  rng: Rng;
}

/** Lays out a plot of the given shape. */
export function layOutPlot(shape: string, x: PlotInput): Plot {
  switch (shape) {
    case 'yard':
      return yardPlot(x);
    case 'bailey':
      return baileyPlot(x);
    case 'spine':
      return spinePlot(x);
    case 'steading':
      return steadingPlot(x);
    default:
      throw new Error(`No plot shape called '${shape}'`);
  }
}

/** Seven slots round the open yard: the shape the compound was first built with. */
function yardPlot(x: PlotInput): Plot {
  const { C, HA, HB, Y, L, gateB, roadB0, roadB1 } = x;
  const lane = C.lane / 2;
  const backW = (2 * (HB - L - 1) - 4) / 3;
  const p = (a: number, b: number): Point2 => ({ x: a, z: b });
  return {
    slots: [
      { slot: 'front-left', a0: Y + 2, a1: HA - L - 1, b0: -HB + L + 1, b1: Math.min(-Y + 4, roadB0 - 2), sides: ['front', 'left'] },
      { slot: 'front-right', a0: Y + 2, a1: HA - L - 1, b0: Math.max(Y - 4, roadB1 + 2), b1: HB - L - 1, sides: ['front', 'right'] },
      { slot: 'mid-left', a0: -Y, a1: Y, b0: -HB + L + 1, b1: -Y - 2, sides: ['left'] },
      { slot: 'mid-right', a0: -Y, a1: Y, b0: Y + 2, b1: HB - L - 1, sides: ['right'] },
      { slot: 'back-left', a0: -HA + L + 1, a1: -Y - 2, b0: -HB + L + 1, b1: -HB + L + 1 + backW, sides: ['back', 'left'] },
      { slot: 'back-mid', a0: -HA + L + 1, a1: -Y - 2, b0: -HB + L + 1 + backW + 2, b1: -HB + L + 1 + 2 * backW + 2, sides: ['back'] },
      { slot: 'back-right', a0: -HA + L + 1, a1: -Y - 2, b0: HB - L - 1 - backW, b1: HB - L - 1, sides: ['back', 'right'] },
    ],
    corners: fourCorners(HA, HB),
    loops: [
      { name: 'perimeter', pts: [p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane), p(HA - lane, -HB + lane)] },
      { name: 'yard', pts: [p(Y - 1, Y - 1), p(-Y + 1, Y - 1), p(-Y + 1, -Y + 1), p(Y - 1, -Y + 1)] },
      { name: 'back', pts: [p(-Y - 1, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane), p(-Y - 1, -HB + lane)] },
      // Each loop runs the lanes it shares with the perimeter the same way round, so patrols never meet head on.
      { name: 'left', pts: [p(-HA + lane, -Y - 1), p(-HA + lane, -HB + lane), p(HA - lane, -HB + lane), p(HA - lane, -Y - 1)] },
      { name: 'right', pts: [p(HA - lane, Y + 1), p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, Y + 1)] },
    ],
    lights: [p(Y, Y), p(Y, -Y), p(-Y, Y), p(-Y, -Y), p(HA - L - 2, gateB + C.road / 2 + 1.5)],
    clear: [
      { a0: Y, a1: HA, b0: roadB0, b1: roadB1 },
      { a0: -Y + 3, a1: Y - 3, b0: -Y + 3, b1: Y - 3 },
    ],
    pins: {},
    motor: ['front-left', 'front-right'],
    barracks: ['mid-left', 'mid-right', 'back-mid', 'back-left', 'back-right'],
    gates: [],
    road: null,
    inward: (a, b) => ({ x: -a, z: -b }),
  };
}

function fourCorners(HA: number, HB: number): Corner[] {
  return [
    { name: 'front-left', a: HA - 3, b: -HB + 3, sides: ['front', 'left'] },
    { name: 'front-right', a: HA - 3, b: HB - 3, sides: ['front', 'right'] },
    { name: 'back-left', a: -HA + 3, b: -HB + 3, sides: ['back', 'left'] },
    { name: 'back-right', a: -HA + 3, b: HB - 3, sides: ['back', 'right'] },
  ];
}

/** The yard's ring, with the keep standing in the middle of it. A slot fits the keep exactly, so it stays centred. */
function baileyPlot(x: PlotInput): Plot {
  const plot = yardPlot(x);
  const [len, depth] = x.type.modules.hq;
  plot.slots.push({ slot: 'keep', a0: -(len! / 2 + 1), a1: len! / 2 + 1, b0: -(depth! / 2 + 1), b1: depth! / 2 + 1, sides: [] });
  plot.pins = { hq: 'keep' };
  return plot;
}

/** The road runs through a long plot, gate to gate, with four parcels down each bank, their doors on it. */
function spinePlot(x: PlotInput): Plot {
  const { C, HA, HB, L, gateB, roadB0, roadB1, type } = x;
  const lane = C.lane / 2;
  const p = (a: number, b: number): Point2 => ({ x: a, z: b });
  const rows = 4;
  const gap = 2;
  const a0 = -HA + L + 1;
  const a1 = HA - L - 1;
  const rowLen = (a1 - a0 - (rows - 1) * gap) / rows;
  const slots: Slot[] = [];
  const barracks: SlotName[] = [];
  for (let r = 0; r < rows; r++) {
    const ra0 = a0 + r * (rowLen + gap);
    const ra1 = ra0 + rowLen;
    const end: Side[] = r === 0 ? ['back'] : r === rows - 1 ? ['front'] : [];
    slots.push({ slot: `left-${r}`, a0: ra0, a1: ra1, b0: -HB + L + 1, b1: roadB0 - 2, sides: ['left', ...end] });
    slots.push({ slot: `right-${r}`, a0: ra0, a1: ra1, b0: roadB1 + 2, b1: HB - L - 1, sides: ['right', ...end] });
  }
  // Mid-rows for the men first, by the road and away from both gates.
  for (const r of [1, 2, 0, 3]) barracks.push(`left-${r}`, `right-${r}`);
  const lights: Point2[] = [];
  let side = 1;
  for (let a = -HA + L + 3; a <= HA - L - 3; a += 22) {
    lights.push(p(a, side > 0 ? roadB1 + 1.5 : roadB0 - 1.5));
    side = -side;
  }
  return {
    slots,
    corners: fourCorners(HA, HB),
    loops: [
      { name: 'perimeter', pts: [p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane), p(HA - lane, -HB + lane)] },
      // Down one side of the road and back up the other: the road is its yard.
      { name: 'yard', pts: [p(HA - L - 2, roadB1 + 1.5), p(-HA + L + 2, roadB1 + 1.5), p(-HA + L + 2, roadB0 - 1.5), p(HA - L - 2, roadB0 - 1.5)] },
      { name: 'back', pts: [p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane)] },
      { name: 'left', pts: [p(HA - lane, -HB + lane), p(-HA + lane, -HB + lane), p(-HA + L + 2, roadB0 - 1.5), p(HA - L - 2, roadB0 - 1.5)] },
      { name: 'right', pts: [p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + L + 2, roadB1 + 1.5), p(HA - L - 2, roadB1 + 1.5)] },
    ],
    lights,
    clear: [{ a0: -HA, a1: HA, b0: roadB0, b1: roadB1 }],
    pins: {},
    motor: [`left-${rows - 1}`, `right-${rows - 1}`],
    barracks,
    gates: [{ side: 'back', a: -HA, b: gateB, width: type.gateWidth }],
    road: { a0: -HA, a1: HA, b0: roadB0, b1: roadB1 },
    // Every shed's door opens on to the road.
    inward: (_a, b) => ({ x: 0, z: gateB - b }),
  };
}

/** A court of three big buildings round a small farmyard off the plot's middle, the rest scattered beyond. */
function steadingPlot(x: PlotInput): Plot {
  const { C, HA, HB, Y, L, gateB, roadB0, roadB1, rng } = x;
  // Its men keep well in from the boundary: a patrol right along the field walls would pass every gap in them.
  const lane = C.fieldInset;
  const p = (a: number, b: number): Point2 => ({ x: a, z: b });
  // The farmyard: nearer the road than not, and to one side.
  const fa = rng.range(-6, 8);
  const fb = rng.range(-8, 8);
  return {
    slots: [
      { slot: 'house', a0: fa - Y - 14, a1: fa - Y - 2, b0: fb - 11, b1: fb + 11, sides: ['back'] },
      { slot: 'barn', a0: fa - 11, a1: fa + 11, b0: fb - Y - 14, b1: fb - Y - 2, sides: ['left'] },
      { slot: 'byre', a0: fa - 11, a1: fa + 11, b0: fb + Y + 2, b1: fb + Y + 14, sides: ['right'] },
      { slot: 'out-fl', a0: fa + 13, a1: HA - 6, b0: -HB + 6, b1: fb - 15, sides: ['front', 'left'] },
      { slot: 'out-fr', a0: fa + 13, a1: HA - 6, b0: fb + 15, b1: HB - 6, sides: ['front', 'right'] },
      { slot: 'out-bl', a0: -HA + 6, a1: fa - Y - 4, b0: -HB + 6, b1: fb - 15, sides: ['back', 'left'] },
      { slot: 'out-br', a0: -HA + 6, a1: fa - Y - 4, b0: fb + 15, b1: HB - 6, sides: ['back', 'right'] },
    ],
    corners: [{ name: 'silo', a: fa + Y + 5, b: fb - Y - 7, sides: [] }],
    loops: [
      { name: 'perimeter', pts: [p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane), p(HA - lane, -HB + lane)] },
      { name: 'yard', pts: [p(fa + Y + 3, fb + Y + 16), p(fa - Y - 16, fb + Y + 16), p(fa - Y - 16, fb - Y - 16), p(fa + Y + 3, fb - Y - 16)] },
      { name: 'back', pts: [p(-Y - 1, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, -HB + lane), p(-Y - 1, -HB + lane)] },
      { name: 'left', pts: [p(-HA + lane, -Y - 1), p(-HA + lane, -HB + lane), p(HA - lane, -HB + lane), p(HA - lane, -Y - 1)] },
      { name: 'right', pts: [p(HA - lane, Y + 1), p(HA - lane, HB - lane), p(-HA + lane, HB - lane), p(-HA + lane, Y + 1)] },
    ],
    lights: [p(fa + Y, fb + Y), p(fa + Y, fb - Y), p(fa - Y + 1, fb + Y), p(fa - Y + 1, fb - Y), p(HA - L - 2, gateB + C.road / 2 + 1.5)],
    clear: [
      { a0: fa + Y, a1: HA, b0: roadB0, b1: roadB1 },
      { a0: fa - Y + 2, a1: fa + Y - 2, b0: fb - Y + 2, b1: fb + Y - 2 },
    ],
    pins: { hq: 'house', storage: 'barn', barracks: 'byre' },
    motor: ['out-fl', 'out-fr'],
    barracks: ['byre'],
    gates: [],
    road: { a0: fa + Y, a1: HA, b0: roadB0, b1: roadB1 },
    inward: (a, b) => ({ x: fa - a, z: fb - b }),
  };
}
