/**
 * @file SpellVisuals — meshes and shaders for spell effects that are not
 * particles or trails: the Protego bubble (fresnel + impact ripples),
 * explosion flashes, shockwave rings, the Leviosa beam, ice (shells and
 * floating floes), status shells for struck targets and the glowing
 * Patronus animal. Transient pieces live in small pools animated by
 * `update(dt)`.
 */
import * as THREE from 'three';

const FRESNEL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

const SHIELD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform vec4 uHit;      // local hit direction + age
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec3 d = normalize(vP);
  float hex = abs(sin(d.x * 18.0 + uTime) * sin(d.y * 18.0 - uTime * 0.7) * sin(d.z * 18.0));
  float ripple = 0.0;
  if (uHit.w < 1.0) {
    float ang = acos(clamp(dot(d, normalize(uHit.xyz)), -1.0, 1.0));
    ripple = smoothstep(0.25, 0.0, abs(ang - uHit.w * 2.6)) * (1.0 - uHit.w) * 2.0;
  }
  float a = (0.08 + f * 0.9 + hex * 0.08 + ripple) * uStrength;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCore;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float a = (mix(pow(1.0 - f, 1.6), f, uCore) * 0.9 + 0.1) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Additive fresnel glow material. */
export function glowMaterial(color, opacity = 1, core = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uCore: { value: core } },
    vertexShader: FRESNEL_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

const Y = new THREE.Vector3(0, 1, 0);

export class SpellVisuals {
  /**
   * @param {THREE.Object3D} root
   * @param {{uTime:{value:number}}} shared
   */
  constructor(root, shared) {
    this.root = root;
    this.shared = shared;
    this.transients = [];
    this.disposables = [];
    const keep = (x) => (this.disposables.push(x), x);

    // Shared geometries / materials.
    this.sphere = keep(new THREE.SphereGeometry(1, 24, 16));
    this.ring = keep(new THREE.RingGeometry(0.85, 1, 48));
    this.ring.rotateX(-Math.PI / 2);
    this.beamGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
    this.beamGeo.translate(0, 0.5, 0);
    this.beamGeo.rotateX(Math.PI / 2);
    this.iceMat = keep(new THREE.MeshPhysicalMaterial({ name: 'buz', color: 0xbfe8ff, roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x1a4a60, emissiveIntensity: 0.3 }));
    this.floeMat = keep(new THREE.MeshPhysicalMaterial({ name: 'buz tabakası', color: 0xd8f2ff, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0x204860, emissiveIntensity: 0.15 }));
    this.stoneMat = keep(new THREE.MeshStandardMaterial({ name: 'taşlaşma', color: 0x8c8a84, roughness: 0.95 }));
    this.charMat = keep(new THREE.MeshStandardMaterial({ name: 'kömür', color: 0x1a1512, roughness: 1, transparent: true, opacity: 0.55 }));

    // Protego bubble.
    this.shieldMat = keep(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x8fc8ff) }, uTime: shared.uTime, uStrength: { value: 0 }, uHit: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: FRESNEL_VERT,
      fragmentShader: SHIELD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }));
    this.shield = new THREE.Mesh(this.sphere, this.shieldMat);
    this.shield.visible = false;
    this.shield.renderOrder = 7;
    this.shield.name = 'Protego';
    root.add(this.shield);

    // Leviosa beam.
    this.beamMat = keep(glowMaterial(0xffe08a, 0.8));
    this.beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    this.beam.visible = false;
    this.beam.name = 'Leviosa ışını';
    root.add(this.beam);
  }

  // ------------------------------------------------------------ shield

  /**
   * @param {THREE.Vector3|null} center null hides
   * @param {number} radius
   * @param {number} strength 0..1
   */
  setShield(center, radius, strength) {
    this.shield.visible = !!center && strength > 0.01;
    if (!this.shield.visible) return;
    this.shield.position.copy(center);
    this.shield.scale.setScalar(radius);
    this.shieldMat.uniforms.uStrength.value = strength;
  }

  /** Ripple where the shield was struck (world direction from the centre). */
  shieldHit(dir) {
    const u = this.shieldMat.uniforms.uHit.value;
    u.set(dir.x, dir.y, dir.z, 0);
  }

  // -------------------------------------------------------------- beam

  setBeam(from, to, color) {
    this.beam.visible = !!from;
    if (!from) return;
    const len = from.distanceTo(to);
    this.beam.position.copy(from);
    this.beam.lookAt(to);
    this.beam.scale.set(0.025, 0.025, len);
    this.beamMat.uniforms.uColor.value.set(color);
  }

  // --------------------------------------------------------- transients

  _transient(mesh, life, fn) {
    this.root.add(mesh);
    this.transients.push({ mesh, life, t: 0, fn });
    return mesh;
  }

  /** Expanding fireball flash. */
  flash(pos, color, radius, life = 0.35) {
    const mat = glowMaterial(color, 1, 0.6);
    const m = new THREE.Mesh(this.sphere, mat);
    m.position.copy(pos);
    return this._transient(m, life, (k) => {
      m.scale.setScalar(radius * (0.3 + 0.7 * Math.sqrt(k)));
      mat.uniforms.uOpacity.value = (1 - k) * (1 - k);
    });
  }

  /** Flat shockwave ring on the ground / around a point. */
  shockwave(pos, color, radius, life = 0.5, normal = Y) {
    const mat = glowMaterial(color, 1, 1);
    const m = new THREE.Mesh(this.ring, mat);
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(Y, normal);
    return this._transient(m, life, (k) => {
      m.scale.setScalar(0.2 + radius * k);
      mat.uniforms.uOpacity.value = 1 - k;
    });
  }

  /** Sphere of light swelling around a target (heal, repair, finite). */
  aura(pos, color, radius, life = 0.9) {
    const mat = glowMaterial(color, 0.6, 0);
    const m = new THREE.Mesh(this.sphere, mat);
    m.position.copy(pos);
    return this._transient(m, life, (k) => {
      m.scale.setScalar(radius * (0.6 + 0.5 * k));
      mat.uniforms.uOpacity.value = Math.sin(k * Math.PI) * 0.6;
    });
  }

  // ----------------------------------------------------------------- ice

  /** Irregular ice floe (top at y = 0). */
  floeGeometry(radius, thickness, seed) {
    const shape = new THREE.Shape();
    const n = 14;
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = radius * (0.8 + rnd() * 0.3);
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 1 });
    g.rotateX(Math.PI / 2);
    return g;
  }

  // ------------------------------------------------------------- patronus

  /**
   * Glowing guardian animal (faces -Z, feet at y = 0).
   * @param {string} form
   * @returns {{group:THREE.Group, legs:THREE.Object3D[], material:THREE.ShaderMaterial, dispose:() => void}}
   */
  patronus(form, color) {
    const mat = glowMaterial(color, 1, 0.15);
    const group = new THREE.Group();
    group.name = `Patronus (${form})`;
    const geos = [];
    const part = (geo, x, y, z, sx = 1, sy = 1, sz = 1, parent = group) => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };
    const ell = () => new THREE.SphereGeometry(1, 16, 12);
    const legs = [];
    const leg = (x, z, len, r) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, len, z);
      group.add(pivot);
      const g = new THREE.CylinderGeometry(r * 0.7, r, len, 8);
      g.translate(0, -len / 2, 0);
      part(g, 0, 0, 0, 1, 1, 1, pivot);
      legs.push(pivot);
    };
    const body = { stag: [0.42, 0.36, 0.85, 1.05], horse: [0.45, 0.4, 0.95, 1.1], wolf: [0.3, 0.28, 0.7, 0.62], fox: [0.22, 0.2, 0.52, 0.42], hare: [0.2, 0.2, 0.34, 0.28], cat: [0.18, 0.17, 0.4, 0.3], otter: [0.17, 0.15, 0.55, 0.18], owl: [0.24, 0.3, 0.24, 0.35] }[form] ?? [0.3, 0.3, 0.7, 0.6];
    const [bw, bh, bl, legLen] = body;
    const y = legLen + bh * 0.6;
    if (form === 'owl') {
      part(ell(), 0, 0.45, 0, bw, bh * 1.4, bw);
      part(ell(), 0, 0.95, 0, bw * 0.8, bw * 0.75, bw * 0.8);
      for (const s of [-1, 1]) {
        const w = part(ell(), s * bw * 1.4, 0.55, 0, bw * 1.3, bh * 0.25, bw * 0.9);
        legs.push(w);
      }
      group.userData.flies = true;
    } else {
      part(ell(), 0, y, 0, bw, bh, bl);
      const neckUp = form === 'stag' || form === 'horse' ? 0.55 : 0.25;
      part(ell(), 0, y + neckUp * 0.6, -bl * 0.85, bw * 0.45, bh * 0.7, bl * 0.35);
      const head = part(ell(), 0, y + neckUp + bh * 0.2, -bl * 1.15, bw * 0.45, bh * 0.45, bl * 0.35);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(lx * bw * 0.55, lz * bl * 0.62, legLen, Math.max(0.03, bw * 0.16));
      if (form === 'stag') {
        for (const s of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.02, 0.035, 0.7, 5);
          g.rotateZ(s * 0.5);
          part(g, s * 0.2, head.position.y + 0.45, head.position.z + 0.05);
          const t = new THREE.CylinderGeometry(0.015, 0.025, 0.35, 5);
          t.rotateZ(-s * 0.3);
          part(t, s * 0.38, head.position.y + 0.7, head.position.z - 0.05);
        }
      } else if (form === 'hare' || form === 'fox' || form === 'wolf' || form === 'cat') {
        const ear = form === 'hare' ? 0.35 : 0.14;
        for (const s of [-1, 1]) part(new THREE.ConeGeometry(0.05, ear, 6), s * bw * 0.25, head.position.y + ear * 0.6, head.position.z);
      }
      if (form === 'fox' || form === 'wolf' || form === 'cat' || form === 'otter' || form === 'horse') {
        const tail = new THREE.CylinderGeometry(0.02, form === 'fox' ? 0.09 : 0.05, bl * 0.9, 6);
        tail.rotateX(-1.1);
        part(tail, 0, y + 0.05, bl * 1.2);
      }
    }
    group.scale.setScalar(1.2);
    group.traverse((o) => {
      if (o.isMesh) {
        o.renderOrder = 7;
        o.castShadow = false;
      }
    });
    return {
      group,
      legs,
      material: mat,
      dispose: () => {
        for (const g of geos) g.dispose();
        mat.dispose();
        group.removeFromParent();
      },
    };
  }

  /** @param {number} dt */
  update(dt) {
    const u = this.shieldMat.uniforms.uHit.value;
    if (u.w < 1) u.w = Math.min(1, u.w + dt * 2.2);
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.life);
      t.fn(k);
      if (k >= 1) {
        t.mesh.removeFromParent();
        t.mesh.material.dispose();
        this.transients.splice(i, 1);
      }
    }
  }

  clear() {
    for (const t of this.transients) {
      t.mesh.removeFromParent();
      t.mesh.material.dispose();
    }
    this.transients.length = 0;
    this.setShield(null, 1, 0);
    this.setBeam(null);
  }

  dispose() {
    this.clear();
    this.shield.removeFromParent();
    this.beam.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
