/**
 * @file Movers — drive kinematic bodies along scripted motion: waypoint
 * paths (elevators, sliding platforms) and stepped rotations (the
 * prototype of Hogwarts' moving staircases).
 */
import * as THREE from 'three';

const smooth = (t) => t * t * (3 - 2 * t);
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3(0, 1, 0);

/**
 * Moves through absolute waypoints with eased segments and waits at each stop.
 */
export class PathMover {
  /**
   * @param {import('../physics/PhysicsWorld.js').KinematicBody} body
   * @param {{points:number[][], speed:number, wait:number, loop?:'pingpong'|'cycle'}} cfg
   */
  constructor(body, cfg) {
    this.body = body;
    this.points = cfg.points.map((p) => new THREE.Vector3().fromArray(p));
    this.speed = cfg.speed;
    this.wait = cfg.wait;
    this.loop = cfg.loop ?? 'pingpong';
    this.index = 0;
    this.dir = 1;
    this.t = 0;
    this.waitTimer = cfg.wait;
    this.quat = body.quat.clone();
  }

  _next() {
    let n = this.index + this.dir;
    if (n >= this.points.length || n < 0) {
      if (this.loop === 'cycle') n = n < 0 ? this.points.length - 1 : 0;
      else {
        this.dir *= -1;
        n = this.index + this.dir;
      }
    }
    return n;
  }

  /** @param {number} dt @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics */
  step(dt, physics) {
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      physics.moveKinematic(this.body, this.points[this.index], this.quat);
      return;
    }
    const nextIndex = this._next();
    const a = this.points[this.index];
    const b = this.points[nextIndex];
    const duration = Math.max(0.05, a.distanceTo(b) / this.speed);
    this.t += dt / duration;
    if (this.t >= 1) {
      this.t = 0;
      this.index = nextIndex;
      this.waitTimer = this.wait;
      physics.moveKinematic(this.body, b, this.quat);
      return;
    }
    _pos.lerpVectors(a, b, smooth(this.t));
    physics.moveKinematic(this.body, _pos, this.quat);
  }

  /** Debug description. */
  get debugState() {
    return this.waitTimer > 0 ? `bekliyor @${this.index}` : `hareket ${this.index}→${this._next()}`;
  }
}

/**
 * Rotates around a vertical axis in discrete steps with pauses.
 */
export class RotateMover {
  /**
   * @param {import('../physics/PhysicsWorld.js').KinematicBody} body
   * @param {{stepDeg:number, rotateTime:number, pause:number}} cfg
   */
  constructor(body, cfg) {
    this.body = body;
    this.step_ = THREE.MathUtils.degToRad(cfg.stepDeg);
    this.rotateTime = cfg.rotateTime;
    this.pause = cfg.pause;
    this.angle = 0;
    this.from = 0;
    this.t = 0;
    this.pauseTimer = cfg.pause;
    this.base = body.quat.clone();
    this.center = body.pos.clone();
  }

  /** @param {number} dt @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics */
  step(dt, physics) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
    } else {
      this.t += dt / this.rotateTime;
      if (this.t >= 1) {
        this.t = 0;
        this.from += this.step_;
        this.angle = this.from;
        this.pauseTimer = this.pause;
      } else {
        this.angle = this.from + this.step_ * smooth(this.t);
      }
    }
    _q.setFromAxisAngle(_axis, this.angle).multiply(this.base);
    physics.moveKinematic(this.body, this.center, _q);
  }

  get debugState() {
    return this.pauseTimer > 0 ? 'duraklıyor' : 'dönüyor';
  }
}
