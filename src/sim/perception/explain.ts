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
    case 'mantle':
      return `a mantle, heard to ${m(e.radius)} m`;
    case 'drag':
      return `something dragged on ${surfaceName(e.surface)}, heard to ${m(e.radius)} m`;
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
    case 'spotted':
      if (e.what === 'outage') return `saw equipment stopped, ${m(e.distance)} m away`;
      if (e.what === 'door') return `saw a door not as it was left, ${m(e.distance)} m away`;
      if (e.what === 'muzzle') return `saw a muzzle flash, ${m(e.distance)} m away`;
      return e.what === 'body' ? `saw a body, ${m(e.distance)} m away` : `saw a flash from a lens, ${m(e.distance)} m away`;
    case 'alert':
      return `${e.from} → ${e.to}: ${e.reason}`;
    case 'stance':
      return `changed stance, ${e.from} to ${e.to}`;
    case 'shot':
      return 'fired';
    case 'report':
      return `a shot's report${e.suppressed === 1 ? ', suppressed' : ''}, heard to ${m(e.radius)} m`;
    case 'impact':
      return `a bullet struck ${e.what === 'body' ? `a body, in the ${e.part}` : e.what === 'terrain' ? 'the ground' : 'cover'}, heard to ${m(e.radius)} m`;
    case 'death':
      return `fell, hit in the ${e.part}`;
    case 'cry':
      return `cried out, heard to ${m(e.radius)} m`;
    case 'ranged':
      return e.range < 0 ? 'ranged, and found nothing' : `ranged ${e.range} m`;
    case 'bolt':
      return `worked the bolt, heard to ${m(e.radius)} m`;
    case 'clatter':
      return `something thrown landed, heard to ${m(e.radius)} m`;
    case 'outcome':
      return `the run ${e.status}`;
    case 'act':
      return e.to === 'routine' || e.to === 'return' ? `${e.from} → ${e.to}: ${e.why}` : `${e.from} → ${e.to}, toward (${m(e.x)}, ${m(e.z)}): ${e.why}`;
    case 'call':
      return `spoke${e.radio ? ' on the radio' : ''}, heard to ${m(e.radius)} m`;
    case 'radio':
      return `the radio: ${e.kind} near (${m(e.x)}, ${m(e.z)}) ± ${m(e.radius)} m`;
    case 'order':
      return `ordered to ${e.task} at (${m(e.x)}, ${m(e.z)})`;
    case 'level':
      return `the camp: ${e.from} → ${e.to}`;
    case 'checkin':
      return `check-in, post ${e.post}: ${e.stage}`;
    case 'hurt':
      return `the player was hit in the ${e.part} (${e.hits})`;
    case 'alarm':
      return `alarm box ${e.box}: ${e.stage}`;
    case 'sabotage':
      return `the ${e.what} was sabotaged`;
    case 'whistle':
      return `the camp's whistle, heard to ${m(e.radius)} m`;
    case 'passed':
      return `a round passed ${m(e.distance)} m from your head`;
    case 'objective':
      return 'the target is down: now get out';
    case 'door':
      return `a door was ${e.open ? 'opened' : 'shut'}`;
    case 'siren':
      return `the siren, heard to ${m(e.radius)} m`;
    case 'engine':
      return e.load === 'start' ? `an engine starting, heard to ${m(e.radius)} m` : `an engine ${e.load === 'drive' ? 'on the move' : 'running'}, heard to ${m(e.radius)} m`;
    case 'reinforce':
      return `${e.count} reinforcements arrived at (${m(e.x)}, ${m(e.z)})`;
  }
}

/** A chain of causes (oldest first, as EventLog.explain gives it), in words: when, who (`name` says), and what. */
export function explainChain(chain: readonly SimEvent[], name: (id: number) => string): string[] {
  return chain.map((e) => `${e.t.toFixed(2)} s · ${name(e.source)} · ${describe(e)}`);
}
