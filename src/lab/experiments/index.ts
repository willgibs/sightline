import type { Experiment } from '../experiment';
import { friction, gallery, switchOff } from './overlook';
import { deadGround } from './deadGround';
import { VARIETY } from './variety';
import { wayOut } from './wayOut';

/** Every experiment on the bench, by the name `npm run experiment` takes. */
export const EXPERIMENTS: Readonly<Record<string, Experiment>> = Object.fromEntries([friction, gallery, switchOff, deadGround, wayOut, ...VARIETY].map((e) => [e.name, e]));
