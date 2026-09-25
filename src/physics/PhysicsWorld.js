/**
 * @file PhysicsWorld — owns the triangle CollisionWorld (character, camera,
 * raycasts) and a cannon-es rigid body world (props). Static and kinematic
 * shapes are mirrored into both; dynamic bodies are simulated by cannon and
 * exposed to the collision world as moving colliders.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PHYSICS } from '../data/physics.js';
import { Collider } from './Collider.js';
import { CollisionWorld } from './CollisionWorld.js';

const G = PHYSICS.groups;

/**
 * @typedef {Object} DynamicBody
 * @property {CANNON.Body} body
 * @property {Collider} collider
 * @property {THREE.Object3D|null} mesh
 * @property {THREE.Vector3} prevPos
 * @property {THREE.Quaternion} prevQuat
 * @property {THREE.Vector3} spawnPos
 * @property {THREE.Quaternion} spawnQuat
 * @property {number} mass
 * @property {string} name
 */

/**
 * @typedef {Object} KinematicBody
 * @property {Collider} collider
 * @property {CANNON.Body} body
 * @property {THREE.Object3D|null} mesh
 * @property {THREE.Vector3} prevPos
 * @property {THREE.Quaternion} prevQuat
 * @property {THREE.Vector3} pos
 * @property {THREE.Quaternion} quat
 * @property {THREE.Vector3} velocity  linear velocity of the last step
 */

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

export class PhysicsWorld {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.collision = new CollisionWorld(PHYSICS.cellSize);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = PHYSICS.allowSleep;
    world.solver.iterations = PHYSICS.solverIterations;
    world.defaultContactMaterial.friction = PHYSICS.friction;
    world.defaultContactMaterial.restitution = PHYSICS.restitution;
    this.world = world;

    /** @type {DynamicBody[]} */
    this.dynamics = [];
    /** @type {KinematicBody[]} */
    this.kinematics = [];

    this.stepMs = 0;
    this._stepDt = 1 / 60;
    this._proxyPos = new CANNON.Vec3();

    // Kinematic proxy so falling props collide with the player.
    this.playerProxy = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: G.player,
      collisionFilterMask: G.dynamic,
    });
    this.playerProxy.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, 0.32, 0));
    this.playerProxy.addShape(new CANNON.Sphere(0.3), new CANNON.Vec3(0, 1.2, 0));
    world.addBody(this.playerProxy);
  }

  // ------------------------------------------------------------ static shapes

  /**
   * Add a static box collider (and cannon mirror).
   * @param {THREE.Vector3} size
   * @param {THREE.Matrix4} matrix world transform (no scale)
   * @param {Partial<import('./Collider.js').ColliderOptions>} [opts]
   * @returns {Collider}
   */
  addStaticBox(size, matrix, opts = {}) {
    const c = this.collision.add(new Collider({ ...opts, shape: 'box', kind: 'static', size, matrix }));
    // Scenery with no rigid bodies nearby skips the cannon mirror (keeps the broadphase small).
    if (opts.rigid === false) return c;
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      collisionFilterGroup: G.static,
      collisionFilterMask: G.dynamic,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    this._applyMatrixToBody(body, matrix);
    this.world.addBody(body);
    c.userData.cannonBody = body;
    return c;
  }

  /**
   * @param {number} radius
   * @param {number} height
   * @param {THREE.Matrix4} matrix
   * @param {Partial<import('./Collider.js').ColliderOptions>} [opts]
   */
  addStaticCylinder(radius, height, matrix, opts = {}) {
    const c = this.collision.add(
      new Collider({ ...opts, shape: 'cylinder', kind: 'static', radius, height, matrix }),
    );
    if (opts.rigid === false) return c;
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      collisionFilterGroup: G.static,
      collisionFilterMask: G.dynamic,
    });
    body.addShape(new CANNON.Cylinder(radius, radius, height, PHYSICS.cylinderSegments));
    this._applyMatrixToBody(body, matrix);
    this.world.addBody(body);
    c.userData.cannonBody = body;
    return c;
  }

  /**
   * Add a static convex polyhedron (ramps, wedges).
   * @param {number[][]} vertices local vertices
   * @param {number[][]} faces CCW (seen from outside) vertex index loops
   * @param {THREE.Matrix4} matrix
   * @param {Partial<import('./Collider.js').ColliderOptions>} [opts]
   */
  addStaticConvex(vertices, faces, matrix, opts = {}) {
    const tris = [];
    for (const f of faces) {
      for (let i = 1; i < f.length - 1; i++) {
        for (const idx of [f[0], f[i], f[i + 1]]) tris.push(...vertices[idx]);
      }
    }
    const c = this.collision.add(
      new Collider({ ...opts, shape: 'mesh', kind: 'static', positions: new Float32Array(tris), matrix }),
    );
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      collisionFilterGroup: G.static,
      collisionFilterMask: G.dynamic,
    });
    body.addShape(
      new CANNON.ConvexPolyhedron({
        vertices: vertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2])),
        faces: faces.map((f) => [...f]),
      }),
    );
    this._applyMatrixToBody(body, matrix);
    this.world.addBody(body);
    c.userData.cannonBody = body;
    return c;
  }

  /**
   * Terrain heightfield for the character controller, camera and raycasts.
   * @param {Parameters<CollisionWorld['addHeightfield']>[0]} o
   */
  addHeightfield(o) {
    return this.collision.addHeightfield(o);
  }

  removeHeightfield(hf) {
    this.collision.removeHeightfield(hf);
  }

  /** Terrain height at (x, z), -Infinity when there is no terrain. */
  terrainHeight(x, z) {
    return this.collision.terrainHeight(x, z);
  }

  /** Remove any collider created by this world (region unloading). */
  removeCollider(c) {
    this.collision.remove(c);
    if (c.userData.cannonBody) this.world.removeBody(c.userData.cannonBody);
  }

  _applyMatrixToBody(body, matrix) {
    matrix.decompose(_p, _q, _s);
    body.position.set(_p.x, _p.y, _p.z);
    body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
  }

  // --------------------------------------------------------------- kinematic

  /**
   * Add a kinematic box (moving platform, rotating staircase).
   * @param {THREE.Vector3} size
   * @param {THREE.Object3D|null} mesh visual driven by this body
   * @param {THREE.Vector3} position
   * @param {THREE.Quaternion} quaternion
   * @param {Partial<import('./Collider.js').ColliderOptions>} [opts]
   * @returns {KinematicBody}
   */
  addKinematicBox(size, mesh, position, quaternion, opts = {}) {
    _m.compose(position, quaternion, _s.set(1, 1, 1));
    const collider = this.collision.add(
      new Collider({ ...opts, shape: 'box', kind: 'kinematic', size, matrix: _m }),
    );
    const body = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: G.kinematic,
      collisionFilterMask: G.dynamic,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    this.world.addBody(body);
    /** @type {KinematicBody} */
    const k = {
      collider,
      body,
      mesh,
      prevPos: position.clone(),
      prevQuat: quaternion.clone(),
      pos: position.clone(),
      quat: quaternion.clone(),
      velocity: new THREE.Vector3(),
    };
    collider.userData.kinematic = k;
    this.kinematics.push(k);
    return k;
  }

  /**
   * Move a kinematic body to a new pose for this step.
   * @param {KinematicBody} k
   * @param {THREE.Vector3} position
   * @param {THREE.Quaternion} quaternion
   */
  moveKinematic(k, position, quaternion) {
    k.prevPos.copy(k.pos);
    k.prevQuat.copy(k.quat);
    k.pos.copy(position);
    k.quat.copy(quaternion);
    k.velocity.subVectors(k.pos, k.prevPos).divideScalar(this._stepDt);
    _m.compose(k.pos, k.quat, _s.set(1, 1, 1));
    k.collider.setMatrix(_m);
  }

  /** @param {KinematicBody} k */
  removeKinematic(k) {
    const i = this.kinematics.indexOf(k);
    if (i >= 0) this.kinematics.splice(i, 1);
    this.world.removeBody(k.body);
    this.collision.remove(k.collider);
  }

  // ----------------------------------------------------------------- dynamic

  /**
   * Add a dynamic box body.
   * @param {{size:THREE.Vector3, mass:number, position:THREE.Vector3, quaternion?:THREE.Quaternion,
   *          mesh?:THREE.Object3D, surface?:string, name?:string}} o
   * @returns {DynamicBody}
   */
  addDynamicBox(o) {
    const half = new CANNON.Vec3(o.size.x / 2, o.size.y / 2, o.size.z / 2);
    return this._addDynamic(new CANNON.Box(half), { ...o, shape: 'box' });
  }

  /**
   * Add a dynamic sphere body.
   * @param {{radius:number, mass:number, position:THREE.Vector3, mesh?:THREE.Object3D,
   *          surface?:string, name?:string}} o
   * @returns {DynamicBody}
   */
  addDynamicSphere(o) {
    return this._addDynamic(new CANNON.Sphere(o.radius), { ...o, shape: 'sphere' });
  }

  _addDynamic(shape, o) {
    const quat = o.quaternion ?? new THREE.Quaternion();
    const body = new CANNON.Body({
      mass: o.mass,
      collisionFilterGroup: G.dynamic,
      collisionFilterMask: G.static | G.dynamic | G.player | G.kinematic,
      linearDamping: PHYSICS.linearDamping,
      angularDamping: PHYSICS.angularDamping,
      allowSleep: true,
      sleepSpeedLimit: PHYSICS.sleepSpeedLimit,
      sleepTimeLimit: PHYSICS.sleepTimeLimit,
    });
    body.addShape(shape);
    body.position.set(o.position.x, o.position.y, o.position.z);
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    this.world.addBody(body);

    _m.compose(o.position, quat, _s.set(1, 1, 1));
    const collider = this.collision.add(
      new Collider({
        shape: o.shape,
        kind: 'dynamic',
        size: o.size,
        radius: o.radius,
        matrix: _m,
        surface: o.surface ?? 'wood',
        name: o.name,
        cameraBlocking: false,
      }),
    );
    /** @type {DynamicBody} */
    const d = {
      body,
      collider,
      mesh: o.mesh ?? null,
      prevPos: o.position.clone(),
      prevQuat: quat.clone(),
      spawnPos: o.position.clone(),
      spawnQuat: quat.clone(),
      mass: o.mass,
      name: o.name ?? collider.name,
    };
    collider.body = d;
    this.dynamics.push(d);
    return d;
  }

  /** @param {DynamicBody} d */
  removeDynamic(d) {
    const i = this.dynamics.indexOf(d);
    if (i >= 0) this.dynamics.splice(i, 1);
    this.world.removeBody(d.body);
    this.collision.remove(d.collider);
  }

  /**
   * Shove a dynamic body horizontally (character pushing).
   * @param {DynamicBody} d
   * @param {THREE.Vector3} dir unit horizontal direction
   * @param {number} speed desired body speed along dir
   */
  pushBody(d, dir, speed) {
    const v = d.body.velocity;
    const along = v.x * dir.x + v.z * dir.z;
    if (along >= speed) return;
    const add = speed - along;
    v.x += dir.x * add;
    v.z += dir.z * add;
    d.body.wakeUp();
  }

  /**
   * Apply an impulse at the body's centre (spells, explosions).
   * @param {DynamicBody} d
   * @param {THREE.Vector3} impulse
   */
  applyImpulse(d, impulse) {
    d.body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z));
    d.body.wakeUp();
  }

  /** @param {DynamicBody} d */
  resetDynamic(d) {
    d.body.position.set(d.spawnPos.x, d.spawnPos.y, d.spawnPos.z);
    d.body.quaternion.set(d.spawnQuat.x, d.spawnQuat.y, d.spawnQuat.z, d.spawnQuat.w);
    d.body.velocity.setZero();
    d.body.angularVelocity.setZero();
    d.prevPos.copy(d.spawnPos);
    d.prevQuat.copy(d.spawnQuat);
    d.body.wakeUp();
  }

  resetAllDynamics() {
    for (const d of this.dynamics) this.resetDynamic(d);
  }

  // -------------------------------------------------------------------- step

  /**
   * Update the kinematic player proxy used by cannon.
   * @param {THREE.Vector3} feet
   * @param {THREE.Vector3} velocity
   * @param {number} radius
   * @param {number} height
   */
  syncPlayerProxy(feet, velocity, radius, height) {
    const b = this.playerProxy;
    const r = radius * 0.92;
    const s0 = /** @type {CANNON.Sphere} */ (b.shapes[0]);
    const s1 = /** @type {CANNON.Sphere} */ (b.shapes[1]);
    if (Math.abs(s0.radius - r) > 1e-4) {
      s0.radius = s1.radius = r;
      s0.updateBoundingSphereRadius();
      s1.updateBoundingSphereRadius();
    }
    b.shapeOffsets[0].set(0, radius, 0);
    b.shapeOffsets[1].set(0, Math.max(radius, height - radius), 0);
    b.updateBoundingRadius();
    b.position.set(feet.x, feet.y, feet.z);
    b.velocity.set(velocity.x, velocity.y, velocity.z);
    b.aabbNeedsUpdate = true;
  }

  /**
   * Advance the rigid body simulation one fixed step.
   * @param {number} dt
   */
  step(dt) {
    const t0 = performance.now();
    this._stepDt = dt;

    for (const d of this.dynamics) {
      d.prevPos.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.prevQuat.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    }
    // Kinematic bodies: start at the previous pose moving with the step velocity,
    // so props resting on them receive friction; snap to the exact pose afterwards.
    for (const k of this.kinematics) {
      const b = k.body;
      b.position.set(k.prevPos.x, k.prevPos.y, k.prevPos.z);
      b.quaternion.set(k.prevQuat.x, k.prevQuat.y, k.prevQuat.z, k.prevQuat.w);
      b.velocity.set(k.velocity.x, k.velocity.y, k.velocity.z);
      _q.copy(k.prevQuat).invert().premultiply(k.quat);
      _euler.setFromQuaternion(_q, 'YXZ');
      b.angularVelocity.set(_euler.x / dt, _euler.y / dt, _euler.z / dt);
    }
    const proxyPos = this._proxyPos.copy(this.playerProxy.position);

    this.world.step(dt);

    for (const k of this.kinematics) {
      k.body.position.set(k.pos.x, k.pos.y, k.pos.z);
      k.body.quaternion.set(k.quat.x, k.quat.y, k.quat.z, k.quat.w);
    }
    this.playerProxy.position.copy(proxyPos);

    for (const d of this.dynamics) {
      const b = d.body;
      if (b.position.y < PHYSICS.killPlaneY) this.resetDynamic(d);
      _p.set(b.position.x, b.position.y, b.position.z);
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      d.collider.setMatrix(_m);
    }
    this.stepMs = performance.now() - t0;
  }

  /**
   * Interpolate visuals between the last two physics states.
   * @param {number} alpha
   */
  syncVisuals(alpha) {
    for (const d of this.dynamics) {
      if (!d.mesh) continue;
      const b = d.body;
      d.mesh.position.set(b.position.x, b.position.y, b.position.z);
      d.mesh.position.lerpVectors(d.prevPos, d.mesh.position, alpha);
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      d.mesh.quaternion.slerpQuaternions(d.prevQuat, _q, alpha);
    }
    for (const k of this.kinematics) {
      if (!k.mesh) continue;
      k.mesh.position.lerpVectors(k.prevPos, k.pos, alpha);
      k.mesh.quaternion.slerpQuaternions(k.prevQuat, k.quat, alpha);
    }
  }

  // ----------------------------------------------------------------- queries

  /**
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir normalised
   * @param {number} [maxDist]
   * @param {import('./CollisionWorld.js').QueryFilter} [filter]
   * @param {import('./CollisionWorld.js').RayHit} [out]
   */
  raycast(origin, dir, maxDist = PHYSICS.maxRayDistance, filter, out) {
    return this.collision.raycast(origin, dir, maxDist, filter, out);
  }

  get stats() {
    let awake = 0;
    for (const d of this.dynamics) if (d.body.sleepState !== CANNON.Body.SLEEPING) awake++;
    return {
      ...this.collision.stats,
      dynamics: this.dynamics.length,
      awake,
      kinematics: this.kinematics.length,
      stepMs: this.stepMs,
    };
  }
}
