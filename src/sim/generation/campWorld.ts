import type { Tuning } from '../../config/tuning';
import { assertTuning } from '../../config/validate';
import type { MissionSpec } from '../kernel/mission';
import { Rng } from '../kernel/core/rng';
import { ColliderSet } from '../kernel/world/colliders';
import { buildGrid, type SpatialGrid } from '../kernel/world/grid';
import type { World } from '../kernel/world/world';
import type { TerrainReport } from './analysis';
import type { Camp } from './camp';
import { compoundTypeOf } from './plots';
import { cruxOf } from './crux';
import { campSpecProblems, type CampSpec } from './campSpec';
import { perchViews } from './perches';
import { buildRaster } from './raster';
import { validateAndRepair, type Repaired } from './repair';
import { blockVehicles, buildCompound, paintRoad, placeFixtures } from './compound';
import { generateLandform } from './landform';
import { checkValley, type Overwatch } from './overwatch';
import { scatterProps, treeCrowns, type Props } from './props';
import { campWalkStart, siteBounds } from './site';
import { chooseSpawn } from './spawn';
import { staffCamp } from './staffing';
import type { TerrainResult } from './terrain';

/**
 * A world with a generated camp (lab D): the valley with teeth (landform.ts), checked by
 * D3's viewsheds and re-rolled within its budget, then the camp the mission's camp spec
 * asks for, the props around it, the spawn and the spatial grid.
 *
 * Every stage draws from its own root stream (`valley`, `camp`, `routines`, `props`), so a
 * re-rolled valley leaves the camp's own draws as they were, and the props scatter by cell
 * whatever the valley did (scatter.ts). The camp is laid out from its archetype
 * (compound.ts), then staffed (staffing.ts).
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
  // A camp that repair can't save is rejected and built again from fresh forks (design doc:
  // "repaired or rejected"), a bounded number of times (rule 18); the last one stands.
  let built!: BuiltCamp;
  const tries = Math.max(1, G.validation.campAttempts);
  let firstFailed: Repaired['firstFailed'] = [];
  for (let k = 0; k < tries; k++) {
    built = buildCamp(seed, k, terrain, G, spec.camp!);
    if (k === 0) firstFailed = built.repaired.firstFailed;
    if (built.repaired.validation.ok) break;
  }
  const { camp, colliders, props, grid, repaired } = built;
  paintRoad(camp, terrain.heightfield);
  const report = reportOf(valley);
  report.camp = repaired.analysis;
  report.validation = repaired.validation;
  report.repairs = repaired.repairs;
  report.repairAttempts = repaired.attempts;
  report.firstFailed = firstFailed;
  report.campAttempt = built.attempt;
  if (!repaired.validation.ok) {
    report.ok = false;
    report.problems.push(...repaired.validation.rules.filter((r) => !r.ok).map((r) => `${r.rule}: ${r.detail}`));
  }
  const playHalf = terrain.heightfield.size / 2 - G.world.playMargin;
  const spawn = chooseSpawn(spec.insertion, terrain.heightfield, terrain.features, colliders, report, playHalf, camp.site, grid.map, campWalkStart(camp));
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
    crowns: treeCrowns(props.trees, G),
    crownStop: G.props.crownStop,
    camp,
    report,
    spawn,
    playHalf,
    genMs: clock ? clock() - started : 0,
  };
}

interface BuiltCamp {
  attempt: number;
  camp: Camp;
  colliders: ColliderSet;
  props: Props;
  grid: SpatialGrid;
  repaired: Repaired;
}

/** One attempt at the camp on its terrain: compound, staffing, analysis, validation and repair, from forks labelled by the attempt. */
function buildCamp(seed: string, attempt: number, terrain: TerrainResult, G: Tuning['gen'], spec: CampSpec): BuiltCamp {
  const fork = (label: string): Rng => new Rng(seed, attempt === 0 ? label : `${label}#${attempt}`);
  const colliders = new ColliderSet(G.world.size);
  const crux = cruxOf(seed, G);
  // The kind of place it is, for its crux and its ground (plots.ts): a camp rebuilt keeps it.
  const type = compoundTypeOf(seed, crux, terrain.features.kind ?? 'hollow', G);
  const camp = buildCompound(fork('camp'), terrain.heightfield, terrain.features, colliders, G, spec, crux, type);
  const props = scatterProps(fork('props'), terrain.heightfield, terrain.features, colliders, G);
  colliders.build();
  // The fine grid covers the ground the analysis looks at: the camp and its margin.
  const grid = buildGrid(terrain.heightfield, colliders, siteBounds(camp, colliders, Math.max(G.grid.siteMargin, G.analysis.margin + 2)), G);
  // Staffing searches the grid (its chokepoints, its patrols' paths) and sees through the
  // analysis raster (who would see whom drop), so it shapes the camp's clusters as it goes.
  let raster = buildRaster(camp, terrain.heightfield, colliders, grid.site, G, props.trees);
  let views = perchViews(raster, terrain.heightfield, camp.site, G, grid.map, campWalkStart(camp));
  placeFixtures(camp, colliders, terrain.heightfield, raster, views, G, fork('fixtures'));
  colliders.build();
  blockVehicles(camp, grid, G);
  raster = buildRaster(camp, terrain.heightfield, colliders, grid.site, G, props.trees);
  views = perchViews(raster, terrain.heightfield, camp.site, G, grid.map, campWalkStart(camp));
  staffCamp(camp, terrain.heightfield, grid, raster, views, G, spec, fork('staff'), fork('routines'));
  const repaired = validateAndRepair(camp, terrain.heightfield, colliders, grid, raster, G, fork('repair'));
  return { attempt, camp, colliders, props, grid, repaired };
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
