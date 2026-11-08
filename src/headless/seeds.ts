/**
 * Generates many camps and reports how they come out: first tries, repairs, how close
 * each came to its budget, and how long they took (lab D's exit test).
 *
 *   npm run seeds -- --count 100
 *   npm run seeds -- --count 100 --from <series>    a held-out series
 */
import { defaultTuning } from '../config/tuning';
import { Rng } from '../sim/kernel/core/rng';
import { randomSeed } from '../sim/kernel/core/seed';
import { campMission, generateWorld } from '../sim/generation';
import { fmt, parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
const count = Number(args.get('count') ?? 50);
const base = new Rng(args.get('from') ?? 'seed-report', 'list');
const seeds = Array.from({ length: count }, () => randomSeed(() => base.next()));
campReport(seeds, args.get('from') ?? 'seed-report');

/** Lab D's exit test: of these camps, how many pass at their first attempt, what repair does, and how close each came to its budgets. */
function campReport(list: string[], series: string): void {
  console.log(`\nSIGHTLINE camp report · ${list.length} camps from series ${series}\n`);
  const G = defaultTuning.gen;
  const budget = G.validation.repairAttempts;
  const times: number[] = [];
  const first: string[] = [];
  const repaired: Array<{ seed: string; attempts: number; repairs: string[] }> = [];
  const invalid: Array<{ seed: string; rules: string[] }> = [];
  const broken = new Map<string, number>();
  let busiest = 0;
  for (const seed of list) {
    const w = generateWorld(campMission(seed), defaultTuning, () => performance.now());
    times.push(w.genMs);
    const r = w.report;
    const a = r.camp!;
    busiest = Math.max(busiest, a.infiltration.expanded, a.sabotage.expanded, a.exfil.expanded, a.exfil2.expanded, a.vehicle.expanded);
    for (const f of r.firstFailed ?? []) broken.set(f, (broken.get(f) ?? 0) + 1);
    if (!r.validation!.ok) invalid.push({ seed, rules: r.validation!.failed });
    else if (w.attempt === 0 && (r.campAttempt ?? 0) === 0 && (r.repairs ?? []).length === 0) first.push(seed);
    else repaired.push({ seed, attempts: r.repairAttempts ?? 0, repairs: [...(r.campAttempt ? [`rebuilt ${r.campAttempt} time${r.campAttempt === 1 ? '' : 's'}`] : []), ...(r.repairs ?? [])] });
    process.stdout.write('.');
  }
  process.stdout.write('\n\n');
  const sorted = [...times].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  console.log(`valid at the first attempt, no repair   ${first.length}/${list.length} (${Math.round((first.length / list.length) * 100)}%)`);
  console.log(`repaired within budget                  ${repaired.length}`);
  console.log(`still invalid                           ${invalid.length}`);
  console.log(`generation time                         mean ${fmt.ms(times.reduce((a, b) => a + b, 0) / times.length)} · p50 ${fmt.ms(pct(0.5))} · p95 ${fmt.ms(pct(0.95))} · max ${fmt.ms(sorted[sorted.length - 1]!)}`);
  console.log(`busiest search                          ${busiest} of ${G.analysis.maxExpansions} expansions`);
  console.log('rules broken at the first attempt       ' + ([...broken.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'));
  console.log(`\nEach repaired seed, and how close it came to its budget of ${budget} re-analyses:`);
  for (const r of repaired) console.log(`  ${r.seed}  ${r.attempts}/${budget}  ${r.repairs.join('; ')}`);
  for (const r of invalid) console.log(`  ✗ ${r.seed}: ${r.rules.join(', ')}`);
  console.log('');
}
