import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative as relativeTo, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Rules the codebase depends on, checked mechanically:
 * 1. The simulation never touches rendering or the browser, so it runs headless.
 * 2. The simulation only uses math that is bit-identical in every JavaScript engine, so
 *    a seed builds the same valley everywhere and a recording replays anywhere.
 * 3. A tick depends only on the state and the input: no clock, no timers, no async, no
 *    network, and no hidden module-level state.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
/** A path from the repository root, with forward slashes on every platform (Windows gives backslashes). */
const relative = (from: string, to: string): string => relativeTo(from, to).split(sep).join('/');

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
    // Also caught: aliasing Math (`= Math`, `const { sin } = Math`), computed members
    // (`Math['sin']`), and locale-dependent formatting and comparison.
    const forbidden =
      /Math\.(sin|cos|tan|asin|acos|atan|atan2|asinh|acosh|atanh|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b|\*\*|=\s*Math\s*[;,)\n]|\}\s*=\s*Math\b|Math\s*\[|\blocaleCompare\b|\btoLocale\w*\b|\bIntl\b/;
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => forbidden.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('reads the terrain through its queries, outside generation', () => {
    // Simulation systems ask the terrain (heightAt, sample, surfaceAt, raycast), so real or
    // chunked terrain can stand behind the same questions later. Only generation, the
    // heightfield itself, test bots and the renderer touch its arrays.
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => !/[\\/](gen|bots)[\\/]/.test(f) && !f.endsWith('heightfield.ts'))
      .filter((f) => /\.(heights|surfaces|cellMax)\b|\.index\(/.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('never reads the clock, waits, or reaches outside inside the simulation', () => {
    // Wall-clock time, timers, async code and network or dynamic imports would make a
    // tick depend on more than its state and input. Callers pass a clock in when they
    // want timings.
    const forbidden = /\b(Date|performance|setTimeout|setInterval|setImmediate|queueMicrotask|requestIdleCallback|fetch|XMLHttpRequest|WebSocket|Worker)\b|\basync\b|\bawait\b|\bimport\s*\(/;
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => forbidden.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('keeps no mutable module-level state in the simulation', () => {
    // State that outlives a tick belongs in the simulation's state, where it is hashed and
    // saved. Module-level scratch buffers are fine as consts that are fully rewritten on use.
    const offenders = files(join(root, 'src/sim'))
      .filter((f) => /^(export\s+)?(let|var)\s/m.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('lets saving tuning.ts hot-reload in the browser instead of reloading the page', () => {
    // Vite reloads the whole page unless every module that imports the tuning's values
    // accepts the update: main.ts applies it, validate.ts keeps its reference. Any other
    // importer in the browser's module graph would lose the run on every save.
    const graph = new Set<string>();
    const visit = (f: string): void => {
      if (graph.has(f)) return;
      graph.add(f);
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)) {
        const next = join(f, '..', m[1]!) + '.ts';
        if (statSync(next, { throwIfNoEntry: false })) visit(next);
      }
    };
    visit(join(root, 'src/app/main.ts'));
    const importers = [...graph]
      .filter((f) => /^import\s+(?!type\b)[^;]*?from\s+'(\.\.?\/)+(config\/)?tuning'/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f))
      .sort();
    expect(importers).toEqual(['src/app/main.ts', 'src/config/validate.ts']);
    expect(readFileSync(join(root, 'src/config/validate.ts'), 'utf8')).toMatch(/import\.meta\.hot\?\.accept\('\.\/tuning'/);
  });

  it('keeps guard brains behind the perception boundary', () => {
    // A brain (src/sim/ai) decides from its GuardMind alone: its own body, its post, the
    // static world, the time and its percepts. It may not reach the state, the simulation
    // or the systems, where every entity's true state is.
    const allowed = /^(\.\/[\w/]+|\.\.\/(core|gen|world)\/\w+|\.\.\/motor\/(body|motor|shape)|\.\.\/(events|env)|\.\.\/\.\.\/config\/tuning)$/;
    const offenders: string[] = [];
    for (const f of files(join(root, 'src/sim/ai'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)) {
        if (!allowed.test(m[1]!)) offenders.push(`${relative(root, f)} imports ${m[1]}`);
      }
    }
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
