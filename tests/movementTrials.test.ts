import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { reportSittings, type KeptAnswer } from '../src/headless/sittings';
import { NOISE_SITTING, NOISE_SPACE, OWN_SIGHT_SPACE, generateAnySitting, generateMovementSitting, gaitRadius, noiseOutcome } from '../src/sim/game/movementTrials';
import { NOISE_PREROLL, parseNoise } from '../src/sim/game/scenes/noiseScenario';
import { cellOfTrial, cellQuotas, scoreSitting, verdict, outcomeOf, type Trial } from '../src/sim/game/trials';

/**
 * The movement lab's sitting (C8): can a player predict their own noise and visibility?
 * The protocol is lab A's (tests/trials.test.ts holds it to itself); these hold the
 * movement lab's half of it: the two kinds of trial, their answer keys and flips run
 * again, the rule of thumb's blind spots, and a verdict over two sittings.
 */
const ONE = 'movement:SIT-TEST';
const TWO = 'movement:SIT-OTHER';
const trials = generateMovementSitting(ONE, T);
const two = generateMovementSitting(TWO, T);
const scored = trials.filter((t) => !t.warmup);
const noise = scored.filter((t) => t.kind === 'noise');
const sight = scored.filter((t) => t.kind === 'sight');
const spaceOf = (t: Trial) => (t.kind === 'noise' ? NOISE_SPACE : OWN_SIGHT_SPACE);

describe('a movement sitting', () => {
  it('is the same for the same seed, and another seed makes another', () => {
    expect(generateAnySitting(ONE, T).map((t) => [t.params, t.seen, t.flips, t.freeze])).toEqual(trials.map((t) => [t.params, t.seen, t.flips, t.freeze]));
    expect(two.map((t) => t.params)).not.toEqual(trials.map((t) => t.params));
  });

  it('has 5 warm-ups, then 15 noise and 15 visibility trials, shuffled together', () => {
    expect(trials.slice(0, 5).every((t) => t.warmup)).toBe(true);
    expect(trials.slice(0, 5).filter((t) => t.kind === 'noise')).toHaveLength(NOISE_SITTING.warmups);
    expect(noise).toHaveLength(15);
    expect(sight).toHaveLength(15);
    trials.forEach((t, k) => expect(t.k).toBe(k));
    // Not all of one kind and then the other.
    expect(scored.slice(0, 15).some((t) => t.kind === 'noise') && scored.slice(0, 15).some((t) => t.kind === 'sight')).toBe(true);
  });

  it('fills each kind’s cells: yes or no, clear or borderline, borderline split by the table', () => {
    for (const kind of [noise, sight]) {
      const cells = cellQuotas(15).map(() => 0);
      for (const t of kind) cells[cellOfTrial(t)]!++;
      expect(cells).toEqual(cellQuotas(15));
    }
  });

  it('keys every trial by running it, and every borderline trial flips with its factor', () => {
    for (const t of trials) {
      const space = spaceOf(t);
      expect(space.outcome(t.params, T, NOISE_SITTING).seen, t.brief).toBe(t.seen);
      expect(t.borderline).toBe(t.flips.length > 0);
      for (const f of t.flips) {
        const q = space.step(t.params, f, !t.seen);
        expect(q, `${t.brief}: a step of ${f}`).not.toBeNull();
        expect(space.outcome(q!, T, NOISE_SITTING).seen, `${t.brief}: a step of ${f}`).toBe(!t.seen);
      }
    }
  });

  it('reports the factors the lab asks about: surface, gait, distance, masking and light', () => {
    const flips = new Set(trials.flatMap((t) => t.flips));
    for (const f of ['surface', 'gait', 'distance', 'masking', 'light'] as const) expect(flips, f).toContain(f);
  });

  it('freezes a noise trial after its first few steps, except a sprint, which never looks at him', () => {
    for (const t of noise) {
      expect(t.cueAt >= 0, t.brief).toBe(parseNoise(t.params).gait !== 'sprint');
      if (parseNoise(t.params).gait === 'sprint') expect(t.freeze, t.brief).toBe('start');
    }
    expect(noise.filter((t) => t.freeze === 'cue').length).toBeGreaterThanOrEqual(6);
    expect(noise.filter((t) => t.freeze === 'start').length).toBeGreaterThanOrEqual(5);
    // A freeze says nothing about the answer.
    for (const freeze of ['start', 'cue'] as const) expect(new Set(noise.filter((t) => t.freeze === freeze).map((t) => t.seen)).size).toBe(2);
  });

  it('gives nothing away at the freeze: he has heard nothing before he starts listening', () => {
    for (const t of noise.filter((x) => x.seen && x.freeze === 'cue')) {
      const o = noiseOutcome(t.params, T);
      expect(o.seen, t.brief).toBe(true);
      expect(o.cueAt).toBe(NOISE_PREROLL);
      expect(o.seenAt, t.brief).toBeGreaterThan(NOISE_PREROLL);
    }
  });
});

describe('the rule of thumb for noise', () => {
  it('knows the gait and the distance, and not the surface or the hum', () => {
    const base = 'gait=walk&d=11&mask=0&secs=8';
    const says = (s: string) => NOISE_SPACE.rules(s, T);
    expect(says(`surface=grass&${base}`)).toBe(says(`surface=metal&${base}`));
    expect(says('surface=dirt&gait=walk&d=11&mask=2&secs=8')).toBe(says('surface=dirt&gait=walk&d=11&mask=0&secs=8'));
    expect(says('surface=dirt&gait=walk&d=11.5&mask=0&secs=8')).toBe(true);
    expect(says('surface=dirt&gait=walk&d=12.5&mask=0&secs=8')).toBe(false);
    expect(gaitRadius('walk', T)).toBe(T.noise.movement.walk * T.noise.radiusPerUnit);
  });

  it('gets at most about half the borderline trials, so reading only the gait and the distance can’t pass', () => {
    const borderline = noise.filter((t) => t.borderline);
    expect(borderline.filter((t) => t.rules === t.seen).length).toBeLessThanOrEqual(Math.ceil(borderline.length / 2));
    // Its blind spots go both ways: heard when it says no, and not heard when it says yes.
    expect(borderline.some((t) => t.seen && !t.rules)).toBe(true);
    expect(borderline.some((t) => !t.seen && t.rules)).toBe(true);
  });
});

describe('scoring a movement sitting', () => {
  const answersFrom = (ts: readonly Trial[], say: (t: Trial) => boolean) => new Map(ts.filter((t) => !t.warmup).map((t) => [t.k, say(t)] as const));

  it('passes someone who gets everything right, and not someone who follows the tables', () => {
    expect(scoreSitting(trials, answersFrom(trials, (t) => t.seen)).balanced).toBe(1);
    expect(verdict({ trials, answers: answersFrom(trials, (t) => t.seen) }, { trials: two, answers: answersFrom(two, (t) => t.seen) }).pass).toBe(true);
    const tables = verdict({ trials, answers: answersFrom(trials, (t) => t.rules) }, { trials: two, answers: answersFrom(two, (t) => t.rules) });
    expect(tables.pass).toBe(false);
    expect(tables.shortfalls.join(' ')).toMatch(/borderline/);
  });

  it('reports accuracy by the factor that flips each trial', () => {
    const s = scoreSitting(trials, answersFrom(trials, (t) => t.seen));
    for (const f of ['surface', 'gait', 'distance', 'masking', 'light'] as const) expect(s.byFactor[f]?.of, f).toBeGreaterThan(0);
  });

  it('keeps each lab’s verdict apart when scored from what a playtest kept, and re-makes its sittings', () => {
    const kept: KeptAnswer[] = [];
    const add = (id: string, ts: readonly Trial[]): void => {
      for (const t of ts) {
        if (t.warmup) continue;
        kept.push({ sitting: id, k: t.k, warmup: false, kind: t.kind, answer: t.seen, params: t.params, seen: t.seen, file: `${id}-${t.k}`, tuning: T, at: `2026-11-08T0${id === ONE ? 1 : 2}:00:00Z`, key: { freeze: t.freeze, seen: t.seen, borderline: t.borderline, rules: t.rules, flips: t.flips, cueAt: t.cueAt, legible: t.legible } });
      }
    };
    add(ONE, trials);
    add(TWO, two);
    const lines: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(' '));
    try {
      expect(reportSittings(kept, [], T, (id) => (id === ONE ? trials : two))).toBe(true);
    } finally {
      console.log = log;
    }
    const text = lines.join('\n');
    expect(text).toMatch(/passes/);
    expect(text).toMatch(/surface .* of /);
  });
});

describe('the movement sitting’s own sight trials', () => {
  it('are lab A’s scenario, so a key is the sight scenario’s own', () => {
    const t = sight[0]!;
    expect(outcomeOf(t.params, T).seen).toBe(t.seen);
  });
});
