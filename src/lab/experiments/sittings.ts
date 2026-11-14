import type { Arm, Experiment, Measure } from '../experiment';
import { AS_LINKED, playSitting, sceneOfLink, type Marksman, type Reading } from '../sitting';
import { SITTINGS, SITTINGS_SERIES } from '../sittings';
import { keptWorld } from '../worlds';

/**
 * The owner's sittings (src/lab/sittings.ts): every link the plan gives for a sitting on a
 * camp, played as `npm run sitting` plays it (src/lab/sitting.ts): under the mission's
 * rules, by a marksman on the best overview who fires three rounds, six seconds apart, at
 * the men it sees best and can't be hurt, or by a man who stays where the link starts him,
 * for seven minutes. Each run is a sitting, by its name, and its measures are the numbers
 * its lines would show: what the camp did and when, and when and how the run ended.
 *
 * It's a standing bench, so a change to how a camp behaves shows, sitting by sitting, what
 * the owner would now find at each link. The sittings differ from each other on purpose, so
 * the table's figures are only a summary: what a change moved is in the runs.
 *
 * Loud rounds bring the siren on every perch, so what follows it is what the first arm
 * reads. The second fits the suppressor (`--suppressed`), as the first move's sitting asks,
 * for the ladder before the siren. Where nobody fires it reads as the first; it costs only
 * the playing, since a sitting's two runs share its world.
 */

interface SittingArm extends Arm {
  how: Marksman;
}

const ARMS: readonly SittingArm[] = [
  { name: 'as linked', how: AS_LINKED },
  { name: 'suppressed', how: { ...AS_LINKED, suppressed: true } },
];

const MEASURES: ReadonlyArray<Measure & { key: keyof Reading }> = [
  { key: 'men', label: 'men', kind: 'mean' },
  { key: 'rounds', label: 'rounds set', kind: 'mean' },
  { key: 'shots', label: 'rounds fired', kind: 'mean' },
  { key: 'missed', label: 'into ground or cover', kind: 'mean' },
  { key: 'down', label: 'men down', kind: 'mean' },
  { key: 'firstDown', label: 'first down (s)', kind: 'median' },
  { key: 'cries', label: 'cried out', kind: 'mean' },
  { key: 'target', label: 'target down (s)', kind: 'median' },
  { key: 'whistle', label: 'whistle (s)', kind: 'median' },
  { key: 'ran', label: 'ran for the alarm (s)', kind: 'median' },
  { key: 'runners', label: 'men who ran for it', kind: 'mean' },
  { key: 'siren', label: 'siren (s)', kind: 'median' },
  { key: 'level', label: 'highest level (0 calm, 3 lockdown)', kind: 'median' },
  { key: 'sure5', label: 'sure of it at +5 s', kind: 'mean' },
  { key: 'sure20', label: 'sure of it at +20 s', kind: 'mean' },
  { key: 'body', label: 'body seen (s)', kind: 'median' },
  { key: 'shouts', label: 'lines shouted', kind: 'mean' },
  { key: 'silent', label: 'check-in missed (s)', kind: 'median' },
  { key: 'engine', label: 'his engine (s)', kind: 'median' },
  { key: 'relief', label: 'relief at the gate (s)', kind: 'median' },
  { key: 'reliefMen', label: 'men in the relief', kind: 'mean' },
  { key: 'placed', label: 'placed him (s)', kind: 'median' },
  { key: 'placedOff', label: 'placed off by (m)', kind: 'median' },
  { key: 'hunt', label: 'section sent (s)', kind: 'median' },
  { key: 'after', label: 'first man after him (s)', kind: 'median' },
  { key: 'nearest', label: 'nearest a man sent came (m)', kind: 'median' },
  { key: 'end', label: 'ended (s)', kind: 'median' },
  { key: 'why', label: 'how it ended (0 going, 1 target down, 2 away)', kind: 'median' },
];

export const sittingsExperiment: Experiment = {
  name: 'sittings',
  about: "the owner's sittings on a camp, each played from its link as npm run sitting plays it, and again with the suppressor: what the camp did and when, and when and how the run ended",
  series: SITTINGS_SERIES,
  camps: SITTINGS.length,
  arms: ARMS,
  measures: MEASURES,
  run(seed, arm, tuning) {
    const sitting = SITTINGS.find((s) => s.name === seed);
    const link = sitting ? sceneOfLink(sitting.link) : null;
    if (!link) throw new Error(sitting ? `The sitting ${seed} links to no scene: ${sitting.link}` : `There's no sitting called '${seed}'`);
    const reading = playSitting(link, (arm as SittingArm).how, tuning, { world: (scene, T) => keptWorld(`sitting:${seed}`, T, scene.world) });
    return Object.fromEntries(MEASURES.map((m) => [m.key, reading[m.key]]));
  },
};
