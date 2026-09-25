/**
 * @file Time, sky, lighting, weather and colour-grading tuning (Phase 3).
 */

const DEG = Math.PI / 180;

export const CLOCK = Object.freeze({
  /** Real seconds per in-game day (24 real minutes). */
  dayLengthSeconds: 24 * 60,
  /** Hour at which a new game starts. */
  startHour: 9.5,
  /** School year starts on 1 September. */
  startMonth: 8, // 0-based month index
  startDayOfMonth: 1,
  /** Year used only for weekday/month maths (Hogwarts letters arrive in 1991). */
  year: 1991,
  /** Latitude of the Scottish Highlands (sun path). */
  latitude: 56.8 * DEG,
  /** Clock hour of solar noon (British Summer Time and 4° W longitude). */
  solarNoon: 13.3,
  axialTilt: 23.44 * DEG,
  synodicMonth: 29.53,
  /** Moon phase at the start date (0 new, 0.5 full). */
  moonPhaseAtStart: 0.35,
  timeScaleOptions: [1, 10, 60, 300],
});

export const MONTH_NAMES = Object.freeze([
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]);

/** Season by month index. */
export const SEASONS = Object.freeze(['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']);
export const SEASON_LABELS = Object.freeze({ winter: 'Kış', spring: 'İlkbahar', summer: 'Yaz', autumn: 'Sonbahar' });

export const SKY = Object.freeze({
  turbidity: 3.2,
  rayleigh: 1.4,
  mieCoefficient: 0.0028,
  mieDirectionalG: 0.76,
  /** Scales the Preetham radiance to our exposure. */
  exposure: 0.42,
  nightColor: [0.006, 0.01, 0.028],
  starBrightness: 1.6,
  moonSize: 0.035,
  cloudHeight: 0.12,
  cloudScale: 1.4,
  cloudSpeed: 0.004,
  /** Real seconds between environment-map refreshes. */
  envRefresh: 3,
});

/**
 * Light keyframes by sun elevation (degrees). Values are interpolated.
 * sun: direct light colour/intensity · hemi: sky/ground ambient · fog: fog colour
 */
export const LIGHT_KEYS = Object.freeze([
  { el: -18, sun: [0x6a7fb0, 0], moon: 1, hemiSky: 0x33466e, hemiGround: 0x10121a, hemi: 0.5, fog: 0x141a2c, exposure: 1.45 },
  { el: -6, sun: [0x6a7fb0, 0], moon: 0.8, hemiSky: 0x4a4f7a, hemiGround: 0x1a1822, hemi: 0.45, fog: 0x2e2e4a, exposure: 1.3 },
  { el: 0, sun: [0xff8a4a, 0.5], moon: 0, hemiSky: 0x8a7a9a, hemiGround: 0x3a2a24, hemi: 0.34, fog: 0x9a8078, exposure: 1.1 },
  { el: 6, sun: [0xffb070, 1.6], moon: 0, hemiSky: 0xa9b8d6, hemiGround: 0x5a4a3a, hemi: 0.34, fog: 0xc0b4a8, exposure: 1 },
  { el: 20, sun: [0xffe6c8, 2.6], moon: 0, hemiSky: 0xbfd4ff, hemiGround: 0x5d5044, hemi: 0.36, fog: 0xbac6d0, exposure: 1 },
  { el: 60, sun: [0xfff6ea, 3.1], moon: 0, hemiSky: 0xc8dcff, hemiGround: 0x62564a, hemi: 0.38, fog: 0xc4d0da, exposure: 1 },
]);
export const MOON_LIGHT = Object.freeze({ color: 0x9fb4e8, intensity: 0.6 });
/** Blend speed (1/s) of interior ambient light when entering / leaving rooms. */
export const INTERIOR_AMBIENT_BLEND = 3;

export const WEATHER_TYPES = Object.freeze({
  clear: { label: 'Açık', cloud: 0.15, rain: 0, snow: 0, fog: 0, storm: 0, wind: 0.2 },
  cloudy: { label: 'Parçalı bulutlu', cloud: 0.55, rain: 0, snow: 0, fog: 0.1, storm: 0, wind: 0.35 },
  overcast: { label: 'Kapalı', cloud: 0.9, rain: 0, snow: 0, fog: 0.25, storm: 0, wind: 0.4 },
  rain: { label: 'Yağmurlu', cloud: 0.88, rain: 0.65, snow: 0, fog: 0.35, storm: 0, wind: 0.5 },
  storm: { label: 'Fırtına', cloud: 1, rain: 1, snow: 0, fog: 0.45, storm: 1, wind: 1 },
  fog: { label: 'Sisli', cloud: 0.6, rain: 0, snow: 0, fog: 1, storm: 0, wind: 0.08 },
  snow: { label: 'Karlı', cloud: 0.85, rain: 0, snow: 0.75, fog: 0.4, storm: 0, wind: 0.3 },
});

/** Relative chance of each weather per season. */
export const WEATHER_ODDS = Object.freeze({
  autumn: { clear: 2, cloudy: 3, overcast: 2, rain: 3, storm: 1, fog: 2, snow: 0 },
  winter: { clear: 2, cloudy: 2, overcast: 3, rain: 1, storm: 0.5, fog: 2, snow: 4 },
  spring: { clear: 3, cloudy: 3, overcast: 1, rain: 3, storm: 0.7, fog: 1, snow: 0.3 },
  summer: { clear: 5, cloudy: 3, overcast: 1, rain: 1.5, storm: 1, fog: 0.5, snow: 0 },
});

export const WEATHER = Object.freeze({
  /** Real seconds to blend between weather states. */
  transitionSeconds: 25,
  /** Game hours between automatic weather rolls. */
  changeEveryHours: [3, 8],
  /** Surface wetting / drying per real second. */
  wetRate: 0.08,
  dryRate: 0.012,
  snowAccumulateRate: 0.01,
  snowMeltRate: 0.004,
  /** Base fog density (exp2) at fog = 0 and at fog = 1. */
  fogDensity: [0.0045, 0.045],
  lightning: { minGap: 4, maxGap: 14, flash: 0.22, speedOfSound: 343, maxDistance: 3000 },
  windDirection: [0.8, 0.35],
  /** Area around the camera covered by precipitation (m). */
  area: 60,
  height: 30,
});

/** Colour grading presets: exposure, contrast, saturation, lift/gain tints, vignette. */
export const GRADES = Object.freeze({
  outdoor: { exposure: 1, contrast: 1.04, saturation: 1.05, lift: [0, 0, 0], gain: [1, 1, 1], vignette: 0.28 },
  greatHall: { exposure: 1.05, contrast: 1.08, saturation: 1.1, lift: [0.015, 0.008, 0], gain: [1.08, 1.0, 0.86], vignette: 0.35 },
  dungeon: { exposure: 0.95, contrast: 1.12, saturation: 0.8, lift: [0, 0.012, 0.008], gain: [0.86, 1.02, 0.92], vignette: 0.45 },
  forest: { exposure: 0.97, contrast: 1.06, saturation: 0.92, lift: [0, 0.01, 0.015], gain: [0.9, 1.0, 1.0], vignette: 0.38 },
  night: { exposure: 1, contrast: 1.05, saturation: 0.7, lift: [0, 0.005, 0.02], gain: [0.85, 0.92, 1.08], vignette: 0.4 },
  overcast: { exposure: 1, contrast: 0.97, saturation: 0.82, lift: [0.01, 0.01, 0.012], gain: [0.96, 0.98, 1.0], vignette: 0.3 },
});

export const POSTFX = Object.freeze({
  bloom: { strength: 0.5, radius: 0.5, threshold: 0.95 },
  godRays: { samples: 48, density: 0.85, decay: 0.95, weight: 0.4, exposure: 0.14, threshold: 1.4 },
  gradeBlend: 2.5,
  dof: { focus: 8, aperture: 0.00012, maxblur: 0.008 },
});

/** Dynamic point-light flicker profiles. */
export const FLICKER = Object.freeze({
  steady: { amount: 0, speed: 0 },
  lamp: { amount: 0.06, speed: 7 },
  candle: { amount: 0.12, speed: 11 },
  torch: { amount: 0.22, speed: 9 },
});
/** Per-second fade speed of pooled lights when they are (re)assigned. */
export const LIGHT_POOL_FADE = 5;
