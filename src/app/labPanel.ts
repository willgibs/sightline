import { CAMP_SWITCHES } from '../sim/game/switches';
import type { Readings } from '../lab/gauges';

/**
 * The lab panel (Lab F, docs/camp-engine.md): `&lab` in the address of a camp scene shows
 * what the camp is doing to you, in the same gauges the experiments read, and lets you
 * switch parts of it off. A development instrument, for someone testing an engine: it
 * shows the truth, so a sitting that's meant to be blind leaves it off.
 *
 * A switch is a parameter of the scene, so changing one reloads the scene with it, and
 * the run's recording names it.
 */

const seconds = (s: number): string => (Number.isNaN(s) ? 'not yet' : `${s.toFixed(0)} s ago`);
const metres = (m: number): string => (Number.isFinite(m) ? `${m.toFixed(0)} m` : '–');

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

export class LabPanel {
  private readonly lines: HTMLElement;

  constructor(parent: HTMLElement, params: string) {
    const root = document.createElement('div');
    root.className = 'lab-panel';
    root.innerHTML = `<div class="lab-title">Lab</div><pre class="lab-lines"></pre><div class="lab-switches"></div><div class="lab-note">Press Esc to reach the switches. Changing one restarts the run.</div>`;
    parent.appendChild(root);
    this.lines = root.querySelector('.lab-lines')!;
    const box = root.querySelector('.lab-switches')!;
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
  }

  update(r: Readings): void {
    this.lines.textContent = [
      `first shot   ${seconds(r.sinceFirstShot)}`,
      `shots fired  ${r.shotsFired}`,
      `guards down  ${r.guardsDown}, standing ${r.guardsStanding}`,
      `in your line ${r.inLine}`,
      `rounds at you ${r.roundsAtYou}`,
      `seen you     ${r.detected ? 'yes' : 'no'}`,
      `nearest      ${metres(r.nearest)}`,
      `their guess  ${Number.isNaN(r.estimateOff) ? 'none' : `${metres(r.estimateOff)} off`}`,
      `camp         ${r.level}${r.siren ? ', siren' : ''}`,
      `target       ${r.targetStatus}`,
    ].join('\n');
  }
}
