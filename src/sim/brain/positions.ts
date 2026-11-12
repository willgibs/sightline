import type { Tuning } from '../../config/tuning';
import type { Stance } from '../body';
import { Cell, Edge, cellIndex, type GridLayer } from '../kernel/world/grid';
import type { MoveCost, SearchOptions } from '../kernel/world/search';
import type { Ground } from './mind';
import { navigatorOf } from './nav';
import { outsideWalls } from './walls';

/**
 * A place to fight from (the firefight, firefight.ts; docs/camp-engine.md, section 9).
 *
 * A man who only hides is no use, and a man who stands in the open to shoot is dead. A
 * trained one fights from a position: somewhere that hides him when he's down, with a place
 * to look and fire from when he's up. That's the same spot stood up, behind something low,
 * or a step out from behind something tall. Whoever is attacking him then sees a head come
 * up at a place he can learn, and has until it goes down again.
 *
 * It's found the way dead ground is (ground.ts): breadth first over the grid's fine layer
 * from where he stands, so the nearest by path comes first, each candidate checked with
 * real rays, with budgets on the cells it walks and the rays it casts (rule 18). It reads
 * only the static world (rule 13): where the intruder is believed to be is the caller's.
 */

export interface FightingSpot {
  /** Where he's out of the intruder's sight, and how low he has to be there. */
  hx: number;
  hz: number;
  hs: Stance;
  /** Where he looks and fires from, and how he stands there. */
  fx: number;
  fz: number;
  fs: Stance;
  /** Whether the firing place has a line to where the intruder is believed to be. Without one it's only a place to hide. */
  line: boolean;
}

export interface SpotAsk {
  /** Where he is. */
  x: number;
  z: number;
  /** Where he believes the intruder is, and how high, if he knows: someone at an upper window or on a deck sees over what hides a man from the ground (eyesAt). */
  tx: number;
  tz: number;
  ty?: number;
  /** Metres of path he'll go for it. */
  maxRun: number;
  /** Only a place he can see the intruder's from will do. Otherwise one that only hides him will, if nothing better is near. */
  needLine: boolean;
  /** How much nearer the intruder's place it has to be than he is now, metres: a bound forward. 0 for anywhere. */
  gain: number;
  /** He isn't running for his life: the way there mustn't cross more ground the intruder can see than this many metres at a stretch. 0 for any way. */
  dash: number;
  /** Where he keeps to (firefight.ts, the chase): inside the camp's walls, or on its own ground. No place past that will do, and no way to one that leaves it. Absent for anywhere. */
  within?: 'walls' | 'ground';
}

/**
 * What the intruder's place can see of the camp's ground, roughly and cheaply: which ground a
 * man on his feet would be in view on. It's read off the grid's own record of what stands in
 * each cell (grid.ts, `cover`), on a lattice a couple of metres apart, each point worked out
 * the first time it's asked about: a straight walk over the cells between, stopped by
 * anything tall enough to hide him. No rays: it's for choosing a way, and the place a man
 * ends up is checked with real ones. Working memory: one per fine layer, aimed afresh by each
 * use, and nothing carries over.
 */
export class Danger {
  private readonly q: number;
  private readonly nq: number;
  private readonly stamp: Uint32Array;
  private readonly value: Uint8Array;
  private now = 0;
  private ti = 0;
  private tj = 0;
  private tall = 0;
  private price = 1;
  /** How far above the ground at his place the intruder's eyes are, in decimetres, when he's up on something; 0 on the ground. */
  private raised = 0;

  constructor(
    private readonly L: GridLayer,
    every: number,
  ) {
    this.q = Math.max(1, Math.round(every / L.cell));
    this.nq = Math.ceil(L.nx / this.q);
    const n = this.nq * Math.ceil(L.nz / this.q);
    this.stamp = new Uint32Array(n);
    this.value = new Uint8Array(n);
  }

  /** Aims it at where the intruder is believed to be: `up` is how far above the ground there his eyes are, if he's up on something, and 0 if not. */
  aim(tx: number, tz: number, tuning: Tuning, up = 0): this {
    const D = tuning.brain.firefight.danger;
    this.now++;
    this.ti = Math.floor((tx - this.L.x0) / this.L.cell);
    this.tj = Math.floor((tz - this.L.z0) / this.L.cell);
    this.tall = Math.round(D.tall * 10);
    this.price = 1 + D.price;
    this.raised = Math.round(up * 10);
    return this;
  }

  /** Whether a man on his feet in this cell would be in the intruder's view. */
  lit(cell: number): boolean {
    const L = this.L;
    const q = this.q;
    const qi = Math.floor((cell % L.nx) / q);
    const qj = Math.floor(Math.floor(cell / L.nx) / q);
    const at = qj * this.nq + qi;
    if (this.stamp[at] === this.now) return this.value[at] === 1;
    this.stamp[at] = this.now;
    const si = Math.min(L.nx - 1, qi * q + (q >> 1));
    const sj = Math.min(L.nz - 1, qj * q + (q >> 1));
    const di = this.ti - si;
    const dj = this.tj - sj;
    const n = Math.max(Math.abs(di), Math.abs(dj));
    let open = 1;
    for (let s = 1; s < n; s++) {
      const i = si + Math.round((di * s) / n);
      const j = sj + Math.round((dj * s) / n);
      // Off the fine layer there's nothing recorded to hide behind.
      if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) break;
      // From the ground, anything tall enough to hide a man on his feet does, wherever it stands between them. From above, his
      // line to the man's head climbs toward him, so a thing hides the man only if it reaches that line where it stands.
      const need = this.raised > this.tall ? this.tall + ((this.raised - this.tall) * s) / n : this.tall;
      if (L.cover[j * L.nx + i]! >= need) {
        open = 0;
        break;
      }
    }
    this.value[at] = open;
    return open === 1;
  }

  /** A route's price for its moves (kernel/world/search.ts): ground in his view costs more, so the way round is taken where there is one. */
  readonly cost: MoveCost = (_from, to, length) => (this.lit(to) ? length * this.price : length);
}

const dangers = new WeakMap<GridLayer, Danger>();

/** The camp's ground as the intruder's place sees it, for a route to keep out of (see Danger). `ty` is how high he's believed to be, if that's known. */
export function dangerOf(world: Ground, tuning: Tuning, tx: number, tz: number, ty?: number): Danger {
  const L = world.grid.site;
  let d = dangers.get(L);
  if (!d) {
    d = new Danger(L, tuning.brain.firefight.danger.every);
    dangers.set(L, d);
  }
  const ground = world.terrain.heightAt(tx, tz);
  const eyes = eyesAt(world, tuning, tx, tz, ty);
  return d.aim(tx, tz, tuning, eyes > ground + tuning.brain.firefight.spot.eye ? eyes - ground : 0);
}

/**
 * How high the intruder's eyes are taken to be. On the ground, an eye's height above it,
 * whatever he's doing: a man doesn't stake his cover on the intruder staying flat. Up on
 * something (an upper floor, a deck, a roof), where he's believed to be: from there he sees
 * over what would hide a man from the ground, and a line to the ground under him is a line
 * into a wall.
 */
export function eyesAt(world: Ground, tuning: Tuning, tx: number, tz: number, ty?: number): number {
  const S = tuning.brain.firefight.spot;
  const ground = world.terrain.heightAt(tx, tz);
  return ty !== undefined && ty > ground + S.raised ? ty : ground + S.eye;
}

/** How far each cell's way there has run in the intruder's view without a break, in cells: working memory for a covered search. */
const exposedRuns = new WeakMap<GridLayer, Uint16Array>();

/** Which cells a search has been to, by generation, so a search costs nothing to start. Working memory: nothing carries over between calls. */
const visits = new WeakMap<GridLayer, { seen: Uint32Array; now: number }>();

function visited(L: GridLayer): { seen: Uint32Array; now: number } {
  let v = visits.get(L);
  if (!v) {
    v = { seen: new Uint32Array(L.nx * L.nz), now: 0 };
    visits.set(L, v);
  }
  v.now++;
  return v;
}

/** The eight ways to step out from behind something, as cell offsets. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * The nearest position by path, or null: he's outside the fine layer, or there's none in
 * reach. The rays it casts are counted into `work`.
 */
export function fightingSpot(world: Ground, tuning: Tuning, ask: SpotAsk, work?: SearchOptions['work']): FightingSpot | null {
  const S = tuning.brain.firefight.spot;
  const L = world.grid.site;
  const start = cellIndex(L, ask.x, ask.z);
  if (start < 0) return null;
  const nav = navigatorOf(world, tuning);
  const guard = tuning.bodies.guard;
  const site = world.camp.site;
  const ty = eyesAt(world, tuning, ask.tx, ask.tz, ask.ty);
  let rays = 0;
  const sees = (x: number, y: number, z: number): boolean => {
    rays++;
    if (work) work.rays++;
    return nav.seesPoint(ask.tx, ty, ask.tz, x, y, z);
  };
  const walkable = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < L.nx && j < L.nz && (L.flags[j * L.nx + i]! & Cell.Walkable) !== 0;
  const ownDx = ask.tx - ask.x;
  const ownDz = ask.tz - ask.z;
  const ownRange = Math.sqrt(ownDx * ownDx + ownDz * ownDz);
  const v = visited(L);
  v.seen[start] = v.now;
  // A covered way: ground in his view is crossed only a dash at a time.
  const danger = ask.dash > 0 ? dangerOf(world, tuning, ask.tx, ask.tz, ask.ty) : null;
  const dash = Math.round(ask.dash / L.cell);
  let runs = exposedRuns.get(L);
  if (danger && !runs) {
    runs = new Uint16Array(L.nx * L.nz);
    exposedRuns.set(L, runs);
  }
  if (runs) runs[start] = 0;
  let frontier = [start];
  let walked = 0;
  let hide: FightingSpot | null = null;
  let hideAt = 0;
  const steps = Math.floor(ask.maxRun / L.cell);
  const near = Math.max(1, Math.round(S.spacing / L.cell));
  const prefer = Math.round(S.preferLine / L.cell);
  const out1 = Math.max(1, Math.round(1 / L.cell));
  const out2 = Math.max(out1, Math.round(S.stepOut / L.cell));
  const reaches = out1 === out2 ? [out1] : [out1, out2];
  // Worth a ray: a place with something tall enough to hide a kneeling man within a step of it, toward the intruder.
  // The grid knows what stands in each cell (grid.ts, `cover`), so open ground costs nothing. Ground that folds is
  // dead ground's business (ground.ts): a camp's pad is flat.
  const tall = Math.round(S.cover * 10);
  const behind = Math.max(1, Math.round(S.behind / L.cell));
  const sheltered = (i: number, j: number, ux: number, uz: number): boolean => {
    for (let s = 0; s <= behind; s++) {
      const ci = i + Math.round(ux * s);
      const cj = j + Math.round(uz * s);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const ni = ci + a;
          const nj = cj + b;
          if (ni >= 0 && nj >= 0 && ni < L.nx && nj < L.nz && L.cover[nj * L.nx + ni]! >= tall) return true;
        }
      }
    }
    return false;
  };
  for (let step = 0; step <= steps && frontier.length > 0; step++) {
    if (!ask.needLine && hide && step > hideAt + prefer) return hide;
    const k = near * (step * L.cell < S.nearRun ? 1 : 2);
    const next: number[] = [];
    for (const c of frontier) {
      if (++walked > S.cells || rays > S.rays) return ask.needLine ? null : hide;
      const i = c % L.nx;
      const j = Math.floor(c / L.nx);
      if (step === 0 || (i % k === 0 && j % k === 0)) {
        const px = L.x0 + (i + 0.5) * L.cell;
        const pz = L.z0 + (j + 0.5) * L.cell;
        const dx = ask.tx - px;
        const dz = ask.tz - pz;
        const range = Math.sqrt(dx * dx + dz * dz);
        if (range >= S.standoff && (ask.gain <= 0 || range <= ownRange - ask.gain) && sheltered(i, j, dx / (range || 1), dz / (range || 1))) {
          const ground = world.terrain.heightAt(px, pz);
          const top = ground + guard.height.crouch;
          // Out of his sight crouched: the head, and a shoulder's width either side of it.
          const sx = (-dz / (range || 1)) * S.shoulder;
          const sz = (dx / (range || 1)) * S.shoulder;
          if (!sees(px, top, pz) && !sees(px + sx, top, pz + sz) && !sees(px - sx, top, pz - sz)) {
            // Behind something low: he stands up to fire over it.
            if (sees(px, ground + guard.eyeHeight.stand, pz)) return { hx: px, hz: pz, hs: 'crouch', fx: px, fz: pz, fs: 'stand', line: true };
            // Behind something tall: a step out to one side of it, kneeling. The nearest step first, and of those the most sideways-on to him.
            let best: FightingSpot | null = null;
            let bestCost = Infinity;
            for (const reach of reaches) {
              for (const [ox, oz] of STEPS) {
                let open = true;
                for (let s = 1; s <= reach && open; s++) open = walkable(i + ox * s, j + oz * s);
                if (!open) continue;
                const fx = px + ox * reach * L.cell;
                const fz = pz + oz * reach * L.cell;
                const along = Math.abs(ox * dx + oz * dz) / ((range || 1) * Math.sqrt(ox * ox + oz * oz));
                const cost = reach * L.cell * Math.sqrt(ox * ox + oz * oz) + along;
                if (cost >= bestCost) continue;
                if (!sees(fx, world.terrain.heightAt(fx, fz) + guard.eyeHeight.crouch, fz)) continue;
                bestCost = cost;
                best = { hx: px, hz: pz, hs: 'crouch', fx, fz, fs: 'crouch', line: true };
              }
              if (best) break;
            }
            if (best) return best;
            if (!hide) {
              hide = { hx: px, hz: pz, hs: 'crouch', fx: px, fz: pz, fs: 'crouch', line: false };
              hideAt = step;
            }
          }
        }
      }
      const go = (n: number): void => {
        if (v.seen[n] === v.now || (L.flags[n]! & Cell.Walkable) === 0) return;
        if (ask.within) {
          const cx = L.x0 + ((n % L.nx) + 0.5) * L.cell;
          const cz = L.z0 + (Math.floor(n / L.nx) + 0.5) * L.cell;
          if (ask.within === 'walls' ? outsideWalls(world, cx, cz) : (cx - site.x) * (cx - site.x) + (cz - site.z) * (cz - site.z) > site.radius * site.radius) return;
        }
        if (danger && runs) {
          const run = danger.lit(n) ? runs[c]! + 1 : 0;
          // Too far in the open from here. Another way may still reach it under cover, so it isn't marked.
          if (run > dash) return;
          runs[n] = run;
        }
        v.seen[n] = v.now;
        next.push(n);
      };
      if (i + 1 < L.nx && (L.edges[c]! & Edge.East) !== 0) go(c + 1);
      if (j + 1 < L.nz && (L.edges[c]! & Edge.North) !== 0) go(c + L.nx);
      if (i > 0 && (L.edges[c - 1]! & Edge.East) !== 0) go(c - 1);
      if (j > 0 && (L.edges[c - L.nx]! & Edge.North) !== 0) go(c - L.nx);
    }
    frontier = next;
  }
  return ask.needLine ? null : hide;
}

/**
 * Whether someone where the intruder is believed to be could see a man at (x, z) in this stance: the top of him. One ray, counted
 * into `work`. `ty` is how high the intruder is believed to be, if that's known (eyesAt), and `feet` the height the man stands at,
 * if it isn't the ground's: a man on an upper floor.
 */
export function exposedAt(world: Ground, tuning: Tuning, x: number, z: number, stance: Stance, tx: number, tz: number, work?: SearchOptions['work'], ty?: number, feet?: number): boolean {
  if (work) work.rays++;
  const top = (feet ?? world.terrain.heightAt(x, z)) + tuning.bodies.guard.height[stance];
  return navigatorOf(world, tuning).seesPoint(tx, eyesAt(world, tuning, tx, tz, ty), tz, x, top, z);
}

/** Whether a man at (x, z) in this stance has a line to where the intruder is believed to be, from his eyes. One ray, counted into `work`. `ty` as for exposedAt. */
export function lineFrom(world: Ground, tuning: Tuning, x: number, z: number, stance: Stance, tx: number, tz: number, work?: SearchOptions['work'], ty?: number): boolean {
  if (work) work.rays++;
  const eye = world.terrain.heightAt(x, z) + tuning.bodies.guard.eyeHeight[stance];
  return navigatorOf(world, tuning).seesPoint(tx, eyesAt(world, tuning, tx, tz, ty), tz, x, eye, z);
}
