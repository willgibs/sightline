import { describe, expect, it } from 'vitest';
import { LAYERS, type LayerName } from '../src/sim/lanes';
import { benchReport } from '../src/sim/game/benches';
import { BENCH_GOLDEN } from '../src/sim/game/benchGolden';
import { GOLDEN } from '../src/sim/game/golden';
import { PINNED_RUNS, pinnedRun } from '../src/sim/game/runs';

/**
 * Every lane's bench (src/sim/game/benches.ts) holds its pinned numbers: the work each
 * system does in its runs, and its quality metrics. When one moves on purpose,
 * `npm run bench -- --write` pins it, and the diff of benchGolden.ts is the review.
 */
describe('the lanes’ benches', () => {
  const live = benchReport();

  it('give every lane a bench, and every pinned run a lane', () => {
    expect(Object.keys(live).sort()).toEqual(Object.keys(LAYERS).sort());
    expect(PINNED_RUNS.map((r) => r.name).sort()).toEqual([...Object.keys(GOLDEN.play), ...Object.keys(GOLDEN.scenes)].sort());
  });

  it('hold every lane to its pinned work and metrics', () => {
    const moved: string[] = [];
    for (const lane of Object.keys(LAYERS) as LayerName[]) {
      const pin = BENCH_GOLDEN[lane];
      for (const [name, run] of Object.entries(live[lane].runs)) {
        const was = JSON.stringify(pin?.runs[name]?.work);
        if (JSON.stringify(run.work) !== was) moved.push(`${lane} · ${name}: work ${JSON.stringify(run.work)}, pinned ${was}`);
      }
      for (const [name, v] of Object.entries(live[lane].metrics)) if (pin?.metrics[name] !== v) moved.push(`${lane} · ${name}: ${v}, pinned ${pin?.metrics[name]}`);
      for (const name of Object.keys(pin?.metrics ?? {})) if (!(name in live[lane].metrics)) moved.push(`${lane} · ${name}: pinned, no longer measured`);
    }
    expect(moved, 'npm run bench -- --write pins numbers that moved on purpose').toEqual([]);
  });

  it('pin a camp fight for the brain lane, and it is a fight: shots, a body, the camp awake', () => {
    expect(live.brain.runs['camp-fight']).toBeDefined();
    const r = pinnedRun('camp-fight').start();
    let shots = 0;
    let deaths = 0;
    let woke = false;
    while (!r.over) {
      for (const e of r.step()) {
        if (e.type === 'shot') shots++;
        else if (e.type === 'death') deaths++;
        else if (e.type === 'level' && e.to !== 'calm') woke = true;
      }
    }
    expect(shots).toBeGreaterThan(2);
    expect(deaths).toBeGreaterThan(0);
    expect(woke).toBe(true);
  }, 30_000);

  it('count the work they pin: the motor resolves every body every tick', () => {
    const valley = live.game.runs['TAL-4471 wander']!;
    // Every body, every tick: a whole number of bodies, the player and at least one of each role's guards.
    const ticks = 60 * 30;
    expect(valley.work.motor!.bodies % ticks).toBe(0);
    expect(valley.work.motor!.bodies / ticks).toBeGreaterThanOrEqual(8);
    expect(live.kernel.runs['spawn-tick']!.work['watch-perception']!.rays).toBe(2);
  });
});
