import { CAMP_SWITCHES } from '../sim/game/switches';
import type { Readings } from '../lab/gauges';
import type { StimulusName } from '../sim/game/drops';
import type { DevDock } from './devDock';

/**
 * The lab panel (Lab F, docs/camp-engine.md): `&lab` in the address of a camp scene adds, to
 * the dock, what the camp is doing to you, in the same gauges the experiments read, and
 * switches for parts of it. A development instrument, for someone testing an engine: it
 * shows the truth, so a sitting that's meant to be blind leaves it off.
 *
 * A switch is a parameter of the scene, so changing one reloads the scene with it, and the
 * run's recording names it.
 */

const seconds = (s: number): string => (Number.isNaN(s) ? 'not yet' : `${s.toFixed(0)} s ago`);
const metres = (m: number): string => (Number.isFinite(m) ? `${m.toFixed(0)} m` : '–');
/** Metres, finely when it's close: half a metre from your head is not "0 m". */
const miss = (m: number): string => (Number.isFinite(m) ? `${m.toFixed(m < 10 ? 1 : 0)} m` : '–');

/** The scene's parameters with this list of switches off. */
export function paramsWithOff(params: string, off: readonly string[]): string {
  const rest = params.split('&').filter((p) => p !== '' && !p.startsWith('off='));
  return [...rest, ...(off.length > 0 ? [`off=${off.join(',')}`] : [])].join('&');
}

/** The switches a scene's parameters turn off. */
export function offIn(params: string): string[] {
  const part = params.split('&').find((p) => p.startsWith('off='));
  return part ? part.slice(4).split(',').filter((s) => s !== '') : [];
}

/** The compound simulator's keys: what happens where you're pointing. */
export const DROP_KEYS: ReadonlyArray<readonly [string, StimulusName, string]> = [
  ['Digit1', 'noise', 'noise'],
  ['Digit2', 'body', 'body'],
  ['Digit3', 'shot', 'shot'],
  ['Digit4', 'suppressed-shot', 'quiet shot'],
  ['Digit5', 'kill', 'guard drops'],
  ['Digit6', 'sabotage', 'cut equipment'],
];

/** The compound simulator's look along the last shot, from where it was fired. */
export const SHOOTER_VIEW_KEY = 'Digit7';

export class LabPanel {
  private lines = '';
  private brief = '';

  constructor(private readonly dock: DevDock, params: string, drop: ((what: StimulusName) => void) | null = null, look: (() => void) | null = null) {
    dock.add({ id: 'lab-camp', title: 'Gauges', side: 'right', open: true, text: () => this.lines, summary: () => this.brief });
    const box = document.createElement('div');
    box.className = 'lab-switches';
    const off = new Set(offIn(params));
    for (const name of CAMP_SWITCHES) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !off.has(name);
      input.addEventListener('change', () => {
        if (input.checked) off.delete(name);
        else off.add(name);
        const url = new URL(window.location.href);
        url.searchParams.set('params', paramsWithOff(params, CAMP_SWITCHES.filter((s) => off.has(s))));
        window.location.href = url.toString();
      });
      label.append(input, name);
      box.appendChild(label);
    }
    dock.add({ id: 'lab-switches', title: 'Switches', side: 'right', body: box, summary: () => (off.size === 0 ? 'all on' : `off: ${[...off].join(', ')}`) });
    if (drop) {
      window.addEventListener('keydown', (e) => {
        const key = DROP_KEYS.find(([code]) => code === e.code);
        if (key) drop(key[1]);
        else if (e.code === SHOOTER_VIEW_KEY) look?.();
      });
    }
  }

  update(r: Readings): void {
    this.brief = `${r.level}, ${r.guardsDown} down`;
    this.lines = [
      `first shot  ${seconds(r.sinceFirstShot)}`,
      `shots       ${r.shotsFired}${Number.isNaN(r.sinceLastShot) ? '' : ` · last ${seconds(r.sinceLastShot)}`}`,
      `down        ${r.guardsDown}  standing ${r.guardsStanding}`,
      `shooter at  ${r.shooter ? `${r.shooter.x.toFixed(0)}, ${r.shooter.z.toFixed(0)}` : 'none yet'}`,
      `nearest     ${metres(r.nearest)}`,
      `in line     ${r.inLine}`,
      `fired back  ${r.returnFire.rounds}${r.returnFire.rounds > 0 ? ` · closest ${miss(r.returnFire.closest)} · struck ${r.returnFire.struck}` : ''}`,
      `spotted     ${r.detected ? 'yes' : 'no'}`,
      `their guess ${Number.isNaN(r.estimateOff) ? 'none' : `${metres(r.estimateOff)} off`}`,
      `camp        ${r.level}${r.siren ? ', siren' : ''}`,
      `target      ${r.targetStatus}`,
      ...(r.protection ? [`protection  ${r.protection}`] : []),
    ].join('\n');
    // In the honest view nothing else brings the dock up to date.
    this.dock.refresh();
  }
}
