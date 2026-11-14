import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * npm runs a script named `pre<name>` before `<name>`, and `post<name>` after it, by
 * itself. A script given such a name by accident runs whenever the other does. The quick
 * gate was `precheck` for a day, so `npm run check` ran it first, and on Windows, where it
 * couldn't start, the whole suite never ran (docs/decisions.md, Nov 14, 2026).
 */
describe('package.json scripts', () => {
  it("has no script that npm would run as another script's hook", () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    const names = Object.keys(pkg.scripts);
    const hooks = names.filter((n) => ['pre', 'post'].some((p) => n.startsWith(p) && names.includes(n.slice(p.length))));
    expect(hooks).toEqual([]);
  });
});
