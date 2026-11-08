/**
 * Playtest sessions, summarized. Each recording is re-simulated, which checks that it
 * replays bit for bit and that every body kept the motor's promises all the way through
 * (sim/body/invariants.ts). The summary says what happened, from the recording, and how
 * it ran, from the telemetry report saved beside it (src/app/playtest.ts).
 *
 * Sittings of trial mode (A12) are scored at the end, from the answers their trials'
 * recordings hold and from any sitting file saved beside them (headless/sittings.ts).
 *
 *   npm run playtest                             every session in playtests/
 *   npm run playtest -- <file.slrec|dir>         one recording, or a folder of them
 *   npm run playtest -- <sitting-<seed>.json>    a sitting saved from its results screen
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { InvariantWatch } from '../sim/body';
import { Recording, type Annotation } from '../sim/kernel/record/recording';
import { resimulate } from '../sim/kernel/record/resim';
import { sceneOf } from '../sim/game/scenes';
import { SIGHTLINE, type Simulation } from '../sim/game/sim';
import { surfaceName } from '../sim/kernel/world/surfaces';
import { defaultTuning } from '../config/tuning';
import { fmt } from './args';
import { answersIn, reportSittings, sittingFile, type KeptAnswer } from './sittings';
import { analyzeShot, describeShot, type ShotReport } from '../sim/game/telemetry';

const target = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'playtests';
if (!existsSync(target)) {
  console.error(`\nNo ${target}: play the game in development (npm run dev) to fill playtests/, or name a recording.\n`);
  process.exit(2);
}
const all = statSync(target).isDirectory()
  ? readdirSync(target)
      .sort()
      .map((f) => join(target, f))
  : [target];
const files = all.filter((f) => f.endsWith('.slrec'));
// Sitting files: JSON that says it is one (the telemetry reports beside the recordings aren't).
const sittingFiles = all
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: basename(f), text: readFileSync(f, 'utf8') }))
  .filter((f) => sittingFile(f.text) !== null);
if (files.length === 0 && sittingFiles.length === 0) {
  console.log(`\nNo recordings or sittings in ${target}.\n`);
  process.exit(0);
}

/** Trial answers found in the recordings, scored as sittings at the end. */
const kept: KeptAnswer[] = [];
let failures = 0;
for (const file of files) failures += summarize(file) ? 0 : 1;
if (files.length > 1) console.log(`${files.length} sessions · ${failures ? `${failures} with problems` : 'all replay and keep every promise'}`);
if (!reportSittings(kept, sittingFiles, defaultTuning)) failures++;
console.log('');
process.exit(failures ? 1 : 0);

/** Prints one session's summary; false if it doesn't replay or a promise broke. */
function summarize(file: string): boolean {
  let rec: Recording;
  try {
    rec = Recording.fromBytes(new Uint8Array(readFileSync(file)));
  } catch (e) {
    console.log(`\n${basename(file)}\n  ✗ not a readable recording: ${e instanceof Error ? e.message : String(e)}\n`);
    return false;
  }
  const h = rec.header;
  const hz = h.tickHz;
  const t = (tick: number) => fmt.clock(tick / hz);
  const telemetry = readTelemetry(file);
  const label = h.scene ? `scene ${h.scene.name} v${h.scene.version}` : h.mission.seed;
  const paused = telemetry?.run ? ` (+${fmt.clock(telemetry.run.pausedSeconds)} paused, ${telemetry.run.pauses} pause${telemetry.run.pauses === 1 ? '' : 's'})` : '';
  console.log(`\n${basename(file, '.slrec')} · ${label} · build ${h.build || '?'} · ${t(h.ticks)} played${paused}`);

  // What happened, gathered while re-simulating.
  const notes = new Map<number, Annotation[]>();
  for (const a of rec.annotations()) notes.set(a.tick, [...(notes.get(a.tick) ?? []), a]);
  const moments: string[] = [];
  let watch: InvariantWatch | null = null;
  let walked = 0;
  let steps = 0;
  const bySurface = new Map<string, number>();
  let loudest = { radius: 0, what: '' };
  let hardestLanding = 0;
  let stances = 0;
  let shots = 0;
  const stanceTicks = { stand: 0, crouch: 0, prone: 0 };
  let closest = { d: Infinity, guard: -1, tick: 0 };
  // Every rifle shot, broken down into what decided it (game/telemetry.ts), and what it struck.
  const shotLog: Array<{ report: ShotReport; result: string; impact: number; hit: boolean }> = [];
  let x0 = 0;
  let z0 = 0;
  const re = resimulate(rec, {
    game: SIGHTLINE,
    scene: sceneOf(h),
    clock: () => performance.now(),
    watch: {
      before(sim: Simulation) {
        watch ??= new InvariantWatch(sim);
        watch.beforeTick();
        x0 = sim.player.x;
        z0 = sim.player.z;
      },
      after(sim, events) {
        watch!.afterTick();
        const p = sim.player;
        walked += Math.hypot(p.x - x0, p.z - z0);
        stanceTicks[p.stance]++;
        for (const e of events) {
          if (e.source !== sim.playerId) continue;
          if (e.type === 'footstep') {
            steps++;
            const s = surfaceName(e.surface);
            bySurface.set(s, (bySurface.get(s) ?? 0) + 1);
            if (e.radius > loudest.radius) loudest = { radius: e.radius, what: `${e.gait} on ${s}` };
          } else if (e.type === 'land') hardestLanding = Math.max(hardestLanding, e.speed);
          else if (e.type === 'stance') stances++;
          else if (e.type === 'shot') {
            shots++;
            const fire = sim.lastInput.commands.find((c) => c.kind === 'fire');
            if (e.speed > 0 && fire?.kind === 'fire') shotLog.push({ report: analyzeShot(sim, e, fire), result: 'no strike', impact: -1, hit: false });
          } else if (e.type === 'impact') {
            const s = shotLog.find((x) => x.report.shot === e.cause);
            if (s) {
              s.impact = e.id;
              s.result = e.what === 'body' ? `struck the ${e.part}` : e.what === 'collider' && surfaceName(e.surface) === 'metal' ? 'rang the steel' : `missed, into the ${e.what === 'terrain' ? surfaceName(e.surface) : 'cover'}`;
            }
          } else if (e.type === 'death') {
            const s = shotLog.find((x) => x.impact === e.cause);
            if (s) {
              s.result = `${e.part}, down`;
              s.hit = s.report.target?.id === e.victim;
            }
          }
        }
        for (const g of sim.guards) {
          const d = Math.hypot(g.body.x - p.x, g.body.y - p.y, g.body.z - p.z);
          if (d < closest.d) closest = { d, guard: g.id, tick: sim.tick };
        }
        for (const a of notes.get(sim.tick) ?? []) {
          // Pauses aren't moments; a trial's answer has a line of its own.
          if (a.kind === 'pause' || a.kind === 'trial-answer' || a.kind === 'trial-sitting') continue;
          moments.push(`${t(sim.tick)} ${a.kind}${a.text ? ` "${a.text}"` : ''} at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · ${p.stance}, ${p.gait} on ${surfaceName(p.surface)}`);
        }
      },
    },
  });

  let ok = true;
  if (re.problem) {
    console.log(`  replay    can't re-simulate in this build: ${re.problem}`);
    ok = false;
  } else {
    const replay = h.fault
      ? re.ok
        ? `✓ the fault at ${t(h.fault.tick)} reproduces (${h.fault.system}: ${h.fault.message})`
        : `✗ the fault at ${t(h.fault.tick)} doesn't reproduce`
      : re.ok
        ? '✓ identical'
        : `✗ diverged${re.firstDivergence !== null ? ` at ${t(re.firstDivergence)}, in ${re.divergedParts.join(', ')}` : ' at the end'}`;
    const w = watch as InvariantWatch | null;
    const promises = w ? (w.sound ? `every promise held (${fmt.int(w.report.checks)} body-ticks)` : `✗ ${w.report.first!.what} (entity ${w.report.first!.entity}, ${t(w.report.first!.tick)})`) : '';
    console.log(`  replay    ${replay} · ${promises} · ${fmt.ms(re.ms)}`);
    ok = re.ok && (!w || w.sound);
    const outcome = rec.readEvents().find((e) => e.type === 'outcome');
    if (outcome?.type === 'outcome') console.log(`  outcome   ${outcome.status} at ${t(outcome.tick)}`);
    const surfaces = [...bySurface.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`);
    console.log(
      `  player    walked ${fmt.int(walked)} m · ${fmt.int(steps)} steps${surfaces.length ? ` (${surfaces.join(', ')})` : ''}` +
        (loudest.radius ? ` · loudest heard at ${loudest.radius.toFixed(1)} m (${loudest.what})` : '') +
        (hardestLanding ? ` · hardest landing ${hardestLanding.toFixed(1)} m/s` : ''),
    );
    console.log(
      `            ${stances} stance change${stances === 1 ? '' : 's'} · crouched ${t(stanceTicks.crouch)} · prone ${t(stanceTicks.prone)} · ${shots} shot${shots === 1 ? '' : 's'}`,
    );
    if (closest.guard >= 0) console.log(`  guards    closest ${closest.d.toFixed(1)} m (guard ${closest.guard}, at ${t(closest.tick)})`);
    shotLog.forEach((s, k) => console.log(`  shot ${String(k + 1).padEnd(4)} ${t(Math.round(s.report.t * hz))} ${describeShot(s.report, s.result, s.hit)}`));
    for (const m of moments) console.log(`  moment    ${m}`);
    // A trial of a sitting (A12): its answer, and what happened.
    const events = rec.readEvents();
    for (const a of answersIn(basename(file), rec.annotations(), events, h.tuning)) {
      kept.push(a);
      const seenAt = events.find((e) => e.type === 'detected')?.t;
      console.log(`  trial     ${a.warmup ? 'warm-up' : 'scored'} trial ${a.k} of sitting ${a.sitting} · answered ${a.answer ? 'yes' : 'no'} · ${a.seen ? `seen at ${seenAt!.toFixed(1)} s` : 'not seen'}`);
    }
  }
  if (telemetry?.frames) {
    const f = telemetry.frames;
    const fps = f.meanMs > 0 ? Math.round(1000 / f.meanMs) : 0;
    console.log(
      `  frames    ${fps} fps · p50 ${f.p50Ms} ms · p95 ${f.p95Ms} ms · p99 ${f.p99Ms} ms · ${f.over50} over 50 ms · cpu ${telemetry.cpu.meanMs} ms · sim ${telemetry.simUsPerTick} µs/tick`,
    );
    const m = telemetry.machine ?? {};
    console.log(`  machine   ${browserName(String(m.userAgent ?? ''))} · ${m.gpu ?? '?'} · ${m.viewport ?? '?'} at ×${m.pixelRatio ?? '?'} · saved on ${telemetry.reason}`);
  }
  return ok;
}

interface Telemetry {
  reason: string;
  run: { pausedSeconds: number; pauses: number };
  frames: { meanMs: number; p50Ms: number; p95Ms: number; p99Ms: number; over50: number };
  cpu: { meanMs: number };
  simUsPerTick: number;
  machine: Record<string, unknown>;
}

function readTelemetry(file: string): Telemetry | null {
  const json = file.replace(/\.slrec$/, '.json');
  if (!existsSync(json)) return null;
  try {
    const t = JSON.parse(readFileSync(json, 'utf8')) as { format?: string } & Telemetry;
    return t.format === 'sightline-telemetry' ? t : null;
  } catch {
    return null;
  }
}

/** "Chrome 153 on macOS" from a user agent, roughly. */
function browserName(ua: string): string {
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const m = /(Firefox|Edg|Chrome|Version)\/(\d+)/.exec(ua);
  const name = !m ? 'a browser' : m[1] === 'Version' ? `Safari ${m[2]}` : m[1] === 'Edg' ? `Edge ${m[2]}` : `${m[1]} ${m[2]}`;
  return `${name} on ${os}`;
}
