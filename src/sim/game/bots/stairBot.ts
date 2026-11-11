import { datan2 } from '../../kernel/core/detmath';
import { Rng } from '../../kernel/core/rng';
import type { InputFrame } from '../../kernel/input';
import { Optic } from '../../kernel/input';
import type { Simulation } from '../sim';

/**
 * Goes up and down one flight of a camp's stairs and makes trouble on it, for the long
 * invariant run (headless/fuzz.ts): up to the floor above and back down, turning round halfway,
 * drifting into the wall and the rail, sprinting, crouching and lying down on the treads,
 * wandering the floor above to the edge of the stairwell and off it. A valley's bots seldom go
 * indoors and never upstairs, and a flight is where a body's promises are newest: a rise a
 * tread, a drop down the well, a ceiling over the foot.
 * Deterministic: everything it does comes from its seed and what it sees.
 */
export class StairBot {
  private readonly rng: Rng;
  private goal: 'up' | 'down' | 'roam' = 'up';
  private left = 0;
  private drift = 0;
  private axis = 1;
  private crouchFor = 0;
  private proneFor = 0;
  private sprinting = false;
  private roamYaw = 0;
  private wasAbove = false;
  /** Times it has got to the floor above, and back down to the ground, for reporting. */
  ups = 0;
  downs = 0;

  /** `flight`: which of the world's flights (grid.stairs) it keeps to. */
  constructor(
    seed: string,
    private readonly flight: number,
  ) {
    this.rng = new Rng(seed, `stair-bot/${flight}`);
  }

  next(sim: Simulation, out: InputFrame): InputFrame {
    const r = this.rng;
    const b = sim.player;
    const G = sim.world.grid;
    const st = G.stairs[this.flight]!;
    const up = G.storeys[st.storey]!;
    const { footX, footZ, headX, headZ } = st;
    out.crouch = false;
    out.prone = false;
    out.sprint = false;
    out.moveX = 0;
    out.moveZ = 0;
    out.pitch = 0;
    out.lean = 0;
    out.optic = Optic.None;
    out.commands = [];
    if (--this.left <= 0) {
      this.goal = r.pick(['up', 'up', 'down', 'down', 'roam'] as const);
      // A short wander, so it's never far from the flight: through a door and round a wall it would never find its way back.
      this.left = this.goal === 'roam' ? r.int(15, 70) : r.int(60, 300);
      this.drift = r.range(-0.7, 0.7);
      this.axis = r.pick([1, 1, 1, 1, -1, 0]);
      this.sprinting = r.chance(0.35);
      this.roamYaw = r.range(-Math.PI, Math.PI);
      if (r.chance(0.2)) this.crouchFor = r.int(10, 120);
      if (r.chance(0.08)) this.proneFor = r.int(20, 120);
    }
    const above = b.y > up.y - 0.3;
    if (above && !this.wasAbove) this.ups++;
    if (!above && this.wasAbove && b.y < sim.world.terrain.heightAt(b.x, b.z) + 0.15) this.downs++;
    if (above || b.y < sim.world.terrain.heightAt(b.x, b.z) + 0.15) this.wasAbove = above;
    const endX = above ? headX : footX;
    const endZ = above ? headZ : footZ;
    const strayed = (b.x - endX) * (b.x - endX) + (b.z - endZ) * (b.z - endZ) > 5 * 5;
    if (this.goal === 'roam' && !strayed) {
      // Anywhere on whichever floor it's on: into walls, along the rail, over the edge of the well.
      out.yaw = this.roamYaw;
      out.moveZ = this.axis;
      out.moveX = this.drift;
    } else {
      // The far end of the flight if it's on its own floor's end of it, else its own end first.
      const wantsUp = this.goal === 'roam' ? !above : this.goal === 'up';
      const nearX = wantsUp ? footX : headX;
      const nearZ = wantsUp ? footZ : headZ;
      const farX = wantsUp ? headX : footX;
      const farZ = wantsUp ? headZ : footZ;
      // On the flight: between its two ends and within a body's width of its line, at any height.
      const lx = headX - footX;
      const lz = headZ - footZ;
      const along = ((b.x - footX) * lx + (b.z - footZ) * lz) / (lx * lx + lz * lz);
      const off = Math.abs((b.x - footX) * lz - (b.z - footZ) * lx) / Math.sqrt(lx * lx + lz * lz);
      const onFlight = along > 0.02 && along < 0.98 && off < 0.9;
      const atNear = (b.x - nearX) * (b.x - nearX) + (b.z - nearZ) * (b.z - nearZ) < 0.8 * 0.8;
      const there = !onFlight && (wantsUp ? above : !above);
      const toFar = onFlight || atNear || there;
      const tx = toFar ? farX : nearX;
      const tz = toFar ? farZ : nearZ;
      out.yaw = datan2(-(tx - b.x), -(tz - b.z)) + this.drift * 0.25;
      // On its way: now and then a step back or a stop, mid-flight as anywhere.
      out.moveZ = there && (b.x - farX) * (b.x - farX) + (b.z - farZ) * (b.z - farZ) < 0.5 * 0.5 ? 0 : r.chance(0.05) ? -1 : r.chance(0.04) ? 0 : 1;
      out.moveX = r.chance(0.1) ? this.drift : 0;
    }
    if (this.crouchFor-- > 0) out.crouch = true;
    if (this.proneFor-- > 0) out.prone = true;
    out.sprint = this.sprinting && !out.crouch && !out.prone;
    if (r.chance(0.05)) out.lean = r.pick([-1, 1]);
    return out;
  }
}
