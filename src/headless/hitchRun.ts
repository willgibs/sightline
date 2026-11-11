/**
 * One scene's ticks, timed: the part of `npm run hitches` that runs in a process of its
 * own, built as the game's own code is built (headless/hitches.ts says why).
 *
 *   node hitchRun.mjs <scene> <params> <warm runs> <list over ms> <rehearse: 1 or 0>
 */
import { defaultTuning } from '../config/tuning';
import { rehearse, rehearseFirefight } from '../sim/game/rehearsal';
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

/** One run of the scene: each tick's time, and each system's time and work in it. */
function run(world: World | undefined): { world: World; ticks: number[]; systems: Map<string, Cost>[] } {
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
  for (let i = 0; i < total && !sceneOver(scene, sim, total); i++) {
    now = new Map();
    const t0 = performance.now();
    sim.step(driver ? driver.next(sim, raw) : raw);
    ticks.push(performance.now() - t0);
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
  return { world: sim.world as World, ticks, systems };
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
  rehearsalMs = performance.now() - t0;
}
const first = run(world);
world = first.world;
const least = [...first.ticks];
const systems = first.systems.map((m) => new Map([...m].map(([k, v]) => [k, { ...v }])));
// Warm runs: the run is the same every time, so the least time a tick ever took is its time without the machine's noise.
let warm: number[] | null = null;
for (let r = 0; r < Number(warmRuns); r++) {
  const next = run(world);
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
