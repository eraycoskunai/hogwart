/**
 * @file CinematicCamera — plays spline camera shots (Catmull–Rom paths for
 * both the eye and the look target) with easing and optional FOV animation.
 */
import * as THREE from 'three';

/**
 * @typedef {Object} CinematicShot
 * @property {number[][]} points   camera path control points
 * @property {number[][]} look     look-at path control points
 * @property {number} duration     seconds
 * @property {number} [fovStart]
 * @property {number} [fovEnd]
 * @property {string} [id]
 */

export class CinematicCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(camera, bus) {
    this.camera = camera;
    this.bus = bus;
    this.active = false;
    this.t = 0;
    /** @type {CinematicShot|null} */
    this.shot = null;
    this._path = null;
    this._look = null;
    this._lookAt = new THREE.Vector3();
  }

  /** @param {CinematicShot} shot */
  play(shot) {
    const toVecs = (arr) => arr.map((p) => new THREE.Vector3().fromArray(p));
    this._path = new THREE.CatmullRomCurve3(toVecs(shot.points), false, 'centripetal');
    this._look = new THREE.CatmullRomCurve3(toVecs(shot.look), false, 'centripetal');
    this.shot = shot;
    this.t = 0;
    this.active = true;
    this.bus.emit('cinematic:start', { id: shot.id });
  }

  /** End immediately. */
  skip() {
    if (!this.active) return;
    this.t = this.shot.duration;
    this._finish();
  }

  _finish() {
    this.active = false;
    const id = this.shot?.id;
    this.shot = null;
    this.bus.emit('cinematic:end', { id });
  }

  /**
   * @param {number} dt
   * @returns {boolean} whether the cinematic is still controlling the camera
   */
  update(dt) {
    if (!this.active) return false;
    const s = this.shot;
    this.t += dt;
    const raw = Math.min(1, this.t / s.duration);
    const k = raw * raw * (3 - 2 * raw); // ease in-out
    this._path.getPointAt(k, this.camera.position);
    this._look.getPointAt(k, this._lookAt);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._lookAt);
    if (s.fovStart != null && s.fovEnd != null) {
      this.camera.fov = THREE.MathUtils.lerp(s.fovStart, s.fovEnd, k);
    }
    this.camera.updateProjectionMatrix();
    if (raw >= 1) this._finish();
    return true;
  }

  /** Progress 0..1 (for letterbox animation). */
  get progress() {
    return this.shot ? Math.min(1, this.t / this.shot.duration) : 1;
  }
}
