/**
 * @file CreatorStage — the 3D half of the character creator: a candle-lit
 * round dais in a dark tower room, the student being edited (own Character
 * instance with animator and face), a drag-to-orbit camera that frames the
 * whole body or the face, and preview poses / expressions.
 */
import * as THREE from 'three';
import { createStudioEnvironment } from '../render/Environment.js';
import { Character } from '../procgen/characters/Character.js';
import { Animator } from '../animation/Animator.js';
import { FaceAnimator } from '../animation/FaceAnimator.js';
import { flatGround } from '../animation/GroundProbe.js';

export const CREATOR = Object.freeze({
  fov: 32,
  /** Camera framings: distance, target height (fraction of body height), pitch. */
  framing: {
    body: { distance: 3.9, target: 0.52, pitch: 0.06 },
    face: { distance: 0.95, target: 0.93, pitch: 0.02 },
  },
  lerp: 5,
  dragYaw: 0.008,
  zoomStep: 0.0012,
  minZoom: 0.6,
  maxZoom: 1.5,
  dais: { radius: 1.6, height: 0.12 },
  /** Walk / run previews play in place at these speeds. */
  previewSpeed: { walk: 2, run: 4.6 },
  castEvery: 1.6,
  /** Horizontal shift of the view (fraction of the width) so the student sits between the panels. */
  screenShift: 0.035,
  daisTint: 0x8a8078,
  keyLight: 1.9,
  rebuildDelay: 0.14,
  talkLine: 'Merhaba! Hogwarts\'a hoş geldin.',
});

const _target = new THREE.Vector3();
/** Below this viewport width the panels stack and the view is not shifted. */
const CREATOR_WIDE = 900;

export class CreatorStage {
  /**
   * @param {{renderer:import('../render/Renderer.js').Renderer, library:import('../render/MaterialLibrary.js').MaterialLibrary, bus:any}} o
   */
  constructor(o) {
    this.o = o;
    this.active = false;
    this.framing = 'body';
    this.yaw = Math.PI;
    this.zoom = 1;
    this.preview = 'idle';
    this._rebuildTimer = -1;
    this._pending = null;
    this._castTimer = 0;
    this._t = 0;
  }

  /** @param {any} data initial character description */
  open(data) {
    const R = this.o.renderer;
    this.active = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0c12);
    scene.fog = new THREE.Fog(0x0e0c12, 6, 16);
    this.env = createStudioEnvironment(R.renderer);
    scene.environment = this.env;
    scene.environmentIntensity = 0.45;
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(CREATOR.fov, R.aspect, 0.03, 60);

    // Lights: warm key, cool rim, candle fill from below.
    const key = new THREE.DirectionalLight(0xffe2c0, CREATOR.keyLight);
    key.position.set(-2.2, 4.2, -3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -2;
    sc.right = sc.top = 2;
    sc.far = 12;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.6);
    rim.position.set(2.5, 3, 3);
    const fill = new THREE.PointLight(0xffb36b, 3, 6, 1.6);
    fill.position.set(0.8, 0.5, -1.4);
    scene.add(key, key.target, rim, fill, new THREE.HemisphereLight(0x8f9bbf, 0x2a2018, 0.35));
    this._lights = [key, rim, fill];

    // Dais.
    const lib = this.o.library;
    this._borrowed = [];
    const daisMat = lib.isLoaded('flagstone') ? lib.get('flagstone', { tile: 1.5, color: CREATOR.daisTint, _scope: 'creator' }) : new THREE.MeshStandardMaterial({ color: 0x5a5046, roughness: 0.8 });
    if (daisMat.userData.shared) this._borrowed.push(daisMat);
    const D = CREATOR.dais;
    const daisGeo = new THREE.CylinderGeometry(D.radius, D.radius * 1.04, D.height, 64);
    const dais = new THREE.Mesh(daisGeo, daisMat);
    dais.position.y = -D.height / 2;
    dais.receiveShadow = true;
    scene.add(dais);
    const floorGeo = new THREE.CircleGeometry(14, 48);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -D.height;
    floor.receiveShadow = true;
    scene.add(floor);
    this._owned = [daisGeo, floorGeo, floorMat];
    if (!daisMat.userData.shared) this._owned.push(daisMat);

    // Student.
    this.character = new Character({ library: lib, preset: R.preset, name: 'Creator' });
    this.character.build(data);
    scene.add(this.character.root);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this._ground = flatGround(0);
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._snap = true;

    // Orbit by dragging, zoom by wheel.
    const canvas = R.canvas;
    this._onDown = (e) => {
      this._drag = { x: e.clientX };
      canvas.setPointerCapture?.(e.pointerId);
    };
    this._onMove = (e) => {
      if (!this._drag) return;
      this.yaw -= (e.clientX - this._drag.x) * CREATOR.dragYaw;
      this._drag.x = e.clientX;
    };
    this._onUp = () => {
      this._drag = null;
    };
    this._onWheel = (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom + e.deltaY * CREATOR.zoomStep, CREATOR.minZoom, CREATOR.maxZoom);
    };
    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: true });
    this._unsubResize = this.o.bus.on('render:resize', ({ width, height }) => {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
  }

  /**
   * Queue a rebuild (debounced while sliders move).
   * @param {any} data
   * @param {boolean} [now]
   */
  setData(data, now = false) {
    this._pending = data;
    this._rebuildTimer = now ? 0 : CREATOR.rebuildDelay;
  }

  /** @param {'body'|'face'} f */
  setFraming(f) {
    this.framing = f;
  }

  /** @param {string} p idle | walk | run | cast | wave | shield | flight | sit */
  setPreview(p) {
    const A = this.animator;
    A.stopAll();
    this.preview = p;
    this._castTimer = 0;
    if (p === 'wave') A.play('wave');
    else if (p === 'shield') A.play('shield');
    else if (p === 'flight') A.play('flightHover', { loop: true });
    else if (p === 'dodge') A.play('dodgeRoll');
  }

  /** @param {string} e expression key or 'talk' */
  setExpression(e) {
    if (e === 'talk') {
      this.face.setExpression('smile');
      this.face.say(CREATOR.talkLine);
      return;
    }
    this.face.setExpression(e);
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.active) return;
    this._t += dt;
    if (this._rebuildTimer >= 0) {
      this._rebuildTimer -= dt;
      if (this._rebuildTimer < 0 && this._pending) {
        this.character.build(this._pending);
        this._pending = null;
        this.character.resetCloth();
      }
    }
    const P = CREATOR.previewSpeed;
    const speed = this.preview === 'walk' ? P.walk : this.preview === 'run' ? P.run : 0;
    if (this.preview === 'cast') {
      this._castTimer -= dt;
      if (this._castTimer <= 0) {
        this.animator.playRandomCast();
        this._castTimer = CREATOR.castEvery;
      }
    }
    const h = this.character.height;
    const F = CREATOR.framing[this.framing];
    _target.set(0, h * F.target, 0);
    this.face.update(dt);
    this.animator.update(dt, {
      speed, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: 0, accel: 0, climb: 0, sliding: false,
      lookTarget: this.camera.position, aimTarget: null, ground: this._ground,
    });
    this.character.update(dt, { camera: this.camera });

    // Camera orbit.
    const dist = F.distance * this.zoom * (h / 1.5);
    const cp = Math.cos(F.pitch);
    const goal = new THREE.Vector3(Math.sin(this.yaw) * cp * dist, _target.y + Math.sin(F.pitch) * dist, Math.cos(this.yaw) * cp * dist);
    const k = this._snap ? 1 : 1 - Math.exp(-CREATOR.lerp * dt);
    this._snap = false;
    this._camPos.lerp(goal, k);
    this._camTarget.lerp(_target, k);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);
  }

  render() {
    const r = this.o.renderer;
    r.renderer.toneMappingExposure = 1;
    const w = r.width;
    const h = r.height;
    if (window.innerWidth > CREATOR_WIDE) this.camera.setViewOffset(w, h, -w * CREATOR.screenShift, 0, w, h);
    else this.camera.clearViewOffset();
    r.render(this.scene, this.camera);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    const canvas = this.o.renderer.canvas;
    canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    canvas.removeEventListener('wheel', this._onWheel);
    this._unsubResize?.();
    this.character.dispose();
    for (const m of this._borrowed) this.o.library.release(m);
    for (const r of this._owned) r.dispose();
    for (const l of this._lights) l.shadow?.map?.dispose();
    this.env.dispose();
    this.scene = null;
  }
}
