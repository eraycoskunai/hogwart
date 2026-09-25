/**
 * @file Tree species and rock shapes for the procedural vegetation.
 * Lengths in metres, angles in radians.
 */

export const TREE_SPECIES = Object.freeze({
  oak: {
    label: 'Meşe',
    trunkHeight: [4.5, 6.5],
    trunkRadius: [0.34, 0.5],
    lean: 0.12,
    levels: 3,
    children: [5, 4, 3],
    spread: [0.75, 0.9, 1],
    lengthRatio: [0.62, 0.55, 0.5],
    radiusRatio: 0.5,
    bendUp: 0.25,
    leafSize: [2.2, 3.1],
    leafClusters: 2,
    leafTint: '#86a45a',
    barkTint: '#a08a72',
  },
  pine: {
    label: 'Çam',
    trunkHeight: [13, 19],
    trunkRadius: [0.26, 0.38],
    lean: 0.04,
    whorls: [9, 13],
    branchLength: [3.6, 0.8],
    droop: 0.45,
    needleSize: [1.5, 2.2],
    needleTint: '#3f5a38',
    barkTint: '#8a6a52',
  },
  dead: {
    label: 'Kuru ağaç',
    trunkHeight: [5, 8],
    trunkRadius: [0.3, 0.45],
    lean: 0.25,
    levels: 3,
    children: [4, 3, 3],
    spread: [0.9, 1.1, 1.2],
    lengthRatio: [0.7, 0.6, 0.55],
    radiusRatio: 0.45,
    bendUp: -0.05,
    twist: 0.5,
    leafSize: [1.2, 1.8],
    leafClusters: 0.3,
    leafTint: '#5a5a30',
    barkTint: '#6a5e54',
  },
});

export const ROCKS = Object.freeze({
  variants: 6,
  detail: 3,
  noise: { freq: 2.2, amp: 0.34, ridged: 0.25 },
  flatten: 0.35,
  /** Scale ranges per placement. */
  cliff: [2.5, 7],
  shore: [0.6, 2.2],
  forest: [0.5, 1.8],
  meadow: [0.8, 3],
  colliderMin: 1.4,
});
