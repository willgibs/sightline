/**
 * Another build of the game, beside this checkout: a commit checked out in a temporary
 * git worktree, sharing this checkout's node_modules, whose headless tools can be run and
 * compared with this checkout's (`npm run explain`, `npm run bisect`).
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** This checkout's root. */
export const REPO = fileURLToPath(new URL('../..', import.meta.url));
const TSX = join(REPO, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

export const git = (...a: string[]): string => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();

/** Runs one of a build's headless tools (src/headless/<script>) and returns what it printed. */
export async function tool(dir: string, script: string, ...a: string[]): Promise<string> {
  const { stdout } = await run(TSX, [join('src/headless', script), ...a], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

/** True if the build in `dir` has this headless tool, and its source mentions `option` when given. */
export function hasTool(dir: string, script: string, option?: string): boolean {
  const path = join(dir, 'src/headless', script);
  return existsSync(path) && (option === undefined || readFileSync(path, 'utf8').includes(option));
}

/** Checks out `sha` in a temporary worktree, runs `use` with its path, and removes it again. */
export async function withBuild<T>(sha: string, use: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'sightline-build-'));
  try {
    git('worktree', 'add', '--detach', '--quiet', dir, sha);
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
    return await use(dir);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO, stdio: 'ignore' });
    } catch {
      // Already gone; prune below.
    }
    rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['worktree', 'prune'], { cwd: REPO });
  }
}
