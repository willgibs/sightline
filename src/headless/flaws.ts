/**
 * The compound simulator's flaw report for one camp and one attack: every moment it did
 * something a defender plainly wouldn't, with the address to watch it.
 *
 *   npm run flaws -- <seed> <attack> [off]
 *
 * `off` switches parts of the camp off, as a scene's `off=` does: `places` or `chase,mates`.
 */
import { defaultTuning } from '../config/tuning';
import { attackRun } from '../lab/experiments/flaws';

const seed = process.argv[2] ?? 'LEB-2534';
const attack = process.argv[3] ?? 'sniper';
const off = process.argv[4] ?? '';
const { flaws } = attackRun(seed, attack, defaultTuning, off);
console.log(`\n${flaws.length} flaws: ${seed}, ${attack}${off ? `, off=${off}` : ''}. Watch it: ?scene=compound&params=seed%3D${seed}%26attack%3D${attack}${off ? `%26off%3D${encodeURIComponent(off)}` : ''}&lab\n`);
for (const f of flaws) console.log(`  ${f.at.toFixed(1).padStart(6)} s  ${f.kind.padEnd(14)} guard ${String(f.guard).padStart(3)}  ${f.note}`);
console.log('');
