import * as THREE from 'three';
import { palette } from './palette';

/** A gradient dome with a soft sun, centred on the camera every frame. */
export function createSky(sunDir: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.SphereGeometry(4500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(palette.skyZenith) },
      uHorizon: { value: new THREE.Color(palette.skyHorizon) },
      uFog: { value: new THREE.Color(palette.fog) },
      uSun: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(palette.sun) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uFog;
      uniform vec3 uSun;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
        col = mix(uFog, col, smoothstep(-0.02, 0.06, d.y));
        float s = max(dot(d, uSun), 0.0);
        col += uSunColor * (pow(s, 900.0) * 0.6 + pow(s, 12.0) * 0.08);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
