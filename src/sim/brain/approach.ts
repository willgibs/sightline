import type { Tuning } from '../../config/tuning';
import { dtanDeg } from '../kernel/core/detmath';
import { Cell, Edge, type GridLayer } from '../kernel/world/grid';
import { GridSearch, components, type MoveCost } from '../kernel/world/search';
import type { Ground } from './mind';

/**
 * The valley at the scale a section moves on (Lab F, step 2b; docs/camp-engine.md,
 * section 9): which ground a believed firing point can see, and the way to it that keeps
 * out of that view.
 *
 * A camp fights from where it is (firefight.ts), and its ways under cover are judged on the
 * fine layer, which ends at the wire. Past it there are no walls to keep behind: what hides
 * a man from a ridge is the ground itself, and trees. A section that goes out after a
 * shooter has to read that at a larger scale, the way a trained man reads a map before he
 * leaves: this fold is dead ground from up there, that field isn't.
 *
 * Two rasters, made once for the world from what a mind may know of it (rule 13: the
 * terrain, the grid, the tree crowns):
 *
 * - **places**, a lattice ten metres apart, each with somewhere a man can stand and the
 *   ways on foot to its neighbours. It is a layer of the grid's own kind, so the one search
 *   (kernel/world/search.ts) finds the way over it, with its tie-breaks and its budget;
 * - **relief**, at the map's own spacing: the ground's height, anything solid standing on
 *   it, and which tree crowns reach over it.
 *
 * Whether a place is in a firing point's view is read off the relief along the straight
 * line between them: no rays, a hundred or so array reads. That's rough, and meant to be.
 * It prices a way and says where a bound has to be a dash. A man's own eyes, with real
 * rays, settle where he stops (hunt.ts). `npm run experiment -- approach` holds it against
 * real lines of sight.
 *
 * The camp's range card lists the firing points that overlook it, and what each of those
 * sees is the same all mission: it is read once, the first time it's asked for (or all at
 * once, ahead of the first tick: `prepare`), and kept. Somewhere off the list is read place
 * by place as a search asks. Either way the answer depends only on the world, never on what
 * has been asked before, so nothing here is state (rule 9).
 */

/** Somewhere a shooter may be: his eyes. */
export interface Eyes {
  x: number;
  y: number;
  z: number;
}

/** A covered way: the stops of its bounds, and what each bound crosses. */
export interface Way {
  /** x, z of each stop, flattened. The first is where it starts. */
  stops: number[];
  /** For each stop: 1 if the bound that ends on it crosses ground in view, 0 if it keeps out of it. The first stop's is 0. */
  lit: number[];
  /** Metres of it in all, and metres of it in view. */
  length: number;
  exposed: number;
}

export function emptyWay(): Way {
  return { stops: [], lit: [], length: 0, exposed: 0 };
}

/** Tree crowns a cell of the relief keeps. */
const SLOTS = 3;

export class Approach {
  /** The lattice of places: a layer of the grid's own kind. */
  readonly layer: GridLayer;
  /** Where a man stands in each place (the walkable spot nearest its middle), and the ground's height there. */
  readonly px: Float64Array;
  readonly pz: Float64Array;
  readonly floor: Float64Array;
  /** The relief: its corner, its cell and its size. */
  private readonly rx0: number;
  private readonly rz0: number;
  private readonly rcell: number;
  private readonly rnx: number;
  private readonly rnz: number;
  /** For each cell of the relief: the height a line has to clear (the ground, and anything solid on it), */
  private readonly crest: Float32Array;
  /** and up to three of the tree crowns that reach over it, as indices into the world's, −1 for none. */
  private readonly crowns: Int32Array;
  private readonly search: GridSearch;
  /** Whether the way from each place to the next one east, and north, is a hard climb: joined only by ground steeper than a man runs up easily. */
  private readonly hardEast: Uint8Array;
  private readonly hardNorth: Uint8Array;
  /** Whether each place is part of the valley's open ground: the largest piece of the lattice. A room is a piece of its own, and no way starts or ends in one. */
  private readonly open: Uint8Array;
  /** What each listed firing point sees, place by place: null until it's asked for. */
  private readonly views: Array<Uint8Array | null>;
  /** The view being judged: the listed firing points looking, anyone else looking, and what has been worked out about them for each place so far. */
  private listed: Uint8Array[] = [];
  private eyes: Eyes[] = [];
  private readonly stamp: Uint32Array;
  private readonly value: Uint8Array;
  private now = 0;
  private readonly path: number[] = [];
  private head = 1.7;
  private eye = 1.3;
  private reach = 700;
  private stop = 0.8;
  private price = 6;
  private priceOn = 6;
  private priceHard = 3;
  private cells = 6000;
  private bound = { covered: 40, lit: 25, off: 7 };

  constructor(
    private readonly world: Ground,
    tuning: Tuning,
  ) {
    const G = tuning.brain.hunt.ground;
    const M = world.grid.map;
    const k = Math.max(1, Math.round(G.every / M.cell));
    const nx = Math.floor(M.nx / k);
    const nz = Math.floor(M.nz / k);
    const n = nx * nz;
    this.layer = { x0: M.x0, z0: M.z0, cell: M.cell * k, nx, nz, flags: new Uint8Array(n), cover: new Uint8Array(n), edges: new Uint8Array(n) };
    this.px = new Float64Array(n);
    this.pz = new Float64Array(n);
    this.floor = new Float64Array(n);
    this.hardEast = new Uint8Array(n);
    this.hardNorth = new Uint8Array(n);
    this.stamp = new Uint32Array(n);
    this.value = new Uint8Array(n);
    // A place: the walkable cell of the map nearest its middle, so a way's stops are somewhere a man can stand. One with
    // room round it, where there is one: a man who runs to a cell on the lip of a steep face goes over it.
    const roomy = (mc: number): boolean => {
      const i = mc % M.nx;
      const j = (mc - i) / M.nx;
      if (i === 0 || j === 0 || i === M.nx - 1 || j === M.nz - 1) return false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((M.flags[mc + dj * M.nx + di]! & Cell.Walkable) === 0) return false;
      return true;
    };
    const anchor = new Int32Array(n).fill(-1);
    for (let J = 0; J < nz; J++) {
      for (let I = 0; I < nx; I++) {
        const c = J * nx + I;
        let best = -1;
        let bestD = Infinity;
        let bestRoomy = false;
        for (let b = 0; b < k; b++) {
          for (let a = 0; a < k; a++) {
            const mc = (J * k + b) * M.nx + I * k + a;
            if ((M.flags[mc]! & Cell.Walkable) === 0) continue;
            const room = roomy(mc);
            if (bestRoomy && !room) continue;
            // Twice the distance from the place's middle, squared, in map cells: whole numbers, so the first of the nearest is the same everywhere.
            const d = (2 * a + 1 - k) * (2 * a + 1 - k) + (2 * b + 1 - k) * (2 * b + 1 - k);
            if (d < bestD || (room && !bestRoomy)) {
              bestD = d;
              best = mc;
              bestRoomy = room;
            }
          }
        }
        anchor[c] = best;
        if (best >= 0) {
          this.layer.flags[c] = Cell.Walkable;
          const mi = best % M.nx;
          this.px[c] = M.x0 + (mi + 0.5) * M.cell;
          this.pz[c] = M.z0 + ((best - mi) / M.nx + 0.5) * M.cell;
        } else {
          this.px[c] = this.layer.x0 + (I + 0.5) * this.layer.cell;
          this.pz[c] = this.layer.z0 + (J + 0.5) * this.layer.cell;
        }
        this.floor[c] = world.terrain.heightAt(this.px[c]!, this.pz[c]!);
      }
    }
    // The ground's height at the middle of each cell of the map: the relief below is built on it, and so is what follows.
    const ground = new Float32Array(M.nx * M.nz);
    for (let j = 0; j < M.nz; j++) for (let i = 0; i < M.nx; i++) ground[j * M.nx + i] = world.terrain.heightAt(M.x0 + (i + 0.5) * M.cell, M.z0 + (j + 0.5) * M.cell);
    // The ways between neighbouring places: on foot over the map's own cells, without leaving the two places, and by
    // ground a man can climb. The map knows where a body fits and where the ground under a cell's middle is too steep
    // to stand on, but not how much the ground rises between two middles, and a man sent up a face he can't climb
    // stands at the foot of it.
    const easy = M.cell * dtanDeg(G.climbDeg);
    const hard = M.cell * dtanDeg(G.hardDeg);
    const seen = new Uint8Array(2 * k * k);
    const queue = new Int32Array(2 * k * k);
    const joined = (a: number, b: number, i0: number, j0: number, w: number, h: number, rise: number): boolean => {
      if (a < 0 || b < 0) return false;
      seen.fill(0);
      const at = (mc: number): number => (Math.floor(mc / M.nx) - j0) * w + ((mc % M.nx) - i0);
      let head = 0;
      let tail = 0;
      queue[tail++] = a;
      seen[at(a)] = 1;
      while (head < tail) {
        const mc = queue[head++]!;
        if (mc === b) return true;
        const i = mc % M.nx;
        const j = (mc - i) / M.nx;
        const go = (to: number, ti: number, tj: number): void => {
          if (ti < i0 || tj < j0 || ti >= i0 + w || tj >= j0 + h) return;
          const s = (tj - j0) * w + (ti - i0);
          if (seen[s] !== 0 || (M.flags[to]! & Cell.Walkable) === 0 || Math.abs(ground[to]! - ground[mc]!) > rise) return;
          seen[s] = 1;
          queue[tail++] = to;
        };
        if ((M.edges[mc]! & Edge.East) !== 0) go(mc + 1, i + 1, j);
        if ((M.edges[mc]! & Edge.North) !== 0) go(mc + M.nx, i, j + 1);
        if (i > 0 && (M.edges[mc - 1]! & Edge.East) !== 0) go(mc - 1, i - 1, j);
        if (j > 0 && (M.edges[mc - M.nx]! & Edge.North) !== 0) go(mc - M.nx, i, j - 1);
      }
      return false;
    };
    for (let J = 0; J < nz; J++) {
      for (let I = 0; I < nx; I++) {
        const c = J * nx + I;
        let e = 0;
        if (I + 1 < nx) {
          if (joined(anchor[c]!, anchor[c + 1]!, I * k, J * k, 2 * k, k, easy)) e |= Edge.East;
          else if (joined(anchor[c]!, anchor[c + 1]!, I * k, J * k, 2 * k, k, hard)) {
            e |= Edge.East;
            this.hardEast[c] = 1;
          }
        }
        if (J + 1 < nz) {
          if (joined(anchor[c]!, anchor[c + nx]!, I * k, J * k, k, 2 * k, easy)) e |= Edge.North;
          else if (joined(anchor[c]!, anchor[c + nx]!, I * k, J * k, k, 2 * k, hard)) {
            e |= Edge.North;
            this.hardNorth[c] = 1;
          }
        }
        this.layer.edges[c] = e;
      }
    }
    this.search = new GridSearch(this.layer);
    const pieces = components(this.search);
    let largest = 0;
    for (let p = 1; p < pieces.sizes.length; p++) if (pieces.sizes[p]! > pieces.sizes[largest]!) largest = p;
    this.open = new Uint8Array(n);
    // Open ground, and near enough the camp to be any business of a section's.
    const site = world.camp.site;
    for (let c = 0; c < n; c++) {
      const dx = this.px[c]! - site.x;
      const dz = this.pz[c]! - site.z;
      this.open[c] = pieces.label[c] === largest && dx * dx + dz * dz <= G.around * G.around ? 1 : 0;
    }
    this.views = (world.report.camp?.perches ?? []).map(() => null);
    // The relief, on the map's own cells: the ground's height at each one's middle, raised by anything solid and tall on it.
    this.rcell = M.cell;
    this.rx0 = M.x0;
    this.rz0 = M.z0;
    this.rnx = M.nx;
    this.rnz = M.nz;
    const rn = this.rnx * this.rnz;
    this.crest = new Float32Array(rn);
    const tall = Math.round(G.tall * 10);
    for (let J = 0; J < this.rnz; J++) {
      for (let I = 0; I < this.rnx; I++) {
        const c = J * this.rnx + I;
        const cover = M.cover[c]!;
        this.crest[c] = ground[c]! + (cover >= tall ? cover / 10 : 0);
      }
    }
    // Tree crowns: each cell keeps the first few that reach over it, in the world's order.
    this.crowns = new Int32Array(rn * SLOTS).fill(-1);
    const all = world.crowns ?? [];
    for (let v = 0; v < all.length; v++) {
      const { x, z, r } = all[v]!;
      const i0 = Math.max(0, Math.floor((x - r - this.rx0) / this.rcell));
      const i1 = Math.min(this.rnx - 1, Math.floor((x + r - this.rx0) / this.rcell));
      const j0 = Math.max(0, Math.floor((z - r - this.rz0) / this.rcell));
      const j1 = Math.min(this.rnz - 1, Math.floor((z + r - this.rz0) / this.rcell));
      for (let J = j0; J <= j1; J++) {
        for (let I = i0; I <= i1; I++) {
          // The nearest point of the cell to the crown's axis: inside its radius, the crown reaches over the cell.
          const nx0 = this.rx0 + I * this.rcell;
          const nz0 = this.rz0 + J * this.rcell;
          const qx = x < nx0 ? nx0 : x > nx0 + this.rcell ? nx0 + this.rcell : x;
          const qz = z < nz0 ? nz0 : z > nz0 + this.rcell ? nz0 + this.rcell : z;
          if ((qx - x) * (qx - x) + (qz - z) * (qz - z) > r * r) continue;
          const at = (J * this.rnx + I) * SLOTS;
          for (let k = 0; k < SLOTS; k++) {
            if (this.crowns[at + k]! >= 0) continue;
            this.crowns[at + k] = v;
            break;
          }
        }
      }
    }
    this.setTuning(tuning);
  }

  setTuning(tuning: Tuning): void {
    const G = tuning.brain.hunt.ground;
    this.head = G.head;
    this.eye = G.eye;
    this.reach = G.reach;
    this.price = 1 + G.price;
    this.priceOn = 1 + G.priceOn;
    this.priceHard = G.priceHard;
    this.cells = G.cells;
    this.bound = G.bound;
    this.stop = this.world.crownStop ?? Infinity;
  }

  /**
   * Aims the view: the places a shooter may be looking from, his eyes taken to be an eye's
   * height above the ground at each. One of the camp's listed firing points is looked up;
   * anywhere else is read as a search asks.
   */
  aim(at: ReadonlyArray<{ x: number; z: number }>): this {
    this.now++;
    this.listed.length = 0;
    this.eyes.length = 0;
    const perches = this.world.report.camp?.perches ?? [];
    for (const p of at) {
      let k = -1;
      for (let q = 0; q < perches.length && k < 0; q++) if (perches[q]!.x === p.x && perches[q]!.z === p.z) k = q;
      if (k >= 0) this.listed.push(this.viewFrom(k));
      else this.eyes.push(eyesOn(this.world, p.x, p.z, this.eye));
    }
    return this;
  }

  /** Aims the view at one already worked out, place by place (1 where a man on his feet is in view): for the bench, which holds this reading against real lines of sight. */
  aimAs(view: Uint8Array): this {
    this.now++;
    this.listed.length = 0;
    this.eyes.length = 0;
    this.listed.push(view);
    return this;
  }

  /** What the camp's k-th listed firing point sees: 1 for each place a man on his feet is in its view. */
  viewFrom(k: number): Uint8Array {
    let v = this.views[k];
    if (v) return v;
    const p = this.world.report.camp!.perches[k]!;
    const e = eyesOn(this.world, p.x, p.z, this.eye);
    v = new Uint8Array(this.open.length);
    for (let c = 0; c < v.length; c++) if (this.open[c] === 1 && this.hides(e, c) === 'nothing') v[c] = 1;
    this.views[k] = v;
    return v;
  }

  /** Reads every listed firing point's view now: for whoever would rather pay for it ahead of the first tick than in the tick a section is first sent out. */
  prepare(): void {
    for (let k = 0; k < this.views.length; k++) this.viewFrom(k);
  }

  /** The place at (x, z): its index, or −1 off the map. */
  placeAt(x: number, z: number): number {
    const L = this.layer;
    const i = Math.floor((x - L.x0) / L.cell);
    const j = Math.floor((z - L.z0) / L.cell);
    return i < 0 || j < 0 || i >= L.nx || j >= L.nz ? -1 : j * L.nx + i;
  }

  /**
   * The place on the valley's open ground nearest (x, z): its own, or the nearest of those
   * within `within` places of it (the first of the nearest, in the lattice's order). −1 if
   * there's none: somewhere indoors, say, with no open ground that near.
   */
  near(x: number, z: number, within = 2): number {
    const L = this.layer;
    const c = this.placeAt(x, z);
    if (c < 0) return -1;
    if (this.open[c] === 1) return c;
    const ci = c % L.nx;
    const cj = (c - ci) / L.nx;
    let best = -1;
    let bestD = Infinity;
    for (let dj = -within; dj <= within; dj++) {
      for (let di = -within; di <= within; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
        const p = j * L.nx + i;
        if (this.open[p] !== 1) continue;
        const d = (this.px[p]! - x) * (this.px[p]! - x) + (this.pz[p]! - z) * (this.pz[p]! - z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }

  /** Whether a man on his feet at this place would be in the view aimed at. Worked out the first time it's asked. */
  lit(place: number): boolean {
    for (const v of this.listed) if (v[place] === 1) return true;
    if (this.eyes.length === 0) return false;
    if (this.stamp[place] === this.now) return this.value[place] === 1;
    this.stamp[place] = this.now;
    let open = 0;
    for (const e of this.eyes) {
      if (this.hides(e, place) === 'nothing') {
        open = 1;
        break;
      }
    }
    this.value[place] = open;
    return open === 1;
  }

  /** The same, for the place at (x, z). Off the map nothing is in view. */
  litAt(x: number, z: number): boolean {
    const c = this.placeAt(x, z);
    return c >= 0 && this.lit(c);
  }

  /** What stands between a man's head at a place and someone's eyes, by the relief: the ground (or something solid on it), trees, the distance, or nothing. */
  hides(e: Eyes, place: number): 'nothing' | 'ground' | 'trees' | 'distance' {
    const hx = this.px[place]!;
    const hz = this.pz[place]!;
    const dx = e.x - hx;
    const dz = e.z - hz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > this.reach) return 'distance';
    const n = Math.ceil(dist / this.rcell);
    if (n <= 1) return 'nothing';
    const hy = this.floor[place]! + this.head;
    const rise = e.y - hy;
    const step = dist / n;
    const all = this.world.crowns;
    let depth = 0;
    for (let s = 1; s < n; s++) {
      const f = s / n;
      const x = hx + dx * f;
      const z = hz + dz * f;
      const i = Math.floor((x - this.rx0) / this.rcell);
      const j = Math.floor((z - this.rz0) / this.rcell);
      if (i < 0 || j < 0 || i >= this.rnx || j >= this.rnz) continue;
      const c = j * this.rnx + i;
      const y = hy + rise * f;
      if (this.crest[c]! > y) return 'ground';
      if (!all || this.crowns[c * SLOTS]! < 0) continue;
      // Inside a crown here: this step of the line is that much dimmer, as the world's own lines of sight count it.
      for (let k = 0; k < SLOTS; k++) {
        const id = this.crowns[c * SLOTS + k]!;
        if (id < 0) break;
        const v = all[id]!;
        if (y <= v.y0 || y >= v.y1) continue;
        const r = v.kind === 'cone' ? (v.r * (v.y1 - y)) / (v.y1 - v.y0) : v.r;
        if ((x - v.x) * (x - v.x) + (z - v.z) * (z - v.z) >= r * r) continue;
        depth += v.density * step;
        if (depth >= this.stop) return 'trees';
        break;
      }
    }
    return 'nothing';
  }

  /**
   * What a way's moves cost. Ground in view costs more, so the way round is taken where there
   * is one; and going on across it costs more again than stepping out onto it, so a way is
   * made of short dashes between places out of view, where the ground allows, and not one
   * long run. It keeps to the open ground round the camp.
   */
  private readonly cost: MoveCost = (from, to, length) => {
    if (this.open[to] !== 1) return -1;
    const seen = !this.lit(to) ? 1 : this.lit(from) ? this.priceOn : this.price;
    return length * (seen + (this.climb(from, to) ? this.priceHard : 0));
  };

  /** Whether the move between two neighbouring places is a hard climb: a side move by its own way, a corner move by either of the two ways round it. */
  private climb(from: number, to: number): boolean {
    const nx = this.layer.nx;
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    const d = b - a;
    if (d === 1) return this.hardEast[a] === 1;
    if (d === nx) return this.hardNorth[a] === 1;
    // North-east of `a`, or north-west of it.
    if (d === nx + 1) return this.hardEast[a] === 1 || this.hardNorth[a + 1] === 1 || this.hardNorth[a] === 1 || this.hardEast[a + nx] === 1;
    return this.hardEast[a - 1] === 1 || this.hardNorth[a - 1] === 1 || this.hardNorth[a] === 1 || this.hardEast[b] === 1;
  }

  /**
   * The way from one place to another that keeps out of the view aimed at, as bounds: each
   * stop is where a bound ends, at the edge of cover, at a turn, or when it's gone far
   * enough. False if there's no way, or none within the search's budget.
   */
  way(fromX: number, fromZ: number, toX: number, toZ: number, out: Way): boolean {
    out.stops.length = 0;
    out.lit.length = 0;
    out.length = 0;
    out.exposed = 0;
    const start = this.near(fromX, fromZ);
    const goal = this.near(toX, toZ);
    if (start < 0 || goal < 0) return false;
    const path = this.path;
    if (!this.search.path(start, goal, { maxExpansions: this.cells, cost: this.cost }, path).found) return false;
    const B = this.bound;
    out.stops.push(this.px[start]!, this.pz[start]!);
    out.lit.push(0);
    let from = 0;
    let run = 0;
    let anyLit = false;
    for (let k = 1; k < path.length; k++) {
      const c = path[k]!;
      const seg = this.between(path[k - 1]!, c);
      const here = this.lit(c);
      run += seg;
      out.length += seg;
      if (here) {
        out.exposed += seg;
        anyLit = true;
      }
      const last = k === path.length - 1;
      let end = last;
      if (!end) {
        const next = path[k + 1]!;
        // The edge of cover: about to leave it, or just reached it.
        if (!here && (this.lit(next) || this.lit(path[k - 1]!))) end = true;
        else if (run + this.between(c, next) > (anyLit || this.lit(next) ? B.lit : B.covered)) end = true;
        else if (this.bends(path, from, k + 1, B.off)) end = true;
      }
      if (!end) continue;
      out.stops.push(this.px[c]!, this.pz[c]!);
      out.lit.push(anyLit ? 1 : 0);
      from = k;
      run = 0;
      anyLit = false;
    }
    return true;
  }

  /** Metres between two places' standing spots. */
  private between(a: number, b: number): number {
    const dx = this.px[b]! - this.px[a]!;
    const dz = this.pz[b]! - this.pz[a]!;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Whether the way from path[a] to path[b] strays from the straight line between them by more than `off` metres: a bound that cut the corner would leave the way that was chosen. */
  private bends(path: readonly number[], a: number, b: number, off: number): boolean {
    const ax = this.px[path[a]!]!;
    const az = this.pz[path[a]!]!;
    const ux = this.px[path[b]!]! - ax;
    const uz = this.pz[path[b]!]! - az;
    const len = Math.sqrt(ux * ux + uz * uz);
    if (len < 1e-6) return false;
    for (let k = a + 1; k < b; k++) {
      const wx = this.px[path[k]!]! - ax;
      const wz = this.pz[path[k]!]! - az;
      if (Math.abs(wx * uz - wz * ux) / len > off) return true;
    }
    return false;
  }
}

const approaches = new WeakMap<GridLayer, { approach: Approach; every: number }>();

/** The world's approach, made once (its rasters are a few milliseconds' work), or again if the tuning asks for another spacing. */
export function approachOf(world: Ground, tuning: Tuning): Approach {
  const every = tuning.brain.hunt.ground.every;
  let a = approaches.get(world.grid.map);
  if (!a || a.every !== every) {
    a = { approach: new Approach(world, tuning), every };
    approaches.set(world.grid.map, a);
  }
  a.approach.setTuning(tuning);
  return a.approach;
}

/** Someone's eyes at a place on the ground: `up` metres above it. */
export function eyesOn(world: Ground, x: number, z: number, up: number): Eyes {
  return { x, y: world.terrain.heightAt(x, z) + up, z };
}
