import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Rules the codebase depends on, checked mechanically:
 * 1. The simulation never touches rendering or the browser, so it runs headless.
 * 2. The simulation only uses math that is bit-identical in every JavaScript engine, so
 *    a seed builds the same valley everywhere and a recording replays anywhere.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Source with comments and string contents removed, so prose can't trip the checks. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
}

describe('architecture', () => {
  it('keeps the simulation free of rendering and the DOM', () => {
    const offenders: string[] = [];
    for (const f of files(join(root, 'src/sim'))) {
      const raw = readFileSync(f, 'utf8');
      const src = code(f);
      if (/from\s+['"]three/.test(raw)) offenders.push(`${relative(root, f)} imports three`);
      if (/\b(document|window|requestAnimationFrame|localStorage|HTMLElement|navigator)\b/.test(src)) {
        offenders.push(`${relative(root, f)} touches the DOM`);
      }
      if (/from\s+['"]\.\.\/(\.\.\/)?(render|app)\//.test(raw)) offenders.push(`${relative(root, f)} imports from render/app`);
    }
    expect(offenders).toEqual([]);
  });

  it('uses only engine-identical math anywhere in the simulation', () => {
    // These are implementation-defined in JavaScript; engines differ in the last bit.
    const forbidden =
      /Math\.(sin|cos|tan|asin|acos|atan|atan2|asinh|acosh|atanh|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b|\*\*/;
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => forbidden.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('never calls Math.random inside the simulation', () => {
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => !f.endsWith('seed.ts')) // randomSeed() is UI-only and documented as such
      .filter((f) => /Math\.random/.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
