import { normalizeSeed, randomSeed } from '../sim/kernel/core/seed';
import { labelKeys } from './keys';
import { ActionMap, keysHtml, type Action } from './actions';
import { cleanSettings, type Settings } from './settings';

/**
 * The start and pause screen: the seed, how to play, and the way back in. Kept to one
 * focal point: the click that puts you in the valley.
 */

export interface OverlayHandlers {
  onResume: () => void;
  onGenerate: (seed: string) => void;
  onSaveRecording: () => void;
  /** A recording file chosen for watching. */
  onWatch: (file: File) => void;
  /** The action under an error or an outcome: what it does depends on what happened (game.ts). */
  onRetry: () => void;
  /** A setting changed: apply it and keep it. */
  onSettings: (s: Settings) => void;
}

export type OverlayMode = 'loading' | 'start' | 'paused' | 'report' | 'error' | 'outcome';

export class Overlay {
  private readonly seedInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly title: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly report: HTMLElement;
  private mode: OverlayMode = 'loading';
  private readonly settingsRoot: HTMLElement;
  /** The tuned field of view, which the slider starts at when the player hasn't chosen one. */
  private tunedFov = 58;
  /** The start screen's title: the phase, or the scene being played. */
  private startTitle = 'Phase 0 · Foundations';

  /** Shows or hides one line of the key legend: a key that does nothing in this run isn't offered. */
  setKey(action: Action, shown: boolean): void {
    const line = this.root.querySelector<HTMLElement>(`.keys [data-key="${action}"]`);
    if (line) line.style.display = shown ? '' : 'none';
  }

  constructor(
    private readonly root: HTMLElement,
    handlers: OverlayHandlers,
    map: ActionMap = new ActionMap(),
  ) {
    const legend: Array<[Action[], string]> = [
      [['forward', 'left', 'back', 'right'], 'move'],
      [['sprint'], 'sprint'],
      [['crouch'], 'crouch'],
      [['prone'], 'prone'],
      [['leanLeft', 'leanRight'], 'lean'],
      [['climb'], 'mantle'],
      [['use'], 'carry a body'],
      [['fire'], 'fire'],
      [['zoom'], 'scope: tap to stay in, hold to peek'],
      [['scopeToggle'], 'scope on or off'],
      [['binoculars'], 'binoculars'],
      [['zeroUp', 'zeroDown'], 'zero'],
      [['suppressor'], 'suppressor'],
      [['load'], 'load: match or subsonic'],
      [['throw'], 'throw a stone'],
      [['assists'], 'instruments'],
      [['debugView'], 'debug view'],
    ];
    const keys = legend.map(([actions, text]) => `<span data-key="${actions[0]}">${keysHtml(map, actions)} ${text}</span>`).join('\n          ');
    root.innerHTML = `
      <div class="overlay-panel">
        <div class="wordmark">SIGHTLINE</div>
        <div class="overlay-title">Phase 0 · Foundations</div>
        <button class="go" type="button">Click to begin</button>
        <div class="seed-row">
          <label for="seed">Seed</label>
          <input id="seed" spellcheck="false" autocomplete="off" maxlength="40" />
          <button class="icon" type="button" data-act="reroll" title="Random seed">↻</button>
          <button class="small" type="button" data-act="generate">Generate</button>
        </div>
        <div class="keys">
          ${keys}
          <span><kbd>Esc</kbd> pause</span>
        </div>
        <details class="settings">
          <summary>Settings</summary>
          <label>Mouse sensitivity <input type="range" data-set="sensitivity" min="-2" max="2" step="0.05" /> <output data-for="sensitivity"></output></label>
          <label>Field of view <input type="range" data-set="fov" min="45" max="90" step="1" /> <output data-for="fov"></output></label>
          <label>Volume <input type="range" data-set="volume" min="0" max="1" step="0.05" /> <output data-for="volume"></output></label>
          <label class="check"><input type="checkbox" data-set="invertY" /> Invert the mouse</label>
          <label class="check"><input type="checkbox" data-set="rawMouse" /> Raw mouse input (no system acceleration, where the browser offers it)</label>
          <label>Instruments <select data-set="assists"><option value="sim">Simulation: the reticle and the range</option><option value="lite">Realistic-lite: and a dope card</option><option value="arcade">Arcade: holds read out, landing marked</option></select></label>
        </details>
        <pre class="report"></pre>
        <div class="overlay-foot">
          <span class="status"></span>
          <button class="link" type="button" data-act="save">Save recording</button>
        </div>
        <div class="kept" hidden></div>
        <div class="watch-row">
          <button class="link" type="button" data-act="watch">Watch a recording…</button>
          <span>or drop one on the page</span>
          <input type="file" accept=".slrec" hidden />
        </div>
      </div>`;
    labelKeys(root);
    this.settingsRoot = root.querySelector('.settings')!;
    this.settingsRoot.addEventListener('input', () => handlers.onSettings(this.readSettings()));
    // The panel's keys are for the panel: don't let them reach the game.
    this.settingsRoot.addEventListener('keydown', (e) => e.stopPropagation());
    this.seedInput = root.querySelector('#seed')!;
    this.status = root.querySelector('.status')!;
    this.title = root.querySelector('.overlay-title')!;
    this.go = root.querySelector('.go')!;
    this.report = root.querySelector('.report')!;
    this.go.addEventListener('click', () => (this.mode === 'error' || this.mode === 'outcome' ? handlers.onRetry() : handlers.onResume()));
    root.querySelector('[data-act="reroll"]')!.addEventListener('click', () => {
      this.seedInput.value = randomSeed();
      handlers.onGenerate(this.seedInput.value);
    });
    root.querySelector('[data-act="generate"]')!.addEventListener('click', () => handlers.onGenerate(normalizeSeed(this.seedInput.value)));
    root.querySelector('[data-act="save"]')!.addEventListener('click', () => handlers.onSaveRecording());
    const picker = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    root.querySelector('[data-act="watch"]')!.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) handlers.onWatch(file);
    });
    this.seedInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // A held Enter repeats; one valley per press.
      if (e.key === 'Enter' && !e.repeat && this.visible) handlers.onGenerate(normalizeSeed(this.seedInput.value));
    });
  }

  show(mode: OverlayMode): void {
    this.mode = mode;
    this.root.classList.remove('is-hidden');
    this.root.inert = false;
    this.root.dataset.mode = mode;
    this.title.textContent = mode === 'paused' ? 'Paused' : mode === 'loading' ? 'Generating the valley…' : mode === 'report' ? 'Benchmark' : this.startTitle;
    this.go.textContent = mode === 'paused' ? 'Click to resume' : mode === 'report' ? 'Click to play this valley' : 'Click to begin';
  }

  /**
   * Hidden means out of reach, not just transparent: nothing in it keeps the focus or can
   * be tabbed to, so keys during play never land in the seed field.
   */
  hide(): void {
    this.root.classList.add('is-hidden');
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.root.inert = true;
  }

  /** Something failed, or the rules decided the run: what happened, the details, and the action offered. */
  showMessage(mode: 'error' | 'outcome', title: string, detail: string, action: string): void {
    this.show(mode);
    this.title.textContent = title;
    this.report.textContent = detail;
    this.go.textContent = action;
  }

  get visible(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  get currentMode(): OverlayMode {
    return this.mode;
  }

  /** Shows these settings in the controls. `tunedFov` is what a field of view of 0 (the default) means. */
  showSettings(s: Settings, tunedFov: number): void {
    this.tunedFov = tunedFov;
    const input = (name: string) => this.settingsRoot.querySelector<HTMLInputElement>(`[data-set="${name}"]`)!;
    input('sensitivity').value = String(Math.log2(s.sensitivity));
    input('fov').value = String(s.fov || tunedFov);
    input('volume').value = String(s.volume);
    input('invertY').checked = s.invertY;
    input('rawMouse').checked = s.rawMouse;
    this.settingsRoot.querySelector<HTMLSelectElement>('[data-set="assists"]')!.value = s.assists;
    this.showValues(s);
  }

  private readSettings(): Settings {
    const input = (name: string) => this.settingsRoot.querySelector<HTMLInputElement>(`[data-set="${name}"]`)!;
    const fov = Number(input('fov').value);
    const s: Settings = {
      sensitivity: 2 ** Number(input('sensitivity').value),
      fov: fov === this.tunedFov ? 0 : fov,
      volume: Number(input('volume').value),
      invertY: input('invertY').checked,
      rawMouse: input('rawMouse').checked,
      assists: cleanSettings({ assists: this.settingsRoot.querySelector<HTMLSelectElement>('[data-set="assists"]')!.value }).assists,
    };
    this.showValues(s);
    return s;
  }

  private showValues(s: Settings): void {
    const out = (name: string) => this.settingsRoot.querySelector<HTMLOutputElement>(`[data-for="${name}"]`)!;
    out('sensitivity').textContent = `×${s.sensitivity.toFixed(2)}`;
    out('fov').textContent = `${s.fov || this.tunedFov}°${s.fov ? '' : ' (default)'}`;
    out('volume').textContent = `${Math.round(s.volume * 100)}%`;
  }

  setSeed(seed: string): void {
    this.seedInput.value = seed;
  }

  /** The start screen's title (a scene's name, or the phase). */
  setStartTitle(text: string): void {
    this.startTitle = text;
    if (this.mode === 'start') this.title.textContent = text;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setReport(text: string): void {
    this.report.textContent = text;
  }

  /**
   * Runs kept in this browser (the deployed game's autosaves, playtest.ts), newest first,
   * each with a way to save it as a file. Empty hides the line.
   */
  setKept(runs: ReadonlyArray<{ text: string; save: () => void; watch: () => void; forget: () => void }>, forgetAll: () => void = () => undefined): void {
    const el = this.root.querySelector<HTMLElement>('.kept')!;
    el.hidden = runs.length === 0;
    el.replaceChildren();
    if (runs.length === 0) return;
    el.append('Kept in this browser:');
    for (const run of runs) {
      const item = document.createElement('span');
      item.className = 'kept-run';
      const watch = document.createElement('button');
      watch.type = 'button';
      watch.className = 'link';
      watch.textContent = `▶ ${run.text}`;
      watch.title = 'Watch this run';
      watch.addEventListener('click', run.watch);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'link';
      save.textContent = 'save';
      save.title = 'Save this run as a recording file';
      save.addEventListener('click', run.save);
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'link';
      forget.textContent = 'delete';
      forget.title = 'Delete this run from this browser';
      forget.addEventListener('click', run.forget);
      item.append(watch, save, forget);
      el.append(item);
    }
    if (runs.length > 1) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'link';
      all.textContent = 'delete all';
      all.title = 'Delete every run kept in this browser';
      all.addEventListener('click', forgetAll);
      el.append(all);
    }
  }
}
