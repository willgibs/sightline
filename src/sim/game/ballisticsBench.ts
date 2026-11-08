import type { Tuning } from '../../config/tuning';
import { buildWorld } from '../generation';
import { DEG } from '../kernel/core/detmath';
import { neutralInput, Optic, type InputFrame } from '../kernel/input';
import { player } from './entities';
import { placePlayer } from './setup';
import { arm } from './shooting';
import { Simulation } from './sim';

/**
 * Lab B's bench measurements that need a running simulation (benches.ts): the sway
 * ladder, measured by holding a stance with the scope up and sampling the sway the
 * simulation keeps at every tick's end, as the camera and the shot see it.
 */

/** A rung of the ladder: how the shooter holds the rifle. */
export interface SwayRung {
  name: string;
  stance: 'stand' | 'crouch' | 'prone';
  /** Pitch of the aim, degrees: past the bipod's reach, prone is unrested. */
  pitchDeg: number;
  /** Hold the breath (measured only while the hold steadies). */
  breath: boolean;
}

export const SWAY_RUNGS: readonly SwayRung[] = [
  { name: 'standing', stance: 'stand', pitchDeg: 0, breath: false },
  { name: 'crouched', stance: 'crouch', pitchDeg: 0, breath: false },
  { name: 'prone', stance: 'prone', pitchDeg: 25, breath: false },
  { name: 'prone, rested', stance: 'prone', pitchDeg: 0, breath: false },
  { name: 'prone, rested, breath held', stance: 'prone', pitchDeg: 0, breath: true },
];

/** The 95th-percentile radius of the sway, in mils, over `seconds` of a rung (held breaths: their steady part). */
export function swayRadius(rung: SwayRung, tuning: Tuning, seconds = 20): number {
  const world = buildWorld({ name: 'sway-bench', size: 60, cell: 1 }, tuning.gen);
  const sim = new Simulation(world, tuning);
  placePlayer(sim, 0, 0, 0, -1);
  arm(player(sim.index), tuning);
  const hz = tuning.sim.tickHz;
  const input: InputFrame = { ...neutralInput(0, rung.pitchDeg * DEG), optic: Optic.Scope };
  // Take the stance and settle: a second and a half.
  for (let i = 0; i < 1.5 * hz; i++) sim.step({ ...input, crouch: i === 0 && rung.stance === 'crouch', prone: i === 0 && rung.stance === 'prone' });
  const radii: number[] = [];
  const V = tuning.vitals;
  const p = player(sim.index);
  for (let i = 0; i < seconds * hz; ) {
    if (!rung.breath) {
      sim.step(input);
      radii.push(Math.sqrt(p.rifle!.sway.up * p.rifle!.sway.up + p.rifle!.sway.right * p.rifle!.sway.right));
      i++;
      continue;
    }
    // Hold for as long as a breath steadies, then breathe until it's back; sample the steady part.
    for (let k = 0; k < V.holdTime * hz && i < seconds * hz; k++, i++) {
      sim.step({ ...input, breath: true });
      if (p.vitals!.held >= tuning.ballistics.sway.holdSettle && p.vitals!.held <= V.holdTime) {
        radii.push(Math.sqrt(p.rifle!.sway.up * p.rifle!.sway.up + p.rifle!.sway.right * p.rifle!.sway.right));
      }
    }
    for (let k = 0; k < V.recoverTime * hz; k++) sim.step(input);
  }
  radii.sort((a, b) => a - b); // unique: plain numbers, so equal ones are interchangeable
  return radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.95))] ?? 0;
}
