/**
 * @file DebugDraw — wireframe visualisation of collision shapes, trigger
 * volumes, the player capsule, ground normal and velocity.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const COLORS = Object.freeze({
  static: 0x3ddc84,
  kinematic: 0xffd24a,
  dynamic: 0xff8a3d,
  trigger: 0x4ad2ff,
  player: 0xff4ad2,
  groundNormal: 0x7dff7d,
  velocity: 0xffffff,
});

function lineMat(color, depthTest = true) {
  return new THREE.LineBasicMaterial({ color, depthTest, transparent: !depthTest, opacity: depthTest ? 1 : 0.55 });
}

/** @param {import('../physics/Collider.js').Collider} c */
function colliderEdges(c) {
  let g;
  if (c.shape === 'box') g = new THREE.EdgesGeometry(new THREE.BoxGeometry(c.size.x, c.size.y, c.size.z));
  else if (c.shape === 'cylinder') g = new THREE.EdgesGeometry(new THREE.CylinderGeometry(c.radius, c.radius, c.height, 16), 20);
  else if (c.shape === 'sphere') g = new THREE.WireframeGeometry(new THREE.SphereGeometry(c.radius, 10, 6));
  else {
    const soup = new THREE.BufferGeometry();
    soup.setAttribute('position', new THREE.BufferAttribute(c.localTris, 3));
    g = new THREE.EdgesGeometry(soup, 1);
    soup.dispose();
  }
  return g;
}

export class DebugDraw {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {import('../physics/TriggerSystem.js').TriggerSystem} triggers
   */
  constructor(scene, physics, triggers) {
    this.scene = scene;
    this.physics = physics;
    this.triggers = triggers;
    this.group = new THREE.Group();
    this.group.name = 'DebugDraw';
    this.group.visible = false;
    scene.add(this.group);
    this._built = false;
    this._moving = [];
    this._capsuleHeight = -1;
    this.mats = {
      static: lineMat(COLORS.static, false),
      kinematic: lineMat(COLORS.kinematic, false),
      dynamic: lineMat(COLORS.dynamic, false),
      trigger: lineMat(COLORS.trigger, false),
      player: lineMat(COLORS.player, false),
    };
    this.groundArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, COLORS.groundNormal);
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, COLORS.velocity);
    this.group.add(this.groundArrow, this.velArrow);
  }

  get visible() {
    return this.group.visible;
  }

  set visible(v) {
    this.group.visible = v;
    if (v) this.rebuild();
  }

  /** Recreate static wireframes (call after world changes). */
  rebuild() {
    for (const child of [...this.group.children]) {
      if (child === this.groundArrow || child === this.velArrow) continue;
      child.geometry?.dispose();
      this.group.remove(child);
    }
    this._moving.length = 0;
    this._capsule = null;
    this._capsuleHeight = -1;

    const statics = [];
    for (const c of this.physics.collision.staticColliders) {
      const g = colliderEdges(c);
      g.applyMatrix4(c.matrix);
      statics.push(g);
    }
    if (statics.length) {
      const merged = mergeGeometries(statics, false);
      statics.forEach((g) => g.dispose());
      this.group.add(new THREE.LineSegments(merged, this.mats.static));
    }
    for (const c of this.physics.collision.moving) {
      const line = new THREE.LineSegments(colliderEdges(c), c.kind === 'kinematic' ? this.mats.kinematic : this.mats.dynamic);
      line.matrixAutoUpdate = false;
      line.renderOrder = 10;
      this.group.add(line);
      this._moving.push({ c, line });
    }
    for (const z of this.triggers.zones) {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(z.size.x, z.size.y, z.size.z)), this.mats.trigger);
      line.matrixAutoUpdate = false;
      line.matrix.copy(z.matrix);
      line.renderOrder = 10;
      this.group.add(line);
    }
    this._built = true;
  }

  /**
   * @param {import('../physics/CharacterController.js').CharacterController} ctrl
   * @param {THREE.Vector3} visualFeet interpolated feet position
   */
  update(ctrl, visualFeet) {
    if (!this.group.visible) return;
    for (const { c, line } of this._moving) {
      line.matrix.copy(c.matrix);
      if (c.shape === 'sphere') line.matrix.setPosition(c.center);
    }
    if (this._capsuleHeight !== ctrl.height) {
      if (this._capsule) {
        this._capsule.geometry.dispose();
        this.group.remove(this._capsule);
      }
      const r = ctrl.radius;
      const geo = new THREE.WireframeGeometry(new THREE.CapsuleGeometry(r, Math.max(0.01, ctrl.height - 2 * r), 4, 10));
      this._capsule = new THREE.LineSegments(geo, this.mats.player);
      this._capsule.renderOrder = 11;
      this.group.add(this._capsule);
      this._capsuleHeight = ctrl.height;
    }
    this._capsule.position.set(visualFeet.x, visualFeet.y + ctrl.height / 2, visualFeet.z);

    this.groundArrow.visible = ctrl.grounded;
    this.groundArrow.position.copy(visualFeet);
    this.groundArrow.setDirection(ctrl.groundNormal);
    const v = ctrl.velocity;
    const speed = v.length();
    this.velArrow.visible = speed > 0.05;
    if (speed > 0.05) {
      this.velArrow.position.set(visualFeet.x, visualFeet.y + ctrl.height * 0.5, visualFeet.z);
      this.velArrow.setDirection(v.clone().divideScalar(speed));
      this.velArrow.setLength(Math.min(4, speed * 0.4) + 0.2, 0.2, 0.1);
    }
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}
