import { describe, expect, it } from 'vitest';
import { defaultTuning as T } from '../src/config/tuning';
import { kernelAloneScene } from '../src/sim/kernel/alone';
import { neutralInput } from '../src/sim/kernel/input';
import { Recording } from '../src/sim/kernel/record/recording';
import { resimulate } from '../src/sim/kernel/record/resim';
import { ReplaySeeker } from '../src/sim/kernel/record/seek';
import { runScene, startScene } from '../src/sim/kernel/scene';
import type { Simulation } from '../src/sim/kernel/sim';

/**
 * The kernel stands alone (docs/foundation-shape.md): with every lane switched off, a
 * run still steps, hashes, saves, restores and replays. This file imports only the
 * kernel, and compiles with it alone (tsconfig.kernel.json).
 */

/** Every tick's hash, stepping a fresh run of the scene `ticks` times. */
function hashes(name: string, ticks: number): string[] {
  const sim = startScene(kernelAloneScene(name), T);
  const input = neutralInput();
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step(input);
    out.push(sim.hash());
  }
  return out;
}

describe('the kernel alone', () => {
  it('steps a run to its rules, with no lane and no body', () => {
    const run = runScene(kernelAloneScene(), T);
    expect(run.failures).toEqual([]);
    expect(run.sim.state.outcome).toEqual({ status: 'succeeded', reason: 'the gates turned 8 times', tick: 361 });
    expect(run.sim.state.entities.map((e) => e.kind)).toEqual(['solid', 'solid']);
    expect(run.sim.queryView().bodies).toEqual([]);
    expect(run.recording.readEvents().map((e) => e.type)).toEqual(['outcome']);
  });

  it('hashes what changes: every tick of moving gates hashes differently', () => {
    const h = hashes('kernel-alone', 120);
    expect(new Set(h).size).toBe(h.length);
  });

  it('saves and restores, and the run continues bit for bit', () => {
    const scene = kernelAloneScene();
    const a = startScene(scene, T);
    const input = neutralInput();
    for (let i = 0; i < 200; i++) a.step(input);
    const saved = a.saveState();
    const after: string[] = [];
    for (let i = 0; i < 200; i++) {
      a.step(input);
      after.push(a.hash());
    }
    const b: Simulation = startScene(scene, T);
    b.restore(saved);
    for (let i = 0; i < 200; i++) {
      b.step(input);
      expect(b.hash(), `tick ${b.tick}`).toBe(after[i]);
    }
  });

  it('records, re-simulates and seeks exactly', () => {
    const scene = kernelAloneScene();
    const run = runScene(scene, T);
    const rec = Recording.fromBytes(run.recording.toBytes());
    const re = resimulate(rec, { scene });
    expect(re.problem).toBe(null);
    expect(re.ok).toBe(true);
    const direct = hashes('kernel-alone', 361);
    const seeker = new ReplaySeeker(rec, { scene, every: 50 });
    for (const tick of [361, 7, 150, 151, 300, 1]) expect(seeker.seek(tick).hash(), `tick ${tick}`).toBe(direct[tick - 1]);
  });

  it('keeps two simulations apart when they are stepped in alternation', () => {
    // Any state kept outside a simulation's own state tree would leak between them.
    const a = hashes('KERNEL-A', 400);
    const b = hashes('KERNEL-B', 400);
    expect(a[399]).not.toBe(b[399]);
    const sa = startScene(kernelAloneScene('KERNEL-A'), T);
    const sb = startScene(kernelAloneScene('KERNEL-B'), T);
    const input = neutralInput();
    for (let i = 0; i < 400; i++) {
      sa.step(input);
      sb.step(input);
      expect(sa.hash(), `A at tick ${i + 1}`).toBe(a[i]);
      expect(sb.hash(), `B at tick ${i + 1}`).toBe(b[i]);
    }
  });
});
