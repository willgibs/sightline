import { datan2 } from '../sim/kernel/core/detmath';
import { wrapAngle } from '../sim/kernel/core/math';
import { GUARD_FIELDS, type Snapshot } from '../sim/game/sim';

/**
 * The honest view's cues that a guard is noticing you (A8; design doc · Fairness rules:
 * every detection is telegraphed before it completes). Two of the three; the third, his
 * head and body turning and his weapon coming up, is on the guard himself (render/guardMeshes.ts).
 *
 * - **The detection indicator, at the screen's edge.** For every guard whose meter is at
 *   the cue (30%) or above, a mark on an ellipse just inside the edge, toward him: wider,
 *   thicker and warmer as his meter fills and his awareness rises, solid red when he has
 *   seen you. Below the cue nothing shows (design doc: below 30% nothing visible happens).
 * - **What guards say, captioned as you hear it:** only lines that reach your ears by the
 *   law of sound (audio/hearing.ts), with an arrow toward where they came from.
 */

/** Colours by rung of the awareness ladder: unaware (meter only), curious, suspicious, searching, combat. */
const RUNG_COLOURS = ['#f4efdc', '#f4efdc', '#f2b441', '#f07a30', '#e3343a'];
const CAPTION_SECONDS = 3.5;
const MAX_CAPTIONS = 3;

export interface CueView {
  /** The camera, as drawn. */
  x: number;
  z: number;
  yaw: number;
}

export class Cues {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly captions: HTMLElement;
  private readonly lines: Array<{ el: HTMLElement; until: number }> = [];
  private width = 0;
  private height = 0;
  private drawn = false;

  constructor(
    root: HTMLElement,
    private cue: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cues';
    this.captions = document.createElement('div');
    this.captions.className = 'captions';
    root.append(this.canvas, this.captions);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** The meter's cue, from tuning. */
  setCue(cue: number): void {
    this.cue = cue;
  }

  /** Draws the indicator for this frame: every guard at the cue or above, toward him from the camera. */
  draw(curr: Snapshot, view: CueView, now: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ctx = this.ctx;
    let any = false;
    for (let i = 0; i < curr.guardIds.length; i++) {
      const o = i * GUARD_FIELDS;
      const meter = curr.guards[o + 7]!;
      if (meter < this.cue) continue;
      if (!any) {
        ctx.clearRect(0, 0, w, h);
        any = true;
      }
      const rung = Math.round(curr.guards[o + 8]!);
      const fill = Math.min(1, (meter - this.cue) / (1 - this.cue));
      // Bearing from the camera, relative to where it looks: positive to the left.
      const dx = curr.guards[o]! - view.x;
      const dz = curr.guards[o + 2]! - view.z;
      const rel = wrapAngle(datan2(-dx, -dz) - view.yaw);
      const half = ((meter >= 1 ? 16 : 4 + 10 * fill) * Math.PI) / 180;
      this.arc(-rel, half, meter >= 1 ? 9 : 3 + 5 * fill, RUNG_COLOURS[meter >= 1 ? 4 : rung] ?? RUNG_COLOURS[0]!, meter >= 1 ? 0.75 + 0.25 * Math.sin(now * 9) : 0.35 + 0.65 * fill);
    }
    if (!any && this.drawn) ctx.clearRect(0, 0, w, h);
    this.drawn = any;
    // Captions fade out in their time.
    for (let k = this.lines.length - 1; k >= 0; k--) {
      const line = this.lines[k]!;
      const left = line.until - now;
      if (left <= 0) {
        line.el.remove();
        this.lines.splice(k, 1);
      } else line.el.style.opacity = String(Math.min(1, left / 0.6));
    }
  }

  /** A mark on the ellipse inside the screen's edge, centred `theta` clockwise from the top. */
  private arc(theta: number, half: number, width: number, colour: string, alpha: number): void {
    const ctx = this.ctx;
    // Just inside the screen's edge, and below the compass strip at the top.
    const top = 62;
    const side = 28;
    const bottom = 30;
    const cx = this.width / 2;
    const cy = (top + this.height - bottom) / 2;
    const rx = cx - side;
    const ry = cy - top;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    const steps = 12;
    for (let k = 0; k <= steps; k++) {
      const a = theta - half + (2 * half * k) / steps;
      const x = cx + rx * Math.sin(a);
      const y = cy - ry * Math.cos(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Captions a line heard from a guard at (x, z): an arrow toward him, his words. */
  say(text: string, shout: boolean, x: number, z: number, view: CueView, now: number): void {
    const rel = wrapAngle(datan2(-(x - view.x), -(z - view.z)) - view.yaw);
    const el = document.createElement('div');
    el.className = shout ? 'caption is-shout' : 'caption';
    el.textContent = `${arrow(rel)}  ${text}`;
    this.captions.appendChild(el);
    this.lines.push({ el, until: now + CAPTION_SECONDS });
    while (this.lines.length > MAX_CAPTIONS) this.lines.shift()!.el.remove();
  }

  /** Clears everything: a new run, a replay. */
  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawn = false;
    for (const l of this.lines) l.el.remove();
    this.lines.length = 0;
  }
}

/** An arrow toward a bearing relative to the view (positive to the left). */
function arrow(rel: number): string {
  const deg = (rel * 180) / Math.PI;
  const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
  const k = Math.round(deg / 45);
  return arrows[((k % 8) + 8) % 8]!;
}
