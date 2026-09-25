/**
 * @file Props — the smaller set pieces of the grounds: iron lamp posts
 * along paths and on the viaduct (pooled flickering lights at night), the
 * Quidditch pitch (field markings, three goal hoops at each end, stands
 * draped in house colours) and the keeper's round stone hut with a thatched
 * roof, chimney smoke, a pumpkin patch and a paling fence.
 */
import * as THREE from 'three';
import { PITCH, HUT, GROUND_LAMPS } from '../../data/grounds.js';
import { HOUSES } from '../../data/character.js';
import { block, coneRoof, door, merge } from '../../procgen/geometry/CastleKit.js';

const LAMP = Object.freeze({ post: 3.2, intensity: 14, distance: 17, glassY: 0.17 });
/** Night factor above which lamps light up. */
const LAMPS_ON = 0.3;

function M(x, y, z, yaw = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), new THREE.Vector3(1, 1, 1));
}

/** Soft round smoke puff texture. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(200,200,205,0.55)');
  grad.addColorStop(1, 'rgba(200,200,205,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Props {
  /**
   * @param {{physics:any, lights:any, library:any, batcher:any, root:THREE.Group, heightAt:(x:number, z:number)=>number,
   *          materials:Record<string, THREE.Material>}} o
   */
  constructor(o) {
    this.o = o;
    this.colliders = [];
    this.sources = [];
    this.owned = [];
    this.smoke = [];
  }

  /** @param {number[][]} extraLamps [x, y, z] (castle gates, viaduct) */
  build(extraLamps) {
    this._lamps(extraLamps);
    this._pitch();
    this._hut();
    return this;
  }

  _add(geo, matrix, mat, tile = 2) {
    this.o.batcher.add(geo, matrix, this.o.materials[mat], tile);
    geo.dispose();
  }

  // ---------------------------------------------------------------- lamps

  _lamps(extra) {
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc27a, emissiveIntensity: 0.2, roughness: 0.2 });
    this.glassMat = glassMat;
    this.owned.push(glassMat);
    const glassGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.34, 6);
    this.owned.push(glassGeo);
    const places = [
      ...GROUND_LAMPS.map(([x, z]) => [x, this.o.heightAt(x, z), z, true]),
      ...extra.map(([x, y, z]) => [x, y, z, false]),
    ];
    for (const [x, y, z, post] of places) {
      if (post) {
        const p = new THREE.CylinderGeometry(0.06, 0.09, LAMP.post, 10);
        p.translate(0, LAMP.post / 2, 0);
        this._add(p, M(x, y, z), 'iron');
        const b = new THREE.CylinderGeometry(0.22, 0.28, 0.16, 10);
        b.translate(0, 0.08, 0);
        this._add(b, M(x, y, z), 'iron');
        this.colliders.push(this.o.physics.addStaticCylinder(0.12, LAMP.post, M(x, y + LAMP.post / 2, z), { surface: 'metal', name: 'lamba', cameraBlocking: false, rigid: false }));
      }
      const top = post ? y + LAMP.post : y;
      const cap = new THREE.ConeGeometry(0.22, 0.2, 6);
      cap.translate(0, top + 0.44, 0);
      this._add(cap, M(x, 0, z), 'iron');
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(x, top + LAMP.glassY, z);
      this.o.root.add(glass);
      this.sources.push(this.o.lights.add({ position: [x, top + LAMP.glassY, z], color: 0xffc27a, intensity: LAMP.intensity, distance: LAMP.distance, flicker: 'lamp' }));
    }
  }

  // ---------------------------------------------------------------- pitch

  _pitch() {
    const P = PITCH;
    const [cx, cz] = P.center;
    const gy = this.o.heightAt(cx, cz);
    // Field markings: an oval line and the centre circle.
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e6da, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    this.owned.push(lineMat);
    const ring = (rx, rz, w) => {
      const pts = [];
      const n = 96;
      const pos = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.cos(a);
        const z = Math.sin(a);
        for (const s of [-1, 1]) {
          const px = cx + x * (rx + s * w);
          const pz = cz + z * (rz + s * w);
          pos.push(px, this.o.heightAt(px, pz) + 0.04, pz);
        }
      }
      for (let k = 0; k < n; k++) pts.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(pts);
      g.computeVertexNormals();
      this.owned.push(g);
      const m = new THREE.Mesh(g, lineMat);
      m.receiveShadow = true;
      this.o.root.add(m);
    };
    ring(P.radii[0], P.radii[1], 0.25);
    ring(9, 9, 0.2);
    // Goal hoops.
    for (const end of [-1, 1]) {
      P.hoopHeights.forEach((h, k) => {
        const x = cx + end * (P.radii[0] - 8);
        const z = cz + (k - 1) * P.hoopSpacing;
        const y = this.o.heightAt(x, z);
        const pole = new THREE.CylinderGeometry(0.12, 0.16, h, 10);
        pole.translate(0, h / 2, 0);
        this._add(pole, M(x, y, z), 'gold', 0);
        const hoop = new THREE.TorusGeometry(P.hoopRadius, 0.1, 8, 32);
        hoop.rotateY(Math.PI / 2);
        hoop.translate(0, h + P.hoopRadius, 0);
        this._add(hoop, M(x, y, z), 'gold', 0);
        this.colliders.push(this.o.physics.addStaticCylinder(0.16, h, M(x, y + h / 2, z), { surface: 'metal', name: 'Kale direği', rigid: false }));
      });
    }
    // Stands: timber towers wrapped in house colours, with a spire roof.
    const houses = Object.keys(HOUSES).filter((h) => h !== 'none');
    const [sw, sd] = P.standSize;
    for (let k = 0; k < P.standCount; k++) {
      const a = (k / P.standCount) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * (P.radii[0] + P.standRadiusPad);
      const z = cz + Math.sin(a) * (P.radii[1] + P.standRadiusPad);
      const y = this.o.heightAt(x, z);
      const yaw = Math.atan2(cx - x, cz - z);
      const H = P.standHeight;
      const m = M(x, y, z, yaw);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = block(0.4, H, 0.4);
        post.translate((lx * sw) / 2, 0, (lz * sd) / 2);
        this._add(post, m, 'wood');
      }
      const deck = block(sw + 0.6, 0.3, sd + 0.6);
      deck.translate(0, H - 2.4, 0);
      this._add(deck, m, 'wood');
      const cloth = block(sw + 0.2, H - 3, sd + 0.2);
      cloth.translate(0, 0.4, 0);
      this._add(cloth, m, `tapestry:${houses[k % houses.length]}`, 0);
      const roof = coneRoof(Math.max(sw, sd) * 0.62, 4, 4);
      roof.rotateY(Math.PI / 4);
      roof.translate(0, H, 0);
      this._add(roof, m, 'roof', 0);
      this.colliders.push(this.o.physics.addStaticBox(new THREE.Vector3(sw + 0.4, H, sd + 0.4), M(x, y + H / 2, z, yaw), { surface: 'wood', name: 'Tribün', rigid: false }));
    }
    void gy;
  }

  // ------------------------------------------------------------------ hut

  _hut() {
    const Hc = HUT;
    const [cx, cz] = Hc.center;
    const y = this.o.heightAt(cx, cz);
    const walls = new THREE.CylinderGeometry(Hc.radius, Hc.radius * 1.05, Hc.wallHeight + 0.6, 24, 3);
    walls.translate(0, (Hc.wallHeight + 0.6) / 2 - 0.6, 0);
    this._add(walls, M(cx, y, cz), 'hutStone', 1.4);
    const roof = coneRoof(Hc.radius + 0.2, Hc.roofHeight, 24);
    this._add(roof, M(cx, y + Hc.wallHeight, cz), 'thatch', 0);
    // Door facing the castle (east).
    const { planks, straps } = door(Hc.door[0], Hc.door[1]);
    const dm = M(cx + Hc.radius + 0.02, y, cz, Math.PI / 2);
    this._add(planks, dm, 'wood', 0);
    this._add(straps, dm, 'iron');
    // Chimney and smoke.
    const ch = block(0.9, Hc.wallHeight + Hc.roofHeight * 0.6, 0.9);
    this._add(ch, M(cx - Hc.radius * 0.45, y, cz - Hc.radius * 0.45), 'hutStone', 1.4);
    this.chimneyTop = new THREE.Vector3(cx - Hc.radius * 0.45, y + Hc.wallHeight + Hc.roofHeight * 0.6 + 0.2, cz - Hc.radius * 0.45);
    const puff = puffTexture();
    this.owned.push(puff);
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: true }));
      this.owned.push(s.material);
      s.userData.age = (k / 14) * Hc.smoke.life;
      this.o.root.add(s);
      this.smoke.push(s);
    }
    this.colliders.push(this.o.physics.addStaticCylinder(Hc.radius * 1.03, Hc.wallHeight + 1, M(cx, y + (Hc.wallHeight + 1) / 2 - 0.5, cz), { surface: 'stone', name: 'Kulübe', rigid: false }));
    // Pumpkin patch.
    const pumpkin = new THREE.SphereGeometry(0.45, 14, 10);
    const pp = pumpkin.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const px = pp.getX(i), py = pp.getY(i), pz = pp.getZ(i);
      const a = Math.atan2(px, pz);
      const rib = 1 + 0.07 * Math.cos(a * 8);
      pp.setXYZ(i, px * rib * 1.1, py * 0.72, pz * rib * 1.1);
    }
    pumpkin.computeVertexNormals();
    const stalk = new THREE.CylinderGeometry(0.04, 0.06, 0.2, 6);
    stalk.translate(0, 0.38, 0);
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0xd9761c, roughness: 0.55 });
    this.owned.push(pumpMat, pumpkin);
    for (let k = 0; k < Hc.pumpkins; k++) {
      const px = cx + 7 + (k % 3) * 1.6 + Math.sin(k * 7.1) * 0.4;
      const pz = cz + 4 + Math.floor(k / 3) * 1.7 + Math.cos(k * 3.3) * 0.4;
      const s = 0.8 + ((k * 37) % 10) / 10 * 0.9;
      const mesh = new THREE.Mesh(pumpkin, pumpMat);
      mesh.position.set(px, this.o.heightAt(px, pz) + 0.3 * s, pz);
      mesh.scale.setScalar(s);
      mesh.castShadow = mesh.receiveShadow = true;
      this.o.root.add(mesh);
      this._add(stalk.clone(), M(px, this.o.heightAt(px, pz) + 0.3 * s - 0.05, pz), 'wood');
    }
    stalk.dispose();
    // Paling fence arc.
    const F = Hc.fence;
    const pales = [];
    for (let k = 0; k < F.posts; k++) {
      const a = -F.arc / 2 + (k / (F.posts - 1)) * F.arc;
      const px = cx + Math.cos(a) * F.radius;
      const pz = cz + Math.sin(a) * F.radius;
      const g = block(0.12, 1.1, 0.08);
      g.applyMatrix4(M(px, this.o.heightAt(px, pz), pz, -a));
      pales.push(g);
    }
    this._add(merge(pales), new THREE.Matrix4(), 'wood');
  }

  /**
   * @param {number} dt
   * @param {number} night 0..1
   * @param {THREE.Vector2} wind
   */
  update(dt, night, wind) {
    const on = night > LAMPS_ON;
    for (const s of this.sources) s.enabled = on;
    const lead = this.sources[0];
    this.glassMat.emissiveIntensity = on && lead ? 2.4 * lead.level : 0.2;
    const S = HUT.smoke;
    for (const s of this.smoke) {
      s.userData.age += dt;
      if (s.userData.age > S.life) s.userData.age -= S.life;
      const t = s.userData.age / S.life;
      s.position.copy(this.chimneyTop);
      s.position.y += t * S.life * S.rise;
      s.position.x += wind.x * t * S.life * 0.6 + Math.sin(t * 6 + s.id) * 0.3;
      s.position.z += wind.y * t * S.life * 0.6;
      s.scale.setScalar(0.6 + t * 3.5);
      s.material.opacity = Math.sin(t * Math.PI) * 0.8;
    }
  }

  dispose() {
    for (const c of this.colliders) this.o.physics.removeCollider(c);
    for (const s of this.sources) this.o.lights.remove(s);
    for (const r of this.owned) r.dispose();
  }
}
