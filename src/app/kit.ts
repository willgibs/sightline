import type { RifleView, Snapshot } from '../sim/game/sim';

/**
 * What you have on you, at a glance, in the corner under the map: how you're standing,
 * whether the suppressor is on, the load, the rounds and the zero. Each is the
 * simulation's own (the snapshot's), and nothing here writes back.
 *
 * Quiet by being still: every field keeps its place, the text changes only when what it
 * says does, and only the figure is big enough to read without looking at it.
 */

/** What the readout needs of the rifle. */
export type RifleReadout = Pick<RifleView, 'rounds' | 'zero' | 'fitting' | 'swapping' | 'suppressed' | 'load'>;

export type SuppressorState = 'on' | 'off' | 'fitting' | 'removing';

export interface KitFields {
  stance: Snapshot['stance'];
  /** The body is still getting there: the stance names where it's going (sim/body/body.ts). */
  settling: boolean;
  /** Everything about the rifle; null without one. */
  rifle: {
    suppressor: SuppressorState;
    /** The load's name; empty if the rifle doesn't say. */
    load: string;
    /** That load is going in. */
    loading: boolean;
    rounds: number;
    zero: number;
    /** No shooting until this says 0: seconds left fitting the suppressor or changing the load. */
    busy: number;
  } | null;
}

/** What the readout says about this body and rifle. */
export function kitFields(stance: Snapshot['stance'], settling: boolean, rifle: RifleReadout | null): KitFields {
  if (!rifle) return { stance, settling, rifle: null };
  const fitting = rifle.fitting > 0;
  const loading = fitting && rifle.swapping;
  // The suppressor flips the moment the job starts (sim/game/shooting.ts): `suppressed` is how it'll end up.
  const suppressor: SuppressorState = fitting && !loading ? (rifle.suppressed ? 'fitting' : 'removing') : rifle.suppressed ? 'on' : 'off';
  return { stance, settling, rifle: { suppressor, load: rifle.load, loading, rounds: rifle.rounds, zero: rifle.zero, busy: rifle.fitting } };
}

const STANCE_NAMES: Readonly<Record<Snapshot['stance'], string>> = { stand: 'STAND', crouch: 'CROUCH', prone: 'PRONE' };
const SUPPRESSOR_WORDS: Readonly<Record<SuppressorState, string>> = { on: 'ON', off: 'OFF', fitting: 'FITTING', removing: 'REMOVING' };

/**
 * A figure for each stance, standing on a line, drawn the way the world is: thin lines,
 * nothing filled. How much of the height above the line it takes says it before the word does.
 */
const FIGURES = `
  <svg class="kit-figure" viewBox="0 0 26 26" aria-hidden="true">
    <path class="kit-ground" d="M.5 25.2h25" />
    <g class="pose-stand">
      <circle cx="13" cy="3.6" r="2.4" />
      <path d="M13 6.2v8.4M13 8.3l-3.8 4.8M13 8.3l3.8 4.8M13 14.6l-3.2 10M13 14.6l3.2 10" />
    </g>
    <g class="pose-crouch">
      <circle cx="15.6" cy="10.2" r="2.4" />
      <path d="M14.5 12.4l-5 6.2M13.6 13.6l5 2.8M9.5 18.6l6.2 1.2-1 4.8M9.5 18.6l-.8 6" />
    </g>
    <g class="pose-prone">
      <circle cx="21.8" cy="18" r="2.4" />
      <path d="M19.6 19.5l-9.2 3.3M18.8 19.8l1.6 4.8M10.4 22.8l-8 1.8M10.4 22.8l-5-2.4-3.2 1.4" />
    </g>
  </svg>`;

export class Kit {
  private readonly el: HTMLElement;
  private readonly stance: HTMLElement;
  private readonly suppressor: HTMLElement;
  private readonly load: HTMLElement;
  private readonly rounds: HTMLElement;
  private readonly zero: HTMLElement;
  private readonly bar: HTMLElement;
  private key = '';
  private shape: 'none' | 'body' | 'rifle' = 'none';
  /** What the job in hand started at: seconds, for how far along it is. */
  private busyFrom = 0;
  /** Someone wants to know when the kit's height changes (the corner's layout: hud.ts). */
  onResize: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'kit';
    this.el.hidden = true;
    this.el.innerHTML = `${FIGURES}
      <div class="kit-lines">
        <div class="kit-line"><span class="kit-stance"></span><span class="kit-rifle kit-rounds"></span><span class="kit-rifle kit-zero"></span></div>
        <div class="kit-line kit-rifle"><span class="kit-load"></span><span class="kit-suppressor"><i>SUPP</i> <b></b></span></div>
        <i class="kit-bar"></i>
      </div>`;
    this.stance = this.el.querySelector('.kit-stance')!;
    this.suppressor = this.el.querySelector('.kit-suppressor')!;
    this.load = this.el.querySelector('.kit-load')!;
    this.rounds = this.el.querySelector('.kit-rounds')!;
    this.zero = this.el.querySelector('.kit-zero')!;
    this.bar = this.el.querySelector('.kit-bar')!;
    parent.appendChild(this.el);
  }

  /** Shows these, or (null) nothing at all: a replay, a sitting, a camera that isn't anyone's eyes. */
  show(f: KitFields | null): void {
    const r = f?.rifle ?? null;
    const key = !f ? '' : `${f.stance}|${f.settling}|${r ? `${r.suppressor}|${r.load}|${r.loading}|${r.rounds}|${r.zero}` : ''}`;
    if (key !== this.key) {
      this.key = key;
      this.el.hidden = !f;
      if (f) this.fill(f);
      const shape = !f ? 'none' : r ? 'rifle' : 'body';
      if (shape !== this.shape) {
        this.shape = shape;
        this.onResize?.();
      }
    }
    // Only while a job is on: a line under the rifle's row that runs out as it finishes.
    if (!r) return;
    if (r.busy <= 0) {
      if (this.busyFrom > 0) {
        this.busyFrom = 0;
        this.bar.style.transform = 'scaleX(0)';
      }
      return;
    }
    this.busyFrom = Math.max(this.busyFrom, r.busy);
    this.bar.style.transform = `scaleX(${Math.min(1, r.busy / this.busyFrom).toFixed(3)})`;
  }

  private fill(f: KitFields): void {
    this.el.dataset.stance = f.stance;
    this.el.classList.toggle('is-settling', f.settling);
    this.stance.textContent = STANCE_NAMES[f.stance];
    this.el.classList.toggle('has-rifle', f.rifle !== null);
    const r = f.rifle;
    if (!r) return;
    this.suppressor.dataset.state = r.suppressor;
    this.suppressor.querySelector('b')!.textContent = SUPPRESSOR_WORDS[r.suppressor];
    this.load.textContent = r.load.toUpperCase();
    this.load.classList.toggle('is-busy', r.loading);
    this.rounds.textContent = `${r.rounds} RD${r.rounds === 1 ? '' : 'S'}`;
    this.rounds.classList.toggle('is-out', r.rounds <= 0);
    this.zero.textContent = `ZERO ${r.zero}`;
  }
}
