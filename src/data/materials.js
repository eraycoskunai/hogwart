/**
 * @file Material catalogue: how each generated map set becomes a three.js
 * material. Keys are "generator" or "generator:variant".
 *
 * Fields:
 *   type        'standard' | 'physical' | effect id ('water','flame','trail','ink','ghost')
 *   tile        metres covered by one texture repeat (triplanar / world UVs)
 *   triplanar   sample in world space (no UV seams, constant texel density)
 *   surface     world-space weathering: variation, dirt, moss, damp, wet response
 *   physical    extra MeshPhysicalMaterial params (clearcoat, sheen, anisotropy…)
 *   alphaTest / transparent / side / emissiveIntensity / normalScale / aoIntensity
 */

/** Bump when any generator changes so persistent caches are invalidated. */
export const TEXTURE_GEN_VERSION = 4;

/** Cache database name (IndexedDB). */
export const TEXTURE_CACHE_DB = 'hogwarts-rpg-textures';

/** Size of the world-variation noise texture. */
export const VARIATION_TEXTURE_SIZE = 256;

/** Hard cap on generator workers. */
export const MAX_TEXTURE_WORKERS = 4;

const STONE_SURFACE = { variation: 0.55, dirt: 0.45, moss: 0.55, damp: 0.6, wet: 1 };
const FLOOR_SURFACE = { variation: 0.45, dirt: 0.35, moss: 0.08, damp: 0, wet: 0.9 };

export const MATERIALS = {
  // ------------------------------------------------------------- stone
  hogwartsStone: { type: 'standard', tile: 3, triplanar: true, surface: STONE_SURFACE },
  cobblestone: { type: 'standard', tile: 3, triplanar: true, surface: { ...FLOOR_SURFACE, moss: 0.15 } },
  flagstone: { type: 'standard', tile: 4, triplanar: true, surface: FLOOR_SURFACE },
  marble: { type: 'physical', tile: 3, triplanar: true, physical: { clearcoat: 0.6, clearcoatRoughness: 0.15 }, surface: { variation: 0.15, dirt: 0.12, wet: 0.2 } },
  'marble:black': { type: 'physical', tile: 3, triplanar: true, physical: { clearcoat: 0.7, clearcoatRoughness: 0.1 }, surface: { variation: 0.1, dirt: 0.08, wet: 0.2 } },
  'marble:green': { type: 'physical', tile: 3, triplanar: true, physical: { clearcoat: 0.6, clearcoatRoughness: 0.12 }, surface: { variation: 0.12, dirt: 0.1, wet: 0.2 } },
  rock: { type: 'standard', tile: 6, triplanar: true, surface: { variation: 0.6, dirt: 0.3, moss: 0.5, damp: 0.3, wet: 1 } },

  // -------------------------------------------------------------- wood
  woodPlanks: { type: 'physical', tile: 2.5, triplanar: false, physical: { clearcoat: 0.25, clearcoatRoughness: 0.45 }, surface: { variation: 0.3, dirt: 0.3, wet: 0.7 } },
  'woodPlanks:walnut': { type: 'physical', tile: 2.5, triplanar: false, physical: { clearcoat: 0.55, clearcoatRoughness: 0.3 }, surface: { variation: 0.2, dirt: 0.2, wet: 0.5 } },
  'woodPlanks:weathered': { type: 'standard', tile: 2.5, triplanar: false, surface: { variation: 0.4, dirt: 0.4, moss: 0.25, damp: 0.3, wet: 1 } },
  woodParquet: { type: 'physical', tile: 3, triplanar: true, physical: { clearcoat: 0.6, clearcoatRoughness: 0.25 }, surface: { variation: 0.25, dirt: 0.25, wet: 0.4 } },
  bark: { type: 'standard', tile: 2, triplanar: false, surface: { variation: 0.4, dirt: 0.2, moss: 0.35, damp: 0.4, wet: 1 } },

  // --------------------------------------------------- fabric & leather
  books: { type: 'standard', tile: 1, triplanar: false, surface: { variation: 0.15, dirt: 0.2, wet: 0 } },
  leather: { type: 'physical', tile: 1, triplanar: false, physical: { clearcoat: 0.2, clearcoatRoughness: 0.5 }, surface: { variation: 0.2, dirt: 0.25, wet: 0.5 } },
  'leather:black': { type: 'physical', tile: 1, triplanar: false, physical: { clearcoat: 0.25, clearcoatRoughness: 0.45 }, surface: { variation: 0.15, dirt: 0.2, wet: 0.5 } },
  'leather:red': { type: 'physical', tile: 1, triplanar: false, physical: { clearcoat: 0.2, clearcoatRoughness: 0.5 }, surface: { variation: 0.2, dirt: 0.25, wet: 0.5 } },
  robeFabric: { type: 'physical', tile: 1, triplanar: false, physical: { sheen: 1, sheenRoughness: 0.55, sheenColor: 0x3a3c48 }, surface: { variation: 0.1, dirt: 0.15, wet: 0.8 } },
  'robeFabric:grey': { type: 'physical', tile: 1, triplanar: false, physical: { sheen: 1, sheenRoughness: 0.55, sheenColor: 0x8a8a92 }, surface: { variation: 0.1, dirt: 0.15, wet: 0.8 } },
  'robeFabric:burlap': { type: 'physical', tile: 1, triplanar: false, physical: { sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xc2a672 }, surface: { variation: 0.3, dirt: 0.35, wet: 0.9 } },
  'tapestry:lion': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', physical: { sheen: 0.8, sheenRoughness: 0.6, sheenColor: 0xd8ad3f }, surface: { variation: 0.1, dirt: 0.2, wet: 0 } },
  'tapestry:badger': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', physical: { sheen: 0.8, sheenRoughness: 0.6, sheenColor: 0xe0b531 }, surface: { variation: 0.1, dirt: 0.2, wet: 0 } },
  'tapestry:eagle': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', physical: { sheen: 0.8, sheenRoughness: 0.6, sheenColor: 0x6a7ab8 }, surface: { variation: 0.1, dirt: 0.2, wet: 0 } },
  'tapestry:snake': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', physical: { sheen: 0.8, sheenRoughness: 0.6, sheenColor: 0xc3c7cc }, surface: { variation: 0.1, dirt: 0.2, wet: 0 } },
  carpet: { type: 'physical', tile: 2.5, triplanar: true, physical: { sheen: 1, sheenRoughness: 0.7, sheenColor: 0x8a3a30 }, surface: { variation: 0.25, dirt: 0.3, wet: 0.6 } },

  // ------------------------------------------------------------- metal
  brass: { type: 'physical', tile: 1, triplanar: true, physical: { anisotropy: 0.6 }, surface: { variation: 0.25, dirt: 0.3, wet: 0.3 } },
  wroughtIron: { type: 'standard', tile: 1.5, triplanar: true, surface: { variation: 0.3, dirt: 0.3, wet: 0.6 } },
  rust: { type: 'standard', tile: 2, triplanar: true, surface: { variation: 0.4, dirt: 0.3, wet: 0.8 } },

  // ------------------------------------------------------------- glass
  stainedGlass: { type: 'physical', tile: 1.5, triplanar: false, transparent: true, side: 'double', emissiveIntensity: 1.4, physical: { clearcoat: 1, clearcoatRoughness: 0.05 }, surface: { variation: 0, dirt: 0.15, wet: 0 } },

  // ------------------------------------------------------------ nature
  grass: { type: 'standard', tile: 2, triplanar: true, surface: { variation: 0.7, dirt: 0.1, wet: 0.6 } },
  dirt: { type: 'standard', tile: 2.5, triplanar: true, surface: { variation: 0.6, dirt: 0.1, wet: 1 } },
  mud: { type: 'standard', tile: 3, triplanar: true, surface: { variation: 0.4, dirt: 0.1, wet: 0.3 } },
  leaves: { type: 'standard', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', surface: { variation: 0.5, dirt: 0, wet: 0.5 } },
  water: { type: 'water', tile: 6 },

  // --------------------------------------------------------- character
  skin: { type: 'physical', tile: 0.3, triplanar: false, physical: { sheen: 0.35, sheenRoughness: 0.4, sheenColor: 0xc86a58 }, surface: { variation: 0, dirt: 0, wet: 0.4 } },
  'skin:fair': { type: 'physical', tile: 0.3, triplanar: false, physical: { sheen: 0.35, sheenRoughness: 0.4, sheenColor: 0xd8786a }, surface: { variation: 0, dirt: 0, wet: 0.4 } },
  'skin:olive': { type: 'physical', tile: 0.3, triplanar: false, physical: { sheen: 0.3, sheenRoughness: 0.4, sheenColor: 0xa85e48 }, surface: { variation: 0, dirt: 0, wet: 0.4 } },
  'skin:deep': { type: 'physical', tile: 0.3, triplanar: false, physical: { sheen: 0.3, sheenRoughness: 0.4, sheenColor: 0x7a3e30 }, surface: { variation: 0, dirt: 0, wet: 0.4 } },
  'skin:freckled': { type: 'physical', tile: 0.3, triplanar: false, physical: { sheen: 0.35, sheenRoughness: 0.4, sheenColor: 0xd8786a }, surface: { variation: 0, dirt: 0, wet: 0.4 } },
  'hair:brown': { type: 'physical', tile: 0.3, triplanar: false, alphaTest: 0.35, side: 'double', physical: { anisotropy: 0.8, sheen: 0.4, sheenRoughness: 0.3, sheenColor: 0x8a6440 }, surface: { variation: 0, dirt: 0, wet: 0.5 } },
  'hair:black': { type: 'physical', tile: 0.3, triplanar: false, alphaTest: 0.35, side: 'double', physical: { anisotropy: 0.8, sheen: 0.4, sheenRoughness: 0.3, sheenColor: 0x3a322b }, surface: { variation: 0, dirt: 0, wet: 0.5 } },
  'hair:blonde': { type: 'physical', tile: 0.3, triplanar: false, alphaTest: 0.35, side: 'double', physical: { anisotropy: 0.8, sheen: 0.4, sheenRoughness: 0.3, sheenColor: 0xe8cf98 }, surface: { variation: 0, dirt: 0, wet: 0.5 } },
  'hair:red': { type: 'physical', tile: 0.3, triplanar: false, alphaTest: 0.35, side: 'double', physical: { anisotropy: 0.8, sheen: 0.4, sheenRoughness: 0.3, sheenColor: 0xc86a34 }, surface: { variation: 0, dirt: 0, wet: 0.5 } },
  'hair:grey': { type: 'physical', tile: 0.3, triplanar: false, alphaTest: 0.35, side: 'double', physical: { anisotropy: 0.8, sheen: 0.4, sheenRoughness: 0.3, sheenColor: 0xd0ccc6 }, surface: { variation: 0, dirt: 0, wet: 0.5 } },

  // ------------------------------------------------------------- paper
  parchment: { type: 'standard', tile: 1, triplanar: false, alphaTest: 0.5, side: 'double', surface: { variation: 0.1, dirt: 0.1, wet: 0.6 } },
  'parchment:tile': { type: 'standard', tile: 1.5, triplanar: true, surface: { variation: 0.3, dirt: 0.2, wet: 0.6 } },
  'waxSeal:red': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, physical: { clearcoat: 0.8, clearcoatRoughness: 0.2 }, surface: { variation: 0, dirt: 0, wet: 0 } },
  'waxSeal:green': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, physical: { clearcoat: 0.8, clearcoatRoughness: 0.2 }, surface: { variation: 0, dirt: 0, wet: 0 } },
  'waxSeal:gold': { type: 'physical', tile: 1, triplanar: false, alphaTest: 0.5, physical: { clearcoat: 0.8, clearcoatRoughness: 0.2 }, surface: { variation: 0, dirt: 0, wet: 0 } },

  // ---------------------------------------------------- emissive / fx
  candleFlame: { type: 'flame', tile: 1 },
  magicTrail: { type: 'trail', tile: 1, color: 0x8fd4ff },
  'magicInk:gold': { type: 'ink', tile: 1 },
  'magicInk:teal': { type: 'ink', tile: 1 },
  'magicInk:violet': { type: 'ink', tile: 1 },
  ghost: { type: 'ghost', tile: 1, color: 0xcfe4ff },
};

/** Parse "id:variant". @returns {{id:string, variant:string}} */
export function parseMaterialKey(key) {
  const [id, variant = ''] = key.split(':');
  return { id, variant };
}
