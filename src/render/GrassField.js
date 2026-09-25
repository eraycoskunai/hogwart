/**
 * @file GrassField — GPU grass around the camera. One instanced clump of
 * blades is repeated in a square that wraps with the camera (no CPU work
 * per frame); every clump reads the terrain height and a grass-density map
 * in the vertex shader, so it sits on the ground and thins out on paths,
 * rock, shores and the forest floor. Blades bend in the wind, shrink under
 * snow and fade out at the edge of the patch.
 */
import * as THREE from 'three';
import { GRASS } from '../data/grounds.js';

function clumpGeometry(count) {
  const G = GRASS;
  const base = new THREE.BufferGeometry();
  const pos = [];
  const blade = [];
  const idx = [];
  let v = 0;
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let b = 0; b < G.blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * G.clumpRadius;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const facing = rnd() * Math.PI;
    const dx = Math.cos(facing) * G.width * 0.5;
    const dz = Math.sin(facing) * G.width * 0.5;
    const h = G.height[0] + rnd() * (G.height[1] - G.height[0]);
    const lean = (rnd() - 0.5) * 0.25;
    const first = v;
    for (let s = 0; s <= G.segments; s++) {
      const t = s / G.segments;
      const w = 1 - t * 0.85;
      const lx = ox + lean * t * t * Math.cos(a);
      const lz = oz + lean * t * t * Math.sin(a);
      pos.push(lx - dx * w, h * t, lz - dz * w, lx + dx * w, h * t, lz + dz * w);
      blade.push(t, t);
      v += 2;
    }
    for (let s = 0; s < G.segments; s++) {
      const k = first + s * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 1));
  base.setIndex(idx);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('aBlade', base.getAttribute('aBlade'));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = count;
  return g;
}

export class GrassField {
  /**
   * @param {THREE.Object3D} parent
   * @param {{height:THREE.Texture, density:THREE.Texture, uvTransform:THREE.Vector4, shared:any, count:number}} o
   */
  constructor(parent, o) {
    this.count = o.count;
    if (!o.count) return;
    const u = {
      uHeightTex: { value: o.height },
      uGrassTex: { value: o.density },
      uTerrainUV: { value: o.uvTransform },
      uCam: { value: new THREE.Vector3() },
      uArea: { value: GRASS.radius * 2 },
      uGrassTime: { value: 0 },
      uWind: { value: GRASS.wind },
      uSnow: o.shared.uSnowCover,
      uColorA: { value: new THREE.Color(GRASS.colorA) },
      uColorB: { value: new THREE.Color(GRASS.colorB) },
    };
    this.u = u;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uHeightTex, uGrassTex;
          uniform vec4 uTerrainUV;
          uniform vec3 uCam;
          uniform float uArea, uGrassTime, uWind, uSnow;
          attribute vec4 aSeed;
          attribute float aBlade;
          varying float vBlade;
          varying float vTone;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 xz = uCam.xz + (fract(aSeed.xy - uCam.xz / uArea) - 0.5) * uArea;
          vec2 tuv = (xz - uTerrainUV.xy) * uTerrainUV.z + uTerrainUV.w;
          float ground = texture(uHeightTex, tuv).r;
          float dens = texture(uGrassTex, tuv).r;
          float fade = 1.0 - smoothstep(uArea * 0.32, uArea * 0.5, length(xz - uCam.xz));
          float hs = mix(0.5, 1.0, dens) * (0.7 + 0.6 * aSeed.z) * fade * (1.0 - uSnow * 0.85);
          float ang = aSeed.z * 6.2831;
          float ca = cos(ang), sa = sin(ang);
          vec3 p = vec3(position.x * ca - position.z * sa, position.y * hs, position.x * sa + position.z * ca);
          float gust = sin(uGrassTime * 1.7 + xz.x * 0.21 + xz.y * 0.17) * 0.6 + sin(uGrassTime * 3.1 + xz.x * 0.7) * 0.25;
          p.xz += vec2(0.8, 0.5) * gust * uWind * aBlade * aBlade * 0.35 * hs;
          vec3 transformed = vec3(xz.x, ground - 0.03, xz.y) + p;
          if (dens < aSeed.w || fade <= 0.0) transformed.y -= 10000.0;
          vBlade = aBlade;
          vTone = aSeed.z;`)
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uColorA, uColorB;\nvarying float vBlade;\nvarying float vTone;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 gc = mix(uColorA, uColorB, vBlade * 0.8 + vTone * 0.3);
          diffuseColor.rgb *= gc * (0.55 + 0.45 * vBlade);`);
    };
    m.customProgramCacheKey = () => 'grassField';
    this.material = m;
    this.geometry = clumpGeometry(o.count);
    this.mesh = new THREE.Mesh(this.geometry, m);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'grass';
    parent.add(this.mesh);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} cam
   * @param {number} wind 0..1
   */
  update(dt, cam, wind) {
    if (!this.mesh) return;
    this.u.uCam.value.copy(cam);
    this.u.uGrassTime.value += dt;
    this.u.uWind.value = GRASS.wind + wind * 0.9;
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
