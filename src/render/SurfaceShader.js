/**
 * @file SurfaceShader — patches MeshStandard/MeshPhysical materials with:
 *   - triplanar sampling of albedo / ORM / emissive and a whiteout-blended
 *     triplanar normal map (world space, no UV seams, constant texel size)
 *   - a second, low-frequency world-space variation texture that breaks
 *     tiling: tone and hue drift, grime patches, cavity dirt
 *   - weathering: moss on up-facing surfaces and in crevices, damp stains
 *     near wall bases, and global wetness (darker albedo, glossier surface)
 * The per-material parameters live in `material.userData.surface` (uniforms)
 * and can be changed at runtime (gallery sliders, weather system).
 */
import * as THREE from 'three';
import { OCCLUDER_GLSL } from './PrecipitationOccluder.js';

export const SURFACE_DEFAULTS = Object.freeze({
  triplanar: false,
  /** 1 / metres per texture repeat. */
  scale: 0.5,
  sharpness: 4,
  variation: 0.4,
  dirt: 0.3,
  moss: 0,
  mossColor: 0x4d5c2a,
  damp: 0,
  dampHeight: 0.9,
  dampBase: 0,
  wet: 1,
});

/** World-scale factors for the variation texture (cycles per metre). */
const VARIATION_SCALE_A = 0.045;
const VARIATION_SCALE_B = 0.21;

const PARS = /* glsl */ `
uniform float uTriScale;
uniform float uTriSharp;
uniform float uVariation;
uniform float uDirt;
uniform float uMoss;
uniform vec3 uMossColor;
uniform float uDamp;
uniform float uDampHeight;
uniform float uDampBase;
uniform float uWetResponse;
uniform float uWetness;
uniform float uSnowCover;
uniform sampler2D uVarTex;
${OCCLUDER_GLSL}
varying vec3 vSurfPos;
varying vec3 vSurfNormal;

vec3 surfWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(uTriSharp));
  return w / max(w.x + w.y + w.z, 1e-5);
}
vec3 surfSigns(vec3 n) { return step(0.0, n) * 2.0 - 1.0; }

vec4 surfSample(sampler2D tex, vec2 uv) {
#ifdef SURF_TRIPLANAR
  vec3 n = normalize(vSurfNormal);
  vec3 w = surfWeights(n);
  vec3 s = surfSigns(n);
  vec3 p = vSurfPos * uTriScale;
  vec4 cx = texture2D(tex, vec2(-p.z * s.x, p.y));
  vec4 cy = texture2D(tex, vec2(p.x * s.y, p.z));
  vec4 cz = texture2D(tex, vec2(p.x * s.z, p.y));
  return cx * w.x + cy * w.y + cz * w.z;
#else
  return texture2D(tex, uv);
#endif
}

// Whiteout-blended triplanar normal mapping; returns a world-space normal.
vec3 surfTriplanarNormal(sampler2D tex, vec2 nScale) {
  vec3 n = normalize(vSurfNormal);
  vec3 w = surfWeights(n);
  vec3 s = surfSigns(n);
  vec3 p = vSurfPos * uTriScale;
  vec3 tX = texture2D(tex, vec2(-p.z * s.x, p.y)).xyz * 2.0 - 1.0;
  vec3 tY = texture2D(tex, vec2(p.x * s.y, p.z)).xyz * 2.0 - 1.0;
  vec3 tZ = texture2D(tex, vec2(p.x * s.z, p.y)).xyz * 2.0 - 1.0;
  tX.xy *= nScale; tY.xy *= nScale; tZ.xy *= nScale;
  // Bring tangent X into world orientation for each projection.
  tX.x *= -s.x; tY.x *= s.y; tZ.x *= s.z;
  vec3 an = abs(n);
  tX = vec3(tX.xy + n.zy, an.x * tX.z);
  tY = vec3(tY.xy + n.xz, an.y * tY.z);
  tZ = vec3(tZ.xy + n.xy, an.z * tZ.z);
  tX.z *= s.x; tY.z *= s.y; tZ.z *= s.z;
  return normalize(tX.zyx * w.x + tY.xzy * w.y + tZ.xyz * w.z);
}
`;

const WEATHER = /* glsl */ `
float surfWetMask = 0.0;
float surfMossMask = 0.0;
float surfDampMask = 0.0;
float surfSnowMask = 0.0;
{
  vec3 sn = normalize(vSurfNormal);
  vec2 vuv = abs(sn.y) > 0.6 ? vSurfPos.xz : vec2(vSurfPos.x + vSurfPos.z, vSurfPos.y);
  vec4 varA = texture2D(uVarTex, vuv * ${VARIATION_SCALE_A});
  vec4 varB = texture2D(uVarTex, vuv * ${VARIATION_SCALE_B} + 0.37);
  float tone = (varA.r - 0.5) * 2.0;
  diffuseColor.rgb *= 1.0 + tone * 0.2 * uVariation;
  float hue = (varA.g - 0.5) * 0.14 * uVariation;
  diffuseColor.rgb *= vec3(1.0 + hue, 1.0, 1.0 - hue);
  float cav = 0.0;
  #ifdef USE_AOMAP
    cav = 1.0 - surfSample(aoMap, vAoMapUv).r;
  #endif
  float grime = clamp(cav * 0.7 + smoothstep(0.55, 0.85, varB.b) * 0.5, 0.0, 1.0) * uDirt;
  diffuseColor.rgb *= 1.0 - grime * 0.4;
  float up = smoothstep(0.35, 0.9, sn.y);
  surfMossMask = clamp((up * smoothstep(0.45, 0.7, varA.b + cav * 0.6) + cav * smoothstep(0.55, 0.8, varB.g) * 0.7) * uMoss, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMossColor * (0.7 + varB.r * 0.6), surfMossMask);
  surfDampMask = (1.0 - smoothstep(0.0, uDampHeight * (0.6 + varB.g * 0.8), vSurfPos.y - uDampBase)) * uDamp * (1.0 - up);
  diffuseColor.rgb *= 1.0 - surfDampMask * 0.38;
  // Roofs keep interiors dry and snow-free (top-down occluder map).
  float shelter = occSheltered(vSurfPos);
  surfSnowMask = smoothstep(0.45, 0.85, sn.y) * uSnowCover * (1.0 - shelter) * clamp(0.75 + varB.r * 0.5 - cav * 0.3, 0.0, 1.0);
  surfWetMask = clamp(uWetness * uWetResponse * (0.55 + 0.45 * up + cav * 0.5), 0.0, 1.0) * (1.0 - shelter) * (1.0 - surfSnowMask);
  diffuseColor.rgb *= 1.0 - surfWetMask * 0.32;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.95), surfSnowMask);
}
`;

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {Partial<typeof SURFACE_DEFAULTS>} opts
 * @param {{uWetness:{value:number}, uSnowCover:{value:number}, uVarTex:{value:THREE.Texture}, occ:Record<string, {value:any}>}} shared
 */
export function applySurfaceShader(material, opts, shared) {
  const o = { ...SURFACE_DEFAULTS, ...opts };
  const uniforms = {
    uTriScale: { value: o.scale },
    uTriSharp: { value: o.sharpness },
    uVariation: { value: o.variation },
    uDirt: { value: o.dirt },
    uMoss: { value: o.moss },
    uMossColor: { value: new THREE.Color(o.mossColor) },
    uDamp: { value: o.damp },
    uDampHeight: { value: o.dampHeight },
    uDampBase: { value: o.dampBase },
    uWetResponse: { value: o.wet },
    uWetness: shared.uWetness,
    uSnowCover: shared.uSnowCover,
    uVarTex: shared.uVarTex,
    ...shared.occ,
  };
  material.userData.surface = uniforms;
  material.userData.triplanar = o.triplanar;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = shader.defines || {};
    if (material.userData.triplanar) shader.defines.SURF_TRIPLANAR = '';

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 surfP = vec4(transformed, 1.0);
          vec3 surfN = objectNormal;
          #ifdef USE_INSTANCING
            surfP = instanceMatrix * surfP;
            surfN = mat3(instanceMatrix) * surfN;
          #endif
          surfP = modelMatrix * surfP;
          vSurfPos = surfP.xyz;
          vSurfNormal = normalize(mat3(modelMatrix) * surfN);
        }`,
      );

    const C = THREE.ShaderChunk;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <map_fragment>', C.map_fragment.replace('texture2D( map, vMapUv )', 'surfSample( map, vMapUv )') + WEATHER)
      .replace(
        '#include <roughnessmap_fragment>',
        C.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'surfSample( roughnessMap, vRoughnessMapUv )') +
          `
          roughnessFactor = mix(roughnessFactor, 0.95, surfMossMask);
          roughnessFactor *= 1.0 - surfDampMask * 0.25;
          roughnessFactor = mix(roughnessFactor, 0.06, surfWetMask * 0.85);
          roughnessFactor = mix(roughnessFactor, 0.8, surfSnowMask);`,
      )
      .replace('#include <metalnessmap_fragment>', C.metalnessmap_fragment.replace('texture2D( metalnessMap, vMetalnessMapUv )', 'surfSample( metalnessMap, vMetalnessMapUv )'))
      .replace('#include <aomap_fragment>', C.aomap_fragment.replace('texture2D( aoMap, vAoMapUv )', 'surfSample( aoMap, vAoMapUv )'))
      .replace('#include <emissivemap_fragment>', C.emissivemap_fragment.replace('texture2D( emissiveMap, vEmissiveMapUv )', 'surfSample( emissiveMap, vEmissiveMapUv )'))
      .replace(
        '#include <normal_fragment_maps>',
        `#if defined( SURF_TRIPLANAR ) && defined( USE_NORMALMAP_TANGENTSPACE )
          normal = normalize( ( viewMatrix * vec4( surfTriplanarNormal( normalMap, normalScale ), 0.0 ) ).xyz ) * faceDirection;
        #else
          ${C.normal_fragment_maps}
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `surf:${material.userData.triplanar ? 1 : 0}`;
  material.needsUpdate = true;
  return uniforms;
}
