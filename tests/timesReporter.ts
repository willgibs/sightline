import { writeFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import type { Reporter, TestModule, Vitest } from 'vitest/node';

/**
 * Writes test-times.json: how long each test file took here, whole, from its environment
 * and harness, through loading it (which runs everything at its top and in its describe
 * blocks), to the end of its last test. Vitest's own reports count only the tests, and a
 * file that does its work while loading (tests/bench.test.ts) read as seven seconds when it
 * took six minutes, so the deal (tests/sequencer.ts) took it for a cheap one. CI's test
 * shards upload this, and `npm run timings` makes tests/timings.json from it.
 */
export default class TimesReporter implements Reporter {
  private root = process.cwd();

  onInit(vitest: Vitest): void {
    this.root = vitest.config.root;
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const seconds: Record<string, number> = {};
    for (const m of modules) {
      const d = m.diagnostic();
      const ms = d.environmentSetupDuration + d.prepareDuration + d.collectDuration + d.setupDuration + d.duration;
      seconds[relative(this.root, m.moduleId).split(sep).join('/')] = Math.round(ms / 100) / 10;
    }
    writeFileSync('test-times.json', JSON.stringify(seconds, null, 1) + '\n');
  }
}
