import type { Experiment } from '../experiment';
import { approach } from './approach';
import { friction, gallery, switchOff } from './overlook';
import { circling, taller } from './circling';
import { corners } from './corners';
import { deadGround } from './deadGround';
import { flaws } from './flaws';
import { answerExperiment } from './answer';
import { firefight } from './firefight';
import { outTheGateExperiment } from './outTheGate';
import { huntExperiment } from './hunt';
import { ladderOfPlans } from './ladder';
import { quietKill } from './quietKill';
import { secondStep } from './secondStep';
import { relocate, relocateQuiet } from './relocate';
import { routeCost } from './routeCost';
import { routes } from './routes';
import { takedownStages } from './takedown';
import { VARIETY } from './variety';
import { wayOut } from './wayOut';

/** Every experiment on the bench, by the name `npm run experiment` takes. */
export const EXPERIMENTS: Readonly<Record<string, Experiment>> = Object.fromEntries([friction, gallery, switchOff, deadGround, wayOut, flaws, relocate, relocateQuiet, ladderOfPlans, routes, routeCost, approach, firefight, outTheGateExperiment, huntExperiment, answerExperiment, quietKill, secondStep, takedownStages, circling, taller, corners, ...VARIETY].map((e) => [e.name, e]));
