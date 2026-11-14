/**
 * Lands a pull request on main the way docs/phase-1-plan.md (Landing on main) says: one
 * at a time, from a branch that is up to date with main and green there. Two pull
 * requests that are each green on their own can still leave main's goldens wrong
 * together, so a branch behind main is refused: merge main into it (a session can't
 * force-push a rebase), regenerate its goldens (`npm run golden`, `npm run bench --
 * --write`, and the values in golden.ts), push, and land it once CI is green again.
 *
 *   npm run land -- 12               land pull request 12
 *   npm run land -- 12 --check       say whether it could land, and change nothing
 *   npm run land -- 12 --fixes-main  land it though main's own CI is red, because it's the fix
 *
 * A pull request's checks say nothing about main itself, and some faults show only in
 * main's runs: the whole suite on macOS and Windows runs there alone. One such fault went
 * on under two more landings (pull requests 57 to 60). So a landing also needs the latest
 * finished push run of each of main's workflows to be green.
 *
 * A merge queue needs an organization, and no branch rule is set on main (the owner's
 * call), so this script and CI's "Up to date with main" check are the rule.
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const pr = argv.find((a) => /^\d+$/.test(a));
const checkOnly = argv.includes('--check');
const fixesMain = argv.includes('--fixes-main');
if (!pr) {
  console.error('Usage: npm run land -- <pull request number> [--check] [--fixes-main]');
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
  targetUrl?: string | null;
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
  refuse(`${view.headRefName} is behind main (${main.slice(0, 7)}): merge main into it, regenerate its goldens, push, and land it when CI is green`);
}

/**
 * Vercel's free plan allows 100 deployments a day. Past that, a commit's Vercel status
 * fails with a link to the upgrade page and stays red until something new is pushed.
 * CI builds the game itself, so this one failure says nothing about the code, and it is
 * the only red this script looks past: any other failed deploy still stops a landing.
 */
const rateLimited = (c: Check): boolean => c.__typename === 'StatusContext' && c.context === 'Vercel' && c.state === 'FAILURE' && (c.targetUrl ?? '').includes('build-rate-limit');

const checks = view.statusCheckRollup.filter((c) => !rateLimited(c)).map((c) =>
  c.__typename === 'StatusContext'
    ? { name: c.context ?? 'a status', done: c.state !== 'PENDING' && c.state !== 'EXPECTED', outcome: c.state ?? '' }
    : { name: c.name ?? 'a check', done: c.status === 'COMPLETED', outcome: c.conclusion ?? '' },
);
if (checks.length === 0) refuse('CI has not run on its head yet');
const pending = checks.filter((c) => !c.done);
if (pending.length > 0) refuse(`CI is still running: ${pending.map((c) => c.name).join(', ')}`);
const failed = checks.filter((c) => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.outcome));
if (failed.length > 0) refuse(`CI isn't green: ${failed.map((c) => `${c.name} (${c.outcome.toLowerCase()})`).join(', ')}`);

/**
 * Each of main's workflows, by its latest finished run on a push. A cancelled run says
 * nothing either way, so the one before it counts. A newer run may still be going: a red
 * one still stops a landing until it's green, or until the fix lands with --fixes-main.
 */
const MAIN_WORKFLOWS = ['CI', 'Engines', 'Standing benches'];
const red: string[] = [];
for (const workflow of MAIN_WORKFLOWS) {
  const runs = JSON.parse(sh('gh', 'run', 'list', '--branch', 'main', '--workflow', workflow, '--event', 'push', '--status', 'completed', '--limit', '10', '--json', 'conclusion,headSha,url')) as Array<{ conclusion: string; headSha: string; url: string }>;
  const last = runs.find((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  if (last && last.conclusion !== 'success') red.push(`${workflow} at ${last.headSha.slice(0, 7)} (${last.conclusion}: ${last.url})`);
}
if (red.length > 0 && !fixesMain) refuse(`main's own CI is red: ${red.join('; ')}. Fix main first, or land the fix with --fixes-main`);

console.log(`✓ ${view.headRefName} (${view.headRefOid.slice(0, 7)}) is up to date with main and green.`);
if (red.length > 0) console.log(`! main's own CI is red (${red.join('; ')}), and this lands as its fix.`);
else console.log("✓ main's own CI is green.");
if (view.statusCheckRollup.some(rateLimited)) {
  console.log("! Vercel's daily limit is spent, so this commit wasn't deployed. CI built the game, so that doesn't hold up the landing, but the live site won't change until a push to main after room returns.");
}
if (checkOnly) process.exit(0);
// --match-head-commit: if anything was pushed since these checks, GitHub refuses the merge.
sh('gh', 'pr', 'merge', pr, '--merge', '--match-head-commit', view.headRefOid);
console.log(`✓ landed pull request ${pr}. main's CI runs next: \`gh run list --branch main --limit 2\`.`);
