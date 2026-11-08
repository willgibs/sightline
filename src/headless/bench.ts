/**
 * Every lane's bench (src/sim/game/benches.ts): its pinned runs' fingerprints beside the
 * golden values, the work each system did in them, and its quality metrics beside their
 * pinned values (benchGolden.ts).
 *
 *   npm run bench                  print every lane, and what moved
 *   npm run bench -- --json        the live numbers, as JSON (npm run explain reads it)
 *   npm run bench -- --write       pin the live work and metrics: rewrites benchGolden.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LAYERS, type LayerName } from '../sim/lanes';
import { BENCHES, benchReport } from '../sim/game/benches';
import { BENCH_GOLDEN } from '../sim/game/benchGolden';
import { GOLDEN } from '../sim/game/golden';
import { parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
const report = benchReport();

if (args.has('json')) {
  console.log(JSON.stringify({ golden: GOLDEN, report }));
  process.exit(0);
}

if (args.has('write')) {
  const pinned: Record<string, unknown> = {};
  for (const lane of Object.keys(LAYERS) as LayerName[]) {
    const r = report[lane];
    pinned[lane] = { metrics: r.metrics, runs: Object.fromEntries(Object.entries(r.runs).map(([name, run]) => [name, { work: run.work }])) };
  }
  const file = fileURLToPath(new URL('../sim/game/benchGolden.ts', import.meta.url));
  writeFileSync(
    file,
    `import type { PinnedBench } from './benches';

/**
 * Each lane's pinned work and metrics (benches.ts), written by \`npm run bench -- --write\`.
 * Review this file's diff as you would a moved golden: it is what a change did to every
 * lane's budgets and quality. tests/bench.test.ts holds the live numbers to it.
 */
export const BENCH_GOLDEN: PinnedBench = ${compact(JSON.stringify(pinned, null, 2))};
`,
  );
  console.log(`wrote ${file}`);
  process.exit(0);
}

/** JSON with each run's work counts on one line. */
function compact(json: string): string {
  return json.replace(/\{\n\s+"rays": (\d+),\n\s+"nodes": (\d+),\n\s+"bodies": (\d+)\n\s+\}/g, '{ "rays": $1, "nodes": $2, "bodies": $3 }');
}

const golden: Record<string, { behaviour: string; state: string }> = { ...GOLDEN.play, ...GOLDEN.scenes };
let moved = 0;
for (const lane of Object.keys(LAYERS) as LayerName[]) {
  const r = report[lane];
  const pin = BENCH_GOLDEN[lane];
  console.log(`\n${lane.toUpperCase()} · ${BENCHES[lane].about}`);
  for (const [name, run] of Object.entries(r.runs)) {
    const g = golden[name]!;
    const fp = run.behaviour === g.behaviour && run.state === g.state ? '✓' : `✗ golden ${g.behaviour}/${g.state}`;
    console.log(`  ${name.padEnd(18)} ${run.behaviour}/${run.state} ${fp}`);
    for (const [system, w] of Object.entries(run.work)) {
      const was = pin?.runs[name]?.work[system];
      const same = was && was.rays === w.rays && was.nodes === w.nodes && was.bodies === w.bodies;
      if (!same) moved++;
      console.log(`    ${system.padEnd(16)} rays ${w.rays} · nodes ${w.nodes} · bodies ${w.bodies}${same ? '' : was ? `  (pinned rays ${was.rays} · nodes ${was.nodes} · bodies ${was.bodies})` : '  (not pinned)'}`);
    }
  }
  for (const [name, v] of Object.entries(r.metrics)) {
    const was = pin?.metrics[name];
    if (was !== v) moved++;
    console.log(`  ${name.padEnd(44)} ${v}${was === v ? '' : was === undefined ? '  (not pinned)' : `  (pinned ${was})`}`);
  }
}
console.log(moved === 0 ? '\nEvery lane holds its pinned numbers.' : `\n${moved} number(s) differ from benchGolden.ts: npm run bench -- --write pins them.`);
