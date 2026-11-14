/**
 * Refreshes tests/timings.json, by which CI's test shards are dealt (tests/sequencer.ts),
 * from main's last green CI run: each Linux test shard uploads vitest's JSON report as the
 * artifact `test-times-<k>`. Run it when the shards' times drift apart (the CI run's Tests
 * jobs say how long each took), and commit the file.
 *
 *   npm run timings                 from main's last green run
 *   npm run timings -- --run <id>   from that run
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from './args';
import { REPO } from './builds';

interface Report {
  testResults: Array<{ name: string; startTime: number; endTime: number }>;
}

const args = parseArgs(process.argv.slice(2));
const gh = (...a: string[]): string => execFileSync('gh', a, { cwd: REPO, encoding: 'utf8' }).trim();

const run = args.get('run') ?? gh('run', 'list', '--branch', 'main', '--workflow', 'CI', '--event', 'push', '--status', 'success', '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId');
if (!run) throw new Error('main has no green CI run to take the times from');
const dir = mkdtempSync(join(tmpdir(), 'sightline-timings-'));
try {
  gh('run', 'download', run, '--pattern', 'test-times-*', '--dir', dir);
  const seconds = new Map<string, number>();
  for (const artifact of readdirSync(dir).sort()) {
    const file = join(dir, artifact, 'test-times.json');
    if (!existsSync(file)) continue;
    for (const r of (JSON.parse(readFileSync(file, 'utf8')) as Report).testResults) {
      // The runner's absolute path, from the repository's tests folder on.
      const path = r.name.replace(/\\/g, '/');
      const at = path.lastIndexOf('/tests/');
      if (at >= 0) seconds.set(path.slice(at + 1), Math.round((r.endTime - r.startTime) / 100) / 10);
    }
  }
  if (seconds.size === 0) throw new Error(`run ${run} has no test-times reports: it may predate them, or its test jobs didn't run`);
  const sorted = [...seconds].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  writeFileSync(join(REPO, 'tests/timings.json'), JSON.stringify(Object.fromEntries(sorted), null, 1) + '\n');
  const total = sorted.reduce((s, [, t]) => s + t, 0);
  console.log(`tests/timings.json: ${seconds.size} files from run ${run}, ${Math.round(total)} s of tests in all; the dearest ${sorted.sort((a, b) => b[1] - a[1])[0]!.join(', ')} s.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
