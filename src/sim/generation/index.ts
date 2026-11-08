/**
 * The generation lane: terrain, sites, the camp and its modules, routines, analysis and
 * validation (lab D). It builds a mission's static world before the first tick and adds
 * its parts to the kernel's World (world.ts). Generation reads only `tuning.gen`, and
 * every random stream in it is forked by label (CLAUDE.md, rule 3). Everything outside
 * the lane reaches it through this file.
 */
export { generateWorld, simTuningKey, siteBounds, worldFingerprint, worldTuningKey, type Spawn } from './world';
export { buildWorld, handmadeMission, type HandmadeSpec } from './handmade';
export { siteAt, type Site } from './site';
export { ARCHETYPES, campMission, campSpecProblems, defaultCampSpec, type CampArchetype, type CampSpec } from './campSpec';
export type { Ford, Ridge } from './landform';
export type { Overwatch } from './overwatch';
export type { BuildingSpec, CampLayout, DeviceKind, DeviceSpec, DoorSpec, LadderSpec, ModuleName, ObjectiveSpec, Opening, Parcel, Side, Skeleton, SlotName, VehicleSpec } from './compound';
export { buildTestCamp, GUARD_ROLES, type Camp, type GuardRole, type GuardSpawn, type Structure, type StructureKind } from './camp';
export { buildRoutine, routinePose, type Leg, type Routine, type RoutinePose } from './routine';
export type { Bush, Props, Rock, Tree } from './props';
export type { Backdrop, TerrainFeatures } from './terrain';
export { analyzeTerrain, type Perch, type TerrainReport } from './analysis';
export { closestOnPolyline, makePolyline, pointAt, type PathHit, type Point2, type Polyline } from './paths';
export { ambientSources, CREEK_SPACING, type AmbientKind, type AmbientSource } from './ambient';
export { surveyWorld, type Survey, type SurveyAnalysis, type SurveyGuard, type SurveyPerch, type SurveyStructure, type SurveyTerrain } from './survey';
export { analyzeCamp, type CampAnalysis, type PathReport, type PerchReport } from './campAnalysis';
export { infiltrate, spaceTimeSearch } from './infiltrate';
export { buildRaster } from './raster';
export { campPlans, planOn, sameSignature, sharedFields, writtenShots, type Approach, type Plan, type PlanSignature, type WrittenShots } from './plans';
export type { AnalysisParts } from './campAnalysis';
export type { Cluster } from './clusters';
