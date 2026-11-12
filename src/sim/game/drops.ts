import type { TickContext, System } from '../kernel/systems';
import type { StimulusCommand } from '../kernel/commands';
import { Surface } from '../kernel/world/surfaces';
import { Faction } from '../kernel/state';
import { dropGuard, fireFrom } from './shooting';
import { player } from './entities';

/**
 * The compound simulator's hand (Lab F, docs/camp-engine.md): something happens somewhere
 * in the world, with nobody there to do it. A shot from a ridge, a noise by the fence, a
 * body, equipment found dead: the inputs a player would otherwise provide, dropped by a
 * person watching or by a script, so a camp's defence can be tested with no player at all.
 *
 * Everything goes through commands, so a run records and re-simulates. A guard sees none of
 * this as anything but what it is: a sound, a sight, a bullet, a body. Nothing here tells
 * him who did it or where they are.
 */

export const STIMULI = ['noise', 'body', 'shot', 'suppressed-shot', 'kill', 'sabotage'] as const;
export type StimulusName = (typeof STIMULI)[number];

/** The command for a stimulus: at (x, y, z), from (fromX, fromY, fromZ) where it has an origin. */
export function stimulus(what: StimulusName, at: { x: number; y: number; z: number }, from: { x: number; y: number; z: number } = at): StimulusCommand {
  return { kind: 'stimulus', what: STIMULI.indexOf(what), x: at.x, y: at.y, z: at.z, fromX: from.x, fromY: from.y, fromZ: from.z };
}

function apply(ctx: TickContext, c: StimulusCommand): void {
  const p = player(ctx.index);
  const what = STIMULI[c.what];
  const t = ctx.tick / ctx.tuning.sim.tickHz;
  if (what === 'noise') {
    const r = ctx.tuning.perception.sandbox.noise;
    ctx.emit({ type: 'noise', source: p.id, t, x: c.x, y: c.y, z: c.z, surface: Surface.Gravel, loudness: r / ctx.tuning.noise.radiusPerUnit, radius: r });
  } else if (what === 'body') {
    const eye = ctx.tuning.bodies.guard.eyeHeight.prone;
    ctx.spawn((id) => ({ id, kind: 'remains' as const, faction: Faction.Camp, remains: { of: 0, post: -1, x: c.x, y: c.y, z: c.z, yaw: 0, eye, vx: 0, vz: 0, fell: t - ctx.tuning.ballistics.hits.collapseTime, part: 'torso' as const, carriedBy: 0, hidden: false } }));
  } else if (what === 'shot' || what === 'suppressed-shot') {
    fireFrom(ctx, p, { x: c.fromX, y: c.fromY, z: c.fromZ }, { x: c.x, y: c.y, z: c.z }, what === 'suppressed-shot');
  } else if (what === 'kill') {
    let nearest = null;
    let best = Infinity;
    for (const g of ctx.index.of('guard')) {
      const d = (g.body.x - c.x) * (g.body.x - c.x) + (g.body.z - c.z) * (g.body.z - c.z);
      if (d < best) {
        best = d;
        nearest = g;
      }
    }
    if (nearest) dropGuard(ctx, nearest, p.id);
  } else if (what === 'sabotage') {
    // Whatever equipment is nearest: quietly, as hands would.
    const camp = ctx.world.camp;
    const at = (x: number, z: number): number => (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
    let best = Infinity;
    let act: (() => void) | null = null;
    for (const g of ctx.index.of('generator')) {
      const d = camp.devices?.[g.generator.device];
      if (d && g.generator.running && at(d.x, d.z) < best) {
        best = at(d.x, d.z);
        act = () => {
          g.generator.running = false;
        };
      }
    }
    for (const r of ctx.index.of('radio')) {
      const d = camp.devices?.[r.radio.device];
      if (d && r.radio.working && at(d.x, d.z) < best) {
        best = at(d.x, d.z);
        act = () => {
          r.radio.working = false;
        };
      }
    }
    act?.();
  }
}

export const compoundDrops: System = {
  name: 'compound-drops',
  phase: 'commands',
  after: ['player-commands', 'rifle', 'sandbox-drops', 'use'],
  reads: ['input', 'player.body', '*.body', 'guard.guard', 'solid.solid', 'generator.generator', 'radio.radio', 'commander.camp.fights', 'remains.remains'],
  writes: ['entities', 'bullet.bullet', 'rng.wound', 'player.health', 'player.rifle', 'player.vitals', 'generator.generator', 'radio.radio.working', 'alarm.alarm'],
  emits: ['noise', 'shot', 'report', 'impact', 'death', 'cry', 'hurt', 'passed', 'sabotage'],
  run(ctx) {
    for (const c of ctx.input.commands) if (c.kind === 'stimulus') apply(ctx, c);
  },
};
