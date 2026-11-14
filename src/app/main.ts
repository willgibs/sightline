import { defaultTuning, type Tuning } from '../config/tuning';
import { knownAnswerProblems } from '../sim/kernel/core/known';
import { normalizeSeed, randomSeed } from '../sim/kernel/core/seed';
import type { SpawnKind } from '../sim/kernel/mission';
import { Game } from './game';
import { MOVEMENT_SITTING } from '../sim/game/movementTrials';
import { Explorer } from './explore';
import { defaultCampSpec, type CampSpec } from '../sim/generation';
import { SCENES } from '../sim/game/scenes';
import './styles.css';

/**
 * Entry point. URL parameters:
 *   ?seed=TAL-4471   which valley to generate
 *   ?scene=movement-course   play a scene instead (sim/game/scenes/index.ts)
 *   &params=...              with these parameters (a scenario: game/scenes/sightScenario.ts)
 *   ?trials=<seed>&lab=movement  a sitting of the movement lab's exit test instead (C8): noise and visibility
 *   ?trials=<seed>           a sitting of trial mode, the perception lab's exit test (A12); any seed, or none for a fresh one (&fresh forgets a sitting kept in this browser)
 *   &lab             in a camp scene: the lab panel, with the gauges and the engine switches (labPanel.ts)
 *   ?view=debug      start in the debug view
 *   ?spawn=edge      start where the road leaves the map instead of on an overlook
 *   ?bench           run the 20-second performance flythrough and report
 *   ?dpr=2           render resolution multiplier, 0.5 to 3 (default: device ratio, capped at 1.5)
 *   ?replay=playtests/<name>.slrec   watch a recording (in development, any session in playtests/)
 *   ?hz=60           run the simulation at another tick rate (every rate is per second); ?hz=blind
 *                    flips a coin between 30 and 60, for a blind comparison (the debug panel says which)
 *   ?ledge=stop      the motor before Nov 14: a low box with no room over it to stand on (a shelf, a
 *                    ceiling) stops a body that walks into it dead, instead of being a wall it slides along
 *   ?explore         the seed explorer instead of the game: a grid of camps and their validation
 *                    (&series=<name> &count=<n>; explore.ts)
 *   ?difficulty=0.5  how hard the generated camp is, 0 to 1
 */
const params = new URLSearchParams(window.location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const dprParam = Number(params.get('dpr'));
const sceneName = params.get('scene');

/** Shows why the game can't start, in the overlay, and stops. */
function refuse(title: string, report: string, error?: unknown): never {
  overlay.innerHTML = `<div class="overlay-panel"><div class="wordmark">SIGHTLINE</div><div class="overlay-title"></div><pre class="report" style="display:block"></pre></div>`;
  overlay.dataset.mode = 'error';
  overlay.querySelector('.overlay-title')!.textContent = title;
  overlay.querySelector('.report')!.textContent = report;
  throw error ?? new Error(title);
}

// The simulation's math must give the bits every other engine gives, or nothing played
// here replays anywhere else (kernel/core/known.ts).
const mathProblems = knownAnswerProblems();
if (mathProblems.length > 0) {
  refuse(
    "This browser's math differs",
    `Sightline's simulation must compute the same bits in every browser, so runs replay anywhere. This browser's JavaScript engine gives different answers:\n\n${mathProblems.join('\n')}\n\nTry a current Chrome, Firefox, Safari or Edge.`,
  );
}

/**
 * ?hz=<n> runs the simulation at another tick rate, since every rate in tuning is per second
 * (rule 17); ?hz=blind flips a coin between 30 and 60 for a blind comparison of feel (C9).
 * Recordings carry their tuning, so such a run replays as what it was.
 */
function tickRateChoice(tuning: Tuning, hz: string | null): Tuning {
  const n = hz === 'blind' ? (Math.random() < 0.5 ? 30 : 60) : Number(hz);
  if (!hz || !Number.isFinite(n) || n < 15 || n > 240 || !Number.isInteger(n) || n % tuning.sim.recordHz !== 0) return tuning;
  const out = structuredClone(tuning);
  out.sim.tickHz = n;
  return out;
}

/**
 * ?ledge=stop plays the motor as it was before Nov 14, for every kind of body: a ledge with
 * no room over it to stand in stops a body that walks into it, rather than being a wall it
 * slides along (sim/body/motor.ts). Recordings carry their tuning, so such a run replays as
 * what it was.
 */
function ledgeChoice(tuning: Tuning, ledge: string | null): Tuning {
  if (ledge !== 'stop') return tuning;
  const out = structuredClone(tuning);
  for (const spec of Object.values(out.bodies)) spec.ledgeWall = false;
  return out;
}

const movementTrials = params.get('lab') === 'movement';
const trialScene = movementTrials ? 'noise' : 'perception-lab';

if (params.has('explore')) {
  // The seed explorer draws in 2D and generates in workers: no game, no WebGL.
  new Explorer(document.body, defaultTuning, params).start();
} else {
  startGame();
}

function startGame(): void {
  let game: Game;
  try {
    game = new Game({
      canvas,
      hud: document.querySelector<HTMLElement>('#hud')!,
      overlay,
      seed: normalizeSeed(params.get('seed')),
      tuning: ledgeChoice(tickRateChoice(defaultTuning, params.get('hz')), params.get('ledge')),
      debug: params.get('view') === 'debug' || sceneName === 'compound',
      spawn: (params.get('spawn') === 'edge' ? 'edge' : 'overlook') as SpawnKind,
      bench: params.has('bench'),
      pixelRatio: dprParam > 0 ? Math.min(3, Math.max(0.5, dprParam)) : Math.min(window.devicePixelRatio || 1, 1.5),
      pixelRatioFollowsScreen: !(dprParam > 0),
      // Trial mode plays in a lab's own scenes: the perception lab's (A12), or the movement lab's (C8, &lab=movement).
      sceneName: params.has('trials') ? trialScene : sceneName,
      scene: params.has('trials') ? SCENES[trialScene]!() : sceneName ? SCENES[sceneName]?.(params.get('params') ?? undefined) : null,
      trials: params.has('trials') ? (movementTrials ? MOVEMENT_SITTING : '') + normalizeSeed(params.get('trials') || randomSeed()) : null,
      trialsFresh: params.has('fresh'),
      lab: params.has('lab'),
      replayUrl: params.get('replay'),
      camp: campFromParams(params),
    });
  } catch (e) {
    // Without WebGL 2 there is nothing to draw with: say so, rather than leave a blank page.
    const webgl2 = !!document.createElement('canvas').getContext('webgl2');
    refuse(
      webgl2 ? 'The game could not start' : 'This browser has no WebGL 2',
      webgl2 ? String(e instanceof Error ? e.message : e) : 'Sightline draws with WebGL 2. Turn on hardware acceleration in the browser settings, or try a current Chrome, Firefox, Safari or Edge.',
      e,
    );
  }
  game.start();
  (window as unknown as { sightline: unknown }).sightline = game.automation();

  // Saving src/config/tuning.ts applies the new numbers to the running game.
  if (import.meta.hot) {
    import.meta.hot.accept('../config/tuning', (mod) => {
      if (mod) game.applyTuning((mod as unknown as typeof import('../config/tuning')).defaultTuning);
    });
  }
}

/** The camp a URL asks for: the compound, at the difficulty given (0 to 1), or the default's. */
function campFromParams(p: URLSearchParams): CampSpec {
  const d = Number(p.get('difficulty') ?? defaultCampSpec().difficulty);
  return { ...defaultCampSpec(), difficulty: Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : defaultCampSpec().difficulty };
}
