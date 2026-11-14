/**
 * Deals items out to `count` shards: the dearest first (ties by key), each to whichever
 * shard is lightest so far, the lowest-numbered of equals. Every item goes to exactly one
 * shard, and no shard ends heavier than the lightest by more than the dearest single item.
 * Pure, so the tests can hold it without loading the test runner (tests/sequencer.ts).
 */
export function deal<T>(items: ReadonlyArray<{ key: string; cost: number; item: T }>, count: number): T[][] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`a deal is to one shard or more, not ${count}`);
  const shards = Array.from({ length: count }, () => ({ cost: 0, items: [] as T[] }));
  for (const it of [...items].sort((a, b) => b.cost - a.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    let lightest = shards[0]!;
    for (const s of shards) if (s.cost < lightest.cost) lightest = s;
    lightest.cost += it.cost;
    lightest.items.push(it.item);
  }
  return shards.map((s) => s.items);
}
