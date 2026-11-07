/**
 * The wireframe world's colours: a pale survey model under a hazy sky. Light grey
 * faces, fine dark lines, dark figures. Debug colours are saturated so they never
 * read as part of the world.
 */
export const palette = {
  skyZenith: '#aebdcb',
  skyHorizon: '#e4e7ea',
  fog: '#e1e5e8',
  sun: '#fff7ea',
  skyAmbient: '#d9e1ea',
  groundAmbient: '#b8b4aa',

  surface: {
    grass: '#cfd3c6',
    dirt: '#dccdb4',
    gravel: '#e2dfd8',
    rock: '#c6c4bf',
    water: '#9fb6c8',
    metal: '#c9ccd0',
    wood: '#d3c9b8',
  },

  line: '#39414a',
  edge: '#2a3037',
  structure: '#f3f3f1',
  container: '#dadee2',
  vehicle: '#c5c9cd',
  sandbags: '#e2dccf',
  fence: '#4a525b',
  canopy: '#a3ab9f',
  trunk: '#8c867c',
  rock: '#bebdb9',
  bush: '#b5bea9',
  guard: '#262a2f',
  guardVisor: '#e9e4d8',

  debug: {
    cone: '#ff8c1a',
    coneCore: '#ff6200',
    facing: '#c2410c',
    route: '#d9480f',
    stepPlayer: '#0b8fa8',
    stepGuard: '#e8590c',
    aim: '#e03131',
    shot: '#f03e3e',
    gridBlocked: '#f76707',
    gridSound: '#7048e8',
    gridRoof: '#1c7ed6',
    bounds: '#c92a2a',
    collider: '#7048e8',
    ridges: ['#3b5bdb', '#0ca678', '#ae3ec9', '#f08c00', '#1098ad', '#d6336c', '#5c940d', '#495057'],
    roles: { sentry: '#5f3dc4', patrol: '#c2255c', worker: '#2b8a3e' },
    /** What systems draw (sim/debugDraw.ts), by tone. */
    tones: { info: '#1c7ed6', good: '#2b8a3e', warn: '#f08c00', bad: '#e03131', muted: '#868e96' },
  },
} as const;
