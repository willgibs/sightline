import { flightAt, flightEnd, vec3, type Flight } from '../sim/ballistics';
import { bodyShape, eyeOf } from '../sim/body';
import { commanderOf } from '../sim/game/comms';
import type { Simulation } from '../sim/game/sim';
import type { SimEvent } from '../sim/kernel/events';
import { Blocks } from '../sim/kernel/world/colliders';
import { emptyHit, raycast } from '../sim/kernel/world/query';
import { emptyShape } from '../sim/kernel/world/shape';

/**
 * What a camp is doing to the shooter, read off a running simulation (Lab F,
 * docs/camp-engine.md): the same gauges for a person in the browser's lab panel and for a
 * bot in an experiment, so a sitting and a table can be compared.
 *
 * An instrument: it reads the simulation and never writes it, and what it remembers
 * between ticks isn't simulation state. It sees everything, and shows that only to the
 * developer: nothing here reaches a guard's mind or the honest view.
 */

const hit = emptyHit();
const shape = emptyShape();
const eye = { x: 0, y: 0, z: 0 };

/** How many guards stand in a clear line from a point, one a shooter could use: he can see them and a round can reach them. From the player's eye, unless you name another. */
export function inClearLine(sim: Simulation, from?: Point): number {
  const view = { world: sim.world, solids: sim.solids, bodies: sim.queryBodies() };
  let count = 0;
  for (const g of sim.guards) {
    if (from) {
      eye.x = from.x;
      eye.y = from.y;
      eye.z = from.z;
    } else eyeOf(sim.player, sim.tuning.bodies.player, eye);
    bodyShape(g.body, sim.tuning.bodies.guard, shape);
    const dx = shape.head.x - eye.x;
    const dy = shape.head.y - eye.y;
    const dz = shape.head.z - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    raycast(view, eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, d + 1, Blocks.Sight | Blocks.Bullet, hit, sim.playerId);
    if (hit.what === 'body' && hit.id === g.id) count++;
  }
  return count;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/** Seconds between samples of a round's path, each a straight piece of it. */
const PASS_STEP = 1 / 60;
/** How near a round must come to the muzzle to have struck someone lying behind it, metres. */
const LYING_REACH = 0.4;
const a = vec3();
const b = vec3();

/** How far a point is from a straight piece of path. */
function toSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vz = b.z - a.z;
  const len2 = vx * vx + vy * vy + vz * vz;
  const s = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / len2)) : 0;
  return Math.sqrt((a.x + vx * s - p.x) * (a.x + vx * s - p.x) + (a.y + vy * s - p.y) * (a.y + vy * s - p.y) + (a.z + vz * s - p.z) * (a.z + vz * s - p.z));
}

/** A shot as it left the muzzle: where from, and which way. */
export interface ShotFrom extends Point {
  dx: number;
  dy: number;
  dz: number;
}

export interface Readings {
  /** Seconds since the player's first shot; NaN before it. */
  sinceFirstShot: number;
  shotsFired: number;
  guardsDown: number;
  guardsStanding: number;
  /** Where the shots really come from: the last muzzle. In the compound simulator that's a script or your hand, and nothing to do with the parked player. */
  shooter: ShotFrom | null;
  /** Seconds since the last of those shots; NaN before the first. */
  sinceLastShot: number;
  /** The camp's rounds at wherever the shooter last fired from: how many, the closest any came, and how many would have struck someone lying there. */
  returnFire: { rounds: number; closest: number; struck: number };
  /** Guards in a clear line from the shooter now. */
  inLine: number;
  roundsAtYou: number;
  /** Rounds that passed within a near miss of your head. */
  nearMisses: number;
  /** Whether any guard has confirmed sight of the player. */
  detected: boolean;
  /** Metres from the shooter to the nearest guard now. */
  nearest: number;
  /** The least that has been, since the first shot. */
  nearestEver: number;
  /** Metres between where the camp believes the shots came from and where the shooter is; NaN with no estimate. */
  estimateOff: number;
  level: string;
  siren: boolean;
  targetStatus: string;
  /** Where a camp that protects its target has got to with it, in words; '' for a camp that doesn't (brain/protect.ts). */
  protection: string;
  /** The firefight, in words: how many men are fighting from positions, how many of them are up, and who's going after you; '' with nobody in one (brain/firefight.ts). */
  firefight: string;
  /** The hunt, in words: where the camp has you placed and how far off that is, and what its section is doing; '' with nobody placed and nobody out (brain/hunt.ts). */
  hunt: string;
}

const distance = (ax: number, az: number, bx: number, bz: number): number => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));

export class CampGauges {
  private firstShot = -1;
  private shotsFired = 0;
  private roundsAtYou = 0;
  private nearMisses = 0;
  private detected = false;
  private siren = false;
  private nearestEver = Infinity;
  private readonly started: ReadonlySet<number>;
  private shooter: ShotFrom | null = null;
  private lastShot_ = -1;
  private readonly returnFire = { rounds: 0, closest: Infinity, struck: 0 };

  constructor(sim: Simulation) {
    this.started = new Set(sim.guards.map((g) => g.id));
  }

  /** Call once a tick, with that tick's events. */
  observe(sim: Simulation, events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'shot') {
        if (e.source === sim.playerId) {
          if (this.firstShot < 0) this.firstShot = sim.tick;
          this.shotsFired++;
          this.shooter = { x: e.x, y: e.y, z: e.z, dx: e.dx, dy: e.dy, dz: e.dz };
          this.lastShot_ = sim.tick;
        } else {
          this.roundsAtYou++;
          if (this.shooter && sim.index.get(e.source)?.kind === 'guard') this.measureReturnFire(sim, e, this.shooter);
        }
      } else if (e.type === 'detected' && e.target === sim.playerId) this.detected = true;
      else if (e.type === 'siren') this.siren = true;
      else if (e.type === 'passed') this.nearMisses++;
    }
    if (this.firstShot < 0) return;
    const from = this.shooter ?? sim.player;
    for (const g of sim.guards) this.nearestEver = Math.min(this.nearestEver, distance(g.body.x, g.body.z, from.x, from.z));
  }

  /** How near a guard's round came to where the shooter last fired from, along the path it really flew. */
  private measureReturnFire(sim: Simulation, e: Extract<SimEvent, { type: 'shot' }>, at: Point): void {
    const T = sim.tuning;
    const flight: Flight = { x: e.x, y: e.y, z: e.z, dx: e.dx, dy: e.dy, dz: e.dz, t: e.t, v0: e.speed, k: e.drag, g: T.sim.gravity, wx: e.wx, wz: e.wz };
    const until = flightEnd(flight, e.t + T.ballistics.maxFlight, 1 / T.sim.tickHz, sim.queryView());
    let closest = Infinity;
    flightAt(flight, e.t, a);
    for (let t = e.t + PASS_STEP; ; t += PASS_STEP) {
      flightAt(flight, t < until ? t : until, b);
      closest = Math.min(closest, toSegment(at, a, b));
      if (t >= until) break;
      a.x = b.x;
      a.y = b.y;
      a.z = b.z;
    }
    this.returnFire.rounds++;
    this.returnFire.closest = Math.min(this.returnFire.closest, closest);
    if (closest <= LYING_REACH) this.returnFire.struck++;
  }

  /** The last shot as it left the muzzle, or null before the first. */
  get lastShot(): ShotFrom | null {
    return this.shooter;
  }

  /** The gauges now. Casts a ray per guard, so call it a few times a second at most. */
  read(sim: Simulation): Readings {
    const c = commanderOf(sim);
    const est = c?.camp.shots.estimate;
    const from = this.shooter ?? sim.player;
    let nearest = Infinity;
    for (const g of sim.guards) nearest = Math.min(nearest, distance(g.body.x, g.body.z, from.x, from.z));
    return {
      sinceFirstShot: this.firstShot < 0 ? NaN : (sim.tick - this.firstShot) / sim.tuning.sim.tickHz,
      shotsFired: this.shotsFired,
      guardsDown: this.started.size - sim.guards.filter((g) => this.started.has(g.id)).length,
      guardsStanding: sim.guards.length,
      shooter: this.shooter,
      sinceLastShot: this.lastShot_ < 0 ? NaN : (sim.tick - this.lastShot_) / sim.tuning.sim.tickHz,
      returnFire: { ...this.returnFire },
      inLine: inClearLine(sim, this.shooter ?? undefined),
      roundsAtYou: this.roundsAtYou,
      nearMisses: this.nearMisses,
      detected: this.detected,
      nearest,
      nearestEver: this.nearestEver,
      estimateOff: est ? distance(est.x, est.z, from.x, from.z) : NaN,
      level: c?.camp.level ?? 'none',
      siren: this.siren,
      targetStatus: c?.camp.objective?.status ?? 'none',
      protection: protectionOf(sim),
      firefight: firefightOf(sim),
      hunt: huntOf(sim),
    };
  }
}

/** The stage a protecting camp has reached, as the lab panel says it: the truth, read off the state. */
/** The hunt as it stands, in words: the camp's fix on you and how far off it is, and its section: how many, what they're doing, and how near the nearest is. */
export function huntOf(sim: Simulation): string {
  const camp = commanderOf(sim)?.camp;
  if (!camp || (!camp.threat && camp.sections.length === 0)) return '';
  const you = sim.player;
  const hz = sim.tuning.sim.tickHz;
  const th = camp.threat;
  const placed = th ? `placed ${distance(th.x, th.z, you.x, you.z).toFixed(0)} m off (${th.seen ? 'seen' : 'heard'}${th.point >= 0 ? ', a listed firing point' : ''})` : 'not placed';
  const s = camp.sections[0];
  if (!s) {
    const wait = th ? sim.tuning.brain.hunt.after - (sim.tick - th.since) / hz : 0;
    return `${placed}${wait > 0 ? ` · a section in ${wait.toFixed(0)} s` : ' · nobody sent'}`;
  }
  let nearest = Infinity;
  const doing = new Map<string, number>();
  for (const g of sim.guards) {
    if (!s.men.includes(g.id)) continue;
    nearest = Math.min(nearest, distance(g.body.x, g.body.z, you.x, you.z));
    const h = g.brain?.hunt;
    const what = g.brain?.act === 'fight' || g.brain?.act === 'push' ? 'fighting' : !h || g.brain?.act !== 'hunt' ? 'elsewhere' : h.phase === 'out' ? (h.at === 0 ? 'gathering' : 'on the way') : h.phase === 'watch' ? 'watching the place' : h.phase === 'close' ? 'closing in' : h.phase === 'sweep' ? 'looking it over' : h.phase === 'hold' ? 'waiting for orders' : 'coming home';
    doing.set(what, (doing.get(what) ?? 0) + 1);
  }
  const what = [...doing].map(([k, n]) => `${n} ${k}`).join(', ');
  return `${placed} · section of ${s.men.length}, out ${((sim.tick - s.ordered) / hz).toFixed(0)} s: ${what || 'none left'}${nearest < Infinity ? ` · nearest ${nearest.toFixed(0)} m` : ''}`;
}

/** The firefight as it stands, in words: who's fighting from a position, who's up, who's pinned, and who's coming. */
export function firefightOf(sim: Simulation): string {
  let fighting = 0;
  let up = 0;
  let pinned = 0;
  let going = 0;
  for (const g of sim.guards) {
    const b = g.brain;
    const ff = b?.ff;
    if (!b || !ff) continue;
    if (b.act === 'push') going++;
    else if (b.act === 'fight') {
      fighting++;
      if (sim.tick < ff.pinned) pinned++;
      else if (ff.up) up++;
    }
  }
  if (fighting + going === 0) return '';
  return `${fighting} in position${up > 0 ? `, ${up} up` : ''}${pinned > 0 ? `, ${pinned} pinned` : ''}${going > 0 ? ` · ${going} coming for you` : ''}`;
}

export function protectionOf(sim: Simulation): string {
  const camp = commanderOf(sim)?.camp;
  if (!camp?.protects || !camp.objective) return '';
  if (camp.objective.status === 'escaped') return 'he is gone';
  if (camp.objective.status === 'escaping') return 'in his vehicle, on the way out';
  const him = sim.index.get(camp.objective.target);
  if (!him || him.kind !== 'guard' || !him.brain) return 'he is down';
  const b = him.brain;
  const hz = sim.tuning.sim.tickHz;
  const near = sim.tuning.brain.protect.near;
  const inRoom = distance(him.body.x, him.body.z, camp.protects.x, camp.protects.z) <= near;
  const where = b.act === 'flee' ? 'running for his vehicle' : inRoom ? 'in his room' : b.act === 'shelter' ? 'going to his room' : 'about his day';
  if (b.sirenAt < 0) return (b.standToUntil ?? -1) > sim.tick ? `stand-to · ${where}` : where;
  const relief = camp.relief
    ? `relief at the gate ${((sim.tick - camp.relief.at) / hz).toFixed(0)} s ago, sent for him ${camp.relief.fetches}×`
    : camp.reinforceCalled >= 0
      ? `relief called ${((sim.tick - camp.reinforceCalled) / hz).toFixed(0)} s ago`
      : 'no relief called';
  const left = sim.tuning.brain.protect.giveUp - (sim.tick - b.sirenAt) / hz;
  const word = b.releasedAt !== undefined ? (b.told.some((t) => t.kind === 'escort') ? 'told to come' : 'gave up waiting') : `waits ${Math.max(0, left).toFixed(0)} s more`;
  const way = camp.devices.escape ? '' : ' · no vehicle';
  return `${where} · ${relief} · ${word}${way}`;
}
