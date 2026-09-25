/**
 * @file Third-person camera tuning.
 */
const DEG = Math.PI / 180;

export const CAMERA = Object.freeze({
  near: 0.05,
  pivotHeight: 1.5,
  crouchPivotHeight: 0.98,
  distance: 3.7,
  minDistance: 0.55,
  aimDistance: 1.55,
  shoulderOffset: 0.55,
  aimShoulderOffset: 0.72,
  /** Extra height of the look pivot above the shoulder line. */
  pivotUp: 0.12,
  pitchMin: -70 * DEG,
  pitchMax: 72 * DEG,
  defaultPitch: -12 * DEG,

  aimFovDelta: -16,
  sprintFovDelta: 7,
  fovLerp: 6,
  aimBlendSpeed: 11,
  aimSensitivityScale: 0.6,

  collisionRadius: 0.22,
  collisionReturnSpeed: 3.5,
  /** Rays cast around the main collision ray (probe ring). */
  collisionProbes: 4,

  horizontalFollow: 22,
  verticalFollow: 9,

  /** Radians per pixel at sensitivity 1. */
  mouseRadPerPixel: 0.0023,
  /** Radians per second at full stick deflection. */
  stickRadPerSecond: 3.3,

  shoulderSwapSpeed: 7,

  lockOn: {
    range: 24,
    breakRange: 30,
    maxAngle: 55 * DEG,
    /** Mouse movement (px) that switches target while locked. */
    switchPixels: 70,
    switchStick: 0.75,
    switchCooldown: 0.3,
    losGrace: 1.2,
    yawLerp: 7,
    pitchLerp: 5,
    /** Downward bias of the camera pitch while locked. */
    pitchBias: -0.16,
  },

  shake: {
    maxYaw: 0.05,
    maxPitch: 0.05,
    maxRoll: 0.04,
    maxOffset: 0.12,
    decay: 1.4,
    frequency: 17,
  },

  cinematic: {
    blendOut: 0.9,
    letterbox: 0.11,
  },
});
