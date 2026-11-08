import * as THREE from 'three';
import type { FoliageVolume } from '../sim/perception';
import type { World } from '../sim/kernel/world/world';
import type { LookUniforms } from './materials';
import { palette } from './palette';

/**
 * Foliage drawn from the simulation's own volumes, by its own law (A4): each pixel's line of
 * sight through a bush or a canopy keeps exp(−density × chord) of what lies behind it, the
 * chord solved in the shader from the same cylinder or cone the simulation dims sight
 * through (sim/perception/foliage.ts). What a guard can see of you through a bush is what
 * you see of him through it, and what you see.
 *
 * Each volume is drawn by its back faces, so it shows from inside as from outside: lying
 * in a bush, you look out through as much of it as lies between you and the open. A body
 * standing inside foliage is drawn in front of it, undimmed; the simulation dims it by the
 * foliage between, so the drawing understates foliage only there.
 */

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform float uKind;    // 0: a cylinder (a bush); 1: an upright cone (a canopy)
uniform vec3 uBase;     // centre of the base: x, y0, z
uniform float uTop;     // y1: the top, or the cone's apex
uniform float uRadius;
uniform float uDensity;
uniform vec3 uColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorld;

// The interval of t along o + t·d (d of unit length) inside the slab of heights [y0, y1].
vec2 slab(vec3 o, vec3 d) {
  if (abs(d.y) < 1e-6) return (o.y >= uBase.y && o.y <= uTop) ? vec2(-1e9, 1e9) : vec2(1.0, 0.0);
  float a = (uBase.y - o.y) / d.y;
  float b = (uTop - o.y) / d.y;
  return vec2(min(a, b), max(a, b));
}

vec2 cylinder(vec3 o, vec3 d) {
  vec2 s = slab(o, d);
  vec2 p = o.xz - uBase.xz;
  float a = dot(d.xz, d.xz);
  float c = dot(p, p) - uRadius * uRadius;
  if (a < 1e-9) return c <= 0.0 ? s : vec2(1.0, 0.0);
  float b = dot(p, d.xz);
  float disc = b * b - a * c;
  if (disc <= 0.0) return vec2(1.0, 0.0);
  float q = sqrt(disc);
  return vec2(max(s.x, (-b - q) / a), min(s.y, (-b + q) / a));
}

// Inside where the distance from the axis is at most k·(top − y): a quadratic, cut to the
// cone's heights, which keep only its lower nappe (the cone is convex there).
vec2 cone(vec3 o, vec3 d) {
  vec2 s = slab(o, d);
  float k = uRadius / (uTop - uBase.y);
  float k2 = k * k;
  vec2 p = o.xz - uBase.xz;
  float h = uTop - o.y;
  float A = dot(d.xz, d.xz) - k2 * d.y * d.y;
  float B = 2.0 * (dot(p, d.xz) + k2 * h * d.y);
  float C = dot(p, p) - k2 * h * h;
  if (abs(A) < 1e-9) {
    if (abs(B) < 1e-9) return C <= 0.0 ? s : vec2(1.0, 0.0);
    float t = -C / B;
    return B > 0.0 ? vec2(s.x, min(s.y, t)) : vec2(max(s.x, t), s.y);
  }
  float disc = B * B - 4.0 * A * C;
  if (A > 0.0) {
    if (disc <= 0.0) return vec2(1.0, 0.0);
    float q = sqrt(disc);
    return vec2(max(s.x, (-B - q) / (2.0 * A)), min(s.y, (-B + q) / (2.0 * A)));
  }
  if (disc <= 0.0) return s;
  float q = sqrt(disc);
  float r1 = (-B + q) / (2.0 * A);
  float r2 = (-B - q) / (2.0 * A);
  float lo = min(r1, r2);
  float hi = max(r1, r2);
  vec2 below = vec2(s.x, min(s.y, lo));
  vec2 above = vec2(max(s.x, hi), s.y);
  return (below.y - below.x) >= (above.y - above.x) ? below : above;
}

void main() {
  vec3 o = cameraPosition;
  vec3 toFrag = vWorld - o;
  float far = length(toFrag);
  vec3 d = toFrag / far;
  vec2 span = uKind < 0.5 ? cylinder(o, d) : cone(o, d);
  float a = max(span.x, 0.0);
  float b = min(span.y, far);
  float chord = max(b - a, 0.0);
  float alpha = 1.0 - exp(-uDensity * chord);
  if (alpha <= 0.0) discard;
  vec3 col = uColor * (mix(uGroundAmbient, uSkyAmbient, 0.75) * 0.76 + uSunColor * max(uSunDir.y, 0.0) * 0.3);
  float dist = 0.5 * (a + b);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  gl_FragColor = vec4(mix(col, uFogColor, clamp(f, 0.0, 1.0)), alpha);
  #include <colorspace_fragment>
}
`;

/** The world's foliage volumes (world.foliage), each drawn by the chord through it. */
export class FoliageMeshes {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];

  constructor(world: World, look: LookUniforms) {
    this.group.name = 'foliage';
    for (const v of world.foliage ?? []) this.add(v, look);
  }

  private add(v: FoliageVolume, look: LookUniforms): void {
    const h = v.y1 - v.y0;
    // A mesh a touch larger than the volume, so every line through the volume meets its faces.
    const geo = v.kind === 'cyl' ? new THREE.CylinderGeometry(v.r * 1.06, v.r * 1.06, h + 0.1, 20, 1, false) : new THREE.ConeGeometry(v.r * 1.08, h + 0.2, 20, 1, false);
    geo.translate(v.x, v.y0 + h / 2 + (v.kind === 'cyl' ? 0 : 0.05), v.z);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        ...look,
        uKind: { value: v.kind === 'cyl' ? 0 : 1 },
        uBase: { value: new THREE.Vector3(v.x, v.y0, v.z) },
        uTop: { value: v.y1 },
        uRadius: { value: v.r },
        uDensity: { value: v.density },
        uColor: { value: new THREE.Color(v.kind === 'cyl' ? palette.bush : palette.canopy) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.geometries.push(geo);
    this.materials.push(material);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
