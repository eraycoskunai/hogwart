/**
 * @file Performance tuning: profiler smoothing, dynamic resolution, how
 * often cheap-but-frequent work (minimap, off-screen HUD) refreshes, and
 * when the game pauses itself.
 */

export const PROFILER = Object.freeze({
  /** Exponential smoothing factor per frame for section timings. */
  smoothing: 0.05,
  /** Sections listed in the debug panel. */
  topSections: 8,
});

/**
 * Dynamic resolution: when frames stay slow the render scale drops in
 * steps; when they stay at the display's refresh it climbs back.
 * Times are real seconds; frame times are smoothed ms.
 */
export const DYNAMIC_RES = Object.freeze({
  /** Frame time above which the scale drops (≈ 48 FPS). */
  slowMs: 21,
  /** Frame time below which the scale may rise (≈ vsync at 60 Hz). */
  fastMs: 17.5,
  /** Seconds a condition must hold before acting. */
  downAfter: 1.5,
  upAfter: 5,
  step: 0.1,
  min: 0.6,
  /** Ignore the first seconds after a region / state change (loading hitches). */
  settle: 3,
});

/** Refresh intervals (s) for work that does not need every frame. */
export const REFRESH = Object.freeze({
  minimap: 1 / 20,
  fpsCounter: 0.5,
});

/** The game pauses itself when the tab is hidden or WebGL is lost. */
export const AUTO_PAUSE = Object.freeze({
  onHidden: true,
});
