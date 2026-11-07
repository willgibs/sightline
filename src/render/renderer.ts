import * as THREE from 'three';
import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/gen/world';
import type { Snapshot } from '../sim/sim';
import { DebugLayer } from './debugLayer';
import { GuardMeshes } from './guardMeshes';
import { createLook, type LookUniforms } from './materials';
import { palette } from './palette';
import { createSky } from './sky';
import { buildBackdrop, buildCamp, buildProps, buildTerrain } from './worldMeshes';

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
  fov: number;
}

export interface RenderStats {
  calls: number;
  triangles: number;
  lines: number;
}

/** Afternoon sun from the south-west, 35° up. */
const SUN = new THREE.Vector3(-0.579, 0.574, 0.579).normalize();

export class GameRenderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly look: LookUniforms;
  private readonly sky: THREE.Mesh;
  private worldGroup = new THREE.Group();
  private guards: GuardMeshes | null = null;
  private debug: DebugLayer | null = null;
  private debugOn = false;
  private collidersOn = false;
  private perchesOn = false;

  constructor(canvas: HTMLCanvasElement, tuning: Tuning, pixelRatio: number) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(pixelRatio);
    this.gl.setClearColor(palette.fog);
    this.camera = new THREE.PerspectiveCamera(tuning.view.fov, 1, 0.08, 7000);
    this.camera.rotation.order = 'YXZ';
    this.look = createLook(SUN, tuning.view.fogDensity);
    this.scene.fog = new THREE.FogExp2(palette.fog, tuning.view.fogDensity);
    this.scene.background = new THREE.Color(palette.fog);
    this.sky = createSky(SUN);
    this.scene.add(this.sky, this.worldGroup);
  }

  setWorld(world: World, tuning: Tuning): void {
    this.clearWorld();
    this.worldGroup.add(buildTerrain(world, this.look), buildBackdrop(world, this.look), buildProps(world, this.look), buildCamp(world, this.look));
    this.guards = new GuardMeshes((spawn) => world.camp.guards[spawn]?.role ?? 'patrol', this.look);
    this.worldGroup.add(this.guards.group);
    this.debug = new DebugLayer(world, tuning);
    this.debug.group.visible = this.debugOn;
    this.debug.setCollidersVisible(this.collidersOn);
    this.debug.setPerchesVisible(this.perchesOn);
    this.worldGroup.add(this.debug.group);
    this.guards.setDebugTint(this.debugOn);
  }

  private clearWorld(): void {
    this.guards?.dispose();
    this.debug?.dispose();
    this.worldGroup.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.scene.remove(this.worldGroup);
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.guards = null;
    this.debug = null;
  }

  setTuning(tuning: Tuning): void {
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

  setPerches(on: boolean): void {
    this.perchesOn = on;
    this.debug?.setPerchesVisible(on);
  }

  addEvents(events: readonly SimEvent[], time: number): void {
    if (this.debugOn) this.debug?.addEvents(events, time);
  }

  resize(width: number, height: number): void {
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  render(prev: Snapshot, curr: Snapshot, alpha: number, time: number, pose: CameraPose, aim: THREE.Vector3 | null): void {
    const cam = this.camera;
    cam.position.set(pose.x, pose.y, pose.z);
    cam.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
    if (Math.abs(cam.fov - pose.fov) > 1e-4) {
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
    }
    this.sky.position.copy(cam.position);
    this.guards?.update(prev, curr, alpha, time);
    if (this.debugOn) this.debug?.update(prev, curr, alpha, time, aim, cam.position);
    this.gl.render(this.scene, cam);
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
