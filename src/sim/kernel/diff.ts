import type { SimState } from './state';

/**
 * Where two state trees differ, path by path: what turns "the hash moved" into
 * "guard:4.body.x: 12.5 → 12.75". Entities are matched by id, not by their place in the
 * list, and named by kind and id, so a spawned or removed entity shows as itself.
 * `npm run explain` and `npm run bisect` print these.
 */
export interface Difference {
  /** Such as `guard:4.body.x`, `rng["4.step"][0]` or `schedule.queue`. */
  path: string;
  /** The value in each tree, or undefined where the path is absent from it. */
  from: unknown;
  to: unknown;
}

/** Up to `limit` differences between two states, in a fixed order: top-level fields, then entities by id. */
export function diffStates(a: SimState, b: SimState, limit = 20): Difference[] {
  const out: Difference[] = [];
  const ta = a as unknown as Record<string, unknown>;
  const tb = b as unknown as Record<string, unknown>;
  for (const key of union(Object.keys(ta), Object.keys(tb))) {
    if (key === 'entities') continue;
    walk(ta[key], tb[key], key, out, limit);
  }
  const ea = new Map(a.entities.map((e) => [e.id, e]));
  const eb = new Map(b.entities.map((e) => [e.id, e]));
  const ids = [...new Set([...ea.keys(), ...eb.keys()])].sort((x, y) => x - y);
  for (const id of ids) {
    const x = ea.get(id);
    const y = eb.get(id);
    walk(x, y, `${(x ?? y)!.kind}:${id}`, out, limit);
  }
  return out.slice(0, limit);
}

/** A value as a diff shows it: numbers in full, strings quoted, trees summarized. */
export function show(v: unknown): string {
  if (v === undefined) return '(absent)';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).length} fields}`;
  return String(v);
}

function walk(x: unknown, y: unknown, path: string, out: Difference[], limit: number): void {
  if (out.length >= limit) return;
  if (x === y || (typeof x === 'number' && typeof y === 'number' && Object.is(x, y))) return;
  const tree = (v: unknown): v is object => v !== null && typeof v === 'object';
  if (!tree(x) || !tree(y) || Array.isArray(x) !== Array.isArray(y)) {
    out.push({ path, from: x, to: y });
    return;
  }
  if (Array.isArray(x) && Array.isArray(y)) {
    for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`, out, limit);
    return;
  }
  const rx = x as Record<string, unknown>;
  const ry = y as Record<string, unknown>;
  for (const k of union(Object.keys(rx), Object.keys(ry))) walk(rx[k], ry[k], /^[A-Za-z_]\w*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`, out, limit);
}

/** Both lists' keys, once each, in sorted order (code-unit order, the same everywhere). */
function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
}
