/**
 * @file Default user settings (persisted separately from save games).
 */
import { DEFAULT_QUALITY } from './quality.js';

export const DEFAULT_SETTINGS = Object.freeze({
  quality: DEFAULT_QUALITY,
  renderScale: 1,
  fov: 65,
  mouseSensitivity: 1,
  gamepadSensitivity: 1,
  invertY: false,
  showSubtitles: true,
  difficulty: 'normal',
  volume: { master: 0.8, music: 0.7, sfx: 0.9, ambience: 0.7, voice: 0.9 },
  /** Post-processing opt-outs (only effective when the quality preset enables them). */
  fx: { bloom: true, ao: true, godRays: true, dust: true },
  /** Per-action overrides of keyboard bindings, e.g. { jump: ['Space', null] } */
  keyBindings: {},
});

/** Allowed ranges for numeric settings (UI sliders + validation). */
export const SETTING_RANGES = Object.freeze({
  fov: { min: 50, max: 100, step: 1 },
  mouseSensitivity: { min: 0.1, max: 3, step: 0.05 },
  gamepadSensitivity: { min: 0.2, max: 3, step: 0.05 },
});

export const DIFFICULTIES = Object.freeze({
  story: { label: 'Hikâye', damageTaken: 0.5 },
  normal: { label: 'Normal', damageTaken: 1 },
  hard: { label: 'Zor', damageTaken: 1.5 },
});
