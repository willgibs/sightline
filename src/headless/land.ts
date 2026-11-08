/**
 * Lands a pull request on main the way docs/phase-1-plan.md (Landing on main) says: one
 * at a time, from a branch that is up to date with main and green there. Two pull
 * requests that are each green on their own can still leave main's goldens wrong
 * together, so a branch behind main is refused: rebase it, regenerate its goldens
 * (`npm run golden`, `npm run bench -- --write`, and the values in golden.ts), push, and
 * land it once CI is green again.
 *
 *   npm run land -- 12          land pull request 12
 *   npm run land -- 12 --check  say whether it could land, and change nothing
 *
 * The repository's plan has no merge queue or branch rule (they need an organization, or
 * GitHub Pro, or a public repository), so this script and CI's "Up to date with main"
 * check are the rule.
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const pr = argv.find((a) => /^\d+$/.test(a));
const checkOnly = argv.includes('--check');
if (!pr) {
  console.error('Usage: npm run land -- <pull request number> [--check]');
  process.exit(2);
}

const sh = (cmd: string, ...a: string[]): string => execFileSync(cmd, a, { encoding: 'utf8' }).trim();
const refuse = (why: string): never => {
  console.error(`✗ pull request ${pr} can't land: ${why}`);
  process.exit(1);
};

/**
 * GitHub reports two kinds of check: check runs (Actions' jobs: a name, a status and a
 * conclusion) and commit statuses (Vercel's deploys: a context and a state).
 */
interface Check {
  __typename: 'CheckRun' | 'StatusContext';
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  context?: string | null;
  state?: string | null;
}
const view = JSON.parse(sh('gh', 'pr', 'view', pr, '--json', 'state,isDraft,baseRefName,headRefName,headRefOid,statusCheckRollup')) as {
  state: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  statusCheckRollup: Check[];
};
if (view.state !== 'OPEN') refuse(`it is ${view.state.toLowerCase()}`);
if (view.isDraft) refuse('it is a draft');
if (view.baseRefName !== 'main') refuse(`it targets ${view.baseRefName}, not main`);

sh('git', 'fetch', '--quiet', 'origin', 'main', view.headRefName);
const main = sh('git', 'rev-parse', 'origin/main');
try {
  execFileSync('git', ['merge-base', '--is-ancestor', main, view.headRefOid]);
} catch {
  refuse(`${view.headRefName} is behind main (${main.slice(0, 7)}): rebase it, regenerate its goldens, push, and land it when CI is green`);
}

const checks = view.statusCheckRollup.map((c) =>
  c.__typename === 'StatusContext'
    ? { name: c.context ?? 'a status', done: c.state !== 'PENDING' && c.state !== 'EXPECTED', outcome: c.state ?? '' }
    : { name: c.name ?? 'a check', done: c.status === 'COMPLETED', outcome: c.conclusion ?? '' },
);
if (checks.length === 0) refuse('CI has not run on its head yet');
const pending = checks.filter((c) => !c.done);
if (pending.length > 0) refuse(`CI is still running: ${pending.map((c) => c.name).join(', ')}`);
const failed = checks.filter((c) => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.outcome));
if (failed.length > 0) refuse(`CI isn't green: ${failed.map((c) => `${c.name} (${c.outcome.toLowerCase()})`).join(', ')}`);

console.log(`✓ ${view.headRefName} (${view.headRefOid.slice(0, 7)}) is up to date with main and green.`);
if (checkOnly) process.exit(0);
// --match-head-commit: if anything was pushed since these checks, GitHub refuses the merge.
sh('gh', 'pr', 'merge', pr, '--merge', '--match-head-commit', view.headRefOid);
console.log(`✓ landed pull request ${pr}. main's CI runs next: \`gh run list --branch main --limit 2\`.`);
