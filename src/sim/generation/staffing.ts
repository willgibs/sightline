import type { GenTuning } from '../../config/tuning';
import type { Rng } from '../kernel/core/rng';
import type { Heightfield } from '../kernel/world/heightfield';
import type { Camp, GuardRole, GuardSpawn } from './camp';
import type { Point2 } from './paths';
import { buildRoutine, type Routine } from './routine';

/**
 * Staffing a generated camp. D4's placeholder: a fixed set of posts from the layout, so a
 * compound can be played and seen before D6 buys its guards with points and times its
 * patrols. Every guard's routine still draws from his own fork.
 */
export function staffPlaceholder(camp: Camp, hf: Heightfield, gen: GenTuning, rng: Rng, routines: Rng): void {
  const L = camp.layout!;
  const site = camp.site;
  const at = (a: number, b: number): Point2 => ({ x: site.x + L.ux * a + L.vx * b, z: site.z + L.uz * a + L.vz * b });
  const pending: Array<Omit<GuardSpawn, 'routine'>> = [];
  const guard = (role: GuardRole, p: Point2, face: Point2, opts: { elevated?: number; route?: Point2[]; routeStart?: number; scanScale?: number } = {}) => {
    const l = Math.sqrt(face.x * face.x + face.z * face.z) || 1;
    pending.push({
      id: pending.length,
      role,
      x: p.x,
      y: opts.elevated ?? hf.heightAt(p.x, p.z),
      z: p.z,
      faceX: face.x / l,
      faceZ: face.z / l,
      elevated: opts.elevated !== undefined,
      route: opts.route ?? null,
      routeStart: opts.routeStart ?? 0,
      scanPhase: rng.range(0, 1),
      scanScale: opts.scanScale ?? 1,
    });
  };
  for (const t of L.towers) guard('marksman', { x: t.x, z: t.z }, { x: t.x - site.x, z: t.z - site.z }, { elevated: t.deck });
  const gate = L.openings.find((o) => o.kind === 'gate')!;
  guard('sentry', at(gate.a - 4, gate.b + 2), { x: L.ux, z: L.uz });
  const lane = gen.compound.lane / 2;
  const loop = [at(L.halfA - lane, L.halfB - lane), at(-L.halfA + lane, L.halfB - lane), at(-L.halfA + lane, -L.halfB + lane), at(L.halfA - lane, -L.halfB + lane)];
  guard('patrol', loop[0]!, { x: -L.ux, z: -L.uz }, { route: loop, routeStart: 1 });
  const y = gen.compound.yard - 2;
  const yard = [at(y, y), at(-y, y), at(-y, -y), at(y, -y)];
  guard('patrol', yard[2]!, { x: L.ux, z: L.uz }, { route: yard, routeStart: 3 });
  const hq = L.buildings.find((b) => b.module === 'hq')!;
  const front = camp.doors![hq.doors[0]!]!;
  guard('target', { x: hq.x, z: hq.z }, { x: -front.nx, z: -front.nz }, { scanScale: 0.4 });
  guard('officer', { x: front.x - front.nx * 3, z: front.z - front.nz * 3 }, { x: -front.nx, z: -front.nz });
  guard('worker', { x: L.skeleton.sabotage.x + L.ux * 2.2, z: L.skeleton.sabotage.z + L.uz * 2.2 }, { x: -L.ux, z: -L.uz }, { scanScale: 0.35 });
  const radio = L.buildings.find((b) => b.module === 'radio');
  if (radio) guard('radio-operator', { x: radio.x, z: radio.z }, { x: -radio.ux, z: -radio.uz }, { scanScale: 0.5 });
  for (const p of pending) {
    const spawn = { ...p, routine: null as unknown as Routine };
    spawn.routine = buildRoutine(spawn, gen.routines, routines.fork(`guard${p.id}`));
    camp.guards.push(spawn);
  }
}
