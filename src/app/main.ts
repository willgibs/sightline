import { defaultTuning } from '../config/tuning';
import { normalizeSeed } from '../sim/core/seed';
import type { SpawnKind } from '../sim/gen/world';
import { Game } from './game';
import './styles.css';

/**
 * Entry point. URL parameters:
 *   ?seed=TAL-4471   which valley to generate
 *   ?view=debug      start in the debug view
 *   ?spawn=edge      start where the road leaves the map instead of on an overlook
 *   ?bench           run the 20-second performance flythrough and report
 *   ?dpr=2           render resolution multiplier, 0.5 to 3 (default: device ratio, capped at 1.5)
 */
const params = new URLSearchParams(window.location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const dprParam = Number(params.get('dpr'));

let game: Game;
try {
  game = new Game({
    canvas,
    hud: document.querySelector<HTMLElement>('#hud')!,
    overlay,
    seed: normalizeSeed(params.get('seed')),
    tuning: defaultTuning,
    debug: params.get('view') === 'debug',
    spawn: (params.get('spawn') === 'edge' ? 'edge' : 'overlook') as SpawnKind,
    bench: params.has('bench'),
    pixelRatio: dprParam > 0 ? Math.min(3, Math.max(0.5, dprParam)) : Math.min(window.devicePixelRatio || 1, 1.5),
    pixelRatioFollowsScreen: !(dprParam > 0),
  });
} catch (e) {
  // Without WebGL 2 there is nothing to draw with: say so, rather than leave a blank page.
  const webgl2 = !!document.createElement('canvas').getContext('webgl2');
  overlay.innerHTML = `<div class="overlay-panel"><div class="wordmark">SIGHTLINE</div><div class="overlay-title"></div><pre class="report" style="display:block"></pre></div>`;
  overlay.dataset.mode = 'error';
  overlay.querySelector('.overlay-title')!.textContent = webgl2 ? 'The game could not start' : 'This browser has no WebGL 2';
  overlay.querySelector('.report')!.textContent = webgl2
    ? String(e instanceof Error ? e.message : e)
    : 'Sightline draws with WebGL 2. Turn on hardware acceleration in the browser settings, or try a current Chrome, Firefox, Safari or Edge.';
  throw e;
}
game.start();
(window as unknown as { sightline: unknown }).sightline = game.automation();

// Saving src/config/tuning.ts applies the new numbers to the running game.
if (import.meta.hot) {
  import.meta.hot.accept('../config/tuning', (mod) => {
    if (mod) game.applyTuning((mod as unknown as typeof import('../config/tuning')).defaultTuning);
  });
}
