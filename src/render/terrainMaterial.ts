import * as THREE from 'three';
import type { LookUniforms } from './materials';
import { palette } from './palette';

/**
 * The topographic terrain shader: flat-shaded facets, a ground grid every 10 m (major
 * every 50 m) and contour lines every 5 m (major every 25 m), anti-aliased with
 * screen-space derivatives and faded with distance so far slopes don't shimmer.
 * Lighting and fog match materials.ts.
 */

const vertex = /* glsl */ `
attribute vec3 aTint;
varying vec3 vWorld;
varying vec3 vTint;
varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vTint = aTint;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uLine;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec4 uGrid;     // minor spacing, major spacing, minor fade distance, major fade distance
uniform vec4 uContour;  // minor interval, major interval, minor fade distance, major fade distance
uniform float uLineStrength;
varying vec3 vWorld;
varying vec3 vTint;
varying float vDist;

float gridLine(vec2 coord, float widthPx) {
  vec2 w = fwidth(coord);
  vec2 g = abs(fract(coord - 0.5) - 0.5) / max(w, vec2(1e-6));
  return 1.0 - smoothstep(widthPx - 0.6, widthPx + 0.6, min(g.x, g.y));
}

float levelLine(float coord, float widthPx) {
  float w = fwidth(coord);
  // A contour exists only where the ground rises: perfectly flat ground at a contour's
  // height is not one huge line (a built scene's floor at 0 m, a lake).
  if (w < 1e-9) return 0.0;
  float g = abs(fract(coord - 0.5) - 0.5) / max(w, 1e-6);
  return 1.0 - smoothstep(widthPx - 0.6, widthPx + 0.6, g);
}

void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  float sun = max(dot(n, uSunDir), 0.0);
  vec3 ambient = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
  vec3 col = vTint * (ambient * 0.76 + uSunColor * sun * 0.4);

  if (uLineStrength > 0.0) {
    float minorFade = 1.0 - smoothstep(uGrid.z * 0.35, uGrid.z, vDist);
    float majorFade = 1.0 - smoothstep(uGrid.w * 0.35, uGrid.w, vDist);
    float cMinorFade = 1.0 - smoothstep(uContour.z * 0.35, uContour.z, vDist);
    float cMajorFade = 1.0 - smoothstep(uContour.w * 0.35, uContour.w, vDist);
    float line = gridLine(vWorld.xz / uGrid.x, 0.5) * minorFade * 0.22;
    line = max(line, gridLine(vWorld.xz / uGrid.y, 0.75) * majorFade * 0.32);
    line = max(line, levelLine(vWorld.y / uContour.x, 0.55) * cMinorFade * 0.42);
    line = max(line, levelLine(vWorld.y / uContour.y, 0.9) * cMajorFade * 0.62);
    col = mix(col, uLine, line * uLineStrength);
  }

  float f = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createTerrainMaterial(look: LookUniforms, lines: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...look,
      uLine: { value: new THREE.Color(palette.line) },
      uGrid: { value: new THREE.Vector4(10, 50, 260, 700) },
      uContour: { value: new THREE.Vector4(5, 25, 650, 1400) },
      uLineStrength: { value: lines ? 1 : 0 },
    },
    // Push faces back a touch so edge lines drawn on top never z-fight.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
