/**
 * @file LakeMaterial — large-water shading for the Black Lake: two
 * scrolling normal layers, Fresnel reflection of the sky environment,
 * colour and opacity from the real water depth (read from the terrain
 * height texture, so shallows are clear and green, the deep is inky) and
 * foam lines along the shore. Rain roughens the surface.
 */
import * as THREE from 'three';
import { WATER } from './EffectMaterials.js';

/**
 * @param {{tex:{albedo:THREE.Texture, normal:THREE.Texture}, shared:any, height:THREE.Texture,
 *          uvTransform:THREE.Vector4, level:number, lake:typeof import('../data/grounds.js').LAKE}} o
 */
export function createLakeMaterial(o) {
  const L = o.lake;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: WATER.roughness,
    metalness: 0,
    ior: 1.333,
    transparent: true,
    depthWrite: false,
    normalMap: o.tex.normal,
    map: o.tex.albedo,
    clearcoat: 0.25,
    clearcoatRoughness: 0.06,
  });
  const u = {
    uTime: o.shared.uTime,
    uWetness: o.shared.uWetness,
    uHeightTex: { value: o.height },
    uTerrainUV: { value: o.uvTransform },
    uLevel: { value: o.level },
    uShallow: { value: new THREE.Color(L.shallowColor) },
    uDeep: { value: new THREE.Color(L.deepColor) },
    uFalloff: { value: L.depthFalloff },
    uFoamDepth: { value: L.foamDepth },
    uShoreAlpha: { value: L.opacityShore },
    uScale: { value: 1 / L.tile },
    uNormalStrength: { value: WATER.normalStrength },
  };
  m.userData.lake = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLakePos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLakePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWetness, uLevel, uFalloff, uFoamDepth, uShoreAlpha, uScale, uNormalStrength;
        uniform sampler2D uHeightTex;
        uniform vec4 uTerrainUV;
        uniform vec3 uShallow, uDeep;
        varying vec3 vLakePos;
        float lakeDepth;
        vec2 lakeA() { return vLakePos.xz * uScale + uTime * vec2(${WATER.scrollA[0]}, ${WATER.scrollA[1]}); }
        vec2 lakeB() { return vLakePos.xz * uScale * ${WATER.scaleB} + uTime * vec2(${WATER.scrollB[0]}, ${WATER.scrollB[1]}); }`)
      .replace('#include <map_fragment>', `{
          vec2 tuv = (vLakePos.xz - uTerrainUV.xy) * uTerrainUV.z + uTerrainUV.w;
          float ground = texture2D(uHeightTex, tuv).r;
          lakeDepth = uLevel - ground;
          if (lakeDepth < -0.05) discard;
          float k = 1.0 - exp(-max(lakeDepth, 0.0) / uFalloff);
          vec3 viewDirW = normalize(cameraPosition - vLakePos);
          vec3 water = mix(uShallow, uDeep, k);
          water = mix(water, uDeep, (1.0 - clamp(viewDirW.y, 0.0, 1.0)) * 0.4);
          float n1 = texture2D(map, lakeA() * 0.7).r;
          float n2 = texture2D(map, lakeB() * 0.5).r;
          float foamLine = 1.0 - smoothstep(0.0, uFoamDepth, lakeDepth + (n1 - 0.5) * 0.35);
          float foam = foamLine * smoothstep(0.35, 0.75, n1 * n2 * 2.0 + foamLine * 0.3);
          diffuseColor.rgb = mix(water, vec3(0.86, 0.9, 0.92), foam);
          diffuseColor.a = mix(uShoreAlpha, 0.97, smoothstep(0.0, 2.5, lakeDepth));
          diffuseColor.a = max(diffuseColor.a, foam);
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness + uWetness * 0.12;')
      .replace('#include <normal_fragment_maps>', `{
          vec3 a = texture2D(normalMap, lakeA()).xyz * 2.0 - 1.0;
          vec3 b = texture2D(normalMap, lakeB()).xyz * 2.0 - 1.0;
          float s = uNormalStrength * (1.0 + uWetness * 0.8);
          vec3 t = normalize(vec3((a.xy + b.xy) * s, a.z * b.z));
          vec3 nW = normalize(vec3(t.x, t.z, t.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'lake';
  return m;
}
