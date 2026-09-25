/**
 * @file EffectMaterials — animated materials built on generated textures:
 * water (two scrolling normal layers, foam, PBR Fresnel + environment
 * reflection), flame (distorted, flickering additive sprite), spell trail
 * and magical ink (additive glow with scroll / pulse) and ghost mist
 * (translucent, Fresnel rim).
 * Every material reads the shared `uTime` uniform owned by MaterialLibrary.
 */
import * as THREE from 'three';

export const WATER = Object.freeze({
  color: 0x1d4a5a,
  deepColor: 0x0b2530,
  opacity: 0.88,
  roughness: 0.04,
  scrollA: [0.018, 0.011],
  scrollB: [-0.013, 0.017],
  scaleB: 1.7,
  normalStrength: 0.9,
  foam: 0.35,
});

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/**
 * @param {{albedo:THREE.Texture, normal:THREE.Texture}} tex
 * @param {{uTime:{value:number}}} shared
 * @param {number} tile metres per repeat
 */
export function createWaterMaterial(tex, shared, tile) {
  const m = new THREE.MeshPhysicalMaterial({
    color: WATER.color,
    roughness: WATER.roughness,
    metalness: 0,
    ior: 1.333,
    transparent: true,
    opacity: WATER.opacity,
    normalMap: tex.normal,
    map: tex.albedo,
    clearcoat: 0.3,
    clearcoatRoughness: 0.05,
  });
  const uniforms = {
    uTime: shared.uTime,
    uWaterScale: { value: 1 / tile },
    uFoam: { value: WATER.foam },
    uDeep: { value: new THREE.Color(WATER.deepColor) },
    uNormalStrength: { value: WATER.normalStrength },
  };
  m.userData.water = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform float uWaterScale; uniform float uFoam; uniform vec3 uDeep; uniform float uNormalStrength;
        varying vec3 vWaterPos;
        vec2 waterUvA() { return vWaterPos.xz * uWaterScale + uTime * vec2(${WATER.scrollA[0]}, ${WATER.scrollA[1]}); }
        vec2 waterUvB() { return vWaterPos.xz * uWaterScale * ${WATER.scaleB} + uTime * vec2(${WATER.scrollB[0]}, ${WATER.scrollB[1]}); }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          float foam = texture2D(map, waterUvA() * 0.8).r * texture2D(map, waterUvB() * 0.6).r;
          vec3 viewDirW = normalize(cameraPosition - vWaterPos);
          diffuseColor.rgb = mix(uDeep, diffuseColor.rgb, clamp(viewDirW.y * 0.5 + 0.3, 0.0, 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.92), clamp(foam * uFoam * 3.0, 0.0, 1.0));
          diffuseColor.a = mix(diffuseColor.a, 1.0, clamp(foam * uFoam * 3.0, 0.0, 1.0));
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec3 a = texture2D(normalMap, waterUvA()).xyz * 2.0 - 1.0;
          vec3 b = texture2D(normalMap, waterUvB()).xyz * 2.0 - 1.0;
          vec3 t = normalize(vec3((a.xy + b.xy) * uNormalStrength, a.z * b.z));
          // Tangent frame of a horizontal plane mapped with (x, z): up is +Y.
          vec3 nW = normalize(vec3(t.x, t.z, t.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz) * faceDirection;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'water';
  return m;
}

const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform vec2 uScroll;
uniform float uPulse;
uniform float uDistort;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 uv = vUv + uScroll * uTime;
  if (uDistort > 0.0) {
    float h = vUv.y;
    uv.x += (sin(h * 9.0 - uTime * 7.0 + uSeed) * 0.5 + sin(h * 23.0 - uTime * 13.0 + uSeed * 2.0) * 0.25) * uDistort * h;
    uv.y += sin(uTime * 5.0 + uSeed) * 0.01 * uDistort;
  }
  vec4 t = texture2D(map, uv);
  float flicker = 1.0 + uPulse * (sin(uTime * 11.0 + uSeed) * 0.5 + sin(uTime * 17.3 + uSeed * 1.7) * 0.3 + sin(uTime * 3.1) * 0.2);
  vec3 col = t.rgb * uColor * uIntensity * flicker;
  gl_FragColor = vec4(col * t.a, t.a);
  ${OUTPUT}
}`;

/**
 * Additive glowing sprite / ribbon (flame, trail, ink).
 * @param {THREE.Texture} map albedo (with alpha)
 * @param {{uTime:{value:number}}} shared
 * @param {{color?:number, intensity?:number, scroll?:number[], pulse?:number, distort?:number, seed?:number}} o
 */
export function createGlowMaterial(map, shared, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uIntensity: { value: o.intensity ?? 1.5 },
      uTime: shared.uTime,
      uScroll: { value: new THREE.Vector2(...(o.scroll ?? [0, 0])) },
      uPulse: { value: o.pulse ?? 0 },
      uDistort: { value: o.distort ?? 0 },
      uSeed: { value: o.seed ?? Math.random() * 100 },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

const GHOST_VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vNormalV = normalize(transformedNormal);
  vViewDir = normalize(-mvPosition.xyz);
}`;

const GHOST_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uRim;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vec4 a = texture2D(map, vUv * vec2(1.0, 1.0) + vec2(0.0, uTime * 0.04));
  vec4 b = texture2D(map, vUv * 1.7 + vec2(uTime * 0.02, -uTime * 0.03));
  float mist = a.a * 0.6 + b.a * 0.4;
  float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), uRim);
  float alpha = clamp((mist * 0.5 + fres * 0.9) * uOpacity, 0.0, 1.0);
  vec3 col = uColor * (0.6 + mist * 0.6 + fres * 0.8);
  gl_FragColor = vec4(col, alpha);
  ${OUTPUT}
}`;

/**
 * @param {THREE.Texture} map
 * @param {{uTime:{value:number}}} shared
 * Works on static, skinned and morphed meshes (ghost NPCs).
 * @param {{color?:number, opacity?:number, rim?:number}} o
 */
export function createGhostMaterial(map, shared, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(o.color ?? 0xcfe4ff) },
      uTime: shared.uTime,
      uOpacity: { value: o.opacity ?? 0.75 },
      uRim: { value: o.rim ?? 2.2 },
    },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });
}
