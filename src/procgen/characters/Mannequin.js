/**
 * @file Mannequin — stylised robed student figure built from procedural
 * primitives. It is the playable stand-in until the full humanoid generator
 * with skinned skeleton arrives in Phase 4; its rig exposes the same named
 * joints the procedural animator drives.
 *
 * Convention: feet at y = 0, facing -Z.
 */
import * as THREE from 'three';

/**
 * @typedef {Object} MannequinRig
 * @property {THREE.Group} root
 * @property {THREE.Group} body
 * @property {THREE.Mesh} robe
 * @property {THREE.Group} head
 * @property {{shoulder:THREE.Group, elbow:THREE.Group, hand:THREE.Group}} armL
 * @property {{shoulder:THREE.Group, elbow:THREE.Group, hand:THREE.Group}} armR
 * @property {THREE.Mesh} footL
 * @property {THREE.Mesh} footR
 * @property {THREE.Object3D} wandTip
 * @property {THREE.Material[]} materials
 * @property {{shoulderY:number, headY:number}} base
 */

export const MANNEQUIN_DEFAULTS = Object.freeze({
  robe: '#1c1e2b',
  robeLining: '#7a1f24',
  trim: '#c9a24a',
  skin: '#e2b596',
  hair: '#3b2618',
  scarfA: '#7a1f24',
  scarfB: '#c9a24a',
  boots: '#1a1512',
  wand: '#5a3a22',
});

/**
 * @param {Partial<typeof MANNEQUIN_DEFAULTS>} [colors]
 * @returns {MannequinRig}
 */
export function buildMannequin(colors = {}) {
  const c = { ...MANNEQUIN_DEFAULTS, ...colors };
  const std = (color, rough, metal = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const mRobe = std(c.robe, 0.88);
  const mLining = std(c.robeLining, 0.8, 0, { side: THREE.BackSide });
  const mTrim = std(c.trim, 0.35, 0.75);
  const mSkin = std(c.skin, 0.6);
  const mHair = std(c.hair, 0.75);
  const mScarfA = std(c.scarfA, 0.9);
  const mScarfB = std(c.scarfB, 0.9);
  const mBoots = std(c.boots, 0.55, 0.05);
  const mWand = std(c.wand, 0.5);
  const mEye = std('#1a1410', 0.25);
  const materials = [mRobe, mLining, mTrim, mSkin, mHair, mScarfA, mScarfB, mBoots, mWand, mEye];

  const shadow = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const root = new THREE.Group();
  root.name = 'Mannequin';
  const body = new THREE.Group();
  root.add(body);

  // --- Robe: lathe profile, slightly elliptical, open hem with lining.
  const profile = [
    [0.305, 0.06], [0.31, 0.1], [0.29, 0.35], [0.262, 0.62], [0.232, 0.9],
    [0.226, 1.08], [0.236, 1.24], [0.215, 1.35], [0.15, 1.43], [0.075, 1.47],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robeGeo = new THREE.LatheGeometry(profile, 36);
  robeGeo.scale(1, 1, 0.82);
  const robe = shadow(new THREE.Mesh(robeGeo, mRobe));
  robe.name = 'robe';
  body.add(robe);
  const lining = new THREE.Mesh(robeGeo, mLining);
  lining.scale.setScalar(0.985);
  robe.add(lining);

  const hem = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.306, 0.011, 8, 48), mTrim));
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.82, 1);
  hem.position.y = 0.075;
  robe.add(hem);

  // Front opening seam
  const seam = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.3, 0.012), mTrim));
  seam.position.set(0, 0.74, -0.225);
  seam.rotation.x = -0.075;
  robe.add(seam);

  // Belt
  const belt = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.014, 8, 40), mBoots));
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.82, 1);
  belt.position.y = 1.02;
  robe.add(belt);

  // --- Scarf: wrapped ring of alternating stripes + hanging tail.
  const scarf = new THREE.Group();
  scarf.position.y = 1.44;
  for (let i = 0; i < 4; i++) {
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.034, 8, 24, Math.PI / 2 + 0.05), i % 2 ? mScarfB : mScarfA));
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = (i * Math.PI) / 2;
    scarf.add(ring);
  }
  const tail = new THREE.Group();
  tail.position.set(0.06, -0.02, -0.1);
  tail.rotation.set(-0.12, 0, 0.08);
  for (let i = 0; i < 5; i++) {
    const seg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.022), i % 2 ? mScarfB : mScarfA));
    seg.position.y = -0.035 - i * 0.07;
    tail.add(seg);
  }
  scarf.add(tail);
  body.add(scarf);

  // --- Head
  const head = new THREE.Group();
  head.position.y = 1.47;
  body.add(head);
  const neck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12), mSkin));
  neck.position.y = 0.03;
  head.add(neck);
  const skull = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 18), mSkin));
  skull.scale.set(0.92, 1.06, 0.98);
  skull.position.y = 0.155;
  head.add(skull);
  const hair = shadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.121, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), mHair),
  );
  hair.scale.set(0.95, 1.02, 1.02);
  hair.position.set(0, 0.17, 0.012);
  hair.rotation.x = 0.28;
  head.add(hair);
  const fringe = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 8, Math.PI * 0.2, Math.PI * 0.6, 0, Math.PI * 0.32), mHair));
  fringe.position.set(0, 0.175, -0.004);
  fringe.rotation.y = Math.PI;
  head.add(fringe);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), mEye);
    eye.position.set(sx * 0.038, 0.16, -0.1);
    head.add(eye);
    const ear = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), mSkin));
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.105, 0.15, 0.005);
    head.add(ear);
  }
  const nose = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), mSkin));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.135, -0.112);
  head.add(nose);

  // --- Arms (shoulder → elbow → hand)
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 1.34, 0);
    shoulder.rotation.z = side * 0.09;
    const upper = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.3, 12), mRobe));
    upper.position.y = -0.15;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    const fore = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.088, 0.27, 12, 1, true), mRobe));
    fore.position.y = -0.135;
    elbow.add(fore);
    const cuffLining = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.086, 0.27, 12, 1, true), mLining);
    cuffLining.position.y = -0.135;
    elbow.add(cuffLining);
    const cuff = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.008, 6, 20), mTrim));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.27;
    elbow.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.3;
    elbow.add(hand);
    const palm = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 10), mSkin));
    palm.scale.set(0.85, 1.1, 0.7);
    hand.add(palm);
    body.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Wand in the right hand, pointing forward.
  const wand = new THREE.Group();
  wand.position.set(0, -0.02, -0.02);
  wand.rotation.x = -Math.PI / 2 + 0.25;
  const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0105, 0.34, 8), mWand));
  shaft.position.y = 0.14;
  wand.add(shaft);
  const handle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.09, 8), mBoots));
  handle.position.y = -0.02;
  wand.add(handle);
  const wandTip = new THREE.Object3D();
  wandTip.position.y = 0.31;
  wand.add(wandTip);
  armR.hand.add(wand);

  // --- Boots peeking out under the hem.
  const bootGeo = new THREE.CapsuleGeometry(0.05, 0.11, 4, 10);
  bootGeo.rotateX(Math.PI / 2);
  bootGeo.scale(1, 0.75, 1);
  const footL = shadow(new THREE.Mesh(bootGeo, mBoots));
  const footR = shadow(new THREE.Mesh(bootGeo, mBoots));
  footL.position.set(-0.095, 0.04, -0.02);
  footR.position.set(0.095, 0.04, -0.02);
  root.add(footL, footR);

  return {
    root,
    body,
    robe,
    head,
    armL,
    armR,
    footL,
    footR,
    wandTip,
    materials,
    base: { shoulderY: 1.34, headY: 1.47, scarfY: 1.44, scarf },
  };
}

/**
 * Fade the figure (camera very close). Uses dithered-free alpha blending.
 * @param {MannequinRig} rig
 * @param {number} opacity 0..1
 */
export function setMannequinOpacity(rig, opacity) {
  const transparent = opacity < 0.999;
  for (const m of rig.materials) {
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
    m.depthWrite = !transparent;
  }
  rig.root.visible = opacity > 0.02;
}

/** @param {MannequinRig} rig */
export function disposeMannequin(rig) {
  rig.root.traverse((o) => o.geometry?.dispose());
  for (const m of rig.materials) m.dispose();
  rig.root.removeFromParent();
}
