/**
 * One scene's ticks, timed: the part of `npm run hitches` that runs in a process of its
 * own, built as the game's own code is built (headless/hitches.ts says why).
 *
 *   node hitchRun.mjs <scene> <params> <warm runs> <list over ms> <rehearse: 1 or 0>
 *
 * Two things in the environment, for finding out why a tick was slow the first time only:
 * - `HITCH_TICK`, a tick counted from 1: that tick is profiled in the first run and in the
 *   first warm one, and the functions it spent its time in are listed side by side.
 * - `HITCH_MARK`, a number of ticks: the first run says where it has got to that often, for
 *   whoever is reading the engine's own trace beside it (hitches.ts, `--deopts`).
 */
import inspector from 'node:inspector';
import { defaultTuning } from '../config/tuning';
import { HITCH_MARK } from './hitchMark';
import { rehearse, rehearseFirefight, rehearseHunt } from '../sim/game/rehearsal';
import { SCENES } from '../sim/game/scenes';
import type { Simulation } from '../sim/game/sim';
import { sceneOver, sceneTicks, startScene, type Scene } from '../sim/kernel/scene';
import type { System } from '../sim/kernel/systems';
import type { World } from '../sim/kernel/world/world';

interface Cost {
  ms: number;
  nodes: number;
  rays: number;
}

const [name = 'compound', params = '', warmRuns = '3', listOver = '4', rehearsed = '1'] = process.argv.slice(2);
const make = SCENES[name];
if (!make) {
  console.error(`No scene called ${name}. Scenes: ${Object.keys(SCENES).join(', ')}`);
  process.exit(2);
}
const scene = make(params || undefined) as Scene<Simulation>;
const T = defaultTuning;
const limit = Number(listOver);
const profiled = Number(process.env.HITCH_TICK ?? 0);
const markEvery = Number(process.env.HITCH_MARK ?? 0);

/** A profile as the inspector gives it: a tree of calls, and which node each sample fell in. */
interface Profile {
  nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }>;
  samples: number[];
  timeDeltas: number[];
}

let session: inspector.Session | null = null;
/** Asks the inspector for something. In the process it's inspecting, it answers before `post` returns. */
function ask(method: string, params?: object): unknown {
  if (!session) {
    session = new inspector.Session();
    session.connect();
  }
  let answer: unknown;
  let failed: Error | null = null;
  let answered = false;
  (session.post as (m: string, p: object | undefined, cb: (e: Error | null, r: unknown) => void) => void)(method, params, (e, r) => {
    failed = e;
    answer = r;
    answered = true;
  });
  if (!answered) throw new Error(`the inspector didn't answer ${method} at once`);
  if (failed) throw failed;
  return answer;
}
if (profiled > 0) {
  ask('Profiler.enable');
  // Twenty microseconds: a tick worth asking about is a few milliseconds long.
  ask('Profiler.setSamplingInterval', { interval: 20 });
}

/** Milliseconds a profiled tick spent in each function: in its own code, and with everything it called. */
function timesOf(profile: Profile): Map<string, { self: number; total: number }> {
  const byId = new Map<number, Profile['nodes'][number]>();
  const parent = new Map<number, number>();
  const named = new Map<string, Set<number>>();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
    const lines = named.get(n.callFrame.functionName) ?? new Set<number>();
    lines.add(n.callFrame.lineNumber);
    named.set(n.callFrame.functionName, lines);
  }
  // A name is enough unless two functions share it (every system's is `run`): then the line it starts on in the built file tells them apart.
  const key = (id: number): string | null => {
    const f = byId.get(id)!.callFrame;
    // Not the scene's: the inspector's own, this file's top level, and the two functions here that a tick runs under.
    if (f.url.startsWith('node:') || f.functionName === '' || f.functionName === '(root)' || f.functionName === '(program)' || f.functionName === '(idle)' || f.functionName === 'timedRun' || f.functionName === 'ask') return null;
    const name = f.functionName;
    return (named.get(f.functionName)?.size ?? 1) > 1 ? `${name} :${f.lineNumber + 1}` : name;
  };
  const out = new Map<string, { self: number; total: number }>();
  const at = (k: string): { self: number; total: number } => {
    let v = out.get(k);
    if (!v) {
      v = { self: 0, total: 0 };
      out.set(k, v);
    }
    return v;
  };
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
    const own = key(id);
    if (own) at(own).self += ms;
    const seen = new Set<string>();
    for (let up: number | undefined = id; up !== undefined; up = parent.get(up)) {
      const k = key(up);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      at(k).total += ms;
    }
  });
  return out;
}

/** One run of the scene: each tick's time, and each system's time and work in it. */
function timedRun(world: World | undefined, isFirst = false): { world: World; ticks: number[]; systems: Map<string, Cost>[]; profile: Profile | null } {
  const sim = startScene(scene, T, world);
  const driver = scene.driver?.();
  const raw = scene.game.still(sim);
  const total = Math.min(sceneTicks(scene, T), 5 * 60 * T.sim.tickHz);
  const ticks: number[] = [];
  const systems: Map<string, Cost>[] = [];
  let now = new Map<string, Cost>();
  let began = 0;
  const before = new Map<string, { nodes: number; rays: number }>();
  for (const w of sim.work()) before.set(w.system, { nodes: w.nodes, rays: w.rays });
  sim.profiler = {
    begin: () => {
      began = performance.now();
    },
    end: (system: System) => {
      now.set(system.name, { ms: performance.now() - began, nodes: 0, rays: 0 });
    },
  };
  let profile: Profile | null = null;
  for (let i = 0; i < total && !sceneOver(scene, sim, total); i++) {
    now = new Map();
    if (isFirst && markEvery > 0 && i % markEvery === 0) console.log(`${HITCH_MARK} tick ${i + 1}`);
    const watched = i === profiled - 1;
    if (watched) ask('Profiler.start');
    const t0 = performance.now();
    sim.step(driver ? driver.next(sim, raw) : raw);
    ticks.push(performance.now() - t0);
    if (watched) profile = (ask('Profiler.stop') as { profile: Profile }).profile;
    // The work each system did this tick: what it has done so far, less what it had.
    for (const w of sim.work()) {
      const was = before.get(w.system)!;
      const cost = now.get(w.system);
      if (cost) {
        cost.nodes = w.nodes - was.nodes;
        cost.rays = w.rays - was.rays;
      }
      was.nodes = w.nodes;
      was.rays = w.rays;
    }
    systems.push(now);
  }
  if (isFirst && markEvery > 0) console.log(`${HITCH_MARK} over`);
  return { world: sim.world as World, ticks, systems, profile };
}

function line(label: string, ticks: readonly number[]): string {
  const sorted = [...ticks].sort((a, b) => a - b);
  const at = (q: number): string => sorted[Math.floor(q * (sorted.length - 1))]!.toFixed(2);
  const worst = ticks.indexOf(sorted[sorted.length - 1]!);
  const over = (ms: number): number => ticks.filter((d) => d > ms).length;
  const mean = ticks.reduce((a, b) => a + b, 0) / ticks.length;
  return `  ${label.padEnd(34)} mean ${mean.toFixed(3)} ms · p99 ${at(0.99)} · p99.9 ${at(0.999)} · worst ${at(1)} at tick ${worst + 1} · over 4 ms: ${over(4)}, 8: ${over(8)}, 16: ${over(16)}, 33: ${over(33)}`;
}

// The world is built first, in a run that isn't timed: the timed runs then differ only in how warm they are.
const built = performance.now();
let world = startScene(scene, T).world as World;
const buildMs = performance.now() - built;
let rehearsalMs = 0;
if (rehearsed === '1') {
  const t0 = performance.now();
  rehearse(world, T);
  rehearseFirefight(world, T);
  rehearseHunt(world, T);
  rehearsalMs = performance.now() - t0;
}
const first = timedRun(world, true);
world = first.world;
const least = [...first.ticks];
const systems = first.systems.map((m) => new Map([...m].map(([k, v]) => [k, { ...v }])));
// Warm runs: the run is the same every time, so the least time a tick ever took is its time without the machine's noise.
let warm: number[] | null = null;
let warmProfile: Profile | null = null;
for (let r = 0; r < Number(warmRuns); r++) {
  const next = timedRun(world);
  if (r === 0) warmProfile = next.profile;
  warm = warm ? warm.map((d, i) => Math.min(d, next.ticks[i]!)) : [...next.ticks];
  next.systems.forEach((m, i) => {
    for (const [k, v] of m) {
      const kept = systems[i]!.get(k);
      if (!kept) continue;
      if (kept.nodes !== v.nodes || kept.rays !== v.rays) throw new Error(`tick ${i + 1}, ${k}: a second run did different work, so the run isn't repeating`);
      kept.ms = Math.min(kept.ms, v.ms);
    }
  });
  for (let i = 0; i < least.length; i++) least[i] = Math.min(least[i]!, next.ticks[i]!);
}

console.log(`${name}${params ? ` ${params}` : ''} · ${first.ticks.length} ticks · world built in ${buildMs.toFixed(0)} ms${rehearsed === '1' ? `, rehearsed in ${rehearsalMs.toFixed(0)} ms` : ''}`);
console.log(line(rehearsed === '1' ? 'first run, after the rehearsal:' : 'first run, cold:', first.ticks));
if (warm) console.log(line(`warm, least of ${warmRuns}:`, warm));
// Each system's worst tick, and the most work it did in one: the work is the same on every machine.
const worstOf = new Map<string, { ms: number; at: number; nodes: number; rays: number }>();
systems.forEach((m, i) => {
  for (const [k, v] of m) {
    const w = worstOf.get(k) ?? { ms: 0, at: 0, nodes: 0, rays: 0 };
    if (v.ms > w.ms) {
      w.ms = v.ms;
      w.at = i + 1;
    }
    w.nodes = Math.max(w.nodes, v.nodes);
    w.rays = Math.max(w.rays, v.rays);
    worstOf.set(k, w);
  }
});
for (const [k, w] of [...worstOf.entries()].sort((a, b) => b[1].ms - a[1].ms || a[0].localeCompare(b[0])).slice(0, 6)) {
  console.log(`    ${k.padEnd(22)} worst ${w.ms.toFixed(2).padStart(6)} ms at tick ${String(w.at).padStart(5)} · most in a tick: ${w.nodes.toLocaleString('en-US')} cells, ${w.rays.toLocaleString('en-US')} rays`);
}
const slow: string[] = [];
least.forEach((d, i) => {
  if (d <= limit) return;
  const by = [...systems[i]!.entries()].sort((a, b) => b[1].ms - a[1].ms)[0]!;
  slow.push(`    tick ${String(i + 1).padStart(5)}  ${d.toFixed(1).padStart(5)} ms  ${by[0]} ${by[1].ms.toFixed(1)} ms (${by[1].nodes.toLocaleString('en-US')} cells, ${by[1].rays.toLocaleString('en-US')} rays)`);
});
if (slow.length > 0) console.log(`  ticks over ${limit} ms in every run:\n${slow.slice(0, 20).join('\n')}${slow.length > 20 ? `\n    and ${slow.length - 20} more` : ''}`);
// And the ones slow only the first time, which is what a fresh tab feels: code run for the first time, or something the world works out on first use.
const once: string[] = [];
first.ticks.forEach((d, i) => {
  if (d <= limit || least[i]! > limit) return;
  const by = [...first.systems[i]!.entries()].sort((a, b) => b[1].ms - a[1].ms)[0]!;
  once.push(`    tick ${String(i + 1).padStart(5)}  ${d.toFixed(1).padStart(5)} ms  ${by[0]} ${by[1].ms.toFixed(1)} ms (${by[1].nodes.toLocaleString('en-US')} cells, ${by[1].rays.toLocaleString('en-US')} rays) · ${least[i]!.toFixed(1)} ms once warm`);
});
if (once.length > 0) console.log(`  ticks over ${limit} ms in the first run only:\n${once.slice(0, 20).join('\n')}${once.length > 20 ? `\n    and ${once.length - 20} more` : ''}`);
// One tick, by function: the first run against a warm one. What is slow only the first time shows as a function with far more time on the left.
if (first.profile) {
  const a = timesOf(first.profile);
  const b = warmProfile ? timesOf(warmProfile) : new Map<string, { self: number; total: number }>();
  const ms = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(2)).padStart(6);
  const rows = (pick: (v: { self: number; total: number }) => number, most: number): string =>
    [...a.entries()]
      .sort((p, q) => pick(q[1]) - pick(p[1]) || p[0].localeCompare(q[0]))
      .slice(0, most)
      .map(([k, v]) => `    ${ms(pick(v))} ${ms(b.has(k) ? pick(b.get(k)!) : undefined)}  ${k}`)
      .join('\n');
  console.log(`  tick ${profiled} by function, ms: the first run (${first.ticks[profiled - 1]!.toFixed(1)} ms in all), then a warm one. With what each calls:`);
  console.log(rows((v) => v.total, 24));
  console.log('  and in its own code:');
  console.log(rows((v) => v.self, 14));
}
