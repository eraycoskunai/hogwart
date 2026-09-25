/**
 * @file Hairline — where hair grows on the scalp for a style, shared by
 * the hair mesh generator and the face texture painter (which paints the
 * scalp in the hair colour so the hairline blends softly).
 */
import { HAIRLINE, HAIR } from '../../data/character.js';
import { sampleTable, ramp } from './MeshKit.js';

const _row = [];

/** Azimuth of a head-space point: 0 = face, ±π = nape. */
export function azimuth(x, z) {
  return Math.atan2(x, -z);
}

/**
 * Hairline height at an azimuth (head space, metres).
 * @param {object} style HAIR_STYLES entry
 * @param {number} theta
 * @param {number} s head scale
 */
export function hairlineY(style, theta, s) {
  sampleTable(HAIRLINE, Math.abs(theta), _row);
  return (_row[0] + (style.lineOffset ?? 0)) * s;
}

/**
 * 0..1 coverage of the scalp at a head-space point (1 = under hair).
 * @param {object} style
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} s
 */
export function scalpCoverage(style, x, y, z, s) {
  const th = azimuth(x, z);
  const yh = hairlineY(style, th, s);
  const soft = HAIR.edgeSoftness * s;
  return ramp(yh - soft, yh + soft, y);
}

/**
 * Fringe coverage over the forehead for styles with bangs.
 * @returns {number} 0..1
 */
export function fringeCoverage(style, x, y, z, s, jag = 0) {
  const f = style.fringe;
  if (!f) return 0;
  const th = Math.abs(azimuth(x, z));
  if (th > f.width) return 0;
  const yh = hairlineY(style, th, s);
  const bottom = yh - f.depth * s * (1 - (th / f.width) ** 2 * 0.6) + jag;
  const soft = HAIR.edgeSoftness * s * 0.4;
  return ramp(bottom - soft, bottom + soft, y) * (1 - ramp(f.width * 0.8, f.width, th));
}
