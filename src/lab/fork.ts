import type { Tuning } from '../config/tuning';
import { groundBelow } from '../sim/body';
import { commanderOf } from '../sim/game/comms';
import { behaviourInto } from '../sim/game/runs';
import { CAMP_SWITCHES, parseSwitches, switchedOff, takeAway, type CampSwitch } from '../sim/game/switches';
import { SIGHTLINE, type Simulation } from '../sim/game/sim';
import { Hasher } from '../sim/kernel/core/hash';
import { diffStates, show, type Difference } from '../sim/kernel/diff';
import type { SimEvent } from '../sim/kernel/events';
import { neutralInput } from '../sim/kernel/input';
import type { Recording } from '../sim/kernel/record/recording';
import { replaySimulation } from '../sim/kernel/record/resim';
import { sceneOver, sceneTicks, startScene, type Driver, type Scene } from '../sim/kernel/scene';
import { Cell, cellIndex } from '../sim/kernel/world/grid';
import { CampGauges, type Readings } from './gauges';

/**
 * What if (Lab F, docs/camp-engine.md): a run, forked at a tick, with one thing changed.
 *
 * A fork is re-simulation plus one intervention. Every run starts again from tick 0, with
 * a fresh driver or the recorded inputs, plays to the fork, has its one change made
 * between two ticks, and goes on. It doesn't restore mid-run, because a restore can't
 * reach what a run keeps outside the state: bots remember what they planned, `Recorder`
 * refuses to start at a later tick, and `restore` keeps the tuning and the work counts.
 * Starting again costs a few seconds and has no such traps. A branch that changes nothing
 * is the same run, bit for bit, and a test holds it to that.
 *
 * A branch is an instrument's change to the world, so it isn't a recording: rule 5 needs
 * everything that affects the state to flow through the input or the mission, and this
 * doesn't. It's for asking questions.
 *
 * Recorded inputs go on being what they were after the fork, the same hands on the same
 * keys, whatever has changed. To ask what a bot would have done, fork a run with a driver.
 */

/** One change to a run, made once, between two ticks. */
export interface Intervention {
  /** In words, for the report. */
  name: string;
  /** What must be in place from the first tick for the change to happen at the fork: nothing before the fork may differ. */
  scene?(scene: Scene<Simulation>, at: number): Scene<Simulation>;
  /** Makes the change, once tick `sim.tick` has run. */
  apply(sim: Simulation): void;
  /** What drives the player from the fork on, if not the run's own driver. */
  driver?(): Driver<Simulation>;
}

/** Changes nothing: a run forked with this one is the same run, bit for bit. */
export function noChange(): Intervention {
  return { name: 'nothing', apply: () => {} };
}

/**
 * Moves the player's body to (x, z) as it stands: same stance, same facing, feet on the
 * ground there. Instant, so it's what being elsewhere is worth, without the cost of going
 * there. Moving to where the body already is changes nothing.
 */
export function movePlayer(x: number, z: number): Intervention {
  return { name: `move the player to (${x.toFixed(0)}, ${z.toFixed(0)})`, apply: (sim) => placeBody(sim, x, z) };
}

/** Moves the player `metres` square across the line of fire (+ to the shooter's right, as he faces the camp), to the nearest open ground there. */
export function moveAcross(metres: number): Intervention {
  return {
    name: `move ${Math.abs(metres)} m across the line of fire`,
    apply(sim) {
      const p = sim.player;
      const site = sim.world.camp.site;
      const dx = site.x - p.x;
      const dz = site.z - p.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      // Right of the way he faces is (−dz, dx) in a world where yaw 0 faces −z.
      const at = openGround(sim, p.x + (-dz / len) * metres, p.z + (dx / len) * metres);
      placeBody(sim, at.x, at.z);
    },
  };
}

function placeBody(sim: Simulation, x: number, z: number): void {
  const b = sim.player;
  const dx = x - b.x;
  const dz = z - b.z;
  if (dx === 0 && dz === 0) return;
  const spec = sim.tuning.bodies.player;
  const there = groundBelow(sim.world, sim.solids, x, z, sim.world.terrain.heightAt(x, z) + spec.stepHeight, spec.radius);
  const dy = there.height - b.y;
  b.x = x;
  b.y += dy;
  b.z = z;
  b.surface = there.surface;
  b.standingOn = there.collider;
  // A shot resolved against the last two ticks' poses (body/body.ts) mustn't leave from the old place.
  for (const h of b.history) {
    h.x += dx;
    h.y += dy;
    h.z += dz;
  }
}

/** The nearest ground to (x, z) where a body fits, lying down too: an open 3 by 3 of map cells. Throws if there's none within 30 m. */
export function openGround(sim: Simulation, x: number, z: number): { x: number; z: number } {
  const L = sim.world.grid.map;
  const half = sim.world.playHalf;
  const walkable = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < L.nx && j < L.nz && (L.flags[j * L.nx + i]! & Cell.Walkable) !== 0;
  const open = (i: number, j: number): boolean => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!walkable(i + di, j + dj)) return false;
    return true;
  };
  const c = cellIndex(L, x, z);
  if (c < 0) throw new Error(`(${x.toFixed(0)}, ${z.toFixed(0)}) is outside the world`);
  const ii = c % L.nx;
  const jj = Math.floor(c / L.nx);
  const rings = Math.ceil(30 / L.cell);
  for (let r = 0; r <= rings; r++) {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (let j = jj - r; j <= jj + r; j++) {
      for (let i = ii - r; i <= ii + r; i++) {
        if (Math.max(Math.abs(i - ii), Math.abs(j - jj)) !== r || !open(i, j)) continue;
        const px = L.x0 + (i + 0.5) * L.cell;
        const pz = L.z0 + (j + 0.5) * L.cell;
        if (Math.abs(px) > half || Math.abs(pz) > half) continue;
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bestD) {
          bestD = d;
          best = { x: px, z: pz };
        }
      }
    }
    if (best) return best;
  }
  throw new Error(`Nowhere to stand within 30 m of (${x.toFixed(0)}, ${z.toFixed(0)})`);
}

/**
 * Takes a guard out of the run: no body, no gap in the roster, as if he had never been
 * posted. (Shooting him is a different question, and the rifle asks it.) By entity id, or
 * by role for the first of that role still standing. The target can't be taken: the
 * objective is his.
 */
export function removeGuard(who: number | string): Intervention {
  return {
    name: `remove guard ${who}`,
    apply(sim) {
      const g = typeof who === 'number' ? sim.guards.find((e) => e.id === who) : sim.guards.find((e) => sim.world.camp.guards[e.guard.spawn]?.role === who);
      if (!g) throw new Error(`There's no guard ${who} standing at tick ${sim.tick}`);
      const camp = commanderOf(sim)?.camp;
      if (camp?.objective?.target === g.id) throw new Error(`Guard ${g.id} is the target: the objective is his`);
      sim.despawn(g.id);
      if (camp) {
        camp.roster = camp.roster.filter((m) => m.id !== g.id);
        for (const t of camp.tasks) t.assigned = t.assigned.filter((id) => id !== g.id);
        if (camp.checkins.pending?.guard === g.id) camp.checkins.pending = null;
      }
    },
  };
}

/** Switches parts of the camp off from the fork on (game/switches.ts). A part that has already done its work has done it. */
export function switchOff(parts: readonly CampSwitch[]): Intervention {
  return {
    name: `switch off ${parts.join(', ')}`,
    scene: (scene, at) => switchedOff(scene, parts, at),
    apply: (sim) => takeAway(sim, parts),
  };
}

/** Sets one number in the tuning from the fork on. What's derived from it once, at the start of a run, stays as it was. */
export function patchNumber(path: string, value: number): Intervention {
  return {
    name: `set ${path} to ${value}`,
    apply: (sim) => sim.setTuning(patched(sim.tuning, path, value)),
  };
}

/** A copy of the tuning with one number changed. */
export function patched(tuning: Tuning, path: string, value: number): Tuning {
  if (/^(gen\.|sim\.(tickHz|recordHz|dice)$)/.test(path)) throw new Error(`'${path}' is fixed for a run: changing it means another valley, another rate or other dice, not a fork`);
  if (!Number.isFinite(value)) throw new Error(`'${value}' isn't a number`);
  const copy = structuredClone(tuning) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let at: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) {
    const next = at[key];
    if (next === null || typeof next !== 'object') throw new Error(`The tuning has no '${path}'`);
    at = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  if (typeof at[last] !== 'number') throw new Error(`The tuning has no number at '${path}'`);
  at[last] = value;
  return copy as unknown as Tuning;
}

/**
 * An intervention from the command line (`npm run whatif`):
 *   none              nothing
 *   move:<metres>     across the line of fire (negative: the other way)
 *   move:<x>,<z>      to a place
 *   remove:<id|role>  a guard
 *   off:<part,part>   parts of the camp: commander, radio, alarm, truck, reinforce, power
 *   patch:<path>=<n>  a number in the tuning
 */
export function parseIntervention(text: string): Intervention {
  const [kind, arg = ''] = splitOnce(text, ':');
  if (kind === 'none') return noChange();
  if (kind === 'move') {
    const parts = arg.split(',').map(Number);
    if (parts.some((n) => !Number.isFinite(n)) || parts.length > 2) throw new Error(`move takes metres or x,z, not '${arg}'`);
    return parts.length === 1 ? moveAcross(parts[0]!) : movePlayer(parts[0]!, parts[1]!);
  }
  if (kind === 'remove') return removeGuard(/^\d+$/.test(arg) ? Number(arg) : arg);
  if (kind === 'off') {
    const parts = parseSwitches(arg);
    if (parts.length === 0) throw new Error(`off takes parts of the camp: ${CAMP_SWITCHES.join(', ')}`);
    return switchOff(parts);
  }
  if (kind === 'patch') {
    const [path, value] = splitOnce(arg, '=');
    return patchNumber(path, Number(value));
  }
  throw new Error(`There's no intervention called '${kind}': none, move, remove, off, patch`);
}

function splitOnce(text: string, by: string): [string, string] {
  const at = text.indexOf(by);
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)];
}

/** A run being played. */
export interface LiveRun {
  readonly sim: Simulation;
  /** Plays one tick and returns its events (the simulation's array: read them before the next tick). */
  step(): readonly SimEvent[];
  /** Whether it has reached its end, or the rules have decided. */
  readonly over: boolean;
  /** Puts a new driver at the controls. */
  drive(driver: Driver<Simulation>): void;
}

/** A run that can be played again from the start, as many times as there are branches. */
export interface RunSource {
  readonly name: string;
  /** A fresh run from tick 0, set up for this intervention at this fork (or none). */
  begin(change: Intervention | null, at: number): LiveRun;
}

/** A scene, played by its own driver or one given (`driver`), for its own length or `seconds`. */
export function sceneRun(scene: Scene<Simulation>, tuning: Tuning, opts: { seconds?: number; driver?: () => Driver<Simulation> } = {}): RunSource {
  // Built once: a world doesn't change, and the scene may keep it for its setup and driver.
  const world = scene.world(tuning);
  const ticks = sceneTicks(scene, tuning, opts.seconds);
  return {
    name: `${scene.name}${scene.params ? ` (${scene.params})` : ''}`,
    begin(change, at) {
      const sim = startScene(change?.scene?.(scene, at) ?? scene, tuning, world);
      let driver: Driver<Simulation> | undefined = opts.driver?.() ?? scene.driver?.();
      const raw = scene.game.still(sim);
      return {
        sim,
        step: () => sim.step(driver ? driver.next(sim, raw) : raw),
        get over() {
          return sceneOver(scene, sim, ticks);
        },
        drive(d) {
          driver = d;
        },
      };
    },
  };
}

/** A recording, re-simulated from its own inputs (and tuning changes). Pass the scene it names, if it was made in one. */
export function recordingRun(rec: Recording, scene?: Scene<Simulation>): RunSource {
  const h = rec.header;
  const world = scene ? scene.world(h.tuning) : SIGHTLINE.world(h.mission, h.tuning);
  return {
    name: scene ? `${scene.name}${scene.params ? ` (${scene.params})` : ''}, recorded` : `recording of ${h.mission.seed}`,
    begin(change, at) {
      const made = replaySimulation<Simulation>(rec, { game: SIGHTLINE, world, scene: scene ? (change?.scene?.(scene, at) ?? scene) : undefined });
      if (typeof made === 'string') throw new Error(`This recording can't be re-simulated: ${made}`);
      const sim = made;
      const changes = rec.tuningChanges();
      const input = neutralInput();
      const raw = SIGHTLINE.still(sim);
      let driver: Driver<Simulation> | null = null;
      let i = 0;
      let next = 0;
      return {
        sim,
        step() {
          while (next < changes.length && changes[next]!.tick === sim.tick + 1) sim.setTuning(changes[next++]!.tuning);
          rec.readInput(i++, input);
          return sim.step(driver ? driver.next(sim, raw) : input);
        },
        get over() {
          return i >= h.ticks;
        },
        drive(d) {
          driver = d;
        },
      };
    },
  };
}

/** Plays a run from the start until `when` holds: that tick, or null if it never does. */
export function firstTick(run: RunSource, when: (sim: Simulation, events: readonly SimEvent[]) => boolean): number | null {
  const live = run.begin(null, 0);
  while (!live.over) {
    const events = live.step();
    if (when(live.sim, events)) return live.sim.tick;
  }
  return null;
}

/** How one branch came out. */
export interface Outcome {
  name: string;
  /** The tick it ended on. */
  ticks: number;
  /** 'playing' if the time ran out first. */
  status: string;
  reason: string;
  /** Hits the player took. */
  hits: number;
  readings: Readings;
  /** The state's hash at the end, and every tick's observable behaviour, as `npm run explain` hashes it. */
  finalHash: string;
  behaviour: string;
  /** Why it stopped, if a tick threw. */
  fault: string | null;
}

/** Where a branch first parts from the run it forked from. */
export interface Divergence {
  /** The first tick the state differs (the fork itself if the change touched the state then), with what differs. */
  state: { tick: number; paths: Difference[] } | null;
  /** The first tick any guard stood or moved differently: the world's first reaction. */
  guard: { tick: number; id: number; role: string } | null;
  /** The first thing anyone but the player did differently, and which run did it. */
  event: { tick: number; run: 'base' | 'branch'; what: string } | null;
}

export interface BranchReport extends Outcome {
  differs: Divergence;
}

export interface ForkReport {
  run: string;
  at: number;
  tickHz: number;
  base: Outcome;
  branches: BranchReport[];
}

/** A run under way, counting what the report needs. */
class Play {
  readonly gauges: CampGauges;
  private readonly hasher = new Hasher();
  last: readonly SimEvent[] = [];
  fault: string | null = null;

  constructor(
    readonly name: string,
    readonly live: LiveRun,
  ) {
    this.gauges = new CampGauges(live.sim);
  }

  get sim(): Simulation {
    return this.live.sim;
  }

  get done(): boolean {
    return this.fault !== null || this.live.over;
  }

  step(): void {
    try {
      this.last = this.live.step();
    } catch (e) {
      this.last = [];
      this.fault = e instanceof Error ? e.message : String(e);
      return;
    }
    behaviourInto(this.hasher, this.sim, this.last);
    this.gauges.observe(this.sim, this.last);
  }

  outcome(): Outcome {
    const sim = this.sim;
    const you = sim.index.of('player')[0];
    return {
      name: this.name,
      ticks: sim.tick,
      status: sim.state.outcome.status,
      reason: sim.state.outcome.reason,
      hits: you?.health?.hits ?? 0,
      readings: this.gauges.read(sim),
      finalHash: sim.hash(),
      behaviour: this.hasher.digest(),
      fault: this.fault,
    };
  }
}

function play(name: string, source: RunSource, change: Intervention | null, at: number): Play {
  return new Play(name, source.begin(change, at));
}

/** Plays every run to the fork together, and checks they have one past. */
function toTheFork(runs: readonly Play[], at: number): void {
  const first = runs[0]!;
  while (first.sim.tick < at) {
    if (first.done) throw new Error(`The run ended at tick ${first.sim.tick}, before the fork at tick ${at}`);
    for (const r of runs) r.step();
  }
  const past = first.sim.hash();
  for (const r of runs) if (r.sim.hash() !== past) throw new Error(`'${r.name}' reached the fork in a different state: something depends on more than the state and the input`);
}

const eventText = (e: SimEvent): string => {
  const { id: _id, cause: _cause, ...rest } = e as unknown as Record<string, unknown>;
  return JSON.stringify(rest);
};

const roleOf = (sim: Simulation, spawn: number): string => sim.world.camp.guards[spawn]?.role ?? 'guard';

/** Notes the first time a branch's state, a guard or an event differs from the base. Each is looked for only until it's found. */
function compare(base: Play, branch: Play, d: Divergence): void {
  const a = base.sim;
  const b = branch.sim;
  if (!d.state && a.hash() !== b.hash()) d.state = { tick: b.tick, paths: diffStates(a.state, b.state, 12) };
  if (!d.state) return;
  if (!d.guard) {
    const other = new Map(b.guards.map((g) => [g.id, g]));
    for (const g of a.guards) {
      const h = other.get(g.id);
      if (!h || h.body.x !== g.body.x || h.body.z !== g.body.z || h.body.yaw !== g.body.yaw || h.guard.headYaw !== g.guard.headYaw) {
        d.guard = { tick: b.tick, id: g.id, role: roleOf(a, g.guard.spawn) };
        break;
      }
    }
    if (!d.guard && b.guards.length > a.guards.length) {
      const g = b.guards.find((e) => !a.guards.some((f) => f.id === e.id))!;
      d.guard = { tick: b.tick, id: g.id, role: roleOf(b, g.guard.spawn) };
    }
  }
  if (!d.event) {
    const you = a.playerId;
    const theirs = (events: readonly SimEvent[]): SimEvent[] => events.filter((e) => e.source !== you);
    const x = theirs(base.last);
    const y = theirs(branch.last);
    for (let k = 0; k < Math.max(x.length, y.length); k++) {
      const p = x[k] ? eventText(x[k]!) : null;
      const q = y[k] ? eventText(y[k]!) : null;
      if (p !== q) {
        d.event = { tick: b.tick, run: q === null ? 'base' : 'branch', what: (q ?? p)! };
        break;
      }
    }
  }
}

/**
 * Forks a run at tick `at`: the run as it was, and one branch per intervention, each
 * compared with it tick by tick. They run together, so each comparison reads both
 * simulations as they stand.
 */
export function forkRun(source: RunSource, at: number, changes: readonly Intervention[]): ForkReport {
  const base = play('as it was', source, null, at);
  const branches = changes.map((c) => ({ change: c, run: play(c.name, source, c, at), differs: { state: null, guard: null, event: null } as Divergence }));
  toTheFork([base, ...branches.map((b) => b.run)], at);
  for (const b of branches) {
    b.change.apply(b.run.sim);
    const driver = b.change.driver?.();
    if (driver) b.run.live.drive(driver);
    compare(base, b.run, b.differs);
  }
  for (;;) {
    let running = false;
    if (!base.done) {
      base.step();
      running = true;
    }
    for (const b of branches) {
      if (b.run.done) continue;
      b.run.step();
      running = true;
      if (b.run.sim.tick === base.sim.tick) compare(base, b.run, b.differs);
    }
    if (!running) break;
  }
  return {
    run: source.name,
    at,
    tickHz: base.sim.tuning.sim.tickHz,
    base: base.outcome(),
    branches: branches.map((b) => ({ ...b.run.outcome(), differs: b.differs })),
  };
}

/** One branch alone, with no base to compare it with: what an experiment's arm needs. `watch` is called after every tick. */
export function playBranch(source: RunSource, at: number, change: Intervention, watch?: (sim: Simulation, events: readonly SimEvent[]) => void): Outcome {
  const run = play(change.name, source, change, at);
  while (run.sim.tick < at) {
    if (run.done) throw new Error(`The run ended at tick ${run.sim.tick}, before the fork at tick ${at}`);
    run.step();
    watch?.(run.sim, run.last);
  }
  change.apply(run.sim);
  const driver = change.driver?.();
  if (driver) run.live.drive(driver);
  while (!run.done) {
    run.step();
    watch?.(run.sim, run.last);
  }
  return run.outcome();
}

const seconds = (tick: number, hz: number): string => `${(tick / hz).toFixed(1)} s`;
const fixed = (x: number): string => (Number.isFinite(x) ? x.toFixed(0) : '–');

/** A fork's report, as plain text: the outcome of each branch, then where each first parted from the run. */
export function formatFork(r: ForkReport): string {
  const runs: Outcome[] = [r.base, ...r.branches];
  const row = (label: string, f: (o: Outcome) => string): string[] => [label, ...runs.map(f)];
  const rows = [
    ['', ...runs.map((o) => o.name)],
    row('ended', (o) => `${o.status}${o.fault ? ' (fault)' : ''}, ${seconds(o.ticks, r.tickHz)}`),
    row('why', (o) => o.fault ?? (o.reason || '–')),
    row('guards down', (o) => String(o.readings.guardsDown)),
    row('guards standing', (o) => String(o.readings.guardsStanding)),
    row('shots fired', (o) => String(o.readings.shotsFired)),
    row('rounds at him', (o) => String(o.readings.roundsAtYou)),
    row('hits on him', (o) => String(o.hits)),
    row('detected', (o) => (o.readings.detected ? 'yes' : 'no')),
    row('nearest guard (m)', (o) => fixed(o.readings.nearestEver)),
    row('estimate off (m)', (o) => fixed(o.readings.estimateOff)),
    row('camp level', (o) => o.readings.level),
    row('siren', (o) => (o.readings.siren ? 'yes' : 'no')),
    row('target', (o) => o.readings.targetStatus),
  ];
  const widths = rows[0]!.map((_, k) => Math.max(...rows.map((c) => c[k]!.length)));
  const line = (c: readonly string[]): string => c.map((v, k) => (k === 0 ? v.padEnd(widths[k]!) : v.padStart(widths[k]!))).join('  ');
  const out = [`What if: ${r.run}, forked after tick ${r.at} (${seconds(r.at, r.tickHz)}).`, '', ...rows.map(line), ''];
  for (const b of r.branches) {
    out.push(`${b.name}:`);
    if (!b.differs.state && b.finalHash === r.base.finalHash && b.behaviour === r.base.behaviour) {
      out.push('  no difference: the same run, bit for bit.', '');
      continue;
    }
    const s = b.differs.state;
    if (s) {
      out.push(`  the state first differs after tick ${s.tick} (${seconds(s.tick, r.tickHz)}):`);
      // A body's recent poses move with it: what's worth reading comes first.
      const paths = [...s.paths.filter((p) => !p.path.includes('.history[')), ...s.paths.filter((p) => p.path.includes('.history['))];
      for (const p of paths.slice(0, 6)) out.push(`    ${p.path}: ${show(p.from)} → ${show(p.to)}`);
      if (paths.length > 6) out.push(`    and at least ${paths.length - 6} more`);
    }
    const g = b.differs.guard;
    out.push(g ? `  the first guard to do anything differently: tick ${g.tick} (${seconds(g.tick, r.tickHz)}), guard ${g.id}, ${g.role}` : '  no guard did anything differently');
    const e = b.differs.event;
    out.push(e ? `  the first thing that happened differently, in the ${e.run === 'base' ? 'run as it was' : 'branch'}: tick ${e.tick} (${seconds(e.tick, r.tickHz)}): ${e.what}` : '  nobody else did anything differently');
    out.push('');
  }
  return out.join('\n');
}
