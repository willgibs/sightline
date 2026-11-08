/**
 * Lab D's exit test, before any reviewer: restricted-play bots find each camp's best plans
 * (long range only, infiltration only, systems only), their signatures are clustered, the
 * camps' expressive range is laid out, and a regret matrix asks each camp's best plan of the
 * other camps.
 *
 *   npm run plans -- --count 100 --from <series>           signatures, clusters and expressive range
 *   npm run plans -- --count 10 --from <series> --regret   and the regret matrix over those
 *   ... --out <file.json>                                  writes everything as JSON too
 *   ... --simulate                                         runs each camp's certified way in in the simulation, with lab A's real perception
 *   ... --briefs <dir>                                     writes the reviewers' briefs: what recon would show, each reviewer's camps in its own order
 *   ... --evaluate <dir>                                   reads reviews.json there (reviewer → camp letter → signature), and checks them
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultTuning } from '../config/tuning';
import { Rng } from '../sim/kernel/core/rng';
import { randomSeed } from '../sim/kernel/core/seed';
import { analyzeCamp, buildRaster, campMission, campPlans, generateWorld, planOn, routinePose, sameSignature, type AnalysisParts, type CampAnalysis, type Plan, type PlanSignature, type RoutinePose } from '../sim/generation';
import type { World } from '../sim/kernel/world/world';
import { createBody } from '../sim/body';
import { keepRoutine } from '../sim/brain';
import { emptyMind, guardMind } from '../sim/game/guards';
import { PERCEPTION, giveSenses } from '../sim/game/perception';
import { SIGHTLINE, type Simulation } from '../sim/game/sim';
import type { Scene } from '../sim/game/scenes';
import { datan2 } from '../sim/kernel/core/detmath';
import { turnTowards } from '../sim/kernel/core/math';
import type { InputFrame } from '../sim/kernel/input';
import { runScene } from '../sim/kernel/scene';
import type { System } from '../sim/kernel/systems';
import { parseArgs } from './args';

const args = parseArgs(process.argv.slice(2));
const count = Number(args.get('count') ?? 10);
const series = args.get('from') ?? 'plans';
const base = new Rng(series, 'list');
const seeds = Array.from({ length: count }, () => randomSeed(() => base.next()));
const G = defaultTuning.gen;

interface Row {
  seed: string;
  world: World;
  analysis: CampAnalysis;
  parts: AnalysisParts;
  plans: Plan[];
  best: Plan;
  clusters: number;
  core: number;
  dominance: number;
  exposure: number;
}

const rows: Row[] = [];
for (const seed of seeds) {
  const world = generateWorld(campMission(seed), defaultTuning);
  const raster = buildRaster(world.camp, world.terrain, world.colliders, world.grid.site, G.analysis.cell, G.analysis.margin);
  const { analysis, parts } = analyzeCamp(world.camp, world.terrain, world.colliders, world.grid, G, raster);
  const { plans, best } = campPlans(world.camp, analysis, parts, G);
  const clusters = analysis.clusters.filter((c) => c.members.length > 1);
  rows.push({
    seed,
    world,
    analysis,
    parts,
    plans,
    best,
    clusters: clusters.length,
    core: Math.max(0, ...clusters.map((c) => c.members.length)),
    dominance: Math.max(0, ...analysis.perches.map((p) => p.coverage)),
    exposure: analysis.infiltration.found ? analysis.infiltration.peak : 1,
  });
  process.stdout.write('.');
}
process.stdout.write('\n\n');

const show = (s: PlanSignature): string => `${s.opening} · ${s.first} · ${s.split} · ${s.tool}`;
console.log(`SIGHTLINE restricted-play bots · ${count} camps from series ${series}\n`);
for (const r of rows) {
  console.log(`${r.seed}  best: ${r.best.approach} [${show(r.best.signature)}] ${r.best.seconds === Infinity ? 'never reaches the target' : `${r.best.seconds.toFixed(0)} s`}`);
  for (const p of r.plans) console.log(`    ${p.approach.padEnd(13)} ${show(p.signature)}  (${p.detail})`);
}

// Clustering: distinct signatures, two plans the same when three of four fields match.
const clusterize = (sigs: PlanSignature[]): number => {
  const reps: PlanSignature[] = [];
  for (const s of sigs) if (!reps.some((x) => sameSignature(x, s))) reps.push(s);
  return reps.length;
};
console.log(`\ndistinct best-plan signatures: ${clusterize(rows.map((r) => r.best.signature))} of ${rows.length}`);
for (const a of ['long range', 'infiltration', 'systems']) console.log(`distinct ${a} signatures: ${clusterize(rows.flatMap((r) => r.plans.filter((p) => p.approach === a).map((p) => p.signature)))}`);

// Expressive range: cluster count against hard-core size, best-perch dominance against infiltration exposure.
const bucket = (x: number, step: number): number => Math.floor(x / step);
const table = new Map<string, number>();
for (const r of rows) table.set(`${r.clusters}|${r.core}`, (table.get(`${r.clusters}|${r.core}`) ?? 0) + 1);
console.log('\nexpressive range: clusters × hard-core size');
for (const [k, v] of [...table.entries()].sort()) console.log(`  ${k.replace('|', ' clusters, core ')}: ${v}`);
const grid = new Map<string, number>();
for (const r of rows) grid.set(`${bucket(r.dominance, 0.1)}|${bucket(r.exposure, 0.25)}`, (grid.get(`${bucket(r.dominance, 0.1)}|${bucket(r.exposure, 0.25)}`) ?? 0) + 1);
console.log('expressive range: best perch (%, by tens) × infiltration peak (quarters of the meter)');
for (const [k, v] of [...grid.entries()].sort()) {
  const [d, e] = k.split('|').map(Number);
  console.log(`  perch ${d! * 10}–${d! * 10 + 10}%, peak ${e! * 25}–${e! * 25 + 25}%: ${v}`);
}

let regret: number[][] | null = null;
if (args.has('regret')) {
  // Each camp's best plan, asked of every camp: how much riskier than that camp's own best, or 1 past it if it can't be carried out at all.
  regret = rows.map((j) => rows.map((i) => planOn(i.best.signature, j.world.camp, j.analysis, j.parts, G) - j.best.risk));
  console.log("\nregret: how much riskier on camp (row) is camp (column)'s best plan than that camp's own (risk 1 is impossible)");
  console.log(['seed'.padEnd(10), ...rows.map((_, k) => String(k).padStart(6))].join(''));
  regret.forEach((row, j) => console.log([rows[j]!.seed.padEnd(10), ...row.map((v) => v.toFixed(2).padStart(6))].join('')));
  let worse = 0;
  let pairs = 0;
  regret.forEach((row, j) => row.forEach((v, i) => {
    if (i === j) return;
    pairs++;
    if (v >= 0.1) worse++;
  }));
  console.log(`\nplans clearly worse elsewhere (0.1 riskier or more): ${worse} of ${pairs}`);
}


if (args.has('out')) {
  writeFileSync(args.get('out')!, JSON.stringify({ series, rows: rows.map((r) => ({ seed: r.seed, plans: r.plans, best: r.best, clusters: r.clusters, core: r.core, dominance: r.dominance, exposure: r.exposure })), regret }, null, 1));
}
console.log('');

/**
 * The reviewers' briefs (lab D's exit test): what recon would show of each camp, in the
 * camp's own frame, and never the generator's scores or paths. Each reviewer gets the camps
 * in its own order, under letters of its own; `key.json` says which is which.
 */
function writeBriefs(dir: string, list: Row[]): void {
  mkdirSync(dir, { recursive: true });
  const reviewers = Number(args.get('reviewers') ?? 3);
  const key: Record<string, Record<string, string>> = {};
  for (let r = 0; r < reviewers; r++) {
    const name = `reviewer-${r + 1}`;
    const order = new Rng(`${series}/${name}`, 'order').shuffle([...list]);
    const camps = order.map((row, i) => ({ label: `Camp ${String.fromCharCode(65 + i)}`, ...reconOf(row) }));
    key[name] = Object.fromEntries(order.map((row, i) => [`Camp ${String.fromCharCode(65 + i)}`, row.seed]));
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ camps }, null, 1));
  }
  writeFileSync(path.join(dir, 'key.json'), JSON.stringify(key, null, 1));
  console.log(`briefs for ${reviewers} reviewers in ${dir}`);
}

function reconOf(row: Row): object {
  const w = row.world;
  const c = w.camp;
  const L = c.layout!;
  const frame = (x: number, z: number): { forward: number; right: number } => {
    const dx = x - c.site.x;
    const dz = z - c.site.z;
    return { forward: Math.round(dx * L.ux + dz * L.uz), right: Math.round(dx * L.vx + dz * L.vz) };
  };
  const pose: RoutinePose = { x: 0, z: 0, yaw: 0, headYaw: 0, moving: false, vx: 0, vz: 0 };
  const round = (v: number, d = 0): number => Number(v.toFixed(d));
  return {
    frame: 'All positions are metres from the camp centre: forward is toward the gate, right is to its right. Heights are above the camp pad.',
    cycleSeconds: c.cycle,
    fence: { forwardHalf: round(L.halfA), rightHalf: round(L.halfB), openings: L.openings.map((o) => ({ kind: o.kind, side: o.side, forward: round(o.a), right: round(o.b), width: o.width })) },
    ridges: (w.features.ridges ?? []).map((rd) => ({ crest: rd.crest.points.filter((_, i) => i % 10 === 0).map((p) => ({ ...frame(p.x, p.z), height: round(w.terrain.heightAt(p.x, p.z) - c.site.height) })) })),
    buildings: L.buildings.map((b) => ({ module: b.module, centre: frame(b.x, b.z), length: round(b.length), depth: round(b.depth), height: round(b.height, 1), doors: b.doors.map((d) => frame(c.doors![d]!.x, c.doors![d]!.z)) })),
    towers: c.structures.filter((st) => st.kind === 'tower').length,
    devices: (c.devices ?? []).map((d) => ({ kind: d.kind, ...frame(d.x, d.z), height: round(d.y - c.site.height, 1) })),
    vehicles: (c.vehicles ?? []).map((v) => ({ kind: v.kind, escape: v.escape, ...frame(v.x, v.z) })),
    guards: c.guards.map((g, id) => {
      // Consecutive walks as one path, and holds of a moment dropped: what recon would note down.
      const legs: Array<Record<string, unknown>> = [];
      for (const leg of g.routine.legs) {
        const last = legs[legs.length - 1];
        if (leg.kind === 'walk') {
          if (last && 'walk' in last) {
            (last.walk as number[])[1] = round(leg.t1);
            (last.path as unknown[]).push(frame(leg.x1, leg.z1));
          } else legs.push({ walk: [round(leg.t0), round(leg.t1)], path: [frame(leg.x0, leg.z0), frame(leg.x1, leg.z1)] });
        } else if (leg.t1 - leg.t0 >= 3) {
          legs.push({ hold: [round(leg.t0), round(leg.t1)], at: frame(leg.x, leg.z), faces: round(leg.yawTo * (180 / Math.PI)) });
        }
      }
      routinePose(g.routine, 0, pose);
      return { id, role: g.role, onTower: g.elevated, offsetSeconds: round(g.routine.offset ?? 0), periodSeconds: round(g.routine.period), legs };
    }),
  };
}

/**
 * The reviewers' plans, checked (lab D's exit test): does each work on its camp, do the
 * reviewers agree (three of four fields match), do any two camps share a signature, and is
 * each camp's plan clearly worse on the others (the regret matrix)?
 */
function evaluateReviews(dir: string, list: Row[]): void {
  const key = JSON.parse(readFileSync(path.join(dir, 'key.json'), 'utf8')) as Record<string, Record<string, string>>;
  const reviews = JSON.parse(readFileSync(path.join(dir, 'reviews.json'), 'utf8')) as Record<string, Record<string, PlanSignature>>;
  const bySeed = new Map(list.map((r) => [r.seed, r]));
  const reviewers = Object.keys(reviews);
  // For each reviewer, its plan for each camp, by seed.
  const plans = new Map<string, Map<string, PlanSignature>>();
  for (const name of reviewers) {
    const m = new Map<string, PlanSignature>();
    for (const [label, sig] of Object.entries(reviews[name]!)) m.set(key[name]![label]!, sig);
    plans.set(name, m);
  }
  console.log(`\nReviews by ${reviewers.length} agents of ${list.length} camps`);
  let works = 0;
  let total = 0;
  for (const name of reviewers) {
    for (const [seed, sig] of plans.get(name)!) {
      const r = bySeed.get(seed)!;
      const risk = planOn(sig, r.world.camp, r.analysis, r.parts, G);
      total++;
      if (risk < 1) works++;
      console.log(`  ${name} ${seed} [${show(sig)}] ${risk < 1 ? `works, risk ${risk.toFixed(2)}` : 'cannot be carried out'}`);
    }
  }
  console.log(`plans that work on their camps: ${works} of ${total}`);
  // Agreement: pairs of reviewers on one camp whose signatures match on three of four fields.
  let agreeing = 0;
  let pairs = 0;
  for (const r of list) {
    for (let a = 0; a < reviewers.length; a++) {
      for (let b = a + 1; b < reviewers.length; b++) {
        pairs++;
        if (sameSignature(plans.get(reviewers[a]!)!.get(r.seed)!, plans.get(reviewers[b]!)!.get(r.seed)!)) agreeing++;
      }
    }
  }
  console.log(`agreement between reviewers on a camp (three of four fields): ${agreeing} of ${pairs}`);
  for (const name of reviewers) {
    const sigs = list.map((r) => plans.get(name)!.get(r.seed)!);
    let same = 0;
    for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) if (sameSignature(sigs[a]!, sigs[b]!)) same++;
    // Regret: this reviewer's plans asked of the other camps.
    let worse = 0;
    let n = 0;
    list.forEach((j, x) => {
      const own = planOn(sigs[x]!, j.world.camp, j.analysis, j.parts, G);
      list.forEach((_, y) => {
        if (x === y) return;
        n++;
        if (planOn(sigs[y]!, j.world.camp, j.analysis, j.parts, G) - own >= 0.1) worse++;
      });
    });
    console.log(`${name}: camps sharing a signature: ${same} pair(s) of ${(sigs.length * (sigs.length - 1)) / 2}; another camp's plan clearly worse: ${worse} of ${n}`);
  }
}

/**
 * Each camp's certified way in, run in the simulation (lab D's exit test): the player waits
 * out of the way, is put at the path's first cell when it starts, and follows it crouched,
 * with lab A's real perception and every guard on his routine. Did anyone see him before
 * he got there? (Guards keep their routines even if they notice: D's model has them do so.)
 */
function simulateWaysIn(list: Row[]): void {
  const mind = emptyMind();
  const hold: System = {
    name: 'plan-hold',
    phase: 'decide',
    after: ['guard-brains'],
    reads: ['guard.body', 'guard.guard'],
    writes: ['guard.guard.order'],
    emits: [],
    run(ctx) {
      for (const g of ctx.index.of('guard')) keepRoutine(guardMind(g, ctx.world, ctx.tuning, ctx.tick + 1, mind), g.guard.order);
    },
  };
  let clean = 0;
  let total = 0;
  for (const r of list) {
    const a = r.analysis.infiltration;
    if (!a.found) continue;
    total++;
    const plan = a;
    const dt = r.analysis.dt;
    const scene: Scene = {
      name: 'plan-run',
      version: 1,
      title: 'A way in, run',
      description: '',
      game: SIGHTLINE,
      world: () => r.world,
      systems: [...PERCEPTION, hold],
      setup: (sim) => giveSenses(sim),
      driver: () => new PathDriver(plan, dt),
      seconds: plan.arrive,
    };
    const run = runScene(scene, defaultTuning);
    const events = run.recording.readEvents();
    const seen = events.find((e) => e.type === 'detected');
    const noticed = events.find((e) => e.type === 'noticed');
    if (!seen) clean++;
    console.log(`  ${r.seed}: ${seen ? `SEEN at ${seen.t.toFixed(1)} s (way in ${a.start.toFixed(0)}–${a.arrive.toFixed(0)} s), ${seen.type}` : 'unseen'}${noticed ? ` · first noticed at ${noticed.t.toFixed(1)} s` : ''}${run.failures.length ? ` · ${run.failures.join('; ')}` : ''}`);
  }
  console.log(`\nways in that held in the simulation, nobody detecting him: ${clean} of ${total}`);
}

/** Puts the player at the path's first cell when it starts, and walks him along it, crouched, on its schedule. */
class PathDriver {
  private yaw: number | null = null;
  private placed = false;

  constructor(
    private readonly plan: { start: number; path: ReadonlyArray<{ x: number; z: number }>; arrive: number },
    private readonly dt: number,
  ) {}

  next(sim: Simulation, out: InputFrame): InputFrame {
    out.moveX = 0;
    out.moveZ = 0;
    out.sprint = false;
    out.crouch = false;
    out.prone = false;
    out.pitch = 0;
    const b = sim.player;
    if (this.yaw === null) this.yaw = b.yaw;
    const t = sim.tick / sim.tuning.sim.tickHz;
    const P = this.plan.path;
    if (!this.placed && t >= this.plan.start - 0.5) {
      this.placed = true;
      const spec = sim.tuning.bodies.player;
      const next = P[Math.min(1, P.length - 1)]!;
      Object.assign(b, createBody(sim.world, sim.solids, spec, P[0]!.x, P[0]!.z, next.x - P[0]!.x, next.z - P[0]!.z));
      b.stance = 'crouch';
      b.eyeHeight = spec.eyeHeight.crouch;
      b.eyeFrom = b.eyeHeight;
      for (const h of b.history) h.eyeHeight = b.eyeHeight;
      this.yaw = b.yaw;
    }
    if (!this.placed) {
      out.yaw = this.yaw;
      return out;
    }
    // The cell the schedule says he should be in, then its next one: heading for that one.
    const i = Math.min(P.length - 1, Math.max(0, Math.floor((t - this.plan.start) / this.dt) + 1));
    const goal = P[i]!;
    const dx = goal.x - b.x;
    const dz = goal.z - b.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.12) {
      this.yaw = turnTowards(this.yaw, datan2(-dx, -dz), 12 * sim.dt);
      out.moveZ = 1;
    }
    out.yaw = this.yaw;
    return out;
  }
}

if (args.has('simulate')) simulateWaysIn(rows);
if (args.has('briefs')) writeBriefs(args.get('briefs')!, rows);
if (args.has('evaluate')) evaluateReviews(args.get('evaluate')!, rows);
