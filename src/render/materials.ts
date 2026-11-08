import * as THREE from 'three';
import { palette } from './palette';

/**
 * One lighting model for everything solid, matching the terrain shader: flat facets
 * (normals from screen-space derivatives, so no normals are needed and instancing just
 * works), a hemisphere ambient, a single sun, and the same exp² fog.
 *
 * Fog grows with distance from the eye, not depth along the view (A4): a guard's contrast
 * against the haze is the same whichever way you turn your head. three.js's own fog is
 * made to agree, for the edge lines and anything else drawn with its materials.
 */
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = length( mvPosition.xyz );');

export interface LookUniforms {
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSkyAmbient: THREE.IUniform<THREE.Color>;
  uGroundAmbient: THREE.IUniform<THREE.Color>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
}

/** Shared uniform objects: changing fog or sun here updates every material at once. */
export function createLook(sunDir: THREE.Vector3, fogDensity: number): LookUniforms {
  return {
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(palette.sun) },
    uSkyAmbient: { value: new THREE.Color(palette.skyAmbient) },
    uGroundAmbient: { value: new THREE.Color(palette.groundAmbient) },
    uFogColor: { value: new THREE.Color(palette.fog) },
    uFogDensity: { value: fogDensity },
  };
}

const flatVertex = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
varying vec3 vColor;
#ifdef USE_VERTEX_TINT
attribute vec3 aTint;
#endif
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  vec4 wp = modelMatrix * local;
  vWorld = wp.xyz;
  vColor = vec3(1.0);
  #ifdef USE_VERTEX_TINT
  vColor = aTint;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
  #endif
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const flatFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
/** 1 in the sun, 0 in shade: a body's lit state comes from the simulation (A4). */
uniform float uSunlit;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorld;
varying float vDepth;
varying vec3 vColor;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float sun = max(dot(n, uSunDir), 0.0);
  vec3 ambient = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5);
  vec3 col = uColor * vColor * (ambient * (0.76 - 0.12 * (1.0 - uSunlit)) + uSunColor * sun * 0.4 * uSunlit);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`;

export interface FlatOptions {
  color: THREE.ColorRepresentation;
  vertexTint?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** In shade: no direct sun, a little less sky (A4). */
  shaded?: boolean;
}

export function createFlatMaterial(look: LookUniforms, opts: FlatOptions): THREE.ShaderMaterial {
  const opacity = opts.opacity ?? 1;
  return new THREE.ShaderMaterial({
    vertexShader: flatVertex,
    fragmentShader: flatFragment,
    defines: opts.vertexTint ? { USE_VERTEX_TINT: '' } : {},
    uniforms: {
      ...look,
      uColor: { value: new THREE.Color(opts.color) },
      uOpacity: { value: opacity },
      uSunlit: { value: opts.shaded ? 0 : 1 },
    },
    transparent: opacity < 1,
    side: opts.side ?? THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/** Hairline edges, fogged like everything else. */
export function createLineMaterial(color: THREE.ColorRepresentation, opacity = 1): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    fog: true,
  });
}
