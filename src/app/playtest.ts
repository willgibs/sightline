import type { Recorder } from '../sim/kernel/record/recording';
import type { Simulation } from '../sim/game/sim';
import { FrameHistogram } from './perf';

/**
 * Playtest capture: every run's recording and a telemetry report are kept as the run
 * goes, so no session is lost, and each can be studied afterwards (`npm run playtest`)
 * or watched back (the replay viewer).
 *
 * - In development, the dev server writes them into playtests/ (headless/playtestInbox.ts).
 * - In the deployed game, they go to this browser's storage (IndexedDB), the last few
 *   runs, and the start screen offers the latest one for saving.
 *
 * A run is saved after every minute of play, and when the game pauses, the rules decide,
 * a tick fails, the tab is hidden or a new run starts. The recording replays the run; the
 * report keeps what only the browser knew: frame times, the machine, the settings.
 */

export interface TelemetryReport {
  format: 'sightline-telemetry';
  version: 1;
  name: string;
  build: string;
  startedAt: string;
  savedAt: string;
  /** Why this save happened: 'minute', 'pause', 'outcome', 'fault', 'hidden', 'new run', 'sitting'. */
  reason: string;
  world: { seed: string; scene: string | null };
  run: { ticks: number; tickHz: number; playedSeconds: number; pausedSeconds: number; pauses: number };
  frames: { count: number; meanMs: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; over33: number; over50: number; over100: number };
  cpu: { meanMs: number; p95Ms: number };
  simUsPerTick: number;
  machine: Record<string, unknown>;
  settings: Record<string, unknown>;
}

/** Where saved runs go. */
export interface PlaytestStore {
  readonly where: string;
  save(name: string, recording: Blob, report: TelemetryReport): Promise<void>;
}

/** Development: the dev server's inbox, into playtests/. */
export class DevInbox implements PlaytestStore {
  readonly where = 'playtests/';

  async save(name: string, recording: Blob, report: TelemetryReport): Promise<void> {
    const put = async (file: string, body: Blob): Promise<void> => {
      const res = await fetch(`/__playtests/${encodeURIComponent(file)}`, { method: 'PUT', body });
      if (!res.ok) throw new Error(`the dev server refused ${file}: ${res.status}`);
    };
    await put(`${name}.slrec`, recording);
    await put(`${name}.json`, new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  }
}

/** A run kept in the browser. */
export interface StoredRun {
  name: string;
  savedAt: string;
  label: string;
  ticks: number;
  tickHz: number;
  recording: Blob;
  report: TelemetryReport;
}

/** The deployed game: the last few runs, in this browser's IndexedDB. */
export class BrowserStore implements PlaytestStore {
  readonly where = 'this browser';
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly keep = 5) {}

  async save(name: string, recording: Blob, report: TelemetryReport): Promise<void> {
    const run: StoredRun = { name, savedAt: report.savedAt, label: report.world.scene ?? report.world.seed, ticks: report.run.ticks, tickHz: report.run.tickHz, recording, report };
    const db = await this.open();
    // The transaction, not the request: a full disk only shows when the write commits.
    const put = db.transaction('runs', 'readwrite');
    put.objectStore('runs').put(run);
    await done(put);
    // Only the newest few are kept.
    const all = await this.list();
    const tx = db.transaction('runs', 'readwrite');
    for (const old of all.slice(this.keep)) tx.objectStore('runs').delete(old.name);
    await done(tx);
  }

  /** Every kept run, newest first. */
  async list(): Promise<StoredRun[]> {
    const db = await this.open();
    const runs = (await request(db.transaction('runs').objectStore('runs').getAll())) as StoredRun[];
    return runs.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('sightline-playtests', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('runs', { keyPath: 'name' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB would not open'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    }).catch((e: unknown) => {
      // Not kept: the next save tries to open it again.
      this.db = null;
      throw e;
    });
    return this.db;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** What the game tells the capture about the machine and the player's settings, at save time. */
export interface CaptureContext {
  build: string;
  machine(): Record<string, unknown>;
  settings(): Record<string, unknown>;
}

/** Runs shorter than this aren't kept: a restart, a misclick. */
const MIN_SECONDS = 5;
/** Saved after this much play since the last save. */
const EVERY_SECONDS = 60;

interface Run {
  name: string;
  label: string;
  scene: string | null;
  startedAt: string;
  sim: Simulation;
  recorder: Recorder;
  frames: FrameHistogram;
  cpu: FrameHistogram;
  simMs: number;
  simTicks: number;
  pausedMs: number;
  pauses: number;
  /** Recorded ticks at the last save that reached the store. */
  savedTick: number;
  /** Recorded ticks at the last attempt, kept or not: the minute's saves count from it, so a failing store isn't asked every frame. */
  triedTick: number;
}

export class PlaytestCapture {
  private run: Run | null = null;
  private saving: Promise<void> | null = null;
  /** Saves asked for while one was under way: one per run, the latest reason. */
  private readonly pending = new Map<Run, string>();
  /** The last save's outcome, for the debug panel. */
  status = 'nothing saved yet';
  /** The last run's name, and how many runs in a row have had it (begun in the same second). */
  private lastName = '';
  private sameName = 0;
  /**
   * Runs shorter than this aren't kept. Trial mode (A12) keeps every trial, however short:
   * each holds an answer. A review of its misses after the results keeps none (Infinity).
   */
  minSeconds = MIN_SECONDS;

  constructor(
    readonly store: PlaytestStore | null,
    private readonly context: CaptureContext,
  ) {}

  /** A new run: the previous one is saved first, if it was long enough and has unsaved play. */
  startRun(sim: Simulation, recorder: Recorder, label: string, scene: string | null): void {
    if (this.run) this.save('new run');
    const now = new Date();
    const base = `${stamp(now)}-${(scene ? `scene-${scene}` : label).replace(/[^A-Za-z0-9-]+/g, '-')}`;
    // Two runs begun in the same second keep their names apart (trial mode can start several).
    this.sameName = base === this.lastName ? this.sameName + 1 : 1;
    this.lastName = base;
    this.run = {
      name: this.sameName === 1 ? base : `${base}-${this.sameName}`,
      label,
      scene,
      startedAt: now.toISOString(),
      sim,
      recorder,
      frames: new FrameHistogram(),
      cpu: new FrameHistogram(),
      simMs: 0,
      simTicks: 0,
      pausedMs: 0,
      pauses: 0,
      savedTick: 0,
      triedTick: 0,
    };
  }

  /** Every frame while playing: its duration and cost, and the time the ticks took. */
  frame(frameMs: number, cpuMs: number, simMs: number, ticks: number): void {
    const r = this.run;
    if (!r) return;
    r.frames.push(frameMs);
    r.cpu.push(cpuMs);
    r.simMs += simMs;
    r.simTicks += ticks;
    if ((r.recorder.ticks - r.triedTick) / r.sim.tuning.sim.tickHz >= EVERY_SECONDS) this.save('minute');
  }

  /** A pause began (counted at once, so a save on pausing includes it). */
  pauseStarted(): void {
    if (this.run) this.run.pauses++;
  }

  /** A pause ended after `ms` of wall time. */
  paused(ms: number): void {
    if (this.run) this.run.pausedMs += ms;
  }

  /** Saves the current run now (if anything is new), without waiting for the store. */
  save(reason: string, r: Run | null = this.run): void {
    if (!r || !this.store) return;
    // What the recorder holds, which after a failed tick includes that tick's input.
    const ticks = r.recorder.ticks;
    if (ticks === r.savedTick || ticks / r.sim.tuning.sim.tickHz < this.minSeconds) return;
    if (this.saving) {
      // One save at a time; the rest wait their turn, one per run.
      this.pending.set(r, reason);
      return;
    }
    this.saving = this.write(r, reason).finally(() => {
      this.saving = null;
      const next = this.pending.entries().next();
      if (next.done) return;
      this.pending.delete(next.value[0]);
      this.save(next.value[1], next.value[0]);
    });
  }

  /** Whether a save is under way (for tests and leaving the page). */
  get busy(): boolean {
    return this.saving !== null;
  }

  /** Resolves once no save is under way or waiting. */
  async settled(): Promise<void> {
    while (this.saving) await this.saving;
  }

  /** The tick the current run was last saved at. */
  get savedTick(): number {
    return this.run?.savedTick ?? 0;
  }

  private async write(r: Run, reason: string): Promise<void> {
    const ticks = r.recorder.ticks;
    // The minute's next save counts from this attempt, whether or not it works: a store
    // that keeps failing is asked once a minute (and on a pause or the like), not every frame.
    r.triedTick = ticks;
    try {
      const rec = r.recorder.finish(r.sim, r.startedAt);
      const report = this.report(r, reason);
      await this.store!.save(r.name, new Blob(rec.toParts() as BlobPart[], { type: 'application/octet-stream' }), report);
      r.savedTick = Math.max(r.savedTick, ticks);
      this.status = `saved ${r.name} at ${clock(ticks / r.sim.tuning.sim.tickHz)} (${reason}) to ${this.store!.where}`;
    } catch (e) {
      this.status = `couldn't save: ${e instanceof Error ? e.message : String(e)}`;
      console.warn('Sightline: playtest save failed', e);
    }
  }

  private report(r: Run, reason: string): TelemetryReport {
    const hz = r.sim.tuning.sim.tickHz;
    const f = r.frames;
    return {
      format: 'sightline-telemetry',
      version: 1,
      name: r.name,
      build: this.context.build,
      startedAt: r.startedAt,
      savedAt: new Date().toISOString(),
      reason,
      world: { seed: r.sim.world.seed, scene: r.scene },
      run: { ticks: r.recorder.ticks, tickHz: hz, playedSeconds: r.recorder.ticks / hz, pausedSeconds: r.pausedMs / 1000, pauses: r.pauses },
      frames: {
        count: f.count,
        meanMs: round(f.mean),
        p50Ms: f.percentile(0.5),
        p95Ms: f.percentile(0.95),
        p99Ms: f.percentile(0.99),
        maxMs: round(f.max),
        over33: f.over(34),
        over50: f.over(51),
        over100: f.over(101),
      },
      cpu: { meanMs: round(r.cpu.mean), p95Ms: r.cpu.percentile(0.95) },
      simUsPerTick: r.simTicks ? round((r.simMs / r.simTicks) * 1000) : 0,
      machine: this.context.machine(),
      settings: this.context.settings(),
    };
  }
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Local date and time as 20261107-183512: sorts by time, safe in a file name. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
