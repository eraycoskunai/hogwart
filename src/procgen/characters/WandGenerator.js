/**
 * @file WandGenerator — procedural wands: a lathe-like shaft whose radius
 * varies with the handle style (plain, ringed, knotted, spiral, root),
 * wood-grain texture from the wood type, length in inches, and a tip
 * anchor for spell effects. Also rolls random wands and sums the stat
 * modifiers of wood, core and flexibility.
 */
import * as THREE from 'three';
import { WAND, WAND_WOODS, WAND_CORES, WAND_FLEX, WAND_STYLES } from '../../data/wands.js';
import { Noise } from '../textures/noise.js';
import { paintWandGrain } from './CharacterTextures.js';

const TAU = Math.PI * 2;

/**
 * @typedef {{wood:string, core:string, length:number, flex:number, style:string, seed:number}} WandData
 */

/** @param {() => number} rnd @returns {WandData} */
export function randomWand(rnd) {
  const pick = (o) => {
    const k = Object.keys(o);
    return k[Math.floor(rnd() * k.length)];
  };
  const [l0, l1] = WAND.lengthRange;
  return {
    wood: pick(WAND_WOODS),
    core: pick(WAND_CORES),
    length: Math.round((l0 + rnd() * (l1 - l0)) * 4) / 4,
    flex: Math.floor(rnd() * WAND_FLEX.length),
    style: pick(WAND_STYLES),
    seed: Math.floor(rnd() * 1e9),
  };
}

/** Validate saved wand data. @param {any} w @param {() => number} rnd */
export function sanitizeWand(w, rnd) {
  if (!w || !(w.wood in WAND_WOODS) || !(w.core in WAND_CORES) || !(w.style in WAND_STYLES)) return randomWand(rnd);
  const [l0, l1] = WAND.lengthRange;
  return {
    wood: w.wood,
    core: w.core,
    style: w.style,
    length: THREE.MathUtils.clamp(Number(w.length) || l0, l0, l1),
    flex: THREE.MathUtils.clamp(Math.round(Number(w.flex) || 0), 0, WAND_FLEX.length - 1),
    seed: Number.isFinite(w.seed) ? w.seed : 1,
  };
}

/** Summed stat modifiers. @param {WandData} w */
export function wandStats(w) {
  const out = { power: 0, control: 0, speed: 0, focus: 0 };
  for (const src of [WAND_WOODS[w.wood]?.stats, WAND_CORES[w.core]?.stats, WAND_FLEX[w.flex]?.stats]) {
    for (const [k, v] of Object.entries(src ?? {})) out[k] += v;
  }
  return out;
}

/** Human readable description ("11¼ inç, Porsuk, Anka kuşu tüyü, Esnek"). @param {WandData} w */
export function describeWand(w) {
  const whole = Math.floor(w.length);
  const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[w.length - whole] ?? '';
  return `${whole}${frac} inç · ${WAND_WOODS[w.wood].label} · ${WAND_CORES[w.core].label} · ${WAND_FLEX[w.flex].label}`;
}

/**
 * Build the wand model. +Y runs from the pommel (0) to the tip.
 * @param {WandData} w
 * @returns {{group:THREE.Group, tip:THREE.Object3D, length:number, material:THREE.Material, texture:THREE.Texture, geometry:THREE.BufferGeometry}}
 */
export function buildWand(w) {
  const L = w.length * WAND.inch;
  const N = new Noise(w.seed);
  const handle = WAND.handleFraction;
  const rings = WAND.rings;
  const seg = WAND.segments;
  const pos = [];
  const uv = [];
  const idx = [];
  const radius = (t, a) => {
    const base = t < handle
      ? WAND.baseRadius * (1 - 0.1 * (t / handle))
      : THREE.MathUtils.lerp(WAND.baseRadius * 0.82, WAND.tipRadius, Math.pow((t - handle) / (1 - handle), 0.9));
    let r = base;
    // Pommel knob and collar.
    r += 0.0022 * Math.exp(-(((t - 0.02) / 0.02) ** 2));
    r += 0.0012 * Math.exp(-(((t - handle) / 0.012) ** 2));
    switch (w.style) {
      case 'ringed':
        if (t < handle) r += 0.0011 * Math.max(0, Math.sin((t / handle) * Math.PI * 7)) ** 6;
        break;
      case 'knotted':
        r += 0.0012 * Math.max(0, N.perlin(t * 14, a / TAU * 3, 64, 3)) * (t < 0.85 ? 1 : 0);
        break;
      case 'spiral':
        if (t < handle) r -= 0.0009 * Math.max(0, Math.sin(a * 2 + (t / handle) * 28)) ** 3;
        break;
      case 'root':
        if (t < handle) r += 0.0026 * Math.abs(N.perlin(t * 9, (a / TAU) * 4, 64, 4)) * (1 - t / handle);
        break;
      default:
        break;
    }
    // Rounded tip.
    if (t > 0.985) r *= Math.sqrt(Math.max(0.05, 1 - ((t - 0.985) / 0.015) ** 2));
    return r;
  };
  // A slight natural bend.
  const bend = (N.perlin(3.1, 7.7, 64, 64) * 0.5 + 0.5) * 0.004;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const r = radius(t, a);
      pos.push(Math.cos(a) * r + Math.sin(t * Math.PI) * bend, t * L, Math.sin(a) * r);
      uv.push(i / seg, t * 2);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const texture = paintWandGrain(WAND_WOODS[w.wood], w.seed);
  const material = new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35 });
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.name = 'wand';
  const group = new THREE.Group();
  group.add(mesh);
  const tip = new THREE.Object3D();
  tip.position.set(0, L, 0);
  group.add(tip);
  return { group, tip, length: L, material, texture, geometry: g };
}
