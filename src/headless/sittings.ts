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
 * by when they were played give the exit test's verdict. A recording made by another
 * build, or a file with another build's tuning, still scores: each answer carries the key
 * it was answered against. Not being able to check it against this build is said, and
 * isn't a failure; a recording that contradicts the key is.
 */
import type { Tuning } from '../config/tuning';
import { SITTING, FACTORS, TOLD, generateSitting, probeTally, scoreSitting, verdict, type Score, type Told, type Trial } from '../sim/game/trials';
import type { Annotation } from '../sim/kernel/record/recording';
import type { SimEvent } from '../sim/kernel/events';

/** One answer, as a trial's recording keeps it. */
export interface KeptAnswer {
  sitting: string;
  k: number;
  warmup: boolean;
  answer: boolean;
  params: string;
  /** What the player said told them, at a trial frozen at its first cue. */
  told?: Told;
  /** The key it was answered against (the annotation carries it; recordings from before it don't). */
  key?: AnswerKey;
  /** When the recording was made (ISO), or ''. */
  at: string;
  /** What the recording shows: the guard saw the player within the trial's time. */
  seen: boolean;
  file: string;
  tuning: Tuning;
}

/** The part of a trial's key an answer's annotation carries (app/trials.ts). */
type AnswerKey = Pick<Trial, 'freeze' | 'seen' | 'borderline' | 'rules' | 'flips' | 'cueAt' | 'legible'>;

/** A sitting file, as the results screen saves it (app/trials.ts). */
interface SittingFile {
  format: 'sightline-sitting';
  version: 1;
  seed: string;
  trials: Trial[];
  answers: Record<string, boolean>;
  probes?: Record<string, Told>;
  tuning?: Tuning;
  /** When it was saved (ISO); files from before this have none. */
  savedAt?: string;
}

/** The answers a trial's recording holds, with what its run shows. */
export function answersIn(file: string, annotations: readonly Annotation[], events: readonly SimEvent[], tuning: Tuning, at = ''): KeptAnswer[] {
  const out: KeptAnswer[] = [];
  const limit = SITTING.seconds;
  const seen = events.some((e) => e.type === 'detected' && e.t <= limit + 1e-9);
  const told = new Map<number, Told>();
  for (const a of annotations) {
    if (a.kind !== 'trial-probe') continue;
    try {
      const j = JSON.parse(a.text ?? '') as { k: number; told: Told };
      told.set(j.k, j.told);
    } catch {
      // Not a probe's JSON, so not a probe.
    }
  }
  for (const a of annotations) {
    if (a.kind !== 'trial-answer') continue;
    try {
      const j = JSON.parse(a.text ?? '') as { sitting: string; k: number; warmup: boolean; answer: boolean; params: string } & Partial<AnswerKey>;
      const t = told.get(j.k);
      // An answer with its key can be scored by any build; an older one needs this build to make the same sitting.
      const key: AnswerKey | undefined = j.seen !== undefined && j.freeze !== undefined && j.borderline !== undefined && j.rules !== undefined && j.flips !== undefined ? { freeze: j.freeze, seen: j.seen, borderline: j.borderline, rules: j.rules, flips: j.flips, cueAt: j.cueAt ?? -1, legible: j.legible ?? { indicator: false, head: false, voice: false } } : undefined;
      out.push({ sitting: j.sitting, k: j.k, warmup: j.warmup, answer: j.answer, params: j.params, seen, file, tuning, at, ...(t ? { told: t } : {}), ...(key ? { key } : {}) });
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
  /** Where it came from, in the order found. */
  from: string;
  order: number;
  /** When it was played (ISO), or ''. */
  at: string;
  trials: Trial[];
  answers: Map<number, boolean>;
  probes: Map<number, Told>;
  problems: string[];
  /** What couldn't be checked: reported, not counted against it. */
  notes: string[];
  /** How many scored trials the sitting has. */
  scored: number;
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
    const s: Sitting = { seed, from: `${new Set(answers.map((a) => a.file)).size} recordings`, order: order++, at: answers.map((a) => a.at).reduce((x, y) => (y > x ? y : x), ''), trials: [], answers: new Map(), probes: new Map(), problems: [], notes: [], scored: SITTING.scored };
    // Generated again if this build can, with the recordings' tuning; the answers' own keys don't need it.
    let generated: Trial[] | null = null;
    try {
      generated = generate(seed, answers[0]!.tuning);
      s.scored = generated.filter((t) => !t.warmup).length;
    } catch (e) {
      s.notes.push(`this build can't make it again from its seed (${e instanceof Error ? e.message : String(e)}): scored from the answers' own key`);
    }
    for (const a of answers) {
      const made = generated?.[a.k];
      const same = !generated || made?.params === a.params;
      if (!same && !a.key) {
        s.problems.push(`trial ${a.k} (${a.file}): this build makes a different trial from the seed`);
        continue;
      }
      if (!same) s.notes.push(`trial ${a.k} (${a.file}): this build makes a different trial from the seed: scored from the answer's own key`);
      const t: Trial | null = a.key ? { k: a.k, warmup: a.warmup, params: a.params, brief: '', seenAt: -1, ...a.key } : (made ?? null);
      if (!t) {
        s.problems.push(`trial ${a.k} (${a.file}): no key in the recording, and this build can't make the sitting`);
        continue;
      }
      if (t.seen !== a.seen) s.problems.push(`trial ${a.k} (${a.file}): the recording shows ${a.seen ? 'seen' : 'not seen'}, the key says ${t.seen ? 'seen' : 'not seen'}`);
      s.trials.push(t);
      s.answers.set(a.k, a.answer);
      if (a.told) s.probes.set(a.k, a.told);
    }
    s.trials.sort((x, y) => x.k - y.k); // unique: one answer per trial
    sittings.push(s);
  }

  // From sitting files: the trials they kept, checked against the seed.
  for (const f of files) {
    const j = sittingFile(f.text);
    if (!j) continue;
    const s: Sitting = { seed: j.seed, from: f.name, order: order++, at: j.savedAt ?? '', trials: j.trials, answers: new Map(Object.entries(j.answers).map(([k, v]) => [Number(k), v])), probes: new Map(Object.entries(j.probes ?? {}).map(([k, v]) => [Number(k), v])), problems: [], notes: [], scored: j.trials.filter((t) => !t.warmup).length };
    try {
      const again = generate(j.seed, j.tuning ?? fallback);
      const differ = j.trials.filter((t, k) => again[k]?.params !== t.params || again[k]?.seen !== t.seen).length;
      if (differ) s.problems.push(`${differ} of ${j.trials.length} trials differ from the seed's${j.tuning ? '' : ' (the file has no tuning, so this build’s was used)'}`);
    } catch (e) {
      s.notes.push(`this build can't check it against its seed (${e instanceof Error ? e.message : String(e)}): scored from the file's own key`);
    }
    // The same sitting from its recordings too: one is enough.
    if (sittings.some((o) => o.seed === s.seed && o.answers.size >= s.answers.size)) continue;
    sittings.push(s);
  }
  if (sittings.length === 0) return true;

  let ok = true;
  for (const s of sittings) {
    const scored = s.scored;
    const answered = [...s.answers.keys()].filter((k) => !s.trials[k]?.warmup).length;
    const sc = scoreSitting(s.trials, s.answers);
    console.log(`\nSitting ${s.seed} · from ${s.from} · ${answered} of ${scored} scored trials answered${answered < scored ? ' (incomplete)' : ''}`);
    console.log(`  score     ${line(sc)}`);
    const factors = FACTORS.filter((f) => sc.byFactor[f]).map((f) => `${f} ${sc.byFactor[f]!.right} of ${sc.byFactor[f]!.of} (table ${sc.byFactor[f]!.rules})`);
    if (factors.length) console.log(`  factors   ${factors.join(' · ')}`);
    const p = probeTally(s.trials, s.answers, s.probes);
    const told = TOLD.filter((t) => p.by[t].said > 0).map((t) => `${t} ${p.by[t].said} (${p.by[t].right} right)`);
    if (told.length) console.log(`  told by   ${told.join(' · ')}${p.unreadable ? ` · ${p.unreadable} naming a cue that couldn't be read` : ''}`);
    console.log(`  freezes   at the start ${sc.byFreeze.start.right} of ${sc.byFreeze.start.of} (balanced ${pct(sc.byFreeze.start.balanced)}) · at the first sign ${sc.byFreeze.cue.right} of ${sc.byFreeze.cue.of} (balanced ${pct(sc.byFreeze.cue.balanced)})`);
    for (const n of s.notes) console.log(`  · ${n}`);
    for (const p of s.problems) console.log(`  ✗ ${p}`);
    if (s.problems.length) ok = false;
  }

  // The latest two by when they were played; those with no time (older files) count as earliest.
  const done = sittings
    .filter((s) => s.trials.filter((t) => !t.warmup && s.answers.has(t.k)).length === s.scored)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.order - b.order));
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
