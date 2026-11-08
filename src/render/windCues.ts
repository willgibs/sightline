import * as THREE from 'three';
import { windAt } from '../sim/kernel/env';
import { Surface } from '../sim/kernel/world/surfaces';
import { makeTerrainSample } from '../sim/kernel/world/heightfield';
import type { World } from '../sim/kernel/world/world';
import { palette } from './palette';

/**
 * Cues to read the wind by (design doc · Wind: "read it from flags, grass and smoke"):
 * a cloth on every flag pole the world has, streaming downwind, and tufts of grass near
 * where the player starts, leaning and swaying with it. They show the mission's steady
 * wind (sim/kernel/env.ts), the one the bullets fly in, and change nothing that can be
 * seen or hit, so their motion is the renderer's own.
 *
 * How to read a flag: its angle from the pole, in degrees, is about nine times the wind
 * in metres a second, until it flies straight out near 10 m/s; it points where the air goes.
 */

const FLAG_LENGTH = 1.3;
const FLAG_HEIGHT = 0.8;
const FLAG_COLS = 10;
const FLAG_ROWS = 4;

interface Flag {
  mesh: THREE.Mesh;
  /** The top of the pole. */
  x: number;
  y: number;
  z: number;
  phase: number;
}

export class WindCues {
  readonly group = new THREE.Group();
  private readonly flags: Flag[] = [];
  private readonly flagMaterial = new THREE.MeshBasicMaterial({ color: '#d9480f', side: THREE.DoubleSide, fog: true });
  private readonly grass: THREE.LineSegments | null;
  private readonly grassUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() } };
  private readonly wind = { x: 0, z: 0 };

  constructor(private readonly world: World) {
    this.group.name = 'wind-cues';
    for (const st of world.camp.structures) {
      if (st.kind !== 'flag') continue;
      for (const id of st.colliders) {
        const c = world.colliders.list[id]!;
        const geo = new THREE.PlaneGeometry(1, 1, FLAG_COLS, FLAG_ROWS);
        const mesh = new THREE.Mesh(geo, this.flagMaterial);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.flags.push({ mesh, x: c.x, y: c.y1, z: c.z, phase: (id * 0.37) % 1 });
      }
    }
    this.grass = this.buildGrass();
    if (this.grass) this.group.add(this.grass);
  }

  /** Moves the cloth and the grass for the wind at simulation time `t`, animated by the frame time `time`. */
  update(t: number, time: number): void {
    const w = windAt(this.world.spec.env, t, this.wind);
    const speed = Math.sqrt(w.x * w.x + w.z * w.z);
    const dx = speed > 1e-6 ? w.x / speed : 1;
    const dz = speed > 1e-6 ? w.z / speed : 0;
    // From the pole, down: about nine degrees for every metre a second, flying out by ten.
    const lift = (Math.min(90, 9 * speed) * Math.PI) / 180;
    const ox = Math.sin(lift);
    const oy = -Math.cos(lift);
    const flutter = 0.05 + 0.02 * speed;
    const rate = 1.2 + 0.45 * speed;
    for (const f of this.flags) {
      const pos = f.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j <= FLAG_ROWS; j++) {
        for (let i = 0; i <= FLAG_COLS; i++) {
          const k = j * (FLAG_COLS + 1) + i;
          const u = i / FLAG_COLS; // out from the pole
          const v = j / FLAG_ROWS; // down the hoist
          const along = u * FLAG_LENGTH;
          // The flag's own plane holds the pole and the wind; it ripples across that plane.
          const wave = flutter * u * Math.sin(2 * Math.PI * (rate * time + f.phase - u * 1.6));
          const sx = dx * ox * along + -dz * wave;
          const sz = dz * ox * along + dx * wave;
          const sy = oy * along - v * FLAG_HEIGHT;
          pos.setXYZ(k, f.x + sx, f.y + sy, f.z + sz);
        }
      }
      pos.needsUpdate = true;
      f.mesh.geometry.computeBoundingSphere();
    }
    this.grassUniforms.uTime.value = time;
    this.grassUniforms.uWind.value.set(w.x, w.z);
  }

  /** Tufts of grass on the grass around the start, each a few blades whose tips the wind moves. */
  private buildGrass(): THREE.LineSegments | null {
    const { world } = this;
    const sample = makeTerrainSample();
    const positions: number[] = [];
    const tips: number[] = [];
    const phases: number[] = [];
    const spacing = 1.3;
    const reach = 60;
    let seed = 0x2f6b;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const sx = world.spawn.x;
    const sz = world.spawn.z;
    for (let gz = -reach; gz <= reach; gz += spacing) {
      for (let gx = -reach; gx <= reach; gx += spacing) {
        const x = sx + gx + (rand() - 0.5) * spacing;
        const z = sz + gz + (rand() - 0.5) * spacing;
        if (gx * gx + gz * gz > reach * reach || rand() < 0.5) continue;
        world.terrain.sample(x, z, sample);
        if (sample.surface !== Surface.Grass) continue;
        const blades = 1 + Math.floor(rand() * 3);
        const phase = rand() * 6.283;
        for (let b = 0; b < blades; b++) {
          const h = 0.12 + rand() * 0.22;
          const bx = x + (rand() - 0.5) * 0.12;
          const bz = z + (rand() - 0.5) * 0.12;
          const tx = (rand() - 0.5) * 0.12;
          const tz = (rand() - 0.5) * 0.12;
          positions.push(bx, sample.height, bz, bx + tx, sample.height + h, bz + tz);
          tips.push(0, h, 0, h);
          phases.push(phase + b, phase + b);
        }
      }
    }
    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('tip', new THREE.Float32BufferAttribute(tips, 2));
    geo.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: this.grassUniforms,
      vertexShader: /* glsl */ `
        attribute vec2 tip;
        attribute float phase;
        uniform float uTime;
        uniform vec2 uWind;
        void main() {
          vec3 p = position;
          // A blade's tip (tip.x is 1 there, its height in tip.y) leans downwind and sways.
          float speed = length(uWind);
          vec2 dir = speed > 0.001 ? uWind / speed : vec2(1.0, 0.0);
          float lean = tip.y * min(1.0, speed / 7.0) * 0.55;
          float sway = tip.y * (0.04 + 0.05 * min(1.0, speed / 7.0)) * sin(uTime * (1.5 + 0.35 * speed) + phase);
          p.xz += tip.x * dir * (lean + sway);
          p.y -= tip.x * lean * 0.3;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        void main() { gl_FragColor = vec4(${new THREE.Color(palette.canopy).toArray().map((c) => c.toFixed(3)).join(', ')}, 0.8); }
      `,
      transparent: true,
      depthWrite: false,
    });
    const tipAttr = geo.getAttribute('tip') as THREE.BufferAttribute;
    // tip.x marks a blade's tip: 1 at the top vertex of each pair.
    for (let k = 0; k < tipAttr.count; k++) tipAttr.setX(k, k % 2);
    const lines = new THREE.LineSegments(geo, material);
    lines.name = 'grass';
    lines.frustumCulled = false;
    return lines;
  }

  dispose(): void {
    for (const f of this.flags) f.mesh.geometry.dispose();
    this.flagMaterial.dispose();
    if (this.grass) {
      this.grass.geometry.dispose();
      (this.grass.material as THREE.Material).dispose();
    }
  }
}
