import { headingDegrees } from '../sim/kernel/core/math';
import { labelKeys } from './keys';
import { ActionMap, keysHtml, type Action } from './actions';

/**
 * The heads-up display. The honest view shows only what the shipped game will: a
 * compass strip. The debug view adds a dense readout panel, a key legend and a
 * rangefinder tag at the aim point.
 */
export class Hud {
  private readonly compass: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly panel: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly range: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  /** Labels systems drew (sim/debugDraw.ts), placed over the world in the debug view. */
  private readonly labelLayer: HTMLElement;
  private readonly labels: HTMLElement[] = [];
  private toastTimer = 0;
  private lastHeading = -1;
  /** The compass's drawn width in CSS pixels: what the stylesheet gives it (narrower on small screens). */
  private compassWidth = 440;

  constructor(
    private readonly root: HTMLElement,
    map: ActionMap = new ActionMap(),
  ) {
    root.innerHTML = `
      <canvas class="compass" width="440" height="34"></canvas>
      <pre class="debug-panel"></pre>
      <div class="legend"></div>
      <div class="replay-legend"></div>
      <div class="reticle"></div>
      <div class="range"></div>
      <div class="prompt"></div>
      <div class="toast"></div>
      <div class="debug-labels"></div>`;
    this.compass = root.querySelector('.compass')!;
    this.ctx = this.compass.getContext('2d')!;
    this.panel = root.querySelector('.debug-panel')!;
    this.legend = root.querySelector('.legend')!;
    this.reticle = root.querySelector('.reticle')!;
    this.range = root.querySelector('.range')!;
    this.toastEl = root.querySelector('.toast')!;
    this.promptEl = root.querySelector('.prompt')!;
    this.labelLayer = root.querySelector('.debug-labels')!;
    const legend: Array<[Action[], string]> = [
      [['debugView'], 'view'],
      [['colliders'], 'colliders'],
      [['overwatch'], 'overwatch'],
      [['grid'], 'grid'],
      [['flyCamera'], 'fly camera'],
      [['slower', 'faster'], 'time scale'],
      [['restart'], 'restart run'],
      [['shotDrop'], 'drop a shot'],
      [['mark'], 'mark moment'],
    ];
    this.legend.innerHTML = legend.map(([actions, text]) => `<span>${keysHtml(map, actions)}${text}</span>`).join('');
    labelKeys(this.legend);
    // Watching a replay: its own keys, in either view.
    const replayLegend: Array<[Action[], string]> = [
      [['replayPlay'], 'play or pause'],
      [['replayBack', 'replayForward'], '5 s'],
      [['replayStepBack', 'replayStepForward'], 'a tick'],
      [['slower', 'faster'], 'speed'],
      [['restart'], 'start'],
      [['flyCamera'], 'fly camera'],
      [['debugView'], 'debug view'],
    ];
    const replayKeys = root.querySelector<HTMLElement>('.replay-legend')!;
    replayKeys.innerHTML = replayLegend.map(([actions, text]) => `<span>${keysHtml(map, actions)}${text}</span>`).join('');
    labelKeys(replayKeys);
    this.resizeCompass();
  }

  /** What the body could do right now: a small prompt, or nothing. */
  setPrompt(text: string | null): void {
    if (this.promptEl.textContent !== (text ?? '')) this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('on', text !== null);
  }

  setDebug(on: boolean): void {
    this.root.classList.toggle('is-debug', on);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('is-hidden', !on);
  }

  resizeCompass(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.compassWidth = Math.max(120, Math.round(this.compass.clientWidth || 440));
    this.compass.width = Math.round(this.compassWidth * dpr);
    this.compass.height = Math.round(34 * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastHeading = -1;
  }

  updateCompass(yaw: number): void {
    const heading = headingDegrees(yaw);
    if (Math.abs(heading - this.lastHeading) < 0.05) return;
    this.lastHeading = heading;
    const ctx = this.ctx;
    const w = this.compassWidth;
    const h = 34;
    const span = (120 * w) / 440; // degrees visible across the strip: 120 at full width, the same spacing narrower
    ctx.clearRect(0, 0, w, h);
    ctx.font = '600 11px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const labels: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const start = Math.floor((heading - span / 2) / 5) * 5;
    for (let d = start; d <= heading + span / 2; d += 5) {
      const x = w / 2 + ((d - heading) / span) * w;
      const fade = 1 - Math.abs(x - w / 2) / (w / 2);
      const deg = ((d % 360) + 360) % 360;
      const major = deg % 45 === 0;
      const mid = deg % 15 === 0;
      ctx.globalAlpha = Math.max(0, fade) * 0.9;
      ctx.strokeStyle = '#1d2227';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 2);
      ctx.lineTo(x, h - (major ? 12 : mid ? 8 : 5));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#1d2227';
        ctx.fillText(labels[deg]!, x, 13);
      } else if (mid) {
        ctx.fillStyle = 'rgba(29, 34, 39, 0.6)';
        ctx.font = '500 9px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(String(deg), x, 13);
        ctx.font = '600 11px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d2227';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 4, h);
    ctx.lineTo(w / 2 + 4, h);
    ctx.lineTo(w / 2, h - 5);
    ctx.closePath();
    ctx.fill();
  }

  setPanel(text: string): void {
    if (this.panel.textContent !== text) this.panel.textContent = text;
  }

  setRange(text: string | null): void {
    this.range.textContent = text ?? '';
    this.range.style.visibility = text ? 'visible' : 'hidden';
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-on'), 2200);
  }

  /** Shows these labels at these screen positions (CSS pixels); the rest of the pool hides. At most 64. */
  setLabels(items: ReadonlyArray<{ x: number; y: number; text: string; color: string }>): void {
    const n = Math.min(items.length, 64);
    while (this.labels.length < n) {
      const el = document.createElement('div');
      el.className = 'debug-label';
      this.labelLayer.appendChild(el);
      this.labels.push(el);
    }
    for (let k = 0; k < this.labels.length; k++) {
      const el = this.labels[k]!;
      const item = items[k];
      if (k >= n || !item) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%)`;
      if (el.textContent !== item.text) el.textContent = item.text;
      el.style.borderColor = item.color;
    }
  }

  get reticleEl(): HTMLElement {
    return this.reticle;
  }
}
