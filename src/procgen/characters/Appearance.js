/**
 * @file Appearance — validation, slider mapping and randomisation of the
 * saved character description ({sliders 0..1, palette indices, enums}).
 */
import * as THREE from 'three';
import {
  SLIDERS, DEFAULT_APPEARANCE, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLES, GLASSES,
  LOWER_GARMENTS, HOUSES, OUTFITS, HEAD, RANDOM_NAMES,
} from '../../data/character.js';

const SLIDER_KEYS = SLIDERS.map((s) => s.key);

/** Deterministic PRNG (mulberry32). @param {number} seed */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Coerce any (possibly corrupt / older) object into a valid appearance.
 * @param {any} a
 */
export function sanitizeAppearance(a) {
  const out = { ...DEFAULT_APPEARANCE };
  if (!a || typeof a !== 'object') return out;
  for (const k of SLIDER_KEYS) if (Number.isFinite(a[k])) out[k] = THREE.MathUtils.clamp(a[k], 0, 1);
  const idx = (v, list, def) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : def);
  out.skinTone = idx(a.skinTone, SKIN_TONES, out.skinTone);
  out.eyeColor = idx(a.eyeColor, EYE_COLORS, out.eyeColor);
  out.hairColor = idx(a.hairColor, HAIR_COLORS, out.hairColor);
  if (a.hairStyle in HAIR_STYLES) out.hairStyle = a.hairStyle;
  if (a.glasses in GLASSES) out.glasses = a.glasses;
  if (a.lower in LOWER_GARMENTS) out.lower = a.lower;
  if (typeof a.scarf === 'boolean') out.scarf = a.scarf;
  return out;
}

/** @param {any} d saved character block */
export function sanitizeCharacter(d) {
  const src = d && typeof d === 'object' ? d : {};
  const str = (v, def) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 24) : def);
  return {
    firstName: str(src.firstName, 'Ada'),
    lastName: str(src.lastName, 'Fenwick'),
    house: src.house in HOUSES ? src.house : 'none',
    outfit: src.outfit in OUTFITS ? src.outfit : 'uniform',
    appearance: sanitizeAppearance(src.appearance),
    wand: src.wand && typeof src.wand === 'object' ? { ...src.wand } : null,
  };
}

/**
 * Map sliders to physical values.
 * @param {typeof DEFAULT_APPEARANCE} a
 */
export function resolveAppearance(a) {
  /** @type {Record<string, number>} */
  const v = {};
  for (const s of SLIDERS) v[s.key] = THREE.MathUtils.lerp(s.min, s.max, a[s.key]);
  // Kids' heads vary less than their height.
  v.headScale = THREE.MathUtils.lerp(HEAD.scaleRange[0], HEAD.scaleRange[1], a.height);
  return v;
}

/**
 * A random, plausible student.
 * @param {() => number} rnd
 */
export function randomAppearance(rnd) {
  const a = { ...DEFAULT_APPEARANCE };
  // Mostly central values, occasionally more distinctive.
  const centred = () => THREE.MathUtils.clamp(0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.55, 0, 1);
  for (const k of SLIDER_KEYS) a[k] = centred();
  a.freckles = rnd() < 0.3 ? rnd() : rnd() * 0.15;
  a.skinTone = Math.floor(rnd() * SKIN_TONES.length);
  a.eyeColor = Math.floor(rnd() * EYE_COLORS.length);
  // Lighter hair is rarer on darker skin tones.
  const maxHair = a.skinTone >= 5 ? 3 : HAIR_COLORS.length;
  a.hairColor = Math.floor(rnd() * maxHair);
  const styles = Object.keys(HAIR_STYLES);
  a.hairStyle = styles[Math.floor(rnd() * styles.length)];
  const glasses = Object.keys(GLASSES);
  a.glasses = rnd() < 0.22 ? glasses[1 + Math.floor(rnd() * (glasses.length - 1))] : 'none';
  a.lower = rnd() < 0.5 ? 'trousers' : 'skirt';
  a.scarf = rnd() < 0.6;
  return a;
}

/** Random original name. @param {() => number} rnd */
export function randomName(rnd) {
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  return { firstName: pick(RANDOM_NAMES.first), lastName: pick(RANDOM_NAMES.last) };
}
