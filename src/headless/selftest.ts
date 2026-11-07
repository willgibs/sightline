/**
 * Runs the determinism self-test in this JavaScript engine and compares with the golden
 * values. Exits non-zero on any mismatch.
 *
 *   npm run selftest                     Node (V8)
 *   bun src/headless/selftest.ts         Bun (JavaScriptCore, Safari's engine)
 */
import { runSelfTest } from '../sim/selftest';

const now = (): number => globalThis.performance?.now() ?? Date.now();
const engine = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'Bun (JavaScriptCore)' : `Node ${process.version} (V8)`;
console.log(`\nSIGHTLINE self-test · ${engine} · ${process.platform}/${process.arch}\n`);
const results = runSelfTest(now);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(26)} ${r.got}${r.ok ? '' : `  (expected ${r.expected})`}  ${r.ms.toFixed(0)} ms`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) differ from the golden values.\n` : '\nAll checks match the golden values.\n');
process.exit(failed ? 1 : 0);
