/**
 * @file Wand lore and the small stat modifiers each part gives spells.
 * Stat keys: power (damage / strength), control (accuracy, charge
 * stability), speed (cast time), focus (focus cost reduction).
 */

export const WAND_WOODS = Object.freeze({
  oak: { label: 'Meşe', color: '#8a6440', grain: '#5c3f24', stats: { power: 0.04, control: 0.01 } },
  yew: { label: 'Porsuk', color: '#98583a', grain: '#63321e', stats: { power: 0.05, focus: -0.01 } },
  holly: { label: 'Çobanpüskülü', color: '#d8c7a0', grain: '#a89468', stats: { control: 0.04, focus: 0.01 } },
  willow: { label: 'Söğüt', color: '#b99a6a', grain: '#8a6c44', stats: { focus: 0.04, speed: 0.01 } },
  ebony: { label: 'Abanoz', color: '#2b2321', grain: '#140f0e', stats: { power: 0.03, control: 0.02 } },
  vine: { label: 'Asma', color: '#7a5a3a', grain: '#4a3420', stats: { speed: 0.03, control: 0.02 } },
  maple: { label: 'Akçaağaç', color: '#c8a878', grain: '#9a7a4c', stats: { speed: 0.04 } },
  cherry: { label: 'Kiraz', color: '#7c3a2a', grain: '#4e2016', stats: { power: 0.02, speed: 0.02 } },
  walnut: { label: 'Ceviz', color: '#5a3e2a', grain: '#352216', stats: { control: 0.03, power: 0.01 } },
  ash: { label: 'Dişbudak', color: '#c9b08a', grain: '#957c58', stats: { control: 0.02, focus: 0.02 } },
  alder: { label: 'Kızılağaç', color: '#a8643c', grain: '#743e20', stats: { focus: 0.03, speed: 0.01 } },
  apple: { label: 'Elma', color: '#a8704a', grain: '#74462a', stats: { focus: 0.02, control: 0.02 } },
});

export const WAND_CORES = Object.freeze({
  phoenix: { label: 'Anka kuşu tüyü', stats: { power: 0.04, speed: 0.02 } },
  dragon: { label: 'Ejderha yürek teli', stats: { power: 0.06, control: -0.01 } },
  unicorn: { label: 'Tek boynuzlu at kılı', stats: { control: 0.05, focus: 0.02 } },
});

/** Flexibility: stiff wands hit harder, flexible ones cast faster. */
export const WAND_FLEX = Object.freeze([
  { label: 'Sert', stats: { power: 0.03, speed: -0.02 } },
  { label: 'Oldukça sert', stats: { power: 0.015, speed: -0.01 } },
  { label: 'Esnek', stats: {} },
  { label: 'Oldukça esnek', stats: { speed: 0.015, power: -0.01 } },
  { label: 'Kıvrak', stats: { speed: 0.03, power: -0.02 } },
]);

/** Handle / shaft silhouettes for the procedural model. */
export const WAND_STYLES = Object.freeze({
  plain: { label: 'Sade' },
  ringed: { label: 'Halkalı' },
  knotted: { label: 'Boğumlu' },
  spiral: { label: 'Sarmal' },
  root: { label: 'Köklü' },
});

/** Length range in inches, and the model scale. */
export const WAND = Object.freeze({
  lengthRange: [9, 14.5],
  inch: 0.0254,
  handleFraction: 0.3,
  tipRadius: 0.0032,
  baseRadius: 0.0085,
  segments: 10,
  rings: 48,
  /** Grip offset along the wand from the pommel (fraction of length). */
  grip: 0.17,
  /** Wand axis in hand space: along the fingers, tipped toward the thumb. */
  handAxis: [0, -1, -0.42],
  handOffset: [0.004, -0.058, -0.012],
});
