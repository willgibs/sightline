/**
 * What systems show in the debug view, beyond what the renderer draws from snapshots:
 * a perception ray, a probe around a body's rim, a label over a guard. Every system
 * ships explainable (CLAUDE.md rule 8), and this is how it explains itself.
 *
 * Write-only. Nothing in the simulation reads it back; it isn't state, isn't hashed and
 * isn't recorded, so drawing more never changes an outcome. A system draws through
 * `ctx.debug(draw => ...)`, which runs only while the debug view is on: work done just
 * to explain must never change what the system does. Shapes last until the tick after;
 * the renderer draws the newest tick's.
 */

/** Colours by meaning; the debug palette picks the actual colours. */
export type DebugTone = 'info' | 'good' | 'warn' | 'bad' | 'muted';

export type DebugShape =
  | { kind: 'line'; ax: number; ay: number; az: number; bx: number; by: number; bz: number; tone: DebugTone }
  | { kind: 'point'; x: number; y: number; z: number; size: number; tone: DebugTone }
  | { kind: 'circle'; x: number; y: number; z: number; r: number; tone: DebugTone }
  | { kind: 'label'; x: number; y: number; z: number; text: string; tone: DebugTone; detail?: string };

/** The drawing calls a system gets inside ctx.debug. */
export interface DebugDraw {
  line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, tone?: DebugTone): void;
  point(x: number, y: number, z: number, size?: number, tone?: DebugTone): void;
  /** A horizontal circle. */
  circle(x: number, y: number, z: number, r: number, tone?: DebugTone): void;
  label(x: number, y: number, z: number, text: string, tone?: DebugTone, detail?: string): void;
}

/** Collects one tick's shapes. */
export class DebugCanvas implements DebugDraw {
  readonly shapes: DebugShape[] = [];

  clear(): void {
    this.shapes.length = 0;
  }

  line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, tone: DebugTone = 'info'): void {
    this.shapes.push({ kind: 'line', ax, ay, az, bx, by, bz, tone });
  }

  point(x: number, y: number, z: number, size = 0.1, tone: DebugTone = 'info'): void {
    this.shapes.push({ kind: 'point', x, y, z, size, tone });
  }

  circle(x: number, y: number, z: number, r: number, tone: DebugTone = 'info'): void {
    this.shapes.push({ kind: 'circle', x, y, z, r, tone });
  }

  /** A label over the world. `detail` is the fuller text, shown when you're looking right at it; `text` may then be '' to show nothing otherwise. */
  label(x: number, y: number, z: number, text: string, tone: DebugTone = 'info', detail?: string): void {
    this.shapes.push(detail === undefined ? { kind: 'label', x, y, z, text, tone } : { kind: 'label', x, y, z, text, tone, detail });
  }
}
