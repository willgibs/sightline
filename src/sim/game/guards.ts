import type { Tuning } from '../../config/tuning';
import { decide, keepRoutine, react, standStill, type ActChange, type CampAnswer, type GuardMind, type MindAwareness, type NavAllowance, type Order } from '../brain';
import type { Percept } from '../perception';
import type { World } from '../kernel/world/world';
import { createBody, type BodyState } from '../body';
import type { GuardSpawn } from '../generation';
import type { GuardEntity } from './entities';
import type { Solids } from '../kernel/world/solids';

/**
 * Guards, before Phase 1 gives them senses and a brain: each keeps to his routine
 * (brain/routine.ts), a pure function of mission time, and moves with the shared motor
 * like the player, so he collides with the world, steps, slopes and makes footsteps
 * under the same rules. His brain decides from his mind alone (brain/mind.ts), in the
 * 'decide' phase, and its order moves him from the next tick (brain/orders.ts). Labs A
 * and E add perception and the brain that can pull a guard off his routine; a guard who
 * returns rejoins it where it says he should be.
 */
export interface GuardState {
  /** Which of the camp's guard spawns (world.camp.guards) this guard came from. */
  spawn: number;
  /** Head turn relative to the body. */
  headYaw: number;
  /** What his brain last ordered: carried out every tick until it orders something else. */
  order: Order;
  /** A reinforcement's own place, where he got down from the truck (comms.ts): it's where he goes back to, instead of the post he's borrowed his role from. In a camp that holds its target it's a door of his building, for the first of them, and `door` says so. */
  reserve?: { x: number; z: number; yaw: number; door?: true };
  /** He's in the way of one of the camp's own vehicles (game/escape.ts): which way to step, and until which tick. Below his brain, as a shove is: absent otherwise. */
  aside?: { x: number; z: number; until: number };
}

/** A guard's starting state, from the camp's spawn at `index`: on his post, or on the deck of his tower. */
export function createGuard(world: World, solids: Solids, index: number, tuning: Tuning): { body: BodyState; guard: GuardState } {
  const s = world.camp.guards[index]!;
  const body = createBody(world, solids, tuning.bodies.guard, s.x, s.z, s.faceX, s.faceZ, s.y);
  return { body, guard: { spawn: index, headYaw: 0, order: standStill() } };
}


type Writable<T> = { -readonly [K in keyof T]: T[K] };

const NO_PERCEPTS: readonly Percept[] = [];
const NO_ALARMS: readonly { x: number; z: number }[] = [];
export interface CampFacts {
  alarms: readonly { x: number; z: number }[];
  escape: Readonly<{ x: number; z: number }> | null;
  fights?: boolean;
  firefight?: boolean;
  hunts?: boolean;
  chases?: boolean;
  places?: boolean;
  protects?: Readonly<{ x: number; z: number; y?: number }> | null;
  answer?: CampAnswer | null;
}
const NO_FACTS: CampFacts = { alarms: NO_ALARMS, escape: null };
/** The awareness of a guard without senses: unaware, attending to nothing. */
const UNAWARE: Readonly<MindAwareness> = Object.freeze({ state: 'unaware', since: 0, focus: false, fx: 0, fy: 0, fz: 0, cause: 0, reason: 'heard' });

/**
 * What a guard's brain gets to decide from (brain/mind.ts): his own body and head, his
 * post, the static world, the time, and what perception made of the world for him: his
 * percepts, his awareness and his belief. Built here, on this side of the perception
 * boundary, from his own state; the brain never sees the rest. Writes into `out`, which is
 * reused.
 */
export function guardMind(g: GuardEntity, world: World, tuning: Tuning, tick: number, out: Writable<GuardMind>, draw: () => number = noDraw, nav: NavAllowance = noNav, facts: CampFacts = NO_FACTS): GuardMind {
  out.id = g.id;
  out.self = g.body;
  out.head = g.guard.headYaw;
  out.post = g.guard.reserve ? reservePost(world.camp.guards[g.guard.spawn]!, g.guard.reserve) : world.camp.guards[g.guard.spawn]!;
  out.world = world;
  out.tuning = tuning;
  out.tick = tick;
  out.time = tick / tuning.sim.tickHz;
  const s = g.senses;
  out.percepts = s ? s.percepts : NO_PERCEPTS;
  out.awareness = s ? s.awareness : UNAWARE;
  out.belief = s ? s.belief : null;
  out.brain = g.brain ?? null;
  out.draw = draw;
  out.nav = nav;
  out.alarms = facts.alarms;
  out.escape = facts.escape;
  out.fights = facts.fights === true;
  out.firefight = facts.firefight === true;
  out.hunts = facts.hunts === true;
  out.chases = facts.chases === true;
  out.places = facts.places === true;
  out.protects = facts.protects ?? null;
  out.answer = facts.answer ?? null;
  return out;
}

/** Reserve places made into posts, by the place in his state. Only a saving: a restored run makes them again, the same. */
const reserves = new WeakMap<object, GuardSpawn>();

/** The post a reinforcement goes back to: the one he borrowed his role from, moved to his own place, holding it. */
function reservePost(borrowed: GuardSpawn, at: { x: number; z: number; yaw: number; door?: true }): GuardSpawn {
  let post = reserves.get(at);
  if (!post) {
    const { routine } = borrowed;
    post = { ...borrowed, x: at.x, z: at.z, route: null, routine: { ...routine, offset: undefined, legs: [{ kind: 'hold', t0: 0, t1: routine.period, x: at.x, z: at.z, yawFrom: at.yaw, yawTo: at.yaw }] }, ...(at.door ? { holdsDoor: true as const } : {}) };
    reserves.set(at, post);
  }
  return post;
}

/** A mind for guardMind to fill: every field is written on each use. */
export function emptyMind(): Writable<GuardMind> {
  const unset = null as never;
  return { fights: false, firefight: false, hunts: false, chases: false, places: false, protects: null, answer: null, id: 0, self: unset, head: 0, post: unset, world: unset, tuning: unset, tick: 0, time: 0, percepts: NO_PERCEPTS, awareness: UNAWARE, belief: null, brain: null, draw: noDraw, nav: noNav, alarms: NO_ALARMS, escape: null };
}

const noDraw = (): number => {
  throw new Error('This mind has no stream to draw from');
};
const noNav: NavAllowance = { work: undefined, searches: { left: 0 }, nodesAtStart: 0, raysAtStart: 0 };

/** Scratch: the mind a guard's brain decides from, rewritten for each decision. */
const mind = emptyMind();

/**
 * A guard's brain decides his order for `tick` (the one after now) from his mind alone:
 * with a brain, lab E's (brain/brain.ts); with senses, lab A's minimal reactions to his
 * awareness (which keep to the routine while he's unaware); without, the routine. Writes the
 * order into his state, and returns the change of what he's doing, if any, to emit.
 */
export function think(g: GuardEntity, world: World, tuning: Tuning, tick: number, draw?: () => number, nav?: NavAllowance, facts?: CampFacts): ActChange | null {
  const m = guardMind(g, world, tuning, tick, mind, draw, nav, facts);
  if (g.brain) return decide(m, g.guard.order);
  if (g.senses) react(m, g.guard.order);
  else keepRoutine(m, g.guard.order);
  return null;
}
