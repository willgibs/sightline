import { defaultTuning } from '../config/tuning';
import { SWAY_RUNGS, swayRadius } from '../sim/game/ballisticsBench';
for (const r of SWAY_RUNGS) console.log(r.name.padEnd(30), swayRadius(r, defaultTuning).toFixed(3), 'mil');
