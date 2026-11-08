import type { RifleView } from '../sim/game/sim';

/**
 * The instruments in the honest view (lab B, B6): the rifle's scope with its mil
 * reticle, and the binoculars with their rangefinder. Drawn on a canvas of their own over
 * the world, in the camera's own projection: a mark `m` mils from the centre sits at
 * `m/1000` of the focal length, the same tangent-plane offset the hold solver uses
 * (sim/ballistics/aim.ts, holdBetween), so the hold a mark names is where the bullet goes
 * (tests/reticle.test.ts holds the drawing to the simulated impact within 1 cm).
 *
 * The assist layers (taste call 3) change only what is shown, never the physics:
 *   sim     the reticle, the zero and the rounds; the rangefinder gives the distance;
 *   lite    and a dope card: the hold for each range at the dialled zero, and the wind's
 *           hold per metre a second (the default, realistic-lite);
 *   arcade  and the rangefinder reads out the hold and the wind, and the scope marks
 *           where a shot lands at the ranged distance.
 */

export type Assists = 'arcade' | 'lite' | 'sim';
export const ASSISTS: readonly Assists[] = ['arcade', 'lite', 'sim'];
export const ASSIST_NAMES: Readonly<Record<Assists, string>> = { arcade: 'arcade', lite: 'realistic-lite', sim: 'simulation' };

/** Pixels a mil spans on a screen `height` CSS pixels tall with a vertical field of view of `fovDeg`. */
export function pixelsPerMil(fovDeg: number, height: number): number {
  return height / 2 / Math.tan((fovDeg * Math.PI) / 360) / 1000;
}

/**
 * The vertical field of view that shows an optic's true field across a circle of
 * `diameter` CSS pixels on a screen `height` tall: tan(fov/2) = tan(field/2)·height/diameter.
 */
export function opticFov(fieldDeg: number, diameter: number, height: number): number {
  return (360 / Math.PI) * Math.atan((Math.tan((fieldDeg * Math.PI) / 360) * height) / Math.max(diameter, 1));
}

/** The diameter of the scope's circle on a screen, CSS pixels. */
export function scopeDiameter(width: number, height: number): number {
  return 0.94 * Math.min(width, height);
}

/** A line of the dope card: the hold at a range for the dialled zero, and the wind's hold per m/s there. */
export interface DopeRow {
  range: number;
  up: number;
  windPerMs: number;
}

/** What the instruments show this frame. */
export interface InstrumentState {
  /** How far the scope is up, 0 to 1 (the simulation's), and the binoculars, 0 to 1 (the view's). */
  scope: number;
  binoculars: number;
  /** The camera's vertical field of view this frame, degrees. */
  fovDeg: number;
  rifle: RifleView | null;
  /** The last reading of the rangefinder, metres (−1 for nothing in reach), and seconds since it. */
  ranged: { range: number; age: number } | null;
  assists: Assists;
  /** The dope card for the dialled zero and load (lite and arcade). */
  dope: readonly DopeRow[];
  /** Arcade: where a shot lands at the ranged distance, in mils from the centre, and the hold and wind readouts. */
  dot: { up: number; right: number } | null;
  readout: { hold: number; wind: number; windFrom: string } | null;
}

export class Instruments {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private drawn = false;

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'instruments';
    root.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Draws the scope or the binoculars, or clears them. */
  draw(s: InstrumentState): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== this.width || h !== this.height || dpr !== this.dpr) {
      this.width = w;
      this.height = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.drawn = true;
    }
    const ctx = this.ctx;
    if (s.scope <= 0.001 && s.binoculars <= 0.001) {
      if (this.drawn) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawn = false;
      }
      return;
    }
    this.drawn = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (s.binoculars > s.scope) this.binoculars(s, w, h);
    else this.scope(s, w, h);
  }

  private scope(s: InstrumentState, w: number, h: number): void {
    const ctx = this.ctx;
    const up = s.scope;
    const cx = w / 2;
    const cy = h / 2;
    const r = (scopeDiameter(w, h) / 2) * (0.55 + 0.45 * up);
    // The tube: dark everywhere but the glass, the edge of the glass a soft ring.
    ctx.globalAlpha = Math.min(1, up * 1.4);
    ctx.fillStyle = '#0b0d0f';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const ring = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r);
    ring.addColorStop(0, 'rgba(11,13,15,0)');
    ring.addColorStop(1, 'rgba(11,13,15,0.55)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (up < 0.6) {
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = (up - 0.6) / 0.4;
    const ppm = pixelsPerMil(s.fovDeg, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    this.reticle(cx, cy, r, ppm);
    // Facing the sun, the glass flares: you can see you're glinting (ballistics/glint.ts).
    const flare = s.rifle?.glint ?? 0;
    if (flare > 0.01) {
      const g = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy - r * 0.3, r * 1.2);
      g.addColorStop(0, `rgba(255,244,214,${0.45 * flare})`);
      g.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    if (s.assists === 'arcade' && s.dot) {
      // Where a shot lands at the ranged distance: put this on the target.
      ctx.fillStyle = '#e03131';
      ctx.beginPath();
      ctx.arc(cx + s.dot.right * ppm, cy - s.dot.up * ppm, Math.max(2, ppm * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // What the shooter knows of the rifle: below the glass, on the dark.
    const rifle = s.rifle;
    ctx.font = '600 12px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#c9d1d9';
    if (rifle) {
      const parts = [`ZERO ${rifle.zero} m`, `${rifle.rounds} RD${rifle.rounds === 1 ? '' : 'S'}`];
      if (rifle.suppressed) parts.push('SUPPRESSED');
      if (rifle.fitting > 0) parts.push(rifle.suppressed ? 'FITTING…' : 'REMOVING…');
      else if (rifle.bolt > 0) parts.push('BOLT');
      const y = Math.min(h - 22, cy + r + 8);
      ctx.fillText(parts.join('   '), cx, y);
      // A rest and the breath: small marks either side of the glass's foot.
      ctx.textAlign = 'right';
      ctx.fillStyle = rifle.rest > 0.95 ? '#c9d1d9' : 'rgba(201,209,217,0.25)';
      ctx.fillText('REST', cx - r * 0.55, Math.min(h - 22, cy + r * 0.86));
      ctx.textAlign = 'left';
      this.breath(cx + r * 0.55, Math.min(h - 22, cy + r * 0.86) + 7, rifle);
    }
    if ((s.assists === 'lite' || s.assists === 'arcade') && s.dope.length > 0 && rifle) this.dope(s.dope, rifle, cx - r - 14, cy - 70);
    ctx.globalAlpha = 1;
  }

  /** The mil reticle: fine lines, hash marks every half mil, numbers every two, and a tree of holds below. */
  private reticle(cx: number, cy: number, r: number, ppm: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
    ctx.lineWidth = 1;
    const line = (x0: number, y0: number, x1: number, y1: number): void => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    // Fine crosshair with an open centre, thick posts toward the edge.
    const gap = ppm * 0.3;
    line(cx - r, cy, cx - gap, cy);
    line(cx + gap, cy, cx + r, cy);
    line(cx, cy - r, cx, cy - gap);
    line(cx, cy + gap, cx, cy + r);
    ctx.lineWidth = 4;
    const post = ppm * 12;
    line(cx - r, cy, cx - post, cy);
    line(cx + post, cy, cx + r, cy);
    line(cx, cy + post, cx, cy + r);
    ctx.lineWidth = 1;
    // Hash marks: every half mil, longer at whole mils.
    for (let m = 0.5; m <= 10; m += 0.5) {
      const whole = Number.isInteger(m);
      const len = whole ? Math.max(4, ppm * 0.22) : Math.max(2.5, ppm * 0.12);
      const d = m * ppm;
      line(cx - len, cy + d, cx + len, cy + d); // below: holdover
      if (m <= 5) line(cx - len, cy - d, cx + len, cy - d);
      if (m <= 8) {
        line(cx + d, cy - len, cx + d, cy + len);
        line(cx - d, cy - len, cx - d, cy + len);
      }
    }
    ctx.font = `500 ${Math.max(9, Math.min(12, ppm * 0.45))}px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let m = 2; m <= 10; m += 2) ctx.fillText(String(m), cx + Math.max(6, ppm * 0.3), cy + m * ppm);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let m = 2; m <= 8; m += 2) {
      ctx.fillText(String(m), cx + m * ppm, cy + Math.max(6, ppm * 0.3));
      ctx.fillText(String(m), cx - m * ppm, cy + Math.max(6, ppm * 0.3));
    }
    // The tree: dots a mil apart on each whole mil below, for wind and lead at a holdover.
    const dot = Math.max(1, ppm * 0.05);
    for (let row = 1; row <= 6; row++) {
      for (let col = 1; col <= Math.min(row + 1, 5); col++) {
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + side * col * ppm, cy + row * ppm, dot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** The breath: a short bar that empties while it's held. */
  private breath(x: number, y: number, rifle: RifleView): void {
    const ctx = this.ctx;
    const w = 54;
    ctx.fillStyle = 'rgba(201,209,217,0.18)';
    ctx.fillRect(x, y - 2, w, 4);
    ctx.fillStyle = rifle.held > 0 ? '#c9d1d9' : 'rgba(201,209,217,0.6)';
    ctx.fillRect(x, y - 2, w * Math.max(0, Math.min(1, rifle.air)), 4);
  }

  /** The dope card: holds for the dialled zero, by range, and the wind's hold per m/s. */
  private dope(rows: readonly DopeRow[], rifle: RifleView, right: number, top: number): void {
    const ctx = this.ctx;
    ctx.font = '500 11px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(201,209,217,0.55)';
    ctx.fillText(`ZERO ${rifle.zero}`, right, top);
    ctx.fillText('m    hold   wind/(m/s)', right, top + 16);
    ctx.fillStyle = '#c9d1d9';
    rows.forEach((row, k) => {
      const hold = Math.abs(row.up) < 0.05 ? '0' : `${row.up > 0 ? '↑' : '↓'}${Math.abs(row.up).toFixed(1)}`;
      ctx.fillText(`${String(row.range).padStart(3)}  ${hold.padStart(5)}   ${row.windPerMs.toFixed(2).padStart(5)}`, right, top + 34 + k * 15);
    });
  }

  private binoculars(s: InstrumentState, w: number, h: number): void {
    const ctx = this.ctx;
    const up = s.binoculars;
    const cy = h / 2;
    const r = (Math.min(w * 0.3, h * 0.46)) * (0.6 + 0.4 * up);
    ctx.globalAlpha = Math.min(1, up * 1.4);
    ctx.fillStyle = '#0b0d0f';
    ctx.fillRect(0, 0, w, h);
    // Two lenses, cut out of the dark where they overlap too.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    for (const x of [w / 2 - r * 0.62, w / 2 + r * 0.62]) {
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (up < 0.6) {
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = (up - 0.6) / 0.4;
    const ppm = pixelsPerMil(s.fovDeg, h);
    const cx = w / 2;
    // A mil scale for ranging by size, and the rangefinder's box.
    ctx.strokeStyle = 'rgba(20,22,24,0.85)';
    ctx.lineWidth = 1;
    const line = (x0: number, y0: number, x1: number, y1: number): void => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    line(cx - 10 * ppm, cy + 0.5, cx + 10 * ppm, cy + 0.5);
    for (let m = -10; m <= 10; m++) {
      const len = m % 5 === 0 ? 6 : 3;
      line(cx + m * ppm, cy - len, cx + m * ppm, cy + len);
    }
    for (let m = -5; m <= 5; m++) {
      const len = m % 5 === 0 ? 6 : 3;
      line(cx - len, cy + m * ppm, cx + len, cy + m * ppm);
    }
    ctx.strokeRect(cx - 9, cy - 9, 18, 18);
    ctx.font = '600 13px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#d1f2c4';
    const r0 = s.ranged;
    const lines = [!r0 || r0.range < 0 ? 'RANGE  ---- m' : `RANGE  ${String(r0.range).padStart(4)} m`];
    if (s.assists === 'arcade' && s.readout && r0 && r0.range >= 0) {
      const { hold, wind, windFrom } = s.readout;
      lines.push(`HOLD ${hold >= 0 ? '↑' : '↓'}${Math.abs(hold).toFixed(1)}   WIND ${Math.abs(wind).toFixed(1)} ${wind >= 0 ? 'R' : 'L'} · from ${windFrom}`);
    }
    // The readout on a dark plate, so it reads against sky and ground alike.
    const top = cy + Math.min(h * 0.3, 7 * ppm);
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    ctx.fillStyle = 'rgba(11,13,15,0.72)';
    ctx.fillRect(cx - width / 2, top - 5, width, lines.length * 20 + 6);
    ctx.fillStyle = '#d1f2c4';
    lines.forEach((l, k) => ctx.fillText(l, cx, top + k * 20));
    ctx.globalAlpha = 1;
  }
}
