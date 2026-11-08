import type { SimEvent } from '../kernel/events';
import { surfaceName } from '../kernel/world/surfaces';
import { BARKS } from './barks';

/**
 * Explaining what a guard did, back to what he sensed (design doc · Fairness rules: every
 * detection can be explained afterward in the debug view). Events carry their causes
 * (kernel/eventlog.ts walks them); this says each in words, with the numbers that decided
 * it, so a chain reads as a reason:
 *
 *   a footstep: walk on gravel, heard to 13.8 m
 *   heard a sound, 2.1× over his threshold, from about (−112, −9) ± 4.2 m
 *   unaware → curious: heard
 */

const m = (v: number): string => (v < 10 ? v.toFixed(1) : v.toFixed(0));
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** One event in words. */
export function describe(e: SimEvent): string {
  switch (e.type) {
    case 'footstep':
      return `a footstep: ${e.gait} on ${surfaceName(e.surface)}, heard to ${m(e.radius)} m`;
    case 'land':
      return `a landing at ${m(e.speed)} m/s on ${surfaceName(e.surface)}, heard to ${m(e.radius)} m`;
    case 'noise':
      return `a noise, heard to ${m(e.radius)} m`;
    case 'bark':
      return `said "${BARKS[e.line]?.text ?? '?'}"${BARKS[e.line]?.shout ? ', shouting' : ''}, heard to ${m(e.radius)} m`;
    case 'noticed':
      return `the first cue: his meter reached 30%, someone ${m(e.distance)} m away in his ${e.zone === 'none' ? 'view' : e.zone === 'contact' ? 'reach' : `${e.zone} zone`}`;
    case 'detected': {
      const sky = e.skyline > 1.001 ? `, against the sky ×${e.skyline.toFixed(2)}` : '';
      const zone = e.zone === 'contact' ? 'close enough to touch' : `${e.zone} zone, ${m(e.angle)}° off his gaze, reaching ${m(e.range)} m for this body (stance ×${e.stance.toFixed(2)}, light ×${e.light.toFixed(2)}${sky})`;
      return `saw someone at ${m(e.distance)} m: ${zone}; ${pct(e.cover)} in view, movement ×${e.movement.toFixed(2)}; the meter filling in ${m(1 / Math.max(e.rate, 1e-9))} s`;
    }
    case 'heard':
      return `heard ${e.kind === 'voice' ? 'a voice' : e.kind === 'shot' ? 'a shot' : 'a sound'}, ${e.clarity.toFixed(1)}× over his threshold, from about (${m(e.x)}, ${m(e.z)}) ± ${m(e.radius)} m`;
    case 'alert':
      return `${e.from} → ${e.to}: ${e.reason}`;
    case 'stance':
      return `changed stance, ${e.from} to ${e.to}`;
    case 'shot':
      return 'fired';
    case 'outcome':
      return `the run ${e.status}`;
  }
}

/** A chain of causes (oldest first, as EventLog.explain gives it), in words: when, who (`name` says), and what. */
export function explainChain(chain: readonly SimEvent[], name: (id: number) => string): string[] {
  return chain.map((e) => `${e.t.toFixed(2)} s · ${name(e.source)} · ${describe(e)}`);
}
