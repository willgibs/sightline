/**
 * Sittings of trial mode (A12), scored from what a playtest kept. Two sources count:
 *
 * - **Recordings.** Each trial is a run of its own, and its recording holds the answer as a
 *   'trial-answer' annotation. The sitting is generated again from its seed with the
 *   recording's own tuning, so the key is the one the player faced; each recording's run
 *   must agree with it (seen or not), and its parameters with the trial's.
 * - **Sitting files** (`sitting-<seed>.json`, saved from the results screen): the trials,
 *   their key and the answers. The deployed game keeps only the last few runs, so this is
 *   the record of a sitting played there. It is generated again too, from its own tuning,
 *   and must match.
 *
 * Each sitting is then scored by the protocol (sim/game/trials.ts), and the latest two
 * together give the exit test's verdict.
 */
import type { Tuning } from '../config/tuning';
import { SITTING, FACTORS, generateSitting, scoreSitting, verdict, type Score, type Trial } from '../sim/game/trials';
import type { Annotation } from '../sim/kernel/record/recording';
import type { SimEvent } from '../sim/kernel/events';

/** One answer, as a trial's recording keeps it. */
export interface KeptAnswer {
  sitting: string;
  k: number;
  warmup: boolean;
  answer: boolean;
  params: string;
  /** What the recording shows: the guard saw the player within the trial's time. */
  seen: boolean;
  file: string;
  tuning: Tuning;
}

/** A sitting file, as the results screen saves it (app/trials.ts). */
interface SittingFile {
  format: 'sightline-sitting';
  version: 1;
  seed: string;
  trials: Trial[];
  answers: Record<string, boolean>;
  tuning?: Tuning;
}

/** The answers a trial's recording holds, with what its run shows. */
export function answersIn(file: string, annotations: readonly Annotation[], events: readonly SimEvent[], tuning: Tuning): KeptAnswer[] {
  const out: KeptAnswer[] = [];
  const limit = SITTING.seconds;
  const seen = events.some((e) => e.type === 'detected' && e.t <= limit + 1e-9);
  for (const a of annotations) {
    if (a.kind !== 'trial-answer') continue;
    try {
      const j = JSON.parse(a.text ?? '') as { sitting: string; k: number; warmup: boolean; answer: boolean; params: string };
      out.push({ sitting: j.sitting, k: j.k, warmup: j.warmup, answer: j.answer, params: j.params, seen, file, tuning });
    } catch {
      // An annotation that isn't an answer's JSON is not an answer.
    }
  }
  return out;
}

/** Reads a sitting file, or null if the JSON isn't one. */
export function sittingFile(text: string): SittingFile | null {
  try {
    const j = JSON.parse(text) as Partial<SittingFile>;
    return j.format === 'sightline-sitting' && typeof j.seed === 'string' && Array.isArray(j.trials) && j.answers ? (j as SittingFile) : null;
  } catch {
    return null;
  }
}

interface Sitting {
  seed: string;
  /** Where it came from, in the order found (files are read sorted, so by time). */
  from: string;
  order: number;
  trials: Trial[];
  answers: Map<number, boolean>;
  problems: string[];
}

const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;

/**
 * Prints each sitting's score, and the verdict over the latest two; false if any doesn't
 * check out. `generate` makes a sitting from its seed (tests pass one that remembers).
 */
export function reportSittings(
  kept: readonly KeptAnswer[],
  files: readonly { name: string; text: string }[],
  fallback: Tuning,
  generate: (seed: string, tuning: Tuning) => Trial[] = generateSitting,
): boolean {
  const sittings: Sitting[] = [];
  let order = 0;

  // From recordings: grouped by seed, the sitting generated again from the recordings' tuning.
  const bySeed = new Map<string, KeptAnswer[]>();
  for (const a of kept) bySeed.set(a.sitting, [...(bySeed.get(a.sitting) ?? []), a]);
  for (const [seed, answers] of bySeed) {
    const trials = generate(seed, answers[0]!.tuning);
    const s: Sitting = { seed, from: `${new Set(answers.map((a) => a.file)).size} recordings`, order: order++, trials, answers: new Map(), problems: [] };
    for (const a of answers) {
      const t = trials[a.k];
      if (!t || t.params !== a.params) {
        s.problems.push(`trial ${a.k} (${a.file}): this build makes a different trial from the seed`);
        continue;
      }
      if (t.seen !== a.seen) s.problems.push(`trial ${a.k} (${a.file}): the recording shows ${a.seen ? 'seen' : 'not seen'}, the key says ${t.seen ? 'seen' : 'not seen'}`);
      s.answers.set(a.k, a.answer);
    }
    sittings.push(s);
  }

  // From sitting files: the trials they kept, checked against the seed.
  for (const f of files) {
    const j = sittingFile(f.text);
    if (!j) continue;
    const s: Sitting = { seed: j.seed, from: f.name, order: order++, trials: j.trials, answers: new Map(Object.entries(j.answers).map(([k, v]) => [Number(k), v])), problems: [] };
    const again = generate(j.seed, j.tuning ?? fallback);
    const differ = j.trials.filter((t, k) => again[k]?.params !== t.params || again[k]?.seen !== t.seen).length;
    if (differ) s.problems.push(`${differ} of ${j.trials.length} trials differ from the seed's${j.tuning ? '' : ' (the file has no tuning, so this build’s was used)'}`);
    // The same sitting from its recordings too: one is enough.
    if (sittings.some((o) => o.seed === s.seed && o.answers.size >= s.answers.size)) continue;
    sittings.push(s);
  }
  if (sittings.length === 0) return true;

  let ok = true;
  for (const s of sittings) {
    const scored = s.trials.filter((t) => !t.warmup).length;
    const answered = [...s.answers.keys()].filter((k) => !s.trials[k]?.warmup).length;
    const sc = scoreSitting(s.trials, s.answers);
    console.log(`\nSitting ${s.seed} · from ${s.from} · ${answered} of ${scored} scored trials answered${answered < scored ? ' (incomplete)' : ''}`);
    console.log(`  score     ${line(sc)}`);
    const factors = FACTORS.filter((f) => sc.byFactor[f]).map((f) => `${f} ${sc.byFactor[f]!.right} of ${sc.byFactor[f]!.of} (table ${sc.byFactor[f]!.rules})`);
    if (factors.length) console.log(`  factors   ${factors.join(' · ')}`);
    for (const p of s.problems) console.log(`  ✗ ${p}`);
    if (s.problems.length) ok = false;
  }

  const done = sittings.filter((s) => [...s.answers.keys()].filter((k) => !s.trials[k]?.warmup).length === s.trials.filter((t) => !t.warmup).length);
  if (done.length >= 2) {
    const [a, b] = done.slice(-2);
    const v = verdict(a!, b!);
    console.log(`\nThe exit test over sittings ${a!.seed} and ${b!.seed}: ${v.pass ? '✓ passes' : '✗ doesn’t pass'}`);
    console.log(`  ${pct(v.balanced)} balanced over both (${pct(v.each[0])}, ${pct(v.each[1])}) · borderline ${v.borderlineRight} of ${v.borderline}, the table alone ${v.rulesBorderlineRight} · rules-only ${pct(v.rulesBalanced)} overall`);
    for (const why of v.shortfalls) console.log(`  · ${why}`);
  } else console.log(`\n${done.length} complete sitting${done.length === 1 ? '' : 's'}: the exit test's verdict needs two.`);
  return ok;
}

function line(s: Score): string {
  return `${pct(s.balanced)} balanced (${s.right} of ${s.answers} right) · borderline ${s.borderlineRight} of ${s.borderline}, the table alone ${s.rulesBorderlineRight} · the rules-only predictor ${pct(s.rulesBalanced)} overall`;
}
