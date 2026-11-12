import { plainShot, rung } from '../perception';
import type { GuardMind } from './mind';

/**
 * Grounds for the siren: what a man has to know before he runs for an alarm box.
 *
 * The siren is the camp's biggest move. It calls the relief and starts whatever the camp
 * does about its target, and nothing takes it back. So it takes a man who knows the camp is
 * under attack, by his own eyes and ears, and has an alarm box within a run (brain.ts,
 * `alarmWeight`). The design doc has it so: a worker "still raises the alarm if he sees
 * you", and the reaction window opens on "something alarming, like a comrade dropping".
 * Until Nov 12 a worker ran for the box on any sound of a shot he heard at all. A body's
 * thud carries 650 m, so one suppressed round through a tower guard's head sounded the
 * siren a median of four seconds later, thrown by a man who had seen nobody and no body
 * (`npm run experiment -- second-step`). The owner: "there's no way to really get a second
 * kill or infiltrate the camp without the siren going off."
 *
 * He knows it when:
 * - he has an intruder in his sight (the ladder's combat: the meter at 100%);
 * - he watched one of his own go down, or came on a body, near enough to see what had
 *   happened to it, after taking a shot for a shot;
 * - fire he took for fire has come again: a gun he heard or saw for himself (its report,
 *   plain to him; a round that all but hit him; its flash) and was sure of, and then
 *   another sound of one inside the minute.
 *
 * A snap overhead, a thud, a whistle, a shout or a word on the radio is none of these. They
 * make a man look, get down or go and see, and what he then sees is what tells him. So a
 * round nobody saw land, from a rifle nobody heard, leaves a camp that has to find its dead
 * man the slow way: a check-in he doesn't answer, and someone sent to look.
 *
 * Once he knows, he goes on knowing for a while: an intruder who has stepped back out of
 * sight is still an intruder, and he doesn't turn round halfway to the box. Not for ever:
 * a man who was too far from a box to run for it has shouted it and called it in instead,
 * and the siren is then the camp's to order (commander.ts: it counts its dead).
 *
 * Nothing here reads more than his mind holds (rule 13).
 */

/** Once a tick, before he thinks: counts the fire he has taken for fire, and notes when he last came to know the camp was under attack. */
export function noteGrounds(m: GuardMind): void {
  const b = m.brain!;
  const G = m.tuning.brain.alarm.grounds;
  const hz = m.tuning.sim.tickHz;
  // Under fire he's sure of already, any sound of a shot is more of it: a report dulled by the wall he has got behind, a snap,
  // a strike. With none, a first is a gun, plain to his own ears or eyes (a report he knows for one, a near miss, a flash),
  // that he is sure of: something has borne it out (perception: one thing is a question, and two that agree are an answer),
  // or he was sure something was wrong already. A snap and a man down, or a snap and the whistle, have him sure and are
  // still nobody's gun: he gets down and shouts, and it's the camp that counts its dead.
  const under = b.shots !== undefined && m.tick - b.shots.at <= Math.round(G.within * hz);
  const sure = rung(m.awareness.state) >= rung('searching');
  // The newest of them: one shot makes several sounds, so shots are told apart by time.
  let newest = -1;
  for (const p of m.percepts) {
    if (p.tick <= newest) continue;
    if (p.kind === 'muzzle' || (p.kind === 'shot' && (under || plainShot(p.sound, p.strength, m.tuning)))) newest = p.tick;
  }
  if (newest >= 0 && (under || sure) && (!b.shots || newest - b.shots.at > Math.round(G.apart * hz))) {
    b.shots = { count: under ? b.shots!.count + 1 : 1, at: newest };
  }
  const learned = witnessed(m);
  if (learned >= 0 && (b.knows === undefined || learned > b.knows)) b.knows = learned;
}

/**
 * The tick at which what he has seen and heard last told him the camp is under attack, or
 * −1 if nothing has: now, while he has an intruder in sight; the moment he saw the body
 * that told him; the shot that made it fire that goes on.
 */
function witnessed(m: GuardMind): number {
  if (m.awareness.state === 'combat') return m.tick;
  const b = m.brain!;
  const G = m.tuning.brain.alarm.grounds;
  const fire = b.shots && (m.tick - b.shots.at) / m.tuning.sim.tickHz <= G.within ? b.shots.count : 0;
  let at = fire >= G.shots ? b.shots!.at : -1;
  // A body he is sure of: a man lying a long way off is something to go and look at, and tells him nothing yet.
  for (const p of m.percepts) if (p.kind === 'body' && !p.far && (p.fell === true || fire >= 1)) at = Math.max(at, p.fell === true ? p.tick : Math.max(p.tick, b.shots!.at));
  return at;
}

/** True if he knows the camp is under attack, and learned it lately: grounds to go for the siren. */
export function hasGrounds(m: GuardMind): boolean {
  const knows = m.brain!.knows;
  return knows !== undefined && (m.tick - knows) / m.tuning.sim.tickHz <= m.tuning.brain.alarm.grounds.keep;
}
