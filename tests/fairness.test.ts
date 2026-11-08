import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { EventLog } from '../src/sim/kernel/eventlog';
import { isSound, type SimEvent } from '../src/sim/kernel/events';
import { Rng } from '../src/sim/kernel/core/rng';
import { startScene } from '../src/sim/kernel/scene';
import { WaypointDriver, type Waypoint } from '../src/sim/game/bots/waypoints';
import { SCENES } from '../src/sim/game/scenes';
import { BARKS, describe as say, explainChain } from '../src/sim/perception';

/**
 * The design doc's fairness rules, checked over whole runs of the perception lab (A8):
 * 1. no omniscience (tests/perception.test.ts);
 * 2. every detection is telegraphed before it completes: outside contact, its first cue
 *    (the meter at 30%: the edge indicator, then the head turn) comes at least 1.5 s before;
 * 3. every detection, and every change of awareness, can be explained afterwards: each
 *    event's cause is the percept that made it, back to what the player did.
 */

/** A seeded zig-zag through the field toward the camp: random stances and pace at each leg. */
function zigzag(seed: string): WaypointDriver {
  const rng = new Rng(seed, 'zigzag');
  // In at a walk, then legs crossing the field: mostly standing or crouched, sometimes prone.
  const legs: Waypoint[] = [{ x: -55, z: 0, stance: 'stand' }];
  const stances = ['stand', 'stand', 'crouch', 'crouch', 'prone'] as const;
  for (let k = 0; k < 12; k++) {
    const stance = stances[rng.int(0, 4)]!;
    legs.push({ x: -60 - k * 7 - rng.range(0, 5), z: rng.range(-25, 25), stance, sprint: stance === 'stand' && rng.chance(0.3) });
  }
  return new WaypointDriver(legs);
}

function run(drive: 'scene' | 'zigzag', seconds: number): SimEvent[] {
  const scene = SCENES['perception-lab']!();
  const sim = startScene(scene, T);
  const driver = drive === 'scene' ? scene.driver!() : zigzag('FAIR-0001');
  const raw = scene.game.still(sim);
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * T.sim.tickHz; i++) for (const e of sim.step(driver.next(sim, raw))) events.push({ ...e });
  return events;
}

describe('the fairness rules, over whole runs of the lab', () => {
  const runs = { scene: run('scene', 90), zigzag: run('zigzag', 150) };

  for (const [name, events] of Object.entries(runs)) {
    describe(`the ${name} run`, () => {
      const log = new EventLog();
      log.add(events);
      const byId = new Map(events.map((e) => [e.id, e]));

      it('telegraphs every detection: its first cue comes 1.5 s before, outside contact', () => {
        const detections = events.filter((e) => e.type === 'detected');
        if (name === 'scene') expect(detections.length).toBeGreaterThan(0);
        for (const d of detections) {
          const cue = byId.get(d.cause);
          expect(cue?.type, `detection ${d.id}'s cause`).toBe('noticed');
          expect(cue!.source).toBe(d.source);
          if (d.type === 'detected' && d.zone !== 'contact') expect(d.t - cue!.t).toBeGreaterThanOrEqual(T.perception.sight.minCueSeconds - 1e-9);
        }
      });

      it('explains every change of awareness by the percept that made it', () => {
        const alerts = events.filter((e) => e.type === 'alert');
        expect(alerts.length).toBeGreaterThan(0);
        for (const a of alerts) {
          if (a.type !== 'alert') continue;
          if (a.reason === 'calm') {
            expect(a.cause).toBe(0);
            continue;
          }
          const p = byId.get(a.cause);
          expect(p, `alert ${a.id} (${a.from} → ${a.to}, ${a.reason})`).toBeDefined();
          expect(['noticed', 'detected', 'heard', 'spotted']).toContain(p!.type);
          expect(p!.source).toBe(a.source);
        }
      });

      it('hears only sounds, and barks only on a change of awareness', () => {
        for (const e of events) {
          if (e.type === 'heard') expect(isSound(byId.get(e.cause)!)).toBe(true);
          if (e.type === 'bark') {
            expect(byId.get(e.cause)?.type).toBe('alert');
            expect(BARKS[e.line]).toBeDefined();
          }
        }
      });

      it('reads every detection back to its percepts, in words', () => {
        for (const d of events.filter((e) => e.type === 'detected')) {
          const chain = log.explain(d.id);
          expect(chain[0]!.type).toBe('noticed');
          const words = explainChain(chain, (id) => (id === 1 ? 'you' : `guard ${id}`));
          expect(words.at(-1)).toMatch(/saw someone at .* m: .*in view.*filling in/);
        }
        for (const e of events) expect(say(e).length).toBeGreaterThan(3);
      });
    });
  }
});
