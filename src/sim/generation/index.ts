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
export { buildTestCamp, GUARD_ROLES, type Camp, type GuardRole, type GuardSpawn, type Structure, type StructureKind } from './camp';
export { buildRoutine, routinePose, type Leg, type Routine, type RoutinePose } from './routine';
export type { Bush, Props, Rock, Tree } from './props';
export type { Backdrop, TerrainFeatures } from './terrain';
export { analyzeTerrain, type Perch, type TerrainReport } from './analysis';
export { closestOnPolyline, makePolyline, pointAt, type PathHit, type Point2, type Polyline } from './paths';
export { ambientSources, CREEK_SPACING, type AmbientKind, type AmbientSource } from './ambient';
export { surveyWorld, type Survey, type SurveyGuard, type SurveyPerch, type SurveyStructure, type SurveyTerrain } from './survey';
