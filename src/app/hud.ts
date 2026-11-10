import { DevDock } from './devDock';
import { headingDegrees } from '../sim/kernel/core/math';
import { labelKeys } from './keys';
import { ActionMap, keysHtml, type Action } from './actions';
import { Kit } from './kit';
import { Minimap } from './minimap';

/**
 * Whether the player's own readouts belong on screen now: the kit and the map are about
 * the body you're in, and for you alone. A replay is someone's run being watched, a sitting
 * is blind (A12), and a benchmark or the fly camera isn't anyone's eyes. The compound
 * simulator has no player at all (`docs/pillars.md`), only a body parked out of the way.
 */
export function showsPlayerHud(now: { replay: boolean; trial: boolean; bench: boolean; detached: boolean; scene: string | null }): boolean {
  return !now.replay && !now.trial && !now.bench && !now.detached && now.scene !== 'compound';
}

/**
 * The heads-up display. The honest view shows only what the shipped game will: a compass
 * strip, and in the corner what you carry (kit.ts) and the picture of the ground you were
 * given (minimap.ts). The debug view adds panels docked at the edges (devDock.ts), a key
 * legend and a rangefinder tag at the aim point.
 */
export class Hud {
  private readonly compass: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly legend: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly range: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  /** The slim panels at the edges of the screen in the debug view (devDock.ts). */
  readonly dock: DevDock;
  /** The bottom-right corner: the map above what you carry. */
  private readonly corner: HTMLElement;
  readonly kit: Kit;
  readonly map: Minimap;
  private opticUp = false;
  private readonly panelBodies = new Map<string, string>();
  private readonly extraKeys: HTMLElement;
  /** Labels systems drew (sim/debugDraw.ts), placed over the world in the debug view. */
  private readonly labelLayer: HTMLElement;
  private readonly labels: HTMLElement[] = [];
  private toastTimer = 0;
  private lastHeading = -1;
  private lastMark: number | null = null;
  /** The compass's drawn width in CSS pixels: what the stylesheet gives it (narrower on small screens). */
  private compassWidth = 440;

  constructor(
    private readonly root: HTMLElement,
    map: ActionMap = new ActionMap(),
  ) {
    root.innerHTML = `
      <canvas class="compass" width="440" height="34"></canvas>
      <div class="legend"></div>
      <div class="replay-legend"></div>
      <div class="reticle"></div>
      <div class="range"></div>
      <div class="prompt"></div>
      <div class="toast"></div>
      <div class="debug-labels"></div>`;
    this.compass = root.querySelector('.compass')!;
    this.ctx = this.compass.getContext('2d')!;
    this.dock = new DevDock(root, `${map.describe('mouseFree')} mouse · ${map.describe('dockHide')} panels`);
    this.legend = root.querySelector('.legend')!;
    this.extraKeys = document.createElement('span');
    this.extraKeys.className = 'legend-extra';
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
      [['dropNoise'], 'drop a noise'],
      [['dropBody'], 'drop a body'],
      [['shotDrop'], 'drop a shot'],
      [['mark'], 'mark moment'],
      [['mouseFree'], 'mouse'],
      [['dockHide'], 'panels'],
    ];
    this.legend.innerHTML = legend.map(([actions, text]) => `<span>${keysHtml(map, actions)}${text}</span>`).join('');
    labelKeys(this.legend);
    this.legend.appendChild(this.extraKeys);
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
    this.corner = document.createElement('div');
    this.corner.className = 'corner';
    // Under whatever comes and goes on top of it (a toast, a caption) with the map enlarged.
    root.prepend(this.corner);
    this.map = new Minimap(this.corner, keysHtml(map, ['minimap']));
    this.kit = new Kit(this.corner);
    labelKeys(this.corner);
    this.map.onResize = () => this.settleCorner();
    this.kit.onResize = () => this.settleCorner();
    this.resizeCompass();
  }

  /**
   * Keeps the corner off everything else that lives along the bottom and the right: it
   * stands on the key legend when that shows, and the right-hand dock stops above it.
   * Measured only when one of them changes.
   */
  private settleCorner(): void {
    const legend = this.legend.offsetHeight;
    // The legend stands 8 px off the bottom edge; the corner 6 above that, or 10 off the edge with no legend there.
    this.root.style.setProperty('--floor', `${legend > 0 ? legend + 14 : 10}px`);
    this.root.style.setProperty('--corner', `${this.corner.offsetHeight}px`);
  }

  /** An optic is up: the corner of the screen goes dark round it, and what's written there goes pale to read on it. */
  setOptic(up: boolean): void {
    if (up === this.opticUp) return;
    this.opticUp = up;
    this.root.classList.toggle('is-optic', up);
  }

  /** What the body could do right now: a small prompt, or nothing. */
  setPrompt(text: string | null): void {
    if (this.promptEl.textContent !== (text ?? '')) this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('on', text !== null);
  }

  setDebug(on: boolean): void {
    this.root.classList.toggle('is-debug', on);
    this.settleCorner();
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
    this.map.resize(window.innerWidth, window.innerHeight);
    this.settleCorner();
  }

  /** The compass strip, and a mark on it for the way out, once there's somewhere to go (`mark`: its heading in degrees). */
  updateCompass(yaw: number, mark: number | null = null): void {
    const heading = headingDegrees(yaw);
    if (Math.abs(heading - this.lastHeading) < 0.05 && mark === this.lastMark) return;
    this.lastHeading = heading;
    this.lastMark = mark;
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
    if (mark !== null) {
      // The short way round to it, pinned to the strip's end when it's behind you.
      const off = ((mark - heading + 540) % 360) - 180;
      const x = Math.max(16, Math.min(w - 16, w / 2 + (off / span) * w));
      ctx.fillStyle = '#b4531f';
      ctx.fillText('OUT', x, 13);
    }
    ctx.fillStyle = '#1d2227';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 4, h);
    ctx.lineTo(w / 2 + 4, h);
    ctx.lineTo(w / 2, h - 5);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * The debug view's readouts, as blocks of lines separated by a blank line, each block a
   * section of the dock. A block starting with a word in capitals is titled by it ("CAMP ·
   * calm"); what follows on that line is the section's first line, its summary when closed.
   */
  setPanel(text: string): void {
    const blocks = text.split(/\n{2,}/).filter((b) => b !== '').map(panelBlock);
    const shown = new Set<string>();
    for (const [order, { title, body }] of blocks.entries()) {
      const id = `panel-${title}`;
      shown.add(id);
      this.panelBodies.set(id, body);
      // What you most often want to watch starts open; the rest wait to be asked for.
      this.dock.add({ id, title, side: 'left', order, open: title === 'Perception' || title === 'Camp', text: () => this.panelBodies.get(id) ?? '', summary: () => (this.panelBodies.get(id) ?? '').split('\n')[0] ?? '' });
    }
    for (const id of this.panelBodies.keys()) {
      if (shown.has(id)) continue;
      this.dock.remove(id);
      this.panelBodies.delete(id);
    }
    this.dock.refresh();
  }

  /** The legend's own keys for what's running now (the compound simulator's drops, say), after the standard ones. */
  setExtraKeys(keys: ReadonlyArray<readonly [string, string]>): void {
    this.extraKeys.textContent = '';
    for (const [key, text] of keys) {
      const span = document.createElement('span');
      const k = document.createElement('kbd');
      k.textContent = key;
      span.append(k, text);
      this.extraKeys.appendChild(span);
    }
    this.settleCorner();
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

  /**
   * Shows these labels at these screen positions (CSS pixels); the rest of the pool hides.
   * At most 64. Each moves up just enough not to sit on one already placed, so a crowd
   * stays readable.
   */
  setLabels(given: ReadonlyArray<{ x: number; y: number; text: string; color: string }>): void {
    const items = spreadLabels(given);
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

  /** The lab panel shows in the honest view too: it's something you read while playing. */
  setLab(on: boolean): void {
    this.root.classList.toggle('is-lab', on);
  }

  get reticleEl(): HTMLElement {
    return this.reticle;
  }
}

const capitalize = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

/** A block of the debug view's readouts: its title, and its lines without the title. */
export function panelBlock(block: string, k: number): { title: string; body: string } {
  if (k === 0) return { title: 'Run', body: block };
  const end = block.indexOf('\n');
  const first = end < 0 ? block : block.slice(0, end);
  const rest = end < 0 ? '' : block.slice(end + 1);
  const mark = first.indexOf(' · ');
  const word = mark < 0 ? first : first.slice(0, mark);
  if (!/^[A-Z][A-Z ]*$/.test(word)) return { title: `More ${k}`, body: block };
  const after = mark < 0 ? '' : first.slice(mark + 3);
  return { title: capitalize(word), body: after !== '' && rest !== '' ? `${after}\n${rest}` : after + rest };
}

/** Label boxes, by a rough width for the mono font: enough to keep a crowd from stacking. */
const LABEL_HEIGHT = 15;
const LABEL_CHAR = 6;

/** Moves each label up, nearest the viewer's centre first, until it clears those already placed. */
function spreadLabels<T extends { x: number; y: number; text: string }>(given: readonly T[]): T[] {
  const placed: Array<{ x: number; y: number; w: number }> = [];
  const out: T[] = [];
  for (const item of given) {
    if (item.text === '') continue;
    const w = item.text.length * LABEL_CHAR + 12;
    let y = item.y;
    for (let tries = 0; tries < 8; tries++) {
      const hit = placed.find((p) => Math.abs(p.x - item.x) < (p.w + w) / 2 && Math.abs(p.y - y) < LABEL_HEIGHT);
      if (!hit) break;
      y = hit.y - LABEL_HEIGHT;
    }
    placed.push({ x: item.x, y, w });
    out.push({ ...item, y });
  }
  return out;
}
