/**
 * @file Physics world constants and the player controller tuning.
 */

export const PHYSICS = Object.freeze({
  /** Gravity for rigid bodies (m/s²). */
  gravity: -9.81,
  /** Spatial hash cell size for static triangles (m). */
  cellSize: 4,
  solverIterations: 10,
  friction: 0.45,
  restitution: 0.08,
  allowSleep: true,
  sleepSpeedLimit: 0.12,
  sleepTimeLimit: 0.6,
  linearDamping: 0.05,
  angularDamping: 0.08,
  /** Default ray length for queries (m). */
  maxRayDistance: 500,
  /** Bodies falling below this Y are respawned / removed. */
  killPlaneY: -60,
  /** Segment count used when cylinders are triangulated for the character. */
  cylinderSegments: 16,
  /** Collision filter groups (bit masks). */
  groups: { static: 1, dynamic: 2, player: 4, kinematic: 8 },
});

export const PLAYER = Object.freeze({
  radius: 0.32,
  height: 1.68,
  crouchHeight: 1.12,
  mass: 70,

  walkSpeed: 2.0,
  runSpeed: 4.6,
  sprintSpeed: 7.4,
  crouchSpeed: 1.7,
  aimSpeed: 2.6,
  /** Movement speed while noclip is active (debug). */
  noclipSpeed: 14,

  groundAccel: 42,
  groundDecel: 34,
  airAccel: 9,
  /** Rotation smoothing (1/s) when turning toward movement. */
  turnRate: 14,

  gravity: 24,
  jumpHeight: 1.2,
  maxFallSpeed: 48,
  /** Extra gravity factor when jump is released early (variable jump height). */
  jumpCutGravity: 1.9,

  maxSlopeDeg: 48,
  /** Surfaces steeper than -cos(this) push the capsule down (ceilings). */
  ceilingNormalY: -0.3,
  stepHeight: 0.45,
  groundSnap: 0.32,
  collisionIterations: 5,
  /** Max movement per collision sub-step as a fraction of the radius. */
  substepFraction: 0.45,
  /** Finer sub-steps for downward probes so thin ledge contacts are not skipped. */
  probeSubstepFraction: 0.15,
  /** Minimum horizontal gain for a step-up attempt to be accepted (m). */
  stepMinProgress: 0.002,

  coyoteTime: 0.12,
  jumpBuffer: 0.14,

  maxHealth: 100,
  fallDamage: {
    /** Falls shorter than this never hurt (m). */
    safeHeight: 4.5,
    /** Falls of this height or more are lethal (m). */
    lethalHeight: 18,
    /** Curve exponent between safe and lethal. */
    exponent: 1.35,
    /** Landing shake starts above this height (m). */
    shakeHeight: 2.2,
  },
  respawnDelay: 2.6,
  invulnerableAfterRespawn: 1.5,

  /** Mass (kg) the player can shove at full walking speed. */
  pushStrength: 55,
  /** Fraction of the player's speed transferred to light pushed bodies. */
  pushSpeedFactor: 0.9,

  /** Visual smoothing of sudden height changes (step-ups), 1/s. */
  stepSmoothRate: 14,
});
