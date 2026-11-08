/**
 * The lane map: the layers of src/sim and what each may import (docs/foundation-shape.md).
 * tests/architecture.test.ts reads this table, so a change to who may import whom is a
 * change here, made deliberately and reviewed as one.
 *
 * - The kernel imports only itself.
 * - A lane imports the kernel, and the lanes listed for it through their index.ts only.
 * - The game imports the kernel and every lane, the lanes through their index.ts.
 * - Every layer may read src/config: the tuning is data.
 * - Outside src/sim, code reaches a lane only through its index.ts.
 *
 * Inside a layer, files import each other directly.
 */
export interface Layer {
  /** A lane: one directory whose index.ts is its contract. */
  readonly lane: boolean;
  /** The layers it may import, besides itself. */
  readonly imports: readonly LayerName[];
  readonly holds: string;
}

export type LayerName = 'kernel' | 'generation' | 'body' | 'perception' | 'brain' | 'ballistics' | 'game';

export const LAYERS: Readonly<Record<LayerName, Layer>> = {
  kernel: {
    lane: false,
    imports: [],
    holds:
      'deterministic math and random streams; the state tree and its ids, hash, save and restore; the tick: phases, systems and the schedule; ' +
      'the event and command registries; recordings, re-simulation and seeking; the world: terrain queries, colliders, solids, the spatial grid; ' +
      'the environment and the law of sound; the scene harness and the debug channel',
  },
  generation: { lane: true, imports: ['kernel'], holds: 'terrain, sites, the camp and its modules, routines, analysis and validation (lab D)' },
  body: { lane: true, imports: ['kernel'], holds: 'the shared motor and its modes, and the invariants it keeps (lab C)' },
  perception: { lane: true, imports: ['kernel', 'body', 'generation'], holds: 'sight, hearing, percepts and the awareness ladder (lab A)' },
  brain: { lane: true, imports: ['kernel', 'body', 'perception', 'generation'], holds: 'orders, utility, beliefs, the commander and pacing (lab E)' },
  ballistics: { lane: true, imports: ['kernel', 'body'], holds: 'the ballistic function, bullets and hits (lab B)' },
  game: {
    lane: false,
    imports: ['kernel', 'generation', 'body', 'perception', 'brain', 'ballistics'],
    holds: "Sightline itself: its entity kinds, which lanes run in which phases, its setup, its scenes, its bots and its self-test",
  },
};
