import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { deal } from './deal';

/**
 * Deals the test files out to CI's shards by how long each took on CI's Linux machines
 * (tests/timings.json, which `npm run timings` refreshes from main's last green run).
 * Vitest's own deal goes by a hash of the files' names, which once left one of three shards
 * at six minutes and another at ten. Here the dearest file goes first, each to whichever
 * shard is lightest so far; a file with no timing yet counts as the median. Every shard
 * makes the same deal, from the same files and the same timings.
 *
 * Within a shard, and in a run of the whole suite, the dearest files start first, so the
 * last to start is a short one; a file that failed in the last run here still goes first.
 */
export class TimedSequencer extends BaseSequencer {
  private seconds?: { of: Map<string, number>; median: number };

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard!;
    return deal(files.map((f) => ({ key: this.key(f), cost: this.cost(f), item: f })), count)[index - 1] ?? [];
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const failed = (f: TestSpecification): number => (this.ctx.cache.getTestSpecificationResult(f)?.failed ? 1 : 0);
    return [...files].sort((a, b) => failed(b) - failed(a) || this.cost(b) - this.cost(a) || compare(this.key(a), this.key(b)));
  }

  /** The file's path from the root, with forward slashes on every platform: its key in tests/timings.json. */
  private key(f: TestSpecification): string {
    return relative(this.ctx.config.root, f.moduleId).split(sep).join('/');
  }

  private cost(f: TestSpecification): number {
    if (!this.seconds) {
      let of = new Map<string, number>();
      try {
        of = new Map(Object.entries(JSON.parse(readFileSync(join(this.ctx.config.root, 'tests/timings.json'), 'utf8')) as Record<string, number>));
      } catch {
        // No timings: every file counts the same, and the deal goes by name.
      }
      const known = [...of.values()].sort((a, b) => a - b);
      this.seconds = { of, median: known.length ? known[Math.floor(known.length / 2)]! : 1 };
    }
    return this.seconds.of.get(this.key(f)) ?? this.seconds.median;
  }
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
