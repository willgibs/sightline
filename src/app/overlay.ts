import { normalizeSeed, randomSeed } from '../sim/core/seed';
import { labelKeys } from './keys';

/**
 * The start and pause screen: the seed, how to play, and the way back in. Kept to one
 * focal point: the click that puts you in the valley.
 */

export interface OverlayHandlers {
  onResume: () => void;
  onGenerate: (seed: string) => void;
  onSaveRecording: () => void;
  /** After an error: what "try again" means depends on what failed (game.ts). */
  onRetry: () => void;
}

export type OverlayMode = 'loading' | 'start' | 'paused' | 'report' | 'error';

export class Overlay {
  private readonly seedInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly title: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly report: HTMLElement;
  private mode: OverlayMode = 'loading';
  /** The start screen's title: the phase, or the scene being played. */
  private startTitle = 'Phase 0 · Foundations';

  constructor(
    private readonly root: HTMLElement,
    handlers: OverlayHandlers,
  ) {
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
          <span><kbd data-code="KeyW KeyA KeyS KeyD">W A S D</kbd> move</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd data-code="KeyC">C</kbd> crouch</span>
          <span><kbd data-code="KeyZ">Z</kbd> prone</span>
          <span><kbd>Right mouse</kbd> or <kbd data-code="KeyF">F</kbd> zoom</span>
          <span><kbd>F3</kbd> or <kbd>\`</kbd> debug view</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
        <pre class="report"></pre>
        <div class="overlay-foot">
          <span class="status"></span>
          <button class="link" type="button" data-act="save">Save recording</button>
        </div>
      </div>`;
    labelKeys(root);
    this.seedInput = root.querySelector('#seed')!;
    this.status = root.querySelector('.status')!;
    this.title = root.querySelector('.overlay-title')!;
    this.go = root.querySelector('.go')!;
    this.report = root.querySelector('.report')!;
    this.go.addEventListener('click', () => (this.mode === 'error' ? handlers.onRetry() : handlers.onResume()));
    root.querySelector('[data-act="reroll"]')!.addEventListener('click', () => {
      this.seedInput.value = randomSeed();
      handlers.onGenerate(this.seedInput.value);
    });
    root.querySelector('[data-act="generate"]')!.addEventListener('click', () => handlers.onGenerate(normalizeSeed(this.seedInput.value)));
    root.querySelector('[data-act="save"]')!.addEventListener('click', () => handlers.onSaveRecording());
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

  /** Something failed: what, the details, and what trying again will do. */
  showError(title: string, detail: string, retry: string): void {
    this.show('error');
    this.title.textContent = title;
    this.report.textContent = detail;
    this.go.textContent = retry;
  }

  get visible(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  get currentMode(): OverlayMode {
    return this.mode;
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
}
