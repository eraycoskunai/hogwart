/**
 * @file TerrainMaterial — splat-blended landscape shading. Five library
 * materials (grass, dirt, rock, mud, paving) are packed into texture
 * arrays (albedo + normal); the fragment shader blends them from the splat
 * map (paths, forest floor, paving, shore) and the slope (rock on cliffs,
 * sampled bi-planarly so cliffs do not stretch), breaks tiling with two
 * sample scales and the world variation texture, and reacts to weather
 * (wet darkening / gloss, snow on flat ground, sheltered spots stay dry).
 */
import * as THREE from 'three';
import { OCCLUDER_GLSL } from './PrecipitationOccluder.js';

/** Per-layer roughness (grass, dirt, rock, mud, paving). */
const LAYER_ROUGHNESS = [0.92, 0.95, 0.82, 0.55, 0.78];
/** Forest floor tint over dirt. */
const FOREST_TINT = [0.62, 0.6, 0.48];

/**
 * Pack same-sized RGBA maps into a texture array (downsampling larger ones).
 * @param {Uint8Array[]} maps
 * @param {number[]} sizes
 * @param {boolean} srgb
 * @param {number} anisotropy
 */
export function packLayers(maps, sizes, srgb, anisotropy) {
  const size = Math.min(...sizes);
  const layer = size * size * 4;
  const data = new Uint8Array(layer * maps.length);
  maps.forEach((src, l) => {
    const f = sizes[l] / size;
    if (f === 1) {
      data.set(src, l * layer);
      return;
    }
    // Box-filter down to the common size.
    const S = sizes[l];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += src[((y * f + dy) * S + x * f + dx) * 4 + c];
          data[l * layer + (y * size + x) * 4 + c] = sum / (f * f);
        }
      }
    }
  });
  const t = new THREE.DataArrayTexture(data, size, size, maps.length);
  t.format = THREE.RGBAFormat;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * @param {{albedo:THREE.DataArrayTexture, normal:THREE.DataArrayTexture, splat:THREE.Texture,
 *          uvTransform:THREE.Vector4, tiles:number[], rockSlope:number[], shared:any}} o
 */
export function createTerrainMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const u = {
    uLayerAlbedo: { value: o.albedo },
    uLayerNormal: { value: o.normal },
    uSplat: { value: o.splat },
    uTerrainUV: { value: o.uvTransform },
    uLayerTile: { value: o.tiles.map((t) => 1 / t) },
    uRockSlope: { value: new THREE.Vector2(...o.rockSlope) },
    uVarTex: o.shared.uVarTex,
    uWetness: o.shared.uWetness,
    uSnowCover: o.shared.uSnowCover,
    ...o.shared.occ,
  };
  m.userData.terrain = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrPos;\nvarying vec3 vTerrNormal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvTerrPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n\tvTerrNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uLayerAlbedo;
        uniform sampler2DArray uLayerNormal;
        uniform sampler2D uSplat;
        uniform sampler2D uVarTex;
        uniform vec4 uTerrainUV;
        uniform float uLayerTile[5];
        uniform vec2 uRockSlope;
        uniform float uWetness;
        uniform float uSnowCover;
        ${OCCLUDER_GLSL}
        varying vec3 vTerrPos;
        varying vec3 vTerrNormal;
        float tRough;
        vec3 tNormalW;
        const float LAYER_ROUGH[5] = float[5](${LAYER_ROUGHNESS.map((v) => v.toFixed(3)).join(', ')});

        // Two scales mixed by a noise to hide repetition.
        vec4 layerSample(sampler2DArray tex, float layer, vec2 p, float tile, float mixK) {
          vec4 a = texture(tex, vec3(p * tile, layer));
          vec4 b = texture(tex, vec3(p * tile * 0.37 + 0.21, layer));
          return mix(a, b, mixK);
        }
        // Rock: bi-planar (top + dominant side).
        vec4 rockSample(sampler2DArray tex, vec3 p, vec3 n, float tile) {
          vec3 an = abs(n);
          vec4 top = texture(tex, vec3(p.xz * tile, 2.0));
          vec4 side = an.x > an.z ? texture(tex, vec3(vec2(p.z, p.y) * tile, 2.0)) : texture(tex, vec3(vec2(p.x, p.y) * tile, 2.0));
          float k = smoothstep(0.55, 0.85, an.y);
          return mix(side, top, k);
        }`)
      .replace('#include <map_fragment>', `
        {
          vec3 n = normalize(vTerrNormal);
          vec2 tuv = (vTerrPos.xz - uTerrainUV.xy) * uTerrainUV.z + uTerrainUV.w;
          vec4 sp = texture2D(uSplat, tuv);
          vec4 vr = texture2D(uVarTex, vTerrPos.xz * 0.011);
          float mixK = smoothstep(0.35, 0.65, vr.g);
          float rock = smoothstep(uRockSlope.y, uRockSlope.x, n.y);
          float dirt = max(sp.r, sp.g * 0.75);
          vec3 col = layerSample(uLayerAlbedo, 0.0, vTerrPos.xz, uLayerTile[0], mixK).rgb;
          col *= mix(vec3(1.0), vec3(1.12, 1.06, 0.8), smoothstep(0.55, 0.8, vr.r));
          vec3 nrm = layerSample(uLayerNormal, 0.0, vTerrPos.xz, uLayerTile[0], mixK).xyz;
          float rough = LAYER_ROUGH[0];
          if (dirt > 0.01) {
            vec3 d = layerSample(uLayerAlbedo, 1.0, vTerrPos.xz, uLayerTile[1], mixK).rgb;
            d = mix(d, d * vec3(${FOREST_TINT.join(', ')}), sp.g * (1.0 - sp.r));
            col = mix(col, d, dirt);
            nrm = mix(nrm, layerSample(uLayerNormal, 1.0, vTerrPos.xz, uLayerTile[1], mixK).xyz, dirt);
            rough = mix(rough, LAYER_ROUGH[1], dirt);
          }
          if (sp.a > 0.01) {
            col = mix(col, layerSample(uLayerAlbedo, 3.0, vTerrPos.xz, uLayerTile[3], mixK).rgb, sp.a);
            nrm = mix(nrm, layerSample(uLayerNormal, 3.0, vTerrPos.xz, uLayerTile[3], mixK).xyz, sp.a);
            rough = mix(rough, LAYER_ROUGH[3], sp.a);
          }
          if (sp.b > 0.01) {
            col = mix(col, texture(uLayerAlbedo, vec3(vTerrPos.xz * uLayerTile[4], 4.0)).rgb, sp.b);
            nrm = mix(nrm, texture(uLayerNormal, vec3(vTerrPos.xz * uLayerTile[4], 4.0)).xyz, sp.b);
            rough = mix(rough, LAYER_ROUGH[4], sp.b);
          }
          if (rock > 0.01) {
            col = mix(col, rockSample(uLayerAlbedo, vTerrPos, n, uLayerTile[2]).rgb, rock);
            nrm = mix(nrm, rockSample(uLayerNormal, vTerrPos, n, uLayerTile[2]).xyz, rock);
            rough = mix(rough, LAYER_ROUGH[2], rock);
          }
          col *= 0.86 + 0.28 * vr.a;
          // Weather.
          float dry = occSheltered(vTerrPos);
          float wet = uWetness * (1.0 - dry);
          col *= mix(1.0, 0.62, wet);
          rough = mix(rough, 0.35, wet * 0.85);
          float snow = uSnowCover * smoothstep(0.55, 0.85, n.y) * (1.0 - dry) * smoothstep(0.3, 0.7, vr.b + uSnowCover * 0.6);
          col = mix(col, vec3(0.93, 0.95, 0.98), snow);
          rough = mix(rough, 0.8, snow);
          diffuseColor.rgb *= col;
          tRough = rough;
          // Tangent-space normal → world (planar mapping: T = +X, B = +Z).
          vec3 tn = nrm * 2.0 - 1.0;
          tn.xy *= (1.0 - snow * 0.8);
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - n * n.x);
          vec3 B = normalize(cross(n, T)) * -1.0;
          tNormalW = normalize(T * tn.x + B * tn.y + n * tn.z);
        }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'terrainSplat';
  return m;
}
