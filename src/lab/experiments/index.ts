import type { Experiment } from '../experiment';
import { friction, gallery, switchOff } from './overlook';
import { deadGround } from './deadGround';
import { flaws } from './flaws';
import { ladderOfPlans } from './ladder';
import { relocate, relocateQuiet } from './relocate';
import { routes } from './routes';
import { VARIETY } from './variety';
import { wayOut } from './wayOut';

/** Every experiment on the bench, by the name `npm run experiment` takes. */
export const EXPERIMENTS: Readonly<Record<string, Experiment>> = Object.fromEntries([friction, gallery, switchOff, deadGround, wayOut, flaws, relocate, relocateQuiet, ladderOfPlans, routes, ...VARIETY].map((e) => [e.name, e]));
