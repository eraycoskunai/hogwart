/**
 * @file EnemyModels — procedural creature models with procedural animation:
 * giant spiders (and the queen), the mountain troll, the werewolf, the
 * Solgun wraith, animated armour and pixies. Every builder returns
 * { root, update(dt, s), dispose() } where s = { speed, action, k (0..1
 * progress of the current action), dead, deadT, time }.
 */
import * as THREE from 'three';
import { armor as armorGeometry } from '../geometry/InteriorKit.js';

const TAU = Math.PI * 2;

/** Shared materials per colour (disposed with the cache). */
export class ModelCache {
  constructor() {
    this.mats = new Map();
    this.geos = new Map();
  }

  mat(color, o = {}) {
    const key = `${color}|${JSON.stringify(o)}`;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
    return this.mats.get(key);
  }

  glow(color) {
    return this.mat(color, { emissive: color, emissiveIntensity: 2.5, roughness: 0.4 });
  }

  sphere() {
    if (!this.geos.has('s')) this.geos.set('s', new THREE.SphereGeometry(1, 16, 12));
    return this.geos.get('s');
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    for (const g of this.geos.values()) g.dispose();
  }
}

function ell(cache, mat, rx, ry, rz, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(cache.sphere(), mat);
  m.scale.set(rx, ry, rz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent?.add(m);
  return m;
}

/** Limb segment along +Y from the pivot (cylinder translated). */
function limb(len, r0, r1, mat, own) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 8);
  g.translate(0, len / 2, 0);
  own.push(g);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ spider

/**
 * @param {ModelCache} cache
 * @param {{scale:number, color:string, eyes:string, queen?:boolean}} o
 */
export function spiderModel(cache, o) {
  const own = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = cache.mat(o.color, { roughness: 0.75, metalness: 0.1 });
  const hair = cache.mat(o.color, { roughness: 1 });
  const eye = cache.glow(o.eyes);
  body.position.y = 0.55;
  const head = ell(cache, skin, 0.3, 0.22, 0.34, 0, 0, -0.22, body);
  const abdomen = ell(cache, hair, 0.46, 0.38, 0.56, 0, 0.14, 0.52, body);
  if (o.queen) {
    ell(cache, cache.glow('#aa1010'), 0.12, 0.05, 0.22, 0, 0.5, 0.52, body);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(0.035, 0.22, 5);
      own.push(g);
      const c = new THREE.Mesh(g, skin);
      c.position.set((i - 2) * 0.07, 0.24, -0.16 - Math.abs(i - 2) * 0.03);
      c.rotation.x = -0.4;
      body.add(c);
    }
  }
  for (let i = 0; i < 8; i++) {
    const row = i < 4 ? 0 : 1;
    const x = ((i % 4) - 1.5) * 0.07;
    ell(cache, eye, 0.035 - row * 0.012, 0.035 - row * 0.012, 0.03, x, 0.08 - row * 0.05, -0.52 + row * 0.02, body);
  }
  const fangs = [];
  for (const s of [-1, 1]) {
    const g = new THREE.ConeGeometry(0.04, 0.22, 6);
    g.rotateX(Math.PI);
    own.push(g);
    const f = new THREE.Mesh(g, skin);
    f.position.set(s * 0.07, -0.12, -0.52);
    body.add(f);
    fangs.push(f);
  }
  const legs = [];
  const Lf = 0.55;
  const Lt = 0.85;
  [-0.95, -0.35, 0.3, 0.9].forEach((spread, idx) => {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.22, 0, -0.28 + idx * 0.12);
      hip.rotation.y = side > 0 ? -spread : Math.PI + spread;
      body.add(hip);
      const femurPivot = new THREE.Group();
      hip.add(femurPivot);
      const femur = limb(Lf, 0.05, 0.035, skin, own);
      femur.rotation.z = -Math.PI / 2;
      femurPivot.add(femur);
      const knee = new THREE.Group();
      knee.position.x = Lf;
      femurPivot.add(knee);
      const tibia = limb(Lt, 0.035, 0.012, hair, own);
      tibia.rotation.z = -Math.PI / 2;
      knee.add(tibia);
      legs.push({ femurPivot, knee, group: (idx + (side > 0 ? 1 : 0)) % 2, idx, hip, baseYaw: hip.rotation.y, side });
    }
  });
  root.scale.setScalar(o.scale);
  let phase = 0;
  return {
    root,
    head,
    abdomen,
    update(dt, s) {
      phase += dt * (1.5 + s.speed * 2.4 / o.scale);
      const moving = Math.min(1, s.speed / 2);
      body.position.y = 0.55 + Math.sin(phase * 2) * 0.02 * moving;
      let lean = 0;
      let raise = 0;
      if (s.action === 'windup') {
        lean = -0.3 * s.k;
        raise = s.k;
      } else if (s.action === 'strike') lean = 0.25;
      body.rotation.x = lean;
      for (const L of legs) {
        const sw = Math.sin(phase + L.group * Math.PI);
        L.hip.rotation.y = L.baseYaw + sw * 0.28 * moving;
        const lift = Math.max(0, Math.cos(phase + L.group * Math.PI)) * 0.35 * moving;
        let fem = 0.75 + lift;
        let kn = -1.95;
        if (L.idx === 0 && raise > 0) {
          fem += raise * 0.9;
          kn += raise * 0.6;
        }
        if (s.dead) {
          fem = 1.4;
          kn = -2.6;
        }
        L.femurPivot.rotation.z = fem;
        L.knee.rotation.z = kn;
      }
      for (const f of fangs) f.rotation.x = s.action === 'strike' ? 0.5 : Math.sin(s.time * 6) * 0.1;
      if (s.dead) {
        root.rotation.z = Math.min(Math.PI, s.deadT * 6);
        body.position.y = 0.3;
      }
    },
    dispose() {
      for (const g of own) g.dispose();
      root.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------- troll

export function trollModel(cache, o) {
  const own = [];
  const root = new THREE.Group();
  const skin = cache.mat(o.skin, { roughness: 0.95 });
  const cloth = cache.mat(o.cloth, { roughness: 1 });
  const wood = cache.mat('#5a4028', { roughness: 0.9 });
  const hips = new THREE.Group();
  hips.position.y = 1.25;
  root.add(hips);
  ell(cache, cloth, 0.75, 0.45, 0.55, 0, 0.05, 0, hips);
  const torso = new THREE.Group();
  torso.position.y = 0.3;
  hips.add(torso);
  ell(cache, skin, 0.9, 0.95, 0.7, 0, 0.8, 0, torso);
  ell(cache, skin, 0.55, 0.45, 0.45, 0, 1.25, -0.35, torso);
  const head = new THREE.Group();
  head.position.set(0, 1.65, -0.45);
  torso.add(head);
  ell(cache, skin, 0.32, 0.28, 0.34, 0, 0, 0, head);
  ell(cache, skin, 0.14, 0.1, 0.12, 0, -0.02, -0.3, head);
  ell(cache, cache.glow('#ffcc40'), 0.04, 0.03, 0.02, -0.11, 0.06, -0.3, head);
  ell(cache, cache.glow('#ffcc40'), 0.04, 0.03, 0.02, 0.11, 0.06, -0.3, head);
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.95, 1.25, 0);
    torso.add(shoulder);
    const upper = limb(1.0, 0.24, 0.2, skin, own);
    upper.rotation.x = Math.PI;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -1.0;
    shoulder.add(elbow);
    const fore = limb(0.95, 0.2, 0.17, skin, own);
    fore.rotation.x = Math.PI;
    elbow.add(fore);
    ell(cache, skin, 0.22, 0.2, 0.22, 0, -1.0, 0, elbow);
    if (s > 0) {
      const club = limb(1.8, 0.09, 0.26, wood, own);
      club.position.set(0, -1.05, 0);
      club.rotation.x = -Math.PI / 2;
      elbow.add(club);
    }
    arms.push({ shoulder, elbow, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.42, 0, 0);
    hips.add(hip);
    const leg = limb(1.25, 0.28, 0.24, skin, own);
    leg.rotation.x = Math.PI;
    hip.add(leg);
    ell(cache, skin, 0.3, 0.14, 0.42, 0, -1.25, -0.1, hip);
    legs.push(hip);
  }
  let phase = 0;
  return {
    root,
    update(dt, s) {
      phase += dt * (1 + s.speed * 1.3);
      const m = Math.min(1, s.speed / 1.5);
      legs[0].rotation.x = Math.sin(phase) * 0.45 * m;
      legs[1].rotation.x = -Math.sin(phase) * 0.45 * m;
      hips.position.y = 1.25 + Math.abs(Math.sin(phase)) * 0.06 * m;
      torso.rotation.x = 0.28 + Math.sin(phase * 2) * 0.03 * m;
      const [L, R] = arms;
      L.shoulder.rotation.x = -Math.sin(phase) * 0.4 * m;
      R.shoulder.rotation.x = Math.sin(phase) * 0.4 * m;
      R.shoulder.rotation.z = 0;
      if (s.action === 'slamWindup') {
        R.shoulder.rotation.x = -2.9 * s.k;
        L.shoulder.rotation.x = -2.4 * s.k;
        torso.rotation.x = 0.28 - 0.3 * s.k;
      } else if (s.action === 'slam') {
        R.shoulder.rotation.x = 0.6;
        L.shoulder.rotation.x = 0.4;
        torso.rotation.x = 0.7;
      } else if (s.action === 'sweepWindup') {
        R.shoulder.rotation.z = 1.4 * s.k;
        R.shoulder.rotation.x = -1.2 * s.k;
      } else if (s.action === 'sweep') {
        R.shoulder.rotation.z = -1.2;
        R.shoulder.rotation.x = -1.3;
      }
      R.elbow.rotation.x = -0.3;
      L.elbow.rotation.x = -0.3;
      if (s.dead) root.rotation.x = Math.min(1.45, s.deadT * 2.5);
      else root.rotation.x = s.stagger ? Math.sin(s.time * 3) * 0.1 : 0;
    },
    dispose() {
      for (const g of own) g.dispose();
      root.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------- werewolf

export function werewolfModel(cache, o) {
  const own = [];
  const root = new THREE.Group();
  const fur = cache.mat(o.fur, { roughness: 1 });
  const claw = cache.mat('#d8d0c0', { roughness: 0.4 });
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  hips.add(torso);
  ell(cache, fur, 0.36, 0.5, 0.3, 0, 0.45, 0, torso);
  ell(cache, fur, 0.42, 0.3, 0.36, 0, 0.8, -0.08, torso);
  const head = new THREE.Group();
  head.position.set(0, 1.05, -0.28);
  torso.add(head);
  ell(cache, fur, 0.2, 0.2, 0.22, 0, 0, 0, head);
  const snout = new THREE.ConeGeometry(0.1, 0.32, 8);
  snout.rotateX(-Math.PI / 2);
  own.push(snout);
  const sn = new THREE.Mesh(snout, fur);
  sn.position.set(0, -0.04, -0.3);
  head.add(sn);
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.06, 0.18, 5);
    own.push(ear);
    const e = new THREE.Mesh(ear, fur);
    e.position.set(s * 0.11, 0.2, 0.02);
    head.add(e);
    ell(cache, cache.glow(o.eyes), 0.03, 0.02, 0.02, s * 0.08, 0.05, -0.18, head);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.4, 0.85, -0.05);
    torso.add(sh);
    const up = limb(0.5, 0.1, 0.08, fur, own);
    up.rotation.x = Math.PI;
    sh.add(up);
    const el = new THREE.Group();
    el.position.y = -0.5;
    sh.add(el);
    const fo = limb(0.5, 0.08, 0.06, fur, own);
    fo.rotation.x = Math.PI;
    el.add(fo);
    for (let k = -1; k <= 1; k++) {
      const c = new THREE.ConeGeometry(0.015, 0.14, 4);
      c.rotateX(Math.PI);
      own.push(c);
      const cm = new THREE.Mesh(c, claw);
      cm.position.set(k * 0.03, -0.58, -0.02);
      el.add(cm);
    }
    arms.push({ sh, el });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.18, 0, 0);
    hips.add(hip);
    const th = limb(0.48, 0.13, 0.1, fur, own);
    th.rotation.x = Math.PI - 0.5;
    hip.add(th);
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, -0.23);
    hip.add(knee);
    const sh = limb(0.45, 0.08, 0.06, fur, own);
    sh.rotation.x = Math.PI + 0.7;
    knee.add(sh);
    legs.push({ hip, knee });
  }
  let phase = 0;
  return {
    root,
    update(dt, s) {
      phase += dt * (1.5 + s.speed * 1.4);
      const m = Math.min(1, s.speed / 3);
      torso.rotation.x = -0.35 - m * 0.35;
      legs[0].hip.rotation.x = Math.sin(phase) * 0.7 * m;
      legs[1].hip.rotation.x = -Math.sin(phase) * 0.7 * m;
      arms[0].sh.rotation.x = -Math.sin(phase) * 0.8 * m + 0.3;
      arms[1].sh.rotation.x = Math.sin(phase) * 0.8 * m + 0.3;
      hips.position.y = 1 + Math.abs(Math.sin(phase)) * 0.08 * m;
      if (s.action === 'leapWindup') {
        hips.position.y = 1 - 0.3 * s.k;
        torso.rotation.x = -0.9 * s.k;
      } else if (s.action === 'leap') {
        for (const a of arms) a.sh.rotation.x = 2.2;
      } else if (s.action === 'claw') {
        arms[0].sh.rotation.x = 1.6 * Math.sin(s.k * Math.PI);
        arms[1].sh.rotation.x = 1.6 * Math.sin(Math.min(1, s.k * 1.4) * Math.PI);
      }
      head.rotation.x = s.action === 'howl' ? -0.9 : 0.2;
      if (s.dead) root.rotation.x = -Math.min(1.5, s.deadT * 3);
    },
    dispose() {
      for (const g of own) g.dispose();
      root.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------ wraith

const WRAITH_VERT = /* glsl */ `
uniform float uTime;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position;
  float t = uTime;
  float low = clamp(1.0 - (p.y + 1.1) / 2.2, 0.0, 1.0);
  p.x += sin(t * 2.3 + p.y * 3.0 + p.z * 4.0) * 0.12 * low;
  p.z += cos(t * 1.9 + p.y * 2.5 + p.x * 4.0) * 0.12 * low;
  vY = low;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const WRAITH_FRAG = /* glsl */ `
uniform float uOpacity;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  vec3 col = mix(vec3(0.02, 0.02, 0.03), vec3(0.18, 0.2, 0.26), f);
  float a = (0.85 - vY * 0.55) * uOpacity;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function wraithModel(cache, time) {
  const own = [];
  const root = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uOpacity: { value: 1 } },
    vertexShader: WRAITH_VERT,
    fragmentShader: WRAITH_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cloak = new THREE.CylinderGeometry(0.28, 0.85, 2.2, 18, 8, true);
  own.push(cloak);
  const c = new THREE.Mesh(cloak, mat);
  c.position.y = 1.1;
  root.add(c);
  const hood = new THREE.SphereGeometry(0.34, 14, 10, 0, TAU, 0, Math.PI * 0.65);
  own.push(hood);
  const h = new THREE.Mesh(hood, mat);
  h.position.y = 2.2;
  h.rotation.x = 0.35;
  root.add(h);
  ell(cache, cache.mat('#000000', { roughness: 1 }), 0.2, 0.24, 0.12, 0, 2.12, -0.14, root);
  const bone = cache.mat('#9a948a', { roughness: 0.8 });
  const hands = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.32, 1.75, -0.1);
    root.add(arm);
    const f = limb(0.55, 0.03, 0.02, bone, own);
    f.rotation.x = Math.PI - 0.6;
    arm.add(f);
    hands.push(arm);
  }
  return {
    root,
    material: mat,
    update(dt, s) {
      root.position.y = Math.sin(s.time * 1.3) * 0.1;
      for (const [k, a] of hands.entries()) a.rotation.x = -0.4 - (s.action === 'drain' ? 0.9 : 0) + Math.sin(s.time * 2 + k) * 0.15;
      mat.uniforms.uOpacity.value = s.dead ? Math.max(0, 1 - s.deadT * 0.7) : 1;
    },
    dispose() {
      for (const g of own) g.dispose();
      mat.dispose();
      root.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------- armor

export function armorModel(cache) {
  const own = [];
  const root = new THREE.Group();
  const iron = cache.mat('#8a8e96', { metalness: 0.85, roughness: 0.35 });
  const bodyGeo = armorGeometry(false);
  own.push(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, iron);
  body.castShadow = true;
  const pivot = new THREE.Group();
  root.add(pivot);
  pivot.add(body);
  const arm = new THREE.Group();
  arm.position.set(0.3, 1.42, 0);
  pivot.add(arm);
  const blade = new THREE.BoxGeometry(0.06, 1.15, 0.02);
  blade.translate(0, -0.85, 0);
  const guard = new THREE.BoxGeometry(0.28, 0.04, 0.05);
  guard.translate(0, -0.25, 0);
  own.push(blade, guard);
  arm.add(new THREE.Mesh(blade, iron), new THREE.Mesh(guard, iron));
  const eyes = ell(cache, cache.glow('#60a0ff'), 0.05, 0.012, 0.01, 0, 1.76, -0.14, pivot);
  let phase = 0;
  return {
    root,
    update(dt, s) {
      phase += dt * (1 + s.speed * 2.5);
      const m = Math.min(1, s.speed / 1.2);
      pivot.position.y = Math.abs(Math.sin(phase)) * 0.05 * m;
      pivot.rotation.z = Math.sin(phase) * 0.05 * m;
      arm.rotation.x = -0.4 + Math.sin(phase) * 0.2 * m;
      arm.rotation.z = 0;
      if (s.action === 'slashWindup') {
        arm.rotation.x = -0.4 - 1.8 * s.k;
        arm.rotation.z = 0.9 * s.k;
      } else if (s.action === 'slash') {
        arm.rotation.x = -1.4;
        arm.rotation.z = -1.1;
      }
      eyes.visible = !s.dead;
      if (s.dead) {
        // Collapses into a heap.
        pivot.rotation.x = Math.min(1.5, s.deadT * 3);
        pivot.position.y = -Math.min(0.4, s.deadT * 0.8);
      }
    },
    dispose() {
      for (const g of own) g.dispose();
      root.removeFromParent();
    },
  };
}

// ------------------------------------------------------------------- pixie

export function pixieModel(cache) {
  const own = [];
  const root = new THREE.Group();
  const skin = cache.mat('#3a7aff', { emissive: '#1a3aa0', emissiveIntensity: 0.8, roughness: 0.5 });
  ell(cache, skin, 0.06, 0.1, 0.05, 0, 0, 0, root);
  ell(cache, skin, 0.06, 0.07, 0.06, 0, 0.14, 0, root);
  ell(cache, cache.glow('#ffffff'), 0.012, 0.012, 0.01, -0.025, 0.15, -0.05, root);
  ell(cache, cache.glow('#ffffff'), 0.012, 0.012, 0.01, 0.025, 0.15, -0.05, root);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const wingGeo = new THREE.PlaneGeometry(0.18, 0.12);
  wingGeo.translate(0.09, 0.02, 0);
  own.push(wingGeo);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.position.set(0, 0.06, 0.04);
    w.scale.x = s;
    root.add(w);
    wings.push(w);
  }
  return {
    root,
    update(dt, s) {
      const a = Math.sin(s.time * 60) * 0.9;
      wings[0].rotation.y = a;
      wings[1].rotation.y = -a;
      root.rotation.z = s.dead ? s.deadT * 8 : 0;
    },
    dispose() {
      for (const g of own) g.dispose();
      wingMat.dispose();
      root.removeFromParent();
    },
  };
}
