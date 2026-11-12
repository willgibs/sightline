import { ballisticOf, solveAim, unit, vec3, zeroOf } from '../../ballistics';
import { bodyShape, eyeOf, type Stance } from '../../body';
import { DEG, datan2, dcos, dsin } from '../../kernel/core/detmath';
import { air, windAt } from '../../kernel/env';
import { Optic, type InputFrame } from '../../kernel/input';
import type { Driver } from '../../kernel/scene';
import { Blocks } from '../../kernel/world/colliders';
import { Cell, cellIndex, type GridLayer } from '../../kernel/world/grid';
import { emptyHit, raycast, type QueryBody } from '../../kernel/world/query';
import { COST_PER_METRE, GridSearch } from '../../kernel/world/search';
import { emptyShape } from '../../kernel/world/shape';
import { emptyRoute, navigatorOf, type Route } from '../../brain';
import { commanderOf } from '../comms';
import { player } from '../entities';
import type { Simulation } from '../sim';

/**
 * What a person could know, from where they stand (Lab F, docs/camp-engine.md, section 7).
 * The bots on the ladder decide from this and nothing else, as a guard's brain decides
 * from its mind: bodies in a clear line, at the distance they are, your own state, and the
 * map you were given. It's narrow on purpose. A perfect bot that reads the simulation is
 * the upper limit of what one perch could ever do, and design calls don't rest on it.
 *
 * What a person can't do, it doesn't give:
 * - He sees a man only if a line of sight reaches his head or chest, inside the view.
 * - They all look alike at range. Only with an optic on a man, or within a stone's throw,
 *   does he know whether that's the man he came for.
 * - What he sees is refreshed a few times a second, not every tick: a person's eyes take
 *   in a scene, they don't poll it. A man already in view is followed tick by tick.
 * - The numbers he's given are his to get wrong: `aimAt` is what the reticle and honest
 *   arithmetic come to, and the bot adds its own error (person.ts).
 *
 * An instrument for bots, and read-only: it never writes the simulation.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Angles {
  yaw: number;
  pitch: number;
}

/** A man in view. */
export interface SeenMan {
  /** The same for as long as he's in view: "that one". */
  readonly id: number;
  readonly head: Point3;
  readonly chest: Point3;
  /** Metres from your eye to his head. */
  readonly distance: number;
  /** How he's moving, m/s. */
  readonly vx: number;
  readonly vz: number;
  /** Whether you can tell he's the man you came for: an optic on him, or close enough to see his face. */
  readonly isTarget: boolean;
}

/** What you know of yourself. */
export interface You {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly eye: Point3;
  readonly yaw: number;
  readonly pitch: number;
  readonly stance: Stance;
  /** No stance change is under way. */
  readonly settled: boolean;
  /** Metres a second you're moving. */
  readonly speed: number;
  /** The optic in your hands. */
  readonly optic: number;
  /** The scope has reached your eye. */
  readonly raised: boolean;
  readonly rounds: number;
  /** A round is chambered and nothing else is in your hands. */
  readonly ready: boolean;
  /** Hits you've taken. */
  readonly hits: number;
  /** The target is down: you saw him fall, and the way out is on your compass. */
  readonly targetDown: boolean;
  /** Where you get out, if the mission has such a place. */
  readonly wayOut: { x: number; z: number } | null;
}

/** All a person-limited bot is told. */
export interface PlayerView {
  /** Mission seconds. */
  readonly time: number;
  /** Seconds a tick lasts. */
  readonly dt: number;
  readonly you: You;
  /** The men in view now. */
  readonly seen: readonly SeenMan[];
  /** The line of sight that puts a round on `at`, moving as given, read exactly: your own rifle and air, and the wind. False if no such line. */
  aimAt(at: Point3, vx: number, vz: number, out: Angles): boolean;
  /** The straight line of sight to a point: for a laser. */
  lookAt(at: Point3, out: Angles): void;
  /** A way on foot from where you stand to (x, z), from the map: keeping `keepAway` metres from the camp where it can, and clear of places that have stopped you (`shun`). Null if there's none. */
  routeTo(x: number, z: number, keepAway: number, shun?: ReadonlyArray<{ x: number; z: number }>): ReadonlyArray<{ x: number; z: number }> | null;
}

/** A bot that decides from the view alone. */
export interface ViewBot {
  next(view: PlayerView, out: InputFrame): InputFrame;
}

/** How often a person's picture of what's in view is taken afresh, in ticks. */
const LOOK_EVERY = 6;
/** Half the width of what the eyes take in: the game's own view, 91° across at 16:9. */
const HALF_VIEW = dcos(45.5 * DEG);
/** The furthest a man can be made out at all, metres. */
const FURTHEST = 900;
/** Close enough to know a face without glass, metres. */
const FACE_RANGE = 40;
/** Ground this steep or less is simply walked; steeper is gone round if it can be. Rise over run. */
const EASY_RISE = 0.45;
/** How far a route keeps from a place that has already stopped you, metres. */
const SHUN = 7;

interface Man {
  id: number;
  head: Point3;
  chest: Point3;
  distance: number;
  vx: number;
  vz: number;
  isTarget: boolean;
}

const hit = emptyHit();
const shape = emptyShape();
const scratch = vec3();
const los = vec3();

/** The view of a running simulation. Update it once a tick; the bots get only the interface. */
export class LiveView implements PlayerView {
  time = 0;
  dt = 0;
  seen: Man[] = [];
  private sim: Simulation | null = null;
  private search: GridSearch | null = null;
  /** The navigator's route, when the map has none: kept for reuse. */
  private way: Route | null = null;
  private readonly bodies: QueryBody[] = [];
  private readonly path: number[] = [];
  readonly you = {
    x: 0,
    y: 0,
    z: 0,
    eye: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    stance: 'stand' as Stance,
    settled: true,
    speed: 0,
    optic: Optic.None as number,
    raised: false,
    rounds: 0,
    ready: false,
    hits: 0,
    targetDown: false,
    wayOut: null as { x: number; z: number } | null,
  };

  update(sim: Simulation): void {
    this.sim = sim;
    this.time = sim.tick * sim.dt;
    this.dt = sim.dt;
    const p = player(sim.index);
    const b = p.body;
    const y = this.you;
    y.x = b.x;
    y.y = b.y;
    y.z = b.z;
    eyeOf(b, sim.tuning.bodies.player, y.eye);
    y.yaw = b.yaw;
    y.pitch = b.pitch;
    y.stance = b.stance;
    y.settled = b.stanceTimer <= 0;
    y.speed = b.speed;
    y.optic = sim.lastInput.optic;
    const rifle = p.rifle;
    y.raised = rifle ? rifle.raise >= 0.95 : false;
    y.rounds = rifle ? rifle.rounds : 0;
    y.ready = rifle ? rifle.rounds > 0 && rifle.bolt <= 0 && rifle.fitting <= 0 : false;
    y.hits = p.health?.hits ?? 0;
    const objective = commanderOf(sim)?.camp.objective;
    y.targetDown = objective?.status === 'done';
    y.wayOut = objective?.getOut ?? null;
    if (sim.tick % LOOK_EVERY === 0) this.look(sim);
    else this.follow(sim);
  }

  private targetId(sim: Simulation): number {
    return commanderOf(sim)?.camp.objective?.target ?? -1;
  }

  /** Whether you can tell this man is the target, from how you're looking at him. */
  private knows(sim: Simulation, id: number, head: Point3, distance: number): boolean {
    if (id !== this.targetId(sim)) return false;
    if (distance <= FACE_RANGE) return true;
    const y = this.you;
    if (y.optic === Optic.None || (y.optic === Optic.Scope && !y.raised)) return false;
    const B = sim.tuning.ballistics;
    const field = (y.optic === Optic.Scope ? B.scope.fieldDeg : B.binoculars.fieldDeg) * 0.5 * DEG;
    const c = dcos(y.pitch);
    const fx = -dsin(y.yaw) * c;
    const fy = dsin(y.pitch);
    const fz = -dcos(y.yaw) * c;
    const dot = (fx * (head.x - y.eye.x) + fy * (head.y - y.eye.y) + fz * (head.z - y.eye.z)) / distance;
    return dot >= dcos(field);
  }

  /** Takes in the scene afresh: who is in a clear line, inside the view. */
  private look(sim: Simulation): void {
    const y = this.you;
    const eye = y.eye;
    const view = { world: sim.world, solids: sim.solids, bodies: sim.queryBodies(this.bodies) };
    const spec = sim.tuning.bodies.guard;
    const fx = -dsin(y.yaw);
    const fz = -dcos(y.yaw);
    this.seen.length = 0;
    for (const g of sim.guards) {
      bodyShape(g.body, spec, shape);
      const hx = shape.head.x - eye.x;
      const hy = shape.head.y - eye.y;
      const hz = shape.head.z - eye.z;
      const d = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (d > FURTHEST || d < 1e-6) continue;
      const across = Math.sqrt(hx * hx + hz * hz) || 1;
      if ((fx * hx + fz * hz) / across < HALF_VIEW) continue;
      const clear = (tx: number, ty: number, tz: number): boolean => {
        const dx = tx - eye.x;
        const dy = ty - eye.y;
        const dz = tz - eye.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        raycast(view, eye.x, eye.y, eye.z, dx / len, dy / len, dz / len, len + 1, Blocks.Sight, hit, sim.playerId);
        return hit.what === 'body' && hit.id === g.id;
      };
      const chestX = (shape.torso.ax + shape.torso.bx) / 2;
      const chestY = (shape.torso.ay + shape.torso.by) / 2;
      const chestZ = (shape.torso.az + shape.torso.bz) / 2;
      if (!clear(shape.head.x, shape.head.y, shape.head.z) && !clear(chestX, chestY, chestZ)) continue;
      const head = { x: shape.head.x, y: shape.head.y, z: shape.head.z };
      this.seen.push({ id: g.id, head, chest: { x: chestX, y: chestY, z: chestZ }, distance: d, vx: g.body.vx, vz: g.body.vz, isTarget: this.knows(sim, g.id, head, d) });
    }
  }

  /** Between looks: those already in view are followed where they go, and one who has dropped is gone. */
  private follow(sim: Simulation): void {
    const eye = this.you.eye;
    const spec = sim.tuning.bodies.guard;
    let w = 0;
    for (const m of this.seen) {
      const g = sim.index.get(m.id);
      if (!g || g.kind !== 'guard') continue;
      bodyShape(g.body, spec, shape);
      m.head.x = shape.head.x;
      m.head.y = shape.head.y;
      m.head.z = shape.head.z;
      m.chest.x = (shape.torso.ax + shape.torso.bx) / 2;
      m.chest.y = (shape.torso.ay + shape.torso.by) / 2;
      m.chest.z = (shape.torso.az + shape.torso.bz) / 2;
      const dx = m.head.x - eye.x;
      const dy = m.head.y - eye.y;
      const dz = m.head.z - eye.z;
      m.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      m.vx = g.body.vx;
      m.vz = g.body.vz;
      m.isTarget = this.knows(sim, m.id, m.head, m.distance);
      this.seen[w++] = m;
    }
    this.seen.length = w;
  }

  aimAt(at: Point3, vx: number, vz: number, out: Angles): boolean {
    const sim = this.sim!;
    const rifle = player(sim.index).rifle;
    if (!rifle) return false;
    const env = sim.world.spec.env;
    const a = air(env);
    const wind = windAt(env, this.time, { x: 0, z: 0 });
    const b = ballisticOf(rifle, sim.tuning, a.density, wind);
    const zero = zeroOf(rifle, sim.tuning, a.density);
    scratch.x = at.x;
    scratch.y = at.y;
    scratch.z = at.z;
    solveAim(this.you.eye, scratch, vx, vz, zero, b, sim.tuning.ballistics.maxFlight, los);
    out.yaw = datan2(-los.x, -los.z);
    out.pitch = datan2(los.y, Math.sqrt(los.x * los.x + los.z * los.z));
    return true;
  }

  lookAt(at: Point3, out: Angles): void {
    unit(at.x - this.you.eye.x, at.y - this.you.eye.y, at.z - this.you.eye.z, los);
    out.yaw = datan2(-los.x, -los.z);
    out.pitch = datan2(los.y, Math.sqrt(los.x * los.x + los.z * los.z));
  }

  routeTo(x: number, z: number, keepAway: number, shun: ReadonlyArray<{ x: number; z: number }> = []): ReadonlyArray<{ x: number; z: number }> | null {
    const sim = this.sim!;
    const world = sim.world;
    const L = world.grid.map;
    this.search ??= new GridSearch(L);
    const start = nearestWalkable(L, this.you.x, this.you.z);
    const goal = nearestWalkable(L, x, z);
    if (start < 0 || goal < 0) return null;
    const site = world.camp.site;
    const half = world.playHalf;
    const centreX = (c: number): number => L.x0 + ((c % L.nx) + 0.5) * L.cell;
    const centreZ = (c: number): number => L.z0 + (Math.floor(c / L.nx) + 0.5) * L.cell;
    const cost = (from: number, to: number, length: number): number => {
      if ((L.flags[to]! & Cell.Walkable) === 0) return -1;
      const px = centreX(to);
      const pz = centreZ(to);
      if (Math.abs(px) > half || Math.abs(pz) > half) return -1;
      // Where you're standing doesn't count: you have to be able to leave it.
      const here = (px - this.you.x) * (px - this.you.x) + (pz - this.you.z) * (pz - this.you.z) < (SHUN + L.cell) * (SHUN + L.cell);
      if (!here) for (const s of shun) if ((px - s.x) * (px - s.x) + (pz - s.z) * (pz - s.z) < SHUN * SHUN) return -1;
      const d = Math.sqrt((px - site.x) * (px - site.x) + (pz - site.z) * (pz - site.z));
      const rise = Math.abs(world.terrain.heightAt(px, pz) - world.terrain.heightAt(centreX(from), centreZ(from))) / (length / COST_PER_METRE);
      // A person picks his way: long way round a camp, and easy ground over a steep bank.
      const shy = d >= keepAway ? 0 : (4 * (keepAway - d)) / keepAway;
      const steep = rise > EASY_RISE ? (rise - EASY_RISE) * 30 : 0;
      return Math.round(length * (1 + shy + steep));
    };
    const r = this.search.path(start, goal, { maxExpansions: L.nx * L.nz, cost }, this.path);
    if (r.found) return this.path.map((c) => ({ x: centreX(c), z: centreZ(c) }));
    // The valley's map has no way through a gate narrower than its cells, so a place inside a walled camp can't be
    // reached on it. Someone walking straight in takes the way the camp's own men would: the navigator's, which
    // knows the gate. A walk that keeps away from the camp, or shuns somewhere, has no business in there.
    if (keepAway > 0 || shun.length > 0) return null;
    const way = navigatorOf(world, sim.tuning).find(this.you.x, this.you.z, x, z, {}, (this.way ??= emptyRoute()));
    if (way !== 'found') return null;
    const points: Array<{ x: number; z: number }> = [];
    for (let k = 0; k + 1 < this.way.points.length; k += 2) points.push({ x: this.way.points[k]!, z: this.way.points[k + 1]! });
    return points;
  }
}

/** The walkable map cell nearest a point, or −1 if there's none within 20 m. */
function nearestWalkable(L: GridLayer, x: number, z: number): number {
  const c = cellIndex(L, x, z);
  if (c < 0) return -1;
  const ii = c % L.nx;
  const jj = Math.floor(c / L.nx);
  const reach = Math.ceil(20 / L.cell);
  let best = -1;
  let bestD = Infinity;
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const i = ii + di;
      const j = jj + dj;
      if (i < 0 || j < 0 || i >= L.nx || j >= L.nz) continue;
      const k = j * L.nx + i;
      if ((L.flags[k]! & Cell.Walkable) === 0) continue;
      const d = di * di + dj * dj;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

/** Puts a view-bound bot at the controls of a simulation. */
export class ViewDriver implements Driver<Simulation> {
  private readonly view = new LiveView();

  constructor(private readonly bot: ViewBot) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    this.view.update(sim);
    return this.bot.next(this.view, out);
  }
}
