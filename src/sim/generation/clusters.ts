import type { GenTuning } from '../../config/tuning';
import type { Witnesses } from './field';

/**
 * The sightline graph and its clusters (D7). Guards who can see each other drop form
 * clusters: kill one and the others notice, unless they're looking away, the shots are
 * chained inside the reaction window, or the cluster is split first (design doc, The
 * sightline puzzle). No published method clusters guards by mutual visibility over time
 * (docs/research/labs.md, Lab D), so this is lab D's own:
 *
 * - **Edges** are directed (a sees b drop) and carry the samples of the cycle when they hold
 *   (field.ts, witnessEdges). An edge that holds for at least `clusterDuty` of the cycle
 *   joins its guards.
 * - **Clusters** are the strongly connected components of those edges (Tarjan's algorithm,
 *   in guard order): an isolated sentry is a cluster of one, a mutual pair a cluster of two,
 *   the hard core round the target a cluster of three or more.
 * - **Certification:** a bounded search for a way to take the cluster apart from the perches:
 *   a kill order in which every guard who sees a kill is himself dropped within the reaction
 *   window, from the same perch (shots `shotInterval` apart), waiting for windows when the
 *   others look away, relocating between perches when nobody is pending, and optionally one
 *   distraction that turns one guard's eyes away for a few seconds. It stops after
 *   `clusterExpansions` (rule 18). Guards that no perch ever sees can't be shot, but they
 *   still witness.
 * - **The camp's kill order:** clusters are taken apart watchers first (a topological order
 *   of the clusters, a guard's cluster before the clusters of guards he watches), and each is
 *   certified with the guards already shot in earlier clusters dead. That is what splitting
 *   a cluster first means across the camp.
 *
 * A certified plan proves a cluster can be taken apart; 'unsolved' means only that the
 * bounded search found no way. Seeing the drop is all that counts here: what guards do on
 * finding a body later is the camp brain's (lab E).
 */
export interface Cluster {
  /** Guard indices (camp.guards), ascending. */
  members: number[];
  /** How it can be taken apart, or 'unsolved' if the search found no way within its budget. */
  certified: 'isolated' | 'window' | 'chain' | 'distraction' | 'out of sight' | 'unsolved';
  /** The kills, in order: guard, sample, perch. */
  kills: Array<{ guard: number; sample: number; perch: number }>;
  expanded: number;
}

/** Perch visibility: seen[(p·guards + g)·samples + k] is 1 where perch p sees guard g at sample k. */
export interface PerchSight {
  perches: number;
  guards: number;
  samples: number;
  seen: Uint8Array;
  /** Metres between two perches. */
  distance: Float32Array;
}

export function clusters(W: Witnesses, duty: Float32Array, gen: GenTuning): number[][] {
  const n = W.guards;
  const threshold = gen.analysis.clusterDuty;
  // Tarjan's strongly connected components, iteratively, in guard order.
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const out: number[][] = [];
  let counter = 0;
  const adj = (v: number): number[] => {
    const r: number[] = [];
    for (let w = 0; w < n; w++) if (w !== v && duty[v * n + w]! >= threshold) r.push(w);
    return r;
  };
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work: Array<{ v: number; next: number; edges: number[] }> = [{ v: root, next: 0, edges: adj(root) }];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = 1;
    while (work.length > 0) {
      const top = work[work.length - 1]!;
      if (top.next < top.edges.length) {
        const w = top.edges[top.next++]!;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          work.push({ v: w, next: 0, edges: adj(w) });
        } else if (onStack[w]) low[top.v] = Math.min(low[top.v]!, index[w]!);
        continue;
      }
      work.pop();
      if (work.length > 0) low[work[work.length - 1]!.v] = Math.min(low[work[work.length - 1]!.v]!, low[top.v]!);
      if (low[top.v] === index[top.v]) {
        const comp: number[] = [];
        for (;;) {
          const w = stack.pop()!;
          onStack[w] = 0;
          comp.push(w);
          if (w === top.v) break;
        }
        out.push(comp.sort((a, b) => a - b)); // unique: guard indices
      }
    }
  }
  return out.sort((a, b) => a[0]! - b[0]!); // unique: components share no guard
}

/**
 * When each perch next sees each guard: next[(p·guards + g)·samples + k] is the first
 * sample from k on (round the cycle, so up to k + samples) that perch p sees guard g, or −1
 * if it never does. Built once per camp; the certification search looks moments up in it.
 */
export function nextSightings(P: PerchSight): Int32Array {
  const K = P.samples;
  const next = new Int32Array(P.perches * P.guards * K).fill(-1);
  for (let p = 0; p < P.perches; p++) {
    for (let g = 0; g < P.guards; g++) {
      const base = (p * P.guards + g) * K;
      let first = -1;
      for (let k = 0; k < K; k++) if (P.seen[base + k]) {
        first = k;
        break;
      }
      if (first < 0) continue;
      let upcoming = first + K;
      for (let k = K - 1; k >= 0; k--) {
        if (P.seen[base + k]) upcoming = k;
        next[base + k] = upcoming;
      }
    }
  }
  return next;
}

/** What certification looks things up in, built once per camp. */
export interface Sightlines {
  W: Witnesses;
  P: PerchSight;
  /** nextSightings(P). */
  next: Int32Array;
  /** Who would see each guard drop: bit u of masks[g·samples + k] is set if guard u sees guard g at sample k. */
  masks: Int32Array;
}

/** At most 31 guards, for the bitmasks; staffing keeps far fewer (gen.staffing.maxGuards). */
export function sightlines(W: Witnesses, P: PerchSight): Sightlines {
  const n = Math.min(W.guards, 31);
  const K = W.samples;
  const masks = new Int32Array(W.guards * K);
  for (let k = 0; k < K; k++) {
    for (let u = 0; u < n; u++) {
      const row = (k * W.guards + u) * W.guards;
      for (let g = 0; g < W.guards; g++) if (W.edge[row + g]) masks[g * K + k] = masks[g * K + k]! | (1 << u);
    }
  }
  return { W, P, next: nextSightings(P), masks };
}

/**
 * The order to take clusters apart in: watchers first. Kahn's algorithm over the clusters,
 * with an edge from a's cluster to b's wherever a would see b drop for `clusterDuty` of the
 * cycle; among the clusters ready at once, the one with the lowest guard goes first.
 */
export function killOrder(parts: readonly number[][], duty: Float32Array, n: number, gen: GenTuning): number[] {
  const threshold = gen.analysis.clusterDuty;
  const of = new Int32Array(n).fill(-1);
  parts.forEach((members, i) => {
    for (const g of members) of[g] = i;
  });
  const m = parts.length;
  const into = new Int32Array(m);
  const out: Array<Set<number>> = parts.map(() => new Set<number>());
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const x = of[a]!;
      const y = of[b]!;
      if (x < 0 || y < 0 || x === y || duty[a * n + b]! < threshold || out[x]!.has(y)) continue;
      out[x]!.add(y);
      into[y] = into[y]! + 1;
    }
  }
  const order: number[] = [];
  const done = new Uint8Array(m);
  for (let step = 0; step < m; step++) {
    let pick = -1;
    for (let i = 0; i < m; i++) if (!done[i] && into[i] === 0 && (pick < 0 || parts[i]![0]! < parts[pick]![0]!)) pick = i;
    if (pick < 0) break; // can't happen: the clusters' graph has no cycles
    done[pick] = 1;
    order.push(pick);
    for (const y of out[pick]!) into[y] = into[y]! - 1;
  }
  return order;
}

/** Every cluster, certified in kill order with the guards shot before it dead; returned in that order. */
export function takeApart(W: Witnesses, duty: Float32Array, S: Sightlines, gen: GenTuning): Cluster[] {
  const parts = clusters(W, duty, gen);
  let dead = 0;
  const out: Cluster[] = [];
  for (const i of killOrder(parts, duty, W.guards, gen)) {
    const c = certify(parts[i]!, S, gen, dead);
    for (const k of c.kills) dead |= 1 << k.guard;
    out.push(c);
  }
  return out;
}

/**
 * Certifies one cluster: can its members be shot from the perches with no surviving witness?
 * `dead` is a bitmask of guards already shot (in earlier clusters).
 */
export function certify(members: readonly number[], S: Sightlines, gen: GenTuning, dead = 0): Cluster {
  const { W, P, next, masks } = S;
  const A = gen.analysis;
  const K = W.samples;
  const n = W.guards;
  const reach = Math.max(1, Math.round(A.reaction / A.dt));
  const gap = Math.max(1, Math.ceil(A.shotInterval / A.dt - 1e-9));
  const look = Math.round(6 / A.dt); // a distraction turns a guard's eyes for six seconds
  const horizon = 3 * K;
  // The perches that ever see each guard.
  const perchesOf: number[][] = [];
  for (let g = 0; g < n; g++) {
    const list: number[] = [];
    for (let p = 0; p < P.perches; p++) if (next[(p * P.guards + g) * K] >= 0) list.push(p);
    perchesOf.push(list);
  }
  const shootable = members.filter((g) => perchesOf[g]!.length > 0 && (dead & (1 << g)) === 0);
  if (members.every((g) => (dead & (1 << g)) !== 0)) return { members: [...members], certified: 'chain', kills: [], expanded: 0 };
  if (shootable.length === 0) return { members: [...members], certified: 'out of sight', kills: [], expanded: 0 };
  /** The first sample from k on that perch p sees guard g, or −1. */
  const nextSeen = (p: number, g: number, k: number): number => {
    const cycles = Math.floor(k / K);
    const at = next[(p * P.guards + g) * K + (k - cycles * K)]!;
    return at < 0 ? -1 : at + cycles * K;
  };
  /** The first sample from k on that perch p sees guard v with none of `alive` watching him (ignoring distractions), or −1. */
  const clean = new Map<number, Int32Array>();
  const nextClean = (alive: number, v: number, p: number, k: number): number => {
    const key = (alive * n + v) * P.perches + p;
    let table = clean.get(key);
    if (!table) {
      table = new Int32Array(K).fill(-1);
      const others = alive & ~(1 << v);
      const base = (p * P.guards + v) * K;
      const ok = (q: number): boolean => P.seen[base + q] === 1 && (masks[v * K + q]! & others) === 0;
      let first = -1;
      for (let q = 0; q < K && first < 0; q++) if (ok(q)) first = q;
      if (first >= 0) {
        let upcoming = first + K;
        for (let q = K - 1; q >= 0; q--) {
          if (ok(q)) upcoming = q;
          table[q] = upcoming;
        }
      }
      clean.set(key, table);
    }
    const cycles = Math.floor(k / K);
    const at = table[k - cycles * K]!;
    return at < 0 ? -1 : at + cycles * K;
  };
  let expanded = 0;
  let solution: Array<{ guard: number; sample: number; perch: number; witnessed: number }> | null = null;

  interface State {
    alive: number;
    time: number;
    perch: number;
    pending: Array<{ g: number; by: number }>;
    kills: Array<{ guard: number; sample: number; perch: number; witnessed: number }>;
    distracted: { g: number; from: number } | null;
  }
  const distractedAt = (s: State, k: number): boolean => s.distracted !== null && k >= s.distracted.from && k < s.distracted.from + look;
  const witnessesOf = (s: State, v: number, k: number): number[] => {
    let mask = masks[v * K + (k % K)]! & s.alive & ~(1 << v);
    if (distractedAt(s, k)) mask &= ~(1 << s.distracted!.g);
    const out: number[] = [];
    for (let u = 0; mask !== 0 && u < n; u++) {
      if (mask & (1 << u)) {
        out.push(u);
        mask &= ~(1 << u);
      }
    }
    return out;
  };
  const BEAM = 6;
  const dfs = (s: State): boolean => {
    if (expanded++ >= A.clusterExpansions) return false;
    const targets: number[] = [];
    for (const g of shootable) if (s.alive & (1 << g)) targets.push(g);
    for (const p of s.pending) if (!targets.includes(p.g)) targets.push(p.g);
    if (targets.length === 0) {
      solution = s.kills;
      return true;
    }
    const deadline = s.pending.length > 0 ? Math.min(...s.pending.map((p) => p.by)) : horizon;
    const options: Array<{ v: number; p: number; k: number; w: number[] }> = [];
    for (const v of targets) {
      for (const p of perchesOf[v]!) {
        if (s.pending.length > 0 && p !== s.perch) continue; // a chain is shot from one place
        const ready = s.perch < 0 ? s.time : p === s.perch ? s.time + gap : s.time + Math.ceil(P.distance[s.perch * P.perches + p]! / A.relocate / A.dt);
        const limit = Math.min(deadline, horizon);
        const k = nextSeen(p, v, ready);
        if (k < 0 || k > limit) continue;
        const w = witnessesOf(s, v, k);
        options.push({ v, p, k, w });
        if (w.length === 0) continue;
        // Or wait for a window: the next moment nobody alive is watching him...
        const quiet = nextClean(s.alive, v, p, ready);
        let best = quiet >= 0 && quiet <= limit ? quiet : -1;
        // ...or one inside the distraction, if it comes sooner.
        if (s.distracted) {
          const end = Math.min(limit, s.distracted.from + look - 1, best >= 0 ? best - 1 : limit);
          for (let q = Math.max(k + 1, s.distracted.from); q <= end; q++) {
            if (P.seen[(p * P.guards + v) * K + (q % K)] && witnessesOf(s, v, q).length === 0) {
              best = q;
              break;
            }
          }
        }
        if (best > k) options.push({ v, p, k: best, w: [] });
      }
    }
    // Clean shots first, then the soonest; a handful of the best are tried.
    options.sort((x, y) => x.w.length - y.w.length || x.k - y.k || x.v - y.v || x.p - y.p); // unique: (v, p, k) triples are distinct
    for (const o of options.slice(0, BEAM)) {
      const pending = s.pending.filter((x) => x.g !== o.v).map((x) => ({ ...x }));
      for (const w of o.w) {
        const old = pending.find((x) => x.g === w);
        if (old) old.by = Math.min(old.by, o.k + reach);
        else pending.push({ g: w, by: o.k + reach });
      }
      const nextState: State = {
        alive: s.alive & ~(1 << o.v),
        time: o.k,
        perch: o.p,
        pending,
        kills: [...s.kills, { guard: o.v, sample: o.k, perch: o.p, witnessed: o.w.length }],
        distracted: s.distracted,
      };
      if (dfs(nextState)) return true;
      if (expanded >= A.clusterExpansions) return false;
    }
    return false;
  };
  const start = (time = 0, distracted: State['distracted'] = null): State => ({ alive: allAlive(n) & ~dead, time, perch: -1, pending: [], kills: [], distracted });
  const result = (certified: Cluster['certified']): Cluster => ({ members: [...members], certified, kills: (solution ?? []).map(({ guard, sample, perch }) => ({ guard, sample, perch })), expanded });
  if (dfs(start())) {
    const chained = solution!.some((k) => k.witnessed > 0);
    return result(members.length === 1 ? 'isolated' : chained ? 'chain' : 'window');
  }
  // One distraction: a guard who would see a member drop looks away for a few seconds, from
  // one of twelve moments of the cycle.
  let watchers = 0;
  for (const v of members) for (let k = 0; k < K; k++) watchers |= masks[v * K + k]!;
  watchers &= allAlive(n) & ~dead;
  for (let g = 0; g < n; g++) {
    if ((watchers & (1 << g)) === 0) continue;
    for (let m = 0; m < 12 && expanded < A.clusterExpansions; m++) {
      const from = Math.round((m * K) / 12);
      if (dfs(start(from, { g, from }))) return result('distraction');
    }
  }
  return { members: [...members], certified: 'unsolved', kills: [], expanded };
}

function allAlive(n: number): number {
  return n >= 31 ? 0x7fffffff : (1 << n) - 1;
}
