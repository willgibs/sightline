import type { Stance } from '../../body';
import { TWO_PI, datan2 } from '../../kernel/core/detmath';
import { turnTowards } from '../../kernel/core/math';
import type { Rng } from '../../kernel/core/rng';
import { Optic, type InputFrame } from '../../kernel/input';
import type { Angles, PlayerView, SeenMan, ViewBot } from './playerView';

/**
 * A shooter limited to what a person can do (Lab F, docs/camp-engine.md, section 7),
 * deciding from the player's view alone (playerView.ts). Finding a man takes seconds,
 * ranging him takes seconds, settling on him takes seconds. He lases with the real
 * rangefinder, holds his real breath and fires with the real rifle, through the same
 * inputs a player gives. He misses: every press has an error from his own stream, and he
 * doesn't take out the sway the way a machine could. He can engage only who he can see.
 *
 * The plans on the ladder are built from one way of shooting and one way of walking. All
 * numbers here are the bots', not the game's, so they aren't in the tuning: starting
 * values, to be set against real sittings (`npm run playtest`).
 */

/** How a person does things: seconds as [least, most], errors in mil, one standard deviation. */
export interface Skill {
  /** To pick someone out of the scene. */
  find: readonly [number, number];
  /** To bring the glass onto him and tell who he is. */
  look: readonly [number, number];
  /** Binoculars up, lase, read it, binoculars down. */
  range: readonly [number, number];
  /** From on him to the press: reading the hold, settling, the breath. */
  hold: readonly [number, number];
  /** After the bolt: seeing what happened. */
  assess: readonly [number, number];
  /** The press itself, on a man standing still at a known range, each way. */
  pressMil: number;
  /** How much of a walking man's lead he gets wrong. */
  leadShare: number;
  /** Extra elevation error if he never lased the range. */
  byEyeMil: number;
  /** How fast he swings his view, radians a second. */
  turn: number;
}

/** A careful player who knows the game: the shooter decisions rest on. */
export const PERSON: Skill = {
  find: [2, 6],
  look: [1, 2.5],
  range: [2, 4],
  hold: [1.5, 3.5],
  assess: [0.5, 1.5],
  pressMil: 0.35,
  leadShare: 0.3,
  byEyeMil: 0.5,
  turn: 1.5,
};

/** Someone who doesn't take his time. */
export const HASTY: Skill = {
  find: [0.6, 2],
  look: [0.4, 1],
  range: [2, 4],
  hold: [0.4, 1.2],
  assess: [0.3, 1],
  pressMil: 1.2,
  leadShare: 0.6,
  byEyeMil: 1,
  turn: 2.5,
};

/** Time the bolt takes, as a person learns it: the rifle's own is in the tuning, and he doesn't read the tuning. */
const BOLT = 1.3;
/** The bullet's rough speed, for reckoning a lead. */
const ROUGH_SPEED = 760;
/** How close another man must be to spoil a clean moment, metres. */
const WITNESS = 22;
/** How long he remembers having looked at a man and ruled him out, seconds. */
const REMEMBER = 40;
/** Seconds to pick out a man he has already made out, when he comes back into view. */
const RECOGNISE: readonly [number, number] = [0.4, 1.2];

/** Where the view is going and what's in the hands: a person moves these over time. */
class Hands {
  yaw = NaN;
  pitch = NaN;
  optic: number = Optic.None;
  private readonly want: Angles = { yaw: NaN, pitch: NaN };

  constructor(private readonly skill: Skill) {}

  begin(view: PlayerView, out: InputFrame): void {
    if (Number.isNaN(this.yaw)) {
      this.yaw = view.you.yaw;
      this.pitch = view.you.pitch;
      this.want.yaw = this.yaw;
      this.want.pitch = this.pitch;
    }
    out.moveX = 0;
    out.moveZ = 0;
    out.sprint = false;
    out.crouch = false;
    out.prone = false;
    out.breath = false;
    out.lean = 0;
    out.use = false;
    out.commands = [];
  }

  face(a: Angles): void {
    this.want.yaw = a.yaw;
    this.want.pitch = a.pitch;
  }

  faceYaw(yaw: number, pitch = 0): void {
    this.want.yaw = yaw;
    this.want.pitch = pitch;
  }

  /** Puts the view on the spot, as a shot's frame must be. */
  snap(a: Angles): void {
    this.yaw = a.yaw;
    this.pitch = a.pitch;
    this.want.yaw = a.yaw;
    this.want.pitch = a.pitch;
  }

  end(view: PlayerView, out: InputFrame): InputFrame {
    const step = this.skill.turn * view.dt;
    this.yaw = turnTowards(this.yaw, this.want.yaw, step);
    const dp = this.want.pitch - this.pitch;
    this.pitch += Math.abs(dp) <= step ? dp : Math.sign(dp) * step;
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.optic = this.optic;
    return out;
  }
}

/** Takes a stance with the same keys a player would press, one change at a time. True once he's in it. */
function takeStance(view: PlayerView, want: Stance, out: InputFrame): boolean {
  const y = view.you;
  if (y.stance === want && y.settled) return true;
  if (y.stance !== want && y.settled) {
    if (want === 'prone') out.prone = true;
    else if (y.stance === 'prone' || want === 'crouch' || y.stance === 'crouch') out.crouch = true;
  }
  return false;
}

function drawn(rng: Rng, r: readonly [number, number]): number {
  return rng.range(r[0], r[1]);
}

/** What an engagement is for. */
export interface Orders {
  /** Only the man he came for: others are looked at and left. */
  onlyTarget: boolean;
  /** Waits for a moment with nobody near him, for at most `patience` seconds once he's on him. */
  clean: boolean;
  patience: number;
  /** Lases the range before shooting. */
  lase: boolean;
  /** The furthest he'll shoot, metres. */
  reach: number;
}

type Phase = 'find' | 'look' | 'lase' | 'hold' | 'assess';

/** One way of shooting: find a man, know him, range him, hold, press, see what happened. */
class Shooter {
  private phase: Phase = 'find';
  private until = -1;
  private man = -1;
  private onHimSince = -1;
  private lased = 0;
  private lastLased = -Infinity;
  private readonly dismissed = new Map<number, number>();
  private readonly aim: Angles = { yaw: 0, pitch: 0 };
  /** The man he has made out to be the target, once he has. */
  private known = -1;
  /** The last moment that man was in view. */
  sawTargetAt = -Infinity;
  /** Shots taken so far. */
  shots = 0;
  /** Set for the tick an engagement finishes: he has fired, and seen what happened. */
  finished = false;

  constructor(
    private readonly skill: Skill,
    private readonly rng: Rng,
  ) {}

  /** Starts looking afresh: after moving, say. */
  reset(): void {
    this.phase = 'find';
    this.until = -1;
    this.man = -1;
  }

  private current(view: PlayerView): SeenMan | undefined {
    return view.seen.find((m) => m.id === this.man);
  }

  private choose(view: PlayerView, o: Orders): SeenMan | null {
    const now = view.time;
    const known = view.seen.find((m) => m.isTarget || m.id === this.known);
    if (known) return known;
    let best: SeenMan | null = null;
    let bestD = Infinity;
    for (const m of view.seen) {
      if (m.distance > o.reach) continue;
      const at = this.dismissed.get(m.id);
      if (at !== undefined && now - at < REMEMBER) continue;
      // The nearest first: as good a way of sweeping a camp as any.
      if (m.distance < bestD || (m.distance === bestD && best && m.id < best.id)) {
        bestD = m.distance;
        best = m;
      }
    }
    return best;
  }

  /** One tick of it. */
  step(view: PlayerView, hands: Hands, out: InputFrame, o: Orders): void {
    this.finished = false;
    const now = view.time;
    const S = this.skill;
    if (view.seen.some((m) => m.id === this.known)) this.sawTargetAt = now;
    if (this.phase === 'find') {
      hands.optic = Optic.None;
      if (this.until < 0) this.until = now + drawn(this.rng, S.find);
      // He knows that man by now: he picks him out at once when he comes back into view.
      if (this.sawTargetAt === now && this.until > now + RECOGNISE[1]) this.until = now + drawn(this.rng, RECOGNISE);
      if (now < this.until) return;
      const m = this.choose(view, o);
      if (!m) {
        this.until = now + 0.5;
        return;
      }
      this.man = m.id;
      this.phase = 'look';
      this.until = now + drawn(this.rng, S.look);
      return;
    }
    const m = this.current(view);
    if (this.phase === 'assess') {
      // He sees what the shot did, and works the bolt, whether or not the man is still there.
      hands.optic = Optic.Scope;
      if (now < this.until) return;
      this.finished = true;
      this.phase = 'find';
      this.until = -1;
      this.man = -1;
      return;
    }
    if (!m) {
      // Gone from view, or down. His patience with the moment doesn't start again for it.
      this.phase = 'find';
      this.until = -1;
      this.man = -1;
      return;
    }
    if (this.phase === 'look') {
      hands.optic = Optic.Scope;
      view.lookAt(m.chest, this.aim);
      hands.face(this.aim);
      if (now < this.until || !view.you.raised) return;
      if (m.isTarget) this.known = m.id;
      if (o.onlyTarget && !m.isTarget) {
        this.dismissed.set(m.id, now);
        this.phase = 'find';
        this.until = now + 0.4;
        this.man = -1;
        return;
      }
      if (this.onHimSince < 0) this.onHimSince = now;
      const needsRange = o.lase && (Math.abs(m.distance - this.lastLased) > 0.1 * m.distance || this.lased === 0);
      this.phase = needsRange ? 'lase' : 'hold';
      this.until = now + drawn(this.rng, needsRange ? S.range : S.hold);
      return;
    }
    if (this.phase === 'lase') {
      hands.optic = Optic.Binoculars;
      view.lookAt(m.head, this.aim);
      hands.face(this.aim);
      if (now < this.until) return;
      out.commands = [{ kind: 'range', lag: 0, yaw: hands.yaw, pitch: hands.pitch }];
      this.lased = m.distance;
      this.lastLased = m.distance;
      this.phase = 'hold';
      this.until = now + drawn(this.rng, S.hold);
      return;
    }
    // Hold: on him, following him, and the breath in for the last of it.
    hands.optic = Optic.Scope;
    if (!view.aimAt(m.chest, m.vx, m.vz, this.aim)) return;
    hands.face(this.aim);
    // While someone's near him there's no moment to count down to: he just watches, breathing.
    if (o.clean && now - this.onHimSince < o.patience && view.seen.some((w) => w.id !== m.id && dist(w, m) <= WITNESS)) {
      this.until = now + 2;
      return;
    }
    if (now >= this.until - 1.5) out.breath = true;
    if (now < this.until || !view.you.ready || !view.you.raised) return;
    this.press(hands, out, m);
    this.shots++;
    this.onHimSince = -1;
    this.phase = 'assess';
    this.until = now + BOLT + drawn(this.rng, S.assess);
  }

  private press(hands: Hands, out: InputFrame, m: SeenMan): void {
    const S = this.skill;
    const speed = Math.sqrt(m.vx * m.vx + m.vz * m.vz);
    const leadMil = (1000 * speed) / ROUGH_SPEED;
    const right = this.rng.normalish() * Math.sqrt(S.pressMil * S.pressMil + S.leadShare * leadMil * (S.leadShare * leadMil));
    const up = this.rng.normalish() * Math.sqrt(S.pressMil * S.pressMil + (this.lased > 0 ? 0 : S.byEyeMil * S.byEyeMil));
    this.aim.yaw -= right / 1000;
    this.aim.pitch += up / 1000;
    hands.snap(this.aim);
    out.commands = [{ kind: 'fire', lag: 0, yaw: this.aim.yaw, pitch: this.aim.pitch }];
    out.breath = true;
  }
}

function dist(a: SeenMan, b: SeenMan): number {
  return Math.sqrt((a.head.x - b.head.x) * (a.head.x - b.head.x) + (a.head.z - b.head.z) * (a.head.z - b.head.z));
}

/** One way of walking: along a route on the map, round whatever turns up in the way. True on arrival. */
class Walker {
  private route: ReadonlyArray<{ x: number; z: number }> | null = null;
  private next_ = 0;
  private checkAt = 0;
  private lastX = 0;
  private lastZ = 0;
  private reached = -1;
  private reachedAt = 0;
  private lastStep = -Infinity;
  /** Places on the route that stopped him: the next route keeps clear of them. */
  private readonly shun: Array<{ x: number; z: number }> = [];
  private sideUntil = -1;
  private side = 1;

  constructor(
    private readonly x: number,
    private readonly z: number,
    private readonly keepAway: number,
    /** How close counts as there. */
    private readonly reach: number,
  ) {}

  step(view: PlayerView, hands: Hands, out: InputFrame, stance: Stance, sprint: boolean): boolean {
    const y = view.you;
    const left = Math.sqrt((this.x - y.x) * (this.x - y.x) + (this.z - y.z) * (this.z - y.z));
    if (left <= this.reach) return true;
    hands.optic = Optic.None;
    if (!takeStance(view, stance, out)) return false;
    // Starting again after a pause: whatever he was doing then, nothing is in his way yet.
    if (view.time - this.lastStep > 1) this.reachedAt = view.time;
    this.lastStep = view.time;
    if (!this.route) {
      this.route = view.routeTo(this.x, this.z, this.keepAway, this.shun);
      if (!this.route && this.shun.length > 0) {
        // Everything he'd shunned has closed him in. He'd try it again.
        this.shun.length = 0;
        this.route = view.routeTo(this.x, this.z, this.keepAway);
      }
      this.next_ = 0;
      this.lastX = y.x;
      this.lastZ = y.z;
      this.checkAt = view.time + 2;
      // Nowhere to go from here: as far as this walk can take him.
      if (!this.route) return true;
    }
    while (this.next_ < this.route.length) {
      const p = this.route[this.next_]!;
      if ((p.x - y.x) * (p.x - y.x) + (p.z - y.z) * (p.z - y.z) > 2.25) break;
      this.next_++;
    }
    // The route ends at the nearest ground that can be walked to, which may be short of the place itself.
    if (this.next_ >= this.route.length) return true;
    const p = this.route[this.next_]!;
    const want = datan2(-(p.x - y.x), -(p.z - y.z));
    hands.faceYaw(want);
    const off = Math.abs(want - hands.yaw);
    out.moveZ = off < 0.6 || off > TWO_PI - 0.6 ? 1 : 0.25;
    out.sprint = sprint && stance === 'stand';
    // Going nowhere for a couple of seconds: something's in the way, so he steps round it.
    if (view.time >= this.checkAt) {
      this.checkAt = view.time + 2;
      const moved = Math.sqrt((y.x - this.lastX) * (y.x - this.lastX) + (y.z - this.lastZ) * (y.z - this.lastZ));
      this.lastX = y.x;
      this.lastZ = y.z;
      if (moved < 0.8) {
        this.side = -this.side;
        this.sideUntil = view.time + 0.7;
      }
    }
    // Not getting any further along the route, for whatever reason (he slid past a turn on a steep bank, say): he thinks again from where he is.
    if (this.next_ !== this.reached) {
      this.reached = this.next_;
      this.reachedAt = view.time;
    } else if (view.time - this.reachedAt > 6) {
      this.shun.push({ x: p.x, z: p.z });
      this.route = null;
      this.reached = -1;
    }
    if (view.time < this.sideUntil) {
      out.moveX = this.side;
      out.moveZ = 0.3;
    }
    return false;
  }
}

/** Just walks somewhere, and says when he's there: for a fork that moves a shooter on foot. */
export class WalkTo implements ViewBot {
  private readonly hands = new Hands(PERSON);
  private readonly walker: Walker;
  arrived = false;

  constructor(
    x: number,
    z: number,
    private readonly stance: Stance,
  ) {
    this.walker = new Walker(x, z, 0, 1.5);
  }

  next(view: PlayerView, out: InputFrame): InputFrame {
    this.hands.begin(view, out);
    if (this.walker.step(view, this.hands, out, this.stance, false)) this.arrived = true;
    return this.hands.end(view, out);
  }
}

/** Faces the place, takes a stance. */
function settle(view: PlayerView, hands: Hands, out: InputFrame, stance: Stance, toward: { x: number; z: number }): boolean {
  const y = view.you;
  hands.faceYaw(datan2(-(toward.x - y.x), -(toward.z - y.z)));
  return takeStance(view, stance, out);
}

/** What every plan shares: its hands, its stream, its way of shooting, and the walk out at the end. */
abstract class Plan implements ViewBot {
  protected readonly hands: Hands;
  protected readonly shooter: Shooter;
  private out_: Walker | null = null;

  constructor(
    protected readonly skill: Skill,
    protected readonly rng: Rng,
    protected readonly camp: { x: number; z: number },
  ) {
    this.hands = new Hands(skill);
    this.shooter = new Shooter(skill, rng);
  }

  next(view: PlayerView, out: InputFrame): InputFrame {
    this.hands.begin(view, out);
    if (view.you.targetDown) this.leave(view, out);
    else this.act(view, out);
    return this.hands.end(view, out);
  }

  /** Walks to the way out: real walking, on the map, keeping well away from the camp. */
  private leave(view: PlayerView, out: InputFrame): void {
    const w = view.you.wayOut;
    if (!w) return;
    this.out_ ??= new Walker(w.x, w.z, 180, 6);
    this.out_.step(view, this.hands, out, 'stand', false);
  }

  protected abstract act(view: PlayerView, out: InputFrame): void;
}

/** Walks in standing up, shoots whoever he sees, loudly. */
export class Careless extends Plan {
  private readonly walker: Walker;
  private readonly orders: Orders = { onlyTarget: false, clean: false, patience: 0, lase: false, reach: 120 };

  constructor(rng: Rng, camp: { x: number; z: number }, skill: Skill = HASTY) {
    super(skill, rng, camp);
    this.walker = new Walker(camp.x, camp.z, 0, 4);
  }

  protected act(view: PlayerView, out: InputFrame): void {
    if (view.you.rounds > 0 && view.seen.some((m) => m.distance <= this.orders.reach)) {
      if (takeStance(view, 'stand', out)) this.shooter.step(view, this.hands, out, this.orders);
      return;
    }
    this.walker.step(view, this.hands, out, 'stand', false);
  }
}

/** What the plans that work from firing points share: he starts on the first, and moves on to the next on foot, crouched. */
abstract class FromPerches extends Plan {
  /** When he got settled here, or −1 before he has. */
  protected since = -1;
  private at = 0;
  private walker: Walker | null = null;

  constructor(
    skill: Skill,
    rng: Rng,
    camp: { x: number; z: number },
    /** Firing points in the order he'll use them. */
    private readonly perches: ReadonlyArray<{ x: number; z: number }>,
  ) {
    super(skill, rng, camp);
  }

  /** On his way to the next firing point: true while he is. */
  protected walking(view: PlayerView, out: InputFrame): boolean {
    if (!this.walker) return false;
    if (this.walker.step(view, this.hands, out, 'crouch', false)) {
      this.walker = null;
      this.since = -1;
      this.shooter.reset();
    }
    return true;
  }

  protected moveOn(): void {
    this.at = (this.at + 1) % this.perches.length;
    const p = this.perches[this.at]!;
    this.walker = new Walker(p.x, p.z, 200, 2.5);
  }
}

/** From a perch, waits for the clean moment on the target, takes it, and walks to the way out. If this perch never shows him, he tries the next. */
export class ShootOnceAndLeave extends FromPerches {
  private readonly orders: Orders = { onlyTarget: true, clean: true, patience: 45, lase: true, reach: 600 };

  constructor(
    rng: Rng,
    camp: { x: number; z: number },
    perches: ReadonlyArray<{ x: number; z: number }>,
    /** How long he'll wait on a firing point without seeing the target, seconds: about half a camp's cycle. */
    private readonly waitHere = 150,
    skill: Skill = PERSON,
  ) {
    super(skill, rng, camp, perches);
  }

  protected act(view: PlayerView, out: InputFrame): void {
    if (this.walking(view, out)) return;
    if (!settle(view, this.hands, out, 'prone', this.camp)) return;
    if (this.since < 0) this.since = view.time;
    this.shooter.step(view, this.hands, out, this.orders);
    if (view.time - Math.max(this.since, this.shooter.sawTargetAt) > this.waitHere) this.moveOn();
  }
}

/** Waits a while for the target; failing that he thins the camp out. After each engagement he moves to the next firing point. He leaves once the target's down. */
export class ShootAndRelocate extends FromPerches {
  private readonly forTarget: Orders = { onlyTarget: true, clean: false, patience: 0, lase: true, reach: 600 };
  private readonly forAnyone: Orders = { onlyTarget: false, clean: false, patience: 0, lase: true, reach: 600 };
  private shotsHere = 0;

  constructor(
    rng: Rng,
    camp: { x: number; z: number },
    perches: ReadonlyArray<{ x: number; z: number }>,
    private readonly shotsPerPerch = 2,
    /** Seconds on a firing point before he'll shoot someone who isn't the target. */
    private readonly waitForTarget = 45,
    /** Seconds with nothing to shoot before he moves anyway. */
    private readonly dry = 90,
    skill: Skill = PERSON,
  ) {
    super(skill, rng, camp, perches);
  }

  protected act(view: PlayerView, out: InputFrame): void {
    if (this.walking(view, out)) return;
    if (!settle(view, this.hands, out, 'prone', this.camp)) return;
    if (this.since < 0) {
      this.since = view.time;
      this.shotsHere = 0;
    }
    this.shooter.step(view, this.hands, out, view.time - this.since < this.waitForTarget ? this.forTarget : this.forAnyone);
    if (this.shooter.finished) this.shotsHere++;
    if (this.shotsHere >= this.shotsPerPerch || view.time - this.since > this.dry) this.moveOn();
  }
}

/**
 * Shoot, circle, shoot, circle (the owner's takedown sitting, Nov 10): a few rounds from a
 * firing point, then on foot round the outside of the base, stopping every few metres to
 * look in and shooting each man who's there. He doesn't stop for the target and he doesn't
 * leave: the question is what one lap of the outside hands him (lab/experiments/circling.ts).
 */
export class ShootAndCircle extends Plan {
  private readonly fromPerch: Orders = { onlyTarget: false, clean: false, patience: 0, lase: true, reach: 600 };
  private readonly fromRing: Orders = { onlyTarget: false, clean: false, patience: 0, lase: false, reach: 250 };
  /** Where he is on the ring: −1 while he's still on the firing point. */
  private stop = -1;
  private walker: Walker | null = null;
  private since = -1;
  private shotsHere = 0;
  /** He has been all the way round. */
  lapped = false;
  /** He has left the firing point for the base. */
  get walking(): boolean {
    return this.stop >= 0;
  }

  constructor(
    rng: Rng,
    camp: { x: number; z: number },
    /** Where he stops to look in, in the order he walks them. */
    private readonly ring: ReadonlyArray<{ x: number; z: number }>,
    /** Rounds from the firing point before he goes down to the base. */
    private readonly opening = 3,
    /** Seconds with nothing to shoot on the firing point before he goes anyway. */
    private readonly dry = 60,
    /** Seconds at a stop with nobody in view before he walks on. */
    private readonly look = 5,
    /** The most he'll stay at one stop, seconds. */
    private readonly linger = 45,
    skill: Skill = PERSON,
  ) {
    super(skill, rng, camp);
  }

  /** He came to clear the base, so the target going down doesn't send him home. */
  override next(view: PlayerView, out: InputFrame): InputFrame {
    this.hands.begin(view, out);
    this.act(view, out);
    return this.hands.end(view, out);
  }

  private walkOn(): void {
    if (this.stop + 1 >= this.ring.length) {
      this.lapped = true;
      return;
    }
    this.stop++;
    const p = this.ring[this.stop]!;
    this.walker = new Walker(p.x, p.z, 0, 2.5);
  }

  protected act(view: PlayerView, out: InputFrame): void {
    if (this.walker) {
      if (!this.walker.step(view, this.hands, out, 'crouch', false)) return;
      this.walker = null;
      this.since = -1;
      this.shooter.reset();
    }
    const onPerch = this.stop < 0;
    if (!settle(view, this.hands, out, onPerch ? 'prone' : 'crouch', this.camp)) return;
    if (this.since < 0) {
      this.since = view.time;
      this.shotsHere = 0;
    }
    const orders = onPerch ? this.fromPerch : this.fromRing;
    this.shooter.step(view, this.hands, out, orders);
    if (this.shooter.finished) this.shotsHere++;
    const here = view.time - this.since;
    if (onPerch) {
      if (this.shotsHere >= this.opening || here > this.dry) this.walkOn();
      return;
    }
    const someone = view.seen.some((m) => m.distance <= orders.reach);
    if ((!someone && here > this.look) || here > this.linger) this.walkOn();
  }
}

/**
 * Contact, and break it (the owner's notes on the camp, Nov 10): "when enemy defender saw me,
 * it was easy to run away behind cover when they stopped and they wouldn't even attempt to
 * follow". He walks the outside of the base until a stop shows him someone, shoots, then
 * runs on round the outside, well out of sight of where he fired from, gets down and watches
 * the way he came, shooting whoever comes. Then he does it again. The question is what comes
 * after him (lab/experiments/firefight.ts).
 */
export class ContactAndBreak extends Plan {
  private readonly orders: Orders = { onlyTarget: false, clean: false, patience: 0, lase: false, reach: 250 };
  private stop = 0;
  private looked = 0;
  private walker: Walker | null = null;
  private since = -1;
  /** Looking in from a stop, running, or down and watching the way he came. */
  phase: 'look' | 'run' | 'watch' = 'look';
  /** How many times he's broken away, and the mission second he last did, or −1. */
  breaks = 0;
  brokeAt = -1;
  /** He's done it as often as he meant to, or been all the way round without seeing anyone. */
  done = false;
  private readonly firedFrom = { x: 0, z: 0 };

  constructor(
    rng: Rng,
    camp: { x: number; z: number },
    /** Where he stops to look in, in the order he walks them. */
    private readonly ring: ReadonlyArray<{ x: number; z: number }>,
    /** Stops he runs on after firing: far enough to be out of sight of where he was. */
    private readonly hop = 4,
    /** Seconds he watches the way he came. */
    private readonly watch = 60,
    /** Seconds at a stop with nobody in view before he walks on. */
    private readonly look = 5,
    /** How many times he does it. */
    private readonly times = 2,
    skill: Skill = PERSON,
  ) {
    super(skill, rng, camp);
  }

  /** He isn't here for the target, so the target going down doesn't send him home. */
  override next(view: PlayerView, out: InputFrame): InputFrame {
    this.hands.begin(view, out);
    this.act(view, out);
    return this.hands.end(view, out);
  }

  private walkOn(stops: number): void {
    this.stop = (this.stop + stops) % this.ring.length;
    const p = this.ring[this.stop]!;
    this.walker = new Walker(p.x, p.z, 0, 2.5);
    this.since = -1;
  }

  protected act(view: PlayerView, out: InputFrame): void {
    if (this.done) {
      settle(view, this.hands, out, 'crouch', this.camp);
      return;
    }
    if (this.walker) {
      const running = this.phase === 'run';
      if (!this.walker.step(view, this.hands, out, running ? 'stand' : 'crouch', running)) return;
      this.walker = null;
      this.since = -1;
      this.shooter.reset();
      if (running) this.phase = 'watch';
    }
    if (this.since < 0) this.since = view.time;
    const here = view.time - this.since;
    if (this.phase === 'watch') {
      if (!settle(view, this.hands, out, 'crouch', this.firedFrom)) return;
      this.shooter.step(view, this.hands, out, this.orders);
      if (here > this.watch) {
        if (this.breaks >= this.times) this.done = true;
        else {
          this.phase = 'look';
          this.looked = 0;
          this.walkOn(1);
        }
      }
      return;
    }
    if (!settle(view, this.hands, out, 'crouch', this.camp)) return;
    this.shooter.step(view, this.hands, out, this.orders);
    if (this.shooter.finished) {
      // He's fired, and seen what it did. Away.
      this.firedFrom.x = view.you.x;
      this.firedFrom.z = view.you.z;
      this.breaks++;
      this.brokeAt = view.time;
      this.phase = 'run';
      this.walkOn(this.hop);
      return;
    }
    if (!view.seen.some((m) => m.distance <= this.orders.reach) && here > this.look) {
      if (++this.looked >= this.ring.length) this.done = true;
      else this.walkOn(1);
    }
  }
}
