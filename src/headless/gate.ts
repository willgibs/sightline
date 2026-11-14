/**
 * The quick gate before a push, a minute or two: the typecheck, the architecture test
 * with every test file this branch changed or added against origin/main (committed or
 * not), and the self-test. It stops at the first step that fails and says which.
 *
 *   npm run gate
 *
 * It is not `npm run check`: the whole suite still runs in CI on every pull request. And
 * it is never to be called `precheck`. npm runs a script named `pre<name>` before `<name>`
 * by itself, so under that name `npm run check` ran this first, and on Windows, where it
 * couldn't start, the whole suite never ran (tests/scripts.test.ts holds the rule).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './builds';

const git = (...a: string[]): string | null => {
  try {
    return execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

function step(name: string, command: string, a: string[]): void {
  console.log(`\n▸ ${name}: ${[command, ...a].join(' ')}\n`);
  const started = performance.now();
  // On Windows npm and npx are .cmd files, which Node starts only through a shell.
  const r = spawnSync(command, a, { cwd: REPO, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.log(`\ngate: ${name} failed${r.status === null ? ` (${r.signal ?? r.error?.message})` : ''}.`);
    process.exit(1);
  }
  console.log(`\n${name}: passed in ${((performance.now() - started) / 1000).toFixed(0)} s.`);
}

/** Test files this branch changed or added against origin/main, or null if origin/main can't be found. */
function changedTests(): string[] | null {
  if (git('rev-parse', '--verify', '--quiet', 'origin/main^{commit}') === null) return null;
  const lists = [git('diff', '--name-only', '--diff-filter=d', 'origin/main...HEAD'), git('diff', '--name-only', '--diff-filter=d', 'HEAD'), git('ls-files', '--others', '--exclude-standard', 'tests')];
  const files = new Set(lists.flatMap((l) => (l ?? '').split('\n')).filter((f) => /^tests\/[^/]+\.test\.ts$/.test(f) && existsSync(join(REPO, f))));
  return [...files].sort();
}

step('typecheck', 'npm', ['run', 'typecheck']);
const changed = changedTests();
if (changed === null) console.log("\ngate: origin/main can't be resolved, so there are no changed tests to pick; skipping the tests (git fetch origin, then run it again).");
else {
  const tests = [...new Set(['tests/architecture.test.ts', ...changed])];
  step(`tests (${tests.length})`, 'npx', ['vitest', 'run', ...tests]);
}
step('self-test', 'npm', ['run', 'selftest']);
console.log('\ngate: all passed.');
