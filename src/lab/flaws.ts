import { groundSpot } from '../sim/brain';
import { commanderOf } from '../sim/game/comms';
import type { Attacked } from '../sim/game/attacks';
import type { Simulation } from '../sim/game/sim';
import type { SimEvent } from '../sim/kernel/events';
import { Blocks } from '../sim/kernel/world/colliders';
import { Cell, cellIndex } from '../sim/kernel/world/grid';
import { sightLine } from '../sim/kernel/world/query';

/**
 * Flaw detectors for the compound simulator (Lab F): watching a camp under attack with no
 * player, and flagging the moments it does something a defender plainly wouldn't. The
 * owner's aim: "We should be able to find no flaws." Each detector names one kind of
 * stupidity, in terms that can be checked from the outside, and says who and when, so the
 * moment can be replayed in the browser.
 *
 * An instrument: it reads and doesn't write. It does know the truth, because judging a
 * reaction takes knowing what really happened; none of it reaches a guard. It holds a man
 * only to what his camp could know: taking cover from the wrong ridge is a mistake he's
 * allowed to make.
 */

type LineView = Parameters<typeof sightLine>[0];

/** A line a shooter could use: he can see along it, and a round can get down it. */
const CLEAR_LINE = Blocks.Sight | Blocks.Bullet;

export const FLAW_KINDS = ['deaf', 'in-the-line', 'stuck', 'hiding-on', 'silent-tower', 'pile-up', 'friendly-fire', 'chatter'] as const;
export type FlawKind = (typeof FLAW_KINDS)[number];

export interface Flaw {
  kind: FlawKind;
  /** When, in seconds. */
  at: number;
  guard: number;
  note: string;
}

const WALKING = new Set(['cover', 'task', 'search', 'investigate', 'return', 'flee', 'alarm', 'flank']);
const BUSY = new Set(['alarm', 'report', 'flee', 'suppress', 'engage', 'fight', 'push', 'hunt']);

export class FlawWatch {
  readonly flaws: Flaw[] = [];
  private readonly lined = new Map<number, number>();
  private readonly still = new Map<number, number>();
  private readonly pile = new Map<number, number>();
  private readonly once = new Set<string>();
  private readonly fired = new Map<number, number>();
  private readonly calls: number[] = [];
  private readonly seenSince = new Map<number, number>();
  /** Men flat on the ground, by shot, for whom there was nowhere better: asked once each, because asking costs rays. */
  private readonly nowhere = new Set<string>();

  constructor(private readonly truth: readonly Attacked[]) {}

  private add(sim: Simulation, kind: FlawKind, guard: number, note: string, key: string): void {
    if (this.once.has(key)) return;
    this.once.add(key);
    this.flaws.push({ kind, at: sim.tick / sim.tuning.sim.tickHz, guard, note });
  }

  /** Call once a tick, with that tick's events. */
  observe(sim: Simulation, events: readonly SimEvent[]): void {
    const hz = sim.tuning.sim.tickHz;
    const dt = 1 / hz;
    const F = sim.tuning.brain.fight;
    const shots = this.truth.filter((t) => t.what === 'shot' || t.what === 'suppressed-shot');
    const lastShot = shots[shots.length - 1];
    const lastAny = this.truth[this.truth.length - 1];
    for (const e of events) {
      if (e.type === 'shot' && sim.index.get(e.source)?.kind === 'guard') this.fired.set(e.source, sim.tick);
      if (e.type === 'death' && sim.index.get(e.source)?.kind === 'guard') this.add(sim, 'friendly-fire', e.victim, `shot by guard ${e.source}`, `ff${e.victim}`);
      if (e.type === 'call' && e.radio) this.calls.push(sim.tick);
    }
    while (this.calls.length > 0 && sim.tick - this.calls[0]! > 20 * hz) this.calls.shift();
    if (this.calls.length > 8) this.add(sim, 'chatter', -1, `${this.calls.length} radio calls in 20 s`, `chat${Math.floor(sim.tick / (20 * hz))}`);
    // Terrain and solids only: a guard's own body would otherwise block the line to him.
    const view = { world: sim.world, solids: sim.solids, bodies: [] };
    for (const g of sim.guards) {
      if (!this.seenSince.has(g.id)) this.seenSince.set(g.id, sim.tick);
      const b = g.brain;
      if (!b) continue;
      const spawn = sim.world.camp.guards[g.guard.spawn];
      const speed = Math.sqrt(g.body.vx * g.body.vx + g.body.vz * g.body.vz);
      if (WALKING.has(b.act) && b.routeOk && b.route.points.length > 0 && !b.covered && b.linger < 0 && speed < 0.05) {
        const s = (this.still.get(g.id) ?? 0) + dt;
        this.still.set(g.id, s);
        if (s >= 4) this.add(sim, 'stuck', g.id, `${b.act}, not moving for ${s.toFixed(0)} s`, `stuck${g.id}${Math.floor(sim.tick / (15 * hz))}`);
      } else this.still.delete(g.id);
      if (b.act === 'cover' && lastAny && (sim.tick - lastAny.tick) / hz > F.drill.standTo.max + 15) this.add(sim, 'hiding-on', g.id, `still in cover ${((sim.tick - lastAny.tick) / hz).toFixed(0)} s after the last thing happened`, `hide${g.id}`);
      if (!lastShot) continue;
      const since = (sim.tick - lastShot.tick) / hz;
      // Under a roof, a distant report can really be too faint: only a man outdoors is deaf.
      const cell = cellIndex(sim.world.grid.site, g.body.x, g.body.z);
      const indoors = cell >= 0 && (sim.world.grid.site.flags[cell]! & Cell.Roofed) !== 0;
      if (!indoors && lastShot.what === 'shot' && since >= 5 && since < 6 && g.senses?.awareness.state === 'unaware' && (this.seenSince.get(g.id) ?? sim.tick) <= lastShot.tick) this.add(sim, 'deaf', g.id, `still unaware ${since.toFixed(0)} s after an unsuppressed shot`, `deaf${g.id}${lastShot.tick}`);
      if (spawn?.elevated) {
        const dx = lastShot.from.x - g.body.x;
        const dz = lastShot.from.z - g.body.z;
        const heard = sim.tuning.brain.roles[spawn.role].fight > 0 && dx * dx + dz * dz <= F.suppress.range * F.suppress.range;
        if (heard && since >= 8 && since < 9 && (this.fired.get(g.id) ?? -1) < lastShot.tick) this.add(sim, 'silent-tower', g.id, `a shot within his range ${since.toFixed(0)} s ago, and no answer`, `tower${g.id}${lastShot.tick}`);
      } else if (spawn?.role !== 'target' && since < 20 && !BUSY.has(b.act) && speed < 0.3) {
        const y = g.body.y + g.body.eyeHeight;
        if (sightLine(view, lastShot.from.x, lastShot.from.y, lastShot.from.z, g.body.x, y, g.body.z, CLEAR_LINE)) {
          const s = (this.lined.get(g.id) ?? 0) + dt;
          this.lined.set(g.id, s);
          if (s > 6 && this.openToWhatTheyBelieve(sim, view, g.body.x, g.body.y + g.body.eyeHeight, g.body.z) && this.couldHaveMoved(sim, g.id, g.body.stance, g.body.x, g.body.z, lastShot)) this.add(sim, 'in-the-line', g.id, `standing in the shooter's clear line for ${s.toFixed(0)} s (${b.act})`, `line${g.id}${lastShot.tick}`);
        }
      } else if (since >= 20) this.lined.delete(g.id);
      let near = 0;
      for (const o of sim.guards) if (o !== g && (o.body.x - g.body.x) * (o.body.x - g.body.x) + (o.body.z - g.body.z) * (o.body.z - g.body.z) < 2.5 * 2.5) near++;
      if (near >= 3) {
        const s = (this.pile.get(g.id) ?? 0) + dt;
        this.pile.set(g.id, s);
        if (s > 4) this.add(sim, 'pile-up', g.id, `${near + 1} men within 2.5 m for ${s.toFixed(0)} s (${b.act})`, `pile${g.id}${Math.floor(sim.tick / (15 * hz))}`);
      } else this.pile.delete(g.id);
    }
  }

  /**
   * Whether a man is also in the open from where his camp believes the shots come from. Hidden
   * from that, or with no idea at all, he's done what he can with what he knows: to call it a
   * flaw would ask him to know where the shooter really is.
   */
  private openToWhatTheyBelieve(sim: Simulation, view: LineView, x: number, y: number, z: number): boolean {
    const est = commanderOf(sim)?.camp.shots.estimate;
    if (!est) return false;
    return sightLine(view, est.x, sim.world.terrain.heightAt(est.x, est.z) + sim.tuning.bodies.player.eyeHeight.prone, est.z, x, y, z, CLEAR_LINE);
  }

  /** A man flat on the ground with truly nothing to get behind, from the real shooter's bearing, has done what he can. */
  private couldHaveMoved(sim: Simulation, id: number, stance: string, x: number, z: number, shot: Attacked): boolean {
    if (stance !== 'prone') return true;
    const key = `${id}.${shot.tick}`;
    if (this.nowhere.has(key)) return false;
    if (groundSpot(sim.world, sim.tuning, x, z, shot.from.x, shot.from.z) !== null) return true;
    this.nowhere.add(key);
    return false;
  }

  /** How many of each kind. */
  counts(): Record<FlawKind, number> {
    const out = Object.fromEntries(FLAW_KINDS.map((k) => [k, 0])) as Record<FlawKind, number>;
    for (const f of this.flaws) out[f.kind]++;
    return out;
  }
}

/** The camp's level at the end of a run, for the report. */
export const levelOf = (sim: Simulation): string => commanderOf(sim)?.camp.level ?? 'none';
