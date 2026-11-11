import type { Experiment } from '../experiment';
import { approach } from './approach';
import { friction, gallery, switchOff } from './overlook';
import { circling } from './circling';
import { deadGround } from './deadGround';
import { flaws } from './flaws';
import { firefight } from './firefight';
import { ladderOfPlans } from './ladder';
import { quietKill } from './quietKill';
import { relocate, relocateQuiet } from './relocate';
import { routeCost } from './routeCost';
import { routes } from './routes';
import { takedownStages } from './takedown';
import { VARIETY } from './variety';
import { wayOut } from './wayOut';

/** Every experiment on the bench, by the name `npm run experiment` takes. */
export const EXPERIMENTS: Readonly<Record<string, Experiment>> = Object.fromEntries([friction, gallery, switchOff, deadGround, wayOut, flaws, relocate, relocateQuiet, ladderOfPlans, routes, routeCost, approach, firefight, quietKill, takedownStages, circling, ...VARIETY].map((e) => [e.name, e]));
