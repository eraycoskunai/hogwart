/**
 * @file MovingStaircases — the Staircase Tower's flights. Every flight spans
 * one level (bottom edge on one side of the shaft, top edge on the opposite
 * side of the next level) and turns 90° around the shaft's axis on a shared
 * timetable, so the connections between balconies change: sometimes a
 * flight leads to a doorway, sometimes it ends in mid-air. The ramp and its
 * balustrades are kinematic bodies, so a rider is carried round with it.
 */
import * as THREE from 'three';
import { flight } from '../../procgen/geometry/InteriorKit.js';
import { applyWorldUVs } from '../../procgen/geometry/StaticBatcher.js';
import { INTERIOR_MATERIALS } from '../../data/interior.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const smooth = (t) => t * t * (3 - 2 * t);
const HEADINGS = ['kuzey', 'doğu', 'güney', 'batı'];
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _p = new THREE.Vector3();

export class MovingStaircases {
  /**
   * @param {{physics:any, root:THREE.Object3D, mats:Record<string, THREE.Material>, bus:any}} host
   * @param {any} spec cell.staircases
   * @param {number[]} levels floor heights
   */
  constructor(host, spec, levels) {
    this.host = host;
    this.spec = spec;
    this.levels = levels;
    this.phase = 0;
    this.t = 0;
    this.timer = spec.pause;
    this.rotating = false;
    this.flights = [];
    const pitch = Math.atan2(spec.rise, spec.run);
    const len = Math.hypot(spec.rise, spec.run);
    this.pitch = new THREE.Quaternion().setFromAxisAngle(X, pitch);
    const geo = flight(spec.width, spec.rise, spec.run, spec.steps, spec.thickness, spec.rail);
    // Object-space box-projected UVs (the flights move, world mapping would swim).
    applyWorldUVs(geo.stone, INTERIOR_MATERIALS.stoneMoving.tile);
    applyWorldUVs(geo.wood, INTERIOR_MATERIALS.woodMoving.tile);
    this.geometries = [geo.stone, geo.wood];
    for (const f of spec.flights) {
      const group = new THREE.Group();
      group.name = `Merdiven ${f.level}`;
      const stone = new THREE.Mesh(geo.stone, host.mats.stoneMoving);
      const wood = new THREE.Mesh(geo.wood, host.mats.woodMoving);
      stone.castShadow = stone.receiveShadow = wood.castShadow = true;
      group.add(stone, wood);
      host.root.add(group);
      const center = new THREE.Vector3(spec.center[0], levels[f.level] + spec.rise / 2, spec.center[1]);
      // Bodies in the flight frame: the ramp under the steps and two balustrades.
      const parts = [
        { size: new THREE.Vector3(spec.width, spec.thickness, len), offset: new THREE.Vector3(0, -spec.thickness / 2, 0), name: 'Hareketli merdiven' },
        { size: new THREE.Vector3(0.12, spec.rail, len), offset: new THREE.Vector3(-spec.width / 2 + 0.06, spec.rail / 2, 0), name: 'Merdiven korkuluğu' },
        { size: new THREE.Vector3(0.12, spec.rail, len), offset: new THREE.Vector3(spec.width / 2 - 0.06, spec.rail / 2, 0), name: 'Merdiven korkuluğu' },
      ];
      const fl = { spec: f, group, center, heading: f.heading, yaw: 0, prevYaw: 0, parts };
      fl.yaw = fl.prevYaw = this._yawFor(f.heading);
      for (const part of parts) {
        this._partPose(fl, part, fl.yaw);
        part.body = host.physics.addKinematicBox(part.size, null, _p.clone(), _q.clone(), { surface: 'stone', name: part.name });
      }
      this.flights.push(fl);
      this._placeGroup(fl, fl.yaw);
    }
  }

  /** Heading index (0 north … 3 west, the rising direction) → yaw of the flight frame. */
  _yawFor(h) {
    return (-h * Math.PI) / 2;
  }

  _partPose(fl, part, yaw) {
    _q.setFromAxisAngle(Y, yaw).multiply(this.pitch);
    _p.copy(part.offset).applyQuaternion(_q).add(fl.center);
  }

  _placeGroup(fl, yaw) {
    fl.group.position.copy(fl.center);
    fl.group.quaternion.setFromAxisAngle(Y, yaw);
  }

  /** @param {number} dt fixed step */
  step(dt) {
    const S = this.spec;
    let k = 0;
    if (!this.rotating) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.rotating = true;
        this.t = 0;
        this.host.bus?.emit('stairs:moving', {});
      }
    }
    if (this.rotating) {
      this.t += dt / S.rotateTime;
      if (this.t >= 1) {
        this.rotating = false;
        this.phase = (this.phase + 1) % 4;
        this.timer = S.pause;
        this.t = 0;
        k = 0;
      } else k = smooth(this.t);
    }
    for (const fl of this.flights) {
      fl.prevYaw = fl.yaw;
      fl.yaw = this._yawFor(fl.heading + this.phase + k);
      for (const part of fl.parts) {
        this._partPose(fl, part, fl.yaw);
        this.host.physics.moveKinematic(part.body, _p, _q);
      }
    }
  }

  /** Interpolated visuals. @param {number} alpha */
  render(alpha) {
    for (const fl of this.flights) {
      let d = fl.yaw - fl.prevYaw;
      if (Math.abs(d) > Math.PI) d = 0;
      this._placeGroup(fl, fl.prevYaw + d * alpha);
    }
  }

  /** Seconds until the next turn (0 while turning). */
  get nextTurn() {
    return this.rotating ? 0 : this.timer;
  }

  get debugState() {
    const f = this.flights.map((fl) => `${fl.spec.level}→${fl.spec.level + 1}: ${HEADINGS[(fl.heading + this.phase) % 4]}`).join(' · ');
    return `${this.rotating ? 'dönüyor' : `${this.timer.toFixed(0)} sn`} · ${f}`;
  }

  dispose() {
    for (const fl of this.flights) {
      for (const part of fl.parts) this.host.physics.removeKinematic(part.body);
      fl.group.removeFromParent();
    }
    for (const g of this.geometries) g.dispose();
  }
}
