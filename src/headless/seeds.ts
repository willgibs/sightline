/**
 * Generates many valleys and reports how they come out: validation pass rate, re-rolls,
 * generation time, overwatch and access. The first step toward the seed explorer.
 *
 *   npm run seeds -- --count 100
 */
import { defaultTuning } from '../config/tuning';
import { Rng } from '../sim/core/rng';
import { randomSeed } from '../sim/core/seed';
import { generateWorld } from '../sim/gen/world';
import { fmt, parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
const count = Number(args.get('count') ?? 50);
const base = new Rng(args.get('from') ?? 'seed-report', 'list');
const seeds = Array.from({ length: count }, () => randomSeed(() => base.next()));

console.log(`\nSIGHTLINE seed report · ${count} valleys\n`);
const times: number[] = [];
const attempts = new Map<number, number>();
const overwatch: number[] = [];
const access: number[] = [];
const steep: number[] = [];
const trees: number[] = [];
const failures: string[] = [];
for (const seed of seeds) {
  const w = generateWorld(seed, defaultTuning);
  times.push(w.genMs);
  attempts.set(w.attempt, (attempts.get(w.attempt) ?? 0) + 1);
  overwatch.push(w.report.overwatchSectors);
  access.push(w.report.accessSectors);
  steep.push(w.report.steepShare);
  trees.push(w.props.trees.length);
  if (!w.report.ok) failures.push(`${seed}: ${w.report.problems.join('; ')}`);
  process.stdout.write('.');
}
process.stdout.write('\n\n');

const sorted = [...times].sort((a, b) => a - b);
const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const firstTry = attempts.get(0) ?? 0;
console.log(`valid on first try   ${firstTry}/${count} (${((firstTry / count) * 100).toFixed(0)}%)`);
console.log(`re-rolls             ${[...attempts.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
console.log(`still failing        ${failures.length}`);
console.log(`generation time      mean ${fmt.ms(mean(times))} · p50 ${fmt.ms(pct(0.5))} · p95 ${fmt.ms(pct(0.95))}`);
console.log(`overwatch sectors    mean ${mean(overwatch).toFixed(1)}/8 · min ${Math.min(...overwatch)}`);
console.log(`access sectors       mean ${mean(access).toFixed(1)}/16 · min ${Math.min(...access)}`);
console.log(`too steep to walk    mean ${(mean(steep) * 100).toFixed(1)}% · max ${(Math.max(...steep) * 100).toFixed(1)}%`);
console.log(`trees                mean ${fmt.int(mean(trees))}`);
for (const f of failures) console.log(`  ✗ ${f}`);
console.log('');
