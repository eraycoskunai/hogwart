/**
 * @file WindowMaterial — leaded glass for the castle's exterior windows:
 * a diamond lattice (canvas-generated), dark reflective glass by day and
 * a warm candle glow at night. Which windows are lit is decided per
 * window-sized cell in world space, so the skyline looks inhabited.
 */
import * as THREE from 'three';

/** Lattice texture: diamond quarrels between lead cames (1 repeat = 1 m). */
function latticeTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#1a1612';
  g.lineWidth = size * 0.035;
  const step = size / 4;
  for (let k = -4; k <= 8; k++) {
    g.beginPath();
    g.moveTo(k * step, 0);
    g.lineTo(k * step + size, size);
    g.stroke();
    g.beginPath();
    g.moveTo(k * step, size);
    g.lineTo(k * step + size, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {{color:string, lit:number}} o glow colour and share of lit windows
 * @returns {THREE.MeshStandardMaterial & {userData:{night:{value:number}}}}
 */
export function createWindowMaterial(o) {
  const tex = latticeTexture();
  const m = new THREE.MeshStandardMaterial({
    color: 0x3a4655,
    map: tex,
    roughness: 0.12,
    metalness: 0.55,
    emissive: new THREE.Color(o.color),
    emissiveMap: tex,
    emissiveIntensity: 0,
  });
  const u = { uNight: { value: 0 }, uLit: { value: o.lit } };
  m.userData.night = u.uNight;
  m.userData.texture = tex;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWinPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight, uLit;
        varying vec3 vWinPos;
        float winHash(vec3 p) { return fract(sin(dot(floor(p / 3.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float h = winHash(vWinPos);
          float on = step(h, uLit) * uNight;
          float flicker = 0.85 + 0.15 * sin(h * 50.0 + vWinPos.y);
          totalEmissiveRadiance *= on * flicker * (1.6 + h * 1.4);
        }`);
  };
  m.customProgramCacheKey = () => 'castleWindow';
  m.emissiveIntensity = 1;
  return m;
}
