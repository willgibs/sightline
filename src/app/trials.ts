import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/kernel/events';
import type { InputFrame } from '../sim/kernel/input';
import type { Driver } from '../sim/kernel/scene';
import type { Scene } from '../sim/game/scenes';
import { sightScenario } from '../sim/game/scenes/sightScenario';
import type { Simulation } from '../sim/game/sim';
import { FACTORS, SITTING, TOLD, probeTally, scoreSitting, sittingSteps, type ProbeTally, type Score, type Told, type Trial } from '../sim/game/trials';

/**
 * Trial mode in the browser (A12, `?trials=<seed>`): a sitting of the exit test, run the way
 * docs/phase-1-plan.md (Exit tests · A) says.
 *
 * Each trial is a run of its own: the trial's scene (a sight scenario: you, a guard who
 * reacts, 8 s), recorded and kept like any run, with your answer as an annotation in its
 * recording, for `npm run playtest`. A trial freezes at its start, or at the first sign the
 * guard is noticing you (his meter at 30%: the indicator, then his head and his voice), and
 * asks: will he see you within 8 seconds? Y or N.
 *
 * A trial frozen at its first cue then asks what told you (1 the mark, 2 his head, 3 his
 * voice, 4 the situation): a one-tap probe that diagnoses and never gates.
 *
 * The 5 warm-ups then play on, so you see what happened. The 30 scored trials don't: they
 * finish out of sight (their recordings hold the whole trial), and nothing is shown until
 * the sitting ends, when the score is: balanced accuracy, the borderline trials, the
 * rules-only predictor on the same trials, and accuracy by the factors that decided each
 * borderline one. R then plays back the trials you got wrong, each with what happened and
 * what would have changed it: a sitting's misses, watched while they're fresh.
 *
 * Nothing of a sitting lives only in the page: every answer is written to this browser's
 * storage as it's given, so a reload picks up where it stopped (`&fresh` starts over); the
 * page asks before leaving an unfinished or unsaved sitting; and the file can be saved
 * as often as you like.
 */

/** What the sitting needs from the game. */
export interface TrialHost {
  /** Starts a fresh, recorded run of a trial's scene, looking at its guard. */
  loadTrial(scene: Scene): void;
  /** The run in progress. */
  readonly sim: Simulation;
  /** Notes something in the current run's recording. */
  annotate(kind: string, text: string): void;
  /** Steps the current run, out of sight, until `done` or `ticks` more ticks: a scored trial's remainder. */
  runOut(ticks: number, done: (events: readonly SimEvent[]) => boolean): void;
  /** The overlay's line while the trials are prepared. */
  status(text: string): void;
  /** The trials are ready: the overlay invites the click that starts them. */
  ready(): void;
  /** Shows the sitting's result, and offers it as a file. */
  results(html: string, save: () => void): void;
  /** Runs again after the results, for a review; what's played from here isn't kept. */
  resume(): void;
  download(name: string, text: string): void;
}

type Phase = 'preparing' | 'ready' | 'running' | 'asking' | 'probe' | 'playing-on' | 'outcome' | 'done';

/** An answer key pressed within this long of the question appearing is a slip (a double-tap on the last one), not an answer. */
const ANSWER_GRACE_MS = 250;
const STORE_PREFIX = 'sightline.sitting.';

/** What survives a reload: the answers so far, and whether the sitting finished and was saved. */
interface Progress {
  version: 1;
  /** Which sitting: the trials this build made from the seed (their parameters and key). */
  digest: string;
  answers: Record<string, boolean>;
  probes: Record<string, Told>;
  finished: boolean;
  saved: boolean;
}

/** The probe's keys. */
const PROBE_KEYS: Readonly<Record<string, Told>> = { Digit1: 'mark', Digit2: 'head', Digit3: 'voice', Digit4: 'situation' };
const TOLD_WORDS: Readonly<Record<Told, string>> = { mark: 'the mark', head: 'his head', voice: 'his voice', situation: 'the situation' };

export class TrialSitting {
  private phase: Phase = 'preparing';
  private trials: Trial[] = [];
  private k = -1;
  private readonly answers = new Map<number, boolean>();
  private readonly probes = new Map<number, Told>();
  /** The misses being played back after the results, and which of them is on; null when not reviewing. */
  private reviewing: number[] | null = null;
  private reviewAt = -1;
  private score: Score | null = null;
  /** When the current question appeared (performance time), for the slip guard. */
  private askedAt = 0;
  /** A sitting brought back from storage: already finished, or to pick up. */
  private restored: 'none' | 'resumed' | 'finished' = 'none';
  /** The sitting's file has been saved. */
  private saved = false;
  private driver: Driver<Simulation> | null = null;
  private freezeAt = -1;
  private seenAt = -1;
  private readonly panel: HTMLElement;
  /** When the sitting finished, for the saved file; null until it has. */
  private finishedAt: string | null = null;

  constructor(
    root: HTMLElement,
    private readonly host: TrialHost,
    readonly seed: string,
    private readonly tuning: Tuning,
    private readonly fresh = false,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'trial-panel';
    this.panel.hidden = true;
    root.appendChild(this.panel);
    document.addEventListener('keydown', this.onKey);
  }

  /** Prepares the sitting a few candidates at a time, so the page stays alive. */
  prepare(): void {
    const steps = sittingSteps(this.seed, this.tuning);
    const pump = (): void => {
      const t0 = performance.now();
      for (;;) {
        const r = steps.next();
        if (r.done) {
          this.trials = r.value;
          this.phase = 'ready';
          this.restore();
          const shape = `${this.trials.filter((t) => t.warmup).length} warm-ups, then ${this.trials.filter((t) => !t.warmup).length} scored trials`;
          this.host.status(
            this.restored === 'finished'
              ? `Sitting ${this.seed} is finished. Click to see its result.`
              : this.restored === 'resumed'
                ? `Sitting ${this.seed}: ${shape}. Picking up where you stopped: ${this.answers.size} answered so far.`
                : `Sitting ${this.seed}: ${shape}. For each, read what you'll do, look, and answer before it ends: Y he'll see you, N he won't.`,
          );
          this.host.ready();
          return;
        }
        if (performance.now() - t0 > 40) {
          this.host.status(`Preparing the trials · ${Math.round((100 * r.value) / SITTING.maxCandidates)}% of the candidates run`);
          break;
        }
      }
      window.setTimeout(pump, 0);
    };
    pump();
  }

  /** The first trial, after the click that starts the sitting. */
  begin(): void {
    if (this.phase !== 'ready') return;
    if (this.restored === 'finished') {
      this.finish();
      return;
    }
    this.next();
  }

  /** Whether the simulation steps this frame: not while a trial is frozen on its question. */
  get stepping(): boolean {
    return this.phase === 'running' || this.phase === 'playing-on';
  }

  /** In trial mode the trial's driver moves the player; the mouse only looks. */
  input(sim: Simulation, out: InputFrame): void {
    if (this.driver) this.driver.next(sim, out);
  }

  /** After each tick: freeze at the first cue, or end the trial when its time is up. */
  onTick(sim: Simulation, events: readonly SimEvent[]): void {
    const t = this.trials[this.k];
    if (!t) return;
    for (const e of events) {
      // The same hold the key was made with (trials.ts), so the freeze shows what it recorded.
      if (e.type === 'noticed' && t.freeze === 'cue' && this.freezeAt < 0 && this.phase === 'running') this.freezeAt = sim.tick + Math.round(SITTING.cueHoldSeconds * this.tuning.sim.tickHz);
      if (e.type === 'detected' && this.seenAt < 0) this.seenAt = e.t;
    }
    const end = sim.tick >= SITTING.seconds * this.tuning.sim.tickHz || (this.phase === 'playing-on' && this.seenAt >= 0);
    if (this.phase === 'running' && this.freezeAt >= 0 && sim.tick >= this.freezeAt) {
      this.ask();
    } else if (this.phase === 'running' && end) {
      // A cue-frozen trial whose cue never came in the run (it can't: the key saw it) asks at its end.
      this.ask();
    } else if (this.phase === 'playing-on' && end) {
      this.phase = 'outcome';
      this.render();
    }
  }

  private next(): void {
    this.k++;
    const t = this.trials[this.k];
    if (!t) {
      this.finish();
      return;
    }
    const scene = sightScenario(t.params);
    this.host.loadTrial(scene);
    this.driver = scene.driver!() as Driver<Simulation>;
    this.freezeAt = -1;
    this.seenAt = -1;
    if (t.freeze === 'start') this.ask();
    else {
      this.phase = 'running';
      this.render();
    }
  }

  /** The trial is frozen on its question. */
  private ask(): void {
    this.phase = 'asking';
    this.askedAt = performance.now();
    this.render();
  }

  private answer(yes: boolean): void {
    const t = this.trials[this.k];
    if (!t || this.phase !== 'asking') return;
    this.answers.set(t.k, yes);
    // With the key it was answered against: the answer scores even if later builds can't re-run the trial.
    this.host.annotate('trial-answer', JSON.stringify({ sitting: this.seed, k: t.k, warmup: t.warmup, freeze: t.freeze, answer: yes, params: t.params, seen: t.seen, borderline: t.borderline, rules: t.rules, flips: t.flips, cueAt: t.cueAt, legible: t.legible }));
    this.persist();
    if (t.freeze === 'cue') {
      // What told you? It diagnoses, and never gates.
      this.phase = 'probe';
      this.render();
      return;
    }
    this.answered();
  }

  /** The answer is in (and the probe, if there was one): the trial goes on. */
  private answered(): void {
    const t = this.trials[this.k]!;
    if (t.warmup) {
      // Warm-ups play on to their end, so you see what happened.
      this.phase = 'playing-on';
      this.render();
      return;
    }
    // Scored: the rest happens out of sight, and stays in the recording.
    const hz = this.tuning.sim.tickHz;
    this.host.runOut(Math.max(0, SITTING.seconds * hz - this.host.sim.tick), (events) => events.some((e) => e.type === 'detected'));
    this.next();
  }

  private tell(told: Told | null): void {
    const t = this.trials[this.k]!;
    if (told !== null) {
      this.probes.set(t.k, told);
      this.host.annotate('trial-probe', JSON.stringify({ sitting: this.seed, k: t.k, told }));
      this.persist();
    }
    this.answered();
  }

  /** Plays back the scored trials answered wrong, one by one, after the results. */
  private review(): void {
    const misses = this.trials.filter((t) => !t.warmup && this.answers.has(t.k) && this.answers.get(t.k) !== t.seen).map((t) => t.k);
    if (misses.length === 0) return;
    this.reviewing = misses;
    this.reviewAt = -1;
    this.host.resume();
    this.nextMiss();
  }

  private nextMiss(): void {
    this.reviewAt++;
    const k = this.reviewing![this.reviewAt];
    if (k === undefined) {
      this.reviewing = null;
      this.phase = 'done';
      this.render();
      this.showResults();
      return;
    }
    this.k = k;
    const scene = sightScenario(this.trials[k]!.params);
    this.host.loadTrial(scene);
    this.driver = scene.driver!() as Driver<Simulation>;
    this.freezeAt = -1;
    this.seenAt = -1;
    this.phase = 'playing-on';
    this.render();
  }

  private onKey = (e: KeyboardEvent): void => {
    // A held key, or a shortcut that happens to end in a letter (Ctrl+N, ⌘R), isn't an answer.
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    // A double-tap: the second key lands on the next question before it's been seen.
    if ((e.code === 'KeyY' || e.code === 'KeyN') && this.phase === 'asking' && performance.now() - this.askedAt < ANSWER_GRACE_MS) return;
    if (this.press(e.code)) e.preventDefault();
  };

  /** A key, as the sitting takes it: Y or N answers a frozen trial; 1–4 (or Space to skip) says what told you; Space or Enter moves on from an outcome; R plays back the misses, on the results. */
  press(code: string): boolean {
    if (this.phase === 'asking' && (code === 'KeyY' || code === 'KeyN')) {
      this.answer(code === 'KeyY');
      return true;
    }
    if (this.phase === 'probe') {
      const told = PROBE_KEYS[code];
      if (told !== undefined || code === 'Space') {
        this.tell(told ?? null);
        return true;
      }
      return false;
    }
    if (this.phase === 'outcome' && (code === 'Space' || code === 'Enter')) {
      if (this.reviewing) this.nextMiss();
      else this.next();
      return true;
    }
    if (this.phase === 'done' && code === 'KeyR' && this.score) {
      this.review();
      return true;
    }
    return false;
  }

  /** Where the sitting stands, for scripts. */
  state(): { seed: string; phase: Phase; trial: number; of: number; answered: number; warmup: boolean; freeze: Trial['freeze'] | null; brief: string | null } {
    const t = this.trials[this.k];
    return { seed: this.seed, phase: this.phase, trial: this.k, of: this.trials.length, answered: this.answers.size, warmup: t?.warmup ?? false, freeze: t?.freeze ?? null, brief: t?.brief ?? null };
  }

  private render(): void {
    const t = this.trials[this.k];
    if (!t || this.phase === 'done') {
      this.panel.hidden = true;
      return;
    }
    this.panel.hidden = false;
    const scored = this.trials.filter((x) => !x.warmup).length;
    const warmups = this.trials.length - scored;
    const title = this.reviewing ? `Reviewing miss ${this.reviewAt + 1} of ${this.reviewing.length}` : t.warmup ? `Warm-up ${t.k + 1} of ${warmups}` : `Trial ${t.k - warmups + 1} of ${scored}`;
    const said = `You said ${this.answers.get(t.k) ? 'he would' : "he wouldn't"}.`;
    let prompt: string;
    if (this.phase === 'asking') prompt = `<b>Y</b> he'll see you · <b>N</b> he won't${t.freeze === 'cue' ? ' · frozen at the first sign he noticed something' : ' · frozen at the start'}`;
    else if (this.phase === 'probe') prompt = `What told you? <b>1</b> the mark · <b>2</b> his head · <b>3</b> his voice · <b>4</b> the situation alone · <b>Space</b> skip`;
    else if (this.phase === 'running') prompt = 'Watch…';
    else if (this.phase === 'playing-on') prompt = this.reviewing ? `${said} Playing it back…` : 'Playing on…';
    else {
      const why = !this.reviewing ? '' : t.flips.length ? ` One step of ${t.flips.join(' or ')} would have changed it.` : ' No one step would have changed it.';
      prompt = `${this.seenAt >= 0 ? `<b>Seen</b> at ${this.seenAt.toFixed(1)} s.` : `<b>Not seen</b> in ${SITTING.seconds} s.`} ${said}${why} <b>Space</b> for the next.`;
    }
    this.panel.innerHTML = `<div class="trial-title">${title}</div><div class="trial-brief"></div><div class="trial-prompt">${prompt}</div>`;
    this.panel.querySelector('.trial-brief')!.textContent = t.brief;
  }

  private finish(): void {
    this.phase = 'done';
    this.render();
    this.score = scoreSitting(this.trials, this.answers);
    if (this.restored !== 'finished') this.host.annotate('trial-sitting', JSON.stringify({ sitting: this.seed, ...this.score }));
    this.finishedAt = this.finishedAt ?? new Date().toISOString();
    this.persist();
    this.showResults();
  }

  /** Whether leaving now would lose answers that aren't in a saved file. */
  get unsaved(): boolean {
    return this.answers.size > 0 && !this.saved;
  }

  private get storeKey(): string {
    return STORE_PREFIX + this.seed;
  }

  /** The sitting's identity in this build: its trials' parameters and key. */
  private digest(): string {
    let h = 2166136261;
    const text = this.trials.map((t) => `${t.params}:${t.seen ? 1 : 0}:${t.freeze}`).join('|');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  /** Writes the answers so far. Storage can be absent or full: then a reload starts over, and the page still asks before leaving. */
  private persist(): void {
    try {
      const p: Progress = { version: 1, digest: this.digest(), answers: Object.fromEntries(this.answers), probes: Object.fromEntries(this.probes), finished: this.phase === 'done' || this.finishedAt !== null, saved: this.saved };
      window.localStorage.setItem(this.storeKey, JSON.stringify(p));
    } catch {
      // Private mode or full: nothing to do but carry on.
    }
  }

  /** Picks up a sitting from storage, if it's this sitting and it wasn't asked to start over. */
  private restore(): void {
    try {
      if (this.fresh) {
        window.localStorage.removeItem(this.storeKey);
        return;
      }
      const text = window.localStorage.getItem(this.storeKey);
      if (!text) return;
      const p = JSON.parse(text) as Progress;
      if (p.version !== 1 || p.digest !== this.digest()) return;
      for (const [k, v] of Object.entries(p.answers)) this.answers.set(Number(k), v);
      for (const [k, v] of Object.entries(p.probes)) this.probes.set(Number(k), v);
      this.saved = p.saved;
      if (p.finished) {
        this.restored = 'finished';
        this.finishedAt = 'restored';
        this.k = this.trials.length - 1;
      } else if (this.answers.size > 0) {
        this.restored = 'resumed';
        // Answers come in order: on with the next question.
        this.k = this.answers.size - 1;
      }
    } catch {
      // Unreadable or unavailable: a sitting from the start.
    }
  }

  private showResults(): void {
    const s = this.score!;
    const misses = this.trials.filter((t) => !t.warmup && this.answers.has(t.k) && this.answers.get(t.k) !== t.seen).length;
    this.host.results(resultsHtml(this.seed, s, probeTally(this.trials, this.answers, this.probes), misses), () => {
      this.host.download(`sitting-${this.seed}.json`, this.report(s));
      this.saved = true;
      this.persist();
    });
  }

  /** The sitting as a file (`npm run playtest` scores it): every trial with its key, every answer, the score. */
  private report(s: Score): string {
    // With the tuning it was made with, so `npm run playtest` can generate it again and check it.
    return JSON.stringify({ format: 'sightline-sitting', version: 1, seed: this.seed, trials: this.trials, answers: Object.fromEntries(this.answers), probes: Object.fromEntries(this.probes), score: s, tuning: this.tuning, savedAt: new Date().toISOString() }, null, 2);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
    this.panel.remove();
  }
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** What told you, in a line; null if the probe was never answered. */
function probeLine(p: ProbeTally): string | null {
  const said = TOLD.filter((t) => p.by[t].said > 0).map((t) => `${TOLD_WORDS[t]} ${p.by[t].said} (${p.by[t].right} right)`);
  if (said.length === 0) return null;
  return `What told you: ${said.join(' · ')}${p.unreadable ? ` · ${p.unreadable} naming a cue the simulation says couldn't be read` : ''}`;
}

/** The sitting's result, for the overlay. */
export function resultsHtml(seed: string, s: Score, probes: ProbeTally, misses: number): string {
  const freeze = (k: 'start' | 'cue'): string => `${s.byFreeze[k].right} of ${s.byFreeze[k].of} right, balanced ${pct(s.byFreeze[k].balanced)}`;
  const factors = FACTORS.filter((f) => s.byFactor[f])
    .map((f) => `${f} ${s.byFactor[f]!.right} of ${s.byFactor[f]!.of} (table ${s.byFactor[f]!.rules})`)
    .join(' · ');
  const bar = s.balanced >= 0.7 ? '✓ at or above this sitting’s 70% bar' : '✗ under this sitting’s 70% bar';
  return [
    `Sitting ${seed}`,
    ``,
    `Balanced accuracy ${pct(s.balanced)} (${s.right} of ${s.answers} right) · ${bar}`,
    `Borderline trials: ${s.borderlineRight} of ${s.borderline} right · the sight table alone: ${s.rulesBorderlineRight} of ${s.borderline}`,
    `Frozen at the start: ${freeze('start')} · at the first sign: ${freeze('cue')}`,
    `The rules-only predictor on all the same trials: ${pct(s.rulesBalanced)}`,
    `By each factor that flips a borderline trial: ${factors || '—'}`,
    ...[probeLine(probes)].filter((l): l is string => l !== null),
    ...(misses > 0 ? [`Press R to watch the ${misses} you got wrong, with what happened and what would have changed it.`] : []),
    ``,
    `The exit test passes over two sittings: 80% balanced accuracy across both, 70% in each,`,
    `21 of the 30 borderline answers, and 3 more of them than the sight table alone.`,
  ].join('\n');
}
