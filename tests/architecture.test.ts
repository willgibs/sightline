import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative as relativeTo, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LAYERS, type LayerName } from '../src/sim/lanes';

/**
 * Rules the codebase depends on, checked mechanically:
 * 1. The simulation never touches rendering or the browser, so it runs headless.
 * 2. The simulation only uses math that is bit-identical in every JavaScript engine, so
 *    a seed builds the same valley everywhere and a recording replays anywhere.
 * 3. A tick depends only on the state and the input: no clock, no timers, no async, no
 *    network, and no hidden module-level state.
 * 4. Every layer of src/sim imports only what the lane map (src/sim/lanes.ts) allows,
 *    and a lane is reached only through its index.ts.
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

/** Every module a file names: its imports, its re-exports and the modules it augments. */
function specifiers(path: string): string[] {
  const src = readFileSync(path, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/^(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) out.push(m[1]!);
  for (const m of src.matchAll(/^declare module\s+'([^']+)'/gm)) out.push(m[1]!);
  return out;
}

/** The repository path a relative specifier names, as a .ts file or a directory's index.ts. */
function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(from), spec);
  if (existsSync(base + '.ts')) return relative(root, base + '.ts');
  if (existsSync(join(base, 'index.ts'))) return relative(root, join(base, 'index.ts'));
  return relative(root, base);
}

const sim = join(root, 'src/sim');
const layerOf = (repoPath: string): LayerName | null => {
  const m = /^src\/sim\/([^/]+)\//.exec(repoPath);
  return m && m[1]! in LAYERS ? (m[1] as LayerName) : null;
};

describe('architecture', () => {
  it('keeps the simulation free of rendering and the DOM', () => {
    const offenders: string[] = [];
    for (const f of files(sim)) {
      const raw = readFileSync(f, 'utf8');
      const src = code(f);
      if (/from\s+['"]three/.test(raw)) offenders.push(`${relative(root, f)} imports three`);
      if (/\b(document|window|requestAnimationFrame|localStorage|HTMLElement|navigator)\b/.test(src)) {
        offenders.push(`${relative(root, f)} touches the DOM`);
      }
      for (const spec of specifiers(f)) {
        const target = resolve(f, spec);
        if (target && /^src\/(render|app|audio|headless)\//.test(target)) offenders.push(`${relative(root, f)} imports ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses only engine-identical math anywhere in the simulation', () => {
    // These are implementation-defined in JavaScript; engines differ in the last bit.
    // Also caught: aliasing Math (`= Math`, `const { sin } = Math`), computed members
    // (`Math['sin']`), and locale-dependent formatting and comparison.
    const forbidden =
      /Math\.(sin|cos|tan|asin|acos|atan|atan2|asinh|acosh|atanh|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b|\*\*|=\s*Math\s*[;,)\n]|\}\s*=\s*Math\b|Math\s*\[|\blocaleCompare\b|\btoLocale\w*\b|\bIntl\b/;
    const offenders = files(sim)
      .filter((f) => forbidden.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('reads the terrain through its queries, outside generation', () => {
    // Simulation systems ask the terrain (heightAt, sample, surfaceAt, raycast), so real or
    // chunked terrain can stand behind the same questions later. Only generation, the
    // heightfield itself, test bots and the renderer touch its arrays.
    const offenders = files(sim)
      .filter((f) => !/[\\/](generation|game[\\/]bots)[\\/]/.test(f) && !f.endsWith('heightfield.ts'))
      .filter((f) => /\.(heights|surfaces|cellMax)\b|\.index\(/.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('never reads the clock, waits, or reaches outside inside the simulation', () => {
    // Wall-clock time, timers, async code and network or dynamic imports would make a
    // tick depend on more than its state and input. Callers pass a clock in when they
    // want timings.
    const forbidden = /\b(Date|performance|setTimeout|setInterval|setImmediate|queueMicrotask|requestIdleCallback|fetch|XMLHttpRequest|WebSocket|Worker)\b|\basync\b|\bawait\b|\bimport\s*\(/;
    const offenders = files(sim)
      .filter((f) => forbidden.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('keeps no mutable module-level state in the simulation', () => {
    // State that outlives a tick belongs in the simulation's state, where it is hashed and
    // saved. Module-level scratch buffers are fine as consts that are fully rewritten on use.
    const offenders = files(sim)
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
      for (const m of src.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)) {
        const next = resolve(f, m[1]!);
        if (next && existsSync(join(root, next)) && next.endsWith('.ts')) visit(join(root, next));
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

  it('keeps every layer of the simulation to the lane map', () => {
    // src/sim/lanes.ts says which layers each may import. A lane is reached only through
    // its index.ts, which is its contract; inside a layer, files import each other freely.
    const offenders: string[] = [];
    for (const f of files(sim)) {
      const from = relative(root, f);
      if (from === 'src/sim/lanes.ts') continue;
      const layer = layerOf(from);
      if (!layer) {
        offenders.push(`${from} is in no layer of the lane map`);
        continue;
      }
      for (const spec of specifiers(f)) {
        const target = resolve(f, spec);
        if (!target) continue;
        // The tuning is data, and the lane map is the table this test reads: any layer may read them.
        if (target.startsWith('src/config/') || target === 'src/sim/lanes.ts') continue;
        const to = layerOf(target);
        if (!to) {
          offenders.push(`${from} imports ${target}, outside every layer`);
          continue;
        }
        if (to === layer) continue;
        if (!LAYERS[layer].imports.includes(to)) offenders.push(`${from} (${layer}) imports ${target} (${to}), which the lane map doesn't allow`);
        else if (LAYERS[to].lane && target !== `src/sim/${to}/index.ts`) offenders.push(`${from} reaches into the ${to} lane past its index.ts: ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches every lane through its index.ts from outside the simulation, and keeps the tuning free of it', () => {
    const offenders: string[] = [];
    for (const dir of ['src/app', 'src/render', 'src/audio', 'src/headless', 'src/config']) {
      for (const f of files(join(root, dir))) {
        const from = relative(root, f);
        for (const spec of specifiers(f)) {
          const target = resolve(f, spec);
          if (!target?.startsWith('src/sim/')) continue;
          if (dir === 'src/config') offenders.push(`${from} imports ${target}: the tuning is data, and depends on nothing`);
          const to = layerOf(target);
          if (to && LAYERS[to].lane && target !== `src/sim/${to}/index.ts`) offenders.push(`${from} reaches into the ${to} lane past its index.ts: ${target}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every lane one index.ts', () => {
    const lanes = (Object.keys(LAYERS) as LayerName[]).filter((l) => LAYERS[l].lane);
    for (const l of lanes) expect(existsSync(join(sim, l, 'index.ts')), `src/sim/${l}/index.ts`).toBe(true);
    const dirs = readdirSync(sim).filter((d) => statSync(join(sim, d)).isDirectory());
    expect(dirs.sort()).toEqual((Object.keys(LAYERS) as string[]).sort());
  });

  it('keeps the kernel-alone test to the kernel', () => {
    // tests/kernel.test.ts shows the kernel stands alone, so it may use nothing else.
    const f = join(root, 'tests/kernel.test.ts');
    const offenders = specifiers(f)
      .map((spec) => resolve(f, spec))
      .filter((t): t is string => t !== null && !t.startsWith('src/sim/kernel/') && !t.startsWith('src/config/'));
    expect(offenders).toEqual([]);
  });

  it('keeps guard brains behind the perception boundary', () => {
    // A brain (the brain lane) decides from its GuardMind alone: its own body, its post,
    // the static world, the time and its percepts. It may not reach the state, the
    // simulation or the systems, where every entity's true state is: only the kernel's
    // math, world, events and environment, the other lanes' contracts, and the tuning.
    const allowed = /^(\.\/[\w/]+|\.\.\/kernel\/(core|world)\/\w+|\.\.\/kernel\/(events|env|sound)|\.\.\/(body|perception|generation)|\.\.\/\.\.\/config\/tuning)$/;
    const offenders: string[] = [];
    for (const f of files(join(sim, 'brain'))) {
      for (const spec of specifiers(f)) {
        if (!allowed.test(spec)) offenders.push(`${relative(root, f)} imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sorts only in total orders, with ties broken by an id or an index', () => {
    // Array.prototype.sort is stable, so equal elements keep their input order, but a
    // comparator that isn't a consistent total order lets engines order the same input
    // differently, and ties that fall back on input order move when that order does
    // (Jolt's warning about std::sort). So every comparator in the simulation either
    // chains its comparisons with || down to an id or an index, or says on its line why
    // its keys can't tie (`// unique: ...`). A sort with no comparator orders strings by
    // code unit, a total order.
    const offenders: string[] = [];
    for (const f of files(sim)) {
      const src = readFileSync(f, 'utf8');
      for (let at = src.indexOf('.sort('); at >= 0; at = src.indexOf('.sort(', at + 1)) {
        let depth = 0;
        let end = at + 5;
        for (; end < src.length; end++) {
          if (src[end] === '(') depth++;
          else if (src[end] === ')' && --depth === 0) break;
        }
        const comparator = src.slice(at + 6, end).trim();
        if (comparator === '') continue;
        const lineEnd = src.indexOf('\n', end);
        const line = src.slice(src.lastIndexOf('\n', at) + 1, lineEnd < 0 ? src.length : lineEnd);
        if (comparator.includes('||') || /\/\/ unique: /.test(line)) continue;
        offenders.push(`${relative(root, f)}: .sort(${comparator})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never calls Math.random inside the simulation', () => {
    const offenders = files(sim)
      .filter((f) => !f.endsWith('seed.ts')) // randomSeed() is UI-only and documented as such
      .filter((f) => /Math\.random/.test(code(f)))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
