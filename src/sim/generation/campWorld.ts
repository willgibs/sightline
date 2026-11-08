import type { Tuning } from '../../config/tuning';
import { assertTuning } from '../../config/validate';
import type { MissionSpec } from '../kernel/mission';
import { Rng } from '../kernel/core/rng';
import { ColliderSet } from '../kernel/world/colliders';
import { buildGrid } from '../kernel/world/grid';
import type { World } from '../kernel/world/world';
import type { TerrainReport } from './analysis';
import { buildTestCamp } from './camp';
import { campSpecProblems } from './campSpec';
import { generateLandform } from './landform';
import { checkValley, type Overwatch } from './overwatch';
import { scatterProps } from './props';
import { siteBounds } from './site';
import { chooseSpawn } from './spawn';
import type { TerrainResult } from './terrain';

/**
 * A world with a generated camp (lab D): the valley with teeth (landform.ts), checked by
 * D3's viewsheds and re-rolled within its budget, then the camp the mission's camp spec
 * asks for, the props around it, the spawn and the spatial grid.
 *
 * Every stage draws from its own root stream (`valley`, `camp`, `routines`, `props`), so a
 * re-rolled valley leaves the camp's own draws as they were, and the props scatter by cell
 * whatever the valley did (scatter.ts). Until D4 the camp is Phase 0's test camp, placed
 * on the new pad.
 */
export function generateCampWorld(spec: MissionSpec, tuning: Tuning, clock?: () => number): World {
  const problems = campSpecProblems(spec.camp);
  if (problems.length > 0) throw new Error(`The mission's camp can't be built: ${problems.join('; ')}`);
  assertTuning(tuning);
  const started = clock ? clock() : 0;
  const G = tuning.gen;
  const seed = spec.seed;
  const budget = Math.max(1, G.landform.attempts);
  let attempt = 0;
  let terrain: TerrainResult;
  let valley: Overwatch;
  for (;;) {
    terrain = generateLandform(new Rng(seed, attempt === 0 ? 'valley' : `valley#${attempt}`), G);
    valley = checkValley(terrain.heightfield, terrain.features, G);
    if (valley.ok || attempt >= budget - 1) break;
    attempt++;
  }
  const colliders = new ColliderSet(G.world.size);
  const camp = buildTestCamp(new Rng(seed, 'camp'), terrain.heightfield, terrain.features, colliders, G, new Rng(seed, 'routines'));
  const props = scatterProps(new Rng(seed, 'props'), terrain.heightfield, terrain.features, colliders, G);
  colliders.build();
  const report = reportOf(valley);
  const playHalf = terrain.heightfield.size / 2 - G.world.playMargin;
  const spawn = chooseSpawn(spec.insertion, terrain.heightfield, terrain.features, colliders, report, playHalf, camp.site);
  const grid = buildGrid(terrain.heightfield, colliders, siteBounds(camp, colliders, G.grid.siteMargin), G);
  return {
    grid,
    spec,
    seed,
    attempt,
    terrain: terrain.heightfield,
    features: terrain.features,
    backdrop: terrain.backdrop,
    colliders,
    props,
    camp,
    report,
    spawn,
    playHalf,
    genMs: clock ? clock() - started : 0,
  };
}

/** D3's checks as the report every world carries, with the older fields filled from them. */
function reportOf(v: Overwatch): TerrainReport {
  let octants = 0;
  for (let i = 0; i < 8; i++) if (v.sectors[2 * i]! + v.sectors[2 * i + 1]! > 0) octants++;
  return {
    perches: v.perches,
    ridges: v.ridgesSeen,
    overwatchSectors: octants,
    accessSectors: v.access16,
    steepShare: v.steepShare,
    ok: v.ok,
    problems: [...v.problems],
    valley: v,
  };
}
