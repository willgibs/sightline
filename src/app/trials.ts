import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/kernel/events';
import type { InputFrame } from '../sim/kernel/input';
import type { Driver } from '../sim/kernel/scene';
import type { Scene } from '../sim/game/scenes';
import { sightScenario } from '../sim/game/scenes/sightScenario';
import type { Simulation } from '../sim/game/sim';
import { FACTORS, SITTING, scoreSitting, sittingSteps, type Score, type Trial } from '../sim/game/trials';

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
 * The 5 warm-ups then play on, so you see what happened. The 30 scored trials don't: they
 * finish out of sight (their recordings hold the whole trial), and nothing is shown until
 * the sitting ends, when the score is: balanced accuracy, the borderline trials, the
 * rules-only predictor on the same trials, and accuracy by the factor that decided each
 * borderline one.
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
  download(name: string, text: string): void;
}

type Phase = 'preparing' | 'ready' | 'running' | 'asking' | 'playing-on' | 'outcome' | 'done';

export class TrialSitting {
  private phase: Phase = 'preparing';
  private trials: Trial[] = [];
  private k = -1;
  private readonly answers = new Map<number, boolean>();
  private driver: Driver<Simulation> | null = null;
  private freezeAt = -1;
  private seenAt = -1;
  private readonly panel: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly host: TrialHost,
    readonly seed: string,
    private readonly tuning: Tuning,
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
          this.host.status(`Sitting ${this.seed}: ${this.trials.filter((t) => t.warmup).length} warm-ups, then ${this.trials.filter((t) => !t.warmup).length} scored trials. For each, read what you'll do, look, and answer before it ends: Y he'll see you, N he won't.`);
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
      this.phase = 'asking';
      this.render();
    } else if (this.phase === 'running' && end) {
      // A cue-frozen trial whose cue never came in the run (it can't: the key saw it) asks at its end.
      this.phase = 'asking';
      this.render();
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
    this.phase = t.freeze === 'start' ? 'asking' : 'running';
    this.render();
  }

  private answer(yes: boolean): void {
    const t = this.trials[this.k];
    if (!t || this.phase !== 'asking') return;
    this.answers.set(t.k, yes);
    this.host.annotate('trial-answer', JSON.stringify({ sitting: this.seed, k: t.k, warmup: t.warmup, freeze: t.freeze, answer: yes, params: t.params }));
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

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (this.press(e.code)) e.preventDefault();
  };

  /** A key, as the sitting takes it: Y or N answers a frozen trial; Space or Enter moves on from a warm-up's outcome. */
  press(code: string): boolean {
    if (this.phase === 'asking' && (code === 'KeyY' || code === 'KeyN')) {
      this.answer(code === 'KeyY');
      return true;
    }
    if (this.phase === 'outcome' && (code === 'Space' || code === 'Enter')) {
      this.next();
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
    const title = t.warmup ? `Warm-up ${t.k + 1} of ${warmups}` : `Trial ${t.k - warmups + 1} of ${scored}`;
    let prompt: string;
    if (this.phase === 'asking') prompt = `<b>Y</b> he'll see you · <b>N</b> he won't${t.freeze === 'cue' ? ' · frozen at the first sign he noticed something' : ' · frozen at the start'}`;
    else if (this.phase === 'running') prompt = 'Watch…';
    else if (this.phase === 'playing-on') prompt = 'Playing on…';
    else prompt = `${this.seenAt >= 0 ? `<b>Seen</b> at ${this.seenAt.toFixed(1)} s.` : `<b>Not seen</b> in ${SITTING.seconds} s.`} You said ${this.answers.get(t.k) ? 'he would' : "he wouldn't"}. <b>Space</b> for the next.`;
    this.panel.innerHTML = `<div class="trial-title">${title}</div><div class="trial-brief"></div><div class="trial-prompt">${prompt}</div>`;
    this.panel.querySelector('.trial-brief')!.textContent = t.brief;
  }

  private finish(): void {
    this.phase = 'done';
    this.render();
    const s = scoreSitting(this.trials, this.answers);
    this.host.annotate('trial-sitting', JSON.stringify({ sitting: this.seed, ...s }));
    this.host.results(resultsHtml(this.seed, s), () => this.host.download(`sitting-${this.seed}.json`, this.report(s)));
  }

  /** The sitting as a file (`npm run playtest` scores it): every trial with its key, every answer, the score. */
  private report(s: Score): string {
    // With the tuning it was made with, so `npm run playtest` can generate it again and check it.
    return JSON.stringify({ format: 'sightline-sitting', version: 1, seed: this.seed, trials: this.trials, answers: Object.fromEntries(this.answers), score: s, tuning: this.tuning }, null, 2);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
    this.panel.remove();
  }
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** The sitting's result, for the overlay. */
export function resultsHtml(seed: string, s: Score): string {
  const factors = FACTORS.filter((f) => s.byFactor[f])
    .map((f) => `${f} ${s.byFactor[f]!.right} of ${s.byFactor[f]!.of} (table ${s.byFactor[f]!.rules})`)
    .join(' · ');
  const bar = s.balanced >= 0.7 ? '✓ at or above this sitting’s 70% bar' : '✗ under this sitting’s 70% bar';
  return [
    `Sitting ${seed}`,
    ``,
    `Balanced accuracy ${pct(s.balanced)} (${s.right} of ${s.answers} right) · ${bar}`,
    `Borderline trials: ${s.borderlineRight} of ${s.borderline} right · the sight table alone: ${s.rulesBorderlineRight} of ${s.borderline}`,
    `The rules-only predictor on all the same trials: ${pct(s.rulesBalanced)}`,
    `By each factor that flips a borderline trial: ${factors || '—'}`,
    ``,
    `The exit test passes over two sittings: 80% balanced accuracy across both, 70% in each,`,
    `21 of the 30 borderline answers, and 3 more of them than the sight table alone.`,
  ].join('\n');
}
