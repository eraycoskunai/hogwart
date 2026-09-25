/**
 * @file Graphics quality presets. Later phases read the same keys
 * (texture resolution, post-fx, particles...).
 */

export const QUALITY_PRESETS = Object.freeze({
  low: {
    label: 'Düşük',
    pixelRatioMax: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    textureSize: 512,
    drawDistance: 140,
    fogDensityScale: 1.25,
    particleScale: 0.35,
    maxDynamicLights: 2,
    postFx: false,
  },
  medium: {
    label: 'Orta',
    pixelRatioMax: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    textureSize: 1024,
    drawDistance: 260,
    fogDensityScale: 1,
    particleScale: 0.6,
    maxDynamicLights: 4,
    postFx: true,
  },
  high: {
    label: 'Yüksek',
    pixelRatioMax: 1.75,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    textureSize: 1024,
    drawDistance: 450,
    fogDensityScale: 0.85,
    particleScale: 1,
    maxDynamicLights: 8,
    postFx: true,
  },
  ultra: {
    label: 'Ultra',
    pixelRatioMax: 2.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 4096,
    textureSize: 2048,
    drawDistance: 800,
    fogDensityScale: 0.7,
    particleScale: 1.5,
    maxDynamicLights: 12,
    postFx: true,
  },
});

export const QUALITY_ORDER = Object.freeze(['low', 'medium', 'high', 'ultra']);
export const DEFAULT_QUALITY = 'medium';

/** Render-scale choices offered in settings (multiplies device pixel ratio). */
export const RENDER_SCALES = Object.freeze([0.5, 0.67, 0.75, 0.85, 1, 1.25, 1.5]);
