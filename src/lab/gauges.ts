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

/** How many guards stand in a clear line from the player's eye, as a bullet would find them. */
export function inClearLine(sim: Simulation): number {
  const view = { world: sim.world, solids: sim.solids, bodies: sim.queryBodies() };
  let count = 0;
  for (const g of sim.guards) {
    eyeOf(sim.player, sim.tuning.bodies.player, eye);
    bodyShape(g.body, sim.tuning.bodies.guard, shape);
    const dx = shape.head.x - eye.x;
    const dy = shape.head.y - eye.y;
    const dz = shape.head.z - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    raycast(view, eye.x, eye.y, eye.z, dx / d, dy / d, dz / d, d + 1, Blocks.Bullet, hit, sim.playerId);
    if (hit.what === 'body' && hit.id === g.id) count++;
  }
  return count;
}

export interface Readings {
  /** Seconds since the player's first shot; NaN before it. */
  sinceFirstShot: number;
  shotsFired: number;
  guardsDown: number;
  guardsStanding: number;
  /** Guards in a clear line from the player now. */
  inLine: number;
  roundsAtYou: number;
  /** Whether any guard has confirmed sight of the player. */
  detected: boolean;
  /** Metres to the nearest guard now. */
  nearest: number;
  /** The least that has been, since the first shot. */
  nearestEver: number;
  /** Metres between where the camp believes the shots came from and where the player is; NaN with no estimate. */
  estimateOff: number;
  level: string;
  siren: boolean;
  targetStatus: string;
}

const distance = (ax: number, az: number, bx: number, bz: number): number => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));

export class CampGauges {
  private firstShot = -1;
  private shotsFired = 0;
  private roundsAtYou = 0;
  private detected = false;
  private siren = false;
  private nearestEver = Infinity;
  private readonly started: ReadonlySet<number>;

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
        } else this.roundsAtYou++;
      } else if (e.type === 'detected' && e.target === sim.playerId) this.detected = true;
      else if (e.type === 'siren') this.siren = true;
    }
    if (this.firstShot < 0) return;
    for (const g of sim.guards) this.nearestEver = Math.min(this.nearestEver, distance(g.body.x, g.body.z, sim.player.x, sim.player.z));
  }

  /** The gauges now. Casts a ray per guard, so call it a few times a second at most. */
  read(sim: Simulation): Readings {
    const c = commanderOf(sim);
    const est = c?.camp.shots.estimate;
    let nearest = Infinity;
    for (const g of sim.guards) nearest = Math.min(nearest, distance(g.body.x, g.body.z, sim.player.x, sim.player.z));
    return {
      sinceFirstShot: this.firstShot < 0 ? NaN : (sim.tick - this.firstShot) / sim.tuning.sim.tickHz,
      shotsFired: this.shotsFired,
      guardsDown: this.started.size - sim.guards.filter((g) => this.started.has(g.id)).length,
      guardsStanding: sim.guards.length,
      inLine: inClearLine(sim),
      roundsAtYou: this.roundsAtYou,
      detected: this.detected,
      nearest,
      nearestEver: this.nearestEver,
      estimateOff: est ? distance(est.x, est.z, sim.player.x, sim.player.z) : NaN,
      level: c?.camp.level ?? 'none',
      siren: this.siren,
      targetStatus: c?.camp.objective?.status ?? 'none',
    };
  }
}
