import { AttackDriver } from '../../sim/game/attacks';
import { commanderOf } from '../../sim/game/comms';
import { compound } from '../../sim/game/scenes/compound';
import type { Simulation } from '../../sim/game/sim';
import { startScene, type Scene } from '../../sim/kernel/scene';
import type { Arm, Experiment } from '../experiment';
import { keptWorld } from '../worlds';

/**
 * What an alarm costs, and when (docs/foundation-review.md, section 3): the same camps under
 * the same sniper, as a camp that runs its target to his vehicle at the siren and as one that
 * protects him (brain/protect.ts), with and without the links its protection hangs on.
 *
 * A scripted sniper fires on the camp from its best overview every 8 s, from 12 s in, and
 * holds fire when he can see nobody. Each run is watched for seven minutes. Everything is
 * timed from his first shot, and only the runs where the siren sounds have stages to time.
 */

interface TakedownArm extends Arm {
  ready: 'relaxed' | 'alert';
}

const ARMS: readonly TakedownArm[] = [
  { name: 'relaxed: he runs at the siren', ready: 'relaxed' },
  { name: 'alert: he shelters, and is sent for', ready: 'alert' },
  { name: 'alert, no radio', ready: 'alert', off: 'radio' },
  { name: 'alert, no vehicle', ready: 'alert', off: 'truck' },
];

const WATCH = 420;

export const takedownStages: Experiment = {
  name: 'takedown',
  about: 'what an alarm costs and when: a camp that runs its target at the siren against one that protects him, with and without its radio and his vehicle',
  series: 'lab-takedown',
  camps: 24,
  arms: ARMS,
  measures: [
    { key: 'siren', label: 'siren sounded', kind: 'rate' },
    { key: 'sirenAt', label: 'siren after (s)', kind: 'median' },
    { key: 'shot', label: 'target shot by the sniper', kind: 'rate' },
    { key: 'roomAt', label: 'in his room after (s)', kind: 'median' },
    { key: 'reliefAt', label: 'relief at the gate after (s)', kind: 'median' },
    { key: 'sentFor', label: 'told to come', kind: 'rate' },
    { key: 'leftAt', label: 'left his room after (s)', kind: 'median' },
    { key: 'gone', label: 'gone within 7 min', kind: 'rate' },
    { key: 'goneAt', label: 'gone after (s)', kind: 'median' },
  ],
  run(seed, arm, tuning) {
    const a = arm as TakedownArm;
    const scene = compound(`seed=${seed}&attack=sniper${a.off ? `&off=${a.off}` : ''}${a.ready === 'alert' ? '&ready=alert' : ''}`) as Scene<Simulation>;
    const sim = startScene(scene, tuning, keptWorld(`live-camp:${seed}`, tuning, scene.world));
    const driver = scene.driver!() as AttackDriver;
    const raw = scene.game.still(sim);
    const hz = tuning.sim.tickHz;
    const camp = commanderOf(sim)!.camp;
    const target = camp.objective!.target;
    const room = camp.protects;
    const P = sim.tuning.brain.protect;
    const out: Record<string, number> = { siren: 0, sirenAt: NaN, shot: 0, roomAt: NaN, reliefAt: NaN, sentFor: NaN, leftAt: NaN, gone: NaN, goneAt: NaN };
    let first = -1;
    for (let i = 0; i < WATCH * hz; i++) {
      const events = sim.step(driver.next(sim, raw));
      if (first < 0 && driver.truth.length > 0) first = sim.tick;
      if (first < 0) continue;
      const since = (sim.tick - first) / hz;
      for (const e of events) {
        if (e.type === 'siren' && Number.isNaN(out.sirenAt!)) out.sirenAt = since;
        if (e.type === 'reinforce' && Number.isNaN(out.reliefAt!)) out.reliefAt = since;
        if (e.type === 'death' && e.victim === target) out.shot = 1;
        if (e.type === 'act' && e.source === target && e.to === 'flee' && Number.isNaN(out.leftAt!)) out.leftAt = since;
      }
      const him = sim.index.get(target);
      if (him && him.kind === 'guard') {
        if (room && Number.isNaN(out.roomAt!) && (him.body.x - room.x) * (him.body.x - room.x) + (him.body.z - room.z) * (him.body.z - room.z) <= P.near * P.near) out.roomAt = since;
        if (him.brain?.releasedAt !== undefined && Number.isNaN(out.sentFor!)) out.sentFor = him.brain.told.some((t) => t.kind === 'escort') ? 1 : 0;
      }
      if (Number.isNaN(out.goneAt!) && camp.objective?.status === 'escaped') out.goneAt = since;
      if (out.shot === 1 || !Number.isNaN(out.goneAt!)) break;
    }
    out.siren = Number.isNaN(out.sirenAt!) ? 0 : 1;
    // What follows a siren is only there to count where one sounded and he lived to hear it.
    if (out.siren === 1 && out.shot === 0) {
      out.gone = Number.isNaN(out.goneAt!) ? 0 : 1;
      if (Number.isNaN(out.sentFor!)) out.sentFor = 0;
    } else out.sentFor = NaN;
    return out;
  },
};
