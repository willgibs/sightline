import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { seedsOf } from '../src/lab/experiment';
import { EXPERIMENTS } from '../src/lab/experiments';
import { AS_LINKED, playSitting, sceneOfLink, type Reading } from '../src/lab/sitting';
import { SITTINGS, SITTINGS_SERIES } from '../src/lab/sittings';
import { STANDING } from '../src/lab/standing';
import { SCENES } from '../src/sim/game/scenes';

/**
 * The owner's sittings on a camp, as data (src/lab/sittings.ts), and the standing bench that
 * plays them (src/lab/experiments/sittings.ts). No sitting is played whole here: that is the
 * bench's, in CI.
 */

describe("the owner's camp sittings, as data", () => {
  it('names each by a short name of its own, which a results file keeps as its seed', () => {
    const names = SITTINGS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9-]{1,40}$/);
  });

  it('links each to a scene this build has, with parameters it takes, and each link once', () => {
    const runs = new Set<string>();
    for (const s of SITTINGS) {
      const link = sceneOfLink(s.link);
      expect(link, s.name).not.toBeNull();
      const make = SCENES[link!.scene];
      expect(make, `${s.name}: ${link!.scene}`).toBeDefined();
      // Making a scene reads its parameters, and builds no world yet.
      const scene = make!(link!.params || undefined);
      runs.add(`${scene.name}?${scene.params}`);
    }
    expect(runs.size).toBe(SITTINGS.length);
  });

  it('reads a link as the page does: the scene, and its parameters decoded', () => {
    expect(sceneOfLink('?scene=takedown&params=seed=LEB-2534%26perch=1&lab')).toEqual({ scene: 'takedown', params: 'seed=LEB-2534&perch=1' });
    expect(sceneOfLink('https://sightline-brown.vercel.app/?scene=hunt&lab')).toEqual({ scene: 'hunt', params: '' });
    expect(sceneOfLink('?trials=OWNER-A1')).toBeNull();
  });
});

describe('the sittings bench', () => {
  const exp = EXPERIMENTS.sittings!;

  it("takes the sittings' names as its seeds, every one, in order", () => {
    expect(exp.series).toBe(SITTINGS_SERIES);
    expect(exp.camps).toBe(SITTINGS.length);
    expect(seedsOf(exp.series, exp.camps)).toEqual(SITTINGS.map((s) => s.name));
    expect(() => seedsOf(exp.series, exp.camps + 1)).toThrow(/sittings/);
  });

  it('is a standing bench', () => {
    expect(STANDING.find((b) => b.name === 'sittings')?.experiment).toBe('sittings');
  });

  it('refuses a seed that names no sitting', () => {
    expect(() => exp.run('LEB-2534', exp.arms[0]!, T)).toThrow(/no sitting/);
  });

  it('counts what the lines say, from the same events', () => {
    // Not a sitting, a look: the first two rounds from the takedown's perch, and what came of them.
    const lines: string[] = [];
    const seconds = 16;
    const r: Reading = playSitting(sceneOfLink(SITTINGS.find((s) => s.name === 'takedown')!.link)!, { ...AS_LINKED, seconds }, T, { print: (l) => lines.push(l) });
    const count = (pattern: RegExp): number => lines.filter((l) => pattern.test(l)).length;
    expect(r.shots).toBeGreaterThan(0);
    expect(r.shots).toBe(count(/ he fires$/));
    expect(r.down).toBe(count(/ a man is down/));
    expect(r.cries).toBe(count(/ he cries out as he falls/));
    expect(r.runners).toBe(count(/ runs for the alarm$/));
    expect(r.missed).toBe(count(/ his round strikes /));
    expect(Number.isNaN(r.whistle)).toBe(count(/ the whistle$/) === 0);
    expect(Number.isNaN(r.siren)).toBe(count(/ the siren$/) === 0);
    const times = [r.firstDown, r.target, r.whistle, r.ran, r.siren, r.body, r.silent, r.engine, r.relief, r.placed, r.hunt, r.after].filter((t) => !Number.isNaN(t));
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(seconds);
    }
    expect(r.men).toBeGreaterThan(0);
    expect(r.rounds).toBe(AS_LINKED.shots);
    // Nothing has ended it yet, and the last line says so.
    expect(r.why).toBe(0);
    expect(r.end).toBeNaN();
    expect(lines.at(-1)).toBe(`  still going after ${seconds} s: nothing has ended it`);
  }, 120_000);
});
