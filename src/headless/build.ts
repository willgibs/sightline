import { execSync } from 'node:child_process';

/**
 * The build stamp recordings carry: the commit Vercel is building, or the local
 * checkout's, marked when it has uncommitted changes. Used by vite.config.ts and the
 * headless tools (Node only).
 */
export function buildStamp(): string {
  const vercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercel) return vercel.slice(0, 12);
  try {
    const run = (cmd: string): string => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sha = run('git rev-parse --short=12 HEAD');
    return run('git status --porcelain') !== '' ? `${sha}+local` : sha;
  } catch {
    return 'unknown';
  }
}
