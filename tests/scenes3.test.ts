import { describe } from 'vitest';
import { sceneChecks } from './sceneChecks';

/** Part 3 of the scenes, run headless by their own drivers (sceneChecks.ts); scenes.test.ts has part 1. */
describe('scenes', () => sceneChecks(3, 3));
