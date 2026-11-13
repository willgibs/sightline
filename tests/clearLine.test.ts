import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { giveBrains } from '../src/sim/game/brains';
import { commanderOf, giveCommander } from '../src/sim/game/comms';
import { player } from '../src/sim/game/entities';
import { giveSenses } from '../src/sim/game/perception';
import { Simulation } from '../src/sim/game/sim';
import { SYSTEMS } from '../src/sim/game/systems';
import type { SimEvent } from '../src/sim/kernel/events';
import { neutralInput } from '../src/sim/kernel/input';
import { Blocks, type ColliderInput } from '../src/sim/kernel/world/colliders';
import { Surface } from '../src/sim/kernel/world/surfaces';
import { testGuard, testWorld } from './fixtures';

/**
 * A clear line (step 2e; brain/firefight.ts, `clearLine`): a man whose round is held for one
 * of his own in front of his rifle shifts a pace sideways for a clear line, fires the rest of
 * his burst from there, and is back on his position's own places when he gets down. He goes
 * by what he saw over his sights when the round was held, and no more.
 *
 * A flat, open world: two men in a line, facing east, and an intruder standing in the open
 * beyond them. Nothing to hide behind, so each fights from where he stands.
 */

const HZ = T.sim.tickHz;
const X = T.brain.firefight.shift;
const RANGE = 40;
/** Long enough for the man behind to make out the intruder past the man in front and fight several bursts. */
const SECONDS = 50;

interface Line {
  /** The man behind, and the man in front of him. */
  rear: { x: number; z: number };
  front: { x: number; z: number };
  shifts?: boolean;
  walls?: ColliderInput[];
  /** List the man in front first, so that the ids go the other way. */
  frontFirst?: boolean;
}

interface Fought {
  events: SimEvent[];
  rear: number;
  front: number;
  /** The farthest the rear man got from where he began, metres. */
  farthest: number;
  /** Where the man in front stood at each of the rear man's rounds, and that round's line. */
  rounds: { x: number; y: number; z: number; dx: number; dy: number; dz: number; fx: number; fz: number }[];
  /** Times the rear man got down from being up, and ticks on which he had a shift in mind or a held line, by what he remembers. */
  downs: number;
  shifting: number;
  sim: Simulation;
}

function fight(o: Line): Fought {
  const post = { y: 0, faceX: 1, faceZ: 0, elevated: false, route: null, routeStart: 0, scanPhase: 0, scanScale: 0 };
  const spawns = [testGuard({ id: 0, role: 'sentry', x: o.rear.x, z: o.rear.z, ...post }), testGuard({ id: 1, role: 'sentry', x: o.front.x, z: o.front.z, ...post })];
  if (o.frontFirst) spawns.reverse();
  const world = testWorld({ size: 200, spawn: { x: RANGE, z: 0, faceX: -1, faceZ: 0 }, colliders: o.walls ?? [], camp: { structures: [], guards: spawns, fenceHalf: 0 } });
  const sim = new Simulation(world, T, SYSTEMS);
  giveSenses(sim);
  giveBrains(sim);
  giveCommander(sim);
  const camp = commanderOf(sim)!.camp;
  camp.fights = true;
  camp.firefight = true;
  camp.mates = true;
  if (o.shifts !== false) camp.shifts = true;
  const at = (p: { x: number; z: number }): number => sim.guards.find((g) => g.body.x === p.x && g.body.z === p.z)!.id;
  const rear = at(o.rear);
  const front = at(o.front);
  const you = player(sim.index);
  you.health = { hits: -1e9 };
  const out: Fought = { events: [], rear, front, farthest: 0, rounds: [], downs: 0, shifting: 0, sim };
  let up = false;
  for (let i = 0; i < SECONDS * HZ; i++) {
    const events = sim.step(neutralInput()).map((e) => ({ ...e }));
    out.events.push(...events);
    const r = sim.index.get(rear) as { body: { x: number; z: number } };
    const f = sim.index.get(front) as { body: { x: number; z: number } };
    out.farthest = Math.max(out.farthest, Math.hypot(r.body.x - o.rear.x, r.body.z - o.rear.z));
    const b = (sim.index.get(rear) as { brain: { ff?: { up: boolean; shift?: unknown }; heldLine?: unknown } }).brain;
    if (up && b.ff?.up !== true) out.downs++;
    up = b.ff?.up === true;
    if (b.ff?.shift !== undefined || b.heldLine !== undefined) out.shifting++;
    for (const e of events) if (e.type === 'shot' && e.source === rear) out.rounds.push({ x: e.x, y: e.y, z: e.z, dx: e.dx, dy: e.dy, dz: e.dz, fx: f.body.x, fz: f.body.z });
  }
  return out;
}

const of = <K extends SimEvent['type']>(events: SimEvent[], type: K, source: number): Extract<SimEvent, { type: K }>[] =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type && e.source === source);

/** The first round of his after his first held round, in seconds after it; Infinity if none. */
function firedAfterHold(f: Fought): number {
  const hold = f.events.find((e) => (e.type === 'held' || e.type === 'shift') && e.source === f.rear);
  if (!hold) return Infinity;
  const next = f.events.find((e) => e.type === 'shot' && e.source === f.rear && e.tick > hold.tick);
  return next ? (next.tick - hold.tick) / HZ : Infinity;
}

/** How near a round's line came to the middle of the man in front, level with the ground, less the widest of his parts (his torso). */
function gap(r: Fought['rounds'][number]): number {
  const l = Math.hypot(r.dx, r.dz) || 1;
  const hx = r.dx / l;
  const hz = r.dz / l;
  return Math.abs((r.fx - r.x) * -hz + (r.fz - r.z) * hx) - T.bodies.player.parts.torsoRadius;
}

/** A wall taller than a man along the way east, at z, from x0 to x1. */
function wall(z: number, x0: number, x1: number): ColliderInput {
  return { kind: 'box', x: (x0 + x1) / 2, z, y0: -0.3, y1: 2.4, hx: (x1 - x0) / 2, hz: 0.1, ux: 1, uz: 0, flags: Blocks.All, surface: Surface.Rock };
}

describe('a clear line', () => {
  it('shifts a man whose round is held a pace aside, no farther than the cap, and he fires within a few seconds, clear of the man in front', () => {
    const f = fight({ rear: { x: 0, z: 0 }, front: { x: 10, z: 0.45 } });
    const held = of(f.events, 'held', f.rear);
    const shifts = of(f.events, 'shift', f.rear);
    expect(held.length, 'a round of his was held').toBeGreaterThan(0);
    expect(shifts.length, 'and he shifted for it').toBeGreaterThan(0);
    // Away from the man in front: he stands to the right of the line (south of it, looking east), so the pace is to the left.
    expect(held[0]!.side).toBe(1);
    expect(shifts[0]!.side).toBe(-1);
    expect(shifts[0]!.mate).toBe(f.front);
    for (const s of shifts) expect(s.pace).toBeLessThanOrEqual(X.cap);
    expect(f.farthest).toBeLessThanOrEqual(X.cap + T.brain.firefight.near);
    expect(firedAfterHold(f)).toBeLessThanOrEqual(3);
    expect(f.rounds.length).toBeGreaterThan(0);
    for (const r of f.rounds) expect(gap(r), 'a round of his passing the man in front').toBeGreaterThan(T.brain.fight.mates.clear);
    expect(f.events.some((e) => e.type === 'death' && e.source !== f.sim.playerId)).toBe(false);
  }, 120_000);

  it('never shifts him with the switch off: he holds and waits', () => {
    const f = fight({ rear: { x: 0, z: 0 }, front: { x: 10, z: 0.45 }, shifts: false });
    expect(of(f.events, 'held', f.rear).length).toBeGreaterThan(0);
    expect(of(f.events, 'shift', f.rear)).toHaveLength(0);
    expect(f.shifting, 'ticks he had a shift or a held line in mind').toBe(0);
  }, 120_000);

  it('holds a man against a wall with nowhere to shift to, and he gets down as before', () => {
    // The man in front is to his right, so the pace is to his left, and a wall a hand's width away takes it.
    const f = fight({ rear: { x: 0, z: 0 }, front: { x: 10, z: 0.45 }, walls: [wall(-0.55, -3, 3)] });
    const held = of(f.events, 'held', f.rear);
    expect(held.length).toBeGreaterThanOrEqual(T.brain.firefight.burst);
    expect(of(f.events, 'shift', f.rear)).toHaveLength(0);
    // His held rounds count toward his burst: a burst of them, and he gets down, every time.
    expect(f.downs).toBeGreaterThanOrEqual(Math.floor(held.length / T.brain.firefight.burst));
    expect(of(f.events, 'shot', f.rear)).toHaveLength(0);
  }, 120_000);

  it('dead on the line, takes the side his id gives him, so a column fans out', () => {
    for (const frontFirst of [false, true]) {
      const f = fight({ rear: { x: 0, z: 0 }, front: { x: 10, z: 0 }, frontFirst });
      const shifts = of(f.events, 'shift', f.rear);
      expect(shifts.length, `the man behind, id ${f.rear}`).toBeGreaterThan(0);
      expect(shifts[0]!.side).toBe(f.rear % 2 === 0 ? 1 : -1);
    }
  }, 120_000);
});
