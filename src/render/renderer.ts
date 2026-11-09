import * as THREE from 'three';
import { disposeTree } from './dispose';
import { SolidMeshes } from './solidMeshes';
import type { DebugShape } from '../sim/kernel/debugDraw';
import { sunDirection } from '../sim/kernel/env';
import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/kernel/events';
import type { World } from '../sim/kernel/world/world';
import type { Snapshot } from '../sim/game/sim';
import { DebugLayer } from './debugLayer';
import { ShotLayer } from './shotLayer';
import { WindCues } from './windCues';
import { GuardMeshes } from './guardMeshes';
import { FoliageInteriors } from './interiors';
import { PlayerMesh } from './playerMesh';
import { createLook, type LookUniforms } from './materials';
import { palette } from './palette';
import { createSky } from './sky';
import { buildBackdrop, buildCamp, buildProps, buildTerrain } from './worldMeshes';
import { setTerrainShade } from './terrainMaterial';
import { FoliageMeshes } from './foliageMeshes';
import { shadeMap } from '../sim/perception';
import { Solids } from '../sim/kernel/world/solids';

/**
 * Draws the simulation. It reads snapshots and never writes to the simulation, so the
 * whole presentation layer (this wireframe now, final art in Phase 3) can be replaced
 * without touching gameplay.
 */

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** The view's tilt about where it looks, radians: positive tilts left (a lean's). */
  roll: number;
  fov: number;
}

export interface RenderStats {
  calls: number;
  triangles: number;
  lines: number;
}

/** Afternoon sun from the south-west, 35° up. */
/** The sun until a world says where it is (the simulation owns it: sim/kernel/env.ts). */
const NO_WORLD_SUN = new THREE.Vector3(-0.579, 0.574, 0.579).normalize();

export class GameRenderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly look: LookUniforms;
  private readonly sky: THREE.Mesh;
  private worldGroup = new THREE.Group();
  private guards: GuardMeshes | null = null;
  private solids: SolidMeshes | null = null;
  private interiors: FoliageInteriors | null = null;
  private foliage: FoliageMeshes | null = null;
  private shade: THREE.DataTexture | null = null;
  private player: PlayerMesh | null = null;
  /** The bodies shots leave, their traces and their dust (lab B). */
  private shots: ShotLayer | null = null;
  /** Flags and grass showing the wind. */
  private wind: WindCues | null = null;
  private tuning: Tuning;
  private readonly projected = new THREE.Vector3();
  private debug: DebugLayer | null = null;
  private debugOn = false;
  private collidersOn = false;
  private perchesOn = false;
  private gridOn = false;

  constructor(canvas: HTMLCanvasElement, tuning: Tuning, pixelRatio: number) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(pixelRatio);
    this.gl.setClearColor(palette.fog);
    this.tuning = tuning;
    this.camera = new THREE.PerspectiveCamera(tuning.view.fov, 1, 0.08, 7000);
    this.camera.rotation.order = 'YXZ';
    this.look = createLook(NO_WORLD_SUN, tuning.view.fogDensity);
    this.scene.fog = new THREE.FogExp2(palette.fog, tuning.view.fogDensity);
    this.scene.background = new THREE.Color(palette.fog);
    this.sky = createSky(NO_WORLD_SUN);
    this.scene.add(this.sky, this.worldGroup);
  }

  /** Lights the scene and the sky from the simulation's sun (sim/kernel/env.ts). */
  setSun(dir: { x: number; y: number; z: number }): void {
    this.look.uSunDir.value.set(dir.x, dir.y, dir.z).normalize();
    ((this.sky.material as THREE.ShaderMaterial).uniforms.uSun!.value as THREE.Vector3).set(dir.x, dir.y, dir.z).normalize();
  }

  setWorld(world: World, tuning: Tuning): void {
    this.clearWorld();
    this.setSun(sunDirection(world.spec.env, 0, { x: 0, y: 0, z: 0 }));
    const terrain = buildTerrain(world, this.look);
    // The ground's shade, as the simulation finds it (A4): where the world draws it.
    const area = world.shadeArea;
    this.shade = setTerrainShade([terrain.userData.material as THREE.ShaderMaterial], area ? shadeMap(world, new Solids(world.colliders), world.spec.env, 0, area, tuning) : null);
    this.worldGroup.add(terrain, buildBackdrop(world, this.look), buildProps(world, this.look), buildCamp(world, this.look));
    this.foliage = new FoliageMeshes(world, this.look);
    this.worldGroup.add(this.foliage.group);
    this.guards = new GuardMeshes((spawn) => world.camp.guards[spawn]?.role ?? 'patrol', this.look, tuning);
    this.worldGroup.add(this.guards.group);
    this.solids = new SolidMeshes(this.look);
    this.worldGroup.add(this.solids.group);
    this.interiors = new FoliageInteriors(world, this.look);
    this.worldGroup.add(this.interiors.group);
    this.player = new PlayerMesh(this.look, tuning.bodies.player);
    this.worldGroup.add(this.player.group);
    this.shots = new ShotLayer(this.look, tuning);
    this.worldGroup.add(this.shots.group);
    this.wind = new WindCues(world);
    this.worldGroup.add(this.wind.group);
    this.tuning = tuning;
    this.debug = new DebugLayer(world, tuning);
    this.debug.group.visible = this.debugOn;
    this.debug.setCollidersVisible(this.collidersOn);
    this.debug.setPerchesVisible(this.perchesOn);
    this.debug.setGridVisible(this.gridOn);
    this.worldGroup.add(this.debug.group);
    this.guards.setDebugTint(this.debugOn);
  }

  private clearWorld(): void {
    this.shade?.dispose();
    this.shade = null;
    this.foliage?.dispose();
    this.foliage = null;
    this.guards?.dispose();
    this.debug?.dispose();
    this.interiors?.dispose();
    this.player?.dispose();
    this.shots?.dispose();
    this.wind?.dispose();
    disposeTree(this.worldGroup);
    this.scene.remove(this.worldGroup);
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.guards = null;
    this.solids = null;
    this.interiors = null;
    this.player = null;
    this.shots = null;
    this.wind = null;
    this.debug = null;
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
    this.shots?.setTuning(tuning);
    this.player?.setSpec(tuning.bodies.player);
    this.look.uFogDensity.value = tuning.view.fogDensity;
    (this.scene.fog as THREE.FogExp2).density = tuning.view.fogDensity;
  }

  setDebug(on: boolean): void {
    this.debugOn = on;
    if (this.debug) this.debug.group.visible = on;
    this.guards?.setDebugTint(on);
  }

  setColliders(on: boolean): void {
    this.collidersOn = on;
    this.debug?.setCollidersVisible(on);
  }

  setGrid(on: boolean): void {
    this.gridOn = on;
    this.debug?.setGridVisible(on);
  }

  setPerches(on: boolean): void {
    this.perchesOn = on;
    this.debug?.setPerchesVisible(on);
  }

  addEvents(events: readonly SimEvent[], time: number): void {
    this.shots?.addEvents(events);
    if (this.debugOn) this.debug?.addEvents(events, time);
  }

  /** Render resolution as a multiple of CSS pixels: follows the screen the window is on. */
  setPixelRatio(ratio: number): void {
    this.gl.setPixelRatio(ratio);
  }

  resize(width: number, height: number): void {
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** What systems drew in their last tick (sim/debugDraw.ts); shown in the debug view. */
  setDrawn(shapes: readonly DebugShape[], tick: number): void {
    this.debug?.setDrawn(shapes, tick);
  }

  /** Where a world point lands on screen, in CSS pixels; null if it is behind the camera or off screen. */
  project(x: number, y: number, z: number, width: number, height: number): { x: number; y: number } | null {
    const v = this.projected.set(x, y, z).project(this.camera);
    if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }

  /** The direction from the camera through a point on the screen, in CSS pixels. */
  rayThrough(x: number, y: number, width: number, height: number): { x: number; y: number; z: number } {
    const v = this.projected.set((x / width) * 2 - 1, 1 - (y / height) * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return { x: v.x, y: v.y, z: v.z };
  }

  render(prev: Snapshot, curr: Snapshot, alpha: number, time: number, pose: CameraPose, aim: THREE.Vector3 | null): void {
    const cam = this.camera;
    cam.position.set(pose.x, pose.y, pose.z);
    cam.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    if (Math.abs(cam.fov - pose.fov) > 1e-4) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
    this.sky.position.copy(cam.position);
    this.guards?.update(prev, curr, alpha, cam.position);
    this.solids?.update(prev, curr, alpha);
    this.interiors?.update(pose.x, pose.y, pose.z);
    this.player?.update(prev, curr, alpha, cam.position);
    this.shots?.update(prev, curr, alpha);
    this.wind?.update((prev.tick + (curr.tick - prev.tick) * alpha) / this.tuning.sim.tickHz, time);
    if (this.debugOn) this.debug?.update(prev, curr, alpha, time, aim, cam.position);
    this.gl.render(this.scene, cam);
  }

  /** Guards hidden with the camera inside them, and foliage shown from inside (for tests). */
  insides(): { guards: number; foliage: number } {
    return { guards: this.guards?.hidden ?? 0, foliage: this.interiors?.showing ?? 0 };
  }

  stats(): RenderStats {
    const r = this.gl.info.render;
    return { calls: r.calls, triangles: r.triangles, lines: r.lines };
  }

  /** The GPU's name, when the browser exposes it. */
  gpuName(): string {
    const ctx = this.gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU';
  }

  dispose(): void {
    this.clearWorld();
    this.gl.dispose();
  }
}
