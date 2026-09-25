/**
 * @file Door — a hinged single or double door (wooden leaves or an iron
 * grille gate) in an arched opening. Each leaf is a kinematic box, so a
 * swinging door really pushes the player. Doors sit flush in the frame on
 * one room's side and swing into that room (local +Z). They can be locked,
 * lead out of the region (the great doors) and tell portal culling how
 * open they are.
 */
import * as THREE from 'three';
import { doorLeaf, grille } from '../../procgen/geometry/InteriorKit.js';
import { INTERIOR_KIT as IK } from '../../data/interior.js';

const Y = new THREE.Vector3(0, 1, 0);
const smooth = (t) => t * t * (3 - 2 * t);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Door {
  /**
   * @param {{physics:any, root:THREE.Object3D, mats:Record<string, THREE.Material>}} host
   * @param {{name:string, position:THREE.Vector3, yaw:number, width:number, height:number, leaves:number,
   *          open?:boolean, kind?:'wood'|'grille', lock?:{message:string}|null, exit?:boolean}} o
   *        position: centre of the opening's sill at the room-side face; yaw turns local +Z into that room
   */
  constructor(host, o) {
    this.host = host;
    this.name = o.name;
    this.position = o.position.clone();
    this.yaw = o.yaw;
    this.width = o.width;
    this.height = o.height;
    this.kind = o.kind ?? 'wood';
    this.lock = o.lock ?? null;
    this.exit = !!o.exit;
    this.open = !!o.open;
    this.t = this.open ? 1 : 0;
    /** Negative angles swing the leaves toward local +Z (into the room). */
    this.sign = -1;
    this.leaves = [];
    this.group = new THREE.Group();
    this.group.name = `Door:${o.name}`;
    host.root.add(this.group);
    const D = IK.door;
    const w = o.width;
    const h = o.height;
    const spans = o.leaves === 2 ? [[-w / 2, 0, -w / 2, 1], [0, w / 2, w / 2, -1]] : [[-w / 2, w / 2, -w / 2, 1]];
    for (const [x0, x1, hinge, dir] of spans) {
      const leafW = Math.abs(x1 - x0) - 0.02;
      const rectH = this.kind === 'grille' ? h : h * 0.82;
      const mesh = new THREE.Group();
      if (this.kind === 'grille') {
        const g = grille(leafW, h, 0.024, 0.14);
        g.translate(dir > 0 ? 0 : -leafW, 0, 0);
        mesh.add(new THREE.Mesh(g, host.mats.ironMoving));
      } else {
        const { planks, iron } = doorLeaf(w, h, x0 + 0.01 * dir, x1 - 0.01 * dir, hinge);
        mesh.add(new THREE.Mesh(planks, host.mats.woodMoving), new THREE.Mesh(iron, host.mats.ironMoving));
      }
      for (const m of mesh.children) m.castShadow = m.receiveShadow = true;
      this.group.add(mesh);
      // Kinematic collider covering the rectangular part of the leaf.
      const size = new THREE.Vector3(leafW, rectH, D.thickness + 0.04);
      const offset = new THREE.Vector3((dir * leafW) / 2, rectH / 2, 0);
      const leaf = { mesh, dir, hingeLocal: new THREE.Vector3(hinge, 0, 0), offset, body: null, size };
      this._pose(leaf, this._angle(leaf));
      leaf.body = host.physics.addKinematicBox(size, null, _p.clone(), _q.clone(), { surface: this.kind === 'grille' ? 'metal' : 'wood', name: this.name });
      this.leaves.push(leaf);
    }
    this._sync();
  }

  _angle(leaf) {
    return leaf.dir * this.sign * IK.door.openAngle * smooth(this.t);
  }

  /** Leaf pose → _p (body centre), _q (rotation); also moves the mesh. */
  _pose(leaf, angle) {
    _q.setFromAxisAngle(Y, this.yaw);
    _q2.setFromAxisAngle(Y, angle);
    const rot = _q.clone().multiply(_q2);
    const hinge = _v.copy(leaf.hingeLocal).applyQuaternion(_q).add(this.position);
    leaf.mesh.position.copy(hinge);
    leaf.mesh.quaternion.copy(rot);
    _p.copy(leaf.offset).applyQuaternion(rot).add(hinge);
    _q.copy(rot);
  }

  _sync() {
    for (const leaf of this.leaves) {
      this._pose(leaf, this._angle(leaf));
      if (leaf.body) this.host.physics.moveKinematic(leaf.body, _p, _q);
    }
  }

  /** How open (0 closed … 1 open), for portal culling. */
  get openness() {
    return this.t;
  }

  /** Interaction prompt. */
  get label() {
    if (this.exit) return 'Dışarı çık';
    return this.open ? 'Kapıyı kapat' : 'Kapıyı aç';
  }

  /**
   * Toggle the door.
   * @returns {{ok:boolean, message?:string}}
   */
  use() {
    if (this.lock) return { ok: false, message: this.lock.message };
    this.open = !this.open;
    return { ok: true };
  }

  /** Unlock (spells in Phase 7). */
  unlock() {
    this.lock = null;
  }

  /** @param {number} dt fixed step */
  step(dt) {
    const target = this.open ? 1 : 0;
    const speed = IK.door.speed;
    const before = this.t;
    this.t += THREE.MathUtils.clamp(target - this.t, -speed * dt, speed * dt);
    if (this.t !== before || this.leaves[0].body.velocity.lengthSq() > 0) this._sync();
  }

  dispose() {
    for (const leaf of this.leaves) {
      this.host.physics.removeKinematic(leaf.body);
      leaf.mesh.traverse((o) => o.geometry?.dispose());
    }
    this.group.removeFromParent();
  }
}
