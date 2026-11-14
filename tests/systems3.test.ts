import { describe } from 'vitest';
import { writeChecks } from './writeChecks';

/** Part 3 of the checks that watch whole runs system by system (writeChecks.ts); systems.test.ts has part 1. */
describe('declared data access', () => writeChecks(3, 4));
