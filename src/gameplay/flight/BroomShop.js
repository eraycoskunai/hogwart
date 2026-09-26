/**
 * @file BroomShop — a wooden stall by the Quidditch pitch: counter, awning,
 * a rack showing every broom model for sale and an original shopkeeper.
 * Talking to her (E) opens the catalogue: buy with Galleons or switch to a
 * broom you already own.
 *
 * Events: shop:bought {id}, shop:equipped {id}
 */
import * as THREE from 'three';
import { SHOP, BROOMS } from '../../data/flight.js';
import { buildBroom } from '../../procgen/geometry/BroomKit.js';
import { Character } from '../../procgen/characters/Character.js';
import { Animator } from '../../animation/Animator.js';
import { FaceAnimator } from '../../animation/FaceAnimator.js';
import { randomAppearance, mulberry } from '../../procgen/characters/Appearance.js';

/** Stall proportions (m). */
const STALL = Object.freeze({ counter: 1.05, post: 0.12, awning: 0.9, stripe: 6 });
const _v = new THREE.Vector3();

export class BroomShop {
  /**
   * @param {{scene:THREE.Scene, physics:any, library:any, preset:any, bus:any, interactions:any, inventory:import('../Inventory.js').Inventory,
   *          heightAt:(x:number,z:number)=>number, choose:(t:string,x:string,o:any[])=>Promise<string|null>, say:(n:string,t:string)=>void, notice:(t:string)=>void}} o
   */
  constructor(o) {
    this.o = o;
    this.root = new THREE.Group();
    this.root.name = SHOP.name;
    o.scene.add(this.root);
    const [x, z] = SHOP.pos;
    const y = o.heightAt(x, z);
    this.base = new THREE.Vector3(x, y, z);
    this.root.position.copy(this.base);
    this.root.rotation.y = SHOP.yaw;
    this.colliders = [];
    this.geos = [];
    this.mats = [];
    this.brooms = [];
    this._buildStall();
    this._buildKeeper();
    this.item = o.interactions.add({
      id: 'broom-shop',
      position: this._world(0, 1.2, -0.2),
      radius: 3.4,
      label: `${SHOP.name}: süpürgelere bak`,
      action: () => this.open(),
    });
  }

  /** Stall-local → world. */
  _world(lx, ly, lz) {
    return new THREE.Vector3(lx, ly, lz).applyAxisAngle(_v.set(0, 1, 0), SHOP.yaw).add(this.base);
  }

  _mat(opts) {
    const m = new THREE.MeshStandardMaterial(opts);
    this.mats.push(m);
    return m;
  }

  _box(w, h, d, lx, ly, lz, mat, solid = true) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    this.root.add(m);
    if (solid) {
      m.updateWorldMatrix(true, false);
      this.colliders.push(this.o.physics.addStaticBox(new THREE.Vector3(w, h, d), m.matrixWorld.clone(), { surface: 'wood', name: 'Tezgâh' }));
    }
    return m;
  }

  _buildStall() {
    const [W, H, D] = SHOP.size;
    const wood = this._mat({ color: '#6a4a2e', roughness: 0.8 });
    const dark = this._mat({ color: '#3e2a1a', roughness: 0.85 });
    // Counter facing +Z (the customer side); the keeper stands behind it.
    this._box(W, STALL.counter, 0.7, 0, STALL.counter / 2, 0.6, wood);
    this._box(W + 0.1, 0.06, 0.8, 0, STALL.counter + 0.03, 0.6, dark, false);
    // Back wall and sides.
    this._box(W, H, 0.15, 0, H / 2, -D / 2, dark);
    for (const s of [-1, 1]) this._box(0.15, H, D, (s * W) / 2, H / 2, 0, dark);
    for (const s of [-1, 1]) this._box(STALL.post, H + 0.6, STALL.post, (s * W) / 2, (H + 0.6) / 2, D / 2 + 0.1, wood);
    // Striped canvas awning (alternating colours).
    const n = STALL.stripe;
    const red = this._mat({ color: '#8e2a22', roughness: 0.9, side: THREE.DoubleSide });
    const cream = this._mat({ color: '#e6d6b0', roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const g = new THREE.PlaneGeometry(W / n, D + STALL.awning);
      this.geos.push(g);
      const m = new THREE.Mesh(g, i % 2 ? red : cream);
      m.rotation.x = -Math.PI / 2 + 0.28;
      m.position.set(-W / 2 + (i + 0.5) * (W / n), H + 0.35, STALL.awning / 2 - 0.1);
      m.castShadow = true;
      this.root.add(m);
    }
    // Sign board.
    const sign = this._box(W * 0.7, 0.5, 0.06, 0, H + 1, D / 2 + 0.12, this._signMaterial(), false);
    sign.castShadow = false;
    // Rack of brooms on the back wall, one per model.
    const ids = Object.keys(BROOMS);
    ids.forEach((id, i) => {
      const b = buildBroom(BROOMS[id], 31 + i * 7);
      b.group.rotation.set(0, Math.PI / 2, 0.08);
      b.group.position.set(-W / 2 + 0.8 + (i * (W - 1.6)) / Math.max(1, ids.length - 1), 1.3 + (i % 2) * 0.55, -D / 2 + 0.25);
      b.group.scale.setScalar(0.85);
      this.root.add(b.group);
      this.brooms.push(b);
    });
  }

  /** Painted shop sign (canvas texture). */
  _signMaterial() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#2a1a10';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 84);
    g.fillStyle = '#f0d489';
    g.font = 'bold 40px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(SHOP.name, 256, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;
    return this._mat({ map: tex, roughness: 0.8 });
  }

  _buildKeeper() {
    const K = SHOP.keeper;
    const rnd = mulberry(K.seed);
    const lib = this.o.library;
    this.keeper = new Character({ library: lib, preset: { ...this.o.preset, characterTexture: Math.min(512, this.o.preset.characterTexture) }, name: K.name });
    this.keeper.build({ firstName: 'Ferda', lastName: 'Rüzgârgülü', house: 'none', outfit: 'quidditch', appearance: randomAppearance(rnd) });
    this.keeperPos = this._world(0, 0, -0.6);
    this.keeper.root.position.copy(this.keeperPos);
    this.keeper.root.rotation.y = SHOP.yaw + Math.PI;
    this.o.scene.add(this.keeper.root);
    this.face = new FaceAnimator(this.keeper);
    this.animator = new Animator(this.keeper, this.face);
    this.animator.ikEnabled = false;
  }

  /** The catalogue dialog. */
  async open() {
    const inv = this.o.inventory;
    this.o.say(SHOP.keeper.name, SHOP.greeting);
    this.face.say(SHOP.greeting, 1.3);
    this.animator.play('wave');
    const options = Object.entries(BROOMS).map(([id, b]) => {
      const stats = `hız ${b.speed} · ivme ${b.accel} · manevra ${b.handling}`;
      if (inv.broom === id) return { id, label: `${b.name} — kullanılıyor (${stats})` };
      if (inv.owns(id)) return { id, label: `${b.name} — senin, kullan (${stats})` };
      return { id, label: `${b.name} — ${b.price} Galleon (${stats})` };
    });
    const pick = await this.o.choose(SHOP.name, `Kesende ${inv.galleons} Galleon var. Hangisi?`, options);
    if (!pick || !this.root.parent) return;
    const b = BROOMS[pick];
    if (inv.owns(pick)) {
      inv.equip(pick);
      this.o.notice(`${b.name} artık süpürgen.`);
      this.o.bus.emit('shop:equipped', { id: pick });
      return;
    }
    const r = inv.buy(pick);
    if (r === 'poor') {
      const line = `${b.name} için ${b.price - inv.galleons} Galleon daha lazım. Yarışlar ve maçlar iyi para kazandırır!`;
      this.o.say(SHOP.keeper.name, line);
      return;
    }
    this.o.say(SHOP.keeper.name, `${b.name} artık senin! ${b.blurb}`);
    this.o.bus.emit('shop:bought', { id: pick });
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, wind:THREE.Vector3, playerHead:THREE.Vector3, player:THREE.Vector3}} env
   */
  render(dt, env) {
    const d = env.player.distanceTo(this.keeperPos);
    this.keeper.root.visible = d < 120;
    if (d > 120) return;
    this.face.setExpression(d < 6 ? 'smile' : 'neutral');
    this.face.update(dt);
    this.animator.update(dt, {
      speed: 0, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: 0, accel: 0, climb: 0, sliding: false,
      lookTarget: d < 8 ? env.playerHead : null, aimTarget: null, ground: null,
    });
    this.keeper.update(dt, { camera: env.camera, wind: env.wind, groundY: this.keeperPos.y });
  }

  dispose() {
    this.o.interactions.remove(this.item);
    for (const c of this.colliders) this.o.physics.removeCollider(c);
    for (const b of this.brooms) b.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex?.dispose();
    this.keeper.dispose();
    this.keeper.root.removeFromParent();
    this.root.removeFromParent();
  }
}
