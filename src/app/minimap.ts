import { palette } from '../render/palette';
import type { Point2 } from '../sim/generation';
import type { Collider } from '../sim/kernel/world/colliders';
import type { Heightfield } from '../sim/kernel/world/heightfield';
import type { World } from '../sim/kernel/world/world';

/**
 * The mini-map: the picture a satellite took before the mission, and the player's own dot
 * on it. The shape of the ground, the fence and the roofs, the road, the creek, the woods.
 *
 * Its rule is what a photograph can't know. It is made from the world as generated and
 * from nothing else: no simulation, no state, no guard, no target, no vehicle, nothing that
 * moves. It also can't see under a roof: a building is its outline, so no doors, no rooms,
 * and nothing that tells one building from another. tests/hud.test.ts holds it to this.
 *
 * The picture is drawn once for each world and size, on a canvas of its own, and then left
 * alone; each frame moves one small marker over it, with a transform.
 */

/** A world line: x0, z0, x1, z1. */
export type Segment = readonly [number, number, number, number];

/** Four corners, in order round the shape: x, z pairs. */
export type Quad = readonly [number, number, number, number, number, number, number, number];

/** What the picture shows, and how it sits on the ground. */
export interface Satellite {
  /** The square of ground it covers: the play area, north at the top. */
  x0: number;
  z0: number;
  side: number;
  terrain: Heightfield;
  /** Chain link, and solid walls: the camp's perimeter. Its gates are its gaps. */
  fence: Segment[];
  walls: Segment[];
  /** Everything with a roof on it, outline only. */
  roofs: Quad[];
  road: readonly Point2[] | null;
  creek: readonly Point2[] | null;
  /** The trees' crowns. */
  trees: ReadonlyArray<{ x: number; z: number; canopyR: number }>;
}

/** Inside a roof a wall is out of the satellite's sight; outside, one this low is lost at this scale. */
const MIN_WALL_HEIGHT = 1.5;

/** The roof a structure shows from above: the rectangle round all its parts, squared to the biggest of them. */
export function roofOf(parts: readonly Collider[]): Quad | null {
  let axis: Extract<Collider, { kind: 'box' }> | null = null;
  for (const c of parts) if (c.kind === 'box' && (!axis || c.hx * c.hz > axis.hx * axis.hz)) axis = c;
  if (!axis) return null;
  const { ux, uz } = axis;
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const c of parts) {
    const a = c.x * ux + c.z * uz;
    const b = -c.x * uz + c.z * ux;
    let ea = 0;
    let eb = 0;
    if (c.kind === 'cyl') ea = eb = c.r;
    else {
      const cos = Math.abs(c.ux * ux + c.uz * uz);
      const sin = Math.abs(c.uz * ux - c.ux * uz);
      ea = cos * c.hx + sin * c.hz;
      eb = sin * c.hx + cos * c.hz;
    }
    a0 = Math.min(a0, a - ea);
    a1 = Math.max(a1, a + ea);
    b0 = Math.min(b0, b - eb);
    b1 = Math.max(b1, b + eb);
  }
  const at = (a: number, b: number): [number, number] => [a * ux - b * uz, a * uz + b * ux];
  return [...at(a0, b0), ...at(a1, b0), ...at(a1, b1), ...at(a0, b1)];
}

/** Whether a point is inside a convex shape given round in order. */
export function insideQuad(q: Quad, x: number, z: number): boolean {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const ax = q[k * 2]!;
    const az = q[k * 2 + 1]!;
    const bx = q[(k * 2 + 2) % 8]!;
    const bz = q[(k * 2 + 3) % 8]!;
    const side = Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax));
    if (side === 0) continue;
    if (sign !== 0 && side !== sign) return false;
    sign = side;
  }
  return true;
}

/** A thin, long box as the line along it; anything squarer has no line to give. */
function lineOf(c: Collider): Segment | null {
  if (c.kind !== 'box') return null;
  const [len, wide, dx, dz] = c.hx >= c.hz ? [c.hx, c.hz, c.ux, c.uz] : [c.hz, c.hx, -c.uz, c.ux];
  if (len < 1.5 * wide) return null;
  return [c.x - dx * len, c.z - dz * len, c.x + dx * len, c.z + dz * len];
}

/** A generated line that's on this map at all: a built world's stand-in lies off its edge (generation/handmade.ts). */
function onMap(points: readonly Point2[], x0: number, z0: number, side: number): readonly Point2[] | null {
  return points.some((p) => p.x >= x0 && p.x <= x0 + side && p.z >= z0 && p.z <= z0 + side) ? points : null;
}

/** What a satellite would have shown of this world; null when there's nothing to show (a bare test lot). */
export function satelliteOf(world: World): Satellite | null {
  const side = 2 * world.playHalf;
  const x0 = -world.playHalf;
  const z0 = -world.playHalf;
  const parts = (ids: readonly number[]): Collider[] => ids.map((id) => world.colliders.list[id]!);
  const fence: Segment[] = [];
  const walls: Segment[] = [];
  const roofs: Quad[] = [];
  for (const st of world.camp.structures) {
    if (st.kind === 'building' || st.kind === 'shed') {
      const roof = roofOf(parts(st.colliders));
      if (roof) roofs.push(roof);
    } else if (st.kind === 'fence') {
      for (const c of parts(st.colliders)) {
        const line = lineOf(c);
        if (line) fence.push(line);
      }
    }
  }
  // Walls after every roof is known: a generated camp's perimeter walls and the screens inside its buildings are both 'block's.
  for (const st of world.camp.structures) {
    if (st.kind !== 'block') continue;
    for (const c of parts(st.colliders)) {
      if (c.y1 - c.y0 < MIN_WALL_HEIGHT || roofs.some((q) => insideQuad(q, c.x, c.z))) continue;
      const line = lineOf(c);
      if (line) walls.push(line);
    }
  }
  const road = onMap(world.features.road.points, x0, z0, side);
  const creek = onMap(world.features.creek.points, x0, z0, side);
  const trees = world.props.trees;
  if (fence.length === 0 && roofs.length === 0 && !road && !creek && trees.length === 0) return null;
  return { x0, z0, side, terrain: world.terrain, fence, walls, roofs, road, creek, trees };
}

/** Where a world point falls on a picture `size` across, north up, east to the right. */
export function mapPoint(s: Pick<Satellite, 'x0' | 'z0' | 'side'>, size: number, x: number, z: number): { x: number; y: number } {
  return { x: ((x - s.x0) / s.side) * size, y: ((z - s.z0) / s.side) * size };
}

/** How the map shows: small in the corner, enlarged, or put away. */
export type MapMode = 'small' | 'large' | 'hidden';

/** The key's cycle. */
export function nextMapMode(mode: MapMode): MapMode {
  return mode === 'small' ? 'large' : mode === 'large' ? 'hidden' : 'small';
}

/** The picture's width and height on screen, CSS pixels: what each is painted at, and the most it's shown at. */
export const MAP_SMALL = 184;
export const MAP_LARGE = 520;

/** The map's size on screen in a window this big: small stays small, and enlarged is most of the height and never most of the width. */
export function mapSide(mode: MapMode, width: number, height: number): number {
  return Math.floor(mode === 'large' ? Math.min(MAP_LARGE, 0.62 * height, 0.56 * width) : Math.min(MAP_SMALL, 0.36 * height, 0.4 * width));
}

/** What the key does next, for the word beside it. */
export const MAP_KEY_WORDS: Readonly<Record<MapMode, string>> = { small: 'enlarge', large: 'hide', hidden: 'map' };

/** The longest round distance that fits about a fifth of the picture: the length of its scale bar. */
export function scaleBarMetres(side: number): number {
  return [500, 200, 100, 50, 20, 10].find((m) => m <= 0.22 * side) ?? 10;
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** The ground's colours by surface, as the world is drawn. */
const SURFACE_RGB = [palette.surface.grass, palette.surface.dirt, palette.surface.gravel, palette.surface.rock, palette.surface.water, palette.surface.metal, palette.surface.wood].map(rgb);

/** How much steeper the shading makes the land than it is: the valley's slopes are gentle, and a picture this small has to say so. */
const RELIEF_EXAGGERATION = 2.2;
/** How far the shading may take the ground's own colour, either way: a spine's flank is dark, not black. */
const RELIEF_RANGE = 0.3;
/** Late-morning light from the north-west, the way maps are shaded. */
const SUN = { x: -0.52, y: 0.68, z: -0.52 };

/** The ground, shaded: its own colours lit from one side, one pixel for each vertex of the height grid in the square. */
function relief(s: Satellite): HTMLCanvasElement {
  const hf = s.terrain;
  const n = Math.max(2, Math.min(hf.n - 2, Math.round(s.side / hf.cell)));
  const image = new ImageData(n, n);
  const clampIndex = (i: number): number => Math.max(1, Math.min(hf.n - 2, Math.round(i)));
  for (let j = 0; j < n; j++) {
    const vj = clampIndex((s.z0 + ((j + 0.5) / n) * s.side - hf.min) / hf.cell);
    for (let i = 0; i < n; i++) {
      const vi = clampIndex((s.x0 + ((i + 0.5) / n) * s.side - hf.min) / hf.cell);
      const k = vj * hf.n + vi;
      const gx = ((hf.heights[k + 1]! - hf.heights[k - 1]!) / (2 * hf.cell)) * RELIEF_EXAGGERATION;
      const gz = ((hf.heights[k + hf.n]! - hf.heights[k - hf.n]!) / (2 * hf.cell)) * RELIEF_EXAGGERATION;
      const lit = (-gx * SUN.x + SUN.y - gz * SUN.z) / Math.sqrt(gx * gx + gz * gz + 1) - SUN.y;
      // Eases into its limit, so gentle ground keeps its shading and a spine doesn't blow out.
      const shade = 1 + (RELIEF_RANGE * lit) / (RELIEF_RANGE + Math.abs(lit));
      const [r, g, b] = SURFACE_RGB[hf.surfaces[k]!] ?? SURFACE_RGB[0]!;
      const o = (j * n + i) * 4;
      image.data[o] = r * shade;
      image.data[o + 1] = g * shade;
      image.data[o + 2] = b * shade;
      image.data[o + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d')!.putImageData(image, 0, 0);
  return c;
}

/** A patch of the woods' tone this many metres across: fine enough for a clearing, coarse enough to be a tone and not a scatter. */
const WOODS_CELL = 14;
/** How much of the ground under crowns reads as thin woods, and as full woods. */
const WOODS_THIN = 0.04;
const WOODS_FULL = 0.34;

/** The woods as a tone on the ground: how much of each patch is under crowns, a little smoothed. */
function woods(s: Satellite): HTMLCanvasElement {
  const n = Math.max(2, Math.round(s.side / WOODS_CELL));
  const cover = new Float32Array(n * n);
  const cell = s.side / n;
  for (const t of s.trees) {
    const i = Math.floor((t.x - s.x0) / cell);
    const j = Math.floor((t.z - s.z0) / cell);
    if (i >= 0 && i < n && j >= 0 && j < n) cover[j * n + i] += (Math.PI * t.canopyR * t.canopyR) / (cell * cell);
  }
  const blurred = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let weight = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (i + di < 0 || i + di >= n || j + dj < 0 || j + dj >= n) continue;
          const w = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
          sum += cover[(j + dj) * n + i + di]! * w;
          weight += w;
        }
      }
      blurred[j * n + i] = sum / weight;
    }
  }
  const image = new ImageData(n, n);
  const [r, g, b] = rgb('#76877a');
  for (let k = 0; k < n * n; k++) {
    const a = Math.max(0, Math.min(1, (blurred[k]! - WOODS_THIN) / (WOODS_FULL - WOODS_THIN)));
    image.data[k * 4] = r;
    image.data[k * 4 + 1] = g;
    image.data[k * 4 + 2] = b;
    image.data[k * 4 + 3] = 185 * a;
  }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.getContext('2d')!.putImageData(image, 0, 0);
  return c;
}

/** Contour lines every `every` metres, by marching squares over the height grid, into the current path. */
function contourPath(ctx: CanvasRenderingContext2D, s: Satellite, size: number, every: number): void {
  const hf = s.terrain;
  const step = Math.max(1, Math.round(s.side / hf.cell / 240));
  const px = (v: number): number => ((v - s.x0) / s.side) * size;
  const py = (v: number): number => ((v - s.z0) / s.side) * size;
  const vertex = (v: number): number => (v - hf.min) / hf.cell;
  const [i0, i1] = [Math.max(0, Math.floor(vertex(s.x0))), Math.min(hf.n - 1 - step, Math.ceil(vertex(s.x0 + s.side)))];
  const [j0, j1] = [Math.max(0, Math.floor(vertex(s.z0))), Math.min(hf.n - 1 - step, Math.ceil(vertex(s.z0 + s.side)))];
  for (let j = j0; j <= j1; j += step) {
    for (let i = i0; i <= i1; i += step) {
      const a = hf.heights[j * hf.n + i]!;
      const b = hf.heights[j * hf.n + i + step]!;
      const c = hf.heights[(j + step) * hf.n + i + step]!;
      const d = hf.heights[(j + step) * hf.n + i]!;
      const lo = Math.min(a, b, c, d);
      const hi = Math.max(a, b, c, d);
      for (let level = Math.ceil(lo / every) * every; level <= hi; level += every) {
        const x0 = px(hf.coord(i));
        const x1 = px(hf.coord(i + step));
        const y0 = py(hf.coord(j));
        const y1 = py(hf.coord(j + step));
        // Where the level crosses each edge of the cell; a cell a level passes through has two (or, at a saddle, four).
        const cross: number[] = [];
        const edge = (h0: number, h1: number, xa: number, ya: number, xb: number, yb: number): void => {
          if (h0 < level === h1 < level) return;
          const t = (level - h0) / (h1 - h0);
          cross.push(xa + (xb - xa) * t, ya + (yb - ya) * t);
        };
        edge(a, b, x0, y0, x1, y0);
        edge(b, c, x1, y0, x1, y1);
        edge(c, d, x1, y1, x0, y1);
        edge(d, a, x0, y1, x0, y0);
        for (let k = 0; k + 3 < cross.length; k += 4) {
          ctx.moveTo(cross[k]!, cross[k + 1]!);
          ctx.lineTo(cross[k + 2]!, cross[k + 3]!);
        }
      }
    }
  }
}

function line(ctx: CanvasRenderingContext2D, s: Satellite, size: number, points: readonly Point2[]): void {
  ctx.beginPath();
  points.forEach((p, k) => {
    const at = mapPoint(s, size, p.x, p.z);
    if (k === 0) ctx.moveTo(at.x, at.y);
    else ctx.lineTo(at.x, at.y);
  });
  ctx.stroke();
}

function segments(ctx: CanvasRenderingContext2D, s: Satellite, size: number, list: readonly Segment[]): void {
  ctx.beginPath();
  for (const [x0, z0, x1, z1] of list) {
    const a = mapPoint(s, size, x0, z0);
    const b = mapPoint(s, size, x1, z1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

const FONT = '600 9px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/** The picture of `s`, `size` CSS pixels across at this pixel ratio, on a canvas of its own. */
function paint(s: Satellite, size: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(relief(s), 0, 0, size, size);
  const fine = size >= 300;

  // The shape of the land: contours every 10 m, or with room for them the world's own, every 5 m and 25 m.
  ctx.strokeStyle = palette.line;
  if (fine) {
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    contourPath(ctx, s, size, 5);
    ctx.stroke();
  }
  ctx.globalAlpha = fine ? 0.34 : 0.26;
  ctx.lineWidth = fine ? 0.9 : 0.7;
  ctx.beginPath();
  contourPath(ctx, s, size, fine ? 25 : 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // The woods: a tone, so a forest reads as a forest and a clearing as a clearing. Enlarged, the crowns themselves as well.
  if (s.trees.length > 0) {
    ctx.drawImage(woods(s), 0, 0, size, size);
    if (fine) {
      ctx.fillStyle = '#5f6f62';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (const t of s.trees) {
        const at = mapPoint(s, size, t.x, t.z);
        const r = Math.max(0.8, (t.canopyR / s.side) * size);
        ctx.moveTo(at.x + r, at.y);
        ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.creek) {
    ctx.strokeStyle = '#7898b0';
    ctx.lineWidth = fine ? 1.4 : 1.1;
    line(ctx, s, size, s.creek);
  }
  if (s.road) {
    ctx.strokeStyle = '#85745a';
    ctx.lineWidth = fine ? 1.4 : 1.05;
    line(ctx, s, size, s.road);
  }

  // The camp, sharp: this is what the picture was taken for.
  ctx.lineCap = 'butt';
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = fine ? 1 : 0.9;
  segments(ctx, s, size, s.fence);
  ctx.lineWidth = fine ? 2.2 : 1.8;
  segments(ctx, s, size, s.walls);
  ctx.fillStyle = palette.structure;
  ctx.lineWidth = fine ? 1 : 0.8;
  for (const q of s.roofs) {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const at = mapPoint(s, size, q[k * 2]!, q[k * 2 + 1]!);
      if (k === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // What every photograph of ground carries: which way is north, and how far a round distance is.
  ctx.font = FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.edge;
  ctx.strokeStyle = 'rgba(244, 245, 246, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.strokeText('N', 5, 12);
  ctx.fillText('N', 5, 12);
  const metres = scaleBarMetres(s.side);
  const bar = (metres / s.side) * size;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, size - 6);
  ctx.lineTo(6 + bar, size - 6);
  ctx.stroke();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, size - 6);
  ctx.lineTo(6 + bar, size - 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244, 245, 246, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.strokeText(`${metres} m`, 6, size - 10);
  ctx.fillText(`${metres} m`, 6, size - 10);
  return canvas;
}

/** The marker's anchor inside its element: the arrow's centre. */
const MARKER_HALF = 9;

export class Minimap {
  private readonly el: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly keyWord: HTMLElement;
  private satellite: Satellite | null = null;
  private layers: { small: HTMLCanvasElement | null; large: HTMLCanvasElement | null } = { small: null, large: null };
  private dpr = 1;
  private side = MAP_SMALL;
  private shownLayer: 'small' | 'large' | null = null;
  private markerKey = '';
  private visible = false;
  private down = false;
  mode: MapMode = 'small';
  /** Someone wants to know when the map's size changes (the corner's layout: hud.ts). */
  onResize: (() => void) | null = null;

  constructor(parent: HTMLElement, keysHtml: string) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="minimap-picture"></div><svg class="minimap-you" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.2 14 15 9 12.1 4 15Z" /></svg><div class="minimap-key">${keysHtml}<span></span></div>`;
    this.picture = this.el.querySelector('.minimap-picture')!;
    this.marker = this.el.querySelector('.minimap-you')!;
    this.keyWord = this.el.querySelector('.minimap-key span')!;
    parent.appendChild(this.el);
    this.showMode();
  }

  private showMode(): void {
    this.el.dataset.mode = this.mode;
    this.keyWord.textContent = MAP_KEY_WORDS[this.mode];
  }

  /** A new world: its picture is drawn when it's first wanted. */
  setWorld(world: World): void {
    this.satellite = satelliteOf(world);
    this.layers = { small: null, large: null };
    this.shownLayer = null;
    this.markerKey = '';
  }

  /** Whether this world has anything to show. */
  get applies(): boolean {
    return this.satellite !== null;
  }

  /** Small, enlarged, put away, and round again. */
  cycle(): MapMode {
    this.mode = nextMapMode(this.mode);
    this.showMode();
    this.shownLayer = null;
    this.markerKey = '';
    this.resize(window.innerWidth, window.innerHeight);
    this.onResize?.();
    return this.mode;
  }

  /** The window changed: the enlarged map fits it, and a new screen's pixels want a new picture. */
  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.layers = { small: null, large: null };
      this.shownLayer = null;
    }
    this.side = mapSide(this.mode, width, height);
    this.el.style.setProperty('--map-side', `${this.side}px`);
    this.markerKey = '';
  }

  /**
   * Shows the map with the player on it this frame, or puts it away: `you` null when the
   * eyes on screen aren't the player's, `down` while an optic is up (the glass is what you're
   * looking at, and in a small window the corner is inside it).
   */
  update(you: { x: number; z: number; yaw: number } | null, down: boolean): void {
    const s = you ? this.satellite : null;
    const visible = s !== null;
    if (visible !== this.visible) {
      this.visible = visible;
      this.el.hidden = !visible;
      this.onResize?.();
    }
    if (!s || !you) return;
    if (down !== this.down) {
      this.down = down;
      this.el.classList.toggle('is-down', down);
    }
    if (this.mode === 'hidden') return;
    this.showPicture(s);
    const at = mapPoint(s, this.side, you.x, you.z);
    // A quarter of a pixel and a degree: nothing is written for a change nobody could see.
    const x = Math.round(Math.max(0, Math.min(this.side, at.x)) * 4) / 4 - MARKER_HALF;
    const y = Math.round(Math.max(0, Math.min(this.side, at.y)) * 4) / 4 - MARKER_HALF;
    const deg = Math.round((-you.yaw * 180) / Math.PI);
    const key = `${x}|${y}|${deg}`;
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker.style.transform = `translate(${x}px, ${y}px) rotate(${deg}deg)`;
  }

  /** Puts the picture for the current size on screen, painting it first if this world doesn't have one yet. */
  private showPicture(s: Satellite): void {
    const which = this.mode === 'large' ? 'large' : 'small';
    if (this.shownLayer === which) return;
    const layer = (this.layers[which] ??= paint(s, which === 'large' ? MAP_LARGE : MAP_SMALL, this.dpr));
    this.picture.replaceChildren(layer);
    this.shownLayer = which;
  }
}
