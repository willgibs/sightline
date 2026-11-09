import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { Rng } from '../src/sim/kernel/core/rng';
import { formatSight, parseSight } from '../src/sim/game/scenes/sightScenario';
import { CELL_NAMES, FACTORS, SITTING, cellOfTrial, cellQuotas, generateSitting, outcomeOf, pairsCovered, probeTally, scoreSitting, stepFactor, verdict, type Told, type Trial } from '../src/sim/game/trials';

/**
 * Trial mode (A12): the exit test's protocol (docs/phase-1-plan.md, Exit tests · A). A
 * seed gives the same sitting anywhere; its 30 scored trials fill the four cells (seen or
 * not, clear or borderline) evenly; every answer key and every borderline flip re-runs
 * true; half the trials freeze at their first cue; and the scoring is the protocol's.
 */
const trials = generateSitting('SIT-TEST', T);
const scored = trials.filter((t) => !t.warmup);
/** A sitting's trials made first come, first taken: what the spread improves on. */
const firstCome = generateSitting('SIT-TEST', T, { ...SITTING, pool: 1 });

describe('a sitting', () => {
  it('is the same for the same seed', () => {
    const again = generateSitting('SIT-TEST', T);
    expect(again.map((t) => [t.params, t.seen, t.borderline, t.freeze])).toEqual(trials.map((t) => [t.params, t.seen, t.borderline, t.freeze]));
    expect(generateSitting('SIT-OTHER', T).map((t) => t.params)).not.toEqual(trials.map((t) => t.params));
  });

  it('has 5 warm-ups, then 30 scored trials filling the four cells evenly', () => {
    expect(trials.slice(0, 5).every((t) => t.warmup)).toBe(true);
    expect(scored).toHaveLength(30);
    const cells = [0, 0, 0, 0];
    for (const t of scored) cells[(t.seen ? 0 : 2) + (t.borderline ? 1 : 0)]!++;
    expect(cells).toEqual([8, 8, 7, 7]);
  });

  it('splits the borderline trials by whether the sight table gets them right, so it gets 7 of 15', () => {
    const cells = CELL_NAMES.map(() => 0);
    for (const t of scored) cells[cellOfTrial(t)]!++;
    expect(cells).toEqual(cellQuotas(30));
    expect(cellQuotas(30)).toEqual([8, 4, 4, 7, 3, 4]);
    const borderline = scored.filter((t) => t.borderline);
    expect(borderline.filter((t) => t.rules === t.seen)).toHaveLength(7);
  });

  it('keys every trial by running it, and every borderline trial flips with its factor', () => {
    for (const t of trials) {
      expect(outcomeOf(t.params, T).seen, t.brief).toBe(t.seen);
      expect(t.borderline).toBe(t.flips.length > 0);
      for (const f of t.flips) {
        const q = stepFactor(parseSight(t.params), f, !t.seen);
        expect(q, `${t.brief}: a step of ${f}`).not.toBeNull();
        expect(outcomeOf(formatSight(q!), T).seen, `${t.brief}: a step of ${f}`).toBe(!t.seen);
      }
    }
  });

  it('calls clear only a trial no single step flips', () => {
    for (const t of scored.filter((x) => !x.borderline).slice(0, 6)) {
      const p = parseSight(t.params);
      for (const f of FACTORS) {
        const q = stepFactor(p, f, !t.seen);
        if (q) expect(outcomeOf(formatSight(q), T).seen, `${t.brief}: a step of ${f}`).toBe(t.seen);
      }
    }
  });

  it('spreads the trials over the factors: more pairs of levels than first come, first taken, with the key unchanged', () => {
    expect(pairsCovered(trials)).toBeGreaterThan(pairsCovered(firstCome) + 5);
    const cells = (ts: readonly Trial[]): number[] => {
      const n = CELL_NAMES.map(() => 0);
      for (const t of ts) if (!t.warmup) n[cellOfTrial(t)]!++;
      return n;
    };
    expect(cells(trials)).toEqual(cells(firstCome));
  });

  it('has warm-ups that show both outcomes', () => {
    const warmups = trials.filter((t) => t.warmup);
    expect(warmups.map((t) => t.seen)).toEqual([true, false, true, false, true]);
  });

  it('gives each freeze kind the same share of seen and not seen, within clear and borderline', () => {
    for (const kind of ['start', 'cue'] as const) {
      const of = scored.filter((t) => t.freeze === kind);
      expect(of).toHaveLength(15);
      expect(of.filter((t) => t.seen)).toHaveLength(8);
      for (const borderline of [false, true]) {
        const part = of.filter((t) => t.borderline === borderline);
        const seen = part.filter((t) => t.seen).length;
        expect(Math.abs(seen - (part.length - seen))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('so a reader who goes by the freeze alone scores 50%, and fails', () => {
    const s = scoreSitting(trials, new Map(trials.map((t) => [t.k, t.freeze === 'cue'])));
    expect(s.balanced).toBeCloseTo(0.5, 6);
    expect(s.byFreeze.cue.of + s.byFreeze.start.of).toBe(30);
  });

  it('freezes about half at their first cue, and only where there is one', () => {
    const cue = scored.filter((t) => t.freeze === 'cue');
    expect(cue.length).toBeGreaterThanOrEqual(12);
    for (const t of cue) expect(t.cueAt).toBeGreaterThanOrEqual(0);
    for (const t of cue) expect(t.legible.indicator).toBe(true);
  });

  it('counts his head as a cue only where it is big enough and in view', () => {
    // Far off, his head is under 2 pixels.
    for (const t of trials) if (parseSight(t.params).d > 80) expect(t.legible.head, t.brief).toBe(false);
    const open = trials.filter((t) => parseSight(t.params).spot === 'open' && parseSight(t.params).d < 40);
    for (const t of open) expect(t.legible.head, t.brief).toBe(true);
    // Lying behind the low wall, the wall hides him; crouched, you see over it.
    const wall = (stance: string): string => `guard=sentry&spot=wall&d=10&off=0&stance=${stance}&move=still&secs=8&react=1&face=1`;
    expect(outcomeOf(wall('prone'), T).clear.start).toBe(false);
    expect(outcomeOf(wall('crouch'), T).clear.start).toBe(true);
  });

  it('says in its brief what the player will do and who watches', () => {
    for (const t of trials) expect(t.brief).toMatch(/^You [^.]*\. The guard is (a sentry|a marksman with binoculars)\. Will he see you within 8 seconds\?$/);
  });
});

describe('scoring', () => {
  const answer = (f: (t: Trial) => boolean): Map<number, boolean> => new Map(trials.map((t) => [t.k, f(t)]));

  it('is balanced accuracy: yes to everything scores 50%, the key 100%', () => {
    expect(scoreSitting(trials, answer(() => true)).balanced).toBeCloseTo(0.5, 12);
    expect(scoreSitting(trials, answer(() => false)).balanced).toBeCloseTo(0.5, 12);
    const perfect = scoreSitting(trials, answer((t) => t.seen));
    expect(perfect.balanced).toBe(1);
    expect(perfect.byFreeze.cue.balanced).toBe(1);
    expect(perfect.byFreeze.start.balanced).toBe(1);
    expect(perfect.answers).toBe(30);
    expect(perfect.borderlineRight).toBe(perfect.borderline);
  });

  it('scores the rules-only predictor on the same trials, and analyses items by every factor that flips them', () => {
    const s = scoreSitting(trials, answer((t) => t.seen));
    const rules = scoreSitting(trials, answer((t) => t.rules));
    expect(s.rulesBalanced).toBeCloseTo(rules.balanced, 12);
    expect(rules.borderlineRight).toBe(7);
    expect(s.rulesBorderlineRight).toBe(7);
    const of = Object.values(s.byFactor).reduce((n, f) => n + f!.of, 0);
    expect(of).toBe(scored.reduce((n, t) => n + t.flips.length, 0));
    for (const f of FACTORS) if (s.byFactor[f]) expect(s.byFactor[f]!.right).toBe(s.byFactor[f]!.of);
  });

  it('tallies the probe: how often each cue was named, how often that was right, and cues that could not be read', () => {
    const cue = scored.filter((t) => t.freeze === 'cue');
    const unreadableHead = cue.slice(2).find((t) => !t.legible.head);
    const said = new Map<number, Told>([
      [cue[0]!.k, 'mark'],
      [cue[1]!.k, 'situation'],
    ]);
    if (unreadableHead) said.set(unreadableHead.k, 'head');
    const wrongOnFirst = answer((t) => (t.k === cue[0]!.k ? !t.seen : t.seen));
    const p = probeTally(trials, wrongOnFirst, said);
    expect(p.by.mark).toEqual({ said: 1, right: 0 });
    expect(p.by.situation).toEqual({ said: 1, right: 1 });
    expect(p.unreadable).toBe(unreadableHead ? 1 : 0);
  });

  it('passes two sittings only on all four conditions', () => {
    const other = generateSitting('SIT-TEST-2', T);
    const key = (ts: readonly Trial[]): Map<number, boolean> => new Map(ts.map((t) => [t.k, t.seen]));
    expect(verdict({ trials, answers: key(trials) }, { trials: other, answers: key(other) }).pass).toBe(true);
    // Right on every clear trial, guessing every borderline one: fails the borderline bar most of the time.
    const rng = new Rng('GUESS', 'answers');
    let passes = 0;
    for (let k = 0; k < 200; k++) {
      const guess = (ts: readonly Trial[]): Map<number, boolean> => new Map(ts.map((t) => [t.k, t.borderline ? rng.chance(0.5) : t.seen]));
      if (verdict({ trials, answers: guess(trials) }, { trials: other, answers: guess(other) }).pass) passes++;
    }
    expect(passes / 200).toBeLessThan(0.08);
    // The rules-only predictor itself doesn't pass.
    const rules = (ts: readonly Trial[]): Map<number, boolean> => new Map(ts.map((t) => [t.k, t.rules]));
    const v = verdict({ trials, answers: rules(trials) }, { trials: other, answers: rules(other) });
    expect(v.pass).toBe(false);
    expect(v.shortfalls.some((s) => /rules-only/.test(s))).toBe(true);
    expect(scored.length).toBe(30);
  });
});
