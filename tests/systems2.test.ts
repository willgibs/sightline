import { describe } from 'vitest';
import { writeChecks } from './writeChecks';

/** Part 2 of the checks that watch whole runs system by system (writeChecks.ts); systems.test.ts has part 1. */
describe('declared data access', () => writeChecks(2, 4));
