import { describe } from 'vitest';
import { sceneChecks } from './sceneChecks';

/** Part 2 of the scenes, run headless by their own drivers (sceneChecks.ts); scenes.test.ts has part 1. */
describe('scenes', () => sceneChecks(2, 3));
