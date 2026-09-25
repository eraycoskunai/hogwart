/**
 * @file Time — frame timing, fixed-step accumulator, time scaling and hit-stop.
 */

export class Time {
  /**
   * @param {{fixedStep:number, maxSubSteps:number, maxFrameDt:number}} cfg
   */
  constructor(cfg) {
    this.fixedStep = cfg.fixedStep;
    this.maxSubSteps = cfg.maxSubSteps;
    this.maxFrameDt = cfg.maxFrameDt;

    /** Scaled frame delta (seconds). */
    this.dt = 0;
    /** Real frame delta, unaffected by time scale (seconds). */
    this.unscaledDt = 0;
    /** Scaled time since start. */
    this.elapsed = 0;
    /** Real time since start. */
    this.realElapsed = 0;
    /** Global user/debug time scale. */
    this.scale = 1;
    /** Accumulated scaled time waiting to be consumed by fixed steps. */
    this.accumulator = 0;
    /** Interpolation factor between the last two physics states. */
    this.alpha = 0;
    this.frame = 0;

    this._last = -1;
    this._hitStopTimer = 0;
    this._hitStopScale = 1;

    // FPS statistics (1 second window)
    this.fps = 0;
    this.frameMs = 0;
    this.worstFrameMs = 0;
    this._fpsFrames = 0;
    this._fpsTimer = 0;
    this._worst = 0;
  }

  /**
   * Advance clocks for a new frame.
   * @param {number} nowMs timestamp from requestAnimationFrame
   */
  tick(nowMs) {
    if (this._last < 0) this._last = nowMs;
    let raw = (nowMs - this._last) / 1000;
    this._last = nowMs;
    if (raw < 0) raw = 0;
    raw = Math.min(raw, this.maxFrameDt);

    this.unscaledDt = raw;
    this.realElapsed += raw;

    let scale = this.scale;
    if (this._hitStopTimer > 0) {
      this._hitStopTimer -= raw;
      scale *= this._hitStopScale;
    }
    this.dt = raw * scale;
    this.elapsed += this.dt;
    this.accumulator += this.dt;
    this.frame++;

    this._fpsFrames++;
    this._fpsTimer += raw;
    this._worst = Math.max(this._worst, raw);
    if (this._fpsTimer >= 1) {
      this.fps = this._fpsFrames / this._fpsTimer;
      this.frameMs = (this._fpsTimer / this._fpsFrames) * 1000;
      this.worstFrameMs = this._worst * 1000;
      this._fpsFrames = 0;
      this._fpsTimer = 0;
      this._worst = 0;
    }
  }

  /**
   * Consume one fixed step if available.
   * @param {number} stepsTaken steps already taken this frame
   * @returns {boolean}
   */
  consumeStep(stepsTaken) {
    if (stepsTaken >= this.maxSubSteps) {
      // Too far behind: drop the backlog instead of spiralling.
      this.accumulator = 0;
      return false;
    }
    if (this.accumulator >= this.fixedStep) {
      this.accumulator -= this.fixedStep;
      return true;
    }
    return false;
  }

  /** Compute interpolation alpha after all fixed steps of the frame. */
  computeAlpha() {
    this.alpha = Math.min(1, this.accumulator / this.fixedStep);
    return this.alpha;
  }

  /**
   * Briefly slow time (impact feedback).
   * @param {number} duration real seconds
   * @param {number} [scale] time scale while active
   */
  hitStop(duration, scale = 0.05) {
    this._hitStopTimer = Math.max(this._hitStopTimer, duration);
    this._hitStopScale = scale;
  }
}
