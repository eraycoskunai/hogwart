/**
 * @file Global game constants (timing, versioning, storage).
 */

export const GAME = Object.freeze({
  title: 'Hogwarts: Mühürlü Kule',
  version: '1.0.0',
  /** Bumped whenever the save layout changes; SaveSystem migrates older saves. */
  saveVersion: 3,
  storagePrefix: 'hogwarts-rpg',
  /** Fixed physics step in seconds. */
  fixedStep: 1 / 60,
  /** Max physics steps per rendered frame before we drop time (spiral-of-death guard). */
  maxSubSteps: 5,
  /** Clamp for a single frame's delta (tab switches, breakpoints). */
  maxFrameDt: 0.25,
  /** Seconds between autosaves while playing. */
  autosaveInterval: 120,
  /** Number of manual save slots. */
  saveSlots: 6,
  /** Rotating autosaves kept. */
  autoSaves: 3,
});
